"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface PaginationProps extends HTMLAttributes<HTMLDivElement> {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  unitLabel?: string;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  unitLabel = "item",
  className,
  ...props
}: PaginationProps) {
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-3 text-xs text-muted",
        className
      )}
      {...props}
    >
      <div className="tabular-nums">
        Menampilkan{" "}
        <span className="font-medium text-ink">{from}</span> sampai{" "}
        <span className="font-medium text-ink">{to}</span> dari{" "}
        <span className="font-medium text-ink">{totalItems}</span> {unitLabel}
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          Sebelumnya
        </Button>

        <span className="px-2 text-xs font-medium text-ink tabular-nums">
          Halaman {page} dari {safeTotalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
