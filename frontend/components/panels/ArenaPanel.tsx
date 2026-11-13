"use client";

import { useMemo } from "react";

import { EChart } from "@/components/chart";
import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt, trajectoryLabel } from "@/lib/format";

export function ArenaPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const cleanBest = useMemo(() => {
    const ms = overview.classification.clean_mode.models;
    return ms.find((m) => m.name === overview.classification.clean_mode.best_model) ?? ms[0];
  }, [overview]);

  const leakBest = useMemo(() => {
    const ms = overview.classification.leakage_mode.models;
    return ms.find((m) => m.name === overview.classification.leakage_mode.best_model) ?? ms[0];
  }, [overview]);

  const regBest = useMemo(() => {
    const ms = overview.regression.models;
    return ms.find((m) => m.name === overview.regression.best_model) ?? ms[0];
  }, [overview]);

  const clsBarOption = useMemo(() => {
    const cleanModels = overview.classification.clean_mode.models;
    const leakModels = overview.classification.leakage_mode.models;
    const names = cleanModels.map((m) => m.name);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
        valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%`,
      },
      legend: {
        top: 0,
        textStyle: { color: "#94A3B8", fontSize: 12 },
      },
      grid: { left: 48, right: 16, top: 36, bottom: 32 },
      xAxis: {
        type: "category",
        data: names,
        axisLabel: { color: "#94A3B8", fontSize: 12 },
        axisLine: { lineStyle: { color: "#243244" } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      series: [
        {
          name: "Mode Clean (Valid)",
          type: "bar",
          barMaxWidth: 32,
          itemStyle: { color: "#10B981", borderRadius: [4, 4, 0, 0] },
          data: names.map((n) => cleanModels.find((m) => m.name === n)?.accuracy ?? 0),
        },
        {
          name: "Full Features (Leakage)",
          type: "bar",
          barMaxWidth: 32,
          itemStyle: { color: "#F59E0B", borderRadius: [4, 4, 0, 0] },
          data: names.map((n) => leakModels.find((m) => m.name === n)?.accuracy ?? 0),
        },
      ],
    };
  }, [overview]);

  const trajDistOption = useMemo(() => {
    const entries = Object.entries(overview.dataset.trajectories);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
      },
      grid: { left: 110, right: 28, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: "#94A3B8", fontSize: 11 },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: entries.map(([k]) => trajectoryLabel(k)),
        axisLabel: { color: "#F1F5F9", fontSize: 12, fontWeight: 600 },
        axisLine: { lineStyle: { color: "#243244" } },
      },
      series: [
        {
          name: "Pemain",
          type: "bar",
          barMaxWidth: 20,
          itemStyle: { color: "#10B981", borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: "#F1F5F9", fontWeight: 700 },
          data: entries.map(([, v]) => v),
        },
      ],
    };
  }, [overview]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <p className="text-xs font-medium text-[#94A3B8]">Clean Classification Best</p>
          <p className="mt-2 text-3xl font-extrabold text-[#10B981]">{fmt.pct(cleanBest.accuracy)}</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {cleanBest.name} · F1 {fmt.pct(cleanBest.f1_weighted)}
          </p>
        </div>
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <p className="text-xs font-medium text-[#94A3B8]">Leakage Accuracy Inflation</p>
          <p className="mt-2 text-3xl font-extrabold text-[#F59E0B]">
            +{(preds.error_analysis.leakage_delta_acc * 100).toFixed(1)} pp
          </p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {leakBest.name} mencapai {fmt.pct(leakBest.accuracy)} (palsu)
          </p>
        </div>
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <p className="text-xs font-medium text-[#94A3B8]">Market Value Regression (R²)</p>
          <p className="mt-2 text-3xl font-extrabold text-[#F1F5F9]">{regBest.r2.toFixed(3)}</p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {regBest.name} · MAE {fmt.eur(regBest.mae)}
          </p>
        </div>
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <p className="text-xs font-medium text-[#94A3B8]">Dataset & Split 80:20</p>
          <p className="mt-2 text-3xl font-extrabold text-[#F1F5F9]">
            {fmt.int(overview.dataset.total_players)}
          </p>
          <p className="mt-1 text-xs text-[#94A3B8]">
            {overview.dataset.train_size} train / {overview.dataset.test_size} test ·{" "}
            {fmt.int(overview.dataset.history_rows)} riwayat
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">
            Klasifikasi Trajectory: Mode Clean vs Full Features (Leakage)
          </h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Membuktikan bagaimana fitur bocoran (cagr, decline_pct, multiplier) melambungkan akurasi secara semu.
          </p>
          <div className="mt-4">
            <EChart option={clsBarOption} height={280} label="Perbandingan akurasi Clean vs Leakage" />
          </div>
        </div>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">Distribusi Kelas Trajectory (508 Pemain)</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Ketidakseimbangan kelas antara growing (228) dan falling_sharply (26).
          </p>
          <div className="mt-4">
            <EChart option={trajDistOption} height={280} label="Distribusi kelas trajectory" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
        <h3 className="text-base font-bold text-[#F1F5F9]">Benchmark Regresi (current_value_eur)</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#243244] text-xs text-[#94A3B8]">
              <tr>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 px-4 text-right">R² Score</th>
                <th className="py-2 px-4 text-right">MAE (€)</th>
                <th className="py-2 pl-4 text-right">RMSE (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {overview.regression.models.map((m) => (
                <tr key={m.name} className={m.name === overview.regression.best_model ? "bg-[#182230]/60" : ""}>
                  <td className="py-2.5 pr-4 font-semibold text-[#F1F5F9]">
                    {m.name}{" "}
                    {m.name === overview.regression.best_model ? (
                      <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-400">
                        Best
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#10B981]">{m.r2.toFixed(4)}</td>
                  <td className="py-2.5 px-4 text-right text-[#F1F5F9]">{fmt.eur(m.mae)}</td>
                  <td className="py-2.5 pl-4 text-right text-[#94A3B8]">{fmt.eur(m.rmse)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
