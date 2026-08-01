import { test } from "node:test";
import assert from "node:assert/strict";
import { filterEvidenceAsOf } from "../src/evidenceAsOf.ts";
import type { Evidence } from "../src/types.ts";

function evidenceItem(createdAt: string, sortOrder: number): Evidence {
  return {
    id: `ev-${createdAt}`,
    signalId: "reflecting-pool",
    tier: "1",
    direction: "supports",
    clusterNo: sortOrder,
    sourceName: "Test Source",
    sourceUrl: null,
    description: "Test evidence",
    sortOrder,
    createdAt,
    sourcePublishedAt: null,
  };
}

test("filterEvidenceAsOf reproduces the Reflecting Pool then/now split", () => {
  const evidence = [
    evidenceItem("2026-07-02T00:00:00.000Z", 0), // indictment
    evidenceItem("2026-07-02T00:00:01.000Z", 1), // denial
    evidenceItem("2026-07-31T00:00:00.000Z", 2), // DOJ dismissal
  ];

  const then = filterEvidenceAsOf(evidence, "2026-07-03T00:00:00.000Z");
  assert.equal(then.length, 2);

  const now = filterEvidenceAsOf(evidence, "2026-08-01T00:00:00.000Z");
  assert.equal(now.length, 3);
});

test("filterEvidenceAsOf sorts by sortOrder", () => {
  const evidence = [evidenceItem("2026-01-01T00:00:00.000Z", 2), evidenceItem("2026-01-01T00:00:00.000Z", 0)];
  const result = filterEvidenceAsOf(evidence, "2026-01-02T00:00:00.000Z");
  assert.deepEqual(result.map((e) => e.sortOrder), [0, 2]);
});
