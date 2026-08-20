import assert from "node:assert/strict";
import test from "node:test";

import { isSubKindInSeason, seasonForDate } from "../src/domain/season-fit.js";

test("isSubKindInSeason keeps down jackets to winter only", () => {
  assert.equal(isSubKindInSeason("winter", "down"), true);
  assert.equal(isSubKindInSeason("autumn", "down"), false);
  assert.equal(isSubKindInSeason("spring", "down"), false);
  assert.equal(isSubKindInSeason("summer", "down"), false);
});

test("isSubKindInSeason drops heavy tops in summer and bare summer tops in winter", () => {
  assert.equal(isSubKindInSeason("summer", "knit"), false);
  assert.equal(isSubKindInSeason("summer", "hoodie"), false);
  assert.equal(isSubKindInSeason("summer", "shirt"), true);
  assert.equal(isSubKindInSeason("summer", "cardigan"), true);
  assert.equal(isSubKindInSeason("winter", "polo"), false);
  assert.equal(isSubKindInSeason("winter", "tshirt"), false);
  assert.equal(isSubKindInSeason("winter", "knit"), true);
});

test("seasonForDate maps months to the four seasons", () => {
  assert.equal(seasonForDate(new Date(2026, 2, 1)), "spring");
  assert.equal(seasonForDate(new Date(2026, 7, 20)), "summer");
  assert.equal(seasonForDate(new Date(2026, 9, 31)), "autumn");
  assert.equal(seasonForDate(new Date(2026, 11, 25)), "winter");
  assert.equal(seasonForDate(new Date(2026, 1, 1)), "winter");
});
