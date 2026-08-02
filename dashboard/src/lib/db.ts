import { supabase } from "./supabaseClient";
import type { Signal, Evidence, ConfidenceSnapshot } from "@scattered-signals/core";

// Raw Supabase row shapes (snake_case, matching the SQL schema).

export interface CategoryRow {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}

export interface SignalRow {
  id: string;
  slug: string;
  title: string;
  category_id: string;
  type: "trend" | "claim";
  is_top: boolean;
  homepage_meta: string;
  meta_description: string;
  confidence: Signal["confidence"];
  velocity: Signal["velocity"];
  velocity_is_manual_override: boolean;
  claim_text: string | null;
  claim_resolves_around: string | null;
  claim_status: Signal["claimStatus"];
  claim_outcome: Signal["claimOutcome"];
  claim_resolution_note: string | null;
  claim_resolved_at: string | null;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  premise: string | null;
}

export interface EvidenceRow {
  id: string;
  signal_id: string;
  tier: Evidence["tier"];
  direction: Evidence["direction"];
  cluster_no: number;
  source_name: string;
  source_url: string | null;
  description: string;
  sort_order: number;
  created_at: string;
  source_published_at: string | null;
}

export interface ConfidenceSnapshotRow {
  id: string;
  signal_id: string;
  confidence: ConfidenceSnapshot["confidence"];
  note: string | null;
  recorded_at: string;
}

export interface SignalUpdateRow {
  id: string;
  signal_id: string;
  sequence: number;
  eyebrow_label: string;
  published_at: string;
  body_copy: string;
  watching_text: string | null;
  confidence_at_time: Signal["confidence"];
  velocity_at_time: Signal["velocity"];
  claim_status_at_time: Signal["claimStatus"];
  claim_outcome_at_time: Signal["claimOutcome"];
  claim_resolution_note_at_time: string | null;
  is_current: boolean;
}

// Adapters: DB row -> packages/core domain type (used for live preview via
// formatClaimStatus / computeClusterCount so the dashboard can never drift
// from what the static generator will render).

export function toCoreSignal(row: SignalRow, categorySlug: string): Signal {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug,
    type: row.type,
    isTop: row.is_top,
    confidence: row.confidence,
    velocity: row.velocity,
    velocityIsManualOverride: row.velocity_is_manual_override,
    claimText: row.claim_text,
    claimResolvesAround: row.claim_resolves_around,
    claimStatus: row.claim_status,
    claimOutcome: row.claim_outcome,
    claimResolutionNote: row.claim_resolution_note,
    claimResolvedAt: row.claim_resolved_at,
  };
}

export function toCoreEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    signalId: row.signal_id,
    tier: row.tier,
    direction: row.direction,
    clusterNo: row.cluster_no,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    sourcePublishedAt: row.source_published_at,
  };
}

export function toCoreSnapshot(row: ConfidenceSnapshotRow): ConfidenceSnapshot {
  return {
    id: row.id,
    signalId: row.signal_id,
    confidence: row.confidence,
    note: row.note,
    recordedAt: row.recorded_at,
  };
}

// Queries

export async function listCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data as CategoryRow[];
}

export async function listSignals() {
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as SignalRow[];
}

export async function getSignal(id: string) {
  const { data, error } = await supabase.from("signals").select("*").eq("id", id).single();
  if (error) throw error;
  return data as SignalRow;
}

export async function listEvidence(signalId: string) {
  const { data, error } = await supabase
    .from("evidence")
    .select("*")
    .eq("signal_id", signalId)
    .order("sort_order");
  if (error) throw error;
  return data as EvidenceRow[];
}

