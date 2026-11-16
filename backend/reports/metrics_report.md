# Metrics report: before vs after

Model version `3ba511f7e869231b`, trained 2026-11-16T04:01:11+00:00 (scikit-learn 1.6.1, seed 42). Data as of 2026-02-11: 2418 players, 47903 valuations since 2004-10-03.

## 0. Headline: model vs baseline

| Task | Model | Baseline | Verdict |
|---|---|---|---|
| **Trend, 4 classes** (accuracy / macro-F1) | **0.851** / 0.716 | persistence 0.829 / 0.694 | +2.3 pp accuracy, +2.2 pp macro-F1, log-loss −43% |
| Trajectory, 5 classes (accuracy / macro-F1) | 0.680 / 0.628 | persistence 0.653 / 0.513 | +2.7 pp accuracy, +11.5 pp macro-F1, log-loss −50% |
| Forecast, euro (MAE / RMSE) | €1.65M / €3.60M | naive €1.63M / €3.50M | **does not beat** naive |
| Forecast, log (RMSE log) | 0.2543 | naive 0.2959 | beats naive (14% less error) |
| Forecast, players ≥ €50M (MAE, n=27) | €8.81M | naive €7.04M | **does not beat** naive |
| 12-month outlook, buy signal hit rate | 82.7% | base rate 48.0% | +35 pp |
| 12-month outlook, risk signal hit rate | 84.8% | base rate 41.7% | +43 pp |

Test set: the same 484 players (stratified 80:20, seed 42), target = each player's last valuation update.

## 1. Leak found in the previous "Clean" mode

- `peak_value_eur > pre_peak_value_eur` identified `rising_star` with accuracy **100%**; `years_past_peak == 0` did the same.
- In those rows (17.9% of players) `peak_value_eur` **was** the target value (100% equal).
- Cause: CSV summary columns are computed over the full history, target point included. The old numbers below are therefore inflated and not a fair baseline.
- Reproduced on the current pipeline: adding `peak_value_eur`, `years_to_peak`, `career_span_years`, `value_volatility` from the CSV to the same classifier lifts accuracy from 0.6942 to 0.7769 (+8.3 pp).

## 2. Trajectory classification (5 classes)

| Metric | Before: pipeline (leaky) | Before: `/api/simulate` path | After: clean | After: persistence baseline |
|---|---|---|---|---|
| Accuracy | 0.8512 | 0.4091 | **0.6798** | 0.6529 |
| Macro-F1 | 0.7846 | 0.3301 | **0.6278** | 0.5128 |
| Weighted F1 | 0.8417 | 0.3511 | **0.6755** | 0.5840 |
| ECE | 0.0193 | 0.4363 | **0.0315** | 0.2671 |
| Brier | 0.2238 | 0.9987 | **0.4172** | 0.6328 |
| Log-loss | 0.4375 | 7.6538 | **0.7123** | 1.4123 |

Selected model: **Ordinal HGB (calibrated)** (chosen by GroupKFold log-loss on training players, not on the test set).
GroupKFold(5) by player: accuracy 0.7130 ± 0.0179, macro-F1 0.6621 ± 0.0093, log-loss 0.6668.
Fixed horizon (date of the next update not known, horizon pinned to 0.45y): accuracy 0.6612, macro-F1 0.5670, ECE 0.0404, Brier 0.4184, log-loss 0.7198.
Leakage demo (Ordinal HGB (calibrated) + CSV leak columns): accuracy 1.0000.
Synthetic-profile classifier (form fields only): accuracy 0.5372, macro-F1 0.4650, ECE 0.0483.

### Headline view: 4-class trend

rising = new record or within 20% of the career peak (rising_star + growing); stable = 20-30% below; declining = 30-60% below; falling_sharply = 60%+ below. rising_star vs growing only asks whether the next valuation is a strict new record; price history cannot separate the two (about half of all 5-class errors). Same model and probabilities as the 5-class view; nothing is retrained or re-selected.

