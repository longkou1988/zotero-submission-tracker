import { config } from "../../package.json";
import { getPref } from "../utils/prefs";
import {
  STATUS_LIST,
  SubmissionRecord,
  SubmissionStatus,
  todayStr,
} from "../types";
import { db } from "../db";
import { getString } from "../utils/locale";
import { html, statusBadge, statusColor, statusLabel } from "./ui";

/** Mirror the current status into the item's Extra field (opt-in). */
export async function mirrorStatus(record: SubmissionRecord): Promise<void> {
  if (!getPref("mirror.extraField")) {
    return;
  }
  const itemID = Zotero.Items.getIDFromLibraryAndKey(
    record.libraryID,
    record.itemKey,
  );
  if (!itemID) {
    return;
  }
  const item = Zotero.Items.get(itemID) as Zotero.Item | undefined;
  if (!item) {
    return;
  }
  const text = record.journal
    ? `${record.journal} · ${statusLabel(record.currentStatus)}`
    : statusLabel(record.currentStatus);
  try {
    await ztoolkit.ExtraField.setExtraField(item, "Submission Tracker", text);
  } catch (e) {
    ztoolkit.log("submissiontracker: mirror status failed", e);
  }
}

function openStDialog(
  title: string,
  width: number,
  build: (doc: Document, root: HTMLElement, win: Window) => void,
): void {
  const helper = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
    tag: "div",
    namespace: "html",
    id: `${config.addonRef}-dialog-root`,
    styles: { display: "block", minWidth: `${width - 40}px` },
  });
  helper.setDialogData({
    loadCallback: () => {
      const win = helper.window;
      injectDialogStyles(win);
      const root = win.document.getElementById(
        `${config.addonRef}-dialog-root`,
      ) as HTMLElement | null;
      if (root) {
        build(win.document, root, win);
      }
      // The window sizes itself to its (initially empty) content before the
      // form is built, so grow it to fit the real content afterwards.
      fitDialogWindow(win, width);
    },
    unloadCallback: () => {
      const dialogs = addon.data.dialogs;
      const idx = dialogs.indexOf(helper);
      if (idx >= 0) {
        dialogs.splice(idx, 1);
      }
    },
  });
  addon.data.dialogs.push(helper);
  helper.open(title, { width, centerscreen: true, resizable: true });
}

/** Grow the dialog to fit its content; never taller than the screen. */
function fitDialogWindow(win: Window, minWidth: number): void {
  try {
    const w = win as any;
    w.sizeToContent();
    if (win.innerWidth < minWidth) {
      w.innerWidth = minWidth;
    }
    const maxInner = win.screen?.availHeight
      ? win.screen.availHeight - 120
      : 800;
    if (win.innerHeight > maxInner) {
      w.innerHeight = maxInner;
    }
  } catch (e) {
    ztoolkit.log("submissiontracker: fit dialog window failed", e);
  }
}

function injectDialogStyles(win: Window): void {
  const doc = win.document;
  if (doc.getElementById(`${config.addonRef}-dialog-css`)) {
    return;
  }
  const link = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "link",
  ) as HTMLLinkElement;
  link.id = `${config.addonRef}-dialog-css`;
  link.rel = "stylesheet";
  link.href = `chrome://${config.addonRef}/content/dialog.css`;
  doc.documentElement!.appendChild(link);
}

/* ------------------------------------------------------------------ */
/* Create dialog                                                       */
/* ------------------------------------------------------------------ */

