import { config } from "../../package.json";
import { db } from "../db";
import { daysFromToday, StatusEvent, SubmissionRecord } from "../types";
import { getLocaleID, getString } from "../utils/locale";
import { openDetailDialog, openCreateDialog } from "./dialog";
import { openDashboard } from "./dashboard";
import { html, statusBadge, statusLabel } from "./ui";

interface RenderedSection {
  body: HTMLElement;
  itemID: number | null;
}

const renderedSections: RenderedSection[] = [];

export function registerItemPaneSection(): void {
  Zotero.ItemPaneManager.registerSection({
    paneID: "submissiontracker-section",
    pluginID: config.addonID,
    header: {
      l10nID: getLocaleID("section-header"),
      icon: `chrome://${config.addonRef}/content/icons/section.svg`,
    },
    sidenav: {
      l10nID: getLocaleID("section-header"),
      icon: `chrome://${config.addonRef}/content/icons/section.svg`,
    },
    onItemChange: ({ item, setEnabled }) => {
      setEnabled(
        !!item &&
          (item as Zotero.Item).isRegularItem() &&
          !(item as any).isFeedItem,
      );
      return true;
    },
    onRender: ({ body, item, setSectionSummary }) => {
      body.textContent = "";
      renderedSections.push({
        body: body as HTMLElement,
        itemID: item ? (item as Zotero.Item).id : null,
      });
      renderSection(
        body as HTMLElement,
        item as Zotero.Item | false,
        setSectionSummary,
      );
    },
    sectionButtons: [
      {
        type: "add",
        icon: `chrome://${config.addonRef}/content/icons/plus.svg`,
        l10nID: getLocaleID("section-btn-add"),
        onClick: ({ item }) => {
          if (item) {
            openCreateDialog([item as Zotero.Item]);
          }
        },
      },
      {
        type: "open",
        icon: `chrome://${config.addonRef}/content/icons/dashboard.svg`,
        l10nID: getLocaleID("section-btn-open"),
        onClick: () => openDashboard(),
      },
    ],
  });
}

/**
 * Re-render every visible section (called after data mutations, because
 * custom sections get no automatic re-render for plugin-owned data).
 */
export function refreshOpenSections(): void {
  for (let i = renderedSections.length - 1; i >= 0; i -= 1) {
    const entry = renderedSections[i];
    if (!entry.body.isConnected) {
      renderedSections.splice(i, 1);
      continue;
    }
    const item = entry.itemID != null ? Zotero.Items.get(entry.itemID) : false;
    entry.body.textContent = "";
    renderSection(entry.body, item as Zotero.Item | false, undefined);
  }
}

type SectionSummarySetter = (summary: string) => string;

function renderSection(
  body: HTMLElement,
  item: Zotero.Item | false,
  setSectionSummary?: SectionSummarySetter,
): void {
  const doc = body.ownerDocument as Document;
  if (!item || (item as any).isFeedItem) {
    return;
  }
  const records = db.getForItem(item.libraryID, item.key);
  const root = html(doc, "div", "st-section-root");
  body.appendChild(root);

  if (setSectionSummary) {
    const latest = records[0];
    setSectionSummary(latest ? statusLabel(latest.currentStatus) : "");
  }

  if (!records.length) {
    const empty = html(doc, "div", "st-empty");
    const hint = html(doc, "div", "st-empty-hint");
    hint.textContent = getString("section-empty-hint");
    const cta = html(doc, "button", "st-btn st-btn--primary");
    cta.textContent = getString("section-empty-cta");
    cta.addEventListener("click", () => openCreateDialog([item]));
    empty.append(hint, cta);
    root.appendChild(empty);
    return;
  }

  for (const record of records) {
    root.appendChild(buildRecordBlock(doc, record));
  }
}

function buildRecordBlock(
  doc: Document,
  record: SubmissionRecord,
): HTMLElement {
  const block = html(doc, "div", "st-sub");

  const head = html(doc, "div", "st-sub-head");
  const journal = html(doc, "span", "st-sub-journal");
  journal.textContent = record.journal || getString("section-unnamed-journal");
  journal.addEventListener("click", () => openDetailDialog(record));
  const badge = statusBadge(doc, record.currentStatus);
  badge.classList.add("st-badge--sm");
  const edit = html(doc, "button", "st-iconbtn");
  edit.textContent = getString("section-edit");
  edit.addEventListener("click", () => openDetailDialog(record));
  head.append(journal, badge, edit);
  block.appendChild(head);

  const events = db.getEvents(record.id);
  if (events.length) {
    block.appendChild(buildTimeline(doc, events));
  }

  if (record.followUpDate) {
    const follow = html(doc, "div", "st-followup");
    const days = daysFromToday(record.followUpDate);
    if (days < 0) {
      follow.classList.add("st-followup--overdue");
      follow.textContent = `${getString("section-followup")}: ${record.followUpDate} (${getString("section-overdue")} ${Math.abs(days)}d)`;
    } else {
      follow.textContent = `${getString("section-followup")}: ${record.followUpDate}`;
    }
    block.appendChild(follow);
  }

  return block;
}

/** Latest three events, newest first, plus a "view all" action. */
function buildTimeline(doc: Document, events: StatusEvent[]): HTMLElement {
  const timeline = html(doc, "div", "st-timeline");
  const shown = events.slice(-3).reverse();
  for (const event of shown) {
    const row = html(doc, "div", "st-event");
    const date = html(doc, "span", "st-event-date");
    date.textContent = event.date;
    const badge = statusBadge(doc, event.status);
    badge.classList.add("st-badge--sm");
    row.append(date, badge);
    if (event.note) {
      const note = html(doc, "span", "st-event-note");
      note.textContent = event.note;
      note.title = event.note;
      row.appendChild(note);
    }
    timeline.appendChild(row);
  }
  if (events.length > shown.length) {
    const more = html(doc, "button", "st-more");
    more.textContent = getString("section-more-events", {
      args: { count: events.length },
    });
    timeline.appendChild(more);
    more.addEventListener("click", () => {
      const record = db.getSubmission(shown[shown.length - 1].submissionId);
      if (record) {
        openDetailDialog(record);
      }
    });
  }
  return timeline;
}
