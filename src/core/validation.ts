import { isISODate } from "./date";
import { SCHEMA_VERSION, SubmissionTrackerBackup } from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "string") errors.push(`${path}: expected string`);
};
const boolean = (value: unknown, path: string, errors: string[]) => {
  if (typeof value !== "boolean") errors.push(`${path}: expected boolean`);
};
const date = (value: unknown, path: string, errors: string[], nullable = false) => {
  if (nullable && value === null) return;
  if (!isISODate(value)) errors.push(`${path}: expected YYYY-MM-DD`);
};
const timestamp = (value: unknown, path: string, errors: string[]) => {
  const hasTimezone = typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!hasTimezone || Number.isNaN(Date.parse(value))) errors.push(`${path}: expected ISO timestamp with timezone`);
};

export function validateBackup(input: unknown): SubmissionTrackerBackup {
  const errors: string[] = [];
  if (!isObject(input)) throw new Error("Backup root: expected object");
  if (input.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion: unsupported version ${String(input.schemaVersion)}`);
  timestamp(input.exportedAt, "exportedAt", errors);
  string(input.pluginVersion, "pluginVersion", errors);
  for (const key of ["systemProfiles", "submissions", "statusEvents"] as const) {
    if (!Array.isArray(input[key])) errors.push(`${key}: expected array`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const backup = input as unknown as SubmissionTrackerBackup;
  const profileIds = new Set<string>();
  backup.systemProfiles.forEach((item, i) => {
    const p = `systemProfiles[${i}]`;
    if (!isObject(item)) return errors.push(`${p}: expected object`);
    const object = item as unknown as Record<string, unknown>;
    ["id", "displayName", "journalName", "platformName", "loginUrl", "username", "notes"].forEach(k => string(object[k], `${p}.${k}`, errors));
    boolean(item.archived, `${p}.archived`, errors); timestamp(item.createdAt, `${p}.createdAt`, errors); timestamp(item.updatedAt, `${p}.updatedAt`, errors);
    if (typeof item.id === "string") {
      if (profileIds.has(item.id)) errors.push(`${p}.id: duplicate ID`);
      profileIds.add(item.id);
    }
  });
  const submissionIds = new Set<string>();
  backup.submissions.forEach((item, i) => {
    const p = `submissions[${i}]`;
    if (!isObject(item)) return errors.push(`${p}: expected object`);
    const object = item as unknown as Record<string, unknown>;
    ["id", "manuscriptTitle", "journalName", "manuscriptId", "notes"].forEach(k => string(object[k], `${p}.${k}`, errors));
    date(item.submissionDate, `${p}.submissionDate`, errors); date(item.nextFollowUpDate, `${p}.nextFollowUpDate`, errors, true);
    boolean(item.archived, `${p}.archived`, errors); timestamp(item.createdAt, `${p}.createdAt`, errors); timestamp(item.updatedAt, `${p}.updatedAt`, errors);
    if (item.systemProfileId !== null && (typeof item.systemProfileId !== "string" || !profileIds.has(item.systemProfileId))) errors.push(`${p}.systemProfileId: broken reference`);
    if (!isObject(item.zoteroItem)) errors.push(`${p}.zoteroItem: expected object`);
    else {
      if (item.zoteroItem.libraryType !== "user" && item.zoteroItem.libraryType !== "group") errors.push(`${p}.zoteroItem.libraryType: expected user or group`);
      if (item.zoteroItem.libraryType === "group" && typeof item.zoteroItem.groupID !== "number") errors.push(`${p}.zoteroItem.groupID: expected number`);
      string(item.zoteroItem.itemKey, `${p}.zoteroItem.itemKey`, errors); string(item.zoteroItem.cachedTitle, `${p}.zoteroItem.cachedTitle`, errors);
    }
    if (typeof item.id === "string") {
      if (submissionIds.has(item.id)) errors.push(`${p}.id: duplicate ID`);
      submissionIds.add(item.id);
    }
  });
  const eventCount = new Map<string, number>();
  const eventIds = new Set<string>();
  backup.statusEvents.forEach((item, i) => {
    const p = `statusEvents[${i}]`;
    if (!isObject(item)) return errors.push(`${p}: expected object`);
    const object = item as unknown as Record<string, unknown>;
    ["id", "submissionId", "statusLabel", "notes"].forEach(k => string(object[k], `${p}.${k}`, errors));
    if (typeof item.submissionId !== "string" || !submissionIds.has(item.submissionId)) errors.push(`${p}.submissionId: broken reference`);
    if (item.statusType !== "preset" && item.statusType !== "custom") errors.push(`${p}.statusType: expected preset or custom`);
    if (item.statusCode !== null && typeof item.statusCode !== "string") errors.push(`${p}.statusCode: expected string or null`);
    date(item.effectiveDate, `${p}.effectiveDate`, errors); timestamp(item.createdAt, `${p}.createdAt`, errors); timestamp(item.updatedAt, `${p}.updatedAt`, errors);
    if (typeof item.id === "string") {
      if (eventIds.has(item.id)) errors.push(`${p}.id: duplicate ID`);
      eventIds.add(item.id);
    }
    if (typeof item.submissionId === "string") eventCount.set(item.submissionId, (eventCount.get(item.submissionId) ?? 0) + 1);
  });
  for (const id of submissionIds) if (!eventCount.get(id)) errors.push(`submissions[id=${id}]: must have at least one status event`);
  if (errors.length) throw new Error(errors.join("\n"));
  return backup;
}

export function assertNoSensitiveKeys(value: unknown, path = "root"): void {
  if (!isObject(value) && !Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (/password|secret|token/i.test(key)) throw new Error(`${path}.${key}: forbidden sensitive field`);
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}
