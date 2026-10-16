/* ── Demo dataset: clearly-labelled sample monitoring data (browser memory) ──
 *
 * Nothing here touches SQLite. The dataset is deterministic, generated in the
 * browser when demo mode is switched on, and every surface derived from it is
 * marked as sample data by the app shell.
 */

import type {
  CheckItem,
  CheckResult,
  Endpoint,
  EndpointStatus,
  HealthState,
  HistoryPage,
  Report,
  Summary,
  Trend,
  TrendBucket,
} from "../api/types";

const HOUR_MS = 3_600_000;
const DEGRADED_THRESHOLD_MS = 1000;
const WINDOW_COVERAGE_HOURS = 48;

interface EndpointPlan {
  name: string;
  url: string;
  is_active: boolean;
  behaviour: "steady" | "slow" | "flaky" | "idle";
}

const PLANS: EndpointPlan[] = [
  { name: "Payments API", url: "https://api.payments.example/v1/health", is_active: true, behaviour: "steady" },
  { name: "Auth service", url: "https://auth.example.com/.well-known/health", is_active: true, behaviour: "steady" },
  { name: "Search cluster", url: "https://search.example.com/status", is_active: true, behaviour: "slow" },
  { name: "Billing webhooks", url: "https://hooks.billing.example.com/ping", is_active: true, behaviour: "flaky" },
  { name: "Media CDN edge", url: "https://cdn.media.example.com/health", is_active: true, behaviour: "steady" },
  { name: "Legacy reporting", url: "https://legacy.reports.example.com/", is_active: false, behaviour: "idle" },
];

export interface DemoDataset {
  generatedAt: string;
  now: number;
  endpoints: Endpoint[];
  checks: (CheckResult & { endpoint_name: string })[];
}

/* ── Deterministic pseudo-randomness ── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoUtc(date: Date): string {
  return date.toISOString().replace("Z", "+00:00");
}

/* ── Generation ── */

interface Sample {
  status_code: number | null;
  latency_ms: number | null;
  success: boolean;
  error_type: string | null;
}

function sampleFor(behaviour: EndpointPlan["behaviour"], roll: number, jitter: number): Sample {
  switch (behaviour) {
    case "slow": {
      const latency = Math.round(1150 + jitter * 1300);
      return roll < 0.03
        ? { status_code: 503, latency_ms: latency + 400, success: false, error_type: "http_error" }
        : { status_code: 200, latency_ms: latency, success: true, error_type: null };
    }
    case "flaky": {
      if (roll < 0.06) {
        return { status_code: null, latency_ms: null, success: false, error_type: "timeout" };
      }
      if (roll < 0.14) {
        return {
          status_code: 500,
          latency_ms: Math.round(240 + jitter * 260),
          success: false,
          error_type: "http_error",
        };
      }
      if (roll < 0.18) {
        return { status_code: null, latency_ms: null, success: false, error_type: "connection_error" };
      }
      return { status_code: 200, latency_ms: Math.round(90 + jitter * 180), success: true, error_type: null };
    }
    case "idle":
    case "steady":
    default: {
      if (roll < 0.01) {
        return {
          status_code: 502,
          latency_ms: Math.round(500 + jitter * 700),
          success: false,
          error_type: "http_error",
        };
      }
      return { status_code: 200, latency_ms: Math.round(45 + jitter * 175), success: true, error_type: null };
    }
  }
}

export function buildDemoDataset(now: number = Date.now()): DemoDataset {
  const random = mulberry32(0x5eed1);
  const start = now - WINDOW_COVERAGE_HOURS * HOUR_MS;
  const endpoints: Endpoint[] = [];
  const checks: (CheckResult & { endpoint_name: string })[] = [];
  let checkId = 1;

  for (const [index, plan] of PLANS.entries()) {
    const endpointId = index + 1;
    endpoints.push({
      id: endpointId,
      name: plan.name,
      url: plan.url,
      is_active: plan.is_active,
      created_at: isoUtc(new Date(now - 30 * 24 * HOUR_MS)),
      updated_at: isoUtc(new Date(now - 26 * 24 * HOUR_MS)),
    });
    if (!plan.is_active) continue;

    for (let t = start; t <= now; t += 30 * 60_000) {
      const sample = sampleFor(plan.behaviour, random(), random());
      checks.push({
        id: checkId++,
        endpoint_id: endpointId,
        endpoint_name: plan.name,
        checked_at: isoUtc(new Date(t)),
        status_code: sample.status_code,
        latency_ms: sample.latency_ms,
        success: sample.success,
        error_type: sample.error_type,
      });
    }
  }

  // Shape the newest sample per endpoint so healthy / degraded / failing are
  // all visible in the sample data at a glance.
  const newestIndex = new Map<number, number>();
  checks.forEach((check, index) => newestIndex.set(check.endpoint_id, index));
  const webhooks = newestIndex.get(4);
  if (webhooks !== undefined) {
    checks[webhooks] = {
      ...checks[webhooks],
      status_code: 500,
      latency_ms: 318,
      success: false,
      error_type: "http_error",
    };
  }
  const search = newestIndex.get(3);
  if (search !== undefined) {
    checks[search] = { ...checks[search], status_code: 200, latency_ms: 1840, success: true, error_type: null };
  }

  checks.sort((a, b) =>
    a.checked_at < b.checked_at ? 1 : a.checked_at > b.checked_at ? -1 : b.id - a.id,
  );
  return { generatedAt: isoUtc(new Date(now)), now, endpoints, checks };
}

