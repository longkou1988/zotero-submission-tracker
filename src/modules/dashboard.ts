import { config } from "../../package.json";
import { db } from "../db";
import {
  ACTIVE_STATUSES,
  daysFromToday,
  STALE_CHECK_DAYS,
  StatusEvent,
  SubmissionRecord,
  SubmissionStatus,
} from "../types";
import { getString } from "../utils/locale";
import { openDetailDialog } from "./dialog";
import { openStatusPage } from "./statusPage";
import { getItemTitle, html, statusBadge, statusLabel } from "./ui";

const TAB_ID = `${config.addonRef}-dashboard`;
type FilterKey =
  | "all"
  | "active"
  | "followup"
  | "accepted"
  | "rejected"
  | "withdrawn";

let opened = false;
let unsubscribe: (() => void) | null = null;
let refreshTimer: number | null = null;
const state = { filter: "all" as FilterKey, search: "" };
let listEl: HTMLElement | null = null;
let statsEl: HTMLElement | null = null;
let chipsEl: HTMLElement | null = null;

export function openDashboard(): void {
  const win = Zotero.getMainWindow() as any;
  if (!win) {
    return;
  }
  if (opened) {
    win.Zotero_Tabs.select(TAB_ID);
    refresh();
    return;
  }
  const { container } = win.Zotero_Tabs.add({
    id: TAB_ID,
    type: `${config.addonRef}-dashboard`,
    title: getString("dashboard-tab-title"),
    // Zotero's tab bar writes icon state into tab.data; it must be an object.
    data: {},
    select: true,
    onClose: () => teardown(),
  });
  opened = true;
  buildDashboard(win.document, container as HTMLElement);
  unsubscribe = db.onChange(() => scheduleRefresh());
  refresh();
}

export function closeDashboard(): void {
  if (!opened) {
    return;
  }
  const win = Zotero.getMainWindow() as any;
  try {
    win?.Zotero_Tabs?.close(TAB_ID);
  } catch (e) {
    ztoolkit.log("submissiontracker: close dashboard failed", e);
  }
  teardown();
}

