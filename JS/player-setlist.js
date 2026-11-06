// player-setlist.js — Setlistパネル(v5.7.0)。バンドごとなど、曲を並べたリスト(セットリスト)を作って、その順で再生する。
// - 保存: localStorage "qn_setlists_v1" = [{id, name, songs:[曲名(=ファイル名)...], u(更新時刻)}] (配列順=表示順)。削除は "qn_setlists_del_v1" に記録。同期(player-sync.js の lib_extra)とバックアップ(markers.json の setlists)に入る。編集したらtouch(sl)でuを更新する。
// - 曲は曲名(track.name)で持つ。Libraryから消えた曲は「Not in Library」で薄く残り、再生ではスキップされる(Libraryへ戻すと復活)。同じ曲を複数のセットリストに入れてよい。
// - 再生: 行/Playで曲を再生すると setSetlistContext(曲名の配列) を立てる(player-playlist.js)。その間の前/次/Auto Nextはセットリストの順で進む。Libraryの行など別の経路で再生すると解除される。
// - window.QNSetlist.mount(host)を player-ui-pc-v2.js の switchPanel("setlist") が呼ぶ。パネルを閉じても状態(開いていたセットリスト)は保持。
(function () {
  "use strict";
  if (window.qnFeature && !window.qnFeature("setlist")) return;

  var KEY = "qn_setlists_v1", DEL_KEY = "qn_setlists_del_v1";
  var TOMB_TTL = 180 * 24 * 60 * 60 * 1000;
  var list = read(), tombs = readTombs();
  var view = { mode: "list", id: null, q: "" }; // mode: list | detail | add
  var host = null;

  function read() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(a)) return [];
      return a.filter(function (s) { return s && typeof s.id === "string"; }).map(function (s) {
        return { id: s.id, name: String(s.name || "Setlist"), songs: Array.isArray(s.songs) ? s.songs.filter(function (n) { return typeof n === "string"; }) : [], u: typeof s.u === "number" ? s.u : 0 };
      });
    } catch (e) { return []; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  // 同期用: セットリストごとの更新時刻u(新しい方が勝つ)と、削除の記録(tombs: {id: 削除時刻})
  function readTombs() { try { var o = JSON.parse(localStorage.getItem(DEL_KEY) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function saveTombs() { try { localStorage.setItem(DEL_KEY, JSON.stringify(tombs)); } catch (e) {} }
  function touch(sl) { sl.u = Math.max(Date.now(), (sl.u || 0) + 1); }
  function bury(id) { tombs[id] = Date.now(); saveTombs(); }
  function uid() { return "sl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function byId(id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function trackOf(name) { for (var i = 0; i < playlist.length; i++) if (playlist[i].name === name) return i; return -1; }
  function toast(msg) { if (window.QNApps && QNApps.toast) QNApps.toast(msg); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, fn) { var b = el("button", "qn-sl-btn" + (cls ? " " + cls : ""), label); b.type = "button"; b.onclick = fn; return b; }
  function iconBtn(path, title, fn, cls) {
    var b = el("button", "qn-sl-icon" + (cls ? " " + cls : "")); b.type = "button"; b.title = title; b.setAttribute("aria-label", title);
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + path + '"/></svg>'; b.onclick = function (e) { e.stopPropagation(); fn(e); }; return b;
  }
  var P_BACK = "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z";
  var P_EDIT = "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
  var P_DEL = "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
  var P_X = "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
  var P_COPY = "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z";
  var P_DRAG = "M9 6a1.6 1.6 0 1 0 0 .01zM15 6a1.6 1.6 0 1 0 0 .01zM9 12a1.6 1.6 0 1 0 0 .01zM15 12a1.6 1.6 0 1 0 0 .01zM9 18a1.6 1.6 0 1 0 0 .01zM15 18a1.6 1.6 0 1 0 0 .01z";

  function total(sl) {
    var s = 0, n = 0;
    sl.songs.forEach(function (nm) { var i = trackOf(nm); if (i >= 0) { n++; s += playlist[i].duration || 0; } });
    return { n: n, sec: s };
  }
  function fmtTotal(sec) {
    if (!sec) return "";
    var m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min";
  }

  // ---------- 再生 ----------
  function playFrom(sl, startName) {
    var live = sl.songs.filter(function (nm) { var i = trackOf(nm); return i >= 0 && playlist[i].enabled !== false; });
    if (!live.length) { toast("No playable songs"); return; }
    var nm = startName && live.indexOf(startName) >= 0 ? startName : live[0];
    if (typeof setSetlistContext === "function") setSetlistContext(sl.songs.slice());
    playTrackAt(trackOf(nm));
    render();
  }

  // ---------- 画面 ----------
  function render() {
    if (!host || !host.isConnected) return;
    var keep = host.querySelector(".qn-sl-scroll");
    var top = keep ? keep.scrollTop : 0;
    host.innerHTML = "";
    var root = el("div", "qn-sl");
    host.appendChild(root);
    if (view.mode === "detail" && byId(view.id)) renderDetail(root, byId(view.id));
    else if (view.mode === "add" && byId(view.id)) renderAdd(root, byId(view.id));
    else { view.mode = "list"; renderList(root); }
    var sc = root.querySelector(".qn-sl-scroll"); if (sc) sc.scrollTop = top;
  }

  function askName(title, initial, done) {
    var v = window.prompt(title, initial || "");
    if (v == null) return;
    v = v.trim().slice(0, 60);
    if (v) done(v);
  }

  function renderList(root) {
    var head = el("div", "qn-sl-head");
    head.appendChild(el("span", "qn-sl-title", "Setlists"));
    head.appendChild(btn("+ New", "is-primary", function () {
      askName("Setlist name (e.g. band name)", "", function (name) {
        var sl = { id: uid(), name: name, songs: [], u: Date.now() }; list.push(sl); save();
        view = { mode: "detail", id: sl.id, q: "" }; render();
      });
    }));
    root.appendChild(head);
    var sc = el("div", "qn-sl-scroll"); root.appendChild(sc);
    if (!list.length) {
      sc.appendChild(el("p", "qn-sl-note", "Make a setlist for each band or gig, then play the songs in that order. The same song can be in several setlists."));
      return;
    }
    list.forEach(function (sl) {
      var t = total(sl);
      var row = el("div", "qn-sl-row is-list"); row.tabIndex = 0;
      var info = el("div", "qn-sl-info");
      info.appendChild(el("span", "qn-sl-name", sl.name));
      info.appendChild(el("small", "", t.n + (t.n === 1 ? " song" : " songs") + (t.sec ? " · " + fmtTotal(t.sec) : "")));
      row.appendChild(info);
      row.appendChild(iconBtn("M8 5v14l11-7z", "Play", function () { playFrom(sl); }, "is-play"));
      row.onclick = function () { view = { mode: "detail", id: sl.id, q: "" }; render(); };
      sc.appendChild(row);
    });
  }

  function renderDetail(root, sl) {
    var head = el("div", "qn-sl-head");
    head.appendChild(iconBtn(P_BACK, "Back", function () { view = { mode: "list", id: null, q: "" }; render(); }));
    head.appendChild(el("span", "qn-sl-title", sl.name));
    head.appendChild(iconBtn(P_EDIT, "Rename", function () { askName("Setlist name", sl.name, function (n) { sl.name = n; touch(sl); save(); render(); }); }));
    head.appendChild(iconBtn(P_COPY, "Duplicate", function () {
      var c = { id: uid(), name: (sl.name + " copy").slice(0, 60), songs: sl.songs.slice(), u: Date.now() }; list.splice(list.indexOf(sl) + 1, 0, c); save();
      view = { mode: "detail", id: c.id, q: "" }; render(); toast("Duplicated");
    }));
    head.appendChild(iconBtn(P_DEL, "Delete setlist", function () {
      if (!window.confirm("Delete the setlist \"" + sl.name + "\"? The songs stay in the Library.")) return;
      list.splice(list.indexOf(sl), 1); bury(sl.id); save(); view = { mode: "list", id: null, q: "" }; render();
    }));
    root.appendChild(head);

    var bar = el("div", "qn-sl-bar");
    var t = total(sl);
    bar.appendChild(el("small", "", t.n + (t.n === 1 ? " song" : " songs") + (t.sec ? " · " + fmtTotal(t.sec) : "")));
    var acts = el("div", "qn-sl-acts");
    acts.appendChild(btn("Play", "is-primary", function () { playFrom(sl); }));
    acts.appendChild(btn("+ Add songs", "", function () { view = { mode: "add", id: sl.id, q: "" }; render(); }));
    bar.appendChild(acts);
    root.appendChild(bar);

    var sc = el("div", "qn-sl-scroll"); root.appendChild(sc);
    if (!sl.songs.length) { sc.appendChild(el("p", "qn-sl-note", "No songs yet. Tap + Add songs.")); return; }
    var box = el("div", "qn-sl-songs"); sc.appendChild(box);
    var playingName = typeof currentPlaylistIndex === "number" && playlist[currentPlaylistIndex] ? playlist[currentPlaylistIndex].name : null;
    sl.songs.forEach(function (nm, k) {
      var ti = trackOf(nm), tr = ti >= 0 ? playlist[ti] : null;
      var row = el("div", "qn-sl-row is-song" + (!tr ? " is-missing" : "") + (tr && tr.enabled === false ? " is-off" : "") + (nm === playingName ? " is-playing" : ""));
      row.dataset.k = k;
      var h = el("span", "qn-sl-handle"); h.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + P_DRAG + '"/></svg>'; row.appendChild(h);
      row.appendChild(el("span", "qn-sl-num", String(k + 1)));
      var info = el("div", "qn-sl-info");
      info.appendChild(el("span", "qn-sl-name", tr ? (tr.title || tr.name) : nm));
      info.appendChild(el("small", "", tr ? (tr.artist || "") : "Not in Library"));
      row.appendChild(info);
      row.appendChild(el("span", "qn-sl-dur", tr && tr.duration ? formatTime(tr.duration) : ""));
      row.appendChild(iconBtn(P_X, "Remove from setlist", function () { sl.songs.splice(k, 1); touch(sl); save(); render(); }));
      row.onclick = function (e) { if (e.target.closest(".qn-sl-handle, button")) return; if (tr) playFrom(sl, nm); else toast("Not in Library"); };
      attachDrag(h, row, box, sl);
      box.appendChild(row);
    });
  }

  // つまみのドラッグで並び替え(行はtransformだけ動かし、離した時に1回だけ配列を更新)
  function attachDrag(handle, row, box, sl) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      var rows = Array.prototype.slice.call(box.querySelectorAll(".qn-sl-row"));
      var from = rows.indexOf(row), to = from;
      var rects = rows.map(function (r) { return r.getBoundingClientRect(); });
      var h = rects[from].height, y0 = e.clientY, sc = box.closest(".qn-sl-scroll"), s0 = sc ? sc.scrollTop : 0;
      row.classList.add("is-dragging");
      try { handle.setPointerCapture(e.pointerId); } catch (er) {}
      function move(ev) {
        var dy = ev.clientY - y0 + (sc ? sc.scrollTop - s0 : 0);
        row.style.transform = "translateY(" + dy + "px)";
        to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
        rows.forEach(function (r, i) {
          if (r === row) return;
          var sh = (i < from && i >= to) ? 1 : (i > from && i <= to) ? -1 : 0;
          r.style.transform = sh ? "translateY(" + sh * h + "px)" : "";
        });
        if (sc) { var b = sc.getBoundingClientRect(); if (ev.clientY < b.top + 30) sc.scrollTop -= 8; else if (ev.clientY > b.bottom - 30) sc.scrollTop += 8; }
      }
      function up() {
        handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
        if (to !== from) { var m = sl.songs.splice(from, 1)[0]; sl.songs.splice(to, 0, m); touch(sl); save(); }
        render();
      }
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
    });
  }

  function renderAdd(root, sl) {
    var head = el("div", "qn-sl-head");
    head.appendChild(iconBtn(P_BACK, "Back", function () { view = { mode: "detail", id: sl.id, q: "" }; render(); }));
    head.appendChild(el("span", "qn-sl-title", "Add songs"));
    head.appendChild(btn("Done", "is-primary", function () { view = { mode: "detail", id: sl.id, q: "" }; render(); }));
    root.appendChild(head);
    var s = el("input", "qn-sl-search"); s.type = "search"; s.placeholder = "Search"; s.value = view.q;
    root.appendChild(s);
    var sc = el("div", "qn-sl-scroll"); root.appendChild(sc);
    var box = el("div", "qn-sl-songs"); sc.appendChild(box);
    function fill() {
      box.innerHTML = "";
      var q = view.q.trim().toLowerCase(), n = 0;
      // フォルダ順(Libraryの見た目)で並べる
      var order = [];
      if (playlistFolders.length) {
        playlistFolders.forEach(function (f) { playlist.forEach(function (t) { if (trackFolderId(t) === f.id) order.push(t); }); });
        playlist.forEach(function (t) { if (trackFolderId(t) === null) order.push(t); });
      } else order = playlist.slice();
      order.forEach(function (tr) {
        var label = (tr.title || tr.name) + " " + (tr.artist || "");
        if (q && label.toLowerCase().indexOf(q) < 0) return;
        n++;
        var on = sl.songs.indexOf(tr.name) >= 0;
        var row = el("div", "qn-sl-row is-pick" + (on ? " is-on" : ""));
        var chk = el("span", "qn-sl-check"); chk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>'; row.appendChild(chk);
        var info = el("div", "qn-sl-info");
        info.appendChild(el("span", "qn-sl-name", tr.title || tr.name));
        info.appendChild(el("small", "", tr.artist || ""));
        row.appendChild(info);
        row.appendChild(el("span", "qn-sl-dur", tr.duration ? formatTime(tr.duration) : ""));
        row.onclick = function () {
          var k = sl.songs.indexOf(tr.name);
          if (k >= 0) sl.songs.splice(k, 1); else sl.songs.push(tr.name);
          touch(sl); save(); row.classList.toggle("is-on", k < 0);
        };
        box.appendChild(row);
      });
      if (!n) box.appendChild(el("p", "qn-sl-note", playlist.length ? "No match." : "The Library is empty."));
    }
    s.oninput = function () { view.q = s.value; fill(); };
    fill();
  }

  // ---------- 外部API ----------
  window.QNSetlist = {
    mount: function (h) { host = h; h.classList.add("pcv2-panel-aux"); render(); },
    // 同期(player-sync.js)用。syncState=今の状態、syncApply=合体結果の反映(書き込みは同期側がapplying中に呼ぶ)
    syncState: function () {
      var live = {}; list.forEach(function (s) { live[s.id] = { n: s.name, s: s.songs.slice(), u: s.u || 0 }; });
      var now = Date.now(), tomb = {}; Object.keys(tombs).forEach(function (id) { if (now - tombs[id] < TOMB_TTL) tomb[id] = tombs[id]; });
      return { live: live, tomb: tomb };
    },
    syncApply: function (live, tomb) {
      var next = [];
      // 並びは今の配列順を保ち、新しいものを末尾へ(リモートの順序は持たない)
      list.forEach(function (s) { var r = live[s.id]; if (r) next.push({ id: s.id, name: r.n, songs: r.s.slice(), u: r.u }); });
      Object.keys(live).forEach(function (id) { if (!byId(id)) next.push({ id: id, name: live[id].n, songs: live[id].s.slice(), u: live[id].u }); });
      list = next; tombs = {}; Object.keys(tomb).forEach(function (id) { tombs[id] = tomb[id]; });
      save(); saveTombs();
      if (view.id && !byId(view.id)) view = { mode: "list", id: null, q: "" };
      if (host && host.isConnected) render();
    },
    refresh: function () { if (host && host.isConnected) render(); },
    exportData: function () { return list.map(function (s) { return { name: s.name, songs: s.songs.slice() }; }); },
    // バックアップの取り込み: 同名のセットリストは曲を追加(重複なし)、無ければ新規
    importData: function (arr) {
      if (!Array.isArray(arr)) return 0;
      var n = 0;
      arr.forEach(function (s) {
        if (!s || typeof s.name !== "string" || !Array.isArray(s.songs)) return;
        var songs = s.songs.filter(function (x) { return typeof x === "string"; });
        var cur = null; list.forEach(function (c) { if (c.name === s.name) cur = c; });
        if (cur) { songs.forEach(function (x) { if (cur.songs.indexOf(x) < 0) cur.songs.push(x); }); touch(cur); }
        else list.push({ id: uid(), name: s.name.slice(0, 60), songs: songs, u: Date.now() });
        n++;
      });
      if (n) { save(); if (host && host.isConnected) render(); }
      return n;
    }
  };
  if (typeof audio !== "undefined") audio.addEventListener("loadstart", function () { if (host && host.isConnected && view.mode === "detail") render(); });
  window.addEventListener("storage", function (e) { if (e.key === KEY) { list = read(); if (host && host.isConnected) render(); } });
})();
