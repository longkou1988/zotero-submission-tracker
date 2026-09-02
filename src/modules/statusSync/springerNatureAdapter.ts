import type { SubmissionRecord } from "../../types";
import type { StatusProviderAdapter } from "./engine";
import type { SpringerSessionResponse } from "./sessionManager";
import type {
  NormalizationResult,
  ProviderSnapshot,
  SyncErrorCode,
} from "./types";

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

interface SpringerElementLike {
  textContent?: string | null;
}

interface SpringerDocumentLike {
  querySelector(selector: string): SpringerElementLike | null;
  querySelectorAll(selector: string): ArrayLike<SpringerElementLike>;
}

interface SpringerSessionTransport {
  requestSpringer(url: string): Promise<SpringerSessionResponse>;
}

export interface SpringerNatureAdapterDeps {
  session: SpringerSessionTransport;
  parseDocument?: (documentHTML: string) => SpringerDocumentLike;
  now?: () => number;
}

const ACTION_NEEDED = "Action needed";
const REVISION_FEEDBACK_PREFIX =
  "Your reviewers have provided feedback on your submission.";
const REVISION_REQUIRED_TEXT =
  "There are revisions you need to make before your submission can progress.";
const REVISION_DUE_PATTERN =
  /^We recommend submitting your revisions by (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})\.$/;
const STATUS_HEADLINE_SELECTOR = '[data-test="current-status-headline"]';
const STATUS_TEXT_SELECTOR = '[data-test="current-status-text"]';

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

export class SpringerNatureAdapterError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = "SpringerNatureAdapterError";
    this.code = code;
  }
}

export class SpringerNatureAdapter implements StatusProviderAdapter {
  readonly provider = "springer_nature" as const;
  private readonly session: SpringerSessionTransport;
  private readonly parseDocument: (documentHTML: string) => SpringerDocumentLike;
  private readonly now: () => number;

  constructor(deps: SpringerNatureAdapterDeps) {
    this.session = deps.session;
    this.parseDocument = deps.parseDocument ?? parseHtmlDocument;
    this.now = deps.now ?? Date.now;
  }

  supports(url: string): boolean {
    return isSpringerSubmissionDetailsUrl(url);
  }

  async fetchSnapshot(submission: SubmissionRecord): Promise<ProviderSnapshot> {
    const url = submission.statusUrl;
    if (!url || !this.supports(url)) {
      throw new SpringerNatureAdapterError(
        "PROVIDER_UNSUPPORTED",
        "Unsupported Springer Nature submission URL",
      );
    }

    const response = await this.session.requestSpringer(url);
    const documentLike = this.parseDocument(response.documentHTML);
    const observation = parseSpringerStatusDocument(documentLike);
    if (!observation.rawStatus) {
      throw new SpringerNatureAdapterError(
        "PARSE_ERROR",
        "Springer Nature status could not be read from the observed DOM fields",
      );
    }

    return {
      provider: this.provider,
      rawStatus: observation.rawStatus,
      providerDetailCode: observation.detailCode,
      sourceStatusDate: observation.sourceStatusDate,
      manuscriptId: null,
      articleTitle: null,
      journal: null,
      detectedAt: this.now(),
    };
  }

  normalize(snapshot: ProviderSnapshot): NormalizationResult {
    return normalizeSpringerObservation({
      rawStatus: snapshot.rawStatus,
      detailCode: isSpringerDetailCode(snapshot.providerDetailCode)
        ? snapshot.providerDetailCode
        : null,
      sourceStatusDate: snapshot.sourceStatusDate,
      revisionDueDate: null,
    });
  }
}

export function parseSpringerStatusDocument(
  documentLike: SpringerDocumentLike,
): SpringerStatusObservation {
  const headline = documentLike.querySelector(STATUS_HEADLINE_SELECTOR);
  const texts = Array.from(
    documentLike.querySelectorAll(STATUS_TEXT_SELECTOR),
  ).map((element) => String(element.textContent || ""));
  return parseSpringerStatusFields({
    headline: headline?.textContent,
    texts,
  });
}

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

function isSpringerSubmissionDetailsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLocaleLowerCase() !== "submission.springernature.com"
    ) {
      return false;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    return (
      parts.length === 2 &&
      parts[0] === "submission-details" &&
      parts[1].trim().length > 0
    );
  } catch {
    return false;
  }
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

function isSpringerDetailCode(value: string | null): value is SpringerDetailCode {
  return value === "revision_requested";
}

function isIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function parseHtmlDocument(documentHTML: string): SpringerDocumentLike {
  return new DOMParser().parseFromString(documentHTML, "text/html");
}
