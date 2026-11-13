"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { fetchApi, type SimulateRequest, type SimulateResponse } from "@/lib/api";
import { fmt, trajectoryLabel } from "@/lib/format";

const PRESETS: { label: string; data: SimulateRequest }[] = [
  {
    label: "Wonderkid (21 thn)",
    data: {
      age: 21,
      age_at_peak: 21,
      peak_value_eur: 45_000_000,
      first_value_eur: 2_000_000,
      career_span_years: 3.0,
      years_to_peak: 3.0,
      value_volatility: 0.65,
      num_valuation_points: 10,
      num_clubs_career: 2,
      league_name: "Premier League",
      nationality: "England",
    },
  },
  {
    label: "Prime Star (26 thn)",
    data: {
      age: 26,
      age_at_peak: 25,
      peak_value_eur: 95_000_000,
      first_value_eur: 5_000_000,
      career_span_years: 7.5,
      years_to_peak: 6.5,
      value_volatility: 0.45,
      num_valuation_points: 20,
      num_clubs_career: 3,
      league_name: "La Liga",
      nationality: "Spain",
    },
  },
  {
    label: "Veteran (31 thn)",
    data: {
      age: 31,
      age_at_peak: 27,
      peak_value_eur: 70_000_000,
      first_value_eur: 3_000_000,
      career_span_years: 12.0,
      years_to_peak: 8.0,
      value_volatility: 0.55,
      num_valuation_points: 28,
      num_clubs_career: 4,
      league_name: "Serie A",
      nationality: "Italy",
    },
  },
];

