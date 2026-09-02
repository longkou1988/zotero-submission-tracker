import { config } from "../../package.json";
import { db } from "../db";
import { STATUS_LIST } from "../types";
import { getString } from "../utils/locale";
import {
  computeSubmissionAnalytics,
  filterAnalyticsSubmissions,
  filterVisibleSubmissionRecords,
  getSubmissionYear,
  getJournalBarWidths,
  getOutcomeChartSegments,
  type AnalyticsFilter,
  type AnalyticsSubmission,
  type OutcomeChartKey,
  type SubmissionAnalytics,
} from "./analytics";
import { openDetailDialog } from "./dialog";
import { getItemTitle, html, statusBadge, statusLabel } from "./ui";

const TAB_ID = `${config.addonRef}-analytics-dashboard`;
const SVG_NS = "http://www.w3.org/2000/svg";
const OUTCOME_COLORS: Record<OutcomeChartKey, string> = {
  active: "#3b82f6",
  accepted: "#22c55e",
  rejected: "#ef4444",
  withdrawn: "#6b7280",
};

let opened = false;
let unsubscribe: (() => void) | null = null;
let itemNotifierID: string | null = null;
let rootEl: HTMLElement | null = null;
let refreshTimer: number | null = null;
let allSubmissions: AnalyticsSubmission[] = [];
const filterState: AnalyticsFilter = {
  year: null,
  status: null,
  journal: null,
  outcome: null,
};

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
  itemNotifierID = Zotero.Notifier.registerObserver(
    {
      notify: (event: string, type: string) => {
        if (type === "item" && (event === "modify" || event === "delete")) {
          scheduleRefresh();
        }
      },
    },
    ["item"],
    "submission-tracker-analytics",
  );
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
  if (itemNotifierID) {
    Zotero.Notifier.unregisterObserver(itemNotifierID);
    itemNotifierID = null;
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

  const records = filterVisibleSubmissionRecords(
    await db.getAll(),
    (libraryID, itemKey) => {
      const itemID = Zotero.Items.getIDFromLibraryAndKey(libraryID, itemKey);
      if (!itemID) return undefined;
      const item = Zotero.Items.get(itemID) as Zotero.Item | undefined;
      return item ? { deleted: item.deleted } : undefined;
    },
  );
  allSubmissions = await Promise.all(
    records.map(async (record) => ({
      record,
      events: await db.getEvents(record.id),
    })),
  );
  const filteredSubmissions = filterAnalyticsSubmissions(
    allSubmissions,
    filterState,
  );
  const analytics = computeSubmissionAnalytics(filteredSubmissions);

  while (rootEl.children.length > 1) {
    rootEl.lastElementChild?.remove();
  }

  const doc = rootEl.ownerDocument as Document;
  rootEl.appendChild(buildFilterBar(doc));
  if (!allSubmissions.length) {
    const empty = html(doc, "div", "st-dash-empty");
    empty.textContent = getString("analytics-empty");
    rootEl.appendChild(empty);
    return;
  }
  if (!analytics.total) {
    const empty = html(doc, "div", "st-dash-empty");
    empty.textContent = getString("analytics-filter-empty");
    rootEl.appendChild(empty);
    return;
  }

  rootEl.appendChild(buildKpis(doc, analytics));

  const grid = html(doc, "div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(340px, 1fr))";
  grid.style.gap = "12px";
  grid.append(
    buildOutcomePanel(doc, analytics),
    buildYearlyPanel(doc, analytics),
  );
  rootEl.appendChild(grid);
  rootEl.appendChild(buildJournalPanel(doc, analytics));
  rootEl.appendChild(buildSubmissionList(doc, filteredSubmissions));
}

function buildFilterBar(doc: Document): HTMLElement {
  const bar = html(doc, "div", "st-dash-toolbar");
  bar.style.display = "flex";
  bar.style.flexWrap = "wrap";
  bar.style.gap = "8px";
  bar.style.alignItems = "center";
  const makeSelect = (labelText: string) => {
    const wrap = html(doc, "label");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "5px";
    wrap.style.fontSize = "11.5px";
    const label = html(doc, "span");
    label.textContent = labelText;
    const select = html(doc, "select", "st-input") as HTMLSelectElement;
    select.style.width = "auto";
    select.style.minWidth = "120px";
    wrap.append(label, select);
    return { wrap, select };
  };
  const years = Array.from(
    new Set(
      allSubmissions.map((item) => getSubmissionYear(item.record, item.events)),
    ),
  ).sort((a, b) => b - a);
  const year = makeSelect(getString("analytics-filter-year"));
  addOption(doc, year.select, "", getString("analytics-filter-all"));
  for (const value of years)
    addOption(doc, year.select, String(value), String(value));
  year.select.value = filterState.year == null ? "" : String(filterState.year);
  year.select.addEventListener("change", () => {
    filterState.year = year.select.value ? Number(year.select.value) : null;
    void refresh();
  });
  const status = makeSelect(getString("analytics-filter-status"));
  addOption(doc, status.select, "", getString("analytics-filter-all"));
  for (const value of STATUS_LIST)
    addOption(doc, status.select, value, statusLabel(value));
  status.select.value = filterState.status || "";
  status.select.addEventListener("change", () => {
    filterState.status = (status.select.value ||
      null) as AnalyticsFilter["status"];
    filterState.outcome = null;
    void refresh();
  });
  const journals = Array.from(
    new Set(
      allSubmissions.map((item) => item.record.journal.trim()).filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const journal = makeSelect(getString("analytics-filter-journal"));
  addOption(doc, journal.select, "", getString("analytics-filter-all"));
  for (const value of journals) addOption(doc, journal.select, value, value);
  journal.select.value = filterState.journal || "";
  journal.select.addEventListener("change", () => {
    filterState.journal = journal.select.value || null;
    void refresh();
  });
  const reset = html(doc, "button", "st-btn") as HTMLButtonElement;
  reset.textContent = getString("analytics-filter-reset");
  reset.addEventListener("click", () => {
    filterState.year = null;
    filterState.status = null;
    filterState.journal = null;
    filterState.outcome = null;
    void refresh();
  });
  bar.append(year.wrap, status.wrap, journal.wrap, reset);
  if (filterState.outcome) {
    const chip = html(
      doc,
      "button",
      "st-chip st-chip--active",
    ) as HTMLButtonElement;
    chip.textContent = `${getString("analytics-filter-outcome")}: ${getOutcomeLabel(filterState.outcome)} ×`;
    chip.addEventListener("click", () => setOutcomeFilter(null));
    bar.appendChild(chip);
  }
  return bar;
}
function addOption(
  doc: Document,
  select: HTMLSelectElement,
  value: string,
  label: string,
): void {
  const option = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "option",
  ) as HTMLOptionElement;
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}
function setOutcomeFilter(outcome: OutcomeChartKey | null): void {
  filterState.outcome = filterState.outcome === outcome ? null : outcome;
  filterState.status = null;
  void refresh();
}
function setYearFilter(year: number): void {
  filterState.year = filterState.year === year ? null : year;
  void refresh();
}
function setJournalFilter(journal: string): void {
  filterState.journal = filterState.journal === journal ? null : journal;
  void refresh();
}
function buildSubmissionList(
  doc: Document,
  submissions: AnalyticsSubmission[],
): HTMLElement {
  const panel = buildPanel(
    doc,
    getString("analytics-records-title", {
      args: { count: submissions.length },
    }),
  );
  for (const input of submissions) {
    const row = html(doc, "div");
    row.style.display = "grid";
    row.style.gridTemplateColumns =
      "minmax(180px, 1.5fr) minmax(150px, 1fr) 130px 70px 86px";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "8px 6px";
    row.style.borderBottom =
      "1px solid color-mix(in srgb, currentColor 8%, transparent)";
    const title = html(doc, "div");
    title.textContent =
      getItemTitle(input.record.libraryID, input.record.itemKey) ||
      input.record.journal ||
      "—";
    title.style.overflow = "hidden";
    title.style.textOverflow = "ellipsis";
    title.style.whiteSpace = "nowrap";
    const journal = html(doc, "button", "st-chip") as HTMLButtonElement;
    journal.textContent = input.record.journal || "—";
    journal.title = input.record.journal;
    journal.addEventListener("click", () =>
      setJournalFilter(input.record.journal),
    );
    const status = statusBadge(doc, input.record.currentStatus);
    const year = html(doc, "button", "st-chip") as HTMLButtonElement;
    const submissionYear = getSubmissionYear(input.record, input.events);
    year.textContent = String(submissionYear);
    year.addEventListener("click", () => setYearFilter(submissionYear));
    const detail = html(
      doc,
      "button",
      "st-btn st-btn--sm",
    ) as HTMLButtonElement;
    detail.textContent = getString("analytics-open-detail");
    detail.addEventListener("click", () => openDetailDialog(input.record));
    row.append(title, journal, status, year, detail);
    panel.appendChild(row);
  }
  return panel;
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
    const outcome =
      label === getString("analytics-active")
        ? "active"
        : label === getString("analytics-accepted")
          ? "accepted"
          : label === getString("analytics-rejected")
            ? "rejected"
            : null;
    const clickable = outcome || label === getString("analytics-total");
    card.style.cursor = clickable ? "pointer" : "default";
    if (clickable) {
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      const activate = () => setOutcomeFilter(outcome);
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    }
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
  const segments = getOutcomeChartSegments(analytics);

  const content = html(doc, "div");
  content.style.display = "grid";
  content.style.gridTemplateColumns =
    "minmax(170px, 0.8fr) minmax(170px, 1.2fr)";
  content.style.gap = "16px";
  content.style.alignItems = "center";
  content.append(
    buildDonutChart(doc, analytics.total, segments),
    buildOutcomeLegend(doc, segments),
  );
  panel.appendChild(content);

  const decisionRates = buildDecisionRateBar(doc, analytics);
  if (decisionRates) panel.appendChild(decisionRates);
  return panel;
}

function buildDonutChart(
  doc: Document,
  total: number,
  segments: ReturnType<typeof getOutcomeChartSegments>,
): HTMLElement {
  const wrap = html(doc, "div");
  wrap.style.display = "flex";
  wrap.style.justifyContent = "center";
  wrap.style.alignItems = "center";
  wrap.style.minHeight = "190px";

  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("width", "190");
  svg.setAttribute("height", "190");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", getString("analytics-outcome-title"));
  svg.setAttribute("style", "max-width: 100%;");

  const track = doc.createElementNS(SVG_NS, "circle");
  track.setAttribute("cx", "60");
  track.setAttribute("cy", "60");
  track.setAttribute("r", "44");
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "currentColor");
  track.setAttribute("stroke-width", "16");
  track.setAttribute("opacity", "0.08");
  svg.appendChild(track);

  for (const segment of segments) {
    if (!segment.count || !segment.percent) continue;
    const circle = doc.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "60");
    circle.setAttribute("cy", "60");
    circle.setAttribute("r", "44");
    circle.setAttribute("fill", "none");
    circle.setAttribute("pathLength", "100");
    circle.setAttribute("stroke", OUTCOME_COLORS[segment.key]);
    circle.setAttribute("stroke-width", "16");
    circle.setAttribute(
      "stroke-dasharray",
      `${segment.percent} ${Math.max(0, 100 - segment.percent)}`,
    );
    circle.setAttribute("stroke-dashoffset", String(-segment.startPercent));
    circle.setAttribute("transform", "rotate(-90 60 60)");
    circle.setAttribute("style", "cursor: pointer;");
    circle.addEventListener("click", () => setOutcomeFilter(segment.key));

    const title = doc.createElementNS(SVG_NS, "title");
    title.textContent = `${getOutcomeLabel(segment.key)}: ${segment.count} (${formatChartPercent(segment.percent)})`;
    circle.appendChild(title);
    svg.appendChild(circle);
  }

  const totalText = doc.createElementNS(SVG_NS, "text");
  totalText.setAttribute("x", "60");
  totalText.setAttribute("y", "58");
  totalText.setAttribute("text-anchor", "middle");
  totalText.setAttribute("fill", "currentColor");
  totalText.setAttribute("font-size", "23");
  totalText.setAttribute("font-weight", "700");
  totalText.textContent = String(total);
  svg.appendChild(totalText);

  const totalLabel = doc.createElementNS(SVG_NS, "text");
  totalLabel.setAttribute("x", "60");
  totalLabel.setAttribute("y", "75");
  totalLabel.setAttribute("text-anchor", "middle");
  totalLabel.setAttribute("fill", "currentColor");
  totalLabel.setAttribute("font-size", "9");
  totalLabel.setAttribute("opacity", "0.58");
  totalLabel.textContent = getString("analytics-total");
  svg.appendChild(totalLabel);

  wrap.appendChild(svg);
  return wrap;
}

