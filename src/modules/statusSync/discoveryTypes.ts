import type { SubmissionStatus } from "../../types";
import type { SyncErrorCode } from "./types";

export type SpringerSourceSystem =
  | "snapp"
  | "editorial_manager"
  | "unknown";

export type DiscoveryImportState = "pending" | "imported" | "ignored";

export type DiscoveryUnresolvedReason =
  | "missing_title"
  | "requires_runtime_resolution"
  | "unsupported_link";

export interface SpringerDiscoveryCandidate {
  index: number;
  sourceSystem: SpringerSourceSystem;
  title: string;
  journal: string | null;
  rawStatus: string | null;
  lastUpdatedText: string | null;
  entryUrl: string;
}

export interface ResolvedSpringerIdentity {
  providerSubmissionId: string;
  statusUrl: string;
}

export interface ResolvedDiscoveryCandidate
  extends SpringerDiscoveryCandidate,
    ResolvedSpringerIdentity {}

export interface UnresolvedDiscoveryCandidate
  extends SpringerDiscoveryCandidate {
  unresolvedReason: DiscoveryUnresolvedReason;
}

export interface SpringerAccountScanResult {
  resolved: ResolvedDiscoveryCandidate[];
  unresolved: UnresolvedDiscoveryCandidate[];
}

export interface SpringerDiscoverySession {
  requestSpringer(url: string): Promise<{
    finalUrl: string;
    documentHTML: string;
  }>;
}

export interface ResolvedDiscoveryUpsertInput {
  providerFamily: "springer_nature";
  sourceSystem: SpringerSourceSystem;
  providerSubmissionId: string;
  title: string;
  journal: string | null;
  manuscriptId: string | null;
  statusUrl: string;
  rawStatus: string | null;
  normalizedStatus: SubmissionStatus | null;
  progressStage: string | null;
  detailLabel: string | null;
  submittedDate: string | null;
  revisionDueDate: string | null;
  lastDetailFetchedAt: number | null;
}

export interface DiscoveredSubmissionRecord extends ResolvedDiscoveryUpsertInput {
  id: number;
  importState: DiscoveryImportState;
  linkedSubmissionId: number | null;
  lastErrorCode: SyncErrorCode | null;
  lastErrorMessage: string | null;
  discoveredAt: number;
  lastSeenAt: number;
}
