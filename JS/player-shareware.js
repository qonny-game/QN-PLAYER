// ============================================================
// player-shareware.js
// QNPLAYER シェアウェア・マネタイズ機能：無料版の機能制限ロジックと
// 「プレミアムアンロックモーダル」の共通処理。
//
// 現段階ではFirestore連携はまだ行わず、解除状態はlocalStorageのみで
// 管理する（QNPLAYER_Shareware_Spec.md準拠、フェーズ1: ローカル制限ロジックのみ）。
// 広告視聴は未実装で、モーダルの「広告を観て解除」ボタンは押した瞬間に
// 即解除されるダミー動作（実際の広告SDK連携は後工程）。
//
// 依存: player-ui-shared.js（hapticTap, hapticWarning, hapticSuccess）。
// このファイルはDOM構築後、他のUIロジック（markers/playlist/controls）
// より前に読み込むこと（各ファイルがQN_SHAREWAREのグローバル関数を
// 参照するため）。
// ============================================================

const SW_UNLOCK_STORAGE_KEY = "qnplayer_unlock_until"; // 数値(epoch ms)。0または未設定=無料版、-1=永久(Premium)。

// 無料版の各種上限値。仕様書(QNPLAYER_Shareware_Spec.md)の数値をそのまま定数化。
const SW_LIMITS = {
  LIBRARY_MAX_TRACKS: 3,
  MARKER_MAX_ACTIVE: 3,
  AB_LOOP_MAX_COUNT: 5
};

// --- 解除状態の読み書き ---
function swGetUnlockUntil() {
  try {
    const raw = localStorage.getItem(SW_UNLOCK_STORAGE_KEY);
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

function swSetUnlockUntil(value) {
  try {
    localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(value));
  } catch (e) {}

  // ログイン中はFirestoreにも書き込み、他の端末/ブラウザからも同じ解除状態が
  // 見えるようにする（未ログインの場合はlocalStorageのみのフォールバック動作）。
  if (window.QN_AUTH && window.QN_AUTH.currentUser && typeof window.QN_AUTH.saveUnlockUntilToFirestore === "function") {
    window.QN_AUTH.saveUnlockUntilToFirestore(window.QN_AUTH.currentUser.uid, value);
  }
}

// 現在Premium（無制限）状態かどうか。
// -1 = 永久解除（サブスク契約中）、または現在時刻がunlockUntilより前 = 広告解除の時限中。
function isUnlocked() {
  const until = swGetUnlockUntil();
  if (until === -1) return true;
  if (until > 0 && Date.now() < until) return true;
  return false;
}

// 時限解除の残り時間を分単位の目安文字列で返す（モーダル等の表示用）。
function swGetUnlockRemainingLabel() {
  const until = swGetUnlockUntil();
  if (until === -1) return "Premium";
  if (until <= 0) return null;
  const remainMs = until - Date.now();
  if (remainMs <= 0) return null;
  const remainHours = remainMs / (1000 * 60 * 60);
  if (remainHours >= 1) return `残り約${Math.ceil(remainHours)}時間`;
  return `残り約${Math.ceil(remainMs / (1000 * 60))}分`;
}

// --- ダミー広告解除・サブスク解除（実際の広告SDK/決済は後工程） ---
function swUnlockForHours(hours) {
  const until = Date.now() + hours * 60 * 60 * 1000;
  // 既に時限解除中で残り時間がそれより長い場合は短縮しない（延長のみ）。
  const current = swGetUnlockUntil();
  if (current !== -1 && current > until) return;
  swSetUnlockUntil(until);
}

// ============================================================
// FirestoreとlocalStorageの解除状態マージ（ログイン成功直後にplayer-auth.js
// から呼ばれる）。
//
// 優先ルール：
//   1. どちらかがPremium(-1)なら、Premiumを採用（永久解除は最優先）。
//   2. それ以外は、残り時間が長い方（＝unlockUntilの値が大きい方）を採用。
//      これにより「別の端末で広告を見て時限解除した」場合も、
//      今のブラウザの解除状態を誤って短縮しない。
//   3. マージ後の値を両方（localStorage・Firestore）に反映して揃える。
// ============================================================
async function swSyncUnlockWithFirestore(uid) {
  if (!window.QN_AUTH || typeof window.QN_AUTH.fetchUnlockUntilFromFirestore !== "function") return;

  const remoteUntil = await window.QN_AUTH.fetchUnlockUntilFromFirestore(uid);
  const localUntil = swGetUnlockUntil();

  let merged;
  if (remoteUntil === -1 || localUntil === -1) {
    merged = -1;
  } else {
    // remoteUntilがnull（Firestore未登録）の場合は0として扱う。
    merged = Math.max(remoteUntil || 0, localUntil || 0);
  }

  if (merged !== localUntil) {
    try {
      localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(merged));
    } catch (e) {}
  }
  // マージ結果をFirestore側にも書き戻し、両者を揃える
  // （例：ローカルの方が新しかった場合、Firestore側が古いまま残らないようにする）。
  if (merged !== remoteUntil) {
    window.QN_AUTH.saveUnlockUntilToFirestore(uid, merged);
  }

  swRefreshAllLockedUI();
}
window.swSyncUnlockWithFirestore = swSyncUnlockWithFirestore;

