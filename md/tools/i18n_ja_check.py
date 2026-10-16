# i18n_ja_check.py — 日本語表示で英語のまま残っている文言を洗い出す(辞書 qn-i18n-ja.js の追加漏れ)
# 使い方(ルートで): python3 -I md/tools/i18n_ja_check.py [--static]
# 英語のままでよい物(KEEP_SEL: ボタンのラベル/パネル見出し、DATA_SEL: マーカープリセット/ユーザーデータ)は除く。
# DOM: qn_lang=ja で各パネルと設定の各ページを開き、英字だけの文言(英単語2語以上、または8文字以上)を列挙。
# --static: ソース中の toast("…") / 英語の文言リテラルが辞書に在るかを確認(動的に出る物の漏れ検出)。
import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qnbrowser import QNBrowser

JS = r"""
() => {
  const KEEP = ".top-controls-btn-label, .pcv2-icon-item, #pcV2SpDock, .pcv2-panel-header-title, #pcV2PanelFab, .pcv2-fab-addgroup, .pcv2-fab, .qn-set-fit, .qn-set-slider-val, .playlist-act-btn, .pin-act-btn, .playlist-del-tile, .pin-del-tile, .qn-yt-bbtn, .qn-pt-bbtn, .qn-tn-bbtn, .qn-tn-bstep-mid, .qn-ex-btn, .qn-ex-panel-header, .qn-ex-name, .qn-ex-suffix input, .qn-yt-seekpop-btn, .pcv2-anchor-tab, .mobile-tab-btn, .qn-flyout-item, .qn-yt-fab-folder, .panel-fab-btn, .qn-mic-pill, #splashLogo, .av-toggle-btn-label, #noteTextFullscreenBtn, .pcv2-bar-page, .qn-yt-panel-header, .qn-tn-panel-header, .qn-pt-panel-header, .pin-memo-preset-chip:not(.qn-qp-act), .pin-memo, .pin-memo-text, .playlist-editable-display, .playlist-editable-field, .qn-yt-item-title, .qn-pt-rec-title, .qn-marker-preset-colors-list, .vbar-label-memo, .pin-info, .qn-set-sec-title, .qn-stepper-val";
  const eng = s => { s = s.trim(); if (!/[A-Za-z]{2}/.test(s) || /[぀-ヿ㐀-鿿]/.test(s)) return false; const words = s.match(/[A-Za-z]{2,}/g) || []; return words.length >= 2 || s.length >= 8; };
  const out = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName) || p.closest(KEEP)) continue;
    if (p.offsetParent === null && getComputedStyle(p).position !== "fixed") continue;
    if (eng(n.nodeValue)) out.add('[text] ' + n.nodeValue.trim().slice(0, 90));
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
    if (el.matches('.pin-info, .vbar-label-memo, .pin-memo, .pin-memo-text, .qn-yt-item-title, .qn-pt-rec-title')) continue;
    for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v && eng(v)) out.add('[' + a + '] ' + v.slice(0, 90)); }
  }
  return Array.from(out);
}
"""

OK_RE = re.compile(r"^\[(?:text|title|aria-label)\] (?:[\d.]+ Hz|QNPLAYER v[\d.]+|.+\.(?:wav|mp3)|Sensitivity|Recordings|Auto start|MIC OFF)$")  # 英語のままでよい物(単位・製品名・曲名・アプリのボタン名)

