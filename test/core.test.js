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

test('取り込み：欄名を手がかりに候補を作る', () => {
  const t = SFC.parseSettings({ types: SAMPLES.types }).types[0];
  const lines = [
    '小規模事業者 設備導入補助金 交付申請 申請書',
    '申請年月日（必須）\t令和８年１０月１日',
    '事業者の区分（必須）\t■法人　□個人事業主',
    '法人番号\t1234567890123',
    '事業者の名称（必須）\t株式会社架空製作所',
    '代表者の氏名（必須）',
    '所在地の郵便番号（必須）\t123-4567',
    '所 在 地\t架空県架空市本町',
    '電話番号：03-1234-5678　　交付申請額 900,000円',
    '補助事業の名称',
    '生産ラインの省力化',
    '添付書類（添付したものに■）',
    '■ 事業計画書', '□ 経費の見積書', '■履歴事項全部証明書'
  ];
  const r = SFC.extractCandidates(t, lines);
  assert.equal(r.values['h-date'], '令和8年10月1日');
  assert.equal(r.values['h-kubun'], '法人');
  assert.equal(r.values['h-hojinno'], '1234567890123');
  assert.equal(r.values['h-jigyosha'], true);
  assert.equal(r.values['h-daihyo'], undefined); // 空欄
  assert.equal(r.values['h-zip'], '123-4567');
  assert.equal(r.values['h-addr'], true); // 字間の空いた欄名
  assert.equal(r.values['h-tel'], '03-1234-5678');
  assert.equal(r.values['h-shinsei'], '900,000円'); // 1行に2つの欄
  assert.equal(r.values['h-jigyomei'], '生産ラインの省力化'); // 次の行の値
  assert.deepEqual(r.attachmentsMarked.sort(), ['h-a1', 'h-a3']);
});

test('取り込み：選択肢に印がないときは候補を入れない', () => {
  const t = SFC.parseSettings({ types: SAMPLES.types }).types[0];
  const r = SFC.extractCandidates(t, ['事業者の区分\t□法人　□個人事業主']);
  assert.equal(r.values['h-kubun'], undefined);
});

test('読み取り結果の空白を詰める', () => {
  assert.equal(SFC.tidyOcrText('申請 年 月 日 令 和 8 年 10 月 1 日'), '申請年月日令和8年10月1日');
  assert.equal(SFC.tidyOcrText('郵便 番号 123-4567\n\n電話 03 1234 5678'), '郵便番号123-4567\n電話03 1234 5678');
});

test('PDFの文字の部品を行にまとめる', () => {
  const it = (s, x, y, w) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
  const lines = SFC.itemsToLines([it('値A', 230, 700, 20), it('欄A', 56, 700, 20), it('欄B', 56, 674, 20), it('値B', 230, 674.5, 20)]);
  assert.deepEqual(lines, ['欄A\t値A', '欄B\t値B']);
});

test('AIの返事から候補を取り出す（形の合わないものは捨てる）', () => {
  const t = SFC.parseSettings({ types: SAMPLES.types }).types[0];
  const msgs = SFC.buildAiMessages(t, '申請書の文字', ['h-date', 'h-kubun']);
  assert.equal(msgs.length, 2);
  assert.match(msgs[1].content, /申請年月日/);
  assert.doesNotMatch(msgs[1].content, /交付申請額/);
  const c = SFC.parseAiAnswer(t, '```json\n{"申請年月日":"令和8年10月1日","事業者の区分":"会社","代表者の氏名":"記載あり","交付申請額":""}\n```');
  assert.equal(c['h-date'], '令和8年10月1日');
  assert.equal(c['h-kubun'], undefined);
  assert.equal(c['h-daihyo'], true);
  assert.equal(c['h-shinsei'], undefined);
  assert.deepEqual(SFC.parseAiAnswer(t, '{"申請年月日":"x"}', ['h-kubun']), {});
  assert.throws(() => SFC.parseAiAnswer(t, 'わかりません'), /JSON/);
});

test('長音記号は数字の間だけハイフンにする', () => {
  assert.equal(SFC.toHalf('多目的ホール'), '多目的ホール');
  assert.equal(SFC.toHalf('０３ー１２３４ー５６７８'), '03-1234-5678');
});

test('画像の読み取り結果：■の読み違いと桁区切りの空白', () => {
  const t = SFC.parseSettings({ types: SAMPLES.types }).types[0];
  const lines = SFC.tidyOcrText('事業者の区分 (必須 ) 画法人口個人事業主\n補助事業に要する経費(必須) 1, 800, 000円').split('\n');
  const r = SFC.extractCandidates(t, lines, { ocr: true });
  assert.equal(r.values['h-kubun'], '法人');
  assert.equal(r.values['h-sogaku'], '1,800,000円');
  // PDFの文字では「画」を印とみなさない
  assert.equal(SFC.extractCandidates(t, lines).values['h-kubun'], undefined);
});

test('画像の前処理：長い罫線は消し、文字の短い線は残す', () => {
  const w = 200, h = 100;
  const g = new Uint8Array(w * h).fill(255);
  for (let x = 10; x < 190; x++) g[50 * w + x] = 0;      // 横の罫線
  for (let y = 5; y < 95; y++) g[y * w + 100] = 0;       // 縦の罫線
  for (let x = 20; x < 30; x++) g[20 * w + x] = 0;       // 文字の線（短い）
  SFC.removeRuledLines(g, w, h);
  assert.equal(g[50 * w + 60], 255);
  assert.equal(g[70 * w + 100], 255);
  assert.equal(g[20 * w + 25], 0);
});
