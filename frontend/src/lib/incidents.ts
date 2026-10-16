/* ── Failure-event grouping derived from the global check log ── */

import type { CheckItem } from "../api/types";

/**
 * Failures for the same endpoint within this gap belong to one event. Two
 * hours keeps consecutive failing checks together for 30–60 minute check
 * intervals without merging unrelated outages days apart.
 */
export const EVENT_BURST_GAP_MS = 2 * 60 * 60 * 1000;

export interface CauseCount {
  errorType: string;
  count: number;
}

export interface FailureEvent {
  key: string;
  endpointId: number;
  endpointName: string;
  endpointUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  failures: number;
  causes: CauseCount[];
  dominantCause: string | null;
}

/** Tally error types, most frequent first, ties broken alphabetically. */
export function tallyCauses(checks: Pick<CheckItem, "error_type">[]): CauseCount[] {
  const counts = new Map<string, number>();
  for (const check of checks) {
    const key = check.error_type ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([errorType, count]) => ({ errorType, count })).sort(
    (a, b) => b.count - a.count || a.errorType.localeCompare(b.errorType),
  );
}

/**
 * Group failed checks into failure events, newest first. Checks must share the
 * same reporting window as the page; only failures should be passed in.
 */
export function deriveFailureEvents(checks: CheckItem[]): FailureEvent[] {
  const ordered = [...checks].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  const events: FailureEvent[] = [];
  const index = new Map<number, number>();

  for (const check of ordered) {
    const openIndex = index.get(check.endpoint_id);
    const previous = openIndex === undefined ? undefined : events[openIndex];
    const gap = previous
      ? Date.parse(check.checked_at) - Date.parse(previous.lastSeenAt)
      : Number.POSITIVE_INFINITY;

    if (previous && gap <= EVENT_BURST_GAP_MS) {
      previous.failures += 1;
      previous.lastSeenAt = check.checked_at;
      const cause = check.error_type ?? "unknown";
      const entry = previous.causes.find((item) => item.errorType === cause);
      if (entry) entry.count += 1;
      else previous.causes.push({ errorType: cause, count: 1 });
      previous.causes.sort((a, b) => b.count - a.count || a.errorType.localeCompare(b.errorType));
      previous.dominantCause = previous.causes[0].errorType;
      continue;
    }

    const causes = tallyCauses([check]);
    const event: FailureEvent = {
      key: `${check.endpoint_id}:${check.checked_at}`,
      endpointId: check.endpoint_id,
      endpointName: check.endpoint_name,
      endpointUrl: check.endpoint_url,
      firstSeenAt: check.checked_at,
      lastSeenAt: check.checked_at,
      failures: 1,
      causes,
      dominantCause: causes[0]?.errorType ?? null,
    };
    index.set(check.endpoint_id, events.length);
    events.push(event);
  }

  return events.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}
