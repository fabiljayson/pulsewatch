/* ── Demo dataset invariants: labelled sample data, backend-shaped views ── */

import { describe, expect, it } from "vitest";

import {
  buildDemoDataset,
  demoEndpointHistory,
  demoGlobalHistory,
  demoReport,
  demoStatus,
  demoSummary,
  demoTrend,
} from "./dataset";

const dataset = buildDemoDataset(Date.parse("2026-10-16T12:00:00Z"));

describe("buildDemoDataset", () => {
  it("creates endpoints and checks, newest first", () => {
    expect(dataset.endpoints).toHaveLength(6);
    expect(dataset.checks.length).toBeGreaterThan(400);
    const stamps = dataset.checks.map((check) => check.checked_at);
    expect([...stamps].sort().reverse()).toEqual(stamps);
  });

  it("represents every health state exactly as the backend defines it", () => {
    const states = dataset.endpoints.map(
      (endpoint) => demoStatus(dataset, endpoint, 24).state,
    );
    expect(states).toContain("healthy");
    expect(states).toContain("degraded");
    expect(states).toContain("failing");
    expect(states).toContain("unknown");
    const inactive = dataset.endpoints.filter((endpoint) => !endpoint.is_active);
    expect(inactive).toHaveLength(1);
    expect(demoStatus(dataset, inactive[0], 24).state).toBe("unknown");
  });
});

describe("demoSummary", () => {
  it("counts endpoints and checks consistently", () => {
    const summary = demoSummary(dataset, 24);
    expect(summary.endpoints.total).toBe(6);
    expect(
      summary.endpoints.healthy +
        summary.endpoints.degraded +
        summary.endpoints.failing +
        summary.endpoints.unknown,
    ).toBe(6);
    expect(summary.total_checks).toBeGreaterThan(0);
    expect(summary.successful_checks + summary.failed_checks).toBe(summary.total_checks);
    expect(summary.availability_percent).toBeGreaterThanOrEqual(0);
    expect(summary.availability_percent).toBeLessThanOrEqual(100);
    expect(summary.window.hours).toBe(24);
  });
});

describe("demoTrend", () => {
  it("fills empty buckets so gaps stay visible", () => {
    const trend = demoTrend(dataset, 720);
    expect(trend.granularity).toBe("day");
    expect(trend.buckets.length).toBeGreaterThan(28);
    expect(trend.buckets.some((bucket) => bucket.total === 0)).toBe(true);
    expect(trend.buckets.every((bucket) => bucket.bucket_start.endsWith("T00:00:00+00:00"))).toBe(
      true,
    );
  });

  it("aggregates checks per bucket", () => {
    const trend = demoTrend(dataset, 24);
    expect(trend.granularity).toBe("hour");
    const total = trend.buckets.reduce((sum, bucket) => sum + bucket.total, 0);
    const expected = dataset.checks.filter(
      (check) => Date.parse(check.checked_at) >= dataset.now - 24 * 3_600_000,
    ).length;
    expect(total).toBe(expected);
  });
});

describe("demoGlobalHistory", () => {
  it("filters by result and endpoint, and paginates", () => {
    const failures = demoGlobalHistory(dataset, { limit: 50, offset: 0, success: false });
    expect(failures.total).toBeGreaterThan(0);
    expect(failures.items.every((item) => item.success === false)).toBe(true);

    const page = demoGlobalHistory(dataset, { limit: 5, offset: 0 });
    expect(page.items).toHaveLength(5);
    expect(page.total).toBe(dataset.checks.length);
    expect(page.items[0].endpoint_name).toBeTruthy();
  });

  it("returns the window-limited slice", () => {
    const day = demoGlobalHistory(dataset, { limit: 100, offset: 0, hours: 24 });
    const week = demoGlobalHistory(dataset, { limit: 100, offset: 0, hours: 168 });
    expect(day.total).toBeLessThan(week.total);
  });
});

describe("demoReport", () => {
  it("matches the documented availability formula", () => {
    const report = demoReport(dataset, 1, 24);
    expect(report.total_checks).toBe(report.successful_checks + report.failed_checks);
    const expected =
      report.total_checks > 0
        ? Math.round((report.successful_checks / report.total_checks) * 10000) / 100
        : 0;
    expect(report.availability_percent).toBe(expected);
    expect(report.window.hours).toBe(24);
  });

  it("returns zero counts for an endpoint with no checks", () => {
    const report = demoReport(dataset, 6, 24);
    expect(report.total_checks).toBe(0);
    expect(report.availability_percent).toBe(0);
    expect(report.average_latency_ms).toBeNull();
    expect(report.first_check_at).toBeNull();
  });
});

describe("demoEndpointHistory", () => {
  it("paginates newest-first per endpoint", () => {
    const page = demoEndpointHistory(dataset, 4, 10, 0);
    expect(page.endpoint_id).toBe(4);
    expect(page.items).toHaveLength(10);
    const stamps = page.items.map((item) => item.checked_at);
    expect([...stamps].sort().reverse()).toEqual(stamps);
  });
});
