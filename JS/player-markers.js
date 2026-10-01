// ============================================================
// player-markers.js
// マーカー機能：追加・前後ジャンプ、波形上のピン描画、ドラッグ移動、
// マーカーカラーピッカー、メモ編集、ループ区間(segmentHighlight)描画。
//
// 依存: player-core.js（pins配列, savePins, getSegments, hexToRgba,
// MARKER_COLOR_PALETTE等）、player-ui-shared.js（hapticTap等の共通UI関数,
// isMobileLayout）。
// ドラッグ移動(startDragPin)はPC/SP共通機能のため、このファイル内に
// 定義を持つ（以前はplayer-ui-pc.js側にあったが、PC専用ではなかった
// 実態に合わせてこちらへ統合した）。
// このファイル自体はトップレベルのconst/letとしてDOM要素を取得している箇所が
// あるため、DOM構築後（bodyの終わり際）に読み込むこと。
// ============================================================

function addCurrentPin() {
  if (!audio.duration) return;
  hapticSuccess();
  pins.push({ t: audio.currentTime, enabled: true, memo: "", color: null });
  pins.sort((a, b) => a.t - b.t);
  // マーカー構成が変わったため、ループ折り返し判定の対象区間インデックスを
  // 破棄し、次回のupdateBarsで現在地から計算し直させる。
  loopActiveMarkerIndex = null;
  renderPins();
  renderSegments();
  renderPinList();
  savePins();
}

document.getElementById("addPinBtn").onclick = addCurrentPin;

// 【v2.16.6】前/次マーカーボタンが基準にする「現在地」。
// 通常は再生位置そのものだが、マーカーループ中にプリロール/ポストロール
// （Loop秒数ステッパーで設定した「区間の前後にはみ出して聴かせる」部分）を
// 再生している間は、実際の位置は区間の外でも、聴いているのは「今ループ中の
// 区間」なので、区間の内側にいるものとして扱う。
// 例：1-2間をループ中、2を過ぎたポストロール中に「次」→ 以前は位置的に
// 2より後ろなので3へ飛んでいたが、今は2（＝次の区間2-3の頭）へ飛ぶ。
function getMarkerNavReferenceTime() {
  const ct = audio.currentTime;
  if (!loopEnabled || loopActiveMarkerIndex === null) return ct;
  const preroll = typeof loopPreRollSeconds === "number" ? loopPreRollSeconds : 0;
  if (preroll <= 0) return ct;
  // loopActiveMarkerIndexはupdateBars()と同じ「ONのマーカーだけの並び」の番号
  const activeTimes = pins.filter(p => p.enabled).map(p => p.t);
  return QNMarkerCore.navRefTime(activeTimes, loopActiveMarkerIndex, ct, preroll, loopEnabled);
}

function jumpToNextMarker() {
  const activePins = pins
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p.enabled && !(typeof isUnlocked === "function" && !isUnlocked() && i >= SW_LIMITS.MARKER_MAX_ACTIVE))
    .map(({ p }) => p);
  if (activePins.length === 0) return;
  hapticTap();

  const ct = getMarkerNavReferenceTime();
  const nextT = QNMarkerCore.nextTime(activePins.map(p => p.t), ct);
  const nextPin = activePins.find(p => p.t === nextT) || activePins[0];

  beginSeek();
  audio.currentTime = nextPin.t;
  prevTime = nextPin.t;
  audio.play();
  updatePlayButtonState();
  renderSegments(getActiveSegment(nextPin.t));
  setTimeout(() => { isSeeking = false; }, 150);
}

function jumpToPrevMarker() {
  const activePins = pins
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p.enabled && !(typeof isUnlocked === "function" && !isUnlocked() && i >= SW_LIMITS.MARKER_MAX_ACTIVE))
    .map(({ p }) => p);
  if (activePins.length === 0) return;
  hapticTap();

  const ct = getMarkerNavReferenceTime();

  const prevT = QNMarkerCore.prevTime(activePins.map(p => p.t), ct);
  const targetPin = activePins.find(p => p.t === prevT) || activePins[activePins.length - 1];

  beginSeek();
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
    // シェアウェア制限：無料版で4個目以降は波形上も半透明ロック表示にする。
    const isLockedMarker = typeof isUnlocked === "function" && !isUnlocked() && i >= SW_LIMITS.MARKER_MAX_ACTIVE;
    if (isLockedMarker) {
      line.classList.add("sw-locked");
    }
    line.style.left = `${x}%`;
    line.dataset.pinIndex = String(i);
    // マーカーに色が設定されていれば、ライン(縦線)の背景色に反映する。
    // ただし無効化中(disabled)は専用の見た目を優先し、
    // インラインスタイルで上書きしないようにする（詳細度でCSS側の状態表現が負けてしまうため）。
    // 番号バッジ(.vbar-label)側は視認性のため、マーカー個別色やテーマカラーに関わらず
    // 常にCSS側の黒背景固定にする（ここでインラインstyleを上書きしない）。
    // CSS変数--marker-colorは、PC v2側の::before疑似要素(直接styleで色を
    // 変更できない)から参照するために設定する。SP版/旧PC版は
    // line.style.background(直接の背景色)を見るため、両方set しておく。
    const applyMarkerColor = pinObj.color && MARKER_COLOR_PALETTE[pinObj.color] && pinObj.enabled;
    if (applyMarkerColor) {
      line.style.background = MARKER_COLOR_PALETTE[pinObj.color];
      line.style.setProperty("--marker-color", MARKER_COLOR_PALETTE[pinObj.color]);
    }

    const label = document.createElement("span");
    label.className = "vbar-label";
    // 行内での相対位置(x, 0〜100%)が右端に近い場合、PC v2ではメモ
    // (.vbar-label-memo)が波形エリアの外にはみ出してしまうのを避けるため
    // 左側に表示する。この閾値・見た目の切り替えはPC v2限定のCSS
    // (.pcv2-label-flip)でのみ意味を持ち、SP版の見た目には影響しない。
    if (x >= 80) {
      label.classList.add("pcv2-label-flip");
    }
    const numSpan = document.createElement("span");
    numSpan.className = "vbar-label-num";
    numSpan.textContent = `${i + 1}`;
    label.appendChild(numSpan);
    if (pinObj.memo) {
      const memoSpan = document.createElement("span");
      memoSpan.className = "vbar-label-memo";
      memoSpan.textContent = pinObj.memo;
      label.appendChild(memoSpan);
    }

    function handleMarkerTapOrDrag(e) {
      e.stopPropagation();
      if (isLockedMarker) {
        swShowUnlockToast(`無料版はマーカーの先頭${SW_LIMITS.MARKER_MAX_ACTIVE}個までしか使用できません。`);
        return;
      }
      // タップ（クリック）は常にそのマーカーへシーク＆再生する。
      // 以前はスマホだけMOVEモード（再タップで選択→別の位置をタップして移動）に
      // 分岐していたが、意図通りに動作しなかったため廃止し、PC/スマホ共通で
      // 直接ドラッグ（下のonmousedown/ontouchstart）で動かす方式に統一した。
      beginSeek();
      audio.currentTime = pinObj.t;
      prevTime = pinObj.t;
      audio.play();
      updatePlayButtonState();
      renderSegments(getActiveSegment(pinObj.t));
      setTimeout(() => { isSeeking = false; }, 150);
      // v3.5.0〜：シーク＆再生に加えて、−/Color/Hide のポップアップも出す
      // （マウスのドラッグ直後に出るclickでは出さない）。
      if (Date.now() - lastPinDragAt > 400 && Date.now() - lastPinTapAt > 400) showPinPopup(pinObj.t, line.parentNode, e.clientX, pinObj);
    }

    label.onclick = handleMarkerTapOrDrag;
    line.onclick = handleMarkerTapOrDrag;

    // ドラッグでマーカーを直接動かせる。PC(mousedown)・スマホ(touchstart)共通で
    // startDragPin（このファイル内で定義、下記参照）を使う。startDragPin自体は
    // e.typeを見てマウス/タッチ両方のイベントに対応済み。
    // シェアウェア制限：ロック中のマーカーはドラッグ移動も不可にする。
    if (!isLockedMarker) {
      label.onmousedown = startDragPin(i);
      line.onmousedown = startDragPin(i);
      label.ontouchstart = startDragPin(i);
      line.ontouchstart = startDragPin(i);
    }

    line.appendChild(label);

    const targetBar = document.getElementById(`bar${row}`);
    if (targetBar) {
      targetBar.appendChild(line);
    }
  });

  // A点/B点（マーカーではない独立した点）を描き直し、揃わなくなったらA-Bループを自動でOFFに戻す
  renderABPoints();
  if (typeof syncLoopModeWithAB === "function") syncLoopModeWithAB();
  updateABButtons();

  const activeCount = pins.filter(p => p.enabled).length;
  const loopInfo = document.getElementById("loopInfo");
  if (loopInfo) {
    loopInfo.textContent = `ACTIVE ${activeCount}/${pins.length}`;
  }
}

