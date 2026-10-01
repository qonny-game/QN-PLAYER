// ============================================================
// qn-app-youtube.js  —  YOUTUBE アプリ（MOREのアプリ一覧の1つ）
//
// 元: 単体プロトタイプ「QNPLAYER YouTube Prototype」(app.js)。
//     QNPLAYER本体へ統合するにあたり、次の点だけ変えている。
//       - グローバルidをやめ、data-yt属性＋名前空間(qnYt*)にした
//         （本体の #loopToggleBtn 等とのid衝突を避けるため）
//       - YouTube IFrame API は、初めてこのアプリを開いた時に初めて読み込む
//       - 画面を開いている間だけ位置ポーリングを回す。閉じたら
//         pauseVideo()（公式メソッド）で止める（非表示のまま再生し続けない）
//       - 削除確認は confirm() ではなく、ボタンの「2度押し」方式にした
//       - 見た目は QNPLAYER の配色トークン(--accent-primary 等)に統一
//         （スタイルは CSS/style-apps.css の .qn-yt*）
//
// 【規約遵守ルール（最優先・破らない）】 詳細は md/YOUTUBE_APP.md
//   - 埋め込みは公式IFrame Player APIのみ。標準コントロールを表示したまま、
//     プレイヤーの上に何も重ねない・切り抜かない・隠さない。
//   - 自前UIはプレイヤーの外(下)に置く。再生/停止の自前ボタンは付けない。
//   - 呼ぶのは公式メソッドだけ: seekTo / getCurrentTime / getDuration /
//     loadVideoById / cueVideoById / pauseVideo など。
//   - 音声・映像には触れない（Web Audio接続・ダウンロード・キャッシュ禁止）。
//   - 保存は videoId / URL / 利用者が手入力したタイトル / マーカー(秒・ラベル)
//     のみ。YouTube由来のタイトル等は画面表示だけで保存しない。
//   - 広告を置くなら .qn-yt-ad-slot（プレイヤーから離れた位置）。今は広告コードなし。
// ============================================================
(function () {
  "use strict";

  var STORAGE_KEY = "qn_yt_items";
  var SEGS = 3; // シークバーの分割数(3行)

  var SVG_GRIP = '<svg viewBox="0 0 24 24"><path d="M9 4h2v2H9zm4 0h2v2h-2zM9 9h2v2H9zm4 0h2v2h-2zM9 14h2v2H9zm4 0h2v2h-2zM9 19h2v2H9zm4 0h2v2h-2z"/></svg>';
  var FLAG_KEY = "qn_yt_autonext", RATE_KEY = "qn_yt_rate";
  var FALLBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  var YT_ICON = '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.28 5 12 5 12 5s-6.28 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2C2 8.77 2 12 2 12s0 3.23.4 4.8a2.5 2.5 0 0 0 1.76 1.77C5.72 19 12 19 12 19s6.28 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77C22 15.23 22 12 22 12s0-3.23-.4-4.8zM10 15V9l5.2 3L10 15z"/>';

  // ---------- 状態 ----------
  var root = null;                 // このアプリの画面(view要素)
  var refs = {};                   // data-yt 属性 -> 要素
  var items = loadItems();
  // current: 今開いている動画。itemId が null なら未保存(マーカーはメモリ上のみ)
  var current = null;              // { videoId, url, itemId, markers, loopA, loopB, looping }
  var player = null, playerReady = false, apiRequested = false, apiReady = false;
  var pendingVideoId = null, pendingPlay = false;
  var duration = 0;
  var seeking = false;             // シークバー/マーカードラッグ中は表示更新を止める
  var pollTimer = null;
  var tracks = [], fills = [], heads = [], loopRanges = [], loopPres = [], loopJumpAt = 0;
  var titleFetchToken = 0;

  // ---------- ユーティリティ ----------
  function loadItems() {
    try {
      var a = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveItems() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { showMessage("保存に失敗しました(容量またはブラウザ設定を確認)"); }
  }
  function uid(p) { return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (m < 10 ? "0" : "") + m, ss = (s < 10 ? "0" : "") + s;
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }
  function showMessage(text, ok) {
    if (!refs.message) return;
    refs.message.textContent = text || "";
    refs.message.className = "qn-yt-message" + (ok ? " ok" : "");
  }
  function findItem(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function findItemByVideoId(vid) {
    for (var i = 0; i < items.length; i++) if (items[i].videoId === vid) return items[i];
    return null;
  }
  function findMarker(id) {
    if (!current || !id) return null;
    for (var i = 0; i < current.markers.length; i++) if (current.markers[i].id === id) return current.markers[i];
    return null;
  }

  // 対応: watch?v= / youtu.be/ / shorts/ / embed/
  function parseVideoId(input) {
    var s = (input || "").trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    var host = u.hostname.replace(/^www\.|^m\./, "");
    var id = null;
    if (host === "youtu.be") {
      id = u.pathname.split("/")[1];
    } else if (host === "youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        var m = u.pathname.match(/^\/(shorts|embed)\/([^/?#]+)/);
        if (m) id = m[2];
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  // ---------- シークバー下のコントロールバー（v3.2.0〜：PLAYER下段バーと同じデザイン） ----------
  // アイコン＋英字。  再生系 │ マーカー系 │ スピード
  // PC幅=ステージ(プレイヤー側)の下端に吸着（サイドバー/パネル側へは伸ばさない）。
  // SP幅=PLAYER同様、アイコンバーの直上に横スクロールで固定。
  var BI = {
    prevTrack: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',
    nextTrack: '<path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/>',
    back10: '<path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>',
    fwd10: '<path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
    repeat: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
    add: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
    loop: '<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>',
    setA: '<text x="12" y="18" text-anchor="middle" font-size="17" font-weight="700" font-family="Instrument Sans, sans-serif" fill="currentColor">A</text>',
    setB: '<text x="12" y="18" text-anchor="middle" font-size="17" font-weight="700" font-family="Instrument Sans, sans-serif" fill="currentColor">B</text>',
    clear: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
    preroll: '<path d="M3 6h3v12H3zm15 0h3v12h-3zM9 9l-3 3 3 3v-2h6v2l3-3-3-3v2H9z"/>',
    speed: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 12L15.5 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="1.4"/>'
  };
  function bbtn(ref, cls, icon, label, title) {
    return '<button type="button" data-yt="' + ref + '" class="qn-yt-bbtn' + (cls ? " " + cls : "") + '" title="' + title + '">' +
      '<svg viewBox="0 0 24 24">' + icon + '</svg><span>' + label + '</span></button>';
  }
  var BAR_HTML =
    '<div class="qn-yt-bar">' +
      '<div class="qn-yt-bgroup">' +
        bbtn("prevVideoBtn", "", BI.prevTrack, "Track", "Libraryの前の動画 (Shift+P)") +
        bbtn("skipBackBtn", "", BI.back10, "-10s", "10秒戻る (J)") +
        bbtn("playBtn", "center", BI.play, "Play", "再生 / 一時停止 (Space / K)") +
        bbtn("skipFwdBtn", "", BI.fwd10, "+10s", "10秒進む (L)") +
        bbtn("nextVideoBtn", "", BI.nextTrack, "Track", "Libraryの次の動画 (Shift+N)") +
        bbtn("autoNext", "", BI.repeat, "Auto Next", "終了したらLibraryの次の動画を読み込む（ON/OFF）") +
      '</div>' +
      '<div class="qn-yt-bdiv"></div>' +
      '<div class="qn-yt-bgroup">' +
        bbtn("prevMarkerBtn", "", BI.prevTrack, "Marker", "前のマーカーへ") +
        bbtn("addMarkerBtn", "center", BI.add, "Marker", "マーカーを追加") +
        bbtn("nextMarkerBtn", "", BI.nextTrack, "Marker", "次のマーカーへ") +
        bbtn("setABtn", "", BI.setA, "A --", "現在地をA点に設定（マーカーを作ります）") +
        bbtn("setBBtn", "", BI.setB, "B --", "現在地をB点に設定（マーカーを作ります）") +
        bbtn("loopToggleBtn", "", BI.loop, "Loop", "LOOP：OFF → A-B → 区間 → OFF") +
        '<div class="qn-yt-preroll" title="ループのプリロール/ポストロール秒数（区間の何秒前から・何秒後まで）">' +
          '<button type="button" data-yt="preDown" class="qn-yt-preroll-btn" title="Decrease">−</button>' +
          '<span class="qn-yt-preroll-value"><b data-yt="preVal">0</b><span class="qn-yt-preroll-unit">s</span></span>' +
          '<button type="button" data-yt="preUp" class="qn-yt-preroll-btn" title="Increase">＋</button>' +
        '</div>' +
        bbtn("loopClearBtn", "", BI.clear, "Clear AB", "AB点をクリア") +
      '</div>' +
      '<div class="qn-yt-bspacer"></div>' +
      '<div class="qn-yt-bgroup">' +
        '<div class="qn-yt-bstep" title="再生スピード (&lt; / &gt;)">' +
          '<button type="button" data-yt="speedDown" class="qn-yt-bstep-btn" title="Slower (&lt;)">−</button>' +
          '<div class="qn-yt-bstep-mid"><svg viewBox="0 0 24 24">' + BI.speed + '</svg><span><b data-yt="speedVal">1x</b> Speed</span></div>' +
          '<button type="button" data-yt="speedUp" class="qn-yt-bstep-btn" title="Faster (&gt;)">＋</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ---------- 画面の骨組み ----------
  var TEMPLATE =
    '<div class="qn-yt">' +
      '<aside class="qn-yt-panel">' +
        '<div class="qn-yt-panel-header"><span class="pcv2-panel-header-title" data-yt="panelTitle">Library</span></div>' +
        '<div class="qn-yt-panel-scroll">' +
          '<section class="qn-yt-sec qn-yt-sec-library">' +
            '<div class="qn-yt-sec-head"><h3>Library</h3><span class="qn-yt-count" data-yt="listCount">0</span></div>' +
            '<div class="qn-yt-input-block">' +
              '<div class="qn-yt-row">' +
                '<input data-yt="urlInput" class="qn-yt-input" type="text" placeholder="YouTube URL" autocomplete="off" spellcheck="false">' +
              '</div>' +
              '<div class="qn-yt-row">' +
                '<input data-yt="titleInput" class="qn-yt-input" type="text" placeholder="Title (type it yourself)" autocomplete="off">' +
                '<button type="button" data-yt="saveBtn" class="qn-yt-btn primary">Save</button>' +
              '</div>' +
              '<div class="qn-yt-message" data-yt="message" role="status"></div>' +
            '</div>' +
            '<div class="qn-yt-libbox" data-yt="itemList"></div>' +
            '<p class="qn-yt-empty" data-yt="emptyList">まだ保存されていません</p>' +
          '</section>' +
          '<section class="qn-yt-sec qn-yt-sec-markers">' +
            '<div class="qn-yt-sec-head"><h3>Markers</h3><span class="qn-yt-count" data-yt="markerCount">0</span></div>' +
            // YouTubeの説明欄からコピーしたチャプターを、利用者が貼り付けてマーカーにする
            // （YouTubeからは何も取得しない。入力されたテキストを解析するだけ）
            '<div class="qn-yt-chapter">' +
              '<button type="button" class="qn-yt-btn" data-yt="chapToggle">チャプターを貼り付け</button>' +
              '<div class="qn-yt-chapter-box" data-yt="chapBox" hidden>' +
                '<textarea class="qn-yt-input qn-yt-chapter-text" data-yt="chapText" rows="6" spellcheck="false" autocomplete="off" ' +
                  'placeholder="0:00 チャプタータイトル&#10;1:23 チャプタータイトル&#10;2:45 チャプタータイトル"></textarea>' +
                '<p class="qn-yt-hint">動画の説明欄のチャプターをコピーして貼り付けてください。「時間 タイトル」を1行ずつ読み取り、現在の動画のマーカーに追加します。</p>' +
                '<div class="qn-yt-row">' +
                  '<button type="button" class="qn-yt-btn primary" data-yt="chapAdd">マーカーに追加</button>' +
                  '<button type="button" class="qn-yt-btn" data-yt="chapClose">閉じる</button>' +
                '</div>' +
                '<div class="qn-yt-message" data-yt="chapMsg" role="status"></div>' +
              '</div>' +
            '</div>' +
            '<div class="qn-yt-pinbox" data-yt="markerList"></div>' +
            '<p class="qn-yt-empty" data-yt="emptyMarkers">マーカーはありません</p>' +
          '</section>' +
          // ---- Backup / Import（v3.17.0〜：本体(PLAYER)と共通の1画面を借りて表示する。
          //      実体は player-track-backup.js。setPanel()が qnBackupMountInto() で差し込む） ----
          '<section class="qn-yt-sec qn-yt-sec-backup"><div data-yt="bkHost"></div></section>' +
          '<section class="qn-yt-sec qn-yt-sec-import"><div data-yt="imHost"></div></section>' +
          // ---- Keyboard（YouTube本家と同じショートカットの一覧。中身は renderShortcuts() が入れる） ----
          '<section class="qn-yt-sec qn-yt-sec-keyboard">' +
            '<div class="qn-yt-kbd" data-yt="kbdBox"></div>' +
          '</section>' +
          '<footer class="qn-yt-legal">' +
            '<p>このアプリはYouTube API Servicesを利用しています。</p>' +
            '<p><a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube利用規約</a>' +
            ' ・ <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Googleプライバシーポリシー</a></p>' +
            '<p>Libraryやマーカーなどの保存データは、この端末のブラウザにだけ保存され、当サイトのサーバーへは送信されません。' +
            '動画の再生・サムネイル・タイトルの表示のため、YouTubeと通信します。</p>' +
          '</footer>' +
        '</div>' +
        // 本体(PLAYER)のLibrary/Markersと同じ、右下のフローティングボタン
        '<div class="qn-yt-fab" data-yt="fab">' +
          '<div class="qn-yt-fab-add">' +
            '<button type="button" class="panel-fab-btn panel-addfile-btn" data-yt="fabAdd" title="Add Marker">' +
              '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>ADD MARKER</span>' +
            '</button>' +
          '</div>' +
          '<button type="button" class="panel-fab-btn panel-fab-delete-btn" data-yt="fabDel" disabled>' +
            '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg><span>Delete</span>' +
          '</button>' +
          '<button type="button" class="panel-fab-btn panel-edit-btn" data-yt="fabEdit" title="Edit">' +
            '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><span data-yt="fabEditLabel">EDIT</span>' +
          '</button>' +
        '</div>' +
      '</aside>' +
      '<section class="qn-yt-stage">' +
        // プレイヤーは標準コントロールのまま表示。上には何も重ねない（規約）
        '<div class="qn-yt-player-wrap" data-qn-keep-visible><div id="qnYtPlayer"></div></div>' +
        // ここから下はプレイヤーの外(余白あり)
        '<div class="qn-yt-custom">' +
          '<p class="qn-yt-fetched-title" data-yt="fetchedTitle"></p>' +
          '<div class="qn-yt-seek" data-yt="seekTracks"><div class="qn-yt-marker-layer" data-yt="markerLayer"></div></div>' +
        '</div>' +
      '</section>' +
      BAR_HTML +
    '</div>';

  // ---------- サイドバー(Library / Markers)とパネル ----------
  // PC幅：パネルは常時表示で、アイコンは中身を切り替える。
  // SP幅：パネルは全面オーバーレイ。アイコンで開閉（同じアイコンをもう一度で閉じる）。
  var SIDEBAR = [
    { id: "library", label: "Library", icon: '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>' },
    { id: "markers", label: "Markers", icon: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>' },
    // 本体のBackup / Importと同じアイコン・同じ流れ
    { id: "backup", bottom: true, label: "Backup", icon: '<path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h5v2H8v-2z"/>' },
    { id: "import", bottom: true, label: "Import", icon: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>' },
    // 本体のKeyboardと同じアイコン。YouTube本家と同じショートカットの一覧（v3.1.0〜）
    { id: "keyboard", bottom: true, label: "Keyboard", icon: '<path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM11 8h2v2h-2V8zM11 11h2v2h-2v-2zM8 8h2v2H8V8zM8 11h2v2H8v-2zM5 8h2v2H5V8zm0 3h2v2H5v-2zm10 6H9v-2h6v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>' }
  ];
  var PANEL_TITLES = { library: "Library", markers: "Markers", backup: "Backup", import: "Import", keyboard: "Keyboard" };
  var panelState = null; // "library" | "markers" | "backup" | "import" | "keyboard" | "none"(SPのみ)

  function isSp() { return window.matchMedia("(max-width: 900px)").matches; }

  function setPanel(id) {
    if (!isSp() && id === "none") id = "library";
    panelState = id;
    if (!root) return;
    if (editMode && editMode !== id) { editMode = null; selected = {}; }
    var yt = root.querySelector(".qn-yt");
    yt.setAttribute("data-panel", id);
    updateFab();
    renderList();
    renderMarkers();
    // SP幅でパネルを開いても、プレイヤーは画面上部に小さく残る（覆わない）ので
    // 一時停止は不要（CSS側 .qn-yt:not([data-panel="none"]) 参照）。
    // Backup/Importは本体と共通の画面を借りて表示（それ以外のパネルでは借りを解除）
    if (id === "backup" || id === "import") {
      if (typeof window.qnBackupMountInto === "function") {
        window.qnBackupMountInto(id, id === "backup" ? refs.bkHost : refs.imHost, function () {
          setPanel(isSp() ? "none" : "library");
        });
      }
    } else if (typeof window.qnBackupReleaseExternal === "function") {
      window.qnBackupReleaseExternal();
    }
    if (id === "keyboard") renderShortcuts();
    updatePanelTitle();
    if (window.QNApps) window.QNApps.setSideActive((id === "none" || isCollapsed()) ? null : id);
  }

  // パネル見出し：本体のパネル同様「LIBRARY」「MARKERS」＋件数
  function updatePanelTitle() {
    if (!root || !panelState || panelState === "none") return;
    var t = PANEL_TITLES[panelState] || "";
    if (panelState === "markers") t += " " + (current ? current.markers.length : 0);
    else if (panelState === "library") t += " " + items.length;
    refs.panelTitle.textContent = t;
  }

  function pausePlayer() {
    try {
      if (player && playerReady && typeof player.pauseVideo === "function") player.pauseVideo();
    } catch (e) {}
  }

  function onSidebar(id) {
    if (isSp()) {
      if (panelState === id) setPanel("none"); else setPanel(id);
      return;
    }
    // PC幅（v3.4.0〜）：開いているパネルのアイコンをもう一度押すと、パネルを左へ格納。
    // 格納中にどのアイコンを押しても、パネルが開いてその内容を表示する。
    if (panelCollapsed) { setCollapsed(false); setPanel(id); return; }
    if (panelState === id) { setCollapsed(true); return; }
    setPanel(id);
  }

  // ---------- パネルの格納（PC幅のみ・v3.4.0〜） ----------
  // 格納するのはアイコンバーの右の「パネル(Library等)」。プレイヤーの大きさは変えない
  // （格納直前の幅のまま固定）。状態はlocalStorageに保存し、再読み込み後も維持する。
  var COLLAPSE_KEY = "qn_yt_panel_collapsed";
  var panelCollapsed = (function () {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch (e) { return false; }
  })();
  function isCollapsed() { return panelCollapsed && !isSp(); }

  // 格納中のプレイヤー幅＝「格納しなかった場合の幅」（パネル375px・ステージ余白24px×2・最大1280px）
  function applyCollapse() {
    if (!root) return;
    var yt = root.querySelector(".qn-yt");
    if (!yt) return;
    var on = isCollapsed();
    if (on) {
      var w = Math.min(1280, yt.clientWidth - 375 - 48);
      yt.style.setProperty("--qn-yt-player-w", Math.max(200, w) + "px");
    }
    yt.classList.toggle("qn-yt-collapsed", on);
    if (window.QNApps) window.QNApps.setSideActive((on || !panelState || panelState === "none") ? null : panelState);
  }

  function setCollapsed(on) {
    panelCollapsed = !!on;
    try { localStorage.setItem(COLLAPSE_KEY, panelCollapsed ? "1" : "0"); } catch (e) {}
    applyCollapse();
  }

  // SP幅で動画を選んだ/読み込んだ後は、パネルを閉じてプレイヤーを見せる
  function closePanelOnSp() { if (isSp()) setPanel("none"); }

  function mount(view) {
    root = view;
    root.innerHTML = TEMPLATE;
    var nodes = root.querySelectorAll("[data-yt]");
    for (var i = 0; i < nodes.length; i++) refs[nodes[i].getAttribute("data-yt")] = nodes[i];

    window.addEventListener("resize", applyCollapse);
    buildTracks();
    // 幅が変わったらマーカーの位置・高さを合わせ直す
    if (window.ResizeObserver) {
      var roRaf = 0;
      new ResizeObserver(function () {
        cancelAnimationFrame(roRaf);
        roRaf = requestAnimationFrame(function () { if (current) renderMarkers(); });
      }).observe(refs.seekTracks);
    }
    bindEvents();
    updateDisplay(0);
    renderList();
    renderMarkers();
  }

  // ---------- 3分割シークバーの土台 ----------
  // 全長を SEGS 等分し、1行目=前半…のように各行が全長の 1/SEGS を受け持つ。
  function buildTracks() {
    for (var i = 0; i < SEGS; i++) {
      var track = document.createElement("div");
      track.className = "qn-yt-track vbar"; // 本体のシークバー(.vbar)と同じ土台
      var fill = document.createElement("div"); fill.className = "qn-yt-fill vfill";
      var loop = document.createElement("div"); loop.className = "qn-yt-loop-range"; loop.hidden = true;
      var head = document.createElement("div"); head.className = "qn-yt-head"; head.style.display = "none";
      var preA = document.createElement("div"); preA.className = "qn-yt-loop-pre"; preA.hidden = true;
      var preB = document.createElement("div"); preB.className = "qn-yt-loop-pre"; preB.hidden = true;
      track.appendChild(fill); track.appendChild(preA); track.appendChild(preB); track.appendChild(loop); track.appendChild(head);
      loopPres.push([preA, preB]);
      refs.seekTracks.insertBefore(track, refs.markerLayer); // マーカーレイヤーは最前面
      tracks.push(track); fills.push(fill); loopRanges.push(loop); heads.push(head);
      attachTrackSeek(track);
    }
    heads[0].style.display = "";
  }

  function segIndex(t) {
    if (!duration) return 0;
    var i = Math.floor(t / (duration / SEGS));
    return Math.max(0, Math.min(SEGS - 1, i));
  }
  function segPct(i, t) {
    if (!duration) return 0;
    var len = duration / SEGS;
    return Math.min(100, Math.max(0, ((t - i * len) / len) * 100));
  }
  // ポインタ位置 → 時間。縦方向で一番近い行を選ぶので、行をまたいでドラッグできる
  function timeFromPoint(e) {
    var best = 0, bestD = Infinity, i, r, d;
    for (i = 0; i < SEGS; i++) {
      r = tracks[i].getBoundingClientRect();
      d = e.clientY < r.top ? r.top - e.clientY : (e.clientY > r.bottom ? e.clientY - r.bottom : 0);
      if (d < bestD) { bestD = d; best = i; }
    }
    r = tracks[best].getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return (best + ratio) * (duration / SEGS);
  }
  function positionMarker(el, t) {
    var i = segIndex(t);
    var pct = segPct(i, t);
    el.style.left = pct + "%";
    el.style.top = tracks[i].offsetTop + "px";
    el.style.height = tracks[i].offsetHeight + "px";
    // 右端近くのマーカーは、メモを線の左側に出す（本体の pcv2-label-flip と同じ）
    el.classList.toggle("flip", pct >= 80);
  }
  function markerLabelParts(m, idx) {
    return { num: String(idx + 1), memo: m.label || "" };
  }
  function fillMarkerLabel(el, m, idx) {
    var lab = el.querySelector(".qn-yt-marker-label");
    if (!lab) {
      lab = document.createElement("span");
      lab.className = "qn-yt-marker-label";
      lab.innerHTML = '<span class="n"></span><span class="memo"></span>';
      el.appendChild(lab);
    }
    var p = markerLabelParts(m, idx);
    lab.querySelector(".n").textContent = p.num;
    lab.querySelector(".memo").textContent = p.memo;
  }

  // ---------- YouTube IFrame API(公式の読み込み方法) ----------
  // 初めて動画を読み込む時にだけスクリプトを取得する（QNPLAYERを開いただけでは
  // YouTubeへ一切通信しない）。
  function requestApi() {
    if (apiRequested) return;
    apiRequested = true;
    if (window.YT && window.YT.Player) { apiReady = true; return; }
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") { try { prev(); } catch (e) {} }
      apiReady = true;
      if (pendingVideoId) {
        createPlayer(pendingVideoId, pendingPlay);
        pendingVideoId = null; pendingPlay = false;
      }
    };
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = function () { showMessage("YouTubeの読み込みに失敗しました(ネットワークを確認)"); apiRequested = false; };
    document.head.appendChild(tag);
  }

  // disablekb: 0(既定値)を明示。YouTube標準のキーボードショートカットは
  // プレイヤー自身が処理するので、こちらでは何もキー入力を奪わない。
  function createPlayer(videoId, shouldPlay) {
    player = new YT.Player("qnYtPlayer", {
      videoId: videoId,
      playerVars: { controls: 1, autoplay: 0, playsinline: 1, disablekb: 0 },
      events: {
        onReady: function () {
          playerReady = true;
          if (shouldPlay) player.playVideo(); // 利用者操作が起点なのでOK
          refreshDuration();
          applyDesiredRate();
          renderSpeed();
        },
        onStateChange: function (e) {
          refreshDuration();
          updatePlayBtn(!!(e && e.data === 1));
          // 再生中(=1)だけ画面スリープを防ぐ。一時停止/終了/バッファ等では解放
          try { if (window.QNWake) window.QNWake.set("youtube", !!(e && e.data === 1)); } catch (err) {}
          if (e && e.data === 1) { applyDesiredRate(); renderSpeed(); } // PLAYING
          if (e && e.data === 0) handleEnded();                          // ENDED
        },
        onPlaybackRateChange: function () { renderSpeed(); },
        onError: onPlayerError
      }
    });
  }

  function onPlayerError(e) {
    var c = e && e.data;
    if (c === 101 || c === 150) showMessage("この動画は埋め込み再生できません(投稿者が埋め込みを許可していません)");
    else if (c === 100) showMessage("動画が見つかりません(削除または非公開)");
    else if (c === 2) showMessage("動画IDが不正です");
    else showMessage("再生できませんでした(エラーコード: " + c + ")");
  }

  // ---------- タイトル表示(画面表示のみ。保存はしない) ----------
  function fetchTitleForDisplay(videoId, url) {
    var myToken = ++titleFetchToken;
    refs.fetchedTitle.textContent = "";
    var oembedUrl = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url);
    fetch(oembedUrl)
      .then(function (res) { if (!res.ok) throw new Error("oembed failed"); return res.json(); })
      .then(function (data) {
        if (myToken !== titleFetchToken) return;
        refs.fetchedTitle.textContent = data.title || "";
      })
      .catch(function () {
        if (myToken !== titleFetchToken) return;
        refs.fetchedTitle.textContent = "";
      });
  }

  function refreshDuration() {
    if (!player || !playerReady || typeof player.getDuration !== "function") return;
    var d = player.getDuration();
    if (d && d !== duration) {
      duration = d;
      if (refs.durTime) refs.durTime.textContent = fmt(d);
      renderMarkers();
      updateDisplay(currentPos());
    }
  }

  // 動画を読み込む。
  // play=false: cue(読み込みのみ。再生は利用者がYouTube標準コントロールで開始)
  // play=true : リストのクリック等、利用者の明確な選択操作が起点の場合のみ loadVideoById()。
  function openVideo(videoId, url, itemId, opts) {
    var shouldPlay = !!(opts && opts.play);
    var item = itemId ? findItem(itemId) : findItemByVideoId(videoId);
    current = {
      videoId: videoId,
      url: url,
      itemId: item ? item.id : null,
      markers: item ? item.markers : [],
      // v3.8.0〜：A/Bはマーカーではなく「秒」で持つ（使い捨ての区切り点。ドラッグで動かせる）。
      // 旧バージョンの保存値（マーカーID）は、そのマーカーの時刻に読み替える。
      loopA: item ? abTimeOf(item.loopA, item.markers) : null,
      loopB: item ? abTimeOf(item.loopB, item.markers) : null,
      looping: false, // 動画を開き直したら自動ではループしない
      loopMode: "off", // "off" | "ab"(A/Bループ) | "sec"(区間ループ)
      secRange: null
    };
    duration = 0;
    if (refs.durTime) refs.durTime.textContent = "00:00";
    updateDisplay(0);
    if (item) refs.titleInput.value = item.title;
    showMessage("");
    fetchTitleForDisplay(videoId, url);
    requestApi();
    if (player && playerReady) {
      if (shouldPlay) player.loadVideoById(videoId); else player.cueVideoById(videoId);
    } else if (!player) {
      pendingPlay = shouldPlay;
      if (apiReady) createPlayer(videoId, shouldPlay); else pendingVideoId = videoId;
    } else {
      // プレイヤー生成済みだがまだ ready 前
      var t = setInterval(function () {
        if (playerReady) {
          clearInterval(t);
          if (shouldPlay) player.loadVideoById(videoId); else player.cueVideoById(videoId);
        }
      }, 200);
    }
    renderMarkers();
    renderList();
  }

  // ---------- イベント ----------
  function bindEvents() {
    // Save = 読み込み＋保存。入力欄のURLが基準：
    //   ・Libraryに同じ動画(videoId)がある → その行のタイトルを更新（ライブラリから読み込んだ状態で名前を直す使い方）
    //   ・無い（新しいURL） → 新規追加
    function saveFromInputs() {
      var url = refs.urlInput.value.trim();
      var id = parseVideoId(url);
      if (!url) { showMessage("YouTubeのURLを入力してください"); return; }
      if (!id) { showMessage("YouTubeのURLとして認識できません"); return; }
      var title = refs.titleInput.value.trim() || "(無題)"; // タイトルは常に手入力
      var item = findItemByVideoId(id);
      var isNew = !item;
      if (item) {
        item.title = title;
        item.url = url;
      } else {
        item = {
          id: uid("item"), type: "youtube", videoId: id, url: url,
          title: title, markers: [], loopA: null, loopB: null,
          createdAt: Date.now()
        };
        items.push(item);
      }
      saveItems();
      if (current && current.videoId === id) {
        // すでに開いている動画：読み込み直さずに紐付けだけ更新
        current.itemId = item.id;
        current.url = url;
        if (isNew) item.markers = current.markers;
        renderList();
      } else {
        openVideo(id, url, item.id); // 読み込み(再生はしない)
      }
      // 保存したら入力欄は空に戻す（読み込んだ動画はそのまま）
      refs.urlInput.value = "";
      refs.titleInput.value = "";
      showMessage(isNew ? "リストに追加しました" : "タイトルを更新しました", true);
      closePanelOnSp();
    }
    refs.saveBtn.addEventListener("click", saveFromInputs);
    refs.urlInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); refs.titleInput.focus(); }
    });
    refs.titleInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); saveFromInputs(); }
    });

    function addMarkerHere() {
      if (!current || !playerReady) { showMessage("先に動画を読み込んでください"); return; }
      var t = Math.round(clampTime(currentPos()) * 10) / 10;
      current.markers.push({ id: uid("m"), time: t, label: "" });
      sortMarkers();
      persistMarkers();
      renderMarkers();
    }
    refs.addMarkerBtn.addEventListener("click", addMarkerHere);
    refs.fabAdd.addEventListener("click", function () {
      if (!current || !playerReady) { if (window.QNApps) window.QNApps.toast("先に動画を読み込んでください"); return; }
      addMarkerHere();
    });
    refs.chapToggle.addEventListener("click", function () {
      refs.chapBox.hidden = !refs.chapBox.hidden;
      if (!refs.chapBox.hidden) refs.chapText.focus();
    });
    refs.chapClose.addEventListener("click", function () { refs.chapBox.hidden = true; });
    refs.chapAdd.addEventListener("click", addChapters);
    refs.fabEdit.addEventListener("click", toggleEdit);
    refs.fabDel.addEventListener("click", deleteSelected);

    // ±10秒: seekTo() のみを使う自前UI(公式メソッドのみ・プレイヤーへの重ね合わせなし)
    refs.skipBackBtn.addEventListener("click", function () {
      if (!current || !playerReady) return;
      seekTo(currentPos() - 10);
    });
    refs.skipFwdBtn.addEventListener("click", function () {
      if (!current || !playerReady) return;
      seekTo(currentPos() + 10);
    });

    // 現在地でA点/B点（マーカーを作って設定）
    function setFromBar(kind) {
      if (!current || !playerReady) { showMessage("先に動画を読み込んでください"); return; }
      setLoopPointAt(kind, clampTime(currentPos()));
    }
    refs.setABtn.addEventListener("click", function () { setFromBar("A"); });
    refs.setBBtn.addEventListener("click", function () { setFromBar("B"); });
    refs.preDown.addEventListener("click", function () { setPreRoll(preRoll - PREROLL_STEP); });
    refs.preUp.addEventListener("click", function () { setPreRoll(preRoll + PREROLL_STEP); });
    renderPreRoll();

    // LOOPボタン：押すたびに OFF → A-Bループ → 区間ループ → OFF（A/B未設定の時は A-B を飛ばす）
    refs.loopToggleBtn.addEventListener("click", function () {
      if (!current || !duration) return;
      var m = current.loopMode || "off", next;
      if (m === "off") next = loopRangeTimes() ? "ab" : "sec";
      else if (m === "ab") next = "sec";
      else next = "off";
      if (next === "sec") {
        var r = sectionRangeAt(currentPos());
        if (!r) { next = "off"; ytToast("区間を決められません"); }
        else { current.secRange = r; }
      }
      setLoopMode(next);
      ytToast(next === "ab" ? "Loop: A-B" : next === "sec" ? "Loop: Section " + fmt(current.secRange.start) + " - " + fmt(current.secRange.end) : "Loop: OFF");
      updateLoopUI();
    });
    refs.playBtn.addEventListener("click", togglePlay);
    refs.prevVideoBtn.addEventListener("click", function () { gotoNeighbor(-1); });
    refs.nextVideoBtn.addEventListener("click", function () { gotoNeighbor(1); });
    updatePlayBtn(false);
    refs.prevMarkerBtn.addEventListener("click", function () { jumpMarker(-1); });
    refs.nextMarkerBtn.addEventListener("click", function () { jumpMarker(1); });
    syncAutoNextBtn();
    refs.autoNext.addEventListener("click", function () { setAutoNext(!autoNext); });
    refs.speedDown.addEventListener("click", function () { stepRate(-1, true); });
    // アイコン（中央）を押すと 1x に戻す
    var spMid = refs.speedVal && refs.speedVal.closest(".qn-yt-bstep-mid");
    if (spMid) {
      spMid.style.cursor = "pointer";
      spMid.title = "クリックで 1x に戻す";
      spMid.addEventListener("click", function () { resetRate(); });
    }
    refs.speedUp.addEventListener("click", function () { stepRate(1, true); });
    renderSpeed();

    refs.loopClearBtn.addEventListener("click", function () {
      if (!current) return;
      current.loopA = null; current.loopB = null; if (current.loopMode === "ab") setLoopMode("off");
      persistLoop();
      renderMarkers();
    });
  }

  // ---------- 前/次のマーカーへ移動（現在地を基準） ----------
  function jumpMarker(dir) {
    if (!current || !playerReady) { showMessage("先に動画を読み込んでください"); return; }
    var times = enabledTimes();
    if (!times.length) { showMessage("マーカーがありません"); return; }
    // PLAYERと同じ：区間ループ中のプリロール/ポストロール再生中は区間の内側にいるものとして扱い、
    // 次が無ければ最初へ、前が無ければ最後へ戻る。移動したら再生する。
    var t = currentPos(), idx = -1;
    if (current.loopMode === "sec" && current.secRange) idx = times.indexOf(current.secRange.start);
    var ref = QNMarkerCore.navRefTime(times, idx, t, preRoll, current.loopMode === "sec");
    var target = dir > 0 ? QNMarkerCore.nextTime(times, ref) : QNMarkerCore.prevTime(times, ref);
    showMessage("");
    userSeek(target);
  }

  // ---------- 再生スピード（プレイヤーの外の自前UI・公式メソッドのみ） ----------
  var desiredRate = loadRate();
  function loadRate() {
    try { var r = parseFloat(localStorage.getItem(RATE_KEY)); return r > 0 ? r : 1; } catch (e) { return 1; }
  }
  function availableRates() {
    try {
      if (player && playerReady && typeof player.getAvailablePlaybackRates === "function") {
        var a = player.getAvailablePlaybackRates();
        if (a && a.length) return a;
      }
    } catch (e) {}
    return FALLBACK_RATES;
  }
  function applyDesiredRate() {
    try {
      if (player && playerReady && typeof player.setPlaybackRate === "function" &&
          player.getPlaybackRate() !== desiredRate) {
        player.setPlaybackRate(desiredRate);
      }
    } catch (e) {}
  }
  function renderSpeed() {
    if (!root || !refs.speedVal) return;
    var actual = desiredRate;
    try { if (player && playerReady && player.getPlaybackRate) actual = player.getPlaybackRate(); } catch (e) {}
    refs.speedVal.textContent = actual + "x";
  }

  // ---------- 終了したら次のライブラリの動画へ（Auto Next） ----------
  // 規約：自動再生は「プレイヤーが画面に見えていて、その半分超が見えている」時だけ
  // 許される。画面外・別タブ・アプリ非表示の時は行わない。
  // 初期OFF、利用者がONにした時だけ動く。
  var autoNext = (function () {
    try { return localStorage.getItem(FLAG_KEY) === "1"; } catch (e) { return false; }
  })();

  function setAutoNext(on) {
    autoNext = !!on;
    try { localStorage.setItem(FLAG_KEY, autoNext ? "1" : "0"); } catch (e) {}
    syncAutoNextBtn();
  }
  function syncAutoNextBtn() {
    if (!refs.autoNext) return;
    refs.autoNext.classList.toggle("is-active", !!autoNext);
    refs.autoNext.setAttribute("aria-pressed", String(!!autoNext));
  }

  function playerMostlyVisible() {
    if (document.visibilityState !== "visible") return false;
    if (!root || root.hidden) return false;
    var wrap = root.querySelector(".qn-yt-player-wrap");
    var host = document.getElementById("qnAppHost");
    if (!wrap || !host || host.hidden) return false;
    var r = wrap.getBoundingClientRect(), h = host.getBoundingClientRect();
    var w = Math.min(r.right, h.right) - Math.max(r.left, h.left);
    var ht = Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top);
    if (w <= 0 || ht <= 0) return false;
    return (w * ht) / (r.width * r.height) > 0.5;
  }

  function handleEnded() {
    if (!autoNext || !current || !current.itemId) return;
    var idx = -1;
    for (var i = 0; i < items.length; i++) if (items[i].id === current.itemId) idx = i;
    if (idx < 0) return;
    var next = null;
    for (var j = idx + 1; j < items.length; j++) if (!items[j].skip) { next = items[j]; break; }
    if (!next) { showMessage("Libraryの最後の動画でした"); return; }
    if (!playerMostlyVisible()) return;
    refs.urlInput.value = next.url;
    openVideo(next.videoId, next.url, next.id, { play: true });
  }

  // ---------- 保存リスト ----------
  // タイトル編集は行の中でそのまま入力欄に切り替える。Enter/フォーカス外れ=確定、Esc=キャンセル。
  function startInlineEdit(it, titleSpan, editBtn) {
    var input = document.createElement("input");
    input.type = "text";
    input.className = "qn-yt-input qn-yt-title-edit";
    input.value = it.title;
    var done = false;

    function commit() {
      if (done) return; done = true;
      it.title = input.value.trim() || "(無題)";
      if (current && current.itemId === it.id) refs.titleInput.value = it.title;
      saveItems(); renderList();
    }
    function cancel() {
      if (done) return; done = true;
      renderList();
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", commit);

    titleSpan.replaceWith(input);
    editBtn.disabled = true;
    input.focus();
    input.select();
  }

  // 削除ボタンの2度押し確認（ダイアログを使わない）。1回目で「Sure?」に変わり、
  // 3秒以内にもう一度押すと実行。
  function armDelete(btn, run) {
    var armed = false, timer = null;
    btn.addEventListener("click", function () {
      if (!armed) {
        armed = true;
        btn.textContent = "Sure?";
        btn.classList.add("danger");
        timer = setTimeout(function () {
          armed = false; btn.textContent = "Del"; btn.classList.remove("danger");
        }, 3000);
        return;
      }
      clearTimeout(timer);
      run();
    });
  }

  // 並べ替え：つかみ部分をドラッグ。ドラッグ中は行をtransformで動かすだけで
  // DOMは動かさず（ポインターキャプチャを保つため）、離した時に配列を並べ替える。
  function attachReorder(grip, li) {
    var startY = 0, targetId = null, before = true;
    function clearMarks() {
      var m = refs.itemList.querySelectorAll(".drop-before,.drop-after");
      for (var i = 0; i < m.length; i++) m[i].classList.remove("drop-before", "drop-after");
    }
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      startY = e.clientY; targetId = null;
      li.classList.add("dragging");
    });
    grip.addEventListener("pointermove", function (e) {
      if (!grip.hasPointerCapture(e.pointerId)) return;
      li.style.transform = "translateY(" + (e.clientY - startY) + "px)";
      clearMarks();
      targetId = null;
      var rows = refs.itemList.children;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r === li) continue;
        var b = r.getBoundingClientRect();
        if (e.clientY >= b.top && e.clientY <= b.bottom) {
          targetId = r.dataset.id;
          before = e.clientY < b.top + b.height / 2;
          r.classList.add(before ? "drop-before" : "drop-after");
          break;
        }
      }
    });
    function finish(e, commit) {
      if (!grip.hasPointerCapture(e.pointerId)) return;
      grip.releasePointerCapture(e.pointerId);
      li.classList.remove("dragging"); li.style.transform = "";
      clearMarks();
      if (commit && targetId && targetId !== li.dataset.id) {
        var moving = findItem(li.dataset.id);
        items = items.filter(function (x) { return x !== moving; });
        var pos = 0;
        for (var i = 0; i < items.length; i++) if (items[i].id === targetId) pos = i;
        items.splice(before ? pos : pos + 1, 0, moving);
        saveItems();
      }
      renderList();
    }
    grip.addEventListener("pointerup", function (e) { finish(e, true); });
    grip.addEventListener("pointercancel", function (e) { finish(e, false); });
  }

  // ---------- EDITモード（本体のLibrary / Markersパネルと同じ操作） ----------
  // 右下のEDIT→OKで切り替え。編集中は「PLAY/SKIP」トグルと削除用の丸チェックが出て、
  // 選んだ行を右下のDeleteでまとめて削除する。
  var editMode = null;   // null | "library" | "markers"
  var selected = {};     // 削除用に選んだ行の id

  function selectedCount() {
    var n = 0;
    for (var k in selected) if (selected[k]) n++;
    return n;
  }
  function updateFab() {
    if (!root) return;
    var yt = root.querySelector(".qn-yt");
    if (editMode) yt.setAttribute("data-edit", editMode); else yt.removeAttribute("data-edit");
    refs.fabEdit.classList.toggle("active", !!editMode);
    refs.fabEditLabel.textContent = editMode ? "OK" : "EDIT";
    refs.fabDel.disabled = selectedCount() === 0;
  }
  function setEditMode(mode) {
    editMode = mode;
    selected = {};
    updateFab();
    renderList();
    renderMarkers();
  }
  function toggleEdit() {
    if (panelState !== "library" && panelState !== "markers") return;
    setEditMode(editMode === panelState ? null : panelState);
  }
  function toggleSelect(id, delBtn, container, toggleSel) {
    if (selected[id]) { delete selected[id]; delBtn.classList.remove("pcv2-selected"); }
    else { selected[id] = true; delBtn.classList.add("pcv2-selected"); }
    updateFab();
    // 選択中は「PLAY/SKIP」「表示/非表示」を押せなくする（本体と同じ仕様）
    var has = selectedCount() > 0;
    var ts = container.querySelectorAll(toggleSel);
    for (var i = 0; i < ts.length; i++) ts[i].disabled = has;
  }
  function deleteSelected() {
    var mode = editMode;
    if (!mode || !selectedCount()) return;
    refs.fabDel.disabled = true;
    var box = mode === "library" ? refs.itemList : refs.markerList;
    var rows = box.children, delay = 0;
    for (var i = 0; i < rows.length; i++) {
      if (selected[rows[i].dataset.id]) { rows[i].classList.add("pcv2-row-deleting"); delay = 260; }
    }
    box.style.pointerEvents = "none";
    setTimeout(function () {
      box.style.pointerEvents = "";
      if (mode === "library") {
        items = items.filter(function (x) { return !selected[x.id]; });
        if (current && current.itemId && selected[current.itemId]) current.itemId = null;
        saveItems();
      } else if (current) {
        current.markers = current.markers.filter(function (x) { return !selected[x.id]; });
        var it = current.itemId ? findItem(current.itemId) : null;
        if (it) it.markers = current.markers;
        persistMarkers(); persistLoop();
      }
      selected = {};
      updateFab();
      renderList();
      renderMarkers();
    }, delay);
  }

  function playItem(it) {
    refs.urlInput.value = it.url;
    openVideo(it.videoId, it.url, it.id, { play: true }); // クリック起点なので再生開始OK
    closePanelOnSp();
  }

  var SVG_PLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PENCIL = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

  function renderList() {
    if (!root) return;
    refs.itemList.textContent = "";
    refs.emptyList.style.display = items.length ? "none" : "";
    refs.listCount.textContent = String(items.length);
    updatePanelTitle();
    var edit = editMode === "library";
    // 存在しない行の選択は捨てる
    for (var k in selected) if (!findItem(k) && !(current && findMarker(k))) delete selected[k];
    var box = refs.itemList;

    items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "playlistItem";
      row.dataset.id = it.id;
      if (current && current.itemId === it.id) row.classList.add("playing");
      if (it.skip) row.classList.add("disabled");

      if (!edit) {
        row.addEventListener("click", function (e) {
          if (e.target.closest("button, input, .playlist-drag-handle, .playlist-info-block")) return;
          playItem(it);
        });
      }

      var grip = document.createElement("span");
      grip.className = "playlist-drag-handle"; grip.title = "ドラッグで並べ替え"; grip.innerHTML = SVG_GRIP;
      attachReorder(grip, row);
      row.appendChild(grip);

      // サムネイルは「表示のみ」：YouTubeの画像URLを<img>で直接参照する。
      // 保存(localStorage/キャッシュ化)・切り抜き・加工はしない（規約）。読み込めない時は再生アイコン。
      var thumb = document.createElement("div");
      thumb.className = "playlist-thumb qn-yt-thumb";
      thumb.innerHTML = SVG_PLAY_ICON;
      if (/^[A-Za-z0-9_-]{11}$/.test(it.videoId)) {
        var img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.onload = function () { thumb.classList.add("has-img"); };
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
        img.src = "https://i.ytimg.com/vi/" + it.videoId + "/mqdefault.jpg";
        thumb.appendChild(img); // 読み込めるまでは再生アイコンのまま（画像は透明）
      }
      row.appendChild(thumb);

      var info = document.createElement("div");
      info.className = "playlist-info-block";
      info.addEventListener("click", function (e) {
        if (e.target.closest(".playlist-editable-input, .playlist-hover-edit-btn")) return;
        playItem(it);
      });
      var titleRow = document.createElement("div");
      titleRow.className = "playlist-title-row";
      var titleField = makeEditableText(it.title, "playlist-title", "", function (v) {
        if (!v) { renderList(); return; }            // 空にはしない(元のタイトルに戻す)
        it.title = v;
        if (current && current.itemId === it.id) refs.titleInput.value = v;
        saveItems();
        updatePanelTitle();
      });
      titleRow.appendChild(titleField);
      if (!edit) {
        var pen = document.createElement("button");
        pen.type = "button"; pen.className = "playlist-hover-edit-btn"; pen.title = "Edit title";
        pen.innerHTML = SVG_PENCIL;
        pen.addEventListener("click", function (e) { e.stopPropagation(); titleField.startEdit(); });
        titleRow.appendChild(pen);
      }
      info.appendChild(titleRow);
      row.appendChild(info);

      if (edit) {
        var hasSel = selectedCount() > 0;
        var skip = document.createElement("button");
        skip.type = "button";
        skip.className = "playlist-skip-toggle" + (it.skip ? "" : " skip-off");
        skip.disabled = hasSel;
        skip.title = it.skip ? "Skipped during Auto Next (click to include)" : "Included in Auto Next (click to skip)";
        skip.innerHTML = '<span class="playlist-skip-toggle-label">' + (it.skip ? "SKIP" : "PLAY") + '</span>';
        skip.addEventListener("click", function (e) {
          e.stopPropagation();
          if (selectedCount() > 0) return;
          it.skip = !it.skip;
          if (!it.skip) delete it.skip;
          saveItems(); renderList();
        });
        row.appendChild(skip);

        var zone = document.createElement("div");
        zone.className = "playlist-del-zone";
        var del = document.createElement("button");
        del.type = "button"; del.className = "del-btn"; del.tabIndex = -1; del.textContent = "✕";
        if (selected[it.id]) del.classList.add("pcv2-selected");
        zone.appendChild(del);
        zone.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleSelect(it.id, del, box, ".playlist-skip-toggle");
        });
        row.appendChild(zone);
      }
      // 編集中は全行のタイトルを最初から入力欄にする（未接続の間に切り替えるのでフォーカスは奪わない）
      if (edit) titleField.startEdit();
      box.appendChild(row);
    });
  }

  // ---------- マーカー ----------
  function persistMarkers() {
    if (current && current.itemId) saveItems(); // markers は item と同じ配列参照
  }
  // 保存されたA/B値 → 秒。数値ならそのまま、旧形式(マーカーID文字列)ならそのマーカーの時刻。
  function abTimeOf(v, markers) {
    if (typeof v === "number" && isFinite(v) && v >= 0) return v;
    if (typeof v === "string" && markers) {
      for (var i = 0; i < markers.length; i++) if (markers[i].id === v) return markers[i].time;
    }
    return null;
  }
  function persistLoop() {
    if (!current) return;
    var item = current.itemId ? findItem(current.itemId) : null;
    if (item) { item.loopA = current.loopA; item.loopB = current.loopB; saveItems(); }
  }
  function sortMarkers() {
    current.markers.sort(function (a, b) { return a.time - b.time; });
  }
  function clampTime(t) {
    if (t < 0) t = 0;
    if (duration && t > duration) t = duration;
    return t;
  }
  function currentPos() {
    return player && playerReady && player.getCurrentTime ? player.getCurrentTime() : 0;
  }
  // 利用者のクリック/タップによるシーク（PLAYERと同じ）：シークして再生。A-Bループ中にA〜Bの外へ出したらLOOPをOFFにする（A/B点は残る）
  function userSeek(t) {
    if (current && current.loopMode === "ab" && QNMarkerCore.isOutsideAB(current.loopA, current.loopB, t)) {
      setLoopMode("off"); persistLoop(); updateLoopUI();
    }
    seekTo(t);
    try { if (player && playerReady && player.playVideo) player.playVideo(); } catch (e) {} // 利用者操作が起点なのでOK
  }
  function seekTo(t) {
    if (!player || !playerReady) return;
    player.seekTo(clampTime(t), true);
    updateDisplay(clampTime(t));
  }

  function markerColorHex(m) {
    return m.color && typeof MARKER_COLOR_PALETTE !== "undefined" && MARKER_COLOR_PALETTE[m.color] ? MARKER_COLOR_PALETTE[m.color] : null;
  }
  function markerText(m, i) {
    return (i + 1) + " - " + (m.label ? m.label : fmt(m.time));
  }

  // メモ編集（本体のマーカーメモと同じ：鉛筆→入力欄＋プリセット。プリセットを選ぶと色も自動で付く）
  function startMemoEdit(m, infoSpan, i) {
    if (infoSpan.parentNode.querySelector(".pin-memo-input")) return;
    var input = document.createElement("input");
    input.type = "text"; input.className = "pin-memo-input";
    input.value = m.label || ""; input.placeholder = fmt(m.time); input.maxLength = 60;
    infoSpan.style.display = "none";
    infoSpan.parentNode.insertBefore(input, infoSpan);
    input.focus(); input.select();

    var popup = document.createElement("div");
    popup.className = "pin-memo-preset-popup";
    var hasPresets = typeof getAllMarkerPresetLabels === "function" && typeof getMarkerPresetColors === "function";
    var presetColors = hasPresets ? getMarkerPresetColors() : {};
    var pointerActive = false, finished = false;

    function closePop() { if (typeof closePinMemoPresetPopup === "function") closePinMemoPresetPopup(); }
    function commit() {
      if (finished) return; finished = true; closePop();
      m.label = input.value.trim();
      persistMarkers(); renderMarkers();
    }
    function cancel() { if (finished) return; finished = true; closePop(); renderMarkers(); }
    function applyPreset(label) {
      if (finished) return; finished = true; closePop();
      m.label = label;
      var c = presetColors[label];
      if (c && MARKER_COLOR_PALETTE[c]) m.color = c;
      persistMarkers(); renderMarkers();
    }

    if (hasPresets) {
      getAllMarkerPresetLabels().forEach(function (label) {
        var chip = document.createElement("button");
        chip.type = "button"; chip.className = "pin-memo-preset-chip";
        var c = presetColors[label];
        if (c && MARKER_COLOR_PALETTE[c]) {
          var dot = document.createElement("span");
          dot.className = "pin-memo-preset-dot"; dot.style.background = MARKER_COLOR_PALETTE[c];
          chip.appendChild(dot);
        }
        chip.appendChild(document.createTextNode(label));
        chip.addEventListener("pointerdown", function (e) {
          e.preventDefault(); pointerActive = true;
          window.addEventListener("pointerup", function () {
            setTimeout(function () {
              if (!pointerActive) return;
              pointerActive = false;
              if (!finished && document.activeElement !== input) commit();
            }, 80);
          }, { once: true });
        });
        chip.addEventListener("click", function (e) { e.stopPropagation(); pointerActive = false; applyPreset(label); });
        popup.appendChild(chip);
      });
      popup.addEventListener("click", function (e) { e.stopPropagation(); });

      var reposition = function () {
        if (!input.isConnected) { closePop(); return; }
        var r = input.getBoundingClientRect(), pr = popup.getBoundingClientRect();
        var top = r.bottom + 6;
        if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
        var left = r.left;
        if (left + pr.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pr.width - 8);
        popup.style.top = top + "px"; popup.style.left = left + "px";
      };
      closePop();
      document.body.appendChild(popup);
      window.activePinMemoPresetPopup = { popup: popup, reposition: reposition };
      reposition();
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () { if (!pointerActive) commit(); }, 0);
    });
    input.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  var SVG_EYE_ON = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
  var SVG_EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M12 6.5c3.79 0 7.17 2.13 8.82 5.5-.59 1.2-1.42 2.25-2.42 3.11l1.42 1.42c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.61 17 4.5 12 4.5c-1.27 0-2.49.2-3.64.57l1.65 1.65c.62-.14 1.28-.22 1.99-.22zM2.71 3.16L1.29 4.57 4 7.27C2.36 8.53 1.07 10.15 0.18 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l3.01 3.01 1.41-1.41L2.71 3.16zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57 0 1.66 1.34 3 3 3 .2 0 .38-.03.57-.07l1.57 1.57c-.65.32-1.37.5-2.14.5zm2.97-5.33c-.15-1.4-1.25-2.49-2.64-2.64l2.64 2.64z"/></svg>';

  // マーカー区間(そのマーカー〜次の表示中マーカー、最後は動画の終わりまで)を、マーカーの色でシークバーに塗る
  function paintMarkerRanges(ms) {
    var old = refs.seekTracks.querySelectorAll(".qn-yt-range");
    setTimeout(function () { paintPlayed(lastT); }, 0);
    for (var k = 0; k < old.length; k++) old[k].parentNode.removeChild(old[k]);
    if (!duration) return;
    var vis = ms.filter(function (m) { return m.enabled !== false; });
    var len = duration / SEGS;
    vis.forEach(function (m, idx) {
      var hex = markerColorHex(m);
      if (!hex) return;
      var start = m.time, end = idx + 1 < vis.length ? vis[idx + 1].time : duration;
      if (!(end > start)) return;
      for (var i = segIndex(start); i < SEGS; i++) {
        var a = Math.max(start, i * len), z = Math.min(end, (i + 1) * len);
        if (z <= a) { if (i * len >= end) break; continue; }
        var band = document.createElement("div");
        band.className = "qn-yt-range";
        band.style.left = ((a - i * len) / len * 100) + "%";
        band.style.width = ((z - a) / len * 100) + "%";
        var bg = document.createElement("div"); bg.className = "qn-yt-range-bg"; bg.style.background = hex;
        var on = document.createElement("div"); on.className = "qn-yt-range-on"; on.style.background = hex;
        band.appendChild(bg); band.appendChild(on);
        band._a = a; band._z = z;
        tracks[i].insertBefore(band, loopRanges[i]);
      }
    });
  }

  // 再生済みの部分だけ、区間の色を濃く(選んだカラーで進む)
  var lastT = 0;
  function paintPlayed(t) {
    lastT = t;
    if (!root) return;
    var bands = refs.seekTracks.querySelectorAll(".qn-yt-range");
    for (var k = 0; k < bands.length; k++) {
      var b = bands[k], r = (t - b._a) / (b._z - b._a);
      b.lastChild.style.width = (Math.max(0, Math.min(1, r)) * 100) + "%";
    }
  }

  function renderMarkers() {
    if (!root) return;
    if (typeof closePinMemoPresetPopup === "function") closePinMemoPresetPopup();
    refs.markerLayer.textContent = "";
    refs.markerList.textContent = "";
    var ms = current ? current.markers : [];
    refs.emptyMarkers.style.display = ms.length ? "none" : "";
    refs.markerCount.textContent = String(ms.length);
    updatePanelTitle();
    var edit = editMode === "markers";
    var box = refs.markerList;
    paintMarkerRanges(ms);

    ms.forEach(function (m, i) {
      var hex = markerColorHex(m);
      // シークバー上のマーカー(クリックでジャンプ / ドラッグで移動)。非表示にしたものは出さない
      var el = document.createElement("div");
      if (m.enabled !== false) {
        el.className = "qn-yt-marker";
        el.dataset.mid = m.id;
        el.title = fmt(m.time) + " " + (m.label || "");
        if (hex) el.style.setProperty("--marker-color", hex);
        fillMarkerLabel(el, m, i);
        positionMarker(el, m.time);
        attachMarkerDrag(el, m);
        refs.markerLayer.appendChild(el);
      }

      // 一覧(本体のMarkersパネルと同じ行)
      var row = document.createElement("div");
      row.className = "pinItem" + (m.enabled === false ? " disabled" : "");
      row.dataset.id = m.id;

      var lead = document.createElement("div");
      lead.className = "pin-leading-cell";
      var cm = document.createElement("button");
      cm.type = "button"; cm.className = "pin-color-mark"; cm.title = "Set marker color";
      cm.style.background = hex || "#3a3a48";
      cm.addEventListener("click", function (e) {
        e.stopPropagation();
        if (typeof openColorChoicePopup !== "function") return;
        openColorChoicePopup(cm, m.color || null, function (name) {
          if (name) m.color = name; else delete m.color;
          persistMarkers(); renderMarkers();
        });
      });
      lead.appendChild(cm);
      row.appendChild(lead);

      var labelRow = document.createElement("div");
      labelRow.className = "pin-label-row";
      var infoSpan = document.createElement("span");
      infoSpan.className = "pin-info";
      infoSpan.textContent = markerText(m, i);
      if (m.label) infoSpan.title = m.label;
      infoSpan.addEventListener("click", function () { userSeek(m.time); });
      labelRow.appendChild(infoSpan);
      var pen = document.createElement("button");
      pen.type = "button"; pen.className = "pin-edit-btn"; pen.title = "Edit memo";
      pen.innerHTML = SVG_PENCIL;
      pen.addEventListener("click", function (e) { e.stopPropagation(); startMemoEdit(m, infoSpan, i); });
      labelRow.appendChild(pen);
      row.appendChild(labelRow);

      // ABループの指定（YouTube側独自の機能。編集モード中は隠す）
      var ab = document.createElement("div");
      ab.className = "qn-yt-ab-cell";
      var abtnA = document.createElement("button");
      abtnA.type = "button";
      abtnA.className = "qn-yt-btn mini ab" + (current.loopA === m.time ? " active-a" : "");
      abtnA.textContent = "A"; abtnA.title = "このマーカーの位置をA点(ループ開始)に（A/Bはマーカーとは別の点）";
      abtnA.addEventListener("click", function (e) { e.stopPropagation(); toggleLoopPoint("A", m.id); });
      var abtnB = document.createElement("button");
      abtnB.type = "button";
      abtnB.className = "qn-yt-btn mini ab" + (current.loopB === m.time ? " active-b" : "");
      abtnB.textContent = "B"; abtnB.title = "このマーカーの位置をB点(ループ終了)に（A/Bはマーカーとは別の点）";
      abtnB.addEventListener("click", function (e) { e.stopPropagation(); toggleLoopPoint("B", m.id); });
      ab.appendChild(abtnA); ab.appendChild(abtnB);
      row.appendChild(ab);

      var tg = document.createElement("button");
      tg.type = "button"; tg.className = "toggle-btn";
      tg.title = m.enabled === false ? "Marker disabled (click to enable)" : "Marker enabled (click to disable)";
      tg.innerHTML = m.enabled === false ? SVG_EYE_OFF : SVG_EYE_ON;
      tg.disabled = edit && selectedCount() > 0;
      tg.addEventListener("click", function (e) {
        e.stopPropagation();
        if (selectedCount() > 0) return;
        if (m.enabled === false) delete m.enabled; else m.enabled = false;
        persistMarkers(); renderMarkers();
      });
      row.appendChild(tg);

      if (edit) {
        var zone = document.createElement("div");
        zone.className = "pin-del-zone";
        var del = document.createElement("button");
        del.type = "button"; del.className = "del-btn"; del.tabIndex = -1; del.textContent = "✕";
        if (selected[m.id]) del.classList.add("pcv2-selected");
        zone.appendChild(del);
        zone.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleSelect(m.id, del, box, ".toggle-btn");
        });
        row.appendChild(zone);
      }
      box.appendChild(row);
    });

    // A点・B点（マーカーではない使い捨ての区切り点。ドラッグで動かせる）
    [["A", current ? current.loopA : null], ["B", current ? current.loopB : null]].forEach(function (pt) {
      if (pt[1] === null || pt[1] === undefined || !duration) return;
      var a = document.createElement("div");
      a.className = "qn-yt-marker qn-yt-abpt is-" + pt[0].toLowerCase();
      a.title = pt[0] + " " + fmt(pt[1]);
      var tag = document.createElement("span");
      tag.className = "qn-yt-marker-ab";
      tag.textContent = pt[0];
      a.appendChild(tag);
      positionMarker(a, pt[1]);
      attachABDrag(a, pt[0]);
      refs.markerLayer.appendChild(a);
    });

    updateLoopUI();
  }

  // ---------- チャプターの貼り付け ----------
  // 「0:00 タイトル」「1:02:03 - タイトル」「[2:45] タイトル」などを1行ずつ読み取る。
  function parseChapters(text) {
    var out = [];
    String(text || "").normalize("NFKC").split(/\r?\n/).forEach(function (line) {
      var m = line.match(/^\s*(?:[-*・•▶►]\s*)?[\[(（]?\s*((?:\d{1,2}:)?\d{1,3}:\d{2})(?:\.\d+)?\s*[\])）]?\s*[-–—―:：|｜]?\s*(.*?)\s*$/);
      if (!m) return;
      var parts = m[1].split(":").map(Number), sec;
      if (parts.length === 3) {
        if (parts[1] >= 60 || parts[2] >= 60) return;
        sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else {
        if (parts[1] >= 60) return;
        sec = parts[0] * 60 + parts[1];
      }
      out.push({ time: sec, label: m[2].slice(0, 60) });
    });
    return out;
  }

  function addChapters() {
    var msg = refs.chapMsg;
    function say(t, ok) { msg.textContent = t; msg.className = "qn-yt-message" + (ok ? " ok" : ""); }
    if (!current) { say("先に動画を読み込んでください"); return; }
    var list = parseChapters(refs.chapText.value);
    if (!list.length) { say("「時間 タイトル」の行が見つかりません（例: 1:23 Aメロ）"); return; }
    var presetColors = (typeof getMarkerPresetColors === "function") ? getMarkerPresetColors() : {};
    var added = 0, skipped = 0;
    list.forEach(function (c) {
      var t = Math.round(c.time * 10) / 10;
      var over = duration && t > duration + 0.5;
      var dup = current.markers.some(function (x) { return Math.abs(x.time - t) < 0.05; });
      if (over || dup) { skipped++; return; }
      var mk = { id: uid("m"), time: t, label: c.label };
      // 本体と同じく、プリセット名と一致したメモには自動で色を付ける
      for (var name in presetColors) {
        if (name.toLowerCase() === c.label.toLowerCase() && presetColors[name] &&
            typeof MARKER_COLOR_PALETTE !== "undefined" && MARKER_COLOR_PALETTE[presetColors[name]]) {
          mk.color = presetColors[name]; break;
        }
      }
      current.markers.push(mk);
      added++;
    });
    sortMarkers();
    persistMarkers();
    renderMarkers();
    say(added + "件追加しました" + (skipped ? "（" + skipped + "件は重複/範囲外のためスキップ）" : ""), added > 0);
    if (added > 0) refs.chapText.value = "";
  }

  // ---------- ABループ ----------
  // マーカー2つをA点(開始)・B点(終了)に指定し、再生中にB点へ達したらA点へseekTo()で戻す。
  // Markersパネルの行のA/Bボタン：そのマーカーの「位置」をA点/B点にする（点はマーカーとは別。もう一度押すと解除）
  function toggleLoopPoint(which, markerId) {
    if (!current) return;
    var m = findMarker(markerId);
    if (!m) return;
    var key = which === "A" ? "loopA" : "loopB";
    current[key] = (current[key] === m.time) ? null : m.time;
    if (current.loopA === null || current.loopB === null) { if (current.loopMode === "ab") setLoopMode("off"); }
    persistLoop();
    renderMarkers();
  }

  // ---------- プリロール/ポストロール（PLAYER本体と同じ：前後共通の秒数） ----------
  // ループの折り返しで、区間の開始の何秒前へ戻るか／終わりの何秒後まで再生してから戻るか。
  var PREROLL_KEY = "qn_yt_preroll", PREROLL_MAX = 5, PREROLL_STEP = 1;
  var preRoll = (function () {
    try { var v = parseInt(localStorage.getItem(PREROLL_KEY), 10); return v >= 0 && v <= PREROLL_MAX ? v : 0; } catch (e) { return 0; }
  })();
  function setPreRoll(v) {
    preRoll = Math.max(0, Math.min(PREROLL_MAX, v));
    try { localStorage.setItem(PREROLL_KEY, String(preRoll)); } catch (e) {}
    renderPreRoll();
    updateLoopUI();
  }
  function renderPreRoll() {
    if (refs.preVal) refs.preVal.textContent = String(preRoll);
  }

  function setBtnLabel(btn, text) {
    var sp = btn && btn.querySelector("span");
    if (sp) sp.textContent = text;
  }

  function setLoopMode(m) {
    if (!current) return;
    current.loopMode = m;
    current.looping = (m !== "off");
    if (m !== "sec") current.secRange = null;
  }

  // 区間ループの区間：現在地を含む「表示ONのマーカー〜次の表示ONのマーカー」。PLAYERと同じルール（JS/qn-marker-core.js）。
  // マーカーが2つ未満なら区間は決まらない（null）。最初のマーカーより前は最初の区間、最後より後は最後の区間。
  function enabledTimes() {
    return (current ? current.markers : []).filter(function (x) { return x.enabled !== false; })
      .map(function (x) { return x.time; }).sort(function (p, q) { return p - q; });
  }
  function sectionRangeAt(t) {
    if (!current || !duration) return null;
    var times = enabledTimes(), i = QNMarkerCore.pickSectionIndex(times, t);
    return i < 0 ? null : { start: times[i], end: times[i + 1] };
  }

  // いまループ中の区間（ループOFFなら、ABが揃っていればその区間を表示用に返す）
  function activeLoopRange() {
    if (current && current.loopMode === "sec" && current.secRange) return current.secRange;
    return loopRangeTimes();
  }

  function loopRangeTimes() {
    if (!current || current.loopA === null || current.loopB === null) return null;
    var a = current.loopA, b = current.loopB;
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }

  function updateLoopUI() {
    if (!current) return;
    var ha = current.loopA !== null, hb = current.loopB !== null;
    setBtnLabel(refs.setABtn, "A " + (ha ? fmt(current.loopA) : "--"));
    setBtnLabel(refs.setBBtn, "B " + (hb ? fmt(current.loopB) : "--"));
    refs.setABtn.classList.toggle("has-point", ha);
    refs.setBBtn.classList.toggle("has-point", hb);

    var range = activeLoopRange();
    var lm = current.loopMode || "off";
    refs.loopToggleBtn.disabled = !duration;
    refs.loopToggleBtn.classList.toggle("is-active", lm !== "off");
    refs.loopToggleBtn.setAttribute("aria-pressed", String(lm !== "off"));
    var lbl = refs.loopToggleBtn.querySelector("span");
    if (lbl) lbl.textContent = lm === "ab" ? "A-B Loop" : lm === "sec" ? "Section" : "Loop";

    // ループ区間を、各行との重なり部分だけ表示
    var len = duration ? duration / SEGS : 0;
    for (var i = 0; i < SEGS; i++) {
      var shown = false;
      if (range && duration) {
        var a = Math.max(range.start, i * len), b = Math.min(range.end, (i + 1) * len);
        if (b > a) {
          loopRanges[i].hidden = false;
          loopRanges[i].classList.toggle("is-on", lm !== "off");
          loopRanges[i].style.left = segPct(i, a) + "%";
          loopRanges[i].style.width = Math.max(0, segPct(i, b) - segPct(i, a)) + "%";
          shown = true;
        }
      }
      if (!shown) loopRanges[i].hidden = true;
      // プリロール/ポストロール範囲（PLAYERのsegmentHighlight-prerollと同じ：本編の前後に薄い破線帯）
      var pr = [null, null];
      if (range && duration && lm !== "off" && preRoll > 0) {
        pr[0] = [Math.max(0, range.start - preRoll), range.start];
        pr[1] = [range.end, Math.min(duration, range.end + preRoll)];
      }
      for (var k = 0; k < 2; k++) {
        var pe = loopPres[i][k], seg = pr[k], on = false;
        if (seg) {
          var pa = Math.max(seg[0], i * len), pb = Math.min(seg[1], (i + 1) * len);
          if (pb > pa) {
            pe.hidden = false;
            pe.style.left = segPct(i, pa) + "%";
            pe.style.width = Math.max(0, segPct(i, pb) - segPct(i, pa)) + "%";
            on = true;
          }
        }
        if (!on) pe.hidden = true;
      }
    }
  }

  // マーカーのドラッグ移動(動かさずに離したらクリック扱いでジャンプ)。行をまたいで動かせる。
  function attachMarkerDrag(el, m) {
    var moved = false, startX = 0, startY = 0;
    el.addEventListener("pointerdown", function (e) {
      if (!duration) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      seeking = true; moved = false; startX = e.clientX; startY = e.clientY;
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", function (e) {
      if (!seeking || !el.hasPointerCapture(e.pointerId)) return;
      if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
      if (!moved) return;
      var t = Math.round(timeFromPoint(e) * 10) / 10;
      m.time = t;
      positionMarker(el, t);
      el.title = fmt(t) + " " + (m.label || "");
    });
    el.addEventListener("pointerup", function (e) {
      if (!el.hasPointerCapture(e.pointerId)) return;
      el.releasePointerCapture(e.pointerId);
      seeking = false;
      el.classList.remove("dragging");
      if (moved) { sortMarkers(); persistMarkers(); renderMarkers(); }
      else {
        userSeek(m.time);
        // 既存マーカーを1クリック/1タップ → その位置でA / B のポップアップ（＋Markerは出さない）
        var er = el.getBoundingClientRect();
        showSeekPop(m.time, tracks[segIndex(m.time)].getBoundingClientRect(), er.left + er.width / 2, m);
      }
    });
  }

  // A点/B点（マーカーではない点）のドラッグ。マーカーのドラッグと同じ操作感。
  // 動かさずに離した時は、その位置へシークし、「－ Point」（その点の削除）だけのポップアップを出す。
  function attachABDrag(el, kind) {
    var key = kind === "A" ? "loopA" : "loopB";
    var moved = false, startX = 0, startY = 0;
    el.addEventListener("pointerdown", function (e) {
      if (!duration) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      seeking = true; moved = false; startX = e.clientX; startY = e.clientY;
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", function (e) {
      if (!seeking || !el.hasPointerCapture(e.pointerId)) return;
      if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
      if (!moved) return;
      var t = Math.round(timeFromPoint(e) * 10) / 10;
      current[key] = t;
      positionMarker(el, t);
      el.title = kind + " " + fmt(t);
    });
    el.addEventListener("pointerup", function (e) {
      if (!el.hasPointerCapture(e.pointerId)) return;
      el.releasePointerCapture(e.pointerId);
      seeking = false;
      el.classList.remove("dragging");
      if (moved) { persistLoop(); renderMarkers(); }
      else {
        userSeek(current[key]);
        var er = el.getBoundingClientRect();
        showSeekPop(current[key], tracks[segIndex(current[key])].getBoundingClientRect(), er.left + er.width / 2, null, kind);
      }
    });
  }

  // ---------- 自前シークバー(3行それぞれで操作可能・ドラッグで行をまたげる) ----------
  function attachTrackSeek(track) {
    var downX = 0, downY = 0, dragged = false;
    track.addEventListener("pointerdown", function (e) {
      if (!duration) return;
      track.setPointerCapture(e.pointerId);
      seeking = true;
      dragged = false; downX = e.clientX; downY = e.clientY;
      updateDisplay(timeFromPoint(e));
    });
    track.addEventListener("pointermove", function (e) {
      if (!seeking || !track.hasPointerCapture(e.pointerId)) return;
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) dragged = true;
      updateDisplay(timeFromPoint(e));
    });
    track.addEventListener("pointerup", function (e) {
      if (!track.hasPointerCapture(e.pointerId)) return;
      track.releasePointerCapture(e.pointerId);
      var t = timeFromPoint(e);
      seeking = false;
      userSeek(t);
      // 動かさずに離した(=1クリック/1タップ)時だけ、その位置にA/B/+Markerのポップアップ
      if (!dragged) showSeekPop(t, track.getBoundingClientRect(), e.clientX);
    });
  }

  // ---------- シークバー上の1クリック/1タップ → A / B / +Marker ポップアップ（v3.3.0） ----------
  // ABは「マーカー」で持つ仕組みなので、押した位置(0.1秒単位)にマーカーを作ってA点/B点にする。
  // すぐ近く(±0.5秒)に既存マーカーがあれば、新規作成せずそのマーカーを使う。
  // ポップアップはbody直下のposition:fixed（プレイヤー(iframe)には重ねない）。
  var seekPop = null, seekPopTimer = null, seekPopTime = 0, seekPopMarkerId = null;
  var SEEKPOP_SNAP = 0.5, SEEKPOP_MS = 4000;

  function ensureSeekPop() {
    if (seekPop) return seekPop;
    seekPop = document.createElement("div");
    seekPop.className = "qn-yt-seekpop";
    seekPop.hidden = true;
    seekPop.setAttribute("role", "menu");
    seekPop.innerHTML =
      '<div class="qn-yt-seekpop-time" data-pop="time">00:00</div>' +
      '<div class="qn-yt-seekpop-row">' +
        '<button type="button" class="qn-yt-seekpop-btn" data-pop="A" title="この位置をA点(ループ開始)に"><b>A</b><span>Start</span></button>' +
        '<button type="button" class="qn-yt-seekpop-btn" data-pop="B" title="この位置をB点(ループ終了)に"><b>B</b><span>End</span></button>' +
        '<button type="button" class="qn-yt-seekpop-btn" data-pop="M" title="この位置にマーカーを追加"><b>＋</b><span>Marker</span></button>' +
        '<button type="button" class="qn-yt-seekpop-btn qn-yt-seekpop-del" data-pop="X" title="このA/B点を削除" hidden><b>－</b><span>Point</span></button>' +
        '<button type="button" class="qn-yt-seekpop-btn qn-yt-seekpop-del" data-pop="D" title="このマーカーを削除" hidden><b>－</b><span>Marker</span></button>' +
        '<button type="button" class="qn-yt-seekpop-btn" data-pop="C" title="マーカーの色を変える" hidden><b><i class="qn-yt-seekpop-dot"></i></b><span>Color</span></button>' +
        '<button type="button" class="qn-yt-seekpop-btn" data-pop="H" title="このマーカーを非表示にする（Markersパネルの目で再表示）" hidden><b>' + SVG_EYE_ON + '</b><span>Hide</span></button>' +
      '</div>';
    document.body.appendChild(seekPop);
    seekPop.addEventListener("pointerdown", function (e) { e.stopPropagation(); resetSeekPopTimer(); });
    seekPop.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-pop]") : null;
      if (!b) return;
      var k = b.getAttribute("data-pop");
      if (k === "X") { seekPopClearPoint(); return; }
      if (k === "D") { seekPopDelete(b); return; }
      if (k === "C") { seekPopColor(); return; }
      if (k === "H") { seekPopHide(); return; }
      if (k === "A" || k === "B" || k === "M") seekPopAction(k);
    });
    // 外側のタップ・Esc・スクロールで閉じる
    document.addEventListener("pointerdown", function (e) {
      if (seekPop.hidden) return;
      if (e.target.closest && e.target.closest(".qn-yt-seekpop")) return;
      // シークバー自身のタップは、pointerupで新しい位置のポップアップに置き換わる
      hideSeekPop();
    }, true);
    window.addEventListener("keydown", function (e) { if (e.key === "Escape") hideSeekPop(); }, true);
    window.addEventListener("resize", hideSeekPop);
    return seekPop;
  }

  function resetSeekPopTimer() {
    if (seekPopTimer) clearTimeout(seekPopTimer);
    seekPopTimer = setTimeout(hideSeekPop, SEEKPOP_MS);
  }

  function hideSeekPop() {
    armSeekPopDel(false);
    if (seekPopTimer) { clearTimeout(seekPopTimer); seekPopTimer = null; }
    if (seekPop) seekPop.hidden = true;
  }

  var seekPopAbKind = null;
  function showSeekPop(t, trackRect, clientX, marker, abKind) {
    if (!current || !duration) return;
    var pop = ensureSeekPop();
    seekPopTime = Math.round(clampTime(t) * 10) / 10;
    seekPopMarkerId = marker ? marker.id : null;
    pop.querySelector('[data-pop="time"]').textContent = fmt(seekPopTime);
    seekPopAbKind = abKind || null;
    // A/B点の上では「－ Point」だけ。既存マーカー上ではA/B/－/Color/Hide。空き位置ではA/B/＋Marker
    pop.querySelector('[data-pop="X"]').hidden = !abKind;
    pop.querySelector('[data-pop="A"]').hidden = !!abKind;
    pop.querySelector('[data-pop="B"]').hidden = !!abKind;
    pop.querySelector('[data-pop="M"]').hidden = !!marker || !!abKind; // 既存マーカー上では＋Markerは不要
    pop.querySelector('[data-pop="D"]').hidden = !marker;  // 既存マーカー上だけ－Marker(削除)
    pop.querySelector('[data-pop="C"]').hidden = !marker;  // Color / Hide も既存マーカー上だけ
    pop.querySelector('[data-pop="H"]').hidden = !marker;
    // すでにA/Bが近く(±0.5秒)にあるボタンは地色で示す（押すと解除）
    pop.querySelector('[data-pop="A"]').classList.toggle("is-set", current.loopA !== null && Math.abs(current.loopA - seekPopTime) <= SEEKPOP_SNAP);
    pop.querySelector('[data-pop="B"]').classList.toggle("is-set", current.loopB !== null && Math.abs(current.loopB - seekPopTime) <= SEEKPOP_SNAP);
    if (marker) pop.querySelector(".qn-yt-seekpop-dot").style.background = markerColorHex(marker) || "#3a3a48";
    armSeekPopDel(false);
    pop.hidden = false;
    // 位置：押した場所の真上（収まらなければ真下）。画面端では内側へ寄せる。
    var w = pop.offsetWidth, h = pop.offsetHeight, gap = 10;
    var left = Math.min(Math.max(clientX - w / 2, 8), window.innerWidth - w - 8);
    var top = trackRect.top - h - gap;
    var below = top < 8;
    if (below) top = trackRect.bottom + gap;
    pop.classList.toggle("is-below", below);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    resetSeekPopTimer();
  }

  // －Marker：1回目で「Sure?」(赤)、3秒以内にもう1回押すと削除（誤タップ防止）
  var seekPopDelArmed = false, seekPopDelTimer = null;
  function armSeekPopDel(on) {
    seekPopDelArmed = on;
    if (seekPopDelTimer) { clearTimeout(seekPopDelTimer); seekPopDelTimer = null; }
    if (!seekPop) return;
    var b = seekPop.querySelector('[data-pop="D"]');
    b.classList.toggle("is-armed", on);
    b.querySelector("span").textContent = on ? "Sure?" : "Marker";
    if (on) seekPopDelTimer = setTimeout(function () { armSeekPopDel(false); }, 3000);
  }
  function seekPopDelete() {
    if (!seekPopMarkerId) return;
    if (!seekPopDelArmed) { armSeekPopDel(true); resetSeekPopTimer(); return; }
    var id = seekPopMarkerId, m = findMarker(id);
    hideSeekPop();
    if (!current || !m) return;
    current.markers = current.markers.filter(function (x) { return x.id !== id; });
    // 区間ループ中は、区間を引き直す（消したマーカーが境界だった場合）
    if (current.loopMode === "sec") { var r = sectionRangeAt(currentPos()); if (r) current.secRange = r; else setLoopMode("off"); }
    var it = current.itemId ? findItem(current.itemId) : null;
    if (it) it.markers = current.markers;
    persistMarkers(); persistLoop();
    renderMarkers();
    ytToast("Marker削除 " + fmt(m.time));
  }

  // Color：ポップアップを閉じ、シークバー上のそのマーカーを基準に色選択ポップアップを開く（Markersパネルの色ボタンと同じ部品）
  function seekPopColor() {
    var id = seekPopMarkerId, m = id ? findMarker(id) : null;
    hideSeekPop();
    if (!m || typeof openMarkerStylePopup !== "function") return;
    var anchor = refs.markerLayer.querySelector('[data-mid="' + id + '"]');
    if (!anchor) return;
    openMarkerStylePopup(anchor, { label: m.label || "", color: m.color || null, placeholder: fmt(m.time) }, function (v) {
      m.label = v.label;
      if (v.color) m.color = v.color; else delete m.color;
      persistMarkers(); renderMarkers();
    });
  }

  // Hide：マーカーを非表示（Markersパネルの目と同じ enabled=false）。ループの基準には使えなくなる点は従来どおり
  function seekPopHide() {
    var id = seekPopMarkerId, m = id ? findMarker(id) : null;
    hideSeekPop();
    if (!m) return;
    m.enabled = false;
    persistMarkers(); renderMarkers();
    ytToast("Marker非表示 " + fmt(m.time) + "（Markersパネルの目で再表示）");
  }

  // A/B点の削除（－ Point）
  function seekPopClearPoint() {
    var kind = seekPopAbKind;
    hideSeekPop();
    if (!current || !kind) return;
    current[kind === "A" ? "loopA" : "loopB"] = null;
    if (current.loopMode === "ab") setLoopMode("off");
    persistLoop();
    renderMarkers();
    ytToast(kind + " 解除");
  }

  function seekPopAction(kind) {
    hideSeekPop();
    setLoopPointAt(kind, seekPopTime);
  }

  // 指定の位置(秒)にA点/B点を設定する、またはマーカーを追加する共通処理。
  // v3.8.0〜：A/Bはマーカーを作らない（使い捨ての区切り点）。同じ種類の点が±0.5秒以内にあれば解除（トグル）。
  // kind="M"だけがマーカー追加（±0.5秒以内に既存マーカーがあれば作らない）。
  function setLoopPointAt(kind, t) {
    if (!current) return;
    var tt = Math.round(clampTime(t) * 10) / 10, msg;
    if (kind === "A" || kind === "B") {
      var key = kind === "A" ? "loopA" : "loopB";
      if (current[key] !== null && Math.abs(current[key] - tt) <= SEEKPOP_SNAP) {
        current[key] = null; msg = kind + " 解除";
      } else {
        current[key] = tt; msg = kind + " " + fmt(tt);
      }
      if (current.loopA === null || current.loopB === null) { if (current.loopMode === "ab") setLoopMode("off"); }
      persistLoop();
    } else {
      var i, near = null, best = SEEKPOP_SNAP + 1e-9;
      for (i = 0; i < current.markers.length; i++) {
        var d = Math.abs(current.markers[i].time - tt);
        if (d <= best) { best = d; near = current.markers[i]; }
      }
      if (near) {
        msg = "Markerは既にあります " + fmt(near.time);
      } else {
        current.markers.push({ id: uid("m"), time: tt, label: "" });
        sortMarkers(); persistMarkers();
        msg = "Marker " + fmt(tt);
      }
    }
    renderMarkers();
    ytToast(msg);
  }

  function updateDisplay(t) {
    if (!root) return;
    if (refs.curTime) refs.curTime.textContent = fmt(t);
    var active = segIndex(t);
    for (var i = 0; i < SEGS; i++) {
      var p = segPct(i, t) + "%";
      fills[i].style.width = p;
      heads[i].style.display = (i === active) ? "" : "none";
      heads[i].style.left = p;
    }
    paintPlayed(t);
  }

  // 現在位置のポーリング(ドラッグ中は更新しない)。ABループ中はB点到達でA点へseekTo()。
  // この画面が表示されている間だけ動かす。
  function poll() {
    if (!player || !playerReady || seeking) return;
    if (!duration) refreshDuration();
    if (typeof player.getCurrentTime !== "function") return;
    var t = player.getCurrentTime();
    if (current && current.looping) {
      // 区間ループは再生位置に追従（PLAYERと同じルール）：今の区間（プリロール/ポストロール込み）の外にいたら、
      // その位置の区間に切り替える。自分のループ折り返し直後(1.5秒)は、位置の更新が遅れるため判定しない。
      if (current.loopMode === "sec" && current.secRange && Date.now() - loopJumpAt > 1500) {
        var sr = current.secRange;
        if (!QNMarkerCore.inRange(sr.start, sr.end, t, preRoll, duration)) {
          var nr = sectionRangeAt(t);
          if (nr && (nr.start !== sr.start || nr.end !== sr.end)) {
            current.secRange = nr;
            updateLoopUI();
            ytToast("Section " + fmt(nr.start) + " - " + fmt(nr.end));
          }
        }
      }
      var range = activeLoopRange();
      // 区間の終わりが動画の終わりの時は、終了(ended)になる前に少し手前で戻す
      // プリロール/ポストロール：区間の「終わりの何秒後まで」再生してから「開始の何秒前」へ戻る
      var endAt = Math.min(duration - 0.3, range.end + preRoll);
      if (range && t >= endAt) { loopJumpAt = Date.now(); seekTo(Math.max(0, range.start - preRoll)); return; }
    }
    updateDisplay(t);
  }


  // ============================================================
  // Backup / Import（リスト・タイトル・マーカー）
  //   形式は JSON（format: "qn-youtube-library"）。含めるのは
  //   videoId / URL / 手入力タイトル / マーカー(秒・ラベル)/ AB点 だけ。
  //   YouTube由来のデータ（自動取得タイトル・サムネ等）は含めない（規約）。
  // ============================================================
  var EXPORT_FORMAT = "qn-youtube-library";
  // （Backup/Importの画面そのものは本体と共通。ここにはYouTube側のデータの出し入れだけを置く。
  //   v3.17.0〜：window.QNYouTubeBackup として公開し、player-track-backup.jsが使う）
  // ---- Import ----
  function cleanStr(v, max) {
    return typeof v === "string" ? v.trim().slice(0, max) : "";
  }

  // 読み込んだJSONを検証・整形する。壊れた/想定外の値は捨てる。
  function normalizeImport(raw) {
    var list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
    if (!list) return null;
    var seen = {}, out = [];
    list.forEach(function (r) {
      if (!r || typeof r !== "object") return;
      var vid = typeof r.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(r.videoId) ? r.videoId : parseVideoId(r.url);
      if (!vid || seen[vid]) return;
      seen[vid] = true;
      var url = typeof r.url === "string" && parseVideoId(r.url) === vid ? r.url.trim().slice(0, 300) : "https://youtu.be/" + vid;
      var o = { videoId: vid, url: url };
      var title = cleanStr(r.title, 200);
      if (title) o.title = title;
      if (Array.isArray(r.markers)) {
        var ids = {}, ms = [];
        r.markers.forEach(function (m) {
          if (!m || typeof m.time !== "number" || !isFinite(m.time) || m.time < 0 || m.time > 604800) return;
          var id = cleanStr(m.id, 40);
          if (!id || ids[id]) id = uid("m");
          ids[id] = true;
          var mo = { id: id, time: Math.round(m.time * 10) / 10, label: cleanStr(m.label, 200) };
          if (typeof m.color === "string" && typeof MARKER_COLOR_PALETTE !== "undefined" && MARKER_COLOR_PALETTE[m.color]) mo.color = m.color;
          if (m.enabled === false) mo.enabled = false;
          ms.push(mo);
        });
        ms.sort(function (a, b) { return a.time - b.time; });
        o.markers = ms;
        // A/B：新形式は秒(数値)、旧形式(v3.8.0より前)はマーカーID→そのマーカーの時刻に読み替える
        o.loopA = abTimeOf(typeof r.loopA === "string" ? cleanStr(r.loopA, 40) : r.loopA, ms);
        o.loopB = abTimeOf(typeof r.loopB === "string" ? cleanStr(r.loopB, 40) : r.loopB, ms);
      }
      out.push(o);
    });
    return out;
  }

  // ---- 共通Backup/Import画面への窓口（v3.17.0〜） ----
  function buildExportObject(ids, includeSettings) {
    var want = {};
    ids.forEach(function (id) { want[id] = true; });
    var sel = items.filter(function (it) { return want[it.id]; });
    return {
      format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(),
      items: sel.map(function (it) {
        var o = { videoId: it.videoId, url: it.url };
        if (includeSettings) {
          o.title = it.title;
          o.markers = it.markers.map(function (m) { var o2 = { id: m.id, time: m.time, label: m.label || "" }; if (m.color) o2.color = m.color; if (m.enabled === false) o2.enabled = false; return o2; });
          o.loopA = abTimeOf(it.loopA, it.markers);   // v3.8.0〜：秒（マーカーとは別の点）
          o.loopB = abTimeOf(it.loopB, it.markers);
        }
        return o;
      })
    };
  }

  function applyImportList(list, choices) {
    var added = 0, over = 0, skipped = 0;
    list.forEach(function (x) {
      var ex = findItemByVideoId(x.videoId);
      if (ex) {
        if (choices && choices[x.videoId] === "skip") { skipped++; return; }
        if (x.title) ex.title = x.title;
        ex.url = x.url;
        if (x.markers) {
          ex.markers = x.markers; ex.loopA = x.loopA; ex.loopB = x.loopB;
          // 今開いている動画なら、画面側の状態も差し替える
          if (current && current.itemId === ex.id) {
            current.markers = ex.markers; current.loopA = ex.loopA; current.loopB = ex.loopB; setLoopMode("off");
          }
        }
        over++;
      } else {
        items.push({
          id: uid("item"), type: "youtube", videoId: x.videoId, url: x.url,
          title: x.title || "(無題)", markers: x.markers || [],
          loopA: (typeof x.loopA === "number") ? x.loopA : null, loopB: (typeof x.loopB === "number") ? x.loopB : null, createdAt: Date.now()
        });
        added++;
      }
    });
    saveItems();
    if (root) { renderList(); renderMarkers(); }
    return { added: added, over: over, skipped: skipped };
  }

  window.QNYouTubeBackup = {
    list: function () {
      return items.map(function (it) { return { id: it.id, title: it.title, markerCount: it.markers.length }; });
    },
    buildExport: buildExportObject,
    // 読み込んだJSON（オブジェクト）をYouTubeの形式として整形する。YouTubeの形式でなければnull
    parseImport: function (raw) {
      if (raw && !Array.isArray(raw) && raw.format && raw.format !== EXPORT_FORMAT) return null;
      var list = normalizeImport(raw);
      return list && list.length ? list : null;
    },
    exists: function (videoId) { return !!findItemByVideoId(videoId); },
    titleOf: function (videoId) { var it = findItemByVideoId(videoId); return it ? it.title : ""; },
    applyImport: applyImportList
  };

  // ---------- スペースキーで再生/一時停止（フォーカスがプレイヤー外でも） ----------
  // 公式の playVideo()/pauseVideo() を、利用者のキー操作を起点に呼ぶだけ（規約OK）。
  // 文字入力中・修飾キー併用・キーリピートは無視。ボタンにフォーカスがあっても誤作動しない。
  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }
  function togglePlay() {
    if (!player || !playerReady || typeof player.getPlayerState !== "function") return;
    try {
      if (player.getPlayerState() === 1) player.pauseVideo(); // 1 = PLAYING
      else player.playVideo();                                 // 利用者操作が起点
    } catch (err) {}
  }
  function updatePlayBtn(playing) {
    if (!refs.playBtn) return;
    refs.playBtn.innerHTML = '<svg viewBox="0 0 24 24">' + (playing ? BI.pause : BI.play) + '</svg><span>' + (playing ? "Pause" : "Play") + '</span>';
    refs.playBtn.classList.toggle("is-playing", !!playing);
  }
  // Libraryの前/次の動画へ（SKIPは飛ばす）。押した時に再生開始（利用者操作が起点）
  function gotoNeighbor(dir) {
    if (!current || !current.itemId) { showMessage("Libraryの動画を選んでください"); return; }
    var idx = -1, i;
    for (i = 0; i < items.length; i++) if (items[i].id === current.itemId) idx = i;
    if (idx < 0) return;
    var target = null;
    for (i = idx + dir; i >= 0 && i < items.length; i += dir) if (!items[i].skip) { target = items[i]; break; }
    if (!target) { showMessage(dir > 0 ? "Libraryの最後の動画です" : "Libraryの最初の動画です"); return; }
    refs.urlInput.value = target.url;
    openVideo(target.videoId, target.url, target.id, { play: true });
  }

  // ---------- YouTube本家と同じキーボードショートカット（v3.1.0〜） ----------
  // 公式メソッド（playVideo/pauseVideo/seekTo/setVolume/mute/setPlaybackRate）を、
  // 利用者のキー操作を起点に呼ぶだけ（規約OK）。アプリ表示中のみ有効。
  // 文字入力中・Ctrl/Cmd/Alt併用・キーリピート（再生系）は無視。
  // ※プレイヤー(iframe)自体にフォーカスがある時は、YouTube側が同じキーを処理する。
  var SHORTCUTS = [
    { key: "Space / K", action: "Play / Pause" },
    { key: "J / L", action: "Back / Forward 10s" },
    { key: "← / →", action: "Back / Forward 5s" },
    { key: "↑ / ↓", action: "Volume +5% / -5%" },
    { key: "M", action: "Mute / Unmute" },
    { key: "0 - 9", action: "Jump to 0% - 90%" },
    { key: "Home / End", action: "Start / End of video" },
    { key: ", / .", action: "Previous / Next frame (paused)" },
    { key: "< / >", action: "Slower / Faster (Shift + , / .)" },
    { key: "Shift + P / N", action: "Previous / Next video (Library)" }
  ];

  function ytToast(text) {
    try { if (window.QNApps && window.QNApps.toast) window.QNApps.toast(text); } catch (e) {}
  }

  function resetRate() {
    desiredRate = 1;
    try { localStorage.setItem(RATE_KEY, "1"); } catch (e) {}
    try { if (player && playerReady && player.setPlaybackRate) player.setPlaybackRate(1); } catch (e) {}
    renderSpeed();
    ytToast("Speed 1x");
  }
  function stepRate(dir, quiet) {
    var rates = availableRates(), actual = desiredRate, i, idx = -1;
    try { if (player && playerReady && player.getPlaybackRate) actual = player.getPlaybackRate(); } catch (e) {}
    for (i = 0; i < rates.length; i++) if (Math.abs(rates[i] - actual) < 0.001) idx = i;
    if (idx < 0) { // 現在値が一覧に無い時は、いちばん近い側へ
      idx = 0;
      for (i = 0; i < rates.length; i++) if (rates[i] <= actual) idx = i;
    }
    var n = Math.max(0, Math.min(rates.length - 1, idx + dir));
    desiredRate = rates[n];
    try { localStorage.setItem(RATE_KEY, String(desiredRate)); } catch (e) {}
    try { if (player && playerReady && player.setPlaybackRate) player.setPlaybackRate(desiredRate); } catch (e) {}
    renderSpeed();
    if (!quiet) ytToast("Speed " + desiredRate + "x");
  }

  function changeVolume(delta) {
    try {
      if (!player.getVolume || !player.setVolume) return;
      if (player.isMuted && player.isMuted() && delta > 0 && player.unMute) player.unMute();
      var v = Math.max(0, Math.min(100, Math.round(player.getVolume()) + delta));
      player.setVolume(v);
      ytToast("Volume " + v + "%");
    } catch (e) {}
  }

  function toggleMute() {
    try {
      if (!player.isMuted) return;
      if (player.isMuted()) { player.unMute(); ytToast("Unmuted"); }
      else { player.mute(); ytToast("Muted"); }
    } catch (e) {}
  }

  function onSpaceKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
    if (!player || !playerReady || typeof player.getPlayerState !== "function") return;
    var k = e.key, isSpace = (e.code === "Space" || k === " ");
    if (isSpace) {
      if (e.shiftKey) return;
      e.preventDefault(); // ページのスクロール／フォーカス中ボタンの誤クリックを防ぐ
      if (e.type === "keyup" || e.repeat) return;
      togglePlay();
      return;
    }
    if (e.type !== "keydown") return;
    var lk = (k || "").length === 1 ? k.toLowerCase() : k;
    var handled = true, t, st;
    if (e.shiftKey) {
      // Shift併用は「< >」(速度)と Shift+N/P(前後の動画)だけ。
      if (k === "<") stepRate(-1);
      else if (k === ">") stepRate(1);
      else if (lk === "n" && !e.repeat) gotoNeighbor(1);
      else if (lk === "p" && !e.repeat) gotoNeighbor(-1);
      else handled = false;
      if (handled) e.preventDefault();
      return;
    }
    if (lk === "k") { if (!e.repeat) togglePlay(); }
    else if (lk === "j") seekTo(currentPos() - 10);
    else if (lk === "l") seekTo(currentPos() + 10);
    else if (k === "ArrowLeft") seekTo(currentPos() - 5);
    else if (k === "ArrowRight") seekTo(currentPos() + 5);
    else if (k === "ArrowUp") changeVolume(5);
    else if (k === "ArrowDown") changeVolume(-5);
    else if (lk === "m") { if (!e.repeat) toggleMute(); }
    else if (k === "Home") seekTo(0);
    else if (k === "End") { if (duration) seekTo(duration); }
    else if (k >= "0" && k <= "9" && k.length === 1) {
      if (duration) seekTo(duration * (Number(k) / 10));
    }
    else if (k === "," || k === ".") {
      // 一時停止中だけ、1フレーム(約1/30秒)ずつ。再生中はYouTube本家同様に何もしない
      try { st = player.getPlayerState(); } catch (err) { st = -1; }
      if (st === 1) handled = false;
      else seekTo(currentPos() + (k === "." ? 1 : -1) / 30);
    }
    else handled = false;
    if (handled) e.preventDefault();
  }

  // Keyboardパネル：表の組み立ては共通（QNApps.renderShortcuts）。ここは行リストと注記を渡すだけ。
  function renderShortcuts() {
    if (!refs.kbdBox) return;
    window.QNApps.renderShortcuts(refs.kbdBox, SHORTCUTS, "YouTube本家と同じキーです。文字入力中は動きません。");
  }

  var spaceBound = false;
  function bindSpace(on) {
    if (on === spaceBound) return;
    spaceBound = on;
    var f = on ? "addEventListener" : "removeEventListener";
    window[f]("keydown", onSpaceKey, true);
    window[f]("keyup", onSpaceKey, true);
  }

  function onShow() {
    bindSpace(true);
    // 初回はPC=Library表示、SP=パネルなし。2回目以降は前回の状態を保つ
    var want = panelState || (isSp() ? "none" : "library");
    setPanel(want);
    applyCollapse();
    // 非表示中はoffsetTopが0になりマーカー位置がずれるので、表示のたびに描き直す
    renderMarkers();
    updateDisplay(currentPos());
    if (!pollTimer) pollTimer = setInterval(poll, 250);
  }

  function onHide() {
    bindSpace(false);
    hideSeekPop();
    try { if (window.QNWake) window.QNWake.set("youtube", false); } catch (err) {}
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    // 画面を隠したまま音だけ流さない（規約）。公式メソッドで一時停止する。
    try {
      if (player && playerReady && typeof player.pauseVideo === "function") player.pauseVideo();
    } catch (e) {}
  }

  // ---------- アプリ登録 ----------
  if (window.QNApps) {
    window.QNApps.register({
      id: "youtube",
      label: "YouTube",
      icon: YT_ICON,
      order: 10,
      ready: true,
      sidebar: SIDEBAR,
      onSidebar: onSidebar,
      mount: mount,
      onShow: onShow,
      onHide: onHide
    });
  } else {
    console.error("qn-app-youtube.js: qn-apps.js が先に読み込まれていません");
  }
})();
