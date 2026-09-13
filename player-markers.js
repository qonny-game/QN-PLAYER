// ============================================================
// player-markers.js
// マーカー機能：追加・前後ジャンプ、波形上のピン描画、ドラッグ移動、
// マーカーカラーピッカー、メモ編集、ループ区間(segmentHighlight)描画。
//
// 依存: player-core.js（pins配列, savePins, getSegments, hexToRgba,
// MARKER_COLOR_PALETTE等）、player-ui-shared.js（hapticTap等の共通UI関数,
// isMobileLayout）、player-ui-pc.js（startDragPin）。
// このファイル自体はトップレベルのconst/letとしてDOM要素を取得している箇所が
// あるため、DOM構築後（bodyの終わり際）に読み込むこと。
// ============================================================

function addCurrentPin() {
  if (!audio.duration) return;
  hapticSuccess();
  pins.push({ t: audio.currentTime, enabled: true, memo: "", color: null });
  pins.sort((a, b) => a.t - b.t);
  renderPins();
  renderSegments();
  renderPinList();
  savePins();
}

document.getElementById("addPinBtn").onclick = addCurrentPin;

function jumpToNextMarker() {
  const activePins = pins.filter(p => p.enabled);
  if (activePins.length === 0) return;
  hapticTap();

  const ct = audio.currentTime;
  let nextPin = activePins.find(p => p.t > ct + 0.05);
  if (!nextPin) nextPin = activePins[0];

  isSeeking = true;
  audio.currentTime = nextPin.t;
  prevTime = nextPin.t;
  audio.play();
  updatePlayButtonState();
  renderSegments(getActiveSegment(nextPin.t));
  setTimeout(() => { isSeeking = false; }, 150);
}

function jumpToPrevMarker() {
  const activePins = pins.filter(p => p.enabled);
  if (activePins.length === 0) return;
  hapticTap();

  const ct = audio.currentTime;

  // 現在地より前（＝すでに通過した）マーカーのうち、一番近いものを「直近マーカー」とする
  let targetPin = [...activePins].reverse().find(p => p.t <= ct + 0.05);

  if (targetPin) {
    const diff = ct - targetPin.t;
    if (diff <= 0.5) {
      // 直近マーカーへの到達からまだ0.5秒以内 → もう1つ前のマーカーへ
      const earlierPins = activePins.filter(p => p.t < targetPin.t - 0.05);
      if (earlierPins.length > 0) {
        targetPin = earlierPins[earlierPins.length - 1];
      } else {
        targetPin = activePins[activePins.length - 1];
      }
    }
  } else {
    targetPin = activePins[activePins.length - 1];
  }

  isSeeking = true;
  audio.currentTime = targetPin.t;
  prevTime = targetPin.t;
  audio.play();
  updatePlayButtonState();
  renderSegments(getActiveSegment(targetPin.t));
  setTimeout(() => { isSeeking = false; }, 150);
}

const prevMarkerBtn = document.getElementById("prevMarkerBtn");
if (prevMarkerBtn) prevMarkerBtn.onclick = jumpToPrevMarker;

const nextMarkerBtn = document.getElementById("nextMarkerBtn");
if (nextMarkerBtn) nextMarkerBtn.onclick = jumpToNextMarker;

