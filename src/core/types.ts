export const SCHEMA_VERSION = 1 as const;

export type ZoteroItemRef = {
  libraryType: "user" | "group";
  groupID?: number;
  itemKey: string;
  cachedTitle: string;
};

export type SystemProfile = {
  id: string;
  displayName: string;
  journalName: string;
  platformName: string;
  loginUrl: string;
  username: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Submission = {
  id: string;
  zoteroItem: ZoteroItemRef;
  manuscriptTitle: string;
  journalName: string;
  systemProfileId: string | null;
  manuscriptId: string;
  submissionDate: string;
  nextFollowUpDate: string | null;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StatusEvent = {
  id: string;
  submissionId: string;
  effectiveDate: string;
  statusType: "preset" | "custom";
  statusCode: string | null;
  statusLabel: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionTrackerBackup = {
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  pluginVersion: string;
  systemProfiles: SystemProfile[];
  submissions: Submission[];
  statusEvents: StatusEvent[];
};

export type TrackerData = Omit<SubmissionTrackerBackup, "exportedAt"> & { exportedAt?: string };

export type Settings = {
  language: "auto" | "zh-CN" | "en-US";
  copyUsernameOnOpen: boolean;
};

export const DEFAULT_SETTINGS: Settings = { language: "auto", copyUsernameOnOpen: false };

export const PRESET_STATUSES = [
  ["submitted", "已投稿", "Submitted"],
  ["administrative-check", "形式审查", "Administrative check"],
  ["with-editor", "编辑处理中", "With editor"],
  ["under-review", "外审中", "Under review"],
  ["decision-pending", "等待决定", "Decision pending"],
  ["revision-requested", "需要返修", "Revision requested"],
  ["revision-submitted", "已提交返修", "Revision submitted"],
  ["accepted", "已接收", "Accepted"],
  ["rejected", "已拒稿", "Rejected"],
  ["withdrawn", "已撤稿", "Withdrawn"],
  ["closed", "已结束", "Closed"]
] as const;

export const TERMINAL_CODES = new Set(["accepted", "rejected", "withdrawn", "closed"]);
