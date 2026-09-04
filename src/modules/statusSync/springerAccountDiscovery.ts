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

const ACCOUNT_URL = "https://link.springernature.com/home/?tab=submitted";
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
    const response = await this.session.requestSpringer(ACCOUNT_URL);
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
