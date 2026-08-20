import { type GarmentKind } from "./garment-kind.js";
import { isSubKindOfKind, type GarmentSubKind } from "./garment-subkind.js";

/**
 * @implements SPEC-STEP1C §1 — 商品名とクラス名から細分類を決定論的に判定する。
 * 規則は具体的なものから並べる (「ニットベスト」は vest、「スウェットパーカ」は hoodie)。
 */
const classificationRules: readonly (readonly [GarmentSubKind, readonly string[]])[] = [
  ["gilet", ["ダウンベスト", "中綿ベスト", "パデッドベスト", "ジレ"]],
  ["vest", ["ベスト", "ニットソー ベスト", "vest"]],
  ["hoodie", ["パーカ", "フーディ", "hoodie", "フード"]],
  ["denim-jacket", ["デニムジャケット", "Gジャン", "ジージャン", "デニムブルゾン"]],
  ["tailored-jacket", ["テーラード", "セットアップ", "スーツジャケット", "感動ジャケット", "ビジネスジャケット"]],
  ["mountain-parka", ["マウンテン", "シェル", "ウインドプルーフ", "ウィンドプルーフ", "ウインドブレーカー", "アノラック"]],
  ["coat", ["コート", "ステンカラー", "チェスター", "トレンチ"]],
  ["down", ["ダウン", "中綿", "パデッド", "パフテック"]],
  ["blouson", ["ブルゾン", "ジャンパー", "カバーオール", "MA-1", "トラックジャケット", "フリースジャケット", "ジャケット", "アウター"]],
  ["cardigan", ["カーディガン", "cardigan"]],
  ["polo", ["ポロ", "polo", "スキッパー"]],
  ["knit", ["ニット", "セーター", "knit", "sweater"]],
  ["sweat", ["スウェット", "トレーナー", "sweat"]],
  ["cutsew", ["カットソー", "ロンT", "ポンチ", "ヘンリーネック"]],
  ["tshirt", ["Tシャツ", "ティーシャツ", "t-shirt", "半袖T", "長袖T", "ボクシーT", "オーバーサイズT"]],
  ["shirt", ["シャツ", "ブラウス", "shirt"]],
  ["denim", ["ジーンズ", "デニムパンツ", "デニム"]],
  ["cargo", ["カーゴ"]],
  ["shorts", ["ショートパンツ", "ハーフパンツ", "ショーツ"]],
  ["slacks", ["スラックス", "ドレスパンツ", "ウールパンツ", "テーパード", "スーツパンツ"]],
  ["chino", ["チノ", "コットンパンツ", "パンツ", "ズボン"]],
  ["skirt", ["スカート"]],
  ["leather-shoes", ["革靴", "ビジネスシューズ", "ローファー", "ドレスシューズ", "レザーシューズ"]],
  ["boots", ["ブーツ"]],
  ["sneaker", ["スニーカー", "シューズ", "sneaker"]],
  ["dress", ["ワンピース", "ドレス"]],
  ["innerwear", ["インナー", "肌着", "下着", "エアリズムインナー"]],
];

function normalize(value: string): string {
  return value.toLocaleLowerCase("ja-JP");
}

/** 単一のテキストに対して規則を上から順に評価する。 */
function matchSubKind(kind: GarmentKind, haystack: string): GarmentSubKind | undefined {
  if (haystack.length === 0) {
    return undefined;
  }
  for (const [subKind, keywords] of classificationRules) {
    if (isSubKindOfKind(kind, subKind) && keywords.some((keyword) => haystack.includes(normalize(keyword)))) {
      return subKind;
    }
  }
  return undefined;
}

/**
 * 商品名 (必要ならクラス名) から細分類を返す。判定できないときは推測せず "other" を返す。
 * 商品名を先に評価し切ってからクラス名へ落とす。クラス名は "Tシャツ・スウェット" のように
 * 複数の細分類を含むため、先に混ぜると商品名の判定を上書きしてしまう。
 * kind に属さない細分類は採用しない (トップスのクラス名に「アウター」が混ざっても outer 側へ倒れない)。
 */
export function classifyGarmentSubKind(kind: GarmentKind, name: string, className?: string): GarmentSubKind {
  const fromName = matchSubKind(kind, normalize(name));
  if (fromName !== undefined) {
    return fromName;
  }
  const fromClassName = className === undefined ? undefined : matchSubKind(kind, normalize(className));
  return fromClassName ?? "other";
}
