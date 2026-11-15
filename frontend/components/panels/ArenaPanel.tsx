"use client";

import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt, TREND_META } from "@/lib/format";

const MODEL_NAME: Record<string, { name: string; note: string }> = {
  "Ordinal HGB (calibrated)": { name: "Gradient boosting berurutan", note: "memperlakukan empat tren sebagai tangga, dari naik sampai jatuh" },
  "HistGradientBoosting (calibrated)": { name: "Gradient boosting biasa", note: "ratusan pohon keputusan kecil yang saling memperbaiki" },
  "Logistic Regression": { name: "Regresi logistik", note: "model garis lurus, paling sederhana" },
  "Random Forest": { name: "Random forest", note: "ratusan pohon keputusan yang memilih bersama" },
  "Persistence (last state)": { name: "Tanpa model", note: "menganggap tren pemain tidak berubah" },
};

const TASK_LABEL: Record<string, string> = {
  forecast: "Harga berikutnya",
  fundamental: "Nilai wajar",
  profile: "Profil (hanya API)",
};

const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const outOf = (x: number, n: number) => `${Math.round(x * n)} dari ${n}`;

/** Words for how much better the model is than the no-model guess. `gain` is a relative improvement. */
function verdict(gain: number): { text: string; className: string } {
  if (gain < 0) return { text: "Belum lebih baik", className: "text-[#FBBF24]" };
  if (gain < 0.03) return { text: "Hampir setara", className: "text-[#CBD5E1]" };
  if (gain < 0.15) return { text: "Sedikit lebih baik", className: "text-[#34D399]" };
  return { text: "Jauh lebih baik", className: "text-[#34D399]" };
}

function Bar({ value, tone = "muted" }: { value: number; tone?: "accent" | "muted" | "warn" }) {
  const color = { accent: "bg-[#10B981]", muted: "bg-[#64748B]", warn: "bg-[#F59E0B]" }[tone];
  return (
    <span className="block h-1.5 rounded-full bg-[#1B2634]">
      <span className={`block h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </span>
  );
}

interface RaceRow {
  key: string;
  name: string;
  note: string;
  value: number;
  chosen: boolean;
  baseline: boolean;
}

/**
 * Dot plot on a zoomed axis: where each model lands, the no-model line it has to beat, and the
 * band inside which differences are noise. Dots, not bars, because the axis does not start at zero.
 */
function ModelRace({ rows, noise }: { rows: RaceRow[]; noise: number }) {
  if (!rows.length) return null;
  const values = rows.map((r) => r.value);
  const lo = Math.floor((Math.min(...values) - 0.015) * 50) / 50;
  const hi = Math.ceil((Math.max(...values) + 0.015) * 50) / 50;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const base = rows.find((r) => r.baseline);
  const chosen = rows.find((r) => r.chosen);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += 0.02) ticks.push(v);
  const cols = "grid grid-cols-[7.5rem_minmax(0,1fr)_3.25rem] sm:grid-cols-[11.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-3";

  return (
    <div className="mt-5">
      {rows.map((r) => (
        <div key={r.key} className={cols}>
          <div className="py-2.5">
            <p className={`text-[13px] leading-tight ${r.chosen ? "font-semibold text-[#F1F5F9]" : r.baseline ? "text-[#94A3B8]" : "text-[#CBD5E1]"}`}>
              {r.name}
            </p>
            {r.chosen ? <p className="text-xs text-[#34D399]">dipakai</p> : null}
          </div>
          <div className="relative h-full min-h-11" title={r.note}>
            {chosen && noise > 0 ? (
              <span
                className="absolute inset-y-0 bg-[#10B981]/10"
                style={{ left: x(Math.max(lo, chosen.value - noise)), right: `calc(100% - ${x(Math.min(hi, chosen.value + noise))})` }}
              />
            ) : null}
            {base ? <span className="absolute inset-y-0 w-px bg-[#F59E0B]/70" style={{ left: x(base.value) }} /> : null}
            <span className="absolute left-0 right-0 top-1/2 h-px bg-[#243244]" />
            <span
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform ${
                r.chosen
                  ? "size-4 bg-[#10B981] ring-4 ring-[#10B981]/25"
                  : r.baseline
                    ? "size-3 border-2 border-[#F59E0B] bg-[#121A24]"
                    : "size-3 bg-[#94A3B8]"
              }`}
              style={{ left: x(r.value) }}
            />
          </div>
          <p className={`text-right text-[13px] tabular-nums ${r.chosen ? "font-semibold text-[#F1F5F9]" : "text-[#CBD5E1]"}`}>
            {pct1(r.value)}
          </p>
        </div>
      ))}
      <div className={cols}>
        <span />
        <div className="relative h-5 border-t border-[#243244]">
          {ticks.map((v, i) => (
            <span
              key={v}
              className={`absolute top-1 -translate-x-1/2 text-[11px] tabular-nums text-[#7C8BA1] ${i % 2 ? "hidden sm:inline" : ""}`}
              style={{ left: x(v) }}
            >
              {Math.round(v * 100)}%
            </span>
          ))}
        </div>
        <span />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#94A3B8]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-[#F59E0B]" />
          garis yang harus dikalahkan: tanpa model
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 bg-[#10B981]/20" />
          selisih di dalam area ini masih kebetulan
        </span>
      </p>
    </div>
  );
}

