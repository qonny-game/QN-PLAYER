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
// 【規約遵守ルール（最優先・破らない）】 詳細は md/YT_PROTOTYPE_SPEC.md
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
                '<button type="button" data-yt="loadBtn" class="qn-yt-btn primary">Load</button>' +
              '</div>' +
              '<div class="qn-yt-row">' +
                '<input data-yt="titleInput" class="qn-yt-input" type="text" placeholder="Title (type it yourself)" autocomplete="off">' +
                '<button type="button" data-yt="saveBtn" class="qn-yt-btn">Save</button>' +
              '</div>' +
              '<div class="qn-yt-message" data-yt="message" role="status"></div>' +
            '</div>' +
            '<ul class="qn-yt-list" data-yt="itemList"></ul>' +
            '<p class="qn-yt-empty" data-yt="emptyList">まだ保存されていません</p>' +
          '</section>' +
          '<section class="qn-yt-sec qn-yt-sec-markers">' +
            '<div class="qn-yt-sec-head"><h3>Markers</h3><span class="qn-yt-count" data-yt="markerCount">0</span></div>' +
            '<ul class="qn-yt-list qn-yt-marker-list" data-yt="markerList"></ul>' +
            '<p class="qn-yt-empty" data-yt="emptyMarkers">マーカーはありません</p>' +
          '</section>' +
        '</div>' +
      '</aside>' +
      '<section class="qn-yt-stage">' +
        // プレイヤーは標準コントロールのまま表示。上には何も重ねない（規約）
        '<div class="qn-yt-player-wrap"><div id="qnYtPlayer"></div></div>' +
        // ここから下はプレイヤーの外(余白あり)
        '<div class="qn-yt-custom">' +
          '<p class="qn-yt-fetched-title" data-yt="fetchedTitle"></p>' +
          '<div class="qn-yt-time"><span data-yt="curTime">00:00</span><span class="sep">/</span><span data-yt="durTime">00:00</span></div>' +
          '<div class="qn-yt-seek" data-yt="seekTracks"><div class="qn-yt-marker-layer" data-yt="markerLayer"></div></div>' +
          '<div class="qn-yt-ctrl-row">' +
            '<button type="button" data-yt="skipBackBtn" class="qn-yt-btn">◀◀ 10s</button>' +
            '<button type="button" data-yt="addMarkerBtn" class="qn-yt-btn primary">+ Marker</button>' +
            '<button type="button" data-yt="skipFwdBtn" class="qn-yt-btn">10s ▶▶</button>' +
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
    { id: "markers", label: "Markers", icon: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>' }
  ];
  var panelState = null; // "library" | "markers" | "none"(SPのみ)

  function isSp() { return window.matchMedia("(max-width: 900px)").matches; }

  function setPanel(id) {
    if (!isSp() && id === "none") id = "library";
    panelState = id;
    if (!root) return;
    var yt = root.querySelector(".qn-yt");
    yt.setAttribute("data-panel", id);
    updatePanelTitle();
    if (window.QNApps) window.QNApps.setSideActive(id === "none" ? null : id);
  }

  // パネル見出し：本体のパネル同様「LIBRARY」「MARKERS」＋件数
  function updatePanelTitle() {
    if (!root || !panelState || panelState === "none") return;
    var isM = panelState === "markers";
    refs.panelTitle.textContent = (isM ? "Markers " : "Library ") +
      (isM ? (current ? current.markers.length : 0) : items.length);
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
      track.className = "qn-yt-track";
      var fill = document.createElement("div"); fill.className = "qn-yt-fill";
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
    el.style.left = segPct(i, t) + "%";
    el.style.top = (tracks[i].offsetTop - 16) + "px";
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
        },
        onStateChange: function () { refreshDuration(); },
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
    refs.loadBtn.addEventListener("click", function () {
      var id = parseVideoId(refs.urlInput.value);
      if (!id) { showMessage("YouTubeのURLとして認識できません"); return; }
      openVideo(id, refs.urlInput.value.trim(), null);
      closePanelOnSp();
    });
    refs.urlInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); refs.loadBtn.click(); }
    });

    refs.saveBtn.addEventListener("click", function () {
      if (!current) { showMessage("先に動画を読み込んでください"); return; }
      var title = refs.titleInput.value.trim() || "(無題)"; // タイトルは常に手入力
      var item = current.itemId ? findItem(current.itemId) : null;
      if (item) {
        item.title = title;
        item.url = current.url;
        item.loopA = current.loopA;
        item.loopB = current.loopB;
      } else {
        item = {
          id: uid("item"), type: "youtube", videoId: current.videoId, url: current.url,
          title: title, markers: current.markers,
          loopA: current.loopA, loopB: current.loopB,
          createdAt: Date.now()
        };
        items.push(item);
        current.itemId = item.id;
      }
      saveItems();
      renderList();
      showMessage("リストに保存しました", true);
    });

    refs.addMarkerBtn.addEventListener("click", function () {
      if (!current || !playerReady) { showMessage("先に動画を読み込んでください"); return; }
      var t = Math.round(clampTime(currentPos()) * 10) / 10;
      current.markers.push({ id: uid("m"), time: t, label: "" });
      sortMarkers();
      persistMarkers();
      renderMarkers();
    });

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
    refs.loopClearBtn.addEventListener("click", function () {
      if (!current) return;
      current.loopA = null; current.loopB = null; current.looping = false;
      persistLoop();
      renderMarkers();
    });
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

  function renderList() {
    refs.itemList.textContent = "";
    refs.emptyList.style.display = items.length ? "none" : "";
    refs.listCount.textContent = String(items.length);
    updatePanelTitle();
    items.forEach(function (it) {
      var li = document.createElement("li");
      if (current && current.itemId === it.id) li.className = "active";
      var t = document.createElement("span");
      t.className = "title"; t.textContent = it.title; t.title = it.title;
      t.addEventListener("click", function () {
        refs.urlInput.value = it.url;
        openVideo(it.videoId, it.url, it.id, { play: true }); // クリック起点なので再生開始OK
        closePanelOnSp();
      });
      var edit = document.createElement("button");
      edit.type = "button"; edit.className = "qn-yt-btn mini"; edit.textContent = "Edit";
      edit.addEventListener("click", function () { startInlineEdit(it, t, edit); });
      var del = document.createElement("button");
      del.type = "button"; del.className = "qn-yt-btn mini"; del.textContent = "Del";
      armDelete(del, function () {
        items = items.filter(function (x) { return x.id !== it.id; });
        if (current && current.itemId === it.id) current.itemId = null;
        saveItems(); renderList();
      });
      li.appendChild(t); li.appendChild(edit); li.appendChild(del);
      refs.itemList.appendChild(li);
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

  function renderMarkers() {
    if (!root) return;
    refs.markerLayer.textContent = "";
    refs.markerList.textContent = "";
    var ms = current ? current.markers : [];
    refs.emptyMarkers.style.display = ms.length ? "none" : "";
    refs.markerCount.textContent = String(ms.length);
    updatePanelTitle();

    ms.forEach(function (m) {
      // シークバー上のマーカー(クリックでジャンプ / ドラッグで移動)
      var el = document.createElement("div");
      el.className = "qn-yt-marker";
      el.title = fmt(m.time) + " " + (m.label || "");
      positionMarker(el, m.time);
      attachMarkerDrag(el, m);
      refs.markerLayer.appendChild(el);

      // 一覧(上段: 時間 / A / B / 上書き / 削除、下段: ラベル)
      var li = document.createElement("li");
      var tm = document.createElement("span");
      tm.className = "mtime"; tm.textContent = fmt(m.time);
      tm.addEventListener("click", function () { seekTo(m.time); });
      var lab = document.createElement("input");
      lab.type = "text"; lab.className = "qn-yt-input mlabel"; lab.value = m.label; lab.placeholder = "Label";
      lab.addEventListener("change", function () {
        m.label = lab.value; persistMarkers(); el.title = fmt(m.time) + " " + m.label;
      });
      var abtnA = document.createElement("button");
      abtnA.type = "button";
      abtnA.className = "qn-yt-btn mini ab" + (current.loopA === m.id ? " active-a" : "");
      abtnA.textContent = "A";
      abtnA.title = "ABループのA点(開始)に設定";
      abtnA.addEventListener("click", function () { toggleLoopPoint("A", m.id); });
      var abtnB = document.createElement("button");
      abtnB.type = "button";
      abtnB.className = "qn-yt-btn mini ab" + (current.loopB === m.id ? " active-b" : "");
      abtnB.textContent = "B";
      abtnB.title = "ABループのB点(終了)に設定";
      abtnB.addEventListener("click", function () { toggleLoopPoint("B", m.id); });
      var ow = document.createElement("button");
      ow.type = "button"; ow.className = "qn-yt-btn mini"; ow.textContent = "Set";
      ow.title = "現在位置でこのマーカーを上書き";
      ow.addEventListener("click", function () {
        m.time = Math.round(clampTime(currentPos()) * 10) / 10;
        sortMarkers(); persistMarkers(); renderMarkers();
      });
      var del = document.createElement("button");
      del.type = "button"; del.className = "qn-yt-btn mini"; del.textContent = "Del";
      armDelete(del, function () {
        current.markers.splice(current.markers.indexOf(m), 1);
        if (current.loopA === m.id) current.loopA = null;
        if (current.loopB === m.id) current.loopB = null;
        persistMarkers(); persistLoop(); renderMarkers();
      });
      var top = document.createElement("div");
      top.className = "mrow";
      top.appendChild(tm); top.appendChild(abtnA); top.appendChild(abtnB);
      top.appendChild(ow); top.appendChild(del);
      li.appendChild(top); li.appendChild(lab);
      refs.markerList.appendChild(li);
    });

    updateLoopUI();
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

  function onShow() {
    // 初回はPC=Library表示、SP=パネルなし。2回目以降は前回の状態を保つ
    var want = panelState || (isSp() ? "none" : "library");
    setPanel(want);
    // 非表示中はoffsetTopが0になりマーカー位置がずれるので、表示のたびに描き直す
    renderMarkers();
    updateDisplay(currentPos());
    if (!pollTimer) pollTimer = setInterval(poll, 250);
  }

  function onHide() {
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
