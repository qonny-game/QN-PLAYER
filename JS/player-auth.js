// player-auth.js — Firebase Auth(Googleログイン)。ES module: <script type="module">で読み込む(importを使うため)

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

// ---------- firebaseConfig ----------
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
// 毎回アカウント選択画面を出す(自動再ログイン防止)
googleProvider.setCustomParameters({ prompt: "select_account" });
const db = getFirestore(firebaseApp);

// users/{uid}: unlockUntil(-1=永久,epoch ms=時限,0=無料), updatedAt, purchasedAtMs(Stripe確定時刻。ローカルより優先), planType(monthly|yearly|lifetime|null), cancelAtPeriodEnd
// 戻り値: null=doc無し / {corrupted:true}=unlockUntilがNaN等(無料版へ自動初期化するな。過去に解約直後FREE化事故) / 正常データ
async function fetchUnlockUntilFromFirestore(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;

    const data = snap.data();
    // typeof NaN==='number'なのでNumber.isFinite必須
    if (!Number.isFinite(data.unlockUntil)) {
      console.error("[QN_AUTH] Firestoreのunlock Untilが不正な値です（NaN等）。値:", data.unlockUntil);
      return { corrupted: true };
    }

    const updatedAtMs = data.updatedAt && typeof data.updatedAt.toMillis === "function" ? data.updatedAt.toMillis() : 0;
    const purchasedAtMs = data.purchasedAt && typeof data.purchasedAt.toMillis === "function" ? data.purchasedAt.toMillis() : 0;
    const planType = typeof data.planType === "string" ? data.planType : null;
    const cancelAtPeriodEnd = data.cancelAtPeriodEnd === true;
    return { unlockUntil: data.unlockUntil, updatedAtMs, purchasedAtMs, planType, cancelAtPeriodEnd };
  } catch (err) {
    console.error("[QN_AUTH] Firestore read failed:", err);
    return null;
  }
}

// planType省略=変更なし / null=フィールド削除
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

window.QN_AUTH = {
  auth,
  currentUser: null,
  fetchUnlockUntilFromFirestore,
  saveUnlockUntilToFirestore
}; // ---------- DOM要素 ----------
const btnLoginGoogle = document.getElementById("btnLoginGoogle");
const btnLogout = document.getElementById("btnLogout");
const userInfoEl = document.getElementById("userInfo");
const userPhotoEl = document.getElementById("userPhoto");
const userNameEl = document.getElementById("userName");

// ---------- ログイン処理 ----------
async function handleLogin() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error("[QN_AUTH] Sign-in failed:", err);
  }
}

// ---------- ログアウト処理 ----------
async function handleLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("[QN_AUTH] Sign-out failed:", err);
  }
}

if (btnLoginGoogle) btnLoginGoogle.addEventListener("click", handleLogin);
if (btnLogout) btnLogout.addEventListener("click", handleLogout);

window.QN_AUTH.login = handleLogin;

// ---------- ログイン状態監視・UI自動切り替え ----------
onAuthStateChanged(auth, async (user) => {
  window.QN_AUTH.currentUser = user;

  if (user) {
    if (userPhotoEl) userPhotoEl.src = user.photoURL || "";
    if (userNameEl) userNameEl.textContent = user.displayName || user.email || "";
    if (btnLoginGoogle) btnLoginGoogle.style.display = "none";
    if (userInfoEl) userInfoEl.style.display = "flex";

    if (typeof window.swSyncUnlockWithFirestore === "function") {
      await window.swSyncUnlockWithFirestore(user.uid);
    }

    window.dispatchEvent(new CustomEvent("qn-auth-changed", {
      detail: { user: { uid: user.uid, email: user.email, displayName: user.displayName } }
    }));
  } else {
    if (btnLoginGoogle) btnLoginGoogle.style.display = "flex";
    if (userInfoEl) userInfoEl.style.display = "none";

    window.dispatchEvent(new CustomEvent("qn-auth-changed", { detail: { user: null } }));
  }
});


document.addEventListener("DOMContentLoaded", () => {
  const avatarBtn = document.getElementById("userAvatarBtn");
  const dropdown = document.getElementById("userDropdown");

  if (avatarBtn && dropdown) {
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("active");
    });

    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", () => {
      dropdown.classList.remove("active");
    });
  }
});