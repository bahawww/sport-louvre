# Metrics report: before vs after

Model version `b5d331290304adf5`, trained 2026-11-13T22:17:26+00:00 (scikit-learn 1.6.1, seed 42). Data as of 2026-02-11: 2418 players, 47903 valuations since 2004-10-03.

## 0. Headline: model vs baseline

| Task | Model | Baseline | Verdict |
|---|---|---|---|
| Trajectory (accuracy / macro-F1) | 0.678 / 0.626 | persistence 0.653 / 0.513 | +2.5 pp accuracy, +11.3 pp macro-F1, log-loss −49% |
| Forecast, euro (MAE / RMSE) | €1.66M / €3.62M | naive €1.63M / €3.50M | **does not beat** naive |
| Forecast, log (RMSE log) | 0.2538 | naive 0.2959 | beats naive (14% less error) |
| Forecast, players ≥ €50M (MAE, n=27) | €8.90M | naive €7.04M | **does not beat** naive |
| 12-month outlook, buy signal hit rate | 81.2% | base rate 48.0% | +33 pp |
| 12-month outlook, risk signal hit rate | 82.0% | base rate 41.7% | +40 pp |

Test set: the same 484 players (stratified 80:20, seed 42), target = each player's last valuation update.

## 1. Leak found in the previous "Clean" mode

- `peak_value_eur > pre_peak_value_eur` identified `rising_star` with accuracy **100%**; `years_past_peak == 0` did the same.
- In those rows (17.9% of players) `peak_value_eur` **was** the target value (100% equal).
- Cause: CSV summary columns are computed over the full history, target point included. The old numbers below are therefore inflated and not a fair baseline.
- Reproduced on the current pipeline: adding `peak_value_eur`, `years_to_peak`, `career_span_years`, `value_volatility` from the CSV to the same classifier lifts accuracy from 0.6880 to 0.7810 (+9.3 pp).

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

### Predicted vs realised 12-month return by decile (out-of-time)

| Decile | n | Predicted median | Realised median | Went up | Went down |
|---|---|---|---|---|---|
| 1 | 221 | -0.36 | -0.36 | 6% | 87% |
| 2 | 220 | -0.22 | -0.25 | 20% | 65% |
| 3 | 220 | -0.13 | -0.03 | 37% | 50% |
| 4 | 220 | -0.06 | +0.00 | 45% | 37% |
| 5 | 221 | +0.02 | +0.07 | 54% | 37% |
| 6 | 220 | +0.12 | +0.12 | 54% | 35% |
| 7 | 220 | +0.22 | +0.34 | 68% | 22% |
| 8 | 220 | +0.36 | +0.47 | 65% | 20% |
| 9 | 220 | +0.55 | +0.85 | 77% | 14% |
| 10 | 221 | +0.93 | +1.76 | 90% | 5% |

### Hit rate by probability threshold (value ≥ €3M)

| Threshold | Buy n | Went up | Risk n | Went down |
|---|---|---|---|---|
| 0.5 | 614 | 68.9% | 602 | 63.5% |
| 0.6 | 359 | 71.6% | 369 | 73.2% |
| 0.7 | 112 | 81.2% | 194 | 82.0% |
| 0.8 | 5 | 100.0% | 61 | 98.4% |

### Calibration of P(up)

| Predicted | Observed | n |
|---|---|---|
| 0.06 | 0.00 | 101 |
| 0.15 | 0.20 | 133 |
| 0.26 | 0.31 | 179 |
| 0.35 | 0.39 | 217 |
| 0.45 | 0.51 | 283 |
| 0.55 | 0.65 | 255 |
| 0.65 | 0.67 | 247 |
| 0.74 | 0.80 | 107 |
| 0.83 | 1.00 | 5 |

### Signals by age (out-of-time)

| Age | n | Base up | Base down | Buy n | Buy went up | Risk n | Risk went down |
|---|---|---|---|---|---|---|---|
| 22-25 | 655 | 56% | 33% | 31 | 81% | 13 | 23% |
| 26-29 | 385 | 26% | 61% | 3 | 67% | 98 | 78% |
| ≤ 21 | 369 | 71% | 21% | 78 | 82% | 0 | - |
| ≥ 30 | 118 | 3% | 93% | 0 | - | 83 | 96% |

