# QNPLAYER 同期（Firebase）

現状：**YouTubeのLibraryだけ・自分のUIDだけ**。QNPLAYER本体のデータ同期は未実装（`qnplayer-sync-plan.md`のステップ4）。

## 構成
- ログインは既存の`JS/player-auth.js`（Firebase Auth Googleログイン）。Firestoreも同じ`db`。
- `player-auth.js`が`window.QN_AUTH.isSyncUser()`（`SYNC_UIDS`に含まれるか）と`window.QN_AUTH.syncTransact(docId, mergeFn)`を公開。**同期できるUIDを増やす時は`SYNC_UIDS`とFirestoreルールの両方を直す。**
- 同期の中身は`JS/qn-app-youtube.js`の「同期」節（`trackLocalChanges` / `mergeStates` / `syncNow`ほか）。

## Firestore
保存先：`users/{uid}/sync/youtube`（1ドキュメント。課金の`users/{uid}`とは別）。
```
{ v:1,
  items:   { <videoId>: { url, customTitle?, markers:[{id,time,label,color?,enabled?}], loopA, loopB, skip?, createdAt, updatedAt } },
  deleted: { <videoId>: 削除時刻ms },      // tombstone（削除を他端末に伝える。180日で掃除）
  order:   [ <videoId>... ], orderAt: ms,  // 並び順
  updatedAt: serverTimestamp }
```
- **入れないもの**：YouTube由来のタイトル・サムネ、音声・映像、再生位置。
- 1ドキュメント上限1MiB。`syncTransact`が約900,000文字で書き込みを止める（エラー表示になる）。上限に近づいたら動画ごとのドキュメントに分割する。

## セキュリティルール（Firebaseコンソール → Firestore Database → ルール）
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // 同期用。今は自分のUIDだけ。一般公開時は最後の1行を消す
      match /sync/{docId} {
        allow read, write: if request.auth != null
                           && request.auth.uid == userId
                           && request.auth.uid == "ns3F3fcutTeI05tMHwF2zu5vtR63";
      }
    }
  }
}
```
※`users/{userId}`のルールは書類1枚にしか効かず、サブコレクションには及ばない（だから`/sync`を別に書く）。

## 合体ルール（`mergeStates`）
1. 動画ごとに`updatedAt`が新しい方を採用。**同時刻はリモート優先**（両端末が同じ結果に収束し、書き込みの往復が起きない）。
2. 削除は`deleted[videoId]`の時刻が動画の`updatedAt`以上なら削除。削除後に再追加（`updatedAt`が新しい）なら復活。
3. 並びは`orderAt`が新しい方。同時刻はリモート優先。どちらの並びにも無い動画は`createdAt`順で末尾。
4. 通信は`runTransaction`で「読む→合体→書く」を1回で行う（別端末と同時でも上書き事故なし）。ローカルが通信中に変わった時は反映せずもう一度同期。入力中・ドラッグ中は画面反映を3秒後に延期。

## いつ同期するか
ログイン時／保存の1.5秒後／ウィンドウに戻った時・オンライン復帰・YouTubeアプリを開いた時（前回から20秒以上空いていれば）。Libraryの「☁ 同期済み HH:MM」が状態表示（失敗時は赤字・タップで再試行）。リアルタイム購読（onSnapshot）は入れていない。

## ローカルデータ
- `qn_yt_items`の各動画に`updatedAt`。変更検知は`saveItems()`内の署名比較（個別の保存箇所は直さなくてよい）。
- `qn_yt_sync_meta`：`{tomb, orderAt, lastSync}`。

## 注意
- 端末の時計がずれると「新しい方」の判定がずれる（個人利用では許容）。
- 未ログイン・同期対象外のUIDは従来どおりローカル完結（同期処理は何も動かない）。
- 一般公開時：`SYNC_UIDS`とルールの開放、プライバシーポリシーの更新、データ量上限の見直し。
