"""Leak checks, train/serve consistency and API contract.

Run inside the API image (the host has no scikit-learn):
    deploy/test.sh
"""

from __future__ import annotations

import inspect
import math

import numpy as np
import pandas as pd
import pytest

import features
import ml_pipeline as mp
from features import (
    CAT_FEATURES,
    CLASSES,
    FORECAST_NUM_FEATURES,
    FUNDAMENTAL_NUM_FEATURES,
    PRICE_LEVEL_FEATURES,
    PROFILE_NUM_FEATURES,
    assemble_row,
    classify_trajectory,
    prefix_features,
)

CSV_LEAK_COLUMNS = {
    "value_cagr",
    "value_to_peak_cagr",
    "value_multiplier_x",
    "post_peak_decline_pct",
    "mean_yoy_growth_rate",
    "is_at_peak",
    "last_value_eur",
    "current_value_eur",
    "current_value_tier",
    "trajectory",
    # CSV summaries computed over the full history, target point included:
    "peak_value_eur",
    "peak_value_tier",
    "value_volatility",
    "years_to_peak",
    "career_span_years",
    "num_valuation_points",
}

PROFILE_BODY = {
    "age": 24,
    "age_at_peak": 23,
    "peak_value_eur": 40_000_000,
    "first_value_eur": 500_000,
    "career_span_years": 6,
    "years_to_peak": 5,
    "value_volatility": 0.7,
    "num_valuation_points": 14,
    "num_clubs_career": 2,
    "league_name": "Premier League",
    "nationality": "England",
}


# ----------------------------------------------------------------------------- leak checks


def test_clean_feature_names_exclude_csv_leak_columns():
    used = set(FORECAST_NUM_FEATURES + FUNDAMENTAL_NUM_FEATURES + PROFILE_NUM_FEATURES)
    assert not used & CSV_LEAK_COLUMNS


def test_pipeline_never_feeds_csv_summary_columns_to_clean_models():
    # The player CSV may only provide ids, labels and static profile fields to the panel.
    src = inspect.getsource(mp.build_panel) + inspect.getsource(mp.player_static)
    for col in CSV_LEAK_COLUMNS:
        assert f'"{col}"' not in src, col


def test_features_do_not_change_when_target_valuation_changes(art):
    """Behavioural leak test: mutate the valuation being predicted, features must not move."""
    rng = np.random.default_rng(0)
    for pid in rng.choice(sorted(art.series), size=200, replace=False):
        s = art.series[pid]
        base, _ = mp.player_feature_row(art, pid, backtest=True)
        original = s.values[-1]
        try:
            for factor in (0.1, 3.0, 50.0):
                s.values[-1] = original * factor
                mutated, _ = mp.player_feature_row(art, pid, backtest=True)
                for key in base:
                    a, b = base[key], mutated[key]
                    assert a == b or (a != a and b != b), (pid, key, a, b)
        finally:
            s.values[-1] = original


def test_prefix_features_ignore_everything_after_the_prefix(art):
    pid = next(p for p, s in art.series.items() if len(s.values) >= 12)
    s = art.series[pid]
    k = 8
    a = prefix_features(s.values[:k], s.days[:k], s.ages[:k])
    b = prefix_features(list(s.values[:k]), list(s.days[:k]), list(s.ages[:k]))
    assert a == pytest.approx(b, nan_ok=True)
    assert a["last_value_eur"] == s.values[k - 1]
    assert a["peak_value_eur"] == s.values[:k].max()


