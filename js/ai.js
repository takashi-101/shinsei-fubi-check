/*
 * AIで候補を補う（任意）
 * 既定は、このPCで動くOllama（http://localhost:11434）。
 * 外部のAPI（OpenAI互換）は、使う人が選んだときだけ使う。
 * AIの出力は候補として入れるだけで、確定は職員が行う。AIにつながらなくても、ほかの機能は動く。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var h = App.h;
  var A = { cfg: null, apiKey: '' };
  var TIMEOUT_MS = 180000;

  function $(id) { return document.getElementById(id); }
  function aiMsg(text, kind) {
    var m = $('ai-msg');
    if (!m) return;
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
  }
  function setMsg(text, kind) {
    var m = $('ai-settings-msg');
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
  }

  function trimSlash(u) { return String(u || '').trim().replace(/\/+$/, ''); }

  function fetchJson(url, opts) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('応答の状態が ' + res.status + ' でした。' + String(t).slice(0, 200)); });
      return res.json();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('時間内に応答がありませんでした。');
      if (e instanceof TypeError) throw new Error('接続できませんでした。AIが起動しているか、接続先のURLと、OllamaのOLLAMA_ORIGINSの設定を確かめてください。');
      throw e;
    }).then(function (j) { if (timer) clearTimeout(timer); return j; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  /** AIに問い合わせて、返事の文字列を返す。 */
  function ask(messages) {
    var c = A.cfg;
    if (c.mode === 'ollama') {
      if (!c.ollamaModel) return Promise.reject(new Error('Ollamaのモデル名が設定されていません（「確認項目の設定」の画面の下）。'));
      return fetchJson(trimSlash(c.ollamaUrl) + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: c.ollamaModel, messages: messages, stream: false, format: 'json', options: { temperature: 0 } })
      }).then(function (j) {
        if (!j || !j.message || typeof j.message.content !== 'string') throw new Error('Ollamaの応答の形が想定と違います。');
        return j.message.content;
      });
    }
    if (c.mode === 'api') {
      if (!c.apiUrl || !c.apiModel) return Promise.reject(new Error('外部のAPIの接続先とモデル名が設定されていません。'));
      if (!A.apiKey) return Promise.reject(new Error('外部のAPIのキーが入力されていません（キーは保存しないため、画面を開くたびに入力が要ります）。'));
      return fetchJson(trimSlash(c.apiUrl) + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + A.apiKey },
        body: JSON.stringify({ model: c.apiModel, messages: messages, temperature: 0, response_format: { type: 'json_object' } })
      }).then(function (j) {
        var m = j && j.choices && j.choices[0] && j.choices[0].message;
        if (!m || typeof m.content !== 'string') throw new Error('外部のAPIの応答の形が想定と違います。');
        return m.content;
      });
    }
    return Promise.reject(new Error('AIは「使わない」に設定されています。「確認項目の設定」の画面の下で選べます。'));
  }

  function runFill() {
    var t = App.checkUI.currentType();
    var text = App.importUI.text();
    if (!t || !text) { aiMsg('先にPDFか画像から文字を取り出してください。', 'warn'); return Promise.resolve(); }
    var values = App.checkUI.currentValues();
    var missing = t.fields.filter(function (f) {
      var v = values[f.id];
      return v == null || v === '' || v === false;
    }).map(function (f) { return f.id; });
    if (missing.length === 0) { aiMsg('すべての欄に値が入っています。AIで補う欄はありません。'); return Promise.resolve(); }
    if (A.cfg.mode === 'api') {
      var host = '';
      try { host = new URL(A.cfg.apiUrl).host; } catch (e) { host = A.cfg.apiUrl; }
      if (!window.confirm('申請書から取り出した文字を、外部のAPI（' + host + '）へ送ります。個人情報が含まれます。所属の規程で認められている場合だけ続けてください。送りますか。')) return Promise.resolve();
    }
    var btn = $('btn-ai');
    btn.disabled = true;
    aiMsg((A.cfg.mode === 'ollama' ? 'Ollama' : '外部のAPI') + 'に問い合わせています…（数十秒かかることがあります）');
    return ask(SFC.buildAiMessages(t, text, missing)).then(function (content) {
      var cand = SFC.parseAiAnswer(t, content, missing);
      var n = App.checkUI.applyCandidates(cand, 'AI', false);
      aiMsg(n ? 'AIの候補を ' + n + '欄に入れました。申請書と見比べて確定してください。' : 'AIからは、空いている欄の候補が出ませんでした。', n ? 'ok' : 'warn');
    }).catch(function (e) {
      aiMsg('AIの候補を出せませんでした。' + e.message + '（手で入力すれば、確認はそのまま続けられます）', 'bad');
    }).then(function () { btn.disabled = !App.importUI.text(); });
  }

  function renderMode() {
    var m = A.cfg.mode;
    $('ai-ollama-box').hidden = m !== 'ollama';
    $('ai-api-box').hidden = m !== 'api';
  }

  function bind(id, key) {
    var el = $(id);
    el.value = A.cfg[key];
    el.addEventListener('input', function () { A.cfg[key] = el.value.trim(); App.store.saveAi(A.cfg); });
  }

  function testOllama() {
    setMsg('Ollamaに接続しています…');
    return fetchJson(trimSlash(A.cfg.ollamaUrl) + '/api/tags', { method: 'GET' }).then(function (j) {
      var names = (j.models || []).map(function (m) { return m.name; });
      var dl = $('ollama-models');
      dl.textContent = '';
      names.forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      if (names.length === 0) setMsg('接続できましたが、モデルが入っていません。Ollamaでモデルを入れてください。', 'warn');
      else setMsg('接続できました。入っているモデル：' + names.join('、') + (A.cfg.ollamaModel ? '' : '。モデル名の欄で選んでください。'), 'ok');
    }).catch(function (e) { setMsg(e.message, 'bad'); });
  }

  App.aiUI = {
    state: A,
    runFill: runFill,
    init: function () {
      A.cfg = App.store.loadAi();
      if (['off', 'ollama', 'api'].indexOf(A.cfg.mode) < 0) A.cfg.mode = 'ollama';
      var mode = $('ai-mode');
      mode.value = A.cfg.mode;
      mode.addEventListener('change', function () { A.cfg.mode = mode.value; App.store.saveAi(A.cfg); renderMode(); setMsg(''); });
      bind('ai-ollama-url', 'ollamaUrl');
      bind('ai-ollama-model', 'ollamaModel');
      bind('ai-api-url', 'apiUrl');
      bind('ai-api-model', 'apiModel');
      $('ai-api-key').addEventListener('input', function (e) { A.apiKey = e.target.value.trim(); });
      $('btn-ai-test').addEventListener('click', testOllama);
      $('btn-ai').addEventListener('click', runFill);
      renderMode();
    }
  };
})();