Top outlook features (permutation, out-of-time): `log_last` 0.91, `age` 0.02, `log_prev` 0.02, `n_points` 0.01, `log_peak` 0.01, `span_yr` 0.01.

## 9. Calibration of the trajectory classifier (holdout)

| Confidence bin | n | Mean confidence | Accuracy |
|---|---|---|---|
| 0.3-0.4 | 12 | 0.365 | 0.500 |
| 0.4-0.5 | 43 | 0.466 | 0.512 |
| 0.5-0.6 | 130 | 0.554 | 0.554 |
| 0.6-0.7 | 112 | 0.651 | 0.634 |
| 0.7-0.8 | 56 | 0.738 | 0.679 |
| 0.8-0.9 | 36 | 0.854 | 0.750 |
| 0.9-1.0 | 95 | 0.975 | 0.968 |

### Interval coverage by value tier (nominal 80%)

| Task | Tier | n | Coverage | Median hi/lo |
|---|---|---|---|---|
| forecast | < €5M | 213 | 81.2% | 1.75× |
| forecast | €5-20M | 160 | 81.9% | 1.55× |
| forecast | €20-50M | 84 | 82.1% | 1.38× |
| forecast | ≥ €50M | 27 | 63.0% | 1.28× |
| fundamental | < €5M | 213 | 82.6% | 7.73× |
| fundamental | €5-20M | 160 | 90.0% | 6.05× |
| fundamental | €20-50M | 84 | 79.8% | 4.12× |
| fundamental | ≥ €50M | 27 | 59.3% | 3.27× |
| profile | < €5M | 213 | 80.8% | 3.53× |
| profile | €5-20M | 160 | 88.8% | 2.62× |
| profile | €20-50M | 84 | 77.4% | 1.79× |
| profile | ≥ €50M | 27 | 66.7% | 1.46× |

Intervals under-cover for players worth ≥ €50M on all three tasks (small n): treat ranges for superstars as too narrow.

## 10. Error by segment (holdout)

### value_tier

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| < €5M | 228 | €0.43M | €0.46M | 0.324 | 0.370 | +5.9% | 49% | 67.1% | 64.9% |
| €20-50M | 75 | €2.75M | €2.49M | 0.124 | 0.127 | +3.6% | 30% | 64.0% | 66.7% |
| €5-20M | 148 | €1.61M | €1.90M | 0.192 | 0.250 | +4.7% | 37% | 73.7% | 66.9% |
| ≥ €50M | 33 | €7.92M | €6.61M | 0.135 | 0.138 | +3.2% | 38% | 54.5% | 57.6% |

### age

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| 22-25 | 158 | €2.10M | €1.99M | 0.244 | 0.234 | +6.1% | 38% | 57.6% | 56.3% |
| 26-29 | 135 | €1.55M | €1.50M | 0.176 | 0.206 | -0.7% | 39% | 77.8% | 73.3% |
| ≤ 21 | 114 | €1.99M | €1.77M | 0.376 | 0.463 | +9.9% | 57% | 55.3% | 53.5% |
| ≥ 30 | 77 | €0.48M | €0.93M | 0.138 | 0.214 | +3.1% | 31% | 89.6% | 87.0% |

### position_group

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| Defender | 160 | €1.49M | €1.60M | 0.262 | 0.316 | +2.1% | 36% | 65.0% | 63.7% |
| Forward | 135 | €2.17M | €1.84M | 0.213 | 0.233 | +7.0% | 49% | 65.9% | 68.2% |
| Goalkeeper | 53 | €0.48M | €0.54M | 0.368 | 0.391 | +4.1% | 34% | 67.9% | 64.1% |
| Midfielder | 130 | €1.59M | €1.80M | 0.214 | 0.276 | +5.2% | 40% | 73.9% | 64.6% |