function renderPins() {
  const dur = audio.duration;

  document.querySelectorAll(".vbar").forEach(bar => {
    bar.querySelectorAll(".vbar-line").forEach(p => p.remove());
  });

  pins.forEach((pinObj, i) => {
    const t = pinObj.t;
    const row = getPinRow(t, dur);
    const x = timeToPercentInRow(t, dur);

    const line = document.createElement("div");
    line.className = "vbar-line";
    if (!pinObj.enabled) {
      line.classList.add("disabled");
    }
    line.style.left = `${x}%`;
    // マーカーに色が設定されていれば、ライン(縦線)の背景色に反映する。
    // ただし無効化中(disabled)は専用の見た目を優先し、
    // インラインスタイルで上書きしないようにする（詳細度でCSS側の状態表現が負けてしまうため）。
    // 番号バッジ(.vbar-label)側は視認性のため、マーカー個別色やテーマカラーに関わらず
    // 常にCSS側の黒背景固定にする（ここでインラインstyleを上書きしない）。
    const applyMarkerColor = pinObj.color && MARKER_COLOR_PALETTE[pinObj.color] && pinObj.enabled;
    if (applyMarkerColor) {
      line.style.background = MARKER_COLOR_PALETTE[pinObj.color];
    }

    const label = document.createElement("span");
    label.className = "vbar-label";
    label.textContent = `${i + 1}`;

    function handleMarkerTapOrDrag(e) {
      e.stopPropagation();
      // タップ（クリック）は常にそのマーカーへシーク＆再生する。
      // 以前はスマホだけMOVEモード（再タップで選択→別の位置をタップして移動）に
      // 分岐していたが、意図通りに動作しなかったため廃止し、PC/スマホ共通で
      // 直接ドラッグ（下のonmousedown/ontouchstart）で動かす方式に統一した。
      isSeeking = true;
      audio.currentTime = pinObj.t;
      prevTime = pinObj.t;
      audio.play();
      updatePlayButtonState();
      renderSegments(getActiveSegment(pinObj.t));
      setTimeout(() => { isSeeking = false; }, 150);
    }

    label.onclick = handleMarkerTapOrDrag;
    line.onclick = handleMarkerTapOrDrag;

    // ドラッグでマーカーを直接動かせる。PC(mousedown)・スマホ(touchstart)共通で
    // startDragPin（player-ui-pc.js）を使う。startDragPin自体はe.typeを見て
    // マウス/タッチ両方のイベントに対応済み。
    label.onmousedown = startDragPin(i);
    line.onmousedown = startDragPin(i);
    label.ontouchstart = startDragPin(i);
    line.ontouchstart = startDragPin(i);

    line.appendChild(label);

    const targetBar = document.getElementById(`bar${row}`);
    if (targetBar) {
      targetBar.appendChild(line);
    }
  });

  const activeCount = pins.filter(p => p.enabled).length;
  const loopInfo = document.getElementById("loopInfo");
  if (loopInfo) {
    loopInfo.textContent = `ACTIVE ${activeCount}/${pins.length}`;
  }
}

function renderSegments(overrideSegment) {
  const dur = audio.duration;
  if (!dur) return;

  document.querySelectorAll(".vbar").forEach(bar => {
    bar.querySelectorAll(".segmentHighlight").forEach(s => s.remove());
  });

  if (!loopEnabled) return;

  // ループジャンプ直後など、audio.currentTimeの読み取りタイミングに左右されず
  // 確実に正しい区間を描画したい場合は、呼び出し側から区間を明示的に渡す。
  const active = overrideSegment || getActiveSegment();
  if (!active) return;

  const { s1, s2, s3, s4, s5 } = getSegments(dur);
  const barsInfo = [
    { el: document.getElementById("bar1"), start: 0, end: s1 },
    { el: document.getElementById("bar2"), start: s1, end: s2 },
    { el: document.getElementById("bar3"), start: s2, end: s3 },
    { el: document.getElementById("bar4"), start: s3, end: s4 },
    { el: document.getElementById("bar5"), start: s4, end: s5 },
    { el: document.getElementById("bar6"), start: s5, end: dur }
  ];

  barsInfo.forEach(b => {
    const overlapStart = Math.max(active.start, b.start);
    const overlapEnd = Math.min(active.end, b.end);

    if (overlapStart < overlapEnd) {
      const leftPct = ((overlapStart - b.start) / (b.end - b.start)) * 100;
      const rightPct = ((overlapEnd - b.start) / (b.end - b.start)) * 100;
      const widthPct = rightPct - leftPct;

      const seg = document.createElement("div");
      seg.className = "segmentHighlight";
      seg.style.left = leftPct + "%";
      seg.style.width = widthPct + "%";
      // マーカーに色が設定されていれば、その色をループエリアの背景・枠線に反映する。
      // 未設定（null）ならCSS側のデフォルト(--accent-glow/--accent-primary)のまま。
      if (active.color && MARKER_COLOR_PALETTE[active.color]) {
        const hex = MARKER_COLOR_PALETTE[active.color];
        seg.style.background = hexToRgba(hex, 0.35);
        seg.style.borderTop = `2px solid ${hex}`;
        seg.style.borderBottom = `2px solid ${hex}`;
      }

      seg.onclick = () => {
        isSeeking = true;
        audio.currentTime = active.start;
        prevTime = active.start;
        audio.play();
        updatePlayButtonState();
        renderSegments(active);
        setTimeout(() => { isSeeking = false; }, 150);
      };

      b.el.appendChild(seg);
    }
  });
}

