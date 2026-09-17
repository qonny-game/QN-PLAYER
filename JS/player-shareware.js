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
const SW_UNLOCK_UPDATED_AT_KEY = "qnplayer_unlock_updated_at"; // このブラウザで最後に解除状態を変更した時刻(epoch ms)。
                                                                 // Firestoreとのマージ時、「どちらの操作が新しいか」の判定に使う
                                                                 // （単純にunlockUntilの値が大きい方を採用すると、無料版へ
                                                                 //   「戻す」操作が古い時限解除の値に上書きされてしまうため）。
const SW_PLAN_TYPE_STORAGE_KEY = "qnplayer_plan_type"; // "monthly" / "yearly" / "lifetime" / null(広告時限解除・無料版)。
                                                          // Cloud Functions(stripeWebhook)がFirestoreに書き込んだ値をそのまま
                                                          // ミラーする。モーダルの階層表示（同等・下位プランのボタンを隠す）に使う。

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

// 現在契約中のプラン種別を返す（"monthly" / "yearly" / "lifetime" / null）。
// nullは「広告視聴による時限解除」または「無料版」のいずれか
// （両者ともプラン購入ではないので区別しない。isUnlocked()と組み合わせて使う）。
function swGetPlanType() {
  try {
    const raw = localStorage.getItem(SW_PLAN_TYPE_STORAGE_KEY);
    if (raw === "monthly" || raw === "yearly" || raw === "lifetime") return raw;
    return null;
  } catch (e) {
    return null;
  }
}

function swSetPlanType(planType) {
  try {
    if (planType === "monthly" || planType === "yearly" || planType === "lifetime") {
      localStorage.setItem(SW_PLAN_TYPE_STORAGE_KEY, planType);
    } else {
      localStorage.removeItem(SW_PLAN_TYPE_STORAGE_KEY);
    }
  } catch (e) {}
}

