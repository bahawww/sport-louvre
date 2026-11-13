"""Print the before/after metrics report (Markdown) for the current artifacts.

Usage (inside the API image): python report.py > reports/metrics_report.md
`reports/before_metrics.json` was measured on the previous pipeline (commit c8eade6) on the
same 484 test players.
"""

from __future__ import annotations

import json
from pathlib import Path

import ml_pipeline

HERE = Path(__file__).resolve().parent


def eur(x: float) -> str:
    return f"€{x / 1e6:.2f}M"


def main() -> None:
    before = json.loads((HERE / "reports" / "before_metrics.json").read_text())
    art = ml_pipeline.build_artifacts(log=lambda _m: None)
    o = art.overview
    c = o["classification"]
    tasks = o["regression"]["tasks"]
    pick = lambda block: next(m for m in block["models"] if m["name"] == block["best_model"])
    clean, leak, prof = pick(c["clean_mode"]), pick(c["leakage_mode"]), pick(c["profile_mode"])
    fc, fd, pr = pick(tasks["forecast"]), pick(tasks["fundamental"]), pick(tasks["profile"])
    naive = next(m for m in tasks["forecast"]["models"] if m["name"].startswith("Naive"))
    persist = next(m for m in c["clean_mode"]["models"] if m["name"].startswith("Persistence"))
    b_clf, b_reg = before["pipeline_clean_clf"], before["pipeline_reg"]
    s_clf, s_reg = before["simulate_path_clf"], before["simulate_path_reg"]
    out: list[str] = []
    w = out.append

    card, mc = o["data_card"], o["model_card"]
    w("# Metrics report: before vs after\n")
    w(f"Model version `{mc['version']}`, trained {mc['trained_at']} (scikit-learn {mc['scikit_learn']}, seed {mc['seed']}). "
      f"Data as of {card['data_as_of']}: {card['players']} players, {card['valuation_points']} valuations since {card['first_valuation']}.\n")
    hc = c["clean_mode"]["headline"]
    hf = tasks["forecast"]["headline"]
    w("## 0. Headline: model vs baseline\n")
    w("| Task | Model | Baseline | Verdict |")
    w("|---|---|---|---|")
    w(f"| Trajectory (accuracy / macro-F1) | {hc['metrics']['accuracy']:.3f} / {hc['metrics']['macro_f1']:.3f} | "
      f"persistence {hc['persistence']['accuracy']:.3f} / {hc['persistence']['macro_f1']:.3f} | "
      f"+{hc['gain_vs_persistence']['accuracy_pp']:.1f} pp accuracy, +{hc['gain_vs_persistence']['macro_f1_pp']:.1f} pp macro-F1, "
      f"log-loss −{hc['gain_vs_persistence']['log_loss_reduction']:.0%} |")
    w(f"| Forecast, euro (MAE / RMSE) | {eur(hf['metrics']['mae'])} / {eur(hf['metrics']['rmse'])} | "
      f"naive {eur(hf['naive_last_value']['mae'])} / {eur(hf['naive_last_value']['rmse'])} | "
      f"{'beats' if hf['beats_naive_eur'] else '**does not beat**'} naive |")
    w(f"| Forecast, log (RMSE log) | {hf['metrics']['rmse_log']:.4f} | naive {hf['naive_last_value']['rmse_log']:.4f} | "
      f"{'beats' if hf['beats_naive_log'] else '**does not beat**'} naive ({hf['skill_vs_naive']['rmse_log']:.0%} less error) |")
    t50 = hf["value_ge_50m"]
    w(f"| Forecast, players ≥ €50M (MAE, n={t50['n']}) | {eur(t50['metrics']['mae'])} | naive {eur(t50['naive_last_value']['mae'])} | "
      f"{'beats' if t50['skill_vs_naive']['mae'] > 0 else '**does not beat**'} naive |")
    ov = o["outlook"]["validation"]
    w(f"| 12-month outlook, buy signal hit rate | {ov['buy']['went_up']:.1%} | base rate {ov['base_rate']['up']:.1%} | "
      f"+{(ov['buy']['went_up'] - ov['base_rate']['up']) * 100:.0f} pp |")
    w(f"| 12-month outlook, risk signal hit rate | {ov['depreciation_risk']['went_down']:.1%} | base rate {ov['base_rate']['down']:.1%} | "
      f"+{(ov['depreciation_risk']['went_down'] - ov['base_rate']['down']) * 100:.0f} pp |")
    w("")
    w(f"Test set: the same {o['dataset']['test_size']} players (stratified 80:20, seed 42), "
      "target = each player's last valuation update.\n")

    w("## 1. Leak found in the previous \"Clean\" mode\n")
    lp = before["leak_probe"]
    w(f"- `peak_value_eur > pre_peak_value_eur` identified `rising_star` with accuracy "
      f"**{lp['rule_peak_gt_prepeak_equals_rising_star']:.0%}**; `years_past_peak == 0` did the same.")
    w(f"- In those rows ({lp['share_rows_target_exposed']:.1%} of players) `peak_value_eur` "
      f"**was** the target value ({lp['target_equals_peak_when_peak_gt_prepeak']:.0%} equal).")
    w("- Cause: CSV summary columns are computed over the full history, target point included. "
      "The old numbers below are therefore inflated and not a fair baseline.")
    ct = o["leak_audit"]["contamination_test"]
    w(f"- Reproduced on the current pipeline: adding `{'`, `'.join(ct['columns_added'])}` from the CSV to the same classifier "
      f"lifts accuracy from {ct['without_csv_columns']['accuracy']:.4f} to {ct['with_csv_columns']['accuracy']:.4f} "
      f"(+{ct['accuracy_inflation_pp']:.1f} pp).\n")

    w("## 2. Trajectory classification (5 classes)\n")
    w("| Metric | Before: pipeline (leaky) | Before: `/api/simulate` path | After: clean | After: persistence baseline |")
    w("|---|---|---|---|---|")
    for k, label in [("accuracy", "Accuracy"), ("macro_f1", "Macro-F1"), ("f1_weighted", "Weighted F1"),
                     ("ece", "ECE"), ("brier", "Brier"), ("log_loss", "Log-loss")]:
        w(f"| {label} | {b_clf[k]:.4f} | {s_clf[k]:.4f} | **{clean[k]:.4f}** | {persist[k]:.4f} |")
    cv = c["clean_mode"]["validation"]["group_kfold"][c["clean_mode"]["best_model"]]
    w(f"\nSelected model: **{c['clean_mode']['best_model']}** (chosen by GroupKFold log-loss on training players, not on the test set).")
    w(f"GroupKFold(5) by player: accuracy {cv['accuracy_mean']:.4f} ± {cv['accuracy_std']:.4f}, "
      f"macro-F1 {cv['macro_f1_mean']:.4f} ± {cv['macro_f1_std']:.4f}, log-loss {cv['log_loss_mean']:.4f}.")
    fx = c["clean_mode"]["validation"]["fixed_horizon"][c["clean_mode"]["best_model"]]
    w(f"Fixed horizon (date of the next update not known, horizon pinned to 0.45y): accuracy {fx['accuracy']:.4f}, "
      f"macro-F1 {fx['macro_f1']:.4f}, ECE {fx['ece']:.4f}, Brier {fx['brier']:.4f}, log-loss {fx['log_loss']:.4f}.")
    w(f"Leakage demo ({c['leakage_mode']['best_model']} + CSV leak columns): accuracy {leak['accuracy']:.4f}.")
    w(f"Synthetic-profile classifier (form fields only): accuracy {prof['accuracy']:.4f}, macro-F1 {prof['macro_f1']:.4f}, ECE {prof['ece']:.4f}.\n")

    w("## 3. Regression\n")
    w("| Model | MAE | RMSE | R² (€) | MAE log | RMSE log | R² log | Median APE |")
    w("|---|---|---|---|---|---|---|---|")
    def line(name: str, m: dict) -> None:
        w(f"| {name} | {eur(m['mae'])} | {eur(m['rmse'])} | {m['r2']:.4f} | {m['mae_log']:.4f} | "
          f"{m['rmse_log']:.4f} | {m['r2_log']:.4f} | {m['medape']:.1%} |")
    line("Before: Linear Regression (leaky features)", b_reg)
    line("Before: `/api/simulate` path, same players", s_reg)
    line("Naive: last value", naive)
    line(f"After: Forecast ({tasks['forecast']['best_model']})", fc)
    line(f"After: Fundamental ({tasks['fundamental']['best_model']})", fd)
    line(f"After: Profile ({tasks['profile']['best_model']})", pr)
    line("After: Forecast, fixed horizon", tasks["forecast"]["validation"]["fixed_horizon"][tasks["forecast"]["best_model"]])
    w("\nOn this holdout the forecast model does **not** beat the naive baseline in euro terms "
      "(MAE, RMSE, R²); it wins on the log scale, in grouped CV and out-of-time.\n")
    w("### Players worth ≥ €50M (holdout)\n")
    w("| Model | n | MAE | RMSE | MAE log | RMSE log | Median APE |")
    w("|---|---|---|---|---|---|---|")
    old_rows = json.loads((HERE / "reports" / "before_test_predictions.json").read_text())["rows"]
    old_top = [r for r in old_rows if r["actual_value_eur"] >= 50_000_000]
    old_m = ml_pipeline.reg_metrics([r["actual_value_eur"] for r in old_top], [r["pred_value_eur"] for r in old_top])
    w(f"| Before: Linear Regression (leaky features) | {len(old_top)} | {eur(old_m['mae'])} | {eur(old_m['rmse'])} | "
      f"{old_m['mae_log']:.4f} | {old_m['rmse_log']:.4f} | {old_m['medape']:.1%} |")
    for name, m in tasks["forecast"]["validation"]["holdout_value_ge_50m"].items():
        w(f"| After: {name} | {m['n']} | {eur(m['mae'])} | {eur(m['rmse'])} | {m['mae_log']:.4f} | {m['rmse_log']:.4f} | {m['medape']:.1%} |")
    probe = tasks["fundamental"]["tautology_probe"]
    w(f"\nTautology probe: predicting the *last known price* from the fundamental features gives "
      f"R² log {probe['r2_log']:.3f}, median APE {probe['medape']:.1%} (a copy of the price would give 1.0 / 0%).\n")

    w("### Grouped CV (5 folds by player, training players)\n")
    w("| Task | Model | MAE | R² (€) | RMSE log | R² log |")
    w("|---|---|---|---|---|---|")
    for task, t in tasks.items():
        for name, m in t["validation"]["group_kfold"].items():
            w(f"| {task} | {name} | {eur(m['mae_mean'])} | {m['r2_mean']:.4f} | "
              f"{m['rmse_log_mean']:.4f} ± {m['rmse_log_std']:.4f} | {m['r2_log_mean']:.4f} |")

    w("\n## 4. Out-of-time validation\n")
    oot = o["out_of_time"]
    w(f"Models refit on training-player rows with target date < {oot['cutoff']} ({oot['train_rows']} rows), "
      "scored on updates on/after the cutoff.\n")
    w("| Set | Rows | Model | Accuracy | Macro-F1 | ECE | Brier |")
    w("|---|---|---|---|---|---|---|")
    for sname, s in oot["sets"].items():
        for name, m in s["classification"].items():
            w(f"| {sname} | {s['rows']} | {name} | {m['accuracy']:.4f} | {m['macro_f1']:.4f} | {m['ece']:.4f} | {m['brier']:.4f} |")
    w("\n| Set | Task | Model | MAE | RMSE | R² (€) | RMSE log | R² log |")
    w("|---|---|---|---|---|---|---|---|")
    for sname, s in oot["sets"].items():
        for task, models in s["regression"].items():
            for name, m in models.items():
                w(f"| {sname} | {task} | {name} | {eur(m['mae'])} | {eur(m['rmse'])} | {m['r2']:.4f} | {m['rmse_log']:.4f} | {m['r2_log']:.4f} |")

    w("\n## 5. Prediction intervals\n")
    w(f"Before: `max(0.65·MAE, 15%)` band, empirical coverage on the simulate path **{before['simulate_path_range_coverage']:.1%}** (no stated level).\n")
    w("| Task | Nominal | Holdout coverage | Median hi/lo ratio | Calibration rows |")
    w("|---|---|---|---|---|")
    for task, t in tasks.items():
        r = t["intervals"]["holdout"]
        w(f"| {task} | {r['level']:.0%} | {r['coverage']:.1%} | {r['median_width_ratio']:.2f}× | {t['intervals']['n_calibration']} |")

    w("\n## 6. Train-serving consistency\n")
    ag = before["simulate_vs_pipeline_agreement"]
    w(f"- Before: `/api/simulate` agreed with the evaluated pipeline on the trajectory for {ag['trajectory_same']:.1%} of test players; "
      f"median value difference {ag['value_median_abs_rel_diff']:.1%}.")
    w("- After: `tests/test_pipeline.py::test_simulate_backtest_features_equal_the_scored_test_matrix` asserts exact equality "
      "of every feature for all 484 test players, and backtest predictions equal `/api/test-predictions`.\n")

    sc = art.test_predictions["screening_all"]
    w("## 7. Screening (fundamental model, out-of-fold, all players)\n")
    w(f"Status counts: {sc['status_counts']}. Basis: {sc['basis_counts']}. Out-of-fold R² (€) {sc['metrics']['r2']:.4f}, "
      f"R² log {sc['metrics']['r2_log']:.4f}, out-of-fold band coverage {sc['band_coverage']:.1%}.")
    w(f"\nCorrelation between the log gap (fair/market) and the price return of the hidden 12 months: "
      f"**{sc['gap_vs_hidden_window_return_corr']:.2f}**. The screen is to a large extent a 12-month reversal rank: "
      "it lists players whose price moved more than their year-old profile and age explain. "
      "Players at a new all-time high inside that window are labelled `breakout` and not flagged.")
    ol = art.test_predictions["outlook"]
    v = ol["validation"]
    w("\n## 8. 12-month outlook (drives the Recommendations panel)\n")
    w(f"Out-of-time: fit on targets before {v['cutoff']} ({v['train_rows']} rows), scored on {v['test_rows']} later "
      f"prefixes of {v['test_players']} players. Rank correlation predicted vs realised return {v['rank_correlation']:.2f}; "
      f"80% interval coverage {v['interval_coverage']:.1%}.\n")
    w("| Group (value ≥ €3M) | n | Went up >5% | Went down >5% | Median log return |")
    w("|---|---|---|---|---|")
    w(f"| All players (base rate) | {v['base_rate']['n']} | {v['base_rate']['up']:.1%} | {v['base_rate']['down']:.1%} | |")
    w(f"| Signal Buy (P up ≥ {ol['threshold']}) | {v['buy']['n']} | {v['buy']['went_up']:.1%} | {v['buy']['went_down']:.1%} | {v['buy']['median_log_return']:+.2f} |")
    d = v["depreciation_risk"]
    w(f"| Signal Depreciation risk (P down ≥ {ol['threshold']}) | {d['n']} | {d['went_up']:.1%} | {d['went_down']:.1%} | {d['median_log_return']:+.2f} |")
    f = v["fell_over_40pct_prior_12m"]
    w(f"| Old screen logic: price fell >40% in prior 12 months | {f['n']} | {f['went_up']:.1%} | {f['went_down']:.1%} | {f['median_log_return']:+.2f} |")
    w(f"\nCurrent signals: {ol['signal_counts']}.")
    w("\n### Predicted vs realised 12-month return by decile (out-of-time)\n")
    w("| Decile | n | Predicted median | Realised median | Went up | Went down |")
    w("|---|---|---|---|---|---|")
    for dd in v["deciles"]:
        w(f"| {dd['decile']} | {dd['n']} | {dd['predicted_median']:+.2f} | {dd['realised_median']:+.2f} | {dd['share_up']:.0%} | {dd['share_down']:.0%} |")
    w("\n### Hit rate by probability threshold (value ≥ €3M)\n")
    w("| Threshold | Buy n | Went up | Risk n | Went down |")
    w("|---|---|---|---|---|")
    for t in v["threshold_sweep"]:
        w(f"| {t['threshold']:.1f} | {t['buy_n']} | {t['buy_went_up']:.1%} | {t['risk_n']} | {t['risk_went_down']:.1%} |")
    w("\n### Calibration of P(up)\n")
    w("| Predicted | Observed | n |")
    w("|---|---|---|")
    for b in v["calibration"]["p_up"]:
        w(f"| {b['predicted']:.2f} | {b['observed']:.2f} | {b['n']} |")
    w("\n### Signals by age (out-of-time)\n")
    w("| Age | n | Base up | Base down | Buy n | Buy went up | Risk n | Risk went down |")
    w("|---|---|---|---|---|---|---|---|")
    fmtp = lambda x: "-" if x is None else f"{x:.0%}"
    for sgm in v["by_age"]:
        w(f"| {sgm['segment']} | {sgm['n']} | {sgm['base_up']:.0%} | {sgm['base_down']:.0%} | {sgm['buy_n']} | {fmtp(sgm['buy_went_up'])} | {sgm['risk_n']} | {fmtp(sgm['risk_went_down'])} |")
    w("\nTop outlook features (permutation, out-of-time): "
      + ", ".join(f"`{f['feature']}` {f['importance']:.2f}" for f in v["feature_importance"][:6]) + ".")

    w("\n## 9. Calibration of the trajectory classifier (holdout)\n")
    w("| Confidence bin | n | Mean confidence | Accuracy |")
    w("|---|---|---|---|")
    for b in c["clean_mode"]["calibration"]["top_label"]:
        w(f"| {b['lo']:.1f}-{b['hi']:.1f} | {b['n']} | {b['predicted']:.3f} | {b['observed']:.3f} |")
    w("\n### Interval coverage by value tier (nominal 80%)\n")
    w("| Task | Tier | n | Coverage | Median hi/lo |")
    w("|---|---|---|---|---|")
    for task, t in tasks.items():
        for tier in t["intervals"]["coverage_by_value_tier"]:
            w(f"| {task} | {tier['segment']} | {tier['n']} | {tier['coverage']:.1%} | {tier['median_width_ratio']:.2f}× |")

    w("\nIntervals under-cover for players worth ≥ €50M on all three tasks (small n): treat ranges for superstars as too narrow.")
    w("\n## 10. Error by segment (holdout)\n")
    seg = art.test_predictions["error_analysis"]["segments"]
    for dim, rows_ in seg.items():
        w(f"### {dim}\n")
        w("| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |")
        w("|---|---|---|---|---|---|---|---|---|---|")
        for r in rows_:
            w(f"| {r['segment']} | {r['n']} | {eur(r['forecast']['mae'])} | {eur(r['naive']['mae'])} | {r['forecast']['rmse_log']:.3f} | "
              f"{r['naive']['rmse_log']:.3f} | {r['forecast']['bias_pct']:+.1f}% | {r['fundamental']['medape']:.0%} | {r['accuracy']:.1%} | {r['persistence_accuracy']:.1%} |")
        w("")

    w("## 11. Why a player is on the list (example explanations)\n")
    w(ol["explanation_method"] + "\n")
    for title, key in (("Buy", "buy"), ("Depreciation risk", "depreciation_risk")):
        w(f"| {title} | Value now | Expected | Top reasons (group: key value, contribution) |")
        w("|---|---|---|---|")
        for r in ol[key][:5]:
            reasons = "; ".join(f"{x['group']}: {x['key_feature']}={x['key_value']} ({x['contribution']:+.2f})" for x in r["reasons"])
            w(f"| {r['name']} ({r['age']:.0f}) | {eur(r['current_value_eur'])} | {eur(r['expected_value_eur'])} | {reasons} |")
        w("")

    w("## 12. Data card\n")
    w(f"- Source: {card['source']}")
    w(f"- Population: {card['population']}")
    w(f"- Unit: {card['unit']}")
    w(f"- Label: {card['label']}")
    w(f"- Repairs: {card['repairs']['positions_repaired_from_sidecar']} positions repaired, {card['repairs']['positions_still_unknown']} unknown, "
      f"{card['repairs']['age_values_replaced_from_history']} ages replaced from history, {card['repairs']['history_rows_dropped_nonpositive']} non-positive valuations dropped.")
    w("- Known gaps: " + " ".join(card["known_gaps"]))
    w(f"- Intended use: {card['intended_use']}")
    w(f"- Not for: {card['not_for']}")
    w(f"\nTraining time: {o['methodology']['training_seconds']} s. Panel rows used for training: {o['dataset']['train_rows']}.")
    print("\n".join(out))


if __name__ == "__main__":
    main()
