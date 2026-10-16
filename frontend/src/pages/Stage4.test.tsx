/* ── Stage-4 pages: landing, settings, about ── */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthStatus, EndpointList, SchedulerStatus, Summary } from "../api/types";
import App from "../App";

const WINDOW = {
  hours: 24,
  from: "2026-10-15T12:00:00+00:00",
  to: "2026-10-16T12:00:00+00:00",
};

const AUTH_DISABLED: AuthStatus = { enabled: false, username: null, version: "0.7.0" };

const summary: Summary = {
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

const emptyEndpoints: EndpointList = { total: 0, limit: 500, offset: 0, items: [] };

const scheduler: SchedulerStatus = {
  enabled: true,
  interval_seconds: 300,
  last_run_at: "2026-10-16T11:00:00+00:00",
  last_run_checked: 3,
  next_run_at: "2026-10-16T11:05:00+00:00",
  total_checks: 42,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as Response;
}

function route(url: string): Response {
  if (url.includes("/api/v1/auth/status")) return jsonResponse(200, AUTH_DISABLED);
  if (url.includes("/api/v1/scheduler")) return jsonResponse(200, scheduler);
  if (url.includes("/api/v1/summary")) return jsonResponse(200, summary);
  if (url.includes("/api/v1/trend")) {
    return jsonResponse(200, { window: WINDOW, granularity: "hour", endpoint_id: null, buckets: [] });
  }
  if (url.includes("/api/v1/history")) return jsonResponse(200, { total: 0, limit: 20, offset: 0, items: [] });
  if (url.includes("/api/v1/endpoints")) return jsonResponse(200, emptyEndpoints);
  if (url.includes("/health")) {
    return jsonResponse(200, { status: "ok", service: "pulsewatch-api", version: "0.7.0" });
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

describe("Landing page", () => {
  it("presents the product and links into the dashboard", async () => {
    const user = userEvent.setup();
    renderAt("/");

    expect(
      await screen.findByRole("heading", {
        name: "Know when your APIs break — with numbers you can trust.",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe("PulseWatch · API Health & Reliability Observatory"),
    );
    expect(screen.getByText("Honest health states")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "An overview of every screen" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Preview of the PulseWatch overview dashboard/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Interface preview — illustrative numbers, not live data."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reliability analytics/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Monitoring history/ })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("landing-open"));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("offers sign-in when authentication is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        if (url.includes("/api/v1/auth/status")) {
          return jsonResponse(200, { enabled: true, username: null, version: "0.7.0" });
        }
        if (url.includes("/api/v1/auth/me")) return jsonResponse(401, { detail: "Not authenticated" });
        return route(url);
      }),
    );
    renderAt("/");

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("toggles sample data and persists the reporting window", async () => {
    const user = userEvent.setup();
    renderAt("/settings");

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Automatic checks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("every 5 minutes")).toBeInTheDocument();
    expect(screen.getByText(/3 endpoints checked/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    await user.click(screen.getByTestId("settings-demo-toggle"));
    expect(await screen.findByText("Sample data on")).toBeInTheDocument();
    expect(screen.getByText("Sample data.")).toBeInTheDocument();
    expect(screen.getByText(/has no background scheduler/)).toBeInTheDocument();

    await user.click(screen.getByTestId("settings-demo-toggle"));
    await waitFor(() => expect(screen.getByText("Live data")).toBeInTheDocument());

    const windowButtons = screen.getByTestId("settings-window");
    fireEvent.click(within(windowButtons).getByRole("button", { name: "7 days" }));
    await waitFor(() =>
      expect(window.localStorage.getItem("pulsewatch.windowHours")).toBe("168"),
    );
  });
});

describe("About", () => {
  it("explains derivation rules with the live threshold", async () => {
    renderAt("/about");

    expect(await screen.findByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(screen.getByText("1000 ms")).toBeInTheDocument();
    expect(screen.getByText("PULSEWATCH_DEGRADED_LATENCY_MS")).toBeInTheDocument();
    expect(screen.getByText(/reported as unknown and excluded from healthy counts/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Failure events — grouped outages per endpoint" })).toBeInTheDocument();
  });
});
