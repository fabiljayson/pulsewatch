/* ── Navigation registry and page titles ── */

export interface NavItem {
  to: string;
  label: string;
  glyph: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Sections only list routes that exist today; add items as pages land. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      { to: "/dashboard", label: "Overview", glyph: "◈" },
      { to: "/endpoints", label: "Endpoints", glyph: "☰" },
      { to: "/history", label: "History", glyph: "◷" },
    ],
  },
  {
    label: "Analyze",
    items: [
      { to: "/analytics", label: "Reliability analytics", glyph: "◔" },
      { to: "/reports", label: "Reports", glyph: "▤" },
      { to: "/incidents", label: "Failure events", glyph: "⚠" },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", glyph: "⚙" },
      { to: "/about", label: "About", glyph: "ℹ" },
    ],
  },
];

const TITLES: [string, string][] = [
  ["/dashboard", "Overview"],
  ["/endpoints/new", "Register endpoint"],
  ["/endpoints", "Endpoints"],
  ["/history", "Monitoring history"],
  ["/analytics", "Reliability analytics"],
  ["/reports", "Reports"],
  ["/incidents", "Failure events"],
  ["/settings", "Settings"],
  ["/about", "About"],
  ["/login", "Sign in"],
];

/** Topbar/breadcrumb title for the current path (endpoint detail included). */
export function pageTitleFor(pathname: string): string {
  if (/^\/endpoints\/\d+$/.test(pathname)) return "Endpoint details";
  for (const [prefix, title] of TITLES) {
    if (pathname === prefix) return title;
  }
  if (pathname === "/") return "PulseWatch";
  return "Not found";
}
