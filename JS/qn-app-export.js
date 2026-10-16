// qn-app-export.js — EXPORTアプリ(書き出し専門ツール)。QNApps.register({id:"export"})。処理本体はqn-export-core.js(DOMなし)。
// 読み込んだファイルはLibraryに追加せずに書き出せる(メモリ上だけ)。Libraryの曲も選べる。書き出した結果をLibraryに追加するスイッチもある。保存キー: qn_export_settings
// 音声は端末の中だけで処理する(サーバーへ送らない)。Trim(曲ごと) / Speed / Key / EQ / Compressor / Normalize(全曲共通) → WAV / MP3。複数ならZIPにまとめられる。
// スタイルはCSS/style-export-app.cssの.qn-ex*。UI部品はQNSettingsUI(PLAYERの設定行と共通)。
(function () {
  "use strict";

  var core = window.QNExportCore;
  var KEY = "qn_export_settings", COLLAPSE_KEY = "qn_export_panel_collapsed";
  var EXPORT_ICON = '<path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>';
  var ICON = {
    edit: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
    tone: '<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>',
    out: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>',
    play: '<path d="M8 5v14l11-7z"/>', split: '<path d="M11 3h2v18h-2zM4 8l4 4-4 4zM20 8v8l-4-4z"/>', stop: '<path d="M6 6h12v12H6z"/>',
    add: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>', lib: '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>'
  };

  // ---------- 設定(全曲共通) ----------
  var DEF = { speed: 1, key: 0, eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], eqPreset: "flat", comp: "off", norm: "off", normTarget: -18, format: "wav", bits: 16, kbps: 192, sr: 0, mono: false, zip: true, download: true, toLibrary: false, suffix: "_export" };
  var S = JSON.parse(JSON.stringify(DEF));
  try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv && typeof sv === "object") Object.keys(DEF).forEach(function (k) { if (typeof sv[k] === typeof DEF[k]) S[k] = sv[k]; }); } catch (e) {}
  if (!Array.isArray(S.eq) || S.eq.length !== 10) S.eq = DEF.eq.slice();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // ---------- 状態 ----------
  var items = [], sel = -1, nextId = 1, root = null, refs = {}, shown = false, busy = false, abortFlag = false;
  var curBuf = null, curPk = null, curBufId = 0, loadToken = 0;
  var panelState = null, panelCollapsed = (function () { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (e) { return false; } })();
  var uiEdit = null, uiTone = null, uiOut = null, eqSliders = [];
  var prevCtx = null, prevSrc = null, previewing = false;

  function isSp() { return window.matchMedia("(max-width: 900px)").matches; }
  function toast(t) { if (window.QNApps && QNApps.toast) QNApps.toast(t); }
  function haptic() { if (typeof hapticTap === "function") { try { hapticTap(); } catch (e) {} } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtT(t) { if (!isFinite(t)) return "--"; var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }
  function baseName(n) { return String(n || "audio").replace(/\.[^.]+$/, ""); }
  function safeName(n) { return String(n).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "audio"; }
  function cur() { return sel >= 0 ? items[sel] : null; }
  function sg(it) { it = it || cur(); return it && it.segs.length ? it.segs[Math.min(it.ss, it.segs.length - 1)] : null; }
  function segEnd(it, g) { return g.end > 0 ? g.end : (it.dur || 0); }
  function fixEnds(it) { if (!it.dur) return; it.segs.forEach(function (g) { if (!(g.end > 0) || g.end > it.dur) g.end = it.dur; if (g.start > g.end - 0.1) g.start = Math.max(0, g.end - 0.1); }); }

  // ---------- 一覧 ----------
  function addBlob(file, source, label) {
    items.push({ id: nextId++, name: label || file.name, file: file, source: source, dur: null, segs: [{ name: safeName(baseName(label || file.name)), start: 0, end: 0, on: true }], ss: 0, cursor: null, on: true });
    var it = items[items.length - 1];
    if (typeof readAudioDuration === "function") readAudioDuration(file).then(function (d) { if (d) { it.dur = d; fixEnds(it); renderList(); renderSegs(); } }).catch(function () {});
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
    if (sel < 0) selectItem(0); else renderList();
    refreshBar();
  }
  function addFromLibrary(idxs) {
    idxs.forEach(function (i) {
      var t = playlist[i]; if (!t || !t.file) return;
      addBlob(t.file, "library", t.title || t.name).name = t.name;
      items[items.length - 1].label = t.title || t.name;
    });
    if (sel < 0 && items.length) selectItem(0); else renderList();
    refreshBar();
  }
  function removeItem(i) {
    if (busy) return;
    items.splice(i, 1);
    if (sel === i) { sel = -1; curBuf = null; curPk = null; stopPreview(); if (items.length) selectItem(Math.min(i, items.length - 1)); else { renderList(); renderSegs(); drawWave(); syncEdit(); } }
    else { if (sel > i) sel--; renderList(); }
    refreshBar();
  }
  function renderList() {
    if (!refs.list) return;
    refs.list.textContent = "";
    refs.empty.hidden = items.length > 0;
    items.forEach(function (it, i) {
      var row = el("div", "qn-ex-row" + (i === sel ? " is-sel" : "") + (it.on ? "" : " is-off"));
      row.setAttribute("data-i", i);
      var cb = el("button", "qn-ex-check" + (it.on ? " is-on" : "")); cb.type = "button"; cb.setAttribute("data-act", "check"); cb.setAttribute("aria-pressed", it.on ? "true" : "false"); cb.title = "Include in export";
      var name = el("span", "qn-ex-name"); name.textContent = it.label || it.name;
      var tag = el("span", "qn-ex-src", it.source === "library" ? "Library" : "File");
      var onSegs = it.segs.filter(function (g) { return g.on; }), tot = 0; it.segs.forEach(function (g) { if (g.on) tot += segEnd(it, g) - g.start; });
      var du = el("span", "qn-ex-dur", it.segs.length > 1 ? it.segs.length + " parts" : (it.dur ? fmtT(tot) : "--"));
      var rm = el("button", "qn-ex-x"); rm.type = "button"; rm.setAttribute("data-act", "remove"); rm.title = "Remove from this list"; rm.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      row.appendChild(cb); row.appendChild(name); row.appendChild(tag); row.appendChild(du); row.appendChild(rm);
      refs.list.appendChild(row);
    });
  }

  // ---------- 選択・波形 ----------
  async function selectItem(i) {
    if (i < 0 || i >= items.length) return;
    stopPreview();
    sel = i; renderList(); renderSegs(); syncEdit();
    var it = items[i], tok = ++loadToken;
    refs.wave.setAttribute("data-state", "loading"); refs.waveMsg.textContent = "Loading…";
    curBuf = null; curPk = null; drawWave();
    try {
      var buf = await core.decode(it.file);
      if (tok !== loadToken) return;
      curBuf = buf; curBufId = it.id; it.dur = buf.duration;
      fixEnds(it);
      curPk = core.peaks(buf, 600);
      refs.wave.setAttribute("data-state", "ready"); refs.waveMsg.textContent = "";
      renderList(); renderSegs(); syncEdit(); drawWave();
    } catch (e) {
      if (tok !== loadToken) return;
      refs.wave.setAttribute("data-state", "error"); refs.waveMsg.textContent = "Could not read this file";
      it.bad = true;
    }
  }
  function drawWave() {
    var cv = refs.canvas; if (!cv) return;
    var w = cv.clientWidth || 600, h = cv.clientHeight || 120, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var cx = cv.getContext("2d"); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
    var it = cur();
    if (!curPk || !it || !curBuf) { positionHandles(); return; }
    var cs = getComputedStyle(root.querySelector(".qn-ex")), c1 = cs.getPropertyValue("--qn-ex-wave").trim() || "#4f8cff", c0 = cs.getPropertyValue("--qn-ex-dim").trim() || "rgba(255,255,255,.18)";
    var n = curPk.length, dur = curBuf.duration, cur_ = sg(it);
    for (var i = 0; i < n; i++) {
      var x = i / n * w, t = i / n * dur, a = Math.max(1, curPk[i] * (h / 2 - 2)), st = 0;
      for (var k = 0; k < it.segs.length; k++) { var g = it.segs[k]; if (t >= g.start && t <= segEnd(it, g)) { st = g === cur_ ? 2 : 1; if (g === cur_) break; } }
      cx.globalAlpha = st === 2 ? 1 : st === 1 ? 0.5 : 1;
      cx.fillStyle = st ? c1 : c0;
      cx.fillRect(x, h / 2 - a, Math.max(1, w / n - 0.5), a * 2);
    }
    cx.globalAlpha = 1; cx.fillStyle = c1;
    it.segs.forEach(function (g) { if (g === cur_) return; cx.fillRect(g.start / dur * w, 0, 1, h); cx.fillRect(segEnd(it, g) / dur * w - 1, 0, 1, h); });
    if (it.cursor != null) { cx.fillStyle = "#fff"; cx.globalAlpha = 0.85; cx.fillRect(it.cursor / dur * w - 0.5, 0, 1, h); cx.globalAlpha = 1; }
    positionHandles();
  }
  function positionHandles() {
    var it = cur(), g = sg(it), ok = it && curBuf && g;
    refs.hStart.hidden = refs.hEnd.hidden = !ok;
    if (!ok) { refs.trimInfo.textContent = ""; return; }
    var dur = curBuf.duration, e = segEnd(it, g);
    refs.hStart.style.left = (g.start / dur * 100) + "%";
    refs.hEnd.style.left = (e / dur * 100) + "%";
    refs.trimInfo.textContent = fmtT(g.start) + " – " + fmtT(e) + "  (" + fmtT(e - g.start) + ")";
  }
  function setTrim(which, v) {
    var it = cur(), g = sg(it); if (!it || !curBuf || !g) return;
    var dur = curBuf.duration, minLen = 0.1;
    v = Math.max(0, Math.min(dur, Math.round(v * 10) / 10));
    if (which === "start") g.start = Math.min(v, segEnd(it, g) - minLen);
    else g.end = Math.max(v, g.start + minLen);
    if (g.start < 0) g.start = 0;
    drawWave(); syncEdit(); renderList(); renderSegs();
  }
  // ---------- 分割(長い曲を複数の範囲に分け、範囲ごとに名前と範囲を決める) ----------
  function splitAtCursor() {
    var it = cur(), g = sg(it); if (!it || !curBuf || !g) { toast("Add a file first"); return; }
    var c = it.cursor, e = segEnd(it, g);
    if (c == null) { toast("Click the waveform to set the split point"); return; }
    c = Math.round(c * 10) / 10;
    if (c <= g.start + 0.2 || c >= e - 0.2) { toast("Pick a point inside the selected part"); return; }
    var base = safeName(baseName(it.label || it.name));
    var ng = { name: "", start: c, end: e, on: true };
    g.end = c;
    var idx = it.segs.indexOf(g);
    it.segs.splice(idx + 1, 0, ng);
    var def = function (k) { return base + "_" + k; };
    if (it.segs.length === 2 && g.name === base) g.name = def(1);
    ng.name = def(it.segs.length);
    var used = {}; it.segs.forEach(function (x) { if (x !== ng) used[x.name] = 1; });
    var k2 = it.segs.length; while (used[ng.name]) ng.name = def(++k2);
    it.ss = idx + 1; haptic();
    drawWave(); syncEdit(); renderList(); renderSegs();
  }
  function removeSeg(i) {
    var it = cur(); if (!it || it.segs.length < 2) return;
    var g = it.segs[i], prev = it.segs[i - 1], next = it.segs[i + 1];
    if (prev && Math.abs(segEnd(it, prev) - g.start) < 0.15) prev.end = segEnd(it, g);
    else if (next && Math.abs(next.start - segEnd(it, g)) < 0.15) next.start = g.start;
    it.segs.splice(i, 1); it.ss = Math.max(0, Math.min(it.ss, it.segs.length - 1));
    if (it.segs.length === 1 && it.segs[0].name.match(/_1$/)) it.segs[0].name = it.segs[0].name.replace(/_1$/, "");
    drawWave(); syncEdit(); renderList(); renderSegs();
  }
  function renderSegs() {
    if (!refs.segs) return;
    var it = cur(); refs.segs.textContent = "";
    refs.segsBox.hidden = !it;
    if (!it) return;
    it.segs.forEach(function (g, i) {
      var row = el("div", "qn-ex-seg" + (i === it.ss ? " is-sel" : "") + (g.on ? "" : " is-off")); row.setAttribute("data-i", i);
      var cb = el("button", "qn-ex-check" + (g.on ? " is-on" : "")); cb.type = "button"; cb.setAttribute("data-act", "segcheck"); cb.title = "Include in export";
      var inp = el("input", "qn-ex-segname"); inp.type = "text"; inp.value = g.name; inp.maxLength = 80; inp.setAttribute("aria-label", "File name"); inp.setAttribute("data-act", "segname");
      var rg = el("span", "qn-ex-segrange", fmtT(g.start) + " – " + fmtT(segEnd(it, g)));
      var x = el("button", "qn-ex-x"); x.type = "button"; x.setAttribute("data-act", "segremove"); x.title = "Remove this part"; x.disabled = it.segs.length < 2; x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      row.appendChild(cb); row.appendChild(inp); row.appendChild(rg); row.appendChild(x); refs.segs.appendChild(row);
    });
    refs.splitBtn.disabled = !curBuf;
  }
  function bindHandles() {
    refs.wave.addEventListener("pointerdown", function (e) {
      if (!curBuf || e.target.closest(".qn-ex-handle")) return;
      var it = cur(), r = refs.wave.getBoundingClientRect(); if (!it) return;
      it.cursor = Math.max(0, Math.min(curBuf.duration, (e.clientX - r.left) / r.width * curBuf.duration));
      // クリックした位置を含む範囲を選ぶ
      for (var k = 0; k < it.segs.length; k++) { var g = it.segs[k]; if (it.cursor >= g.start && it.cursor <= segEnd(it, g)) { it.ss = k; break; } }
      drawWave(); syncEdit(); renderSegs();
    });
    ["start", "end"].forEach(function (which) {
      var h = which === "start" ? refs.hStart : refs.hEnd, drag = false;
      h.addEventListener("pointerdown", function (e) { if (!curBuf) return; drag = true; h.setPointerCapture(e.pointerId); e.preventDefault(); });
      h.addEventListener("pointermove", function (e) {
        if (!drag || !curBuf) return;
        var r = refs.wave.getBoundingClientRect();
        setTrim(which, (e.clientX - r.left) / r.width * curBuf.duration);
      });
      var up = function () { drag = false; };
      h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
  }

  // ---------- プレビュー(書き出しと同じ処理を、Trim開始から最大20秒だけ) ----------
  function stopPreview() {
    previewing = false;
    if (prevSrc) { try { prevSrc.onended = null; prevSrc.stop(); } catch (e) {} prevSrc = null; }
    if (refs.prevBtn) { refs.prevBtn.classList.remove("is-on"); refs.prevBtn.querySelector("span").textContent = "Preview"; refs.prevBtn.querySelector("svg").innerHTML = ICON.play; }
  }
  async function togglePreview() {
    if (previewing) { stopPreview(); return; }
    var it = cur(); if (!it || !curBuf || busy) { toast("Add a file first"); return; }
    previewing = true;
    refs.prevBtn.classList.add("is-on"); refs.prevBtn.querySelector("span").textContent = "Stop"; refs.prevBtn.querySelector("svg").innerHTML = ICON.stop;
    setStatus("Rendering preview…");
    try {
      var pg = sg(it), from = it.cursor != null && it.cursor >= pg.start && it.cursor < segEnd(it, pg) - 0.3 ? it.cursor : pg.start;
      var r = await core.process(curBuf, procOpts(it, pg, { start: from, previewSec: 20, format: "wav", bits: 16 }));
      if (!previewing) { setStatus(""); return; }
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
  function procOpts(it, g, extra) {
    var o = {
      start: g.start, end: g.end, speed: S.speed, key: S.key, eq: S.eq, comp: S.comp,
      norm: { mode: S.norm, target: S.normTarget }, format: S.format, bits: S.bits, kbps: S.kbps, sampleRate: S.sr, mono: S.mono
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
    var n = checked().length;
    refs.runBtn.disabled = busy ? false : n === 0 || (!S.download && !S.toLibrary);
    refs.runLabel.textContent = busy ? "Cancel" : (n > 1 ? "Export " + n + " files" : "Export");
    refs.runBtn.classList.toggle("is-busy", busy);
    refs.hint.textContent = !S.download && !S.toLibrary ? "Turn on Download or Add to Library in Output" : "";
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
          var buf = it.id === curBufId && curBuf ? curBuf : (lastIt === it ? lastBuf : null);
          if (!buf) { lastBuf = null; buf = await core.decode(it.file); }
          lastIt = it; lastBuf = buf;
          var r = await core.process(buf, procOpts(it, g), function (p) { setProgress((i + p) / list.length); });
          var nm = safeName(g.name) + S.suffix, ext = "." + r.ext, nn = nm + ext, k = 2;
          while (used[nn.toLowerCase()]) nn = nm + "_" + (k++) + ext;
          used[nn.toLowerCase()] = 1;
          results.push({ name: nn, blob: r.blob, type: MIME[r.ext] || "audio/wav" });
        } catch (e) { fails++; console.warn("export failed:", g.name, e); }
      }
      if (abortFlag) { setStatus("Canceled"); toast("Export canceled"); return; }
      if (!results.length) { setStatus("Export failed"); toast("Export failed"); return; }
      if (S.download) {
        if (results.length > 1 && S.zip && typeof JSZip !== "undefined") {
          setStatus("Zipping…");
          var z = new JSZip(); results.forEach(function (r) { z.file(r.name, r.blob); });
          download(await z.generateAsync({ type: "blob", compression: "STORE" }), "qnplayer_export_" + new Date().toISOString().slice(0, 10) + ".zip");
        } else results.forEach(function (r, j) { setTimeout(function () { download(r.blob, r.name); }, j * 350); });
      }
      if (S.toLibrary && typeof addFilesToPlaylist === "function") addFilesToPlaylist(results.map(function (r) { return new File([r.blob], r.name, { type: r.type }); }));
      var msg = results.length + (results.length > 1 ? " files exported" : " file exported") + (fails ? " (" + fails + " failed)" : "");
      setStatus(msg); toast(msg);
    } finally { busy = false; setProgress(0); refreshBar(); }
  }

  // ---------- 設定UI ----------
  function stepRow(label, hint, values, get, set, fmt, extra) { var r = { label: label, hint: hint, type: "stepper", values: function () { return typeof values === "function" ? values() : values; }, get: get, set: set, fmt: fmt || String }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function swRow(label, hint, get, set, extra) { var r = { label: label, hint: hint, type: "switch", get: get, set: set }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  var KB = { mp3: [128, 192, 256, 320], ogg: [64, 96, 128, 160, 192], m4a: [96, 128, 160, 192, 256] }, KDEF = { mp3: 192, ogg: 128, m4a: 160 }, codecSup = { ogg: false, m4a: false };
  function fmtList() { var l = ["wav", "mp3", "flac"]; if (codecSup.ogg) l.push("ogg"); if (codecSup.m4a) l.push("m4a"); return l; }
  var KEYS = []; for (var kk = -12; kk <= 12; kk++) KEYS.push(kk);
  var EQ_NAMES = { flat: "Flat", bass: "Bass", vocal: "Vocal", treble: "Treble", vshape: "V-shape", custom: "Custom" };

  function eqNode() {
    var box = el("div", "qn-ex-eq"), cols = [];
    core.EQ_FREQS.forEach(function (f, i) {
      var c = el("div", "qn-ex-eq-col"), g = el("span", "qn-ex-eq-g"), inp = el("input"); inp.type = "range"; inp.min = -15; inp.max = 15; inp.step = 1; inp.className = "qn-ex-eq-r"; inp.setAttribute("aria-label", (f >= 1000 ? f / 1000 + "k" : f) + " Hz");
      var fl = el("span", "qn-ex-eq-f", f >= 1000 ? (f / 1000) + "k" : String(f));
      inp.addEventListener("input", function () { S.eq[i] = +inp.value; S.eqPreset = matchPreset(); save(); syncEq(); if (uiTone) uiTone.sync(); });
      inp.addEventListener("dblclick", function () { inp.value = 0; inp.dispatchEvent(new Event("input")); });
      c.appendChild(g); c.appendChild(inp); c.appendChild(fl); box.appendChild(c); cols.push({ inp: inp, g: g });
    });
    eqSliders = cols;
    return box;
  }
  function matchPreset() { var k = Object.keys(core.EQ_PRESETS); for (var i = 0; i < k.length; i++) if (core.EQ_PRESETS[k[i]].every(function (v, j) { return v === S.eq[j]; })) return k[i]; return "custom"; }
  function syncEq() { eqSliders.forEach(function (c, i) { c.inp.value = S.eq[i]; c.g.textContent = (S.eq[i] > 0 ? "+" : "") + S.eq[i]; c.inp.style.setProperty("--p", ((S.eq[i] + 15) / 30 * 100) + "%"); }); }

  function buildPanels() {
    var changed = function () { save(); refreshBar(); };
    uiEdit = QNSettingsUI.build([
      { title: "Trim", rows: [
        { label: "Applies to the selected part. To split a long file, click the waveform and press Split", type: "note" },
        { label: "Start", hint: "Drag the handles on the waveform, or set the time here", type: "range", min: 0, get max() { return curBuf ? Math.ceil(curBuf.duration * 10) / 10 : 1; }, step: 0.1, dec: 1, unit: " s", get: function () { var g = sg(); return g ? g.start : 0; }, set: function (v) { setTrim("start", v); }, disabledWhen: function () { return !curBuf; } },
        { label: "End", type: "range", min: 0, get max() { return curBuf ? Math.ceil(curBuf.duration * 10) / 10 : 1; }, step: 0.1, dec: 1, unit: " s", get: function () { var it = cur(), g = sg(it); return g ? segEnd(it, g) : 0; }, set: function (v) { setTrim("end", v); }, disabledWhen: function () { return !curBuf; } }
      ] },
      { title: "Speed / Key", rows: [
        { label: "Speed", hint: "Changes the tempo without changing the pitch", type: "range", min: 0.5, max: 2, step: 0.01, dec: 2, unit: "x", mark: 1, markLabel: "1.00", get: function () { return S.speed; }, set: function (v) { S.speed = Math.round(v * 100) / 100; } },
        stepRow("Key", "Shifts the pitch in semitones without changing the tempo", KEYS, function () { return S.key; }, function (v) { S.key = v; }, function (v) { return v > 0 ? "+" + v : String(v); })
      ] }
    ]);
    uiEdit.el.addEventListener("input", function () { save(); });
    uiEdit.el.addEventListener("click", function () { save(); });
    uiTone = QNSettingsUI.build([
      { title: "Equalizer", rows: [
        stepRow("Preset", "", ["flat", "bass", "vocal", "treble", "vshape", "custom"], function () { return S.eqPreset; }, function (v) { if (v !== "custom") { S.eq = core.EQ_PRESETS[v].slice(); S.eqPreset = v; syncEq(); } }, function (v) { return EQ_NAMES[v] || v; }),
        { label: "Bands", hint: "", type: "node", node: eqNode() }
      ] },
      { title: "Compressor", rows: [
        stepRow("Amount", "Evens out loud and quiet parts. Higher is stronger", ["off", "light", "medium", "heavy"], function () { return S.comp; }, function (v) { S.comp = v; }, function (v) { return v === "off" ? "Off" : v === "light" ? "Light" : v === "medium" ? "Medium" : "Heavy"; })
      ] },
      { title: "Normalize", rows: [
        stepRow("Mode", "Peak: raise to just below full scale. Loudness: match the average level below", ["off", "peak", "loudness"], function () { return S.norm; }, function (v) { S.norm = v; }, function (v) { return v === "off" ? "Off" : v === "peak" ? "Peak" : "Loudness"; }),
        stepRow("Target level", "Average level for Loudness. Peaks are caught by a limiter", core.NORM_TARGETS, function () { return S.normTarget; }, function (v) { S.normTarget = v; }, function (v) { return v + " dB"; }, { hiddenWhen: function () { return S.norm !== "loudness"; } })
      ] }
    ]);
    uiTone.el.addEventListener("click", function () { save(); }); uiTone.el.addEventListener("input", function () { save(); });
    uiOut = QNSettingsUI.build([
      { title: "Format", rows: [
        stepRow("Format", "", function () { return fmtList(); }, function () { return S.format; }, function (v) { S.format = v; if (KB[v] && KB[v].indexOf(S.kbps) < 0) S.kbps = KDEF[v]; }, function (v) { return v === "ogg" ? "OGG Opus" : v.toUpperCase(); }),
        stepRow("Bit depth", "WAV and FLAC", function () { return S.format === "flac" ? [16, 24] : [16, 24, 32]; }, function () { return S.format === "flac" && S.bits === 32 ? 24 : S.bits; }, function (v) { S.bits = v; }, function (v) { return v === 32 ? "32-bit float" : v + "-bit"; }, { hiddenWhen: function () { return S.format !== "wav" && S.format !== "flac"; } }),
        stepRow("Bitrate", "MP3, OGG Opus and M4A", function () { return KB[S.format] || KB.mp3; }, function () { return S.kbps; }, function (v) { S.kbps = v; }, function (v) { return v + " kbps"; }, { hiddenWhen: function () { return !KB[S.format]; } }),
        stepRow("Sample rate", "Original keeps the file's rate. MP3 and M4A use 44.1 or 48 kHz, OGG Opus uses 48 kHz", [0, 44100, 48000], function () { return S.sr; }, function (v) { S.sr = v; }, function (v) { return v === 0 ? "Original" : (v / 1000) + " kHz"; }),
        swRow("Mono", "Mix both channels into one", function () { return S.mono; }, function (v) { S.mono = v; })
      ] },
      { title: "Save", rows: [
        swRow("Download", "Save the result as a file", function () { return S.download; }, function (v) { S.download = v; }),
        swRow("Zip multiple files", "Put several results in one zip", function () { return S.zip; }, function (v) { S.zip = v; }, { hiddenWhen: function () { return !S.download; } }),
        swRow("Add to Library", "Add the result to the Library as a new track", function () { return S.toLibrary; }, function (v) { S.toLibrary = v; })
      ] }
    ]);
    uiOut.el.addEventListener("click", function () { save(); refreshBar(); });
    refs.pEdit.appendChild(uiEdit.el); refs.pTone.appendChild(uiTone.el); refs.pOut.appendChild(uiOut.el);
    syncEq();
    // 名前の末尾(suffix)の入力
    var sf = el("div", "qn-ex-suffix"); var lab = el("label", null, "File name suffix"); var inp = el("input"); inp.type = "text"; inp.maxLength = 24; inp.value = S.suffix; inp.setAttribute("aria-label", "File name suffix");
    inp.addEventListener("input", function () { S.suffix = inp.value.replace(/[\\/:*?"<>|]/g, "_"); save(); });
    sf.appendChild(lab); sf.appendChild(inp); refs.pOut.appendChild(sf);
  }
  function syncEdit() { if (uiEdit) uiEdit.sync(); if (curBuf) positionHandles(); }

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

  // ---------- テンプレート・パネル ----------
  var SIDEBAR = [{ id: "edit", label: "Edit", icon: ICON.edit }, { id: "tone", label: "Tone", icon: ICON.tone }, { id: "out", label: "Output", icon: ICON.out }];
  var PANEL_TITLES = { edit: "Edit", tone: "Tone", out: "Output", keyboard: "Keyboard" };
  function btn(ref, cls, icon, label, title) { return '<button type="button" data-ex="' + ref + '" class="qn-ex-btn' + (cls ? " " + cls : "") + '"' + (title ? ' title="' + title + '"' : "") + '>' + (icon ? '<svg viewBox="0 0 24 24">' + icon + '</svg>' : "") + '<span>' + label + '</span></button>'; }
  var TEMPLATE =
    '<div class="qn-ex" data-panel="edit">' +
      '<aside class="qn-ex-panel">' +
        '<div class="qn-ex-panel-header"><span class="pcv2-panel-header-title" data-ex="panelTitle">Edit</span></div>' +
        '<div class="qn-ex-panel-scroll">' +
          '<section class="qn-ex-sec qn-ex-sec-edit" data-ex="pEdit"></section>' +
          '<section class="qn-ex-sec qn-ex-sec-tone" data-ex="pTone"></section>' +
          '<section class="qn-ex-sec qn-ex-sec-out" data-ex="pOut"></section>' +
          '<section class="qn-ex-sec qn-ex-sec-keyboard"><div data-ex="kbdBox"></div></section>' +
        '</div>' +
      '</aside>' +
      '<section class="qn-ex-stage" data-ex="stage">' +
        '<div class="qn-ex-top">' +
          btn("addBtn", "", ICON.add, "Add files", "Add audio files. They are not added to the Library") +
          btn("libBtn", "", ICON.lib, "From Library", "Pick tracks from the Library") +
          '<input type="file" data-ex="file" accept="audio/*,video/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm,.opus,.mp4,.m4v,.mov,.aif,.aiff" multiple hidden>' +
        '</div>' +
        '<div class="qn-ex-listbox"><div class="qn-ex-empty" data-ex="empty"><p>Drop audio files here, or add them with the buttons above</p><p class="qn-ex-sub">Files stay on this device and are not added to the Library unless you turn on Add to Library</p></div><div class="qn-ex-list" data-ex="list"></div></div>' +
        '<div class="qn-ex-wave" data-ex="wave" data-state="empty"><canvas data-ex="canvas"></canvas><span class="qn-ex-wave-msg" data-ex="waveMsg"></span>' +
          '<div class="qn-ex-handle is-start" data-ex="hStart" hidden><i></i></div><div class="qn-ex-handle is-end" data-ex="hEnd" hidden><i></i></div></div>' +
        '<div class="qn-ex-wave-info"><span data-ex="trimInfo"></span><span class="qn-ex-wave-btns">' + btn("splitBtn", "", ICON.split, "Split", "Split the selected part at the white line. Click the waveform to place it") + btn("prevBtn", "", ICON.play, "Preview", "Hear the result of the current settings (up to 20 seconds)") + '</span></div>' +
        '<div class="qn-ex-segsbox" data-ex="segsBox" hidden><div class="qn-ex-segs-head">Parts</div><div class="qn-ex-segs" data-ex="segs"></div></div>' +
      '</section>' +
      '<div class="qn-ex-bar">' +
        '<div class="qn-ex-barinfo"><div class="qn-ex-progbox" data-ex="progBox" hidden><div class="qn-ex-prog" data-ex="prog"></div></div><span class="qn-ex-status" data-ex="status"></span><span class="qn-ex-hint" data-ex="hint"></span></div>' +
        '<button type="button" data-ex="runBtn" class="qn-ex-btn is-primary qn-ex-run" disabled><svg viewBox="0 0 24 24">' + EXPORT_ICON + '</svg><span data-ex="runLabel">Export</span></button>' +
      '</div>' +
    '</div>';

  function setPanel(id) {
    if (!isSp() && id === "none") id = "edit";
    panelState = id;
    if (!root) return;
    root.querySelector(".qn-ex").setAttribute("data-panel", id);
    if (id === "keyboard") window.QNApps.renderShortcuts(refs.kbdBox, "export");
    if (id !== "none") refs.panelTitle.textContent = PANEL_TITLES[id] || "";
    syncSideActive();
  }
  function isCollapsed() { return panelCollapsed && !isSp(); }
  function syncSideActive() { if (window.QNApps) window.QNApps.setSideActive((!panelState || panelState === "none" || isCollapsed()) ? null : panelState); }
  function applyCollapse() { if (!root) return; root.querySelector(".qn-ex").classList.toggle("qn-ex-collapsed", isCollapsed()); syncSideActive(); }
  function setCollapsed(on) { panelCollapsed = !!on; try { localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0"); } catch (e) {} applyCollapse(); }
  function onSidebar(id) {
    if (isSp()) { setPanel(panelState === id ? "none" : id); return; }
    if (panelCollapsed) { setCollapsed(false); setPanel(id); return; }
    if (panelState === id) { setCollapsed(true); return; }
    setPanel(id);
  }

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
    refs.prevBtn.addEventListener("click", function () { haptic(); togglePreview(); });
    refs.splitBtn.addEventListener("click", function () { haptic(); splitAtCursor(); });
    refs.segs.addEventListener("click", function (e) {
      var row = e.target.closest(".qn-ex-seg"), it = cur(); if (!row || !it) return;
      var i = +row.getAttribute("data-i"), act = e.target.closest("[data-act]"), a = act && act.getAttribute("data-act");
      if (a === "segname") return;
      haptic();
      if (a === "segremove") { removeSeg(i); return; }
      if (a === "segcheck") { it.segs[i].on = !it.segs[i].on; renderSegs(); renderList(); refreshBar(); return; }
      it.ss = i; var g = it.segs[i]; it.cursor = null; drawWave(); syncEdit(); renderSegs();
    });
    refs.segs.addEventListener("input", function (e) {
      var row = e.target.closest(".qn-ex-seg"), it = cur(); if (!row || !it || !e.target.matches('[data-act="segname"]')) return;
      var g = it.segs[+row.getAttribute("data-i")]; g.name = e.target.value.replace(/[\\/:*?"<>|]/g, "_");
    });
    refs.segs.addEventListener("focusin", function (e) { var row = e.target.closest(".qn-ex-seg"), it = cur(); if (row && it && e.target.matches('[data-act="segname"]')) { var i = +row.getAttribute("data-i"); if (it.ss !== i) { it.ss = i; drawWave(); syncEdit(); row.parentNode.querySelectorAll(".qn-ex-seg").forEach(function (r) { r.classList.toggle("is-sel", r === row); }); } } });
    refs.runBtn.addEventListener("click", function () { haptic(); runExport(); });
    refs.list.addEventListener("click", function (e) {
      var row = e.target.closest(".qn-ex-row"); if (!row) return;
      var i = +row.getAttribute("data-i"), act = e.target.closest("[data-act]");
      haptic();
      if (act && act.getAttribute("data-act") === "remove") { removeItem(i); return; }
      if (act && act.getAttribute("data-act") === "check") { items[i].on = !items[i].on; renderList(); refreshBar(); return; }
      if (i !== sel) selectItem(i);
    });
    var st = refs.stage;
    ["dragenter", "dragover"].forEach(function (n) { st.addEventListener(n, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); st.classList.add("is-drop"); } }); });
    ["dragleave", "drop"].forEach(function (n) { st.addEventListener(n, function () { st.classList.remove("is-drop"); }); });
    st.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
    bindHandles();
    window.addEventListener("resize", function () { if (shown) { applyCollapse(); drawWave(); } });
  }

  function mount(view) {
    root = view; root.innerHTML = TEMPLATE;
    var nodes = root.querySelectorAll("[data-ex]");
    for (var i = 0; i < nodes.length; i++) refs[nodes[i].getAttribute("data-ex")] = nodes[i];
    refs.canvas = root.querySelector("canvas");
    buildPanels(); bindEvents(); renderList(); refreshBar();
    if (window.QNExportCodecs) QNExportCodecs.supports().then(function (r) { codecSup = r; if (fmtList().indexOf(S.format) < 0) { S.format = "wav"; save(); } uiOut.sync(); });
  }
  function onShow() {
    shown = true; bindKeys(true);
    setPanel(panelState || (isSp() ? "none" : "edit")); applyCollapse();
    requestAnimationFrame(drawWave);
  }
  function onHide() { shown = false; bindKeys(false); stopPreview(); if (busy) abortFlag = true; }

  window.QNExport = { _items: function () { return items; }, _state: function () { return S; }, addFiles: addFiles, addFromLibrary: addFromLibrary, run: runExport, select: selectItem };

  if (window.QNApps) {
    window.QNApps.register({ id: "export", label: "Export", icon: EXPORT_ICON, order: 40, ready: true, sidebar: SIDEBAR, shortcuts: SHORTCUTS, shortcutsNote: "音声はこの端末の中だけで処理します。", onSidebar: onSidebar, mount: mount, onShow: onShow, onHide: onHide });
  } else console.error("qn-app-export.js: qn-apps.js が先に読み込まれていません");
})();
