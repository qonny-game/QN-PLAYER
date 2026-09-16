// ============================================================
// player-controls.js
// つまみ系操作機能：Speed（再生速度）・AutoSpeed（自動加速）・Key（音程調整）・
// VOL/SPEED/KEYポップアップの開閉共通処理・Loop（単一区間ループ）・
// Repeat（Off/One/Allの巡回モード）。
//
// 依存: player-core.js（setupAudioGraph, updatePlaybackRate等）、
// player-ui-shared.js（hapticTap等の共通UI関数, updateAvToggleValue,
// renderSegments）。
// ============================================================

const speedRange = document.getElementById("speedRange");
const speedDisplay = document.getElementById("speedDisplay");
const controlSpeedRange = document.getElementById("controlSpeedRange");
const controlSpeedDisplay = document.getElementById("controlSpeedDisplay");
const spStatusSpeedValue = document.getElementById("spStatusSpeedValue");
const SPEED_MIN = 0.5;
const SPEED_MAX = 1.5;

// Speedの表示・スライダー値を、Basic欄・CONTROLタブ・SP専用ステータス表示、全てに反映する
function syncSpeedDisplays() {
  if (speedRange) speedRange.value = currentSpeed;
  if (speedDisplay) speedDisplay.textContent = currentSpeed.toFixed(2);
  if (controlSpeedRange) controlSpeedRange.value = currentSpeed;
  if (controlSpeedDisplay) controlSpeedDisplay.textContent = currentSpeed.toFixed(2);
  if (spStatusSpeedValue) spStatusSpeedValue.textContent = currentSpeed.toFixed(2) + "x";
  updateAvToggleValue("speedToggleValue", currentSpeed.toFixed(2) + "x");
}
// 初期表示用に1回呼んでおく。updateAvToggleValueはplayer-ui-shared.js側の関数のため、
// このファイルがplayer-ui-shared.jsより先に読み込まれる場合でも安全なよう、
// トップレベルでの直接呼び出しではなくsyncSpeedDisplays()経由にしている
// （syncSpeedDisplays自体はここでは呼ばれるだけで即実行はされないため、
// 実際にupdateAvToggleValueが呼ばれるのはこの行の実行タイミング＝依然として
// 読み込み順に依存する。根本対策はindex.html側の読み込み順をplayer-ui-shared.js
// が先になるよう修正すること）。
syncSpeedDisplays();

function setSpeed(value) {
  // シェアウェア制限：無料版はSpeed変更不可。値を変えずにミニポップアップだけ表示する
  // （実行しようとして初めてぶつかった制限ではなく、既にロック中の操作を
  // 試したケースなので、画面を止めるフルモーダルではなくトーストにする）。
  if (typeof isUnlocked === "function" && !isUnlocked() && value !== 1.0) {
    swShowUnlockToast("無料版ではSpeed変更を利用できません。");
    syncSpeedDisplays();
    return;
  }
  currentSpeed = Math.round(Math.max(SPEED_MIN, Math.min(SPEED_MAX, value)) * 100) / 100;
  syncSpeedDisplays();
  updatePlaybackRate();
}

let lastSpeedTickValue = currentSpeed;
// iOS Safari等では、スライダードラッグ中にaudio.playbackRateを高頻度で更新すると
// 音声デコードが追いつかず「ぶつ切り」に聞こえる不具合があるため、
// ドラッグ中は表示テキストだけ即座に更新し、実際の音声エンジンへの反映(updatePlaybackRate)は
// 操作が一段落してから(最後のinputイベントから90ms後)にまとめて1回だけ行う。
let speedApplyDebounceTimer = null;
function handleSpeedRangeInput(e) {
  // シェアウェア制限：無料版はSpeed変更不可。スライダーを1.0に戻し、ミニポップアップを表示する。
  if (typeof isUnlocked === "function" && !isUnlocked()) {
    e.target.value = 1.0;
    syncSpeedDisplays();
    swShowUnlockToast("無料版ではSpeed変更を利用できません。");
    return;
  }

  // Basic欄のポップアップ経由(setupAvPopup)ならボタンを開いた時点で接続されるが、
  // CONTROLタブのスライダーはポップアップの開閉を経由せず直接操作できてしまうため、
  // ここでも同様に、実際に操作された瞬間にWeb Audio API接続を試みる必要がある
  // （EQ/Speed/Keyのどれも操作しなければ接続されない、という設計自体は維持する）。
  setupAudioGraph().catch(err => console.warn("setupAudioGraph failed:", err));

  currentSpeed = parseFloat(e.target.value);
  if (currentSpeed !== lastSpeedTickValue) {
    hapticTick();
    lastSpeedTickValue = currentSpeed;
  }
  syncSpeedDisplays();

  clearTimeout(speedApplyDebounceTimer);
  speedApplyDebounceTimer = setTimeout(() => {
    updatePlaybackRate();
  }, 90);
}
if (speedRange) speedRange.oninput = handleSpeedRangeInput;
if (controlSpeedRange) controlSpeedRange.oninput = handleSpeedRangeInput;

