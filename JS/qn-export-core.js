// qn-export-core.js — EXPORTアプリの音声処理(DOMなし)。window.QNExportCore。依存: soundtouch-core.js(window.QNSoundTouch), lame_min.js(MP3の時だけ読み込み)
// 流れ(すべて端末の中。サーバーへ送らない): decode → Trim → Speed/Key(SoundTouch) → EQ+Compressor(OfflineAudioContext) → Normalize(+リミッタ) → 書き出し(WAV/MP3)
(function () {
  "use strict";

  var EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]; // PLAYERのEQと同じ(player-core.jsのEQ_FREQS・peaking・Q1.4)
  var EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bass: [8, 7, 6, 4, 2, 0, 0, 0, 0, 0], vocal: [-2, -2, -1, 1, 4, 5, 4, 2, 0, -1],
    treble: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7], vshape: [7, 6, 3, 0, -3, -4, -3, 0, 4, 6]
  };
  // コンプレッサー: DynamicsCompressorNode + 簡易メイクアップ(dB)。amountはoff/light/medium/heavy
  var COMP = {
    light: { thr: -18, knee: 12, ratio: 2, atk: 0.01, rel: 0.25, makeup: 2 },
    medium: { thr: -24, knee: 12, ratio: 4, atk: 0.005, rel: 0.2, makeup: 5 },
    heavy: { thr: -30, knee: 6, ratio: 8, atk: 0.003, rel: 0.15, makeup: 8 }
  };
  var NORM_TARGETS = [-24, -21, -18, -16, -14, -12]; // 平均音量(ゲート付きRMS, dBFS)。PLAYERのNormalizeと同じ測り方
  var PEAK_CEIL_DB = -1;

  function yieldUi() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function db(x) { return 10 * Math.log10(x); }
  function lin(d) { return Math.pow(10, d / 20); }

  // ---------- 読み込み ----------
  var decCtx = null;
  async function decode(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!decCtx) decCtx = new AC();
    var ab = await blob.arrayBuffer();
    return await new Promise(function (res, rej) { decCtx.decodeAudioData(ab, res, rej); }); // 古いSafari互換のコールバック形式
  }
  function getChannels(buf) {
    var out = [];
    for (var c = 0; c < Math.min(2, buf.numberOfChannels); c++) out.push(buf.getChannelData(c));
    return out;
  }

  // ---------- Trim ----------
  function trim(chs, sr, start, end) {
    var n = chs[0].length, s = Math.max(0, Math.min(n, Math.round(start * sr))), e = Math.max(s, Math.min(n, Math.round(end * sr)));
    return chs.map(function (d) { return d.slice(s, e); }); // コピー(元のバッファは触らない)
  }

  // ---------- Speed / Key (SoundTouch) ----------
  // 速度s・キーp(半音)。SoundTouchはpitchだけ公開なので、rate=pitch倍・stretchのtempo=s/pitchに直接設定(長さ=1/s、音程=pitch倍)
  async function stretchPitch(chs, sr, speed, semis, onProgress) {
    var ST = window.QNSoundTouch && window.QNSoundTouch.SoundTouch;
    if (!ST) throw new Error("SoundTouch is not loaded");
    var mono = chs.length === 1, n = chs[0].length, st = new ST({ sampleRate: sr });
    st.pitchSemitones = semis;
    var pitch = Math.pow(2, semis / 12);
    st.stretch.tempo = speed / pitch;
    var CH = 8192, outL = [], outR = [], tmp = new Float32Array(CH * 2), inter = new Float32Array(CH * 2);
    var total = Math.round(n / speed);
    function drain() {
      var a;
      while ((a = st.outputBuffer.frameCount) > 0) {
        var k = Math.min(a, CH);
        st.outputBuffer.extract(tmp, 0, k, true);
        var l = new Float32Array(k), r = new Float32Array(k);
        for (var i = 0; i < k; i++) { l[i] = tmp[2 * i]; r[i] = tmp[2 * i + 1]; }
        outL.push(l); outR.push(r);
      }
    }
    var pad = Math.ceil(sr * 0.5); // 末尾を押し出すための無音
    for (var p = 0; p < n + pad; p += CH) {
      var m = Math.min(CH, n + pad - p);
      for (var i = 0; i < m; i++) {
        var idx = p + i;
        var l0 = idx < n ? chs[0][idx] : 0, r0 = idx < n ? (mono ? l0 : chs[1][idx]) : 0;
        inter[2 * i] = l0; inter[2 * i + 1] = r0;
      }
      st.inputBuffer.putSamples(inter, 0, m);
      st.process();
      drain();
      if ((p / CH) % 8 === 0) { if (onProgress) onProgress(Math.min(1, p / n)); await yieldUi(); }
    }
    function cat(parts) {
      var out = new Float32Array(Math.min(total, parts.reduce(function (a, b) { return a + b.length; }, 0))), o = 0;
      for (var i = 0; i < parts.length && o < out.length; i++) { var seg = parts[i].subarray(0, Math.min(parts[i].length, out.length - o)); out.set(seg, o); o += seg.length; }
      return out;
    }
    var L = cat(outL), R = cat(outR);
    return mono ? [L] : [L, R];
  }

  // ---------- EQ + Compressor (OfflineAudioContext) ----------
  async function eqComp(chs, sr, eq, comp) {
    var eqOn = eq && eq.some(function (g) { return g !== 0; }), cp = COMP[comp];
    if (!eqOn && !cp) return chs;
    var n = chs[0].length, ch = chs.length;
    var oc = new OfflineAudioContext(ch, Math.max(1, n), sr);
    var ab = oc.createBuffer(ch, n, sr);
    for (var c = 0; c < ch; c++) ab.copyToChannel(chs[c], c);
    var src = oc.createBufferSource(); src.buffer = ab;
    var node = src;
    if (eqOn) {
      EQ_FREQS.forEach(function (f, i) {
        var g = eq[i] || 0; if (!g) return;
        var b = oc.createBiquadFilter(); b.type = "peaking"; b.frequency.value = f; b.Q.value = 1.4; b.gain.value = g;
        node.connect(b); node = b;
      });
    }
    if (cp) {
      var dc = oc.createDynamicsCompressor();
      dc.threshold.value = cp.thr; dc.knee.value = cp.knee; dc.ratio.value = cp.ratio; dc.attack.value = cp.atk; dc.release.value = cp.rel;
      node.connect(dc); node = dc;
      var mk = oc.createGain(); mk.gain.value = lin(cp.makeup); node.connect(mk); node = mk;
    }
    node.connect(oc.destination); src.start(0);
    var out = await oc.startRendering();
    var res = []; for (var k = 0; k < ch; k++) res.push(out.getChannelData(k).slice());
    return res;
  }

  // ---------- 計測 / Normalize ----------
  // 0.4秒ブロックのゲート付きRMS(絶対-60dB→相対-10dB)とピーク。player-normalize.jsと同じ手順
  function analyze(chs, sr) {
    var n = chs[0].length, blk = Math.max(1, Math.round(sr * 0.4)), ms = [], peak = 0;
    for (var s = 0; s < n; s += blk) {
      var e = Math.min(n, s + blk), sum = 0;
      for (var c = 0; c < chs.length; c++) {
        var d = chs[c], acc = 0;
        for (var i = s; i < e; i++) { var v = d[i]; acc += v * v; var a = v < 0 ? -v : v; if (a > peak) peak = a; }
        sum += acc / (e - s);
      }
      if (e - s >= blk * 0.5) ms.push(sum / chs.length);
    }
    var abs = ms.filter(function (x) { return x > 0 && db(x) > -60; });
    if (!abs.length || peak <= 0) return null;
    var mean1 = abs.reduce(function (a, b) { return a + b; }, 0) / abs.length;
    var rel = abs.filter(function (x) { return db(x) > db(mean1) - 10; });
    var use = rel.length ? rel : abs;
    return { loud: db(use.reduce(function (a, b) { return a + b; }, 0) / use.length), peak: db(peak * peak) };
  }
  async function limit(chs, sr) { // ピークが天井を超える時だけ、リミッタで受け止める
    var n = chs[0].length, ch = chs.length, oc = new OfflineAudioContext(ch, Math.max(1, n), sr);
    var ab = oc.createBuffer(ch, n, sr); for (var c = 0; c < ch; c++) ab.copyToChannel(chs[c], c);
    var src = oc.createBufferSource(); src.buffer = ab;
    var dc = oc.createDynamicsCompressor(); dc.threshold.value = -2; dc.knee.value = 0; dc.ratio.value = 20; dc.attack.value = 0.001; dc.release.value = 0.08;
    src.connect(dc); dc.connect(oc.destination); src.start(0);
    var out = await oc.startRendering(), res = []; for (var k = 0; k < ch; k++) res.push(out.getChannelData(k).slice());
    return res;
  }
  async function normalize(chs, sr, norm) {
    var info = { gainDb: 0, limited: false };
    if (!norm || norm.mode === "off") return { chs: chs, info: info };
    var a = analyze(chs, sr); if (!a) return { chs: chs, info: info };
    var g = norm.mode === "peak" ? PEAK_CEIL_DB - a.peak : Math.min(norm.target - a.loud, 12 + PEAK_CEIL_DB - a.peak); // loud: ピークが+12dB(=リミッタが受ける範囲)を超えない範囲まで上げる
    g = Math.max(-24, Math.min(30, g));
    var k = lin(g);
    var out = chs.map(function (d) { var o = new Float32Array(d.length); for (var i = 0; i < d.length; i++) o[i] = d[i] * k; return o; });
    info.gainDb = g;
    if (a.peak + g > PEAK_CEIL_DB + 0.05) { out = await limit(out, sr); info.limited = true; }
    for (var c = 0; c < out.length; c++) { var d2 = out[c], lim = lin(PEAK_CEIL_DB + 0.3); for (var i2 = 0; i2 < d2.length; i2++) { if (d2[i2] > lim) d2[i2] = lim; else if (d2[i2] < -lim) d2[i2] = -lim; } }
    var a2 = analyze(out, sr); info.after = a2;
    return { chs: out, info: info };
  }

  // ---------- リサンプル(MP3や出力サンプルレート用) ----------
  async function resample(chs, sr, toSr) {
    if (!toSr || toSr === sr) return { chs: chs, sr: sr };
    var n = chs[0].length, len = Math.max(1, Math.round(n * toSr / sr)), ch = chs.length;
    var oc = new OfflineAudioContext(ch, len, toSr), ab = oc.createBuffer(ch, n, sr);
    for (var c = 0; c < ch; c++) ab.copyToChannel(chs[c], c);
    var src = oc.createBufferSource(); src.buffer = ab; src.connect(oc.destination); src.start(0);
    var out = await oc.startRendering(), res = []; for (var k = 0; k < ch; k++) res.push(out.getChannelData(k).slice());
    return { chs: res, sr: toSr };
  }

  // ---------- エンコード ----------
  function encodeWav(chs, sr, bits) {
    var ch = chs.length, n = chs[0].length, bps = bits / 8, dataLen = n * ch * bps, buf = new ArrayBuffer(44 + dataLen), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true);
    v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
    str(36, "data"); v.setUint32(40, dataLen, true);
    var o = 44;
    for (var i = 0; i < n; i++) for (var c = 0; c < ch; c++) {
      var x = Math.max(-1, Math.min(1, chs[c][i]));
      if (bits === 16) { v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
      else if (bits === 24) { var q = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff); v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); o += 3; }
      else { v.setFloat32(o, x, true); o += 4; }
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  var lameP = null;
  function loadLame() {
    if (window.lamejs) return Promise.resolve();
    if (lameP) return lameP;
    lameP = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "JS/lame_min.js"; s.onload = res; s.onerror = function () { lameP = null; rej(new Error("lame_min.js load failed")); };
      document.head.appendChild(s);
    });
    return lameP;
  }
  async function encodeMp3(chs, sr, kbps, onProgress) {
    await loadLame();
    var lib = window.lamejs; // lame_min.jsは末尾でlamejs()を呼び、関数lamejsにMp3Encoderを生やす形式
    var ch = chs.length, enc = new lib.Mp3Encoder(ch, sr, kbps), parts = [], BLK = 1152 * 8, n = chs[0].length;
    function toI16(f, s, e) { var o = new Int16Array(e - s); for (var i = s; i < e; i++) { var x = Math.max(-1, Math.min(1, f[i])); o[i - s] = x < 0 ? x * 0x8000 : x * 0x7fff; } return o; }
    for (var p = 0, k = 0; p < n; p += BLK, k++) {
      var e = Math.min(n, p + BLK), l = toI16(chs[0], p, e);
      var out = ch === 2 ? enc.encodeBuffer(l, toI16(chs[1], p, e)) : enc.encodeBuffer(l);
      if (out.length) parts.push(new Uint8Array(out));
      if (k % 16 === 0) { if (onProgress) onProgress(p / n); await yieldUi(); }
    }
    var tail = enc.flush(); if (tail.length) parts.push(new Uint8Array(tail));
    return new Blob(parts, { type: "audio/mpeg" });
  }

  // ---------- 全体 ----------
  // opts: {start,end,speed,key,eq[10],comp,norm:{mode,target},format:"wav"|"mp3"|"flac"|"ogg"|"m4a",bits,kbps,sampleRate(0=元),mono,previewSec}
  async function process(buf, opts, onProgress) {
    var prog = function (a, b, x) { if (onProgress) onProgress(a + (b - a) * x); };
    var sr = buf.sampleRate, chs = getChannels(buf);
    var dur = buf.duration, start = Math.max(0, opts.start || 0), end = opts.end > 0 ? Math.min(dur, opts.end) : dur;
    if (opts.previewSec) end = Math.min(end, start + opts.previewSec);
    chs = trim(chs, sr, start, end);
    if (!chs[0].length) throw new Error("Empty range");
    if (opts.mono && chs.length === 2) { var m = new Float32Array(chs[0].length); for (var i = 0; i < m.length; i++) m[i] = (chs[0][i] + chs[1][i]) / 2; chs = [m]; }
    prog(0, 0.05, 1);
    var speed = opts.speed || 1, key = opts.key || 0;
    if (Math.abs(speed - 1) > 1e-6 || key !== 0) chs = await stretchPitch(chs, sr, speed, key, function (x) { prog(0.05, 0.4, x); });
    prog(0.4, 0.45, 1); await yieldUi();
    chs = await eqComp(chs, sr, opts.eq, opts.comp);
    prog(0.45, 0.55, 1);
    var nr = await normalize(chs, sr, opts.norm); chs = nr.chs;
    prog(0.55, 0.6, 1);
    var outSr = opts.sampleRate || sr;
    var fmt = opts.format || "wav";
    if (fmt === "mp3" && [32000, 44100, 48000].indexOf(outSr) < 0) outSr = 44100;
    if (fmt === "ogg") outSr = 48000; // Opusは48 kHz
    if (fmt === "m4a" && [32000, 44100, 48000].indexOf(outSr) < 0) outSr = 44100;
    if (outSr !== sr) { var rs = await resample(chs, sr, outSr); chs = rs.chs; }
    var blob, ext;
    var CX = window.QNExportCodecs, pg2 = function (x) { prog(0.6, 1, x); };
    if (fmt === "mp3") { blob = await encodeMp3(chs, outSr, opts.kbps || 192, pg2); ext = "mp3"; }
    else if (fmt === "flac") { blob = await CX.encodeFlac(chs, outSr, opts.bits === 16 ? 16 : 24, pg2); ext = "flac"; }
    else if (fmt === "ogg") { blob = await CX.encodeOpus(chs, outSr, opts.kbps || 128, pg2); ext = "ogg"; }
    else if (fmt === "m4a") { blob = await CX.encodeM4a(chs, outSr, opts.kbps || 160, pg2); ext = "m4a"; }
    else { blob = encodeWav(chs, outSr, opts.bits || 16); ext = "wav"; }
    prog(1, 1, 1);
    return { blob: blob, ext: ext, sampleRate: outSr, channels: chs, info: nr.info, duration: chs[0].length / outSr };
  }

  // プレビュー用: 処理済みのチャンネルをAudioBufferにして返す
  function toAudioBuffer(ctx, chs, sr) {
    var ab = ctx.createBuffer(chs.length, chs[0].length, sr);
    for (var c = 0; c < chs.length; c++) ab.copyToChannel(chs[c], c);
    return ab;
  }
  // 波形(ピーク)の要約: nバケットの最大振幅
  function peaks(buf, n) {
    var d = buf.getChannelData(0), len = d.length, out = new Float32Array(n), step = Math.max(1, Math.floor(len / n));
    var d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    for (var i = 0; i < n; i++) {
      var s = i * step, e = Math.min(len, s + step), m = 0;
      for (var j = s; j < e; j += Math.max(1, Math.floor((e - s) / 64))) { var a = Math.abs(d[j]); if (d1) a = Math.max(a, Math.abs(d1[j])); if (a > m) m = a; }
      out[i] = m;
    }
    return out;
  }

  window.QNExportCore = {
    EQ_FREQS: EQ_FREQS, EQ_PRESETS: EQ_PRESETS, COMP: COMP, NORM_TARGETS: NORM_TARGETS,
    decode: decode, process: process, analyze: analyze, toAudioBuffer: toAudioBuffer, peaks: peaks, encodeWav: encodeWav
  };
})();
