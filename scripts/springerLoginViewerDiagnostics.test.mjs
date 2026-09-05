import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { SessionManager } from "../src/modules/statusSync/sessionManager.ts";

function makeViewer() {
  const actor = {
    async sendQuery(name) {
      assert.equal(name, "documentHTML");
      return `
        <main data-test="research-tracker-container">
          <div data-test="research-tracker-count-label">4 submissions</div>
          <div data-test="submissions-list">
            <article data-test="research-tracker-item">Private title</article>
          </div>
        </main>`;
    },
  };
  const browser = {
    currentURI: {
      spec: "https://link.springernature.com/home/?tab=submitted&token=secret",
    },
    browsingContext: {
      currentWindowGlobal: {
        getActor(name) {
          assert.equal(name, "PageData");
          return actor;
        },
      },
    },
  };
  return {
    closed: false,
    document: {
      querySelector(selector) {
        assert.equal(selector, "browser");
        return browser;
      },
    },
  };
}

test("session manager can inspect the exact visible Springer login viewer", async () => {
  const viewer = makeViewer();
  const manager = new SessionManager({
    createCookieContext() {
      return { id: 88 };
    },
    openInViewer() {
      return viewer;
    },
    createHiddenBrowser() {
      throw new Error("hidden browser must not be used for viewer diagnostics");
    },
  });

  manager.openSpringerLogin("https://link.springernature.com/home/?tab=submitted");
  const snapshot = await manager.inspectSpringerLoginViewer();

  assert.equal(
    snapshot.finalUrl,
    "https://link.springernature.com/home/?tab=submitted&token=secret",
  );
  assert.equal(snapshot.documentHTML.includes("research-tracker-item"), true);
});

test("visible viewer diagnostics are exposed only through the development API", () => {
  const addonSource = readFileSync(
    new URL("../src/addon.ts", import.meta.url),
    "utf8",
  );
  const checkSource = readFileSync(
    new URL(
      "../src/modules/statusSync/springerDiscoveryCheck.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(checkSource, /checkSpringerLoginViewer/);
  assert.match(addonSource, /checkSpringerLoginViewer\?:/);
  assert.match(
    addonSource,
    /if\s*\(this\.data\.env\s*===\s*["']development["']\)[\s\S]*checkSpringerLoginViewer/,
  );
});
