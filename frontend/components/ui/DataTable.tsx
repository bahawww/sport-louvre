"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  className?: string;
  headerClassName?: string;
  cell: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  selectedKey?: string | number;
  emptyMessage?: string;
  compact?: boolean;
  framed?: boolean;
  mobileCard?: (row: T, index: number) => ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  emptyMessage = "Belum ada data yang tersedia.",
  compact = false,
  framed = true,
  mobileCard,
  ariaLabel,
  className,
}: DataTableProps<T>) {
  const isInteractive = Boolean(onRowClick);

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile stacked cards (optional) */}
      {mobileCard ? (
        <div className="sm:hidden space-y-2.5">
          {rows.length === 0 ? (
            <div
              className={cn(
                "p-8 text-center text-xs text-muted",
                framed && "rounded-control border border-border bg-surface"
              )}
            >
              {emptyMessage}
            </div>
          ) : (
            rows.map((row, index) => {
              const key = rowKey(row, index);
              const isSelected = selectedKey !== undefined && selectedKey === key;
              return (
                <div
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    isInteractive && "cursor-pointer",
                    isSelected && "ring-1 ring-border"
                  )}
                >
                  {mobileCard(row, index)}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {/* Desktop / default table */}
      <div
        className={cn(
          "w-full",
          mobileCard && "hidden sm:block",
          framed && "rounded-control border border-border bg-surface overflow-hidden"
        )}
      >
        <div className="w-full overflow-x-auto">
          <table
            className="w-full border-collapse text-left text-[13px]"
            aria-label={ariaLabel}
          >
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => {
                const isRight = col.align === "right";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "px-3 font-medium text-xs text-muted whitespace-nowrap",
                      compact ? "py-2" : "py-2.5",
                      isRight ? "text-right tabular-nums" : "text-left",
                      col.headerClassName
                    )}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-xs text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const key = rowKey(row, index);
                const isSelected = selectedKey !== undefined && selectedKey === key;
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-rule last:border-b-0 transition-colors",
                      isSelected
                        ? "bg-active"
                        : isInteractive
                          ? "hover:bg-active/60 cursor-pointer"
                          : undefined
                    )}
                  >
                    {columns.map((col) => {
                      const isRight = col.align === "right";
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 text-ink align-middle text-[13px]",
                            compact ? "py-1.5" : "py-2.5 sm:py-3",
                            isRight ? "text-right tabular-nums" : "text-left",
                            col.className
                          )}
                        >
                          {col.cell(row, index)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
