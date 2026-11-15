"use client";

import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DisclosureProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
  ...props
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={cn(
        "rounded-panel border border-border bg-surface overflow-hidden shadow-none",
        className
      )}
      {...props}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="min-h-[44px] w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-raised/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-ink truncate">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {summary ? (
            <span className="text-xs text-muted tabular-nums">
              {summary}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          className="border-t border-rule px-4 pb-4 pt-3 text-[13px] text-ink"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
