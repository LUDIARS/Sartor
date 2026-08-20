import type { GarmentKind, Gender } from "../domain/types.js";

export type FastRetailingBrand = "uniqlo" | "gu";

export interface BrandCatalog {
  readonly brand: FastRetailingBrand;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly genderNames: Readonly<Record<Gender, readonly string[]>>;
}

export const brandCatalogs: Readonly<Record<FastRetailingBrand, BrandCatalog>> = {
  uniqlo: {
    brand: "uniqlo",
    displayName: "Uniqlo",
    baseUrl: "https://www.uniqlo.com",
    genderNames: {
      WOMEN: ["Women", "WOMEN"],
      MEN: ["Men", "MEN"],
      UNISEX: ["UNISEX", "Unisex"],
    },
  },
  gu: {
    brand: "gu",
    displayName: "GU",
    baseUrl: "https://www.gu-global.com",
    genderNames: {
      WOMEN: ["WOMEN", "Women"],
      MEN: ["MEN", "Men"],
      UNISEX: ["UNISEX", "Unisex"],
    },
  },
};

const skippedClassPhrases = ["ルームウェア", "マタニティ", "花"];
/** @implements SPEC-STEP1C §3 — "all" 巡回で拾えるよう、両ブランドのクラス名の揺れを網羅する。 */
const classKindRules: readonly [GarmentKind, readonly string[]][] = [
  // 「デニムジャケット」を generic な「デニム」ボトムス規則より先に判定する。
  ["outer", ["アウター", "ジャケット・コート", "ジャケット", "コート", "ブルゾン", "ダウン", "中綿", "ジレ"]],
  ["bottoms", ["パンツ・ズボン", "パンツ", "ジーンズ", "デニム", "ショートパンツ"]],
  ["tops", [
    "Tシャツ・スウェット",
    "Tシャツ・カットソー",
    "シャツ・ポロシャツ",
    "シャツ・ブラウス",
    "ニット・カーディガン",
    "セーター・カーディガン",
    "カーディガン",
    "ニット",
    "スウェット",
    "パーカ",
    "ベスト",
    "トップス",
  ]],
  ["onepiece", ["スカート・ワンピース", "ワンピース・チュニック", "ワンピース"]],
  ["bottoms", ["スカート"]],
  ["shoes", ["シューズ", "靴"]],
  ["accessory", ["グッズ", "バッグ", "小物"]],
  ["inner", ["インナー・下着", "インナー"]],
];

const classSearchTerms: Readonly<Record<string, readonly string[]>> = {
  pants: ["パンツ・ズボン", "パンツ"],
  tops: ["Tシャツ・スウェット", "Tシャツ・カットソー", "シャツ・ポロシャツ", "シャツ・ブラウス", "ニット・カーディガン", "セーター・カーディガン", "スウェット"],
  shirts: ["シャツ・ポロシャツ", "シャツ・ブラウス"],
  knit: ["ニット・カーディガン", "セーター・カーディガン", "ニット"],
  sweat: ["Tシャツ・スウェット", "スウェット", "パーカ"],
  outer: ["アウター", "ジャケット・コート", "コート"],
  onepiece: ["スカート・ワンピース", "ワンピース・チュニック", "ワンピース"],
  skirt: ["スカート"],
  shoes: ["シューズ"],
  accessory: ["グッズ"],
  inner: ["インナー・下着"],
};

export function productUrlFor(catalog: BrandCatalog, productId: string, priceGroup: string): string {
  return new URL(`/jp/ja/products/${encodeURIComponent(productId)}/${encodeURIComponent(priceGroup)}`, catalog.baseUrl).toString();
}

export function kindForClassName(className: string): GarmentKind | undefined {
  if (skippedClassPhrases.some((phrase) => className.includes(phrase))) {
    return undefined;
  }
  for (const [kind, phrases] of classKindRules) {
    if (phrases.some((phrase) => className.includes(phrase))) {
      return kind;
    }
  }
  return "other";
}

export function classNamesForArgument(argument: string): readonly string[] {
  return classSearchTerms[argument.trim().toLowerCase()] ?? [argument.trim()];
}
