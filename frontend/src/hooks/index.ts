/* ── Data-fetching hooks: cancellable resources and guarded actions ── */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client";

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetch a resource keyed by `keys` (a stable string, e.g. serialized params).
 *
 * Requests are aborted when the keys change or the component unmounts; while
 * refetching, previously loaded data stays visible so lists do not flash empty.
 */
export function useResource<T>(
  keys: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): Resource<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, caught instanceof Error ? caught.message : "Unexpected error"),
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, reloadToken, keys]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, error, loading, reload };
}

export interface Action<Args extends unknown[], R> {
  run: (...args: Args) => Promise<R | undefined>;
  busy: boolean;
}

/**
 * Wrap a mutation so it can only run once at a time (duplicate-submit guard).
 * Returns `undefined` when a call is rejected because another is in flight.
 */
export function useAction<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
): Action<Args, R> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fnRef.current(...args);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return { run, busy };
}

/** Debounce a rapidly-changing value (search boxes, filters). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Persisted browser preference (localStorage, safe on parse/write failure). */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage unavailable — keep the in-memory value */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}

/** Shared reporting-window preference (hours), used by dashboard-style pages. */
export function useWindowHours(): [number, (hours: number) => void] {
  const [hours, setHours] = useLocalStorage<number>("pulsewatch.windowHours", 24);
  return [hours, (next: number) => setHours(next)];
}

