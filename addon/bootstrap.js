let module;

async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  module = ChromeUtils.importESModule(`${rootURI}content/main.sys.mjs`);
  await module.startup(rootURI);
}

async function shutdown() {
  await module?.shutdown?.();
  module = undefined;
}

function install() {}
function uninstall() {}
