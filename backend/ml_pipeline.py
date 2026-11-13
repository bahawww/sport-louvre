"""Training, evaluation and inference for Transfermarkt market-value trajectories.

Design (see ARCHITECTURE.md):
- Every feature comes from `features.py`, computed on a history prefix. The CSV summary columns
  (`peak_value_eur`, `value_volatility`, ...) are never used as features: they are computed over
  the full history and therefore contain the target valuation.
- Training data is a panel: for each player and each prefix end i, the target is the valuation
  i+step ahead. Splits are grouped by player; an out-of-time split cuts by target date.
- Three regression tasks: forecast (lags), fundamental (>= 12-month-old state) and profile
  (user-typed fields). One ordinal trajectory classifier per feature view.
- Prediction intervals are conformalized quantile regression (CQR) on the log scale.
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.base import BaseEstimator, ClassifierMixin, RegressorMixin, clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    root_mean_squared_error,
)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

from features import (
    CAT_FEATURES,
    CLASSES,
    DEFAULT_HORIZON_YR,
    FORECAST_NUM_FEATURES,
    FUNDAMENTAL_NUM_FEATURES,
    PROFILE_CAT_FEATURES,
    PROFILE_NUM_FEATURES,
    assemble_row,
    classify_trajectory,
    prefix_features,
    profile_row,
)

# Columns of the player CSV that encode the target valuation. Used only by the Leakage demo.
LEAKAGE_EXTRA_NUM_FEATURES: list[str] = [
    "value_cagr",
    "value_to_peak_cagr",
    "value_multiplier_x",
    "post_peak_decline_pct",
    "mean_yoy_growth_rate",
    "is_at_peak",
]

TOP_N_NATIONALITIES = 12
# Targets are the next valuation update only. Mixing in targets 2 and 4 updates ahead was tested
# and rejected: it blurs the "next update" semantics and made next-update log-RMSE worse than
# the naive last-value baseline (0.31 vs 0.27) in grouped CV.
STEPS: tuple[int, ...] = (1,)
PANEL_START = "2021-01-01"  # training rows need a target date on/after this
OOT_CUTOFF = "2025-01-01"  # out-of-time split: train targets before, test targets on/after
CAL_START = "2024-01-01"  # conformal calibration rows: calibration players, targets on/after
INTERVAL_LEVEL = 0.80
MAX_HORIZON_YR = 1.5  # 99% of training gaps between updates are below ~1.0 year
HORIZON_WARN_YR = 1.0
# 12-month outlook (buy / depreciation-risk lists)
OUTLOOK_MIN_DAYS, OUTLOOK_MAX_DAYS = 300, 480  # target = first valuation in this window
OUTLOOK_START = "2019-01-01"  # training rows need a prefix date on/after this
OUTLOOK_OOT_CUTOFF = "2024-06-01"
OUTLOOK_MOVE = 0.05  # |log return| above this counts as up / down
OUTLOOK_THRESHOLD = 0.70  # calibrated probability needed for a signal
OUTLOOK_MIN_VALUE = 3_000_000
OUTLOOK_CLASSES = ["down", "flat", "up"]
N_SPLITS = 5  # GroupKFold folds for model selection and out-of-fold screening
N_CAL_SPLITS = 3  # grouped folds used to calibrate classifier probabilities
SEED = 42

FORECAST_COLS = FORECAST_NUM_FEATURES + CAT_FEATURES
FUNDAMENTAL_COLS = FUNDAMENTAL_NUM_FEATURES + CAT_FEATURES
PROFILE_COLS = PROFILE_NUM_FEATURES + PROFILE_CAT_FEATURES
POSITION_GROUPS = ["Defender", "Forward", "Goalkeeper", "Midfielder"]


# --------------------------------------------------------------------------- data


def resolve_data_dir() -> Path:
    candidates = [
        Path(os.environ.get("DATA_DIR", "/app/data")),
        Path("/app/data"),
        Path(__file__).resolve().parents[1] / "data" / "Football_Player_Market_Value_Trajectories",
    ]
    for p in candidates:
        if (p / "transfermarkt_player_values.csv").exists():
            return p
    raise FileNotFoundError("Dataset directory not found")


def resolve_data_paths() -> tuple[Path, Path]:
    """Resolve player values and value history CSV paths."""
    env_players = os.environ.get("PLAYERS_CSV")
    env_history = os.environ.get("HISTORY_CSV")
    if env_players and env_history:
        return Path(env_players), Path(env_history)
    d = resolve_data_dir()
    return d / "transfermarkt_player_values.csv", d / "transfermarkt_value_history.csv"


@dataclass
class PlayerSeries:
    values: np.ndarray  # market value in EUR, chronological, > 0
    days: np.ndarray  # day number of each valuation
    ages: np.ndarray  # integer age at each valuation
    dates: list[str]  # ISO date of each valuation


def load_data() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, PlayerSeries], dict[str, Any]]:
    """Load both CSVs, repair the known defects, and index the history per player."""
    players_path, history_path = resolve_data_paths()
    df = pd.read_csv(players_path, encoding="utf-8-sig")
    hist = pd.read_csv(history_path, encoding="utf-8-sig")
    df["player_id"] = df["player_id"].astype(str)
    hist["player_id"] = hist["player_id"].astype(str)

    # The 508 legacy rows have shifted profile columns: `position` holds a euro string and
    # `position_group` is "Other". Apply the sidecar from scripts/repair_legacy_profiles.py.
    broken = df["position"].astype(str).str.startswith("€")
    repaired = 0
    patch_path = players_path.parent / "player_profile_patch.csv"
    if patch_path.exists():
        patch = pd.read_csv(patch_path, dtype=str).set_index("player_id")
        hit = broken & df["player_id"].isin(patch.index)
        df.loc[hit, "position"] = df.loc[hit, "player_id"].map(patch["position"])
        df.loc[hit, "position_group"] = df.loc[hit, "player_id"].map(patch["position_group"])
        repaired = int(hit.sum())
    still_broken = df["position"].astype(str).str.startswith("€")
    df.loc[still_broken, ["position", "position_group"]] = np.nan
    df.loc[~df["position_group"].isin(POSITION_GROUPS), "position_group"] = np.nan

    hist["_dt"] = pd.to_datetime(hist["valuation_date"], format="%d/%m/%Y", errors="coerce")
    dropped = int((hist["value_eur"] <= 0).sum() + hist["_dt"].isna().sum())
    hist = hist[(hist["value_eur"] > 0) & hist["_dt"].notna()].copy()
    hist = hist.sort_values(["player_id", "_dt"], kind="mergesort").reset_index(drop=True)
    hist["_day"] = (hist["_dt"] - pd.Timestamp("2000-01-01")).dt.days

    series: dict[str, PlayerSeries] = {}
    for pid, grp in hist.groupby("player_id", sort=False):
        series[str(pid)] = PlayerSeries(
            values=grp["value_eur"].to_numpy(dtype=float),
            days=grp["_day"].to_numpy(dtype=float),
            ages=grp["age_at_date"].to_numpy(dtype=float),
            dates=grp["_dt"].dt.strftime("%Y-%m-%d").tolist(),
        )

    # `age` is corrupt in ~46% of legacy rows; age at the last valuation is reliable.
    age_fixed = int((df["age"] != df["player_id"].map(lambda p: series[p].ages[-1])).sum())
    df["age"] = df["player_id"].map(lambda p: float(series[p].ages[-1]))

    nat = df["nationality"].fillna("").astype(str).str.strip()
    top_nats = set(nat[nat != ""].value_counts().head(TOP_N_NATIONALITIES).index.tolist())
    df["nationality_grouped"] = nat.apply(lambda n: n if n in top_nats else "Other")
    df["nationality_clean"] = nat.apply(lambda n: n if n else "Unknown")

    repairs = {
        "legacy_rows_with_broken_position": int(broken.sum()),
        "positions_repaired_from_sidecar": repaired,
        "positions_still_unknown": int(still_broken.sum()),
        "age_values_replaced_from_history": age_fixed,
        "history_rows_dropped_nonpositive": dropped,
        "top_nationalities": sorted(top_nats),
    }
    return df, hist, series, repairs


def player_static(row: pd.Series) -> dict[str, Any]:
    return {
        "league_name": row["league_name"],
        "nationality": row["nationality_grouped"],
        "position": row["position"] if pd.notna(row["position"]) else np.nan,
        "position_group": row["position_group"] if pd.notna(row["position_group"]) else np.nan,
    }


def build_panel(
    df: pd.DataFrame, series: dict[str, PlayerSeries], steps: tuple[int, ...] = STEPS
) -> pd.DataFrame:
    """One row per (player, prefix end i, step): features from v[:i+1], target v[i+step]."""
    rows: list[dict[str, Any]] = []
    for _, prow in df.iterrows():
        pid = prow["player_id"]
        s = series[pid]
        static = player_static(prow)
        n = len(s.values)
        for i in range(n - 1):
            pf = prefix_features(s.values[: i + 1], s.days[: i + 1], s.ages[: i + 1])
            for step in steps:
                j = i + step
                if j >= n:
                    continue
                row = assemble_row(pf, (s.days[j] - s.days[i]) / 365.25, static)
                row["player_id"] = pid
                row["step"] = step
                row["target_value"] = float(s.values[j])
                row["target_date"] = s.dates[j]
                row["label"] = classify_trajectory(float(s.values[j]), float(s.values[:j].max()))
                row["is_final"] = bool(step == 1 and j == n - 1)
                rows.append(row)
    panel = pd.DataFrame(rows)
    for cat in CAT_FEATURES:
        panel[cat] = panel[cat].astype(object).where(panel[cat].notna(), np.nan)
    return panel


def build_outlook_panel(
    df: pd.DataFrame, series: dict[str, PlayerSeries]
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Rows for the 12-month outlook task.

    history: every prefix that has a valuation 300-480 days later (the target).
    current: each player's full history, horizon pinned to one year, no target (to be scored).
    """
    history: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    for _, prow in df.iterrows():
        pid = prow["player_id"]
        s = series[pid]
        static = player_static(prow)
        n = len(s.values)
        for i in range(n):
            j = int(np.searchsorted(s.days, s.days[i] + OUTLOOK_MIN_DAYS))
            has_target = j < n and s.days[j] - s.days[i] <= OUTLOOK_MAX_DAYS
            if not has_target and i != n - 1:
                continue
            pf = prefix_features(s.values[: i + 1], s.days[: i + 1], s.ages[: i + 1])
            if has_target:
                row = assemble_row(pf, (s.days[j] - s.days[i]) / 365.25, static)
                row.update(
                    player_id=pid,
                    date=s.dates[i],
                    target_value=float(s.values[j]),
                    target_date=s.dates[j],
                )
                history.append(row)
            if i == n - 1:
                row = assemble_row(pf, 1.0, static)
                row.update(player_id=pid, date=s.dates[i])
                current.append(row)
    frames = []
    for rows in (history, current):
        frame = pd.DataFrame(rows)
        for cat in CAT_FEATURES:
            frame[cat] = frame[cat].astype(object).where(frame[cat].notna(), np.nan)
        frames.append(frame)
    hist_df, cur_df = frames
    ret = np.log(hist_df["target_value"]) - np.log(hist_df["last_value_eur"])
    hist_df["log_return"] = ret
    hist_df["direction"] = np.where(
        ret > OUTLOOK_MOVE, "up", np.where(ret < -OUTLOOK_MOVE, "down", "flat")
    )
    return hist_df, cur_df


