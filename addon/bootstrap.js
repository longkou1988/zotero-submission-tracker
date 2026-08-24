let module;

const RuntimeServices = ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs",
).Services;
const RuntimeIOUtils = ChromeUtils.importESModule(
  "resource://gre/modules/IOUtils.sys.mjs",
).IOUtils;
const RuntimePathUtils = ChromeUtils.importESModule(
  "resource://gre/modules/PathUtils.sys.mjs",
).PathUtils;

async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  module = ChromeUtils.importESModule(`${rootURI}content/main.sys.mjs`);
  await module.startup(rootURI, {
    Zotero,
    Services: RuntimeServices,
    IOUtils: RuntimeIOUtils,
    PathUtils: RuntimePathUtils,
    Components,
  });
}

async function shutdown() {
  await module?.shutdown?.();
  module = undefined;
}

function install() {}
function uninstall() {}
