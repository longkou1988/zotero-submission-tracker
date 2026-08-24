import { afterEach, describe, expect, it, vi } from "vitest";

describe("Zotero 10 startup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers both menus without a manual localization API", async () => {
    const registerMenu = vi.fn((menu: { menuID: string }) => menu.menuID);
    const unregisterMenu = vi.fn();
    vi.stubGlobal("Zotero", {
      MenuManager: { registerMenu, unregisterMenu }
    });

    const plugin = await import("../src/main");
    await expect(plugin.startup("resource://submission-tracker/")).resolves.toBeUndefined();

    expect(registerMenu).toHaveBeenCalledTimes(2);
    expect(registerMenu.mock.calls.map(([menu]) => menu.menuID)).toEqual([
      "submission-tracker-tools",
      "submission-tracker-create"
    ]);

    await plugin.shutdown();
    expect(unregisterMenu).toHaveBeenCalledTimes(2);
  });
});
