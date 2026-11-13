"""Evaluation helpers that turn predictions into report-ready tables.

Nothing here trains a model. Each function takes arrays or fitted estimators and returns plain
dicts/lists for the API and for `report.py`: reliability bins, segment error tables, baseline
comparisons and per-player explanations.
"""

from __future__ import annotations

from typing import Any, Callable

import numpy as np
import pandas as pd

from features import CLASSES, FORECAST_NUM_FEATURES

# Feature groups for per-player explanations. Features inside a group are strongly correlated
# (several are algebra of each other), so they are perturbed together.
FEATURE_GROUPS: dict[str, list[str]] = {
    "price_level": [
        "log_last", "log_prev", "log_peak", "log_first", "log_mean",
        "ever_10m", "ever_50m", "ever_100m",
    ],
    "momentum": [
        "ret1", "ret2", "ret3", "ret1_ann", "slope_log_all", "slope_log_2y", "consec_drops",
        "consec_rises", "new_high_last", "yrs_unchanged", "has_anchor", "anc_log_ratio_peak",
        "anc_slope_log",
    ],
    "drawdown": [
        "dd_last", "dd_prev", "dd_delta", "at_peak", "range_pos", "yrs_since_peak", "log_mult",
    ],
    "age": ["age", "age_at_peak"],
    "career_length": ["span_yr", "yrs_to_peak", "n_points", "gap_prev_yr"],
    "volatility": ["ret_vol", "cv"],
    "horizon": ["horizon_yr"],
    "league": ["league_name"],
    "position": ["position", "position_group"],
    "nationality": ["nationality"],
}

# One representative feature per group, shown next to the contribution.
GROUP_KEY_FEATURE: dict[str, str] = {
    "price_level": "last_value_eur",
    "momentum": "ret1",
    "drawdown": "dd_last",
    "age": "age",
    "career_length": "span_yr",
    "volatility": "ret_vol",
    "horizon": "horizon_yr",
    "league": "league_name",
    "position": "position",
    "nationality": "nationality",
}

VALUE_TIERS: list[tuple[str, float, float]] = [
    ("< €5M", 0.0, 5e6),
    ("€5-20M", 5e6, 20e6),
    ("€20-50M", 20e6, 50e6),
    ("≥ €50M", 50e6, float("inf")),
]
AGE_BUCKETS: list[tuple[str, float, float]] = [
    ("≤ 21", 0.0, 21.5),
    ("22-25", 21.5, 25.5),
    ("26-29", 25.5, 29.5),
    ("≥ 30", 29.5, 99.0),
]


def _bucket(values: np.ndarray, buckets: list[tuple[str, float, float]]) -> np.ndarray:
    out = np.full(len(values), "", dtype=object)
    for name, lo, hi in buckets:
        out[(values >= lo) & (values < hi)] = name
    return out


def value_tier(values: Any) -> np.ndarray:
    return _bucket(np.asarray(values, dtype=float), VALUE_TIERS)


def age_bucket(ages: Any) -> np.ndarray:
    return _bucket(np.asarray(ages, dtype=float), AGE_BUCKETS)


# ----------------------------------------------------------------------------- calibration


def reliability_bins(prob: Any, hit: Any, bins: int = 10) -> list[dict[str, Any]]:
    """Predicted probability vs observed frequency, equal-width bins. Empty bins are dropped."""
    prob = np.asarray(prob, dtype=float)
    hit = np.asarray(hit, dtype=float)
    out = []
    edges = np.linspace(0.0, 1.0, bins + 1)
    for k in range(bins):
        lo, hi = edges[k], edges[k + 1]
        m = (prob >= lo) & (prob <= hi) if k == bins - 1 else (prob >= lo) & (prob < hi)
        if m.any():
            out.append(
                {
                    "lo": round(float(lo), 2),
                    "hi": round(float(hi), 2),
                    "n": int(m.sum()),
                    "predicted": round(float(prob[m].mean()), 4),
                    "observed": round(float(hit[m].mean()), 4),
                }
            )
    return out


def classifier_calibration(
    proba: np.ndarray, y: Any, classes: list[str] = CLASSES
) -> dict[str, Any]:
    """Reliability data for a classifier: top-label and one-vs-rest per class."""
    y_idx = np.array([classes.index(c) for c in np.asarray(y)])
    top = proba.argmax(axis=1)
    return {
        "top_label": reliability_bins(proba.max(axis=1), top == y_idx),
        "per_class": {
            c: reliability_bins(proba[:, k], y_idx == k, bins=5) for k, c in enumerate(classes)
        },
    }


