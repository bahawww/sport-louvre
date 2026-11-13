#!/usr/bin/env python3
"""Fetch FM/EAFC-style transparent PNG cutouts & crests from TheSportsDB (key 123), keeping Wikipedia fallbacks."""

from __future__ import annotations

import csv
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path("/opt/sport-dashboard")
DATA_DIR = ROOT / "data" / "Football_Player_Market_Value_Trajectories"
MEDIA_DIR = ROOT / "frontend" / "public" / "media"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

TSDB_LEAGUES = {
    "Premier League": ("4328", "English Premier League"),
    "La Liga": ("4335", "Spanish La Liga"),
    "Bundesliga": ("4331", "German Bundesliga"),
    "Serie A": ("4332", "Italian Serie A"),
    "Ligue 1": ("4334", "French Ligue 1"),
}

CLUB_SEARCH_OVERRIDES = {
    "Bayern Munich": "Bayern Munich",
    "Inter Milan": "Inter Milan",
    "Paris Saint-Germain": "Paris SG",
    "Atlético de Madrid": "Atletico Madrid",
    "1.FC Köln": "FC Koln",
    "1.FC Union Berlin": "Union Berlin",
    "1.FSV Mainz 05": "Mainz",
    "Bologna FC 1909": "Bologna",
    "Como 1907": "Como",
    "Celta de Vigo": "Celta Vigo",
    "Deportivo Alavés": "Alaves",
    "RCD Mallorca": "Mallorca",
    "Levante UD": "Levante",
    "Ajax Amsterdam": "Ajax",
    "Fenerbahce": "Fenerbahce",
    "Olympique Marseille": "Marseille",
    "Olympique Lyon": "Lyon",
    "LOSC Lille": "Lille",
    "Stade Rennais FC": "Rennes",
    "Borussia Mönchengladbach": "Borussia Monchengladbach",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "ACF Fiorentina": "Fiorentina",
    "Atalanta BC": "Atalanta",
    "SSC Napoli": "Napoli",
    "SS Lazio": "Lazio",
    "AS Roma": "Roma",
    "Juventus FC": "Juventus",
    "CA Osasuna": "Osasuna",
    "Girona FC": "Girona",
    "Elche CF": "Elche",
    "Club Brugge KV": "Club Brugge",
    "GNK Dinamo Zagreb": "Dinamo Zagreb",
    "Feyenoord Rotterdam": "Feyenoord",
    "FC Schalke 04": "Schalke 04",
    "CA River Plate": "River Plate",
    "CA Colón": "Colon",
    "Córdoba CF": "Cordoba",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"\b(fc|cf|sc|ac|as|ss|ssc|rcd|ud|ca|bc|afc|kv|gnk|1\.)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", "", s)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return s or "item"


def tsdb_get(endpoint: str) -> dict:
    url = f"https://www.thesportsdb.com/api/v1/json/123/{endpoint}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3.0 * (attempt + 1))
            else:
                return {}
        except Exception:
            time.sleep(0.8)
    return {}


def download_png(url: str, dest: Path) -> bool:
    if not url:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
                if len(data) > 200:
                    dest.write_bytes(data)
                    return True
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2.0 * (attempt + 1))
            else:
                break
        except Exception:
            time.sleep(0.5)
    return False


def main() -> None:
    manifest_path = MEDIA_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # 1. Leagues -> clean transparent PNG badges
    for league_name, (lid, tsdb_name) in TSDB_LEAGUES.items():
        data = tsdb_get(f"lookupleague.php?id={lid}")
        leagues = data.get("leagues") or []
        badge = leagues[0].get("strBadge") if leagues else None
        if badge:
            dest = MEDIA_DIR / "leagues" / f"{slugify(league_name)}.png"
            if download_png(badge, dest):
                manifest["leagues"][league_name] = f"/media/leagues/{dest.name}"
        time.sleep(0.25)
    print(f"Clean league badges: {len(manifest['leagues'])}/5")

    # 2. Preload all teams from the 5 top leagues (5 requests -> ~96 teams)
    team_index: dict[str, str] = {}
    for _, (_, tsdb_league) in TSDB_LEAGUES.items():
        data = tsdb_get("search_all_teams.php?l=" + urllib.parse.quote(tsdb_league))
        for t in data.get("teams") or []:
            badge = t.get("strBadge")
            if not badge:
                continue
            for candidate in [t.get("strTeam", ""), t.get("strTeamShort", ""), t.get("strTeamAlternate", "")]:
                for part in candidate.split(","):
                    k = norm(part.strip())
                    if k:
                        team_index[k] = badge
        time.sleep(0.3)

    # Match all clubs in manifest
    clean_clubs = 0
    for club_name in list(manifest["clubs"].keys()):
        dest = MEDIA_DIR / "clubs" / f"{slugify(club_name)}.png"
        badge = team_index.get(norm(club_name))
        if not badge:
            q = CLUB_SEARCH_OVERRIDES.get(club_name, club_name)
            badge = team_index.get(norm(q))
        if not badge:
            data = tsdb_get("searchteams.php?t=" + urllib.parse.quote(CLUB_SEARCH_OVERRIDES.get(club_name, club_name)))
            teams = data.get("teams") or []
            soccer = next((x for x in teams if x.get("strSport") == "Soccer"), teams[0] if teams else None)
            if soccer:
                badge = soccer.get("strBadge")
            time.sleep(0.35)
        if badge and download_png(badge, dest):
            manifest["clubs"][club_name] = f"/media/clubs/{dest.name}"
            clean_clubs += 1
    print(f"Clean club badges from TheSportsDB: {clean_clubs}/{len(manifest['clubs'])}")

    # 3. Players -> fetch strCutout (transparent PNG FM/EAFC style)
    players: list[tuple[str, str]] = []
    with open(DATA_DIR / "transfermarkt_player_values.csv", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            players.append((row["player_id"].strip(), row["name"].strip()))

    cutout_count = 0
    for idx, (pid, name) in enumerate(players, 1):
        dest = MEDIA_DIR / "players" / f"{pid}_cutout.png"
        if dest.exists() and dest.stat().st_size > 200:
            manifest["players"][pid] = f"/media/players/{dest.name}"
            cutout_count += 1
            continue

        data = tsdb_get("searchplayers.php?p=" + urllib.parse.quote(name))
        plist = data.get("player") or []
        soccer = [p for p in plist if p.get("strSport") == "Soccer"]
        cand = next((p for p in soccer if p.get("strCutout")), None)
        if cand and cand.get("strCutout"):
            # Use /preview or full cutout PNG
            if download_png(cand["strCutout"], dest):
                manifest["players"][pid] = f"/media/players/{dest.name}"
                cutout_count += 1
        if idx % 50 == 0:
            print(f"Processed {idx}/{len(players)} players (cutouts: {cutout_count})...")
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        time.sleep(0.35)

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done! Clean player cutouts: {cutout_count}/{len(players)}, total players with image: {len(manifest['players'])}")


if __name__ == "__main__":
    main()
