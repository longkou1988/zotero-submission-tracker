import type { SubmissionTrackerBackup } from "../src/core/types";

export const stamp = "2026-08-24T10:00:00+08:00";

export function fixture(): SubmissionTrackerBackup {
  return {
    schemaVersion: 1,
    exportedAt: stamp,
    pluginVersion: "0.1.0",
    systemProfiles: [{
      id: "profile-1", displayName: "Journal A — ScholarOne", journalName: "Journal A",
      platformName: "ScholarOne", loginUrl: "https://example.test/login", username: "author@example.test",
      notes: "", archived: false, createdAt: stamp, updatedAt: stamp
    }],
    submissions: [{
      id: "submission-1",
      zoteroItem: { libraryType: "user", itemKey: "ABCD1234", cachedTitle: "Zotero title" },
      manuscriptTitle: "Manuscript, with \"quotes\"\nand a newline", journalName: "Journal A",
      systemProfileId: "profile-1", manuscriptId: "MS-001", submissionDate: "2026-08-01",
      nextFollowUpDate: "2026-08-23", notes: "line 1\nline 2", archived: false,
      createdAt: stamp, updatedAt: stamp
    }],
    statusEvents: [{
      id: "event-1", submissionId: "submission-1", effectiveDate: "2026-08-01",
      statusType: "preset", statusCode: "submitted", statusLabel: "已投稿", notes: "",
      createdAt: stamp, updatedAt: stamp
    }]
  };
}
