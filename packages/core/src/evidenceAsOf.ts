import type { Evidence } from "./types.ts";

/**
 * Evidence is timestamped once, not scoped per update. A signal_update's
 * "as of" view is just every evidence item introduced by its published_at
 * cutoff — this reproduces the Reflecting Pool then/now toggle (2 items
 * "then", 3 items "now") without duplicating evidence rows per state.
 */
export function filterEvidenceAsOf(evidence: Evidence[], cutoffIso: string): Evidence[] {
  const cutoff = new Date(cutoffIso).getTime();
  return evidence
    .filter((item) => new Date(item.createdAt).getTime() <= cutoff)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
