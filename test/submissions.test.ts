import { assert } from "chai";
import { config } from "../package.json";

const api = Zotero[config.addonInstance].api;
const TABLE = "submissiontrackerSubmissions";

describe("submission-tracker", function () {
  let item: Zotero.Item;

  before(async function () {
    item = new Zotero.Item("journalArticle");
    item.setField("title", "ST Functional Test Article");
    item.setField("publicationTitle", "Test Journal of Testing");
    await item.saveTx();
  });

  after(async function () {
    if (item) {
      await item.eraseTx();
    }
  });

  it("plugin instance is initialized", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
    assert.isTrue(Zotero[config.addonInstance].data.initialized);
  });

  it("created its database tables", async function () {
    assert.isTrue(await Zotero.DB.tableExists(TABLE));
    assert.isTrue(await Zotero.DB.tableExists("submissiontrackerEvents"));
  });

  it("creates a submission with an initial event", async function () {
    const record = await api.db.create({
      libraryID: item.libraryID,
      itemKey: item.key,
      journal: "Nature",
      status: "submitted",
      date: "2026-08-01",
      followUpDate: "2026-09-15",
      notes: "test notes",
    });
    assert.isAbove(record.id, 0);
    const events = api.db.getEvents(record.id);
    assert.lengthOf(events, 1);
    assert.equal(events[0].status, "submitted");
    assert.equal(events[0].date, "2026-08-01");
  });

  it("reads the latest record for an item", function () {
    const latest = api.db.getLatestForItem(item.libraryID, item.key);
    assert.isDefined(latest);
    assert.equal(latest!.journal, "Nature");
    assert.equal(latest!.currentStatus, "submitted");
  });

  it("appends status events and moves current status", async function () {
    const record = api.db.getLatestForItem(item.libraryID, item.key)!;
    await api.db.addEvent(record.id, "under_review", "2026-08-10");
    await api.db.addEvent(
      record.id,
      "major_revision",
      "2026-08-20",
      "please revise",
    );
    const fresh = api.db.getSubmission(record.id)!;
    assert.equal(fresh.currentStatus, "major_revision");
    const events = api.db.getEvents(record.id);
    assert.lengthOf(events, 3);
    assert.equal(events[2].status, "major_revision");
    assert.equal(events[2].note, "please revise");
  });

  it("updates submission fields", async function () {
    const record = api.db.getLatestForItem(item.libraryID, item.key)!;
    await api.db.updateSubmission(record.id, {
      journal: "Science",
      followUpDate: null,
      notes: "resubmitted to Science",
      currentStatus: record.currentStatus,
    });
    const fresh = api.db.getSubmission(record.id)!;
    assert.equal(fresh.journal, "Science");
    assert.isNull(fresh.followUpDate);
    assert.equal(fresh.notes, "resubmitted to Science");
    // updateSubmission must not alter the status
    assert.equal(fresh.currentStatus, "major_revision");
  });

  it("lists distinct journals for autocomplete", async function () {
    const journals = api.db.distinctJournals();
    assert.include(journals, "Science");
  });

  it("exports a valid JSON backup", async function () {
    const json = await api.db.exportJSON();
    const parsed = JSON.parse(json);
    assert.equal(parsed.format, "submission-tracker-v1");
    assert.isArray(parsed.submissions);
    assert.isArray(parsed.events);
  });

  it("deletes a submission with its events", async function () {
    const record = api.db.getLatestForItem(item.libraryID, item.key)!;
    await api.db.deleteSubmission(record.id);
    assert.isUndefined(api.db.getSubmission(record.id));
    assert.lengthOf(api.db.getEvents(record.id), 0);
  });

  it("drops records when their item is deleted", async function () {
    const record = await api.db.create({
      libraryID: item.libraryID,
      itemKey: item.key,
      journal: "Cell",
      status: "draft",
      date: "2026-08-29",
    });
    await api.db.deleteForItems([
      { libraryID: item.libraryID, itemKey: item.key },
    ]);
    assert.isUndefined(api.db.getSubmission(record.id));
    assert.lengthOf(api.db.getForItem(item.libraryID, item.key), 0);
  });
});
