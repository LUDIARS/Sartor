import { z } from "zod";

import { type GarmentKind } from "./garment-kind.js";

/** @implements SPEC-STEP1C §1 — 大分類だけでは「トップス枠が全部 T シャツ」になるため、提案に効く粒度の細分類を持つ。 */
export const garmentSubKindSchema = z.enum([
  "shirt",
  "polo",
  "tshirt",
  "cutsew",
  "knit",
  "cardigan",
  "vest",
  "sweat",
  "hoodie",
  "tailored-jacket",
  "denim-jacket",
  "blouson",
  "mountain-parka",
  "coat",
  "down",
  "gilet",
  "slacks",
  "chino",
  "denim",
  "cargo",
  "shorts",
  "skirt",
  "leather-shoes",
  "sneaker",
  "boots",
  "dress",
  "innerwear",
  "other",
]);
export type GarmentSubKind = z.infer<typeof garmentSubKindSchema>;

const subKindsByKind: Readonly<Record<GarmentKind, readonly GarmentSubKind[]>> = {
  tops: ["shirt", "polo", "tshirt", "cutsew", "knit", "cardigan", "vest", "sweat", "hoodie", "other"],
  outer: ["tailored-jacket", "denim-jacket", "blouson", "mountain-parka", "coat", "down", "gilet", "other"],
  bottoms: ["slacks", "chino", "denim", "cargo", "shorts", "skirt", "other"],
  shoes: ["leather-shoes", "sneaker", "boots", "other"],
  onepiece: ["dress", "other"],
  inner: ["innerwear", "other"],
  accessory: ["other"],
  other: ["other"],
};

const subKindLabels: Readonly<Record<GarmentSubKind, string>> = {
  shirt: "シャツ",
  polo: "ポロシャツ",
  tshirt: "Tシャツ",
  cutsew: "カットソー",
  knit: "ニット・セーター",
  cardigan: "カーディガン",
  vest: "ベスト",
  sweat: "スウェット",
  hoodie: "パーカ",
  "tailored-jacket": "テーラードジャケット",
  "denim-jacket": "デニムジャケット",
  blouson: "ブルゾン",
  "mountain-parka": "マウンテンパーカ・シェル",
  coat: "コート",
  down: "ダウン・中綿",
  gilet: "アウターベスト",
  slacks: "スラックス",
  chino: "チノパン",
  denim: "デニムパンツ",
  cargo: "カーゴパンツ",
  shorts: "ショートパンツ",
  skirt: "スカート",
  "leather-shoes": "革靴",
  sneaker: "スニーカー",
  boots: "ブーツ",
  dress: "ワンピース",
  innerwear: "インナー",
  other: "その他",
};

export function subKindsForKind(kind: GarmentKind): readonly GarmentSubKind[] {
  return subKindsByKind[kind];
}

export function isSubKindOfKind(kind: GarmentKind, subKind: GarmentSubKind): boolean {
  return subKindsByKind[kind].includes(subKind);
}

export function subKindLabel(subKind: GarmentSubKind): string {
  return subKindLabels[subKind];
}