| Model | Accuracy | Macro-F1 | ECE | Brier | Log-loss |
|---|---|---|---|---|---|
| Ordinal HGB (calibrated) (selected) | 0.8512 | 0.7156 | 0.0348 | 0.2281 | 0.4091 |
| HistGradientBoosting (calibrated) | 0.8450 | 0.7240 | 0.0175 | 0.2233 | 0.4123 |
| Logistic Regression | 0.8430 | 0.6749 | 0.0302 | 0.2337 | 0.4511 |
| Random Forest | 0.8430 | 0.6869 | 0.0235 | 0.2292 | 0.4578 |
| Persistence (last state) | 0.8285 | 0.6940 | 0.1030 | 0.3184 | 0.7224 |

GroupKFold(5): accuracy 0.8547 ± 0.0143 (persistence 0.8319), macro-F1 0.7376. Fixed horizon: accuracy 0.8450, macro-F1 0.7082.
Out-of-time, unseen players: Ordinal HGB (calibrated) 0.8256, Persistence (last state) 0.8071.

Confusion matrix (rows = actual, columns = predicted: rising, stable, declining, falling_sharply):

- rising: [234, 2, 2, 1]
- stable: [24, 8, 10, 0]
- declining: [7, 7, 67, 8]
- falling_sharply: [1, 0, 10, 103]

Accuracy when the model only answers above a confidence level:

| Min confidence | Share of players answered | Accuracy |
|---|---|---|
| 0.5 | 93.6% | 87.9% |
| 0.6 | 86.4% | 89.0% |
| 0.7 | 79.3% | 90.9% |
| 0.8 | 72.5% | 92.6% |
| 0.9 | 57.9% | 96.4% |

## 3. Regression

| Model | MAE | RMSE | R² (€) | MAE log | RMSE log | R² log | Median APE |
|---|---|---|---|---|---|---|---|
| Before: Linear Regression (leaky features) | €1.07M | €2.32M | 0.9863 | 0.3873 | 1.6768 | -0.2380 | 9.0% |
| Before: `/api/simulate` path, same players | €4.04M | €8.93M | 0.7975 | 1.2403 | 3.3939 | -4.0717 | 23.2% |
| Naive: last value | €1.63M | €3.50M | 0.9689 | 0.1723 | 0.2959 | 0.9614 | 12.5% |
| After: Forecast (HistGradientBoosting (log)) | €1.65M | €3.60M | 0.9670 | 0.1695 | 0.2543 | 0.9715 | 11.3% |
| After: Fundamental (HistGradientBoosting (log)) | €5.63M | €10.89M | 0.6987 | 0.5672 | 0.7759 | 0.7349 | 40.5% |
| After: Profile (HistGradientBoosting (log)) | €3.02M | €6.10M | 0.9056 | 0.3158 | 0.4465 | 0.9122 | 22.4% |
| After: Forecast, fixed horizon | €1.59M | €3.51M | 0.9688 | 0.1665 | 0.2545 | 0.9715 | 11.0% |

On this holdout the forecast model does **not** beat the naive baseline in euro terms (MAE, RMSE, R²); it wins on the log scale, in grouped CV and out-of-time.

### Players worth ≥ €50M (holdout)

| Model | n | MAE | RMSE | MAE log | RMSE log | Median APE |
|---|---|---|---|---|---|---|
| Before: Linear Regression (leaky features) | 27 | €4.17M | €7.65M | 0.0478 | 0.0667 | 2.8% |
| After: HistGradientBoosting (log) | 27 | €8.81M | €12.30M | 0.1140 | 0.1385 | 9.1% |
| After: Ridge (log) | 27 | €8.85M | €12.22M | 0.1165 | 0.1425 | 10.1% |
| After: Naive (last value) | 27 | €7.04M | €10.63M | 0.0981 | 0.1456 | 7.7% |

Tautology probe: predicting the *last known price* from the fundamental features gives R² log 0.770, median APE 36.3% (a copy of the price would give 1.0 / 0%).

### Grouped CV (5 folds by player, training players)

