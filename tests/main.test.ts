import { afterEach, describe, expect, it, vi } from "vitest";

describe("Zotero 10 startup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers both menus and supplies visible fallback labels", async () => {
    const registerMenu = vi.fn((menu: any) => menu.menuID);
    const unregisterMenu = vi.fn();
    const runtime = {
      Zotero: { locale: "zh-CN", MenuManager: { registerMenu, unregisterMenu } },
      Services: {}, IOUtils: {}, PathUtils: {}, Components: {}
    };

    const plugin = await import("../src/main");
    await expect(plugin.startup("resource://submission-tracker/", runtime)).resolves.toBeUndefined();

    expect(registerMenu).toHaveBeenCalledTimes(2);
    expect(registerMenu.mock.calls.map(([menu]) => menu.menuID)).toEqual([
      "submission-tracker-tools",
      "submission-tracker-create"
    ]);
    const setAttribute = vi.fn();
    registerMenu.mock.calls[0][0].menus[0].onShowing({}, { menuElem: { setAttribute } });
    expect(setAttribute).toHaveBeenCalledWith("label", "投稿追踪");

    await plugin.shutdown();
    expect(unregisterMenu).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when bootstrap does not supply the Zotero runtime", async () => {
    const plugin = await import("../src/main");
    await expect(plugin.startup("resource://submission-tracker/", {} as any)).rejects.toThrow(/missing Zotero runtime dependency/);
  });
});