### league

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| Bundesliga | 96 | €1.13M | €0.91M | 0.217 | 0.234 | +1.9% | 34% | 60.4% | 67.7% |
| La Liga | 82 | €1.45M | €1.38M | 0.265 | 0.316 | +3.4% | 46% | 72.0% | 72.0% |
| Ligue 1 | 84 | €1.04M | €0.96M | 0.290 | 0.371 | +4.9% | 45% | 66.7% | 57.1% |
| Premier League | 115 | €2.97M | €3.04M | 0.239 | 0.276 | +5.8% | 34% | 67.0% | 58.3% |
| Serie A | 107 | €1.38M | €1.50M | 0.261 | 0.284 | +6.3% | 49% | 72.9% | 72.0% |

## 11. Why a player is on the list (example explanations)

reasons = feature groups that raise this player's probability most, measured by swapping the group for the values of 150 typical players (one group at a time).

| Buy | Value now | Expected | Top reasons (group: key value, contribution) |
|---|---|---|---|
| Lennart Karl (17) | €60.00M | €87.47M | age: age=18.0 (+0.19); position: position=Attacking Midfield (+0.10); momentum: ret1=1.0986 (+0.07) |
| Tylel Tati (17) | €12.00M | €33.45M | age: age=18.0 (+0.18); position: position=None (+0.05); momentum: ret1=0.6931 (+0.05) |
| Giovanni Leoni (18) | €18.00M | €31.29M | momentum: ret1=1.0986 (+0.07); league: league_name=Premier League (+0.04); age: age=19.0 (+0.04) |
| Tyrique George (19) | €10.00M | €21.91M | momentum: ret1=1.0498 (+0.06); league: league_name=Premier League (+0.05); position: position=Left Winger (+0.03) |
| Nico O'Reilly (20) | €40.00M | €51.30M | career_length: span_yr=0.7283 (+0.09); age: age=21.0 (+0.08); momentum: ret1=0.2877 (+0.06) |

| Depreciation risk | Value now | Expected | Top reasons (group: key value, contribution) |
|---|---|---|---|
| Federico Valverde (27) | €120.00M | €89.08M | price_level: last_value_eur=120000000.0 (+0.25); age: age=28.0 (+0.10); momentum: ret1=-0.08 (+0.06) |
| Vinicius Junior (25) | €150.00M | €124.95M | price_level: last_value_eur=150000000.0 (+0.32); career_length: span_yr=8.1177 (+0.09); age: age=26.0 (+0.07) |
| Raphinha (28) | €80.00M | €55.55M | price_level: last_value_eur=80000000.0 (+0.21); age: age=29.0 (+0.18); momentum: ret1=-0.1178 (+0.05) |
| Rodri (29) | €75.00M | €50.85M | price_level: last_value_eur=75000000.0 (+0.24); age: age=30.0 (+0.20); career_length: span_yr=9.3552 (+0.09) |
| Harry Kane (32) | €65.00M | €40.87M | age: age=33.0 (+0.14); price_level: last_value_eur=65000000.0 (+0.13); momentum: ret1=-0.1431 (+0.02) |

## 12. Data card

- Source: Transfermarkt market values (original 508-player set + salimt/football-datasets)
- Population: Players active in a top-5 European league in 2025 with a valuation since 2024.
- Unit: Transfermarkt market value in EUR: a crowd/editor estimate, not a transfer fee.
- Label: trajectory: rising_star = strict new all-time high; else drawdown from peak <20 / <30 / <60 / >=60 %.
- Repairs: 492 positions repaired, 16 unknown, 236 ages replaced from history, 6 non-positive valuations dropped.
- Known gaps: No performance, injury, contract or wage data. Club history unusable for 1,910 players (single club recorded). league_name and position are current values; past rows reuse them. Survivorship: only players who were in a top-5 league in 2025. 16 legacy players without a position.
- Intended use: Shortlisting and what-if exploration for scouts and analysts.
- Not for: Pricing a transfer, judging sporting quality, or decisions without a scout's review.

Training time: 452.8 s. Panel rows used for training: 21700.
