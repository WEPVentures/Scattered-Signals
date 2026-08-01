import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSignals, type SignalRow } from "../lib/db";

export function SignalList() {
  const [signals, setSignals] = useState<SignalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSignals()
      .then(setSignals)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Signals</h1>
        <Link to="/signals/new">+ New signal</Link>
      </div>
      {error && <p style={{ color: "#a6291e" }}>{error}</p>}
      {!signals && !error && <p>Loading…</p>}
      {signals && signals.length === 0 && <p>No signals yet.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 14 }}>
        <tbody>
          {signals?.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "8px 0" }}>
                <Link to={`/signals/${s.id}`}>{s.title}</Link>
              </td>
              <td style={{ color: "#6e6e73" }}>{s.type}</td>
              <td style={{ color: "#6e6e73" }}>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
