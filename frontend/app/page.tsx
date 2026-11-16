"use client";

import dynamic from "next/dynamic";
import { type ComponentType, useEffect, useState } from "react";
import { useTheme } from "next-themes";

import {
  useApi,
  type OverviewResponse,
  type TestPredictionsResponse,
} from "@/lib/api";

const loading = () => <div className="sh-load" aria-busy="true" aria-label="Memuat panel" />;

type PanelProps = { overview: OverviewResponse; preds: TestPredictionsResponse };

const ArenaPanel = dynamic(() => import("@/components/panels/ArenaPanel").then((m) => m.ArenaPanel), { loading });
const DiagnosticsPanel = dynamic(() => import("@/components/panels/DiagnosticsPanel").then((m) => m.DiagnosticsPanel), { loading });
const ErrorAnalysisPanel = dynamic(() => import("@/components/panels/ErrorAnalysisPanel").then((m) => m.ErrorAnalysisPanel), { loading });
const TrajectoryExplorerPanel = dynamic(() => import("@/components/panels/TrajectoryExplorerPanel").then((m) => m.TrajectoryExplorerPanel), { loading });
const ScoutingSimulatorPanel = dynamic(() => import("@/components/panels/ScoutingSimulatorPanel").then((m) => m.ScoutingSimulatorPanel), { loading });
const RecommendationsPanel = dynamic(() => import("@/components/panels/RecommendationsPanel").then((m) => m.RecommendationsPanel), { loading });
const DatasetPanel = dynamic(() => import("@/components/panels/DatasetPanel").then((m) => m.DatasetPanel), { loading });
const PenjelasanPanel = dynamic(() => import("@/components/panels/PenjelasanPanel").then((m) => m.PenjelasanPanel), { loading });

const PANELS: Record<TabId, ComponentType<PanelProps>> = {
  arena: ArenaPanel as ComponentType<PanelProps>,
  diagnostics: DiagnosticsPanel as ComponentType<PanelProps>,
  errors: ErrorAnalysisPanel as ComponentType<PanelProps>,
  history: TrajectoryExplorerPanel as ComponentType<PanelProps>,
  simulator: ScoutingSimulatorPanel as ComponentType<PanelProps>,
  recommendations: RecommendationsPanel as ComponentType<PanelProps>,
  datasets: DatasetPanel as ComponentType<PanelProps>,
  penjelasan: PenjelasanPanel as ComponentType<PanelProps>,
};

const TABS = [
  ["arena", "Arena"],
  ["diagnostics", "Diagnostik"],
  ["errors", "Kesalahan"],
  ["history", "Tren Karir"],
  ["simulator", "Simulator"],
  ["recommendations", "Rekomendasi"],
  ["datasets", "Dataset"],
  ["penjelasan", "Penjelasan"],
] as const;

type TabId = (typeof TABS)[number][0];

function readTab(): TabId {
  const p = new URLSearchParams(location.search).get("tab");
  return TABS.some((t) => t[0] === p) ? (p as TabId) : "arena";
}

export default function DashboardPage() {
  const [tab, setTab] = useState<TabId | null>(null);
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setTab(readTab());
    const onPop = () => setTab(readTab());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("popstate", onPop);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("popstate", onPop);
      removeEventListener("keydown", onKey);
    };
  }, []);

  const selectTab = (id: TabId) => {
    setTab(id);
    setOpen(false);
    history.pushState(null, "", id === "arena" ? location.pathname : `?tab=${id}`);
  };

  const isDark = resolvedTheme !== "light";
  // The stored theme is only known in the browser, so the label waits for mount.
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => setThemeReady(true), []);
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");
  const overview = useApi<OverviewResponse>("/overview");
  const preds = useApi<TestPredictionsResponse>("/test-predictions");
  const ActivePanel = PANELS[tab ?? "arena"];
  const metaText = overview.data
    ? `${overview.data.dataset.total_players.toLocaleString("id-ID")} pemain · ${overview.data.dataset.leagues.length} liga`
    : null;

  return (
    <div className="sh-root">
      <header className="sh-top">
        <div className="sh-top-in">
          <div className="sh-brand">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="sh-ibtn sh-hide-lg"
              aria-label="Buka menu navigasi"
              aria-expanded={open}
            >
              Menu
            </button>
            <svg className="sh-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3.5 21.5 20h-19z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M7.6 12.5h8.8" stroke="currentColor" strokeWidth="1.8" />
              <circle className="dot" cx="12" cy="16.2" r="1.9" />
            </svg>
            <b className="sh-title">Sport Louvre</b>
            <span className="sh-sub sh-only-lg">2025/26</span>
          </div>

          <nav aria-label="Navigasi utama" className="sh-nav-top">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={tab === id ? "sh-tab on" : "sh-tab"}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="sh-right">
            {metaText && <span className="sh-sub sh-meta">{metaText}</span>}
            <button type="button" onClick={toggleTheme} className="sh-ibtn" aria-label="Ganti tema">
              {themeReady ? (isDark ? "Terang" : "Gelap") : "Tema"}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <>
          <div className="sh-back" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside aria-label="Menu navigasi" className="sh-aside open">
            <div className="sh-head">
              <div>
                <b className="sh-title">Sport Louvre</b>
                <p className="sh-sub">Transfermarkt 2025/2026</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="sh-ibtn" aria-label="Tutup menu">
                Tutup
              </button>
            </div>

            <nav aria-label="Navigasi mobile" className="sh-nav">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={tab === id ? "sh-tab on" : "sh-tab"}
                >
                  {label}
                </button>
              ))}
            </nav>

            {metaText && (
              <div className="sh-foot">
                <p className="sh-sub">{metaText}</p>
              </div>
            )}
          </aside>
        </>
      )}

      <main className="sh-main">
        {!tab || overview.isLoading || preds.isLoading ? (
          loading()
        ) : overview.isError || preds.isError || !overview.data || !preds.data ? (
          <div role="alert" className="sh-err">
            Gagal memuat data API.{" "}
            <button
              type="button"
              onClick={() => {
                overview.refetch();
                preds.refetch();
              }}
              className="sh-retry"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <ActivePanel overview={overview.data} preds={preds.data} />
        )}
      </main>
    </div>
  );
}
