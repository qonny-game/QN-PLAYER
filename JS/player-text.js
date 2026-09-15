// ============================================================
// player-text.js
// Textタブ機能：ファイル名キーでの自動保存、サイドバー高さのText用調整、
// フルスクリーン表示＋文字サイズ調整。
//
// 依存: player-core.js（saveNoteText）、
// player-ui-shared.js（hapticTap, sidebarSection, currentMobileTab等の
// サイドバー共通変数・関数。サイドバー開閉の共通機構自体は
// player-ui-shared.js側に残っている）。
// ============================================================

// Textタブ：入力のたびにファイル名キーでlocalStorageへ自動保存する（Save操作不要）。
const noteTextAreaEl = document.getElementById("noteTextArea");
if (noteTextAreaEl) {
  noteTextAreaEl.addEventListener("input", saveNoteText);
}

// Textタブが選択されている間だけ、サイドバー(.sidebar-section)の高さを画面の残り高さ
// いっぱいに固定し、中のtextareaがその下端まで伸びるようにする。Text以外のタブでは
// 元の height: fit-content（中身なりの高さ）に戻す。
// 下端の基準は.top-controls（画面下部固定の再生コントロール）の上端。
function updateSidebarHeightForTextTab() {
  if (!sidebarSection) return;
  if (currentMobileTab !== "text") {
    sidebarSection.classList.remove("text-tab-active");
    sidebarSection.style.height = "";
    return;
  }
  sidebarSection.classList.add("text-tab-active");
  const topControls = document.querySelector(".top-controls");
  const rect = sidebarSection.getBoundingClientRect();
  const bottomLimit = topControls ? topControls.getBoundingClientRect().top : window.innerHeight;
  const available = bottomLimit - rect.top;
  if (available > 0) {
    sidebarSection.style.height = available + "px";
  }
}

window.addEventListener("resize", () => {
  if (currentMobileTab === "text") updateSidebarHeightForTextTab();
});

// ============================================================
// Textタブ：フルスクリーン表示＋文字サイズ調整
// 本体(#noteTextArea)とフルスクリーン側(#noteTextAreaFullscreen)は
// 同じ内容を相互同期する。保存はどちらの入力でもsaveNoteText()が
// 本体側の値を基準に行われるため、フルスクリーン側の入力時は
// まず本体側へ値をコピーしてからsaveNoteText()を呼ぶ。
// 文字サイズはフルスクリーン表示専用の設定として、全曲共通で
// localStorageに保存する（曲ごとではない、読みやすさの好みのため）。
// ============================================================
(function () {
  const FONT_SIZE_KEY = "mp3player_text_fullscreen_fontsize";
  const FONT_SIZE_MIN = 14;
  const FONT_SIZE_MAX = 40;
  const FONT_SIZE_STEP = 2;
  const FONT_SIZE_DEFAULT = 20;

  const overlay = document.getElementById("textFullscreenOverlay");
  const mainArea = document.getElementById("noteTextArea");
  const fsArea = document.getElementById("noteTextAreaFullscreen");
  const openBtn = document.getElementById("noteTextFullscreenBtn");
  const closeBtn = document.getElementById("noteTextFullscreenCloseBtn");
  const decBtn = document.getElementById("noteTextFontDecBtn");
  const incBtn = document.getElementById("noteTextFontIncBtn");

  if (!overlay || !mainArea || !fsArea) return;

  function loadFontSize() {
    const saved = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10);
    return Number.isFinite(saved) ? saved : FONT_SIZE_DEFAULT;
  }

  function applyFontSize(size) {
    const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
    fsArea.style.fontSize = clamped + "px";
    localStorage.setItem(FONT_SIZE_KEY, String(clamped));
    return clamped;
  }

  let currentFontSize = loadFontSize();
  applyFontSize(currentFontSize);

  if (openBtn) {
    openBtn.onclick = () => {
      fsArea.value = mainArea.value;
      overlay.classList.add("open");
      hapticTap();
      // あえてfocus()しない：フォーカスするとソフトキーボードが開いて
      // 入力状態になってしまい、また内容によってはスクロール位置が
      // 末尾寄りになることがあるため、開いた直後は閲覧状態（非フォーカス）
      // かつ先頭から見えるようにする。valueの再代入直後はブラウザによって
      // カーソル位置が末尾扱いになることがあるため、選択範囲も先頭へ戻す。
      fsArea.setSelectionRange(0, 0);
      fsArea.scrollTop = 0;
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.classList.remove("open");
      hapticTap();
    };
  }

  // フルスクリーン側での入力を本体側へ即時反映し、同じ保存経路(saveNoteText)を使う。
  fsArea.addEventListener("input", () => {
    mainArea.value = fsArea.value;
    saveNoteText();
  });

  if (decBtn) {
    decBtn.onclick = () => {
      currentFontSize = applyFontSize(currentFontSize - FONT_SIZE_STEP);
      hapticTap();
    };
  }
  if (incBtn) {
    incBtn.onclick = () => {
      currentFontSize = applyFontSize(currentFontSize + FONT_SIZE_STEP);
      hapticTap();
    };
  }
})();