/* ── Derived views (mirror the backend's documented formulas) ── */

function windowStart(dataset: DemoDataset, hours: number): number {
  return dataset.now - hours * HOUR_MS;
}

function inWindow(dataset: DemoDataset, check: CheckResult, hours: number): boolean {
  return Date.parse(check.checked_at) >= windowStart(dataset, hours);
}

function latestCheck(dataset: DemoDataset, endpointId: number): CheckResult | undefined {
  return dataset.checks.find((check) => check.endpoint_id === endpointId);
}

function classify(check: CheckResult | undefined): HealthState {
  if (!check) return "unknown";
  if (!check.success) return "failing";
  if (check.latency_ms !== null && check.latency_ms > DEGRADED_THRESHOLD_MS) return "degraded";
  return "healthy";
}

export function demoStatus(dataset: DemoDataset, endpoint: Endpoint, hours: number): EndpointStatus {
  const latest = latestCheck(dataset, endpoint.id);
  const windowed = dataset.checks.filter(
    (check) => check.endpoint_id === endpoint.id && inWindow(dataset, check, hours),
  );
  const successful = windowed.filter((check) => check.success).length;
  return {
    state: classify(latest),
    checked_at: latest?.checked_at ?? null,
    status_code: latest?.status_code ?? null,
    latency_ms: latest?.latency_ms ?? null,
    availability_percent: windowed.length ? Math.round((successful / windowed.length) * 10000) / 100 : null,
    total_checks: windowed.length,
    window_hours: hours,
    degraded_threshold_ms: DEGRADED_THRESHOLD_MS,
  };
}

export function demoSummary(dataset: DemoDataset, hours: number): Summary {
  const windowed = dataset.checks.filter((check) => inWindow(dataset, check, hours));
  const successful = windowed.filter((check) => check.success).length;
  const measured = windowed.filter((check) => check.latency_ms !== null);
  const avg = measured.length
    ? measured.reduce((sum, check) => sum + (check.latency_ms ?? 0), 0) / measured.length
    : null;
  const states = dataset.endpoints.map((endpoint) => classify(latestCheck(dataset, endpoint.id)));
  const latestChecks = dataset.endpoints
    .map((endpoint) => latestCheck(dataset, endpoint.id))
    .filter((check): check is CheckResult => Boolean(check));

  return {
    window: {
      hours,
      from: isoUtc(new Date(windowStart(dataset, hours))),
      to: isoUtc(new Date(dataset.now)),
    },
    endpoints: {
      total: dataset.endpoints.length,
      active: dataset.endpoints.filter((endpoint) => endpoint.is_active).length,
      inactive: dataset.endpoints.filter((endpoint) => !endpoint.is_active).length,
      healthy: states.filter((state) => state === "healthy").length,
      degraded: states.filter((state) => state === "degraded").length,
      failing: states.filter((state) => state === "failing").length,
      unknown: states.filter((state) => state === "unknown").length,
    },
    total_checks: windowed.length,
    successful_checks: successful,
    failed_checks: windowed.length - successful,
    availability_percent: windowed.length ? Math.round((successful / windowed.length) * 10000) / 100 : 0.0,
    average_latency_ms: avg === null ? null : Math.round(avg * 100) / 100,
    degraded_threshold_ms: DEGRADED_THRESHOLD_MS,
    last_check_at: latestChecks.length
      ? latestChecks.map((check) => check.checked_at).sort().at(-1) ?? null
      : null,
  };
}

