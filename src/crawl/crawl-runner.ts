import type { GarmentKind, Gender } from "../domain/types.js";
import { logInfo } from "../log.js";
import type { GarmentRepository } from "../store/garment-repo.js";

import type { BrandCatalog, FastRetailingBrand } from "./brand-catalog.js";
import type { CrawlTarget } from "./catalog-class-resolver.js";
import type { FastRetailingClient, FastRetailCatalogItem } from "./fast-retailing-client.js";
import { mapFastRetailingGarment } from "./fast-retailing-mapper.js";

const PAGE_SIZE = 50;
const MILLISECONDS_PER_HOUR = 3_600_000;

export interface ClassCrawlOptions {
  /** 省略時はクラスの全件を取得する。 */
  readonly limit?: number;
  readonly refreshAfterHours: number;
  readonly now?: () => Date;
}

export interface CrawlResult {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  readonly className: string;
  readonly kind: GarmentKind;
  readonly upserted: number;
  readonly skippedFresh: number;
}

function garmentIdFor(catalog: BrandCatalog, item: FastRetailCatalogItem): string {
  return `${catalog.brand}:${item.productId}:${item.priceGroup}`;
}

/** 1 クラス分のページングと差分判定だけを受け持つ。クラスの選定は catalog-class-resolver の責務。 */
export class CatalogClassCrawler {
  public constructor(
    private readonly repository: GarmentRepository,
    private readonly client: FastRetailingClient,
    private readonly catalog: BrandCatalog,
  ) {}

  public async crawl(genderId: string, target: CrawlTarget, gender: Gender, options: ClassCrawlOptions): Promise<CrawlResult> {
    const now = options.now ?? (() => new Date());
    const freshBefore = now().getTime() - options.refreshAfterHours * MILLISECONDS_PER_HOUR;
    let offset = 0;
    let upserted = 0;
    let skippedFresh = 0;

    while (options.limit === undefined || upserted < options.limit) {
      const pageLimit = options.limit === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, options.limit - upserted);
      const page = await this.client.listProducts(genderId, target.category.id, pageLimit, offset);
      if (page.items.length === 0) {
        break;
      }
      const crawledAtById = this.repository.findCrawledAtByIds(page.items.map((item) => garmentIdFor(this.catalog, item)));
      for (const item of page.items) {
        if (this.isFresh(crawledAtById.get(garmentIdFor(this.catalog, item)), freshBefore)) {
          skippedFresh += 1;
          continue;
        }
        const details = await this.client.getProductDetails(item.productId, item.priceGroup);
        const garment = mapFastRetailingGarment(this.catalog, item, details, gender, target.kind, target.className);
        this.repository.upsert(garment);
        upserted += 1;
        logInfo("catalog_item_upserted", {
          brand: this.catalog.brand,
          productId: item.productId,
          subKind: garment.subKind,
          upserted,
        });
        if (options.limit !== undefined && upserted >= options.limit) {
          break;
        }
      }
      offset += page.items.length;
      if (offset >= page.total || page.count === 0) {
        break;
      }
    }

    return {
      brand: this.catalog.brand,
      gender,
      className: target.className,
      kind: target.kind,
      upserted,
      skippedFresh,
    };
  }

  /** @implements SPEC-STEP1C §3 — 期間内に取得済みの商品は詳細 API を叩かずに飛ばす。 */
  private isFresh(crawledAt: string | undefined, freshBefore: number): boolean {
    if (crawledAt === undefined) {
      return false;
    }
    const crawledAtMs = Date.parse(crawledAt);
    return Number.isFinite(crawledAtMs) && crawledAtMs >= freshBefore;
  }
}
