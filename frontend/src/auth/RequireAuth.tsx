import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { ErrorState, LoadingState } from "../components/ui";
import { useAuth } from "./AuthProvider";

/**
 * Gate for application routes. Passes through when authentication is disabled
 * on the deployment; otherwise requires a valid session and shows recoverable
 * loading/error states while the session is being resolved.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user, ready, error, retry } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="fullscreen-state">
        <LoadingState label="Checking access" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="fullscreen-state">
        <ErrorState
          title="Cannot reach the PulseWatch API"
          error={error}
          onRetry={retry}
        />
        <p className="text-sm muted fullscreen-state__hint">
          The backend may not be running. Start it with{" "}
          <code>uv run uvicorn app.main:app --reload</code>, then retry.
        </p>
      </div>
    );
  }

  if (status?.enabled && !user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
}
