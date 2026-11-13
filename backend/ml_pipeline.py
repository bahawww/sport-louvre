"""ML training, evaluation, and inference pipeline for Transfermarkt player trajectories."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
    VotingClassifier,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    root_mean_squared_error,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

CLASSES: list[str] = [
    "rising_star",
    "growing",
    "stable",
    "declining",
    "falling_sharply",
]

CLEAN_NUM_FEATURES: list[str] = [
    "age",
    "age_at_peak",
    "age_past_peak",
    "years_past_peak",
    "peak_value_eur",
    "first_value_eur",
    "career_span_years",
    "years_to_peak",
    "value_volatility",
    "num_valuation_points",
    "num_clubs_career",
    "ever_100m",
    "ever_50m",
    "ever_10m",
    "pre_last_value_eur",
    "pre_prev_value_eur",
    "pre_peak_value_eur",
    "pre_drawdown_pct",
    "pre_drawdown_prev",
    "pre_dd_delta",
    "pre_dd_velocity",
    "pre_mom1",
    "pre_mom2",
    "pre_mom3",
    "pre_mom1_ann",
    "pre_multiplier",
    "is_pre_peak",
    "pre_slope",
    "pre_cagr",
    "pre_ratio_mean",
    "pre_recent_dd",
    "pre_span_yr",
    "dt_gap_yr",
    "last_gap_yr",
    "pre_consec_drops",
    "pre_range_pos",
    "pre_volatility",
]

LEAKAGE_EXTRA_NUM_FEATURES: list[str] = [
    "value_cagr",
    "value_to_peak_cagr",
    "value_multiplier_x",
    "post_peak_decline_pct",
    "mean_yoy_growth_rate",
    "is_at_peak",
]

CAT_FEATURES: list[str] = ["league_name", "nationality"]

TOP_N_NATIONALITIES = 12


def resolve_data_paths() -> tuple[Path, Path]:
    """Resolve player values and value history CSV paths."""
    env_players = os.environ.get("PLAYERS_CSV")
    env_history = os.environ.get("HISTORY_CSV")
    if env_players and env_history:
        return Path(env_players), Path(env_history)

    container_players = Path("/app/data/transfermarkt_player_values.csv")
    container_history = Path("/app/data/transfermarkt_value_history.csv")
    if container_players.exists() and container_history.exists():
        return container_players, container_history

    local_dir = Path("/opt/sport-dashboard/data/Football_Player_Market_Value_Trajectories")
    return (
        local_dir / "transfermarkt_player_values.csv",
        local_dir / "transfermarkt_value_history.csv",
    )


def _build_preprocessor(num_features: list[str], cat_features: list[str]) -> ColumnTransformer:
    num_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    cat_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value="Other")),
            ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", num_pipe, num_features),
            ("cat", cat_pipe, cat_features),
        ]
    )


def _aggregate_feature_importance(
    pipeline: Pipeline,
    num_features: list[str],
    cat_features: list[str],
    X_train: pd.DataFrame | None = None,
) -> list[dict[str, Any]]:
    """Aggregate OHE feature importances back to original feature names."""
    prep: ColumnTransformer = pipeline.named_steps["prep"]
    model = pipeline.named_steps["model"]

    if hasattr(model, "feature_importances_"):
        raw_imp = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, "estimators_"):
        imps = [
            np.asarray(est.feature_importances_, dtype=float)
            for est in model.estimators_
            if hasattr(est, "feature_importances_")
        ]
        if not imps:
            return []
        raw_imp = np.mean(imps, axis=0)
    elif hasattr(model, "coef_"):
        coef = np.asarray(model.coef_, dtype=float)
        if coef.ndim == 2:
            raw_imp = np.mean(np.abs(coef), axis=0)
        else:
            raw_imp = np.abs(coef)
    else:
        return []

    total = float(raw_imp.sum())
    if total > 0:
        raw_imp = raw_imp / total

    num_count = len(num_features)
    importances: dict[str, float] = {
        feat: float(raw_imp[idx]) for idx, feat in enumerate(num_features)
    }

    ohe: OneHotEncoder = prep.named_transformers_["cat"].named_steps["ohe"]
    offset = num_count
    for feat, cats in zip(cat_features, ohe.categories_):
        n_cats = len(cats)
        importances[feat] = float(raw_imp[offset : offset + n_cats].sum())
        offset += n_cats

    ranked = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)
    return [
        {"feature": feat, "importance": round(float(val), 4)}
        for feat, val in ranked
    ]


def _evaluate_classifiers(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
    num_features: list[str],
) -> tuple[dict[str, Any], dict[str, Pipeline], dict[str, np.ndarray]]:
    specs = [
        ("Random Forest", RandomForestClassifier(n_estimators=400, random_state=42, n_jobs=-1)),
        ("Extra Trees", ExtraTreesClassifier(n_estimators=400, random_state=42, n_jobs=-1)),
        ("Gradient Boosting", GradientBoostingClassifier(n_estimators=250, max_depth=3, learning_rate=0.04, subsample=0.85, random_state=42)),
        ("HistGradientBoosting", HistGradientBoostingClassifier(max_iter=300, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=20, l2_regularization=2.0, random_state=42)),
        ("Logistic Regression", LogisticRegression(max_iter=3000, C=10.0, random_state=42)),
        (
            "Soft Voting Ensemble",
            VotingClassifier(
                estimators=[
                    ("gb", GradientBoostingClassifier(n_estimators=250, max_depth=3, learning_rate=0.04, subsample=0.85, random_state=42)),
                    ("hgb", HistGradientBoostingClassifier(max_iter=300, learning_rate=0.04, max_leaf_nodes=15, min_samples_leaf=20, l2_regularization=2.0, random_state=42)),
                    ("rf", RandomForestClassifier(n_estimators=400, random_state=42, n_jobs=-1)),
                    ("lr", LogisticRegression(max_iter=3000, C=10.0, random_state=42)),
                ],
                voting="soft",
                weights=[3, 3, 2, 1],
            ),
        ),
    ]

    models_out: list[dict[str, Any]] = []
    pipelines: dict[str, Pipeline] = {}
    preds_map: dict[str, np.ndarray] = {}

    for name, est in specs:
        pipe = Pipeline(
            steps=[
                ("prep", _build_preprocessor(num_features, CAT_FEATURES)),
                ("model", est),
            ]
        )
        pipe.fit(X_train, y_train)
        y_pred = pipe.predict(X_test)
        cm = confusion_matrix(y_test, y_pred, labels=CLASSES)

        models_out.append(
            {
                "name": name,
                "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
                "f1_weighted": round(float(f1_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                "precision_weighted": round(float(precision_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                "recall_weighted": round(float(recall_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                "confusion_matrix": cm.tolist(),
                "feature_importance": _aggregate_feature_importance(pipe, num_features, CAT_FEATURES),
            }
        )
        pipelines[name] = pipe
        preds_map[name] = y_pred

    best_entry = max(models_out, key=lambda m: (m["f1_weighted"], m["accuracy"]))
    return (
        {"models": models_out, "best_model": best_entry["name"]},
        pipelines,
        preds_map,
    )


def _evaluate_regressors(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_train: pd.Series,
    y_test: pd.Series,
    num_features: list[str],
) -> tuple[dict[str, Any], dict[str, Pipeline], dict[str, np.ndarray]]:
    specs = [
        ("Random Forest Regressor", RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)),
        ("Gradient Boosting Regressor", GradientBoostingRegressor(n_estimators=200, learning_rate=0.05, random_state=42)),
        ("HistGradientBoosting Regressor", HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, random_state=42)),
        ("Linear Regression", LinearRegression()),
    ]

    models_out: list[dict[str, Any]] = []
    pipelines: dict[str, Pipeline] = {}
    preds_map: dict[str, np.ndarray] = {}

    for name, est in specs:
        pipe = Pipeline(
            steps=[
                ("prep", _build_preprocessor(num_features, CAT_FEATURES)),
                ("model", est),
            ]
        )
        pipe.fit(X_train, y_train)
        y_pred = pipe.predict(X_test)

        models_out.append(
            {
                "name": name,
                "mae": round(float(mean_absolute_error(y_test, y_pred)), 2),
                "rmse": round(float(root_mean_squared_error(y_test, y_pred)), 2),
                "r2": round(float(r2_score(y_test, y_pred)), 4),
                "feature_importance": _aggregate_feature_importance(pipe, num_features, CAT_FEATURES),
            }
        )
        pipelines[name] = pipe
        preds_map[name] = y_pred

    best_entry = max(models_out, key=lambda m: m["r2"])
    return (
        {"models": models_out, "best_model": best_entry["name"]},
        pipelines,
        preds_map,
    )


@dataclass
class DashboardArtifacts:
    """Trained models, precomputed evaluation metrics, and indexed data."""

    overview: dict[str, Any]
    test_predictions: dict[str, Any]
    players_df: pd.DataFrame
    history_by_player: dict[str, list[dict[str, Any]]]
    top_nationalities: set[str]
    best_clean_clf: Pipeline
    best_reg_model: Pipeline
    best_reg_mae: float
    total_players: int
    history_rows: int


def build_artifacts() -> DashboardArtifacts:
    """Load CSVs, train all clean/leakage/regression models, and precompute API payloads."""
    players_path, history_path = resolve_data_paths()
    df = pd.read_csv(players_path, encoding="utf-8-sig")
    hist_df = pd.read_csv(history_path, encoding="utf-8-sig")

    # Normalize player_id as string for consistent lookup
    df["player_id"] = df["player_id"].astype(str)
    hist_df["player_id"] = hist_df["player_id"].astype(str)

    # Engineer strictly pre-current lag features from history (excluding final valuation v[-1])
    hist_sorted = hist_df.copy()
    hist_sorted["_dt"] = pd.to_datetime(hist_sorted["valuation_date"], dayfirst=True, errors="coerce")
    hist_sorted = hist_sorted.sort_values(["player_id", "_dt"])
    lag_feats: dict[str, dict[str, float]] = {}
    for pid, grp in hist_sorted.groupby("player_id"):
        vals = grp["value_eur"].astype(float).values
        dts = grp["_dt"].values
        pre = vals[:-1] if len(vals) > 1 else vals
        pre_dt = dts[:-1] if len(dts) > 1 else dts
        p1 = float(pre[-1]) if len(pre) >= 1 else 0.0
        p2 = float(pre[-2]) if len(pre) >= 2 else p1
        p3 = float(pre[-3]) if len(pre) >= 3 else p2
        p4 = float(pre[-4]) if len(pre) >= 4 else p3
        p_peak = float(np.max(pre)) if len(pre) else 0.0
        p_min = float(np.min(pre)) if len(pre) else 0.0
        p_first = float(pre[0]) if len(pre) else 0.0
        p_mean = float(np.mean(pre)) if len(pre) else 0.0
        pre_span_yr = (
            max(0.25, float((pre_dt[-1] - pre_dt[0]) / np.timedelta64(1, "D")) / 365.25)
            if len(pre_dt) >= 2 and pd.notna(pre_dt[0]) and pd.notna(pre_dt[-1])
            else 0.5
        )
        dt_gap_yr = (
            max(0.15, float((pre_dt[-1] - pre_dt[-2]) / np.timedelta64(1, "D")) / 365.25)
            if len(pre_dt) >= 2 and pd.notna(pre_dt[-2]) and pd.notna(pre_dt[-1])
            else 0.5
        )
        pre_cagr = (
            float(np.clip((p1 / max(p_first, 1.0)) ** (1.0 / pre_span_yr) - 1.0, -0.99, 10.0))
            if p1 > 0 and p_first > 0
            else 0.0
        )
        mom1 = (p1 - p2) / max(p2, 1.0)
        dd1 = (p_peak - p1) / max(p_peak, 1.0)
        dd2 = (p_peak - p2) / max(p_peak, 1.0)
        cdrop = 0
        for idx_i in range(len(pre) - 1, 0, -1):
            if pre[idx_i] < pre[idx_i - 1]:
                cdrop += 1
            else:
                break
        recent_peak = float(np.max(pre[-3:])) if len(pre) >= 3 else p_peak
        slope = (
            float(np.polyfit(np.arange(len(pre), dtype=float), pre, 1)[0]) / max(p_peak, 1.0)
            if len(pre) >= 2
            else 0.0
        )
        lag_feats[str(pid)] = {
            "pre_last_value_eur": p1,
            "pre_prev_value_eur": p2,
            "pre_peak_value_eur": p_peak,
            "pre_drawdown_pct": dd1,
            "pre_drawdown_prev": dd2,
            "pre_dd_delta": dd1 - dd2,
            "pre_dd_velocity": (dd1 - dd2) / dt_gap_yr,
            "pre_mom1": mom1,
            "pre_mom2": (p1 - p3) / max(p3, 1.0),
            "pre_mom3": (p1 - p4) / max(p4, 1.0),
            "pre_mom1_ann": mom1 / dt_gap_yr,
            "pre_multiplier": p1 / max(p_first, 1.0),
            "is_pre_peak": float(int(p1 >= p_peak * 0.999)) if p_peak > 0 else 0.0,
            "pre_slope": slope,
            "pre_cagr": pre_cagr,
            "pre_ratio_mean": p1 / max(p_mean, 1.0),
            "pre_recent_dd": (recent_peak - p1) / max(recent_peak, 1.0),
            "pre_span_yr": pre_span_yr,
            "dt_gap_yr": dt_gap_yr,
            "pre_consec_drops": float(cdrop),
            "pre_range_pos": (p1 - p_min) / max(p_peak - p_min, 1.0),
            "pre_volatility": float(np.std(pre) / max(p_mean, 1.0)) if len(pre) > 1 and p_mean > 0 else 0.0,
        }

    for col in [
        "pre_last_value_eur",
        "pre_prev_value_eur",
        "pre_peak_value_eur",
        "pre_drawdown_pct",
        "pre_drawdown_prev",
        "pre_dd_delta",
        "pre_dd_velocity",
        "pre_mom1",
        "pre_mom2",
        "pre_mom3",
        "pre_mom1_ann",
        "pre_multiplier",
        "is_pre_peak",
        "pre_slope",
        "pre_cagr",
        "pre_ratio_mean",
        "pre_recent_dd",
        "pre_span_yr",
        "dt_gap_yr",
        "pre_consec_drops",
        "pre_range_pos",
        "pre_volatility",
    ]:
        df[col] = df["player_id"].map(lambda pid, c=col: lag_feats.get(pid, {}).get(c, 0.0))

    df["age_past_peak"] = df["age"].astype(float) - df["age_at_peak"].astype(float)
    df["years_past_peak"] = df["career_span_years"].astype(float) - df["years_to_peak"].astype(float)
    df["last_gap_yr"] = np.maximum(0.0, df["career_span_years"].astype(float) - df["pre_span_yr"])

    # Top N nationalities (excluding missing)
    nat_series = df["nationality"].fillna("").astype(str).str.strip()
    top_nats = set(
        nat_series[nat_series != ""]
        .value_counts()
        .head(TOP_N_NATIONALITIES)
        .index.tolist()
    )
    df["nationality_grouped"] = nat_series.apply(lambda n: n if n in top_nats else "Other")
    df["nationality_clean"] = nat_series.apply(lambda n: n if n else "Unknown")

    # Build model feature frame (keeping original nationality_grouped as 'nationality')
    leakage_num_features = CLEAN_NUM_FEATURES + LEAKAGE_EXTRA_NUM_FEATURES
    all_model_cols = leakage_num_features + ["league_name"]

    model_df = df[all_model_cols].copy()
    model_df["nationality"] = df["nationality_grouped"]

    train_idx, test_idx = train_test_split(
        df.index,
        test_size=0.2,
        random_state=42,
        stratify=df["trajectory"],
    )

    X_train_clean = model_df.loc[train_idx, CLEAN_NUM_FEATURES + CAT_FEATURES]
    X_test_clean = model_df.loc[test_idx, CLEAN_NUM_FEATURES + CAT_FEATURES]

    X_train_leak = model_df.loc[train_idx, leakage_num_features + CAT_FEATURES]
    X_test_leak = model_df.loc[test_idx, leakage_num_features + CAT_FEATURES]

    y_clf_train = df.loc[train_idx, "trajectory"]
    y_clf_test = df.loc[test_idx, "trajectory"]

    y_reg_train = df.loc[train_idx, "current_value_eur"].astype(float)
    y_reg_test = df.loc[test_idx, "current_value_eur"].astype(float)

    clean_res, clean_pipes, clean_preds = _evaluate_classifiers(
        X_train_clean, X_test_clean, y_clf_train, y_clf_test, CLEAN_NUM_FEATURES
    )
    leak_res, _, leak_preds = _evaluate_classifiers(
        X_train_leak, X_test_leak, y_clf_train, y_clf_test, leakage_num_features
    )
    reg_res, reg_pipes, reg_preds = _evaluate_regressors(
        X_train_clean, X_test_clean, y_reg_train, y_reg_test, CLEAN_NUM_FEATURES
    )

    best_clean_name = clean_res["best_model"]
    best_leak_name = leak_res["best_model"]
    best_reg_name = reg_res["best_model"]

    best_clean_acc = next(m["accuracy"] for m in clean_res["models"] if m["name"] == best_clean_name)
    best_leak_acc = next(m["accuracy"] for m in leak_res["models"] if m["name"] == best_leak_name)
    best_reg_mae = next(m["mae"] for m in reg_res["models"] if m["name"] == best_reg_name)

    traj_counts = df["trajectory"].value_counts().to_dict()
    trajectories_summary = {cls: int(traj_counts.get(cls, 0)) for cls in CLASSES}
    leagues = sorted(df["league_name"].dropna().unique().tolist())

    overview = {
        "dataset": {
            "total_players": int(len(df)),
            "train_size": int(len(train_idx)),
            "test_size": int(len(test_idx)),
            "history_rows": int(len(hist_df)),
            "leagues": leagues,
            "trajectories": trajectories_summary,
        },
        "classification": {
            "classes": CLASSES,
            "clean_mode": clean_res,
            "leakage_mode": leak_res,
        },
        "regression": reg_res,
    }

    # Build 102 test prediction rows
    test_df = df.loc[test_idx].copy()
    pred_traj_clean = clean_preds[best_clean_name]
    pred_traj_leak = leak_preds[best_leak_name]
    pred_val_raw = reg_preds[best_reg_name]

    rows: list[dict[str, Any]] = []
    growing_vs_stable_confusion = 0

    for idx_pos, (_, row) in enumerate(test_df.iterrows()):
        actual_val = float(row["current_value_eur"])
        pred_val = max(0.0, float(pred_val_raw[idx_pos]))
        # gap_eur = pred_value_eur - actual_value_eur: positive = Undervalued, negative = Overvalued
        residual_eur = pred_val - actual_val
        residual_pct = (residual_eur / actual_val * 100.0) if actual_val > 0 else 0.0

        if residual_pct >= 15.0:
            status = "Undervalued"
        elif residual_pct <= -15.0:
            status = "Overvalued"
        else:
            status = "Fair"

        actual_traj = str(row["trajectory"])
        p_clean = str(pred_traj_clean[idx_pos])
        p_leak = str(pred_traj_leak[idx_pos])

        if (actual_traj == "growing" and p_clean == "stable") or (
            actual_traj == "stable" and p_clean == "growing"
        ):
            growing_vs_stable_confusion += 1

        age_val = None if pd.isna(row["age"]) else float(row["age"])

        rows.append(
            {
                "player_id": str(row["player_id"]),
                "name": str(row["name"]),
                "age": age_val,
                "nationality": str(row["nationality_clean"]),
                "league_name": str(row["league_name"]),
                "peak_club": str(row["peak_club"]) if pd.notna(row["peak_club"]) else "Unknown",
                "actual_trajectory": actual_traj,
                "pred_trajectory_clean": p_clean,
                "pred_trajectory_leakage": p_leak,
                "actual_value_eur": round(actual_val, 2),
                "pred_value_eur": round(pred_val, 2),
                "residual_eur": round(residual_eur, 2),
                "residual_pct": round(residual_pct, 2),
                "valuation_status": status,
            }
        )

    undervalued = sorted(
        [r for r in rows if r["residual_eur"] > 0],
        key=lambda r: r["residual_eur"],
        reverse=True,
    )[:15]

    overvalued = sorted(
        [r for r in rows if r["residual_eur"] < 0],
        key=lambda r: r["residual_eur"],
    )[:15]

    top_underpredicted_superstars = sorted(
        [r for r in rows if r["actual_value_eur"] >= 40_000_000 and r["residual_eur"] < 0],
        key=lambda r: r["residual_eur"],
    )[:10]

    league_groups: dict[str, list[float]] = {}
    for r in rows:
        league_groups.setdefault(r["league_name"], []).append(r["residual_eur"])

    league_bias = [
        {
            "league": lg,
            "mean_residual_eur": round(float(np.mean(vals)), 2),
            "count": len(vals),
        }
        for lg, vals in sorted(league_groups.items())
    ]

    test_predictions = {
        "rows": rows,
        "undervalued": undervalued,
        "overvalued": overvalued,
        "error_analysis": {
            "leakage_delta_acc": round(float(best_leak_acc - best_clean_acc), 4),
            "growing_vs_stable_confusion_count": growing_vs_stable_confusion,
            "top_underpredicted_superstars": top_underpredicted_superstars,
            "league_bias": league_bias,
        },
    }

    # Index history chronologically per player
    hist_df_sorted = hist_df.sort_values(["player_id", "year", "month"], kind="mergesort")
    history_by_player: dict[str, list[dict[str, Any]]] = {}
    for pid, grp in hist_df_sorted.groupby("player_id", sort=False):
        history_by_player[str(pid)] = [
            {
                "date": str(h["valuation_date"]),
                "value_eur": float(h["value_eur"]) if pd.notna(h["value_eur"]) else 0.0,
                "club": str(h["club"]) if pd.notna(h["club"]) else "Unknown",
                "age_at_date": float(h["age_at_date"]) if pd.notna(h["age_at_date"]) else None,
            }
            for _, h in grp.iterrows()
        ]

    return DashboardArtifacts(
        overview=overview,
        test_predictions=test_predictions,
        players_df=df,
        history_by_player=history_by_player,
        top_nationalities=top_nats,
        best_clean_clf=clean_pipes[best_clean_name],
        best_reg_model=reg_pipes[best_reg_name],
        best_reg_mae=best_reg_mae,
        total_players=int(len(df)),
        history_rows=int(len(hist_df)),
    )
