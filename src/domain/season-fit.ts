import type { GarmentSubKind } from "./garment-subkind.js";
import type { Season } from "./types.js";

/**
 * @implements SPEC-STEP1D §1 — 季節に合わない細分類は候補に出さない (冬以外にダウンを出さない等)。
 * 除外は細分類単位で持つ。素材や商品名からの推測はしない。
 */
const outOfSeasonSubKinds: Readonly<Record<Season, readonly GarmentSubKind[]>> = {
  spring: ["down"],
  summer: [
    "down",
    "coat",
    "gilet",
    "blouson",
    "denim-jacket",
    "mountain-parka",
    "knit",
    "sweat",
    "hoodie",
    "boots",
  ],
  autumn: ["down"],
  winter: ["polo", "tshirt", "shorts"],
};

export function isSubKindInSeason(season: Season, subKind: GarmentSubKind): boolean {
  return !outOfSeasonSubKinds[season].includes(subKind);
}

/** @implements SPEC-STEP1D §2 — ベクトルで季節が未指定なら、実行日の月から季節を決める。 */
export function seasonForDate(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) {
    return "spring";
  }
  if (month >= 6 && month <= 8) {
    return "summer";
  }
  if (month >= 9 && month <= 11) {
    return "autumn";
  }
  return "winter";
}
