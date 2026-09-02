# Springer Nature Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe automatic status synchronization for Springer Nature submission-details URLs while Zotero is open, preserving raw provider status, updating the existing canonical timeline only on validated status changes, and never storing Springer credentials.

**Architecture:** Add a focused `src/modules/statusSync/` subsystem with pure provider recognition/rules, a sync store, an adapter-driven engine, scheduling, session isolation, and a Springer Nature adapter. Existing `SubmissionRecord`/`StatusEvent` remain authoritative for canonical state; new sync tables hold provider state/history. UI integrations call the sync subsystem asynchronously and never block current local Dashboard/Analytics rendering.

**Tech Stack:** TypeScript 5.9, Zotero Plugin Toolkit, Zotero DB/HTTP/browser APIs, Node `node:test`, Fluent localization, existing CSS/XUL/HTML UI helpers.

**Spec:** `docs/superpowers/specs/2026-09-02-springer-nature-auto-sync-design.md`

## Global Constraints

- Keep `package.json` at version `0.6.1` during feature development; do not bump, tag, merge, or release without explicit user authorization.
- Work only on `feature/v0.7.0-springer-auto-sync` until review.
- Support Zotero 7, 8, 9, and 10.
- Never persist Springer password, OTP/MFA code, plaintext auth cookie, copied access token, or full private submission HTML.
- Do not add Gmail/email ingestion, cloud backend, AI status guessing, CAPTCHA bypass, MFA bypass, or background work while Zotero is closed.
- Recognize Springer automatically only for HTTPS URLs whose hostname is exactly `submission.springernature.com` and whose path begins `/submission-details/` with a non-empty identifier.
- Automatic sync interval is fixed at 6 hours; startup delay is 45 seconds; dashboard freshness guard is 10 minutes.
- `lastCheckedAt` keeps its existing meaning: user-opened status page time. Auto-sync uses new timestamps.
- `accepted`, `rejected`, and `withdrawn` are protected terminal states for automatic sync.
- Revision loops such as `major_revision -> under_review` and `minor_revision -> under_review` are legal.
- Unknown provider wording, identity mismatch, auth failure, parse failure, access failure, server failure, or transition conflict must never change `SubmissionRecord.currentStatus`.
- Do not fabricate unseen intermediate status events or dates.
- Use TDD for deterministic logic: RED test, minimal implementation, GREEN test, then commit.
- Before claiming completion, run fresh `npm run test:unit`, `npm run lint:check`, and `npm run build` and inspect all results.

---

## File Map

New focused files:

- `src/modules/statusSync/types.ts` — provider/sync types and error/result contracts.
- `src/modules/statusSync/providerRegistry.ts` — URL provider recognition.
- `src/modules/statusSync/normalizer.ts` — generic exact-string normalization using provider-owned maps.
- `src/modules/statusSync/transitionValidator.ts` — canonical state-machine validation.
- `src/modules/statusSync/syncStore.ts` — additive sync tables and CRUD/history persistence.
- `src/modules/statusSync/engine.ts` — provider-neutral orchestration and canonical update decision logic.
- `src/modules/statusSync/schedule.ts` — pure due/freshness calculations.
- `src/modules/statusSync/scheduler.ts` — Zotero runtime timers, sequential queue, single-flight protection.
- `src/modules/statusSync/sessionManager.ts` — version-isolated Springer browser/request session contract.
- `src/modules/statusSync/springerNatureAdapter.ts` — Springer fetch/parse/auth/identity adapter.
- `src/modules/statusSync/springerProbe.ts` — development-only redacted structure probe.
- `src/modules/statusSync/runtime.ts` — singleton wiring for store, adapter, engine, scheduler and UI-facing functions.

New tests/fixtures:

- `scripts/statusSyncProvider.test.mjs`
- `scripts/statusSyncRules.test.mjs`
- `scripts/statusSyncSchedule.test.mjs`
- `scripts/statusSyncEngine.test.mjs`
- `scripts/statusSyncPersistence.test.mjs`
- `scripts/springerNatureAdapter.test.mjs`
- `scripts/statusSyncUiContract.test.mjs`
- `scripts/fixtures/springer-nature/` — only redacted, minimal observed fixture data.

Existing files expected to change:

- `src/hooks.ts`
- `src/db.ts` only if a small bridge is needed for canonical event updates; keep sync-table code in `syncStore.ts`.
- `src/modules/dashboard.ts`
- `src/modules/analyticsDashboard.ts`
- `src/modules/dialog.ts`
- `src/modules/statusPage.ts` only where reconnect/session browser reuse requires it.
- `addon/content/dashboard.css`
- `addon/content/dialog.css`
- `addon/content/preferences.xhtml`
- `addon/prefs.js`
- `addon/locale/en-US/mainWindow.ftl`
- `addon/locale/zh-CN/mainWindow.ftl`
- `addon/locale/en-US/preferences.ftl`
- `addon/locale/zh-CN/preferences.ftl`
- `typings/prefs.d.ts`
- `README.md` only after the feature is functionally verified; do not present v0.7.0 as released.

