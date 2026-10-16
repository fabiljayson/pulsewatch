import { Button } from "../ui";

export interface TopbarProps {
  title: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  demo: boolean;
  onToggleDemo: () => void;
  authEnabled: boolean;
  user: string | null;
  onLogout: () => void;
}

export function Topbar({
  title,
  sidebarOpen,
  onToggleSidebar,
  demo,
  onToggleDemo,
  authEnabled,
  user,
  onLogout,
}: TopbarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn--ghost btn--sm topbar__menu-btn"
        onClick={onToggleSidebar}
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
      >
        <span aria-hidden="true">☰</span>
      </button>

      <span className="topbar__title" data-testid="page-title">
        {title}
      </span>

      <div className="topbar__actions">
        <a
          className="btn btn--ghost btn--sm"
          href="/docs"
          target="_blank"
          rel="noreferrer"
        >
          API docs
          <span className="sr-only"> (opens the OpenAPI docs in a new tab)</span>
        </a>
        <Button
          size="sm"
          variant={demo ? "primary" : "ghost"}
          aria-pressed={demo}
          onClick={onToggleDemo}
          data-testid="demo-toggle"
          title={
            demo
              ? "Switch back to live data from the API"
              : "Explore the interface with clearly-labelled sample data"
          }
        >
          {demo ? "Exit sample data" : "Sample data"}
        </Button>
        {authEnabled && user ? (
          <>
            <span className="topbar__user">{user}</span>
            <Button size="sm" variant="secondary" onClick={onLogout} data-testid="logout">
              Sign out
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}
