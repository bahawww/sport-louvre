"use client";

import { useMemo, useState } from "react";

import { chartTooltipBase, EChart, useChartTheme } from "@/components/chart";
import { LeagueBadge, resolveClubName, useMediaManifest } from "@/components/entity-media";
import {
  Badge,
  DataTable,
  type DataTableColumn,
  PageHeader,
  Pagination,
  Panel,
  PlayerCell,
  SectionHeader,
  Segmented,
  Select,
} from "@/components/ui";
import type { OverviewResponse, TestPredictionRow, TestPredictionsResponse } from "@/lib/api";
import { fmt, toTrendModel, trajectoryLabel, TREND_META } from "@/lib/format";
import { COURSE_CLASSIFIER, COURSE_REGRESSOR } from "@/lib/models";
import { cn } from "@/lib/utils";

function TrendBadge({
  trend,
  fallback,
  wrong = false,
}: {
  trend?: string;
  fallback: string;
  wrong?: boolean;
}) {
  const meta = trend ? TREND_META[trend] : undefined;
  if (!meta) {
    return (
      <Badge className={wrong ? "ring-1 ring-negative" : undefined}>
        {trajectoryLabel(fallback)}
      </Badge>
    );
  }
  return (
    <Badge className={cn(meta.className, wrong && "ring-1 ring-negative")}>
      {meta.label}
    </Badge>
  );
}

interface ValidationRow {
  skema: string;
  accuracyTrend: string;
  baseline: string;
  macroF1: string;
  forecastR2: string;
  fundamentalR2: string;
}

const MODE_OPTIONS = [
  { value: "clean", label: "Clean" },
  { value: "leakage", label: "Leakage" },
] as const;

const VALUE_MODEL_OPTIONS = [
  { value: "linear", label: "Regresi Linear" },
  { value: "forecast", label: "Forecast" },
  { value: "fundamental", label: "Fundamental" },
] as const;

const PAGE_SIZE = 50;

