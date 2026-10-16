/* ── App-level smoke: routing, shell, live fixtures, demo mode ── */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthStatus, EndpointList, GlobalHistoryPage, Summary, Trend } from "./api/types";
import App from "./App";

const WINDOW = {
  hours: 24,
  from: "2026-10-15T12:00:00+00:00",
  to: "2026-10-16T12:00:00+00:00",
};

const AUTH_DISABLED: AuthStatus = { enabled: false, username: null, version: "0.1.0" };

const EMPTY_SUMMARY: Summary = {
  window: WINDOW,
  endpoints: { total: 0, active: 0, inactive: 0, healthy: 0, degraded: 0, failing: 0, unknown: 0 },
  total_checks: 0,
  successful_checks: 0,
  failed_checks: 0,
  availability_percent: 0,
  average_latency_ms: null,
  degraded_threshold_ms: 1000,
  last_check_at: null,
};

const EMPTY_TREND: Trend = {
  window: WINDOW,
  granularity: "hour",
  endpoint_id: null,
  buckets: [],
};

const EMPTY_HISTORY: GlobalHistoryPage = { total: 0, limit: 8, offset: 0, items: [] };

const EMPTY_ENDPOINTS: EndpointList = { total: 0, limit: 500, offset: 0, items: [] };

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function route(url: string): Response {
  if (url.includes("/api/v1/auth/status")) return jsonResponse(200, AUTH_DISABLED);
  if (url.includes("/api/v1/summary")) return jsonResponse(200, EMPTY_SUMMARY);
  if (url.includes("/api/v1/trend")) return jsonResponse(200, EMPTY_TREND);
  if (url.includes("/api/v1/history")) return jsonResponse(200, EMPTY_HISTORY);
  if (url.includes("/api/v1/endpoints")) return jsonResponse(200, EMPTY_ENDPOINTS);
  if (url.includes("/health")) {
    return jsonResponse(200, { status: "ok", service: "pulsewatch-api", version: "0.1.0" });
  }
  return jsonResponse(404, { detail: `Unhandled ${url}` });
}

beforeEach(() => {
  window.history.pushState({}, "", "/dashboard");
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

describe("live mode", () => {
  it("renders the overview shell with metrics and empty states", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Overview · PulseWatch"));

    expect(screen.getByTestId("metric-total")).toHaveTextContent("0");
    expect(screen.getByTestId("metric-availability")).toHaveTextContent("—");
    expect(await screen.findByText("No checks yet")).toBeInTheDocument();
    expect(screen.getByTestId("register-cta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Endpoints" })).toBeInTheDocument();
  });

  it("informs the user when every check is run without endpoints", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByTestId("check-all"));

    expect(await screen.findByRole("status")).toHaveTextContent("No active endpoints to check.");
  });

  it("navigates to the endpoints page from the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Overview" });

    await user.click(screen.getByRole("link", { name: "Endpoints" }));

    expect(await screen.findByRole("heading", { name: "Endpoints" })).toBeInTheDocument();
    expect(await screen.findByText("No endpoints registered yet")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Endpoints · PulseWatch"));
  });

  it("shows the not-found route for unknown addresses", async () => {
    window.history.pushState({}, "", "/does-not-exist");
    render(<App />);

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});

describe("demo mode", () => {
  it("labels sample data, lists it, and blocks mutations", async () => {
    window.localStorage.setItem("pulsewatch.demo", "true");
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Sample data.")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Overview" });

    await user.click(screen.getByTestId("check-all"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sample data is read-only. Exit sample data to run real checks.",
    );

    await user.click(screen.getByRole("link", { name: "Endpoints" }));
    expect(await screen.findByText("Payments API")).toBeInTheDocument();
    expect(await screen.findByText("Legacy reporting")).toBeInTheDocument();
  });
});
