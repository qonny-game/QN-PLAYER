# QN-PLAYER UI用語集

ユーザーが使う呼び方と、実際のDOM要素・変数名・CSSクラスの対応表。
画面の同じ場所を指していても呼び方が食い違うと手戻りが起きるため
（例: 「曲名の上」＝ヘッダー直下だと思ったら実際は波形エリア上部の
`#appTitle`直上を指していた、という行き違いが一度あった）、迷ったら
先にこの表を確認する。**新しい行き違いが起きたら、その都度この表に
追記すること。**

---

## 画面の場所

| ユーザーの呼び方 | 実際の要素 | 備考 |
|---|---|---|
| 曲名 / 曲名・アーティスト名の表示 | `#appTitle`（`#appTitleInner` > `#appTitleText`） | `#pcV2WaveArea`内、波形バーの直前に位置する。ページ最上部のアプリロゴ（下記）と混同しやすい |
| ヘッダー / アプリのロゴ部分 | `#appHeader`（「QNPLAYER vX.X.X」表示） | `#appTitle`（曲名）とは別物。`#pcV2Root`より前、ページの一番上に固定 |
| ライブラリ | Playlistパネル（`#playlistBox`） | サイドメニューでは「Library」表記 |
| 下部コントロール / コントロールバー | `#pcV2BottomBar` | Play系ボタン（1行目）とMarker系ボタン（2行目、PC幅）またはPlay/Markerが1本に連結された横スクロール列（SP幅） |
| サイドバー / サイドメニュー / アイコンバー | `#pcV2IconBar` | Seekbar/Control/Markers/Library/Text/Backup/Import等のタブが並ぶ |
| 波形エリア | `#pcV2WaveArea` | 曲名表示・波形バー6分割・マーカー番号ラベルを含む |
| ピン留め | お気に入り機能（`track.favorite`） | 画鋲アイコン。ハート型から変更した経緯あり |
| アンカータブ / PLAY・MARKERタブ | `#pcV2BottomBarAnchorTabs`内の`.pcv2-anchor-tab` | 下段バーの横スクロール位置をジャンプさせるショートカットボタン。曲名ヘッダーの直下ではなく、下段バーの直上に位置する |

## 機能名

| ユーザーの呼び方 | コード上の名前 |
|---|---|
| プリロール / 頭出し秒数 | `loopPreRollSeconds`（`player-controls.js`） |
| バックアップ | Backupモーダル（`trackBackup*`、`player-track-backup.js`） |
| インポート / 読み込み | Importモーダル（`trackImport*`、`player-track-backup.js`） |
| EDIT モード / 編集モード | `editModeState.playlist` / `editModeState.markers`（`player-ui-pc-v2.js`） |
| 削除選択（丸いチェック） | `.del-btn` / `.playlist-del-zone`、`pcv2-selected`クラスで選択中を表現 |
| 一括削除ボタン | `#pcV2DeleteSelectedBtn` |
| ○秒ループを伸ばす | プリロール/ポストロール秒数の設定（同上） |
| SKIP/PLAY トグル | `.playlist-skip-toggle`（自動再生の順送りに含めるか） |
| 大手術 | PC v2レイアウトへの統一リファクタリング（メモリ`qnplayer-pc-v2-app.md`参照、`flattenForPc()`/`restoreForSp()`はその名残） |

## 「SP」「PC」の指す意味

- 「SP」「スマホ」「モバイル」＝画面幅が狭い状態（`@media (max-width: 900px)`）。
  **UIの実装自体はPC v2のみ**で、SP幅はCSSでPC v2のDOM構造を作り替えた
  ものに過ぎない（`AI_ASSISTANT_PROJECT_CONTEXT.md`§2）。「SP版のコードを
  直して」と言われても、対応するファイルは`player-ui-pc-v2.js`や
  `style-layout-pc-v2.css`のSP幅メディアクエリブロックであることが多い。
- 「実機」「スマホで確認」＝ユーザーが実際のiPhone等で動作確認したことを
  指す。ブラウザの開発者ツールでの幅リサイズとは別に、モバイルSafari特有の
  自動再生ポリシー・IndexedDB挙動（§3-3, 3-5）が関係することがある。

## 迷ったときの確認の仕方

言葉だけで位置や機能の対応に自信が持てない場合、質問で確認する前に：
1. `DOM_ID_REFERENCE.md`でID名から要素を特定できないか確認する。
2. `PC_V2_FILE_INDEX.md`で該当しそうな関数/セクションを探す。
3. それでも曖昧なら、`ask_user_input_v0`等で選択肢を示して確認する
   （今回「曲名の上」を早合点した反省。スクリーンショットがあれば
   最優先でそれを見て判断する）。
