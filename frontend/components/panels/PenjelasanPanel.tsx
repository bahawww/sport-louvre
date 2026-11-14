"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  fetchApi,
  type FeatureImportanceItem,
  type OverviewResponse,
  type SimulateResponse,
} from "@/lib/api";
import { fmt, TREND_META } from "@/lib/format";

import { WorkflowRoadmap } from "./WorkflowRoadmap";

/** The player whose real price history explains the four models. */
const EXAMPLE_PLAYER_ID = "148455"; // Mohamed Salah: a full career arc, 41 valuations

type ModelId = "forecast" | "trend" | "outlook" | "fundamental";

const MODELS: { id: ModelId; label: string }[] = [
  { id: "forecast", label: "Harga berikutnya" },
  { id: "trend", label: "Tren" },
  { id: "outlook", label: "12 bulan ke depan" },
  { id: "fundamental", label: "Nilai wajar" },
];

const FEATURE_LABEL: Record<string, string> = {
  log_last: "Harga terakhir",
  log_prev: "Harga sebelum itu",
  log_peak: "Nilai puncak karier",
  log_first: "Harga pertama tercatat",
  log_mean: "Rata-rata harga",
  dd_last: "Jarak dari puncak",
  dd_prev: "Jarak dari puncak (update lalu)",
  dd_delta: "Perubahan jarak dari puncak",
  range_pos: "Posisi di rentang harga karier",
  horizon_yr: "Jarak ke update berikutnya",
  ret1: "Perubahan harga terakhir",
  ret1_ann: "Laju perubahan terakhir",
  age: "Usia",
  age_at_peak: "Usia saat puncak",
  span_yr: "Lama riwayat harga",
  n_points: "Jumlah valuasi",
  league_name: "Liga",
  position: "Posisi",
  nationality: "Kebangsaan",
  yrs_since_peak: "Lama sejak puncak",
  anc_log_peak: "Nilai puncak setahun lalu",
  anc_dd: "Jarak dari puncak setahun lalu",
  anc_n_points: "Jumlah valuasi setahun lalu",
  anc_log_mean: "Rata-rata harga setahun lalu",
  anc_slope_log: "Arah harga setahun lalu",
  anc_lag_yr: "Usia data yang dipakai",
};

