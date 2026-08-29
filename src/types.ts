/**
 * Core domain types for Submission Tracker.
 * A "submission" is one attempt of sending a manuscript to a journal.
 * A Zotero item can have multiple submissions (resubmission history).
 */

export const STATUS_LIST = [
  "draft",
  "submitted",
  "with_editor",
  "under_review",
  "major_revision",
  "minor_revision",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type SubmissionStatus = (typeof STATUS_LIST)[number];

/** Statuses that mean the manuscript is still in play at a journal. */
export const ACTIVE_STATUSES: SubmissionStatus[] = [
  "draft",
  "submitted",
  "with_editor",
  "under_review",
  "major_revision",
  "minor_revision",
];

/** Colors tuned to read well on both light and dark backgrounds. */
export const STATUS_META: Record<
  SubmissionStatus,
  { color: string; order: number }
> = {
  draft: { color: "#8a8f98", order: 0 },
  submitted: { color: "#3b82f6", order: 1 },
  with_editor: { color: "#0ea5b7", order: 2 },
  under_review: { color: "#8b5cf6", order: 3 },
  major_revision: { color: "#f97316", order: 4 },
  minor_revision: { color: "#d9a406", order: 5 },
  accepted: { color: "#22c55e", order: 6 },
  rejected: { color: "#ef4444", order: 7 },
  withdrawn: { color: "#6b7280", order: 8 },
};

export function isSubmissionStatus(v: string): v is SubmissionStatus {
  return (STATUS_LIST as readonly string[]).includes(v);
}

export interface SubmissionRecord {
  id: number;
  libraryID: number;
  itemKey: string;
  journal: string;
  currentStatus: SubmissionStatus;
  /** ISO date string `YYYY-MM-DD`, or null when not set. */
  followUpDate: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface StatusEvent {
  id: number;
  submissionId: number;
  status: SubmissionStatus;
  /** ISO date string `YYYY-MM-DD`. */
  date: string;
  note: string;
  createdAt: number;
}

export interface NewSubmissionInput {
  libraryID: number;
  itemKey: string;
  journal: string;
  status: SubmissionStatus;
  /** ISO date string `YYYY-MM-DD`. */
  date: string;
  followUpDate?: string | null;
  notes?: string;
}

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Days between an ISO date and today; negative means overdue-past. */
export function daysFromToday(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}
