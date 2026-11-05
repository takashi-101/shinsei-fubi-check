/*
 * 見本（すべて架空。実在の団体・個人・様式とは関係ない）
 * 申請の種類3つと、それぞれ「記載漏れのある例」「そろっている例」の値。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SFC_SAMPLES = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var types = [
    {
      id: 'sample-hojokin',
      name: '（見本）小規模事業者 設備導入補助金 交付申請',
      note: '見本の申請の種類です。架空のものです。',
      fields: [
        { id: 'h-date', name: '申請年月日', required: true, format: 'date' },
        { id: 'h-kubun', name: '事業者の区分', required: true, format: 'choice', options: ['法人', '個人事業主'] },
        { id: 'h-hojinno', name: '法人番号', required: false, format: 'digits', digitsMin: 13, digitsMax: 13, hint: '法人のみ' },
        { id: 'h-jigyosha', name: '事業者の名称', required: true, format: 'presence' },
        { id: 'h-daihyo', name: '代表者の氏名', required: true, format: 'presence' },
        { id: 'h-zip', name: '所在地の郵便番号', required: true, format: 'postal', aliases: ['郵便番号'] },
        { id: 'h-addr', name: '所在地', required: true, format: 'presence' },
        { id: 'h-tel', name: '電話番号', required: true, format: 'phone' },
        { id: 'h-jigyomei', name: '補助事業の名称', required: true, format: 'text', maxLength: 40 },
        { id: 'h-sogaku', name: '補助事業に要する経費', required: true, format: 'amount', aliases: ['事業費の総額'] },
        { id: 'h-shinsei', name: '交付申請額', required: true, format: 'amount', amountMin: 1, amountMax: 1000000 },
        { id: 'h-kanryo', name: '事業の完了予定日', required: true, format: 'date' }
      ],
      attachments: [
        { id: 'h-a1', name: '事業計画書', need: 'required' },
        { id: 'h-a2', name: '経費の見積書', need: 'required' },
        { id: 'h-a3', name: '履歴事項全部証明書', need: 'conditional', cond: { fieldId: 'h-kubun', op: 'equals', values: ['法人'] } },
        { id: 'h-a4', name: '開業届の写し', need: 'conditional', cond: { fieldId: 'h-kubun', op: 'equals', values: ['個人事業主'] } },
        { id: 'h-a5', name: '市税の納税証明書', need: 'required' },
        { id: 'h-a6', name: '誓約書', need: 'required' }
      ]
    },
    {
      id: 'sample-shisetsu',
      name: '（見本）公共施設 使用許可申請',
      note: '見本の申請の種類です。架空のものです。',
      fields: [
        { id: 's-date', name: '申請年月日', required: true, format: 'date' },
        { id: 's-kubun', name: '申請者の区分', required: true, format: 'choice', options: ['個人', '団体'] },
        { id: 's-dantai', name: '団体名', required: false, format: 'text', maxLength: 40, hint: '団体のみ' },
        { id: 's-shimei', name: '申請者の氏名', required: true, format: 'presence', aliases: ['代表者の氏名'] },
        { id: 's-tel', name: '連絡先電話番号', required: true, format: 'phone' },
        { id: 's-shisetsu', name: '使用する施設', required: true, format: 'choice', options: ['多目的ホール', '会議室A', '会議室B', '調理実習室'] },
        { id: 's-day', name: '使用日', required: true, format: 'date' },
        { id: 's-jikan', name: '使用時間帯', required: true, format: 'choice', options: ['午前', '午後', '夜間', '全日'] },
        { id: 's-ninzu', name: '使用人数', required: true, format: 'digits', digitsMin: 1, digitsMax: 3 },
        { id: 's-mokuteki', name: '使用の目的', required: true, format: 'text', maxLength: 50 },
        { id: 's-nyujo', name: '入場料の徴収', required: true, format: 'choice', options: ['有', '無'] },
        { id: 's-hanbai', name: '物品の販売', required: true, format: 'choice', options: ['有', '無'] }
      ],
      attachments: [
        { id: 's-a1', name: '団体の規約または会員名簿', need: 'conditional', cond: { fieldId: 's-kubun', op: 'equals', values: ['団体'] } },
        { id: 's-a2', name: '催しの企画書', need: 'conditional', cond: { fieldId: 's-nyujo', op: 'equals', values: ['有'] } },
        { id: 's-a3', name: '販売する物品の一覧', need: 'conditional', cond: { fieldId: 's-hanbai', op: 'equals', values: ['有'] } },
        { id: 's-a4', name: '会場の配置図', need: 'optional' }
      ]
    },
    {
      id: 'sample-shomei',
      name: '（見本）各種証明書 交付申請',
      note: '見本の申請の種類です。架空のものです。',
      fields: [
        { id: 'c-date', name: '申請年月日', required: true, format: 'date' },
        { id: 'c-shurui', name: '必要な証明書', required: true, format: 'choice', options: ['住民票の写し', '所得証明書', '課税証明書', '納税証明書'] },
        { id: 'c-nendo', name: '対象の年度', required: false, format: 'text', maxLength: 10, hint: '所得・課税・納税の証明のみ' },
        { id: 'c-tsusu', name: '必要な通数', required: true, format: 'digits', digitsMin: 1, digitsMax: 2 },
        { id: 'c-mokuteki', name: '使用目的', required: true, format: 'choice', options: ['勤務先へ提出', '金融機関へ提出', '官公署へ提出', 'その他'] },
        { id: 'c-raichou', name: '窓口に来た方', required: true, format: 'choice', options: ['本人', '同一世帯の方', '代理人'] },
        { id: 'c-shimei', name: '窓口に来た方の氏名', required: true, format: 'presence' },
        { id: 'c-jusho', name: '窓口に来た方の住所', required: true, format: 'presence' },
        { id: 'c-taisho', name: '証明が必要な方の生年月日', required: true, format: 'date', aliases: ['生年月日'] },
        { id: 'c-tel', name: '日中の連絡先', required: true, format: 'phone' }
      ],
      attachments: [
        { id: 'c-a1', name: '窓口に来た方の本人確認書類（提示）', need: 'required' },
        { id: 'c-a2', name: '委任状', need: 'conditional', cond: { fieldId: 'c-raichou', op: 'equals', values: ['代理人'] } },
        { id: 'c-a3', name: '交付手数料の納付', need: 'required' }
      ]
    }
  ];

  /* 見本の申請の値。presence（記載の有無）の欄は true / false。 */
  var cases = [
    {
      id: 'hojokin-ng', typeId: 'sample-hojokin', label: '補助金の交付申請：記載漏れのある例', pdf: 'hojokin-ng',
      values: {
        'h-date': '令和8年10月1日', 'h-kubun': '法人', 'h-hojinno': '１２３４５６７８９０１２３', 'h-jigyosha': true, 'h-daihyo': false,
        'h-zip': '123-456', 'h-addr': true, 'h-tel': '03-1234-567', 'h-jigyomei': '生産ラインの省力化設備の導入',
        'h-sogaku': '1,800,000円', 'h-shinsei': '1,200,000円', 'h-kanryo': ''
      },
      received: { 'h-a1': true, 'h-a2': true, 'h-a5': true }
    },
    {
      id: 'hojokin-ok', typeId: 'sample-hojokin', label: '補助金の交付申請：そろっている例', pdf: 'hojokin-ok', image: 'hojokin-ok-scan',
      values: {
        'h-date': '令和8年10月1日', 'h-kubun': '法人', 'h-hojinno': '1234567890123', 'h-jigyosha': true, 'h-daihyo': true,
        'h-zip': '123-4567', 'h-addr': true, 'h-tel': '03-1234-5678', 'h-jigyomei': '生産ラインの省力化設備の導入',
        'h-sogaku': '1,800,000円', 'h-shinsei': '900,000円', 'h-kanryo': '令和9年2月26日'
      },
      received: { 'h-a1': true, 'h-a2': true, 'h-a3': true, 'h-a5': true, 'h-a6': true }
    },
    {
      id: 'shisetsu-ng', typeId: 'sample-shisetsu', label: '施設の使用許可申請：記載漏れのある例', pdf: 'shisetsu-ng',
      values: {
        's-date': '2026/11/2', 's-kubun': '団体', 's-dantai': '架空市民合唱の会', 's-shimei': true, 's-tel': '090-1234-56789',
        's-shisetsu': '多目的ホール', 's-day': '2026/12/31', 's-jikan': '', 's-ninzu': '約80', 's-mokuteki': '定期演奏会',
        's-nyujo': '有', 's-hanbai': '無'
      },
      received: {}
    },
    {
      id: 'shisetsu-ok', typeId: 'sample-shisetsu', label: '施設の使用許可申請：そろっている例', pdf: 'shisetsu-ok',
      values: {
        's-date': '2026/11/2', 's-kubun': '団体', 's-dantai': '架空市民合唱の会', 's-shimei': true, 's-tel': '090-1234-5678',
        's-shisetsu': '多目的ホール', 's-day': '2026/12/20', 's-jikan': '午後', 's-ninzu': '80', 's-mokuteki': '定期演奏会',
        's-nyujo': '有', 's-hanbai': '無'
      },
      received: { 's-a1': true, 's-a2': true }
    },
    {
      id: 'shomei-ng', typeId: 'sample-shomei', label: '証明書の交付申請：記載漏れのある例', pdf: 'shomei-ng',
      values: {
        'c-date': '令和8年11月5日', 'c-shurui': '課税証明書', 'c-nendo': '令和8年度', 'c-tsusu': '2', 'c-mokuteki': '',
        'c-raichou': '代理人', 'c-shimei': true, 'c-jusho': false, 'c-taisho': '昭和60年2月30日', 'c-tel': '03-9876-5432'
      },
      received: { 'c-a1': true, 'c-a3': true }
    },
    {
      id: 'shomei-ok', typeId: 'sample-shomei', label: '証明書の交付申請：そろっている例', pdf: 'shomei-ok',
      values: {
        'c-date': '令和8年11月5日', 'c-shurui': '課税証明書', 'c-nendo': '令和8年度', 'c-tsusu': '2', 'c-mokuteki': '金融機関へ提出',
        'c-raichou': '代理人', 'c-shimei': true, 'c-jusho': true, 'c-taisho': '昭和60年2月28日', 'c-tel': '03-9876-5432'
      },
      received: { 'c-a1': true, 'c-a2': true, 'c-a3': true }
    }
  ];

  return { types: types, cases: cases };
});