function bucketLabel(instant: number, granularity: "hour" | "day"): string {
  const date = new Date(instant);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  if (granularity === "day") return `${yyyy}-${mm}-${dd}T00:00:00+00:00`;
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00:00+00:00`;
}

export function demoTrend(
  dataset: DemoDataset,
  hours: number,
  endpointId?: number,
  requested: "auto" | "hour" | "day" = "auto",
): Trend {
  const granularity: "hour" | "day" = requested === "auto" ? (hours <= 48 ? "hour" : "day") : requested;
  const step = granularity === "hour" ? HOUR_MS : 24 * HOUR_MS;
  const start = windowStart(dataset, hours);
  const floored = new Date(start);
  floored.setUTCHours(granularity === "hour" ? floored.getUTCHours() : 0, 0, 0, 0);

  const buckets = new Map<string, TrendBucket>();
  for (let cursor = floored.getTime(); cursor <= dataset.now; cursor += step) {
    buckets.set(bucketLabel(cursor, granularity), {
      bucket_start: bucketLabel(cursor, granularity),
      total: 0,
      successful: 0,
      failed: 0,
      average_latency_ms: null,
    });
  }

  const grouped = new Map<string, { total: number; successful: number; latencies: number[] }>();
  for (const check of dataset.checks) {
    if (endpointId !== undefined && check.endpoint_id !== endpointId) continue;
    if (!inWindow(dataset, check, hours)) continue;
    const key = bucketLabel(Date.parse(check.checked_at), granularity);
    const entry = grouped.get(key) ?? { total: 0, successful: 0, latencies: [] };
    entry.total += 1;
    if (check.success) entry.successful += 1;
    if (check.latency_ms !== null) entry.latencies.push(check.latency_ms);
    grouped.set(key, entry);
  }

  for (const [key, entry] of grouped) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total = entry.total;
    bucket.successful = entry.successful;
    bucket.failed = entry.total - entry.successful;
    bucket.average_latency_ms = entry.latencies.length
      ? Math.round(
          (entry.latencies.reduce((sum, value) => sum + value, 0) / entry.latencies.length) * 100,
        ) / 100
      : null;
  }

  return {
    window: {
      hours,
      from: isoUtc(new Date(start)),
      to: isoUtc(new Date(dataset.now)),
    },
    granularity,
    endpoint_id: endpointId ?? null,
    buckets: [...buckets.values()],
  };
}

export function demoGlobalHistory(
  dataset: DemoDataset,
  params: { limit: number; offset: number; endpointId?: number; success?: boolean; hours?: number },
): { total: number; limit: number; offset: number; items: CheckItem[] } {
  const filtered = dataset.checks.filter((check) => {
    if (params.endpointId !== undefined && check.endpoint_id !== params.endpointId) return false;
    if (params.success !== undefined && check.success !== params.success) return false;
    if (params.hours !== undefined && !inWindow(dataset, check, params.hours)) return false;
    return true;
  });
  const items = filtered
    .slice(params.offset, params.offset + params.limit)
    .map((check) => ({
      id: check.id,
      endpoint_id: check.endpoint_id,
      endpoint_name: check.endpoint_name,
      endpoint_url: dataset.endpoints.find((endpoint) => endpoint.id === check.endpoint_id)?.url ?? "",
      checked_at: check.checked_at,
      status_code: check.status_code,
      latency_ms: check.latency_ms,
      success: check.success,
      error_type: check.error_type,
    }));
  return { total: filtered.length, limit: params.limit, offset: params.offset, items };
}

export function demoEndpointHistory(
  dataset: DemoDataset,
  endpointId: number,
  limit: number,
  offset: number,
): HistoryPage {
  const filtered = dataset.checks.filter((check) => check.endpoint_id === endpointId);
  return {
    endpoint_id: endpointId,
    total: filtered.length,
    limit,
    offset,
    items: filtered.slice(offset, offset + limit),
  };
}

export function demoReport(dataset: DemoDataset, endpointId: number, hours: number): Report {
  const windowed = dataset.checks.filter(
    (check) => check.endpoint_id === endpointId && inWindow(dataset, check, hours),
  );
  const successful = windowed.filter((check) => check.success).length;
  const measured = windowed.filter((check) => check.latency_ms !== null);
  const avg = measured.length
    ? measured.reduce((sum, check) => sum + (check.latency_ms ?? 0), 0) / measured.length
    : null;
  const times = windowed.map((check) => check.checked_at).sort();
  return {
    endpoint_id: endpointId,
    total_checks: windowed.length,
    successful_checks: successful,
    failed_checks: windowed.length - successful,
    availability_percent: windowed.length ? Math.round((successful / windowed.length) * 10000) / 100 : 0.0,
    average_latency_ms: avg === null ? null : Math.round(avg * 100) / 100,
    first_check_at: times[0] ?? null,
    last_check_at: times.at(-1) ?? null,
    window: {
      hours,
      from: isoUtc(new Date(windowStart(dataset, hours))),
      to: isoUtc(new Date(dataset.now)),
    },
  };
}
