"use client";

import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;

export type ChartColors = {
  text: string;
  secondary: string;
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  sunken: string;
  border: string;
  accent: string;
  series2: string;
  track: string;
  ok: string;
  warn: string;
  danger: string;
};

const SSR_COLORS: ChartColors = {
  text: "#161B26",
  secondary: "#3B4252",
  muted: "#5A6273",
  grid: "#E5E8ED",
  axis: "#D5DAE1",
  surface: "#FFFFFF",
  sunken: "#E6EAF0",
  border: "#D5DAE1",
  accent: "#2747C9",
  series2: "#B4520A",
  track: "#E1E5EA",
  ok: "#2E9E5B",
  warn: "#E2AC0A",
  danger: "#D93434",
};

function readColors(): ChartColors {
  if (typeof document === "undefined") return SSR_COLORS;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    text: v("--text") || SSR_COLORS.text,
    secondary: v("--text-secondary") || SSR_COLORS.secondary,
    muted: v("--text-muted") || SSR_COLORS.muted,
    grid: v("--rule-soft") || SSR_COLORS.grid,
    axis: v("--rule") || SSR_COLORS.axis,
    surface: v("--panel") || SSR_COLORS.surface,
    sunken: v("--chip") || SSR_COLORS.sunken,
    border: v("--rule") || SSR_COLORS.border,
    accent: v("--series-1") || SSR_COLORS.accent,
    series2: v("--series-2") || SSR_COLORS.series2,
    track: v("--track") || SSR_COLORS.track,
    ok: v("--ispu-baik") || SSR_COLORS.ok,
    warn: v("--ispu-tidak-sehat") || SSR_COLORS.warn,
    danger: v("--ispu-sangat-tidak-sehat") || SSR_COLORS.danger,
  };
}

const colorCache = new Map<string, ChartColors>();

function subscribeTheme(cb: () => void) {
  if (typeof document === "undefined") return () => {};
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

function getThemeSnapshot(): ChartColors {
  if (typeof document === "undefined") return SSR_COLORS;
  const key = document.documentElement.getAttribute("data-theme") || "light";
  let cached = colorCache.get(key);
  if (!cached) {
    cached = readColors();
    colorCache.set(key, cached);
  }
  return cached;
}

export function useChartColors(): ChartColors {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => SSR_COLORS);
}

export function EChart({
  option,
  height = 320,
  label,
}: {
  option: ChartOption;
  height?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    setReady(true);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !chartRef.current) return;
    chartRef.current.setOption(option, { notMerge: true });
  }, [option, ready]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      style={{ width: "100%", height: `${height}px` }}
    />
  );
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <div className="ua-legend" aria-hidden="true">
      {items.map((item) => (
        <span key={item.label}>
          <span
            className={item.dashed ? "ua-legend__line ua-legend__line--dashed" : "ua-legend__line"}
            style={{ background: item.dashed ? "transparent" : item.color, color: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
