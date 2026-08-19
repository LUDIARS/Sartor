export interface AmazonSearchResult {
  readonly asin: string;
  readonly title: string;
  readonly priceJpy?: number;
  readonly imageUrl?: string;
  readonly productUrl: string;
}

const AMAZON_BASE_URL = "https://www.amazon.co.jp";

/** Amazon 検索 HTML の商品結果だけを文字列処理で抽出する。 */
export function parseAmazonSearchResults(html: string): AmazonSearchResult[] {
  const starts = Array.from(html.matchAll(/<div\b(?=[^>]*\bdata-component-type\s*=\s*["']s-search-result["'])[^>]*>/giu));
  const results: AmazonSearchResult[] = [];
  for (const [index, start] of starts.entries()) {
    const startTag = start[0];
    const asin = readAttribute(startTag, "data-asin");
    if (asin === undefined || !/^[A-Z0-9]{10}$/iu.test(asin)) {
      continue;
    }
    const nextStart = starts[index + 1];
    const blockStart = (start.index ?? 0) + startTag.length;
    const blockEnd = nextStart?.index ?? html.length;
    const block = html.slice(blockStart, blockEnd);
    if (block.includes("AdHolder") || block.includes("スポンサー")) {
      continue;
    }
    const title = textInsideFirstTag(block, "h2");
    if (title === undefined) {
      continue;
    }
    const priceJpy = priceFromText(textForClass(block, "a-price-whole") ?? textForClass(block, "a-offscreen"));
    const imageUrl = imageUrlFromBlock(block);
    results.push({
      asin,
      title,
      ...(priceJpy === undefined ? {} : { priceJpy }),
      ...(imageUrl === undefined ? {} : { imageUrl }),
      productUrl: `${AMAZON_BASE_URL}/dp/${asin}`,
    });
  }
  return results;
}

function textInsideFirstTag(html: string, tagName: string): string | undefined {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "iu"));
  return match?.[1] === undefined ? undefined : normalizedText(match[1]);
}

function textForClass(html: string, className: string): string | undefined {
  const match = html.match(new RegExp(`<[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)</[^>]+>`, "iu"));
  return match?.[1] === undefined ? undefined : normalizedText(match[1]);
}

function imageUrlFromBlock(block: string): string | undefined {
  const imageTag = block.match(/<img\b[^>]*>/iu)?.[0];
  if (imageTag === undefined) {
    return undefined;
  }
  const source = readAttribute(imageTag, "src") ?? readAttribute(imageTag, "data-src");
  return source === undefined || source.length === 0 ? undefined : source;
}

function priceFromText(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const digits = value.replace(/[^0-9]/gu, "");
  if (digits.length === 0) {
    return undefined;
  }
  const price = Number(digits);
  return Number.isSafeInteger(price) && price >= 0 ? price : undefined;
}

function readAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu"));
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decodeHtml(value).trim();
}

function normalizedText(value: string): string | undefined {
  const text = decodeHtml(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
  return text.length === 0 ? undefined : text;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replace(/&#(\d+);/gu, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}