export function DiagnosticsPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const [mode, setMode] = useState<"clean" | "leakage">("clean");
  const [modelIdx, setModelIdx] = useState(() => {
    const list = overview.classification.trend?.models ?? overview.classification.clean_mode.models;
    const preferred = list.findIndex((m) => m.name === COURSE_CLASSIFIER);
    return Math.max(
      0,
      preferred >= 0
        ? preferred
        : list.findIndex((m) => m.name === overview.classification.clean_mode.best_model),
    );
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [valueModel, setValueModel] = useState<"linear" | "forecast" | "fundamental">("linear");
  const tasks = overview.regression.tasks;
  const activeTask = tasks?.[valueModel === "linear" ? "forecast" : valueModel];
  const activeReg = activeTask?.models.find(
    (m) => m.name === (valueModel === "linear" ? COURSE_REGRESSOR : activeTask.best_model),
  );
  const cleanBlock = overview.classification.clean_mode as typeof overview.classification.clean_mode & {
    validation?: { group_kfold: Record<string, Record<string, number>> };
  };
  const cvClf = cleanBlock.validation?.group_kfold[cleanBlock.best_model];
  const oot = overview.out_of_time?.sets.unseen_players_future;
  const ootClf = oot?.classification[cleanBlock.best_model];
  const holdoutClf = cleanBlock.models.find((m) => m.name === cleanBlock.best_model);
  const trendCv = overview.classification.trend?.validation.group_kfold;
  const cvTrend = trendCv?.[cleanBlock.best_model];
  const cvTrendBase = trendCv?.["Persistence (last state)"];

  const trend = overview.classification.trend;
  // Everything on this tab is shown in the 4 trend classes; 5-class results are folded.
  const clsModels = useMemo(
    () =>
      mode === "clean"
        ? (trend?.models ?? overview.classification.clean_mode.models.map(toTrendModel))
        : overview.classification.leakage_mode.models.map(toTrendModel),
    [mode, trend, overview],
  );
  const safeModelIdx = modelIdx < clsModels.length ? modelIdx : 0;
  const activeCls = clsModels[safeModelIdx] ?? clsModels[0];
  const classes: string[] = trend?.classes ?? ["rising", "stable", "declining", "falling_sharply"];
  const classLabel = (c: string) => TREND_META[c]?.label ?? c;
  const baselineCls = clsModels.find((m) => m.name.startsWith("Persistence"));
  const PERSIST = "Persistence (last state)";
  const ootTrend = (name: string) =>
    (oot?.classification[name] as unknown as { trend?: Record<string, number> } | undefined)?.trend;

  const theme = useChartTheme();
  const manifest = useMediaManifest();

  const scatterOption = useMemo(() => {
    const rows = preds.rows;
    const predOf = (r: (typeof rows)[number]) =>
      valueModel === "linear"
        ? (r.linear_value_eur ?? r.forecast_value_eur ?? r.pred_value_eur)
        : valueModel === "forecast"
          ? (r.forecast_value_eur ?? r.pred_value_eur)
          : r.pred_value_eur;
    const maxVal = Math.max(...rows.map((r) => Math.max(r.actual_value_eur, predOf(r))), 100_000_000);
    const minVal = Math.max(
      10_000,
      Math.min(...rows.map((r) => Math.min(r.actual_value_eur, predOf(r)))),
    );
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        ...chartTooltipBase(theme),
        formatter: (p: { data: [number, number, string, string] }) => {
          const [act, prd, name, club] = p.data;
          return `<strong>${name}</strong> (${club})<br/>Aktual: ${fmt.eur(act)}<br/>Prediksi: ${fmt.eur(prd)}<br/>Residual: ${fmt.eur(prd - act)}`;
        },
      },
      grid: { left: 8, right: 16, top: 16, bottom: 20, containLabel: true },
      xAxis: {
        type: "log",
        min: minVal,
        name: "Aktual (€)",
        nameLocation: "middle",
        nameGap: 24,
        nameTextStyle: { color: theme.axisInk, fontSize: 11 },
        axisLabel: { color: theme.axisInk, fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: theme.grid } },
      },
      yAxis: {
        type: "log",
        min: minVal,
        name: "Prediksi (€)",
        nameTextStyle: { color: theme.axisInk, fontSize: 11 },
        axisLabel: { color: theme.axisInk, fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: theme.grid } },
      },
      series: [
        {
          type: "line",
          symbol: "none",
          silent: true,
          lineStyle: { type: "dashed", color: theme.muted, width: 1.5 },
          data: [
            [minVal, minVal],
            [maxVal, maxVal],
          ],
        },
        {
          type: "scatter",
          symbolSize: 8,
          itemStyle: {
            color: (p: { data: [number, number] }) =>
              p.data[1] > p.data[0] * 1.25
                ? theme.chart1
                : p.data[1] < p.data[0] * 0.8
                  ? theme.chart4
                  : theme.chart2,
          },
          data: rows.map((r) => [
            r.actual_value_eur,
            predOf(r),
            r.name,
            resolveClubName(manifest, r.player_id, r.peak_club),
          ]),
        },
      ],
    };
  }, [preds, valueModel, theme, manifest]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preds.rows.filter((r) => {
      if (statusFilter !== "ALL" && r.valuation_status !== statusFilter) return false;
      if (!q) return true;
      const clubName = resolveClubName(manifest, r.player_id, r.peak_club);
      return (
        r.name.toLowerCase().includes(q) ||
        clubName.toLowerCase().includes(q) ||
        r.peak_club.toLowerCase().includes(q) ||
        r.league_name.toLowerCase().includes(q)
      );
    });
  }, [preds, search, statusFilter, manifest]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage],
  );

  const validationRows = useMemo<ValidationRow[]>(() => {
    if (!tasks || !holdoutClf) return [];
    const list: ValidationRow[] = [
      {
        skema: "Holdout 80:20 per pemain",
        accuracyTrend: trend ? fmt.pct(trend.headline.metrics.accuracy) : "-",
        baseline: trend ? fmt.pct(trend.headline.persistence.accuracy) : "-",
        macroF1: trend ? fmt.pct(trend.headline.metrics.macro_f1) : "-",
        forecastR2:
          tasks.forecast.models.find((m) => m.name === tasks.forecast.best_model)?.r2_log?.toFixed(3) ??
          "-",
        fundamentalR2:
          tasks.fundamental.models.find((m) => m.name === tasks.fundamental.best_model)?.r2_log?.toFixed(3) ??
          "-",
      },
    ];

    if (cvClf) {
      list.push({
        skema: "GroupKFold 5-fold (rata-rata)",
        accuracyTrend: cvTrend
          ? `${fmt.pct(cvTrend.accuracy_mean)} ± ${(cvTrend.accuracy_std * 100).toFixed(1)}`
          : "-",
        baseline: cvTrendBase ? fmt.pct(cvTrendBase.accuracy_mean) : "-",
        macroF1: cvTrend ? fmt.pct(cvTrend.macro_f1_mean) : "-",
        forecastR2:
          tasks.forecast.validation.group_kfold[tasks.forecast.best_model]?.r2_log_mean.toFixed(3) ?? "-",
        fundamentalR2:
          tasks.fundamental.validation.group_kfold[tasks.fundamental.best_model]?.r2_log_mean.toFixed(3) ?? "-",
      });
    }

    if (oot && ootClf) {
      const bestOotTrend = ootTrend(cleanBlock.best_model);
      const persistOotTrend = ootTrend(PERSIST);
      list.push({
        skema: `Out-of-time (${oot.rows} update)`,
        accuracyTrend: bestOotTrend ? fmt.pct(bestOotTrend.accuracy) : "-",
        baseline: persistOotTrend ? fmt.pct(persistOotTrend.accuracy) : "-",
        macroF1: bestOotTrend ? fmt.pct(bestOotTrend.macro_f1) : "-",
        forecastR2: oot.regression.forecast[tasks.forecast.best_model]?.r2_log.toFixed(3) ?? "-",
        fundamentalR2: oot.regression.fundamental[tasks.fundamental.best_model]?.r2_log.toFixed(3) ?? "-",
      });
    }

    return list;
  }, [tasks, holdoutClf, trend, cvClf, cvTrend, cvTrendBase, oot, ootClf, cleanBlock.best_model]);

  const validationColumns = useMemo<DataTableColumn<ValidationRow>[]>(
    () => [
      {
        key: "skema",
        header: "Skema",
        align: "left",
        cell: (r) => <span className="font-semibold text-ink">{r.skema}</span>,
      },
      {
        key: "accuracyTrend",
        header: "Akurasi Tren (4 kelas)",
        align: "right",
        cell: (r) => <span className="font-bold text-positive">{r.accuracyTrend}</span>,
      },
      {
        key: "baseline",
        header: "Baseline tanpa model",
        align: "right",
        cell: (r) => <span className="text-muted">{r.baseline}</span>,
      },
      {
        key: "macroF1",
        header: "Macro-F1",
        align: "right",
        cell: (r) => <span className="text-ink">{r.macroF1}</span>,
      },
      {
        key: "forecastR2",
        header: "Forecast R² log",
        align: "right",
        cell: (r) => <span className="text-ink">{r.forecastR2}</span>,
      },
      {
        key: "fundamentalR2",
        header: "Fundamental R² log",
        align: "right",
        cell: (r) => <span className="text-ink">{r.fundamentalR2}</span>,
      },
    ],
    [],
  );

  const testTableColumns = useMemo<DataTableColumn<TestPredictionRow>[]>(
    () => [
      {
        key: "player",
        header: "Pemain",
        align: "left",
        cell: (r) => (
          <PlayerCell
            playerId={r.player_id}
            name={r.name}
            club={r.peak_club}
            meta={`${r.age} thn`}
            avatarSize={28}
            showClubLogo={true}
          />
        ),
      },
      {
        key: "league",
        header: "Liga",
        align: "left",
        cell: (r) => <LeagueBadge league={r.league_name} size={14} className="text-muted" />,
      },
      {
        key: "actual_trend",
        header: "Tren Aktual",
        align: "left",
        cell: (r) => (
          <TrendBadge trend={r.actual_trend} fallback={r.actual_trajectory} />
        ),
      },
      {
        key: "pred_trend",
        header: "Tren Prediksi",
        align: "left",
        cell: (r) => (
          <TrendBadge
            trend={r.pred_trend}
            fallback={r.pred_trajectory_clean}
            wrong={Boolean(r.pred_trend && r.pred_trend !== r.actual_trend)}
          />
        ),
      },
      {
        key: "actual_value",
        header: "Nilai Aktual",
        align: "right",
        cell: (r) => <span className="font-semibold text-ink">{fmt.eur(r.actual_value_eur)}</span>,
      },
      {
        key: "forecast",
        header: "Forecast",
        align: "right",
        cell: (r) => (
          <span className="text-muted">
            {r.forecast_value_eur !== undefined ? fmt.eur(r.forecast_value_eur) : "-"}
          </span>
        ),
      },
      {
        key: "fair_value",
        header: "Nilai Wajar",
        align: "right",
        cell: (r) => <span className="text-muted">{fmt.eur(r.pred_value_eur)}</span>,
      },
      {
        key: "residual",
        header: "Gap Wajar",
        align: "right",
        cell: (r) => {
          const isPositive = r.residual_eur > 0;
          const isNegative = r.residual_eur < 0;
          return (
            <span
              className={cn(
                "font-semibold tabular-nums",
                isPositive ? "text-positive" : isNegative ? "text-negative" : "text-muted",
              )}
            >
              {isPositive ? "+" : ""}
              {fmt.eur(r.residual_eur)}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnostik Prediksi & Kalibrasi"
        subtitle="Matriks klasifikasi tren, sebaran nilai aktual terhadap prediksi, validasi silang, dan rincian 484 pemain uji."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Panel className="flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Interactive Confusion Matrix"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented
                    options={MODE_OPTIONS}
                    value={mode}
                    onChange={setMode}
                    ariaLabel="Pilih mode evaluasi"
                  />
                  <Select
                    value={String(safeModelIdx)}
                    onChange={(val) => setModelIdx(Number(val))}
                    ariaLabel="Pilih model klasifikasi"
                    size="sm"
                    align="right"
                    options={clsModels.map((m, i) => ({
                      value: String(i),
                      label: m.name,
                    }))}
                  />
                </div>
              }
            />

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="py-2 pr-3 text-left font-medium text-xs text-muted whitespace-nowrap">
                      Aktual \ Pred
                    </th>
                    {classes.map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="py-2 px-2.5 text-right font-medium text-xs text-muted whitespace-nowrap"
                      >
                        {classLabel(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {activeCls.confusion_matrix.map((row, ri) => (
                    <tr key={classes[ri]} className="transition-colors hover:bg-active/30">
                      <th
                        scope="row"
                        className="py-2 pr-3 text-left font-medium text-xs text-ink whitespace-nowrap"
                      >
                        {classLabel(classes[ri])}
                      </th>
                      {row.map((val, ci) => {
                        const diag = ri === ci;
                        return (
                          <td
                            key={ci}
                            className={cn(
                              "py-2 px-2.5 text-right tabular-nums text-xs font-semibold rounded-chip",
                              diag
                                ? "bg-[var(--pill-mint-bg)] text-positive"
                                : val > 0
                                  ? "bg-[var(--pill-amber-bg)] text-warning"
                                  : "text-muted/40 font-normal",
                            )}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-rule flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Akurasi:</span>
            <strong className="font-semibold text-positive">{fmt.pct(activeCls.accuracy)}</strong>
            {baselineCls && mode === "clean" ? (
              <>
                <span className="text-faint">·</span>
                <span>
                  baseline tanpa model:{" "}
                  <span className="text-ink font-medium">{fmt.pct(baselineCls.accuracy)}</span>
                </span>
              </>
            ) : null}
            {activeCls.macro_f1 !== undefined ? (
              <>
                <span className="text-faint">·</span>
                <span>
                  Macro-F1:{" "}
                  <span className="text-ink font-medium">{fmt.pct(activeCls.macro_f1)}</span>
                </span>
              </>
            ) : null}
            {activeCls.ece !== undefined ? (
              <>
                <span className="text-faint">·</span>
                <span>
                  ECE:{" "}
                  <span className="text-ink font-medium">{activeCls.ece.toFixed(3)}</span>
                </span>
              </>
            ) : null}
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Aktual vs Prediksi (€)"
              actions={
                <Segmented
                  options={VALUE_MODEL_OPTIONS}
                  value={valueModel}
                  onChange={setValueModel}
                  ariaLabel="Pilih model valuasi"
                />
              }
            />
            <p className="mt-2 text-[13px] text-muted leading-relaxed">
              {valueModel === "linear"
                ? "Regresi linear menebak update berikutnya dari harga sebelumnya. Dijadikan tampilan awal karena ketentuan tugas, bukan karena paling akurat."
                : valueModel === "forecast"
                  ? "Gradient boosting menebak update berikutnya dari harga sebelumnya."
                  : "Nilai wajar tanpa harga 12 bulan terakhir."}
              {activeReg
                ? ` R² ${activeReg.r2.toFixed(3)} · R² log ${activeReg.r2_log?.toFixed(3) ?? "-"} · MAE ${fmt.eur(activeReg.mae)}.`
                : ""}{" "}
              {valueModel !== "fundamental" && tasks?.forecast.headline
                ? `Baseline naif (harga terakhir): R² log ${tasks.forecast.headline.naive_last_value.r2_log.toFixed(3)}. `
                : ""}
              Skala log. Hijau = prediksi lebih dari 25% di atas aktual, merah = lebih dari 20% di
              bawah.
            </p>
          </div>
          <div className="mt-3">
            <EChart option={scatterOption} height={220} label="Scatter plot aktual vs prediksi" />
          </div>
        </Panel>
      </div>

      {tasks && holdoutClf ? (
        <Panel>
          <SectionHeader
            title="Validasi Berlapis"
            subtitle={`Model dipilih lewat GroupKFold per pemain, bukan di data uji. Out-of-time: dilatih pada target sebelum ${overview.out_of_time?.cutoff}, diuji pada pemain uji sesudahnya.`}
          />
          <DataTable
            columns={validationColumns}
            rows={validationRows}
            rowKey={(r) => r.skema}
            framed={true}
            ariaLabel="Tabel validasi berlapis"
            className="mt-4"
          />
          <p className="mt-3 text-xs text-muted leading-relaxed">
            Interval konformal {Math.round(tasks.forecast.intervals.holdout.level * 100)}%: cakupan
            teruji forecast {fmt.pct(tasks.forecast.intervals.holdout.coverage)}, fundamental{" "}
            {fmt.pct(tasks.fundamental.intervals.holdout.coverage)}, profil{" "}
            {fmt.pct(tasks.profile.intervals.holdout.coverage)}.
          </p>
        </Panel>
      ) : null}

      <Panel className="space-y-4">
        <SectionHeader
          title={`Tabel ${fmt.int(preds.rows.length)} Data Uji (${filtered.length} tampil)`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Cari nama / klub / liga..."
                aria-label="Cari nama, klub, atau liga"
                className="min-h-[44px] lg:min-h-[36px] rounded-control border border-control bg-raised px-3 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Select
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(0);
                }}
                ariaLabel="Filter status valuasi"
                size="sm"
                align="right"
                options={[
                  { value: "ALL", label: "Semua Status" },
                  { value: "Undervalued", label: "Undervalued" },
                  { value: "Fair", label: "Fair" },
                  { value: "Overvalued", label: "Overvalued" },
                ]}
              />
            </div>
          }
        />

        <DataTable
          columns={testTableColumns}
          rows={pageRows}
          rowKey={(r) => r.player_id}
          framed={true}
          emptyMessage="Tidak ada data pemain yang cocok dengan filter."
          ariaLabel={`Tabel ${preds.rows.length} data pemain uji`}
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
