import type { TrajectoryClass } from "@/lib/api";
import { trajectoryLabel } from "@/lib/format";

const STYLES: Record<TrajectoryClass, string> = {
  rising_star: "pill-mint",
  growing: "pill-sky",
  stable: "pill-amber",
  declining: "pill-orange",
  falling_sharply: "pill-crimson",
};

export function TrajectoryBadge({ value, className = "" }: { value: string; className?: string }) {
  const cls = STYLES[value as TrajectoryClass] ?? "pill-neutral";
  return (
    <span
      className={`inline-flex items-center rounded-chip border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls} ${className}`}
    >
      {trajectoryLabel(value)}
    </span>
  );
}
