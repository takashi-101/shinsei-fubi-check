/*
 * スキャン画像（PNG・JPEG）からの文字の読み取り
 * 同梱の Tesseract（tesseract.js-core）と日本語の学習データを、この画面の中で動かす。
 * 読み取った値は候補として入れるだけで、確定は職員が行う。ネットには接続しない。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var O = { module: null, api: null, busy: false };
  var SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

  function status(t, k) { App.importUI.status(t, k); }
  function nextPaint() { return new Promise(function (r) { setTimeout(r, 30); }); }

  function hasSimd() {
    try { return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_TEST); } catch (e) { return false; }
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function ensureEngine() {
    if (O.api) return Promise.resolve();
    var core = hasSimd() ? 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js' : 'vendor/tesseract/tesseract-core-lstm.wasm.js';
    status('読み取りの部品を読み込んでいます…（初回は数十秒かかることがあります）');
    return App.loadScript(core)
      .then(function () { return App.loadScript('vendor/tesseract/jpn-traineddata.js'); })
      .then(function () {
        var noop = function () { };
        return window.TesseractCore({ print: noop, printErr: noop });
      })
      .then(function (M) {
        O.module = M;
        M.FS.writeFile('jpn.traineddata', b64ToBytes(window.TESSDATA_JPN));
        window.TESSDATA_JPN = null; // 大きいので、読み込んだら手放す
        var api = new M.TessBaseAPI();
        if (api.Init(null, 'jpn', 1) !== 0) throw new Error('日本語の学習データを読み込めませんでした。');
        // 申請書は1段組みの行の並びとして読む（表の罫線で段が分かれるのを避ける）
        api.SetVariable('tessedit_pageseg_mode', '4');
        O.api = api;
      });
  }

  /** 画像を読み取りやすい大きさ・白黒にしてPNGのバイト列にする。 */
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hgt = img.naturalHeight;
        var scale = 1;
        if (w < 2400) scale = Math.min(4, 2400 / w);
        if (w * scale > 3600) scale = 3600 / w;
        var cw = Math.round(w * scale), ch = Math.round(hgt * scale);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        var d = ctx.getImageData(0, 0, cw, ch).data;
        URL.revokeObjectURL(url);
        var gray = new Uint8Array(cw * ch);
        for (var i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        // 表の罫線を消す（罫線が残ると行が図として扱われ、読み取れないことがある）
        SFC.removeRuledLines(gray, cw, ch);
        // 濃淡画像（PGM形式）にして渡す
        var head = 'P5\n' + cw + ' ' + ch + '\n255\n';
        var out = new Uint8Array(head.length + gray.length);
        for (var k = 0; k < head.length; k++) out[k] = head.charCodeAt(k);
        out.set(gray, head.length);
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('画像を開けませんでした。PNGかJPEGか確かめてください。')); };
      img.src = url;
    });
  }

  function recognize(bytes) {
    var M = O.module, api = O.api;
    M.FS.writeFile('/input', bytes);
    api.SetImageFile(1, 0);
    api.Recognize(null);
    var text = api.GetUTF8Text();
    api.Clear();
    try { M.FS.unlink('/input'); } catch (e) { /* 消せなくても続ける */ }
    return text;
  }

  App.ocrUI = {
    state: O,
    /** 見本のスキャン画像を読み取る（ボタン1つで試すため）。 */
    loadSampleImage: function (caseId) {
      var c = SFC_SAMPLES.cases.filter(function (x) { return x.id === caseId; })[0];
      if (!c) return Promise.resolve(0);
      return App.loadScript('js/sample-image.js').then(function () {
        if (!App.checkUI.prepareSampleType(c.typeId)) return 0;
        document.getElementById('import-card').scrollIntoView({ block: 'start' });
        var file = new Blob([b64ToBytes(window.SFC_SAMPLE_IMAGE)], { type: 'image/png' });
        return App.ocrUI.run(file);
      }).catch(function (e) { status(e.message, 'bad'); return 0; });
    },
    run: function (file) {
      if (!App.checkUI.currentType()) { status('先に申請の種類を選んでください。', 'warn'); return Promise.resolve(0); }
      if (O.busy) { status('読み取りの途中です。終わるまでお待ちください。', 'warn'); return Promise.resolve(0); }
      O.busy = true;
      var started = Date.now();
      return ensureEngine()
        .then(function () { status('画像を整えています…'); return nextPaint(); })
        .then(function () { return prepareImage(file); })
        .then(function (bytes) {
          status('文字を読み取っています…（1枚で数秒〜数十秒。その間、画面は動きません）');
          return nextPaint().then(function () { return recognize(bytes); });
        })
        .then(function (text) {
          var tidy = SFC.tidyOcrText(text);
          if (!tidy) { status('文字を読み取れませんでした。画像の向きや明るさを確かめるか、手で入力してください。', 'warn'); return 0; }
          var n = App.importUI.applyText(tidy.split('\n'), '画像の読み取り');
          var m = document.getElementById('import-msg');
          m.textContent += '（読み取り ' + Math.round((Date.now() - started) / 1000) + '秒。読み違いがあるので、必ず申請書と見比べてください）';
          return n;
        })
        .catch(function (e) { status('画像から読み取れませんでした。' + (e && e.message ? e.message : ''), 'bad'); return 0; })
        .then(function (n) { O.busy = false; return n; });
    },
    init: function () {
      var n = document.getElementById('dz-image-note');
      if (n) n.hidden = false;
    }
  };
})();
