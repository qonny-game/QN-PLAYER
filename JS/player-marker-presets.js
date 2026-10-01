// ============================================================
// player-marker-presets.js
// player-markers.js の続き：マーカーメモのプリセット（チップ）、プリセットごとの
// 自動カラー(Marker Memo Colors)、カスタムプリセット、メモ編集中のプリセット選択
// ポップアップ(startPinMemoEdit)。
// player-markers.js の直後に読み込むこと（前半の関数・定数をグローバルで共有する）。
// ============================================================

// ============================================================
// 【v2.15.0】マーカーメモのプリセットごとの自動カラー。
// プリセット(チップ)を選んだ時、ここで設定された色をマーカーにも自動で付ける。
// 設定はColorパネルの「Marker Memo Colors」から変更でき、localStorageの
// MARKER_PRESET_COLORS_KEYに { プリセット名: 色キー|null } で保存する
// （色キーはMARKER_COLOR_PALETTE＝QN_THEMESのname。nullは「色を付けない」）。
// 初期値は色相が離れるように配色している。
// ============================================================
const MARKER_PRESET_COLORS_KEY = "qn_marker_preset_colors_v1";
const MARKER_PRESET_COLOR_DEFAULTS = {
  "Intro": "emerald",
  "Verse": "sky",
  "Pre-chorus": "violet",
  "Chorus": "red",
  "Last Chorus": "pink",
  "Bridge": "lime",
  "Solo": "amber",
  "Outro": "indigo"
};

// ============================================================
// 【v2.21.0】カスタムプリセット。ユーザーが自由に追加するメモ(+色)。
// localStorageのMARKER_CUSTOM_PRESETS_KEYに [{label, color}] で保存する。
// Colorパネルでは常に末尾へ「空欄の行」が1つ付き、入力すると次の空欄行が増える。
// 組み込みプリセットと同名(大文字小文字無視)・重複は無効として扱う。
// ============================================================
const MARKER_CUSTOM_PRESETS_KEY = "qn_marker_custom_presets_v1";
const MARKER_CUSTOM_PRESET_MAX = 30;
const MARKER_CUSTOM_LABEL_MAXLEN = 30;

function loadMarkerCustomPresets() {
  let arr = [];
  try {
    const raw = localStorage.getItem(MARKER_CUSTOM_PRESETS_KEY);
    if (raw) arr = JSON.parse(raw);
  } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  return arr
    .filter(x => x && typeof x.label === "string" && x.label.trim())
    .map(x => ({ label: x.label.trim().slice(0, MARKER_CUSTOM_LABEL_MAXLEN), color: x.color || null }))
    .slice(0, MARKER_CUSTOM_PRESET_MAX);
}

function saveMarkerCustomPresets(list) {
  const clean = list
    .filter(x => x && x.label && x.label.trim())
    .map(x => ({ label: x.label.trim(), color: x.color || null }));
  try { localStorage.setItem(MARKER_CUSTOM_PRESETS_KEY, JSON.stringify(clean)); } catch (e) {}
}

// 実際にチップとして使うカスタム(重複・組み込みと同名を除く)
function getValidMarkerCustomPresets() {
  const seen = new Set(MARKER_LABEL_PRESETS.map(l => l.toLowerCase()));
  const out = [];
  loadMarkerCustomPresets().forEach(x => {
    const k = x.label.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(x);
  });
  return out;
}

// 組み込み＋カスタムのラベル一覧（チップの並び順）
function getAllMarkerPresetLabels() {
  return MARKER_LABEL_PRESETS.concat(getValidMarkerCustomPresets().map(x => x.label));
}

