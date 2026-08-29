import { config } from "../../package.json";
import { db } from "../db";
import { ACTIVE_STATUSES, daysFromToday, SubmissionRecord } from "../types";
import { getPref } from "../utils/prefs";
import { getString } from "../utils/locale";
import { getItemTitle, statusLabel } from "./ui";

let notifierID: string | null = null;
let reminderTimer: number | null = null;

export function registerNotifier(): void {
  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: Array<string | number>,
      _extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) {
        unregisterNotifier();
        return;
      }
      if (event !== "delete" || type !== "item") {
        return;
      }
      // Best effort: resolve items before they are gone. Records whose
      // items cannot be resolved are swept at startup instead.
      const targets: Array<{ libraryID: number; itemKey: string }> = [];
      for (const id of ids) {
        const item = Zotero.Items.get(id as number) as Zotero.Item | undefined;
        if (item) {
          targets.push({ libraryID: item.libraryID, itemKey: item.key });
        }
      }
      await db.deleteForItems(targets);
    },
  };
  notifierID = Zotero.Notifier.registerObserver(
    callback,
    ["item"],
    "submission-tracker",
  );
}

export function unregisterNotifier(): void {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = null;
  }
  stopReminderLoop();
}

/**
 * Drop submission records whose Zotero item no longer exists.
 */
export async function cleanupOrphans(): Promise<void> {
  const records = db.getAll();
  if (!records.length) {
    return;
  }
  const missing: Array<{ libraryID: number; itemKey: string }> = [];
  for (const record of records) {
    const itemID = Zotero.Items.getIDFromLibraryAndKey(
      record.libraryID,
      record.itemKey,
    );
    if (!itemID) {
      missing.push({ libraryID: record.libraryID, itemKey: record.itemKey });
    }
  }
  await db.deleteForItems(missing);
}

export function startReminderLoop(): void {
  if (!getPref("reminder.enabled")) {
    return;
  }
  // Give Zotero time to finish painting the main window before nagging.
  const win = Zotero.getMainWindow();
  const delay = win ? (win as any).setTimeout.bind(win) : setTimeout;
  delay(() => checkFollowUps(), 15000);
  reminderTimer = delay(
    () => checkFollowUps(),
    12 * 60 * 60 * 1000,
  ) as unknown as number;
}

function stopReminderLoop(): void {
  if (reminderTimer != null) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
}

export function checkFollowUps(): void {
  if (!getPref("reminder.enabled")) {
    return;
  }
  const due = db
    .getAll()
    .filter(
      (record) =>
        ACTIVE_STATUSES.includes(record.currentStatus) &&
        !!record.followUpDate &&
        daysFromToday(record.followUpDate) <= 0,
    )
    .sort((a, b) =>
      String(a.followUpDate).localeCompare(String(b.followUpDate)),
    );
  if (!due.length) {
    return;
  }
  const popup = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: 10000,
  });
  popup.createLine({
    text: getString("reminder-header", { args: { count: due.length } }),
    type: "default",
    progress: 100,
  });
  for (const record of due.slice(0, 4)) {
    popup.createLine({
      text: describeDue(record),
      type: "failure",
    });
  }
  popup.show();
}

function describeDue(record: SubmissionRecord): string {
  const title = getItemTitle(record.libraryID, record.itemKey) || "";
  const trimmed = title.length > 40 ? `${title.slice(0, 40)}…` : title;
  const journal = record.journal ? ` · ${record.journal}` : "";
  return `${trimmed}${journal} · ${statusLabel(record.currentStatus)} (${record.followUpDate})`;
}