export default function SimulatorPage() {
  const [form, setForm] = useState<SimulateRequest>(PRESETS[0].data);

  const sim = useMutation({
    mutationFn: (payload: SimulateRequest) =>
      fetchApi<SimulateResponse>("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
  });

  const updateNum = (k: keyof SimulateRequest, val: string) => {
    setForm((prev) => ({ ...prev, [k]: Number(val) || 0 }));
  };

  return (
    <>
      <PageHeader
        title="Simulator Scouting (What-If Tool)"
        description="Uji profil pemain hipotetis untuk memprediksi kelas trajectory dan taksiran nilai pasar saat ini menggunakan model Clean terbaik."
        meta={null}
      />

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            onClick={() => {
              setForm(p.data);
              sim.mutate(p.data);
            }}
          >
            Preset: {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <Card panel>
          <CardHeader
            title="Parameter Profil Pemain"
            description="Sesuaikan profil usia, liga, nilai puncak, dan riwayat valuasi."
          />
          <CardBody>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                sim.mutate(form);
              }}
            >
              <Field label="Usia Saat Ini (tahun)">
                <Input
                  type="number"
                  min={16}
                  max={42}
                  step={1}
                  value={form.age}
                  onChange={(e) => updateNum("age", e.target.value)}
                />
              </Field>
              <Field label="Usia Saat Peak (tahun)">
                <Input
                  type="number"
                  min={16}
                  max={42}
                  step={0.5}
                  value={form.age_at_peak}
                  onChange={(e) => updateNum("age_at_peak", e.target.value)}
                />
              </Field>
              <Field label="Peak Value (€)">
                <Input
                  type="number"
                  min={100000}
                  step={1000000}
                  value={form.peak_value_eur}
                  onChange={(e) => updateNum("peak_value_eur", e.target.value)}
                />
              </Field>
              <Field label="First Value (€)">
                <Input
                  type="number"
                  min={50000}
                  step={500000}
                  value={form.first_value_eur}
                  onChange={(e) => updateNum("first_value_eur", e.target.value)}
                />
              </Field>
              <Field label="Rentang Karir (tahun)">
                <Input
                  type="number"
                  min={0.5}
                  max={25}
                  step={0.5}
                  value={form.career_span_years}
                  onChange={(e) => updateNum("career_span_years", e.target.value)}
                />
              </Field>
              <Field label="Tahun Menuju Peak">
                <Input
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  value={form.years_to_peak}
                  onChange={(e) => updateNum("years_to_peak", e.target.value)}
                />
              </Field>
              <Field label="Volatilitas Nilai (0 - 2)">
                <Input
                  type="number"
                  min={0}
                  max={3}
                  step={0.05}
                  value={form.value_volatility}
                  onChange={(e) => updateNum("value_volatility", e.target.value)}
                />
              </Field>
              <Field label="Jumlah Titik Valuasi">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={form.num_valuation_points}
                  onChange={(e) => updateNum("num_valuation_points", e.target.value)}
                />
              </Field>
              <Field label="Jumlah Klub Sepanjang Karir">
                <Input
                  type="number"
                  min={1}
                  max={15}
                  step={1}
                  value={form.num_clubs_career}
                  onChange={(e) => updateNum("num_clubs_career", e.target.value)}
                />
              </Field>
              <Field label="Liga">
                <Select
                  value={form.league_name}
                  onChange={(e) => setForm((p) => ({ ...p, league_name: e.target.value }))}
                >
                  <option value="Premier League">Premier League</option>
                  <option value="La Liga">La Liga</option>
                  <option value="Serie A">Serie A</option>
                  <option value="Bundesliga">Bundesliga</option>
                  <option value="Ligue 1">Ligue 1</option>
                </Select>
              </Field>
              <Field label="Kebangsaan" className="sm:col-span-2">
                <Input
                  value={form.nationality}
                  onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
                />
              </Field>
              <div className="sm:col-span-2 pt-2">
                <Button type="submit" disabled={sim.isPending} className="w-full sm:w-auto">
                  {sim.isPending ? "Menghitung prediksi..." : "Jalankan Prediksi Scouting"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader
            title="Hasil Prediksi Model"
            description="Menggunakan Logistic Regression (Clean) untuk trajectory dan Gradient Boosting Regressor untuk estimasi nilai."
          />
          <CardBody>
            {sim.isError ? (
              <p className="text-[14px] font-semibold text-danger">
                Gagal menjalankan simulasi: {(sim.error as Error)?.message}
              </p>
            ) : sim.data ? (
              <div className="flex flex-col gap-6">
                <div className="border-t-2 border-ink pt-4">
                  <span className="text-[13px] font-bold text-ink-3">Prediksi Trajectory</span>
                  <div className="mt-2 flex items-center gap-3">
                    <TrajectoryBadge value={sim.data.predicted_trajectory} className="text-[14px] px-3 py-1" />
                  </div>
                </div>

                <div className="border-t-2 border-ink pt-4">
                  <span className="text-[13px] font-bold text-ink-3">Estimasi Nilai Pasar Saat Ini</span>
                  <p className="m-0 mt-1 text-[38px] font-extrabold leading-none tracking-[-0.03em]">
                    {fmt.eur(sim.data.predicted_value_eur)}
                  </p>
                  <p className="m-0 mt-2 text-[13px] text-ink-3">
                    Rentang wajar: {fmt.eur(sim.data.value_range_eur[0])} –{" "}
                    {fmt.eur(sim.data.value_range_eur[1])}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className="text-[13px] font-bold text-ink-3">Probabilitas Kelas</span>
                  {Object.entries(sim.data.trajectory_probabilities)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cls, prob]) => (
                      <div key={cls} className="flex flex-col gap-1">
                        <div className="flex justify-between text-[13px]">
                          <span className="font-semibold">{trajectoryLabel(cls)}</span>
                          <span className="font-bold">{fmt.pct(prob)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-track">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${Math.round(prob * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>

                <Callout label="Rekomendasi:">{sim.data.scouting_verdict}</Callout>
              </div>
            ) : (
              <p className="text-[14px] text-ink-3">
                Klik <strong>Jalankan Prediksi Scouting</strong> atau pilih salah satu preset di atas
                untuk melihat hasil simulasi.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
