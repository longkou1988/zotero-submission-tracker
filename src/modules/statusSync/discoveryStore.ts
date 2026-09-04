import type { SubmissionStatus } from "../../types";
import type { SyncErrorCode } from "./types";
import type {
  DiscoveredSubmissionRecord,
  DiscoveryImportState,
  ResolvedDiscoveryUpsertInput,
  SpringerSourceSystem,
} from "./discoveryTypes";

const TABLE_DISCOVERED = "submissiontrackerDiscoveredSubmissions";

type QueryParams = Array<string | number | null>;

interface DiscoveryDb {
  executeTransaction(callback: () => Promise<void>): Promise<void>;
  queryAsync(sql: string, params?: QueryParams): Promise<unknown>;
}

interface DiscoveryStoreOptions {
  db?: DiscoveryDb;
  now?: () => number;
}

const zoteroDb: DiscoveryDb = {
  async executeTransaction(callback) {
    await Zotero.DB.executeTransaction(callback);
  },
  async queryAsync(sql, params = []) {
    return Zotero.DB.queryAsync(sql, params);
  },
};

export class DiscoveryStore {
  private db: DiscoveryDb;
  private now: () => number;

  constructor(options: DiscoveryStoreOptions = {}) {
    this.db = options.db || zoteroDb;
    this.now = options.now || Date.now;
  }

  async initialize(): Promise<void> {
    await this.db.executeTransaction(async () => {
      await this.db.queryAsync(
        `CREATE TABLE IF NOT EXISTS ${TABLE_DISCOVERED} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          providerFamily TEXT NOT NULL,
          sourceSystem TEXT NOT NULL,
          providerSubmissionId TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          journal TEXT,
          manuscriptId TEXT,
          statusUrl TEXT NOT NULL,
          rawStatus TEXT,
          normalizedStatus TEXT,
          progressStage TEXT,
          detailLabel TEXT,
          submittedDate TEXT,
          revisionDueDate TEXT,
          importState TEXT NOT NULL DEFAULT 'pending',
          linkedSubmissionId INTEGER,
          lastErrorCode TEXT,
          lastErrorMessage TEXT,
          discoveredAt INTEGER NOT NULL,
          lastSeenAt INTEGER NOT NULL,
          lastDetailFetchedAt INTEGER,
          updatedAt INTEGER NOT NULL,
          UNIQUE(providerFamily, providerSubmissionId)
        )`,
      );
      await this.db.queryAsync(
        `CREATE INDEX IF NOT EXISTS ${TABLE_DISCOVERED}_state
         ON ${TABLE_DISCOVERED} (importState, lastSeenAt)`,
      );
      await this.db.queryAsync(
        `CREATE INDEX IF NOT EXISTS ${TABLE_DISCOVERED}_linked
         ON ${TABLE_DISCOVERED} (linkedSubmissionId)`,
      );
    });
  }

  async getByIdentity(
    providerFamily: "springer_nature",
    providerSubmissionId: string,
  ): Promise<DiscoveredSubmissionRecord | undefined> {
    const rows = (await this.db.queryAsync(
      `SELECT * FROM ${TABLE_DISCOVERED}
       WHERE providerFamily = ? AND providerSubmissionId = ?`,
      [providerFamily, providerSubmissionId],
    )) as unknown[];
    return firstMapped(rows);
  }

  async getById(id: number): Promise<DiscoveredSubmissionRecord | undefined> {
    const rows = (await this.db.queryAsync(
      `SELECT * FROM ${TABLE_DISCOVERED} WHERE id = ?`,
      [id],
    )) as unknown[];
    return firstMapped(rows);
  }

  async listByState(
    state: DiscoveryImportState,
  ): Promise<DiscoveredSubmissionRecord[]> {
    const rows = (await this.db.queryAsync(
      `SELECT * FROM ${TABLE_DISCOVERED}
       WHERE importState = ?
       ORDER BY lastSeenAt DESC, id DESC`,
      [state],
    )) as unknown[];
    return (rows || []).map(rowToRecord);
  }

  async upsertResolved(
    input: ResolvedDiscoveryUpsertInput,
  ): Promise<DiscoveredSubmissionRecord> {
    assertResolvedIdentity(input);
    const now = this.now();

    await this.db.queryAsync(
      `INSERT INTO ${TABLE_DISCOVERED} (
         providerFamily, sourceSystem, providerSubmissionId, title, journal,
         manuscriptId, statusUrl, rawStatus, normalizedStatus, progressStage,
         detailLabel, submittedDate, revisionDueDate, lastErrorCode,
         lastErrorMessage, discoveredAt, lastSeenAt, lastDetailFetchedAt,
         updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(providerFamily, providerSubmissionId) DO UPDATE SET
         sourceSystem = excluded.sourceSystem,
         title = excluded.title,
         journal = excluded.journal,
         manuscriptId = excluded.manuscriptId,
         statusUrl = excluded.statusUrl,
         rawStatus = excluded.rawStatus,
         normalizedStatus = excluded.normalizedStatus,
         progressStage = excluded.progressStage,
         detailLabel = excluded.detailLabel,
         submittedDate = excluded.submittedDate,
         revisionDueDate = excluded.revisionDueDate,
         lastErrorCode = NULL,
         lastErrorMessage = NULL,
         lastSeenAt = excluded.lastSeenAt,
         lastDetailFetchedAt = excluded.lastDetailFetchedAt,
         updatedAt = excluded.updatedAt`,
      [
        input.providerFamily,
        input.sourceSystem,
        input.providerSubmissionId,
        input.title,
        input.journal,
        input.manuscriptId,
        input.statusUrl,
        input.rawStatus,
        input.normalizedStatus,
        input.progressStage,
        input.detailLabel,
        input.submittedDate,
        input.revisionDueDate,
        null,
        null,
        now,
        now,
        input.lastDetailFetchedAt,
        now,
      ],
    );

    const stored = await this.getByIdentity(
      input.providerFamily,
      input.providerSubmissionId,
    );
    if (!stored) {
      throw new Error("Failed to persist resolved Springer discovery record");
    }
    return stored;
  }

