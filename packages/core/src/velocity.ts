import type { ConfidenceSnapshot, VelocityDirection } from "./types.ts";

const CONFIDENCE_RANK: Record<ConfidenceSnapshot["confidence"], number> = {
  low: 1,
  moderate: 2,
  high: 3,
  collapsed: 0,
};

/**
 * NOT WIRED UP IN PHASE 1. Confidence and Velocity are human-set judgment
 * calls through Phase 1–2 — this function exists so Phase 3 can flip
 * signals.velocity from manual to derived (comparing the two most recent
 * confidence_snapshots) once there's real snapshot history to validate the
 * rank table against. Until then, nothing calls this.
 */
export function deriveVelocity(
  snapshotsNewestFirst: ConfidenceSnapshot[],
): VelocityDirection {
  if (snapshotsNewestFirst.length < 2) return "steady";

  const [latest, previous] = snapshotsNewestFirst;
  const delta = CONFIDENCE_RANK[latest.confidence] - CONFIDENCE_RANK[previous.confidence];

  if (delta > 0) return "rising";
  if (delta < 0) return "falling";
  return "steady";
}
