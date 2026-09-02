import type { NormalizationResult } from "./types";

export type SpringerDetailCode = "revision_requested";

export interface SpringerStatusFieldsInput {
  headline: string | null | undefined;
  texts: readonly string[];
}

export interface SpringerStatusObservation {
  rawStatus: string;
  detailCode: SpringerDetailCode | null;
  sourceStatusDate: string | null;
  revisionDueDate: string | null;
}

const ACTION_NEEDED = "Action needed";
const REVISION_FEEDBACK_PREFIX =
  "Your reviewers have provided feedback on your submission.";
const REVISION_REQUIRED_TEXT =
  "There are revisions you need to make before your submission can progress.";
const REVISION_DUE_PATTERN =
  /^We recommend submitting your revisions by (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})\.$/;

const MONTHS: Readonly<Record<string, string>> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

export function parseSpringerStatusFields(
  input: SpringerStatusFieldsInput,
): SpringerStatusObservation {
  const rawStatus = normalizeWhitespace(input.headline);
  const texts = input.texts.map(normalizeWhitespace).filter(Boolean);

  return {
    rawStatus,
    detailCode: detectDetailCode(rawStatus, texts),
    sourceStatusDate: null,
    revisionDueDate: extractRevisionDueDate(texts),
  };
}

export function normalizeSpringerObservation(
  observation: SpringerStatusObservation,
): NormalizationResult {
  if (
    observation.rawStatus === ACTION_NEEDED &&
    observation.detailCode === "revision_requested"
  ) {
    return {
      canonicalStatus: null,
      confidence: "unknown",
      detailLabel: "Revision requested",
    };
  }

  return {
    canonicalStatus: null,
    confidence: "unknown",
    detailLabel: null,
  };
}

function detectDetailCode(
  rawStatus: string,
  texts: readonly string[],
): SpringerDetailCode | null {
  if (rawStatus !== ACTION_NEEDED) {
    return null;
  }

  const revisionText = texts.find((text) =>
    text.startsWith(REVISION_FEEDBACK_PREFIX),
  );
  if (!revisionText || !revisionText.includes(REVISION_REQUIRED_TEXT)) {
    return null;
  }
  return "revision_requested";
}

function extractRevisionDueDate(texts: readonly string[]): string | null {
  for (const text of texts) {
    const match = REVISION_DUE_PATTERN.exec(text);
    if (!match) {
      continue;
    }
    const [, dayText, monthText, year] = match;
    const month = MONTHS[monthText];
    if (!month) {
      continue;
    }
    const day = dayText.padStart(2, "0");
    const iso = `${year}-${month}-${day}`;
    if (isIsoDate(iso)) {
      return iso;
    }
  }
  return null;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
