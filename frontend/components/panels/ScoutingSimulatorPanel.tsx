"use client";

import { useMutation } from "@tanstack/react-query";
import { RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EChart } from "@/components/chart";
import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import {
  fetchApi,
  useApi,
  type DatasetPlayerRow,
  type DatasetsResponse,
  type SimulateRequest,
  type SimulateResponse,
} from "@/lib/api";
import { fmt, TREND_META } from "@/lib/format";
import { LEAGUE_CATALOG } from "@/lib/geo";

const DEFAULT_HORIZON_MONTHS = 5;

interface Scenario {
  horizonMonths: number;
  shockPct: number;
  league: string;
}

function buildPayload(player: DatasetPlayerRow, sc: Scenario): SimulateRequest {
  return {
    player_id: player.player_id,
    scenario: {
      horizon_years:
        sc.horizonMonths === DEFAULT_HORIZON_MONTHS ? undefined : sc.horizonMonths / 12,
      league_name: sc.league !== player.league_name ? sc.league : undefined,
      append_valuations:
        sc.shockPct !== 0
          ? [{ value_eur: player.current_value_eur * (1 + sc.shockPct / 100), years_after: 0.5 }]
          : [],
    },
  };
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function ScoutingSimulatorPanel() {
  const datasets = useApi<DatasetsResponse>("/datasets");
  const [player, setPlayer] = useState<DatasetPlayerRow | null>(null);
  const [scenario, setScenario] = useState<Scenario>({
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    shockPct: 0,
    league: "Premier League",
  });
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const sim = useMutation({
    mutationFn: (payload: SimulateRequest) =>
      fetchApi<SimulateResponse>("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
  });

  const selectPlayer = (p: DatasetPlayerRow) => {
    setPlayer(p);
    setScenario({ horizonMonths: DEFAULT_HORIZON_MONTHS, shockPct: 0, league: p.league_name });
    setPickerOpen(false);
    setSearch("");
  };

  // Start with the most valuable player so the panel is never empty.
  useEffect(() => {
    if (!player && datasets.data?.players.length) selectPlayer(datasets.data.players[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.data]);

  useEffect(() => {
    if (!player) return;
    const t = setTimeout(() => sim.mutate(buildPayload(player, scenario)), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, scenario]);

  const matches = useMemo(() => {
    const list = datasets.data?.players ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 10);
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.peak_club.toLowerCase().includes(q) ||
          p.league_name.toLowerCase().includes(q) ||
          (p.position ?? "").toLowerCase().includes(q),
      )
      .slice(0, 14);
  }, [datasets.data, search]);

  const data = sim.data;
  const outlook = data?.outlook_12m ?? null;
  const scenarioActive =
    !!player &&
    (scenario.shockPct !== 0 ||
      scenario.horizonMonths !== DEFAULT_HORIZON_MONTHS ||
      scenario.league !== player.league_name);
  const levelPct = Math.round((data?.interval_level ?? 0.8) * 100);

  const chartOption = useMemo(() => {
    if (!data?.player) return null;
    const p = data.player;
    const history = p.history.map((h) => [h.date, h.value_eur]);
    const last = [...p.history, ...p.hypothetical].at(-1);
    if (!last) return null;
    const series: object[] = [
      {
        name: "Riwayat",
        type: "line",
        showSymbol: false,
        lineStyle: { color: "#38BDF8", width: 2 },
        itemStyle: { color: "#38BDF8" },
        data: history,
      },
      {
        name: "Prakiraan update berikutnya",
        type: "line",
        symbolSize: 9,
        lineStyle: { color: "#10B981", width: 2, type: "dashed" },
        itemStyle: { color: "#10B981" },
        data: [
          [last.date, last.value_eur],
          [p.forecast_date, data.predicted_value_eur],
        ],
      },
      {
        name: `Interval ${levelPct}%`,
        type: "line",
        symbol: "rect",
        symbolSize: [12, 2],
        lineStyle: { color: "#10B981", width: 2 },
        itemStyle: { color: "#10B981" },
        data: [
          [p.forecast_date, data.value_range_eur[0]],
          [p.forecast_date, data.value_range_eur[1]],
        ],
      },
    ];
    if (p.hypothetical.length) {
      const lastReal = p.history.at(-1);
      series.push({
        name: "Valuasi hipotetis",
        type: "line",
        symbolSize: 9,
        lineStyle: { color: "#F59E0B", width: 2, type: "dotted" },
        itemStyle: { color: "#F59E0B" },
        data: [
          ...(lastReal ? [[lastReal.date, lastReal.value_eur]] : []),
          ...p.hypothetical.map((h) => [h.date, h.value_eur]),
        ],
      });
    }
    if (outlook) {
      const date12 = addMonths(outlook.valuation_date, 12);
      series.push(
        {
          name: "Proyeksi 12 bulan",
          type: "line",
          symbolSize: 9,
          lineStyle: { color: "#A78BFA", width: 2, type: "dashed" },
          itemStyle: { color: "#A78BFA" },
          data: [
            [outlook.valuation_date, outlook.current_value_eur],
            [date12, outlook.expected_value_eur],
          ],
        },
        {
          name: `Rentang 12 bulan ${levelPct}%`,
          type: "line",
          symbol: "rect",
          symbolSize: [12, 2],
          lineStyle: { color: "#A78BFA", width: 2 },
          itemStyle: { color: "#A78BFA" },
          data: [
            [date12, outlook.expected_range_eur[0]],
            [date12, outlook.expected_range_eur[1]],
          ],
        },
      );
    }
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
        formatter: (x: { seriesName: string; data: [string, number] }) =>
          `${x.seriesName}<br/>${x.data[0]}: <strong>${fmt.eur(x.data[1])}</strong>`,
      },
      legend: { top: 0, textStyle: { color: "#94A3B8", fontSize: 11 } },
      grid: { left: 62, right: 24, top: 44, bottom: 30 },
      xAxis: {
        type: "time",
        axisLabel: { color: "#94A3B8", fontSize: 11 },
        axisLine: { lineStyle: { color: "#243244" } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      series,
    };
  }, [data, outlook, levelPct]);

  const trend = data?.predicted_trend ? TREND_META[data.predicted_trend] : null;
  const signal =
    outlook?.signal === "Buy"
      ? { label: "Layak Beli", className: "bg-[#10B981]/15 text-[#10B981]" }
      : outlook?.signal === "DepreciationRisk"
        ? { label: "Risiko Turun", className: "bg-[#EF4444]/15 text-[#EF4444]" }
        : { label: "Netral", className: "bg-[#243244] text-[#94A3B8]" };

  return (
    <div className="space-y-5">
      {/* Player picker */}
      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {player ? (
            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar playerId={player.player_id} name={player.name} size={52} />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-[#F1F5F9]">{player.name}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#94A3B8]">
                  <ClubBadge playerId={player.player_id} club={player.peak_club} size={13} />
                  <LeagueBadge league={player.league_name} size={13} />
                  <span>· {player.position ?? "-"}</span>
                  <span>· {player.age ?? "-"} thn</span>
                  <span>· {player.nationality}</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#94A3B8]">Memuat daftar pemain...</p>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#10B981]/50 bg-[#10B981]/10 px-3.5 py-2 text-xs font-bold text-[#10B981] transition hover:bg-[#10B981]/20"
            >
              <Search className="size-3.5" />
              Ganti Pemain ({datasets.data ? fmt.int(datasets.data.total_players) : "..."} tersedia)
            </button>
            {pickerOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-[#243244] bg-[#121A24] p-3 shadow-2xl">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nama, klub, liga, atau posisi..."
                  className="w-full rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2 text-xs text-[#F1F5F9] placeholder-[#64748B]"
                />
                <div className="mt-2 max-h-72 divide-y divide-[#1E293B] overflow-y-auto">
                  {matches.map((p) => (
                    <button
                      key={p.player_id}
                      type="button"
                      onClick={() => selectPlayer(p)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-[#182230]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <PlayerAvatar playerId={p.player_id} name={p.name} size={28} />
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-[#F1F5F9]">
                            {p.name}
                          </span>
                          <span className="block truncate text-[10px] text-[#94A3B8]">
                            {p.peak_club} · {p.position ?? "-"}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-[#10B981]">
                        {fmt.eurShort(p.current_value_eur)}
                      </span>
                    </button>
                  ))}
                  {matches.length === 0 ? (
                    <p className="py-4 text-center text-xs text-[#64748B]">Pemain tidak ditemukan.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {sim.isError ? (
        <p className="rounded-xl border border-[#EF4444]/40 bg-[#121A24] p-4 text-xs text-[#EF4444]">
          Prediksi gagal: {sim.error.message}
        </p>
      ) : null}

      {/* Key numbers */}
      {player && data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-4">
            <p className="text-xs text-[#94A3B8]">Nilai Pasar Sekarang</p>
            <p className="mt-1 text-2xl font-extrabold text-[#F59E0B]">
              {fmt.eur(player.current_value_eur)}
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Puncak karier {fmt.eur(player.peak_value_eur)} · valuasi terakhir{" "}
              {data.player?.history.at(-1)?.date}
            </p>
          </div>

          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-4">
            <p className="text-xs text-[#94A3B8]">Prakiraan Update Berikutnya</p>
            <p className="mt-1 text-2xl font-extrabold text-[#10B981]">
              {fmt.eur(data.predicted_value_eur)}
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Interval {levelPct}%: {fmt.eurShort(data.value_range_eur[0])} –{" "}
              {fmt.eurShort(data.value_range_eur[1])} · sekitar {data.player?.forecast_date}
            </p>
          </div>

          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#94A3B8]">Proyeksi 12 Bulan</p>
              {outlook ? (
                <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${signal.className}`}>
                  {signal.label}
                </span>
              ) : null}
            </div>
            {outlook ? (
              <>
                <p className="mt-1 text-2xl font-extrabold text-[#A78BFA]">
                  {fmt.eur(outlook.expected_value_eur)}
                  <span className="ml-2 text-sm font-bold">
                    {outlook.expected_change_pct > 0 ? "+" : ""}
                    {outlook.expected_change_pct.toFixed(0)}%
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  Peluang naik {fmt.pct(outlook.p_up, 0)} · turun {fmt.pct(outlook.p_down, 0)} ·
                  rentang {fmt.eurShort(outlook.expected_range_eur[0])} –{" "}
                  {fmt.eurShort(outlook.expected_range_eur[1])}
                </p>
              </>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-[#94A3B8]">
                Proyeksi 12 bulan hanya dihitung dari riwayat asli. Kembalikan skenario pindah liga
                dan valuasi hipotetis untuk melihatnya.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-4">
            <p className="text-xs text-[#94A3B8]">Posisi terhadap Puncak Karier</p>
            <p className="mt-1 text-2xl font-extrabold text-[#F1F5F9]">
              {player.peak_value_eur > 0
                ? `${Math.round((player.current_value_eur / player.peak_value_eur) * 100)}%`
                : "-"}
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Nilai sekarang dibanding nilai tertinggi yang pernah dicapai. Harga yang sudah jatuh
              jauh biasanya lanjut turun, bukan tanda murah.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Chart */}
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">Riwayat Harga dan Prediksi</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Fitur model dihitung dari riwayat valuasi asli pemain ini, sama persis dengan saat
            training.
          </p>
          <div className="mt-3">
            {chartOption ? (
              <EChart option={chartOption} height={340} label="Riwayat harga dan prediksi pemain" />
            ) : (
              <p className="py-16 text-center text-xs text-[#94A3B8]">Menghitung prediksi...</p>
            )}
          </div>
        </div>

        {/* Scenario + trend */}
        <div className="space-y-5">
          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#F1F5F9]">Skenario What-If</h3>
              <button
                type="button"
                disabled={!scenarioActive}
                onClick={() =>
                  player &&
                  setScenario({
                    horizonMonths: DEFAULT_HORIZON_MONTHS,
                    shockPct: 0,
                    league: player.league_name,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#243244] bg-[#0B1117] px-2.5 py-1.5 text-[11px] font-semibold text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-40"
              >
                <RotateCcw className="size-3" />
                Reset
              </button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Valuasi hipotetis 6 bulan lagi</span>
                <span className="font-bold text-[#F59E0B]">
                  {scenario.shockPct === 0
                    ? "tidak ada"
                    : `${scenario.shockPct > 0 ? "+" : ""}${scenario.shockPct}%`}
                </span>
              </div>
              <input
                type="range"
                min={-60}
                max={100}
                step={5}
                value={scenario.shockPct}
                onChange={(e) => setScenario((s) => ({ ...s, shockPct: Number(e.target.value) }))}
                className="mt-2 w-full accent-[#F59E0B]"
              />
              <p className="mt-1 text-[10px] text-[#64748B]">
                Misal harga naik atau turun sekian persen, lalu model menebak update sesudahnya.
              </p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Jarak ke update berikutnya</span>
                <span className="font-bold text-[#F1F5F9]">{scenario.horizonMonths} bulan</span>
              </div>
              <input
                type="range"
                min={2}
                max={18}
                step={1}
                value={scenario.horizonMonths}
                onChange={(e) =>
                  setScenario((s) => ({ ...s, horizonMonths: Number(e.target.value) }))
                }
                className="mt-2 w-full accent-[#10B981]"
              />
            </div>

            <div className="mt-4">
              <span className="text-xs font-semibold text-[#94A3B8]">Pindah liga</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LEAGUE_CATALOG.map((cat) => (
                  <button
                    key={cat.league}
                    type="button"
                    onClick={() => setScenario((s) => ({ ...s, league: cat.league }))}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                      scenario.league === cat.league
                        ? "border-[#10B981] bg-[#10B981]/15 text-[#F1F5F9]"
                        : "border-[#243244] bg-[#0B1117] text-[#94A3B8] hover:text-[#F1F5F9]"
                    }`}
                  >
                    <LeagueBadge league={cat.league} size={13} showName={false} />
                    {cat.league}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-[#64748B]">
                Efek liga kecil: harga terakhir pemain sudah memuat sebagian besar informasinya.
              </p>
            </div>

            {data?.baseline && data.scenario_delta_eur !== undefined ? (
              <p className="mt-4 rounded-lg border border-[#243244] bg-[#0B1117] p-2.5 text-xs text-[#94A3B8]">
                Tanpa skenario: {fmt.eur(data.baseline.predicted_value_eur)}. Dengan skenario:{" "}
                {fmt.eur(data.predicted_value_eur)} (
                <strong className={data.scenario_delta_eur >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}>
                  {data.scenario_delta_eur >= 0 ? "+" : ""}
                  {fmt.eur(data.scenario_delta_eur)}
                </strong>
                ).
              </p>
            ) : null}

            {data?.warnings?.length ? (
              <ul className="mt-3 space-y-1 text-[11px] text-[#F59E0B]">
                {data.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#F1F5F9]">Tren di Update Berikutnya</h3>
              {trend ? (
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${trend.className}`}
                >
                  {trend.label}
                </span>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {Object.entries(data?.trend_probabilities ?? {}).map(([cls, prob]) => (
                <div key={cls}>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#F1F5F9]">
                      {TREND_META[cls]?.label ?? cls}{" "}
                      <span className="text-[10px] text-[#64748B]">({TREND_META[cls]?.hint})</span>
                    </span>
                    <span className="font-bold text-[#94A3B8]">{fmt.pct(prob)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#1E293B]">
                    <div
                      className="h-full rounded-full bg-[#10B981] transition-all duration-300"
                      style={{ width: `${Math.round(prob * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {data ? (
              <p className="mt-3 text-[11px] leading-relaxed text-[#94A3B8]">{data.scouting_verdict}</p>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-[#64748B]">
        Semua angka adalah nilai pasar Transfermarkt, bukan harga transfer. Model tidak punya data
        performa, cedera, atau kontrak. Pindah klub tidak bisa disimulasikan karena riwayat klub di
        dataset tidak layak pakai.
      </p>
    </div>
  );
}