function teardown(): void {
  opened = false;
  listEl = null;
  statsEl = null;
  chipsEl = null;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

function scheduleRefresh(): void {
  if (!opened) {
    return;
  }
  if (refreshTimer != null) {
    return;
  }
  refreshTimer = Zotero.getMainWindow()?.setTimeout(() => {
    refreshTimer = null;
    refresh();
  }, 60) as unknown as number;
}

function buildDashboard(doc: Document, container: HTMLElement): void {
  const root = html(doc, "div", "st-dash");
  root.style.width = "100%";
  root.style.height = "100%";

  const header = html(doc, "div", "st-dash-header");
  const title = html(doc, "h1", "st-dash-title");
  title.textContent = getString("dashboard-title");
  const spacer = html(doc, "div", "st-flex-spacer");
  const importBtn = html(doc, "button", "st-btn");
  importBtn.textContent = getString("dashboard-import-json");
  importBtn.addEventListener("click", () => importJSONFile(doc));
  const exportJsonBtn = html(doc, "button", "st-btn");
  exportJsonBtn.textContent = getString("dashboard-export-json");
  exportJsonBtn.addEventListener("click", () => exportJSONFile(doc));
  const exportCsvBtn = html(doc, "button", "st-btn st-btn--primary");
  exportCsvBtn.textContent = getString("dashboard-export-csv");
  exportCsvBtn.addEventListener("click", () => exportCSVFile(doc));
  header.append(title, spacer, importBtn, exportJsonBtn, exportCsvBtn);
  root.appendChild(header);

  statsEl = html(doc, "div", "st-dash-stats");
  root.appendChild(statsEl);

  const toolbar = html(doc, "div", "st-dash-toolbar");
  const search = html(
    doc,
    "input",
    "st-input st-dash-search",
  ) as HTMLInputElement;
  search.type = "search";
  search.placeholder = getString("dashboard-search-placeholder");
  search.addEventListener("input", () => {
    state.search = search.value.trim().toLowerCase();
    renderList();
  });
  chipsEl = html(doc, "div", "st-dash-chips");
  toolbar.append(search, chipsEl);
  root.appendChild(toolbar);

  listEl = html(doc, "div", "st-dash-list");
  root.appendChild(listEl);

  (container as any).appendChild(root);
}

function refresh(): void {
  if (!opened) {
    return;
  }
  renderStats();
  renderChips();
  renderList();
}

/* ----------------------------- stats ----------------------------- */

function computeStats(): Record<FilterKey | "revisions", number> {
  const records = db.getAll();
  const stats = {
    all: records.length,
    active: 0,
    revisions: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
    followup: 0,
  };
  for (const record of records) {
    if (ACTIVE_STATUSES.includes(record.currentStatus)) {
      stats.active += 1;
      if (
        record.currentStatus === "major_revision" ||
        record.currentStatus === "minor_revision"
      ) {
        stats.revisions += 1;
      }
      if (record.followUpDate) {
        stats.followup += 1;
      }
    }
    if (record.currentStatus === "accepted") stats.accepted += 1;
    if (record.currentStatus === "rejected") stats.rejected += 1;
    if (record.currentStatus === "withdrawn") stats.withdrawn += 1;
  }
  return stats;
}

function renderStats(): void {
  if (!statsEl) {
    return;
  }
  const doc = statsEl.ownerDocument as Document;
  statsEl.textContent = "";
  const stats = computeStats();
  const cards: Array<[FilterKey, string, number]> = [
    ["all", getString("stat-total"), stats.all],
    ["active", getString("stat-active"), stats.active],
    ["followup", getString("stat-followup"), stats.followup],
    ["accepted", getString("stat-accepted"), stats.accepted],
    ["rejected", getString("stat-rejected"), stats.rejected],
    ["withdrawn", getString("stat-withdrawn"), stats.withdrawn],
  ];
  for (const [key, label, value] of cards) {
    // A <div role="button"> instead of <button>: Gecko forces XUL buttons
    // to a fixed single-line height, which clips stacked card content.
    const card = html(doc, "div", "st-card");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    if (state.filter === key) {
      card.classList.add("st-card--active");
    }
    const num = html(doc, "div", "st-card-num");
    num.textContent = String(value);
    const text = html(doc, "div", "st-card-label");
    text.textContent = label;
    card.append(num, text);
    const activate = () => {
      state.filter = key;
      refresh();
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    statsEl.appendChild(card);
  }
}

/* ----------------------------- chips ----------------------------- */

function renderChips(): void {
  if (!chipsEl) {
    return;
  }
  const doc = chipsEl.ownerDocument as Document;
  chipsEl.textContent = "";
  const chips: Array<[FilterKey, string]> = [
    ["all", getString("dashboard-filter-all")],
    ["active", getString("stat-active")],
    ["followup", getString("stat-followup")],
    ["accepted", getString("stat-accepted")],
    ["rejected", getString("stat-rejected")],
    ["withdrawn", getString("stat-withdrawn")],
  ];
  for (const [key, label] of chips) {
    const chip = html(doc, "button", "st-chip");
    chip.textContent = label;
    if (state.filter === key) {
      chip.classList.add("st-chip--active");
    }
    chip.addEventListener("click", () => {
      state.filter = key;
      refresh();
    });
    chipsEl.appendChild(chip);
  }
}

/* ----------------------------- list ------------------------------ */

function matchesFilter(record: SubmissionRecord, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return ACTIVE_STATUSES.includes(record.currentStatus);
    case "followup":
      return (
        ACTIVE_STATUSES.includes(record.currentStatus) && !!record.followUpDate
      );
    default:
      return record.currentStatus === (filter as SubmissionStatus);
  }
}

function renderList(): void {
  if (!listEl) {
    return;
  }
  const doc = listEl.ownerDocument as Document;
  listEl.textContent = "";
  const records = db
    .getAll()
    .filter((r) => matchesFilter(r, state.filter))
    .filter((r) => {
      if (!state.search) {
        return true;
      }
      const title = (getItemTitle(r.libraryID, r.itemKey) || "").toLowerCase();
      return (
        title.includes(state.search) ||
        r.journal.toLowerCase().includes(state.search)
      );
    });

  if (state.filter === "followup") {
    records.sort((a, b) =>
      String(a.followUpDate).localeCompare(String(b.followUpDate)),
    );
  } else {
    records.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  if (!records.length) {
    const empty = html(doc, "div", "st-dash-empty");
    empty.textContent = db.getAll().length
      ? getString("dashboard-empty-filtered")
      : getString("dashboard-empty");
    listEl.appendChild(empty);
    return;
  }

  for (const record of records) {
    listEl.appendChild(buildRow(doc, record));
  }
}

function buildRow(doc: Document, record: SubmissionRecord): HTMLElement {
  const row = html(doc, "div", "st-row");
  if (!getItemTitle(record.libraryID, record.itemKey)) {
    row.classList.add("st-row--missing");
  }
  if (record.statusUrl && isCheckStale(record.lastCheckedAt)) {
    row.classList.add("st-row--stale");
    row.title = getString("dashboard-last-checked", {
      args: {
        date: record.lastCheckedAt
          ? formatDateTime(record.lastCheckedAt)
          : getString("dashboard-never-checked"),
      },
    });
  }

  const badge = statusBadge(doc, record.currentStatus);

  const title = html(doc, "span", "st-row-title");
  title.textContent =
    getItemTitle(record.libraryID, record.itemKey) ||
    getString("dashboard-item-missing");
  title.title = title.textContent;

  const journal = html(doc, "span", "st-row-journal");
  journal.textContent = record.journal;
  journal.title = record.journal;

  const events = db.getEvents(record.id);
  const lastEvent: StatusEvent | undefined = events[events.length - 1];
  const updated = html(doc, "span", "st-row-date");
  updated.textContent = lastEvent ? lastEvent.date : "";

  const follow = html(doc, "span", "st-row-date");
  if (record.followUpDate) {
    const days = daysFromToday(record.followUpDate);
    follow.textContent = `${getString("section-followup")}: ${record.followUpDate}`;
    if (days < 0) {
      follow.classList.add("st-followup--overdue");
      follow.title = `${getString("section-overdue")} ${Math.abs(days)}d`;
    }
  }

  if (record.statusUrl) {
    const statusBtn = html(
      doc,
      "button",
      "st-btn st-btn--sm",
    ) as HTMLButtonElement;
    statusBtn.textContent = getString("dashboard-status-page");
    statusBtn.title = record.statusUrl;
    statusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openStatusPage(record);
    });
    row.append(statusBtn);
  }

  const detailBtn = html(doc, "button", "st-btn st-btn--sm");
  detailBtn.textContent = getString("dashboard-open-detail");
  detailBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDetailDialog(record);
  });

  row.append(badge, title, journal, updated, follow, detailBtn);
  row.addEventListener("click", () => jumpToItem(record));
  return row;
}

