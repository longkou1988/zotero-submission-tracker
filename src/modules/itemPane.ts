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
      const currentItem = (item as Zotero.Item) || null;
      setEnabled(
        !!currentItem &&
          currentItem.isRegularItem() &&
          !(currentItem as any).isFeedItem,
      );
      return true;
    },
    onRender: ({ body, item, setSectionSummary }) => {
      body.textContent = "";
      trackSection(body as HTMLElement, (item as Zotero.Item) || false);
      void renderSection(
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
 * Track a rendered section body so data mutations can re-render it.
 * Existing entries for the same body are refreshed instead of duplicated.
 */
function trackSection(body: HTMLElement, item: Zotero.Item | false): void {
  const itemID = item ? (item as Zotero.Item).id : null;
  for (let i = renderedSections.length - 1; i >= 0; i -= 1) {
    if (renderedSections[i].body === body) {
      renderedSections.splice(i, 1);
    }
  }
  renderedSections.push({ body, itemID });
}

/**
 * Re-render every visible section (called after data mutations, because
 * custom sections get no automatic re-render for plugin-owned data).
 */
export async function refreshOpenSections(): Promise<void> {
  for (const entry of [...renderedSections]) {
    if (!entry.body.isConnected) {
      const idx = renderedSections.indexOf(entry);
      if (idx >= 0) {
        renderedSections.splice(idx, 1);
      }
      continue;
    }
    const item = entry.itemID != null ? Zotero.Items.get(entry.itemID) : false;
    entry.body.textContent = "";
    await renderSection(entry.body, item as Zotero.Item | false, undefined);
  }
}

let healTimer: number | null = null;
const lastReloadAt = 0;

/**
 * Safety net for the flaky custom-section render pipeline: query the DOM
 * directly and re-render any section that is bound to a valid item but
 * whose body sits empty (hook registration and pane rebuilds can race,
 * leaving instances no tracked entry can heal). Runs every ~1.5 s.
 */
export function startSectionHealLoop(): void {
  if (healTimer != null) {
    return;
  }
  (addon.data as any).sweepDriven = true;
  healTimer = setInterval(() => {
    void sweepTick();
  }, 800) as unknown as number;
}

async function sweepTick(): Promise<void> {
  if (!addon?.data.alive) {
    stopSectionHealLoop();
    return;
  }
  // If Zotero loaded the plugin twice (e.g. after a same-session addon
  // replacement), only the context owning Zotero.<addonInstance> may
  // touch the DOM — older contexts' caches are stale.
  if ((Zotero as any)[config.addonInstance] !== addon) {
    stopSectionHealLoop();
    return;
  }
  for (const win of Zotero.getMainWindows()) {
    const doc = win.document;
    const sections = [
      ...doc.querySelectorAll(
        'item-pane-custom-section[data-pane$="submissiontracker-section"]',
      ),
    ];
    if (!sections.length) {
      continue;
    }
    // Zotero 10 does not reliably rebind custom sections on item switches
    // (el.item can stay frozen), so the sweep reads the selected item
    // straight from ZoteroPane — the authoritative source.
    let currentItem: Zotero.Item | null = null;
    try {
      const selected = ((win as any).ZoteroPane?.getSelectedItems?.() ||
        []) as Zotero.Item[];
      currentItem =
        selected.find(
          (i) => i && i.isRegularItem() && !(i as any).isFeedItem,
        ) || null;
    } catch (e) {
      ztoolkit.log("submissiontracker: getSelectedItems failed", e);
    }
    for (const sec of sections) {
      try {
        const el = sec as any;
        if (el._section) {
          el.hidden = !currentItem;
        }
        if (!currentItem) {
          continue;
        }
        // Keep Zotero's own binding in sync for other consumers.
        try {
          if (!el.item || el.item.id !== currentItem.id) {
            el.item = currentItem;
          }
        } catch (e) {
          // assignment is best-effort only
        }
        const body = el._body as HTMLElement | null;
        if (!body) {
          continue;
        }
        const stale =
          body.dataset.stRenderedItem !== String(currentItem.id) ||
          !body.querySelector(".st-section-root") ||
          !!body.querySelector(".st-empty");
        if (!stale) {
          continue;
        }
        const dbg =
          (addon.data as any).renderLog || ((addon.data as any).renderLog = []);
        dbg.push(
          `sweep rebind sec=${currentItem.id} prev=${body.dataset.stRenderedItem || "none"}`,
        );
        if (dbg.length > 10) {
          dbg.shift();
        }
        body.textContent = "";
        await renderSection(body, currentItem);
        const latest = await db.getLatestForItem(
          currentItem.libraryID,
          currentItem.key,
        );
        if (el._section) {
          el._section.summary = latest ? statusLabel(latest.currentStatus) : "";
        }
      } catch (e) {
        const dbg =
          (addon.data as any).renderLog || ((addon.data as any).renderLog = []);
        dbg.push(
          `SWEEP-ERR: ${String((e as any)?.message || e).slice(0, 200)}`,
        );
        if (dbg.length > 8) {
          dbg.shift();
        }
        ztoolkit.log("submissiontracker: section sweep failed", e);
      }
    }
  }
}

export function stopSectionHealLoop(): void {
  if (healTimer != null) {
    clearInterval(healTimer);
    healTimer = null;
  }
}

type SectionSummarySetter = (summary: string) => string;

async function renderSection(
  body: HTMLElement,
  item: Zotero.Item | false,
  setSectionSummary?: SectionSummarySetter,
): Promise<void> {
  const doc = body.ownerDocument as Document;
  if (!item || (item as any).isFeedItem) {
    return;
  }
  const records = await db.getForItem(item.libraryID, item.key);
  body.dataset.stRenderedItem = String(item.id);
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
    try {
      root.appendChild(await buildRecordBlock(doc, record));
    } catch (e) {
      const dbg =
        (addon.data as any).renderLog || ((addon.data as any).renderLog = []);
      dbg.push(
        `BLOCK-ERR ${record.id}: ${String((e as any)?.message || e).slice(0, 180)}`,
      );
      if (dbg.length > 8) {
        dbg.shift();
      }
    }
  }
}

async function buildRecordBlock(
  doc: Document,
  record: SubmissionRecord,
): Promise<HTMLElement> {
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

  const events = await db.getEvents(record.id);
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
      void db
        .getSubmission(shown[shown.length - 1].submissionId)
        .then((record) => {
          if (record) {
            openDetailDialog(record);
          }
        });
    });
  }
  return timeline;
}
