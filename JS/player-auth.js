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

// 他のJSファイル（player-core.js等）から現在のユーザー情報を
// 参照できるよう、window.QN_AUTHとして公開しておく。
// currentUserはonAuthStateChangedが発火するまではnullのまま。
window.QN_AUTH = {
  auth,
  currentUser: null
};

// --- DOM要素 ---
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

// --- ログイン状態監視・UI自動切り替え ---
onAuthStateChanged(auth, (user) => {
  window.QN_AUTH.currentUser = user;

  if (user) {
    // ログイン時：ユーザー情報を表示
    if (userPhotoEl) userPhotoEl.src = user.photoURL || "";
    if (userNameEl) userNameEl.textContent = user.displayName || user.email || "";
    if (btnLoginGoogle) btnLoginGoogle.style.display = "none";
    if (userInfoEl) userInfoEl.style.display = "flex";

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
