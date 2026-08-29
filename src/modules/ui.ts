import { STATUS_META, SubmissionStatus } from "../types";
import { getString } from "../utils/locale";

export const HTML_NS = "http://www.w3.org/1999/xhtml";

export function html(
  doc: Document,
  tag: string,
  className?: string,
): HTMLElement {
  const el = doc.createElementNS(HTML_NS, tag) as HTMLElement;
  if (className) {
    el.className = className;
  }
  return el;
}

export function statusLabel(status: SubmissionStatus): string {
  return getString(`status-${status}`);
}

export function statusColor(status: SubmissionStatus): string {
  return STATUS_META[status].color;
}

export function statusDot(
  doc: Document,
  status: SubmissionStatus,
): HTMLElement {
  const dot = html(doc, "span", "st-dot");
  dot.style.setProperty("--st-color", statusColor(status));
  return dot;
}

/** Colored pill: dot + localized status name. */
export function statusBadge(
  doc: Document,
  status: SubmissionStatus,
): HTMLElement {
  const badge = html(doc, "span", "st-badge");
  badge.style.setProperty("--st-color", statusColor(status));
  badge.dataset.status = status;
  const dot = html(doc, "span", "st-badge-dot");
  const label = html(doc, "span", "st-badge-label");
  label.textContent = statusLabel(status);
  badge.append(dot, label);
  return badge;
}

/** Resolve the display title of a library item, or null if it is gone. */
export function getItemTitle(
  libraryID: number,
  itemKey: string,
): string | null {
  try {
    const itemID = Zotero.Items.getIDFromLibraryAndKey(libraryID, itemKey);
    if (!itemID) {
      return null;
    }
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) {
      return null;
    }
    return item.getField("title") || item.getDisplayTitle() || "";
  } catch (e) {
    ztoolkit.log("submissiontracker: getItemTitle failed", e);
    return null;
  }
}