def test_fundamental_features_hide_the_recent_price():
    assert not set(FUNDAMENTAL_NUM_FEATURES) & PRICE_LEVEL_FEATURES
    assert "pre_last_value_eur" not in FUNDAMENTAL_NUM_FEATURES
    # Changing every price of the last 12 months leaves the fundamental features untouched.
    days = np.array([0, 200, 400, 600, 800, 1000, 1100, 1200], dtype=float)
    ages = np.array([20, 20, 21, 21, 22, 22, 23, 23], dtype=float)
    v1 = np.array([1, 2, 4, 6, 8, 9, 10, 12], dtype=float) * 1e6
    v2 = v1.copy()
    v2[days > days[-1] - 365.25] *= 5.0
    r1 = assemble_row(prefix_features(v1, days, ages), 0.5, {})
    r2 = assemble_row(prefix_features(v2, days, ages), 0.5, {})
    for f in FUNDAMENTAL_NUM_FEATURES:
        assert r1[f] == pytest.approx(r2[f]), f
    assert r1["log_last"] != r2["log_last"]


def test_fundamental_model_is_not_a_copy_of_the_last_price(art):
    probe = art.overview["regression"]["tasks"]["fundamental"]["tautology_probe"]
    assert probe["r2_log"] < 0.9
    assert probe["medape"] > 0.2
    imp = art.overview["regression"]["tasks"]["forecast"]["models"][0]["feature_importance"]
    assert imp[0]["feature"] == "log_last"  # the forecast model is the one allowed to use it


def test_leakage_mode_is_inflated_and_clean_mode_is_not(art):
    c = art.overview["classification"]
    best = lambda mode: next(m for m in c[mode]["models"] if m["name"] == c[mode]["best_model"])
    assert best("leakage_mode")["accuracy"] > 0.97
    assert best("clean_mode")["accuracy"] < 0.85


# ----------------------------------------------------------------------------- labels & splits


def test_label_rule_reproduces_dataset_trajectory(art):
    assert art.overview["methodology"]["label_rule_match_rate"] == 1.0
    assert classify_trajectory(11.0, 10.0) == "rising_star"
    assert classify_trajectory(10.0, 10.0) == "growing"
    assert classify_trajectory(7.9, 10.0) == "stable"
    assert classify_trajectory(6.9, 10.0) == "declining"
    assert classify_trajectory(4.0, 10.0) == "falling_sharply"


def test_no_player_is_in_both_train_and_test(art):
    test_ids = set(art.test_matrix["player_id"])
    assert len(test_ids) == 484
    assert not test_ids & art.train_player_ids
    assert len(test_ids | art.train_player_ids) == art.total_players


# ----------------------------------------------------------------------------- train/serve


def test_simulate_backtest_features_equal_the_scored_test_matrix(art):
    """No train-serving skew: the serving path rebuilds the exact row the model was scored on."""
    cols = FORECAST_NUM_FEATURES + FUNDAMENTAL_NUM_FEATURES + PROFILE_NUM_FEATURES + CAT_FEATURES
    for _, expected in art.test_matrix.iterrows():
        row, meta = mp.player_feature_row(art, expected["player_id"], backtest=True)
        assert meta["actual_value_eur"] == expected["target_value"]
        for c in cols:
            a, b = row[c], expected[c]
            if isinstance(b, float) and math.isnan(b):
                assert a != a, c
            else:
                assert a == b, (expected["player_id"], c, a, b)


def test_simulate_backtest_predictions_equal_test_predictions(art, client):
    rows = art.test_predictions["rows"]
    for r in rows[:60]:
        res = client.post(
            "/api/simulate", json={"player_id": r["player_id"], "scenario": {"backtest": True}}
        )
        assert res.status_code == 200, res.text
        out = res.json()
        assert out["mode"] == "player_backtest"
        assert out["predicted_value_eur"] == pytest.approx(r["forecast_value_eur"], rel=1e-9)
        assert out["fair_value_eur"] == pytest.approx(r["fair_value_eur"], rel=1e-9)
        assert out["predicted_trajectory"] == r["pred_trajectory_clean"]
        assert out["player"]["actual_value_eur"] == r["actual_value_eur"]


