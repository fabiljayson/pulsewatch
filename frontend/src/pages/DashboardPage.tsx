import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useApiContext } from "../api/ApiProvider";
import { useResource, useWindowHours } from "../hooks";
import { TrendChart } from "../components/charts/TrendChart";
import { PageHeader } from "../components/layout";
import {
  Button,
  Card,
  ChartFrame,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  ResultBadge,
  Segmented,
  StatusBadge,
  TableLoading,
  useToast,
} from "../components/ui";
import { formatCount, formatLatency, formatPercent, formatRelative, formatTimestamp, formatWindow, errorLabel } from "../lib/format";
import { WINDOW_OPTIONS } from "../lib/window";

const ROW_LIMIT = 8;

export function DashboardPage() {
  const { api, demo, setDemo } = useApiContext();
  const toast = useToast();
  const [hours, setHours] = useWindowHours();
  const [checkingAll, setCheckingAll] = useState(false);

  const summary = useResource(`summary:${hours}`, (signal) => api.summary({ hours }, signal));
  const trend = useResource(`trend:${hours}`, (signal) => api.trend({ hours }, signal));
  const recent = useResource(
    `recent:${hours}`,
    (signal) => api.globalHistory({ limit: ROW_LIMIT, hours }, signal),
  );
  const failures = useResource(
    `failures:${hours}`,
    (signal) => api.globalHistory({ limit: 5, success: false, hours }, signal),
  );
  const endpoints = useResource(`endpoints:${hours}`, (signal) =>
    api.listEndpoints({ limit: 500, includeStatus: true, hours }, signal),
  );

  const reloadAll = () => {
    summary.reload();
    trend.reload();
    recent.reload();
    failures.reload();
    endpoints.reload();
  };

  const runAllChecks = async () => {
    if (checkingAll) return;
    if (demo) {
      toast.error("Sample data is read-only. Exit sample data to run real checks.");
      return;
    }
    const targets = (endpoints.data?.items ?? []).filter((endpoint) => endpoint.is_active);
    if (targets.length === 0) {
      toast.push("info", "No active endpoints to check.");
      return;
    }
    setCheckingAll(true);
    let passed = 0;
    let failed = 0;
    let stopped: string | null = null;
    for (const endpoint of targets) {
      try {
        const result = await api.runCheck(endpoint.id);
        if (result.success) passed += 1;
        else failed += 1;
      } catch (caught) {
        if (caught instanceof ApiError && (caught.isUnauthorized || caught.status === 409)) {
          stopped = caught.message;
          break;
        }
        failed += 1;
      }
    }
    setCheckingAll(false);
    if (stopped) toast.error(stopped);
    else toast.push("info", `Ran ${targets.length} checks: ${passed} passed, ${failed} failed.`);
    reloadAll();
  };

  const data = summary.data;
  const states = endpoints.data?.items.map((endpoint) => endpoint.status?.state ?? "unknown") ?? [];
  const attention = (endpoints.data?.items ?? [])
    .filter((endpoint) => (endpoint.status?.state ?? "unknown") !== "healthy")
    .sort((a, b) => {
      const rank = (state: string) => (state === "failing" ? 0 : state === "degraded" ? 1 : 2);
      return rank(a.status?.state ?? "unknown") - rank(b.status?.state ?? "unknown");
    });
  const totalChecks = data?.total_checks ?? 0;
  const buckets = trend.data?.buckets ?? [];
  const chartEmpty =
    buckets.length === 0 || buckets.every((bucket) => bucket.total === 0 && bucket.average_latency_ms === null);
  const checkedCount = states.filter((state) => state !== "unknown").length;
  const noEndpoints = !endpoints.loading && (endpoints.data?.total ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={
          data
            ? `Reporting window: ${formatWindow(data.window.hours)} — from ${formatTimestamp(data.window.from)} to ${formatTimestamp(data.window.to)}`
            : "Fleet-wide health at a glance."
        }
        actions={
          <>
            <Segmented
              label="Window"
              value={hours}
              options={WINDOW_OPTIONS}
              onChange={setHours}
              testId="dashboard-window"
            />
            <Button
              variant="secondary"
              onClick={() => void runAllChecks()}
              loading={checkingAll}
              data-testid="check-all"
            >
              Run health checks
            </Button>
            <Link className="btn btn--primary" to="/endpoints/new" data-testid="register-cta">
              Register endpoint
            </Link>
          </>
        }
      />

      {summary.error ? (
        <Card>
          <ErrorState
            title="Dashboard data unavailable"
            error={summary.error}
            onRetry={summary.reload}
          />
        </Card>
      ) : (
        <div className="bento">
          <div className="span-3">
            <MetricCard
              label="Registered endpoints"
              value={formatCount(data?.endpoints.total ?? 0)}
              hint={`${data?.endpoints.active ?? 0} active · ${data?.endpoints.inactive ?? 0} inactive`}
              glyph="☰"
              to="/endpoints"
              loading={summary.loading && !data}
              testId="metric-total"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Healthy endpoints"
              value={formatCount(data?.endpoints.healthy ?? 0)}
              hint={`of ${checkedCount} checked in ${formatWindow(hours).replace("last ", "")}`}
              tone="success"
              glyph="✓"
              to="/endpoints"
              loading={summary.loading && !data}
              testId="metric-healthy"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Needs attention"
              value={formatCount((data?.endpoints.degraded ?? 0) + (data?.endpoints.failing ?? 0))}
              hint={`${data?.endpoints.failing ?? 0} failing · ${data?.endpoints.degraded ?? 0} degraded · ${data?.endpoints.unknown ?? 0} not checked`}
              tone={(data?.endpoints.failing ?? 0) > 0 ? "danger" : "warning"}
              glyph="▲"
              to="/endpoints"
              loading={summary.loading && !data}
              testId="metric-attention"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Availability"
              value={totalChecks === 0 ? "—" : formatPercent(data?.availability_percent)}
              hint={
                totalChecks === 0
                  ? `No checks recorded in ${formatWindow(hours)}`
                  : `Successful ÷ total checks · ${formatWindow(hours)}`
              }
              tone={
                totalChecks === 0
                  ? "default"
                  : (data?.availability_percent ?? 0) >= 99
                    ? "success"
                    : (data?.availability_percent ?? 0) >= 95
                      ? "warning"
                      : "danger"
              }
              glyph="◔"
              loading={summary.loading && !data}
              testId="metric-availability"
            />
          </div>

          <div className="span-8">
            <ChartFrame
              title="Response time & check volume"
              subtitle={
                trend.data
                  ? `${formatWindow(trend.data.window.hours)} · ${trend.data.granularity === "hour" ? "hourly" : "daily"} buckets (UTC)`
                  : "Loading trend…"
              }
              summary={`Chart of check counts and average latency per ${trend.data?.granularity ?? "hour"} bucket over ${formatWindow(hours)}. ${
                chartEmpty
                  ? "No checks in this window."
                  : `${buckets.reduce((sum, bucket) => sum + bucket.total, 0)} checks total.`
              }`}
              empty={chartEmpty && !trend.loading}
              emptyMessage={`No checks were recorded in ${formatWindow(hours)}. Run a health check or widen the window.`}
            >
              {trend.error ? (
                <ErrorState compact title="Trend unavailable" error={trend.error} onRetry={trend.reload} />
              ) : trend.loading && !trend.data ? (
                <LoadingState label="Loading trend" />
              ) : trend.data ? (
                <TrendChart buckets={trend.data.buckets} granularity={trend.data.granularity} />
              ) : null}
            </ChartFrame>
          </div>

          <div className="span-4 bento-col">
            <MetricCard
              label="Average latency"
              value={formatLatency(data?.average_latency_ms)}
              hint={
                totalChecks === 0
                  ? "No measured responses in window"
                  : `Mean of measured responses · ${formatWindow(hours)}`
              }
              glyph="◷"
              loading={summary.loading && !data}
              testId="metric-latency"
            />
            <Card
              title="Needs attention"
              subtitle="Endpoints that are failing, degraded, or never checked."
              actions={
                <Link to="/endpoints" className="text-sm">
                  Manage
                </Link>
              }
            >
              {endpoints.loading && !endpoints.data ? (
                <LoadingState label="Loading endpoints" />
              ) : attention.length === 0 ? (
                <EmptyState compact glyph="✓" title="Everything looks healthy">
                  <p>No endpoint in this window is failing, degraded, or unchecked.</p>
                </EmptyState>
              ) : (
                <ul className="link-list">
                  {attention.slice(0, 6).map((endpoint) => (
                    <li key={endpoint.id}>
                      <Link to={`/endpoints/${endpoint.id}`} className="link-list__item">
                        <span className="endpoint-cell">
                          <span className="endpoint-cell__name truncate">{endpoint.name}</span>
                          <span className="endpoint-cell__url">{endpoint.url}</span>
                        </span>
                        <StatusBadge state={endpoint.status?.state ?? "unknown"} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="span-8">
            <Card
              title="Recent health-check activity"
              subtitle={`Newest first · ${formatWindow(hours)}`}
            >
              {recent.loading && !recent.data ? (
                <TableLoading rows={5} columns={5} />
              ) : recent.error ? (
                <ErrorState compact title="Activity unavailable" error={recent.error} onRetry={recent.reload} />
              ) : (recent.data?.items.length ?? 0) === 0 ? (
                <EmptyState glyph="◌" title="No checks yet">
                  {noEndpoints ? (
                    <>
                      <p>Register your first endpoint to start recording checks.</p>
                      <div className="row row--center">
                        <Link className="btn btn--primary" to="/endpoints/new">
                          Register endpoint
                        </Link>
                        <Button variant="secondary" onClick={() => setDemo(true)}>
                          Explore sample data
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p>Run a health check to populate this table.</p>
                  )}
                </EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">
                      Most recent health checks across all endpoints
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Endpoint</th>
                        <th scope="col">Checked</th>
                        <th scope="col">Result</th>
                        <th scope="col">Latency</th>
                        <th scope="col">Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.data?.items.map((check) => (
                        <tr key={check.id}>
                          <td>
                            <Link to={`/endpoints/${check.endpoint_id}`} className="row-link">
                              {check.endpoint_name}
                            </Link>
                          </td>
                          <td title={formatTimestamp(check.checked_at)}>
                            {formatRelative(check.checked_at)}
                          </td>
                          <td>
                            <div className="row">
                              <ResultBadge success={check.success} />
                              {!check.success && check.error_type ? (
                                <span className="text-sm muted">{errorLabel(check.error_type)}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="num">{formatLatency(check.latency_ms)}</td>
                          <td className="num">{check.status_code ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="span-4">
            <Card
              title="Recent failures"
              subtitle={`Failed checks in ${formatWindow(hours)}`}
            >
              {failures.loading && !failures.data ? (
                <LoadingState label="Loading failures" />
              ) : (failures.data?.items.length ?? 0) === 0 ? (
                <EmptyState compact glyph="✓" title="No failures recorded">
                  <p>Every check in this window succeeded.</p>
                </EmptyState>
              ) : (
                <ul className="link-list">
                  {failures.data?.items.map((check) => (
                    <li key={check.id}>
                      <Link to={`/endpoints/${check.endpoint_id}`} className="link-list__item">
                        <span className="endpoint-cell">
                          <span className="endpoint-cell__name truncate">{check.endpoint_name}</span>
                          <span className="endpoint-cell__url">
                            {errorLabel(check.error_type)}
                            {check.status_code ? ` · HTTP ${check.status_code}` : ""}
                          </span>
                        </span>
                        <span className="text-sm muted" title={formatTimestamp(check.checked_at)}>
                          {formatRelative(check.checked_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
