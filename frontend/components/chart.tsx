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
  chart1: "#5fd38d",
  chart2: "#c9c9c9",
  chart3: "#e5a93b",
  chart4: "#ef6b6b",
  chartColors: ["#5fd38d", "#c9c9c9", "#e5a93b", "#ef6b6b"],
  ink: "#ececec",
  muted: "#b4b4b4",
  grid: "#262626",
  axisInk: "#b4b4b4",
  surface: "#141414",
  raised: "#1e1e1e",
  border: "#242424",
  positive: "#5fd38d",
  warning: "#e5a93b",
  negative: "#ef6b6b",
  info: "#c9c9c9",
  accent: "#5fd38d",
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

    const c1 = getVal("--chart-1", isDark ? "#5fd38d" : "#1b7a45");
    const c2 = getVal("--chart-2", isDark ? "#c9c9c9" : "#4a4a48");
    const c3 = getVal("--chart-3", isDark ? "#e5a93b" : "#b45309");
    const c4 = getVal("--chart-4", isDark ? "#ef6b6b" : "#c4242a");

    setTheme({
      isDark,
      chart1: c1,
      chart2: c2,
      chart3: c3,
      chart4: c4,
      chartColors: [c1, c2, c3, c4],
      ink: getVal("--chart-ink", isDark ? "#ececec" : "#0d0d0c"),
      muted: getVal("--chart-muted", isDark ? "#b4b4b4" : "#5a5d5a"),
      grid: getVal("--grid", isDark ? "#262626" : "#e5e5e3"),
      axisInk: getVal("--axis-ink", isDark ? "#b4b4b4" : "#5a5d5a"),
      surface: getVal("--surface", isDark ? "#141414" : "#ffffff"),
      raised: getVal("--raised", isDark ? "#1e1e1e" : "#f1f1ef"),
      border: getVal("--border", isDark ? "#242424" : "#e5e5e3"),
      positive: getVal("--positive", isDark ? "#5fd38d" : "#1b7a45"),
      warning: getVal("--warning", isDark ? "#e5a93b" : "#92400e"),
      negative: getVal("--negative", isDark ? "#ef6b6b" : "#c4242a"),
      info: getVal("--info", isDark ? "#c9c9c9" : "#5a5d5a"),
      accent: getVal("--accent", isDark ? "#5fd38d" : "#1b7a45"),
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
    // The canvas does not inherit CSS, so hand it the page's own typeface.
    const fontFamily = getComputedStyle(document.body).fontFamily;
    chartInstanceRef.current.setOption(
      { ...option, textStyle: { fontFamily, ...(option as { textStyle?: object }).textStyle } },
      { notMerge: true },
    );
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
