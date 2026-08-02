import { createClient } from "@supabase/supabase-js";
import {
  buildRefreshContext,
  buildResearchSystemPrompt,
  buildStructuringSystemPrompt,
  runResearchPipeline,
} from "./lib/researchPipeline.ts";

// Background Function — same shape as research-topic.ts, but scoped to
// "what's new" on an already-published signal instead of a fresh topic.
// Writes a draft with published_signal_id set so the dashboard knows to
// open the existing signal (and append, not replace) rather than start a
// new one. `background: true` (not a "-background" filename suffix — see
// research-topic.ts) is what makes this run async.

export const config = { background: true };

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

  // The client creates the research_topics row itself (see the "Refresh"
  // button handler, mirroring ResearchTopic.tsx) and sends both ids here —
  // this is a Background Function, so Netlify returns an immediate 202 with
  // no body to the caller and the client can't get anything back from this
  // response.
  let topicId: string;
  let signalId: string;
  try {
    const body = await req.json();
    topicId = body.topicId;
    signalId = body.signalId;
    if (!topicId) throw new Error("missing topicId");
    if (!signalId) throw new Error("missing signalId");
  } catch {
    return new Response("Expected JSON body with topicId and signalId", { status: 400 });
  }

  const { data: signal, error: signalError } = await admin
    .from("signals")
    .select("id, title, premise, category_id, type")
    .eq("id", signalId)
    .single();
  if (signalError || !signal) {
    return new Response("Topic not found", { status: 404 });
  }

  const { data: evidence, error: evidenceError } = await admin
    .from("evidence")
    .select("tier, direction, source_name, description, source_published_at, created_at")
    .eq("signal_id", signalId)
    .order("sort_order");
  if (evidenceError) {
    return new Response(`Failed to load evidence: ${evidenceError.message}`, { status: 500 });
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
    const userPrompt = `${signal.title}\n\n${buildRefreshContext({
      existingTitle: signal.title,
      existingPremise: signal.premise,
      existingEvidenceSummary,
      cutoffDate,
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
