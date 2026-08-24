export type ZoteroRuntime = {
  Zotero: any;
  Services: any;
  IOUtils: any;
  PathUtils: any;
  Components: any;
};

export let Zotero: any;
export let Services: any;
export let IOUtils: any;
export let PathUtils: any;
export let Components: any;

export function installRuntime(runtime: ZoteroRuntime): void {
  for (const name of ["Zotero", "Services", "IOUtils", "PathUtils", "Components"] as const) {
    if (!runtime?.[name]) throw new Error(`Submission Tracker: missing Zotero runtime dependency ${name}`);
  }
  ({ Zotero, Services, IOUtils, PathUtils, Components } = runtime);
}
