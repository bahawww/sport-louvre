"use client";

import { ChevronLeft, ChevronRight, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EChart } from "@/components/chart";
import type { OverviewResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

type WfNode = {
  id: string;
  x: number;
  y: number;
  title: string;
  sub: string;
  stage: string;
  color: string;
  detail: string;
  specs: string[];
};

const W = 172;
const H = 74;

function buildNodes(overview: OverviewResponse): WfNode[] {
  const totalPlayers = fmt.int(overview.dataset.total_players);
  const trainSize = fmt.int(overview.dataset.train_size);
  const testSize = fmt.int(overview.dataset.test_size);
  const historyRows = fmt.int(overview.dataset.history_rows);

  return [
    {
      id: "csv",
      x: 8,
      y: 134,
      title: "1. Muat 2 CSV",
      sub: `${totalPlayers} pemain + ${historyRows} riwayat`,
      stage: "Ingestion",
      color: "#38BDF8",
      detail:
        `FastAPI membaca transfermarkt_player_values.csv (${totalPlayers} baris, 36 kolom) dan transfermarkt_value_history.csv (${historyRows} titik valuasi historis) dengan encoding utf-8-sig agar BOM UTF-8 bersih.`,
      specs: [
        "Encoding: utf-8-sig",
        "Liga: Premier League, La Liga, Serie A, Bundesliga, Ligue 1",
        "Target klasifikasi: trajectory (5 kelas) · Target regresi: current_value_eur",
      ],
    },
    {
      id: "lag",
      x: 212,
      y: 134,
      title: "2. Fitur Pra-Akhir",
      sub: "Ekstrak vals[:-1], buang bocoran",
      stage: "Feature Engineering",
      color: "#10B981",
      detail:
        "Titik valuasi terakhir v[-1] (identik dengan current_value_eur) dan fitur post-hoc (value_cagr, post_peak_decline_pct, value_multiplier_x) dibuang dari Mode Clean. Sebagai gantinya, dihitung fitur momentum murni dari histori sebelum titik akhir (vals[:-1]).",
      specs: [
        "Dibuang: last_value_eur, value_cagr, post_peak_decline_pct, value_multiplier_x",
        "Ditambah: pre_last_value_eur, pre_mom1, pre_mom1_ann, pre_cagr, pre_drawdown_pct",
        "Total fitur Clean: 25 numerik + 2 kategorikal (league_name, nationality_grouped)",
      ],
    },
    {
      id: "prep",
      x: 416,
      y: 134,
      title: "3. Preprocessing",
      sub: "Imputer + Scaler + OHE",
      stage: "Transformation",
      color: "#38BDF8",
      detail:
        "ColumnTransformer memproses fitur numerik dan kategorikal secara terpisah di dalam Pipeline scikit-learn agar tidak terjadi kebocoran statistik test set saat scaling.",
      specs: [
        "Numerik: SimpleImputer(strategy='median') → StandardScaler()",
        "Kategorikal: SimpleImputer(fill_value='Other') → OneHotEncoder(handle_unknown='ignore')",
        "Top-12 kebangsaan dipertahankan, sisanya digabung ke 'Other'",
      ],
    },
    {
      id: "split",
      x: 620,
      y: 134,
      title: "4. Split 80 : 20",
      sub: `Stratified, seed 42 (${trainSize} / ${testSize})`,
      stage: "Validation Split",
      color: "#38BDF8",
      detail:
        `Dataset dibagi menjadi ${trainSize} data latih dan ${testSize} data uji menggunakan stratified split berdasarkan kelas trajectory dengan random_state=42 sehingga proporsi 5 kelas identik.`,
      specs: [
        `Train set: ${trainSize} pemain (80%)`,
        `Test set: ${testSize} pemain (20%)`,
        "Stratify: trajectory · Seed: 42 (deterministik)",
      ],
    },
    {
      id: "rf",
      x: 840,
      y: 20,
      title: "Random Forest",
      sub: "400 trees · Ensemble",
      stage: "Model Engine",
      color: "#10B981",
      detail:
        "Ensemble 400 pohon keputusan paralel yang memvoting kelas trajectory. Menangkap hubungan non-linear antara umur, drawdown pra-akhir, dan momentum harga.",
      specs: [
        "Hyperparameter: n_estimators=400, random_state=42",
        "Regressor: RandomForestRegressor(n_estimators=200)",
      ],
    },
    {
      id: "lr",
      x: 840,
      y: 134,
      title: "Logistic Regression",
      sub: "C=10 · Multinomial L2",
      stage: "Model Engine",
      color: "#38BDF8",
      detail:
        "Model linear multinomial dengan regularisasi L2. Memberikan probabilitas kelas yang halus untuk Simulator Scouting.",
      specs: [
        "Hyperparameter: max_iter=3000, C=10.0, random_state=42",
        "Regressor pembanding: LinearRegression()",
      ],
    },
    {
      id: "gb",
      x: 840,
      y: 248,
      title: "Gradient Boosting",
      sub: "200 trees · Sequential",
      stage: "Model Engine",
      color: "#F59E0B",
      detail:
        "Boosting sekuensial 200 pohon yang memperbaiki residual kesalahan pohon sebelumnya secara bertahap.",
      specs: [
        "Classifier: n_estimators=200, max_depth=3, random_state=42",
        "Regressor: GradientBoostingRegressor(n_estimators=150)",
      ],
    },
    {
      id: "score",
      x: 1048,
      y: 134,
      title: `5. Uji ${testSize} Sampel`,
      sub: "Akurasi, F1, R², MAE, Residual",
      stage: "Evaluation",
      color: "#10B981",
      detail:
        `Seluruh model dievaluasi pada ${testSize} pemain uji yang tidak pernah dilihat selama training, menghasilkan confusion matrix, metrik regresi, dan daftar residual.`,
      specs: [
        "Klasifikasi: Accuracy, F1 Weighted, Precision, Recall, Confusion Matrix 5×5",
        "Regresi: R², MAE (€), RMSE (€), Gap Undervalued / Overvalued",
      ],
    },
    {
      id: "audit",
      x: 1252,
      y: 48,
      title: "Audit Leakage",
      sub: "Bandingkan Clean vs Full",
      stage: "Governance",
      color: "#F59E0B",
      detail:
        "Pipeline juga melatih Mode Full Features (dengan fitur bocoran) sebagai kontrol eksperimen untuk membuktikan inflasi akurasi semu (+13–33 pp).",
      specs: [
        "Membuktikan bahaya fitur post-hoc di produksi",
        "Menandai bias English Tax & ambiguitas growing vs stable",
      ],
    },
    {
      id: "serve",
      x: 1252,
      y: 220,
      title: "FastAPI & Simulator",
      sub: "API live + What-If Scouting",
      stage: "Production Serving",
      color: "#10B981",
      detail:
        "Artefak model disimpan di memori FastAPI dan disajikan lewat endpoint REST (/api/overview, /api/simulate, /api/datasets) melalui Caddy & Cloudflare Tunnel.",
      specs: [
        "Endpoint: /api/overview, /api/test-predictions, /api/history, /api/simulate, /api/datasets",
        "Stack: FastAPI (:8000) + Next.js (:3000) + Caddy (:8310)",
      ],
    },
  ];
}

const EDGES: [string, string][] = [
  ["csv", "lag"],
  ["lag", "prep"],
  ["prep", "split"],
  ["split", "rf"],
  ["split", "lr"],
  ["split", "gb"],
  ["rf", "score"],
  ["lr", "score"],
  ["gb", "score"],
  ["score", "audit"],
  ["score", "serve"],
];

function edgePath(a: WfNode, b: WfNode): string {
  const x1 = a.x + W;
  const y1 = a.y + H / 2;
  const x2 = b.x;
  const y2 = b.y + H / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 6} ${y2}`;
}

function buildGlossary(overview: OverviewResponse): { title: string; terms: [string, string][] }[] {
  const trainSize = fmt.int(overview.dataset.train_size);
  const testSize = fmt.int(overview.dataset.test_size);

  return [
    {
      title: "Data & Anti-Leakage",
      terms: [
        [
          "Data Leakage",
          "Kebocoran informasi target ke dalam fitur latih. Contoh di dataset ini: last_value_eur 100% sama dengan current_value_eur, sedangkan value_cagr dan post_peak_decline_pct baru bisa dihitung setelah valuasi akhir terjadi.",
        ],
        [
          "Fitur Pra-Akhir (vals[:-1])",
          "Fitur momentum dan tren yang dihitung murni dari riwayat valuasi SEBELUM titik terakhir (pre_last_value_eur, pre_mom1, pre_cagr, pre_drawdown_pct). Sah dipakai tanpa membocorkan target.",
        ],
        [
          "Stratified Split 80:20",
          `Pembagian ${trainSize} data latih dan ${testSize} data uji (random_state=42) yang menjaga proporsi 5 kelas trajectory tetap seimbang di kedua sisi.`,
        ],
        [
          "ColumnTransformer",
          "Mesin pra-pemrosesan scikit-learn yang memisahkan pipeline numerik (SimpleImputer median + StandardScaler) dan kategorikal (OneHotEncoder untuk liga & top-12 kebangsaan).",
        ],
      ],
    },
    {
      title: "Engine Klasifikasi & Regresi",
      terms: [
        [
          "Random Forest (400 trees)",
          "Ensemble 400 pohon keputusan paralel. Menangkap interaksi non-linear antara usia, drawdown, dan momentum pra-akhir pada Mode Clean.",
        ],
        [
          "Logistic Regression (C=10)",
          "Model linear multinomial dengan regularisasi L2. Menghasilkan probabilitas kelas yang terkalibrasi baik untuk Simulator Scouting.",
        ],
        [
          "Gradient Boosting (200 trees)",
          "Pohon sekuensial yang memperbaiki residual kesalahan pohon sebelumnya secara bertahap untuk klasifikasi dan regresi current_value_eur.",
        ],
        [
          "Scouting Verdict & Residual",
          "Selisih antara taksiran wajar model dan harga pasar aktual (pred - actual). Nilai positif besar menandakan pemain berpotensi undervalued (Hidden Gem).",
        ],
      ],
    },
  ];
}

export function PenjelasanPanel({ overview }: { overview: OverviewResponse }) {
  const [selectedId, setSelectedId] = useState<string>("rf");
  const [playing, setPlaying] = useState(false);

  const nodes = useMemo(() => buildNodes(overview), [overview]);
  const byId = useMemo<Record<string, WfNode>>(
    () => Object.fromEntries(nodes.map((n) => [n.id, n])),
    [nodes],
  );
  const glossary = useMemo(() => buildGlossary(overview), [overview]);

  const selectedIdx = nodes.findIndex((n) => n.id === selectedId);
  const selectedNode = byId[selectedId] ?? nodes[0];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setSelectedId((prev) => {
        const idx = nodes.findIndex((n) => n.id === prev);
        const next = idx + 1;
        if (next >= nodes.length) {
          setPlaying(false);
          return nodes[nodes.length - 1].id;
        }
        return nodes[next].id;
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [playing, nodes]);

  const liveModelMetrics = useMemo(() => {
    const map: Record<string, string> = {
      rf: "Random Forest",
      lr: "Logistic Regression",
      gb: "Gradient Boosting",
    };
    const modelName = map[selectedId];
    if (!modelName) return null;
    const clean = overview.classification.clean_mode.models.find((m) => m.name === modelName);
    const leak = overview.classification.leakage_mode.models.find((m) => m.name === modelName);
    return { clean, leak };
  }, [overview, selectedId]);

  const bestClean = useMemo(() => {
    const ms = overview.classification.clean_mode.models;
    return ms.find((m) => m.name === overview.classification.clean_mode.best_model) ?? ms[0];
  }, [overview]);

  const featOption = useMemo(() => {
    const items = bestClean.feature_importance.slice(0, 10);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#182230",
        borderColor: "#243244",
        textStyle: { color: "#F1F5F9" },
        valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%`,
      },
      grid: { left: 155, right: 24, top: 12, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: { color: "#94A3B8", fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` },
        splitLine: { lineStyle: { color: "#1E293B" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: items.map((i) => i.feature),
        axisLabel: { color: "#F1F5F9", fontSize: 12 },
        axisLine: { lineStyle: { color: "#243244" } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 18,
          itemStyle: { color: "#10B981", borderRadius: [0, 4, 4, 0] },
          data: items.map((i) => i.importance),
        },
      ],
    };
  }, [bestClean]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#F1F5F9]">
              Arsitektur Workflow Machine Learning (End-to-End)
            </h3>
            <p className="mt-1 text-xs text-[#94A3B8]">
              Klik node pada diagram atau gunakan kontrol langkah untuk memeriksa detail tiap tahap pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setSelectedId(nodes[Math.max(0, selectedIdx - 1)].id);
              }}
              disabled={selectedIdx <= 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#243244] bg-[#0B1117] px-2.5 py-1.5 text-xs font-semibold text-[#F1F5F9] hover:border-[#10B981] disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setSelectedId(nodes[Math.min(nodes.length - 1, selectedIdx + 1)].id);
              }}
              disabled={selectedIdx >= nodes.length - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-[#243244] bg-[#0B1117] px-2.5 py-1.5 text-xs font-semibold text-[#F1F5F9] hover:border-[#10B981] disabled:opacity-40"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!playing) {
                  setSelectedId(nodes[0].id);
                  setPlaying(true);
                } else {
                  setPlaying(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#10B981] px-3 py-1.5 text-xs font-bold text-[#0B1117] hover:bg-[#059669]"
            >
              {playing ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
              {playing ? "Stop Tur" : "Putar Alur"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[#1E293B] bg-[#0B1117] p-4">
          <svg
            viewBox="0 0 1434 340"
            role="img"
            aria-label="Diagram alur workflow Machine Learning Sport Louvre interaktif"
            className="block h-auto w-full min-w-[1050px]"
          >
            <defs>
              <marker
                id="sl-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 z" fill="#475569" />
              </marker>
              <marker
                id="sl-arrow-active"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 z" fill="#10B981" />
              </marker>
            </defs>
            {EDGES.map(([a, b]) => {
              const activeEdge = a === selectedId || b === selectedId;
              return (
                <path
                  key={`${a}-${b}`}
                  d={edgePath(byId[a], byId[b])}
                  fill="none"
                  stroke={activeEdge ? "#10B981" : "#334155"}
                  strokeWidth={activeEdge ? "2.6" : "2"}
                  markerEnd={activeEdge ? "url(#sl-arrow-active)" : "url(#sl-arrow)"}
                />
              );
            })}
            {nodes.map((n) => {
              const isSelected = n.id === selectedId;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => {
                    setPlaying(false);
                    setSelectedId(n.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPlaying(false);
                      setSelectedId(n.id);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    width={W}
                    height={H}
                    rx="10"
                    fill={isSelected ? "#182230" : "#121A24"}
                    stroke={isSelected ? n.color : "#243244"}
                    strokeWidth={isSelected ? "2.2" : "1.5"}
                  />
                  <rect width="5" height={H} rx="2.5" fill={n.color} />
                  <text x="16" y="29" fontSize="13.5" fontWeight="800" fill="#F1F5F9">
                    {n.title}
                  </text>
                  <foreignObject x="16" y="35" width={W - 24} height={H - 38}>
                    <p className="m-0 text-[11px] leading-[1.35] text-[#94A3B8]">{n.sub}</p>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-4 rounded-lg border border-[#243244] bg-[#0B1117] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className="rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#0B1117]"
                style={{ backgroundColor: selectedNode.color }}
              >
                {selectedNode.stage}
              </span>
              <h4 className="text-sm font-extrabold text-[#F1F5F9]">{selectedNode.title}</h4>
            </div>
            <span className="text-xs text-[#64748B]">
              Langkah {selectedIdx + 1} dari {nodes.length}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[#CBD5E1]">{selectedNode.detail}</p>

          {liveModelMetrics?.clean ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[#1E293B] bg-[#121A24] p-2.5">
                <span className="block text-[11px] text-[#94A3B8]">Akurasi Clean</span>
                <strong className="text-base text-[#10B981]">
                  {fmt.pct(liveModelMetrics.clean.accuracy)}
                </strong>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-[#121A24] p-2.5">
                <span className="block text-[11px] text-[#94A3B8]">F1 Weighted</span>
                <strong className="text-base text-[#F1F5F9]">
                  {fmt.pct(liveModelMetrics.clean.f1_weighted)}
                </strong>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-[#121A24] p-2.5">
                <span className="block text-[11px] text-[#94A3B8]">Precision / Recall</span>
                <strong className="text-base text-[#F1F5F9]">
                  {fmt.pct(liveModelMetrics.clean.precision_weighted)} /{" "}
                  {fmt.pct(liveModelMetrics.clean.recall_weighted)}
                </strong>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-[#121A24] p-2.5">
                <span className="block text-[11px] text-[#94A3B8]">Mode Leakage</span>
                <strong className="text-base text-[#F59E0B]">
                  {liveModelMetrics.leak ? fmt.pct(liveModelMetrics.leak.accuracy) : "—"}
                </strong>
              </div>
            </div>
          ) : null}

          <ul className="mt-3 space-y-1 text-xs text-[#94A3B8]">
            {selectedNode.specs.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#10B981]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
        <h3 className="text-base font-bold text-[#F1F5F9]">
          Top 10 Fitur Paling Berpengaruh ({bestClean.name} · Clean Mode)
        </h3>
        <p className="mt-1 text-xs text-[#94A3B8]">
          Bobot fitur agregat setelah One-Hot Encoding untuk menentukan kelas trajectory pemain.
        </p>
        <div className="mt-3">
          <EChart option={featOption} height={310} label="Top 10 fitur paling berpengaruh" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {glossary.map((sec) => (
          <div key={sec.title} className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
            <h3 className="text-base font-bold text-[#F1F5F9]">{sec.title}</h3>
            <dl className="mt-4 divide-y divide-[#1E293B]">
              {sec.terms.map(([term, desc]) => (
                <div key={term} className="py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm font-bold text-[#10B981]">{term}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