// segmentHighlight(またはそのプリロール版)を、6分割された波形バーを
// 跨いでいてもバーごとに分割して描画する共通処理。
// className: 付与するCSSクラス名。onClickSeek: クリック時にシークする
// 秒数（省略時はクリック不可にする＝プリロール部分の薄い帯はクリック対象外）。
function paintSegmentAcrossBars(barsInfo, rangeStart, rangeEnd, className, colorHex, onClickSeek, colorKey) {
  barsInfo.forEach(b => {
    const overlapStart = Math.max(rangeStart, b.start);
    const overlapEnd = Math.min(rangeEnd, b.end);
    if (overlapStart >= overlapEnd) return;

    const leftPct = ((overlapStart - b.start) / (b.end - b.start)) * 100;
    const rightPct = ((overlapEnd - b.start) / (b.end - b.start)) * 100;
    const widthPct = rightPct - leftPct;

    const seg = document.createElement("div");
    seg.className = className;
    seg.style.left = leftPct + "%";
    seg.style.width = widthPct + "%";
    if (colorHex) {
      if (className === "segmentHighlight") {
        seg.style.background = hexToRgba(colorHex, 0.35);
        seg.style.borderTop = `2px solid ${colorHex}`;
        seg.style.borderBottom = `2px solid ${colorHex}`;
      } else {
        // プリロール/ポストロール部分は同系色をさらに薄くして「本編区間より前後に
        // ちょっとだけはみ出して聴かせる」ことが一目でわかる見た目にする。
        seg.style.background = hexToRgba(colorHex, 0.14);
        seg.style.borderTop = `2px dashed ${hexToRgba(colorHex, 0.6)}`;
        seg.style.borderBottom = `2px dashed ${hexToRgba(colorHex, 0.6)}`;
      }
    }

    if (onClickSeek !== undefined) {
      seg.onclick = () => {
        beginSeek();
        audio.currentTime = onClickSeek;
        prevTime = onClickSeek;
        audio.play();
        updatePlayButtonState();
        renderSegments({ start: rangeStart, end: rangeEnd, color: colorKey || null });
        setTimeout(() => { isSeeking = false; }, 150);
      };
    }

    b.el.appendChild(seg);
  });
}

