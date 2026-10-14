# e2e_snapclick.py — 吸着ボタンのループ(小節+拍→小節→off)と、クリック音/吸着ボタンの長押しポップアップの確認。ルートで: QN_WAV=... python3 -I md/tools/e2e_snapclick.py [幅]
import sys, os
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
ok = True
def check(n, c, i=""):
    global ok; print(("OK  " if c else "NG  ") + n, i); ok = ok and bool(c)
st = "[QNPinSnap.get('bar'), QNPinSnap.get('beat')]"
with QNBrowser(".") as qb:
    pg = qb.new_page(width=W, height=800 if W > 900 else 844, storage={"qn_pin_snap_bar": "0", "qn_pin_snap_beat": "0"})
    qb.goto(pg); qb.add_track(pg, wp); pg.wait_for_timeout(2000)
    check("start: snap off", pg.evaluate(st) == [False, False])
    seq = []
    for _ in range(4):
        pg.click("#pcV2FabSnap"); pg.wait_for_timeout(200); seq.append(pg.evaluate(st))
    check("tap loop: both -> bars -> off -> both", seq == [[True, True], [True, False], [False, False], [True, True]], seq)
    pg.click("#pcV2FabSnap"); pg.wait_for_timeout(200)
    check("badge shows Bar in bars-only state", pg.evaluate("document.getElementById('pcV2FabSnap').getAttribute('data-state')") == "Bars")
    pg.screenshot(path="../snap_bar.png", clip={"x": 0, "y": 560, "width": W, "height": 120} if W < 900 else None)
    # 長押し
    box = pg.locator("#pcV2FabSnap").bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.mouse.down(); pg.wait_for_timeout(700)
    open1 = pg.evaluate("!!document.querySelector('.qn-quickpop')")
    pg.mouse.up(); pg.wait_for_timeout(200)
    check("snap long-press opens popup (no tap action)", open1 and pg.evaluate(st) == [True, False], pg.evaluate(st))
    labels = pg.evaluate("[...document.querySelectorAll('.qn-quickpop .qn-set-label span')].map(e=>e.textContent)")
    check("popup rows: bars / beats", labels == ["Snap to bars", "Snap to beats"], labels)
    pg.click(".qn-quickpop .qn-set-switch >> nth=1"); pg.wait_for_timeout(200)
    check("beat switch works independently", pg.evaluate(st) == [True, True], pg.evaluate(st))
    pg.screenshot(path="../snap_pop.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("button state follows popup", pg.evaluate("document.getElementById('pcV2FabSnap').getAttribute('data-state')") == "Bars + beats")
    # クリック音の長押し
    box = pg.locator("#pcV2FabClick").bounding_box()
    before = pg.evaluate("QNClickOffset.get()"); clk = pg.evaluate("QNChords.getClick()")
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(200)
    labels = pg.evaluate("[...document.querySelectorAll('.qn-quickpop .qn-set-label span')].map(e=>e.textContent)")
    check("click long-press opens Click offset, click state unchanged", labels == ["Click offset"] and pg.evaluate("QNChords.getClick()") == clk, labels)
    pg.click(".qn-quickpop .qn-stepper-btn[data-d='1']"); pg.wait_for_timeout(200)
    after = pg.evaluate("QNClickOffset.get()")
    check("offset stepper changes value", after != before, [before, after])
    pg.screenshot(path="../click_pop.png")
    errs = qb.errors(pg); check("no page errors", not errs, errs)
sys.exit(0 if ok else 1)
