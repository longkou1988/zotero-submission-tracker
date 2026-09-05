import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExactStatus } from "../src/modules/statusSync/normalizer.ts";
import {
  canAutoTransition,
  isTerminalStatus,
} from "../src/modules/statusSync/transitionValidator.ts";

const mapping = {
  "Under Review": { canonicalStatus: "under_review" },
  "Reviews completed": {
    canonicalStatus: "under_review",
    detailLabel: "reviews_completed",
  },
  "Major Revision": { canonicalStatus: "major_revision" },
};

test("normalization is exact and conservative", () => {
  assert.deepEqual(normalizeExactStatus("Under Review", mapping), {
    canonicalStatus: "under_review",
    confidence: "high",
    detailLabel: null,
  });
  assert.deepEqual(normalizeExactStatus("Reviews completed", mapping), {
    canonicalStatus: "under_review",
    confidence: "high",
    detailLabel: "reviews_completed",
  });
  assert.deepEqual(
    normalizeExactStatus("Editor evaluating recommendation", mapping),
    {
      canonicalStatus: null,
      confidence: "unknown",
      detailLabel: null,
    },
  );
  assert.equal(
    normalizeExactStatus(" under review ", mapping).canonicalStatus,
    null,
  );
});

test("revision loops are legal", () => {
  assert.equal(canAutoTransition("major_revision", "under_review"), true);
  assert.equal(canAutoTransition("major_revision", "with_editor"), true);
  assert.equal(canAutoTransition("minor_revision", "under_review"), true);
  assert.equal(canAutoTransition("minor_revision", "with_editor"), true);
});

test("reasonable provider skips are legal without inventing history", () => {
  assert.equal(canAutoTransition("submitted", "under_review"), true);
  assert.equal(canAutoTransition("with_editor", "major_revision"), true);
  assert.equal(canAutoTransition("with_editor", "minor_revision"), true);
  assert.equal(canAutoTransition("with_editor", "accepted"), true);
  assert.equal(canAutoTransition("with_editor", "rejected"), true);
});

test("same canonical state is a legal no-op", () => {
  assert.equal(canAutoTransition("under_review", "under_review"), true);
});

test("terminal status cannot be overwritten automatically", () => {
  for (const status of ["accepted", "rejected", "withdrawn"]) {
    assert.equal(isTerminalStatus(status), true);
  }
  assert.equal(canAutoTransition("accepted", "under_review"), false);
  assert.equal(canAutoTransition("rejected", "with_editor"), false);
  assert.equal(canAutoTransition("withdrawn", "under_review"), false);
});
