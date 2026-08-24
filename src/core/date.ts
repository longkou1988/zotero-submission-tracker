const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localMidnight(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((localMidnight(to) - localMidnight(from)) / 86_400_000);
}

export type FollowUpBucket = "overdue" | "today" | "soon" | "later" | "none";

export function followUpBucket(next: string | null, today = localDateString()): FollowUpBucket {
  if (!next) return "none";
  const days = calendarDaysBetween(today, next);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "soon";
  return "later";
}
