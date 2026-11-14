"use client";

import { useMemo, useState } from "react";

import { ClubBadge, PlayerAvatar } from "@/components/entity-media";
import type { OverviewResponse, TestPredictionRow, TestPredictionsResponse } from "@/lib/api";
import { fmt, TREND_META } from "@/lib/format";

const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** How far a guess landed from the real price, in words a reader can picture. */
const BUCKETS = [
  { label: "Hampir tepat", hint: "selisih sampai 10%", max: 0.1, tone: "bg-[#10B981]" },
  { label: "Cukup dekat", hint: "10 sampai 25%", max: 0.25, tone: "bg-[#5EC9A3]" },
  { label: "Meleset", hint: "25 sampai 50%", max: 0.5, tone: "bg-[#C99A3B]" },
  { label: "Meleset jauh", hint: "lebih dari 50%", max: Infinity, tone: "bg-[#D9604C]" },
];

type GroupId = "age" | "value" | "position" | "league";
const GROUPS: { id: GroupId; label: string; order?: string[]; of: (r: TestPredictionRow) => string }[] = [
  {
    id: "age",
    label: "Usia",
    order: ["21 tahun ke bawah", "22 sampai 25", "26 sampai 29", "30 tahun ke atas"],
    of: (r) => (r.age <= 21 ? "21 tahun ke bawah" : r.age <= 25 ? "22 sampai 25" : r.age <= 29 ? "26 sampai 29" : "30 tahun ke atas"),
  },
  {
    id: "value",
    label: "Harga",
    order: ["Di bawah €5M", "€5M sampai €20M", "€20M sampai €50M", "€50M ke atas"],
    of: (r) => {
      const v = r.previous_value_eur ?? r.actual_value_eur;
      return v < 5e6 ? "Di bawah €5M" : v < 20e6 ? "€5M sampai €20M" : v < 50e6 ? "€20M sampai €50M" : "€50M ke atas";
    },
  },
  {
    id: "position",
    label: "Posisi",
    order: ["Penyerang", "Gelandang", "Bek", "Kiper"],
    of: (r) => ({ Forward: "Penyerang", Midfielder: "Gelandang", Defender: "Bek", Goalkeeper: "Kiper" })[r.position_group ?? ""] ?? "",
  },
  { id: "league", label: "Liga", of: (r) => r.league_name },
];

function ShareBar({ counts, total }: { counts: number[]; total: number }) {
  return (
    <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
      {counts.map((c, i) => (
        <span key={BUCKETS[i].label} className={BUCKETS[i].tone} style={{ width: `${(c / total) * 100}%` }} />
      ))}
    </div>
  );
}