def coverage_by_tier(actual: Any, lo: Any, hi: Any) -> list[dict[str, Any]]:
    actual, lo, hi = (np.asarray(a, dtype=float) for a in (actual, lo, hi))
    tiers = value_tier(actual)
    out = []
    for name, _, _ in VALUE_TIERS:
        m = tiers == name
        if m.any():
            out.append(
                {
                    "segment": name,
                    "n": int(m.sum()),
                    "coverage": round(float(((actual[m] >= lo[m]) & (actual[m] <= hi[m])).mean()), 4),
                    "median_width_ratio": round(float(np.median(hi[m] / np.maximum(lo[m], 1.0))), 3),
                }
            )
    return out


# ----------------------------------------------------------------------------- baselines


def skill(model: dict[str, float], baseline: dict[str, float], key: str) -> float:
    """Share of the baseline error removed by the model (positive = model better)."""
    return round(1.0 - model[key] / baseline[key], 4) if baseline[key] else 0.0


def regression_headline(
    name: str, model: dict[str, Any], naive: dict[str, Any], top: dict[str, Any], top_naive: dict[str, Any]
) -> dict[str, Any]:
    keep = ("mae", "rmse", "r2", "mae_log", "rmse_log", "r2_log", "medape")
    return {
        "model": name,
        "metrics": {k: model[k] for k in keep},
        "naive_last_value": {k: naive[k] for k in keep},
        "skill_vs_naive": {k: skill(model, naive, k) for k in ("mae", "rmse", "mae_log", "rmse_log")},
        "beats_naive_eur": bool(model["mae"] < naive["mae"] and model["rmse"] < naive["rmse"]),
        "beats_naive_log": bool(model["rmse_log"] < naive["rmse_log"]),
        "value_ge_50m": {
            "n": top["n"],
            "metrics": {k: top[k] for k in keep},
            "naive_last_value": {k: top_naive[k] for k in keep},
            "skill_vs_naive": {k: skill(top, top_naive, k) for k in ("mae", "rmse_log")},
        },
    }


def classification_headline(
    name: str, model: dict[str, Any], persistence: dict[str, Any], fixed: dict[str, Any]
) -> dict[str, Any]:
    keep = ("accuracy", "macro_f1", "ece", "brier", "log_loss")
    return {
        "model": name,
        "metrics": {k: model[k] for k in keep},
        "persistence": {k: persistence[k] for k in keep},
        "selective": model.get("selective"),
        "gain_vs_persistence": {
            "accuracy_pp": round((model["accuracy"] - persistence["accuracy"]) * 100, 2),
            "macro_f1_pp": round((model["macro_f1"] - persistence["macro_f1"]) * 100, 2),
            "log_loss_reduction": skill(model, persistence, "log_loss"),
        },
        "fixed_horizon": {k: fixed[k] for k in keep},
    }


# ----------------------------------------------------------------------------- segments


