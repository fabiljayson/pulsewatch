import type { ReactNode } from "react";

import { EmptyState } from "./States";

export interface ChartFrameProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Text alternative describing what the chart shows. */
  summary: string;
  height?: number;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

/**
 * Card wrapper for charts: keeps title, units, and an accessible text
 * alternative next to the visual, with an empty state for missing data.
 */
export function ChartFrame({
  title,
  subtitle,
  actions,
  summary,
  height = 240,
  empty = false,
  emptyMessage = "No checks recorded in this window yet.",
  children,
}: ChartFrameProps) {
  return (
    <div className="card">
      <header className="card-head">
        <div className="card-head__text">
          <h2 className="card__title">{title}</h2>
          {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="card-head__actions">{actions}</div> : null}
      </header>
      <p className="sr-only">{summary}</p>
      {empty ? (
        <EmptyState compact glyph="◌" title="No data in this window">
          <p>{emptyMessage}</p>
        </EmptyState>
      ) : (
        <div className="chart-box" style={{ height }}>
          {children}
        </div>
      )}
    </div>
  );
}
