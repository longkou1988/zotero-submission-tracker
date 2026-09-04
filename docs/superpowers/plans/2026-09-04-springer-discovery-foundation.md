# Springer Nature Discovery Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently testable account-discovery layer for Springer Nature: parse the authenticated account overview, resolve only trustworthy submission identities, persist pending/imported/ignored staging records, and expose a safe development runtime check for SNAPP/Editorial-Manager resolution.

**Architecture:** Keep discovery separate from the existing linked-record status-sync engine. A pure account-page parser produces transient `SpringerDiscoveryCandidate` objects. A resolver accepts only final `https://submission.springernature.com/submission-details/<id>` URLs as durable identities. A dedicated `DiscoveryStore` persists only resolved identities and preserves user lifecycle choices. The production account scanner remains conservative around Editorial Manager until a real Zotero runtime check proves that each observed card can be resolved to the correct distinct details ID.

**Tech Stack:** TypeScript 5.9, Node 24 `node:test`, Zotero 7/8 add-on runtime, Zotero `HiddenBrowser`, SQLite through `Zotero.DB`, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-04-springer-account-discovery-import-design.md`

## Global Constraints

- Development stays on `feature/v0.7.0-springer-auto-sync`; do not merge to `main`.
- `package.json` remains `0.6.1`; do not tag or release.
- Provider user-facing family remains `springer_nature`.
- Source systems are diagnostic only: `snapp | editorial_manager | unknown`.
- Never treat `https://www2.cloud.editorialmanager.com/.../default2.aspx` as a submission identity.
- Never persist/log cookies, tokens, passwords, email addresses, authenticated full HTML, editor feedback bodies, reviewer comment bodies, or decision-letter bodies.
- Never guess author/editor identities, reviewer counts, dates, pagination controls, hidden endpoints, or major/minor revision type.
- No durable discovery row may be created without a resolved non-empty `submission-details/<id>` identity.
- `ignored` must not be reset to `pending` by rescans; `imported` mappings must remain stable.
- All production behavior changes follow RED -> verify expected failure -> minimal GREEN -> fresh CI verification.

---

## File Structure

- Create `src/modules/statusSync/discoveryTypes.ts` — discovery-domain types only.
- Create `src/modules/statusSync/springerAccountDiscovery.ts` — pure account parser, URL identity resolver, and conservative scanner orchestration.
- Create `src/modules/statusSync/discoveryStore.ts` — staging persistence and lifecycle transitions.
- Create `scripts/fixtures/springer-nature/account-submitted-mixed-systems.json` — minimal redacted observation fixture, no titles or private identifiers from the user's real account.
- Create `scripts/springerAccountDiscovery.test.mjs` — parser/resolver/scanner contract tests.
- Create `scripts/statusSyncDiscoveryPersistence.test.mjs` — persistence/lifecycle tests.
- Modify `src/hooks.ts` — initialize `DiscoveryStore` after the core DB/sync stores.
- Modify `src/addon.ts` — development-only sanitized runtime resolver check; no user-facing production button yet.

---

### Task 1: Discovery Domain Types and Observed Account-Page Parser

**Files:**

- Create: `src/modules/statusSync/discoveryTypes.ts`
- Create: `scripts/fixtures/springer-nature/account-submitted-mixed-systems.json`
- Create: `scripts/springerAccountDiscovery.test.mjs`
- Create: `src/modules/statusSync/springerAccountDiscovery.ts`

**Interfaces:**

- Produces:
  - `type SpringerSourceSystem = "snapp" | "editorial_manager" | "unknown"`
  - `interface SpringerDiscoveryCandidate { index: number; sourceSystem: SpringerSourceSystem; title: string; journal: string | null; rawStatus: string | null; lastUpdatedText: string | null; entryUrl: string }`
  - `parseSpringerAccountDocument(documentLike): SpringerDiscoveryCandidate[]`
- Consumes only observed selectors:
  - `[data-test="research-tracker-item"]`
  - `[data-test="research-content-card-title"]`
  - `[data-test="research-content-card-subtitle"]`
  - `[data-test="research-content-card-status-info"]`
  - `[data-test="research-content-card-last-updated"]`
  - `[data-test="submission-card-link--snapp"]`
  - `[data-test="submission-card-link--em"]`

- [ ] **Step 1: Add a redacted fixture and failing parser test**

Fixture must describe exactly four synthetic cards matching the observed structure: one SNAPP card with a redacted details URL and three Editorial Manager cards with generic `/cups/default2.aspx` links. Use invented titles such as `Synthetic Manuscript A`; do not copy the user's private paper titles.

Test assertions:

```js
assert.equal(candidates.length, 4);
assert.equal(candidates[0].sourceSystem, "snapp");
assert.equal(candidates[1].sourceSystem, "editorial_manager");
assert.equal(candidates[0].title, "Synthetic Manuscript A");
assert.equal(
  candidates[1].entryUrl,
  "https://www2.cloud.editorialmanager.com/cups/default2.aspx",
);
```

- [ ] **Step 2: Run CI and verify RED**

