# API Contract (`/api/*`)

Base URL: `/api` (proxied by Caddy to `api:8000`)

1. `GET /api/health` -> `{"status": "ok", "players": 508, "history_rows": 9764}`
2. `GET /api/overview` ->
   - `dataset`: `{ total_players, train_size: 406, test_size: 102, history_rows: 9764, leagues: [...], trajectories: { rising_star, growing, stable, declining, falling_sharply } }`
   - `classification`:
     - `classes`: `["rising_star", "growing", "stable", "declining", "falling_sharply"]`
     - `clean_mode`: `{ models: [{ name, accuracy, f1_weighted, precision_weighted, recall_weighted, confusion_matrix: number[][], feature_importance: [{ feature, importance }] }], best_model }`
     - `leakage_mode`: `{ models: [{ name, accuracy, f1_weighted, precision_weighted, recall_weighted, confusion_matrix: number[][], feature_importance: [{ feature, importance }] }], best_model }`
   - `regression`:
     - `models`: `[{ name, mae, rmse, r2, feature_importance: [{ feature, importance }] }]`
     - `best_model`: string
3. `GET /api/test-predictions` ->
   - `rows`: 102 items `{ player_id, name, age, nationality, league_name, peak_club, actual_trajectory, pred_trajectory_clean, pred_trajectory_leakage, actual_value_eur, pred_value_eur, residual_eur, residual_pct, valuation_status: "Undervalued" | "Fair" | "Overvalued" }`
   - `undervalued`: top 15 hidden gems (sorted by `residual_eur` desc, where `actual < pred` or `pred > actual`? Wait: if model predicts higher fair value `pred_value_eur > actual_value_eur`, player is Undervalued / Hidden Gem! Let's define `gap_eur = pred_value_eur - actual_value_eur`; positive `gap_eur` = Undervalued Hidden Gem, negative `gap_eur` = Overvalued).
   - `overvalued`: top 15 overvalued players (most negative `gap_eur`).
   - `error_analysis`: `{ leakage_delta_acc, growing_vs_stable_confusion_count, top_underpredicted_superstars: [...], league_bias: [{ league, mean_residual_eur, count }] }`
4. `GET /api/history?q=&league=&limit=30` ->
   - `players`: matching players with `{ player_id, name, age, nationality, league_name, peak_club, current_value_eur, peak_value_eur, trajectory, history: [{ date, value_eur, club, age_at_date }] }`
5. `POST /api/simulate` ->
   - Request body: `{ age: number, age_at_peak: number, peak_value_eur: number, first_value_eur: number, career_span_years: number, years_to_peak: number, value_volatility: number, num_valuation_points: number, num_clubs_career: number, league_name: string, nationality: string }`
   - Response: `{ predicted_trajectory: string, trajectory_probabilities: Record<string, number>, predicted_value_eur: number, value_range_eur: [number, number], scouting_verdict: string }`
