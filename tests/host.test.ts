import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DASHBOARD_URL, waitForDashboardDocument } from "../src/host";

function makeDoc() {
  return { getElementById: () => null } as unknown as Document;
}

function createWindow(appExists: boolean) {
  const doc = appExists ? { getElementById: () => ({}) } : { getElementById: () => null };
  return {
    closed: false,
    document: {
      readyState: "loading",
      getElementById: vi.fn((id: string) => (id === "app" ? (appExists ? {} : null) : null)),
    },
    location: { href: DASHBOARD_URL },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as any;
}

describe("dashboard document startup", () => {
  it("uses a registered chrome URL instead of opening a page inside the XPI directly", () => {
    expect(DASHBOARD_URL).toBe("chrome://submission-tracker/content/dashboard.html");
  });

  it("continues immediately when the application container already exists", async () => {
    const win = createWindow(true);
    const result = await waitForDashboardDocument(win, 50, 1);
    expect(result).toBeDefined();
    expect(win.document.getElementById).toHaveBeenCalledWith("app");
  });

  it("detects a container that appears without a load event", async () => {
    let appExists = false;
    const win = {
      closed: false,
      document: {
        readyState: "loading",
        getElementById: vi.fn((id: string) => (id === "app" && appExists ? {} : null)),
      },
      location: { href: DASHBOARD_URL },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
    const waiting = waitForDashboardDocument(win, 200, 1);
    setTimeout(() => { appExists = true; }, 5);
    const resolved = await waiting;
    expect(resolved).toBeDefined();
    expect(win.document.getElementById).toHaveBeenCalledWith("app");
  });

  it("reports the loaded URL and ready state when startup really times out", async () => {
    const win = createWindow(false);
    await expect(waitForDashboardDocument(win, 10, 1)).rejects.toThrow(
      /dashboard\.html.*readyState: loading/,
    );
  });

  it("returns the document when the application container appears", async () => {
    let reads = 0;
    const docWithApp = { getElementById: (id: string) => (id === "app" ? {} : null) };
    const docWithoutApp = { getElementById: () => null };
    const win = {
      closed: false,
      get document() {
        reads += 1;
        return reads === 1 ? docWithApp : docWithoutApp;
      },
      location: { href: DASHBOARD_URL },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    const resolved = await waitForDashboardDocument(win, 50, 1);
    expect(resolved).toBeDefined();
    // The implementation does an immediate check then a first poll = 2 reads.
    expect(reads).toBe(2);
  });

  it("uses standard HTML so the dashboard can render ordinary HTML fragments", () => {
    const dashboard = readFileSync(
      resolve(import.meta.dirname, "../addon/content/dashboard.html"),
      "utf8",
    );

    expect(dashboard.trimStart()).toMatch(/^<!doctype html>/i);
    expect(dashboard).not.toMatch(/<\?xml|xmlns=/i);
    expect(dashboard).toContain('id="app"');
  });
});