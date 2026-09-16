// ============================================================
// player-playlist.js
// プレイリスト機能：ファイル追加、一覧描画、削除、ドラッグ並び替え、
// 指定インデックスへの再生切り替え（playTrackAt）、前後トラック送り。
//
// このファイルの中身はすべて関数宣言（トップレベルのconst/letは無し）
// のため、ブラウザは全<script>を1つのグローバルスコープとして扱うことから
// 他ファイル（player-core.js, player-ui-shared.js）との読み込み順は
// 実行時には影響しない。ただし可読性のため、状態・永続化を持つ
// player-core.jsより後、UIの土台であるplayer-ui-shared.jsより前に
// 置くことを推奨する。
//
// 依存する外部関数: hapticTap, hapticWarning, loadFile,
// updatePlayButtonState（いずれもplayer-ui-shared.js側）、
// savePlaylistTrack, deletePlaylistTrack, persistPlaylistOrder,
// setAppTitle（いずれもplayer-core.js側）。
// ============================================================

function addFilesToPlaylist(files) {
  const audioFiles = files.filter(f => f.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(f.name));
  if (audioFiles.length === 0) return;

  // シェアウェア制限：無料版はライブラリ3曲まで。既に3曲以上ある状態での
  // 追加操作はアンロックモーダルを表示してブロックする（既存データの削除はしない）。
  if (typeof isUnlocked === "function" && !isUnlocked() && playlist.length >= SW_LIMITS.LIBRARY_MAX_TRACKS) {
    swOpenUnlockModal(`無料版はライブラリに${SW_LIMITS.LIBRARY_MAX_TRACKS}曲までしか保存できません。`);
    return;
  }

  const wasEmpty = playlist.length === 0;
  audioFiles.forEach(file => {
    const track = { file, name: file.name, title: null, artist: null, duration: null, enabled: true };
    playlist.push(track);
    // 実体ごとIndexedDBに自動保存する（次回起動時に自動復元するため）。
    // 保存自体は非同期・失敗しても再生には影響しないため、結果を待たずに進める。
    savePlaylistTrack(file);

    // ID3タグ(Title/Artist)・長さ(duration)を非同期で読み取り、取得できたら
    // 反映して再描画する。読み取り自体に失敗・タグが無い場合はファイル名の
    //ままにする。
    if (typeof readId3Tags === "function") {
      readId3Tags(file).then(tags => {
        if (tags.title) track.title = tags.title;
        if (tags.artist) track.artist = tags.artist;
        if (tags.title || tags.artist) {
          renderPlaylist();
          savePlaylistMetadataFor(track);
        }
      });
    }
    if (typeof readAudioDuration === "function") {
      readAudioDuration(file).then(dur => {
        if (dur) {
          track.duration = dur;
          renderPlaylist();
        }
      });
    }
  });
  renderPlaylist();

  if (wasEmpty) {
    playTrackAt(0);
  }
}

// Playlist内のタイム表示用、m:ss形式（プレイリストのタイム表示は
// シークバーの時刻表示(formatTime、00:00.0形式)とは別に、曲の長さの
// 目安として分:秒のシンプルな表記にする）。
function formatTrackDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// クリックでテキスト編集可能になるinput要素を作る（Playlistのタイトル/
// アーティスト編集用）。通常時はテキスト表示、クリックで選択状態にして
// 直接書き換えられるようにし、blur/Enterで確定してonCommitを呼ぶ。
// 通常は<span>としてテキストを表示し、外部から起動されたときだけ<input>に
// 切り替わる編集可能フィールドを作る（Playlistのタイトル/アーティスト用）。
// 戻り値のwrapper要素をDOMに追加して使い、wrapper.startEdit()で
// 編集モードへの切り替えを外部（鉛筆アイコンのクリック等）から呼び出す。
function makeEditableText(value, className, placeholder, onCommit) {
  const wrapper = document.createElement("span");
  wrapper.className = "playlist-editable-field " + className;

  const display = document.createElement("span");
  display.className = "playlist-editable-display";
  display.textContent = value || placeholder || "";
  if (!value && placeholder) display.classList.add("playlist-editable-placeholder");

  wrapper.appendChild(display);

  wrapper.startEdit = () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "playlist-editable-input";
    input.value = value;
    input.placeholder = placeholder || "";
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = value;
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const newVal = input.value.trim();
      wrapper.replaceChild(display, input);
      if (newVal !== value) {
        value = newVal;
        display.textContent = value || placeholder || "";
        display.classList.toggle("playlist-editable-placeholder", !value && !!placeholder);
        onCommit(newVal);
      }
    });
    wrapper.replaceChild(input, display);
    input.focus();
    input.select();
  };

  return wrapper;
}

