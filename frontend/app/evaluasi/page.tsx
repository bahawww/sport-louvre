"use client";

import { useMemo, useState } from "react";

import { ChartLegend, EChart, useChartColors } from "@/components/chart";
import { ConfusionMatrix } from "@/components/confusion-matrix";
import { PageHeader } from "@/components/page-header";
import { ChartSkeleton, ErrorState } from "@/components/states";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ScrollX } from "@/components/ui/scroll-x";
import { SegmentedControl } from "@/components/ui/segmented";
import { useApi, type OverviewResponse, type TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export default function EvaluasiPage() {
  const overview = useApi<OverviewResponse>("/overview");
  const preds = useApi<TestPredictionsResponse>("/test-predictions");
  const c = useChartColors();

  const [mode, setMode] = useState<"clean" | "leakage">("clean");
  const [modelIdx, setModelIdx] = useState(2); // Default Logistic Regression (best clean)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const clsModels = useMemo(() => {
    if (!overview.data) return [];
    return mode === "clean"
      ? overview.data.classification.clean_mode.models
      : overview.data.classification.leakage_mode.models;
  }, [overview.data, mode]);

  const activeCls = clsModels[modelIdx] ?? clsModels[0];

  const scatterOption = useMemo(() => {
    if (!preds.data) return null;
    const rows = preds.data.rows;
    const maxVal = Math.max(...rows.map((r) => Math.max(r.actual_value_eur, r.pred_value_eur)), 100_000_000);
    return {
      grid: { left: 64, right: 24, top: 24, bottom: 48 },
      tooltip: {
        trigger: "item",
        formatter: (p: { data: [number, number, string, string] }) => {
          const [act, prd, name, club] = p.data;
          return `<strong>${name}</strong> (${club})<br/>Aktual: ${fmt.eur(act)}<br/>Prediksi: ${fmt.eur(prd)}<br/>Selisih: ${fmt.eur(prd - act)}`;
        },
      },
      xAxis: {
        type: "value",
        name: "Aktual (€)",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: { color: c.muted, fontSize: 12 },
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: c.grid } },
      },
      yAxis: {
        type: "value",
        name: "Prediksi (€)",
        nameTextStyle: { color: c.muted, fontSize: 12 },
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: c.grid } },
      },
      series: [
        {
          name: "Fair Value (y = x)",
          type: "line",
          symbol: "none",
          silent: true,
          lineStyle: { type: "dashed", color: c.axis, width: 1.5 },
          data: [
            [0, 0],
            [maxVal, maxVal],
          ],
        },
        {
          name: "Pemain Uji",
          type: "scatter",
          symbolSize: 9,
          itemStyle: {
            color: (p: { data: [number, number] }) =>
              p.data[1] - p.data[0] > 3_000_000
                ? c.ok
                : p.data[1] - p.data[0] < -3_000_000
                  ? c.series2
                  : c.accent,
            opacity: 0.85,
          },
          data: rows.map((r) => [r.actual_value_eur, r.pred_value_eur, r.name, r.peak_club]),
        },
      ],
    };
  }, [preds.data, c]);

  const featOption = useMemo(() => {
    if (!overview.data) return null;
    const regBest =
      overview.data.regression.models.find((m) => m.name === overview.data!.regression.best_model) ??
      overview.data.regression.models[0];
    const items = regBest.feature_importance.slice(0, 10);
    return {
      grid: { left: 150, right: 24, top: 12, bottom: 28 },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%`,
      },
      xAxis: {
        type: "value",
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
        splitLine: { lineStyle: { color: c.grid } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: items.map((i) => i.feature),
        axisLabel: { color: c.text, fontSize: 12 },
        axisLine: { lineStyle: { color: c.axis } },
      },
      series: [
        {
          name: "Feature Importance",
          type: "bar",
          barMaxWidth: 18,
          itemStyle: { color: c.accent, borderRadius: [0, 4, 4, 0] },
          data: items.map((i) => i.importance),
        },
      ],
    };
  }, [overview.data, c]);

  const filteredRows = useMemo(() => {
    if (!preds.data) return [];
    const q = search.trim().toLowerCase();
    return preds.data.rows.filter((r) => {
      if (statusFilter !== "ALL" && r.valuation_status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.peak_club.toLowerCase().includes(q) ||
        r.league_name.toLowerCase().includes(q)
      );
    });
  }, [preds.data, search, statusFilter]);

  if (overview.isError) {
    return <ErrorState message={(overview.error as Error)?.message} onRetry={() => overview.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title="Evaluasi Model & 102 Data Uji"
        description="Periksa confusion matrix klasifikasi trajectory, sebaran prediksi regresi terhadap nilai aktual, serta seluruh residual pada 102 pemain uji."
      />

      <Card panel>
        <CardHeader
          title="Confusion Matrix Klasifikasi"
          description="Pilih mode fitur (Clean vs Full Leakage) dan algoritma untuk melihat ketepatan prediksi per kelas."
          action={
            <div className="flex flex-wrap items-center gap-4">
              <SegmentedControl
                label="Mode fitur"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "clean", label: "Mode Clean" },
                  { value: "leakage", label: "Mode Leakage" },
                ]}
              />
              {clsModels.length ? (
                <Select
                  aria-label="Pilih model klasifikasi"
                  value={String(modelIdx)}
                  onChange={(e) => setModelIdx(Number(e.target.value))}
                >
                  {clsModels.map((m, idx) => (
                    <option key={m.name} value={idx}>
                      {m.name} ({fmt.pct(m.accuracy)})
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          }
        />
        <CardBody>
          {activeCls && overview.data ? (
            <>
              <div className="flex flex-wrap gap-6 text-[14px] text-ink-2">
                <span>
                  Akurasi: <strong className="text-ink">{fmt.pct(activeCls.accuracy)}</strong>
                </span>
                <span>
                  F1 Weighted: <strong className="text-ink">{fmt.pct(activeCls.f1_weighted)}</strong>
                </span>
                <span>
                  Precision: <strong className="text-ink">{fmt.pct(activeCls.precision_weighted)}</strong>
                </span>
                <span>
                  Recall: <strong className="text-ink">{fmt.pct(activeCls.recall_weighted)}</strong>
                </span>
              </div>
              <ConfusionMatrix
                classes={overview.data.classification.classes}
                matrix={activeCls.confusion_matrix}
                caption={`Confusion matrix untuk ${activeCls.name} pada mode ${mode}`}
              />
            </>
          ) : (
            <ChartSkeleton height={260} />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-10 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Aktual vs Prediksi (current_value_eur)"
            description="Titik di atas garis putus-putus menandakan nilai prediksi model lebih tinggi dari harga pasar saat ini (indikasi undervalued)."
          />
          <CardBody>
            <ChartLegend
              items={[
                { label: "Undervalued (> +€3M)", color: c.ok },
                { label: "Fair Value", color: c.accent },
                { label: "Overvalued (< -€3M)", color: c.series2 },
              ]}
            />
            {scatterOption ? (
              <EChart
                option={scatterOption}
                height={340}
                label="Scatter plot nilai pasar aktual vs prediksi regresi untuk 102 pemain uji"
              />
            ) : (
              <ChartSkeleton height={340} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Feature Importance (Regresi Terbaik)"
            description="Faktor karier paling menentukan dalam menaksir nilai pasar saat ini tanpa fitur bocoran."
          />
          <CardBody>
            {featOption ? (
              <EChart
                option={featOption}
                height={365}
                label="Grafik batang 10 fitur terpenting pada model regresi terbaik"
              />
            ) : (
              <ChartSkeleton height={365} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Tabel 102 Data Uji (${filteredRows.length} tampil)`}
          description="Bandingkan trajectory aktual vs prediksi Clean serta residual nilai pasar dalam Euro."
          action={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Cari pemain / klub">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Contoh: Haaland, Arsenal..."
                />
              </Field>
              <Field label="Status valuasi">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="ALL">Semua status</option>
                  <option value="Undervalued">Undervalued</option>
                  <option value="Fair">Fair</option>
                  <option value="Overvalued">Overvalued</option>
                </Select>
              </Field>
            </div>
          }
        />
        <CardBody>
          <ScrollX>
            <table className="ua-table">
              <thead>
                <tr>
                  <th scope="col">Pemain</th>
                  <th scope="col">Liga</th>
                  <th scope="col">Aktual</th>
                  <th scope="col">Prediksi Clean</th>
                  <th scope="col" className="text-right">
                    Nilai Aktual
                  </th>
                  <th scope="col" className="text-right">
                    Prediksi Nilai
                  </th>
                  <th scope="col" className="text-right">
                    Residual
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.player_id}>
                    <td>
                      <span className="font-bold">{r.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {r.peak_club} · {r.age} thn
                      </span>
                    </td>
                    <td>{r.league_name}</td>
                    <td>
                      <TrajectoryBadge value={r.actual_trajectory} />
                    </td>
                    <td>
                      <TrajectoryBadge value={r.pred_trajectory_clean} />
                    </td>
                    <td className="text-right font-semibold">{fmt.eur(r.actual_value_eur)}</td>
                    <td className="text-right">{fmt.eur(r.pred_value_eur)}</td>
                    <td
                      className={`text-right font-bold ${
                        r.residual_eur > 0
                          ? "text-[var(--ispu-baik-fg)]"
                          : r.residual_eur < 0
                            ? "text-danger"
                            : ""
                      }`}
                    >
                      {r.residual_eur > 0 ? "+" : ""}
                      {fmt.eur(r.residual_eur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </CardBody>
      </Card>
    </>
  );
}
