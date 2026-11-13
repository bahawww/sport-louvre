"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ChartLegend, EChart, useChartColors } from "@/components/chart";
import { CompareCard, MetricCard, MetricGrid } from "@/components/stat-card";
import { ChartSkeleton, ErrorState } from "@/components/states";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useApi, type OverviewResponse, type TestPredictionsResponse } from "@/lib/api";
import { fmt, trajectoryLabel } from "@/lib/format";

export default function OverviewPage() {
  const overview = useApi<OverviewResponse>("/overview");
  const preds = useApi<TestPredictionsResponse>("/test-predictions");
  const c = useChartColors();

  const cleanBest = useMemo(() => {
    if (!overview.data) return null;
    const ms = overview.data.classification.clean_mode.models;
    return ms.find((m) => m.name === overview.data!.classification.clean_mode.best_model) ?? ms[0];
  }, [overview.data]);

  const leakBest = useMemo(() => {
    if (!overview.data) return null;
    const ms = overview.data.classification.leakage_mode.models;
    return ms.find((m) => m.name === overview.data!.classification.leakage_mode.best_model) ?? ms[0];
  }, [overview.data]);

  const regBest = useMemo(() => {
    if (!overview.data) return null;
    const ms = overview.data.regression.models;
    return ms.find((m) => m.name === overview.data!.regression.best_model) ?? ms[0];
  }, [overview.data]);

  const regRunner = useMemo(() => {
    if (!overview.data || !regBest) return null;
    return (
      overview.data.regression.models.find((m) => m.name !== regBest.name) ??
      overview.data.regression.models[0]
    );
  }, [overview.data, regBest]);

  const clsCompareOption = useMemo(() => {
    if (!overview.data) return null;
    const cleanModels = overview.data.classification.clean_mode.models;
    const leakModels = overview.data.classification.leakage_mode.models;
    const names = cleanModels.map((m) => m.name);
    return {
      grid: { left: 48, right: 16, top: 20, bottom: 44 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%`,
      },
      xAxis: {
        type: "category",
        data: names,
        axisLabel: { color: c.muted, fontSize: 12 },
        axisLine: { lineStyle: { color: c.axis } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => `${Math.round(v * 100)}%` },
        splitLine: { lineStyle: { color: c.grid } },
      },
      series: [
        {
          name: "Mode Clean (tanpa bocoran)",
          type: "bar",
          barMaxWidth: 32,
          itemStyle: { color: c.accent, borderRadius: [4, 4, 0, 0] },
          data: names.map((n) => cleanModels.find((m) => m.name === n)?.accuracy ?? 0),
        },
        {
          name: "Mode Full Features (Leakage)",
          type: "bar",
          barMaxWidth: 32,
          itemStyle: { color: c.series2, borderRadius: [4, 4, 0, 0] },
          data: names.map((n) => leakModels.find((m) => m.name === n)?.accuracy ?? 0),
        },
      ],
    };
  }, [overview.data, c]);

  const trajDistOption = useMemo(() => {
    if (!overview.data) return null;
    const entries = Object.entries(overview.data.dataset.trajectories);
    return {
      grid: { left: 120, right: 28, top: 12, bottom: 28 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        axisLabel: { color: c.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: c.grid } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: entries.map(([k]) => trajectoryLabel(k)),
        axisLabel: { color: c.text, fontSize: 12, fontWeight: 600 },
        axisLine: { lineStyle: { color: c.axis } },
      },
      series: [
        {
          name: "Jumlah pemain",
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { color: c.accent, borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: c.secondary, fontSize: 12, fontWeight: 700 },
          data: entries.map(([, v]) => v),
        },
      ],
    };
  }, [overview.data, c]);

  if (overview.isError) {
    return <ErrorState message={(overview.error as Error)?.message} onRetry={() => overview.refetch()} />;
  }

  return (
    <>
      <section className="ua-enter flex flex-col gap-6 pt-6">
        <h1 className="ua-display text-balance">
          Membaca nilai pasar pemain tanpa ilusi data leakage.
        </h1>
        <p className="ua-lead">
          Evaluasi <strong>508 pemain</strong> dari 5 liga top Eropa (Transfermarkt 2025/2026) pada
          split <strong>80:20</strong>. Membandingkan klasifikasi{" "}
          <span className="ua-mark-1">Mode Clean</span> dengan{" "}
          <span className="ua-mark-2">Mode Full Features</span> serta regresi estimasi{" "}
          <strong>current_value_eur</strong>.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/evaluasi" className="ua-btn ua-btn--primary">
            Buka Evaluasi & Matriks
          </Link>
          <Link href="/simulator" className="ua-btn ua-btn--secondary">
            Coba Simulator Scouting
          </Link>
        </div>
      </section>

      <MetricGrid aria-label="Ringkasan performa utama">
        <MetricCard
          label="Akurasi Clean Terbaik"
          help="Klasifikasi trajectory tanpa fitur turunan target (cagr, decline_pct, multiplier)."
          value={cleanBest ? fmt.pct(cleanBest.accuracy) : "—"}
          note={cleanBest ? `${cleanBest.name} · F1 ${fmt.pct(cleanBest.f1_weighted)}` : undefined}
          loading={overview.isLoading}
        />
        <MetricCard
          label="Inflasi Data Leakage"
          help="Lonjakan akurasi semu saat fitur pasca-valuasi ikut dilatih ke dalam model."
          value={
            preds.data ? `+${(preds.data.error_analysis.leakage_delta_acc * 100).toFixed(1)} pp` : "—"
          }
          note={leakBest ? `${leakBest.name} mencapai ${fmt.pct(leakBest.accuracy)}` : undefined}
          loading={preds.isLoading}
        />
        <MetricCard
          label="Regresi Valuasi (R²)"
          help="Seberapa besar variasi current_value_eur dijelaskan oleh profil karier bersih."
          value={regBest ? regBest.r2.toFixed(3) : "—"}
          note={regBest ? `${regBest.name} · MAE ${fmt.eur(regBest.mae)}` : undefined}
          loading={overview.isLoading}
        />
        <MetricCard
          label="Sampel & Riwayat"
          help="Total pemain unik dan titik historis valuasi dari Transfermarkt."
          value={overview.data ? fmt.int(overview.data.dataset.total_players) : "—"}
          note={
            overview.data
              ? `${fmt.int(overview.data.dataset.history_rows)} titik historis · 102 data uji`
              : undefined
          }
          loading={overview.isLoading}
        />
      </MetricGrid>

      <Card>
        <CardHeader
          title="Clean Mode vs Full Features (Leakage)"
          description="Menghapus fitur bocoran (value_cagr, post_peak_decline_pct, value_multiplier_x) menurunkan akurasi dari 100% menjadi 66,7% — angka jujur yang benar-benar bisa dipakai untuk scouting."
          action={
            <Link href="/kesalahan" className="ua-btn ua-btn--secondary ua-btn--sm">
              Bedah pola error
            </Link>
          }
        />
        <CardBody>
          {cleanBest && leakBest && regBest && regRunner ? (
            <div className="grid gap-8 md:grid-cols-2">
              <CompareCard
                label="Klasifikasi Trajectory (Akurasi Uji)"
                help="Perbandingan model Clean terbaik vs Full Features dengan fitur bocoran."
                badge={{
                  text: "Audit Leakage",
                  title: "Selisih akurasi akibat data leakage",
                  tone: "warning",
                }}
                main={{
                  who: `${cleanBest.name} (Clean)`,
                  value: fmt.pct(cleanBest.accuracy),
                  pct: cleanBest.accuracy * 100,
                }}
                other={{
                  who: `${leakBest.name} (Leakage)`,
                  value: fmt.pct(leakBest.accuracy),
                  pct: leakBest.accuracy * 100,
                }}
              />
              <CompareCard
                label="Regresi current_value_eur (R²)"
                help="Gradient Boosting Regressor dibandingkan dengan model pembanding tanpa last_value_eur."
                badge={{
                  text: "Layak Screening",
                  title: "R² > 0.90 pada data uji bersih",
                  tone: "success",
                }}
                main={{
                  who: regBest.name,
                  value: regBest.r2.toFixed(3),
                  pct: regBest.r2 * 100,
                }}
                other={{
                  who: regRunner.name,
                  value: regRunner.r2.toFixed(3),
                  pct: regRunner.r2 * 100,
                }}
              />
            </div>
          ) : null}

          <ChartLegend
            items={[
              { label: "Mode Clean (tanpa bocoran)", color: c.accent },
              { label: "Mode Full Features (Leakage)", color: c.series2 },
            ]}
          />
          {clsCompareOption ? (
            <EChart
              option={clsCompareOption}
              height={300}
              label="Grafik batang perbandingan akurasi Mode Clean dan Mode Leakage pada 3 model klasifikasi"
            />
          ) : (
            <ChartSkeleton height={300} />
          )}
          <Callout>
            Model dengan fitur bocoran terlihat sempurna (100% pada Gradient Boosting), tetapi tidak
            berguna di dunia nyata karena fitur seperti <code>post_peak_decline_pct</code> dan{" "}
            <code>value_cagr</code> baru diketahui setelah valuasi akhir terjadi.
          </Callout>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Distribusi Kelas Trajectory (508 Pemain)"
          description="Sebagian besar pemain berada pada fase growing (228) dan rising_star (117), sementara kelas falling_sharply hanya 26 pemain."
        />
        <CardBody>
          {trajDistOption ? (
            <EChart
              option={trajDistOption}
              height={240}
              label="Distribusi jumlah pemain per kelas trajectory"
            />
          ) : (
            <ChartSkeleton height={240} />
          )}
        </CardBody>
      </Card>
    </>
  );
}
