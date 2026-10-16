# e2e_export.py — EXPORTアプリ(書き出し専門ツール)の実処理を確認。ルートで: python3 -I md/tools/e2e_export.py [幅]
# 確認: 読み込み(Libraryに入れない)/ Speed→長さ / Trim / Normalize天井 / WAV・MP3ヘッダ / Libraryから選ぶ / 書き出しをLibraryへ追加 / 複数ZIP。Chromiumでの結果のみ(実機の音は未確認)
import sys, os
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
ok = True
def check(n, c, i=""):
    global ok; print(("OK  " if c else "NG  ") + n, i); ok = ok and bool(c)
with QNBrowser(".") as qb:
    pg = qb.new_page(width=W, height=800 if W > 900 else 844)
    qb.goto(pg)
    wp = qb.wav(seconds=10, name="ex_a.wav"); wp2 = qb.wav(seconds=6, name="ex_b.wav")
    qb.open_app(pg, "export")
    check("export app opens", pg.evaluate("!!document.querySelector('.qn-ex')"))
    n0 = pg.evaluate("playlist.length")
    pg.set_input_files("[data-ex=file]", wp); pg.wait_for_timeout(1500)
    check("file loaded, Library untouched", pg.evaluate("QNExport._items().length") == 1 and pg.evaluate("playlist.length") == n0)
    check("waveform ready", pg.evaluate("document.querySelector('[data-ex=wave]').dataset.state") == "ready", pg.evaluate("document.querySelector('[data-ex=wave]').dataset.state"))
    # 直接処理: Speed 2x → 約半分、Trim
    r = pg.evaluate("""async()=>{const f=QNExport._items()[0].file;const b=await QNExportCore.decode(f);const out={};
      const run=async(o)=>{const r=await QNExportCore.process(b,Object.assign({speed:1,key:0,eq:[0,0,0,0,0,0,0,0,0,0],comp:'off',norm:{mode:'off',target:-18},format:'wav',bits:16,sampleRate:0,mono:false},o));const ab=await r.blob.arrayBuffer();const u=new Uint8Array(ab);return {dur:r.duration,size:r.blob.size,hdr:String.fromCharCode(u[0],u[1],u[2],u[3]),ext:r.ext,sr:r.sampleRate,peak:(()=>{const d=new DataView(ab);let m=0;for(let i=44;i+1<ab.byteLength;i+=2){m=Math.max(m,Math.abs(d.getInt16(i,true)))}return m/32768})()}};
      out.base=await run({});out.fast=await run({speed:2});out.trim=await run({start:2,end:5});out.key=await run({key:5});out.norm=await run({norm:{mode:'peak',target:-18}});out.eq=await run({eq:[6,6,6,0,0,0,0,0,0,-6],comp:'heavy'});out.mp3=await run({format:'mp3',kbps:128});return out}""")
    check("wav header", r["base"]["hdr"] == "RIFF", r["base"])
    check("speed 2x halves length", abs(r["fast"]["dur"] - r["base"]["dur"] / 2) < 0.3, [r["fast"]["dur"], r["base"]["dur"]])
    check("trim 2-5s = 3s", abs(r["trim"]["dur"] - 3) < 0.15, r["trim"]["dur"])
    check("key keeps length", abs(r["key"]["dur"] - r["base"]["dur"]) < 0.3, [r["key"]["dur"], r["base"]["dur"]])
    check("peak normalize reaches ceiling (<=-0.9dB)", 0.85 < r["norm"]["peak"] <= 0.91, r["norm"]["peak"])
    check("eq+comp ran", r["eq"]["size"] > 1000, r["eq"]["size"])
    check("mp3 output", r["mp3"]["ext"] == "mp3" and r["mp3"]["size"] > 1000 and r["mp3"]["size"] < r["base"]["size"], r["mp3"])
    # 新形式(FLAC / OGG Opus / M4A)とヘッダ
    fm = pg.evaluate("""async()=>{const f=QNExport._items()[0].file;const b=await QNExportCore.decode(f);const sup=await QNExportCodecs.supports();const o={sup};
      for(const fmt of ['flac','ogg','m4a']){ if((fmt==='ogg'&&!sup.ogg)||(fmt==='m4a'&&!sup.m4a)){o[fmt]=null;continue}
        const r=await QNExportCore.process(b,{speed:1,key:0,eq:[0,0,0,0,0,0,0,0,0,0],comp:'off',norm:{mode:'off',target:-18},format:fmt,bits:16,kbps:128,sampleRate:0,mono:false,end:4});
        const u=new Uint8Array(await r.blob.arrayBuffer());o[fmt]={ext:r.ext,size:u.length,head:Array.from(u.subarray(0,8)).map(x=>String.fromCharCode(x)).join(''),dur:r.duration}}
      return o}""")
    check("flac output", fm["flac"] and fm["flac"]["head"].startswith("fLaC") and abs(fm["flac"]["dur"] - 4) < 0.1, fm["flac"])
    if fm["sup"]["ogg"]: check("ogg opus output", fm["ogg"]["head"].startswith("OggS") and abs(fm["ogg"]["dur"] - 4) < 0.1, fm["ogg"])
    else: print("(ogg: AudioEncoder opus not supported here, skipped)")
    if fm["sup"]["m4a"]: check("m4a output", fm["m4a"]["ext"] == "m4a" and fm["m4a"]["size"] > 1000, fm["m4a"])
    else: print("(m4a: AudioEncoder aac not supported in this browser, skipped)")
    # 分割: 波形クリックで分割点→Split→範囲ごとに名前と範囲
    pg.evaluate("QNExport.select(0)"); pg.wait_for_timeout(1200)
    bx = pg.locator("[data-ex=wave]").bounding_box()
    pg.mouse.click(bx["x"] + bx["width"] * 0.4, bx["y"] + bx["height"] / 2); pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('[data-ex=splitBtn]').click()"); pg.wait_for_timeout(300)
    segs = pg.evaluate("QNExport._items()[0].segs.map(g=>[g.name,g.start,g.end])")
    check("split makes 2 parts", len(segs) == 2 and abs(segs[0][2] - 4) < 0.3 and abs(segs[1][1] - segs[0][2]) < 0.01, segs)
    check("parts listed in UI", pg.evaluate("document.querySelectorAll('.qn-ex-seg').length") == 2)
    # 一括指定(All parts)=全ファイル・全範囲、範囲ごとの設定、スイッチ
    pg.set_input_files("[data-ex=file]", wp2); pg.wait_for_timeout(1200)
    check("two files listed below", pg.evaluate("document.querySelectorAll('.qn-ex-file').length") == 2)
    pg.locator("[data-ex=bulk] .qn-ex-chip").first.click(); pg.wait_for_timeout(250)
    check("bulk popup opens", pg.evaluate("!!document.querySelector('.qn-quickpop')"))
    pg.locator(".qn-quickpop .qn-stepper-btn[data-d='1']").first.click(); pg.wait_for_timeout(200)
    fm_ = pg.evaluate("QNExport._items().flatMap(it=>it.segs.map(g=>g.o.format))")
    check("bulk applies to every part of every file", len(fm_) == 3 and len(set(fm_)) == 1 and fm_[0] != "wav", fm_)
    pg.mouse.click(5, 5); pg.wait_for_timeout(150)
    pg.locator(".qn-ex-file").first.locator(".qn-ex-seg").nth(1).locator(".qn-ex-chip").first.click(); pg.wait_for_timeout(250)
    pg.locator(".qn-quickpop .qn-stepper-btn[data-d='-1']").first.click(); pg.wait_for_timeout(150)
    fm_ = pg.evaluate("QNExport._items()[0].segs.map(g=>g.o.format)")
    check("part setting is independent", fm_[0] != fm_[1], fm_)
    pg.mouse.click(5, 5); pg.wait_for_timeout(150)
    # Speed/Key/EQ は1つのポップアップ
    pg.locator(".qn-ex-file").first.locator(".qn-ex-seg").nth(1).locator(".qn-ex-chip").nth(1).click(); pg.wait_for_timeout(250)
    check("tone popup has speed, key and eq", pg.evaluate("(()=>{const p=document.querySelector('.qn-quickpop');return !!p && p.querySelectorAll('.qn-set-row').length>=3 && !!p.querySelector('.qn-ex-eq')})()"))
    pg.mouse.click(5, 5); pg.wait_for_timeout(150)
    # スイッチ(Mono / Normalize / Comp / Library)はポップアップなしでON/OFF
    sws = pg.locator(".qn-ex-file").first.locator(".qn-ex-seg").nth(1).locator(".qn-ex-sw .qn-set-switch")
    sws.nth(0).click(); sws.nth(1).click(); sws.nth(2).click(); pg.wait_for_timeout(150)
    o_ = pg.evaluate("(()=>{const o=QNExport._items()[0].segs[1].o;return [o.mono,o.normOn,o.compOn,!!document.querySelector('.qn-quickpop')]})()")
    check("switches toggle without popup", o_ == [True, True, True, False], o_)
    pg.locator(".qn-ex-file").first.locator(".qn-ex-seg").nth(1).locator(".qn-ex-pico").nth(1).click(); pg.wait_for_timeout(200)
    check("norm icon opens detail popup", pg.evaluate("!!document.querySelector('.qn-quickpop')"))
    pg.mouse.click(5, 5); pg.wait_for_timeout(150)
    pg.evaluate("QNExport._items().forEach(it=>it.segs.forEach(g=>{g.o.format='wav';g.o.mono=false;g.o.normOn=false;g.o.compOn=false}))")
    pg.evaluate("(()=>{const i=document.querySelectorAll('.qn-ex-segname');i[0].value='Intro';i[0].dispatchEvent(new Event('input',{bubbles:true}));i[1].value='Main';i[1].dispatchEvent(new Event('input',{bubbles:true}))})()")
    pg.evaluate("(()=>{const s=QNExport._state();s.download=false;s.suffix='';QNExport._items()[0].segs.forEach(g=>{g.o.lib=true;g.o.format='flac'})})()")
    n1 = pg.evaluate("playlist.length")
    pg.evaluate("QNExport.run()"); pg.wait_for_timeout(8000)
    names = pg.evaluate("playlist.slice(%d).map(t=>t.name)" % n1)
    check("split export: 2 files named by part", sorted(names) == ["Intro.flac", "Main.flac"], names)
    pg.evaluate("(()=>{QNExport._items()[0].segs.forEach(g=>{g.o.format='wav'})})()")
    # UIから書き出し→Library追加(ダウンロードなし)
    pg.evaluate("(()=>{const s=QNExport._state();s.download=false;s.suffix='_x';QNExport._items().forEach(it=>it.segs.forEach(g=>{g.o.lib=true;g.o.format='wav'}))})()")
    pg.evaluate("document.querySelector('[data-ex=runBtn]').disabled=false")
    pg.evaluate("QNExport.run()"); pg.wait_for_timeout(5000)
    check("export added to Library (suffix applied)", pg.evaluate("playlist.map(t=>t.name)").count("Intro_x.wav") == 1 and "Main_x.wav" in pg.evaluate("playlist.map(t=>t.name)"), pg.evaluate("playlist.map(t=>t.name)"))
    # Libraryから選ぶ
    pg.evaluate("QNExport.addFromLibrary([0])"); pg.wait_for_timeout(500)
    check("added from Library", pg.evaluate("QNExport._items().length") == 3)
    # 複数ZIP(ダウンロード)
    pg.set_input_files("[data-ex=file]", wp2); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{const s=QNExport._state();s.download=true;QNExport._items().forEach(it=>it.segs.forEach(g=>{g.o.lib=false}))})()")
    with pg.expect_download(timeout=30000) as dl:
        pg.evaluate("QNExport.run()")
    d = dl.value
    check("multi export -> zip", d.suggested_filename.endswith(".zip"), d.suggested_filename)
    # 画面が崩れていないか(SPはパネル切替)
    pg.evaluate("window.QNApps.open('export')"); pg.wait_for_timeout(300)
    qb.shot(pg, "export_app_%d" % W)
    errs = qb.errors(pg); check("no page errors", not errs, errs)
sys.exit(0 if ok else 1)