function renderSegments(overrideSegment) {
  const dur = audio.duration;
  if (!dur) return;

  document.querySelectorAll(".vbar").forEach(bar => {
    bar.querySelectorAll(".segmentHighlight, .segmentHighlight-preroll").forEach(s => s.remove());
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

  const colorHex = active.color && MARKER_COLOR_PALETTE[active.color] ? MARKER_COLOR_PALETTE[active.color] : null;

  // マーカー本編区間（くっきり表示、クリックで先頭へシーク）
  paintSegmentAcrossBars(barsInfo, active.start, active.end, "segmentHighlight", colorHex, active.start, active.color);

  // プリロール/ポストロール分（薄い破線、Loopの秒数ステッパーが0の間は描画しない）
  const preroll = typeof loopPreRollSeconds === "number" ? loopPreRollSeconds : 0;
  if (preroll > 0) {
    const prerollStart = Math.max(0, active.start - preroll);
    const postrollEnd = Math.min(dur, active.end + preroll);
    if (prerollStart < active.start) {
      paintSegmentAcrossBars(barsInfo, prerollStart, active.start, "segmentHighlight-preroll", colorHex);
    }
    if (active.end < postrollEnd) {
      paintSegmentAcrossBars(barsInfo, active.end, postrollEnd, "segmentHighlight-preroll", colorHex);
    }
  }
}

// ドラッグでマーカーを直接動かせる。PC(mousedown)・スマホ(touchstart)共通で
// e.typeを見てマウス/タッチ両方のイベントに対応する。
// 以前はplayer-ui-pc.js側に置いていたが、PC/SP問わず使う共通機能のため、
// 呼び出し元のrenderPins()と同じこのファイルへ移動した。
function startDragPin(index) {
  return function(e) {
    e.stopPropagation();
    const isTouch = e.type === "touchstart";
    if (isTouch) e.preventDefault();
    beginSeek();
    const dur = audio.duration;
    const { s1, s2, s3, s4, s5 } = getSegments(dur);
    const bounds = [0, s1, s2, s3, s4, s5, dur];

    // 【v2.16.2】ドラッグ中に動かすのは「今つかんでいるマーカー線の要素そのもの」。
    // 以前は指が動くたびにrenderPins()で全マーカー線を削除→作り直していた。
    // iOS Safari等では、タッチを始めた要素(=つかんだマーカー線)がDOMから
    // 取り除かれると、以降のtouchmove/touchendはその「切り離された要素」に
    // 届くだけでdocumentまで伝わらない。documentに付けていたtouchmoveが
    // 最初の1回（=ちょこっと動く）しか呼ばれず、そこでドラッグが止まって
    // いた（GOTCHAS.md）。対策として、
    //  (1) ドラッグ中は要素を作り直さず、位置(left)と所属する行(bar)だけを
    //      その場で更新する（renderPinList等の重い再描画も指を離すまで保留）
    //  (2) タッチのイベントは、タッチを始めた要素自身に付ける（タッチイベントは
    //      常にタッチ開始要素へ届くため、万一どこかで再描画されても取りこぼさない）
    const dragTarget = e.currentTarget;
    const lineEl = dragTarget && dragTarget.closest ? dragTarget.closest(".vbar-line") : null;
    const labelEl = lineEl ? lineEl.querySelector(".vbar-label") : null;

    // touchstartでpreventDefault()するとブラウザは以降の合成click/mousedown
    // イベントを発火しなくなる。そのため「タップ（動かさない）＝そのマーカーへ
    // シーク＆再生」「ドラッグ（動かす）＝マーカー移動」を、ここで実際の移動量から
    // 判定して両立させる。DRAG_THRESHOLD_PXより動いたらドラッグとみなす。
    const DRAG_THRESHOLD_PX = 6;
    const startClientX = isTouch ? e.touches[0].clientX : e.clientX;
    const startClientY = isTouch ? e.touches[0].clientY : e.clientY;
    let hasDragged = false;
    let finished = false;

    const bars = [
      document.getElementById("bar1"),
      document.getElementById("bar2"),
      document.getElementById("bar3"),
      document.getElementById("bar4"),
      document.getElementById("bar5"),
      document.getElementById("bar6")
    ];

    // つかんでいるマーカー線を、新しい時刻の位置へその場で移動する。
    function placeLineAt(t) {
      if (!lineEl) return;
      const row = getPinRow(t, dur);
      const x = timeToPercentInRow(t, dur);
      const targetBar = document.getElementById(`bar${row}`);
      // 別の行へ移る時だけ付け替える（appendChildによる移動は要素を
      // 作り直さないので、タッチの対象は保たれる）。
      if (targetBar && lineEl.parentNode !== targetBar) targetBar.appendChild(lineEl);
      lineEl.style.left = `${x}%`;
      if (labelEl) labelEl.classList.toggle("pcv2-label-flip", x >= 80);
    }

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

      if (lineEl) {
        placeLineAt(pins[index].t);
      } else {
        renderPins(); // 念のためのフォールバック（通常は通らない）
      }
      renderSegments();
    }

    function move(ev) {
      if (Math.abs(ev.clientX - startClientX) > DRAG_THRESHOLD_PX || Math.abs(ev.clientY - startClientY) > DRAG_THRESHOLD_PX) {
        hasDragged = true;
      }
      if (hasDragged) moveAt(ev.clientX, ev.clientY);
    }

    function moveTouch(ev) {
      if (ev.touches.length === 0) return;
      ev.preventDefault();
      const t = ev.touches[0];
      if (Math.abs(t.clientX - startClientX) > DRAG_THRESHOLD_PX || Math.abs(t.clientY - startClientY) > DRAG_THRESHOLD_PX) {
        hasDragged = true;
      }
      // しきい値を超えるまでは動かさない（タップのつもりの小さなブレで
      // マーカーがずれないように）。
      if (hasDragged) moveAt(t.clientX, t.clientY);
    }

    function stop() {
      if (finished) return;
      finished = true;
      if (hasDragged) lastPinDragAt = Date.now();
      pins.sort((a, b) => a.t - b.t);
      // マーカー位置が変わった（並び順が変わり得る）ため、ループ折り返し
      // 判定の対象区間インデックスを破棄する。
      loopActiveMarkerIndex = null;

      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      if (dragTarget) {
        dragTarget.removeEventListener("touchmove", moveTouch);
        dragTarget.removeEventListener("touchend", stop);
        dragTarget.removeEventListener("touchcancel", stop);
      }

      if (!hasDragged) {
        // 実質的にタップ(クリック)だった。タッチはtouchstartのpreventDefaultでclickが発火しない。
        // マウスも、このstop()の最後のrenderPins()でマーカー線のDOMが作り直され、mousedownした
        // 元の要素が消えるため、線のonclick(handleMarkerTapOrDrag)が呼ばれないことがある
        // （v3.5.0でマウスのクリックでポップアップが出なかった原因）。
        // そこで、タッチ・マウスとも、ここでタップ時と同じ処理＝そのマーカーへシーク＆再生＋ポップアップを行う。
        // （clickが来た場合は、lastPinTapAtで二重にポップアップを出さない）
        const pinObj = pins[index];
        if (pinObj) {
          lastPinTapAt = Date.now();
          if (typeof abLeaveIfOutside === "function") abLeaveIfOutside(pinObj.t);
          audio.currentTime = pinObj.t;
          prevTime = pinObj.t;
          audio.play();
          updatePlayButtonState();
          renderSegments(getActiveSegment(pinObj.t));
          // v3.5.0〜：タップ・クリック時はポップアップも出す
          showPinPopup(pinObj.t, lineEl ? lineEl.parentNode : null, startClientX, pinObj);
        }
      } else {
        prevTime = audio.currentTime;
      }
      setTimeout(() => { isSeeking = false; }, 150);

      // 指を離した時点で初めて、番号の振り直し(並び替え)・リスト・保存を行う。
      renderPins();
      renderSegments();
      renderPinList();
      savePins();
    }

    if (isTouch) {
      dragTarget.addEventListener("touchmove", moveTouch, { passive: false });
      dragTarget.addEventListener("touchend", stop);
      dragTarget.addEventListener("touchcancel", stop);
    } else {
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
    }
  };
}

function renderPinList() {
  // リストを作り直すとメモ編集中の入力欄も消えるため、プリセットの
  // ポップアップが取り残されないよう先に閉じる。
  if (typeof closePinMemoPresetPopup === "function") closePinMemoPresetPopup();
  const list = document.getElementById("pinList");
  if (list) list.innerHTML = "";

  pins.forEach((pinObj, i) => {
    const div = document.createElement("div");
    div.className = "pinItem";
    if (!pinObj.enabled) {
      div.classList.add("disabled");
    }

    // シェアウェア制限：無料版で4個目以降(index >= MARKER_MAX_ACTIVE)は
    // 削除せず保持・表示するが、鍵アイコン付きでロックする（タイムラインジャンプ不可）。
    const isLockedMarker = typeof isUnlocked === "function" && !isUnlocked() && i >= SW_LIMITS.MARKER_MAX_ACTIVE;
    if (isLockedMarker) div.classList.add("sw-locked");

    // マーカーの左端の色の目印。クリックするとカラーパレットが開く（色未設定ならグレー表示）。
    const colorMark = document.createElement("button");
    colorMark.className = "pin-color-mark";
    colorMark.title = "Set marker color";
    colorMark.style.background = (pinObj.color && MARKER_COLOR_PALETTE[pinObj.color]) ? MARKER_COLOR_PALETTE[pinObj.color] : "#3a3a48";
    colorMark.onclick = (e) => {
      e.stopPropagation();
      // シェアウェア制限：無料版はマーカーの色変更不可。
      if (typeof isUnlocked === "function" && !isUnlocked()) {
        swShowUnlockToast("無料版ではマーカーの色変更はできません。");
        return;
      }
      openMarkerColorPicker(colorMark, pinObj, i);
    };
    // 【v2.16.8】.pinItemはdisplay: gridで、列は
    // 「auto(先頭セル) / 1fr(ラベル) / auto(目) / auto(削除)」の4列固定
    // （renderPinListが必ずこの4つを順にappendする前提）。ロック中の鍵
    // アイコンを、以前はcolorMarkの前に別要素として直接divへappendして
    // いたため、子要素が5個になり、5個目(delZone)が4列を使い切った次の
    // 暗黙の行へ折り返され、後続の要素が丸ごと1列ずつズレていた
    // （鍵→1列目、色の丸→2列目(1fr、本来ラベル用)、ラベル→3列目(auto)…と
    // ズレ、時刻の文字が右寄りに、削除チェックは次の行へ消えていた。
    // これがマーカーの無料版ロック表示が崩れていた原因、GOTCHAS.md）。
    // 鍵アイコンは単独のグリッド項目にせず、colorMarkと同じ1列目に収まる
    // 入れ物(.pin-leading-cell)へまとめ、grid子要素の数を常に4個に保つ。
    const leadingCell = document.createElement("div");
    leadingCell.className = "pin-leading-cell";
    if (isLockedMarker) {
      const lockIcon = document.createElement("span");
      lockIcon.className = "sw-lock-icon";
      lockIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17a2 2 0 0 0 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2m6-9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5 5 5 0 0 1 5 5v2h1M12 3a3 3 0 0 0-3 3v2h6V6a3 3 0 0 0-3-3z"/></svg>';
      leadingCell.appendChild(lockIcon);
    }
    leadingCell.appendChild(colorMark);
    div.appendChild(leadingCell);

    // ラベル行：テキスト(infoSpan)と鉛筆ボタン(editBtn)をまとめて包む。
    // Libraryパネルの曲名/アーティスト行(.playlist-title-row等)と同じ
    // パターンで、この行にマウスを乗せた時だけ鉛筆を表示する
    // （常時表示だとリストがうるさく見えるため、ホバー時限定に変更）。
    const labelRow = document.createElement("div");
    labelRow.className = "pin-label-row";

    const infoSpan = document.createElement("span");
    infoSpan.className = "pin-info";
    // メモが入っていれば時間の代わりにメモを表示し、メモがなければ従来通り時間を表示する。
    // 番号は残すが「#」記号は表示しない。
    infoSpan.textContent = pinObj.memo
      ? `${i + 1} - ${pinObj.memo}`
      : `${i + 1} - ${pinObj.t.toFixed(2)}s`;
    if (pinObj.memo) infoSpan.title = pinObj.memo;

    infoSpan.onclick = () => { 
      if (isLockedMarker) {
        swShowUnlockToast(`無料版はマーカーの先頭${SW_LIMITS.MARKER_MAX_ACTIVE}個までしか使用できません。`);
        return;
      }
      beginSeek();
      audio.currentTime = pinObj.t; 
      prevTime = pinObj.t;
      audio.play(); 
      updatePlayButtonState();
      renderSegments(getActiveSegment(pinObj.t));
      setTimeout(() => { isSeeking = false; }, 150);
    };
    labelRow.appendChild(infoSpan);

    // メモ編集用の鉛筆ボタン。押すとinfoSpanの表示をテキスト入力に一時的に切り替える。
    const editBtn = document.createElement("button");
    editBtn.className = "pin-edit-btn";
    editBtn.title = "Edit memo";
    editBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof isUnlocked === "function" && !isUnlocked()) {
        swShowUnlockToast("無料版ではマーカーメモを利用できません。");
        return;
      }
      startPinMemoEdit(div, infoSpan, pinObj, i);
    };
    labelRow.appendChild(editBtn);

    div.appendChild(labelRow);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.title = pinObj.enabled ? "Marker enabled (click to disable)" : "Marker disabled (click to enable)";
    // ON: 目が開いたアイコン、OFF: 目に斜線が入ったアイコン（スラッシュ付き）
    toggleBtn.innerHTML = pinObj.enabled
      ? '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 6.5c3.79 0 7.17 2.13 8.82 5.5-.59 1.2-1.42 2.25-2.42 3.11l1.42 1.42c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.61 17 4.5 12 4.5c-1.27 0-2.49.2-3.64.57l1.65 1.65c.62-.14 1.28-.22 1.99-.22zM2.71 3.16L1.29 4.57 4 7.27C2.36 8.53 1.07 10.15 0.18 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l3.01 3.01 1.41-1.41L2.71 3.16zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57 0 1.66 1.34 3 3 3 .2 0 .38-.03.57-.07l1.57 1.57c-.65.32-1.37.5-2.14.5zm2.97-5.33c-.15-1.4-1.25-2.49-2.64-2.64l2.64 2.64z"/></svg>';
    // 【v2.15.0】EDITモードでDELETE選択が1件でもある間は押せない
    // （Libraryの PLAY/SKIP トグルと同じ仕様。押すとrenderPinList()で
    // リストが作り直され、選択の見た目が消えてしまうため）。
    const markersHasSelection = typeof window.markersHasSelectedItems === "function" && window.markersHasSelectedItems();
    toggleBtn.disabled = markersHasSelection;
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof window.markersHasSelectedItems === "function" && window.markersHasSelectedItems()) return;
      pinObj.enabled = !pinObj.enabled;
      // 有効マーカーの構成(activePins)が変わるため、ループ折り返し判定の
      // 対象区間インデックスを破棄する。
      loopActiveMarkerIndex = null;
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
        // マーカーが1つ減って並び順のインデックスがズレるため、
        // ループ折り返し判定の対象区間インデックスを破棄する。
        loopActiveMarkerIndex = null;
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
    // 【v2.15.0】削除チェック(.del-btn、20x20pxの丸)のタップ判定を、
    // Libraryの.playlist-del-zoneと同じく「行の上下いっぱい・右端まで」の
    // 広いゾーン(.pin-del-zone)で受ける（player-ui-pc-v2.jsの
    // attachSelectionHandlersも判定対象を.pin-del-zoneにしている）。
    const delZone = document.createElement("div");
    delZone.className = "pin-del-zone";
    delZone.appendChild(delBtn);
    div.appendChild(delZone);

    if (list) {
      list.appendChild(div);
    }
  });
}


