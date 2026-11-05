# 申請書類 記載漏れ・添付漏れ確認ツール

公開URL：https://takashi-101.github.io/shinsei-fubi-check/

画面の「見本で試す」から、架空の見本データで使い方を確かめられます。

## 何の道具か

自治体の窓口・審査担当が、住民や事業者から受け付けた申請書について、記載漏れ・書式の誤り・添付書類の不足を受付の時点で確かめるための道具です。差し戻しの原因になる単純な記載漏れを、受付の段階で見つけるための下ごしらえを行います。**最終の判断は職員が行います。**

## 誰が何に使うか

| 使う人 | 使う場面 |
| --- | --- |
| 窓口の受付担当 | 申請書を受け取ったその場で、必須の欄の未記入、日付・郵便番号・電話番号・金額などの書式の誤り、添付書類の不足を確かめる |
| 審査担当 | 審査に入る前の形式審査として、確認結果票（A4）を作って回付する |
| 所管課の担当係 | 申請の種類ごとに、必須の欄・書式・添付書類（条件付きを含む）を登録し、設定のファイルを係内で配る |

## できること

1. **確認項目の設定**：申請の種類ごとに、必須の欄、欄ごとの書式（日付、数字のみ・桁数、郵便番号、電話番号、金額、選択肢、記載の有無のみ）、添付書類（必須・条件付き・任意）を登録します。条件付きの添付書類は「どの欄がどの値のとき必要か」を指定できます。設定はJSONで書き出し・読み込み（置き換え）・追加の取り込み（同じ申請の種類は取り込まず件数を表示）ができ、CSVでも書き出せます。
2. **判定**：申請書の値を入力し、受け取った添付書類に印を付けると、「確認済み」「要確認」「添付不足」に分けて一覧にします。要確認には理由を1行で示します。判定にはAIも文字の読み取りも使いません。
3. **文字を選べるPDFからの取り込み**：電子申請やパソコンで作られた申請書のPDFを画面に落とすと、文字を取り出し、設定の欄名を手がかりに値の候補を入れます。候補は黄色で示し、職員が申請書と見比べて確定します。未確定の候補は「要確認」として扱います。
4. **確認結果票の印刷**：申請の種類、確認日、各欄の結果、添付書類の有無、確認者・審査者の押印欄をA4の1枚にまとめて印刷します。
5. **見本**：架空の申請の種類3つ（補助金の交付申請、公共施設の使用許可申請、各種証明書の交付申請）と、それぞれ記載漏れのある例・そろっている例の値、文字を選べるPDF（`samples/`）を同梱しています。
6. **スキャン画像からの文字の読み取り**：PNG・JPEGの画像から文字を読み取り、値の候補を入れます。手書きの文字は読み取れないことが多く、活字でも読み違いがあります。必ず申請書と見比べて確定してください。
7. **AIで候補を補う（任意）**：取り込んだ文字から、欄名で見つからなかった欄の候補をAIに出させます。既定はこのPCで動くOllamaです。外部のAPI（OpenAI互換）は、使う人が選んだときだけ使います。AIにつながらなくても、ほかの機能はすべて使えます。

## 動かし方

- インストールもビルドも要りません。このリポジトリ一式を取得し、`index.html` をブラウザ（Microsoft Edge、Google Chrome など）で開くだけで動きます。
- ネットにつながらないPCでも動きます。部品（pdf.js、Tesseract、日本語の学習データ）はリポジトリの中に同梱しており、外部から読み込むものはありません。
- 一式の取得：GitHubの画面の「Code」→「Download ZIP」で取得し、展開したフォルダの `index.html` を開きます。
- 画像からの読み取りは、初回に部品（約8MB）を読み込むため、数十秒かかることがあります。読み取り中は画面が動きません。

## データの扱い（PCの外に出ないこと）

- 入力した申請書の内容は、ブラウザに保存しません。画面を閉じると消えます。判定の結果を書き出さずに画面を閉じようとすると、確認が出ます。
- ブラウザに保存するのは、確認項目の設定と、AIの接続先（URLとモデル名）だけです。外部のAPIのキーは保存しません。
- 取り込んだPDF・画像は、このPCの中で読みます。どこにも送りません。
- 外部へ送るのは、使う人が外部のAPIを選び、送信の確認に了承したときだけです（申請書から取り出した文字が送られます）。
- 個人名を入れる欄はありません。担当は係名と役割で表します。氏名・住所などの欄は「記載の有無のみ」の書式にすると、値を入れずに記載があるかだけを確認できます。
- 書き出したファイル（設定、判定の結果）の扱いは、各課の規程に従ってください。

## Ollamaの設定手順（AIを使う場合）

