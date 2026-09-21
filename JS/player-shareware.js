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
  if (remainHours >= 1) return `${Math.ceil(remainHours)}h left`;
  return `${Math.ceil(remainMs / (1000 * 60))}m left`;
}

// 現在の契約状態を、アンロックモーダルの「現在のプラン」表示欄用に
// 人間が読める文言で返す（無料版・広告時限解除中はnullを返し、
// バッジ自体を非表示にする）。表記は英語（ご要望によりヘッダーラベル
// 部分のみ英語化。プランカード本体の日本語表記はそのまま）。
// 「Current Plan: 」のようなプレフィックスは付けず、値のみ返す
// （ご要望によりタイトル文字は省いている）。
//   永久ライセンス: 「Lifetime」
//   年額/月額: 「Yearly (30 days left)」等
//   広告視聴による時限解除: ご要望により、プラン名は出さず残り時間のみ
//   （「Ad Unlock (2h left)」）
function swGetCurrentPlanLabel() {
  const until = swGetUnlockUntil();
  const planType = typeof swGetPlanType === "function" ? swGetPlanType() : null;

  if (until === -1 && planType === "lifetime") {
    return "Lifetime";
  }
  if (until > 0 && Date.now() < until && (planType === "monthly" || planType === "yearly")) {
    const remainMs = until - Date.now();
    const remainDays = Math.ceil(remainMs / (1000 * 60 * 60 * 24));
    const planLabel = planType === "yearly" ? "Yearly" : "Monthly";
    return `${planLabel} (${remainDays} days left)`;
  }
  // 広告視聴による時限解除中：プラン名は出さず、残り時間だけ表示する。
  if (until > 0 && Date.now() < until && planType === "AD") {
    const remainingLabel = swGetUnlockRemainingLabel();
    return remainingLabel ? `Ad Unlock (${remainingLabel})` : null;
  }
  return "FREE PLAN"; // 無料版：バッジ自体を表示しない。
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

// Firestoreとログイン中のブラウザのローカル状態(unlockUntil)を同期する。
// ============================================================
// 【方針】Firestoreにドキュメントがあれば、常にFirestore側を正として
// ローカルへ反映する（updatedAtの新旧比較はしない）。
//
// 経緯：以前はローカルとFirestoreの更新時刻を比較し、ローカルの方が
// 新しければFirestoreへ書き戻す処理があった。これは元々、未ログイン
// 状態でのデバッグパネル操作（当時はindex.htmlに解除/無料化テスト用の
// ボタン群が存在した）をログイン後にFirestoreへ反映するためのものだった。
// しかしデバッグパネルのHTML自体は既に撤去済みで、この処理が意図通りに
// 使われる場面は本番では起こらない。その一方で、Firestoreのunlock Untilを
// 直接（Firebaseコンソール等から）手動で書き換えた際、その手動編集が
// updatedAtフィールドを伴わないと、ブラウザのlocalStorage側に残っていた
// 古いupdatedAtの方が新しいと誤判定され、手動修正した値がローカルの
// 古い値で上書きされてしまう実害のあるバグを引き起こしていたため撤去した。
// Firestore側を常に信頼する方針にしたことで、更新時刻の比較自体が
// 不要になり、ルール1（決済直後5分間の優先）とルール2（通常時）を
// 統合できるため、あわせて簡略化している。
// ============================================================
// remoteの{unlockUntil}がPremium相当かどうかを判定する（isUnlocked()と
// 同じロジックをFirestoreから取得した値に対して適用するためのヘルパー）。
function swIsRemoteUnlocked(remote) {
  if (!remote) return false;
  const until = remote.unlockUntil;
  if (until === -1) return true;
  if (until > 0 && Date.now() < until) return true;
  return false;
}

// 決済直後、Stripe Webhookがまだ反映されていない可能性がある場合に、
// 数秒おきにFirestoreを再確認する（ポーリング）。
// 呼ばれるのはswSyncUnlockWithFirestore内、「決済ボタンを押した形跡
// （swIsCheckoutPending）があるのに、Firestoreがまだ無料版のまま」
// だった場合のみ。本当のFREEユーザーはこの関数自体を通らないため、
// 待たされることはない。
// 最大5回・2秒おき（合計10秒）試し、それでも反映されなければ諦めて
// 通常表示に戻し、次回のページ読み込み時にまた同じ判定からやり直す。
const SW_POLL_INTERVAL_MS = 2000;
const SW_POLL_MAX_ATTEMPTS = 5;

async function swPollForPurchaseReflection(uid) {
  const noticeEl = swEnsurePurchasePendingNotice();
  if (noticeEl) noticeEl.style.display = "flex";

  for (let attempt = 1; attempt <= SW_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(resolve => setTimeout(resolve, SW_POLL_INTERVAL_MS));

    const remote = await window.QN_AUTH.fetchUnlockUntilFromFirestore(uid);
    if (swIsRemoteUnlocked(remote)) {
      // 反映を確認できた：通常の同期と同じ手順でローカルへ反映する。
      try {
        localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(remote.unlockUntil));
        localStorage.setItem(SW_UNLOCK_UPDATED_AT_KEY, String(remote.updatedAtMs));
      } catch (e) {}
      swSetPlanType(remote.planType);
      swClearCheckoutPending();
      if (noticeEl) noticeEl.style.display = "none";
      swRefreshAllLockedUI();
      return;
    }
  }

  // 既定回数まで試したが反映が確認できなかった：諦めて案内を出す。
  // フラグ自体は消さない（TTL内であれば次回のページ読み込み時にも
  // この判定に入り、もう一度ポーリングを試みる）。
  // 文言について：単純な反映待ちのラグだけでなく、決済失敗やキャンセル
  // でWebhook自体が送られてこないケースもこの分岐に入り得る
  // （Gemini担当確認済み：失敗時は反映待ちと区別が付かない）。そのため
  // 「まだ反映されていないだけ」と断定せず、決済が完了していない
  // 可能性も含めた表現にしている。
  if (noticeEl) {
    noticeEl.textContent = "反映に時間がかかっているか、決済が完了していない可能性があります。ページを再読み込みするか、アカウント状態をご確認ください。";
    noticeEl.classList.add("sw-purchase-pending-notice-delay");
  }
}

