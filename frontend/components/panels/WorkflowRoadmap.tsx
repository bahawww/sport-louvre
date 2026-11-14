"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { OverviewResponse, SimulateResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export interface WorkflowStep {
  stage: string;
  code: string;
  does: string;
  figure: string;
  unit: string;
}

const PHASES = [
  { label: "Siapkan data", from: 0, to: 3 },
  { label: "Latih", from: 4, to: 7 },
  { label: "Uji dan sajikan", from: 8, to: 9 },
];

const num = (x: number) => new Intl.NumberFormat("id-ID").format(Math.round(x));
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

/** A labelled horizontal bar split into parts; widths follow the real counts. */
function SplitBar({ parts }: { parts: { label: string; value: number; tone: "main" | "accent" | "muted" }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const tone = { main: "bg-[#CBD5E1]", accent: "bg-[#10B981]", muted: "bg-[#3B4A5E]" };
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.label} className={tone[p.tone]} style={{ width: `${Math.max(1.5, (p.value / total) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#94A3B8]">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${tone[p.tone]}`} />
            <span className="tabular-nums text-[#F1F5F9]">{num(p.value)}</span> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-[#1B2634] text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className="text-[#94A3B8]">{k}</dt>
          <dd className="text-right tabular-nums text-[#F1F5F9]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Step 3: drag the cut along one real history. Left of the cut is the input, the next point is the answer. */
function CutIllustration({ sim }: { sim: SimulateResponse }) {
  const hist = sim.player!.history;
  const [cut, setCut] = useState(Math.round(hist.length * 0.55));
  const W = 440;
  const H = 150;
  const t0 = new Date(hist[0].date).getTime();
  const t1 = new Date(hist[hist.length - 1].date).getTime();
  const vMax = Math.max(...hist.map((h) => h.value_eur)) * 1.08;
  const x = (d: string) => 6 + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - 12);
  const y = (v: number) => 8 + (1 - v / vMax) * (H - 18);
  const path = (pts: typeof hist) => pts.map((h, i) => `${i ? "L" : "M"}${x(h.date).toFixed(1)} ${y(h.value_eur).toFixed(1)}`).join(" ");
  const answer = hist[cut];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Riwayat harga dipotong menjadi bahan dan jawaban">
        <rect x={x(answer.date)} y={0} width={W - x(answer.date)} height={H} fill="#0F1721" />
        <path d={path(hist.slice(cut))} fill="none" stroke="#3B4A5E" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d={path(hist.slice(0, cut))} fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinejoin="round" />
        <line x1={x(answer.date)} x2={x(answer.date)} y1={0} y2={H} stroke="#10B981" strokeWidth="1" />
        <circle cx={x(answer.date)} cy={y(answer.value_eur)} r="5" fill="#10B981" />
      </svg>
      <input
        type="range"
        min={1}
        max={hist.length - 1}
        value={cut}
        onChange={(e) => setCut(Number(e.target.value))}
        aria-label="Geser titik potong"
        className="mt-2 w-full accent-[#10B981]"
      />
      <p className="mt-1 text-[13px] leading-relaxed text-[#94A3B8]">
        Soal ke-{cut} dari {hist.length - 1} milik {sim.player!.name}: bahan{" "}
        <span className="text-[#F1F5F9]">{cut} valuasi</span> sampai {hist[cut - 1].date.slice(0, 7)}, jawaban{" "}
        <span className="text-[#34D399]">{fmt.eur(answer.value_eur)}</span> pada {answer.date.slice(0, 7)}. Geser untuk pindah
        soal.
      </p>
    </div>
  );
}

function Illustration({ index, overview, sim }: { index: number; overview: OverviewResponse; sim?: SimulateResponse }) {
  const ds = overview.dataset as OverviewResponse["dataset"] & { panel_rows?: number; train_rows?: number };
  const repairs = (overview.data_card?.repairs ?? {}) as Record<string, number>;
  const used = overview.data_card?.valuation_points ?? ds.history_rows;
  const hist = sim?.player?.history;
  const feats = (sim as unknown as { features?: Record<string, number | string | null> } | undefined)?.features;
  const clean = overview.classification.clean_mode as OverviewResponse["classification"]["clean_mode"] & {
    validation?: { group_kfold: Record<string, Record<string, number>> };
  };
  const cal = (overview.classification.trend as unknown as { calibration?: { top_label: { predicted: number; observed: number; n: number }[] } })
    ?.calibration?.top_label;
  const oot = overview.out_of_time;

  if (index === 0) {
    return (
      <div className="space-y-3">
        <Rows
          rows={[
            ["transfermarkt_player_values.csv", `${num(ds.total_players)} baris, 36 kolom`],
            ["transfermarkt_value_history.csv", `${num(ds.history_rows)} baris, 8 kolom`],
          ]}
        />
        {hist ? (
          <div>
            <p className="text-[13px] text-[#94A3B8]">Tiga baris terakhir {sim!.player!.name} di file riwayat:</p>
            <table className="mt-1.5 w-full text-[13px]">
              <tbody>
                {hist.slice(-3).map((h) => (
                  <tr key={h.date} className="border-t border-[#1B2634]">
                    <td className="py-1.5 font-mono text-xs text-[#94A3B8]">{sim!.player!.player_id}</td>
                    <td className="py-1.5 font-mono text-xs text-[#CBD5E1]">{h.date}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#F1F5F9]">{num(h.value_eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }
  if (index === 1) {
    const broken = (repairs.positions_repaired_from_sidecar ?? 0) + (repairs.positions_still_unknown ?? 0);
    return (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] text-[#94A3B8]">{num(broken)} pemain lama dengan kolom posisi bergeser</p>
          <SplitBar
            parts={[
              { label: "diperbaiki", value: repairs.positions_repaired_from_sidecar ?? 0, tone: "accent" },
              { label: "tetap kosong", value: repairs.positions_still_unknown ?? 0, tone: "muted" },
            ]}
          />
        </div>
        <Rows
          rows={[
            ["Valuasi nol atau negatif dibuang", num(repairs.history_rows_dropped_nonpositive ?? 0)],
            ["Usia diganti dari riwayat", `${num(repairs.age_values_replaced_from_history ?? 0)} pemain`],
            ["Valuasi yang dipakai", num(used)],
          ]}
        />
      </div>
    );
  }
  if (index === 2) {
    return sim?.player ? <CutIllustration sim={sim} /> : <p className="text-[13px] text-[#94A3B8]">Memuat riwayat contoh...</p>;
  }
  if (index === 3) {
    const n = (k: string) => Number(feats?.[k] ?? 0);
    return feats ? (
      <div>
        <p className="mb-1 text-[13px] text-[#94A3B8]">Enam dari {overview.regression.tasks?.forecast.features.length} fitur {sim!.player!.name} hari ini:</p>
        <Rows
          rows={[
            ["Harga terakhir", fmt.eur(n("last_value_eur"))],
            ["Jarak dari puncak", pct0(n("dd_last"))],
            ["Perubahan harga terakhir", `${n("ret1") >= 0 ? "+" : ""}${Math.round((Math.exp(n("ret1")) - 1) * 100)}%`],
            ["Usia saat update berikutnya", `${n("age").toFixed(1).replace(".", ",")} tahun`],
            ["Lama riwayat harga", `${n("span_yr").toFixed(1).replace(".", ",")} tahun`],
            ["Jumlah valuasi", num(n("n_points"))],
          ]}
        />
      </div>
    ) : (
      <p className="text-[13px] text-[#94A3B8]">Memuat fitur contoh...</p>
    );
  }
  if (index === 4) {
    return (
      <div>
        <SplitBar
          parts={[
            { label: "pemain latih", value: ds.train_size, tone: "main" },
            { label: "pemain uji", value: ds.test_size, tone: "accent" },
          ]}
        />
        <p className="mt-3 text-[13px] leading-relaxed text-[#94A3B8]">
          Kalau dibagi per baris, soal ke-20 seorang pemain bisa ada di latih dan soal ke-21 di uji. Model lalu tampak pintar
          hanya karena sudah mengenal pemainnya.
        </p>
      </div>
    );
  }
  if (index === 5) {
    const cv = clean.validation?.group_kfold ?? {};
    const rows = Object.entries(cv)
      .map(([name, m]) => ({ name, loss: m.log_loss_mean }))
      .sort((a, b) => a.loss - b.loss);
    const max = Math.max(...rows.map((r) => r.loss), 1);
    return (
      <div>
        <p className="mb-2 text-[13px] text-[#94A3B8]">Galat peluang (log-loss) di validasi silang. Makin kecil makin baik.</p>
        <ul className="space-y-2">
          {rows.map((r) => {
            const chosen = r.name === clean.best_model;
            return (
              <li key={r.name} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={chosen ? "font-semibold text-[#F1F5F9]" : "text-[#CBD5E1]"}>
                    {r.name.startsWith("Persistence") ? "Tanpa model" : r.name}
                    {chosen ? " (terpilih)" : ""}
                  </span>
                  <span className="tabular-nums text-[#94A3B8]">{r.loss.toFixed(3).replace(".", ",")}</span>
                </div>
                <span className="mt-1 block h-1 rounded-full bg-[#1B2634]">
                  <span
                    className={`block h-1 rounded-full ${chosen ? "bg-[#10B981]" : "bg-[#64748B]"}`}
                    style={{ width: `${(r.loss / max) * 100}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  if (index === 6) {
    const train = ds.train_rows ?? 0;
    return (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] text-[#94A3B8]">Model harga, tren, dan nilai wajar</p>
          <SplitBar
            parts={[
              { label: "soal dipakai melatih", value: train, tone: "accent" },
              { label: "soal lain (lebih lama, atau milik pemain uji)", value: Math.max(0, (ds.panel_rows ?? train) - train), tone: "muted" },
            ]}
          />
        </div>
        {overview.outlook ? (
          <Rows rows={[["Model 12 bulan, soalnya sendiri", `${num(overview.outlook.train_rows)} soal`]]} />
        ) : null}
      </div>
    );
  }
  if (index === 7) {
    const S = 170;
    const M = 16; // inset so the largest dot stays inside the frame
    return cal ? (
      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label="Peluang yang diberikan model lawan kenyataan">
          <rect x="0" y="0" width={S} height={S} fill="#0F1721" />
          <line x1={M} y1={S - M} x2={S - M} y2={M} stroke="#3B4A5E" strokeWidth="1" strokeDasharray="3 4" />
          {cal.map((b) => (
            <circle
              key={b.predicted}
              cx={M + b.predicted * (S - 2 * M)}
              cy={M + (1 - b.observed) * (S - 2 * M)}
              r={3 + Math.sqrt(b.n) / 3}
              fill="#10B981"
              fillOpacity="0.75"
            />
          ))}
        </svg>
        <p className="min-w-40 flex-1 text-[13px] leading-relaxed text-[#94A3B8]">
          Tiap titik adalah sekelompok tebakan tren. Ke kanan: seberapa yakin model. Ke atas: seberapa sering benar. Titik di
          garis putus-putus berarti peluangnya jujur. Titik besar berarti banyak pemain.
        </p>
      </div>
    ) : null;
  }
  if (index === 8) {
    return oot ? (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] text-[#94A3B8]">Uji ke masa depan, dipisah pada {oot.cutoff}</p>
          <SplitBar
            parts={[
              { label: "soal sebelum tanggal itu, untuk melatih", value: oot.train_rows, tone: "main" },
              { label: "update sesudahnya, ditebak", value: oot.sets.unseen_players_future.rows, tone: "accent" },
            ]}
          />
        </div>
        <Rows rows={[["Uji biasa: pemain yang tidak pernah dilihat", `${num(ds.test_size)} pemain`]]} />
      </div>
    ) : null;
  }
  return (
    <Rows
      rows={[
        ["/api/simulate", sim ? `${sim.player?.name}: ${fmt.eur(sim.predicted_value_eur)}` : "prediksi satu pemain"],
        ["/api/test-predictions", `${num(ds.test_size)} pemain uji dan daftar rekomendasi`],
        ["/api/overview", "semua angka evaluasi di situs ini"],
        ["Versi model", overview.model_card?.version.slice(0, 7) ?? "-"],
      ]}
    />
  );
}

export function WorkflowRoadmap({
  steps,
  overview,
  sim,
}: {
  steps: WorkflowStep[];
  overview: OverviewResponse;
  sim?: SimulateResponse;
}) {
  const [active, setActive] = useState(0);
  const last = steps.length - 1;
  const step = steps[active];
  const phase = PHASES.find((p) => active >= p.from && active <= p.to)!;
  const go = (i: number) => setActive(Math.max(0, Math.min(last, i)));

  return (
    <div>
      <div
        role="tablist"
        aria-label="Tahap alur kerja"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(active + 1);
          if (e.key === "ArrowLeft") go(active - 1);
        }}
        className="px-3 pt-5 sm:px-5"
      >
        <div className="grid grid-cols-10 text-xs text-[#7C8BA1]">
          {PHASES.map((p) => (
            <span
              key={p.label}
              style={{ gridColumn: `${p.from + 1} / ${p.to + 2}` }}
              className={`truncate border-l border-[#243244] pb-2 pl-2 ${phase === p ? "text-[#F1F5F9]" : ""}`}
            >
              {p.label}
            </span>
          ))}
        </div>

        <div className="relative grid grid-cols-10">
          <span className="absolute left-[5%] right-[5%] top-[13px] h-0.5 bg-[#243244]" />
          <span
            className="absolute left-[5%] top-[13px] h-0.5 bg-[#10B981] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(active / last) * 90}%` }}
          />
          {steps.map((s, i) => {
            const state = i === active ? "now" : i < active ? "done" : "todo";
            return (
              <button
                key={s.stage}
                role="tab"
                type="button"
                aria-selected={i === active}
                tabIndex={i === active ? 0 : -1}
                onClick={() => go(i)}
                className="group relative flex flex-col items-center gap-2 pb-4 pt-1 outline-none"
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-semibold tabular-nums transition group-focus-visible:ring-2 group-focus-visible:ring-[#F1F5F9] ${
                    state === "now"
                      ? "scale-125 border-[#10B981] bg-[#10B981] text-[#0B1117]"
                      : state === "done"
                        ? "border-[#10B981] bg-[#121A24] text-[#34D399]"
                        : "border-[#3B4A5E] bg-[#121A24] text-[#7C8BA1] group-hover:border-[#94A3B8]"
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  className={`hidden px-1 text-center text-xs leading-tight sm:block ${
                    state === "now" ? "font-semibold text-[#F1F5F9]" : "text-[#94A3B8] group-hover:text-[#F1F5F9]"
                  }`}
                >
                  {s.stage}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        className="grid border-t border-[#243244] lg:min-h-[336px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
      >
        <div className="flex flex-col p-5">
          <p className="text-[13px] text-[#7C8BA1]">
            Tahap {active + 1} dari {steps.length}, {phase.label.toLowerCase()}
          </p>
          <h4 className="mt-1 text-lg font-semibold text-[#F1F5F9]">{step.stage}</h4>
          <code className="text-xs text-[#7C8BA1]">{step.code}</code>
          <p className="mt-3 text-sm leading-relaxed text-[#CBD5E1]">{step.does}</p>
          <p className="mt-4 text-[13px] text-[#94A3B8]">
            <span className="text-2xl font-semibold tabular-nums text-[#F1F5F9]">{step.figure}</span> {step.unit}
          </p>
          <div className="mt-auto flex gap-2 pt-5">
            <button
              type="button"
              onClick={() => go(active - 1)}
              disabled={active === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#243244] px-3 py-1.5 text-[13px] font-medium text-[#F1F5F9] transition hover:border-[#94A3B8] disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              disabled={active === last}
              className="inline-flex items-center gap-1 rounded-lg border border-[#243244] px-3 py-1.5 text-[13px] font-medium text-[#F1F5F9] transition hover:border-[#94A3B8] disabled:opacity-40"
            >
              Berikutnya
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="border-t border-[#243244] bg-[#0B1117] p-5 lg:border-l lg:border-t-0">
          <Illustration index={active} overview={overview} sim={sim} />
        </div>
      </div>
    </div>
  );
}
