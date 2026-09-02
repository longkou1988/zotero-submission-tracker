import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderSyncError,
  StatusSyncEngine,
} from "../src/modules/statusSync/engine.ts";

const NOW = Date.parse("2026-09-02T12:00:00Z");

function makeSubmission(overrides = {}) {
  return {
    id: 7,
    libraryID: 1,
    itemKey: "ITEMKEY",
    journal: "Example Journal",
    currentStatus: "under_review",
    followUpDate: null,
    notes: "",
    statusUrl:
      "https://submission.springernature.com/submission-details/example-id",
    manuscriptId: "SN-2026-001",
    lastCheckedAt: null,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 86_400_000,
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    submissionId: 7,
    provider: "springer_nature",
    enabled: true,
    rawStatus: "Under Review",
    normalizedStatus: "under_review",
    confidence: "high",
    authState: "connected",
    lastAttemptAt: NOW - 21_600_000,
    lastSuccessAt: NOW - 21_600_000,
    lastRawChangeAt: NOW - 21_600_000,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 21_600_000,
    ...overrides,
  };
}

function makeSnapshot(overrides = {}) {
  return {
    provider: "springer_nature",
    rawStatus: "Under Review",
    sourceStatusDate: "2026-09-02",
    manuscriptId: "SN-2026-001",
    articleTitle: null,
    journal: "Example Journal",
    detectedAt: NOW,
    ...overrides,
  };
}

function buildHarness({
  submission = makeSubmission(),
  state = makeState(),
  snapshot = makeSnapshot(),
  normalize = () => ({
    canonicalStatus: "under_review",
    confidence: "high",
    detailLabel: null,
  }),
  fetchSnapshot,
  supports = () => true,
  provider = "springer_nature",
} = {}) {
  const calls = {
    addEvent: [],
    updateSubmission: [],
    recordAttempt: [],
    recordSuccess: [],
    history: [],
  };
  let mutableState = { ...state };

  const store = {
    async getState() {
      return mutableState;
    },
    async ensureState() {
      return mutableState;
    },
    async recordAttempt(submissionId, requestedProvider, update) {
      calls.recordAttempt.push({ submissionId, provider: requestedProvider, update });
      mutableState = {
        ...mutableState,
        authState: update.authState ?? mutableState.authState,
        lastAttemptAt: update.attemptedAt,
        lastErrorCode: update.errorCode ?? null,
        lastErrorMessage: update.errorMessage ?? null,
      };
    },
    async recordSuccess(submissionId, requestedProvider, update) {
      calls.recordSuccess.push({ submissionId, provider: requestedProvider, update });
      mutableState = {
        ...mutableState,
        rawStatus: update.snapshot.rawStatus,
        normalizedStatus: update.normalization.canonicalStatus,
        confidence: update.normalization.confidence,
        authState: update.authState ?? "connected",
        lastAttemptAt: update.snapshot.detectedAt,
        lastSuccessAt: update.snapshot.detectedAt,
        lastRawChangeAt:
          mutableState.rawStatus === update.snapshot.rawStatus
            ? mutableState.lastRawChangeAt
            : update.snapshot.detectedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
      };
      return mutableState;
    },
    async appendHistory(entry) {
      calls.history.push(entry);
    },
  };

  const adapter = {
    provider,
    supports,
    fetchSnapshot:
      fetchSnapshot ??
      (async () => {
        return snapshot;
      }),
    normalize,
  };

  const engine = new StatusSyncEngine({
    async getSubmission(id) {
      return id === submission.id ? submission : undefined;
    },
    async addEvent(id, status, date, note) {
      calls.addEvent.push({ id, status, date, note });
    },
    async updateSubmission(id, fields) {
      calls.updateSubmission.push({ id, fields });
    },
    store,
    recognizeProvider() {
      return provider;
    },
    getAdapter(requestedProvider) {
      return requestedProvider === provider ? adapter : null;
    },
    now() {
      return NOW;
    },
    canTransition(from, to) {
      if (["accepted", "rejected", "withdrawn"].includes(from)) {
        return from === to;
      }
      return true;
    },
  });

  return { engine, calls, store };
}

test("unchanged provider state updates success metadata without history", async () => {
  const { engine, calls } = buildHarness();

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "unchanged");
  assert.equal(calls.recordSuccess.length, 1);
  assert.deepEqual(calls.history, []);
  assert.deepEqual(calls.addEvent, []);
});

