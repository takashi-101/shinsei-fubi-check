// 見本のデータをJSONで出す（tools/make-sample-pdfs.py に渡す）
process.stdout.write(JSON.stringify(require('../js/samples.js')));