// ============================================================
// 【v3.5.0】シークバー（波形バー）のポップアップ。
//  ・空いている位置をクリック/タップ → ＋Marker（その位置にマーカー追加）
//  ・既存マーカーをクリック/タップ → － / Color / Hide（削除・色・非表示）
// 従来どおりクリック位置へのシーク＆再生はそのまま行い、それに加えて出す。
// 見た目はYouTubeアプリのポップアップ(.qn-yt-seekpop、style-apps.css)と共通。
// ※PLAYERにはA/Bの概念が無い（ループはマーカー〜次のマーカー）ため A/B は出さない。
// ============================================================
let lastPinDragAt = 0;
let lastPinTapAt = 0; // startDragPinのstop()でタップ処理(シーク＋ポップアップ)をした時刻。clickとの二重処理防止用
let pinPopEl = null, pinPopTimer = null, pinPopTime = 0, pinPopPin = null, pinPopAbKind = null;
let pinPopDelArmed = false, pinPopDelTimer = null;
const PINPOP_MS = 4000;

const PINPOP_EYE_ON = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
const PINPOP_EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M12 6.5c3.79 0 7.17 2.13 8.82 5.5-.59 1.2-1.42 2.25-2.42 3.11l1.42 1.42c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.61 17 4.5 12 4.5c-1.27 0-2.49.2-3.64.57l1.65 1.65c.62-.14 1.28-.22 1.99-.22zM2.71 3.16L1.29 4.57 4 7.27C2.36 8.53 1.07 10.15 0.18 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l3.01 3.01 1.41-1.41L2.71 3.16zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57 0 1.66 1.34 3 3 3 .2 0 .38-.03.57-.07l1.57 1.57c-.65.32-1.37.5-2.14.5zm2.97-5.33c-.15-1.4-1.25-2.49-2.64-2.64l2.64 2.64z"/></svg>';

