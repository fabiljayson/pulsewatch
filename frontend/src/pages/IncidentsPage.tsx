import { Link } from "react-router-dom";

import { useApiContext } from "../api/ApiProvider";
import { useResource, useWindowHours } from "../hooks";
import { PageHeader } from "../components/layout";
import {
  Card,
  EmptyState,
  ErrorState,
  Notice,
  Segmented,
  TableLoading,
} from "../components/ui";
import { errorLabel, formatCount, formatRelative, formatTimestamp, formatWindow } from "../lib/format";
import { deriveFailureEvents, EVENT_BURST_GAP_MS } from "../lib/incidents";
import { WINDOW_OPTIONS } from "../lib/window";

const FAILURE_FETCH_LIMIT = 100;
const EVENT_GAP_HOURS = EVENT_BURST_GAP_MS / 3_600_000;

export function IncidentsPage() {
  const { api, demo } = useApiContext();
  const [hours, setHours] = useWindowHours();

  const failures = useResource(`failures:${hours}`, (signal) =>
    api.globalHistory({ limit: FAILURE_FETCH_LIMIT, success: false, hours }, signal),
  );
  const events = deriveFailureEvents(failures.data?.items ?? []);
  const fetchedTotal = failures.data?.total ?? 0;
  const truncated = fetchedTotal > FAILURE_FETCH_LIMIT;

  return (
    <>
      <PageHeader
        title="Failure events"
        subtitle={
          failures.data
            ? `${events.length} events built from ${formatCount(fetchedTotal)} failed checks in ${formatWindow(hours)}`
            : "Failed checks grouped into outage events per endpoint."
        }
        actions={
          <Segmented
            label="Window"
            value={hours}
            options={WINDOW_OPTIONS}
            onChange={setHours}
            testId="incidents-window"
          />
        }
      />

      <Notice tone="warning">
        Failures for one endpoint within {EVENT_GAP_HOURS} hours are grouped into a single event.
        {truncated
          ? ` Built from the most recent ${FAILURE_FETCH_LIMIT} failures of ${formatCount(fetchedTotal)} in this window — widen the window or check endpoint history for older events.`
          : ` Built from every failure in this window.`}
      </Notice>

      <Card>
        {failures.loading && !failures.data ? (
          <TableLoading rows={6} columns={5} />
        ) : failures.error ? (
          <ErrorState
            title="Failure events could not be loaded"
            error={failures.error}
            onRetry={failures.reload}
          />
        ) : events.length === 0 ? (
          <EmptyState glyph="✓" title="No failure events in this window">
            <p>
              Every check in {formatWindow(hours)} succeeded — nothing needed grouping into an
              outage event.
            </p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">
                Failure events grouped per endpoint over {formatWindow(hours)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Endpoint</th>
                  <th scope="col">Last seen</th>
                  <th scope="col">First seen</th>
                  <th scope="col">Failures</th>
                  <th scope="col">Most common cause</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.key} data-testid="incident-row">
                    <td>
                      <span className="endpoint-cell">
                        <Link to={`/endpoints/${event.endpointId}`} className="endpoint-cell__name row-link">
                          {event.endpointName}
                        </Link>
                        <span className="endpoint-cell__url" title={event.endpointUrl}>
                          {event.endpointUrl}
                        </span>
                      </span>
                    </td>
                    <td title={formatTimestamp(event.lastSeenAt)}>
                      {formatRelative(event.lastSeenAt)}
                    </td>
                    <td title={formatTimestamp(event.firstSeenAt)}>
                      {formatRelative(event.firstSeenAt)}
                    </td>
                    <td className="num">{formatCount(event.failures)}</td>
                    <td>
                      <div className="stack stack--sm">
                        <span>{event.dominantCause ? errorLabel(event.dominantCause) : "—"}</span>
                        {event.causes.length > 1 ? (
                          <span className="text-sm muted">
                            also {event.causes
                              .slice(1)
                              .map((cause) => errorLabel(cause.errorType))
                              .join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {demo ? (
        <p className="muted text-sm page-note">
          Showing sample data — sample checks are read-only.
        </p>
      ) : null}
    </>
  );
}
