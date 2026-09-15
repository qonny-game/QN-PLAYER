// ============================================================
// player-ui-pc-v2.js
// QNPLAYER 2.0 PC版：左アイコンバー＋中央パネル＋右波形の3カラムレイアウト
// （SP幅ではCSS側の@media(max-width:900px)で縦積み・オーバーレイパネルに
// 切り替える。DOM構造・JSロジックはPC/SP共通）。
//
// 【方針】
// 既存のDOM（#pinList, #playlistBox, #noteTextArea, Control系input,
// EQバンド、Exportモーダルの中身）はロジック側がidで参照しているため、
// 要素そのものは変更・複製せず、この骨組み(#pcV2Layout)の中へ「移動」する。
// 移動後も既存のイベントハンドラはDOM要素にひもづいたまま動き続ける。
//
// 画面幅を問わず常時有効化する（大手術以前は901px以上のみだった）。
//
// 依存：player-core.js, player-ui-shared.js, player-control-eq.js, player-export.js
// より後に読み込むこと（setMobileTab, openEqModal, openExportModal等の
// 既存関数を呼び出すため）。
//
// 【統合済み】旧player-ui-pc.js（ファイル分割整理により統合）の内容は
// ファイル末尾に残している：ドラッグ&ドロップでのファイル追加、および
// #topControlsのPC幅レイアウト用flattenForPc/restoreForSp（このファイルの
// build()が「先にフラット化された#topControls」を前提とする土台処理）。
// ============================================================

