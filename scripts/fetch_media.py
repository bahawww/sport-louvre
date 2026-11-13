#!/usr/bin/env python3
"""Fetch and cache league logos, club crests, and player portraits from Wikipedia API."""

from __future__ import annotations

import concurrent.futures
import csv
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path("/opt/sport-dashboard")
DATA_DIR = ROOT / "data" / "Football_Player_Market_Value_Trajectories"
MEDIA_DIR = ROOT / "frontend" / "public" / "media"
UA = "SportLouvreDashboard/1.0 (https://sport.louvre.my.id; contact@louvre.my.id)"

LEAGUE_TITLES = {
    "Premier League": "Premier League",
    "La Liga": "La Liga",
    "Bundesliga": "Bundesliga",
    "Serie A": "Serie A",
    "Ligue 1": "Ligue 1",
}

CLUB_TITLE_OVERRIDES = {
    "Bayern Munich": "FC Bayern Munich",
    "Inter Milan": "Inter Milan",
    "Paris Saint-Germain": "Paris Saint-Germain F.C.",
    "Manchester City": "Manchester City F.C.",
    "Manchester United": "Manchester United F.C.",
    "Liverpool FC": "Liverpool F.C.",
    "Chelsea FC": "Chelsea F.C.",
    "Arsenal FC": "Arsenal F.C.",
    "Tottenham Hotspur": "Tottenham Hotspur F.C.",
    "Newcastle United": "Newcastle United F.C.",
    "Real Madrid": "Real Madrid CF",
    "FC Barcelona": "FC Barcelona",
    "Atlético de Madrid": "Atlético Madrid",
    "Athletic Bilbao": "Athletic Bilbao",
    "Real Sociedad": "Real Sociedad",
    "Real Betis": "Real Betis",
    "Villarreal CF": "Villarreal CF",
    "Sevilla FC": "Sevilla FC",
    "Valencia CF": "Valencia CF",
    "Juventus FC": "Juventus F.C.",
    "AC Milan": "AC Milan",
    "SSC Napoli": "SSC Napoli",
    "AS Roma": "AS Roma",
    "SS Lazio": "SS Lazio",
    "Atalanta BC": "Atalanta BC",
    "ACF Fiorentina": "ACF Fiorentina",
    "Borussia Dortmund": "Borussia Dortmund",
    "Bayer 04 Leverkusen": "Bayer 04 Leverkusen",
    "RB Leipzig": "RB Leipzig",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "VfB Stuttgart": "VfB Stuttgart",
    "Olympique Marseille": "Olympique de Marseille",
    "Olympique Lyon": "Olympique Lyonnais",
    "AS Monaco": "AS Monaco FC",
    "LOSC Lille": "Lille OSC",
    "OGC Nice": "OGC Nice",
    "Stade Rennais FC": "Stade Rennais F.C.",
    "1.FC Köln": "1. FC Köln",
    "1.FC Union Berlin": "1. FC Union Berlin",
    "1.FSV Mainz 05": "1. FSV Mainz 05",
    "Como 1907": "Como 1907",
    "Bologna FC 1909": "Bologna FC 1909",
    "Cagliari Calcio": "Cagliari Calcio",
    "Celta de Vigo": "RC Celta de Vigo",
    "CA Osasuna": "CA Osasuna",
    "Deportivo Alavés": "Deportivo Alavés",
    "RCD Mallorca": "RCD Mallorca",
    "Levante UD": "Levante UD",
    "Ajax Amsterdam": "AFC Ajax",
}


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s or "item"


def wiki_get(params: dict[str, str]) -> dict:
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2.5 * (attempt + 1))
            else:
                raise
    raise RuntimeError("Wikimedia API 429 rate limited")


def batch_thumbnails(titles: list[str], thumb_size: int = 160) -> dict[str, str]:
    """Query Wikipedia pageimages in batches of 40."""
    results: dict[str, str] = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i : i + 40]
        try:
            data = wiki_get(
                {
                    "action": "query",
                    "prop": "pageimages",
                    "piprop": "thumbnail",
                    "pilicense": "any",
                    "pithumbsize": str(thumb_size),
                    "redirects": "1",
                    "format": "json",
                    "titles": "|".join(chunk),
                }
            )
        except Exception as exc:
            print(f"[warn] batch error: {exc}")
            continue

        query = data.get("query", {})
        norm_map = {n["from"]: n["to"] for n in query.get("normalized", [])}
        redir_map = {r["from"]: r["to"] for r in query.get("redirects", [])}
        pages = query.get("pages", {})
        title_to_thumb: dict[str, str] = {}
        for page in pages.values():
            t = page.get("title")
            src = page.get("thumbnail", {}).get("source")
            if t and src:
                title_to_thumb[t] = src

        for orig in chunk:
            cur = norm_map.get(orig, orig)
            cur = redir_map.get(cur, cur)
            if cur in title_to_thumb:
                results[orig] = title_to_thumb[cur]
        time.sleep(0.35)
    return results


