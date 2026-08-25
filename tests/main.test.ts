import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

describe("Zotero 10 startup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("installs the Tools entry directly and registers the item context menu", async () => {
    const registerMenu = vi.fn((menu: any) => menu.menuID);
    const unregisterMenu = vi.fn();
    const appendChild = vi.fn();
    const popup = { appendChild };
    const menuItem = { setAttribute: vi.fn(), addEventListener: vi.fn(), id: "" };
    const alert = vi.fn();
    const logError = vi.fn();
    const win = { document: {
      getElementById: vi.fn((id: string) => id === "menu_ToolsPopup" ? popup : null),
      createXULElement: vi.fn(() => menuItem)
    } };
    const runtime = {
      Zotero: {
        locale: "zh-CN",
        getMainWindows: () => [win],
        getMainWindow: () => win,
        logError,
        MenuManager: { registerMenu, unregisterMenu }
      },
      Services: { prompt: { alert } }, IOUtils: {}, PathUtils: {}
    };

    const { DashboardHost } = await import("../src/host");
    const open = vi.spyOn(DashboardHost.prototype, "open").mockResolvedValue();
    const plugin = await import("../src/main");
    await expect(plugin.startup("resource://submission-tracker/", runtime)).resolves.toBeUndefined();

    expect(appendChild).toHaveBeenCalledWith(menuItem);
    expect(menuItem.setAttribute).toHaveBeenCalledWith("label", "投稿追踪");
    expect(registerMenu).toHaveBeenCalledTimes(1);
    expect(registerMenu.mock.calls.map(([menu]) => menu.menuID)).toEqual([
      "submission-tracker-create"
    ]);
    expect(registerMenu.mock.calls[0][0].menus[0]).not.toHaveProperty("l10nID");
    const command = menuItem.addEventListener.mock.calls.find(([type]) => type === "command")?.[1];
    expect(command).toBeTypeOf("function");
    command();
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith(null));

    open.mockRejectedValueOnce(new Error("dashboard smoke failure"));
    command();
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(
      win,
      "投稿追踪无法打开",
      expect.stringContaining("dashboard smoke failure")
    ));
    expect(logError).toHaveBeenCalled();

    const setAttribute = vi.fn();
    const setVisible = vi.fn();
    registerMenu.mock.calls[0][0].menus[0].onShowing({}, {
      menuElem: { setAttribute },
      setVisible,
      items: []
    });
    expect(setAttribute).toHaveBeenCalledWith("label", "创建投稿记录");

    await plugin.shutdown();
    expect(unregisterMenu).toHaveBeenCalledTimes(1);
  });

  it("starts before Zotero resolves uiReadyPromise and passes bootstrap globals", async () => {
    const moduleStartup = vi.fn();
    const destructChrome = vi.fn();
    const registerChrome = vi.fn(() => ({ destruct: destructChrome }));
    const newURI = vi.fn((value: string) => value);
    const uiReadyPromise = new Promise<void>(() => {});
    const source = `${readFileSync(new URL("../addon/bootstrap.js", import.meta.url), "utf8")}\nthis.pluginStartup = startup;`;
    const globals = {
      Zotero: {
        initializationPromise: Promise.resolve(),
        uiReadyPromise,
        debug: vi.fn(),
        logError: vi.fn()
      },
      Services: { name: "Services", io: { newURI } },
      IOUtils: { name: "IOUtils" },
      PathUtils: { name: "PathUtils" },
      ChromeUtils: {},
      Cc: {
        "@mozilla.org/addons/addon-manager-startup;1": {
          getService: vi.fn(() => ({ registerChrome }))
        }
      },
      Ci: { amIAddonManagerStartup: {} }
    } as any;
    globals.Services.scriptloader = {
      loadSubScriptWithOptions: vi.fn((_url: string, options: any) => {
        options.target.SubmissionTrackerModule = { startup: moduleStartup };
      })
    };

    runInNewContext(source, globals);
    await globals.pluginStartup({ rootURI: "resource://submission-tracker/" });

    expect(globals.Services.scriptloader.loadSubScriptWithOptions).toHaveBeenCalledWith(
      "resource://submission-tracker/content/main.js",
      expect.objectContaining({ charset: "UTF-8", ignoreCache: true })
    );
    expect(newURI).toHaveBeenCalledWith("resource://submission-tracker/manifest.json");
    expect(registerChrome).toHaveBeenCalledWith(
      "resource://submission-tracker/manifest.json",
      [["content", "submission-tracker", "resource://submission-tracker/content/"]]
    );
    expect(moduleStartup).toHaveBeenCalledWith("resource://submission-tracker/", {
      Zotero: globals.Zotero,
      Services: globals.Services,
      IOUtils: globals.IOUtils,
      PathUtils: globals.PathUtils
    });
    expect(globals.Zotero.logError).not.toHaveBeenCalled();
  });

  it("fails clearly when bootstrap does not supply the Zotero runtime", async () => {
    const plugin = await import("../src/main");
    await expect(plugin.startup("resource://submission-tracker/", {} as any)).rejects.toThrow(/missing Zotero runtime dependency/);
  });

  it("reports error-like objects from another window with name and message", async () => {
    const plugin = await import("../src/main");
    expect(plugin.errorMessage({
      name: "SyntaxError",
      message: "An invalid or illegal string was specified",
      stack: "bind@resource://submission-tracker/content/main.js:563:16"
    })).toBe(
      "SyntaxError: An invalid or illegal string was specified\n" +
      "bind@resource://submission-tracker/content/main.js:563:16"
    );
  });
});
