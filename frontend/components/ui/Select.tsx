"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  size?: "sm" | "md";
  align?: "left" | "right";
  className?: string;
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  align = "left",
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIdx] ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActiveIdx(selectedIdx);
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, selectedIdx]);

  const choose = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const onButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIdx((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      if (open && activeIdx >= 0 && options[activeIdx]) {
        e.preventDefault();
        choose(options[activeIdx].value);
      }
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    }
  };

  const sizeCls =
    size === "sm"
      ? "min-h-[44px] lg:min-h-[34px] px-3 text-xs"
      : "min-h-[44px] lg:min-h-[36px] px-3 text-[13px]";

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2.5 rounded-control border border-control bg-raised text-ink transition-colors hover:bg-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          sizeCls,
        )}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn(
            "shrink-0 text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute top-full z-40 mt-1.5 min-w-full w-max max-w-[min(280px,90vw)] max-h-64 overflow-y-auto rounded-control border border-control bg-surface p-1 shadow-[0_12px_32px_rgba(0,0,0,0.32)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((opt, i) => {
            const isSel = opt.value === value;
            const isAct = i === activeIdx;
            return (
              <li key={opt.value} role="option" aria-selected={isSel}>
                <button
                  type="button"
                  onClick={() => choose(opt.value)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors",
                    size === "sm" ? "text-xs" : "text-[13px]",
                    isSel
                      ? "bg-active font-medium text-ink"
                      : isAct
                        ? "bg-raised text-ink"
                        : "text-muted hover:bg-raised hover:text-ink",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSel && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="shrink-0 text-accent"
                    >
                      <path
                        d="M3.5 8.5l3 3 6-6.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
