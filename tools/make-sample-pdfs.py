#!/usr/bin/env python3
"""見本の申請書PDF（文字を選べるPDF）を作る。

使い方（リポジトリの直下で）:
  node tools/dump-samples.js | python3 tools/make-sample-pdfs.py

必要なもの: Python の reportlab、IPAゴシック（ipag.ttf）。
作るもの: samples/*.pdf、js/sample-pdfs.js（ボタン1つで試すための埋め込み版）、
          test/fixtures/cid-font.pdf（フォントを埋め込まないPDF。テスト用）
"""
import base64, json, os, sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATHS = ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf']

# 記載の有無の欄に、PDF上で書く架空の値
PRESENCE_TEXT = {
    '事業者の名称': '株式会社架空製作所',
    '代表者の氏名': '代表取締役　架空 一郎',
    '所在地': '架空県架空市本町一丁目2番3号',
    '申請者の氏名': '架空 花子',
    '窓口に来た方の氏名': '見本 次郎',
    '窓口に来た方の住所': '架空県架空市中央二丁目4番5号',
}


def register_font():
    for p in FONT_PATHS:
        if os.path.exists(p):
            pdfmetrics.registerFont(TTFont('IPAG', p))
            return 'IPAG'
    raise SystemExit('IPAゴシックが見つかりません')


def draw_form(c, font, t, case):
    W, H = A4
    left, right = 50, W - 50
    y = H - 60
    c.setFont(font, 16)
    title = t['name'].replace('（見本）', '')
    c.drawCentredString(W / 2, y, title + ' 申請書')
    y -= 20
    c.setFont(font, 9)
    c.drawCentredString(W / 2, y, '（見本・架空の申請書です。実在の様式ではありません）')
    y -= 30
    label_w = 170
    row_h = 26
    values = case['values']
    for f in t['fields']:
        v = values.get(f['id'], '')
        if f['format'] == 'presence':
            text = PRESENCE_TEXT.get(f['name'], '記載あり') if v is True else ''
        elif f['format'] == 'choice':
            text = '　'.join(('■' if o == v else '□') + o for o in f['options'])
        else:
            text = v or ''
        c.rect(left, y - row_h + 8, label_w, row_h, stroke=1, fill=0)
        c.rect(left + label_w, y - row_h + 8, right - left - label_w, row_h, stroke=1, fill=0)
        c.setFont(font, 10.5)
        c.drawString(left + 6, y - 9, f['name'] + ('（必須）' if f.get('required') else ''))
        c.setFont(font, 11)
        c.drawString(left + label_w + 8, y - 9, text)
        y -= row_h
    y -= 20
    c.setFont(font, 11)
    c.drawString(left, y, '添付書類（添付したものに■）')
    y -= 20
    for a in t['attachments']:
        mark = '■' if case['received'].get(a['id']) else '□'
        c.drawString(left + 12, y, mark + ' ' + a['name'])
        y -= 18
    c.setFont(font, 8.5)
    c.drawString(left, 50, 'この申請書は、申請書類 記載漏れ・添付漏れ確認ツールの見本です。')


def make_pdf(path, font, t, case):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(t['name'] + '（見本）')
    c.setAuthor('')
    c.setCreator('')
    c.setProducer('')
    draw_form(c, font, t, case)
    c.showPage()
    c.save()


def main():
    data = json.load(sys.stdin)
    font = register_font()
    types = {t['id']: t for t in data['types']}
    os.makedirs(os.path.join(ROOT, 'samples'), exist_ok=True)
    embedded = {}
    for case in data['cases']:
        t = types[case['typeId']]
        path = os.path.join(ROOT, 'samples', case['pdf'] + '.pdf')
        make_pdf(path, font, t, case)
        with open(path, 'rb') as fp:
            embedded[case['pdf']] = base64.b64encode(fp.read()).decode('ascii')
        print('作成:', os.path.relpath(path, ROOT))
    with open(os.path.join(ROOT, 'js', 'sample-pdfs.js'), 'w', encoding='utf-8') as fp:
        fp.write('/* 見本の申請書PDF（架空）。tools/make-sample-pdfs.py で作成。ファイルを直接開いたときもボタン1つで試せるよう埋め込んだもの。 */\n')
        fp.write('window.SFC_SAMPLE_PDFS = ' + json.dumps(embedded) + ';\n')
    # フォントを埋め込まない（CMapが要る）PDF。取り込みのテスト用
    pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
    cid_case = next(c for c in data['cases'] if c['id'] == 'shomei-ok')
    path = os.path.join(ROOT, 'test', 'fixtures', 'cid-font.pdf')
    make_pdf(path, 'HeiseiKakuGo-W5', types[cid_case['typeId']], cid_case)
    print('作成:', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()
