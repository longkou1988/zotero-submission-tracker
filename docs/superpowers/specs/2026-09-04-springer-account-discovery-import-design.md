# Springer Nature Account Discovery and Import Design

**Date:** 2026-09-04  
**Target:** v0.7.0 development branch  
**Status:** Design approved in conversation; implementation requires written-spec review before planning

## 1. Goal

Extend Submission Tracker from linked-record status synchronization to account-level Springer Nature submission discovery and controlled import.

The user signs in to Springer Nature in the normal browser/session flow. Submission Tracker discovers submissions visible in the Springer Nature account, stages them locally, matches them against Zotero items conservatively, presents an import-confirmation UI, and only then creates or links formal `SubmissionRecord` entries. Imported submissions are subsequently handled by the existing automatic status-sync subsystem.

The feature must preserve the core domain model:

- A Zotero item represents a manuscript/paper.
- A `SubmissionRecord` represents one submission attempt of that manuscript to a journal.
- One Zotero item may have multiple `SubmissionRecord` rows.
- The manuscript title is the primary display title. Journal name is submission metadata and must never be used as a replacement manuscript title when a real title is available.

## 2. Scope

### 2.1 In scope

For Springer Nature only:

- Account-level discovery from the authenticated Springer Nature research/submission overview.
- Initial full scan of all submission cards visible/accessible through observed account UI.
- Daily incremental discovery after the initial scan.
- Discovery staging with `pending`, `imported`, and `ignored` lifecycle states.
- Conservative Zotero title matching.
- Import confirmation before any new Zotero item or formal submission record is created.
- Automatic creation of a `journalArticle` when no exact Zotero title match exists and the user confirms import.
- Best-effort structured capture of:
  - manuscript title;
  - journal;
  - provider submission identifier;
  - manuscript ID when explicitly available;
  - current raw status;
  - provider progress stage;
  - provider detail label;
  - submission date;
  - revision due date;
  - authors when explicitly available from a reliable structured source;
  - editor names/roles when explicitly available from a reliable structured source;
  - structured review-progress signals when explicitly available;
  - provider history/timeline events and dates.
- Long-term mapping from the provider discovery record to the formal `SubmissionRecord`.
- Per-record pause/resume and the existing automatic status-sync behavior after import.

### 2.2 Out of scope

- Elsevier, Wiley, ScholarOne, or other publisher/account discovery.
- Automatic import without user confirmation.
- Guessing author names, editor identities, manuscript IDs, reviewer counts, dates, or major/minor revision type.
- Persisting full editor feedback, reviewer comments, decision letters, emails, passwords, cookies, tokens, session storage, or full authenticated HTML.
- CAPTCHA/MFA bypass or automated credential entry.
- Downloading or parsing the submitted manuscript file for metadata inference.
- Replacing or overwriting existing Zotero bibliographic metadata merely because Springer differs.

## 3. Observed Springer Nature Architecture

### 3.1 Account discovery page

Observed authenticated account entry:

`https://link.springernature.com/home/?tab=submitted`

Observed stable markers include:

- `[data-test="research-tracker-container"]`
- `[data-test="submissions-list"]`
- `[data-test="research-tracker-item"]`
- `[data-test="research-content-card"]`
- `[data-test="research-content-card-title"]`
- `[data-test="research-content-card-subtitle"]`
- `[data-test="research-content-card-status-info"]`
- `[data-test="research-content-card-last-updated"]`
- `[data-test="submission-card-link--snapp"]`
- `[data-test="submission-card-link--em"]`

The account page can contain cards originating from both SNAPP and Editorial Manager. The source system is discovery metadata only; it is not the user-facing provider identity.

Observed Editorial Manager cards can expose the same generic `www2.cloud.editorialmanager.com/.../default2.aspx` href. That generic href is not a submission identity. Account parsing therefore produces an **ephemeral card candidate** first. A durable `DiscoveredSubmission` may be written only after the exact card has been resolved to an observed final Springer details URL with a unique provider submission ID.

The implementation must runtime-verify how an individual Editorial Manager card is activated in Zotero's hosted browser context. It may use the observed card/link DOM only after that exact activation/redirect flow is demonstrated. It must not invent query parameters, hidden endpoints, or synthetic Editorial Manager IDs. If exact per-card activation cannot be automated safely, Editorial Manager account discovery remains incomplete rather than falling back to title-based permanent identity.

No pagination/load-more mechanism has yet been observed. The scanner must process only cards actually exposed through observed UI behavior until further evidence exists.

### 3.2 Unified submission-details page

