"use client";

import { useMemo } from "react";

import { EChart } from "@/components/chart";
import type { OverviewResponse } from "@/lib/api";

type WfNode = { id: string; x: number; y: number; title: string; sub: string; color?: string };

const W = 172;
const H = 74;

const NODES: WfNode[] = [
  { id: "csv", x: 8, y: 134, title: "1. Muat 2 CSV", sub: "508 pemain + 9.764 riwayat" },
  {
    id: "lag",
    x: 212,
    y: 134,
    title: "2. Fitur Pra-Akhir",
    sub: "Ekstrak vals[:-1], buang bocoran",
  },
  {
    id: "prep",
    x: 416,
    y: 134,
    title: "3. Preprocessing",
    sub: "Imputer + Scaler + OHE",
  },
  {
    id: "split",
    x: 620,
    y: 134,
    title: "4. Split 80 : 20",
    sub: "Stratified, seed 42 (406 / 102)",
  },
  {
    id: "rf",
    x: 840,
    y: 20,
    title: "Random Forest",
    sub: "400 trees · Clean 87,25%",
    color: "#10B981",
  },
  {
    id: "lr",
    x: 840,
    y: 134,
    title: "Logistic Regression",
    sub: "C=10 · F1 terbaik 85,80%",
    color: "#38BDF8",
  },
  {
    id: "gb",
    x: 840,
    y: 248,
    title: "Gradient Boosting",
    sub: "200 trees · Clean 84,31%",
    color: "#F59E0B",
  },
  {
    id: "score",
    x: 1048,
    y: 134,
    title: "5. Uji 102 Sampel",
    sub: "Akurasi, F1, R², MAE, Residual",
  },
  {
    id: "audit",
    x: 1252,
    y: 48,
    title: "Audit Leakage",
    sub: "Bandingkan Clean vs Full",
  },
  {
    id: "serve",
    x: 1252,
    y: 220,
    title: "FastAPI & Simulator",
    sub: "API live + What-If Scouting",
  },
];

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

const BY_ID: Record<string, WfNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

function edgePath(a: WfNode, b: WfNode): string {
  const x1 = a.x + W;
  const y1 = a.y + H / 2;
  const x2 = b.x;
  const y2 = b.y + H / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 6} ${y2}`;
}

const GLOSSARY: { title: string; terms: [string, string][] }[] = [
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
        "Pembagian 406 data latih dan 102 data uji (random_state=42) yang menjaga proporsi 5 kelas trajectory tetap seimbang di kedua sisi.",
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
        "Ensemble 400 pohon keputusan paralel. Menangkap interaksi non-linear antara usia, drawdown, dan momentum pra-akhir dengan akurasi Clean tertinggi (87,25%).",
      ],
      [
        "Logistic Regression (C=10)",
        "Model linear multinomial dengan regularisasi L2. Menghasilkan F1-weighted tertinggi (85,80%) serta probabilitas kelas yang terkalibrasi baik untuk Simulator Scouting.",
      ],
      [
        "Gradient Boosting (200 trees)",
        "Pohon sekuensial yang memperbaiki residual kesalahan pohon sebelumnya. Pada regresi, menaksir current_value_eur dengan R² tinggi bersama Linear Regression (R² = 0,9798).",
      ],
      [
        "Scouting Verdict & Residual",
        "Selisih antara taksiran wajar model dan harga pasar aktual (pred - actual). Nilai positif besar menandakan pemain berpotensi undervalued (Hidden Gem).",
      ],
    ],
  },
];

export function PenjelasanPanel({ overview }: { overview: OverviewResponse }) {
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
        <h3 className="text-base font-bold text-[#F1F5F9]">
          Arsitektur Workflow Machine Learning (End-to-End)
        </h3>
        <p className="mt-1 text-xs text-[#94A3B8]">
          Alur otomatis yang dijalankan FastAPI saat startup: memuat dua CSV Transfermarkt, mengekstrak
          fitur pra-akhir tanpa bocoran, melatih 3 model klasifikasi & 3 model regresi, lalu
          mengevaluasi pada 102 pemain uji.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[#1E293B] bg-[#0B1117] p-4">
          <svg
            viewBox="0 0 1434 340"
            role="img"
            aria-label="Diagram alur workflow Machine Learning Sport Louvre"
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
            </defs>
            {EDGES.map(([a, b]) => (
              <path
                key={`${a}-${b}`}
                d={edgePath(BY_ID[a], BY_ID[b])}
                fill="none"
                stroke="#334155"
                strokeWidth="2"
                markerEnd="url(#sl-arrow)"
              />
            ))}
            {NODES.map((n) => (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
                <rect
                  width={W}
                  height={H}
                  rx="10"
                  fill="#121A24"
                  stroke="#243244"
                  strokeWidth="1.5"
                />
                <rect width="5" height={H} rx="2.5" fill={n.color ?? "#334155"} />
                <text x="16" y="29" fontSize="13.5" fontWeight="800" fill="#F1F5F9">
                  {n.title}
                </text>
                <foreignObject x="16" y="35" width={W - 24} height={H - 38}>
                  <p className="m-0 text-[11px] leading-[1.35] text-[#94A3B8]">{n.sub}</p>
                </foreignObject>
              </g>
            ))}
          </svg>
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
        {GLOSSARY.map((sec) => (
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
