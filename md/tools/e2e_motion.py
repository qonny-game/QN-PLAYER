# Animations設定(QNMotion)の確認: OSが「動きを減らす」でも、Settings > Animations=On なら サイドバー/歌詞の動きが出る
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
CLICK = "(p)=>document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id='+p+']').click()"
ANIM = "document.getAnimations().map(a=>a.animationName||'').filter(n=>n.startsWith('qn')).length"
with QNBrowser(".") as qb:
    pg = qb.new_page(width=1280, height=800); qb.goto(pg); qb.add_track(pg, wp)
    pg.emulate_media(reduced_motion="reduce")
    pg.evaluate(CLICK, "markers"); pg.wait_for_timeout(60)
    print("reduce + auto: animations =", pg.evaluate(ANIM), "(0が正しい)")
    pg.evaluate("QNMotion.set('on')"); pg.wait_for_timeout(300)
    pg.evaluate(CLICK, "text"); pg.wait_for_timeout(60)
    print("reduce + on  : animations =", pg.evaluate(ANIM), "(1以上が正しい)")
    pg.evaluate(CLICK, "settings"); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=settings]').click()")
    pg.evaluate("document.querySelector('.qn-set-list-item[data-panel-id=general]')?.click()"); pg.wait_for_timeout(500)
    print("settings row:", pg.evaluate("[...document.querySelectorAll('#pcV2PanelBody .qn-set-label span')].map(e=>e.textContent).filter(t=>/Animations|アニメ/.test(t))"))
    print("errors", qb.errors(pg))
