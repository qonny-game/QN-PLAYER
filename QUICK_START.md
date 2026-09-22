# QN-PLAYER クイックスタート（作業開始時に最初に読むファイル）

新しいセッションでQN-PLAYERの修正依頼を受けたら、コードを開く前にこの
手順で進める。

---

## 0. まず確認すること

- **どのバージョンのZIPが渡されたか**をユーザーに確認する（分からなければ
  `index.html`の`window.QN_APP_VERSION`を見る）。`CHANGELOG.md`の最新項目と
  一致しているか照らし合わせる。ズレている場合、ユーザーが古いファイルを
  使っている可能性がある（実例: `AI_ASSISTANT_PROJECT_CONTEXT.md`作成前の
  セッションで、HTMLだけ新しくJSが古いまま、というズレが実際に起きた）。
- スクリーンショットが添付されていれば、文章より先にそれを見る。UIの
  位置関係の話は画像1枚が説明文より速い（`UI_TERMINOLOGY.md`参照）。

## 1. 依頼内容から読むべきファイルを絞る

| 依頼の種類 | 最初に開くファイル |
|---|---|
| 「SP/スマホで◯◯がおかしい」 | `AI_ASSISTANT_PROJECT_CONTEXT.md` §2（PC v2が唯一の実UI） |
| 再生できない/フリーズ/不安定系のバグ | `AI_ASSISTANT_PROJECT_CONTEXT.md` §3-3・3-5（既知の重い処理・タイミング問題） |
| 削除・選択・EDITモード関連 | §3-4・3-7（IndexedDB未削除、`attachSelectionHandlers`のonclick横取り） |
| ループ・マーカー・シーク関連 | §3-1・3-2（プリロール区間の固定、`beginSeek()`） |
| レイアウト・表示順がおかしい | §3-6（CSSの`order`は整数のみ）、`PC_V2_FILE_INDEX.md` |
| 新しいモーダル/パネルを作る | §3-8（モーダル共通化）、`DOM_ID_REFERENCE.md`（命名を揃える） |
| 「あのボタン」「あの画面」が指す場所が曖昧 | `UI_TERMINOLOGY.md` |
| `player-ui-pc-v2.js`か`style-layout-pc-v2.css`のどこに書くか探す | `PC_V2_FILE_INDEX.md` |
| 「前回どこまでやった？」 | `CHANGELOG.md` 末尾 |

## 2. 実装フロー

1. 該当ファイルをコードで確認する（`grep -n`でキーワード検索、
   `PC_V2_FILE_INDEX.md`があれば先に見当をつける）。
2. 修正内容が§3の既知バグの領域と重なる場合、同じ失敗を作り込んで
   いないか照らし合わせる。
3. 実装後、`CHANGELOG.md`記載の検証コマンド（§6）を通す：
   JS構文チェック・HTML構文チェック・CSS波括弧対応チェック・ID重複チェック。
4. `index.html`の`window.QN_APP_VERSION`を更新する（機能追加はマイナー、
   バグ修正/微調整はパッチ）。
5. ZIP化して提示する。

## 3. 修正が終わったら（ドキュメント更新）

`AI_ASSISTANT_PROJECT_CONTEXT.md` §5のルール7に従い、該当するファイルへ
追記する。**最低限、`CHANGELOG.md`への追記は毎回必須。** それ以外
（バグ履歴・目次・ID一覧・用語集）は該当する変更があった場合のみ。

更新したドキュメント（変更したものだけでよい）は、コードのZIPと一緒に
提示する。

---

## ファイル一覧（再掲）

- `QUICK_START.md` — このファイル。
- `AI_ASSISTANT_PROJECT_CONTEXT.md` — ファイル構成・設計事実・バグ履歴・
  データフロー・運用ルール・検証コマンド。
- `PC_V2_FILE_INDEX.md` — `player-ui-pc-v2.js` / `style-layout-pc-v2.css`
  の処理内容目次。
- `DOM_ID_REFERENCE.md` — DOM要素IDの一覧（静的/動的）。
- `UI_TERMINOLOGY.md` — ユーザーの言葉とUI要素の対応表。
- `CHANGELOG.md` — バージョン変更履歴。
