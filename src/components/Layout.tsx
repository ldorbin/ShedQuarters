import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { useSettings } from "../lib/settings";
import {
  DashboardIcon,
  InvoiceIcon,
  JobCardIcon,
  LogoutIcon,
  MenuIcon,
  QuoteIcon,
  SettingsIcon,
} from "./Icons";

export function Layout() {
  const { signOut } = useAuth();
  const { settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes, so a tap on mobile navigates
  // and gets out of the way in one action.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const businessName = settings?.businessName || "ShedQuarters";
  const initials = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="app-shell">
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">{initials || "SQ"}</span>
          <span className="brand-text">
            <strong>{businessName}</strong>
            <span>Workshop</span>
          </span>
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            <DashboardIcon />
            Dashboard
          </NavLink>

          <div className="nav-label">Documents</div>
          <NavLink to="/invoices">
            <InvoiceIcon />
            Invoices
          </NavLink>
          <NavLink to="/quotes">
            <QuoteIcon />
            Quotes
          </NavLink>
          <NavLink to="/job-cards">
            <JobCardIcon />
            Job cards
          </NavLink>

          <div className="nav-label">Workshop</div>
          <NavLink to="/settings">
            <SettingsIcon />
            Settings
          </NavLink>
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="btn btn-sm" onClick={() => void signOut()}>
            <LogoutIcon />
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <Outlet context={{ openMenu: () => setMenuOpen(true) }} />
      </div>
    </div>
  );
}

/** Page header bar; every page renders one so the mobile menu button is always present. */
export function TopBar({
  title,
  children,
  onOpenMenu,
}: {
  title: string;
  children?: React.ReactNode;
  onOpenMenu?: () => void;
}) {
  return (
    <header className="topbar">
      {onOpenMenu && (
        <button
          type="button"
          className="btn btn-icon btn-ghost menu-toggle"
          onClick={onOpenMenu}
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
      )}
      <h1>{title}</h1>
      {children && <div className="topbar-actions">{children}</div>}
    </header>
  );
}
