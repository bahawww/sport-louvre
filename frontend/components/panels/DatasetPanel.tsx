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
        subtitle="Unduh dataset Transfermarkt 2025/2026 dalam format CSV atau Parquet, atau telusuri seluruh 2.418 pemain."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {res.data.files.map((f) => (
          <Panel key={f.filename} className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="neutral">{f.format}</Badge>
                <span className="text-xs text-muted tabular-nums">
                  {formatBytes(f.size_bytes)}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">{f.label}</h3>
              <p className="mt-1 text-[13px] text-muted leading-relaxed">{f.description}</p>
              <p className="mt-2 text-xs text-faint tabular-nums">
                {fmt.int(f.rows)} baris · {f.columns} kolom
              </p>
            </div>
            <a
              href={f.download_url}
              download={f.filename}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "w-full mt-auto"
              )}
            >
              <Download className="size-4 shrink-0" aria-hidden="true" />
              <span>Unduh {f.format}</span>
            </a>
          </Panel>
        ))}
      </div>

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
