// player-stem-worker.js — ステム分離ワーカー(module worker)。Demucs(htdemucs)をONNX Runtime Webで実行する。メインスレッドを止めないため必ずここで動かす。
// 入力: {ortBase, modelUrl, left, right, useGpu} → 出力: progress/download/status メッセージ、完了時 {type:"done", ep, stems:{drums,bass,other,vocals}(16bit WAVのBlob)}
// モデルはCache API("qn-stem-model-v1")に保存して2回目以降はDLしない。JS/stem/はdemucs-web(MIT, JS/stem/LICENSE-demucs-web.txt)のソース。
import { DemucsProcessor } from "./stem/processor.js";

const MODEL_CACHE = "qn-stem-model-v1";
const SR = 44100;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

async function getModel(url) {
  let cache = null;
  try { cache = await caches.open(MODEL_CACHE); } catch (e) {}
  if (cache) {
    const hit = await cache.match(url);
    if (hit) { post({ type: "download", loaded: 1, total: 1, cached: true }); return await hit.arrayBuffer(); }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Model download failed (" + res.status + ")");
  const total = parseInt(res.headers.get("Content-Length") || "0", 10);
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0, lastPost = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    loaded += r.value.length;
    const now = performance.now();
    if (now - lastPost > 200) { lastPost = now; post({ type: "download", loaded, total }); }
  }
  post({ type: "download", loaded, total: total || loaded });
  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  if (cache) { try { await cache.put(url, new Response(buf.slice(0))); } catch (e) {} }
  return buf.buffer;
}

function toWav(l, r) {
  const n = l.length;
  const out = new ArrayBuffer(44 + n * 4);
  const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const a = Math.max(-1, Math.min(1, l[i])), b = Math.max(-1, Math.min(1, r[i]));
    v.setInt16(o, a < 0 ? a * 32768 : a * 32767, true);
    v.setInt16(o + 2, b < 0 ? b * 32768 : b * 32767, true);
    o += 4;
  }
  return new Blob([out], { type: "audio/wav" });
}

self.onmessage = async (e) => {
  const d = e.data;
  try {
    const ort = await import(d.ortBase + "ort.min.mjs");
    ort.env.wasm.wasmPaths = d.ortBase;
    ort.env.wasm.numThreads = 1; // マルチスレッドはSharedArrayBuffer(COOP/COEP)が要る。YouTube埋め込み等を壊すので使わない
    post({ type: "status", stage: "download" });
    const model = await getModel(d.modelUrl);
    post({ type: "status", stage: "load" });
    let proc = null, ep = "wasm";
    if (d.useGpu && self.navigator && self.navigator.gpu) {
      try {
        proc = new DemucsProcessor({ ort, sessionOptions: { executionProviders: ["webgpu"] } });
        await proc.loadModel(model.slice(0));
        ep = "webgpu";
      } catch (err) { proc = null; }
    }
    if (!proc) {
      proc = new DemucsProcessor({ ort, sessionOptions: { executionProviders: ["wasm"] } });
      await proc.loadModel(model);
    }
    post({ type: "status", stage: "separate", ep });
    proc.onProgress = (p) => post({ type: "progress", p: p.progress, seg: p.currentSegment, total: p.totalSegments });
    const res = await proc.separate(d.left, d.right);
    post({ type: "status", stage: "encode" });
    const stems = {};
    for (const k of ["drums", "bass", "other", "vocals"]) stems[k] = toWav(res[k].left, res[k].right);
    post({ type: "done", ep, stems });
  } catch (err) {
    post({ type: "error", message: String(err && err.message || err) });
  }
};