Observed both SNAPP- and Editorial-Manager-origin cards ultimately reaching:

`https://submission.springernature.com/submission-details/<provider-id>`

Observed detail markers include:

- manuscript title: `[data-test="submission-detail-title"]`
- journal: `[data-test="heading-journal-title"]`
- current status container: `[data-test="current-status"]`
- raw status headline: `[data-test="current-status-headline"]`
- current status text: `[data-test="current-status-text"]`
- revision instructions: `[data-test="revision-instructions"]`
- progress stage items: `[data-test="progress-bar-item"]`
- editor-feedback container: `[data-test="current-feedback-text"]`
- reviewer-feedback container: `[data-test="current-comments-text"]`
- submitted manuscript link: `[data-test="your-submission-manuscript-file"]`

Observed history text contains explicit dated events such as submission received, technical check, editorial assignment, reviewer invitation/acceptance/report receipt, revision requested, and revision received. Repeated event types across multiple review/revision rounds are valid and must be preserved.

No selector, endpoint, author field, editor identity field, reviewer count, major/minor revision label, or pagination mechanism may be implemented by guesswork. New provider-specific parsing rules require observed DOM/API evidence or a redacted fixture.

## 4. Provider Model

The public provider remains **Springer Nature**. Internally, discovery records also capture their source system:

```ts
providerFamily: "springer_nature";
sourceSystem: "snapp" | "editorial_manager" | "unknown";
```

The detail parser is unified because both observed source systems converge on the same `submission.springernature.com/submission-details/<id>` surface.

The provider submission identifier is the non-empty `<id>` segment from the observed details URL after navigation/redirect has completed. Editorial Manager's generic `/default2.aspx` URL must never be treated as a unique submission identifier.

## 5. End-to-End Data Flow

```text
Springer Nature account page
        |
        v
SpringerAccountDiscovery
        |
        v
Ephemeral AccountCardCandidate[]
        |
        v
Resolve exact card -> final submission-details/<id>
        |
        v
DiscoveredSubmission staging
        |
        +--> existing provider mapping? --> refresh staged/imported metadata
        |
        v
ZoteroMatcher
        |
        +--> normalized exact title match --> propose existing Zotero item
        |
        +--> similar title only ----------> require manual choice
        |
        +--> no exact match --------------> propose new journalArticle
        |
        v
Import Confirmation UI
        |
        v
Single-submission import transaction/compensation
        |
        +--> Zotero item (existing or newly created)
        +--> SubmissionRecord
        +--> provider metadata/authors/editors/history
        +--> discovery mapping -> imported
        |
        v
Existing automatic status-sync runtime
```

Discovery and status synchronization are separate responsibilities:

- **Discovery** answers: "What submissions exist in my Springer Nature account?"
- **Status sync** answers: "Has an already imported submission changed?"

## 6. Discovery Scheduling

### 6.1 Initial scan

The first user-initiated **Scan Springer** action performs a full scan of all submissions exposed through the observed account UI. It must not invent pagination or hidden endpoints. If a future observed page exposes explicit paging/load-more controls, support can be added with a redacted fixture and tests.

### 6.2 Incremental discovery

After a successful initial scan:

- automatic account discovery runs at most once every 24 hours;
- it refreshes visible discovery records and detects newly exposed provider submission IDs;
- it does not automatically import new records;
- newly discovered records enter `pending` and appear in the Dashboard's pending-import count.

Imported records continue to use the existing 6-hour status synchronization schedule.

## 7. Discovery Lifecycle

`DiscoveredSubmission.importState` has exactly three user-facing lifecycle states:

- `pending`: discovered and awaiting a decision;
- `imported`: linked to a formal `SubmissionRecord`;
- `ignored`: deliberately not imported.

Rules:

- `ignored` records remain discoverable in an **Ignored** view but do not re-notify on daily scans.
- The user can restore `ignored -> pending`.
- `imported` discovery rows are retained permanently as the provider-to-submission mapping.
- A newly observed provider submission ID is a distinct submission attempt even when its title matches an existing paper.
- A provider refresh must never change `ignored` back to `pending` automatically.

## 8. Discovery Data Model

Account-card parsing may use an in-memory candidate before a durable provider ID is known:

```ts
interface AccountCardCandidate {
  sourceSystem: "snapp" | "editorial_manager" | "unknown";
  title: string | null;
  journal: string | null;
  rawStatus: string | null;
  lastUpdatedText: string | null;
  observedHref: string | null;
  cardIndex: number;
}
```

