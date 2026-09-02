import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  new URL("../addon/content/dashboard.css", import.meta.url),
  "utf8",
);

test("top-level analytics panels stay full width inside the dashboard flex column", () => {
  assert.match(css, /\.st-dash\s*>\s*section\s*\{/);
  assert.match(css, /width:\s*100%;/);
  assert.match(css, /min-width:\s*0;/);
  assert.match(css, /flex-shrink:\s*0;/);
});
