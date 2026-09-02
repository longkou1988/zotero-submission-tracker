import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_FRESHNESS_MS,
  SYNC_INTERVAL_MS,
  isDashboardSyncDue,
  isRegularSyncDue,
} from "../src/modules/statusSync/schedule.ts";
import { StatusSyncScheduler } from "../src/modules/statusSync/scheduler.ts";

const now = 2_000_000_000_000;

test("never-attempted records are due", () => {
  assert.equal(isRegularSyncDue(null, now), true);
  assert.equal(isDashboardSyncDue(null, now), true);
});

test("regular sync uses lastAttemptAt plus six hours", () => {
  assert.equal(isRegularSyncDue(now - SYNC_INTERVAL_MS + 1, now), false);
  assert.equal(isRegularSyncDue(now - SYNC_INTERVAL_MS, now), true);
});

test("dashboard never bypasses the six-hour due rule", () => {
  assert.equal(
    isDashboardSyncDue(now - DASHBOARD_FRESHNESS_MS - 1, now),
    false,
  );
  assert.equal(isDashboardSyncDue(now - SYNC_INTERVAL_MS, now), true);
});

test("scheduler processes records sequentially", async () => {
  const order = [];
  const scheduler = new StatusSyncScheduler({
    listEligibleSubmissionIds: async () => [1, 2, 3],
    syncOne: async (id) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      order.push(`end:${id}`);
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  });

  await scheduler.syncAllNow();

  assert.deepEqual(order, [
    "start:1",
    "end:1",
    "start:2",
    "end:2",
    "start:3",
    "end:3",
  ]);
});

test("overlapping triggers share one single-flight queue", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const calls = [];
  const scheduler = new StatusSyncScheduler({
    listEligibleSubmissionIds: async () => [7],
    syncOne: async (id) => {
      calls.push(id);
      await firstGate;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  });

  const first = scheduler.syncAllNow();
  const second = scheduler.syncAllNow();
  await Promise.resolve();
  assert.deepEqual(calls, [7]);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [7]);
});
