/* ── Formatting helpers (locale-aware, null-safe) ── */

import type { HealthState } from "../api/types";

const EMPTY = "—";

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDateTimeSeconds(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds || unit === "second") {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return EMPTY;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return EMPTY;
  if (ms >= 100_000) return `${(ms / 1000).toFixed(0)} s`;
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return EMPTY;
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatInterval(seconds: number): string {
  if (seconds <= 0) return "disabled";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? "every hour" : `every ${hours} hours`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? "every minute" : `every ${minutes} minutes`;
  }
  if (seconds < 60) return seconds === 1 ? "every second" : `every ${seconds} seconds`;
  return `every ${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function formatWindow(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "last 24 hours" : `last ${days} days`;
  }
  if (hours < 48) return `last ${hours} hours`;
  return `last ${Math.round(hours / 24)} days`;
}

const ERROR_LABELS: Record<string, string> = {
  timeout: "Timeout",
  connection_error: "Connection error",
  dns_error: "DNS failure",
  invalid_response: "Invalid response",
  blocked_destination: "Blocked destination",
  too_many_redirects: "Too many redirects",
  transport_error: "Transport error",
  http_error: "HTTP error",
};

export function errorLabel(errorType: string | null | undefined): string {
  if (!errorType) return EMPTY;
  return ERROR_LABELS[errorType] ?? errorType;
}

export function statusExplanation(state: HealthState, windowHours: number): string {
  const window = formatWindow(windowHours);
  switch (state) {
    case "healthy":
      return `Latest check succeeded within ${window}.`;
    case "degraded":
      return `Latest check succeeded but was slower than the degraded threshold.`;
    case "failing":
      return `Latest check failed.`;
    case "unknown":
      return `No check has been recorded yet — health is unknown, not healthy.`;
    default:
      return `Derived over ${window}.`;
  }
}
