"use client";

import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, RotateCcw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import {
  fetchApi,
  useApi,
  type DatasetPlayerRow,
  type DatasetsResponse,
  type SimulateRequest,
  type SimulateResponse,
} from "@/lib/api";
import { fmt, trajectoryLabel } from "@/lib/format";

const LEAGUES = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1"] as const;

const PRESETS: { label: string; subtitle: string; data: SimulateRequest }[] = [
  {
    label: "Wonderkid (21 thn)",
    subtitle: "Naik daun · €45M peak",
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
    subtitle: "Usia emas · €95M peak",
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
    subtitle: "Pasca-peak · €70M peak",
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

function playerToSimRequest(p: DatasetPlayerRow): SimulateRequest {
  const age = p.age ?? 25;
  const span = Math.max(1, Number((p.career_span_years || 4).toFixed(1)));
  const atPeak = p.current_value_eur >= p.peak_value_eur * 0.95;
  const ageAtPeak = atPeak ? age : Math.max(18, Math.round((age - Math.min(3, span * 0.35)) * 2) / 2);
  const yearsToPeak = Math.max(0.5, Number((span - Math.max(0, age - ageAtPeak)).toFixed(1)));
  return {
    age,
    age_at_peak: ageAtPeak,
    peak_value_eur: Math.max(1_000_000, p.peak_value_eur),
    first_value_eur: Math.max(250_000, p.first_value_eur || 1_000_000),
    career_span_years: span,
    years_to_peak: yearsToPeak,
    value_volatility: 0.5,
    num_valuation_points: Math.max(3, p.num_valuation_points || 12),
    num_clubs_career: 3,
    league_name: LEAGUES.includes(p.league_name as (typeof LEAGUES)[number])
      ? p.league_name
      : "Premier League",
    nationality: p.nationality || "England",
  };
}

export function ScoutingSimulatorPanel() {
  const [form, setForm] = useState<SimulateRequest>(PRESETS[0].data);
  const [autoPredict, setAutoPredict] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadedPlayer, setLoadedPlayer] = useState<DatasetPlayerRow | null>(null);
  const didMount = useRef(false);

  const datasets = useApi<DatasetsResponse>("/datasets");

  const sim = useMutation({
    mutationFn: (payload: SimulateRequest) =>
      fetchApi<SimulateResponse>("/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
  });

  // Auto-run once on mount + live debounced prediction when sliders change
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      sim.mutate(form);
      return;
    }
    if (!autoPredict) return;
    const t = setTimeout(() => {
      sim.mutate(form);
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, autoPredict]);

  const matchingPlayers = useMemo(() => {
    const list = datasets.data?.players ?? [];
    const q = playerSearch.trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.peak_club.toLowerCase().includes(q) ||
          p.league_name.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [datasets.data, playerSearch]);

  const updateField = <K extends keyof SimulateRequest>(key: K, val: SimulateRequest[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      // Keep age_at_peak <= age automatically for sensible UX
      if (key === "age" && typeof val === "number" && next.age_at_peak > val) {
        next.age_at_peak = val;
      }
      if (key === "career_span_years" && typeof val === "number" && next.years_to_peak > val) {
        next.years_to_peak = val;
      }
      return next;
    });
  };

  const loadPreset = (data: SimulateRequest) => {
    setLoadedPlayer(null);
    setForm(data);
    if (!autoPredict) sim.mutate(data);
  };

  const loadRealPlayer = (p: DatasetPlayerRow) => {
    const req = playerToSimRequest(p);
    setLoadedPlayer(p);
    setForm(req);
    setPickerOpen(false);
    setPlayerSearch("");
    if (!autoPredict) sim.mutate(req);
  };

  const peakMillions = Math.round((form.peak_value_eur / 1_000_000) * 10) / 10;
  const firstMillions = Math.round((form.first_value_eur / 1_000_000) * 10) / 10;
  const estPctOfPeak =
    sim.data && form.peak_value_eur > 0
      ? Math.round((sim.data.predicted_value_eur / form.peak_value_eur) * 100)
      : null;

  return (
    <div className="space-y-5">
      {/* Top Bar: Presets + Real Player Loader */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#243244] bg-[#121A24] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold text-[#94A3B8]">Skenario Cepat:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => loadPreset(p.data)}
              className="rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-1.5 text-left transition hover:border-[#10B981]"
            >
              <span className="block text-xs font-bold text-[#F1F5F9]">{p.label}</span>
              <span className="block text-[10px] text-[#94A3B8]">{p.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Real Player Search Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#10B981]/50 bg-[#10B981]/10 px-3.5 py-2 text-xs font-bold text-[#10B981] transition hover:bg-[#10B981]/20"
          >
            <Search className="size-3.5" />
            {loadedPlayer ? `Pemain: ${loadedPlayer.name}` : "Muat dari 508 Pemain Nyata"}
          </button>

          {pickerOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-[#243244] bg-[#121A24] p-3 shadow-2xl">
              <input
                autoFocus
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Ketik nama pemain atau klub..."
                className="w-full rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2 text-xs text-[#F1F5F9] placeholder-[#64748B]"
              />
              <div className="mt-2 max-h-64 divide-y divide-[#1E293B] overflow-y-auto">
                {matchingPlayers.map((p) => (
                  <button
                    key={p.player_id}
                    type="button"
                    onClick={() => loadRealPlayer(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-[#182230]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PlayerAvatar playerId={p.player_id} name={p.name} size={28} />
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-[#F1F5F9]">
                          {p.name}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
                          <ClubBadge playerId={p.player_id} club={p.peak_club} size={11} />
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-[#10B981]">
                      {fmt.eurShort(p.current_value_eur)}
                    </span>
                  </button>
                ))}
                {matchingPlayers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[#64748B]">Pemain tidak ditemukan.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Split: Interactive Sliders (Left) + Live Prediction Card (Right) */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sim.mutate(form);
          }}
          className="space-y-5 rounded-xl border border-[#243244] bg-[#121A24] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#F1F5F9]">What-If Scouting Simulator</h3>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                Geser slider untuk menguji skenario usia, nilai puncak, dan liga pemain.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#243244] bg-[#0B1117] px-2.5 py-1.5 text-[11px] font-semibold text-[#F1F5F9]">
              <input
                type="checkbox"
                checked={autoPredict}
                onChange={(e) => setAutoPredict(e.target.checked)}
                className="accent-[#10B981]"
              />
              Live Update
            </label>
          </div>

          {/* League Visual Selector */}
          <div>
            <span className="text-xs font-semibold text-[#94A3B8]">Kompetisi / Liga</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {LEAGUES.map((lg) => {
                const active = form.league_name === lg;
                return (
                  <button
                    key={lg}
                    type="button"
                    onClick={() => updateField("league_name", lg)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-[#10B981] bg-[#10B981]/15 text-[#F1F5F9]"
                        : "border-[#243244] bg-[#0B1117] text-[#94A3B8] hover:text-[#F1F5F9]"
                    }`}
                  >
                    <LeagueBadge league={lg} size={14} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Sliders */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Usia Sekarang</span>
                <span className="font-bold text-[#F1F5F9]">{form.age} tahun</span>
              </div>
              <input
                type="range"
                min={16}
                max={38}
                step={1}
                value={form.age}
                onChange={(e) => updateField("age", Number(e.target.value))}
                className="mt-2.5 w-full accent-[#10B981]"
              />
              <div className="mt-1 flex justify-between text-[10px] text-[#64748B]">
                <span>16 thn</span>
                <span>27 thn</span>
                <span>38 thn</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Usia Saat Peak</span>
                <span className="font-bold text-[#F1F5F9]">{form.age_at_peak} tahun</span>
              </div>
              <input
                type="range"
                min={16}
                max={form.age}
                step={0.5}
                value={form.age_at_peak}
                onChange={(e) => updateField("age_at_peak", Number(e.target.value))}
                className="mt-2.5 w-full accent-[#10B981]"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-[#64748B]">
                <span>16 thn</span>
                <button
                  type="button"
                  onClick={() => updateField("age_at_peak", form.age)}
                  className="text-[#10B981] hover:underline"
                >
                  Masih di Peak (= {form.age})
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Peak Value (Nilai Puncak)</span>
                <span className="font-bold text-[#F59E0B]">€{peakMillions.toFixed(1)}M</span>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                step={1}
                value={Math.min(200, Math.max(1, peakMillions))}
                onChange={(e) => updateField("peak_value_eur", Number(e.target.value) * 1_000_000)}
                className="mt-2.5 w-full accent-[#F59E0B]"
              />
              <div className="mt-1 flex justify-between text-[10px] text-[#64748B]">
                <span>€1M</span>
                <span>€100M</span>
                <span>€200M</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Harga Awal Karir</span>
                <span className="font-bold text-[#F1F5F9]">€{firstMillions.toFixed(1)}M</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={50}
                step={0.5}
                value={Math.min(50, Math.max(0.5, firstMillions))}
                onChange={(e) => updateField("first_value_eur", Number(e.target.value) * 1_000_000)}
                className="mt-2.5 w-full accent-[#10B981]"
              />
              <div className="mt-1 flex justify-between text-[10px] text-[#64748B]">
                <span>€0.5M</span>
                <span>€25M</span>
                <span>€50M</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Lama Karir Pro</span>
                <span className="font-bold text-[#F1F5F9]">{form.career_span_years} tahun</span>
              </div>
              <input
                type="range"
                min={1}
                max={18}
                step={0.5}
                value={form.career_span_years}
                onChange={(e) => updateField("career_span_years", Number(e.target.value))}
                className="mt-2.5 w-full accent-[#10B981]"
              />
            </div>

            <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#94A3B8]">Tahun Menuju Peak</span>
                <span className="font-bold text-[#F1F5F9]">{form.years_to_peak} tahun</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={form.career_span_years}
                step={0.5}
                value={form.years_to_peak}
                onChange={(e) => updateField("years_to_peak", Number(e.target.value))}
                className="mt-2.5 w-full accent-[#10B981]"
              />
            </div>
          </div>

          {/* Collapsible Advanced Controls */}
          <div className="rounded-lg border border-[#1E293B] bg-[#0B1117]">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-[#94A3B8] hover:text-[#F1F5F9]"
            >
              <span>Parameter Lanjutan (Volatilitas, Klub, Kebangsaan)</span>
              {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {showAdvanced ? (
              <div className="grid gap-3 border-t border-[#1E293B] p-3.5 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="font-semibold text-[#94A3B8]">
                    Volatilitas Nilai ({form.value_volatility.toFixed(2)})
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    value={form.value_volatility}
                    onChange={(e) => updateField("value_volatility", Number(e.target.value))}
                    className="mt-2 w-full accent-[#10B981]"
                  />
                </label>

                <label className="block text-xs">
                  <span className="font-semibold text-[#94A3B8]">Jumlah Titik Valuasi</span>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={form.num_valuation_points}
                    onChange={(e) => updateField("num_valuation_points", Number(e.target.value) || 2)}
                    className="mt-1 w-full rounded-lg border border-[#243244] bg-[#121A24] px-3 py-1.5 text-sm text-[#F1F5F9]"
                  />
                </label>

                <label className="block text-xs">
                  <span className="font-semibold text-[#94A3B8]">Jumlah Klub Sepanjang Karir</span>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={form.num_clubs_career}
                    onChange={(e) => updateField("num_clubs_career", Number(e.target.value) || 1)}
                    className="mt-1 w-full rounded-lg border border-[#243244] bg-[#121A24] px-3 py-1.5 text-sm text-[#F1F5F9]"
                  />
                </label>

                <label className="block text-xs">
                  <span className="font-semibold text-[#94A3B8]">Kebangsaan</span>
                  <input
                    value={form.nationality}
                    onChange={(e) => updateField("nationality", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#243244] bg-[#121A24] px-3 py-1.5 text-sm text-[#F1F5F9]"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={sim.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#10B981] px-4 py-2.5 text-sm font-bold text-[#0B1117] transition hover:bg-[#059669] disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              {sim.isPending ? "Memprediksi..." : "Jalankan Prediksi"}
            </button>
            <button
              type="button"
              onClick={() => loadPreset(PRESETS[0].data)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2.5 text-xs font-semibold text-[#94A3B8] hover:text-[#F1F5F9]"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          </div>
        </form>

        {/* Output Panel */}
        <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#F1F5F9]">Output Prediksi Model</h3>
            {sim.isPending ? (
              <span className="text-[11px] font-semibold text-[#10B981]">Menghitung...</span>
            ) : null}
          </div>

          {loadedPlayer ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#243244] bg-[#0B1117] p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerAvatar
                  playerId={loadedPlayer.player_id}
                  name={loadedPlayer.name}
                  size={36}
                />
                <div className="min-w-0">
                  <span className="block truncate text-xs font-bold text-[#F1F5F9]">
                    {loadedPlayer.name}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                    <ClubBadge playerId={loadedPlayer.player_id} club={loadedPlayer.peak_club} size={12} />
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-[10px] text-[#94A3B8]">Nilai Aktual Dataset</span>
                <span className="text-xs font-bold text-[#F59E0B]">
                  {fmt.eur(loadedPlayer.current_value_eur)}
                </span>
              </div>
            </div>
          ) : null}

          {sim.data ? (
            <div className="mt-4 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-[#94A3B8]">Prediksi Trajectory</p>
                  <div className="mt-1.5">
                    <TrajectoryBadge
                      value={sim.data.predicted_trajectory}
                      className="px-3 py-1 text-sm"
                    />
                  </div>
                </div>
                {estPctOfPeak !== null ? (
                  <div className="text-right">
                    <p className="text-xs text-[#94A3B8]">Rasio thd Peak</p>
                    <p className="mt-1 text-lg font-extrabold text-[#F1F5F9]">{estPctOfPeak}%</p>
                  </div>
                ) : null}
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
                          className="h-full rounded-full bg-[#10B981] transition-all duration-300"
                          style={{ width: `${Math.round(prob * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>

              <div className="rounded-lg border border-[#243244] bg-[#182230] p-3 text-xs text-[#F1F5F9]">
                <strong className="text-[#F59E0B]">Scouting Verdict:</strong>{" "}
                {sim.data.scouting_verdict}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-[#94A3B8]">Memuat prediksi awal...</p>
          )}
        </div>
      </div>
    </div>
  );
}
