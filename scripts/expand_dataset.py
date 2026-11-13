"""Expand the Transfermarkt player market value dataset to ~2,400+ Top-5 league players.

Fetches salimt/football-datasets CSVs, filters active Top-5 European league players
(GB1, ES1, IT1, L1, FR1) with latest valuation >= 2024-01-01 and >= 3 valuation points,
computes all 36 player summary columns and 8 history columns matching the existing 508
schema, and merges with /opt/sport-dashboard/data/backup_508/ (keeping existing 508
rows on overlapping player_id).
"""

from __future__ import annotations

import argparse
import re
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

BASE_URL = "https://raw.githubusercontent.com/salimt/football-datasets/main/datalake/transfermarkt"
REMOTE_FILES = {
    "team_details.csv": f"{BASE_URL}/team_details/team_details.csv",
    "player_profiles.csv": f"{BASE_URL}/player_profiles/player_profiles.csv",
    "player_market_value.csv": f"{BASE_URL}/player_market_value/player_market_value.csv",
    "player_latest_market_value.csv": f"{BASE_URL}/player_latest_market_value/player_latest_market_value.csv",
}

TOP5_LEAGUE_MAP = {
    "GB1": "Premier League",
    "ES1": "La Liga",
    "IT1": "Serie A",
    "L1": "Bundesliga",
    "FR1": "Ligue 1",
}

POS_GROUP_MAP = {
    "Attack": "Forward",
    "Midfield": "Midfielder",
    "Defender": "Defender",
    "Goalkeeper": "Goalkeeper",
}

BACKUP_DIR = Path("/opt/sport-dashboard/data/backup_508")
OUT_DIR = Path("/opt/sport-dashboard/data/Football_Player_Market_Value_Trajectories")


def _strip_id_suffix(val: object) -> str:
    if pd.isna(val):
        return ""
    return re.sub(r"\s*\(\d+\)\s*$", "", str(val)).strip()


def _format_value_display(val_eur: float) -> str:
    if val_eur >= 1_000_000:
        return f"€{val_eur / 1_000_000:.2f}m"
    return f"€{int(round(val_eur / 1_000))}k"


def _value_tier(val_eur: float) -> str:
    if val_eur >= 100_000_000:
        return "World Class (100M+)"
    if val_eur >= 50_000_000:
        return "Elite (50-100M)"
    if val_eur >= 20_000_000:
        return "Top (20-50M)"
    if val_eur >= 5_000_000:
        return "Regular (5-20M)"
    return "Developing (<5M)"


def _classify_trajectory(is_at_peak: int, post_peak_decline_pct: float) -> str:
    if is_at_peak == 1:
        return "rising_star"
    if post_peak_decline_pct < 20.0:
        return "growing"
    if post_peak_decline_pct < 30.0:
        return "stable"
    if post_peak_decline_pct < 60.0:
        return "declining"
    return "falling_sharply"


def _download_if_needed(cache_dir: Path, force: bool = False) -> dict[str, Path]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for fname, url in REMOTE_FILES.items():
        dest = cache_dir / fname
        if force or not dest.exists() or dest.stat().st_size == 0:
            print(f"Downloading {url} -> {dest}")
            urllib.request.urlretrieve(url, dest)
        paths[fname] = dest
    return paths


