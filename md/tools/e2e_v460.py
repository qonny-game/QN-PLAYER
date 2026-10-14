import sys, os
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
with QNBrowser(".") as qb:
    pg = qb.new_page(width=1280, height=800); qb.goto(pg); qb.add_track(pg, wp)
    # 1 速度バー ダブルタップ(フォーカス中)リセット
    pg.evaluate("setSpeed(1.5)"); pg.wait_for_timeout(300)
    bs = pg.locator("#pcV2BarSpeed"); bs.focus()
    print("speed before", bs.input_value())
    bs.dblclick(); pg.wait_for_timeout(400)
    print("speed after dblclick", bs.input_value(), pg.evaluate("currentSpeed"))
    pg.evaluate("setKeySemitones(3)"); pg.wait_for_timeout(300)
    bk = pg.locator("#pcV2BarKey"); bk.focus(); bk.dblclick(); pg.wait_for_timeout(400)
    print("key after", bk.input_value(), pg.evaluate("currentKeySemitones"))
    # 3 背景
    pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=color]').click()"); pg.wait_for_timeout(600)
    print("bg swatches", pg.evaluate("document.querySelectorAll('#pcV2PanelBody .qn-bg-swatch').length"))
    pg.locator("#pcV2PanelBody .qn-bg-swatch[data-qn-bgopt=beige]").click(); pg.wait_for_timeout(300)
    print("bg", pg.evaluate("document.documentElement.getAttribute('data-qn-bg')"), pg.evaluate("document.querySelector('.qn-bg-swatch.active')?.dataset.qnBgopt"))
    pg.screenshot(path="color_bg.png")
    pg.locator("#pcV2PanelBody .qn-bg-swatch[data-qn-bgopt=dark]").click()
    pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=settings]').click()"); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=general]')?.click()"); 
    # settings no longer has Background
    print("settings has bg row:", pg.evaluate("[...document.querySelectorAll('#pcV2GeneralBody *')].some(e=>e.textContent.trim()==='Background')"))
    # 2 カギ
    pg.evaluate("()=>{pins.push({t:5,enabled:true,memo:'memo',color:null,locked:true}); pins.push({t:12,enabled:true,memo:'',color:null,locked:true}); renderPins&&renderPins();}"); pg.wait_for_timeout(600)
    pg.screenshot(path="lock_pc.png", clip={"x":300,"y":60,"width":900,"height":300})
    print("lock rect", pg.evaluate("[...document.querySelectorAll('#pcV2WaveArea .vbar-label')].map(l=>{const a=l.getBoundingClientRect(),n=l.querySelector('.vbar-label-num').getBoundingClientRect(),k=l.querySelector('.vbar-label-lock')?.getBoundingClientRect();return [Math.round(a.height),Math.round(n.left),k&&Math.round(k.right)].join('/')})"))
    print("errors", qb.errors(pg))
