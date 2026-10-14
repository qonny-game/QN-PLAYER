# e2e_lyrics_wide.py — 歌詞の広い表示(波形と1:1)・文字サイズ統一・SPのON/OFFアイコンの確認。ルートで: QN_WAV=... python3 -I md/tools/e2e_lyrics_wide.py [幅]
import sys, os
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
ok = True
def check(n, c, i=""):
    global ok; print(("OK  " if c else "NG  ") + n, i); ok = ok and bool(c)
with QNBrowser(".") as qb:
    pg = qb.new_page(width=W, height=800 if W > 900 else 844)
    qb.goto(pg); qb.add_track(pg, wp); pg.wait_for_timeout(2500)
    nm = pg.evaluate("currentFileName")
    data = [["Line number %d of the test song" % i, 0.5 + i * 0.5] for i in range(14)]
    pg.evaluate("([n,d])=>{document.getElementById('noteTextArea').value=d.map(x=>x[0]).join('\\n');localStorage.setItem('mp3_lyt_'+n, JSON.stringify(d)); QNLyrics.load();}", [nm, data])
    pg.wait_for_timeout(500)
    fs = pg.evaluate("[...document.querySelectorAll('#pcV2Lyrics .qn-lyd-line')].map(e=>parseFloat(getComputedStyle(e).fontSize))")
    check("compact: all lines same font size", len(set(fs)) == 1, fs)
    pg.evaluate("audio.pause(); audio.currentTime=2.2")
    pg.wait_for_timeout(600)
    pg.screenshot(path="../lyw_compact_%d.png" % W)
    h0 = pg.evaluate("document.getElementById('pcV2Lyrics').offsetHeight")
    pg.click("#pcV2Lyrics .qn-lyd-exp"); pg.wait_for_timeout(800)
    r = pg.evaluate("""()=>{const l=document.getElementById('pcV2Lyrics').getBoundingClientRect(), v=document.getElementById('vbarContainer').getBoundingClientRect();
      const rows=[...document.querySelectorAll('.qn-lyd-row')];
      return {lh:l.height, vh:v.height, n:rows.length, fs:[...new Set(rows.map(e=>getComputedStyle(e).fontSize))], cur:(document.querySelector('.qn-lyd-row.is-cur')||{}).textContent, wide:document.getElementById('pcV2Lyrics').classList.contains('is-wide')}}""")
    print(r)
    check("wide: area ~1:1 with the bars", r["wide"] and 0.7 < r["lh"] / r["vh"] < 1.4, r["lh"] / max(r["vh"], 1))
    check("wide: all rows same font size", len(r["fs"]) == 1 and r["n"] == 14, r["fs"])
    check("wide: current row set", bool(r["cur"]), r["cur"])
    pg.screenshot(path="../lyw_wide_%d.png" % W)
    pg.evaluate("audio.currentTime=5.2"); pg.wait_for_timeout(900)
    cur = pg.evaluate("document.querySelector('.qn-lyd-row.is-cur').textContent")
    check("wide: follows seek (5.2s -> line 9)", cur.startswith("Line number 9 "), cur)
    if W <= 900:
        b = pg.evaluate("(()=>{const b=document.getElementById('pcV2FabLyrics'), a=document.getElementById('pcV2FabSetB'); if(!b||!a) return null; return {bx:b.getBoundingClientRect().left, ax:a.getBoundingClientRect().right, on:b.classList.contains('has-point')}})()")
        check("SP: lyrics icon right of B", b and b["bx"] >= b["ax"] - 1, b)
        pg.click("#pcV2FabLyrics"); pg.wait_for_timeout(400)
        check("SP: icon turns lyrics off", pg.evaluate("document.getElementById('pcV2Lyrics').hidden") is True)
        pg.click("#pcV2FabLyrics"); pg.wait_for_timeout(400)
        check("SP: icon turns lyrics on", pg.evaluate("document.getElementById('pcV2Lyrics').hidden") is False)
        pg.screenshot(path="../lyw_sp_after.png")
    pg.click("#pcV2Lyrics .qn-lyd-exp"); pg.wait_for_timeout(500)
    check("collapse back to compact", abs(pg.evaluate("document.getElementById('pcV2Lyrics').offsetHeight") - h0) < 4)
    errs = qb.errors(pg); check("no page errors", not errs, errs)
sys.exit(0 if ok else 1)
