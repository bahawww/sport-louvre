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
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  stable: {
    label: "Stabil",
    hint: "20-30% di bawah nilai puncak",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  declining: {
    label: "Menurun",
    hint: "30-60% di bawah nilai puncak",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  falling_sharply: {
    label: "Jatuh Tajam",
    hint: "lebih dari 60% di bawah nilai puncak",
    className: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
};
