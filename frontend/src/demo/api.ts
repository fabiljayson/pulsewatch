/* ── Demo API: same interface as the live client, backed by sample data ── */

import { ApiError } from "../api/client";
import type { Endpoint, EndpointList, SchedulerStatus } from "../api/types";
import type { PulseWatchApi } from "../api/pulsewatch";
import {
  buildDemoDataset,
  demoEndpointHistory,
  demoGlobalHistory,
  demoReport,
  demoStatus,
  demoSummary,
  demoTrend,
} from "./dataset";

const READ_ONLY = "Sample data is read-only. Exit demo mode to manage endpoints.";

function respond<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 140 + Math.random() * 160));
}

function fail(status: number, message: string): Promise<never> {
  return new Promise((_resolve, reject) =>
    setTimeout(() => reject(new ApiError(status, message)), 160),
  );
}

function notFound(): Promise<never> {
  return fail(404, "Endpoint not found");
}

/** Build a fresh in-memory dataset; a new one is made each time demo mode starts. */
export function createDemoApi(http: Pick<PulseWatchApi, "health">): PulseWatchApi {
  const dataset = buildDemoDataset();

  const withStatus = (endpoint: Endpoint, hours: number): Endpoint => ({
    ...endpoint,
    status: demoStatus(dataset, endpoint, hours),
  });

  return {
    health: (signal) => http.health(signal),

    listEndpoints: (params = {}) => {
      const hours = params.hours ?? 24;
      const items = dataset.endpoints.map((endpoint) =>
        params.includeStatus ? withStatus(endpoint, hours) : { ...endpoint, status: null },
      );
      const page: EndpointList = {
        total: items.length,
        limit: params.limit ?? items.length,
        offset: params.offset ?? 0,
        items: items.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? items.length)),
      };
      return respond(page);
    },

    getEndpoint: (id, params = {}) => {
      const endpoint = dataset.endpoints.find((item) => item.id === id);
      if (!endpoint) return notFound();
      return respond(
        params.includeStatus
          ? withStatus(endpoint, params.hours ?? 24)
          : { ...endpoint, status: null },
      );
    },

    createEndpoint: () => fail(409, READ_ONLY),
    updateEndpoint: () => fail(409, READ_ONLY),
    deleteEndpoint: () => fail(409, READ_ONLY),
    runCheck: () => fail(409, READ_ONLY),

    endpointHistory: (id, params = {}) => {
      if (!dataset.endpoints.some((item) => item.id === id)) return notFound();
      return respond(demoEndpointHistory(dataset, id, params.limit ?? 20, params.offset ?? 0));
    },

    endpointReport: (id, params = {}) => {
      if (!dataset.endpoints.some((item) => item.id === id)) return notFound();
      return respond(demoReport(dataset, id, params.hours ?? 24));
    },

    globalHistory: (params = {}) =>
      respond(
        demoGlobalHistory(dataset, {
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
          endpointId: params.endpointId,
          success: params.success,
          hours: params.hours,
        }),
      ),

    summary: (params = {}) => respond(demoSummary(dataset, params.hours ?? 24)),

    trend: (params = {}) =>
      respond(demoTrend(dataset, params.hours ?? 24, params.endpointId, params.granularity ?? "auto")),

    scheduler: () =>
      respond<SchedulerStatus>({
        enabled: false,
        interval_seconds: 0,
        last_run_at: null,
        last_run_checked: 0,
        next_run_at: null,
        total_checks: 0,
      }),
  };
}
