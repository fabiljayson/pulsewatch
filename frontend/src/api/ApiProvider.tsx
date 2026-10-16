import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";

import { useLocalStorage } from "../hooks";
import { createDemoApi } from "../demo/api";
import { createHttpApi, type PulseWatchApi } from "./pulsewatch";

interface ApiContextValue {
  api: PulseWatchApi;
  demo: boolean;
  setDemo: (demo: boolean) => void;
}

const ApiContext = createContext<ApiContextValue | null>(null);

/**
 * Supplies the data layer. When demo mode is on, the same interface is served
 * from in-memory sample data so every page behaves identically; mutations are
 * rejected with a clear read-only message.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useLocalStorage<boolean>("pulsewatch.demo", false);
  const http = useMemo(() => createHttpApi(), []);
  const api = useMemo(() => (demo ? createDemoApi(http) : http), [demo, http]);

  const value = useMemo<ApiContextValue>(
    () => ({ api, demo, setDemo: (next: boolean) => setDemo(next) }),
    [api, demo, setDemo],
  );

  return <ApiContext.Provider value={value}><Fragment key={demo ? "demo" : "live"}>{children}</Fragment></ApiContext.Provider>;
}

export function useApiContext(): ApiContextValue {
  const context = useContext(ApiContext);
  if (!context) throw new Error("useApiContext must be used inside <ApiProvider>");
  return context;
}

export function useApi(): PulseWatchApi {
  return useApiContext().api;
}
