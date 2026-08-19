import type { Garment, GarmentKind, Profile } from "../domain/types.js";

const MAXIMUM_CANDIDATES = 60;

function garmentMatchesGender(garment: Garment, profile: Profile): boolean {
  return profile.gender === "UNISEX" || garment.gender === "UNISEX" || garment.gender === profile.gender;
}

function garmentUsesNgMaterial(garment: Garment, profile: Profile): boolean {
  const composition = garment.composition?.toLocaleLowerCase() ?? "";
  return profile.ngMaterials.some((material) => composition.includes(material.toLocaleLowerCase()));
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
    .filter((garment) => garment.priceJpy <= budgetJpy)
    .filter((garment) => !garmentUsesNgMaterial(garment, profile))
    .filter((garment) => !profile.usesDryer || garment.dryerOk !== false)
    .filter((garment) => !profile.avoidColorBleed || garment.colorBleedRisk !== "high")
    .sort((left, right) => left.priceJpy - right.priceJpy || left.id.localeCompare(right.id))
    .slice(0, MAXIMUM_CANDIDATES);
}
