"use client";

import { useMemo, useState } from "react";

import { EChart } from "@/components/chart";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt, trajectoryLabel } from "@/lib/format";

export function DiagnosticsPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const [mode, setMode] = useState<"clean" | "leakage">("clean");
  const [modelIdx, setModelIdx] = useState(2);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const clsModels =
    mode === "clean"
      ? overview.classification.clean_mode.models
      : overview.classification.leakage_mode.models;
  const activeCls = clsModels[modelIdx] ?? clsModels[0];

  const scatterOption = useMemo(() => {
    const rows = preds.rows;
    const maxVal = Math.max(...rows.map((r) => Math.max(r.actual_value_eur, r.pred_value_eur)), 100_000_000);
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
        type: "value",
        name: "Aktual (€)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#94A3B8", fontSize: 11 },
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      yAxis: {
        type: "value",
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
            [0, 0],
            [maxVal, maxVal],
          ],
        },
        {
          type: "scatter",
          symbolSize: 9,
          itemStyle: {
            color: (p: { data: [number, number] }) =>
              p.data[1] - p.data[0] > 3_000_000
                ? "#10B981"
                : p.data[1] - p.data[0] < -3_000_000
                  ? "#EF4444"
                  : "#38BDF8",
          },
          data: rows.map((r) => [r.actual_value_eur, r.pred_value_eur, r.name, r.peak_club]),
        },
      ],
    };
  }, [preds]);

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
                Acc: {fmt.pct(activeCls.accuracy)} · F1: {fmt.pct(activeCls.f1_weighted)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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
                  {overview.classification.classes.map((c) => (
                    <th key={c} className="p-2 font-semibold">
                      {trajectoryLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeCls.confusion_matrix.map((row, ri) => (
                  <tr key={overview.classification.classes[ri]} className="border-t border-[#1E293B]">
                    <th className="p-2 text-left font-semibold text-[#F1F5F9]">
                      {trajectoryLabel(overview.classification.classes[ri])}
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
          <h3 className="text-base font-bold text-[#F1F5F9]">Scatter Plot: Aktual vs Prediksi (€)</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Hijau = Undervalued (&gt;+€3M), Merah = Overvalued (&lt;-€3M).
          </p>
          <div className="mt-3">
            <EChart option={scatterOption} height={300} label="Scatter plot aktual vs prediksi" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-[#F1F5F9]">
            Tabel 102 Data Uji ({filtered.length} tampil)
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
            <thead className="sticky top-0 border-b border-[#243244] bg-[#121A24] text-[#94A3B8]">
              <tr>
                <th className="py-2 pr-3">Pemain</th>
                <th className="py-2 px-3">Liga</th>
                <th className="py-2 px-3">Aktual</th>
                <th className="py-2 px-3">Pred Clean</th>
                <th className="py-2 px-3 text-right">Nilai Aktual</th>
                <th className="py-2 px-3 text-right">Prediksi</th>
                <th className="py-2 pl-3 text-right">Residual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {filtered.map((r) => (
                <tr key={r.player_id} className="hover:bg-[#182230]/60">
                  <td className="py-2 pr-3">
                    <span className="font-semibold text-[#F1F5F9]">{r.name}</span>
                    <span className="block text-[11px] text-[#94A3B8]">
                      {r.peak_club} · {r.age} thn
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#94A3B8]">{r.league_name}</td>
                  <td className="py-2 px-3">
                    <TrajectoryBadge value={r.actual_trajectory} />
                  </td>
                  <td className="py-2 px-3">
                    <TrajectoryBadge value={r.pred_trajectory_clean} />
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-[#F1F5F9]">
                    {fmt.eur(r.actual_value_eur)}
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
