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

  const wasEmpty = playlist.length === 0;
  audioFiles.forEach(file => {
    playlist.push({ file, name: file.name, enabled: true });
    // 実体ごとIndexedDBに自動保存する（次回起動時に自動復元するため）。
    // 保存自体は非同期・失敗しても再生には影響しないため、結果を待たずに進める。
    savePlaylistTrack(file);
  });
  renderPlaylist();

  if (wasEmpty) {
    playTrackAt(0);
  }
}

function renderPlaylist() {
  const box = document.getElementById("playlistBox");
  const info = document.getElementById("playlistInfo");
  if (info) info.textContent = `${playlist.length} track${playlist.length === 1 ? "" : "s"}`;
  if (!box) return;

  box.innerHTML = "";
  playlist.forEach((track, i) => {
    const item = document.createElement("div");
    item.className = "playlistItem";
    item.dataset.index = i;
    if (i === currentPlaylistIndex) item.classList.add("playing");

    // ドラッグ並び替え用のハンドル（この部分を掴んでドラッグする）
    const dragHandle = document.createElement("span");
    dragHandle.className = "playlist-drag-handle";
    dragHandle.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
    item.appendChild(dragHandle);

    const nameSpan = document.createElement("span");
    nameSpan.className = "playlist-name";
    nameSpan.textContent = track.name;
    nameSpan.title = track.name;
    nameSpan.onclick = () => playTrackAt(parseInt(item.dataset.index, 10));
    item.appendChild(nameSpan);

    if (!track.enabled) {
      item.classList.add("disabled");
    }

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.title = track.enabled ? "Track enabled (click to disable)" : "Track disabled (click to enable, skipped during playback)";
    // ON: 目が開いたアイコン、OFF: 目に斜線が入ったアイコン（マーカーのON/OFFアイコンと同じデザイン）
    toggleBtn.innerHTML = track.enabled
      ? '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 6.5c3.79 0 7.17 2.13 8.82 5.5-.59 1.2-1.42 2.25-2.42 3.11l1.42 1.42c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.61 17 4.5 12 4.5c-1.27 0-2.49.2-3.64.57l1.65 1.65c.62-.14 1.28-.22 1.99-.22zM2.71 3.16L1.29 4.57 4 7.27C2.36 8.53 1.07 10.15 0.18 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l3.01 3.01 1.41-1.41L2.71 3.16zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57 0 1.66 1.34 3 3 3 .2 0 .38-.03.57-.07l1.57 1.57c-.65.32-1.37.5-2.14.5zm2.97-5.33c-.15-1.4-1.25-2.49-2.64-2.64l2.64 2.64z"/></svg>';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      track.enabled = !track.enabled;
      renderPlaylist();
      persistPlaylistOrder();
    };
    item.appendChild(toggleBtn);

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
