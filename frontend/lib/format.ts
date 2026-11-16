import type { TrajectoryClass } from "./api";

export const fmt = {
  int: (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n)),
  pct: (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`,
  eur: (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
    return `${sign}€${abs.toFixed(0)}`;
  },
  eurShort: (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
    return `${sign}€${abs.toFixed(0)}`;
  },
};

export const TRAJECTORY_META: Record<
  TrajectoryClass,
  { label: string; short: string; tone: "baik" | "sedang" | "tidak-sehat" | "sangat-tidak-sehat" | "berbahaya" }
> = {
  rising_star: { label: "Rising Star", short: "Rising Star", tone: "baik" },
  growing: { label: "Growing", short: "Growing", tone: "sedang" },
  stable: { label: "Stable", short: "Stable", tone: "tidak-sehat" },
  declining: { label: "Declining", short: "Declining", tone: "sangat-tidak-sehat" },
  falling_sharply: { label: "Falling Sharply", short: "Falling", tone: "berbahaya" },
};

export function trajectoryLabel(t: string): string {
  return TRAJECTORY_META[t as TrajectoryClass]?.label ?? t.replace(/_/g, " ");
}

export const TREND_META: Record<string, { label: string; hint: string; className: string }> = {
  rising: {
    label: "Naik / Dekat Puncak",
    hint: "rekor baru atau dalam 20% dari nilai puncak",
    className: "pill-mint",
  },
  stable: {
    label: "Stabil",
    hint: "20-30% di bawah nilai puncak",
    className: "pill-amber",
  },
  declining: {
    label: "Menurun",
    hint: "30-60% di bawah nilai puncak",
    className: "pill-orange",
  },
  falling_sharply: {
    label: "Jatuh Tajam",
    hint: "lebih dari 60% di bawah nilai puncak",
    className: "pill-crimson",
  },
};

/** Fold a 5-class result into the 4 trend classes (rising_star + growing become one). */
export function toTrendModel<T extends { confusion_matrix: number[][]; accuracy: number; macro_f1?: number }>(m: T): T {
  const group = [0, 0, 1, 2, 3];
  const cm = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  m.confusion_matrix.forEach((row, i) => row.forEach((n, j) => (cm[group[i]][group[j]] += n)));
  const total = cm.flat().reduce((a, b) => a + b, 0);
  const f1 = cm.map((row, k) => {
    const tp = row[k];
    const actual = row.reduce((a, b) => a + b, 0);
    const predicted = cm.reduce((a, r) => a + r[k], 0);
    return actual + predicted ? (2 * tp) / (actual + predicted) : 0;
  });
  return {
    ...m,
    confusion_matrix: cm,
    accuracy: total ? cm.reduce((a, row, k) => a + row[k], 0) / total : 0,
    macro_f1: f1.reduce((a, b) => a + b, 0) / 4,
    ece: undefined,
  };
}
