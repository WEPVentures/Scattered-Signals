import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClaimStatus, formatStatusPill, currentStatusWord } from "../src/claimCopy.ts";
import type { Signal } from "../src/types.ts";

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig-1",
    slug: "reflecting-pool",
    title: "The Lincoln Memorial Reflecting Pool case",
    categorySlug: "culture-policy",
    type: "claim",
    isTop: true,
    confidence: "collapsed",
    velocity: "falling",
    velocityIsManualOverride: false,
    claimText: "Federal charge: deliberate destruction of government property (vandalism), David Hearn.",
    claimResolvesAround: null,
    claimStatus: "resolved",
    claimOutcome: "missed",
    claimResolutionNote:
      "Dismissed by federal prosecutors, July 31, 2026 · The vandalism charge did not hold up",
    claimResolvedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

test("formatClaimStatus never emits the bare 'Claim Resolved' verdict label", () => {
  const result = formatClaimStatus(baseSignal());
  assert.ok(result);
  assert.equal(result!.label, "Plot Outcome");
  assert.notEqual(result!.label, "Claim Resolved");
});

test("formatClaimStatus throws if a resolved claim has no attributed resolution note", () => {
  assert.throws(() => formatClaimStatus(baseSignal({ claimResolutionNote: null })));
});

test("formatClaimStatus throws if the resolution note is just the bare word 'Resolved'", () => {
  assert.throws(() => formatClaimStatus(baseSignal({ claimResolutionNote: "Resolved" })));
});

test("formatClaimStatus renders a pending claim without a verdict", () => {
  const result = formatClaimStatus(
    baseSignal({
      claimStatus: "pending",
      claimOutcome: null,
      claimResolutionNote: null,
      claimResolvesAround: "~Q1 2027",
    }),
  );
  assert.ok(result);
  assert.equal(result!.label, "Plot in Progress");
  assert.match(result!.statusText, /Ongoing/);
});

test("formatClaimStatus returns null for trends (no bounded claim)", () => {
  const result = formatClaimStatus(baseSignal({ type: "trend", claimStatus: null }));
  assert.equal(result, null);
});

test("formatStatusPill maps missed claims to the 'missed' pill variant", () => {
  const pill = formatStatusPill(baseSignal());
  assert.equal(pill.label, "Resolved");
  assert.equal(pill.variant, "missed");
});

test("formatStatusPill maps ongoing signals to 'Ongoing'", () => {
  const pill = formatStatusPill(baseSignal({ claimStatus: "pending", claimOutcome: null }));
  assert.equal(pill.label, "Ongoing");
  assert.equal(pill.variant, "ongoing");
});

test("currentStatusWord maps resolved claim outcomes to their one-word verdict", () => {
  assert.equal(currentStatusWord(baseSignal({ claimOutcome: "hit" })), "Confirmed");
  assert.equal(currentStatusWord(baseSignal({ claimOutcome: "missed" })), "Disproven");
  assert.equal(currentStatusWord(baseSignal({ claimOutcome: "partial" })), "Partial");
});

test("currentStatusWord returns 'Ongoing' for a pending claim", () => {
  assert.equal(
    currentStatusWord(baseSignal({ claimStatus: "pending", claimOutcome: null })),
    "Ongoing",
  );
});

test("currentStatusWord returns 'Ongoing' for every Living Topic, which never resolves", () => {
  assert.equal(
    currentStatusWord(baseSignal({ type: "trend", claimStatus: null, claimOutcome: null })),
    "Ongoing",
  );
});
