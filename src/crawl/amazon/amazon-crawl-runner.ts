import { classifyGarmentSubKind } from "../../domain/subkind-classifier.js";
import { isSubKindOfKind, type GarmentSubKind } from "../../domain/garment-subkind.js";
import type { Gender } from "../../domain/types.js";
import { logError, logInfo } from "../../log.js";
import type { AmazonProgressRepository, AmazonProgressTarget } from "../../store/amazon-progress-repo.js";
import type { GarmentRepository } from "../../store/garment-repo.js";

import { AmazonCooldownGuard } from "./amazon-cooldown.js";
import { parseAmazonProductDetail } from "./amazon-detail-parser.js";
import { AmazonCaptchaError, AmazonHttpClient } from "./amazon-http.js";
import { kindForAmazonClass, mapAmazonGarment } from "./amazon-mapper.js";
import { assertAmazonRobotsAllowCatalog } from "./amazon-robots.js";
import { parseAmazonSearchResults } from "./amazon-search-parser.js";

const AMAZON_BASE_URL = "https://www.amazon.co.jp";

export interface AmazonCrawlRequest {
  readonly gender: Gender;
  readonly classArgument: string;
  readonly query: string;
  readonly limit: number;
  /** preset が期待する細分類。指定すると商品名の分類が一致しない検索結果を捨てる。 */
  readonly subKind?: GarmentSubKind;
  /** 保存済みの進捗を無視して 1 ページ目からやり直す。 */
  readonly restart?: boolean;
}

export interface AmazonCrawlResult {
  readonly brand: "amazon";
  readonly gender: Gender;
  readonly className: string;
  readonly upserted: number;
  readonly filtered: number;
  readonly startedAtPage: number;
  readonly completed: boolean;
}

export interface AmazonCrawlDependencies {
  readonly garments: GarmentRepository;
  readonly progress: AmazonProgressRepository;
  readonly cooldown: AmazonCooldownGuard;
  readonly http?: AmazonHttpClient;
  readonly now?: () => Date;
}

interface AmazonCrawlState {
  page: number;
  totalUpserted: number;
  runUpserted: number;
  filtered: number;
  exhausted: boolean;
  readonly processedAsins: Set<string>;
}

/** Amazon の robots 確認・直列取得・マッピング・保存を一実行単位で管理する。 */
export class AmazonCrawlRunner {
  private readonly garments: GarmentRepository;
  private readonly progress: AmazonProgressRepository;
  private readonly cooldown: AmazonCooldownGuard;
  private readonly http: AmazonHttpClient;
  private readonly now: () => Date;

  public constructor(dependencies: AmazonCrawlDependencies) {
    this.garments = dependencies.garments;
    this.progress = dependencies.progress;
    this.cooldown = dependencies.cooldown;
    this.http = dependencies.http ?? new AmazonHttpClient();
    this.now = dependencies.now ?? (() => new Date());
  }

