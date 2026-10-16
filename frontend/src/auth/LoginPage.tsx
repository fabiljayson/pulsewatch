import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import logo from "../assets/logo-mark.png";
import { ApiError } from "../api/client";
import { Button, Card, Notice, TextField } from "../components/ui";
import { useAuth } from "./AuthProvider";

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { status, user, login, ready, error: authError, retry } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign in · PulseWatch";
  }, []);

  if (ready && status && !status.enabled) {
    return (
      <div className="auth-page">
        <div className="auth-page__visual">
          <img src={logo} alt="" />
          <h1>PulseWatch</h1>
          <p>API Health &amp; Reliability Observatory — every request tells a story.</p>
        </div>
        <div className="auth-page__form">
          <Card title="Authentication is off" className="auth-card" headingLevel="h2">
            <Notice>
              This deployment runs without a login. Open the dashboard to continue.
            </Notice>
            <Link className="btn btn--primary" to="/dashboard">
              Open the dashboard
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  if (user) return <Navigate to={from} replace />;

  const validate = () => {
    const next: { username?: string; password?: string } = {};
    if (!username.trim()) next.username = "Enter your username.";
    if (!password) next.password = "Enter your password.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(
          caught.status === 401
            ? "Invalid username or password."
            : caught.status === 409
              ? "Authentication is disabled on this deployment."
              : caught.message,
        );
      } else {
        setFormError("Sign-in failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__visual">
        <img src={logo} alt="" />
        <h1>PulseWatch</h1>
        <p>API Health &amp; Reliability Observatory — every request tells a story.</p>
      </div>
      <div className="auth-page__form">
        <Card title="Sign in" subtitle="Single-admin access to this PulseWatch instance." className="auth-card" headingLevel="h2">
          <form onSubmit={onSubmit} noValidate>
            <div className="stack stack--sm">
              {authError ? (
                <Notice tone="warning">
                  {authError.message}{" "}
                  <button type="button" className="link-button" onClick={retry}>
                    Retry
                  </button>
                </Notice>
              ) : null}
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <TextField
                id="login-username"
                label="Username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                error={fieldErrors.username}
                disabled={submitting}
              />
              <TextField
                id="login-password"
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
                disabled={submitting}
              />
              <Button type="submit" variant="primary" loading={submitting} data-testid="login-submit">
                Sign in
              </Button>
              <Link to="/" className="text-sm">
                ← Back to the overview
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
