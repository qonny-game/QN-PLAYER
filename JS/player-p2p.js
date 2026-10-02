// player-p2p.js — 端末間のMP3直接転送(v3.29.0)。WebRTC(RTCDataChannel)。MP3はサーバーを通らない・保存されない。詳細: md/SYNC.md「MP3のP2P転送」
// 流れ: 受け取る側が6桁コードを発行→送る側がコードを入れる→接続の合図(offer/answer)だけFirestore(users/{uid}/sync/p2p_<CODE>)経由→以降は端末同士で直接。
// 合図のドキュメントは接続したらすぐ削除(5分で期限切れ)。同じGoogleアカウントでログインしていないと合図が届かない(=他人には渡らない)。
// 依存: QN_AUTH.syncTx/syncGetMany(player-auth.js)、QNLibSync.ghosts/fileFor/isActive(player-sync.js)、addFilesToPlaylist(player-playlist.js)
(function () {
  "use strict";

  var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 紛らわしい I O 0 1 を除く
  var CODE_LEN = 6;
  var SIG_TTL_MS = 5 * 60 * 1000;
  var POLL_MS = 1500;
  var CHUNK = 16 * 1024;                                // 全ブラウザで安全なメッセージ長
  var HIGH_WATER = 1024 * 1024, LOW_WATER = 256 * 1024;
  // 回線によってはSTUNだけでは繋がらない(携帯回線どうし等)。その場合はTURNが必要(将来)。テスト用にwindow.QN_P2P_ICEで上書き可
  function iceServers() { return window.QN_P2P_ICE || [{ urls: "stun:stun.l.google.com:19302" }]; }

  var S = null;   // 進行中のセッション {role, code, pc, dc, cancelled, ...}
  var ui = null;  // {overlay, body}

  function genCode() {
    var a = new Uint32Array(CODE_LEN), out = "";
    crypto.getRandomValues(a);
    for (var i = 0; i < CODE_LEN; i++) out += CODE_CHARS[a[i] % CODE_CHARS.length];
    return out;
  }
  function normCode(v) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN); }
  function sigId(code) { return "p2p_" + code; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function auth() { return window.QN_AUTH; }
  function sigGet(code) { return auth().syncGetMany([sigId(code)]).then(function (r) { return r[0]; }); }
  function sigSet(code, data) { return auth().syncTx(async function (api) { api.set(sigId(code), data); }); }
  function sigDel(code) { return auth().syncTx(async function (api) { api.del(sigId(code)); }).catch(function () {}); }
  function fmtMB(n) { return (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + "MB"; }

  // ---------- 画面 ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(label, cls, fn) { var b = el("button", "qn-p2p-btn " + (cls || ""), label); b.type = "button"; b.addEventListener("click", fn); return b; }
  function ensureUi() {
    if (ui) return;
    var ov = el("div", "qn-p2p-overlay");
    var card = el("div", "qn-p2p-card");
    ov.appendChild(card);
    ov.addEventListener("pointerdown", function (e) { if (e.target === ov && !busy()) close(); });
    document.body.appendChild(ov);
    ui = { overlay: ov, body: card };
  }
  function busy() { return !!(S && S.transferring); }
  function show(nodes) { ensureUi(); ui.body.innerHTML = ""; nodes.forEach(function (n) { if (n) ui.body.appendChild(n); }); ui.overlay.classList.add("open"); }
  function close() {
    cleanup(true);
    if (ui) { ui.overlay.classList.remove("open"); ui.body.innerHTML = ""; }
  }
  function head(t) { return el("div", "qn-p2p-title", t); }
  function note(t, cls) { return el("div", "qn-p2p-note" + (cls ? " " + cls : ""), t); }

  function open() {
    if (!window.QNLibSync || !window.QNLibSync.isActive() || !auth() || typeof auth().syncTx !== "function") {
      toast("転送はGoogleログイン(同期対象のアカウント)中だけ使えます");
      return;
    }
    if (S) { if (S.screen) S.screen(); return; }
    home();
  }
  function toast(t) { if (window.QNApps && typeof window.QNApps.toast === "function") window.QNApps.toast(t); }

  function home() {
    var ghosts = window.QNLibSync.ghosts();
    var recvBtn = btn("📥 受け取る(この端末に入れる)" + (ghosts.length ? "  未インポート " + ghosts.length + "曲" : ""), "primary", pickReceive);
    if (!ghosts.length) { recvBtn.disabled = true; }
    show([
      head("📡 MP3を端末間で転送"),
      note("両方の端末でQNPLAYERを開いたまま、同じGoogleアカウントでログインしてね。MP3はサーバーを通らず、端末どうしで直接送られるよ(保存もされない)。転送中は画面を閉じないでね。"),
      recvBtn,
      ghosts.length ? null : note("受け取れる曲(未インポート)はありません。", "dim"),
      btn("📤 送る(他の端末へ)", "", startSendUi),
      btn("閉じる", "ghost", close)
    ]);
  }

  // ---------- 受け取る側 ----------
  function pickReceive() {
    var ghosts = window.QNLibSync.ghosts();
    var list = el("div", "qn-p2p-list"), checks = [];
    ghosts.forEach(function (g) {
      var row = el("label", "qn-p2p-item");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
      checks.push({ cb: cb, g: g });
      var t = el("span", "qn-p2p-item-t", g.ti || g.n || "(無題)");
      var sz = el("span", "qn-p2p-item-s", g.s ? fmtMB(g.s) : "");
      row.appendChild(cb); row.appendChild(t); row.appendChild(sz);
      list.appendChild(row);
    });
    var all = btn("全部選ぶ/外す", "ghost small", function () {
      var on = checks.some(function (c) { return !c.cb.checked; });
      checks.forEach(function (c) { c.cb.checked = on; });
    });
    show([
      head("📥 受け取る曲を選ぶ"),
      all, list,
      btn("コードを発行して待つ", "primary", function () {
        var items = checks.filter(function (c) { return c.cb.checked && c.g.n; }).map(function (c) { return { h: c.g.h, n: c.g.n, s: c.g.s || 0 }; });
        if (!items.length) { toast("曲を選んでね"); return; }
        startReceive(items);
      }),
      btn("戻る", "ghost", home)
    ]);
  }

  async function startReceive(items) {
    cleanup(false);
    var code = genCode();
    S = { role: "recv", code: code, items: items, total: items.reduce(function (a, i) { return a + (i.s || 0); }, 0), got: 0, done: 0, cancelled: false, transferring: false, files: 0 };
    var sess = S;
    S.screen = function () { screenWait(sess); };
    screenWait(sess);
    try {
      await sigSet(code, { st: "wait", exp: Date.now() + SIG_TTL_MS });
      var deadline = Date.now() + SIG_TTL_MS;
      var offer = null;
      while (!sess.cancelled && Date.now() < deadline) {
        await sleep(POLL_MS);
        var d = await sigGet(code);
        if (d && d.st === "offer" && typeof d.offer === "string") { offer = d.offer; break; }
      }
      if (sess.cancelled) return;
      if (!offer) throw new Error("時間切れ(5分)。もう一度やり直してね");
      status(sess, "接続中…");
      var pc = sess.pc = new RTCPeerConnection({ iceServers: iceServers() });
      pc.ondatachannel = function (e) { sess.dc = e.channel; wireRecv(sess); };
      pc.onconnectionstatechange = function () { if (pc.connectionState === "failed") fail(sess, "接続できませんでした(回線の相性で直接つなげないことがあります)"); };
      await pc.setRemoteDescription({ type: "offer", sdp: offer });
      var ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await iceDone(pc);
      await sigSet(code, { st: "answer", answer: pc.localDescription.sdp, exp: Date.now() + SIG_TTL_MS });
      setTimeout(function () { if (!sess.opened && !sess.cancelled && S === sess) fail(sess, "接続できませんでした(相手が待っていないか、回線の相性で直接つなげません)"); }, 25000);
    } catch (err) { fail(sess, err && err.message ? err.message : String(err)); }
  }
  function screenWait(sess) {
    var codeEl = el("div", "qn-p2p-code", sess.code.slice(0, 3) + " " + sess.code.slice(3));
    var st = el("div", "qn-p2p-status", sess.statusText || "相手の端末で待機中…");
    sess.statusEl = st;
    show([
      head("📥 受け取り待ち"),
      note("送る側の端末で「📤 送る」を開いて、このコードを入れてね。"),
      codeEl, st, progressNode(sess),
      btn(sess.transferring ? "中止" : "やめる", "ghost", close)
    ]);
  }
  function wireRecv(sess) {
    var dc = sess.dc, cur = null;
    dc.binaryType = "arraybuffer";
    dc.onopen = function () {
      sess.opened = true; sess.transferring = true;
      sigDel(sess.code);
      setWake(true);
      status(sess, "転送中…");
      dc.send(JSON.stringify({ t: "want", items: sess.items }));
    };
    dc.onmessage = function (e) {
      if (typeof e.data === "string") {
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === "file") { cur = { h: m.h, n: String(m.n || ""), s: +m.s || 0, m: String(m.m || ""), parts: [], got: 0 }; status(sess, cur.n); }
        else if (m.t === "end" && cur) {
          var f = new File(cur.parts, cur.n, { type: cur.m || "audio/mpeg" });
          if (f.size === cur.s && cur.n) { importFile(f); sess.files++; } else sess.bad = (sess.bad || 0) + 1;
          sess.done++; cur = null; paintProgress(sess);
        } else if (m.t === "skip") { sess.skipped = (sess.skipped || 0) + 1; sess.done++; sess.total -= (sess.items.filter(function (i) { return i.h === m.h; })[0] || {}).s || 0; paintProgress(sess); }
        else if (m.t === "done") { finish(sess); }
        return;
      }
      if (cur) { cur.parts.push(e.data); cur.got += e.data.byteLength; sess.got += e.data.byteLength; paintProgress(sess); }
    };
    dc.onclose = function () { if (S === sess && sess.transferring && !sess.finished) fail(sess, "接続が切れました。もう一度やり直してね(受け取れた曲は入っています)"); };
  }
  function importFile(f) {
    var wasEmpty = typeof playlist !== "undefined" && playlist.length === 0;
    addFilesToPlaylist([f]);
    // 空のライブラリへ最初の1曲が入ると自動再生されるので止める
    if (wasEmpty && typeof audio !== "undefined") { try { audio.pause(); } catch (e) {} }
  }

  // ---------- 送る側 ----------
  function startSendUi() {
    var inp = document.createElement("input");
    inp.type = "text"; inp.className = "qn-p2p-input"; inp.maxLength = 7; inp.placeholder = "ABC 123";
    inp.autocapitalize = "characters"; inp.autocomplete = "off"; inp.spellcheck = false;
    inp.addEventListener("input", function () { var c = normCode(inp.value); inp.value = c.length > 3 ? c.slice(0, 3) + " " + c.slice(3) : c; });
    var go = btn("接続して送る", "primary", function () { var c = normCode(inp.value); if (c.length !== CODE_LEN) { toast("6文字のコードを入れてね"); return; } startSend(c); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    show([
      head("📤 送る"),
      note("受け取る側の端末に表示されている6文字のコードを入れてね。この端末にあるMP3のうち、相手が選んだ曲だけが送られるよ。"),
      inp, go, btn("戻る", "ghost", home)
    ]);
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }
  async function startSend(code) {
    cleanup(false);
    S = { role: "send", code: code, total: 0, got: 0, done: 0, cancelled: false, transferring: false, files: 0 };
    var sess = S;
    S.screen = function () { screenSend(sess); };
    screenSend(sess);
    try {
      status(sess, "コードを確認中…");
      var d = await sigGet(code);
      if (!d || d.st !== "wait" || !(d.exp > Date.now())) throw new Error("そのコードの待機が見つかりません(期限切れ/入力ミス/別のGoogleアカウント)");
      var pc = sess.pc = new RTCPeerConnection({ iceServers: iceServers() });
      var dc = sess.dc = pc.createDataChannel("qn", { ordered: true });
      dc.bufferedAmountLowThreshold = LOW_WATER;
      wireSend(sess);
      pc.onconnectionstatechange = function () { if (pc.connectionState === "failed") fail(sess, "接続できませんでした(回線の相性で直接つなげないことがあります)"); };
      status(sess, "接続中…");
      var off = await pc.createOffer();
      await pc.setLocalDescription(off);
      await iceDone(pc);
      await sigSet(code, { st: "offer", offer: pc.localDescription.sdp, exp: Date.now() + SIG_TTL_MS });
      var deadline = Date.now() + 60000, ans = null;
      while (!sess.cancelled && Date.now() < deadline) {
        await sleep(POLL_MS);
        var r = await sigGet(code);
        if (r && r.st === "answer" && typeof r.answer === "string") { ans = r.answer; break; }
      }
      if (sess.cancelled) return;
      if (!ans) throw new Error("相手が応答しません。受け取る側の画面を開いたままにしてね");
      await pc.setRemoteDescription({ type: "answer", sdp: ans });
      setTimeout(function () { if (!sess.opened && !sess.cancelled && S === sess) fail(sess, "接続できませんでした(回線の相性で直接つなげません)"); }, 25000);
    } catch (err) { fail(sess, err && err.message ? err.message : String(err)); }
  }
  function screenSend(sess) {
    var st = el("div", "qn-p2p-status", sess.statusText || "…");
    sess.statusEl = st;
    show([head("📤 送信"), st, progressNode(sess), btn(sess.transferring ? "中止" : "やめる", "ghost", close)]);
  }
  function wireSend(sess) {
    var dc = sess.dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = function () { sess.opened = true; setWake(true); status(sess, "相手の指示を待っています…"); };
    dc.onmessage = function (e) {
      if (typeof e.data !== "string") return;
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === "want" && Array.isArray(m.items) && !sess.started) { sess.started = true; sess.transferring = true; sendAll(sess, m.items.slice(0, 5000)); }
    };
    dc.onclose = function () { if (S === sess && sess.transferring && !sess.finished) fail(sess, "接続が切れました"); };
  }
  function waitDrain(dc) {
    if (dc.bufferedAmount <= HIGH_WATER) return Promise.resolve();
    return new Promise(function (res) { dc.onbufferedamountlow = function () { dc.onbufferedamountlow = null; res(); }; });
  }
  async function sendAll(sess, items) {
    var dc = sess.dc, plan = [];
    items.forEach(function (it) {
      if (!it || typeof it.h !== "string") return;
      var f = window.QNLibSync.fileFor(it.h);
      plan.push({ h: it.h, f: f });
    });
    sess.total = plan.reduce(function (a, p) { return a + (p.f ? p.f.size : 0); }, 0);
    paintProgress(sess);
    try {
      for (var i = 0; i < plan.length; i++) {
        if (sess.cancelled) return;
        var p = plan[i];
        if (!p.f) { dc.send(JSON.stringify({ t: "skip", h: p.h })); sess.skipped = (sess.skipped || 0) + 1; continue; }
        status(sess, p.f.name);
        dc.send(JSON.stringify({ t: "file", h: p.h, n: p.f.name, s: p.f.size, m: p.f.type || "audio/mpeg" }));
        for (var off = 0; off < p.f.size; off += CHUNK) {
          if (sess.cancelled || dc.readyState !== "open") throw new Error("接続が切れました");
          var buf = await p.f.slice(off, off + CHUNK).arrayBuffer();
          await waitDrain(dc);
          dc.send(buf);
          sess.got += buf.byteLength;
          paintProgress(sess);
        }
        dc.send(JSON.stringify({ t: "end", h: p.h }));
        sess.done++; sess.files++;
        paintProgress(sess);
      }
      dc.send(JSON.stringify({ t: "done" }));
      // 相手が受け取り終えるまで少し待ってから閉じる(送信バッファが空になるまで)
      var t0 = Date.now();
      while (dc.bufferedAmount > 0 && Date.now() - t0 < 15000) await sleep(100);
      await sleep(300);
      finish(sess);
    } catch (err) { fail(sess, err && err.message ? err.message : String(err)); }
  }

  // ---------- 共通 ----------
  function iceDone(pc) {   // 経路候補が出そろうまで待つ(出そろった状態で1回だけ合図を書くため。最大5秒)
    return new Promise(function (res) {
      if (pc.iceGatheringState === "complete") { res(); return; }
      var t = setTimeout(done, 5000);
      function done() { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", chk); res(); }
      function chk() { if (pc.iceGatheringState === "complete") done(); }
      pc.addEventListener("icegatheringstatechange", chk);
    });
  }
  function progressNode(sess) {
    var wrap = el("div", "qn-p2p-prog");
    var bar = el("div", "qn-p2p-bar"), fill = el("i");
    bar.appendChild(fill);
    var txt = el("div", "qn-p2p-prog-t");
    wrap.appendChild(bar); wrap.appendChild(txt);
    sess.progFill = fill; sess.progText = txt;
    paintProgress(sess);
    return wrap;
  }
  function paintProgress(sess) {
    if (!sess.progFill) return;
    var pct = sess.total > 0 ? Math.min(100, Math.round(sess.got / sess.total * 100)) : 0;
    sess.progFill.style.width = pct + "%";
    sess.progText.textContent = sess.total > 0 ? (sess.role === "recv" ? "受信 " : "送信 ") + fmtMB(sess.got) + " / " + fmtMB(sess.total) + "  (" + pct + "%)" + (sess.files ? "  ・" + sess.files + "曲 完了" : "") : "";
  }
  function status(sess, t) { sess.statusText = t; if (sess.statusEl) sess.statusEl.textContent = t; }
  function setWake(on) { try { if (window.QNWake) window.QNWake.set("p2p", on); } catch (e) {} }
  function finish(sess) {
    if (sess.finished) return;
    sess.finished = true; sess.transferring = false;
    var n = sess.files, extra = (sess.skipped ? "(送れなかった曲 " + sess.skipped + ")" : "") + (sess.bad ? "(壊れて取り込めなかった曲 " + sess.bad + ")" : "");
    cleanup(false);
    show([head(sess.role === "recv" ? "✅ 受け取り完了" : "✅ 送信完了"), note(n + "曲" + (sess.role === "recv" ? "をこの端末に入れました。" : "を送りました。") + extra), btn("閉じる", "primary", close)]);
    if (sess.role === "recv" && window.QNLibSync) setTimeout(function () { window.QNLibSync.syncNow(); }, 800);   // 取り込んだ曲に他端末の設定を適用
  }
  function fail(sess, msg) {
    if (sess.finished || sess.failed) return;
    sess.failed = true; sess.transferring = false;
    cleanup(false);
    show([head("⚠ 転送できませんでした"), note(msg), btn("閉じる", "primary", close)]);
    if (window.QNLibSync && sess.role === "recv" && sess.files) setTimeout(function () { window.QNLibSync.syncNow(); }, 800);
  }
  function cleanup(userCancel) {
    var s = S; S = null;
    if (!s) return;
    if (userCancel) s.cancelled = true;
    setWake(false);
    try { if (s.dc) { s.dc.onclose = null; s.dc.close(); } } catch (e) {}
    try { if (s.pc) { s.pc.onconnectionstatechange = null; s.pc.close(); } } catch (e) {}
    if (s.role === "recv" && !s.opened) sigDel(s.code);
    if (s.role === "send" && !s.opened) sigDel(s.code);
    if (userCancel && s.files && s.role === "recv" && window.QNLibSync) setTimeout(function () { window.QNLibSync.syncNow(); }, 800);
  }

  window.QNP2P = { open: open, _state: function () { return S; } };
})();
