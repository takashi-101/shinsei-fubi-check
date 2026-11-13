/*
 * AIで候補を補う（任意）
 * 既定は、このPCで動くLM Studio（OpenAI互換の窓口 http://localhost:1234/v1）。このPCのOllamaも選べる。
 * このPCの外の接続先（有料のサービスを含む）は、使う人が自分で接続先を入れたときだけ使い、送る前に毎回確かめる。
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

  /** 接続先がこのPCの中（localhost・127.0.0.1・[::1]）かどうか。 */
  function isLocalUrl(u) {
    if (window.__treatAsExternal) return false; // テストで、仮のサーバーを外部の接続先として扱うため
    var host = '';
    try { host = new URL(String(u || '').trim()).hostname; } catch (e) { return false; }
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  }
  function apiLabel() { return isLocalUrl(A.cfg.apiUrl) ? 'このPCのAI（OpenAI互換の窓口）' : '外部のAPI'; }

  function fetchJson(url, opts) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('応答の状態が ' + res.status + ' でした。' + String(t).slice(0, 200)); });
      return res.json();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('時間内に応答がありませんでした。');
      if (e instanceof TypeError) throw new Error('接続できませんでした。AIが起動しているか、接続先のURLを確かめてください。LM Studioでは「Enable CORS」（ブラウザからの接続を許す設定）、OllamaではOLLAMA_ORIGINSの設定が要ります。');
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
      if (!c.apiUrl || !c.apiModel) return Promise.reject(new Error('OpenAI互換の窓口の接続先とモデル名が設定されていません（「確認項目の設定」の画面の下）。'));
      var local = isLocalUrl(c.apiUrl);
      if (!local && !A.apiKey) return Promise.reject(new Error('外部のAPIのキーが入力されていません（キーは保存しないため、画面を開くたびに入力が要ります）。'));
      var headers = { 'Content-Type': 'application/json' };
      if (A.apiKey) headers.Authorization = 'Bearer ' + A.apiKey;
      var body = { model: c.apiModel, messages: messages, temperature: 0 };
      // LM Studio は response_format の json_object を受け付けない（json_schema か text だけ）。
      // このPCの中の窓口には付けず、返事の中のJSONを読み取る（parseAiAnswer は前後の文字を許す）。
      if (!local) body.response_format = { type: 'json_object' };
      return fetchJson(trimSlash(c.apiUrl) + '/chat/completions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      }).then(function (j) {
        var m = j && j.choices && j.choices[0] && j.choices[0].message;
        if (!m || typeof m.content !== 'string') throw new Error(apiLabel() + 'の応答の形が想定と違います。');
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
    if (A.cfg.mode === 'api' && !isLocalUrl(A.cfg.apiUrl)) {
      var host = '';
      try { host = new URL(A.cfg.apiUrl).host; } catch (e) { host = A.cfg.apiUrl; }
      if (!window.confirm('申請書から取り出した文字を、外部のAPI（' + host + '）へ送ります。個人情報が含まれます。所属の規程で認められている場合だけ続けてください。送りますか。')) return Promise.resolve();
    }
    var btn = $('btn-ai');
    btn.disabled = true;
    aiMsg((A.cfg.mode === 'ollama' ? 'Ollama' : apiLabel()) + 'に問い合わせています…（数十秒かかることがあります）');
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
    renderApiPlace();
  }

  // OpenAI互換の窓口の接続先が、このPCの中か外かで案内を切り替える
  function renderApiPlace() {
    var local = isLocalUrl(A.cfg.apiUrl);
    $('ai-api-local-note').hidden = !local;
    $('ai-api-external-note').hidden = local;
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

  function testApi() {
    if (!A.cfg.apiUrl) { setMsg('接続先を入れてください（LM Studioの既定は http://localhost:1234/v1）。', 'warn'); return Promise.resolve(); }
    setMsg(apiLabel() + 'に接続しています…');
    var headers = {};
    if (A.apiKey) headers.Authorization = 'Bearer ' + A.apiKey;
    return fetchJson(trimSlash(A.cfg.apiUrl) + '/models', { method: 'GET', headers: headers }).then(function (j) {
      var names = (j.data || []).map(function (m) { return m.id; }).filter(function (n) { return typeof n === 'string' && !/embed/i.test(n); });
      var dl = $('api-models');
      dl.textContent = '';
      names.forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      if (names.length === 0) setMsg('接続できましたが、使えるモデルが見つかりません。LM Studioでモデルを入れてください。', 'warn');
      else setMsg('接続できました。使えるモデル：' + names.join('、') + (A.cfg.apiModel ? '' : '。モデル名の欄で選んでください。'), 'ok');
    }).catch(function (e) { setMsg(e.message, 'bad'); });
  }

  App.aiUI = {
    state: A,
    isLocalUrl: isLocalUrl,
    runFill: runFill,
    init: function () {
      A.cfg = App.store.loadAi();
      if (['off', 'ollama', 'api'].indexOf(A.cfg.mode) < 0) A.cfg.mode = 'api';
      var mode = $('ai-mode');
      mode.value = A.cfg.mode;
      mode.addEventListener('change', function () { A.cfg.mode = mode.value; App.store.saveAi(A.cfg); renderMode(); setMsg(''); });
      bind('ai-ollama-url', 'ollamaUrl');
      bind('ai-ollama-model', 'ollamaModel');
      bind('ai-api-url', 'apiUrl');
      bind('ai-api-model', 'apiModel');
      $('ai-api-key').addEventListener('input', function (e) { A.apiKey = e.target.value.trim(); });
      $('ai-api-url').addEventListener('input', renderApiPlace);
      $('btn-ai-test').addEventListener('click', testOllama);
      $('btn-ai-api-test').addEventListener('click', testApi);
      $('btn-ai').addEventListener('click', runFill);
      renderMode();
    }
  };
})();
