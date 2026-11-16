"use client";

import { Panel, SectionHeader } from "@/components/ui";
import type { OverviewResponse } from "@/lib/api";
import { COURSE_CLASSIFIER, COURSE_REGRESSOR } from "@/lib/models";

type Simple = NonNullable<OverviewResponse["simple_models"]>;
type TreeNode = Simple["decision_tree"]["nodes"][number];

const pct1 = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x)}%`;
const num = (x: number) => new Intl.NumberFormat("id-ID").format(Math.round(x));

const CLASSIFIERS: Record<string, { name: string; how: string }> = {
  "Ordinal HGB (calibrated)": {
    name: "Gradient boosting berurutan",
    how: "Ratusan pohon kecil dilatih bergantian, tiap pohon memperbaiki salah pohon sebelumnya. Model tahu keempat tren itu berurutan dari naik sampai jatuh.",
  },
  "HistGradientBoosting (calibrated)": {
    name: "Gradient boosting biasa",
    how: "Sama, tapi keempat tren dianggap kategori lepas tanpa urutan.",
  },
  "Random Forest": {
    name: "Random forest",
    how: "Ratusan pohon dilatih terpisah pada potongan data acak, lalu memilih bersama.",
  },
  "Logistic Regression": {
    name: "Regresi logistik",
    how: "Tiap fitur diberi bobot tetap, lalu dijumlah menjadi peluang.",
  },
  "Decision Tree": {
    name: "Pohon keputusan",
    how: "Satu pohon berisi pertanyaan ya/tidak. Bisa dibaca dari atas ke bawah.",
  },
  "Persistence (last state)": {
    name: "Tanpa model",
    how: "Menganggap tren pemain sama seperti update terakhir. Ini pembanding.",
  },
};

const REGRESSORS: Record<string, { name: string; how: string }> = {
  "HistGradientBoosting (log)": {
    name: "Gradient boosting",
    how: "Ratusan pohon kecil menebak seberapa jauh harga bergeser dari harga terakhir.",
  },
  "Linear Regression (log)": {
    name: "Regresi linear",
    how: "Tiap fitur diberi bobot tetap. Pergeseran harga adalah jumlah bobot kali nilai fitur.",
  },
  "Ridge (log)": {
    name: "Regresi ridge",
    how: "Regresi linear dengan rem, supaya bobot tidak membesar saat fitur saling mirip.",
  },
  "Naive (last value)": {
    name: "Tanpa model",
    how: "Menganggap harga berikutnya sama dengan harga terakhir. Ini pembanding.",
  },
};

const TREND_SHORT: Record<string, { label: string; color: string }> = {
  rising: { label: "Naik / dekat puncak", color: "var(--chart-1)" },
  stable: { label: "Stabil", color: "var(--chart-2)" },
  declining: { label: "Menurun", color: "var(--chart-3)" },
  falling_sharply: { label: "Jatuh tajam", color: "var(--chart-4)" },
};

const POSITION_ID: Record<string, string> = {
  Forward: "Penyerang",
  Midfielder: "Gelandang",
  Defender: "Bek",
  Goalkeeper: "Kiper",
};

/** One question of the tree in plain words. `yes` is the branch where feature <= threshold. */
function question(feature: string, t: number): string {
  if (feature === "dd_last") return `Harga terakhir turun paling banyak ${Math.round(t * 100)}% dari puncak?`;
  if (feature === "range_pos") return `Harga terakhir di bawah ${Math.round(t * 100)}% rentang harga kariernya?`;
  if (feature === "ret1") {
    const change = Math.round((Math.exp(t) - 1) * 100);
    return change < 0 ? `Update terakhir turun ${-change}% atau lebih?` : `Update terakhir naik paling banyak ${change}%?`;
  }
  if (feature === "age") return `Usia paling tinggi ${t.toFixed(1).replace(".", ",")} tahun?`;
  if (feature === "yrs_since_peak") return `Puncak harga paling lama ${t.toFixed(1).replace(".", ",")} tahun lalu?`;
  if (feature === "n_points") return `Punya paling banyak ${Math.floor(t)} valuasi?`;
  return `${feature} <= ${t}?`;
}

function ModelList({
  rows,
  chosen,
  scoreLabel,
}: {
  rows: { key: string; name: string; how: string; score: string }[];
  chosen: string;
  scoreLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left text-xs text-muted">
            <th className="py-1.5 pr-3 font-medium">Model</th>
            <th className="py-1.5 pl-3 text-right font-medium whitespace-nowrap">{scoreLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2 pr-3">
                <span className={r.key === chosen ? "font-semibold text-ink" : "text-ink"}>
                  {r.name}
                  {r.key === chosen ? " (dipakai)" : ""}
                </span>
                <span className="block text-xs leading-relaxed text-muted">{r.how}</span>
              </td>
              <td className="py-2 pl-3 text-right align-top tabular-nums text-ink">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bars around a zero line: how much more (or less) a group costs than the reference group. */
function PremiumBars({ data, reference }: { data: [string, number][]; reference: string }) {
  const max = Math.max(...data.map(([, v]) => Math.abs(v)), 1);
  // All groups above the reference: bars start at the left edge. Otherwise they grow from a centre line.
  const oneSided = data.every(([, v]) => v >= 0);
  const half = oneSided ? 100 : 50;
  return (
    <ul className="space-y-1.5 text-[13px]">
      {data.map(([label, v]) => (
        <li key={label} className="grid grid-cols-[112px_1fr_52px] items-center gap-2">
          <span className="truncate text-muted">{label}</span>
          <span className="relative h-2.5 rounded-full bg-raised">
            <span
              className="absolute top-0 h-2.5 rounded-full"
              style={{
                background: v >= 0 ? "var(--chart-1)" : "var(--chart-4)",
                left: oneSided ? 0 : v >= 0 ? "50%" : `${50 - (Math.abs(v) / max) * 50}%`,
                width: `${(Math.abs(v) / max) * half}%`,
              }}
            />
            {oneSided ? null : <span className="absolute left-1/2 top-[-2px] h-3.5 w-px bg-control" />}
          </span>
          <span className="text-right tabular-nums text-ink">{signed(v)}</span>
        </li>
      ))}
      <li className="grid grid-cols-[112px_1fr_52px] items-center gap-2 text-muted">
        <span className="truncate">{reference}</span>
        <span className="text-xs">pembanding</span>
        <span className="text-right tabular-nums">0%</span>
      </li>
    </ul>
  );
}

function AgeCurve({ points, peak }: { points: { age: number; vs_peak_pct: number }[]; peak: number | null }) {
  const W = 300;
  const H = 110;
  const x = (a: number) => 8 + ((a - points[0].age) / (points[points.length - 1].age - points[0].age)) * (W - 16);
  const y = (p: number) => 10 + (-p / 100) * (H - 34);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[340px]" role="img" aria-label="Harga menurut usia, dibanding usia puncak">
      <line x1="8" x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--grid)" strokeDasharray="3 4" />
      <path
        d={points.map((p, i) => `${i ? "L" : "M"}${x(p.age).toFixed(1)} ${y(Math.max(-100, p.vs_peak_pct)).toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {peak ? <circle cx={x(peak)} cy={y(0)} r="4" fill="var(--chart-2)" /> : null}
      {points
        .filter((_, i) => i % 3 === 0)
        .map((p) => (
          <text key={p.age} x={x(p.age)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {p.age}
          </text>
        ))}
    </svg>
  );
}

