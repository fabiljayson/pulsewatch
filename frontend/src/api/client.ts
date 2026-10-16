/* ── Fetch client: base URL, timeouts, typed errors ── */

import type { AuthStatus, CurrentUser, LoginResponse } from "./types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_MS = 20_000;

/** Browser event fired whenever any API request returns 401 Unauthorized. */
export const UNAUTHORIZED_EVENT = "pulsewatch:unauthorized";

function emitUnauthorized(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Normalize FastAPI error payloads (string detail or 422 issue list) to one line. */
export function messageFromDetail(detail: unknown): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const containers = new Set(["body", "query", "path", "header", "cookie"]);
    const parts = detail
      .map((issue) => {
        if (issue && typeof issue === "object" && "msg" in issue) {
          const location = "loc" in issue && Array.isArray(issue.loc) ? issue.loc : [];
          const fieldPath = location.filter(
            (segment: unknown) => !containers.has(String(segment)),
          );
          const where = fieldPath.length ? String(fieldPath[fieldPath.length - 1]) : "";
          const msg = String((issue as { msg: unknown }).msg);
          return where ? `${where}: ${msg}` : msg;
        }
        return String(issue);
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return "The request could not be completed.";
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Perform one HTTP request against the PulseWatch API.
 *
 * Resolves with parsed JSON (or `undefined` for 204/empty bodies) and rejects
 * with {@link ApiError} for HTTP, timeout, and network failures. When the
 * caller's own `signal` aborts, the original AbortError propagates unchanged
 * so callers can ignore superseded requests.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted && isAbortError(error)) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(0, "The request timed out. Check that the API is running, then retry.");
    }
    throw new ApiError(0, "Could not reach the PulseWatch API. Check your connection, then retry.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail: unknown }).detail
        : payload;
    if (response.status === 401) emitUnauthorized();
    throw new ApiError(response.status, messageFromDetail(detail), detail);
  }

  if (payload === null) return undefined as T;
  return payload as T;
}

/* ── Auth helpers ── */

export function fetchAuthStatus(signal?: AbortSignal) {
  return request<AuthStatus>("/api/v1/auth/status", { signal });
}

export function fetchCurrentUser(signal?: AbortSignal) {
  return request<CurrentUser>("/api/v1/auth/me", { signal });
}

export function login(username: string, password: string) {
  return request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function logout() {
  return request<void>("/api/v1/auth/logout", { method: "POST" });
}
