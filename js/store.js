/*
 * 保存と書き出し。
 * ブラウザに保存するのは「確認項目の設定」と、AIの接続先（URLとモデル名）だけ。
 * 申請書の中身はどこにも保存しない（画面を閉じると消える）。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var KEY = 'shinsei-fubi-check.settings.v1';
  var AI_KEY = 'shinsei-fubi-check.ai.v1';
  var memory = {};
  var storageOk = true;

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { storageOk = false; return memory[key] || null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { storageOk = false; memory[key] = value; return false; }
  }

  App.store = {
    storageOk: function () { return storageOk; },
    loadSettings: function () {
      var raw = read(KEY);
      if (!raw) return SFC.emptySettings();
      try { return SFC.parseSettings(raw); } catch (e) { return SFC.emptySettings(); }
    },
    saveSettings: function (settings) {
      return write(KEY, JSON.stringify(settings));
    },
    loadAi: function () {
      var d = { mode: 'off', ollamaUrl: 'http://localhost:11434', ollamaModel: '', apiUrl: '', apiModel: '' };
      var raw = read(AI_KEY);
      if (raw) { try { var o = JSON.parse(raw); Object.keys(d).forEach(function (k) { if (typeof o[k] === 'string') d[k] = o[k]; }); } catch (e) { /* 読めないときは既定 */ } }
      return d;
    },
    saveAi: function (ai) {
      // APIキーは保存しない
      var o = { mode: ai.mode, ollamaUrl: ai.ollamaUrl, ollamaModel: ai.ollamaModel, apiUrl: ai.apiUrl, apiModel: ai.apiModel };
      return write(AI_KEY, JSON.stringify(o));
    }
  };

  /** ファイルとして保存させる（ブラウザのダウンロード）。 */
  App.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };

  App.readFileText = function (file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('ファイルを読めませんでした。')); };
      r.readAsText(file, 'utf-8');
    });
  };
  App.readFileBuffer = function (file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('ファイルを読めませんでした。')); };
      r.readAsArrayBuffer(file);
    });
  };

  App.today = function () {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  App.stamp = function () { return App.today().replace(/-/g, ''); };

  App.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** 要素を作る小さな道具。 */
  App.h = function (tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'selected') el.selected = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  };
})();
