"use client";

import { useQuery } from "@tanstack/react-query";

export type TrajectoryClass =
  | "rising_star"
  | "growing"
  | "stable"
  | "declining"
  | "falling_sharply";

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
}

export interface ClassificationModelMetrics {
  name: string;
  accuracy: number;
  f1_weighted: number;
  precision_weighted: number;
  recall_weighted: number;
  confusion_matrix: number[][];
  feature_importance: FeatureImportanceItem[];
  macro_f1?: number;
  ece?: number;
  brier?: number;
  log_loss?: number;
  ordinal_mae?: number;
}

export interface RegressionModelMetrics {
  name: string;
  mae: number;
  rmse: number;
  r2: number;
  feature_importance: FeatureImportanceItem[];
  mae_log?: number;
  rmse_log?: number;
  r2_log?: number;
  medape?: number;
}

export interface IntervalReport {
  level: number;
  coverage: number;
  median_width_ratio: number;
  n: number;
}

export interface RegressionTask {
  models: RegressionModelMetrics[];
  best_model: string;
  features: string[];
  validation: { group_kfold: Record<string, Record<string, number>> };
  intervals: { method: string; holdout: IntervalReport; q_hat_log: number; n_calibration: number };
  tautology_probe?: { question: string; r2_log: number; medape: number };
  reference_naive_last_value?: Record<string, number>;
}

export type RegressionTaskName = "forecast" | "fundamental" | "profile";

export interface ClassifierHeadline {
  model: string;
  metrics: Record<string, number>;
  persistence: Record<string, number>;
  gain_vs_persistence: { accuracy_pp: number; macro_f1_pp: number; log_loss_reduction: number };
  fixed_horizon: Record<string, number>;
  selective?: { min_confidence: number; coverage: number; accuracy: number | null }[] | null;
}

export interface TrendView {
  classes: string[];
  mapping: Record<string, string>;
  definition: string;
  why: string;
  models: (ClassificationModelMetrics & {
    selective?: { min_confidence: number; coverage: number; accuracy: number | null }[];
  })[];
  best_model: string;
  headline: ClassifierHeadline;
}

export interface OverviewResponse {
  dataset: {
    total_players: number;
    train_size: number;
    test_size: number;
    history_rows: number;
    leagues: string[];
    trajectories: Record<TrajectoryClass, number>;
  };
  classification: {
    classes: TrajectoryClass[];
    clean_mode: {
      models: ClassificationModelMetrics[];
      best_model: string;
    };
    leakage_mode: {
      models: ClassificationModelMetrics[];
      best_model: string;
    };
    primary_view?: string;
    trend?: TrendView;
  };
  regression: {
    models: RegressionModelMetrics[];
    best_model: string;
    task?: string;
    tasks?: Record<RegressionTaskName, RegressionTask>;
  };
  methodology?: {
    label_rule: string;
    split: string;
    panel: string;
    model_selection: string;
    out_of_time_cutoff: string;
    interval_level: number;
    limits: string[];
  };
  out_of_time?: {
    cutoff: string;
    train_rows: number;
    sets: Record<
      string,
      {
        rows: number;
        classification: Record<string, Record<string, number>>;
        regression: Record<string, Record<string, Record<string, number>>>;
      }
    >;
  };
}

export interface TestPredictionRow {
  player_id: string;
  name: string;
  age: number;
  nationality: string;
  league_name: string;
  peak_club: string;
  actual_trajectory: TrajectoryClass;
  pred_trajectory_clean: TrajectoryClass;
  pred_trajectory_leakage: TrajectoryClass;
  actual_value_eur: number;
  pred_value_eur: number;
  residual_eur: number;
  residual_pct: number;
  valuation_status: "Undervalued" | "Fair" | "Overvalued";
  position?: string;
  position_group?: string;
  valuation_basis?: "ok" | "breakout" | "short_history";
  fair_value_eur?: number;
  fair_value_range_eur?: [number, number];
  previous_value_eur?: number;
  forecast_value_eur?: number;
  forecast_range_eur?: [number, number];
  forecast_residual_eur?: number;
  pred_trajectory_confidence?: number;
}

export type ScreeningRow = Omit<
  TestPredictionRow,
  "actual_trajectory" | "pred_trajectory_clean" | "pred_trajectory_leakage"
> &
  Partial<Pick<TestPredictionRow, "actual_trajectory">>;

export interface OutlookRow {
  player_id: string;
  name: string;
  age: number;
  nationality: string;
  league_name: string;
  position: string;
  peak_club: string;
  actual_trajectory: TrajectoryClass;
  current_value_eur: number;
  valuation_date: string;
  expected_value_eur: number;
  expected_range_eur: [number, number];
  expected_change_eur: number;
  expected_change_pct: number;
  p_up: number;
  p_down: number;
  signal: "Buy" | "Neutral" | "DepreciationRisk";
}

export interface OutlookGroupCheck {
  n: number;
  went_up: number | null;
  went_down: number | null;
  median_log_return: number | null;
}

