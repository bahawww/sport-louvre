import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Bagian halaman. Isi duduk langsung di latar; `panel` hanya untuk isi yang perlu dikelompokkan
 * (matriks, formulir, catatan), sesuai prinsip "sedikit kotak" design system.
 */
export function Card({
  className,
  panel,
  ...props
}: React.HTMLAttributes<HTMLElement> & { panel?: boolean }) {
  return <section className={cn("ua-card", panel && "ua-panel", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="ua-card__head">
      <div className="min-w-0">
        <h2 id={id} className="ua-card__title text-balance">
          {title}
        </h2>
        {description ? <p className="ua-card__sub">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4", className)} {...props} />
  );
}
