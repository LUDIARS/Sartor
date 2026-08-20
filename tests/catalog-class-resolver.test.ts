import assert from "node:assert/strict";
import test from "node:test";

import { kindForClassName } from "../src/crawl/brand-catalog.js";

test("kindForClassName classifies denim jackets before generic denim bottoms", () => {
  assert.equal(kindForClassName("デニムジャケット"), "outer");
  assert.equal(kindForClassName("ダウン・中綿"), "outer");
  assert.equal(kindForClassName("デニムパンツ"), "bottoms");
});
