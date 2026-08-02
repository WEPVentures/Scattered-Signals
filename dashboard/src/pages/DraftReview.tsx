import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDraftSignal,
  listDraftEvidence,
  listCategories,
  updateDraftSignalStatus,
  type DraftSignalRow,
  type DraftEvidenceRow,
  type CategoryRow,
} from "../lib/db";
import { errorMessage } from "../lib/errorMessage";

export function DraftReview() {
  const { draftId } = useParams();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<DraftSignalRow | null>(null);
  const [evidence, setEvidence] = useState<DraftEvidenceRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    Promise.all([getDraftSignal(draftId), listDraftEvidence(draftId), listCategories()])
      .then(([d, e, c]) => {
        setDraft(d);
        setEvidence(e);
        setCategories(c);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [draftId]);

  async function handleReject() {
    if (!draft) return;
    const reason = prompt("Why are you rejecting this draft? (optional)") ?? "";
    setRejecting(true);
    try {
      await updateDraftSignalStatus(draft.id, "rejected", { rejection_reason: reason || undefined });
      navigate("/");
    } catch (e) {
      setError(errorMessage(e));
      setRejecting(false);
    }
  }

  function handleOpenInEditor() {
    if (!draft) return;
    if (draft.published_signal_id) {
      navigate(`/signals/${draft.published_signal_id}`, { state: { draftId: draft.id } });
    } else {
      navigate("/signals/new", { state: { draftId: draft.id } });
    }
  }

  async function handleCopySubstack() {
    if (!draft?.proposed_substack_article) return;
    await navigator.clipboard.writeText(draft.proposed_substack_article);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
        <p style={{ color: "#a6291e" }}>{error}</p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
        <p>Loading…</p>
      </div>
    );
  }

  const categoryLabel = categories.find((c) => c.id === draft.proposed_category_id)?.label ?? "—";

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", fontSize: 14 }}>
      <p style={{ color: "#6e6e73", marginBottom: 4 }}>
        {draft.published_signal_id ? "Refresh draft" : "New topic draft"} · {categoryLabel} ·{" "}
        {draft.proposed_type} · {draft.status}
      </p>
      <h1 style={{ fontSize: 22 }}>{draft.proposed_title}</h1>

      <h2 style={{ fontSize: 15, color: "#6e6e73", marginTop: 20 }}>Premise</h2>
      <p>{draft.proposed_premise}</p>

      <h2 style={{ fontSize: 15, color: "#6e6e73", marginTop: 20 }}>Body copy</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{draft.proposed_body_copy}</p>

      {draft.proposed_watching_text && (
        <>
          <h2 style={{ fontSize: 15, color: "#6e6e73", marginTop: 20 }}>What we're watching</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{draft.proposed_watching_text}</p>
        </>
      )}

      {draft.proposed_claim_text && (
        <>
          <h2 style={{ fontSize: 15, color: "#6e6e73", marginTop: 20 }}>Claim</h2>
          <p>{draft.proposed_claim_text}</p>
          {draft.proposed_claim_resolves_around && (
            <p style={{ color: "#6e6e73" }}>Resolves around {draft.proposed_claim_resolves_around}</p>
          )}
        </>
      )}

      <h2 style={{ fontSize: 15, color: "#6e6e73", marginTop: 24 }}>
        Evidence ({evidence.length}) — computed Premise Strength: {draft.proposed_confidence}
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #d2d2d7" }}>
            <th style={{ padding: "4px 4px" }}>Tier</th>
            <th>Direction</th>
            <th>Source</th>
            <th>Description</th>
            <th>AI rationale</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((e) => (
            <tr key={e.id} style={{ borderBottom: "1px solid #f0f0f0", verticalAlign: "top" }}>
              <td style={{ padding: "6px 4px" }}>{e.tier}</td>
              <td>{e.direction}</td>
              <td>
                {e.source_url ? (
                  <a href={e.source_url} target="_blank" rel="noreferrer">
                    {e.source_name}
                  </a>
                ) : (
                  e.source_name
                )}
              </td>
              <td>{e.description}</td>
              <td style={{ color: "#6e6e73" }}>{e.ai_tier_rationale}</td>
              <td style={{ color: "#6e6e73" }}>{e.source_published_at ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {draft.proposed_substack_article && (
        <>
          <h2 style={{ fontSize: 15, color: "#6e6e73", marginTop: 24 }}>
            Substack article draft (copy/paste into Substack yourself)
          </h2>
          <textarea
            readOnly
            value={draft.proposed_substack_article}
            rows={16}
            style={{ width: "100%", padding: 8, fontFamily: "monospace", fontSize: 12 }}
          />
          <button type="button" onClick={handleCopySubstack} style={{ marginTop: 8 }}>
            {copied ? "Copied!" : "Copy article to clipboard"}
          </button>
        </>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button type="button" onClick={handleOpenInEditor}>
          Open in editor
        </button>
        <button
          type="button"
          disabled={rejecting}
          onClick={handleReject}
          style={{
            color: "#a6291e",
            background: "none",
            border: "1px solid #a6291e",
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          {rejecting ? "Rejecting…" : "Reject draft"}
        </button>
      </div>
    </div>
  );
}
