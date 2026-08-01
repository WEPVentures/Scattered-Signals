import type { ConfidenceSnapshot } from "./types.ts";

const CONFIDENCE_Y: Record<ConfidenceSnapshot["confidence"], number> = {
  collapsed: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

export interface ChartPoint {
  x: number; // 0..1 across the chart width
  y: number; // 0 (collapsed) .. 3 (high)
  label: string;
  isoDate: string;
}

/** Maps confidence_snapshots (oldest first) onto normalized chart points for the SVG trajectory. */
export function snapshotsToChartPoints(
  snapshotsOldestFirst: ConfidenceSnapshot[],
): ChartPoint[] {
  if (snapshotsOldestFirst.length === 0) return [];

  const first = new Date(snapshotsOldestFirst[0].recordedAt).getTime();
  const last = new Date(
    snapshotsOldestFirst[snapshotsOldestFirst.length - 1].recordedAt,
  ).getTime();
  const span = last - first || 1;

  return snapshotsOldestFirst.map((snap) => ({
    x: (new Date(snap.recordedAt).getTime() - first) / span,
    y: CONFIDENCE_Y[snap.confidence],
    label: snap.note ?? snap.confidence,
    isoDate: snap.recordedAt,
  }));
}
