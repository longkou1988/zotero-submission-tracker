export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DASHBOARD_FRESHNESS_MS = 10 * 60 * 1000;
export const STARTUP_DELAY_MS = 45 * 1000;

export function isRegularSyncDue(
  lastAttemptAt: number | null,
  now: number,
): boolean {
  if (lastAttemptAt == null) {
    return true;
  }
  return now - lastAttemptAt >= SYNC_INTERVAL_MS;
}

export function canDashboardTrigger(
  lastAttemptAt: number | null,
  now: number,
): boolean {
  if (lastAttemptAt == null) {
    return true;
  }
  return now - lastAttemptAt >= DASHBOARD_FRESHNESS_MS;
}

export function isDashboardSyncDue(
  lastAttemptAt: number | null,
  now: number,
): boolean {
  return (
    canDashboardTrigger(lastAttemptAt, now) &&
    isRegularSyncDue(lastAttemptAt, now)
  );
}
