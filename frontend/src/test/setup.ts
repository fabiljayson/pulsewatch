import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

try {
  window.localStorage.setItem("pulsewatch.probe", "1");
  window.localStorage.removeItem("pulsewatch.probe");
} catch {
  (window as unknown as Record<string, unknown>).localStorage = new MemoryStorage();
}
if (typeof window.localStorage?.getItem !== "function") {
  (window as unknown as Record<string, unknown>).localStorage = new MemoryStorage();
}

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* storage unavailable in this environment */
  }
});

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in window)) {
  (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

if (!("fetch" in window) || typeof window.fetch !== "function") {
  window.fetch = vi.fn(() =>
    Promise.reject(new TypeError("fetch is not stubbed in this test")),
  ) as unknown as typeof fetch;
}
