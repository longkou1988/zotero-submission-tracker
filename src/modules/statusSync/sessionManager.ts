export interface SpringerSessionResponse {
  finalUrl: string;
  documentHTML: string;
}

interface HiddenBrowserLike {
  load(source: string): Promise<boolean>;
  waitForDocument(): Promise<void>;
  getPageData(props: string[]): Promise<Record<string, unknown>>;
  currentURI?: { spec?: string } | null;
  destroy(): void;
}

interface HiddenBrowserConstructor {
  new (options: { allowJavaScript: boolean }): HiddenBrowserLike;
}

/**
 * Loads Springer inside Zotero's own hidden remote browser. No container
 * override is passed, so the browser stays in Zotero's default web context
 * and can reuse the session created by the user in the visible status tab.
 * The returned HTML is transient transport data and must never be persisted
 * or logged by callers.
 */
export class SessionManager {
  async requestSpringer(url: string): Promise<SpringerSessionResponse> {
    const HiddenBrowser = getHiddenBrowserConstructor();
    const browser = new HiddenBrowser({ allowJavaScript: true });
    try {
      const loaded = await browser.load(url);
      if (!loaded) {
        throw new Error("Springer page failed to load in Zotero");
      }
      await browser.waitForDocument();
      const pageData = await browser.getPageData(["documentHTML"]);
      const documentHTML = String(pageData.documentHTML || "");
      if (!documentHTML) {
        throw new Error("Springer page returned no document content");
      }
      return {
        finalUrl: browser.currentURI?.spec || url,
        documentHTML,
      };
    } finally {
      browser.destroy();
    }
  }
}

function getHiddenBrowserConstructor(): HiddenBrowserConstructor {
  const module = ChromeUtils.importESModule(
    "chrome://zotero/content/HiddenBrowser.mjs",
  ) as { HiddenBrowser: HiddenBrowserConstructor };
  return module.HiddenBrowser;
}

export const sessionManager = new SessionManager();
