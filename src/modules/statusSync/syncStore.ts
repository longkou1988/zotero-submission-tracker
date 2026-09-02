import type { SubmissionStatus } from "../../types";
import type {
  NormalizationResult,
  ProviderKind,
  ProviderSnapshot,
  SyncAuthState,
  SyncConfidence,
  SyncErrorCode,
  SyncHistoryEventType,
} from "./types";

const TABLE_SYNC_STATE = "submissiontrackerSyncState";
const TABLE_SYNC_HISTORY = "submissiontrackerSyncHistory";

export interface SyncStateRecord {
  submissionId: number;
  provider: ProviderKind;
  enabled: boolean;
  rawStatus: string | null;
  normalizedStatus: SubmissionStatus | null;
  confidence: SyncConfidence | null;
  authState: SyncAuthState;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastRawChangeAt: number | null;
  lastErrorCode: SyncErrorCode | null;
  lastErrorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SyncHistoryRecord {
  id: number;
  submissionId: number;
  provider: ProviderKind;
  eventType: SyncHistoryEventType;
  rawStatus: string | null;
  normalizedStatus: SubmissionStatus | null;
  sourceStatusDate: string | null;
  detectedAt: number;
  note: string;
  createdAt: number;
}

export interface SyncAttemptUpdate {
  attemptedAt: number;
  authState?: SyncAuthState;
  errorCode?: SyncErrorCode | null;
  errorMessage?: string | null;
}

export interface SyncSuccessUpdate {
  snapshot: ProviderSnapshot;
  normalization: NormalizationResult;
  authState?: SyncAuthState;
}

export type NewSyncHistoryRecord = Omit<
  SyncHistoryRecord,
  "id" | "createdAt"
> & {
  createdAt?: number;
};

export class SyncStore {
  async initialize(): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      await Zotero.DB.queryAsync(
        `CREATE TABLE IF NOT EXISTS ${TABLE_SYNC_STATE} (
          submissionId INTEGER NOT NULL,
          provider TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          rawStatus TEXT,
          normalizedStatus TEXT,
          confidence TEXT,
          authState TEXT NOT NULL DEFAULT 'unknown',
          lastAttemptAt INTEGER,
          lastSuccessAt INTEGER,
          lastRawChangeAt INTEGER,
          lastErrorCode TEXT,
          lastErrorMessage TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          PRIMARY KEY (submissionId, provider)
        )`,
      );
      await Zotero.DB.queryAsync(
        `CREATE INDEX IF NOT EXISTS ${TABLE_SYNC_STATE}_eligibility
         ON ${TABLE_SYNC_STATE} (provider, enabled, authState, lastAttemptAt)`,
      );
      await Zotero.DB.queryAsync(
        `CREATE TABLE IF NOT EXISTS ${TABLE_SYNC_HISTORY} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          submissionId INTEGER NOT NULL,
          provider TEXT NOT NULL,
          eventType TEXT NOT NULL,
          rawStatus TEXT,
          normalizedStatus TEXT,
          sourceStatusDate TEXT,
          detectedAt INTEGER NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          createdAt INTEGER NOT NULL
        )`,
      );
      await Zotero.DB.queryAsync(
        `CREATE INDEX IF NOT EXISTS ${TABLE_SYNC_HISTORY}_submission_detected
         ON ${TABLE_SYNC_HISTORY} (submissionId, detectedAt)`,
      );
    });
  }

  async getState(
    submissionId: number,
    provider: ProviderKind,
  ): Promise<SyncStateRecord | undefined> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT * FROM ${TABLE_SYNC_STATE}
       WHERE submissionId = ? AND provider = ?`,
      [submissionId, provider],
    )) as any[];
    return rows && rows.length ? rowToState(rows[0]) : undefined;
  }

  async ensureState(
    submissionId: number,
    provider: ProviderKind,
    enabled = true,
  ): Promise<SyncStateRecord> {
    const now = Date.now();
    await Zotero.DB.queryAsync(
      `INSERT OR IGNORE INTO ${TABLE_SYNC_STATE}
       (submissionId, provider, enabled, authState, createdAt, updatedAt)
       VALUES (?, ?, ?, 'unknown', ?, ?)`,
      [submissionId, provider, enabled ? 1 : 0, now, now],
    );
    return (await this.getState(submissionId, provider))!;
  }

  async setEnabled(
    submissionId: number,
    provider: ProviderKind,
    enabled: boolean,
  ): Promise<void> {
    await this.ensureState(submissionId, provider, enabled);
    await Zotero.DB.queryAsync(
      `UPDATE ${TABLE_SYNC_STATE}
       SET enabled = ?, updatedAt = ?
       WHERE submissionId = ? AND provider = ?`,
      [enabled ? 1 : 0, Date.now(), submissionId, provider],
    );
  }

  async recordAttempt(
    submissionId: number,
    provider: ProviderKind,
    update: SyncAttemptUpdate,
  ): Promise<void> {
    await this.ensureState(submissionId, provider);
    const current = await this.getState(submissionId, provider);
    await Zotero.DB.queryAsync(
      `UPDATE ${TABLE_SYNC_STATE}
       SET authState = ?,
           lastAttemptAt = ?,
           lastErrorCode = ?,
           lastErrorMessage = ?,
           updatedAt = ?
       WHERE submissionId = ? AND provider = ?`,
      [
        update.authState ?? current?.authState ?? "unknown",
        update.attemptedAt,
        update.errorCode ?? null,
        update.errorMessage ?? null,
        Date.now(),
        submissionId,
        provider,
      ],
    );
  }

  async recordSuccess(
    submissionId: number,
    provider: ProviderKind,
    update: SyncSuccessUpdate,
  ): Promise<SyncStateRecord> {
    const current = await this.ensureState(submissionId, provider);
    const rawChanged = current.rawStatus !== update.snapshot.rawStatus;
    const detectedAt = update.snapshot.detectedAt;
    await Zotero.DB.queryAsync(
      `UPDATE ${TABLE_SYNC_STATE}
       SET rawStatus = ?,
           normalizedStatus = ?,
           confidence = ?,
           authState = ?,
           lastAttemptAt = ?,
           lastSuccessAt = ?,
           lastRawChangeAt = ?,
           lastErrorCode = NULL,
           lastErrorMessage = NULL,
           updatedAt = ?
       WHERE submissionId = ? AND provider = ?`,
      [
        update.snapshot.rawStatus,
        update.normalization.canonicalStatus,
        update.normalization.confidence,
        update.authState ?? "connected",
        detectedAt,
        detectedAt,
        rawChanged ? detectedAt : current.lastRawChangeAt,
        Date.now(),
        submissionId,
        provider,
      ],
    );
    return (await this.getState(submissionId, provider))!;
  }

  async appendHistory(record: NewSyncHistoryRecord): Promise<void> {
    await Zotero.DB.queryAsync(
      `INSERT INTO ${TABLE_SYNC_HISTORY}
       (submissionId, provider, eventType, rawStatus, normalizedStatus,
        sourceStatusDate, detectedAt, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.submissionId,
        record.provider,
        record.eventType,
        record.rawStatus,
        record.normalizedStatus,
        record.sourceStatusDate,
        record.detectedAt,
        record.note || "",
        record.createdAt ?? Date.now(),
      ],
    );
  }

  async listEligibleSpringerSubmissionIds(): Promise<number[]> {
    const rows = (await Zotero.DB.queryAsync(
      `SELECT submissionId FROM ${TABLE_SYNC_STATE}
       WHERE provider = 'springer_nature'
         AND enabled = 1
         AND authState != 'reauth_required'
       ORDER BY COALESCE(lastAttemptAt, 0) ASC, submissionId ASC`,
    )) as any[];
    return (rows || []).map((row) => Number(row.submissionId));
  }
}

function rowToState(row: any): SyncStateRecord {
  return {
    submissionId: Number(row.submissionId),
    provider: String(row.provider) as ProviderKind,
    enabled: Number(row.enabled) === 1,
    rawStatus: row.rawStatus ? String(row.rawStatus) : null,
    normalizedStatus: row.normalizedStatus
      ? (String(row.normalizedStatus) as SubmissionStatus)
      : null,
    confidence: row.confidence
      ? (String(row.confidence) as SyncConfidence)
      : null,
    authState: String(row.authState || "unknown") as SyncAuthState,
    lastAttemptAt:
      row.lastAttemptAt == null ? null : Number(row.lastAttemptAt),
    lastSuccessAt:
      row.lastSuccessAt == null ? null : Number(row.lastSuccessAt),
    lastRawChangeAt:
      row.lastRawChangeAt == null ? null : Number(row.lastRawChangeAt),
    lastErrorCode: row.lastErrorCode
      ? (String(row.lastErrorCode) as SyncErrorCode)
      : null,
    lastErrorMessage: row.lastErrorMessage
      ? String(row.lastErrorMessage)
      : null,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export const syncStore = new SyncStore();
