// リポジトリの点検：版の印がそろっていること、外部から読み込まないこと、READMEの決まりごと
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('CSS・JavaScriptのURLの版の印がそろっている', () => {
  const html = read('index.html');
  const ver = html.match(/window\.APP_VERSION = '([^']+)'/)[1];
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)[^"]*)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 10);
  for (const r of refs) assert.ok(r.endsWith('?v=' + ver), r + ' の版の印が ' + ver + ' ではない');
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, r.split('?')[0])), r + ' がない');
});

test('外部（CDN・外部のフォントや画像）から読み込まない', () => {
  const files = ['index.html', 'css/style.css', ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^(?!sample-).*\.js$/.test(f)).map((f) => 'js/' + f)];
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /(src|href)\s*=\s*["']https?:/i, f);
    assert.doesNotMatch(s, /@import|url\(\s*["']?https?:/i, f);
  }
  // 動的に読み込む部品はリポジトリの中にある
  for (const p of ['vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'vendor/pdfjs/cmaps.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
    'vendor/tesseract/tesseract-core-lstm.wasm.js', 'vendor/tesseract/jpn-traineddata.js', 'js/sample-pdfs.js', 'js/sample-image.js']) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), p);
  }
});

test('READMEの決まりごと', () => {
  const md = read('README.md');
  const lines = md.split('\n');
  assert.match(lines.slice(0, 5).join('\n'), /https:\/\/takashi-101\.github\.io\/shinsei-fubi-check\//);
  assert.match(md, /OLLAMA_ORIGINS/);
  assert.match(md, /lms server start --cors/);
  assert.match(md, /localhost:1234\/v1/);
  assert.match(md, /使い終わったら/);
  for (const ng of ['三層分離', 'マイナンバー利用事務系', '適合', '削減率', 'Claude', 'AIで作成']) assert.ok(!md.includes(ng), 'READMEに「' + ng + '」がある');
  for (const s of ['pdf.js', 'tesseract.js-core', '日本語の学習データ', 'Apache License 2.0']) assert.ok(md.includes(s), s);
});

test('LICENSE は MIT', () => {
  assert.match(read('LICENSE'), /^MIT License/);
});

test('個人名を入れる欄を作らない（担当は係名と役割）', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /(氏名|担当者名|確認者名)[^<]*<input/);
  assert.match(html, /担当係/);
  assert.match(html, /役割/);
});
