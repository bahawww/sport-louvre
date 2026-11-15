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
  neutral: "text-ink",
  positive: "text-positive",
  warning: "text-warning",
  negative: "text-negative",
  info: "text-info",
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
        <span className="text-[13px] font-medium text-muted truncate">
          {label}
        </span>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>

      {/* Main value + unit */}
      <div className="mt-2 flex items-baseline gap-1.5 min-w-0">
        <span
          className={cn(
            "text-2xl sm:text-[28px] font-semibold tracking-tight tabular-nums leading-none truncate",
            TONE_MAP[tone]
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
