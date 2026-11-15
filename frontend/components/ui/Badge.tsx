import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "neutral"
  | "mint"
  | "sky"
  | "amber"
  | "orange"
  | "crimson";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children?: ReactNode;
  className?: string;
}

const VARIANT_MAP: Record<BadgeVariant, string> = {
  neutral: "pill-neutral",
  mint: "pill-mint",
  sky: "pill-sky",
  amber: "pill-amber",
  orange: "pill-orange",
  crimson: "pill-crimson",
};

const SIZE_MAP: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export function Badge({
  variant,
  size = "sm",
  className,
  children,
  ...props
}: BadgeProps) {
  // If variant is explicitly provided, use its pill class.
  // If variant is omitted and className already carries a pill-* class, don't inject default pill-neutral.
  // Otherwise, default to pill-neutral.
  const resolvedPill = variant
    ? VARIANT_MAP[variant]
    : className?.includes("pill-")
      ? undefined
      : "pill-neutral";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border font-medium whitespace-nowrap leading-none",
        resolvedPill,
        SIZE_MAP[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
