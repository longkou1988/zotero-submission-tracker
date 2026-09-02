import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/modules/analyticsDashboard.ts", import.meta.url),
  "utf8",
);

test("journal performance panel keeps full width and isolates horizontal table scrolling", () => {
  assert.match(source, /panel\.style\.width = "100%"/);
  assert.match(source, /panel\.style\.minWidth = "0"/);
  assert.doesNotMatch(source, /panel\.style\.overflowX = "auto"/);
  assert.match(source, /tableScroll\.style\.overflowX = "auto"/);
  assert.match(source, /tableScroll\.appendChild\(table\)/);
});
