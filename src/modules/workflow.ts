import type { SubmissionStatus } from "../types";

export interface NextActionInput {
  status: SubmissionStatus;
  /** Days since the latest recorded status event. */
  quietDays: number;
  /** Days until the explicit follow-up date; negative means overdue. */
  followUpDays: number | null;
  /** Quiet-day threshold configured by the user. */
  quietThresholdDays: number;
}

export interface NextActionResult {
  messageKey: string;
  canInquire: boolean;
  urgent: boolean;
}

export interface InquiryEmailInput {
  journal: string;
  manuscriptId: string | null;
  quietDays: number;
}

export interface InquiryEmailContent {
  enSubject: string;
  enBody: string;
  zhSubject: string;
  zhBody: string;
}

/**
 * Pure workflow rules for the dashboard. Keeping this independent from Zotero
 * APIs makes the behavior deterministic and fast to unit-test.
 */
export function getNextAction(input: NextActionInput): NextActionResult {
  const followUpDue = input.followUpDays !== null && input.followUpDays <= 0;
  const quietThreshold = Math.max(1, input.quietThresholdDays || 30);
  const quietTooLong = input.quietDays >= quietThreshold;

  switch (input.status) {
    case "draft":
      return action("next-action-submit");

    case "submitted":
      if (followUpDue || quietTooLong) {
        return action("next-action-inquire-editor", true, true);
      }
      return action("next-action-wait-editor");

    case "with_editor":
      if (followUpDue || quietTooLong) {
        return action("next-action-inquire-editor", true, true);
      }
      return action("next-action-wait-editor");

    case "under_review":
      if (followUpDue || quietTooLong) {
        return action("next-action-inquire-review", true, true);
      }
      return action("next-action-wait-review");

    case "major_revision":
    case "minor_revision":
      if (followUpDue) {
        return action("next-action-revision-overdue", false, true);
      }
      return action("next-action-revise");

    case "accepted":
      return action("next-action-proof");

    case "rejected":
      return action("next-action-resubmit");

    case "withdrawn":
      return action("next-action-archive");
  }
}

function action(
  messageKey: string,
  canInquire = false,
  urgent = false,
): NextActionResult {
  return { messageKey, canInquire, urgent };
}

/**
 * Generate a bilingual, conservative status-inquiry template locally.
 * No network request or AI service is involved.
 */
export function buildInquiryEmailContent(
  input: InquiryEmailInput,
): InquiryEmailContent {
  const journal = input.journal.trim() || "the journal";
  const manuscriptId = input.manuscriptId?.trim() || "not provided";
  const quietDays = Math.max(0, Math.round(input.quietDays));

  const enSubject = `Status inquiry regarding manuscript ${manuscriptId}`;
  const enBody = [
    "Dear Editorial Office,",
    "",
    `I hope this message finds you well. I am writing to kindly inquire about the current status of our manuscript (Manuscript ID: ${manuscriptId}) submitted to ${journal}.`,
    quietDays > 0
      ? `According to my records, there has been no status update for approximately ${quietDays} days.`
      : "I would be grateful for any update you may be able to provide regarding its current progress.",
    "",
    "We fully understand that editorial assessment and peer review take time, and we sincerely appreciate the efforts of the editors and reviewers. When convenient, could you please let us know whether there has been any progress or whether any further information is required from our side?",
    "",
    "Thank you very much for your time and assistance.",
    "",
    "Kind regards,",
  ].join("\n");

  const zhSubject = `稿件 ${manuscriptId} 状态咨询`;
  const zhBody = [
    "尊敬的编辑部：",
    "",
    `您好！想礼貌咨询一下我们投稿至 ${journal} 的稿件（稿件编号：${manuscriptId}）目前的处理进展。`,
    quietDays > 0
      ? `根据我的记录，该稿件大约已有 ${quietDays} 天未出现新的状态更新。`
      : "如方便，烦请告知该稿件目前的处理状态。",
    "",
    "我们理解编辑处理和同行评审需要一定时间，也非常感谢编辑和审稿人的工作。如方便，烦请告知稿件是否已有新的进展，或是否需要我们补充任何材料。",
    "",
    "感谢您的时间与帮助！",
    "",
    "此致",
    "敬礼",
  ].join("\n");

  return { enSubject, enBody, zhSubject, zhBody };
}
