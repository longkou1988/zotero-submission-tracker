import { config } from "../package.json";
import { DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { db } from "./db";
import { openDashboard, closeDashboard } from "./modules/dashboard";
import { openCreateDialog } from "./modules/dialog";
import { checkFollowUps } from "./modules/notify";
import { runSpringerProbe } from "./modules/statusSync/springerProbe";
import {
  openSpringerLogin,
  runSpringerDiscoveryCheck,
} from "./modules/statusSync/springerDiscoveryCheck";

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
    runSpringerProbe?: typeof runSpringerProbe;
    runSpringerDiscoveryCheck?: typeof runSpringerDiscoveryCheck;
    openSpringerLogin?: typeof openSpringerLogin;
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
    (this.data as any).buildTag = `shared-login-r4-${Date.now().toString(36)}`;
    this.hooks = hooks;
    this.api = {
      db,
      openDashboard,
      closeDashboard,
      openCreateDialog,
      checkFollowUps,
    };
    if (this.data.env === "development") {
      this.api.runSpringerProbe = runSpringerProbe;
      this.api.runSpringerDiscoveryCheck = runSpringerDiscoveryCheck;
      this.api.openSpringerLogin = openSpringerLogin;
    }
  }
}

export default Addon;
