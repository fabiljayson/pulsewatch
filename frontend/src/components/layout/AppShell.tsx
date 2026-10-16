import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useApiContext } from "../../api/ApiProvider";
import { useAuth } from "../../auth/AuthProvider";
import { pageTitleFor } from "../../routes";
import { Button } from "../ui";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/** Application shell: sidebar + topbar + routed main region. */
export function AppShell() {
  const { demo, setDemo } = useApiContext();
  const { user, status, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const title = pageTitleFor(location.pathname);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${title} · PulseWatch`;
  }, [title]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} version={status?.version} />
        {sidebarOpen ? (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        ) : null}
        <Topbar
          title={title}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          demo={demo}
          onToggleDemo={() => setDemo(!demo)}
          authEnabled={Boolean(status?.enabled)}
          user={user}
          onLogout={() => void handleLogout()}
        />
        <main className="main" id="main-content" tabIndex={-1}>
          {demo ? (
            <div className="demo-banner" role="status">
              <span aria-hidden="true">◍</span>
              <span>
                <strong>Sample data.</strong> These endpoints and checks are generated in your
                browser for exploration. Nothing here is real telemetry and nothing is stored.
              </span>
              <Button size="sm" variant="secondary" onClick={() => setDemo(false)}>
                Exit sample data
              </Button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </>
  );
}
