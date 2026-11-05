/*
 * 申請書類 記載漏れ・添付漏れ確認ツール  判定の中心部分
 * 画面に依存しない処理（設定の整形、書式の判定、添付書類の要否、取り込みの候補づくり、CSV）をまとめる。
 * ブラウザでは window.SFC、Node.js（テスト）では module.exports から使う。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SFC = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SETTINGS_FORMAT = 'shinsei-fubi-check/settings';
  var SETTINGS_VERSION = 1;

  var FORMATS = [
    { id: 'text', label: '文字（書式の指定なし）' },
    { id: 'date', label: '日付' },
    { id: 'digits', label: '数字のみ（桁数の指定ができる）' },
    { id: 'postal', label: '郵便番号' },
    { id: 'phone', label: '電話番号' },
    { id: 'amount', label: '金額' },
    { id: 'choice', label: '選択肢のどれか' },
    { id: 'presence', label: '記載の有無のみ（値は入力しない）' }
  ];
  var FORMAT_LABEL = {};
  FORMATS.forEach(function (f) { FORMAT_LABEL[f.id] = f.label; });

  var NEED = [
    { id: 'required', label: '必須' },
    { id: 'conditional', label: '条件付き' },
    { id: 'optional', label: '任意（確認のみ）' }
  ];
  var NEED_LABEL = {};
  NEED.forEach(function (n) { NEED_LABEL[n.id] = n.label; });

  /* ---------- 共通 ---------- */

  function newId(prefix) {
    var r = '';
    for (var i = 0; i < 8; i++) r += Math.floor(Math.random() * 36).toString(36);
    return prefix + '-' + Date.now().toString(36) + r;
  }

  function str(v) { return v == null ? '' : String(v); }

  /** 全角英数字・記号を半角にし、前後の空白を除く。 */
  function toHalf(s) {
    return str(s)
      .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/　/g, ' ')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      // 長音記号は、数字にはさまれたとき（電話番号・郵便番号の区切り）だけハイフンとみなす
      .replace(/(\d)[\u30FC\uFF70](?=\d)/g, '$1-');
  }
  function hasFullWidthAlnum(s) { return /[０-９Ａ-Ｚａ-ｚ]/.test(str(s)); }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    var n = Number(toHalf(v));
    return isFinite(n) ? n : null;
  }

  function splitList(v) {
    if (Array.isArray(v)) return v.map(function (x) { return str(x).trim(); }).filter(Boolean);
    return str(v).split(/[\n,、，]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  /* ---------- 設定 ---------- */

  function normalizeField(f) {
    f = f || {};
    var fmt = FORMAT_LABEL[f.format] ? f.format : 'text';
    return {
      id: str(f.id) || newId('f'),
      name: str(f.name).trim(),
      required: f.required === true || f.required === 'true' || f.required === 1,
      format: fmt,
      aliases: splitList(f.aliases),
      digitsMin: numOrNull(f.digitsMin),
      digitsMax: numOrNull(f.digitsMax),
      amountMin: numOrNull(f.amountMin),
      amountMax: numOrNull(f.amountMax),
      maxLength: numOrNull(f.maxLength),
      options: splitList(f.options),
      hint: str(f.hint).trim()
    };
  }

  function normalizeAttachment(a) {
    a = a || {};
    var need = NEED_LABEL[a.need] ? a.need : 'required';
    var c = a.cond || {};
    return {
      id: str(a.id) || newId('a'),
      name: str(a.name).trim(),
      need: need,
      cond: need === 'conditional' ? {
        fieldId: str(c.fieldId),
        op: c.op === 'filled' || c.op === 'notEquals' ? c.op : 'equals',
        values: splitList(c.values)
      } : null,
      note: str(a.note).trim()
    };
  }

  function normalizeType(t) {
    t = t || {};
    return {
      id: str(t.id) || newId('t'),
      name: str(t.name).trim(),
      note: str(t.note).trim(),
      fields: (Array.isArray(t.fields) ? t.fields : []).map(normalizeField),
      attachments: (Array.isArray(t.attachments) ? t.attachments : []).map(normalizeAttachment)
    };
  }

  function emptySettings() { return { format: SETTINGS_FORMAT, version: SETTINGS_VERSION, types: [] }; }

  /** 読み込んだJSONを設定として整える。形が違うときは例外を投げる。 */
  function parseSettings(obj) {
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj.replace(/^﻿/, '')); } catch (e) { throw new Error('JSONとして読めません。'); }
    }
    if (!obj || typeof obj !== 'object') throw new Error('設定のファイルではありません。');
    var types;
    if (Array.isArray(obj.types)) types = obj.types;
    else if (Array.isArray(obj)) types = obj;
    else if (Array.isArray(obj.fields)) types = [obj];
    else throw new Error('申請の種類（types）が見つかりません。このツールで書き出した設定のファイルか確かめてください。');
    if (obj.format && obj.format !== SETTINGS_FORMAT) throw new Error('このツールの設定のファイルではありません（format: ' + obj.format + '）。');
    var out = emptySettings();
    out.types = types.map(normalizeType);
    return out;
  }

  /** 設定の中身の点検。保存前に画面へ出す。 */
  function checkType(t) {
    var problems = [];
    if (!t.name) problems.push('申請の種類の名前が空です。');
    var names = {};
    t.fields.forEach(function (f, i) {
      var label = f.name || ('欄' + (i + 1));
      if (!f.name) problems.push((i + 1) + '番目の欄の欄名が空です。');
      else if (names[f.name]) problems.push('欄名「' + f.name + '」が重なっています。');
      names[f.name] = true;
      if (f.format === 'choice' && f.options.length === 0) problems.push('「' + label + '」は選択肢の書式ですが、選択肢が登録されていません。');
      if (f.format === 'digits' && f.digitsMin != null && f.digitsMax != null && f.digitsMin > f.digitsMax) problems.push('「' + label + '」の桁数の下限が上限より大きくなっています。');
      if (f.format === 'amount' && f.amountMin != null && f.amountMax != null && f.amountMin > f.amountMax) problems.push('「' + label + '」の金額の下限が上限より大きくなっています。');
    });
    t.attachments.forEach(function (a, i) {
      if (!a.name) problems.push((i + 1) + '番目の添付書類の名前が空です。');
      if (a.need === 'conditional') {
        var f = findField(t, a.cond.fieldId);
        if (!f) problems.push('添付書類「' + (a.name || (i + 1)) + '」の条件の欄が選ばれていません。');
        else if (a.cond.op !== 'filled' && a.cond.values.length === 0) problems.push('添付書類「' + (a.name || (i + 1)) + '」の条件の値が空です。');
      }
    });
    return problems;
  }

  function findField(t, id) {
    for (var i = 0; i < t.fields.length; i++) if (t.fields[i].id === id) return t.fields[i];
    return null;
  }

  /**
   * 追加の取り込み。id または名前が同じ申請の種類は取り込まない。
   * 戻り値：{ settings, added: [名前], skipped: [名前] }
   */
  function mergeSettings(current, incoming) {
    var out = emptySettings();
    out.types = current.types.slice();
    var ids = {}, names = {};
    current.types.forEach(function (t) { ids[t.id] = true; names[t.name] = true; });
    var added = [], skipped = [];
    incoming.types.forEach(function (t) {
      if (ids[t.id] || names[t.name]) { skipped.push(t.name); return; }
      ids[t.id] = true; names[t.name] = true;
      out.types.push(t); added.push(t.name);
    });
    return { settings: out, added: added, skipped: skipped };
  }

  function describeCondition(t, a) {
    if (a.need !== 'conditional' || !a.cond) return '';
    var f = findField(t, a.cond.fieldId);
    var fname = f ? '「' + f.name + '」' : '（欄が未設定）';
    if (a.cond.op === 'filled') return fname + 'に記入があるとき必要';
    if (a.cond.op === 'notEquals') return fname + 'が「' + a.cond.values.join('」「') + '」以外のとき必要';
    return fname + 'が「' + a.cond.values.join('」または「') + '」のとき必要';
  }

  function describeFormat(f) {
    var s = FORMAT_LABEL[f.format] || '';
    if (f.format === 'digits') {
      if (f.digitsMin != null && f.digitsMax != null && f.digitsMin === f.digitsMax) s = '数字のみ・' + f.digitsMin + '桁';
      else if (f.digitsMin != null || f.digitsMax != null) s = '数字のみ・' + (f.digitsMin != null ? f.digitsMin : '') + '〜' + (f.digitsMax != null ? f.digitsMax : '') + '桁';
      else s = '数字のみ';
    } else if (f.format === 'amount') {
      s = '金額';
      if (f.amountMin != null || f.amountMax != null) s += '（' + (f.amountMin != null ? fmtYen(f.amountMin) : '') + '〜' + (f.amountMax != null ? fmtYen(f.amountMax) : '') + '）';
    } else if (f.format === 'choice') {
      s = '選択肢：' + f.options.join('／');
    } else if (f.format === 'text' && f.maxLength != null) {
      s = '文字（' + f.maxLength + '字以内）';
    } else if (f.format === 'presence') {
      s = '記載の有無';
    }
    return s;
  }

  function fmtYen(n) { return Number(n).toLocaleString('ja-JP') + '円'; }

  /* ---------- 書式の判定 ---------- */

  var ERAS = [
    { re: /^(令和|R)/i, name: '令和', base: 2018, start: [2019, 5, 1], end: null },
    { re: /^(平成|H)/i, name: '平成', base: 1988, start: [1989, 1, 8], end: [2019, 4, 30] },
    { re: /^(昭和|S)/i, name: '昭和', base: 1925, start: [1926, 12, 25], end: [1989, 1, 7] }
  ];

  function validYmd(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function cmp(a, b) { return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]); }

  /** 日付を読み取る。{ ok, ymd:[y,m,d], reason } */
  function parseDate(raw) {
    var s = toHalf(raw).replace(/\s+/g, '');
    var m = s.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})日?$/);
    if (m) {
      var y = +m[1], mo = +m[2], d = +m[3];
      if (!validYmd(y, mo, d)) return { ok: false, reason: '存在しない日付です（' + y + '年' + mo + '月' + d + '日）。' };
      return { ok: true, ymd: [y, mo, d] };
    }
    if (/^\d{8}$/.test(s)) {
      var y2 = +s.slice(0, 4), mo2 = +s.slice(4, 6), d2 = +s.slice(6, 8);
      if (!validYmd(y2, mo2, d2)) return { ok: false, reason: '存在しない日付です。' };
      return { ok: true, ymd: [y2, mo2, d2] };
    }
    for (var i = 0; i < ERAS.length; i++) {
      var era = ERAS[i];
      var em = s.match(era.re);
      if (!em) continue;
      var rest = s.slice(em[0].length);
      var mm = rest.match(/^(元|\d{1,2})[年.\-\/](\d{1,2})[月.\-\/](\d{1,2})日?$/);
      if (!mm) return { ok: false, reason: '日付の書き方が読み取れません（例：令和8年4月1日、2026/4/1）。' };
      var ey = mm[1] === '元' ? 1 : +mm[1];
      var yy = era.base + ey, mo3 = +mm[2], d3 = +mm[3];
      if (ey < 1 || !validYmd(yy, mo3, d3)) return { ok: false, reason: '存在しない日付です。' };
      var ymd = [yy, mo3, d3];
      if (cmp(ymd, era.start) < 0 || (era.end && cmp(ymd, era.end) > 0)) return { ok: false, reason: era.name + 'の期間に当たらない日付です。' };
      return { ok: true, ymd: ymd };
    }
    return { ok: false, reason: '日付の書き方が読み取れません（例：令和8年4月1日、2026/4/1）。' };
  }

  /**
   * 1つの欄の値を判定する。
   * 戻り値：{ status: 'ok'|'check'|'blank', reason, note }
   *   blank は任意の欄で未記入（確認済みとして扱う）。
   */
  function checkValue(field, raw) {
    var note = '';
    if (field.format === 'presence') {
      var present = raw === true || raw === 'true' || raw === '記載あり';
      if (present) return { status: 'ok', reason: '', note: '記載あり' };
      return field.required ? { status: 'check', reason: '未記入です（記載ありの確認が付いていません）。', note: '' }
        : { status: 'blank', reason: '', note: '記入なし（任意）' };
    }
    var v = str(raw).trim();
    if (v === '') {
      return field.required ? { status: 'check', reason: '未記入です。', note: '' } : { status: 'blank', reason: '', note: '記入なし（任意）' };
    }
    if (hasFullWidthAlnum(v) && field.format !== 'text' && field.format !== 'choice') note = '全角の数字を半角とみなして確認しました。';
    var h = toHalf(v).trim();
    var bad = function (reason) { return { status: 'check', reason: reason, note: note }; };
    switch (field.format) {
      case 'date': {
        var r = parseDate(v);
        return r.ok ? { status: 'ok', reason: '', note: note } : bad(r.reason);
      }
      case 'digits': {
        if (!/^\d+$/.test(h)) {
          var others = h.replace(/\d/g, '');
          return bad('数字以外の文字が含まれています（「' + others.slice(0, 5).replace(/ /g, '空白') + '」）。');
        }
        var n = h.length;
        if (field.digitsMin != null && field.digitsMax != null && field.digitsMin === field.digitsMax && n !== field.digitsMin) return bad(field.digitsMin + '桁のはずが' + n + '桁です。');
        if (field.digitsMin != null && n < field.digitsMin) return bad('桁数が足りません（' + n + '桁。' + field.digitsMin + '桁以上）。');
        if (field.digitsMax != null && n > field.digitsMax) return bad('桁数が多すぎます（' + n + '桁。' + field.digitsMax + '桁以下）。');
        return { status: 'ok', reason: '', note: note };
      }
      case 'postal': {
        var p = h.replace(/^〒\s*/, '');
        if (/^\d{3}-\d{4}$/.test(p) || /^\d{7}$/.test(p)) return { status: 'ok', reason: '', note: note };
        var pd = p.replace(/\D/g, '');
        if (pd.length !== 7) return bad('郵便番号は7桁です（' + pd.length + '桁になっています）。');
        return bad('郵便番号の書き方が違います（例：123-4567）。');
      }
      case 'phone': {
        var t = h.replace(/[()（）]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (/[^\d-]/.test(t)) return bad('電話番号に数字とハイフン以外の文字が含まれています。');
        var digits = t.replace(/-/g, '');
        if (digits.charAt(0) !== '0') return bad('電話番号が0で始まっていません。');
        if (digits.length !== 10 && digits.length !== 11) return bad('電話番号の桁数が' + digits.length + '桁です（市外局番から10桁または11桁）。');
        return { status: 'ok', reason: '', note: note };
      }
      case 'amount': {
        var a = h.replace(/\s+/g, '').replace(/^金/, '').replace(/^[¥\\￥]/, '').replace(/(円也|円|也|-)$/, '');
        if (!/^[\d,]+$/.test(a)) return bad('金額に数字と桁区切り以外の文字が含まれています。');
        if (a.indexOf(',') >= 0 && !/^\d{1,3}(,\d{3})+$/.test(a)) return bad('桁区切り（,）の位置が正しくありません。');
        var num = Number(a.replace(/,/g, ''));
        if (field.amountMin != null && num < field.amountMin) return bad('金額が下限（' + fmtYen(field.amountMin) + '）を下回っています。');
        if (field.amountMax != null && num > field.amountMax) return bad('金額が上限（' + fmtYen(field.amountMax) + '）を超えています。');
        return { status: 'ok', reason: '', note: note };
      }
      case 'choice': {
        var opts = field.options;
        for (var i = 0; i < opts.length; i++) if (toHalf(opts[i]).trim() === h) return { status: 'ok', reason: '', note: note };
        return bad('選択肢（' + opts.join('／') + '）のどれにも当たりません。');
      }
      default: {
        if (field.maxLength != null && v.length > field.maxLength) return bad('文字数が' + v.length + '字です（' + field.maxLength + '字以内）。');
        return { status: 'ok', reason: '', note: note };
      }
    }
  }

  /** 条件付きの添付書類が必要かどうか。true / false / null（条件の欄が未記入・誤りで判断できない） */
  function attachmentNeeded(t, a, values) {
    if (a.need === 'required') return true;
    if (a.need === 'optional') return false;
    var f = findField(t, a.cond && a.cond.fieldId);
    if (!f) return null;
    var raw = values[f.id];
    if (a.cond.op === 'filled') {
      if (f.format === 'presence') return raw === true;
      return str(raw).trim() !== '';
    }
    var v = f.format === 'presence' ? (raw === true ? '記載あり' : '') : toHalf(str(raw)).trim();
    if (v === '') return null;
    if (f.format === 'choice' && checkValue(f, raw).status === 'check') return null;
    var hit = a.cond.values.some(function (x) { return toHalf(x).trim() === v; });
    return a.cond.op === 'notEquals' ? !hit : hit;
  }

  /**
   * 判定。
   * input = { values: {欄id: 値}, received: {添付id: true}, pending: {欄id: '候補の出どころ'} }
   * pending は取り込みで入れた未確定の候補。未確定のままなら要確認にする。
   */
  function evaluate(t, input) {
    input = input || {};
    var values = input.values || {}, received = input.received || {}, pending = input.pending || {};
    var fields = t.fields.map(function (f) {
      var r = checkValue(f, values[f.id]);
      var res = { id: f.id, name: f.name, required: f.required, format: f.format, value: values[f.id], status: r.status, reason: r.reason, note: r.note };
      if (pending[f.id] && r.status !== 'blank') {
        res.status = 'check';
        res.reason = (r.status === 'check' ? r.reason + ' また、' : '') + pending[f.id] + 'の候補のまま確定されていません。';
      }
      res.group = res.status === 'check' ? 'check' : 'ok';
      return res;
    });
    var attachments = t.attachments.map(function (a) {
      var need = attachmentNeeded(t, a, values);
      var got = received[a.id] === true;
      var res = { id: a.id, name: a.name, need: a.need, condition: describeCondition(t, a), received: got, required: need };
      if (got) { res.group = 'ok'; res.status = 'received'; res.reason = ''; }
      else if (need === true) { res.group = 'missing'; res.status = 'missing'; res.reason = a.need === 'conditional' ? '条件に当たるため必要です（' + res.condition + '）。' : '必須の添付書類が受領されていません。'; }
      else if (need === null) { res.group = 'check'; res.status = 'undetermined'; res.reason = '条件の欄が未記入または誤りのため、要否を判断できません（' + res.condition + '）。'; }
      else { res.group = 'ok'; res.status = 'notNeeded'; res.reason = ''; }
      return res;
    });
    var counts = { ok: 0, check: 0, missing: 0 };
    fields.forEach(function (f) { counts[f.group]++; });
    attachments.forEach(function (a) { counts[a.group]++; });
    return { typeId: t.id, typeName: t.name, fields: fields, attachments: attachments, counts: counts };
  }

  function displayValue(field, raw) {
    if (field.format === 'presence') return raw === true ? '記載あり' : '';
    return str(raw);
  }

  function attachmentStatusLabel(a) {
    return { received: '受領', missing: '添付不足', undetermined: '要確認', notNeeded: '対象外' }[a.status] || '';
  }

  /* ---------- CSV ---------- */

  function csvCell(v) {
    var s = str(v);
    if (/[",\r\n]/.test(s) || /^[=+\-@\t\r]/.test(s)) {
      // 数式として解釈されないよう、先頭が記号のときは ' を付ける
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  /** Excelで文字化けしないよう、BOM付きUTF-8・CRLFで作る。 */
  function toCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function settingsToRows(settings) {
    var rows = [['申請の種類', '区分', '名前', '必須・区分', '書式', '書式の詳細', 'PDF上の別の表記', '添付の条件']];
    settings.types.forEach(function (t) {
      t.fields.forEach(function (f) {
        rows.push([t.name, '欄', f.name, f.required ? '必須' : '任意', FORMAT_LABEL[f.format], describeFormat(f), f.aliases.join('、'), '']);
      });
      t.attachments.forEach(function (a) {
        rows.push([t.name, '添付書類', a.name, NEED_LABEL[a.need], '', '', '', describeCondition(t, a)]);
      });
    });
    return rows;
  }

  var GROUP_LABEL = { ok: '確認済み', check: '要確認', missing: '添付不足' };

  function resultToRows(t, result, meta) {
    meta = meta || {};
    var rows = [['申請の種類', '確認日', '受付番号', '担当係', '役割', '区分', '項目', '必須・区分', '値', '結果', '理由']];
    var head = [t.name, meta.date || '', meta.receiptNo || '', meta.section || '', meta.role || ''];
    result.fields.forEach(function (r) {
      var f = findField(t, r.id);
      rows.push(head.concat(['欄', r.name, r.required ? '必須' : '任意', displayValue(f, r.value), GROUP_LABEL[r.group], r.reason || r.note || '']));
    });
    result.attachments.forEach(function (a) {
      rows.push(head.concat(['添付書類', a.name, NEED_LABEL[a.need], a.received ? '受領' : '未受領', a.status === 'notNeeded' ? '対象外' : GROUP_LABEL[a.group], a.reason || '']));
    });
    return rows;
  }

  /* ---------- 取り込み（PDF・画像の文字から値の候補を作る） ---------- */

  var CHECK_MARKS = '■☑☒✓✔●◉◆レ';
  var UNCHECK_MARKS = '□☐○◇';

  /** 読み取り結果の、日本語の文字の間に入った余分な空白を除く。 */
  function tidyOcrText(text) {
    var cjk = '[\\u3000-\\u30FF\\u3400-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF]';
    var re1 = new RegExp('(' + cjk + ') +(?=' + cjk + ')', 'g');
    var re2 = new RegExp('(' + cjk + ') +(?=[0-9A-Za-z])', 'g');
    var re3 = new RegExp('([0-9]) +(?=' + cjk + ')', 'g');
    return str(text).split(/\r?\n/).map(function (line) {
      var l = line.replace(/[ \t]+/g, ' ').trim();
      // 見出しと値は欄名で切り分けるので、日本語の文字に接した空白はすべて詰める
      for (var i = 0; i < 2; i++) l = l.replace(re1, '$1');
      l = l.replace(re2, '$1').replace(re3, '$1');
      // 桁区切りの後ろに入った空白（1, 800, 000円）を詰める
      l = l.replace(/(\d),\s+(?=\d{3})/g, '$1,');
      return l;
    }).filter(function (l) { return l !== ''; }).join('\n');
  }

  function stripSpaces(s) {
    var out = '', map = [];
    for (var i = 0; i < s.length; i++) {
      if (!/\s/.test(s.charAt(i))) { out += s.charAt(i); map.push(i); }
    }
    map.push(s.length);
    return { text: out, map: map };
  }

  function cleanValue(v) {
    return str(v)
      .replace(/^[\s:：・\-－=＝|｜\]】）)]+/, '')
      .replace(/^[（(]\s*(必須|任意)\s*[）)]\s*/, '')
      .replace(/^[\s:：]+/, '')
      .replace(/[\s|｜]+$/, '')
      .trim();
  }

  /**
   * 1行の中の欄名の位置をすべて探す。長い欄名を優先し、重なる短い欄名は捨てる。
   */
  function findLabels(line, labelList) {
    var st = stripSpaces(line);
    var hits = [];
    labelList.forEach(function (L) {
      var from = 0, idx;
      while ((idx = st.text.indexOf(L.key, from)) >= 0) {
        hits.push({ fieldId: L.fieldId, s: idx, e: idx + L.key.length, len: L.key.length });
        from = idx + 1;
      }
    });
    hits.sort(function (a, b) { return b.len - a.len || a.s - b.s; });
    var chosen = [];
    hits.forEach(function (h) {
      for (var i = 0; i < chosen.length; i++) if (h.s < chosen[i].e && chosen[i].s < h.e) return;
      chosen.push(h);
    });
    chosen.sort(function (a, b) { return a.s - b.s; });
    return chosen.map(function (h) {
      return { fieldId: h.fieldId, start: st.map[h.s], end: st.map[h.e - 1] + 1 };
    });
  }

  function pickChoice(field, text, ocrLike) {
    var t = str(text);
    var marked = [], present = [];
    field.options.forEach(function (o) {
      var key = stripSpaces(toHalf(o)).text;
      var st = stripSpaces(toHalf(t)).text;
      var idx = st.indexOf(key);
      if (idx < 0) return;
      present.push(o);
      var before = st.slice(Math.max(0, idx - 2), idx);
      // 画像の読み取りでは ■ が「画」「回」などに読み違えられることがあるので、選択肢の直前の1文字に限って印とみなす
      if (new RegExp('[' + CHECK_MARKS + ']').test(before.slice(-1)) || /[■☑☒✓✔●◉]/.test(before) || (ocrLike && /[画回團國圖]/.test(before.slice(-1)))) marked.push(o);
    });
    if (marked.length === 1) return marked[0];
    if (marked.length > 1) return '';
    var hasBoxes = new RegExp('[' + UNCHECK_MARKS + ']').test(t) || (ocrLike && /[口ロ]/.test(t));
    if (present.length === 1 && !hasBoxes) return present[0];
    return '';
  }

  /**
   * 文字の行の並びから、欄名を手がかりに値の候補を作る。
   * lines: 文字列の配列（PDFは1行ずつ、画像は読み取り結果）
   * 戻り値：{ values: {欄id: 候補}, found: {欄id: 見つかった行}, attachmentsMarked: [添付id] }
   */
  function extractCandidates(t, lines, opts) {
    opts = opts || {};
    var labelList = [];
    t.fields.forEach(function (f) {
      [f.name].concat(f.aliases || []).forEach(function (n) {
        var key = stripSpaces(toHalf(n)).text;
        if (key) labelList.push({ fieldId: f.id, key: key });
      });
    });
    var normLines = lines.map(function (l) { return toHalf(str(l)).replace(/\t/g, '  '); });
    var attKeys = t.attachments.map(function (a) { return stripSpaces(toHalf(a.name)).text; }).filter(Boolean);
    // 次の行を値とみなしてよいか（見出しや添付書類の一覧の行は値にしない）
    function looksLikeHeading(l) {
      var st = stripSpaces(l).text;
      if (/添付|^[■□☑☐✓✔●○◆◇・※]/.test(st)) return true;
      return attKeys.some(function (k) { return st.indexOf(k) >= 0; });
    }
    var values = {}, found = {};
    for (var i = 0; i < normLines.length; i++) {
      var line = normLines[i];
      var labels = findLabels(line, labelList);
      for (var j = 0; j < labels.length; j++) {
        var L = labels[j];
        if (values[L.fieldId] !== undefined) continue;
        var end = j + 1 < labels.length ? labels[j + 1].start : line.length;
        var v = cleanValue(line.slice(L.end, end));
        var lineNo = i;
        if (v === '' && j === labels.length - 1 && i + 1 < normLines.length && findLabels(normLines[i + 1], labelList).length === 0 && !looksLikeHeading(normLines[i + 1])) {
          v = cleanValue(normLines[i + 1]);
          lineNo = i + 1;
        }
        var f = findField(t, L.fieldId);
        if (f.format === 'choice') {
          var c = pickChoice(f, v, opts.ocr);
          if (!c && v !== '') { values[f.id] = ''; found[f.id] = lines[lineNo]; continue; }
          v = c;
        } else if (f.format === 'presence') {
          v = v !== '' && !/^[（(]?\s*(未記入|なし)\s*[）)]?$/.test(v);
        }
        if (v === '' || v === false) continue;
        values[f.id] = v;
        found[f.id] = lines[lineNo];
      }
    }
    Object.keys(values).forEach(function (k) { if (values[k] === '') delete values[k]; });

    var all = normLines.join('\n');
    var allStripped = stripSpaces(all).text;
    var marked = [];
    t.attachments.forEach(function (a) {
      var key = stripSpaces(toHalf(a.name)).text;
      var from = 0, idx;
      while (key && (idx = allStripped.indexOf(key, from)) >= 0) {
        var before = allStripped.slice(Math.max(0, idx - 2), idx);
        if (/[■☑☒✓✔●◉]/.test(before)) { marked.push(a.id); break; }
        from = idx + 1;
      }
    });
    return { values: values, found: found, attachmentsMarked: marked };
  }

  /**
   * PDFの文字の部品（pdf.js の textContent.items）を行にまとめる。
   * items: [{str, transform:[a,b,c,d,x,y], width, height}]
   */
  function itemsToLines(items) {
    var parts = items.filter(function (it) { return it && typeof it.str === 'string' && it.str !== ''; }).map(function (it) {
      var tr = it.transform || [1, 0, 0, 1, 0, 0];
      var size = Math.abs(it.height) || Math.hypot(tr[2], tr[3]) || 10;
      return { s: it.str, x: tr[4], y: tr[5], w: it.width || 0, size: size };
    });
    parts.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var rows = [];
    parts.forEach(function (p) {
      var row = null;
      for (var i = rows.length - 1; i >= 0 && i >= rows.length - 3; i--) {
        if (Math.abs(rows[i].y - p.y) <= Math.max(2, p.size * 0.45)) { row = rows[i]; break; }
      }
      if (!row) { row = { y: p.y, parts: [] }; rows.push(row); }
      row.parts.push(p);
    });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = '', lastEnd = null;
      r.parts.forEach(function (p) {
        if (lastEnd != null) {
          var gap = p.x - lastEnd;
          if (gap > p.size * 1.2) out += '\t';
          else if (gap > p.size * 0.25) out += ' ';
        }
        out += p.s;
        lastEnd = p.x + p.w;
      });
      return out.replace(/\s+$/, '');
    }).filter(function (l) { return l.trim() !== ''; });
  }

  /**
   * 画像の読み取りの前処理：表の罫線（長い横線・縦線）を白で消す。
   * gray: 濃淡（0=黒〜255=白）の配列。その場で書き換える。
   * 罫線が残ると、文字の行が図として扱われて読み取れないことがあるため。
   */
  function removeRuledLines(gray, w, h) {
    var TH = 128;
    var minH = Math.max(40, Math.round(w * 0.05));
    var minV = Math.max(40, Math.round(h * 0.03));
    var x, y, start;
    var mask = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      start = -1;
      for (x = 0; x <= w; x++) {
        var dark = x < w && gray[y * w + x] < TH;
        if (dark && start < 0) start = x;
        if (!dark && start >= 0) {
          if (x - start >= minH) for (var k = start; k < x; k++) mask[y * w + k] = 1;
          start = -1;
        }
      }
    }
    for (x = 0; x < w; x++) {
      start = -1;
      for (y = 0; y <= h; y++) {
        var dk = y < h && gray[y * w + x] < TH;
        if (dk && start < 0) start = y;
        if (!dk && start >= 0) {
          if (y - start >= minV) for (var j = start; j < y; j++) mask[j * w + x] = 1;
          start = -1;
        }
      }
    }
    var n = 0;
    for (var i = 0; i < mask.length; i++) {
      if (mask[i]) {
        n++;
        // 線の縁のにじみも消す（上下左右1画素）
        gray[i] = 255;
        if (i - w >= 0 && gray[i - w] < 200) gray[i - w] = 255;
        if (i + w < gray.length && gray[i + w] < 200) gray[i + w] = 255;
        if (i % w > 0 && gray[i - 1] < 200) gray[i - 1] = 255;
        if (i % w < w - 1 && gray[i + 1] < 200) gray[i + 1] = 255;
      }
    }
    return n;
  }

  /* ---------- AI（候補を補う。確定は職員） ---------- */

  function buildAiMessages(t, text, missingIds) {
    var fields = t.fields.filter(function (f) { return !missingIds || missingIds.indexOf(f.id) >= 0; });
    var list = fields.map(function (f) {
      var d = '- ' + f.name + '（' + describeFormat(f) + '）';
      return d;
    }).join('\n');
    var sys = 'あなたは自治体の申請書の受付事務を補助します。申請書から取り出した文字を読み、指定された欄の値をJSONで返してください。' +
      '書かれていない欄は空文字にしてください。推測で値を作らないでください。「記載の有無」の欄は、記載があれば「記載あり」、なければ空文字にしてください。' +
      '返すJSONは {"欄名": "値"} の形だけにしてください。';
    var user = '欄の一覧：\n' + list + '\n\n申請書の文字：\n' + str(text).slice(0, 12000);
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  /** AIの返事（文字列）から候補を取り出す。欄名で対応づけ、形の合わないものは捨てる。 */
  function parseAiAnswer(t, content, onlyIds) {
    var txt = str(content).trim();
    var m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AIの返事にJSONが含まれていませんでした。');
    var obj;
    try { obj = JSON.parse(m[0]); } catch (e) { throw new Error('AIの返事のJSONが読めませんでした。'); }
    var out = {};
    t.fields.forEach(function (f) {
      if (onlyIds && onlyIds.indexOf(f.id) < 0) return;
      if (!Object.prototype.hasOwnProperty.call(obj, f.name)) return;
      var v = obj[f.name];
      if (v == null || typeof v === 'object') return;
      v = str(v).trim();
      if (v === '') return;
      if (f.format === 'presence') { if (v === '記載あり' || v === 'true' || v === 'あり') out[f.id] = true; return; }
      if (f.format === 'choice') { if (f.options.indexOf(v) >= 0) out[f.id] = v; return; }
      out[f.id] = v;
    });
    return out;
  }

  return {
    SETTINGS_FORMAT: SETTINGS_FORMAT,
    SETTINGS_VERSION: SETTINGS_VERSION,
    FORMATS: FORMATS, FORMAT_LABEL: FORMAT_LABEL, NEED: NEED, NEED_LABEL: NEED_LABEL, GROUP_LABEL: GROUP_LABEL,
    newId: newId, toHalf: toHalf,
    normalizeType: normalizeType, normalizeField: normalizeField, normalizeAttachment: normalizeAttachment,
    emptySettings: emptySettings, parseSettings: parseSettings, mergeSettings: mergeSettings, checkType: checkType,
    findField: findField, describeCondition: describeCondition, describeFormat: describeFormat,
    parseDate: parseDate, checkValue: checkValue, attachmentNeeded: attachmentNeeded, evaluate: evaluate,
    displayValue: displayValue, attachmentStatusLabel: attachmentStatusLabel,
    toCsv: toCsv, settingsToRows: settingsToRows, resultToRows: resultToRows,
    tidyOcrText: tidyOcrText, removeRuledLines: removeRuledLines, extractCandidates: extractCandidates, itemsToLines: itemsToLines,
    buildAiMessages: buildAiMessages, parseAiAnswer: parseAiAnswer
  };
});
