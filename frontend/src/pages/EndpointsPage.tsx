import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useApiContext } from "../api/ApiProvider";
import type { Endpoint, HealthState } from "../api/types";
import { useDebounced, useResource, useWindowHours } from "../hooks";
import { PageHeader } from "../components/layout";
import {
  ActiveBadge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  SelectField,
  StatusBadge,
  TableLoading,
  TextField,
  useToast,
} from "../components/ui";
import {
  errorLabel,
  formatLatency,
  formatPercent,
  formatRelative,
  formatTimestamp,
} from "../lib/format";

const FETCH_LIMIT = 500;

type StatusFilter = "all" | HealthState;
type ActiveFilter = "all" | "active" | "inactive";

export function EndpointsPage() {
  const { api, demo, setDemo } = useApiContext();
  const toast = useToast();
  const [hours] = useWindowHours();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [pageSize, setPageSize] = useState(10);
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);

  const resource = useResource(`endpoints:${hours}`, (signal) =>
    api.listEndpoints({ limit: FETCH_LIMIT, includeStatus: true, hours }, signal),
  );

  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, statusFilter, activeFilter, pageSize]);

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    return (resource.data?.items ?? []).filter((endpoint) => {
      if (needle && !`${endpoint.name} ${endpoint.url}`.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "all" && (endpoint.status?.state ?? "unknown") !== statusFilter) return false;
      if (activeFilter === "active" && !endpoint.is_active) return false;
      if (activeFilter === "inactive" && endpoint.is_active) return false;
      return true;
    });
  }, [resource.data, debouncedQuery, statusFilter, activeFilter]);

  const pageItems = filtered.slice(offset, offset + pageSize);
  const hasFilters =
    debouncedQuery.trim() !== "" || statusFilter !== "all" || activeFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setActiveFilter("all");
  };

  const runCheck = async (endpoint: Endpoint) => {
    if (busyId !== null) return;
    setBusyId(endpoint.id);
    try {
      const result = await api.runCheck(endpoint.id);
      if (result.success) {
        toast.success(
          `${endpoint.name}: HTTP ${result.status_code ?? "—"} in ${formatLatency(result.latency_ms)}`,
        );
      } else {
        toast.error(
          `${endpoint.name}: check failed${result.error_type ? ` — ${errorLabel(result.error_type)}` : ""}`,
        );
      }
      resource.reload();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "The check could not be run.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (endpoint: Endpoint) => {
    if (busyId !== null) return;
    setBusyId(endpoint.id);
    try {
      await api.updateEndpoint(endpoint.id, { is_active: !endpoint.is_active });
      toast.success(
        endpoint.is_active
          ? `${endpoint.name} paused — manual checks are disabled until reactivated.`
          : `${endpoint.name} activated.`,
      );
      resource.reload();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "The endpoint could not be updated.");
    } finally {
      setBusyId(null);
    }
  };

  const total = resource.data?.total ?? 0;
  const activeCount = (resource.data?.items ?? []).filter((item) => item.is_active).length;

  return (
    <>
      <PageHeader
        title="Endpoints"
        subtitle={
          resource.data
            ? `${total} registered · ${activeCount} active · status over the selected window`
            : "Loading your monitored endpoints…"
        }
        actions={
          <Link className="btn btn--primary" to="/endpoints/new" data-testid="register-cta">
            Register endpoint
          </Link>
        }
      />

      <div className="filters" role="search">
        <TextField
          id="endpoint-search"
          label="Search"
          type="search"
          placeholder="Name or URL…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          helper="Matches endpoint names and URLs."
        />
        <SelectField
          id="endpoint-status"
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="all">Any status</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="failing">Failing</option>
          <option value="unknown">Not checked yet</option>
        </SelectField>
        <SelectField
          id="endpoint-active"
          label="Active"
          value={activeFilter}
          onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
        >
          <option value="all">Any</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </SelectField>
        {hasFilters ? (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <Card>
        {resource.loading && !resource.data ? (
          <TableLoading rows={6} columns={6} />
        ) : resource.error ? (
          <ErrorState
            title="Endpoints could not be loaded"
            error={resource.error}
            onRetry={resource.reload}
          />
        ) : total === 0 && !hasFilters ? (
          <EmptyState glyph="☰" title="No endpoints registered yet">
            <p>
              Register an HTTP/HTTPS endpoint to record health checks, latency, and availability.
            </p>
            <div className="row row--center">
              <Link className="btn btn--primary" to="/endpoints/new">
                Register endpoint
              </Link>
              <Button variant="secondary" onClick={() => setDemo(true)}>
                Explore sample data
              </Button>
            </div>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState glyph="◌" title="No endpoints match your filters">
            <p>Try a different search term, or clear the filters to see all {total} endpoints.</p>
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">
                  Registered endpoints with latest status, latency, and availability
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Status</th>
                    <th scope="col">Latency</th>
                    <th scope="col">Last checked</th>
                    <th scope="col">State</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((endpoint) => (
                    <tr key={endpoint.id} data-testid="endpoint-row">
                      <td>
                        <span className="endpoint-cell">
                          <Link to={`/endpoints/${endpoint.id}`} className="endpoint-cell__name row-link">
                            {endpoint.name}
                          </Link>
                          <span className="endpoint-cell__url" title={endpoint.url}>
                            {endpoint.url}
                          </span>
                        </span>
                      </td>
                      <td>
                        <div className="stack stack--sm">
                          <StatusBadge state={endpoint.status?.state ?? "unknown"} />
                          <span className="text-sm muted">
                            {endpoint.status?.availability_percent !== null &&
                            endpoint.status?.availability_percent !== undefined
                              ? `${formatPercent(endpoint.status.availability_percent)} over ${endpoint.status.window_hours} h`
                              : `no checks in ${endpoint.status?.window_hours ?? hours} h window`}
                          </span>
                        </div>
                      </td>
                      <td className="num">{formatLatency(endpoint.status?.latency_ms)}</td>
                      <td title={endpoint.status?.checked_at ?? undefined}>
                        {formatRelative(endpoint.status?.checked_at)}
                        {endpoint.status?.checked_at ? (
                          <span className="sr-only"> ({formatTimestamp(endpoint.status.checked_at)})</span>
                        ) : null}
                      </td>
                      <td>
                        <ActiveBadge isActive={endpoint.is_active} />
                      </td>
                      <td>
                        <div className="table-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void runCheck(endpoint)}
                            loading={busyId === endpoint.id}
                            disabled={busyId !== null && busyId !== endpoint.id}
                            title={
                              endpoint.is_active
                                ? "Run one health check now"
                                : "Activate this endpoint before running checks"
                            }
                          >
                            Check now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void toggleActive(endpoint)}
                            disabled={busyId !== null && busyId !== endpoint.id}
                            title={endpoint.is_active ? "Pause checks" : "Activate endpoint"}
                          >
                            {endpoint.is_active ? "Pause" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row row--between">
              <Pagination
                total={filtered.length}
                limit={pageSize}
                offset={offset}
                onChange={setOffset}
                itemLabel="endpoints"
              />
              <label className="row text-sm" htmlFor="page-size">
                <span className="muted">Rows</span>
                <select
                  id="page-size"
                  className="select select--inline"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
          </>
        )}
      </Card>

      {demo ? (
        <p className="muted text-sm page-note">
          Showing sample data — sample endpoints are read-only.
        </p>
      ) : null}
    </>
  );
}
