/* ── Failure-event grouping rules ── */

import { describe, expect, it } from "vitest";

import type { CheckItem } from "../api/types";
import { deriveFailureEvents, tallyCauses } from "./incidents";

function failure(
  endpointId: number,
  checkedAt: string,
  errorType: string | null = "timeout",
  name = `endpoint-${endpointId}`,
): CheckItem {
  return {
    id: Math.floor(Date.parse(checkedAt) / 1000),
    endpoint_id: endpointId,
    endpoint_name: name,
    endpoint_url: `https://example.com/${endpointId}`,
    checked_at: checkedAt,
    status_code: null,
    latency_ms: null,
    success: false,
    error_type: errorType,
  };
}

describe("deriveFailureEvents", () => {
  it("merges failures of one endpoint inside the burst gap", () => {
    const events = deriveFailureEvents([
      failure(1, "2026-10-16T10:00:00Z"),
      failure(1, "2026-10-16T11:00:00Z"),
      failure(1, "2026-10-16T12:00:00Z"),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].failures).toBe(3);
    expect(events[0].firstSeenAt).toBe("2026-10-16T10:00:00Z");
    expect(events[0].lastSeenAt).toBe("2026-10-16T12:00:00Z");
  });

  it("keeps endpoints and distant outages as separate events", () => {
    const events = deriveFailureEvents([
      failure(1, "2026-10-16T09:00:00Z"),
      failure(2, "2026-10-16T09:30:00Z"),
      failure(1, "2026-10-16T13:00:00Z"),
    ]);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.failures === 1)).toBe(true);
  });

  it("returns events newest first regardless of input order", () => {
    const events = deriveFailureEvents([
      failure(1, "2026-10-16T01:00:00Z"),
      failure(2, "2026-10-16T08:00:00Z"),
      failure(1, "2026-10-16T02:00:00Z"),
    ]);
    expect(events.map((event) => event.endpointId)).toEqual([2, 1]);
    expect(events[1].failures).toBe(2);
  });

  it("reports the dominant cause with counts", () => {
    const events = deriveFailureEvents([
      failure(1, "2026-10-16T10:00:00Z", "timeout"),
      failure(1, "2026-10-16T11:00:00Z", "connection"),
      failure(1, "2026-10-16T12:00:00Z", "timeout"),
    ]);
    expect(events[0].dominantCause).toBe("timeout");
    expect(events[0].causes).toEqual([
      { errorType: "timeout", count: 2 },
      { errorType: "connection", count: 1 },
    ]);
  });

  it("classifies missing error types as unknown", () => {
    const events = deriveFailureEvents([failure(1, "2026-10-16T10:00:00Z", null)]);
    expect(events[0].dominantCause).toBe("unknown");
  });

  it("returns an empty list for no failures", () => {
    expect(deriveFailureEvents([])).toEqual([]);
  });
});

describe("tallyCauses", () => {
  it("sorts by count then name", () => {
    expect(tallyCauses([{ error_type: "b" }, { error_type: "a" }, { error_type: "a" }])).toEqual([
      { errorType: "a", count: 2 },
      { errorType: "b", count: 1 },
    ]);
  });
});
