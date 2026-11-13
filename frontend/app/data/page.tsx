"use client";

import { useEffect, useMemo, useState } from "react";

import { EChart, useChartColors } from "@/components/chart";
import { PageHeader } from "@/components/page-header";
import { ChartSkeleton, ErrorState } from "@/components/states";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ScrollX } from "@/components/ui/scroll-x";
import { useApi, type HistoryResponse, type PlayerHistoryItem } from "@/lib/api";
import { fmt } from "@/lib/format";

const LEAGUES = ["", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1"];

export default function DataPage() {
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const c = useChartColors();

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

  const historyOption = useMemo(() => {
    if (!activePlayer || !activePlayer.history.length) return null;
    const pts = activePlayer.history;
    return {
      grid: { left: 64, right: 24, top: 28, bottom: 44 },
      tooltip: {
        trigger: "axis",
        formatter: (params: { dataIndex: number }[]) => {
          const pt = pts[params[0]?.dataIndex ?? 0];
          if (!pt) return "";
          return `<strong>${pt.date}</strong><br/>Valuasi: ${fmt.eur(pt.value_eur)}<br/>Klub: ${pt.club} (Usia ${pt.age_at_date})`;
        },
      },
      xAxis: {
        type: "category",
        data: pts.map((p) => p.date),
        axisLabel: { color: c.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: c.axis } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: c.grid } },
      },
      series: [
        {
          name: "Nilai Pasar (€)",
          type: "line",
          smooth: false,
          symbolSize: 7,
          lineStyle: { width: 2.5, color: c.accent },
          itemStyle: { color: c.accent },
          areaStyle: { color: `${c.accent}1a` },
          markPoint: {
            data: [{ type: "max", name: "Peak" }],
            label: { formatter: (p: { value: number }) => fmt.eurShort(p.value) },
          },
          data: pts.map((p) => p.value_eur),
        },
      ],
    };
  }, [activePlayer, c]);

  if (res.isError) {
    return <ErrorState message={(res.error as Error)?.message} onRetry={() => res.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title="Tren Karir Historis Pemain"
        description="Telusuri 9.764 titik valuasi historis dari Transfermarkt berdasarkan nama pemain, klub, atau 5 liga top Eropa."
      />

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Cari pemain atau klub" className="min-w-[240px] flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama pemain atau klub (misal: Haaland, Real Madrid)..."
          />
        </Field>
        <Field label="Filter liga">
          <Select value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Semua 5 Liga Top</option>
            {LEAGUES.filter(Boolean).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card panel className="self-start">
          <CardHeader title={`Daftar Pemain (${players.length})`} />
          <CardBody>
            <div className="flex max-h-[460px] flex-col divide-y divide-line-soft overflow-y-auto">
              {players.map((p) => {
                const isActive = activePlayer?.player_id === p.player_id;
                return (
                  <button
                    key={p.player_id}
                    type="button"
                    onClick={() => setSelectedId(p.player_id)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-2.5 text-left transition-colors ${
                      isActive ? "bg-sunken font-bold" : "hover:bg-sunken/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-[14px] text-ink">{p.name}</span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {p.peak_club} · {p.league_name}
                      </span>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-accent">
                      {fmt.eurShort(p.current_value_eur)}
                    </span>
                  </button>
                );
              })}
              {!players.length && !res.isLoading ? (
                <p className="py-4 text-[14px] text-ink-3">Tidak ada pemain yang cocok.</p>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          {activePlayer ? (
            <>
              <CardHeader
                title={activePlayer.name}
                description={`${activePlayer.peak_club} · ${activePlayer.league_name} · ${activePlayer.nationality} · Usia ${activePlayer.age} tahun`}
                action={<TrajectoryBadge value={activePlayer.trajectory} />}
              />
              <CardBody>
                <div className="flex flex-wrap gap-8 border-y border-line-soft py-3 text-[14px]">
                  <div>
                    <span className="block text-[12px] text-ink-3">Nilai Saat Ini</span>
                    <strong className="text-[18px]">{fmt.eur(activePlayer.current_value_eur)}</strong>
                  </div>
                  <div>
                    <span className="block text-[12px] text-ink-3">Nilai Puncak (Peak)</span>
                    <strong className="text-[18px]">{fmt.eur(activePlayer.peak_value_eur)}</strong>
                  </div>
                  <div>
                    <span className="block text-[12px] text-ink-3">Titik Historis</span>
                    <strong className="text-[18px]">{activePlayer.history.length} catatan</strong>
                  </div>
                </div>

                {historyOption ? (
                  <EChart
                    option={historyOption}
                    height={320}
                    label={`Grafik historis nilai pasar ${activePlayer.name}`}
                  />
                ) : (
                  <ChartSkeleton height={320} />
                )}

                <ScrollX>
                  <table className="ua-table">
                    <thead>
                      <tr>
                        <th scope="col">Tanggal</th>
                        <th scope="col">Klub</th>
                        <th scope="col">Usia</th>
                        <th scope="col" className="text-right">
                          Valuasi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activePlayer.history].reverse().slice(0, 12).map((h, i) => (
                        <tr key={`${h.date}-${i}`}>
                          <td>{h.date}</td>
                          <td>{h.club}</td>
                          <td>{h.age_at_date}</td>
                          <td className="text-right font-semibold">{fmt.eur(h.value_eur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollX>
              </CardBody>
            </>
          ) : (
            <ChartSkeleton height={400} />
          )}
        </Card>
      </div>
    </>
  );
}
