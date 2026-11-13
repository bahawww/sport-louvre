"""Single source of truth for model features.

Every feature is a pure function of a valuation-history *prefix* (the points known at
prediction time), a forecast horizon, and static profile fields. Training rows, test rows and
`/api/simulate` all go through `prefix_features` + `assemble_row`, so there is no
train-serving skew, and nothing about the target valuation can reach a feature.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

CLASSES: list[str] = ["rising_star", "growing", "stable", "declining", "falling_sharply"]

# Headline view of the same label: `rising_star` and `growing` differ only in whether the next
# valuation is a strict new record, which price history cannot tell apart. Merged, the class
# means "at or within 20% of the career peak".
TREND_CLASSES: list[str] = ["rising", "stable", "declining", "falling_sharply"]
TREND_OF: dict[str, str] = {
    "rising_star": "rising",
    "growing": "rising",
    "stable": "stable",
    "declining": "declining",
    "falling_sharply": "falling_sharply",
}

CAT_FEATURES: list[str] = ["league_name", "nationality", "position", "position_group"]

# Task 1 - next-update forecasting: full lag state of the price series.
FORECAST_NUM_FEATURES: list[str] = [
    "age",
    "horizon_yr",
    "log_last",
    "log_prev",
    "log_peak",
    "log_first",
    "log_mean",
    "dd_last",
    "dd_prev",
    "dd_delta",
    "ret1",
    "ret2",
    "ret3",
    "ret1_ann",
    "gap_prev_yr",
    "at_peak",
    "new_high_last",
    "yrs_since_peak",
    "yrs_to_peak",
    "span_yr",
    "age_at_peak",
    "n_points",
    "consec_drops",
    "consec_rises",
    "yrs_unchanged",
    "slope_log_all",
    "slope_log_2y",
    "ret_vol",
    "cv",
    "range_pos",
    "log_mult",
    "ever_10m",
    "ever_50m",
    "ever_100m",
    "has_anchor",
    "anc_log_ratio_peak",
    "anc_slope_log",
]

# Task 2 - fundamental fair value: career state as it stood >= 12 months before the last known
# valuation (the "anchor"), plus age at the target date. No price from the last 12 months is
# visible, so the model cannot copy the current market price.
FUNDAMENTAL_NUM_FEATURES: list[str] = [
    "age",
    "anc_lag_yr",
    "anc_log_peak",
    "anc_log_first",
    "anc_log_mean",
    "anc_age_at_peak",
    "anc_yrs_since_peak",
    "anc_years_to_peak",
    "anc_span_yr",
    "anc_n_points",
    "anc_dd",
    "anc_slope_log",
    "anc_ret_vol",
    "anc_cv",
    "anc_ever_10m",
    "anc_ever_50m",
    "anc_ever_100m",
]

# Synthetic profile mode: exactly what a user can type into the simulator form.
PROFILE_NUM_FEATURES: list[str] = [
    "age",
    "age_at_peak",
    "age_past_peak",
    "log_peak",
    "log_first",
    "span_yr",
    "yrs_to_peak",
    "years_past_peak",
    "cv",
    "n_points",
    "ever_10m",
    "ever_50m",
    "ever_100m",
]
PROFILE_CAT_FEATURES: list[str] = ["league_name", "nationality", "position_group"]

# Features that expose the latest price level, directly or through algebra with the peak.
PRICE_LEVEL_FEATURES: frozenset[str] = frozenset(
    {
        "log_last",
        "log_prev",
        "log_mean",
        "dd_last",
        "dd_prev",
        "dd_delta",
        "ret1",
        "ret2",
        "ret3",
        "ret1_ann",
        "at_peak",
        "new_high_last",
        "yrs_since_peak",
        "log_peak",
        "range_pos",
        "log_mult",
        "cv",
        "slope_log_all",
        "slope_log_2y",
        "consec_drops",
        "consec_rises",
        "yrs_unchanged",
    }
)

ANCHOR_LAG_YEARS = 1.0
DEFAULT_HORIZON_YR = 0.45


def classify_trajectory(target_value: float, prefix_peak: float) -> str:
    """Dataset label rule (scripts/expand_dataset.py), expressed on the prefix.

    rising_star = strict new all-time high; otherwise the drawdown from the peak decides.
    """
    if target_value > prefix_peak:
        return "rising_star"
    decline_pct = round(max(0.0, (prefix_peak - target_value) / prefix_peak * 100.0), 2)
    if decline_pct < 20.0:
        return "growing"
    if decline_pct < 30.0:
        return "stable"
    if decline_pct < 60.0:
        return "declining"
    return "falling_sharply"


def _slope(log_v: np.ndarray, t: np.ndarray) -> float:
    if len(log_v) < 2:
        return 0.0
    tc = t - t.mean()
    den = float((tc * tc).sum())
    if den <= 1e-9:
        return 0.0
    return float((tc * (log_v - log_v.mean())).sum() / den)


def _state(v: np.ndarray, t: np.ndarray, ages: np.ndarray) -> dict[str, float]:
    """Career-shape statistics of one price path (shared by the full prefix and the anchor)."""
    n = len(v)
    log_v = np.log(v)
    peak = float(v.max())
    ipk = int(np.argmax(v))
    mean = float(v.mean())
    return {
        "log_peak": math.log1p(peak),
        "log_first": math.log1p(float(v[0])),
        "log_mean": math.log1p(mean),
        "age_at_peak": float(ages[ipk]),
        "yrs_since_peak": float(t[-1] - t[ipk]),
        "yrs_to_peak": float(t[ipk] - t[0]),
        "span_yr": float(t[-1] - t[0]),
        "n_points": float(n),
        "dd": float(1.0 - v[-1] / peak),
        "slope_log": _slope(log_v[t >= t[-1] - 2.0], t[t >= t[-1] - 2.0]),
        "ret_vol": float(np.std(np.diff(log_v))) if n >= 3 else 0.0,
        "cv": float(np.std(v, ddof=1) / mean) if n >= 2 else 0.0,
        "ever_10m": float(peak >= 10_000_000),
        "ever_50m": float(peak >= 50_000_000),
        "ever_100m": float(peak >= 100_000_000),
    }


def prefix_features(
    values: Sequence[float], days: Sequence[float], ages: Sequence[float]
) -> dict[str, float]:
    """Horizon-independent features of a history prefix.

    values: market values (> 0), chronological. days: day number of each valuation.
    ages: integer age at each valuation. Nothing after the prefix is read.
    """
    v = np.asarray(values, dtype=float)
    t = np.asarray(days, dtype=float) / 365.25
    a = np.asarray(ages, dtype=float)
    n = len(v)
    if n < 1:
        raise ValueError("history prefix needs at least one valuation")

    last = float(v[-1])
    prev = float(v[-2]) if n >= 2 else last
    p3 = float(v[-3]) if n >= 3 else prev
    p4 = float(v[-4]) if n >= 4 else p3
    st = _state(v, t, a)
    peak = float(v.max())
    vmin = float(v.min())
    gap_prev = float(t[-1] - t[-2]) if n >= 2 else 0.5
    ret1 = math.log(last / prev)

    drops = rises = 0
    for i in range(n - 1, 0, -1):
        if v[i] < v[i - 1]:
            drops += 1
        else:
            break
    for i in range(n - 1, 0, -1):
        if v[i] > v[i - 1]:
            rises += 1
        else:
            break
    j = n - 1
    while j > 0 and v[j - 1] == last:
        j -= 1

    feats: dict[str, float] = {
        "age_last": float(a[-1]),
        "last_value_eur": last,
        "peak_value_eur": peak,
        "log_last": math.log1p(last),
        "log_prev": math.log1p(prev),
        "log_peak": st["log_peak"],
        "log_first": st["log_first"],
        "log_mean": st["log_mean"],
        "dd_last": st["dd"],
        "dd_prev": float(1.0 - prev / peak),
        "dd_delta": float((prev - last) / peak),
        "ret1": ret1,
        "ret2": math.log(last / p3),
        "ret3": math.log(last / p4),
        "ret1_ann": ret1 / max(gap_prev, 0.1),
        "gap_prev_yr": gap_prev,
        "at_peak": float(last >= peak),
        "new_high_last": float(n >= 2 and last > float(v[:-1].max())),
        "yrs_since_peak": st["yrs_since_peak"],
        "yrs_to_peak": st["yrs_to_peak"],
        "span_yr": st["span_yr"],
        "age_at_peak": st["age_at_peak"],
        "n_points": st["n_points"],
        "consec_drops": float(drops),
        "consec_rises": float(rises),
        "yrs_unchanged": float(t[-1] - t[j]),
        "slope_log_all": _slope(np.log(v), t),
        "slope_log_2y": st["slope_log"],
        "ret_vol": st["ret_vol"],
        "cv": st["cv"],
        "range_pos": float((last - vmin) / (peak - vmin)) if peak > vmin else 1.0,
        "log_mult": math.log(last / float(v[0])),
        "ever_10m": st["ever_10m"],
        "ever_50m": st["ever_50m"],
        "ever_100m": st["ever_100m"],
    }

    # Anchor = the same statistics computed on points at least 12 months older than the last one.
    mask = t <= t[-1] - ANCHOR_LAG_YEARS
    if mask.any():
        k = int(mask.sum())
        anc = _state(v[:k], t[:k], a[:k])
        feats.update(
            {
                "has_anchor": 1.0,
                "anc_lag_base_yr": float(t[-1] - t[k - 1]),
                "anc_age_last": float(a[k - 1]),
                "anc_log_ratio_peak": math.log(float(v[k - 1]) / peak),
                "anc_log_peak": anc["log_peak"],
                "anc_log_first": anc["log_first"],
                "anc_log_mean": anc["log_mean"],
                "anc_age_at_peak": anc["age_at_peak"],
                "anc_yrs_since_peak_base": anc["yrs_since_peak"],
                "anc_years_to_peak": anc["yrs_to_peak"],
                "anc_span_yr": anc["span_yr"],
                "anc_n_points": anc["n_points"],
                "anc_dd": anc["dd"],
                "anc_slope_log": anc["slope_log"],
                "anc_ret_vol": anc["ret_vol"],
                "anc_cv": anc["cv"],
                "anc_ever_10m": anc["ever_10m"],
                "anc_ever_50m": anc["ever_50m"],
                "anc_ever_100m": anc["ever_100m"],
            }
        )
    else:
        feats["has_anchor"] = 0.0
        for key in (
            "anc_lag_base_yr",
            "anc_age_last",
            "anc_log_ratio_peak",
            "anc_log_peak",
            "anc_log_first",
            "anc_log_mean",
            "anc_age_at_peak",
            "anc_yrs_since_peak_base",
            "anc_years_to_peak",
            "anc_span_yr",
            "anc_n_points",
            "anc_dd",
            "anc_slope_log",
            "anc_ret_vol",
            "anc_cv",
            "anc_ever_10m",
            "anc_ever_50m",
            "anc_ever_100m",
        ):
            feats[key] = float("nan")
    return feats


def assemble_row(
    pf: dict[str, float], horizon_yr: float, static: dict[str, Any]
) -> dict[str, Any]:
    """Add the horizon-dependent features and the static profile to prefix features."""
    row: dict[str, Any] = dict(pf)
    h = float(horizon_yr)
    row["horizon_yr"] = h
    row["age"] = pf["age_last"] + h
    row["anc_lag_yr"] = pf["anc_lag_base_yr"] + h
    row["anc_yrs_since_peak"] = pf["anc_yrs_since_peak_base"] + pf["anc_lag_base_yr"] + h
    # Profile-mode view of the same career summary.
    row["age_past_peak"] = row["age"] - pf["age_at_peak"]
    row["years_past_peak"] = pf["span_yr"] - pf["yrs_to_peak"]
    for cat in CAT_FEATURES:
        row[cat] = static.get(cat)
    return row


def profile_row(
    *,
    age: float,
    age_at_peak: float,
    peak_value_eur: float,
    first_value_eur: float,
    career_span_years: float,
    years_to_peak: float,
    value_volatility: float,
    num_valuation_points: float,
    league_name: str,
    nationality: str,
    position_group: str | None,
) -> dict[str, Any]:
    """Synthetic-profile feature row built only from user-supplied fields."""
    peak = max(float(peak_value_eur), float(first_value_eur), 1.0)
    ytp = min(float(years_to_peak), float(career_span_years))
    return {
        "age": float(age),
        "age_at_peak": float(age_at_peak),
        "age_past_peak": float(age) - float(age_at_peak),
        "log_peak": math.log1p(peak),
        "log_first": math.log1p(max(float(first_value_eur), 1.0)),
        "span_yr": float(career_span_years),
        "yrs_to_peak": ytp,
        "years_past_peak": float(career_span_years) - ytp,
        "cv": float(value_volatility),
        "n_points": float(num_valuation_points),
        "ever_10m": float(peak >= 10_000_000),
        "ever_50m": float(peak >= 50_000_000),
        "ever_100m": float(peak >= 100_000_000),
        "league_name": league_name,
        "nationality": nationality,
        "position_group": position_group,
    }
