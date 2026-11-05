// 層4 確認結果票（A4）の印刷のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileUrl, openPage, chromium } = require('./helpers');

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

test('確認結果票：必要な項目がそろい、A4で印刷できる', async () => {
  const { context, page, errors } = await openPage(browser, fileUrl);
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.locator('#sample-details > summary').click();
  await page.click('[data-sample-case=\"shomei-ng\"]');
  await page.fill('#check-section', '市民課 証明係');
  await page.fill('#check-role', '受付');
  await page.fill('#check-receipt', 'R8-0123');
  await page.fill('#check-date', '2026-11-05');
  await page.click('#btn-print');
  assert.equal(await page.evaluate(() => window.__printed), 1);
  assert.equal(await page.evaluate(() => App.hasUnsaved()), false);
  const sheet = await page.textContent('#print-area');
  for (const s of ['確認結果票', '最終の判断は職員が行います', '（見本）各種証明書 交付申請', '2026年11月5日（令和8年）', 'R8-0123', '市民課 証明係', '受付',
    '使用目的', '未記入です', '存在しない日付', '委任状', '添付不足', '確認者', '審査者']) {
    assert.ok(sheet.includes(s), '確認結果票に「' + s + '」がない');
  }
  // 印刷の見た目：確認結果票だけが出る
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.isVisible('#print-area .sheet'), true);
  assert.equal(await page.isVisible('#panel-check'), false);
  const out = process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, 'sheet.pdf') : path.join(require('os').tmpdir(), 'sheet.pdf');
  await page.pdf({ path: out, preferCSSPageSize: true });
  const pdf = fs.readFileSync(out, 'latin1');
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages, 1, '確認結果票が1枚に収まっていない（' + pages + '枚）');
  assert.ok(/MediaBox\s*\[0 0 59[45]/.test(pdf), "A4ではない");
  // 欄の多い見本（補助金・記載漏れのある例）でも1枚に収まる
  await page.emulateMedia({ media: 'screen' });
  await page.click('[data-sample-case=\"hojokin-ng\"]');
  await page.click('#btn-print');
  await page.emulateMedia({ media: 'print' });
  const out2 = out.replace(/sheet\.pdf$/, 'sheet2.pdf');
  await page.pdf({ path: out2, preferCSSPageSize: true });
  const pages2 = (fs.readFileSync(out2, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages2, 1, '補助金の確認結果票が1枚に収まっていない（' + pages2 + '枚）');
  assert.deepEqual(errors, []);
  await context.close();
});
