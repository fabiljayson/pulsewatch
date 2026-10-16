import type { ReactNode } from "react";

import type { HealthState } from "../../api/types";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "muted";

export interface BadgeProps {
  tone?: BadgeTone;
  glyph?: string;
  children: ReactNode;
  title?: string;
  className?: string;
}

/** Status colours are always paired with a glyph and a text label. */
export function Badge({ tone = "neutral", glyph, children, title, className }: BadgeProps) {
  const classes = ["badge", `badge--${tone}`, className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={classes} title={title}>
      {glyph ? (
        <span className="badge__icon" aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}

const STATE_GLYPH: Record<HealthState, string> = {
  healthy: "✓",
  degraded: "▲",
  failing: "✕",
  unknown: "?",
};

const STATE_LABEL: Record<HealthState, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  failing: "Failing",
  unknown: "Not checked yet",
};

const STATE_TONE: Record<HealthState, BadgeTone> = {
  healthy: "success",
  degraded: "warning",
  failing: "danger",
  unknown: "muted",
};

export function stateLabel(state: HealthState): string {
  return STATE_LABEL[state];
}

export function StatusBadge({
  state,
  suffix,
}: {
  state: HealthState;
  suffix?: ReactNode;
}) {
  return (
    <Badge
      tone={STATE_TONE[state]}
      glyph={STATE_GLYPH[state]}
      title={`Derived health state: ${STATE_LABEL[state]}`}
      className="badge--state"
    >
      {STATE_LABEL[state]}
      {suffix ? <> · {suffix}</> : null}
    </Badge>
  );
}

export function ResultBadge({ success }: { success: boolean }) {
  return success ? (
    <Badge tone="success" glyph="✓">
      Success
    </Badge>
  ) : (
    <Badge tone="danger" glyph="✕">
      Failure
    </Badge>
  );
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge tone="success" glyph="●">
      Active
    </Badge>
  ) : (
    <Badge tone="muted" glyph="○">
      Inactive
    </Badge>
  );
}
