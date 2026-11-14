"use client";

import { useMemo, useState } from "react";

import { EChart } from "@/components/chart";
import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt, trajectoryLabel, TREND_META } from "@/lib/format";

function TrendChip({
  trend,
  fallback,
  wrong = false,
}: {
  trend?: string;
  fallback: string;
  wrong?: boolean;
}) {
  const meta = trend ? TREND_META[trend] : undefined;
  if (!meta) return <TrajectoryBadge value={fallback} />;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.className} ${
        wrong ? "ring-1 ring-[#EF4444]" : ""
      }`}
    >
      {meta.label}
    </span>
  );
}

export function DiagnosticsPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const [mode, setMode] = useState<"clean" | "leakage">("clean");
  const [modelIdx, setModelIdx] = useState(() =>
    Math.max(
      0,
      overview.classification.clean_mode.models.findIndex(
        (m) => m.name === overview.classification.clean_mode.best_model,
      ),
    ),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [valueModel, setValueModel] = useState<"forecast" | "fundamental">("forecast");
  const tasks = overview.regression.tasks;
  const activeTask = tasks?.[valueModel];
  const activeReg = activeTask?.models.find((m) => m.name === activeTask.best_model);
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
  const [view, setView] = useState<"trend" | "detail">(trend ? "trend" : "detail");
  const showTrend = mode === "clean" && view === "trend" && !!trend;
  const clsModels = showTrend
    ? trend.models
    : mode === "clean"
      ? overview.classification.clean_mode.models
      : overview.classification.leakage_mode.models;
  const activeCls = clsModels[modelIdx] ?? clsModels[0];
  const classes: string[] = showTrend ? trend.classes : overview.classification.classes;
  const classLabel = (c: string) => (showTrend ? (TREND_META[c]?.label ?? c) : trajectoryLabel(c));
  const baselineCls = clsModels.find((m) => m.name.startsWith("Persistence"));
  const PERSIST = "Persistence (last state)";
  const ootTrend = (name: string) =>
    (oot?.classification[name] as unknown as { trend?: Record<string, number> } | undefined)?.trend;

  const scatterOption = useMemo(() => {
    const rows = preds.rows;
    const predOf = (r: (typeof rows)[number]) =>
      valueModel === "forecast" ? (r.forecast_value_eur ?? r.pred_value_eur) : r.pred_value_eur;
    const maxVal = Math.max(...rows.map((r) => Math.max(r.actual_value_eur, predOf(r))), 100_000_000);
    const minVal = Math.max(
      10_000,
      Math.min(...rows.map((r) => Math.min(r.actual_value_eur, predOf(r)))),
    );
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
        formatter: (p: { data: [number, number, string, string] }) => {
          const [act, prd, name, club] = p.data;
          return `<strong>${name}</strong> (${club})<br/>Aktual: ${fmt.eur(act)}<br/>Prediksi: ${fmt.eur(prd)}<br/>Residual: ${fmt.eur(prd - act)}`;
        },
      },
      grid: { left: 64, right: 20, top: 20, bottom: 44 },
      xAxis: {
        type: "log",
        min: minVal,
        name: "Aktual (€)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#94A3B8", fontSize: 11 },
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      yAxis: {
        type: "log",
        min: minVal,
        name: "Prediksi (€)",
        nameTextStyle: { color: "#94A3B8", fontSize: 11 },
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      series: [
        {
          type: "line",
          symbol: "none",
          silent: true,
          lineStyle: { type: "dashed", color: "#475569", width: 1.5 },
          data: [
            [minVal, minVal],
            [maxVal, maxVal],
          ],
        },
        {
          type: "scatter",
          symbolSize: 9,
          itemStyle: {
            color: (p: { data: [number, number] }) =>
              p.data[1] > p.data[0] * 1.25
                ? "#10B981"
                : p.data[1] < p.data[0] * 0.8
                  ? "#EF4444"
                  : "#38BDF8",
          },
          data: rows.map((r) => [r.actual_value_eur, predOf(r), r.name, r.peak_club]),
        },
      ],
    };
  }, [preds, valueModel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preds.rows.filter((r) => {
      if (statusFilter !== "ALL" && r.valuation_status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.peak_club.toLowerCase().includes(q) ||
        r.league_name.toLowerCase().includes(q)
      );
    });
  }, [preds, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#F1F5F9]">Interactive Confusion Matrix</h3>
              <p className="text-xs text-[#94A3B8]">
                Akurasi: <strong className="text-[#10B981]">{fmt.pct(activeCls.accuracy)}</strong>
                {baselineCls && mode === "clean"
                  ? ` · baseline tanpa model: ${fmt.pct(baselineCls.accuracy)}`
                  : ""}
                {activeCls.macro_f1 !== undefined
                  ? ` · Macro-F1: ${fmt.pct(activeCls.macro_f1)}`
                  : ""}
                {activeCls.ece !== undefined ? ` · ECE: ${activeCls.ece.toFixed(3)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {trend && mode === "clean" ? (
                <div className="inline-flex rounded-lg border border-[#243244] bg-[#0B1117] p-0.5 text-xs">
                  {(["trend", "detail"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`rounded-md px-2.5 py-1 font-semibold ${
                        view === v ? "bg-[#38BDF8] text-[#0B1117]" : "text-[#94A3B8]"
                      }`}
                    >
                      {v === "trend" ? "4 Kelas" : "5 Kelas"}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="inline-flex rounded-lg border border-[#243244] bg-[#0B1117] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("clean")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    mode === "clean" ? "bg-[#10B981] text-[#0B1117]" : "text-[#94A3B8]"
                  }`}
                >
                  Clean
                </button>
                <button
                  type="button"
                  onClick={() => setMode("leakage")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    mode === "leakage" ? "bg-[#F59E0B] text-[#0B1117]" : "text-[#94A3B8]"
                  }`}
                >
                  Leakage
                </button>
              </div>
              <select
                value={modelIdx}
                onChange={(e) => setModelIdx(Number(e.target.value))}
                className="rounded-lg border border-[#243244] bg-[#0B1117] px-2.5 py-1 text-xs text-[#F1F5F9]"
              >
                {clsModels.map((m, i) => (
                  <option key={m.name} value={i}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-center text-xs">
              <thead>
                <tr className="text-[#94A3B8]">
                  <th className="p-2 text-left">Aktual \ Pred</th>
                  {classes.map((c) => (
                    <th key={c} className="p-2 font-semibold">
                      {classLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCls.confusion_matrix.map((row, ri) => (
                  <tr key={classes[ri]} className="border-t border-[#1E293B]">
                    <th className="p-2 text-left font-semibold text-[#F1F5F9]">
                      {classLabel(classes[ri])}
                    </th>
                    {row.map((val, ci) => {
                      const diag = ri === ci;
                      return (
                        <td
                          key={ci}
                          className={`p-2 font-bold ${
                            diag
                              ? "bg-emerald-500/20 text-emerald-300"
                              : val > 0
                                ? "bg-amber-500/10 text-amber-300"
                                : "text-[#475569]"
                          }`}
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

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#F1F5F9]">Aktual vs Prediksi (€)</h3>
            <div className="inline-flex rounded-lg border border-[#243244] bg-[#0B1117] p-0.5 text-xs">
              {(["forecast", "fundamental"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValueModel(v)}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    valueModel === v ? "bg-[#10B981] text-[#0B1117]" : "text-[#94A3B8]"
                  }`}
                >
                  {v === "forecast" ? "Forecast" : "Fundamental"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {valueModel === "forecast"
              ? "Menebak update berikutnya dari harga sebelumnya."
              : "Nilai wajar tanpa harga 12 bulan terakhir."}
            {activeReg
              ? ` R² ${activeReg.r2.toFixed(3)} · R² log ${activeReg.r2_log?.toFixed(3) ?? "-"} · MAE ${fmt.eur(activeReg.mae)}.`
              : ""}{" "}
            {valueModel === "forecast" && tasks?.forecast.headline
              ? `Baseline naif (harga terakhir): R² log ${tasks.forecast.headline.naive_last_value.r2_log.toFixed(3)}. `
              : ""}
            Skala log. Hijau = prediksi lebih dari 25% di atas aktual, merah = lebih dari 20% di
            bawah.
          </p>
          <div className="mt-3">
            <EChart option={scatterOption} height={300} label="Scatter plot aktual vs prediksi" />
          </div>
        </div>
      </div>

      {tasks && holdoutClf ? (
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">Validasi Berlapis</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Model dipilih lewat GroupKFold per pemain, bukan di data uji. Out-of-time: dilatih pada
            target sebelum {overview.out_of_time?.cutoff}, diuji pada pemain uji sesudahnya.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#243244] text-[#94A3B8]">
                <tr>
                  <th className="py-2 pr-3">Skema</th>
                  <th className="py-2 px-3 text-right">Akurasi Tren (4 kelas)</th>
                  <th className="py-2 px-3 text-right">Baseline tanpa model</th>
                  <th className="py-2 px-3 text-right">Macro-F1</th>
                  <th className="py-2 px-3 text-right">Rincian 5 kelas</th>
                  <th className="py-2 px-3 text-right">Forecast R² log</th>
                  <th className="py-2 pl-3 text-right">Fundamental R² log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-[#F1F5F9]">
                <tr>
                  <td className="py-2 pr-3 font-semibold">Holdout 80:20 per pemain</td>
                  <td className="py-2 px-3 text-right font-bold text-[#10B981]">
                    {trend ? fmt.pct(trend.headline.metrics.accuracy) : "-"}
                  </td>
                  <td className="py-2 px-3 text-right text-[#94A3B8]">
                    {trend ? fmt.pct(trend.headline.persistence.accuracy) : "-"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {trend ? fmt.pct(trend.headline.metrics.macro_f1) : "-"}
                  </td>
                  <td className="py-2 px-3 text-right text-[#94A3B8]">
                    {fmt.pct(holdoutClf.accuracy)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {tasks.forecast.models.find((m) => m.name === tasks.forecast.best_model)?.r2_log?.toFixed(3)}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {tasks.fundamental.models.find((m) => m.name === tasks.fundamental.best_model)?.r2_log?.toFixed(3)}
                  </td>
                </tr>
                {cvClf ? (
                  <tr>
                    <td className="py-2 pr-3 font-semibold">GroupKFold 5-fold (rata-rata)</td>
                    <td className="py-2 px-3 text-right font-bold text-[#10B981]">
                      {cvTrend
                        ? `${fmt.pct(cvTrend.accuracy_mean)} ± ${(cvTrend.accuracy_std * 100).toFixed(1)}`
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-[#94A3B8]">
                      {cvTrendBase ? fmt.pct(cvTrendBase.accuracy_mean) : "-"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {cvTrend ? fmt.pct(cvTrend.macro_f1_mean) : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-[#94A3B8]">
                      {fmt.pct(cvClf.accuracy_mean)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {tasks.forecast.validation.group_kfold[tasks.forecast.best_model]?.r2_log_mean.toFixed(3)}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {tasks.fundamental.validation.group_kfold[tasks.fundamental.best_model]?.r2_log_mean.toFixed(3)}
                    </td>
                  </tr>
                ) : null}
                {oot && ootClf ? (
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Out-of-time ({oot.rows} update)</td>
                    <td className="py-2 px-3 text-right font-bold text-[#10B981]">
                      {ootTrend(cleanBlock.best_model)
                        ? fmt.pct(ootTrend(cleanBlock.best_model)!.accuracy)
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-[#94A3B8]">
                      {ootTrend(PERSIST) ? fmt.pct(ootTrend(PERSIST)!.accuracy) : "-"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {ootTrend(cleanBlock.best_model)
                        ? fmt.pct(ootTrend(cleanBlock.best_model)!.macro_f1)
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-[#94A3B8]">
                      {fmt.pct(ootClf.accuracy)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {oot.regression.forecast[tasks.forecast.best_model]?.r2_log.toFixed(3)}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {oot.regression.fundamental[tasks.fundamental.best_model]?.r2_log.toFixed(3)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#94A3B8]">
            Interval konformal {Math.round(tasks.forecast.intervals.holdout.level * 100)}%: cakupan
            teruji forecast {fmt.pct(tasks.forecast.intervals.holdout.coverage)}, fundamental{" "}
            {fmt.pct(tasks.fundamental.intervals.holdout.coverage)}, profil{" "}
            {fmt.pct(tasks.profile.intervals.holdout.coverage)}.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-[#F1F5F9]">
            Tabel {fmt.int(preds.rows.length)} Data Uji ({filtered.length} tampil)
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / klub / liga..."
              className="rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-1.5 text-xs text-[#F1F5F9] placeholder-[#64748B]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-1.5 text-xs text-[#F1F5F9]"
            >
              <option value="ALL">Semua Status</option>
              <option value="Undervalued">Undervalued</option>
              <option value="Fair">Fair</option>
              <option value="Overvalued">Overvalued</option>
            </select>
          </div>
        </div>

        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-20 border-b border-[#243244] bg-[#121A24] text-[#94A3B8]">
              <tr>
                <th className="py-2 pr-3">Pemain</th>
                <th className="py-2 px-3">Liga</th>
                <th className="py-2 px-3">Tren Aktual</th>
                <th className="py-2 px-3">Tren Prediksi</th>
                <th className="py-2 px-3 text-right">Nilai Aktual</th>
                <th className="py-2 px-3 text-right">Forecast</th>
                <th className="py-2 px-3 text-right">Nilai Wajar</th>
                <th className="py-2 pl-3 text-right">Gap Wajar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {filtered.map((r) => (
                <tr key={r.player_id} className="hover:bg-[#182230]/60">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar playerId={r.player_id} name={r.name} size={30} />
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-[#F1F5F9]">{r.name}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#94A3B8]">
                          <ClubBadge playerId={r.player_id} club={r.peak_club} size={12} />
                          <span>· {r.age} thn</span>
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-[#94A3B8]">
                    <LeagueBadge league={r.league_name} size={14} />
                  </td>
                  <td className="py-2 px-3">
                    <TrendChip trend={r.actual_trend} fallback={r.actual_trajectory} />
                  </td>
                  <td className="py-2 px-3">
                    <TrendChip
                      trend={r.pred_trend}
                      fallback={r.pred_trajectory_clean}
                      wrong={!!r.pred_trend && r.pred_trend !== r.actual_trend}
                    />
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-[#F1F5F9]">
                    {fmt.eur(r.actual_value_eur)}
                  </td>
                  <td className="py-2 px-3 text-right text-[#94A3B8]">
                    {r.forecast_value_eur !== undefined ? fmt.eur(r.forecast_value_eur) : "-"}
                  </td>
                  <td className="py-2 px-3 text-right text-[#94A3B8]">{fmt.eur(r.pred_value_eur)}</td>
                  <td
                    className={`py-2 pl-3 text-right font-bold ${
                      r.residual_eur > 0
                        ? "text-[#10B981]"
                        : r.residual_eur < 0
                          ? "text-[#EF4444]"
                          : "text-[#94A3B8]"
                    }`}
                  >
                    {r.residual_eur > 0 ? "+" : ""}
                    {fmt.eur(r.residual_eur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
