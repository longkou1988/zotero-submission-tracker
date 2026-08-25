# Submission Tracker for Zotero

Submission Tracker is a local-only Zotero 8–10 add-on that links library items to journal submissions, submission portals, usernames, manuscript IDs, status timelines, and explicit follow-up dates.

It is not a password manager. There is no password field, automatic login, portal scraping, telemetry, application-level background networking, or direct modification of `zotero.sqlite`. Zotero may retrieve the public update manifest to check for add-on updates.

## Features

- Create any number of submission records from a regular Zotero item.
- Reusable, archivable journal-system profiles with “open portal” and “copy username” actions.
- Eleven presets plus custom status events, with deterministic current-status calculation.
- Local-date overdue/today/next-seven-days reminders, search, filters, and attention-first sorting.
- Full validated JSON backup and replacement restore; Excel-friendly UTF-8 BOM CSV without usernames.
- Atomic JSON writes with a `.bak` fallback; data is retained when the add-on is disabled or removed.
- Simplified Chinese and English UI.

## Build and install

```sh
npm install
npm run check
```

Install `build/submission-tracker-0.1.15.xpi` from Zotero’s Add-ons Manager using “Install Add-on From File…”. See [the test guide](docs/TESTING.md) and [release checklist](release/RELEASE_CHECKLIST.md).

## Compatibility and release status

The manifest targets Zotero 8, 9, and 10. Version 0.1.15 parses dynamic dashboard and dialog markup in a standard HTML document before importing it into Zotero's privileged window, fixing missing controls such as the `#q` search input caused by an incorrect namespace. The dashboard still opens through the registered Zotero `chrome://` content package, and the regular-item context action still uses Zotero's formal menu API. Source, XPI, and update metadata are published at [longkou1988/zotero-submission-tracker](https://github.com/longkou1988/zotero-submission-tracker). This is a public prerelease, not a stable release, until the complete OS and Zotero-version acceptance matrix is finished.

See [Privacy](PRIVACY.md), [Known limitations](KNOWN_LIMITATIONS.md), and [Changelog](CHANGELOG.md).
