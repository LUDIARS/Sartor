export interface AmazonProductDetail {
  readonly title: string;
  readonly brand?: string;
  readonly priceJpy?: number;
  readonly imageUrl?: string;
  readonly composition?: string;
  readonly careText?: string;
  readonly colors: readonly string[];
  readonly sizes: readonly string[];
  readonly bullets: readonly string[];
}

/** Amazon 商品 HTML からカタログ保存に必要な項目だけを文字列処理で抽出する。 */
export function parseAmazonProductDetail(html: string): AmazonProductDetail {
  const lines = textLines(html);
  const title = textForId(html, "productTitle") ?? titleFromDocument(html);
  if (title === undefined) {
    throw new Error("Amazon product page does not contain a title.");
  }
  const brand = normalizeBrand(textForId(html, "bylineInfo") ?? labeledValue(lines, ["ブランド", "ブランド名"]));
  const priceJpy = priceFromText(textForClass(html, "a-price-whole") ?? textForClass(html, "a-offscreen"));
  const imageUrl = attributeInHtml(html, "data-old-hires") ?? imageUrlForLandingImage(html);
  const composition = labeledValue(lines, ["素材構成", "素材"]) ?? lines.find((line) => /(?:綿|コットン|ポリエステル|ナイロン|毛|ウール|麻|リネン|レーヨン|絹|シルク)\s*\d{1,3}\s*%/u.test(line));
  const careLines = [...new Set(lines.filter((line) => /お手入れ|洗濯|乾燥機|手洗い/u.test(line)))].slice(0, 8);
  const bullets = bulletLines(html);

  return {
    title,
    ...(brand === undefined ? {} : { brand }),
    ...(priceJpy === undefined ? {} : { priceJpy }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(composition === undefined ? {} : { composition }),
    ...(careLines.length === 0 ? {} : { careText: careLines.join(" / ") }),
    colors: valuesForLabel(lines, ["カラー", "色"]),
    sizes: valuesForLabel(lines, ["サイズ"]),
    bullets,
  };
}

function textForId(html: string, id: string): string | undefined {
  const pattern = new RegExp(`<([a-z][\\w:-]*)(?=[^>]*\\bid=["']${id}["'])[^>]*>([\\s\\S]*?)</\\1>`, "iu");
  const content = html.match(pattern)?.[2];
  return content === undefined ? undefined : normalizedText(content);
}

function titleFromDocument(html: string): string | undefined {
  const content = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  return content === undefined ? undefined : normalizedText(content);
}

function textForClass(html: string, className: string): string | undefined {
  const content = html.match(new RegExp(`<[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)</[^>]+>`, "iu"))?.[1];
  return content === undefined ? undefined : normalizedText(content);
}

function imageUrlForLandingImage(html: string): string | undefined {
  const tag = html.match(/<img\b(?=[^>]*\bid=["']landingImage["'])[^>]*>/iu)?.[0];
  return tag === undefined ? undefined : readAttribute(tag, "src");
}

function attributeInHtml(html: string, attribute: string): string | undefined {
  const match = html.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu"));
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined || value.length === 0 ? undefined : decodeHtml(value).trim();
}

function readAttribute(tag: string, attribute: string): string | undefined {
  return attributeInHtml(tag, attribute);
}

function textLines(html: string): string[] {
  const text = decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
      .replace(/<(?:br|li|tr|td|th|div|p|h[1-6])\b[^>]*>/giu, "\n")
      .replace(/<[^>]+>/gu, " "),
  );
  return text
    .split(/\r?\n/gu)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter((line) => line.length > 0);
}

function labeledValue(lines: readonly string[], labels: readonly string[]): string | undefined {
  for (const [index, line] of lines.entries()) {
    for (const label of labels) {
      const inline = line.match(new RegExp(`${label}\\s*[:：]\\s*(.+)$`, "u"))?.[1]?.trim();
      if (inline !== undefined && inline.length > 0) {
        return inline;
      }
      if (line === label) {
        const following = lines[index + 1];
        if (following !== undefined && following.length > 0) {
          return following;
        }
      }
    }
  }
  return undefined;
}

function valuesForLabel(lines: readonly string[], labels: readonly string[]): string[] {
  const value = labeledValue(lines, labels);
  if (value === undefined) {
    return [];
  }
  return [...new Set(value.split(/[、,/／]/u).map((part) => part.trim()).filter((part) => part.length > 0))];
}

function bulletLines(html: string): string[] {
  const pattern = /<([a-z][\w:-]*)(?=[^>]*\bid=["']feature-bullets["'])[^>]*>([\s\S]*?)<\/\1>/iu;
  const featureBullets = html.match(pattern)?.[2];
  if (featureBullets === undefined) {
    return [];
  }
  return Array.from(featureBullets.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu))
    .flatMap((match) => normalizedText(match[1] ?? "") ?? []);
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

function normalizeBrand(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value
    .replace(/^ブランド(?:名)?\s*[:：]?\s*/u, "")
    .replace(/^Visit the\s+/iu, "")
    .replace(/\s+Store$/iu, "")
    .replace(/のストアを表示$/u, "")
    .trim();
  return normalized.length === 0 ? undefined : normalized;
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
