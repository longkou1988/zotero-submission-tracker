import { DashboardHost } from "./host";
import { itemToRef } from "./zotero-adapter";

const PLUGIN_ID = "submission-tracker@research-tools";
const PLUGIN_VERSION = "0.1.3";
let host: DashboardHost | null = null;
const menuIDs: string[] = [];

export async function startup(rootURI: string): Promise<void> {
  host = new DashboardHost(rootURI, PLUGIN_VERSION);
  Zotero.Locale.registerPluginLocalization(rootURI);

  menuIDs.push(Zotero.MenuManager.registerMenu({
    menuID: "submission-tracker-tools",
    pluginID: PLUGIN_ID,
    target: "main/menubar/tools",
    menus: [{
      menuType: "menuitem",
      l10nID: "submission-tracker-open",
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
