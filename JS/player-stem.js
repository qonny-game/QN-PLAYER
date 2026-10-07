// player-stem.js — Stemパネル(v4.16.0, PC専用)。再生中のローカル曲を、ブラウザ内でDemucsにより4パート(drums/bass/other/vocals)へ分離し、パート別の音量/ミュート/ソロで鳴らす。
// - 分離: JS/player-stem-worker.js(module worker)。WebGPUがあれば優先、無ければWASM単スレッド(遅い)。モデルはCache API、結果(16bit WAV×4)はIndexedDB "qn_stem_db"に曲キー(名前|サイズ|更新日時)で保存。
// - 再生: マスターは既存の<audio>(#audio)をそのまま時計に使う(シーク/A-Bループ/マーカー/速度は従来通り)。Stemモード中はマスターをmutedにし、4本の<audio>(各stem WAV)を
//   マスターのcurrentTime/playbackRate/再生状態へ追従させる(ズレ>60msでcurrentTimeを合わせ直す)。EQ/Key(SoundTouch経路)はStemモード中は効かない。
// - YouTube/iPhone(SP幅)は非対応。window.QNStem.mount(host)をplayer-ui-pc-v2.jsのswitchPanel("stem")が呼ぶ。
(function () {
  "use strict";

  var ORT_BASE = window.QN_STEM_ORT_BASE || "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
  var MODEL_URL = window.QN_STEM_MODEL_URL || "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx";
  var MODEL_MB = 172;
  var MAX_SEC = 720;
  var DB_NAME = "qn_stem_db", STORE = "stems", KEEP_MAX = 6;
  var PARTS = [
    { id: "vocals", label: "Vocals" },
    { id: "drums", label: "Drums" },
    { id: "bass", label: "Bass" },
    { id: "other", label: "Other" }
  ];

  var st = {
    key: "", name: "",
    phase: "idle",          // idle | decoding | working | ready | error
    stage: "", ep: "", msg: "",
    prog: 0, dl: null, seg: 0, segTotal: 0, t0: 0,
    blobs: null, cached: false,
    active: false, els: null, urls: null,
    vol: { vocals: 1, drums: 1, bass: 1, other: 1 },
    mute: {}, solo: {}
  };
  var gpuOk = null; // null=確認中 / true / false(requestAdapterで実際に取れるか)
  var worker = null, root = null, syncTimer = 0, tickTimer = 0, wired = false;

  function A() { return document.getElementById("audio") || (typeof audio !== "undefined" ? audio : null); }
  function curTrack() {
    try { return (typeof playlist !== "undefined" && typeof currentPlaylistIndex !== "undefined" && currentPlaylistIndex >= 0) ? playlist[currentPlaylistIndex] : null; } catch (e) { return null; }
  }
  function keyOf(f) { return f ? [f.name || "", f.size || 0, f.lastModified || 0].join("|") : ""; }
  function isSp() { return window.matchMedia && window.matchMedia("(max-width: 900px)").matches; }

  // ---------- IndexedDB ----------
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: "key" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(STORE, mode), out = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { d.close(); res(out && out.result); };
        tx.onerror = tx.onabort = function () { d.close(); rej(tx.error); };
      });
    });
  }
  function cacheGet(key) { return idb("readonly", function (s) { return s.get(key); }).catch(function () { return null; }); }
  function cachePut(rec) {
    return idb("readwrite", function (s) { return s.put(rec); }).then(function () {
      return idb("readonly", function (s) { return s.getAll(); });
    }).then(function (all) {
      all = (all || []).sort(function (a, b) { return b.ts - a.ts; });
      var drop = all.slice(KEEP_MAX);
      if (!drop.length) return;
      return idb("readwrite", function (s) { drop.forEach(function (x) { s.delete(x.key); }); });
    }).catch(function () {});
  }
  function cacheDel(key) { return idb("readwrite", function (s) { s.delete(key); }).catch(function () {}); }

  // ---------- 再生(4本のaudioをマスターへ追従) ----------
  function applyVol() {
    if (!st.els) return;
    var anySolo = PARTS.some(function (p) { return st.solo[p.id]; });
    PARTS.forEach(function (p) {
      var on = anySolo ? !!st.solo[p.id] : !st.mute[p.id];
      st.els[p.id].volume = on ? Math.max(0, Math.min(1, st.vol[p.id])) : 0;
    });
  }
  function followAll(hard) {
    var m = A();
    if (!m || !st.els) return;
    PARTS.forEach(function (p) {
      var e = st.els[p.id];
      if (e.playbackRate !== m.playbackRate) e.playbackRate = m.playbackRate;
      if (hard || Math.abs(e.currentTime - m.currentTime) > 0.06) { try { e.currentTime = m.currentTime; } catch (x) {} }
      if (m.paused) { if (!e.paused) e.pause(); }
      else if (e.paused && e.readyState >= 2) e.play().catch(function () {});
    });
  }
  var masterEvents = ["play", "pause", "seeked", "ratechange", "waiting", "playing"];
  function onMaster(ev) { followAll(ev.type === "seeked" || ev.type === "play"); }
  function enable() {
    var m = A();
    if (!m || !st.blobs || st.active) return;
    st.urls = {}; st.els = {};
    PARTS.forEach(function (p) {
      var u = URL.createObjectURL(st.blobs[p.id]);
      var e = new Audio();
      e.preload = "auto"; e.src = u;
      try { e.preservesPitch = true; } catch (x) {}
      st.urls[p.id] = u; st.els[p.id] = e;
    });
    st.active = true;
    m.muted = true;
    applyVol();
    masterEvents.forEach(function (n) { m.addEventListener(n, onMaster); });
    followAll(true);
    syncTimer = setInterval(function () { followAll(false); }, 150);
  }
  function disable() {
    var m = A();
    if (m) { masterEvents.forEach(function (n) { m.removeEventListener(n, onMaster); }); m.muted = false; }
    clearInterval(syncTimer);
    if (st.els) PARTS.forEach(function (p) { try { st.els[p.id].pause(); st.els[p.id].removeAttribute("src"); st.els[p.id].load(); } catch (x) {} });
    if (st.urls) PARTS.forEach(function (p) { URL.revokeObjectURL(st.urls[p.id]); });
    st.els = st.urls = null; st.active = false;
  }

  // ---------- 分離 ----------
  function decode(file) {
    return file.arrayBuffer().then(function (ab) {
      var ctx = new OfflineAudioContext(2, 44100, 44100);
      return ctx.decodeAudioData(ab);
    }).then(function (buf) {
      var l = buf.getChannelData(0).slice();
      var r = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
      return { l: l, r: r, dur: buf.duration };
    });
  }
  function stop() {
    if (worker) { worker.terminate(); worker = null; }
    st.phase = "idle"; st.stage = ""; render();
  }
  function start() {
    var tr = curTrack();
    if (!tr || !tr.file) return;
    var key = keyOf(tr.file);
    st.key = key; st.name = tr.name || tr.file.name || "";
    st.phase = "decoding"; st.msg = ""; st.prog = 0; st.dl = null; st.seg = 0; st.segTotal = 0; st.t0 = Date.now();
    render();
    decode(tr.file).then(function (d) {
      if (st.key !== key || st.phase !== "decoding") return;
      if (d.dur > MAX_SEC) throw new Error("This track is too long (limit: " + Math.round(MAX_SEC / 60) + " min)");
      st.phase = "working"; st.stage = "download"; st.t0 = Date.now(); render();
      worker = new Worker("JS/player-stem-worker.js", { type: "module" });
      worker.onmessage = function (e) {
        var d2 = e.data;
        if (st.key !== key) return;
        if (d2.type === "download") st.dl = d2;
        else if (d2.type === "status") { st.stage = d2.stage; if (d2.ep) st.ep = d2.ep; if (d2.stage === "separate") st.t0 = Date.now(); }
        else if (d2.type === "progress") { st.prog = d2.p; st.seg = d2.seg; st.segTotal = d2.total; }
        else if (d2.type === "error") { worker.terminate(); worker = null; st.phase = "error"; st.msg = d2.message; }
        else if (d2.type === "done") {
          worker.terminate(); worker = null;
          st.blobs = d2.stems; st.ep = d2.ep; st.phase = "ready"; st.cached = true;
          cachePut({ key: key, name: st.name, ts: Date.now(), stems: d2.stems });
        }
        render();
      };
      worker.onerror = function (e) { if (worker) worker.terminate(); worker = null; st.phase = "error"; st.msg = (e && e.message) || "Worker failed"; render(); };
      worker.postMessage({ ortBase: ORT_BASE, modelUrl: MODEL_URL, left: d.l, right: d.r, useGpu: true }, [d.l.buffer, d.r.buffer]);
    }).catch(function (err) {
      if (st.key !== key) return;
      st.phase = "error"; st.msg = (err && err.message) || "Could not decode this file"; render();
    });
  }

  // ---------- 曲の切替追従 ----------
  function onTrackChange() {
    var tr = curTrack(), key = tr && tr.file ? keyOf(tr.file) : "";
    if (key === st.key) return;
    if (st.active) disable();
    if (worker) { worker.terminate(); worker = null; }
    st.key = key; st.name = tr ? (tr.name || (tr.file && tr.file.name) || "") : "";
    st.blobs = null; st.cached = false; st.phase = "idle"; st.msg = ""; st.solo = {}; st.mute = {};
    if (key) cacheGet(key).then(function (rec) {
      if (rec && st.key === key && st.phase === "idle") { st.blobs = rec.stems; st.cached = true; st.phase = "ready"; render(); }
    });
    render();
  }
  function wire() {
    if (wired) return;
    var m = A();
    if (!m) return;
    wired = true;
    ["loadedmetadata", "emptied"].forEach(function (n) { m.addEventListener(n, function () { setTimeout(onTrackChange, 0); }); });
  }

  // ---------- UI ----------
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  function render() {
    if (!root || !root.isConnected) return;
    clearInterval(tickTimer);
    root.textContent = "";
    var tr = curTrack();
    if (isSp()) { root.appendChild(h("p", "qn-stem-note", "Stem is available on PC only for now.")); return; }
    if (!tr || !tr.file) { root.appendChild(h("p", "qn-stem-note", "Load a track in Library to separate it into parts.")); return; }

    var head = h("div", "qn-stem-track");
    head.appendChild(h("small", "", "Track"));
    head.appendChild(h("span", "", st.name || tr.name || tr.file.name));
    root.appendChild(head);

    if (st.phase === "idle" || st.phase === "error") {
      if (st.phase === "error") root.appendChild(h("p", "qn-stem-err", st.msg));
      var gpu = gpuOk !== false;
      root.appendChild(h("p", "qn-stem-note", gpu
        ? "Runs in this browser (WebGPU). The first run downloads a model of about " + MODEL_MB + " MB."
        : "WebGPU is not available here, so processing runs on the CPU and can take a very long time. The first run downloads a model of about " + MODEL_MB + " MB."));
      var b = h("button", "qn-stem-btn is-primary", "Separate into 4 parts");
      b.type = "button";
      b.addEventListener("click", start);
      root.appendChild(b);
    } else if (st.phase === "decoding") {
      root.appendChild(h("p", "qn-stem-note", "Decoding audio…"));
    } else if (st.phase === "working") {
      var label = st.stage === "download" ? "Downloading model" : st.stage === "load" ? "Loading model" : st.stage === "encode" ? "Preparing parts" : "Separating";
      var pct = 0, info = "";
      if (st.stage === "download" && st.dl) {
        var tot = st.dl.total || MODEL_MB * 1048576;
        pct = Math.min(1, st.dl.loaded / tot);
        info = st.dl.cached ? "Using the saved model" : Math.round(st.dl.loaded / 1048576) + " / " + Math.round(tot / 1048576) + " MB";
      } else if (st.stage === "separate") {
        pct = st.prog;
        var el = (Date.now() - st.t0) / 1000;
        info = (st.ep === "webgpu" ? "WebGPU" : "CPU") + (st.segTotal ? "  " + st.seg + " / " + st.segTotal : "") +
          (st.prog > 0.02 ? "  about " + fmtT(el / st.prog - el) + " left" : "");
      }
      root.appendChild(h("div", "qn-stem-label", label));
      var bar = h("div", "qn-stem-bar"), fill = h("i"); fill.style.width = Math.round(pct * 100) + "%"; bar.appendChild(fill);
      root.appendChild(bar);
      root.appendChild(h("p", "qn-stem-note", info));
      var c = h("button", "qn-stem-btn", "Cancel"); c.type = "button"; c.addEventListener("click", stop);
      root.appendChild(c);
      tickTimer = setInterval(render, 1000);
    } else if (st.phase === "ready") {
      var row = h("div", "qn-set-row");
      var lab = h("div", "qn-set-label"); lab.appendChild(h("span", "", "Stem mode")); lab.appendChild(h("small", "", "Play the four parts instead of the original"));
      var ctl = h("div", "qn-set-ctl");
      var sw = h("button", "qn-set-switch" + (st.active ? " is-on" : "")); sw.type = "button"; sw.appendChild(h("span"));
      sw.addEventListener("click", function () { if (st.active) disable(); else enable(); render(); });
      ctl.appendChild(sw); row.appendChild(lab); row.appendChild(ctl);
      root.appendChild(row);

      var mix = h("div", "qn-stem-mix" + (st.active ? "" : " is-off"));
      PARTS.forEach(function (p) {
        var r = h("div", "qn-stem-part");
        r.appendChild(h("span", "qn-stem-name", p.label));
        var mb = h("button", "qn-stem-ms" + (st.mute[p.id] ? " is-on" : ""), "M"); mb.type = "button"; mb.title = "Mute";
        var sb = h("button", "qn-stem-ms" + (st.solo[p.id] ? " is-on is-solo" : ""), "S"); sb.type = "button"; sb.title = "Solo";
        var rg = h("input", "qn-set-range"); rg.type = "range"; rg.min = 0; rg.max = 1; rg.step = 0.01; rg.value = st.vol[p.id];
        var paint = function () { rg.style.setProperty("--p", Math.round(rg.value * 100) + "%"); };
        paint();
        rg.addEventListener("input", function () { st.vol[p.id] = parseFloat(rg.value); paint(); applyVol(); });
        mb.addEventListener("click", function () { st.mute[p.id] = !st.mute[p.id]; applyVol(); mb.classList.toggle("is-on", !!st.mute[p.id]); });
        sb.addEventListener("click", function () { st.solo[p.id] = !st.solo[p.id]; applyVol(); sb.classList.toggle("is-on", !!st.solo[p.id]); sb.classList.toggle("is-solo", !!st.solo[p.id]); });
        r.appendChild(mb); r.appendChild(sb); r.appendChild(rg);
        mix.appendChild(r);
      });
      root.appendChild(mix);
      root.appendChild(h("p", "qn-stem-note", "EQ and Key do not apply in stem mode. Speed, seek and loop work as usual."));
      var del = h("button", "qn-stem-btn", "Delete saved parts"); del.type = "button";
      del.addEventListener("click", function () {
        if (st.active) disable();
        var k = st.key; st.blobs = null; st.cached = false; st.phase = "idle";
        cacheDel(k).then(render);
      });
      root.appendChild(del);
    }
  }

  window.QNStem = {
    mount: function (host) {
      if (!root) root = h("div", "qn-stem");
      host.appendChild(root);
      wire();
      if (gpuOk === null) {
        gpuOk = false;
        try { if (navigator.gpu) navigator.gpu.requestAdapter().then(function (a) { gpuOk = !!a; render(); }, function () {}); } catch (e) {}
      }
      onTrackChange();
      render();
    },
    state: st
  };
})();