/** A status page counts as stale when never checked or checked long ago. */
function isCheckStale(lastCheckedAt: number | null): boolean {
  if (!lastCheckedAt) {
    return true;
  }
  return Date.now() - lastCheckedAt > STALE_CHECK_DAYS * 86400000;
}

function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

function jumpToItem(record: SubmissionRecord): void {
  const itemID = Zotero.Items.getIDFromLibraryAndKey(
    record.libraryID,
    record.itemKey,
  );
  if (!itemID) {
    return;
  }
  const win = Zotero.getMainWindow() as any;
  win.Zotero_Tabs.select("zotero-pane");
  win.ZoteroPane.selectItem(itemID);
}

/* --------------------------- import/export ------------------------ */

async function pickFile(
  doc: Document,
  mode: "open" | "save",
  filters: [string, string][],
  suggestion?: string,
): Promise<string | false> {
  return (await new ztoolkit.FilePicker(
    getString(
      mode === "save" ? "dashboard-export-title" : "dashboard-import-title",
    ),
    mode,
    filters,
    suggestion,
    doc.defaultView || undefined,
  ).open()) as string | false;
}

async function exportCSVFile(doc: Document): Promise<void> {
  const records = db.getAll();
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    "Title,Journal,Status,LastEvent,FollowUp,ManuscriptID,LastChecked,StatusURL,Notes",
  ];
  for (const record of records) {
    const events = db.getEvents(record.id);
    const last = events[events.length - 1];
    lines.push(
      [
        getItemTitle(record.libraryID, record.itemKey) || "",
        record.journal,
        statusLabel(record.currentStatus),
        last ? last.date : "",
        record.followUpDate || "",
        record.manuscriptId || "",
        record.lastCheckedAt ? formatDateTime(record.lastCheckedAt) : "",
        record.statusUrl || "",
        record.notes,
      ]
        .map(escape)
        .join(","),
    );
  }
  const path = await pickFile(
    doc,
    "save",
    [["CSV", "*.csv"]],
    "submissions.csv",
  );
  if (!path) {
    return;
  }
  await Zotero.File.putContentsAsync(path, `\uFEFF${lines.join("\r\n")}`);
  toast(getString("dashboard-export-done", { args: { path } }));
}

async function exportJSONFile(doc: Document): Promise<void> {
  const path = await pickFile(
    doc,
    "save",
    [["JSON", "*.json"]],
    "submissions.json",
  );
  if (!path) {
    return;
  }
  await Zotero.File.putContentsAsync(path, await db.exportJSON());
  toast(getString("dashboard-export-done", { args: { path } }));
}

async function importJSONFile(doc: Document): Promise<void> {
  const path = await pickFile(doc, "open", [["JSON", "*.json"]]);
  if (!path) {
    return;
  }
  try {
    const content = await Zotero.File.getContentsAsync(path);
    const [imported, skipped] = await db.importJSON(String(content));
    toast(
      getString("dashboard-import-done", {
        args: { ok: imported, skip: skipped },
      }),
    );
  } catch (e) {
    ztoolkit.log("submissiontracker: import failed", e);
    toast(getString("dashboard-import-failed"));
  }
}

function toast(text: string): void {
  new ztoolkit.ProgressWindow(config.addonName, { closeTime: 4000 })
    .createLine({ text, type: "success" })
    .show();
}
