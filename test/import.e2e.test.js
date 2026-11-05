// 層3 文字を選べるPDFからの取り込み と AIで候補を補う（仮の応答）のテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT, startServer, fileUrl, openPage, chromium } = require('./helpers');
const { startMockAi } = require('./mock-ai');
const SAMPLES = require('../js/samples.js');

let browser, server;
test.before(async () => { browser = await chromium.launch(); server = await startServer(); });
test.after(async () => { await browser.close(); server.srv.close(); });

async function openImport(page) {
  await page.locator('#import-card > details > summary').click();
}

for (const mode of ['file', 'http']) {
  test(`PDF取り込み：見本PDF6件の候補が見本の値と合う（${mode}）`, async () => {
    const { context, page, errors, external } = await openPage(browser, mode === 'file' ? fileUrl : server.url);
    for (const c of SAMPLES.cases) {
      // 見本のPDFの select は申請の種類を選ぶ前は隠れているので、種類を選んでから
      if (!(await page.isVisible('#import-card'))) {
        await page.click('[data-tab="settings"]');
        await page.click('#btn-load-samples');
        await page.click('[data-tab="check"]');
        await page.selectOption('#check-type', c.typeId);
        await openImport(page);
      }
      await page.selectOption('#sample-pdf', c.id);
      await page.click('#btn-sample-pdf');
      await page.waitForFunction(() => /候補を入れました|取り出せません|読めません/.test(document.querySelector('#import-msg').textContent), null, { timeout: 30000 });
      const msg = await page.textContent('#import-msg');
      assert.match(msg, /PDFから \d+欄に候補を入れました/, msg);
      const t = SAMPLES.types.find((x) => x.id === c.typeId);
      for (const f of t.fields) {
        const want = c.values[f.id];
        const sel = '#in-' + f.id;
        let got;
        if (f.format === 'presence') got = await page.isChecked(sel);
        else got = await page.inputValue(sel);
        let exp = want;
        if (f.format === 'presence') exp = want === true;
        else if (exp == null) exp = '';
        // PDFからの候補は全角が半角になる
        if (typeof exp === 'string') exp = exp.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
        assert.equal(got, exp, `${c.id} ${f.name}`);
      }
      // 未確定の候補は要確認
      await page.click('#btn-check');
      if (c.id.endsWith('-ok')) {
        assert.ok(Number(await page.textContent('#count-check')) > 0);
        await page.click('#btn-cand-all');
        // 添付書類はPDFの印ではなく、現物を見て職員が印を付ける
        for (const id of Object.keys(c.received)) await page.check('#att-' + id);
        assert.equal(await page.textContent('#count-check'), '0', c.id);
        assert.equal(await page.textContent('#count-missing'), '0', c.id);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await context.close();
  });
}

test('PDF取り込み：フォントを埋め込まないPDF（文字コード対応表が要る）と、ファイルを落とす操作', async () => {
  const { context, page, errors } = await openPage(browser, fileUrl);
  await page.locator('#sample-details > summary').click();
  await page.selectOption('#sample-case', 'shomei-ok');
  await page.click('#btn-sample-case');
  await page.click('#btn-clear');
  await page.setInputFiles('#import-file', path.join(ROOT, 'test/fixtures/cid-font.pdf'));
  await page.waitForFunction(() => /候補を入れました/.test(document.querySelector('#import-msg').textContent), null, { timeout: 30000 });
  assert.equal(await page.inputValue('#in-c-tel'), '03-9876-5432');
  assert.equal(await page.inputValue('#in-c-raichou'), '代理人');
  // 個別に確定・候補を消す
  await page.click('[data-confirm="c-tel"]');
  assert.equal(await page.locator('#row-c-tel.candidate').count(), 0);
  // 添付書類欄の印の案内
  assert.match(await page.textContent('#check-atts'), /印があります/);
  // 文字のないファイル
  await page.setInputFiles('#import-file', { name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  assert.match(await page.textContent('#import-msg'), /PDF、PNG、JPEG/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('AI：Ollama（仮の応答）で空いた欄に候補が入る・つながらないときも続けられる', async () => {
  const ai = await startMockAi((req) => ({ '事業の完了予定日': '令和9年2月26日', '代表者の氏名': '記載あり', '交付申請額': '999円' }));
  const { context, page, errors } = await openPage(browser, fileUrl);
  await page.click('[data-tab="settings"]');
  assert.equal(await page.inputValue('#ai-mode'), 'ollama');
  assert.equal(await page.inputValue('#ai-ollama-url'), 'http://localhost:11434');
  await page.fill('#ai-ollama-url', ai.url);
  await page.click('#btn-ai-test');
  await page.waitForFunction(() => /mock-model/.test(document.querySelector('#ai-settings-msg').textContent));
  await page.fill('#ai-ollama-model', 'mock-model:latest');
  await page.click('[data-tab="check"]');
  await page.locator('#sample-details > summary').click();
  await page.selectOption('#sample-case', 'hojokin-ng');
  await page.click('#btn-sample-case');
  await page.click('#btn-clear');
  await openImport(page);
  await page.selectOption('#sample-pdf', 'hojokin-ng');
  await page.click('#btn-sample-pdf');
  await page.waitForFunction(() => /候補を入れました/.test(document.querySelector('#import-msg').textContent), null, { timeout: 30000 });
  const before = await page.inputValue('#in-h-shinsei');
  await page.click('#btn-ai');
  await page.waitForFunction(() => /AIの候補を|出ませんでした|出せませんでした/.test(document.querySelector('#ai-msg').textContent));
  assert.match(await page.textContent('#ai-msg'), /2欄/);
  assert.equal(await page.inputValue('#in-h-kanryo'), '令和9年2月26日');
  assert.equal(await page.isChecked('#in-h-daihyo'), true);
  // すでに値のある欄は上書きしない
  assert.equal(await page.inputValue('#in-h-shinsei'), before);
  assert.match(await page.textContent('#row-h-kanryo'), /AIからの候補（未確定）/);
  const req = ai.log.find((l) => l.url === '/api/chat');
  assert.equal(req.body.model, 'mock-model:latest');
  assert.equal(req.body.stream, false);
  assert.match(req.body.messages[1].content, /事業の完了予定日/);
  // 設定はAPIキー以外を保存
  const stored = await page.evaluate(() => localStorage.getItem('shinsei-fubi-check.ai.v1'));
  assert.match(stored, /mock-model/);

  // つながらないとき
  ai.srv.close();
  await page.click('#btn-clear');
  await page.click('#btn-sample-pdf');
  await page.waitForFunction(() => /候補を入れました/.test(document.querySelector('#import-msg').textContent), null, { timeout: 30000 });
  await page.click('#btn-ai');
  await page.waitForFunction(() => /出せませんでした/.test(document.querySelector('#ai-msg').textContent), null, { timeout: 30000 });
  assert.match(await page.textContent('#ai-msg'), /手で入力すれば/);
  await page.click('#btn-check');
  assert.ok(Number(await page.textContent('#count-check')) > 0);
  assert.deepEqual(errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(e)), []);
  await context.close();
});

test('AI：外部のAPI（OpenAI互換・仮の応答）は確認のうえ送り、キーは保存しない', async () => {
  const ai = await startMockAi(() => ({ '事業の完了予定日': '令和9年3月1日' }));
  const { context, page, errors } = await openPage(browser, fileUrl);
  await page.click('[data-tab="settings"]');
  await page.selectOption('#ai-mode', 'api');
  await page.fill('#ai-api-url', ai.url + '/v1');
  await page.fill('#ai-api-model', 'mock-model');
  await page.fill('#ai-api-key', 'test-key-123');
  await page.click('[data-tab="check"]');
  await page.locator('#sample-details > summary').click();
  await page.selectOption('#sample-case', 'hojokin-ng');
  await page.click('#btn-sample-case');
  await page.click('#btn-clear');
  await openImport(page);
  await page.selectOption('#sample-pdf', 'hojokin-ng');
  await page.click('#btn-sample-pdf');
  await page.waitForFunction(() => /候補を入れました/.test(document.querySelector('#import-msg').textContent), null, { timeout: 30000 });
  page._dialogs = [];
  await page.click('#btn-ai');
  await page.waitForFunction(() => /AIの候補を/.test(document.querySelector('#ai-msg').textContent));
  assert.ok(page._dialogs.some((m) => /外部のAPI/.test(m)));
  assert.equal(await page.inputValue('#in-h-kanryo'), '令和9年3月1日');
  const req = ai.log.find((l) => l.url === '/v1/chat/completions');
  assert.equal(req.auth, 'Bearer test-key-123');
  const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
  assert.doesNotMatch(stored, /test-key-123/);
  ai.srv.close();
  assert.deepEqual(errors, []);
  await context.close();
});
