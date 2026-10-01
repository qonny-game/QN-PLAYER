// ============================================================
// qn-apps.js  —  アプリ名バッジ ＆ アプリ一覧フライアウト ＆ アプリ表示領域
//
// 【何をするファイルか】（v3.0.0〜。旧MOREボタン／アプリ一覧モードは撤去）
//   サイドバー(#pcV2IconBar)の先頭に、現在のアプリ名バッジ(#qnAppBadge)を置く。
//   バッジには「＞」が付いており、サブメニュー（アプリ一覧）があることを示す。
//   PC幅：バッジにマウスを載せると、サイドバーの右に同じデザインのフライアウト
//         (#qnAppFlyout)が出て、パネルの上に重なる。クリックでも開く。
//   SP幅／タッチ：バッジをタップするとアイコンバーの上に一覧が開く。
//         もう一度タップ、または外側タップ／Escで閉じる。
//   一覧のアプリを選ぶと、サイドバー右側〜画面下端の領域（#qnAppHost）が
//   そのアプリの画面に切り替わる。PLAYER を選ぶと QNPLAYER 本体に戻る。
//
// 【アプリの足し方（今後も増える前提）】
//   1) JS/qn-app-xxx.js を作り、次を呼ぶだけ：
//        QNApps.register({
//          id: "youtube",            // 一意ID
//          label: "YouTube",         // サイドバーのラベル（大文字で表示される）
//          icon: '<path d="..."/>',  // 24x24 viewBox の SVG path
//          order: 10,                // 一覧の並び順（小さいほど上）
//          ready: true,              // false なら「準備中」（押すとトースト表示）
//          sidebar: [{id,label,icon}],  // アプリ表示中のサイドバー項目（本体のControl/Markers…に相当）
//          onSidebar(itemId) {},     // その項目が押された時。選択表示は QNApps.setSideActive(itemId|null)
//          shortcuts: [{key, action}],  // 任意。Keyboard表の行（"Space / K" のように " " 区切りで複数キー可）
//          shortcutsNote: "注記",    // 任意。表の下に出す一言
//            → Keyboardパネルの中身は QNApps.renderShortcuts(hostEl, "<id>") の1行で出る
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
  var CHEVRON_ICON = '<path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>';
  var PLAYER_ICON = '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>';

  var SP_QUERY = "(max-width: 900px)";

  var apps = [];            // 登録済みアプリ（order順）
  var current = null;       // 今開いているアプリ（null = QNPLAYER本体）
  var iconBar = null, host = null, badgeBtn = null, flyout = null, scrim = null, flyoutOpen = false, flyoutHideTimer = null, flyoutTimer = null, toastEl = null, toastTimer = null;
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

  // ---------- アプリ一覧フライアウト（バッジにホバー／タップで開く） ----------
  // 見た目は通常のサイドバーと同じ .pcv2-icon-item を並べたもの。
  // body直下に置き、PC幅ではバッジの右（パネルの上に重ねる）、
  // SP幅ではアイコンバーの直上に出す。
  function ensureFlyout() {
    if (flyout) return flyout;
    flyout = document.createElement("div");
    flyout.id = "qnAppFlyout";
    flyout.hidden = true;
    flyout.setAttribute("role", "menu");
    document.body.appendChild(flyout);
    flyout.addEventListener("mouseenter", cancelFlyoutClose);
    flyout.addEventListener("mouseleave", scheduleFlyoutClose);
    return flyout;
  }

  function renderAppItems() {
    var fo = ensureFlyout();
    fo.innerHTML = "";
    apps.forEach(function (app) {
      var btn = makeItemButton(
        { cls: "qn-flyout-item" + (app.ready ? "" : " qn-app-soon"), appId: app.id },
        app.icon, app.label.toUpperCase(),
        app.ready ? app.label : app.label + " (coming soon)"
      );
      btn.setAttribute("role", "menuitem");
      btn.addEventListener("click", function () {
        haptic();
        closeFlyout();
        open(app.id);
      });
      fo.appendChild(btn);
    });
    syncActiveStates();
  }

  function syncActiveStates() {
    if (!flyout) return;
    var items = flyout.querySelectorAll(".qn-flyout-item");
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute("data-app-id");
      var isActive = (current ? current.id === id : id === "player");
      items[i].classList.toggle("qn-app-active", isActive);
    }
  }

  function isSp() { return window.matchMedia(SP_QUERY).matches; }
  function canHover() { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; }

  function positionFlyout() {
    if (!flyout || !iconBar || !badgeBtn) return;
    var br = iconBar.getBoundingClientRect();
    var sp = isSp();
    flyout.classList.toggle("qn-flyout-sp", sp);
    if (scrim) scrim.classList.toggle("qn-scrim-sp", sp);
    if (sp) {
      // SP：アイコンバーの真上に、幅いっぱいで下からにゅっと
      flyout.style.left = "0px";
      flyout.style.right = "0px";
      flyout.style.top = "auto";
      flyout.style.bottom = Math.max(0, window.innerHeight - br.top) + "px";
    } else {
      // PC：サイドバーと同じ縦幅いっぱい（上端〜下端）で、右から左へにゅっと
      flyout.style.left = br.right + "px";
      flyout.style.right = "auto";
      flyout.style.top = br.top + "px";
      flyout.style.bottom = Math.max(0, window.innerHeight - br.bottom) + "px";
    }
  }

  // 「ここにアプリ一覧が出たよ」を分かりやすくする薄暗い幕（クリックは素通し）
  function ensureScrim() {
    if (scrim) return scrim;
    scrim = document.createElement("div");
    scrim.id = "qnAppScrim";
    scrim.hidden = true;
    document.body.appendChild(scrim);
    return scrim;
  }

  function openFlyout() {
    if (!flyout || flyoutOpen) return;
    flyoutOpen = true;
    cancelFlyoutClose();
    if (flyoutHideTimer) { clearTimeout(flyoutHideTimer); flyoutHideTimer = null; }
    closeColorPop();
    ensureScrim();
    positionFlyout();
    flyout.hidden = false;
    scrim.hidden = false;
    void flyout.offsetWidth; // 初期位置を確定させてからアニメーション開始
    flyout.classList.add("qn-flyout-in");
    scrim.classList.add("qn-scrim-in");
    if (badgeBtn) {
      badgeBtn.classList.add("qn-badge-open");
      badgeBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeFlyout() {
    cancelFlyoutClose();
    if (!flyout || !flyoutOpen) return;
    flyoutOpen = false;
    flyout.classList.remove("qn-flyout-in");
    if (scrim) scrim.classList.remove("qn-scrim-in");
    if (badgeBtn) {
      badgeBtn.classList.remove("qn-badge-open");
      badgeBtn.setAttribute("aria-expanded", "false");
    }
    // アニメーション終了後に完全に隠す（その間に開き直されたら隠さない）
    if (flyoutHideTimer) clearTimeout(flyoutHideTimer);
    flyoutHideTimer = setTimeout(function () {
      flyoutHideTimer = null;
      if (flyoutOpen) return;
      flyout.hidden = true;
      if (scrim) scrim.hidden = true;
    }, 280);
  }

  function scheduleFlyoutClose() {
    if (!canHover() || isSp()) return;
    cancelFlyoutClose();
    flyoutTimer = setTimeout(closeFlyout, 160);
  }
  function cancelFlyoutClose() {
    if (flyoutTimer) { clearTimeout(flyoutTimer); flyoutTimer = null; }
  }

  // サイドバーの表示状態は2通り：
  //   本体(PLAYER)   : 通常のアイコン
  //   アプリ表示中   : そのアプリ専用のアイコン(def.sidebar)
  // どちらも先頭のバッジ（現在のアプリ名＋＞）から、アプリ一覧フライアウトを開く。
  function renderAppSideItems() {
    if (!iconBar) return;
    var old = document.querySelectorAll("#pcV2IconBar .qn-appside-item");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    if (!current || !current.sidebar) return;
    var spacer = $("pcV2IconBarSpacer");
    // 下段グループ(#pcV2IconBarBottom)に置く項目（it.bottom）は、常駐のColorの直前へ。
    // 本体(PLAYER)と同じ「Backup / Import / Keyboard / Color」の並びにするため（v3.17.0〜）。
    var bottomBox = $("pcV2IconBarBottom");
    var colorBtn = bottomBox ? bottomBox.querySelector('[data-panel-id="color"]') : null;
    current.sidebar.forEach(function (it) {
      var btn = makeItemButton({ cls: "qn-appside-item" }, it.icon, it.label, it.label);
      btn.setAttribute("data-side-id", it.id);
      btn.addEventListener("click", function () {
        haptic();
        if (typeof current.onSidebar === "function") current.onSidebar(it.id);
      });
      if (it.bottom && bottomBox) bottomBox.insertBefore(btn, colorBtn || null);
      else if (spacer) iconBar.insertBefore(btn, spacer); else iconBar.appendChild(btn);
    });
    setSideActive(sideActiveId);
  }

  var sideActiveId = null;
  function setSideActive(id) {
    sideActiveId = id;
    if (!iconBar) return;
    var items = iconBar.querySelectorAll(".qn-appside-item");   // 下段グループの項目も含む（子孫）
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("qn-app-active", items[i].getAttribute("data-side-id") === id);
    }
  }

  // ---------- 現在のアプリ名バッジ（サイドバーの先頭） ----------
  // 「今どのアプリに居るか」を示す。右端の「＞」はサブメニュー（アプリ一覧）あり、の印。
  // PC幅(マウス)：ホバーで開く／クリックでも開く。SP・タッチ：タップで開閉。
  function buildBadge() {
    if (!iconBar || $("qnAppBadge")) return;
    badgeBtn = makeItemButton({ cls: "qn-app-badge" }, PLAYER_ICON, "Player", "Apps");
    badgeBtn.id = "qnAppBadge";
    badgeBtn.setAttribute("aria-haspopup", "menu");
    badgeBtn.setAttribute("aria-expanded", "false");
    var chev = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chev.setAttribute("viewBox", "0 0 24 24");
    chev.setAttribute("class", "qn-badge-chev");
    chev.setAttribute("aria-hidden", "true");
    chev.innerHTML = CHEVRON_ICON;
    badgeBtn.appendChild(chev);

    badgeBtn.addEventListener("mouseenter", function () {
      if (canHover() && !isSp()) openFlyout();
    });
    badgeBtn.addEventListener("mouseleave", scheduleFlyoutClose);
    badgeBtn.addEventListener("click", function () {
      haptic();
      if (flyoutOpen) {
        // マウスのPC幅ではホバーで既に開いているので、クリックでは閉じない
        if (!(canHover() && !isSp())) closeFlyout();
      } else {
        openFlyout();
      }
    });
    iconBar.insertBefore(badgeBtn, iconBar.firstChild);
  }

  function updateBadge() {
    if (!badgeBtn) return;
    var app = current || findApp("player");
    if (!app) return;
    badgeBtn.querySelector("svg").innerHTML = app.icon;
    badgeBtn.querySelector("span").textContent = app.label.toUpperCase();
    badgeBtn.title = app.label + " — switch app";
  }

  function refreshSidebar() {
    if (!iconBar) return;
    updateBadge();
    iconBar.classList.toggle("qn-app-sidebar", !!current);
    renderAppSideItems();
    syncActiveStates();
    if (iconBar.scrollTo) iconBar.scrollTo(0, 0);
    window.dispatchEvent(new Event("resize"));
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

  // ---------- 最後に開いていたアプリを再読み込み後に復元 ----------
  var LAST_APP_KEY = "qn_last_app";
  function saveLastApp(id) { try { localStorage.setItem(LAST_APP_KEY, id); } catch (e) {} }
  var restoreScheduled = false;
  function scheduleRestore() {
    if (restoreScheduled) return;
    restoreScheduled = true;
    function run() {
      var id = null;
      try { id = localStorage.getItem(LAST_APP_KEY); } catch (e) {}
      var app = id && id !== "player" ? findApp(id) : null;
      // 準備中のアプリ・見つからないアプリは復元しない（本体のまま）
      if (app && app.ready && !current) open(id);
    }
    // 全スクリプト(各アプリの register)が実行された後に行う
    if (document.readyState === "complete") setTimeout(run, 0);
    else window.addEventListener("load", function () { setTimeout(run, 0); });
  }

  function open(id) {
    var app = findApp(id);
    if (!app) return;
    // PLAYER＝本体に戻る
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
    saveLastApp(id);
    pausePlayerAudio();
    document.body.classList.add("qn-app-open");
    host.hidden = false;
    view.hidden = false;
    layoutHost();
    sideActiveId = null;
    refreshSidebar();
    // 下段バー等を隠した結果レイアウトが変わるため、次フレームでも合わせ直す
    requestAnimationFrame(layoutHost);

    if (typeof app.onShow === "function") {
      try { app.onShow(); } catch (e) { console.error(e); }
    }
  }

  function close() {
    closeColorPop();
    closeFlyout();
    if (!current) { syncActiveStates(); return; }
    saveLastApp("player");
    var app = current;
    current = null;
    if (typeof app.onHide === "function") {
      try { app.onHide(); } catch (e) { console.error(e); }
    }
    if (views[app.id]) views[app.id].hidden = true;
    if (host) host.hidden = true;
    document.body.classList.remove("qn-app-open");
    sideActiveId = null;
    refreshSidebar();
    window.dispatchEvent(new Event("resize")); // 波形などの再計測
  }

  // ---------- Color(常駐) ----------
  // Colorボタンは常にサイドバーに残す。PLAYER本体ではこれまで通りパネルを開くが、
  // アプリ表示中はパネルが見えないため、テーマ切替セクションを
  // その場のポップオーバーに借りて表示する（閉じたら元の場所へ戻す）。
  var colorPop = null, colorSec = null, colorHome = null, colorNext = null;

  function findColorSection() {
    return document.querySelector('.qn-menu-section[data-qn-section="theme"]');
  }

  // PLAYERのパネルと同じ見た目・同じ位置（PC＝アイコンバー右の左カラム全高、
  // SP＝アイコンバーの上）。SPでアプリが「常時表示すべきプレイヤー」
  // ([data-qn-keep-visible])を持つ場合は、それを覆わないよう直下から始める。
  function positionColorPop() {
    if (!colorPop) return;
    var bar = $("pcV2IconBar"), layout = $("pcV2Layout");
    if (!bar || !layout) return;
    var bar_r = bar.getBoundingClientRect(), lr = layout.getBoundingClientRect();
    var sp = window.matchMedia(SP_QUERY).matches;
    colorPop.classList.toggle("qn-colorpanel-sp", sp);
    if (sp) {
      var top = lr.top;
      var keep = document.querySelector("#qnAppHost [data-qn-keep-visible]");
      if (keep && current) {
        var kr = keep.getBoundingClientRect();
        if (kr.width > 0) top = Math.max(top, kr.bottom + 8);
      }
      colorPop.style.left = "0px"; colorPop.style.right = "0px"; colorPop.style.width = "auto";
      colorPop.style.top = top + "px";
      colorPop.style.bottom = Math.max(0, window.innerHeight - bar_r.top) + "px";
    } else {
      colorPop.style.left = bar_r.right + "px"; colorPop.style.right = "auto";
      colorPop.style.width = "375px";
      colorPop.style.top = lr.top + "px";
      colorPop.style.bottom = Math.max(0, window.innerHeight - lr.bottom) + "px";
    }
  }

  function closeColorPop() {
    if (!colorPop || colorPop.hidden) return;
    colorPop.hidden = true;
    if (colorSec && colorHome && colorHome.isConnected) {
      if (colorNext && colorNext.parentNode === colorHome) colorHome.insertBefore(colorSec, colorNext);
      else colorHome.appendChild(colorSec);
    }
    var b = document.querySelector('#pcV2IconBarBottom [data-panel-id="color"]');
    if (b) b.classList.remove("qn-app-active");
    colorSec = colorHome = colorNext = null;
  }

  function openColorPop() {
    var sec = findColorSection();
    if (!sec) return;
    if (!colorPop) {
      colorPop = document.createElement("div");
      colorPop.id = "qnColorPop";
      colorPop.hidden = true;
      colorPop.innerHTML = '<div class="qn-colorpanel-head"><span class="pcv2-panel-header-title">Color</span></div>' +
        '<div class="qn-colorpanel-body"></div>';
      document.body.appendChild(colorPop);
      // サイドバーの他の項目（アプリ専用アイコン/バッジ/MORE等）を押したらパネルを閉じる
      // （PLAYERでパネルが切り替わるのと同じ挙動。Colorボタン自身は別処理）
      iconBar.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest('[data-panel-id="color"]')) return;
        closeColorPop();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeColorPop();
      });
      window.addEventListener("resize", positionColorPop);
    }
    colorSec = sec; colorHome = sec.parentNode; colorNext = sec.nextSibling;
    colorPop.querySelector(".qn-colorpanel-body").appendChild(sec);
    colorPop.hidden = false;
    positionColorPop();
    var b = document.querySelector('#pcV2IconBarBottom [data-panel-id="color"]');
    if (b) b.classList.add("qn-app-active");
  }

  function initColorKeeper() {
    var bottom = $("pcV2IconBarBottom");
    if (!bottom || bottom.__qnColor) return;
    bottom.__qnColor = true;
    // キャプチャ段階で先取りし、アプリ表示中だけ本体のパネル処理を止める
    bottom.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest('[data-panel-id="color"]');
      if (!b || !current) return;
      closeFlyout();
      e.stopImmediatePropagation();
      e.preventDefault();
      haptic();
      if (colorPop && !colorPop.hidden) closeColorPop(); else openColorPop();
    }, true);
  }

  // ---------- フライアウトを閉じる共通操作 ----------
  var flyoutGlobalBound = false;
  function bindFlyoutGlobal() {
    if (flyoutGlobalBound) return;
    flyoutGlobalBound = true;
    // 外側タップ／クリックで閉じる（バッジとフライアウト自身は除く）
    document.addEventListener("pointerdown", function (e) {
      if (!flyout || !flyoutOpen) return;
      var t = e.target;
      if (t && t.closest && (t.closest("#qnAppFlyout") || t.closest("#qnAppBadge"))) return;
      closeFlyout();
    }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeFlyout();
    });
    window.addEventListener("resize", function () { if (flyoutOpen) positionFlyout(); });
    window.addEventListener("orientationchange", closeFlyout);
    // サイドバーの他の項目を押したら閉じる（PLAYERでパネルが切り替わるのと同じ感覚）
    iconBar.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("#qnAppBadge")) return;
      closeFlyout();
    });
    // アイコンバー（SPで横スクロール）が動いたら位置がずれるので閉じる
    iconBar.addEventListener("scroll", closeFlyout, { passive: true });
  }

  // ---------- 起動：player-ui-pc-v2.js の build() 完了を待つ ----------
  function init() {
    iconBar = $("pcV2IconBar");
    if (!iconBar || !$("pcV2IconBarBottom")) return false;
    initColorKeeper();
    buildBadge();
    renderAppItems();
    bindFlyoutGlobal();
    updateBadge();
    ensureHost();
    var layout = $("pcV2Layout");
    if (layout && window.ResizeObserver && !resizeObs) {
      resizeObs = new ResizeObserver(function () { if (current) layoutHost(); });
      resizeObs.observe(layout);
    }
    scheduleRestore();
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
      sidebar: def.sidebar || null, onSidebar: def.onSidebar,
      shortcuts: def.shortcuts || null, shortcutsNote: def.shortcutsNote || "",
      mount: def.mount, onShow: def.onShow, onHide: def.onHide
    };
    if (idx >= 0) apps[idx] = app; else apps.push(app);
    apps.sort(function (a, b) { return a.order - b.order; });
    renderAppItems();
  }

  // ---------- 共通：ショートカット表（Keyboard） ----------
  // 各アプリは「行のリスト」[{key, action}] と任意の注記文字列を渡すだけ。
  // 表の見た目（<kbd>枠・"+ / -" は記号扱い）は全アプリ共通。PL/YT/今後のTUNER・PITCHで共用する。
  var SHORTCUT_CONNECTORS = ["+", "/", "-"];
  function fillShortcutRows(tbody, list) {
    tbody.textContent = "";
    (list || []).forEach(function (row) {
      var tr = document.createElement("tr");
      var tdA = document.createElement("td");
      tdA.textContent = row.action;
      var tdK = document.createElement("td");
      String(row.key).split(" ").forEach(function (part, i) {
        if (i > 0) tdK.appendChild(document.createTextNode(" "));
        if (SHORTCUT_CONNECTORS.indexOf(part) >= 0) tdK.appendChild(document.createTextNode(part));
        else { var kbd = document.createElement("kbd"); kbd.textContent = part; tdK.appendChild(kbd); }
      });
      tr.appendChild(tdA); tr.appendChild(tdK);
      tbody.appendChild(tr);
    });
  }
  // hostEl の中身を「ショートカット表（＋注記）」に置き換える。
  // 2番目は「登録済みアプリのid（文字列）」か「行リスト」のどちらでもよい。
  function renderShortcuts(hostEl, listOrAppId, note) {
    if (!hostEl) return;
    var list = listOrAppId;
    if (typeof listOrAppId === "string") {
      list = null;
      for (var i = 0; i < apps.length; i++) {
        if (apps[i].id === listOrAppId) { list = apps[i].shortcuts; if (note == null) note = apps[i].shortcutsNote; }
      }
    }
    hostEl.textContent = "";
    var sec = document.createElement("div");
    sec.className = "qn-menu-section";
    var table = document.createElement("table");
    table.className = "qn-shortcut-table";
    table.innerHTML = "<thead><tr><th>Action</th><th>Key</th></tr></thead><tbody></tbody>";
    fillShortcutRows(table.tBodies[0], list);
    sec.appendChild(table);
    if (note) {
      var p = document.createElement("p");
      p.className = "qn-yt-kbd-note";
      p.textContent = note;
      sec.appendChild(p);
    }
    hostEl.appendChild(sec);
  }

  window.QNApps = {
    register: register,
    open: open,
    close: close,
    toast: toast,
    renderShortcuts: renderShortcuts,
    fillShortcutRows: fillShortcutRows,
    setSideActive: setSideActive,
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