def dom():
    found = {}
    with QNBrowser(".") as qb:
        for W in (1280, 390):
            pg = qb.new_page(width=W, height=800 if W > 900 else 844, lang="ja")
            qb.goto(pg); qb.add_track(pg); pg.wait_for_timeout(800)
            def grab(where):
                for s in pg.evaluate(JS): found.setdefault(s, "%d %s" % (W, where))
            grab("初期")
            for lab in qb.icon_labels(pg):
                if not lab: continue
                try:
                    qb.open_panel(pg, lab, wait_ms=500); grab("パネル " + lab)
                    if lab == "Settings":  # 設定の各ページ(一般/バックアップ/インポート/カラー/キーボード/転送/ガイド)。各ページの中のサブ画面も1段だけ開く
                        ids = pg.evaluate("[...document.querySelectorAll('#pcV2PanelBody .qn-set-list-item')].map(e => e.dataset.panelId)")
                        for pid in ids:
                            try:
                                qb.open_panel(pg, "Settings", 300)
                                pg.evaluate("id => { const b = document.querySelector('#pcV2PanelBody .qn-set-list-item[data-panel-id=\"' + id + '\"]'); if (b) b.click(); }", pid); pg.wait_for_timeout(400); grab("設定 " + pid)
                                for k in range(6):  # ページ内のボタン(Back/More等)は押さず、折りたたみ(details/summary)だけ開く
                                    pg.evaluate("() => document.querySelectorAll('#pcV2PanelBody details:not([open])').forEach(d => d.open = true)")
                                grab("設定 " + pid + " (展開)")
                            except Exception: pass
                except Exception: pass
            for sel in ("#playToggle, #pcV2DockPlay", "#setABtn, #pcV2FabSetA", "#loopToggleBtn, #pcV2DockLoop", "#pcV2SkipBackBtn", "#pcV2FabClick", "#pcV2FabSnap", "#addPinBtn, #pcV2DockAdd"):
                try:
                    box = pg.locator(sel).first.bounding_box()
                    if not box: continue
                    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(200)
                    grab("長押し " + sel.split(",")[0]); pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
                except Exception: pass
            for app in ("tuner", "pitch", "export"):
                try:
                    qb.open_app(pg, app); grab("アプリ " + app)
                    if app == "export":
                        for lab in ("Tone", "Output"):
                            pg.evaluate("(l)=>{const e=[...document.querySelectorAll('.pcv2-icon-item')].find(x=>x.innerText.trim().startsWith(l)&&x.offsetParent);e&&e.click()}", lab); pg.wait_for_timeout(400); grab("EXPORT " + lab)
                except Exception: pass
            pg.context.close()
    return found

def static():
    # ソース中の英語リテラル(label:/hint:/title:/placeholder:/textContent=/toast()が、辞書(DICT/RULES)に有るかを確認。どちらにも無ければ日本語表示で英語のまま出る
    src = open("JS/qn-i18n-ja.js", encoding="utf-8").read() + open("JS/qn-i18n-apps.js", encoding="utf-8").read() if os.path.exists("JS/qn-i18n-apps.js") else open("JS/qn-i18n-ja.js", encoding="utf-8").read()
    keys = {k.replace('\\"', '"') for k in re.findall(r'"((?:[^"\\]|\\.)+)"\s*:', src)}
    rules = []
    for m in re.finditer(r"\[/(.+?)/g?,\s*\"", src):
        try: rules.append(re.compile(m.group(1).replace("(?=", "(?=")))
        except re.error: pass
    pat = re.compile(r'(?:\b(?:label|hint|title|placeholder|text|aria-label)\s*:|\.textContent\s*=|\btoast\(|setAttribute\("(?:title|aria-label)",)\s*"((?:[^"\\]|\\.)+)"')
    miss = {}
    for f in sorted(os.listdir("JS")):
        if not f.endswith(".js") or f.startswith("qn-i18n") or f in ("jszip.min.js", "lame_min.js"): continue
        t = open("JS/" + f, encoding="utf-8").read()
        for m in pat.finditer(t):
            s_ = m.group(1)
            if re.search(r"[぀-ヿ㐀-鿿]", s_) or "\\" in s_ or len(re.findall(r"[A-Za-z]{2,}", s_)) < 2 and len(s_) < 9: continue
            if s_ in keys or s_.strip() in keys or any(r.search(s_) for r in rules): continue
            miss.setdefault(s_, f)
    return miss

if "--static" in sys.argv:
    m = static()
    for s, f in sorted(m.items(), key=lambda x: x[1]): print("%-22s %s" % (f, s))
    print("辞書に無い英語の文言: %d 件" % len(m)); sys.exit(1 if m else 0)
found = {k: v for k, v in dom().items() if not OK_RE.match(k)}
for s, w in sorted(found.items(), key=lambda x: x[1]): print("%-20s %s" % (w, s))
print("英語のまま残っている文言: %d 件" % len(found)); sys.exit(1 if found else 0)
