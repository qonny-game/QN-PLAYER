# e2e_v467.py — 停止中のシークタップで再生しない/再生中は続く、Loop/Repeat/クリック音のトースト(日本語表示)。ルートで: QN_WAV=... python3 -I md/tools/e2e_v467.py [幅]
import sys, os
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
ok = True
def check(n, c, i=""):
    global ok; print(("OK  " if c else "NG  ") + n, i); ok = ok and bool(c)
with QNBrowser(".") as qb:
    pg = qb.new_page(width=W, height=800 if W > 900 else 844, lang="ja")
    qb.goto(pg); qb.add_track(pg, wp); pg.wait_for_timeout(2000)
    toast = lambda: pg.evaluate("(document.getElementById('qnAppToast')||{}).textContent")
    tap = lambda x: pg.mouse.click(x[0], x[1])
    pos = pg.evaluate("(()=>{const r=document.querySelector('#vbarRows .vbar').getBoundingClientRect();return [r.left+r.width*0.6, r.top+r.height/2]})()")
    pg.evaluate("audio.pause()"); pg.wait_for_timeout(300)
    t0 = pg.evaluate("audio.currentTime"); tap(pos); pg.wait_for_timeout(500)
    check("paused: tap seeks but does not play", pg.evaluate("audio.paused") is True and abs(pg.evaluate("audio.currentTime") - t0) > 0.5, [t0, pg.evaluate("audio.currentTime")])
    pg.evaluate("audio.play().catch(()=>{})"); pg.wait_for_timeout(400)
    pos2 = pg.evaluate("(()=>{const r=document.querySelector('#vbarRows .vbar').getBoundingClientRect();return [r.left+r.width*0.2, r.top+r.height/2]})()")
    tap(pos2); pg.wait_for_timeout(500)
    check("playing: tap keeps playing", pg.evaluate("audio.paused") is False)
    pg.evaluate("audio.pause()")
    tg = {}
    for name, sel in (("loop", "#loopToggleBtn"), ("repeat", "#allRepeatToggleBtn")):
        pg.evaluate("s => document.querySelector(s).click()", sel); pg.wait_for_timeout(250); tg[name] = toast()
    check("loop toast (ja)", tg["loop"] and tg["loop"].startswith("ループ:"), tg["loop"])
    check("repeat toast (ja)", tg["repeat"] and tg["repeat"].startswith("リピート:"), tg["repeat"])
    if pg.evaluate("!!document.getElementById('pcV2FabClick')"):
        pg.evaluate("document.getElementById('pcV2FabClick').click()"); pg.wait_for_timeout(250)
        check("click toast (ja)", (toast() or "").startswith("クリック音:"), toast())
        pg.evaluate("document.getElementById('pcV2FabSnap').click()"); pg.wait_for_timeout(250)
        check("grid toast (ja)", (toast() or "").startswith("線の表示:"), toast())
    errs = qb.errors(pg); check("no page errors", not errs, errs)
sys.exit(0 if ok else 1)
