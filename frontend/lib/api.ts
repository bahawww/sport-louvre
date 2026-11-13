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
}

export interface RegressionModelMetrics {
  name: string;
  mae: number;
  rmse: number;
  r2: number;
  feature_importance: FeatureImportanceItem[];
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
  };
  regression: {
    models: RegressionModelMetrics[];
    best_model: string;
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
}

export interface TestPredictionsResponse {
  rows: TestPredictionRow[];
  undervalued: TestPredictionRow[];
  overvalued: TestPredictionRow[];
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

export interface SimulateRequest {
  age: number;
  age_at_peak: number;
  peak_value_eur: number;
  first_value_eur: number;
  career_span_years: number;
  years_to_peak: number;
  value_volatility: number;
  num_valuation_points: number;
  num_clubs_career: number;
  league_name: string;
  nationality: string;
}

export interface SimulateResponse {
  predicted_trajectory: TrajectoryClass;
  trajectory_probabilities: Record<string, number>;
  predicted_value_eur: number;
  value_range_eur: [number, number];
  scouting_verdict: string;
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
}

export interface DatasetsResponse {
  files: DatasetFileMeta[];
  total_players: number;
  players: DatasetPlayerRow[];
}
