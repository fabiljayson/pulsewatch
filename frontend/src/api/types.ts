/* ── API response types (mirrors app/schemas.py) ── */

export type HealthState = "healthy" | "degraded" | "failing" | "unknown";

export interface EndpointStatus {
  state: HealthState;
  checked_at: string | null;
  status_code: number | null;
  latency_ms: number | null;
  availability_percent: number | null;
  total_checks: number;
  window_hours: number;
  degraded_threshold_ms: number;
}

export interface Endpoint {
  id: number;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  status?: EndpointStatus | null;
}

export interface EndpointList {
  total: number;
  limit: number;
  offset: number;
  items: Endpoint[];
}

export interface EndpointCreate {
  name: string;
  url: string;
  is_active?: boolean;
}

export interface EndpointUpdate {
  name?: string;
  is_active?: boolean;
}

export interface CheckResult {
  id: number;
  endpoint_id: number;
  checked_at: string;
  status_code: number | null;
  latency_ms: number | null;
  success: boolean;
  error_type: string | null;
}

export interface CheckItem extends CheckResult {
  endpoint_name: string;
  endpoint_url: string;
}

export interface HistoryPage {
  endpoint_id: number;
  total: number;
  limit: number;
  offset: number;
  items: CheckResult[];
}

export interface GlobalHistoryPage {
  total: number;
  limit: number;
  offset: number;
  items: CheckItem[];
}

export interface ReportWindow {
  hours: number;
  from: string;
  to: string;
}

export interface Report {
  endpoint_id: number;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  availability_percent: number;
  average_latency_ms: number | null;
  first_check_at: string | null;
  last_check_at: string | null;
  window: ReportWindow;
}

export interface SummaryEndpoints {
  total: number;
  active: number;
  inactive: number;
  healthy: number;
  degraded: number;
  failing: number;
  unknown: number;
}

export interface Summary {
  window: ReportWindow;
  endpoints: SummaryEndpoints;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  availability_percent: number;
  average_latency_ms: number | null;
  degraded_threshold_ms: number;
  last_check_at: string | null;
}

export interface TrendBucket {
  bucket_start: string;
  total: number;
  successful: number;
  failed: number;
  average_latency_ms: number | null;
}

export interface Trend {
  window: ReportWindow;
  granularity: "hour" | "day";
  endpoint_id: number | null;
  buckets: TrendBucket[];
}

export interface Health {
  status: string;
  service: string;
  version: string;
}

export interface AuthStatus {
  enabled: boolean;
  username: string | null;
  version: string;
}

export interface LoginResponse {
  token: string;
  token_type: string;
  expires_in: number;
  username: string;
}

export interface CurrentUser {
  username: string;
}

export interface SchedulerStatus {
  enabled: boolean;
  interval_seconds: number;
  last_run_at: string | null;
  last_run_checked: number;
  next_run_at: string | null;
  total_checks: number;
}
