# v0.7.0 Springer Nature Auto-Sync Design

## Status

Approved in product discussion on 2026-09-02. This document is the implementation contract for the first automatic submission-status provider.

## Goal

Upgrade Submission Tracker from a manual journal-status recorder into an automatic status tracker for Springer Nature submissions hosted at `https://submission.springernature.com/submission-details/...`.

The user should normally only need to:

1. create or edit a submission record;
2. paste the Springer Nature submission-details URL;
3. sign in to Springer Nature through the Zotero-hosted browser when required.

After that, the plugin should reuse the authenticated web session, check eligible submissions while Zotero is open, normalize high-confidence provider statuses into the existing nine canonical statuses, and append timeline events only when a real canonical status transition occurs.

## Scope

### Included in v0.7.0

- Automatic provider recognition for `submission.springernature.com/submission-details/...` URLs.
- Automatic opt-in for recognized Springer Nature submissions.
- Per-submission pause/resume control.
- Reuse of a user-established Springer Nature browser session.
- No password storage in the plugin database.
- No automatic login popup when the session expires.
- Background sync while Zotero is open.
- Six-hour regular sync cadence.
- Sync-on-dashboard-open when the record is due, with a ten-minute freshness guard.
- Explicit manual "Sync now" action that bypasses freshness/cadence limits.
- Sequential syncing of multiple Springer submissions.
- Raw provider status preservation.
- Canonical status normalization.
- Legal-transition validation, including revision loops.
- Terminal-state protection.
- Unknown-status and identity-mismatch protection.
- Separate current sync state and meaningful sync history.
- Migration from v0.6.1 without destroying existing submission/event data.
- Chinese and English UI strings.

### Explicitly excluded from v0.7.0

- Gmail/email ingestion.
- ScholarOne support.
- Editorial Manager support.
- MDPI SuSy support.
- Frontiers support.
- Cloud accounts or a hosted backend.
- Background monitoring while Zotero is closed.
- AI-based status guessing.
- CAPTCHA bypass.
- MFA bypass.
- Password persistence.
- Automatic reconstruction of unseen historical stages.
- Multi-Springer-account management.
- User-configurable cron schedules.

## Existing Constraints

Submission Tracker already stores `statusUrl`, `manuscriptId`, and `lastCheckedAt` on each submission record. `lastCheckedAt` currently means the user opened the status page and must not be repurposed for automatic sync.

The existing `db.addEvent()` method appends a status event and changes `currentStatus`. Auto-sync must use the same canonical status-event path when a validated canonical transition occurs. It must not write duplicate events on every poll.

The current canonical statuses remain unchanged:

- `draft`
- `submitted`
- `with_editor`
- `under_review`
- `major_revision`
- `minor_revision`
- `accepted`
- `rejected`
- `withdrawn`

## Architecture

```text
StatusSyncScheduler
        |
        v
StatusSyncEngine
        |
        +-- SessionManager
        +-- ProviderRegistry
        |      |
        |      +-- SpringerNatureAdapter
        |
        +-- StatusNormalizer
        +-- TransitionValidator
        |
        v
SubmissionDB + SyncDB
```

### StatusSyncScheduler

Responsibilities:

- start after Zotero startup;
- wait 45 seconds before the first background due-check;
- run due checks on a six-hour cadence;
- support `syncIfDue()` for dashboard openings;
- apply a ten-minute freshness guard to dashboard-triggered checks;
- support forced manual sync;
- stop cleanly on plugin shutdown;
- never overlap two sync runs.

The scheduler does not know how a provider works. It only selects eligible submission IDs and invokes `StatusSyncEngine` sequentially.

### StatusSyncEngine

Responsibilities:

1. load the submission and its current sync state;
2. determine provider using `ProviderRegistry`;
3. skip disabled/paused records unless forced;
4. call the provider adapter;
5. validate identity when provider identity data are available;
6. normalize the raw status;
7. compare against prior raw/canonical status;
8. validate a canonical transition before calling `db.addEvent()`;
9. update current sync metadata;
10. append meaningful sync-history events;
11. return a typed result for UI refresh/notification.

Any network, auth, parsing, identity, unknown-status, or transition error must leave `SubmissionRecord.currentStatus` unchanged.

### ProviderRegistry

Provider recognition is URL-driven.

