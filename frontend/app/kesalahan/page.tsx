"use client";

import { useMemo } from "react";

import { EChart, useChartColors } from "@/components/chart";
import { PageHeader } from "@/components/page-header";
import { MetricCard, MetricGrid } from "@/components/stat-card";
import { ChartSkeleton, ErrorState } from "@/components/states";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ScrollX } from "@/components/ui/scroll-x";
import { useApi, type TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export default function KesalahanPage() {
  const preds = useApi<TestPredictionsResponse>("/test-predictions");
  const c = useChartColors();

  const leagueBiasOption = useMemo(() => {
    if (!preds.data) return null;
    const items = preds.data.error_analysis.league_bias;
    return {
      grid: { left: 128, right: 28, top: 16, bottom: 32 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: number) => fmt.eur(v),
      },
      xAxis: {
        type: "value",
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => fmt.eurShort(v) },
        splitLine: { lineStyle: { color: c.grid } },
      },
      yAxis: {
        type: "category",
        data: items.map((i) => `${i.league} (n=${i.count})`),
        axisLabel: { color: c.text, fontSize: 12, fontWeight: 600 },
        axisLine: { lineStyle: { color: c.axis } },
      },
      series: [
        {
          name: "Rata-rata residual",
          type: "bar",
          barMaxWidth: 22,
          itemStyle: {
            color: (p: { value: number }) => (p.value >= 0 ? c.accent : c.series2),
            borderRadius: 4,
          },
          data: items.map((i) => i.mean_residual_eur),
        },
      ],
    };
  }, [preds.data, c]);

  if (preds.isError) {
    return <ErrorState message={(preds.error as Error)?.message} onRetry={() => preds.refetch()} />;
  }

  const ea = preds.data?.error_analysis;

  return (
    <>
      <PageHeader
        title="Analisis Kesalahan & Pola Error"
        description="Tiga temuan kritis dari audit model: inflasi akurasi akibat data leakage, tumpang tindih kelas growing vs stable, dan under-prediction pada pemain superstar."
      />

      <MetricGrid aria-label="Ringkasan pola error">
        <MetricCard
          label="Inflasi Akurasi Leakage"
          help="Kenaikan akurasi semu ketika cagr, decline_pct, dan multiplier dimasukkan ke model."
          value={ea ? `+${(ea.leakage_delta_acc * 100).toFixed(1)} pp` : "—"}
          note="Turun dari 100% menjadi 66,7% setelah fitur bocoran dihapus."
          loading={preds.isLoading}
        />
        <MetricCard
          label="Ambiguitas Growing vs Stable"
          help="Jumlah pemain uji yang tertukar antara fase growing dan stable pada Mode Clean."
          value={ea ? `${ea.growing_vs_stable_confusion_count} pemain` : "—"}
          note="Dari total 102 sampel uji, kedua fase ini paling sulit dipisahkan tanpa data tren."
          loading={preds.isLoading}
        />
        <MetricCard
          label="Kebocoran Target Langsung"
          help="Kolom last_value_eur di dataset Transfermarkt 100% identik dengan current_value_eur."
          value="508 / 508"
          note="Wajib dikeluarkan dari seluruh pipeline regresi dan klasifikasi."
          loading={preds.isLoading}
        />
      </MetricGrid>

      <Card>
        <CardHeader
          title="Bias Residual per Liga (English Tax & Efek Pasar)"
          description="Nilai rata-rata residual (Prediksi - Aktual) di tiap liga top Eropa. Nilai negatif berarti harga pasar aktual lebih tinggi dari prediksi profil statistik."
        />
        <CardBody>
          {leagueBiasOption ? (
            <EChart
              option={leagueBiasOption}
              height={260}
              label="Grafik batang rata-rata residual prediksi harga pasar per liga"
            />
          ) : (
            <ChartSkeleton height={260} />
          )}
          <Callout>
            Pemain Premier League dan bintang muda dengan eksposur media tinggi sering mendapat
            premi pasar (<em>English tax</em> & faktor komersial) yang belum sepenuhnya tertangkap
            oleh fitur umur, jumlah klub, dan volatilitas historis.
          </Callout>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Superstar Under-Predicted (Selisih Negatif Terbesar)"
          description="Pemain dengan harga pasar aktual jauh melampaui taksiran model regresi — umumnya pemain elite di puncak valuasi atau klub Premier League."
        />
        <CardBody>
          <ScrollX>
            <table className="ua-table">
              <thead>
                <tr>
                  <th scope="col">Pemain</th>
                  <th scope="col">Liga</th>
                  <th scope="col">Trajectory</th>
                  <th scope="col" className="text-right">
                    Nilai Aktual
                  </th>
                  <th scope="col" className="text-right">
                    Prediksi Model
                  </th>
                  <th scope="col" className="text-right">
                    Selisih
                  </th>
                </tr>
              </thead>
              <tbody>
                {(ea?.top_underpredicted_superstars ?? []).map((r) => (
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
                    <td className="text-right font-semibold">{fmt.eur(r.actual_value_eur)}</td>
                    <td className="text-right">{fmt.eur(r.pred_value_eur)}</td>
                    <td className="text-right font-bold text-danger">{fmt.eur(r.residual_eur)}</td>
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