function MissTable({ rows, tone }: { rows: TestPredictionRow[]; tone: "low" | "high" }) {
  return (
    <table className="mt-3 w-full text-[13px]">
      <thead>
        <tr className="text-left text-xs text-[#7C8BA1]">
          <th className="pb-2 font-normal">Pemain</th>
          <th className="hidden pb-2 text-right font-normal sm:table-cell">Sebelumnya</th>
          <th className="pb-2 text-right font-normal">Tebakan</th>
          <th className="pb-2 text-right font-normal">Kenyataan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.player_id} className="border-t border-[#1B2634]">
            <td className="py-2 pr-2">
              <div className="flex items-center gap-2.5">
                <PlayerAvatar playerId={r.player_id} name={r.name} size={28} />
                <div className="min-w-0">
                  <span className="block truncate font-medium text-[#F1F5F9]">{r.name}</span>
                  <span className="flex items-center gap-1 text-xs text-[#7C8BA1]">
                    <ClubBadge playerId={r.player_id} club={r.peak_club} size={11} />
                    <span>· {r.age} thn</span>
                  </span>
                </div>
              </div>
            </td>
            <td className="hidden py-2 text-right tabular-nums text-[#94A3B8] sm:table-cell">
              {fmt.eurShort(r.previous_value_eur ?? 0)}
            </td>
            <td className="py-2 text-right tabular-nums text-[#CBD5E1]">{fmt.eurShort(r.forecast_value_eur ?? 0)}</td>
            <td className={`py-2 text-right font-semibold tabular-nums ${tone === "low" ? "text-[#34D399]" : "text-[#F0816E]"}`}>
              {fmt.eurShort(r.actual_value_eur)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ErrorAnalysisPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const [group, setGroup] = useState<GroupId>("age");
  const rows = useMemo(() => preds.rows.filter((r) => r.forecast_value_eur !== undefined && r.actual_value_eur > 0), [preds]);
  const total = rows.length;

  const stats = useMemo(() => {
    const rel = (guess: number, r: TestPredictionRow) => Math.abs(guess - r.actual_value_eur) / r.actual_value_eur;
    const bucket = (x: number) => BUCKETS.findIndex((b) => x <= b.max);
    const model = [0, 0, 0, 0];
    const naive = [0, 0, 0, 0];
    let over = 0;
    let unchanged = 0;
    for (const r of rows) {
      model[bucket(rel(r.forecast_value_eur!, r))] += 1;
      naive[bucket(rel(r.previous_value_eur ?? r.actual_value_eur, r))] += 1;
      if (r.forecast_value_eur! > r.actual_value_eur) over += 1;
      if (r.previous_value_eur === r.actual_value_eur) unchanged += 1;
    }
    const bySigned = [...rows].sort(
      (a, b) => a.forecast_value_eur! - a.actual_value_eur - (b.forecast_value_eur! - b.actual_value_eur),
    );
    return {
      model,
      naive,
      over,
      unchanged,
      typical: median(rows.map((r) => rel(r.forecast_value_eur!, r))),
      tooLow: bySigned.slice(0, 5),
      tooHigh: bySigned.slice(-5).reverse(),
    };
  }, [rows]);

  const segments = useMemo(() => {
    const g = GROUPS.find((x) => x.id === group)!;
    const map = new Map<string, TestPredictionRow[]>();
    for (const r of rows) {
      const key = g.of(r);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    const out = [...map.entries()]
      .filter(([, rs]) => rs.length >= 15)
      .map(([name, rs]) => ({
        name,
        n: rs.length,
        model: rs.filter((r) => Math.abs(r.forecast_value_eur! - r.actual_value_eur) / r.actual_value_eur <= 0.25).length / rs.length,
        naive:
          rs.filter((r) => Math.abs((r.previous_value_eur ?? r.actual_value_eur) - r.actual_value_eur) / r.actual_value_eur <= 0.25)
            .length / rs.length,
        trend: rs.filter((r) => r.pred_trend === r.actual_trend).length / rs.length,
      }));
    return g.order ? out.sort((a, b) => g.order!.indexOf(a.name) - g.order!.indexOf(b.name)) : out.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, group]);
  const worst = segments.reduce((a, b) => (b.model < a.model ? b : a), segments[0]);
  const best = segments.reduce((a, b) => (b.model > a.model ? b : a), segments[0]);

  const trend = overview.classification.trend;
  const trendBest = trend?.models.find((m) => m.name === trend.best_model);
  const confusions = useMemo(() => {
    if (!trend || !trendBest) return [];
    const out: { actual: string; pred: string; n: number; of: number }[] = [];
    trendBest.confusion_matrix.forEach((row, i) => {
      const rowTotal = row.reduce((a, b) => a + b, 0);
      row.forEach((n, j) => {
        if (i !== j && n > 0) out.push({ actual: trend.classes[i], pred: trend.classes[j], n, of: rowTotal });
      });
    });
    return out.sort((a, b) => b.n - a.n).slice(0, 4);
  }, [trend, trendBest]);
  const trendRight = rows.filter((r) => r.pred_trend === r.actual_trend).length;

  const panel = "rounded-xl border border-[#243244] bg-[#121A24]";
  const close = stats.model[0] + stats.model[1];
  const naiveClose = stats.naive[0] + stats.naive[1];
  const fc = overview.regression.tasks?.forecast.headline;

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-[#F1F5F9]">Seberapa sering model salah</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[#CBD5E1]">
          Model diuji pada {fmt.int(total)} pemain yang tidak pernah dilihatnya. Untuk tiap pemain ia menebak harga di update
          berikutnya, lalu tebakan itu dibandingkan dengan harga yang benar-benar keluar. Dari {fmt.int(total)} tebakan,{" "}
          <span className="font-semibold text-[#F1F5F9]">{fmt.int(close)} ({pct0(close / total)}) selisihnya di bawah 25%</span>.
          Tebakan biasanya meleset sekitar {pct0(stats.typical)} dari harga asli.
        </p>
      </div>

      <section className={`${panel} p-5`}>
        <h3 className="text-base font-semibold text-[#F1F5F9]">Seberapa dekat tebakan harganya</h3>
        <div className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[13px] text-[#F1F5F9]">Tebakan model</p>
              <ShareBar counts={stats.model} total={total} />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] text-[#94A3B8]">Tanpa model: menganggap harga tidak berubah</p>
              <ShareBar counts={stats.naive} total={total} />
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-xs text-[#7C8BA1]">
                  <th className="pb-2 text-left font-normal">Hasil tebakan</th>
                  <th className="pb-2 text-right font-normal">Model</th>
                  <th className="pb-2 text-right font-normal">Tanpa model</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map((b, i) => (
                  <tr key={b.label} className="border-t border-[#1B2634]">
                    <td className="py-2">
                      <span className="flex items-start gap-2">
                        <span className={`mt-1 size-2.5 shrink-0 rounded-sm ${b.tone}`} />
                        <span>
                          <span className="text-[#F1F5F9]">{b.label}</span>{" "}
                          <span className="whitespace-nowrap text-[#7C8BA1]">{b.hint}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-[#F1F5F9]">
                      {stats.model[i]} <span className="text-[#7C8BA1]">({pct0(stats.model[i] / total)})</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-[#94A3B8]">
                      {stats.naive[i]} ({pct0(stats.naive[i] / total)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 text-[13px] leading-relaxed text-[#CBD5E1]">
            <p>
              <span className="font-semibold text-[#F1F5F9]">Cara membacanya.</span> Makin panjang bagian hijau, makin banyak
              tebakan yang dekat dengan harga asli.
            </p>
            <p>
              {naiveClose > close ? (
                <>
                  Untuk satu update ke depan, menganggap harga tetap ternyata sedikit lebih sering dekat:{" "}
                  <span className="text-[#FBBF24]">
                    {fmt.int(naiveClose)} lawan {fmt.int(close)} tebakan
                  </span>
                  .
                </>
              ) : (
                <>
                  Model sedikit lebih sering dekat daripada menganggap harga tetap: {fmt.int(close)} lawan {fmt.int(naiveClose)}{" "}
                  tebakan.
                </>
              )}{" "}
              Sebabnya, pada {fmt.int(stats.unchanged)} dari {fmt.int(total)} pemain ({pct0(stats.unchanged / total)}) harganya
              memang tidak berubah di update itu.
            </p>
            {fc ? (
              <p>
                Keunggulan model ada di kesalahan besar: saat harga bergerak jauh, tebakannya meleset lebih sedikit (galat
                skala persen {fc.metrics.rmse_log.toFixed(3).replace(".", ",")} lawan{" "}
                {fc.naive_last_value.rmse_log.toFixed(3).replace(".", ",")}). Model juga lebih berguna untuk proyeksi 12 bulan.
              </p>
            ) : null}
            <p>
              Model cenderung menebak terlalu tinggi: {fmt.int(stats.over)} tebakan ({pct0(stats.over / total)}) di atas harga
              asli.
            </p>
          </div>
        </div>
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div>
            <h3 className="text-base font-semibold text-[#F1F5F9]">Pada pemain seperti apa model paling sering salah</h3>
            {worst && best && worst !== best ? (
              <p className="mt-1 text-[13px] text-[#CBD5E1]">
                Paling sulit ditebak: <span className="font-semibold text-[#F1F5F9]">{worst.name.toLowerCase()}</span>, hanya{" "}
                {pct0(worst.model)} tebakan yang dekat. Paling mudah: {best.name.toLowerCase()}, {pct0(best.model)} dekat.
              </p>
            ) : null}
          </div>
          <div role="tablist" aria-label="Kelompokkan pemain" className="inline-flex flex-wrap gap-1 rounded-lg bg-[#0B1117] p-1">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                role="tab"
                type="button"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  group === g.id ? "bg-[#243244] text-[#F1F5F9]" : "text-[#94A3B8] hover:text-[#F1F5F9]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto px-5 pb-4">
          <table className="mt-3 w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-xs text-[#7C8BA1]">
                <th className="pb-2 text-left font-normal">Kelompok</th>
                <th className="pb-2 text-right font-normal">Pemain</th>
                <th className="w-[38%] pb-2 pl-6 text-left font-normal">Tebakan yang dekat</th>
                <th className="pb-2 text-right font-normal">Tanpa model</th>
                <th className="pb-2 text-right font-normal">Tren tertebak</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => {
                const better = s.model > s.naive;
                return (
                  <tr key={s.name} className="border-t border-[#1B2634]">
                    <td className="py-2.5 text-[#F1F5F9]">{s.name}</td>
                    <td className="py-2.5 text-right tabular-nums text-[#94A3B8]">{s.n}</td>
                    <td className="py-2.5 pl-6">
                      <span className="flex items-center gap-3">
                        <span className="h-1.5 flex-1 rounded-full bg-[#1B2634]">
                          <span
                            className={`block h-1.5 rounded-full ${s === worst ? "bg-[#C99A3B]" : "bg-[#64748B]"}`}
                            style={{ width: `${s.model * 100}%` }}
                          />
                        </span>
                        <span className="w-10 text-right font-semibold tabular-nums text-[#F1F5F9]">{pct0(s.model)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className="text-[#94A3B8]">{pct0(s.naive)}</span>{" "}
                      <span className={better ? "text-[#34D399]" : "text-[#FBBF24]"}>
                        {Math.round(s.model * 100) === Math.round(s.naive * 100) ? "setara" : better ? "model unggul" : "model kalah"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-[#CBD5E1]">{pct0(s.trend)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-[#7C8BA1]">
            &quot;Tebakan yang dekat&quot; adalah bagian tebakan yang selisihnya dengan harga asli di bawah 25%. Kolom &quot;tanpa
            model&quot; menghitung hal yang sama kalau harga dianggap tidak berubah. &quot;Tren tertebak&quot; adalah seberapa sering model benar soal posisi harga terhadap puncak
            karier. Kelompok dengan kurang dari 15 pemain tidak ditampilkan.
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Tebakan yang terlalu rendah</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
            Pemain yang harganya melonjak lebih tinggi dari perkiraan. Kebanyakan pemain muda yang sedang naik daun: lonjakan
            seperti ini datang dari performa di lapangan, yang tidak ada di data.
          </p>
          <MissTable rows={stats.tooLow} tone="low" />
        </section>
        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Tebakan yang terlalu tinggi</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
            Pemain yang harganya turun padahal model mengira tetap atau naik. Biasanya pemain mahal yang sedang di puncak, lalu
            dikoreksi.
          </p>
          <MissTable rows={stats.tooHigh} tone="high" />
        </section>
      </div>

      {trend && confusions.length ? (
        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Salah tebak tren yang paling sering</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
            Selain harga, model menebak tren: apakah pemain masih dekat puncak kariernya, stabil, menurun, atau jatuh tajam. Ia
            benar pada {fmt.int(trendRight)} dari {fmt.int(total)} pemain ({pct0(trendRight / total)}). Empat kesalahan terbanyak:
          </p>
          <ul className="mt-3 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {confusions.map((c) => (
              <li key={`${c.actual}-${c.pred}`} className="flex items-baseline gap-3 border-t border-[#1B2634] pt-3 text-[13px]">
                <span className="w-9 shrink-0 text-right text-lg font-semibold tabular-nums text-[#F1F5F9]">{c.n}</span>
                <span className="leading-relaxed text-[#CBD5E1]">
                  pemain yang sebenarnya{" "}
                  <span className="font-semibold text-[#F1F5F9]">{TREND_META[c.actual]?.label.toLowerCase() ?? c.actual}</span>{" "}
                  ditebak <span className="font-semibold text-[#F1F5F9]">{TREND_META[c.pred]?.label.toLowerCase() ?? c.pred}</span>
                  <span className="block text-xs text-[#7C8BA1]">
                    dari {c.of} pemain {TREND_META[c.actual]?.label.toLowerCase() ?? c.actual} ({TREND_META[c.actual]?.hint})
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[#7C8BA1]">
            Kelompok &quot;stabil&quot; paling sering salah karena rentangnya sempit: selisih harga kecil saja sudah memindahkan
            pemain ke kelompok sebelahnya.
          </p>
        </section>
      ) : null}
    </div>
  );
}