For v0.7.0, a record is automatically recognized as Springer Nature only when the URL:

- uses HTTPS;
- has hostname exactly `submission.springernature.com`;
- uses a pathname beginning with `/submission-details/`;
- contains a non-empty submission identifier after that prefix.

Recognized Springer Nature records default to auto-sync enabled.

Provider recognition must be implemented behind a generic provider interface so future adapters can be added without modifying scheduler/engine logic.

### SpringerNatureAdapter

Responsibilities:

- reuse the Springer Nature authenticated web session established by the user;
- fetch/inspect the specified submission-details page;
- prefer a stable JSON/internal API payload when available;
- fall back to DOM extraction when a stable API is not available;
- return raw provider values without directly changing Submission Tracker state;
- detect authentication redirects/session expiry;
- expose identity fields when available (manuscript ID, article title, journal);
- redact sensitive URL identifiers from logs.

Adapter output should be provider-neutral:

```ts
interface ProviderSnapshot {
  provider: "springer_nature";
  rawStatus: string;
  sourceStatusDate: string | null;
  manuscriptId: string | null;
  articleTitle: string | null;
  journal: string | null;
  detectedAt: number;
}
```

The adapter must never guess a canonical status.

## Session Design

### Security contract

Submission Tracker must not persist:

- Springer email address as a credential;
- Springer password;
- MFA/OTP codes;
- plaintext authentication cookies in its own SQLite tables;
- access tokens copied from the page into plugin storage.

The user authenticates through a Zotero-hosted browser. The sync implementation reuses that browser/cookie context where Zotero permits it.

The session layer must be isolated behind `SessionManager` because Zotero 7-9 and Zotero 10 differ in HTTP/cookie APIs. The rest of the sync system must not depend directly on a version-specific cookie API.

### Reauthentication behavior

When the provider indicates an expired or unauthenticated session:

- set `authState = "reauth_required"`;
- record a meaningful auth transition in sync history if the state changed;
- do not modify the canonical submission status;
- do not automatically open a login window;
- show an in-plugin "Springer Nature requires sign-in" state;
- open the sign-in/browser UI only when the user explicitly clicks reconnect.

While `authState = "reauth_required"`, automatic scheduler and dashboard-triggered runs skip that provider record. Only explicit reconnect/sign-in clears the block and permits a new sync attempt. Manual "Sync now" may report the auth-required state but must not open a login window by itself.

## Springer Probe Requirement

Implementation must not invent selectors or internal endpoints.

Before the production parser is considered complete, create a development-only Springer probe that can inspect the authenticated submission page and identify only status-relevant structures. The probe must:

- avoid persisting credentials;
- avoid logging full private submission URLs;
- avoid storing full page HTML by default;
- capture only the minimal API/DOM structure needed to build deterministic fixtures;
- produce a redacted fixture suitable for unit tests.

If no stable internal API can be identified, the adapter may use DOM parsing, but selectors must be based on observed Springer markup and covered by fixtures/tests.

## Status Model

### Raw status vs canonical status

Every successful provider check preserves the provider's exact raw status independently from the plugin's canonical status.

Example:

```text
rawStatus: Reviews completed
normalizedStatus: under_review
```

A raw-status change that maps to the same canonical status is meaningful sync information but must not append a canonical `StatusEvent`.

### Normalization

`StatusNormalizer` returns:

```ts
interface NormalizationResult {
  canonicalStatus: SubmissionStatus | null;
  confidence: "high" | "unknown";
  detailLabel: string | null;
}
```

Rules:

- high-confidence known states may be candidates for automatic canonical updates;
- detail/intermediate states can map to the same canonical stage;
- unknown/new Springer wording returns `canonicalStatus = null` and never changes the canonical state;
- no AI inference is used.

Known high-confidence mappings should be fixture-driven and intentionally conservative.

## Transition Validation

Automatic updates are governed by a state machine, not simple numeric ordering.

Examples of expected legal transitions include:

- `submitted -> with_editor`
- `submitted -> under_review`
- `with_editor -> under_review`
- `under_review -> major_revision`
- `under_review -> minor_revision`
- `major_revision -> with_editor`
- `major_revision -> under_review`
- `minor_revision -> with_editor`
- `minor_revision -> under_review`
- `under_review -> accepted`
- `under_review -> rejected`
- reasonable direct provider skips such as `with_editor -> major_revision` when an intermediate status was never observed.

