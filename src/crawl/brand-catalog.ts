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
const classKindRules: readonly [GarmentKind, readonly string[]][] = [
  ["bottoms", ["パンツ・ズボン", "パンツ"]],
  ["outer", ["アウター"]],
  ["tops", ["Tシャツ・スウェット", "Tシャツ・カットソー", "シャツ・ポロシャツ", "シャツ・ブラウス", "ニット・カーディガン", "セーター・カーディガン", "スウェット"]],
  ["onepiece", ["スカート・ワンピース", "ワンピース・チュニック", "ワンピース"]],
  ["bottoms", ["スカート"]],
  ["shoes", ["シューズ"]],
  ["accessory", ["グッズ"]],
  ["inner", ["インナー・下着"]],
];

const classSearchTerms: Readonly<Record<string, readonly string[]>> = {
  pants: ["パンツ・ズボン", "パンツ"],
  tops: ["Tシャツ・スウェット", "Tシャツ・カットソー", "シャツ・ポロシャツ", "シャツ・ブラウス", "ニット・カーディガン", "セーター・カーディガン", "スウェット"],
  outer: ["アウター"],
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
