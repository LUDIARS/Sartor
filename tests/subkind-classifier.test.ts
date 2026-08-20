import assert from "node:assert/strict";
import test from "node:test";

import { subKindsForKind } from "../src/domain/garment-subkind.js";
import { classifyGarmentSubKind } from "../src/domain/subkind-classifier.js";

test("classifyGarmentSubKind separates the tops variants that used to collapse into one kind", () => {
  assert.equal(classifyGarmentSubKind("tops", "ウォッシャブルスキッパーポロセーター"), "polo");
  assert.equal(classifyGarmentSubKind("tops", "エクストラファインメリノクルーネックセーター"), "knit");
  assert.equal(classifyGarmentSubKind("tops", "カノコオーバーサイズカーディガンST"), "cardigan");
  assert.equal(classifyGarmentSubKind("tops", "ウォッシャブルニットベスト"), "vest");
  assert.equal(classifyGarmentSubKind("tops", "オックスフォードシャツ(長袖)"), "shirt");
  assert.equal(classifyGarmentSubKind("tops", "ドライポンチT(5分袖)"), "cutsew");
  assert.equal(classifyGarmentSubKind("tops", "コットンボクシーT(長袖)UL"), "tshirt");
  assert.equal(classifyGarmentSubKind("tops", "スウェットプルオーバー"), "sweat");
  assert.equal(classifyGarmentSubKind("tops", "スウェットプルパーカ"), "hoodie");
});

test("classifyGarmentSubKind separates the outer variants", () => {
  assert.equal(classifyGarmentSubKind("outer", "感動ジャケット"), "tailored-jacket");
  assert.equal(classifyGarmentSubKind("outer", "ドルマンスリーブデニムジャケット CL"), "denim-jacket");
  assert.equal(classifyGarmentSubKind("outer", "フリースジャケット"), "blouson");
  assert.equal(classifyGarmentSubKind("outer", "ウィンドプルーフシェルパーカ"), "mountain-parka");
  assert.equal(classifyGarmentSubKind("outer", "ウォームパデッドコート"), "coat");
  assert.equal(classifyGarmentSubKind("outer", "シームレスダウンパーカ"), "down");
  assert.equal(classifyGarmentSubKind("outer", "ダウンベスト"), "gilet");
});

test("classifyGarmentSubKind prefers the product name over the class name", () => {
  // クラス名 "Tシャツ・スウェット" は複数の細分類を含むため、商品名の判定を上書きしてはいけない。
  assert.equal(classifyGarmentSubKind("tops", "エアリズムコットンオーバーサイズTシャツ", "Tシャツ・スウェット"), "tshirt");
  assert.equal(classifyGarmentSubKind("tops", "無地プルオーバー", "Tシャツ・スウェット"), "sweat");
});

test("classifyGarmentSubKind never returns a sub kind outside the kind and falls back to other", () => {
  assert.equal(classifyGarmentSubKind("tops", "ダウンジャケット"), "other");
  assert.equal(classifyGarmentSubKind("bottoms", "ワイドフィットチノパンツ"), "chino");
  assert.equal(classifyGarmentSubKind("shoes", "レザータッチビジネスシューズ"), "leather-shoes");
  assert.equal(classifyGarmentSubKind("accessory", "レザーベルト"), "other");
  for (const kind of ["tops", "outer", "bottoms", "shoes"] as const) {
    assert.ok(subKindsForKind(kind).includes(classifyGarmentSubKind(kind, "名称不明の商品")));
  }
});
