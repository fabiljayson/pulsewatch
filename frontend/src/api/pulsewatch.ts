/* ── PulseWatch API surface: one interface, HTTP + demo implementations ── */

import { request } from "./client";
import type {
  CheckResult,
  Endpoint,
  EndpointCreate,
  EndpointList,
  EndpointUpdate,
  GlobalHistoryPage,
  Health,
  HistoryPage,
  Report,
  SchedulerStatus,
  Summary,
  Trend,
} from "./types";

export interface ListEndpointsParams {
  limit?: number;
  offset?: number;
  includeStatus?: boolean;
  hours?: number;
}

export interface GetEndpointParams {
  includeStatus?: boolean;
  hours?: number;
}

export interface EndpointHistoryParams {
  limit?: number;
  offset?: number;
}

export interface ReportParams {
  hours?: number;
}

export interface GlobalHistoryParams {
  limit?: number;
  offset?: number;
  endpointId?: number;
  success?: boolean;
  hours?: number;
}

export interface WindowParams {
  hours?: number;
}

export interface TrendParams extends WindowParams {
  endpointId?: number;
  granularity?: "auto" | "hour" | "day";
}

/**
 * Every backend capability the UI depends on. The HTTP client implements it
 * against the live API; the demo implementation serves clearly-labelled
 * sample data with identical shapes.
 */
export interface PulseWatchApi {
  health(signal?: AbortSignal): Promise<Health>;
  listEndpoints(params?: ListEndpointsParams, signal?: AbortSignal): Promise<EndpointList>;
  getEndpoint(id: number, params?: GetEndpointParams, signal?: AbortSignal): Promise<Endpoint>;
  createEndpoint(payload: EndpointCreate): Promise<Endpoint>;
  updateEndpoint(id: number, payload: EndpointUpdate): Promise<Endpoint>;
  deleteEndpoint(id: number): Promise<void>;
  runCheck(id: number): Promise<CheckResult>;
  endpointHistory(
    id: number,
    params?: EndpointHistoryParams,
    signal?: AbortSignal,
  ): Promise<HistoryPage>;
  endpointReport(id: number, params?: ReportParams, signal?: AbortSignal): Promise<Report>;
  globalHistory(
    params?: GlobalHistoryParams,
    signal?: AbortSignal,
  ): Promise<GlobalHistoryPage>;
  summary(params?: WindowParams, signal?: AbortSignal): Promise<Summary>;
  trend(params?: TrendParams, signal?: AbortSignal): Promise<Trend>;
  scheduler(signal?: AbortSignal): Promise<SchedulerStatus>;
}

export function createHttpApi(): PulseWatchApi {
  return {
    health: (signal) => request<Health>("/health", { signal }),

    listEndpoints: (params = {}, signal) =>
      request<EndpointList>("/api/v1/endpoints", {
        signal,
        query: {
          limit: params.limit,
          offset: params.offset,
          include_status: params.includeStatus ? "true" : undefined,
          hours: params.includeStatus ? params.hours : undefined,
        },
      }),

    getEndpoint: (id, params = {}, signal) =>
      request<Endpoint>(`/api/v1/endpoints/${id}`, {
        signal,
        query: {
          include_status: params.includeStatus ? "true" : undefined,
          hours: params.includeStatus ? params.hours : undefined,
        },
      }),

    createEndpoint: (payload) =>
      request<Endpoint>("/api/v1/endpoints", { method: "POST", body: payload }),

    updateEndpoint: (id, payload) =>
      request<Endpoint>(`/api/v1/endpoints/${id}`, { method: "PATCH", body: payload }),

    deleteEndpoint: (id) => request<void>(`/api/v1/endpoints/${id}`, { method: "DELETE" }),

    runCheck: (id) => request<CheckResult>(`/api/v1/endpoints/${id}/check`, { method: "POST" }),

    endpointHistory: (id, params = {}, signal) =>
      request<HistoryPage>(`/api/v1/endpoints/${id}/history`, {
        signal,
        query: { limit: params.limit, offset: params.offset },
      }),

    endpointReport: (id, params = {}, signal) =>
      request<Report>(`/api/v1/endpoints/${id}/report`, {
        signal,
        query: { hours: params.hours },
      }),

    globalHistory: (params = {}, signal) =>
      request<GlobalHistoryPage>("/api/v1/history", {
        signal,
        query: {
          limit: params.limit,
          offset: params.offset,
          endpoint_id: params.endpointId,
          success: params.success === undefined ? undefined : String(params.success),
          hours: params.hours,
        },
      }),

    summary: (params = {}, signal) =>
      request<Summary>("/api/v1/summary", { signal, query: { hours: params.hours } }),

    trend: (params = {}, signal) =>
      request<Trend>("/api/v1/trend", {
        signal,
        query: {
          hours: params.hours,
          endpoint_id: params.endpointId,
          granularity: params.granularity,
        },
      }),

    scheduler: (signal) => request<SchedulerStatus>("/api/v1/scheduler", { signal }),
  };
}
