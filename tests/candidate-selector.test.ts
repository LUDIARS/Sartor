import assert from "node:assert/strict";
import test from "node:test";

import type { Garment, GarmentKind, Profile } from "../src/domain/types.js";
import { selectCandidateGarments } from "../src/llm/candidate-selector.js";

const profile: Profile = {
  id: 1,
  displayName: null,
  gender: "WOMEN",
  ageBand: "30s",
  heightCm: 165,
  weightKg: 60,
  topSize: "M",
  bottomSize: "L",
  bodyNotes: null,
  favColors: [],
  avoidColors: [],
  ngMaterials: [],
  usesDryer: false,
  avoidColorBleed: false,
  monthlyBudgetJpy: 30_000,
  updatedAt: "2026-08-20T00:00:00.000Z",
};

function garment(id: string, kind: GarmentKind, sizes: readonly string[]): Garment {
  return {
    id,
    brand: "test",
    productId: id,
    priceGroup: "00",
    name: id,
    gender: "WOMEN",
    kind,
    priceJpy: 1_000,
    currency: "JPY",
    colors: [],
    sizes: [...sizes],
    composition: null,
    washingInformation: null,
    dryerOk: null,
    colorBleedRisk: null,
    careReasons: [],
    imageUrl: null,
    productUrl: `https://example.com/${id}`,
    rawJson: "{}",
    crawledAt: "2026-08-20T00:00:00.000Z",
  };
}

test("selectCandidateGarments applies top and bottom profile sizes to every sized clothing kind", () => {
  const garments = [
    garment("tops-match", "tops", ["M"]),
    garment("outer-miss", "outer", ["S"]),
    garment("onepiece-match", "onepiece", ["M"]),
    garment("inner-miss", "inner", ["S"]),
    garment("bottoms-match", "bottoms", ["L"]),
    garment("bottoms-miss", "bottoms", ["M"]),
    garment("shoes-unknown", "shoes", ["24.5"]),
  ];

  const selected = selectCandidateGarments(
    garments,
    profile,
    ["tops", "outer", "onepiece", "inner", "bottoms", "shoes"],
    10_000,
  );

  assert.deepEqual(selected.map(({ id }) => id), ["bottoms-match", "onepiece-match", "shoes-unknown", "tops-match"]);
});
