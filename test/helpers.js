// テスト用の道具：GitHub Pagesと同じ形（サブフォルダの下の静的配信）のサーバーと、ブラウザの起動
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = '/shinsei-fubi-check/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8' };

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (!u.pathname.startsWith(BASE)) { res.writeHead(404); return res.end('not found'); }
      let rel = decodeURIComponent(u.pathname.slice(BASE.length)) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}${BASE}` }));
  });
}

const fileUrl = 'file://' + path.join(ROOT, 'index.html');

/** ページを開き、外部への通信とエラーを記録する。 */
async function openPage(browser, url, opts = {}) {
  const context = await browser.newContext(Object.assign({ acceptDownloads: true, viewport: { width: 1280, height: 900 } }, opts));
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => {
    const u = r.url();
    if (!(u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('http://127.0.0.1') || u.startsWith('http://localhost'))) external.push(u);
  });
  page.on('dialog', (d) => { (page._dialogs = page._dialogs || []).push(d.message()); d.accept(); });
  await page.goto(url);
  return { context, page, errors, external };
}

module.exports = { ROOT, startServer, fileUrl, openPage, chromium };
