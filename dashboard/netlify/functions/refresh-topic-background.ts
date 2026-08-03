import type { BackgroundHandler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import {
  buildRefreshContext,
  buildResearchSystemPrompt,
  buildStructuringSystemPrompt,
  runResearchPipeline,
} from "./lib/researchPipeline.ts";

// Background Function — same shape as research-topic-background.ts (see the
// comment there for why this must use the classic (event, context) => ...
// handler export rather than the modern `export default (req: Request) =>`
// style), but scoped to "what's new" on an already-published signal instead
// of a fresh topic. Writes a draft with published_signal_id set so the
// dashboard knows to open the existing signal (and append, not replace)
// rather than start a new one.

export const handler: BackgroundHandler = async (event) => {
  if (event.httpMethod !== "POST") {
    console.error("refresh-topic-background: rejected non-POST method", event.httpMethod);
    return;
  }

  const authHeader = event.headers.authorization ?? event.headers.Authorization ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    console.error("refresh-topic-background: missing Authorization header");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
    console.error("refresh-topic-background: missing Supabase or Anthropic env vars");
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    console.error("refresh-topic-background: invalid session", userError?.message);
    return;
  }

  // The client creates the research_topics row itself (see the "Refresh"
  // button handler, mirroring ResearchTopic.tsx) and sends both ids here —
  // a background function's response is never visible to the caller, so
  // the client can't get anything back from it.
  let topicId: string;
  let signalId: string;
  try {
    const body = JSON.parse(event.body ?? "{}");
    topicId = body.topicId;
    signalId = body.signalId;
    if (!topicId) throw new Error("missing topicId");
    if (!signalId) throw new Error("missing signalId");
  } catch (e) {
    console.error("refresh-topic-background: expected JSON body with topicId and signalId", e);
    return;
  }

  const { data: signal, error: signalError } = await admin
    .from("signals")
    .select("id, title, premise, category_id, type, pole_a_label, pole_b_label")
    .eq("id", signalId)
    .single();
  if (signalError || !signal) {
    console.error("refresh-topic-background: topic not found", signalError?.message);
    return;
  }

  const { data: evidence, error: evidenceError } = await admin
    .from("evidence")
    .select("tier, direction, source_name, description, source_published_at, created_at")
    .eq("signal_id", signalId)
    .order("sort_order");
  if (evidenceError) {
    console.error("refresh-topic-background: failed to load evidence", evidenceError.message);
    return;
  }

  const cutoffDate = (evidence ?? []).reduce((latest, e) => {
    const effective = e.source_published_at ?? e.created_at;
    return effective > latest ? effective : latest;
  }, "1970-01-01");

  const existingEvidenceSummary =
    (evidence ?? [])
      .map((e) => `- [Tier ${e.tier}, ${e.direction}] ${e.source_name}: ${e.description}`)
      .join("\n") || "(none yet)";

  const { data: categories, error: categoriesError } = await admin
    .from("categories")
    .select("id, slug");
  if (categoriesError || !categories) {
    console.error("refresh-topic-background: failed to load categories", categoriesError?.message);
    return;
  }
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const { data: topic, error: topicError } = await admin
    .from("research_topics")
    .update({ status: "researching" })
    .eq("id", topicId)
    .select()
    .single();
  if (topicError || !topic) {
    console.error("refresh-topic-background: research topic not found", topicError?.message);
    return;
  }

  const { data: run, error: runError } = await admin
    .from("research_runs")
    .insert({
      topic_id: topic.id,
      status: "running",
      model_used: "claude-opus-5",
      prompt_version: "v1",
    })
    .select()
    .single();
  if (runError || !run) {
    console.error("refresh-topic-background: failed to create research run", runError?.message);
    await admin.from("research_topics").update({ status: "failed" }).eq("id", topic.id);
    return;
  }

  try {
    const userPrompt = `${signal.title}\n\n${buildRefreshContext({
      existingTitle: signal.title,
      existingPremise: signal.premise,
      existingEvidenceSummary,
      cutoffDate,
      existingPoleALabel: signal.pole_a_label,
      existingPoleBLabel: signal.pole_b_label,
    })}`;

    const { draft, citations, costEstimateUsd } = await runResearchPipeline({
      apiKey: anthropicApiKey,
      researchSystemPrompt: buildResearchSystemPrompt(),
      structuringSystemPrompt: buildStructuringSystemPrompt(),
      userPrompt,
      categorySlugs: categories.map((c) => c.slug),
    });

    const { data: draftSignal, error: draftSignalError } = await admin
      .from("draft_signals")
      .insert({
        topic_id: topic.id,
        run_id: run.id,
        published_signal_id: signalId,
        proposed_title: draft.title,
        proposed_category_id: categoryIdBySlug.get(draft.category_slug) ?? signal.category_id,
        proposed_type: draft.type,
        proposed_body_copy: draft.body_copy,
        proposed_confidence: "low", // recomputed for real once merged with existing evidence in the editor
        proposed_watching_text: draft.watching_text,
        proposed_claim_text: draft.claim_text,
        proposed_claim_resolves_around: draft.claim_resolves_around,
        proposed_slug: draft.slug,
        proposed_meta_description: draft.meta_description,
        proposed_homepage_meta: draft.homepage_meta,
        proposed_premise: draft.premise,
        proposed_pole_a_label: draft.pole_a_label ?? signal.pole_a_label,
        proposed_pole_b_label: draft.pole_b_label ?? signal.pole_b_label,
        proposed_current_read: draft.current_read,
        proposed_substack_article: `# ${draft.substack_article.headline}\n\n*${draft.substack_article.subhead}*\n\n${draft.substack_article.body}`,
        status: "pending_review",
      })
      .select()
      .single();
    if (draftSignalError || !draftSignal) {
      throw new Error(`Failed to save draft signal: ${draftSignalError?.message}`);
    }

    if (draft.evidence.length > 0) {
      const { error: draftEvidenceError } = await admin.from("draft_evidence").insert(
        draft.evidence.map((e, i) => ({
          draft_signal_id: draftSignal.id,
          tier: e.tier,
          direction: e.direction,
          cluster_no: e.cluster_no,
          source_name: e.source_name,
          source_url: e.source_url,
          description: e.description,
          ai_tier_rationale: e.ai_tier_rationale,
          source_published_at: e.source_published_at,
          sort_order: i,
        })),
      );
      if (draftEvidenceError) {
        throw new Error(`Failed to save draft evidence: ${draftEvidenceError.message}`);
      }
    }

    await admin.from("research_topics").update({ status: "draft_ready" }).eq("id", topic.id);
    await admin
      .from("research_runs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        cost_estimate_usd: costEstimateUsd,
        citations,
      })
      .eq("id", run.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("refresh-topic-background: pipeline failed", message);
    await admin.from("research_topics").update({ status: "failed" }).eq("id", topic.id);
    await admin
      .from("research_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: message })
      .eq("id", run.id);
  }
};
