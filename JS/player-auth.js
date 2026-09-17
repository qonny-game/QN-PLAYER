// ============================================================
// player-auth.js
// Firebase Authentication（Googleログイン）連携。
// firebaseConfigはプロジェクト qnaudio-8b46e の実際の値。
//
// ES modules方式のため、index.html側では
//   <script type="module" src="JS/player-auth.js"></script>
// として読み込むこと（通常の<script>ではimportが使えないため）。
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- firebaseConfig ---
const firebaseConfig = {
  apiKey: "AIzaSyDk7vNEqLxM2DDLacZID8U0ohZfrOnRaWI",
  authDomain: "qnaudio-8b46e.firebaseapp.com",
  projectId: "qnaudio-8b46e",
  storageBucket: "qnaudio-8b46e.appspot.com",
  messagingSenderId: "107377155809",
  appId: "1:107377155809:web:7a0326f08dce73e92d21a0"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(firebaseApp);

// --- Firestore: 購入/解除フラグ(unlockUntil)の読み書き ---
// コレクション: users/{uid}  フィールド: unlockUntil (number), updatedAt (serverTimestamp)
// unlockUntilの意味はplayer-shareware.js側のlocalStorageキーと同じ
// （-1=Premium永久解除、それ以外=epoch msまでの時限解除、0/未設定=無料版）。
// マージ時に「どちらの操作が新しいか」を判定するため、updatedAtも一緒に返す
// （epoch msに変換。ドキュメント未作成、またはサーバー側の反映待ちでnullの場合は0扱い）。
// purchasedAtMsは、Cloud Functions(stripeWebhook)がStripe決済確定時に書き込んだ
// タイムスタンプ。存在する場合、player-shareware.js側でローカルとの新旧比較より
// 優先して採用するために使う（決済結果が古いlocalStorageの値で上書きされる事故防止）。
// planTypeは、Cloud Functionsが決済のPrice IDから判定した契約プランの種類
// （"monthly" / "yearly" / "lifetime"）。広告視聴による時限解除の場合はnull。
// player-shareware.js側で「今契約中のプランと同等・下位のボタンを隠す」
// 階層表示に使う。
async function fetchUnlockUntilFromFirestore(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && typeof snap.data().unlockUntil === "number") {
      const data = snap.data();
      const updatedAtMs = data.updatedAt && typeof data.updatedAt.toMillis === "function" ? data.updatedAt.toMillis() : 0;
      const purchasedAtMs = data.purchasedAt && typeof data.purchasedAt.toMillis === "function" ? data.purchasedAt.toMillis() : 0;
      const planType = typeof data.planType === "string" ? data.planType : null;
      return { unlockUntil: data.unlockUntil, updatedAtMs, purchasedAtMs, planType };
    }
    return null;
  } catch (err) {
    console.error("[QN_AUTH] Firestore read failed:", err);
    return null;
  }
}

// planTypeを省略した場合はフィールドを変更しない（mergeなので既存値を維持）。
// 明示的にnullを渡した場合は「購入によるプランではなくなった」として
// フィールド自体を削除する（広告視聴による解除・無料版への切り戻し時に使う）。
async function saveUnlockUntilToFirestore(uid, unlockUntil, planType) {
  try {
    const payload = {
      unlockUntil,
      updatedAt: serverTimestamp()
    };
    if (planType === null) {
      payload.planType = deleteField();
    } else if (typeof planType === "string") {
      payload.planType = planType;
    }
    await setDoc(doc(db, "users", uid), payload, { merge: true });
  } catch (err) {
    console.error("[QN_AUTH] Firestore write failed:", err);
  }
}

// 他のJSファイル（player-core.js等）から現在のユーザー情報を
// 参照できるよう、window.QN_AUTHとして公開しておく。
// currentUserはonAuthStateChangedが発火するまではnullのまま。
window.QN_AUTH = {
  auth,
  currentUser: null,
  fetchUnlockUntilFromFirestore,
  saveUnlockUntilToFirestore
};// --- DOM要素 ---
const btnLoginGoogle = document.getElementById("btnLoginGoogle");
const btnLogout = document.getElementById("btnLogout");
const userInfoEl = document.getElementById("userInfo");
const userPhotoEl = document.getElementById("userPhoto");
const userNameEl = document.getElementById("userName");

// --- ログイン処理 ---
async function handleLogin() {
  try {
    await signInWithPopup(auth, googleProvider);
    // 成功時のUI更新はonAuthStateChangedに任せる
  } catch (err) {
    // ポップアップを閉じただけ等のキャンセル系エラーはコンソールに出すだけに留める
    console.error("[QN_AUTH] Sign-in failed:", err);
  }
}

// --- ログアウト処理 ---
async function handleLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("[QN_AUTH] Sign-out failed:", err);
  }
}

if (btnLoginGoogle) btnLoginGoogle.addEventListener("click", handleLogin);
if (btnLogout) btnLogout.addEventListener("click", handleLogout);

// 決済ボタン等、他のJSファイルから「ログインを促してから進める」フローで
// 使うため、handleLoginをwindow.QN_AUTH経由でも呼べるようにする。
window.QN_AUTH.login = handleLogin;

// --- ログイン状態監視・UI自動切り替え ---
onAuthStateChanged(auth, async (user) => {
  window.QN_AUTH.currentUser = user;

  if (user) {
    // ログイン時：ユーザー情報を表示
    if (userPhotoEl) userPhotoEl.src = user.photoURL || "";
    if (userNameEl) userNameEl.textContent = user.displayName || user.email || "";
    if (btnLoginGoogle) btnLoginGoogle.style.display = "none";
    if (userInfoEl) userInfoEl.style.display = "flex";

    // Firestoreに保存されている解除状態と、このブラウザのlocalStorageの解除状態を
    // マージする（詳細な優先ルールはplayer-shareware.js側のswSyncUnlockWithFirestoreが持つ）。
    // player-shareware.jsはこのファイルより先に読み込まれている前提。
    if (typeof window.swSyncUnlockWithFirestore === "function") {
      await window.swSyncUnlockWithFirestore(user.uid);
    }

    // 他モジュール（購入フラグ判定等）へ通知したい場合はここでカスタムイベントを発火できる。
    // 例: window.dispatchEvent(new CustomEvent("qn-auth-changed", { detail: { user } }));
    window.dispatchEvent(new CustomEvent("qn-auth-changed", {
      detail: { user: { uid: user.uid, email: user.email, displayName: user.displayName } }
    }));
  } else {
    // 未ログイン時
    if (btnLoginGoogle) btnLoginGoogle.style.display = "flex";
    if (userInfoEl) userInfoEl.style.display = "none";

    window.dispatchEvent(new CustomEvent("qn-auth-changed", { detail: { user: null } }));
  }
});
