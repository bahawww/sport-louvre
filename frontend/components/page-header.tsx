"use client";

export type MetaChip = { k: string; v: string };

export function PageHeader({
  title,
  description,
  meta,
  action,
}: {
  title: string;
  description?: string;
  meta?: MetaChip[] | null;
  action?: React.ReactNode;
}) {
  const chips: MetaChip[] = meta ?? [
    { k: "Dataset", v: "508 pemain" },
    { k: "Riwayat", v: "9.764 titik valuasi" },
    { k: "Split", v: "80:20 (406 / 102)" },
    { k: "Sumber", v: "Transfermarkt 2025/2026" },
  ];

  return (
    <header className="ua-enter flex flex-col gap-4 pt-4">
      <h1 className="ua-page-title text-balance">{title}</h1>
      {description ? <p className="ua-desc !text-[18px] !text-ink-2">{description}</p> : null}
      {(meta !== null && chips.length) || action ? (
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          {meta !== null && chips.length ? (
            <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2" aria-label="Ringkasan data">
              {chips.map((c) => (
                <div key={c.k} className="flex flex-col">
                  <dt className="text-[13px] font-semibold text-ink-3">{c.k}</dt>
                  <dd className="m-0 text-[15px] font-bold">{c.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {action}
        </div>
      ) : null}
    </header>
  );
}
