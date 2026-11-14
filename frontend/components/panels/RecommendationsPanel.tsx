"use client";

import { useMemo, useState } from "react";

import { ClubBadge, PlayerAvatar } from "@/components/entity-media";
import type { OutlookRow, TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

const POSITION_ID: Record<string, string> = {
  Goalkeeper: "Kiper",
  "Centre-Back": "Bek tengah",
  "Left-Back": "Bek kiri",
  "Right-Back": "Bek kanan",
  "Defensive Midfield": "Gelandang bertahan",
  "Central Midfield": "Gelandang tengah",
  "Attacking Midfield": "Gelandang serang",
  "Left Midfield": "Gelandang kiri",
  "Right Midfield": "Gelandang kanan",
  "Left Winger": "Sayap kiri",
  "Right Winger": "Sayap kanan",
  "Second Striker": "Penyerang lubang",
  "Centre-Forward": "Penyerang tengah",
};

const BUDGETS = [
  { label: "Semua harga", max: Infinity },
  { label: "Sampai €10M", max: 10e6 },
  { label: "Sampai €25M", max: 25e6 },
  { label: "Sampai €50M", max: 50e6 },
];

const outOfTen = (p: number) => `${Math.round(p * 10)} dari 10`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

/** Turn the model's top reasons into a short phrase a reader can check against the player. */
function reasonText(r: OutlookRow, tone: "buy" | "risk"): string {
  const phrases: string[] = [];
  for (const reason of r.reasons ?? []) {
    const v = reason.key_value;
    let text = "";
    if (reason.group === "age") text = tone === "buy" ? `masih ${r.age} tahun` : `usianya sudah ${r.age} tahun`;
    else if (reason.group === "momentum")
      text = typeof v === "number" && v < 0 ? "harganya sedang turun" : tone === "buy" ? "harganya sedang naik" : "kenaikannya sudah berhenti";
    else if (reason.group === "price_level") text = tone === "buy" ? "harganya masih rendah" : "harganya sudah sangat tinggi";
    else if (reason.group === "career_length") text = tone === "buy" ? "baru sebentar di level atas" : "sudah lama di level atas";
    else if (reason.group === "league") text = `bermain di ${r.league_name}`;
    else if (reason.group === "drawdown") text = tone === "buy" ? "sedang di harga tertingginya" : "sudah turun dari harga tertingginya";
    else if (reason.group === "position" && POSITION_ID[r.position]) text = `posisinya ${POSITION_ID[r.position].toLowerCase()}`;
    if (text && !phrases.includes(text)) phrases.push(text);
    if (phrases.length === 2) break;
  }
  return phrases.join(", ");
}

function PlayerList({ rows, tone }: { rows: OutlookRow[]; tone: "buy" | "risk" }) {
  const color = tone === "buy" ? "text-[#34D399]" : "text-[#F0816E]";
  const bar = tone === "buy" ? "bg-[#10B981]" : "bg-[#D9604C]";
  if (!rows.length) {
    return <p className="border-t border-[#1B2634] py-6 text-center text-[13px] text-[#94A3B8]">Tidak ada pemain di rentang harga ini.</p>;
  }
  return (
    <ul>
      {rows.map((r) => {
        const chance = tone === "buy" ? r.p_up : r.p_down;
        const why = reasonText(r, tone);
        return (
          <li key={r.player_id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-[#1B2634] py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <PlayerAvatar playerId={r.player_id} name={r.name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#F1F5F9]">{r.name}</p>
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-[#94A3B8]">
                <ClubBadge playerId={r.player_id} club={r.peak_club} size={12} />
                <span>· {r.age} tahun</span>
                {POSITION_ID[r.position] ? <span>· {POSITION_ID[r.position]}</span> : null}
              </p>
              {why ? <p className="mt-1 text-xs leading-relaxed text-[#7C8BA1]">Kenapa: {why}.</p> : null}
            </div>
            <div className="col-span-2 sm:col-span-1 sm:text-right">
              <p className="whitespace-nowrap text-[13px] tabular-nums text-[#CBD5E1]">
                {fmt.eurShort(r.current_value_eur)} <span className="text-[#7C8BA1]">menjadi sekitar</span>{" "}
                <span className={`font-semibold ${color}`}>{fmt.eurShort(r.expected_value_eur)}</span>
              </p>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                Peluang {tone === "buy" ? "naik" : "turun"} <span className="font-semibold text-[#F1F5F9]">{outOfTen(chance)}</span>
              </p>
              <span className="mt-1.5 block h-1 rounded-full bg-[#1B2634] sm:ml-auto sm:w-32">
                <span className={`block h-1 rounded-full ${bar}`} style={{ width: `${chance * 100}%` }} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RecommendationsPanel({ preds }: { preds: TestPredictionsResponse }) {
  const outlook = preds.outlook;
  const [budget, setBudget] = useState(0);
  const [moreBuy, setMoreBuy] = useState(false);
  const [moreRisk, setMoreRisk] = useState(false);

  const buy = useMemo(
    () => (outlook?.buy ?? []).filter((r) => r.current_value_eur <= BUDGETS[budget].max),
    [outlook, budget],
  );

  if (!outlook) {
    return (
      <p className="rounded-xl border border-[#243244] bg-[#121A24] p-5 text-sm text-[#94A3B8]">
        Data proyeksi 12 bulan belum tersedia.
      </p>
    );
  }
  const v = outlook.validation;
  const panel = "rounded-xl border border-[#243244] bg-[#121A24]";
  const risk = outlook.depreciation_risk;

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-[#F1F5F9]">Siapa yang nilainya naik, siapa yang turun</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[#CBD5E1]">
          Model memperkirakan nilai pasar tiap pemain setahun dari sekarang. Daftar di bawah hanya memuat pemain yang peluang
          naik atau turunnya besar: dari {fmt.int(Object.values(outlook.signal_counts).reduce((a, b) => a + b, 0))} pemain,{" "}
          {outlook.signal_counts.Buy} diperkirakan naik dan {outlook.signal_counts.DepreciationRisk} diperkirakan turun. Sisanya
          tidak cukup jelas arahnya, jadi tidak ditampilkan.
        </p>
      </div>

      <section className={panel}>
        <h3 className="px-5 pt-4 text-base font-semibold text-[#F1F5F9]">Seberapa bisa dipercaya</h3>
        <div className="grid divide-y divide-[#243244] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            {
              figure: outOfTen(v.buy.went_up ?? 0),
              text: `perkiraan "naik" di masa lalu ternyata benar naik (${pct0(v.buy.went_up ?? 0)} dari ${v.buy.n} pemain).`,
            },
            {
              figure: outOfTen(v.depreciation_risk.went_down ?? 0),
              text: `perkiraan "turun" di masa lalu ternyata benar turun (${pct0(v.depreciation_risk.went_down ?? 0)} dari ${v.depreciation_risk.n} pemain).`,
            },
            {
              figure: outOfTen(v.base_rate.up),
              text: "pemain naik nilainya kalau dipilih acak. Itu pembandingnya.",
            },
          ].map((c) => (
            <p key={c.text} className="px-5 py-4 text-[13px] leading-relaxed text-[#CBD5E1]">
              <span className="block text-2xl font-semibold tabular-nums text-[#F1F5F9]">{c.figure}</span>
              {c.text}
            </p>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className={`${panel} px-5 pt-4 pb-2`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Diperkirakan naik</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
            Kandidat untuk dibeli sekarang. Diurutkan dari kenaikan nilai terbesar dalam Euro.
          </p>
          <div role="tablist" aria-label="Batas harga" className="mt-3 mb-3 inline-flex flex-wrap gap-1 rounded-lg bg-[#0B1117] p-1">
            {BUDGETS.map((b, i) => (
              <button
                key={b.label}
                role="tab"
                type="button"
                aria-selected={budget === i}
                onClick={() => {
                  setBudget(i);
                  setMoreBuy(false);
                }}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  budget === i ? "bg-[#243244] text-[#F1F5F9]" : "text-[#94A3B8] hover:text-[#F1F5F9]"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <PlayerList rows={buy.slice(0, moreBuy ? 30 : 6)} tone="buy" />
          {buy.length > 6 ? (
            <button
              type="button"
              onClick={() => setMoreBuy((m) => !m)}
              className="w-full border-t border-[#1B2634] py-3 text-[13px] font-medium text-[#94A3B8] hover:text-[#F1F5F9]"
            >
              {moreBuy ? "Tampilkan lebih sedikit" : `Tampilkan ${buy.length - 6} pemain lagi`}
            </button>
          ) : null}
        </section>

        <section className={`${panel} px-5 pt-4 pb-2`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Diperkirakan turun</h3>
          <p className="mt-1 mb-3 text-[13px] leading-relaxed text-[#CBD5E1]">
            Sebaiknya tidak dibeli mahal, atau dijual selagi nilainya tinggi. Ini bukan berarti mainnya jelek: nilai pasar pemain
            bintang biasanya menyusut setelah usia 27 sampai 28.
          </p>
          <PlayerList rows={risk.slice(0, moreRisk ? 30 : 6)} tone="risk" />
          {risk.length > 6 ? (
            <button
              type="button"
              onClick={() => setMoreRisk((m) => !m)}
              className="w-full border-t border-[#1B2634] py-3 text-[13px] font-medium text-[#94A3B8] hover:text-[#F1F5F9]"
            >
              {moreRisk ? "Tampilkan lebih sedikit" : `Tampilkan ${risk.length - 6} pemain lagi`}
            </button>
          ) : null}
        </section>
      </div>

      <details className={`${panel} group`}>
        <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-[#F1F5F9] marker:hidden">
          Cara daftar ini dibuat dan batasannya
          <span className="ml-2 text-[13px] font-normal text-[#7C8BA1] group-open:hidden">buka</span>
          <span className="ml-2 hidden text-[13px] font-normal text-[#7C8BA1] group-open:inline">tutup</span>
        </summary>
        <ul className="grid gap-x-8 gap-y-2.5 border-t border-[#243244] px-5 py-4 text-[13px] leading-relaxed text-[#CBD5E1] md:grid-cols-2">
          <li>
            <span className="font-semibold text-[#F1F5F9]">Syarat masuk daftar.</span> Peluang nilainya berubah lebih dari 5%
            dalam setahun minimal {pct0(outlook.threshold)}, dan nilai sekarang minimal {fmt.eurShort(outlook.min_value_eur)}.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Cara mengujinya.</span> Model dilatih hanya dari data sebelum{" "}
            {v.cutoff}, lalu perkiraannya dicocokkan dengan harga {fmt.int(v.test_players)} pemain sesudah tanggal itu.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Yang diperkirakan.</span> Nilai pasar versi Transfermarkt, bukan harga
            transfer dan bukan kualitas bermain.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Yang tidak diketahui model.</span> Gol, menit bermain, cedera, dan
            kontrak. Semua itu baru terbaca setelah harganya berubah.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Pemain muda cenderung terlalu optimistis.</span> Data hanya berisi
            pemain yang berhasil sampai liga top, jadi pemain muda yang gagal tidak ikut dipelajari.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Harga jatuh bukan tanda murah.</span> Dari pemain yang harganya jatuh
            lebih dari 40% dalam setahun, hanya {pct0(v.fell_over_40pct_prior_12m.went_up ?? 0)} yang naik lagi.
          </li>
        </ul>
      </details>
    </div>
  );
}
