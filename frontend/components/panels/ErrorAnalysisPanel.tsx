"use client";

import { useMemo, useState } from "react";

import type { OverviewResponse, TestPredictionRow, TestPredictionsResponse } from "@/lib/api";
import { fmt, TREND_META } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Badge,
  DataTable,
  type DataTableColumn,
  Meter,
  type MeterTone,
  PageHeader,
  Panel,
  PlayerCell,
  SectionHeader,
  Segmented,
  type SegmentedOption,
  SplitMeter,
} from "@/components/ui";

const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** How far a guess landed from the real price, in words a reader can picture. */
const BUCKETS: { label: string; hint: string; max: number; tone: MeterTone; dotClass: string }[] = [
  { label: "Hampir tepat", hint: "selisih sampai 10%", max: 0.1, tone: "mint", dotClass: "bg-accent" },
  { label: "Cukup dekat", hint: "10 sampai 25%", max: 0.25, tone: "sky", dotClass: "bg-info" },
  { label: "Meleset", hint: "25 sampai 50%", max: 0.5, tone: "amber", dotClass: "bg-warning" },
  { label: "Meleset jauh", hint: "lebih dari 50%", max: Infinity, tone: "crimson", dotClass: "bg-negative" },
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
    label: "Level harga",
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

const SEGMENT_OPTIONS: readonly SegmentedOption<GroupId>[] = [
  { value: "age", label: "Usia" },
  { value: "value", label: "Level harga" },
  { value: "position", label: "Posisi" },
  { value: "league", label: "Liga" },
];

interface BucketRow {
  label: string;
  hint: string;
  dotClass: string;
  modelCount: number;
  modelPct: string;
  naiveCount: number;
  naivePct: string;
}

interface SegmentRow {
  name: string;
  n: number;
  model: number;
  naive: number;
  trend: number;
}

function MissTable({ rows, tone }: { rows: TestPredictionRow[]; tone: "low" | "high" }) {
  const isLow = tone === "low";

  const columns: DataTableColumn<TestPredictionRow>[] = [
    {
      key: "player",
      header: "Pemain",
      align: "left",
      cell: (r) => (
        <PlayerCell
          playerId={r.player_id}
          name={r.name}
          club={r.peak_club}
          meta={`${r.age} thn`}
          avatarSize={28}
        />
      ),
    },
    {
      key: "actual",
      header: "Aktual",
      align: "right",
      cell: (r) => (
        <span
          className={cn(
            "font-semibold tabular-nums",
            isLow ? "text-positive" : "text-negative",
          )}
        >
          {fmt.eurShort(r.actual_value_eur)}
        </span>
      ),
    },
    {
      key: "forecast",
      header: "Prediksi",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted">
          {fmt.eurShort(r.forecast_value_eur ?? 0)}
        </span>
      ),
    },
    {
      key: "diff",
      header: "Selisih",
      align: "right",
      cell: (r) => {
        const diff = (r.forecast_value_eur ?? 0) - r.actual_value_eur;
        return (
          <span
            className={cn(
              "font-medium tabular-nums",
              isLow ? "text-positive" : "text-negative",
            )}
          >
            {diff > 0 ? `+${fmt.eurShort(diff)}` : fmt.eurShort(diff)}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.player_id}
      compact
      ariaLabel={isLow ? "Pemain yang paling diremehkan" : "Pemain yang paling dilebihkan"}
      mobileCard={(r) => {
        const diff = (r.forecast_value_eur ?? 0) - r.actual_value_eur;
        return (
          <div className="rounded-control border border-border bg-surface p-3 flex flex-col gap-2.5">
            <PlayerCell
              playerId={r.player_id}
              name={r.name}
              club={r.peak_club}
              meta={`${r.age} thn`}
              avatarSize={32}
            />
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-rule text-xs">
              <div>
                <span className="block text-muted">Aktual</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    isLow ? "text-positive" : "text-negative",
                  )}
                >
                  {fmt.eurShort(r.actual_value_eur)}
                </span>
              </div>
              <div>
                <span className="block text-muted">Prediksi</span>
                <span className="tabular-nums text-ink">
                  {fmt.eurShort(r.forecast_value_eur ?? 0)}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-muted">Selisih</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    isLow ? "text-positive" : "text-negative",
                  )}
                >
                  {diff > 0 ? `+${fmt.eurShort(diff)}` : fmt.eurShort(diff)}
                </span>
              </div>
            </div>
          </div>
        );
      }}
    />
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
    const out: SegmentRow[] = [...map.entries()]
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

  const close = stats.model[0] + stats.model[1];
  const naiveClose = stats.naive[0] + stats.naive[1];
  const fc = overview.regression.tasks?.forecast.headline;

  const bucketRows: BucketRow[] = useMemo(
    () =>
      BUCKETS.map((b, i) => ({
        label: b.label,
        hint: b.hint,
        dotClass: b.dotClass,
        modelCount: stats.model[i],
        modelPct: pct0(stats.model[i] / total),
        naiveCount: stats.naive[i],
        naivePct: pct0(stats.naive[i] / total),
      })),
    [stats, total],
  );

  const bucketColumns: DataTableColumn<BucketRow>[] = [
    {
      key: "label",
      header: "Hasil tebakan",
      align: "left",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("size-2 rounded-full shrink-0", r.dotClass)} />
          <span className="font-medium text-ink">{r.label}</span>
          <span className="text-muted text-xs">{r.hint}</span>
        </span>
      ),
    },
    {
      key: "model",
      header: "Model",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums">
          <span className="font-medium text-ink">{fmt.int(r.modelCount)}</span>{" "}
          <span className="text-muted text-xs">({r.modelPct})</span>
        </span>
      ),
    },
    {
      key: "naive",
      header: "Tanpa model",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted">
          {fmt.int(r.naiveCount)} <span className="text-xs">({r.naivePct})</span>
        </span>
      ),
    },
  ];

  const segmentColumns: DataTableColumn<SegmentRow>[] = [
    {
      key: "name",
      header: "Kelompok",
      align: "left",
      cell: (s) => <span className="font-medium text-ink">{s.name}</span>,
    },
    {
      key: "n",
      header: "Pemain",
      align: "right",
      cell: (s) => <span className="text-muted tabular-nums">{fmt.int(s.n)}</span>,
    },
    {
      key: "model",
      header: "Tebakan yang dekat",
      align: "left",
      cell: (s) => (
        <div className="flex items-center gap-3 min-w-[140px] max-w-[260px]">
          <div className="h-1.5 flex-1 rounded-full bg-raised overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                s === worst ? "bg-warning" : "bg-accent",
              )}
              style={{ width: `${Math.min(100, Math.max(0, s.model * 100))}%` }}
            />
          </div>
          <span className="w-10 text-right font-medium tabular-nums text-ink text-xs">
            {pct0(s.model)}
          </span>
        </div>
      ),
    },
    {
      key: "naive",
      header: "Tanpa model",
      align: "right",
      cell: (s) => {
        const isTie = Math.round(s.model * 100) === Math.round(s.naive * 100);
        const better = s.model > s.naive;
        return (
          <span className="tabular-nums">
            <span className="text-muted">{pct0(s.naive)}</span>{" "}
            <span
              className={cn(
                "text-xs font-medium ml-1",
                isTie ? "text-muted" : better ? "text-positive" : "text-warning",
              )}
            >
              {isTie ? "setara" : better ? "model unggul" : "model kalah"}
            </span>
          </span>
        );
      },
    },
    {
      key: "trend",
      header: "Tren tertebak",
      align: "right",
      cell: (s) => <span className="tabular-nums text-ink">{pct0(s.trend)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Di mana model masih meleset"
        subtitle={
          <>
            Model diuji pada {fmt.int(total)} pemain yang tidak pernah dilihatnya. Untuk tiap pemain ia menebak harga di update
            berikutnya, lalu tebakan itu dibandingkan dengan harga yang benar-benar keluar. Dari {fmt.int(total)} tebakan,{" "}
            <span className="font-semibold text-ink">
              {fmt.int(close)} ({pct0(close / total)}) selisihnya di bawah 25%
            </span>
            . Tebakan biasanya meleset sekitar {pct0(stats.typical)} dari harga asli.
          </>
        }
      />

      <Panel padding="md">
        <SectionHeader
          as="h2"
          title="Seberapa dekat tebakan harganya"
          className="mb-4"
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <SplitMeter
              title="Tebakan model"
              height="md"
              showLegend={false}
              max={total}
              segments={BUCKETS.map((b, i) => ({
                key: b.label,
                label: b.label,
                value: stats.model[i],
                tone: b.tone,
              }))}
            />
            <SplitMeter
              title="Tanpa model: menganggap harga tidak berubah"
              height="md"
              showLegend={false}
              max={total}
              segments={BUCKETS.map((b, i) => ({
                key: b.label,
                label: b.label,
                value: stats.naive[i],
                tone: b.tone,
              }))}
            />
            <div className="pt-2">
              <DataTable
                columns={bucketColumns}
                rows={bucketRows}
                rowKey={(r) => r.label}
                compact
                ariaLabel="Distribusi galat tebakan"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-3 text-[13px] leading-relaxed text-muted">
            <p>
              <strong className="font-semibold text-ink">Cara membacanya.</strong> Makin panjang bagian hijau, makin banyak
              tebakan yang dekat dengan harga asli.
            </p>
            <p>
              {naiveClose > close ? (
                <>
                  Untuk satu update ke depan, menganggap harga tetap ternyata sedikit lebih sering dekat:{" "}
                  <span className="text-warning font-medium">
                    {fmt.int(naiveClose)} lawan {fmt.int(close)} tebakan
                  </span>
                  .
                </>
              ) : (
                <>
                  Model sedikit lebih sering dekat daripada menganggap harga tetap:{" "}
                  <span className="text-positive font-medium">
                    {fmt.int(close)} lawan {fmt.int(naiveClose)} tebakan
                  </span>
                  .
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
      </Panel>

      <Panel padding="md">
        <SectionHeader
          as="h2"
          title="Pada pemain seperti apa model paling sering salah"
          subtitle={
            worst && best && worst !== best ? (
              <span>
                Paling sulit ditebak: <strong className="font-semibold text-ink">{worst.name.toLowerCase()}</strong>, hanya{" "}
                {pct0(worst.model)} tebakan yang dekat. Paling mudah: {best.name.toLowerCase()}, {pct0(best.model)} dekat.
              </span>
            ) : undefined
          }
          actions={
            <Segmented
              options={SEGMENT_OPTIONS}
              value={group}
              onChange={setGroup}
              ariaLabel="Kelompokkan pemain"
            />
          }
          className="mb-4"
        />
        <DataTable
          columns={segmentColumns}
          rows={segments}
          rowKey={(s) => s.name}
          ariaLabel="Analisis segmen pemain"
          mobileCard={(s) => {
            const isTie = Math.round(s.model * 100) === Math.round(s.naive * 100);
            const better = s.model > s.naive;
            return (
              <div className="rounded-control border border-border bg-surface p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink text-sm">{s.name}</span>
                  <span className="text-xs text-muted tabular-nums">{fmt.int(s.n)} pemain</span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted">Tebakan yang dekat</span>
                    <span className="font-medium text-ink tabular-nums">{pct0(s.model)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-raised overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width]",
                        s === worst ? "bg-warning" : "bg-accent",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, s.model * 100))}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-rule text-xs">
                  <div>
                    <span className="text-muted">Tanpa model: </span>
                    <span className="tabular-nums text-muted">{pct0(s.naive)}</span>{" "}
                    <span
                      className={cn(
                        "font-medium",
                        isTie ? "text-muted" : better ? "text-positive" : "text-warning",
                      )}
                    >
                      ({isTie ? "setara" : better ? "model unggul" : "model kalah"})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Tren: </span>
                    <span className="font-medium text-ink tabular-nums">{pct0(s.trend)}</span>
                  </div>
                </div>
              </div>
            );
          }}
        />
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          &quot;Tebakan yang dekat&quot; adalah bagian tebakan yang selisihnya dengan harga asli di bawah 25%. Kolom &quot;tanpa
          model&quot; menghitung hal yang sama kalau harga dianggap tidak berubah. &quot;Tren tertebak&quot; adalah seberapa sering model benar soal posisi harga terhadap puncak
          karier. Kelompok dengan kurang dari 15 pemain tidak ditampilkan.
        </p>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Panel className="flex flex-col" padding="md">
          <div>
            <SectionHeader
              as="h2"
              title="Pemain yang paling diremehkan"
              subtitle="Tebakan yang terlalu rendah. Pemain yang harganya melonjak lebih tinggi dari perkiraan. Kebanyakan pemain muda yang sedang naik daun: lonjakan seperti ini datang dari performa di lapangan, yang tidak ada di data."
            />
            <div className="mt-4">
              <MissTable rows={stats.tooLow} tone="low" />
            </div>
          </div>
        </Panel>
        <Panel className="flex flex-col" padding="md">
          <div>
            <SectionHeader
              as="h2"
              title="Pemain yang paling dilebihkan"
              subtitle="Tebakan yang terlalu tinggi. Pemain yang harganya turun padahal model mengira tetap atau naik. Biasanya pemain mahal yang sedang di puncak, lalu dikoreksi."
            />
            <div className="mt-4">
              <MissTable rows={stats.tooHigh} tone="high" />
            </div>
          </div>
        </Panel>
      </div>

      {trend && confusions.length ? (
        <Panel padding="md">
          <SectionHeader
            as="h2"
            title="Salah tebak tren yang paling sering"
            subtitle={
              <>
                Selain harga, model menebak tren: apakah pemain masih dekat puncak kariernya, stabil, menurun, atau jatuh tajam. Ia
                benar pada {fmt.int(trendRight)} dari {fmt.int(total)} pemain ({pct0(trendRight / total)}). Empat kesalahan terbanyak:
              </>
            }
            className="mb-4"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {confusions.map((c) => (
              <div
                key={`${c.actual}-${c.pred}`}
                className="rounded-control border border-border bg-surface p-3.5 flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="w-9 shrink-0 text-right text-lg font-semibold tabular-nums text-ink">
                    {c.n}
                  </span>
                  <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>pemain yang sebenarnya</span>
                      <Badge className={TREND_META[c.actual]?.className} size="sm">
                        {TREND_META[c.actual]?.label.toLowerCase() ?? c.actual}
                      </Badge>
                      <span>ditebak</span>
                      <Badge className={TREND_META[c.pred]?.className} size="sm">
                        {TREND_META[c.pred]?.label.toLowerCase() ?? c.pred}
                      </Badge>
                    </div>
                    <span className="block mt-1 text-xs text-muted">
                      dari {c.of} pemain {TREND_META[c.actual]?.label.toLowerCase() ?? c.actual} ({TREND_META[c.actual]?.hint})
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-rule">
                  <Meter
                    value={c.n}
                    max={c.of}
                    tone="amber"
                    valueText={`${c.n} dari ${c.of} (${Math.round((c.n / c.of) * 100)}%)`}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Kelompok &quot;stabil&quot; paling sering salah karena rentangnya sempit: selisih harga kecil saja sudah memindahkan
            pemain ke kelompok sebelahnya.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
