import assert from "node:assert/strict";
import test from "node:test";

import { parseAmazonProductDetail } from "../src/crawl/amazon/amazon-detail-parser.js";

test("parseAmazonProductDetail removes the Japanese store suffix from a brand", () => {
  const detail = parseAmazonProductDetail(`
    <html><head><title>Fallback title</title></head><body>
      <span id="productTitle">Test shirt</span>
      <a id="bylineInfo">Example Brandのストアを表示</a>
    </body></html>
  `);

  assert.equal(detail.brand, "Example Brand");
});
