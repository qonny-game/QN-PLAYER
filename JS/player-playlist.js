// player-playlist.js — ファイル追加/一覧描画/削除/ドラッグ並び替え/playTrackAt/前後送り。関数宣言のみなので読込順は実行時に影響しない(推奨: core→playlist→ui-shared)。
// 依存: hapticTap,hapticWarning,loadFile,updatePlayButtonState(ui-shared)、savePlaylistTrack,deletePlaylistTrack,persistPlaylistOrder,setAppTitle(core)

function addFilesToPlaylist(files) {
  const audioFiles = files.filter(f => f.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(f.name));
  if (audioFiles.length === 0) return;

  // 無料版: ライブラリ3曲まで。超過時はアンロックモーダルでブロック(既存は消さない)
  if (typeof isUnlocked === "function" && !isUnlocked() && playlist.length >= SW_LIMITS.LIBRARY_MAX_TRACKS) {
    swShowUnlockToast(`無料版はライブラリに${SW_LIMITS.LIBRARY_MAX_TRACKS}曲までしか保存できません。`);
    return;
  }

  const wasEmpty = playlist.length === 0;
  audioFiles.forEach(file => {
    const track = { file, name: file.name, title: null, artist: null, duration: null, enabled: true, favorite: false };
    playlist.push(track);
    // IndexedDBへ自動保存(非同期。失敗しても再生に影響しないので待たない)
    savePlaylistTrack(file);

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

function formatTrackDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

    const isLockedTrack = typeof isUnlocked === "function" && !isUnlocked() && i >= SW_LIMITS.LIBRARY_MAX_TRACKS;
    if (isLockedTrack) item.classList.add("sw-locked");

    if (!editMode) {
      item.addEventListener("click", (e) => {
        if (e.target.closest("button, input, textarea, .playlist-drag-handle, .playlist-info-block")) return;
        if (isLockedTrack) {
          if (e.target.closest(".playlist-thumb")) return;
          swShowUnlockToast(`無料版はライブラリの${SW_LIMITS.LIBRARY_MAX_TRACKS}曲目までしか再生できません。`);
          return;
        }
        playTrackAt(parseInt(item.dataset.index, 10));
      });
    }

    const dragHandle = document.createElement("span");
    dragHandle.className = "playlist-drag-handle";
    dragHandle.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
    item.appendChild(dragHandle);

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
      thumb.onclick = () => swShowUnlockToast(`無料版はライブラリの${SW_LIMITS.LIBRARY_MAX_TRACKS}曲目までしか再生できません。`);
    }
    item.appendChild(thumb);

    const infoBlock = document.createElement("div");
    infoBlock.className = "playlist-info-block";
    infoBlock.onclick = (e) => {
      // 編集中(input化中)のクリックだけスキップ。.playlist-editable-fieldは常在ラッパーなので判定に使うな(通常時も無効化される)
      if (e.target.closest(".playlist-editable-input")) return;
      if (e.target.closest(".playlist-hover-edit-btn")) return;
      if (isLockedTrack) {
        swShowUnlockToast(`無料版はライブラリの${SW_LIMITS.LIBRARY_MAX_TRACKS}曲目までしか再生できません。`);
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

    if (editMode) {
      titleField.startEdit();
      artistField.startEdit();
    }

    // 編集モードはdurationを出さない(PLAY/SKIPトグルと削除チェックの場所が要る)
    if (!editMode) {
      const durationSpan = document.createElement("span");
      durationSpan.className = "playlist-duration";
      durationSpan.textContent = formatTrackDuration(track.duration);
      item.appendChild(durationSpan);

      const favoriteBtn = document.createElement("button");
      favoriteBtn.type = "button";
      favoriteBtn.className = "playlist-favorite-btn";
      favoriteBtn.classList.toggle("is-favorite", !!track.favorite);
      favoriteBtn.title = track.favorite ? "お気に入りから外す" : "お気に入りに追加（リスト上段に固定）";
      favoriteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>';
      favoriteBtn.onclick = (e) => {
        e.stopPropagation();
        toggleTrackFavorite(parseInt(item.dataset.index, 10));
      };
      item.appendChild(favoriteBtn);
    }

    if (editMode) {
      // 編集モード: PLAY/SKIPトグル(自動送りに含めるか)。.del-btn選択が1件でもあれば押せない(renderPlaylist()がDOMを作り直すと選択表示が消えるため。window.playlistHasSelectedItemsはplayer-ui-pc-v2.js公開)
      const hasSelection = typeof window.playlistHasSelectedItems === "function" && window.playlistHasSelectedItems();
      const skipToggle = document.createElement("button");
      skipToggle.className = "playlist-skip-toggle";
      skipToggle.classList.toggle("skip-off", track.enabled);
      skipToggle.disabled = hasSelection;
      const baseTitle = track.enabled ? "Included in auto-advance (click to skip)" : "Skipped during auto-advance (click to include)";
      skipToggle.dataset.baseTitle = baseTitle;
      skipToggle.title = hasSelection ? "削除の選択中は切り替えられません" : baseTitle;
      skipToggle.innerHTML = '<span class="playlist-skip-toggle-label">' + (track.enabled ? "PLAY" : "SKIP") + '</span>';
      skipToggle.onclick = (e) => {
        e.stopPropagation();
        if (hasSelection) return;
        track.enabled = !track.enabled;
        renderPlaylist();
        persistPlaylistOrder();
      };
      item.appendChild(skipToggle);

      const delZone = document.createElement("div");
      delZone.className = "playlist-del-zone";

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.className = "del-btn";
      delBtn.tabIndex = -1;
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
      delZone.appendChild(delBtn);
      item.appendChild(delZone);
    }

    box.appendChild(item);
  });

  setupPlaylistDragReorder(box);
}

// お気に入り: ONは「お気に入り群の末尾」、OFFは「非お気に入り群の先頭」へ配列内を実際に移動。ドラッグ並び替えは変更しない(群をまたいだらピンを押し直すと境界へ戻る)
function toggleTrackFavorite(index) {
  if (index < 0 || index >= playlist.length) return;
  hapticTap();

  const currentTrackRef = currentPlaylistIndex !== -1 ? playlist[currentPlaylistIndex] : null;

  const track = playlist[index];
  track.favorite = !track.favorite;

  playlist.splice(index, 1);
  let insertAt;
  if (track.favorite) {
    insertAt = playlist.findIndex(t => !t.favorite);
    if (insertAt === -1) insertAt = playlist.length;
  } else {
    let lastFavoriteIndex = -1;
    for (let i = 0; i < playlist.length; i++) {
      if (playlist[i].favorite) lastFavoriteIndex = i;
    }
    insertAt = lastFavoriteIndex + 1;
  }
  playlist.splice(insertAt, 0, track);

  if (currentTrackRef) {
    currentPlaylistIndex = playlist.indexOf(currentTrackRef);
  }

  renderPlaylist();
  persistPlaylistOrder();
}

function removeTrackAt(index) {
  if (index < 0 || index >= playlist.length) return;

  const removingCurrent = index === currentPlaylistIndex;
  const removedName = playlist[index].name;
  playlist.splice(index, 1);
  deletePlaylistTrack(removedName);

  if (removingCurrent) {
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
      return;
    }
  } else if (index < currentPlaylistIndex) {
    currentPlaylistIndex--;
  }

  renderPlaylist();
}

