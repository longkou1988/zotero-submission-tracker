import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const source = readFileSync(
  new URL("../src/modules/statusSync/syncStore.ts", import.meta.url),
  "utf8",
);
const hooks = readFileSync(
  new URL("../src/hooks.ts", import.meta.url),
  "utf8",
);

test("sync persistence uses additive idempotent tables", () => {
  assert.match(source, /submissiontrackerSyncState/);
  assert.match(source, /submissiontrackerSyncHistory/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS/);
  assert.match(source, /PRIMARY KEY\s*\(submissionId, provider\)/);
});

test("sync state stores provider status without reusing lastCheckedAt", () => {
  for (const field of [
    "submissionId",
    "provider",
    "enabled",
    "rawStatus",
    "normalizedStatus",
    "confidence",
    "authState",
    "lastAttemptAt",
    "lastSuccessAt",
    "lastRawChangeAt",
    "lastErrorCode",
    "lastErrorMessage",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(source, /lastCheckedAt/);
});

test("sync history stores only provider observation metadata", () => {
  for (const field of [
    "eventType",
    "rawStatus",
    "normalizedStatus",
    "sourceStatusDate",
    "detectedAt",
    "note",
    "createdAt",
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`));
  }
});

test("startup initializes sync persistence after the canonical database", () => {
  assert.match(
    hooks,
    /import\s*\{\s*syncStore\s*\}\s*from\s*["']\.\/modules\/statusSync\/syncStore["']/,
  );
  const canonicalInit = hooks.indexOf("await db.initialize();");
  const syncInit = hooks.indexOf("await syncStore.initialize();");
  assert.ok(canonicalInit >= 0, "canonical database initialization must exist");
  assert.ok(syncInit > canonicalInit, "sync store must initialize after canonical DB");
});
