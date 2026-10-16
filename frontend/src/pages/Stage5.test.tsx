/* ── Stage-5 flows: register, endpoint list interactions, sign-in ── */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthStatus, Endpoint, EndpointList, Summary } from "../api/types";
import App from "../App";

const WINDOW = {
  hours: 24,
  from: "2026-10-15T12:00:00+00:00",
  to: "2026-10-16T12:00:00+00:00",
};

const AUTH_DISABLED: AuthStatus = { enabled: false, username: null, version: "0.7.0" };
const AUTH_ENABLED: AuthStatus = { enabled: true, username: null, version: "0.7.0" };

const summary: Summary = {
  window: WINDOW,
  endpoints: { total: 2, active: 2, inactive: 0, healthy: 2, degraded: 0, failing: 0, unknown: 0 },
  total_checks: 10,
  successful_checks: 10,
  failed_checks: 0,
  availability_percent: 100,
  average_latency_ms: 88,
  degraded_threshold_ms: 1000,
  last_check_at: "2026-10-16T11:30:00Z",
};

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
      total_checks: 8,
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
      state: "healthy",
      checked_at: "2026-10-16T11:00:00Z",
      status_code: 204,
      latency_ms: 40,
      availability_percent: 100,
      total_checks: 6,
      window_hours: 24,
      degraded_threshold_ms: 1000,
    },
  },
];

const newEndpoint: Endpoint = {
  id: 9,
  name: "New endpoint",
  url: "https://new.example/health",
  is_active: true,
  created_at: "2026-10-16T12:00:00Z",
  updated_at: "2026-10-16T12:00:00Z",
  status: null,
};

const endpointsList: EndpointList = { total: 2, limit: 500, offset: 0, items: endpoints };

const emptyHistory = { total: 0, limit: 20, offset: 0, items: [] };
const emptyReport = {
  endpoint_id: 9,
  total_checks: 0,
  successful_checks: 0,
  failed_checks: 0,
  availability_percent: 0,
  average_latency_ms: null,
  first_check_at: null,
  last_check_at: null,
  window: WINDOW,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as Response;
}

interface RouteOptions {
  authEnabled?: boolean;
  createStatus?: number;
  createDetail?: unknown;
  loginStatus?: number;
}

function route(url: string, init?: RequestInit, options: RouteOptions = {}): Response {
  const method = init?.method ?? "GET";

  if (url.includes("/api/v1/auth/login") && method === "POST") {
    return options.loginStatus === 200
      ? jsonResponse(200, {
          token: "t",
          token_type: "bearer",
          expires_in: 3600,
          username: "admin",
        })
      : jsonResponse(401, { detail: "Invalid username or password" });
  }
  if (url.includes("/api/v1/auth/me")) return jsonResponse(401, { detail: "Not authenticated" });
  if (url.includes("/api/v1/auth/status")) {
    return jsonResponse(200, options.authEnabled ? AUTH_ENABLED : AUTH_DISABLED);
  }
  if (url.endsWith("/api/v1/endpoints") && method === "POST") {
    return options.createStatus === 422
      ? jsonResponse(422, {
          detail: [{ loc: ["body", "url"], msg: "URL is blocked by network policy" }],
        })
      : jsonResponse(201, newEndpoint);
  }
  if (url.includes("/api/v1/endpoints/9/report")) return jsonResponse(200, emptyReport);
  if (url.includes("/api/v1/endpoints/9/history")) return jsonResponse(200, emptyHistory);
  if (/\/api\/v1\/endpoints\/9(\?|$)/.test(url)) return jsonResponse(200, newEndpoint);
  if (url.includes("/api/v1/summary")) return jsonResponse(200, summary);
  if (url.includes("/api/v1/trend")) {
    return jsonResponse(200, { window: WINDOW, granularity: "hour", endpoint_id: null, buckets: [] });
  }
  if (url.includes("/api/v1/history")) return jsonResponse(200, emptyHistory);
  if (url.includes("/api/v1/endpoints")) return jsonResponse(200, endpointsList);
  if (url.includes("/health")) {
    return jsonResponse(200, { status: "ok", service: "pulsewatch-api", version: "0.7.0" });
  }
  return jsonResponse(404, { detail: `Unhandled ${url}` });
}

const fetchMock = vi.fn();

function stubFetch(options: RouteOptions = {}) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    return Promise.resolve(route(url, init, options));
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.pushState({}, "", "/");
});

describe("Register endpoint", () => {
  it("validates both fields before submitting", async () => {
    const user = userEvent.setup();
    renderAt("/endpoints/new");

    await screen.findByRole("heading", { name: "Register endpoint" });
    await user.click(screen.getByTestId("register-submit"));

    expect(await screen.findByText("Enter a display name for this endpoint.")).toBeInTheDocument();
    expect(screen.getByText("Enter the URL to monitor.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates the endpoint and opens its detail page", async () => {
    const user = userEvent.setup();
    renderAt("/endpoints/new");
    await screen.findByRole("heading", { name: "Register endpoint" });

    await user.type(screen.getByLabelText("Display name"), "New endpoint");
    await user.type(screen.getByLabelText("URL"), "https://new.example/health");
    await user.click(screen.getByTestId("register-submit"));

    await waitFor(() => expect(window.location.pathname).toBe("/endpoints/9"));
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(String(postCall?.[0])).toContain("/api/v1/endpoints");
    expect(JSON.parse(String((postCall?.[1] as RequestInit).body))).toEqual({
      name: "New endpoint",
      url: "https://new.example/health",
      is_active: true,
    });
    expect(await screen.findByRole("heading", { name: "New endpoint" })).toBeInTheDocument();
  });

  it("maps 422 issue lists back onto the offending field", async () => {
    stubFetch({ createStatus: 422 });
    const user = userEvent.setup();
    renderAt("/endpoints/new");
    await screen.findByRole("heading", { name: "Register endpoint" });

    await user.type(screen.getByLabelText("Display name"), "Blocked");
    await user.type(screen.getByLabelText("URL"), "https://blocked.example/health");
    await user.click(screen.getByTestId("register-submit"));

    expect(await screen.findByText("URL is blocked by network policy")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/endpoints/new");
  });
});

describe("Endpoints list", () => {
  it("filters rows by search text after the debounce", async () => {
    const user = userEvent.setup();
    renderAt("/endpoints");

    await screen.findByRole("heading", { name: "Endpoints" });
    expect(await screen.findAllByTestId("endpoint-row")).toHaveLength(2);

    await user.type(screen.getByLabelText("Search"), "Billing");

    await waitFor(
      () => {
        const rows = screen.getAllByTestId("endpoint-row");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent("Billing webhooks");
      },
      { timeout: 1500 },
    );
  });

  it("blocks manual checks while sample data is on", async () => {
    window.localStorage.setItem("pulsewatch.demo", "true");
    const user = userEvent.setup();
    renderAt("/endpoints");

    await screen.findByRole("heading", { name: "Endpoints" });
    const rows = await screen.findAllByTestId("endpoint-row");
    await user.click(within(rows[0]).getByRole("button", { name: "Check now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sample data is read-only. Exit demo mode to manage endpoints.",
    );
  });
});

describe("Sign in", () => {
  it("shows the credential error, then signs in and reaches the dashboard", async () => {
    stubFetch({ authEnabled: true });
    const user = userEvent.setup();
    renderAt("/login");

    await screen.findByRole("heading", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByTestId("login-submit"));
    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        return Promise.resolve(route(url, init, { authEnabled: true, loginStatus: 200 }));
      }),
    );

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });
});
