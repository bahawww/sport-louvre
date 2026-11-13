# Sport Louvre — System Architecture

**Live URL**: `https://sport.louvre.my.id`  
**Repository**: `https://github.com/bahawww/sport-louvre`  
**Deploy Path**: `/opt/sport-dashboard`

---

## 1. High-Level Topology

```
Internet (HTTPS)
   │
   ▼
Cloudflare Edge & Tunnel (vps-pve)
   │  ingress: sport.louvre.my.id -> http://localhost:8310
   ▼
Caddy Reverse Proxy (:8310, 127.0.0.1 only)
   ├── /api/*  ──▶  FastAPI ML Backend (api:8000)
   └── /*      ──▶  Next.js 16 Frontend (web:3000)
```

All three containers (`api`, `web`, `caddy`) run inside a single Docker Compose stack (`name: sport-dashboard`) with explicit healthchecks and `restart: unless-stopped`. Port `8310` is bound strictly to `127.0.0.1` so public traffic enters only through the `vps-pve` Cloudflare Tunnel.

---

## 2. Dataset & Data Audit

Source (`data/Football_Player_Market_Value_Trajectories/`, mounted read-only at `/app/data`):
- `transfermarkt_player_values.csv`: **2,418 players**, 36 columns, Big-5 leagues.
- `transfermarkt_value_history.csv`: **47,909 valuation points** (date, EUR value, club, age).
- `player_profile_patch.csv`: sidecar with repaired `position` / `position_group` for legacy rows
  (written by `scripts/repair_legacy_profiles.py`; the original CSV is not modified).

### Findings that shape the pipeline
1. **Label rule.** `trajectory` is a pure function of the last value and the earlier peak:
   strict new all-time high = `rising_star`, otherwise drawdown `<20 / <30 / <60 / >=60 %`.
   `features.classify_trajectory` reproduces it for 100% of players, so the label can be
   computed at every point of the history.
2. **CSV summary columns contain the target.** `peak_value_eur`, `value_volatility`,
   `years_to_peak`, `career_span_years` are computed over the full history, last point included.
   In the previous "Clean" mode `peak_value_eur > pre_peak_value_eur` identified `rising_star`
   exactly and equalled the regression target for 17.9% of players. No CSV summary column is a
   model feature any more.
3. **Legacy 508 rows are damaged.** `position` holds a euro string, `position_group` is "Other",
   `current_club` holds the nationality, `age` disagrees with the history in 46% of rows.
   Positions are repaired for 492 rows (16 stay unknown); age comes from the history.
4. **Club history is unusable.** `num_clubs_career` is 1 for all 1,910 newer rows, so it only
   marks the data source. It is not a feature, and club-move scenarios are not offered.
5. **Demonstrated leakage** (`value_cagr`, `post_peak_decline_pct`, `is_at_peak`, ...) is kept
   only in the Leakage mode, which reaches 100% accuracy.

---

## 3. Backend (`backend/`)

Python 3.12, FastAPI, scikit-learn 1.6.

| File | Role |
|---|---|
| `features.py` | The only place features are defined. `prefix_features(values, days, ages)` + `assemble_row(...)` for real histories, `profile_row(...)` for the synthetic form. |
| `ml_pipeline.py` | Data loading and repair, panel building, estimators, evaluation, conformal intervals, artifact cache, inference helpers. |
| `main.py` | API. `/api/simulate` calls the same feature functions as training. |
| `evaluation.py` | Report tables: reliability bins, segment errors, baseline headlines, deciles, per-player explanations. Trains nothing. |
| `report.py` | Prints `reports/metrics_report.md` (before vs after). |
| `tests/test_pipeline.py` | Leak checks, train/serve equality, API contract. Run with `deploy/test.sh`. |

### Training data
A panel: for every player and every valuation update, features come from the history *before*
that update and the target is that update (45,485 rows; training uses target dates >= 2021).
Targets 2 and 4 updates ahead were tested and rejected: next-update log-RMSE got worse than naive.

