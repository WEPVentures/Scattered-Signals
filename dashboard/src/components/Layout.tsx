import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";

function initialsFromEmail(email: string | undefined): string {
  if (!email) return "?";
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0][0], parts[1][0]] : [name[0], name[1] ?? ""];
  return chars.join("").toUpperCase();
}

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session } = useAuth();
  const email = session?.user.email;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round">
              <path d="M4 18 L10 9 L14 14 L20 5" />
            </svg>
          </span>
          <span className="name">
            Nutgraph
            <small>Editorial desk</small>
          </span>
        </div>

        <div className="nav-section-label">Workspace</div>
        <ul className="nav-list">
          <li className={`nav-item ${location.pathname === "/" ? "active" : ""}`}>
            <Link to="/">
              <svg className="icon" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
              </svg>
              Dashboard
            </Link>
          </li>
          <li className={`nav-item ${location.pathname === "/research" ? "active" : ""}`}>
            <Link to="/research">
              <svg className="icon" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20.5 20.5 16 16" />
              </svg>
              Research a topic
            </Link>
          </li>
        </ul>

        <div className="sidebar-spacer" />

        <div className="account">
          <span className="avatar">{initialsFromEmail(email)}</span>
          <span className="who">
            <span className="name-line">{email ?? "Signed in"}</span>
            <span className="role-line">Editor</span>
          </span>
          <button type="button" title="Sign out" aria-label="Sign out" onClick={() => supabase.auth.signOut()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