function renderPlaylist() {
  const box = document.getElementById("playlistBox");
  const info = document.getElementById("playlistInfo");
  if (info) info.textContent = `${playlist.length} track${playlist.length === 1 ? "" : "s"}`;
  if (!box) return;

  const editMode = typeof isPlaylistEditMode === "function" && isPlaylistEditMode();

  box.innerHTML = "";
  playlist.forEach((track, i) => {
    const item = document.createElement("div");
    item.className = "playlistItem";
    item.dataset.index = i;
    if (i === currentPlaylistIndex) item.classList.add("playing");
    if (!track.enabled) item.classList.add("disabled");

    // シェアウェア制限：無料版で4曲目以降(index >= LIBRARY_MAX_TRACKS)は
    // 削除せず保持・表示するが、鍵アイコン付きでロックする。
    const isLockedTrack = typeof isUnlocked === "function" && !isUnlocked() && i >= SW_LIMITS.LIBRARY_MAX_TRACKS;
    if (isLockedTrack) item.classList.add("sw-locked");

    // ドラッグ並び替え用のハンドル（この部分を掴んでドラッグする）
    const dragHandle = document.createElement("span");
    dragHandle.className = "playlist-drag-handle";
    dragHandle.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
    item.appendChild(dragHandle);

    // サムネイル画像（ID3のAPICフレームから取得できていればそれを表示、
    // 無ければ音符アイコンのプレースホルダー）。
    const thumb = document.createElement("div");
    thumb.className = "playlist-thumb";
    if (track.thumbnailUrl) {
      thumb.style.backgroundImage = `url("${track.thumbnailUrl}")`;
    } else {
      thumb.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
    }
    if (isLockedTrack) {
      const lockIcon = document.createElement("span");
      lockIcon.className = "sw-lock-icon";
      lockIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2m6-9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5 5 5 0 0 1 5 5v2h1M12 3a3 3 0 0 0-3 3v2h6V6a3 3 0 0 0-3-3z"/></svg>';
      thumb.appendChild(lockIcon);
      thumb.onclick = () => swOpenUnlockModal(`無料版はライブラリの${SW_LIMITS.LIBRARY_MAX_TRACKS}曲目までしか再生できません。`);
    }
    item.appendChild(thumb);

    // タイトル/アーティストの2行表示。ID3タグ(title/artist)が取得できて
    // いればそれを使い、無ければタイトル行にファイル名をそのまま出す
    // （アーティスト行は空のまま）。
    // 通常モード：クリックで再生。テキストにマウスを乗せた時だけ鉛筆
    // アイコンが浮かび上がり、それを押すと編集できる。
    // 編集モード（ヘッダーのEDITで切り替え）：常に入力可能な状態にする。
    const infoBlock = document.createElement("div");
    infoBlock.className = "playlist-info-block";
    infoBlock.onclick = (e) => {
      // 編集中(input化されている間)のクリックだけ再生をスキップする。
      // .playlist-editable-fieldは表示中も含めて常に存在するラッパー
      // クラスのため、これで判定すると通常時のクリックも常に無効化
      // されてしまっていた（再生されないバグの直接原因）。
      if (e.target.closest(".playlist-editable-input")) return;
      if (e.target.closest(".playlist-hover-edit-btn")) return;
      if (isLockedTrack) {
        swOpenUnlockModal(`無料版はライブラリの${SW_LIMITS.LIBRARY_MAX_TRACKS}曲目までしか再生できません。`);
        return;
      }
      playTrackAt(parseInt(item.dataset.index, 10));
    };

    const titleRow = document.createElement("div");
    titleRow.className = "playlist-title-row";
    const titleField = makeEditableText(
      track.title || track.name,
      "playlist-title",
      "",
      (newVal) => { track.title = newVal; savePlaylistMetadataFor(track); }
    );
    titleRow.appendChild(titleField);
    if (!editMode) {
      const titleHoverBtn = document.createElement("button");
      titleHoverBtn.className = "playlist-hover-edit-btn";
      titleHoverBtn.title = "Edit title";
      titleHoverBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      titleHoverBtn.onclick = (e) => { e.stopPropagation(); titleField.startEdit(); };
      titleRow.appendChild(titleHoverBtn);
    }
    infoBlock.appendChild(titleRow);

    const artistRow = document.createElement("div");
    artistRow.className = "playlist-artist-row";
    const artistField = makeEditableText(
      track.artist || "",
      "playlist-artist",
      "Artist",
      (newVal) => { track.artist = newVal; savePlaylistMetadataFor(track); }
    );
    artistRow.appendChild(artistField);
    if (!editMode) {
      const artistHoverBtn = document.createElement("button");
      artistHoverBtn.className = "playlist-hover-edit-btn";
      artistHoverBtn.title = "Edit artist";
      artistHoverBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      artistHoverBtn.onclick = (e) => { e.stopPropagation(); artistField.startEdit(); };
      artistRow.appendChild(artistHoverBtn);
    }
    infoBlock.appendChild(artistRow);

    item.appendChild(infoBlock);

    // 編集モード中は、常にタイトル/アーティストが入力可能な状態にする
    // （通常モードのホバー鉛筆の代わりに、最初からinputを出しておく）。
    if (editMode) {
      titleField.startEdit();
      artistField.startEdit();
    }

    // 編集モード時はタイム表記を出さない（PLAY/SKIPトグルと削除チェックの
    // 分だけスペースが必要なため、durationは通常モードのみ表示する）。
    if (!editMode) {
      const durationSpan = document.createElement("span");
      durationSpan.className = "playlist-duration";
      durationSpan.textContent = formatTrackDuration(track.duration);
      item.appendChild(durationSpan);
    }

    if (editMode) {
      // 編集モード時：曲送り時スルーする/しないを一目で分かるトグルで表示する
      // （通常モードの「表示/非表示」アイコンに代わるもの。意味合いは
      // 「この曲を自動再生の順送りに含めるかどうか」）。
      const skipToggle = document.createElement("button");
      skipToggle.className = "playlist-skip-toggle";
      skipToggle.classList.toggle("skip-off", track.enabled);
      skipToggle.title = track.enabled ? "Included in auto-advance (click to skip)" : "Skipped during auto-advance (click to include)";
      skipToggle.innerHTML = '<span class="playlist-skip-toggle-label">' + (track.enabled ? "PLAY" : "SKIP") + '</span>';
      skipToggle.onclick = (e) => {
        e.stopPropagation();
        track.enabled = !track.enabled;
        renderPlaylist();
        persistPlaylistOrder();
      };
      item.appendChild(skipToggle);

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.className = "del-btn";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (delBtn.classList.contains("confirm")) {
          hapticWarning();
          removeTrackAt(parseInt(item.dataset.index, 10));
        } else {
          hapticTap();
          delBtn.classList.add("confirm");
          delBtn.textContent = "✓";
          clearTimeout(delBtn._confirmTimer);
          delBtn._confirmTimer = setTimeout(() => {
            delBtn.classList.remove("confirm");
            delBtn.textContent = "✕";
          }, 3000);
        }
      };
      item.appendChild(delBtn);
    }
    // 通常モードでは⋮メニューを廃止。ファイル名変更は曲名/アーティスト
    // 欄のホバー鉛筆編集に統合済み、曲送り時スルーON/OFFはEDITモードの
    // PLAY/SKIPトグルから行う。

    box.appendChild(item);
  });

  setupPlaylistDragReorder(box);
}

