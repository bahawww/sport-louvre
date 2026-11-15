"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { chartTooltipBase, EChart, useChartTheme, type ChartOption } from "@/components/chart";
import {
  ClubBadge,
  LeagueBadge,
  PlayerAvatar,
  resolveClubName,
  useMediaManifest,
} from "@/components/entity-media";
import {
  Badge,
  Button,
  ErrorState,
  Meter,
  type MeterTone,
  PageHeader,
  Panel,
  PanelDividerGrid,
  SectionHeader,
  Stat,
} from "@/components/ui";
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
import { cn } from "@/lib/utils";

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

const TREND_TONE_MAP: Record<string, MeterTone> = {
  rising: "mint",
  stable: "amber",
  declining: "orange",
  falling_sharply: "crimson",
};

export function ScoutingSimulatorPanel() {
  const theme = useChartTheme();
  const manifest = useMediaManifest();
  const datasets = useApi<DatasetsResponse>("/datasets");
  const [player, setPlayer] = useState<DatasetPlayerRow | null>(null);
  const [scenario, setScenario] = useState<Scenario>({
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    shockPct: 0,
    league: "Premier League",
  });
  // Sliders move a local draft; the request goes out once, when the slider is released.
  const [draft, setDraft] = useState({ horizonMonths: DEFAULT_HORIZON_MONTHS, shockPct: 0 });
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
    setDraft({ horizonMonths: DEFAULT_HORIZON_MONTHS, shockPct: 0 });
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
    const t = setTimeout(() => sim.mutate(buildPayload(player, scenario)), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, scenario]);

  const commitDraft = () =>
    setScenario((s) =>
      s.horizonMonths === draft.horizonMonths && s.shockPct === draft.shockPct ? s : { ...s, ...draft },
    );

  const matches = useMemo(() => {
    const list = datasets.data?.players ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 10);
    return list
      .filter((p) => {
        const clubName = resolveClubName(manifest, p.player_id, p.peak_club);
        return (
          p.name.toLowerCase().includes(q) ||
          clubName.toLowerCase().includes(q) ||
          p.peak_club.toLowerCase().includes(q) ||
          p.league_name.toLowerCase().includes(q) ||
          (p.position ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 14);
  }, [datasets.data, search, manifest]);

  const data = sim.data;
  const outlook = data?.outlook_12m ?? null;
  const scenarioActive =
    !!player &&
    (scenario.shockPct !== 0 ||
      scenario.horizonMonths !== DEFAULT_HORIZON_MONTHS ||
      scenario.league !== player.league_name);
  const levelPct = Math.round((data?.interval_level ?? 0.8) * 100);

  const chartOption = useMemo<ChartOption | null>(() => {
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
        lineStyle: { color: theme.chart2, width: 2 },
        itemStyle: { color: theme.chart2 },
        data: history,
      },
      {
        name: "Prakiraan update berikutnya",
        type: "line",
        symbolSize: 8,
        lineStyle: { color: theme.chart1, width: 2, type: "dashed" },
        itemStyle: { color: theme.chart1 },
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
        lineStyle: { color: theme.chart1, width: 2 },
        itemStyle: { color: theme.chart1 },
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
        symbolSize: 8,
        lineStyle: { color: theme.chart3, width: 2, type: "dotted" },
        itemStyle: { color: theme.chart3 },
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
          symbolSize: 8,
          lineStyle: { color: theme.chart3, width: 2, type: "dashed" },
          itemStyle: { color: theme.chart3 },
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
          lineStyle: { color: theme.chart3, width: 2 },
          itemStyle: { color: theme.chart3 },
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
        ...chartTooltipBase(theme),
        trigger: "item",
        formatter: (params: unknown) => {
          const x = params as { seriesName: string; data: [string, number] };
          return `${x.seriesName}<br/>${x.data[0]}: <strong>${fmt.eur(x.data[1])}</strong>`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: theme.muted, fontSize: 11 },
        itemGap: 12,
      },
      grid: {
        left: 56,
        right: 16,
        top: 20,
        bottom: 56,
      },
      xAxis: {
        type: "time",
        axisLabel: { color: theme.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: theme.border } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: theme.muted,
          fontSize: 11,
          formatter: (v: number) => fmt.eurShort(v),
        },
        splitLine: { lineStyle: { color: theme.grid } },
      },
      series,
    };
  }, [data, outlook, levelPct, theme]);

  const trend = data?.predicted_trend ? TREND_META[data.predicted_trend] : null;
  const signal =
    outlook?.signal === "Buy"
      ? { label: "Layak Beli", variant: "mint" as const }
      : outlook?.signal === "DepreciationRisk"
        ? { label: "Risiko Turun", variant: "crimson" as const }
        : { label: "Netral", variant: "neutral" as const };

  return (
    <div className="space-y-6">
      {/* 1. Top Header */}
      <PageHeader
        title="Scouting & What-If Simulator"
        subtitle="Uji skenario perubahan valuasi, jeda update, dan perpindahan liga terhadap proyeksi model."
      />

      {/* 2. Active Player Summary + Player Picker */}
      <Panel padding="sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {player ? (
            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar playerId={player.player_id} name={player.name} size={52} />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-ink leading-tight">{player.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <ClubBadge playerId={player.player_id} club={player.peak_club} size={14} />
                  <LeagueBadge league={player.league_name} size={14} />
                  <span>· {player.position ?? "-"}</span>
                  <span>· {player.age ?? "-"} thn</span>
                  <span>· {player.nationality}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Memuat daftar pemain...</p>
          )}

          <div className="relative shrink-0">
            <Button
              variant="secondary"
              onClick={() => setPickerOpen((o) => !o)}
              className="min-h-[44px] w-full sm:w-auto"
              aria-expanded={pickerOpen}
            >
              <Search className="size-4 text-muted" />
              <span>Ganti Pemain</span>
              <span className="text-muted font-normal">
                ({datasets.data ? fmt.int(datasets.data.total_players) : "..."})
              </span>
            </Button>

            {pickerOpen ? (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setPickerOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] max-w-full rounded-panel border border-border bg-surface p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nama, klub, liga, atau posisi..."
                      className="min-h-[44px] lg:min-h-[36px] w-full rounded-control border border-border bg-raised pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:border-control focus:outline-none"
                    />
                  </div>
                  <div className="mt-2 max-h-72 divide-y divide-rule overflow-y-auto">
                    {matches.map((p) => (
                      <button
                        key={p.player_id}
                        type="button"
                        onClick={() => selectPlayer(p)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-control px-2.5 py-2 text-left transition hover:bg-active"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <PlayerAvatar playerId={p.player_id} name={p.name} size={28} />
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-ink">
                              {p.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {resolveClubName(manifest, p.player_id, p.peak_club)} · {p.position ?? "-"}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold text-positive tabular-nums">
                          {fmt.eurShort(p.current_value_eur)}
                        </span>
                      </button>
                    ))}
                    {matches.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted">Pemain tidak ditemukan.</p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </Panel>

      {/* 3. Error State */}
      {sim.isError ? (
        <ErrorState
          title="Prediksi Gagal"
          description={sim.error.message}
          onRetry={() => {
            if (player) sim.mutate(buildPayload(player, scenario));
          }}
        />
      ) : null}

      {/* 4. Key Numbers Hero Stats Grid */}
      {player && data ? (
        <Panel padding="none">
          <PanelDividerGrid cols={4}>
            <Stat
              label="Nilai Pasar Sekarang"
              value={fmt.eur(player.current_value_eur)}
              tone="neutral"
              description={`Puncak karier ${fmt.eur(player.peak_value_eur)}`}
              comparison={`Valuasi terakhir ${data.player?.history.at(-1)?.date ?? "-"}`}
            />
            <Stat
              label="Prakiraan Update Berikutnya"
              value={fmt.eur(data.predicted_value_eur)}
              tone="positive"
              description={`Interval ${levelPct}%: ${fmt.eurShort(data.value_range_eur[0])} – ${fmt.eurShort(data.value_range_eur[1])}`}
              comparison={`Sekitar ${data.player?.forecast_date ?? "-"}`}
            />
            <Stat
              label="Proyeksi 12 Bulan"
              badge={
                outlook ? (
                  <Badge variant={signal.variant}>{signal.label}</Badge>
                ) : null
              }
              value={outlook ? fmt.eur(outlook.expected_value_eur) : "-"}
              unit={
                outlook
                  ? `${outlook.expected_change_pct > 0 ? "+" : ""}${outlook.expected_change_pct.toFixed(0)}%`
                  : undefined
              }
              tone="warning"
              description={
                outlook
                  ? `Peluang naik ${fmt.pct(outlook.p_up, 0)} · turun ${fmt.pct(outlook.p_down, 0)}`
                  : "Hanya dihitung dari riwayat asli."
              }
              comparison={
                outlook
                  ? `Rentang ${fmt.eurShort(outlook.expected_range_eur[0])} – ${fmt.eurShort(outlook.expected_range_eur[1])}`
                  : "Kembalikan skenario pindah liga & valuasi hipotetis untuk melihatnya."
              }
            />
            <Stat
              label="Posisi terhadap Puncak Karier"
              value={
                player.peak_value_eur > 0
                  ? `${Math.round((player.current_value_eur / player.peak_value_eur) * 100)}%`
                  : "-"
              }
              tone="neutral"
              description="Nilai sekarang dibanding rekor tertinggi"
              comparison="Harga yang sudah jatuh jauh biasanya lanjut turun"
            />
          </PanelDividerGrid>
        </Panel>
      ) : null}

      {/* 5. Main Content: Chart (Left) + Scenario Controls (Right) */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] items-start">
        {/* Left: Chart */}
        <Panel className="space-y-4">
          <SectionHeader
            as="h2"
            title="Riwayat Harga dan Prediksi"
            subtitle="Fitur model dihitung dari riwayat valuasi asli pemain ini, sama persis dengan saat training."
          />
          <div>
            {chartOption ? (
              <EChart option={chartOption} height={380} label="Riwayat harga dan prediksi pemain" />
            ) : (
              <div className="flex h-[380px] items-center justify-center text-[13px] text-muted">
                Menghitung prediksi...
              </div>
            )}
          </div>
        </Panel>

        {/* Right: Scenario Controls */}
        <Panel className="space-y-4">
            <SectionHeader
              as="h2"
              title="Skenario What-If"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!scenarioActive}
                  onClick={() => {
                    if (!player) return;
                    setScenario({ horizonMonths: DEFAULT_HORIZON_MONTHS, shockPct: 0, league: player.league_name });
                    setDraft({ horizonMonths: DEFAULT_HORIZON_MONTHS, shockPct: 0 });
                  }}
                  className="text-xs"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset</span>
                </Button>
              }
            />

            {/* Shock Slider */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted">Valuasi hipotetis 6 bulan lagi</span>
                <span className="font-semibold text-warning tabular-nums">
                  {draft.shockPct === 0 ? "tidak ada" : `${draft.shockPct > 0 ? "+" : ""}${draft.shockPct}%`}
                </span>
              </div>
              <input
                type="range"
                min={-60}
                max={100}
                step={5}
                value={draft.shockPct}
                onChange={(e) => setDraft((d) => ({ ...d, shockPct: Number(e.target.value) }))}
                onPointerUp={commitDraft}
                onKeyUp={commitDraft}
                onBlur={commitDraft}
                className="mt-2 w-full accent-warning cursor-pointer"
              />
              <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
                Misal harga naik atau turun sekian persen, lalu model menebak update sesudahnya.
              </p>
            </div>

            {/* Horizon Slider */}
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted">Jarak ke update berikutnya</span>
                <span className="font-semibold text-ink tabular-nums">{draft.horizonMonths} bulan</span>
              </div>
              <input
                type="range"
                min={2}
                max={18}
                step={1}
                value={draft.horizonMonths}
                onChange={(e) => setDraft((d) => ({ ...d, horizonMonths: Number(e.target.value) }))}
                onPointerUp={commitDraft}
                onKeyUp={commitDraft}
                onBlur={commitDraft}
                className="mt-2 w-full accent-primary cursor-pointer"
              />
            </div>

            {/* League Picker Strip */}
            <div>
              <span className="text-xs font-medium text-muted">Pindah liga</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {LEAGUE_CATALOG.map((cat) => {
                  const isActive = scenario.league === cat.league;
                  return (
                    <button
                      key={cat.league}
                      type="button"
                      onClick={() => setScenario((s) => ({ ...s, league: cat.league }))}
                      className={cn(
                        "min-h-[44px] lg:min-h-[36px] inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs font-medium transition",
                        isActive
                          ? "bg-active border-control text-ink"
                          : "bg-raised border-border text-muted hover:text-ink"
                      )}
                    >
                      <LeagueBadge league={cat.league} size={14} showName={false} />
                      <span>{cat.league}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
                Efek liga kecil: harga terakhir pemain sudah memuat sebagian besar informasinya.
              </p>
            </div>

            {/* Baseline comparison readout */}
            {data?.baseline && data.scenario_delta_eur !== undefined ? (
              <div className="rounded-control border border-border bg-raised p-3 text-xs text-muted">
                <span>Tanpa skenario: {fmt.eur(data.baseline.predicted_value_eur)}. Dengan skenario:{" "}</span>
                <span className="font-semibold text-ink">{fmt.eur(data.predicted_value_eur)}</span>{" "}
                <span>(</span>
                <strong
                  className={
                    data.scenario_delta_eur >= 0
                      ? "font-semibold text-positive"
                      : "font-semibold text-negative"
                  }
                >
                  {data.scenario_delta_eur >= 0 ? "+" : ""}
                  {fmt.eur(data.scenario_delta_eur)}
                </strong>
                <span>).</span>
              </div>
            ) : null}

            {/* Warnings callout */}
            {data?.warnings?.length ? (
              <div className="rounded-control border border-border bg-raised p-3 space-y-1.5">
                {data.warnings.map((w) => (
                  <div key={w} className="flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
                    <span className="leading-snug">{w}</span>
                  </div>
                ))}
              </div>
            ) : null}
      </Panel>
      </div>

      {/* Tren di Update Berikutnya */}
      <Panel className="space-y-4">
            <SectionHeader
              as="h2"
              title="Tren di Update Berikutnya"
              actions={
                trend ? (
                  <Badge
                    variant={
                      data?.predicted_trend === "rising"
                        ? "mint"
                        : data?.predicted_trend === "stable"
                          ? "amber"
                          : data?.predicted_trend === "declining"
                            ? "orange"
                            : "crimson"
                    }
                  >
                    {trend.label}
                  </Badge>
                ) : null
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(data?.trend_probabilities ?? {}).map(([cls, prob]) => {
                const meta = TREND_META[cls];
                return (
                  <Meter
                    key={cls}
                    value={prob * 100}
                    max={100}
                    label={meta?.label ?? cls}
                    sublabel={meta?.hint ? `(${meta.hint})` : undefined}
                    valueText={fmt.pct(prob)}
                    tone={TREND_TONE_MAP[cls] ?? "mint"}
                    height="sm"
                  />
                );
              })}
            </div>
            {data?.scouting_verdict ? (
              <p className="border-t border-rule pt-3 text-[13px] leading-relaxed text-muted">
                {data.scouting_verdict}
              </p>
            ) : null}
      </Panel>

      {/* 6. Footer disclaimer */}
      <p className="text-xs leading-relaxed text-muted">
        Semua angka adalah nilai pasar Transfermarkt, bukan harga transfer. Model tidak punya data
        performa, cedera, atau kontrak. Pindah klub tidak bisa disimulasikan karena riwayat klub di
        dataset tidak layak pakai.
      </p>
    </div>
  );
}
