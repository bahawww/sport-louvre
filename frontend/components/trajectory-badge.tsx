import type { TrajectoryClass } from "@/lib/api";
import { trajectoryLabel } from "@/lib/format";

const STYLES: Record<TrajectoryClass, string> = {
  rising_star: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  growing: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  stable: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  declining: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  falling_sharply: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export function TrajectoryBadge({ value, className = "" }: { value: string; className?: string }) {
  const cls = STYLES[value as TrajectoryClass] ?? "bg-slate-700/40 text-slate-300 border-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cls} ${className}`}
    >
      {trajectoryLabel(value)}
    </span>
  );
}
