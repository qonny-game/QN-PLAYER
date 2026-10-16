// qn-export-codecs.js — EXPORT用の書き出し形式(FLAC / OGG Opus / M4A AAC)。window.QNExportCodecs。DOMなし。
// FLACは自前の符号化(固定予測+Rice)。Opus・AACはブラウザ標準のWebCodecs(AudioEncoder)で符号化し、OggとMP4の容れ物は自前で組む。
// supports(): {flac:true, ogg:bool, m4a:bool} — AudioEncoderの対応は端末次第(M4AはSafari/Chrome/Edgeで可、Chromium素のビルドは不可)。
(function () {
  "use strict";
  var yieldUi = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  // ---------- CRC ----------
  var CRC8 = (function () { var t = new Uint8Array(256); for (var i = 0; i < 256; i++) { var c = i; for (var k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; t[i] = c; } return t; })();
  var CRC16 = (function () { var t = new Uint16Array(256); for (var i = 0; i < 256; i++) { var c = i << 8; for (var k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; t[i] = c; } return t; })();
  var CRC32OGG = (function () { var t = new Uint32Array(256); for (var i = 0; i < 256; i++) { var c = (i << 24) >>> 0; for (var k = 0; k < 8; k++) c = c & 0x80000000 ? (((c << 1) ^ 0x04c11db7) >>> 0) : ((c << 1) >>> 0); t[i] = c; } return t; })();
  function crc8(b, n) { var c = 0; for (var i = 0; i < n; i++) c = CRC8[c ^ b[i]]; return c; }
  function crc16(b, n) { var c = 0; for (var i = 0; i < n; i++) c = ((c << 8) & 0xffff) ^ CRC16[((c >> 8) ^ b[i]) & 0xff]; return c; }
  function crcOgg(b) { var c = 0; for (var i = 0; i < b.length; i++) c = (((c << 8) >>> 0) ^ CRC32OGG[((c >>> 24) ^ b[i]) & 0xff]) >>> 0; return c; }

  // ---------- ビット書き込み ----------
  function BitWriter(cap) { this.b = new Uint8Array(cap || 65536); this.n = 0; this.acc = 0; this.nb = 0; }
  BitWriter.prototype.grow = function () { if (this.n + 8 > this.b.length) { var nb = new Uint8Array(this.b.length * 2); nb.set(this.b); this.b = nb; } };
  BitWriter.prototype.put = function (v, bits) { // bits<=32。vは符号なし(負は下位bitsを使う)
    while (bits > 0) {
      var take = Math.min(bits, 8 - this.nb), shift = bits - take;
      var part = shift >= 32 ? 0 : (v >>> shift) & ((1 << take) - 1);
      this.acc = (this.acc << take) | part; this.nb += take; bits -= take;
      if (this.nb === 8) { this.grow(); this.b[this.n++] = this.acc & 0xff; this.acc = 0; this.nb = 0; }
    }
  };
  BitWriter.prototype.unary = function (q) { while (q >= 24) { this.put(0, 24); q -= 24; } if (q > 0) this.put(0, q); this.put(1, 1); };
  BitWriter.prototype.align = function () { if (this.nb) this.put(0, 8 - this.nb); };

  // ---------- FLAC ----------
  function toInt(chs, bits) {
    var maxv = Math.pow(2, bits - 1), out = [];
    for (var c = 0; c < chs.length; c++) { var f = chs[c], o = new Int32Array(f.length); for (var i = 0; i < f.length; i++) { var x = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]; var v = Math.round(x * maxv); o[i] = v > maxv - 1 ? maxv - 1 : v < -maxv ? -maxv : v; } out.push(o); }
    return out;
  }
  function utf8Num(n) { if (n < 0x80) return [n]; var o = [], bytes = n < 0x800 ? 2 : n < 0x10000 ? 3 : n < 0x200000 ? 4 : n < 0x4000000 ? 5 : 6; var lead = [0, 0, 0xC0, 0xE0, 0xF0, 0xF8, 0xFC][bytes]; for (var i = bytes - 1; i > 0; i--) { o.unshift(0x80 | (n & 0x3f)); n = Math.floor(n / 64); } o.unshift(lead | n); return o; }
  function riceCost(res, n, order, p) { // 最良のパラメータと全体ビット数
    var parts = 1 << p, psz = n >> p, total = 0, ks = [];
    for (var q = 0; q < parts; q++) {
      var s = q * psz + (q === 0 ? order : 0), e = (q + 1) * psz, cnt = e - s, sum = 0;
      for (var i = s; i < e; i++) { var r = res[i]; sum += r >= 0 ? 2 * r : -2 * r - 1; }
      var k = 0; if (cnt > 0 && sum > cnt) { k = Math.floor(Math.log2(sum / cnt)); if (k > 14) k = 14; if (k < 0) k = 0; }
      var bits = cnt * (k + 1) + Math.floor(sum / Math.pow(2, k)); // 単項部の合計の近似(厳密: 各値のq)
      var best = bits, bk = k;
      if (k > 0) { var b2 = cnt * k + Math.floor(sum / Math.pow(2, k - 1)); if (b2 < best) { best = b2; bk = k - 1; } }
      if (k < 14) { var b3 = cnt * (k + 2) + Math.floor(sum / Math.pow(2, k + 1)); if (b3 < best) { best = b3; bk = k + 1; } }
      total += best + 4; ks.push(bk);
    }
    return { bits: total, ks: ks };
  }
  function encodeFlacSub(bw, x, off, n, bps) {
    var best = null;
    for (var order = 0; order <= 4; order++) {
      if (order >= n) break;
      var res = new Int32Array(n), sumAbs = 0;
      for (var i = order; i < n; i++) {
        var a = x[off + i], p;
        if (order === 0) p = 0; else if (order === 1) p = x[off + i - 1];
        else if (order === 2) p = 2 * x[off + i - 1] - x[off + i - 2];
        else if (order === 3) p = 3 * x[off + i - 1] - 3 * x[off + i - 2] + x[off + i - 3];
        else p = 4 * x[off + i - 1] - 6 * x[off + i - 2] + 4 * x[off + i - 3] - x[off + i - 4];
        res[i] = a - p; sumAbs += Math.abs(res[i]);
      }
      if (!best || sumAbs < best.sum) best = { order: order, res: res, sum: sumAbs };
    }
    var order = best.order, res = best.res, bp = null, bpo = 0;
    for (var po = 0; po <= 6; po++) {
      if (n % (1 << po) !== 0 || (n >> po) <= order) continue;
      var c = riceCost(res, n, order, po);
      if (!bp || c.bits < bp.bits) { bp = c; bpo = po; }
    }
    if (!bp) { bpo = 0; bp = riceCost(res, n, order, 0); }
    bw.put(0, 1); bw.put(8 + order, 6); bw.put(0, 1); // 固定予測
    for (var w = 0; w < order; w++) bw.put(x[off + w] & (bps >= 32 ? -1 : (Math.pow(2, bps) - 1)), bps);
    bw.put(0, 2); bw.put(bpo, 4); // 残差: Rice(4bit)
    var parts = 1 << bpo, psz = n >> bpo;
    for (var q = 0; q < parts; q++) {
      var k = bp.ks[q]; bw.put(k, 4);
      var s = q * psz + (q === 0 ? order : 0), e = (q + 1) * psz;
      for (var i2 = s; i2 < e; i2++) { var r = res[i2], u = r >= 0 ? 2 * r : -2 * r - 1, qq = Math.floor(u / Math.pow(2, k)); bw.unary(qq); if (k) bw.put(u % Math.pow(2, k), k); }
    }
  }
  async function encodeFlac(chs, sr, bits, onProgress) {
    bits = bits === 24 || bits === 32 ? 24 : 16;
    var ints = toInt(chs, bits), ch = ints.length, total = ints[0].length, BS = 4096, parts = [];
    // STREAMINFO
    var si = new Uint8Array(4 + 4 + 34), dv = new DataView(si.buffer);
    si.set([0x66, 0x4c, 0x61, 0x43]); // fLaC
    si[4] = 0x80; si[5] = 0; si[6] = 0; si[7] = 34; // 最後のメタデータ・STREAMINFO・長さ34
    dv.setUint16(8, Math.min(BS, total)); dv.setUint16(10, Math.min(BS, total)); // 最小/最大ブロック長
    // 最小/最大フレーム長は0(不明)
    // サンプルレート20bit・ch3bit・bps5bit・総サンプル36bit
    si[18] = (sr >>> 12) & 0xff; si[19] = (sr >>> 4) & 0xff; si[20] = ((sr & 0xf) << 4) | ((ch - 1) << 1) | ((bits - 1) >> 4); si[21] = (((bits - 1) & 0xf) << 4) | (Math.floor(total / 4294967296) & 0xf);
    dv.setUint32(22, total >>> 0);
    parts.push(si);
    var frameNo = 0;
    for (var pos = 0; pos < total; pos += BS, frameNo++) {
      var n = Math.min(BS, total - pos), bw = new BitWriter(n * ch * 4 + 256);
      bw.put(0xfff8, 16); // 同期+固定ブロック長
      bw.put(7, 4); bw.put(0, 4); // ブロック長は16bit値、サンプルレートはSTREAMINFOから
      bw.put(ch - 1, 4); bw.put(0, 3); bw.put(0, 1); // 独立ch・サンプル幅はSTREAMINFOから
      var un = utf8Num(frameNo); for (var u = 0; u < un.length; u++) bw.put(un[u], 8);
      bw.put(n - 1, 16);
      bw.put(crc8(bw.b, bw.n), 8);
      for (var c = 0; c < ch; c++) encodeFlacSub(bw, ints[c], pos, n, bits);
      bw.align();
      var c16 = crc16(bw.b, bw.n); bw.put(c16, 16);
      parts.push(bw.b.slice(0, bw.n));
      if (frameNo % 64 === 0) { if (onProgress) onProgress(pos / total); await yieldUi(); }
    }
    return new Blob(parts, { type: "audio/flac" });
  }

  // ---------- WebCodecs ----------
  var sup = null;
  async function supports() {
    if (sup) return sup;
    sup = { flac: true, ogg: false, m4a: false };
    if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return sup;
    try { sup.ogg = !!(await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) {}
    try { sup.m4a = !!(await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) {}
    return sup;
  }
  // chs(Float32Array[])をAudioEncoderへ流し、符号化済みチャンクを集める
  async function runEncoder(cfg, chs, sr, frameLen, onProgress) {
    var out = [], desc = null, err = null, n = chs[0].length, ch = chs.length;
    var enc = new AudioEncoder({
      output: function (chunk, meta) { var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); out.push({ data: d, ts: chunk.timestamp, dur: chunk.duration }); if (meta && meta.decoderConfig && meta.decoderConfig.description && !desc) { var s = meta.decoderConfig.description; desc = new Uint8Array(s.buffer ? s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength) : s); } },
      error: function (e) { err = e; }
    });
    enc.configure(cfg);
    var BLK = frameLen * 8;
    for (var p = 0, k = 0; p < n; p += BLK, k++) {
      if (err) throw err;
      var e = Math.min(n, p + BLK), len = e - p, data = new Float32Array(len * ch);
      for (var c = 0; c < ch; c++) data.set(chs[c].subarray(p, e), c * len);
      var ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: len, numberOfChannels: ch, timestamp: Math.round(p / sr * 1e6), data: data });
      enc.encode(ad); ad.close();
      while (enc.encodeQueueSize > 8) await yieldUi();
      if (onProgress) onProgress(p / n);
    }
    await enc.flush(); enc.close();
    if (err) throw err;
    return { chunks: out, desc: desc };
  }

  // ---------- Ogg Opus ----------
  function oggPage(serial, seq, gran, flags, segs) { // segs: Uint8Array[](1パケット=1要素)
    var lace = [];
    segs.forEach(function (s) { var l = s.length; while (l >= 255) { lace.push(255); l -= 255; } lace.push(l); });
    var body = 0; segs.forEach(function (s) { body += s.length; });
    var hdr = new Uint8Array(27 + lace.length + body), dv = new DataView(hdr.buffer);
    hdr.set([0x4f, 0x67, 0x67, 0x53]); hdr[4] = 0; hdr[5] = flags;
    dv.setUint32(6, gran % 4294967296, true); dv.setUint32(10, Math.floor(gran / 4294967296), true);
    dv.setUint32(14, serial, true); dv.setUint32(18, seq, true); hdr[26] = lace.length;
    hdr.set(lace, 27); var o = 27 + lace.length; segs.forEach(function (s) { hdr.set(s, o); o += s.length; });
    dv.setUint32(22, crcOgg(hdr), true);
    return hdr;
  }
  function str(s) { return new TextEncoder().encode(s); }
  async function encodeOpus(chs, sr, kbps, onProgress) {
    if (sr !== 48000) throw new Error("Opus needs 48 kHz");
    var ch = chs.length, n = chs[0].length;
    var r = await runEncoder({ codec: "opus", sampleRate: 48000, numberOfChannels: ch, bitrate: kbps * 1000, opus: { frameDuration: 20000 } }, chs, 48000, 960, onProgress);
    var pre = 312; if (r.desc && r.desc.length >= 12 && r.desc[0] === 0x4f) pre = r.desc[10] | (r.desc[11] << 8);
    var head = new Uint8Array(19), hv = new DataView(head.buffer); head.set(str("OpusHead")); head[8] = 1; head[9] = ch; hv.setUint16(10, pre, true); hv.setUint32(12, 48000, true); hv.setUint16(16, 0, true); head[18] = 0;
    var vendor = str("QNPLAYER"), tags = new Uint8Array(8 + 4 + vendor.length + 4), tv = new DataView(tags.buffer); tags.set(str("OpusTags")); tv.setUint32(8, vendor.length, true); tags.set(vendor, 12); tv.setUint32(12 + vendor.length, 0, true);
    var serial = (Math.random() * 4294967295) >>> 0, seq = 0, pages = [oggPage(serial, seq++, 0, 2, [head]), oggPage(serial, seq++, 0, 0, [tags])];
    var group = [], gran = 0, per = 50, packets = r.chunks;
    for (var i = 0; i < packets.length; i++) {
      group.push(packets[i].data); gran += 960;
      var last = i === packets.length - 1;
      if (group.length >= per || last) { pages.push(oggPage(serial, seq++, last ? Math.min(gran, n + pre) : gran, last ? 4 : 0, group)); group = []; }
    }
    return new Blob(pages, { type: "audio/ogg" });
  }

  // ---------- M4A (AAC-LC) ----------
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >> 8) & 255, n & 255]; }
  function box(type, content) { // content: Array|Uint8Array の配列
    var len = 8; content.forEach(function (c) { len += c.length; });
    var o = new Uint8Array(len); o.set(u32(len)); o.set(str(type), 4); var p = 8; content.forEach(function (c) { o.set(c, p); p += c.length; });
    return o;
  }
  function fullBox(type, ver, flags, content) { return box(type, [[ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]].concat(content)); }
  var SR_IDX = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  function makeAsc(sr, ch) { var idx = SR_IDX.indexOf(sr); if (idx < 0) idx = 4; return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (ch << 3)]); }
  function descr(tag, content) { var len = 0; content.forEach(function (c) { len += c.length; }); var o = new Uint8Array(5 + len); o[0] = tag; o[1] = 0x80; o[2] = 0x80; o[3] = 0x80; o[4] = len; var p = 5; content.forEach(function (c) { o.set(c, p); p += c.length; }); return o; }
  function muxM4a(frames, sr, ch, asc, kbps) {
    var n = frames.length, dataLen = 0; frames.forEach(function (f) { dataLen += f.length; });
    var dur = n * 1024, timescale = sr;
    var ftyp = box("ftyp", [str("M4A "), u32(0), str("M4A "), str("mp42"), str("isom")]);
    function buildMoov(offset) {
      var esds = fullBox("esds", 0, 0, [descr(3, [u16(0), [0], descr(4, [[0x40, 0x15, 0, 0, 0], u32(kbps * 1000), u32(kbps * 1000), descr(5, [asc])]), descr(6, [[2]])])]);
      var mp4a = box("mp4a", [[0, 0, 0, 0, 0, 0], u16(1), [0, 0, 0, 0, 0, 0, 0, 0], u16(ch), u16(16), [0, 0, 0, 0], u16(sr > 65535 ? 0 : sr), [0, 0], esds]);
      var stsd = fullBox("stsd", 0, 0, [u32(1), mp4a]);
      var stts = fullBox("stts", 0, 0, [u32(1), u32(n), u32(1024)]);
      var stsc = fullBox("stsc", 0, 0, [u32(1), u32(1), u32(n), u32(1)]);
      var szs = new Uint8Array(n * 4); for (var i = 0; i < n; i++) szs.set(u32(frames[i].length), i * 4);
      var stsz = fullBox("stsz", 0, 0, [u32(0), u32(n), szs]);
      var stco = fullBox("stco", 0, 0, [u32(1), u32(offset)]);
      var stbl = box("stbl", [stsd, stts, stsc, stsz, stco]);
      var dinf = box("dinf", [fullBox("dref", 0, 0, [u32(1), fullBox("url ", 0, 1, [])])]);
      var minf = box("minf", [fullBox("smhd", 0, 0, [u16(0), u16(0)]), dinf, stbl]);
      var hdlr = fullBox("hdlr", 0, 0, [u32(0), str("soun"), u32(0), u32(0), u32(0), [0]]);
      var mdhd = fullBox("mdhd", 0, 0, [u32(0), u32(0), u32(timescale), u32(dur), u16(0x55c4), u16(0)]);
      var mdia = box("mdia", [mdhd, hdlr, minf]);
      var tkhd = fullBox("tkhd", 0, 7, [u32(0), u32(0), u32(1), u32(0), u32(Math.round(dur / timescale * 1000)), u32(0), u32(0), u16(0), u16(0), u16(0x0100), u16(0), [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0], u32(0), u32(0)]);
      var trak = box("trak", [tkhd, mdia]);
      var mvhd = fullBox("mvhd", 0, 0, [u32(0), u32(0), u32(1000), u32(Math.round(dur / timescale * 1000)), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0], new Uint8Array(24), u32(2)]);
      return box("moov", [mvhd, trak]);
    }
    var moov0 = buildMoov(0), offset = ftyp.length + moov0.length + 8, moov = buildMoov(offset);
    var mdatHdr = new Uint8Array(8); mdatHdr.set(u32(dataLen + 8)); mdatHdr.set(str("mdat"), 4);
    return new Blob([ftyp, moov, mdatHdr].concat(frames), { type: "audio/mp4" });
  }
  async function encodeM4a(chs, sr, kbps, onProgress) {
    var ch = chs.length;
    var r = await runEncoder({ codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: ch, bitrate: kbps * 1000, aac: { format: "aac" } }, chs, sr, 1024, onProgress);
    var asc = r.desc && r.desc.length >= 2 ? r.desc : makeAsc(sr, ch);
    return muxM4a(r.chunks.map(function (c) { return c.data; }), sr, ch, asc, kbps);
  }

  window.QNExportCodecs = { supports: supports, encodeFlac: encodeFlac, encodeOpus: encodeOpus, encodeM4a: encodeM4a, _muxM4a: muxM4a, _makeAsc: makeAsc };
})();
