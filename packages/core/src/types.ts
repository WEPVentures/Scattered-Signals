export type ConfidenceLevel = "low" | "moderate" | "high" | "collapsed";
export type VelocityDirection = "rising" | "falling" | "steady";
export type ClaimStatus = "pending" | "resolved";
export type ClaimOutcome = "hit" | "missed" | "partial";
export type SignalType = "trend" | "claim";
export type EvidenceTier = "1" | "2" | "3";
export type EvidenceDirection = "supports" | "contradicts";

export interface Evidence {
  id: string;
  signalId: string;
  tier: EvidenceTier;
  direction: EvidenceDirection;
  clusterNo: number;
  sourceName: string;
  sourceUrl: string | null;
  description: string;
  sortOrder: number;
  createdAt: string; // ISO timestamp
}

export interface ConfidenceSnapshot {
  id: string;
  signalId: string;
  confidence: ConfidenceLevel;
  note: string | null;
  recordedAt: string; // ISO timestamp
}

export interface Signal {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  type: SignalType;
  isTop: boolean;
  confidence: ConfidenceLevel;
  velocity: VelocityDirection;
  velocityIsManualOverride: boolean;
  claimText: string | null;
  claimResolvesAround: string | null;
  claimStatus: ClaimStatus | null;
  claimOutcome: ClaimOutcome | null;
  claimResolutionNote: string | null;
  claimResolvedAt: string | null;
}
