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
  const eligible = garments
    .filter((garment) => garmentMatchesGender(garment, profile))
    .filter((garment) => requestedKinds.has(garment.kind))
    .filter((garment) => garmentFitsProfileSize(garment, profile))
    .filter((garment) => garment.priceJpy <= budgetJpy)
    .filter((garment) => !garmentUsesNgMaterial(garment, profile))
    .filter((garment) => !profile.usesDryer || garment.dryerOk !== false)
    .filter((garment) => !profile.avoidColorBleed || garment.colorBleedRisk !== "high")
    .sort((left, right) => left.priceJpy - right.priceJpy || left.id.localeCompare(right.id));
  return spreadAcrossKinds(eligible, [...requestedKinds]);
}

/**
 * 安い順の先頭だけを渡すと単一ブランド・最安帯に偏るので、種別ごとに枠を割り、
 * 各種別の価格順リストから等間隔に抜いて価格帯とブランドを散らす。
 */
function spreadAcrossKinds(sortedByPrice: readonly Garment[], kinds: readonly GarmentKind[]): Garment[] {
  const itemsByKind = kinds
    .map((kind) => sortedByPrice.filter((garment) => garment.kind === kind))
    .filter((items) => items.length > 0);
  if (itemsByKind.length === 0) {
    return [];
  }
  const counts = allocateEvenly(itemsByKind, MAXIMUM_CANDIDATES);
  return itemsByKind
    .flatMap((items, index) => pickEvenly(items, counts[index] ?? 0))
    .sort((left, right) => left.priceJpy - right.priceJpy || left.id.localeCompare(right.id));
}

function allocateEvenly(itemsByKind: readonly (readonly Garment[])[], maximum: number): number[] {
  const counts = itemsByKind.map(() => 0);
  for (let allocated = 0; allocated < maximum;) {
    let added = false;
    for (let index = 0; index < itemsByKind.length && allocated < maximum; index += 1) {
      const count = counts[index];
      const items = itemsByKind[index];
      if (count !== undefined && items !== undefined && count < items.length) {
        counts[index] = count + 1;
        allocated += 1;
        added = true;
      }
    }
    if (!added) {
      break;
    }
  }
  return counts;
}

function pickEvenly(items: readonly Garment[], count: number): Garment[] {
  if (items.length <= count) {
    return [...items];
  }
  const step = items.length / count;
  const picked: Garment[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(items[Math.floor(index * step)]!);
  }
  return picked;
}
