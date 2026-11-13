# Implementation Plan: Sport Louvre — Football Transfer Value Intelligence

## Overview
Build and deploy an interactive Machine Learning web dashboard at `/opt/sport-dashboard` served live at `https://sport.louvre.my.id`. The system analyzes Transfermarkt 2025/2026 player market value trajectories (`508` players, `9,764` historical valuation points) with two ML scenarios (Trajectory Classification with Clean vs Leakage comparison, and Market Value Regression), an interactive What-If Scouting Simulator, and Club Management Recommendations.

## Architecture Decisions
1. **Basis Stack (from `udara.louvre.my.id`)**: FastAPI (`api:8000`) + Next.js (`web:3000`) + Caddy (`127.0.0.1:8310`), exposed via existing `cloudflared` tunnel `vps-pve`.
2. **Data Leakage Audit**:
   - Classification **Clean Mode** excludes direct/post-hoc trajectory & target-derived leakage features (`trajectory`, `value_cagr`, `value_to_peak_cagr`, `value_multiplier_x`, `post_peak_decline_pct`, `mean_yoy_growth_rate`, `is_at_peak`, `last_value_eur`, `current_value_eur`, `current_value_tier`, `peak_value_tier`, IDs/names/dates/constant cols).
   - Classification **Full (Leakage) Mode** includes `value_cagr`, `value_to_peak_cagr`, `value_multiplier_x`, `post_peak_decline_pct`, `mean_yoy_growth_rate`, `is_at_peak` to empirically demonstrate how leakage inflates accuracy.
   - Regression (`current_value_eur`) excludes `last_value_eur` (identical to `current_value_eur`), `current_value_tier`, `position` (formatted euro string), and `trajectory` leakage, using clean profile & career-arc features (`age`, `age_at_peak`, `peak_value_eur`, `first_value_eur`, `career_span_years`, `years_to_peak`, `value_volatility`, `num_valuation_points`, `num_clubs_career`, `ever_100m`, `ever_50m`, `ever_10m`, `league_name`, `nationality`).
3. **Port Isolation**: Host port `127.0.0.1:8310` (avoids `8300` ispu, `8080/8090` beszel, `8000` Coolify, `80` pulse, `3000` whatsapp-bridge).
4. **Build Speed**: Use `--network host` during `docker build` to bypass slow bridge BuildKit transfers on this VPS.

## Parallel Swarm Execution Plan
- **Worker 1 (`ml-backend`)**: Implement `backend/ml_pipeline.py`, `backend/main.py`, `backend/requirements.txt`, `backend/Dockerfile`. Train & evaluate all models, export artifacts + live `/api/*` endpoints.
- **Worker 2 (`frontend-ui`)**: Implement `frontend/` (Next.js + Tailwind + Recharts) with sports-analytics design system, all 6 interactive dashboard panels, `frontend/Dockerfile`.
- **Worker 3 (`infra-deploy`)**: Implement `docker-compose.yml`, `Caddyfile`, `deploy/build.sh`, `deploy/cloudflare-publish.sh` (without conflicting with `udara.louvre.my.id`).

## Verification Checkpoints
1. Backend ML pipeline runs cleanly, produces 102 test predictions, Clean vs Leakage metrics, and passes `/api/health` + `/api/simulate`.
2. Frontend `npm run build` succeeds with zero TypeScript/lint errors.
3. `docker compose up -d` starts `api`, `web`, `caddy` healthy on `127.0.0.1:8310`.
4. `https://sport.louvre.my.id` returns HTTP 200 and renders live data.
