// player-sync.js — 本体Library(曲ごとの情報)の端末間同期。詳細・合体ルール: md/SYNC.md「Library同期」
// 同期するもの: 曲ごとの 曲名/アーティスト/ON-OFF/お気に入り/フォルダ/マーカー(スキップ区間含む)/A-Bループ/テキストメモ/歌詞の行ごとの時刻 + フォルダ定義 + 並び順。
// 追加で同期: セットリスト(qn_setlists_v1)・PIN内の並び(qn_pin_order)= lib_extra(曲とは別。cycleの後のextraStep)。
// 同期しないもの: MP3本体(音声)、アプリ設定(音量/テーマ/EQ等)、フォルダの開閉、YouTube由来のタイトル。
// 曲の同一判定 = ファイル名+サイズ(hash)。他端末にMP3が無い曲は「未インポート」(ghost)として並び、後でMP3を入れると設定が自動で付く。
// Firestore(users/{uid}/sync/): lib_index(曲hash→更新時刻) / lib_folders / lib_order / t_<hash>(1曲1ドキュメント)。通信はplayer-auth.jsのQN_AUTH.syncTx/syncGetMany。
// 方針: ローカル優先・曲ごとにupdatedAtが新しい方・同時刻はサーバー側・削除はtombstone。削除しても他端末のMP3は消さない(同期から外れるだけ)。
(function () {
  "use strict";

  var META_KEY = "qn_libsync_meta_v1";
  var DOC_INDEX = "lib_index", DOC_FOLDERS = "lib_folders", DOC_ORDER = "lib_order", DOC_DEVICES = "lib_devices", DOC_EXTRA = "lib_extra";
  var DEV_FRESH_MS = 30 * 24 * 60 * 60 * 1000, DEV_REFRESH_MS = 3 * 24 * 60 * 60 * 1000, DEV_MISS_MAX = 2000;
  var TOMB_TTL_MS = 180 * 24 * 60 * 60 * 1000;
  var CHUNK = 150;                                   // 1トランザクションで書く曲数(Firestoreは500書き込みまで)
  var PIN_MAX = 500, TEXT_MAX = 50000, MEMO_MAX = 500, TITLE_MAX = 300, LY_MAX = 300, LY_TEXT_MAX = 1000;

  var origSetItem = Storage.prototype.setItem;

  // ---------- ユーティリティ ----------
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function cyrb53(s, seed) {
    var h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
    for (var i = 0, ch; i < s.length; i++) {
      ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function hashOf(name, size) { return cyrb53(name + "|" + size, 0).toString(36); }
  function sigOf(st) { return cyrb53(JSON.stringify(st), 1).toString(36); }
  function validHash(h) { return typeof h === "string" && /^[0-9a-z]{4,16}$/.test(h); }
  function validId(id) { return typeof id === "string" && id.length > 0 && id.length <= 64; }
  function stable(o) {                                 // キー順を揃えたJSON(変更判定用)
    if (Array.isArray(o)) return "[" + o.map(stable).join(",") + "]";
    if (o && typeof o === "object") return "{" + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(o[k]); }).join(",") + "}";
    return JSON.stringify(o === undefined ? null : o);
  }
  function setOf(arr) { var s = {}; arr.forEach(function (x) { s[x] = true; }); return s; }

  // ---------- 保存(同期用メタ) ----------
  // known[h]={g:状態の署名|null,u:更新時刻,n:ファイル名,del?:true}  g=null かつ !del → 未インポート(ghost)
  var meta = { known: {}, ghosts: {}, pendDel: {}, fKnown: {}, ordList: [], ordU: 0, fOrdList: [], fOrdU: 0, lastSync: 0, ghostOpen: true, devId: "", devSig: "", devU: 0, peer: { n: 0, labels: [] } };
  (function loadMeta() {
    try {
      var m = JSON.parse(localStorage.getItem(META_KEY) || "{}");
      if (m && typeof m === "object") {
        ["known", "ghosts", "pendDel", "fKnown"].forEach(function (k) { if (m[k] && typeof m[k] === "object") meta[k] = m[k]; });
        ["ordList", "fOrdList"].forEach(function (k) { if (Array.isArray(m[k])) meta[k] = m[k]; });
        ["ordU", "fOrdU", "lastSync"].forEach(function (k) { if (isNum(m[k])) meta[k] = m[k]; });
        if (typeof m.ghostOpen === "boolean") meta.ghostOpen = m.ghostOpen;
        if (typeof m.devId === "string") meta.devId = m.devId;
        if (typeof m.devSig === "string") meta.devSig = m.devSig;
        if (isNum(m.devU)) meta.devU = m.devU;
        if (m.peer && isNum(m.peer.n) && Array.isArray(m.peer.labels)) meta.peer = m.peer;
      }
    } catch (e) {}
  })();
  function saveMeta() { try { origSetItem.call(localStorage, META_KEY, JSON.stringify(meta)); } catch (e) {} }

  // ---------- 1曲分の状態(同期する項目だけ。ローカルもリモートも必ずこの形に通す=比較できる) ----------
  // ti:曲名 ar:アーティスト en:ON/OFF fv:お気に入り fo:フォルダid|null pn:[{t,e,m,c,k?}] ab:{a,b}|null tx:テキストメモ ly?:歌詞の行ごとの時刻[{x:行の文字,t:秒}](無い時はキー自体を持たない=従来の署名を変えない。Firestoreは配列の入れ子不可なのでオブジェクト)
  function cleanState(d) {
    var st = { ti: "", ar: "", en: true, fv: false, fo: null, pn: [], ab: null, tx: "" };
    if (!d || typeof d !== "object") return st;
    st.ti = str(d.ti, TITLE_MAX);
    st.ar = str(d.ar, TITLE_MAX);
    st.en = d.en !== false;
    st.fv = d.fv === true;
    if (validId(d.fo)) st.fo = d.fo;
    if (Array.isArray(d.pn)) {
      d.pn.slice(0, PIN_MAX).forEach(function (p) {
        if (!p || typeof p !== "object") return;
        var t = Number(p.t);
        if (!isFinite(t) || t < 0 || t > 1e6) return;
        var c = typeof p.c === "string" && /^[#a-zA-Z0-9(),.%\s-]{0,40}$/.test(p.c) ? p.c : "";
        var pe = { t: t, e: (p.e === 0 || p.e === false) ? 0 : 1, m: str(p.m, MEMO_MAX), c: c };
        if (p.k === 1 || p.k === true) pe.k = 1; // スキップ区間(立っている時だけ持つ=従来の署名を変えない)
        st.pn.push(pe);
      });
    }
    if (d.ab && typeof d.ab === "object") {
      var a = isNum(d.ab.a) && d.ab.a >= 0 ? d.ab.a : null, b = isNum(d.ab.b) && d.ab.b >= 0 ? d.ab.b : null;
      if (a !== null || b !== null) st.ab = { a: a, b: b };
    }
    st.tx = str(d.tx, TEXT_MAX);
    if (Array.isArray(d.ly)) {
      var ly = [];
      d.ly.slice(0, LY_MAX).forEach(function (l) { if (l && typeof l === "object" && typeof l.x === "string" && isNum(l.t) && l.t >= 0 && l.t <= 1e6) ly.push({ x: l.x.slice(0, LY_TEXT_MAX), t: l.t }); });
      if (ly.length) st.ly = ly;
    }
    return st;
  }
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function mkLocalState(name, t) {
    var pins = readJson("mp3_pins_" + name), ab = readJson("mp3_ab_" + name), tx = "", lyt = readJson("mp3_lyt_" + name);
    try { tx = localStorage.getItem("mp3_text_" + name) || ""; } catch (e) {}
    return cleanState({
      ti: t.title || "", ar: t.artist || "", en: t.enabled !== false, fv: !!t.favorite,
      fo: typeof trackFolderId === "function" ? trackFolderId(t) : (t.folder || null),
      pn: Array.isArray(pins) ? pins.map(function (p) {
        return typeof p === "number" ? { t: p, e: 1, m: "", c: "" } : (p && typeof p === "object" ? { t: p.t, e: p.enabled === false ? 0 : 1, m: p.memo || "", c: p.color || "", k: p.skip ? 1 : 0 } : null);
      }).filter(Boolean) : [],
      ab: ab && typeof ab === "object" ? { a: ab.a, b: ab.b } : null,
      tx: tx,
      ly: Array.isArray(lyt) ? lyt.map(function (e) { return Array.isArray(e) ? { x: e[0], t: e[1] } : null; }).filter(Boolean) : undefined
    });
  }
  function docOf(name, size, st, u) {
    var o = { n: str(name, 300), s: size, ti: st.ti, ar: st.ar, en: st.en, fv: st.fv, fo: st.fo, pn: st.pn, ab: st.ab, tx: st.tx, u: u };
    if (st.ly) o.ly = st.ly;
    return o;
  }
  // 初めて見る曲(他端末に既にある曲をこの端末へ入れた時): 基本はリモート優先。ただしリモートが空でローカルにある項目(マーカー/メモ/ABなど)は消さずに残す
  function firstSeenMerge(rs, ls) {
    var m = cleanState(rs);
    if (!m.pn.length && ls.pn.length) m.pn = ls.pn;
    if (!m.ab && ls.ab) m.ab = ls.ab;
    if (!m.tx && ls.tx) m.tx = ls.tx;
    if (!m.ly && ls.ly) m.ly = ls.ly;
    if (!m.ti && ls.ti) m.ti = ls.ti;
    if (!m.ar && ls.ar) m.ar = ls.ar;
    return m;
  }

  // ---------- リモートドキュメントの読み取り(中身は信用せず必ず整形) ----------
  function parseIndex(raw) {
    var o = { t: {}, d: {} };
    if (!raw || typeof raw !== "object") return o;
    ["t", "d"].forEach(function (k) {
      var src = raw[k];
      if (src && typeof src === "object") Object.keys(src).forEach(function (h) { if (validHash(h) && isNum(src[h])) o[k][h] = src[h]; });
    });
    return o;
  }
  function serializeIndex(ix) { return { t: ix.t, d: ix.d }; }
  function parseOrd(raw) {
    var o = { ord: [], ou: 0 };
    if (!raw || typeof raw !== "object") return o;
    if (Array.isArray(raw.ord)) o.ord = raw.ord.filter(function (x) { return typeof x === "string" && x.length <= 64; });
    if (isNum(raw.ou)) o.ou = raw.ou;
    return o;
  }
  function parseFolders(raw) {
    var o = { f: {}, d: {}, ord: [], ou: 0 };
    if (!raw || typeof raw !== "object") return o;
    if (raw.f && typeof raw.f === "object") Object.keys(raw.f).forEach(function (id) {
      var e = raw.f[id];
      if (validId(id) && e && typeof e === "object" && isNum(e.u) && typeof e.n === "string" && e.n) o.f[id] = { n: e.n.slice(0, 100), u: e.u };
    });
    if (raw.d && typeof raw.d === "object") Object.keys(raw.d).forEach(function (id) { if (validId(id) && isNum(raw.d[id])) o.d[id] = raw.d[id]; });
    if (Array.isArray(raw.ord)) o.ord = raw.ord.filter(validId);
    if (isNum(raw.ou)) o.ou = raw.ou;
    return o;
  }

  // ---------- ローカルの現在状態を取り込む(変わった曲のupdatedAtを上げる。保存処理を個別に直さなくて済む) ----------
  var lastNameMap = {};
  var localVersion = 0, applying = false;   // applying=同期の反映中(自分の書き込みで再同期しない)
  function trackHash(t) { var name = t.file ? t.file.name : t.name; return name ? hashOf(name, t.file ? t.file.size : 0) : null; }
  function reordered(prev, cur) {                      // 両方にある曲どうしの相対順が変わったか(追加/削除だけでは変わった扱いにしない)
    var ps = setOf(prev), cs = setOf(cur);
    var a = prev.filter(function (h) { return cs[h]; }), b = cur.filter(function (h) { return ps[h]; });
    return a.join(",") !== b.join(",");
  }
  function capture() {
    var now = Date.now(), tracks = {}, order = [], nameMap = {}, K = meta.known, FK = meta.fKnown;
    playlist.forEach(function (t) {
      var name = t.file ? t.file.name : t.name;
      if (!name) return;
      var size = t.file ? t.file.size : 0, h = hashOf(name, size);
      if (tracks[h]) return;
      var st = mkLocalState(name, t);
      tracks[h] = { h: h, name: name, size: size, t: t, st: st, g: sigOf(st) };
      order.push(h);
      nameMap[name] = h;
    });
    lastNameMap = nameMap;
    order.forEach(function (h) {
      var k = K[h], tr = tracks[h];
      if (!k) return;                                  // 初めて見る曲(新規 or 他端末に既にある曲)は同期処理側で判断
      if (k.del) {
        if (k.g == null) { delete K[h]; delete meta.pendDel[h]; }                        // 消した後に入れ直した → 新規扱い
        else if (k.g !== tr.g) K[h] = { g: tr.g, u: Math.max(now, k.u + 1), n: tr.name }; // 他端末で消された曲をこちらで編集 → 復活
      } else if (k.g == null) {
        // 未インポートだった曲のMP3が入った → 同期処理側で他端末の設定を取り込む
      } else if (k.g !== tr.g) {
        k.g = tr.g; k.u = Math.max(now, k.u + 1); k.n = tr.name;
      }
    });
    // フォルダ
    var folders = playlistFolders.map(function (f) { return { id: f.id, name: f.name }; }), fSet = setOf(folders.map(function (f) { return f.id; }));
    folders.forEach(function (f) {
      var k = FK[f.id];
      if (!k || k.del) FK[f.id] = { g: f.name, u: Math.max(now, (k ? k.u : 0) + 1) };
      else if (k.g !== f.name) { k.g = f.name; k.u = Math.max(now, k.u + 1); }
    });
    Object.keys(FK).forEach(function (id) { if (!FK[id].del && !fSet[id]) FK[id] = { del: true, u: now }; });
    // 並び(曲/フォルダ)
    var synced = order.filter(function (h) { return K[h] && !K[h].del && K[h].g != null; });
    if (reordered(meta.ordList, synced)) meta.ordU = Math.max(now, meta.ordU + 1);
    meta.ordList = synced;
    var fOrder = folders.map(function (f) { return f.id; });
    if (reordered(meta.fOrdList, fOrder)) meta.fOrdU = Math.max(now, meta.fOrdU + 1);
    meta.fOrdList = fOrder;
    saveMeta();
    return { tracks: tracks, order: order, synced: synced, folders: folders, fOrder: fOrder };
  }

  // ---------- 合体(純粋関数) ----------
  // 並び: remoteOrd(リモート)とlocalSynced(こちらで並べ替えた曲)。ローカルのouが新しければローカルの相対順を採用(未インポートの席はそのまま)、でなければリモート順+未登録を末尾へ
  function mergeOrder(remoteOrd, remoteOu, localSynced, localAll, localOu, valid) {
    var seen = {}, rv = [];
    remoteOrd.forEach(function (x) { if (!seen[x] && valid(x)) { seen[x] = true; rv.push(x); } });
    var extra = [], eseen = {};
    localAll.forEach(function (x) { if (!seen[x] && !eseen[x] && valid(x)) { eseen[x] = true; extra.push(x); } });
    var out;
    if (localOu > remoteOu) {
      var locSet = setOf(localSynced), fill = localSynced.filter(function (x) { return seen[x]; }), it = 0;
      out = rv.map(function (x) { return locSet[x] && it < fill.length ? fill[it++] : x; }).concat(extra);
    } else {
      out = rv.concat(extra);
    }
    return { ord: out, ou: Math.max(localOu > remoteOu ? localOu : remoteOu, 0), write: out.join(",") !== remoteOrd.join(",") };
  }
  // フォルダ: idごとにu最大(同時刻はリモート)。liveは{id:{n,u}}、tombは{id:u}
  function mergeFolders(r, localLive, localTomb, localOrder, localOu) {
    var live = {}, tomb = {}, now = Date.now();
    var ids = setOf(Object.keys(r.f).concat(Object.keys(r.d), Object.keys(localLive), Object.keys(localTomb)));
    Object.keys(ids).forEach(function (id) {
      var best = null;
      function consider(u, isLive, n) { if (isNum(u) && (!best || u > best.u)) best = { u: u, live: isLive, n: n }; }
      if (r.f[id]) consider(r.f[id].u, true, r.f[id].n);
      consider(r.d[id], false);
      if (localLive[id]) consider(localLive[id].u, true, localLive[id].n);
      consider(localTomb[id], false);
      if (!best) return;
      if (best.live) live[id] = { n: best.n, u: best.u };
      else if (now - best.u < TOMB_TTL_MS) tomb[id] = best.u;
    });
    var om = mergeOrder(r.ord, r.ou, localOrder.filter(function (id) { return live[id]; }), localOrder, localOu, function (id) { return !!live[id]; });
    var out = { live: live, tomb: tomb, ord: om.ord, ou: om.ou };
    var rc = stable({ f: r.f, d: r.d, ord: r.ord, ou: r.ou }), mc = stable({ f: live, d: tomb, ord: om.ord, ou: om.ou });
    out.write = rc !== mc;
    return out;
  }
  function serializeFolders(m) { return { f: m.live, d: m.tomb, ord: m.ord, ou: m.ou }; }

  // ---------- セットリスト・PINの並び(lib_extra。曲の同期とは別に、cycleの後で1ドキュメントだけ読み書きする) ----------
  // lib_extra = { s:{id:{n,s:[曲名],u}}, d:{id:削除時刻}, po:[PIN内の曲名], pu:更新時刻 }。セットリストはidごとにu最大が勝つ(同時刻はリモート)・削除はtombstone。PINの並びは全体でpuが新しい方。曲は曲名で持つ
  var SL_MAX = 100, SL_SONGS_MAX = 500, SL_NAME_MAX = 60, SONG_NAME_MAX = 300, PO_MAX = 2000;
  function parseExtra(raw) {
    var o = { s: {}, d: {}, po: [], pu: 0 };
    if (!raw || typeof raw !== "object") return o;
    if (raw.s && typeof raw.s === "object") Object.keys(raw.s).slice(0, SL_MAX).forEach(function (id) {
      var x = raw.s[id];
      if (!validId(id) || !x || !isNum(x.u) || !Array.isArray(x.s)) return;
      o.s[id] = { n: str(x.n, SL_NAME_MAX) || "Setlist", u: x.u, s: x.s.filter(function (n) { return typeof n === "string" && n.length <= SONG_NAME_MAX; }).slice(0, SL_SONGS_MAX) };
    });
    if (raw.d && typeof raw.d === "object") Object.keys(raw.d).forEach(function (id) { if (validId(id) && isNum(raw.d[id])) o.d[id] = raw.d[id]; });
    if (Array.isArray(raw.po)) o.po = raw.po.filter(function (n) { return typeof n === "string" && n.length <= SONG_NAME_MAX; }).slice(0, PO_MAX);
    if (isNum(raw.pu)) o.pu = raw.pu;
    return o;
  }
  function mergeExtra(r, local, po, pu) {
    var live = {}, tomb = {}, now = Date.now();
    var ids = setOf(Object.keys(r.s).concat(Object.keys(r.d), Object.keys(local.live), Object.keys(local.tomb)));
    Object.keys(ids).forEach(function (id) {
      var best = null;
      function consider(u, isLive, v) { if (isNum(u) && (!best || u > best.u)) best = { u: u, live: isLive, v: v }; }   // 先に見たものが同時刻で勝つ=リモート優先
      if (r.s[id]) consider(r.s[id].u, true, r.s[id]);
      consider(r.d[id], false);
      if (local.live[id]) consider(local.live[id].u, true, local.live[id]);
      consider(local.tomb[id], false);
      if (!best) return;
      if (best.live) live[id] = { n: str(best.v.n, SL_NAME_MAX) || "Setlist", s: (best.v.s || []).slice(0, SL_SONGS_MAX), u: best.u };
      else if (now - best.u < TOMB_TTL_MS) tomb[id] = best.u;
    });
    var useLocal = pu > r.pu, mpo = useLocal ? po : r.po, mpu = useLocal ? pu : r.pu;
    var out = { live: live, tomb: tomb, po: mpo, pu: mpu };
    out.write = stable({ s: r.s, d: r.d, po: r.po, pu: r.pu }) !== stable({ s: live, d: tomb, po: mpo, pu: mpu });
    return out;
  }
  async function extraStep(A) {
    if (!window.QNSetlist || typeof window.QNSetlist.syncState !== "function" || typeof window.readPinOrderU !== "function") return false;
    var ver = localVersion, loc = window.QNSetlist.syncState(), po = window.readPinOrder(), pu = window.readPinOrderU();
    var m = await A.syncTx(async function (api) {
      var r = parseExtra(await api.get(DOC_EXTRA)), mm = mergeExtra(r, loc, po, pu);
      if (mm.write) api.set(DOC_EXTRA, { s: mm.live, d: mm.tomb, po: mm.po, pu: mm.pu });
      return mm;
    });
    if (localVersion !== ver || isBusy()) return false;   // 通信中にこちらが変わった/入力中 → 反映せず次の同期で(書き込みは済んでいる)
    var changed = false;
    applying = true;
    try {
      if (stable({ l: loc.live, t: loc.tomb }) !== stable({ l: m.live, t: m.tomb })) { window.QNSetlist.syncApply(m.live, m.tomb); changed = true; }
      if (m.pu !== pu || m.po.join("\n") !== po.join("\n")) { window.applyPinOrderSynced(m.po, m.pu); changed = true; }
    } finally { applying = false; }
    return changed;
  }

  // ---------- UI状態 ----------
  var prog = { done: 0, total: 0, at: 0 };
  function setProg(done, total) {   // 件数表示(画面更新は0.15秒に1回まで)
    prog.done = done; prog.total = total;
    var n = Date.now();
    if (n - prog.at > 150 || done >= total) { prog.at = n; setStatus("syncing"); }
  }
  var syncUser = false, ready = false, syncing = false, syncAgain = false, syncTimer = 0, lastTry = 0, status = "", againCount = 0;
  function isBusy() {
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return true;
    return !!document.querySelector(".playlistItem.dragging, .playlistFolderHeader.dragging, .folder-drag-hidden");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var lastErr = ""; // 直近の失敗理由(Firestoreのcode等)。ステータス末尾に[ ]で表示
  function statusText() {
    if (status === "syncing") return "☁ 同期中…" + (prog.total > 1 ? " " + prog.done + "/" + prog.total : "");
    if (status === "error") return "☁ 同期できませんでした(タップで再試行)" + (lastErr ? " [" + lastErr + "]" : "");
    if (status === "ok") { var d = new Date(meta.lastSync || Date.now()); return "☁ 同期済み " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "  ↻"; }
    return "";
  }
  function setStatus(s) {
    status = s;
    var els = document.querySelectorAll(".playlist-sync-foot");
    for (var i = 0; i < els.length; i++) paintFoot(els[i]);
  }
  function paintFoot(el) {
    el.textContent = statusText();
    el.classList.toggle("err", status === "error");
    el.classList.toggle("can", syncUser && status !== "syncing");
  }

  // ---------- ローカルへ反映 ----------
  function findTrack(h) {
    for (var i = 0; i < playlist.length; i++) if (trackHash(playlist[i]) === h) return playlist[i];
    return null;
  }
  function applyStateToTrack(tr, st) {
    var name = tr.file ? tr.file.name : tr.name;
    tr.title = st.ti || null;
    tr.artist = st.ar || null;
    tr.enabled = st.en;
    tr.favorite = st.fv;
    tr.folder = st.fo && typeof getPlaylistFolder === "function" && getPlaylistFolder(st.fo) ? st.fo : null;
    if (typeof updatePlaylistMetaEntry === "function") {
      updatePlaylistMetaEntry(name, { title: tr.title, artist: tr.artist, enabled: tr.enabled, favorite: tr.favorite, folder: tr.folder });
    }
    var hasPins = localStorage.getItem("mp3_pins_" + name) !== null;
    if (st.pn.length || hasPins) {
      origSetItem.call(localStorage, "mp3_pins_" + name, JSON.stringify(st.pn.map(function (p) { return { t: p.t, enabled: p.e !== 0, memo: p.m, color: p.c || null, skip: p.k ? true : undefined }; })));
    }
    if (st.ab || localStorage.getItem("mp3_ab_" + name) !== null) {
      origSetItem.call(localStorage, "mp3_ab_" + name, JSON.stringify({ a: st.ab ? st.ab.a : null, b: st.ab ? st.ab.b : null }));
    }
    if (st.tx || localStorage.getItem("mp3_text_" + name) !== null) origSetItem.call(localStorage, "mp3_text_" + name, st.tx);
    if (st.ly) origSetItem.call(localStorage, "mp3_lyt_" + name, JSON.stringify(st.ly.map(function (l) { return [l.x, l.t]; })));
    else if (localStorage.getItem("mp3_lyt_" + name) !== null) localStorage.removeItem("mp3_lyt_" + name);
    return name;
  }
  function applyFolders(fo) {
    var FK = meta.fKnown, dirty = false;
    playlistFolders.slice().forEach(function (f) { if (!fo.live[f.id]) { deletePlaylistFolder(f.id); dirty = true; } });
    Object.keys(fo.live).forEach(function (id) {
      var f = getPlaylistFolder(id), n = fo.live[id].n;
      if (!f) { playlistFolders.push({ id: id, name: n, parentId: null, collapsed: false }); dirty = true; }
      else if (f.name !== n) { f.name = n; dirty = true; }
    });
    if (dirty) writePlaylistFolders();
    var want = fo.ord.filter(function (id) { return fo.live[id]; });
    if (playlistFolders.some(function (f, i) { return want[i] !== f.id; })) { setPlaylistFolderOrder(want); dirty = true; }
    Object.keys(FK).forEach(function (id) { delete FK[id]; });
    Object.keys(fo.live).forEach(function (id) { FK[id] = { g: fo.live[id].n, u: fo.live[id].u }; });
    Object.keys(fo.tomb).forEach(function (id) { FK[id] = { del: true, u: fo.tomb[id] }; });
    meta.fOrdU = fo.ou;
    meta.fOrdList = playlistFolders.map(function (f) { return f.id; });
    return dirty;
  }
  function applyOrderLocal(finalOrd) {
    var rank = {};
    finalOrd.forEach(function (h, i) { rank[h] = i; });
    var cur = currentPlaylistIndex >= 0 ? playlist[currentPlaylistIndex] : null;
    var keyed = playlist.map(function (t, i) { var r = rank[trackHash(t)]; return { t: t, i: i, r: r === undefined ? 1e9 + i : r }; });
    keyed.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
    var changed = keyed.some(function (k, i) { return k.i !== i; });
    if (changed) {
      playlist.length = 0;
      keyed.forEach(function (k) { playlist.push(k.t); });
      if (cur) currentPlaylistIndex = playlist.indexOf(cur);
    }
    if (normalizePlaylistGrouping()) changed = true;
    return changed;
  }

  // ---------- 同期本体 ----------
  async function cycle(A) {
    var ver = localVersion, K = meta.known, now = Date.now();
    var snap = capture();
    var rd = await A.syncGetMany([DOC_INDEX, DOC_FOLDERS, DOC_ORDER]);
    var idx = parseIndex(rd[0]), fol = parseFolders(rd[1]), ord = parseOrd(rd[2]);

    // 1) 取りに行く曲(新しい/初めて見る/未インポートのMP3が入った)
    var fetchH = [];
    Object.keys(idx.t).forEach(function (h) {
      var k = K[h], ru = idx.t[h], loc = snap.tracks[h];
      if (k && k.del && k.u >= ru) return;
      if (!k || k.del) { fetchH.push(h); return; }
      if (k.g == null) { if (loc || ru > k.u) fetchH.push(h); return; }
      if (!loc || ru > k.u) fetchH.push(h);
    });
    var docs = fetchH.length ? await A.syncGetMany(fetchH.map(function (h) { return "t_" + h; }), setProg) : [];

    // 2) 計画(まだ何も変えない)
    var applyList = [], ghostUp = {}, pushList = [], tombs = [], seq = 0;
    fetchH.forEach(function (h, i) {
      var d = docs[i], ru = idx.t[h];
      if (!d || typeof d !== "object") return;
      var rs = cleanState(d), loc = snap.tracks[h], k = K[h];
      if (!loc) { ghostUp[h] = { n: str(d.n, 300), s: isNum(d.s) ? d.s : 0, ti: rs.ti, ar: rs.ar, fo: rs.fo, u: ru }; return; }
      if (!k || k.g == null) {
        var ms = firstSeenMerge(rs, loc.st);
        var item = { h: h, st: ms, u: ru };
        if (sigOf(ms) !== sigOf(rs)) { item.push = true; pushList.push({ h: h, name: loc.name, size: loc.size, st: ms, u: now + (seq++) }); }
        applyList.push(item);
      } else {
        applyList.push({ h: h, st: rs, u: ru });
      }
    });
    var fetched = setOf(fetchH);
    snap.order.forEach(function (h) {
      var k = K[h], loc = snap.tracks[h];
      if (fetched[h]) return;
      if (k && !k.del && k.g == null && idx.t[h] === undefined) { pushList.push({ h: h, name: loc.name, size: loc.size, st: loc.st, u: now + (seq++), isNew: true }); return; }
      if (!k) { if (idx.t[h] === undefined) pushList.push({ h: h, name: loc.name, size: loc.size, st: loc.st, u: now + (seq++), isNew: true }); return; }
      if (!k.del && k.g != null && k.u > (idx.t[h] || 0) && !(idx.d[h] >= k.u)) pushList.push({ h: h, name: loc.name, size: loc.size, st: loc.st, u: k.u });
    });
    var dropGhost = [], desync = [];
    Object.keys(idx.d).forEach(function (h) {
      var rdT = idx.d[h];
      if (idx.t[h] !== undefined && idx.t[h] >= rdT) return;
      var k = K[h];
      if (!k || k.del) return;
      if (k.g == null) dropGhost.push({ h: h, u: rdT });
      else if (k.u < rdT) { if (snap.tracks[h]) desync.push({ h: h, u: rdT, g: k.g, n: k.n }); else dropGhost.push({ h: h, u: rdT }); }
    });
    Object.keys(meta.pendDel).forEach(function (h) {
      var u = meta.pendDel[h];
      if (idx.t[h] !== undefined && !(idx.t[h] > u)) tombs.push({ h: h, u: u });
      else delete meta.pendDel[h];
    });
    // 通信中に端末側で消された曲は、pushしない(消えた曲を復活させない)
    function projected() {
      var t = {}; Object.keys(idx.t).forEach(function (h) { t[h] = idx.t[h]; });
      pushList.forEach(function (p) { t[p.h] = p.u; });
      tombs.forEach(function (x) { delete t[x.h]; });
      return t;
    }
    var localLive = {}, localTomb = {};
    snap.folders.forEach(function (f) { localLive[f.id] = { n: f.name, u: meta.fKnown[f.id].u }; });
    Object.keys(meta.fKnown).forEach(function (id) { if (meta.fKnown[id].del) localTomb[id] = meta.fKnown[id].u; });
    var allLocal = snap.order.filter(function (h) { return !(K[h] && K[h].del); });
    var pt = projected();
    var foM = mergeFolders(fol, localLive, localTomb, snap.fOrder, meta.fOrdU);
    var odM = mergeOrder(ord.ord, ord.ou, snap.synced, allLocal, meta.ordU, function (h) { return pt[h] !== undefined || snap.tracks[h] && !(K[h] && K[h].del); });

    // 3) 書き込み(トランザクション。変わるものがある時だけ)
    var wrote = {}, skipped = [], tombDone = {}, fo = foM, od = odM;
    if (pushList.length > CHUNK) setProg(0, pushList.length);
    var needTx = pushList.length || tombs.length || foM.write || odM.write;
    if (needTx) {
      var chunks = [];
      for (var i = 0; i < pushList.length; i += CHUNK) chunks.push(pushList.slice(i, i + CHUNK));
      if (!chunks.length) chunks.push([]);
      for (var ci = 0; ci < chunks.length; ci++) {
        var last = ci === chunks.length - 1, chunk = chunks[ci], tmb = ci === 0 ? tombs : [];
        var res = await A.syncTx(async function (api) {
          var ix = parseIndex(await api.get(DOC_INDEX)), fo2 = null, od2 = null;
          if (last) { fo2 = parseFolders(await api.get(DOC_FOLDERS)); od2 = parseOrd(await api.get(DOC_ORDER)); }
          var w = [], sk = [], td = [], dirty = false, n2 = Date.now();
          chunk.forEach(function (p) {
            if ((ix.t[p.h] !== undefined && ix.t[p.h] >= p.u) || (ix.d[p.h] !== undefined && ix.d[p.h] > p.u)) { sk.push(p.h); return; }
            api.set("t_" + p.h, docOf(p.name, p.size, p.st, p.u));
            ix.t[p.h] = p.u; delete ix.d[p.h]; w.push(p.h); dirty = true;
          });
          tmb.forEach(function (x) {
            if (ix.t[x.h] !== undefined && ix.t[x.h] > x.u) { sk.push(x.h); return; }
            if (ix.t[x.h] !== undefined) api.del("t_" + x.h);
            delete ix.t[x.h]; ix.d[x.h] = x.u; td.push(x.h); dirty = true;
          });
          Object.keys(ix.d).forEach(function (h) { if (n2 - ix.d[h] > TOMB_TTL_MS) { delete ix.d[h]; dirty = true; } });
          var foR = null, odR = null;
          if (last) {
            foR = mergeFolders(fo2, localLive, localTomb, snap.fOrder, meta.fOrdU);
            odR = mergeOrder(od2.ord, od2.ou, snap.synced, allLocal, meta.ordU, function (h) { return ix.t[h] !== undefined || snap.tracks[h] && !(K[h] && K[h].del); });
            if (foR.write) api.set(DOC_FOLDERS, serializeFolders(foR));
            if (odR.write) api.set(DOC_ORDER, { ord: odR.ord, ou: odR.ou });
          }
          if (dirty) api.set(DOC_INDEX, serializeIndex(ix));
          return { w: w, sk: sk, td: td, fo: foR, od: odR };
        });
        res.w.forEach(function (h) { wrote[h] = true; });
        if (pushList.length > CHUNK) setProg(Math.min((ci + 1) * CHUNK, pushList.length), pushList.length);
        res.td.forEach(function (h) { tombDone[h] = true; });
        skipped = skipped.concat(res.sk);
        if (last) { fo = res.fo; od = res.od; }
      }
    }

    // 4) 反映(通信中にローカルが変わった/入力中ならやめて後でもう一度。書き込みは済んでいるので安全)
    if (localVersion !== ver) return { again: true };
    if (isBusy()) return { again: true, delay: 3000 };
    var ui = false, curName = typeof currentFileName === "string" ? currentFileName : "", reloadCur = false;
    applying = true;
    try {
    if (applyFolders(fo)) ui = true;
    applyList.forEach(function (a) {
      var tr = findTrack(a.h);
      if (!tr) return;
      var u = a.u, pushed = pushList.filter(function (p) { return p.h === a.h; })[0];
      if (a.push && pushed && wrote[a.h]) u = pushed.u;
      var name = applyStateToTrack(tr, a.st);
      K[a.h] = { g: sigOf(mkLocalState(name, tr)), u: u, n: name };
      if (name === curName) reloadCur = true;
      ui = true;
    });
    pushList.forEach(function (p) {
      if (!wrote[p.h]) return;
      var k = K[p.h];
      if (!k || k.del || k.g == null) { var tr = findTrack(p.h); K[p.h] = { g: tr ? sigOf(mkLocalState(p.name, tr)) : sigOf(p.st), u: p.u, n: p.name }; }
    });
    Object.keys(tombDone).forEach(function (h) { var k = K[h]; K[h] = { g: null, del: true, u: (meta.pendDel[h] || (k && k.u) || Date.now()), n: k ? k.n : "" }; delete meta.pendDel[h]; });
    skipped.forEach(function (h) { delete meta.pendDel[h]; });
    Object.keys(ghostUp).forEach(function (h) {
      if (findTrack(h)) return;
      K[h] = { g: null, u: ghostUp[h].u, n: ghostUp[h].n };
      meta.ghosts[h] = ghostUp[h];
      ui = true;
    });
    dropGhost.forEach(function (x) { K[x.h] = { g: null, del: true, u: x.u, n: "" }; delete meta.ghosts[x.h]; ui = true; });
    desync.forEach(function (x) { K[x.h] = { g: x.g, del: true, u: x.u, n: x.n }; });
    Object.keys(meta.ghosts).forEach(function (h) { if (!K[h] || K[h].del || K[h].g != null || findTrack(h)) { delete meta.ghosts[h]; ui = true; } });
    if (applyOrderLocal(od.ord)) { ui = true; if (typeof persistPlaylistOrder === "function") persistPlaylistOrder(); }
    meta.ordU = od.ou;
    meta.ordList = playlist.map(trackHash).filter(function (h) { return h && K[h] && !K[h].del && K[h].g != null; });
    meta.lastSync = Date.now();
    saveMeta();
    } finally { applying = false; }
    if (ui) {
      renderPlaylist();
      if (reloadCur) {
        try {
          loadTrackUserData(curName);
          if (window.QNLyrics) window.QNLyrics.load();
          if (typeof renderPins === "function") renderPins();
          if (typeof renderSegments === "function") renderSegments();
        } catch (e) {}
      }
    }
    return { again: skipped.length > 0 };
  }

  // 同名フォルダ(前後の空白は無視)を1つに統合。残すのはid昇順で先頭(どの端末でも同じ結果になる=お互いに消し合わない)。
  // 曲は残す側へ移し、不要側は削除(通常の削除と同じ=tombstoneで他端末にも伝わる)。未インポート曲の所属も付け替える。変更があればtrue
  function mergeDuplicateFolders() {
    if (typeof playlistFolders === "undefined" || typeof deletePlaylistFolder !== "function") return false;
    var groups = {}, changed = false, ghostsChanged = false;
    playlistFolders.forEach(function (f) { var k = String(f.name || "").trim(); (groups[k] = groups[k] || []).push(f); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      g.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      var keep = g[0];
      g.slice(1).forEach(function (d) {
        playlist.forEach(function (t) {
          if (t.folder === d.id) { t.folder = keep.id; updatePlaylistMetaEntry(t.name, { folder: keep.id }); }
        });
        Object.keys(meta.ghosts).forEach(function (h) { if (meta.ghosts[h].fo === d.id) { meta.ghosts[h].fo = keep.id; ghostsChanged = true; } });
        deletePlaylistFolder(d.id);
        changed = true;
      });
    });
    if (ghostsChanged) saveMeta();
    if (changed) {
      if (typeof persistPlaylistOrder === "function") persistPlaylistOrder();
      if (typeof renderPlaylist === "function") renderPlaylist();
    }
    return changed;
  }

  // ---------- 他端末の「MP3が無い曲」(送信側のボタン用) ----------
  // lib_devices: {d:{<devId>:{l:端末種別,u:更新時刻,m:[MP3が無い曲のhash]}}}。各端末が自分の未インポート(ghost)一覧を書き、他端末が読んで「送れる曲」を数える。MP3は含まない
  function devLabel() {
    var u = navigator.userAgent || "";
    if (/iPhone/.test(u)) return "iPhone";
    if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return "iPad";
    if (/Android/.test(u)) return "Android";
    if (/Macintosh/.test(u)) return "Mac";
    if (/Windows/.test(u)) return "Windows";
    return "Other";
  }
  function devicesStep(A) {
    if (!meta.devId) { meta.devId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); saveMeta(); }
    var mine = Object.keys(meta.ghosts).filter(validHash).sort().slice(0, DEV_MISS_MAX);
    var sig = sigOf(mine), now = Date.now();
    var needWrite = sig !== meta.devSig || now - meta.devU > DEV_REFRESH_MS;
    var haveLocal = {};
    playlist.forEach(function (t) { var h = trackHash(t); if (h) haveLocal[h] = true; });
    function count(doc) {
      var seen = {}, labels = [], d = doc && doc.d && typeof doc.d === "object" ? doc.d : {};
      Object.keys(d).forEach(function (id) {
        var e = d[id];
        if (id === meta.devId || !e || !Array.isArray(e.m) || !isNum(e.u) || now - e.u > DEV_FRESH_MS) return;
        var any = false;
        e.m.forEach(function (h) { if (validHash(h) && haveLocal[h]) { seen[h] = true; any = true; } });
        if (any) labels.push(str(e.l, 12) || "Other");
      });
      return { n: Object.keys(seen).length, labels: labels };
    }
    var work = needWrite
      ? A.syncTx(async function (api) {
          var cur = await api.get(DOC_DEVICES), d = cur && cur.d && typeof cur.d === "object" ? cur.d : {}, out = {};
          Object.keys(d).forEach(function (id) { if (d[id] && isNum(d[id].u) && now - d[id].u <= DEV_FRESH_MS && id !== meta.devId) out[id] = d[id]; });
          out[meta.devId] = { l: devLabel(), u: now, m: mine };
          api.set(DOC_DEVICES, { d: out });
          return { d: out };
        }).then(function (doc) { meta.devSig = sig; meta.devU = now; return doc; })
      : A.syncGetMany([DOC_DEVICES]).then(function (r) { return r[0]; });
    return work.then(function (doc) {
      var c = count(doc), changed = c.n !== meta.peer.n || c.labels.join(",") !== meta.peer.labels.join(",");
      meta.peer = c; saveMeta();
      return changed;
    });
  }

  async function syncNow() {
    var A = window.QN_AUTH;
    if (!syncUser || !ready || !A || typeof A.syncTx !== "function" || typeof A.syncGetMany !== "function") return;
    if (syncing) { syncAgain = true; return; }
    syncing = true; lastTry = Date.now(); prog.done = 0; prog.total = 0;
    setStatus("syncing");
    var res = null;
    try {
      mergeDuplicateFolders();
      res = await cycle(A);
      if (mergeDuplicateFolders()) res = { again: true }; // 取り込んだ結果に同名があった → 統合分をもう一度同期
      try { await extraStep(A); } catch (e) { console.warn("[QN_LIB_SYNC] extra", e); } // セットリスト/PINの並び。失敗しても曲の同期は成功扱い
      try { if (await devicesStep(A)) { if (typeof renderPlaylist === "function") renderPlaylist(); } } catch (e) { console.warn("[QN_LIB_SYNC] devices", e); } // 補助情報。失敗しても同期自体は成功扱い
      lastErr = "";
      setStatus("ok");
    } catch (err) {
      console.error("[QN_LIB_SYNC]", err);
      lastErr = String((err && (err.code || err.message)) || "unknown").replace(/^firestore\//, "").slice(0, 80);
      setStatus("error");
    }
    syncing = false;
    var redo = syncAgain || (res && res.again);
    syncAgain = false;
    if (redo && againCount < 4) { againCount++; setTimeout(syncNow, res && res.delay ? res.delay : 600); }
    else if (!res || !res.again) againCount = 0;
  }
  function scheduleSync() {
    if (!syncUser || !ready) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 3000);
  }
  function syncIfStale() { if (syncUser && ready && Date.now() - lastTry > 20000) { againCount = 0; syncNow(); } }
  function showTransferButton() {   // サイドバーのTransfer(player-ui-pc-v2.js)は同期対象アカウントのログイン中だけ表示
    var bs = document.querySelectorAll('[data-panel-id="transfer"]');
    for (var i = 0; i < bs.length; i++) bs[i].style.display = syncUser ? "" : "none";
  }
  function onAuthChanged(user) {
    syncUser = !!(user && window.QN_AUTH && typeof window.QN_AUTH.isSyncUser === "function" && window.QN_AUTH.isSyncUser());
    showTransferButton();
    if (syncUser) { againCount = 0; syncNow(); } else setStatus("");
    if (typeof renderPlaylist === "function" && ready) renderPlaylist();
  }

  // ---------- 変更の検知(localStorageへの書き込みを横から見るだけ。既存の保存処理は触らない) ----------
  function watched(k) {
    return k === "qn_playlist_meta_v1" || k === "qn_folders_v1" || k === "qn_setlists_v1" || k === "qn_setlists_del_v1" || k === "qn_pin_order" || (typeof k === "string" && (k.indexOf("mp3_pins_") === 0 || k.indexOf("mp3_ab_") === 0 || k.indexOf("mp3_text_") === 0 || k.indexOf("mp3_lyt_") === 0));
  }
  Storage.prototype.setItem = function (k) {
    var r = origSetItem.apply(this, arguments);
    if (!applying && this === window.localStorage && watched(k)) { localVersion++; scheduleSync(); }
    return r;
  };
  // 曲を消した(明示操作)→同期でも削除として扱う。他端末のMP3は消えない
  function noteDeleted(name) {
    var h = lastNameMap[name];
    if (!h) { Object.keys(meta.known).forEach(function (x) { if (meta.known[x].n === name && !meta.known[x].del) h = x; }); }
    if (!h) return;
    var k = meta.known[h];
    if (!k || k.del || k.g == null) return;
    var u = Math.max(Date.now(), k.u + 1);
    meta.pendDel[h] = u;
    meta.known[h] = { g: null, del: true, u: u, n: name };
    delete lastNameMap[name];
    saveMeta();
    localVersion++;
    scheduleSync();
  }
  if (typeof window.deletePlaylistTrack === "function") {
    var origDelete = window.deletePlaylistTrack;
    window.deletePlaylistTrack = function (name) { try { noteDeleted(name); } catch (e) {} return origDelete.apply(this, arguments); };
  }

  // ---------- 未インポート(ghost)の表示 ----------
  function ghostList() {
    return Object.keys(meta.ghosts).map(function (h) { var g = meta.ghosts[h]; g.h = h; return g; }).sort(function (a, b) {
      var x = (a.ti || a.n || "").toLowerCase(), y = (b.ti || b.n || "").toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }
  function toast(t) { if (window.QNApps && typeof window.QNApps.toast === "function") window.QNApps.toast(t); }
  function removeGhost(h) {
    var g = meta.ghosts[h];
    if (!g) return;
    var u = Math.max(Date.now(), (meta.known[h] ? meta.known[h].u : 0) + 1);
    meta.pendDel[h] = u;
    meta.known[h] = { g: null, del: true, u: u, n: g.n || "" };
    delete meta.ghosts[h];
    saveMeta();
    localVersion++;
    scheduleSync();
    if (typeof renderPlaylist === "function") renderPlaylist();
  }
  // renderPlaylist()の最後に呼ぶ: 同期ステータス行と「未インポート」セクションを足す(曲の行(.playlistItem)とは別クラス=選択/ドラッグ処理の対象外)
  function decorateLibrary(box, editMode) {
    if (!box || !syncUser) return;
    var gl = ghostList();
    if (meta.peer && meta.peer.n > 0 && typeof window.qnOpenTransfer === "function") {
      var ps = document.createElement("div");
      ps.className = "playlist-peer-section qn-lib-extra";
      var pt = document.createElement("div");
      pt.className = "playlist-peer-text";
      pt.textContent = "他の端末(" + meta.peer.labels.join("・") + ")にMP3が無い曲: " + meta.peer.n + "曲";
      var pb = document.createElement("button");
      pb.type = "button";
      pb.className = "playlist-ghost-transfer";
      pb.textContent = "Send";
      pb.title = "他の端末へMP3を送信";
      pb.addEventListener("click", function () { window.qnOpenTransfer(); });
      ps.appendChild(pt);
      ps.appendChild(pb);
      box.appendChild(ps);
    }
    if (gl.length) {
      var sec = document.createElement("div");
      sec.className = "playlist-ghost-section qn-lib-extra";
      var head = document.createElement("button");
      head.type = "button";
      head.className = "playlist-ghost-head";
      head.textContent = (meta.ghostOpen ? "▾ " : "▸ ") + "未インポート(" + gl.length + ")";
      head.addEventListener("click", function () { meta.ghostOpen = !meta.ghostOpen; saveMeta(); renderPlaylist(); });
      var headRow = document.createElement("div");
      headRow.className = "playlist-ghost-headrow";
      headRow.appendChild(head);
      if (typeof window.qnOpenTransfer === "function") {
        var trBtn = document.createElement("button");
        trBtn.type = "button";
        trBtn.className = "playlist-ghost-transfer";
        trBtn.textContent = "Transfer";
        trBtn.title = "他の端末からMP3を受信";
        trBtn.addEventListener("click", function () { window.qnOpenTransfer(); });
        headRow.appendChild(trBtn);
      }
      sec.appendChild(headRow);
      if (meta.ghostOpen) {
        var note = document.createElement("div");
        note.className = "playlist-ghost-note";
        note.textContent = "この端末にMP3がない曲です。設定 > 転送 で他の端末から受信できます。";
        sec.appendChild(note);
        gl.forEach(function (g) {
          var row = document.createElement("div");
          row.className = "playlist-ghost-row";
          var info = document.createElement("div");
          info.className = "playlist-ghost-info";
          var t = document.createElement("div");
          t.className = "playlist-ghost-title";
          t.textContent = g.ti || g.n || "(無題)";
          var sub = document.createElement("div");
          sub.className = "playlist-ghost-sub";
          var f = g.fo && typeof getPlaylistFolder === "function" ? getPlaylistFolder(g.fo) : null;
          sub.textContent = [g.ar, f ? "📁 " + f.name : "", g.ti ? g.n : ""].filter(Boolean).join(" · ");
          info.appendChild(t);
          if (sub.textContent) info.appendChild(sub);
          row.appendChild(info);
          row.addEventListener("click", function (e) {
            if (e.target.closest("button")) return;
            toast("この端末にMP3がありません。設定 > 転送 で他の端末から受信するか、「" + (g.n || "") + "」を追加してください");
          });
          if (editMode) {
            var del = document.createElement("button");
            del.type = "button";
            del.className = "playlist-ghost-del";
            del.title = "同期から削除";
            del.textContent = "✕";
            del.addEventListener("click", function (e) {
              e.stopPropagation();
              if (window.confirm("「" + (g.ti || g.n || "") + "」の同期情報を削除します。\n他の端末のMP3は削除されません。")) removeGhost(g.h);
            });
            row.appendChild(del);
          }
          sec.appendChild(row);
        });
      }
      box.appendChild(sec);
    }
    var foot = document.createElement("div");
    foot.className = "playlist-sync-foot qn-lib-extra";
    foot.addEventListener("click", function () { if (syncUser && status !== "syncing") { againCount = 0; syncNow(); } });
    paintFoot(foot);
    box.appendChild(foot);
  }

  window.addEventListener("qn-auth-changed", function (e) { onAuthChanged(e && e.detail && e.detail.user); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") syncIfStale(); });
  window.addEventListener("focus", syncIfStale);
  window.addEventListener("online", function () { if (syncUser && ready) syncNow(); });

  // 起動時のIndexedDB復元が終わったら呼ばれる(player-ui-shared.js)。復元前に同期すると「ローカルに曲が無い」と誤認するため待つ
  window.qnLibSyncReady = function () {
    ready = true;
    showTransferButton();
    if (window.QN_AUTH && window.QN_AUTH.currentUser) onAuthChanged(window.QN_AUTH.currentUser);
  };
  // P2P転送(player-p2p.js)用: 未インポート一覧と、hashからこの端末のFileを引く
  function fileFor(h) { var t = findTrack(h); return t && t.file ? t.file : null; }
  window.QNLibSync = { devLabel: devLabel, decorateLibrary: decorateLibrary, ghosts: ghostList, fileFor: fileFor, isActive: function () { return syncUser; }, syncNow: function () { againCount = 0; syncNow(); }, _meta: meta, _hashOf: hashOf, _capture: capture };
})();
