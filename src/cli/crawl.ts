import { AmazonCooldownGuard } from "../crawl/amazon/amazon-cooldown.js";
import { AmazonCrawlRunner, type AmazonCrawlRequest } from "../crawl/amazon/amazon-crawl-runner.js";
import { queriesForAmazonPreset } from "../crawl/amazon/amazon-presets.js";
import { crawlBrand } from "../crawl/crawl-plan.js";
import type { CrawlResult } from "../crawl/crawl-runner.js";
import { logError, logInfo } from "../log.js";
import { AmazonProgressRepository } from "../store/amazon-progress-repo.js";
import { CrawlCooldownRepository } from "../store/crawl-cooldown-repo.js";
import { closeDatabase, openDatabase, type SartorDatabase } from "../store/db.js";
import { GarmentRepository } from "../store/garment-repo.js";

import {
  parseCrawlArguments,
  type AmazonPresetCrawlArguments,
  type AmazonQueryCrawlArguments,
} from "./crawl-arguments.js";

function logFastRetailingResult(result: CrawlResult): void {
  logInfo("catalog_crawl_completed", {
    brand: result.brand,
    gender: result.gender,
    className: result.className,
    kind: result.kind,
    upserted: result.upserted,
    skippedFresh: result.skippedFresh,
  });
}

function amazonRunnerFor(database: SartorDatabase): AmazonCrawlRunner {
  return new AmazonCrawlRunner({
    garments: new GarmentRepository(database),
    progress: new AmazonProgressRepository(database),
    cooldown: new AmazonCooldownGuard(new CrawlCooldownRepository(database)),
  });
}

function amazonRequestsFor(argumentsList: AmazonQueryCrawlArguments | AmazonPresetCrawlArguments): AmazonCrawlRequest[] {
  if ("query" in argumentsList) {
    return [{
      gender: argumentsList.gender,
      classArgument: argumentsList.classArgument,
      query: argumentsList.query,
      limit: argumentsList.limit,
      ...(argumentsList.subKind === undefined ? {} : { subKind: argumentsList.subKind }),
      restart: argumentsList.restart,
    }];
  }
  return queriesForAmazonPreset(argumentsList.preset).map((presetQuery) => ({
    gender: argumentsList.gender,
    classArgument: presetQuery.classArgument,
    query: presetQuery.query,
    subKind: presetQuery.subKind,
    limit: argumentsList.limit,
    restart: argumentsList.restart,
  }));
}

/** @implements SPEC-STEP1C §4 — preset は未完了クエリだけを順に消化し、CAPTCHA で全体を止める。 */
async function crawlAmazon(database: SartorDatabase, argumentsList: AmazonQueryCrawlArguments | AmazonPresetCrawlArguments): Promise<void> {
  for (const request of amazonRequestsFor(argumentsList)) {
    const result = await amazonRunnerFor(database).crawl(request);
    logInfo("catalog_crawl_completed", {
      brand: result.brand,
      gender: result.gender,
      className: result.className,
      subKind: request.subKind,
      upserted: result.upserted,
      filtered: result.filtered,
      startedAtPage: result.startedAtPage,
      completed: result.completed,
    });
  }
}

async function main(): Promise<void> {
  const argumentsList = parseCrawlArguments(process.argv.slice(2));
  const database = openDatabase();
  try {
    if (argumentsList.brand === "amazon") {
      await crawlAmazon(database, argumentsList);
      return;
    }
    const results = await crawlBrand(new GarmentRepository(database), argumentsList);
    for (const result of results) {
      logFastRetailingResult(result);
    }
  } finally {
    closeDatabase(database);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown crawl failure.";
  logError("catalog_crawl_failed", { message });
  process.exitCode = 1;
});
