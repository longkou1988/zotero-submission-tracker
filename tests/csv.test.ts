import { describe, expect, it } from "vitest";
import { exportCSV } from "../src/core/csv";
import { fixture } from "./fixtures";

describe("CSV export", () => {
  it("uses a UTF-8 BOM, escapes Excel-sensitive text, and omits usernames", () => {
    const csv = exportCSV(fixture(), "2026-08-24");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Manuscript, with ""quotes""\nand a newline"');
    expect(csv).toContain('"line 1\nline 2"');
    expect(csv).not.toContain("author@example.test");
    expect(csv).toContain('"是"');
  });
});
