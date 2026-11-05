#!/bin/sh
# 見本の申請書PDF（そろっている例・補助金）を、スキャン画像に見立てたPNGにする。
# 必要なもの：pdftoppm（poppler-utils）、node
set -e
cd "$(dirname "$0")/.."
pdftoppm -r 150 -png -singlefile -gray samples/hojokin-ok.pdf samples/hojokin-ok-scan
node -e '
const fs=require("fs");
const b=fs.readFileSync("samples/hojokin-ok-scan.png").toString("base64");
fs.writeFileSync("js/sample-image.js","/* 見本のスキャン画像（架空の申請書）。tools/make-sample-image.sh で作成。ボタン1つで試せるよう埋め込んだもの。 */\nwindow.SFC_SAMPLE_IMAGE=\""+b+"\";\n");'
echo "作成: samples/hojokin-ok-scan.png js/sample-image.js"
