# Metrics report: before vs after

Test set: the same 484 players (stratified 80:20, seed 42), target = each player's last valuation update.

## 1. Leak found in the previous "Clean" mode

- `peak_value_eur > pre_peak_value_eur` identified `rising_star` with accuracy **100%**; `years_past_peak == 0` did the same.
- In those rows (17.9% of players) `peak_value_eur` **was** the target value (100% equal).
- Cause: CSV summary columns are computed over the full history, target point included. The old numbers below are therefore inflated and not a fair baseline.

## 2. Trajectory classification (5 classes)

| Metric | Before: pipeline (leaky) | Before: `/api/simulate` path | After: clean | After: persistence baseline |
|---|---|---|---|---|
| Accuracy | 0.8512 | 0.4091 | **0.6777** | 0.6529 |
| Macro-F1 | 0.7846 | 0.3301 | **0.6260** | 0.5128 |
| Weighted F1 | 0.8417 | 0.3511 | **0.6736** | 0.5840 |
| ECE | 0.0193 | 0.4363 | **0.0273** | 0.2671 |
| Brier | 0.2238 | 0.9987 | **0.4171** | 0.6328 |
| Log-loss | 0.4375 | 7.6538 | **0.7147** | 1.4123 |

Selected model: **Ordinal HGB (calibrated)** (chosen by GroupKFold log-loss on training players, not on the test set).
GroupKFold(5) by player: accuracy 0.7135 ± 0.0140, macro-F1 0.6635 ± 0.0090, log-loss 0.6754.
Fixed horizon (date of the next update not known, horizon pinned to 0.45y): accuracy 0.6694, macro-F1 0.5821, ECE 0.0381, Brier 0.4173, log-loss 0.7210.
Leakage demo (Ordinal HGB (calibrated) + CSV leak columns): accuracy 1.0000.
Synthetic-profile classifier (form fields only): accuracy 0.5207, macro-F1 0.4574, ECE 0.0385.

## 3. Regression

| Model | MAE | RMSE | R² (€) | MAE log | RMSE log | R² log | Median APE |
|---|---|---|---|---|---|---|---|
| Before: Linear Regression (leaky features) | €1.07M | €2.32M | 0.9863 | 0.3873 | 1.6768 | -0.2380 | 9.0% |
| Before: `/api/simulate` path, same players | €4.04M | €8.93M | 0.7975 | 1.2403 | 3.3939 | -4.0717 | 23.2% |
| Naive: last value | €1.63M | €3.50M | 0.9689 | 0.1723 | 0.2959 | 0.9614 | 12.5% |
| After: Forecast (HistGradientBoosting (log)) | €1.66M | €3.62M | 0.9666 | 0.1700 | 0.2538 | 0.9716 | 11.6% |
| After: Fundamental (HistGradientBoosting (log)) | €5.58M | €10.72M | 0.7078 | 0.5642 | 0.7718 | 0.7377 | 39.9% |
| After: Profile (HistGradientBoosting (log)) | €3.04M | €6.16M | 0.9036 | 0.3152 | 0.4462 | 0.9124 | 22.2% |
| After: Forecast, fixed horizon | €1.60M | €3.52M | 0.9686 | 0.1669 | 0.2538 | 0.9716 | 11.2% |

On this holdout the forecast model does **not** beat the naive baseline in euro terms (MAE, RMSE, R²); it wins on the log scale, in grouped CV and out-of-time.

### Players worth ≥ €50M (holdout)

| Model | n | MAE | RMSE | MAE log | RMSE log | Median APE |
|---|---|---|---|---|---|---|
| Before: Linear Regression (leaky features) | 27 | €4.17M | €7.65M | 0.0478 | 0.0667 | 2.8% |
| After: HistGradientBoosting (log) | 27 | €8.90M | €12.36M | 0.1152 | 0.1403 | 9.4% |
| After: Ridge (log) | 27 | €9.24M | €12.82M | 0.1221 | 0.1547 | 10.1% |
| After: Naive (last value) | 27 | €7.04M | €10.63M | 0.0981 | 0.1456 | 7.7% |

Tautology probe: predicting the *last known price* from the fundamental features gives R² log 0.776, median APE 36.9% (a copy of the price would give 1.0 / 0%).

### Grouped CV (5 folds by player, training players)

| Task | Model | MAE | R² (€) | RMSE log | R² log |
|---|---|---|---|---|---|
| forecast | HistGradientBoosting (log) | €1.49M | 0.9770 | 0.2343 ± 0.0222 | 0.9737 |
| forecast | Ridge (log) | €1.70M | 0.9702 | 0.2463 ± 0.0216 | 0.9710 |
| forecast | Naive (last value) | €1.57M | 0.9690 | 0.2719 ± 0.0319 | 0.9641 |
| fundamental | HistGradientBoosting (log) | €5.34M | 0.7266 | 0.7636 ± 0.0298 | 0.7232 |
| fundamental | Ridge (log) | €5.90M | 0.6211 | 0.7914 ± 0.0300 | 0.7026 |
| profile | HistGradientBoosting (log) | €2.84M | 0.9083 | 0.4579 ± 0.0259 | 0.9005 |
| profile | Ridge (log) | €3.37M | 0.8686 | 0.5255 ± 0.0215 | 0.8689 |

