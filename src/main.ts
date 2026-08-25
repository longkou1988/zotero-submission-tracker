import { DashboardHost } from "./host";
import { itemToRef } from "./zotero-adapter";
import { installRuntime, Services, Zotero } from "./runtime";
import type { ZoteroRuntime } from "./runtime";

const PLUGIN_ID = "submission-tracker@research-tools";
const PLUGIN_VERSION = "0.1.19";
let host: DashboardHost | null = null;
const menuIDs: string[] = [];
const TOOLS_MENU_ID = "submission-tracker-tools-menuitem";

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as { name?: unknown; message?: unknown; stack?: unknown };
    const name = typeof value.name === "string" ? value.name : "";
    const message = typeof value.message === "string" ? value.message : "";
    const summary = name && message ? `${name}: ${message}` : message || name;
    const stack = typeof value.stack === "string" ? value.stack : "";
    if (summary && stack && !stack.includes(summary)) return `${summary}\n${stack}`;
    return stack || summary || String(error);
  }
  return String(error);
}

async function openDashboard(initialItem: ReturnType<typeof itemToRef> | null = null): Promise<void> {
  try {
    if (!host) throw new Error("Submission Tracker has not finished starting.");
    await host.open(initialItem);
  } catch (error) {
    Zotero.logError?.(error);
    const zh = String(Zotero.locale || "").toLowerCase().startsWith("zh");
    const title = zh ? "投稿追踪无法打开" : "Submission Tracker could not open";
    const detail = errorMessage(error);
    const message = zh
      ? `插件窗口启动失败。请将下面的错误信息反馈给开发者：\n\n${detail}`
      : `The plugin window failed to start. Please send this error to the developer:\n\n${detail}`;
    const parent = Zotero.getMainWindow?.() ?? null;
    try {
      Services.prompt.alert(parent, title, message);
    } catch {
      parent?.alert?.(`${title}\n\n${message}`);
    }
  }
}

function installToolsMenu(win: any): void {
  const doc = win?.document;
  if (!doc || doc.getElementById(TOOLS_MENU_ID)) return;
  const popup = doc.getElementById("menu_ToolsPopup");
  if (!popup) return;

  const item = doc.createXULElement?.("menuitem") ?? doc.createElement("menuitem");
  item.id = TOOLS_MENU_ID;
  item.setAttribute("label", String(Zotero.locale || "").toLowerCase().startsWith("zh")
    ? "投稿追踪"
    : "Submission Tracker");
  item.addEventListener("command", () => void openDashboard());
  popup.appendChild(item);
}

function removeToolsMenu(win: any): void {
  win?.document?.getElementById(TOOLS_MENU_ID)?.remove();
}

function registerMenu(options: Record<string, unknown>): void {
  const menuID = Zotero.MenuManager.registerMenu(options);
  if (!menuID) throw new Error(`Submission Tracker: failed to register menu ${String(options.menuID)}`);
  menuIDs.push(menuID);
}

export async function startup(rootURI: string, runtime: ZoteroRuntime): Promise<void> {
  installRuntime(runtime);
  host = new DashboardHost(PLUGIN_VERSION);
  const zh = String(Zotero.locale || "").toLowerCase().startsWith("zh");

  for (const win of Zotero.getMainWindows?.() ?? []) installToolsMenu(win);

  registerMenu({
    menuID: "submission-tracker-create",
    pluginID: PLUGIN_ID,
    target: "main/library/item",
    menus: [{
      menuType: "menuitem",
      onShowing: (_event: unknown, context: any) => {
        context.menuElem?.setAttribute("label", zh ? "创建投稿记录" : "Create Submission Record");
        context.setVisible(context.items?.length === 1 && context.items[0]?.isRegularItem?.());
      },
      onCommand: (_event: unknown, context: any) => {
        const item = context.items?.length === 1 && context.items[0]?.isRegularItem?.() ? context.items[0] : null;
        if (item) void openDashboard(itemToRef(item));
      }
    }]
  });
}

export function onMainWindowLoad(win: any): void {
  installToolsMenu(win);
}

export function onMainWindowUnload(win: any): void {
  removeToolsMenu(win);
}

export async function shutdown(): Promise<void> {
  for (const win of Zotero.getMainWindows?.() ?? []) removeToolsMenu(win);
  for (const id of menuIDs.splice(0)) Zotero.MenuManager.unregisterMenu(id);
  host?.close();
  host = null;
}
