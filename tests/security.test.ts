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
    const ui = read("src/ui.ts") + read("addon/content/dashboard.xhtml");
    expect(ui).not.toMatch(/type=["']password["']/i);
    const runtime = sourceText("src") + sourceText("addon");
    expect(runtime).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|zotero\.sqlite/i);
  });
});