/** 100 squares, one per 100 test players: filled = guessed right. */
function Waffle({ value, tone, title, note }: { value: number; tone: "accent" | "warn"; title: string; note: string }) {
  const filled = Math.round(value * 100);
  const on = tone === "accent" ? "bg-[#10B981]" : "bg-[#F59E0B]";
  return (
    <div>
      <div className="grid max-w-[168px] grid-cols-10 gap-[3px]" role="img" aria-label={`${filled} dari 100 pemain tertebak benar`}>
        {Array.from({ length: 100 }, (_, i) => (
          <span key={i} className={`aspect-square rounded-[2px] ${i < filled ? on : "bg-[#1B2634]"}`} />
        ))}
      </div>
      <p className={`mt-3 text-3xl font-semibold tabular-nums ${tone === "accent" ? "text-[#F1F5F9]" : "text-[#FBBF24]"}`}>
        {filled} <span className="text-[13px] font-normal text-[#94A3B8]">dari 100</span>
      </p>
      <p className="text-[13px] font-semibold text-[#F1F5F9]">{title}</p>
      <p className="text-xs leading-snug text-[#7C8BA1]">{note}</p>
    </div>
  );
}

export function ArenaPanel({
  overview,
  preds,
}: {
  overview: OverviewResponse;
  preds: TestPredictionsResponse;
}) {
  const ds = overview.dataset;
  const cls = overview.classification;
  const trend = cls.trend;
  const tasks = overview.regression.tasks;
  const fc = tasks?.forecast.headline;
  const ov = preds.outlook?.validation;
  const cleanBest = cls.clean_mode.models.find((m) => m.name === cls.clean_mode.best_model) ?? cls.clean_mode.models[0];
  const leakBest = cls.leakage_mode.models.find((m) => m.name === cls.leakage_mode.best_model) ?? cls.leakage_mode.models[0];

  const cards = [
    trend && {
      title: "Menebak tren pemain",
      question: "Di update berikutnya, pemain ini masih dekat puncak, stabil, menurun, atau jatuh?",
      figure: outOf(trend.headline.metrics.accuracy, 100),
      unit: "pemain tertebak benar",
      base: `Tanpa model: ${outOf(trend.headline.persistence.accuracy, 100)}`,
      v: verdict(trend.headline.metrics.accuracy / trend.headline.persistence.accuracy - 1),
    },
    fc && {
      title: "Menebak harga berikutnya",
      question: "Berapa nilai pasarnya di update harga berikutnya?",
      figure: pct1(fc.metrics.medape),
      unit: "biasanya meleset dari harga asli",
      base: `Tanpa model: meleset ${pct1(fc.naive_last_value.medape)}`,
      // Mixed evidence (better on the typical miss, not on the average miss in euros): never more than "almost equal".
      v: verdict(fc.beats_naive_eur ? 1 - fc.metrics.medape / fc.naive_last_value.medape : Math.min(0.02, 1 - fc.metrics.medape / fc.naive_last_value.medape)),
    },
    ov && {
      title: "Menebak arah setahun ke depan",
      question: "Setahun lagi, nilainya naik atau turun?",
      figure: outOf(ov.buy.went_up ?? 0, 10),
      unit: 'perkiraan "naik" ternyata benar',
      base: `Kalau memilih acak: ${outOf(ov.base_rate.up, 10)}`,
      v: verdict((ov.buy.went_up ?? 0) / ov.base_rate.up - 1),
    },
  ].filter(Boolean) as { title: string; question: string; figure: string; unit: string; base: string; v: ReturnType<typeof verdict> }[];

  const candidates = trend ? [...trend.models].sort((a, b) => b.accuracy - a.accuracy) : [];
  const spread = candidates.length
    ? Math.max(...candidates.filter((m) => !m.name.startsWith("Persistence")).map((m) => m.accuracy)) -
      Math.min(...candidates.filter((m) => !m.name.startsWith("Persistence")).map((m) => m.accuracy))
    : 0;

  const t = ds.trajectories;
  const today = [
    { id: "rising", n: (t.rising_star ?? 0) + (t.growing ?? 0) },
    { id: "stable", n: t.stable ?? 0 },
    { id: "declining", n: t.declining ?? 0 },
    { id: "falling_sharply", n: t.falling_sharply ?? 0 },
  ];
  const maxToday = Math.max(...today.map((x) => x.n), 1);

  const panel = "rounded-xl border border-[#243244] bg-[#121A24]";

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-[#F1F5F9]">Seberapa bagus modelnya</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[#CBD5E1]">
          Model di situs ini menebak tiga hal tentang nilai pasar pemain. Tiap tebakan diuji pada {fmt.int(ds.test_size)} pemain
          yang tidak pernah dilihat model, lalu dibandingkan dengan tebakan paling sederhana: menganggap tidak ada yang berubah.
          Model baru berguna kalau mengalahkan tebakan sederhana itu.
        </p>
      </div>

      <section className={panel}>
        <div className="grid divide-y divide-[#243244] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {cards.map((c) => (
            <div key={c.title} className="p-5">
              <h3 className="text-base font-semibold text-[#F1F5F9]">{c.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#94A3B8]">{c.question}</p>
              <p className="mt-4 text-3xl font-semibold tabular-nums text-[#F1F5F9]">{c.figure}</p>
              <p className="text-[13px] text-[#CBD5E1]">{c.unit}</p>
              <p className="mt-3 border-t border-[#1B2634] pt-3 text-[13px] text-[#94A3B8]">
                {c.base}. <span className={`font-semibold ${c.v.className}`}>{c.v.text}.</span>
              </p>
            </div>
          ))}
        </div>
        <p className="border-t border-[#243244] px-5 py-3 text-[13px] leading-relaxed text-[#CBD5E1]">
          <span className="font-semibold text-[#F1F5F9]">Kesimpulan.</span> Model paling berguna untuk melihat setahun ke depan.
          Untuk satu update ke depan, harga pemain jarang berubah banyak, jadi hasil model hampir sama dengan menganggap
          semuanya tetap.
        </p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Empat jenis model yang dicoba</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
            Seberapa sering tiap model benar menebak tren. Sumbunya diperbesar supaya bedanya terlihat: selisih antar model
            hanya {(spread * 100).toFixed(1).replace(".", ",")} poin, masih di dalam area kebetulan.
          </p>
          <ModelRace
            rows={candidates.map((m) => ({
              key: m.name,
              name: (MODEL_NAME[m.name] ?? { name: m.name }).name,
              note: (MODEL_NAME[m.name] ?? { note: "" }).note,
              value: m.accuracy,
              chosen: m.name === trend?.best_model,
              baseline: m.name.startsWith("Persistence"),
            }))}
            noise={trend?.validation.group_kfold[trend.best_model]?.accuracy_std ?? 0}
          />
          <p className="mt-4 text-xs leading-relaxed text-[#7C8BA1]">
            Model yang dipakai dipilih karena peluang yang diberikannya paling bisa dipercaya, bukan karena akurasinya paling
            tinggi. Pemilihan dilakukan sebelum melihat data uji.
          </p>
        </section>

        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Kenapa tidak ada angka 100% di sini</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
            Model bisa tampak sempurna kalau diberi kolom data yang diam-diam berisi jawabannya. Itu disebut bocor. Angka seperti
            itu runtuh begitu dipakai untuk pemain sungguhan, karena jawabannya belum ada.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <Waffle
              value={cleanBest.accuracy}
              tone="accent"
              title="Model jujur"
              note="hanya melihat riwayat harga sebelum tebakan"
            />
            <Waffle
              value={leakBest.accuracy}
              tone="warn"
              title="Model yang diberi bocoran"
              note="tampak sempurna, tapi tidak bisa dipakai"
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[#7C8BA1]">
            Tiap kotak satu dari 100 pemain uji; kotak berwarna berarti trennya tertebak benar (lima kelas asli dataset).
            Selisih {(preds.error_analysis.leakage_delta_acc * 100).toFixed(1).replace(".", ",")} poin itu murni dari bocoran.
            Semua angka di situs ini memakai model jujur. Rinciannya ada di tab Penjelasan &amp; Workflow.
          </p>
        </section>
      </div>

      <section className={panel}>
        <h3 className="px-5 pt-4 text-base font-semibold text-[#F1F5F9]">Data di balik angka ini</h3>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
            {[
              [fmt.int(ds.total_players), "pemain dari lima liga top Eropa"],
              [fmt.int(ds.history_rows), "catatan nilai pasar sejak 2004"],
              [fmt.int(ds.train_size), "pemain untuk melatih model"],
              [fmt.int(ds.test_size), "pemain disisihkan untuk menguji"],
            ].map(([figure, label]) => (
              <div key={label}>
                <dt className="text-2xl font-semibold tabular-nums text-[#F1F5F9]">{figure}</dt>
                <dd className="text-[13px] leading-snug text-[#94A3B8]">{label}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-[#243244] p-5 lg:border-l lg:border-t-0">
            <p className="text-[13px] text-[#CBD5E1]">Tren {fmt.int(ds.total_players)} pemain saat ini</p>
            <ul className="mt-3 space-y-2.5">
              {today.map((x) => (
                <li key={x.id} className="text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[#F1F5F9]">
                      {TREND_META[x.id].label} <span className="text-xs text-[#7C8BA1]">{TREND_META[x.id].hint}</span>
                    </span>
                    <span className="tabular-nums text-[#94A3B8]">
                      {fmt.int(x.n)} ({pct0(x.n / ds.total_players)})
                    </span>
                  </div>
                  <span className="mt-1.5 block">
                    <Bar value={x.n / maxToday} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {tasks ? (
        <details className={`${panel} group`}>
          <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-[#F1F5F9] marker:hidden">
            Rincian teknis: metrik tiap model harga
            <span className="ml-2 text-[13px] font-normal text-[#7C8BA1] group-open:hidden">buka</span>
            <span className="ml-2 hidden text-[13px] font-normal text-[#7C8BA1] group-open:inline">tutup</span>
          </summary>
          <div className="overflow-x-auto border-t border-[#243244] px-5 py-4">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-xs text-[#7C8BA1]">
                  <th className="pb-2 text-left font-normal">Tugas</th>
                  <th className="pb-2 text-left font-normal">Model</th>
                  <th className="pb-2 text-right font-normal">R² (€)</th>
                  <th className="pb-2 text-right font-normal">R² log</th>
                  <th className="pb-2 text-right font-normal">MAE</th>
                  <th className="pb-2 text-right font-normal">RMSE</th>
                  <th className="pb-2 text-right font-normal">Median APE</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(tasks).flatMap(([task, block]) =>
                  block.models.map((m) => (
                    <tr key={`${task}-${m.name}`} className="border-t border-[#1B2634]">
                      <td className="py-2 text-[#94A3B8]">{TASK_LABEL[task] ?? task}</td>
                      <td className={`py-2 ${m.name === block.best_model ? "font-semibold text-[#F1F5F9]" : "text-[#CBD5E1]"}`}>
                        {m.name}
                        {m.name === block.best_model ? " (dipakai)" : ""}
                      </td>
                      <td className="py-2 text-right tabular-nums text-[#F1F5F9]">{m.r2.toFixed(3)}</td>
                      <td className="py-2 text-right tabular-nums text-[#F1F5F9]">{m.r2_log?.toFixed(3) ?? "-"}</td>
                      <td className="py-2 text-right tabular-nums text-[#CBD5E1]">{fmt.eur(m.mae)}</td>
                      <td className="py-2 text-right tabular-nums text-[#CBD5E1]">{fmt.eur(m.rmse)}</td>
                      <td className="py-2 text-right tabular-nums text-[#CBD5E1]">{m.medape !== undefined ? pct1(m.medape) : "-"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-relaxed text-[#7C8BA1]">
              R² mendekati 1 berarti tebakan mengikuti harga asli. MAE dan RMSE adalah rata-rata selisih dalam Euro. Median APE
              adalah selisih tengah dalam persen. &quot;Naive&quot; adalah tebakan tanpa model.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