## 4. Out-of-time validation

Models refit on training-player rows with target date < 2025-01-01 (18509 rows), scored on updates on/after the cutoff.

| Set | Rows | Model | Accuracy | Macro-F1 | ECE | Brier |
|---|---|---|---|---|---|---|
| unseen_players_future | 814 | Ordinal HGB (calibrated) | 0.6695 | 0.6183 | 0.0280 | 0.4357 |
| unseen_players_future | 814 | Persistence (last state) | 0.5172 | 0.4570 | 0.4028 | 0.8770 |
| seen_players_future | 3191 | Ordinal HGB (calibrated) | 0.7104 | 0.6617 | 0.0295 | 0.3964 |
| seen_players_future | 3191 | Persistence (last state) | 0.5406 | 0.4826 | 0.3794 | 0.8350 |

| Set | Task | Model | MAE | RMSE | R² (€) | RMSE log | R² log |
|---|---|---|---|---|---|---|---|
| unseen_players_future | forecast | HistGradientBoosting (log) | €2.48M | €4.44M | 0.9628 | 0.2916 | 0.9627 |
| unseen_players_future | forecast | Naive (last value) | €2.82M | €4.99M | 0.9529 | 0.3711 | 0.9396 |
| unseen_players_future | fundamental | HistGradientBoosting (log) | €7.66M | €13.35M | 0.6635 | 0.8150 | 0.7087 |
| unseen_players_future | profile | HistGradientBoosting (log) | €4.13M | €7.59M | 0.8911 | 0.4434 | 0.9138 |
| seen_players_future | forecast | HistGradientBoosting (log) | €2.21M | €3.85M | 0.9697 | 0.3035 | 0.9561 |
| seen_players_future | forecast | Naive (last value) | €2.57M | €4.61M | 0.9565 | 0.3993 | 0.9240 |
| seen_players_future | fundamental | HistGradientBoosting (log) | €6.96M | €12.00M | 0.7059 | 0.7966 | 0.6974 |
| seen_players_future | profile | HistGradientBoosting (log) | €3.52M | €6.27M | 0.9198 | 0.4252 | 0.9138 |

## 5. Prediction intervals

Before: `max(0.65·MAE, 15%)` band, empirical coverage on the simulate path **44.8%** (no stated level).

| Task | Nominal | Holdout coverage | Median hi/lo ratio | Calibration rows |
|---|---|---|---|---|
| forecast | 80% | 80.6% | 1.57× | 1642 |
| fundamental | 80% | 83.3% | 6.20× | 1642 |
| profile | 80% | 82.0% | 2.81× | 1642 |

## 6. Train-serving consistency

- Before: `/api/simulate` agreed with the evaluated pipeline on the trajectory for 43.4% of test players; median value difference 20.1%.
- After: `tests/test_pipeline.py::test_simulate_backtest_features_equal_the_scored_test_matrix` asserts exact equality of every feature for all 484 test players, and backtest predictions equal `/api/test-predictions`.

## 7. Screening (fundamental model, out-of-fold, all players)

Status counts: {'Undervalued': 254, 'Fair': 2128, 'Overvalued': 36}. Basis: {'ok': 2157, 'breakout': 172, 'short_history': 89}. Out-of-fold R² (€) 0.7185, R² log 0.7333, out-of-fold band coverage 80.3%.

Correlation between the log gap (fair/market) and the price return of the hidden 12 months: **-0.70**. The screen is to a large extent a 12-month reversal rank: it lists players whose price moved more than their year-old profile and age explain. Players at a new all-time high inside that window are labelled `breakout` and not flagged.

## 8. 12-month outlook (drives the Recommendations panel)

Out-of-time: fit on targets before 2024-06-01 (20097 rows), scored on 2203 later prefixes of 1685 players. Rank correlation predicted vs realised return 0.62; 80% interval coverage 76.1%.

| Group (value ≥ €3M) | n | Went up >5% | Went down >5% | Median log return |
|---|---|---|---|---|
| All players (base rate) | 1527 | 48.0% | 41.7% | |
| Signal Buy (P up ≥ 0.7) | 112 | 81.2% | 10.7% | +0.77 |
| Signal Depreciation risk (P down ≥ 0.7) | 194 | 9.3% | 82.0% | -0.33 |
| Old screen logic: price fell >40% in prior 12 months | 212 | 21.7% | 64.6% | -0.22 |

Current signals: {'Buy': 77, 'Neutral': 1988, 'DepreciationRisk': 353}.

Training time: 389.2 s. Panel rows used for training: 21700.
