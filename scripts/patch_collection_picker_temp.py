from pathlib import Path

# 1) ui.ts: add a custom in-document collection picker, because native select popups
# do not open reliably inside ztoolkit dialog windows.
p = Path("src/modules/ui.ts")
t = p.read_text()
marker = "/** Resolve the display title of a library item, or null if it is gone. */"
insert = r'''
export interface CollectionPickerOption {
  id: number | null;
  label: string;
}

/**
 * Collection picker for toolkit dialog windows. Native HTML <select> popups
 * do not open reliably there, so the option list is rendered in-document.
 */
export function buildCollectionPicker(
  doc: Document,
  options: CollectionPickerOption[],
  selected: number | null,
): { el: HTMLElement; get value(): number | null } {
  const root = html(doc, "div", "st-collectionpicker");
  const trigger = html(
    doc,
    "button",
    "st-collectionpicker-trigger",
  ) as HTMLButtonElement;
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", "false");

  const triggerLabel = html(doc, "span", "st-collectionpicker-label");
  const chevron = html(doc, "span", "st-collectionpicker-chevron");
  chevron.textContent = "▾";
  trigger.append(triggerLabel, chevron);

  const menu = html(doc, "div", "st-collectionpicker-menu");
  menu.hidden = true;
  let value: number | null = selected;
  const rows = new Map<string, HTMLElement>();

  const keyFor = (id: number | null) => (id == null ? "root" : String(id));
  const selectedOption = () =>
    options.find((option) => option.id === value) || options[0];

  const sync = () => {
    triggerLabel.textContent = selectedOption()?.label || "—";
    for (const [key, row] of rows) {
      row.classList.toggle("st-collectionpicker-option--selected", key === keyFor(value));
    }
  };

  for (const option of options) {
    const row = html(
      doc,
      "button",
      "st-collectionpicker-option",
    ) as HTMLButtonElement;
    row.type = "button";
    row.textContent = option.label;
    row.dataset.collectionId = keyFor(option.id);
    row.addEventListener("click", () => {
      value = option.id;
      sync();
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    });
    rows.set(keyFor(option.id), row);
    menu.appendChild(row);
  }

  trigger.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
  });

  root.append(trigger, menu);
  sync();
  return {
    el: root,
    get value(): number | null {
      return value;
    },
  };
}

'''
if "export function buildCollectionPicker(" not in t:
    t = t.replace(marker, insert + marker, 1)
p.write_text(t)

# 2) dialog.ts: replace the broken native select with the custom picker.
p = Path("src/modules/dialog.ts")
t = p.read_text()
t = t.replace(
    'import { buildStatusPicker, html, statusBadge, statusLabel } from "./ui";',
    'import {\n  buildCollectionPicker,\n  buildStatusPicker,\n  html,\n  statusBadge,\n  statusLabel,\n} from "./ui";',
    1,
)
old = r'''      const collections = getAvailableCollections(targetLibraryID);
      const collectionSelect = html(
        doc,
        "select",
        "st-input",
      ) as HTMLSelectElement;
      const rootOption = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "option",
      ) as HTMLOptionElement;
      rootOption.value = "";
      rootOption.textContent = getString("dialog-collection-root");
      collectionSelect.appendChild(rootOption);
      for (const optionData of buildCollectionOptions(collections)) {
        const option = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "option",
        ) as HTMLOptionElement;
        option.value = String(optionData.id);
        option.textContent = optionData.label;
        collectionSelect.appendChild(option);
      }
      const defaultCollectionID = chooseDefaultCollectionID(
        getSelectedCollectionIDs(targetLibraryID),
        getRememberedCollectionID(targetLibraryID),
        collections,
      );
      collectionSelect.value =
        defaultCollectionID == null ? "" : String(defaultCollectionID);
      form.appendChild(
        buildField(
          doc,
          getString("dialog-collection"),
          [collectionSelect],
          getString("dialog-collection-hint"),
        ),
      );'''
new = r'''      const collections = getAvailableCollections(targetLibraryID);
      const defaultCollectionID = chooseDefaultCollectionID(
        getSelectedCollectionIDs(targetLibraryID),
        getRememberedCollectionID(targetLibraryID),
        collections,
      );
      const collectionPicker = buildCollectionPicker(
        doc,
        [
          { id: null, label: getString("dialog-collection-root") },
          ...buildCollectionOptions(collections),
        ],
        defaultCollectionID,
      );
      form.appendChild(
        buildField(
          doc,
          getString("dialog-collection"),
          [collectionPicker.el],
          getString("dialog-collection-hint"),
        ),
      );'''
if old not in t:
    raise SystemExit("native collection select block not found")
t = t.replace(old, new, 1)
old_save = r'''          const selectedCollectionID = collectionSelect.value
            ? Number(collectionSelect.value)
            : null;'''
new_save = r'''          const selectedCollectionID = collectionPicker.value;'''
if old_save not in t:
    raise SystemExit("collection select save block not found")
t = t.replace(old_save, new_save, 1)
p.write_text(t)

# 3) dialog.css: style the in-document picker and scrollable option list.
p = Path("addon/content/dialog.css")
t = p.read_text()
css = r'''

/* Collection picker. Rendered in-document because native <select> popups are
   broken in toolkit dialog windows. */
.st-collectionpicker {
  position: relative;
  flex: 1;
  min-width: 0;
}

.st-collectionpicker-trigger {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 6px;
  padding: 6px 9px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.st-collectionpicker-trigger:focus {
  border-color: var(--st-accent);
  outline: none;
}

.st-collectionpicker-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-collectionpicker-chevron {
  flex: none;
  opacity: 0.55;
}

.st-collectionpicker-menu {
  margin-top: 5px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 6px;
  padding: 4px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 5px 16px color-mix(in srgb, #000 18%, transparent);
}

.st-collectionpicker-menu[hidden] {
  display: none;
}

.st-collectionpicker-option {
  appearance: none;
  display: block;
  width: 100%;
  border: 0;
  border-radius: 4px;
  padding: 6px 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st-collectionpicker-option:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.st-collectionpicker-option--selected {
  background: color-mix(in srgb, var(--st-accent) 14%, transparent);
  color: var(--st-accent);
  font-weight: 600;
}
'''
if ".st-collectionpicker-trigger" not in t:
    t += css
p.write_text(t)