function buildOutcomeLegend(
  doc: Document,
  segments: ReturnType<typeof getOutcomeChartSegments>,
): HTMLElement {
  const legend = html(doc, "div");
  legend.style.display = "flex";
  legend.style.flexDirection = "column";
  legend.style.gap = "7px";

  for (const segment of segments) {
    const row = html(doc, "div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "12px minmax(82px, 1fr) 44px 56px";
    row.style.alignItems = "center";
    row.style.gap = "7px";
    row.style.padding = "5px 0";
    row.style.cursor = "pointer";
    row.setAttribute("role", "button");
    row.addEventListener("click", () => setOutcomeFilter(segment.key));

    const dot = html(doc, "span");
    dot.style.width = "9px";
    dot.style.height = "9px";
    dot.style.borderRadius = "50%";
    dot.style.background = OUTCOME_COLORS[segment.key];

    const label = html(doc, "span");
    label.textContent = getOutcomeLabel(segment.key);
    label.style.fontSize = "12px";

    const count = html(doc, "span");
    count.textContent = String(segment.count);
    count.style.textAlign = "right";
    count.style.fontWeight = "650";
    count.style.fontVariantNumeric = "tabular-nums";

    const percent = html(doc, "span");
    percent.textContent = formatChartPercent(segment.percent);
    percent.style.textAlign = "right";
    percent.style.fontSize = "11.5px";
    percent.style.opacity = "0.58";
    percent.style.fontVariantNumeric = "tabular-nums";

    row.append(dot, label, count, percent);
    legend.appendChild(row);
  }
  return legend;
}

function buildDecisionRateBar(
  doc: Document,
  analytics: SubmissionAnalytics,
): HTMLElement | null {
  if (analytics.acceptanceRate == null || analytics.rejectionRate == null) {
    return null;
  }

  const wrap = html(doc, "div");
  wrap.style.marginTop = "14px";
  wrap.style.paddingTop = "12px";
  wrap.style.borderTop =
    "1px solid color-mix(in srgb, currentColor 8%, transparent)";

  const labels = html(doc, "div");
  labels.style.display = "flex";
  labels.style.justifyContent = "space-between";
  labels.style.gap = "12px";
  labels.style.fontSize = "11.5px";
  labels.style.marginBottom = "6px";

  const acceptedLabel = html(doc, "span");
  acceptedLabel.textContent = `${getString("analytics-acceptance-rate")} ${formatPercent(analytics.acceptanceRate)}`;
  const rejectedLabel = html(doc, "span");
  rejectedLabel.textContent = `${getString("analytics-rejection-rate")} ${formatPercent(analytics.rejectionRate)}`;
  labels.append(acceptedLabel, rejectedLabel);

  const track = html(doc, "div");
  track.style.display = "flex";
  track.style.height = "10px";
  track.style.borderRadius = "999px";
  track.style.overflow = "hidden";
  track.style.background = "color-mix(in srgb, currentColor 8%, transparent)";
  track.title = getString("analytics-rate-hint");

  const accepted = html(doc, "div");
  accepted.style.width = `${analytics.acceptanceRate}%`;
  accepted.style.background = OUTCOME_COLORS.accepted;
  const rejected = html(doc, "div");
  rejected.style.width = `${analytics.rejectionRate}%`;
  rejected.style.background = OUTCOME_COLORS.rejected;
  track.append(accepted, rejected);

  wrap.append(labels, track);
  return wrap;
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

  const chart = html(doc, "div");
  chart.style.display = "flex";
  chart.style.alignItems = "stretch";
  chart.style.gap = "10px";
  chart.style.height = "210px";
  chart.style.overflowX = "auto";
  chart.style.padding = "6px 4px 0";

  const max = Math.max(1, ...analytics.yearlyTrend.map((item) => item.count));
  for (const item of analytics.yearlyTrend) {
    const column = html(doc, "div");
    column.style.display = "grid";
    column.style.gridTemplateRows = "22px minmax(120px, 1fr) 24px";
    column.style.alignItems = "end";
    column.style.justifyItems = "center";
    column.style.minWidth = "52px";
    column.style.flex = "1 0 52px";
    column.style.cursor = "pointer";
    column.setAttribute("role", "button");
    column.addEventListener("click", () => setYearFilter(item.year));

    const value = html(doc, "div");
    value.textContent = String(item.count);
    value.style.fontSize = "11.5px";
    value.style.fontWeight = "650";
    value.style.fontVariantNumeric = "tabular-nums";

    const barArea = html(doc, "div");
    barArea.style.width = "100%";
    barArea.style.height = "100%";
    barArea.style.display = "flex";
    barArea.style.alignItems = "flex-end";
    barArea.style.justifyContent = "center";
    barArea.style.borderBottom =
      "1px solid color-mix(in srgb, currentColor 10%, transparent)";

    const bar = html(doc, "div");
    bar.style.width = "32px";
    bar.style.maxWidth = "72%";
    bar.style.height = `${Math.max(6, (item.count / max) * 100)}%`;
    bar.style.borderRadius = "7px 7px 2px 2px";
    bar.style.background = "var(--st-accent, #3b82f6)";
    bar.style.opacity = "0.88";
    bar.title = `${item.year}: ${item.count}`;
    barArea.appendChild(bar);

    const year = html(doc, "div");
    year.textContent = String(item.year);
    year.style.fontSize = "11px";
    year.style.opacity = "0.62";

    column.append(value, barArea, year);
    chart.appendChild(column);
  }

  panel.appendChild(chart);
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

  panel.appendChild(buildJournalBars(doc, analytics));

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
    const start = table.children.length;
    appendTableRow(doc, table, [
      journal.journal,
      String(journal.submissions),
      String(journal.accepted),
      String(journal.rejected),
      formatDays(journal.averageFirstDecisionDays),
    ]);
    for (let index = start; index < start + 5; index += 1) {
      const cell = table.children[index] as HTMLElement | undefined;
      if (cell) {
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => setJournalFilter(journal.journal));
      }
    }
  }

  panel.appendChild(table);
  return panel;
}

