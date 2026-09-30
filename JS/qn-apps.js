// ============================================================
// qn-apps.js  —  MORE ボタン ＆ アプリ一覧（サイドバー切替）＆ アプリ表示領域
//
// 【何をするファイルか】
//   PC v2 のサイドバー(#pcV2IconBar)の一番下に「MORE」ボタンを足す。
//   押すとサイドバーの中身が「アプリ一覧」に切り替わり（見た目・サイズ・位置は
//   通常のサイドバーアイコン .pcv2-icon-item と完全に同じ）、MORE は BACK に変わる。
//   一覧のアプリを選ぶと、サイドバー右側〜画面下端の領域（#qnAppHost）が
//   そのアプリの画面に切り替わる。BACK / PLAYER で QNPLAYER 本体に戻る。
//
// 【アプリの足し方（今後も増える前提）】
//   1) JS/qn-app-xxx.js を作り、次を呼ぶだけ：
//        QNApps.register({
//          id: "youtube",            // 一意ID
//          label: "YouTube",         // サイドバーのラベル（大文字で表示される）
//          icon: '<path d="..."/>',  // 24x24 viewBox の SVG path
//          order: 10,                // 一覧の並び順（小さいほど上）
//          ready: true,              // false なら「準備中」（押すとトースト表示）
//          mount(viewEl) {},         // 初回表示時に1回だけ呼ばれる。viewEl に画面を作る
//          onShow() {},              // 表示されるたびに呼ばれる
//          onHide() {}               // 隠れるたびに呼ばれる
//        });
//   2) index.html に <script src="JS/qn-app-xxx.js"></script> を追加（qn-apps.js より後）。
//   準備中アプリ（TUNER / PITCH）は、このファイル末尾の register で定義している。
//   完成したら ready:true にして mount/onShow/onHide を持たせるか、
//   専用ファイルに移して register し直す（同じ id で register すると置き換わる）。
//
// 【他ファイルとの接点】
//   - #pcV2IconBar / #pcV2IconBarBottom / #pcV2IconBarSpacer / #pcV2Layout
//     （player-ui-pc-v2.js の build() が作る。ここでは出来上がるのを待つだけ）
//   - アプリ表示中は body.qn-app-open が付く。player-ui-shared.js のキーボード
//     ショートカット（Space=再生 等）はこのクラスを見て無効化される。
//   - アプリを開く時、QNPLAYER の audio は一時停止する。
// ============================================================
(function () {
  "use strict";

  var MORE_ICON = '<path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>';
  var BACK_ICON = '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>';
  var PLAYER_ICON = '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>';

  var SP_QUERY = "(max-width: 900px)";

  var apps = [];            // 登録済みアプリ（order順）
  var current = null;       // 今開いているアプリ（null = QNPLAYER本体）
  var appsMode = false;     // サイドバーがアプリ一覧になっているか
  var iconBar = null, host = null, moreBtn = null, toastEl = null, toastTimer = null;
  var views = {};           // id -> viewEl
  var mounted = {};         // id -> true
  var resizeObs = null;

  function $(id) { return document.getElementById(id); }

  function haptic() {
    if (typeof hapticTap === "function") { try { hapticTap(); } catch (e) {} }
  }

  function findApp(id) {
    for (var i = 0; i < apps.length; i++) if (apps[i].id === id) return apps[i];
    return null;
  }

  function makeItemButton(attrs, iconPath, label, title) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pcv2-icon-item " + (attrs.cls || "");
    if (attrs.appId) btn.setAttribute("data-app-id", attrs.appId);
    btn.title = title || label;
    btn.innerHTML = '<svg viewBox="0 0 24 24">' + iconPath + "</svg><span></span>";
    btn.querySelector("span").textContent = label;
    return btn;
  }

  // ---------- サイドバーのアプリ項目 ----------
  function renderAppItems() {
    if (!iconBar) return;
    var old = iconBar.querySelectorAll(".qn-app-item");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

    var spacer = $("pcV2IconBarSpacer");
    apps.forEach(function (app) {
      var btn = makeItemButton(
        { cls: "qn-app-item" + (app.ready ? "" : " qn-app-soon"), appId: app.id },
        app.icon, app.label.toUpperCase(),
        app.ready ? app.label : app.label + " (coming soon)"
      );
      btn.addEventListener("click", function () { haptic(); open(app.id); });
      if (spacer) iconBar.insertBefore(btn, spacer); else iconBar.appendChild(btn);
    });
    syncActiveStates();
  }

  function syncActiveStates() {
    if (!iconBar) return;
    var items = iconBar.querySelectorAll(".qn-app-item");
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute("data-app-id");
      var isActive = (current ? current.id === id : id === "player");
      items[i].classList.toggle("qn-app-active", isActive);
    }
  }

  function setAppsMode(on) {
    appsMode = !!on;
    if (!iconBar || !moreBtn) return;
    iconBar.classList.toggle("qn-apps-mode", appsMode);
    moreBtn.querySelector("svg").innerHTML = appsMode ? BACK_ICON : MORE_ICON;
    moreBtn.querySelector("span").textContent = appsMode ? "Back" : "More";
    moreBtn.title = appsMode ? "Back to menu" : "More apps";
    moreBtn.setAttribute("aria-pressed", appsMode ? "true" : "false");
    syncActiveStates();
    if (iconBar.scrollTo) iconBar.scrollTo(0, 0);
    if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("resize"));
  }

  // ---------- 表示領域(#qnAppHost)の位置合わせ ----------
  // ホストは position: fixed。PC幅ではアイコンバーの右〜画面下端、SP幅では
  // ヘッダー直下〜アイコンバー直上を覆う。アプリ表示中は下段バー等を
  // CSSで隠す(style-apps.css)ので、#pcV2Layout の矩形がそのまま使える。
  function layoutHost() {
    if (!host) return;
    var layout = $("pcV2Layout"), bar = $("pcV2IconBar");
    if (!layout || !bar) return;
    var lr = layout.getBoundingClientRect();
    var br = bar.getBoundingClientRect();
    var sp = window.matchMedia(SP_QUERY).matches;
    host.style.top = lr.top + "px";
    if (sp) {
      host.style.left = "0px";
      host.style.right = "0px";
      host.style.bottom = Math.max(0, window.innerHeight - br.top) + "px";
    } else {
      host.style.left = br.right + "px";
      host.style.right = "0px";
      host.style.bottom = Math.max(0, window.innerHeight - lr.bottom) + "px";
    }
  }

  function ensureHost() {
    if (host) return host;
    host = document.createElement("div");
    host.id = "qnAppHost";
    host.hidden = true;
    document.body.appendChild(host);
    window.addEventListener("resize", function () { if (current) layoutHost(); });
    window.addEventListener("orientationchange", function () { if (current) layoutHost(); });
    return host;
  }

  function ensureView(app) {
    if (views[app.id]) return views[app.id];
    var v = document.createElement("div");
    v.className = "qn-app-view";
    v.setAttribute("data-app-view", app.id);
    v.hidden = true;
    ensureHost().appendChild(v);
    views[app.id] = v;
    return v;
  }

  // ---------- トースト ----------
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "qnAppToast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  // ---------- 開く / 閉じる ----------
  function pausePlayerAudio() {
    try { if (typeof audio !== "undefined" && audio && !audio.paused) audio.pause(); } catch (e) {}
  }

  function open(id) {
    var app = findApp(id);
    if (!app) return;
    if (id === "player") { close(); return; }
    if (!app.ready) { toast(app.label + " is coming soon"); return; }
    if (current && current.id === id) return;

    if (current && typeof current.onHide === "function") {
      try { current.onHide(); } catch (e) { console.error(e); }
      views[current.id].hidden = true;
    }

    var view = ensureView(app);
    if (!mounted[id]) {
      mounted[id] = true;
      try { if (typeof app.mount === "function") app.mount(view); } catch (e) { console.error(e); }
    }

    current = app;
    pausePlayerAudio();
    document.body.classList.add("qn-app-open");
    host.hidden = false;
    view.hidden = false;
    layoutHost();
    syncActiveStates();
    // 下段バー等を隠した結果レイアウトが変わるため、次フレームでも合わせ直す
    requestAnimationFrame(layoutHost);

    if (typeof app.onShow === "function") {
      try { app.onShow(); } catch (e) { console.error(e); }
    }
  }

  function close() {
    if (!current) { syncActiveStates(); return; }
    var app = current;
    current = null;
    if (typeof app.onHide === "function") {
      try { app.onHide(); } catch (e) { console.error(e); }
    }
    if (views[app.id]) views[app.id].hidden = true;
    if (host) host.hidden = true;
    document.body.classList.remove("qn-app-open");
    syncActiveStates();
    window.dispatchEvent(new Event("resize")); // 波形などの再計測
  }

  // ---------- MOREボタン ----------
  function buildMore() {
    var bottom = $("pcV2IconBarBottom");
    if (!bottom || $("qnMoreBtn")) return;
    moreBtn = makeItemButton({ cls: "qn-more-btn" }, MORE_ICON, "More", "More apps");
    moreBtn.id = "qnMoreBtn";
    moreBtn.addEventListener("click", function () {
      haptic();
      if (appsMode) {
        // BACK：アプリを閉じて通常のサイドバーへ
        close();
        setAppsMode(false);
      } else {
        setAppsMode(true);
      }
    });
    bottom.appendChild(moreBtn);
  }

  // ---------- 起動：player-ui-pc-v2.js の build() 完了を待つ ----------
  function init() {
    iconBar = $("pcV2IconBar");
    if (!iconBar || !$("pcV2IconBarBottom")) return false;
    buildMore();
    renderAppItems();
    ensureHost();
    var layout = $("pcV2Layout");
    if (layout && window.ResizeObserver && !resizeObs) {
      resizeObs = new ResizeObserver(function () { if (current) layoutHost(); });
      resizeObs.observe(layout);
    }
    return true;
  }

  function waitForSidebar() {
    if (init()) return;
    var mo = new MutationObserver(function () {
      if (init()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- 公開API ----------
  function register(def) {
    if (!def || !def.id) return;
    var idx = -1;
    for (var i = 0; i < apps.length; i++) if (apps[i].id === def.id) idx = i;
    var app = {
      id: def.id,
      label: def.label || def.id,
      icon: def.icon || MORE_ICON,
      order: typeof def.order === "number" ? def.order : 100,
      ready: def.ready !== false,
      mount: def.mount, onShow: def.onShow, onHide: def.onHide
    };
    if (idx >= 0) apps[idx] = app; else apps.push(app);
    apps.sort(function (a, b) { return a.order - b.order; });
    renderAppItems();
  }

  window.QNApps = {
    register: register,
    open: open,
    close: close,
    toast: toast,
    getCurrentId: function () { return current ? current.id : null; },
    layout: layoutHost
  };

  // 先頭の「PLAYER」＝QNPLAYER本体に戻る項目（アプリ一覧でも本体を選べるように）
  register({ id: "player", label: "Player", icon: PLAYER_ICON, order: 0, ready: true });

  // 準備中のアプリ（後日組み込み）。押すと "coming soon" のトーストを出す。
  register({
    id: "tuner", label: "Tuner", order: 20, ready: false,
    icon: '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>'
  });
  register({
    id: "pitch", label: "Pitch", order: 30, ready: false,
    icon: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForSidebar);
  } else {
    waitForSidebar();
  }
})();
