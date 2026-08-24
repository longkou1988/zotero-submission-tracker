import { describe, expect, it } from "vitest";
import { currentStatus, dashboardRows, removeStatusEvent, statusDuration, timeline } from "../src/core/domain";
import { followUpBucket } from "../src/core/date";
import { fixture } from "./fixtures";

describe("status timeline", () => {
  it("chooses the latest effective date, then the latest creation time", () => {
    const data = fixture();
    const base = data.statusEvents[0];
    const events = [
      base,
      { ...base, id: "older-history", effectiveDate: "2026-07-01", createdAt: "2026-08-24T12:00:00+08:00" },
      { ...base, id: "same-date-later", statusLabel: "编辑处理中", effectiveDate: "2026-08-01", createdAt: "2026-08-25T12:00:00+08:00" }
    ];
    expect(currentStatus(events)?.id).toBe("same-date-later");
    expect(timeline(events).map(x => x.id)).toEqual(["older-history", "event-1", "same-date-later"]);
  });

  it("prevents deleting the only event and recalculates after a valid deletion", () => {
    const data = fixture();
    expect(() => removeStatusEvent(data, "event-1")).toThrow(/at least one/i);
    const second = { ...data.statusEvents[0], id: "event-2", effectiveDate: "2026-08-10" };
    const changed = removeStatusEvent({ ...data, statusEvents: [...data.statusEvents, second] }, "event-2");
    expect(currentStatus(changed.statusEvents)?.id).toBe("event-1");
  });
});

describe("local-date follow-up calculations", () => {
  it("classifies overdue, today, next seven days, later and missing dates", () => {
    expect(followUpBucket("2026-08-23", "2026-08-24")).toBe("overdue");
    expect(followUpBucket("2026-08-24", "2026-08-24")).toBe("today");
    expect(followUpBucket("2026-08-31", "2026-08-24")).toBe("soon");
    expect(followUpBucket("2026-09-01", "2026-08-24")).toBe("later");
    expect(followUpBucket(null, "2026-08-24")).toBe("none");
    expect(statusDuration(fixture().statusEvents[0], "2026-08-24")).toBe(23);
  });

  it("sorts attention-needed records first", () => {
    const data = fixture();
    const copy = { ...data.submissions[0], id: "submission-2", nextFollowUpDate: null, updatedAt: "2026-08-25T10:00:00+08:00" };
    const event = { ...data.statusEvents[0], id: "event-2", submissionId: "submission-2" };
    expect(dashboardRows({ ...data, submissions: [...data.submissions, copy], statusEvents: [...data.statusEvents, event] }, "2026-08-24").map(x => x.id))
      .toEqual(["submission-1", "submission-2"]);
  });
});
