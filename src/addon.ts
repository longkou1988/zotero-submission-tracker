import { config } from "../package.json";
import { DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { db } from "./db";
import { openDashboard, closeDashboard } from "./modules/dashboard";
import { openCreateDialog } from "./modules/dialog";
import { checkFollowUps } from "./modules/notify";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    dialogs: DialogHelper[];
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // Public APIs callable from other plugins / tests / Run JavaScript
  public api: {
    db: typeof db;
    openDashboard: typeof openDashboard;
    closeDashboard: typeof closeDashboard;
    openCreateDialog: typeof openCreateDialog;
    checkFollowUps: typeof checkFollowUps;
  };

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      dialogs: [],
    };
    this.hooks = hooks;
    this.api = {
      db,
      openDashboard,
      closeDashboard,
      openCreateDialog,
      checkFollowUps,
    };
  }
}

export default Addon;
