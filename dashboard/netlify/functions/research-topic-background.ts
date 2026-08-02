import type { BackgroundHandler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { currentPremiseStrength } from "@scattered-signals/core";
import {
  buildResearchSystemPrompt,
  buildStructuringSystemPrompt,
  draftEvidenceToCoreEvidence,
  runResearchPipeline,
} from "./lib/researchPipeline.ts";

// Background Function — the "-background" filename suffix is what makes
// Netlify run this async up to 15 minutes; it also means this must use the
// classic (event, context) => ... handler export, not the modern
// `export default (req: Request) =>` style used by publish-signal.ts and
// delete-signal.ts (those are synchronous functions, where the modern style
// works fine — background execution specifically still requires the
// original Lambda-compatible signature). Background handlers have no
// response contract the caller ever sees (Netlify sends a 202 immediately,
// independent of whatever this returns), so failures are only visible via
// research_topics/research_runs, not a returned status/body. Verifies the
// caller's session the same way publish-signal.ts and delete-signal.ts do,
// then runs the two-call research pipeline and writes a pending_review
// draft — nothing here ever touches the real signals/evidence tables
// directly.

function formatSubstackArticle(article: { headline: string; subhead: string; body: string }): string {
  return `# ${article.headline}\n\n*${article.subhead}*\n\n${article.body}`;
}

export const handler: BackgroundHandler = async (event) => {
  if (event.httpMethod !== "POST") {
    console.error("research-topic-background: rejected non-POST method", event.httpMethod);
    return;
  }

  const authHeader = event.headers.authorization ?? event.headers.Authorization ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    console.error("research-topic-background: missing Authorization header");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
    console.error("research-topic-background: missing Supabase or Anthropic env vars");
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    console.error("research-topic-background: invalid session", userError?.message);
    return;
  }

  // The client creates the research_topics row itself (see
  // ResearchTopic.tsx) and only sends the id here — a background function's
  // response is never visible to the caller, so the client can't get a
  // topicId back from it. Giving the client its own pre-created row to poll
  // is what makes that work.
  let topicId: string;
  try {
    const body = JSON.parse(event.body ?? "{}");
    topicId = body.topicId;
    if (!topicId) throw new Error("missing topicId");
  } catch (e) {
    console.error("research-topic-background: expected JSON body with topicId", e);
    return;
  }

  const { data: categories, error: categoriesError } = await admin
    .from("categories")
    .select("id, slug");
  if (categoriesError || !categories) {
    console.error("research-topic-background: failed to load categories", categoriesError?.message);
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
    console.error("research-topic-background: research topic not found", topicError?.message);
    return;
  }
  const notes: string | null = topic.notes;

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
    console.error("research-topic-background: failed to create research run", runError?.message);
    await admin.from("research_topics").update({ status: "failed" }).eq("id", topic.id);
    return;
  }

  try {
    const userPrompt = notes ? `${topic.topic_text}\n\nAdditional context: ${notes}` : topic.topic_text;

    const { draft, citations, costEstimateUsd } = await runResearchPipeline({
      apiKey: anthropicApiKey,
      researchSystemPrompt: buildResearchSystemPrompt(),
      structuringSystemPrompt: buildStructuringSystemPrompt(),
      userPrompt,
      categorySlugs: categories.map((c) => c.slug),
    });

    const computedConfidence = currentPremiseStrength(draftEvidenceToCoreEvidence(draft.evidence));

    const { data: draftSignal, error: draftSignalError } = await admin
      .from("draft_signals")
      .insert({
        topic_id: topic.id,
        run_id: run.id,
        proposed_title: draft.title,
        proposed_category_id: categoryIdBySlug.get(draft.category_slug) ?? null,
        proposed_type: draft.type,
        proposed_body_copy: draft.body_copy,
        proposed_confidence: computedConfidence,
        proposed_watching_text: draft.watching_text,
        proposed_claim_text: draft.claim_text,
        proposed_claim_resolves_around: draft.claim_resolves_around,
        proposed_slug: draft.slug,
        proposed_meta_description: draft.meta_description,
        proposed_homepage_meta: draft.homepage_meta,
        proposed_premise: draft.premise,
        proposed_substack_article: formatSubstackArticle(draft.substack_article),
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
    console.error("research-topic-background: pipeline failed", message);
    await admin.from("research_topics").update({ status: "failed" }).eq("id", topic.id);
    await admin
      .from("research_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: message })
      .eq("id", run.id);
  }
};
