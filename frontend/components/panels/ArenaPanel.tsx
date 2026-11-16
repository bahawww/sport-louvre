"use client";

import type { OverviewResponse, TestPredictionsResponse } from "@/lib/api";
import { fmt, toTrendModel, TREND_META } from "@/lib/format";
import {
  PageHeader,
  SectionHeader,
  Panel,
  PanelDividerGrid,
  PanelDividerCell,
  Stat,
  DataTable,
  type DataTableColumn,
  Meter,
  Disclosure,
} from "@/components/ui";

const MODEL_NAME: Record<string, { name: string; note: string }> = {
  "Ordinal HGB (calibrated)": { name: "Gradient boosting berurutan", note: "memperlakukan empat tren sebagai tangga, dari naik sampai jatuh" },
  "HistGradientBoosting (calibrated)": { name: "Gradient boosting biasa", note: "ratusan pohon keputusan kecil yang saling memperbaiki" },
  "Logistic Regression": { name: "Regresi logistik", note: "model garis lurus, paling sederhana" },
  "Random Forest": { name: "Random forest", note: "ratusan pohon keputusan yang memilih bersama" },
  "Decision Tree": { name: "Pohon keputusan", note: "satu pohon aturan ya/tidak yang bisa dibaca" },
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
  if (gain < 0) return { text: "Belum lebih baik", className: "text-warning" };
  if (gain < 0.03) return { text: "Hampir setara", className: "text-muted" };
  if (gain < 0.15) return { text: "Sedikit lebih baik", className: "text-positive" };
  return { text: "Jauh lebih baik", className: "text-positive" };
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
          <div className="py-3">
            <p className={`text-[13px] leading-tight ${r.chosen ? "font-semibold text-ink" : "text-muted"}`}>
              {r.name}
            </p>
            {r.chosen ? <p className="text-xs text-positive">dipakai</p> : null}
          </div>
          <div className="relative h-full min-h-12" title={r.note}>
            {chosen && noise > 0 ? (
              <span
                className="absolute inset-y-0 bg-primary/10"
                style={{ left: x(Math.max(lo, chosen.value - noise)), right: `calc(100% - ${x(Math.min(hi, chosen.value + noise))})` }}
              />
            ) : null}
            {base ? <span className="absolute inset-y-0 w-px bg-warning/70" style={{ left: x(base.value) }} /> : null}
            <span className="absolute left-0 right-0 top-1/2 h-px bg-border" />
            <span
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform ${
                r.chosen
                  ? "size-4 bg-primary ring-4 ring-primary/25"
                  : r.baseline
                    ? "size-3 border-2 border-warning bg-surface"
                    : "size-3 bg-muted"
              }`}
              style={{ left: x(r.value) }}
            />
          </div>
          <p className={`text-right text-[13px] tabular-nums ${r.chosen ? "font-semibold text-ink" : "text-muted"}`}>
            {pct1(r.value)}
          </p>
        </div>
      ))}
      <div className={cols}>
        <span />
        <div className="relative h-5 border-t border-border">
          {ticks.map((v, i) => (
            <span
              key={v}
              className={`absolute top-1 -translate-x-1/2 text-[11px] tabular-nums text-faint ${i % 2 ? "hidden sm:inline" : ""}`}
              style={{ left: x(v) }}
            >
              {Math.round(v * 100)}%
            </span>
          ))}
        </div>
        <span />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-warning" />
          garis yang harus dikalahkan: tanpa model
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 bg-primary/20" />
          selisih di dalam area ini masih kebetulan
        </span>
      </p>
    </div>
  );
}

/** 100 squares, one per 100 test players: filled = guessed right. */
function Waffle({ value, tone, title, note }: { value: number; tone: "accent" | "warn"; title: string; note: string }) {
  const filled = Math.round(value * 100);
  const on = tone === "accent" ? "bg-primary" : "bg-warning";
  return (
    <div>
      <div className="grid max-w-[168px] grid-cols-10 gap-[3px]" role="img" aria-label={`${filled} dari 100 pemain tertebak benar`}>
        {Array.from({ length: 100 }, (_, i) => (
          <span key={i} className={`aspect-square rounded-[2px] ${i < filled ? on : "bg-raised"}`} />
        ))}
      </div>
      <p className={`mt-3 text-2xl sm:text-[28px] font-semibold tabular-nums leading-none ${tone === "accent" ? "text-ink" : "text-warning"}`}>
        {filled} <span className="text-[13px] font-normal text-muted">dari 100</span>
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted">{note}</p>
    </div>
  );
}

interface MetricRow {
  key: string;
  task: string;
  name: string;
  isBest: boolean;
  r2: string;
  r2_log: string;
  mae: string;
  rmse: string;
  medape: string;
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
  const leakBest = toTrendModel(
    cls.leakage_mode.models.find((m) => m.name === cls.leakage_mode.best_model) ?? cls.leakage_mode.models[0],
  );
  const honestAcc = trend?.headline.metrics.accuracy ?? toTrendModel(cleanBest).accuracy;

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

  const metricRows: MetricRow[] = tasks
    ? Object.entries(tasks).flatMap(([task, block]) =>
        block.models.map((m) => ({
          key: `${task}-${m.name}`,
          task: TASK_LABEL[task] ?? task,
          name: m.name,
          isBest: m.name === block.best_model,
          r2: m.r2.toFixed(3),
          r2_log: m.r2_log !== undefined && m.r2_log !== null ? m.r2_log.toFixed(3) : "-",
          mae: fmt.eur(m.mae),
          rmse: fmt.eur(m.rmse),
          medape: m.medape !== undefined && m.medape !== null ? pct1(m.medape) : "-",
        }))
      )
    : [];

  const metricColumns: DataTableColumn<MetricRow>[] = [
    {
      key: "task",
      header: "Tugas",
      align: "left",
      cell: (row) => <span className="text-muted">{row.task}</span>,
    },
    {
      key: "name",
      header: "Model",
      align: "left",
      cell: (row) => (
        <span className={row.isBest ? "font-semibold text-ink" : "text-muted"}>
          {row.name}
          {row.isBest ? " (dipakai)" : ""}
        </span>
      ),
    },
    {
      key: "r2",
      header: "R² (€)",
      align: "right",
      cell: (row) => <span className="text-ink">{row.r2}</span>,
    },
    {
      key: "r2_log",
      header: "R² log",
      align: "right",
      cell: (row) => <span className="text-ink">{row.r2_log}</span>,
    },
    {
      key: "mae",
      header: "MAE",
      align: "right",
      cell: (row) => <span className="text-muted">{row.mae}</span>,
    },
    {
      key: "rmse",
      header: "RMSE",
      align: "right",
      cell: (row) => <span className="text-muted">{row.rmse}</span>,
    },
    {
      key: "medape",
      header: "Median APE",
      align: "right",
      cell: (row) => <span className="text-muted">{row.medape}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seberapa bagus modelnya"
        subtitle={`Model di situs ini menebak tiga hal tentang nilai pasar pemain. Tiap tebakan diuji pada ${fmt.int(ds.test_size)} pemain yang tidak pernah dilihat model, lalu dibandingkan dengan tebakan paling sederhana: menganggap tidak ada yang berubah. Model baru berguna kalau mengalahkan tebakan sederhana itu.`}
      />

      <Panel padding="none">
        <PanelDividerGrid cols={3}>
          {cards.map((c) => (
            <PanelDividerCell key={c.title}>
              <Stat
                label={c.title}
                value={c.figure}
                unit={c.unit}
                description={c.question}
                comparison={
                  <span>
                    {c.base}. <span className={`font-semibold ${c.v.className}`}>{c.v.text}.</span>
                  </span>
                }
              />
            </PanelDividerCell>
          ))}
        </PanelDividerGrid>
        <div className="border-t border-rule bg-raised/50 px-4 py-3 sm:px-5 text-[13px] text-muted leading-relaxed">
          <span className="font-semibold text-ink">Kesimpulan.</span> Model paling berguna untuk melihat setahun ke depan.
          Untuk satu update ke depan, harga pemain jarang berubah banyak, jadi hasil model hampir sama dengan menganggap
          semuanya tetap.
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Panel className="h-full flex flex-col">
          <div>
            <SectionHeader
              title="Empat jenis model yang dicoba"
              subtitle={`Seberapa sering tiap model benar menebak tren. Sumbunya diperbesar supaya bedanya terlihat: selisih antar model hanya ${(spread * 100).toFixed(1).replace(".", ",")} poin, masih di dalam area kebetulan.`}
            />
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
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Model yang dipakai dipilih karena peluang yang diberikannya paling bisa dipercaya, bukan karena akurasinya paling
            tinggi. Pemilihan dilakukan sebelum melihat data uji.
          </p>
        </Panel>

        <Panel className="h-full flex flex-col">
          <div>
            <SectionHeader
              title="Kenapa tidak ada angka 100% di sini"
              subtitle="Model bisa tampak sempurna kalau diberi kolom data yang diam-diam berisi jawabannya. Itu disebut bocor. Angka seperti itu runtuh begitu dipakai untuk pemain sungguhan, karena jawabannya belum ada."
            />
            <div className="mt-5 grid grid-cols-2 gap-5">
              <Waffle
                value={honestAcc}
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
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Tiap kotak satu dari 100 pemain uji; kotak berwarna berarti trennya tertebak benar.
            Selisih {((leakBest.accuracy - honestAcc) * 100).toFixed(1).replace(".", ",")} poin itu murni dari bocoran.
            Semua angka di situs ini memakai model jujur. Rinciannya ada di tab Penjelasan &amp; Workflow.
          </p>
        </Panel>
      </div>

      <Panel>
        <SectionHeader title="Data di balik angka ini" />
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 lg:gap-8 items-start">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
            {[
              { value: fmt.int(ds.total_players), label: "pemain dari lima liga top Eropa" },
              { value: fmt.int(ds.history_rows), label: "catatan nilai pasar sejak 2004" },
              { value: fmt.int(ds.train_size), label: "pemain untuk melatih model" },
              { value: fmt.int(ds.test_size), label: "pemain disisihkan untuk menguji" },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col">
                <dt className="text-2xl sm:text-[26px] font-semibold tabular-nums text-ink leading-tight">
                  {value}
                </dt>
                <dd className="mt-1 text-[13px] leading-snug text-muted">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-rule pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="text-[13px] font-medium text-ink mb-3.5">
              Tren {fmt.int(ds.total_players)} pemain saat ini
            </p>
            <div className="space-y-3">
              {today.map((x) => {
                const meta = TREND_META[x.id];
                return (
                  <Meter
                    key={x.id}
                    value={x.n}
                    max={maxToday}
                    label={meta.label}
                    sublabel={meta.hint}
                    valueText={`${fmt.int(x.n)} (${pct0(x.n / ds.total_players)})`}
                    tone="mint"
                    height="sm"
                  />
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {tasks ? (
        <Disclosure title="Rincian teknis: metrik tiap model harga" summary="buka">
          <DataTable
            columns={metricColumns}
            rows={metricRows}
            rowKey={(r) => r.key}
            ariaLabel="Rincian teknis metrik tiap model harga"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted">
            R² mendekati 1 berarti tebakan mengikuti harga asli. MAE dan RMSE adalah rata-rata selisih dalam Euro. Median APE
            adalah selisih tengah dalam persen. &quot;Naive&quot; adalah tebakan tanpa model.
          </p>
        </Disclosure>
      ) : null}
    </div>
  );
}
