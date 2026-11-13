import { Skeleton } from "@/components/ui/skeleton";

export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div style={{ height }}>
      <Skeleton className="h-full w-full rounded-[var(--radius-md)]" />
    </div>
  );
}

export function ErrorState({
  title = "Gagal memuat data",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ua-panel flex flex-col items-start gap-3">
      <h2 className="m-0 text-[17px] font-bold text-danger">{title}</h2>
      {message ? <p className="m-0 text-[14px] text-ink-2">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="ua-btn ua-btn--secondary ua-btn--sm" onClick={onRetry}>
          Muat ulang
        </button>
      ) : null}
    </div>
  );
}
