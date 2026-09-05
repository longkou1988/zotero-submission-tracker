import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "../src/modules/statusSync/sessionManager.ts";

function makeBrowser(optionsSeen) {
  return {
    currentURI: { spec: "https://link.springernature.com/home/?tab=submitted" },
    async load() {
      return true;
    },
    async waitForDocument() {},
    async getPageData() {
      return { documentHTML: "<html><body>account</body></html>" };
    },
    destroy() {},
    optionsSeen,
  };
}

test("Springer visible login and hidden scans share one isolated cookie context", async () => {
  let cookieContextCalls = 0;
  const viewerCalls = [];
  const browserOptions = [];

  const manager = new SessionManager({
    createCookieContext() {
      cookieContextCalls += 1;
      return { id: 41 };
    },
    openInViewer(uri, options) {
      viewerCalls.push({ uri, options });
      return { kind: "viewer" };
    },
    createHiddenBrowser(options) {
      browserOptions.push(options);
      return makeBrowser(options);
    },
  });

  const viewer = manager.openSpringerLogin(
    "https://link.springernature.com/home/?tab=submitted",
  );
  assert.deepEqual(viewer, { kind: "viewer" });
  assert.deepEqual(viewerCalls, [
    {
      uri: "https://link.springernature.com/home/?tab=submitted",
      options: { userContextId: 41 },
    },
  ]);

  const response = await manager.requestSpringer(
    "https://link.springernature.com/home/?tab=submitted",
  );

  assert.equal(cookieContextCalls, 1);
  assert.equal(browserOptions.length, 1);
  assert.deepEqual(browserOptions[0], {
    allowJavaScript: true,
    userContextId: 41,
  });
  assert.equal(response.documentHTML.includes("account"), true);
});

test("Springer cookie context is stable for repeated login and scan calls", async () => {
  let nextId = 70;
  const usedIds = [];

  const manager = new SessionManager({
    createCookieContext() {
      return { id: nextId++ };
    },
    openInViewer(_uri, options) {
      usedIds.push(options.userContextId);
      return null;
    },
    createHiddenBrowser(options) {
      usedIds.push(options.userContextId);
      return makeBrowser(options);
    },
  });

  manager.openSpringerLogin("https://link.springernature.com/home/?tab=submitted");
  await manager.requestSpringer("https://link.springernature.com/home/?tab=submitted");
  manager.openSpringerLogin("https://link.springernature.com/home/?tab=submitted");

  assert.deepEqual(usedIds, [70, 70, 70]);
});
