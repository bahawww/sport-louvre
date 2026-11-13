import type { TrajectoryClass } from "@/lib/api";
import { TRAJECTORY_META } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  baik: "bg-[var(--ispu-baik-bg)] text-[var(--ispu-baik-fg)]",
  sedang: "bg-[var(--ispu-sedang-bg)] text-[var(--ispu-sedang-fg)]",
  "tidak-sehat": "bg-[var(--ispu-tidak-sehat-bg)] text-[var(--ispu-tidak-sehat-fg)]",
  "sangat-tidak-sehat": "bg-[var(--ispu-sangat-tidak-sehat-bg)] text-[var(--ispu-sangat-tidak-sehat-fg)]",
  berbahaya: "bg-[var(--ispu-berbahaya-bg)] text-[var(--ispu-berbahaya-fg)]",
};

export function TrajectoryBadge({ value, className }: { value: string; className?: string }) {
  const meta = TRAJECTORY_META[value as TrajectoryClass];
  const toneClass = meta ? TONE_CLASS[meta.tone] : "bg-[var(--chip)] text-[var(--text-secondary)]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] px-2.5 py-0.5 text-[12px] font-bold tracking-[0.01em]",
        toneClass,
        className,
      )}
    >
      {meta?.label ?? value.replace(/_/g, " ")}
    </span>
  );
}