| Task | Model | MAE | R² (€) | RMSE log | R² log |
|---|---|---|---|---|---|
| forecast | HistGradientBoosting (log) | €1.49M | 0.9768 | 0.2340 ± 0.0210 | 0.9738 |
| forecast | Ridge (log) | €1.70M | 0.9703 | 0.2461 ± 0.0210 | 0.9710 |
| forecast | Naive (last value) | €1.57M | 0.9690 | 0.2719 ± 0.0319 | 0.9641 |
| fundamental | HistGradientBoosting (log) | €5.32M | 0.7265 | 0.7641 ± 0.0288 | 0.7228 |
| fundamental | Ridge (log) | €5.91M | 0.6218 | 0.7935 ± 0.0276 | 0.7009 |
| profile | HistGradientBoosting (log) | €2.85M | 0.9072 | 0.4590 ± 0.0236 | 0.9001 |
| profile | Ridge (log) | €3.37M | 0.8685 | 0.5254 ± 0.0216 | 0.8689 |

## 4. Out-of-time validation

Models refit on training-player rows with target date < 2025-01-01 (18509 rows), scored on updates on/after the cutoff.

| Set | Rows | Model | Accuracy | Macro-F1 | ECE | Brier |
|---|---|---|---|---|---|---|
| unseen_players_future | 814 | Ordinal HGB (calibrated) | 0.6646 | 0.6167 | 0.0352 | 0.4367 |
| unseen_players_future | 814 | Persistence (last state) | 0.5172 | 0.4570 | 0.4028 | 0.8770 |
| seen_players_future | 3191 | Ordinal HGB (calibrated) | 0.7048 | 0.6574 | 0.0295 | 0.3981 |
| seen_players_future | 3191 | Persistence (last state) | 0.5406 | 0.4826 | 0.3794 | 0.8350 |

| Set | Task | Model | MAE | RMSE | R² (€) | RMSE log | R² log |
|---|---|---|---|---|---|---|---|
| unseen_players_future | forecast | HistGradientBoosting (log) | €2.48M | €4.44M | 0.9628 | 0.2930 | 0.9624 |
| unseen_players_future | forecast | Naive (last value) | €2.82M | €4.99M | 0.9529 | 0.3711 | 0.9396 |
| unseen_players_future | fundamental | HistGradientBoosting (log) | €7.58M | €13.20M | 0.6711 | 0.8133 | 0.7100 |
| unseen_players_future | profile | HistGradientBoosting (log) | €4.09M | €7.50M | 0.8936 | 0.4439 | 0.9136 |
| seen_players_future | forecast | HistGradientBoosting (log) | €2.21M | €3.85M | 0.9697 | 0.3036 | 0.9561 |
| seen_players_future | forecast | Naive (last value) | €2.57M | €4.61M | 0.9565 | 0.3993 | 0.9240 |
| seen_players_future | fundamental | HistGradientBoosting (log) | €6.95M | €11.90M | 0.7111 | 0.8004 | 0.6945 |
| seen_players_future | profile | HistGradientBoosting (log) | €3.52M | €6.32M | 0.9184 | 0.4245 | 0.9141 |

## 5. Prediction intervals

Before: `max(0.65·MAE, 15%)` band, empirical coverage on the simulate path **44.8%** (no stated level).

| Task | Nominal | Holdout coverage | Median hi/lo ratio | Calibration rows |
|---|---|---|---|---|
| forecast | 80% | 81.2% | 1.56× | 1642 |
| fundamental | 80% | 83.7% | 6.29× | 1642 |
| profile | 80% | 82.4% | 2.83× | 1642 |

## 6. Train-serving consistency

- Before: `/api/simulate` agreed with the evaluated pipeline on the trajectory for 43.4% of test players; median value difference 20.1%.
- After: `tests/test_pipeline.py::test_simulate_backtest_features_equal_the_scored_test_matrix` asserts exact equality of every feature for all 484 test players, and backtest predictions equal `/api/test-predictions`.

## 7. Screening (fundamental model, out-of-fold, all players)