  async setIgnored(id: number): Promise<void> {
    const now = this.now();
    await this.db.queryAsync(
      `UPDATE ${TABLE_DISCOVERED}
       SET importState = 'ignored', lastErrorCode = NULL,
           lastErrorMessage = NULL, updatedAt = ?
       WHERE id = ? AND importState = 'pending'`,
      [now, id],
    );
  }

  async restorePending(id: number): Promise<void> {
    const now = this.now();
    await this.db.queryAsync(
      `UPDATE ${TABLE_DISCOVERED}
       SET importState = 'pending', lastErrorCode = NULL,
           lastErrorMessage = NULL, updatedAt = ?
       WHERE id = ? AND importState = 'ignored'`,
      [now, id],
    );
  }

  async markImported(
    id: number,
    linkedSubmissionId: number,
  ): Promise<DiscoveredSubmissionRecord> {
    if (!Number.isInteger(linkedSubmissionId) || linkedSubmissionId <= 0) {
      throw new Error("linkedSubmissionId must be a positive integer");
    }

    const current = await this.getById(id);
    if (!current) {
      throw new Error("Discovery record not found");
    }
    if (current.importState === "imported") {
      if (current.linkedSubmissionId === linkedSubmissionId) {
        return current;
      }
      throw new Error("Discovery record is already linked to another submission");
    }
    if (current.importState !== "pending") {
      throw new Error("Only pending discovery records can be imported");
    }

    const now = this.now();
    await this.db.queryAsync(
      `UPDATE ${TABLE_DISCOVERED}
       SET importState = 'imported', linkedSubmissionId = ?,
           lastErrorCode = NULL, lastErrorMessage = NULL, updatedAt = ?
       WHERE id = ? AND importState = 'pending'`,
      [linkedSubmissionId, now, id],
    );

    const stored = await this.getById(id);
    if (!stored || stored.importState !== "imported") {
      throw new Error("Failed to mark discovery record as imported");
    }
    return stored;
  }
}

function assertResolvedIdentity(input: ResolvedDiscoveryUpsertInput): void {
  if (input.providerFamily !== "springer_nature") {
    throw new Error("Discovery record requires the Springer Nature provider family");
  }
  if (!input.providerSubmissionId.trim()) {
    throw new Error("Discovery record requires a resolved Springer submission identity");
  }

  const resolved = parseResolvedStatusUrl(input.statusUrl);
  if (!resolved || resolved !== input.providerSubmissionId) {
    throw new Error("Discovery record requires a resolved Springer submission identity");
  }
}

function parseResolvedStatusUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "submission.springernature.com"
    ) {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      parts.length !== 2 ||
      parts[0] !== "submission-details" ||
      !parts[1].trim()
    ) {
      return null;
    }
    return parts[1];
  } catch {
    return null;
  }
}

function firstMapped(
  rows: unknown[] | null | undefined,
): DiscoveredSubmissionRecord | undefined {
  return rows && rows.length ? rowToRecord(rows[0]) : undefined;
}

function rowToRecord(row: unknown): DiscoveredSubmissionRecord {
  const value = row as Record<string, unknown>;
  return {
    id: Number(value.id),
    providerFamily: "springer_nature",
    sourceSystem: asSourceSystem(value.sourceSystem),
    providerSubmissionId: String(value.providerSubmissionId || ""),
    title: String(value.title || ""),
    journal: nullableString(value.journal),
    manuscriptId: nullableString(value.manuscriptId),
    statusUrl: String(value.statusUrl || ""),
    rawStatus: nullableString(value.rawStatus),
    normalizedStatus: nullableStatus(value.normalizedStatus),
    progressStage: nullableString(value.progressStage),
    detailLabel: nullableString(value.detailLabel),
    submittedDate: nullableString(value.submittedDate),
    revisionDueDate: nullableString(value.revisionDueDate),
    importState: asImportState(value.importState),
    linkedSubmissionId:
      value.linkedSubmissionId == null ? null : Number(value.linkedSubmissionId),
    lastErrorCode: nullableErrorCode(value.lastErrorCode),
    lastErrorMessage: nullableString(value.lastErrorMessage),
    discoveredAt: Number(value.discoveredAt),
    lastSeenAt: Number(value.lastSeenAt),
    lastDetailFetchedAt:
      value.lastDetailFetchedAt == null
        ? null
        : Number(value.lastDetailFetchedAt),
  };
}

function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function nullableStatus(value: unknown): SubmissionStatus | null {
  return value == null || value === "" ? null : (String(value) as SubmissionStatus);
}

function nullableErrorCode(value: unknown): SyncErrorCode | null {
  return value == null || value === "" ? null : (String(value) as SyncErrorCode);
}

function asSourceSystem(value: unknown): SpringerSourceSystem {
  if (value === "snapp" || value === "editorial_manager") {
    return value;
  }
  return "unknown";
}

function asImportState(value: unknown): DiscoveryImportState {
  if (value === "imported" || value === "ignored") {
    return value;
  }
  return "pending";
}

export const discoveryStore = new DiscoveryStore();
