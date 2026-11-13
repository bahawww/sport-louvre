# API Contract (`/api/*`)

Base URL: `/api` (Caddy proxies to `api:8000`). Fields marked **new** were added in v2.0.0;
every field that existed before is still present with the same type.

## `GET /api/health`
`{ "status": "ok", "players": 2418, "history_rows": 47909, "model_version", "trained_at", "data_as_of" }`
(last three **new**)

## `GET /api/overview`
- `dataset`: `{ total_players, train_size, test_size, history_rows, leagues, trajectories }`
  - **new** `history_rows_used` (6 rows with `value_eur <= 0` are dropped), `panel_rows`, `train_rows`, `repairs`
- **new** `methodology`: `{ feature_source, label_rule, label_rule_match_rate, split, panel, model_selection, out_of_time_cutoff, interval_level, limits[], training_seconds }`
- `classification`
  - `classes`: `["rising_star","growing","stable","declining","falling_sharply"]`
  - `clean_mode` / `leakage_mode`: `{ models[], best_model }`; each model has
    `name, accuracy, f1_weighted, precision_weighted, recall_weighted, confusion_matrix (5x5), feature_importance[]`
    - **new** per model: `macro_f1, ece, brier, log_loss, ordinal_mae`
    - **new** on `clean_mode`: `features[]`, `validation.group_kfold[model]` (`*_mean` / `*_std`),
      `validation.fixed_horizon[model]` (same test rows, date of the next update not given)
  - **new** `profile_mode`: classifier used by the synthetic-profile simulator
- `regression`: `{ models[], best_model }` = the **forecast** task (legacy shape);
  each model has `name, mae, rmse, r2, feature_importance[]`
  - **new** per model: `mae_log, rmse_log, r2_log, medape`
  - **new** `task: "forecast"`, `tasks: { forecast, fundamental, profile }`, each
    `{ models[], best_model, features[], validation: { group_kfold, fixed_horizon, holdout_value_ge_50m }, intervals: { method, holdout: { level, coverage, median_width_ratio, n }, q_hat_log, n_calibration } }`
  - `tasks.fundamental.tautology_probe`: how well the fundamental features rebuild the last price
- **new** `classification.primary_view: "trend"` and `classification.trend`: the headline 4-class view
  (`rising_star` + `growing` merged into `rising`), derived from the same model's probabilities:
  `{ classes, mapping, definition, why, models[] (4x4 confusion_matrix, selective[]), best_model, validation{group_kfold, fixed_horizon}, calibration, headline }`.
  Every classifier metric block also carries `selective[]`: `{ min_confidence, coverage, accuracy }`.
- **new** `classification.clean_mode.headline`: selected model next to the persistence baseline
  (`metrics, persistence, gain_vs_persistence, fixed_horizon`); `calibration`: reliability bins
  (`top_label[]`, `per_class{}`; each bin `lo, hi, n, predicted, observed`).
- **new** `regression.tasks.<task>.headline`: `{ model, metrics, naive_last_value, skill_vs_naive, beats_naive_eur, beats_naive_log, value_ge_50m }`;
  `intervals.coverage_by_value_tier[]`.
- **new** `outlook`: evaluation of the 12-month outlook model: `{ task, threshold, min_value_eur, train_rows, validation }`,
  `validation` holds hit rates plus `deciles[]`, `threshold_sweep[]`, `calibration{p_up,p_down}`, `by_age[]`, `by_value_tier[]`, `feature_importance[]`.
- **new** `leak_audit`: `{ finding, rule, rule_accuracy, share_players_target_exposed, target_equals_csv_peak_when_exposed, contamination_test, previous_pipeline }`.
- **new** `data_card`: `{ source, players, valuation_points, first_valuation, data_as_of, population, unit, label, repairs, known_gaps[], intended_use, not_for }`.
- **new** `model_card`: `{ version, trained_at, python, scikit_learn, seed, models, training_seconds, tests }`.
- **new** `out_of_time`: `{ cutoff, train_rows, sets: { unseen_players_future, seen_players_future } }`,
  each set `{ rows, classification[model], regression[task][model] }`

## `GET /api/test-predictions`
- `rows` (484 test players, target = their last valuation update):
  `player_id, name, age, nationality, league_name, peak_club, actual_trajectory, pred_trajectory_clean, pred_trajectory_leakage, actual_value_eur, pred_value_eur, residual_eur, residual_pct, valuation_status`
  - `pred_value_eur` is the **fundamental fair value**; `residual_eur = pred - actual` (positive = undervalued).
  - `valuation_status`: `Undervalued` if `actual` is below the 80% conformal band of the fair value,
    `Overvalued` if above, else `Fair`.
  - **new** `valuation_basis`: `ok`, `breakout` (above the band with a new all-time high in the
    hidden 12 months) or `short_history` (< 12 months of history). Only `ok` rows are ever flagged.
  - **new**: `actual_trend, pred_trend, pred_trend_confidence` (4-class view),
    `position, position_group, fair_value_eur, fair_value_range_eur, previous_value_eur, forecast_value_eur, forecast_range_eur, forecast_residual_eur, pred_trajectory_confidence`
