/*
 * 確認作業 画面
 * 申請書の値を入力し、添付書類の受領に印を付けると、
 * 未記入・書式の誤り・添付書類の不足を判定して「確認済み」「要確認」「添付不足」に分けて示す。
 * 申請書の内容はブラウザに保存しない（変数の中だけ。画面を閉じると消える）。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var h = App.h;

  var C = {
    type: null,
    values: {},
    received: {},
    pending: {},      // 欄id → 候補の出どころ（「PDF」「画像の読み取り」「AI」）
    checked: false,   // 「確認する」を押したか
    hasInput: false,  // 申請書の値・受領の印が入っているか
    outputDone: false // 印刷・書き出しを済ませたか
  };

  function $(id) { return document.getElementById(id); }
  function settings() { return App.settingsUI.getSettings(); }

  function msg(text, kind) {
    var m = $('check-msg');
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
  }

  function markInput() { C.hasInput = true; C.outputDone = false; }

  function hasUnsaved() { return C.hasInput && !C.outputDone; }

  function confirmDiscard(what) {
    if (!C.hasInput) return true;
    return window.confirm('入力中の申請書の内容と判定の結果は保存されません。' + (what || '消して続けますか。'));
  }

  function clearInput() {
    C.values = {}; C.received = {}; C.pending = {};
    C.checked = false; C.hasInput = false; C.outputDone = false;
    if (App.importUI) App.importUI.reset();
  }

  /* ---------- 申請の種類 ---------- */

  function renderTypeSelect() {
    var sel = $('check-type');
    var cur = C.type ? C.type.id : '';
    sel.textContent = '';
    sel.appendChild(h('option', { value: '' }, ['（申請の種類を選ぶ）']));
    settings().types.forEach(function (t) {
      sel.appendChild(h('option', { value: t.id, selected: t.id === cur }, [t.name]));
    });
    if (C.type && !settings().types.some(function (t) { return t.id === C.type.id; })) {
      C.type = null; clearInput();
    } else if (C.type) {
      // 設定が保存し直されたときは最新の内容を使う
      C.type = settings().types.filter(function (t) { return t.id === C.type.id; })[0];
    }
    $('check-empty-settings').hidden = settings().types.length > 0;
  }

  function setType(id) {
    C.type = settings().types.filter(function (t) { return t.id === id; })[0] || null;
    $('check-type').value = C.type ? C.type.id : '';
    render();
  }

  /* ---------- 入力欄 ---------- */

  function fieldInput(f) {
    var v = C.values[f.id];
    var el;
    var onEdit = function (val) {
      C.values[f.id] = val;
      if (C.pending[f.id]) delete C.pending[f.id];
      markInput();
      update(f.id);
    };
    if (f.format === 'presence') {
      var cb = h('input', { type: 'checkbox', id: 'in-' + f.id, checked: v === true });
      cb.addEventListener('change', function () { onEdit(cb.checked); });
      el = h('label', { class: 'presence-box' }, [cb, '記載あり']);
    } else if (f.format === 'choice') {
      el = h('select', { id: 'in-' + f.id }, [h('option', { value: '' }, ['（未記入）'])].concat(f.options.map(function (o) {
        return h('option', { value: o, selected: v === o }, [o]);
      })));
      if (v && f.options.indexOf(v) < 0) el.appendChild(h('option', { value: v, selected: true }, [v + '（選択肢にない値）']));
      el.addEventListener('change', function () { onEdit(el.value); });
    } else {
      el = h('input', { type: 'text', id: 'in-' + f.id, value: v == null ? '' : String(v), autocomplete: 'off',
        inputmode: ['digits', 'postal', 'phone'].indexOf(f.format) >= 0 ? 'numeric' : null });
      el.addEventListener('input', function () { onEdit(el.value); });
    }
    return el;
  }

  function fieldRow(f) {
    var row = h('div', { class: 'field-row' + (C.pending[f.id] ? ' candidate' : ''), id: 'row-' + f.id, 'data-field': f.name });
    var hint = SFC.describeFormat(f) + (f.hint ? '・' + f.hint : '');
    var labelFor = f.format === 'presence' ? null : 'in-' + f.id;
    row.appendChild(h(labelFor ? 'label' : 'div', { class: 'f-label', for: labelFor }, [
      f.name, h('span', { class: f.required ? 'req' : 'opt', text: f.required ? '必須' : '任意' }),
      h('span', { class: 'f-hint', text: hint })
    ]));
    var box = h('div');
    box.appendChild(fieldInput(f));
    if (C.pending[f.id]) {
      box.appendChild(h('div', { class: 'cand-bar' }, [
        h('span', { class: 'cand-badge', text: C.pending[f.id] + 'からの候補（未確定）' }),
        h('button', { type: 'button', class: 'small', 'data-confirm': f.id, onclick: function () { confirmCandidate(f.id); } }, ['この値で確定']),
        h('button', { type: 'button', class: 'small', onclick: function () { rejectCandidate(f.id); } }, ['候補を消す'])
      ]));
    }
    box.appendChild(h('div', { class: 'inline-result', id: 'ir-' + f.id, 'aria-live': 'polite' }));
    row.appendChild(box);
    return row;
  }

  function attRow(a) {
    var cb = h('input', { type: 'checkbox', id: 'att-' + a.id, checked: C.received[a.id] === true });
    cb.addEventListener('change', function () { C.received[a.id] = cb.checked; markInput(); update(); });
    var cond = a.need === 'conditional' ? SFC.describeCondition(C.type, a) : SFC.NEED_LABEL[a.need];
    var hintMarked = App.importUI && App.importUI.markedAttachments().indexOf(a.id) >= 0;
    return h('div', { class: 'att-row' }, [
      cb,
      h('div', null, [
        h('label', { for: 'att-' + a.id }, [a.name, ' 受領']),
        h('div', { class: 'att-cond', text: cond }),
        hintMarked ? h('div', { class: 'att-cond', text: '申請書の添付書類欄に印があります。現物を確かめて印を付けてください。' }) : null
      ])
    ]);
  }

  function render() {
    var t = C.type;
    $('check-work').hidden = !t;
    $('check-result-card').hidden = !t;
    if (!t) return;
    var fl = $('check-fields'); fl.textContent = '';
    t.fields.forEach(function (f) { fl.appendChild(fieldRow(f)); });
    var al = $('check-atts'); al.textContent = '';
    t.attachments.forEach(function (a) { al.appendChild(attRow(a)); });
    if (t.attachments.length === 0) al.appendChild(h('p', { class: 'empty-note', text: 'この申請の種類には添付書類が登録されていません。' }));
    $('cand-all').hidden = Object.keys(C.pending).length === 0;
    update();
  }

  /* ---------- 候補の確定 ---------- */

  function confirmCandidate(id) {
    delete C.pending[id];
    var row = $('row-' + id);
    if (row) row.parentNode.replaceChild(fieldRow(SFC.findField(C.type, id)), row);
    $('cand-all').hidden = Object.keys(C.pending).length === 0;
    update();
  }
  function rejectCandidate(id) {
    delete C.pending[id];
    delete C.values[id];
    var row = $('row-' + id);
    if (row) row.parentNode.replaceChild(fieldRow(SFC.findField(C.type, id)), row);
    $('cand-all').hidden = Object.keys(C.pending).length === 0;
    update();
  }

  /**
   * 取り込み（PDF・画像・AI）からの候補を入れる。
   * overwrite が false のときは、すでに値のある欄には入れない。
   * 戻り値：入れた欄の数
   */
  function applyCandidates(values, source, overwrite) {
    if (!C.type) return 0;
    var n = 0;
    Object.keys(values).forEach(function (id) {
      var f = SFC.findField(C.type, id);
      if (!f) return;
      var cur = C.values[id];
      var empty = cur == null || cur === '' || cur === false;
      if (!empty && !overwrite && !C.pending[id]) return;
      C.values[id] = values[id];
      C.pending[id] = source;
      n++;
    });
    if (n) markInput();
    render();
    return n;
  }

  /* ---------- 判定と結果 ---------- */

  function currentResult() {
    return SFC.evaluate(C.type, { values: C.values, received: C.received, pending: C.pending });
  }

  function update(onlyFieldId) {
    if (!C.type) return;
    var r = currentResult();
    r.fields.forEach(function (fr) {
      if (onlyFieldId && fr.id !== onlyFieldId && !C.checked) return;
      var el = $('ir-' + fr.id);
      if (!el) return;
      var touched = C.checked || (C.values[fr.id] != null && C.values[fr.id] !== '');
      if (!touched) { el.textContent = ''; el.className = 'inline-result'; return; }
      if (fr.status === 'check') { el.className = 'inline-result check'; el.textContent = '要確認：' + fr.reason; }
      else { el.className = 'inline-result ok'; el.textContent = fr.note ? '確認済み（' + fr.note + '）' : '確認済み'; }
    });
    if (C.checked) renderResult(r);
  }

  function li(name, reason, note) {
    return h('li', null, [
      h('span', { class: 'r-name', text: name }),
      reason ? h('span', { class: 'r-reason', text: reason }) : null,
      note ? h('span', { class: 'r-note', text: note }) : null
    ]);
  }

  function renderResult(r) {
    var box = $('check-result');
    box.textContent = '';
    box.appendChild(h('div', { class: 'summary', 'aria-label': '件数' }, [
      h('div', { class: 's-ok' }, [h('span', { class: 'n', id: 'count-ok', text: String(r.counts.ok) }), '確認済み']),
      h('div', { class: 's-check' }, [h('span', { class: 'n', id: 'count-check', text: String(r.counts.check) }), '要確認']),
      h('div', { class: 's-missing' }, [h('span', { class: 'n', id: 'count-missing', text: String(r.counts.missing) }), '添付不足'])
    ]));
    var groups = [
      { key: 'check', title: '要確認' },
      { key: 'missing', title: '添付不足' },
      { key: 'ok', title: '確認済み' }
    ];
    groups.forEach(function (g) {
      var items = [];
      r.fields.forEach(function (f) {
        if (f.group !== g.key) return;
        items.push(li(f.name, g.key === 'check' ? f.reason : '', g.key === 'ok' ? f.note : ''));
      });
      r.attachments.forEach(function (a) {
        if (a.group !== g.key) return;
        var label = '添付：' + a.name;
        if (g.key === 'ok') items.push(li(label, '', a.status === 'notNeeded' ? '対象外（' + (a.need === 'optional' ? '任意' : '条件に当たらない') + '）' : '受領'));
        else items.push(li(label, a.reason, ''));
      });
      var sec = h('div', { class: 'result-group g-' + g.key, id: 'group-' + g.key }, [
        h('h3', { text: g.title + '（' + items.length + '件）' })
      ]);
      if (items.length) sec.appendChild(h('ul', { class: 'result-list' }, items));
      else sec.appendChild(h('p', { class: 'empty-note', text: 'ありません。' }));
      box.appendChild(sec);
    });
    $('check-outputs').hidden = false;
  }

  function meta() {
    return {
      date: $('check-date').value,
      receiptNo: $('check-receipt').value.trim(),
      section: $('check-section').value.trim(),
      role: $('check-role').value.trim()
    };
  }

  /* ---------- 書き出し ---------- */

  function exportCsv() {
    var r = currentResult();
    var m = meta();
    App.download('確認結果_' + (m.receiptNo || App.stamp()) + '.csv', SFC.toCsv(SFC.resultToRows(C.type, r, m)), 'text/csv');
    C.outputDone = true;
    msg('判定の結果をCSVで書き出しました。', 'ok');
  }
  function exportJson() {
    var r = currentResult();
    var out = { format: 'shinsei-fubi-check/result', version: 1, meta: meta(), typeId: C.type.id, typeName: C.type.name, result: r };
    App.download('確認結果_' + (meta().receiptNo || App.stamp()) + '.json', JSON.stringify(out, null, 2), 'application/json');
    C.outputDone = true;
    msg('判定の結果をJSONで書き出しました。', 'ok');
  }

  /* ---------- 見本 ---------- */

  function renderSampleSelect() {
    var sel = $('sample-case');
    sel.textContent = '';
    sel.appendChild(h('option', { value: '' }, ['（見本を選ぶ）']));
    SFC_SAMPLES.cases.forEach(function (c) { sel.appendChild(h('option', { value: c.id }, [c.label])); });
  }

  function loadSampleCase(id) {
    var c = SFC_SAMPLES.cases.filter(function (x) { return x.id === id; })[0];
    if (!c) { msg('見本を選んでください。', 'warn'); return; }
    if (!confirmDiscard('見本を読み込んでよいですか。')) return;
    var t = App.settingsUI.ensureSampleType(c.typeId);
    if (!t) { msg('見本の申請の種類と同じ名前の設定がすでにあり、内容が違うため読み込めません。', 'bad'); return; }
    renderTypeSelect();
    clearInput();
    C.type = t;
    $('check-type').value = t.id;
    C.values = JSON.parse(JSON.stringify(c.values));
    C.received = JSON.parse(JSON.stringify(c.received));
    markInput();
    C.checked = true;
    render();
    msg('見本「' + c.label + '」を読み込みました（架空のデータです）。', 'ok');
  }

  App.checkUI = {
    state: C,
    hasUnsaved: hasUnsaved,
    applyCandidates: applyCandidates,
    currentType: function () { return C.type; },
    currentValues: function () { return C.values; },
    currentResult: function () { return C.type ? currentResult() : null; },
    meta: meta,
    setOutputDone: function () { C.outputDone = true; },
    rerender: render,
    /** 見本のPDF・画像で試すときに、見本の申請の種類を選んだ状態にする。 */
    prepareSampleType: function (typeId) {
      if (!confirmDiscard('見本を読み込んでよいですか。')) return false;
      var t = App.settingsUI.ensureSampleType(typeId);
      if (!t) { msg('見本の申請の種類と同じ名前の設定がすでにあり、内容が違うため読み込めません。', 'bad'); return false; }
      renderTypeSelect();
      clearInput();
      C.type = t;
      $('check-type').value = t.id;
      render();
      return true;
    },
    msg: msg,
    init: function () {
      $('check-date').value = App.today();
      renderTypeSelect();
      renderSampleSelect();
      $('check-type').addEventListener('change', function (e) {
        var next = e.target.value;
        if (!confirmDiscard('申請の種類を変えると入力が消えます。変えますか。')) { e.target.value = C.type ? C.type.id : ''; return; }
        clearInput();
        setType(next);
        msg('');
      });
      $('btn-check').addEventListener('click', function () {
        if (!C.type) { msg('申請の種類を選んでください。', 'warn'); return; }
        C.checked = true;
        update();
        $('check-result-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      $('btn-clear').addEventListener('click', function () {
        if (!confirmDiscard('入力を消しますか。')) return;
        clearInput(); render(); msg('入力を消しました。');
      });
      $('btn-cand-all').addEventListener('click', function () {
        Object.keys(C.pending).forEach(function (id) { delete C.pending[id]; });
        render();
      });
      $('btn-sample-case').addEventListener('click', function () { loadSampleCase($('sample-case').value); });
      $('btn-print').addEventListener('click', function () { App.printSheet(); });
      $('btn-result-csv').addEventListener('click', exportCsv);
      $('btn-result-json').addEventListener('click', exportJson);
      App.onSettingsChanged = function () { renderTypeSelect(); if (C.type) render(); };
      App.onTabShown = function (name) { if (name === 'check') { renderTypeSelect(); if (C.type) render(); } };
    }
  };
})();
