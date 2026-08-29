import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { openCreateDialog } from "./dialog";
import { openDashboard } from "./dashboard";

export function registerMenus(): void {
  const menuIcon = `chrome://${config.addonRef}/content/icons/section.svg`;

  ztoolkit.Menu.register("item", {
    tag: "menu",
    id: `${config.addonRef}-itemmenu-root`,
    label: getString("menu-root"),
    icon: menuIcon,
    children: [
      {
        tag: "menuitem",
        label: getString("menu-add"),
        commandListener: () => addSubmissionFromSelection(),
      },
      {
        tag: "menuitem",
        label: getString("menu-dashboard"),
        commandListener: () => openDashboard(),
      },
    ],
  });

  ztoolkit.Menu.register("menuTools", {
    tag: "menuseparator",
    id: `${config.addonRef}-tools-separator`,
  });
  ztoolkit.Menu.register("menuTools", {
    tag: "menuitem",
    id: `${config.addonRef}-tools-dashboard`,
    label: getString("menu-dashboard"),
    commandListener: () => openDashboard(),
  });
}

export function getSelectedRegularItems(): Zotero.Item[] {
  const win = Zotero.getMainWindow() as _ZoteroTypes.MainWindow;
  const items = (win as any).ZoteroPane?.getSelectedItems?.() || [];
  return (items as Zotero.Item[]).filter(
    (item) => item.isRegularItem() && !(item as any).isFeedItem,
  );
}

async function addSubmissionFromSelection(): Promise<void> {
  const items = getSelectedRegularItems();
  if (!items.length) {
    return;
  }
  await openCreateDialog(items);
}
