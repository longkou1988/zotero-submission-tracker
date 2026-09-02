from pathlib import Path

branch_files = {
    "src/modules/dialog.ts": Path("src/modules/dialog.ts"),
    "addon/prefs.js": Path("addon/prefs.js"),
    "typings/prefs.d.ts": Path("typings/prefs.d.ts"),
    "addon/locale/zh-CN/addon.ftl": Path("addon/locale/zh-CN/addon.ftl"),
    "addon/locale/en-US/addon.ftl": Path("addon/locale/en-US/addon.ftl"),
    "typings/i10n.d.ts": Path("typings/i10n.d.ts"),
}

# dialog.ts
p = branch_files["src/modules/dialog.ts"]
t = p.read_text()
t = t.replace('import { getPref } from "../utils/prefs";', 'import { getPref, setPref } from "../utils/prefs";', 1)
t = t.replace('import { openStatusPage } from "./statusPage";', 'import { openStatusPage } from "./statusPage";\nimport { buildCollectionOptions, chooseDefaultCollectionID } from "./collectionPlacement";', 1)

marker = '/** The Zotero item a submission record points at, or null if it is gone. */'
helpers = '''function getAvailableCollections(libraryID: number): Zotero.Collection[] {\n  try {\n    return (Zotero.Collections.getByLibrary(libraryID, true) || []).filter(\n      (collection: Zotero.Collection) => !collection.deleted,\n    );\n  } catch (e) {\n    ztoolkit.log("submissiontracker: get collections failed", e);\n    return [];\n  }\n}\n\nfunction getSelectedCollectionIDs(libraryID: number): number[] {\n  try {\n    const pane = Zotero.getActiveZoteroPane?.() as any;\n    if (!pane) return [];\n    let selected: Zotero.Collection[] = [];\n    if (typeof pane.getSelectedCollections === "function") {\n      selected = pane.getSelectedCollections() || [];\n    } else if (typeof pane.getSelectedCollection === "function") {\n      const collection = pane.getSelectedCollection();\n      if (collection) selected = [collection];\n    }\n    return selected\n      .filter((collection) => collection.libraryID === libraryID && !collection.deleted)\n      .map((collection) => collection.id);\n  } catch (e) {\n    ztoolkit.log("submissiontracker: get selected collection failed", e);\n    return [];\n  }\n}\n\nfunction getRememberedCollectionID(libraryID: number): number | null {\n  const raw = String(getPref("collection.lastTarget") || "");\n  const [savedLibrary, savedCollection] = raw.split(":");\n  if (Number(savedLibrary) !== libraryID || !savedCollection || savedCollection === "root") {\n    return null;\n  }\n  const id = Number(savedCollection);\n  return Number.isFinite(id) ? id : null;\n}\n\n'''
if helpers.strip() not in t:
    t = t.replace(marker, helpers + marker, 1)

# Insert collection selector after date field
needle = '''      dateInput.value = todayStr();\n      form.appendChild(buildField(doc, getString("dialog-date"), [dateInput]));\n\n      const followInput'''
replacement = '''      dateInput.value = todayStr();\n      form.appendChild(buildField(doc, getString("dialog-date"), [dateInput]));\n\n      const targetLibraryID = items[0]?.libraryID || Zotero.Libraries.userLibraryID;\n      const collections = getAvailableCollections(targetLibraryID);\n      const collectionSelect = html(doc, "select", "st-input") as HTMLSelectElement;\n      const rootOption = doc.createElementNS(\n        "http://www.w3.org/1999/xhtml",\n        "option",\n      ) as HTMLOptionElement;\n      rootOption.value = "";\n      rootOption.textContent = getString("dialog-collection-root");\n      collectionSelect.appendChild(rootOption);\n      for (const optionData of buildCollectionOptions(collections)) {\n        const option = doc.createElementNS(\n          "http://www.w3.org/1999/xhtml",\n          "option",\n        ) as HTMLOptionElement;\n        option.value = String(optionData.id);\n        option.textContent = optionData.label;\n        collectionSelect.appendChild(option);\n      }\n      const defaultCollectionID = chooseDefaultCollectionID(\n        getSelectedCollectionIDs(targetLibraryID),\n        getRememberedCollectionID(targetLibraryID),\n        collections,\n      );\n      collectionSelect.value = defaultCollectionID == null ? "" : String(defaultCollectionID);\n      form.appendChild(\n        buildField(\n          doc,\n          getString("dialog-collection"),\n          [collectionSelect],\n          getString("dialog-collection-hint"),\n        ),\n      );\n\n      const followInput'''
if needle not in t:
    raise SystemExit("date insertion point not found")
