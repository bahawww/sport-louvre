"""Repair profile columns of the 508 legacy rows in transfermarkt_player_values.csv.

The legacy rows carry shifted columns: `position` holds a euro string ("€200.00m"),
`position_group` is always "Other" and `current_club` holds the nationality. This script
looks the players up in salimt/football-datasets `player_profiles.csv` (the same source
scripts/expand_dataset.py uses) and writes a sidecar `player_profile_patch.csv` next to the
dataset. The original CSV is left untouched; backend/ml_pipeline.py applies the sidecar on load.

Usage: python scripts/repair_legacy_profiles.py [--cache-dir /tmp/salimt]
"""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

import pandas as pd

URL = (
    "https://raw.githubusercontent.com/salimt/football-datasets/main/"
    "datalake/transfermarkt/player_profiles/player_profiles.csv"
)
DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "Football_Player_Market_Value_Trajectories"
POS_GROUP_MAP = {
    "Attack": "Forward",
    "Midfield": "Midfielder",
    "Defender": "Defender",
    "Goalkeeper": "Goalkeeper",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/salimt"))
    args = parser.parse_args()

    src = args.cache_dir / "player_profiles.csv"
    if not src.exists() or src.stat().st_size == 0:
        args.cache_dir.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {URL} -> {src}")
        urllib.request.urlretrieve(URL, src)

    players = pd.read_csv(DATA_DIR / "transfermarkt_player_values.csv", encoding="utf-8-sig")
    broken = players[players["position"].astype(str).str.startswith("€")]
    profiles = pd.read_csv(
        src, usecols=["player_id", "position", "main_position"], low_memory=False
    ).drop_duplicates("player_id")
    merged = broken[["player_id", "name"]].merge(profiles, on="player_id", how="left")

    pos_raw = merged["position"].fillna("").astype(str)
    merged["position"] = pos_raw.map(lambda s: s.split(" - ")[-1].strip() if s else "")
    merged["position_group"] = merged["main_position"].map(POS_GROUP_MAP).fillna("")
    patch = merged[(merged["position"] != "") & (merged["position_group"] != "")]
    out = DATA_DIR / "player_profile_patch.csv"
    patch[["player_id", "position", "position_group"]].to_csv(out, index=False, encoding="utf-8")
    print(f"broken rows: {len(broken)}, repaired: {len(patch)}, unresolved: {len(broken) - len(patch)}")
    print(patch["position_group"].value_counts().to_dict())
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
