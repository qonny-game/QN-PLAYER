# e2e_features.py — 機能の表示ON/OFF(qn-features.js)の確認。
#   既定(公開版): tab/stem/rec/chords=OFF, beats=ON(拍・小節の線、クリック音、吸着、Beatsパネル)
#   qn_dev_features="-beats": 拍・小節も隠す(以前の公開版と同じ) / "all": 全部ON
# 使い方(ルートで): python3 -I md/tools/e2e_features.py
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
      return { ids: [...new Set(ids)], hasTab: !!window.QNTab, hasStem: !!window.QNStem,
        togClick: !!document.getElementById('pcV2FabClick'), togSnap: !!document.getElementById('pcV2FabSnap'),
        view: typeof QNBars !== 'undefined' ? QNBars.getViewMode() : '?', grid: typeof QNChords !== 'undefined' ? QNChords.getGridMode() : '?', click: typeof QNChords !== 'undefined' ? QNChords.getClick() : '?',
        snap: typeof QNPinSnap !== 'undefined' ? [QNPinSnap.get('bar'), QNPinSnap.get('beat')] : '?' };
    }""")

def settings_labels(qb, pg):
    try:
        qb.open_panel(pg, "Settings", 600)
        pg.evaluate("(()=>{const b=document.querySelector('[data-panel-id=general]'); if(b) b.click();})()"); pg.wait_for_timeout(500)
    except Exception as e:
        print("  (Settingsを開けず:", str(e)[:60], ")")
    return pg.evaluate("[...document.querySelectorAll('#pcV2PanelBody .qn-set-label, #pcV2PanelBody .qn-set-title, #pcV2PanelBody h3')].map(e=>e.textContent.trim())")

CHORD_ONLY = ("View", "Chord detail", "Chord key", "Chord candidates", "Chord beat snap", "Tab sensitivity")
BEAT_ROWS = ("Grid", "Grid click", "Click offset", "Marker snap to bars", "Marker snap to beats", "Grid follows markers")
STORED = {"qn_bar_view": "chord", "qn_grid": "bar", "qn_grid_click": "1", "qn_pin_snap_bar": "1", "qn_pin_snap_beat": "1"}

with QNBrowser(".") as qb:
    for size, (w, h) in (("PC", (1280, 800)), ("SP", (390, 844))):
        # --- 既定(公開版): 拍・小節ON、コード/Tab/Stem/RecはOFF ---
        pg = qb.new_page(width=w, height=h, storage=dict(STORED))
        qb.goto(pg); qb.add_track(pg); pg.wait_for_timeout(800)
        r = probe(pg)
        check(size + " default: icon bar has Beats panel but no Stem/Rec/Tab", "chords" in r["ids"] and not [i for i in r["ids"] if i in ("stem", "rec", "tab")], r["ids"])
        check(size + " default: QNTab/QNStem not created", not r["hasTab"] and not r["hasStem"])
        check(size + " default: click/snap toggles present", r["togClick"] and r["togSnap"])
        check(size + " default: chord view ignored, grid/click/snap kept", r["view"] == "wave" and r["grid"] == "bar" and r["click"] is True and r["snap"] == [True, True], [r["view"], r["grid"], r["click"], r["snap"]])
        labels = settings_labels(qb, pg)
        bad = [l[:30] for l in labels if any(l.startswith(n) for n in CHORD_ONLY) or l == "Tab"]
        has = [n for n in BEAT_ROWS if any(l.startswith(n) for l in labels)]
        check(size + " default: no chord/Tab rows, beat rows present", any(l.startswith("Bar length") for l in labels) and not bad and len(has) == len(BEAT_ROWS), (bad, has))
        errs = qb.errors(pg)
        check(size + " default: no page errors", not errs, errs)
        pg.context.close()
        # --- -beats: 拍・小節も隠す(以前の公開版と同じ) ---
        pg = qb.new_page(width=w, height=h, storage=dict(STORED, qn_dev_features="-beats"))
        qb.goto(pg); qb.add_track(pg); pg.wait_for_timeout(800)
        r = probe(pg)
        check(size + " -beats: no Chords/Beats/Stem/Rec/Tab panel", not [i for i in r["ids"] if i in ("chords", "stem", "rec", "tab")], r["ids"])
        check(size + " -beats: no toggles, stored settings ignored", not r["togClick"] and not r["togSnap"] and r["view"] == "wave" and r["grid"] == "off" and r["click"] is False and r["snap"] == [False, False], [r["view"], r["grid"], r["click"], r["snap"]])
        errs = qb.errors(pg)
        check(size + " -beats: no page errors", not errs, errs)
        pg.context.close()
        # --- 開発用スイッチ all: 全部戻る ---
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
    # --- ガイド ---
    for dev, label in ((None, "default"), ("-beats", "-beats"), ("all", "dev=all")):
        pg = qb.new_page(width=1280, height=800, storage={"qn_dev_features": dev} if dev else {})
        pg.goto(qb.base_url + "guide/operations.html"); pg.wait_for_timeout(500)
        vis = pg.evaluate("['chords','stem','rec','tab'].map(i => { const h = document.getElementById(i); return !!h && h.offsetParent !== null; })")
        want = {"default": [True, False, False, False], "-beats": [False] * 4, "dev=all": [True] * 4}[label]
        check("guide operations (%s): chords/stem/rec/tab sections visible=%s" % (label, want), vis == want, vis)
        # 既定ではコードの説明(表示を切り替える)は隠れ、拍・小節の説明は出る
        subs = pg.evaluate("['表示を切り替える','拍・小節線とクリック音'].map(t => { const h=[...document.querySelectorAll('h3')].find(e=>e.textContent.trim()===t); return !!h && h.offsetParent !== null; })")
        want_s = {"default": [False, True], "-beats": [False, False], "dev=all": [True, True]}[label]
        check("guide operations (%s): h3 chords/beats visible=%s" % (label, want_s), subs == want_s, subs)
        pg.goto(qb.base_url + "guide/screen.html"); pg.wait_for_timeout(400)
        rows = pg.evaluate("[...document.querySelectorAll('tr[data-feature]')].filter(r => r.offsetParent !== null).length")
        want_r = {"default": 1, "-beats": 0, "dev=all": 4}[label]
        check("guide screen (%s): side-menu rows visible=%s" % (label, rows), rows == want_r, rows)
        pg.context.close()
sys.exit(0 if ok else 1)
