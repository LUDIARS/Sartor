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
npm run crawl -- --brand uniqlo --gender MEN --class pants --limit 30
npm run serve
```

ブラウザで `http://localhost:3000` を開きます。`PORT` を設定すると待受ポートを変更できます。
提案にはローカルでログイン済みの [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`) を使います。API キーは不要です。
CLI が未インストールまたは PATH にない場合、提案 API は HTTP 501 `llm_unavailable` を返します。

## Amazon カタログ取得

メンズ・オフィスカジュアル・40 代向けの定義済み検索は次で実行します。`--limit` は各カテゴリごとの上限です。

```powershell
npm run crawl -- --brand amazon --preset mens-office-casual-40s --limit 30
```

個別検索では性別・カテゴリ・検索語を明示します。

```powershell
npm run crawl -- --brand amazon --gender MEN --class shirts --query "メンズ オフィスカジュアル シャツ" --limit 30
```

Amazon 取得は固定の SartorBot 識別子で `robots.txt` を最初に確認し、リクエストを直列化します。各リクエスト間は 2 秒以上（0〜1 秒のジッタを加算）、個別検索（preset では各カテゴリ）は最大 120 リクエストです。CAPTCHA を検出した時点で直ちに停止します。

### Excubitor 経由で起動する

`excubitor.catalog.yaml` でサービス `sartor` (port 5395) を宣言しています。Excubitor から起動する場合は
`claude` CLI へのログインはこのアカウントのローカル設定を使います。`--env-file-if-exists` は他の任意設定のために残しています。
ブラウザは `http://127.0.0.1:5395` を開きます。
