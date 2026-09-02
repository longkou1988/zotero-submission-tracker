import { config } from "../../package.json";
import { db } from "../db";
import { getString } from "../utils/locale";
import { computeSubmissionAnalytics, type SubmissionAnalytics } from "./analytics";
import { html } from "./ui";

const TAB_ID = `${config.addonRef}-analytics-dashboard`;

let opened = false;
let unsubscribe: (() => void) | null = null;
let rootEl: HTMLElement | null = null;
let refreshTimer: number | null = null;

export function openAnalyticsDashboard(): void {
  const win = Zotero.getMainWindow() as any;
  if (!win) return;

  if (opened) {
    win.Zotero_Tabs.select(TAB_ID);
    void refresh();
    return;
  }

  const { container } = win.Zotero_Tabs.add({
    id: TAB_ID,
    type: `${config.addonRef}-analytics-dashboard`,
    title: getString("analytics-tab-title"),
    data: {},
    select: true,
    onClose: () => teardown(),
  });

  opened = true;
  rootEl = buildShell(win.document);
  (container as HTMLElement).appendChild(rootEl);
  unsubscribe = db.onChange(() => scheduleRefresh());
  void refresh();
}

function teardown(): void {
  opened = false;
  rootEl = null;
  if (refreshTimer != null) {
    const win = Zotero.getMainWindow();
    win?.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

function scheduleRefresh(): void {
  if (!opened || refreshTimer != null) return;
  const win = Zotero.getMainWindow();
  refreshTimer = win?.setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 80) as unknown as number;
}

function buildShell(doc: Document): HTMLElement {
  const root = html(doc, "div", "st-dash");
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.overflowY = "auto";
  root.style.paddingBottom = "28px";

  const header = html(doc, "div", "st-dash-header");
  header.style.alignItems = "flex-start";

  const titleWrap = html(doc, "div");
  const title = html(doc, "h1", "st-dash-title");
  title.textContent = getString("analytics-title");
  const subtitle = html(doc, "div");
  subtitle.textContent = getString("analytics-subtitle");
  subtitle.style.marginTop = "4px";
  subtitle.style.fontSize = "12px";
  subtitle.style.opacity = "0.62";
  titleWrap.append(title, subtitle);
  header.appendChild(titleWrap);
  root.appendChild(header);

  return root;
}

async function refresh(): Promise<void> {
  if (!opened || !rootEl) return;

  const records = await db.getAll();
  const submissions = await Promise.all(
    records.map(async (record) => ({
      record,
      events: await db.getEvents(record.id),
    })),
  );
  const analytics = computeSubmissionAnalytics(submissions);

  while (rootEl.children.length > 1) {
    rootEl.lastElementChild?.remove();
  }

  const doc = rootEl.ownerDocument;
  if (!analytics.total) {
    const empty = html(doc, "div", "st-dash-empty");
    empty.textContent = getString("analytics-empty");
    rootEl.appendChild(empty);
    return;
  }

  rootEl.appendChild(buildKpis(doc, analytics));

  const grid = html(doc, "div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
  grid.style.gap = "12px";
  grid.append(
    buildOutcomePanel(doc, analytics),
    buildYearlyPanel(doc, analytics),
  );
  rootEl.appendChild(grid);
  rootEl.appendChild(buildJournalPanel(doc, analytics));
}

function buildKpis(doc: Document, analytics: SubmissionAnalytics): HTMLElement {
  const grid = html(doc, "div", "st-dash-stats");
  const cards: Array<[string, string, string?]> = [
    [getString("analytics-total"), String(analytics.total)],
    [getString("analytics-active"), String(analytics.active)],
    [getString("analytics-accepted"), String(analytics.accepted)],
    [getString("analytics-rejected"), String(analytics.rejected)],
    [
      getString("analytics-acceptance-rate"),
      formatPercent(analytics.acceptanceRate),
      getString("analytics-rate-hint"),
    ],
    [
      getString("analytics-rejection-rate"),
      formatPercent(analytics.rejectionRate),
      getString("analytics-rate-hint"),
    ],
    [
      getString("analytics-first-decision"),
      formatDays(analytics.averageFirstDecisionDays),
      getString("analytics-first-decision-sample", {
        args: { count: analytics.firstDecisionSampleSize },
      }),
    ],
  ];

  for (const [label, value, hint] of cards) {
    const card = html(doc, "div", "st-card");
    card.style.cursor = "default";
    if (hint) card.title = hint;
    const num = html(doc, "div", "st-card-num");
    num.textContent = value;
    const text = html(doc, "div", "st-card-label");
    text.textContent = label;
    card.append(num, text);
    if (hint) {
      const small = html(doc, "div");
      small.textContent = hint;
      small.style.fontSize = "10.5px";
      small.style.lineHeight = "1.3";
      small.style.opacity = "0.46";
      small.style.marginTop = "3px";
      card.appendChild(small);
    }
    grid.appendChild(card);
  }
  return grid;
}

function buildOutcomePanel(
  doc: Document,
  analytics: SubmissionAnalytics,
): HTMLElement {
  const panel = buildPanel(doc, getString("analytics-outcome-title"));
  const values: Array<[string, number]> = [
    [getString("analytics-active"), analytics.active],
    [getString("analytics-accepted"), analytics.accepted],
    [getString("analytics-rejected"), analytics.rejected],
    [getString("analytics-withdrawn"), analytics.withdrawn],
  ];
  const max = Math.max(1, ...values.map(([, value]) => value));
  for (const [label, value] of values) {
    panel.appendChild(buildBarRow(doc, label, value, max));
  }
  return panel;
}

function buildYearlyPanel(
  doc: Document,
  analytics: SubmissionAnalytics,
): HTMLElement {
  const panel = buildPanel(doc, getString("analytics-yearly-title"));
  if (!analytics.yearlyTrend.length) {
    panel.appendChild(buildNoData(doc));
    return panel;
  }
  const max = Math.max(1, ...analytics.yearlyTrend.map((item) => item.count));
  for (const item of analytics.yearlyTrend) {
    panel.appendChild(buildBarRow(doc, String(item.year), item.count, max));
  }
  return panel;
}

function buildJournalPanel(
  doc: Document,
  analytics: SubmissionAnalytics,
): HTMLElement {
  const panel = buildPanel(doc, getString("analytics-journal-title"));
  panel.style.overflowX = "auto";

  if (!analytics.journals.length) {
    panel.appendChild(buildNoData(doc));
    return panel;
  }

  const table = html(doc, "div");
  table.style.display = "grid";
  table.style.gridTemplateColumns = "minmax(220px, 1fr) 90px 80px 80px 150px";
  table.style.minWidth = "720px";
  table.style.alignItems = "center";

  appendTableRow(
    doc,
    table,
    [
      getString("analytics-journal"),
      getString("analytics-submissions"),
      getString("analytics-accepted"),
      getString("analytics-rejected"),
      getString("analytics-average-days"),
    ],
    true,
  );

  for (const journal of analytics.journals) {
    appendTableRow(doc, table, [
      journal.journal,
      String(journal.submissions),
      String(journal.accepted),
      String(journal.rejected),
      formatDays(journal.averageFirstDecisionDays),
    ]);
  }

  panel.appendChild(table);
  return panel;
}

function buildPanel(doc: Document, titleText: string): HTMLElement {
  const panel = html(doc, "section");
  panel.style.border =
    "1px solid color-mix(in srgb, currentColor 10%, transparent)";
  panel.style.borderRadius = "10px";
  panel.style.padding = "14px";
  panel.style.background = "color-mix(in srgb, currentColor 2%, transparent)";

  const title = html(doc, "h2");
  title.textContent = titleText;
  title.style.fontSize = "14px";
  title.style.margin = "0 0 12px";
  title.style.fontWeight = "650";
  panel.appendChild(title);
  return panel;
}

function buildBarRow(
  doc: Document,
  label: string,
  value: number,
  max: number,
): HTMLElement {
  const row = html(doc, "div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "92px minmax(100px, 1fr) 42px";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.margin = "8px 0";

  const labelEl = html(doc, "div");
  labelEl.textContent = label;
  labelEl.style.fontSize = "11.5px";
  labelEl.style.opacity = "0.72";

  const track = html(doc, "div");
  track.style.height = "8px";
  track.style.borderRadius = "999px";
  track.style.overflow = "hidden";
  track.style.background = "color-mix(in srgb, currentColor 9%, transparent)";

  const fill = html(doc, "div");
  fill.style.height = "100%";
  fill.style.width = `${Math.max(value ? 3 : 0, (value / max) * 100)}%`;
  fill.style.borderRadius = "999px";
  fill.style.background = "var(--st-accent, #3b82f6)";
  track.appendChild(fill);

  const count = html(doc, "div");
  count.textContent = String(value);
  count.style.fontVariantNumeric = "tabular-nums";
  count.style.textAlign = "right";
  count.style.fontWeight = "600";

  row.append(labelEl, track, count);
  return row;
}

function appendTableRow(
  doc: Document,
  table: HTMLElement,
  cells: string[],
  header = false,
): void {
  for (const value of cells) {
    const cell = html(doc, "div");
    cell.textContent = value;
    cell.style.padding = "8px 10px";
    cell.style.borderBottom =
      "1px solid color-mix(in srgb, currentColor 8%, transparent)";
    cell.style.overflow = "hidden";
    cell.style.textOverflow = "ellipsis";
    cell.style.whiteSpace = "nowrap";
    cell.title = value;
    if (header) {
      cell.style.fontSize = "11px";
      cell.style.fontWeight = "650";
      cell.style.opacity = "0.62";
    } else {
      cell.style.fontSize = "12px";
      cell.style.fontVariantNumeric = "tabular-nums";
    }
    table.appendChild(cell);
  }
}

function buildNoData(doc: Document): HTMLElement {
  const empty = html(doc, "div");
  empty.textContent = getString("analytics-no-data");
  empty.style.padding = "12px 0";
  empty.style.opacity = "0.5";
  return empty;
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${value}%`;
}

function formatDays(value: number | null): string {
  if (value == null) return "—";
  return getString("analytics-days", { args: { count: value } });
}