Ollamaは、PCの中でAIを動かすソフトです。このツールからOllamaに問い合わせるには、ブラウザからの接続を許す設定（`OLLAMA_ORIGINS`）が要ります。

1. Ollamaを入れ、モデルを1つ入れます（例：`ollama pull qwen2.5:7b`。メモリ16GBのPCでは7B〜8B程度のモデルが目安です）。
2. 環境変数 `OLLAMA_ORIGINS` を設定し、Ollamaを起動し直します。
   - Windows（PowerShell）：
     ```powershell
     setx OLLAMA_ORIGINS "*"
     ```
     設定後、タスクトレイのOllamaを終了して起動し直します。
   - macOS：
     ```bash
     launchctl setenv OLLAMA_ORIGINS "*"
     ```
     設定後、Ollamaを終了して起動し直します。
   - GitHub Pagesの公開URLで使うだけなら、`*` の代わりに `https://takashi-101.github.io` を指定できます。ファイルを直接開いて使う場合は `*` が要ります。
3. このツールの「確認項目の設定」の画面の下、「AIの接続（任意）」で、接続先（既定 `http://localhost:11434`）とモデル名を入れ、「接続を試す」を押します。
4. **ネットにつながったPCでは、使い終わったら `OLLAMA_ORIGINS` を元に戻してください。** そのままにすると、閲覧したほかのWebページからもこのPCのOllamaに接続できる状態が続きます。
   - Windows：`[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $null, "User")` を実行し、Ollamaを起動し直します。
   - macOS：`launchctl unsetenv OLLAMA_ORIGINS` を実行し、Ollamaを起動し直します。

## 確認項目の設定の配り方

1. 所管の係で設定を作り、「設定をJSONで書き出す」でファイルにします。
2. 係内のほかのPCで「JSONを読み込む（置き換え）」か「JSONを追加で取り込む」を使います。追加の取り込みでは、同じ申請の種類（同じIDか同じ名前）は取り込まず、件数を表示します。

## 更新したときの版の印（キャッシュ対策）

CSSとJavaScriptのURLには `?v=20261105-1` のような版の印を付けています。ファイルを更新したら、印を新しい値に付け直してください。付け直すと、使う人が普通に開き直すだけで新しい版が読み込まれます。

1. 新しい印を決めます（例：日付と連番で `20261201-1`）。
2. リポジトリの直下で次を実行し、すべての印を置き換えます（`index.html` の `APP_VERSION` と、各 `?v=` が対象です）。
   ```bash
   grep -rl "20261105-1" index.html | xargs sed -i "s/20261105-1/20261201-1/g"
   ```
3. テストで印がそろっていることを確かめます（`node --test test/*.test.js`）。

## テスト

Node.js（22以降）とPlaywrightが使える環境で、リポジトリの直下で実行します。

```bash
node --test test/*.test.js
```

AI（Ollama、外部のAPI）は、応答の形をまねた仮のサーバーで確かめています。本物のOllama・外部のAPIでの確認は、使う人の環境で行ってください。

## 見本のファイルの作り直し

```bash
node tools/dump-samples.js | python3 tools/make-sample-pdfs.py
```

```bash
sh tools/make-sample-image.sh
```

## 同梱した部品のライセンス

| 部品 | 版 | 置き場所 | ライセンス |
| --- | --- | --- | --- |
| pdf.js（pdfjs-dist、legacy build） | 3.11.174 | `vendor/pdfjs/pdf.min.js`、`pdf.worker.min.js` | Apache License 2.0（`vendor/pdfjs/LICENSE`） |
| pdf.js 同梱の文字コード対応表（Adobe CMap） | pdfjs-dist 3.11.174 同梱分 | `vendor/pdfjs/cmaps.js` | BSD 3-Clause（`vendor/pdfjs/cmaps-LICENSE`） |
| tesseract.js-core（Tesseract OCR のWebAssembly版） | 7.0.0 | `vendor/tesseract/tesseract-core-simd-lstm.wasm.js`、`tesseract-core-lstm.wasm.js` | Apache License 2.0（`vendor/tesseract/LICENSE-tesseract.js-core`） |
| tesseract.js（呼び出し方の参考にした本体。コードは同梱していない） | 7.0.0 | — | Apache License 2.0（`vendor/tesseract/LICENSE-tesseract.js.md`） |
| 日本語の学習データ（jpn.traineddata、4.0.0_best_int） | @tesseract.js-data/jpn 1.0.0 | `vendor/tesseract/jpn-traineddata.js` | 元データ tesseract-ocr/tessdata_best は Apache License 2.0（`vendor/tesseract/LICENSE-tessdata_best`）。配布パッケージの package.json の表記は MIT |

## ライセンス

MIT License（`LICENSE`）
