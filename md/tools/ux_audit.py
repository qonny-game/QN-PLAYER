#!/usr/bin/env python3
"""UX見直し用の下ごしらえを1回で。画面撮影(PC/SP・全パネル) + 計測(はみ出し・小さいタップ領域・名前の無いボタン・下段バーが各幅で収まるか)。
使い方(プロジェクトのルートで): python3 -I md/tools/ux_audit.py [--wav 音声ファイル] [--out 出力フォルダ]
  --wav 省略時は一時的に作った無音に近いWAVを使う。--out 省略時は ./_ux_audit/ (見終わったら消してよい)
出力: <out>/{pc,sp}_{main,各パネルID}.png と、標準出力の計測結果。結果の見方・判断は md/UX_REVIEW.md。
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qnbrowser import QNBrowser

ap = argparse.ArgumentParser()
ap.add_argument("--wav"); ap.add_argument("--out", default="_ux_audit")
a = ap.parse_args()
out = os.path.abspath(a.out); os.makedirs(out, exist_ok=True)

JS_SMALL = """()=>{const o=[];document.querySelectorAll('button,[role=button],input[type=range],.pcv2-icon-item,a').forEach(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return;const c=getComputedStyle(e);if(c.visibility==='hidden'||c.display==='none')return;if(r.width<32||r.height<32)o.push((e.id||e.className||e.tagName).toString().slice(0,34)+' '+Math.round(r.width)+'x'+Math.round(r.height))});return [...new Set(o)].slice(0,30)}"""
JS_NONAME = """()=>[...document.querySelectorAll('button,[role=button]')].filter(e=>e.getBoundingClientRect().width>0&&!(e.getAttribute('aria-label')||e.title||e.textContent.trim())).map(e=>(e.id||e.className).toString().slice(0,34))"""
JS_BAR = """()=>{const b=document.getElementById('pcV2BottomBar');if(!b)return null;const k=document.getElementById('pcV2BarKey');const q=k?k.getBoundingClientRect():{right:0,width:0};return {keyInView:q.width>0&&q.right<=innerWidth,barScrollsX:b.scrollWidth>b.clientWidth+1,barH:Math.round(b.getBoundingClientRect().height)}}"""
JS_OVER = """()=>({docScrollsX:document.documentElement.scrollWidth>innerWidth+1})"""

with QNBrowser(".") as qb:
    wav = a.wav or qb.wav(seconds=20, name="ux_audit.wav")
    for tag, W, H in (("pc", 1440, 900), ("sp", 390, 844)):
        pg = qb.new_page(width=W, height=H); qb.goto(pg); qb.add_track(pg, wav)
        pg.evaluate("()=>{pins.push({t:3,enabled:true,memo:'Intro',color:null}); pins.push({t:8,enabled:true,memo:'',color:null,locked:true}); if(typeof renderPins==='function')renderPins();}")
        pg.wait_for_timeout(800)
        pg.screenshot(path=f"{out}/{tag}_main.png")
        ids = pg.evaluate("[...document.querySelectorAll('#pcV2IconBar .pcv2-icon-item')].map(e=>e.dataset.panelId).filter(Boolean)")
        for i in ids:
            pg.evaluate("(i)=>document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=\"'+i+'\"]')?.click()", i); pg.wait_for_timeout(600)
            pg.screenshot(path=f"{out}/{tag}_{i}.png")
        print(f"[{tag} {W}x{H}] はみ出し:", pg.evaluate(JS_OVER))
        print(f"[{tag}] 32px未満のタップ領域:", pg.evaluate(JS_SMALL))
        print(f"[{tag}] 名前(aria-label/title/文字)の無いボタン:", pg.evaluate(JS_NONAME))
        print(f"[{tag}] コンソールエラー:", qb.errors(pg))
    for W, H in ((1280, 800), (1366, 768), (1440, 900), (1920, 1080)):
        pg = qb.new_page(width=W, height=H); qb.goto(pg)
        print(f"[PC下段バー {W}]", pg.evaluate(JS_BAR))
print("画像:", out)
