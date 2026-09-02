import type { SubmissionStatus } from "../../types";

const TERMINAL_STATUSES = new Set<SubmissionStatus>([
  "accepted",
  "rejected",
  "withdrawn",
]);

const ACTIVE_TARGETS = new Set<SubmissionStatus>([
  "submitted",
  "with_editor",
  "under_review",
  "major_revision",
  "minor_revision",
  "accepted",
  "rejected",
  "withdrawn",
]);

const AUTO_TRANSITIONS: Record<
  SubmissionStatus,
  ReadonlySet<SubmissionStatus>
> = {
  draft: ACTIVE_TARGETS,
  submitted: new Set([
    "with_editor",
    "under_review",
    "major_revision",
    "minor_revision",
    "accepted",
    "rejected",
    "withdrawn",
  ]),
  with_editor: new Set([
    "under_review",
    "major_revision",
    "minor_revision",
    "accepted",
    "rejected",
    "withdrawn",
  ]),
  under_review: new Set([
    "major_revision",
    "minor_revision",
    "accepted",
    "rejected",
    "withdrawn",
  ]),
  major_revision: new Set([
    "submitted",
    "with_editor",
    "under_review",
    "major_revision",
    "minor_revision",
    "accepted",
    "rejected",
    "withdrawn",
  ]),
  minor_revision: new Set([
    "submitted",
    "with_editor",
    "under_review",
    "major_revision",
    "minor_revision",
    "accepted",
    "rejected",
    "withdrawn",
  ]),
  accepted: new Set(),
  rejected: new Set(),
  withdrawn: new Set(),
};

export function isTerminalStatus(status: SubmissionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canAutoTransition(
  from: SubmissionStatus,
  to: SubmissionStatus,
): boolean {
  if (from === to) {
    return true;
  }
  if (isTerminalStatus(from)) {
    return false;
  }
  return AUTO_TRANSITIONS[from].has(to);
}
