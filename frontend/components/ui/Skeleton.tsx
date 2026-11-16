import type { HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={clsx("sh-skel rounded-control", className)}
      {...props}
    />
  );
}

export function PanelSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Memuat"
      className={clsx("space-y-4 w-full", className)}
      {...props}
    >
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 sm:w-64" />
        <Skeleton className="h-4 w-72 sm:w-96" />
      </div>

      {/* 3-col KPI strip */}
      <div className="rounded-panel border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-rule">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 sm:p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-36" />
            </div>
          ))}
        </div>
      </div>

      {/* Main panel skeleton */}
      <div className="rounded-panel border border-border bg-surface p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

/** Placeholder lines for a block of text or a short list that is still loading. */
export function SkeletonLines({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="Memuat" className={clsx("space-y-2.5", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${[92, 78, 85, 64][i % 4]}%` }} />
      ))}
    </div>
  );
}

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "rounded-panel border border-border bg-surface p-8 text-center",
        className
      )}
      {...props}
    >
      {icon ? (
        <div className="mx-auto mb-2 text-muted inline-flex items-center justify-center">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1 text-xs text-muted max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Terjadi Kesalahan",
  description,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={clsx(
        "rounded-panel border border-border bg-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-3 min-w-0">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-negative shrink-0 mt-0.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink leading-tight">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-muted leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {onRetry ? (
        <div className="shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-1.5 rounded-control border border-control bg-raised text-ink hover:bg-active min-h-[44px] lg:min-h-[32px] px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Coba lagi
          </button>
        </div>
      ) : null}
    </div>
  );
}