function removeTrackAt(index) {
  if (index < 0 || index >= playlist.length) return;

  const removingCurrent = index === currentPlaylistIndex;
  const removedName = playlist[index].name;
  playlist.splice(index, 1);
  // 実体もIndexedDBから削除する（残したままだと次回起動時に消したはずの曲が復活してしまう）
  deletePlaylistTrack(removedName);

  if (removingCurrent) {
    // 再生中の曲を削除した場合：可能なら次の曲、なければ前の曲、どちらもなければ停止
    if (playlist.length === 0) {
      currentPlaylistIndex = -1;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setAppTitle("No file loaded");
      updatePlayButtonState();
    } else {
      const nextIndex = Math.min(index, playlist.length - 1);
      playTrackAt(nextIndex);
      return; // playTrackAt内でrenderPlaylistが呼ばれる
    }
  } else if (index < currentPlaylistIndex) {
    currentPlaylistIndex--;
  }

  renderPlaylist();
}

function playTrackAt(index, autoplay = true) {
  if (index < 0 || index >= playlist.length) return;
  currentPlaylistIndex = index;
  loadFile(playlist[index].file);
  renderPlaylist();
  if (autoplay) {
    // loadFile側のonloadedmetadataが発火してdurationやUIの準備が整うのを待ってから再生する。
    // audio.currentSrcの変化を待つのではなく、onloadedmetadataに便乗して1回だけ再生する。
    const playOnceReady = () => {
      audio.removeEventListener("loadedmetadata", playOnceReady);
      audio.play().catch(() => {});
    };
    audio.addEventListener("loadedmetadata", playOnceReady);
  }
}

