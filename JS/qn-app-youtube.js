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

  var SVG_PREV = '<svg viewBox="0 0 24 24" class="qn-yt-ico"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>';
  var SVG_PLAY = '<svg viewBox="0 0 24 24" class="qn-yt-ico"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" class="qn-yt-ico"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  var SVG_NEXT = '<svg viewBox="0 0 24 24" class="qn-yt-ico"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>';
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
  var tracks = [], fills = [], heads = [], loopRanges = [];
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
          // ---- Backup（本体のBackupと同じ流れ：リスト選択 → 含める項目 → Download） ----
          '<section class="qn-yt-sec qn-yt-sec-backup">' +
            '<div class="track-backup-tracklist-header">' +
              '<label class="export-section-label">リストを選択</label>' +
              '<div class="track-backup-tracklist-actions">' +
                '<button type="button" class="track-backup-mini-btn" data-yt="bkAll">全選択</button>' +
                '<button type="button" class="track-backup-mini-btn" data-yt="bkNone">全解除</button>' +
              '</div>' +
            '</div>' +
            '<div class="track-backup-tracklist" data-yt="bkList"></div>' +
            '<div class="track-backup-size-row"><span data-yt="bkCount">0件選択中</span><span class="qn-yt-accent" data-yt="bkMarkerTotal">0 markers</span></div>' +
            '<div class="track-backup-options">' +
              '<label class="export-section-label">含める項目</label>' +
              '<div class="track-backup-checklist">' +
                '<label class="track-backup-row"><input type="checkbox" data-yt="bkTitle" checked><span class="track-backup-row-label">タイトル</span></label>' +
                '<label class="track-backup-row"><input type="checkbox" data-yt="bkMarkers" checked><span class="track-backup-row-label">マーカー・AB点</span></label>' +
              '</div>' +
            '</div>' +
            '<p class="qn-yt-hint">動画のURLは常に含まれます。保存されるのは、URL・自分で付けたタイトル・マーカー（位置とラベル）だけです。</p>' +
            '<div class="qn-yt-actions">' +
              '<div class="export-status" data-yt="bkStatus"></div>' +
              '<button type="button" class="export-run-btn" data-yt="bkRun">Download</button>' +
            '</div>' +
          '</section>' +
          // ---- Import（JSONを読み込み → 重複は上書き/スキップ → Import） ----
          '<section class="qn-yt-sec qn-yt-sec-import">' +
            '<div class="track-import-dropzone" data-yt="imDrop">' +
              '<svg viewBox="0 0 24 24" class="track-import-dropzone-icon"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM13 12.67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>' +
              '<div class="track-import-dropzone-text">JSONファイルをドロップ</div>' +
              '<div class="track-import-dropzone-sub">またはクリックして選択</div>' +
              '<input type="file" accept=".json,application/json" style="display:none;" data-yt="imFile">' +
            '</div>' +
            '<div class="track-import-loaded-info" data-yt="imLoaded" style="display:none;">' +
              '<svg viewBox="0 0 24 24" class="track-import-loaded-info-icon"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' +
              '<div class="track-import-loaded-info-text">' +
                '<div class="track-import-loaded-info-name" data-yt="imName">-</div>' +
                '<div class="track-import-loaded-info-count" data-yt="imCount"></div>' +
              '</div>' +
            '</div>' +
            '<div class="track-import-duplicate-list" data-yt="imDupList" style="display:none;">' +
              '<div class="track-import-duplicate-header">' +
                '<label class="export-section-label">重複する動画</label>' +
                '<div class="track-import-bulk-toggle-wrap">' +
                  '<span class="track-import-choice-label" data-yt="imBulkLabel">すべて上書き</span>' +
                  '<button type="button" class="glow-switch track-import-choice-switch" role="switch" aria-checked="true" data-yt="imBulk" title="すべてスキップに切り替え"><span class="glow-switch-knob"></span></button>' +
                '</div>' +
              '</div>' +
              '<div data-yt="imDupRows"></div>' +
            '</div>' +
            '<div class="qn-yt-actions">' +
              '<div class="export-status" data-yt="imStatus"></div>' +
              '<button type="button" class="export-cancel-btn" data-yt="imBack" style="display:none;">Back</button>' +
              '<button type="button" class="export-run-btn" data-yt="imRun" disabled>Import</button>' +
            '</div>' +
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
          '<div class="qn-yt-time"><span data-yt="curTime">00:00</span><span class="sep">/</span><span data-yt="durTime">00:00</span></div>' +
          '<div class="qn-yt-seek" data-yt="seekTracks"><div class="qn-yt-marker-layer" data-yt="markerLayer"></div></div>' +
          '<div class="qn-yt-ctrl-row qn-yt-transport">' +
            '<button type="button" data-yt="prevVideoBtn" class="qn-yt-btn" title="Libraryの前の動画">' + SVG_PREV + 'Prev</button>' +
            '<button type="button" data-yt="playBtn" class="qn-yt-btn primary" title="再生 / 一時停止（スペースキー）">' + SVG_PLAY + '</button>' +
            '<button type="button" data-yt="nextVideoBtn" class="qn-yt-btn" title="Libraryの次の動画">Next' + SVG_NEXT + '</button>' +
          '</div>' +
          '<div class="qn-yt-ctrl-row">' +
            '<button type="button" data-yt="skipBackBtn" class="qn-yt-btn">◀◀ 10s</button>' +
            '<button type="button" data-yt="prevMarkerBtn" class="qn-yt-btn" title="前のマーカーへ">' + SVG_PREV + 'Marker</button>' +
            '<button type="button" data-yt="addMarkerBtn" class="qn-yt-btn primary">+ Marker</button>' +
            '<button type="button" data-yt="nextMarkerBtn" class="qn-yt-btn" title="次のマーカーへ">Marker' + SVG_NEXT + '</button>' +
            '<button type="button" data-yt="skipFwdBtn" class="qn-yt-btn">10s ▶▶</button>' +
          '</div>' +
          // 再生スピード：プレイヤーの外に置く自前UI。中身はYouTube標準と同じ倍率
          // （getAvailablePlaybackRates()）。公式メソッドsetPlaybackRate()のみ使用。
          '<div class="qn-yt-ctrl-row qn-yt-speed-row">' +
            '<span class="qn-yt-loop-status">Speed</span>' +
            '<div class="qn-yt-speed-chips" data-yt="speedChips"></div>' +
          '</div>' +
          // 終了したら次のライブラリの動画へ。利用者が明示的にONにした時だけ動く（初期OFF）。
          '<div class="qn-yt-ctrl-row qn-yt-autonext-row">' +
            '<span class="qn-yt-loop-status">Auto Next</span>' +
            '<button type="button" class="glow-switch" role="switch" aria-checked="false" data-yt="autoNext" title="終了したらLibraryの次の動画を読み込む"><span class="glow-switch-knob"></span></button>' +
            '<span class="qn-yt-loop-status qn-yt-autonext-hint">動画が終わったら、Libraryの次の動画を再生します</span>' +
          '</div>' +
          '<div class="qn-yt-ctrl-row qn-yt-ab-row">' +
            '<span class="qn-yt-loop-status">A <b data-yt="loopALabel">--</b></span>' +
            '<span class="qn-yt-loop-status">B <b data-yt="loopBLabel">--</b></span>' +
            '<button type="button" data-yt="loopToggleBtn" class="qn-yt-btn" disabled>Loop OFF</button>' +
            '<button type="button" data-yt="loopClearBtn" class="qn-yt-btn">Clear AB</button>' +
          '</div>' +
          '<p class="qn-yt-hint">Markers の「A」「B」ボタンで、ABループの開始・終了を指定できます。再生/停止は YouTube 標準のコントロールで行います。</p>' +
        '</div>' +
        '<footer class="qn-yt-footer">' +
          '<p class="qn-yt-notice">※ 権利者に無断でアップロードされた動画は使用しないでください。</p>' +
          // 将来の広告枠。プレイヤーから離れた位置に確保するだけ（広告コードはなし）。
          '<div class="qn-yt-ad-slot" aria-hidden="true"></div>' +
        '</footer>' +
      '</section>' +
    '</div>';

  // ---------- サイドバー(Library / Markers)とパネル ----------
  // PC幅：パネルは常時表示で、アイコンは中身を切り替える。
  // SP幅：パネルは全面オーバーレイ。アイコンで開閉（同じアイコンをもう一度で閉じる）。
  var SIDEBAR = [
    { id: "library", label: "Library", icon: '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>' },
    { id: "markers", label: "Markers", icon: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>' },
    // 本体のBackup / Importと同じアイコン・同じ流れ
    { id: "backup", label: "Backup", icon: '<path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h5v2H8v-2z"/>' },
    { id: "import", label: "Import", icon: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>' }
  ];
  var PANEL_TITLES = { library: "Library", markers: "Markers", backup: "Backup", import: "Import" };
  var panelState = null; // "library" | "markers" | "backup" | "import" | "none"(SPのみ)

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
    if (id === "backup") renderBackupList();
    if (id === "import") resetImportView();
    updatePanelTitle();
    if (window.QNApps) window.QNApps.setSideActive(id === "none" ? null : id);
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
    if (isSp() && panelState === id) setPanel("none");
    else setPanel(id);
  }

  // SP幅で動画を選んだ/読み込んだ後は、パネルを閉じてプレイヤーを見せる
  function closePanelOnSp() { if (isSp()) setPanel("none"); }

  function mount(view) {
    root = view;
    root.innerHTML = TEMPLATE;
    var nodes = root.querySelectorAll("[data-yt]");
    for (var i = 0; i < nodes.length; i++) refs[nodes[i].getAttribute("data-yt")] = nodes[i];

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
    bindBackupImport();
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
      track.appendChild(fill); track.appendChild(loop); track.appendChild(head);
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
      refs.durTime.textContent = fmt(d);
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
      loopA: item ? (item.loopA || null) : null,
      loopB: item ? (item.loopB || null) : null,
      looping: false // 動画を開き直したら自動ではループしない
    };
    duration = 0;
    refs.durTime.textContent = "00:00";
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

    refs.loopToggleBtn.addEventListener("click", function () {
      if (!current || !loopRangeTimes()) return;
      current.looping = !current.looping;
      updateLoopUI();
    });
    refs.playBtn.addEventListener("click", togglePlay);
    refs.prevVideoBtn.addEventListener("click", function () { gotoNeighbor(-1); });
    refs.nextVideoBtn.addEventListener("click", function () { gotoNeighbor(1); });
    updatePlayBtn(false);
    refs.prevMarkerBtn.addEventListener("click", function () { jumpMarker(-1); });
    refs.nextMarkerBtn.addEventListener("click", function () { jumpMarker(1); });
    refs.autoNext.setAttribute("aria-checked", String(autoNext));
    refs.autoNext.addEventListener("click", function () { setAutoNext(!autoNext); });
    renderSpeed();

    refs.loopClearBtn.addEventListener("click", function () {
      if (!current) return;
      current.loopA = null; current.loopB = null; current.looping = false;
      persistLoop();
      renderMarkers();
    });
  }

  // ---------- 前/次のマーカーへ移動（現在地を基準） ----------
  function jumpMarker(dir) {
    if (!current || !playerReady) { showMessage("先に動画を読み込んでください"); return; }
    var ms = current.markers.filter(function (x) { return x.enabled !== false; });
    if (!ms.length) { showMessage("マーカーがありません"); return; }
    var t = currentPos(), target = null, i;
    if (dir > 0) {
      for (i = 0; i < ms.length; i++) if (ms[i].time > t + 0.05) { target = ms[i]; break; }
      if (!target) { showMessage("これより後のマーカーはありません"); return; }
    } else {
      // 直前のマーカーの少し先にいる時は、その1つ前へ戻れるよう 0.5秒の余裕を持たせる
      for (i = ms.length - 1; i >= 0; i--) if (ms[i].time < t - 0.5) { target = ms[i]; break; }
    }
    showMessage("");
    seekTo(target ? target.time : 0);
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
    if (!root) return;
    var actual = desiredRate;
    try { if (player && playerReady && player.getPlaybackRate) actual = player.getPlaybackRate(); } catch (e) {}
    refs.speedChips.textContent = "";
    availableRates().forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "qn-yt-btn mini" + (Math.abs(r - actual) < 0.001 ? " on" : "");
      b.textContent = r === 1 ? "1x" : (r + "x");
      b.addEventListener("click", function () {
        desiredRate = r;
        try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) {}
        if (player && playerReady && player.setPlaybackRate) player.setPlaybackRate(r);
        renderSpeed();
      });
      refs.speedChips.appendChild(b);
    });
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
    if (refs.autoNext) refs.autoNext.setAttribute("aria-checked", String(autoNext));
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
        // 消えたマーカーを指すAB点は外す
        if (current.loopA && selected[current.loopA]) current.loopA = null;
        if (current.loopB && selected[current.loopB]) current.loopB = null;
        if (!current.loopA || !current.loopB) current.looping = false;
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
    if (panelState === "backup") renderBackupList();
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
      infoSpan.addEventListener("click", function () { seekTo(m.time); });
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
      abtnA.className = "qn-yt-btn mini ab" + (current.loopA === m.id ? " active-a" : "");
      abtnA.textContent = "A"; abtnA.title = "ABループのA点(開始)に設定";
      abtnA.addEventListener("click", function (e) { e.stopPropagation(); toggleLoopPoint("A", m.id); });
      var abtnB = document.createElement("button");
      abtnB.type = "button";
      abtnB.className = "qn-yt-btn mini ab" + (current.loopB === m.id ? " active-b" : "");
      abtnB.textContent = "B"; abtnB.title = "ABループのB点(終了)に設定";
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
  function toggleLoopPoint(which, markerId) {
    if (!current) return;
    if (which === "A") {
      current.loopA = (current.loopA === markerId) ? null : markerId;
      if (current.loopB === markerId) current.loopB = null; // 同じマーカーをA/B両方にはしない
    } else {
      current.loopB = (current.loopB === markerId) ? null : markerId;
      if (current.loopA === markerId) current.loopA = null;
    }
    if (!current.loopA || !current.loopB) current.looping = false;
    persistLoop();
    renderMarkers();
  }

  function loopRangeTimes() {
    if (!current || !current.loopA || !current.loopB) return null;
    var ma = findMarker(current.loopA), mb = findMarker(current.loopB);
    if (!ma || !mb) return null;
    return ma.time <= mb.time ? { start: ma.time, end: mb.time } : { start: mb.time, end: ma.time };
  }

  function updateLoopUI() {
    if (!current) return;
    var ma = findMarker(current.loopA), mb = findMarker(current.loopB);
    refs.loopALabel.textContent = ma ? fmt(ma.time) : "--";
    refs.loopBLabel.textContent = mb ? fmt(mb.time) : "--";

    var range = loopRangeTimes();
    refs.loopToggleBtn.disabled = !range;
    refs.loopToggleBtn.textContent = "Loop " + (current.looping ? "ON" : "OFF");
    refs.loopToggleBtn.classList.toggle("on", !!current.looping);

    // ループ区間を、各行との重なり部分だけ表示
    var len = duration ? duration / SEGS : 0;
    for (var i = 0; i < SEGS; i++) {
      var shown = false;
      if (range && duration) {
        var a = Math.max(range.start, i * len), b = Math.min(range.end, (i + 1) * len);
        if (b > a) {
          loopRanges[i].hidden = false;
          loopRanges[i].style.left = segPct(i, a) + "%";
          loopRanges[i].style.width = Math.max(0, segPct(i, b) - segPct(i, a)) + "%";
          shown = true;
        }
      }
      if (!shown) loopRanges[i].hidden = true;
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
      else seekTo(m.time);
    });
  }

  // ---------- 自前シークバー(3行それぞれで操作可能・ドラッグで行をまたげる) ----------
  function attachTrackSeek(track) {
    track.addEventListener("pointerdown", function (e) {
      if (!duration) return;
      track.setPointerCapture(e.pointerId);
      seeking = true;
      updateDisplay(timeFromPoint(e));
    });
    track.addEventListener("pointermove", function (e) {
      if (!seeking || !track.hasPointerCapture(e.pointerId)) return;
      updateDisplay(timeFromPoint(e));
    });
    track.addEventListener("pointerup", function (e) {
      if (!track.hasPointerCapture(e.pointerId)) return;
      track.releasePointerCapture(e.pointerId);
      var t = timeFromPoint(e);
      seeking = false;
      seekTo(t);
    });
  }

  function updateDisplay(t) {
    if (!root) return;
    refs.curTime.textContent = fmt(t);
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
      var range = loopRangeTimes();
      if (range && t >= range.end) { seekTo(range.start); return; }
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
  var bkSelected = {};             // itemId -> false のとき未選択（未登録=選択）
  var imData = null;               // 読み込んだ項目（正規化済み）
  var imChoices = {};              // videoId -> "overwrite" | "skip"

  function setStatus(el, text, kind) {
    el.textContent = text || "";
    el.className = "export-status" + (kind ? " " + kind : "");
  }

  function renderBackupList() {
    if (!root) return;
    refs.bkList.textContent = "";
    if (!items.length) {
      var p = document.createElement("p");
      p.className = "qn-yt-empty"; p.textContent = "保存されたリストがありません";
      refs.bkList.appendChild(p);
    }
    items.forEach(function (it) {
      var row = document.createElement("label");
      row.className = "track-backup-track-row";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = bkSelected[it.id] !== false;
      cb.addEventListener("change", function () { bkSelected[it.id] = cb.checked; updateBackupSummary(); });
      var nm = document.createElement("span");
      nm.className = "track-backup-track-name"; nm.textContent = it.title; nm.title = it.title;
      var sz = document.createElement("span");
      sz.className = "track-backup-track-size"; sz.textContent = it.markers.length + " markers";
      row.appendChild(cb); row.appendChild(nm); row.appendChild(sz);
      refs.bkList.appendChild(row);
    });
    updateBackupSummary();
  }

  function selectedItems() {
    return items.filter(function (it) { return bkSelected[it.id] !== false; });
  }

  function updateBackupSummary() {
    var sel = selectedItems();
    var mk = 0;
    sel.forEach(function (it) { mk += it.markers.length; });
    refs.bkCount.textContent = sel.length + "件選択中";
    refs.bkMarkerTotal.textContent = mk + " markers";
    refs.bkRun.disabled = sel.length === 0;
  }

  function downloadBackup() {
    var sel = selectedItems();
    if (!sel.length) return;
    var incTitle = refs.bkTitle.checked, incMarkers = refs.bkMarkers.checked;
    var out = {
      format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(),
      items: sel.map(function (it) {
        var o = { videoId: it.videoId, url: it.url };
        if (incTitle) o.title = it.title;
        if (incMarkers) {
          o.markers = it.markers.map(function (m) { var o2 = { id: m.id, time: m.time, label: m.label || "" }; if (m.color) o2.color = m.color; if (m.enabled === false) o2.enabled = false; return o2; });
          o.loopA = it.loopA || null;
          o.loopB = it.loopB || null;
        }
        return o;
      })
    };
    var d = new Date(), pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var name = "qn-youtube-library_" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    setStatus(refs.bkStatus, sel.length + "件をダウンロードしました", "success");
  }

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
        var a = cleanStr(r.loopA, 40), b = cleanStr(r.loopB, 40);
        o.loopA = ids[a] ? a : null;
        o.loopB = ids[b] && b !== a ? b : null;
      }
      out.push(o);
    });
    return out;
  }

  function resetImportView() {
    if (!root) return;
    imData = null; imChoices = {};
    refs.imDrop.style.display = "";
    refs.imLoaded.style.display = "none";
    refs.imDupList.style.display = "none";
    refs.imBack.style.display = "none";
    refs.imRun.disabled = true;
    refs.imFile.value = "";
    setStatus(refs.imStatus, "");
  }

  function loadImportFile(file) {
    if (!file) return;
    file.text().then(function (text) {
      var raw;
      try { raw = JSON.parse(text); } catch (e) { setStatus(refs.imStatus, "JSONとして読み込めませんでした", "error"); return; }
      var list = normalizeImport(raw);
      if (!list || !list.length) { setStatus(refs.imStatus, "取り込める動画が見つかりませんでした", "error"); return; }
      imData = list;
      imChoices = {};
      refs.imName.textContent = file.name;
      var dups = list.filter(function (x) { return findItemByVideoId(x.videoId); });
      refs.imCount.textContent = list.length + "件（新規 " + (list.length - dups.length) + " / 重複 " + dups.length + "）";
      refs.imDrop.style.display = "none";
      refs.imLoaded.style.display = "";
      refs.imBack.style.display = "";
      refs.imRun.disabled = false;
      setStatus(refs.imStatus, "");
      renderDuplicates(dups);
    }).catch(function () { setStatus(refs.imStatus, "ファイルを読み込めませんでした", "error"); });
  }

  function applyChoiceUi(toggle, label, overwrite) {
    label.textContent = overwrite ? "上書き" : "スキップ";
    label.classList.toggle("is-skip", !overwrite);
    toggle.setAttribute("aria-checked", String(overwrite));
    toggle.title = overwrite ? "スキップに切り替え" : "上書きに切り替え";
  }

  function renderDuplicates(dups) {
    refs.imDupRows.textContent = "";
    refs.imDupList.style.display = dups.length ? "" : "none";
    dups.forEach(function (x) {
      imChoices[x.videoId] = "overwrite";
      var existing = findItemByVideoId(x.videoId);
      var row = document.createElement("div");
      row.className = "track-import-duplicate-row";
      var nm = document.createElement("span");
      nm.className = "track-import-duplicate-name";
      nm.textContent = x.title || (existing && existing.title) || x.videoId;
      var wrap = document.createElement("div");
      wrap.className = "track-import-choice-wrap";
      var label = document.createElement("span");
      label.className = "track-import-choice-label";
      var tg = document.createElement("button");
      tg.type = "button"; tg.className = "glow-switch track-import-choice-switch";
      tg.setAttribute("role", "switch");
      tg.innerHTML = '<span class="glow-switch-knob"></span>';
      tg.dataset.vid = x.videoId;
      applyChoiceUi(tg, label, true);
      tg.addEventListener("click", function () {
        var ow = tg.getAttribute("aria-checked") !== "true";
        imChoices[x.videoId] = ow ? "overwrite" : "skip";
        applyChoiceUi(tg, label, ow);
      });
      wrap.appendChild(label); wrap.appendChild(tg);
      row.appendChild(nm); row.appendChild(wrap);
      refs.imDupRows.appendChild(row);
    });
    applyChoiceUi(refs.imBulk, refs.imBulkLabel, true);
  }

  function setAllChoices(overwrite) {
    var tgs = refs.imDupRows.querySelectorAll(".track-import-choice-switch");
    for (var i = 0; i < tgs.length; i++) {
      imChoices[tgs[i].dataset.vid] = overwrite ? "overwrite" : "skip";
      applyChoiceUi(tgs[i], tgs[i].previousElementSibling, overwrite);
    }
    applyChoiceUi(refs.imBulk, refs.imBulkLabel, overwrite);
  }

  function runImport() {
    if (!imData) return;
    var added = 0, over = 0, skipped = 0;
    imData.forEach(function (x) {
      var ex = findItemByVideoId(x.videoId);
      if (ex) {
        if (imChoices[x.videoId] === "skip") { skipped++; return; }
        if (x.title) ex.title = x.title;
        ex.url = x.url;
        if (x.markers) {
          ex.markers = x.markers; ex.loopA = x.loopA; ex.loopB = x.loopB;
          // 今開いている動画なら、画面側の状態も差し替える
          if (current && current.itemId === ex.id) {
            current.markers = ex.markers; current.loopA = ex.loopA; current.loopB = ex.loopB; current.looping = false;
          }
        }
        over++;
      } else {
        items.push({
          id: uid("item"), type: "youtube", videoId: x.videoId, url: x.url,
          title: x.title || "(無題)", markers: x.markers || [],
          loopA: x.loopA || null, loopB: x.loopB || null, createdAt: Date.now()
        });
        added++;
      }
    });
    saveItems();
    renderList();
    renderMarkers();
    var msg = "インポート完了：新規 " + added + " / 上書き " + over + (skipped ? " / スキップ " + skipped : "");
    resetImportView();
    setStatus(refs.imStatus, msg, "success");
  }

  function bindBackupImport() {
    refs.bkAll.addEventListener("click", function () {
      items.forEach(function (it) { bkSelected[it.id] = true; }); renderBackupList();
    });
    refs.bkNone.addEventListener("click", function () {
      items.forEach(function (it) { bkSelected[it.id] = false; }); renderBackupList();
    });
    refs.bkRun.addEventListener("click", downloadBackup);

    refs.imDrop.addEventListener("click", function () { refs.imFile.click(); });
    refs.imFile.addEventListener("click", function (e) { e.stopPropagation(); });
    refs.imFile.addEventListener("change", function () { loadImportFile(refs.imFile.files[0]); });
    refs.imDrop.addEventListener("dragover", function (e) {
      e.preventDefault(); e.stopPropagation(); refs.imDrop.classList.add("dragover");
    });
    refs.imDrop.addEventListener("dragleave", function () { refs.imDrop.classList.remove("dragover"); });
    refs.imDrop.addEventListener("drop", function (e) {
      e.preventDefault(); e.stopPropagation();
      refs.imDrop.classList.remove("dragover");
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadImportFile(f);
    });
    refs.imBack.addEventListener("click", resetImportView);
    refs.imRun.addEventListener("click", runImport);
    refs.imBulk.addEventListener("click", function () {
      setAllChoices(refs.imBulk.getAttribute("aria-checked") !== "true");
    });
  }

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
    refs.playBtn.innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
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

  function onSpaceKey(e) {
    if (e.code !== "Space" && e.key !== " ") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
    if (!player || !playerReady || typeof player.getPlayerState !== "function") return;
    e.preventDefault(); // ページのスクロール／フォーカス中ボタンの誤クリックを防ぐ
    if (e.type === "keyup" || e.repeat) return;
    togglePlay();
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
    // 非表示中はoffsetTopが0になりマーカー位置がずれるので、表示のたびに描き直す
    renderMarkers();
    updateDisplay(currentPos());
    if (!pollTimer) pollTimer = setInterval(poll, 250);
  }

  function onHide() {
    bindSpace(false);
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
