import { Link, NavLink } from "react-router-dom";

import logo from "../../assets/logo-mark.png";
import { NAV_SECTIONS } from "../../routes";

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
  version?: string;
}

export function Sidebar({ open, onClose, version }: SidebarProps) {
  return (
    <aside
      className={open ? "sidebar open" : "sidebar"}
      id="app-sidebar"
      aria-label="Primary navigation"
    >
      <div className="sidebar__top">
        <Link to="/dashboard" className="sidebar__brand" onClick={onClose}>
          <img src={logo} alt="" className="sidebar__logo" />
          <span className="sidebar__brand-text">
            <span className="sidebar__name">PulseWatch</span>
            <span className="sidebar__tagline">API Health &amp; Reliability Observatory</span>
          </span>
        </Link>
        <button type="button" className="btn btn--ghost btn--sm sidebar__close" onClick={onClose}>
          <span aria-hidden="true">✕</span>
          <span className="sr-only">Close navigation</span>
        </button>
      </div>

      <nav aria-label="Main">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="sidebar__section">{section.label}</p>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                onClick={onClose}
              >
                <span className="nav-item__icon" aria-hidden="true">
                  {item.glyph}
                </span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        {version ? <span className="mono">v{version}</span> : <span>PulseWatch</span>}
      </div>
    </aside>
  );
}