// 指定したインデックスより後ろ（direction=1）または前（direction=-1）で、
// 最初に見つかったON(enabled)な曲のインデックスを返す。wrapAroundがtrueなら
// 端まで来たら反対の端から探し直す（プレイリスト全体をループする場面向け）。
// 見つからなければ(全曲OFF等)-1を返す。
function findEnabledTrackIndex(fromIndex, direction, wrapAround) {
  if (playlist.length === 0) return -1;
  let i = fromIndex + direction;
  for (let steps = 0; steps < playlist.length; steps++) {
    if (i < 0 || i >= playlist.length) {
      if (!wrapAround) return -1;
      i = i < 0 ? playlist.length - 1 : 0;
    }
    if (playlist[i] && playlist[i].enabled !== false) return i;
    i += direction;
  }
  return -1;
}

// プレイリストの前/次の曲へ手動で移動する（コントロール部分の三分割ボタンから使う）。
// OFFの曲は自動でスキップする。全体リピート(all)の時だけ端まで来たら反対側からループする。
// 現在再生中の曲の先頭(0秒)に戻す。モック準拠のPC v2下段バー「Start」ボタン用の新機能。
function seekToTrackStart() {
  if (!audio.duration) return;
  hapticTap();
  isSeeking = true;
  audio.currentTime = 0;
  prevTime = 0;
  renderSegments(getActiveSegment(0));
  setTimeout(() => { isSeeking = false; }, 150);
}

function playPrevTrack() {
  if (currentPlaylistIndex < 0) return;
  hapticTap();
  const wrapAround = repeatMode === "all";
  const prevIndex = findEnabledTrackIndex(currentPlaylistIndex, -1, wrapAround);
  if (prevIndex !== -1) playTrackAt(prevIndex);
}

function playNextTrack() {
  if (currentPlaylistIndex < 0) return;
  hapticTap();
  const wrapAround = repeatMode === "all";
  const nextIndex = findEnabledTrackIndex(currentPlaylistIndex, 1, wrapAround);
  if (nextIndex !== -1) playTrackAt(nextIndex);
}

