import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonStore } from "../src/storage";
import { fixture } from "./fixtures";

const files = new Map<string, string>();
let failMove = false;

beforeEach(() => {
  files.clear();
  failMove = false;
  vi.stubGlobal("PathUtils", { join: (...parts: string[]) => parts.join("/") });
  vi.stubGlobal("Zotero", { logError: vi.fn() });
  vi.stubGlobal("IOUtils", {
    makeDirectory: vi.fn(),
    exists: vi.fn(async (path: string) => files.has(path)),
    readUTF8: vi.fn(async (path: string) => { const value = files.get(path); if (value === undefined) throw new Error("missing"); return value; }),
    writeUTF8: vi.fn(async (path: string, value: string) => { files.set(path, value); }),
    copy: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); }),
    move: vi.fn(async (from: string, to: string) => {
      if (failMove) throw new Error("simulated move failure");
      files.set(to, files.get(from)!); files.delete(from);
    }),
    remove: vi.fn(async (path: string) => { files.delete(path); })
  });
});

describe("atomic JSON storage", () => {
  it("keeps the prior primary and creates a .bak when final replacement fails", async () => {
    const store = new JsonStore("0.1.0", "/data");
    const original = JSON.stringify(fixture());
    files.set(store.dataPath, original);
    failMove = true;
    await expect(store.save({ ...fixture(), submissions: [] , statusEvents: [] })).rejects.toThrow(/move failure/);
    expect(files.get(store.dataPath)).toBe(original);
    expect(files.get(store.backupPath)).toBe(original);
    expect(files.has(`${store.dataPath}.tmp`)).toBe(false);
  });

  it("loads the backup if the primary file is invalid", async () => {
    const store = new JsonStore("0.1.0", "/data");
    files.set(store.dataPath, "not json");
    files.set(store.backupPath, JSON.stringify(fixture()));
    expect((await store.load()).submissions[0].id).toBe("submission-1");
  });

  it("keeps the validated current data as the pre-restore backup", async () => {
    const store = new JsonStore("0.1.0", "/data");
    const current = fixture();
    files.set(store.dataPath, "not json");
    files.set(store.backupPath, JSON.stringify(current));
    const imported = fixture();
    imported.submissions[0].manuscriptTitle = "Imported manuscript";

    await store.restore(JSON.stringify(imported));

    expect(validateTitle(files.get(store.dataPath))).toBe("Imported manuscript");
    expect(validateTitle(files.get(store.backupPath))).toBe(current.submissions[0].manuscriptTitle);
  });
});

function validateTitle(raw: string | undefined): string {
  if (!raw) throw new Error("missing stored data");
  return JSON.parse(raw).submissions[0].manuscriptTitle;
}
