import {
  isSubmissionStatus,
  NewSubmissionInput,
  StatusEvent,
  SubmissionRecord,
  SubmissionStatus,
  todayStr,
} from "./types";

const TABLE_SUBMISSIONS = "submissiontrackerSubmissions";
const TABLE_EVENTS = "submissiontrackerEvents";

/**
 * Data layer for submission records, backed by two tables in zotero.sqlite.
 * An in-memory cache keeps the item-tree column provider synchronous.
 */
class SubmissionDB {
  private records: SubmissionRecord[] = [];
  private events: StatusEvent[] = [];
  private byItem = new Map<string, SubmissionRecord[]>();
  private listeners = new Set<() => void>();

  async initialize(): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSIONS} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          libraryID INTEGER NOT NULL,
          itemKey TEXT NOT NULL,
          journal TEXT NOT NULL DEFAULT '',
          currentStatus TEXT NOT NULL DEFAULT 'draft',
          followUpDate TEXT,
          notes TEXT NOT NULL DEFAULT '',
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )`,
      );
      await Zotero.DB.queryAsync(
        `CREATE INDEX IF NOT EXISTS ${TABLE_SUBMISSIONS}_item
         ON ${TABLE_SUBMISSIONS} (libraryID, itemKey)`,
      );
      await Zotero.DB.queryAsync(
        `CREATE TABLE IF NOT EXISTS ${TABLE_EVENTS} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          submissionId INTEGER NOT NULL,
          status TEXT NOT NULL,
          date TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          createdAt INTEGER NOT NULL
        )`,
      );
      await Zotero.DB.queryAsync(
        `CREATE INDEX IF NOT EXISTS ${TABLE_EVENTS}_submission
         ON ${TABLE_EVENTS} (submissionId)`,
      );
    });
    await this.reload();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async reload(): Promise<void> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_SUBMISSIONS} ORDER BY createdAt DESC, id DESC`,
    )) as any[];
    this.records = rows.map(rowToRecord);
    const eventRows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_EVENTS} ORDER BY date ASC, id ASC`,
    )) as any[];
    this.events = eventRows.map(rowToEvent);
    this.rebuildIndex();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        ztoolkit.log("submissiontracker: onChange listener failed", e);
      }
    }
  }

  private rebuildIndex(): void {
    this.byItem.clear();
    for (const record of this.records) {
      const key = itemKeyOf(record.libraryID, record.itemKey);
      const list = this.byItem.get(key);
      if (list) {
        list.push(record);
      } else {
        this.byItem.set(key, [record]);
      }
    }
  }

  getAll(): SubmissionRecord[] {
    return this.records;
  }

  getForItem(libraryID: number, itemKey: string): SubmissionRecord[] {
    return this.byItem.get(itemKeyOf(libraryID, itemKey)) || [];
  }

  getLatestForItem(
    libraryID: number,
    itemKey: string,
  ): SubmissionRecord | undefined {
    return this.getForItem(libraryID, itemKey)[0];
  }

  getSubmission(id: number): SubmissionRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  getEvents(submissionId: number): StatusEvent[] {
    return this.events.filter((e) => e.submissionId === submissionId);
  }

  distinctJournals(): string[] {
    const set = new Set<string>();
    for (const r of this.records) {
      if (r.journal) {
        set.add(r.journal);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  async create(input: NewSubmissionInput): Promise<SubmissionRecord> {
    const now = Date.now();
    let created: SubmissionRecord | undefined;
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `INSERT INTO ${TABLE_SUBMISSIONS}
         (libraryID, itemKey, journal, currentStatus, followUpDate, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.libraryID,
          input.itemKey,
          input.journal,
          input.status,
          input.followUpDate || null,
          input.notes || "",
          now,
          now,
        ],
      );
      const newId = Number(
        await Zotero.DB.valueQueryAsync("SELECT last_insert_rowid()"),
      );
      await Zotero.DB.queryAsync(
        `INSERT INTO ${TABLE_EVENTS} (submissionId, status, date, note, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [newId, input.status, input.date, "", now],
      );
      created = {
        id: newId,
        libraryID: input.libraryID,
        itemKey: input.itemKey,
        journal: input.journal,
        currentStatus: input.status,
        followUpDate: input.followUpDate || null,
        notes: input.notes || "",
        createdAt: now,
        updatedAt: now,
      };
    });
    await this.reload();
    return created!;
  }

  /**
   * Append a status-change event and move the submission's current status.
   */
  async addEvent(
    submissionId: number,
    status: SubmissionStatus,
    date: string,
    note = "",
  ): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `INSERT INTO ${TABLE_EVENTS} (submissionId, status, date, note, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [submissionId, status, date, note, Date.now()],
      );
      await Zotero.DB.queryAsync(
        `UPDATE ${TABLE_SUBMISSIONS} SET currentStatus = ?, updatedAt = ? WHERE id = ?`,
        [status, Date.now(), submissionId],
      );
    });
    await this.reload();
  }

  async updateSubmission(
    id: number,
    fields: Partial<
      Pick<
        SubmissionRecord,
        "journal" | "followUpDate" | "notes" | "currentStatus"
      >
    >,
  ): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `UPDATE ${TABLE_SUBMISSIONS} SET
           journal = ?,
           followUpDate = ?,
           notes = ?,
           currentStatus = ?,
           updatedAt = ?
         WHERE id = ?`,
        [
          fields.journal,
          fields.followUpDate || null,
          fields.notes,
          fields.currentStatus,
          Date.now(),
          id,
        ],
      );
    });
    await this.reload();
  }

  async deleteSubmission(id: number): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `DELETE FROM ${TABLE_EVENTS} WHERE submissionId = ?`,
        [id],
      );
      await Zotero.DB.queryAsync(
        `DELETE FROM ${TABLE_SUBMISSIONS} WHERE id = ?`,
        [id],
      );
    });
    await this.reload();
  }

  /** Drop records of permanently deleted items (Notifier "delete" hook). */
  async deleteForItems(
    deleted: Array<{ libraryID: number; itemKey: string }>,
  ): Promise<void> {
    const targets = deleted.filter(({ libraryID, itemKey }) =>
      this.byItem.has(itemKeyOf(libraryID, itemKey)),
    );
    if (!targets.length) {
      return;
    }
    await Zotero.DB.executeTransaction(async () => {
      for (const { libraryID, itemKey } of targets) {
        await Zotero.DB.queryAsync(
          `DELETE FROM ${TABLE_EVENTS} WHERE submissionId IN
             (SELECT id FROM ${TABLE_SUBMISSIONS} WHERE libraryID = ? AND itemKey = ?)`,
          [libraryID, itemKey],
        );
        await Zotero.DB.queryAsync(
          `DELETE FROM ${TABLE_SUBMISSIONS} WHERE libraryID = ? AND itemKey = ?`,
          [libraryID, itemKey],
        );
      }
    });
    await this.reload();
  }

  async exportJSON(): Promise<string> {
    await this.reload();
    return JSON.stringify(
      {
        format: "submission-tracker-v1",
        exportedAt: new Date().toISOString(),
        submissions: this.records,
        events: this.events,
      },
      null,
      2,
    );
  }

  /**
   * Import a JSON export. Records whose item no longer exists are skipped.
   * Returns [importedCount, skippedCount].
   */
  async importJSON(json: string): Promise<[number, number]> {
    const data = JSON.parse(json);
    if (
      data?.format !== "submission-tracker-v1" ||
      !Array.isArray(data.submissions)
    ) {
      throw new Error("Unrecognized submission-tracker backup file");
    }
    const events: StatusEvent[] = Array.isArray(data.events) ? data.events : [];
    const records: SubmissionRecord[] = data.submissions.map((r: any) =>
      rowToRecord(r),
    );
    let imported = 0;
    let skipped = 0;
    for (const record of records) {
      const itemID = Zotero.Items.getIDFromLibraryAndKey(
        record.libraryID,
        record.itemKey,
      );
      if (!itemID) {
        skipped += 1;
        continue;
      }
      const created = await this.create({
        libraryID: record.libraryID,
        itemKey: record.itemKey,
        journal: record.journal,
        status: isSubmissionStatus(record.currentStatus)
          ? record.currentStatus
          : "draft",
        date:
          latestEventDate(events, record.id) || todayStrOf(record.createdAt),
        followUpDate: record.followUpDate,
        notes: record.notes,
      });
      // Replay the full event history of the export onto the new record.
      for (const event of events.filter((e) => e.submissionId === record.id)) {
        if (!isSubmissionStatus(event.status)) {
          continue;
        }
        await this.addEvent(created.id, event.status, event.date, event.note);
      }
      imported += 1;
    }
    return [imported, skipped];
  }
}

function itemKeyOf(libraryID: number, itemKey: string): string {
  return `${libraryID}:${itemKey}`;
}

function rowToRecord(row: any): SubmissionRecord {
  return {
    id: Number(row.id),
    libraryID: Number(row.libraryID),
    itemKey: String(row.itemKey),
    journal: String(row.journal || ""),
    currentStatus: isSubmissionStatus(String(row.currentStatus))
      ? (String(row.currentStatus) as SubmissionStatus)
      : "draft",
    followUpDate: row.followUpDate ? String(row.followUpDate) : null,
    notes: String(row.notes || ""),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function rowToEvent(row: any): StatusEvent {
  return {
    id: Number(row.id),
    submissionId: Number(row.submissionId),
    status: isSubmissionStatus(String(row.status))
      ? (String(row.status) as SubmissionStatus)
      : "draft",
    date: String(row.date),
    note: String(row.note || ""),
    createdAt: Number(row.createdAt),
  };
}

function latestEventDate(
  events: StatusEvent[],
  submissionId: number,
): string | null {
  const dates = events
    .filter((e) => e.submissionId === submissionId && e.date)
    .map((e) => e.date)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function todayStrOf(epochMs: number): string {
  const d = new Date(epochMs);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const db = new SubmissionDB();
