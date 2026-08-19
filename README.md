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

```powershell
npm i
npm run crawl -- --brand uniqlo --gender MEN --class pants --limit 30
$env:ANTHROPIC_API_KEY = "..."
npm run serve
```

POSIX シェルでは、最後の 2 行を `ANTHROPIC_API_KEY=... npm run serve` として実行します。

ブラウザで `http://localhost:3000` を開きます。`PORT` を設定すると待受ポートを変更できます。
`ANTHROPIC_API_KEY` がない状態で提案を依頼すると、提案を作らずに明示エラーを返します。

### Excubitor 経由で起動する

`excubitor.catalog.yaml` でサービス `sartor` (port 5395) を宣言しています。Excubitor から起動する場合は
リポ直下の `.env` (gitignore 済) に `ANTHROPIC_API_KEY=...` を置くと `--env-file-if-exists` で読み込まれます。
ブラウザは `http://127.0.0.1:5395` を開きます。
