"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number; on: boolean }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    on: false,
  });

  useLayoutEffect(() => {
    const sync = () => {
      const root = rootRef.current;
      const active = root?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!active) return;
      setPill({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
        on: true,
      });
    };
    sync();
    addEventListener("resize", sync);
    return () => removeEventListener("resize", sync);
  }, [value, options.length]);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex max-w-full flex-wrap items-center gap-1 rounded-control border border-border bg-raised p-1",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 rounded-chip border border-border bg-active transition-[transform,width,height,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{
          width: pill.width,
          height: pill.height,
          transform: `translate(${pill.left}px, ${pill.top}px)`,
          opacity: pill.on ? 1 : 0,
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center rounded-chip border border-transparent font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              size === "sm"
                ? "min-h-[44px] lg:min-h-[32px] px-3 text-xs"
                : "min-h-[44px] lg:min-h-[36px] px-3.5 text-xs",
              active ? "text-ink" : "text-muted hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
