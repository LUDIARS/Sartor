import assert from "node:assert/strict";
import test from "node:test";

import { judgeCare } from "../src/domain/care-rules.js";

test("judgeCare marks explicit dryer prohibition", () => {
  assert.equal(judgeCare("綿 100%", "乾燥機不可", "白").dryerOk, false);
});

test("judgeCare treats wool without a dryer label as dryer-incompatible", () => {
  assert.equal(judgeCare("100% 毛", "", "グレー").dryerOk, false);
});

test("judgeCare does not treat a minority wool blend as primarily wool", () => {
  assert.equal(judgeCare("90% ポリエステル, 10% 毛", "", "グレー").dryerOk, null);
});

test("judgeCare marks color-bleed instructions as high risk", () => {
  assert.equal(judgeCare("綿 100%", "色落ちすることがあります", "ネイビー").colorBleedRisk, "high");
});