  /** @implements SPEC-STEP1C §4 — 対象別の保存済み進捗から再開し、上限または検索結果末尾まで巡回する。 */
  public async crawl(request: AmazonCrawlRequest): Promise<AmazonCrawlResult> {
    const kind = kindForAmazonClass(request.classArgument);
    const query = request.query.trim();
    if (query.length === 0) {
      throw new Error("Amazon crawl query must not be empty.");
    }
    if (!Number.isSafeInteger(request.limit) || request.limit < 1) {
      throw new Error("Amazon crawl limit must be a positive integer.");
    }
    if (request.subKind !== undefined && !isSubKindOfKind(kind, request.subKind)) {
      throw new Error(`Amazon --subkind ${request.subKind} is not valid for --class ${request.classArgument}.`);
    }
    const target: AmazonProgressTarget = {
      gender: request.gender,
      classArgument: request.classArgument,
      query,
      ...(request.subKind === undefined ? {} : { subKind: request.subKind }),
    };
    this.cooldown.assertNotBlocked();

    if (request.restart === true) {
      this.progress.reset(target);
    }
    const saved = this.progress.find(target);
    if (saved?.completed === true) {
      logInfo("catalog_crawl_skipped", {
        brand: "amazon",
        className: request.classArgument,
        subKind: request.subKind,
        reason: "already_completed",
      });
      return { brand: "amazon", gender: request.gender, className: request.classArgument, upserted: 0, filtered: 0, startedAtPage: saved.nextPage, completed: true };
    }
    if (saved !== undefined && saved.upserted >= request.limit) {
      logInfo("catalog_crawl_skipped", {
        brand: "amazon",
        className: request.classArgument,
        subKind: request.subKind,
        reason: "limit_already_reached",
      });
      return { brand: "amazon", gender: request.gender, className: request.classArgument, upserted: 0, filtered: 0, startedAtPage: saved.nextPage, completed: true };
    }

    const startedAtPage = saved?.nextPage ?? 1;
    const state: AmazonCrawlState = {
      page: startedAtPage,
      totalUpserted: saved?.upserted ?? 0,
      runUpserted: 0,
      filtered: 0,
      exhausted: false,
      processedAsins: new Set(saved?.processedAsins ?? []),
    };
    try {
      await assertAmazonRobotsAllowCatalog(this.http, searchUrl(query, startedAtPage));
      while (!state.exhausted && state.totalUpserted < request.limit) {
        await this.crawlPage(request, target, kind, state);
      }
      this.saveProgress(target, state);
      return {
        brand: "amazon",
        gender: request.gender,
        className: request.classArgument,
        upserted: state.runUpserted,
        filtered: state.filtered,
        startedAtPage,
        completed: true,
      };
    } catch (error) {
      this.saveProgress(target, state);
      this.blockOnCaptcha(error);
      logError("catalog_crawl_failed", {
        brand: "amazon",
        className: request.classArgument,
        subKind: request.subKind,
        page: state.page,
        upserted: state.runUpserted,
        filtered: state.filtered,
        requestsMade: this.http.requestsMade,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }

  /** @implements SPEC-STEP1C §4 — 1 ページ内の処理済み ASIN も都度記録し、中断後の重複計上を防ぐ。 */
  private async crawlPage(
    request: AmazonCrawlRequest,
    target: AmazonProgressTarget,
    kind: ReturnType<typeof kindForAmazonClass>,
    state: AmazonCrawlState,
  ): Promise<void> {
    const searchResults = parseAmazonSearchResults(await this.http.getText(searchUrl(target.query, state.page)));
    if (searchResults.length === 0) {
      state.exhausted = true;
      return;
    }
    for (const searchResult of searchResults) {
      if (state.processedAsins.has(searchResult.asin)) {
        continue;
      }
      if (this.isOffTarget(kind, searchResult.title, request.subKind)) {
        state.processedAsins.add(searchResult.asin);
        state.filtered += 1;
        this.saveProgress(target, state);
        continue;
      }
      const detail = parseAmazonProductDetail(await this.http.getText(detailUrl(searchResult.asin)));
      const garment = mapAmazonGarment(searchResult, detail, request.gender, request.classArgument);
      this.garments.upsert(garment);
      state.processedAsins.add(searchResult.asin);
      state.totalUpserted += 1;
      state.runUpserted += 1;
      this.saveProgress(target, state);
      logInfo("catalog_item_upserted", {
        brand: "amazon",
        productId: garment.productId,
        subKind: garment.subKind,
        upserted: state.runUpserted,
        totalUpserted: state.totalUpserted,
        requestsMade: this.http.requestsMade,
      });
      if (state.totalUpserted >= request.limit) {
        return;
      }
    }
    state.page += 1;
    this.saveProgress(target, state);
  }

  /** @implements SPEC-STEP1C §4 — 検索結果は狙った細分類以外も混ざるので、詳細を取りに行く前に捨てる。 */
  private isOffTarget(kind: ReturnType<typeof kindForAmazonClass>, title: string, subKind?: GarmentSubKind): boolean {
    return subKind !== undefined && classifyGarmentSubKind(kind, title) !== subKind;
  }

  /** @implements SPEC-STEP1C §4 — 再開に必要な累計・ページ・処理済み ASIN を一つの checkpoint として保存する。 */
  private saveProgress(target: AmazonProgressTarget, state: AmazonCrawlState): void {
    this.progress.save(target, {
      nextPage: state.page,
      upserted: state.totalUpserted,
      completed: state.exhausted,
      processedAsins: [...state.processedAsins],
    }, this.now().toISOString());
  }

  /** @implements SPEC-STEP1C §4 — CAPTCHA だけを永続 cooldown の開始条件にする。 */
  private blockOnCaptcha(error: unknown): void {
    if (!(error instanceof AmazonCaptchaError)) {
      return;
    }
    const blockedUntil = this.cooldown.block("CAPTCHA detected during Amazon crawl");
    logInfo("catalog_crawl_cooldown_started", { brand: "amazon", blockedUntil });
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
