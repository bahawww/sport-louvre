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
  type ProfileForm,
  type SimulateRequest,
  type SimulateResponse,
} from "@/lib/api";
import { fmt, trajectoryLabel } from "@/lib/format";
import {
  CONTINENT_COUNTRIES,
  LEAGUE_CATALOG,
  findContinentForCountry,
  getCountryFlag,
} from "@/lib/geo";

const LEAGUES = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1"] as const;

const POSITION_GROUPS = ["Forward", "Midfielder", "Defender", "Goalkeeper"] as const;
const POSITION_LABEL: Record<string, string> = {
  Forward: "Penyerang",
  Midfielder: "Gelandang",
  Defender: "Bek",
  Goalkeeper: "Kiper",
};
const DEFAULT_HORIZON_MONTHS = 5;

interface PlayerScenario {
  horizonMonths: number;
  shockPct: number;
  league: string;
}

const PRESETS: { label: string; subtitle: string; data: ProfileForm }[] = [
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
      position_group: "Forward",
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
      position_group: "Midfielder",
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
      position_group: "Defender",
      league_name: "Serie A",
      nationality: "Italy",
    },
  },
];

/** Prefill the synthetic form with the player's real career summary from the dataset. */
function playerToProfile(p: DatasetPlayerRow): ProfileForm {
  const age = p.age ?? 25;
  const span = Math.max(0.5, Number((p.career_span_years || 4).toFixed(1)));
  return {
    age,
    age_at_peak: Math.min(age, p.age_at_peak ?? age),
    peak_value_eur: Math.max(1_000_000, p.peak_value_eur),
    first_value_eur: Math.max(250_000, p.first_value_eur || 1_000_000),
    career_span_years: span,
    years_to_peak: Math.min(span, Number((p.years_to_peak ?? span).toFixed(1))),
    value_volatility: Number((p.value_volatility ?? 0.7).toFixed(2)),
    num_valuation_points: Math.max(2, p.num_valuation_points || 12),
    league_name: LEAGUES.includes(p.league_name as (typeof LEAGUES)[number])
      ? p.league_name
      : "Premier League",
    nationality: p.nationality || "England",
    position_group: POSITION_GROUPS.includes(p.position_group as (typeof POSITION_GROUPS)[number])
      ? p.position_group
      : undefined,
  };
}

function buildPayload(
  form: ProfileForm,
  player: DatasetPlayerRow | null,
  sc: PlayerScenario,
): SimulateRequest {
  if (!player) return form;
  return {
    player_id: player.player_id,
    scenario: {
      horizon_years:
        sc.horizonMonths === DEFAULT_HORIZON_MONTHS ? undefined : sc.horizonMonths / 12,
      league_name: sc.league !== player.league_name ? sc.league : undefined,
      append_valuations:
        sc.shockPct !== 0
          ? [{ value_eur: player.current_value_eur * (1 + sc.shockPct / 100), years_after: 0.5 }]
          : [],
    },
  };
}

