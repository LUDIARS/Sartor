import assert from "node:assert/strict";
import test from "node:test";

import type { FashionVector, Profile } from "../src/domain/types.js";
import { buildOutfitSystemPrompt, buildOutfitUserPrompt } from "../src/llm/prompt.js";

const profile: Profile = {
  id: 1,
  displayName: "private name",
  gender: "MEN",
  ageBand: "40s",
  heightCm: 181,
  weightKg: 86,
  topSize: "XL",
  bottomSize: "L",
  bodyNotes: "private free-form note",
  favColors: ["navy"],
  avoidColors: [],
  ngMaterials: [],
  usesDryer: false,
  avoidColorBleed: false,
  monthlyBudgetJpy: 30_000,
  updatedAt: "2026-08-20T00:00:00.000Z",
};
const vector: FashionVector = {
  ageBand: "40s",
  tpo: "work",
  styles: [{ style: "clean", weight: 3 }],
};

test("buildOutfitUserPrompt sends derived fit bands instead of exact measurements or free-form notes", () => {
  const request = JSON.parse(buildOutfitUserPrompt(profile, vector, 20_000, ["tops"], "autumn", [])) as {
    profile: Record<string, unknown>;
    season: string;
  };

  assert.equal(request.season, "autumn");
  assert.equal(request.profile.heightBand, "175 cm or taller");
  assert.equal(request.profile.build, "fuller");
  assert.equal("heightCm" in request.profile, false);
  assert.equal("weightKg" in request.profile, false);
  assert.equal("bodyNotes" in request.profile, false);
  assert.equal(JSON.stringify(request).includes("private"), false);
});

test("buildOutfitSystemPrompt treats profile and catalog strings as untrusted data", () => {
  assert.match(buildOutfitSystemPrompt(), /untrusted data/u);
  assert.match(buildOutfitSystemPrompt(), /availability is unknown/u);
});
