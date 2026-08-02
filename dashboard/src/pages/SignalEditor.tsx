import { useEffect, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { formatClaimStatus, computeClusterCount, currentPremiseStrength } from "@scattered-signals/core";
import type { Signal } from "@scattered-signals/core";
import {
  listCategories,
  getSignal,
  listEvidence,
  getCurrentSignalUpdate,
  listConfidenceSnapshots,
  upsertSignal,
  replaceEvidence,
  addConfidenceSnapshot,
  upsertCurrentSignalUpdate,
  toCoreSignal,
  toCoreEvidence,
  getDraftSignal,
  listDraftEvidence,
  updateDraftSignalStatus,
  type CategoryRow,
  type SignalRow,
} from "../lib/db";
import { EvidenceEditor, type DraftEvidenceRow } from "../components/EvidenceEditor";
import { supabase } from "../lib/supabaseClient";
import { deleteSignal } from "../lib/deleteSignal";
import { startRefresh } from "../lib/research";
import { errorMessage } from "../lib/errorMessage";

const emptySignal: Partial<SignalRow> = {
  slug: "",
  title: "",
  type: "trend",
  is_top: false,
  homepage_meta: "",
  meta_description: "",
  confidence: "low",
  velocity: "steady",
  velocity_is_manual_override: false,
  claim_text: null,
  claim_resolves_around: null,
  claim_status: null,
  claim_outcome: null,
  claim_resolution_note: null,
  status: "draft",
  premise: null,
};

function toEditorEvidenceRow(e: {
  tier: DraftEvidenceRow["tier"];
  direction: DraftEvidenceRow["direction"];
  cluster_no: number;
  source_name: string;
  source_url: string | null;
  description: string;
  sort_order: number;
  source_published_at: string | null;
}): DraftEvidenceRow {
  return {
    tier: e.tier,
    direction: e.direction,
    cluster_no: e.cluster_no,
    source_name: e.source_name,
    source_url: e.source_url,
    description: e.description,
    sort_order: e.sort_order,
    source_published_at: e.source_published_at,
  };
}

const PREMISE_STRENGTH_LABEL: Record<Signal["confidence"], string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  collapsed: "Collapsed",
};

