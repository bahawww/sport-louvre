import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelPadding = "none" | "sm" | "md";
export type PanelSurface = "default" | "raised";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div";
  padding?: PanelPadding;
  surface?: PanelSurface;
  children?: ReactNode;
  className?: string;
}

const PADDING_MAP: Record<PanelPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-4 sm:p-5",
};

const SURFACE_MAP: Record<PanelSurface, string> = {
  default: "bg-surface",
  raised: "bg-raised",
};

export function Panel({
  as: Component = "section",
  padding = "md",
  surface = "default",
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <Component
      className={cn(
        "min-w-0 rounded-panel border border-border shadow-none text-ink",
        SURFACE_MAP[surface],
        PADDING_MAP[padding],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface PanelDividerGridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: 2 | 3 | 4;
  children?: ReactNode;
  className?: string;
}

const COLS_MAP: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x",
};

export function PanelDividerGrid({
  cols = 3,
  className,
  children,
  ...props
}: PanelDividerGridProps) {
  return (
    <div
      className={cn(
        "grid divide-rule [&>*]:p-4 sm:[&>*]:p-5 [&>*]:flex [&>*]:flex-col",
        COLS_MAP[cols],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelDividerCell({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("p-4 sm:p-5 flex flex-col justify-between min-w-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}
