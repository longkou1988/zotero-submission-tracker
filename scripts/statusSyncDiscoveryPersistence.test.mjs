import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { DiscoveryStore } from "../src/modules/statusSync/discoveryStore.ts";

function createFakeDb() {
  const rows = [];
  let nextId = 1;

  function clone(row) {
    return row ? { ...row } : row;
  }

  return {
    rows,
    async executeTransaction(fn) {
      await fn();
    },
    async queryAsync(sql, params = []) {
      const compact = sql.replace(/\s+/g, " ").trim();
      if (/^(CREATE TABLE|CREATE INDEX)/.test(compact)) return [];

      if (compact.startsWith("SELECT * FROM submissiontrackerDiscoveredSubmissions WHERE providerFamily = ? AND providerSubmissionId = ?")) {
        return rows
          .filter(
            (row) =>
              row.providerFamily === params[0] &&
              row.providerSubmissionId === params[1],
          )
          .map(clone);
      }

      if (compact.startsWith("SELECT * FROM submissiontrackerDiscoveredSubmissions WHERE id = ?")) {
        return rows.filter((row) => row.id === Number(params[0])).map(clone);
      }

      if (compact.startsWith("SELECT * FROM submissiontrackerDiscoveredSubmissions WHERE importState = ?")) {
        return rows
          .filter((row) => row.importState === params[0])
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt || b.id - a.id)
          .map(clone);
      }

      if (compact.startsWith("INSERT INTO submissiontrackerDiscoveredSubmissions")) {
        const [
          providerFamily,
          sourceSystem,
          providerSubmissionId,
          title,
          journal,
          manuscriptId,
          statusUrl,
          rawStatus,
          normalizedStatus,
          progressStage,
          detailLabel,
          submittedDate,
          revisionDueDate,
          lastErrorCode,
          lastErrorMessage,
          discoveredAt,
          lastSeenAt,
          lastDetailFetchedAt,
        ] = params;
        const existing = rows.find(
          (row) =>
            row.providerFamily === providerFamily &&
            row.providerSubmissionId === providerSubmissionId,
        );
        if (existing) {
          Object.assign(existing, {
            sourceSystem,
            title,
            journal,
            manuscriptId,
            statusUrl,
            rawStatus,
            normalizedStatus,
            progressStage,
            detailLabel,
            submittedDate,
            revisionDueDate,
            lastErrorCode,
            lastErrorMessage,
            lastSeenAt,
            lastDetailFetchedAt,
          });
        } else {
          rows.push({
            id: nextId++,
            providerFamily,
            sourceSystem,
            providerSubmissionId,
            title,
            journal,
            manuscriptId,
            statusUrl,
            rawStatus,
            normalizedStatus,
            progressStage,
            detailLabel,
            submittedDate,
            revisionDueDate,
            importState: "pending",
            linkedSubmissionId: null,
            lastErrorCode,
            lastErrorMessage,
            discoveredAt,
            lastSeenAt,
            lastDetailFetchedAt,
          });
        }
        return [];
      }

      if (compact.includes("SET importState = 'ignored'")) {
        const row = rows.find((item) => item.id === Number(params[1]));
        if (row && row.importState === "pending") {
          row.importState = "ignored";
          row.lastErrorCode = null;
          row.lastErrorMessage = null;
        }
        return [];
      }

      if (compact.includes("SET importState = 'pending'")) {
        const row = rows.find((item) => item.id === Number(params[1]));
        if (row && row.importState === "ignored") {
          row.importState = "pending";
          row.lastErrorCode = null;
          row.lastErrorMessage = null;
        }
        return [];
      }

      if (compact.includes("SET importState = 'imported'")) {
        const row = rows.find((item) => item.id === Number(params[2]));
        if (row) {
          row.importState = "imported";
          row.linkedSubmissionId = Number(params[0]);
          row.lastErrorCode = null;
          row.lastErrorMessage = null;
        }
        return [];
      }

      throw new Error(`Unhandled SQL in fake DB: ${compact}`);
    },
  };
}

function makeInput(overrides = {}) {
  return {
    providerFamily: "springer_nature",
    sourceSystem: "snapp",
    providerSubmissionId: "example-id",
    title: "Synthetic Manuscript",
    journal: "Synthetic Journal",
    manuscriptId: null,
    statusUrl:
      "https://submission.springernature.com/submission-details/example-id",
    rawStatus: "Under review",
    normalizedStatus: "under_review",
    progressStage: "Peer review",
    detailLabel: null,
    submittedDate: "2026-06-15",
    revisionDueDate: null,
    lastDetailFetchedAt: 1000,
    ...overrides,
  };
}

