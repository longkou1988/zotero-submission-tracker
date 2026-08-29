import { config } from "../../package.json";
import { db } from "../db";
import { SubmissionRecord } from "../types";
import { getString } from "../utils/locale";
import { openDetailDialog } from "./dialog";
import { html } from "./ui";

const HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Open the journal's submission status page in a main-window tab (same
 * mechanism as reader tabs, which host remote browsers). Opening the page
 * marks the record as checked; reading the status and recording it stays a
 * manual, user-confirmed step.
 */
export function openStatusPage(record: SubmissionRecord): void {
  if (!record.statusUrl) {
    return;
  }
  const url = record.statusUrl;
  const win = Zotero.getMainWindow();
  if (!win) {
    return;
  }
  const doc = win.document;
  const tabs = (win as any).Zotero_Tabs;
  const tabId = `${config.addonRef}-statuspage-${record.id}`;

  const existing = doc.getElementById(tabId);
  if (existing) {
    tabs.select(tabId);
    return;
  }

  const { container } = tabs.add({
    id: tabId,
    type: `${config.addonRef}-statuspage`,
    title: getString("statuspage-tab-title", {
      args: { journal: record.journal || getString("statuspage-title") },
    }),
    data: {},
    select: true,
    onClose: () => {},
  });

  // Own vbox inside the tab container: toolbar + flexing browser.
  const root = doc.createXULElement("vbox");
  root.id = `${tabId}-root`;
  root.setAttribute("flex", "1");
  container.appendChild(root);

  const toolbar = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  toolbar.id = `${config.addonRef}-statuspage-toolbar`;
  toolbar.style.width = "100%";
  buildToolbar(doc, toolbar, win, url, record, tabId);
  root.appendChild(toolbar);

  const browser = doc.createXULElement("browser") as any;
  browser.id = `${tabId}-browser`;
  browser.setAttribute("flex", "1");
  browser.setAttribute("remote", "true");
  browser.setAttribute("type", "content");
  browser.setAttribute("maychangeremoteness", "true");
  browser.setAttribute("disableglobalhistory", "true");
  root.appendChild(browser);

  // Web content cannot be loaded with the system principal (silently
  // blocked); navigate with a content principal for the target URL.
  try {
    const uri = Services.io.newURI(url);
    const principal = (
      Services.scriptSecurityManager as any
    ).createContentPrincipal(uri);
    browser.loadURI(url, { triggeringPrincipal: principal });
  } catch (e) {
    ztoolkit.log("submissiontracker: status page load failed", e);
    try {
      browser.setAttribute("src", url);
    } catch (e2) {
      ztoolkit.log("submissiontracker: browser src fallback failed", e2);
    }
  }

  // Opening the page counts as checking the status.
  db.updateCheckedAt(record.id);
}

function buildToolbar(
  doc: Document,
  toolbar: HTMLElement,
  win: Window,
  url: string,
  record: SubmissionRecord,
  tabId: string,
): void {
  const urlLabel = html(doc, "span", "st-bp-url");
  urlLabel.textContent = url;
  urlLabel.title = url;

  const reload = html(doc, "button", "st-btn st-btn--sm") as HTMLButtonElement;
  reload.textContent = getString("statuspage-reload");
  reload.addEventListener("click", () => {
    const browser = doc.getElementById(`${tabId}-browser`) as any;
    try {
      browser.reload();
    } catch (e) {
      ztoolkit.log("submissiontracker: reload failed", e);
    }
  });

  const external = html(
    doc,
    "button",
    "st-btn st-btn--sm",
  ) as HTMLButtonElement;
  external.textContent = getString("statuspage-external");
  external.addEventListener("click", () => {
    try {
      Zotero.launchURL(url);
    } catch (e) {
      ztoolkit.log("submissiontracker: launchURL failed", e);
    }
  });

  const detail = html(doc, "button", "st-btn st-btn--sm") as HTMLButtonElement;
  detail.textContent = getString("statuspage-open-detail");
  detail.addEventListener("click", () => {
    const fresh = db.getSubmission(record.id);
    if (fresh) {
      openDetailDialog(fresh);
    }
  });

  const close = html(doc, "button", "st-btn st-btn--sm") as HTMLButtonElement;
  close.textContent = getString("dialog-cancel");
  close.addEventListener("click", () => {
    try {
      (win as any).Zotero_Tabs.close(tabId);
    } catch (e) {
      ztoolkit.log("submissiontracker: close status tab failed", e);
    }
  });

  toolbar.append(urlLabel, reload, external, detail, close);
}
