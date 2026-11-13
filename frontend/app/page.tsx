"use client";

import { useState } from "react";

import { LogoMark } from "@/components/logo-mark";
import { ArenaPanel } from "@/components/panels/ArenaPanel";
import { DiagnosticsPanel } from "@/components/panels/DiagnosticsPanel";
import { ErrorAnalysisPanel } from "@/components/panels/ErrorAnalysisPanel";
import { RecommendationsPanel } from "@/components/panels/RecommendationsPanel";
import { ScoutingSimulatorPanel } from "@/components/panels/ScoutingSimulatorPanel";
import { TrajectoryExplorerPanel } from "@/components/panels/TrajectoryExplorerPanel";
import { useApi, type OverviewResponse, type TestPredictionsResponse } from "@/lib/api";

const TABS = [
  { id: "arena", label: "KPI & Model Arena" },
  { id: "diagnostics", label: "Confusion & Scatter" },
  { id: "errors", label: "Analisis Kesalahan" },
  { id: "history", label: "Tren Karir" },
  { id: "simulator", label: "Scouting Simulator" },
  { id: "recommendations", label: "Rekomendasi Klub" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function DashboardPage() {
  const [tab, setTab] = useState<TabId>("arena");
  const overview = useApi<OverviewResponse>("/overview");
  const preds = useApi<TestPredictionsResponse>("/test-predictions");

  return (
    <div className="min-h-dvh bg-[#0B1117] text-[#F1F5F9]">
      <header className="sticky top-0 z-20 border-b border-[#243244] bg-[#0B1117]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark size={28} />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-[#F1F5F9]">
                Sport Louvre
              </h1>
              <p className="text-[11px] text-[#94A3B8]">
                Transfermarkt 2025/2026 · Football Transfer Value Intelligence
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1.5" aria-label="Dashboard tabs">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-[#10B981] text-[#0B1117]"
                      : "bg-[#121A24] text-[#94A3B8] hover:bg-[#182230] hover:text-[#F1F5F9]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {overview.isLoading || preds.isLoading ? (
          <div className="rounded-xl border border-[#243244] bg-[#121A24] p-8 text-center text-sm text-[#94A3B8]">
            Memuat model ML dan data evaluasi Transfermarkt...
          </div>
        ) : overview.isError || preds.isError || !overview.data || !preds.data ? (
          <div className="rounded-xl border border-rose-500/30 bg-[#121A24] p-6 text-sm text-rose-400">
            Gagal memuat data API. Pastikan service backend sehat.
          </div>
        ) : (
          <>
            {tab === "arena" && <ArenaPanel overview={overview.data} preds={preds.data} />}
            {tab === "diagnostics" && <DiagnosticsPanel overview={overview.data} preds={preds.data} />}
            {tab === "errors" && <ErrorAnalysisPanel preds={preds.data} />}
            {tab === "history" && <TrajectoryExplorerPanel />}
            {tab === "simulator" && <ScoutingSimulatorPanel />}
            {tab === "recommendations" && <RecommendationsPanel preds={preds.data} />}
          </>
        )}
      </main>
    </div>
  );
}
