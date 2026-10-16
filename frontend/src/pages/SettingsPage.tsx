import { useApiContext } from "../api/ApiProvider";
import { useWindowHours } from "../hooks";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/layout";
import { Button, Card, Segmented, useToast } from "../components/ui";
import { formatWindow } from "../lib/format";
import { WINDOW_OPTIONS } from "../lib/window";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "") || "same origin";

export function SettingsPage() {
  const { demo, setDemo } = useApiContext();
  const { status, user, logout } = useAuth();
  const [hours, setHours] = useWindowHours();
  const toast = useToast();

  const onToggleDemo = () => {
    setDemo(!demo);
    toast.push("info", demo ? "Switched to live data." : "Showing labelled sample data.");
  };

  const onLogout = async () => {
    await logout();
    toast.success("Signed out.");
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Preferences stored in this browser; access and backend details come from the live API."
      />

      <div className="bento">
        <div className="span-6">
          <Card
            title="Sample data"
            subtitle="Explore the full interface without a backend database."
          >
            <div className="stack">
              <p className="text-sm muted">
                Sample data is generated in your browser, always labelled in the interface, and
                never written to SQLite. Mutations are blocked while it is on.
              </p>
              <div className="row">
                <Button
                  variant={demo ? "secondary" : "primary"}
                  aria-pressed={demo}
                  onClick={onToggleDemo}
                  data-testid="settings-demo-toggle"
                >
                  {demo ? "Exit sample data" : "Enable sample data"}
                </Button>
                <span className="badge badge--muted">
                  <span className="badge__icon" aria-hidden="true">
                    ●
                  </span>
                  {demo ? "Sample data on" : "Live data"}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <div className="span-6">
          <Card
            title="Default reporting window"
            subtitle="Applied to dashboard-style pages until you change it there."
          >
            <div className="stack">
              <Segmented
                label="Window"
                value={hours}
                options={WINDOW_OPTIONS}
                onChange={setHours}
                testId="settings-window"
              />
              <p className="text-sm muted">
                Current default: {formatWindow(hours)}. Stored as{" "}
                <code className="mono">pulsewatch.windowHours</code> in this browser only.
              </p>
            </div>
          </Card>
        </div>

        <div className="span-6">
          <Card title="Access" subtitle="Single-admin session for this deployment.">
            <div className="stack stack--sm">
              <dl className="kv">
                <dt>Authentication</dt>
                <dd>{status?.enabled ? "Enabled" : "Disabled"}</dd>
                <dt>Signed in as</dt>
                <dd>{user ?? "—"}</dd>
                <dt>Service version</dt>
                <dd className="mono">{status?.version ?? "—"}</dd>
              </dl>
              {status?.enabled && user ? (
                <div className="row">
                  <Button variant="secondary" onClick={() => void onLogout()} data-testid="settings-logout">
                    Sign out
                  </Button>
                </div>
              ) : (
                <p className="text-sm muted">
                  This deployment runs without a login. Set{" "}
                  <code className="mono">PULSEWATCH_ADMIN_PASSWORD</code> on the backend to require
                  one.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="span-6">
          <Card title="Backend connection" subtitle="Where this interface sends its requests.">
            <dl className="kv">
              <dt>API base</dt>
              <dd className="mono">{API_BASE}</dd>
              <dt>Override with</dt>
              <dd className="mono">VITE_API_BASE_URL</dd>
              <dt>Proxy path</dt>
              <dd className="mono">/api → http://127.0.0.1:8000 (dev)</dd>
            </dl>
            <p className="text-sm muted page-note">
              API docs: <a href="/docs" target="_blank" rel="noreferrer">/docs</a>
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
