import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { useApiContext } from "../api/ApiProvider";
import { useAction, useResource, useWindowHours } from "../hooks";
import { TrendChart } from "../components/charts/TrendChart";
import { PageHeader } from "../components/layout";
import {
  ActiveBadge,
  Button,
  Card,
  ChartFrame,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  Notice,
  Pagination,
  ResultBadge,
  Segmented,
  StatusBadge,
  TableLoading,
  useToast,
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
import { WINDOW_OPTIONS } from "../lib/window";
import { EditEndpointDialog } from "./endpoint-detail/EditEndpointDialog";

const HISTORY_LIMIT = 20;

interface DetailState {
  created?: boolean;
  name?: string;
}

export function EndpointDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;

  const { api } = useApiContext();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [hours, setHours] = useWindowHours();

  const [historyOffset, setHistoryOffset] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const endpoint = useResource(
    `endpoint:${id}:${hours}`,
    (signal) => api.getEndpoint(id, { includeStatus: true, hours }, signal),
    valid,
  );
  const history = useResource(
    `history:${id}:${historyOffset}`,
    (signal) => api.endpointHistory(id, { limit: HISTORY_LIMIT, offset: historyOffset }, signal),
    valid,
  );
  const trend = useResource(
    `trend:${id}:${hours}`,
    (signal) => api.trend({ endpointId: id, hours }, signal),
    valid,
  );
  const report = useResource(
    `report:${id}:${hours}`,
    (signal) => api.endpointReport(id, { hours }, signal),
    valid,
  );

  const reloadAll = () => {
    endpoint.reload();
    history.reload();
    trend.reload();
    report.reload();
  };

  const check = useAction(async () => api.runCheck(id));
  const toggleActive = useAction(async (next: boolean) => api.updateEndpoint(id, { is_active: next }));
  const remove = useAction(async () => api.deleteEndpoint(id));

  const handleCheck = async () => {
    try {
      const result = await check.run();
      if (!result) return;
      if (result.success) {
        toast.success(`Check passed: HTTP ${result.status_code ?? "—"} in ${formatLatency(result.latency_ms)}`);
      } else {
        toast.error(
          `Check failed${result.error_type ? ` — ${errorLabel(result.error_type)}` : ""}${result.status_code ? ` (HTTP ${result.status_code})` : ""}`,
        );
      }
      setHistoryOffset(0);
      reloadAll();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "The check could not be run.");
    }
  };

  const handleToggleActive = async (next: boolean) => {
    try {
      const updated = await toggleActive.run(next);
      if (!updated) return;
      toast.success(next ? "Endpoint activated." : "Endpoint paused — manual checks are disabled.");
      reloadAll();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "The endpoint could not be updated.");
    }
  };

  const handleDelete = async () => {
    try {
      await remove.run();
      toast.success("Endpoint and its history were deleted.");
      navigate("/endpoints", { replace: true });
    } catch (caught) {
      setDeleteOpen(false);
      toast.error(caught instanceof ApiError ? caught.message : "The endpoint could not be deleted.");
    }
  };

  const createdState = location.state as DetailState | null;

  if (!valid) {
    return (
      <EmptyState glyph="⚠" title="Unknown endpoint id">
        <p>
          The address <code>{params.id}</code> is not a valid endpoint id.
        </p>
        <Link className="btn btn--primary" to="/endpoints">
          Back to endpoints
        </Link>
      </EmptyState>
    );
  }

  if (endpoint.loading && !endpoint.data) {
    return <LoadingState label="Loading endpoint" />;
  }

  if (endpoint.error?.isNotFound) {
    return (
      <EmptyState glyph="◌" title="Endpoint not found">
        <p>It may have been deleted, or the id is wrong.</p>
        <Link className="btn btn--primary" to="/endpoints">
          Back to endpoints
        </Link>
      </EmptyState>
    );
  }

  if (endpoint.error || !endpoint.data) {
    return (
      <ErrorState
        title="Endpoint details unavailable"
        error={endpoint.error}
        onRetry={endpoint.reload}
      />
    );
  }

  const ep = endpoint.data;
  const status = ep.status;
  const reportData = report.data;
  const buckets = trend.data?.buckets ?? [];
  const chartEmpty =
    buckets.length === 0 || buckets.every((bucket) => bucket.total === 0 && bucket.average_latency_ms === null);
  const neverChecked = status?.state === "unknown";

  return (
    <>
      <PageHeader
        title={ep.name}
        subtitle={<span className="mono-url">{ep.url}</span>}
        badges={
          <>
            {status ? <StatusBadge state={status.state} /> : null}
            <ActiveBadge isActive={ep.is_active} />
          </>
        }
        actions={
          <>
            <Segmented
              label="Window"
              value={hours}
              options={WINDOW_OPTIONS}
              onChange={setHours}
              testId="detail-window"
            />
            <Button
              variant="primary"
              onClick={() => void handleCheck()}
              loading={check.busy}
              disabled={!ep.is_active}
              title={
                ep.is_active
                  ? "Run one outbound health check now"
                  : "Activate the endpoint to run checks"
              }
              data-testid="check-now"
            >
              Run check
            </Button>
            <Button variant="secondary" onClick={() => setEditOpen(true)} data-testid="edit-endpoint">
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleToggleActive(!ep.is_active)}
              loading={toggleActive.busy}
            >
              {ep.is_active ? "Pause" : "Activate"}
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)} data-testid="delete-endpoint">
              Delete
            </Button>
          </>
        }
      />

      <div className="stack">
        {createdState?.created ? (
          <Notice>
            <strong>{createdState.name}</strong> was registered successfully. Run the first check
            to start recording health data.
          </Notice>
        ) : null}
        {neverChecked ? (
          <Notice tone="warning">
            This endpoint has <strong>never been checked</strong> — its health is unknown, not
            healthy. Run a check to record its first result.
          </Notice>
        ) : null}
        {!ep.is_active ? (
          <Notice>
            This endpoint is paused. Manual checks return <code>409 Conflict</code> until it is
            reactivated.
          </Notice>
        ) : null}

        <div className="bento">
          <div className="span-4">
            <Card title="Current status" subtitle={status ? `Over the last ${status.window_hours} hours` : undefined}>
              {status ? (
                <div className="stack stack--sm">
                  <div className="page-header__badges">
                    <StatusBadge state={status.state} />
                  </div>
                  <dl className="kv">
                    <dt>Last check</dt>
                    <dd title={formatTimestamp(status.checked_at)}>{formatRelative(status.checked_at)}</dd>
                    <dt>HTTP code</dt>
                    <dd className="mono-num">{status.status_code ?? "—"}</dd>
                    <dt>Latency</dt>
                    <dd className="mono-num">{formatLatency(status.latency_ms)}</dd>
                  </dl>
                  <p className="text-sm muted">
                    {status.state === "healthy"
                      ? "The latest check succeeded within the window."
                      : status.state === "degraded"
                        ? `The latest check succeeded but exceeded the ${formatLatency(status.degraded_threshold_ms)} degraded threshold.`
                        : status.state === "failing"
                          ? "The latest check failed."
                          : "No check has been recorded yet — health is unknown, not healthy."}
                  </p>
                </div>
              ) : (
                <LoadingState label="Loading status" />
              )}
            </Card>
          </div>

          <div className="span-4">
            <MetricCard
              label={`Availability · ${reportData ? `last ${reportData.window.hours}h` : "window"}`}
              value={
                reportData && reportData.total_checks > 0
                  ? formatPercent(reportData.availability_percent)
                  : "—"
              }
              hint={
                reportData && reportData.total_checks > 0
                  ? "Successful ÷ total checks in window"
                  : "No checks recorded in this window"
              }
              tone={
                !reportData || reportData.total_checks === 0
                  ? "default"
                  : reportData.availability_percent >= 99
                    ? "success"
                    : reportData.availability_percent >= 95
                      ? "warning"
                      : "danger"
              }
              glyph="◔"
              loading={report.loading && !reportData}
              testId="detail-availability"
            />
          </div>

          <div className="span-4">
            <MetricCard
              label="Average latency"
              value={formatLatency(reportData?.average_latency_ms)}
              hint="Mean of measured responses in window"
              glyph="◷"
              loading={report.loading && !reportData}
              testId="detail-latency"
            />
          </div>

          <div className="span-8">
            <ChartFrame
              title="Response time & check volume"
              subtitle={
                trend.data
                  ? `${trend.data.granularity === "hour" ? "Hourly" : "Daily"} buckets · ${formatWindow(trend.data.window.hours)}`
                  : "Loading trend…"
              }
              summary={`Chart of check counts and average latency for ${ep.name}. ${
                chartEmpty ? "No checks in this window." : `${buckets.reduce((sum, bucket) => sum + bucket.total, 0)} checks in window.`
              }`}
              empty={chartEmpty && !trend.loading}
              emptyMessage="Run a check, or widen the window, to populate this chart."
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

          <div className="span-4">
            <Card title="Checks in window" subtitle={reportData ? `From ${formatTimestamp(reportData.window.from)}` : undefined}>
              {report.loading && !reportData ? (
                <LoadingState label="Loading totals" />
              ) : reportData ? (
                <dl className="kv">
                  <dt>Total checks</dt>
                  <dd className="mono-num">{formatCount(reportData.total_checks)}</dd>
                  <dt>Successful</dt>
                  <dd className="mono-num">{formatCount(reportData.successful_checks)}</dd>
                  <dt>Failed</dt>
                  <dd className="mono-num">{formatCount(reportData.failed_checks)}</dd>
                  <dt>First check</dt>
                  <dd>{formatRelative(reportData.first_check_at)}</dd>
                  <dt>Last check</dt>
                  <dd>{formatRelative(reportData.last_check_at)}</dd>
                </dl>
              ) : report.error ? (
                <ErrorState compact title="Report unavailable" error={report.error} onRetry={report.reload} />
              ) : null}
            </Card>
          </div>

          <div className="span-12">
            <Card
              title="Recent checks"
              subtitle="Newest first, with safe error categories."
              actions={
                reportData ? (
                  <span className="text-sm muted">
                    Window totals on the report: {formatCount(reportData.total_checks)} checks
                  </span>
                ) : null
              }
            >
              {history.loading && !history.data ? (
                <TableLoading rows={5} columns={5} />
              ) : history.error ? (
                <ErrorState compact title="History unavailable" error={history.error} onRetry={history.reload} />
              ) : (history.data?.items.length ?? 0) === 0 ? (
                <EmptyState glyph="◌" title="No checks recorded yet">
                  <p>
                    {ep.is_active
                      ? "Run the first health check to start building history."
                      : "Activate the endpoint, then run a check."}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => void handleCheck()}
                    loading={check.busy}
                    disabled={!ep.is_active}
                  >
                    Run check
                  </Button>
                </EmptyState>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table">
                      <caption className="sr-only">Recent checks for {ep.name}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Checked at</th>
                          <th scope="col">Result</th>
                          <th scope="col">Code</th>
                          <th scope="col">Latency</th>
                          <th scope="col">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.data?.items.map((check) => (
                          <tr key={check.id}>
                            <td title={formatTimestamp(check.checked_at)}>
                              {formatRelative(check.checked_at)}
                            </td>
                            <td>
                              <ResultBadge success={check.success} />
                            </td>
                            <td className="num">{check.status_code ?? "—"}</td>
                            <td className="num">{formatLatency(check.latency_ms)}</td>
                            <td>{check.error_type ? errorLabel(check.error_type) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    total={history.data?.total ?? 0}
                    limit={HISTORY_LIMIT}
                    offset={historyOffset}
                    onChange={setHistoryOffset}
                    itemLabel="checks"
                  />
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      <EditEndpointDialog
        open={editOpen}
        endpoint={ep}
        api={api}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          toast.success("Endpoint renamed.");
          reloadAll();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete “${ep.name}”?`}
        description={
          <>
            This permanently removes the endpoint and its entire check history. This action cannot
            be undone.
          </>
        }
        confirmLabel="Delete endpoint"
        destructive
        busy={remove.busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
