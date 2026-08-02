import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 24px",
          borderBottom: "1px solid #d2d2d7",
        }}
      >
        <Link to="/" style={{ fontWeight: 600, color: "#1d1d1f", textDecoration: "none" }}>
          Wake — Dashboard
        </Link>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          style={{ background: "none", border: "none", color: "#6e6e73", cursor: "pointer" }}
        >
          Sign out
        </button>
      </header>
      {children}
    </div>
  );
}
