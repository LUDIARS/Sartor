import { judgeCare } from "../domain/care-rules.js";
import type { Garment, GarmentKind, Gender } from "../domain/types.js";

import type { BrandCatalog } from "./brand-catalog.js";
import { productUrlFor } from "./brand-catalog.js";
import type { FastRetailCatalogItem, FastRetailProductDetails } from "./fast-retailing-client.js";

function textFromProductValue(value: { name?: string; displayName?: string; colorName?: string; size?: string; code?: string | number }): string | undefined {
  const namedValue = value.name ?? value.displayName ?? value.colorName ?? value.size ?? value.code;
  return namedValue === undefined ? undefined : String(namedValue).trim() || undefined;
}

function priceFromItem(item: FastRetailCatalogItem): number {
  const rawPrice = item.prices?.base?.value;
  const price = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
  if (!Number.isInteger(price) || price < 0) {
    throw new Error(`Product ${item.productId} has an invalid base price.`);
  }
  return price;
}

function imageUrlFor(item: FastRetailCatalogItem, baseUrl: string): string | null {
  const images = item.images?.main;
  const image = images === undefined ? undefined : Object.values(images)[0]?.image;
  if (image === undefined || image.length === 0) {
    return null;
  }
  return new URL(image, baseUrl).toString();
}

export function mapFastRetailingGarment(
  catalog: BrandCatalog,
  item: FastRetailCatalogItem,
  details: FastRetailProductDetails,
  gender: Gender,
  kind: GarmentKind,
): Garment {
  const composition = details.composition ?? null;
  const washingInformation = details.washingInformation ?? null;
  const colors = item.colors.flatMap((color) => {
    const value = textFromProductValue(color);
    return value === undefined ? [] : [value];
  });
  const sizes = item.sizes.flatMap((size) => {
    const value = textFromProductValue(size);
    return value === undefined ? [] : [value];
  });
  const care = judgeCare(composition, washingInformation, colors.join(" "));
  return {
    id: `${catalog.brand}:${item.productId}:${item.priceGroup}`,
    brand: catalog.displayName,
    productId: item.productId,
    priceGroup: item.priceGroup,
    name: item.name,
    gender,
    kind,
    priceJpy: priceFromItem(item),
    currency: "JPY",
    colors,
    sizes,
    composition,
    washingInformation,
    dryerOk: care.dryerOk,
    colorBleedRisk: care.colorBleedRisk,
    careReasons: care.reasons,
    imageUrl: imageUrlFor(item, catalog.baseUrl),
    productUrl: productUrlFor(catalog, item.productId, item.priceGroup),
    rawJson: JSON.stringify({ item, details }),
    crawledAt: new Date().toISOString(),
  };
}