function refreshAfterPinChange() {
  loopActiveMarkerIndex = null;
  renderPins();
  renderSegments();
  renderPinList();
  savePins();
}

function ensurePinPopup() {
  if (pinPopEl) return pinPopEl;
  pinPopEl = document.createElement("div");
  pinPopEl.className = "qn-yt-seekpop qn-pl-seekpop";
  pinPopEl.hidden = true;
  pinPopEl.setAttribute("role", "menu");
  pinPopEl.innerHTML =
    '<div class="qn-yt-seekpop-time" data-pop="time">00:00.0</div>' +
    '<div class="qn-yt-seekpop-row">' +
      '<button type="button" class="qn-yt-seekpop-btn" data-pop="A" title="この位置をA点(ループ開始)に（もう一度押すと解除）"><b>A</b><span>Start</span></button>' +
      '<button type="button" class="qn-yt-seekpop-btn" data-pop="B" title="この位置をB点(ループ終了)に（もう一度押すと解除）"><b>B</b><span>End</span></button>' +
      '<button type="button" class="qn-yt-seekpop-btn" data-pop="M" title="この位置にマーカーを追加"><b>＋</b><span>Marker</span></button>' +
      '<button type="button" class="qn-yt-seekpop-btn qn-yt-seekpop-del" data-pop="X" title="このA/B点を削除" hidden><b>－</b><span>Point</span></button>' +
      '<button type="button" class="qn-yt-seekpop-btn qn-yt-seekpop-del" data-pop="D" title="このマーカーを削除" hidden><b>－</b><span>Marker</span></button>' +
      '<button type="button" class="qn-yt-seekpop-btn" data-pop="C" title="マーカーの色を変える" hidden><b><i class="qn-yt-seekpop-dot"></i></b><span>Color</span></button>' +
      '<button type="button" class="qn-yt-seekpop-btn" data-pop="H" title="マーカーのON/OFF" hidden><b></b><span>Hide</span></button>' +
    '</div>';
  document.body.appendChild(pinPopEl);
  pinPopEl.addEventListener("pointerdown", e => { e.stopPropagation(); resetPinPopTimer(); });
  pinPopEl.addEventListener("click", e => {
    e.stopPropagation();
    const b = e.target.closest ? e.target.closest("[data-pop]") : null;
    if (!b) return;
    const k = b.getAttribute("data-pop");
    if (k === "X") pinPopClearPoint();
    else if (k === "A" || k === "B") pinPopAB(k);
    else if (k === "M") pinPopAdd();
    else if (k === "D") pinPopDelete();
    else if (k === "C") pinPopColor();
    else if (k === "H") pinPopToggle();
  });
  // 外側のタップ・Escで閉じる（波形バー自身のタップは、直後のclickで新しい位置のポップアップに置き換わる）
  document.addEventListener("pointerdown", e => {
    if (pinPopEl.hidden) return;
    if (e.target.closest && e.target.closest(".qn-pl-seekpop")) return;
    hidePinPopup();
  }, true);
  window.addEventListener("keydown", e => { if (e.key === "Escape") hidePinPopup(); }, true);
  window.addEventListener("resize", hidePinPopup);
  return pinPopEl;
}