function buildJournalBars(
  doc: Document,
  analytics: SubmissionAnalytics,
): HTMLElement {
  const journals = analytics.journals.slice(0, 8);
  const widths = getJournalBarWidths(journals);
  const chart = html(doc, "div");
  chart.style.display = "flex";
  chart.style.flexDirection = "column";
  chart.style.gap = "7px";
  chart.style.marginBottom = "16px";
  chart.style.paddingBottom = "14px";
  chart.style.borderBottom =
    "1px solid color-mix(in srgb, currentColor 8%, transparent)";

  journals.forEach((journal, index) => {
    const row = html(doc, "div");
    row.style.display = "grid";
    row.style.gridTemplateColumns =
      "minmax(150px, 240px) minmax(150px, 1fr) 52px";
    row.style.alignItems = "center";
    row.style.gap = "9px";
    row.style.cursor = "pointer";
    row.setAttribute("role", "button");
    row.addEventListener("click", () => setJournalFilter(journal.journal));

    const label = html(doc, "div");
    label.textContent = journal.journal;
    label.title = journal.journal;
    label.style.fontSize = "11.5px";
    label.style.whiteSpace = "nowrap";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";

    const track = html(doc, "div");
    track.style.height = "9px";
    track.style.borderRadius = "999px";
    track.style.overflow = "hidden";
    track.style.background = "color-mix(in srgb, currentColor 8%, transparent)";

    const fill = html(doc, "div");
    fill.style.width = `${Math.max(3, widths[index] || 0)}%`;
    fill.style.height = "100%";
    fill.style.borderRadius = "999px";
    fill.style.background = "var(--st-accent, #3b82f6)";
    fill.style.opacity = "0.82";
    track.appendChild(fill);

    const count = html(doc, "div");
    count.textContent = String(journal.submissions);
    count.style.textAlign = "right";
    count.style.fontWeight = "650";
    count.style.fontVariantNumeric = "tabular-nums";

    row.append(label, track, count);
    chart.appendChild(row);
  });

  return chart;
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

function getOutcomeLabel(key: OutcomeChartKey): string {
  switch (key) {
    case "active":
      return getString("analytics-active");
    case "accepted":
      return getString("analytics-accepted");
    case "rejected":
      return getString("analytics-rejected");
    case "withdrawn":
      return getString("analytics-withdrawn");
  }
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${value}%`;
}

function formatChartPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatDays(value: number | null): string {
  if (value == null) return "—";
  return getString("analytics-days", { args: { count: value } });
}
