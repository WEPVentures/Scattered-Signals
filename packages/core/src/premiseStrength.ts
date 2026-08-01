import type { ConfidenceLevel, Evidence, EvidenceTier } from "./types.ts";
import { CONFIDENCE_Y, type ChartPoint } from "./chart.ts";

// How directly a piece of evidence should move the needle. Mirrors the Tier
// definitions on the About page: Tier 1 (primary source) counts far more
// than Tier 3 (opinion/unverified).
const TIER_WEIGHT: Record<EvidenceTier, number> = {
  "1": 3,
  "2": 1,
  "3": 0.5,
};

/**
 * Maps a cumulative evidence-balance score onto the same four levels
 * Confidence used to use. A single decisive Tier-1 contradiction (weight
 * -3, e.g. a dismissal that guts the premise) is enough on its own to drop
 * a fresh signal straight to "collapsed" — matching how the Reflecting
 * Pool case actually played out.
 */
function scoreToLevel(score: number): ConfidenceLevel {
  if (score <= -3) return "collapsed";
  if (score <= 0) return "low";
  if (score < 3) return "moderate";
  return "high";
}

function effectiveDate(item: Evidence): string {
  return item.sourcePublishedAt ?? item.createdAt;
}

interface TrajectoryPoint {
  date: string; // ISO date/timestamp
  evidence: Evidence;
  cumulativeScore: number;
  label: ConfidenceLevel;
}

/**
 * The evidence-balance trajectory behind Premise Strength: each item,
 * sorted by when its source was actually published (falling back to when
 * it was added to the dashboard if no source date is known), contributes a
 * signed, tier-weighted amount to a running total. This is "closeness to
 * the stated premise" — reporting what the evidence shows over time,
 * not a belief the site is asserting.
 */
export function computePremiseStrengthTrajectory(evidence: Evidence[]): TrajectoryPoint[] {
  const sorted = [...evidence].sort(
    (a, b) => new Date(effectiveDate(a)).getTime() - new Date(effectiveDate(b)).getTime(),
  );

  let cumulativeScore = 0;
  return sorted.map((item) => {
    const signedWeight = TIER_WEIGHT[item.tier] * (item.direction === "supports" ? 1 : -1);
    cumulativeScore += signedWeight;
    return {
      date: effectiveDate(item),
      evidence: item,
      cumulativeScore,
      label: scoreToLevel(cumulativeScore),
    };
  });
}

/** The current Premise Strength label — the last point in the trajectory. Defaults to "low" with no evidence yet. */
export function currentPremiseStrength(evidence: Evidence[]): ConfidenceLevel {
  const trajectory = computePremiseStrengthTrajectory(evidence);
  if (trajectory.length === 0) return "low";
  return trajectory[trajectory.length - 1].label;
}

/**
 * Normalized chart points for the SVG trajectory — same shape/scale as any
 * other chart on the site. Returns [] if there's no real time span to plot
 * (e.g. every item was added in the same dashboard session with no source
 * dates set) — every point would land on the same x, which isn't a
 * timeline, just a stack of overlapping dots.
 */
export function evidenceToChartPoints(evidence: Evidence[]): ChartPoint[] {
  const trajectory = computePremiseStrengthTrajectory(evidence);
  if (trajectory.length === 0) return [];

  const first = new Date(trajectory[0].date).getTime();
  const last = new Date(trajectory[trajectory.length - 1].date).getTime();
  if (last === first) return [];

  const span = last - first;

  return trajectory.map((point) => ({
    x: (new Date(point.date).getTime() - first) / span,
    y: CONFIDENCE_Y[point.label],
    label: point.evidence.sourceName,
    isoDate: point.date,
  }));
}