- `undervalued` / `overvalued`: up to 15 flagged test rows, largest absolute gap first.
- **new** `screening_all`: out-of-fold fair value for all 2,418 players:
  `{ method, players, metrics, band_coverage, gap_vs_hidden_window_return_corr, status_counts, basis_counts, undervalued[25], overvalued[25] }`
  (point estimate and band are both out-of-fold)
- **new** `outlook`: 12-month value outlook for all players; this drives the Recommendations panel.
  `{ method, horizon_months, threshold, min_value_eur, interval_level, validation, signal_counts, buy[30], depreciation_risk[30], limits[] }`
  - row: `player_id, name, age, nationality, league_name, position, peak_club, actual_trajectory, current_value_eur, valuation_date, expected_value_eur, expected_range_eur, expected_change_eur, expected_change_pct, p_up, p_down, signal`
  - `signal`: `Buy` when `p_up >= threshold`, `DepreciationRisk` when `p_down >= threshold`, else `Neutral`
    (always `Neutral` below `min_value_eur`). `p_up` / `p_down` = calibrated probability of a move beyond ±5%.
  - `validation`: out-of-time hit rates of both signals, base rates, and the same numbers for
    players whose price fell > 40% in the prior 12 months.
- `error_analysis`: `{ leakage_delta_acc, growing_vs_stable_confusion_count, top_underpredicted_superstars[], league_bias[] }`
  (`league_bias` and superstars use the forecast residual; **new** `league_bias_model`).
  - **new** `segments`: `{ value_tier[], age[], position_group[], league[] }`, each row
    `{ segment, n, forecast{mae,medape,bias_pct,rmse_log}, naive{...}, forecast_beats_naive_log, fundamental{...}, accuracy, persistence_accuracy }`.
- Outlook list rows carry **new** `reasons[]` (up to 3): `{ group, contribution, key_feature, key_value }`.

## `GET /api/history?q=&league=&limit=30`
`players[]`: `player_id, name, age, nationality, league_name, peak_club, current_value_eur, peak_value_eur, trajectory, history[{ date, value_eur, club, age_at_date }]`
- **new**: `position`, `position_group`. `limit` now accepts up to 3000.
- `age` is the age at the last valuation (the CSV `age` column is corrupt in legacy rows).

## `GET /api/datasets`, `GET /api/datasets/download/{filename}`
Unchanged. **new** per player: `position, position_group, age_at_peak, years_to_peak, value_volatility`.

## `POST /api/simulate`
Two modes, chosen by `player_id`.

### A. Real-player what-if (`player_id` set)
```json
{ "player_id": "433177",
  "scenario": { "horizon_years": 0.75, "league_name": "Serie A",
                "append_valuations": [{ "value_eur": 91000000, "years_after": 0.5 }],
                "backtest": false } }
```
- Features are rebuilt from the player's real history by the training feature code.
- `horizon_years` (0–1.5): time to the next update; age moves with it. Default 0.45.
- `league_name`: one of the five leagues.
- `append_valuations` (max 6): hypothetical future valuations appended to the history before
  features are computed. This is how momentum, drawdown and volatility are changed.
- `backtest: true`: hide the last real valuation and predict it (cannot be combined with other scenario fields).
- Club moves are not supported: the dataset has no usable club history.

### B. Synthetic profile (no `player_id`): API only
The web simulator no longer offers this mode; it works on real players only. The endpoint still
accepts the body below for backward compatibility.
Legacy body, still valid:
`{ age, age_at_peak, peak_value_eur, first_value_eur, career_span_years, years_to_peak, value_volatility, num_valuation_points, league_name, nationality }`
- **new** optional `position_group` (`Forward|Midfielder|Defender|Goalkeeper`); without it the
  prediction is averaged over the groups.
- `num_clubs_career` is accepted and ignored (a warning says so).
- Served by models trained on exactly these fields. Semantics: career summary so far → next update.

### Response (both modes)
`predicted_trajectory, trajectory_probabilities, predicted_value_eur, value_range_eur, scouting_verdict`
- **new** `predicted_trend`, `trend_probabilities` (4 classes; `rising` = `rising_star` + `growing`).
- `value_range_eur` is a conformal interval at `interval_level` (0.8), not a fixed percentage.
- **new**: `mode` (`player_whatif|player_backtest|synthetic_profile`), `interval_level`, `models`, `warnings[]`
- **new** in `player`: `history[{date,value_eur}]`, `hypothetical[{date,value_eur}]`, `forecast_date`,
  `age`, `peak_value_eur`, `position_group`, `nationality` (price path for charts).
- **new**, player modes only: `fair_value_eur, fair_value_range_eur, market_value_eur, valuation_gap_eur, valuation_gap_pct, valuation_status, valuation_basis, horizon_years, player{...}, features{...}`,
  and when a scenario is applied `baseline{...}` + `scenario_delta_eur`.
  Without scenario changes the response also carries `outlook_12m` (the player's outlook row).
  With request field `"explain": true` it adds `explanation`: `{ method, p_up, p_down, expected_log_return }`,
  each `{ prediction, typical, contributions[{ group, contribution, key_feature, key_value }] }` over 10 feature groups.

Errors: `404` unknown `player_id`; `422` missing profile fields, unknown league, or invalid scenario.
