"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink hover:opacity-90",
        secondary: "border border-control bg-raised text-ink hover:bg-active",
        ghost: "text-muted hover:bg-active hover:text-ink",
      },
      size: {
        sm: "min-h-[44px] lg:min-h-[32px] px-3 text-xs",
        md: "min-h-[44px] lg:min-h-[38px] px-3.5 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  children?: ReactNode;
}

export function Button({
  type = "button",
  variant,
  size,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}
