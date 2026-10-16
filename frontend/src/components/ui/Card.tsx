import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type CardVariant = "default" | "compact" | "hero";

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
  id?: string;
}

export function Card({
  children,
  variant = "default",
  title,
  subtitle,
  actions,
  className,
  headingLevel: Heading = "h2",
  id,
}: CardProps) {
  const classes = ["card", variant !== "default" ? `card--${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} id={id}>
      {title || actions ? (
        <header className="card-head">
          <div className="card-head__text">
            {title ? <Heading className="card__title">{title}</Heading> : null}
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-head__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export type MetricTone = "default" | "success" | "warning" | "danger";

export interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTone;
  glyph?: string;
  to?: string;
  loading?: boolean;
  testId?: string;
}

/** Bento metric tile; `to` turns the whole tile into a link to a detail view. */
export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  glyph,
  to,
  loading = false,
  testId,
}: MetricCardProps) {
  const toneClass = tone === "default" ? "" : ` metric__value--${tone}`;
  const body = (
    <div className="metric">
      <span className="metric__label">
        {glyph ? (
          <span aria-hidden="true" className="metric__glyph">
            {glyph}
          </span>
        ) : null}
        {label}
      </span>
      {loading ? (
        <span className="skeleton metric__skeleton" aria-hidden="true" />
      ) : (
        <span className={`metric__value${toneClass}`}>{value}</span>
      )}
      {hint ? <span className="metric__hint">{hint}</span> : null}
    </div>
  );

  if (to) {
    return (
      <Link className="card card--compact card--link" to={to} data-testid={testId}>
        {body}
      </Link>
    );
  }
  return (
    <div className="card card--compact" data-testid={testId}>
      {body}
    </div>
  );
}