function resetSpeed() {
  currentSpeed = 1.0;
  syncSpeedDisplays();
  updatePlaybackRate();
}
const speedResetBtn = document.getElementById("speedResetBtn");
if (speedResetBtn) speedResetBtn.onclick = resetSpeed;
const controlSpeedResetBtn = document.getElementById("controlSpeedResetBtn");
if (controlSpeedResetBtn) controlSpeedResetBtn.onclick = resetSpeed;

// ============================================================
// Auto Speed：マーカー区間ループ(LOOP ON時)をN回通過するたびに、Speedをy%だけ自動で増減する。
// ギター等の楽器練習で「同じフレーズを何度か通しで弾けるようになったら、少しずつテンポを上げる」
// という操作を自動化するための機能。ループが1周する瞬間(updateBars内)からnotifyLoopCompleted()を
// 呼んでもらうことでカウントし、既存のsetSpeed()をそのまま使ってSpeedへ反映する。
// Basic欄・CONTROLタブ両方に同じUIがあるため、常にペアで値・状態を同期させる。
// ============================================================
const autoSpeedToggleBtns = [document.getElementById("autoSpeedToggleBtn"), document.getElementById("controlAutoSpeedToggleBtn")].filter(Boolean);
const autoSpeedSettingsEls = [document.getElementById("autoSpeedSettings"), document.getElementById("controlAutoSpeedSettings")].filter(Boolean);
const autoSpeedCardEls = [document.getElementById("controlAutoSpeedCard")].filter(Boolean); // OFF時に暗くする対象。Basic欄側は元々折りたたみなので対象外。
const autoSpeedEveryNInputs = [document.getElementById("autoSpeedEveryN"), document.getElementById("controlAutoSpeedEveryN")].filter(Boolean);
const autoSpeedStepPercentInputs = [document.getElementById("autoSpeedStepPercent"), document.getElementById("controlAutoSpeedStepPercent")].filter(Boolean);
const autoSpeedLimitInputs = [document.getElementById("autoSpeedLimit"), document.getElementById("controlAutoSpeedLimit")].filter(Boolean);
const autoSpeedStatusEls = [document.getElementById("autoSpeedStatus"), document.getElementById("controlAutoSpeedStatus")].filter(Boolean);
const autoSpeedDirBtns = document.querySelectorAll(".auto-speed-dir-btn");

let autoSpeedEnabled = false;
let autoSpeedDirection = "up"; // "up" または "down"
let autoSpeedLoopCount = 0;

