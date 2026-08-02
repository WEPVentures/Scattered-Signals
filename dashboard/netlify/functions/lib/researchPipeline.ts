import Anthropic from "@anthropic-ai/sdk";
import type { Evidence } from "@scattered-signals/core";

// Shared by research-topic-background.ts (new signal) and
// refresh-topic-background.ts (update an existing one). Two-call pipeline:
// a research call with the web_search server tool (Anthropic runs the
// search loop itself — no client-side tool_use round trips needed), then a
// structuring call over the same conversation history with no tools and a
// json_schema output format, so the final answer can't help but match the
// shape the dashboard needs.

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;
const WEB_SEARCH_MAX_USES = 15;
const MAX_PAUSE_CONTINUATIONS = 3;
// $5 / $25 per MTok (input / output) — see packages/core-adjacent docs; keep
// in sync with whatever model MODEL points at.
const INPUT_COST_PER_MTOK = 5;
const OUTPUT_COST_PER_MTOK = 25;

export interface DraftEvidenceOut {
  tier: "1" | "2" | "3";
  direction: "supports" | "contradicts";
  cluster_no: number;
  source_name: string;
  source_url: string;
  description: string;
  ai_tier_rationale: string;
  source_published_at: string | null;
}

export interface ResearchDraft {
  title: string;
  slug: string;
  category_slug: string;
  type: "trend" | "claim";
  premise: string;
  body_copy: string;
  watching_text: string;
  meta_description: string;
  homepage_meta: string;
  claim_text: string | null;
  claim_resolves_around: string | null;
  evidence: DraftEvidenceOut[];
  substack_article: {
    headline: string;
    subhead: string;
    body: string;
  };
}

export interface PipelineResult {
  draft: ResearchDraft;
  citations: string[];
  costEstimateUsd: number;
}

// The site's own non-verdict rule (packages/core/src/claimCopy.ts,
// BANNED_STATUS_TEXT) enforces this at render time regardless, but stating
// it up front means the model's first draft is usually already compliant
// instead of getting rejected on save.
const PERSONA_AND_RULES = `You are a seasoned, mature New York Times investigative journalist on assignment for Scattered Signals, a site that tracks public claims and trends against the sourced evidence behind them. Hold every sentence you write — in both the structured signal and the Substack article — to that standard: precise, skeptical of unverified claims, attributed rather than asserted, and unwilling to editorialize past what the evidence actually shows. This applies regardless of how casual, partisan, or unreliable the sources you're citing are; your voice does not borrow their register.

Rules that are load-bearing, not stylistic:

1. PREMISE. State one specific, falsifiable declarative sentence as the "premise" — not the article's working title, not a question. Every evidence item's "direction" (supports/contradicts) must be your judgment of whether that item makes THIS EXACT SENTENCE more or less likely to be true. If you can't state a premise that could have come out false, the topic isn't ready to score — sharpen it until it is.

2. TIERS. Score each piece of evidence:
   - Tier 1: a primary source — a filing, a direct statement, a government record.
   - Tier 2: reporting or secondary analysis.
   - Tier 3: commentary, opinion, or unverified reports — weighted lowest of the three.
   Write a one-sentence "ai_tier_rationale" per item explaining the tier choice, so a human editor can spot-check your judgment without re-deriving it.

3. NEVER FABRICATE A SOURCE. Every "source_url" must be a real, working URL you actually found via web search in this conversation — never invented, never guessed, never a plausible-looking placeholder. If you can't find enough genuine evidence to support a claim, say so rather than padding the list.

4. SOURCE DATES. "source_published_at" is when the underlying article/document was actually published, not today's date — read it off the source itself. Use null only if you genuinely can't determine it.

5. NO VERDICTS. If this is a bounded claim with a resolution, never write "Resolved" or "Claim Resolved" as the outcome — those exact strings are rejected. Write an attributed sentence instead, e.g. "Dismissed by federal prosecutors, July 31, 2026 — the Justice Department said the evidence didn't support the charge." Report what happened and who said so; don't deliver your own verdict.`;

export function buildResearchSystemPrompt(): string {
  return `${PERSONA_AND_RULES}

For this step, use web search to gather real, dated, citable sources on the assigned topic. Work like a beat reporter: search broadly first, then follow the specific names, filings, and dates that turn up. Keep searching until you have enough genuine evidence — supporting and contradicting — to actually score the premise, not just enough to fill a quota. When you're done, write up what you found in plain prose so it can be turned into a structured draft next; don't try to format it as JSON yet.`;
}

export function buildStructuringSystemPrompt(): string {
  return `${PERSONA_AND_RULES}

You already did the research earlier in this conversation. Now convert it into the exact JSON shape requested — do not introduce any source that wasn't already surfaced by your web searches above.`;
}

export function buildRefreshContext(params: {
  existingTitle: string;
  existingPremise: string | null;
  existingEvidenceSummary: string;
  cutoffDate: string;
}): string {
  return `This is a refresh of an already-published signal, not a brand-new topic.

Existing title: ${params.existingTitle}
Existing premise: ${params.existingPremise ?? "(not yet recorded — infer one consistent with the title and evidence below, and include it in your draft so it gets backfilled)"}
Existing evidence already on the page (do not re-cite any of these):
${params.existingEvidenceSummary}

Only search for and report developments published after ${params.cutoffDate}. If you find nothing genuinely new since then, say so plainly rather than padding the list with restatements of what's already there.`;
}

