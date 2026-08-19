import { z } from "zod";

/** 日本で流通する衣料サイズの正規化ラベル。保存・比較はこの表記に揃える。 */
export const japaneseSizeSchema = z.enum(["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]);
export type JapaneseSize = z.infer<typeof japaneseSizeSchema>;

/** 画面表示用の日本語併記 (LL / 3L 系の呼称を添える)。 */
export const japaneseSizeLabels: Readonly<Record<JapaneseSize, string>> = {
  XS: "XS",
  S: "S",
  M: "M",
  L: "L",
  XL: "XL (LL)",
  XXL: "XXL (3L)",
  "3XL": "3XL (4L)",
  "4XL": "4XL (5L)",
};

const aliasTable: Readonly<Record<string, JapaneseSize>> = {
  XS: "XS", SS: "XS",
  S: "S",
  M: "M",
  L: "L",
  XL: "XL", LL: "XL",
  XXL: "XXL", "2XL": "XXL", "3L": "XXL",
  "3XL": "3XL", XXXL: "3XL", "4L": "3XL",
  "4XL": "4XL", "5L": "4XL",
};

/** @implements SPEC-STEP1-PROTOTYPE §11 — Japanese size labels are compared after width/case normalization. */
function toHalfWidthUpper(value: string): string {
  return value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toUpperCase();
}

/**
 * @implements SPEC-STEP1-PROTOTYPE §11 — Japanese aliases become one canonical label.
 * "Lサイズ" / "ＬＬ" / "76cm / M" などを正規ラベルへ。
 * 数値 (ウエスト cm/inch 等) のみ、複数サイズ、未知表記は undefined。
 */
export function normalizeSizeLabel(raw: string): JapaneseSize | undefined {
  const normalized = toHalfWidthUpper(raw).replace(/サイズ|SIZE/gu, " ").trim();
  const exact = aliasTable[normalized.replace(/\s/gu, "")];
  if (exact !== undefined) {
    return exact;
  }

  const recognized = new Set(
    normalized
      .split(/[^A-Z0-9]+/u)
      .flatMap((part) => {
        const size = aliasTable[part];
        return size === undefined ? [] : [size];
      }),
  );
  return recognized.size === 1 ? recognized.values().next().value : undefined;
}

/**
 * @implements SPEC-STEP1-PROTOTYPE §11 — unknown catalog sizes remain eligible.
 * 商品がそのサイズを扱うか。サイズ一覧が空、または正規化できる表記を 1 つも含まない
 * (ウエスト cm のみ等) 場合は「不明」として true を返し、候補から落とさない。
 */
export function garmentOffersSize(sizes: readonly string[], wanted: JapaneseSize): boolean {
  const normalized = sizes.map(normalizeSizeLabel).filter((size): size is JapaneseSize => size !== undefined);
  return normalized.length === 0 || normalized.includes(wanted);
}
