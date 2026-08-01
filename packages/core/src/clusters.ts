import type { Evidence } from "./types.ts";

/** Number of independent lines of evidence — distinct cluster numbers, not evidence count. */
export function computeClusterCount(evidence: Evidence[]): number {
  return new Set(evidence.map((item) => item.clusterNo)).size;
}
