// 層2 確認作業 画面のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startServer, fileUrl, openPage, chromium } = require('./helpers');

let browser, server;
test.before(async () => { browser = await chromium.launch(); server = await startServer(); });
test.after(async () => { await browser.close(); server.srv.close(); });

for (const mode of ['file', 'http']) {
  test(`確認作業：見本の判定・手入力・書き出し（${mode}）`, async () => {
    const { context, page, errors, external } = await openPage(browser, mode === 'file' ? fileUrl : server.url);
    // 初めは確認作業の画面
    assert.equal(await page.isVisible('#panel-check'), true);
    assert.match(await page.textContent('#panel-check .notice-final'), /最終の判断は職員が行います/);

    await page.locator('#sample-details > summary').click();
    await page.selectOption('#sample-case', 'hojokin-ng');
    await page.click('#btn-sample-case');
    await page.waitForSelector('#count-check');
    const nCheck = Number(await page.textContent('#count-check'));
    const nMissing = Number(await page.textContent('#count-missing'));
    assert.ok(nCheck >= 5, 'check ' + nCheck);
    assert.equal(nMissing, 2);
    const checkText = await page.textContent('#group-check');
    assert.match(checkText, /所在地の郵便番号郵便番号は7桁です/);
    assert.match(checkText, /交付申請額金額が上限/);
    assert.match(await page.textContent('#group-missing'), /履歴事項全部証明書/);

    // 直すと結果が変わる
    await page.fill('#in-h-zip', '123-4567');
    assert.doesNotMatch(await page.textContent('#group-check'), /所在地の郵便番号/);
    await page.check('#att-h-a3');
    assert.equal(Number(await page.textContent('#count-missing')), 1);
    // 区分を個人事業主にすると、開業届が必要になり履歴事項は対象外
    await page.selectOption('#in-h-kubun', '個人事業主');
    assert.match(await page.textContent('#group-missing'), /開業届の写し/);

    // 閉じる前の確認が要る状態
    assert.equal(await page.evaluate(() => App.hasUnsaved()), true);

    // CSV書き出し
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-result-csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(csv.startsWith('﻿申請の種類'));
    assert.match(csv, /開業届の写し/);
    assert.equal(await page.evaluate(() => App.hasUnsaved()), false);

    // そろっている例
    await page.selectOption('#sample-case', 'shomei-ok');
    await page.click('#btn-sample-case');
    assert.equal(await page.textContent('#count-check'), '0');
    assert.equal(await page.textContent('#count-missing'), '0');

    // 申請の種類を変えると確認が出て、入力が消える
    page._dialogs = [];
    await page.selectOption('#check-type', 'sample-hojokin');
    assert.ok(page._dialogs.some((m) => /保存されません/.test(m)));
    assert.equal(await page.inputValue('#in-h-tel'), '');

    // 申請書の内容はブラウザに保存されない
    await page.fill('#in-h-tel', '090-0000-0000');
    const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
    assert.doesNotMatch(stored, /090-0000-0000/);
    await page.reload();
    assert.equal(await page.isVisible('#check-work'), false);

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  });
}
