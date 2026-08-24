import { dashboardRows } from "./domain";
import { TrackerData } from "./types";

const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function exportCSV(data: TrackerData, today?: string): string {
  const headers = ["投稿标题", "Zotero缓存标题", "期刊", "投稿平台", "投稿系统登录地址", "稿件编号", "投稿日期", "当前状态", "当前状态日期", "当前状态持续天数", "下一次跟进日期", "是否逾期", "备注"];
  const rows = dashboardRows(data, today).map(row => [
    row.manuscriptTitle, row.zoteroItem.cachedTitle, row.journalName, row.profile?.platformName ?? "",
    row.profile?.loginUrl ?? "", row.manuscriptId, row.submissionDate, row.currentStatus?.statusLabel ?? "",
    row.currentStatus?.effectiveDate ?? "", row.durationDays ?? "", row.nextFollowUpDate ?? "",
    row.followUp === "overdue" ? "是" : "否", row.notes
  ]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(quote).join(",")).join("\r\n");
}
