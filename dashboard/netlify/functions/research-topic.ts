import { createClient } from "@supabase/supabase-js";
import { currentPremiseStrength } from "@scattered-signals/core";
import {
  buildResearchSystemPrompt,
  buildStructuringSystemPrompt,
  draftEvidenceToCoreEvidence,
  runResearchPipeline,
} from "./lib/researchPipeline.ts";

// Background Function — the `background: true` config below (not a
// filename suffix; that was the deprecated V1 convention and mixing it with
// this file's V2 export-default syntax is what caused "handler is not a
// function") is what makes Netlify run this async up to 15 minutes and
// return a 202 to the caller immediately; the real result is polled from
// research_topics/draft_signals, not the HTTP response. Verifies the
// caller's session the same way publish-signal.ts and delete-signal.ts do,
// then runs the two-call research pipeline and writes a pending_review
// draft — nothing here ever touches the real signals/evidence tables
// directly.

export const config = { background: true };

function formatSubstackArticle(article: { headline: string; subhead: string; body: string }): string {
  return `# ${article.headline}\n\n*${article.subhead}*\n\n${article.body}`;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response("Missing Authorization header", { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
    return new Response("Server misconfigured: missing Supabase or Anthropic env vars", { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(`Invalid session: ${userError?.message ?? "no user returned"}`, { status: 401 });
  }

  // The client creates the research_topics row itself (see
  // ResearchTopic.tsx) and only sends the id here — this is a Background
  // Function, so Netlify returns an immediate 202 with no body to the
  // caller; the client can't get a topicId back from this response. Giving
  // the client its own pre-created row to poll is what makes that work.
  let topicId: string;
  try {
    const body = await req.json();
    topicId = body.topicId;
    if (!topicId) throw new Error("missing topicId");
  } catch {
    return new Response("Expected JSON body with topicId", { status: 400 });
  }

  const { data: categories, error: categoriesError } = await admin
    .from("categories")
    .select("id, slug");
  if (categoriesError || !categories) {
    return new Response(`Failed to load categories: ${categoriesError?.message}`, { status: 500 });
  }
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const { data: topic, error: topicError } = await admin
    .from("research_topics")
    .update({ status: "researching" })
    .eq("id", topicId)
    .select()
    .single();
  if (topicError || !topic) {
    return new Response(`Research topic not found: ${topicError?.message}`, { status: 404 });
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
    return new Response(`Failed to create research run: ${runError?.message}`, { status: 500 });
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
    await admin.from("research_topics").update({ status: "failed" }).eq("id", topic.id);
    await admin
      .from("research_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: message })
      .eq("id", run.id);
  }

  return new Response(JSON.stringify({ topicId: topic.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
