import type {
  ResolvedSpringerIdentity,
  SpringerAccountScanResult,
  SpringerDiscoveryCandidate,
  SpringerDiscoverySession,
  SpringerSourceSystem,
  UnresolvedDiscoveryCandidate,
} from "./discoveryTypes";

interface AccountElementLike {
  textContent?: string | null;
  href?: string | null;
  getAttribute?(name: string): string | null;
  querySelector?(selector: string): AccountElementLike | null;
}

interface AccountDocumentLike {
  querySelectorAll(selector: string): ArrayLike<AccountElementLike>;
}

interface SpringerAccountDiscoveryDeps {
  session: SpringerDiscoverySession;
  parseDocument?: (documentHTML: string) => AccountDocumentLike;
}

export interface SpringerDiscoveryCheckCard {
  index: number;
  sourceSystem: SpringerSourceSystem;
  resolution: "resolved" | "unresolved";
  finalPage: "submission_details" | "other" | "not_followed";
  providerSubmissionIdRedacted: "[id]" | null;
  reason: string | null;
}

export interface SpringerDiscoveryCheckResult {
  cardCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  cards: SpringerDiscoveryCheckCard[];
}

export interface SpringerAccountDiagnostics {
  finalOrigin: string;
  finalPath: string;
  documentLength: number;
  hasResearchTrackerContainer: boolean;
  hasSubmissionsList: boolean;
  hasCountLabel: boolean;
  trackerItemMarkerCount: number;
}

export const SPRINGER_ACCOUNT_URL =
  "https://link.springernature.com/home/?tab=submitted";
const ITEM_SELECTOR = '[data-test="research-tracker-item"]';
const TITLE_SELECTOR = '[data-test="research-content-card-title"]';
const SUBTITLE_SELECTOR = '[data-test="research-content-card-subtitle"]';
const STATUS_SELECTOR = '[data-test="research-content-card-status-info"]';
const UPDATED_SELECTOR = '[data-test="research-content-card-last-updated"]';
const SNAPP_LINK_SELECTOR = '[data-test="submission-card-link--snapp"]';
const EM_LINK_SELECTOR = '[data-test="submission-card-link--em"]';

export class SpringerAccountDiscovery {
  private readonly session: SpringerDiscoverySession;
  private readonly parseDocument: (documentHTML: string) => AccountDocumentLike;

  constructor(deps: SpringerAccountDiscoveryDeps) {
    this.session = deps.session;
    this.parseDocument = deps.parseDocument ?? parseAccountHtmlDocument;
  }

  async scanAccount(): Promise<SpringerAccountScanResult> {
    const response = await this.session.requestSpringer(SPRINGER_ACCOUNT_URL);
    const documentLike = this.parseDocument(response.documentHTML);
    const candidates = parseSpringerAccountDocument(documentLike);
    const resolved: SpringerAccountScanResult["resolved"] = [];
    const unresolved: SpringerAccountScanResult["unresolved"] = [];

    for (const candidate of candidates) {
      if (!candidate.title.trim()) {
        unresolved.push(withUnresolvedReason(candidate, "missing_title"));
        continue;
      }

      const identity = resolveSpringerSubmissionIdentity(candidate.entryUrl);
      if (identity) {
        resolved.push({ ...candidate, ...identity });
        continue;
      }

      unresolved.push(
        withUnresolvedReason(
          candidate,
          candidate.sourceSystem === "editorial_manager"
            ? "requires_runtime_resolution"
            : "unsupported_link",
        ),
      );
    }

    return { resolved, unresolved };
  }
}

