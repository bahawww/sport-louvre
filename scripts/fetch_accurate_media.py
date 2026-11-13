#!/usr/bin/env python3
"""Fetch exact player_id Transfermarkt portraits + clean club crests from luukhopman/football-logos."""

from __future__ import annotations

import concurrent.futures
import csv
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path("/opt/sport-dashboard")
DATA_DIR = ROOT / "data" / "Football_Player_Market_Value_Trajectories"
MEDIA_DIR = ROOT / "frontend" / "public" / "media"
RAW_DIR = MEDIA_DIR / "players_raw"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

TM_PROFILES_URL = (
    "https://raw.githubusercontent.com/salimt/football-datasets/main/"
    "datalake/transfermarkt/player_profiles/player_profiles.csv"
)
LOGOS_TREE_URL = "https://api.github.com/repos/luukhopman/football-logos/git/trees/master?recursive=1"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"\b(fc|cf|sc|ac|as|ss|ssc|rcd|ud|ca|bc|afc|kv|gnk|1\.|sv|tsg|vfb|vfl)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", "", s)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s or "item"


def download(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 200:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = r.read()
                if len(data) > 200:
                    dest.write_bytes(data)
                    return True
        except Exception:
            pass
    return False


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = MEDIA_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # 1. Load our 508 player_ids
    with open(DATA_DIR / "transfermarkt_player_values.csv", encoding="utf-8-sig") as f:
        our_ids = [r["player_id"].strip() for r in csv.DictReader(f)]
    our_id_set = set(our_ids)

    # 2. Match strictly by player_id from salimt/football-datasets
    print("Fetching Transfermarkt player_profiles.csv...")
    id_to_url: dict[str, str] = {}
    req = urllib.request.Request(TM_PROFILES_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        lines = (line.decode("utf-8-sig", errors="replace") for line in resp)
        for row in csv.DictReader(lines):
            pid = (row.get("player_id") or "").strip()
            if pid in our_id_set:
                img = (row.get("player_image_url") or "").strip()
                if img:
                    id_to_url[pid] = img

    print(f"Matched {len(id_to_url)}/{len(our_ids)} exact player_id portraits")

    # Download all raw portraits concurrently
    def dl_player(item: tuple[str, str]) -> tuple[str, bool]:
        pid, url = item
        return pid, download(url, RAW_DIR / f"{pid}.jpg")

    ok = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for pid, success in pool.map(dl_player, id_to_url.items()):
            if success:
                ok += 1
    print(f"Downloaded {ok}/{len(id_to_url)} exact Transfermarkt portraits")

    # 3. Clean out old inaccurate Wikipedia player mappings from manifest
    # Keep only exact TM portraits (to be cutout next) or existing TheSportsDB *_cutout.png for the 16 missing
    new_players: dict[str, str] = {}
    for pid in our_ids:
        if (RAW_DIR / f"{pid}.jpg").exists():
            new_players[pid] = f"/media/players/{pid}_tm.png"
        elif (MEDIA_DIR / "players" / f"{pid}_cutout.png").exists():
            new_players[pid] = f"/media/players/{pid}_cutout.png"
    manifest["players"] = new_players

    # 4. Fill clean transparent club logos from luukhopman/football-logos for all clubs
    print("Fetching luukhopman/football-logos tree...")
    req = urllib.request.Request(LOGOS_TREE_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        tree = json.loads(resp.read().decode("utf-8")).get("tree", [])

    logo_index: dict[str, str] = {}
    for node in tree:
        path = node.get("path", "")
        if path.startswith("logos/") and path.endswith(".png"):
            fname = Path(path).stem
            k = norm(fname)
            if k and k not in logo_index:
                logo_index[k] = f"https://raw.githubusercontent.com/luukhopman/football-logos/master/{urllib.parse.quote(path)}"

    filled = 0
    for club_name in list(manifest["clubs"].keys()):
        k = norm(club_name)
        if k in logo_index:
            dest = MEDIA_DIR / "clubs" / f"{slugify(club_name)}.png"
            if download(logo_index[k], dest):
                manifest["clubs"][club_name] = f"/media/clubs/{dest.name}"
                filled += 1
    print(f"Updated/verified {filled}/{len(manifest['clubs'])} clubs from football-logos")

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Saved manifest.json")


if __name__ == "__main__":
    main()
