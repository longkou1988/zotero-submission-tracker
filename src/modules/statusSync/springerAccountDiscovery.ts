import type {
  ResolvedSpringerIdentity,
  SpringerDiscoveryCandidate,
  SpringerSourceSystem,
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

const ITEM_SELECTOR = '[data-test="research-tracker-item"]';
const TITLE_SELECTOR = '[data-test="research-content-card-title"]';
const SUBTITLE_SELECTOR = '[data-test="research-content-card-subtitle"]';
const STATUS_SELECTOR = '[data-test="research-content-card-status-info"]';
const UPDATED_SELECTOR = '[data-test="research-content-card-last-updated"]';
const SNAPP_LINK_SELECTOR = '[data-test="submission-card-link--snapp"]';
const EM_LINK_SELECTOR = '[data-test="submission-card-link--em"]';

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