// ポーリング中に画面上部へ出す控えめな通知バー（初回のみ生成し、以降は
// 使い回す）。「Premium反映を確認しています…」の間はこれを表示し、
// 反映確認/タイムアウトで文言・表示を切り替える。
function swEnsurePurchasePendingNotice() {
  let el = document.getElementById("swPurchasePendingNotice");
  if (el) return el;
  el = document.createElement("div");
  el.id = "swPurchasePendingNotice";
  el.className = "sw-purchase-pending-notice";
  el.textContent = "決済の反映を確認しています…";
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

async function swSyncUnlockWithFirestore(uid) {
  if (!window.QN_AUTH || typeof window.QN_AUTH.fetchUnlockUntilFromFirestore !== "function") return;

  const remote = await window.QN_AUTH.fetchUnlockUntilFromFirestore(uid);

  if (!remote) {
    // Firestore未登録：通常はここに来る前（ログイン直後の最初の同期）で
    // 既にドキュメントが作成されているはずだが、念のための安全網として、
    // 決済直後フラグが立っている場合はここでもポーリングを試みる
    // （何らかの理由でドキュメント作成が間に合っていない場合の保険）。
    if (swIsCheckoutPending()) {
      swPollForPurchaseReflection(uid);
      return;
    }
    // 【重要】以前はここで「ローカルの状態をそのままFirestoreへ書き込む」
    // 処理をしていたが、削除した。
    // 経緯（Gemini担当の検証で特定）：Firestoreのドキュメント自体を
    // 手動で削除した場合も、この!remote分岐に入る。その際、ブラウザの
    // localStorageに過去のプラン情報（例：昔契約していたyearlyプラン）が
    // 残っていると、それがそのままFirestoreへ書き戻されてしまい、
    // 「Firestore側を消したのに復元される」という実害のあるバグの原因に
    // なっていた。
    // 本当の新規ユーザー初回ログインであれば、この時点でローカルの
    // unlockUntilは初期値(0)のはずなので、ローカルの値を信用せず、
    // 常に無料版として明示的に初期化する方が安全と判断した。
    if (window.QN_AUTH.saveUnlockUntilToFirestore) {
      window.QN_AUTH.saveUnlockUntilToFirestore(uid, 0, null);
    }
    try {
      localStorage.setItem(SW_UNLOCK_STORAGE_KEY, "0");
      localStorage.setItem(SW_UNLOCK_UPDATED_AT_KEY, String(Date.now()));
    } catch (e) {}
    swSetPlanType(null);
    swRefreshAllLockedUI();
    return;
  }

  // Firestoreにデータがあれば、常にそれを正としてローカルへ反映する。
  // ただし「決済ボタンを押した直後（swIsCheckoutPending）」かつ
  // 「Firestoreがまだ無料版のまま」の場合だけは、Stripe Webhookの反映
  // 待ちの可能性があるため、即座に確定せずポーリングで数回粘る。
  if (swIsCheckoutPending() && !swIsRemoteUnlocked(remote)) {
    swPollForPurchaseReflection(uid); // 完了を待たず、バックグラウンドで進める
    return;
  }

  try {
    localStorage.setItem(SW_UNLOCK_STORAGE_KEY, String(remote.unlockUntil));
    localStorage.setItem(SW_UNLOCK_UPDATED_AT_KEY, String(remote.updatedAtMs));
  } catch (e) {}
  swSetPlanType(remote.planType);
  swClearCheckoutPending(); // Premium状態を確認できたので、フラグは不要
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
// ============================================================
// 「決済直後かもしれない」フラグ（sw_checkout_pending_at）
// 決済ボタンを押した時刻を記録しておき、次にFirestoreと同期する時
// （ページロード/リロード時）、このフラグが有効期限内なら「決済直後の
// 可能性がある」と判断してポーリング（swPollForPurchaseReflection、
// 後述）を行う。本当のFREEユーザーが毎回待たされないよう、決済ボタンを
// 押した人だけに限定するための仕組み。
// 有効期限（10分）を過ぎたフラグは無視する＝決済せずタブを閉じた・
// キャンセルした等でフラグが残り続けても、永久にポーリングし続ける
// ことはない。
// ============================================================
const SW_CHECKOUT_PENDING_KEY = "qnplayer_checkout_pending_at";
const SW_CHECKOUT_PENDING_TTL_MS = 10 * 60 * 1000; // 10分

function swMarkCheckoutPending() {
  try { localStorage.setItem(SW_CHECKOUT_PENDING_KEY, String(Date.now())); } catch (e) {}
}

function swClearCheckoutPending() {
  try { localStorage.removeItem(SW_CHECKOUT_PENDING_KEY); } catch (e) {}
}

// 有効なフラグが立っているか（決済ボタンを押してから10分以内か）を返す。
// 副作用として、期限切れのフラグは自動で削除する。
function swIsCheckoutPending() {
  let raw = null;
  try { raw = localStorage.getItem(SW_CHECKOUT_PENDING_KEY); } catch (e) {}
  if (!raw) return false;
  const ts = parseInt(raw, 10);
  if (!Number.isFinite(ts) || Date.now() - ts > SW_CHECKOUT_PENDING_TTL_MS) {
    swClearCheckoutPending();
    return false;
  }
  return true;
}

// ============================================================
// 「?checkout=success」URLパラメータの検知。
// Stripe Payment Link側で、決済完了後のリダイレクト先を
// https://qnaudio-8b46e.web.app?checkout=success に設定済み（Gemini担当
// バックエンド対応、2026年9月確認）。このパラメータが付いていれば、
// localStorageのフラグ（swIsCheckoutPending、10分TTL）よりも確実に
// 「今まさに決済から戻ってきた」と判断できる。
// ページ読み込み時に一度だけ呼び、パラメータを検知したら
// swMarkCheckoutPending()と同じ状態にし（フラグが無い/切れていても
// 決済直後の判定に乗せる）、URLからパラメータを取り除く
// （history.replaceStateでリロードのたびに再検知しないようにする）。
// ============================================================
function swCheckUrlForCheckoutSuccess() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "success") return;

    swMarkCheckoutPending();

    url.searchParams.delete("checkout");
    const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState(null, "", cleaned || window.location.pathname);
  } catch (e) {}
}
swCheckUrlForCheckoutSuccess();

