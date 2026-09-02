import type { SubmissionRecord, SubmissionStatus } from "../../types";
import type { SyncStateRecord } from "./syncStore";
import type {
  NormalizationResult,
  ProviderKind,
  ProviderSnapshot,
  SyncAuthState,
  SyncErrorCode,
  SyncHistoryEventType,
} from "./types";

export interface StatusProviderAdapter {
  provider: ProviderKind;
  supports(url: string): boolean;
  fetchSnapshot(submission: SubmissionRecord): Promise<ProviderSnapshot>;
  normalize(rawStatus: string): NormalizationResult;
}

export interface SyncStoreLike {
  getState(
    submissionId: number,
    provider: ProviderKind,
  ): Promise<SyncStateRecord | undefined>;
  ensureState(
    submissionId: number,
    provider: ProviderKind,
    enabled?: boolean,
  ): Promise<SyncStateRecord>;
  recordAttempt(
    submissionId: number,
    provider: ProviderKind,
    update: {
      attemptedAt: number;
      authState?: SyncAuthState;
      errorCode?: SyncErrorCode | null;
      errorMessage?: string | null;
    },
  ): Promise<void>;
  recordSuccess(
    submissionId: number,
    provider: ProviderKind,
    update: {
      snapshot: ProviderSnapshot;
      normalization: NormalizationResult;
      authState?: SyncAuthState;
    },
  ): Promise<SyncStateRecord>;
  appendHistory(record: {
    submissionId: number;
    provider: ProviderKind;
    eventType: SyncHistoryEventType;
    rawStatus: string | null;
    normalizedStatus: SubmissionStatus | null;
    sourceStatusDate: string | null;
    detectedAt: number;
    note: string;
    createdAt?: number;
  }): Promise<void>;
}

export interface EngineDeps {
  getSubmission(id: number): Promise<SubmissionRecord | undefined>;
  addEvent(
    id: number,
    status: SubmissionStatus,
    date: string,
    note?: string,
  ): Promise<void>;
  updateSubmission(
    id: number,
    fields: Partial<Pick<SubmissionRecord, "manuscriptId">>,
  ): Promise<void>;
  store: SyncStoreLike;
  recognizeProvider(statusUrl: string | null): ProviderKind | null;
  getAdapter(provider: ProviderKind): StatusProviderAdapter | null;
  now(): number;
  canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean;
}

export type SyncRunOutcome =
  | "unchanged"
  | "raw_changed"
  | "canonical_changed"
  | "unknown_status"
  | "identity_mismatch"
  | "status_conflict"
  | "auth_required"
  | "error"
  | "missing_submission"
  | "unsupported_provider"
  | "paused";

export interface SyncRunResult {
  outcome: SyncRunOutcome;
  provider: ProviderKind | null;
  rawStatus?: string | null;
  canonicalStatus?: SubmissionStatus | null;
  errorCode?: SyncErrorCode;
}

export class ProviderSyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = "ProviderSyncError";
    this.code = code;
  }
}