def _reg_cell(actual: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    rel = (pred - actual) / np.maximum(actual, 1.0)
    return {
        "mae": round(float(np.abs(pred - actual).mean()), 2),
        "medape": round(float(np.median(np.abs(rel))), 4),
        "bias_pct": round(float(np.median(rel)) * 100, 2),  # median signed error; + = over-predicts
        "rmse_log": round(float(np.sqrt(((np.log1p(pred) - np.log1p(actual)) ** 2).mean())), 4),
    }


def segment_report(frame: pd.DataFrame, dimensions: dict[str, Any], min_n: int = 15) -> dict[str, list[dict[str, Any]]]:
    """Error by segment for the scored test rows.

    frame columns: actual, forecast, naive, fair, label, pred_label, persistence_label.
    dimensions: name -> array of segment labels (same length as frame).
    """
    actual = frame["actual"].to_numpy(dtype=float)
    out: dict[str, list[dict[str, Any]]] = {}
    for dim, labels in dimensions.items():
        labels = np.asarray(labels, dtype=object)
        rows = []
        for seg in pd.unique(labels):
            m = labels == seg
            if not seg or m.sum() < min_n:
                continue
            fc = _reg_cell(actual[m], frame["forecast"].to_numpy(dtype=float)[m])
            nv = _reg_cell(actual[m], frame["naive"].to_numpy(dtype=float)[m])
            rows.append(
                {
                    "segment": str(seg),
                    "n": int(m.sum()),
                    "forecast": fc,
                    "naive": nv,
                    "forecast_beats_naive_log": bool(fc["rmse_log"] < nv["rmse_log"]),
                    "fundamental": _reg_cell(actual[m], frame["fair"].to_numpy(dtype=float)[m]),
                    "accuracy": round(float((frame["pred_label"].to_numpy()[m] == frame["label"].to_numpy()[m]).mean()), 4),
                    "persistence_accuracy": round(
                        float((frame["persistence_label"].to_numpy()[m] == frame["label"].to_numpy()[m]).mean()), 4
                    ),
                }
            )
        out[dim] = sorted(rows, key=lambda r: r["segment"])
    return out


def direction_by_segment(labels: Any, direction: Any, p_up: Any, p_down: Any, threshold: float) -> list[dict[str, Any]]:
    """Out-of-time hit rate of the outlook signals inside each segment."""
    labels = np.asarray(labels, dtype=object)
    direction = np.asarray(direction, dtype=object)
    p_up, p_down = np.asarray(p_up, dtype=float), np.asarray(p_down, dtype=float)
    rows = []
    for seg in pd.unique(labels):
        m = labels == seg
        if not seg or m.sum() < 30:
            continue
        buy, risk = m & (p_up >= threshold), m & (p_down >= threshold)
        rows.append(
            {
                "segment": str(seg),
                "n": int(m.sum()),
                "base_up": round(float((direction[m] == "up").mean()), 4),
                "base_down": round(float((direction[m] == "down").mean()), 4),
                "buy_n": int(buy.sum()),
                "buy_went_up": round(float((direction[buy] == "up").mean()), 4) if buy.any() else None,
                "risk_n": int(risk.sum()),
                "risk_went_down": round(float((direction[risk] == "down").mean()), 4) if risk.any() else None,
            }
        )
    return sorted(rows, key=lambda r: r["segment"])


def decile_table(predicted: Any, realised: Any, n: int = 10) -> list[dict[str, Any]]:
    """Predicted vs realised log return by decile of the prediction."""
    df = pd.DataFrame({"p": np.asarray(predicted, dtype=float), "r": np.asarray(realised, dtype=float)})
    df["decile"] = pd.qcut(df["p"].rank(method="first"), n, labels=False) + 1
    out = []
    for d, g in df.groupby("decile"):
        out.append(
            {
                "decile": int(d),
                "n": int(len(g)),
                "predicted_median": round(float(g["p"].median()), 4),
                "realised_median": round(float(g["r"].median()), 4),
                "realised_mean": round(float(g["r"].mean()), 4),
                "share_up": round(float((g["r"] > 0.05).mean()), 4),
                "share_down": round(float((g["r"] < -0.05).mean()), 4),
            }
        )
    return out


def threshold_sweep(direction: Any, p_up: Any, p_down: Any, thresholds: tuple[float, ...] = (0.5, 0.6, 0.7, 0.8)) -> list[dict[str, Any]]:
    direction = np.asarray(direction, dtype=object)
    p_up, p_down = np.asarray(p_up, dtype=float), np.asarray(p_down, dtype=float)
    out = []
    for t in thresholds:
        buy, risk = p_up >= t, p_down >= t
        out.append(
            {
                "threshold": t,
                "buy_n": int(buy.sum()),
                "buy_went_up": round(float((direction[buy] == "up").mean()), 4) if buy.any() else None,
                "risk_n": int(risk.sum()),
                "risk_went_down": round(float((direction[risk] == "down").mean()), 4) if risk.any() else None,
            }
        )
    return out


# ----------------------------------------------------------------------------- explanations


def explain_row(
    predict: Callable[[pd.DataFrame], np.ndarray],
    row: pd.DataFrame,
    background: pd.DataFrame,
    groups: dict[str, list[str]] = FEATURE_GROUPS,
) -> dict[str, Any]:
    """Per-player explanation by group replacement.

    For each feature group, the player's values are swapped for those of `background` players
    and the prediction is averaged. contribution = prediction - that average: how much this
    player's own values in the group move the prediction compared with a typical player.
    Contributions are one-group-at-a-time effects; they do not have to add up to the prediction.
    """
    base = float(predict(row)[0])
    n = len(background)
    tiled = pd.concat([row] * n, ignore_index=True)
    # One stacked frame, one predict call.
    blocks = []
    for cols in groups.values():
        block = tiled.copy()
        block[cols] = background[cols].to_numpy()
        blocks.append(block)
    preds = np.asarray(predict(pd.concat(blocks, ignore_index=True)), dtype=float).reshape(len(groups), n)
    contributions = [
        {"group": g, "contribution": round(base - float(preds[k].mean()), 4)}
        for k, g in enumerate(groups)
    ]
    contributions.sort(key=lambda c: abs(c["contribution"]), reverse=True)
    return {
        "prediction": round(base, 4),
        "typical": round(float(np.asarray(predict(background), dtype=float).mean()), 4),
        "contributions": contributions,
    }


def assert_groups_cover_features() -> None:
    grouped = [f for cols in FEATURE_GROUPS.values() for f in cols]
    expected = FORECAST_NUM_FEATURES + ["league_name", "nationality", "position", "position_group"]
    assert sorted(grouped) == sorted(expected), set(grouped) ^ set(expected)