function resetPinPopTimer() {
  if (pinPopTimer) clearTimeout(pinPopTimer);
  pinPopTimer = setTimeout(hidePinPopup, PINPOP_MS);
}

function armPinPopDel(on) {
  pinPopDelArmed = on;
  if (pinPopDelTimer) { clearTimeout(pinPopDelTimer); pinPopDelTimer = null; }
  if (!pinPopEl) return;
  const b = pinPopEl.querySelector('[data-pop="D"]');
  b.classList.toggle("is-armed", on);
  b.querySelector("span").textContent = on ? "Sure?" : "Marker";
  if (on) pinPopDelTimer = setTimeout(() => armPinPopDel(false), 3000);
}

function hidePinPopup() {
  armPinPopDel(false);
  if (pinPopTimer) { clearTimeout(pinPopTimer); pinPopTimer = null; }
  if (pinPopEl) pinPopEl.hidden = true;
}

// t: クリック位置の秒数 / barEl: クリックした波形バー / pinObj: 既存マーカー(無ければnull)
function showPinPopup(t, barEl, clientX, pinObj, abKind) {
  if (!audio.duration || !barEl) return;
  const pop = ensurePinPopup();
  pinPopPin = pinObj || null;
  pinPopAbKind = abKind || null;
  pinPopTime = Math.max(0, Math.min(audio.duration, t));
  armPinPopDel(false);
  pop.querySelector('[data-pop="time"]').textContent = formatTime(pinPopTime);
  // A/B点の上＝「－ Point」だけ / 既存マーカー上＝A/B/－/Color/Hide / 空き位置＝A/B/＋Marker
  pop.querySelector('[data-pop="X"]').hidden = !abKind;
  pop.querySelector('[data-pop="A"]').hidden = !!abKind;
  pop.querySelector('[data-pop="B"]').hidden = !!abKind;
  pop.querySelector('[data-pop="M"]').hidden = !!pinObj || !!abKind;
  ["D", "C", "H"].forEach(k => { pop.querySelector(`[data-pop="${k}"]`).hidden = !pinObj; });
  // すでにA/Bが近く(±0.5秒)にあるボタンは地色で示す（もう一度押すと解除）
  pop.querySelector('[data-pop="A"]').classList.toggle("is-set", abA !== null && Math.abs(abA - pinPopTime) <= AB_SNAP_SEC);
  pop.querySelector('[data-pop="B"]').classList.toggle("is-set", abB !== null && Math.abs(abB - pinPopTime) <= AB_SNAP_SEC);
  if (pinObj) {
    const hex = pinObj.color && MARKER_COLOR_PALETTE[pinObj.color] ? MARKER_COLOR_PALETTE[pinObj.color] : "#3a3a48";
    pop.querySelector(".qn-yt-seekpop-dot").style.background = hex;
    const hb = pop.querySelector('[data-pop="H"]');
    hb.querySelector("b").innerHTML = pinObj.enabled ? PINPOP_EYE_ON : PINPOP_EYE_OFF;
    hb.querySelector("span").textContent = pinObj.enabled ? "Hide" : "Show";
  }
  pop.hidden = false;
  const rect = barEl.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight, gap = 10;
  const left = Math.min(Math.max(clientX - w / 2, 8), window.innerWidth - w - 8);
  let top = rect.top - h - gap;
  const below = top < 8;
  if (below) top = rect.bottom + gap;
  pop.classList.toggle("is-below", below);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
  resetPinPopTimer();
}

function pinPopAB(kind) {
  const t = pinPopTime;
  hidePinPopup();
  hapticTap();
  setABAt(kind, t);
}

// A/B点の削除（－ Point）
function pinPopClearPoint() {
  const kind = pinPopAbKind;
  hidePinPopup();
  if (!kind) return;
  hapticTap();
  if (kind === "A") abA = null; else abB = null;
  afterABChange();
}

// ============================================================
// 【v3.8.0】A/B（YouTubeアプリと同じ）。A点/B点はマーカーではなく、秒の独立した点（abA/abB、player-core.js）。
// 使い捨ての区切り位置で、マーカーには登録されない。波形上の「A」「B」の旗(.vbar-ab-pt)をドラッグして動かせる。
// setABAt: 指定位置(秒)をA点/B点に。同じ種類の点が±0.5秒以内にあれば解除（トグル）。
// ============================================================
const AB_SNAP_SEC = 0.5;
function afterABChange() {
  saveAB();
  renderABPoints();
  if (typeof syncLoopModeWithAB === "function") syncLoopModeWithAB();
  updateABButtons();
  renderSegments();
}

function setABAt(kind, t) {
  if (!audio.duration) return;
  const tt = Math.max(0, Math.min(audio.duration, Math.round(t * 10) / 10));
  const cur = kind === "A" ? abA : abB;
  const next = (cur !== null && Math.abs(cur - tt) <= AB_SNAP_SEC) ? null : tt;
  if (kind === "A") abA = next; else abB = next;
  afterABChange();
}

// 下部バーの Set A / Set B：現在の再生位置を A点/B点に
function setABFromCurrent(kind) {
  hapticTap();
  setABAt(kind, audio.currentTime);
}

function fmtABTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// 下部バーのClear AB：A点・B点を両方クリア（A-Bループ中ならLOOPもOFFになる）
function clearAB() {
  hapticTap();
  abA = null; abB = null;
  afterABChange();
}

