import sys, os, json
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
with QNBrowser(".") as qb:
    pg = qb.new_page(width=W, height=800 if W > 900 else 844)
    qb.goto(pg); qb.add_track(pg, wp); pg.wait_for_timeout(2500)
    nm = pg.evaluate("currentFileName")
    print("name", nm)
    data = [["First line of the song", 1.0], ["Second line comes here", 2.5], ["Third line follows after", 4.0], ["Fourth and last line", 5.5]]
    pg.evaluate("([n,d])=>{document.getElementById('noteTextArea').value=d.map(x=>x[0]).join('\\n');localStorage.setItem('mp3_lyt_'+n, JSON.stringify(d)); QNLyrics.load();}", [nm, data])
    pg.wait_for_timeout(500)
    snap = lambda: pg.evaluate("[...document.querySelectorAll('#pcV2Lyrics .qn-lyd-line')].map(e=>e.getAttribute('data-r')+':'+e.textContent.slice(0,6)).join(' | ')")
    print("start:", snap(), "hidden:", pg.evaluate("document.getElementById('pcV2Lyrics').hidden"))
    pg.evaluate("audio.currentTime=0.5; audio.play().catch(()=>{})"); pg.wait_for_timeout(700)
    print("pre:", snap())
    pg.evaluate("audio.currentTime=0.95"); pg.wait_for_timeout(900)   # 1.0 を跨ぐ(シーク→再生で進む)
    print("after 1st:", snap())
    for i in range(6):
        pg.wait_for_timeout(180)
        r = pg.evaluate("[...document.querySelectorAll('#pcV2Lyrics .qn-lyd-line')].map(e=>{const c=getComputedStyle(e);return e.getAttribute('data-r')+' y='+new DOMMatrix(c.transform).m42.toFixed(1)+' op='+(+c.opacity).toFixed(2)+' fs='+parseFloat(c.fontSize).toFixed(1)}).join(' | ')")
        if i in (0, 2): pg.screenshot(path="lyrics_mid%d_%d.png" % (W, i), clip={"x": 450 if W > 900 else 0, "y": 380 if W > 900 else 120, "width": 800 if W > 900 else 390, "height": 160})
        print(" t+%dms:" % ((i + 1) * 180), r) if i < 4 else None
    pg.evaluate("audio.currentTime=2.45"); pg.wait_for_timeout(120)
    pg.screenshot(path="lyrics_before%d.png" % W, clip={"x": 450 if W > 900 else 0, "y": 380 if W > 900 else 120, "width": 800 if W > 900 else 390, "height": 160})
    pg.wait_for_timeout(1500)
    print("after 2nd:", snap())
    pg.screenshot(path="lyrics_after%d.png" % W)
    print("errors", qb.errors(pg))
