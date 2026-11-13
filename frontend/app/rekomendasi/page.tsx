"use client";

import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ScrollX } from "@/components/ui/scroll-x";
import { useApi, type TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

export default function RekomendasiPage() {
  const preds = useApi<TestPredictionsResponse>("/test-predictions");

  if (preds.isError) {
    return <ErrorState message={(preds.error as Error)?.message} onRetry={() => preds.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title="Rekomendasi Manajemen Klub"
        description="Penerapan hasil model ke keputusan bursa transfer: daftar target beli (hidden gems), kandidat jual/cut-loss, dan batas kelayakan model."
      />

      <Callout label="Keputusan Kelayakan Model:">
        <strong>Model Regresi (R² = 0,91)</strong> layak digunakan sebagai alat{" "}
        <em>first-pass valuation screening</em> untuk mendeteksi pemain undervalued. Sebaliknya,{" "}
        <strong>Model Klasifikasi Clean (Akurasi 66,7%)</strong> hanya layak sebagai sinyal pendukung
        karena masih sering menukar kelas <code>growing</code> dan <code>stable</code>.
      </Callout>

      <div className="grid gap-10 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Strategi Beli — Hidden Gems (Undervalued)"
            description="Pemain uji dengan taksiran nilai model jauh di atas harga pasar Transfermarkt saat ini."
          />
          <CardBody>
            <ScrollX>
              <table className="ua-table">
                <thead>
                  <tr>
                    <th scope="col">Pemain</th>
                    <th scope="col">Trajectory</th>
                    <th scope="col" className="text-right">
                      Harga Pasar
                    </th>
                    <th scope="col" className="text-right">
                      Estimasi Wajar
                    </th>
                    <th scope="col" className="text-right">
                      Potensi Gap
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(preds.data?.undervalued ?? []).slice(0, 10).map((r) => (
                    <tr key={r.player_id}>
                      <td>
                        <span className="font-bold">{r.name}</span>
                        <span className="block text-[12px] text-ink-3">
                          {r.peak_club} · {r.age} thn
                        </span>
                      </td>
                      <td>
                        <TrajectoryBadge value={r.actual_trajectory} />
                      </td>
                      <td className="text-right">{fmt.eur(r.actual_value_eur)}</td>
                      <td className="text-right font-semibold">{fmt.eur(r.pred_value_eur)}</td>
                      <td className="text-right font-bold text-[var(--ispu-baik-fg)]">
                        +{fmt.eur(r.residual_eur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Strategi Jual / Cut-Loss (Overvalued)"
            description="Pemain dengan harga pasar saat ini di atas taksiran fundamental karier atau berada di fase penurunan nilai."
          />
          <CardBody>
            <ScrollX>
              <table className="ua-table">
                <thead>
                  <tr>
                    <th scope="col">Pemain</th>
                    <th scope="col">Trajectory</th>
                    <th scope="col" className="text-right">
                      Harga Pasar
                    </th>
                    <th scope="col" className="text-right">
                      Estimasi Wajar
                    </th>
                    <th scope="col" className="text-right">
                      Overvalued
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(preds.data?.overvalued ?? []).slice(0, 10).map((r) => (
                    <tr key={r.player_id}>
                      <td>
                        <span className="font-bold">{r.name}</span>
                        <span className="block text-[12px] text-ink-3">
                          {r.peak_club} · {r.age} thn
                        </span>
                      </td>
                      <td>
                        <TrajectoryBadge value={r.actual_trajectory} />
                      </td>
                      <td className="text-right">{fmt.eur(r.actual_value_eur)}</td>
                      <td className="text-right font-semibold">{fmt.eur(r.pred_value_eur)}</td>
                      <td className="text-right font-bold text-danger">{fmt.eur(r.residual_eur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
