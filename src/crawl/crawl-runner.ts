import type { GarmentKind, Gender } from "../domain/types.js";
import { logInfo } from "../log.js";
import type { GarmentRepository } from "../store/garment-repo.js";

import {
  brandCatalogs,
  classNamesForArgument,
  kindForClassName,
  type BrandCatalog,
  type FastRetailingBrand,
} from "./brand-catalog.js";
import { FastRetailingClient, type FastRetailCategory } from "./fast-retailing-client.js";
import { mapFastRetailingGarment } from "./fast-retailing-mapper.js";

const PAGE_SIZE = 50;

export interface CrawlRequest {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  readonly classArgument: string;
  readonly limit: number;
}

export interface CrawlResult {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  readonly className: string;
  readonly kind: GarmentKind;
  readonly upserted: number;
}

function categoryName(category: FastRetailCategory): string | undefined {
  return category.name ?? category.label ?? category.displayName;
}

function resolveGenderId(catalog: BrandCatalog, categories: readonly FastRetailCategory[], gender: Gender): string {
  const candidates = catalog.genderNames[gender];
  const category = categories.find((item) => {
    const name = categoryName(item);
    return name !== undefined && candidates.some((candidate) => name.toLocaleLowerCase() === candidate.toLocaleLowerCase());
  });
  if (category === undefined) {
    throw new Error(`${catalog.displayName} does not expose a ${gender} category in its product API.`);
  }
  return category.id;
}

function resolveClass(categories: readonly FastRetailCategory[], classArgument: string): FastRetailCategory {
  const names = classNamesForArgument(classArgument);
  const category = categories.find((item) => {
    const name = categoryName(item);
    return name !== undefined && names.some((candidate) => name.includes(candidate));
  });
  if (category === undefined) {
    throw new Error(`No product class matched "${classArgument}" in the Fast Retailing category tree.`);
  }
  return category;
}

export async function crawlBrandCatalog(repository: GarmentRepository, request: CrawlRequest): Promise<CrawlResult> {
  const catalog = brandCatalogs[request.brand];
  const client = new FastRetailingClient(catalog);
  const tree = await client.getCategoryTree();
  const genderId = resolveGenderId(catalog, tree.genders, request.gender);
  const genderClasses = await client.getClassesForGender(genderId);
  const classCategory = resolveClass(genderClasses, request.classArgument);
  const className = categoryName(classCategory);
  if (className === undefined) {
    throw new Error(`Matched class "${request.classArgument}" has no name.`);
  }
  const kind = kindForClassName(className);
  if (kind === undefined) {
    throw new Error(`Class "${className}" is intentionally excluded from the Sartor catalog.`);
  }

  let offset = 0;
  let upserted = 0;
  while (upserted < request.limit) {
    const pageLimit = Math.min(PAGE_SIZE, request.limit - upserted);
    const page = await client.listProducts(genderId, classCategory.id, pageLimit, offset);
    if (page.items.length === 0) {
      break;
    }
    for (const item of page.items) {
      const details = await client.getProductDetails(item.productId, item.priceGroup);
      const garment = mapFastRetailingGarment(catalog, item, details, request.gender, kind);
      repository.upsert(garment);
      upserted += 1;
      logInfo("catalog_item_upserted", { brand: request.brand, productId: item.productId, upserted });
      if (upserted >= request.limit) {
        break;
      }
    }
    offset += page.items.length;
    if (offset >= page.total || page.count === 0) {
      break;
    }
  }
  return { brand: request.brand, gender: request.gender, className, kind, upserted };
}
