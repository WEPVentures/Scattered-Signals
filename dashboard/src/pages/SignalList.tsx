import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { currentStatusWord } from "@scattered-signals/core";
import {
  listSignals,
  listPendingDraftSignals,
  listOpenResearchTopics,
  archiveResearchTopic,
  toCoreSignal,
  type SignalRow,
  type DraftSignalRow,
  type ResearchTopicRow,
} from "../lib/db";
import { deleteSignal } from "../lib/deleteSignal";
import { startRefresh, isResearchTopicStale } from "../lib/research";
import { errorMessage } from "../lib/errorMessage";

const POLL_INTERVAL_MS = 5000;

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function statusPillClass(word: string): string {
  if (word === "Disproven") return "status-bad";
  if (word === "Confirmed") return "status-good";
  if (word === "Partial") return "status-warn";
  if (word === "Rising") return "status-good";
  if (word === "Falling") return "status-warn";
  return "status-ongoing"; // Ongoing, Steady
}

export function SignalList() {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<SignalRow[] | null>(null);
  const [drafts, setDrafts] = useState<DraftSignalRow[]>([]);
  const [openTopics, setOpenTopics] = useState<ResearchTopicRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

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

  async function handleCancelTopic(t: ResearchTopicRow) {
    if (!confirm(`Cancel "${t.topic_text}"? It looks stuck and won't be retried automatically.`)) return;
    setCancelingId(t.id);
    setError(null);
    try {
      await archiveResearchTopic(t.id);
      setOpenTopics((prev) => prev.filter((row) => row.id !== t.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCancelingId(null);
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

  const publishedCount = signals?.filter((s) => s.status === "published").length ?? 0;
  const livingCount = signals?.filter((s) => s.type === "trend").length ?? 0;
  const boundedCount = signals?.filter((s) => s.type === "claim").length ?? 0;
  const oldestDraftLabel =
    drafts.length > 0 ? `oldest waiting ${timeAgo(drafts[drafts.length - 1].created_at)}` : "none waiting";
  const failedTopicsCount = openTopics.filter((t) => t.status === "failed").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1>Dashboard</h1>
        </div>
        <Link to="/research" className="btn primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Research a topic
        </Link>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Published topics</div>
          <div className="stat-number">{publishedCount}</div>
          <div className="stat-sub">
            {livingCount} living · {boundedCount} bounded
          </div>
        </div>
        <div className={`stat-card ${drafts.length > 0 ? "warn" : ""}`}>
          <div className="stat-label">Drafts pending review</div>
          <div className="stat-number">{drafts.length}</div>
          <div className="stat-sub">{oldestDraftLabel}</div>
        </div>
        <div className={`stat-card ${failedTopicsCount > 0 ? "warn" : ""}`}>
          <div className="stat-label">Research in progress</div>
          <div className="stat-number">{openTopics.length}</div>
          <div className="stat-sub">{failedTopicsCount > 0 ? `${failedTopicsCount} failed` : "nothing stuck"}</div>
        </div>
      </div>

      {openTopics.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h3>Research in progress</h3>
          </div>
          <div className="topic-list">
            {openTopics.map((t) => {
              const stale = isResearchTopicStale(t);
              return (
                <div className="topic-row" key={t.id}>
                  <div className="title-block">
                    <Link to="/research" state={{ topicId: t.id }}>
                      {t.topic_text}
                    </Link>
                    <div className="sub">
                      {t.status}
                      {stale ? " · looks stuck, no update in a while" : ""}
                    </div>
                  </div>
                  {stale && (
                    <button type="button" className="btn danger" disabled={cancelingId === t.id} onClick={() => handleCancelTopic(t)}>
                      {cancelingId === t.id ? "Canceling…" : "Cancel"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h3>Drafts pending review</h3>
          </div>
          <div className="topic-list">
            {drafts.map((d) => (
              <div className="topic-row" key={d.id}>
                <div className="title-block">
                  <Link to={`/drafts/${d.id}`}>{d.proposed_title}</Link>
                  <div className="sub">{d.published_signal_id ? "Refresh of a published topic" : "New topic"}</div>
                </div>
                <span className="pill type-trend">
                  {d.published_signal_id ? "Refresh" : "New"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h3>Topics</h3>
        </div>
        {!signals && !error && <div className="topic-list"><div className="empty-note">Loading…</div></div>}
        {signals && signals.length === 0 && (
          <div className="topic-list">
            <div className="empty-note">No topics yet — start one from "Research a topic."</div>
          </div>
        )}
        {signals && signals.length > 0 && (
          <div className="topic-list">
            {signals.map((s) => {
              const statusWord = currentStatusWord(toCoreSignal(s, ""));
              return (
                <div className="topic-row" key={s.id}>
                  <div className="title-block">
                    <Link to={`/signals/${s.id}`}>{s.title}</Link>
                    <div className="sub">
                      Updated {timeAgo(s.updated_at)}
                      {s.status !== "published" ? ` · ${s.status}` : ""}
                    </div>
                  </div>
                  <span className={`pill ${s.type === "trend" ? "type-trend" : "type-claim"}`}>
                    {s.type === "trend" ? "Living" : "Bounded"}
                  </span>
                  <span className={`pill ${statusPillClass(statusWord)}`}>{statusWord}</span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Refresh with AI"
                      aria-label="Refresh with AI"
                      disabled={refreshingId === s.id}
                      onClick={() => handleRefresh(s)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-3-6.7" />
                        <path d="M21 3v6h-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Delete"
                      aria-label="Delete"
                      disabled={deletingId === s.id}
                      onClick={() => handleDelete(s)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16" />
                        <path d="M9 7V4.5h6V7" />
                        <path d="M6 7l1 13h10l1-13" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="callout">
        <div className="eyebrow">Two ways to add evidence</div>
        <h4>Keeping a published topic current</h4>
        <ol>
          <li>
            <b>Add it yourself</b> — free, instant. Open the topic, paste in the new source, done. Use this
            whenever you already have the article in hand.
          </li>
          <li>
            <b>Refresh with AI</b> — costs API credit, takes a few minutes. Use this when you want the desk
            to go find what's new on its own.
          </li>
        </ol>
      </div>
    </div>
  );
}
