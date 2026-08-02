#!/usr/bin/env node --experimental-strip-types
// Regenerates the public static site from Supabase. Run at build time only
// (Netlify build command); never runs in the browser, never talks to
// Supabase from the client. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY as env vars (service role bypasses RLS by
// design — this script is the one trusted, build-time-only reader of
// draft/unpublished rows... though it only ever queries status=published).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatClaimStatus,
  computeClusterCount,
  currentPremiseStrength,
  evidenceToChartPoints,
} from "../packages/core/src/index.ts";
import { renderSignalPage, renderIndexPage } from "./render.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// .trim() guards against a stray trailing newline/space from pasting
// values into Netlify's env var UI.
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Aborting build.");
  process.exit(1);
}

async function restGet(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST error ${res.status} for ${pathAndQuery}: ${await res.text()}`);
  }
  return res.json();
}

function toCoreSignal(signal, categorySlug) {
  return {
    id: signal.id,
    slug: signal.slug,
    title: signal.title,
    categorySlug,
    type: signal.type,
    isTop: signal.is_top,
    confidence: signal.confidence,
    velocity: signal.velocity,
    velocityIsManualOverride: signal.velocity_is_manual_override,
    claimText: signal.claim_text,
    claimResolvesAround: signal.claim_resolves_around,
    claimStatus: signal.claim_status,
    claimOutcome: signal.claim_outcome,
    claimResolutionNote: signal.claim_resolution_note,
    claimResolvedAt: signal.claim_resolved_at,
  };
}

function toCoreEvidenceList(rows) {
  return rows.map((r) => ({
    id: r.id,
    signalId: r.signal_id,
    tier: r.tier,
    direction: r.direction,
    clusterNo: r.cluster_no,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    description: r.description,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    sourcePublishedAt: r.source_published_at,
  }));
}

async function main() {
  console.log("Fetching published signals from Supabase…");

  const categories = await restGet("categories?select=*&order=sort_order");
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const signals = await restGet("signals?select=*&status=eq.published&order=title");
  if (signals.length === 0) {
    console.warn("No published signals found — index will render an empty list.");
  }

  const signalIds = signals.map((s) => s.id);
  const idFilter = signalIds.length > 0 ? `(${signalIds.join(",")})` : "()";

  const allUpdates = signalIds.length
    ? await restGet(`signal_updates?select=*&is_current=eq.true&signal_id=in.${idFilter}`)
    : [];
  const updateBySignalId = new Map(allUpdates.map((u) => [u.signal_id, u]));

  const allEvidence = signalIds.length
    ? await restGet(`evidence?select=*&signal_id=in.${idFilter}&order=sort_order`)
    : [];
  const evidenceBySignalId = new Map();
  for (const item of allEvidence) {
    const list = evidenceBySignalId.get(item.signal_id) ?? [];
    list.push(item);
    evidenceBySignalId.set(item.signal_id, list);
  }

  const rows = [];
  const errors = [];

  for (const signal of signals) {
    const category = categoryById.get(signal.category_id);
    const update = updateBySignalId.get(signal.id);
    // Chronological, not sort_order — sort_order just reflects whatever
    // order the evidence happened to arrive in (an AI draft's JSON array
    // order, or manual entry order), which has no reason to match publish
    // dates. The evidence list's numbering and the chart's numbered dots
    // both derive their point numbers from this array's position, and the
    // chart's own x-axis is already chronological internally — sorting
    // here is what makes "number 1" land leftmost and the numbers actually
    // climb left to right instead of scattering across the timeline.
    const evidence = (evidenceBySignalId.get(signal.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.source_published_at ?? a.created_at) - new Date(b.source_published_at ?? b.created_at),
      );

    if (!category) {
      errors.push(`Signal "${signal.slug}" has no matching category — skipping.`);
      continue;
    }
    if (!update) {
      errors.push(`Signal "${signal.slug}" is published but has no current signal_update — skipping.`);
      continue;
    }

    const coreSignal = toCoreSignal(signal, category.slug);
    const coreEvidence = toCoreEvidenceList(evidence);
    const clusterCount = computeClusterCount(coreEvidence);
    const premiseStrength = currentPremiseStrength(coreEvidence);
    const chartPoints = evidenceToChartPoints(coreEvidence);

    let claimCopy;
    try {
      claimCopy = formatClaimStatus(coreSignal);
    } catch (err) {
      // Refuse to publish a claim with unattributed/verdict-y wording rather
      // than silently shipping it — this is the whole point of centralizing
      // the tone rule in packages/core.
      errors.push(`Signal "${signal.slug}": ${err.message}`);
      continue;
    }

    const html = renderSignalPage({
      signal,
      categoryLabel: category.label,
      eyebrowLabel: update.eyebrow_label,
      bodyCopy: update.body_copy,
      watchingText: update.watching_text,
      evidence,
      clusterCount,
      claimCopy,
      premiseStrength,
      chartPoints,
    });

    await mkdir(path.join(ROOT, "topics"), { recursive: true });
    await writeFile(path.join(ROOT, "topics", `${signal.slug}.html`), html);

    const statusPill =
      signal.type === "claim" && signal.claim_status === "resolved"
        ? { label: "Resolved", variant: signal.claim_outcome === "hit" ? "hit" : signal.claim_outcome === "partial" ? "partial" : "missed" }
        : { label: "Ongoing", variant: "ongoing" };

    rows.push({ signal, categoryLabel: category.label, categorySlug: category.slug, statusPill });
  }

  if (errors.length > 0) {
    console.error("Build failed — the following signals could not be published:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const indexHtml = renderIndexPage({ rows, categories });
  await writeFile(path.join(ROOT, "index.html"), indexHtml);

  console.log(`Generated ${rows.length} signal page(s) and index.html.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
