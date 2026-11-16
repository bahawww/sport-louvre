"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { LeagueBadge, resolveClubName, useMediaManifest } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import {
  Badge,
  buttonVariants,
  DataTable,
  type DataTableColumn,
  ErrorState,
  PageHeader,
  Pagination,
  Panel,
  PanelSkeleton,
  PlayerCell,
  SectionHeader,
} from "@/components/ui";
import { useApi, type DatasetPlayerRow, type DatasetsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const PAGE_SIZE = 50; // rendering all 2,418 rows at once made the tab lag

const DOWNLOAD_GROUPS = [
  {
    id: "dataset",
    title: "1. Dataset dan sumbernya",
    note: "Data yang dipakai melatih dan menguji model, sudah dengan perbaikan 508 baris lama.",
  },
  {
    id: "model",
    title: "2. Model dan workflow analisis",
    note: "Model yang sudah dilatih, dan kode yang menghasilkannya dari CSV.",
  },
  {
    id: "evaluation",
    title: "3. Hasil pengujian dan evaluasi model",
    note: "Angka pengujian pada 484 pemain uji, validasi silang, dan uji ke masa depan.",
  },
  {
    id: "report",
    title: "4. Laporan analisis",
    note: "Ringkasan tiga halaman: data, metode, hasil, temuan, dan batasan.",
  },
] as const;

export function DatasetPanel() {
  const manifest = useMediaManifest();
  const res = useApi<DatasetsResponse>("/datasets");
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("ALL");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!res.data) return [];
    const q = search.trim().toLowerCase();
    return res.data.players.filter((p) => {
      if (league !== "ALL" && p.league_name !== league) return false;
      if (!q) return true;
      const clubName = resolveClubName(manifest, p.player_id, p.peak_club);
      return (
        p.name.toLowerCase().includes(q) ||
        clubName.toLowerCase().includes(q) ||
        p.peak_club.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q)
      );
    });
  }, [res.data, search, league, manifest]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage]
  );

  const columns = useMemo<DataTableColumn<DatasetPlayerRow>[]>(
    () => [
      {
        key: "rank",
        header: "#",
        align: "right",
        headerClassName: "w-12",
        className: "w-12 text-muted tabular-nums whitespace-nowrap",
        cell: (_row, index) => safePage * PAGE_SIZE + index + 1,
      },
      {
        key: "player",
        header: "Pemain",
        align: "left",
        headerClassName: "min-w-[200px]",
        className: "min-w-[200px]",
        cell: (row) => (
          <PlayerCell
            playerId={row.player_id}
            name={row.name}
            club={row.peak_club}
            meta={row.nationality}
            avatarSize={32}
            showClubLogo={true}
          />
        ),
      },
      {
        key: "league",
        header: "Liga",
        align: "left",
        headerClassName: "min-w-[130px]",
        className: "min-w-[130px] text-muted whitespace-nowrap",
        cell: (row) => <LeagueBadge league={row.league_name} size={14} />,
      },
      {
        key: "trajectory",
        header: "Tren",
        align: "left",
        headerClassName: "min-w-[120px]",
        className: "min-w-[120px] whitespace-nowrap",
        cell: (row) => <TrajectoryBadge value={row.trajectory} />,
      },
      {
        key: "age",
        header: "Usia",
        align: "right",
        headerClassName: "min-w-[60px]",
        className: "min-w-[60px] text-muted tabular-nums whitespace-nowrap",
        cell: (row) => (row.age !== null ? row.age : "—"),
      },
      {
        key: "current_value",
        header: "Nilai Kini",
        align: "right",
        headerClassName: "min-w-[95px]",
        className: "min-w-[95px] font-semibold text-ink tabular-nums whitespace-nowrap",
        cell: (row) => fmt.eur(row.current_value_eur),
      },
      {
        key: "peak_value",
        header: "Puncak",
        align: "right",
        headerClassName: "min-w-[95px]",
        className: "min-w-[95px] text-muted tabular-nums whitespace-nowrap",
        cell: (row) => fmt.eur(row.peak_value_eur),
      },
      {
        key: "career_span",
        header: "Karier",
        align: "right",
        headerClassName: "min-w-[75px]",
        className: "min-w-[75px] text-muted tabular-nums whitespace-nowrap",
        cell: (row) =>
          row.career_span_years != null
            ? `${row.career_span_years.toFixed(1)} thn`
            : "—",
      },
      {
        key: "valuation_points",
        header: "Titik",
        align: "right",
        headerClassName: "min-w-[60px]",
        className: "min-w-[60px] text-muted tabular-nums whitespace-nowrap",
        cell: (row) => row.num_valuation_points,
      },
    ],
    [safePage]
  );

  if (res.isLoading) {
    return <PanelSkeleton />;
  }

  if (res.isError || !res.data) {
    return (
      <ErrorState
        title="Gagal Memuat Dataset"
        description="Gagal memuat katalog dataset dari server. Pastikan service backend aktif."
        onRetry={() => res.refetch()}
      />
    );
  }

  const players = res.data.players;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dataset & Unduhan"
        subtitle="Empat keluaran proyek ini bisa diunduh: dataset beserta sumbernya, model dan workflow analisis, hasil pengujian, dan laporan analisis tiga halaman. Di bawahnya ada tabel seluruh pemain."
      />

      {/* One row per deliverable: its name on the left, its files as a list on the right. */}
      <Panel padding="none" className="divide-y divide-border">
        {DOWNLOAD_GROUPS.map((g) => {
          const files = res.data.files.filter((f) => (f.group ?? "dataset") === g.id);
          if (!files.length) return null;
          return (
            <section
              key={g.id}
              aria-labelledby={`unduhan-${g.id}`}
              className="grid gap-x-8 gap-y-3 p-4 sm:p-5 lg:grid-cols-[16rem_minmax(0,1fr)]"
            >
              <div>
                <h2 id={`unduhan-${g.id}`} className="text-[15px] font-semibold text-ink">
                  {g.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{g.note}</p>
              </div>
              <div className="min-w-0">
                <ul className="divide-y divide-rule">
                  {files.map((f) => (
                    <li
                      key={f.filename}
                      className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    >
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-ink">{f.label}</h3>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{f.description}</p>
                        <p className="mt-1 text-xs text-faint tabular-nums">
                          {f.format} · {formatBytes(f.size_bytes)}
                          {f.rows != null ? ` · ${fmt.int(f.rows)} baris` : ""}
                          {f.columns != null ? ` · ${f.columns} kolom` : ""}
                        </p>
                      </div>
                      <a
                        href={f.download_url}
                        download={f.filename}
                        aria-label={`Unduh ${f.label}`}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full shrink-0 sm:w-28")}
                      >
                        <Download className="size-4 shrink-0" aria-hidden="true" />
                        <span>Unduh</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {g.id === "dataset" && res.data.sources?.length ? (
                  <div className="mt-4 rounded-control bg-raised p-3 sm:p-4">
                    <h3 className="text-[13px] font-medium text-ink">Sumber data</h3>
                    <dl className="mt-1.5 space-y-1.5 text-[13px]">
                      {res.data.sources.map((src) => (
                        <div key={src.name} className="grid gap-x-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                          <dt>
                            <a href={src.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                              {src.name}
                            </a>
                          </dt>
                          <dd className="leading-relaxed text-muted">{src.role}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </Panel>

      <Panel className="space-y-4">
        <SectionHeader
          title={`Dataset Total Pemain (${filtered.length} / ${players.length})`}
          subtitle="Seluruh 2.418 pemain Transfermarkt 2025/2026 dari 5 liga top Eropa."
          actions={
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Cari nama, klub, atau negara..."
                className="w-full sm:w-60 min-h-[44px] lg:min-h-[36px] rounded-control border border-control bg-raised px-3 text-[13px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="Cari nama, klub, atau negara"
              />
              <select
                value={league}
                onChange={(e) => {
                  setLeague(e.target.value);
                  setPage(0);
                }}
                className="min-h-[44px] lg:min-h-[36px] rounded-control border border-control bg-raised px-3 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="Filter berdasarkan liga"
              >
                <option value="ALL">Semua Liga</option>
                <option value="Premier League">Premier League</option>
                <option value="La Liga">La Liga</option>
                <option value="Serie A">Serie A</option>
                <option value="Bundesliga">Bundesliga</option>
                <option value="Ligue 1">Ligue 1</option>
              </select>
            </div>
          }
        />

        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(p) => p.player_id}
          framed={true}
          emptyMessage="Tidak ada pemain yang cocok dengan filter pencarian."
          ariaLabel="Tabel dataset pemain"
        />

        <Pagination
          page={safePage + 1}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => setPage(p - 1)}
          unitLabel="pemain"
        />
      </Panel>
    </div>
  );
}