function playTrackAt(index, autoplay = true) {
  if (index < 0 || index >= playlist.length) return;
  // 【v2.16.8】無料版ロック曲(index>=LIBRARY_MAX_TRACKS)の最終防衛ライン(GOTCHAS.md)。前/次ボタン・mediaSession・audio.onended等がplayTrackAt()を直接呼ぶので、ここで一律ブロックする
  const isLockedTrack = typeof isUnlocked === "function" && !isUnlocked() && index >= SW_LIMITS.LIBRARY_MAX_TRACKS;
  if (isLockedTrack) {
    swShowUnlockToast(`無料版はライブラリの${SW_LIMITS.LIBRARY_MAX_TRACKS}曲目までしか再生できません。`);
    return;
  }
  currentPlaylistIndex = index;
  loadFile(playlist[index].file);
  if (autoplay) {
    // audio.play()はタップのコールスタック内で同期的に呼ぶ(loadedmetadata待ちだと自動再生ポリシーでブロック＝SPで1タップ目が再生されない)。renderPlaylist()より必ず先に呼ぶ(後だと曲数多い時に間隔が開き再発)
    audio.play().catch(() => {});
  }
  renderPlaylist();
}

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

function seekToTrackStart() {
  if (!audio.duration) return;
  hapticTap();
  beginSeek();
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

function setupPlaylistDragReorder(box) {
  const handles = box.querySelectorAll(".playlist-drag-handle");

  handles.forEach(handle => {
    let dragging = false;
    let draggedItem = null;
    let startY = 0;
    let startIndex = 0;
    let itemHeight = 0;
    let itemCount = 0;

    function getItems() {
      return Array.from(box.querySelectorAll(".playlistItem"));
    }

    // ドラッグ中アイテム以外を最終位置へ。draggedItemはtransformのみ、DOM順変更はonEndで1回だけ(ドラッグ中のinsertBeforeは基準がズレて複数要素が一気に動く)
    function onMove(clientY) {
      if (!dragging || !draggedItem) return;
      const dy = clientY - startY;
      draggedItem.style.transform = `translateY(${dy}px)`;

      if (itemHeight <= 0) return;

      const moveSteps = Math.round(dy / itemHeight);
      let targetIndex = startIndex + moveSteps;
      targetIndex = Math.max(0, Math.min(itemCount - 1, targetIndex));

      const items = getItems();
      items.forEach((item, currentIndex) => {
        if (item === draggedItem) return;
        // 手前にあり移動先がその位置以下→1つ下へ、後ろにあり移動先がその位置以上→1つ上へ(transformのみ。確定はonEnd)
        const originalIndex = parseInt(item.dataset.dragOriginalIndex, 10);
        let shift = 0;
        if (originalIndex < startIndex && originalIndex >= targetIndex) {
          shift = 1;
        } else if (originalIndex > startIndex && originalIndex <= targetIndex) {
          shift = -1;
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
      e.preventDefault();
      onMove(e.touches[0].clientY);
    }
    function onTouchEnd() { onEnd(); }

    function startDrag(clientY) {
      // 無料版: 並び替え不可。ドラッグ開始させずミニポップアップ
      if (typeof isUnlocked === "function" && !isUnlocked()) {
        swShowUnlockToast("無料版ではライブラリの並び替えはできません。");
        return;
      }

      draggedItem = handle.closest(".playlistItem");
      if (!draggedItem) return;

      const items = getItems();
      itemCount = items.length;
      startIndex = items.indexOf(draggedItem);
      if (startIndex === -1) return;

      // ドラッグ開始時の並びをdatasetに固定記録(onMove位置計算の基準。ドラッグ中DOM順は変えない)
      items.forEach((item, i) => { item.dataset.dragOriginalIndex = i; });

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

if (typeof swRegisterRefreshCallback === "function") {
  swRegisterRefreshCallback(() => { if (typeof renderPlaylist === "function") renderPlaylist(); });
}
