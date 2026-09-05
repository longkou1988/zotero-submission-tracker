import type { SubmissionStatus } from "../../types";
import type { NormalizationResult } from "./types";

export interface ExactStatusMappingEntry {
  canonicalStatus: SubmissionStatus;
  detailLabel?: string | null;
}

export function normalizeExactStatus(
  rawStatus: string,
  mapping: Readonly<Record<string, ExactStatusMappingEntry>>,
): NormalizationResult {
  const match = mapping[rawStatus];
  if (!match) {
    return {
      canonicalStatus: null,
      confidence: "unknown",
      detailLabel: null,
    };
  }
  return {
    canonicalStatus: match.canonicalStatus,
    confidence: "high",
    detailLabel: match.detailLabel ?? null,
  };
}
