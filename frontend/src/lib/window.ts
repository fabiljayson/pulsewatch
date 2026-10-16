/* ── Reporting-window presets shared by dashboard-style pages ── */

export interface WindowOption {
  value: number;
  label: string;
}

export const WINDOW_OPTIONS: WindowOption[] = [
  { value: 24, label: "24 hours" },
  { value: 168, label: "7 days" },
  { value: 720, label: "30 days" },
];

export const DEFAULT_WINDOW_HOURS = 24;
