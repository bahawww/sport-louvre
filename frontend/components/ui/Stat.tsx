import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "positive" | "warning" | "negative" | "info";

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  description?: ReactNode;
  comparison?: ReactNode;
  tone?: StatTone;
  badge?: ReactNode;
  className?: string;
}

const TONE_MAP: Record<StatTone, string> = {
  neutral: "",
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
  info: "bg-info",
};

export function Stat({
  label,
  value,
  unit,
  description,
  comparison,
  tone = "neutral",
  badge,
  className,
  ...props
}: StatProps) {
  return (
    <div className={cn("flex flex-col h-full min-w-0", className)} {...props}>
      {/* Top row: label + optional badge */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          {/* The figure stays in ink; its tone is a small swatch that matches the chart. */}
          {tone !== "neutral" ? <span className={cn("size-2 shrink-0 rounded-full", TONE_MAP[tone])} aria-hidden="true" /> : null}
          <span className="truncate">{label}</span>
        </span>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>

      {/* Main value + unit */}
      <div className="mt-2 flex items-baseline gap-1.5 min-w-0">
        <span
          className={cn(
            "text-2xl sm:text-[26px] font-medium tracking-tight tabular-nums leading-none truncate text-ink"
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-xs font-normal text-muted tabular-nums">
            {unit}
          </span>
        ) : null}
      </div>

      {/* Optional description */}
      {description ? (
        <div className="mt-1.5 text-[13px] text-muted leading-snug">
          {description}
        </div>
      ) : null}

      {/* Comparison docked to bottom */}
      {comparison ? (
        <div className="mt-auto pt-2 text-xs text-muted leading-normal">
          {comparison}
        </div>
      ) : null}
    </div>
  );
}
