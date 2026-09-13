// ============================================================
// player-ui-pc.js
// PC幅（マウス操作前提）でのみ意味を持つUI要素の処理。
// player-core.js, player-ui-shared.js の後に読み込むこと
// （hapticTap, keepPopupInViewport, addFilesToPlaylist, renderPins,
//  renderSegments, renderPinList, savePins 等の共通関数に依存するため）。
//
// 注意：startDragPinはrenderPins()内(player-ui-shared.js側)から
// onmousedown ハンドラとして参照される。関数宣言はホイスティングされ、
// かつrenderPinsが実際に呼ばれるのはファイル読み込み完了後（曲を読み込んだ時点）
// のため問題ないが、読み込み順序を変えないこと。
// ============================================================

// Keyboard Shortcutsは qn-menu.js が window.QN_SHORTCUTS（index.html側で定義）を読んで
// 自動生成する共通コンポーネントの1セクションになったため、このアプリ側に専用ロジックは無い

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

function startDragPin(index) {
  return function(e) {
    e.stopPropagation();
    if (e.type === "touchstart") e.preventDefault();
    isSeeking = true;
    const dur = audio.duration;
    const { s1, s2, s3, s4, s5 } = getSegments(dur);
    const bounds = [0, s1, s2, s3, s4, s5, dur];

    // touchstartでpreventDefault()するとブラウザは以降の合成click/mousedown
    // イベントを発火しなくなる。そのため「タップ（動かさない）＝そのマーカーへ
    // シーク＆再生」「ドラッグ（動かす）＝マーカー移動」を、ここで実際の移動量から
    // 判定して両立させる。DRAG_THRESHOLD_PXより動いたらドラッグとみなす。
    const DRAG_THRESHOLD_PX = 6;
    const startClientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const startClientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    let hasDragged = false;

    const bars = [
      document.getElementById("bar1"),
      document.getElementById("bar2"),
      document.getElementById("bar3"),
      document.getElementById("bar4"),
      document.getElementById("bar5"),
      document.getElementById("bar6")
    ];

    function moveAt(clientX, clientY) {
      let targetBarIndex = 0;
      let rects = bars.map(b => b.getBoundingClientRect());

      if (clientY <= rects[0].bottom) {
        targetBarIndex = 0;
      } else if (clientY >= rects[rects.length - 1].top) {
        targetBarIndex = rects.length - 1;
      } else {
        for (let i = 0; i < rects.length - 1; i++) {
          const mid = (rects[i].bottom + rects[i+1].top) / 2;
          if (clientY <= mid) {
            targetBarIndex = i;
            break;
          }
          targetBarIndex = i + 1;
        }
      }

      const rect = rects[targetBarIndex];
      const rowStart = bounds[targetBarIndex];
      const rowEnd = bounds[targetBarIndex + 1];

      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const t = rowStart + ratio * (rowEnd - rowStart);

      pins[index].t = Math.max(0, Math.min(dur, t));

      renderPins();
      renderSegments();
      renderPinList();
    }

    function move(ev) {
      if (Math.abs(ev.clientX - startClientX) > DRAG_THRESHOLD_PX || Math.abs(ev.clientY - startClientY) > DRAG_THRESHOLD_PX) {
        hasDragged = true;
      }
      moveAt(ev.clientX, ev.clientY);
    }

    function moveTouch(ev) {
      if (ev.touches.length === 0) return;
      ev.preventDefault();
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startClientX) > DRAG_THRESHOLD_PX || Math.abs(t.clientY - startClientY) > DRAG_THRESHOLD_PX) {
        hasDragged = true;
      }
      moveAt(t.clientX, t.clientY);
    }

    function stop() {
      pins.sort((a, b) => a.t - b.t);

      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", moveTouch);
      document.removeEventListener("touchend", stop);
      document.removeEventListener("touchcancel", stop);

      if (!hasDragged && e.type === "touchstart") {
        // 実質的にタップだった（touchstartのpreventDefaultでclickが発火しないため、
        // ここでタップ時と同じ処理＝そのマーカーへシーク＆再生を行う）。
        const pinObj = pins[index];
        if (pinObj) {
          audio.currentTime = pinObj.t;
          prevTime = pinObj.t;
          audio.play();
          updatePlayButtonState();
          renderSegments(getActiveSegment(pinObj.t));
        }
      } else {
        prevTime = audio.currentTime;
      }
      setTimeout(() => { isSeeking = false; }, 150);

      renderPins();
      renderSegments();
      renderPinList();
      savePins();
    }

    if (e.type === "touchstart") {
      document.addEventListener("touchmove", moveTouch, { passive: false });
      document.addEventListener("touchend", stop);
      document.addEventListener("touchcancel", stop);
    } else {
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
    }
  };
}

// ============================================================
// #topControlsのPC幅レイアウト：Track/Play/Track・Repeat・Marker×3・Loopを
// 完全にフラットな1行として並べる。
//
// 当初はCSSの display: contents で.top-controls-row（行の箱）を透明化する
// 方式を試みたが、ブラウザ間の挙動差により確実に機能しなかったため、
// ここでJSが実際にDOM構造を組み替える方式にしている。
// PC幅(901px以上)になった瞬間、4つの要素(#playbackTripleBtn,
// #allRepeatToggleBtn, #markerNavBtn, #loopToggleBtn)を#topControls直下へ
// 移動し、空になった.top-controls-rowは非表示にする。
// SP幅(900px以下)に戻った時は、元々あった.top-controls-rowへ戻す。
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

  const PC_BREAKPOINT = "(min-width: 901px)";
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
