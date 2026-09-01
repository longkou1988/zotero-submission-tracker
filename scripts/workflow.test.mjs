import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInquiryEmailContent,
  getNextAction,
} from "../src/modules/workflow.ts";

test("under review becomes inquiry-worthy after the quiet threshold", () => {
  const action = getNextAction({
    status: "under_review",
    quietDays: 45,
    followUpDays: null,
    quietThresholdDays: 30,
  });

  assert.equal(action.messageKey, "next-action-inquire-review");
  assert.equal(action.canInquire, true);
  assert.equal(action.urgent, true);
});

test("under review stays in wait mode before the quiet threshold", () => {
  const action = getNextAction({
    status: "under_review",
    quietDays: 12,
    followUpDays: null,
    quietThresholdDays: 30,
  });

  assert.equal(action.messageKey, "next-action-wait-review");
  assert.equal(action.canInquire, false);
  assert.equal(action.urgent, false);
});

test("overdue revision follow-up prioritizes revision rather than inquiry", () => {
  const action = getNextAction({
    status: "major_revision",
    quietDays: 8,
    followUpDays: -2,
    quietThresholdDays: 30,
  });

  assert.equal(action.messageKey, "next-action-revision-overdue");
  assert.equal(action.canInquire, false);
  assert.equal(action.urgent, true);
});

test("accepted manuscripts move to proof and publication follow-up", () => {
  const action = getNextAction({
    status: "accepted",
    quietDays: 0,
    followUpDays: null,
    quietThresholdDays: 30,
  });

  assert.equal(action.messageKey, "next-action-proof");
  assert.equal(action.canInquire, false);
});

test("inquiry email includes journal, manuscript ID and quiet duration", () => {
  const mail = buildInquiryEmailContent({
    journal: "Computers in Human Behavior",
    manuscriptId: "CHB-2026-1234",
    quietDays: 45,
  });

  assert.match(mail.enSubject, /CHB-2026-1234/);
  assert.match(mail.enBody, /Computers in Human Behavior/);
  assert.match(mail.enBody, /45 days/);
  assert.match(mail.zhBody, /45 天/);
});
