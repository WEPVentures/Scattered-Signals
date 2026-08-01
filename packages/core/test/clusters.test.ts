import { test } from "node:test";
import assert from "node:assert/strict";
import { computeClusterCount } from "../src/clusters.ts";
import type { Evidence } from "../src/types.ts";

function evidenceItem(clusterNo: number, overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `ev-${clusterNo}-${Math.random()}`,
    signalId: "sig-1",
    tier: "1",
    direction: "supports",
    clusterNo,
    sourceName: "Test Source",
    sourceUrl: null,
    description: "Test evidence",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    sourcePublishedAt: null,
    ...overrides,
  };
}

test("computeClusterCount counts distinct clusters, not evidence items", () => {
  const evidence = [evidenceItem(1), evidenceItem(1), evidenceItem(2)];
  assert.equal(computeClusterCount(evidence), 2);
});

test("computeClusterCount returns 0 for no evidence", () => {
  assert.equal(computeClusterCount([]), 0);
});

test("computeClusterCount matches the Ford signal's known 3 clusters", () => {
  const evidence = [evidenceItem(1), evidenceItem(2), evidenceItem(3)];
  assert.equal(computeClusterCount(evidence), 3);
});
