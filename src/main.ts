import { DashboardHost } from "./host";
import { itemToRef } from "./zotero-adapter";
import { installRuntime, Zotero } from "./runtime";
import type { ZoteroRuntime } from "./runtime";

const PLUGIN_ID = "submission-tracker@research-tools";
const PLUGIN_VERSION = "0.1.5";
let host: DashboardHost | null = null;
const menuIDs: string[] = [];

export async function startup(rootURI: string, runtime: ZoteroRuntime): Promise<void> {
  installRuntime(runtime);
  host = new DashboardHost(rootURI, PLUGIN_VERSION);
  const zh = String(Zotero.locale || "").toLowerCase().startsWith("zh");

  menuIDs.push(Zotero.MenuManager.registerMenu({
    menuID: "submission-tracker-tools",
    pluginID: PLUGIN_ID,
    target: "main/menubar/tools",
    menus: [{
      menuType: "menuitem",
      l10nID: "submission-tracker-open",
      onShowing: (_event: unknown, context: any) => {
        context.menuElem?.setAttribute("label", zh ? "投稿追踪" : "Submission Tracker");
      },
      onCommand: () => host?.open()
    }]
  }));

  menuIDs.push(Zotero.MenuManager.registerMenu({
    menuID: "submission-tracker-create",
    pluginID: PLUGIN_ID,
    target: "main/library/item",
    menus: [{
      menuType: "menuitem",
      l10nID: "submission-tracker-create",
      onShowing: (_event: unknown, context: any) => {
        context.menuElem?.setAttribute("label", zh ? "创建投稿记录" : "Create Submission Record");
        context.setVisible(context.items?.length === 1 && context.items[0]?.isRegularItem?.());
      },
      onCommand: (_event: unknown, context: any) => {
        const item = context.items?.length === 1 && context.items[0]?.isRegularItem?.() ? context.items[0] : null;
        if (item) host?.open(itemToRef(item));
      }
    }]
  }));
}

export async function shutdown(): Promise<void> {
  for (const id of menuIDs.splice(0)) Zotero.MenuManager.unregisterMenu(id);
  host?.close();
  host = null;
}
