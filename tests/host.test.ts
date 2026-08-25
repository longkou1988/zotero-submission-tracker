import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DASHBOARD_URL, waitForDashboardDocument } from "../src/host";

function makeDoc(idToApp: () => object | null) {
  return {
    getElementById: (id: string) => (id === "app" ? idToApp() : null),
  } as unknown as Document;
}

function createWindow(getAppInFrame: () => object | null) {
  const frame = { contentDocument: makeDoc(getAppInFrame) };
  return {
    closed: false,
    document: {
      readyState: "loading",
      getElementById: vi.fn((id: string) => (id === "frame" ? frame : null)),
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
    const contentDocument = makeDoc(() => ({}));
    const frame = { contentDocument };
    const win = {
      closed: false,
      document: {
        readyState: "loading",
        getElementById: vi.fn((id: string) => (id === "frame" ? frame : null)),
      },
      location: { href: DASHBOARD_URL },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    await expect(waitForDashboardDocument(win, 50, 1)).resolves.toBe(contentDocument);
    expect(win.document.getElementById).toHaveBeenCalledWith("frame");
  });

  it("detects a container that appears without a load event", async () => {
    let app: object | null = null;
    const win = createWindow(() => app);
    const waiting = waitForDashboardDocument(win, 200, 1);
    setTimeout(() => {
      app = {};
    }, 5);

    const resolved = await waiting;
    expect(resolved).toBeDefined();
    expect(win.document.getElementById).toHaveBeenCalledWith("frame");
  });

  it("reports the loaded URL and ready state when startup really times out", async () => {
    const win = createWindow(() => null);

    await expect(waitForDashboardDocument(win, 10, 1)).rejects.toThrow(
      /dashboard\.html.*readyState: loading/,
    );
  });

  it("returns the exact document that contains the application container", async () => {
    const loadedContent = makeDoc(() => ({}));
    const loadedFrame = { contentDocument: loadedContent };
    const loadedDocument = {
      readyState: "complete",
      getElementById: vi.fn((id: string) => (id === "frame" ? loadedFrame : null)),
    } as unknown as Document;
    const replacementContent = makeDoc(() => null);
    const replacementFrame = { contentDocument: replacementContent };
    const replacementDocument = {
      readyState: "complete",
      getElementById: vi.fn(() => null),
    } as unknown as Document;
    let reads = 0;
    const win = {
      closed: false,
      get document() {
        reads += 1;
        return reads === 1 ? loadedDocument : replacementDocument;
      },
      location: { href: DASHBOARD_URL },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;

    await expect(waitForDashboardDocument(win, 50, 1)).resolves.toBe(loadedContent);
    expect(reads).toBe(1);
  });

  it("uses standard HTML so the dashboard can render ordinary HTML fragments", () => {
    const dashboard = readFileSync(
      resolve(import.meta.dirname, "../addon/content/dashboard-content.html"),
      "utf8",
    );

    expect(dashboard.trimStart()).toMatch(/^<!doctype html>/i);
    expect(dashboard).not.toMatch(/<\?xml|xmlns=/i);
    expect(dashboard).toContain('id="app"');
  });
});