const EVIDENCE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    tier: { type: "string", enum: ["1", "2", "3"] },
    direction: { type: "string", enum: ["supports", "contradicts"] },
    cluster_no: { type: "integer" },
    source_name: { type: "string" },
    source_url: { type: "string" },
    description: { type: "string" },
    ai_tier_rationale: { type: "string" },
    source_published_at: { type: ["string", "null"] },
  },
  required: [
    "tier",
    "direction",
    "cluster_no",
    "source_name",
    "source_url",
    "description",
    "ai_tier_rationale",
    "source_published_at",
  ],
  additionalProperties: false,
};

export function buildDraftSchema(categorySlugs: string[]) {
  return {
    type: "json_schema" as const,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        slug: { type: "string" },
        category_slug: { type: "string", enum: categorySlugs },
        type: { type: "string", enum: ["trend", "claim"] },
        premise: { type: "string" },
        body_copy: { type: "string" },
        watching_text: { type: "string" },
        meta_description: { type: "string" },
        homepage_meta: { type: "string" },
        claim_text: { type: ["string", "null"] },
        claim_resolves_around: { type: ["string", "null"] },
        evidence: { type: "array", items: EVIDENCE_ITEM_SCHEMA },
        substack_article: {
          type: "object",
          properties: {
            headline: { type: "string" },
            subhead: { type: "string" },
            body: { type: "string" },
          },
          required: ["headline", "subhead", "body"],
          additionalProperties: false,
        },
      },
      required: [
        "title",
        "slug",
        "category_slug",
        "type",
        "premise",
        "body_copy",
        "watching_text",
        "meta_description",
        "homepage_meta",
        "claim_text",
        "claim_resolves_around",
        "evidence",
        "substack_article",
      ],
      additionalProperties: false,
    },
  };
}

function extractCitations(content: Anthropic.ContentBlock[]): string[] {
  const urls = new Set<string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    if (!Array.isArray(block.content)) continue; // error result, not a result list
    for (const result of block.content) urls.add(result.url);
  }
  return [...urls];
}

function estimateCostUsd(usages: Anthropic.Usage[]): number {
  let cost = 0;
  for (const u of usages) {
    cost += (u.input_tokens / 1_000_000) * INPUT_COST_PER_MTOK;
    cost += (u.output_tokens / 1_000_000) * OUTPUT_COST_PER_MTOK;
  }
  return Math.round(cost * 10000) / 10000;
}

/**
 * Runs the research call to completion, resuming through the server-side
 * web_search loop's own pause_turn checkpoints (it caps itself at 10 search
 * rounds per turn — resending the paused turn tells it to keep going).
 */
async function runResearchCall(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ messages: Anthropic.MessageParam[]; usages: Anthropic.Usage[] }> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const usages: Anthropic.Usage[] = [];

  for (let i = 0; i < MAX_PAUSE_CONTINUATIONS + 1; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: WEB_SEARCH_MAX_USES }],
      messages,
    });
    usages.push(response.usage);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "pause_turn") break;
  }

  return { messages, usages };
}

export async function runResearchPipeline(params: {
  apiKey: string;
  researchSystemPrompt: string;
  structuringSystemPrompt: string;
  userPrompt: string;
  categorySlugs: string[];
}): Promise<PipelineResult> {
  const client = new Anthropic({ apiKey: params.apiKey });

  const { messages, usages } = await runResearchCall(
    client,
    params.researchSystemPrompt,
    params.userPrompt,
  );

  const citations = extractCitations(
    messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as Anthropic.ContentBlock[]) : [])),
  );

  const structuringMessages: Anthropic.MessageParam[] = [
    ...messages,
    {
      role: "user",
      content:
        "Now output the structured draft as a single JSON object matching the requested schema, based only on the sources you found above.",
    },
  ];

  const structured = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: params.structuringSystemPrompt,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: buildDraftSchema(params.categorySlugs),
    },
    messages: structuringMessages,
  });
  usages.push(structured.usage);

  const textBlock = structured.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error(`Structuring call returned no text block (stop_reason: ${structured.stop_reason})`);
  }

  const draft = JSON.parse(textBlock.text) as ResearchDraft;

  return {
    draft,
    citations,
    costEstimateUsd: estimateCostUsd(usages),
  };
}

/**
 * Draft evidence has no real id/signal_id/created_at yet (those only exist
 * once a draft is approved into the real evidence table) — this fills in
 * placeholders so packages/core's scoring functions, which only look at
 * tier/direction/sourcePublishedAt, can run against a draft the same way
 * the dashboard already does for unsaved evidence rows in SignalEditor.
 */
export function draftEvidenceToCoreEvidence(items: DraftEvidenceOut[]): Evidence[] {
  return items.map((e, i) => ({
    id: String(i),
    signalId: "",
    tier: e.tier,
    direction: e.direction,
    clusterNo: e.cluster_no,
    sourceName: e.source_name,
    sourceUrl: e.source_url,
    description: e.description,
    sortOrder: i,
    createdAt: "",
    sourcePublishedAt: e.source_published_at,
  }));
}
