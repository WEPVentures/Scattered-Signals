import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePremiseStrengthTrajectory,
  currentPremiseStrength,
  currentPoleLean,
  evidenceToChartPoints,
  evidenceToPlotMovementPoints,
} from "../src/premiseStrength.ts";
import type { Evidence } from "../src/types.ts";

function evidenceItem(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `ev-${Math.random()}`,
    signalId: "sig-1",
    tier: "2",
    direction: "supports",
    clusterNo: 1,
    sourceName: "Test Source",
    sourceUrl: null,
    description: "Test evidence",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    sourcePublishedAt: null,
    ...overrides,
  };
}

test("currentPremiseStrength defaults to low with no evidence", () => {
  assert.equal(currentPremiseStrength([]), "low");
});

test("a single Tier 1 supporting item reaches high", () => {
  const evidence = [evidenceItem({ tier: "1", direction: "supports", clusterNo: 1 })];
  assert.equal(currentPremiseStrength(evidence), "high");
});

test("weaker evidence lands on moderate, not high", () => {
  const evidence = [
    evidenceItem({ tier: "2", direction: "supports", clusterNo: 1 }),
    evidenceItem({ tier: "2", direction: "supports", clusterNo: 2 }),
  ];
  assert.equal(currentPremiseStrength(evidence), "moderate");
});

test("sorts by sourcePublishedAt, not the order evidence was entered", () => {
  const evidence = [
    evidenceItem({
      sourcePublishedAt: "2026-06-01",
      tier: "1",
      direction: "contradicts",
      clusterNo: 2,
    }),
    evidenceItem({
      sourcePublishedAt: "2026-01-01",
      tier: "1",
      direction: "supports",
      clusterNo: 1,
    }),
  ];
  const trajectory = computePremiseStrengthTrajectory(evidence);
  assert.equal(trajectory[0].date, "2026-01-01");
  assert.equal(trajectory[0].label, "high");
  assert.equal(trajectory[1].date, "2026-06-01");
});

test("reproduces the Reflecting Pool arc: indictment, denial, decisive dismissal -> collapsed", () => {
  const evidence = [
    evidenceItem({
      sourcePublishedAt: "2026-07-02",
      tier: "1",
      direction: "supports",
      clusterNo: 1,
      sourceName: "Federal indictment",
    }),
    evidenceItem({
      sourcePublishedAt: "2026-07-02",
      tier: "1",
      direction: "contradicts",
      clusterNo: 2,
      sourceName: "Hearn's denial",
    }),
    evidenceItem({
      sourcePublishedAt: "2026-07-31",
      tier: "1",
      direction: "contradicts",
      clusterNo: 3,
      sourceName: "DOJ motion to dismiss",
    }),
  ];
  const trajectory = computePremiseStrengthTrajectory(evidence);
  assert.equal(trajectory[0].label, "high"); // indictment alone
  assert.equal(trajectory[1].label, "low"); // denial cancels it out
  assert.equal(trajectory[2].label, "collapsed"); // decisive dismissal
  assert.equal(currentPremiseStrength(evidence), "collapsed");
});

test("falls back to createdAt when sourcePublishedAt is null", () => {
  const evidence = [
    evidenceItem({ createdAt: "2026-03-01T00:00:00.000Z", sourcePublishedAt: null }),
  ];
  const trajectory = computePremiseStrengthTrajectory(evidence);
  assert.equal(trajectory[0].date, "2026-03-01T00:00:00.000Z");
});

test("evidenceToChartPoints returns empty for no evidence", () => {
  assert.deepEqual(evidenceToChartPoints([]), []);
});

test("evidenceToChartPoints returns empty when every item has the same effective date", () => {
  const evidence = [
    evidenceItem({ createdAt: "2026-07-01T00:00:00.000Z", clusterNo: 1 }),
    evidenceItem({ createdAt: "2026-07-01T00:00:00.000Z", clusterNo: 2 }),
    evidenceItem({ createdAt: "2026-07-01T00:00:00.000Z", clusterNo: 3 }),
  ];
  assert.deepEqual(evidenceToChartPoints(evidence), []);
});

