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
 *
 * Reads hit the database directly: Zotero can load an addon bundle into more
 * than one sandbox context (e.g. after same-session addon replacement), and
 * an in-memory cache would then serve stale rows from the wrong context.
 * The only cached state is `columnMirror`, a tiny status map refreshed on
 * every mutation and by the section sweep, used by the synchronous item-tree
 * column provider.
 */
class SubmissionDB {
  /** itemKey (`libraryID:itemKey`) -> current status, for the sync column. */
  private columnMirror = new Map<string, SubmissionStatus>();
  private listeners = new Set<() => void>();
  /** Set once initialize() has run in this context. */
  initialized = false;

  constructor() {
    // Callers outside this bundle (Zotero.SubmissionTracker.api from other
    // plugins or Run JavaScript) reach these methods through a cross-
    // compartment wrapper; unbound calls would misbehave when methods rely
    // on `this`. Bind everything eagerly.
    for (const key of Object.getOwnPropertyNames(
      SubmissionDB.prototype,
    ) as Array<keyof SubmissionDB>) {
      const value = (this as any)[key];
      if (typeof value === "function") {
        (this as any)[key] = value.bind(this);
      }
    }
  }

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
          statusUrl TEXT,
          manuscriptId TEXT,
          lastCheckedAt INTEGER,
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
    await this.migrate();
    await this.refreshMirror();
    this.initialized = true;
  }

  /** Idempotent column migrations for tables created before 0.3.0. */
  private async migrate(): Promise<void> {
    const migrations: Array<[string, string]> = [
      ["statusUrl", "TEXT"],
      ["manuscriptId", "TEXT"],
      ["lastCheckedAt", "INTEGER"],
    ];
    const existing = (await Zotero.DB.getColumns(TABLE_SUBMISSIONS)) as any;
    const names = new Set(
      (Array.isArray(existing) ? existing : []).map((c: any) =>
        String(c?.name || c),
      ),
    );
    for (const [column, type] of migrations) {
      if (!names.has(column)) {
        await Zotero.DB.queryAsync(
          `ALTER TABLE ${TABLE_SUBMISSIONS} ADD COLUMN ${column} ${type}`,
        );
      }
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    void this.refreshMirror();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        ztoolkit.log("submissiontracker: onChange listener failed", e);
      }
    }
  }

  /** Refresh the synchronous mirror used by the item-tree column. */
  async refreshMirror(): Promise<void> {
    try {
      const rows = (await Zotero.DB.queryAsync(
        `SELECT libraryID, itemKey, currentStatus FROM ${TABLE_SUBMISSIONS}
         ORDER BY updatedAt DESC`,
      )) as any[];
      const mirror = new Map<string, SubmissionStatus>();
      for (const row of rows || []) {
        const key = `${Number(row.libraryID)}:${String(row.itemKey)}`;
        const status = String(row.currentStatus);
        // First row per item = most recently updated submission.
        if (!mirror.has(key) && isSubmissionStatus(status)) {
          mirror.set(key, status);
        }
      }
      this.columnMirror = mirror;
    } catch (e) {
      ztoolkit.log("submissiontracker: refreshMirror failed", e);
    }
  }

  /** Synchronous status lookup for the item-tree column provider. */
  getColumnStatusSync(
    libraryID: number,
    itemKey: string,
  ): SubmissionStatus | null {
    return this.columnMirror.get(`${libraryID}:${itemKey}`) || null;
  }

  async getAll(): Promise<SubmissionRecord[]> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_SUBMISSIONS} ORDER BY createdAt DESC, id DESC`,
    )) as any[];
    return (rows || []).map(rowToRecord);
  }

  async getForItem(
    libraryID: number,
    itemKey: string,
  ): Promise<SubmissionRecord[]> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_SUBMISSIONS}
       WHERE libraryID = ? AND itemKey = ?
       ORDER BY createdAt DESC, id DESC`,
      [libraryID, itemKey],
    )) as any[];
    return (rows || []).map(rowToRecord);
  }

  async getLatestForItem(
    libraryID: number,
    itemKey: string,
  ): Promise<SubmissionRecord | undefined> {
    return (await this.getForItem(libraryID, itemKey))[0];
  }

  async getSubmission(id: number): Promise<SubmissionRecord | undefined> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_SUBMISSIONS} WHERE id = ?`,
      [id],
    )) as any[];
    return rows && rows.length ? rowToRecord(rows[0]) : undefined;
  }

  async getEvents(submissionId: number): Promise<StatusEvent[]> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_EVENTS} WHERE submissionId = ? ORDER BY date ASC, id ASC`,
      [submissionId],
    )) as any[];
    return (rows || []).map(rowToEvent);
  }

  async distinctJournals(): Promise<string[]> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT DISTINCT journal FROM ${TABLE_SUBMISSIONS} WHERE journal != ''`,
    )) as any[];
    return (rows || [])
      .map((r) => String(r.journal))
      .sort((a, b) => a.localeCompare(b));
  }

  async create(input: NewSubmissionInput): Promise<SubmissionRecord> {
    const now = Date.now();
    let created: SubmissionRecord | undefined;
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `INSERT INTO ${TABLE_SUBMISSIONS}
         (libraryID, itemKey, journal, currentStatus, followUpDate, notes,
          statusUrl, manuscriptId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.libraryID,
          input.itemKey,
          input.journal,
          input.status,
          input.followUpDate || null,
          input.notes || "",
          input.statusUrl || null,
          input.manuscriptId || null,
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
        statusUrl: input.statusUrl || null,
        manuscriptId: input.manuscriptId || null,
        lastCheckedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });
    this.notify();
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
    this.notify();
  }

  async updateSubmission(
    id: number,
    fields: Partial<
      Pick<
        SubmissionRecord,
        | "journal"
        | "followUpDate"
        | "notes"
        | "currentStatus"
        | "statusUrl"
        | "manuscriptId"
      >
    >,
  ): Promise<void> {
    const current = await this.getSubmission(id);
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `UPDATE ${TABLE_SUBMISSIONS} SET
           journal = ?,
           followUpDate = ?,
           notes = ?,
           currentStatus = ?,
           statusUrl = ?,
           manuscriptId = ?,
           updatedAt = ?
         WHERE id = ?`,
        [
          fields.journal,
          fields.followUpDate || null,
          fields.notes,
          fields.currentStatus,
          fields.statusUrl !== undefined
            ? fields.statusUrl || null
            : current?.statusUrl || null,
          fields.manuscriptId !== undefined
            ? fields.manuscriptId || null
            : current?.manuscriptId || null,
          Date.now(),
          id,
        ],
      );
    });
    this.notify();
  }

  /** Record that the user just opened the status page. */
  async updateCheckedAt(id: number): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `UPDATE ${TABLE_SUBMISSIONS} SET lastCheckedAt = ? WHERE id = ?`,
        [Date.now(), id],
      );
    });
    this.notify();
  }

  /**
   * Delete one status event; the submission's current status falls back to
   * the latest remaining event (or "draft" when none is left).
   */
  async deleteEvent(eventId: number): Promise<void> {
    const events = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_EVENTS} WHERE id = ?`,
      [eventId],
    )) as any[];
    if (!events || !events.length) {
      return;
    }
    const event = rowToEvent(events[0]);
    const remaining = (await Zotero.DB.queryAsync(
      `SELECT status FROM ${TABLE_EVENTS} WHERE submissionId = ? AND id != ? ORDER BY date ASC, id ASC`,
      [event.submissionId, eventId],
    )) as any[];
    const last =
      remaining && remaining.length
        ? String(remaining[remaining.length - 1].status)
        : "draft";
    const newStatus: SubmissionStatus = isSubmissionStatus(last)
      ? (last as SubmissionStatus)
      : "draft";
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(`DELETE FROM ${TABLE_EVENTS} WHERE id = ?`, [
        eventId,
      ]);
      await Zotero.DB.queryAsync(
        `UPDATE ${TABLE_SUBMISSIONS} SET currentStatus = ?, updatedAt = ? WHERE id = ?`,
        [newStatus, Date.now(), event.submissionId],
      );
    });
    this.notify();
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
    this.notify();
  }

  /** Drop records of permanently deleted items (Notifier "delete" hook). */
  async deleteForItems(
    deleted: Array<{ libraryID: number; itemKey: string }>,
  ): Promise<void> {
    if (!deleted.length) {
      return;
    }
    let removed = false;
    await Zotero.DB.executeTransaction(async () => {
      for (const { libraryID, itemKey } of deleted) {
        const rows = (await Zotero.DB.queryAsync(
          `SELECT id FROM ${TABLE_SUBMISSIONS} WHERE libraryID = ? AND itemKey = ?`,
          [libraryID, itemKey],
        )) as any[];
        if (!rows || !rows.length) {
          continue;
        }
        removed = true;
        for (const row of rows) {
          await Zotero.DB.queryAsync(
            `DELETE FROM ${TABLE_EVENTS} WHERE submissionId = ?`,
            [Number(row.id)],
          );
          await Zotero.DB.queryAsync(
            `DELETE FROM ${TABLE_SUBMISSIONS} WHERE id = ?`,
            [Number(row.id)],
          );
        }
      }
    });
    if (removed) {
      this.notify();
    }
  }

  async exportJSON(): Promise<string> {
    const submissions = await this.getAll();
    const events = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_EVENTS} ORDER BY date ASC, id ASC`,
    )) as any[];
    return JSON.stringify(
      {
        format: "submission-tracker-v1",
        exportedAt: new Date().toISOString(),
        submissions,
        events: (events || []).map(rowToEvent),
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
    let imported = 0;
    let skipped = 0;
    for (const record of data.submissions) {
      const itemID = Zotero.Items.getIDFromLibraryAndKey(
        Number(record.libraryID),
        String(record.itemKey),
      );
      if (!itemID) {
        skipped += 1;
        continue;
      }
      const created = await this.create({
        libraryID: Number(record.libraryID),
        itemKey: String(record.itemKey),
        journal: String(record.journal || ""),
        status: isSubmissionStatus(String(record.currentStatus))
          ? (String(record.currentStatus) as SubmissionStatus)
          : "draft",
        date:
          latestEventDate(events, Number(record.id)) ||
          todayStrOf(Number(record.createdAt)),
        followUpDate: record.followUpDate || null,
        notes: String(record.notes || ""),
        statusUrl: record.statusUrl || null,
        manuscriptId: record.manuscriptId || null,
      });
      // Replay the full event history of the export onto the new record.
      for (const event of events.filter(
        (e) => e.submissionId === Number(record.id),
      )) {
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
    statusUrl: row.statusUrl ? String(row.statusUrl) : null,
    manuscriptId: row.manuscriptId ? String(row.manuscriptId) : null,
    lastCheckedAt: row.lastCheckedAt ? Number(row.lastCheckedAt) : null,
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