export class StatusSyncEngine {
  private readonly deps: EngineDeps;

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  async syncOne(
    submissionId: number,
    options: { force?: boolean } = {},
  ): Promise<SyncRunResult> {
    const submission = await this.deps.getSubmission(submissionId);
    if (!submission) {
      return { outcome: "missing_submission", provider: null };
    }

    const provider = this.deps.recognizeProvider(submission.statusUrl);
    if (!provider || !submission.statusUrl) {
      return { outcome: "unsupported_provider", provider: null };
    }

    const adapter = this.deps.getAdapter(provider);
    if (!adapter || !adapter.supports(submission.statusUrl)) {
      return { outcome: "unsupported_provider", provider };
    }

    const state =
      (await this.deps.store.getState(submissionId, provider)) ??
      (await this.deps.store.ensureState(submissionId, provider));
    if (
      !options.force &&
      (!state.enabled || state.authState === "reauth_required")
    ) {
      return { outcome: "paused", provider };
    }

    const attemptedAt = this.deps.now();
    const previousErrorCode = state.lastErrorCode;
    await this.deps.store.recordAttempt(submissionId, provider, {
      attemptedAt,
      authState: state.authState,
      errorCode: state.lastErrorCode,
      errorMessage: state.lastErrorMessage,
    });

    let snapshot: ProviderSnapshot;
    try {
      snapshot = await adapter.fetchSnapshot(submission);
    } catch (error) {
      return this.handleFetchError(
        submissionId,
        provider,
        state,
        attemptedAt,
        error,
      );
    }

    if (
      submission.manuscriptId &&
      snapshot.manuscriptId &&
      normalizeIdentity(submission.manuscriptId) !==
        normalizeIdentity(snapshot.manuscriptId)
    ) {
      if (previousErrorCode !== "IDENTITY_MISMATCH") {
        await this.appendHistory(
          submissionId,
          provider,
          "IDENTITY_MISMATCH",
          snapshot,
          state.normalizedStatus,
          "Local manuscript ID does not match the provider snapshot.",
        );
      }
      await this.deps.store.recordAttempt(submissionId, provider, {
        attemptedAt: snapshot.detectedAt,
        authState: "connected",
        errorCode: "IDENTITY_MISMATCH",
        errorMessage: "Manuscript identity mismatch",
      });
      return {
        outcome: "identity_mismatch",
        provider,
        rawStatus: snapshot.rawStatus,
        canonicalStatus: submission.currentStatus,
        errorCode: "IDENTITY_MISMATCH",
      };
    }

    if (!submission.manuscriptId && snapshot.manuscriptId) {
      await this.deps.updateSubmission(submissionId, {
        manuscriptId: snapshot.manuscriptId,
      });
    }

    const normalization = adapter.normalize(snapshot.rawStatus);
    if (!normalization.canonicalStatus) {
      await this.deps.store.recordSuccess(submissionId, provider, {
        snapshot,
        normalization,
        authState: "connected",
      });
      if (previousErrorCode !== "UNKNOWN_STATUS") {
        await this.appendHistory(
          submissionId,
          provider,
          "UNKNOWN_STATUS",
          snapshot,
          null,
          `Unrecognized provider status: ${snapshot.rawStatus}`,
        );
      }
      await this.deps.store.recordAttempt(submissionId, provider, {
        attemptedAt: snapshot.detectedAt,
        authState: "connected",
        errorCode: "UNKNOWN_STATUS",
        errorMessage: `Unrecognized provider status: ${snapshot.rawStatus}`,
      });
      return {
        outcome: "unknown_status",
        provider,
        rawStatus: snapshot.rawStatus,
        canonicalStatus: submission.currentStatus,
        errorCode: "UNKNOWN_STATUS",
      };
    }

    const nextStatus = normalization.canonicalStatus;
    if (
      nextStatus !== submission.currentStatus &&
      !this.deps.canTransition(submission.currentStatus, nextStatus)
    ) {
      await this.deps.store.recordSuccess(submissionId, provider, {
        snapshot,
        normalization,
        authState: "connected",
      });
      if (previousErrorCode !== "TRANSITION_CONFLICT") {
        await this.appendHistory(
          submissionId,
          provider,
          "STATUS_CONFLICT",
          snapshot,
          nextStatus,
          `Automatic transition blocked: ${submission.currentStatus} -> ${nextStatus}`,
        );
      }
      await this.deps.store.recordAttempt(submissionId, provider, {
        attemptedAt: snapshot.detectedAt,
        authState: "connected",
        errorCode: "TRANSITION_CONFLICT",
        errorMessage: "Provider status conflicts with the canonical timeline",
      });
      return {
        outcome: "status_conflict",
        provider,
        rawStatus: snapshot.rawStatus,
        canonicalStatus: submission.currentStatus,
        errorCode: "TRANSITION_CONFLICT",
      };
    }

    const rawChanged = state.rawStatus !== snapshot.rawStatus;
    const canonicalChanged = nextStatus !== submission.currentStatus;

    if (canonicalChanged) {
      await this.deps.addEvent(
        submissionId,
        nextStatus,
        trustedEventDate(snapshot),
        `${providerName(provider)} auto-sync`,
      );
    }

    await this.deps.store.recordSuccess(submissionId, provider, {
      snapshot,
      normalization,
      authState: "connected",
    });

    await this.appendRecoveryIfNeeded(
      submissionId,
      provider,
      state,
      snapshot,
      nextStatus,
    );

    if (canonicalChanged) {
      await this.appendHistory(
        submissionId,
        provider,
        "CANONICAL_STATUS_CHANGED",
        snapshot,
        nextStatus,
        `${submission.currentStatus} -> ${nextStatus}`,
      );
      return {
        outcome: "canonical_changed",
        provider,
        rawStatus: snapshot.rawStatus,
        canonicalStatus: nextStatus,
      };
    }

    if (rawChanged) {
      await this.appendHistory(
        submissionId,
        provider,
        "RAW_STATUS_CHANGED",
        snapshot,
        nextStatus,
        `${state.rawStatus ?? "(none)"} -> ${snapshot.rawStatus}`,
      );
      return {
        outcome: "raw_changed",
        provider,
        rawStatus: snapshot.rawStatus,
        canonicalStatus: nextStatus,
      };
    }

    return {
      outcome: "unchanged",
      provider,
      rawStatus: snapshot.rawStatus,
      canonicalStatus: nextStatus,
    };
  }