export function ScoutingSimulatorPanel() {
  const [form, setForm] = useState<ProfileForm>(PRESETS[0].data);
  const [scenario, setScenario] = useState<PlayerScenario>({
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    shockPct: 0,
    league: "Premier League",
  });
  const [autoPredict, setAutoPredict] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadedPlayer, setLoadedPlayer] = useState<DatasetPlayerRow | null>(null);
  const [selectedClub, setSelectedClub] = useState<string>("Arsenal FC");
  const [selectedContinent, setSelectedContinent] = useState<string>("Eropa");
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

  const payload = useMemo(
    () => buildPayload(form, loadedPlayer, scenario),
    [form, loadedPlayer, scenario],
  );

  // Auto-run once on mount + live debounced prediction when inputs change
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      sim.mutate(payload);
      return;
    }
    if (!autoPredict) return;
    const t = setTimeout(() => {
      sim.mutate(payload);
    }, 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, autoPredict]);

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

  const updateField = <K extends keyof ProfileForm>(key: K, val: ProfileForm[K]) => {
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

  const loadPreset = (data: ProfileForm) => {
    setLoadedPlayer(null);
    setForm(data);
    setSelectedContinent(findContinentForCountry(data.nationality));
    const cat = LEAGUE_CATALOG.find((l) => l.league === data.league_name);
    if (cat?.clubs.length) setSelectedClub(cat.clubs[0]);
    if (!autoPredict) sim.mutate(data);
  };

  const releasePlayer = () => {
    setLoadedPlayer(null);
    if (!autoPredict) sim.mutate(form);
  };

  const loadRealPlayer = (p: DatasetPlayerRow) => {
    const req = playerToProfile(p);
    const sc = { horizonMonths: DEFAULT_HORIZON_MONTHS, shockPct: 0, league: req.league_name };
    setLoadedPlayer(p);
    setScenario(sc);
    setForm(req);
    setSelectedContinent(findContinentForCountry(req.nationality));
    if (p.peak_club) setSelectedClub(p.peak_club);
    setPickerOpen(false);
    setPlayerSearch("");
    if (!autoPredict) sim.mutate(buildPayload(req, p, sc));
  };

  const activeLeague = loadedPlayer ? scenario.league : form.league_name;
  const setLeague = (league: string) => {
    if (loadedPlayer) setScenario((prev) => ({ ...prev, league }));
    else updateField("league_name", league);
  };

  const activeLeagueCat =
    LEAGUE_CATALOG.find((l) => l.league === activeLeague) ?? LEAGUE_CATALOG[0];
  const activeContinentCountries =
    CONTINENT_COUNTRIES.find((c) => c.continent === selectedContinent)?.countries ??
    CONTINENT_COUNTRIES[0].countries;

  const peakMillions = Math.round((form.peak_value_eur / 1_000_000) * 10) / 10;
  const firstMillions = Math.round((form.first_value_eur / 1_000_000) * 10) / 10;
  const refPeak = loadedPlayer ? loadedPlayer.peak_value_eur : form.peak_value_eur;
  const estPctOfPeak =
    sim.data && refPeak > 0 ? Math.round((sim.data.predicted_value_eur / refPeak) * 100) : null;
  const levelPct = Math.round((sim.data?.interval_level ?? 0.8) * 100);
  const isPlayerMode = loadedPlayer !== null;

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
            {loadedPlayer
              ? `Pemain: ${loadedPlayer.name}`
              : `Muat dari ${datasets.data ? fmt.int(datasets.data.total_players) : "..."} Pemain Nyata`}
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
            sim.mutate(payload);
          }}
          className="space-y-5 rounded-xl border border-[#243244] bg-[#121A24] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#F1F5F9]">
                {isPlayerMode ? `What-If: ${loadedPlayer.name}` : "Profil Sintetis"}
              </h3>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                {isPlayerMode
                  ? "Fitur dihitung dari riwayat valuasi asli pemain, sama persis dengan pipeline training."
                  : "Model khusus yang hanya dilatih pada kolom di form ini, jadi tidak ada fitur tebakan."}
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

          {/* League Country -> Club Selector */}
          <div className="space-y-3 rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <div>
              <span className="text-xs font-semibold text-[#94A3B8]">
                {isPlayerMode ? "Skenario Pindah Liga" : "1. Negara Liga & Kompetisi"}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {LEAGUE_CATALOG.map((cat) => {
                  const active = activeLeague === cat.league;
                  return (
                    <button
                      key={cat.league}
                      type="button"
                      onClick={() => {
                        setLeague(cat.league);
                        if (cat.clubs.length && !cat.clubs.includes(selectedClub)) {
                          setSelectedClub(cat.clubs[0]);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-[#10B981] bg-[#10B981]/15 text-[#F1F5F9]"
                          : "border-[#243244] bg-[#121A24] text-[#94A3B8] hover:text-[#F1F5F9]"
                      }`}
                    >
                      <span>{cat.flag}</span>
                      <LeagueBadge league={cat.league} size={14} showName={false} />
                      <span>{cat.country}</span>
                      <span className="text-[10px] opacity-70">({cat.league})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isPlayerMode ? null : (
              <>
            <div className="flex flex-wrap items-center gap-3 border-t border-[#1E293B] pt-3">
              <div className="min-w-[200px] flex-1">
                <span className="block text-[11px] font-semibold text-[#94A3B8]">
                  Klub di {activeLeagueCat.country} ({activeLeagueCat.league})
                </span>
                <select
                  value={
                    activeLeagueCat.clubs.includes(selectedClub)
                      ? selectedClub
                      : activeLeagueCat.clubs[0]
                  }
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#243244] bg-[#121A24] px-3 py-1.5 text-xs text-[#F1F5F9]"
                >
                  {activeLeagueCat.clubs.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-[#243244] bg-[#121A24] px-3 py-2 text-xs font-semibold text-[#F1F5F9]">
                <ClubBadge club={selectedClub} size={18} />
              </div>
            </div>
                <p className="text-[10px] text-[#64748B]">
                  Klub hanya tampilan: riwayat klub di dataset tidak layak dipakai model.
                </p>
              </>
            )}
          </div>

          {isPlayerMode ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#94A3B8]">Jarak ke Update Berikutnya</span>
                  <span className="font-bold text-[#F1F5F9]">{scenario.horizonMonths} bulan</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={18}
                  step={1}
                  value={scenario.horizonMonths}
                  onChange={(e) =>
                    setScenario((prev) => ({ ...prev, horizonMonths: Number(e.target.value) }))
                  }
                  className="mt-2.5 w-full accent-[#10B981]"
                />
                <p className="mt-1 text-[10px] text-[#64748B]">
                  Usia ikut bertambah. 99% jarak antar-update di data di bawah 12 bulan.
                </p>
              </div>

              <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#94A3B8]">Valuasi Hipotetis +6 Bulan</span>
                  <span className="font-bold text-[#F59E0B]">
                    {scenario.shockPct === 0
                      ? "tidak ada"
                      : `${scenario.shockPct > 0 ? "+" : ""}${scenario.shockPct}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-60}
                  max={100}
                  step={5}
                  value={scenario.shockPct}
                  onChange={(e) =>
                    setScenario((prev) => ({ ...prev, shockPct: Number(e.target.value) }))
                  }
                  className="mt-2.5 w-full accent-[#F59E0B]"
                />
                <p className="mt-1 text-[10px] text-[#64748B]">
                  Menambah satu titik ke riwayat, lalu momentum, drawdown, dan volatilitas dihitung
                  ulang.
                </p>
              </div>
            </div>
          ) : (
            <>
          {/* Nationality by Continent -> Country + Flag */}
          <div className="space-y-3 rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#94A3B8]">
                2. Kebangsaan Pemain (Pilih Benua → Negara)
              </span>
              <span className="rounded bg-[#121A24] px-2 py-0.5 text-xs font-bold text-[#F1F5F9]">
                {getCountryFlag(form.nationality)} {form.nationality}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CONTINENT_COUNTRIES.map((group) => {
                const active = selectedContinent === group.continent;
                return (
                  <button
                    key={group.continent}
                    type="button"
                    onClick={() => {
                      setSelectedContinent(group.continent);
                      if (
                        !group.countries.some(
                          (c) => c.name.toLowerCase() === form.nationality.toLowerCase(),
                        )
                      ) {
                        updateField("nationality", group.countries[0].name);
                      }
                    }}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                      active
                        ? "border-[#10B981] bg-[#10B981]/15 text-[#10B981]"
                        : "border-[#243244] bg-[#121A24] text-[#94A3B8] hover:text-[#F1F5F9]"
                    }`}
                  >
                    {group.continent} ({group.countries.length})
                  </button>
                );
              })}
            </div>

            <div className="grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {activeContinentCountries.map((c) => {
                const active = form.nationality.toLowerCase() === c.name.toLowerCase();
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => updateField("nationality", c.name)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                      active
                        ? "border-[#10B981] bg-[#10B981]/15 font-bold text-[#F1F5F9]"
                        : "border-[#1E293B] bg-[#121A24] text-[#94A3B8] hover:border-[#243244] hover:text-[#F1F5F9]"
                    }`}
                  >
                    <span className="shrink-0 text-sm leading-none">{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-[#1E293B] bg-[#0B1117] p-3.5">
            <span className="text-xs font-semibold text-[#94A3B8]">3. Kelompok Posisi</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {POSITION_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => updateField("position_group", g)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    form.position_group === g
                      ? "border-[#10B981] bg-[#10B981]/15 text-[#F1F5F9]"
                      : "border-[#243244] bg-[#121A24] text-[#94A3B8] hover:text-[#F1F5F9]"
                  }`}
                >
                  {POSITION_LABEL[g]}
                </button>
              ))}
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
              <span>Parameter Lanjutan (Volatilitas, Titik Valuasi)</span>
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

              </div>
            ) : null}
          </div>
            </>
          )}

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
            {isPlayerMode ? (
              <button
                type="button"
                onClick={releasePlayer}
                className="rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-2.5 text-xs font-semibold text-[#94A3B8] hover:text-[#F1F5F9]"
              >
                Pakai sebagai Profil Sintetis
              </button>
            ) : null}
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
                <p className="text-xs text-[#94A3B8]">
                  {isPlayerMode
                    ? "Prakiraan Nilai di Update Berikutnya"
                    : "Estimasi Nilai dari Profil"}
                </p>
                <p className="mt-1 text-3xl font-extrabold text-[#10B981]">
                  {fmt.eur(sim.data.predicted_value_eur)}
                </p>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Interval konformal {levelPct}%: {fmt.eur(sim.data.value_range_eur[0])} –{" "}
                  {fmt.eur(sim.data.value_range_eur[1])}
                </p>
                {sim.data.baseline && sim.data.scenario_delta_eur !== undefined ? (
                  <p className="mt-1 text-xs text-[#94A3B8]">
                    Tanpa skenario: {fmt.eur(sim.data.baseline.predicted_value_eur)} · selisih{" "}
                    <strong
                      className={
                        sim.data.scenario_delta_eur >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                      }
                    >
                      {sim.data.scenario_delta_eur >= 0 ? "+" : ""}
                      {fmt.eur(sim.data.scenario_delta_eur)}
                    </strong>
                  </p>
                ) : null}
              </div>

              {sim.data.fair_value_eur !== undefined && sim.data.fair_value_range_eur ? (
                <div className="rounded-lg border border-[#243244] bg-[#0B1117] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[#94A3B8]">Nilai Wajar Fundamental</p>
                    {sim.data.valuation_status ? (
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                          sim.data.valuation_status === "Undervalued"
                            ? "bg-[#10B981]/15 text-[#10B981]"
                            : sim.data.valuation_status === "Overvalued"
                              ? "bg-[#EF4444]/15 text-[#EF4444]"
                              : "bg-[#243244] text-[#94A3B8]"
                        }`}
                      >
                        {sim.data.valuation_status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-lg font-extrabold text-[#F1F5F9]">
                    {fmt.eur(sim.data.fair_value_eur)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                    Interval {levelPct}%: {fmt.eur(sim.data.fair_value_range_eur[0])} –{" "}
                    {fmt.eur(sim.data.fair_value_range_eur[1])}. Tanpa harga 12 bulan terakhir.
                  </p>
                </div>
              ) : null}

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

              {sim.data.warnings?.length ? (
                <ul className="space-y-1 text-[11px] text-[#F59E0B]">
                  {sim.data.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              ) : null}

              {sim.data.models ? (
                <p className="text-[10px] text-[#64748B]">
                  Model: {Object.values(sim.data.models).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : sim.isError ? (
            <p className="mt-4 text-xs text-[#EF4444]">Prediksi gagal: {sim.error.message}</p>
          ) : (
            <p className="mt-4 text-xs text-[#94A3B8]">Memuat prediksi awal...</p>
          )}
        </div>
      </div>
    </div>
  );
}
