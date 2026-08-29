import { initLocale, getString } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { db } from "./db";
import { config } from "../package.json";
import {
  registerItemPaneSection,
  refreshOpenSections,
} from "./modules/itemPane";
import { registerStatusColumn } from "./modules/column";
import { registerMenus } from "./modules/menu";
import { closeDashboard } from "./modules/dashboard";
import {
  registerNotifier,
  unregisterNotifier,
  cleanupOrphans,
  startReminderLoop,
} from "./modules/notify";
import { closeAllDialogs } from "./modules/dialog";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await db.initialize();
  db.onChange(() => refreshOpenSections());
  await cleanupOrphans();

  registerItemPaneSection();
  await registerStatusColumn();
  registerNotifier();

  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: `chrome://${config.addonRef}/content/preferences.xhtml`,
    label: getString("prefs-title"),
    image: `chrome://${config.addonRef}/content/icons/section.svg`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  startReminderLoop();

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);

  injectStylesheet(win, "zoteroPane.css");
  injectStylesheet(win, "dashboard.css");

  registerMenus();

  if (addon.data.env === "development") {
    new ztoolkit.ProgressWindow(config.addonName, { closeTime: 2500 })
      .createLine({
        text: `${getString("startup-finish")} (dev)`,
        type: "success",
        progress: 100,
      })
      .show();
  }
}

function injectStylesheet(win: Window, file: string): void {
  const doc = win.document;
  if (doc.getElementById(`${config.addonRef}-${file}`)) {
    return;
  }
  const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
  link.id = `${config.addonRef}-${file}`;
  (link as HTMLLinkElement).rel = "stylesheet";
  (link as HTMLLinkElement).href =
    `chrome://${config.addonRef}/content/${file}`;
  doc.documentElement!.appendChild(link);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  closeAllDialogs();
  closeDashboard();
  unregisterNotifier();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