Status counts: {'Undervalued': 247, 'Fair': 2139, 'Overvalued': 32}. Basis: {'ok': 2166, 'breakout': 163, 'short_history': 89}. Out-of-fold R² (€) 0.7273, R² log 0.7330, out-of-fold band coverage 81.2%.

Correlation between the log gap (fair/market) and the price return of the hidden 12 months: **-0.71**. The screen is to a large extent a 12-month reversal rank: it lists players whose price moved more than their year-old profile and age explain. Players at a new all-time high inside that window are labelled `breakout` and not flagged.

## 8. 12-month outlook (drives the Recommendations panel)

Out-of-time: fit on targets before 2024-06-01 (20097 rows), scored on 2203 later prefixes of 1685 players. Rank correlation predicted vs realised return 0.60; 80% interval coverage 76.5%.

| Group (value ≥ €3M) | n | Went up >5% | Went down >5% | Median log return |
|---|---|---|---|---|
| All players (base rate) | 1527 | 48.0% | 41.7% | |
| Signal Buy (P up ≥ 0.7) | 98 | 82.7% | 8.2% | +0.81 |
| Signal Depreciation risk (P down ≥ 0.7) | 171 | 7.6% | 84.8% | -0.34 |
| Old screen logic: price fell >40% in prior 12 months | 212 | 21.7% | 64.6% | -0.22 |

Current signals: {'Buy': 79, 'Neutral': 1983, 'DepreciationRisk': 356}.

### Predicted vs realised 12-month return by decile (out-of-time)

| Decile | n | Predicted median | Realised median | Went up | Went down |
|---|---|---|---|---|---|
| 1 | 221 | -0.36 | -0.34 | 11% | 83% |
| 2 | 220 | -0.22 | -0.29 | 18% | 68% |
| 3 | 220 | -0.13 | +0.00 | 36% | 49% |
| 4 | 220 | -0.06 | +0.00 | 46% | 38% |
| 5 | 221 | +0.02 | +0.07 | 52% | 38% |
| 6 | 220 | +0.11 | +0.18 | 60% | 30% |
| 7 | 220 | +0.22 | +0.22 | 60% | 29% |
| 8 | 220 | +0.36 | +0.52 | 70% | 18% |
| 9 | 220 | +0.54 | +0.71 | 75% | 14% |
| 10 | 221 | +0.95 | +1.61 | 90% | 6% |

### Hit rate by probability threshold (value ≥ €3M)

| Threshold | Buy n | Went up | Risk n | Went down |
|---|---|---|---|---|
| 0.5 | 632 | 67.7% | 607 | 63.3% |
| 0.6 | 344 | 73.3% | 353 | 73.4% |
| 0.7 | 98 | 82.7% | 171 | 84.8% |
| 0.8 | 5 | 100.0% | 45 | 100.0% |

### Calibration of P(up)

| Predicted | Observed | n |
|---|---|---|
| 0.07 | 0.00 | 68 |
| 0.15 | 0.11 | 145 |
| 0.26 | 0.34 | 193 |
| 0.35 | 0.37 | 229 |
| 0.45 | 0.54 | 260 |
| 0.55 | 0.61 | 288 |
| 0.65 | 0.70 | 246 |
| 0.74 | 0.82 | 93 |
| 0.83 | 1.00 | 5 |

### Signals by age (out-of-time)

| Age | n | Base up | Base down | Buy n | Buy went up | Risk n | Risk went down |
|---|---|---|---|---|---|---|---|
| 22-25 | 655 | 56% | 33% | 25 | 80% | 12 | 50% |
| 26-29 | 385 | 26% | 61% | 3 | 67% | 80 | 79% |
| ≤ 21 | 369 | 71% | 21% | 70 | 84% | 0 | - |
| ≥ 30 | 118 | 3% | 93% | 0 | - | 79 | 96% |

Top outlook features (permutation, out-of-time): `log_last` 0.91, `age` 0.02, `log_prev` 0.02, `n_points` 0.01, `log_peak` 0.01, `span_yr` 0.01.

