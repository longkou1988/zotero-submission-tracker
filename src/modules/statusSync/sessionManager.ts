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

interface HiddenBrowserOptions {
  allowJavaScript: boolean;
  userContextId: number;
}

interface HiddenBrowserConstructor {
  new (options: HiddenBrowserOptions): HiddenBrowserLike;
}

interface CookieContextLike {
  id: number;
}

interface SessionManagerDeps {
  createCookieContext(): CookieContextLike;
  openInViewer(
    uri: string,
    options: { userContextId: number },
  ): unknown;
  createHiddenBrowser(options: HiddenBrowserOptions): HiddenBrowserLike;
}

const defaultDeps: SessionManagerDeps = {
  createCookieContext() {
    const httpWithCookieContext = Zotero.HTTP as unknown as {
      newCookieContext(): CookieContextLike;
    };
    return httpWithCookieContext.newCookieContext();
  },
  openInViewer(uri, options) {
    const zoteroWithViewer = Zotero as unknown as {
      openInViewer(
        uri: string,
        options: { userContextId: number },
      ): unknown;
    };
    return zoteroWithViewer.openInViewer(uri, options);
  },
  createHiddenBrowser(options) {
    const HiddenBrowser = getHiddenBrowserConstructor();
    return new HiddenBrowser(options);
  },
};

/**
 * Owns the isolated Springer browser session used by both interactive login
 * and background discovery/status requests. The cookie context object stays
 * in memory for the lifetime of this manager; callers never read or persist
 * cookies, tokens, or credentials.
 */
export class SessionManager {
  private readonly deps: SessionManagerDeps;
  private cookieContext: CookieContextLike | null = null;

  constructor(deps: Partial<SessionManagerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  openSpringerLogin(url: string): unknown {
    return this.deps.openInViewer(url, {
      userContextId: this.getUserContextId(),
    });
  }

  async requestSpringer(url: string): Promise<SpringerSessionResponse> {
    const browser = this.deps.createHiddenBrowser({
      allowJavaScript: true,
      userContextId: this.getUserContextId(),
    });
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

  private getUserContextId(): number {
    if (!this.cookieContext) {
      this.cookieContext = this.deps.createCookieContext();
    }
    return this.cookieContext.id;
  }
}

function getHiddenBrowserConstructor(): HiddenBrowserConstructor {
  const module = ChromeUtils.importESModule(
    "chrome://zotero/content/HiddenBrowser.mjs",
  ) as { HiddenBrowser: HiddenBrowserConstructor };
  return module.HiddenBrowser;
}

export const sessionManager = new SessionManager();
