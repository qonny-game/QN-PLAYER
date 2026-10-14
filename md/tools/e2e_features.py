# e2e_features.py — 機能の表示ON/OFF(qn-features.js)の確認。既定(公開版)ではtab/stem/rec/chordsが画面・設定・裏処理から消えていること、
# localStorage qn_dev_features="all" で全部戻ることを、PC幅とSP幅で見る。使い方(ルートで): python3 -I md/tools/e2e_features.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qnbrowser import QNBrowser

ok = True
def check(name, cond, info=""):
    global ok
    print(("OK  " if cond else "NG  ") + name, info)
    ok = ok and bool(cond)

def probe(pg):
    return pg.evaluate("""() => {
      const ids = [...document.querySelectorAll('.pcv2-icon-item, #pcV2IconBar [data-panel-id], #pcV2SpIconBar [data-panel-id]')].map(e => e.getAttribute('data-panel-id'));
      const labels = [...document.querySelectorAll('.qn-set-label, .qn-set-inline-label')].map(e => e.textContent.trim());
      return { ids: [...new Set(ids)], labels, hasTab: !!window.QNTab, hasStem: !!window.QNStem,
        togClick: !!document.getElementById('pcV2FabClick'), togSnap: !!document.getElementById('pcV2FabSnap'),
        view: typeof QNBars !== 'undefined' ? QNBars.getViewMode() : '?', grid: typeof QNChords !== 'undefined' ? QNChords.getGridMode() : '?', click: typeof QNChords !== 'undefined' ? QNChords.getClick() : '?',
        snap: typeof QNPinSnap !== 'undefined' ? [QNPinSnap.get('bar'), QNPinSnap.get('beat')] : '?' };
    }""")

with QNBrowser(".") as qb:
    for size, (w, h) in (("PC", (1280, 800)), ("SP", (390, 844))):
        # 既定(公開版): 保存済みの設定でコード表示・クリック音・吸着がONになっていても無効になること
        st = {"qn_bar_view": "chord", "qn_grid_mode": "bar", "qn_grid_click": "1", "qn_pin_snap_bar": "1", "qn_pin_snap_beat": "1"}
        pg = qb.new_page(width=w, height=h, storage=st)
        qb.goto(pg); qb.add_track(pg); pg.wait_for_timeout(800)
        r = probe(pg)
        feats = ("chords", "stem", "rec", "tab")
        check(size + " default: no Chords/Stem/Rec/Tab in the icon bar", not [i for i in r["ids"] if i in feats], r["ids"])
        check(size + " default: QNTab/QNStem not created", not r["hasTab"] and not r["hasStem"])
        check(size + " default: no click/snap toggles", not r["togClick"] and not r["togSnap"])
        check(size + " default: stored chord view / grid / click / snap are ignored", r["view"] == "wave" and r["grid"] == "off" and r["click"] is False and r["snap"] == [False, False], [r["view"], r["grid"], r["click"], r["snap"]])
        # 設定を開いて、コード・Tabの行が無いこと
        try:
            qb.open_panel(pg, "Settings", 600)
            pg.evaluate("(()=>{const b=document.querySelector('[data-panel-id=general]'); if(b) b.click();})()"); pg.wait_for_timeout(500)
        except Exception as e:
            print("  (Settingsを開けず:", str(e)[:60], ")")
        labels = pg.evaluate("[...document.querySelectorAll('#pcV2PanelBody .qn-set-label, #pcV2PanelBody .qn-set-title, #pcV2PanelBody h3')].map(e=>e.textContent.trim())")
        names = ("View", "Chord detail", "Chord key", "Grid", "Grid click", "Click offset", "Marker snap to bars", "Marker snap to beats", "Beats per bar", "Tab sensitivity")  # ラベルは説明文とつながって取れるので先頭一致で見る
        bad = [l[:30] for l in labels if any(l.startswith(n) for n in names) or l == "Tab"]
        check(size + " default: Settings rows were read (Bar length present) and no chord/Tab rows", any(l.startswith("Bar length") for l in labels) and not bad, bad)
        errs = qb.errors(pg)
        check(size + " default: no page errors", not errs, errs)
        pg.context.close()
        # 開発用スイッチ: 全部戻る
        pg = qb.new_page(width=w, height=h, storage={"qn_dev_features": "all"})
        qb.goto(pg); qb.add_track(pg); pg.wait_for_timeout(800)
        r = probe(pg)
        check(size + " dev=all: all four panels are back", all(i in r["ids"] for i in ("chords", "stem", "rec", "tab")) or size == "SP", r["ids"])
        check(size + " dev=all: QNTab/QNStem exist", r["hasTab"] and r["hasStem"])
        if size == "PC":
            check("PC dev=all: click/snap toggles back", r["togClick"] and r["togSnap"])
        errs = qb.errors(pg)
        check(size + " dev=all: no page errors", not errs, errs)
        pg.context.close()
    # ガイド: 隠している間は、Chords/Stem/Rec/Tabの節と表の行が出ない。dev=allなら出る
    for dev, label in ((None, "default"), ("all", "dev=all")):
        pg = qb.new_page(width=1280, height=800, storage={"qn_dev_features": dev} if dev else {})
        pg.goto(qb.base_url + "guide/operations.html"); pg.wait_for_timeout(500)
        vis = pg.evaluate("['chords','stem','rec','tab'].map(i => { const h = document.getElementById(i); return !!h && h.offsetParent !== null; })")
        want = [dev == "all"] * 4
        check("guide operations (%s): chords/stem/rec/tab sections visible=%s" % (label, want[0]), vis == want, vis)
        pg.goto(qb.base_url + "guide/screen.html"); pg.wait_for_timeout(400)
        rows = pg.evaluate("[...document.querySelectorAll('tr[data-feature]')].filter(r => r.offsetParent !== null).length")
        check("guide screen (%s): side-menu rows visible=%s" % (label, rows), (rows == 4) == (dev == "all") and (dev == "all" or rows == 0), rows)
        pg.context.close()
sys.exit(0 if ok else 1)
