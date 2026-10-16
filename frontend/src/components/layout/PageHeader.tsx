import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}

/** Page-level heading block: h1, context line, status badges, primary actions. */
export function PageHeader({ title, subtitle, badges, actions, testId }: PageHeaderProps) {
  return (
    <div className="page-header" data-testid={testId}>
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle ? <p className="muted text-sm">{subtitle}</p> : null}
        {badges ? <div className="page-header__badges">{badges}</div> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}