// 遷移時は、決済完了後にStripe Webhook側でどのユーザーかを特定できるよう、
// UIDをclient_reference_idとしてURLに付加する。
// Stripeの決済ページは新規タブで開く（window.open、_blank）。これにより
// 決済後にタブを閉じるだけでQNPLAYER側の画面がそのまま残り、決済前の
// 再生状態等が失われない。
function swGoToCheckout(stripeUrl) {
  hapticTap();

  // window.QN_AUTH.currentUser.uid が正しいUIDの参照先（このファイル内に
  // 素の"auth"変数は存在しないので、直接auth.currentUserは参照できない）。
  function urlWithUid(uid) {
    return `${stripeUrl}?client_reference_id=${encodeURIComponent(uid)}`;
  }

  if (window.QN_AUTH && window.QN_AUTH.currentUser) {
    swMarkCheckoutPending();
    window.open(urlWithUid(window.QN_AUTH.currentUser.uid), "_blank", "noopener");
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
  // 注意：ログイン完了はボタンクリックから時間差があるため、この
  // window.openはブラウザにポップアップブロックされる可能性がある
  // （ユーザー操作の直接の結果と見なされないため）。ブロックされた場合、
  // window.openはnullを返すので、その場合は今のタブで開くフォールバックにする。
  const onAuthChanged = (e) => {
    if (e.detail && e.detail.user) {
      window.removeEventListener("qn-auth-changed", onAuthChanged);
      swMarkCheckoutPending();
      const url = urlWithUid(e.detail.user.uid);
      const newTab = window.open(url, "_blank", "noopener");
      if (!newTab) {
        window.location.href = url;
      }
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
        <div id="swUnlockCurrentPlanBadge" class="sw-current-plan-badge"></div>
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

  // 現在のプラン表示バッジ：無料版・購入導線しかない状態ではバッジ自体を隠す。
  const planBadgeEl = overlay.querySelector("#swUnlockCurrentPlanBadge");
  if (planBadgeEl) {
    const label = typeof swGetCurrentPlanLabel === "function" ? swGetCurrentPlanLabel() : null;
    if (label) {
      planBadgeEl.textContent = label;
      planBadgeEl.style.display = "";
    } else {
      planBadgeEl.textContent = "";
      planBadgeEl.style.display = "none";
    }
  }

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
  // 枚数が少ない時（1〜2枚）は、列数を詰めるだけだと1カードあたりの幅が
  // 間延びして見えるため、1カードの目安幅(260px)を基準にグリッド全体の
  // max-widthも制限し、中央寄せにする。
  const SW_CARD_TARGET_WIDTH = 260;
  const cardsEl = overlay.querySelector(".sw-pricing-cards");
  if (cardsEl) {
    if (visibleCount === 0) {
      cardsEl.style.display = "none";
    } else {
      cardsEl.style.display = "";
      cardsEl.style.gridTemplateColumns = visibleCount < 5 ? `repeat(${visibleCount}, 1fr)` : "";
      if (visibleCount <= 3) {
        cardsEl.style.maxWidth = `${SW_CARD_TARGET_WIDTH * visibleCount + 12 * (visibleCount - 1)}px`;
        cardsEl.style.marginLeft = "auto";
        cardsEl.style.marginRight = "auto";
      } else {
        cardsEl.style.maxWidth = "";
        cardsEl.style.marginLeft = "";
        cardsEl.style.marginRight = "";
      }
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
// ヘッダー常設の現在プラン表示（アカウント画像の左、#userPlanBadge）。
// モーダル内のバッジ(swGetCurrentPlanLabel)より短い表記にする
// （ヘッダーは常時表示なので、日数入りの長い文言だと窮屈になるため）。
//   永久ライセンス: 「Lifetime」
//   年額/月額: 「Yearly」「Monthly」（残り日数はこのバッジ自体には出さない。
//     詳細はアカウントメニュー内のドロップダウン(#userPlanRemaining、
//     swUpdatePlanRemainingUI側)を開けば見える）
//   広告視聴による時限解除: 「Ad」（同上、残り時間はドロップダウン側で見える）
//   無料版: バッジ自体を空にして隠す
// ============================================================
function swGetHeaderPlanBadgeLabel() {
  const until = swGetUnlockUntil();
  const planType = typeof swGetPlanType === "function" ? swGetPlanType() : null;

  if (until === -1 && planType === "lifetime") return "Lifetime";
  if (until > 0 && Date.now() < until) {
    if (planType === "yearly") return "Yearly";
    if (planType === "monthly") return "Monthly";
    return "Ad"; // 広告視聴による時限解除中。
  }
  return "FREE"; // 無料版のときに「FREE」と表示する
}

function swUpdateHeaderPlanBadge() {
  const el = document.getElementById("userPlanBadge");
  if (!el) return;
  const label = swGetHeaderPlanBadgeLabel();
  el.textContent = label || "";
}
swRegisterRefreshCallback(swUpdateHeaderPlanBadge);
swUpdateHeaderPlanBadge();

// ============================================================
// ドロップダウン内「残り時間」表示。
// 1分ごとに再計算する（秒は表示しないため1分間隔で十分。setInterval）。
// 対象と表示形式:
//   monthly/yearly（自動更新のサブスク）: 「dd日 hh:mm」形式
//   Ad（広告視聴による時限解除）: 数十分〜数時間単位のため、日付部分を
//     省いた「HH時間MM分」形式（swFormatRemainingHhMm）
//   Lifetime: 有効期限が無いため対象外。
//   FREE: 期限自体が無いため対象外。
// ============================================================
function swFormatRemainingDdHhMm(remainMs) {
  const totalMin = Math.max(0, Math.floor(remainMs / (1000 * 60)));
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${days}日 ${pad(hours)}:${pad(minutes)}`;
}

// Ad（広告視聴による時限解除）専用の残り時間フォーマッタ。
// 数十分〜数時間単位のため、monthly/yearly用の「dd日hh:mm」だと
// 常に「0日」が付いて不格好になる。日付部分を省いた「HH時間MM分」形式にする。
function swFormatRemainingHhMm(remainMs) {
  const totalMin = Math.max(0, Math.floor(remainMs / (1000 * 60)));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${hours}時間${String(minutes).padStart(2, "0")}分`;
}

function swUpdatePlanRemainingUI() {
  const rowEl = document.getElementById("userPlanRemainingRow");
  const valEl = document.getElementById("userPlanRemaining");
  const cancelBtn = document.getElementById("btnCancelSubscription");
  if (!rowEl || !valEl) return;

  const until = swGetUnlockUntil();
  const planType = typeof swGetPlanType === "function" ? swGetPlanType() : null;
  const isSubscription = (planType === "monthly" || planType === "yearly") && until > 0 && Date.now() < until;
  // Ad（広告視聴による時限解除）：planTypeがnullで、かつunlockUntilが
  // 「今より先」かつ「永久(-1)ではない」場合がこれにあたる
  // （swGetHeaderPlanBadgeLabelの判定条件と揃えている）。
  const isAdUnlock = planType !== "monthly" && planType !== "yearly" && planType !== "lifetime" &&
    until > 0 && Date.now() < until;

  if (isSubscription) {
    valEl.textContent = swFormatRemainingDdHhMm(until - Date.now());
    rowEl.style.display = "";
  } else if (isAdUnlock) {
    valEl.textContent = swFormatRemainingHhMm(until - Date.now());
    rowEl.style.display = "";
  } else {
    valEl.textContent = "";
    rowEl.style.display = "none";
  }

  // 解約ボタンもmonthly/yearly契約中のみ表示（Lifetime/Ad/FREEでは出さない）。
  if (cancelBtn) cancelBtn.style.display = isSubscription ? "" : "none";
}
swRegisterRefreshCallback(swUpdatePlanRemainingUI);
swUpdatePlanRemainingUI();
// 1分ごとに再計算（秒表示が無いため60秒間隔で十分）。
setInterval(swUpdatePlanRemainingUI, 60 * 1000);

// ============================================================
// 解約確認モーダル（#cancelModalOverlay）
// 解約ボタン押下時、いきなりStripe Customer Portalへ飛ばす前に、
// プラン名・残り期間・次回自動更新日・解約後も使える最終日を
// 確認してもらう。「解約手続きへ進む」を押して初めて
// swGoToCustomerPortal()（実際のAPI呼び出し）を実行する。
// ============================================================

// 年月日形式（例: "2026年10月21日"）のフォーマッタ。
// カウントダウン表示(swFormatRemainingDdHhMm)とは別に、次回自動更新日・
// 解約後の利用可能最終日のような「絶対日付」を示す箇所で使う。
function swFormatDateYMD(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function swOpenCancelModal() {
  const overlay = document.getElementById("cancelModalOverlay");
  if (!overlay) return;

  const until = swGetUnlockUntil();
  const planType = typeof swGetPlanType === "function" ? swGetPlanType() : null;
  const isSubscription = (planType === "monthly" || planType === "yearly") && until > 0 && Date.now() < until;

  if (!isSubscription) {
    // 通常はボタン自体がmonthly/yearly時しか表示されないため到達しない
    // はずだが、念のための防御。
    alert("現在、解約可能なサブスクリプションはありません。");
    return;
  }

  const planLabel = planType === "yearly" ? "Yearly" : "Monthly";
  const dateLabel = swFormatDateYMD(until);

  const planEl = document.getElementById("cancelModalPlan");
  const remainingEl = document.getElementById("cancelModalRemaining");
  const nextRenewalEl = document.getElementById("cancelModalNextRenewal");
  const untilDateEl = document.getElementById("cancelModalUntilDate");
  if (planEl) planEl.textContent = planLabel;
  if (remainingEl) remainingEl.textContent = swFormatRemainingDdHhMm(until - Date.now());
  if (nextRenewalEl) nextRenewalEl.textContent = dateLabel;
  if (untilDateEl) untilDateEl.textContent = dateLabel;

  overlay.classList.add("open");
}

function swCloseCancelModal() {
  const overlay = document.getElementById("cancelModalOverlay");
  if (overlay) overlay.classList.remove("open");
}

// ============================================================
// 解約ボタン（#btnCancelSubscription）
// Stripe Customer Portal（顧客自身がサブスクを解約・支払い方法変更できる
// Stripe提供の画面）へ遷移させる。
//
// Customer PortalのURLは「今ログイン中のユーザー用に毎回サーバー側で
// 発行してもらう」必要がある（Stripeの仕様上、固定リンクにはできない）。
// そのため、Cloud Functions側の createPortalSession エンドポイントに
// UIDを渡してURLを発行してもらい、そのURLへ遷移する。
// エンドポイントURL: Gemini担当によりバックエンド実装完了、
// https://us-central1-qnaudio-8b46e.cloudfunctions.net/createPortalSession
//
// 呼び出し元: #cancelModalConfirmBtn（解約確認モーダルの「解約手続きへ
// 進む」ボタン）。#btnCancelSubscription自体は、まずswOpenCancelModal()
// でモーダルを開くだけのトリガーに変わっている。
// ============================================================
const SW_CREATE_PORTAL_SESSION_URL = "https://us-central1-qnaudio-8b46e.cloudfunctions.net/createPortalSession";

async function swGoToCustomerPortal() {
  hapticTap();

  if (!window.QN_AUTH || !window.QN_AUTH.currentUser) {
    alert("ログインしてから解約手続きを行ってください。");
    return;
  }

  const btn = document.getElementById("cancelModalConfirmBtn");
  const originalLabel = btn ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "処理中…";
  }

  try {
    const res = await fetch(SW_CREATE_PORTAL_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: window.QN_AUTH.currentUser.uid })
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();
    if (!data || !data.url) {
      throw new Error("レスポンスにurlが含まれていません");
    }

    // 新規タブで開く。window.openはユーザー操作（クリック）に対する
    // 同期的な応答の中でないとポップアップブロックされることがあるが、
    // このawait fetch自体は「解約手続きへ進む」ボタンのクリックハンドラの
    // 流れの中で完結しており、通常のブラウザではブロックされない想定。
    window.open(data.url, "_blank", "noopener");
    swCloseCancelModal();
  } catch (err) {
    console.error("Customer Portalセッションの作成に失敗しました:", err);
    alert("解約手続きページを開けませんでした。しばらくしてから再度お試しください。");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
}

const swCancelSubscriptionBtn = document.getElementById("btnCancelSubscription");
if (swCancelSubscriptionBtn) {
  swCancelSubscriptionBtn.onclick = swOpenCancelModal;
}

const cancelModalConfirmBtn = document.getElementById("cancelModalConfirmBtn");
if (cancelModalConfirmBtn) {
  cancelModalConfirmBtn.onclick = swGoToCustomerPortal;
}

const cancelModalCancelBtn = document.getElementById("cancelModalCancelBtn");
if (cancelModalCancelBtn) {
  cancelModalCancelBtn.onclick = () => { hapticTap(); swCloseCancelModal(); };
}

const cancelModalCloseBtn = document.getElementById("cancelModalCloseBtn");
if (cancelModalCloseBtn) {
  cancelModalCloseBtn.onclick = () => { hapticTap(); swCloseCancelModal(); };
}

const cancelModalOverlay = document.getElementById("cancelModalOverlay");
if (cancelModalOverlay) {
  cancelModalOverlay.onclick = (e) => {
    if (e.target === cancelModalOverlay) swCloseCancelModal();
  };
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const overlay = document.getElementById("cancelModalOverlay");
    if (overlay && overlay.classList.contains("open")) swCloseCancelModal();
  }
});

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
  // 時限解除中かつ有効期限内の場合のみカウントダウンを表示
  if (until > 0 && Date.now() < until) {
    statusEl.textContent = swDebugFormatCountdown(until - Date.now());
  } else {
    // 永久解除(until === -1) や 無料版(until === 0) などの場合は非表示（空文字）
    statusEl.textContent = "";
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
