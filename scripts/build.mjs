import { build } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = resolve(root, "build");
const stage = resolve(buildDir, "staging");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "addon/manifest.json"), "utf8"));

if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
}
const zotero = manifest.applications?.zotero;
if (!zotero?.id || !zotero.update_url || !zotero.strict_min_version || !zotero.strict_max_version) {
  throw new Error("manifest.json must define applications.zotero with id, update_url, strict_min_version, and strict_max_version");
}
try {
  const updateUrl = new URL(zotero.update_url);
  if (updateUrl.protocol !== "https:") {
    throw new Error("not HTTPS");
  }
} catch {
  throw new Error("applications.zotero.update_url must be a valid HTTPS URL");
}

for (const locale of ["en-US", "zh-CN"]) {
  const fluent = await readFile(resolve(root, `addon/locale/${locale}/submission-tracker.ftl`), "utf8");
  for (const messageID of ["submission-tracker-open", "submission-tracker-create"]) {
    const labelPattern = new RegExp(`^${messageID}\\s*=\\s*\\n\\s+\\.label\\s*=\\s*\\S`, "m");
    if (!labelPattern.test(fluent)) {
      throw new Error(`${locale}/${messageID} must define a Fluent .label attribute for Zotero.MenuManager`);
    }
  }
}

const xpi = resolve(buildDir, `submission-tracker-${packageJson.version}.xpi`);

await rm(buildDir, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(resolve(root, "addon"), stage, { recursive: true });
await build({
  entryPoints: [resolve(root, "src/main.ts")],
  outfile: resolve(stage, "content/main.sys.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "firefox140",
  sourcemap: false,
  legalComments: "none"
});

await new Promise((resolvePromise, reject) => {
  const child = spawn("zip", ["-q", "-r", xpi, "."], { cwd: stage, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolvePromise() : reject(new Error(`zip exited with ${code}`)));
});
console.log(xpi);