const DAY = 86_400_000;
const ms = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const num = (x: number) => new Intl.NumberFormat("id-ID").format(Math.round(x));
const dateId = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(iso.length > 10 ? iso : `${iso}T00:00:00Z`),
  );

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** One real price history; what the chosen model may see, and what it has to guess. */
function HistoryChart({ sim, model }: { sim: SimulateResponse; model: ModelId }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const p = sim.player!;
  const outlook = sim.outlook_12m ?? null;
  const height = width < 520 ? 260 : 320;
  const pad = { l: 52, r: width < 520 ? 12 : 16, t: 14, b: 26 };

  const hist = p.history.map((h) => ({ t: ms(h.date), v: h.value_eur }));
  const last = hist[hist.length - 1];
  const tForecast = ms(p.forecast_date);
  const tOutlook = last.t + 365 * DAY;
  const anchorCut = last.t - 365 * DAY;

  const target =
    model === "outlook" && outlook
      ? { t: tOutlook, v: outlook.expected_value_eur, lo: outlook.expected_range_eur[0], hi: outlook.expected_range_eur[1] }
      : model === "fundamental" && sim.fair_value_eur !== undefined && sim.fair_value_range_eur
        ? { t: last.t, v: sim.fair_value_eur, lo: sim.fair_value_range_eur[0], hi: sim.fair_value_range_eur[1] }
        : { t: tForecast, v: sim.predicted_value_eur, lo: sim.value_range_eur[0], hi: sim.value_range_eur[1] };

  const t0 = hist[0].t;
  const t1 = Math.max(tOutlook, tForecast) + 60 * DAY;
  const vMax = Math.max(p.peak_value_eur, target.hi) * 1.06;
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / vMax) * (height - pad.t - pad.b);
  const path = (pts: { t: number; v: number }[]) =>
    pts.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)} ${y(q.v).toFixed(1)}`).join(" ");

  const seen = model === "fundamental" ? hist.filter((h) => h.t <= anchorCut) : hist;
  const hidden = model === "fundamental" ? hist.filter((h) => h.t >= (seen.at(-1)?.t ?? t0)) : [];
  const from = seen.at(-1) ?? last;

  const step = vMax > 120e6 ? 50e6 : vMax > 40e6 ? 20e6 : 5e6;
  const ticks = Array.from({ length: Math.floor(vMax / step) + 1 }, (_, i) => i * step);
  const years: number[] = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr += width < 520 ? 2 : 1) {
    years.push(yr);
  }

  const bands =
    model === "trend"
      ? [
          { id: "rising", lo: 0.8, hi: vMax / p.peak_value_eur },
          { id: "stable", lo: 0.7, hi: 0.8 },
          { id: "declining", lo: 0.4, hi: 0.7 },
          { id: "falling_sharply", lo: 0, hi: 0.4 },
        ]
      : [];
  const labelLeft = x(target.t) > width - 130;

  return (
    <div ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Riwayat nilai pasar ${p.name} dan tebakan model`}
        className="block"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="#1B2634" strokeWidth="1" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7C8BA1">
              {v === 0 ? "0" : `€${v / 1e6}M`}
            </text>
          </g>
        ))}
        {years.map((yr) => (
          <text key={yr} x={x(Date.UTC(yr, 0, 1))} y={height - 8} textAnchor="middle" fontSize="11" fill="#7C8BA1">
            {yr}
          </text>
        ))}

        {bands.map((b, i) => {
          const top = y(Math.min(b.hi * p.peak_value_eur, vMax));
          const bottom = y(b.lo * p.peak_value_eur);
          const prob = sim.trend_probabilities?.[b.id] ?? 0;
          return (
            <g key={b.id}>
              <rect
                x={pad.l}
                y={top}
                width={width - pad.r - pad.l}
                height={bottom - top}
                fill={i % 2 === 0 ? "#162130" : "#0F1721"}
              />
              {bottom - top >= 13 ? (
                <text x={pad.l + 8} y={Math.min(bottom - 5, top + 15)} fontSize="11" fill="#CBD5E1">
                  {width < 520 ? TREND_META[b.id].label.split(" / ")[0] : TREND_META[b.id].label} {pct0(prob)}
                </text>
              ) : null}
            </g>
          );
        })}

        {model === "fundamental" && hidden.length > 1 ? (
          <>
            <rect
              x={x(anchorCut)}
              y={pad.t}
              width={x(last.t) - x(anchorCut)}
              height={height - pad.t - pad.b}
              fill="#111923"
            />
            <path d={path(hidden)} fill="none" stroke="#56657A" strokeWidth="1.5" strokeDasharray="3 4" />
            <text x={x(last.t) - 6} y={height - pad.b - 8} textAnchor="end" fontSize="11" fill="#94A3B8">
              12 bulan terakhir disembunyikan
            </text>
          </>
        ) : null}

        <path d={path(seen)} fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinejoin="round" />
        <line
          x1={x(from.t)}
          y1={y(from.v)}
          x2={x(target.t)}
          y2={y(target.v)}
          stroke="#10B981"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <line x1={x(target.t)} x2={x(target.t)} y1={y(target.hi)} y2={y(target.lo)} stroke="#10B981" strokeWidth="6" strokeOpacity="0.28" />
        <circle cx={x(target.t)} cy={y(target.v)} r="5" fill="#10B981" />
        <circle cx={x(last.t)} cy={y(last.v)} r="3.5" fill="#E2E8F0" />

        <text
          x={labelLeft ? x(target.t) + 4 : x(target.t) + 10}
          y={target.v < from.v ? Math.min(height - pad.b - 4, y(target.lo) + 16) : Math.max(pad.t + 12, y(target.hi) - 8)}
          textAnchor={labelLeft ? "end" : "start"}
          fontSize="12"
          fontWeight="600"
          fill="#10B981"
        >
          {fmt.eurShort(target.v)}
        </text>
      </svg>
    </div>
  );
}