test("evidenceToChartPoints normalizes x between 0 and 1 in chronological order", () => {
  const evidence = [
    evidenceItem({ sourcePublishedAt: "2026-01-01", clusterNo: 1 }),
    evidenceItem({ sourcePublishedAt: "2026-04-01", clusterNo: 2 }),
    evidenceItem({ sourcePublishedAt: "2026-07-01", clusterNo: 3 }),
  ];
  const points = evidenceToChartPoints(evidence);
  assert.equal(points[0].x, 0);
  assert.equal(points[points.length - 1].x, 1);
  assert.ok(points[1].x > 0 && points[1].x < 1);
});

test("currentPoleLean is neutral (0) with no evidence", () => {
  assert.equal(currentPoleLean([]), 0);
});

test("currentPoleLean is positive when evidence supports (leans pole A)", () => {
  const evidence = [evidenceItem({ tier: "1", direction: "supports", clusterNo: 1 })];
  assert.ok(currentPoleLean(evidence) > 0);
});

test("currentPoleLean is negative when evidence contradicts (leans pole B)", () => {
  const evidence = [evidenceItem({ tier: "1", direction: "contradicts", clusterNo: 1 })];
  assert.ok(currentPoleLean(evidence) < 0);
});

test("currentPoleLean stays strictly within (-1, 1) regardless of how lopsided the evidence is", () => {
  const evidence = Array.from({ length: 12 }, (_, i) =>
    evidenceItem({ tier: "1", direction: "supports", clusterNo: i + 1, sourcePublishedAt: `2026-01-${i + 1}` }),
  );
  const lean = currentPoleLean(evidence);
  assert.ok(lean > 0 && lean < 1);
});

test("more Tier 1 support pushes currentPoleLean closer to +1 than a single item does", () => {
  const oneItem = [evidenceItem({ tier: "1", direction: "supports", clusterNo: 1, sourcePublishedAt: "2026-01-01" })];
  const threeItems = [
    evidenceItem({ tier: "1", direction: "supports", clusterNo: 1, sourcePublishedAt: "2026-01-01" }),
    evidenceItem({ tier: "1", direction: "supports", clusterNo: 2, sourcePublishedAt: "2026-02-01" }),
    evidenceItem({ tier: "1", direction: "supports", clusterNo: 3, sourcePublishedAt: "2026-03-01" }),
  ];
  assert.ok(currentPoleLean(threeItems) > currentPoleLean(oneItem));
});

test("evidenceToPlotMovementPoints returns empty for no evidence", () => {
  assert.deepEqual(evidenceToPlotMovementPoints([]), []);
});

test("evidenceToPlotMovementPoints returns empty when every item has the same effective date", () => {
  const evidence = [
    evidenceItem({ createdAt: "2026-07-01T00:00:00.000Z", clusterNo: 1 }),
    evidenceItem({ createdAt: "2026-07-01T00:00:00.000Z", clusterNo: 2 }),
  ];
  assert.deepEqual(evidenceToPlotMovementPoints(evidence), []);
});

test("evidenceToPlotMovementPoints' y sign matches direction and stays within (-1, 1)", () => {
  const evidence = [
    evidenceItem({ tier: "1", direction: "supports", clusterNo: 1, sourcePublishedAt: "2026-01-01" }),
    evidenceItem({ tier: "1", direction: "contradicts", clusterNo: 2, sourcePublishedAt: "2026-02-01" }),
  ];
  const points = evidenceToPlotMovementPoints(evidence);
  assert.ok(points[0].y > 0 && points[0].y < 1); // one supporting item -> leans positive (pole A)
  assert.ok(points[1].y < points[0].y); // the contradicting item pulls it back down
  assert.ok(points.every((p) => p.y > -1 && p.y < 1));
});
