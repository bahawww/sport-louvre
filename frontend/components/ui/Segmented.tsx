"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1 rounded-control border border-border bg-raised p-1",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-chip font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              size === "sm"
                ? "min-h-[44px] lg:min-h-[32px] px-3 text-xs"
                : "min-h-[44px] lg:min-h-[36px] px-3.5 text-xs",
              active
                ? "bg-active text-ink border border-border"
                : "text-muted hover:text-ink border border-transparent"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