export function buildSpringerAccountDiagnostics(response: {
  finalUrl: string;
  documentHTML: string;
}): SpringerAccountDiagnostics {
  let finalOrigin = "invalid";
  let finalPath = "invalid";
  try {
    const url = new URL(response.finalUrl);
    finalOrigin = url.origin;
    finalPath = url.pathname;
  } catch {
    // Keep only non-sensitive sentinel values for malformed locations.
  }

  const html = response.documentHTML;
  const countMarker = (marker: string) =>
    html.split(`data-test=\"${marker}\"`).length -
    1 +
    (html.split(`data-test='${marker}'`).length - 1);

  return {
    finalOrigin,
    finalPath,
    documentLength: html.length,
    hasResearchTrackerContainer: countMarker("research-tracker-container") > 0,
    hasSubmissionsList: countMarker("submissions-list") > 0,
    hasCountLabel: countMarker("research-tracker-count-label") > 0,
    trackerItemMarkerCount: countMarker("research-tracker-item"),
  };
}

export function toSpringerDiscoveryCheckResult(
  scan: SpringerAccountScanResult,
): SpringerDiscoveryCheckResult {
  const resolved: SpringerDiscoveryCheckCard[] = scan.resolved.map((item) => ({
    index: item.index,
    sourceSystem: item.sourceSystem,
    resolution: "resolved",
    finalPage: "submission_details",
    providerSubmissionIdRedacted: "[id]",
    reason: null,
  }));
  const unresolved: SpringerDiscoveryCheckCard[] = scan.unresolved.map(
    (item) => ({
      index: item.index,
      sourceSystem: item.sourceSystem,
      resolution: "unresolved",
      finalPage: "not_followed",
      providerSubmissionIdRedacted: null,
      reason: item.unresolvedReason,
    }),
  );
  const cards = [...resolved, ...unresolved].sort((a, b) => a.index - b.index);

  return {
    cardCount: cards.length,
    resolvedCount: resolved.length,
    unresolvedCount: unresolved.length,
    cards,
  };
}

export function parseSpringerAccountDocument(
  documentLike: AccountDocumentLike,
): SpringerDiscoveryCandidate[] {
  return Array.from(documentLike.querySelectorAll(ITEM_SELECTOR)).map(
    (card, index) => {
      const snappLink = card.querySelector?.(SNAPP_LINK_SELECTOR) || null;
      const emLink = card.querySelector?.(EM_LINK_SELECTOR) || null;
      const link = snappLink || emLink;

      return {
        index: index + 1,
        sourceSystem: getSourceSystem(snappLink, emLink),
        title: readText(card, TITLE_SELECTOR) || "",
        journal: readText(card, SUBTITLE_SELECTOR),
        rawStatus: readText(card, STATUS_SELECTOR),
        lastUpdatedText: readText(card, UPDATED_SELECTOR),
        entryUrl: readHref(link),
      };
    },
  );
}

export function resolveSpringerSubmissionIdentity(
  finalUrl: string,
): ResolvedSpringerIdentity | null {
  try {
    const url = new URL(finalUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "submission.springernature.com"
    ) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts.length !== 2 ||
      parts[0] !== "submission-details" ||
      !parts[1].trim()
    ) {
      return null;
    }

    const providerSubmissionId = parts[1];
    return {
      providerSubmissionId,
      statusUrl: `https://submission.springernature.com/submission-details/${providerSubmissionId}`,
    };
  } catch {
    return null;
  }
}

function withUnresolvedReason(
  candidate: SpringerDiscoveryCandidate,
  unresolvedReason: UnresolvedDiscoveryCandidate["unresolvedReason"],
): UnresolvedDiscoveryCandidate {
  return { ...candidate, unresolvedReason };
}

function readText(card: AccountElementLike, selector: string): string | null {
  return normalizeNullable(card.querySelector?.(selector)?.textContent);
}

function readHref(element: AccountElementLike | null): string {
  if (!element) {
    return "";
  }
  return String(element.href || element.getAttribute?.("href") || "").trim();
}

function getSourceSystem(
  snappLink: AccountElementLike | null,
  emLink: AccountElementLike | null,
): SpringerSourceSystem {
  if (snappLink) {
    return "snapp";
  }
  if (emLink) {
    return "editorial_manager";
  }
  return "unknown";
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function parseAccountHtmlDocument(documentHTML: string): AccountDocumentLike {
  return new DOMParser().parseFromString(documentHTML, "text/html");
}
