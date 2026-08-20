# Sartor

予算内で洋服をコーディネートするアプリ。

- ファッション情報 (Uniqlo / GU / Amazon) をクロールして集積
- 素材・洗濯表示から **乾燥機可否** と **色落ちリスク** を判定
- LLM がコーディネート候補を提案し、**人間が採否を判断** する

## ステータス

prototyping-flow **Step 1** (粗く動く 1 本)。

## 起動

Node.js 22.13 以降で実行します。プロフィールと提案履歴は、既定では作業ディレクトリの
`sartor.sqlite` にローカル保存されます（変更する場合は `SARTOR_DB_PATH` を設定）。
プロフィールのサイズは日本サイズ (XS〜4XL、LL/3L 表記も同じ枠) から選びます。身長・体重は幅を持たせた丈感・体型ラベルに変換して LLM のシルエット考慮に使い、実測値と自由入力の体型メモは LLM へ渡しません。商品候補は選択サイズで絞り込みます。

```powershell
npm i
npm run crawl -- --brand uniqlo --gender MEN
npm run serve
```

## Uniqlo / GU カタログ取得

`--class` を省略すると、その性別で巡回できる全クラス (トップス各種・アウター・ボトムス・シューズ等) を順に取得します。
`--limit` を省略するとクラスの全件を取得します。既に取得済みで `--refresh-hours` (既定 24) より新しい商品は
詳細 API を叩かずに skip するため、再実行は差分だけになります。

```powershell
npm run crawl -- --brand uniqlo --gender MEN                          # 全クラス・全件 (差分更新)
npm run crawl -- --brand gu --gender MEN --class outer --limit 60     # クラス指定 + 上限
npm run crawl -- --brand uniqlo --gender MEN --refresh-hours 0        # 全件を強制的に取り直す
```

## 商品の細分類 (subKind)

各商品は大分類 `kind` (tops / outer / …) に加えて細分類 `subKind` を持ちます
(トップス: シャツ / ポロ / T シャツ / カットソー / ニット / カーディガン / ベスト / スウェット / パーカ、
アウター: テーラード / デニムジャケット / ブルゾン / マウンテンパーカ / コート / ダウン / ジレ)。
候補選定は `kind × subKind` ごとに枠を割るため、トップス枠が T シャツだけで埋まることがなくなります。

既存 DB の行を商品名から分類し直すには次を実行します。

```powershell
npm run reclassify
```

ブラウザで `http://localhost:3000` を開きます。`PORT` を設定すると待受ポートを変更できます。
提案にはローカルでログイン済みの [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`) を使います。API キーは不要です。
CLI が未インストールまたは PATH にない場合、提案 API は HTTP 501 `llm_unavailable` を返します。

## Amazon カタログ取得

メンズ・オフィスカジュアル・40 代向けの定義済み検索は次で実行します。`--limit` は各クエリごとの上限です。
preset は細分類ごとにクエリを分けており (`mens-tops-variety` / `mens-outer-variety` はトップス・アウターのみ)、
検索結果のうち狙った細分類に分類されない商品は保存しません。

```powershell
npm run crawl -- --brand amazon --preset mens-office-casual-40s --limit 30
npm run crawl -- --brand amazon --preset mens-outer-variety --limit 20
```

preset / 個別検索はクエリ単位で進捗 (次ページ・完了) を保存します。中断後に同じコマンドを再実行すると、
未完了のクエリを途中ページから再開します。最初からやり直す場合は `--restart` を付けます。

個別検索では性別・カテゴリ・検索語を明示します。

```powershell
npm run crawl -- --brand amazon --gender MEN --class shirts --query "メンズ オフィスカジュアル シャツ" --limit 30 --subkind shirt
```

Amazon 取得は固定の SartorBot 識別子で `robots.txt` を最初に確認し、リクエストを直列化します。各リクエスト間は 2 秒以上（0〜1 秒のジッタを加算）、個別検索（preset では各カテゴリ）は最大 120 リクエストです。CAPTCHA を検出した時点で直ちに停止し、以後 6 時間はクールダウンとして新規実行も即座に停止します
(回避は行わず、時間を置いてから再実行します)。

### Excubitor 経由で起動する

`excubitor.catalog.yaml` でサービス `sartor` (port 5395) を宣言しています。Excubitor から起動する場合は
`claude` CLI へのログインはこのアカウントのローカル設定を使います。`--env-file-if-exists` は他の任意設定のために残しています。
ブラウザは `http://127.0.0.1:5395` を開きます。
Cloudflare Tunnel 等の外部ドメイン経由でアクセスする場合は、環境変数 `LUDIARS_ALLOWED_HOSTS` (カンマ区切り。`.example.com` はサフィックス一致) に該当ホストを含めます。Excubitor 起動では `sartor${DOMAIN_ROOT}` をこの変数に設定します。
この許可リストは Host ヘッダーを検証するだけで認証にはなりません。外部公開するトンネルには Cloudflare Access 等の上流アクセス制御を必ず設定してください。
