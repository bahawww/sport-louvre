import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Baris blok metrik: grid otomatis, tanpa kotak (garis atas tiap blok sudah mengelompokkan). */
export function MetricGrid({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="ua-metrics" {...props}>
      {children}
    </div>
  );
}

/** Blok satu angka dengan satu kalimat "artinya apa" (prinsip: setiap angka punya penjelasan). */
export function MetricCard({
  label,
  help,
  value,
  note,
  loading,
}: {
  label: string;
  help: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="ua-metric">
      <h3 className="ua-metric__title">{label}</h3>
      <p className="ua-metric__help">{help}</p>
      <div className="ua-metric__row">
        {loading ? (
          <Skeleton className="h-[44px] w-32" />
        ) : (
          <span className="ua-metric__value">{value}</span>
        )}
      </div>
      {note ? <p className="m-0 text-[13px] leading-5 text-ink-3">{note}</p> : null}
    </div>
  );
}

type Side = { who: string; value: string; pct: number };

/** Model utama (series-1) dan pembanding (series-2): satu angka besar, satu angka pembanding, dua bar. */
export function CompareCard({
  label,
  help,
  badge,
  main,
  other,
}: {
  label: string;
  help: string;
  badge?: { text: string; title: string; tone: "success" | "warning" };
  main: Side;
  other: Side;
}) {
  const bar = (pct: number) => `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <div className="ua-metric">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="ua-metric__title">{label}</h3>
        {badge ? (
          <span
            className={cn(
              "ua-badge",
              badge.tone === "success" ? "ua-badge--success" : "ua-badge--warning",
            )}
            title={badge.title}
          >
            {badge.text}
            <span className="sr-only"> ({badge.title})</span>
          </span>
        ) : null}
      </div>
      <p className="ua-metric__help">{help}</p>
      <div className="ua-metric__row">
        <span className="ua-metric__value">{main.value}</span>
        <span className="ua-metric__compare">
          {other.who} {other.value}
        </span>
      </div>
      <div className="flex flex-col gap-1.5" aria-hidden>
        <div className="ua-bar ua-bar--1">
          <span className="ua-anim-grow" style={{ width: bar(main.pct) }} />
        </div>
        <div className="ua-bar ua-bar--2">
          <span className="ua-anim-grow" style={{ width: bar(other.pct) }} />
        </div>
      </div>
      <span className="sr-only">
        {main.who} {main.value}; {other.who} {other.value}
      </span>
    </div>
  );
}
