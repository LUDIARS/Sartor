import type { Gender } from "../../domain/types.js";
import { logError, logInfo } from "../../log.js";
import type { GarmentRepository } from "../../store/garment-repo.js";

import { parseAmazonProductDetail } from "./amazon-detail-parser.js";
import { AmazonHttpClient } from "./amazon-http.js";
import { kindForAmazonClass, mapAmazonGarment } from "./amazon-mapper.js";
import { assertAmazonRobotsAllowCatalog } from "./amazon-robots.js";
import { parseAmazonSearchResults } from "./amazon-search-parser.js";

const AMAZON_BASE_URL = "https://www.amazon.co.jp";

export interface AmazonCrawlRequest {
  readonly gender: Gender;
  readonly classArgument: string;
  readonly query: string;
  readonly limit: number;
}

export interface AmazonCrawlResult {
  readonly brand: "amazon";
  readonly gender: Gender;
  readonly className: string;
  readonly upserted: number;
}

/** Amazon の robots 確認・直列取得・マッピング・保存を一実行単位で管理する。 */
export class AmazonCrawlRunner {
  public constructor(
    private readonly repository: GarmentRepository,
    private readonly http = new AmazonHttpClient(),
  ) {}

  public async crawl(request: AmazonCrawlRequest): Promise<AmazonCrawlResult> {
    let upserted = 0;
    try {
      void kindForAmazonClass(request.classArgument);
      const query = request.query.trim();
      if (query.length === 0) {
        throw new Error("Amazon crawl query must not be empty.");
      }
      if (!Number.isSafeInteger(request.limit) || request.limit < 1) {
        throw new Error("Amazon crawl limit must be a positive integer.");
      }
      await assertAmazonRobotsAllowCatalog(this.http, searchUrl(query, 1));
      const crawledAsins = new Set<string>();
      for (let page = 1; upserted < request.limit; page += 1) {
        const searchHtml = await this.http.getText(searchUrl(query, page));
        const searchResults = parseAmazonSearchResults(searchHtml).filter((result) => !crawledAsins.has(result.asin));
        if (searchResults.length === 0) {
          break;
        }
        for (const searchResult of searchResults) {
          crawledAsins.add(searchResult.asin);
          const detailHtml = await this.http.getText(detailUrl(searchResult.asin));
          const garment = mapAmazonGarment(
            searchResult,
            parseAmazonProductDetail(detailHtml),
            request.gender,
            request.classArgument,
          );
          this.repository.upsert(garment);
          upserted += 1;
          logInfo("catalog_item_upserted", {
            brand: "amazon",
            productId: garment.productId,
            upserted,
            requestsMade: this.http.requestsMade,
          });
          if (upserted >= request.limit) {
            break;
          }
        }
      }
      return { brand: "amazon", gender: request.gender, className: request.classArgument, upserted };
    } catch (error) {
      logError("catalog_crawl_failed", {
        brand: "amazon",
        className: request.classArgument,
        upserted,
        requestsMade: this.http.requestsMade,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }
}

function searchUrl(query: string, page: number): string {
  const url = new URL("/s", AMAZON_BASE_URL);
  url.search = new URLSearchParams({ k: query, i: "fashion", page: String(page) }).toString();
  return url.toString();
}

function detailUrl(asin: string): string {
  return new URL(`/dp/${encodeURIComponent(asin)}`, AMAZON_BASE_URL).toString();
}