// 数値入力はBasic欄・CONTROLタブどちらから読んでも同じ値のはずなので、最初に見つかった方から読む
function getAutoSpeedEveryN() {
  const n = parseInt(autoSpeedEveryNInputs[0].value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

function getAutoSpeedStepPercent() {
  const p = parseFloat(autoSpeedStepPercentInputs[0].value);
  return Number.isFinite(p) && p > 0 ? p : 5;
}

function getAutoSpeedLimitRatio() {
  const p = parseFloat(autoSpeedLimitInputs[0].value);
  const clamped = Number.isFinite(p) ? Math.max(50, Math.min(150, p)) : 150;
  return clamped / 100;
}

const spStatusAutoSpeedValue = document.getElementById("spStatusAutoSpeedValue");
const spStatusAutoSpeedLimit = document.getElementById("spStatusAutoSpeedLimit");

function updateAutoSpeedStatus() {
  const everyN = getAutoSpeedEveryN();
  let text;
  if (!autoSpeedEnabled) {
    text = `Loop progress: 0 / ${everyN}`;
  } else {
    const limitRatio = getAutoSpeedLimitRatio();
    const reachedLimit = autoSpeedDirection === "up"
      ? currentSpeed >= limitRatio - 0.001
      : currentSpeed <= limitRatio + 0.001;
    text = reachedLimit
      ? `Limit reached (${(limitRatio * 100).toFixed(0)}%) — looping`
      : `Loop progress: ${autoSpeedLoopCount} / ${everyN}`;
  }
  autoSpeedStatusEls.forEach(el => { el.textContent = text; });

  // SP専用ステータス表示：「5/5 +5%」のように、次の調整までの周回数とステップ幅を1行で見せる。
  // OFFの間は、CONTROLタブを開けば設定できることが分かる程度の簡潔な表示にする。
  if (spStatusAutoSpeedValue) {
    if (!autoSpeedEnabled) {
      spStatusAutoSpeedValue.textContent = "OFF";
    } else {
      const stepPercent = getAutoSpeedStepPercent();
      const sign = autoSpeedDirection === "up" ? "+" : "-";
      spStatusAutoSpeedValue.textContent = `${autoSpeedLoopCount}/${everyN} ${sign}${stepPercent}%`;
    }
  }
  if (spStatusAutoSpeedLimit) {
    const limitRatio = getAutoSpeedLimitRatio();
    spStatusAutoSpeedLimit.textContent = autoSpeedEnabled ? `limit ${limitRatio.toFixed(2)}x` : "";
  }
}

function setAutoSpeedEnabled(enabled) {
  autoSpeedEnabled = enabled;
  autoSpeedLoopCount = 0;
  autoSpeedToggleBtns.forEach(btn => btn.setAttribute("aria-checked", String(enabled)));
  autoSpeedSettingsEls.forEach(el => el.classList.toggle("open", enabled));
  // CONTROLタブのAuto Speedカードは常時展開表示のため、開閉ではなくopacity等で
  // ON/OFFを表現する（ご要望：ONにするまでは暗くしておく）。
  autoSpeedCardEls.forEach(el => el.classList.toggle("auto-speed-active", enabled));
  updateAutoSpeedStatus();
}

autoSpeedToggleBtns.forEach(btn => {
  btn.onclick = () => {
    hapticTap();
    setAutoSpeedEnabled(!autoSpeedEnabled);
  };
});

autoSpeedDirBtns.forEach(btn => {
  btn.onclick = () => {
    hapticTap();
    autoSpeedDirection = btn.getAttribute("data-dir");
    // Basic欄・CONTROLタブ、両方の方向ボタン群を同じ状態に揃える
    autoSpeedDirBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-dir") === autoSpeedDirection));
    updateAutoSpeedStatus();
  };
});

[...autoSpeedEveryNInputs, ...autoSpeedStepPercentInputs, ...autoSpeedLimitInputs].forEach(input => {
  input.addEventListener("input", () => {
    // Basic欄・CONTROLタブどちらを編集しても、もう片方の数値入力にも同じ値を反映する
    const pairArrays = [autoSpeedEveryNInputs, autoSpeedStepPercentInputs, autoSpeedLimitInputs];
    const pair = pairArrays.find(arr => arr.includes(input));
    if (pair) pair.forEach(el => { if (el !== input) el.value = input.value; });
  });
  input.addEventListener("change", () => {
    autoSpeedLoopCount = 0;
    updateAutoSpeedStatus();
  });
});

// マーカー区間ループが1周した瞬間に呼ばれる。updateBars内のループ折り返し処理から呼ぶ。
function notifyLoopCompleted() {
  if (!autoSpeedEnabled) return;

  const limitRatio = getAutoSpeedLimitRatio();
  const alreadyAtLimit = autoSpeedDirection === "up"
    ? currentSpeed >= limitRatio - 0.001
    : currentSpeed <= limitRatio + 0.001;
  // 既に上限/下限に達している場合は、それ以上カウントを進める必要がない
  // （ループは継続するが、Speedはこれ以上動かさない）
  if (alreadyAtLimit) {
    updateAutoSpeedStatus();
    return;
  }

  autoSpeedLoopCount++;
  const everyN = getAutoSpeedEveryN();
  if (autoSpeedLoopCount >= everyN) {
    autoSpeedLoopCount = 0;
    const stepRatio = getAutoSpeedStepPercent() / 100;
    const delta = autoSpeedDirection === "up" ? stepRatio : -stepRatio;
    let nextSpeed = currentSpeed + delta;
    // 上限/下限を超えないようにクランプする（setSpeed自体もSPEED_MIN/MAXでクランプするが、
    // Auto Speed独自のLimit設定がSPEED_MIN/MAXの範囲内であることは保証されないため、ここでも行う）
    nextSpeed = autoSpeedDirection === "up"
      ? Math.min(nextSpeed, limitRatio)
      : Math.max(nextSpeed, limitRatio);
    setSpeed(nextSpeed);
    hapticSuccess();
  }
  updateAutoSpeedStatus();
}

updateAutoSpeedStatus();

const keyDisplay = document.getElementById("keyDisplay");
const keyStepperFill = document.getElementById("keyStepperFill");
const controlKeyDisplay = document.getElementById("controlKeyDisplay");
const controlKeyStepperFill = document.getElementById("controlKeyStepperFill");
const KEY_MIN = -12;
const KEY_MAX = 12;

function renderKeyDisplay() {
  const text = (currentKeySemitones > 0 ? "+" : "") + currentKeySemitones;
  const pct = (Math.abs(currentKeySemitones) / KEY_MAX) * 50;
  const left = currentKeySemitones >= 0 ? "50%" : (50 - pct) + "%";

  if (keyDisplay) keyDisplay.textContent = text;
  if (keyStepperFill) {
    // 中央(0)を起点に、正なら右へ、負なら左へ伸びるバー
    keyStepperFill.style.width = pct + "%";
    keyStepperFill.style.left = left;
  }
  if (controlKeyDisplay) controlKeyDisplay.textContent = text;
  if (controlKeyStepperFill) {
    controlKeyStepperFill.style.width = pct + "%";
    controlKeyStepperFill.style.left = left;
  }
  const spStatusKeyValue = document.getElementById("spStatusKeyValue");
  if (spStatusKeyValue) spStatusKeyValue.textContent = text;
  updateAvToggleValue("keyToggleValue", text);
}

function setKeySemitones(value) {
  // シェアウェア制限：無料版はKey変更不可。値を変えずにミニポップアップだけ表示する。
  if (typeof isUnlocked === "function" && !isUnlocked() && value !== 0) {
    swShowUnlockToast("無料版ではKey変更を利用できません。");
    return;
  }

  // Basic欄のポップアップ経由(setupAvPopup)ならボタンを開いた時点で接続されるが、
  // CONTROLタブのステッパーボタンはポップアップの開閉を経由せず直接操作できてしまうため、
  // ここでも同様に、実際に操作された瞬間にWeb Audio API接続を試みる必要がある。
  setupAudioGraph().catch(err => console.warn("setupAudioGraph failed:", err));

  const clamped = Math.max(KEY_MIN, Math.min(KEY_MAX, value));
  if (clamped !== currentKeySemitones) {
    hapticTick();
  } else if (value !== clamped) {
    // 上限/下限に達していて、それ以上動かせない
    hapticWarning();
  }
  currentKeySemitones = clamped;
  renderKeyDisplay();
  updatePlaybackRate();
}

const keyUpBtn = document.getElementById("keyUpBtn");
const keyDownBtn = document.getElementById("keyDownBtn");
if (keyUpBtn) keyUpBtn.onclick = () => setKeySemitones(currentKeySemitones + 1);
if (keyDownBtn) keyDownBtn.onclick = () => setKeySemitones(currentKeySemitones - 1);

const keyResetBtn = document.getElementById("keyResetBtn");
if (keyResetBtn) keyResetBtn.onclick = () => setKeySemitones(0);

const controlKeyUpBtn = document.getElementById("controlKeyUpBtn");
const controlKeyDownBtn = document.getElementById("controlKeyDownBtn");
if (controlKeyUpBtn) controlKeyUpBtn.onclick = () => setKeySemitones(currentKeySemitones + 1);
if (controlKeyDownBtn) controlKeyDownBtn.onclick = () => setKeySemitones(currentKeySemitones - 1);

const controlKeyResetBtn = document.getElementById("controlKeyResetBtn");
if (controlKeyResetBtn) controlKeyResetBtn.onclick = () => setKeySemitones(0);

renderKeyDisplay();

// ピッチシフト(位相ボコーダー)の準備が整ったらKEY操作を有効化し、
// グレーアウトと「SOON」バッジを解除する。失敗時は無効のまま維持する。
function updateKeyControlAvailability() {
  const keyToggleBtn = document.getElementById("keyToggleBtn");
  const badge = keyToggleBtn ? keyToggleBtn.querySelector(".key-disabled-badge") : null;
  const speedToggleBtn = document.getElementById("speedToggleBtn");
  const speedRangeEl = document.getElementById("speedRange");
  const speedResetBtnEl = document.getElementById("speedResetBtn");

  if (pitchShiftAvailable) {
    [keyToggleBtn, keyResetBtn, keyUpBtn, keyDownBtn].forEach(el => {
      if (el) el.disabled = false;
    });
    if (keyToggleBtn) {
      keyToggleBtn.classList.remove("key-disabled");
      keyToggleBtn.title = "Key";
    }
    if (badge) badge.remove();

    [speedToggleBtn, speedRangeEl, speedResetBtnEl].forEach(el => {
      if (el) el.disabled = false;
    });
    if (speedToggleBtn) {
      speedToggleBtn.classList.remove("key-disabled");
      speedToggleBtn.title = "Speed";
    }
  } else {
    [keyToggleBtn, keyResetBtn, keyUpBtn, keyDownBtn].forEach(el => {
      if (el) el.disabled = true;
    });
    if (keyToggleBtn) {
      keyToggleBtn.classList.add("key-disabled");
      keyToggleBtn.title = "Key change is unavailable in this browser (AudioWorklet not supported)";
    }

    // Speedもキー変更と同じ位相ボコーダーを経由するため、AudioWorklet非対応環境では
    // 音質の悪いplaybackRateベースの簡易フォールバックは提供せず、Speed自体を無効化する。
    [speedToggleBtn, speedRangeEl, speedResetBtnEl].forEach(el => {
      if (el) el.disabled = true;
    });
    if (speedToggleBtn) {
      speedToggleBtn.classList.add("key-disabled");
      speedToggleBtn.title = "Speed change is unavailable in this browser (AudioWorklet not supported)";
    }
  }
}


// player-control-eq.js（旧player-eq.js）に分割移動済み（EQバンド制御・プリセット・モーダル開閉）

// VOL / SPEED / KEY ポップアップの開閉（同じ開閉パターンを共通化）
const avPopupInstances = [];

// ポップアップがボタンの下に開くと画面外（下方向）にはみ出す場合、
// 上に開き直す（画面内に必ず収まるようにする）。
// popup要素は position: absolute で toggleBtn の直近の position:relative 祖先を基準に配置されるため、
// 実際の画面内での収まり具合は getBoundingClientRect() で毎回判定し直す必要がある。
function keepPopupInViewport(toggleBtn, popup) {
  // 一旦「下に開く」基準の状態に戻してから採寸する（前回「上開き」のままだと採寸がずれるため）
  popup.classList.remove("open-upward");

  // 表示状態でないと正確な高さが取れないため、次のフレームで採寸する
  requestAnimationFrame(() => {
    const btnRect = toggleBtn.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    // 下方向に十分な余白がなく、上方向の方が広ければ上に開く
    if (spaceBelow < popupRect.height + 16 && spaceAbove > spaceBelow) {
      popup.classList.add("open-upward");
    }

    // 横方向も画面外にはみ出していたら、右端に揃えず画面内に収める
    const popupRectAfter = popup.getBoundingClientRect();
    if (popupRectAfter.left < 8) {
      popup.style.left = "8px";
      popup.style.right = "auto";
    } else {
      popup.style.left = "";
      popup.style.right = "";
    }
  });
}

function setupAvPopup(toggleBtnId, popupId) {
  const toggleBtn = document.getElementById(toggleBtnId);
  const popup = document.getElementById(popupId);
  if (!toggleBtn || !popup) return;

  const instance = { toggleBtn, popup };
  avPopupInstances.push(instance);

  function closeThis() {
    popup.classList.remove("open");
    toggleBtn.classList.remove("active");
  }

  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    if (toggleBtn.disabled) return;
    hapticTap();

    // SpeedまたはKeyのポップアップを実際に開いた（＝操作しようとした）瞬間に、
    // 初めてWeb Audio API（位相ボコーダー）へ接続する。EQボタンと同じ考え方で、
    // 実際に使われるまでは<audio>要素をWeb Audio APIに繋がない設計にすることで、
    // EQ・Speed・Keyのどれも使わない通常再生ではSafari固有の不具合を避けられる。
    if (toggleBtnId === "speedToggleBtn" || toggleBtnId === "keyToggleBtn") {
      setupAudioGraph().catch(err => console.warn("setupAudioGraph failed:", err));
    }

    const willOpen = !popup.classList.contains("open");
    // VOL/SPEED/KEYは排他：開く前に他の全ポップアップを閉じる
    avPopupInstances.forEach(other => {
      if (other !== instance) {
        other.popup.classList.remove("open");
        other.toggleBtn.classList.remove("active");
      }
    });

    popup.classList.toggle("open", willOpen);
    toggleBtn.classList.toggle("active", willOpen);
    if (willOpen) keepPopupInViewport(toggleBtn, popup);
  };
  popup.onclick = (e) => {
    e.stopPropagation();
  };
  document.addEventListener("click", closeThis);
}

setupAvPopup("volToggleBtn", "volPopup");
setupAvPopup("speedToggleBtn", "speedPopup");
setupAvPopup("keyToggleBtn", "keyPopup");

// CONTROLタブの各行（Vol/Speed/Key）は、それぞれ対応するBasic欄のトグルボタンを
// そのままクリックしたことにする。これにより、ポップアップの開閉・排他制御・
// オンデマンドのWeb Audio API接続(setupAvPopup側の処理)を重複実装せずに済む。
const CONTROL_LIST_ITEM_TARGET_MAP = {
  controlListVol: "volToggleBtn",
  controlListSpeed: "speedToggleBtn",
  controlListKey: "keyToggleBtn"
};
Object.entries(CONTROL_LIST_ITEM_TARGET_MAP).forEach(([listItemId, targetBtnId]) => {
  const listItem = document.getElementById(listItemId);
  const targetBtn = document.getElementById(targetBtnId);
  if (listItem && targetBtn) {
    listItem.onclick = (e) => {
      e.stopPropagation();
      targetBtn.click();
    };
  }
});

const loopToggleBtn = document.getElementById("loopToggleBtn");

// loopEnabled（単一マーカー区間のLoop）はブラウザを閉じても状態が残るよう
// localStorageに保存する。曲ごとではなくアプリ全体の設定として扱う。
const LOOP_ENABLED_STORAGE_KEY = "mp3player_loop_enabled";

function applyLoopButtonUI() {
  if (!loopToggleBtn) return;
  loopToggleBtn.classList.toggle("is-active", loopEnabled);
  loopToggleBtn.style.opacity = loopEnabled ? "1" : "0.4";
}

if (loopToggleBtn) {
  try {
    loopEnabled = localStorage.getItem(LOOP_ENABLED_STORAGE_KEY) === "1";
  } catch (e) {}
  applyLoopButtonUI();

  loopToggleBtn.onclick = () => {
    hapticTap();
    loopEnabled = !loopEnabled;
    try { localStorage.setItem(LOOP_ENABLED_STORAGE_KEY, loopEnabled ? "1" : "0"); } catch (e) {}
    // ループをONにする瞬間、AB間ループ回数カウンターをリセットする。
    if (typeof swAbLoopCount !== "undefined") swAbLoopCount = 0;
    if (typeof swUpdateLoopCounterUI === "function") swUpdateLoopCounterUI();
    applyLoopButtonUI();
    renderSegments();
  };
}

const allRepeatToggleBtn = document.getElementById("allRepeatToggleBtn");

// repeatMode（Off/One/All）もloopEnabledと同様、ブラウザを閉じても状態が残るよう
// localStorageに保存する。
const REPEAT_MODE_STORAGE_KEY = "mp3player_repeat_mode";

const REPEAT_ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
const REPEAT_ICON_ALL = '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
const REPEAT_ICON_ONE = '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg><span class="repeat-one-badge">1</span>';

function applyRepeatModeUI() {
  if (!allRepeatToggleBtn) return;

  const iconHtml = repeatMode === "one" ? REPEAT_ICON_ONE : repeatMode === "all" ? REPEAT_ICON_ALL : REPEAT_ICON_OFF;
  const labelText = repeatMode === "one" ? "Repeat 1" : repeatMode === "all" ? "Repeat All" : "Repeat";

  allRepeatToggleBtn.innerHTML = iconHtml;
  const label = document.createElement("span");
  label.className = "top-controls-btn-label";
  label.textContent = labelText;
  allRepeatToggleBtn.appendChild(label);

  const isActive = repeatMode !== "off";
  allRepeatToggleBtn.classList.toggle("is-active", isActive);
  allRepeatToggleBtn.style.opacity = isActive ? "1" : "0.4";
  allRepeatToggleBtn.title = repeatMode === "one" ? "Repeat One (click to cycle)" : repeatMode === "all" ? "Repeat All (click to cycle)" : "Repeat Off (click to cycle)";
}

if (allRepeatToggleBtn) {
  try {
    const savedRepeatMode = localStorage.getItem(REPEAT_MODE_STORAGE_KEY);
    if (savedRepeatMode === "one" || savedRepeatMode === "all" || savedRepeatMode === "off") {
      repeatMode = savedRepeatMode;
    }
  } catch (e) {}
  // シェアウェア制限：無料版に戻った場合（Premium期限切れ等）は起動時にOFF固定へ戻す。
  if (typeof isUnlocked === "function" && !isUnlocked() && repeatMode !== "off") {
    repeatMode = "off";
    try { localStorage.setItem(REPEAT_MODE_STORAGE_KEY, "off"); } catch (e) {}
  }

  allRepeatToggleBtn.onclick = () => {
    // シェアウェア制限：無料版はリピートOFF固定。トグル動作自体をブロックし、
    // ミニポップアップを表示する（repeatModeはoffのまま変化させない）。
    if (typeof isUnlocked === "function" && !isUnlocked()) {
      swShowUnlockToast("無料版ではトラックリピートを利用できません。");
      return;
    }
    hapticTap();
    repeatMode = repeatMode === "off" ? "one" : repeatMode === "one" ? "all" : "off";
    try { localStorage.setItem(REPEAT_MODE_STORAGE_KEY, repeatMode); } catch (e) {}
    applyRepeatModeUI();
  };
  applyRepeatModeUI();
}


// ============================================================
// Speed/KeyのON/OFFトグルスイッチ。player-core.js側のspeedEffectEnabled/
// keyEffectEnabledフラグを切り替え、updatePlaybackRate()で実際の音声へ
// 反映する（UIのスライダー値・表示自体は変更しない）。
// ============================================================
const controlSpeedEnableToggle = document.getElementById("controlSpeedEnableToggle");
if (controlSpeedEnableToggle) {
  controlSpeedEnableToggle.onclick = () => {
    // シェアウェア制限：無料版はSpeed効果のON/OFF切り替え自体も不可。
    if (typeof isUnlocked === "function" && !isUnlocked()) {
      swShowUnlockToast("無料版ではSpeed変更を利用できません。");
      return;
    }
    hapticTap();
    speedEffectEnabled = !speedEffectEnabled;
    controlSpeedEnableToggle.setAttribute("aria-checked", String(speedEffectEnabled));
    updatePlaybackRate();
  };
}

const controlKeyEnableToggle = document.getElementById("controlKeyEnableToggle");
if (controlKeyEnableToggle) {
  controlKeyEnableToggle.onclick = () => {
    // シェアウェア制限：無料版はKey効果のON/OFF切り替え自体も不可。
    if (typeof isUnlocked === "function" && !isUnlocked()) {
      swShowUnlockToast("無料版ではKey変更を利用できません。");
      return;
    }
    hapticTap();
    keyEffectEnabled = !keyEffectEnabled;
    controlKeyEnableToggle.setAttribute("aria-checked", String(keyEffectEnabled));
    updatePlaybackRate();
  };
}