(function () {
  // 【大手術】以前は"(min-width: 901px)"でPC幅のみ有効化していたが、
  // SP幅でもPC v2の構造をそのまま使う（レイアウトはCSSの@media(max-width:900px)
  // 側で縦積み・オーバーレイパネルに切り替える）方針に転換したため、
  // 画面幅を問わず常時有効化する。"(min-width: 0px)"は常にtrueになる
  // matchMediaで、将来また幅で分岐させたくなった場合に変更しやすいよう
  // 定数として残している。
  const PC_BREAKPOINT = "(min-width: 0px)";
  const mql = window.matchMedia(PC_BREAKPOINT);

  let built = false;
  let currentPanel = "playlist";
  // 下段バーのSpeed/Key/EQトグルボタン要素への参照。Controlパネル側の
  // トグルスイッチ(controlSpeedEnableToggle等)が直接操作された時にも
  // 見た目を同期させるため、build()内で生成した時点でここに保持する。
  const bottomBarEffectButtons = {};

  // アイコンバーに並べる項目。「Control」はSpeed/Key/EQを統合したパネル。
  // panelType: "tab" = 既存の.mobile-tab-panel(#sidebarSection内)をそのまま表示
  //            "eq"  = EQモーダルの中身(.export-modal-body)を表示
  //            "export" = Exportモーダルの中身(.export-modal-body)を表示
  //            "action" = パネルを開かず即座にアクションを実行（Add File）
  const ICON_ITEMS = [
    {
      id: "control",
      label: "Control",
      panelType: "tab",
      tabName: "control",
      icon: '<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>'
    },
    {
      id: "markers",
      label: "Markers",
      panelType: "tab",
      tabName: "markers",
      icon: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>'
    },
    {
      id: "playlist",
      label: "Library",
      panelType: "tab",
      tabName: "playlist",
      icon: '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>'
    },
    {
      id: "text",
      label: "Text",
      panelType: "tab",
      tabName: "text",
      icon: '<path d="M5 4v3h5.5v12h3V7H19V4z"/>'
    },
    {
      id: "export",
      label: "Export",
      panelType: "export",
      icon: '<path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM13 12.67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>'
    },
    {
      id: "addfile",
      label: "Add File",
      panelType: "action",
      icon: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>'
    }
  ];


  function el(html) {
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstChild;
  }

  function build() {
    if (built) return;
    built = true;

    const appContainer = document.querySelector(".app-container");
    if (!appContainer) { built = false; return; }

    // --- 骨組みDOMを作成（既存要素はまだ動かさず、器だけ用意する） ---
    const layout = el('<div id="pcV2Layout"></div>');
    const iconBar = el('<div id="pcV2IconBar"></div>');
    const panel = el('<div id="pcV2Panel"></div>');
    const panelHeader = el('<div id="pcV2PanelHeader"></div>');
    const panelBody = el('<div id="pcV2PanelBody"></div>');
    const waveArea = el('<div id="pcV2WaveArea"></div>');

    panel.appendChild(panelHeader);
    panel.appendChild(panelBody);

    ICON_ITEMS.forEach(item => {
      const btn = el(
        '<button type="button" class="pcv2-icon-item" data-panel-id="' + item.id + '" title="' + item.label + '">' +
          '<svg viewBox="0 0 24 24">' + item.icon + '</svg>' +
          '<span>' + item.label + '</span>' +
        '</button>'
      );
      btn.addEventListener("click", () => handleIconClick(item));
      iconBar.appendChild(btn);
    });

    // アイコンバー下段：Keyboard Shortcuts / Color Theme
    // 既存のQNシリーズ共通ハンバーガーメニュー(qn-menu.js/html)のTheme/
    // Shortcutsセクションを、パネルとして中央カラムに表示する
    // （qn-menu.js自体のロジック・DOM構造には手を入れず、該当セクションを
    // DOMごと移動して表示するだけ）。
    const spacer = el('<div id="pcV2IconBarSpacer"></div>');
    const bottomGroup = el('<div id="pcV2IconBarBottom"></div>');
    [
      { id: "keyboard", label: "Keyboard", icon: '<path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM11 8h2v2h-2V8zM11 11h2v2h-2v-2zM8 8h2v2H8V8zM8 11h2v2H8v-2zM5 8h2v2H5V8zm0 3h2v2H5v-2zm10 6H9v-2h6v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>' },
      { id: "color", label: "Color", icon: '<path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.09-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>' }
    ].forEach(entry => {
      const btn = el(
        '<button type="button" class="pcv2-icon-item" data-panel-id="' + entry.id + '" title="' + entry.label + '">' +
          '<svg viewBox="0 0 24 24">' + entry.icon + '</svg>' +
          '<span>' + entry.label + '</span>' +
        '</button>'
      );
      btn.addEventListener("click", () => openPanelOverlay(entry.id));
      bottomGroup.appendChild(btn);
    });
    iconBar.appendChild(spacer);
    iconBar.appendChild(bottomGroup);

    layout.appendChild(iconBar);
    layout.appendChild(panel);
    layout.appendChild(waveArea);

    // --- ヘッダーにQN Seriesドロップダウンを追加（モック準拠）。
    // 既存のqn-menu.js（ハンバーガーメニュー）のナビゲーションリンクと
    // 同じ行き先を独自に持つ簡易ドロップダウンで、qn-menu.js自体には
    // 手を入れない。ロゴの右に▼のみ配置し、押すとロゴの真下にロゴと
    // 同じ大きさで他のQNシリーズアプリ名が縦一列に並び（ページの
    // ロゴと展開後のロゴが縦に揃うように）、アプリ名の右に機能説明を
    // 表示する（QN Seriesへの遷移をこのドロップダウンに一本化する
    // イメージ）。appVersion(v2.0.7等)は▼ボタンの右に表示する。
    const appHeader = document.getElementById("appHeader");
    const appVersion = document.getElementById("appVersion");
    if (appHeader && !document.getElementById("pcV2HeaderNav")) {
      const apps = [
        { name: "QNPLAYER", desc: "Speed/Key変更＆マーカー付き音楽プレイヤー", url: "https://qonny-game.github.io/QN-PLAYER/", current: true },
        { name: "QNPITCH", desc: "リアルタイム音痴度チェッカー", url: "https://qonny-game.github.io/QN-PITCH/" },
        { name: "QNPHRASE", desc: "ギターフレーズ自動生成", url: "https://qonny-game.github.io/QN-PHRASE" },
        { name: "QNTEMPO", desc: "メトロノーム", url: "https://qonny-game.github.io/QN-TEMPO/" },
        { name: "QNTUNER", desc: "マイク入力チューナー", url: "https://qonny-game.github.io/QN-TUNER/" }
      ];
      const nav = el(
        '<div id="pcV2HeaderNav">' +
          '<button type="button" class="pcv2-header-nav-trigger" id="pcV2HeaderNavTrigger" title="QN Series">' +
            '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>' +
          '</button>' +
          '<div class="pcv2-header-nav-dropdown"></div>' +
        '</div>'
      );
      const trigger = nav.querySelector(".pcv2-header-nav-trigger");
      if (appVersion) {
        markAnchor("appVersion", appVersion);
        trigger.insertAdjacentElement("afterend", appVersion);
      }
      const dropdown = nav.querySelector(".pcv2-header-nav-dropdown");
      apps.forEach(app => {
        const link = el(
          '<a class="pcv2-header-nav-link' + (app.current ? ' current' : '') + '" href="' + app.url + '" target="_blank" rel="noopener">' +
            '<span class="pcv2-header-nav-link-name">' + app.name + '</span>' +
            '<span class="pcv2-header-nav-link-desc">' + app.desc + '</span>' +
          '</a>'
        );
        dropdown.appendChild(link);
      });
      appHeader.appendChild(nav);
      const dropdownEl = nav.querySelector(".pcv2-header-nav-dropdown");
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !nav.classList.contains("open");
        nav.classList.toggle("open", willOpen);
        if (willOpen) {
          // 展開後のロゴ一覧が、ページ上部のロゴと縦に揃うよう、
          // ドロップダウンの左端をappLogoの左端に合わせる
          // （#pcV2HeaderNav自体はロゴの右にあるボタンのため、
          // その位置基準のleft:0のままではロゴより右にずれてしまう）。
          const logoEl = document.getElementById("appLogo");
          const navRect = nav.getBoundingClientRect();
          const logoRect = logoEl ? logoEl.getBoundingClientRect() : navRect;
          dropdownEl.style.left = (logoRect.left - navRect.left) + "px";
        }
      });
      document.addEventListener("click", () => nav.classList.remove("open"));
    }

    // --- 下段固定コントロールバー(モック準拠)を構築 ---
    // モックは「Start・Prev・Play・Next・Repeat」の5ボタンが1グループ、
    // 区切り線、「PrevMkr・+Marker・NextMkr・Loop」の4ボタンがもう1グループ、
    // という明確な2グループ構成。
    //
    // 既存の#topControlsは、player-ui-pc.js側がPC幅で
    // 「playbackTripleBtn(3連ボタン)→allRepeatToggleBtn→
    //   markerNavBtn(3連ボタン)→loopToggleBtn」の順に#topControls直下へ
    // フラット化する設計。SP幅に戻る際はplayer-ui-pc.js側のrestoreForSp()が
    // 「playbackTripleBtn+allRepeatToggleBtnを1段目、markerNavBtn+
    //  loopToggleBtnを2段目」という単位で.top-controls-rowへ戻す。
    //
    // この単位(playbackTripleBtn／markerNavBtnという3連ボタンのまとまり)を
    // 崩さずに保つことで、restoreForSp()との競合を避ける。そのため
    // .tripleNavBtnコンテナ自体は解体せず、そのままgroup1/group2に
    // 配置し、内部の.tripleNavBtn-divider(3連ボタン用の区切り線)だけを
    // CSSで非表示にして「独立ボタンが並んでいるように見せる」。
    // allRepeatToggleBtn/loopToggleBtnは単体ボタンなので、個別に
    // markAnchor/restoreAnchorで位置を管理する。
    const bottomBar = el('<div id="pcV2BottomBar"></div>');
    const topControls = document.getElementById("topControls");
    markAnchor("topControls", topControls);
    if (topControls) {
      // 注意：この時点でtopControls(と中のボタン等)はまだdocument本体に
      // 接続されていない中間状態のDOMツリーにいるため、
      // document.getElementById(...)では見つからない。必ずtopControls
      // 自身からのquerySelectorで取得すること。
      const playbackTripleBtn = topControls.querySelector("#playbackTripleBtn");
      const allRepeatToggleBtn = topControls.querySelector("#allRepeatToggleBtn");
      const markerNavBtn = topControls.querySelector("#markerNavBtn");
      const loopToggleBtn = topControls.querySelector("#loopToggleBtn");

      // allRepeatToggleBtn/loopToggleBtnの位置管理はplayer-ui-pc.js側の
      // restoreForSp()に完全に委ねる（PC v2側ではmarkAnchor/restoreAnchorを
      // 使わない）。理由：SP幅へ戻る際、player-ui-pc.js側のイベントリスナーが
      // 先に登録されているためrestoreForSp()が先に実行され、正しい
      // .top-controls-row(row1/row2)へ戻す。その後にPC v2側のdeactivate()が
      // 独自のrestoreAnchorで#topControls直下へ戻そうとすると、
      // restoreForSp()が済ませた配置を上書きしてしまい競合する。

      // Prev/NextのアイコンをSVGごとモック準拠（二枚羽根の早戻し/早送り）に
      // 差し替える。既存は「一枚羽根の前へ」アイコンのみのため。
      const prevTrackBtn = playbackTripleBtn ? playbackTripleBtn.querySelector("#prevTrackBtn") : null;
      const nextTrackBtn = playbackTripleBtn ? playbackTripleBtn.querySelector("#nextTrackBtn") : null;
      if (prevTrackBtn) {
        const svg = prevTrackBtn.querySelector("svg");
        if (svg && !svg.dataset.pcv2Swapped) {
          svg.dataset.pcv2OriginalHtml = svg.innerHTML;
          svg.innerHTML = '<path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>';
          svg.dataset.pcv2Swapped = "1";
        }
      }
      if (nextTrackBtn) {
        const svg = nextTrackBtn.querySelector("svg");
        if (svg && !svg.dataset.pcv2Swapped) {
          svg.dataset.pcv2OriginalHtml = svg.innerHTML;
          svg.innerHTML = '<path d="M13 6v12l8.5-6zm-.5 6L4 6v12z"/>';
          svg.dataset.pcv2Swapped = "1";
        }
      }

      // 新規：Start(頭出し)ボタン。モックには存在するが既存実装には
      // 対応する機能が無いため、player-playlist.jsのseekToTrackStart()を
      // 呼ぶボタンとして新設する。playbackTripleBtnの最初の子として
      // 差し込む（コンテナ自体は解体しないため、内部への追加になる）。
      const startBtn = el(
        '<button type="button" id="pcV2StartBtn" class="tripleNavBtn-third" title="Seek to Start (Enter)">' +
          '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>' +
          '<span class="top-controls-btn-label">Start</span>' +
        '</button>'
      );
      startBtn.addEventListener("click", () => {
        if (typeof seekToTrackStart === "function") seekToTrackStart();
      });
      if (playbackTripleBtn && playbackTripleBtn.firstChild) {
        playbackTripleBtn.insertBefore(startBtn, playbackTripleBtn.firstChild);
      }

      // allRepeatToggleBtn/loopToggleBtnは、playbackTripleBtn/markerNavBtnの
      // 「中」に子として組み込んでしまう。こうすることで、SP幅へ戻る際に
      // player-ui-pc.js側のrestoreForSp()が「row1.appendChild(playbackTripleBtn)」
      // を実行するだけで、中のallRepeatToggleBtnも自動的に一緒についてくる。
      // PC v2側で個別に位置を管理する必要がなくなり、responsForSp()との
      // 競合が起きない。
      if (playbackTripleBtn && allRepeatToggleBtn) {
        playbackTripleBtn.appendChild(allRepeatToggleBtn);
      }
      if (markerNavBtn && loopToggleBtn) {
        markerNavBtn.appendChild(loopToggleBtn);
      }

      // 各ボタンのtitle(ネイティブツールチップ)に対応するキーボード
      // ショートカットを追記する（window.QN_SHORTCUTSのaction文字列と
      // 照合して該当するkeyを見つける）。
      function appendShortcutToTitle(btn, actionLabel) {
        if (!btn || typeof window.QN_SHORTCUTS === "undefined") return;
        const found = window.QN_SHORTCUTS.find(s => s.action === actionLabel);
        if (found) btn.title = (btn.title || "").replace(/\s*\(.*\)$/, "") + " (" + found.key + ")";
      }
      appendShortcutToTitle(document.getElementById("playToggle"), "Play / Pause");
      appendShortcutToTitle(document.getElementById("addPinBtn"), "Add Marker");
      appendShortcutToTitle(loopToggleBtn, "Loop ON/OFF");
      appendShortcutToTitle(allRepeatToggleBtn, "Repeat");
      appendShortcutToTitle(document.getElementById("nextMarkerBtn"), "Next Marker");
      appendShortcutToTitle(document.getElementById("prevMarkerBtn"), "Prev Marker");

      // グループ1：playbackTripleBtn(Start・Prev・Play・Next・Repeat一式)
      const group1 = el('<div class="pcv2-ctrl-group"></div>');
      if (playbackTripleBtn) group1.appendChild(playbackTripleBtn);

      // 時刻表示(.time-controls-row、シークバー下から移設)をRepeatの
      // 右に配置する。要素自体(#timeDisplay等)はそのまま使い、
      // 見た目だけPC v2限定でコンパクトな表示に上書きする。
      const timeControlsRow = document.querySelector(".player-section > .time-controls-row");
      if (timeControlsRow) {
        markAnchor("timeControlsRow0", timeControlsRow);
        group1.appendChild(timeControlsRow);
      }

      // グループ2：markerNavBtn(Prev Mkr・+Marker・Next Mkr・Loop一式)
      const group2 = el('<div class="pcv2-ctrl-group"></div>');
      if (markerNavBtn) group2.appendChild(markerNavBtn);

      const divider = el('<div class="pcv2-ctrl-divider"></div>');

      // 元の.top-controls-row(2つ)自体は器として残っているが中身は
      // 空になっている（ボタンは全てgroup1/group2へ移動済み）ため、
      // 非表示にしてPC v2の新しい構造(group1・divider・group2)を
      // #topControls直下に追加する。
      Array.from(topControls.querySelectorAll(".top-controls-row")).forEach(row => {
        row.style.display = "none";
      });
      topControls.appendChild(group1);
      topControls.appendChild(divider);
      topControls.appendChild(group2);

      bottomBar.appendChild(topControls);
    }

    const rightGroup = el('<div class="pcv2-ctrl-group"></div>');
    // Volume（新規：ポップアップ式の縦スライダー。既存にPC向けVolume UIが
    // 無かったため、controlVolume(#controlVolumeスライダー、Controlパネル内)
    // の値を操作する簡易UIとして新設する）
    const volumeBtn = el(
      '<button type="button" class="pcv2-ctrl-btn" id="pcV2VolumeBtn" style="position:relative;" title="Volume">' +
        '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>' +
        '<span>Volume</span>' +
        '<div class="pcv2-volume-popup" id="pcV2VolumePopup">' +
          '<div class="pcv2-volume-slider-track"><div class="pcv2-volume-slider-fill" id="pcV2VolumeFill"></div><div class="pcv2-volume-slider-thumb" id="pcV2VolumeThumb"></div></div>' +
          '<div class="pcv2-volume-popup-icon"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></div>' +
        '</div>' +
      '</button>'
    );
    rightGroup.appendChild(volumeBtn);

    [
      { id: "speed", label: "Speed", icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 12L15.5 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="1.4"/>' },
      { id: "key", label: "Key", icon: '<path d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15z"/>' },
      { id: "eq", label: "EQ", icon: '<path d="M3 6h11M17 6h4M3 12h5M9 12h12M3 18h14M20 18h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="14" cy="6" r="2.2"/><circle cx="7" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>' }
    ].forEach(entry => {
      const btn = el(
        '<button type="button" class="pcv2-ctrl-btn" id="pcV2Bottom' + entry.id.charAt(0).toUpperCase() + entry.id.slice(1) + 'Toggle" title="' + entry.label + ' ON/OFF (click to toggle, long-press or right-click to open Control panel)">' +
          '<svg viewBox="0 0 24 24">' + entry.icon + '</svg>' +
          '<span>' + entry.label + '</span>' +
        '</button>'
      );
      // クリック：対応するエフェクトのON/OFFをトグルし、既存の
      // controlXxxEnableToggle(Controlパネル内のトグルスイッチ)とも
      // 状態を同期する。右クリック(コンテキストメニュー抑制)でControl
      // パネルを開く（従来のショートカット機能も残す）。
      btn.addEventListener("click", () => {
        toggleBottomBarEffect(entry.id, btn);
      });
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        switchPanel("control");
      });
      rightGroup.appendChild(btn);
      bottomBarEffectButtons[entry.id] = btn;
      syncBottomBarEffectButton(entry.id, btn);
    });

    // Controlパネル内のトグルスイッチ(controlSpeedEnableToggle等)が
    // 直接クリックされた場合にも下段バーの見た目を追従させる。
    // player-controls.js/player-control-eq.js側のonclickは自分のaria-checked
    // 更新のみでこちらへ通知してくれないため、ここで別途capture段階の
    // クリックリスナーを重ねて拾う（既存のonclick処理は妨げない）。
    setupControlPanelEffectSync();

    bottomBar.appendChild(el('<div class="pcv2-ctrl-spacer"></div>'));
    bottomBar.appendChild(rightGroup);

    // --- pcV2Root：3カラム部分(layout)と下段バー(bottomBar)を縦に積む ---
    const root = el('<div id="pcV2Root"></div>');
    root.appendChild(layout);
    root.appendChild(bottomBar);

    // 既存の.app-container(#appHeaderの後)の直後にPC v2骨組みを挿入
    appContainer.parentNode.insertBefore(root, appContainer.nextSibling);

    // 【SP幅レイアウト】#pcV2BottomBar(再生コントロール)と#pcV2IconBar
    // (Control/Markers等のタブ)は、PC幅では#pcV2Root直下に「layout→
    // bottomBar」の順で兄弟として並んでいるが、SP幅では「アイコンバーが
    // 一番下、その上にコントロールバー」という順序にしたい。
    // #pcV2BottomBarは#pcV2Layoutの外（#pcV2Rootの子）、#pcV2IconBarは
    // #pcV2Layoutの中（波形エリアの下）という別々の階層にあるため、
    // CSSのorderだけでは実現できず、ここでJSが実際にDOM上の位置を
    // 動かす。PC幅に戻った時は元の位置（#pcV2Root直下、layoutの後）へ
    // 戻す。
    syncBottomBarPosition();
    window.addEventListener("resize", syncBottomBarPosition);

    // --- 波形エリア(#vbarContainer)をplayer-sectionから右カラムへ移動 ---
    // 時刻表示(.time-controls-row)は波形の下ではなく、下段バーの
    // Repeatボタンの右に移設するため、ここでは含めない
    // （build()の後半、下段バー構築時に別途処理する）。
    const appTitle = document.getElementById("appTitle");
    const vbarContainer = document.getElementById("vbarContainer");

    markAnchor("appTitle", appTitle);
    markAnchor("vbarContainer", vbarContainer);

    [appTitle, vbarContainer].forEach(elmt => {
      if (elmt) waveArea.appendChild(elmt);
    });

    // basic-panel-box（Exportボタン等、旧UI）はPC v2では使わないため隠す
    // （fileInput自体は中に残っているので参照は生き続ける）
    const basicPanelBox = document.querySelector(".basic-panel-box");
    if (basicPanelBox) basicPanelBox.style.display = "none";

    // sp-status-panelはSP専用表示なのでPC v2では触らず放置してよい
    // （style-core-pc.css側で元々PC幅では非表示になっている）

    // Volumeポップアップの開閉・スライダー操作（controlVolumeの値と同期）
    setupVolumeControl();

    initPanels();
    switchPanel("playlist");
  }

  // #pcV2VolumeBtn/#pcV2VolumePopupの開閉と、既存のControlパネル内
  // #controlVolume(range input)への値の反映を行う。#controlVolumeの
  // onchange/oninput既存ロジック(player-controls.js側)をそのまま使うため、
  // ここではその値を書き換えてinputイベントを発火させるだけに留める。
  function setupVolumeControl() {
    const btn = document.getElementById("pcV2VolumeBtn");
    const popup = document.getElementById("pcV2VolumePopup");
    const track = popup ? popup.querySelector(".pcv2-volume-slider-track") : null;
    const fill = document.getElementById("pcV2VolumeFill");
    const thumb = document.getElementById("pcV2VolumeThumb");
    if (!btn || !popup || !track) return;

    function applyVisual(ratio) {
      const pct = Math.max(0, Math.min(1, ratio)) * 100;
      if (fill) fill.style.height = pct + "%";
      if (thumb) thumb.style.bottom = pct + "%";
    }

    // 既存のcontrolVolume(0〜1)の現在値を初期表示に反映
    const controlVolumeEl = document.getElementById("controlVolume");
    applyVisual(controlVolumeEl ? parseFloat(controlVolumeEl.value) : (typeof audio !== "undefined" ? audio.volume : 0.8));

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      popup.classList.toggle("open");
    });
    document.addEventListener("click", () => popup.classList.remove("open"));
    popup.addEventListener("click", (e) => e.stopPropagation());

    function setFromClientY(clientY) {
      const rect = track.getBoundingClientRect();
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      applyVisual(ratio);
      if (typeof audio !== "undefined") audio.volume = ratio;
      if (controlVolumeEl) {
        controlVolumeEl.value = ratio;
        controlVolumeEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    track.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      setFromClientY(e.clientY);
      function move(ev) { setFromClientY(ev.clientY); }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  // 各パネル種別の中身要素への参照を保持
  let controlBody, markersBody, playlistBody, textBody, eqBody, exportBody, exportFooter;

  function initPanels() {
    // #sidebarSection内の各mobile-tab-panelはそのまま(親のsidebarSectionごと)
    // 移動はせず、CSS側で#pcV2PanelBody内に「後から挿入したときだけ」見た目を
    // 常時表示にする。ここでは実体を#pcV2PanelBodyへ移動する。
    controlBody = document.querySelector('.mobile-tab-panel[data-tab-panel="control"]');
    markersBody = document.querySelector('.mobile-tab-panel[data-tab-panel="markers"]');
    playlistBody = document.querySelector('.mobile-tab-panel[data-tab-panel="playlist"]');
    textBody = document.querySelector('.mobile-tab-panel[data-tab-panel="text"]');

    const eqModal = document.getElementById("eqModalOverlay");
    eqBody = eqModal ? eqModal.querySelector(".export-modal-body") : null;

    const exportModal = document.getElementById("exportModalOverlay");
    exportBody = exportModal ? exportModal.querySelector(".export-modal-body") : null;
    // フッター(Cancel/Exportボタン)は.export-modal-bodyの外(.export-modal直下の
    // 兄弟要素)にあるため、別途取得して一緒にパネルへ移動する対象に含める。
    exportFooter = exportModal ? exportModal.querySelector(".export-modal-footer") : null;

    // SP幅へ戻った時に正しい位置へ差し戻せるよう、まだ元の親にいる
    // うちに目印を残しておく（この時点では実際の移動はまだ行わない）。
    markAnchor("control", controlBody);
    markAnchor("markers", markersBody);
    markAnchor("playlist", playlistBody);
    markAnchor("text", textBody);
    markAnchor("eq", eqBody);
    markAnchor("export", exportBody);
    markAnchor("exportFooter", exportFooter);

    // Textパネルのフルスクリーンボタン(#noteTextFullscreenBtn)は元々
    // .markers-heading-row(PC v2では非表示)の中にあり、そのままではPC v2
    // から押せない。#pcV2PanelHeaderは切り替えのたびにinnerHTML=""で
    // クリアされ子要素ごと破棄されてしまうため、document.body直下の
    // 非表示保持コンテナに一旦退避し、Textパネル表示のたびにそこから
    // 取り出して使う（実体は1つのまま、行き来させるだけ）。
    // 文字サイズ+/-ボタン(#noteTextFontDecBtn/IncBtn)は
    // #textFullscreenOverlay内にあり、フルスクリーン表示時の
    // #noteTextAreaFullscreenの文字サイズにしか効かない機能
    // (player-text.js側の設計)のため、これらは移動せずそのまま
    // フルスクリーンオーバーレイ側に残す。
    const fullscreenBtn = document.getElementById("noteTextFullscreenBtn");
    markAnchor("textFullscreenBtn", fullscreenBtn);
    let holder = document.getElementById("pcV2TextControlsHolder");
    if (!holder) {
      holder = el('<div id="pcV2TextControlsHolder" style="display:none;"></div>');
      document.body.appendChild(holder);
    }
    if (fullscreenBtn) holder.appendChild(fullscreenBtn);
  }

  // 【SP幅レイアウト】#pcV2BottomBar（再生コントロール）を、SP幅では
  // #pcV2Layout内・#pcV2IconBarの直前（つまり画面上はアイコンバーの
  // すぐ上）へ移動し、PC幅では元の位置（#pcV2Root直下、#pcV2Layoutの後）
  // へ戻す。build()の初回実行時、およびresizeでブレークポイントを
  // またいだ時に呼ばれる。
  function syncBottomBarPosition() {
    const bottomBar = document.getElementById("pcV2BottomBar");
    const layoutEl = document.getElementById("pcV2Layout");
    const iconBar = document.getElementById("pcV2IconBar");
    const rootEl = document.getElementById("pcV2Root");
    if (!bottomBar || !layoutEl || !iconBar || !rootEl) return;

    const isSpWidth = window.matchMedia("(max-width: 900px)").matches;
    if (isSpWidth) {
      if (bottomBar.nextSibling !== iconBar || bottomBar.parentElement !== layoutEl) {
        layoutEl.insertBefore(bottomBar, iconBar);
      }
    } else {
      if (bottomBar.parentElement !== rootEl) {
        rootEl.appendChild(bottomBar);
      }
    }
  }

  function handleIconClick(item) {
    if (typeof hapticTap === "function") hapticTap();

    if (item.panelType === "action") {
      // Add File: パネルを開かず、既存のファイル選択をそのまま発火
      const fileInputEl = document.getElementById("fileInput");
      if (fileInputEl) fileInputEl.click();
      return;
    }

    openPanelOverlay(item.id);
  }

  // SP幅（900px以下）では、パネルはヘッダー直下〜下部バー直上を覆う
  // オーバーレイとして開閉する（#pcV2Layoutの.pcv2-panel-openクラスで
  // CSS側の表示を切り替える。PC幅では常時表示のためこのクラスは
  // 見た目に影響しない）。同じアイコンを再タップしたら閉じる。
  // アイコンバー上段(Control/Markers/Playlist/Text/Export、
  // handleIconClick経由)・下段(Keyboard/Color、直接呼び出し)の
  // 両方から呼ばれる共通の入口。
  function openPanelOverlay(panelId) {
    const layoutEl = document.getElementById("pcV2Layout");
    const isSpWidth = window.matchMedia("(max-width: 900px)").matches;
    if (isSpWidth && layoutEl) {
      const alreadyOpen = layoutEl.classList.contains("pcv2-panel-open");
      const isSamePanel = currentPanel === panelId;
      if (alreadyOpen && isSamePanel) {
        closePanelOverlay();
        return;
      }
      updatePcv2BottomBarsHeightVar();
      layoutEl.classList.add("pcv2-panel-open");
    }

    switchPanel(panelId);
  }

  // パネルを全面オーバーレイ表示する際、下部コントロールバー
  // (#pcV2BottomBar)とアイコンバー(#pcV2IconBar)を隠さないよう、
  // その実際の高さの合計をCSS変数--pcv2-bottom-bars-heightに反映する。
  // 固定値(CSS側のfallback: 140px)だけに頼ると、将来ボタンが増えて
  // 折り返す等の変化があった時にパネルがバーの上に被ってしまい、
  // 閉じる手段（アイコンバー自体）が隠れて操作不能になるバグの
  // 再発を防ぐため、開くたびに実測する。
  function updatePcv2BottomBarsHeightVar() {
    const layoutEl = document.getElementById("pcV2Layout");
    const bottomBar = document.getElementById("pcV2BottomBar");
    const iconBar = document.getElementById("pcV2IconBar");
    if (!layoutEl || !bottomBar || !iconBar) return;
    const total = bottomBar.getBoundingClientRect().height + iconBar.getBoundingClientRect().height;
    layoutEl.style.setProperty("--pcv2-bottom-bars-height", total + "px");
  }

  window.addEventListener("resize", () => {
    if (document.getElementById("pcV2Layout")?.classList.contains("pcv2-panel-open")) {
      updatePcv2BottomBarsHeightVar();
    }
  });

  function closePanelOverlay() {
    const layoutEl = document.getElementById("pcV2Layout");
    if (layoutEl) layoutEl.classList.remove("pcv2-panel-open");
    document.querySelectorAll("#pcV2IconBar .pcv2-icon-item").forEach(btn => {
      btn.classList.remove("active");
    });
  }

  function switchPanel(panelId) {
    currentPanel = panelId;

    // パネル切替のたびに、下段バーのSpeed/Key/EQボタンの見た目を
    // 現在のグローバル変数の状態に合わせ直す（保険。通常はControl
    // パネル側トグルのclickリスナーで即座に同期されるはずだが、
    // 何らかの経路で状態が変わった場合の取りこぼしを防ぐ）。
    syncAllBottomBarEffectButtons();

    // 現在のパネル以外に切り替えたら編集モードは常にリセットする
    if (panelId !== "markers" && editModeState.markers) {
      editModeState.markers = false;
    }
    if (panelId !== "playlist" && editModeState.playlist) {
      editModeState.playlist = false;
    }

    document.querySelectorAll("#pcV2IconBar .pcv2-icon-item").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-panel-id") === panelId);
    });

    const panelBody = document.getElementById("pcV2PanelBody");
    const panelHeader = document.getElementById("pcV2PanelHeader");
    if (!panelBody || !panelHeader) return;

    // panelHeader.innerHTML=""で子要素が破棄される前に、Textパネルの
    // フルスクリーンボタンが今panelHeader内にいる場合は保持コンテナ
    // (#pcV2TextControlsHolder)へ退避しておく（実体を保つ。破棄されると
    // PC v2内でTextパネルへ戻った時に二度と使えなくなるため）。
    const textControlsHolder = document.getElementById("pcV2TextControlsHolder");
    if (textControlsHolder) {
      const fullscreenBtnEl = document.getElementById("noteTextFullscreenBtn");
      if (fullscreenBtnEl && panelHeader.contains(fullscreenBtnEl)) {
        textControlsHolder.appendChild(fullscreenBtnEl);
      }
    }

    // 前回の中身を退避してから、今回の中身を挿入する
    panelBody.innerHTML = "";
    panelHeader.innerHTML = "";
    // パネル種別ごとのクラス(pcv2-panel-*)だけ入れ替える。markers-edit-mode等、
    // 他のクラスには触れない。
    Array.from(panelBody.classList)
      .filter(c => c.indexOf("pcv2-panel-") === 0)
      .forEach(c => panelBody.classList.remove(c));
    panelBody.classList.add("pcv2-panel-" + panelId);
    if (panelId !== "markers") panelBody.classList.remove("markers-edit-mode");
    if (panelId !== "playlist") panelBody.classList.remove("playlist-edit-mode");

    if (panelId === "keyboard" || panelId === "color") {
      const titleSpan = el('<span class="pcv2-panel-header-title"></span>');
      titleSpan.textContent = panelId === "keyboard" ? "Keyboard" : "Color";
      panelHeader.appendChild(titleSpan);
      renderQnMenuSectionPanel(panelId, panelBody);
      return;
    }

    const item = ICON_ITEMS.find(i => i.id === panelId);
    if (!item) return;

    const titleSpan = el('<span class="pcv2-panel-header-title"></span>');
    titleSpan.textContent = item.label;
    panelHeader.appendChild(titleSpan);

    if (panelId === "markers" || panelId === "playlist") {
      const headerActions = el('<div class="pcv2-panel-header-actions"></div>');

      if (panelId === "playlist") {
        const addFileBtn = el(
          '<button type="button" class="panel-addfile-btn" id="pcV2LibraryAddFileBtn" title="Add File">' +
            '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>' +
          '</button>'
        );
        addFileBtn.addEventListener("click", () => {
          const fileInputEl = document.getElementById("fileInput");
          if (fileInputEl) fileInputEl.click();
        });
        headerActions.appendChild(addFileBtn);
      }

      const editBtn = el(
        '<button type="button" class="panel-edit-btn" id="pcV2' + (panelId === "markers" ? "Markers" : "Playlist") + 'EditBtn" title="Edit ' + panelId + '">' +
          '<span>EDIT</span>' +
        '</button>'
      );
      editBtn.addEventListener("click", () => toggleEditMode(panelId));
      headerActions.appendChild(editBtn);

      const deleteBtn = el(
        '<button type="button" id="pcV2DeleteSelectedBtn" disabled>' +
          '<span>Delete</span>' +
        '</button>'
      );
      deleteBtn.addEventListener("click", () => deleteSelectedItems(panelId));
      headerActions.appendChild(deleteBtn);

      panelHeader.appendChild(headerActions);
    }

    if (item.panelType === "tab") {
      // 「Control」パネルだけはSpeed/Key/EQを1つに統合する要望のため、
      // controlBody(Speed/Key)の下にeqBody(EQ)を続けて差し込む。
      if (panelId === "control") {
        if (controlBody) panelBody.appendChild(controlBody);
        if (eqBody) {
          // EQ機能を初めて表示する瞬間にWeb Audio APIへ接続する
          // （player-control-eq.js の openEqModal() と同じタイミング）
          if (typeof setupAudioGraph === "function") {
            setupAudioGraph().catch(err => console.warn("setupAudioGraph failed:", err));
          }
          appendEqDivider(panelBody);
          panelBody.appendChild(eqBody);
        }
      } else if (panelId === "markers") {
        if (markersBody) panelBody.appendChild(markersBody);
        attachDisableGuard("markers");
      } else if (panelId === "playlist") {
        if (playlistBody) panelBody.appendChild(playlistBody);
        attachDisableGuard("playlist");
      } else if (panelId === "text") {
        if (textBody) panelBody.appendChild(textBody);
        setupTextPanelHeaderControls();
      }
      // 既存のタブ状態・関連ロジック（ハイライト、Textの自動保存登録等）を
      // 呼び出し元と一致させておく。SP幅の吸着タブ表示には影響しない
      // （style-core-pc.css側でsidebarToggleTabs自体がPC幅では非表示）。
      if (typeof setMobileTab === "function") setMobileTab(panelId);
    } else if (item.panelType === "export") {
      if (typeof openExportModal === "function") openExportModal();
      // openExportModal()はファイル名自動生成等の準備処理と同時に、本来の
      // モーダル(オーバーレイ全体)を開く副作用(exportModalOverlay.classList.add("open"))
      // も持つ。PC v2では中身(exportBody)だけをパネルへ差し込みたいため、
      // オーバーレイ自体は直後にopenを外して非表示に戻す。
      const exportModalOverlay = document.getElementById("exportModalOverlay");
      if (exportModalOverlay) exportModalOverlay.classList.remove("open");
      if (exportBody) panelBody.appendChild(exportBody);
      if (exportFooter) panelBody.appendChild(exportFooter);
    }

    // パネルの中身(.mobile-tab-panel)を.app-containerの外(#pcV2PanelBody)へ
    // 移動したことで、syncTopControlsSpacerHeight（player-ui-shared.js）が
    // 判定に使う「.app-container内に留まっているか」の状態が変わるため、
    // 再計算させる。これを呼ばないと、移動前に設定された古い
    // padding-bottomがパネル下部の余分な空白として残ってしまう。
    if (typeof syncTopControlsSpacerHeight === "function") {
      syncTopControlsSpacerHeight();
    }
  }

  // Markers/Playlistパネル：Editボタンで「表示非表示・メモ編集」を隠し、
  // 「削除用チェック(.del-btn)」だけを表示する編集モードをトグルする。
  // 編集モード中は.del-btnクリックで削除を確定せず、選択状態(赤丸+チェック)を
  // トグルするだけにし、ヘッダーの#pcV2DeleteSelectedBtnで選択項目をまとめて
  // 削除する。player-markers.js/player-playlist.js側のDOM生成・確認式削除
  // ロジック自体には手を入れず、PC v2側で.del-btnのクリック挙動だけを
  // キャプチャフェーズで奪って上書きする。
  // editModeStateはplayer-playlist.js側のrenderPlaylist()からも参照する
  // 必要があるため、window経由で読み取り専用の判定関数を公開する。
  const editModeState = { markers: false, playlist: false };
  window.isPlaylistEditMode = () => editModeState.playlist;
  window.isMarkersEditMode = () => editModeState.markers;
  const selectedIndices = { markers: new Set(), playlist: new Set() };

  function toggleEditMode(panelId) {
    if (!(panelId in editModeState)) return;
    editModeState[panelId] = !editModeState[panelId];
    selectedIndices[panelId].clear();

    const panelBody = document.getElementById("pcV2PanelBody");
    const editBtnId = panelId === "markers" ? "pcV2MarkersEditBtn" : "pcV2PlaylistEditBtn";
    const editBtn = document.getElementById(editBtnId);
    const deleteBtn = document.getElementById("pcV2DeleteSelectedBtn");
    const cssClass = panelId + "-edit-mode";
    if (panelBody) panelBody.classList.toggle(cssClass, editModeState[panelId]);
    if (editBtn) editBtn.classList.toggle("active", editModeState[panelId]);
    if (deleteBtn) {
      deleteBtn.style.display = editModeState[panelId] ? "flex" : "none";
      deleteBtn.disabled = true;
    }

    // 編集モードの切り替えでリスト側のDOM構造自体(サムネイル/⋮メニュー/
    // 入力欄の有無等)が変わるため、対象のrender関数を呼び直して
    // 作り直す。
    if (panelId === "playlist" && typeof renderPlaylist === "function") {
      renderPlaylist();
    } else if (panelId === "markers" && typeof renderPinList === "function") {
      renderPinList();
    }

    if (editModeState[panelId]) {
      attachSelectionHandlers(panelId);
    } else {
      clearSelectionVisuals(panelId);
    }
  }

  // 通常時(編集モードOFF)は表示非表示トグル(.toggle-btn)のクリックを
  // 無効化する（編集モード専用の機能のため）。
  // 【重要】.pin-edit-btn/.playlist-hover-edit-btnは今回の変更で「通常
  // モードでこそ使う」ホバー編集ボタンに意味が変わったため、ここでの
  // 無効化対象から外す。以前はここに.pin-edit-btnも含まれていたが、
  // それにより通常モードでの鉛筆クリックが常にキャプチャ段階で
  // stopPropagation/preventDefaultされ、ラベル編集が一切開始できなく
  // なるバグを引き起こしていた（実機のPuppeteerクリックで検出）。
  // 編集モードON時はこのブロックを解除し、player-markers.js/
  // player-playlist.js側の本来のクリックハンドラがそのまま動くように
  // なる。どちらのモードでもリスト自体はrenderPinList()/renderPlaylist()
  // で都度作り直されるため、常時イベント委譲(キャプチャフェーズ)で
  // container自体に1つだけリスナーを置き、個別ボタンには何もしない。
  const disableHandlers = { markers: null, playlist: null };

  function attachDisableGuard(panelId) {
    const container = getListContainer(panelId);
    if (!container || disableHandlers[panelId]) return;
    const handler = (e) => {
      if (editModeState[panelId]) return;
      const target = e.target.closest(".toggle-btn");
      if (!target || !container.contains(target)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    container.addEventListener("click", handler, true);
    disableHandlers[panelId] = handler;
  }

  function getListContainer(panelId) {
    return panelId === "markers" ? document.getElementById("pinList") : document.getElementById("playlistBox");
  }

  function getRowItems(panelId) {
    const container = getListContainer(panelId);
    if (!container) return [];
    return Array.from(container.children);
  }

  // .del-btnの本来のクリック(確認式削除)をキャプチャフェーズで止め、
  // 編集モード中は選択トグルとして扱う。編集モードを抜けたら
  // removeEventListenerで元の挙動に戻す。
  const selectionHandlers = { markers: null, playlist: null };

  function attachSelectionHandlers(panelId) {
    const container = getListContainer(panelId);
    if (!container) return;
    if (selectionHandlers[panelId]) {
      container.removeEventListener("click", selectionHandlers[panelId], true);
    }
    const handler = (e) => {
      const delBtn = e.target.closest(".del-btn");
      if (!delBtn || !container.contains(delBtn)) return;
      e.stopPropagation();
      e.preventDefault();
      const items = getRowItems(panelId);
      const index = items.indexOf(delBtn.closest(".pinItem, .playlistItem"));
      if (index === -1) return;
      if (selectedIndices[panelId].has(index)) {
        selectedIndices[panelId].delete(index);
        delBtn.classList.remove("pcv2-selected");
      } else {
        selectedIndices[panelId].add(index);
        delBtn.classList.add("pcv2-selected");
      }
      const deleteBtn = document.getElementById("pcV2DeleteSelectedBtn");
      if (deleteBtn) deleteBtn.disabled = selectedIndices[panelId].size === 0;
    };
    container.addEventListener("click", handler, true);
    selectionHandlers[panelId] = handler;
  }

  function clearSelectionVisuals(panelId) {
    const container = getListContainer(panelId);
    if (container) {
      container.querySelectorAll(".del-btn.pcv2-selected").forEach(b => b.classList.remove("pcv2-selected"));
      if (selectionHandlers[panelId]) {
        container.removeEventListener("click", selectionHandlers[panelId], true);
        selectionHandlers[panelId] = null;
      }
    }
    selectedIndices[panelId].clear();
  }

  function deleteSelectedItems(panelId) {
    const indices = Array.from(selectedIndices[panelId]).sort((a, b) => b - a);
    if (indices.length === 0) return;
    hapticWarning();
    if (panelId === "markers") {
      indices.forEach(i => pins.splice(i, 1));
      renderPins();
      renderSegments();
      renderPinList();
      savePins();
    } else {
      indices.forEach(i => playlist.splice(i, 1));
      if (typeof currentPlaylistIndex !== "undefined") {
        // 削除された項目より後ろの現在再生インデックスがずれないよう調整
        const removedBeforeCurrent = indices.filter(i => i < currentPlaylistIndex).length;
        if (indices.includes(currentPlaylistIndex)) {
          currentPlaylistIndex = -1;
        } else {
          currentPlaylistIndex -= removedBeforeCurrent;
        }
      }
      renderPlaylist();
    }
    selectedIndices[panelId].clear();
    const deleteBtn = document.getElementById("pcV2DeleteSelectedBtn");
    if (deleteBtn) deleteBtn.disabled = true;
    // 削除後、編集モードは維持したまま新しいリストに選択ハンドラを再アタッチする。
    attachSelectionHandlers(panelId);
  }

  // Control/EQ間の見出し・区切り線を1回だけ生成して使い回す。
  // EQのON/OFFトグル(#controlEqEnableToggle、元は非表示の.eq-inline-title
  // 内にある)もこの見出しへ移動して表示する。
  let eqDividerEl = null;
  function appendEqDivider(container) {
    if (!eqDividerEl) {
      eqDividerEl = el(
        '<div class="pcv2-control-eq-heading">' +
          '<div class="pcv2-section-divider"></div>' +
          '<div class="pcv2-eq-heading-row">' +
            '<h3 class="pcv2-eq-heading-title">Equalizer</h3>' +
          '</div>' +
        '</div>'
      );
      const heading = eqDividerEl.querySelector(".pcv2-eq-heading-row");
      // RESETボタンをトグルより先に追加し、SPEED/KEY行と同じ「RESET→トグル」の
      // 並び順に揃える。
      const eqResetBtn = document.getElementById("controlEqResetBtn");
      if (eqResetBtn) {
        markAnchor("eqResetBtn", eqResetBtn);
        heading.appendChild(eqResetBtn);
      }
      const eqToggle = document.getElementById("controlEqEnableToggle");
      if (eqToggle) {
        markAnchor("eqEnableToggle", eqToggle);
        heading.appendChild(eqToggle);
      }
    }
    container.appendChild(eqDividerEl);
  }

  // 下段バー右側のSpeed/Key/EQボタン：クリックで対応するエフェクトの
  // ON/OFFをトグルし、Controlパネル内のcontrolXxxEnableToggle(既存の
  // トグルスイッチ)とも状態を同期する。ON時は白く濃く、OFF時は薄く
  // 表示する（.pcv2-ctrl-btn.effect-offクラスで見た目を切り替える）。
  // speedEffectEnabled/keyEffectEnabled/eqEffectEnabledはplayer-core.js/
  // player-control-eq.js側のグローバル変数。
  function toggleBottomBarEffect(id, btn) {
    hapticTap();
    if (id === "speed") {
      speedEffectEnabled = !speedEffectEnabled;
      if (typeof updatePlaybackRate === "function") updatePlaybackRate();
      const t = document.getElementById("controlSpeedEnableToggle");
      if (t) t.setAttribute("aria-checked", String(speedEffectEnabled));
    } else if (id === "key") {
      keyEffectEnabled = !keyEffectEnabled;
      if (typeof updatePlaybackRate === "function") updatePlaybackRate();
      const t = document.getElementById("controlKeyEnableToggle");
      if (t) t.setAttribute("aria-checked", String(keyEffectEnabled));
    } else if (id === "eq") {
      if (typeof setEqEffectEnabled === "function") setEqEffectEnabled(!eqEffectEnabled);
      const t = document.getElementById("controlEqEnableToggle");
      if (t) t.setAttribute("aria-checked", String(eqEffectEnabled));
    }
    syncBottomBarEffectButton(id, btn);
  }

  // 現在のON/OFF状態をボタンの見た目(.effect-off有無)に反映する。
  function syncBottomBarEffectButton(id, btn) {
    let enabled = true;
    if (id === "speed") enabled = typeof speedEffectEnabled === "undefined" || speedEffectEnabled;
    else if (id === "key") enabled = typeof keyEffectEnabled === "undefined" || keyEffectEnabled;
    else if (id === "eq") enabled = typeof eqEffectEnabled === "undefined" || eqEffectEnabled;
    btn.classList.toggle("effect-off", !enabled);
  }

  // 下段バーの3ボタンすべてを、現在のグローバル変数の状態に合わせて
  // 一括で再同期する。パネル切替のたびに呼ぶことで、Controlパネルを
  // 表示していた間にリスナー経由の同期が万一漏れても取りこぼさない。
  function syncAllBottomBarEffectButtons() {
    Object.keys(bottomBarEffectButtons).forEach(id => {
      syncBottomBarEffectButton(id, bottomBarEffectButtons[id]);
    });
  }

  let controlPanelEffectSyncSetup = false;
  // Controlパネル内のcontrolSpeedEnableToggle/controlKeyEnableToggle/
  // controlEqEnableToggleに、キャプチャ段階のclickリスナーを追加する。
  // キャプチャ段階にしているのは、player-controls.js/player-control-eq.js側の
  // onclickが先にグローバル変数(speedEffectEnabled等)を書き換えた「後」
  // ではなく「先」に発火してしまうと古い値を読んでしまうため——実際には
  // 逆に、既存のonclickが変数更新を終えた後に読みたいので、あえて
  // バブリング段階（通常のaddEventListener）でよい。onclick代入は最初の
  // 1つしか効かないためaddEventListenerで追加リスナーとして重ねる。
  function setupControlPanelEffectSync() {
    if (controlPanelEffectSyncSetup) return;
    controlPanelEffectSyncSetup = true;
    [
      ["speed", "controlSpeedEnableToggle"],
      ["key", "controlKeyEnableToggle"],
      ["eq", "controlEqEnableToggle"]
    ].forEach(([id, elId]) => {
      const toggle = document.getElementById(elId);
      if (!toggle) return;
      toggle.addEventListener("click", () => {
        // 既存のonclick（変数のトグル）が先に実行された「後」に、
        // 下段バー側の見た目だけを最新状態に合わせる。
        const btn = bottomBarEffectButtons[id];
        if (btn) syncBottomBarEffectButton(id, btn);
      });
    });
  }

  // Textパネル：ヘッダーにEDIT/フルスクリーン/文字サイズ変更を配置する。
  // フルスクリーンボタン・文字サイズ+/-ボタンはinitPanels()で
  // #pcV2TextControlsHolder(非表示の保持コンテナ)へ退避してあるため、
  // ここではそこから取り出してヘッダーへ移す。#pcV2PanelHeaderは
  // パネル切替のたびにinnerHTML=""でクリアされるが、要素の実体は
  // 保持コンテナと行き来するだけなので破棄されない。
  // EDIT機能(デフォルトはreadonly、EDIT押下で編集可能)はPC v2独自の
  // 新機能として実装する。
  let textEditModeOn = false;
  function setupTextPanelHeaderControls() {
    const panelHeader = document.getElementById("pcV2PanelHeader");
    const textarea = document.getElementById("noteTextArea");
    if (!panelHeader || !textarea) return;

    // デフォルトで編集モードにしない：readonly状態から始める。
    textarea.readOnly = !textEditModeOn;

    const actions = el('<div class="pcv2-panel-header-actions"></div>');

    const holder = document.getElementById("pcV2TextControlsHolder");
    if (holder) {
      // 文字サイズ変更(+/-)は、フルスクリーンオーバーレイ内の
      // #noteTextAreaFullscreenにだけ効く機能(player-text.js側の設計)
      // のため、通常表示のヘッダーには置かず、フルスクリーンオーバーレイ
      // 側に残す（保持コンテナには退避しない）。フルスクリーンボタン
      // だけをヘッダーへ移動する。PDF指摘により、EDITボタンより先
      // （＝表示上は左）に配置する。
      const fullscreenBtn = document.getElementById("noteTextFullscreenBtn");
      if (fullscreenBtn) actions.appendChild(fullscreenBtn);
    }

    const editBtn = el(
      '<button type="button" class="panel-edit-btn" id="pcV2TextEditBtn" title="Edit text">' +
        '<span>EDIT</span>' +
      '</button>'
    );
    editBtn.classList.toggle("active", textEditModeOn);
    editBtn.addEventListener("click", () => {
      textEditModeOn = !textEditModeOn;
      textarea.readOnly = !textEditModeOn;
      editBtn.classList.toggle("active", textEditModeOn);
      if (textEditModeOn) textarea.focus();
    });
    actions.appendChild(editBtn);

    panelHeader.appendChild(actions);
  }

  // Keyboard/Colorパネル：既存のQNシリーズ共通ハンバーガーメニュー
  // (qn-menu.js/html、#qnMenuMountへfetchで非同期に注入される)が持つ
  // Theme(Color)/Shortcuts(Keyboard)セクションを、DOMごとパネルへ移動して
  // 表示する。qn-menu.js自体のロジック(テーマ切替・Glowトグル・
  // ショートカット表生成)には一切手を入れない。
  // 一度移動したセクションはpcv2QnSectionsに保持し、パネルを行き来しても
  // 同じ要素（イベントハンドラ・状態を保ったまま）を再利用する。
  const pcv2QnSections = { keyboard: null, color: null };
  let pcv2QnObserver = null;

  function qnSectionSelector(panelId) {
    return panelId === "keyboard"
      ? '.qn-menu-section[data-qn-section="shortcuts"]'
      : '.qn-menu-section[data-qn-section="theme"]';
  }

  function tryClaimQnSections() {
    const mount = document.getElementById("qnMenuMount");
    if (!mount) return;
    if (!pcv2QnSections.keyboard) {
      const el2 = mount.querySelector(qnSectionSelector("keyboard"));
      if (el2) pcv2QnSections.keyboard = el2;
    }
    if (!pcv2QnSections.color) {
      const el2 = mount.querySelector(qnSectionSelector("color"));
      if (el2) pcv2QnSections.color = el2;
    }
  }

  function renderQnMenuSectionPanel(panelId, panelBody) {
    // 既に確保済みならそのまま差し込むだけ。
    if (pcv2QnSections[panelId]) {
      panelBody.appendChild(pcv2QnSections[panelId]);
      return;
    }

    tryClaimQnSections();
    if (pcv2QnSections[panelId]) {
      panelBody.appendChild(pcv2QnSections[panelId]);
      return;
    }

    // qn-menu.js側のfetchによるDOM注入がまだ完了していない場合、
    // ローディング表示を出しつつMutationObserverで注入完了を待つ。
    const loading = el('<div class="pcv2-qn-loading">Loading…</div>');
    panelBody.appendChild(loading);

    const mount = document.getElementById("qnMenuMount");
    if (!mount) return;

    if (pcv2QnObserver) pcv2QnObserver.disconnect();
    pcv2QnObserver = new MutationObserver(() => {
      tryClaimQnSections();
      if (pcv2QnSections.keyboard && pcv2QnSections.color) {
        pcv2QnObserver.disconnect();
        pcv2QnObserver = null;
      }
      // 現在表示中のパネルがこのpanelIdのままであれば、ローディング表示を
      // 実際のセクションに差し替える。別のパネルに切り替わっていた場合は
      // 何もしない（要素はpcv2QnSectionsに保持されているので、次回
      // Keyboard/Colorを開いた時にrenderQnMenuSectionPanelの先頭分岐で
      // 即座に表示される）。
      if (pcv2QnSections[panelId] && currentPanel === panelId) {
        panelBody.innerHTML = "";
        panelBody.appendChild(pcv2QnSections[panelId]);
      }
    });
    pcv2QnObserver.observe(mount, { childList: true, subtree: true });
  }

  // 元の位置に戻すための目印（コメントノード）。要素移動前に元の場所へ
  // 目印を挿入しておき、SP幅へ戻る際はその目印の直前に要素を差し戻す。
  const anchors = {};

  function markAnchor(key, elmt) {
    if (!elmt || !elmt.parentNode) return;
    const anchor = document.createComment("pcv2-anchor-" + key);
    elmt.parentNode.insertBefore(anchor, elmt);
    anchors[key] = anchor;
  }

  function restoreAnchor(key, elmt) {
    const anchor = anchors[key];
    if (anchor && anchor.parentNode && elmt) {
      anchor.parentNode.insertBefore(elmt, anchor);
      anchor.parentNode.removeChild(anchor);
      delete anchors[key];
    }
  }

  function activate() {
    build();
    document.body.classList.add("pc-v2-active");
    document.documentElement.classList.add("pc-v2-active-html");
    // build()でmobile-tab-panel等を.app-containerの外へ移動したため、
    // それらの要素が対象外になるよう再計算させる（詳細は
    // player-ui-shared.js側のsyncTopControlsSpacerHeightコメント参照）。
    if (typeof syncTopControlsSpacerHeight === "function") {
      syncTopControlsSpacerHeight();
    }
  }

  function deactivate() {
    document.body.classList.remove("pc-v2-active");
    document.documentElement.classList.remove("pc-v2-active-html");
    if (!built) return;

    // 波形エリア一式・各パネル中身を、build()時に記録した元の位置へ戻す。
    restoreAnchor("appTitle", document.getElementById("appTitle"));
    restoreAnchor("vbarContainer", document.getElementById("vbarContainer"));
    restoreAnchor("topControls", document.getElementById("topControls"));
    restoreAnchor("timeControlsRow0", document.querySelectorAll(".time-controls-row")[0]);
    restoreAnchor("control", controlBody);
    restoreAnchor("markers", markersBody);
    restoreAnchor("playlist", playlistBody);
    restoreAnchor("text", textBody);
    restoreAnchor("eq", eqBody);
    restoreAnchor("eqResetBtn", document.getElementById("controlEqResetBtn"));
    restoreAnchor("eqEnableToggle", document.getElementById("controlEqEnableToggle"));
    restoreAnchor("export", exportBody);
    restoreAnchor("exportFooter", exportFooter);

    // Textパネルのフルスクリーンボタンを元の位置(.markers-heading-row内、
    // textBodyが↑で既に元の場所へ戻っていることが前提)へ戻す。
    // 保持コンテナ(#pcV2TextControlsHolder)自体は空のまま残しておいて
    // 問題ない（次回のPC v2 activate時にまた使う）。
    // 文字サイズ+/-ボタンは元々移動していないため、ここで戻す必要はない。
    restoreAnchor("textFullscreenBtn", document.getElementById("noteTextFullscreenBtn"));
    const noteTextAreaEl = document.getElementById("noteTextArea");
    if (noteTextAreaEl) noteTextAreaEl.readOnly = false;

    // PC v2の間だけ差し替えていたPrev/NextアイコンをSP版向けの元の形に戻す
    ["prevTrackBtn", "nextTrackBtn"].forEach(id => {
      const btn = document.getElementById(id);
      const svg = btn ? btn.querySelector("svg") : null;
      if (svg && svg.dataset.pcv2Swapped) {
        svg.innerHTML = svg.dataset.pcv2OriginalHtml;
        delete svg.dataset.pcv2Swapped;
        delete svg.dataset.pcv2OriginalHtml;
      }
    });

    // Startボタンを除去（playbackTripleBtnコンテナ内に追加していたもの）
    const startBtn = document.getElementById("pcV2StartBtn");
    if (startBtn) startBtn.parentNode.removeChild(startBtn);

    // allRepeatToggleBtn/loopToggleBtnはbuild()時にplaybackTripleBtn/
    // markerNavBtnの子として組み込んだため、restoreForSp()が
    // playbackTripleBtn/markerNavBtnごと.top-controls-rowへ戻す際に
    // 自動的について行く。ここで個別に動かす必要はない。

    // 新設のグループ・区切り線を除去し、元の.top-controls-rowの表示を戻す。
    document.querySelectorAll("#topControls > .pcv2-ctrl-group, #topControls > .pcv2-ctrl-divider").forEach(elmt => {
      elmt.parentNode.removeChild(elmt);
    });
    document.querySelectorAll("#topControls .top-controls-row").forEach(row => {
      row.style.display = "";
    });

    const basicPanelBox = document.querySelector(".basic-panel-box");
    if (basicPanelBox) basicPanelBox.style.display = "";

    // headerNavを削除する前に、その中にあるappVersionを元の位置
    // (#appLogo内)へ戻す。
    restoreAnchor("appVersion", document.getElementById("appVersion"));

    const headerNav = document.getElementById("pcV2HeaderNav");
    if (headerNav) headerNav.parentNode.removeChild(headerNav);

    // Keyboard/Colorパネルへ移動していたqn-menuのセクションを、元の
    // .qn-menu-popup(SP幅ではハンバーガーメニューのポップアップとして
    // 引き続き使われる)へ戻す。qn-menu.js側のDOM構造・並び順の前提
    // (nav→theme→shortcutsの順)を壊さないよう、Navセクションの直後に
    // theme、その後にshortcutsという順で差し戻す。
    if (pcv2QnSections.color || pcv2QnSections.keyboard) {
      const popup = document.getElementById("qnMenuPopup");
      if (popup) {
        const navSection = popup.querySelector('.qn-menu-section[data-qn-section="nav"]');
        if (pcv2QnSections.color) {
          if (navSection && navSection.nextSibling) {
            popup.insertBefore(pcv2QnSections.color, navSection.nextSibling);
          } else {
            popup.appendChild(pcv2QnSections.color);
          }
        }
        if (pcv2QnSections.keyboard) {
          popup.appendChild(pcv2QnSections.keyboard);
        }
      }
      pcv2QnSections.color = null;
      pcv2QnSections.keyboard = null;
    }
    if (pcv2QnObserver) {
      pcv2QnObserver.disconnect();
      pcv2QnObserver = null;
    }

    const layout = document.getElementById("pcV2Root");
    if (layout) layout.parentNode.removeChild(layout);
    built = false;
  }

  function sync() {
    if (mql.matches) {
      activate();
    } else {
      deactivate();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync);
  } else {
    sync();
  }
  mql.addEventListener("change", sync);

  // ============================================================
  // PC v2波形の再生位置表現：モック準拠で「棒グラフそのものの色」を
  // 未再生(薄いグレー)/再生済み(accent色)で塗り分ける。
  // 既存のdrawWaveform()/updateBars()（SP版・旧PC版が使う、.vfillという
  // 別レイヤーのオーバーレイで再生位置を表す方式）には一切手を入れず、
  // PC v2が有効な間だけ、同じcanvas要素の上からこの関数で上書き描画する。
  // ============================================================
  let pcv2WaveRafId = null;

  function pcv2DrawWaveform() {
    if (typeof waveformPeaks === "undefined" || !waveformPeaks || typeof audio === "undefined" || !audio.duration) return;
    if (typeof getSegments !== "function") return;

    const dur = audio.duration;
    const ct = audio.currentTime;
    const { s1, s2, s3, s4, s5 } = getSegments(dur);
    const bounds = [0, s1, s2, s3, s4, s5, dur];

    // マーカーに色が設定されていれば、そのマーカーから次のマーカーまでの
    // 区間の波形をその色で塗る（「このマーカーから始まる区間」という
    // 意味合い）。次のマーカーに色が無い場合はそこでデフォルトカラーに
    // 戻る（色の有無に関わらず全マーカーを時刻順に見て、barTimeが属する
    // 区間の開始マーカー自体に色があるかどうかで判定する。色付き
    // マーカーだけを抜き出して探索すると、間にある色無しマーカーの
    // 存在が無視され、次の色付きマーカーまで前の色が伸び続けてしまう
    // バグがあった）。
    // MARKER_COLOR_PALETTE/pinsはplayer-core.js/player-markers.js側の
    // グローバルなので、存在チェックしてから使う。
    let allMarkers = [];
    if (typeof pins !== "undefined" && typeof MARKER_COLOR_PALETTE !== "undefined") {
      allMarkers = pins
        .filter(p => p.enabled)
        .slice()
        .sort((a, b) => a.t - b.t);
    }
    function colorForTime(barTime) {
      // barTime以下の最後のマーカー(=barTimeが属する区間の開始マーカー)
      // を探し、そのマーカー自体に色があればその色、無ければ
      // デフォルト(null=accentColor)を返す。
      let found = null;
      for (let i = 0; i < allMarkers.length; i++) {
        if (allMarkers[i].t <= barTime) found = allMarkers[i];
        else break;
      }
      if (!found || !found.color || !MARKER_COLOR_PALETTE[found.color]) return null;
      return MARKER_COLOR_PALETTE[found.color];
    }

    for (let row = 0; row < 6; row++) {
      const canvas = document.getElementById(`wave${row + 1}`);
      const bar = document.getElementById(`bar${row + 1}`);
      if (!canvas || !bar) continue;

      const rect = bar.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx2d = canvas.getContext("2d");
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      const rowStart = bounds[row];
      const rowEnd = bounds[row + 1];
      const totalSamples = waveformPeaks.length;

      const startIdx = Math.floor((rowStart / dur) * totalSamples);
      const endIdx = Math.max(startIdx + 1, Math.floor((rowEnd / dur) * totalSamples));
      const sliceCount = endIdx - startIdx;
      if (sliceCount <= 0) continue;

      const barGap = 1 * dpr;
      const barWidth = Math.max(1, canvas.width / sliceCount - barGap);
      const accentColor = getComputedStyle(document.body).getPropertyValue("--accent-primary").trim() || "#3b82f6";

      for (let i = 0; i < sliceCount; i++) {
        const peak = waveformPeaks[startIdx + i] || 0;
        const barHeight = Math.max(2 * dpr, peak * canvas.height * 0.85);
        const x = i * (canvas.width / sliceCount);
        // このバーが表す時刻が再生済みかどうかで色を決める。
        // マーカー区間に色が設定されていれば、再生済み/未再生どちらの
        // 状態でもその色をベースにする（未再生は薄く、再生済みは
        // そのままの濃さで表示し、区間を判別しやすくする）。
        const barTime = rowStart + (rowEnd - rowStart) * (i / sliceCount);
        const markerColor = colorForTime(barTime);
        const isPlayed = barTime <= ct;
        if (markerColor) {
          ctx2d.fillStyle = isPlayed ? markerColor : hexToRgbaLocal(markerColor, 0.35);
        } else {
          ctx2d.fillStyle = isPlayed ? accentColor : "rgba(255, 255, 255, 0.16)";
        }
        ctx2d.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      }
    }
  }

  // player-core.jsのhexToRgba相当を、依存を増やさずここでも使えるよう
  // 軽量に複製する（外部関数の有無に依存しないようにするため）。
  function hexToRgbaLocal(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function pcv2WaveLoop() {
    pcv2WaveRafId = requestAnimationFrame(pcv2WaveLoop);
    if (document.body.classList.contains("pc-v2-active")) {
      pcv2DrawWaveform();
    }
  }
  pcv2WaveLoop();

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("pc-v2-active")) pcv2DrawWaveform();
  });
})();

