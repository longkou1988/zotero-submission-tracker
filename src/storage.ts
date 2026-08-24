import { assertNoSensitiveKeys, validateBackup } from "./core/validation";
import { DEFAULT_SETTINGS, Settings, SubmissionTrackerBackup, TrackerData } from "./core/types";
import { emptyData } from "./core/domain";
import { IOUtils, PathUtils, Zotero } from "./runtime";

export class JsonStore {
  readonly dir: string;
  readonly dataPath: string;
  readonly backupPath: string;
  readonly settingsPath: string;

  constructor(private pluginVersion: string, dataRoot: string) {
    this.dir = PathUtils.join(dataRoot, "submission-tracker");
    this.dataPath = PathUtils.join(this.dir, "data-v1.json");
    this.backupPath = `${this.dataPath}.bak`;
    this.settingsPath = PathUtils.join(this.dir, "settings.json");
  }

  async init(): Promise<void> { await IOUtils.makeDirectory(this.dir, { ignoreExisting: true }); }

  async load(): Promise<TrackerData> {
    await this.init();
    if (!(await IOUtils.exists(this.dataPath))) return emptyData(this.pluginVersion);
    try {
      const raw = await IOUtils.readUTF8(this.dataPath);
      return validateBackup(JSON.parse(raw));
    } catch (error) {
      if (await IOUtils.exists(this.backupPath)) {
        Zotero.logError(new Error(`Submission Tracker: primary data invalid, loading backup: ${String(error)}`));
        return validateBackup(JSON.parse(await IOUtils.readUTF8(this.backupPath)));
      }
      throw error;
    }
  }

  async save(data: TrackerData): Promise<void> {
    await this.writeData(data, true);
  }

  private async writeData(data: TrackerData, updateBackup: boolean): Promise<SubmissionTrackerBackup> {
    await this.init();
    const normalized: SubmissionTrackerBackup = {
      ...data,
      schemaVersion: 1,
      pluginVersion: this.pluginVersion,
      exportedAt: new Date().toISOString()
    };
    assertNoSensitiveKeys(normalized);
    validateBackup(normalized);
    const temporaryPath = `${this.dataPath}.tmp`;
    const encoded = JSON.stringify(normalized, null, 2);
    await IOUtils.writeUTF8(temporaryPath, encoded);
    validateBackup(JSON.parse(await IOUtils.readUTF8(temporaryPath)));
    try {
      if (updateBackup && await IOUtils.exists(this.dataPath)) {
        await IOUtils.copy(this.dataPath, this.backupPath, { noOverwrite: false });
      }
      await IOUtils.move(temporaryPath, this.dataPath, { noOverwrite: false });
    } catch (error) {
      try { if (await IOUtils.exists(temporaryPath)) await IOUtils.remove(temporaryPath); } catch { /* retain original error */ }
      throw error;
    }
    return normalized;
  }

  async exportBackup(data: TrackerData): Promise<string> {
    const backup = { ...data, schemaVersion: 1 as const, exportedAt: new Date().toISOString(), pluginVersion: this.pluginVersion };
    assertNoSensitiveKeys(backup);
    validateBackup(backup);
    return JSON.stringify(backup, null, 2);
  }

  async restore(raw: string): Promise<TrackerData> {
    const imported = validateBackup(JSON.parse(raw));
    assertNoSensitiveKeys(imported);
    const current = await this.load();
    const backupTemporaryPath = `${this.backupPath}.tmp`;
    await IOUtils.writeUTF8(backupTemporaryPath, await this.exportBackup(current));
    validateBackup(JSON.parse(await IOUtils.readUTF8(backupTemporaryPath)));
    try {
      await IOUtils.move(backupTemporaryPath, this.backupPath, { noOverwrite: false });
    } catch (error) {
      try { if (await IOUtils.exists(backupTemporaryPath)) await IOUtils.remove(backupTemporaryPath); } catch { /* retain original error */ }
      throw error;
    }
    return this.writeData(imported, false);
  }

  async loadSettings(): Promise<Settings> {
    await this.init();
    if (!(await IOUtils.exists(this.settingsPath))) return { ...DEFAULT_SETTINGS };
    try {
      const value = JSON.parse(await IOUtils.readUTF8(this.settingsPath));
      return {
        language: ["auto", "zh-CN", "en-US"].includes(value.language) ? value.language : "auto",
        copyUsernameOnOpen: value.copyUsernameOnOpen === true
      };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }

  async saveSettings(settings: Settings): Promise<void> {
    assertNoSensitiveKeys(settings);
    await IOUtils.writeUTF8(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  async clear(): Promise<void> { await this.save(emptyData(this.pluginVersion)); }
}
