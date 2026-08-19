import assert from "node:assert/strict";
import test from "node:test";

import { AmazonHttpClient } from "../src/crawl/amazon/amazon-http.js";
import {
  AmazonCrawlBlockedError,
  assertAmazonRobotsAllowCatalog,
} from "../src/crawl/amazon/amazon-robots.js";

function clientForRobots(robotsText: string): AmazonHttpClient {
  const fetchImpl = (async (): Promise<Response> => new Response(robotsText, { status: 200 })) as typeof fetch;
  return new AmazonHttpClient({ fetchImpl, sleep: async () => {}, random: () => 0 });
}

const searchEndpoint = "https://www.amazon.co.jp/s?k=test&i=fashion&page=1";

test("robots uses a SartorBot group instead of a permissive wildcard group", async () => {
  const client = clientForRobots([
    "User-agent: *",
    "Allow: /",
    "User-agent: SartorBot",
    "Disallow: /",
  ].join("\n"));

  await assert.rejects(
    () => assertAmazonRobotsAllowCatalog(client, searchEndpoint),
    AmazonCrawlBlockedError,
  );
});

test("robots evaluates the query portion of the actual search URL", async () => {
  const client = clientForRobots([
    "User-agent: *",
    "Disallow: /s?",
    "Allow: /dp/",
  ].join("\n"));

  await assert.rejects(
    () => assertAmazonRobotsAllowCatalog(client, searchEndpoint),
    AmazonCrawlBlockedError,
  );
});

test("robots permits catalog access when both actual paths are allowed", async () => {
  const client = clientForRobots([
    "User-agent: *",
    "Allow: /s?",
    "Allow: /dp/",
  ].join("\n"));

  await assert.doesNotReject(() => assertAmazonRobotsAllowCatalog(client, searchEndpoint));
});
