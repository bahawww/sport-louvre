#!/usr/bin/env python3
"""Fast, parallel media sync for the expanded Transfermarkt dataset.

- Strictly matches player_id against salimt/football-datasets player_profiles.csv
- Skips players already cached as <pid>_tm.png
- Downloads missing portraits to players_raw/<pid>.jpg with 16 threads
- Runs rembg (u2net_human_seg) in python:3.11-slim Docker container on players_raw/*.jpg ONLY
- Deletes players_raw/ after conversion
- Resolves missing club crests via luukhopman/football-logos + salimt/football-datasets team_details.csv
- Updates frontend/public/media/manifest.json
"""

from __future__ import annotations

import concurrent.futures
import csv
import json
import re
import shutil
import subprocess
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path("/opt/sport-dashboard")
DATA_DIR = ROOT / "data" / "Football_Player_Market_Value_Trajectories"
MEDIA_DIR = ROOT / "frontend" / "public" / "media"
PLAYERS_DIR = MEDIA_DIR / "players"
CLUBS_DIR = MEDIA_DIR / "clubs"
LEAGUES_DIR = MEDIA_DIR / "leagues"
RAW_DIR = MEDIA_DIR / "players_raw"
MANIFEST_PATH = MEDIA_DIR / "manifest.json"

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

TM_PROFILES_URL = (
    "https://raw.githubusercontent.com/salimt/football-datasets/main/"
    "datalake/transfermarkt/player_profiles/player_profiles.csv"
)
TM_TEAMS_URL = (
    "https://raw.githubusercontent.com/salimt/football-datasets/main/"
    "datalake/transfermarkt/team_details/team_details.csv"
)
LOGOS_TREE_URL = "https://api.github.com/repos/luukhopman/football-logos/git/trees/master?recursive=1"


def norm(s: str) -> str:
    s = re.sub(r"\s*\(\d+\)\s*$", "", s.strip())
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(
        r"\b(fc|cf|sc|ac|as|ss|ssc|rcd|ud|ca|bc|afc|kv|gnk|1\.|sv|tsg|vfb|vfl|ogc|rc|sd|cd|us|calcio|olympique|stade)\b",
        "",
        s.lower(),
    )
    return re.sub(r"[^a-z0-9]+", "", s)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s or "item"


