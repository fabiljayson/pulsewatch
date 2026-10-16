import { useEffect } from "react";
import { Link } from "react-router-dom";

import logo from "../assets/logo-mark.png";
import { useAuth } from "../auth/AuthProvider";

const SCREENS = [
  {
    to: "/dashboard",
    glyph: "◈",
    name: "Overview",
    text: "Fleet health at a glance: endpoint counts, availability, latency, the trend chart, and checks that need attention.",
  },
  {
    to: "/endpoints",
    glyph: "☰",
    name: "Endpoints",
    text: "Register, search, pause, and check endpoints — status, availability, and last check on every row.",
  },
  {
    to: "/history",
    glyph: "◷",
    name: "Monitoring history",
    text: "Every recorded check, newest first, filterable by result or endpoint with pagination.",
  },
  {
    to: "/analytics",
    glyph: "◔",
    name: "Reliability analytics",
    text: "Fleet metrics, availability over time, and a worst-first endpoint reliability ranking.",
  },
  {
    to: "/reports",
    glyph: "▤",
    name: "Reports",
    text: "Scoped availability reports for the whole fleet or one endpoint, with failure-cause breakdowns.",
  },
  {
    to: "/incidents",
    glyph: "⚠",
    name: "Failure events",
    text: "Failed checks grouped into per-endpoint outage events with first/last seen and dominant cause.",
  },
] as const;

const PREVIEW_BARS: { pass: number; fail: number }[] = [
  { pass: 44, fail: 0 },
  { pass: 52, fail: 0 },
  { pass: 48, fail: 10 },
  { pass: 56, fail: 0 },
  { pass: 50, fail: 0 },
  { pass: 38, fail: 22 },
  { pass: 54, fail: 0 },
  { pass: 58, fail: 0 },
  { pass: 46, fail: 8 },
  { pass: 60, fail: 0 },
  { pass: 55, fail: 0 },
  { pass: 52, fail: 0 },
];

function AppPreview() {
  return (
    <div
      className="app-preview"
      role="img"
      aria-label="Preview of the PulseWatch overview dashboard with illustrative numbers"
    >
      <div className="app-preview__chrome" aria-hidden="true">
        <span className="app-preview__dot" />
        <span className="app-preview__dot" />
        <span className="app-preview__dot" />
        <span className="app-preview__url">localhost:5173/dashboard</span>
      </div>
      <div className="app-preview__body" aria-hidden="true">
        <div className="app-preview__metrics">
          <span className="app-metric">
            <span className="app-metric__label">Endpoints</span>
            <span className="app-metric__value">12</span>
            <span className="app-metric__hint">11 active · 1 inactive</span>
          </span>
          <span className="app-metric">
            <span className="app-metric__label">Healthy</span>
            <span className="app-metric__value app-metric__value--success">10</span>
            <span className="app-metric__hint">of 11 checked</span>
          </span>
          <span className="app-metric">
            <span className="app-metric__label">Needs attention</span>
            <span className="app-metric__value app-metric__value--warning">1</span>
            <span className="app-metric__hint">0 failing · 1 degraded</span>
          </span>
          <span className="app-metric">
            <span className="app-metric__label">Availability</span>
            <span className="app-metric__value app-metric__value--success">99.42%</span>
            <span className="app-metric__hint">last 24 hours</span>
          </span>
        </div>
        <div className="app-preview__chart">
          {PREVIEW_BARS.map((bar, index) => (
            <span className="app-bar" key={index}>
              {bar.fail > 0 ? <span className="app-bar__fail" style={{ height: bar.fail }} /> : null}
              <span className="app-bar__pass" style={{ height: bar.pass }} />
            </span>
          ))}
        </div>
        <div className="app-preview__rows">
          <span className="app-preview__row">
            <span>Payments API</span>
            <span className="app-preview__state app-preview__state--ok">✓ Healthy · 92 ms</span>
          </span>
          <span className="app-preview__row">
            <span>Billing webhooks</span>
            <span className="app-preview__state app-preview__state--warn">▲ Degraded · 1.4 s</span>
          </span>
        </div>
      </div>
      <p className="app-preview__note">
        Interface preview — illustrative numbers, not live data.
      </p>
    </div>
  );
}

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

      <section className="landing__container landing__overview">
        <div className="landing__section-head">
          <p className="landing__kicker">Inside the app</p>
          <h2>An overview of every screen</h2>
          <p>
            Six routed views built on one check log — open any screen below; with authentication
            enabled they lead through the sign-in first.
          </p>
        </div>

        <div className="bento">
          <div className="span-12">
            <AppPreview />
          </div>
          {SCREENS.map((screen) => (
            <div className="span-4" key={screen.to}>
              <Link className="card card--link landing__screen" to={screen.to}>
                <span className="landing__screen-glyph" aria-hidden="true">
                  {screen.glyph}
                </span>
                <h3 className="card__title">{screen.name}</h3>
                <p className="card__subtitle">{screen.text}</p>
                <span className="landing__screen-open">Open screen →</span>
              </Link>
            </div>
          ))}
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
