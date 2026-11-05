// 判定の中心部分のテスト（node --test test/）
const test = require('node:test');
const assert = require('node:assert/strict');
const SFC = require('../js/core.js');
const SAMPLES = require('../js/samples.js');

const F = (o) => SFC.normalizeField(Object.assign({ name: 'x', required: true }, o));

test('日付：西暦・和暦・存在しない日付', () => {
  assert.equal(SFC.parseDate('2026/4/1').ok, true);
  assert.equal(SFC.parseDate('２０２６年４月１日').ok, true);
  assert.equal(SFC.parseDate('令和8年10月1日').ok, true);
  assert.equal(SFC.parseDate('R8.10.1').ok, true);
  assert.equal(SFC.parseDate('令和元年5月1日').ok, true);
  assert.equal(SFC.parseDate('令和元年4月30日').ok, false);
  assert.equal(SFC.parseDate('令和8年2月30日').ok, false);
  assert.equal(SFC.parseDate('昭和60年2月28日').ok, true);
  assert.equal(SFC.parseDate('2026-13-01').ok, false);
  assert.equal(SFC.parseDate('来週').ok, false);
});

test('必須の未記入と任意の未記入', () => {
  assert.equal(SFC.checkValue(F({ format: 'text' }), '').status, 'check');
  assert.equal(SFC.checkValue(F({ format: 'text', required: false }), '').status, 'blank');
  assert.match(SFC.checkValue(F({ format: 'text' }), ' ').reason, /未記入/);
});

test('数字のみ・桁数', () => {
  const f = F({ format: 'digits', digitsMin: 13, digitsMax: 13 });
  assert.equal(SFC.checkValue(f, '1234567890123').status, 'ok');
  assert.match(SFC.checkValue(f, '123456789012').reason, /13桁のはずが12桁/);
  assert.match(SFC.checkValue(f, '12-34').reason, /数字以外/);
  const r = SFC.checkValue(f, '１２３４５６７８９０１２３');
  assert.equal(r.status, 'ok');
  assert.match(r.note, /全角/);
  assert.equal(SFC.checkValue(F({ format: 'digits', digitsMin: 1, digitsMax: 3 }), '約80').status, 'check');
});

test('郵便番号・電話番号', () => {
  const p = F({ format: 'postal' });
  assert.equal(SFC.checkValue(p, '123-4567').status, 'ok');
  assert.equal(SFC.checkValue(p, '〒1234567').status, 'ok');
  assert.match(SFC.checkValue(p, '123-456').reason, /7桁/);
  const t = F({ format: 'phone' });
  assert.equal(SFC.checkValue(t, '03-1234-5678').status, 'ok');
  assert.equal(SFC.checkValue(t, '090-1234-5678').status, 'ok');
  assert.equal(SFC.checkValue(t, '03(1234)5678').status, 'ok');
  assert.match(SFC.checkValue(t, '03-1234-567').reason, /9桁/);
  assert.match(SFC.checkValue(t, '3-1234-5678').reason, /0で始まって/);
});

test('金額', () => {
  const f = F({ format: 'amount', amountMin: 1, amountMax: 1000000 });
  assert.equal(SFC.checkValue(f, '1,000,000円').status, 'ok');
  assert.equal(SFC.checkValue(f, '金500,000円也').status, 'ok');
  assert.equal(SFC.checkValue(f, '¥900000').status, 'ok');
  assert.match(SFC.checkValue(f, '1,200,000円').reason, /上限/);
  assert.match(SFC.checkValue(f, '12,00円').reason, /桁区切り/);
  assert.match(SFC.checkValue(f, '五十万円').reason, /数字と桁区切り以外/);
});

test('選択肢・記載の有無・文字数', () => {
  const c = F({ format: 'choice', options: ['法人', '個人事業主'] });
  assert.equal(SFC.checkValue(c, '法人').status, 'ok');
  assert.equal(SFC.checkValue(c, '会社').status, 'check');
  const pr = F({ format: 'presence' });
  assert.equal(SFC.checkValue(pr, true).status, 'ok');
  assert.equal(SFC.checkValue(pr, false).status, 'check');
  const tx = F({ format: 'text', maxLength: 5 });
  assert.match(SFC.checkValue(tx, '123456').reason, /6字/);
});

test('設定の読み込み・形の違うJSON', () => {
  const s = SFC.parseSettings({ types: SAMPLES.types });
  assert.equal(s.types.length, 3);
  assert.equal(s.format, SFC.SETTINGS_FORMAT);
  assert.throws(() => SFC.parseSettings('{'), /JSON/);
  assert.throws(() => SFC.parseSettings({ foo: 1 }), /types/);
  assert.throws(() => SFC.parseSettings({ format: 'other', types: [] }), /このツールの設定/);
  // 書き出した形をそのまま読み戻せる
  const again = SFC.parseSettings(JSON.stringify(s));
  assert.deepEqual(again, s);
  // BOM付き
  assert.equal(SFC.parseSettings('﻿' + JSON.stringify(s)).types.length, 3);
});

test('見本の設定に不備がない', () => {
  SFC.parseSettings({ types: SAMPLES.types }).types.forEach((t) => {
    assert.deepEqual(SFC.checkType(t), [], t.name);
  });
});

test('設定の点検', () => {
  const t = SFC.normalizeType({ name: '', fields: [{ name: 'a', format: 'choice' }, { name: 'a' }], attachments: [{ name: '書類', need: 'conditional', cond: {} }] });
  const p = SFC.checkType(t).join('\n');
  assert.match(p, /名前が空/);
  assert.match(p, /選択肢が登録されていません/);
  assert.match(p, /重なって/);
  assert.match(p, /条件の欄が選ばれていません/);
});

