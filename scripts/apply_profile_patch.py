"""Write the legacy-row repairs into transfermarkt_player_values.csv and .parquet.

The 508 legacy rows (listed in player_profile_patch.csv) arrived with shifted columns:
`position` held a euro string, `position_group` was "Other", `current_club` held the
nationality and `age` was missing or wrong for about a quarter of them. This script fixes
those four columns in place and touches nothing else:

- position, position_group: from player_profile_patch.csv
- current_club: club of the player's latest valuation in transfermarkt_value_history.csv
- age: age at the latest valuation, only where the CSV value is missing or off by more than a year

The untouched original is kept in data/backup_508/. Safe to run twice.

Usage: python scripts/apply_profile_patch.py   (needs pandas; pyarrow for the parquet file)
"""

from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "Football_Player_Market_Value_Trajectories"
CSV_PATH = DATA_DIR / "transfermarkt_player_values.csv"
PARQUET_PATH = DATA_DIR / "transfermarkt_player_values.parquet"


def load_fixes() -> dict[str, dict[str, object]]:
    patch = pd.read_csv(DATA_DIR / "player_profile_patch.csv", dtype=str).set_index("player_id")
    hist = pd.read_csv(DATA_DIR / "transfermarkt_value_history.csv", encoding="utf-8-sig")
    hist["player_id"] = hist["player_id"].astype(str)
    hist["_dt"] = pd.to_datetime(hist["valuation_date"], format="%d/%m/%Y", errors="coerce")
    last = hist[hist["_dt"].notna()].sort_values("_dt", kind="mergesort").groupby("player_id").last()
    return {
        pid: {
            "position": row["position"],
            "position_group": row["position_group"],
            "current_club": str(last.at[pid, "club"]),
            "age": float(last.at[pid, "age_at_date"]),
        }
        for pid, row in patch.iterrows()
    }


def age_needs_fix(value: object, history_age: float) -> bool:
    try:
        return abs(float(value) - history_age) > 1  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return True


def fix_csv(fixes: dict[str, dict[str, object]]) -> int:
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = reader.fieldnames or []
        rows = list(reader)
    changed = 0
    for row in rows:
        fix = fixes.get(row["player_id"])
        if fix is None:
            continue
        before = dict(row)
        row["position"] = str(fix["position"])
        row["position_group"] = str(fix["position_group"])
        row["current_club"] = str(fix["current_club"])
        if row["age"] == "" or age_needs_fix(row["age"], float(fix["age"])):  # type: ignore[arg-type]
            row["age"] = str(fix["age"])
        changed += row != before
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return changed


def fix_parquet(fixes: dict[str, dict[str, object]]) -> int:
    df = pd.read_parquet(PARQUET_PATH)
    ids = df["player_id"].astype(str)
    hit = ids.isin(fixes.keys())
    before = df.loc[hit, ["position", "position_group", "current_club", "age"]].copy()
    for col in ("position", "position_group", "current_club"):
        df.loc[hit, col] = ids[hit].map(lambda p, c=col: fixes[p][c])
    history_age = ids[hit].map(lambda p: fixes[p]["age"]).astype(float)
    bad_age = df.loc[hit, "age"].isna() | ((df.loc[hit, "age"].astype(float) - history_age).abs() > 1)
    df.loc[bad_age[bad_age].index, "age"] = history_age[bad_age]
    after = df.loc[hit, ["position", "position_group", "current_club", "age"]]
    df.to_parquet(PARQUET_PATH, index=False)
    return int((before.astype(str) != after.astype(str)).any(axis=1).sum())


def main() -> None:
    fixes = load_fixes()
    print(f"legacy rows in sidecar: {len(fixes)}")
    print(f"csv rows changed: {fix_csv(fixes)}")
    try:
        print(f"parquet rows changed: {fix_parquet(fixes)}")
    except ImportError as exc:
        print(f"parquet skipped: {exc}")


if __name__ == "__main__":
    main()