---

### Task 1: Provider contracts and Springer URL recognition

**Files:**
- Create: `src/modules/statusSync/types.ts`
- Create: `src/modules/statusSync/providerRegistry.ts`
- Test: `scripts/statusSyncProvider.test.mjs`

**Interfaces:**
- Produces:
  - `type ProviderKind = "springer_nature"`
  - `interface ProviderSnapshot`
  - `interface NormalizationResult`
  - `type SyncErrorCode`
  - `type SyncAuthState`
  - `type SyncHistoryEventType`
  - `function recognizeProvider(statusUrl: string | null): ProviderKind | null`
  - `function isSpringerNatureSubmissionUrl(statusUrl: string | null): boolean`

- [ ] **Step 1: Write the failing provider-recognition tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  isSpringerNatureSubmissionUrl,
  recognizeProvider,
} from "../src/modules/statusSync/providerRegistry.ts";

test("recognizes an HTTPS Springer Nature submission-details URL", () => {
  const url = "https://submission.springernature.com/submission-details/8622dda6-8179-49d7-9ad9-bbda50fb382b";
  assert.equal(isSpringerNatureSubmissionUrl(url), true);
  assert.equal(recognizeProvider(url), "springer_nature");
});

test("rejects wrong host, HTTP, empty identifier and deceptive suffix", () => {
  const bad = [
    "http://submission.springernature.com/submission-details/abc",
    "https://example.com/submission-details/abc",
    "https://submission.springernature.com/submission-details/",
    "https://submission.springernature.com.evil.example/submission-details/abc",
  ];
  for (const url of bad) assert.equal(recognizeProvider(url), null);
});

