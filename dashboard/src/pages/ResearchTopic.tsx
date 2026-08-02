import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  listCategories,
  getResearchTopic,
  getDraftSignalByTopicId,
  getLatestResearchRun,
  type CategoryRow,
} from "../lib/db";
import { startResearch } from "../lib/research";
import { errorMessage } from "../lib/errorMessage";

const POLL_INTERVAL_MS = 4000;

export function ResearchTopic() {
  const navigate = useNavigate();
  const location = useLocation();
  // Set when arriving here from a "Refresh" button — that flow already
  // created its own research_topics row and kicked off the background
  // function, so this page just needs to resume polling it rather than
  // show the "start a new topic" form.
  const resumeTopicId = (location.state as { topicId?: string } | null)?.topicId ?? null;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [topicText, setTopicText] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryHint, setCategoryHint] = useState("");
  const [typeHint, setTypeHint] = useState<"" | "trend" | "claim">("");
  const [topicId, setTopicId] = useState<string | null>(resumeTopicId);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listCategories().then(setCategories).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (!topicId) return;

    async function poll() {
      try {
        const topic = await getResearchTopic(topicId!);
        setStatus(topic.status);
        if (topic.status === "draft_ready") {
          if (pollRef.current) clearInterval(pollRef.current);
          const draft = await getDraftSignalByTopicId(topicId!);
          if (draft) navigate(`/drafts/${draft.id}`);
        } else if (topic.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          const run = await getLatestResearchRun(topicId!);
          setError(run?.error_message ?? "Research failed for an unknown reason.");
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [topicId, navigate]);

  async function handleStart() {
    if (!topicText.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const topic = await startResearch({
        topicText: topicText.trim(),
        notes: notes.trim() || null,
        categoryHint: categoryHint || null,
        typeHint: typeHint || null,
      });
      setTopicId(topic.id);
      setStatus(topic.status);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", fontSize: 14 }}>
      <h1 style={{ fontSize: 20 }}>{resumeTopicId ? "Refreshing signal" : "Research a new topic"}</h1>
      {!resumeTopicId && (
        <p style={{ color: "#6e6e73" }}>
          Describe what you want researched, in your own words — the same way you'd ask in this chat.
          A background job will search for real, dated sources, then bring back a draft signal (and a
          Substack article draft) for you to review.
        </p>
      )}

      {!topicId && (
        <>
          <label style={fieldStyle}>
            Topic
            <textarea
              value={topicText}
              onChange={(e) => setTopicText(e.target.value)}
              placeholder='e.g. "Did Mayor Mamdani&#39;s budget proposal balance the budget?"'
              rows={3}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Additional context (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Category hint (optional)
            <select
              value={categoryHint}
              onChange={(e) => setCategoryHint(e.target.value)}
              style={inputStyle}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            Type hint (optional)
            <select
              value={typeHint}
              onChange={(e) => setTypeHint(e.target.value as "" | "trend" | "claim")}
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="trend">Long-running trend</option>
              <option value="claim">Bounded claim</option>
            </select>
          </label>

          {error && <p style={{ color: "#a6291e" }}>{error}</p>}

          <button type="button" disabled={starting || !topicText.trim()} onClick={handleStart}>
            {starting ? "Starting…" : "Start research"}
          </button>
        </>
      )}

      {topicId && (
        <div style={{ marginTop: 16 }}>
          <p>
            Status: <strong>{status ?? "queued"}</strong>
          </p>
          {(status === "queued" || status === "researching") && (
            <p style={{ color: "#6e6e73" }}>
              Researching — this can take a few minutes. Feel free to leave this page; the draft
              will be waiting in the signal list when it's ready.
            </p>
          )}
          {error && <p style={{ color: "#a6291e" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = { display: "block", marginBottom: 12 };
const inputStyle: CSSProperties = { display: "block", width: "100%", padding: 6, marginTop: 4 };