test("raw status change within the same canonical state records raw history only", async () => {
  const { engine, calls } = buildHarness({
    state: makeState({ rawStatus: "Reviewer Assigned" }),
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "raw_changed");
  assert.deepEqual(calls.addEvent, []);
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["RAW_STATUS_CHANGED"],
  );
});

test("legal canonical change appends exactly one canonical event", async () => {
  const { engine, calls } = buildHarness({
    snapshot: makeSnapshot({
      rawStatus: "Major Revision",
      sourceStatusDate: "2026-09-01",
    }),
    normalize: () => ({
      canonicalStatus: "major_revision",
      confidence: "high",
      detailLabel: null,
    }),
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "canonical_changed");
  assert.deepEqual(calls.addEvent, [
    {
      id: 7,
      status: "major_revision",
      date: "2026-09-01",
      note: "Springer Nature auto-sync",
    },
  ]);
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["CANONICAL_STATUS_CHANGED"],
  );
});

test("unknown provider status never changes the canonical timeline", async () => {
  const { engine, calls } = buildHarness({
    snapshot: makeSnapshot({ rawStatus: "Quality Check 2" }),
    normalize: () => ({
      canonicalStatus: null,
      confidence: "unknown",
      detailLabel: "Quality Check 2",
    }),
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "unknown_status");
  assert.equal(result.errorCode, "UNKNOWN_STATUS");
  assert.deepEqual(calls.addEvent, []);
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["UNKNOWN_STATUS"],
  );
});

test("manuscript identity mismatch blocks canonical changes", async () => {
  const { engine, calls } = buildHarness({
    snapshot: makeSnapshot({
      rawStatus: "Major Revision",
      manuscriptId: "SN-2026-999",
    }),
    normalize: () => ({
      canonicalStatus: "major_revision",
      confidence: "high",
      detailLabel: null,
    }),
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "identity_mismatch");
  assert.equal(result.errorCode, "IDENTITY_MISMATCH");
  assert.deepEqual(calls.addEvent, []);
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["IDENTITY_MISMATCH"],
  );
});

test("missing local manuscript ID is filled once from a trusted snapshot", async () => {
  const { engine, calls } = buildHarness({
    submission: makeSubmission({ manuscriptId: null }),
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "unchanged");
  assert.deepEqual(calls.updateSubmission, [
    { id: 7, fields: { manuscriptId: "SN-2026-001" } },
  ]);
});

test("terminal canonical state cannot be overwritten by the provider", async () => {
  const { engine, calls } = buildHarness({
    submission: makeSubmission({ currentStatus: "accepted" }),
    state: makeState({ normalizedStatus: "accepted" }),
    snapshot: makeSnapshot({ rawStatus: "Under Review" }),
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "status_conflict");
  assert.equal(result.errorCode, "TRANSITION_CONFLICT");
  assert.deepEqual(calls.addEvent, []);
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["STATUS_CONFLICT"],
  );
});

test("adapter auth failure pauses automatic sync without changing status", async () => {
  const { engine, calls } = buildHarness({
    fetchSnapshot: async () => {
      throw new ProviderSyncError("AUTH_REQUIRED", "Sign in required");
    },
  });

  const result = await engine.syncOne(7);

  assert.equal(result.outcome, "auth_required");
  assert.equal(result.errorCode, "AUTH_REQUIRED");
  assert.deepEqual(calls.addEvent, []);
  assert.equal(calls.recordAttempt.at(-1).update.authState, "reauth_required");
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["AUTH_REQUIRED"],
  );
});

test("repeated unchanged auth failure does not duplicate history", async () => {
  const { engine, calls } = buildHarness({
    state: makeState({
      authState: "reauth_required",
      lastErrorCode: "AUTH_REQUIRED",
      lastErrorMessage: "Sign in required",
    }),
    fetchSnapshot: async () => {
      throw new ProviderSyncError("AUTH_REQUIRED", "Sign in required");
    },
  });

  const result = await engine.syncOne(7, { force: true });

  assert.equal(result.outcome, "auth_required");
  assert.deepEqual(calls.history, []);
});

test("successful sync after auth failure records one recovery event", async () => {
  const { engine, calls } = buildHarness({
    state: makeState({
      authState: "reauth_required",
      lastErrorCode: "AUTH_REQUIRED",
      lastErrorMessage: "Sign in required",
    }),
  });

  const result = await engine.syncOne(7, { force: true });

  assert.equal(result.outcome, "unchanged");
  assert.deepEqual(
    calls.history.map((entry) => entry.eventType),
    ["AUTH_RECOVERED"],
  );
});