## 9. Calibration of the trajectory classifier (holdout)

| Confidence bin | n | Mean confidence | Accuracy |
|---|---|---|---|
| 0.3-0.4 | 13 | 0.363 | 0.385 |
| 0.4-0.5 | 48 | 0.468 | 0.542 |
| 0.5-0.6 | 117 | 0.551 | 0.538 |
| 0.6-0.7 | 117 | 0.646 | 0.658 |
| 0.7-0.8 | 59 | 0.739 | 0.695 |
| 0.8-0.9 | 37 | 0.852 | 0.703 |
| 0.9-1.0 | 93 | 0.975 | 0.979 |

### Interval coverage by value tier (nominal 80%)

| Task | Tier | n | Coverage | Median hi/lo |
|---|---|---|---|---|
| forecast | < €5M | 213 | 83.6% | 1.78× |
| forecast | €5-20M | 160 | 81.2% | 1.54× |
| forecast | €20-50M | 84 | 82.1% | 1.37× |
| forecast | ≥ €50M | 27 | 59.3% | 1.28× |
| fundamental | < €5M | 213 | 84.0% | 7.70× |
| fundamental | €5-20M | 160 | 89.4% | 6.17× |
| fundamental | €20-50M | 84 | 79.8% | 4.26× |
| fundamental | ≥ €50M | 27 | 59.3% | 3.63× |
| profile | < €5M | 213 | 80.8% | 3.54× |
| profile | €5-20M | 160 | 89.4% | 2.65× |
| profile | €20-50M | 84 | 78.6% | 1.76× |
| profile | ≥ €50M | 27 | 66.7% | 1.48× |

Intervals under-cover for players worth ≥ €50M on all three tasks (small n): treat ranges for superstars as too narrow.

## 10. Error by segment (holdout)

### value_tier

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| < €5M | 228 | €0.43M | €0.46M | 0.325 | 0.370 | +5.6% | 49% | 66.2% | 64.9% |
| €20-50M | 75 | €2.74M | €2.49M | 0.123 | 0.127 | +3.5% | 31% | 65.3% | 66.7% |
| €5-20M | 148 | €1.60M | €1.90M | 0.192 | 0.250 | +4.7% | 37% | 75.0% | 66.9% |
| ≥ €50M | 33 | €7.81M | €6.61M | 0.132 | 0.138 | +3.0% | 38% | 54.5% | 57.6% |

### age

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| 22-25 | 158 | €2.08M | €1.99M | 0.244 | 0.234 | +5.7% | 37% | 58.2% | 56.3% |
| 26-29 | 135 | €1.55M | €1.50M | 0.176 | 0.206 | -0.7% | 41% | 77.8% | 73.3% |
| ≤ 21 | 114 | €1.95M | €1.77M | 0.378 | 0.463 | +10.2% | 62% | 55.3% | 53.5% |
| ≥ 30 | 77 | €0.47M | €0.93M | 0.137 | 0.214 | +2.7% | 30% | 89.6% | 87.0% |

### position_group

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| Defender | 162 | €1.51M | €1.60M | 0.261 | 0.314 | +2.5% | 36% | 64.8% | 63.6% |
| Forward | 138 | €2.21M | €1.82M | 0.210 | 0.231 | +7.3% | 49% | 66.7% | 68.8% |
| Goalkeeper | 53 | €0.48M | €0.54M | 0.368 | 0.391 | +3.8% | 34% | 67.9% | 64.1% |
| Midfielder | 131 | €1.70M | €1.92M | 0.232 | 0.289 | +5.4% | 41% | 73.3% | 64.1% |

### league

