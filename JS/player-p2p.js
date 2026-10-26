// player-p2p.js — 端末間のMP3直接転送。WebRTC(RTCDataChannel)。MP3はサーバーを通らない・保存されない。詳細: md/SYNC.md「MP3のP2P転送」
// 流れ: 送る側がSendで6文字コードを発行して待機→受け取る側がReceiveで曲を選んでコードを入力→接続の合図(offer/answer)だけFirestore(users/{uid}/sync/p2p_<CODE>)経由→以降は端末同士で直接。
// 合図のドキュメントは接続したらすぐ削除(5分で期限切れ)。同じGoogleアカウントでログインしていないと合図が届かない(=他人には渡らない)。
// 接続済みの端末: 接続できた相手の端末ID・種別をlocalStorageに覚え、送信側は待機中、端末ID付きの合図(users/{uid}/sync/p2p_d_<端末ID>)にもコードを書く→受信側は覚えている端末の待機を探して、コード入力なしで接続できる。
// QR: 送信側がコードをQRで表示(JS/qr/qrcode.min.js)、受信側がカメラで読む(JS/qr/jsQR.min.js)。どちらも使う画面を開いた時に初めて読み込む。
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

  var PEERS_KEY = "qn_p2p_peers", DEV_KEY = "qn_p2p_dev", PEERS_MAX = 5, QR_PREFIX = "QNP2P:";
  var ID_RE = /^[a-z0-9]{8,20}$/;

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
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function myId() {
    var v = lsGet(DEV_KEY);
    if (!ID_RE.test(v || "")) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); lsSet(DEV_KEY, v); }
    return v;
  }
  function myName() { return window.QNLibSync && typeof window.QNLibSync.devLabel === "function" ? window.QNLibSync.devLabel() : "Other"; }
  function presId(id) { return "p2p_d_" + id; }
  function readPeers() {
    try {
      var a = JSON.parse(lsGet(PEERS_KEY) || "[]");
      return Array.isArray(a) ? a.filter(function (p) { return p && ID_RE.test(p.id || ""); }).slice(0, PEERS_MAX) : [];
    } catch (e) { return []; }
  }
  function rememberPeer(id, name) {
    if (typeof id !== "string" || !ID_RE.test(id) || id === myId()) return;
    var a = readPeers().filter(function (p) { return p.id !== id; });
    a.unshift({ id: id, n: String(name || "").slice(0, 12) || "Other" });
    lsSet(PEERS_KEY, JSON.stringify(a.slice(0, PEERS_MAX)));
  }
  function forgetPeer(id) { lsSet(PEERS_KEY, JSON.stringify(readPeers().filter(function (p) { return p.id !== id; }))); }
  function delPres() { auth().syncTx(async function (api) { api.del(presId(myId())); }).catch(function () {}); }
  function parseQr(s) { var m = /^QNP2P:([A-Z0-9]{6})$/.exec(String(s || "").trim()); return m ? normCode(m[1]) : null; }
  var libs = {};
  function loadLib(src) {
    if (!libs[src]) libs[src] = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src + "?v=" + (window.QN_APP_VERSION || ""); s.onload = res; s.onerror = function () { delete libs[src]; rej(new Error("load failed")); };
      document.head.appendChild(s);
    });
    return libs[src];
  }
  function fmtMB(n) { return (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + "MB"; }

  // ---------- 画面(設定の下層パネル。Backup/Importと同じ器・部品: .export-modal-body/.export-section/.export-modal-footer/.export-run-btn/.export-cancel-btn/.track-backup-*。見た目はstyle-pcv2-panels.cssのBackup用ルールを共用) ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var host = null;       // 表示先の入れ物(mountで作る。パネルを離れるとDOMから外れ、描画は何もしない)
  var dismissFn = null;  // 戻り先(設定の一覧へ)
  function busy() { return !!(S && S.transferring); }
  function dismiss() { if (typeof dismissFn === "function") dismissFn(); }
  // 1画面を組み立てる: body=[node] / footer=[node]。statusは左側の状態表示(.export-status)。見出しはパネルのヘッダー(Transfer)が担う
  var screenTok = 0;     // 画面が替わるたびに増える。待機中の非同期処理(端末の探索・カメラ)が古い画面で動き続けないための目印
  var scan = null;       // {stream, timer}
  function stopScan() {
    var s = scan; scan = null;
    if (!s) return;
    clearInterval(s.timer);
    try { s.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  }
  function show(o) {
    screenTok++; stopScan();
    if (!host || !host.isConnected) return el("div", "export-status");
    host.textContent = "";
    var body = el("div", "export-modal-body");
    (o.body || []).forEach(function (n) { if (n) body.appendChild(n); });
    var f = el("div", "export-modal-footer");
    var st = el("div", "export-status" + (o.error ? " error" : o.ok ? " success" : ""), o.status || "");
    f.appendChild(st);
    (o.footer || []).forEach(function (n) { f.appendChild(n); });
    host.appendChild(body); host.appendChild(f);
    return st;
  }
  function section(label, nodes) {
    var s = el("div", "export-section");
    if (label) s.appendChild(el("label", "export-section-label", label));
    nodes.forEach(function (n) { if (n) s.appendChild(n); });
    return s;
  }
  function text(t) { return el("div", "qn-p2p-text", t); }
  function runBtn(label, fn) { var b = el("button", "export-run-btn", label); b.type = "button"; b.addEventListener("click", fn); return b; }
  function cancelBtn(label, fn) { var b = el("button", "export-cancel-btn", label); b.type = "button"; b.addEventListener("click", fn); return b; }
  function miniBtn(label, fn) { var b = el("button", "track-backup-mini-btn", label); b.type = "button"; b.addEventListener("click", fn); return b; }
  // 進行中の送受信を止めて最初の画面へ
  function stop() { cleanup(true); home(); }

  // 設定の下層パネル/アプリのSettingsから呼ぶ。hostElの中に入れ物を作って描画し、onDismissで一覧へ戻る。進行中なら今の画面を出し直す
  function mount(hostEl, onDismiss) {
    dismissFn = onDismiss;
    if (!window.QNLibSync || !window.QNLibSync.isActive() || !auth() || typeof auth().syncTx !== "function") {
      toast("転送には同期対象アカウントでのログインが必要です");
      setTimeout(dismiss, 0);
      return;
    }
    host = el("div", "qn-p2p-host");
    hostEl.appendChild(host);
    if (S) { if (S.screen) S.screen(); return; }
    home();
  }
  function toast(t) { if (window.QNApps && typeof window.QNApps.toast === "function") window.QNApps.toast(t); }

  function home() {
    var ghosts = window.QNLibSync.ghosts();
    var rb = runBtn("Receive", pickReceive);
    if (!ghosts.length) rb.disabled = true;
    var sb = runBtn("Send", startSendWait);
    show({
      body: [
        text("同じGoogleアカウントでログインしている端末どうしで、MP3を直接転送します。音声データはサーバーを経由せず、保存もされません。転送中は両方の端末でこの画面を開いたままにしてください。"),
        section("送信", [text("コードとQRコードを表示して、受信側の接続を待ちます。先に送信側で開始してください。"), sb]),
        section("受信", [text(ghosts.length ? "送信側のコードを入力するか、QRコードを読み取って、曲を受け取ります。以前つないだ端末なら、コードなしで接続できます。(未インポート: " + ghosts.length + "曲)" : "受け取れる曲(未インポート)はありません。"), rb]),
        peersSection()
      ],
      footer: []   // 戻るはパネルのヘッダーの矢印(Backup/Importと同じ)
    });
  }

  // 接続済みの端末の一覧(解除できる)。無ければ出さない
  function peersSection() {
    var peers = readPeers();
    if (!peers.length) return null;
    var list = el("div", "qn-p2p-peers");
    peers.forEach(function (p) {
      var row = el("div", "qn-p2p-peer");
      row.appendChild(el("span", "qn-p2p-peer-name", p.n));
      row.appendChild(miniBtn("解除", function () { forgetPeer(p.id); home(); }));
      list.appendChild(row);
    });
    return section("接続済みの端末", [list, text("コードなしで接続できる端末です。解除すると、次からはコードの入力が必要になります。")]);
  }

  // ---------- 受け取る側(コードを入力して接続する側) ----------
  function pickReceive() {
    var ghosts = window.QNLibSync.ghosts();
    var list = el("div", "track-backup-tracklist"), checks = [];
    var countEl = el("span", "", ""), sizeEl = el("span", "", "");
    function summary() {
      var n = 0, s = 0;
      checks.forEach(function (c) { if (c.cb.checked) { n++; s += c.g.s || 0; } });
      countEl.textContent = n + "曲選択中"; sizeEl.textContent = fmtMB(s);
    }
    ghosts.forEach(function (g) {
      var row = el("label", "track-backup-track-row");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
      cb.addEventListener("change", summary);
      checks.push({ cb: cb, g: g });
      row.appendChild(cb);
      row.appendChild(el("span", "track-backup-track-name", g.ti || g.n || "(無題)"));
      row.appendChild(el("span", "track-backup-track-size", g.s ? fmtMB(g.s) : ""));
      list.appendChild(row);
    });
    function setAll(on) { checks.forEach(function (c) { c.cb.checked = on; }); summary(); }
    var head = el("div", "track-backup-tracklist-header");
    head.appendChild(el("label", "export-section-label", "曲を選択"));
    var acts = el("div", "track-backup-tracklist-actions");
    acts.appendChild(miniBtn("全選択", function () { setAll(true); }));
    acts.appendChild(miniBtn("全解除", function () { setAll(false); }));
    head.appendChild(acts);
    var sizeRow = el("div", "track-backup-size-row");
    sizeRow.appendChild(countEl); sizeRow.appendChild(sizeEl);
    summary();
    show({
      body: [section(null, [head, list, sizeRow])],
      footer: [
        cancelBtn("Back", home),
        runBtn("Next", function () {
          var items = checks.filter(function (c) { return c.cb.checked && c.g.n; }).map(function (c) { return { h: c.g.h, n: c.g.n, s: c.g.s || 0 }; });
          if (!items.length) { toast("曲を選択してください"); return; }
          codeEntry(items);
        })
      ]
    });
  }
  function codeEntry(items) {
    var inp = document.createElement("input");
    inp.type = "text"; inp.className = "export-filename-input qn-p2p-input"; inp.maxLength = 8; inp.placeholder = "ABC123";
    inp.autocapitalize = "characters"; inp.autocomplete = "off"; inp.spellcheck = false; inp.setAttribute("autocorrect", "off"); inp.setAttribute("enterkeyhint", "go");
    // 入力中にinp.valueを書き換えない(iOSのキーボードが同じ文字を二重に入れる)。整形・大文字化はフォーカスを外した時だけ。入力値の解釈はnormCode(Connect時)
    inp.addEventListener("blur", function () { inp.value = normCode(inp.value); });
    var go = runBtn("Connect", function () { var c = normCode(inp.value); if (c.length !== CODE_LEN) { toast("6文字のコードを入力してください"); return; } startReceive(c, items); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    var canScan = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    var scanBtn = canScan ? cancelBtn("Scan QR", function () { scanScreen(items); }) : null;
    if (scanBtn) scanBtn.classList.add("qn-p2p-scan-btn");
    var peers = readPeers(), rows = [], peerSec = null;
    if (peers.length) {
      var list = el("div", "qn-p2p-peers");
      peers.forEach(function (p) {
        var row = el("div", "qn-p2p-peer"), st = el("span", "qn-p2p-peer-st", "待機を探しています"), b = runBtn("Connect", function () {});
        b.disabled = true;
        var info = el("span", "qn-p2p-peer-info"); info.appendChild(el("span", "qn-p2p-peer-name", p.n)); info.appendChild(st);
        row.appendChild(info); row.appendChild(b); list.appendChild(row);
        rows.push({ id: p.id, set: function (d) {
          st.textContent = d ? "送信待機中" : "待機を探しています";
          b.disabled = !d;
          b.onclick = d ? function () { startReceive(normCode(d.code), items); } : null;
        } });
      });
      peerSec = section("接続済みの端末", [list, text("以前つないだ端末が送信待機中なら、コードなしで接続できます。")]);
    }
    show({
      body: [
        peerSec,
        section("コード", [inp, scanBtn, text("送信側の端末に表示されている6文字のコードを入力するか、QRコードを読み取ってください。選択した " + items.length + "曲のうち、送信側の端末にあるMP3だけが受信されます。")])
      ],
      footer: [cancelBtn("Back", pickReceive), go]
    });
    if (rows.length) watchPeers(screenTok, rows);
    setTimeout(function () { try { if (!peerSec) inp.focus(); } catch (e) {} }, 50);
  }
  // 覚えている端末の送信待機を探す(この画面にいる間だけ、3秒ごと。最長5分)
  async function watchPeers(tok, rows) {
    var until = Date.now() + SIG_TTL_MS;
    while (tok === screenTok && host && host.isConnected && Date.now() < until) {
      try {
        var docs = await auth().syncGetMany(rows.map(function (r) { return presId(r.id); }));
        if (tok !== screenTok) return;
        docs.forEach(function (d, i) { rows[i].set(d && d.st === "wait" && typeof d.code === "string" && d.exp > Date.now() ? d : null); });
      } catch (e) {}
      await sleep(3000);
    }
  }
  // QRコードを読み取る画面。読めたらそのコードで接続を始める。カメラはこの画面を離れると止まる(show()が止める)
  async function scanScreen(items) {
    var video = document.createElement("video");
    video.setAttribute("playsinline", ""); video.muted = true; video.className = "qn-p2p-video";
    var box = el("div", "qn-p2p-scan");
    box.appendChild(video); box.appendChild(el("div", "qn-p2p-scan-frame"));
    var st = show({
      body: [section("QRコード", [box, text("送信側の画面に表示されているQRコードを、枠の中に映してください。")])],
      status: "カメラを起動中",
      footer: [cancelBtn("Back", function () { codeEntry(items); })]
    });
    var tok = screenTok;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (tok !== screenTok) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      scan = { stream: stream, timer: 0 };
      video.srcObject = stream;
      await video.play();
      await loadLib("JS/qr/jsQR.min.js");
      if (tok !== screenTok) return;
      st.textContent = "QRコードを探しています";
      var cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
      scan.timer = setInterval(function () {
        if (tok !== screenTok || !host || !host.isConnected) { stopScan(); return; }
        if (!video.videoWidth) return;
        var k = Math.min(1, 640 / video.videoWidth), w = Math.round(video.videoWidth * k), h = Math.round(video.videoHeight * k);
        cv.width = w; cv.height = h;
        cx.drawImage(video, 0, 0, w, h);
        var r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        var c = r && parseQr(r.data);
        if (c) { stopScan(); startReceive(c, items); }
      }, 200);
    } catch (e) {
      if (tok !== screenTok) return;
      toast("カメラを使えませんでした。コードを入力してください");
      codeEntry(items);
    }
  }
  async function startReceive(code, items) {
    cleanup(false);
    S = { role: "recv", code: code, items: items, total: items.reduce(function (a, i) { return a + (i.s || 0); }, 0), got: 0, done: 0, cancelled: false, transferring: false, files: 0 };
    var sess = S;
    S.screen = function () { screenRecv(sess); };
    screenRecv(sess);
    try {
      status(sess, "コードを確認中");
      var d = await sigGet(code);
      if (!d || d.st !== "wait" || !(d.exp > Date.now())) throw new Error("このコードの待機が見つかりません。期限切れ、入力ミス、または別のGoogleアカウントの可能性があります");
      var pc = sess.pc = new RTCPeerConnection({ iceServers: iceServers() });
      sess.dc = pc.createDataChannel("qn", { ordered: true });
      wireRecv(sess);
      pc.onconnectionstatechange = function () { if (pc.connectionState === "failed") fail(sess, "接続できませんでした。回線の組み合わせによっては直接接続できない場合があります"); };
      status(sess, "接続中");
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
      if (!ans) throw new Error("送信側が応答しません。送信側の画面を開いたままにしてください");
      await pc.setRemoteDescription({ type: "answer", sdp: ans });
      setTimeout(function () { if (!sess.opened && !sess.cancelled && S === sess) fail(sess, "接続できませんでした。回線の組み合わせにより直接接続できません"); }, 25000);
    } catch (err) { fail(sess, err && err.message ? err.message : String(err)); }
  }
  function screenRecv(sess) {
    var st = show({
      body: [section("進行状況", [progressNode(sess)])],
      status: sess.statusText || "",
      footer: [cancelBtn(sess.transferring ? "Stop" : "Cancel", stop)]
    });
    sess.statusEl = st;
  }
  function wireRecv(sess) {
    var dc = sess.dc, cur = null;
    dc.binaryType = "arraybuffer";
    dc.onopen = function () {
      sess.opened = true; sess.transferring = true;
      sigDel(sess.code);
      setWake(true);
      status(sess, "転送中");
      dc.send(JSON.stringify({ t: "hi", id: myId(), n: myName() }));
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
        else if (m.t === "hi") { rememberPeer(m.id, m.n); }
        return;
      }
      if (cur) { cur.parts.push(e.data); cur.got += e.data.byteLength; sess.got += e.data.byteLength; paintProgress(sess); }
    };
    dc.onclose = function () { if (S === sess && sess.transferring && !sess.finished) fail(sess, "接続が切れました。もう一度やり直してください(受信済みの曲は取り込まれています)"); };
  }
  function importFile(f) {
    var wasEmpty = typeof playlist !== "undefined" && playlist.length === 0;
    addFilesToPlaylist([f]);
    // 空のライブラリへ最初の1曲が入ると自動再生されるので止める
    if (wasEmpty && typeof audio !== "undefined") { try { audio.pause(); } catch (e) {} }
  }

  // ---------- 送る側 ----------

  // ---------- 送る側(コードを表示して待機する側) ----------
  async function startSendWait() {
    cleanup(false);
    var code = genCode();
    S = { role: "send", code: code, total: 0, got: 0, done: 0, cancelled: false, transferring: false, files: 0 };
    var sess = S;
    S.screen = function () { screenSendWait(sess); };
    screenSendWait(sess);
    try {
      await auth().syncTx(async function (api) {
        var exp = Date.now() + SIG_TTL_MS;
        api.set(sigId(code), { st: "wait", exp: exp });
        api.set(presId(myId()), { st: "wait", code: code, n: myName(), exp: exp });
      });
      var deadline = Date.now() + SIG_TTL_MS, offer = null;
      while (!sess.cancelled && Date.now() < deadline) {
        await sleep(POLL_MS);
        var d = await sigGet(code);
        if (d && d.st === "offer" && typeof d.offer === "string") { offer = d.offer; break; }
      }
      delPres();
      if (sess.cancelled) return;
      if (!offer) throw new Error("待機が時間切れになりました(5分)。もう一度やり直してください");
      status(sess, "接続中");
      var pc = sess.pc = new RTCPeerConnection({ iceServers: iceServers() });
      pc.ondatachannel = function (e) { sess.dc = e.channel; wireSend(sess); };
      pc.onconnectionstatechange = function () { if (pc.connectionState === "failed") fail(sess, "接続できませんでした。回線の組み合わせによっては直接接続できない場合があります"); };
      await pc.setRemoteDescription({ type: "offer", sdp: offer });
      var ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await iceDone(pc);
      await sigSet(code, { st: "answer", answer: pc.localDescription.sdp, exp: Date.now() + SIG_TTL_MS });
      setTimeout(function () { if (!sess.opened && !sess.cancelled && S === sess) fail(sess, "接続できませんでした。相手が接続していないか、回線の組み合わせにより直接接続できません"); }, 25000);
    } catch (err) { fail(sess, err && err.message ? err.message : String(err)); }
  }
  function screenSendWait(sess) {
    var codeEl = el("div", "qn-p2p-code", sess.code.slice(0, 3) + " " + sess.code.slice(3));
    var qrBox = sess.transferring ? null : el("div", "qn-p2p-qr");
    var st = show({
      body: [
        section("コード", [codeEl, qrBox, text("受信側の端末で Receive を開き、曲を選択してから、このコードを入力するかQRコードを読み取ってください。以前つないだ端末は、コードなしで接続できます。有効期限は5分です。")]),
        sess.transferring ? section("進行状況", [progressNode(sess)]) : null
      ],
      status: sess.statusText || "待機中",
      footer: [cancelBtn(sess.transferring ? "Stop" : "Cancel", stop)]
    });
    sess.statusEl = st;
    if (qrBox) loadLib("JS/qr/qrcode.min.js").then(function () {
      var q = window.qrcode(0, "M");
      q.addData(QR_PREFIX + sess.code); q.make();
      qrBox.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    }).catch(function () { qrBox.remove(); });
  }
  function wireSend(sess) {
    var dc = sess.dc;
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = LOW_WATER;
    // ondatachannelの時点で既に開いていると'open'が来ないので、開いていれば今すぐ同じ処理をする。hiは受け取った時にも(まだなら)返す
    function hello() { if (sess.hiSent || dc.readyState !== "open") return; sess.hiSent = true; dc.send(JSON.stringify({ t: "hi", id: myId(), n: myName() })); }
    function onOpen() { if (sess.opened) return; sess.opened = true; setWake(true); status(sess, "受信側の応答待ち"); hello(); }
    dc.onopen = onOpen;
    if (dc.readyState === "open") onOpen();
    dc.onmessage = function (e) {
      if (typeof e.data !== "string") return;
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === "hi") { rememberPeer(m.id, m.n); hello(); return; }
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
    sess.progText.textContent = sess.total > 0 ? fmtMB(sess.got) + " / " + fmtMB(sess.total) + "  (" + pct + "%)" + (sess.files ? "  ・  " + sess.files + "曲完了" : "") : "";
  }
  function status(sess, t) { sess.statusText = t; if (sess.statusEl) sess.statusEl.textContent = t; }
  function setWake(on) { try { if (window.QNWake) window.QNWake.set("p2p", on); } catch (e) {} }
  function finish(sess) {
    if (sess.finished) return;
    sess.finished = true; sess.transferring = false;
    var n = sess.files, extra = (sess.skipped ? "(送信できなかった曲: " + sess.skipped + ")" : "") + (sess.bad ? "(取り込めなかった曲: " + sess.bad + ")" : "");
    cleanup(false);
    show({
      title: sess.role === "recv" ? "Receive" : "Send",
      body: [section("RESULT", [text(n + "曲を" + (sess.role === "recv" ? "受信しました。" : "送信しました。") + extra)])],
      status: "完了", ok: true,
      footer: [runBtn("Close", dismiss)]
    });
    if (sess.role === "recv" && window.QNLibSync) setTimeout(function () { window.QNLibSync.syncNow(); }, 800);   // 取り込んだ曲に他端末の設定を適用
  }
  function fail(sess, msg) {
    if (sess.finished || sess.failed) return;
    sess.failed = true; sess.transferring = false;
    cleanup(false);
    show({
      title: sess.role === "recv" ? "Receive" : "Send",
      body: [section("ERROR", [text(msg)])],
      status: "転送できませんでした", error: true,
      footer: [runBtn("Close", dismiss)]
    });
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
    if (s.role === "send") { if (!s.opened) sigDel(s.code); delPres(); }
    if (userCancel && s.files && s.role === "recv" && window.QNLibSync) setTimeout(function () { window.QNLibSync.syncNow(); }, 800);
  }

  window.QNP2P = { mount: mount, _state: function () { return S; } };
})();
