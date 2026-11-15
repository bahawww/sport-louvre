import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MeterTone =
  | "mint"
  | "sky"
  | "amber"
  | "orange"
  | "crimson"
  | "neutral";

export interface MeterProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  valueText?: ReactNode;
  tone?: MeterTone;
  height?: "sm" | "md";
  className?: string;
}

const TONE_BG_MAP: Record<MeterTone, string> = {
  mint: "bg-primary",
  sky: "bg-info",
  amber: "bg-warning",
  orange: "bg-[var(--pill-orange-ink)]",
  crimson: "bg-negative",
  neutral: "bg-muted",
};

export function Meter({
  value,
  max = 100,
  label,
  sublabel,
  valueText,
  tone = "mint",
  height = "sm",
  className,
  ...props
}: MeterProps) {
  const safeMax = max > 0 ? max : 100;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const heightCls = height === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={cn("w-full min-w-0", className)} {...props}>
      {label || valueText ? (
        <div className="flex items-baseline justify-between gap-2 text-xs mb-1.5 min-w-0">
          <div className="min-w-0 truncate">
            {label ? (
              <span className="font-medium text-ink">{label}</span>
            ) : null}
            {sublabel ? (
              <span className="ml-1.5 text-muted">{sublabel}</span>
            ) : null}
          </div>
          {valueText ? (
            <span className="shrink-0 font-medium text-muted tabular-nums">
              {valueText}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuetext={typeof valueText === "string" ? valueText : `${Math.round(pct)}%`}
        className={cn(
          "w-full rounded-chip overflow-hidden bg-raised",
          heightCls
        )}
      >
        <div
          style={{ width: `${pct}%` }}
          className={cn("h-full rounded-chip transition-all duration-300", TONE_BG_MAP[tone])}
        />
      </div>
    </div>
  );
}

export interface SplitMeterSegment {
  key: string;
  label: string;
  value: number;
  tone: MeterTone;
}

export interface SplitMeterProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  segments: SplitMeterSegment[];
  max?: number;
  showLegend?: boolean;
  height?: "sm" | "md";
  title?: ReactNode;
  className?: string;
}

export function SplitMeter({
  segments,
  max,
  showLegend = true,
  height = "sm",
  title,
  className,
  ...props
}: SplitMeterProps) {
  const totalValue = segments.reduce((acc, s) => acc + (s.value > 0 ? s.value : 0), 0);
  const total = max !== undefined && max > 0 ? max : totalValue || 1;
  const heightCls = height === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={cn("w-full min-w-0", className)} {...props}>
      {title ? (
        <div className="text-xs font-medium text-ink mb-1.5 truncate">
          {title}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuenow={totalValue}
        aria-valuemin={0}
        aria-valuemax={total}
        className={cn(
          "w-full flex rounded-chip overflow-hidden bg-raised",
          heightCls
        )}
      >
        {segments.map((seg) => {
          if (seg.value <= 0) return null;
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.key}
              title={`${seg.label}: ${seg.value}`}
              style={{ width: `${pct}%` }}
              className={cn("h-full first:rounded-l-chip last:rounded-r-chip", TONE_BG_MAP[seg.tone])}
            />
          );
        })}
      </div>

      {showLegend && segments.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {segments.map((seg) => (
            <div key={seg.key} className="inline-flex items-center gap-1.5">
              <span
                className={cn("h-1.5 w-1.5 rounded-full shrink-0", TONE_BG_MAP[seg.tone])}
                aria-hidden="true"
              />
              <span className="truncate">{seg.label}</span>
              <span className="font-medium text-ink tabular-nums">
                {seg.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