@dataclass
class OutlookModel:
    """12-month outlook: calibrated P(down/flat/up), point value and conformal range."""

    clf: Any
    reg: Any
    ci: "ConformalInterval"

    def predict(self, X: pd.DataFrame) -> pd.DataFrame:
        proba = self.clf.predict_proba(X[FORECAST_COLS])
        idx = {c: k for k, c in enumerate(self.clf.classes_)}
        value = self.reg.predict(X[FORECAST_COLS])
        lo, hi = self.ci.interval(X[FORECAST_COLS], value)
        return pd.DataFrame(
            {
                "p_up": proba[:, idx["up"]],
                "p_down": proba[:, idx["down"]],
                "value": value,
                "lo": lo,
                "hi": hi,
            },
            index=X.index,
        )


def fit_outlook(train: pd.DataFrame) -> OutlookModel:
    groups = train["player_id"].to_numpy()
    clf = GroupCalibratedClassifier(estimator=_hgb_clf(FORECAST_NUM_FEATURES, CAT_FEATURES))
    clf.fit(train[FORECAST_COLS], train["direction"], groups=groups)
    reg = AnchoredLogRegressor(_hgb_reg(FORECAST_NUM_FEATURES, CAT_FEATURES), "log_last")
    reg.fit(train[FORECAST_COLS], train["target_value"])
    fit_idx, cal_idx = next(
        GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED).split(train, groups=groups)
    )
    cal = train.iloc[cal_idx]
    cal = cal[cal["date"] >= sorted(cal["date"])[len(cal) // 2]]  # recent half of calibration rows
    ci = fit_conformal("forecast", FORECAST_COLS, train.iloc[fit_idx], cal)
    return OutlookModel(clf=clf, reg=reg, ci=ci)


def outlook_signal(p_up: float, p_down: float) -> str:
    if p_up >= OUTLOOK_THRESHOLD:
        return "Buy"
    if p_down >= OUTLOOK_THRESHOLD:
        return "DepreciationRisk"
    return "Neutral"


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.corrcoef(pd.Series(a).rank(), pd.Series(b).rank())[0, 1])


def validate_outlook(history: pd.DataFrame) -> dict[str, Any]:
    """Out-of-time check: fit on targets before the cutoff, score prefixes on/after it."""
    recent = history[history["date"] >= OUTLOOK_START]
    train = recent[recent["target_date"] < OUTLOOK_OOT_CUTOFF]
    test = recent[recent["date"] >= OUTLOOK_OOT_CUTOFF]
    pred = fit_outlook(train).predict(test)
    current = test["last_value_eur"].to_numpy()
    actual = test["target_value"].to_numpy()
    direction = test["direction"].to_numpy()
    liquid = current >= OUTLOOK_MIN_VALUE
    buy = liquid & (pred["p_up"].to_numpy() >= OUTLOOK_THRESHOLD)
    risk = liquid & (pred["p_down"].to_numpy() >= OUTLOOK_THRESHOLD)
    # The rule this replaces: "the price fell a lot, so it is cheap".
    fell = (test["has_anchor"].to_numpy() == 1) & (
        np.log(current)
        - (test["anc_log_ratio_peak"].to_numpy() + np.log(test["peak_value_eur"].to_numpy()))
        < np.log(0.6)
    )
    share = lambda mask, cls: round(float((direction[mask] == cls).mean()), 4) if mask.any() else None
    med = lambda mask: round(float(np.median(np.log(actual[mask] / current[mask]))), 4) if mask.any() else None
    return {
        "cutoff": OUTLOOK_OOT_CUTOFF,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "test_players": int(test["player_id"].nunique()),
        "rank_correlation": round(
            _spearman(np.log(pred["value"].to_numpy() / current), test["log_return"].to_numpy()), 4
        ),
        "interval_coverage": round(
            float(((actual >= pred["lo"].to_numpy()) & (actual <= pred["hi"].to_numpy())).mean()), 4
        ),
        "base_rate": {"up": share(liquid, "up"), "down": share(liquid, "down"), "n": int(liquid.sum())},
        "buy": {"n": int(buy.sum()), "went_up": share(buy, "up"), "went_down": share(buy, "down"),
                "median_log_return": med(buy)},
        "depreciation_risk": {"n": int(risk.sum()), "went_down": share(risk, "down"),
                              "went_up": share(risk, "up"), "median_log_return": med(risk)},
        "fell_over_40pct_prior_12m": {"n": int(fell.sum()), "went_up": share(fell, "up"),
                                      "went_down": share(fell, "down"), "median_log_return": med(fell)},
    }


# --------------------------------------------------------------------------- estimators


def _tree_prep(num: list[str], cat: list[str]) -> ColumnTransformer:
    enc = OrdinalEncoder(
        handle_unknown="use_encoded_value", unknown_value=np.nan, encoded_missing_value=np.nan
    )
    return ColumnTransformer([("num", "passthrough", num), ("cat", enc, cat)])


def _linear_prep(num: list[str], cat: list[str]) -> ColumnTransformer:
    num_pipe = Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())])
    cat_pipe = Pipeline(
        [
            ("imp", SimpleImputer(strategy="constant", fill_value="Unknown")),
            ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    return ColumnTransformer([("num", num_pipe, num), ("cat", cat_pipe, cat)])


def _hgb_reg(num: list[str], cat: list[str], quantile: float | None = None) -> Pipeline:
    kw: dict[str, Any] = {"loss": "quantile", "quantile": quantile} if quantile else {}
    model = HistGradientBoostingRegressor(
        max_iter=400,
        learning_rate=0.05,
        max_leaf_nodes=15,
        min_samples_leaf=40,
        l2_regularization=1.0,
        categorical_features=list(range(len(num), len(num) + len(cat))),
        early_stopping=True,
        n_iter_no_change=20,
        random_state=SEED,
        **kw,
    )
    return Pipeline([("prep", _tree_prep(num, cat)), ("model", model)])


def _hgb_clf(num: list[str], cat: list[str]) -> Pipeline:
    model = HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.06,
        max_leaf_nodes=15,
        min_samples_leaf=40,
        l2_regularization=1.0,
        categorical_features=list(range(len(num), len(num) + len(cat))),
        early_stopping=True,
        n_iter_no_change=15,
        random_state=SEED,
    )
    return Pipeline([("prep", _tree_prep(num, cat)), ("model", model)])


class AnchoredLogRegressor(BaseEstimator, RegressorMixin):
    """Regress log1p(value) relative to a per-row log anchor (e.g. the last known price).

    Trees cannot extrapolate levels, so the model learns the log change from the anchor instead.
    `predict` returns euros, `predict_log` returns log1p(euros).
    """

    def __init__(self, estimator: Any = None, anchor: str | None = None):
        self.estimator = estimator
        self.anchor = anchor

    def _base(self, X: pd.DataFrame) -> np.ndarray:
        if self.anchor is None:
            return np.zeros(len(X))
        return X[self.anchor].fillna(self.fill_).to_numpy(dtype=float)

    def fit(self, X: pd.DataFrame, y: Any) -> "AnchoredLogRegressor":
        y_log = np.log1p(np.asarray(y, dtype=float))
        self.fill_ = float(np.median(y_log))
        self.estimator_ = clone(self.estimator).fit(X, y_log - self._base(X))
        return self

    def predict_log(self, X: pd.DataFrame) -> np.ndarray:
        return self.estimator_.predict(X) + self._base(X)

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.maximum(np.expm1(self.predict_log(X)), 0.0)


class NaiveAnchorRegressor(BaseEstimator, RegressorMixin):
    """Persistence baseline: predicted value = the anchor (last known price)."""

    def __init__(self, anchor: str = "log_last"):
        self.anchor = anchor

    def fit(self, X: pd.DataFrame, y: Any) -> "NaiveAnchorRegressor":
        return self

    def predict_log(self, X: pd.DataFrame) -> np.ndarray:
        return X[self.anchor].to_numpy(dtype=float)

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.expm1(self.predict_log(X))


class OrdinalClassifier(BaseEstimator, ClassifierMixin):
    """Frank & Hall ordinal decomposition with calibrated cumulative probabilities.

    The five trajectory classes are ordered by drawdown, so K-1 binary models estimate
    P(rank > k). Each is calibrated out-of-fold (folds grouped by player), then the cumulative
    curve is made monotone and differenced into class probabilities.
    """

    def __init__(
        self,
        estimator: Any = None,
        classes: tuple[str, ...] = tuple(CLASSES),
        method: str = "isotonic",
        n_splits: int = N_CAL_SPLITS,
    ):
        self.estimator = estimator
        self.classes = classes
        self.method = method
        self.n_splits = n_splits

    def fit(self, X: pd.DataFrame, y: Any, groups: Any = None) -> "OrdinalClassifier":
        self.classes_ = np.array(self.classes)
        rank = pd.Series(np.asarray(y)).map({c: i for i, c in enumerate(self.classes)}).to_numpy()
        cv: Any = self.n_splits
        if groups is not None:
            cv = list(GroupKFold(self.n_splits).split(X, rank, groups))
        self.models_ = []
        for k in range(len(self.classes) - 1):
            m = CalibratedClassifierCV(clone(self.estimator), method=self.method, cv=cv)
            self.models_.append(m.fit(X, (rank > k).astype(int)))
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        cum = np.column_stack([m.predict_proba(X)[:, 1] for m in self.models_])
        cum = np.minimum.accumulate(cum, axis=1)
        full = np.hstack([np.ones((len(cum), 1)), cum, np.zeros((len(cum), 1))])
        proba = np.clip(full[:, :-1] - full[:, 1:], 0.0, 1.0)
        return proba / proba.sum(axis=1, keepdims=True)

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.classes_[self.predict_proba(X).argmax(axis=1)]


class GroupCalibratedClassifier(BaseEstimator, ClassifierMixin):
    """Multinomial classifier with out-of-fold calibration, folds grouped by player."""

    def __init__(
        self, estimator: Any = None, method: str = "isotonic", n_splits: int = N_CAL_SPLITS
    ):
        self.estimator = estimator
        self.method = method
        self.n_splits = n_splits

    def fit(self, X: pd.DataFrame, y: Any, groups: Any = None) -> "GroupCalibratedClassifier":
        cv: Any = self.n_splits
        if groups is not None:
            cv = list(GroupKFold(self.n_splits).split(X, y, groups))
        self.model_ = CalibratedClassifierCV(clone(self.estimator), method=self.method, cv=cv)
        self.model_.fit(X, y)
        self.classes_ = self.model_.classes_
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.model_.predict_proba(X)

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.model_.predict(X)


class PersistenceClassifier(BaseEstimator, ClassifierMixin):
    """Baseline: the class the player would get if the next valuation equals the last one."""

    def fit(self, X: pd.DataFrame, y: Any, groups: Any = None) -> "PersistenceClassifier":
        self.classes_ = np.array(CLASSES)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        dd = X["dd_last"].to_numpy(dtype=float) * 100.0
        out = np.full(len(X), "falling_sharply", dtype=object)
        out[dd < 60.0] = "declining"
        out[dd < 30.0] = "stable"
        out[dd < 20.0] = "growing"
        return out

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        pred = self.predict(X)
        proba = np.full((len(X), len(CLASSES)), 0.02)
        for k, c in enumerate(CLASSES):
            proba[pred == c, k] = 0.92
        return proba


def _fit(est: Any, X: pd.DataFrame, y: Any, groups: Any) -> Any:
    """Fit, passing player groups to estimators that calibrate out-of-fold."""
    if isinstance(est, (OrdinalClassifier, GroupCalibratedClassifier, PersistenceClassifier)):
        return est.fit(X, y, groups=groups)
    return est.fit(X, y)


def classifier_specs(num: list[str], cat: list[str], full: bool = True) -> dict[str, Any]:
    specs: dict[str, Any] = {
        "Ordinal HGB (calibrated)": OrdinalClassifier(estimator=_hgb_clf(num, cat)),
        "HistGradientBoosting (calibrated)": GroupCalibratedClassifier(
            estimator=_hgb_clf(num, cat)
        ),
    }
    if full:
        specs["Logistic Regression"] = Pipeline(
            [("prep", _linear_prep(num, cat)), ("model", LogisticRegression(max_iter=500, C=1.0))]
        )
        specs["Random Forest"] = Pipeline(
            [
                ("prep", _linear_prep(num, cat)),
                (
                    "model",
                    RandomForestClassifier(
                        n_estimators=200, min_samples_leaf=5, n_jobs=-1, random_state=SEED
                    ),
                ),
            ]
        )
        specs["Persistence (last state)"] = PersistenceClassifier()
    return specs


def regressor_specs(task: str) -> dict[str, Any]:
    if task == "forecast":
        num, cat, anchor = FORECAST_NUM_FEATURES, CAT_FEATURES, "log_last"
    elif task == "fundamental":
        num, cat, anchor = FUNDAMENTAL_NUM_FEATURES, CAT_FEATURES, "anc_log_peak"
    else:
        num, cat, anchor = PROFILE_NUM_FEATURES, PROFILE_CAT_FEATURES, "log_peak"
    specs: dict[str, Any] = {
        "HistGradientBoosting (log)": AnchoredLogRegressor(_hgb_reg(num, cat), anchor),
        "Ridge (log)": AnchoredLogRegressor(
            Pipeline([("prep", _linear_prep(num, cat)), ("model", Ridge(alpha=1.0))]), anchor
        ),
    }
    if task == "forecast":
        specs["Naive (last value)"] = NaiveAnchorRegressor("log_last")
    return specs


# --------------------------------------------------------------------------- metrics


def proba_in_order(est: Any, X: pd.DataFrame) -> np.ndarray:
    """Class probabilities with columns in `CLASSES` order."""
    proba = est.predict_proba(X)
    idx = {c: i for i, c in enumerate(est.classes_)}
    return np.column_stack(
        [proba[:, idx[c]] if c in idx else np.zeros(len(proba)) for c in CLASSES]
    )


def expected_calibration_error(proba: np.ndarray, y_idx: np.ndarray, bins: int = 10) -> float:
    conf = proba.max(axis=1)
    hit = (proba.argmax(axis=1) == y_idx).astype(float)
    ece = 0.0
    for lo in np.linspace(0.0, 1.0, bins + 1)[:-1]:
        m = (conf > lo) & (conf <= lo + 1.0 / bins)
        if m.any():
            ece += m.mean() * abs(hit[m].mean() - conf[m].mean())
    return float(ece)


def clf_metrics(proba: np.ndarray, y: Any) -> dict[str, Any]:
    y = np.asarray(y)
    y_idx = np.array([CLASSES.index(c) for c in y])
    pred_idx = proba.argmax(axis=1)
    pred = np.array(CLASSES)[pred_idx]
    onehot = np.eye(len(CLASSES))[y_idx]
    p = np.clip(proba, 1e-9, 1.0)
    p = p / p.sum(axis=1, keepdims=True)
    return {
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "macro_f1": round(float(f1_score(y, pred, average="macro", zero_division=0)), 4),
        "f1_weighted": round(float(f1_score(y, pred, average="weighted", zero_division=0)), 4),
        "precision_weighted": round(
            float(precision_score(y, pred, average="weighted", zero_division=0)), 4
        ),
        "recall_weighted": round(
            float(recall_score(y, pred, average="weighted", zero_division=0)), 4
        ),
        "ece": round(expected_calibration_error(proba, y_idx), 4),
        "brier": round(float(((proba - onehot) ** 2).sum(axis=1).mean()), 4),
        "log_loss": round(float(log_loss(y_idx, p, labels=list(range(len(CLASSES))))), 4),
        "ordinal_mae": round(float(np.abs(pred_idx - y_idx).mean()), 4),
        "confusion_matrix": confusion_matrix(y, pred, labels=CLASSES).tolist(),
    }


def reg_metrics(y: Any, pred: Any) -> dict[str, float]:
    y = np.asarray(y, dtype=float)
    pred = np.maximum(np.asarray(pred, dtype=float), 0.0)
    ly, lp = np.log1p(y), np.log1p(pred)
    return {
        "mae": round(float(mean_absolute_error(y, pred)), 2),
        "rmse": round(float(root_mean_squared_error(y, pred)), 2),
        "r2": round(float(r2_score(y, pred)), 4),
        "mae_log": round(float(mean_absolute_error(ly, lp)), 4),
        "rmse_log": round(float(root_mean_squared_error(ly, lp)), 4),
        "r2_log": round(float(r2_score(ly, lp)), 4),
        "medape": round(float(np.median(np.abs(pred - y) / np.maximum(y, 1.0))), 4),
    }


def _permutation_importance(
    score: Callable[[pd.DataFrame], float], X: pd.DataFrame, repeats: int = 3
) -> list[dict[str, Any]]:
    """Share of the score lost when one feature is shuffled (higher score = better)."""
    rng = np.random.default_rng(SEED)
    base = score(X)
    drops: dict[str, float] = {}
    for col in X.columns:
        vals = []
        for _ in range(repeats):
            Xp = X.copy()
            Xp[col] = rng.permutation(Xp[col].to_numpy())
            vals.append(base - score(Xp))
        drops[col] = max(0.0, float(np.mean(vals)))
    total = sum(drops.values())
    ranked = sorted(drops.items(), key=lambda kv: kv[1], reverse=True)
    return [
        {"feature": f, "importance": round(v / total, 4) if total > 0 else 0.0} for f, v in ranked
    ]


def _clf_importance(est: Any, X: pd.DataFrame, y: Any) -> list[dict[str, Any]]:
    y_idx = np.array([CLASSES.index(c) for c in np.asarray(y)])

    def score(Xp: pd.DataFrame) -> float:
        p = np.clip(proba_in_order(est, Xp), 1e-9, 1.0)
        return -float(log_loss(y_idx, p / p.sum(axis=1, keepdims=True), labels=list(range(5))))

    return _permutation_importance(score, X)


def _reg_importance(est: Any, X: pd.DataFrame, y: Any) -> list[dict[str, Any]]:
    y_log = np.log1p(np.asarray(y, dtype=float))
    return _permutation_importance(
        lambda Xp: -float(np.abs(est.predict_log(Xp) - y_log).mean()), X
    )


def _mean_std(items: list[dict[str, Any]], keys: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for k in keys:
        vals = [m[k] for m in items]
        out[f"{k}_mean"] = round(float(np.mean(vals)), 4)
        out[f"{k}_std"] = round(float(np.std(vals)), 4)
    return out


# --------------------------------------------------------------------------- conformal


@dataclass
class ConformalInterval:
    """Conformalized quantile regression (CQR) on log1p(value)."""

    lo: Any
    hi: Any
    q_hat: float  # conformal correction added to both quantile predictions (log scale)
    level: float
    n_calibration: int

    def interval_log(self, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        lo, hi = self.lo.predict_log(X), self.hi.predict_log(X)
        return np.minimum(lo, hi) - self.q_hat, np.maximum(lo, hi) + self.q_hat

    def interval(
        self, X: pd.DataFrame, point: np.ndarray | None = None
    ) -> tuple[np.ndarray, np.ndarray]:
        lo, hi = self.interval_log(X)
        lo, hi = np.maximum(np.expm1(lo), 0.0), np.expm1(hi)
        if point is not None:
            lo, hi = np.minimum(lo, point), np.maximum(hi, point)
        return lo, hi


def fit_conformal(
    task: str,
    cols: list[str],
    fit_df: pd.DataFrame,
    cal_df: pd.DataFrame,
    level: float = INTERVAL_LEVEL,
) -> ConformalInterval:
    """Quantile models on `fit_df`; conformal correction from players never seen by them."""
    num = [c for c in cols if c not in CAT_FEATURES]
    cat = [c for c in cols if c in CAT_FEATURES]
    anchor = {"forecast": "log_last", "fundamental": "anc_log_peak"}.get(task, "log_peak")
    alpha = 1.0 - level
    lo = AnchoredLogRegressor(_hgb_reg(num, cat, alpha / 2), anchor)
    hi = AnchoredLogRegressor(_hgb_reg(num, cat, 1 - alpha / 2), anchor)
    lo.fit(fit_df[cols], fit_df["target_value"])
    hi.fit(fit_df[cols], fit_df["target_value"])
    y = np.log1p(cal_df["target_value"].to_numpy(dtype=float))
    a, b = lo.predict_log(cal_df[cols]), hi.predict_log(cal_df[cols])
    scores = np.maximum(np.minimum(a, b) - y, y - np.maximum(a, b))
    rank = min(1.0, np.ceil((len(scores) + 1) * level) / len(scores))
    q_hat = float(np.quantile(scores, rank, method="higher"))
    return ConformalInterval(lo=lo, hi=hi, q_hat=q_hat, level=level, n_calibration=len(scores))


def interval_report(ci: ConformalInterval, X: pd.DataFrame, y: np.ndarray) -> dict[str, Any]:
    lo, hi = ci.interval(X)
    inside = (y >= lo) & (y <= hi)
    return {
        "level": ci.level,
        "coverage": round(float(inside.mean()), 4),
        "median_width_ratio": round(float(np.median(hi / np.maximum(lo, 1.0))), 3),
        "n": int(len(y)),
    }


def valuation_status(
    market: float, fair_lo: float, fair_hi: float, row: Any
) -> tuple[str, str]:
    """(status, basis) of a market price against the fundamental fair-value band.

    The fundamental model cannot see the last 12 months. Two cases are therefore not judged:
    - short_history: no valuation older than 12 months, the estimate rests on age/position/league;
    - breakout: the price is above the band *and* the player set a new all-time high inside the
      hidden window. That re-rating may be earned on the pitch; price data cannot tell.
    """
    if not row["has_anchor"]:
        return "Fair", "short_history"
    if market > fair_hi:
        recent_peak = max(float(np.expm1(row["log_peak"])), market)
        if recent_peak > float(np.expm1(row["anc_log_peak"])) * 1.0001:
            return "Fair", "breakout"
        return "Overvalued", "ok"
    if market < fair_lo:
        return "Undervalued", "ok"
    return "Fair", "ok"


def fixed_horizon_frame(
    pids: list[str], series: dict[str, "PlayerSeries"], static: dict[str, dict[str, Any]]
) -> pd.DataFrame:
    """Backtest rows of the last update with the horizon pinned to the default.

    The scored rows use the real gap to the update being predicted, which a forecaster would
    not know. This frame removes that knowledge.
    """
    rows = []
    for pid in pids:
        s = series[pid]
        pf = prefix_features(s.values[:-1], s.days[:-1], s.ages[:-1])
        rows.append(assemble_row(pf, DEFAULT_HORIZON_YR, static[pid]))
    frame = pd.DataFrame(rows)
    for cat in CAT_FEATURES:
        frame[cat] = frame[cat].astype(object).where(frame[cat].notna(), np.nan)
    return frame


# --------------------------------------------------------------------------- artifacts


@dataclass
class DashboardArtifacts:
    """Trained models, precomputed API payloads and indexed data."""

    overview: dict[str, Any]
    test_predictions: dict[str, Any]
    players_df: pd.DataFrame
    history_by_player: dict[str, list[dict[str, Any]]]
    top_nationalities: set[str]
    series: dict[str, PlayerSeries]
    static: dict[str, dict[str, Any]]
    clf_forecast: Any
    clf_profile: Any
    reg_forecast: Any
    reg_fundamental: Any
    reg_profile: Any
    ci_forecast: ConformalInterval
    ci_fundamental: ConformalInterval
    ci_profile: ConformalInterval
    model_names: dict[str, str]
    group_weights: dict[str, float]
    train_player_ids: set[str]
    test_matrix: pd.DataFrame  # final rows of the test players, exactly as scored
    total_players: int
    history_rows: int
    extra: dict[str, Any] = field(default_factory=dict)

    # Kept for older callers.
    @property
    def best_clean_clf(self) -> Any:
        return self.clf_forecast

    @property
    def best_reg_model(self) -> Any:
        return self.reg_forecast


def _cv_select(
    specs: dict[str, Any],
    cols: list[str],
    train: pd.DataFrame,
    kind: str,
    log: Callable[[str], None],
) -> tuple[dict[str, dict[str, float]], str]:
    """GroupKFold by player on the training players; score on held-out players' final rows."""
    groups = train["player_id"].to_numpy()
    target = "label" if kind == "clf" else "target_value"
    per_model: dict[str, list[dict[str, Any]]] = {name: [] for name in specs}
    for tr_idx, va_idx in GroupKFold(N_SPLITS).split(train, groups=groups):
        tr = train.iloc[tr_idx]
        va = train.iloc[va_idx]
        va = va[va["is_final"]]
        for name, spec in specs.items():
            est = _fit(clone(spec), tr[cols], tr[target], tr["player_id"].to_numpy())
            if kind == "clf":
                per_model[name].append(clf_metrics(proba_in_order(est, va[cols]), va[target]))
            else:
                per_model[name].append(reg_metrics(va[target], est.predict(va[cols])))
    keys = (
        ["accuracy", "macro_f1", "log_loss", "brier", "ece"]
        if kind == "clf"
        else ["mae", "rmse", "r2", "mae_log", "rmse_log", "r2_log"]
    )
    summary = {name: _mean_std(ms, keys) for name, ms in per_model.items()}
    crit = "log_loss_mean" if kind == "clf" else "rmse_log_mean"
    candidates = {n: s for n, s in summary.items() if not n.startswith(("Persistence", "Naive"))}
    best = min(candidates, key=lambda n: candidates[n][crit])
    log(f"cv {kind} ({len(cols)} features): best={best}")
    return summary, best


def train_all(log: Callable[[str], None] = print) -> DashboardArtifacts:
    t0 = time.time()
    df, hist, series, repairs = load_data()
    panel = build_panel(df, series)
    log(f"panel rows={len(panel)} ({time.time() - t0:.0f}s)")

    # Same stratified 80:20 player split as the previous pipeline (comparable test set).
    train_idx, test_idx = train_test_split(
        df.index, test_size=0.2, random_state=SEED, stratify=df["trajectory"]
    )
    train_pids = set(df.loc[train_idx, "player_id"])
    test_pids = set(df.loc[test_idx, "player_id"])

    in_train = panel["player_id"].isin(train_pids)
    recent = panel["target_date"] >= PANEL_START
    train = panel[in_train & (recent | panel["is_final"])].reset_index(drop=True)
    order = {pid: k for k, pid in enumerate(df.loc[test_idx, "player_id"])}
    test = panel[panel["player_id"].isin(test_pids) & panel["is_final"]].copy()
    test = test.sort_values("player_id", key=lambda s: s.map(order)).reset_index(drop=True)
    groups = train["player_id"].to_numpy()
    y_test = test["target_value"].to_numpy()

    final_labels = panel[panel["is_final"]].set_index("player_id")["label"]
    label_match = float(
        (final_labels.reindex(df["player_id"]).to_numpy() == df["trajectory"].to_numpy()).mean()
    )

    # ---- classification (forecast view) ------------------------------------------------
    clf_specs = classifier_specs(FORECAST_NUM_FEATURES, CAT_FEATURES)
    clf_cv, best_clf = _cv_select(clf_specs, FORECAST_COLS, train, "clf", log)
    clf_models: dict[str, Any] = {}
    clean_rows: list[dict[str, Any]] = []
    for name, spec in clf_specs.items():
        est = _fit(clone(spec), train[FORECAST_COLS], train["label"], groups)
        clf_models[name] = est
        m = clf_metrics(proba_in_order(est, test[FORECAST_COLS]), test["label"])
        m["name"] = name
        m["feature_importance"] = (
            _clf_importance(est, test[FORECAST_COLS], test["label"]) if name == best_clf else []
        )
        clean_rows.append(m)
    static_map = {row["player_id"]: player_static(row) for _, row in df.iterrows()}
    test_fixed = fixed_horizon_frame(test["player_id"].tolist(), series, static_map)
    fixed_clf = {
        name: clf_metrics(proba_in_order(est, test_fixed[FORECAST_COLS]), test["label"])
        for name, est in clf_models.items()
    }
    for m in fixed_clf.values():
        m.pop("confusion_matrix")
    log(f"classifiers done ({time.time() - t0:.0f}s)")

    # Leakage demo: same final rows plus the CSV columns that encode the target valuation.
    leak_cols = FORECAST_COLS + LEAKAGE_EXTRA_NUM_FEATURES
    csv_leak = df.set_index("player_id")[LEAKAGE_EXTRA_NUM_FEATURES].astype(float)
    leak_train = train[train["is_final"]].join(csv_leak, on="player_id")
    leak_test = test.join(csv_leak, on="player_id")
    leak_num = FORECAST_NUM_FEATURES + LEAKAGE_EXTRA_NUM_FEATURES
    leak_specs = classifier_specs(leak_num, CAT_FEATURES)  # same model names as clean mode
    leak_rows: list[dict[str, Any]] = []
    leak_preds: dict[str, np.ndarray] = {}
    leak_models: dict[str, Any] = {}
    leak_groups = leak_train["player_id"].to_numpy()
    for name, spec in leak_specs.items():
        est = _fit(clone(spec), leak_train[leak_cols], leak_train["label"], leak_groups)
        proba = proba_in_order(est, leak_test[leak_cols])
        m = clf_metrics(proba, leak_test["label"])
        m["name"] = name
        m["feature_importance"] = []
        leak_rows.append(m)
        leak_models[name] = est
        leak_preds[name] = np.array(CLASSES)[proba.argmax(axis=1)]
    leak_candidates = [m for m in leak_rows if not m["name"].startswith("Persistence")]
    best_leak_row = max(leak_candidates, key=lambda m: (m["accuracy"], m["macro_f1"]))
    best_leak = best_leak_row["name"]
    best_leak_row["feature_importance"] = _clf_importance(
        leak_models[best_leak], leak_test[leak_cols], leak_test["label"]
    )

    # ---- regression tasks --------------------------------------------------------------
    fit_idx, cal_idx = next(
        GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED).split(train, groups=groups)
    )
    fit_df = train.iloc[fit_idx]
    cal_df = train.iloc[cal_idx]
    cal_df = cal_df[cal_df["target_date"] >= CAL_START]

    task_cols = {"forecast": FORECAST_COLS, "fundamental": FUNDAMENTAL_COLS, "profile": PROFILE_COLS}
    reg_tasks: dict[str, dict[str, Any]] = {}
    reg_best: dict[str, Any] = {}
    reg_ci: dict[str, ConformalInterval] = {}
    reg_pred: dict[str, np.ndarray] = {}
    for task, cols in task_cols.items():
        specs = regressor_specs(task)
        cv, best = _cv_select(specs, cols, train, "reg", log)
        rows = []
        fixed_reg: dict[str, Any] = {}
        slice_reg: dict[str, Any] = {}
        big = y_test >= 50_000_000
        for name, spec in specs.items():
            est = clone(spec).fit(train[cols], train["target_value"])
            pred = est.predict(test[cols])
            m: dict[str, Any] = reg_metrics(y_test, pred)
            fixed_reg[name] = reg_metrics(y_test, est.predict(test_fixed[cols]))
            slice_reg[name] = {**reg_metrics(y_test[big], pred[big]), "n": int(big.sum())}
            m["name"] = name
            m["feature_importance"] = (
                _reg_importance(est, test[cols], y_test) if name == best else []
            )
            rows.append(m)
            if name == best:
                reg_best[task] = est
                reg_pred[task] = est.predict(test[cols])
        ci = fit_conformal(task, cols, fit_df, cal_df)
        reg_ci[task] = ci
        reg_tasks[task] = {
            "models": rows,
            "best_model": best,
            "features": cols,
            "validation": {
                "group_kfold": cv,
                "fixed_horizon": fixed_reg,
                "holdout_value_ge_50m": slice_reg,
            },
            "intervals": {
                "method": "CQR (conformalized quantile regression) on the log scale",
                "holdout": interval_report(ci, test[cols], y_test),
                "q_hat_log": round(ci.q_hat, 4),
                "n_calibration": ci.n_calibration,
            },
        }
        log(f"regression {task} done ({time.time() - t0:.0f}s)")

    # Naive persistence scored next to the fundamental/profile models: the anti-tautology number.
    naive = reg_metrics(y_test, np.expm1(test["log_last"].to_numpy()))
    for task in ("fundamental", "profile"):
        reg_tasks[task]["reference_naive_last_value"] = naive
    # How much of the *latest price* can the fundamental features reconstruct?
    probe = AnchoredLogRegressor(
        _hgb_reg(FUNDAMENTAL_NUM_FEATURES, CAT_FEATURES), "anc_log_peak"
    ).fit(train[FUNDAMENTAL_COLS], np.expm1(train["log_last"]))
    probe_m = reg_metrics(np.expm1(test["log_last"]), probe.predict(test[FUNDAMENTAL_COLS]))
    reg_tasks["fundamental"]["tautology_probe"] = {
        "question": "R2/MAPE when predicting the last known price from fundamental features",
        "r2_log": probe_m["r2_log"],
        "medape": probe_m["medape"],
    }

    # ---- profile classifier ------------------------------------------------------------
    # Same model family as the selected main classifier; no separate selection round.
    prof_specs = classifier_specs(PROFILE_NUM_FEATURES, PROFILE_CAT_FEATURES, full=False)
    best_prof = best_clf if best_clf in prof_specs else next(iter(prof_specs))
    clf_profile = _fit(clone(prof_specs[best_prof]), train[PROFILE_COLS], train["label"], groups)
    prof_m = clf_metrics(proba_in_order(clf_profile, test[PROFILE_COLS]), test["label"])
    prof_m["name"] = best_prof
    log(f"profile classifier done ({time.time() - t0:.0f}s)")

    # ---- out-of-time validation --------------------------------------------------------
    oot_train = train[train["target_date"] < OOT_CUTOFF]
    future = panel[panel["target_date"] >= OOT_CUTOFF]
    oot_sets = {
        "unseen_players_future": future[future["player_id"].isin(test_pids)],
        "seen_players_future": future[future["player_id"].isin(train_pids)],
    }
    oot_groups = oot_train["player_id"].to_numpy()
    oot_clf = {
        name: _fit(clone(clf_specs[name]), oot_train[FORECAST_COLS], oot_train["label"], oot_groups)
        for name in (best_clf, "Persistence (last state)")
    }
    oot_reg: dict[str, dict[str, Any]] = {}
    for task, cols in task_cols.items():
        specs = regressor_specs(task)
        names = [reg_tasks[task]["best_model"]] + (
            ["Naive (last value)"] if task == "forecast" else []
        )
        oot_reg[task] = {
            n: clone(specs[n]).fit(oot_train[cols], oot_train["target_value"]) for n in names
        }
    oot_report: dict[str, Any] = {
        "cutoff": OOT_CUTOFF,
        "train_rows": int(len(oot_train)),
        "note": "Models refit on training-player rows with target date before the cutoff.",
        "sets": {},
    }
    for set_name, sdf in oot_sets.items():
        entry: dict[str, Any] = {"rows": int(len(sdf)), "classification": {}, "regression": {}}
        for name, est in oot_clf.items():
            m = clf_metrics(proba_in_order(est, sdf[FORECAST_COLS]), sdf["label"])
            m.pop("confusion_matrix")
            entry["classification"][name] = m
        for task, models in oot_reg.items():
            entry["regression"][task] = {
                n: reg_metrics(sdf["target_value"], est.predict(sdf[task_cols[task]]))
                for n, est in models.items()
            }
        oot_report["sets"][set_name] = entry
    log(f"out-of-time done ({time.time() - t0:.0f}s)")

    # ---- out-of-fold fair value for every player (screening) -----------------------------
    finals = panel[panel["is_final"]].reset_index(drop=True)
    all_train = panel[recent | panel["is_final"]].reset_index(drop=True)
    # Point estimate *and* interval are fit without the scored player: inside each fold the
    # quantile models see 80% of the fold's training players and are conformalized on the rest.
    fund_spec = regressor_specs("fundamental")[reg_tasks["fundamental"]["best_model"]]
    oof = pd.DataFrame(np.nan, index=finals["player_id"], columns=["fair", "lo", "hi"])
    fold_groups = all_train["player_id"].to_numpy()
    for tr_idx, va_idx in GroupKFold(N_SPLITS).split(all_train, groups=fold_groups):
        fold = all_train.iloc[tr_idx]
        est = clone(fund_spec).fit(fold[FUNDAMENTAL_COLS], fold["target_value"])
        f_idx, c_idx = next(
            GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED).split(
                fold, groups=fold["player_id"].to_numpy()
            )
        )
        fold_cal = fold.iloc[c_idx]
        fold_ci = fit_conformal(
            "fundamental",
            FUNDAMENTAL_COLS,
            fold.iloc[f_idx],
            fold_cal[fold_cal["target_date"] >= CAL_START],
        )
        va_pids = set(all_train.iloc[va_idx]["player_id"])
        va = finals[finals["player_id"].isin(va_pids)]
        fair_va = est.predict(va[FUNDAMENTAL_COLS])
        lo_va, hi_va = fold_ci.interval(va[FUNDAMENTAL_COLS], fair_va)
        oof.loc[va["player_id"], ["fair", "lo", "hi"]] = np.column_stack([fair_va, lo_va, hi_va])
    log(f"oof screening done ({time.time() - t0:.0f}s)")

    # ---- 12-month outlook (recommendations) ----------------------------------------------
    outlook_hist, outlook_cur = build_outlook_panel(df, series)
    outlook_validation = validate_outlook(outlook_hist)
    outlook_model = fit_outlook(outlook_hist[outlook_hist["date"] >= OUTLOOK_START])
    outlook_pred = outlook_model.predict(outlook_cur)
    log(f"outlook done ({time.time() - t0:.0f}s)")

    # ---- payloads ----------------------------------------------------------------------
    ci_fc, ci_fd = reg_ci["forecast"], reg_ci["fundamental"]
    fc_lo, fc_hi = ci_fc.interval(test[FORECAST_COLS], reg_pred["forecast"])
    fd_lo, fd_hi = ci_fd.interval(test[FUNDAMENTAL_COLS], reg_pred["fundamental"])
    proba_test = proba_in_order(clf_models[best_clf], test[FORECAST_COLS])
    pred_clean = np.array(CLASSES)[proba_test.argmax(axis=1)]
    pred_leak = leak_preds[best_leak]
    info = df.set_index("player_id")

    def base_row(feat: Any, actual: float, fair: float, lo: float, hi: float) -> dict[str, Any]:
        pid = feat["player_id"]
        p = info.loc[pid]
        gap = fair - actual  # positive = model fair value above market price
        status, basis = valuation_status(actual, lo, hi, feat)
        return {
            "player_id": pid,
            "name": str(p["name"]),
            "age": float(p["age"]),
            "nationality": str(p["nationality_clean"]),
            "league_name": str(p["league_name"]),
            "position": str(p["position"]) if pd.notna(p["position"]) else "Unknown",
            "position_group": str(p["position_group"]) if pd.notna(p["position_group"]) else "Unknown",
            "peak_club": str(p["peak_club"]) if pd.notna(p["peak_club"]) else "Unknown",
            "actual_trajectory": str(p["trajectory"]),
            "actual_value_eur": round(actual, 2),
            "pred_value_eur": round(fair, 2),
            "fair_value_eur": round(fair, 2),
            "fair_value_range_eur": [round(lo, 2), round(hi, 2)],
            "residual_eur": round(gap, 2),
            "residual_pct": round(gap / actual * 100.0, 2) if actual > 0 else 0.0,
            "valuation_status": status,
            "valuation_basis": basis,
        }

    rows: list[dict[str, Any]] = []
    growing_vs_stable = 0
    for k in range(len(test)):
        r = test.iloc[k]
        row = base_row(
            r,
            float(r["target_value"]),
            float(reg_pred["fundamental"][k]),
            float(fd_lo[k]),
            float(fd_hi[k]),
        )
        actual_traj = str(r["label"])
        row.update(
            {
                "actual_trajectory": actual_traj,
                "pred_trajectory_clean": str(pred_clean[k]),
                "pred_trajectory_leakage": str(pred_leak[k]),
                "pred_trajectory_confidence": round(float(proba_test[k].max()), 4),
                "previous_value_eur": round(float(np.expm1(r["log_last"])), 2),
                "forecast_value_eur": round(float(reg_pred["forecast"][k]), 2),
                "forecast_range_eur": [round(float(fc_lo[k]), 2), round(float(fc_hi[k]), 2)],
                "forecast_residual_eur": round(
                    float(reg_pred["forecast"][k] - r["target_value"]), 2
                ),
            }
        )
        if {actual_traj, str(pred_clean[k])} == {"growing", "stable"}:
            growing_vs_stable += 1
        rows.append(row)

    def top(items: list[dict[str, Any]], status: str, n: int = 15) -> list[dict[str, Any]]:
        sel = [r for r in items if r["valuation_status"] == status]
        return sorted(sel, key=lambda r: abs(r["residual_eur"]), reverse=True)[:n]

    screening_rows = []
    for k in range(len(finals)):
        r = finals.iloc[k]
        o = oof.loc[r["player_id"]]
        screening_rows.append(
            base_row(r, float(r["target_value"]), float(o["fair"]), float(o["lo"]), float(o["hi"]))
        )
    oof_actual = finals["target_value"].to_numpy()
    oof_fair = oof.loc[finals["player_id"], "fair"].to_numpy()
    oof_metrics = reg_metrics(oof_actual, oof_fair)
    oof_inside = (oof_actual >= oof.loc[finals["player_id"], "lo"].to_numpy()) & (
        oof_actual <= oof.loc[finals["player_id"], "hi"].to_numpy()
    )
    # How much of the gap is just the price move of the hidden window?
    anchored = finals["has_anchor"].to_numpy() == 1
    anchor_value = np.exp(finals["anc_log_ratio_peak"].to_numpy()) * np.expm1(
        finals["log_peak"].to_numpy()
    )
    hidden_return = np.log(oof_actual[anchored] / anchor_value[anchored])
    log_gap = np.log(np.maximum(oof_fair[anchored], 1.0) / oof_actual[anchored])
    reversal_corr = float(np.corrcoef(log_gap, hidden_return)[0, 1])

    outlook_rows: list[dict[str, Any]] = []
    for k in range(len(outlook_cur)):
        r, o = outlook_cur.iloc[k], outlook_pred.iloc[k]
        p = info.loc[r["player_id"]]
        cur_val = float(r["last_value_eur"])
        outlook_rows.append(
            {
                "player_id": r["player_id"],
                "name": str(p["name"]),
                "age": float(p["age"]),
                "nationality": str(p["nationality_clean"]),
                "league_name": str(p["league_name"]),
                "position": str(p["position"]) if pd.notna(p["position"]) else "Unknown",
                "peak_club": str(p["peak_club"]) if pd.notna(p["peak_club"]) else "Unknown",
                "actual_trajectory": str(p["trajectory"]),
                "current_value_eur": round(cur_val, 2),
                "valuation_date": r["date"],
                "expected_value_eur": round(float(o["value"]), 2),
                "expected_range_eur": [round(float(o["lo"]), 2), round(float(o["hi"]), 2)],
                "expected_change_eur": round(float(o["value"]) - cur_val, 2),
                "expected_change_pct": round((float(o["value"]) / cur_val - 1.0) * 100.0, 2),
                "p_up": round(float(o["p_up"]), 4),
                "p_down": round(float(o["p_down"]), 4),
                "signal": outlook_signal(float(o["p_up"]), float(o["p_down"]))
                if cur_val >= OUTLOOK_MIN_VALUE
                else "Neutral",
            }
        )
    outlook_payload = {
        "method": (
            "Calibrated probability that the market value is more than 5% higher / lower at the "
            "first valuation 10-16 months ahead, plus a conformal value range. Trained on every "
            "past (history prefix -> value a year later) pair; scored on each player's full history."
        ),
        "horizon_months": 12,
        "threshold": OUTLOOK_THRESHOLD,
        "min_value_eur": OUTLOOK_MIN_VALUE,
        "interval_level": INTERVAL_LEVEL,
        "validation": outlook_validation,
        "signal_counts": {
            s: sum(r["signal"] == s for r in outlook_rows)
            for s in ("Buy", "Neutral", "DepreciationRisk")
        },
        "buy": sorted(
            [r for r in outlook_rows if r["signal"] == "Buy"],
            key=lambda r: r["expected_change_eur"],
            reverse=True,
        )[:30],
        "depreciation_risk": sorted(
            [r for r in outlook_rows if r["signal"] == "DepreciationRisk"],
            key=lambda r: r["expected_change_eur"],
        )[:30],
        "limits": [
            "Predicts Transfermarkt market value, not sporting quality or transfer fee.",
            "No performance, injury or contract data.",
            "Training players all reached a top-5 league by 2025, so growth of young players is flattered.",
        ],
    }

    league_groups: dict[str, list[float]] = {}
    for r in rows:
        league_groups.setdefault(r["league_name"], []).append(r["forecast_residual_eur"])
    best_clean_row = next(m for m in clean_rows if m["name"] == best_clf)

    test_predictions = {
        "rows": rows,
        "undervalued": top(rows, "Undervalued"),
        "overvalued": top(rows, "Overvalued"),
        "outlook": outlook_payload,
        "screening_all": {
            "method": (
                "Out-of-fold fundamental fair value and conformal band (GroupKFold by player) for "
                f"every player; flagged when the market price is outside the "
                f"{int(INTERVAL_LEVEL * 100)}% band. Breakouts (new all-time high in the hidden "
                "12 months) and players with under 12 months of history are not judged."
            ),
            "players": int(len(screening_rows)),
            "metrics": oof_metrics,
            "band_coverage": round(float(oof_inside.mean()), 4),
            "gap_vs_hidden_window_return_corr": round(reversal_corr, 4),
            "basis_counts": {
                b: sum(r["valuation_basis"] == b for r in screening_rows)
                for b in ("ok", "breakout", "short_history")
            },
            "status_counts": {
                s: sum(r["valuation_status"] == s for r in screening_rows)
                for s in ("Undervalued", "Fair", "Overvalued")
            },
            "undervalued": top(screening_rows, "Undervalued", 25),
            "overvalued": top(screening_rows, "Overvalued", 25),
        },
        "error_analysis": {
            "leakage_delta_acc": round(best_leak_row["accuracy"] - best_clean_row["accuracy"], 4),
            "growing_vs_stable_confusion_count": growing_vs_stable,
            "top_underpredicted_superstars": sorted(
                [
                    r
                    for r in rows
                    if r["actual_value_eur"] >= 40_000_000 and r["forecast_residual_eur"] < 0
                ],
                key=lambda r: r["forecast_residual_eur"],
            )[:10],
            "league_bias": [
                {
                    "league": lg,
                    "mean_residual_eur": round(float(np.mean(vals)), 2),
                    "count": len(vals),
                }
                for lg, vals in sorted(league_groups.items())
            ],
            "league_bias_model": "forecast",
        },
    }

    traj_counts = df["trajectory"].value_counts().to_dict()
    overview = {
        "dataset": {
            "total_players": int(len(df)),
            "train_size": int(len(train_idx)),
            "test_size": int(len(test_idx)),
            "history_rows": int(len(hist)) + repairs["history_rows_dropped_nonpositive"],
            "history_rows_used": int(len(hist)),
            "leagues": sorted(df["league_name"].dropna().unique().tolist()),
            "trajectories": {c: int(traj_counts.get(c, 0)) for c in CLASSES},
            "panel_rows": int(len(panel)),
            "train_rows": int(len(train)),
            "repairs": repairs,
        },
        "methodology": {
            "feature_source": "features.py: every feature is computed from the valuation-history prefix",
            "label_rule": "rising_star = strict new all-time high; else drawdown <20/<30/<60/>=60 %",
            "label_rule_match_rate": round(label_match, 4),
            "split": "stratified 80:20 by player (seed 42), scored on each test player's last update",
            "panel": f"one row per (player, update): prefix -> next update, target date >= {PANEL_START}",
            "model_selection": "GroupKFold(5) by player on training players (log-loss / log-RMSE)",
            "out_of_time_cutoff": OOT_CUTOFF,
            "interval_level": INTERVAL_LEVEL,
            "limits": [
                "No performance data (minutes, goals): fair value is inferred from price history, age, position and league only.",
                "The fundamental gap is largely the price move of the hidden 12 months (see screening_all.gap_vs_hidden_window_return_corr): it ranks reversal candidates, it does not prove mispricing.",
                "Scored rows use the real time gap to the next update; validation.fixed_horizon reports the same models without that knowledge.",
                "league_name and position are the player's current ones; past rows reuse them.",
                "Club history is unusable (one club for 1,910 players), so club moves are not modelled.",
                "Dataset holds players active in a top-5 league in 2025 (survivorship).",
            ],
        },
        "classification": {
            "classes": CLASSES,
            "clean_mode": {
                "models": clean_rows,
                "best_model": best_clf,
                "features": FORECAST_COLS,
                "validation": {"group_kfold": clf_cv, "fixed_horizon": fixed_clf},
            },
            "leakage_mode": {"models": leak_rows, "best_model": best_leak},
            "profile_mode": {
                "models": [prof_m],
                "best_model": best_prof,
                "features": PROFILE_COLS,
            },
        },
        "regression": {
            # Legacy shape = the forecasting task.
            "models": reg_tasks["forecast"]["models"],
            "best_model": reg_tasks["forecast"]["best_model"],
            "task": "forecast",
            "tasks": reg_tasks,
        },
        "out_of_time": oot_report,
    }

    history_by_player = {
        pid: [
            {
                "date": d,
                "value_eur": float(v),
                "club": "Unknown",
                "age_at_date": float(a),
            }
            for d, v, a in zip(s.dates, s.values, s.ages)
        ]
        for pid, s in series.items()
    }
    # Keep the club and the original date string from the CSV for the history endpoint.
    for pid, grp in hist.groupby("player_id", sort=False):
        for point, date, club in zip(history_by_player[str(pid)], grp["valuation_date"], grp["club"]):
            point["date"] = str(date)
            point["club"] = str(club) if pd.notna(club) else "Unknown"

    pg = train.loc[train["is_final"], "position_group"].value_counts(normalize=True)
    art = DashboardArtifacts(
        overview=overview,
        test_predictions=test_predictions,
        players_df=df,
        history_by_player=history_by_player,
        top_nationalities=set(repairs["top_nationalities"]),
        series=series,
        static=static_map,
        clf_forecast=clf_models[best_clf],
        clf_profile=clf_profile,
        reg_forecast=reg_best["forecast"],
        reg_fundamental=reg_best["fundamental"],
        reg_profile=reg_best["profile"],
        ci_forecast=reg_ci["forecast"],
        ci_fundamental=reg_ci["fundamental"],
        ci_profile=reg_ci["profile"],
        model_names={
            "classifier": best_clf,
            "classifier_profile": best_prof,
            "forecast": reg_tasks["forecast"]["best_model"],
            "fundamental": reg_tasks["fundamental"]["best_model"],
            "profile": reg_tasks["profile"]["best_model"],
        },
        group_weights={g: float(pg.get(g, 0.0)) for g in POSITION_GROUPS},
        train_player_ids=train_pids,
        test_matrix=test,
        total_players=int(len(df)),
        history_rows=int(len(hist)) + repairs["history_rows_dropped_nonpositive"],
        extra={
            "outlook_model": outlook_model,
            "outlook_by_player": {r["player_id"]: r for r in outlook_rows},
        },
    )
    overview["methodology"]["training_seconds"] = round(time.time() - t0, 1)
    log(f"training finished in {time.time() - t0:.0f}s")
    return art


# --------------------------------------------------------------------------- cache


def _fingerprint() -> str:
    h = hashlib.sha256()
    players_path, history_path = resolve_data_paths()
    here = Path(__file__).resolve().parent
    files = [
        players_path,
        history_path,
        players_path.parent / "player_profile_patch.csv",
        here / "features.py",
        here / "ml_pipeline.py",
    ]
    for f in files:
        if f.exists():
            h.update(f.read_bytes())
    h.update(sklearn.__version__.encode())
    return h.hexdigest()[:16]


def build_artifacts(log: Callable[[str], None] = print) -> DashboardArtifacts:
    """Return trained artifacts, reusing the on-disk cache when data and code are unchanged."""
    cache_dir = Path(os.environ.get("MODEL_CACHE_DIR", "/app/cache"))
    cache_file = cache_dir / f"artifacts-{_fingerprint()}.joblib"
    if cache_file.exists():
        try:
            art = joblib.load(cache_file)
            log(f"loaded cached artifacts {cache_file.name}")
            return art
        except Exception as exc:  # stale or corrupt cache: retrain
            log(f"cache unreadable ({exc}); retraining")
    art = train_all(log)
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        for old in cache_dir.glob("artifacts-*.joblib"):
            old.unlink()
        joblib.dump(art, cache_file, compress=3)
        log(f"saved {cache_file.name}")
    except OSError as exc:
        log(f"cache not written: {exc}")
    return art


# --------------------------------------------------------------------------- inference


def player_feature_row(
    art: DashboardArtifacts,
    player_id: str,
    horizon_yr: float | None = None,
    league_name: str | None = None,
    append_valuations: list[tuple[float, float]] | None = None,
    backtest: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Feature row for a real player, built by the same code path as the training rows.

    backtest=True hides the last valuation and targets it (reproduces the scored test row).
    append_valuations = hypothetical future points as (value_eur, years_after_previous_point).
    """
    s = art.series[player_id]
    values, days, ages = s.values, s.days, s.ages
    meta: dict[str, Any] = {"actual_value_eur": None, "actual_date": None}
    if backtest:
        if len(values) < 2:
            raise ValueError("backtest needs at least two valuations")
        horizon_yr = float((days[-1] - days[-2]) / 365.25)
        meta["actual_value_eur"] = float(values[-1])
        meta["actual_date"] = s.dates[-1]
        meta["actual_trajectory"] = classify_trajectory(float(values[-1]), float(values[:-1].max()))
        values, days, ages = values[:-1], days[:-1], ages[:-1]
    elif append_valuations:
        # Integer ages are floors of the true age; assume the last one sits mid-year.
        elapsed = 0.0
        for value_eur, years_after in append_valuations:
            elapsed += float(years_after)
            values = np.append(values, float(value_eur))
            days = np.append(days, s.days[-1] + elapsed * 365.25)
            ages = np.append(ages, float(np.floor(s.ages[-1] + 0.5 + elapsed)))
    static = dict(art.static[player_id])
    if league_name:
        static["league_name"] = league_name
    h = DEFAULT_HORIZON_YR if horizon_yr is None else float(horizon_yr)
    row = assemble_row(prefix_features(values, days, ages), h, static)
    meta["last_value_eur"] = float(values[-1])
    meta["last_date"] = s.dates[min(len(values), len(s.dates)) - 1]
    meta["n_history_points"] = int(len(values))
    return row, meta


def predict_feature_row(art: DashboardArtifacts, row: dict[str, Any]) -> dict[str, Any]:
    """Run the forecast, fundamental and trajectory models on one assembled feature row."""
    X = pd.DataFrame([row])
    for cat in CAT_FEATURES:
        X[cat] = X[cat].astype(object).where(X[cat].notna(), np.nan)
    forecast = art.reg_forecast.predict(X[FORECAST_COLS])
    fc_lo, fc_hi = art.ci_forecast.interval(X[FORECAST_COLS], forecast)
    fair = art.reg_fundamental.predict(X[FUNDAMENTAL_COLS])
    fd_lo, fd_hi = art.ci_fundamental.interval(X[FUNDAMENTAL_COLS], fair)
    proba = proba_in_order(art.clf_forecast, X[FORECAST_COLS])[0]
    return {
        "predicted_trajectory": CLASSES[int(proba.argmax())],
        "trajectory_probabilities": {c: round(float(p), 4) for c, p in zip(CLASSES, proba)},
        "predicted_value_eur": round(float(forecast[0]), 2),
        "value_range_eur": [round(float(fc_lo[0]), 2), round(float(fc_hi[0]), 2)],
        "fair_value_eur": round(float(fair[0]), 2),
        "fair_value_range_eur": [round(float(fd_lo[0]), 2), round(float(fd_hi[0]), 2)],
    }


def predict_profile(art: DashboardArtifacts, fields: dict[str, Any]) -> dict[str, Any]:
    """Synthetic profile: models trained on exactly the user-supplied fields.

    Without a position group the prediction is averaged over the groups by training frequency.
    """
    nat = str(fields["nationality"]).strip()
    fields = dict(fields, nationality=nat if nat in art.top_nationalities else "Other")
    group = fields.get("position_group")
    if group in POSITION_GROUPS:
        weights = {group: 1.0}
    else:
        weights = {g: w for g, w in art.group_weights.items() if w > 0}
    total = sum(weights.values())
    log_val = log_lo = log_hi = 0.0
    proba = np.zeros(len(CLASSES))
    for g, w in weights.items():
        X = pd.DataFrame([profile_row(**dict(fields, position_group=g))])[PROFILE_COLS]
        lo, hi = art.ci_profile.interval_log(X)
        log_val += w / total * float(art.reg_profile.predict_log(X)[0])
        log_lo += w / total * float(lo[0])
        log_hi += w / total * float(hi[0])
        proba += w / total * proba_in_order(art.clf_profile, X)[0]
    value = max(float(np.expm1(log_val)), 0.0)
    return {
        "predicted_trajectory": CLASSES[int(proba.argmax())],
        "trajectory_probabilities": {c: round(float(p), 4) for c, p in zip(CLASSES, proba)},
        "predicted_value_eur": round(value, 2),
        "value_range_eur": [
            round(min(max(float(np.expm1(log_lo)), 0.0), value), 2),
            round(max(float(np.expm1(log_hi)), value), 2),
        ],
    }


if __name__ == "__main__":
    import json
    import sys

    import ml_pipeline  # so pickled estimators reference `ml_pipeline`, not `__main__`

    artifacts = ml_pipeline.build_artifacts()
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(json.dumps(artifacts.overview, indent=1))