function swUnlockPremium() {
  swSetUnlockUntil(-1);
}

// ============================================================
// プレミアムアンロックモーダル（共通）
// ============================================================
let swModalOverlay = null;

function swBuildModal() {
  if (swModalOverlay) return swModalOverlay;

  const overlay = document.createElement("div");
  overlay.id = "swUnlockModalOverlay";
  overlay.className = "sw-unlock-modal-overlay";

  overlay.innerHTML = `
    <div class="sw-unlock-modal">
      <div class="sw-unlock-modal-header">
        <span id="swUnlockModalTitle">この機能はPremium限定です</span>
        <button id="swUnlockModalCloseBtn" class="sw-unlock-modal-close" title="Close">✕</button>
      </div>
      <div class="sw-unlock-modal-body">
        <p id="swUnlockModalDesc" class="sw-unlock-modal-desc"></p>
        <div class="sw-unlock-options">
          <button class="sw-unlock-option" id="swUnlockAd1h">
            <span class="sw-unlock-option-title">広告を観て1時間解除</span>
            <span class="sw-unlock-option-sub">動画広告1本</span>
          </button>
          <button class="sw-unlock-option" id="swUnlockAd24h">
            <span class="sw-unlock-option-title">広告を観て24時間解除</span>
            <span class="sw-unlock-option-sub">動画広告2〜3本</span>
          </button>
          <button class="sw-unlock-option sw-unlock-option-premium" id="swUnlockSubscribe">
            <span class="sw-unlock-option-title">サブスクリプションで永久解除</span>
            <span class="sw-unlock-option-sub">月額/年額</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  swModalOverlay = overlay;

  const closeBtn = overlay.querySelector("#swUnlockModalCloseBtn");
  closeBtn.onclick = () => swCloseUnlockModal();
  overlay.onclick = (e) => {
    if (e.target === overlay) swCloseUnlockModal();
  };

  // ダミー広告視聴（実際の広告SDK連携は後工程。タップ即解除）。
  overlay.querySelector("#swUnlockAd1h").onclick = () => {
    hapticSuccess();
    swUnlockForHours(1);
    swCloseUnlockModal();
    swRefreshAllLockedUI();
  };
  overlay.querySelector("#swUnlockAd24h").onclick = () => {
    hapticSuccess();
    swUnlockForHours(24);
    swCloseUnlockModal();
    swRefreshAllLockedUI();
  };
  // サブスクは決済連携が未実装のため、現時点では案内のみ（後工程でStripe Checkout等に接続）。
  overlay.querySelector("#swUnlockSubscribe").onclick = () => {
    hapticTap();
    alert("サブスクリプション機能は準備中です。");
  };

  return overlay;
}

function swOpenUnlockModal(message) {
  hapticWarning();
  const overlay = swBuildModal();
  const descEl = overlay.querySelector("#swUnlockModalDesc");
  if (descEl) descEl.textContent = message || "この機能は無料版では利用できません。";
  overlay.classList.add("active");
}

function swCloseUnlockModal() {
  if (swModalOverlay) swModalOverlay.classList.remove("active");
}

// 制限機能を解除するたびに、画面上の各ロックUI（プレイリスト鍵アイコン、
// マーカーの鍵アイコン等）を再描画して即座に反映する。
// 各モジュール側が「自分の再描画関数」をここに登録する形にして、
// player-shareware.js自体は各機能の描画詳細を知らなくて済むようにする。
const swRefreshCallbacks = [];
function swRegisterRefreshCallback(fn) {
  if (typeof fn === "function") swRefreshCallbacks.push(fn);
}
function swRefreshAllLockedUI() {
  swRefreshCallbacks.forEach(fn => {
    try { fn(); } catch (e) { console.error(e); }
  });
}

// ============================================================
// AB間ループ回数カウンター（無料版のみ5回で自動停止）
// カウント自体の増加・上限判定はplayer-ui-shared.js側(updateBars内の
// ループ折り返し検知)で行い、このファイルは状態の保持と表示更新のみを担う。
// ============================================================
let swAbLoopCount = 0;

function swUpdateLoopCounterUI() {
  const el = document.getElementById("swLoopCounter");
  if (!el) return;

  // Premium/時限解除中はカウンター自体を表示しない。
  if (typeof isUnlocked === "function" && isUnlocked()) {
    el.classList.remove("active");
    return;
  }
  // ループがOFFの間は表示しない。
  if (typeof loopEnabled === "undefined" || !loopEnabled) {
    el.classList.remove("active");
    return;
  }

  el.textContent = `${swAbLoopCount} / ${SW_LIMITS.AB_LOOP_MAX_COUNT}`;
  el.classList.add("active");
}

// ============================================================
// Speed/Keyコントロールカードの見た目ロック状態。
// 無料版では常に暗く表示し、Premium化/時限解除された瞬間に明るく戻す。
// ============================================================
function swUpdateSpeedKeyLockUI() {
  const locked = typeof isUnlocked === "function" && !isUnlocked();
  const speedCard = document.getElementById("controlSpeedCard");
  const keyCard = document.querySelector(".key-control-card");
  if (speedCard) speedCard.classList.toggle("sw-disabled-control", locked);
  if (keyCard) keyCard.classList.toggle("sw-disabled-control", locked);
}
swRegisterRefreshCallback(swUpdateSpeedKeyLockUI);
// 初期表示にも反映する（DOMContentLoaded後にこのファイルが読み込まれる前提のため即実行）。
swUpdateSpeedKeyLockUI();

// ============================================================
// 【検証用・一時的】ここから下は動作確認用のデバッグパネル処理。
// リリース前にこのブロック全体（次のコメント終端まで）を削除すること。
// index.html側の<div id="swDebugPanel">〜</div>、
// CSS/style-shareware.css側の#swDebugPanel関連スタイルも合わせて削除する。
// ============================================================
function swDebugUpdateStatusLabel() {
  const statusEl = document.getElementById("swDebugStatus");
  if (!statusEl) return;
  const until = swGetUnlockUntil();
  if (until === -1) {
    statusEl.textContent = "PREMIUM";
  } else if (until > 0 && Date.now() < until) {
    statusEl.textContent = "UNLOCKED (" + (swGetUnlockRemainingLabel() || "") + ")";
  } else {
    statusEl.textContent = "FREE";
  }
}

const swDebugUnlockPremiumBtn = document.getElementById("swDebugUnlockPremiumBtn");
if (swDebugUnlockPremiumBtn) {
  swDebugUnlockPremiumBtn.onclick = () => {
    swUnlockPremium();
    swRefreshAllLockedUI();
    swDebugUpdateStatusLabel();
  };
}

const swDebugUnlock1hBtn = document.getElementById("swDebugUnlock1hBtn");
if (swDebugUnlock1hBtn) {
  swDebugUnlock1hBtn.onclick = () => {
    swUnlockForHours(1);
    swRefreshAllLockedUI();
    swDebugUpdateStatusLabel();
  };
}

const swDebugRelockBtn = document.getElementById("swDebugRelockBtn");
if (swDebugRelockBtn) {
  swDebugRelockBtn.onclick = () => {
    swSetUnlockUntil(0);
    swRefreshAllLockedUI();
    swDebugUpdateStatusLabel();
  };
}

// 本番のアンロックモーダル（広告ボタン等）経由で解除された場合も、
// デバッグパネルの表示が追従するよう、共通リフレッシュ機構に登録する。
swRegisterRefreshCallback(swDebugUpdateStatusLabel);

// 時限解除中は残り時間が減っていくのが分かるよう、1分ごとに表示を更新する。
setInterval(swDebugUpdateStatusLabel, 60 * 1000);

swDebugUpdateStatusLabel();
// ============================================================
// 【検証用・一時的】デバッグパネル処理ここまで。
// ============================================================
