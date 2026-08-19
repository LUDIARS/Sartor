# Sartor Step 1b — LLM を `claude -p` へ切替 + Amazon 自作クローラ

spec-id: SARTOR-STEP1B
状態: 実装済み (設計 = Fable 2026-08-19、実装 = Terra 委託)
前提: `spec/SPEC-STEP1-PROTOTYPE.md` (Step 1、マージ済 v0.1.0)。本書は Step 1 への **差分仕様**。矛盾する箇所は本書が優先する。

## 0. neco 決定 (2026-08-19)

1. **Anthropic は API キーを持たず、ローカルの `claude -p` (Claude Code CLI) で対応する。他プロジェクトと同じ方式** (前例: Ludellus-Server `src/talk/claudeCliRunner.ts` / Genius `src/distill/claude-cli-llm.ts`)。
2. **Amazon は自作クローラを作る** (PA-API 前提を撤回)。ターゲットは **メンズ・オフィスカジュアル・40 代**。
3. ブランチ運用は現状どおり (ローカル main 起点の worktree → Revisor local PR、GitHub へ直 push しない)。

## 1. LLM 実行の差し替え (`src/llm/`)

### 1.1 目的
`@anthropic-ai/sdk` と `ANTHROPIC_API_KEY` を廃止し、ローカルにログイン済みの `claude` CLI を子プロセスで呼ぶ。API キーは **一切持たない**。

### 1.2 ファイル構成 (SRP で分割)
```
src/llm/
  claude-cli-path.ts      # CLI 実体パスの解決 (where/which)。成功のみキャッシュ、失敗は毎回引き直す
  claude-cli-runner.ts    # `claude -p` 子プロセス実行 (stdin にプロンプト、stdout を返す、timeout で木ごと kill)
  proposal-parser.ts      # stdout → JSON 抽出 (``` フェンス剥がし) → zod (llmProposalSchema) 検証
  outfit-proposer.ts      # 既存。Anthropic クライアントを runner + parser に置換。候補参照検証 + 1 回の訂正再試行は維持
  prompt.ts               # 既存。「**JSON のみを出力** (前置き・コードフェンス禁止)」と出力スキーマの説明を system 側に追記
```

### 1.3 仕様
- 実行: `<cliPath> -p --model <model> --output-format text`。プロンプトは **stdin** で渡す (引数にユーザ入力を載せない)。system プロンプトは `--append-system-prompt` ではなく、stdin 先頭に `# System` ブロックとして結合してよい (Ludellus 前例と同じ)。
- モデル: 既定 `claude-opus-5`。env `SARTOR_CLAUDE_MODEL` で上書き可 (空文字は既定扱い)。
- タイムアウト: 既定 180,000 ms (env `SARTOR_CLAUDE_TIMEOUT_MS`)。超過時は Windows なら `taskkill /pid <pid> /T /F`、それ以外は `SIGKILL`。`execFile` 内蔵 timeout は使わない (cmd.exe 経由だと孫が残る)。
- Windows: `.cmd`/`.bat` シムは `shell: true` + パスを `"…"` で囲んで起動。`where claude` で先に実体を解決し、未インストールは **`ClaudeCliUnavailableError`** (HTTP **501 `llm_unavailable`**) に写像する。`LlmNotConfiguredError` / 503 `llm_not_configured` は削除。
- 出力: `maxBuffer` 4 MiB。空応答・JSON 不正・zod 不一致は `InvalidLlmProposalError` (既存の 502 経路)。JSON 抽出は「最初の `{` から最後の `}` まで」を採る単純法でよい。
- **`stub|mock|dummy` という語を `src/llm` に置かない** (Step 1 §9 と同じ)。テスト用には `execFileImpl` / `resolveCliPath` の注入点だけ用意する。
- `package.json` から `@anthropic-ai/sdk` を外す。`README.md` / `.env.example` / `excubitor.catalog.yaml` のコメントから `ANTHROPIC_API_KEY` を消す (`.env.example` は **空ファイルでなく削除**。`--env-file-if-exists` は残してよい)。
- ログ: 実行開始/終了/失敗を `src/log.ts` 経由で stderr (`llm_cli_started` / `llm_cli_completed` / `llm_cli_failed`、プロンプト本文は出さない)。

