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

export interface CollectionPickerOption {
  id: number | null;
  label: string;
}

/**
 * Collection picker for toolkit dialog windows. Native HTML <select> popups
 * do not open reliably there, so the option list is rendered in-document.
 */
export function buildCollectionPicker(
  doc: Document,
  options: CollectionPickerOption[],
  selected: number | null,
): { el: HTMLElement; get value(): number | null } {
  const root = html(doc, "div", "st-collectionpicker");
  const trigger = html(
    doc,
    "button",
    "st-collectionpicker-trigger",
  ) as HTMLButtonElement;
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", "false");

  const triggerLabel = html(doc, "span", "st-collectionpicker-label");
  const chevron = html(doc, "span", "st-collectionpicker-chevron");
  chevron.textContent = "▾";
  trigger.append(triggerLabel, chevron);

  const menu = html(doc, "div", "st-collectionpicker-menu");
  menu.hidden = true;
  let value: number | null = selected;
  const rows = new Map<string, HTMLElement>();

  const keyFor = (id: number | null) => (id == null ? "root" : String(id));
  const selectedOption = () =>
    options.find((option) => option.id === value) || options[0];

  const sync = () => {
    triggerLabel.textContent = selectedOption()?.label || "—";
    for (const [key, row] of rows) {
      row.classList.toggle(
        "st-collectionpicker-option--selected",
        key === keyFor(value),
      );
    }
  };

  for (const option of options) {
    const row = html(
      doc,
      "button",
      "st-collectionpicker-option",
    ) as HTMLButtonElement;
    row.type = "button";
    row.textContent = option.label;
    row.dataset.collectionId = keyFor(option.id);
    row.addEventListener("click", () => {
      value = option.id;
      sync();
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    });
    rows.set(keyFor(option.id), row);
    menu.appendChild(row);
  }

  trigger.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
  });

  root.append(trigger, menu);
  sync();
  return {
    el: root,
    get value(): number | null {
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
