/* ── Stage-3 pages: history, analytics, reports, failure events ── */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthStatus,
  Endpoint,
  GlobalHistoryPage,
  Report,
  Summary,
  Trend,
} from "../api/types";
import App from "../App";

const WINDOW = {
  hours: 24,
  from: "2026-10-15T12:00:00+00:00",
  to: "2026-10-16T12:00:00+00:00",
};

const AUTH_DISABLED: AuthStatus = { enabled: false, username: null, version: "0.1.0" };

const endpoints: Endpoint[] = [
  {
    id: 1,
    name: "Payments API",
    url: "https://pay.example/health",
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    status: {
      state: "healthy",
      checked_at: "2026-10-16T11:30:00Z",
      status_code: 200,
      latency_ms: 90,
      availability_percent: 100,
      total_checks: 20,
      window_hours: 24,
      degraded_threshold_ms: 1000,
    },
  },
  {
    id: 2,
    name: "Billing webhooks",
    url: "https://hooks.example/ping",
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    status: {
      state: "failing",
      checked_at: "2026-10-16T11:00:00Z",
      status_code: 500,
      latency_ms: null,
      availability_percent: 62.5,
      total_checks: 16,
      window_hours: 24,
      degraded_threshold_ms: 1000,
    },
  },
];

const endpointsList = { total: 2, limit: 500, offset: 0, items: endpoints };

const historyPage: GlobalHistoryPage = {
  total: 2,
  limit: 20,
  offset: 0,
  items: [
    {
      id: 2,
      endpoint_id: 1,
      endpoint_name: "Payments API",
      endpoint_url: "https://pay.example/health",
      checked_at: "2026-10-16T11:30:00Z",
      status_code: 200,
      latency_ms: 90,
      success: true,
      error_type: null,
    },
    {
      id: 1,
      endpoint_id: 2,
      endpoint_name: "Billing webhooks",
      endpoint_url: "https://hooks.example/ping",
      checked_at: "2026-10-16T11:00:00Z",
      status_code: 500,
      latency_ms: null,
      success: false,
      error_type: "http_error",
    },
  ],
};

const failuresPage: GlobalHistoryPage = {
  total: 3,
  limit: 100,
  offset: 0,
  items: [
    {
      id: 3,
      endpoint_id: 2,
      endpoint_name: "Billing webhooks",
      endpoint_url: "https://hooks.example/ping",
      checked_at: "2026-10-16T11:00:00Z",
      status_code: 500,
      latency_ms: null,
      success: false,
      error_type: "http_error",
    },
    {
      id: 2,
      endpoint_id: 2,
      endpoint_name: "Billing webhooks",
      endpoint_url: "https://hooks.example/ping",
      checked_at: "2026-10-16T10:30:00Z",
      status_code: null,
      latency_ms: null,
      success: false,
      error_type: "timeout",
    },
    {
      id: 1,
      endpoint_id: 2,
      endpoint_name: "Billing webhooks",
      endpoint_url: "https://hooks.example/ping",
      checked_at: "2026-10-16T10:00:00Z",
      status_code: null,
      latency_ms: null,
      success: false,
      error_type: "timeout",
    },
  ],
};

const summary: Summary = {
  window: WINDOW,
  endpoints: { total: 2, active: 2, inactive: 0, healthy: 1, degraded: 0, failing: 1, unknown: 0 },
  total_checks: 36,
  successful_checks: 33,
  failed_checks: 3,
  availability_percent: 91.67,
  average_latency_ms: 120,
  degraded_threshold_ms: 1000,
  last_check_at: "2026-10-16T11:30:00Z",
};

const report: Report = {
  endpoint_id: 2,
  total_checks: 16,
  successful_checks: 10,
  failed_checks: 6,
  availability_percent: 62.5,
  average_latency_ms: 340,
  first_check_at: "2026-10-15T12:00:00Z",
  last_check_at: "2026-10-16T11:00:00Z",
  window: WINDOW,
};

