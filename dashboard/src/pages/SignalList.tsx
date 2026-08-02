import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listSignals,
  listPendingDraftSignals,
  listOpenResearchTopics,
  type SignalRow,
  type DraftSignalRow,
  type ResearchTopicRow,
} from "../lib/db";
import { deleteSignal } from "../lib/deleteSignal";
import { startRefresh } from "../lib/research";
import { errorMessage } from "../lib/errorMessage";

const POLL_INTERVAL_MS = 5000;

export function SignalList() {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<SignalRow[] | null>(null);
  const [drafts, setDrafts] = useState<DraftSignalRow[]>([]);
  const [openTopics, setOpenTopics] = useState<ResearchTopicRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    listSignals()
      .then(setSignals)
      .catch((e) => setError(errorMessage(e)));

    function pollResearch() {
      listPendingDraftSignals()
        .then(setDrafts)
        .catch((e) => setError(errorMessage(e)));
      listOpenResearchTopics()
        .then(setOpenTopics)
        .catch((e) => setError(errorMessage(e)));
    }

    pollResearch();
    const interval = setInterval(pollResearch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function handleDelete(s: SignalRow) {
    if (!confirm(`Delete "${s.title}"? This can't be undone.`)) return;
    setDeletingId(s.id);
    setError(null);
    try {
      await deleteSignal(s.id);
      setSignals((prev) => prev?.filter((row) => row.id !== s.id) ?? prev);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRefresh(s: SignalRow) {
    setRefreshingId(s.id);
    setError(null);
    try {
      const topic = await startRefresh({ signalId: s.id, signalTitle: s.title });
      navigate("/research", { state: { topicId: topic.id } });
    } catch (e) {
      setError(errorMessage(e));
      setRefreshingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Topics</h1>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/research">+ Research new topic</Link>
        </div>
      </div>
      {error && <p style={{ color: "#a6291e" }}>{error}</p>}

      {openTopics.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15, color: "#6e6e73" }}>Research in progress ({openTopics.length})</h2>
          <ul style={{ paddingLeft: 20 }}>
            {openTopics.map((t) => (
              <li key={t.id}>
                <Link to="/research" state={{ topicId: t.id }}>
                  {t.topic_text}
                </Link>{" "}
                <span style={{ color: t.status === "failed" ? "#a6291e" : "#6e6e73" }}>— {t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {drafts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15, color: "#6e6e73" }}>Drafts pending review ({drafts.length})</h2>
          <ul style={{ paddingLeft: 20 }}>
            {drafts.map((d) => (
              <li key={d.id}>
                <Link to={`/drafts/${d.id}`}>
                  {d.published_signal_id ? "Refresh: " : ""}
                  {d.proposed_title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!signals && !error && <p>Loading…</p>}
      {signals && signals.length === 0 && <p>No topics yet.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 14 }}>
        <tbody>
          {signals?.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "8px 0" }}>
                <Link to={`/signals/${s.id}`}>{s.title}</Link>
              </td>
              <td style={{ color: "#6e6e73" }}>{s.type}</td>
              <td style={{ color: "#6e6e73" }}>{s.status}</td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  disabled={refreshingId === s.id}
                  onClick={() => handleRefresh(s)}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {refreshingId === s.id ? "Starting…" : "Refresh"}
                </button>
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  disabled={deletingId === s.id}
                  onClick={() => handleDelete(s)}
                  style={{ color: "#a6291e", background: "none", border: "none", cursor: "pointer" }}
                >
                  {deletingId === s.id ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