test("discovery store creates one pending row and refreshes provider metadata in place", async () => {
  const db = createFakeDb();
  let now = 100;
  const store = new DiscoveryStore({ db, now: () => now });
  await store.initialize();

  const created = await store.upsertResolved(makeInput());
  assert.equal(created.importState, "pending");
  assert.equal(created.linkedSubmissionId, null);
  assert.equal(created.discoveredAt, 100);
  assert.equal(created.lastSeenAt, 100);

  now = 200;
  const refreshed = await store.upsertResolved(
    makeInput({ rawStatus: "Action needed", detailLabel: "Revision requested" }),
  );
  assert.equal(refreshed.id, created.id);
  assert.equal(refreshed.rawStatus, "Action needed");
  assert.equal(refreshed.detailLabel, "Revision requested");
  assert.equal(refreshed.discoveredAt, 100);
  assert.equal(refreshed.lastSeenAt, 200);
  assert.equal(db.rows.length, 1);
});

test("ignored discovery remains ignored across rescans and can be restored manually", async () => {
  const db = createFakeDb();
  let now = 100;
  const store = new DiscoveryStore({ db, now: () => now });
  await store.initialize();
  const created = await store.upsertResolved(makeInput());

  await store.setIgnored(created.id);
  assert.equal((await store.getById(created.id)).importState, "ignored");

  now = 200;
  const rescanned = await store.upsertResolved(
    makeInput({ rawStatus: "Action needed" }),
  );
  assert.equal(rescanned.importState, "ignored");
  assert.equal(rescanned.lastSeenAt, 200);

  await store.restorePending(created.id);
  assert.equal((await store.getById(created.id)).importState, "pending");
});

test("imported discovery preserves its formal submission mapping across rescans", async () => {
  const db = createFakeDb();
  let now = 100;
  const store = new DiscoveryStore({ db, now: () => now });
  await store.initialize();
  const created = await store.upsertResolved(makeInput());

  await store.markImported(created.id, 42);
  assert.equal((await store.getById(created.id)).importState, "imported");
  assert.equal((await store.getById(created.id)).linkedSubmissionId, 42);

  now = 300;
  const rescanned = await store.upsertResolved(
    makeInput({ rawStatus: "Accepted", normalizedStatus: "accepted" }),
  );
  assert.equal(rescanned.importState, "imported");
  assert.equal(rescanned.linkedSubmissionId, 42);
  assert.equal(rescanned.rawStatus, "Accepted");
  assert.equal(rescanned.lastSeenAt, 300);

  await assert.rejects(store.markImported(created.id, 43), /already linked/i);
  await store.setIgnored(created.id);
  assert.equal((await store.getById(created.id)).importState, "imported");
});

test("markImported rejects invalid formal submission ids", async () => {
  const db = createFakeDb();
  const store = new DiscoveryStore({ db, now: () => 100 });
  await store.initialize();
  const created = await store.upsertResolved(makeInput());

  await assert.rejects(store.markImported(created.id, 0), /positive integer/i);
  await assert.rejects(store.markImported(created.id, -1), /positive integer/i);
});

test("generic Editorial Manager landing URL can never become a durable staged identity", async () => {
  const db = createFakeDb();
  const store = new DiscoveryStore({ db, now: () => 100 });
  await store.initialize();

  await assert.rejects(
    store.upsertResolved(
      makeInput({
        sourceSystem: "editorial_manager",
        providerSubmissionId: "cups",
        statusUrl: "https://www2.cloud.editorialmanager.com/cups/default2.aspx",
      }),
    ),
    /resolved Springer submission identity/i,
  );
  assert.equal(db.rows.length, 0);
});

test("discovery persistence schema is additive and identity-unique", () => {
  const source = readFileSync(
    new URL("../src/modules/statusSync/discoveryStore.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /CREATE TABLE IF NOT EXISTS\s+submissiontrackerDiscoveredSubmissions/);
  assert.match(source, /UNIQUE\s*\(providerFamily, providerSubmissionId\)/);
  for (const field of [
    "providerFamily",
    "sourceSystem",
    "providerSubmissionId",
    "title",
    "journal",
    "manuscriptId",
    "statusUrl",
    "rawStatus",
    "normalizedStatus",
    "progressStage",
    "detailLabel",
    "submittedDate",
    "revisionDueDate",
    "importState",
    "linkedSubmissionId",
    "lastErrorCode",
    "lastErrorMessage",
    "discoveredAt",
    "lastSeenAt",
    "lastDetailFetchedAt",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
});
