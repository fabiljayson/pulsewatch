import { Link } from "react-router-dom";

import { useApiContext } from "../api/ApiProvider";
import { useResource, useWindowHours } from "../hooks";
import { PageHeader } from "../components/layout";
import { Card, ErrorState, LoadingState } from "../components/ui";
import { formatLatency, formatWindow, statusExplanation } from "../lib/format";

export function AboutPage() {
  const { api, demo } = useApiContext();
  const [hours] = useWindowHours();
  const summary = useResource(`summary:${hours}`, (signal) => api.summary({ hours }, signal));

  const threshold = summary.data?.degraded_threshold_ms ?? null;

  return (
    <>
      <PageHeader
        title="About"
        subtitle="What PulseWatch measures, how every number is derived, and what it deliberately refuses to guess."
      />

      <div className="bento">
        <div className="span-8">
          <Card title="What this is">
            <div className="stack">
              <p>
                PulseWatch is a self-contained API health and reliability observatory. It records
                HTTP checks against endpoints you register, stores them in a single SQLite file,
                and derives every screen — overview, history, analytics, reports, failure events —
                from that one log.
              </p>
              <p className="muted text-sm">
                Backend: FastAPI + SQLite. Frontend: React served by Vite in development or as
                static files in production. Every figure on every page is computed from the
                recorded check log — nothing on this page is an estimate.
              </p>
            </div>
          </Card>
        </div>

        <div className="span-4">
          <Card title="Where to look next">
            <ul className="link-list">
              <li>
                <Link className="link-list__item" to="/history">
                  Monitoring history — every recorded check
                </Link>
              </li>
              <li>
                <Link className="link-list__item" to="/analytics">
                  Reliability analytics — fleet metrics over time
                </Link>
              </li>
              <li>
                <Link className="link-list__item" to="/reports">
                  Reports — scoped availability and failure causes
                </Link>
              </li>
              <li>
                <Link className="link-list__item" to="/incidents">
                  Failure events — grouped outages per endpoint
                </Link>
              </li>
            </ul>
          </Card>
        </div>

        <div className="span-6">
          <Card
            title="How health states are derived"
            subtitle={`Evaluated over ${formatWindow(hours)} — the window selected on this page's related pages.`}
          >
            {summary.loading && !summary.data ? (
              <LoadingState label="Loading thresholds" />
            ) : summary.error ? (
              <ErrorState
                compact
                title="Threshold unavailable"
                message="Degraded threshold falls back to the default below."
                error={summary.error}
                onRetry={summary.reload}
              />
            ) : null}
            <dl className="kv">
              <dt>Healthy</dt>
              <dd>{statusExplanation("healthy", hours)}</dd>
              <dt>Degraded</dt>
              <dd>
                {statusExplanation("degraded", hours)} Threshold:{" "}
                <strong>{formatLatency(threshold ?? 1000)}</strong>
                {" — configurable with "}
                <code className="mono">PULSEWATCH_DEGRADED_LATENCY_MS</code>.
              </dd>
              <dt>Failing</dt>
              <dd>{statusExplanation("failing", hours)}</dd>
              <dt>Not checked yet</dt>
              <dd>{statusExplanation("unknown", hours)}</dd>
            </dl>
          </Card>
        </div>

        <div className="span-6">
          <Card title="How the numbers are computed">
            <ul className="plain-list">
              <li>
                <strong>Availability</strong> = successful ÷ total checks × 100 in the window. With
                no checks the interface shows “—”, not 100%.
              </li>
              <li>
                <strong>Average latency</strong> averages only checks that returned a measurement;
                failed checks without timings are excluded rather than counted as zero.
              </li>
              <li>
                <strong>Failure events</strong> group failures of one endpoint that occur within
                two hours of each other, built from up to the most recent 100 failures in the
                window.
              </li>
              <li>
                <strong>Trend charts</strong> include empty buckets so a silent period appears as
                a gap, never as 100% uptime.
              </li>
            </ul>
          </Card>
        </div>

        <div className="span-12">
          <Card title="Data & honesty">
            <ul className="plain-list">
              <li>
                <strong>Sample data mode</strong> is generated in your browser, labelled wherever
                it appears, never written to SQLite, and blocks all mutations.
              </li>
              <li>
                <strong>Unknown is not healthy.</strong> Endpoints without checks are reported as
                unknown and excluded from healthy counts.
              </li>
              <li>
                <strong>Your data stays local.</strong> Checks live in one SQLite file next to the
                backend; nothing is sent to a third party.
              </li>
            </ul>
            {demo ? (
              <p className="muted text-sm page-note">
                You are currently viewing sample data.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