Push only fixture/test changes. Expected: Unit test fails because `springerAccountDiscovery.ts` or `parseSpringerAccountDocument` does not exist; Build/Lint may remain green.

- [ ] **Step 3: Implement the minimal pure parser**

The parser must use a narrow `DocumentLike` interface and deterministic whitespace normalization. Source-system detection is based only on the observed `data-test` link marker. Missing title yields an empty string; the scanner, not the parser, decides whether a candidate is importable.

- [ ] **Step 4: Verify GREEN**

Run/observe `npm run test:unit`, `npm run lint:check`, and `npm run build` in CI. All must pass.

- [ ] **Step 5: Commit**

Commit message: `feat: parse Springer account submission cards`

---

### Task 2: Durable Submission Identity Resolver

**Files:**

- Modify: `scripts/springerAccountDiscovery.test.mjs`
- Modify: `src/modules/statusSync/springerAccountDiscovery.ts`

**Interfaces:**

- Produces:
  - `interface ResolvedSpringerIdentity { providerSubmissionId: string; statusUrl: string }`
  - `resolveSpringerSubmissionIdentity(finalUrl: string): ResolvedSpringerIdentity | null`
- Rule: only exact HTTPS host `submission.springernature.com` and exact path shape `/submission-details/<non-empty-id>` are accepted.

- [ ] **Step 1: Write failing identity tests**

```js
assert.deepEqual(
  resolveSpringerSubmissionIdentity(
    "https://submission.springernature.com/submission-details/example-id?_gl=redacted",
  ),
  {
    providerSubmissionId: "example-id",
    statusUrl:
      "https://submission.springernature.com/submission-details/example-id",
  },
);
assert.equal(
  resolveSpringerSubmissionIdentity(
    "https://www2.cloud.editorialmanager.com/cups/default2.aspx",
  ),
  null,
);
assert.equal(
  resolveSpringerSubmissionIdentity(
    "http://submission.springernature.com/submission-details/example-id",
  ),
  null,
);
```

- [ ] **Step 2: Verify RED in CI**

Expected failure: missing exported resolver or wrong return value.

- [ ] **Step 3: Implement minimal resolver**

Strip query/fragment from the durable `statusUrl`; preserve the exact path ID string. Do not validate UUID shape because the observed contract only proves a non-empty path identifier.

- [ ] **Step 4: Verify GREEN in CI**

Unit/Lint/Build all pass.

- [ ] **Step 5: Commit**

Commit message: `feat: resolve Springer discovery identities`

---

### Task 3: Discovery Staging Store and Lifecycle Invariants

**Files:**

- Create: `scripts/statusSyncDiscoveryPersistence.test.mjs`
- Create: `src/modules/statusSync/discoveryStore.ts`
- Modify: `src/modules/statusSync/discoveryTypes.ts`

**Interfaces:**

- Produces:
  - `type DiscoveryImportState = "pending" | "imported" | "ignored"`
  - `interface DiscoveredSubmissionRecord`
  - `DiscoveryStore.initialize(): Promise<void>`
  - `DiscoveryStore.upsertResolved(input): Promise<DiscoveredSubmissionRecord>`
  - `DiscoveryStore.getByIdentity(providerFamily, providerSubmissionId)`
  - `DiscoveryStore.listByState(state)`
  - `DiscoveryStore.setIgnored(id)`
  - `DiscoveryStore.restorePending(id)`
  - `DiscoveryStore.markImported(id, linkedSubmissionId)`
- Durable uniqueness: `(providerFamily, providerSubmissionId)`.

- [ ] **Step 1: Write failing persistence tests**

Use the existing fake-Zotero-DB test pattern from `statusSyncPersistence.test.mjs`. Lock these behaviors:

```text
new resolved identity -> pending
rescan same identity -> same row, metadata refreshed, lastSeenAt updated
ignored + rescan -> remains ignored
imported + rescan -> remains imported and linkedSubmissionId preserved
restorePending only changes ignored -> pending
markImported requires positive linkedSubmissionId
unresolved generic Editorial Manager URL cannot be inserted because API requires providerSubmissionId
```

Include an explicit assertion that user lifecycle fields are not overwritten by `upsertResolved`.

- [ ] **Step 2: Verify RED in CI**

Expected Unit failure because `discoveryStore.ts` is missing.

- [ ] **Step 3: Implement additive SQLite schema and store**

Create table `submissiontrackerDiscoveredSubmissions` with at least:

```sql
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
UNIQUE(providerFamily, providerSubmissionId)
```

Upsert updates provider metadata and timestamps but never resets `importState` or `linkedSubmissionId`.

- [ ] **Step 4: Verify GREEN in CI**

Unit/Lint/Build all pass.

- [ ] **Step 5: Commit**

Commit message: `feat: persist Springer discovery staging`

---

### Task 4: Account Scanner Orchestration Without Guessing EM Identity

**Files:**

- Modify: `scripts/springerAccountDiscovery.test.mjs`
- Modify: `src/modules/statusSync/springerAccountDiscovery.ts`
- Modify: `src/modules/statusSync/discoveryTypes.ts`

**Interfaces:**

