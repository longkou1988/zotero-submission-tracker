import { emptyData, removeStatusEvent } from "./core/domain";
import { PRESET_STATUSES, Settings, StatusEvent, Submission, SystemProfile, TrackerData, ZoteroItemRef } from "./core/types";
import { JsonStore } from "./storage";

export type NewSubmission = Omit<Submission, "id" | "createdAt" | "updatedAt" | "archived"> & {
  initialStatusCode?: string;
  initialStatusLabel?: string;
  initialStatusDate: string;
  initialStatusNotes?: string;
};

const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

export class TrackerService {
  data: TrackerData = emptyData();
  settings!: Settings;
  constructor(public store: JsonStore) {}

  async init() { this.data = await this.store.load(); this.settings = await this.store.loadSettings(); }
  private async commit(data: TrackerData) { await this.store.save(data); this.data = data; }

  async createSubmission(input: NewSubmission): Promise<Submission> {
    const createdAt = now();
    const { initialStatusCode, initialStatusLabel, initialStatusDate, initialStatusNotes, ...submissionInput } = input;
    const submission: Submission = { ...submissionInput, id: id(), archived: false, createdAt, updatedAt: createdAt };
    const code = initialStatusCode ?? "submitted";
    const preset = PRESET_STATUSES.find(item => item[0] === code);
    const event: StatusEvent = {
      id: id(), submissionId: submission.id, effectiveDate: initialStatusDate,
      statusType: preset ? "preset" : "custom", statusCode: preset ? code : null,
      statusLabel: initialStatusLabel || preset?.[1] || code,
      notes: initialStatusNotes ?? "", createdAt, updatedAt: createdAt
    };
    await this.commit({ ...this.data, submissions: [...this.data.submissions, submission], statusEvents: [...this.data.statusEvents, event] });
    return submission;
  }

  async updateSubmission(idValue: string, patch: Partial<Omit<Submission, "id" | "createdAt">>) {
    const submissions = this.data.submissions.map(item => item.id === idValue ? { ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt: now() } : item);
    await this.commit({ ...this.data, submissions });
  }

  async addStatus(input: Omit<StatusEvent, "id" | "createdAt" | "updatedAt">) {
    if (!this.data.submissions.some(item => item.id === input.submissionId)) throw new Error("Submission not found");
    const stamp = now();
    await this.commit({ ...this.data, statusEvents: [...this.data.statusEvents, { ...input, id: id(), createdAt: stamp, updatedAt: stamp }] });
  }

  async updateStatus(idValue: string, patch: Partial<Omit<StatusEvent, "id" | "submissionId" | "createdAt">>) {
    const statusEvents = this.data.statusEvents.map(item => item.id === idValue ? { ...item, ...patch, id: item.id, submissionId: item.submissionId, createdAt: item.createdAt, updatedAt: now() } : item);
    await this.commit({ ...this.data, statusEvents });
  }

  async deleteStatus(idValue: string) { await this.commit(removeStatusEvent(this.data, idValue)); }

  async saveProfile(input: Omit<SystemProfile, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
    const stamp = now();
    if (input.id) {
      const systemProfiles = this.data.systemProfiles.map(item => item.id === input.id ? { ...item, ...input, id: item.id, createdAt: item.createdAt, updatedAt: stamp } : item);
      await this.commit({ ...this.data, systemProfiles });
      return input.id;
    }
    const profile: SystemProfile = { ...input, id: id(), createdAt: stamp, updatedAt: stamp };
    await this.commit({ ...this.data, systemProfiles: [...this.data.systemProfiles, profile] });
    return profile.id;
  }

  async archiveProfile(profileId: string) {
    await this.saveProfile({ ...this.data.systemProfiles.find(p => p.id === profileId)!, id: profileId, archived: true });
  }

  async refreshCachedTitle(ref: ZoteroItemRef, title: string) {
    const submissions = this.data.submissions.map(s => s.zoteroItem.itemKey === ref.itemKey && s.zoteroItem.libraryType === ref.libraryType && s.zoteroItem.groupID === ref.groupID
      ? { ...s, zoteroItem: { ...s.zoteroItem, cachedTitle: title } } : s);
    await this.commit({ ...this.data, submissions });
  }
}
