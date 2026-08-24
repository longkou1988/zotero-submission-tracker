# Changelog

## 0.1.5 — 2026-08-24

- Pass Zotero's privileged runtime objects explicitly into the ESM bundle, fixing startup on Zotero 10 where those objects are not module globals.
- Give both menu entries direct Chinese/English fallback labels so a localization problem cannot leave them blank or invisible.
- Add startup and menu-registration regression tests for the Zotero 10 runtime boundary.

## 0.1.4 — 2026-08-24

- Remove an obsolete localization-registration call that is unavailable in Zotero 10.
- Keep Fluent resources discoverable through the standard plugin locale layout.

## 0.1.3 — 2026-08-24

- Define Fluent `.label` attributes required by `Zotero.MenuManager`, restoring the Tools and item-context menu entries.
- Add automated checks that reject incorrectly structured menu-localization messages.
- Increment the release version so Zotero replaces cached or previously installed 0.1.2 packages.

## 0.1.2 — 2026-08-24

- Restore the `applications.zotero` manifest section expected by Zotero 10's validator.
- Add the validator-required `update_url` field and widen the tested Zotero 10 range to `10.*`.
- Make the build reject manifests that omit any Zotero-required compatibility field.
- Publish the production GitHub update manifest and release download URL.

## 0.1.1 — 2026-08-24

- Use `browser_specific_settings.zotero` in the install manifest for Zotero 10.
- Derive the XPI filename from the package version and fail builds when package and manifest versions disagree.

## 0.1.0 — 2026-08-24

- Initial release candidate for Zotero 8, 9, and 10.
- Added submission dashboard, reusable system profiles, status timelines, local follow-up reminders, Zotero item links, JSON backup/restore, CSV export, settings, and bilingual UI.
- Added atomic local persistence, backup validation, security boundary tests, build automation, and a cross-platform release checklist.
