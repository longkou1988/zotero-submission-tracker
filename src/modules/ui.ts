import { STATUS_LIST, STATUS_META, SubmissionStatus } from "../types";
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

/**
 * Pick the submission status by clicking colored pills. Used instead of a
 * <select>: HTML select popups do not open in toolkit dialog windows.
 */
export function buildStatusPicker(
  doc: Document,
  selected: SubmissionStatus,
): { el: HTMLElement; get value(): SubmissionStatus } {
  const root = html(doc, "div", "st-statuspicker");
  let value: SubmissionStatus = selected;
  const pills = new Map<SubmissionStatus, HTMLElement>();
  for (const status of STATUS_LIST) {
    const pill = html(doc, "button", "st-pill") as HTMLButtonElement;
    pill.type = "button";
    pill.style.setProperty("--st-color", statusColor(status));
    pill.dataset.status = status;
    const dot = html(doc, "span", "st-badge-dot");
    const label = html(doc, "span", "st-pill-label");
    label.textContent = statusLabel(status);
    pill.append(dot, label);
    if (status === selected) {
      pill.classList.add("st-pill--selected");
    }
    pill.addEventListener("click", () => {
      value = status;
      for (const [, el] of pills) {
        el.classList.remove("st-pill--selected");
      }
      pill.classList.add("st-pill--selected");
    });
    pills.set(status, pill);
    root.appendChild(pill);
  }
  return {
    el: root,
    get value(): SubmissionStatus {
      return value;
    },
  };
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
    // Untitled items have an empty title field; fall back to Zotero's own
    // display title (creator-year etc.) and never treat them as missing.
    const title = item.getField("title");
    if (title) {
      return title;
    }
    const display = item.getDisplayTitle ? item.getDisplayTitle() : "";
    if (display) {
      return display;
    }
    return getString("dashboard-untitled-item");
  } catch (e) {
    ztoolkit.log("submissiontracker: getItemTitle failed", e);
    return null;
  }
}