| Segment | n | Forecast MAE | Naive MAE | Forecast RMSE log | Naive RMSE log | Forecast bias | Fundamental median APE | Accuracy | Persistence acc. |
|---|---|---|---|---|---|---|---|---|---|
| Bundesliga | 96 | €1.13M | €0.91M | 0.218 | 0.234 | +2.5% | 31% | 60.4% | 67.7% |
| La Liga | 82 | €1.41M | €1.38M | 0.265 | 0.316 | +3.2% | 47% | 70.7% | 72.0% |
| Ligue 1 | 84 | €1.03M | €0.96M | 0.290 | 0.371 | +5.1% | 45% | 67.9% | 57.1% |
| Premier League | 115 | €2.96M | €3.04M | 0.240 | 0.276 | +6.4% | 35% | 68.7% | 58.3% |
| Serie A | 107 | €1.38M | €1.50M | 0.262 | 0.284 | +5.9% | 50% | 72.0% | 72.0% |

## 11. Why a player is on the list (example explanations)

reasons = feature groups that raise this player's probability most, measured by swapping the group for the values of 150 typical players (one group at a time).

| Buy | Value now | Expected | Top reasons (group: key value, contribution) |
|---|---|---|---|
| Lennart Karl (17) | €60.00M | €83.74M | age: age=18.0 (+0.19); position: position=Attacking Midfield (+0.07); career_length: span_yr=0.5092 (+0.06) |
| Giovanni Leoni (18) | €18.00M | €32.72M | momentum: ret1=1.0986 (+0.08); league: league_name=Premier League (+0.05); drawdown: dd_last=0.0 (+0.05) |
| Tyrique George (19) | €10.00M | €23.53M | momentum: ret1=1.0498 (+0.07); league: league_name=Premier League (+0.04); nationality: nationality=England (+0.03) |
| Nico O'Reilly (20) | €40.00M | €52.74M | age: age=21.0 (+0.08); career_length: span_yr=0.7283 (+0.07); drawdown: dd_last=0.0 (+0.05) |
| Tylel Tati (17) | €12.00M | €24.27M | age: age=18.0 (+0.21); momentum: ret1=0.6931 (+0.08); career_length: span_yr=0.3203 (+0.06) |

| Depreciation risk | Value now | Expected | Top reasons (group: key value, contribution) |
|---|---|---|---|
| Federico Valverde (27) | €120.00M | €91.41M | price_level: last_value_eur=120000000.0 (+0.25); age: age=28.0 (+0.08); momentum: ret1=-0.08 (+0.08) |
| Vinicius Junior (25) | €150.00M | €123.78M | price_level: last_value_eur=150000000.0 (+0.27); career_length: span_yr=8.1177 (+0.05); age: age=26.0 (+0.03) |
| Rodri (29) | €75.00M | €49.43M | price_level: last_value_eur=75000000.0 (+0.23); age: age=30.0 (+0.19); career_length: span_yr=9.3552 (+0.09) |
| Raphinha (28) | €80.00M | €55.14M | price_level: last_value_eur=80000000.0 (+0.21); age: age=29.0 (+0.15); momentum: ret1=-0.1178 (+0.05) |
| Ousmane Dembélé (28) | €100.00M | €75.56M | price_level: last_value_eur=100000000.0 (+0.20); age: age=29.0 (+0.09); career_length: span_yr=10.193 (+0.04) |

## 12. Data card

- Source: Transfermarkt market values (original 508-player set + salimt/football-datasets)
- Population: Players active in a top-5 European league in 2025 with a valuation since 2024.
- Unit: Transfermarkt market value in EUR: a crowd/editor estimate, not a transfer fee.
- Label: trajectory: rising_star = strict new all-time high; else drawdown from peak <20 / <30 / <60 / >=60 %.
- Repairs: 508 positions repaired, 0 unknown, 91 ages replaced from history, 6 non-positive valuations dropped.
- Known gaps: No performance, injury, contract or wage data. Club history unusable for 1,910 players (single club recorded). league_name and position are current values; past rows reuse them. Survivorship: only players who were in a top-5 league in 2025. 16 legacy players without a position.
- Intended use: Shortlisting and what-if exploration for scouts and analysts.
- Not for: Pricing a transfer, judging sporting quality, or decisions without a scout's review.

Training time: 426.0 s. Panel rows used for training: 21700.
