"use client";

import { useEffect, useMemo, useState } from "react";

import {
  EChart,
  chartTooltipBase,
  useChartTheme,
  type ChartOption,
} from "@/components/chart";
import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelDividerGrid,
  PlayerCell,
  SectionHeader,
  Skeleton,
  Stat,
} from "@/components/ui";
import { useApi, type HistoryResponse, type PlayerHistoryItem } from "@/lib/api";
import { fmt } from "@/lib/format";

const LEAGUES = ["", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1"];

export function TrajectoryExplorerPanel() {
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (league) p.set("league", league);
    p.set("limit", "30");
    return `/history?${p.toString()}`;
  }, [query, league]);

  const res = useApi<HistoryResponse>(qs);
  const players = res.data?.players ?? [];
  const activePlayer: PlayerHistoryItem | undefined = useMemo(
    () => players.find((p) => p.player_id === selectedId) ?? players[0],
    [players, selectedId],
  );

  useEffect(() => {
    if (players.length && !players.some((p) => p.player_id === selectedId)) {
      setSelectedId(players[0].player_id);
    }
  }, [players, selectedId]);

  const theme = useChartTheme();

  const chartOption: ChartOption | null = useMemo(() => {
    if (!activePlayer || !activePlayer.history.length) return null;
    const pts = activePlayer.history;
    return {
      backgroundColor: "transparent",
      tooltip: {
        ...chartTooltipBase(theme),
        trigger: "axis",
        formatter: (params: unknown) => {
          const list = Array.isArray(params)
            ? (params as { dataIndex: number }[])
            : [(params as { dataIndex: number })];
          const pt = pts[list[0]?.dataIndex ?? 0];
          if (!pt) return "";
          return `<strong>${pt.date}</strong><br/>Valuasi: ${fmt.eur(pt.value_eur)}<br/>Klub: ${pt.club} (Usia ${pt.age_at_date})`;
        },
      },
      grid: { left: 56, right: 16, top: 24, bottom: 28 },
      xAxis: {
        type: "category",
        data: pts.map((p) => p.date),
        axisLabel: {
          color: theme.axisInk,
          fontSize: 11,
        },
        axisLine: {
          lineStyle: { color: theme.border },
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: theme.axisInk,
          fontSize: 11,
          formatter: (v: number) => fmt.eurShort(v),
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          lineStyle: { color: theme.grid },
        },
      },
      series: [
        {
          name: "Nilai Pasar (€)",
          type: "line",
          symbol: "circle",
          symbolSize: 6,
          showSymbol: pts.length <= 20,
          lineStyle: { width: 2, color: theme.chart1 },
          itemStyle: { color: theme.chart1 },
          areaStyle: { color: theme.chart1, opacity: 0.08 },
          data: pts.map((p) => p.value_eur),
        },
      ],
    };
  }, [activePlayer, theme]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tren Nilai Pasar Sepanjang Karier"
        subtitle="Telusuri riwayat valuasi pasar pemain Transfermarkt dari titik pertama hingga musim 2025/2026."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left column (lg:col-span-4): Panel list */}
        <Panel padding="sm" className="lg:col-span-4">
          <div className="space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama pemain atau klub..."
              aria-label="Cari nama pemain atau klub"
              className="w-full min-h-[44px] lg:min-h-[36px] rounded-control border border-control bg-raised px-3 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              aria-label="Filter liga"
              className="w-full min-h-[44px] lg:min-h-[36px] rounded-control border border-control bg-raised px-3 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Semua 5 Liga Top</option>
              {LEAGUES.filter(Boolean).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            {res.isError ? (
              <ErrorState
                title="Gagal Memuat Pemain"
                description="Terjadi kesalahan saat mengambil daftar pemain."
                onRetry={() => res.refetch()}
              />
            ) : res.isLoading ? (
              <div className="divide-y divide-rule" aria-busy="true">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 px-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </div>
                ))}
              </div>
            ) : players.length === 0 ? (
              <EmptyState
                title="Tidak Ada Pemain"
                description="Tidak ada pemain yang cocok dengan filter pencarian."
              />
            ) : (
              <div className="divide-y divide-rule max-h-[380px] lg:max-h-[415px] overflow-y-auto">
                {players.map((p) => {
                  const isSelected = activePlayer?.player_id === p.player_id;
                  return (
                    <button
                      key={p.player_id}
                      type="button"
                      onClick={() => setSelectedId(p.player_id)}
                      aria-selected={isSelected}
                      className={`min-h-[44px] w-full px-3 py-2.5 text-left transition-colors flex items-center justify-between gap-2 ${
                        isSelected ? "bg-active" : "hover:bg-raised/60"
                      }`}
                    >
                      <PlayerCell
                        playerId={p.player_id}
                        name={p.name}
                        club={p.peak_club}
                        meta={fmt.eurShort(p.current_value_eur)}
                        avatarSize={32}
                        badge={<TrajectoryBadge value={p.trajectory} />}
                        className="w-full"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>

        {/* Right column (lg:col-span-8): Detail panel */}
        <Panel className="lg:col-span-8">
          {res.isLoading ? (
            <div className="space-y-4" aria-busy="true">
              <div className="flex items-center gap-3.5 border-b border-rule pb-4">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3.5 w-64" />
                </div>
              </div>
              <div className="rounded-panel border border-border bg-raised p-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-rule">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-4 space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-[320px] w-full" />
              </div>
            </div>
          ) : !activePlayer ? (
            <EmptyState
              title="Pilih Pemain"
              description="Pilih pemain dari daftar di sebelah kiri untuk melihat riwayat nilai pasar."
            />
          ) : (
            <>
              {/* Player summary header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-rule pb-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <PlayerAvatar
                    playerId={activePlayer.player_id}
                    name={activePlayer.name}
                    size={48}
                  />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-ink truncate">
                      {activePlayer.name}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <ClubBadge
                        playerId={activePlayer.player_id}
                        club={activePlayer.peak_club}
                        size={14}
                      />
                      <span className="text-faint">·</span>
                      <LeagueBadge league={activePlayer.league_name} size={14} />
                      <span className="text-faint">·</span>
                      <span>{activePlayer.nationality}</span>
                      <span className="text-faint">·</span>
                      <span>Usia {activePlayer.age} thn</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 self-start sm:self-center">
                  <TrajectoryBadge value={activePlayer.trajectory} />
                </div>
              </div>

              {/* 4-column stat strip */}
              <Panel surface="raised" padding="none" className="mt-4">
                <PanelDividerGrid cols={4}>
                  <Stat
                    label="Nilai Sekarang"
                    value={fmt.eur(activePlayer.current_value_eur)}
                    tone="positive"
                  />
                  <Stat
                    label="Puncak Karier"
                    value={fmt.eur(activePlayer.peak_value_eur)}
                    tone="warning"
                  />
                  <Stat
                    label="Usia"
                    value={activePlayer.age}
                    unit="thn"
                    tone="neutral"
                  />
                  <Stat
                    label="Titik Valuasi"
                    value={activePlayer.history.length}
                    unit="titik"
                    tone="neutral"
                  />
                </PanelDividerGrid>
              </Panel>

              {/* Career value line chart */}
              <div className="mt-5">
                <SectionHeader as="h3" title="Riwayat Nilai Pasar" />
                {chartOption ? (
                  <div className="mt-3">
                    <EChart
                      option={chartOption}
                      height={320}
                      label={`Grafik riwayat nilai pasar ${activePlayer.name}`}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="Tidak Ada Data Riwayat"
                    description="Pemain ini belum memiliki catatan riwayat valuasi pasar."
                    className="mt-3"
                  />
                )}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
