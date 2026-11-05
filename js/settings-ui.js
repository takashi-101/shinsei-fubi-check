/*
 * 確認項目の設定 画面
 * 申請の種類ごとに、欄（必須・書式）と添付書類（必須・条件付き）を登録する。
 * 変更は「この申請の種類を保存」を押すまで保存しない。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var h = App.h;

  var S = {
    settings: null,
    currentId: null,
    draft: null,      // 編集中の申請の種類（保存前）
    dirty: false
  };

  function $(id) { return document.getElementById(id); }

  function msg(text, kind) {
    var m = $('settings-msg');
    m.className = 'msg' + (kind ? ' ' + kind : '');
    m.textContent = text || '';
  }

  function setDirty(v) {
    S.dirty = v;
    $('settings-dirty').hidden = !v;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function findType(id) {
    for (var i = 0; i < S.settings.types.length; i++) if (S.settings.types[i].id === id) return S.settings.types[i];
    return null;
  }

  function persist() {
    var ok = App.store.saveSettings(S.settings);
    if (!ok) msg('このブラウザでは保存できないため、設定は画面を閉じると消えます。JSONで書き出して残してください。', 'warn');
    if (App.onSettingsChanged) App.onSettingsChanged(S.settings);
    return ok;
  }

  /** 保存していない変更があれば確認する。続けてよければ true。 */
  function confirmLeave() {
    if (!S.dirty) return true;
    if (window.confirm('保存していない変更があります。変更を破棄して移りますか。')) {
      setDirty(false);
      S.draft = S.currentId ? clone(findType(S.currentId)) : null;
      return true;
    }
    return false;
  }

  /* ---------- 一覧 ---------- */

  function renderList() {
    var ul = $('type-list');
    ul.textContent = '';
    if (S.settings.types.length === 0) {
      ul.appendChild(h('li', { class: 'empty-note', text: '申請の種類が登録されていません。「申請の種類を追加」か「見本の設定を読み込む」から始めてください。' }));
    }
    S.settings.types.forEach(function (t) {
      ul.appendChild(h('li', null, [
        h('button', {
          type: 'button', 'aria-current': t.id === S.currentId ? 'true' : 'false',
          onclick: function () { if (t.id !== S.currentId && confirmLeave()) select(t.id); }
        }, [t.name || '（名前なし）'])
      ]));
    });
  }

  function select(id) {
    S.currentId = id;
    var t = id ? findType(id) : null;
    S.draft = t ? clone(t) : null;
    setDirty(false);
    renderList();
    renderEditor();
  }

  /* ---------- 編集 ---------- */

  function onChange() { setDirty(true); renderProblems(); }

  function textInput(label, value, onInput, attrs) {
    var input = h('input', Object.assign({ type: 'text', value: value == null ? '' : String(value) }, attrs || {}));
    input.addEventListener('input', function () { onInput(input.value); onChange(); });
    return h('label', { class: 'stack' }, [label, input]);
  }
  function numInput(label, value, onInput) {
    return textInput(label, value, function (v) { onInput(v.trim() === '' ? null : Number(SFC.toHalf(v))); }, { inputmode: 'numeric' });
  }
  function selectInput(label, options, value, onSel) {
    var sel = h('select', null, options.map(function (o) {
      return h('option', { value: o.id, selected: o.id === value }, [o.label]);
    }));
    sel.addEventListener('change', function () { onSel(sel.value); onChange(); });
    return h('label', { class: 'stack' }, [label, sel]);
  }

  function move(list, i, d) {
    var j = i + d;
    if (j < 0 || j >= list.length) return;
    var x = list[i]; list[i] = list[j]; list[j] = x;
    onChange(); renderEditor();
  }

  function fieldCard(f, i) {
    var t = S.draft;
    var detail = h('div', { class: 'item-detail' });
    function renderDetail() {
      detail.textContent = '';
      if (f.format === 'digits') {
        detail.appendChild(numInput('桁数の下限（空欄で指定なし）', f.digitsMin, function (v) { f.digitsMin = v; }));
        detail.appendChild(numInput('桁数の上限（空欄で指定なし）', f.digitsMax, function (v) { f.digitsMax = v; }));
      } else if (f.format === 'amount') {
        detail.appendChild(numInput('金額の下限（円）', f.amountMin, function (v) { f.amountMin = v; }));
        detail.appendChild(numInput('金額の上限（円）', f.amountMax, function (v) { f.amountMax = v; }));
      } else if (f.format === 'choice') {
        var ta = h('textarea', { rows: '3' });
        ta.value = f.options.join('\n');
        ta.addEventListener('input', function () { f.options = ta.value.split(/\n|、|,/).map(function (s) { return s.trim(); }).filter(Boolean); onChange(); });
        detail.appendChild(h('label', { class: 'stack' }, ['選択肢（1行に1つ）', ta]));
      } else if (f.format === 'text') {
        detail.appendChild(numInput('文字数の上限（空欄で指定なし）', f.maxLength, function (v) { f.maxLength = v; }));
      } else if (f.format === 'presence') {
        detail.appendChild(h('p', { class: 'muted', text: '氏名・住所など個人情報の欄に使います。値は入力せず、記載があるかだけを確認します。' }));
      }
      detail.appendChild(textInput('PDF上の別の表記（「、」で区切る）', f.aliases.join('、'), function (v) {
        f.aliases = v.split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      }));
      detail.appendChild(textInput('記入の補足（画面に表示）', f.hint, function (v) { f.hint = v; }));
    }
    renderDetail();

    var req = h('input', { type: 'checkbox', checked: f.required });
    req.addEventListener('change', function () { f.required = req.checked; onChange(); });

    return h('div', { class: 'item-card', 'data-field-index': String(i) }, [
      h('div', { class: 'item-no', text: '欄 ' + (i + 1) }),
      h('div', { class: 'item-grid' }, [
        textInput('欄名', f.name, function (v) { f.name = v; }, { 'data-role': 'field-name' }),
        h('label', { class: 'inline' }, [req, '必須']),
        selectInput('書式', SFC.FORMATS, f.format, function (v) { f.format = v; renderDetail(); })
      ]),
      detail,
      h('div', { class: 'item-tools' }, [
        h('button', { type: 'button', class: 'small', onclick: function () { move(t.fields, i, -1); }, disabled: i === 0, 'aria-label': '欄' + (i + 1) + 'を上へ' }, ['上へ']),
        h('button', { type: 'button', class: 'small', onclick: function () { move(t.fields, i, 1); }, disabled: i === t.fields.length - 1, 'aria-label': '欄' + (i + 1) + 'を下へ' }, ['下へ']),
        h('button', {
          type: 'button', class: 'small danger', onclick: function () {
            var used = t.attachments.some(function (a) { return a.cond && a.cond.fieldId === f.id; });
            if (!window.confirm('欄「' + (f.name || (i + 1)) + '」を削除しますか。' + (used ? '\nこの欄は添付書類の条件に使われています。' : ''))) return;
            t.fields.splice(i, 1); onChange(); renderEditor();
          }
        }, ['削除'])
      ])
    ]);
  }

  function attachmentCard(a, i) {
    var t = S.draft;
    var condBox = h('div', { class: 'item-detail' });
    function renderCond() {
      condBox.textContent = '';
      if (a.need !== 'conditional') return;
      if (!a.cond) a.cond = { fieldId: '', op: 'equals', values: [] };
      var fieldOpts = [{ id: '', label: '（欄を選ぶ）' }].concat(t.fields.map(function (f) { return { id: f.id, label: f.name || '（欄名なし）' }; }));
      condBox.appendChild(selectInput('条件の欄', fieldOpts, a.cond.fieldId, function (v) { a.cond.fieldId = v; renderCond(); }));
      condBox.appendChild(selectInput('条件', [
        { id: 'equals', label: 'が次の値のとき必要' },
        { id: 'notEquals', label: 'が次の値以外のとき必要' },
        { id: 'filled', label: 'に記入があるとき必要' }
      ], a.cond.op, function (v) { a.cond.op = v; renderCond(); }));
      if (a.cond.op !== 'filled') {
        var f = SFC.findField(t, a.cond.fieldId);
        if (f && f.format === 'choice') {
          var box = h('div', { class: 'stack' }, [h('span', { text: '値（当てはまるものに印）' })]);
          f.options.forEach(function (o) {
            var cb = h('input', { type: 'checkbox', checked: a.cond.values.indexOf(o) >= 0 });
            cb.addEventListener('change', function () {
              a.cond.values = a.cond.values.filter(function (x) { return x !== o; });
              if (cb.checked) a.cond.values.push(o);
              onChange();
            });
            box.appendChild(h('label', { class: 'inline' }, [cb, o]));
          });
          condBox.appendChild(box);
        } else {
          condBox.appendChild(textInput('値（複数は「、」で区切る）', a.cond.values.join('、'), function (v) {
            a.cond.values = v.split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
          }));
        }
      }
    }
    renderCond();
    return h('div', { class: 'item-card', 'data-att-index': String(i) }, [
      h('div', { class: 'item-no', text: '添付書類 ' + (i + 1) }),
      h('div', { class: 'item-grid' }, [
        textInput('書類名', a.name, function (v) { a.name = v; }, { 'data-role': 'att-name' }),
        h('span'),
        selectInput('区分', SFC.NEED, a.need, function (v) { a.need = v; renderCond(); })
      ]),
      condBox,
      h('div', { class: 'item-tools' }, [
        h('button', { type: 'button', class: 'small', onclick: function () { move(t.attachments, i, -1); }, disabled: i === 0 }, ['上へ']),
        h('button', { type: 'button', class: 'small', onclick: function () { move(t.attachments, i, 1); }, disabled: i === t.attachments.length - 1 }, ['下へ']),
        h('button', {
          type: 'button', class: 'small danger', onclick: function () {
            if (!window.confirm('添付書類「' + (a.name || (i + 1)) + '」を削除しますか。')) return;
            t.attachments.splice(i, 1); onChange(); renderEditor();
          }
        }, ['削除'])
      ])
    ]);
  }

  function renderProblems() {
    var box = $('type-problems');
    box.textContent = '';
    if (!S.draft) return;
    SFC.checkType(SFC.normalizeType(S.draft)).forEach(function (p) { box.appendChild(h('li', { text: p })); });
  }

  function renderEditor() {
    var ed = $('type-editor');
    var empty = $('type-editor-empty');
    if (!S.draft) { ed.hidden = true; empty.hidden = false; return; }
    ed.hidden = false; empty.hidden = true;
    var t = S.draft;
    var nameIn = $('type-name');
    nameIn.value = t.name;
    $('type-note').value = t.note;
    var fl = $('field-list'); fl.textContent = '';
    t.fields.forEach(function (f, i) { fl.appendChild(fieldCard(f, i)); });
    if (t.fields.length === 0) fl.appendChild(h('p', { class: 'empty-note', text: '欄がありません。「欄を追加」で登録してください。' }));
    var al = $('att-list'); al.textContent = '';
    t.attachments.forEach(function (a, i) { al.appendChild(attachmentCard(a, i)); });
    if (t.attachments.length === 0) al.appendChild(h('p', { class: 'empty-note', text: '添付書類がありません。' }));
    renderProblems();
  }

  function saveCurrent() {
    if (!S.draft) return;
    var t = SFC.normalizeType(S.draft);
    var problems = SFC.checkType(t);
    var dup = S.settings.types.some(function (x) { return x.id !== t.id && x.name === t.name; });
    if (dup) problems.unshift('同じ名前の申請の種類がすでにあります。');
    if (problems.length) { msg('保存できません。' + problems[0], 'bad'); renderProblems(); return false; }
    var idx = -1;
    S.settings.types.forEach(function (x, i) { if (x.id === t.id) idx = i; });
    if (idx >= 0) S.settings.types[idx] = t; else S.settings.types.push(t);
    S.draft = clone(t);
    S.currentId = t.id;
    persist();
    setDirty(false);
    renderList();
    msg('「' + t.name + '」を保存しました。', 'ok');
    return true;
  }

  /* ---------- 書き出し・読み込み ---------- */

  function exportJson() {
    if (S.dirty && !window.confirm('保存していない変更は書き出しに含まれません。続けますか。')) return;
    App.download('確認項目の設定_' + App.stamp() + '.json', JSON.stringify(S.settings, null, 2), 'application/json');
    msg('設定をJSONで書き出しました（' + S.settings.types.length + '件）。', 'ok');
  }
  function exportCsv() {
    App.download('確認項目の設定_' + App.stamp() + '.csv', SFC.toCsv(SFC.settingsToRows(S.settings)), 'text/csv');
    msg('設定をCSVで書き出しました。', 'ok');
  }

  function importFile(file, mode) {
    App.readFileText(file).then(function (text) {
      var incoming;
      try { incoming = SFC.parseSettings(text); } catch (e) { msg('読み込めませんでした。' + e.message, 'bad'); return; }
      applyIncoming(incoming, mode);
    }).catch(function (e) { msg(e.message, 'bad'); });
  }

  function applyIncoming(incoming, mode) {
    if (!confirmLeave()) return;
    if (mode === 'replace') {
      if (S.settings.types.length && !window.confirm('いまの設定（' + S.settings.types.length + '件）を、読み込む設定（' + incoming.types.length + '件）に置き換えます。よろしいですか。')) return;
      S.settings = incoming;
      persist();
      select(S.settings.types[0] ? S.settings.types[0].id : null);
      msg('設定を置き換えました（' + incoming.types.length + '件）。', 'ok');
    } else {
      var r = SFC.mergeSettings(S.settings, incoming);
      S.settings = r.settings;
      persist();
      select(S.currentId || (S.settings.types[0] ? S.settings.types[0].id : null));
      var text = '追加で取り込みました：' + r.added.length + '件。';
      if (r.skipped.length) text += ' 同じ申請の種類がすでにあるため取り込まなかったもの：' + r.skipped.length + '件（' + r.skipped.join('、') + '）。';
      msg(text, r.added.length ? 'ok' : 'warn');
    }
  }

  function loadSamples() {
    var incoming = SFC.parseSettings({ types: SFC_SAMPLES.types });
    applyIncoming(incoming, 'merge');
  }

  /* ---------- 初期化 ---------- */

  App.settingsUI = {
    state: S,
    confirmLeave: confirmLeave,
    isDirty: function () { return S.dirty; },
    getSettings: function () { return S.settings; },
    /** 見本の申請の種類が無ければ足す（確認作業の画面から使う）。 */
    ensureSampleType: function (typeId) {
      if (findType(typeId)) return findType(typeId);
      var src = SFC_SAMPLES.types.filter(function (t) { return t.id === typeId; })[0];
      if (!src) return null;
      var t = SFC.normalizeType(clone(src));
      if (S.settings.types.some(function (x) { return x.name === t.name; })) return null;
      S.settings.types.push(t);
      persist();
      renderList();
      return t;
    },
    init: function () {
      S.settings = App.store.loadSettings();
      $('type-name').addEventListener('input', function (e) { if (S.draft) { S.draft.name = e.target.value; onChange(); } });
      $('type-note').addEventListener('input', function (e) { if (S.draft) { S.draft.note = e.target.value; onChange(); } });
      $('btn-add-type').addEventListener('click', function () {
        if (!confirmLeave()) return;
        S.currentId = null;
        S.draft = SFC.normalizeType({ name: '', fields: [{ name: '申請年月日', required: true, format: 'date' }], attachments: [] });
        setDirty(true);
        renderList(); renderEditor();
        $('type-name').focus();
      });
      $('btn-add-field').addEventListener('click', function () {
        S.draft.fields.push(SFC.normalizeField({ name: '', required: true, format: 'text' }));
        onChange(); renderEditor();
        var names = document.querySelectorAll('#field-list [data-role="field-name"]');
        if (names.length) names[names.length - 1].focus();
      });
      $('btn-add-att').addEventListener('click', function () {
        S.draft.attachments.push(SFC.normalizeAttachment({ name: '', need: 'required' }));
        onChange(); renderEditor();
        var names = document.querySelectorAll('#att-list [data-role="att-name"]');
        if (names.length) names[names.length - 1].focus();
      });
      $('btn-save-type').addEventListener('click', function () { if (saveCurrent()) S.currentId = S.draft.id; });
      $('btn-revert-type').addEventListener('click', function () {
        if (!S.dirty) return;
        if (!window.confirm('保存していない変更を取り消しますか。')) return;
        setDirty(false);
        select(S.currentId && findType(S.currentId) ? S.currentId : null);
        msg('変更を取り消しました。');
      });
      $('btn-copy-type').addEventListener('click', function () {
        if (!S.draft || !confirmLeave()) return;
        var c = clone(S.draft);
        var idMap = {};
        c.id = SFC.newId('t');
        c.name = c.name + '（複製）';
        c.fields.forEach(function (f) { var n = SFC.newId('f'); idMap[f.id] = n; f.id = n; });
        c.attachments.forEach(function (a) { a.id = SFC.newId('a'); if (a.cond) a.cond.fieldId = idMap[a.cond.fieldId] || ''; });
        S.currentId = null; S.draft = c; setDirty(true);
        renderList(); renderEditor();
        msg('複製しました。名前を直して「この申請の種類を保存」を押してください。');
      });
      $('btn-delete-type').addEventListener('click', function () {
        if (!S.draft) return;
        if (!window.confirm('申請の種類「' + (S.draft.name || '（名前なし）') + '」を削除しますか。元に戻せません。')) return;
        S.settings.types = S.settings.types.filter(function (x) { return x.id !== S.draft.id; });
        persist();
        setDirty(false);
        select(S.settings.types[0] ? S.settings.types[0].id : null);
        msg('削除しました。');
      });
      $('btn-export-json').addEventListener('click', exportJson);
      $('btn-export-csv').addEventListener('click', exportCsv);
      $('btn-load-samples').addEventListener('click', loadSamples);
      [['file-import-replace', 'replace'], ['file-import-merge', 'merge']].forEach(function (p) {
        var input = $(p[0]);
        input.addEventListener('change', function () {
          if (input.files && input.files[0]) importFile(input.files[0], p[1]);
          input.value = '';
        });
      });
      if (!App.store.storageOk()) msg('このブラウザでは保存できないため、設定は画面を閉じると消えます。', 'warn');
      select(S.settings.types[0] ? S.settings.types[0].id : null);
    }
  };
})();