def test_profile_row_uses_only_request_fields(art):
    params = set(inspect.signature(features.profile_row).parameters)
    assert params == {
        "age", "age_at_peak", "peak_value_eur", "first_value_eur", "career_span_years",
        "years_to_peak", "value_volatility", "num_valuation_points", "league_name",
        "nationality", "position_group",
    }
    row = features.profile_row(**{k: v for k, v in PROFILE_BODY.items() if k in params}, position_group="Forward")
    assert set(row) == set(mp.PROFILE_COLS)


# ----------------------------------------------------------------------------- behaviour


def test_valuation_status_does_not_flag_breakouts_or_short_histories():
    import math as m

    anchored = {"has_anchor": 1.0, "log_peak": m.log1p(50e6), "anc_log_peak": m.log1p(20e6)}
    assert mp.valuation_status(50e6, 5e6, 30e6, anchored) == ("Fair", "breakout")
    old_peak = {"has_anchor": 1.0, "log_peak": m.log1p(20e6), "anc_log_peak": m.log1p(20e6)}
    assert mp.valuation_status(18e6, 2e6, 10e6, old_peak) == ("Overvalued", "ok")
    assert mp.valuation_status(1e6, 2e6, 10e6, old_peak) == ("Undervalued", "ok")
    assert mp.valuation_status(5e6, 2e6, 10e6, old_peak) == ("Fair", "ok")
    short = {"has_anchor": 0.0, "log_peak": m.log1p(1e6), "anc_log_peak": float("nan")}
    assert mp.valuation_status(9e9, 1.0, 2.0, short) == ("Fair", "short_history")


def test_target_date_only_reaches_horizon_features(art):
    """The date of the predicted update enters through the horizon and nothing else."""
    horizon_derived = {"horizon_yr", "age", "anc_lag_yr", "anc_yrs_since_peak", "age_past_peak"}
    pid = art.test_matrix["player_id"].iloc[0]
    s = art.series[pid]
    base, _ = mp.player_feature_row(art, pid, backtest=True)
    original = s.days[-1]
    try:
        s.days[-1] = original + 200
        moved, _ = mp.player_feature_row(art, pid, backtest=True)
    finally:
        s.days[-1] = original
    changed = {k for k in base if not (base[k] == moved[k] or (base[k] != base[k] and moved[k] != moved[k]))}
    assert changed and changed <= horizon_derived, changed


def test_fixed_horizon_scores_are_reported(art):
    o = art.overview
    best = o["classification"]["clean_mode"]["best_model"]
    fixed = o["classification"]["clean_mode"]["validation"]["fixed_horizon"][best]
    assert {"accuracy", "macro_f1", "ece", "brier"} <= set(fixed)
    fc = o["regression"]["tasks"]["forecast"]
    assert fc["best_model"] in fc["validation"]["fixed_horizon"]
    assert fc["validation"]["holdout_value_ge_50m"][fc["best_model"]]["n"] > 10


def test_profile_endpoint_reproduces_the_scored_profile_model(art, client):
    """Synthetic mode: posting a test player's prefix summary gives the matrix prediction."""
    X = art.test_matrix[art.test_matrix["position_group"].notna()].head(40)
    expected = art.reg_profile.predict(X[mp.PROFILE_COLS])
    proba = mp.proba_in_order(art.clf_profile, X[mp.PROFILE_COLS])
    for k, (_, r) in enumerate(X.iterrows()):
        body = {
            "age": float(r["age"]),
            "age_at_peak": float(r["age_at_peak"]),
            "peak_value_eur": float(np.expm1(r["log_peak"])),
            "first_value_eur": float(np.expm1(r["log_first"])),
            "career_span_years": float(r["span_yr"]),
            "years_to_peak": float(r["yrs_to_peak"]),
            "value_volatility": float(r["cv"]),
            "num_valuation_points": int(r["n_points"]),
            "league_name": r["league_name"],
            "nationality": r["nationality"],
            "position_group": r["position_group"],
        }
        res = client.post("/api/simulate", json=body)
        assert res.status_code == 200, res.text
        out = res.json()
        assert out["predicted_value_eur"] == pytest.approx(expected[k], rel=1e-6)
        assert out["predicted_trajectory"] == CLASSES[int(proba[k].argmax())]