Revision loops are explicitly legal. A later-round `major_revision -> under_review` is not treated as a backward error.

### Terminal-state protection

`accepted`, `rejected`, and `withdrawn` are protected terminal states for automatic sync.

Once the local canonical state is terminal, an adapter result that implies a different canonical state must not overwrite it automatically. Instead record a `STATUS_CONFLICT` and require user confirmation.

### No invented history

If the previous observed state is `with_editor` and the next observed state is `major_revision`, the plugin must not fabricate an `under_review` event or an invented date.

Only statuses actually observed or manually entered are written to the timeline.

## Identity Validation

Provider identity data are supplementary safeguards.

Rules:

- if local `manuscriptId` is empty and the provider returns a clear manuscript ID, auto-fill it;
- if local and provider manuscript IDs are both non-empty and differ, stop and return `IDENTITY_MISMATCH`;
- do not automatically overwrite an existing manuscript ID;
- title/journal mismatches may be advisory in v0.7.0 unless the parser can provide deterministic identity guarantees;
- identity failure must never change canonical status.

## Persistence

### Existing submission/event tables

Keep the existing schema and semantics for canonical submission state and canonical status events.

Do not reuse `lastCheckedAt` for automatic sync.

### New current-state table

Create `submissiontrackerSyncState` with one row per submission/provider.

Required logical fields:

```text
submissionId
provider
enabled
rawStatus
normalizedStatus
confidence
authState
lastAttemptAt
lastSuccessAt
lastRawChangeAt
lastErrorCode
lastErrorMessage
createdAt
updatedAt
```

`enabled` defaults true for newly recognized Springer Nature records and can be toggled per submission.

### New history table

Create `submissiontrackerSyncHistory` for meaningful provider-sync events.

Required logical fields:

```text
id
submissionId
provider
eventType
rawStatus
normalizedStatus
sourceStatusDate
detectedAt
note
createdAt
```

Initial event types:

- `RAW_STATUS_CHANGED`
- `CANONICAL_STATUS_CHANGED`
- `AUTH_REQUIRED`
- `AUTH_RECOVERED`
- `UNKNOWN_STATUS`
- `IDENTITY_MISMATCH`
- `STATUS_CONFLICT`
- `PARSE_ERROR`
- `SYNC_ERROR`
- `SYNC_RECOVERED`

Routine successful polls with no meaningful change must update `lastSuccessAt` only and must not append history rows.

### Migration

Migration must be additive and idempotent.

v0.6.1 users must retain all existing submission records, status events, notes, URLs, manuscript IDs, follow-up dates, analytics data, and collection behavior.

No canonical history is rewritten during migration.

## Scheduling and Eligibility

### Global setting

Add a global "Automatic status sync" preference, enabled by default.

The six-hour interval is fixed for v0.7.0.

### Per-submission setting

Springer Nature records are auto-enabled when their valid provider URL is saved. The user can pause/resume a single submission.

### Startup

After plugin startup, wait 45 seconds, then evaluate due records.

### Regular checks

For a record that has never been attempted, the record is due immediately after the startup delay. Otherwise, regular automatic sync is due when `now - lastAttemptAt >= 6 hours`.

A failed transient attempt therefore does not cause an immediate retry loop. It is retried on the next six-hour due window unless the user explicitly invokes "Sync now".

Records in `reauth_required` are not automatically retried until reconnect succeeds.

### Dashboard-triggered checks

Opening either the Submission Dashboard or Submission Analytics invokes `syncIfDue()` asynchronously after local UI rendering begins.

Dashboard freshness is based on `lastAttemptAt`: if a provider record was attempted within the previous ten minutes, dashboard opening does not retry it, regardless of success/failure. A record older than ten minutes is still only synced when it is otherwise due under the six-hour rule; the dashboard trigger is not a six-hour bypass.

### Manual sync

"Sync now" bypasses the ten-minute freshness guard and six-hour due calculation, but still respects the single-flight lock and authentication safety rules. It never launches a login window automatically.

### Multiple records

Sync eligible Springer submissions sequentially. Do not issue a parallel burst of authenticated requests.

## Error Handling

Typed error codes:

