"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Short node captions, one per workflow step, in step order. */
const CAPTIONS = [
  "Baca CSV",
  "Bersihkan",
  "Potong riwayat",
  "Hitung fitur",
  "Pisahkan uji",
  "Pilih model",
  "Latih",
  "Kalibrasi",
  "Uji",
  "Sajikan",
];

/** Colour by kind of work, the way a visual workflow tool groups its widgets. */
const PHASE_COLOR = ["var(--chart-3)", "var(--chart-2)", "var(--chart-1)"];
const phaseOf = (i: number) => (i <= 3 ? 0 : i <= 7 ? 1 : 2);

const W = 1090;
const H = 250;
const ROW = 125;
const R = 24;
const STEP_X = [50, 140, 230, 320, 410, 640, 740, 840, 940, 1040];
const SELECT_STEP = 5;
const LEARNERS = [
  { key: "linear", label: "Regresi linear", y: 45 },
  { key: "boost", label: "Gradient boosting", y: 125 },
  { key: "tree", label: "Decision Tree", y: 205 },
] as const;
const LEARNER_X = 525;
const LEARNER_R = 18;

/** Glyphs are drawn in a 24x24 box with strokes only, so they follow the node colour. */
const STEP_GLYPH: ReactNode[] = [
  <path key="g" d="M7 3h7l4 4v14H7z M14 3v4h4 M10 12h5 M10 15h5 M10 18h3" />,
  <path key="g" d="M4 5h16l-6 7v6l-4 2v-8z" />,
  <g key="g">
    <path d="M3 17l4-5 3 2 3-6" />
    <path d="M13 3v18" strokeDasharray="2 2.5" />
    <circle cx="18.5" cy="7" r="1.6" fill="currentColor" stroke="none" />
  </g>,
  <g key="g">
    <rect x="4" y="5" width="16" height="14" rx="1.5" />
    <path d="M4 10h16 M9.5 5v14 M15 5v14" />
  </g>,
  <g key="g">
    <rect x="3" y="8" width="11" height="8" rx="1.5" />
    <rect x="17" y="8" width="4" height="8" rx="1.5" />
  </g>,
  <g key="g">
    <path d="M5 20v-6 M10 20v-10 M15 20v-4" />
    <path d="M14 7l2 2 4-4" />
  </g>,
  <g key="g">
    <path d="M3 19c7 0 8-11 18-13" />
    <circle cx="7" cy="15" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="16" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
  </g>,
  <g key="g">
    <path d="M4 20L20 4" strokeDasharray="2 2.5" />
    <circle cx="8" cy="15" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="12.5" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="7" r="1.7" fill="currentColor" stroke="none" />
  </g>,
  <g key="g">
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9.5 4V2.5h5V4 M8.5 13l2.5 2.5 4.5-5" />
  </g>,
  <g key="g">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18 M9 12.5l-2 2 2 2 M15 12.5l2 2-2 2" />
  </g>,
];

const LEARNER_GLYPH: Record<(typeof LEARNERS)[number]["key"], ReactNode> = {
  linear: (
    <g>
      <path d="M4 19L20 6" />
      <circle cx="7" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="11" r="1.4" fill="currentColor" stroke="none" />
    </g>
  ),
  boost: <path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21" />,
  tree: (
    <g>
      <path d="M12 6.5v3 M12 9.5L6 13 M12 9.5l6 3.5 M6 15.5L3.5 19 M6 15.5L8.5 19" />
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="6" cy="14" r="1.8" />
      <circle cx="18" cy="14" r="1.8" />
    </g>
  ),
};

const link = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
};

