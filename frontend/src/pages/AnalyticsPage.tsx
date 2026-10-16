import { Link } from "react-router-dom";

import { useApiContext } from "../api/ApiProvider";
import { useResource, useWindowHours } from "../hooks";
import { AvailabilityChart } from "../components/charts/AvailabilityChart";
import { TrendChart } from "../components/charts/TrendChart";
import { PageHeader } from "../components/layout";
import {
  Card,
  ChartFrame,
  ErrorState,
  LoadingState,
  MetricCard,
  Segmented,
  StatusBadge,
  TableLoading,
} from "../components/ui";
import {
  formatCount,
  formatLatency,
  formatPercent,
  formatRelative,
  formatTimestamp,
  formatWindow,
} from "../lib/format";
import { WINDOW_OPTIONS } from "../lib/window";

export function AnalyticsPage() {
  const { api, demo } = useApiContext();
  const [hours, setHours] = useWindowHours();

  const summary = useResource(`summary:${hours}`, (signal) => api.summary({ hours }, signal));
  const trend = useResource(`trend:${hours}`, (signal) => api.trend({ hours }, signal));
  const endpoints = useResource(`endpoints:${hours}`, (signal) =>
    api.listEndpoints({ limit: 500, includeStatus: true, hours }, signal),
  );

  const data = summary.data;
  const buckets = trend.data?.buckets ?? [];
  const chartEmpty =
    buckets.length === 0 || buckets.every((bucket) => bucket.total === 0 && bucket.average_latency_ms === null);
  const totalChecks = data?.total_checks ?? 0;
  const failureShare =
    totalChecks > 0 ? Math.round(((data?.failed_checks ?? 0) / totalChecks) * 1000) / 10 : 0;

  const rows = [...(endpoints.data?.items ?? [])].sort((a, b) => {
    const availabilityA = a.status?.availability_percent;
    const availabilityB = b.status?.availability_percent;
    if (availabilityA === null || availabilityA === undefined) return 1;
    if (availabilityB === null || availabilityB === undefined) return -1;
    return availabilityA - availabilityB;
  });

  return (
    <>
      <PageHeader
        title="Reliability analytics"
        subtitle={
          data
            ? `Fleet reliability over ${formatWindow(hours)} — from ${formatTimestamp(data.window.from)} to ${formatTimestamp(data.window.to)}`
            : "Availability, latency, and failure distribution across the fleet."
        }
        actions={
          <Segmented
            label="Window"
            value={hours}
            options={WINDOW_OPTIONS}
            onChange={setHours}
            testId="analytics-window"
          />
        }
      />

      {summary.error ? (
        <Card>
          <ErrorState
            title="Analytics data unavailable"
            error={summary.error}
            onRetry={summary.reload}
          />
        </Card>
      ) : (
        <div className="bento">
          <div className="span-3">
            <MetricCard
              label="Fleet availability"
              value={totalChecks === 0 ? "—" : formatPercent(data?.availability_percent)}
              hint={
                totalChecks === 0
                  ? `No checks in ${formatWindow(hours)}`
                  : `${formatCount(data?.successful_checks ?? 0)} of ${formatCount(totalChecks)} checks passed`
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
              testId="analytics-availability"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Failed checks"
              value={formatCount(data?.failed_checks ?? 0)}
              hint={totalChecks === 0 ? "Nothing to analyze yet" : `${failureShare}% of all checks`}
              tone={totalChecks > 0 && (data?.failed_checks ?? 0) > 0 ? "danger" : "default"}
              glyph="✕"
              loading={summary.loading && !data}
              testId="analytics-failed"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Average latency"
              value={formatLatency(data?.average_latency_ms)}
              hint={
                totalChecks === 0
                  ? "No measured responses"
                  : `Degraded above ${formatLatency(data?.degraded_threshold_ms)}`
              }
              glyph="◷"
              loading={summary.loading && !data}
              testId="analytics-latency"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Endpoints monitored"
              value={formatCount(data?.endpoints.total ?? 0)}
              hint={`${data?.endpoints.active ?? 0} active · ${data?.endpoints.inactive ?? 0} inactive`}
              glyph="☰"
              to="/endpoints"
              loading={summary.loading && !data}
              testId="analytics-endpoints"
            />
          </div>

          <div className="span-6">
            <ChartFrame
              title="Check volume & latency"
              subtitle={
                trend.data
                  ? `${formatWindow(trend.data.window.hours)} · ${trend.data.granularity} buckets (UTC)`
                  : "Loading trend…"
              }
              summary={`Chart of successful and failed checks with average latency per ${trend.data?.granularity ?? "hour"} bucket.`}
              empty={chartEmpty && !trend.loading}
              emptyMessage={`No checks were recorded in ${formatWindow(hours)}.`}
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

          <div className="span-6">
            <ChartFrame
              title="Availability over time"
              subtitle="Successful ÷ total checks per bucket; gaps are periods without checks."
              summary="Line chart of availability percentage per time bucket, with gaps for buckets without checks."
              empty={chartEmpty && !trend.loading}
              emptyMessage={`No availability to plot in ${formatWindow(hours)}.`}
            >
              {trend.error ? (
                <ErrorState compact title="Availability unavailable" error={trend.error} onRetry={trend.reload} />
              ) : trend.loading && !trend.data ? (
                <LoadingState label="Loading availability" />
              ) : trend.data ? (
                <AvailabilityChart buckets={trend.data.buckets} granularity={trend.data.granularity} />
              ) : null}
            </ChartFrame>
          </div>

          <div className="span-12">
            <Card
              title="Endpoint reliability ranking"
              subtitle={`Worst availability first · status over ${formatWindow(hours)}`}
            >
              {endpoints.loading && !endpoints.data ? (
                <TableLoading rows={5} columns={5} />
              ) : endpoints.error ? (
                <ErrorState
                  compact
                  title="Endpoint stats unavailable"
                  error={endpoints.error}
                  onRetry={endpoints.reload}
                />
              ) : rows.length === 0 ? (
                <p className="muted">No endpoints registered yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">
                      Endpoints ranked by availability, lowest first
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Endpoint</th>
                        <th scope="col">State</th>
                        <th scope="col">Availability</th>
                        <th scope="col">Checks</th>
                        <th scope="col">Latency</th>
                        <th scope="col">Last checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((endpoint) => (
                        <tr key={endpoint.id} data-testid="analytics-row">
                          <td>
                            <Link to={`/endpoints/${endpoint.id}`} className="row-link">
                              {endpoint.name}
                            </Link>
                          </td>
                          <td>
                            <StatusBadge state={endpoint.status?.state ?? "unknown"} />
                          </td>
                          <td className="num">
                            {endpoint.status?.availability_percent !== null &&
                            endpoint.status?.availability_percent !== undefined
                              ? formatPercent(endpoint.status.availability_percent)
                              : "—"}
                          </td>
                          <td className="num">{formatCount(endpoint.status?.total_checks ?? 0)}</td>
                          <td className="num">{formatLatency(endpoint.status?.latency_ms)}</td>
                          <td title={endpoint.status?.checked_at ?? undefined}>
                            {endpoint.status?.checked_at ? formatRelative(endpoint.status.checked_at) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {demo ? (
        <p className="muted text-sm page-note">
          Showing sample data — sample checks are read-only.
        </p>
      ) : null}
    </>
  );
}
