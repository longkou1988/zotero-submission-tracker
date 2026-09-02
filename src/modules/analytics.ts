import type { StatusEvent, SubmissionRecord, SubmissionStatus } from "../types";

export interface AnalyticsSubmission {
  record: SubmissionRecord;
  events: StatusEvent[];
}

export interface YearlySubmissionCount {
  year: number;
  count: number;
}

export interface JournalAnalytics {
  journal: string;
  submissions: number;
  accepted: number;
  rejected: number;
  averageFirstDecisionDays: number | null;
}

export interface SubmissionAnalytics {
  total: number;
  active: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  acceptanceRate: number | null;
  rejectionRate: number | null;
  averageFirstDecisionDays: number | null;
  firstDecisionSampleSize: number;
  yearlyTrend: YearlySubmissionCount[];
  journals: JournalAnalytics[];
}

export type OutcomeChartKey =
  | "active"
  | "accepted"
  | "rejected"
  | "withdrawn";

export interface OutcomeChartSegment {
  key: OutcomeChartKey;
  count: number;
  percent: number;
  startPercent: number;
  endPercent: number;
}

const ACTIVE_STATUS_SET = new Set<SubmissionStatus>([
  "draft",
  "submitted",
  "with_editor",
  "under_review",
  "major_revision",
  "minor_revision",
]);

const FIRST_DECISION_STATUSES = new Set<SubmissionStatus>([
  "major_revision",
  "minor_revision",
  "accepted",
  "rejected",
]);

export function computeSubmissionAnalytics(
  submissions: AnalyticsSubmission[],
): SubmissionAnalytics {
  const total = submissions.length;
  let active = 0;
  let accepted = 0;
  let rejected = 0;
  let withdrawn = 0;
  const decisionDays: number[] = [];
  const years = new Map<number, number>();
  const journalMap = new Map<
    string,
    {
      submissions: number;
      accepted: number;
      rejected: number;
      decisionDays: number[];
    }
  >();

  for (const input of submissions) {
    const { record } = input;
    if (ACTIVE_STATUS_SET.has(record.currentStatus)) active += 1;
    if (record.currentStatus === "accepted") accepted += 1;
    if (record.currentStatus === "rejected") rejected += 1;
    if (record.currentStatus === "withdrawn") withdrawn += 1;

    const firstDecisionDays = getFirstDecisionDays(input.events);
    if (firstDecisionDays != null) decisionDays.push(firstDecisionDays);

    const year = getSubmissionYear(record, input.events);
    years.set(year, (years.get(year) || 0) + 1);

    const journal = record.journal.trim() || "—";
    const journalStats = journalMap.get(journal) || {
      submissions: 0,
      accepted: 0,
      rejected: 0,
      decisionDays: [],
    };
    journalStats.submissions += 1;
    if (record.currentStatus === "accepted") journalStats.accepted += 1;
    if (record.currentStatus === "rejected") journalStats.rejected += 1;
    if (firstDecisionDays != null) {
      journalStats.decisionDays.push(firstDecisionDays);
    }
    journalMap.set(journal, journalStats);
  }

  const decided = accepted + rejected;
  const yearlyTrend = Array.from(years.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
  const journals = Array.from(journalMap.entries())
    .map(([journal, stats]) => ({
      journal,
      submissions: stats.submissions,
      accepted: stats.accepted,
      rejected: stats.rejected,
      averageFirstDecisionDays: average(stats.decisionDays),
    }))
    .sort(
      (a, b) =>
        b.submissions - a.submissions || a.journal.localeCompare(b.journal),
    );

  return {
    total,
    active,
    accepted,
    rejected,
    withdrawn,
    acceptanceRate: decided ? round1((accepted / decided) * 100) : null,
    rejectionRate: decided ? round1((rejected / decided) * 100) : null,
    averageFirstDecisionDays: average(decisionDays),
    firstDecisionSampleSize: decisionDays.length,
    yearlyTrend,
    journals,
  };
}

export function getOutcomeChartSegments(
  analytics: Pick<
    SubmissionAnalytics,
    "total" | "active" | "accepted" | "rejected" | "withdrawn"
  >,
): OutcomeChartSegment[] {
  const values: Array<[OutcomeChartKey, number]> = [
    ["active", analytics.active],
    ["accepted", analytics.accepted],
    ["rejected", analytics.rejected],
    ["withdrawn", analytics.withdrawn],
  ];
  let cursor = 0;

  return values.map(([key, count]) => {
    const rawPercent = analytics.total ? (count / analytics.total) * 100 : 0;
    const startPercent = round1(cursor);
    cursor += rawPercent;
    return {
      key,
      count,
      percent: round1(rawPercent),
      startPercent,
      endPercent: round1(cursor),
    };
  });
}

export function getJournalBarWidths(
  journals: Array<Pick<JournalAnalytics, "submissions">>,
): number[] {
  const max = Math.max(0, ...journals.map((journal) => journal.submissions));
  if (!max) return journals.map(() => 0);
  return journals.map((journal) => round1((journal.submissions / max) * 100));
}

export function getFirstDecisionDays(events: StatusEvent[]): number | null {
  if (!events.length) return null;
  const ordered = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  );
  const submitted = ordered.find((event) => event.status === "submitted");
  const start = submitted || ordered[0];
  const decision = ordered.find(
    (event) =>
      FIRST_DECISION_STATUSES.has(event.status) &&
      event.date >= start.date &&
      event.id !== start.id,
  );
  if (!decision) return null;
  return daysBetween(start.date, decision.date);
}

function getSubmissionYear(
  record: SubmissionRecord,
  events: StatusEvent[],
): number {
  const ordered = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  );
  const submitted = ordered.find((event) => event.status === "submitted");
  const date = submitted?.date || ordered[0]?.date;
  if (date) {
    const year = Number(date.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  return new Date(record.createdAt).getFullYear();
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