/** Merge sibling leaves that give the same answer, repeatedly. Predictions stay the same. */
function mergeSameAnswers(nodes: TreeNode[]): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, { ...n }]));
  const visit = (id: number): TreeNode => {
    const n = byId.get(id)!;
    if (n.leaf) return n;
    const yes = visit(n.yes!);
    const no = visit(n.no!);
    if (yes.leaf && no.leaf && yes.majority === no.majority) {
      const players = yes.players + no.players;
      byId.delete(yes.id);
      byId.delete(no.id);
      Object.assign(n, {
        leaf: true,
        feature: null,
        threshold: null,
        yes: null,
        no: null,
        players,
        majority: yes.majority,
        majority_share: (yes.players * yes.majority_share + no.players * no.majority_share) / players,
      });
    }
    return n;
  };
  visit(0);
  return [...byId.values()];
}

/** The fitted tree, laid out top-down. Left branch is "ya". */
function TreeDiagram({ nodes: fitted }: { nodes: TreeNode[] }) {
  const nodes = mergeSameAnswers(fitted);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = new Map<number, { x: number; depth: number }>();
  let leafCount = 0;
  const place = (id: number, depth: number): number => {
    const n = byId.get(id)!;
    const x = n.leaf ? leafCount++ : (place(n.yes!, depth + 1) + place(n.no!, depth + 1)) / 2;
    pos.set(id, { x, depth });
    return x;
  };
  place(0, 0);
  const COL = 190;
  const ROW_H = 92;
  const depthMax = Math.max(...[...pos.values()].map((p) => p.depth));
  const W = leafCount * COL;
  const H = depthMax * ROW_H + 70;
  const cx = (id: number) => pos.get(id)!.x * COL + COL / 2;
  const cy = (id: number) => pos.get(id)!.depth * ROW_H + 26;

  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ minWidth: Math.min(W, 760) }}
        className="block h-auto w-full"
        role="img"
        aria-label="Pohon keputusan untuk menebak tren harga"
      >
        {nodes
          .filter((n) => !n.leaf)
          .flatMap((n) =>
            ([n.yes!, n.no!] as const).map((child, k) => (
              <g key={`${n.id}-${child}`}>
                <path
                  d={`M${cx(n.id)} ${cy(n.id) + 20} C${cx(n.id)} ${cy(n.id) + 50} ${cx(child)} ${cy(child) - 50} ${cx(child)} ${cy(child) - 20}`}
                  fill="none"
                  stroke="var(--control)"
                  strokeWidth="1.5"
                />
                <text
                  x={(cx(n.id) + cx(child)) / 2 + (k === 0 ? -10 : 10)}
                  y={(cy(n.id) + cy(child)) / 2 + 2}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--muted)"
                >
                  {k === 0 ? "ya" : "tidak"}
                </text>
              </g>
            )),
          )}
        {nodes.map((n) => {
          const x = cx(n.id);
          const y = cy(n.id);
          if (n.leaf) {
            const t = TREND_SHORT[n.majority] ?? { label: n.majority, color: "var(--muted)" };
            return (
              <g key={n.id}>
                <rect
                  x={x - 60}
                  y={y - 20}
                  width="120"
                  height="50"
                  rx="8"
                  fill={`color-mix(in srgb, ${t.color} 14%, var(--surface))`}
                  stroke={t.color}
                  strokeWidth="1.5"
                />
                <text x={x} y={y - 2} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)">
                  {t.label}
                </text>
                <text x={x} y={y + 14} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {num(n.players)} pemain, {Math.round(n.majority_share * 100)}%
                </text>
              </g>
            );
          }
          return (
            <foreignObject key={n.id} x={x - 84} y={y - 22} width="168" height="46">
              <div className="flex h-full items-center justify-center rounded-control border border-control bg-raised px-2 text-center text-[11px] leading-tight text-ink">
                {question(n.feature!, n.threshold!)}
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}

export function ModelExplainer({ overview }: { overview: OverviewResponse }) {
  const trend = overview.classification.trend;
  const forecast = overview.regression.tasks?.forecast;
  const simple = overview.simple_models;
  if (!trend || !forecast) return null;

  const persistence = trend.headline.persistence.accuracy;
  const clfRows = trend.models.map((m) => ({
    key: m.name,
    name: CLASSIFIERS[m.name]?.name ?? m.name,
    how: CLASSIFIERS[m.name]?.how ?? "",
    score: pct1(m.accuracy),
  }));
  const regRows = forecast.models.map((m) => ({
    key: m.name,
    name: REGRESSORS[m.name]?.name ?? m.name,
    how: REGRESSORS[m.name]?.how ?? "",
    score: m.medape !== undefined ? pct1(m.medape) : "-",
  }));
  const lin = simple?.linear_regression;
  const tree = simple?.decision_tree;

  return (
    <>
      <Panel as="section" padding="md">
        <SectionHeader
          as="h2"
          title="Model yang dipakai"
          subtitle="Situs ini menjawab dua pertanyaan. Klasifikasi: tren harga pemain masuk kelompok mana. Prediksi: berapa harga di update berikutnya. Tiap pertanyaan dicoba dengan beberapa jenis model. Model utamanya pohon keputusan dan regresi linear, sesuai ketentuan tugas."
          className="mb-4"
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Klasifikasi tren</h3>
            <p className="mt-1 mb-2 text-[13px] leading-relaxed text-muted">
              Jawabannya satu dari empat kelompok: naik, stabil, menurun, jatuh tajam. Angka di kanan adalah porsi pemain uji
              yang tertebak benar. Tanpa model hasilnya {pct1(persistence)}.
            </p>
            <ModelList rows={clfRows} chosen={COURSE_CLASSIFIER} scoreLabel="Benar" />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Pohon keputusan dipakai karena ketentuan tugas, bukan karena skornya paling tinggi. Di validasi silang,
              peluang dari gradient boosting berurutan lebih bisa dipercaya, jadi tab Simulasi tetap memakai model itu.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Prediksi harga</h3>
            <p className="mt-1 mb-2 text-[13px] leading-relaxed text-muted">
              Jawabannya angka dalam euro. Angka di kanan adalah meleset tengah: separuh tebakan meleset kurang dari itu.
              Makin kecil makin baik.
            </p>
            <ModelList rows={regRows} chosen={COURSE_REGRESSOR} scoreLabel="Meleset tengah" />
          </div>
        </div>
      </Panel>

      {lin && tree ? (
        <>
          <Panel as="section" padding="md">
            <SectionHeader
              as="h2"
              title="Regresi linear: harga dari usia, posisi, dan liga"
              subtitle="Kegunaan: membaca berapa selisih harga antar posisi dan antar liga. Model ini hanya diberi tiga hal itu, tanpa riwayat harga, jadi bobotnya bisa dibaca langsung."
              className="mb-4"
            />
            <div className="grid gap-x-8 gap-y-5 lg:grid-cols-3">
              <div>
                <p className="mb-2 text-[13px] text-muted">Harga dibanding {POSITION_ID[lin.position_reference]?.toLowerCase() ?? lin.position_reference}, pada usia dan liga yang sama</p>
                <PremiumBars
                  data={Object.entries(lin.position_premium_pct)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => [POSITION_ID[k] ?? k, v])}
                  reference={POSITION_ID[lin.position_reference] ?? lin.position_reference}
                />
              </div>
              <div>
                <p className="mb-2 text-[13px] text-muted">Harga dibanding {lin.league_reference}, pada usia dan posisi yang sama</p>
                <PremiumBars
                  data={Object.entries(lin.league_premium_pct).sort((a, b) => b[1] - a[1])}
                  reference={lin.league_reference}
                />
              </div>
              <div>
                <p className="mb-1 text-[13px] text-muted">
                  Harga menurut usia{lin.peak_age ? `, puncaknya di ${lin.peak_age.toFixed(1).replace(".", ",")} tahun` : ""}
                </p>
                <AgeCurve points={lin.age_effect_pct} peak={lin.peak_age} />
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Dilatih pada {num(lin.train_players)} pemain, diuji pada {num(lin.test_players)}. Tiga hal itu hanya menjelaskan{" "}
              {Math.round(lin.r2_log_test * 100)}% perbedaan harga antar pemain, dan tebakannya meleset tengah{" "}
              {pct1(lin.median_abs_pct_error_test)}. Jadi model ini dipakai untuk membaca pola di dataset ini, bukan untuk menebak
              harga. Regresi linear yang diberi riwayat harga ada di tabel Prediksi harga di atas.
            </p>
          </Panel>

          <Panel as="section" padding="md">
            <SectionHeader
              as="h2"
              title="Pohon keputusan: aturan menebak tren"
              subtitle="Kegunaan: melihat aturan paling sederhana yang memisahkan pemain naik dari pemain turun. Baca dari atas, ikuti ya atau tidak sampai kotak berwarna."
              className="mb-4"
            />
            <TreeDiagram nodes={tree.nodes} />
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Pohon ini benar {pct1(tree.accuracy_test)} pada {num(tree.test_players)} pemain uji. Tanpa model{" "}
              {pct1(persistence)}, gradient boosting {pct1(trend.headline.metrics.accuracy)}. Angka di tiap kotak: jumlah pemain
              latih yang sampai di situ, dan berapa persen yang memang masuk kelompok itu. Cabang yang ujungnya sama sudah digabung. Batas yang ditemukan pohon hampir sama
              dengan definisi kelompoknya sendiri (turun 20%, 30%, dan 60% dari puncak): tren pemain jarang pindah kelompok
              dalam satu update, dan itu sebabnya tebakan tanpa model sudah tinggi.
            </p>
          </Panel>
        </>
      ) : null}
    </>
  );
}