def test_probabilities_and_intervals_are_well_formed(art):
    X = art.test_matrix
    proba = mp.proba_in_order(art.clf_forecast, X[mp.FORECAST_COLS])
    assert proba.shape == (len(X), 5)
    assert np.allclose(proba.sum(axis=1), 1.0)
    assert (proba >= 0).all()
    assert list(art.clf_forecast.classes_) == CLASSES
    point = art.reg_forecast.predict(X[mp.FORECAST_COLS])
    lo, hi = art.ci_forecast.interval(X[mp.FORECAST_COLS], point)
    assert (lo <= point).all() and (point <= hi).all() and (lo >= 0).all()


def test_conformal_intervals_cover_close_to_nominal(art):
    for task in ("forecast", "fundamental", "profile"):
        rep = art.overview["regression"]["tasks"][task]["intervals"]["holdout"]
        assert rep["level"] == 0.8
        assert 0.74 <= rep["coverage"] <= 0.88, (task, rep)


def test_interval_width_adapts_to_the_player(art):
    X = art.test_matrix
    lo, hi = art.ci_forecast.interval(X[mp.FORECAST_COLS])
    ratio = hi / np.maximum(lo, 1.0)
    assert ratio.std() > 0.05  # not a fixed +-x% band


def test_forecast_beats_naive_on_log_error_in_grouped_cv(art):
    cv = art.overview["regression"]["tasks"]["forecast"]["validation"]["group_kfold"]
    best = art.overview["regression"]["tasks"]["forecast"]["best_model"]
    assert cv[best]["rmse_log_mean"] < cv["Naive (last value)"]["rmse_log_mean"]


def test_validation_reports_exist(art):
    o = art.overview
    assert set(o["out_of_time"]["sets"]) == {"unseen_players_future", "seen_players_future"}
    for s in o["out_of_time"]["sets"].values():
        assert s["rows"] > 500
    cv = o["classification"]["clean_mode"]["validation"]["group_kfold"]
    assert "accuracy_mean" in cv[o["classification"]["clean_mode"]["best_model"]]
    for m in o["classification"]["clean_mode"]["models"]:
        for k in ("accuracy", "macro_f1", "ece", "brier", "log_loss"):
            assert k in m


# ----------------------------------------------------------------------------- API contract


