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

## 2. Dataset & Data Leakage Audit

Source dataset (`data/Football_Player_Market_Value_Trajectories/`, mounted read-only at `/app/data`):
- `transfermarkt_player_values.csv`: **508 players**, **36 columns** across the Big-5 European leagues (`La Liga`, `Premier League`, `Serie A`, `Bundesliga`, `Ligue 1`).
- `transfermarkt_value_history.csv`: **9,764 historical valuation points** (date, EUR value, club, age at date).
- `data_dictionary.csv`: Schema & column definitions.
- `transfermarkt_player_values.parquet`: Compressed columnar copy.

### Critical Data Findings
1. **UTF-8 BOM**: CSVs contain `\ufeff` BOM headers and are loaded with `encoding="utf-8-sig"`.
2. **Direct Target Leakage (`last_value_eur`)**: `last_value_eur == current_value_eur` for all 508 rows; excluded from all models.
3. **Post-Hoc Trajectory Leakage**: Features such as `value_cagr`, `value_to_peak_cagr`, `value_multiplier_x`, `post_peak_decline_pct`, `mean_yoy_growth_rate`, and `is_at_peak` encode the outcome after valuation occurs.
   - **Mode Clean** excludes all leakage features (`Logistic Regression` achieves honest **66.67%** accuracy).
   - **Mode Full Features (Leakage)** includes them (`Gradient Boosting` achieves **100.00%** accuracy, proving `+33.3 pp` artificial inflation).

---

## 3. Backend (`backend/`)

- **Framework**: Python 3.12 + FastAPI + Uvicorn (`port 8000`).
- **ML Pipeline (`ml_pipeline.py`)**:
  - **Split**: Stratified 80:20 (`406` train / `102` test, `random_state=42`).
  - **Classification (`trajectory`)**: `RandomForestClassifier`, `GradientBoostingClassifier`, `LogisticRegression` (Clean vs Leakage).
  - **Regression (`current_value_eur`)**: `RandomForestRegressor`, `GradientBoostingRegressor` (`R² = 0.9108`, `MAE = €5.16M`), `LinearRegression`.
- **Endpoints (`main.py`)**:
  - `GET /api/health` — Service & dataset readiness.
  - `GET /api/overview` — Dataset summary, Clean vs Leakage metrics, Regression benchmarks.
  - `GET /api/test-predictions` — 102 test rows with residuals, undervalued/overvalued lists, and error analysis.
  - `GET /api/history` — Searchable player career valuation curves.
  - `POST /api/simulate` — Real-time What-If scouting inference using the best Clean models.
  - `GET /api/datasets` & `GET /api/datasets/download/{filename}` — Full dataset browser & whitelisted file downloads.

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
  7. `Dataset Total` (`DatasetPanel` — full 508-player browser & CSV/Parquet downloads)

---

## 5. Build & Operations

- **Build Images**: `./deploy/build.sh` (uses `docker build --network host` for fast PyPI/npm resolution on this VPS).
- **Run Stack**: `docker compose up -d`.
- **Publish DNS & Tunnel**: `./deploy/cloudflare-publish.sh` (idempotent Cloudflare API script).
