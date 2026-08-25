import { calendarDaysBetween, followUpBucket, localDateString } from "./date";
import { PRESET_STATUSES, StatusEvent, Submission, SystemProfile, TERMINAL_CODES, TrackerData } from "./types";

export const emptyData = (pluginVersion = "0.1.21"): TrackerData => ({
  schemaVersion: 1,
  pluginVersion,
  systemProfiles: [],
  submissions: [],
  statusEvents: []
});

export function currentStatus(events: StatusEvent[]): StatusEvent | null {
  return [...events].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)
  )[0] ?? null;
}

export function timeline(events: StatusEvent[]): StatusEvent[] {
  return [...events].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
  );
}

export function isFinished(event: StatusEvent | null): boolean {
  return !!event?.statusCode && TERMINAL_CODES.has(event.statusCode);
}

export function statusDuration(event: StatusEvent | null, today = localDateString()): number | null {
  return event ? Math.max(0, calendarDaysBetween(event.effectiveDate, today)) : null;
}

export function presetLabel(code: string, language: "zh-CN" | "en-US"): string {
  const row = PRESET_STATUSES.find(x => x[0] === code);
  return row ? row[language === "zh-CN" ? 1 : 2] : code;
}

export type DashboardRow = Submission & {
  profile: SystemProfile | null;
  currentStatus: StatusEvent | null;
  durationDays: number | null;
  followUp: ReturnType<typeof followUpBucket>;
  finished: boolean;
};

export function dashboardRows(data: TrackerData, today = localDateString()): DashboardRow[] {
  const profiles = new Map(data.systemProfiles.map(profile => [profile.id, profile]));
  const events = new Map<string, StatusEvent[]>();
  for (const event of data.statusEvents) {
    const list = events.get(event.submissionId) ?? [];
    list.push(event);
    events.set(event.submissionId, list);
  }
  const priority = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 } as const;
  return data.submissions.map(submission => {
    const status = currentStatus(events.get(submission.id) ?? []);
    return {
      ...submission,
      profile: submission.systemProfileId ? profiles.get(submission.systemProfileId) ?? null : null,
      currentStatus: status,
      durationDays: statusDuration(status, today),
      followUp: followUpBucket(submission.nextFollowUpDate, today),
      finished: isFinished(status)
    };
  }).sort((a, b) =>
    priority[a.followUp] - priority[b.followUp] || b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function removeStatusEvent(data: TrackerData, eventId: string): TrackerData {
  const event = data.statusEvents.find(item => item.id === eventId);
  if (!event) throw new Error("Status event not found");
  if (data.statusEvents.filter(item => item.submissionId === event.submissionId).length <= 1) {
    throw new Error("A submission must retain at least one status event");
  }
  return { ...data, statusEvents: data.statusEvents.filter(item => item.id !== eventId) };
}
