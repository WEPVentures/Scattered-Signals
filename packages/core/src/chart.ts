import type { ConfidenceLevel } from "./types.ts";

// Shared Y-scale: every chart on the site plots the same four levels at the
// same heights, so "collapsed" always sits at the bottom and "high" always
// sits at the top regardless of which signal you're looking at.
export const CONFIDENCE_Y: Record<ConfidenceLevel, number> = {
  collapsed: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

export interface ChartPoint {
  x: number; // 0..1 across the chart width
  // Meaning depends on which function produced it: evidenceToChartPoints
  // (Bounded Claims) uses 0 (collapsed)..3 (high); evidenceToPlotMovementPoints
  // (Living Topics) uses -1 (pole B)..1 (pole A), 0 = neutral.
  y: number;
  label: string;
  isoDate: string;
  evidenceId: string; // lets the caller cross-reference this point back to the evidence list
}