- Produces:
  - `interface SpringerDiscoverySession { requestSpringer(url: string): Promise<{ finalUrl: string; documentHTML: string }> }`
  - `interface SpringerAccountScanResult { resolved: ResolvedDiscoveryCandidate[]; unresolved: UnresolvedDiscoveryCandidate[] }`
  - `class SpringerAccountDiscovery { scanAccount(): Promise<SpringerAccountScanResult> }`
- Default account URL: `https://link.springernature.com/home/?tab=submitted`.
- Scanner does **not** persist. Persistence happens only after resolution in a later caller/runtime task.

- [ ] **Step 1: Write failing orchestration tests**

Use injected fake session/parser so tests contain no browser/network dependency. Lock behaviors:

```text
account page parsed first
SNAPP direct details URL resolves immediately
EM generic URL is not treated as durable identity
unresolved EM candidate is returned separately rather than dropped or guessed
candidate processing is sequential
empty/invalid title remains discoverable but marked unresolvedReason = "missing_title" before import
```

For this task, do **not** assert that a generic EM href can be resolved by `requestSpringer(href)`. That behavior is a real-runtime question, not a unit-test assumption.

- [ ] **Step 2: Verify RED in CI**

Expected Unit failure on missing scanner class/contracts.

- [ ] **Step 3: Implement conservative scanner**

Load and parse the account page. Resolve direct `submission-details` links. For generic EM links, emit `unresolvedReason: "requires_runtime_resolution"` and retain source-system/title/list metadata in memory only. Do not insert unresolved rows into the database.

- [ ] **Step 4: Verify GREEN in CI**

Unit/Lint/Build all pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add conservative Springer account scanner`

---

### Task 5: Store Initialization and Safe Development Runtime Resolution Check

**Files:**

- Modify: `scripts/statusSyncPersistence.test.mjs` or add focused static assertion to `scripts/springerAccountDiscovery.test.mjs`
- Modify: `src/hooks.ts`
- Modify: `src/addon.ts`
- Modify: `src/modules/statusSync/springerAccountDiscovery.ts`

**Interfaces:**

- Produces development-only API:

```ts
runSpringerDiscoveryCheck(): Promise<{
  cardCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  cards: Array<{
    index: number;
    sourceSystem: "snapp" | "editorial_manager" | "unknown";
    resolution: "resolved" | "unresolved";
    finalPage: "submission_details" | "other" | "not_followed";
    providerSubmissionIdRedacted: "[id]" | null;
    reason: string | null;
  }>;
}>
```

The API must never return title, journal, manuscript ID, URL ID, email, HTML, cookie/token, editor/reviewer text, or raw private metadata.

- [ ] **Step 1: Write failing static/runtime-contract tests**

Assertions:

```text
hooks initialize discoveryStore after db/syncStore initialization
addon exposes runSpringerDiscoveryCheck only when env === "development"
returned diagnostic contract contains no documentHTML/full URL/title/email fields
production code contains no cookie/localStorage/sessionStorage/Authorization access
```

- [ ] **Step 2: Verify RED in CI**

Expected Unit failure because initialization/dev API is missing.

- [ ] **Step 3: Implement initialization and diagnostic check**

Initialize `discoveryStore` during startup. The diagnostic function may safely attempt to resolve candidates only through observed browser navigation behavior, but it must report unresolved rather than invent an ID. For direct SNAPP cards, it can report `resolved` from the direct details URL. For EM, keep the runtime mechanism isolated so a failed/duplicate resolution cannot persist anything.

- [ ] **Step 4: Verify GREEN in CI**

Unit/Lint/Build all pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add Springer discovery runtime check`

---

### Task 6: Phase-1 Verification and Runtime Checkpoint

**Files:**

- No production behavior expansion beyond Tasks 1-5.
- Update Draft PR #12 body with verified scope and the remaining runtime checkpoint.

**Interfaces:**

- Phase-1 completion requires:
  - all unit tests green;
  - lint green;
  - build green;
  - no version bump;
  - no release/merge;
  - a downloadable CI build artifact available for the user's Zotero runtime check.

- [ ] **Step 1: Run fresh CI on final Phase-1 HEAD**

Verify all jobs from the same commit, not from an earlier intermediate commit.

- [ ] **Step 2: Inspect artifact metadata**

Confirm `build-result` exists for the successful workflow run.

- [ ] **Step 3: Update Draft PR description**

Document: parser/store complete, unresolved EM identity intentionally not persisted, and user runtime validation still required before automatic EM discovery can be enabled.

- [ ] **Step 4: Provide the runtime command to the user**

After the build is installable in Zotero development mode, ask the user to run exactly:

```js
await Zotero.SubmissionTracker.api.runSpringerDiscoveryCheck();
```

The result must be sanitized. Success criterion for the next phase: each account card that can be durably imported resolves to the correct distinct `submission-details/<id>` identity; duplicate/ambiguous EM resolution blocks production auto-import until its click/navigation semantics are observed.

- [ ] **Step 5: Stop at the runtime checkpoint if EM remains unresolved**

Do not guess event handlers, hidden endpoints, form fields, or identifiers. Capture only a new redacted observation and revise the resolver design from evidence.
