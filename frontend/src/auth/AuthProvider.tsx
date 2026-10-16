import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  UNAUTHORIZED_EVENT,
  fetchAuthStatus,
  fetchCurrentUser,
  login as requestLogin,
  logout as requestLogout,
} from "../api/client";
import type { AuthStatus } from "../api/types";

interface AuthContextValue {
  status: AuthStatus | null;
  user: string | null;
  ready: boolean;
  error: ApiError | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError(null);
    setUser(null);

    fetchAuthStatus(controller.signal)
      .then(async (authStatus) => {
        if (cancelled) return;
        setStatus(authStatus);
        if (!authStatus.enabled) return;
        try {
          const current = await fetchCurrentUser(controller.signal);
          if (!cancelled) setUser(current.username);
        } catch (caught) {
          if (!cancelled && !(caught instanceof ApiError && caught.isUnauthorized)) {
            setError(caught instanceof ApiError ? caught : null);
          }
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, caught instanceof Error ? caught.message : "Authentication status unavailable"),
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await requestLogin(username, password);
    setUser(response.username);
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } finally {
      setUser(null);
    }
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, ready: status !== null || error !== null, error, login, logout, retry }),
    [status, user, error, login, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