export interface OutlookResponse {
  method: string;
  horizon_months: number;
  threshold: number;
  min_value_eur: number;
  interval_level: number;
  validation: {
    cutoff: string;
    train_rows: number;
    test_rows: number;
    test_players: number;
    rank_correlation: number;
    interval_coverage: number;
    base_rate: { up: number; down: number; n: number };
    buy: OutlookGroupCheck;
    depreciation_risk: OutlookGroupCheck;
    fell_over_40pct_prior_12m: OutlookGroupCheck;
  };
  signal_counts: Record<string, number>;
  buy: OutlookRow[];
  depreciation_risk: OutlookRow[];
  limits: string[];
}

export interface TestPredictionsResponse {
  rows: TestPredictionRow[];
  undervalued: TestPredictionRow[];
  overvalued: TestPredictionRow[];
  outlook?: OutlookResponse;
  screening_all?: {
    method: string;
    players: number;
    metrics: Record<string, number>;
    status_counts: Record<string, number>;
    basis_counts?: Record<string, number>;
    band_coverage?: number;
    gap_vs_hidden_window_return_corr?: number;
    undervalued: ScreeningRow[];
    overvalued: ScreeningRow[];
  };
  error_analysis: {
    leakage_delta_acc: number;
    growing_vs_stable_confusion_count: number;
    top_underpredicted_superstars: TestPredictionRow[];
    league_bias: {
      league: string;
      mean_residual_eur: number;
      count: number;
    }[];
  };
}

export interface HistoryPoint {
  date: string;
  value_eur: number;
  club: string;
  age_at_date: number;
}

export interface PlayerHistoryItem {
  player_id: string;
  name: string;
  age: number;
  nationality: string;
  league_name: string;
  peak_club: string;
  current_value_eur: number;
  peak_value_eur: number;
  trajectory: TrajectoryClass;
  history: HistoryPoint[];
}

export interface HistoryResponse {
  players: PlayerHistoryItem[];
}

/** Synthetic-profile mode: the model is trained on exactly these fields. */
export interface ProfileForm {
  age: number;
  age_at_peak: number;
  peak_value_eur: number;
  first_value_eur: number;
  career_span_years: number;
  years_to_peak: number;
  value_volatility: number;
  num_valuation_points: number;
  league_name: string;
  nationality: string;
  position_group?: string;
}

/** What-if changes for a real player; features are recomputed from the real history. */
export interface SimulateScenario {
  horizon_years?: number;
  league_name?: string;
  append_valuations?: { value_eur: number; years_after: number }[];
  backtest?: boolean;
}

export type SimulateRequest = ProfileForm | { player_id: string; scenario?: SimulateScenario };

export interface SimulatePrediction {
  predicted_trajectory: TrajectoryClass;
  trajectory_probabilities: Record<string, number>;
  predicted_value_eur: number;
  value_range_eur: [number, number];
  fair_value_eur?: number;
  fair_value_range_eur?: [number, number];
}

export interface SimulateResponse extends SimulatePrediction {
  scouting_verdict: string;
  mode?: "player_whatif" | "player_backtest" | "synthetic_profile";
  interval_level?: number;
  horizon_years?: number;
  models?: Record<string, string>;
  warnings?: string[];
  market_value_eur?: number;
  valuation_gap_eur?: number;
  valuation_gap_pct?: number;
  valuation_status?: "Undervalued" | "Fair" | "Overvalued";
  valuation_basis?: "ok" | "breakout" | "short_history";
  outlook_12m?: OutlookRow | null;
  baseline?: SimulatePrediction & { horizon_years: number };
  scenario_delta_eur?: number;
  player?: {
    player_id: string;
    name: string;
    last_value_eur: number;
    last_date: string;
    n_history_points: number;
    in_training_set: boolean;
    league_name: string;
    position: string;
    position_group: string;
    nationality: string;
    age: number;
    peak_value_eur: number;
    history: { date: string; value_eur: number }[];
    hypothetical: { date: string; value_eur: number }[];
    forecast_date: string;
  };
  predicted_trend?: string;
  trend_probabilities?: Record<string, number>;
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useApi<T>(path: string, enabled = true) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => fetchApi<T>(path),
    enabled,
  });
}

export interface DatasetFileMeta {
  filename: string;
  label: string;
  description: string;
  format: string;
  size_bytes: number;
  rows: number;
  columns: number;
  download_url: string;
}

export interface DatasetPlayerRow {
  player_id: string;
  name: string;
  age: number | null;
  nationality: string;
  league_name: string;
  peak_club: string;
  current_value_eur: number;
  peak_value_eur: number;
  first_value_eur: number;
  career_span_years: number;
  num_valuation_points: number;
  trajectory: TrajectoryClass;
  position?: string;
  position_group?: string;
  age_at_peak?: number;
  years_to_peak?: number;
  value_volatility?: number;
}

export interface DatasetsResponse {
  files: DatasetFileMeta[];
  total_players: number;
  players: DatasetPlayerRow[];
}
