import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) setError(error.message);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
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
        <form onSubmit={handleSubmit}>
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="banner error">{error}</div>}
          <button type="submit" className="btn primary" disabled={submitting} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