// ============================================================
// プレイリストのドラッグ並び替え（マウス・タッチ両対応）
// ドラッグハンドル(.playlist-drag-handle)を掴んで上下にドラッグすると、
// 通過した位置に応じて他のアイテムを押しのけながら並び替わる。
// 離した時点でplaylist配列を実際に並び替え、currentPlaylistIndexも追従させる。
// ============================================================
function setupPlaylistDragReorder(box) {
  const handles = box.querySelectorAll(".playlist-drag-handle");

  handles.forEach(handle => {
    let dragging = false;
    let draggedItem = null;
    let startY = 0;
    let startIndex = 0; // ドラッグ開始時点でのdraggedItemのDOM上のインデックス
    let itemHeight = 0; // 1アイテムあたりの高さ(gapを含む)。ドラッグ開始時に実測して固定する。
    let itemCount = 0;

    function getItems() {
      return Array.from(box.querySelectorAll(".playlistItem"));
    }

    // ドラッグ中のアイテム以外を、最終的にあるべき位置に並べ直す。
    // draggedItem自体はtransformで見た目だけ動かし続け、実際のDOM順序の変更は
    // ドラッグ終了時(onEnd)に一度だけ行う（ドラッグ中に頻繁にinsertBeforeし直すと、
    // その都度レイアウトが変わって基準がずれ、複数要素が一気に動いて見える不具合の原因になっていたため）。
    function onMove(clientY) {
      if (!dragging || !draggedItem) return;
      const dy = clientY - startY;
      draggedItem.style.transform = `translateY(${dy}px)`;

      if (itemHeight <= 0) return;

      // dyをアイテム高さで割って「何個分移動したか」を直接求める。
      // Math.roundにより、半分以上重なったところで初めて順位が入れ替わる自然な挙動になる。
      const moveSteps = Math.round(dy / itemHeight);
      let targetIndex = startIndex + moveSteps;
      targetIndex = Math.max(0, Math.min(itemCount - 1, targetIndex));

      const items = getItems();
      items.forEach((item, currentIndex) => {
        if (item === draggedItem) return;
        // このアイテムが現在ドラッグ中アイテムより手前(index的に小さい)にあり、
        // かつドラッグ中アイテムの移動先がそのアイテムの位置以下になった場合、1つ下にずらす。
        // 逆に後ろにあり、移動先がそのアイテムの位置以上になった場合は1つ上にずらす。
        // （実際のDOM順序は変えず、見た目の位置だけtransformでずらす。確定はonEndでまとめて行う。）
        const originalIndex = parseInt(item.dataset.dragOriginalIndex, 10);
        let shift = 0;
        if (originalIndex < startIndex && originalIndex >= targetIndex) {
          shift = 1; // ドラッグ中アイテムがこのアイテムを追い越して上に来た分、このアイテムは1つ下にずれる
        } else if (originalIndex > startIndex && originalIndex <= targetIndex) {
          shift = -1; // ドラッグ中アイテムがこのアイテムを追い越して下に来た分、このアイテムは1つ上にずれる
        }
        item.style.transform = shift !== 0 ? `translateY(${shift * itemHeight}px)` : "translateY(0px)";
      });

      draggedItem.dataset.dragTargetIndex = targetIndex;
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);

      const targetIndex = draggedItem ? parseInt(draggedItem.dataset.dragTargetIndex || startIndex, 10) : startIndex;

      if (draggedItem) {
        draggedItem.classList.remove("dragging");
        draggedItem.style.transform = "";
      }
      getItems().forEach(item => { item.style.transform = ""; });

      // playlist配列を、ドラッグ開始時の元の並び順(dragOriginalIndex)を基準に、
      // draggedItemだけをtargetIndexの位置に差し替えて作り直す。
      if (targetIndex !== startIndex) {
        const originalOrder = getItems()
          .slice()
          .sort((a, b) => parseInt(a.dataset.dragOriginalIndex, 10) - parseInt(b.dataset.dragOriginalIndex, 10))
          .map(el => playlist[parseInt(el.dataset.index, 10)]);

        const movedTrack = originalOrder[startIndex];
        originalOrder.splice(startIndex, 1);
        originalOrder.splice(targetIndex, 0, movedTrack);

        const playingTrack = currentPlaylistIndex >= 0 ? playlist[currentPlaylistIndex] : null;
        playlist.length = 0;
        originalOrder.forEach(t => playlist.push(t));
        if (playingTrack) {
          currentPlaylistIndex = playlist.indexOf(playingTrack);
        }

        persistPlaylistOrder();
      }

      renderPlaylist();
    }

    function onMouseMove(e) { onMove(e.clientY); }
    function onMouseUp() { onEnd(); }
    function onTouchMove(e) {
      if (e.touches.length !== 1) return;
      e.preventDefault(); // ドラッグ中はページの縦スクロールを止める
      onMove(e.touches[0].clientY);
    }
    function onTouchEnd() { onEnd(); }

    function startDrag(clientY) {
      // シェアウェア制限：無料版は並び替え不可。ドラッグ自体を開始させず、
      // 通知だけ表示する。
      if (typeof isUnlocked === "function" && !isUnlocked()) {
        swOpenUnlockModal("無料版ではライブラリの並び替えはできません。");
        return;
      }

      draggedItem = handle.closest(".playlistItem");
      if (!draggedItem) return;

      const items = getItems();
      itemCount = items.length;
      startIndex = items.indexOf(draggedItem);
      if (startIndex === -1) return;

      // ドラッグ開始時点の並び順を、各アイテムのdatasetに固定で記録しておく。
      // ドラッグ中はDOM順序自体を変えないため、この記録がそのままonMoveでの位置計算の基準になる。
      items.forEach((item, i) => { item.dataset.dragOriginalIndex = i; });

      // 実際のアイテム1個分の高さ(gap込み)を実測する。2個以上ある時だけ隣接アイテムとの差分から求め、
      // 1個しかない場合はアイテム自体の高さをそのまま使う。
      const rect = draggedItem.getBoundingClientRect();
      if (items.length > 1) {
        const otherIndex = startIndex === 0 ? 1 : startIndex - 1;
        const otherRect = items[otherIndex].getBoundingClientRect();
        itemHeight = Math.abs(otherRect.top - rect.top) || rect.height;
      } else {
        itemHeight = rect.height;
      }

      dragging = true;
      startY = clientY;
      draggedItem.classList.add("dragging");
      draggedItem.dataset.dragTargetIndex = startIndex;
      hapticTap();
    }

    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      startDrag(e.clientY);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    handle.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) return;
      startDrag(e.touches[0].clientY);
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
    }, { passive: true });
  });
}

// （⋮メニューは廃止。ファイル名変更はホバー鉛筆編集、スルーON/OFFは
// EDITモードのPLAY/SKIPトグルに統合済み。）

// シェアウェア制限：広告解除/サブスク購入した瞬間、ライブラリの鍵アイコン表示を
// 即座に更新するため、player-shareware.js側のリフレッシュ機構に登録する。
if (typeof swRegisterRefreshCallback === "function") {
  swRegisterRefreshCallback(() => { if (typeof renderPlaylist === "function") renderPlaylist(); });
}
