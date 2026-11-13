"use client";

import { useMemo } from "react";

import { EChart } from "@/components/chart";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export function ErrorAnalysisPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const ea = preds.error_analysis;

  const leagueOption = useMemo(() => {
    const items = ea.league_bias;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
        valueFormatter: (v: number) => fmt.eur(v),
      },
      grid: { left: 120, right: 24, top: 12, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      yAxis: {
        type: "category",
        data: items.map((i) => `${i.league} (n=${i.count})`),
        axisLabel: { color: "#F1F5F9", fontSize: 12 },
        axisLine: { lineStyle: { color: "#243244" } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 20,
          itemStyle: {
            color: (p: { value: number }) => (p.value >= 0 ? "#10B981" : "#EF4444"),
            borderRadius: 4,
          },
          data: items.map((i) => i.mean_residual_eur),
        },
      ],
    };
  }, [ea]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-amber-500/30 bg-[#121A24] p-5">
          <p className="text-xs font-semibold text-amber-400">Jebakan Data Leakage</p>
          <p className="mt-2 text-3xl font-extrabold text-[#F1F5F9]">
            +{(ea.leakage_delta_acc * 100).toFixed(1)} pp
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
            Memasukkan <code>is_at_peak</code>, <code>post_peak_decline_pct</code>, dan{" "}
            <code>value_cagr</code> membuat model seolah 100% akurat, padahal kolom tersebut dihitung
            dari valuasi yang sedang ditebak.
          </p>
        </div>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <p className="text-xs font-semibold text-sky-400">Ambiguitas Growing vs Stable</p>
          <p className="mt-2 text-3xl font-extrabold text-[#F1F5F9]">
            {ea.growing_vs_stable_confusion_count} kasus
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
            Pemain yang masih naik perlahan (<code>growing</code>) dan yang sudah mendatar (
            <code>stable</code>) dipisahkan ambang drawdown 20%, sehingga satu update kecil bisa
            memindahkan kelas.
          </p>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-[#121A24] p-5">
          <p className="text-xs font-semibold text-rose-400">Superstar & English Tax</p>
          <p className="mt-2 text-3xl font-extrabold text-[#F1F5F9]">
            {fmt.int(overview.dataset.total_players)} / {fmt.int(overview.dataset.total_players)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
            <code>last_value_eur</code> identik dengan target dan telah dibuang. Bintang Premier League
            cenderung mengalami under-prediction karena premi pasar & eksposur komersial.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">Bias Residual per Liga</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Rata-rata (Prediksi - Aktual) per liga top Eropa.
          </p>
          <div className="mt-3">
            <EChart option={leagueOption} height={260} label="Bias residual per liga" />
          </div>
        </div>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">Top Superstar Under-Predicted</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#243244] text-[#94A3B8]">
                <tr>
                  <th className="py-2 pr-2">Pemain</th>
                  <th className="py-2 px-2">Trajectory</th>
                  <th className="py-2 px-2 text-right">Aktual</th>
                  <th className="py-2 pl-2 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {ea.top_underpredicted_superstars.slice(0, 7).map((r) => (
                  <tr key={r.player_id}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold text-[#F1F5F9]">{r.name}</span>
                      <span className="block text-[11px] text-[#94A3B8]">{r.league_name}</span>
                    </td>
                    <td className="py-2 px-2">
                      <TrajectoryBadge value={r.actual_trajectory} />
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-[#F1F5F9]">
                      {fmt.eur(r.actual_value_eur)}
                    </td>
                    <td className="py-2 pl-2 text-right font-bold text-[#EF4444]">
                      {fmt.eur(r.residual_eur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