t = t.replace(needle, replacement, 1)

# Modify save loop
needle = '''          const date = dateInput.value || todayStr();\n          for (const _source of items) {\n            // Placeholder workflow: each submission gets its own new item,\n            // titled after the journal. The right-clicked source item is\n            // only the launch context and is left untouched.\n            const placeholder = new Zotero.Item("journalArticle");\n            placeholder.setField("title", journal);\n            placeholder.setField("date", date);\n            await placeholder.saveTx();'''
replacement = '''          const date = dateInput.value || todayStr();\n          const selectedCollectionID = collectionSelect.value\n            ? Number(collectionSelect.value)\n            : null;\n          setPref(\n            "collection.lastTarget",\n            `${targetLibraryID}:${selectedCollectionID == null ? "root" : selectedCollectionID}`,\n          );\n          for (const _source of items) {\n            // Placeholder workflow: each submission gets its own new item.\n            // It is created in the source library and optionally filed into\n            // the collection chosen above; the source item remains untouched.\n            const placeholder = new Zotero.Item("journalArticle");\n            placeholder.libraryID = targetLibraryID;\n            placeholder.setField("title", journal);\n            placeholder.setField("date", date);\n            await placeholder.saveTx();\n            if (selectedCollectionID != null) {\n              placeholder.addToCollection(selectedCollectionID);\n              await placeholder.saveTx();\n            }'''
if needle not in t:
    raise SystemExit("save loop insertion point not found")
t = t.replace(needle, replacement, 1)
p.write_text(t)

# prefs.js
p = branch_files["addon/prefs.js"]
s = p.read_text()
if 'pref("collection.lastTarget"' not in s:
    s += 'pref("collection.lastTarget", "");\n'
p.write_text(s)

# prefs typings
p = branch_files["typings/prefs.d.ts"]
s = p.read_text()
needle = '      "reminder.remindedMap": string;\n'
if '"collection.lastTarget"' not in s:
    s = s.replace(needle, needle + '      "collection.lastTarget": string;\n', 1)
p.write_text(s)

# locales
zh = branch_files["addon/locale/zh-CN/addon.ftl"]
s = zh.read_text()
if "dialog-collection =" not in s:
    s += '\ndialog-collection = 保存到分类\ndialog-collection-root = 资料库根目录\ndialog-collection-hint = 默认跟随当前选中的 Zotero 分类，也可以手动选择其他分类\n'
zh.write_text(s)

en = branch_files["addon/locale/en-US/addon.ftl"]
s = en.read_text()
if "dialog-collection =" not in s:
    s += '\ndialog-collection = Save to collection\ndialog-collection-root = Library root\ndialog-collection-hint = Defaults to the currently selected Zotero collection; you can choose another collection here\n'
en.write_text(s)

# i10n typings
p = branch_files["typings/i10n.d.ts"]
s = p.read_text()
needle = "  | 'dialog-cancel'\n"
add = "  | 'dialog-collection'\n  | 'dialog-collection-hint'\n  | 'dialog-collection-root'\n"
if "'dialog-collection'" not in s:
    s = s.replace(needle, needle + add, 1)
p.write_text(s)
