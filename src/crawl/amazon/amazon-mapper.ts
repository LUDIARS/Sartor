import { judgeCare } from "../../domain/care-rules.js";
import { classifyGarmentSubKind } from "../../domain/subkind-classifier.js";
import type { Garment, GarmentKind, Gender } from "../../domain/types.js";

import type { AmazonProductDetail } from "./amazon-detail-parser.js";
import type { AmazonSearchResult } from "./amazon-search-parser.js";

export class AmazonProductDataError extends Error {
  public constructor(detail: string) {
    super(`Amazon product data is incomplete: ${detail}`);
    this.name = "AmazonProductDataError";
  }
}

/** @implements SPEC-STEP1C §4 — CLI / preset の商品区分を Sartor の大分類へ変換する。 */
export function kindForAmazonClass(classArgument: string): GarmentKind {
  switch (classArgument.trim().toLowerCase()) {
    case "shirts":
    case "polo":
    case "knit":
    case "cardigan":
    case "vest":
    case "cutsew":
    case "tshirt":
    case "sweat":
    case "hoodie":
      return "tops";
    case "pants":
      return "bottoms";
    case "jacket":
    case "blouson":
    case "denim-jacket":
    case "coat":
    case "down":
    case "mountain-parka":
    case "gilet":
    case "outer":
      return "outer";
    case "shoes":
      return "shoes";
    default:
      throw new AmazonProductDataError(`--class ${classArgument} is unsupported for Amazon.`);
  }
}

/** 検索・詳細の抽出値を Garment に正規化し、ケア規則を適用する。 */
export function mapAmazonGarment(
  searchResult: AmazonSearchResult,
  detail: AmazonProductDetail,
  gender: Gender,
  classArgument: string,
): Garment {
  const priceJpy = detail.priceJpy ?? searchResult.priceJpy;
  if (priceJpy === undefined) {
    throw new AmazonProductDataError(`${searchResult.asin} has no JPY price.`);
  }
  const composition = detail.composition ?? null;
  const washingInformation = detail.careText ?? null;
  const colors = [...detail.colors];
  const care = judgeCare(composition, washingInformation, colors.join(" "));
  const kind = kindForAmazonClass(classArgument);
  return {
    id: `amazon:${searchResult.asin}`,
    brand: detail.brand ?? "Amazon",
    productId: searchResult.asin,
    priceGroup: "00",
    name: detail.title,
    gender,
    kind,
    subKind: classifyGarmentSubKind(kind, detail.title),
    priceJpy,
    currency: "JPY",
    colors,
    sizes: [...detail.sizes],
    composition,
    washingInformation,
    dryerOk: care.dryerOk,
    colorBleedRisk: care.colorBleedRisk,
    careReasons: care.reasons,
    imageUrl: detail.imageUrl ?? searchResult.imageUrl ?? null,
    productUrl: searchResult.productUrl,
    rawJson: JSON.stringify({ searchResult, detail }),
    crawledAt: new Date().toISOString(),
  };
}
