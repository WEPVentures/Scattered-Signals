import Anthropic from "@anthropic-ai/sdk";
import type { Evidence } from "@scattered-signals/core";

// Shared by research-topic-background.ts (new signal) and
// refresh-topic-background.ts (update an existing one). Three-call
// pipeline, one conversation carried through all of it: a research call
// with the web_search server tool (Anthropic runs the search loop itself
// — no client-side tool_use round trips needed) produces prose findings;
// a fact-check call with the web_fetch server tool independently
// re-retrieves every cited URL and corrects or drops anything that
// doesn't hold up, producing revised prose findings; a structuring call
// over the fact-checked conversation with no tools and a json_schema
// output format turns that into the shape the dashboard needs. Same
// model, three system prompts, one continuous message history — each
// stage sees everything the one before it did.

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;
const WEB_SEARCH_MAX_USES = 15;
const WEB_FETCH_MAX_USES = 20;
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
  pole_a_label: string | null;
  pole_b_label: string | null;
  current_read: string | null;
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
const NEWSROOM_STANDARDS = `Nutgraph runs a small newsroom, not a single byline — a researcher, a fact-checker, and a writer each take a pass on every assignment, all held to the same seasoned New York Times investigative standard: precise, skeptical of unverified claims, attributed rather than asserted, and unwilling to editorialize past what the evidence actually shows. This applies regardless of how casual, partisan, or unreliable the sources being cited are; the newsroom's own voice never borrows their register.

Nutgraph is not a prediction market and must never imply forecasting. Every evidence item cited already happened — a filing, a statement, a ruling, a retraction, a report. Report what the evidence has shown so far; never claim or imply where a story is headed next. That inference belongs to the reader.

Rules that are load-bearing, not stylistic:

1. PREMISE. State one specific, falsifiable declarative sentence as the "premise" — not the article's working title, not a question. Every evidence item's "direction" (supports/contradicts) must be a judgment of whether that item makes THIS EXACT SENTENCE more or less likely to be true. If a premise can't be stated that could have come out false, the topic isn't ready to score — sharpen it until it is.

   If "type" is "trend" (a Living Topic — an ongoing narrative with no fixed resolution), also name the two short competing narrative poles the story oscillates between as "pole_a_label" and "pole_b_label" (one or two words each, e.g. "Open-source" / "Private" — these are the two ends of the real back-and-forth tension in the coverage, not a for/against framing of the premise), and write one "current_read" sentence on where things stand right now. For a trend, an evidence item's "direction" means "pushes the narrative toward pole A" (supports) or "pushes it toward pole B" (contradicts) — not "makes the premise more/less true." If "type" is "claim" (a Bounded Claim that resolves), leave "pole_a_label", "pole_b_label", and "current_read" as null — they don't apply.

2. TIERS. Score each piece of evidence:
   - Tier 1: a primary source — a filing, a direct statement, a government record.
   - Tier 2: reporting or secondary analysis.
   - Tier 3: commentary, opinion, or unverified reports — weighted lowest of the three.
   Write a one-sentence "ai_tier_rationale" per item explaining the tier choice, so a human editor can spot-check the judgment call without re-deriving it.

3. NEVER FABRICATE A SOURCE. Every "source_url" must be a real, working URL actually found via web search or confirmed via web fetch in this conversation — never invented, never guessed, never a plausible-looking placeholder. If there isn't enough genuine evidence to support a claim, say so rather than padding the list.

4. SOURCE DATES. "source_published_at" is when the underlying article/document was actually published, not today's date — read it off the source itself. Use null only if it genuinely can't be determined.

5. NO VERDICTS. If this is a bounded claim with a resolution, never write "Resolved" or "Claim Resolved" as the outcome — those exact strings are rejected. Write an attributed sentence instead, e.g. "Dismissed by federal prosecutors, July 31, 2026 — the Justice Department said the evidence didn't support the charge." Report what happened and who said so; never deliver a personal verdict.`;

export function buildResearchSystemPrompt(): string {
  return `${NEWSROOM_STANDARDS}

You are the researcher on this assignment: a beat reporter who works the primary sources. Use web search to gather real, dated, citable sources on the assigned topic. Search broadly first, then follow the specific names, filings, and dates that turn up. Keep searching until you have enough genuine evidence — supporting and contradicting — to actually score the premise, not just enough to fill a quota. When you're done, write up what you found in plain prose so the fact-checker can review it next; don't try to format it as JSON yet.`;
}

