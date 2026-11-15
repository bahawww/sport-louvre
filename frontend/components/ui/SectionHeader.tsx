import type { HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

export interface PageHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={clsx(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] sm:text-sm text-muted max-w-3xl leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export interface SectionHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  as?: "h2" | "h3";
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  as: Component = "h2",
  title,
  subtitle,
  actions,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <Component className="text-base font-semibold text-ink tracking-tight">
          {title}
        </Component>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-muted leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
