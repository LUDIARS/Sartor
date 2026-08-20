import assert from "node:assert/strict";
import test from "node:test";

import { AmazonCooldownGuard } from "../src/crawl/amazon/amazon-cooldown.js";
import { AmazonCrawlRunner, type AmazonCrawlRequest } from "../src/crawl/amazon/amazon-crawl-runner.js";
import { AmazonCaptchaError, AmazonHttpClient } from "../src/crawl/amazon/amazon-http.js";
import { AmazonProgressRepository, type AmazonProgressTarget } from "../src/store/amazon-progress-repo.js";
import { CrawlCooldownRepository } from "../src/store/crawl-cooldown-repo.js";
import { closeDatabase, openDatabase, type SartorDatabase } from "../src/store/db.js";
import { GarmentRepository } from "../src/store/garment-repo.js";

const NOW = new Date("2026-08-20T00:00:00.000Z");
const ROBOTS_TEXT = [
  "User-agent: SartorBot",
  "Allow: /s?",
  "Allow: /dp/",
].join("\n");

function searchPage(asins: readonly string[]): string {
  return asins.map((asin) => [
    `<div data-component-type="s-search-result" data-asin="${asin}">`,
    `<h2>シャツ ${asin}</h2>`,
    "<span class=\"a-price-whole\">1,000</span>",
    "</div>",
  ].join("")).join("");
}

function detailPage(asin: string): string {
  return `<span id="productTitle">シャツ ${asin}</span><span class="a-price-whole">1,000</span>`;
}

function sequentialHttp(bodies: readonly string[]): AmazonHttpClient {
  let index = 0;
  const fetchImpl = (async (): Promise<Response> => {
    const body = bodies[index];
    if (body === undefined) {
      throw new Error("Unexpected Amazon request in test.");
    }
    index += 1;
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  return new AmazonHttpClient({ fetchImpl, sleep: async () => {}, random: () => 0 });
}

function runnerFor(database: SartorDatabase, http: AmazonHttpClient): AmazonCrawlRunner {
  return new AmazonCrawlRunner({
    garments: new GarmentRepository(database),
    progress: new AmazonProgressRepository(database),
    cooldown: new AmazonCooldownGuard(new CrawlCooldownRepository(database), {
      cooldownHours: 0,
      now: () => NOW,
    }),
    http,
    now: () => NOW,
  });
}

test("AmazonCrawlRunner resumes within an interrupted page without counting products twice", async () => {
  const database = openDatabase(":memory:");
  const asins = ["B000000001", "B000000002", "B000000003"];
  const request: AmazonCrawlRequest = {
    gender: "MEN",
    classArgument: "shirts",
    query: "resume test",
    limit: 3,
  };
  try {
    const firstHttp = sequentialHttp([
      ROBOTS_TEXT,
      searchPage(asins),
      detailPage(asins[0]!),
      "validateCaptcha",
    ]);
    await assert.rejects(() => runnerFor(database, firstHttp).crawl(request), AmazonCaptchaError);

    const secondHttp = sequentialHttp([
      ROBOTS_TEXT,
      searchPage(asins),
      detailPage(asins[1]!),
      detailPage(asins[2]!),
    ]);
    const result = await runnerFor(database, secondHttp).crawl(request);

    assert.equal(result.upserted, 2);
    assert.equal(result.completed, true);
    assert.equal(secondHttp.requestsMade, 4);
    assert.deepEqual(
      new GarmentRepository(database).findByIds(asins.map((asin) => `amazon:${asin}`)).map(({ productId }) => productId),
      asins,
    );

    const extendedAsins = [...asins, "B000000004"];
    const extendedHttp = sequentialHttp([
      ROBOTS_TEXT,
      searchPage(extendedAsins),
      detailPage(extendedAsins[3]!),
    ]);
    const extendedResult = await runnerFor(database, extendedHttp).crawl({ ...request, limit: 4 });

    assert.equal(extendedResult.upserted, 1);
    assert.equal(extendedHttp.requestsMade, 3);
    assert.deepEqual(
      new GarmentRepository(database).findByIds(extendedAsins.map((asin) => `amazon:${asin}`)).map(({ productId }) => productId),
      extendedAsins,
    );
  } finally {
    closeDatabase(database);
  }
});

test("AmazonProgressRepository isolates progress by the effective crawl target", () => {
  const database = openDatabase(":memory:");
  const repository = new AmazonProgressRepository(database);
  const target: AmazonProgressTarget = {
    gender: "MEN",
    classArgument: "shirts",
    query: "same words",
    subKind: "shirt",
  };
  try {
    repository.save(target, {
      nextPage: 2,
      upserted: 5,
      completed: false,
      processedAsins: ["B000000001"],
    }, NOW.toISOString());

    assert.equal(repository.find(target)?.upserted, 5);
    assert.equal(repository.find({ ...target, gender: "WOMEN" }), undefined);
    assert.equal(repository.find({ ...target, classArgument: "pants" }), undefined);
    assert.equal(repository.find({ ...target, subKind: "polo" }), undefined);
  } finally {
    closeDatabase(database);
  }
});

test("AmazonCrawlRunner rejects a sub kind that cannot belong to the requested class", async () => {
  const database = openDatabase(":memory:");
  const http = sequentialHttp([]);
  try {
    await assert.rejects(
      () => runnerFor(database, http).crawl({
        gender: "MEN",
        classArgument: "pants",
        query: "invalid target",
        subKind: "shirt",
        limit: 10,
      }),
      /--subkind shirt is not valid for --class pants/u,
    );
    assert.equal(http.requestsMade, 0);
  } finally {
    closeDatabase(database);
  }
});
