import type { SubmissionStatus } from "../../types";

export type ProviderKind = "springer_nature";

export type SyncConfidence = "high" | "unknown";

export type SyncAuthState = "unknown" | "connected" | "reauth_required";

export type SyncErrorCode =
  | "NO_NETWORK"
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "UNKNOWN_STATUS"
  | "PARSE_ERROR"
  | "IDENTITY_MISMATCH"
  | "TRANSITION_CONFLICT"
  | "SERVER_ERROR"
  | "PROVIDER_UNSUPPORTED";

export type SyncHistoryEventType =
  | "RAW_STATUS_CHANGED"
  | "CANONICAL_STATUS_CHANGED"
  | "AUTH_REQUIRED"
  | "AUTH_RECOVERED"
  | "UNKNOWN_STATUS"
  | "IDENTITY_MISMATCH"
  | "STATUS_CONFLICT"
  | "PARSE_ERROR"
  | "SYNC_ERROR"
  | "SYNC_RECOVERED";

export interface ProviderSnapshot {
  provider: ProviderKind;
  rawStatus: string;
  providerDetailCode: string | null;
  sourceStatusDate: string | null;
  manuscriptId: string | null;
  articleTitle: string | null;
  journal: string | null;
  detectedAt: number;
}

export interface NormalizationResult {
  canonicalStatus: SubmissionStatus | null;
  confidence: SyncConfidence;
  detailLabel: string | null;
}
