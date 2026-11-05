// 層1 確認項目の設定 画面のテスト（ファイルを直接開く形と、サブフォルダの下の配信の両方）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, fileUrl, openPage, chromium } = require('./helpers');

let browser, server;
test.before(async () => { browser = await chromium.launch(); server = await startServer(); });
test.after(async () => { await browser.close(); server.srv.close(); });

for (const mode of ['file', 'http']) {
  test(`設定：見本の読み込み・編集・保存・書き出し・読み込み（${mode}）`, async () => {
    const url = mode === 'file' ? fileUrl : server.url;
    const { context, page, errors, external } = await openPage(browser, url);
    await page.click('[data-tab="settings"]');
    await page.click('#btn-load-samples');
    await page.waitForSelector('#type-list button');
    assert.equal(await page.locator('#type-list button').count(), 3);
    assert.match(await page.textContent('#settings-msg'), /3件/);

    // 2回目は重なりとして取り込まない
    await page.click('#btn-load-samples');
    assert.match(await page.textContent('#settings-msg'), /取り込まなかったもの：3件/);

    // 新しい種類を作る
    await page.click('#btn-add-type');
    await page.fill('#type-name', 'テスト用の申請');
    await page.click('#btn-add-field');
    const names = page.locator('#field-list [data-role="field-name"]');
    await names.nth(1).fill('郵便番号');
    await page.locator('#field-list .item-card').nth(1).locator('select').selectOption('postal');
    await page.click('#btn-add-att');
    await page.locator('#att-list [data-role="att-name"]').first().fill('見取り図');
    assert.equal(await page.isVisible('#settings-dirty'), true);

    // 保存していない状態でタブを移ると確認が出る（テストでは了承）
    await page.click('[data-tab="help"]');
    assert.ok((page._dialogs || []).some((m) => /保存していない変更/.test(m)));
    await page.click('[data-tab="settings"]');
    // 破棄されたので種類は3件のまま
    assert.equal(await page.locator('#type-list button').count(), 3);

    await page.click('#btn-add-type');
    await page.fill('#type-name', 'テスト用の申請');
    await page.click('#btn-save-type');
    assert.match(await page.textContent('#settings-msg'), /保存しました/);
    assert.equal(await page.locator('#type-list button').count(), 4);

    // 開き直しても残る
    await page.reload();
    await page.click('[data-tab="settings"]');
    assert.equal(await page.locator('#type-list button').count(), 4);

    // JSON書き出し
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-json')]);
    const p = await dl.path();
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(json.types.length, 4);

    // CSV書き出し（BOM付き）
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-csv')]);
    const csv = fs.readFileSync(await dl2.path(), 'utf8');
    assert.ok(csv.startsWith('﻿申請の種類'));

    // 置き換えの読み込み：見本1件だけのファイル
    const one = { format: 'shinsei-fubi-check/settings', version: 1, types: [json.types[0]] };
    const tmp = path.join(require('os').tmpdir(), `one-${mode}.json`);
    fs.writeFileSync(tmp, JSON.stringify(one));
    await page.setInputFiles('#file-import-replace', tmp);
    await page.waitForFunction(() => document.querySelectorAll('#type-list button').length === 1);

    // 追加の取り込み：4件のうち1件は重なり
    fs.writeFileSync(tmp, JSON.stringify(json));
    await page.setInputFiles('#file-import-merge', tmp);
    await page.waitForFunction(() => document.querySelectorAll('#type-list button').length === 4);
    assert.match(await page.textContent('#settings-msg'), /追加で取り込みました：3件。.*1件/);

    // 壊れたファイル
    fs.writeFileSync(tmp, '{broken');
    await page.setInputFiles('#file-import-merge', tmp);
    await page.waitForFunction(() => /読み込めませんでした/.test(document.querySelector('#settings-msg').textContent));

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  });
}