export async function getCurrentSignalUpdate(signalId: string) {
  const { data, error } = await supabase
    .from("signal_updates")
    .select("*")
    .eq("signal_id", signalId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return data as SignalUpdateRow | null;
}

export async function listConfidenceSnapshots(signalId: string) {
  const { data, error } = await supabase
    .from("confidence_snapshots")
    .select("*")
    .eq("signal_id", signalId)
    .order("recorded_at");
  if (error) throw error;
  return data as ConfidenceSnapshotRow[];
}

export async function upsertSignal(row: Partial<SignalRow> & { id?: string }) {
  const { data, error } = await supabase.from("signals").upsert(row).select().single();
  if (error) throw error;
  return data as SignalRow;
}

export async function replaceEvidence(signalId: string, rows: Omit<EvidenceRow, "id" | "created_at">[]) {
  const { error: deleteError } = await supabase.from("evidence").delete().eq("signal_id", signalId);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from("evidence").insert(rows).select();
  if (error) throw error;
  return data as EvidenceRow[];
}

export async function addConfidenceSnapshot(row: Omit<ConfidenceSnapshotRow, "id" | "recorded_at">) {
  const { data, error } = await supabase
    .from("confidence_snapshots")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as ConfidenceSnapshotRow;
}

export async function upsertCurrentSignalUpdate(row: Partial<SignalUpdateRow> & { signal_id: string }) {
  // Phase 1 keeps one "current" signal_update per signal (sequence 0).
  // Adding additional story-arc entries (like Reflecting Pool's then/now)
  // is a Phase 3 dashboard feature; for now this just keeps signal_updates
  // in sync with the signal's own fields so the generator has a body_copy
  // to render.
  const { data, error } = await supabase
    .from("signal_updates")
    .upsert({ ...row, sequence: 0, is_current: true }, { onConflict: "signal_id,sequence" })
    .select()
    .single();
  if (error) throw error;
  return data as SignalUpdateRow;
}

// AI research pipeline — research_topics/research_runs/draft_signals/
// draft_evidence. The Netlify Background Functions do all the writing here;
// the dashboard only ever reads these tables (to poll status and to render
// a draft for review) and updates draft_signals.status when a human acts on
// a draft (approved by saving through SignalEditor, or rejected directly).

export interface ResearchTopicRow {
  id: string;
  topic_text: string;
  notes: string | null;
  category_hint: string | null;
  type_hint: "trend" | "claim" | null;
  status: "queued" | "researching" | "draft_ready" | "failed" | "archived";
  submitted_at: string;
  submitted_by: string | null;
}

export interface ResearchRunRow {
  id: string;
  topic_id: string;
  status: string;
  model_used: string | null;
  prompt_version: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  cost_estimate_usd: number | null;
  citations: string[] | null;
}

export interface DraftSignalRow {
  id: string;
  topic_id: string;
  run_id: string;
  proposed_title: string;
  proposed_category_id: string | null;
  proposed_type: "trend" | "claim";
  proposed_body_copy: string;
  proposed_confidence: Signal["confidence"];
  proposed_watching_text: string | null;
  proposed_claim_text: string | null;
  proposed_claim_resolves_around: string | null;
  status: "pending_review" | "edited" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  published_signal_id: string | null;
  created_at: string;
  proposed_slug: string | null;
  proposed_meta_description: string | null;
  proposed_homepage_meta: string | null;
  proposed_premise: string | null;
  proposed_substack_article: string | null;
}

export interface DraftEvidenceRow {
  id: string;
  draft_signal_id: string;
  tier: Evidence["tier"];
  direction: Evidence["direction"];
  cluster_no: number;
  source_name: string;
  source_url: string | null;
  description: string;
  ai_tier_rationale: string | null;
  sort_order: number;
  source_published_at: string | null;
}

export async function createResearchTopic(row: {
  topic_text: string;
  notes?: string | null;
  category_hint?: string | null;
  type_hint?: "trend" | "claim" | null;
  submitted_by?: string | null;
}) {
  const { data, error } = await supabase
    .from("research_topics")
    .insert({ status: "queued", ...row })
    .select()
    .single();
  if (error) throw error;
  return data as ResearchTopicRow;
}

export async function getResearchTopic(id: string) {
  const { data, error } = await supabase.from("research_topics").select("*").eq("id", id).single();
  if (error) throw error;
  return data as ResearchTopicRow;
}

export async function getLatestResearchRun(topicId: string) {
  const { data, error } = await supabase
    .from("research_runs")
    .select("*")
    .eq("topic_id", topicId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ResearchRunRow | null;
}

export async function listPendingDraftSignals() {
  const { data, error } = await supabase
    .from("draft_signals")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as DraftSignalRow[];
}

export async function getDraftSignalByTopicId(topicId: string) {
  const { data, error } = await supabase
    .from("draft_signals")
    .select("*")
    .eq("topic_id", topicId)
    .maybeSingle();
  if (error) throw error;
  return data as DraftSignalRow | null;
}

export async function getDraftSignal(id: string) {
  const { data, error } = await supabase.from("draft_signals").select("*").eq("id", id).single();
  if (error) throw error;
  return data as DraftSignalRow;
}

export async function listDraftEvidence(draftSignalId: string) {
  const { data, error } = await supabase
    .from("draft_evidence")
    .select("*")
    .eq("draft_signal_id", draftSignalId)
    .order("sort_order");
  if (error) throw error;
  return data as DraftEvidenceRow[];
}

export async function updateDraftSignalStatus(
  id: string,
  status: DraftSignalRow["status"],
  extra?: { rejection_reason?: string; published_signal_id?: string },
) {
  const { error } = await supabase
    .from("draft_signals")
    .update({ status, reviewed_at: new Date().toISOString(), ...extra })
    .eq("id", id);
  if (error) throw error;
}
