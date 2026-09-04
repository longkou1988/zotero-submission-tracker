export type SpringerSourceSystem =
  | "snapp"
  | "editorial_manager"
  | "unknown";

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