def build_expanded_dataset(cache_dir: Path, force_download: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    paths = _download_if_needed(cache_dir, force=force_download)

    old_players = pd.read_csv(BACKUP_DIR / "transfermarkt_player_values.csv", encoding="utf-8-sig")
    old_history = pd.read_csv(BACKUP_DIR / "transfermarkt_value_history.csv", encoding="utf-8-sig")
    existing_pids = set(old_players["player_id"].astype(int))

    td = pd.read_csv(paths["team_details.csv"], low_memory=False)
    pp = pd.read_csv(paths["player_profiles.csv"], low_memory=False)
    plv = pd.read_csv(paths["player_latest_market_value.csv"], low_memory=False)
    pmv = pd.read_csv(paths["player_market_value.csv"], low_memory=False)

    # 1. Top 5 European leagues
    td5 = td[td["competition_id"].isin(TOP5_LEAGUE_MAP.keys())].drop_duplicates("club_id").copy()
    td5["league_name"] = td5["competition_id"].map(TOP5_LEAGUE_MAP)
    td5["club_clean"] = td5["club_name"].map(_strip_id_suffix)
    club_meta = td5.set_index("club_id")[["club_clean", "league_name"]].to_dict("index")

    # 2. Active players in Top 5 leagues with latest valuation >= 2024-01-01
    pp5 = pp[pp["current_club_id"].isin(club_meta.keys())].copy()
    pp5["player_id"] = pp5["player_id"].astype(int)
    pp5 = pp5[~pp5["player_id"].isin(existing_pids)].copy()

    plv["player_id"] = pd.to_numeric(plv["player_id"], errors="coerce")
    plv = plv.dropna(subset=["player_id", "date_unix", "value"]).copy()
    plv["player_id"] = plv["player_id"].astype(int)
    plv = plv[(plv["date_unix"] >= "2024-01-01") & (plv["value"] > 0)].copy()

    pp_active = pp5.merge(plv[["player_id", "date_unix", "value"]], on="player_id", how="inner")
    candidate_pids = set(pp_active["player_id"])

    # 3. Historical valuations
    pmv["player_id"] = pd.to_numeric(pmv["player_id"], errors="coerce")
    pmv = pmv.dropna(subset=["player_id", "date_unix", "value"]).copy()
    pmv["player_id"] = pmv["player_id"].astype(int)
    pmv = pmv[(pmv["player_id"].isin(candidate_pids)) & (pmv["value"] > 0)].copy()

    # Ensure latest valuation point is in history if not already present
    latest_pts = pp_active[["player_id", "date_unix", "value"]].copy()
    pmv_all = pd.concat([pmv[["player_id", "date_unix", "value"]], latest_pts], ignore_index=True)
    pmv_all = pmv_all.drop_duplicates(subset=["player_id", "date_unix"], keep="last")
    pmv_all["dt"] = pd.to_datetime(pmv_all["date_unix"], errors="coerce")
    pmv_all = pmv_all.dropna(subset=["dt"]).sort_values(["player_id", "dt"])

    counts = pmv_all.groupby("player_id").size()
    valid_pids = set(counts[counts >= 3].index)
    pp_valid = pp_active[pp_active["player_id"].isin(valid_pids)].drop_duplicates("player_id").copy()
    pmv_valid = pmv_all[pmv_all["player_id"].isin(valid_pids)].copy()

    pp_valid["dob_dt"] = pd.to_datetime(pp_valid["date_of_birth"], errors="coerce")
    pp_valid = pp_valid.dropna(subset=["dob_dt"]).copy()
    valid_pids = set(pp_valid["player_id"])
    pmv_valid = pmv_valid[pmv_valid["player_id"].isin(valid_pids)].copy()

    profile_map = pp_valid.set_index("player_id").to_dict("index")
    today_str = date.today().isoformat()

    new_player_rows: list[dict] = []
    new_history_rows: list[dict] = []

    for pid, grp in pmv_valid.groupby("player_id", sort=False):
        grp = grp.sort_values("dt").reset_index(drop=True)
        prof = profile_map[pid]
        dob: pd.Timestamp = prof["dob_dt"]
        cmeta = club_meta[int(prof["current_club_id"])]
        club_name = cmeta["club_clean"] or _strip_id_suffix(prof.get("current_club_name", ""))
        league_name = cmeta["league_name"]

        vals = grp["value"].to_numpy(dtype=float)
        dts = grp["dt"].tolist()

        first_val = float(vals[0])
        last_val = float(vals[-1])
        peak_idx = int(np.argmax(vals))  # first occurrence of peak value
        peak_val = float(vals[peak_idx])

        first_dt = dts[0]
        last_dt = dts[-1]
        peak_dt = dts[peak_idx]

        career_span_years = round(max((last_dt - first_dt).days / 365.25, 0.01), 2)
        years_to_peak = round(max((peak_dt - first_dt).days / 365.25, 0.0), 2)

        age = int((last_dt - dob).days // 365.25)
        age_at_peak = int((peak_dt - dob).days // 365.25)

        value_cagr = round((last_val / first_val) ** (1.0 / max(career_span_years, 0.25)) - 1.0, 4)
        value_to_peak_cagr = (
            round((peak_val / first_val) ** (1.0 / max(years_to_peak, 0.25)) - 1.0, 4)
            if peak_val > first_val and years_to_peak > 0
            else 0.0
        )
        value_multiplier_x = round(peak_val / first_val, 2)
        post_peak_decline_pct = round(max(0.0, (peak_val - last_val) / peak_val * 100.0), 2)
        mean_val = float(np.mean(vals))
        value_volatility = round(float(np.std(vals, ddof=1) / mean_val), 4) if mean_val > 0 and len(vals) > 1 else 0.0

        # Mean YoY growth rate across consecutive points annualized
        yoy_rates = []
        for i in range(1, len(vals)):
            dy = max((dts[i] - dts[i - 1]).days / 365.25, 0.1)
            if vals[i - 1] > 0:
                yoy_rates.append((vals[i] / vals[i - 1]) ** (1.0 / dy) - 1.0)
        mean_yoy_growth_rate = round(float(np.mean(yoy_rates)), 4) if yoy_rates else 0.0

        is_at_peak = 1 if peak_dt == last_dt else 0
        trajectory = _classify_trajectory(is_at_peak, post_peak_decline_pct)

        cit = str(prof.get("citizenship", "") or "")
        nationality = cit.split("  ")[0].strip() if cit and cit != "nan" else "Other"
        pos_raw = str(prof.get("position", "") or "")
        pos_clean = pos_raw.split(" - ")[-1].strip() if " - " in pos_raw else (pos_raw if pos_raw != "nan" else "Unknown")
        pos_group = POS_GROUP_MAP.get(str(prof.get("main_position", "")), "Other")

        new_player_rows.append(
            {
                "player_id": int(pid),
                "name": _strip_id_suffix(prof["player_name"]),
                "age": float(age),
                "nationality": nationality,
                "position": pos_clean,
                "position_group": pos_group,
                "current_club": club_name,
                "league_name": league_name,
                "current_value_eur": last_val,
                "current_value_tier": _value_tier(last_val),
                "peak_value_eur": int(round(peak_val)),
                "peak_value_tier": _value_tier(peak_val),
                "peak_date": peak_dt.strftime("%Y-%m-%d"),
                "peak_club": club_name,
                "age_at_peak": int(age_at_peak),
                "first_value_eur": int(round(first_val)),
                "first_date": first_dt.strftime("%Y-%m-%d"),
                "last_value_eur": int(round(last_val)),
                "last_date": last_dt.strftime("%Y-%m-%d"),
                "career_span_years": career_span_years,
                "years_to_peak": years_to_peak,
                "value_cagr": value_cagr,
                "value_to_peak_cagr": value_to_peak_cagr,
                "value_multiplier_x": value_multiplier_x,
                "post_peak_decline_pct": post_peak_decline_pct,
                "value_volatility": value_volatility,
                "mean_yoy_growth_rate": mean_yoy_growth_rate,
                "num_valuation_points": int(len(vals)),
                "num_clubs_career": 1,
                "trajectory": trajectory,
                "is_at_peak": is_at_peak,
                "ever_100m": 1 if peak_val >= 100_000_000 else 0,
                "ever_50m": 1 if peak_val >= 50_000_000 else 0,
                "ever_10m": 1 if peak_val >= 10_000_000 else 0,
                "data_source": "Transfermarkt.com (salimt/football-datasets)",
                "dataset_built_at": today_str,
            }
        )

        for dt_val, val_eur in zip(dts, vals):
            age_at_dt = int((dt_val - dob).days // 365.25)
            new_history_rows.append(
                {
                    "player_id": int(pid),
                    "valuation_date": dt_val.strftime("%d/%m/%Y"),
                    "value_eur": int(round(val_eur)),
                    "value_display": _format_value_display(val_eur),
                    "club": club_name,
                    "age_at_date": age_at_dt,
                    "year": int(dt_val.year),
                    "month": int(dt_val.month),
                }
            )

    new_players_df = pd.DataFrame(new_player_rows, columns=old_players.columns)
    new_history_df = pd.DataFrame(new_history_rows, columns=old_history.columns)

    merged_players = pd.concat([old_players, new_players_df], ignore_index=True)
    merged_players = merged_players.drop_duplicates(subset=["player_id"], keep="first").reset_index(drop=True)

    merged_history = pd.concat([old_history, new_history_df], ignore_index=True)
    return merged_players, merged_history


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/salimt"))
    parser.add_argument("--force-download", action="store_true")
    args = parser.parse_args()

    players_df, history_df = build_expanded_dataset(args.cache_dir, force_download=args.force_download)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    players_out = OUT_DIR / "transfermarkt_player_values.csv"
    history_out = OUT_DIR / "transfermarkt_value_history.csv"

    players_df.to_csv(players_out, index=False, encoding="utf-8-sig")
    history_df.to_csv(history_out, index=False, encoding="utf-8-sig")

    print(f"Wrote {len(players_df)} players -> {players_out}")
    print(f"Wrote {len(history_df)} history rows -> {history_out}")
    print("Leagues:", players_df["league_name"].value_counts().to_dict())
    print("Trajectories:", players_df["trajectory"].value_counts().to_dict())


if __name__ == "__main__":
    main()