This candidate is not a durable submission identity and is not used for import deduplication.

Introduce a focused durable staging entity rather than overloading `SubmissionRecord`:

```ts
interface DiscoveredSubmission {
  id: number;
  providerFamily: "springer_nature";
  sourceSystem: "snapp" | "editorial_manager" | "unknown";
  providerSubmissionId: string;
  title: string;
  journal: string | null;
  manuscriptId: string | null;
  statusUrl: string;
  rawStatus: string | null;
  normalizedStatus: SubmissionStatus | null;
  progressStage: string | null;
  detailLabel: string | null;
  submittedDate: string | null;
  revisionDueDate: string | null;
  importState: "pending" | "imported" | "ignored";
  linkedSubmissionId: number | null;
  lastImportErrorCode: string | null;
  lastImportErrorMessage: string | null;
  discoveredAt: number;
  lastSeenAt: number;
  lastDetailFetchedAt: number | null;
}
```

`providerSubmissionId` is required before a record can become a durable staged identity. A generic Editorial Manager landing URL is insufficient.

Additional provider metadata is stored separately so that `SubmissionRecord` remains the core submission domain object.

## 9. Structured Provider Metadata

A compact provider metadata row stores safe structured signals that do not belong in the canonical `SubmissionRecord`:

```ts
interface SubmissionProviderMetadata {
  submissionId: number;
  providerFamily: "springer_nature";
  sourceSystem: "snapp" | "editorial_manager" | "unknown";
  providerSubmissionId: string;
  rawStatus: string | null;
  progressStage: string | null;
  detailLabel: string | null;
  submittedDate: string | null;
  revisionDueDate: string | null;
  editorFeedbackAvailable: boolean;
  reviewerFeedbackAvailable: boolean;
  explicitReviewerCount: number | null;
  updatedAt: number;
}
```

The feedback booleans represent only the presence of the observed feedback sections. Their text bodies are never persisted.

### 9.1 Authors

Store provider authors only when explicitly available from a reliable structured source:

```ts
interface SubmissionProviderAuthor {
  submissionId: number;
  position: number;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  corresponding: boolean | null;
}
```

Rules:

- Never infer authors from email addresses, manuscript text, filenames, or reviewer/editor text.
- Split first/last names only when the provider reliably supplies that structure.
- Existing Zotero item creators are never overwritten.
- For a newly created Zotero item, write provider authors to Zotero Creators when reliable author data exists.
- If no reliable authors are available, create the item with creators left empty and show that fact in the confirmation UI.

### 9.2 Editors

```ts
interface SubmissionProviderEditor {
  submissionId: number;
  name: string;
  role: string | null;
}
```

Only explicit structured editor identities are stored. The presence of an editor-feedback section does not establish an editor's identity.

### 9.3 Review progress

Review progress stores only structured signals that the page explicitly provides. Do not infer reviewer counts from pluralized labels such as `Reviewer(s)`.

Examples of allowed facts:

- review stage exists;
- reviewer invitation event occurred;
- reviewer acceptance event occurred;
- reviewer report event occurred;
- explicit reviewer count, only if the provider actually displays a number.

## 10. Provider History

History must retain repeated event types across multiple rounds.

```ts
interface SubmissionProviderHistoryEvent {
  id: number;
  submissionId: number;
  providerEventKey: string;
  rawLabel: string;
  normalizedType: string | null;
  eventDate: string | null;
  occurrence: number;
  detectedAt: number;
}
```

Deduplication key is derived from provider submission identity + exact normalized raw label + parsed date + occurrence among identical label/date events on the observed page. Repeated `Revision requested`, reviewer invitation, or reviewer-report events on different dates remain separate rows.

The earliest explicit `Submission received on <date>` event is the authoritative `submittedDate`. Scan time must never be substituted for submission date.

## 11. Status Representation

Springer state is deliberately represented in layers:

1. **Canonical status** — existing Submission Tracker domain state such as `under_review`, `accepted`, `rejected`, `major_revision`, `minor_revision`.
2. **Provider raw status** — exact headline such as `Action needed`.
3. **Provider progress stage** — observed stage such as `Peer review`.
4. **Provider detail label** — semantic detail such as `Revision requested`.

Unknown/ambiguous provider states do not force a canonical transition.

Specifically, `Action needed` plus revision-request language does **not** establish `major_revision` versus `minor_revision`. Until Springer provides explicit reliable evidence, canonical major/minor classification remains unchanged/null while the provider detail is stored as `Revision requested`.

## 12. Zotero Matching

### 12.1 Exact-title matching