// 下部バーのSet A/Set Bのラベル（設定済みなら時刻を表示し、テーマ色にする）
function updateABButtons() {
  [["A", abA], ["B", abB]].forEach(([kind, v]) => {
    const btn = document.getElementById(kind === "A" ? "setABtn" : "setBBtn");
    if (!btn) return;
    const lbl = btn.querySelector(".top-controls-btn-label");
    if (lbl) lbl.textContent = kind + " " + (v !== null ? fmtABTime(v) : "--");
    btn.classList.toggle("has-point", v !== null);
  });
}

// 波形(6本のバー)上の座標 → 秒（startDragPinのmoveAtと同じ行判定）
function timeFromBarsPoint(clientX, clientY) {
  const dur = audio.duration;
  const { s1, s2, s3, s4, s5 } = getSegments(dur);
  const bounds = [0, s1, s2, s3, s4, s5, dur];
  const bars = [1, 2, 3, 4, 5, 6].map(n => document.getElementById("bar" + n));
  const rects = bars.map(b => b.getBoundingClientRect());
  let idx = 0;
  if (clientY <= rects[0].bottom) idx = 0;
  else if (clientY >= rects[rects.length - 1].top) idx = rects.length - 1;
  else {
    for (let i = 0; i < rects.length - 1; i++) {
      const mid = (rects[i].bottom + rects[i + 1].top) / 2;
      if (clientY <= mid) { idx = i; break; }
      idx = i + 1;
    }
  }
  const ratio = Math.max(0, Math.min(1, (clientX - rects[idx].left) / rects[idx].width));
  return bounds[idx] + ratio * (bounds[idx + 1] - bounds[idx]);
}

// A点/B点を波形上に描く（renderPins()の最後に毎回呼ばれる）
function renderABPoints() {
  document.querySelectorAll(".vbar .vbar-ab-pt").forEach(e => e.remove());
  const dur = audio.duration;
  if (!dur) return;
  [["A", abA], ["B", abB]].forEach(([kind, v]) => {
    if (v === null) return;
    const el = document.createElement("div");
    el.className = "vbar-ab-pt is-" + kind.toLowerCase();
    el.title = kind + " " + fmtABTime(v);
    const flag = document.createElement("span");
    flag.className = "vbar-ab-flag";
    flag.textContent = kind;
    el.appendChild(flag);
    el.style.left = timeToPercentInRow(v, dur) + "%";
    attachABDrag(el, kind);
    const bar = document.getElementById("bar" + getPinRow(v, dur));
    if (bar) bar.appendChild(el);
  });
}

// A点/B点のドラッグ（マーカーと同じ操作感）。動かさずに離した時は、その位置へシーク＆再生し、
// 「－ Point」（その点の削除）だけのポップアップを出す。
function attachABDrag(el, kind) {
  let moved = false, startX = 0, startY = 0;
  el.addEventListener("pointerdown", e => {
    if (!audio.duration) return;
    e.stopPropagation();
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    moved = false; startX = e.clientX; startY = e.clientY;
    el.classList.add("dragging");
    beginSeek();
  });
  el.addEventListener("pointermove", e => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) moved = true;
    if (!moved) return;
    const t = Math.round(timeFromBarsPoint(e.clientX, e.clientY) * 10) / 10;
    if (kind === "A") abA = t; else abB = t;
    const dur = audio.duration;
    const bar = document.getElementById("bar" + getPinRow(t, dur));
    if (bar && el.parentNode !== bar) bar.appendChild(el);
    el.style.left = timeToPercentInRow(t, dur) + "%";
    el.title = kind + " " + fmtABTime(t);
    renderSegments();
  });
  el.addEventListener("pointerup", e => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    el.classList.remove("dragging");
    const v = kind === "A" ? abA : abB;
    if (moved) {
      lastPinTapAt = Date.now(); // 直後にバー側へ届くclickを無視させる
      afterABChange();
      prevTime = audio.currentTime;
    } else {
      lastPinTapAt = Date.now();
      audio.currentTime = v;
      prevTime = v;
      audio.play();
      updatePlayButtonState();
      renderSegments(getActiveSegment(v));
      showPinPopup(v, el.parentNode, e.clientX, null, kind);
    }
    setTimeout(() => { isSeeking = false; }, 150);
  });
}

function pinPopAdd() {
  const t = pinPopTime;
  hidePinPopup();
  hapticSuccess();
  pins.push({ t: t, enabled: true, memo: "", color: null });
  pins.sort((a, b) => a.t - b.t);
  refreshAfterPinChange();
}

// －Marker：1回目で「Sure?」、3秒以内にもう1回で削除（Markersリストの✕✓と同じ2段階）
function pinPopDelete() {
  if (!pinPopPin) return;
  if (!pinPopDelArmed) { hapticTap(); armPinPopDel(true); resetPinPopTimer(); return; }
  const i = pins.indexOf(pinPopPin);
  hidePinPopup();
  if (i < 0) return;
  hapticWarning();
  pins.splice(i, 1);
  refreshAfterPinChange();
}

function pinPopColor() {
  const pin = pinPopPin;
  const i = pin ? pins.indexOf(pin) : -1;
  hidePinPopup();
  if (i < 0) return;
  // シェアウェア制限：無料版はマーカーの色変更不可（Markersリストの色ボタンと同じ）
  if (typeof isUnlocked === "function" && !isUnlocked()) {
    swShowUnlockToast("無料版ではマーカーの色変更はできません。");
    return;
  }
  const anchor = document.querySelector(`.vbar-line[data-pin-index="${i}"]`);
  if (!anchor) return;
  openMarkerStylePopup(anchor, { label: pin.memo || "", color: pin.color || null, placeholder: fmtABTime(pin.t) }, (v) => {
    pin.memo = v.label;
    pin.color = v.color;
    savePins();
    renderPins();
    renderSegments();
    renderPinList();
  });
}

