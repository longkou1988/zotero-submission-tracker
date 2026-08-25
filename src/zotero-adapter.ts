import { ZoteroItemRef } from "./core/types";
import { Services, Zotero } from "./runtime";

export function regularSelectedItem(win: any): any | null {
  const items = win?.ZoteroPane?.getSelectedItems?.() ?? [];
  return items.length === 1 && items[0]?.isRegularItem?.() ? items[0] : null;
}

export function itemToRef(item: any): ZoteroItemRef {
  const library = Zotero.Libraries.get(item.libraryID);
  const group = library?.libraryType === "group";
  return {
    libraryType: group ? "group" : "user",
    ...(group ? { groupID: library.groupID } : {}),
    itemKey: item.key,
    cachedTitle: item.getField("title") || "Untitled"
  };
}

export function resolveItem(ref: ZoteroItemRef): any | null {
  let libraryID = Zotero.Libraries.userLibraryID;
  if (ref.libraryType === "group") {
    const group = Zotero.Groups.getByGroupID(ref.groupID);
    if (!group) return null;
    libraryID = group.libraryID;
  }
  return Zotero.Items.getByLibraryAndKey(libraryID, ref.itemKey) ?? null;
}

export async function selectItem(ref: ZoteroItemRef): Promise<boolean> {
  const item = resolveItem(ref);
  if (!item) return false;
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  win.focus();
  await win.ZoteroPane.selectItem(item.id);
  return true;
}

export function openURL(url: string): void {
  const uri = Services.io.newURI(url);
  if (!["http", "https"].includes(uri.scheme)) throw new Error("Only HTTP(S) login addresses are allowed");
  Zotero.launchURL(uri.spec);
}

export async function copyText(text: string): Promise<void> {
  Zotero.Utilities.Internal.copyTextToClipboard(text);
}
