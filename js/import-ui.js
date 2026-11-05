/*
 * 申請書ファイルの取り込み（文字を選べるPDF・スキャン画像）
 * 取り出した文字から、確認項目の設定の欄名を手がかりに値の候補を入れる。
 * 入れた値は候補（未確定）で、職員が申請書と見比べて確定する。
 * 部品（pdf.js、Tesseract）は必要になったときに読み込む。ネットには接続しない。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var h = App.h;
  var V = window.APP_VERSION || '';

  var I = { text: '', lines: [], marked: [], source: '' };

  function $(id) { return document.getElementById(id); }

  function status(text, kind) {
    var m = $('import-msg');
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
  }

  var loaded = {};
  /** 同梱の部品を script 要素で読み込む（ファイルを直接開いたときも動くように）。 */
  App.loadScript = function (src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src + (V ? '?v=' + V : '');
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loaded[src]; reject(new Error('部品（' + src + '）を読み込めませんでした。ファイル一式がそろっているか確かめてください。')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  };

  /* ---------- PDF ---------- */

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** 埋め込んだ文字コード対応表から読む（pdf.js の CMapReaderFactory の代わり）。 */
  function EmbeddedCMapReader() { }
  EmbeddedCMapReader.prototype.fetch = function (p) {
    return App.loadScript('vendor/pdfjs/cmaps.js').then(function () {
      var b64 = window.PDFJS_CMAPS && window.PDFJS_CMAPS[p.name];
      if (!b64) throw new Error('文字コード対応表 ' + p.name + ' がありません。');
      return { cMapData: base64ToBytes(b64), compressionType: 1 };
    });
  };
  function NoStandardFontReader() { }
  NoStandardFontReader.prototype.fetch = function () { return Promise.reject(new Error('標準フォントのデータは同梱していません（文字の取り出しには不要です）。')); };

  function loadPdfJs() {
    return App.loadScript('vendor/pdfjs/pdf.min.js')
      .then(function () { return App.loadScript('vendor/pdfjs/pdf.worker.min.js'); })
      .then(function () {
        // 別スレッドを使わず、この画面の中で処理する（ファイルを直接開いたときの制限を避けるため）
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        return window.pdfjsLib;
      });
  }

  /** PDFの文字を行に分けて取り出す。 */
  App.pdfToLines = function (bytes) {
    return loadPdfJs().then(function (pdfjsLib) {
      return pdfjsLib.getDocument({
        data: bytes,
        CMapReaderFactory: EmbeddedCMapReader,
        StandardFontDataFactory: NoStandardFontReader,
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
        useWorkerFetch: false,
        verbosity: 0
      }).promise;
    }).then(function (doc) {
      var all = [];
      var chain = Promise.resolve();
      for (var p = 1; p <= doc.numPages; p++) {
        (function (pn) {
          chain = chain.then(function () { return doc.getPage(pn); })
            .then(function (page) { return page.getTextContent(); })
            .then(function (tc) { all = all.concat(SFC.itemsToLines(tc.items)); });
        })(p);
      }
      return chain.then(function () { doc.destroy(); return { lines: all, pages: doc.numPages }; });
    });
  };

  /* ---------- 取り込みの本体 ---------- */

  function applyText(lines, source) {
    var t = App.checkUI.currentType();
    I.lines = lines;
    I.text = lines.join('\n');
    I.source = source;
    var pre = $('import-text');
    pre.textContent = I.text;
    $('import-text-box').hidden = I.text === '';
    $('btn-ai').disabled = I.text === '';
    var r = SFC.extractCandidates(t, lines);
    I.marked = r.attachmentsMarked;
    var n = App.checkUI.applyCandidates(r.values, source, false);
    var total = t.fields.length;
    var notFound = t.fields.filter(function (f) { return r.values[f.id] === undefined; }).map(function (f) { return f.name; });
    var text = source + 'から ' + n + '欄に候補を入れました（全' + total + '欄）。黄色の欄を申請書と見比べて確定してください。';
    if (notFound.length) text += ' 候補が見つからなかった欄：' + notFound.join('、') + '。';
    status(text, n ? 'ok' : 'warn');
    return n;
  }

  function importPdfBytes(bytes, name) {
    var t = App.checkUI.currentType();
    if (!t) { status('先に申請の種類を選んでください。', 'warn'); return Promise.resolve(0); }
    status('PDFから文字を取り出しています…（' + (name || '') + '）');
    return App.pdfToLines(bytes).then(function (r) {
      if (r.lines.join('').trim() === '') {
        status('このPDFからは文字を取り出せませんでした。スキャンしたPDFの可能性があります。画像（PNG・JPEG）にして「画像から読み取る」を使うか、手で入力してください。', 'warn');
        applyTextEmpty();
        return 0;
      }
      return applyText(r.lines, 'PDF');
    }).catch(function (e) {
      status('PDFを読めませんでした。' + (e && e.message ? e.message : ''), 'bad');
      return 0;
    });
  }

  function applyTextEmpty() {
    I.text = ''; I.lines = [];
    $('import-text-box').hidden = true;
    $('btn-ai').disabled = true;
  }

  function handleFile(file) {
    if (!file) return;
    var name = file.name || '';
    var type = file.type || '';
    if (/\.pdf$/i.test(name) || type === 'application/pdf') {
      return App.readFileBuffer(file).then(function (b) { return importPdfBytes(b, name); });
    }
    if (/\.(png|jpe?g)$/i.test(name) || /^image\/(png|jpeg)$/.test(type)) {
      if (App.ocrUI) return App.ocrUI.run(file);
      status('画像からの読み取りは、この版では使えません。', 'warn');
      return;
    }
    status('PDF、PNG、JPEGのファイルを選んでください（' + name + '）。', 'warn');
  }

  App.importUI = {
    state: I,
    status: status,
    applyText: applyText,
    importPdfBytes: importPdfBytes,
    markedAttachments: function () { return I.marked; },
    /** 見本のPDFを取り込む（ボタン1つで試すため）。 */
    loadSamplePdf: function (caseId) {
      var c = SFC_SAMPLES.cases.filter(function (x) { return x.id === caseId; })[0];
      if (!c) return Promise.resolve(0);
      return App.loadScript('js/sample-pdfs.js').then(function () {
        if (!App.checkUI.prepareSampleType(c.typeId)) return 0;
        $('import-card').scrollIntoView({ block: 'start' });
        return importPdfBytes(base64ToBytes(window.SFC_SAMPLE_PDFS[c.pdf]), c.pdf + '.pdf');
      }).catch(function (e) { status(e.message, 'bad'); return 0; });
    },
    text: function () { return I.text; },
    reset: function () {
      I.text = ''; I.lines = []; I.marked = []; I.source = '';
      if ($('import-text')) { $('import-text').textContent = ''; $('import-text-box').hidden = true; $('btn-ai').disabled = true; status(''); }
    },
    init: function () {
      var dz = $('dropzone');
      var input = $('import-file');
      input.addEventListener('change', function () {
        if (input.files && input.files[0]) handleFile(input.files[0]);
        input.value = '';
      });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
      });
      dz.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
      });
      // 画面のほかの場所に落としたときに、ブラウザがファイルを開いてしまわないようにする
      window.addEventListener('dragover', function (e) { e.preventDefault(); });
      window.addEventListener('drop', function (e) { e.preventDefault(); });
    }
  };
})();