Normalize both Springer and Zotero titles by deterministic text normalization only, including:

- Unicode normalization;
- trim leading/trailing whitespace;
- collapse internal whitespace;
- normalize typographic quotation/dash variants where semantically identical;
- case folding.

If the normalized titles are exactly equal, the confirmation UI may preselect the existing Zotero item.

### 12.2 Similar-title matching

Similarity may be used only to present candidate items. A similar but non-identical title must never be automatically linked.

The user must choose one of:

- use the suggested existing Zotero item;
- search/select another Zotero item;
- create a new Zotero item.

### 12.3 Submission identity versus paper identity

Title matching identifies the manuscript entity only. It must not identify a submission attempt.

Submission attempt identity priority:

1. `providerFamily + providerSubmissionId`;
2. explicit reliable manuscript ID as a secondary safety/mismatch check.

The same title can legitimately have multiple different submission records.

## 13. Zotero Item Creation and Protection

When the user confirms creation of a new item:

```text
itemType         = journalArticle
title            = Springer manuscript title
creators         = reliable Springer authors, if available
publicationTitle = reliable Springer journal, if available
date             = not populated from submission date
```

Submission date belongs to submission metadata, not Zotero's bibliographic publication `Date` field.

For an existing Zotero item, automatic import must not overwrite:

- title;
- creators;
- DOI;
- abstract;
- publication title;
- bibliographic date;
- other existing bibliographic fields.

Provider values remain in submission/provider metadata for comparison and display.

## 14. Import Confirmation UI

Add discovery controls to the existing Submission Tracker Dashboard rather than creating an unrelated top-level surface.

Header actions:

- **Scan Springer**
- **Pending imports N**
- existing/global status-sync action when implemented

The confirmation view presents each discovered manuscript as a card with available structured data:

- manuscript title as the primary heading;
- journal;
- manuscript ID;
- current raw/detail status;
- submitted date;
- revision due date;
- authors, if available;
- editors, if available;
- review progress, if available;
- provider history summary;
- source system as diagnostic metadata, not prominent user-facing branding;
- Zotero match decision.

Batch import defaults to one target library/collection. The target collection defaults to the existing remembered collection behavior. No automatic `Springer Imports` collection is created. A per-item override is allowed.

## 15. Import Semantics, Failure Recovery, and Idempotency

### 15.1 Batch behavior

A batch may partially succeed. Successful imports remain committed; failed entries remain `pending` with a retryable sanitized error stored in `lastImportErrorCode/lastImportErrorMessage`.

### 15.2 Single-record logical atomicity

A single import must appear atomic to the user even though Zotero item creation and add-on SQLite writes cannot be assumed to share one physical database transaction.

Use a staged/compensating sequence:

1. re-check provider mapping/idempotency;
2. resolve existing Zotero item or create a plugin-owned new item;
3. write the formal `SubmissionRecord` and provider metadata in an add-on DB transaction;
4. mark the discovery row `imported`, set `linkedSubmissionId`, and clear import error fields in that same add-on transaction;
5. if add-on persistence fails after creating a new plugin-owned Zotero item, perform compensating cleanup only when it is safe and still clearly plugin-owned/unmodified;
6. otherwise leave the discovery row pending with a recoverable error and never fabricate a completed mapping.

### 15.3 Idempotency

Before any import write, check `providerFamily + providerSubmissionId`.

If already linked, return `already_imported` and do not create another Zotero item or `SubmissionRecord`. Repeated clicks, retries, or restart recovery must converge on one mapping.

## 16. Privacy and Security

The feature may use the user's existing authenticated Springer browser session but must not persist authentication material.

Never persist or log:

- password;
- cookie values;
- authorization headers;
- tokens;
- local/session storage;
- email addresses;
- full authenticated page HTML;
- editor feedback body;
- reviewer feedback body;
- decision-letter body;
- submitted manuscript contents.

The parser may inspect authenticated page content transiently in memory to extract approved structured fields. Diagnostic fixtures must be redacted and minimal.

Authentication expiry results in an auth-required state and an explicit reconnect/open-login action. Background sync must not create intrusive login popups.

## 17. Error Handling

Discovery/import uses typed errors aligned with the existing sync subsystem where possible:

- `NO_NETWORK`
- `AUTH_REQUIRED`
- `ACCESS_DENIED`
- `PARSE_ERROR`
- `IDENTITY_MISMATCH`
- `SERVER_ERROR`
- `PROVIDER_UNSUPPORTED`

Additional discovery/import outcomes are domain outcomes rather than arbitrary thrown strings:

- `already_imported`
- `pending_user_match`
- `ignored`
- `import_failed`

Errors displayed to the user must be sanitized and must not include authenticated URLs containing provider IDs unless redacted.

## 18. Compatibility with Existing v0.7.0 Sync Work

This design extends, rather than replaces, the existing status-sync architecture:

- reuse the existing Zotero-hosted `SessionManager` transport after runtime session-reuse verification;
- reuse the unified Springer submission-details parser/adapter where appropriate;
- reuse status normalization and transition validation;
- reuse `SyncStore` for ongoing sync state/history after formal import;
- keep `lastCheckedAt` semantics separate from background discovery/sync attempts;
- retain the existing 6-hour status-sync schedule;
- add the 24-hour account-discovery schedule as a separate scheduler responsibility.

The account-discovery subsystem must not mutate `main`, create a release, bump `package.json`, tag v0.7.0, or merge Draft PR #12 without explicit authorization.

## 19. Testing Strategy

Implementation must follow TDD and use redacted fixtures.

Required test groups:

1. Account-page parser:
   - detects SNAPP and Editorial Manager source markers;
   - extracts only observed safe card fields;
   - emits ephemeral candidates before provider identity is resolved;
   - does not treat generic EM landing URLs as submission IDs.
2. Editorial Manager card-resolution runtime test:
   - activates one exact observed EM card in the Zotero-hosted browser;
   - waits for the observed final `submission-details/<id>` destination;
   - proves two different EM cards resolve independently when available;
   - persists neither the generic EM href nor title as permanent submission identity.
3. Details parser:
   - extracts title, journal, raw status, detail, due date, progress stages;
   - parses repeated dated history events;
   - preserves repeated event types;
   - records feedback-section presence without feedback text;
   - refuses to guess major/minor revision.
4. Privacy tests:
   - fixtures/log payloads contain no cookies, tokens, emails, full feedback bodies, or full HTML.
5. Title matcher:
   - exact normalized match auto-proposes an existing item;
   - similarity never auto-links.
6. Discovery lifecycle:
   - `pending/imported/ignored` transitions;
   - ignored records do not re-notify;
   - imported mapping is retained.
7. Import idempotency and recovery:
   - repeated import produces one mapping;
   - partial batch failure leaves successful entries committed;
   - failed entries retain sanitized retry state;
   - single-record failure does not silently leave a false imported state.
8. Zotero metadata protection:
   - existing creators/bibliographic fields are not overwritten;
   - new items use Springer title and reliable authors only.
9. Scheduling:
   - initial full scan is user-triggered;
   - automatic discovery is at most once per 24 hours;
   - imported status sync remains on the existing 6-hour cadence.
10. Runtime authenticated probe:

- verify Zotero's hosted browser can reuse the authenticated Springer session without exposing session material;
- verify observed account and details markers against the user's real runtime before release.

## 20. Success Criteria

The feature is complete when a user can:

1. log in to Springer Nature normally;
2. click **Scan Springer** in Submission Tracker;
3. discover all submissions exposed by the observed account UI without entering credentials into the add-on;
4. resolve each durable imported/staged submission to a unique final Springer provider ID rather than a generic Editorial Manager landing URL;
5. see new submissions in a pending-import confirmation view;
6. have normalized exact-title matches proposed automatically while similar titles remain manual decisions;
7. import selected submissions into existing Zotero items or create new `journalArticle` items titled from Springer;
8. preserve existing Zotero creators and bibliographic metadata;
9. retain structured Springer history and safe provider metadata without saving feedback bodies or authentication material;
10. avoid duplicate imports under retries/restarts;
11. have imported records continue through the automatic status-sync subsystem;
12. ignore selected discoveries without repeated notifications and restore them later if desired.

## 21. Explicit Evidence Boundary

The implementation is evidence-driven. At the time of this design, reliable observations exist for account card structure, source-system markers, a manually exercised Editorial Manager card redirect to the unified details surface, unified detail URLs, manuscript title, journal, current status, revision due text, progress stages, feedback-section presence, and dated history events.

The exact automated per-card Editorial Manager activation behavior inside Zotero's hosted browser is **not yet runtime-verified**. Reliable structured author fields, explicit editor identity fields, explicit reviewer counts, explicit major/minor revision labels, and pagination/load-more mechanics have also **not** yet been observed. Code must therefore represent those values as optional and leave them unset until a future redacted runtime observation establishes a safe parser/navigation rule. No speculative selector, endpoint, identifier, or inferred metadata is permitted.
