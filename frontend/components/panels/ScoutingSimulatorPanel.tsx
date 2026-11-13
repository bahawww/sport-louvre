"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { LeagueBadge } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
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

export function ScoutingSimulatorPanel() {
  const [form, setForm] = useState<SimulateRequest>(PRESETS[0].data);

  const sim = useMutation({
    mutationFn: (payload: SimulateRequest) =>
      fetchApi<SimulateResponse>("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
  });

  const numField = (label: string, key: keyof SimulateRequest, step = 1) => (
    <label className="block text-xs">
      <span className="font-semibold text-[#94A3B8]">{label}</span>
      <input
        type="number"
        step={step}
        value={form[key] as number}
        onChange={(e) => setForm((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
        className="mt-1 w-full rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2 text-sm text-[#F1F5F9]"
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setForm(p.data);
              sim.mutate(p.data);
            }}
            className="rounded-lg border border-[#243244] bg-[#121A24] px-3 py-1.5 text-xs font-semibold text-[#F1F5F9] hover:border-[#10B981]"
          >
            Preset: {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sim.mutate(form);
          }}
          className="rounded-xl border border-[#243244] bg-[#121A24] p-5"
        >
          <h3 className="text-base font-bold text-[#F1F5F9]">What-If Scouting Simulator</h3>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Input profil pemain untuk memprediksi trajectory dan estimasi nilai pasar real-time.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {numField("Usia (tahun)", "age", 1)}
            {numField("Usia Saat Peak", "age_at_peak", 0.5)}
            {numField("Peak Value (€)", "peak_value_eur", 1000000)}
            {numField("First Value (€)", "first_value_eur", 500000)}
            {numField("Rentang Karir (tahun)", "career_span_years", 0.5)}
            {numField("Tahun Menuju Peak", "years_to_peak", 0.5)}
            {numField("Volatilitas Nilai", "value_volatility", 0.05)}
            {numField("Jumlah Titik Valuasi", "num_valuation_points", 1)}
            {numField("Jumlah Klub", "num_clubs_career", 1)}

            <label className="block text-xs">
              <span className="flex items-center gap-2 font-semibold text-[#94A3B8]">
                Liga <LeagueBadge league={form.league_name} size={14} showName={false} />
              </span>
              <select
                value={form.league_name}
                onChange={(e) => setForm((p) => ({ ...p, league_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2 text-sm text-[#F1F5F9]"
              >
                <option value="Premier League">Premier League</option>
                <option value="La Liga">La Liga</option>
                <option value="Serie A">Serie A</option>
                <option value="Bundesliga">Bundesliga</option>
                <option value="Ligue 1">Ligue 1</option>
              </select>
            </label>

            <label className="block text-xs sm:col-span-2">
              <span className="font-semibold text-[#94A3B8]">Kebangsaan</span>
              <input
                value={form.nationality}
                onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2 text-sm text-[#F1F5F9]"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={sim.isPending}
            className="mt-5 rounded-lg bg-[#10B981] px-4 py-2.5 text-sm font-bold text-[#0B1117] hover:bg-[#059669] disabled:opacity-50"
          >
            {sim.isPending ? "Memprediksi..." : "Jalankan Prediksi"}
          </button>
        </form>

        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <h3 className="text-base font-bold text-[#F1F5F9]">Output Prediksi Model</h3>
          {sim.data ? (
            <div className="mt-4 space-y-5">
              <div>
                <p className="text-xs text-[#94A3B8]">Prediksi Trajectory</p>
                <div className="mt-1.5">
                  <TrajectoryBadge value={sim.data.predicted_trajectory} className="text-sm px-3 py-1" />
                </div>
              </div>

              <div>
                <p className="text-xs text-[#94A3B8]">Estimasi Current Value</p>
                <p className="mt-1 text-3xl font-extrabold text-[#10B981]">
                  {fmt.eur(sim.data.predicted_value_eur)}
                </p>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Rentang wajar: {fmt.eur(sim.data.value_range_eur[0])} –{" "}
                  {fmt.eur(sim.data.value_range_eur[1])}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#94A3B8]">Probabilitas Kelas</p>
                {Object.entries(sim.data.trajectory_probabilities)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cls, prob]) => (
                    <div key={cls}>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#F1F5F9]">{trajectoryLabel(cls)}</span>
                        <span className="font-bold text-[#94A3B8]">{fmt.pct(prob)}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#1E293B]">
                        <div
                          className="h-full rounded-full bg-[#10B981]"
                          style={{ width: `${Math.round(prob * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>

              <div className="rounded-lg border border-[#243244] bg-[#182230] p-3 text-xs text-[#F1F5F9]">
                <strong className="text-[#F59E0B]">Scouting Verdict:</strong> {sim.data.scouting_verdict}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-[#94A3B8]">
              Klik salah satu preset atau tekan <strong>Jalankan Prediksi</strong> untuk melihat hasil.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
