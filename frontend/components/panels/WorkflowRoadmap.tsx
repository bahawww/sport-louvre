"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge, Button, Panel, SectionHeader } from "@/components/ui";
import type { OverviewResponse, SimulateResponse } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

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
function SplitBar({
  parts,
}: {
  parts: { label: string; value: number; tone: "main" | "accent" | "muted" }[];
}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const toneClasses: Record<"main" | "accent" | "muted", string> = {
    main: "bg-muted",
    accent: "bg-positive",
    muted: "bg-control",
  };

  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-raised">
        {parts.map((p) => (
          <span
            key={p.label}
            className={toneClasses[p.tone]}
            style={{ width: `${Math.max(1.5, (p.value / total) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", toneClasses[p.tone])} />
            <span className="tabular-nums text-ink">{num(p.value)}</span> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-rule text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right tabular-nums text-ink">{v}</dd>
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
  const path = (pts: typeof hist) =>
    pts.map((h, i) => `${i ? "L" : "M"}${x(h.date).toFixed(1)} ${y(h.value_eur).toFixed(1)}`).join(" ");
  const answer = hist[cut];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full max-w-full h-auto rounded-control border border-border"
        role="img"
        aria-label="Riwayat harga dipotong menjadi bahan dan jawaban"
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--surface)" />
        <rect x={x(answer.date)} y={0} width={W - x(answer.date)} height={H} fill="var(--raised)" />
        <path d={path(hist.slice(cut))} fill="none" stroke="var(--grid)" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d={path(hist.slice(0, cut))} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
        <line x1={x(answer.date)} x2={x(answer.date)} y1={0} y2={H} stroke="var(--chart-1)" strokeWidth="1" />
        <circle cx={x(answer.date)} cy={y(answer.value_eur)} r="5" fill="var(--chart-1)" />
      </svg>
      <input
        type="range"
        min={1}
        max={hist.length - 1}
        value={cut}
        onChange={(e) => setCut(Number(e.target.value))}
        aria-label="Geser titik potong"
        className="mt-3 w-full cursor-pointer accent-primary"
      />
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Soal ke-{cut} dari {hist.length - 1} milik {sim.player!.name}: bahan{" "}
        <span className="text-ink font-medium">{cut} valuasi</span> sampai {hist[cut - 1].date.slice(0, 7)}, jawaban{" "}
        <span className="text-positive font-medium">{fmt.eur(answer.value_eur)}</span> pada {answer.date.slice(0, 7)}. Geser untuk pindah
        soal.
      </p>
    </div>
  );
}

function Illustration({
  index,
  overview,
  sim,
}: {
  index: number;
  overview: OverviewResponse;
  sim?: SimulateResponse;
}) {
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
      <div className="space-y-4">
        <Rows
          rows={[
            ["transfermarkt_player_values.csv", `${num(ds.total_players)} baris, 36 kolom`],
            ["transfermarkt_value_history.csv", `${num(ds.history_rows)} baris, 8 kolom`],
          ]}
        />
        {hist ? (
          <div>
            <p className="text-[13px] text-muted">Tiga baris terakhir {sim!.player!.name} di file riwayat:</p>
            <div className="mt-2 overflow-x-auto rounded-control border border-rule">
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-rule">
                  {hist.slice(-3).map((h) => (
                    <tr key={h.date} className="bg-raised/30">
                      <td className="px-3 py-1.5 font-mono text-xs text-muted">{sim!.player!.player_id}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-ink">{h.date}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">{num(h.value_eur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <p className="mb-2 text-[13px] text-muted">{num(broken)} pemain lama dengan kolom posisi bergeser</p>
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
    return sim?.player ? <CutIllustration sim={sim} /> : <p className="text-[13px] text-muted">Memuat riwayat contoh...</p>;
  }
  if (index === 3) {
    const n = (k: string) => Number(feats?.[k] ?? 0);
    return feats ? (
      <div>
        <p className="mb-2 text-[13px] text-muted">
          Enam dari {overview.regression.tasks?.forecast.features.length} fitur {sim!.player!.name} hari ini:
        </p>
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
      <p className="text-[13px] text-muted">Memuat fitur contoh...</p>
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
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
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
        <p className="mb-2 text-[13px] text-muted">Galat peluang (log-loss) di validasi silang. Makin kecil makin baik.</p>
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const chosen = r.name === clean.best_model;
            return (
              <li key={r.name} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={chosen ? "font-semibold text-ink" : "text-muted"}>
                    {r.name.startsWith("Persistence") ? "Tanpa model" : r.name}
                    {chosen ? " (terpilih)" : ""}
                  </span>
                  <span className="tabular-nums text-muted">{r.loss.toFixed(3).replace(".", ",")}</span>
                </div>
                <span className="mt-1 block h-1.5 rounded-full bg-rule overflow-hidden">
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all",
                      chosen ? "bg-positive" : "bg-control"
                    )}
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
          <p className="mb-2 text-[13px] text-muted">Model harga, tren, dan nilai wajar</p>
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
        <svg
          viewBox={`0 0 ${S} ${S}`}
          width={S}
          height={S}
          role="img"
          aria-label="Peluang yang diberikan model lawan kenyataan"
          className="shrink-0 rounded-control border border-border"
        >
          <rect x="0" y="0" width={S} height={S} fill="var(--surface)" />
          <line x1={M} y1={S - M} x2={S - M} y2={M} stroke="var(--grid)" strokeWidth="1" strokeDasharray="3 4" />
          {cal.map((b) => (
            <circle
              key={b.predicted}
              cx={M + b.predicted * (S - 2 * M)}
              cy={M + (1 - b.observed) * (S - 2 * M)}
              r={3 + Math.sqrt(b.n) / 3}
              fill="var(--chart-1)"
              fillOpacity="0.75"
            />
          ))}
        </svg>
        <p className="min-w-40 flex-1 text-[13px] leading-relaxed text-muted">
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
          <p className="mb-2 text-[13px] text-muted">Uji ke masa depan, dipisah pada {oot.cutoff}</p>
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
  const tablistRef = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;
  const step = steps[active];
  const phase = PHASES.find((p) => active >= p.from && active <= p.to)!;
  const go = (i: number) => setActive(Math.max(0, Math.min(last, i)));

  useEffect(() => {
    const container = tablistRef.current;
    if (!container) return;
    const selectedBtn = container.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (selectedBtn) {
      const btnLeft = selectedBtn.offsetLeft;
      const btnRight = btnLeft + selectedBtn.offsetWidth;
      const cLeft = container.scrollLeft;
      const cRight = cLeft + container.clientWidth;
      if (btnLeft < cLeft || btnRight > cRight) {
        selectedBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [active]);

  return (
    <Panel as="section" padding="none" surface="default" className="overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border">
        <SectionHeader
          as="h2"
          title="Alur kerja dari CSV sampai model"
          subtitle="Sepuluh tahap yang dijalankan tiap kali model dilatih. Pilih satu tahap untuk melihat apa yang terjadi pada data."
          actions={
            <Badge variant="neutral" size="sm">
              {active + 1} dari {steps.length}
            </Badge>
          }
        />
      </div>

      <div className="border-b border-border bg-ground/40 p-3 sm:p-4">
        {/* Phase headers for desktop */}
        <div className="hidden sm:grid grid-cols-10 gap-1.5 mb-2 text-xs text-muted">
          {PHASES.map((p) => (
            <div
              key={p.label}
              style={{ gridColumn: `${p.from + 1} / ${p.to + 2}` }}
              className={cn(
                "border-l border-rule pl-2 font-medium truncate transition-colors",
                phase === p ? "text-ink" : "text-faint"
              )}
            >
              {p.label}
            </div>
          ))}
        </div>

        {/* Phase label for mobile */}
        <div className="sm:hidden flex items-center justify-between pb-2 text-xs text-muted">
          <span>
            Fase: <strong className="text-ink font-medium">{phase.label}</strong>
          </span>
          <span className="tabular-nums">
            Langkah {active + 1} dari {steps.length}
          </span>
        </div>

        {/* Accessible step selector */}
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Tahap alur kerja"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              go(active + 1);
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              go(active - 1);
            }
          }}
          className="flex sm:grid sm:grid-cols-10 gap-1.5 overflow-x-auto pb-1 sm:pb-0 scroll-smooth [scrollbar-width:thin]"
        >
          {steps.map((s, i) => {
            const isCurrent = i === active;
            const isPast = i < active;
            return (
              <button
                key={s.stage}
                role="tab"
                type="button"
                aria-selected={isCurrent}
                tabIndex={isCurrent ? 0 : -1}
                onClick={() => go(i)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-control border px-2 py-1.5 transition-colors shrink-0",
                  "min-w-[92px] sm:min-w-0 sm:flex-1",
                  "min-h-[44px] lg:min-h-[38px]",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none",
                  isCurrent
                    ? "bg-active border-control text-ink font-medium"
                    : "bg-raised border-border text-muted hover:text-ink"
                )}
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold tabular-nums">{i + 1}</span>
                  {isPast ? (
                    <span className="size-1.5 rounded-full bg-positive inline-block" />
                  ) : null}
                </div>
                <span className="text-[11px] leading-tight truncate w-full text-center">
                  {s.stage}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        className="grid divide-y lg:divide-y-0 lg:divide-x divide-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:min-h-[340px]"
      >
        <div className="flex flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-faint">
              Tahap {active + 1} dari {steps.length}, {phase.label.toLowerCase()}
            </p>
            <code className="font-mono text-xs text-muted rounded-chip bg-raised px-2 py-0.5 border border-rule">
              {step.code}
            </code>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-ink">
            {step.stage}
          </h3>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            {step.does}
          </p>
          <div className="mt-4 pt-3 border-t border-rule text-[13px] text-muted">
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {step.figure}
            </span>{" "}
            <span>{step.unit}</span>
          </div>
          <div className="mt-auto flex items-center gap-2 pt-5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => go(active - 1)}
              disabled={active === 0}
              aria-label="Tahap sebelumnya"
            >
              <ChevronLeft className="size-4" />
              Sebelumnya
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => go(active + 1)}
              disabled={active === last}
              aria-label="Tahap berikutnya"
            >
              Berikutnya
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="bg-ground/40 p-4 sm:p-5 flex flex-col justify-center">
          <Illustration index={active} overview={overview} sim={sim} />
        </div>
      </div>
    </Panel>
  );
}
