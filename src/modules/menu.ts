import { config } from "../../package.json";
import { db } from "../db";
import { getString } from "../utils/locale";
import { openCreateDialog } from "./dialog";
import { openDashboard } from "./dashboard";
import { openInquiryIfRecommended, showNextAction } from "./smartActions";

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
        label: getString("menu-next-action"),
        commandListener: () => showNextActionFromSelection(),
      },
      {
        tag: "menuitem",
        label: getString("menu-inquiry-assistant"),
        commandListener: () => openInquiryFromSelection(),
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

async function getSelectedSubmission() {
  const item = getSelectedRegularItems()[0];
  if (!item) return undefined;
  return db.getLatestForItem(item.libraryID, item.key);
}

async function showNextActionFromSelection(): Promise<void> {
  const record = await getSelectedSubmission();
  if (!record) {
    showNoSubmissionToast();
    return;
  }
  await showNextAction(record);
}

async function openInquiryFromSelection(): Promise<void> {
  const record = await getSelectedSubmission();
  if (!record) {
    showNoSubmissionToast();
    return;
  }
  await openInquiryIfRecommended(record);
}

function showNoSubmissionToast(): void {
  new ztoolkit.ProgressWindow(config.addonName, { closeTime: 4000 })
    .createLine({ text: getString("smart-action-no-record"), type: "default" })
    .show();
}
