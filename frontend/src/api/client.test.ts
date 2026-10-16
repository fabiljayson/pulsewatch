/* ── Fetch client behaviour with a stubbed fetch ── */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, messageFromDetail, request } from "./client";

const fetchMock = vi.fn();

function stubFetch(response: {
  ok: boolean;
  status: number;
  body?: unknown;
  text?: string;
  reject?: unknown;
}) {
  fetchMock.mockImplementation(() => {
    if (response.reject) return Promise.reject(response.reject);
    return Promise.resolve({
      ok: response.ok,
      status: response.status,
      text: async () =>
        response.text !== undefined
          ? response.text
          : response.body === undefined
            ? ""
            : JSON.stringify(response.body),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("serializes query parameters and skips empty ones", async () => {
    stubFetch({ ok: true, status: 200, body: { ok: true } });
    await request("/api/v1/history", {
      query: { limit: 20, offset: 0, endpoint_id: undefined, success: "true", hours: null },
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/v1/history?");
    expect(url).toContain("limit=20");
    expect(url).toContain("success=true");
    expect(url).not.toContain("endpoint_id");
    expect(url).not.toContain("hours");
  });

  it("parses JSON bodies and sends credentials", async () => {
    stubFetch({ ok: true, status: 200, body: { total: 3 } });
    const result = await request<{ total: number }>("/api/v1/summary");
    expect(result).toEqual({ total: 3 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("include");
  });

  it("returns undefined for 204 responses", async () => {
    stubFetch({ ok: true, status: 204, text: "" });
    await expect(request("/api/v1/endpoints/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("turns string details into ApiError messages", async () => {
    stubFetch({ ok: false, status: 404, body: { detail: "Endpoint not found" } });
    const error = await request("/api/v1/endpoints/9").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).isNotFound).toBe(true);
    expect((error as ApiError).message).toBe("Endpoint not found");
  });

  it("flattens FastAPI 422 issue lists", async () => {
    stubFetch({
      ok: false,
      status: 422,
      body: {
        detail: [
          { loc: ["body", "name"], msg: "Field required", type: "missing" },
          { loc: ["body", "url"], msg: "Invalid URL", type: "value_error" },
        ],
      },
    });
    const error = (await request("/api/v1/endpoints", { method: "POST", body: {} }).catch(
      (caught: unknown) => caught,
    )) as ApiError;
    expect(error.status).toBe(422);
    expect(error.message).toContain("name: Field required");
    expect(error.message).toContain("url: Invalid URL");
    expect(Array.isArray(error.detail)).toBe(true);
  });

  it("maps network failures to a status-0 ApiError", async () => {
    stubFetch({ ok: false, status: 0, reject: new TypeError("Failed to fetch") });
    const error = (await request("/health").catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toContain("Could not reach");
  });
});

describe("messageFromDetail", () => {
  it("handles strings, lists, and unknown payloads", () => {
    expect(messageFromDetail("plain")).toBe("plain");
    expect(messageFromDetail([{ loc: ["body"], msg: "bad" }])).toBe("bad");
    expect(messageFromDetail(null)).toBe("The request could not be completed.");
    expect(messageFromDetail({ message: "custom" })).toBe("custom");
  });
});
