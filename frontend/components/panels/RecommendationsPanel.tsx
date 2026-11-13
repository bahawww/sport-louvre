"use client";

import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export function RecommendationsPanel({
  preds,
  overview,
}: {
  preds: TestPredictionsResponse;
  overview: OverviewResponse;
}) {
  const screening = preds.screening_all;
  const undervalued = screening?.undervalued ?? preds.undervalued;
  const overvalued = screening?.overvalued ?? preds.overvalued;
  const tasks = overview.regression.tasks;
  const fund = tasks?.fundamental.models.find((m) => m.name === tasks.fundamental.best_model);
  const forecast = tasks?.forecast.models.find((m) => m.name === tasks.forecast.best_model);
  const clean = overview.classification.clean_mode.models.find(
    (m) => m.name === overview.classification.clean_mode.best_model,
  );
  const level = Math.round((overview.methodology?.interval_level ?? 0.8) * 100);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/30 bg-[#121A24] p-5">
        <h3 className="text-base font-bold text-[#10B981]">Keputusan Kelayakan Model</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
          <strong className="text-[#F1F5F9]">
            Model Fundamental (R² {fund?.r2.toFixed(2) ?? "-"})
          </strong>{" "}
          dipakai untuk <em>first-pass screening</em>: ia tidak melihat harga 12 bulan terakhir,
          jadi tidak sekadar meniru harga pasar. Pemain ditandai bila harga pasar keluar dari
          interval konformal {level}% nilai wajarnya.{" "}
          <strong className="text-[#F1F5F9]">
            Model Forecast (R² {forecast?.r2.toFixed(2) ?? "-"})
          </strong>{" "}
          hanya untuk menebak update berikutnya, dan{" "}
          <strong className="text-[#F1F5F9]">
            Klasifikasi Clean ({clean ? fmt.pct(clean.accuracy) : "-"})
          </strong>{" "}
          sebagai sinyal pendukung.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
          Batas: dataset tidak punya data performa (menit, gol), jadi nilai wajar hanya dari
          riwayat harga, usia, posisi, dan liga. Artinya daftar ini berisi pemain yang harganya
          bergerak lebih jauh dalam 12 bulan terakhir daripada yang dijelaskan profil setahun lalu
          dan usianya
          {screening?.gap_vs_hidden_window_return_corr !== undefined
            ? ` (korelasi gap dengan pergerakan harga 12 bulan: ${screening.gap_vs_hidden_window_return_corr.toFixed(2)})`
            : ""}
          . Itu kandidat untuk dicek scout, bukan bukti salah harga.
          {screening
            ? ` Sumber: ${fmt.int(screening.players)} pemain, prediksi dan interval out-of-fold: ${screening.status_counts.Undervalued} undervalued, ${screening.status_counts.Overvalued} overvalued.`
            : ""}
          {screening?.basis_counts
            ? ` Tidak dinilai: ${screening.basis_counts.breakout} pemain breakout (rekor harga baru dalam 12 bulan terakhir) dan ${screening.basis_counts.short_history} pemain dengan riwayat di bawah 12 bulan.`
            : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#10B981]">
            Kandidat Beli — Harga Jatuh di Bawah Nilai Wajar
          </h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Harga pasar di bawah batas bawah interval nilai wajar fundamental.
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
                {undervalued.slice(0, 10).map((r) => (
                  <tr key={r.player_id}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar playerId={r.player_id} name={r.name} size={30} />
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-[#F1F5F9]">{r.name}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                            <ClubBadge playerId={r.player_id} club={r.peak_club} size={12} />
                            <span>·</span>
                            <LeagueBadge league={r.league_name} size={12} showName={false} />
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {r.actual_trajectory ? <TrajectoryBadge value={r.actual_trajectory} /> : "-"}
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
            Kandidat Jual — Harga Bertahan di Atas Nilai Wajar
          </h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Harga pasar di atas batas atas interval nilai wajar, tanpa rekor harga baru.
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
                {overvalued.slice(0, 10).map((r) => (
                  <tr key={r.player_id}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar playerId={r.player_id} name={r.name} size={30} />
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-[#F1F5F9]">{r.name}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                            <ClubBadge playerId={r.player_id} club={r.peak_club} size={12} />
                            <span>·</span>
                            <LeagueBadge league={r.league_name} size={12} showName={false} />
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {r.actual_trajectory ? <TrajectoryBadge value={r.actual_trajectory} /> : "-"}
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
