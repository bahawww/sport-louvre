"use client";

import { useEffect, useMemo, useState } from "react";

import { EChart } from "@/components/chart";
import { TrajectoryBadge } from "@/components/trajectory-badge";
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

  const chartOption = useMemo(() => {
    if (!activePlayer || !activePlayer.history.length) return null;
    const pts = activePlayer.history;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
        formatter: (params: { dataIndex: number }[]) => {
          const pt = pts[params[0]?.dataIndex ?? 0];
          if (!pt) return "";
          return `<strong>${pt.date}</strong><br/>Valuasi: ${fmt.eur(pt.value_eur)}<br/>Klub: ${pt.club} (Usia ${pt.age_at_date})`;
        },
      },
      grid: { left: 64, right: 20, top: 24, bottom: 36 },
      xAxis: {
        type: "category",
        data: pts.map((p) => p.date),
        axisLabel: { color: "#94A3B8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#243244" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      series: [
        {
          name: "Nilai Pasar (€)",
          type: "line",
          symbolSize: 7,
          lineStyle: { width: 2.5, color: "#10B981" },
          itemStyle: { color: "#10B981" },
          areaStyle: { color: "rgba(16, 185, 129, 0.12)" },
          markPoint: {
            data: [{ type: "max", name: "Peak", itemStyle: { color: "#F59E0B" } }],
            label: { formatter: (p: { value: number }) => fmt.eurShort(p.value), color: "#0B1117" },
          },
          data: pts.map((p) => p.value_eur),
        },
      ],
    };
  }, [activePlayer]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama pemain atau klub (contoh: Haaland, Arsenal)..."
          className="min-w-[240px] flex-1 rounded-lg border border-[#243244] bg-[#121A24] px-3.5 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B]"
        />
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="rounded-lg border border-[#243244] bg-[#121A24] px-3.5 py-2 text-sm text-[#F1F5F9]"
        >
          <option value="">Semua 5 Liga Top</option>
          {LEAGUES.filter(Boolean).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-3">
          <p className="px-2 pb-2 text-xs font-semibold text-[#94A3B8]">
            Pemain ({players.length})
          </p>
          <div className="max-h-[440px] divide-y divide-[#1E293B] overflow-y-auto">
            {players.map((p) => {
              const active = activePlayer?.player_id === p.player_id;
              return (
                <button
                  key={p.player_id}
                  type="button"
                  onClick={() => setSelectedId(p.player_id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                    active ? "bg-[#182230]" : "hover:bg-[#182230]/50"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#F1F5F9]">
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-[#94A3B8]">
                      {p.peak_club} · {p.league_name}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-[#10B981]">
                    {fmt.eurShort(p.current_value_eur)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          {activePlayer ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E293B] pb-4">
                <div>
                  <h3 className="text-xl font-extrabold text-[#F1F5F9]">{activePlayer.name}</h3>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">
                    {activePlayer.peak_club} · {activePlayer.league_name} · {activePlayer.nationality} ·
                    Usia {activePlayer.age} thn
                  </p>
                </div>
                <TrajectoryBadge value={activePlayer.trajectory} />
              </div>

              <div className="my-4 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[#94A3B8]">Nilai Saat Ini</span>
                  <p className="mt-0.5 text-lg font-bold text-[#10B981]">
                    {fmt.eur(activePlayer.current_value_eur)}
                  </p>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Peak Value</span>
                  <p className="mt-0.5 text-lg font-bold text-[#F59E0B]">
                    {fmt.eur(activePlayer.peak_value_eur)}
                  </p>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Titik Valuasi</span>
                  <p className="mt-0.5 text-lg font-bold text-[#F1F5F9]">
                    {activePlayer.history.length}
                  </p>
                </div>
              </div>

              {chartOption ? (
                <EChart option={chartOption} height={320} label={`Tren historis ${activePlayer.name}`} />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[#94A3B8]">Pilih pemain dari daftar di sebelah kiri.</p>
          )}
        </div>
      </div>
    </div>
  );
}