### Three regression tasks
| Task | Sees | Purpose |
|---|---|---|
| **Forecast** | Full lag state incl. the last price | Value at the next update. Compared against the naive last-value baseline. |
| **Fundamental** | Career state as of >= 12 months before the last price, age, position, league | Fair value for undervalued / overvalued screening. Cannot copy the current price. |
| **Profile** | The ten fields of the simulator form | Synthetic-profile mode, no guessed features. |

All use `HistGradientBoostingRegressor` on `log1p(value)` relative to a per-row anchor.

### 12-month outlook (recommendations)
Buy / avoid lists come from a separate task: for every past history prefix, the value at the
first valuation 300-480 days later. A calibrated 3-class model gives P(down / flat / up) for a
move beyond 5%, a regressor and CQR give the expected value and range. A player is a buy only
when P(up) >= 0.70. The fundamental gap is **not** used for recommendations: players whose
price fell over 40% in a year went on to rise in only 22% of cases, so "fell, therefore cheap"
points the wrong way. Out-of-time (cutoff 2024-06-01) 81% of buy signals rose and 82% of
depreciation-risk signals fell (base rates 48% / 42%).

### Classification
Ordinal (Frank & Hall) decomposition of the five ordered classes over HistGradientBoosting, each
cumulative model calibrated isotonic out-of-fold with folds grouped by player. Compared with
calibrated multinomial HGB, Logistic Regression, Random Forest and a persistence baseline.

### Validation
- Stratified 80:20 split **by player** (seed 42), scored on each test player's last update.
- Model selection by GroupKFold(5) on training players, never on the test set.
- Out-of-time: refit on targets before 2025-01-01, scored on later updates.
- Intervals: conformalized quantile regression at 80%, calibrated on held-out players.

### Serving
`build_artifacts()` trains in about 5 minutes and caches the result in the `model_cache` volume,
keyed by a hash of the data files and pipeline code. With a matching cache the API starts in seconds.

### Known limits
- No performance data: "fair value" comes from price history, age, position and league only.
  The gap to the market price correlates about -0.70 with the price move of the hidden 12 months,
  so the screen ranks reversal candidates; it does not prove mispricing. Breakouts (new all-time
  high inside the hidden window) and histories under 12 months are labelled and not flagged.
- Scored rows use the real time gap to the next update. `validation.fixed_horizon` reports the
  same models without it (macro-F1 0.63 -> 0.58, regression unchanged).
- On the holdout the forecast model does not beat the naive last-value baseline in euros, and is
  worse for players worth >= EUR 50M; it wins on the log scale, in grouped CV and out-of-time.
- `league_name` and `position` are current values reused for past rows.
- The dataset only holds players active in a top-5 league in 2025 (survivorship).

---

## 4. Frontend (`frontend/`)

- **Framework**: Next.js 16 (App Router, `output: "standalone"`), TypeScript, Tailwind CSS v4, TanStack Query, ECharts.
- **Design System**: Dark Tactical Sports-Analytics (`#0B1117`, `#121A24`, `#10B981`, `#F59E0B`, `#EF4444`) with `Plus Jakarta Sans` (`tabular-nums`) and custom geometric `LogoMark` + matching `icon.svg`/`favicon.svg`.
- **Interactive Tabs**:
  1. `KPI & Model Arena` (`ArenaPanel`)
  2. `Confusion & Scatter` (`DiagnosticsPanel`)
  3. `Analisis Kesalahan` (`ErrorAnalysisPanel`)
  4. `Tren Karir` (`TrajectoryExplorerPanel`)
  5. `Scouting Simulator` (`ScoutingSimulatorPanel`)
  6. `Rekomendasi Klub` (`RecommendationsPanel`)
  7. `Dataset Total` (`DatasetPanel` — full player browser & CSV/Parquet downloads)

---

## 5. Build & Operations

```sh
deploy/build.sh            # build images (host network; bridge BuildKit is slow here)
deploy/test.sh             # backend tests inside the API image
deploy/pretrain.sh         # train into the model_cache volume (skip ~5 min of startup training)
docker compose up -d
```
- Publish DNS & tunnel: `./deploy/cloudflare-publish.sh` (idempotent).
- After changing `features.py`, `ml_pipeline.py` or the data, the cache key changes: run
  `deploy/pretrain.sh` before `up -d`, or the API trains at startup (healthcheck allows 10 min).