// startDragPin関数の定義は player-ui-pc.js に移動済み（renderPins内から呼ばれる）

function renderPinList() {
  const list = document.getElementById("pinList");
  if (list) list.innerHTML = "";

  pins.forEach((pinObj, i) => {
    const div = document.createElement("div");
    div.className = "pinItem";
    if (!pinObj.enabled) {
      div.classList.add("disabled");
    }

    // マーカーの左端の色の目印。クリックするとカラーパレットが開く（色未設定ならグレー表示）。
    const colorMark = document.createElement("button");
    colorMark.className = "pin-color-mark";
    colorMark.title = "Set marker color";
    colorMark.style.background = (pinObj.color && MARKER_COLOR_PALETTE[pinObj.color]) ? MARKER_COLOR_PALETTE[pinObj.color] : "#3a3a48";
    colorMark.onclick = (e) => {
      e.stopPropagation();
      openMarkerColorPicker(colorMark, pinObj, i);
    };
    div.appendChild(colorMark);

    const infoSpan = document.createElement("span");
    infoSpan.className = "pin-info";
    // メモが入っていれば時間の代わりにメモを表示し、メモがなければ従来通り時間を表示する。
    // 番号は残すが「#」記号は表示しない。
    infoSpan.textContent = pinObj.memo
      ? `${i + 1} - ${pinObj.memo}`
      : `${i + 1} - ${pinObj.t.toFixed(2)}s`;
    if (pinObj.memo) infoSpan.title = pinObj.memo;

    infoSpan.onclick = () => { 
      isSeeking = true;
      audio.currentTime = pinObj.t; 
      prevTime = pinObj.t;
      audio.play(); 
      updatePlayButtonState();
      renderSegments(getActiveSegment(pinObj.t));
      setTimeout(() => { isSeeking = false; }, 150);
    };
    div.appendChild(infoSpan);

    // メモ編集用の鉛筆ボタン。押すとinfoSpanの表示をテキスト入力に一時的に切り替える。
    const editBtn = document.createElement("button");
    editBtn.className = "pin-edit-btn";
    editBtn.title = "Edit memo";
    editBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      startPinMemoEdit(div, infoSpan, pinObj, i);
    };
    div.appendChild(editBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.title = pinObj.enabled ? "Marker enabled (click to disable)" : "Marker disabled (click to enable)";
    // ON: 目が開いたアイコン、OFF: 目に斜線が入ったアイコン（スラッシュ付き）
    toggleBtn.innerHTML = pinObj.enabled
      ? '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 6.5c3.79 0 7.17 2.13 8.82 5.5-.59 1.2-1.42 2.25-2.42 3.11l1.42 1.42c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.61 17 4.5 12 4.5c-1.27 0-2.49.2-3.64.57l1.65 1.65c.62-.14 1.28-.22 1.99-.22zM2.71 3.16L1.29 4.57 4 7.27C2.36 8.53 1.07 10.15 0.18 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l3.01 3.01 1.41-1.41L2.71 3.16zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57 0 1.66 1.34 3 3 3 .2 0 .38-.03.57-.07l1.57 1.57c-.65.32-1.37.5-2.14.5zm2.97-5.33c-.15-1.4-1.25-2.49-2.64-2.64l2.64 2.64z"/></svg>';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      pinObj.enabled = !pinObj.enabled;
      renderPins();
      renderSegments();
      renderPinList();
      savePins();
    };
    div.appendChild(toggleBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.className = "del-btn";
    delBtn.style.color = "#ef4444";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (delBtn.classList.contains("confirm")) {
        hapticWarning();
        pins.splice(i, 1);
        renderPins();
        renderSegments();
        renderPinList();
        savePins();
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
    div.appendChild(delBtn);

    if (list) {
      list.appendChild(div);
    }
  });
}

// マーカーの色選択ポップアップを開く。既存のポップアップがあれば一旦閉じてから開き直す。
let activeMarkerColorPopup = null;
function closeMarkerColorPicker() {
  if (activeMarkerColorPopup) {
    activeMarkerColorPopup.remove();
    activeMarkerColorPopup = null;
    document.removeEventListener("click", closeMarkerColorPicker);
  }
}

function openMarkerColorPicker(anchorBtn, pinObj, index) {
  closeMarkerColorPicker();

  const popup = document.createElement("div");
  popup.className = "marker-color-popup";

  // 「色なし」に戻すスウォッチ（グレー、×アイコン）
  const noneSwatch = document.createElement("button");
  noneSwatch.type = "button";
  noneSwatch.className = "marker-color-swatch marker-color-none";
  noneSwatch.title = "No color";
  if (!pinObj.color) noneSwatch.classList.add("active");
  noneSwatch.onclick = (e) => {
    e.stopPropagation();
    pinObj.color = null;
    savePins();
    renderPins();
    renderSegments();
    renderPinList();
    closeMarkerColorPicker();
  };
  popup.appendChild(noneSwatch);

  Object.keys(MARKER_COLOR_PALETTE).forEach(colorName => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "marker-color-swatch";
    swatch.style.background = MARKER_COLOR_PALETTE[colorName];
    swatch.title = colorName;
    if (pinObj.color === colorName) swatch.classList.add("active");
    swatch.onclick = (e) => {
      e.stopPropagation();
      pinObj.color = colorName;
      savePins();
      renderPins();
      renderSegments();
      renderPinList();
      closeMarkerColorPicker();
    };
    popup.appendChild(swatch);
  });

  document.body.appendChild(popup);
  activeMarkerColorPopup = popup;

  // ボタンのすぐ下に配置し、画面外にはみ出す場合は横位置・縦位置を画面内に収める。
  const rect = anchorBtn.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top = `${rect.bottom + 6}px`;
  popup.style.left = `${rect.left}px`;

  requestAnimationFrame(() => {
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 右端がはみ出す場合は右揃えに切り替える
    if (popupRect.right > viewportWidth - 8) {
      popup.style.left = `${Math.max(8, viewportWidth - popupRect.width - 8)}px`;
    }
    // 下端がはみ出す場合はボタンの上に開き直す
    if (popupRect.bottom > viewportHeight - 8) {
      popup.style.top = `${rect.top - popupRect.height - 6}px`;
    }
  });

  // ポップアップの外側をクリックしたら閉じる（次のクリックイベントループで登録し、
  // 今開いた瞬間のクリック自体で即座に閉じてしまわないようにする）。
  setTimeout(() => {
    document.addEventListener("click", closeMarkerColorPicker);
  }, 0);
  popup.onclick = e => e.stopPropagation();
}

// マーカーのメモ編集：infoSpanをその場でテキスト入力に差し替える。
// Enterまたはフォーカスアウトで確定し、Escでキャンセルする。
function startPinMemoEdit(itemDiv, infoSpan, pinObj, index) {
  if (itemDiv.querySelector(".pin-memo-input")) return; // 既に編集中なら何もしない

  const input = document.createElement("input");
  input.type = "text";
  input.className = "pin-memo-input";
  input.value = pinObj.memo || "";
  input.placeholder = `${index + 1} - ${pinObj.t.toFixed(2)}s`;
  input.maxLength = 60;

  infoSpan.style.display = "none";
  itemDiv.insertBefore(input, infoSpan);
  input.focus();
  input.select();

  let finished = false;
  function commit() {
    if (finished) return;
    finished = true;
    pinObj.memo = input.value.trim();
    savePins();
    renderPinList();
  }
  function cancel() {
    if (finished) return;
    finished = true;
    renderPinList();
  }

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
  input.addEventListener("click", e => e.stopPropagation());
}