## 2. Amazon 自作クローラ (`src/crawl/amazon/`)

### 2.1 実測 (2026-08-19、Fable)
- `robots.txt` (`User-agent: *`): `/s?k=` (検索) `/b?node=` (カテゴリ) `/dp/<ASIN>` (商品) は **Disallow に無い**。AI 名義 (ClaudeBot / GPTBot / CCBot 等) は `Disallow: /`。→ **独自 UA** を使い、`SartorBot` の固有グループがあればそれを、なければ `*` グループを適用する。
- 検索 `GET https://www.amazon.co.jp/s?k=<query>&i=fashion&page=<n>` (UA `SartorBot/0.1 (+https://github.com/LUDIARS/Sartor; personal outfit research)`, `Accept-Language: ja-JP,ja;q=0.9`) → 200 / gzip / `data-asin="B0XXXXXXXX"` が 1 ページ 48 件、CAPTCHA 無し。
- 商品 `GET /dp/<ASIN>` → 301 で正規 URL へ → 200。取得できた項目: `<title>` / `#productTitle`、価格 `a-price-whole` (例 `2,499`)、画像 `data-old-hires` (`m.media-amazon.com/images/I/...jpg`)、「**素材構成: 綿, ポリエステル**」「素材とお手入れ」行。
- 利用規約上の自動取得禁止は neco が承知のうえで決定。**礼儀 (レート・UA・停止条件) を仕様で固定する。**

### 2.2 ファイル構成
```
src/crawl/amazon/
  amazon-robots.ts        # 個別検索の開始時に robots.txt を取得し、実際の crawler token と検索 URL、および /dp が許可されているか確認。取れない/拒否なら AmazonCrawlBlockedError で **開始しない** (fail-closed)
  amazon-http.ts          # fetch ラッパ。固定 UA / Accept-Language / 直列実行 / リクエスト間隔 ≥ 2,000 ms + 0–1,000 ms ジッタ / 個別検索あたり上限リクエスト数 (既定 120、preset は各カテゴリで新しい枠) / 429・503 は 1 回だけ 30 s 待って再試行、2 回目は中断 / CAPTCHA 検知 (`validateCaptcha` or `api-services-support@amazon.com` を本文に含む) は即中断 (AmazonCaptchaError)。**自動リトライループを組まない**
  amazon-search-parser.ts # 検索 HTML → { asin, title, priceJpy?, imageUrl?, productUrl }[]。`data-asin` が 10 桁英数の `div[data-component-type="s-search-result"]` のみ。スポンサー枠 (`AdHolder` / "スポンサー") は除外
  amazon-detail-parser.ts # 商品 HTML → { title, brand?, priceJpy?, imageUrl?, composition?, careText?, colors[], sizes[], bullets[] }。素材構成は `素材構成[:：]\s*(.+)` / 「素材」行 / 箇条書きの `綿\d+%` 等から、お手入れは「お手入れ」「洗濯」「乾燥機」「手洗い」を含む行から拾う。見つからなければ undefined (捏造しない)
  amazon-mapper.ts        # parser 出力 → Garment。`brand` = 商品ページのブランド (無ければ "Amazon")、`id` = `amazon:<ASIN>`、`productId` = ASIN、`priceGroup` = "00"、`gender` は CLI 指定、`kind` は CLI の --class から (shirts/knit/tshirt → tops、pants → bottoms、jacket/outer → outer、shoes → shoes)、`composition`/`washing_info` は parser の文字列、care は既存 `judgeCare()` に通す。`raw_json` に parser 出力全体を保存
  amazon-crawl-runner.ts  # query → 検索 N ページ → 各 ASIN の詳細 → mapper → GarmentRepository.upsert。limit 到達で停止。進捗は log.ts
```
HTML 解析は **正規表現 + 最小限の文字列処理**で行う (`cheerio` / `jsdom` / `puppeteer` / `playwright` 追加禁止、Step 1 §9 踏襲)。gzip は `fetch` が自動で解く。

### 2.3 CLI
`src/cli/crawl.ts` を拡張 (Fast Retailing 経路は無変更):
```
npm run crawl -- --brand amazon --gender MEN --class shirts --query "メンズ オフィスカジュアル シャツ" --limit 30
npm run crawl -- --brand amazon --preset mens-office-casual-40s --limit 30   # 下表を順に実行
```
preset `mens-office-casual-40s` (`src/crawl/amazon/amazon-presets.ts`):

