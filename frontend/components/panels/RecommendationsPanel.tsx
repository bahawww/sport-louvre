"use client";

import { TrajectoryBadge } from "@/components/trajectory-badge";
import type { TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export function RecommendationsPanel({ preds }: { preds: TestPredictionsResponse }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/30 bg-[#121A24] p-5">
        <h3 className="text-base font-bold text-[#10B981]">Keputusan Kelayakan Model</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
          <strong className="text-[#F1F5F9]">Regresi (R² = 0,9108)</strong> layak dipakai sebagai{" "}
          <em>first-pass valuation screening</em> untuk mendeteksi pemain undervalued di pasar
          transfer. Sementara <strong className="text-[#F1F5F9]">Klasifikasi Clean (66,7%)</strong>{" "}
          hanya digunakan sebagai sinyal pendukung karena tingginya tumpang tindih antara kelas{" "}
          <code>growing</code> dan <code>stable</code>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#10B981]">
            Strategi Beli — Hidden Gems (Undervalued)
          </h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Prediksi nilai wajar model jauh lebih tinggi daripada harga pasar aktual.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#243244] text-[#94A3B8]">
                <tr>
                  <th className="py-2 pr-2">Pemain</th>
                  <th className="py-2 px-2">Trajectory</th>
                  <th className="py-2 px-2 text-right">Pasar</th>
                  <th className="py-2 px-2 text-right">Wajar</th>
                  <th className="py-2 pl-2 text-right">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {preds.undervalued.slice(0, 10).map((r) => (
                  <tr key={r.player_id}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold text-[#F1F5F9]">{r.name}</span>
                      <span className="block text-[11px] text-[#94A3B8]">{r.peak_club}</span>
                    </td>
                    <td className="py-2 px-2">
                      <TrajectoryBadge value={r.actual_trajectory} />
                    </td>
                    <td className="py-2 px-2 text-right text-[#94A3B8]">
                      {fmt.eur(r.actual_value_eur)}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-[#F1F5F9]">
                      {fmt.eur(r.pred_value_eur)}
                    </td>
                    <td className="py-2 pl-2 text-right font-bold text-[#10B981]">
                      +{fmt.eur(r.residual_eur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#EF4444]">
            Strategi Jual / Cut-Loss (Overvalued)
          </h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Harga pasar saat ini melampaui taksiran fundamental karier.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#243244] text-[#94A3B8]">
                <tr>
                  <th className="py-2 pr-2">Pemain</th>
                  <th className="py-2 px-2">Trajectory</th>
                  <th className="py-2 px-2 text-right">Pasar</th>
                  <th className="py-2 px-2 text-right">Wajar</th>
                  <th className="py-2 pl-2 text-right">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {preds.overvalued.slice(0, 10).map((r) => (
                  <tr key={r.player_id}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold text-[#F1F5F9]">{r.name}</span>
                      <span className="block text-[11px] text-[#94A3B8]">{r.peak_club}</span>
                    </td>
                    <td className="py-2 px-2">
                      <TrajectoryBadge value={r.actual_trajectory} />
                    </td>
                    <td className="py-2 px-2 text-right text-[#94A3B8]">
                      {fmt.eur(r.actual_value_eur)}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-[#F1F5F9]">
                      {fmt.eur(r.pred_value_eur)}
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
