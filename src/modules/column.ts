import { config } from "../../package.json";
import { db } from "../db";
import { isSubmissionStatus, SubmissionStatus } from "../types";
import { getString } from "../utils/locale";
import { HTML_NS, statusBadge } from "./ui";

export async function registerStatusColumn(): Promise<void> {
  await Zotero.ItemTreeManager.registerColumn({
    dataKey: "submissionStatus",
    pluginID: config.addonID,
    label: getString("column-status-label"),
    iconPath: `chrome://${config.addonRef}/content/icons/section.svg`,
    dataProvider: (item: Zotero.Item) => {
      const record = db.getLatestForItem(item.libraryID, item.key);
      return record ? record.currentStatus : "";
    },
    renderCell: (
      _index: number,
      data: string,
      _column: any,
      _isFirstColumn: boolean,
      doc: Document,
    ) => {
      const cell = doc.createElementNS(HTML_NS, "span") as HTMLElement;
      cell.className = "st-cell";
      if (data && isSubmissionStatus(data)) {
        const badge = statusBadge(doc, data as SubmissionStatus);
        badge.classList.add("st-badge--sm", "st-badge--cell");
        cell.appendChild(badge);
      }
      return cell;
    },
  });
}
