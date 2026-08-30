import { config } from "../../package.json";
import { db } from "../db";
import {
  ACTIVE_STATUSES,
  daysFromToday,
  SubmissionRecord,
  todayStr,
} from "../types";
import { getPref, setPref } from "../utils/prefs";
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
  const records = await db.getAll();
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

export async function checkFollowUps(): Promise<void> {
  if (!getPref("reminder.enabled")) {
    return;
  }
  const records = await db.getAll();
  const popup = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: 10000,
  });
  let shown = 0;

  // 1) explicit follow-up dates that are due
  const due = records
    .filter(
      (record) =>
        ACTIVE_STATUSES.includes(record.currentStatus) &&
        !!record.followUpDate &&
        daysFromToday(record.followUpDate) <= 0,
    )
    .sort((a, b) =>
      String(a.followUpDate).localeCompare(String(b.followUpDate)),
    );
  if (due.length) {
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
    shown += due.length;
  }

  // 2) no-progress nag: active submissions quiet for reminder.autoDays
  const autoDays = Number(getPref("reminder.autoDays") ?? 30);
  if (autoDays > 0) {
    const today = todayStr();
    const map = readRemindedMap();
    const stale = records.filter((record) => {
      if (!ACTIVE_STATUSES.includes(record.currentStatus)) {
        return false;
      }
      if (due.includes(record)) {
        return false;
      }
      if (map[String(record.id)] === today) {
        return false;
      }
      return -daysFromToday(quietSinceDate(record)) >= autoDays;
    });
    if (stale.length) {
      popup.createLine({
        text: getString("reminder-noprogress-header", {
          args: { count: stale.length },
        }),
        type: "default",
        progress: 100,
      });
      for (const record of stale.slice(0, 4)) {
        popup.createLine({
          text: describeStale(record, -daysFromToday(quietSinceDate(record))),
          type: "default",
        });
      }
      for (const record of stale) {
        map[String(record.id)] = today;
      }
      setPref("reminder.remindedMap", JSON.stringify(map));
      shown += stale.length;
    }
  }

  if (shown > 0) {
    popup.show();
  }
}

/** ISO date of the last activity: latest update, or creation day. */
function quietSinceDate(record: SubmissionRecord): string {
  return record.updatedAt ? epochToDate(record.updatedAt) : todayStr();
}

function epochToDate(epochMs: number): string {
  const d = new Date(epochMs);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function readRemindedMap(): Record<string, string> {
  try {
    return JSON.parse((getPref("reminder.remindedMap") as any) || "{}");
  } catch (e) {
    return {};
  }
}

function describeStale(record: SubmissionRecord, days: number): string {
  const title = getItemTitle(record.libraryID, record.itemKey) || "";
  const trimmed = title.length > 40 ? `${title.slice(0, 40)}…` : title;
  const journal = record.journal ? ` · ${record.journal}` : "";
  return `${trimmed}${journal} — ${getString("reminder-noprogress-text", {
    args: { days },
  })}`;
}

function describeDue(record: SubmissionRecord): string {
  const title = getItemTitle(record.libraryID, record.itemKey) || "";
  const trimmed = title.length > 40 ? `${title.slice(0, 40)}…` : title;
  const journal = record.journal ? ` · ${record.journal}` : "";
  return `${trimmed}${journal} · ${statusLabel(record.currentStatus)} (${record.followUpDate})`;
}
