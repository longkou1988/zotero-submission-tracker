import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSubmissionAnalytics,
  filterVisibleSubmissionRecords,
  getJournalBarWidths,
  getOutcomeChartSegments,
} from "../src/modules/analytics.ts";

function record(id, journal, currentStatus, createdAt = Date.UTC(2026, 0, 1)) {
  return {
    id,
    libraryID: 1,
    itemKey: `ITEM${id}`,
    journal,
    currentStatus,
    followUpDate: null,
    notes: "",
    statusUrl: null,
    manuscriptId: null,
    lastCheckedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function event(id, submissionId, status, date) {
  return { id, submissionId, status, date, note: "", createdAt: 0 };
}

test("analytics counts outcomes and excludes unfinished submissions from outcome rates", () => {
  const analytics = computeSubmissionAnalytics([
    { record: record(1, "Journal A", "accepted"), events: [] },
    { record: record(2, "Journal B", "rejected"), events: [] },
    { record: record(3, "Journal C", "under_review"), events: [] },
    { record: record(4, "Journal D", "withdrawn"), events: [] },
  ]);

  assert.equal(analytics.total, 4);
  assert.equal(analytics.active, 1);
  assert.equal(analytics.accepted, 1);
  assert.equal(analytics.rejected, 1);
  assert.equal(analytics.withdrawn, 1);
  assert.equal(analytics.acceptanceRate, 50);
  assert.equal(analytics.rejectionRate, 50);
});

test("trashed or missing Zotero items are excluded from analytics records", () => {
  const records = [
    record(1, "Nature", "under_review"),
    record(2, "Journal A", "accepted"),
    record(3, "Journal B", "rejected"),
  ];
  const visible = filterVisibleSubmissionRecords(records, (_libraryID, itemKey) => {
    if (itemKey === "ITEM1") return { deleted: true };
    if (itemKey === "ITEM2") return { deleted: false };
    return undefined;
  });

  assert.deepEqual(
    visible.map((item) => item.journal),
    ["Journal A"],
  );
});

test("average first decision time uses submitted date and first decision event", () => {
  const analytics = computeSubmissionAnalytics([
    {
      record: record(1, "Journal A", "major_revision"),
      events: [
        event(1, 1, "submitted", "2026-01-01"),
        event(2, 1, "under_review", "2026-01-08"),
        event(3, 1, "major_revision", "2026-02-10"),
        event(4, 1, "accepted", "2026-03-10"),
      ],
    },
    {
      record: record(2, "Journal B", "rejected"),
      events: [
        event(5, 2, "with_editor", "2026-03-01"),
        event(6, 2, "rejected", "2026-03-21"),
      ],
    },
  ]);

  assert.equal(analytics.averageFirstDecisionDays, 30);
  assert.equal(analytics.firstDecisionSampleSize, 2);
});

test("yearly trend uses submitted year when available", () => {
  const analytics = computeSubmissionAnalytics([
    {
      record: record(1, "Journal A", "accepted", Date.UTC(2025, 11, 20)),
      events: [
        event(1, 1, "draft", "2025-12-20"),
        event(2, 1, "submitted", "2026-01-03"),
        event(3, 1, "accepted", "2026-02-01"),
      ],
    },
    {
      record: record(2, "Journal B", "under_review", Date.UTC(2025, 5, 1)),
      events: [event(4, 2, "submitted", "2025-06-01")],
    },
  ]);

  assert.deepEqual(analytics.yearlyTrend, [
    { year: 2025, count: 1 },
    { year: 2026, count: 1 },
  ]);
});

test("journal performance aggregates attempts, outcomes, and decision time", () => {
  const analytics = computeSubmissionAnalytics([
    {
      record: record(1, "Journal A", "accepted"),
      events: [
        event(1, 1, "submitted", "2026-01-01"),
        event(2, 1, "accepted", "2026-01-31"),
      ],
    },
    {
      record: record(2, "Journal A", "rejected"),
      events: [
        event(3, 2, "submitted", "2026-02-01"),
        event(4, 2, "rejected", "2026-04-02"),
      ],
    },
    {
      record: record(3, "Journal B", "under_review"),
      events: [event(5, 3, "submitted", "2026-05-01")],
    },
  ]);

  assert.deepEqual(analytics.journals, [
    {
      journal: "Journal A",
      submissions: 2,
      accepted: 1,
      rejected: 1,
      averageFirstDecisionDays: 45,
    },
    {
      journal: "Journal B",
      submissions: 1,
      accepted: 0,
      rejected: 0,
      averageFirstDecisionDays: null,
    },
  ]);
});

test("outcome chart segments expose count, share, and cumulative positions", () => {
  const segments = getOutcomeChartSegments({
    total: 10,
    active: 5,
    accepted: 3,
    rejected: 2,
    withdrawn: 0,
  });

  assert.deepEqual(segments, [
    { key: "active", count: 5, percent: 50, startPercent: 0, endPercent: 50 },
    { key: "accepted", count: 3, percent: 30, startPercent: 50, endPercent: 80 },
    { key: "rejected", count: 2, percent: 20, startPercent: 80, endPercent: 100 },
    { key: "withdrawn", count: 0, percent: 0, startPercent: 100, endPercent: 100 },
  ]);
});

test("journal bar widths are scaled to the busiest journal", () => {
  const widths = getJournalBarWidths([
    { journal: "Journal A", submissions: 5 },
    { journal: "Journal B", submissions: 2 },
    { journal: "Journal C", submissions: 1 },
  ]);

  assert.deepEqual(widths, [100, 40, 20]);
});
