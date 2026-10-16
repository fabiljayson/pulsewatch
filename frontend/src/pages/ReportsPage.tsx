import { useState } from "react";

import { useApiContext } from "../api/ApiProvider";
import type { Report, Summary } from "../api/types";
import { useResource, useWindowHours } from "../hooks";
import { TrendChart } from "../components/charts/TrendChart";
import { PageHeader } from "../components/layout";
import {
  Card,
  ChartFrame,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Segmented,
  SelectField,
} from "../components/ui";
import {
  errorLabel,
  formatCount,
  formatLatency,
  formatPercent,
  formatRelative,
  formatTimestamp,
  formatWindow,
} from "../lib/format";
import { tallyCauses } from "../lib/incidents";
import { WINDOW_OPTIONS } from "../lib/window";

const CAUSE_LIMIT = 100;

interface ReportNumbers {
  availability: number;
  total: number;
  successful: number;
  failed: number;
  latency: number | null;
  window: { hours: number; from: string; to: string };
  firstCheckAt: string | null;
  lastCheckAt: string | null;
}

export function ReportsPage() {
  const { api, demo } = useApiContext();
  const [hours, setHours] = useWindowHours();
  const [scope, setScope] = useState("");

  const picker = useResource("endpoints:picker", (signal) =>
    api.listEndpoints({ limit: 500 }, signal),
  );
  const scopeId = scope === "" ? null : Number(scope);

  const report = useResource<Summary | Report>(
    `report:${scopeId ?? "fleet"}:${hours}`,
    (signal) =>
      scopeId === null
        ? api.summary({ hours }, signal)
        : api.endpointReport(scopeId, { hours }, signal),
  );
  const trend = useResource(`trend:${scopeId ?? "fleet"}:${hours}`, (signal) =>
    api.trend({ hours, endpointId: scopeId ?? undefined }, signal),
  );
  const failures = useResource(`causes:${scopeId ?? "fleet"}:${hours}`, (signal) =>
    api.globalHistory(
      { limit: CAUSE_LIMIT, success: false, endpointId: scopeId ?? undefined, hours },
      signal,
    ),
  );

  let numbers: ReportNumbers | null = null;
  if (report.data) {
    if (scopeId === null && "endpoints" in report.data) {
      numbers = {
        availability: report.data.availability_percent,
        total: report.data.total_checks,
        successful: report.data.successful_checks,
        failed: report.data.failed_checks,
        latency: report.data.average_latency_ms,
        window: report.data.window,
        firstCheckAt: null,
        lastCheckAt: report.data.last_check_at,
      };
    } else if (scopeId !== null && "endpoint_id" in report.data) {
      numbers = {
        availability: report.data.availability_percent,
        total: report.data.total_checks,
        successful: report.data.successful_checks,
        failed: report.data.failed_checks,
        latency: report.data.average_latency_ms,
        window: report.data.window,
        firstCheckAt: report.data.first_check_at,
        lastCheckAt: report.data.last_check_at,
      };
    }
  }

  const causes = tallyCauses(failures.data?.items ?? []);
  const causeTotal = causes.reduce((sum, cause) => sum + cause.count, 0);
  const causeLimitReached = (failures.data?.total ?? 0) > CAUSE_LIMIT;
  const buckets = trend.data?.buckets ?? [];
  const chartEmpty =
    buckets.length === 0 ||
    buckets.every((entry) => entry.total === 0 && entry.average_latency_ms === null);
  const scopedName =
    scopeId === null
      ? "Fleet"
      : (picker.data?.items.find((endpoint) => endpoint.id === scopeId)?.name ??
        `Endpoint ${scopeId}`);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={
          numbers
            ? `${scopedName} · ${formatWindow(numbers.window.hours)} · from ${formatTimestamp(numbers.window.from)} to ${formatTimestamp(numbers.window.to)}`
            : "Availability and failure reports per endpoint or for the whole fleet."
        }
        actions={
          <Segmented
            label="Window"
            value={hours}
            options={WINDOW_OPTIONS}
            onChange={setHours}
            testId="reports-window"
          />
        }
      />

      <div className="filters" role="search">
        <SelectField
          id="report-scope"
          label="Report scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          disabled={picker.loading && !picker.data}
          helper={
            scopeId === null
              ? "Combined numbers across every registered endpoint."
              : "Single-endpoint report with first and last check times."
          }
        >
          <option value="">All endpoints (fleet)</option>
          {(picker.data?.items ?? []).map((endpoint) => (
            <option key={endpoint.id} value={endpoint.id}>
              {endpoint.name}
            </option>
          ))}
        </SelectField>
      </div>

      {report.error ? (
        <Card>
          <ErrorState title="Report unavailable" error={report.error} onRetry={report.reload} />
        </Card>
      ) : (
        <div className="bento">
          <div className="span-3">
            <MetricCard
              label="Availability"
              value={numbers && numbers.total > 0 ? formatPercent(numbers.availability) : "—"}
              hint={
                numbers && numbers.total > 0
                  ? "Successful ÷ total checks"
                  : "No checks recorded in this window"
              }
              tone={
                !numbers || numbers.total === 0
                  ? "default"
                  : numbers.availability >= 99
                    ? "success"
                    : numbers.availability >= 95
                      ? "warning"
                      : "danger"
              }
              glyph="◔"
              loading={report.loading && !report.data}
              testId="report-availability"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Checks"
              value={formatCount(numbers?.total ?? 0)}
              hint={
                numbers && numbers.total > 0
                  ? `${formatCount(numbers.successful)} passed · ${formatCount(numbers.failed)} failed`
                  : "Nothing checked in window"
              }
              glyph="☰"
              loading={report.loading && !report.data}
              testId="report-checks"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Average latency"
              value={formatLatency(numbers?.latency ?? null)}
              hint={
                numbers && numbers.total > 0
                  ? "Mean of measured responses"
                  : "No measured responses"
              }
              glyph="◷"
              loading={report.loading && !report.data}
              testId="report-latency"
            />
          </div>
          <div className="span-3">
            <MetricCard
              label="Last check"
              value={numbers?.lastCheckAt ? formatRelative(numbers.lastCheckAt) : "—"}
              hint={
                numbers?.lastCheckAt
                  ? formatTimestamp(numbers.lastCheckAt)
                  : "No checks recorded yet"
              }
              glyph="◔"
              loading={report.loading && !report.data}
              testId="report-last"
            />
          </div>

          <div className="span-8">
            <ChartFrame
              title="Check volume & latency"
              subtitle={
                trend.data
                  ? `${formatWindow(trend.data.window.hours)} · ${trend.data.granularity} buckets (UTC)`
                  : "Loading trend…"
              }
              summary={`Chart of successful and failed checks with average latency per ${trend.data?.granularity ?? "hour"} bucket for ${scopedName}.`}
              empty={chartEmpty && !trend.loading}
              emptyMessage={`No checks were recorded for ${scopedName} in ${formatWindow(hours)}.`}
            >
              {trend.error ? (
                <ErrorState
                  compact
                  title="Trend unavailable"
                  error={trend.error}
                  onRetry={trend.reload}
                />
              ) : trend.loading && !trend.data ? (
                <LoadingState label="Loading trend" />
              ) : trend.data ? (
                <TrendChart buckets={trend.data.buckets} granularity={trend.data.granularity} />
              ) : null}
            </ChartFrame>
          </div>

          <div className="span-4">
            <Card title="Failure causes" subtitle={`From up to ${CAUSE_LIMIT} recent failures`}>
              {failures.loading && !failures.data ? (
                <LoadingState label="Loading failures" />
              ) : failures.error ? (
                <ErrorState
                  compact
                  title="Failure causes unavailable"
                  error={failures.error}
                  onRetry={failures.reload}
                />
              ) : causes.length === 0 ? (
                <EmptyState compact glyph="✓" title="No failures recorded">
                  <p>Every check in this window succeeded.</p>
                </EmptyState>
              ) : (
                <>
                  <ul className="plain-list stack" data-testid="failure-causes">
                    {causes.map((cause) => {
                      const share = causeTotal > 0 ? (cause.count / causeTotal) * 100 : 0;
                      const percent = Math.round(share);
                      return (
                        <li key={cause.errorType} className="stack stack--sm">
                          <div className="row row--between text-sm">
                            <span>{errorLabel(cause.errorType)}</span>
                            <span className="mono-num">
                              {formatCount(cause.count)} · {percent}%
                            </span>
                          </div>
                          <div
                            className="share-bar"
                            role="img"
                            aria-label={`${errorLabel(cause.errorType)}: ${cause.count} failures, ${percent} percent`}
                          >
                            <span className="share-bar__fill" style={{ width: `${share}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {causeLimitReached ? (
                    <p className="muted text-sm page-note">
                      Showing the most recent {CAUSE_LIMIT} failures (
                      {formatCount(failures.data?.total ?? 0)} in window).
                    </p>
                  ) : null}
                </>
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
