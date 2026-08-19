# Sartor Step 1 設計書 — 予算内コーディネート提案プロトタイプ

- 状態: prototyping-flow **Step 1** (粗く動く 1 本を通す)。Step 2 (Cernere/Corpus/Foundation UI) はやらない。
- 設計: Claude Fable 5 / 実装: 委託 (Codex GPT-5.6 Terra xhigh)
- 作業ブランチ: `feat/step1-prototype` (origin に存在。**このブランチに積む**。PR #1 が受け皿)
- 言語/ランタイム: TypeScript (strict, ESM) / Node >= 22.13 / `tsx` 実行 / DB は `node:sqlite` (`DatabaseSync`)。依存追加は最小 (既に `@anthropic-ai/sdk`, `zod` を入れてある。**これ以外の runtime 依存を足さない**。特に better-sqlite3 / express / puppeteer 禁止)。

## 1. 目的

ユーザが **最初にパーソナルデータを入力** し、**年代 × TPO で階層化されたファッションベクトル** を選ぶと、
集積済み商品 (Uniqlo / GU、Amazon は後続) から **予算内** のコーディネート候補を LLM が複数提案し、
**人間が採否を押す**。各商品は素材・洗濯表示から **乾燥機可否** と **色落ちリスク** が判定されて表示される。

## 2. UX フロー (1 画面 SPA、素の HTML/CSS/JS。フレームワーク不使用)

1. **プロフィール入力** (最初の画面。未入力なら他へ進めない)
   - 表示名 (任意) / 性別区分 `WOMEN|MEN|UNISEX` / 年代 `10s|20s|30s|40s|50s|60s+` / 身長 cm / トップスサイズ / ボトムスサイズ (ウエスト cm or 表記) / 体型メモ (自由文) / 好きな色・避けたい色 / NG 素材 (例: ウール) / **乾燥機を使うか** (bool) / 色落ち回避 (bool) / 月の洋服予算 JPY (既定)
   - 保存先はローカル SQLite のみ。Step 2 で Cernere 単一情報源に移す前提。**外部送信しない** (LLM へ渡すのは性別区分・年代・サイズ・色嗜好・NG 素材・乾燥機/色落ち設定のみ。表示名は渡さない)
2. **ベクトル選択** (階層化: 大枠 → 細目)
   - 層 1: **年代** (プロフィールから既定選択、変更可)
   - 層 2: **TPO**: `work(仕事)|casual(休日)|date(デート)|formal(冠婚葬祭・式典)|outdoor(アウトドア)|home(在宅)|travel(旅行)`
   - 層 3: **スタイル軸** (複数選択可、重み 1〜3): `clean(きれいめ)|casual(カジュアル)|street(ストリート)|mode(モード)|natural(ナチュラル)|sporty(スポーティ)|classic(トラッド)|minimal(ミニマル)|feminine(フェミニン)|outdoor(アウトドア)`
   - 層 4 (任意): 季節 `spring|summer|autumn|winter`、色調 `mono|earth|pastel|vivid|navy-based`
   - 年代 × TPO の組合せごとに **推奨スタイル既定値** をコードで持つ (`src/domain/fashion-vectors.ts` の静的テーブル)。選択 UI はこの既定値をプリセットとして出し、ユーザが増減する
3. **予算入力**: 今回のコーデ上限 JPY (既定はプロフィール月予算)、対象アイテム種別 (トップス/ボトムス/アウター/ワンピース/シューズ/小物 のチェック)
4. **提案**: 「提案する」→ サーバが LLM に候補生成させ **3 案** 返す。各案: アイテム一覧 (商品名/ブランド/価格/色/画像URL/商品URL/素材/乾燥機可否/色落ちリスク)、合計金額、予算差、LLM の根拠 1〜3 文、**注意 (乾燥機不可アイテム・色落ち注意アイテムの明示)**
5. **人間判断**: 各案に `採用 / 保留 / 却下` ボタン + メモ。判断は `proposal_decisions` に保存。採用案は「コーデ帳」一覧に出る
6. 履歴: 過去の提案と判断を一覧 (最小でよい)

## 3. ディレクトリ構成 (SRP: 1 ファイル 1 責務。行数上限は設けない)

```
src/
  domain/
    types.ts               # Garment / Profile / FashionVector / OutfitProposal / Decision の型 (zod schema + infer)
    fashion-vectors.ts     # 層 1〜4 の語彙 + 年代×TPO→推奨スタイル既定テーブル
    care-rules.ts          # 洗濯表示文字列・素材 → {dryerOk: true|false|null, colorBleedRisk: 'low'|'mid'|'high'|null, reasons[]}
    budget.ts              # 予算内判定・合計計算 (純関数)
  crawl/
    fast-retailing-client.ts  # Uniqlo/GU 共通 API クライアント (一覧 + 詳細)。fetch + 待ち時間 (>=300ms/req) + UA 明示 + 失敗時 fail-fast
    fast-retailing-mapper.ts  # API JSON → Garment (素材/洗濯表示/価格/色/画像/URL)
    brand-catalog.ts          # ブランド定義: baseUrl / 商品ページ URL テンプレ / genderId↔区分 対応 / class名→kind 表
    amazon-source.ts          # Amazon は PA-API 経由のみ。env SARTOR_AMAZON_PAAPI_ACCESS_KEY 等が無ければ **明示エラー** (黙ってスキップしない)。Step 1 では API 呼び出し本体は未実装で `NotConfiguredError` を投げるだけ。スクレイピング実装は禁止 (Amazon 利用規約)
    crawl-runner.ts           # ブランド×性別×クラスを巡回して garment-repo に upsert。進捗は stderr
  store/
    db.ts                     # node:sqlite open + migrate (CREATE TABLE IF NOT EXISTS、冪等)
    garment-repo.ts           # garments CRUD / 検索 (性別, 種別, 価格帯, ブランド)
    profile-repo.ts           # profiles CRUD (単一ユーザ想定、id=1)
    proposal-repo.ts          # proposals / proposal_options / proposal_items / proposal_decisions
  llm/
    outfit-proposer.ts        # Claude 呼び出し (候補商品リスト + プロフィール + ベクトル + 予算 → 3 案、zod で構造化出力)
    candidate-selector.ts     # LLM に渡す前の候補絞り込み (性別/種別/価格 ≤ 予算/NG 素材/乾燥機設定) 純関数。最大 N=60 件
    prompt.ts                 # system / user プロンプト組み立て (文字列のみ)
  web/
    server.ts                 # node:http サーバ。静的配信 + JSON API ルーティング
    routes/profile.ts         # GET/PUT /api/profile
    routes/vectors.ts         # GET /api/vectors (語彙と既定値)
    routes/garments.ts        # GET /api/garments?gender=&kind=&maxPrice=
    routes/proposals.ts       # POST /api/proposals (提案生成) / GET /api/proposals / POST /api/proposals/:id/decision
    public/index.html, app.js, style.css   # SPA (画面 2 節の 1〜6)
  cli/
    crawl.ts                  # `npm run crawl -- --brand uniqlo --gender MEN --class pants --limit 50`
    serve.ts                  # `npm run serve` (PORT env、既定 3000 → ポートは Excubitor catalog に登録するまで暫定)
  log.ts                      # stderr への最小ロガー (console.log 直書き禁止の受け皿。Vestigium 接続は Step 2)
tests/
  care-rules.test.ts          # node --test (実行はしなくてよい)
```

## 4. データモデル (SQLite)

- `garments(id TEXT PK = brand:productId:priceGroup, brand, product_id, price_group, name, gender, kind, price_jpy INT, currency, colors_json, sizes_json, composition TEXT, washing_info TEXT, dryer_ok INT NULL, color_bleed_risk TEXT NULL, care_reasons_json, image_url, product_url, raw_json, crawled_at TEXT ISO8601)`
  - `kind`: `tops|bottoms|outer|onepiece|shoes|accessory|inner|other` (ブランドの class 名からマッピング。`brand-catalog.ts` に表)
- `profiles(id INT PK, display_name, gender, age_band, height_cm, top_size, bottom_size, body_notes, fav_colors_json, avoid_colors_json, ng_materials_json, uses_dryer INT, avoid_color_bleed INT, monthly_budget_jpy INT, updated_at)`
- `proposals(id INT PK AUTOINCREMENT, profile_id, vector_json, budget_jpy, kinds_json, model, created_at)`
- `proposal_options(proposal_id, option_index INT, total_jpy INT, over_budget INT, rationale TEXT, cautions_json)` — option_index 0..2
- `proposal_items(proposal_id, option_index, garment_id, role TEXT, reason TEXT)`
- `proposal_decisions(proposal_id, option_index, decision TEXT CHECK(decision IN ('accept','hold','reject')), note, decided_at)`

## 5. ケア判定ルール (`care-rules.ts`, 純関数・テーブル駆動)

入力: `composition` (例 `100% 毛`, `綿 60%, ポリエステル 40%`), `washingInformation` (例 `洗濯機可・ネット使用, ドライクリーニング可, 乾燥機不可`), 色名。

- dryerOk:
  - 文字列に `乾燥機不可|タンブル乾燥禁止|タンブル乾燥不可` → `false`
  - `乾燥機可|タンブル乾燥可|タンブル乾燥 低温` → `true`
  - どちらも無ければ素材ヒューリスティック: 毛/ウール/シルク/絹/レーヨン/麻/リネン/カシミヤ/レザー が主成分 → `false`、綿/ポリエステル/ナイロン 100% 系 → `null` (不明) に `reasons` で「表示なし・素材から推定不可」
- colorBleedRisk:
  - `色落ち|移染|色移り|単独洗い` を含む → `high`
  - デニム/インディゴ/濃色 (黒・ネイビー・濃紺・赤) × 綿主体 → `mid`
  - それ以外 → `low`、情報無し → `null`
- 必ず `reasons: string[]` に根拠を残す (UI に表示)。

## 6. クロール仕様 (Uniqlo / GU)

実測済み API (2026-08-19):
- 一覧: `GET {base}/jp/api/commerce/v5/ja/products?path={genderId},{classId},,&limit=50&offset=N&httpFailure=true`
  - `result.items[]`: `productId` (例 `E494047-000`), `priceGroup` (`00`), `name`, `genderCategory`, `prices.base.value`, `colors[]`, `sizes[]`, `images.main[colorCode].image`
  - `result.aggregations.tree.genders[] / classes[]` で id 取得 (Uniqlo: genders 1071 Women/1072 Men, class 例 1751 パンツ・ズボン(Men)/1481 パンツ・ズボン(Women); GU: genders 2256 WOMEN/2257 MEN, class 例 36371 パンツ)
  - `result.pagination.total/offset/count`
- 詳細: `GET {base}/jp/api/commerce/v5/ja/products/{productId}/price-groups/{priceGroup}/details?includeModelSize=false&httpFailure=true`
  - `result.composition` (素材), `result.washingInformation` (洗濯表示), `result.breadcrumbs`, `result.longDescription`
- base: Uniqlo `https://www.uniqlo.com`, GU `https://www.gu-global.com`。商品 URL: `{base}/jp/ja/products/{productId}/{priceGroup}`
- class id は **起動時に一覧 API の `aggregations.tree.classes` から名前で解決** する (id ハードコード禁止。名前→kind 表のみコードに持つ)
- 礼儀: UA を `Sartor/0.1 (+LUDIARS prototype)` で明示、リクエスト間 >= 300ms、並列 1、HTTP 非 2xx は例外 (リトライ 2 回まで)。robots.txt で商品ページは許可済 (検索/カート/フィルタ URL は触らない)。
- `--limit` で件数上限、クラス名→`kind` マッピング (例: パンツ・ズボン/パンツ→bottoms、アウター→outer、Tシャツ・スウェット/Tシャツ・カットソー/シャツ・ポロシャツ/シャツ・ブラウス/ニット・カーディガン/セーター・カーディガン/スウェット→tops、スカート・ワンピース/ワンピース・チュニック/スカート→onepiece (スカートは bottoms)、シューズ→shoes、グッズ→accessory、インナー・下着→inner、花/ルームウェア/マタニティ→**スキップ**)。

## 7. LLM 契約 (`outfit-proposer.ts`)

- SDK: `@anthropic-ai/sdk`。モデル `claude-opus-5`。`client.messages.parse` + `zodOutputFormat` (`@anthropic-ai/sdk/helpers/zod`) で構造化出力。`max_tokens: 16000`。
- 認証: `ANTHROPIC_API_KEY` 未設定の場合は **POST /api/proposals 時に明示エラー** (`LlmNotConfiguredError` → HTTP 503 `{error:{code:"llm_not_configured"}}`)。**スタブ/ダミー提案へのフォールバック禁止** (規約 §7.1)。
- 入力: 候補 ≤60 件 (`candidate-selector.ts` で絞った `{id, brand, name, kind, price, colors, composition, dryerOk, colorBleedRisk}`), プロフィール抜粋, ベクトル, 予算, 対象種別。
- 出力 zod: `{ options: [{ items: [{garmentId, role}], rationale, cautions: string[] }] }` (options は 3 件)。`garmentId` は候補集合に含まれるものだけ (サーバ側で検証、逸脱は 1 回だけ再要求 → それでも駄目ならエラー)。合計は **サーバで再計算** し、予算超過案は `overBudget: true` で返す (LLM の自己申告を信じない)。
- プロンプト指針: 年代×TPO×スタイル重みを説明、予算内、同系色/素材の組み合わせ理由、乾燥機を使う人には dryerOk=false を避けるか cautions に必ず記載、色落ち回避なら high を避ける。

## 8. Web API

- `GET /api/profile` / `PUT /api/profile` (zod 検証、400)
- `GET /api/vectors` → 語彙 + `defaultsFor(ageBand, tpo)`
- `GET /api/garments?gender&kind&maxPrice&limit`
- `POST /api/proposals` body `{ vector, budgetJpy, kinds[] }` → `{ proposalId, options[] }`
- `GET /api/proposals` / `GET /api/proposals/:id`
- `POST /api/proposals/:id/decision` body `{ optionIndex, decision, note }`
- エラーは `{ error: { code, message } }` JSON。秘密情報はログ/応答に出さない。

## 9. 完了条件 (機械判定可能チェックリスト — PR 本文に結果を書くこと)

- [ ] `npm run typecheck` が 0 エラー
- [ ] `grep -rn "better-sqlite3\|express\|puppeteer\|playwright\|cheerio" package.json src` が 0 件
- [ ] `grep -rn "amazon.co.jp" src/crawl` が `amazon-source.ts` 以外 0 件 かつ `amazon-source.ts` に HTML 取得コード (`fetch(`) が無い
- [ ] `grep -rn "console.log" src` が 0 件 (診断は `src/log.ts` 経由で stderr)
- [ ] `src/llm/outfit-proposer.ts` に `"claude-opus-5"` と `messages.parse` がある、かつ `src/llm` に `stub|mock|dummy` という語が無い
- [ ] `src/domain/care-rules.ts` の `judgeCare()` が `乾燥機不可` → `dryerOk=false`、`100% 毛` + 表示なし → `false`、`色落ち` → `high` を返す (テーブル駆動。`tests/care-rules.test.ts` を `node --test` 形式で 1 本置く。**実行はしなくてよい**)
- [ ] `src/web/public/index.html` に プロフィール画面 → ベクトル画面 (年代/TPO/スタイル重み) → 予算 → 提案 3 案 → 採用/保留/却下 の DOM が存在する (`id="profile-form"`, `id="vector-form"`, `id="budget-form"`, `id="proposals"`, ボタンに `data-decision="accept|hold|reject"`)
- [ ] `.anatomia/domains/*.domain.json` (既に 5 本置いてある: `catalog-crawl`, `care-judgement`, `outfit-proposal`, `web-ui`, `storage`) が `src/` 全ファイルをいずれかの membership で覆う。新ファイルを足したら membership も更新
- [ ] README に起動手順 (`npm i` → `npm run crawl -- --brand uniqlo --gender MEN --class pants --limit 30` → `ANTHROPIC_API_KEY=... npm run serve`) を追記

## 10. やらないこと (スコープ外)

Cernere/Corpus 統合、Foundation UI、認証、複数ユーザ、Amazon 実クロール、画像解析、テスト実行、本番デプロイ、Excubitor 登録。
