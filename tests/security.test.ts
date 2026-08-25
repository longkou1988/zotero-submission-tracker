import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const sourceText = (path: string): string => readdirSync(resolve(root, path), { withFileTypes: true })
  .map(entry => entry.isDirectory() ? sourceText(`${path}/${entry.name}`) : read(`${path}/${entry.name}`))
  .join("\n");

describe("security boundaries", () => {
  it("has no credential fields in persistent data types", () => {
    const types = read("src/core/types.ts");
    expect(types).not.toMatch(/^\s*(password|secret|token)\??\s*:/im);
  });

  it("has no password form controls, network clients, or SQLite writes", () => {
    const ui = read("src/ui.ts") + read("addon/content/dashboard.html");
    expect(ui).not.toMatch(/type=["']password["']/i);
    const runtime = sourceText("src") + sourceText("addon");
    expect(runtime).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|zotero\.sqlite/i);
  });

  it("provides Fluent label attributes required by MenuManager", () => {
    for (const locale of ["en-US", "zh-CN"]) {
      const fluent = read(`addon/locale/${locale}/submission-tracker.ftl`);
      expect(fluent).toMatch(/^submission-tracker-open\s*=\s*\n\s+\.label\s*=\s*\S/m);
      expect(fluent).toMatch(/^submission-tracker-create\s*=\s*\n\s+\.label\s*=\s*\S/m);
    }
  });

  it("passes Zotero-provided bootstrap globals into ESM and provides menu label fallbacks", () => {
    const startup = read("src/main.ts");
    const bootstrap = read("addon/bootstrap.js");
    expect(startup).not.toContain("registerPluginLocalization");
    expect(startup.match(/^  registerMenu\(\{$/gm)).toHaveLength(1);
    expect(startup).toContain("function installToolsMenu");
    expect(bootstrap).toContain("function onMainWindowLoad");
    expect(bootstrap).toContain("function onMainWindowUnload");
    expect(startup).toContain("if (!menuID) throw new Error");
    expect(bootstrap).not.toMatch(/resource:\/\/gre\/modules\/(Services|IOUtils|PathUtils)\.sys\.mjs/);
    expect(bootstrap).toContain("{ Zotero, Services, IOUtils, PathUtils }");
    expect(bootstrap).toContain("Zotero.logError(error)");
    expect(startup).toContain('setAttribute("label"');
    expect(startup).not.toContain("l10nID:");
  });

  it("uses event listeners instead of cross-window handler properties", () => {
    const ui = read("src/ui.ts") + read("src/dom.ts");
    expect(ui).not.toMatch(/\.(?:oninput|onchange|onclick|onsubmit)\s*=/);
    // ui.ts wires up dashboard filters via the input event directly
    expect(ui).toContain('addEventListener("input"');
    // dom.ts wires up form submissions via the h() helper. The test
    // accepts both a literal call site and the helper indirection.
    expect(ui).toMatch(/addEventListener\(\s*["']submit["']|el\.addEventListener\(eventName/);
  });
});