// Hide/Show：Markersリストの目と同じ（pin.enabledの切替。PLAYERでは波形上に残り、無効の見た目になる）
function pinPopToggle() {
  const pin = pinPopPin;
  hidePinPopup();
  if (!pin) return;
  hapticTap();
  pin.enabled = !pin.enabled;
  refreshAfterPinChange();
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

// 色選択ポップアップ本体（汎用）。currentColorNameを選択中として表示し、
// 色（または「色なし」=null）が選ばれたらonPick(colorName)を呼んで閉じる。
// マーカーの色設定と、Colorパネルの「マーカーメモの自動カラー」設定
// （v2.15.0〜）の両方で使う。
function openColorChoicePopup(anchorBtn, currentColorName, onPick) {
  closeMarkerColorPicker();

  const popup = document.createElement("div");
  popup.className = "marker-color-popup";

  // 「色なし」に戻すスウォッチ（グレー、×アイコン）
  const noneSwatch = document.createElement("button");
  noneSwatch.type = "button";
  noneSwatch.className = "marker-color-swatch marker-color-none";
  noneSwatch.title = "No color";
  if (!currentColorName) noneSwatch.classList.add("active");
  noneSwatch.onclick = (e) => {
    e.stopPropagation();
    closeMarkerColorPicker();
    onPick(null);
  };
  popup.appendChild(noneSwatch);

  Object.keys(MARKER_COLOR_PALETTE).forEach(colorName => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "marker-color-swatch";
    swatch.style.background = MARKER_COLOR_PALETTE[colorName];
    swatch.title = colorName;
    if (currentColorName === colorName) swatch.classList.add("active");
    swatch.onclick = (e) => {
      e.stopPropagation();
      closeMarkerColorPicker();
      onPick(colorName);
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
      popup.style.top = `${Math.max(8, rect.top - popupRect.height - 6)}px`;
    }
  });

  // ポップアップの外側をクリックしたら閉じる（次のクリックイベントループで登録し、
  // 今開いた瞬間のクリック自体で即座に閉じてしまわないようにする）。
  setTimeout(() => {
    document.addEventListener("click", closeMarkerColorPicker);
  }, 0);
  popup.onclick = e => e.stopPropagation();
}

function openMarkerColorPicker(anchorBtn, pinObj, index) {
  openColorChoicePopup(anchorBtn, pinObj.color || null, (colorName) => {
    pinObj.color = colorName;
    savePins();
    renderPins();
    renderSegments();
    renderPinList();
  });
}

// ポップアップのColor用：「ラベル入力＋プリセット＋色」を1セットにした編集パネル（PLAYER・YouTube共通）。
// プリセット（名前と色の組）はMarkersの設定と共用。プリセットを選ぶとラベルと色が一緒に入る。
// opts = { label, color, placeholder }。変更のたびに onChange({label, color}) を呼ぶ（パネルは開いたまま）。
function openMarkerStylePopup(anchorEl, opts, onChange) {
  closeMarkerColorPicker();
  closePinMemoPresetPopup();
  const state = { label: opts.label || "", color: opts.color || null };
  const popup = document.createElement("div");
  popup.className = "qn-style-pop";
  popup.onclick = e => e.stopPropagation();

  const input = document.createElement("input");
  input.type = "text";
  input.className = "qn-style-input";
  input.maxLength = 60;
  input.placeholder = opts.placeholder || "Label";
  input.value = state.label;
  popup.appendChild(input);

  const chipsEl = document.createElement("div");
  chipsEl.className = "qn-style-chips";
  popup.appendChild(chipsEl);
  const swEl = document.createElement("div");
  swEl.className = "qn-style-swatches";
  popup.appendChild(swEl);

  function emit() { onChange({ label: state.label, color: state.color }); }
  function renderSwatches() {
    swEl.innerHTML = "";
    const none = document.createElement("button");
    none.type = "button";
    none.className = "marker-color-swatch marker-color-none" + (state.color ? "" : " active");
    none.title = "No color";
    none.onclick = e => { e.stopPropagation(); state.color = null; renderSwatches(); emit(); };
    swEl.appendChild(none);
    Object.keys(MARKER_COLOR_PALETTE).forEach(name => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "marker-color-swatch" + (state.color === name ? " active" : "");
      b.style.background = MARKER_COLOR_PALETTE[name];
      b.title = name;
      b.onclick = e => { e.stopPropagation(); state.color = name; renderSwatches(); emit(); };
      swEl.appendChild(b);
    });
  }
  const presetColors = getMarkerPresetColors();
  getAllMarkerPresetLabels().forEach(label => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pin-memo-preset-chip";
    const c = presetColors[label];
    if (c && MARKER_COLOR_PALETTE[c]) {
      const dot = document.createElement("span");
      dot.className = "pin-memo-preset-dot";
      dot.style.background = MARKER_COLOR_PALETTE[c];
      chip.appendChild(dot);
    }
    chip.appendChild(document.createTextNode(label));
    chip.onclick = e => {
      e.stopPropagation();
      state.label = label;
      if (c && MARKER_COLOR_PALETTE[c]) state.color = c;
      input.value = label;
      renderSwatches();
      emit();
    };
    chipsEl.appendChild(chip);
  });
  renderSwatches();

  function commitLabel() {
    const v = input.value.trim();
    if (v === state.label) return;
    state.label = v;
    emit();
  }
  input.addEventListener("change", commitLabel);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); commitLabel(); closeMarkerColorPicker(); }
    else if (e.key === "Escape") { e.preventDefault(); closeMarkerColorPicker(); }
  });

  document.body.appendChild(popup);
  activeMarkerColorPopup = popup;
  const rect = anchorEl.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top = (rect.bottom + 6) + "px";
  popup.style.left = rect.left + "px";
  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) popup.style.left = Math.max(8, window.innerWidth - pr.width - 8) + "px";
    if (pr.bottom > window.innerHeight - 8) popup.style.top = Math.max(8, rect.top - pr.height - 6) + "px";
  });
  setTimeout(() => document.addEventListener("click", closeMarkerColorPicker), 0);
}

// マーカーのメモ編集：infoSpanをその場でテキスト入力に差し替える。
// Enterまたはフォーカスアウトで確定し、Escでキャンセルする。
// マーカーメモでよく使われる曲構成のラベル。クイック選択チップとして
// 編集欄の下に並べ、クリックで即座にその内容を入力する（自由入力も
// 引き続き可能）。
const MARKER_LABEL_PRESETS = [
  "Intro", "Verse", "Pre-chorus", "Chorus", "Last Chorus",
  "Bridge", "Solo", "Outro"
];