test('追加の取り込み：重なりは取り込まず件数を返す', () => {
  const all = SFC.parseSettings({ types: SAMPLES.types });
  const cur = SFC.parseSettings({ types: SAMPLES.types.slice(0, 1) });
  const r = SFC.mergeSettings(cur, all);
  assert.equal(r.added.length, 2);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.settings.types.length, 3);
  // 名前が同じでidが違うものも重なりとみなす
  const other = SFC.parseSettings({ types: [Object.assign({}, SAMPLES.types[0], { id: 'zzz' })] });
  assert.equal(SFC.mergeSettings(cur, other).skipped.length, 1);
});

test('CSV：BOM付き・CRLF・引用符・数式にならない', () => {
  const csv = SFC.toCsv([['a', 'b,c', 'd"e'], ['=1+1', '改行\nあり', '']]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes('"b,c"'));
  assert.ok(csv.includes('"d""e"'));
  assert.ok(csv.includes(`"'=1+1"`));
  const rows = SFC.settingsToRows(SFC.parseSettings({ types: SAMPLES.types }));
  assert.equal(rows[0][0], '申請の種類');
  assert.ok(rows.some((r) => r[7] && r[7].includes('「事業者の区分」が「法人」のとき必要')));
});

test('判定：見本の「記載漏れのある例」と「そろっている例」', () => {
  const settings = SFC.parseSettings({ types: SAMPLES.types });
  for (const c of SAMPLES.cases) {
    const t = settings.types.find((x) => x.id === c.typeId);
    const r = SFC.evaluate(t, { values: c.values, received: c.received });
    if (c.id.endsWith('-ok')) {
      assert.equal(r.counts.check, 0, c.id + ' ' + JSON.stringify(r.fields.filter((f) => f.group === 'check')));
      assert.equal(r.counts.missing, 0, c.id);
    } else {
      assert.ok(r.counts.check + r.counts.missing > 0, c.id);
    }
  }
});

test('判定：補助金の記載漏れの理由', () => {
  const settings = SFC.parseSettings({ types: SAMPLES.types });
  const c = SAMPLES.cases.find((x) => x.id === 'hojokin-ng');
  const t = settings.types.find((x) => x.id === c.typeId);
  const r = SFC.evaluate(t, { values: c.values, received: c.received });
  const by = Object.fromEntries(r.fields.map((f) => [f.name, f]));
  assert.equal(by['法人番号'].group, 'ok');
  assert.match(by['法人番号'].note, /全角/);
  assert.match(by['代表者の氏名'].reason, /未記入/);
  assert.match(by['所在地の郵便番号'].reason, /7桁/);
  assert.match(by['電話番号'].reason, /9桁/);
  assert.match(by['交付申請額'].reason, /上限/);
  assert.match(by['事業の完了予定日'].reason, /未記入/);
  const att = Object.fromEntries(r.attachments.map((a) => [a.name, a]));
  assert.equal(att['履歴事項全部証明書'].group, 'missing');
  assert.equal(att['開業届の写し'].status, 'notNeeded');
  assert.equal(att['誓約書'].group, 'missing');
});

test('判定：条件の欄が未記入なら条件付きの添付書類は要確認、候補は未確定なら要確認', () => {
  const t = SFC.parseSettings({ types: SAMPLES.types }).types[0];
  const r = SFC.evaluate(t, { values: {}, received: {} });
  const a = r.attachments.find((x) => x.name === '履歴事項全部証明書');
  assert.equal(a.group, 'check');
  assert.match(a.reason, /判断できません/);
  const r2 = SFC.evaluate(t, { values: { 'h-date': '2026/1/5' }, pending: { 'h-date': 'PDF' } });
  const d = r2.fields.find((x) => x.id === 'h-date');
  assert.equal(d.group, 'check');
  assert.match(d.reason, /PDFの候補のまま/);
  // 条件「以外」と「記入があるとき」
  const t2 = SFC.normalizeType({ name: 'x', fields: [{ id: 'k', name: 'k', format: 'text' }], attachments: [
    { id: 'a', name: 'A', need: 'conditional', cond: { fieldId: 'k', op: 'filled' } },
    { id: 'b', name: 'B', need: 'conditional', cond: { fieldId: 'k', op: 'notEquals', values: ['x'] } }] });
  const r3 = SFC.evaluate(t2, { values: { k: 'y' } });
  assert.equal(r3.attachments[0].group, 'missing');
  assert.equal(r3.attachments[1].group, 'missing');
  const r4 = SFC.evaluate(t2, { values: { k: 'x' }, received: { a: true } });
  assert.equal(r4.attachments[0].group, 'ok');
  assert.equal(r4.attachments[1].status, 'notNeeded');
});

test('結果のCSV', () => {
  const settings = SFC.parseSettings({ types: SAMPLES.types });
  const c = SAMPLES.cases.find((x) => x.id === 'shomei-ng');
  const t = settings.types.find((x) => x.id === c.typeId);
  const r = SFC.evaluate(t, { values: c.values, received: c.received });
  const rows = SFC.resultToRows(t, r, { date: '2026-11-05', section: '市民課 証明係', role: '受付' });
  assert.equal(rows.length, 1 + t.fields.length + t.attachments.length);
  assert.ok(rows.some((x) => x[6] === '委任状' && x[9] === '添付不足'));
  assert.ok(rows.some((x) => x[6] === '窓口に来た方の氏名' && x[8] === '記載あり'));
});
