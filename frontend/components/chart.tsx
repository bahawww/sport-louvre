"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;

export interface ChartTheme {
  isDark: boolean;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chartColors: [string, string, string, string];
  ink: string;
  muted: string;
  grid: string;
  axisInk: string;
  surface: string;
  raised: string;
  border: string;
  positive: string;
  warning: string;
  negative: string;
  info: string;
  accent: string;
}

const DEFAULT_DARK_THEME: ChartTheme = {
  isDark: true,
  chart1: "#10b981",
  chart2: "#38bdf8",
  chart3: "#f59e0b",
  chart4: "#f87171",
  chartColors: ["#10b981", "#38bdf8", "#f59e0b", "#f87171"],
  ink: "#e4e4e7",
  muted: "#9ca3af",
  grid: "#23262e",
  axisInk: "#9ca3af",
  surface: "#121316",
  raised: "#1a1c20",
  border: "#262930",
  positive: "#34d399",
  warning: "#fbbf24",
  negative: "#f87171",
  info: "#38bdf8",
  accent: "#10b981",
};

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<ChartTheme>(DEFAULT_DARK_THEME);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDark = resolvedTheme !== "light";
    const style = getComputedStyle(document.documentElement);
    const getVal = (varName: string, fallback: string) => {
      const v = style.getPropertyValue(varName).trim();
      return v || fallback;
    };

    const c1 = getVal("--chart-1", isDark ? "#10b981" : "#059669");
    const c2 = getVal("--chart-2", isDark ? "#38bdf8" : "#0284c7");
    const c3 = getVal("--chart-3", isDark ? "#f59e0b" : "#d97706");
    const c4 = getVal("--chart-4", isDark ? "#f87171" : "#dc2626");

    setTheme({
      isDark,
      chart1: c1,
      chart2: c2,
      chart3: c3,
      chart4: c4,
      chartColors: [c1, c2, c3, c4],
      ink: getVal("--chart-ink", isDark ? "#e4e4e7" : "#111827"),
      muted: getVal("--chart-muted", isDark ? "#9ca3af" : "#4b5563"),
      grid: getVal("--grid", isDark ? "#23262e" : "#e5e7eb"),
      axisInk: getVal("--axis-ink", isDark ? "#9ca3af" : "#4b5563"),
      surface: getVal("--surface", isDark ? "#121316" : "#ffffff"),
      raised: getVal("--raised", isDark ? "#1a1c20" : "#f0f2f5"),
      border: getVal("--border", isDark ? "#262930" : "#e2e5ea"),
      positive: getVal("--positive", isDark ? "#34d399" : "#047857"),
      warning: getVal("--warning", isDark ? "#fbbf24" : "#b45309"),
      negative: getVal("--negative", isDark ? "#f87171" : "#dc2626"),
      info: getVal("--info", isDark ? "#38bdf8" : "#0369a1"),
      accent: getVal("--accent", isDark ? "#10b981" : "#059669"),
    });
  }, [resolvedTheme]);

  return theme;
}

export function chartTooltipBase(theme: ChartTheme) {
  return {
    backgroundColor: theme.raised,
    borderColor: theme.border,
    borderWidth: 1,
    textStyle: {
      color: theme.ink,
      fontSize: 12,
    },
  };
}

export function EChart({
  option,
  height = 300,
  label,
}: {
  option: ChartOption;
  height?: number;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartElRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = chartElRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartInstanceRef.current = chart;
    setReady(true);

    const handleResize = () => {
      chart.resize();
    };

    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(el);
    if (containerRef.current && containerRef.current !== el) {
      ro.observe(containerRef.current);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !chartInstanceRef.current) return;
    chartInstanceRef.current.setOption(option, { notMerge: true });
  }, [option, ready]);

  return (
    <div ref={containerRef} className="w-full min-w-0 overflow-hidden">
      <div
        ref={chartElRef}
        role="img"
        aria-label={label}
        style={{ width: "100%", height: `${height}px` }}
      />
    </div>
  );
}
