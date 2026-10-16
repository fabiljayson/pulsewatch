import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApiContext } from "../api/ApiProvider";
import { useResource, useWindowHours } from "../hooks";
import { PageHeader } from "../components/layout";
import {
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  ResultBadge,
  Segmented,
  SelectField,
  TableLoading,
} from "../components/ui";
import { errorLabel, formatLatency, formatRelative, formatTimestamp, formatWindow } from "../lib/format";
import { WINDOW_OPTIONS } from "../lib/window";

type ResultFilter = "all" | "passed" | "failed";

const PAGE_SIZES = [20, 50, 100] as const;

export function HistoryPage() {
  const { api, demo } = useApiContext();
  const [hours, setHours] = useWindowHours();

  const [result, setResult] = useState<ResultFilter>("all");
  const [endpointId, setEndpointId] = useState<number | "">("");
  const [pageSize, setPageSize] = useState<number>(20);
  const [offset, setOffset] = useState(0);

  const endpoints = useResource("endpoints:picker", (signal) =>
    api.listEndpoints({ limit: 500 }, signal),
  );

  const success = result === "all" ? undefined : result === "passed";
  const resource = useResource(
    `history:${hours}:${result}:${endpointId}:${pageSize}:${offset}`,
    (signal) =>
      api.globalHistory(
        {
          limit: pageSize,
          offset,
          success,
          endpointId: endpointId === "" ? undefined : endpointId,
          hours,
        },
        signal,
      ),
  );

  useEffect(() => {
    setOffset(0);
  }, [hours, result, endpointId, pageSize]);

  const items = resource.data?.items ?? [];
  const total = resource.data?.total ?? 0;
  const hasFilters = result !== "all" || endpointId !== "";
  const clearFilters = () => {
    setResult("all");
    setEndpointId("");
  };

  return (
    <>
      <PageHeader
        title="Monitoring history"
        subtitle={
          resource.data
            ? `${total} checks recorded in ${formatWindow(hours)} · newest first`
            : "Every recorded health check across your endpoints."
        }
        actions={
          <Segmented
            label="Window"
            value={hours}
            options={WINDOW_OPTIONS}
            onChange={setHours}
            testId="history-window"
          />
        }
      />

      <div className="filters" role="search">
        <Segmented
          label="Result"
          value={result}
          options={[
            { value: "all", label: "All checks" },
            { value: "passed", label: "Passed" },
            { value: "failed", label: "Failed" },
          ]}
          onChange={setResult}
          testId="history-result"
        />
        <SelectField
          id="history-endpoint"
          label="Endpoint"
          value={endpointId === "" ? "" : String(endpointId)}
          onChange={(event) =>
            setEndpointId(event.target.value === "" ? "" : Number(event.target.value))
          }
          helper="Scope the log to a single endpoint."
        >
          <option value="">All endpoints</option>
          {(endpoints.data?.items ?? []).map((endpoint) => (
            <option key={endpoint.id} value={endpoint.id}>
              {endpoint.name}
            </option>
          ))}
        </SelectField>
        {hasFilters ? (
          <div className="field">
            <span className="sr-only">Filters</span>
            <button type="button" className="btn btn--ghost" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      <Card>
        {resource.loading && !resource.data ? (
          <TableLoading rows={8} columns={5} />
        ) : resource.error ? (
          <ErrorState
            title="History could not be loaded"
            error={resource.error}
            onRetry={resource.reload}
          />
        ) : items.length === 0 ? (
          <EmptyState glyph="◷" title="No checks in this window">
            <p>
              {hasFilters
                ? "No recorded checks match these filters. Try clearing them or widening the window."
                : `Nothing has been checked in ${formatWindow(hours)} yet. Run a health check or register an endpoint.`}
            </p>
            {hasFilters ? (
              <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Health checks in {formatWindow(hours)}, newest first
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
                  {items.map((check) => (
                    <tr key={check.id} data-testid="history-row">
                      <td>
                        <Link to={`/endpoints/${check.endpoint_id}`} className="row-link">
                          {check.endpoint_name}
                        </Link>
                      </td>
                      <td title={formatTimestamp(check.checked_at)}>
                        {formatRelative(check.checked_at)}
                        <span className="sr-only"> ({formatTimestamp(check.checked_at)})</span>
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
            <div className="row row--between">
              <Pagination
                total={total}
                limit={pageSize}
                offset={offset}
                onChange={setOffset}
                itemLabel="checks"
              />
              <label className="row text-sm" htmlFor="history-page-size">
                <span className="muted">Rows</span>
                <select
                  id="history-page-size"
                  className="select select--inline"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
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
