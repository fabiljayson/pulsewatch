import type { ReactNode } from "react";

import type { ApiError } from "../../api/client";
import { Button } from "./Button";

export interface EmptyStateProps {
  glyph?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ glyph = "○", title, children, action, compact }: EmptyStateProps) {
  return (
    <div className={compact ? "state-block state-block--compact" : "state-block"}>
      <span className="state-block__icon" aria-hidden="true">
        {glyph}
      </span>
      <h3>{title}</h3>
      {children ? <div className="text-sm">{children}</div> : null}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  error?: ApiError | Error | null;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ title = "Something went wrong", error, message, onRetry, compact }: ErrorStateProps) {
  const detail = message ?? error?.message ?? "The request failed.";
  return (
    <div
      className={compact ? "state-block state-block--compact" : "state-block"}
      role="alert"
      data-testid="error-state"
    >
      <span className="state-block__icon" aria-hidden="true">
        ⚠
      </span>
      <h3>{title}</h3>
      <p className="text-sm">{detail}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-block state-block--compact" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <div className={tone === "warning" ? "notice notice--warning" : "notice"} role="note">
      {children}
    </div>
  );
}

export function TableLoading({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-wrap" role="status" aria-live="polite" aria-label="Loading table">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (__, colIndex) => (
                <td key={colIndex}>
                  <span className="skeleton skeleton-line" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="sr-only">Loading results…</span>
    </div>
  );
}
