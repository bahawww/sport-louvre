"use client";

import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import type { OutlookRow, TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

function OutlookTable({ rows, tone }: { rows: OutlookRow[]; tone: "buy" | "risk" }) {
  const color = tone === "buy" ? "text-[#10B981]" : "text-[#EF4444]";
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-[#243244] text-[#94A3B8]">
          <tr>
            <th className="py-2 pr-2">Pemain</th>
            <th className="py-2 px-2">Tren</th>
            <th className="py-2 px-2 text-right">Nilai Kini</th>
            <th className="py-2 px-2 text-right">Proyeksi 12 Bln</th>
            <th className="py-2 px-2 text-right">Perubahan</th>
            <th className="py-2 pl-2 text-right">{tone === "buy" ? "P(naik)" : "P(turun)"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E293B]">
          {rows.map((r) => (
            <tr key={r.player_id}>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar playerId={r.player_id} name={r.name} size={30} />
                  <div className="min-w-0">
                    <span className="block truncate font-semibold text-[#F1F5F9]">{r.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                      <ClubBadge playerId={r.player_id} club={r.peak_club} size={12} />
                      <span>· {r.age} thn</span>
                      <LeagueBadge league={r.league_name} size={12} showName={false} />
                    </span>
                  </div>
                </div>
              </td>
              <td className="py-2 px-2">
                <TrajectoryBadge value={r.actual_trajectory} />
              </td>
              <td className="py-2 px-2 text-right text-[#94A3B8]">
                {fmt.eur(r.current_value_eur)}
              </td>
              <td className="py-2 px-2 text-right">
                <span className="block font-semibold text-[#F1F5F9]">
                  {fmt.eur(r.expected_value_eur)}
                </span>
                <span className="block text-[10px] text-[#64748B]">
                  {fmt.eurShort(r.expected_range_eur[0])} – {fmt.eurShort(r.expected_range_eur[1])}
                </span>
              </td>
              <td className={`py-2 px-2 text-right font-bold ${color}`}>
                {r.expected_change_pct > 0 ? "+" : ""}
                {r.expected_change_pct.toFixed(0)}%
              </td>
              <td className={`py-2 pl-2 text-right font-bold ${color}`}>
                {fmt.pct(tone === "buy" ? r.p_up : r.p_down, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecommendationsPanel({ preds }: { preds: TestPredictionsResponse }) {
  const outlook = preds.outlook;
  if (!outlook) {
    return (
      <p className="rounded-xl border border-[#243244] bg-[#121A24] p-5 text-sm text-[#94A3B8]">
        Data proyeksi 12 bulan belum tersedia.
      </p>
    );
  }
  const v = outlook.validation;
  const pct = (x: number | null) => (x === null ? "-" : fmt.pct(x, 0));
  const threshold = Math.round(outlook.threshold * 100);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/30 bg-[#121A24] p-5">
        <h3 className="text-base font-bold text-[#10B981]">Dasar Rekomendasi</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
          Rekomendasi memakai{" "}
          <strong className="text-[#F1F5F9]">proyeksi nilai pasar 12 bulan ke depan</strong>, bukan
          selisih dengan harga lama. Pemain masuk daftar beli hanya bila peluang nilainya naik
          lebih dari 5% minimal {threshold}%, dan masuk daftar risiko bila peluang turunnya minimal{" "}
          {threshold}%. Uji out-of-time (dilatih sebelum {v.cutoff}, diuji pada{" "}
          {fmt.int(v.test_players)} pemain sesudahnya):{" "}
          <strong className="text-[#F1F5F9]">
            {pct(v.buy.went_up)} sinyal beli benar naik
          </strong>{" "}
          dan{" "}
          <strong className="text-[#F1F5F9]">
            {pct(v.depreciation_risk.went_down)} sinyal risiko benar turun
          </strong>
          , dibanding angka dasar {pct(v.base_rate.up)} naik dan {pct(v.base_rate.down)} turun.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
          Kenapa bukan &quot;harga sudah jatuh, jadi murah&quot;: di data yang sama, pemain yang
          harganya jatuh lebih dari 40% dalam setahun hanya {pct(v.fell_over_40pct_prior_12m.went_up)}{" "}
          yang naik lagi, {pct(v.fell_over_40pct_prior_12m.went_down)} lanjut turun. Batas: ini
          proyeksi nilai pasar Transfermarkt, tanpa data performa, cedera, atau kontrak, dan
          pertumbuhan pemain muda cenderung terlalu optimistis karena dataset hanya berisi pemain
          yang sampai ke liga top-5. Pakai sebagai daftar pendek untuk scout. Sinyal saat ini:{" "}
          {outlook.signal_counts.Buy} beli, {outlook.signal_counts.DepreciationRisk} risiko turun,{" "}
          {fmt.int(outlook.signal_counts.Neutral)} netral.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#10B981]">Layak Beli: Nilai Diproyeksikan Naik</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Peluang naik ≥ {threshold}%, nilai kini ≥ {fmt.eurShort(outlook.min_value_eur)},
            diurutkan menurut kenaikan nilai dalam Euro.
          </p>
          <OutlookTable rows={outlook.buy.slice(0, 12)} tone="buy" />
        </div>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#EF4444]">
            Hindari / Jual: Nilai Diproyeksikan Turun
          </h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Peluang turun ≥ {threshold}%, diurutkan menurut penurunan nilai dalam Euro. Pemain
            bagus pun masuk sini bila usianya membuat nilai jualnya menyusut.
          </p>
          <OutlookTable rows={outlook.depreciation_risk.slice(0, 12)} tone="risk" />
        </div>
      </div>
    </div>
  );
}