const trend: Trend = {
  window: WINDOW,
  granularity: "hour",
  endpoint_id: null,
  buckets: [
    {
      bucket_start: "2026-10-16T09:00:00+00:00",
      total: 4,
      successful: 2,
      failed: 2,
      average_latency_ms: 300,
    },
    {
      bucket_start: "2026-10-16T10:00:00+00:00",
      total: 4,
      successful: 3,
      failed: 1,
      average_latency_ms: 150,
    },
  ],
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as Response;
}

function route(url: string): Response {
  if (url.includes("/api/v1/auth/status")) return jsonResponse(200, AUTH_DISABLED);
  if (url.includes("/api/v1/summary")) return jsonResponse(200, summary);
  if (url.includes("/api/v1/trend")) return jsonResponse(200, trend);
  if (url.includes("/api/v1/history")) {
    return jsonResponse(200, url.includes("success=false") ? failuresPage : historyPage);
  }
  if (url.includes("/report")) return jsonResponse(200, report);
  if (url.includes("/api/v1/endpoints")) return jsonResponse(200, endpointsList);
  if (url.includes("/health")) {
    return jsonResponse(200, { status: "ok", service: "pulsewatch-api", version: "0.1.0" });
  }
  return jsonResponse(404, { detail: `Unhandled ${url}` });
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      return Promise.resolve(route(url));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("Monitoring history", () => {
  it("lists checks and filters down to failures", async () => {
    const user = userEvent.setup();
    renderAt("/history");

    expect(await screen.findByRole("heading", { name: "Monitoring history" })).toBeInTheDocument();
    const rows = await screen.findAllByTestId("history-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Payments API")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Failed" }));

    const filtered = await screen.findAllByTestId("history-row");
    expect(filtered).toHaveLength(3);
    expect(within(filtered[0]).getByText("Failure")).toBeInTheDocument();
    expect(filtered[0]).toHaveTextContent("HTTP error");
  });
});

describe("Reliability analytics", () => {
  it("shows fleet metrics and ranks endpoints worst-first", async () => {
    renderAt("/analytics");

    expect(await screen.findByRole("heading", { name: "Reliability analytics" })).toBeInTheDocument();
    expect(await screen.findByTestId("analytics-availability")).toHaveTextContent("91.67%");
    expect(screen.getByTestId("analytics-failed")).toHaveTextContent("3");

    const rows = await screen.findAllByTestId("analytics-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Billing webhooks")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Payments API")).toBeInTheDocument();
  });
});

describe("Reports", () => {
  it("renders the fleet report, then scopes to one endpoint", async () => {
    renderAt("/reports");

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(await screen.findByTestId("report-availability")).toHaveTextContent("91.67%");
    expect(await screen.findByTestId("failure-causes")).toBeInTheDocument();
    expect(screen.getByTestId("failure-causes")).toHaveTextContent("Timeout");

    fireEvent.change(screen.getByLabelText("Report scope"), { target: { value: "2" } });

    expect(await screen.findByTestId("report-availability")).toHaveTextContent("62.50%");
    expect(await screen.findByTestId("report-checks")).toHaveTextContent("16");
    await waitFor(() => {
      expect(document.querySelector(".page-header__text p")).toHaveTextContent(
        "Billing webhooks · last 24 hours",
      );
    });
  });
});

describe("Failure events", () => {
  it("groups recent failures into one event with causes", async () => {
    renderAt("/incidents");

    expect(await screen.findByRole("heading", { name: "Failure events" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("grouped into a single event");

    const rows = await screen.findAllByTestId("incident-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Billing webhooks");
    expect(rows[0]).toHaveTextContent("Timeout");
    expect(rows[0]).toHaveTextContent("3");
  });

  it("builds events from the sample dataset in demo mode", async () => {
    window.localStorage.setItem("pulsewatch.demo", "true");
    renderAt("/incidents");

    expect(await screen.findByRole("heading", { name: "Failure events" })).toBeInTheDocument();
    expect(await screen.findByText("Sample data.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId("incident-row").length).toBeGreaterThan(0);
    });
  });
});