/** Dashed arcs left and right of a node: where links plug in. */
function Ears({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const a = r + 5;
  const dy = a * 0.72;
  const dx = a * 0.69;
  return (
    <g fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2.5 3" strokeLinecap="round">
      <path d={`M${cx - dx} ${cy - dy} A${a} ${a} 0 0 0 ${cx - dx} ${cy + dy}`} />
      <path d={`M${cx + dx} ${cy - dy} A${a} ${a} 0 0 1 ${cx + dx} ${cy + dy}`} />
    </g>
  );
}

/**
 * The workflow drawn as a canvas of connected widgets. Each node is a tab that selects its step;
 * the three learner nodes between "Pisahkan uji" and "Pilih model" all open the model-selection step.
 */
export function WorkflowCanvas({ active, onSelect }: { active: number; onSelect: (index: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // Keep the selected node in view when the canvas scrolls sideways on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = (STEP_X[active] / W) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(i);
    }
  };
  const linkColor = (reached: boolean) => (reached ? "var(--muted)" : "var(--control)");

  return (
    <div ref={scroller} className="overflow-x-auto [scrollbar-width:thin]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full min-w-[860px]"
        role="tablist"
        aria-label="Tahap alur kerja"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            onSelect(Math.min(STEP_X.length - 1, active + 1));
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onSelect(Math.max(0, active - 1));
          }
        }}
      >
        <g fill="none" strokeWidth="2" strokeLinecap="round">
          {STEP_X.slice(0, -1).map((x, i) =>
            i === SELECT_STEP - 1 ? null : (
              <path key={i} d={link(x + R + 6, ROW, STEP_X[i + 1] - R - 6, ROW)} stroke={linkColor(i < active)} />
            ),
          )}
          {LEARNERS.map((l) => (
            <g key={l.key} stroke={linkColor(active >= SELECT_STEP)}>
              <path d={link(STEP_X[SELECT_STEP - 1] + R + 6, ROW, LEARNER_X - LEARNER_R - 6, l.y)} />
              <path d={link(LEARNER_X + LEARNER_R + 6, l.y, STEP_X[SELECT_STEP] - R - 6, ROW)} />
            </g>
          ))}
        </g>

        {LEARNERS.map((l) => {
          const color = PHASE_COLOR[1];
          const on = active === SELECT_STEP;
          return (
            <g
              key={l.key}
              role="tab"
              tabIndex={-1}
              aria-selected={false}
              aria-label={`${l.label}, kandidat di tahap ${SELECT_STEP + 1}`}
              onClick={() => onSelect(SELECT_STEP)}
              onKeyDown={(e) => onKey(e, SELECT_STEP)}
              className="cursor-pointer outline-none"
            >
              <Ears cx={LEARNER_X} cy={l.y} r={LEARNER_R} color={color} />
              <circle
                cx={LEARNER_X}
                cy={l.y}
                r={LEARNER_R}
                fill={`color-mix(in srgb, ${color} ${on ? 26 : 12}%, var(--surface))`}
                stroke={color}
                strokeWidth="1.5"
              />
              <g
                transform={`translate(${LEARNER_X - 9.6} ${l.y - 9.6}) scale(0.8)`}
                fill="none"
                stroke={color}
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color }}
              >
                {LEARNER_GLYPH[l.key]}
              </g>
              <text
                x={LEARNER_X}
                y={l.y + LEARNER_R + 17}
                textAnchor="middle"
                fontSize="11.5"
                fill={on ? "var(--text)" : "var(--muted)"}
              >
                {l.label}
              </text>
            </g>
          );
        })}

        {STEP_X.map((x, i) => {
          const color = PHASE_COLOR[phaseOf(i)];
          const on = i === active;
          return (
            <g
              key={i}
              role="tab"
              tabIndex={on ? 0 : -1}
              aria-selected={on}
              aria-label={`Tahap ${i + 1}: ${CAPTIONS[i]}`}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => onKey(e, i)}
              className="group cursor-pointer outline-none"
            >
              <circle
                cx={x}
                cy={ROW}
                r={R + 10}
                fill="none"
                stroke="var(--text)"
                strokeWidth="2"
                className="opacity-0 group-focus-visible:opacity-100"
              />
              <Ears cx={x} cy={ROW} r={R} color={color} />
              <circle
                cx={x}
                cy={ROW}
                r={R}
                fill={`color-mix(in srgb, ${color} ${on ? 30 : 12}%, var(--surface))`}
                stroke={color}
                strokeWidth={on ? 3 : 1.5}
              />
              <g
                transform={`translate(${x - 12} ${ROW - 12})`}
                fill="none"
                stroke={color}
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color }}
              >
                {STEP_GLYPH[i]}
              </g>
              <text x={x} y={ROW - R - 12} textAnchor="middle" fontSize="11" fill="var(--faint)" className="tabular-nums">
                {i + 1}
              </text>
              <text
                x={x}
                y={ROW + R + 22}
                textAnchor="middle"
                fontSize="12"
                fontWeight={on ? 600 : 400}
                fill={on ? "var(--text)" : "var(--muted)"}
              >
                {CAPTIONS[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
