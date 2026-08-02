import type { Signal } from "./types.ts";

export interface ClaimCardCopy {
  /** Card header. Always "Plot in Progress" or "Plot Outcome" — never "Claim Resolved"/"Plot Resolved". */
  label: string;
  /** The claim text itself, verbatim (e.g. the actual charge or commitment). */
  claimText: string;
  /** Status line under the claim text. */
  statusText: string;
  /** For CSS: applies the muted-red treatment only when the claim missed. */
  isMissed: boolean;
}

export interface StatusPillCopy {
  /** Homepage/list pill label. */
  label: string;
  variant: "ongoing" | "hit" | "missed" | "partial";
}

const BANNED_STATUS_TEXT = /^\s*(claim )?resolved\s*$/i;

/**
 * The single enforced location for claim-status wording. The site reports
 * outcomes attributed to their source ("Dismissed by federal prosecutors,
 * July 31, 2026") — it never delivers its own verdict ("Claim Resolved:
 * did not hold"). Any caller (dashboard preview, static generator, AI
 * draft renderer) goes through this function so that rule can't be
 * bypassed by a new code path forgetting it.
 */
export function formatClaimStatus(signal: Signal): ClaimCardCopy | null {
  if (signal.type !== "claim" || !signal.claimStatus || !signal.claimText) {
    return null;
  }

  if (signal.claimStatus === "pending") {
    const resolves = signal.claimResolvesAround
      ? ` · Resolves ${signal.claimResolvesAround}`
      : "";
    return {
      label: "Plot in Progress",
      claimText: signal.claimText,
      statusText: `Ongoing${resolves} · Will be scored Confirmed / Disproven / Partial`,
      isMissed: false,
    };
  }

  // resolved
  if (!signal.claimResolutionNote || BANNED_STATUS_TEXT.test(signal.claimResolutionNote)) {
    throw new Error(
      `Signal "${signal.slug}" is resolved but claimResolutionNote is missing or unattributed ` +
        `("${signal.claimResolutionNote ?? ""}"). Write an attributed sentence, e.g. ` +
        `"Dismissed by federal prosecutors, July 31, 2026 · The vandalism charge did not hold up."`,
    );
  }

  return {
    label: "Plot Outcome",
    claimText: signal.claimText,
    statusText: signal.claimResolutionNote,
    isMissed: signal.claimOutcome === "missed",
  };
}

/** Pill shown on the homepage list row. */
export function formatStatusPill(signal: Signal): StatusPillCopy {
  if (signal.type !== "claim" || signal.claimStatus !== "resolved") {
    return { label: "Ongoing", variant: "ongoing" };
  }

  switch (signal.claimOutcome) {
    case "hit":
      return { label: "Resolved", variant: "hit" };
    case "partial":
      return { label: "Resolved", variant: "partial" };
    case "missed":
    default:
      return { label: "Resolved", variant: "missed" };
  }
}