function getMarkerPresetColors() {
  let saved = {};
  try {
    const raw = localStorage.getItem(MARKER_PRESET_COLORS_KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch (e) { saved = {}; }
  const result = {};
  MARKER_LABEL_PRESETS.forEach(label => {
    result[label] = Object.prototype.hasOwnProperty.call(saved, label)
      ? saved[label]
      : (MARKER_PRESET_COLOR_DEFAULTS[label] || null);
  });
  getValidMarkerCustomPresets().forEach(x => { result[x.label] = x.color || null; });
  return result;
}

function setMarkerPresetColor(label, colorName) {
  const current = getMarkerPresetColors();
  current[label] = colorName || null;
  try { localStorage.setItem(MARKER_PRESET_COLORS_KEY, JSON.stringify(current)); } catch (e) {}
}

// Colorパネル内の設定行（#qnMarkerPresetColorRows、index.html側）を組み立てる。
function renderMarkerPresetColorSettings() {
  const rowsEl = document.getElementById("qnMarkerPresetColorRows");
  if (!rowsEl) return;
  rowsEl.innerHTML = "";
  const colors = getMarkerPresetColors();
  MARKER_LABEL_PRESETS.forEach(label => {
    const colorName = colors[label];
    const hex = colorName && MARKER_COLOR_PALETTE[colorName] ? MARKER_COLOR_PALETTE[colorName] : null;

    const row = document.createElement("div");
    row.className = "qn-marker-preset-color-row";

    const name = document.createElement("span");
    name.className = "qn-marker-preset-color-name";
    name.textContent = label;

    const swatchBtn = document.createElement("button");
    swatchBtn.type = "button";
    swatchBtn.className = "marker-color-swatch qn-marker-preset-color-swatch" + (hex ? "" : " marker-color-none");
    swatchBtn.title = hex ? colorName : "No color";
    if (hex) swatchBtn.style.background = hex;
    swatchBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof hapticTap === "function") hapticTap();
      openColorChoicePopup(swatchBtn, colorName || null, (picked) => {
        setMarkerPresetColor(label, picked);
        renderMarkerPresetColorSettings();
      });
    };

    row.appendChild(name);
    row.appendChild(swatchBtn);
    rowsEl.appendChild(row);
  });

  // ---- カスタム行（入力欄＋色）。末尾には常に空欄の行を1つ置く ----
  const customs = loadMarkerCustomPresets();
  customs.push({ label: "", color: null }); // 末尾の空欄
  const state = customs; // 編集中の配列（入力のたびに更新）

  function persist() { saveMarkerCustomPresets(state); }

  function buildCustomRow(entry) {
    const row = document.createElement("div");
    row.className = "qn-marker-preset-color-row qn-marker-custom-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "qn-marker-custom-input";
    input.placeholder = "Custom memo";
    input.maxLength = MARKER_CUSTOM_LABEL_MAXLEN;
    input.value = entry.label;
    input.setAttribute("aria-label", "Custom memo text");

    const swatchBtn = document.createElement("button");
    swatchBtn.type = "button";
    swatchBtn.className = "marker-color-swatch qn-marker-preset-color-swatch";
    function paint() {
      const hex = entry.color && MARKER_COLOR_PALETTE[entry.color] ? MARKER_COLOR_PALETTE[entry.color] : null;
      swatchBtn.classList.toggle("marker-color-none", !hex);
      swatchBtn.style.background = hex || "";
      swatchBtn.title = hex ? entry.color : "No color";
    }
    paint();
    swatchBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof hapticTap === "function") hapticTap();
      openColorChoicePopup(swatchBtn, entry.color || null, (picked) => {
        entry.color = picked || null;
        paint();
        persist();
        // 空欄行に色だけ先に選んだ場合も、行は残す（テキスト入力待ち）
      });
    };

    input.addEventListener("input", () => {
      entry.label = input.value;
      persist();
      // 一番下の行に文字が入ったら、次の空欄行を足す
      if (entry === state[state.length - 1] && entry.label.trim() && state.length < MARKER_CUSTOM_PRESET_MAX + 1) {
        const blank = { label: "", color: null };
        state.push(blank);
        rowsEl.appendChild(buildCustomRow(blank));
      }
    });
    // 確定(フォーカスアウト/Enter)時：中間の空欄行は詰めて整える
    input.addEventListener("change", () => {
      const last = state[state.length - 1];
      const hasEmptyMiddle = state.some((x, i) => i < state.length - 1 && !x.label.trim());
      if (hasEmptyMiddle || (last && last.label.trim())) renderMarkerPresetColorSettings();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      e.stopPropagation(); // 画面のショートカットに奪われないように
    });

    // 削除ボタン（文字が入っている行だけ表示。末尾の空欄行では非表示）
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "qn-marker-custom-del";
    delBtn.title = "Delete";
    delBtn.setAttribute("aria-label", "Delete custom memo");
    delBtn.textContent = "\u00d7";
    function syncDel() { delBtn.style.visibility = entry.label.trim() ? "visible" : "hidden"; }
    syncDel();
    input.addEventListener("input", syncDel);
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof hapticTap === "function") hapticTap();
      const i = state.indexOf(entry);
      if (i >= 0) state.splice(i, 1);
      persist();
      renderMarkerPresetColorSettings();
    };

    row.appendChild(input);
    row.appendChild(swatchBtn);
    row.appendChild(delBtn);
    return row;
  }

  customs.forEach(entry => rowsEl.appendChild(buildCustomRow(entry)));
}
renderMarkerPresetColorSettings();
document.addEventListener("DOMContentLoaded", renderMarkerPresetColorSettings);

// メモ編集中のプリセット選択ポップアップ（1つだけ開く）。
var activePinMemoPresetPopup = null; // renderPinList()から先に参照され得るためvar（TDZ回避）
function closePinMemoPresetPopup() {
  if (activePinMemoPresetPopup) {
    activePinMemoPresetPopup.popup.remove();
    window.removeEventListener("scroll", activePinMemoPresetPopup.reposition, true);
    window.removeEventListener("resize", activePinMemoPresetPopup.reposition);
    activePinMemoPresetPopup = null;
  }
}

