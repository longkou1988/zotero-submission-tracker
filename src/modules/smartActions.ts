import { config } from "../../package.json";
import { db } from "../db";
import { daysFromToday, type SubmissionRecord } from "../types";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { openInquiryAssistant } from "./inquiryAssistant";
import { getNextAction, type NextActionResult } from "./workflow";

export interface RecordActionContext {
  record: SubmissionRecord;
  action: NextActionResult;
  quietDays: number;
}

export async function getRecordActionContext(
  record: SubmissionRecord,
): Promise<RecordActionContext> {
  const events = await db.getEvents(record.id);
  const lastEvent = events[events.length - 1];
  const baseDate = lastEvent?.date || epochToDate(record.createdAt);
  const quietDays = Math.max(0, -daysFromToday(baseDate));
  const followUpDays = record.followUpDate
    ? daysFromToday(record.followUpDate)
    : null;
  const quietThresholdDays = Number(getPref("reminder.autoDays") ?? 30);

  return {
    record,
    quietDays,
    action: getNextAction({
      status: record.currentStatus,
      quietDays,
      followUpDays,
      quietThresholdDays,
    }),
  };
}

export async function showNextAction(record: SubmissionRecord): Promise<void> {
  const context = await getRecordActionContext(record);
  const text = getString(context.action.messageKey, {
    args: { days: context.quietDays },
  });

  new ztoolkit.ProgressWindow(getString("next-action-title"), {
    closeTime: 6500,
  })
    .createLine({
      text,
      type: context.action.urgent ? "failure" : "success",
    })
    .show();
}

export async function openInquiryIfRecommended(
  record: SubmissionRecord,
): Promise<void> {
  const context = await getRecordActionContext(record);
  if (!context.action.canInquire) {
    new ztoolkit.ProgressWindow(config.addonName, { closeTime: 4500 })
      .createLine({
        text: getString("inquiry-not-recommended"),
        type: "default",
      })
      .show();
    return;
  }
  openInquiryAssistant(record, context.quietDays);
}

function epochToDate(epochMs: number): string {
  const d = new Date(epochMs);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