function BarList({ items }: { items: FeatureImportanceItem[] }) {
  const top = items.filter((i) => i.importance >= 0.01).slice(0, 5);
  const max = top[0]?.importance ?? 1;
  if (top.length === 1) {
    return (
      <p className="mt-1 text-[13px] leading-relaxed text-[#CBD5E1]">
        {FEATURE_LABEL[top[0].feature] ?? top[0].feature}, {pct0(top[0].importance)}. Fitur lain masing-masing di bawah 1%.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1.5">
      {top.map((i) => (
        <li key={i.feature} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[13px]">
          <span className="truncate text-[#CBD5E1]">{FEATURE_LABEL[i.feature] ?? i.feature}</span>
          <span className="text-right tabular-nums text-[#94A3B8]">{pct0(i.importance)}</span>
          <span className="col-span-2 h-1 rounded-full bg-[#1B2634]">
            <span className="block h-1 rounded-full bg-[#64748B]" style={{ width: `${(i.importance / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Verdict({ good, children }: { good: boolean; children: React.ReactNode }) {
  return <span className={good ? "text-[#34D399]" : "text-[#FBBF24]"}>{children}</span>;
}

export function PenjelasanPanel({ overview }: { overview: OverviewResponse }) {
  const [model, setModel] = useState<ModelId>("forecast");
  const example = useQuery({
    queryKey: ["penjelasan-example", EXAMPLE_PLAYER_ID],
    queryFn: () =>
      fetchApi<SimulateResponse>("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: EXAMPLE_PLAYER_ID }),
      }),
  });

  const ds = overview.dataset as OverviewResponse["dataset"] & { panel_rows?: number; train_rows?: number };
  const tasks = overview.regression.tasks;
  const trend = overview.classification.trend;
  const clean = overview.classification.clean_mode;
  const cleanBest = clean.models.find((m) => m.name === clean.best_model) ?? clean.models[0];
  const ov = overview.outlook?.validation;
  const leak = overview.leak_audit;
  const card = overview.data_card;
  const mc = overview.model_card;
  const oot = overview.out_of_time;
  const fc = tasks?.forecast.headline;
  const fcBest = tasks?.forecast.models.find((m) => m.name === tasks.forecast.best_model);
  const fdBest = tasks?.fundamental.models.find((m) => m.name === tasks.fundamental.best_model);
  const fc50 = (fc as unknown as { value_ge_50m?: { n: number; metrics: Record<string, number>; naive_last_value: Record<string, number> } })
    ?.value_ge_50m;

  const sim = example.data;
  const p = sim?.player;
  const outlook = sim?.outlook_12m ?? null;

  const detail: Record<ModelId, { question: string; sees: string; guesses: string; result: React.ReactNode; tested: React.ReactNode; features: FeatureImportanceItem[] }> = {
    forecast: {
      question: "Berapa nilainya di update harga berikutnya?",
      sees: "Seluruh riwayat harga sampai hari ini, usia, posisi, liga.",
      guesses: "Nilai pasar di update berikutnya, beserta rentang 80%.",
      result: sim ? (
        <>
          {fmt.eur(sim.predicted_value_eur)}, rentang {fmt.eurShort(sim.value_range_eur[0])} sampai{" "}
          {fmt.eurShort(sim.value_range_eur[1])}
        </>
      ) : null,
      tested: fc ? (
        <>
          Galat log {fc.metrics.rmse_log.toFixed(3).replace(".", ",")} lawan {fc.naive_last_value.rmse_log.toFixed(3).replace(".", ",")}{" "}
          untuk tebakan &quot;harga tidak berubah&quot;.{" "}
          <Verdict good={fc.beats_naive_eur}>
            {fc.beats_naive_eur
              ? "Dalam Euro juga lebih baik."
              : `Dalam Euro belum lebih baik: meleset rata-rata ${fmt.eur(fc.metrics.mae)} lawan ${fmt.eur(fc.naive_last_value.mae)}.`}
          </Verdict>
        </>
      ) : null,
      features: fcBest?.feature_importance ?? [],
    },
    trend: {
      question: "Di update berikutnya, seberapa jauh ia dari puncak kariernya?",
      sees: "Sama dengan model harga: seluruh riwayat sampai hari ini.",
      guesses: "Peluang masuk tiap pita: dekat puncak, stabil, menurun, jatuh tajam.",
      result: sim?.predicted_trend ? (
        <>
          {TREND_META[sim.predicted_trend].label}, peluang {pct0(sim.trend_probabilities?.[sim.predicted_trend] ?? 0)}.{" "}
          {(sim.trend_probabilities?.[sim.predicted_trend] ?? 0) < 0.6
            ? "Tebakan harganya jatuh dekat batas dua pita, jadi peluangnya terbelah."
            : "Tebakan harganya jauh dari batas pita, jadi model cukup yakin."}
        </>
      ) : null,
      tested: trend ? (
        <>
          Benar {pct1(trend.headline.metrics.accuracy)} lawan {pct1(trend.headline.persistence.accuracy)} untuk tebakan
          &quot;pita tidak berubah&quot;.{" "}
          <Verdict good>Unggul {trend.headline.gain_vs_persistence.accuracy_pp.toFixed(1).replace(".", ",")} poin.</Verdict> Dengan 5
          kelas asli dataset: {pct1(cleanBest.accuracy)}.
        </>
      ) : null,
      features: cleanBest.feature_importance,
    },
    outlook: {
      question: "Setahun lagi, nilainya naik atau turun?",
      sees: "Seluruh riwayat sampai hari ini. Dilatih dari pasangan riwayat dan harga setahun kemudian.",
      guesses: "Peluang naik atau turun lebih dari 5%, dan nilai yang diharapkan.",
      result: outlook ? (
        <>
          {fmt.eur(outlook.expected_value_eur)}. Peluang turun {pct0(outlook.p_down)}, naik {pct0(outlook.p_up)}. Sinyal hanya
          keluar bila peluangnya minimal 70%.
        </>
      ) : null,
      tested: ov ? (
        <>
          Dari {ov.buy.n} sinyal beli, {pct0(ov.buy.went_up ?? 0)} benar naik; angka dasarnya {pct0(ov.base_rate.up)}. Dari{" "}
          {ov.depreciation_risk.n} sinyal risiko, {pct0(ov.depreciation_risk.went_down ?? 0)} benar turun; angka dasarnya{" "}
          {pct0(ov.base_rate.down)}.
        </>
      ) : null,
      features: ov?.feature_importance ?? [],
    },
    fundamental: {
      question: "Berapa nilainya kalau harga setahun terakhir tidak dilihat?",
      sees: "Riwayat sampai 12 bulan lalu saja, ditambah usia, posisi, liga.",
      guesses: "Nilai hari ini. Rentangnya lebar karena sengaja dibutakan.",
      result:
        sim?.fair_value_eur !== undefined && sim.fair_value_range_eur ? (
          <>
            {fmt.eur(sim.fair_value_eur)}, rentang {fmt.eurShort(sim.fair_value_range_eur[0])} sampai{" "}
            {fmt.eurShort(sim.fair_value_range_eur[1])}
          </>
        ) : null,
      tested: fdBest ? (
        <>
          R² {fdBest.r2.toFixed(2).replace(".", ",")}.{" "}
          <Verdict good={false}>Tidak dipakai untuk rekomendasi:</Verdict> harga yang jatuh jauh di bawah angka ini biasanya
          lanjut turun, bukan murah.
        </>
      ) : null,
      features: fdBest?.feature_importance ?? [],
    },
  };
  const d = detail[model];

  const repairs = (card?.repairs ?? {}) as Record<string, number>;
  const calRows = tasks?.forecast.intervals.n_calibration;
  const candidates = clean.models.filter((m) => !m.name.startsWith("Persistence")).length;
  const features = tasks?.forecast.features.length;
  const workflow: { stage: string; code: string; does: string; figure: string; unit: string }[] = [
    {
      stage: "Baca dua CSV",
      code: "load_data()",
      does: "transfermarkt_player_values.csv berisi satu baris per pemain. transfermarkt_value_history.csv berisi satu baris per valuasi.",
      figure: num(ds.history_rows),
      unit: `valuasi, ${num(ds.total_players)} pemain`,
    },
    {
      stage: "Bersihkan",
      code: "load_data()",
      does: `Valuasi nol atau negatif dibuang (${num(repairs.history_rows_dropped_nonpositive ?? 0)}). Posisi ${num(repairs.positions_repaired_from_sidecar ?? 0)} pemain lama yang kolomnya bergeser diperbaiki dari player_profile_patch.csv. Usia diambil dari riwayat, bukan dari kolom CSV.`,
      figure: card ? num(card.valuation_points) : "-",
      unit: "valuasi dipakai",
    },
    {
      stage: "Potong riwayat jadi soal",
      code: "build_panel()",
      does: "Untuk tiap update harga: semua valuasi sebelumnya jadi bahan, harga update itu jadi jawaban. Satu pemain menyumbang banyak soal.",
      figure: ds.panel_rows ? num(ds.panel_rows) : "-",
      unit: "soal",
    },
    {
      stage: "Hitung fitur",
      code: "features.py",
      does: "Harga terakhir, jarak dari puncak, arah dan laju perubahan, usia, lama karier, ditambah liga, posisi, kebangsaan. Semua dihitung dari bahan saja. Kolom ringkasan CSV tidak dipakai karena memuat jawaban.",
      figure: features ? num(features) : "-",
      unit: "fitur per soal",
    },
    {
      stage: "Pisahkan pemain uji",
      code: "train_test_split",
      does: "Pembagian per pemain, bukan per baris, supaya soal dari pemain yang sama tidak ada di dua sisi.",
      figure: num(ds.test_size),
      unit: `pemain uji, ${num(ds.train_size)} latih`,
    },
    {
      stage: "Pilih jenis model",
      code: "GroupKFold(5)",
      does: `${candidates} kandidat dibandingkan lewat validasi silang di pemain latih saja. Data uji tidak disentuh. Terpilih: ${clean.best_model} untuk tren, ${tasks?.forecast.best_model ?? "-"} untuk harga.`,
      figure: num(candidates),
      unit: "kandidat",
    },
    {
      stage: "Latih",
      code: "train_all()",
      does: `Model harga, tren, dan nilai wajar belajar dari soal sejak 2021. Model 12 bulan punya soal sendiri: riwayat, lalu harga setahun kemudian${overview.outlook ? ` (${num(overview.outlook.train_rows)} soal sejak 2019)` : ""}.`,
      figure: ds.train_rows ? num(ds.train_rows) : "-",
      unit: "soal latih",
    },
    {
      stage: "Kalibrasi",
      code: "fit_conformal()",
      does: "Peluang dikalibrasi supaya 70% benar-benar berarti 70 dari 100. Rentang harga dikoreksi pada pemain yang tidak ikut melatih, sampai 8 dari 10 harga asli masuk di dalamnya.",
      figure: calRows ? num(calRows) : "-",
      unit: "soal kalibrasi",
    },
    {
      stage: "Uji",
      code: "report.py",
      does: `Sekali pada pemain uji, sekali lagi ke masa depan: model dilatih hanya dari data sebelum ${oot ? dateId(oot.cutoff) : "-"} lalu menebak update sesudahnya.`,
      figure: oot ? num(oot.sets.unseen_players_future.rows) : "-",
      unit: "update masa depan",
    },
    {
      stage: "Sajikan",
      code: "main.py",
      does: "Model disimpan dan dipakai API. Simulator menghitung fitur dengan kode yang sama dengan saat melatih. Dilatih ulang hanya kalau data atau kode berubah.",
      figure: mc ? num(mc.training_seconds / 60) : "-",
      unit: "menit sekali latih",
    },
  ];

  const prev = leak?.previous_pipeline?.reported_clean_classifier.accuracy;
  const prevSim = leak?.previous_pipeline?.simulate_endpoint_classifier.accuracy;
  const leakRows = leak
    ? [
        ...(prev ? [{ name: "Pipeline lama", note: "memakai kolom ringkasan CSV", value: prev, bad: true }] : []),
        ...(prevSim
          ? [{ name: "Simulator lama", note: "fiturnya ditebak dari form, tidak sama dengan saat melatih", value: prevSim, bad: true }]
          : []),
        {
          name: "Uji ulang tanpa 4 kolom itu",
          note: "model pembanding, hanya riwayat sebelum target",
          value: leak.contamination_test.without_csv_columns.accuracy,
          bad: false,
        },
        {
          name: "Uji ulang dengan 4 kolom itu",
          note: "model yang sama, kolom bocor ditambahkan",
          value: leak.contamination_test.with_csv_columns.accuracy,
          bad: true,
        },
      ]
    : [];

  const scoreRows = [
    trend && {
      name: "Tren, 4 kelas",
      unit: "benar",
      model: pct1(trend.headline.metrics.accuracy),
      base: pct1(trend.headline.persistence.accuracy),
      good: trend.headline.metrics.accuracy > trend.headline.persistence.accuracy,
    },
    fc && {
      name: "Harga berikutnya, skala log",
      unit: "galat",
      model: fc.metrics.rmse_log.toFixed(3).replace(".", ","),
      base: fc.naive_last_value.rmse_log.toFixed(3).replace(".", ","),
      good: fc.beats_naive_log,
    },
    fc && {
      name: "Harga berikutnya, Euro",
      unit: "meleset rata-rata",
      model: fmt.eur(fc.metrics.mae),
      base: fmt.eur(fc.naive_last_value.mae),
      good: fc.metrics.mae < fc.naive_last_value.mae,
    },
    fc50 && {
      name: `Harga berikutnya, pemain ≥ €50M (${fc50.n})`,
      unit: "meleset rata-rata",
      model: fmt.eur(fc50.metrics.mae),
      base: fmt.eur(fc50.naive_last_value.mae),
      good: fc50.metrics.mae < fc50.naive_last_value.mae,
    },
    ov && {
      name: "12 bulan, sinyal beli",
      unit: "benar naik",
      model: pct0(ov.buy.went_up ?? 0),
      base: pct0(ov.base_rate.up),
      good: true,
    },
    ov && {
      name: "12 bulan, sinyal risiko",
      unit: "benar turun",
      model: pct0(ov.depreciation_risk.went_down ?? 0),
      base: pct0(ov.base_rate.down),
      good: true,
    },
  ].filter(Boolean) as { name: string; unit: string; model: string; base: string; good: boolean }[];

  const panel = "rounded-xl border border-[#243244] bg-[#121A24]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-[#F1F5F9]">Cara kerja model</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#CBD5E1]">
            Semua model di situs ini belajar dari satu hal: riwayat nilai pasar pemain. Tidak ada data gol, menit bermain,
            cedera, atau kontrak. Di bawah ini satu riwayat asli, dan apa yang ditebak tiap model darinya.
          </p>
        </div>
        {mc && card ? (
          <p className="text-xs text-[#7C8BA1]">
            Data sampai {dateId(card.data_as_of)} · dilatih {dateId(mc.trained_at)} · versi {mc.version.slice(0, 7)}
          </p>
        ) : null}
      </div>

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#243244] px-5 py-3">
          <div role="tablist" aria-label="Pilih model" className="inline-flex flex-wrap gap-1 rounded-lg bg-[#0B1117] p-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                role="tab"
                type="button"
                aria-selected={model === m.id}
                onClick={() => setModel(m.id)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  model === m.id ? "bg-[#243244] text-[#F1F5F9]" : "text-[#94A3B8] hover:text-[#F1F5F9]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94A3B8]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-[#E2E8F0]" />
              Dilihat model
            </span>
            {model === "fundamental" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-[#7C8BA1]" />
                Disembunyikan
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#10B981]" />
              Ditebak, dengan rentang 80%
            </span>
          </p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <div className="min-w-0 p-5">
            {p ? (
              <p className="mb-3 text-[13px] text-[#94A3B8]">
                <span className="font-semibold text-[#F1F5F9]">{p.name}</span>, {p.position}, {p.age} tahun. Nilai sekarang{" "}
                <span className="font-semibold text-[#F1F5F9]">{fmt.eur(p.last_value_eur)}</span>, puncak{" "}
                {fmt.eur(p.peak_value_eur)}. {p.history.length} valuasi sejak {p.history[0].date.slice(0, 4)}.
              </p>
            ) : null}
            {sim?.player ? (
              <HistoryChart sim={sim} model={model} />
            ) : (
              <p className="py-24 text-center text-[13px] text-[#94A3B8]">
                {example.isError ? "Contoh pemain gagal dimuat." : "Memuat riwayat harga..."}
              </p>
            )}
          </div>

          <div className="border-t border-[#243244] p-5 lg:border-l lg:border-t-0">
            <h3 className="text-base font-semibold leading-snug text-[#F1F5F9]">{d.question}</h3>
            <dl className="mt-4 space-y-3 text-[13px] leading-relaxed">
              <div>
                <dt className="text-[#7C8BA1]">Yang dilihat</dt>
                <dd className="text-[#CBD5E1]">{d.sees}</dd>
              </div>
              <div>
                <dt className="text-[#7C8BA1]">Yang ditebak</dt>
                <dd className="text-[#CBD5E1]">{d.guesses}</dd>
              </div>
              <div>
                <dt className="text-[#7C8BA1]">Untuk pemain ini</dt>
                <dd className="text-[#F1F5F9]">{d.result ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-[#7C8BA1]">Hasil uji</dt>
                <dd className="text-[#CBD5E1]">{d.tested ?? "-"}</dd>
              </div>
            </dl>
            <h4 className="mt-5 text-[13px] text-[#7C8BA1]">Paling menentukan tebakan</h4>
            <BarList items={d.features} />
          </div>
        </div>
      </section>

      <section className={panel}>
        <div className="px-5 pt-4">
          <h3 className="text-base font-semibold text-[#F1F5F9]">Alur kerja dari CSV sampai model</h3>
          <p className="mt-1 text-[13px] text-[#94A3B8]">
            Sepuluh tahap yang dijalankan tiap kali model dilatih. Pilih satu tahap untuk melihat apa yang terjadi pada data.
          </p>
        </div>
        <WorkflowRoadmap steps={workflow} overview={overview} sim={sim} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Kenapa akurasi lama 85% tidak dipakai</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-[#CBD5E1]">
            Kolom ringkasan di CSV seperti <code className="text-[#F1F5F9]">peak_value_eur</code> dihitung dari seluruh riwayat,
            termasuk harga yang sedang ditebak.
            {leak
              ? ` Pada ${pct1(leak.share_players_target_exposed)} pemain, kolom itu adalah jawabannya sendiri, dan aturan "nilai puncak naik" menebak kelas rising_star dengan tepat ${pct0(leak.rule_accuracy)}.`
              : ""}{" "}
            Model sekarang hanya menghitung fitur dari riwayat sebelum harga target.
          </p>
          <table className="mt-4 w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-[#7C8BA1]">
                <th className="pb-2 font-normal">Akurasi 5 kelas</th>
                <th className="pb-2 text-right font-normal">Benar</th>
              </tr>
            </thead>
            <tbody>
              {leakRows.map((r) => (
                <tr key={r.name} className="border-t border-[#1B2634]">
                  <td className="py-2.5 pr-3">
                    <span className="text-[#F1F5F9]">{r.name}</span>
                    <span className="block text-xs text-[#7C8BA1]">{r.note}</span>
                    <span className="mt-1.5 block h-1 rounded-full bg-[#1B2634]">
                      <span
                        className={`block h-1 rounded-full ${r.bad ? "bg-[#F59E0B]" : "bg-[#10B981]"}`}
                        style={{ width: `${r.value * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className={`py-2.5 text-right align-top tabular-nums ${r.bad ? "text-[#FBBF24]" : "text-[#F1F5F9]"}`}>
                    {pct1(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {leak ? (
            <p className="mt-3 text-xs leading-relaxed text-[#7C8BA1]">
              Kuning berarti angkanya tidak bisa dipercaya: terbantu bocoran, atau fiturnya tidak sama dengan saat melatih. Empat
              kolom yang diuji: {leak.contamination_test.columns_added.join(", ")}.
            </p>
          ) : null}
        </section>

        <section className={`${panel} p-5`}>
          <h3 className="text-base font-semibold text-[#F1F5F9]">Model lawan tebakan tanpa model</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-[#CBD5E1]">
            Tebakan tanpa model berarti menganggap tidak ada yang berubah. Angka model baru berarti kalau mengalahkan itu.
          </p>
          <table className="mt-4 w-full text-[13px]">
            <thead>
              <tr className="text-xs text-[#7C8BA1]">
                <th className="pb-2 text-left font-normal">Tugas</th>
                <th className="pb-2 text-right font-normal">Model</th>
                <th className="pb-2 text-right font-normal">Tanpa model</th>
              </tr>
            </thead>
            <tbody>
              {scoreRows.map((r) => (
                <tr key={r.name} className="border-t border-[#1B2634]">
                  <td className="py-2.5 pr-3 text-[#F1F5F9]">
                    {r.name}
                    <span className="block text-xs text-[#7C8BA1]">{r.unit}</span>
                  </td>
                  <td className={`py-2.5 text-right align-top tabular-nums ${r.good ? "text-[#34D399]" : "text-[#FBBF24]"}`}>
                    {r.model}
                  </td>
                  <td className="py-2.5 text-right align-top tabular-nums text-[#94A3B8]">{r.base}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-[#7C8BA1]">
            Hijau berarti model lebih baik, kuning berarti belum. Semua diukur pada {num(ds.test_size)} pemain uji, kecuali baris 12
            bulan yang diuji pada update setelah pertengahan 2024.
          </p>
        </section>
      </div>

      <section className={`${panel} p-5`}>
        <h3 className="text-base font-semibold text-[#F1F5F9]">Yang tidak bisa dijawab model ini</h3>
        <ul className="mt-3 grid gap-x-8 gap-y-2.5 text-[13px] leading-relaxed text-[#CBD5E1] md:grid-cols-2 xl:grid-cols-3">
          <li>
            <span className="font-semibold text-[#F1F5F9]">Kualitas bermain.</span> Yang ditebak adalah nilai pasar Transfermarkt,
            bukan harga transfer dan bukan performa.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Lonjakan atau cedera mendadak.</span> Tidak ada data pertandingan,
            jadi model baru tahu setelah harganya berubah.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Pindah klub.</span> Riwayat klub di data hanya benar untuk 508 dari{" "}
            {num(ds.total_players)} pemain.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Pemain di luar daftar.</span> Data hanya berisi pemain yang pada 2025
            sudah di liga top, sehingga proyeksi pemain muda cenderung terlalu optimistis.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Rentang pemain di atas €50M.</span> Hanya 59 sampai 67% harga asli
            yang masuk rentang, padahal targetnya 80%.
          </li>
          <li>
            <span className="font-semibold text-[#F1F5F9]">Performa musim lalu.</span> Sudah dicoba ditambahkan (penampilan, gol,
            transfer, cedera) dan tidak menaikkan akurasi: harga sudah memuatnya.
          </li>
        </ul>
      </section>

      <section className={`${panel} p-5`}>
        <h3 className="text-base font-semibold text-[#F1F5F9]">Istilah yang dipakai di situs ini</h3>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-[13px] leading-relaxed sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Update harga", "Satu kali Transfermarkt merevisi nilai pasar pemain. Rata-rata tiap lima bulan."],
            ["Tren 4 kelas", "Posisi harga terhadap puncak karier: dekat puncak, 20 sampai 30% di bawah, 30 sampai 60% di bawah, atau lebih."],
            ["Tebakan tanpa model", "Menganggap harga atau kelasnya sama seperti terakhir. Pembanding wajib untuk setiap angka."],
            ["Bocor (leakage)", "Fitur yang diam-diam memuat jawaban. Akurasi tampak tinggi tapi tidak berlaku untuk masa depan."],
            ["Rentang 80%", "Batas bawah dan atas tebakan. Dikalibrasi supaya 8 dari 10 harga asli jatuh di dalamnya."],
            ["Uji ke masa depan", "Model dilatih hanya dari data sebelum satu tanggal, lalu diuji pada update sesudahnya."],
            ["Skala log", "Mengukur selisih dalam persen, bukan Euro, supaya pemain murah dan mahal dinilai setara."],
            ["Sinyal beli / risiko", "Hanya muncul kalau peluang naik atau turun lebih dari 5% dalam setahun minimal 70%."],
          ].map(([term, desc]) => (
            <div key={term}>
              <dt className="font-semibold text-[#F1F5F9]">{term}</dt>
              <dd className="text-[#94A3B8]">{desc}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
