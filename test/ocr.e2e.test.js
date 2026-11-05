// 層6 スキャン画像からの文字の読み取り（同梱のTesseractで実際に読み取る）
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT, startServer, fileUrl, openPage, chromium } = require('./helpers');

let browser, server;
test.before(async () => { browser = await chromium.launch(); server = await startServer(); });
test.after(async () => { await browser.close(); server.srv.close(); });

for (const mode of ['file', 'http']) {
  test(`画像の読み取り：見本のスキャン画像から候補が入る（${mode}）`, { timeout: 240000 }, async () => {
    const { context, page, errors, external } = await openPage(browser, mode === 'file' ? fileUrl : server.url);
    page.setDefaultTimeout(200000);
    await page.locator('#sample-details > summary').click();
    const started = Date.now();
    await page.click('[data-sample-image="hojokin-ok"]');
    await page.waitForFunction(() => /候補を入れました|読み取れませんでした/.test(document.querySelector('#import-msg').textContent));
    const msg = await page.textContent('#import-msg');
    console.log(`  ${mode}: ${Math.round((Date.now() - started) / 1000)}秒 / ${msg}`);
    assert.match(msg, /画像の読み取りから \d+欄に候補を入れました/);
    const n = Number(msg.match(/から (\d+)欄/)[1]);
    assert.ok(n >= 6, '候補が少なすぎる: ' + n);
    // 読み取った値は候補（未確定）として入る
    assert.ok(await page.locator('.field-row.candidate').count() >= 6);
    assert.match(await page.textContent('#check-fields'), /画像の読み取りからの候補（未確定）/);
    // 活字の見本では、少なくとも電話番号と郵便番号は正しく読めること
    assert.equal(await page.inputValue('#in-h-zip'), '123-4567');
    assert.equal(await page.inputValue('#in-h-tel'), '03-1234-5678');
    // 2回目（部品は読み込み済み）はファイルを落とす操作で
    await page.click('#btn-clear');
    await page.setInputFiles('#import-file', path.join(ROOT, 'samples/hojokin-ok-scan.png'));
    await page.waitForFunction(() => /候補を入れました|読み取れませんでした/.test(document.querySelector('#import-msg').textContent));
    assert.match(await page.textContent('#import-msg'), /候補を入れました/);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  });
}