// ============================================================
// 【旧player-ui-pc.jsより統合】
// ドラッグ&ドロップでのファイル追加、および#topControlsのPC幅レイアウト
// （flattenForPc/restoreForSp）。後者は上のPC v2 build()が「先にこの
// 処理が#topControlsをフラット化した状態」を前提とする土台処理のため、
// 依存関係が分かりやすいよう同じファイルにまとめている。
// player-core.js, player-ui-shared.js の後に読み込むこと
// （addFilesToPlaylist 等の共通関数に依存するため）。
// ============================================================

document.addEventListener("dragover", e => {
  e.preventDefault();
  document.body.classList.add("dragover");
});

document.addEventListener("dragleave", e => {
  if (e.clientX === 0 && e.clientY === 0) {
    document.body.classList.remove("dragover");
  }
});

document.addEventListener("drop", e => {
  e.preventDefault();
  document.body.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    addFilesToPlaylist(Array.from(e.dataTransfer.files));
  }
});

// ============================================================
// #topControlsのPC幅レイアウト：Track/Play/Track・Repeat・Marker×3・Loopを
// 完全にフラットな1行として並べる。
//
// 当初はCSSの display: contents で.top-controls-row（行の箱）を透明化する
// 方式を試みたが、ブラウザ間の挙動差により確実に機能しなかったため、
// ここでJSが実際にDOM構造を組み替える方式にしている。
// PC幅になった瞬間、4つの要素(#playbackTripleBtn,
// #allRepeatToggleBtn, #markerNavBtn, #loopToggleBtn)を#topControls直下へ
// 移動し、空になった.top-controls-rowは非表示にする。
//
// 【将来撤去予定】このロジックは上のPC v2 build()が「先にこの関数が
// フラット化した#topControlsの状態」を前提として、その上にさらに
// ボタンを組み替える、という2段構えの依存関係になっている
// （詳細は上のbuild()内の該当コメント参照）。
// SP幅でもPC v2のtopControls構造をそのまま使うようになれば、この
// flattenForPc/restoreForSp、およびPC v2側のそれに依存する部分は
// 丸ごと不要になる見込み。大手術完了後に削除・統合すること。
// ============================================================
(function () {
  const topControls = document.getElementById("topControls");
  const topControlsRows = topControls ? topControls.querySelectorAll(".top-controls-row") : [];
  const row1 = topControlsRows[0] || null;
  const row2 = topControlsRows[1] || null;
  const playbackTripleBtn = document.getElementById("playbackTripleBtn");
  const allRepeatToggleBtn = document.getElementById("allRepeatToggleBtn");
  const markerNavBtn = document.getElementById("markerNavBtn");
  const loopToggleBtn = document.getElementById("loopToggleBtn");

  if (!topControls || !row1 || !row2 || !playbackTripleBtn || !allRepeatToggleBtn || !markerNavBtn || !loopToggleBtn) {
    return;
  }

  // PC v2のbuild()と同じブレークポイントで同期させる必要があるため、
  // こちらも画面幅を問わず常時有効化する。
  const PC_BREAKPOINT = "(min-width: 0px)";
  const mql = window.matchMedia(PC_BREAKPOINT);
  let isFlattened = false;

  function flattenForPc() {
    if (isFlattened) return;
    isFlattened = true;
    // 元の順序(Track/Play/Track → Repeat → Marker×3 → Loop)を保ったまま
    // #topControls直下へ移動する。appendChildは既存の親からその要素を
    // 自動的に取り除いてから新しい親に追加するため、明示的なremoveは不要。
    topControls.appendChild(playbackTripleBtn);
    topControls.appendChild(allRepeatToggleBtn);
    topControls.appendChild(markerNavBtn);
    topControls.appendChild(loopToggleBtn);
    row1.style.display = "none";
    row2.style.display = "none";
  }

  function restoreForSp() {
    if (!isFlattened) return;
    isFlattened = false;
    row1.style.display = "";
    row2.style.display = "";
    // 元の行構造に戻す（1段目：Track/Play/Track + Repeat、2段目：Marker×3 + Loop）。
    row1.appendChild(playbackTripleBtn);
    row1.appendChild(allRepeatToggleBtn);
    row2.appendChild(markerNavBtn);
    row2.appendChild(loopToggleBtn);
  }

  function syncTopControlsLayout() {
    if (mql.matches) {
      flattenForPc();
    } else {
      restoreForSp();
    }
  }

  syncTopControlsLayout();
  // addEventListenerでの登録はSafari等の古いバージョンでも安定して動く
  // (addListenerは非推奨のため使わない)。
  mql.addEventListener("change", syncTopControlsLayout);
})();
