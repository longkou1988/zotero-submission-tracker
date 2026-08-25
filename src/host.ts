import { TrackerService } from "./service";
import { JsonStore } from "./storage";
import { DashboardUI } from "./ui";
import { ZoteroItemRef } from "./core/types";
import { Services, Zotero } from "./runtime";

const WINDOW_TYPE = "submission-tracker:dashboard";
export const DASHBOARD_URL = "chrome://submission-tracker/content/dashboard.html";

type DashboardWindow = Pick<
  Window,
  "addEventListener" | "removeEventListener" | "closed" | "document" | "location"
>;

export function waitForDashboardDocument(
  win: DashboardWindow,
  timeoutMs = 10000,
  pollIntervalMs = 25,
): Promise<Document> {
  return new Promise<Document>((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (pollTimer !== null) clearTimeout(pollTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      win.removeEventListener("DOMContentLoaded", checkDocument as EventListener);
      win.removeEventListener("load", checkDocument as EventListener);
    };

    const finish = (document: Document) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(document);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    function checkDocument(): boolean {
      if (settled) return true;
      if (win.closed) {
        fail(new Error("The dashboard window closed before it finished loading."));
        return true;
      }
      try {
        const document = win.document;
        if (document?.getElementById("app")) {
          finish(document);
          return true;
        }
      } catch {
        // The initial window can be temporarily inaccessible while its chrome URL loads.
      }
      return false;
    }

    const poll = () => {
      pollTimer = null;
      if (!checkDocument()) pollTimer = setTimeout(poll, pollIntervalMs);
    };

    win.addEventListener("DOMContentLoaded", checkDocument as EventListener);
    win.addEventListener("load", checkDocument as EventListener);

    if (checkDocument()) return;
    pollTimer = setTimeout(poll, pollIntervalMs);
    timeoutTimer = setTimeout(() => {
      let details = "";
      try {
        details = ` URL: ${String(win.location?.href ?? "unknown")}; readyState: ${win.document?.readyState ?? "unknown"}.`;
      } catch {
        details = " The window document could not be inspected.";
      }
      fail(new Error(`Timed out while loading the dashboard window.${details}`));
    }, timeoutMs);
  });
}

export class DashboardHost {
  private win: Window | null = null;
  private ui: DashboardUI | null = null;

  constructor(private pluginVersion: string) {}

  async open(initialItem: ZoteroItemRef | null = null): Promise<void> {
    if (this.win && !this.win.closed) {
      this.win.focus();
      if (initialItem) this.ui?.createForItem(initialItem);
      return;
    }

    const existing = Services.wm?.getMostRecentWindow?.(WINDOW_TYPE) as Window | null;
    if (existing && !existing.closed) {
      this.win = existing;
      this.win.focus();
      return;
    }

    const parent = Zotero.getMainWindow?.() ?? Zotero.getMainWindows?.()[0] ?? null;
    const features = "chrome,centerscreen,resizable,dialog=no,width=1280,height=800";
    let opened: Window | null = null;

    try {
      opened = (Services.ww?.openWindow?.(parent, DASHBOARD_URL, "submission-tracker-dashboard", features, null)
        ?? parent?.openDialog?.(DASHBOARD_URL, "submission-tracker-dashboard", features)) as Window | null;
      if (!opened) throw new Error("Zotero did not create the Submission Tracker window.");

      this.win = opened;
      opened.addEventListener("unload", () => { this.win = null; this.ui = null; }, { once: true });
      const dashboardDocument = await waitForDashboardDocument(opened);
      dashboardDocument.documentElement.setAttribute("windowtype", WINDOW_TYPE);
      if (!dashboardDocument.getElementById("app")) {
        throw new Error("The dashboard document loaded without its application container.");
      }

      const dataDirectory = Zotero.DataDirectory?.dir;
      if (!dataDirectory) throw new Error("Zotero data directory is unavailable.");
      const service = new TrackerService(new JsonStore(this.pluginVersion, dataDirectory));
      await service.init();
      this.ui = new DashboardUI(opened, service, initialItem, dashboardDocument);
      await this.ui.init();
      opened.focus();
    } catch (error) {
      if (opened && !opened.closed) opened.close();
      this.win = null;
      this.ui = null;
      throw error;
    }
  }

  close(): void {
    if (this.win && !this.win.closed) this.win.close();
    this.win = null;
    this.ui = null;
  }
}
