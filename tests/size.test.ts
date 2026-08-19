import assert from "node:assert/strict";
import { test } from "node:test";

import { garmentOffersSize, normalizeSizeLabel } from "../src/domain/size.js";

test("normalizeSizeLabel maps Japanese aliases to canonical labels", () => {
  const cases: readonly [string, string | undefined][] = [
    ["L", "L"], ["Lサイズ", "L"], ["ＬＬ", "XL"], ["LL", "XL"], ["3L", "XXL"], ["4L", "3XL"], ["5L", "4XL"],
    ["2XL", "XXL"], ["xl", "XL"], ["76cm / M", "M"], ["MEN M", "M"], ["XL (LL)", "XL"],
    ["M / L", undefined], ["76cm", undefined], ["30inch", undefined], ["スタイル", undefined],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(normalizeSizeLabel(raw), expected, raw);
  }
});

test("garmentOffersSize keeps unknown-size garments and filters known ones", () => {
  assert.equal(garmentOffersSize([], "L"), true);
  assert.equal(garmentOffersSize(["28", "30", "32"], "L"), true);
  assert.equal(garmentOffersSize(["S", "M", "L"], "L"), true);
  assert.equal(garmentOffersSize(["S", "M"], "L"), false);
  assert.equal(garmentOffersSize(["M", "LL"], "XL"), true);
});
