import { useEffect } from "react";
import { Link } from "react-router-dom";

import logo from "../assets/logo-mark.png";
import { useAuth } from "../auth/AuthProvider";

export function LandingPage() {
  const { status, user } = useAuth();

  useEffect(() => {
    document.title = "PulseWatch · API Health & Reliability Observatory";
  }, []);

  const authEnabled = Boolean(status?.enabled);
  const signedIn = Boolean(user);

  return (
    <div className="landing">
      <header className="landing__bar">
        <span className="landing__brand">
          <img src={logo} alt="" />
          <span>PulseWatch</span>
        </span>
        <div className="landing__actions">
          <a className="btn btn--ghost btn--sm landing__on-dark" href="/docs" target="_blank" rel="noreferrer">
            API docs
          </a>
          {authEnabled && !signedIn ? (
            <Link className="btn btn--secondary btn--sm" to="/login">
              Sign in
            </Link>
          ) : null}
          <Link className="btn btn--primary btn--sm" to="/dashboard" data-testid="landing-open">
            Open the dashboard
          </Link>
        </div>
      </header>

      <section className="landing-hero-panel">
        <div className="landing__container landing-hero stack">
          <p className="kicker">API Health &amp; Reliability Observatory</p>
          <h1>Know when your APIs break — with numbers you can trust.</h1>
          <p>
            PulseWatch checks your HTTP endpoints on a schedule and turns every request into
            health state, availability, latency, and failure events — stored in a single SQLite
            file you own, with no agent and no third party in the middle.
          </p>
          <div className="landing-hero__actions">
            <Link className="btn btn--primary" to="/dashboard">
              Open the dashboard
            </Link>
            <Link className="btn btn--secondary" to="/about">
              How states are derived
            </Link>
          </div>
        </div>
      </section>

      <div className="landing__container">
        <div className="bento">
          <div className="span-4">
            <section className="card">
              <h2 className="card__title">Honest health states</h2>
              <p className="card__subtitle">
                Healthy, degraded, failing — or <strong>unknown</strong>. A brand-new endpoint is
                never reported as healthy before its first check, and degraded means “succeeded but
                slower than your threshold”.
              </p>
            </section>
          </div>
          <div className="span-4">
            <section className="card">
              <h2 className="card__title">Availability &amp; latency</h2>
              <p className="card__subtitle">
                Availability is successful ÷ total checks over a window you choose (24 hours, 7
                days, 30 days). Average latency only averages responses that actually returned a
                measurement.
              </p>
            </section>
          </div>
          <div className="span-4">
            <section className="card">
              <h2 className="card__title">Failure events</h2>
              <p className="card__subtitle">
                Individual failed checks are grouped into per-endpoint outage events, so one bad
                hour reads as a single incident with a first seen, last seen, and most common
                cause.
              </p>
            </section>
          </div>
          <div className="span-8">
            <section className="card">
              <h2 className="card__title">What you get out of the box</h2>
              <ul className="plain-list">
                <li>Endpoint registry with manual “check now” and pause/activate controls</li>
                <li>Global monitoring history with result and endpoint filters</li>
                <li>Reliability analytics: fleet metrics, availability over time, worst-first ranking</li>
                <li>Scoped reports — whole fleet or one endpoint — with failure-cause breakdowns</li>
                <li>Clearly-labelled sample data mode that never touches your database</li>
              </ul>
            </section>
          </div>
          <div className="span-4">
            <section className="card">
              <h2 className="card__title">Runs anywhere Python runs</h2>
              <p className="card__subtitle">
                FastAPI + SQLite backend, React frontend served by Vite or any static host. Single
                admin login is optional and off by default.
              </p>
            </section>
          </div>
        </div>
      </div>

      <footer className="landing__footer">
        <span className="text-sm muted">
          PulseWatch{status?.version ? ` · v${status.version}` : ""}
        </span>
        <Link className="text-sm" to="/about">
          About this observatory
        </Link>
      </footer>
    </div>
  );
}