def parse_date(row: dict[str, str]) -> tuple[int, int, int]:
    raw = (row.get("valuation_date") or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return (dt.year, dt.month, dt.day)
        except ValueError:
            pass
    try:
        return (int(row.get("year") or 0), int(row.get("month") or 0), 0)
    except ValueError:
        return (0, 0, 0)


def download(url: str, dest: Path, timeout: int = 15) -> bool:
    if dest.exists() and dest.stat().st_size > 200:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if len(data) > 200:
                    dest.write_bytes(data)
                    return True
        except Exception:
            pass
    return False


def run_rembg_docker() -> None:
    raw_files = list(RAW_DIR.glob("*.jpg"))
    if not raw_files:
        print("No newly downloaded raw portraits to convert.")
        return

    print(f"Converting {len(raw_files)} raw portraits with rembg (u2net_human_seg) in Docker...")
    py_script = """
import pathlib
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from rembg import new_session, remove
import io

raw_dir = pathlib.Path("/media/players_raw")
out_dir = pathlib.Path("/media/players")
out_dir.mkdir(parents=True, exist_ok=True)

session = new_session("u2net_human_seg")
files = sorted(raw_dir.glob("*.jpg"))
print(f"Loaded u2net_human_seg; processing {len(files)} files...", flush=True)

ok = 0
fail = 0
for i, p in enumerate(files, 1):
    out_path = out_dir / f"{p.stem}_tm.png"
    if out_path.exists() and out_path.stat().st_size > 500:
        ok += 1
        continue
    try:
        data = p.read_bytes()
        out_bytes = remove(data, session=session)
        img = Image.open(io.BytesIO(out_bytes)).convert("RGBA")
        img.save(out_path, format="PNG", optimize=True)
        ok += 1
    except Exception:
        fail += 1
    if i % 100 == 0 or i == len(files):
        print(f"rembg progress: {i}/{len(files)} (ok={ok}, fail={fail})", flush=True)
"""
    worker_script = RAW_DIR / "_rembg_worker.py"
    worker_script.write_text(py_script, encoding="utf-8")
    cmd = [
        "docker",
        "run",
        "--rm",
        "--network",
        "host",
        "-v",
        f"{MEDIA_DIR}:/media",
        "python:3.11-slim",
        "bash",
        "-lc",
        "pip install --no-cache-dir -q 'rembg[cpu]' onnxruntime pillow && python3 /media/players_raw/_rembg_worker.py",
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    PLAYERS_DIR.mkdir(parents=True, exist_ok=True)
    CLUBS_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    manifest = (
        json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if MANIFEST_PATH.exists()
        else {"leagues": {}, "clubs": {}, "players": {}, "playerClubs": {}}
    )

    # 1. Load expanded players & clubs
    player_ids: list[str] = []
    peak_clubs: dict[str, str] = {}
    leagues_seen: set[str] = set()
    with open(DATA_DIR / "transfermarkt_player_values.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = (row.get("player_id") or "").strip()
            if not pid:
                continue
            player_ids.append(pid)
            pc = (row.get("peak_club") or "").strip()
            if pc:
                peak_clubs[pid] = pc
            lg = (row.get("league_name") or "").strip()
            if lg:
                leagues_seen.add(lg)

    latest_club_by_pid: dict[str, tuple[tuple[int, int, int], str]] = {}
    all_clubs: set[str] = set(peak_clubs.values())
    with open(DATA_DIR / "transfermarkt_value_history.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = (row.get("player_id") or "").strip()
            club = (row.get("club") or "").strip()
            if not pid or not club:
                continue
            dt = parse_date(row)
            prev = latest_club_by_pid.get(pid)
            if prev is None or dt >= prev[0]:
                latest_club_by_pid[pid] = (dt, club)

    player_clubs: dict[str, str] = {}
    for pid in player_ids:
        club = latest_club_by_pid.get(pid, (None, ""))[1] or peak_clubs.get(pid, "")
        if club:
            player_clubs[pid] = club
            all_clubs.add(club)

    print(f"Dataset: {len(player_ids)} players, {len(all_clubs)} clubs, {len(leagues_seen)} leagues")

    # 2. Identify missing player cutouts (skip any <pid>_tm.png already in players/)
    missing_pids = {
        pid
        for pid in player_ids
        if not (PLAYERS_DIR / f"{pid}_tm.png").exists()
    }
    print(f"Already cached _tm.png: {len(player_ids) - len(missing_pids)}; missing: {len(missing_pids)}")

    if missing_pids:
        print("Fetching salimt/football-datasets player_profiles.csv...")
        id_to_url: dict[str, str] = {}
        req = urllib.request.Request(TM_PROFILES_URL, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            lines = (line.decode("utf-8-sig", errors="replace") for line in resp)
            for row in csv.DictReader(lines):
                pid = (row.get("player_id") or "").strip()
                if pid in missing_pids:
                    img = (row.get("player_image_url") or "").strip()
                    if img and "default.jpg" not in img:
                        id_to_url[pid] = img

        print(f"Matched {len(id_to_url)}/{len(missing_pids)} missing player_ids in player_profiles.csv")

        def dl_player(item: tuple[str, str]) -> bool:
            pid, url = item
            return download(url, RAW_DIR / f"{pid}.jpg")

        ok = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            for success in pool.map(dl_player, id_to_url.items()):
                if success:
                    ok += 1
        print(f"Downloaded {ok}/{len(id_to_url)} raw portraits")

        run_rembg_docker()

    # Clean up players_raw/
    if RAW_DIR.exists():
        shutil.rmtree(RAW_DIR, ignore_errors=True)

    # Build manifest["players"]
    new_players: dict[str, str] = {}
    for pid in player_ids:
        tm_path = PLAYERS_DIR / f"{pid}_tm.png"
        cutout_path = PLAYERS_DIR / f"{pid}_cutout.png"
        if tm_path.exists() and tm_path.stat().st_size > 500:
            new_players[pid] = f"/media/players/{pid}_tm.png"
        elif cutout_path.exists() and cutout_path.stat().st_size > 500:
            new_players[pid] = f"/media/players/{pid}_cutout.png"

    # 3. Resolve clubs (skip clubs already cached in frontend/public/media/clubs/)
    existing_clubs_manifest: dict[str, str] = manifest.get("clubs", {})
    new_clubs: dict[str, str] = {}
    clubs_to_fetch: list[str] = []

    for club in sorted(all_clubs):
        cached_rel = existing_clubs_manifest.get(club)
        if cached_rel and (MEDIA_DIR.parent / cached_rel.lstrip("/")).exists():
            new_clubs[club] = cached_rel
            continue
        slug_path = CLUBS_DIR / f"{slugify(club)}.png"
        if slug_path.exists() and slug_path.stat().st_size > 200:
            new_clubs[club] = f"/media/clubs/{slug_path.name}"
            continue
        clubs_to_fetch.append(club)

    print(f"Clubs already cached: {len(new_clubs)}; need to resolve: {len(clubs_to_fetch)}")

    if clubs_to_fetch:
        # 3a. luukhopman/football-logos
        logo_index: dict[str, str] = {}
        try:
            req = urllib.request.Request(LOGOS_TREE_URL, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as resp:
                tree = json.loads(resp.read().decode("utf-8")).get("tree", [])
            for node in tree:
                path = node.get("path", "")
                if path.startswith("logos/") and path.endswith(".png"):
                    k = norm(Path(path).stem)
                    if k and k not in logo_index:
                        logo_index[k] = (
                            f"https://raw.githubusercontent.com/luukhopman/football-logos/master/{urllib.parse.quote(path)}"
                        )
        except Exception as e:
            print(f"Warning: football-logos fetch failed: {e}")

        # 3b. salimt/football-datasets team_details.csv
        tm_team_index: dict[str, str] = {}
        try:
            req = urllib.request.Request(TM_TEAMS_URL, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                lines = (line.decode("utf-8-sig", errors="replace") for line in resp)
                for row in csv.DictReader(lines):
                    cname = (row.get("club_name") or "").strip()
                    logo = (row.get("logo_url") or "").strip()
                    if cname and logo:
                        k = norm(cname)
                        if k and k not in tm_team_index:
                            tm_team_index[k] = logo
        except Exception as e:
            print(f"Warning: team_details.csv fetch failed: {e}")

        club_urls: list[tuple[str, str, Path]] = []
        for club in clubs_to_fetch:
            k = norm(club)
            url = logo_index.get(k) or tm_team_index.get(k)
            if url:
                club_urls.append((club, url, CLUBS_DIR / f"{slugify(club)}.png"))

        def dl_club(item: tuple[str, str, Path]) -> tuple[str, Path, bool]:
            club, url, dest = item
            return club, dest, download(url, dest)

        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            for club, dest, ok in pool.map(dl_club, club_urls):
                if ok:
                    new_clubs[club] = f"/media/clubs/{dest.name}"

    # 4. Verify leagues
    new_leagues = dict(manifest.get("leagues", {}))
    for lg in sorted(leagues_seen):
        if lg not in new_leagues:
            candidate = LEAGUES_DIR / f"{slugify(lg)}.png"
            if candidate.exists():
                new_leagues[lg] = f"/media/leagues/{candidate.name}"

    # 5. Save manifest.json
    updated_manifest = {
        "leagues": new_leagues,
        "clubs": dict(sorted(new_clubs.items())),
        "players": new_players,
        "playerClubs": player_clubs,
    }
    MANIFEST_PATH.write_text(
        json.dumps(updated_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"SYNC COMPLETE: players={len(new_players)}/{len(player_ids)}, "
        f"clubs={len(new_clubs)}/{len(all_clubs)}, "
        f"leagues={len(new_leagues)}/{len(leagues_seen)}, "
        f"playerClubs={len(player_clubs)}"
    )


if __name__ == "__main__":
    main()
