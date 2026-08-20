import type { GarmentSubKind } from "../../domain/garment-subkind.js";

export interface AmazonPresetQuery {
  readonly classArgument: string;
  readonly query: string;
  /** 期待する細分類。検索結果の商品名がこれと一致しないものは保存しない。 */
  readonly subKind: GarmentSubKind;
}

/** @implements SPEC-STEP1C §4 — トップス・アウターは細分類ごとにクエリを分け、種類の偏りを解消する。 */
const mensTopsQueries: readonly AmazonPresetQuery[] = [
  { classArgument: "shirts", query: "メンズ オフィスカジュアル シャツ 40代", subKind: "shirt" },
  { classArgument: "shirts", query: "メンズ 長袖シャツ ビジネスカジュアル 無地", subKind: "shirt" },
  { classArgument: "polo", query: "メンズ ポロシャツ ビジネスカジュアル 40代", subKind: "polo" },
  { classArgument: "knit", query: "メンズ ニット オフィスカジュアル 40代", subKind: "knit" },
  { classArgument: "knit", query: "メンズ セーター クルーネック 無地 ウール", subKind: "knit" },
  { classArgument: "cardigan", query: "メンズ カーディガン ビジネスカジュアル 40代", subKind: "cardigan" },
  { classArgument: "vest", query: "メンズ ニットベスト ビジネスカジュアル", subKind: "vest" },
  { classArgument: "cutsew", query: "メンズ カットソー 長袖 きれいめ 40代", subKind: "cutsew" },
  { classArgument: "tshirt", query: "メンズ Tシャツ 無地 厚手 きれいめ", subKind: "tshirt" },
  { classArgument: "sweat", query: "メンズ スウェット きれいめ 無地 40代", subKind: "sweat" },
];

const mensOuterQueries: readonly AmazonPresetQuery[] = [
  { classArgument: "jacket", query: "メンズ テーラードジャケット オフィスカジュアル 40代", subKind: "tailored-jacket" },
  { classArgument: "jacket", query: "メンズ セットアップ ジャケット ストレッチ 洗える", subKind: "tailored-jacket" },
  { classArgument: "blouson", query: "メンズ ブルゾン きれいめ 40代", subKind: "blouson" },
  { classArgument: "denim-jacket", query: "メンズ デニムジャケット きれいめ", subKind: "denim-jacket" },
  { classArgument: "coat", query: "メンズ ステンカラーコート ビジネス", subKind: "coat" },
  { classArgument: "coat", query: "メンズ チェスターコート 40代", subKind: "coat" },
  { classArgument: "down", query: "メンズ 中綿ジャケット 軽量 ビジネス", subKind: "down" },
  { classArgument: "mountain-parka", query: "メンズ マウンテンパーカ 防水 きれいめ", subKind: "mountain-parka" },
  { classArgument: "gilet", query: "メンズ ダウンベスト ビジネス 軽量", subKind: "gilet" },
];

const mensBottomsAndShoesQueries: readonly AmazonPresetQuery[] = [
  { classArgument: "pants", query: "メンズ スラックス オフィスカジュアル 40代", subKind: "slacks" },
  { classArgument: "pants", query: "メンズ チノパン きれいめ ストレッチ", subKind: "chino" },
  { classArgument: "pants", query: "メンズ デニムパンツ ストレート きれいめ", subKind: "denim" },
  { classArgument: "shoes", query: "メンズ 革靴 ビジネスカジュアル", subKind: "leather-shoes" },
  { classArgument: "shoes", query: "メンズ レザースニーカー 白 きれいめ", subKind: "sneaker" },
];

export const amazonPresetNames = ["mens-office-casual-40s", "mens-tops-variety", "mens-outer-variety"] as const;
export type AmazonPresetName = typeof amazonPresetNames[number];

export function queriesForAmazonPreset(preset: AmazonPresetName): readonly AmazonPresetQuery[] {
  switch (preset) {
    case "mens-office-casual-40s":
      return [...mensTopsQueries, ...mensOuterQueries, ...mensBottomsAndShoesQueries];
    case "mens-tops-variety":
      return mensTopsQueries;
    case "mens-outer-variety":
      return mensOuterQueries;
    default:
      throw new Error(`Unknown Amazon crawl preset: ${String(preset)}.`);
  }
}
