import { garmentOffersSize } from "../domain/size.js";
import type { Garment, GarmentKind, Profile } from "../domain/types.js";

const MAXIMUM_CANDIDATES = 60;
const TOP_SIZE_KINDS: ReadonlySet<GarmentKind> = new Set(["tops", "outer", "onepiece", "inner"]);

function garmentMatchesGender(garment: Garment, profile: Profile): boolean {
  return profile.gender === "UNISEX" || garment.gender === "UNISEX" || garment.gender === profile.gender;
}

function garmentUsesNgMaterial(garment: Garment, profile: Profile): boolean {
  const composition = garment.composition?.toLocaleLowerCase() ?? "";
  return profile.ngMaterials.some((material) => composition.includes(material.toLocaleLowerCase()));
}

/** @implements SPEC-STEP1-PROTOTYPE §11 — 上半身基準の服は topSize、ボトムスは bottomSize で絞る。サイズ不明の商品は残す。 */
function garmentFitsProfileSize(garment: Garment, profile: Profile): boolean {
  if (TOP_SIZE_KINDS.has(garment.kind)) {
    return profile.topSize === null || garmentOffersSize(garment.sizes, profile.topSize);
  }
  if (garment.kind === "bottoms") {
    return profile.bottomSize === null || garmentOffersSize(garment.sizes, profile.bottomSize);
  }
  return true;
}

export function selectCandidateGarments(
  garments: readonly Garment[],
  profile: Profile,
  kinds: readonly GarmentKind[],
  budgetJpy: number,
): Garment[] {
  const requestedKinds = new Set(kinds);
  return garments
    .filter((garment) => garmentMatchesGender(garment, profile))
    .filter((garment) => requestedKinds.has(garment.kind))
    .filter((garment) => garmentFitsProfileSize(garment, profile))
    .filter((garment) => garment.priceJpy <= budgetJpy)
    .filter((garment) => !garmentUsesNgMaterial(garment, profile))
    .filter((garment) => !profile.usesDryer || garment.dryerOk !== false)
    .filter((garment) => !profile.avoidColorBleed || garment.colorBleedRisk !== "high")
    .sort((left, right) => left.priceJpy - right.priceJpy || left.id.localeCompare(right.id))
    .slice(0, MAXIMUM_CANDIDATES);
}
