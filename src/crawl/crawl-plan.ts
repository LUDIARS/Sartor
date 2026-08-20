import type { Gender } from "../domain/types.js";
import { logInfo } from "../log.js";
import type { GarmentRepository } from "../store/garment-repo.js";

import { brandCatalogs, type FastRetailingBrand } from "./brand-catalog.js";
import { resolveGenderId, selectCrawlTargets } from "./catalog-class-resolver.js";
import { CatalogClassCrawler, type ClassCrawlOptions, type CrawlResult } from "./crawl-runner.js";
import { FastRetailingClient } from "./fast-retailing-client.js";

export interface BrandCrawlRequest {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  /** "all" でその性別の全クラスを巡回する。 */
  readonly classArgument: string;
  readonly limit?: number;
  readonly refreshAfterHours: number;
}

/** @implements SPEC-STEP1C §3 — カテゴリツリーを 1 度だけ解決し、対象クラスを順に巡回する。 */
export async function crawlBrand(repository: GarmentRepository, request: BrandCrawlRequest): Promise<CrawlResult[]> {
  const catalog = brandCatalogs[request.brand];
  const client = new FastRetailingClient(catalog);
  const tree = await client.getCategoryTree();
  const genderId = resolveGenderId(catalog, tree.genders, request.gender);
  const targets = selectCrawlTargets(await client.getClassesForGender(genderId), request.classArgument);
  logInfo("catalog_crawl_planned", {
    brand: request.brand,
    gender: request.gender,
    classes: targets.map((target) => target.className).join(", "),
  });

  const options: ClassCrawlOptions = {
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    refreshAfterHours: request.refreshAfterHours,
  };
  const crawler = new CatalogClassCrawler(repository, client, catalog);
  const results: CrawlResult[] = [];
  for (const target of targets) {
    results.push(await crawler.crawl(genderId, target, request.gender, options));
  }
  return results;
}