| class  | query |
|--------|-------|
| shirts | メンズ オフィスカジュアル シャツ 40代 |
| knit   | メンズ ニット オフィスカジュアル 40代 |
| pants  | メンズ スラックス オフィスカジュアル 40代 |
| jacket | メンズ ジャケット オフィスカジュアル 40代 |
| shoes  | メンズ 革靴 ビジネスカジュアル |

`--limit` は class ごとの上限。`--brand amazon` で `--query` も `--preset` も無ければ引数エラー。

### 2.4 エラー/停止条件 (明示、黙ってスキップしない)
- `AmazonCrawlBlockedError` (robots 拒否 / 取得不能)、`AmazonCaptchaError`、`AmazonRateLimitedError` (429/503 再試行後)、リクエスト上限到達 → いずれも `catalog_crawl_failed` を出して **非 0 終了**。途中まで upsert 済みの件数はログに残す。
- `src/crawl/amazon-source.ts` (NotConfiguredError) は削除。

## 3. ドキュメント / Anatomia
- `.anatomia/domains/catalog-crawl.domain.json` の membership に `src/crawl/amazon/` を追加、`outfit-proposal.domain.json` に `src/llm/claude-cli-*.ts` / `proposal-parser.ts` を追加 (pathPattern で覆う)。`specRefs` に本書を追加。
- `README.md`: 「LLM はローカル `claude` CLI (ログイン済み Claude Code) を使う。API キー不要。未インストール時は 501」「Amazon クロール手順 (preset) と礼儀 (2 s 間隔、120 req/回、CAPTCHA で停止)」を追記。Step 1 §9 の `ANTHROPIC_API_KEY=... npm run serve` 行は削除。
- `spec/SPEC-STEP1-PROTOTYPE.md` は **編集しない** (歴史)。本書が差分。

## 4. 完了条件 (機械判定可能チェックリスト — PR 本文に結果を書く)
- [ ] `npm run typecheck` 0 エラー
- [ ] `grep -rn "@anthropic-ai\|ANTHROPIC_API_KEY" package.json src README.md excubitor.catalog.yaml .env.example` が 0 件 (`.env.example` は存在しない)
- [ ] `grep -rn "cheerio\|jsdom\|puppeteer\|playwright\|express\|better-sqlite3" package.json src` が 0 件
- [ ] `grep -rn "stub\|mock\|dummy" src/llm` が 0 件
- [ ] `grep -rn "console.log" src` が 0 件
- [ ] `src/llm/claude-cli-runner.ts` に `"-p"` と `taskkill` がある、`src/llm/outfit-proposer.ts` に `"claude-opus-5"` がある
- [ ] `src/crawl/amazon/amazon-http.ts` に `SartorBot/` と `validateCaptcha` と `2_000` (最小間隔) がある
- [ ] `src/crawl/amazon-source.ts` が存在しない
- [ ] `node <ANATOMIA_ROOT>/bin/anatomia.mjs verify --project sartor --json` の `domain` ゲートが PASS (新ファイルが全て membership で覆われる)
- [ ] 実走 (**実施する**): `SARTOR_DB_PATH=<一時ファイル> npm run crawl -- --brand amazon --gender MEN --class shirts --query "メンズ オフィスカジュアル シャツ 40代" --limit 5` が 5 件 upsert して 0 終了。結果 (件数・所要時間・CAPTCHA 有無・取れた素材構成の例) を PR 本文に書く。リポ内の `sartor.sqlite` には書かない
- [ ] 実走 (**実施する**、**serve は起動しない** — worktree からのサービス起動は禁止): `npx tsx` の使い捨てスクリプト (リポに残さない) で `OutfitProposer.propose()` を直接呼び、上記一時 DB の候補 (無ければ Fast Retailing を同じ一時 DB へ数件 crawl) に対して 3 案の JSON が返ることを確認する。ローカル `claude` CLI が使えない場合は `ClaudeCliUnavailableError` になることを確認して PR 本文に書く

## 5. やらないこと
Amazon ログイン / カート / レビュー取得、画像ダウンロード、並列クロール、プロキシ・UA ローテーション等の回避策、PA-API、Step 2 (Cernere/Corpus)。