function swGetLocalUpdatedAt() {
  try {
    const raw = localStorage.getItem(SW_UNLOCK_UPDATED_AT_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

// value: 新しい解除状態。updatedAtMsを省略した場合は「今、この端末で操作した」
// ものとして現在時刻を記録する。Firestoreからのマージ結果を書き戻す時だけ、
// 呼び出し側からリモート側のupdatedAtMsをそのまま渡す（時刻の二重更新を防ぐため）。
// この関数はローカル操作（広告視聴による時限解除・デバッグパネルでの
// 無料版リセット）専用。決済によるプラン確定はCloud Functions(stripeWebhook)が
// 直接Firestoreに書き込むため、この関数を経由しない。そのため、ここでは
// 常にplanTypeを購入によるものではない状態（null）にリセットする。
function swSetUnlockUntil(value, updatedAtMs) {
  const ts = typeof updatedAtMs === "number" ? updatedAtMs : Date.now();
  try {
    localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(value));
    localStorage.setItem(SW_UNLOCK_UPDATED_AT_KEY, String(ts));
  } catch (e) {}
  swSetPlanType(null);

  // ログイン中はFirestoreにも書き込み、他の端末/ブラウザからも同じ解除状態が
  // 見えるようにする（未ログインの場合はlocalStorageのみのフォールバック動作）。
  if (window.QN_AUTH && window.QN_AUTH.currentUser && typeof window.QN_AUTH.saveUnlockUntilToFirestore === "function") {
    window.QN_AUTH.saveUnlockUntilToFirestore(window.QN_AUTH.currentUser.uid, value, null);
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
  const current = swGetUnlockUntil();
  // 永久ライセンス(-1)は広告視聴では絶対に上書きしない。
  // 以前は「current !== -1 && current > until」という条件だったため、
  // 永久ライセンス保有者が広告視聴ボタンを押すと-1が24時間後の数値に
  // 書き換えられてしまう実害のあるバグがあった。
  if (current === -1) return;
  // 既に時限解除中で残り時間がそれより長い場合は短縮しない（延長のみ）。
  if (current > until) return;
  swSetUnlockUntil(until);
}

// ============================================================
// FirestoreとlocalStorageの解除状態マージ（ログイン成功直後にplayer-auth.js
// から呼ばれる）。
//
// 優先ルール：
//   1. Firestore側にpurchasedAtMs（Stripe決済確定時のサーバー側タイムスタンプ）
//      があり、それが直近5分以内なら、時刻比較を待たず必ずFirestore側を採用する。
//      これが無いと、決済直後にこの同期処理が走った際、たまたまローカルの
//      updatedAtの方が新しく判定されてしまい、決済結果が古いlocalStorageの
//      値で上書きされてしまう事故が起きうるため（実際に発生した不具合）。
//   2. それ以外はLast-Write-Wins（どちらの操作が時刻的に新しいか）で決める。
//      以前は「値が大きい方（＝残り時間が長い方）」を優先していたが、これだと
//      「無料版に戻す」という明示的な操作が、他端末の古い時限解除の値に
//      上書きされてしまう不具合があったため、updatedAtのタイムスタンプ比較に
//      変更した。
//   Firestore未登録（このアカウントで初めての同期）の場合は、
//   ローカル側をそのままFirestoreに書き込む。
// ============================================================
const SW_PURCHASE_PRIORITY_WINDOW_MS = 5 * 60 * 1000; // 決済確定から5分以内は無条件で優先

async function swSyncUnlockWithFirestore(uid) {
  if (!window.QN_AUTH || typeof window.QN_AUTH.fetchUnlockUntilFromFirestore !== "function") return;

  const remote = await window.QN_AUTH.fetchUnlockUntilFromFirestore(uid);
  const localUntil = swGetUnlockUntil();
  const localUpdatedAt = swGetLocalUpdatedAt();

  if (!remote) {
    // Firestore未登録：ローカルの状態をそのまま書き込んで初期化する。
    if (window.QN_AUTH.saveUnlockUntilToFirestore) {
      window.QN_AUTH.saveUnlockUntilToFirestore(uid, localUntil, swGetPlanType());
    }
    swRefreshAllLockedUI();
    return;
  }

  // ルール1：直近の決済確定（purchasedAtMs）があれば無条件でFirestoreを採用。
  const isRecentPurchase = remote.purchasedAtMs > 0 &&
    (Date.now() - remote.purchasedAtMs) < SW_PURCHASE_PRIORITY_WINDOW_MS;

  if (isRecentPurchase) {
    try {
      localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(remote.unlockUntil));
      localStorage.setItem(SW_UNLOCK_UPDATED_AT_KEY, String(remote.updatedAtMs));
    } catch (e) {}
    swSetPlanType(remote.planType);
    swRefreshAllLockedUI();
    return;
  }

  // ルール2：リモートの方が新しければリモートを採用してローカルに反映。
  // ローカルの方が新しい、または同時刻なら何もしない（ローカルを正とする）。
  if (remote.updatedAtMs > localUpdatedAt) {
    try {
      localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(remote.unlockUntil));
      localStorage.setItem(SW_UNLOCK_UPDATED_AT_KEY, String(remote.updatedAtMs));
    } catch (e) {}
    swSetPlanType(remote.planType);
  } else if (localUpdatedAt > remote.updatedAtMs) {
    // ローカルの方が新しい場合、Firestore側が古いまま残らないよう書き戻す。
    if (window.QN_AUTH.saveUnlockUntilToFirestore) {
      window.QN_AUTH.saveUnlockUntilToFirestore(uid, localUntil, swGetPlanType());
    }
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

// 決済ボタン共通処理：未ログインの場合はまずGoogleログインを促し、
// ログインが成功したら自動でStripe決済ページへ遷移する。
// 「誰が決済したか」をアプリ側（Firestore）で紐付けるため、決済前の
// ログインを必須にする（決済自体はログイン無しでも開始できてしまうが、
// その場合はどのユーザーの解除状態にも反映できないため）。
// 遷移時は、決済完了後にStripe Webhook側でどのユーザーかを特定できるよう、
// UIDをclient_reference_idとしてURLに付加する。
function swGoToCheckout(stripeUrl) {
  hapticTap();

  // window.QN_AUTH.currentUser.uid が正しいUIDの参照先（このファイル内に
  // 素の"auth"変数は存在しないので、直接auth.currentUserは参照できない）。
  function urlWithUid(uid) {
    return `${stripeUrl}?client_reference_id=${encodeURIComponent(uid)}`;
  }

  if (window.QN_AUTH && window.QN_AUTH.currentUser) {
    window.location.href = urlWithUid(window.QN_AUTH.currentUser.uid);
    return;
  }

  if (!window.QN_AUTH || typeof window.QN_AUTH.login !== "function") {
    // player-auth.js未読み込み等、想定外の状態。念のためログインなしでは進めない。
    alert("ログイン機能の準備中です。しばらくしてから再度お試しください。");
    return;
  }

  // ログイン完了（qn-auth-changed）を1回だけ待ってから決済ページへ進む。
  // ユーザーがログインをキャンセルした場合はイベントが発火せず、
  // このモーダルの上に立ったままになる（再度ボタンを押せば再試行できる）。
  const onAuthChanged = (e) => {
    if (e.detail && e.detail.user) {
      window.removeEventListener("qn-auth-changed", onAuthChanged);
      window.location.href = urlWithUid(e.detail.user.uid);
    }
  };
  window.addEventListener("qn-auth-changed", onAuthChanged);
  window.QN_AUTH.login();
}


function swBuildModal() {
  if (swModalOverlay) return swModalOverlay;

  const overlay = document.createElement("div");
  overlay.id = "swUnlockModalOverlay";
  overlay.className = "sw-unlock-modal-overlay";

  overlay.innerHTML = `
    <div class="sw-unlock-modal">
      <div class="sw-unlock-modal-header">
        <span id="swUnlockModalTitle">アップグレードしてQNPLAYERの全機能を解放</span>
        <button id="swUnlockModalCloseBtn" class="sw-unlock-modal-close" title="Close">✕</button>
      </div>
      <div class="sw-unlock-modal-body">
        <p id="swUnlockModalDesc" class="sw-unlock-modal-desc"></p>
        <div class="sw-pricing-cards">
          <div class="sw-pricing-card" id="swUnlockAd1h">
            <div class="sw-pricing-card-top">
              <div class="sw-pricing-card-title"><span class="sw-pricing-card-title-en">TimePass</span><span class="sw-pricing-card-title-en">1Hour</span><span class="sw-pricing-card-title-jp">広告解除1時間</span></div>
              <div class="sw-pricing-card-desc">動画広告を1本視聴して、1曲集中耳コピや短時間の練習に。</div>
              <div class="sw-pricing-card-price">無料<span class="sw-pricing-card-price-unit">動画広告 1本視聴</span></div>
            </div>
            <div class="sw-pricing-card-cta sw-pricing-cta-secondary">1時間解放</div>
            <ul class="sw-pricing-feature-list">
              <li><span class="sw-pricing-check">✓</span>1時間 全機能が無制限で解放</li>
              <li><span class="sw-pricing-check">✓</span>ライブラリ保存数 無制限</li>
              <li><span class="sw-pricing-check">✓</span>マーカー・ループ自動停止なし</li>
            </ul>
          </div>
          <div class="sw-pricing-card" id="swUnlockAd24h">
            <div class="sw-pricing-card-top">
              <div class="sw-pricing-card-title"><span class="sw-pricing-card-title-en">TimePass</span><span class="sw-pricing-card-title-en">1Day</span><span class="sw-pricing-card-title-jp">広告解除1日</span></div>
              <div class="sw-pricing-card-desc">広告を数本まとめて視聴して、週末の長時間練習やセッションに。</div>
              <div class="sw-pricing-card-price">無料<span class="sw-pricing-card-price-unit">動画広告 2〜3本視聴</span></div>
            </div>
            <div class="sw-pricing-card-cta sw-pricing-cta-secondary">24時間解放</div>
            <ul class="sw-pricing-feature-list">
              <li><span class="sw-pricing-check">✓</span>24時間 全機能が無制限で解放</li>
              <li><span class="sw-pricing-check">✓</span>ライブラリ保存数 無制限</li>
              <li><span class="sw-pricing-check">✓</span>マーカー・ループ自動停止なし</li>
            </ul>
          </div>
          <div class="sw-pricing-card" id="swUnlockSubscribe">
            <div class="sw-pricing-jp-badge">🇯🇵 日本限定価格</div>
            <div class="sw-pricing-card-top">
              <div class="sw-pricing-card-title"><span class="sw-pricing-card-title-en">Premium</span><span class="sw-pricing-card-title-en">(Monthly)</span><span class="sw-pricing-card-title-jp">マンスリー</span></div>
              <div class="sw-pricing-card-desc">広告なしで常に快適。手軽に始めたい方に最適な月額プラン。</div>
              <div class="sw-pricing-card-price">
                ¥150<span class="sw-pricing-card-price-unit">/ 月（自動更新）</span>
              </div>
            </div>
            <div class="sw-pricing-card-cta sw-pricing-cta-secondary">月額プランに登録</div>
            <ul class="sw-pricing-feature-list">
              <li><span class="sw-pricing-check">✓</span><b>広告表示・視聴 一切なし</b></li>
              <li><span class="sw-pricing-check">✓</span>常時 すべての制限が無制限</li>
              <li><span class="sw-pricing-check">✓</span>気軽に解約・再開が可能</li>
            </ul>
          </div>
          <div class="sw-pricing-card sw-pricing-card-highlight" id="swUnlockYearly">
            <div class="sw-pricing-badge">おすすめ</div>
            <div class="sw-pricing-jp-badge">🇯🇵 日本限定価格</div>
            <div class="sw-pricing-card-top">
              <div class="sw-pricing-card-title"><span class="sw-pricing-card-title-en">Premium</span><span class="sw-pricing-card-title-en">(Yearly)</span><span class="sw-pricing-card-title-jp">アニュアル</span></div>
              <div class="sw-pricing-card-desc">1年間たっぷり使えてお得な年間プラン。長く練習する方に。</div>
              <div class="sw-pricing-card-price">
                ¥1,500<span class="sw-pricing-card-price-unit">/ 年（自動更新）</span>
              </div>
            </div>
            <div class="sw-pricing-card-cta">年間プランに登録</div>
            <ul class="sw-pricing-feature-list">
              <li><span class="sw-pricing-check">✓</span><b>広告表示・視聴 一切なし</b></li>
              <li><span class="sw-pricing-check">✓</span>常時 すべての制限が無制限</li>
              <li><span class="sw-pricing-check">✓</span>月額よりさらにお得な価格</li>
            </ul>
          </div>
          <div class="sw-pricing-card" id="swUnlockLifetime">
            <div class="sw-pricing-jp-badge">🇯🇵 日本限定価格</div>
            <div class="sw-pricing-card-top">
              <div class="sw-pricing-card-title"><span class="sw-pricing-card-title-en">Premium</span><span class="sw-pricing-card-title-en">(Lifetime)</span><span class="sw-pricing-card-title-jp">永久ライセンス</span></div>
              <div class="sw-pricing-card-desc">一度の支払いでずっと使い放題。サブスクの管理が不要な方に。</div>
              <div class="sw-pricing-card-price">
                ¥2,500<span class="sw-pricing-card-price-unit">買い切り（追加料金なし）</span>
              </div>
            </div>
            <div class="sw-pricing-card-cta sw-pricing-cta-secondary">永久ライセンス購入</div>
            <ul class="sw-pricing-feature-list">
              <li><span class="sw-pricing-check">✓</span><b>広告表示・視聴 一切なし</b></li>
              <li><span class="sw-pricing-check">✓</span>無期限で全機能使い放題</li>
              <li><span class="sw-pricing-check">✓</span>アプデ後の新機能も永続適用</li>
            </ul>
          </div>
        </div>
        <a href="/pricing.html" target="_blank" rel="noopener" class="sw-pricing-compare-link">詳しく比較する →</a>
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

  // 広告視聴（1時間）
  overlay.querySelector("#swUnlockAd1h").onclick = () => {
    hapticSuccess();
    swUnlockForHours(1);
    swCloseUnlockModal();
    swRefreshAllLockedUI();
  };
  // 広告視聴（24時間）
  overlay.querySelector("#swUnlockAd24h").onclick = () => {
    hapticSuccess();
    swUnlockForHours(24);
    swCloseUnlockModal();
    swRefreshAllLockedUI();
  };

  // 共通の決済処理は swGoToCheckout（ファイル先頭側で定義、UID付与込み）を使う。

  // 1ヶ月プラン
  overlay.querySelector("#swUnlockSubscribe").onclick = () => {
    swGoToCheckout("https://buy.stripe.com/test_28E00i7aTab69bkbJf14401");
  };

  // 1年プラン
  overlay.querySelector("#swUnlockYearly").onclick = () => {
    swGoToCheckout("https://buy.stripe.com/test_8x26oG3YH2IE73ccNj14402");
  };

  // 永久ライセンス
  overlay.querySelector("#swUnlockLifetime").onclick = () => {
    swGoToCheckout("https://buy.stripe.com/test_9B64gyeDl1EA4V44gN14403");
  };

  return overlay;
}



function swOpenUnlockModal(message) {
  hapticWarning();
  const overlay = swBuildModal();
  const descEl = overlay.querySelector("#swUnlockModalDesc");
  if (descEl) descEl.textContent = message || "この機能は無料版では利用できません。";

  // プランの階層表示：契約中のプランと同等・下位のカードは隠し、上位の
  // アップグレード先だけを残す（広告視聴・無料版が最下位、以降
  // 月額 < 年額 < 永久ライセンスの順）。
  //   永久ライセンス中: 何も表示しない（もう買うものが無い）
  //   年額中: 永久のみ表示
  //   月額中: 年額・永久を表示
  //   広告時限解除・無料版: 全カード表示
  // 広告カード（1h/24h）は「有料プラン契約中は一切出さない」というご要望
  // により、月額/年額/永久のいずれかを契約中なら常に隠す。
  const planType = typeof swGetPlanType === "function" ? swGetPlanType() : null;
  const cardVisibility = {
    ad1h: planType === null,
    ad24h: planType === null,
    monthly: planType === null,
    yearly: planType === null || planType === "monthly",
    lifetime: planType === null || planType === "monthly" || planType === "yearly"
  };

  const cardElements = {
    ad1h: overlay.querySelector("#swUnlockAd1h"),
    ad24h: overlay.querySelector("#swUnlockAd24h"),
    monthly: overlay.querySelector("#swUnlockSubscribe"),
    yearly: overlay.querySelector("#swUnlockYearly"),
    lifetime: overlay.querySelector("#swUnlockLifetime")
  };
  let visibleCount = 0;
  Object.keys(cardElements).forEach(key => {
    const el = cardElements[key];
    if (!el) return;
    const visible = cardVisibility[key];
    el.style.display = visible ? "" : "none";
    if (visible) visibleCount++;
  });

  // 表示枚数に応じてグリッドの列数を詰める（5列固定のままだと、枚数が
  // 減った分だけ右側に空白が残ってしまうため）。0枚（永久ライセンス中）の
  // 場合は「ご利用中のプランは最上位です」のような案内文に切り替える。
  const cardsEl = overlay.querySelector(".sw-pricing-cards");
  if (cardsEl) {
    if (visibleCount === 0) {
      cardsEl.style.display = "none";
    } else {
      cardsEl.style.display = "";
      cardsEl.style.gridTemplateColumns = visibleCount < 5 ? `repeat(${visibleCount}, 1fr)` : "";
    }
  }
  if (descEl && visibleCount === 0) {
    descEl.textContent = "永久ライセンスをご利用中です。これ以上アップグレードできるプランはありません。";
  }

  overlay.classList.add("active");
}

function swCloseUnlockModal() {
  if (swModalOverlay) swModalOverlay.classList.remove("active");
}

// ============================================================
// UPGRADEボタン（ヘッダー右端）。押すと直接フルモーダルを開く。
// Premium中でも表示したままにしておき（プラン変更・確認用の導線として）、
// 文言だけ状況に応じて変える。
// ============================================================
const swUpgradeBtn = document.getElementById("swUpgradeBtn");
if (swUpgradeBtn) {
  swUpgradeBtn.onclick = () => {
    const message = (typeof isUnlocked === "function" && isUnlocked())
      ? "現在のプランや他のプランはこちらから確認できます。"
      : "無料版の機能制限を解除するプランをお選びください。";
    swOpenUnlockModal(message);
  };
}

// ============================================================
// ミニポップアップ（トースト）
// 「もう分かっていて試しに触ってみた」系の操作（ロック済みの鍵アイコン
// クリック、無効化済みのSpeed/Keyスライダー操作など）向けの軽い通知。
// 画面を止めるフルモーダル(swOpenUnlockModal)とは違い、操作の流れを
// 妨げず、数秒で自動的に消える。
//
// 「実際に何かを実行しようとして制限に初めてぶつかった瞬間」
// （例：3曲目以降の新規追加ブロック、AB間ループ5回到達）は、
// 引き続きフルモーダル(swOpenUnlockModal)を使う。
// ============================================================
let swToastEl = null;
let swToastHideTimer = null;

function swBuildToast() {
  if (swToastEl) return swToastEl;

  const el = document.createElement("div");
  el.id = "swUnlockToast";
  el.className = "sw-unlock-toast";
  el.innerHTML = `
    <span id="swUnlockToastText"></span>
    <a href="#" id="swUnlockToastAdLink" class="sw-unlock-toast-link">広告視聴で1時間機能解放</a>
    <a href="#" id="swUnlockToastUpgradeLink" class="sw-unlock-toast-link">アップグレード</a>
  `;
  document.body.appendChild(el);
  swToastEl = el;

  el.querySelector("#swUnlockToastAdLink").onclick = (e) => {
    e.preventDefault();
    hapticSuccess();
    // ダミー広告視聴（実際の広告SDK連携は後工程。タップ即1時間解除）。
    swUnlockForHours(1);
    swRefreshAllLockedUI();
    swHideToast();
  };
  el.querySelector("#swUnlockToastUpgradeLink").onclick = (e) => {
    e.preventDefault();
    hapticTap();
    swHideToast();
    // アップグレードの選択肢はフルモーダルの方で詳しく提示する
    // （広告1h/24h/サブスクの3択）。
    swOpenUnlockModal();
  };

  return el;
}

function swShowUnlockToast(message) {
  hapticWarning();
  const el = swBuildToast();
  el.querySelector("#swUnlockToastText").textContent = message || "この機能は無料版では利用できません。";
  el.classList.add("active");

  clearTimeout(swToastHideTimer);
  swToastHideTimer = setTimeout(swHideToast, 4000);
}

function swHideToast() {
  clearTimeout(swToastHideTimer);
  if (swToastEl) swToastEl.classList.remove("active");
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

// 残り時間をHH:MM:SS形式に整形する（デバッグパネル専用。本番のモーダル等で
// 使うswGetUnlockRemainingLabelとは別の、検証用の細かい表示のため独立させている）。
function swDebugFormatCountdown(remainMs) {
  const totalSec = Math.max(0, Math.floor(remainMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function swDebugUpdateStatusLabel() {
  const statusEl = document.getElementById("swDebugStatus");
  if (!statusEl) return;
  const until = swGetUnlockUntil();
  if (until === -1) {
    statusEl.textContent = "PR";
  } else if (until > 0 && Date.now() < until) {
    statusEl.textContent = "UNLOCKED " + swDebugFormatCountdown(until - Date.now());
  } else {
    statusEl.textContent = "FR";
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

const swDebugUnlock24hBtn = document.getElementById("swDebugUnlock24hBtn");
if (swDebugUnlock24hBtn) {
  swDebugUnlock24hBtn.onclick = () => {
    swUnlockForHours(24);
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

// HH:MM:SS表示のカウントダウンが秒単位で減っていくのが分かるよう、1秒ごとに更新する。
setInterval(swDebugUpdateStatusLabel, 1000);

swDebugUpdateStatusLabel();
// ============================================================
// 【検証用・一時的】デバッグパネル処理ここまで。
// ============================================================
