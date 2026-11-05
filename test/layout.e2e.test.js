// 横幅375px・1280px、ライト・ダークで横にはみ出さないこと
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fileUrl, openPage, chromium } = require('./helpers');

const SHOT_DIR = process.env.SHOT_DIR || '';
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

for (const width of [375, 1280]) {
  for (const scheme of ['light', 'dark']) {
    test(`画面の崩れ：幅${width}px・${scheme}`, async () => {
      const { context, page, errors } = await openPage(browser, fileUrl, { viewport: { width, height: 900 }, colorScheme: scheme });
      // 見本を入れた状態で確かめる
      await page.click('[data-tab="settings"]');
      await page.click('#btn-load-samples');
      const tabs = await page.$$eval('.tabs [role="tab"]', (els) => els.map((e) => e.dataset.tab));
      for (const tab of tabs) {
        await page.click(`[data-tab="${tab}"]`);
        if (tab === 'check' && await page.$('#sample-buttons')) {
          await page.locator('#sample-details > summary').click();
          await page.click('[data-sample-case="hojokin-ng"]');
          await page.click('#btn-check');
        }
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 0, `${tab} が横に ${over}px はみ出しています`);
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        if (scheme === 'dark') assert.notEqual(bg, 'rgb(245, 246, 248)');
        if (SHOT_DIR) await page.screenshot({ path: path.join(SHOT_DIR, `${tab}-${width}-${scheme}.png`), fullPage: true });
      }
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
}