export function buildFactCheckSystemPrompt(): string {
  return `${NEWSROOM_STANDARDS}

You are the newsroom's fact-checker, reviewing the researcher's findings earlier in this conversation before they reach the writer. Treat this adversarially, not collaboratively — assume anything above could be wrong until you've independently confirmed it yourself.

For every piece of evidence the researcher cited, use web_fetch to retrieve that exact URL and confirm, from the retrieved page itself: that the source actually says what was claimed; that the tier (1/2/3) is justified by what kind of source it really is; and that the direction (supports/contradicts, or pushes toward pole A/B) is a fair reading, not a stretch.

If a citation checks out, keep it as-is. If a detail is off — the wrong tier, a mischaracterized quote, a date that doesn't match the source — correct it. If a URL can't be verified (the fetch fails, the page doesn't say what was claimed, or the source turns out to be misrepresented), drop that item and say so explicitly rather than passing along something unconfirmed. Never wave something through just because losing it would leave less evidence.

When you're done, write the verified findings back out in the same plain-prose form the researcher used, corrected where needed, ready for the writer. Note briefly what was changed or dropped and why.`;
}

export function buildStructuringSystemPrompt(): string {
  return `${NEWSROOM_STANDARDS}

You are the writer, turning the fact-checker's verified findings from earlier in this conversation into the piece. Convert them into the exact JSON shape requested — do not introduce any source that wasn't already verified above, and do not second-guess the fact-checker's corrections.`;
}

export function buildRefreshContext(params: {
  existingTitle: string;
  existingPremise: string | null;
  existingEvidenceSummary: string;
  cutoffDate: string;
  existingPoleALabel?: string | null;
  existingPoleBLabel?: string | null;
}): string {
  const poleContext =
    params.existingPoleALabel && params.existingPoleBLabel
      ? `\nExisting poles: "${params.existingPoleALabel}" vs. "${params.existingPoleBLabel}" — keep these exact labels stable, do not invent new ones; only "current_read" should change on a refresh.`
      : "";

  return `This is a refresh of an already-published topic on the site, not a brand-new one.

Existing title: ${params.existingTitle}
Existing premise: ${params.existingPremise ?? "(not yet recorded — infer one consistent with the title and evidence below, and include it in your draft so it gets backfilled)"}${poleContext}
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
        pole_a_label: { type: ["string", "null"] },
        pole_b_label: { type: ["string", "null"] },
        current_read: { type: ["string", "null"] },
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
        "pole_a_label",
        "pole_b_label",
        "current_read",
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
    if (block.type === "web_search_tool_result") {
      if (!Array.isArray(block.content)) continue; // error result, not a result list
      for (const result of block.content) urls.add(result.url);
    } else if (block.type === "web_fetch_tool_result") {
      if (block.content.type === "web_fetch_result") urls.add(block.content.url);
    }
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

type ServerTool =
  | { type: "web_search_20260209"; name: "web_search"; max_uses: number }
  | { type: "web_fetch_20260209"; name: "web_fetch"; max_uses: number; citations: { enabled: true } };

/**
 * Runs one tool-augmented turn to completion, resuming through the
 * server-side tool loop's own pause_turn checkpoints (it caps itself at ~10
 * rounds per turn — resending the paused turn tells it to keep going).
 * Appends to (and returns) the given messages array so callers can thread
 * one continuous conversation across multiple phases — required for
 * web_fetch, which can only fetch URLs already present in the context.
 */
async function runToolAugmentedTurn(
  client: Anthropic,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tool: ServerTool,
): Promise<{ messages: Anthropic.MessageParam[]; usages: Anthropic.Usage[] }> {
  const usages: Anthropic.Usage[] = [];

  for (let i = 0; i < MAX_PAUSE_CONTINUATIONS + 1; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [tool],
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
  factCheckSystemPrompt: string;
  structuringSystemPrompt: string;
  userPrompt: string;
  categorySlugs: string[];
}): Promise<PipelineResult> {
  const client = new Anthropic({ apiKey: params.apiKey });

  const research = await runToolAugmentedTurn(
    client,
    params.researchSystemPrompt,
    [{ role: "user", content: params.userPrompt }],
    { type: "web_search_20260209", name: "web_search", max_uses: WEB_SEARCH_MAX_USES },
  );

  const factCheckMessages: Anthropic.MessageParam[] = [
    ...research.messages,
    {
      role: "user",
      content:
        "Fact-check the findings above: use web_fetch to independently re-retrieve every cited URL and confirm, correct, or drop each item per your instructions.",
    },
  ];

  const factCheck = await runToolAugmentedTurn(
    client,
    params.factCheckSystemPrompt,
    factCheckMessages,
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: WEB_FETCH_MAX_USES, citations: { enabled: true } },
  );

  const usages = [...research.usages, ...factCheck.usages];

  const citations = extractCitations(
    factCheck.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as Anthropic.ContentBlock[]) : [])),
  );

  const structuringMessages: Anthropic.MessageParam[] = [
    ...factCheck.messages,
    {
      role: "user",
      content:
        "Now output the structured draft as a single JSON object matching the requested schema, based only on the fact-checked findings above.",
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