export async function openCreateDialog(items: Zotero.Item[]): Promise<void> {
  openStDialog(getString("dialog-create-title"), 520, (doc, root, win) => {
    const header = html(doc, "div", "st-dialog-header");
    const h2 = html(doc, "h2", "st-dialog-title");
    h2.textContent =
      items.length > 1
        ? getString("dialog-multi-items", { args: { count: items.length } })
        : items[0].getField("title") || "";
    header.appendChild(h2);
    root.appendChild(header);

    const form = html(doc, "div", "st-form");

    const journalInput = html(doc, "input", "st-input") as HTMLInputElement;
    journalInput.type = "text";
    journalInput.placeholder = getString("dialog-journal-placeholder");
    const dataList = html(doc, "datalist") as HTMLDataListElement;
    dataList.id = `${config.addonRef}-journal-list`;
    for (const journal of db.distinctJournals()) {
      const option = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "option",
      ) as HTMLOptionElement;
      option.value = journal;
      dataList.appendChild(option);
    }
    journalInput.setAttribute("list", dataList.id);
    form.appendChild(
      buildField(doc, getString("dialog-journal"), [journalInput, dataList]),
    );

    const statusDotEl = html(doc, "span", "st-dot");
    statusDotEl.style.setProperty(
      "--st-color",
      statusColor("submitted" as SubmissionStatus),
    );
    const statusSelect = buildStatusSelect(doc, "submitted");
    statusSelect.addEventListener("change", () => {
      statusDotEl.style.setProperty(
        "--st-color",
        statusColor(statusSelect.value as SubmissionStatus),
      );
    });
    const statusRow = html(doc, "div", "st-select-row");
    statusRow.append(statusDotEl, statusSelect);
    form.appendChild(buildField(doc, getString("dialog-status"), [statusRow]));

    const dateInput = html(doc, "input", "st-input") as HTMLInputElement;
    dateInput.type = "date";
    dateInput.value = todayStr();
    form.appendChild(buildField(doc, getString("dialog-date"), [dateInput]));

    const followInput = html(doc, "input", "st-input") as HTMLInputElement;
    followInput.type = "date";
    form.appendChild(
      buildField(
        doc,
        getString("dialog-followup"),
        [followInput],
        getString("dialog-followup-hint"),
      ),
    );

    const notesInput = html(
      doc,
      "textarea",
      "st-input st-textarea",
    ) as HTMLTextAreaElement;
    notesInput.rows = 3;
    form.appendChild(buildField(doc, getString("dialog-notes"), [notesInput]));

    root.appendChild(form);

    const footer = html(doc, "div", "st-dialog-footer");
    const cancel = html(doc, "button", "st-btn") as HTMLButtonElement;
    cancel.textContent = getString("dialog-cancel");
    const save = html(
      doc,
      "button",
      "st-btn st-btn--primary",
    ) as HTMLButtonElement;
    save.textContent = getString("dialog-save");
    footer.append(cancel, save);
    root.appendChild(footer);

    cancel.addEventListener("click", () => {
      try {
        win.close();
      } catch (e) {
        ztoolkit.log("submissiontracker: close dialog failed", e);
      }
    });
    save.addEventListener("click", async () => {
      const journal = journalInput.value.trim();
      if (!journal) {
        journalInput.classList.add("st-input--error");
        journalInput.focus();
        return;
      }
      save.disabled = true;
      try {
        const date = dateInput.value || todayStr();
        for (const item of items) {
          const record = await db.create({
            libraryID: item.libraryID,
            itemKey: item.key,
            journal,
            status: statusSelect.value as SubmissionStatus,
            date,
            followUpDate: followInput.value || null,
            notes: notesInput.value.trim(),
          });
          await mirrorStatus(record);
        }
      } finally {
        save.disabled = false;
      }
      try {
        win.close();
      } catch (e) {
        ztoolkit.log("submissiontracker: close dialog failed", e);
      }
    });
    journalInput.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Detail dialog                                                       */
/* ------------------------------------------------------------------ */

export function openDetailDialog(record: SubmissionRecord): void {
  openStDialog(getString("dialog-detail-title"), 560, (doc, root, win) => {
    const render = () => {
      const fresh = db.getSubmission(record.id);
      if (!fresh) {
        try {
          win.close();
        } catch (e) {
          ztoolkit.log("submissiontracker: close dialog failed", e);
        }
        return;
      }
      root.textContent = "";
      buildDetail(doc, root, win, fresh, render);
      fitDialogWindow(win, 560);
    };
    render();
  });
}

function buildDetail(
  doc: Document,
  root: HTMLElement,
  win: Window,
  record: SubmissionRecord,
  rerender: () => void,
): void {
  const title = getItemTitleText(record);
  const header = html(doc, "div", "st-dialog-header");
  const h2 = html(doc, "h2", "st-dialog-title");
  h2.textContent = title || getString("dialog-item-missing");
  const sub = html(doc, "div", "st-dialog-sub");
  const journalSpan = html(doc, "span", "st-dialog-journal");
  journalSpan.textContent = record.journal;
  sub.append(journalSpan, statusBadge(doc, record.currentStatus));
  header.append(h2, sub);
  root.appendChild(header);

  /* --- status history --- */
  const history = html(doc, "div", "st-history");
  const historyTitle = html(doc, "h3", "st-dialog-h3");
  historyTitle.textContent = getString("dialog-timeline");
  history.appendChild(historyTitle);
  const events = db.getEvents(record.id).slice().reverse();
  const timeline = html(doc, "div", "st-history-list");
  for (const event of events) {
    const row = html(doc, "div", "st-history-row");
    const date = html(doc, "span", "st-event-date");
    date.textContent = event.date;
    row.append(date, statusBadge(doc, event.status));
    if (event.note) {
      const note = html(doc, "span", "st-event-note");
      note.textContent = event.note;
      row.appendChild(note);
    }
    timeline.appendChild(row);
  }
  history.appendChild(timeline);
  root.appendChild(history);

  /* --- quick status update --- */
  const quick = html(doc, "div", "st-quick");
  const quickTitle = html(doc, "h3", "st-dialog-h3");
  quickTitle.textContent = getString("dialog-add-event");
  quick.appendChild(quickTitle);

  const quickRow = html(doc, "div", "st-quick-row");
  const quickDot = html(doc, "span", "st-dot");
  quickDot.style.setProperty("--st-color", statusColor(record.currentStatus));
  const quickStatus = buildStatusSelect(doc, record.currentStatus);
  quickStatus.addEventListener("change", () => {
    quickDot.style.setProperty(
      "--st-color",
      statusColor(quickStatus.value as SubmissionStatus),
    );
  });
  const quickDate = html(doc, "input", "st-input") as HTMLInputElement;
  quickDate.type = "date";
  quickDate.value = todayStr();
  const quickNote = html(doc, "input", "st-input") as HTMLInputElement;
  quickNote.type = "text";
  quickNote.placeholder = getString("dialog-event-note");
  const quickBtn = html(
    doc,
    "button",
    "st-btn st-btn--primary",
  ) as HTMLButtonElement;
  quickBtn.textContent = getString("dialog-add-event-btn");
  quickRow.append(quickDot, quickStatus, quickDate, quickNote, quickBtn);
  quick.appendChild(quickRow);
  root.appendChild(quick);

  quickBtn.addEventListener("click", async () => {
    quickBtn.disabled = true;
    try {
      await db.addEvent(
        record.id,
        quickStatus.value as SubmissionStatus,
        quickDate.value || todayStr(),
        quickNote.value.trim(),
      );
      const fresh = db.getSubmission(record.id);
      if (fresh) {
        await mirrorStatus(fresh);
      }
    } finally {
      quickBtn.disabled = false;
    }
    rerender();
  });

  /* --- editable fields --- */
  const editForm = html(doc, "div", "st-form");
  const journalInput = html(doc, "input", "st-input") as HTMLInputElement;
  journalInput.type = "text";
  journalInput.value = record.journal;
  editForm.appendChild(
    buildField(doc, getString("dialog-journal"), [journalInput]),
  );

  const followInput = html(doc, "input", "st-input") as HTMLInputElement;
  followInput.type = "date";
  if (record.followUpDate) {
    followInput.value = record.followUpDate;
  }
  editForm.appendChild(
    buildField(doc, getString("dialog-followup"), [followInput]),
  );

  const notesInput = html(
    doc,
    "textarea",
    "st-input st-textarea",
  ) as HTMLTextAreaElement;
  notesInput.rows = 2;
  notesInput.value = record.notes;
  editForm.appendChild(
    buildField(doc, getString("dialog-notes"), [notesInput]),
  );
  root.appendChild(editForm);

  const footer = html(doc, "div", "st-dialog-footer");
  const del = html(doc, "button", "st-btn st-btn--danger") as HTMLButtonElement;
  del.textContent = getString("dialog-delete");
  del.addEventListener("click", async () => {
    if (!del.dataset.armed) {
      del.dataset.armed = "1";
      del.textContent = getString("dialog-delete-confirm");
      return;
    }
    del.disabled = true;
    await db.deleteSubmission(record.id);
    try {
      win.close();
    } catch (e) {
      ztoolkit.log("submissiontracker: close dialog failed", e);
    }
  });
  const spacer = html(doc, "div", "st-flex-spacer");
  const save = html(
    doc,
    "button",
    "st-btn st-btn--primary",
  ) as HTMLButtonElement;
  save.textContent = getString("dialog-save");
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      await db.updateSubmission(record.id, {
        journal: journalInput.value.trim(),
        followUpDate: followInput.value || null,
        notes: notesInput.value.trim(),
        currentStatus: record.currentStatus,
      });
      const fresh = db.getSubmission(record.id);
      if (fresh) {
        await mirrorStatus(fresh);
      }
    } finally {
      save.disabled = false;
    }
    try {
      win.close();
    } catch (e) {
      ztoolkit.log("submissiontracker: close dialog failed", e);
    }
  });
  footer.append(del, spacer, save);
  root.appendChild(footer);
}

