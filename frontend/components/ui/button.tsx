import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// Kelas `ua-btn*` berasal dari design system Udara Jakarta (design/bundle.css); tinggi minimal 44px.
const buttonVariants = cva("ua-btn", {
  variants: {
    variant: {
      default: "ua-btn--primary",
      outline: "ua-btn--secondary",
      ghost: "ua-btn--ghost",
      destructive: "ua-btn--danger",
    },
    size: { default: "", sm: "ua-btn--sm", icon: "ua-btn--icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