function startPinMemoEdit(itemDiv, infoSpan, pinObj, index) {
  if (itemDiv.querySelector(".pin-memo-input")) return; // 既に編集中なら何もしない

  const input = document.createElement("input");
  input.type = "text";
  input.className = "pin-memo-input";
  input.value = pinObj.memo || "";
  input.placeholder = `${pinObj.t.toFixed(2)}s`;
  input.maxLength = 60;

  infoSpan.style.display = "none";
  // infoSpanは.pin-label-row(ホバーで鉛筆を出す行ラッパー)の子なので、
  // itemDiv(.pinItem本体)ではなくinfoSpan.parentNode基準で挿入する。
  infoSpan.parentNode.insertBefore(input, infoSpan);
  input.focus();
  input.select();

  // 【v2.15.0】プリセットは行の中ではなく、入力欄の下に浮かぶポップアップで
  // 表示する（以前は.pinItemの中に行として追加していたため、編集中だけ
  // リストの行が縦に広がっていた）。チップを押したら、メモの確定・
  // プリセットに設定された色の自動適用・ポップアップと編集モードの終了まで
  // 一度に行う。
  const presetPopup = document.createElement("div");
  presetPopup.className = "pin-memo-preset-popup";
  const presetColors = getMarkerPresetColors();
  let presetPointerActive = false;

  let finished = false;
  function commit() {
    if (finished) return;
    finished = true;
    closePinMemoPresetPopup();
    pinObj.memo = input.value.trim();
    savePins();
    renderPinList();
  }
  function cancel() {
    if (finished) return;
    finished = true;
    closePinMemoPresetPopup();
    renderPinList();
  }
  function applyPreset(label) {
    if (finished) return;
    finished = true;
    closePinMemoPresetPopup();
    pinObj.memo = label;
    const colorName = presetColors[label];
    let colorChanged = false;
    if (colorName && MARKER_COLOR_PALETTE[colorName]) {
      pinObj.color = colorName;
      colorChanged = true;
    }
    savePins();
    renderPinList();
    if (colorChanged) {
      renderPins();
      renderSegments();
    }
    if (typeof hapticTap === "function") hapticTap();
  }

  getAllMarkerPresetLabels().forEach(label => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pin-memo-preset-chip";
    const colorName = presetColors[label];
    const hex = colorName && MARKER_COLOR_PALETTE[colorName] ? MARKER_COLOR_PALETTE[colorName] : null;
    if (hex) {
      const dot = document.createElement("span");
      dot.className = "pin-memo-preset-dot";
      dot.style.background = hex;
      chip.appendChild(dot);
    }
    chip.appendChild(document.createTextNode(label));
    // pointerdownでpreventDefaultして入力欄のフォーカス（=編集状態）を
    // 保ち、実際の適用はclickで行う。pointerdown時点で適用・ポップアップを
    // 消すと、その後のclickが下にあるリスト行（マーカーへジャンプ等）に
    // 落ちてしまうため。
    chip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      presetPointerActive = true;
      // チップを押したまま外へ指を離した（clickにならなかった）場合の後始末：
      // 押下フラグを戻し、入力欄からフォーカスが外れていれば通常どおり確定する。
      window.addEventListener("pointerup", () => {
        setTimeout(() => {
          if (!presetPointerActive) return;
          presetPointerActive = false;
          if (!finished && document.activeElement !== input) commit();
        }, 80);
      }, { once: true });
    });
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      presetPointerActive = false;
      applyPreset(label);
    });
    presetPopup.appendChild(chip);
  });
  presetPopup.addEventListener("click", e => e.stopPropagation());

  function reposition() {
    if (!input.isConnected) { closePinMemoPresetPopup(); return; }
    const r = input.getBoundingClientRect();
    const popupRect = presetPopup.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + popupRect.height > window.innerHeight - 8) {
      top = Math.max(8, r.top - popupRect.height - 6);
    }
    let left = r.left;
    if (left + popupRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popupRect.width - 8);
    }
    presetPopup.style.top = top + "px";
    presetPopup.style.left = left + "px";
  }

  closePinMemoPresetPopup();
  document.body.appendChild(presetPopup);
  activePinMemoPresetPopup = { popup: presetPopup, reposition };
  reposition();
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener("blur", () => {
    // プリセットチップを押している最中のフォーカス外れ（iOS等でpointerdownの
    // preventDefaultが効かない場合）では確定しない。チップのclick側で
    // applyPreset()が確定まで行う。
    setTimeout(() => {
      if (presetPointerActive) return;
      commit();
    }, 0);
  });
  input.addEventListener("click", e => e.stopPropagation());
}

// シェアウェア制限：広告解除/サブスク購入した瞬間、マーカーの鍵アイコン表示・
// 波形ロック表示を即座に更新するため、player-shareware.js側のリフレッシュ機構に登録する。
if (typeof swRegisterRefreshCallback === "function") {
  swRegisterRefreshCallback(() => {
    if (typeof renderPinList === "function") renderPinList();
    if (typeof renderPins === "function") renderPins();
  });
}