  private async handleFetchError(
    submissionId: number,
    provider: ProviderKind,
    state: SyncStateRecord,
    attemptedAt: number,
    error: unknown,
  ): Promise<SyncRunResult> {
    const syncError = toProviderSyncError(error);
    const authRequired = syncError.code === "AUTH_REQUIRED";
    const eventType: SyncHistoryEventType = authRequired
      ? "AUTH_REQUIRED"
      : "SYNC_ERROR";
    const authState: SyncAuthState = authRequired
      ? "reauth_required"
      : state.authState;

    if (state.lastErrorCode !== syncError.code) {
      await this.deps.store.appendHistory({
        submissionId,
        provider,
        eventType,
        rawStatus: state.rawStatus,
        normalizedStatus: state.normalizedStatus,
        sourceStatusDate: null,
        detectedAt: attemptedAt,
        note: syncError.message,
      });
    }

    await this.deps.store.recordAttempt(submissionId, provider, {
      attemptedAt,
      authState,
      errorCode: syncError.code,
      errorMessage: syncError.message,
    });

    return {
      outcome: authRequired ? "auth_required" : "error",
      provider,
      rawStatus: state.rawStatus,
      canonicalStatus: state.normalizedStatus,
      errorCode: syncError.code,
    };
  }

  private async appendRecoveryIfNeeded(
    submissionId: number,
    provider: ProviderKind,
    state: SyncStateRecord,
    snapshot: ProviderSnapshot,
    canonicalStatus: SubmissionStatus,
  ): Promise<void> {
    if (!state.lastErrorCode) {
      return;
    }
    const eventType: SyncHistoryEventType =
      state.lastErrorCode === "AUTH_REQUIRED"
        ? "AUTH_RECOVERED"
        : "SYNC_RECOVERED";
    await this.appendHistory(
      submissionId,
      provider,
      eventType,
      snapshot,
      canonicalStatus,
      state.lastErrorCode === "AUTH_REQUIRED"
        ? "Provider session restored."
        : "Provider sync recovered.",
    );
  }

  private async appendHistory(
    submissionId: number,
    provider: ProviderKind,
    eventType: SyncHistoryEventType,
    snapshot: ProviderSnapshot,
    normalizedStatus: SubmissionStatus | null,
    note: string,
  ): Promise<void> {
    await this.deps.store.appendHistory({
      submissionId,
      provider,
      eventType,
      rawStatus: snapshot.rawStatus,
      normalizedStatus,
      sourceStatusDate: snapshot.sourceStatusDate,
      detectedAt: snapshot.detectedAt,
      note,
    });
  }
}

function normalizeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function providerName(provider: ProviderKind): string {
  return provider === "springer_nature" ? "Springer Nature" : provider;
}

function trustedEventDate(snapshot: ProviderSnapshot): string {
  if (isTrustedIsoDate(snapshot.sourceStatusDate)) {
    return snapshot.sourceStatusDate;
  }
  return new Date(snapshot.detectedAt).toISOString().slice(0, 10);
}

function isTrustedIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toProviderSyncError(error: unknown): ProviderSyncError {
  if (error instanceof ProviderSyncError) {
    return error;
  }
  if (error instanceof Error) {
    return new ProviderSyncError("SERVER_ERROR", error.message);
  }
  return new ProviderSyncError("SERVER_ERROR", String(error));
}
