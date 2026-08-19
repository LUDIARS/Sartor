import assert from "node:assert/strict";
import test from "node:test";

import {
  AmazonCaptchaError,
  AmazonHttpClient,
  AmazonRateLimitedError,
} from "../src/crawl/amazon/amazon-http.js";

function sequentialFetch(responses: readonly Response[]): typeof fetch {
  let index = 0;
  return (async (): Promise<Response> => {
    const response = responses[index];
    if (response === undefined) {
      throw new Error("Unexpected Amazon request in test.");
    }
    index += 1;
    return response;
  }) as typeof fetch;
}

test("AmazonHttpClient stops immediately when a CAPTCHA page is returned", async () => {
  const client = new AmazonHttpClient({
    fetchImpl: sequentialFetch([new Response("validateCaptcha", { status: 200 })]),
    sleep: async () => {},
  });

  await assert.rejects(() => client.getText("https://www.amazon.co.jp/s?k=test"), AmazonCaptchaError);
  assert.equal(client.requestsMade, 1);
});

test("AmazonHttpClient retries a rate limit only once", async () => {
  const waits: number[] = [];
  const client = new AmazonHttpClient({
    fetchImpl: sequentialFetch([
      new Response("busy", { status: 429 }),
      new Response("busy", { status: 503 }),
    ]),
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    random: () => 0,
  });

  await assert.rejects(() => client.getText("https://www.amazon.co.jp/s?k=test"), AmazonRateLimitedError);
  assert.equal(client.requestsMade, 2);
  assert.ok(waits.includes(30_000));
});
