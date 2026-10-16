// qn-app-export.js — EXPORTアプリ(書き出し専門ツール)。QNApps.register({id:"export"})。処理本体はqn-export-core.js(DOMなし)。
// 読み込んだファイルはLibraryに追加せずに書き出せる(メモリ上だけ)。Libraryの曲も選べる。書き出した結果をLibraryに追加するスイッチもある。保存キー: qn_export_settings
// 音声は端末の中だけで処理する(サーバーへ送らない)。1ファイルを複数の範囲(Parts)に分け、範囲ごとに 名前/形式/ビットレート/サンプルレート/Normalize/Comp/Speed/Key/EQ/Mono/Library追加 を持つ。上段の「All parts」で一括指定。複数ならZIPにまとめられる。
// スタイルはCSS/style-export-app.cssの.qn-ex*。UI部品はQNSettingsUI(PLAYERの設定行と共通)。
(function () {
  "use strict";

  var core = window.QNExportCore;
  var KEY = "qn_export_settings", COLLAPSE_KEY = "qn_export_panel_collapsed";
  var EXPORT_ICON = '<path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>';
  var ICON = {
    speed: '<path d=\"M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z\"/>',
    key: '<path d=\"M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\"/>',
    norm: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/>',
    comp: '<path d="M4 14h4v6H4zm6-8h4v14h-4zm6 4h4v10h-4z"/>',
    mono: '<path d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z\"/>',
    edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
    tone: '<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>',
    out: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>',
    play: '<path d="M8 5v14l11-7z"/>', split: '<path d="M11 3h2v18h-2zM4 8l4 4-4 4zM20 8v8l-4-4z"/>', stop: '<path d="M6 6h12v12H6z"/>',
    add: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>', lib: '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>'
  };

  // ---------- 設定 ----------
  // 1つの範囲(Part)が持つ書き出し設定 o。S.def は「All parts」(一括指定)の表示値で、新しい範囲の初期値にもなる
  var DEFO = { format: "wav", bits: 16, kbps: 192, sr: 0, norm: "peak", normOn: false, normTarget: -18, comp: "medium", compOn: false, speedOn: false, speed: 1, keyOn: false, key: 0, eqOn: false, eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], eqPreset: "flat", mono: false, lib: false };
  var S = { def: JSON.parse(JSON.stringify(DEFO)), download: true, suffix: "_export" };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || "null");
    if (sv && typeof sv === "object") {
      if (typeof sv.download === "boolean") S.download = sv.download;
      if (typeof sv.suffix === "string") S.suffix = sv.suffix;
      if (sv.def && typeof sv.def === "object") Object.keys(DEFO).forEach(function (k) { if (typeof sv.def[k] === typeof DEFO[k]) S.def[k] = sv.def[k]; });
      if (S.def.norm !== "peak" && S.def.norm !== "loudness") S.def.norm = "peak"; if (["light", "medium", "heavy"].indexOf(S.def.comp) < 0) S.def.comp = "medium";
      if (!Array.isArray(S.def.eq) || S.def.eq.length !== 10) S.def.eq = DEFO.eq.slice(); else S.def.eq = S.def.eq.slice();
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ def: S.def, download: S.download, suffix: S.suffix })); } catch (e) {} }
  function newOpts(src) { var o = JSON.parse(JSON.stringify(src || S.def)); o.lib = false; return o; }

  // ---------- 状態 ----------
  var items = [], activeIt = null, nextId = 1, root = null, refs = {}, shown = false, busy = false, abortFlag = false;
  var loadQ = Promise.resolve(), prevBufCache = { id: 0, buf: null };
  var prevCtx = null, prevSrc = null, previewing = false, prevIt = null, strips = [], bulkStrip = null;
  var codecSup = { ogg: false, m4a: false };
  var KB = { mp3: [128, 192, 256, 320], ogg: [64, 96, 128, 160, 192], m4a: [96, 128, 160, 192, 256] }, KDEF = { mp3: 192, ogg: 128, m4a: 160 };
  var KEYS = []; for (var kk = -12; kk <= 12; kk++) KEYS.push(kk);
  var EQ_NAMES = { flat: "Flat", bass: "Bass", vocal: "Vocal", treble: "Treble", vshape: "V-shape", custom: "Custom" };
  function fmtList() { var l = ["wav", "mp3", "flac"]; if (codecSup.ogg) l.push("ogg"); if (codecSup.m4a) l.push("m4a"); return l; }
  function fmtName(v) { return v === "ogg" ? "OGG Opus" : v.toUpperCase(); }

  function toast(t) { if (window.QNApps && QNApps.toast) QNApps.toast(t); }
  function haptic() { if (typeof hapticTap === "function") { try { hapticTap(); } catch (e) {} } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtT(t) { if (!isFinite(t)) return "--"; var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
  function baseName(n) { return String(n || "audio").replace(/\.[^.]+$/, ""); }
  function safeName(n) { return String(n).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "audio"; }
  function cur() { return activeIt; }
  function sg(it) { it = it || activeIt; return it && it.segs.length ? it.segs[Math.min(it.ss, it.segs.length - 1)] : null; }
  function segEnd(it, g) { return g.end > 0 ? g.end : (it.dur || 0); }
  function fixEnds(it) { if (!it.dur) return; it.segs.forEach(function (g) { if (!(g.end > 0) || g.end > it.dur) g.end = it.dur; if (g.start > g.end - 0.1) g.start = Math.max(0, g.end - 0.1); }); }
  var X_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  var CHEV_SVG = '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';

  // ---------- 設定の変更。t = "bulk"(全曲) / {fb:曲}(その曲の全範囲) / 範囲g ----------
  function optsOf(t) { return t === "bulk" ? S.def : t.fb ? t.fb.def : t.o; }
  function setOpts(t, patch) {
    var keys = Object.keys(patch);
    function put(o) { keys.forEach(function (k) { o[k] = Array.isArray(patch[k]) ? patch[k].slice() : patch[k]; }); }
    if (t === "bulk") { put(S.def); items.forEach(function (it) { put(it.def); it.segs.forEach(function (g) { put(g.o); }); }); }
    else if (t.fb) { put(t.fb.def); t.fb.segs.forEach(function (g) { put(g.o); }); }
    else put(t.o);
    if (t === "bulk") save();
    updStrips(); refreshBar();
  }
  function fixKbps(o) { if (KB[o.format] && KB[o.format].indexOf(o.kbps) < 0) return KDEF[o.format]; return o.kbps; }

  // ---------- 曲(ファイル)の追加・削除 ----------
  function newSeg(it, name) { return { name: safeName(name), start: 0, end: 0, on: true, o: newOpts(it.def) }; }
  function addBlob(file, source, label) {
    var it = { id: nextId++, name: label || file.name, file: file, source: source, dur: null, pk: null, state: "loading", segs: [], ss: 0, cursor: null, on: true, folded: false, def: newOpts(S.def) };
    it.segs.push(newSeg(it, baseName(label || file.name)));
    items.push(it);
    buildFileUI(it); refs.files.appendChild(it.ui.blk);
    loadQ = loadQ.then(function () { return loadItem(it); }); // 読み込みは1曲ずつ(メモリを抑える)
    return it;
  }
  function addFiles(files) {
    var ok = 0;
    Array.prototype.forEach.call(files, function (f) {
      var isMedia = typeof isSupportedMediaFile === "function" ? isSupportedMediaFile(f) : /^(audio|video)\//.test(f.type) || /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|aif|aiff|opus)$/i.test(f.name);
      if (!isMedia) return;
      addBlob(f, "file"); ok++;
    });
    if (!ok) { toast("No supported audio files"); return; }
    if (!activeIt) setActive(items[0]);
    syncEmpty(); refreshBar();
  }
  function addFromLibrary(idxs) {
    idxs.forEach(function (i) {
      var t = playlist[i]; if (!t || !t.file) return;
      var it = addBlob(t.file, "library", t.title || t.name); it.name = t.name; it.label = t.title || t.name; it.ui.nameEl.textContent = it.label;
    });
    if (!activeIt && items.length) setActive(items[0]);
    syncEmpty(); refreshBar();
  }
  function removeItem(it) {
    if (busy) return;
    var i = items.indexOf(it); if (i < 0) return;
    if (prevIt === it) stopPreview();
    items.splice(i, 1); it.ui.blk.remove(); strips = strips.filter(function (st) { return st.it !== it; });
    if (activeIt === it) setActive(items[Math.min(i, items.length - 1)] || null);
    syncEmpty(); refreshBar();
  }
  function syncEmpty() { refs.empty.hidden = items.length > 0; refs.listbox.hidden = items.length > 0; refs.allbox.hidden = !items.length; }
  function setActive(it) {
    activeIt = it || null;
    items.forEach(function (x) { x.ui.blk.classList.toggle("is-active", x === activeIt); });
  }

  // ---------- 波形の読み込み(デコード→ピークだけ残して、音声データは捨てる) ----------
  async function loadItem(it) {
    if (!items.includes(it)) return;
    it.ui.wave.setAttribute("data-state", "loading"); it.ui.msg.textContent = "Loading…";
    try {
      var buf = await core.decode(it.file);
      it.dur = buf.duration; it.pk = core.peaks(buf, 600); it.state = "ready";
      fixEnds(it); buf = null;
      it.ui.wave.setAttribute("data-state", "ready"); it.ui.msg.textContent = "";
      renderHead(it); renderSegs(it); drawWave(it);
    } catch (e) {
      it.state = "error"; it.bad = true;
      it.ui.wave.setAttribute("data-state", "error"); it.ui.msg.textContent = "Could not read this file";
      renderHead(it); refreshBar();
    }
  }
  async function getBuf(it) { // プレビュー用(1曲分だけ覚えておく)
    if (prevBufCache.id === it.id && prevBufCache.buf) return prevBufCache.buf;
    var b = await core.decode(it.file); prevBufCache = { id: it.id, buf: b }; return b;
  }

  // ---------- 曲ごとのブロック(ヘッダ/波形/一括/範囲) ----------
  function buildFileUI(it) {
    var blk = el("div", "qn-ex-file"), hd = el("div", "qn-ex-file-head"), ui = it.ui = { blk: blk };
    var fold = el("button", "qn-ex-fold"); fold.type = "button"; fold.setAttribute("data-act", "fold"); fold.innerHTML = CHEV_SVG; fold.title = "Fold or unfold";
    var cb = el("button", "qn-ex-check is-on"); cb.type = "button"; cb.setAttribute("data-act", "check"); cb.title = "Include this file in export"; ui.check = cb;
    ui.nameEl = el("span", "qn-ex-name", it.label || it.name); ui.src = el("span", "qn-ex-src", it.source === "library" ? "Library" : "File"); ui.dur = el("span", "qn-ex-dur", "--");
    var rm = el("button", "qn-ex-x"); rm.type = "button"; rm.setAttribute("data-act", "remove"); rm.title = "Remove from this list"; rm.innerHTML = X_SVG;
    [fold, cb, ui.nameEl, ui.src, ui.dur, rm].forEach(function (n) { hd.appendChild(n); });
    var body = el("div", "qn-ex-file-body"); ui.body = body; ui.fold = fold;
    var wave = el("div", "qn-ex-wave"); wave.setAttribute("data-state", "loading"); ui.wave = wave;
    ui.canvas = el("canvas"); ui.msg = el("span", "qn-ex-wave-msg", "Loading…");
    ui.hStart = el("div", "qn-ex-handle is-start"); ui.hStart.innerHTML = "<i></i>"; ui.hStart.hidden = true;
    ui.hEnd = el("div", "qn-ex-handle is-end"); ui.hEnd.innerHTML = "<i></i>"; ui.hEnd.hidden = true;
    [ui.canvas, ui.msg, ui.hStart, ui.hEnd].forEach(function (n) { wave.appendChild(n); });
    var info = el("div", "qn-ex-wave-info"); ui.trimInfo = el("span");
    var bt = el("span", "qn-ex-wave-btns");
    bt.innerHTML = '<button type="button" data-act="split" class="qn-ex-btn" title="Split the selected part at the white line. Click the waveform to place it"><svg viewBox="0 0 24 24">' + ICON.split + '</svg><span>Split</span></button><button type="button" data-act="preview" class="qn-ex-btn" title="Hear the result of the current settings (up to 20 seconds)"><svg viewBox="0 0 24 24">' + ICON.play + '</svg><span>Preview</span></button>';
    ui.prevBtn = bt.querySelector('[data-act="preview"]'); ui.splitBtn = bt.querySelector('[data-act="split"]');
    info.appendChild(ui.trimInfo); info.appendChild(bt);
    var bulk = el("div", "qn-ex-bulk"); bulk.appendChild(el("span", "qn-ex-bulk-l", "All parts in this file"));
    var fbs = buildStrip({ fb: it }, it); strips.push(fbs); bulk.appendChild(fbs.el);
    ui.segs = el("div", "qn-ex-segs");
    [wave, info, bulk, ui.segs].forEach(function (n) { body.appendChild(n); });
    blk.appendChild(hd); blk.appendChild(body);
    bindHandles(it);
    renderSegs(it); renderHead(it);
  }
  function renderHead(it) {
    var ui = it.ui;
    ui.check.classList.toggle("is-on", it.on); ui.blk.classList.toggle("is-off", !it.on);
    ui.blk.classList.toggle("is-folded", !!it.folded); ui.fold.setAttribute("aria-expanded", it.folded ? "false" : "true");
    ui.dur.textContent = it.segs.length > 1 ? it.segs.length + " parts" : (it.dur ? fmtT(it.dur) : "--");
  }
  function foldItem(it) { it.folded = !it.folded; renderHead(it); if (!it.folded) requestAnimationFrame(function () { drawWave(it); }); }

  function drawWave(it) {
    it = it || activeIt; if (!it || !it.ui) return;
    var cv = it.ui.canvas; if (!cv) return;
    var w = cv.clientWidth, h = cv.clientHeight || 120;
    if (!w) { positionHandles(it); return; } // 折りたたみ中は描かない
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var cx = cv.getContext("2d"); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
    if (!it.pk || !it.dur) { positionHandles(it); return; }
    var cs = getComputedStyle(root.querySelector(".qn-ex")), c1 = cs.getPropertyValue("--qn-ex-wave").trim() || "#4f8cff", c0 = cs.getPropertyValue("--qn-ex-dim").trim() || "rgba(255,255,255,.18)";
    var n = it.pk.length, dur = it.dur, cs_ = sg(it);
    for (var i = 0; i < n; i++) {
      var x = i / n * w, t = i / n * dur, a = Math.max(1, it.pk[i] * (h / 2 - 2)), st = 0;
      for (var k = 0; k < it.segs.length; k++) { var g = it.segs[k]; if (t >= g.start && t <= segEnd(it, g)) { st = g === cs_ ? 2 : 1; if (g === cs_) break; } }
      cx.globalAlpha = st === 2 ? 1 : st === 1 ? 0.5 : 1;
      cx.fillStyle = st ? c1 : c0;
      cx.fillRect(x, h / 2 - a, Math.max(1, w / n - 0.5), a * 2);
    }
    cx.globalAlpha = 1; cx.fillStyle = c1;
    it.segs.forEach(function (g) { if (g === cs_) return; cx.fillRect(g.start / dur * w, 0, 1, h); cx.fillRect(segEnd(it, g) / dur * w - 1, 0, 1, h); });
    if (it.cursor != null) { cx.fillStyle = "#fff"; cx.globalAlpha = 0.85; cx.fillRect(it.cursor / dur * w - 0.5, 0, 1, h); cx.globalAlpha = 1; }
    positionHandles(it);
  }
  function drawAll() { items.forEach(function (it) { if (!it.folded) drawWave(it); }); }
  function positionHandles(it) {
    var g = sg(it), ok = it.dur && g, ui = it.ui;
    ui.hStart.hidden = ui.hEnd.hidden = !ok;
    if (!ok) { ui.trimInfo.textContent = ""; return; }
    var e = segEnd(it, g);
    ui.hStart.style.left = (g.start / it.dur * 100) + "%"; ui.hEnd.style.left = (e / it.dur * 100) + "%";
    ui.trimInfo.textContent = fmtT(g.start) + " – " + fmtT(e) + "  (" + fmtT(e - g.start) + ")";
  }
  function setTrim(it, which, v) {
    var g = sg(it); if (!it.dur || !g) return;
    v = Math.max(0, Math.min(it.dur, Math.round(v * 10) / 10));
    if (which === "start") g.start = Math.min(v, segEnd(it, g) - 0.1); else g.end = Math.max(v, g.start + 0.1);
    if (g.start < 0) g.start = 0;
    drawWave(it); updRanges(it);
  }
  function bindHandles(it) {
    var ui = it.ui;
    ui.wave.addEventListener("pointerdown", function (e) {
      if (!it.dur || e.target.closest(".qn-ex-handle")) return;
      var r = ui.wave.getBoundingClientRect();
      setActive(it);
      it.cursor = Math.max(0, Math.min(it.dur, (e.clientX - r.left) / r.width * it.dur));
      for (var k = 0; k < it.segs.length; k++) { var g = it.segs[k]; if (it.cursor >= g.start && it.cursor <= segEnd(it, g)) { it.ss = k; break; } }
      drawWave(it); markSel(it);
    });
    [["start", ui.hStart], ["end", ui.hEnd]].forEach(function (p) {
      var which = p[0], h = p[1], drag = false;
      h.addEventListener("pointerdown", function (e) { if (!it.dur) return; drag = true; setActive(it); h.setPointerCapture(e.pointerId); e.preventDefault(); });
      h.addEventListener("pointermove", function (e) { if (!drag || !it.dur) return; var r = ui.wave.getBoundingClientRect(); setTrim(it, which, (e.clientX - r.left) / r.width * it.dur); });
      var up = function () { drag = false; };
      h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
  }
  function markSel(it) { it.ui.segs.querySelectorAll(".qn-ex-seg").forEach(function (r, i) { r.classList.toggle("is-sel", i === it.ss); }); }

  // ---------- 分割(長い曲を複数の範囲に分ける) ----------
  function splitAtCursor(it) {
    var g = sg(it); if (!it || !it.dur || !g) { toast("Add a file first"); return; }
    var c = it.cursor, e = segEnd(it, g);
    if (c == null) { toast("Click the waveform to set the split point"); return; }
    c = Math.round(c * 10) / 10;
    if (c <= g.start + 0.2 || c >= e - 0.2) { toast("Pick a point inside the selected part"); return; }
    var base = safeName(baseName(it.label || it.name));
    var ng = { name: "", start: c, end: e, on: true, o: JSON.parse(JSON.stringify(g.o)) };
    g.end = c;
    var idx = it.segs.indexOf(g);
    it.segs.splice(idx + 1, 0, ng);
    var def = function (k) { return base + "_" + k; };
    if (it.segs.length === 2 && g.name === base) g.name = def(1);
    ng.name = def(it.segs.length);
    var used = {}; it.segs.forEach(function (x) { if (x !== ng) used[x.name] = 1; });
    var k2 = it.segs.length; while (used[ng.name]) ng.name = def(++k2);
    it.ss = idx + 1; haptic();
    drawWave(it); renderHead(it); renderSegs(it); refreshBar();
  }
  function removeSeg(it, i) {
    if (it.segs.length < 2) return;
    var g = it.segs[i], prev = it.segs[i - 1], next = it.segs[i + 1];
    if (prev && Math.abs(segEnd(it, prev) - g.start) < 0.15) prev.end = segEnd(it, g);
    else if (next && Math.abs(next.start - segEnd(it, g)) < 0.15) next.start = g.start;
    it.segs.splice(i, 1); it.ss = Math.max(0, Math.min(it.ss, it.segs.length - 1));
    if (it.segs.length === 1 && it.segs[0].name.match(/_1$/)) it.segs[0].name = it.segs[0].name.replace(/_1$/, "");
    drawWave(it); renderHead(it); renderSegs(it); refreshBar();
  }

  // ---------- 設定帯(ボタン2つ+アイコンの下のスイッチ) ----------
  function fmtBtnText(o) {
    var lossless = o.format === "wav" || o.format === "flac";
    return fmtName(o.format) + " · " + (lossless ? (o.format === "wav" && o.bits === 32 ? "32-bit float" : o.bits + "-bit") : o.kbps + " kbps") + " · " + (o.sr === 0 ? "Orig" : (o.sr / 1000) + " kHz");
  }
  function toneBtnText(o) {
    var a = []; if (o.speedOn) a.push(o.speed.toFixed(2).replace(/0$/, "") + "x"); if (o.keyOn) a.push((o.key > 0 ? "+" : "") + o.key); if (o.eqOn) a.push("EQ " + (EQ_NAMES[o.eqPreset] || ""));
    return a.length ? a.join(" · ") : "Speed · Key · EQ";
  }
  function popRows(kind, t) {
    var o = function () { return optsOf(t); };
    var stepper = function (label, hint, values, get, set, fmt, extra) { var r = { label: label, hint: hint, type: "stepper", values: function () { return typeof values === "function" ? values() : values; }, get: get, set: set, fmt: fmt || String }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; };
    if (kind === "out") return { title: t === "bulk" ? "Output (all parts)" : "Output", rows: [
      stepper("Format", "", fmtList, function () { return o().format; }, function (v) { var p = { format: v }; p.kbps = fixKbps({ format: v, kbps: o().kbps }); setOpts(t, p); }, fmtName),
      stepper("Bit depth", "", function () { return o().format === "flac" ? [16, 24] : [16, 24, 32]; }, function () { return o().format === "flac" && o().bits === 32 ? 24 : o().bits; }, function (v) { setOpts(t, { bits: v }); }, function (v) { return v === 32 ? "32-bit float" : v + "-bit"; }, { hiddenWhen: function () { return o().format !== "wav" && o().format !== "flac"; } }),
      stepper("Bitrate", "", function () { return KB[o().format] || KB.mp3; }, function () { return o().kbps; }, function (v) { setOpts(t, { kbps: v }); }, function (v) { return v + " kbps"; }, { hiddenWhen: function () { return !KB[o().format]; } }),
      stepper("Sample rate", "Original keeps the file's rate", [0, 44100, 48000], function () { return o().sr; }, function (v) { setOpts(t, { sr: v }); }, function (v) { return v === 0 ? "Original" : (v / 1000) + " kHz"; })
    ] };
    if (kind === "norm") return { title: "Normalize", rows: [
      stepper("Mode", "Peak: raise to just below full scale. Loudness: match the average level", ["peak", "loudness"], function () { return o().norm; }, function (v) { setOpts(t, { norm: v }); }, function (v) { return v === "peak" ? "Peak" : "Loudness"; }),
      stepper("Target level", "", core.NORM_TARGETS, function () { return o().normTarget; }, function (v) { setOpts(t, { normTarget: v }); }, function (v) { return v + " dB"; }, { hiddenWhen: function () { return o().norm !== "loudness"; } })
    ] };
    if (kind === "comp") return { title: "Compressor", rows: [
      stepper("Amount", "Evens out loud and quiet parts", ["light", "medium", "heavy"], function () { return o().comp; }, function (v) { setOpts(t, { comp: v }); }, function (v) { return v === "light" ? "Light" : v === "medium" ? "Medium" : "Heavy"; })
    ] };
    if (kind === "tone") return { title: "Speed / Key / EQ", build: function () {
      var box = el("div"), sliders = [];
      var ui = QNSettingsUI.build([{ title: "", rows: [
        { label: "Speed", hint: "Changes the tempo without changing the pitch", type: "range", min: 0.5, max: 2, step: 0.01, dec: 2, unit: "x", mark: 1, markLabel: "1.00", get: function () { return o().speed; }, set: function (v) { setOpts(t, { speed: Math.round(v * 100) / 100, speedOn: Math.abs(v - 1) > 0.004 }); } },
        stepper("Key", "Shifts the pitch in semitones without changing the tempo", KEYS, function () { return o().key; }, function (v) { setOpts(t, { key: v, keyOn: v !== 0 }); }, function (v) { return v > 0 ? "+" + v : String(v); }),
        stepper("EQ", "", ["flat", "bass", "vocal", "treble", "vshape", "custom"], function () { return o().eqPreset; }, function (v) { if (v !== "custom") { setOpts(t, { eq: core.EQ_PRESETS[v].slice(), eqPreset: v, eqOn: v !== "flat" }); syncSl(); } }, function (v) { return EQ_NAMES[v] || v; })
      ] }]);
      var bands = el("div", "qn-ex-eq");
      core.EQ_FREQS.forEach(function (f, i) {
        var c = el("div", "qn-ex-eq-col"), g = el("span", "qn-ex-eq-g"), inp = el("input"); inp.type = "range"; inp.min = -15; inp.max = 15; inp.step = 1; inp.className = "qn-ex-eq-r"; inp.setAttribute("aria-label", (f >= 1000 ? f / 1000 + "k" : f) + " Hz");
        var fl = el("span", "qn-ex-eq-f", f >= 1000 ? (f / 1000) + "k" : String(f));
        inp.addEventListener("input", function () { var e = o().eq.slice(); e[i] = +inp.value; setOpts(t, { eq: e, eqPreset: matchPreset(e), eqOn: e.some(function (x) { return x !== 0; }) }); syncSl(); ui.sync(); });
        inp.addEventListener("dblclick", function () { inp.value = 0; inp.dispatchEvent(new Event("input")); });
        c.appendChild(g); c.appendChild(inp); c.appendChild(fl); bands.appendChild(c); sliders.push({ inp: inp, g: g });
      });
      function syncSl() { var e = o().eq; sliders.forEach(function (c, i) { c.inp.value = e[i]; c.g.textContent = (e[i] > 0 ? "+" : "") + e[i]; c.inp.style.setProperty("--p", ((e[i] + 15) / 30 * 100) + "%"); }); }
      box.appendChild(ui.el); box.appendChild(bands); syncSl();
      return box;
    } };
    return null;
  }
  function matchPreset(e) { var k = Object.keys(core.EQ_PRESETS); for (var i = 0; i < k.length; i++) if (core.EQ_PRESETS[k[i]].every(function (v, j) { return v === e[j]; })) return k[i]; return "custom"; }
  function openPop(anchor, kind, t) { var d = popRows(kind, t); if (d && window.QNQuickPop) QNQuickPop.show(anchor, d); }

  // アイコンの下のスイッチでON/OFF(ポップアップ不要)。pop付きは、アイコンを押すと詳細(強さ・モードなど)のポップアップ
  var SWITCHES = [
    { id: "mono", label: "Mono", icon: ICON.mono, on: "mono", title: "Mix both channels into one" },
    { id: "norm", label: "Normalize", icon: ICON.norm, on: "normOn", pop: "norm", title: "Normalize the level. Tap the icon to choose the mode" },
    { id: "comp", label: "Comp", icon: ICON.comp, on: "compOn", pop: "comp", title: "Compressor. Tap the icon to choose the amount" },
    { id: "lib", label: "Library", icon: ICON.lib, on: "lib", title: "Add the result to the Library" }
  ];
  function buildStrip(t, it) {
    var wrap = el("div", "qn-ex-strip" + (t === "bulk" ? " is-bulk" : "")), main = el("div", "qn-ex-main"), icons = el("div", "qn-ex-icons"), sws = {};
    var fb = el("button", "qn-ex-chip"); fb.type = "button"; fb.title = "Format, bit depth or bitrate, and sample rate"; fb.addEventListener("click", function () { haptic(); openPop(fb, "out", t); });
    var tb = el("button", "qn-ex-chip"); tb.type = "button"; tb.title = "Speed, key and equalizer"; tb.addEventListener("click", function () { haptic(); openPop(tb, "tone", t); });
    main.appendChild(fb); main.appendChild(tb);
    SWITCHES.forEach(function (d) {
      var col = el("div", "qn-ex-sw"), ib = el("button", "qn-ex-pico"); ib.type = "button"; ib.title = d.title;
      ib.innerHTML = '<svg viewBox="0 0 24 24">' + d.icon + '</svg><span class="qn-ex-pico-l">' + d.label + '</span>';
      if (d.pop) ib.setAttribute("data-pop", d.pop);
      var sw = el("button", "qn-set-switch"); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", d.label); sw.appendChild(document.createElement("span"));
      function toggle() { haptic(); var p = {}; p[d.on] = !optsOf(t)[d.on]; setOpts(t, p); }
      sw.addEventListener("click", toggle);
      ib.addEventListener("click", function () { if (d.pop) { haptic(); openPop(ib, d.pop, t); } else toggle(); });
      col.appendChild(ib); col.appendChild(sw); icons.appendChild(col); sws[d.id] = { sw: sw, ib: ib };
    });
    wrap.appendChild(main); wrap.appendChild(icons);
    var st = { el: wrap, t: t, it: it || null, upd: function () {
      var o = optsOf(t);
      fb.textContent = fmtBtnText(o); tb.textContent = toneBtnText(o);
      tb.classList.toggle("is-on", !!(o.speedOn || o.keyOn || o.eqOn));
      SWITCHES.forEach(function (d) { var on = !!o[d.on], x = sws[d.id]; x.sw.classList.toggle("is-on", on); x.sw.setAttribute("aria-checked", on ? "true" : "false"); x.ib.classList.toggle("is-on", on); });
    } };
    st.upd();
    return st;
  }
  function updStrips() { strips.forEach(function (s) { s.upd(); }); if (bulkStrip) bulkStrip.upd(); }
  function renderSegs(it) {
    var ui = it.ui, ae = document.activeElement;
    if (ae && ae.getAttribute && ae.getAttribute("data-act") === "segname" && ui.segs.contains(ae)) { updRanges(it); return; } // 名前の入力中は作り直さない
    ui.segs.textContent = ""; strips = strips.filter(function (st) { return st.it !== it || (st.t && st.t.fb); });
    it.segs.forEach(function (g, i) {
      var row = el("div", "qn-ex-seg" + (i === it.ss ? " is-sel" : "") + (g.on ? "" : " is-off")); row.setAttribute("data-i", i);
      var top = el("div", "qn-ex-seg-top");
      var sc = el("button", "qn-ex-check" + (g.on ? " is-on" : "")); sc.type = "button"; sc.setAttribute("data-act", "segcheck"); sc.title = "Include in export";
      var inp = el("input", "qn-ex-segname"); inp.type = "text"; inp.value = g.name; inp.maxLength = 80; inp.setAttribute("aria-label", "File name"); inp.setAttribute("data-act", "segname");
      var rg = el("span", "qn-ex-segrange", fmtT(g.start) + " – " + fmtT(segEnd(it, g)));
      var x = el("button", "qn-ex-x"); x.type = "button"; x.setAttribute("data-act", "segremove"); x.title = "Remove this part"; x.disabled = it.segs.length < 2; x.innerHTML = X_SVG;
      top.appendChild(sc); top.appendChild(inp); top.appendChild(rg); top.appendChild(x);
      var st = buildStrip(g, it); strips.push(st);
      row.appendChild(top); row.appendChild(st.el); ui.segs.appendChild(row);
    });
    ui.splitBtn.disabled = !it.dur;
  }
  function updRanges(it) { var rs = it.ui.segs.querySelectorAll(".qn-ex-segrange"); it.segs.forEach(function (g, i) { if (rs[i]) rs[i].textContent = fmtT(g.start) + " – " + fmtT(segEnd(it, g)); }); positionHandles(it); }

  // ---------- プレビュー(選んでいる範囲を、同じ処理で最大20秒) ----------
  function stopPreview() {
    previewing = false;
    if (prevSrc) { try { prevSrc.onended = null; prevSrc.stop(); } catch (e) {} prevSrc = null; }
    if (prevIt && prevIt.ui) { prevIt.ui.prevBtn.classList.remove("is-on"); prevIt.ui.prevBtn.querySelector("span").textContent = "Preview"; prevIt.ui.prevBtn.querySelector("svg").innerHTML = ICON.play; }
    prevIt = null;
  }
  async function togglePreview(it) {
    it = it || activeIt;
    if (previewing) { var same = prevIt === it; stopPreview(); if (same) return; }
    if (!it || !it.dur || busy) { toast("Add a file first"); return; }
    setActive(it); previewing = true; prevIt = it;
    it.ui.prevBtn.classList.add("is-on"); it.ui.prevBtn.querySelector("span").textContent = "Stop"; it.ui.prevBtn.querySelector("svg").innerHTML = ICON.stop;
    setStatus("Rendering preview…");
    try {
      var pg = sg(it), from = it.cursor != null && it.cursor >= pg.start && it.cursor < segEnd(it, pg) - 0.3 ? it.cursor : pg.start;
      var buf = await getBuf(it);
      var r = await core.process(buf, procOpts(pg, { start: from, previewSec: 20, format: "wav", bits: 16 }));
      if (!previewing || prevIt !== it) { setStatus(""); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!prevCtx) prevCtx = new AC();
      if (prevCtx.state === "suspended") await prevCtx.resume();
      var ab = core.toAudioBuffer(prevCtx, r.channels, r.sampleRate);
      prevSrc = prevCtx.createBufferSource(); prevSrc.buffer = ab; prevSrc.connect(prevCtx.destination);
      prevSrc.onended = function () { stopPreview(); };
      prevSrc.start();
      setStatus(r.info && r.info.gainDb ? "Preview  (gain " + (r.info.gainDb > 0 ? "+" : "") + r.info.gainDb.toFixed(1) + " dB)" : "Preview");
    } catch (e) { stopPreview(); setStatus("Preview failed"); }
  }

  // ---------- 書き出し ----------
  function procOpts(g, extra) {
    var c = g.o, o = {
      start: g.start, end: g.end, speed: c.speedOn ? c.speed : 1, key: c.keyOn ? c.key : 0, eq: c.eqOn ? c.eq : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], comp: c.compOn ? c.comp : "off",
      norm: { mode: c.normOn ? c.norm : "off", target: c.normTarget }, format: c.format, bits: c.bits, kbps: c.kbps, sampleRate: c.sr, mono: c.mono
    };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function setStatus(t) { if (refs.status) refs.status.textContent = t || ""; }
  function setProgress(p) { if (refs.prog) { refs.prog.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + "%"; refs.progBox.hidden = p <= 0 || p >= 1 && !busy; } }
  function checked() { // 書き出す(ファイル, 範囲)の組
    var jobs = []; items.forEach(function (it) { if (it.on && !it.bad) it.segs.forEach(function (g) { if (g.on) jobs.push({ it: it, g: g }); }); });
    return jobs;
  }
  function refreshBar() {
    if (!refs.runBtn) return;
    var jobs = checked(), n = jobs.length, anyLib = jobs.some(function (j) { return j.g.o.lib; });
    refs.runBtn.disabled = busy ? false : n === 0 || (!S.download && !anyLib);
    refs.runLabel.textContent = busy ? "Cancel" : (n > 1 ? "Export " + n + " files" : "Export");
    refs.runBtn.classList.toggle("is-busy", busy);
    refs.hint.textContent = n > 0 && !S.download && !anyLib ? "Turn on Download in Output, or Library on a part" : (n > 1 && S.download ? "Several files are saved as one zip" : "");
  }
  function download(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  async function runExport() {
    if (busy) { abortFlag = true; return; }
    var list = checked(); if (!list.length) return;
    stopPreview();
    busy = true; abortFlag = false; refreshBar(); setProgress(0.001);
    var results = [], used = {}, fails = 0;
    try {
      var lastIt = null, lastBuf = null, MIME = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4" };
      for (var i = 0; i < list.length; i++) {
        if (abortFlag) break;
        var it = list[i].it, g = list[i].g;
        setStatus((list.length > 1 ? (i + 1) + " / " + list.length + "  " : "") + g.name);
        try {
          var buf = lastIt === it ? lastBuf : null;
          if (!buf) { lastBuf = null; buf = await core.decode(it.file); }
          lastIt = it; lastBuf = buf;
          var r = await core.process(buf, procOpts(g), function (p) { setProgress((i + p) / list.length); });
          var nm = safeName(g.name) + S.suffix, ext = "." + r.ext, nn = nm + ext, k = 2;
          while (used[nn.toLowerCase()]) nn = nm + "_" + (k++) + ext;
          used[nn.toLowerCase()] = 1;
          results.push({ name: nn, blob: r.blob, type: MIME[r.ext] || "audio/wav", lib: !!g.o.lib });
        } catch (e) { fails++; console.warn("export failed:", g.name, e); }
      }
      if (abortFlag) { setStatus("Canceled"); toast("Export canceled"); return; }
      if (!results.length) { setStatus("Export failed"); toast("Export failed"); return; }
      if (S.download) {
        if (results.length > 1 && typeof JSZip !== "undefined") { // 複数ならZIPにまとめる
          setStatus("Zipping…");
          var z = new JSZip(); results.forEach(function (r) { z.file(r.name, r.blob); });
          download(await z.generateAsync({ type: "blob", compression: "STORE" }), "qnplayer_export_" + new Date().toISOString().slice(0, 10) + ".zip");
        } else results.forEach(function (r, j) { setTimeout(function () { download(r.blob, r.name); }, j * 350); });
      }
      var libs = results.filter(function (r) { return r.lib; });
      if (libs.length && typeof addFilesToPlaylist === "function") addFilesToPlaylist(libs.map(function (r) { return new File([r.blob], r.name, { type: r.type }); }));
      var msg = results.length + (results.length > 1 ? " files exported" : " file exported") + (fails ? " (" + fails + " failed)" : "");
      setStatus(msg); toast(msg);
    } finally { busy = false; setProgress(0); refreshBar(); }
  }

  // ---------- Libraryから選ぶ ----------
  function openPicker() {
    var list = (typeof playlist !== "undefined" ? playlist : []).map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return x.t && x.t.file; });
    if (!list.length) { toast("The Library has no tracks"); return; }
    var ov = el("div", "qn-ex-pick"), box = el("div", "qn-ex-pick-box"), head = el("div", "qn-ex-pick-head", "Add from Library"), body = el("div", "qn-ex-pick-list"), foot = el("div", "qn-ex-pick-foot");
    var chosen = {};
    list.forEach(function (x) {
      var row = el("button", "qn-ex-pick-row"); row.type = "button";
      var cbx = el("span", "qn-ex-check"); var nm = el("span", "qn-ex-name", x.t.title || x.t.name);
      row.appendChild(cbx); row.appendChild(nm);
      row.addEventListener("click", function () { haptic(); chosen[x.i] = !chosen[x.i]; cbx.classList.toggle("is-on", !!chosen[x.i]); ok.disabled = !Object.keys(chosen).some(function (k) { return chosen[k]; }); });
      body.appendChild(row);
    });
    var cancel = el("button", "qn-ex-btn", "Cancel"); cancel.type = "button";
    var ok = el("button", "qn-ex-btn is-primary", "Add"); ok.type = "button"; ok.disabled = true;
    cancel.addEventListener("click", function () { ov.remove(); });
    ok.addEventListener("click", function () { var ix = Object.keys(chosen).filter(function (k) { return chosen[k]; }).map(Number); ov.remove(); addFromLibrary(ix); });
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    foot.appendChild(cancel); foot.appendChild(ok);
    box.appendChild(head); box.appendChild(body); box.appendChild(foot); ov.appendChild(box);
    root.querySelector(".qn-ex").appendChild(ov);
  }

  // ---------- 画面 ----------
  function btn(ref, cls, icon, label, title) { return '<button type="button" data-ex="' + ref + '" class="qn-ex-btn' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : "") + '>' + (icon ? '<svg viewBox="0 0 24 24">' + icon + '</svg>' : "") + '<span>' + label + '</span></button>'; }
  var TEMPLATE =
    '<div class="qn-ex">' +
      '<section class="qn-ex-stage" data-ex="stage">' +
        '<div class="qn-ex-top">' +
          btn("addBtn", "", ICON.add, "Add files", "Add audio files. They are not added to the Library") +
          btn("libBtn", "", ICON.lib, "From Library", "Pick tracks from the Library") +
          '<input type="file" data-ex="file" accept="audio/*,video/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm,.opus,.mp4,.m4v,.mov,.aif,.aiff" multiple hidden>' +
        '</div>' +
        '<div class="qn-ex-listbox" data-ex="listbox"><div class="qn-ex-empty" data-ex="empty"><p>Drop audio files here, or add them with the buttons above</p><p class="qn-ex-sub">Files stay on this device and are not added to the Library unless you turn on Library for a part</p></div></div>' +
        '<div class="qn-ex-allbox" data-ex="allbox" hidden><div class="qn-ex-bulk" data-ex="bulk"><span class="qn-ex-bulk-l">All files</span></div></div>' +
        '<div class="qn-ex-files" data-ex="files"></div>' +
      '</section>' +
      '<div class="qn-ex-bar">' +
        '<div class="qn-ex-barinfo"><div class="qn-ex-progbox" data-ex="progBox" hidden><div class="qn-ex-prog" data-ex="prog"></div></div><span class="qn-ex-status" data-ex="status"></span><span class="qn-ex-hint" data-ex="hint"></span></div>' +
        '<div class="qn-ex-save"><span class="qn-ex-save-l">Download</span><button type="button" class="qn-set-switch" role="switch" data-ex="dlSw" aria-label="Download"><span></span></button><input type="text" data-ex="suffix" class="qn-ex-suffix-in" maxlength="24" aria-label="File name suffix" title="File name suffix"></div>' +
        '<button type="button" data-ex="runBtn" class="qn-ex-btn is-primary qn-ex-run" disabled><svg viewBox="0 0 24 24">' + EXPORT_ICON + '</svg><span data-ex="runLabel">Export</span></button>' +
      '</div>' +
    '</div>';

  var SHORTCUTS = [{ key: "Space", action: "Preview on/off" }, { key: "Ctrl + Enter", action: "Export" }];
  function isTyping(t) { if (!t || !t.tagName) return false; var g = t.tagName; if (g === "INPUT") return t.type === "text"; return g === "TEXTAREA" || g === "SELECT" || t.isContentEditable; }
  function onKey(e) {
    if (e.altKey || isTyping(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runExport(); return; }
    if (e.ctrlKey || e.metaKey) return;
    if ((e.code === "Space" || e.key === " ") && !(e.target.closest && e.target.closest("button"))) { e.preventDefault(); if (e.type === "keydown" && !e.repeat) togglePreview(); }
  }
  var keyBound = false;
  function bindKeys(on) { if (on === keyBound) return; keyBound = on; var f = on ? "addEventListener" : "removeEventListener"; window[f]("keydown", onKey, true); }

  function bindEvents() {
    refs.addBtn.addEventListener("click", function () { haptic(); refs.file.click(); });
    refs.file.addEventListener("change", function () { addFiles(refs.file.files); refs.file.value = ""; });
    refs.libBtn.addEventListener("click", function () { haptic(); openPicker(); });
    refs.runBtn.addEventListener("click", function () { haptic(); runExport(); });
    refs.dlSw.addEventListener("click", function () { haptic(); S.download = !S.download; save(); syncSave(); refreshBar(); });
    refs.suffix.addEventListener("input", function () { S.suffix = refs.suffix.value.replace(/[\\/:*?"<>|]/g, "_"); save(); });
    function itemOf(e) { var b = e.target.closest(".qn-ex-file"); if (!b) return null; for (var i = 0; i < items.length; i++) if (items[i].ui.blk === b) return items[i]; return null; }
    refs.files.addEventListener("click", function (e) {
      var it = itemOf(e); if (!it || e.target.closest(".qn-ex-strip")) return;
      var row = e.target.closest(".qn-ex-seg"), act = e.target.closest("[data-act]"), a = act && act.getAttribute("data-act");
      if (a === "segname") return;
      haptic(); setActive(it);
      if (a === "remove") { removeItem(it); return; }
      if (a === "check") { it.on = !it.on; renderHead(it); refreshBar(); return; }
      if (a === "fold") { foldItem(it); return; }
      if (a === "split") { splitAtCursor(it); return; }
      if (a === "preview") { togglePreview(it); return; }
      if (!row) return;
      var i = +row.getAttribute("data-i");
      if (a === "segremove") { removeSeg(it, i); return; }
      if (a === "segcheck") { it.segs[i].on = !it.segs[i].on; renderSegs(it); renderHead(it); refreshBar(); return; }
      it.ss = i; it.cursor = null; drawWave(it); markSel(it);
    });
    refs.files.addEventListener("input", function (e) {
      var it = itemOf(e), row = e.target.closest(".qn-ex-seg"); if (!it || !row || !e.target.matches('[data-act="segname"]')) return;
      it.segs[+row.getAttribute("data-i")].name = e.target.value.replace(/[\\/:*?"<>|]/g, "_");
    });
    refs.files.addEventListener("focusin", function (e) {
      var it = itemOf(e), row = e.target.closest(".qn-ex-seg"); if (!it || !row || !e.target.matches('[data-act="segname"]')) return;
      setActive(it); var i = +row.getAttribute("data-i"); if (it.ss !== i) { it.ss = i; drawWave(it); markSel(it); }
    });
    var st = refs.stage;
    ["dragenter", "dragover"].forEach(function (n) { st.addEventListener(n, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); st.classList.add("is-drop"); } }); });
    ["dragleave", "drop"].forEach(function (n) { st.addEventListener(n, function () { st.classList.remove("is-drop"); }); });
    st.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
    window.addEventListener("resize", function () { if (shown) drawAll(); });
  }
  function syncSave() { refs.dlSw.classList.toggle("is-on", S.download); refs.dlSw.setAttribute("aria-checked", S.download ? "true" : "false"); }

  function mount(view) {
    root = view; root.innerHTML = TEMPLATE;
    var nodes = root.querySelectorAll("[data-ex]");
    for (var i = 0; i < nodes.length; i++) refs[nodes[i].getAttribute("data-ex")] = nodes[i];
    refs.suffix.value = S.suffix; syncSave();
    bindEvents(); bulkStrip = buildStrip("bulk"); refs.bulk.appendChild(bulkStrip.el); syncEmpty(); refreshBar();
    if (window.QNExportCodecs) QNExportCodecs.supports().then(function (r) { codecSup = r; var bad = function (o) { return fmtList().indexOf(o.format) < 0; }; if (bad(S.def)) S.def.format = "wav"; items.forEach(function (it) { if (bad(it.def)) it.def.format = "wav"; it.segs.forEach(function (g) { if (bad(g.o)) g.o.format = "wav"; }); }); updStrips(); });
  }
  function onShow() { shown = true; bindKeys(true); requestAnimationFrame(drawAll); }
  function onHide() { shown = false; bindKeys(false); stopPreview(); if (busy) abortFlag = true; }

  window.QNExport = { _items: function () { return items; }, _state: function () { return S; }, addFiles: addFiles, addFromLibrary: addFromLibrary, run: runExport, select: setActive };

  if (window.QNApps) {
    window.QNApps.register({ id: "export", label: "Export", icon: EXPORT_ICON, order: 40, ready: true, shortcuts: SHORTCUTS, shortcutsNote: "音声はこの端末の中だけで処理します。", mount: mount, onShow: onShow, onHide: onHide });
  } else console.error("qn-app-export.js: qn-apps.js が先に読み込まれていません");
})();
