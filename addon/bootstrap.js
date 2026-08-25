let module;
let chromeHandle;

function registerChrome(rootURI) {
  const addonManagerStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Ci.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(`${rootURI}manifest.json`);
  chromeHandle = addonManagerStartup.registerChrome(manifestURI, [
    ["content", "submission-tracker", `${rootURI}content/`],
  ]);
}

async function startup({ rootURI }) {
  try {
    await Zotero.initializationPromise;
    registerChrome(rootURI);
    const scope = {};
    Services.scriptloader.loadSubScriptWithOptions(`${rootURI}content/main.js`, {
      target: scope,
      charset: "UTF-8",
      ignoreCache: true,
    });
    module = scope.SubmissionTrackerModule;
    if (!module?.startup) {
      throw new Error("Submission Tracker: bundled module did not load");
    }
    await module.startup(rootURI, { Zotero, Services, IOUtils, PathUtils });
    Zotero.debug("Submission Tracker: startup completed");
  }
  catch (error) {
    chromeHandle?.destruct();
    chromeHandle = undefined;
    Zotero.logError(error);
    throw error;
  }
}

async function shutdown() {
  try {
    await module?.shutdown?.();
  }
  finally {
    module = undefined;
    chromeHandle?.destruct();
    chromeHandle = undefined;
  }
}

function onMainWindowLoad({ window }) {
  module?.onMainWindowLoad?.(window);
}

function onMainWindowUnload({ window }) {
  module?.onMainWindowUnload?.(window);
}

function install() {}
function uninstall() {}
