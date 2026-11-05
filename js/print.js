/*
 * 確認結果票（A4）の印刷
 * 申請の種類、確認日、各欄の結果、添付書類の有無、確認者の押印欄を1枚にまとめる。
 */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var esc = function (s) { return App.esc(s); };

  function jpDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    var y = +m[1], mo = +m[2], d = +m[3];
    var s = y + '年' + mo + '月' + d + '日';
    if (y > 2019 || (y === 2019 && mo >= 5)) s += '（令和' + (y - 2018 === 1 ? '元' : (y - 2018)) + '年）';
    return s;
  }

  var RESULT_LABEL = { ok: '確認済み', check: '要確認', missing: '添付不足' };

  /** 確認結果票のHTMLを作る（テストでも使う）。 */
  App.buildSheet = function (t, r, meta) {
    var rows = r.fields.map(function (f, i) {
      var field = SFC.findField(t, f.id);
      var val = SFC.displayValue(field, f.value);
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(f.name) + '</td><td>' + (f.required ? '必須' : '任意') + '</td><td>' + esc(val) +
        '</td><td class="res-' + f.group + '">' + RESULT_LABEL[f.group] + '</td><td>' + esc(f.reason || f.note || '') + '</td></tr>';
    }).join('');
    var atts = r.attachments.map(function (a) {
      var res = a.status === 'notNeeded' ? '対象外' : RESULT_LABEL[a.group];
      return '<tr><td>' + esc(a.name) + '</td><td>' + esc(SFC.NEED_LABEL[a.need]) + (a.condition ? '<br><small>' + esc(a.condition) + '</small>' : '') +
        '</td><td>' + (a.received ? '有' : '無') + '</td><td class="res-' + a.group + '">' + res + '</td><td>' + esc(a.reason || '') + '</td></tr>';
    }).join('');
    return '<div class="sheet">' +
      '<div class="sheet-head"><h1>確認結果票</h1>' +
      '<div class="stamps"><div><div class="s-head">確認者</div><div class="s-box"></div></div><div><div class="s-head">審査者</div><div class="s-box"></div></div></div></div>' +
      '<p class="final">最終の判断は職員が行います。この票は、申請書類の記載漏れ・添付漏れの下確認の結果です。</p>' +
      '<table class="meta"><tbody>' +
      '<tr><th>申請の種類</th><td colspan="3">' + esc(t.name) + '</td></tr>' +
      '<tr><th>確認日</th><td>' + esc(jpDate(meta.date)) + '</td><th>受付番号</th><td>' + esc(meta.receiptNo) + '</td></tr>' +
      '<tr><th>担当係</th><td>' + esc(meta.section) + '</td><th>役割</th><td>' + esc(meta.role) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="counts">確認済み ' + r.counts.ok + '件　要確認 ' + r.counts.check + '件　添付不足 ' + r.counts.missing + '件</p>' +
      '<h2>記載の確認</h2>' +
      '<table class="fields"><colgroup><col style="width:6%"><col style="width:21%"><col style="width:7%"><col style="width:24%"><col style="width:10%"><col></colgroup>' +
      '<thead><tr><th>No.</th><th>欄名</th><th>区分</th><th>記載内容</th><th>結果</th><th>理由・補足</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<h2>添付書類</h2>' +
      (atts ? '<table class="atts"><colgroup><col style="width:27%"><col style="width:23%"><col style="width:7%"><col style="width:10%"><col></colgroup><thead><tr><th>書類名</th><th>区分</th><th>有無</th><th>結果</th><th>理由</th></tr></thead><tbody>' + atts + '</tbody></table>' : '<p>登録された添付書類はありません。</p>') +
      '<p class="foot">申請書類 記載漏れ・添付漏れ確認ツールで作成。氏名・住所などの欄は記載の有無だけを確認しています。最終の判断は職員が行います。</p>' +
      '</div>';
  };

  App.printSheet = function () {
    var t = App.checkUI.currentType();
    if (!t) return;
    var C = App.checkUI.state;
    if (Object.keys(C.pending).length && !window.confirm('未確定の候補があります（要確認として印刷されます）。このまま印刷しますか。')) return;
    var area = document.getElementById('print-area');
    area.innerHTML = App.buildSheet(t, App.checkUI.currentResult(), App.checkUI.meta());
    App.checkUI.setOutputDone();
    App.checkUI.msg('確認結果票を印刷に回しました。', 'ok');
    window.print();
  };
})();
