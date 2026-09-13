// ============================================================
// player-eq.js
// 10バンド・グラフィックイコライザー機能：バンド値の設定・プリセット適用、
// ドラッグでの一括描画、EQモーダルの開閉。
//
// 依存: player-core.js（EQ_FREQS, setupAudioGraph等）、
// player-ui-shared.js（hapticTap, hapticTick等の共通UI関数）。
// ============================================================


// 10バンド・グラフィックイコライザーのUI制御
function setEqBandValue(bandIndex, gain) {
  gain = Math.max(-15, Math.min(15, Math.round(gain)));
  const slider = document.getElementById("eqBand" + bandIndex);
  const gainLabel = document.getElementById("eqGain" + bandIndex);
  if (slider) slider.value = gain;
  if (gainLabel) gainLabel.textContent = (gain > 0 ? "+" : "") + gain;
  const filter = eqFilters[bandIndex];
  if (filter) filter.gain.value = gain;
}

// 各バンドのrangeスライダー：通常のクリック/キーボード操作にも対応
const eqLastTickValues = new Array(EQ_FREQS.length).fill(0);
for (let i = 0; i < EQ_FREQS.length; i++) {
  const slider = document.getElementById("eqBand" + i);
  if (slider) {
    slider.oninput = e => {
      const gain = parseFloat(e.target.value);
      if (gain !== eqLastTickValues[i]) {
        hapticTick();
        eqLastTickValues[i] = gain;
      }
      setEqBandValue(i, gain);
    };
  }
}

// EQプリセット。各配列はEQ_FREQS([31,62,125,250,500,1000,2000,4000,8000,16000])の順に対応する10個のdB値。
const EQ_PRESETS = {
  flat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass:   [8, 7, 6, 4, 2, 0, 0, 0, 0, 0],
  vocal:  [-2, -2, -1, 1, 4, 5, 4, 2, 0, -1],
  treble: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  vshape: [7, 6, 3, 0, -3, -4, -3, 0, 4, 6]
};

function applyEqPreset(presetName) {
  const values = EQ_PRESETS[presetName];
  if (!values) return;
  values.forEach((gain, i) => setEqBandValue(i, gain));
}

// プリセットボタンの選択状態(active)を更新する。nameがnullなら「どれも選ばれていない(Custom相当)」状態にする。
function setActiveEqPresetButton(name) {
  document.querySelectorAll(".eq-preset-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-preset") === name);
  });
}

document.querySelectorAll(".eq-preset-btn").forEach(btn => {
  btn.onclick = () => {
    hapticTap();
    const preset = btn.getAttribute("data-preset");
    applyEqPreset(preset);
    setActiveEqPresetButton(preset);
  };
});

// バンドを手動で操作したら、どのプリセットボタンも選択されていない状態に戻す
for (let i = 0; i < EQ_FREQS.length; i++) {
  const slider = document.getElementById("eqBand" + i);
  if (slider) {
    slider.addEventListener("input", () => {
      setActiveEqPresetButton(null);
    });
  }
}

// ドラッグで複数バンドを一気に「山なり」に描画する操作
const eqBandsEl = document.getElementById("eqBands");
if (eqBandsEl) {
  let eqDragging = false;

  function applyEqDragAt(clientX, clientY) {
    const bandEls = eqBandsEl.querySelectorAll(".eq-band");
    let changed = false;
    bandEls.forEach((bandEl, i) => {
      const track = bandEl.querySelector(".eq-slider-track");
      if (!track) return;
      const rect = track.getBoundingClientRect();
      // ドラッグ中のX座標がこのバンドの列の範囲内にあるときだけ、そのバンドの値をY座標から更新する
      if (clientX >= rect.left && clientX <= rect.right) {
        const ratio = 1 - (clientY - rect.top) / rect.height; // 上が+15, 下が-15
        const gain = -15 + Math.max(0, Math.min(1, ratio)) * 30;
        setEqBandValue(i, gain);
        changed = true;
      }
    });
    if (changed) {
      setActiveEqPresetButton(null);
    }
  }

  eqBandsEl.addEventListener("mousedown", e => {
    eqDragging = true;
    applyEqDragAt(e.clientX, e.clientY);
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!eqDragging) return;
    applyEqDragAt(e.clientX, e.clientY);
  });

  document.addEventListener("mouseup", () => {
    eqDragging = false;
  });

  // タッチ操作対応
  eqBandsEl.addEventListener("touchstart", e => {
    eqDragging = true;
    const t = e.touches[0];
    applyEqDragAt(t.clientX, t.clientY);
  }, { passive: true });

  eqBandsEl.addEventListener("touchmove", e => {
    if (!eqDragging) return;
    const t = e.touches[0];
    applyEqDragAt(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });

  eqBandsEl.addEventListener("touchend", () => {
    eqDragging = false;
  });
}

// EQモーダルの開閉（Exportモーダルと同じパターン）
const eqToggleBtn = document.getElementById("eqToggleBtn");
const eqModalOverlay = document.getElementById("eqModalOverlay");
const eqModalCloseBtn = document.getElementById("eqModalCloseBtn");

function openEqModal() {
  hapticTap();
  // EQ機能が実際に使われる瞬間（このモーダルを開いた時）に、初めてWeb Audio APIへ接続する。
  // 一度接続すればaudioGraphSetupDoneフラグにより以降は再接続されない。
  setupAudioGraph().catch(err => console.warn("setupAudioGraph failed:", err));
  if (eqModalOverlay) eqModalOverlay.classList.add("open");
}

function closeEqModal() {
  hapticTap();
  if (eqModalOverlay) eqModalOverlay.classList.remove("open");
}

if (eqToggleBtn) {
  eqToggleBtn.onclick = (e) => {
    e.stopPropagation();
    openEqModal();
  };
}
if (eqModalCloseBtn) {
  eqModalCloseBtn.onclick = () => closeEqModal();
}
if (eqModalOverlay) {
  // オーバーレイの背景部分（モーダル本体の外側）をクリックしたら閉じる
  eqModalOverlay.onclick = (e) => {
    if (e.target === eqModalOverlay) closeEqModal();
  };
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && eqModalOverlay && eqModalOverlay.classList.contains("open")) {
    closeEqModal();
  }
});