def search_thumbnail(query_text: str, thumb_size: int = 160) -> str | None:
    """Fallback Wikipedia search + pageimage lookup."""
    try:
        data = wiki_get(
            {
                "action": "query",
                "list": "search",
                "srsearch": query_text,
                "srlimit": "3",
                "format": "json",
            }
        )
        hits = data.get("query", {}).get("search", [])
        if not hits:
            return None
        titles = [h["title"] for h in hits]
        found = batch_thumbnails(titles, thumb_size=thumb_size)
        for t in titles:
            if t in found:
                return found[t]
    except Exception:
        return None
    return None


def download_file(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 200:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as resp:
                content = resp.read()
                if len(content) > 200:
                    dest.write_bytes(content)
                    return True
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1.5 * (attempt + 1))
            else:
                break
        except Exception:
            time.sleep(0.5)
    return False


def ext_from_url(url: str, default: str = ".jpg") -> str:
    path = urllib.parse.urlparse(url).path.lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return default


def main() -> None:
    for sub in ("leagues", "clubs", "players"):
        (MEDIA_DIR / sub).mkdir(parents=True, exist_ok=True)

    # 1. Load players & real latest clubs from history
    latest_club: dict[str, tuple[tuple[int, int, int], str]] = {}
    with open(DATA_DIR / "transfermarkt_value_history.csv", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = row["player_id"].strip()
            club = row["club"].strip()
            if not pid or not club:
                continue
            try:
                d, m, y = row["valuation_date"].split("/")
                key = (int(y), int(m), int(d))
            except Exception:
                key = (0, 0, 0)
            if pid not in latest_club or key > latest_club[pid][0]:
                latest_club[pid] = (key, club)

    players: list[tuple[str, str]] = []
    player_clubs: dict[str, str] = {}
    all_clubs: set[str] = set()
    all_leagues: set[str] = set()

    with open(DATA_DIR / "transfermarkt_player_values.csv", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = row["player_id"].strip()
            name = row["name"].strip()
            league = row["league_name"].strip()
            real_club = latest_club.get(pid, ((0, 0, 0), ""))[1] or row["peak_club"].strip() or row["current_club"].strip()
            peak_club = row["peak_club"].strip()
            players.append((pid, name))
            if real_club:
                player_clubs[pid] = real_club
                all_clubs.add(real_club)
            if peak_club:
                all_clubs.add(peak_club)
            if league:
                all_leagues.add(league)

    print(f"Loaded {len(players)} players, {len(all_clubs)} clubs, {len(all_leagues)} leagues")

    # 2. Fetch Leagues
    league_manifest: dict[str, str] = {}
    league_urls = batch_thumbnails(list(LEAGUE_TITLES.values()), thumb_size=160)
    for league_name, title in LEAGUE_TITLES.items():
        url = league_urls.get(title) or search_thumbnail(f"{league_name} football league")
        if url:
            ext = ext_from_url(url, ".png")
            dest = MEDIA_DIR / "leagues" / f"{slugify(league_name)}{ext}"
            if download_file(url, dest):
                league_manifest[league_name] = f"/media/leagues/{dest.name}"
    print(f"Leagues resolved: {len(league_manifest)}/{len(LEAGUE_TITLES)}")

    # 3. Fetch Clubs
    club_manifest: dict[str, str] = {}
    club_list = sorted(all_clubs)
    club_queries = {c: CLUB_TITLE_OVERRIDES.get(c, c) for c in club_list}
    club_urls = batch_thumbnails(list(club_queries.values()), thumb_size=160)

    def resolve_club(club_name: str) -> tuple[str, str | None]:
        title = club_queries[club_name]
        url = club_urls.get(title)
        if not url:
            url = search_thumbnail(f"{club_name} football club")
        if not url:
            return club_name, None
        ext = ext_from_url(url, ".png")
        dest = MEDIA_DIR / "clubs" / f"{slugify(club_name)}{ext}"
        if download_file(url, dest):
            return club_name, f"/media/clubs/{dest.name}"
        return club_name, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for cname, path in pool.map(resolve_club, club_list):
            if path:
                club_manifest[cname] = path
    print(f"Clubs resolved: {len(club_manifest)}/{len(club_list)}")

    # 4. Fetch Players (batch first, then search fallback for missing)
    player_manifest: dict[str, str] = {}
    names = [name for _, name in players]
    player_urls = batch_thumbnails(names, thumb_size=160)

    def resolve_player(item: tuple[str, str]) -> tuple[str, str | None]:
        pid, name = item
        # Check if already cached on disk
        for ext in (".jpg", ".png", ".webp"):
            existing = MEDIA_DIR / "players" / f"{pid}{ext}"
            if existing.exists() and existing.stat().st_size > 200:
                return pid, f"/media/players/{existing.name}"

        url = player_urls.get(name)
        if not url:
            url = search_thumbnail(f"{name} footballer", thumb_size=160)
        if not url:
            return pid, None
        ext = ext_from_url(url, ".jpg")
        dest = MEDIA_DIR / "players" / f"{pid}{ext}"
        if download_file(url, dest):
            return pid, f"/media/players/{dest.name}"
        return pid, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for pid, path in pool.map(resolve_player, players):
            if path:
                player_manifest[pid] = path
    print(f"Players resolved: {len(player_manifest)}/{len(players)}")

    manifest = {
        "leagues": league_manifest,
        "clubs": club_manifest,
        "players": player_manifest,
        "playerClubs": player_clubs,
    }
    manifest_path = MEDIA_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
