import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCollectionOptions,
  chooseDefaultCollectionID,
} from "../src/modules/collectionPlacement.ts";

const collections = [
  { id: 10, libraryID: 1, name: "Research", parentID: null, deleted: false },
  { id: 11, libraryID: 1, name: "FoMO-AI", parentID: 10, deleted: false },
  { id: 12, libraryID: 1, name: "Accepted", parentID: 11, deleted: false },
  { id: 13, libraryID: 1, name: "Old", parentID: null, deleted: true },
];

test("collection options include nested paths and exclude deleted collections", () => {
  assert.deepEqual(buildCollectionOptions(collections), [
    { id: 10, label: "Research" },
    { id: 11, label: "Research / FoMO-AI" },
    { id: 12, label: "Research / FoMO-AI / Accepted" },
  ]);
});

test("current single collection takes priority over remembered collection", () => {
  assert.equal(chooseDefaultCollectionID([11], 12, collections), 11);
});

test("remembered collection is used when current selection is not a single valid collection", () => {
  assert.equal(chooseDefaultCollectionID([], 12, collections), 12);
  assert.equal(chooseDefaultCollectionID([10, 11], 12, collections), 12);
});

test("root is used when remembered or selected collections are invalid", () => {
  assert.equal(chooseDefaultCollectionID([], 13, collections), null);
  assert.equal(chooseDefaultCollectionID([999], 999, collections), null);
});

test("create dialog uses custom collection picker instead of broken native select", () => {
  const source = readFileSync("src/modules/dialog.ts", "utf8");
  assert.match(source, /buildCollectionPicker/);
  assert.doesNotMatch(source, /const collectionSelect = html\(/);
});
