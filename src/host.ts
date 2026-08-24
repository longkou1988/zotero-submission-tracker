import { TrackerService } from "./service";
import { JsonStore } from "./storage";
import { DashboardUI } from "./ui";
import { ZoteroItemRef } from "./core/types";
import { Services, Zotero } from "./runtime";

const WINDOW_TYPE = "submission-tracker:dashboard";

export class DashboardHost {
  private win: Window | null = null;
  private ui: DashboardUI | null = null;

  constructor(private rootURI: string, private pluginVersion: string) {}

  async open(initialItem: ZoteroItemRef | null = null): Promise<void> {
    if (this.win && !this.win.closed) {
      this.win.focus();
      if (initialItem) this.ui?.createForItem(initialItem);
      return;
    }

    const existing = Services.wm.getMostRecentWindow(WINDOW_TYPE) as Window | null;
    if (existing && !existing.closed) {
      this.win = existing;
      this.win.focus();
      return;
    }

    const opened = Services.ww.openWindow(
      null,
      `${this.rootURI}content/dashboard.xhtml`,
      "submission-tracker-dashboard",
      "chrome,centerscreen,resizable,dialog=no",
      null
    ) as Window;
    this.win = opened;
    await new Promise<void>(resolve => {
      if (opened.document.readyState === "complete") resolve();
      else opened.addEventListener("load", () => resolve(), { once: true });
    });
    opened.document.documentElement.setAttribute("windowtype", WINDOW_TYPE);

    const service = new TrackerService(new JsonStore(this.pluginVersion, Zotero.DataDirectory.dir));
    await service.init();
    this.ui = new DashboardUI(opened, service, initialItem);
    opened.addEventListener("unload", () => { this.win = null; this.ui = null; }, { once: true });
    await this.ui.init();
  }

  close(): void {
    if (this.win && !this.win.closed) this.win.close();
    this.win = null;
    this.ui = null;
  }
}