export function SignalEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const location = useLocation();
  // Set when arriving here from DraftReview's "Open in editor" button — a
  // new-topic draft prefills this otherwise-empty form; a refresh draft
  // (opened against an existing signal) gets its new evidence appended and
  // its suggested body copy substituted in as an editable starting point.
  const draftId = (location.state as { draftId?: string } | null)?.draftId ?? null;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [signal, setSignal] = useState<Partial<SignalRow>>(emptySignal);
  const [bodyCopy, setBodyCopy] = useState("");
  const [watchingText, setWatchingText] = useState("");
  const [evidenceRows, setEvidenceRows] = useState<DraftEvidenceRow[]>([]);
  const [previousConfidence, setPreviousConfidence] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listCategories().then(setCategories).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (isNew) {
        if (!draftId) return;
        const [draft, draftEvidence] = await Promise.all([
          getDraftSignal(draftId),
          listDraftEvidence(draftId),
        ]);
        if (cancelled) return;
        setSignal((prev) => ({
          ...prev,
          title: draft.proposed_title,
          slug: draft.proposed_slug ?? prev.slug,
          category_id: draft.proposed_category_id ?? prev.category_id,
          type: draft.proposed_type,
          homepage_meta: draft.proposed_homepage_meta ?? prev.homepage_meta,
          meta_description: draft.proposed_meta_description ?? prev.meta_description,
          premise: draft.proposed_premise,
          claim_text: draft.proposed_claim_text,
          claim_resolves_around: draft.proposed_claim_resolves_around,
        }));
        setBodyCopy(draft.proposed_body_copy);
        setWatchingText(draft.proposed_watching_text ?? "");
        setEvidenceRows(draftEvidence.map(toEditorEvidenceRow));
        return;
      }

      const [row, evRows, update, snaps] = await Promise.all([
        getSignal(id!),
        listEvidence(id!),
        getCurrentSignalUpdate(id!),
        listConfidenceSnapshots(id!),
      ]);
      if (cancelled) return;
      setSignal(row);
      setPreviousConfidence(row.confidence);
      setEvidenceRows(evRows.map(toEditorEvidenceRow));
      setBodyCopy(update?.body_copy ?? "");
      setWatchingText(update?.watching_text ?? "");
      if (snaps.length > 0) setPreviousConfidence(snaps[snaps.length - 1].confidence);

      if (draftId) {
        const [draft, draftEvidence] = await Promise.all([
          getDraftSignal(draftId),
          listDraftEvidence(draftId),
        ]);
        if (cancelled) return;
        setSignal((prev) => ({ ...prev, premise: draft.proposed_premise ?? prev.premise }));
        setBodyCopy(draft.proposed_body_copy);
        setEvidenceRows((prev) => [...prev, ...draftEvidence.map(toEditorEvidenceRow)]);
      }
    }

    load().catch((e) => setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [id, isNew, draftId]);

  // Live preview of what the public page will render — uses the exact same
  // formatClaimStatus() the static generator uses, so a broken/unattributed
  // resolution note surfaces here as an error, not after publishing.
  let claimPreviewError: string | null = null;
  let claimPreview: ReturnType<typeof formatClaimStatus> = null;
  if (signal.type === "claim" && signal.claim_status) {
    try {
      claimPreview = formatClaimStatus(toCoreSignal(signal as SignalRow, ""));
    } catch (e) {
      claimPreviewError = errorMessage(e);
    }
  }
  const coreEvidencePreview = evidenceRows.map((r, i) =>
    toCoreEvidence({ ...r, id: String(i), signal_id: "", created_at: "" }),
  );
  const clusterCount = computeClusterCount(coreEvidencePreview);
  const computedPremiseStrength = currentPremiseStrength(coreEvidencePreview);

  async function handleSave(publish: boolean) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // One complete upsert, not a full write followed by a partial
      // "just flip status" write — Supabase's upsert() builds a full
      // candidate row to validate against the table's constraints (NOT
      // NULL on slug, etc.), so a partial second write with only
      // {id, status, published_at} fails before it ever reaches the
      // ON CONFLICT update.
      const savedSignal = await upsertSignal({
        ...signal,
        id: isNew ? undefined : id,
        // Kept in sync with the computed value on every save — this column
        // is no longer hand-set, but stays a useful cached snapshot rather
        // than drifting from whatever it was initialized to.
        confidence: computedPremiseStrength,
        // Reopening a resolved claim (status switched back to Ongoing) clears
        // its outcome/note/resolved-date rather than leaving them stale —
        // the public page already ignores them once status isn't "resolved"
        // (formatClaimStatus branches on status alone), but a re-resolution
        // later should never risk inheriting a leftover value from before.
        ...(signal.claim_status !== "resolved"
          ? { claim_outcome: null, claim_resolution_note: null, claim_resolved_at: null }
          : {}),
        ...(publish ? { status: "published" as const, published_at: new Date().toISOString() } : {}),
      });

      await replaceEvidence(
        savedSignal.id,
        evidenceRows.map((r) => ({ ...r, signal_id: savedSignal.id })),
      );

      await upsertCurrentSignalUpdate({
        signal_id: savedSignal.id,
        // Category isn't included here — renderSignalPage already prepends
        // the live category label from the categories join, so baking it
        // into eyebrow_label too produced "Culture & Policy · Culture &
        // Policy · Updated ...".
        eyebrow_label: `Updated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
        published_at: new Date().toISOString(),
        body_copy: bodyCopy,
        watching_text: watchingText || null,
        confidence_at_time: savedSignal.confidence,
        velocity_at_time: savedSignal.velocity,
        claim_status_at_time: savedSignal.claim_status,
        claim_outcome_at_time: savedSignal.claim_outcome,
        claim_resolution_note_at_time: savedSignal.claim_resolution_note,
      });

      if (savedSignal.confidence !== previousConfidence) {
        await addConfidenceSnapshot({
          signal_id: savedSignal.id,
          confidence: savedSignal.confidence,
          note: null,
        });
        setPreviousConfidence(savedSignal.confidence);
      }

      if (publish) {
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch("/.netlify/functions/publish-signal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ signalId: savedSignal.id }),
        });
        if (!res.ok) throw new Error(`Publish trigger failed: ${await res.text()}`);
        setNotice("Published — the public site will rebuild in about a minute.");
      } else {
        setNotice("Saved as draft.");
      }

      if (draftId) {
        await updateDraftSignalStatus(draftId, "approved", { published_signal_id: savedSignal.id });
      }

      if (isNew) navigate(`/signals/${savedSignal.id}`, { replace: true });
      else setSignal(savedSignal);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    if (!confirm(`Delete "${signal.title}"? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSignal(id!);
      navigate("/signals", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  async function handleRefresh() {
    if (isNew) return;
    setRefreshing(true);
    setError(null);
    try {
      const topic = await startRefresh({ signalId: id!, signalTitle: signal.title ?? "" });
      navigate("/research", { state: { topicId: topic.id } });
    } catch (e) {
      setError(errorMessage(e));
      setRefreshing(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", fontSize: 14 }}>
      <h1 style={{ fontSize: 20 }}>{isNew ? "New topic" : signal.title}</h1>

      <label style={fieldStyle}>
        Title
        <input
          value={signal.title ?? ""}
          onChange={(e) => setSignal({ ...signal, title: e.target.value })}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Slug
        <input
          value={signal.slug ?? ""}
          onChange={(e) => setSignal({ ...signal, slug: e.target.value })}
          placeholder="ford-affordability-bet"
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Premise — one specific, falsifiable declarative sentence (not the title, not a question).
        Every evidence row's direction is judged against this exact sentence.
        <textarea
          value={signal.premise ?? ""}
          onChange={(e) => setSignal({ ...signal, premise: e.target.value })}
          rows={2}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Category
        <select
          value={signal.category_id ?? ""}
          onChange={(e) => setSignal({ ...signal, category_id: e.target.value })}
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
        Type
        <select
          value={signal.type}
          onChange={(e) =>
            setSignal({ ...signal, type: e.target.value as Signal["type"] })
          }
          style={inputStyle}
        >
          <option value="trend">Living Topic</option>
          <option value="claim">Bounded Claim</option>
        </select>
      </label>

      <label style={fieldStyle}>
        <input
          type="checkbox"
          checked={signal.is_top ?? false}
          onChange={(e) => setSignal({ ...signal, is_top: e.target.checked })}
        />{" "}
        Show in "Trending" tab
      </label>

      <label style={fieldStyle}>
        Homepage meta line (shown after the category, e.g. "Moderate
        evidence strength · Rising · 3 clusters · Claim ongoing, resolves Q1 2027")
        <input
          value={signal.homepage_meta ?? ""}
          onChange={(e) => setSignal({ ...signal, homepage_meta: e.target.value })}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Meta description (SEO, shown in search results)
        <input
          value={signal.meta_description ?? ""}
          onChange={(e) => setSignal({ ...signal, meta_description: e.target.value })}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Body copy
        <textarea
          value={bodyCopy}
          onChange={(e) => setBodyCopy(e.target.value)}
          rows={6}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        What we're watching
        <textarea
          value={watchingText}
          onChange={(e) => setWatchingText(e.target.value)}
          rows={2}
          style={inputStyle}
        />
      </label>

      <p style={{ fontSize: 13, color: "#6e6e73", margin: "0 0 4px 0" }}>
        Evidence Strength: <strong style={{ color: "#1d1d1f" }}>{PREMISE_STRENGTH_LABEL[computedPremiseStrength]}</strong> —
        computed automatically from your evidence (tier, direction, and source date). This is what
        the public page shows; there's nothing to set by hand.
      </p>

      <label style={fieldStyle}>
        Velocity
        <select
          value={signal.velocity}
          onChange={(e) => setSignal({ ...signal, velocity: e.target.value as Signal["velocity"] })}
          style={inputStyle}
        >
          <option value="rising">Rising</option>
          <option value="falling">Falling</option>
          <option value="steady">Steady</option>
        </select>
      </label>

      {signal.type === "claim" && (
        <fieldset style={{ marginTop: 16, border: "1px solid #d2d2d7", padding: 12 }}>
          <legend>Claim</legend>
          <label style={fieldStyle}>
            Claim text
            <textarea
              value={signal.claim_text ?? ""}
              onChange={(e) => setSignal({ ...signal, claim_text: e.target.value })}
              rows={2}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            Resolves around
            <input
              value={signal.claim_resolves_around ?? ""}
              onChange={(e) => setSignal({ ...signal, claim_resolves_around: e.target.value })}
              placeholder="~Q1 2027"
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            Status — if new evidence reopens a resolved claim, switch this back to Ongoing;
            the outcome and resolution note below are cleared automatically on save.
            <select
              value={signal.claim_status ?? ""}
              onChange={(e) =>
                setSignal({ ...signal, claim_status: (e.target.value || null) as Signal["claimStatus"] })
              }
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="pending">Ongoing</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          {signal.claim_status === "resolved" && (
            <>
              <label style={fieldStyle}>
                Outcome
                <select
                  value={signal.claim_outcome ?? ""}
                  onChange={(e) =>
                    setSignal({
                      ...signal,
                      claim_outcome: (e.target.value || null) as Signal["claimOutcome"],
                    })
                  }
                  style={inputStyle}
                >
                  <option value="">—</option>
                  <option value="hit">Confirmed</option>
                  <option value="missed">Disproven</option>
                  <option value="partial">Partial</option>
                </select>
              </label>
              <label style={fieldStyle}>
                Resolution note — must attribute the outcome to what actually happened
                (e.g. "Dismissed by federal prosecutors, July 31, 2026"). Never just
                "Resolved."
                <textarea
                  value={signal.claim_resolution_note ?? ""}
                  onChange={(e) => setSignal({ ...signal, claim_resolution_note: e.target.value })}
                  rows={2}
                  style={inputStyle}
                />
              </label>
            </>
          )}
          {claimPreviewError && (
            <p style={{ color: "#a6291e" }}>Preview error: {claimPreviewError}</p>
          )}
          {claimPreview && (
            <div style={{ border: "1px solid #d2d2d7", borderRadius: 8, padding: 12, marginTop: 8 }}>
              <strong>{claimPreview.label}</strong>
              <p>{claimPreview.claimText}</p>
              <p style={{ color: claimPreview.isMissed ? "#a6291e" : "#6e6e73" }}>
                {claimPreview.statusText}
              </p>
            </div>
          )}
        </fieldset>
      )}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Evidence</h2>
      <EvidenceEditor rows={evidenceRows} onChange={setEvidenceRows} />
      <p style={{ fontSize: 13, color: "#6e6e73" }}>Cluster count preview: {clusterCount}</p>

      {error && <p style={{ color: "#a6291e" }}>{error}</p>}
      {notice && <p style={{ color: "#2f7a4d" }}>{notice}</p>}

      <div style={{ marginTop: 24, display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" disabled={saving} onClick={() => handleSave(false)}>
            Save draft
          </button>
          <button type="button" disabled={saving} onClick={() => handleSave(true)}>
            Publish
          </button>
          {!isNew && (
            <button type="button" disabled={refreshing} onClick={handleRefresh}>
              {refreshing ? "Starting refresh…" : "Refresh from web"}
            </button>
          )}
        </div>
        {!isNew && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            style={{ color: "#a6291e", background: "none", border: "1px solid #a6291e", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}
          >
            {deleting ? "Deleting…" : "Delete topic"}
          </button>
        )}
      </div>
    </div>
  );
}

const fieldStyle: CSSProperties = { display: "block", marginBottom: 12 };
const inputStyle: CSSProperties = { display: "block", width: "100%", padding: 6, marginTop: 4 };