- `NO_NETWORK`
- `AUTH_REQUIRED`
- `ACCESS_DENIED`
- `UNKNOWN_STATUS`
- `PARSE_ERROR`
- `IDENTITY_MISMATCH`
- `TRANSITION_CONFLICT`
- `SERVER_ERROR`
- `PROVIDER_UNSUPPORTED`

Error rules:

- never modify canonical status on an error;
- retain the previous successful raw/canonical sync state;
- update `lastAttemptAt` and error metadata;
- append history only when an error condition meaningfully changes;
- record recovery when a previously persistent error clears;
- avoid logging private full URLs or credentials.

Guiding principle: prefer a missed update over a wrong update.

## UI

### Add/Edit Submission

When a valid Springer Nature submission-details URL is entered:

```text
✓ Springer Nature detected
Automatic status sync will be enabled
```

No provider dropdown is required.

### Submission detail

Add an "Automatic status sync" section showing:

- provider: Springer Nature;
- enabled/paused state;
- connection/auth state;
- canonical submission status;
- raw Springer status;
- last successful sync;
- next approximate check;
- last error when relevant.

Actions:

- Sync now;
- Open submission system;
- Pause auto-sync / Resume auto-sync;
- Reconnect Springer Nature when auth is required.

### Dashboard

Add a lightweight sync summary, for example:

```text
Automatic sync · Springer Nature · 5 submissions
4 OK · 1 sign-in required
Last sync: 16:42
[Sync all]
```

The summary must not dominate the existing submission-management UI.

### Analytics Dashboard

Opening analytics may trigger `syncIfDue()`, but analytics rendering must not block while network sync runs. Render current local data first; refresh when sync writes changes.

## Notifications

v0.7.0 may show an in-Zotero notification when a canonical status changes automatically, but repeated unchanged polls must be silent.

Authentication-required states should be visible in plugin UI and should not repeatedly interrupt the user.

## Privacy and Logging

- All status processing remains local to Zotero.
- No OpenAI/Claude/third-party AI calls.
- No plugin-operated cloud backend.
- No email ingestion.
- No credential persistence.
- Do not log full submission-details UUIDs in normal logs.
- Do not store complete Springer HTML responses by default.
- Redacted development fixtures must not contain the user's private submission identifiers or personally identifying manuscript data.

## Testing Strategy

Development follows TDD for deterministic logic.

Required automated coverage includes:

1. Springer Nature URL recognition.
2. Non-Springer URL rejection.
3. Default auto-enable behavior.
4. Per-record pause/resume.
5. Six-hour due calculation.
6. Ten-minute dashboard freshness guard.
7. Forced manual sync.
8. Single-flight/duplicate-run protection.
9. Same raw status -> no history/event duplication.
10. Changed raw status with same canonical state -> sync history only.
11. Known canonical change + legal transition -> `db.addEvent()` exactly once.
12. Revision -> under-review loop is legal.
13. Terminal-state overwrite is blocked.
14. Unknown raw status does not change canonical status.
15. Identity mismatch does not change canonical status.
16. Session expiry does not change canonical status.
17. Duplicate polling does not duplicate status events.
18. v0.6.1 database migration is additive/idempotent.
19. Global disable prevents scheduler requests.
20. `reauth_required` suppresses automatic retries until reconnect.
21. Provider parser fixtures reproduce observed Springer status structures.

The provider parser should be tested against redacted fixtures captured from the Springer probe, not against guessed HTML.

## Implementation Sequence

1. Commit this design document on `feature/v0.7.0-springer-auto-sync`.
2. Create an implementation plan before production code changes.
3. Build pure provider recognition, normalization, and transition rules using TDD.
4. Add sync persistence using additive migrations and tests.
5. Build the sync engine and scheduling logic using mocked adapters.
6. Build the development-only Springer probe and obtain a redacted real fixture.
7. Implement the Springer Nature adapter against the observed fixture/API structure.
8. Implement version-isolated SessionManager behavior.
9. Add detail/dashboard/preferences UI.
10. Add startup/shutdown hooks and dashboard-triggered sync.
11. Run unit, lint, and build verification.
12. Open a feature PR for review.

No merge to `main`, version bump, tag, or GitHub Release is part of this implementation authorization. Those actions require separate explicit approval.