def test_health_overview_history_datasets_keep_legacy_shape(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["players"] == 2418 and h["history_rows"] == 47909

    o = client.get("/api/overview").json()
    assert {"total_players", "train_size", "test_size", "history_rows", "leagues", "trajectories"} <= set(o["dataset"])
    assert o["classification"]["classes"] == CLASSES
    for mode in ("clean_mode", "leakage_mode"):
        block = o["classification"][mode]
        assert block["best_model"] in [m["name"] for m in block["models"]]
        for m in block["models"]:
            assert {"name", "accuracy", "f1_weighted", "precision_weighted", "recall_weighted",
                    "confusion_matrix", "feature_importance"} <= set(m)
            assert len(m["confusion_matrix"]) == 5
    reg = o["regression"]
    assert reg["best_model"] in [m["name"] for m in reg["models"]]
    for m in reg["models"]:
        assert {"name", "mae", "rmse", "r2", "feature_importance"} <= set(m)
    assert set(reg["tasks"]) == {"forecast", "fundamental", "profile"}

    hist = client.get("/api/history", params={"q": "haaland", "limit": 5}).json()["players"]
    assert hist and {"player_id", "name", "age", "nationality", "league_name", "peak_club",
                     "current_value_eur", "peak_value_eur", "trajectory", "history"} <= set(hist[0])
    assert {"date", "value_eur", "club", "age_at_date"} <= set(hist[0]["history"][0])
    assert hist[0]["position"] == "Centre-Forward"  # repaired legacy row
    values = [p["value_eur"] for p in hist[0]["history"]]
    assert values[-1] == hist[0]["current_value_eur"]

    d = client.get("/api/datasets").json()
    assert d["total_players"] == 2418 and len(d["files"]) >= 3
    assert {"player_id", "name", "age", "nationality", "league_name", "peak_club", "current_value_eur",
            "peak_value_eur", "first_value_eur", "career_span_years", "num_valuation_points",
            "trajectory"} <= set(d["players"][0])


def test_test_predictions_keep_legacy_shape(client):
    t = client.get("/api/test-predictions").json()
    assert len(t["rows"]) == 484
    legacy = {"player_id", "name", "age", "nationality", "league_name", "peak_club", "actual_trajectory",
              "pred_trajectory_clean", "pred_trajectory_leakage", "actual_value_eur", "pred_value_eur",
              "residual_eur", "residual_pct", "valuation_status"}
    for r in t["rows"]:
        assert legacy <= set(r)
        assert r["valuation_status"] in {"Undervalued", "Fair", "Overvalued"}
        assert r["residual_eur"] == pytest.approx(r["pred_value_eur"] - r["actual_value_eur"], abs=0.02)
        lo, hi = r["fair_value_range_eur"]
        assert r["valuation_basis"] in {"ok", "breakout", "short_history"}
        if r["valuation_basis"] == "ok":
            assert (r["valuation_status"] == "Undervalued") == (r["actual_value_eur"] < lo)
            assert (r["valuation_status"] == "Overvalued") == (r["actual_value_eur"] > hi)
        else:  # breakouts and short histories are never flagged
            assert r["valuation_status"] == "Fair"
    assert all(r["valuation_status"] == "Undervalued" for r in t["undervalued"])
    assert all(r["valuation_status"] == "Overvalued" for r in t["overvalued"])
    assert {"leakage_delta_acc", "growing_vs_stable_confusion_count", "top_underpredicted_superstars",
            "league_bias"} <= set(t["error_analysis"])
    sc = t["screening_all"]
    assert sc["players"] == 2418
    assert sum(sc["basis_counts"].values()) == 2418
    assert 0.72 <= sc["band_coverage"] <= 0.9  # band is out-of-fold too
    assert all(r["valuation_basis"] == "ok" for r in sc["undervalued"] + sc["overvalued"])


def test_simulate_legacy_body_still_works(client):
    res = client.post("/api/simulate", json=PROFILE_BODY)
    assert res.status_code == 200, res.text
    out = res.json()
    assert {"predicted_trajectory", "trajectory_probabilities", "predicted_value_eur",
            "value_range_eur", "scouting_verdict"} <= set(out)
    assert out["mode"] == "synthetic_profile"
    assert set(out["trajectory_probabilities"]) == set(CLASSES)
    assert sum(out["trajectory_probabilities"].values()) == pytest.approx(1.0, abs=1e-3)
    lo, hi = out["value_range_eur"]
    assert 0 <= lo <= out["predicted_value_eur"] <= hi


def test_simulate_profile_is_deterministic_and_reacts_to_inputs(client):
    a = client.post("/api/simulate", json=PROFILE_BODY).json()
    b = client.post("/api/simulate", json=PROFILE_BODY).json()
    assert a == b
    richer = client.post("/api/simulate", json={**PROFILE_BODY, "peak_value_eur": 120_000_000}).json()
    assert richer["predicted_value_eur"] > a["predicted_value_eur"]
    # num_clubs_career is accepted but must not move the prediction (not modelled).
    c = client.post("/api/simulate", json={**PROFILE_BODY, "num_clubs_career": 9}).json()
    assert c["predicted_value_eur"] == a["predicted_value_eur"]
    with_pos = client.post("/api/simulate", json={**PROFILE_BODY, "position_group": "Goalkeeper"})
    assert with_pos.status_code == 200


def test_simulate_validation_errors(client):
    assert client.post("/api/simulate", json={"age": 24}).status_code == 422
    assert client.post("/api/simulate", json={"player_id": "0"}).status_code == 404
    pid = client.get("/api/history", params={"limit": 1}).json()["players"][0]["player_id"]
    bad = {"player_id": pid, "scenario": {"backtest": True, "horizon_years": 0.5}}
    assert client.post("/api/simulate", json=bad).status_code == 422
    assert client.post("/api/simulate", json={"player_id": pid, "scenario": {"league_name": "MLS"}}).status_code == 422


def test_simulate_player_whatif_scenarios(client, art):
    pid = client.get("/api/history", params={"q": "saka", "limit": 1}).json()["players"][0]["player_id"]
    base = client.post("/api/simulate", json={"player_id": pid}).json()
    assert base["mode"] == "player_whatif"
    assert base["player"]["last_value_eur"] == art.series[pid].values[-1]
    assert "baseline" not in base
    # Features served are the pipeline's own features for the full history.
    row, _ = mp.player_feature_row(art, pid)
    assert base["features"]["log_last"] == row["log_last"]

    drop = client.post(
        "/api/simulate",
        json={"player_id": pid, "scenario": {"append_valuations": [
            {"value_eur": base["player"]["last_value_eur"] * 0.5, "years_after": 0.5}]}},
    ).json()
    assert drop["player"]["n_history_points"] == base["player"]["n_history_points"] + 1
    assert drop["predicted_value_eur"] < base["predicted_value_eur"]
    assert drop["features"]["dd_last"] > base["features"]["dd_last"]
    assert drop["baseline"]["predicted_value_eur"] == base["predicted_value_eur"]
    assert drop["scenario_delta_eur"] < 0

    older = client.post("/api/simulate", json={"player_id": pid, "scenario": {"horizon_years": 1.4}}).json()
    assert older["features"]["age"] == pytest.approx(base["features"]["age"] - 0.45 + 1.4)
    assert older["warnings"]

    moved = client.post("/api/simulate", json={"player_id": pid, "scenario": {"league_name": "Ligue 1"}}).json()
    assert moved["features"]["league_name"] == "Ligue 1"


# ----------------------------------------------------------------------------- 12-month outlook


def test_outlook_targets_lie_10_to_16_months_after_the_prefix(art):
    df, _, series, _ = mp.load_data()
    history, current = mp.build_outlook_panel(df.head(150), series)
    gap = (pd.to_datetime(history["target_date"]) - pd.to_datetime(history["date"])).dt.days
    assert gap.min() >= mp.OUTLOOK_MIN_DAYS and gap.max() <= mp.OUTLOOK_MAX_DAYS
    assert len(current) == 150 and "target_value" not in current.columns
    assert (current["horizon_yr"] == 1.0).all()
    # Scored rows describe the full history: last known value is the current market value.
    last = current.set_index("player_id")["last_value_eur"]
    for pid in last.index[:20]:
        assert last[pid] == series[pid].values[-1]


def test_outlook_payload_and_signal_rule(client):
    o = client.get("/api/test-predictions").json()["outlook"]
    assert o["horizon_months"] == 12 and o["threshold"] == 0.7
    assert sum(o["signal_counts"].values()) == 2418
    assert o["buy"] and o["depreciation_risk"]
    for r in o["buy"]:
        assert r["p_up"] >= 0.7 and r["current_value_eur"] >= o["min_value_eur"]
        assert r["expected_range_eur"][0] <= r["expected_value_eur"] <= r["expected_range_eur"][1]
    for r in o["depreciation_risk"]:
        assert r["p_down"] >= 0.7 and r["expected_change_eur"] < 0


def test_outlook_signals_hold_up_out_of_time(art):
    v = art.test_predictions["outlook"]["validation"]
    assert v["buy"]["n"] >= 50 and v["depreciation_risk"]["n"] >= 50
    assert v["buy"]["went_up"] >= 0.75 and v["buy"]["went_up"] > v["base_rate"]["up"] + 0.2
    assert v["depreciation_risk"]["went_down"] >= 0.75
    assert v["rank_correlation"] > 0.5


def test_collapsed_prices_are_not_buy_recommendations(art):
    """Regression for the old 'price fell, so it is cheap' screen (Ansu Fati, Raheem Sterling)."""
    v = art.test_predictions["outlook"]["validation"]["fell_over_40pct_prior_12m"]
    assert v["went_down"] > v["went_up"]  # the evidence: collapsed prices mostly keep falling
    by_name = {r["name"]: r for r in art.extra["outlook_by_player"].values()}
    for name in ("Ansu Fati", "Raheem Sterling"):
        assert by_name[name]["signal"] != "Buy", by_name[name]
    buys = {r["name"] for r in art.test_predictions["outlook"]["buy"]}
    assert not buys & {"Ansu Fati", "Raheem Sterling"}


# ----------------------------------------------------------------------------- report data


def test_headlines_put_the_baseline_next_to_the_model(art):
    o = art.overview
    h = o["classification"]["clean_mode"]["headline"]
    assert h["model"] == o["classification"]["clean_mode"]["best_model"]
    assert h["gain_vs_persistence"]["accuracy_pp"] == pytest.approx(
        (h["metrics"]["accuracy"] - h["persistence"]["accuracy"]) * 100, abs=0.01
    )
    for task in ("forecast", "fundamental", "profile"):
        hd = o["regression"]["tasks"][task]["headline"]
        assert {"metrics", "naive_last_value", "skill_vs_naive", "beats_naive_eur", "beats_naive_log", "value_ge_50m"} <= set(hd)
    fc = o["regression"]["tasks"]["forecast"]["headline"]
    assert fc["beats_naive_log"] == (fc["metrics"]["rmse_log"] < fc["naive_last_value"]["rmse_log"])
    assert fc["beats_naive_eur"] == (
        fc["metrics"]["mae"] < fc["naive_last_value"]["mae"] and fc["metrics"]["rmse"] < fc["naive_last_value"]["rmse"]
    )
    assert fc["value_ge_50m"]["n"] > 10


def test_calibration_tables(art):
    cal = art.overview["classification"]["clean_mode"]["calibration"]
    assert sum(b["n"] for b in cal["top_label"]) == 484
    assert set(cal["per_class"]) == set(CLASSES)
    for bins in [cal["top_label"], *cal["per_class"].values()]:
        for b in bins:
            assert 0 <= b["predicted"] <= 1 and 0 <= b["observed"] <= 1 and b["lo"] <= b["predicted"] <= b["hi"] + 1e-9
    for task in ("forecast", "fundamental", "profile"):
        tiers = art.overview["regression"]["tasks"][task]["intervals"]["coverage_by_value_tier"]
        assert sum(t["n"] for t in tiers) == 484


def test_outlook_evaluation_tables(art):
    v = art.overview["outlook"]["validation"]
    assert len(v["deciles"]) == 10
    assert v["deciles"][-1]["realised_median"] > v["deciles"][0]["realised_median"]
    assert [t["threshold"] for t in v["threshold_sweep"]] == [0.5, 0.6, 0.7, 0.8]
    sweep = {t["threshold"]: t for t in v["threshold_sweep"]}
    assert sweep[0.7]["buy_n"] == v["buy"]["n"] and sweep[0.7]["buy_went_up"] == v["buy"]["went_up"]
    assert v["calibration"]["p_up"] and v["calibration"]["p_down"]
    assert v["by_age"] and v["by_value_tier"]
    assert v["feature_importance"][0]["importance"] > 0


def test_segment_error_tables(client):
    seg = client.get("/api/test-predictions").json()["error_analysis"]["segments"]
    assert set(seg) == {"value_tier", "age", "position_group", "league"}
    assert sum(r["n"] for r in seg["value_tier"]) == 484
    assert sum(r["n"] for r in seg["league"]) == 484
    for rows in seg.values():
        for r in rows:
            assert {"segment", "n", "forecast", "naive", "fundamental", "accuracy", "persistence_accuracy"} <= set(r)
            assert r["forecast_beats_naive_log"] == (r["forecast"]["rmse_log"] < r["naive"]["rmse_log"])


def test_leak_audit_shows_the_csv_summary_leak(art):
    a = art.overview["leak_audit"]
    assert a["rule_accuracy"] == 1.0
    assert a["target_equals_csv_peak_when_exposed"] == 1.0
    assert 0.15 < a["share_players_target_exposed"] < 0.2
    c = a["contamination_test"]
    assert c["with_csv_columns"]["accuracy"] > c["without_csv_columns"]["accuracy"] + 0.05
    assert c["accuracy_inflation_pp"] > 5
    assert a["previous_pipeline"]["reported_clean_classifier"]["accuracy"] == pytest.approx(0.8512, abs=1e-3)


def test_data_and_model_card(client, art):
    o = client.get("/api/overview").json()
    d, m = o["data_card"], o["model_card"]
    assert d["players"] == 2418 and d["data_as_of"] >= "2026-01-01" and d["first_valuation"] < "2006-01-01"
    assert d["known_gaps"] and d["intended_use"] and d["not_for"]
    assert m["version"] == mp._fingerprint() and m["trained_at"] and m["scikit_learn"]
    assert set(m["models"]) == {"classifier", "classifier_profile", "forecast", "fundamental", "profile", "outlook"}
    h = client.get("/api/health").json()
    assert h["model_version"] == m["version"] and h["data_as_of"] == d["data_as_of"]


def test_feature_groups_cover_every_forecast_feature():
    import evaluation as ev

    ev.assert_groups_cover_features()
    assert set(ev.GROUP_KEY_FEATURE) == set(ev.FEATURE_GROUPS)


def test_explain_row_isolates_the_changed_group():
    import evaluation as ev

    rng = np.random.default_rng(0)
    bg = pd.DataFrame({"a": rng.normal(size=200), "b": rng.normal(size=200), "c": rng.normal(size=200)})
    row = pd.DataFrame({"a": [3.0], "b": [0.0], "c": [5.0]})
    exp = ev.explain_row(lambda X: (2 * X["a"] + X["b"]).to_numpy(), row, bg, {"A": ["a"], "B": ["b"], "C": ["c"]})
    by = {c["group"]: c["contribution"] for c in exp["contributions"]}
    assert by["A"] == pytest.approx(2 * (3.0 - bg["a"].mean()), abs=1e-3)
    assert by["B"] == pytest.approx(0.0 - bg["b"].mean(), abs=1e-3)
    assert by["C"] == 0.0  # unused feature: no contribution
    assert exp["contributions"][0]["group"] == "A" and exp["prediction"] == 6.0


def test_simulate_explanation_and_listed_reasons(client, art):
    o = art.test_predictions["outlook"]
    for r in o["buy"] + o["depreciation_risk"]:
        assert 1 <= len(r["reasons"]) <= 3
        assert all(c["contribution"] > 0 and c["group"] and "key_value" in c for c in r["reasons"])
    pid = o["depreciation_risk"][0]["player_id"]
    plain = client.post("/api/simulate", json={"player_id": pid}).json()
    assert "explanation" not in plain
    out = client.post("/api/simulate", json={"player_id": pid, "explain": True}).json()
    exp = out["explanation"]
    assert set(exp) == {"method", "p_up", "p_down", "expected_log_return"}
    assert exp["p_down"]["prediction"] == pytest.approx(out["outlook_12m"]["p_down"], abs=1e-3)
    assert exp["p_up"]["prediction"] == pytest.approx(out["outlook_12m"]["p_up"], abs=1e-3)
    assert len(exp["p_down"]["contributions"]) == 10
    listed = o["depreciation_risk"][0]["reasons"][0]
    top_positive = next(c for c in exp["p_down"]["contributions"] if c["contribution"] > 0)
    assert top_positive["group"] == listed["group"]