test("null and malformed URLs are unsupported", () => {
  assert.equal(recognizeProvider(null), null);
  assert.equal(recognizeProvider("not a url"), null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/statusSyncProvider.test.mjs`

Expected: FAIL because `providerRegistry.ts` does not exist.

- [ ] **Step 3: Add the shared types and strict URL recognizer**

Core implementation contract:

```ts
export type ProviderKind = "springer_nature";

export interface ProviderSnapshot {
  provider: ProviderKind;
  rawStatus: string;
  sourceStatusDate: string | null;
  manuscriptId: string | null;
  articleTitle: string | null;
  journal: string | null;
  detectedAt: number;
}

export function isSpringerNatureSubmissionUrl(statusUrl: string | null): boolean {
  if (!statusUrl) return false;
  try {
    const url = new URL(statusUrl);
    if (url.protocol !== "https:") return false;
    if (url.hostname !== "submission.springernature.com") return false;
    const prefix = "/submission-details/";
    return url.pathname.startsWith(prefix) && url.pathname.slice(prefix.length).length > 0;
  } catch {
    return false;
  }
}

export function recognizeProvider(statusUrl: string | null): ProviderKind | null {
  return isSpringerNatureSubmissionUrl(statusUrl) ? "springer_nature" : null;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/statusSyncProvider.test.mjs`

Expected: all provider-recognition tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/statusSync/types.ts src/modules/statusSync/providerRegistry.ts scripts/statusSyncProvider.test.mjs
git commit -m "feat: recognize Springer Nature submission URLs"
```

---

### Task 2: Conservative normalization and legal transition state machine

**Files:**
- Create: `src/modules/statusSync/normalizer.ts`
- Create: `src/modules/statusSync/transitionValidator.ts`
- Test: `scripts/statusSyncRules.test.mjs`

**Interfaces:**
- Consumes: `SubmissionStatus` from `src/types.ts`; `NormalizationResult` from Task 1.
- Produces:
  - `function normalizeExactStatus(rawStatus: string, mapping: Readonly<Record<string, { canonicalStatus: SubmissionStatus; detailLabel?: string | null }>>): NormalizationResult`
  - `function canAutoTransition(from: SubmissionStatus, to: SubmissionStatus): boolean`
  - `function isTerminalStatus(status: SubmissionStatus): boolean`

- [ ] **Step 1: Write failing tests for exact mapping, unknown wording, revision loops and terminal protection**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExactStatus } from "../src/modules/statusSync/normalizer.ts";
import {
  canAutoTransition,
  isTerminalStatus,
} from "../src/modules/statusSync/transitionValidator.ts";

const mapping = {
  "Under Review": { canonicalStatus: "under_review" },
  "Reviews completed": {
    canonicalStatus: "under_review",
    detailLabel: "reviews_completed",
  },
  "Major Revision": { canonicalStatus: "major_revision" },
};

test("normalization is exact and conservative", () => {
  assert.deepEqual(normalizeExactStatus("Under Review", mapping), {
    canonicalStatus: "under_review",
    confidence: "high",
    detailLabel: null,
  });
  assert.equal(
    normalizeExactStatus("Editor evaluating recommendation", mapping).canonicalStatus,
    null,
  );
});

test("revision loops are legal", () => {
  assert.equal(canAutoTransition("major_revision", "under_review"), true);
  assert.equal(canAutoTransition("minor_revision", "with_editor"), true);
});

test("terminal status cannot be overwritten automatically", () => {
  assert.equal(isTerminalStatus("accepted"), true);
  assert.equal(canAutoTransition("accepted", "under_review"), false);
  assert.equal(canAutoTransition("rejected", "with_editor"), false);
  assert.equal(canAutoTransition("withdrawn", "under_review"), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test scripts/statusSyncRules.test.mjs`

Expected: FAIL because rule modules do not exist.

- [ ] **Step 3: Implement exact normalization and an explicit adjacency map**

Use an explicit `Readonly<Record<SubmissionStatus, ReadonlySet<SubmissionStatus>>>`. Include self-state as a no-op decision outside `canAutoTransition`; `canAutoTransition(from, from)` returns true but the engine must not append an event for equal states. Include direct skips that can legitimately be observed between six-hour polls, such as `submitted -> under_review`, `with_editor -> major_revision`, `with_editor -> minor_revision`, and `with_editor -> accepted/rejected`, while keeping all terminal-origin transitions blocked.

- [ ] **Step 4: Run focused rule tests and the existing workflow tests**

Run:

```bash
node --test scripts/statusSyncRules.test.mjs
node --test scripts/workflow.test.mjs
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/statusSync/normalizer.ts src/modules/statusSync/transitionValidator.ts scripts/statusSyncRules.test.mjs
git commit -m "feat: add auto-sync status rules"
```

---

### Task 3: Scheduling math and single-flight queue contract

**Files:**
- Create: `src/modules/statusSync/schedule.ts`
- Create: `src/modules/statusSync/scheduler.ts`
- Test: `scripts/statusSyncSchedule.test.mjs`

**Interfaces:**
- Produces:
  - `const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000`
  - `const DASHBOARD_FRESHNESS_MS = 10 * 60 * 1000`
  - `const STARTUP_DELAY_MS = 45 * 1000`
  - `function isRegularSyncDue(lastAttemptAt: number | null, now: number): boolean`
  - `function canDashboardTrigger(lastAttemptAt: number | null, now: number): boolean`
  - `class StatusSyncScheduler` with `start()`, `stop()`, `syncIfDue()`, `syncAllNow()`.

- [ ] **Step 1: Write failing pure scheduling tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_FRESHNESS_MS,
  SYNC_INTERVAL_MS,
  canDashboardTrigger,
  isRegularSyncDue,
} from "../src/modules/statusSync/schedule.ts";

const now = 2_000_000_000_000;

test("never-attempted records are due", () => {
  assert.equal(isRegularSyncDue(null, now), true);
});

test("regular sync uses lastAttemptAt plus six hours", () => {
  assert.equal(isRegularSyncDue(now - SYNC_INTERVAL_MS + 1, now), false);
  assert.equal(isRegularSyncDue(now - SYNC_INTERVAL_MS, now), true);
});

test("dashboard freshness blocks attempts in the last ten minutes", () => {
  assert.equal(canDashboardTrigger(now - DASHBOARD_FRESHNESS_MS + 1, now), false);
  assert.equal(canDashboardTrigger(now - DASHBOARD_FRESHNESS_MS, now), true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test scripts/statusSyncSchedule.test.mjs`

Expected: FAIL because `schedule.ts` does not exist.

- [ ] **Step 3: Implement pure timing functions and scheduler dependency contract**

`StatusSyncScheduler` constructor should receive injected callbacks rather than importing the adapter directly:

```ts
interface SchedulerDeps {
  listEligibleSubmissionIds(): Promise<number[]>;
  syncOne(submissionId: number, options?: { force?: boolean }): Promise<void>;
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}
```

The runtime scheduler must keep a `running` promise/flag and iterate submission IDs with `for ... of` plus `await`, never `Promise.all`.

- [ ] **Step 4: Add and run tests for sequential order and overlapping-call suppression**

Extend `scripts/statusSyncSchedule.test.mjs` with a fake `syncOne` that records `start/end` order and call `syncAllNow()` twice before the first resolves. Assert one queue owns the work and calls are not duplicated concurrently.

Run: `node --test scripts/statusSyncSchedule.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/statusSync/schedule.ts src/modules/statusSync/scheduler.ts scripts/statusSyncSchedule.test.mjs
git commit -m "feat: add auto-sync scheduling"
```

---

### Task 4: Additive sync persistence and migration

**Files:**
- Create: `src/modules/statusSync/syncStore.ts`
- Test: `scripts/statusSyncPersistence.test.mjs`
- Modify: `src/hooks.ts` to initialize/close the sync store only after the store API is proven.

**Interfaces:**
- Produces:
  - `interface SyncStateRecord`
  - `interface SyncHistoryRecord`
  - `class SyncStore`
  - `syncStore.initialize()`
  - `syncStore.getState(submissionId, provider)`
  - `syncStore.ensureState(submissionId, provider, enabled = true)`
  - `syncStore.setEnabled(submissionId, provider, enabled)`
  - `syncStore.recordAttempt(...)`
  - `syncStore.recordSuccess(...)`
  - `syncStore.appendHistory(...)`
  - `syncStore.listEligibleSpringerSubmissionIds()`

- [ ] **Step 1: Write a persistence contract test that inspects SQL definitions without requiring a live Zotero DB**

The Node unit test reads `syncStore.ts` and asserts both table names and required columns are present, including `lastAttemptAt`, `lastSuccessAt`, `rawStatus`, `normalizedStatus`, `authState`, `lastErrorCode`, `eventType`, and `detectedAt`. It also asserts the migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

- [ ] **Step 2: Run and verify RED**

Run: `node --test scripts/statusSyncPersistence.test.mjs`

Expected: FAIL because `syncStore.ts` does not exist.

- [ ] **Step 3: Implement idempotent table creation**

Create exactly:

```text
submissiontrackerSyncState
submissiontrackerSyncHistory
```

Use a composite uniqueness rule on `(submissionId, provider)` for current state. Use indexed history by `(submissionId, detectedAt)`. Keep `enabled` as integer `0/1` at SQL boundary and boolean in TypeScript.

- [ ] **Step 4: Add lifecycle wiring**

In `src/hooks.ts`, after `await db.initialize()`, call `await syncStore.initialize()`. Do not alter or migrate existing submission/event rows. The sync store does not need to close a separate SQLite connection because it uses `Zotero.DB`.

- [ ] **Step 5: Run unit, lint and type/build checks for this task**

```bash
npm run test:unit
npm run lint:check
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/statusSync/syncStore.ts src/hooks.ts scripts/statusSyncPersistence.test.mjs
git commit -m "feat: persist provider sync state"
```

---

### Task 5: Provider-neutral sync engine with canonical event safety

**Files:**
- Create: `src/modules/statusSync/engine.ts`
- Test: `scripts/statusSyncEngine.test.mjs`

**Interfaces:**
- Consumes provider recognition, normalizer, transition validator, `SyncStore`, existing canonical `db.addEvent()` behavior.
- Produces:

```ts
interface StatusProviderAdapter {
  provider: ProviderKind;
  supports(url: string): boolean;
  fetchSnapshot(submission: SubmissionRecord): Promise<ProviderSnapshot>;
  normalize(rawStatus: string): NormalizationResult;
}

interface EngineDeps {
  getSubmission(id: number): Promise<SubmissionRecord | undefined>;
  addEvent(id: number, status: SubmissionStatus, date: string, note?: string): Promise<void>;
  updateSubmission(id: number, fields: Partial<Pick<SubmissionRecord, "manuscriptId">>): Promise<void>;
  store: SyncStoreLike;
  getAdapter(provider: ProviderKind): StatusProviderAdapter | null;
  now(): number;
}

class StatusSyncEngine {
  syncOne(submissionId: number, options?: { force?: boolean }): Promise<SyncRunResult>;
}
```

- [ ] **Step 1: Write failing mocked-engine tests**

Cover these exact cases with fake dependencies:

1. unchanged raw + unchanged canonical => update success timestamp, no history, no `addEvent`;
2. raw changes but maps to same canonical => `RAW_STATUS_CHANGED`, no `addEvent`;
3. legal canonical change => one `db.addEvent` and one canonical-change history entry;
4. unknown status => preserve current canonical status and return `UNKNOWN_STATUS`;
5. manuscript ID mismatch => preserve canonical status and return `IDENTITY_MISMATCH`;
6. empty local manuscript ID + provider ID => auto-fill once;
7. terminal local status + different provider status => no `addEvent`, record conflict;
8. thrown adapter auth error => no `addEvent`, set `reauth_required`.

Representative assertion:

```js
assert.deepEqual(addEventCalls, [
  { id: 7, status: "major_revision", note: "Springer Nature auto-sync" },
]);
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test scripts/statusSyncEngine.test.mjs`

Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement the engine as decision logic around injected dependencies**

Important ordering inside `syncOne`:

```text
load submission
-> recognize provider / load state
-> record attempt
-> fetch snapshot
-> validate manuscript identity
-> normalize
-> handle unknown
-> compare raw state
-> compare canonical state
-> validate transition
-> call addEvent only if canonical state changed legally
-> persist success/raw state
-> append only meaningful history
```

For event date, use `sourceStatusDate` only when the adapter explicitly returns a trusted ISO `YYYY-MM-DD`; otherwise use the local detection date derived from `detectedAt`. Never invent earlier dates.

- [ ] **Step 4: Run engine tests and all existing unit tests**

```bash
node --test scripts/statusSyncEngine.test.mjs
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/statusSync/engine.ts scripts/statusSyncEngine.test.mjs
git commit -m "feat: add safe status sync engine"
```

---

### Task 6: Build the development-only Springer probe and obtain a redacted fixture

**Files:**
- Create: `src/modules/statusSync/springerProbe.ts`
- Create after observation: `scripts/fixtures/springer-nature/submission-details.json` or `scripts/fixtures/springer-nature/submission-details.html-fragment`
- Test: `scripts/springerNatureAdapter.test.mjs` begins with fixture-redaction assertions.

**Interfaces:**
- Produces `runSpringerProbe(browserOrDocument): Promise<SpringerProbeResult>`.
- Probe result may include only status-relevant field names/text snippets, request method/path patterns with private identifiers replaced by `[submission-id]`, and candidate selectors/JSON keys.

- [ ] **Step 1: Implement a probe that redacts before output**

The redaction function must replace:

```ts
/submission-details\/[^/?#\s]+/g
```

with:

```text
/submission-details/[submission-id]
```

and must not serialize cookies, authorization headers, local storage, full HTML, author names, manuscript title, or email address.

- [ ] **Step 2: Add a development-only entry point**

Expose the probe only when `addon.data.env === "development"`; production builds must not add a user-facing "dump page" command. The action may log a compact redacted JSON object through `ztoolkit.log`.

- [ ] **Step 3: Run static safety checks**

Add test assertions that `springerProbe.ts` contains no `document.documentElement.outerHTML`, no cookie serialization call, and that the redactor removes a sample UUID.

Run: `node --test scripts/springerNatureAdapter.test.mjs`

Expected: PASS for redaction/probe-contract tests.

- [ ] **Step 4: Runtime probe checkpoint in Zotero**

Using the user's real Springer Nature submission-details URL in a development build:

1. user explicitly opens/signs into Springer Nature;
2. run the development probe;
3. inspect only the redacted status-relevant result;
4. determine whether a stable internal JSON/XHR payload is available;
5. if a stable payload exists, capture only the minimal redacted JSON structure used for status/identity parsing;
6. otherwise capture the smallest redacted DOM fragment containing status and non-sensitive structural markers;
7. commit the redacted fixture only after confirming it contains no private submission UUID, title, author, email, token, cookie, or manuscript identifier.

This checkpoint is mandatory before production parser selectors/endpoints are committed.

- [ ] **Step 5: Commit probe and redacted fixture**

```bash
git add src/modules/statusSync/springerProbe.ts scripts/springerNatureAdapter.test.mjs scripts/fixtures/springer-nature
git commit -m "test: capture redacted Springer status fixture"
```

---

### Task 7: Session manager and production Springer Nature adapter

**Files:**
- Create: `src/modules/statusSync/sessionManager.ts`
- Create: `src/modules/statusSync/springerNatureAdapter.ts`
- Modify: `scripts/springerNatureAdapter.test.mjs`
- Modify: `src/modules/statusPage.ts` only if the same authenticated browser/context must be reused for reconnect.

**Interfaces:**
- Consumes the observed fixture from Task 6.
- Produces:
  - `class SessionManager`
  - `sessionManager.openSpringerSignIn(url: string): void`
  - `sessionManager.requestSpringer(url: string): Promise<SessionResponse>` or a browser-document equivalent selected from the real probe result.
  - `class SpringerNatureAdapter implements StatusProviderAdapter`

- [ ] **Step 1: Verify exact Zotero HTTP/cookie/browser APIs against current official Zotero developer documentation before writing the runtime implementation**

Document the chosen API in a short code comment in `sessionManager.ts`, including why the Zotero 10 path and Zotero 7-9 compatibility path are isolated behind one interface. Do not copy credentials into plugin storage as a compatibility workaround.

- [ ] **Step 2: Write failing adapter fixture tests**

Tests must assert the adapter extracts from the real redacted fixture:

```text
rawStatus
sourceStatusDate when actually present
manuscriptId only if the observed structure exposes it reliably
```

Also include fixtures/results for an unauthenticated/login response and malformed provider payload.

- [ ] **Step 3: Run and verify RED**

Run: `node --test scripts/springerNatureAdapter.test.mjs`

Expected: parser tests FAIL before adapter implementation.

- [ ] **Step 4: Implement API-first parser or DOM fallback exactly from the observed fixture**

Do not add selectors or endpoint strings that were not observed in Task 6. `SpringerNatureAdapter.normalize()` owns the conservative Springer status mapping derived from observed exact strings. Unknown strings return `{ canonicalStatus: null, confidence: "unknown", detailLabel: null }`.

- [ ] **Step 5: Implement auth detection**

If the response is redirected to/signals a login page or returns observed unauthenticated semantics, throw a typed `AUTH_REQUIRED` provider error. Do not open a browser automatically from `fetchSnapshot()`.

- [ ] **Step 6: Run adapter tests, lint and build**

```bash
node --test scripts/springerNatureAdapter.test.mjs
npm run lint:check
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/statusSync/sessionManager.ts src/modules/statusSync/springerNatureAdapter.ts src/modules/statusPage.ts scripts/springerNatureAdapter.test.mjs
git commit -m "feat: sync Springer Nature submission status"
```

---

### Task 8: Runtime wiring, startup scheduler and dashboard-triggered sync

**Files:**
- Create: `src/modules/statusSync/runtime.ts`
- Modify: `src/hooks.ts`
- Modify: `src/modules/dashboard.ts`
- Modify: `src/modules/analyticsDashboard.ts`
- Test: `scripts/statusSyncUiContract.test.mjs`

**Interfaces:**
- Produces UI-safe runtime functions:

```ts
startStatusSync(): void;
stopStatusSync(): void;
syncIfDue(): void;
syncAllNow(): Promise<void>;
syncOneNow(submissionId: number): Promise<SyncRunResult>;
getSyncState(submissionId: number): Promise<SyncStateRecord | undefined>;
setSubmissionSyncEnabled(submissionId: number, enabled: boolean): Promise<void>;
openSpringerReconnect(submissionId: number): Promise<void>;
```

- [ ] **Step 1: Write contract tests for non-blocking Dashboard integration**

Read `dashboard.ts` and `analyticsDashboard.ts` and assert both import/call `syncIfDue()` without `await` in the initial rendering path. The local `refresh()` must run regardless of network status.

- [ ] **Step 2: Run and verify RED**

Run: `node --test scripts/statusSyncUiContract.test.mjs`

Expected: FAIL before runtime integration.

- [ ] **Step 3: Wire lifecycle**

In `src/hooks.ts`:

```text
startup: initialize db -> initialize syncStore -> register UI -> startReminderLoop -> startStatusSync
shutdown: stopStatusSync before unregistering toolkit/UI
```

The scheduler's first automatic run waits exactly `STARTUP_DELAY_MS` from Task 3.

- [ ] **Step 4: Trigger due sync after Dashboard and Analytics local rendering starts**

`openDashboard()` and `openAnalyticsDashboard()` should invoke `void syncIfDue()` after their immediate local refresh is scheduled/started. Reopening an already-open tab may also call `syncIfDue()`; the freshness/due rules prevent bursts.

- [ ] **Step 5: Run focused and full checks**

```bash
node --test scripts/statusSyncUiContract.test.mjs
npm run test:unit
npm run lint:check
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/statusSync/runtime.ts src/hooks.ts src/modules/dashboard.ts src/modules/analyticsDashboard.ts scripts/statusSyncUiContract.test.mjs
git commit -m "feat: run Springer sync while Zotero is open"
```

---

### Task 9: Add/edit detection, per-submission controls, Dashboard summary and bilingual UI

**Files:**
- Modify: `src/modules/dialog.ts`
- Modify: `src/modules/dashboard.ts`
- Modify: `addon/content/dialog.css`
- Modify: `addon/content/dashboard.css`
- Modify: `addon/locale/en-US/mainWindow.ftl`
- Modify: `addon/locale/zh-CN/mainWindow.ftl`
- Modify: `scripts/statusSyncUiContract.test.mjs`

**Interfaces:**
- Consumes `recognizeProvider`, runtime sync functions, sync state.
- User actions: `Sync now`, `Sync all`, `Pause auto-sync`, `Resume auto-sync`, `Reconnect Springer Nature`, existing `Open submission system`.

- [ ] **Step 1: Add failing source/UI contract tests**

Assert bilingual localization keys exist for at least:

```text
sync-springer-detected
sync-enabled
sync-paused
sync-now
sync-all
sync-last-success
sync-next-check
sync-auth-required
sync-reconnect
sync-unknown-status
sync-conflict
sync-pause
sync-resume
```

Also assert the create/edit dialog calls `recognizeProvider(statusUrl)` and the detail UI reads sync state.

- [ ] **Step 2: Run and verify RED**

Run: `node --test scripts/statusSyncUiContract.test.mjs`

Expected: FAIL because UI/localization hooks are absent.

- [ ] **Step 3: Add URL detection feedback to create/edit dialog**

When a valid Springer URL is entered, display localized feedback equivalent to:

```text
✓ Springer Nature detected
Automatic status sync will be enabled
```

Saving a recognized URL must call `syncStore.ensureState(record.id, "springer_nature", true)` unless an existing state row already preserves an explicit paused choice. Re-editing an already-paused record must not silently re-enable it merely because the same URL is saved again.

- [ ] **Step 4: Add submission-detail sync section**

Show provider, enabled/paused, auth state, raw Springer status, last success, next approximate check, and last relevant error. Buttons call runtime functions and refresh the dialog after completion. `Reconnect` appears only for `reauth_required` and opens the browser only after user click.

- [ ] **Step 5: Add lightweight Dashboard summary**

Show Springer tracked count and compact counts such as OK / sign-in required / attention. `Sync all` invokes manual sequential sync. Do not delay existing record rendering while summary data loads.

- [ ] **Step 6: Add minimal CSS for the new status blocks**

Reuse existing `st-*` spacing/button/badge conventions. Do not redesign unrelated Dashboard cards or Analytics layout.

- [ ] **Step 7: Run tests, lint and build**

```bash
npm run test:unit
npm run lint:check
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/dialog.ts src/modules/dashboard.ts addon/content/dialog.css addon/content/dashboard.css addon/locale/en-US/mainWindow.ftl addon/locale/zh-CN/mainWindow.ftl scripts/statusSyncUiContract.test.mjs
git commit -m "feat: add Springer sync controls"
```

---

### Task 10: Global preference, generated preference typing, privacy guards and recovery behavior

**Files:**
- Modify: `addon/prefs.js`
- Modify: `addon/content/preferences.xhtml`
- Modify: `addon/locale/en-US/preferences.ftl`
- Modify: `addon/locale/zh-CN/preferences.ftl`
- Modify: `typings/prefs.d.ts`
- Modify: `src/modules/statusSync/runtime.ts`
- Modify: `src/modules/statusSync/engine.ts`
- Test: `scripts/statusSyncUiContract.test.mjs`
- Test: `scripts/statusSyncEngine.test.mjs`

**Interfaces:**
- Adds preference key `sync.enabled: boolean`, default `true`.

- [ ] **Step 1: Write failing preference and recovery tests**

Tests assert:

```text
pref("sync.enabled", true)
```

exists, `typings/prefs.d.ts` contains `"sync.enabled": boolean`, and disabled global sync makes automatic scheduler entry points return without provider requests while manual UI can report that automatic sync is disabled.

Engine recovery test: when previous `lastErrorCode`/auth state indicates a persistent error and a later sync succeeds, append one recovery history event and clear error metadata; subsequent successful unchanged polls do not append another recovery.

- [ ] **Step 2: Run and verify RED**

```bash
node --test scripts/statusSyncUiContract.test.mjs scripts/statusSyncEngine.test.mjs
```

Expected: FAIL for missing preference/recovery behavior.

- [ ] **Step 3: Add preference/UI/type entry**

`preferences.xhtml` adds one checkbox bound to `sync.enabled`. English and Chinese Fluent files explain that synchronization runs only while Zotero is open and may require the user to reconnect Springer Nature.

- [ ] **Step 4: Add privacy-safe error/log formatting**

Centralize a helper that redacts submission-details identifiers from logged URLs. Do not put raw response body, HTML, cookies, authorization headers, access tokens, or credentials into `lastErrorMessage`; store a short sanitized diagnostic message only.

- [ ] **Step 5: Implement recovery-state transitions and global disable**

Automatic startup/dashboard scheduling checks `getPref("sync.enabled")`. `AUTH_REQUIRED` suppresses future automatic attempts for that record until reconnect. Recovery clears `lastErrorCode` and changes auth state back to connected/unknown-safe state only after a successful provider fetch.

- [ ] **Step 6: Run full checks**

```bash
npm run test:unit
npm run lint:check
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add addon/prefs.js addon/content/preferences.xhtml addon/locale/en-US/preferences.ftl addon/locale/zh-CN/preferences.ftl typings/prefs.d.ts src/modules/statusSync/runtime.ts src/modules/statusSync/engine.ts scripts/statusSyncUiContract.test.mjs scripts/statusSyncEngine.test.mjs
git commit -m "feat: add auto-sync preference and recovery"
```

---

### Task 11: Runtime smoke test in Zotero and regression verification

**Files:**
- Modify only files proven necessary by runtime defects.
- Do not bump `package.json` version.

**Interfaces:**
- Verifies the complete user flow against the approved design.

- [ ] **Step 1: Build a development XPI/current dev bundle**

Run: `npm run build`

Expected: build and `tsc --noEmit` complete successfully.

- [ ] **Step 2: Install/run the feature branch in Zotero and verify existing v0.6.1 behavior first**

Check:

```text
existing records load
9-state timeline works
Submission Dashboard opens
Submission Analytics opens
Collection picker still works
status page still opens
CSV/JSON operations remain available
```

- [ ] **Step 3: Verify recognized Springer record onboarding**

Create/edit a test record with a valid Springer submission-details URL. Confirm:

```text
provider auto-detected
auto-sync enabled by default
no password field exists
no automatic login popup appears
```

- [ ] **Step 4: Verify authenticated manual sync against the user's Springer session**

After the user explicitly signs in, click `Sync now`. Confirm the raw status displayed by the plugin matches the visible Springer status and the canonical state is mapped only when the exact observed mapping is high-confidence.

- [ ] **Step 5: Verify no duplicate timeline event on repeated unchanged sync**

Run `Sync now` twice without provider change. Confirm `lastAttemptAt/lastSuccessAt` move but canonical timeline length does not increase.

- [ ] **Step 6: Verify auth-expiry behavior without forcing credential expiry**

Use the adapter's test/dev unauthenticated fixture path or a controlled signed-out session. Confirm the UI displays reauthentication required, canonical state stays unchanged, and no login page opens until the user clicks `Reconnect Springer Nature`.

- [ ] **Step 7: Verify pause/resume and global disable**

Pause one submission and verify `syncIfDue()` skips it. Re-enable it and verify it becomes eligible again. Disable the global preference and verify background/dashboard-triggered sync does not make provider requests.

- [ ] **Step 8: Run fresh final verification commands**

```bash
npm run test:unit
npm run lint:check
npm run build
```

Expected: all commands exit successfully with zero failing unit tests and zero lint/type/build errors.

- [ ] **Step 9: Commit only runtime fixes, if any**

Use a focused commit message matching the actual defect, for example `fix: preserve Springer auth-required state` only if that exact runtime issue was fixed. Do not create an empty commit.

---

### Task 12: Documentation and review-ready PR, without release

**Files:**
- Modify: `README.md`
- Keep: `docs/superpowers/specs/2026-09-02-springer-nature-auto-sync-design.md`
- Keep: `docs/superpowers/plans/2026-09-02-springer-nature-auto-sync.md`

**Interfaces:**
- No production API changes; prepares the feature for user review.

- [ ] **Step 1: Update README as an unreleased feature only**

Document Springer Nature auto-sync, privacy model, six-hour while-Zotero-open behavior, reconnect semantics, and supported URL form. Do not change the README latest-release badge/text from v0.6.1 until a later explicit release authorization.

- [ ] **Step 2: Re-run final verification after documentation formatting**

```bash
npm run test:unit
npm run lint:check
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: describe Springer Nature auto-sync"
```

- [ ] **Step 4: Open a review PR from `feature/v0.7.0-springer-auto-sync` to `main`**

PR body must summarize:

```text
Springer Nature URL auto-detection
session-based auth without password storage
6-hour/background + dashboard due sync
raw/canonical status separation
state-machine and terminal protections
sync history/persistence
bilingual controls
redacted fixture/probe validation
unit/lint/build evidence
runtime smoke-test evidence
```

Create the PR but do not merge it, tag it, bump version, or publish an XPI/release without explicit user authorization.

---

## Plan Self-Review Checklist

- Spec coverage: provider recognition, session security, probe-before-parser, raw/canonical separation, transition rules, terminal protection, no invented history, identity validation, persistence, scheduling, dashboard triggers, manual sync, sequential execution, auth handling, UI, preferences, privacy/logging, errors, bilingual copy, migration and testing are each assigned to a task.
- Scope: one subsystem only — Springer Nature auto-sync. Other providers/email/cloud remain excluded.
- Type consistency: `ProviderKind`, `ProviderSnapshot`, `NormalizationResult`, `SyncRunResult`, `SyncStateRecord`, `StatusProviderAdapter`, `SyncStore` and runtime function names are introduced before downstream use.
- TDD order: deterministic provider/rule/schedule/engine behavior is tested RED before implementation. The Springer production parser is blocked on an observed redacted fixture.
- Release safety: no task bumps version, merges to `main`, tags, or publishes a release.
