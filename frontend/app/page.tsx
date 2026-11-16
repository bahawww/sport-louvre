"use client";

import { PanelSkeleton } from "@/components/ui";
import dynamic from "next/dynamic";
import { type ComponentType, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import {
  useApi,
  type OverviewResponse,
  type TestPredictionsResponse,
} from "@/lib/api";

const loading = () => <PanelSkeleton />;
const quietLoading = () => null;

type PanelProps = { overview: OverviewResponse; preds: TestPredictionsResponse };

const LOADERS = {
  arena: () => import("@/components/panels/ArenaPanel").then((m) => m.ArenaPanel),
  diagnostics: () => import("@/components/panels/DiagnosticsPanel").then((m) => m.DiagnosticsPanel),
  errors: () => import("@/components/panels/ErrorAnalysisPanel").then((m) => m.ErrorAnalysisPanel),
  history: () => import("@/components/panels/TrajectoryExplorerPanel").then((m) => m.TrajectoryExplorerPanel),
  simulator: () => import("@/components/panels/ScoutingSimulatorPanel").then((m) => m.ScoutingSimulatorPanel),
  recommendations: () => import("@/components/panels/RecommendationsPanel").then((m) => m.RecommendationsPanel),
  datasets: () => import("@/components/panels/DatasetPanel").then((m) => m.DatasetPanel),
  penjelasan: () => import("@/components/panels/PenjelasanPanel").then((m) => m.PenjelasanPanel),
} as const;

const PANELS: Record<TabId, ComponentType<PanelProps>> = {
  arena: dynamic(LOADERS.arena, { loading: quietLoading }) as ComponentType<PanelProps>,
  diagnostics: dynamic(LOADERS.diagnostics, { loading: quietLoading }) as ComponentType<PanelProps>,
  errors: dynamic(LOADERS.errors, { loading: quietLoading }) as ComponentType<PanelProps>,
  history: dynamic(LOADERS.history, { loading: quietLoading }) as ComponentType<PanelProps>,
  simulator: dynamic(LOADERS.simulator, { loading: quietLoading }) as ComponentType<PanelProps>,
  recommendations: dynamic(LOADERS.recommendations, { loading: quietLoading }) as ComponentType<PanelProps>,
  datasets: dynamic(LOADERS.datasets, { loading: quietLoading }) as ComponentType<PanelProps>,
  penjelasan: dynamic(LOADERS.penjelasan, { loading: quietLoading }) as ComponentType<PanelProps>,
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
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number; on: boolean }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    on: false,
  });
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setTab(readTab());
    const onPop = () => setTab(readTab());
    addEventListener("popstate", onPop);
    return () => {
      removeEventListener("popstate", onPop);
    };
  }, []);

  useLayoutEffect(() => {
    const sync = () => {
      const nav = navRef.current;
      const active = nav?.querySelector<HTMLButtonElement>('[aria-current="page"]');
      if (!active) {
        setPill((p) => (p.on ? { ...p, on: false } : p));
        return;
      }
      setPill({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
        on: true,
      });
      if (nav && nav.scrollWidth > nav.clientWidth) {
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        nav.scrollTo({
          left: Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2),
          behavior: reduce ? "auto" : "smooth",
        });
      }
    };
    sync();
    addEventListener("resize", sync);
    return () => removeEventListener("resize", sync);
  }, [tab]);

  const selectTab = (id: TabId) => {
    setTab(id);
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

  return (
    <div className="sh-root">
      <header className="sh-top">
        <div className="sh-top-in">
          <div className="sh-brand">
            <svg className="sh-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2.5" y="4.5" width="19" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
              <path d="M12 4.5v15M2.5 8.5h3.2v7H2.5M21.5 8.5h-3.2v7h3.2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.5" />
              <circle className="dot" cx="12" cy="12" r="1.2" />
            </svg>
            <b className="sh-title">Sport Louvre</b>
            <span className="sh-sub sh-only-lg">Football player market value analysis</span>
          </div>

          <nav ref={navRef} aria-label="Navigasi utama" className="sh-nav-top">
            <span
              className="sh-pill"
              aria-hidden="true"
              style={{
                width: pill.width,
                height: pill.height,
                transform: `translate(${pill.left}px, ${pill.top}px)`,
                opacity: pill.on ? 1 : 0,
              }}
            />
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onMouseEnter={() => void LOADERS[id]()}
                onFocus={() => void LOADERS[id]()}
                onClick={() => selectTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={tab === id ? "sh-tab on" : "sh-tab"}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="sh-right">
            <button type="button" onClick={toggleTheme} className="sh-ibtn" aria-label="Ganti tema">
              {themeReady ? (isDark ? "Terang" : "Gelap") : "Tema"}
            </button>
          </div>
        </div>
      </header>

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
          <div key={tab} className="sp-view">
            <ActivePanel overview={overview.data} preds={preds.data} />
          </div>
        )}
      </main>
    </div>
  );
}