function getItemTitleText(record: SubmissionRecord): string | null {
  try {
    const itemID = Zotero.Items.getIDFromLibraryAndKey(
      record.libraryID,
      record.itemKey,
    );
    if (!itemID) {
      return null;
    }
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    return item ? item.getField("title") || item.getDisplayTitle() || "" : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Small builders                                                      */
/* ------------------------------------------------------------------ */

function buildField(
  doc: Document,
  label: string,
  controls: HTMLElement[],
  hint?: string,
): HTMLElement {
  const field = html(doc, "div", "st-field");
  const labelEl = html(doc, "label", "st-field-label");
  labelEl.textContent = label;
  const control = html(doc, "div", "st-field-control");
  control.append(...controls);
  field.append(labelEl, control);
  if (hint) {
    const hintEl = html(doc, "div", "st-field-hint");
    hintEl.textContent = hint;
    field.appendChild(hintEl);
  }
  return field;
}

function buildStatusSelect(
  doc: Document,
  selected: SubmissionStatus,
): HTMLSelectElement {
  const select = html(doc, "select", "st-select") as HTMLSelectElement;
  for (const status of STATUS_LIST) {
    const option = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "option",
    ) as HTMLOptionElement;
    option.value = status;
    option.textContent = statusLabel(status);
    if (status === selected) {
      option.selected = true;
    }
    select.appendChild(option);
  }
  select.value = selected;
  return select;
}

export function closeAllDialogs(): void {
  const dialogs = [...addon.data.dialogs];
  addon.data.dialogs.length = 0;
  for (const helper of dialogs) {
    try {
      helper.window?.close();
    } catch (e) {
      ztoolkit.log("submissiontracker: close dialog failed", e);
    }
  }
}
