import { describe, expect, it } from "vitest";
import { TrackerService } from "../src/service";
import { DEFAULT_SETTINGS, type TrackerData } from "../src/core/types";
import { emptyData } from "../src/core/domain";

class MemoryStore {
  data: TrackerData = emptyData("test");
  async load() { return this.data; }
  async save(data: TrackerData) { this.data = structuredClone(data); }
  async loadSettings() { return DEFAULT_SETTINGS; }
}

describe("submission service", () => {
  it("allows multiple submissions for the same Zotero item and archives without deleting", async () => {
    const store = new MemoryStore();
    const service = new TrackerService(store as never);
    await service.init();
    const ref = { libraryType: "user" as const, itemKey: "ABCD1234", cachedTitle: "Paper" };
    const common = {
      zoteroItem: ref, manuscriptTitle: "Paper", journalName: "Journal", systemProfileId: null,
      manuscriptId: "", submissionDate: "2026-08-24", nextFollowUpDate: null, notes: "",
      initialStatusDate: "2026-08-24"
    };
    const first = await service.createSubmission(common);
    const second = await service.createSubmission({ ...common, journalName: "Journal B" });
    expect(service.data.submissions).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    await service.updateSubmission(first.id, { archived: true });
    expect(service.data.submissions.find(x => x.id === first.id)?.archived).toBe(true);
  });

  it("supports reusable and archived system profiles", async () => {
    const service = new TrackerService(new MemoryStore() as never);
    await service.init();
    const id = await service.saveProfile({
      displayName: "Journal — OJS", journalName: "Journal", platformName: "OJS",
      loginUrl: "https://example.test", username: "me", notes: "", archived: false
    });
    await service.archiveProfile(id);
    expect(service.data.systemProfiles[0]).toMatchObject({ id, archived: true });
  });
});
