# QN-PLAYER プロジェクトコンテキスト & AI協業ガイド

QN-PLAYER（QNシリーズのブラウザ完結型MP3プレイヤー）の開発を効率よく進めるための
プロジェクト固有の知識をまとめたドキュメント。修正依頼の前に該当セクションを
確認することで、同じ調査・同じ失敗を繰り返さないようにする。

**関連ファイル（このドキュメントと一緒に渡す/参照する）：**
- `QUICK_START.md` — **作業開始時、まずこれを読む。** 依頼の種類ごとに
  どのファイルを見るべきかの早見表と、実装〜ドキュメント更新までの手順。
- `PC_V2_FILE_INDEX.md` — 最大2ファイル（`player-ui-pc-v2.js` /
  `style-layout-pc-v2.css`）の処理内容目次。
- `DOM_ID_REFERENCE.md` — HTML静的ID・JS動的生成IDの一覧
  （特にBackup/Importモーダルの`trackBackup*` / `trackImport*`）。
- `UI_TERMINOLOGY.md` — ユーザーの言葉とDOM要素・コード上の名前の対応表。
  画面上の場所を指す言葉が食い違いそうなときに確認する。
- `CHANGELOG.md` — バージョンごとの変更履歴。前回どこまで進んだかの確認用。

---

## 1. プロジェクト構成（ファイルマップ）

```text
QNPLAYER/
├── index.html                  # 全体のHTML骨格、モーダル類、<script>読み込み順
├── JS/
│   ├── player-core.js          # 中核データ・状態管理。DOM操作なし。
│   │                           #   audio要素、pins配列、playlist配列、
│   │                           #   IndexedDB(qnaudio_playlist_db)アクセス全般
│   ├── player-ui-shared.js     # PC/SP共通のUI操作。loadFile、updateBars
│   │                           #   （毎フレームのシーク・ループ判定）、togglePlay等
│   ├── player-ui-pc-v2.js      # 【最重要・最大】現在の唯一のUI実装（詳細は§2、
│   │                           #   関数一覧は別ファイルPC_V2_FILE_INDEX.md）
│   ├── player-playlist.js      # プレイリスト：追加/削除/並び替え/お気に入り
│   ├── player-markers.js       # マーカー：追加/削除/ドラッグ移動/波形描画
│   ├── player-controls.js      # Speed/AutoSpeed/Key/Loop/PreRollのつまみ系
│   ├── player-control-eq.js    # EQ（5バンドイコライザー）
│   ├── player-track-backup.js  # ライブラリの一括Backup/Importモーダル
│   ├── player-export.js        # 現在曲の範囲書き出し（WAV/MP3）
│   ├── player-shareware.js     # 無料版の機能制限・アンロックモーダル
│   ├── player-theme.js         # カラーテーマ・ショートカット一覧・ハンバーガーメニュー
│   ├── player-id3.js           # MP3のID3v2タグ読み取り（Title/Artist）
│   ├── player-text.js          # Textタブ（歌詞・メモ）
│   ├── player-auth.js          # Firebase Auth（Googleログイン）
│   ├── jszip.min.js / lame_min.js  # 外部ライブラリ（ZIP圧縮／MP3エンコード）
├── CSS/
│   ├── style-core.css          # PC版デフォルトレイアウト＋PC/SP共通デザイン
│   ├── style-layout-pc-v2.css  # 【最重要・最大】現在の唯一のレイアウト実装（詳細は§2、
│   │                           #   セクション一覧は別ファイルPC_V2_FILE_INDEX.md）
│   ├── style-layout-sp.css     # 旧SP版上書き（現在は実質未使用、詳細は§2）
│   ├── style-playlist.css / style-markers.css / style-controls.css /
│   │   style-control-eq.css / style-export.css / style-shareware.css /
│   │   style-text.css / style-theme.css / style-auth.css
│   │                           # 各機能ごとのUIスタイル（ファイル名で対応するJSが分かる）
```

読み込み順（index.html末尾）：
`jszip.min.js → lame_min.js → player-shareware.js → player-core.js →
player-ui-shared.js → player-id3.js → player-playlist.js →
player-track-backup.js → player-markers.js → player-control-eq.js →
player-controls.js → player-export.js → player-text.js →
player-ui-pc-v2.js → player-theme.js → player-auth.js(module)`

**新しい関数を他ファイルから参照する場合は、この順序で「呼ぶ側より前に定義されているか」を必ず確認する。**
特に `player-core.js` はほぼ全ファイルの先頭にあるので、共通ヘルパーを追加する定位置として適している。

---

## 2. 最重要の設計事実：「PC v2」が唯一の実UI

これを理解していないと調査が必ず遠回りになる。

- `player-ui-pc-v2.js` 内の `PC_BREAKPOINT = "(min-width: 0px)"` は**常にtrue**。
  つまり画面幅を問わず常にPC v2のDOM構造（`#pcV2Root`以下）がactivateされている。
- 旧来の「SP専用UI」（`.app-container`直下の要素、`style-layout-sp.css`の
  `@media (max-width: 768px)`ブロック等）は`body.pc-v2-active`が付くと
  `display: none`になり、**実質死んでいる**。
- SP幅での見た目・挙動は、**PC v2のDOM構造をCSSの`@media (max-width: 900px)`
  ブロック（`style-layout-pc-v2.css`末尾）で作り替えたもの**。
- 結果として：
  - 削除・選択などのUIロジックは、SP版のonclickハンドラ（例:
    `player-playlist.js`の`delBtn.onclick`）を直接見ても**発火しない**ことが多い。
    実際の処理は`player-ui-pc-v2.js`の`attachSelectionHandlers`等、
    PC v2側のキャプチャフェーズハンドラが奪っている（§3-2参照）。
  - 「SP版の見た目がおかしい」系の相談は、まず`style-layout-pc-v2.css`の
    `@media (max-width: 900px)`ブロックを疑う。`style-layout-sp.css`側は
    基本的に無関係。
  - 下部コントロールバー(`#pcV2BottomBar`)・アイコンバー(`#pcV2IconBar`)は
    PC幅では別の位置にあるが、SP幅では`syncBottomBarPosition()`
    （`player-ui-pc-v2.js`）がJSでDOM上の位置ごと移動させている。
    新しい要素をこの周辺に追加する場合、この関数も一緒に更新しないと
    SP⇔PC幅切替時に迷子になる。

---

## 3. 過去のバグ修正履歴（Gotchas）

同じ調査を繰り返さないための最重要セクション。新しい修正が以下のいずれかの
領域に触れる場合、着手前に必ず目を通すこと。

#### 症状→項目 早見表（v2.15.0〜）
似た症状の報告を受けたら、まずこの表で該当しそうな項目を開く。
**新しい項目を追加したら、この表にも1行追加すること。**

| 症状（ユーザーの言葉に近い形） | 項目 |
|---|---|
| ループの折り返し先が1個前のマーカーになる | 3-1 |
| シークしたら前の区間のループに引き戻される | 3-2 |
| SPで1回目のタップで再生されない（再生ボタン・曲選択） | 3-3, 3-14 |
| 削除したはずの曲が再起動後に復活する | 3-4 |
| 並び替え・ピン・インポート後に不安定／再生できない | 3-5, 3-11 |
| 曲名だけ変わって波形・マーカー・再生が前の曲のまま | 3-11, 3-13 |
| 要素が狙った位置ではなく先頭に表示される（CSS order） | 3-6 |
| EDITモード中にボタンのonclickが発火しない | 3-7 |
| モーダル（Export/EQ/Backup/Import）の見た目・開閉 | 3-8 |
| 無料版制限が効かない／効きすぎる | 3-9 |
| SPで再生中・放置中にページが落ちてスプラッシュから再読み込み | 3-10 |
| 一方のパネルのCSS修正で、もう一方の削除●が押せなくなった | 3-12 |
| テキスト・マーカーが別の曲の内容になる／全曲共通に見える | 3-13 |
| タップすると行が薄く光るだけで反応しない時がある（iOS） | 3-14 |
| ポップアップ・スライダーが背面に隠れて見えない | 3-15 |
| PC版が全体的にもっさり、他タブまでカクつく | 3-16, 3-10 |
| Speed/Key/EQを初めて使う瞬間に音が途切れる | 3-17 |
| マーカーメモ編集中に行が広がる | 3-18 |
| 別パネル表示中に曲を変えると、戻った時に前の曲の内容が残っている | 3-19, 3-13 |
| SPでマーカー線をドラッグすると、初回だけちょっと動いて止まる | 3-20 |
| 何もしていないのに「スタイル再計算/秒」が高い（パネルによって変わる） | 3-21, 3-16 |

### 3-1. ループのプリロール機能：「1個前のマーカー」に化ける
- **現象：** マーカー区間ループにpre/post-roll秒数を設定すると、ジャンプ先が
  前のマーカー区間側にはみ出し、以後の折り返し判定が「1個前のマーカー」を
  対象にしてしまう。
- **原因：** 折り返し判定をその場の`audio.currentTime`だけから毎フレーム
  計算していたため、pre-rollで現在地が前の区間に入り込むと区間を誤認した。
- **解決：** `player-core.js`の`loopActiveMarkerIndex`で「今ループ対象に
  している区間」を明示的に固定する。マーカー追加/削除/色変更、ループON/OFF、
  曲切替、**そしてシーク**の全箇所で確実にリセットする必要がある
  （§3-2「シークの取りこぼし」参照）。

### 3-2. シークが「今ループ中の区間」と混線する
- **現象：** プリロール設定中、マーカーAをループ再生中にタップで
  マーカーBの頭付近へシークすると、見た目はBなのに実際はAのpost-roll
  範囲内として扱われ続け、Bの再生中にAへ戻ってしまう。
- **原因：** `loopActiveMarkerIndex`のリセットが「区間の許容範囲から
  外れたら再計算する」というゆるい判定だけに頼っており、シーク先が
  たまたま前の区間の許容範囲内に着地すると区間離脱が検知できなかった。
  `isSeeking = true`への代入がファイル内11箇所に散らばっており、
  個別に対応すると漏れが出た。
- **解決：** `player-core.js`に`beginSeek()`という共通関数を作り、
  「シークを開始する箇所は必ずこれを経由する」ルールに統一。
  `beginSeek()`内で`isSeeking = true`と`loopActiveMarkerIndex = null`を
  同時に行う。**新しいシーク操作を追加するときは、`isSeeking = true`を
  直接書かず必ず`beginSeek()`を呼ぶこと。**

### 3-3. `audio.play()`のタイミング：SPで1回目のタップが効かない
- **現象：** SP実機で曲をタップしても再生されず、数回タップしてようやく
  再生される。
- **原因：** `playTrackAt()`が`loadFile()`→`renderPlaylist()`→
  `audio.play()`の順で呼んでいた。`renderPlaylist()`のDOM再構築コストで
  `play()`の呼び出しがタップイベントのコールスタックから実質的に
  切り離され、モバイルブラウザの自動再生ポリシーに「ユーザー操作起因
  ではない」と判定されてブロックされていた。
- **解決：** `audio.play()`は**必ずタップ/クリックのコールスタック内で
  同期的に、かつ重い処理（DOM再構築等）より先に**呼ぶ。
  `<audio>`はロード中でも`play()`を呼んでおけて、再生可能になり次第
  自動的に鳴り始める。

### 3-4. PC v2の一括削除がIndexedDBを消していない
- **現象：** ライブラリでDELETEしてアプリを閉じ、再度開くと消したはずの
  曲が復活している。
- **原因：** EDITモードの削除は実際にはPC v2の`deleteSelectedItems`
  （§2参照、SP版のonclickは発火しない）が処理するが、この実装は
  `playlist`配列（メモリ上）からは削除していたのに、IndexedDB側の
  `deletePlaylistTrack()`の呼び出しが漏れていた。
- **解決：** `playlist.splice()`の**前に**削除対象のファイル名を控えておき
  （spliceでインデックスがずれるため）、`deletePlaylistTrack(name)`を
  忘れず呼ぶ。**「見た目上消えた」と「実際に永続化された」は別物として
  必ず両方確認する。**

### 3-5. `persistPlaylistOrder()`が全曲分の音声データを毎回書き直す【最重要】
- **現象：** ピン留め（お気に入り）・ドラッグ並び替え・インポートの
  いずれかを行うと、その後アプリが不安定になる（再生できない、
  次の曲に進めない、フリーズ）。アプリを再起動すると直る。
- **原因：** `persistPlaylistOrder()`は「並び順(savedAt)を保存するため」の
  関数なのに、実装上は`savePlaylistTrack()`（音声Blobを含めてレコード
  全体を`put`する関数）を全曲分呼んでいた。曲数が多いほど、大容量の
  音声データを毎回丸ごとIndexedDBへ再書き込みする重い処理になり、
  その間ずっと音声のロード/再生とIndexedDB書き込みがリソースを奪い合う。
- **解決：** `persistPlaylistOrder()`を、既存レコードを`get`してから
  `savedAt`/`enabled`/`title`/`artist`/`favorite`だけを書き換えて`put`する、
  **Blobに一切触れない軽量な実装**に変更。インポート処理も「実際に
  変更された曲だけ」を個別に保存する方式に変更し、無関係な曲を
  巻き込まないようにした。
- **教訓：** 「並び順やメタデータだけを更新したい」処理で、Blob/File
  などの大容量データを持つIndexedDBレコードを扱うときは、**必ず
  「実体を含めて丸ごと書き込む関数」と「メタデータだけ軽量に更新する
  関数」を分ける。** `savePlaylistMetadataFor()`が後者の実装例。
  新しく「複数曲を一括で何か保存する」機能を作るときは、まずこの
  観点（実体ごと書き直していないか）を疑う。

### 3-6. CSSの`order`プロパティに小数値は無効
- **現象：** SP幅に追加したアンカータブ要素が、狙った位置（波形エリアの後）
  ではなく、レイアウトの一番先頭（ヘッダー直下）に表示されてしまった。
- **原因：** 複数要素の表示順を`order: 1`, `order: 1.5`, `order: 1.8`の
  ように小数値で管理していた。CSS仕様上`order`は`<integer>`のみが有効で、
  小数値は無効な値としてブラウザに無視され、暗黙的に`order: 0`
  （デフォルト値）へフォールバックしていた。
- **解決：** 関係する要素すべての`order`を整数だけで振り直す
  （例: 1, 2, 3, 4, 5）。**`order`で「間に後から要素を挟みたいかもしれない」
  場合でも、小数は使わず、余裕を持った整数間隔（10, 20, 30...）で
  採番するのが安全。**

### 3-7. `attachSelectionHandlers`が既存の`onclick`をキャプチャフェーズで奪う
- **現象：** `player-playlist.js`や`player-markers.js`に書いた
  `delBtn.onclick`等が、EDITモード中は一切発火しない。
- **原因：** `player-ui-pc-v2.js`の`attachSelectionHandlers()`が、
  `container.addEventListener("click", handler, true)`（第3引数`true`＝
  キャプチャフェーズ）で`.del-btn`（または`.playlist-del-zone`）クリックを
  先取りし、`stopPropagation()` + `preventDefault()`している。
- **教訓：** EDITモード中の削除・選択系ボタンの挙動を変えたい場合、
  対象ファイル（`player-playlist.js`等）の`onclick`をいくら書き換えても
  無意味。必ず`player-ui-pc-v2.js`の`attachSelectionHandlers`側を確認する。

---

### 3-8. モーダルの器（.export-modal-overlay）は使い回されている
- **v2.14.0追記：** Export・Backup・Importは、PC v2ではモーダルとしてではなく
  サイドメニューのパネルとして表示している（`switchPanel()`が
  `.export-modal-body`/`.export-modal-footer`をパネルへ移す）。モーダルの
  見た目を直しても、パネル側では`#pcV2PanelBody.pcv2-panel-backup`等の
  上書きCSSが効く点に注意。
- **背景：** Export/EQ/Backup/Importなど、モーダルは全て共通の器CSS
  （`.export-modal-overlay` / `.export-modal` / `.export-modal-header` /
  `.export-modal-body` / `.export-modal-footer`、`style-export.css`）を
  流用している。名前は`export`だが機能をExportに限定するものではない。
- **教訓：** 新しいモーダルを追加するときは、まずこの共通クラスをそのまま
  使えないか確認する（幅・角丸・開閉アニメーション・ヘッダー/フッター
  構成を毎回作り直さない）。逆に、共通の器に独自の`min-height`や`max-width`
  を効かせたい場合は、固有クラス（例: `.track-backup-modal`）を追加で
  `.export-modal`と併記し、そちらにだけ上書きを書く。
- **関連の落とし穴：** モーダルが複数の状態（タブ、読み込み前後など）を
  持つ場合、状態によって高さ・幅が変わると開閉のたびに位置がガクッと
  動いて見える。共通の器側で`min-height`等を固定し、中身の量に関わらず
  見た目のサイズを安定させるとよい（Backup/Importモーダルで実施済み）。

### 3-9. 無料版の機能制限（シェアウェア）は「新規追加系」にだけ掛かっている
- **背景：** `player-shareware.js`の`SW_LIMITS`（例:
  `LIBRARY_MAX_TRACKS`＝ライブラリ3曲まで、`AB_LOOP_MAX_COUNT`＝AB間
  ループ5回まで）は、`addFilesToPlaylist()`のような「新しく増やす」
  操作にだけ適用されている。
- **教訓：** 新機能が「ライブラリに曲を増やす」性質を持つ場合
  （インポート等）、無料版制限を適用するかどうかは都度判断が必要で
  自動では掛からない。今回のインポート機能は「復元・引っ越し用途」と
  位置づけ、意図的に無制限にした（ユーザーとの合意済み）。同様の
  判断が必要な新機能を作るときは、既存の`isUnlocked()` /
  `SW_LIMITS` / `swShowUnlockToast()`のパターンを踏襲するか、
  意図的に制限しないかを毎回明示的に決める。

### 3-10. 毎フレームのrequestAnimationFrameループでSPが強制再読み込みされる【最重要】
- **現象：** SP（特にiOS）で普通に1曲再生しているだけで、3分以内に
  ほぼ100%ページが落ちてスプラッシュ（ロゴ）から再読み込みされる。
  ループ・Bluetoothの有無と無関係。アプリ再起動直後でも再現。
- **原因：** `player-ui-pc-v2.js`の`pcv2WaveLoop`が、`PC_BREAKPOINT`が
  `(min-width: 0px)`＝SPでも常に有効な状態で、毎フレーム（60〜120回/秒、
  一時停止中も）6本のcanvasに波形バー約4000本を全部描き直していた。
  しかも1フレームごとに`getBoundingClientRect()`×6（強制レイアウト）・
  `getComputedStyle()`×6・pinsのfilter/sort・バー1本ごとの色文字列生成
  （`hexToRgbaLocal`）を行っており、CPU/GPU・GCが飽和してiOSにプロセスを
  強制終了されていた。加えて波形デコードが共有AudioContext（`getAudioCtx()`）
  を使っていたため、EQ未使用の通常再生でもリアルタイムAudioContextが常駐していた。
- **解決：** 描画を約10回/秒に間引き、「再生位置（バー1本単位）・波形・
  マーカー・アクセント色・サイズ」の署名が変わらなければ描画をスキップ。
  サイズ計測はresize時のみ、`fillStyle`は色が変わる時だけ代入。
  共有の`drawWaveform()`は`window.__qnWaveformDrawCount`を進め、PC v2側に
  描き直しが必要なことを知らせる。波形デコードは`decodeForWaveform()`で
  低サンプルレートの`OfflineAudioContext`を使用。スライダー同期ループ・
  Glowテーマのループも間引いた。
- **教訓：** `requestAnimationFrame`ループを新しく書くときは、
  **(1)毎フレーム本当に必要か（間引けないか）、(2)変化が無い時にスキップ
  しているか、(3)ループ内でレイアウト計測・getComputedStyle・配列/文字列の
  新規生成をしていないか**を必ず確認する。SPでは「PC v2＝常に動く」ことを
  忘れない（§2）。また`getAudioCtx()`は「再生用のリアルタイム
  AudioContextを生成する」関数なので、デコード目的だけで呼ばない。

### 3-11. iOS SafariでBlob入りIndexedDBレコードを書き直すとメモリ上のFileが死ぬ【最重要】
- **現象：** ライブラリを並び替えると、ほぼ100%再生できなくなる
  （一時停止アイコンのまま、シークバーも進まない）。前/次を押すと曲名だけ
  切り替わり、シークバー・波形・マーカーは直前の曲のまま。
- **原因：** v2.13.3で軽量化した`persistPlaylistOrder()`も、実際には
  音声Blobを含むレコードを`get`→`put`し直していた。WebKitのIndexedDBでは
  Blobの中身を変えなくてもputのたびに実体ファイルが作り直され、古い実体が
  削除されるため、起動時に読み込んでplaylist配列が持っている各曲のFileが
  「中身の読めないBlob」になる。loadFile()は曲名表示(setAppTitle)までは
  進むが、音声が読み込めないため`loadedmetadata`が発火せず、波形・
  マーカーが更新されない。§3-5の本当の根本原因はこちらだった。
- **解決：** メタデータ（savedAt/enabled/title/artist/favorite）を
  localStorageの`qn_playlist_meta_v1`（`{ファイル名: {...}}`）へ分離。
  `persistPlaylistOrder()`・`savePlaylistMetadataFor()`はIndexedDBに
  一切書き込まない。IndexedDBへ書くのは「ユーザーが新しく与えた音声」
  （新規追加・インポート新規・インポートでの音声上書き＝
  `savePlaylistTrackAudioKeepingOrder()`）の時だけ。読み込み時
  (`loadAllPlaylistTracks()`)はメタデータ優先、無い項目はレコード側の値。
  保険として`audio`の`error`時に`reloadTrackFileFromDB()`で読み直して
  1回だけ再試行する。
- **教訓：** **IndexedDBの音声レコードは「書いたら二度と書き直さない」。**
  並び順・フラグ・表示名など頻繁に変わる情報は、Blobとは別の場所
  （localStorageや別ストア）に置く。「Blobの中身を変えなければ安全」
  という前提はiOSでは成り立たない。

### 3-12. 共通CSSの修正が別パネルを巻き込む（マーカー削除●が押せない）
- **現象：** MarkersパネルのEDITモードで削除●にチェックが入らない（削除不可）。
- **原因：** v2.10.6でPlaylistの削除タップ範囲を`.playlist-del-zone`に
  広げた際、`.del-btn`へ`pointer-events: none`を付けたが、セレクタが
  markers/playlist共通だった。Markersは`.del-btn`自体がタップ判定
  （`attachSelectionHandlers`の`zoneSelector`）のため、クリックが素通りして
  `e.target.closest(".del-btn")`が見つからなくなっていた。
- **解決：** `pointer-events: none`をplaylistパネル限定のセレクタに分離。
- **教訓：** markers/playlistを1つのセレクタで同時に指定している
  `style-layout-pc-v2.css`のルールを変更するときは、両パネルのタップ判定の
  仕組みが違う（markers＝`.del-btn`、playlist＝`.playlist-del-zone`）ことを
  確認する。

### 3-13. 曲切替時の読み込みを`loadedmetadata`待ちにすると、前の曲の状態が残る
- **現象：** テキストメモが全曲共通のように見える（曲を切り替えても同じ
  テキストが表示される）。
- **原因：** `loadFile()`で曲名(`currentFileName`)は即座に切り替わるが、
  テキスト・マーカーの読み込みは`audio.onloadedmetadata`の中だった。
  読み込みが遅い/失敗すると（§3-11）前の曲のテキストが表示されたまま
  残り、その状態で入力すると`saveNoteText()`が新しい曲名のキーで保存して
  しまい、実データとしても「同じテキスト」が複製されていく。
- **解決：** マーカー配列の読み込み＋`renderPinList()`、テキスト欄（本体・
  フルスクリーン側とも）の読み込みを`loadFile()`内で同期的に行う。
  duration依存の`renderPins()`/`renderSegments()`だけ`loadedmetadata`に残す。
- **教訓：** 「曲名キーで保存するデータ」は、曲名の切り替えと同じ瞬間に
  読み込む。非同期イベントを待つと、その間キーと表示内容がズレる。

### 3-14. iOSでは`:hover`で中身が変わる要素の1回目のタップがclickにならない
- **現象：** ライブラリのワンタップ再生が「効く時と効かない時がある」。
  効かない時も行はうっすら白く（`:hover`背景）なる。
- **原因：** `.playlist-title-row:hover .playlist-hover-edit-btn { display: flex }`
  のように、ホバーで他要素の`display`が変わるCSSがあると、iOS Safariは
  1回目のタップを「ホバーさせるだけ」として扱い`click`を発火しない
  （コンテンツ変化検知の仕様）。タイトル/アーティスト行をタップした時だけ
  失敗し、行内の他の場所では成功していた。
- **解決：** ホバーで表示を変えるCSSを`@media (hover: hover) and (pointer: fine)`
  で囲み、マウス環境限定にした（Library・Markers両方）。タッチ端末の
  編集はEDITモードで行う（Markersの鉛筆はタッチ端末のEDITモード中だけ
  常時表示）。あわせて通常モードのLibrary行はどこをタップしても再生する。
- **教訓：** **タップして動く要素（またはその子孫）に、`:hover`で`display`/
  `visibility`を変えるCSSを書かない。** 必要ならホバー可能環境に限定する。

### 3-15. 横スクロールする入れ物の中の絶対配置ポップアップは切り取られる
- **現象：** SPでVolumeアイコンを押しても、縦スライダーが背面に隠れて
  見えない・操作できない。
- **原因：** SP幅の`#pcV2BottomBar`は`overflow-x: auto`（横スクロール）。
  `overflow`の片方をvisible以外にすると、もう片方もvisibleではなくなるため、
  上方向へはみ出す`position: absolute`のポップアップが切り取られていた。
  さらにドラッグは`mousedown`のみでタッチ非対応だった。
- **解決：** ポップアップを`document.body`直下へ移し、`position: fixed`で
  ボタンの位置から座標を計算して表示。Pointer Eventsでマウス/タッチ両対応。
  下段バーのスクロール・resize時は閉じる。
- **教訓：** 下段バー（横スクロール）の中にポップアップ・ツールチップを
  足すときは、最初からbody直下＋fixedで作る。

### 3-16. 閉じているオーバーレイの`backdrop-filter: blur(0px)`がブラウザごと重くする
- **現象：** PC版Chrome（Windows）で、停止中・Glow/Speed/Key/EQ全OFFでも
  ボタンやスライダーの反応がコンマ数秒遅れる。QNPのタブを開くと、
  他のタブのfaviconの読み込みくるくるまでカクつく。
- **原因：** `.export-modal-overlay`（EQ/Export/解約/Backup/Importの5個、
  `position: fixed; inset: 0`で常に画面全体に存在）が、閉じている間も
  `backdrop-filter: blur(0px)`を持っていた。blur(0px)でも`none`以外なら
  ブラウザは背景フィルター用の合成処理を用意し続けるため、画面全体を
  覆うぼかし合成が5枚重なった状態になり、曲名マーキー・時刻表示・波形など
  画面のどこかが動くたびにGPU合成が重くなっていた。
- **解決：** 閉じている間は`backdrop-filter: none; visibility: hidden`。
  開閉アニメーションのためvisibilityだけ遅延切り替え。あわせて停止中にも
  10回/秒走っていた時刻表示・進捗バーのDOM書き込みを変化時のみに。
- **教訓：** `backdrop-filter`・`filter`・大きな`box-shadow`を持つ全画面
  要素は、非表示時に**必ず`none`へ戻す**（0px・透明度0で「見えないだけ」に
  しない）。`display: none`か`visibility: hidden`＋`none`をセットで使う。

### 3-17. `createMediaElementSource()`の後に`await`を挟むと、その間だけ無音になる
- **現象：** Controlパネル（Speed/Key/EQ）を初めて開いた瞬間だけ、再生が
  一瞬（0.1〜0.2秒）ぷつんと途切れる。2回目以降・再読み込み後の2回目は
  起きない。
- **原因：** `setupAudioGraph()`が最初に`createMediaElementSource(audio)`を
  呼んでいた。この瞬間から`<audio>`の音は通常出力を離れてWeb Audioの
  グラフへ回されるが、`destination`への接続はSoundTouchJSのCDN読み込みと
  AudioWorklet登録を`await`した後だったため、その待ち時間が無音になっていた。
- **解決：** フィルター作成・SoundTouch準備・`ctx.resume()`を全て先に
  終わらせ、最後に`createMediaElementSource()`→各ノード→`destination`の
  接続を`await`なしの同期処理で一気に行う。
- **教訓：** 再生中の音声経路を差し替える処理は「重い準備を全部先に、
  切り替えは最後に一瞬で」。切り替え開始から完了までの間に非同期処理を
  挟まない。

### 3-18. マーカーメモのプリセットを行内に並べるとリストの行が広がる
- **現象：** マーカーメモ編集中、プリセット（Intro/Verse…）が行の中に
  2段で並び、その行だけ縦に大きく広がってリストがガタつく。
- **解決（v2.15.0）：** プリセットは`document.body`直下の
  `.pin-memo-preset-popup`（`position: fixed`、入力欄の直下）に表示する。
  チップは`pointerdown`で`preventDefault`（入力欄のフォーカス維持）し、
  実際の適用は`click`で行う（pointerdownで消すと、後続のclickが下の行に
  落ちてマーカーへジャンプしてしまうため）。チップを押すと、メモ確定・
  プリセット色の自動適用・ポップアップ/編集モード終了まで一度に行う。
  `renderPinList()`の先頭で必ずポップアップを閉じる（取り残し防止）。
- **関連：** 削除タップ判定の広いゾーン（`.pin-del-zone`）もv2.15.0で
  Markersに導入し、Libraryの`.playlist-del-zone`と同じ仕組み・同じ
  「選択中は表示/非表示トグル不可」仕様に揃えた（3-7, 3-12参照）。

### 3-19. パネル切替で中身をdocumentから切り離すと、裏での更新が空振りする
- **現象：** 別のパネル（Control等）を表示したまま次の曲へ進み、その後
  Markersパネルを開くと、前の曲のマーカーリストが表示されている。
  波形上のマーカーやショートカットは新しい曲で正常に動く。
- **原因：** `switchPanel()`が`panelBody.innerHTML = ""`でパネルの中身
  （`markersBody`等の実体）をdocumentから切り離していた。切り離された
  要素の中の`#pinList`・`#playlistBox`・`#noteTextArea`等は
  `document.getElementById()`で見つからない（nullになる）ため、その間の
  `renderPinList()`・`renderPlaylist()`・テキスト読み込みは何もせずに
  終わり、古い内容のまま再表示されていた。
- **解決（v2.15.1）：** `innerHTML = ""`の直前に`stashPanelContents()`で、
  再利用する実体（各パネルの中身・EQ見出し・QNメニューのセクション・
  Backup/Import/Exportの中身）をdocument内の非表示の退避場所
  `#pcV2PanelStash`へ移す。常にdocument内にいるので、どのパネルを
  表示していても裏で正しく更新される。
- **教訓：** **`getElementById`で更新する要素は、非表示の時もdocument内に
  置いておく**（`display: none`の入れ物に移す）。パネルに新しい実体を
  追加したら、`stashPanelContents()`の対象リストにも必ず加える。

### 3-20. ドラッグ中に、つかんでいる要素を作り直すとタッチが途切れる
- **現象：** SPでシークバー上のマーカー線をスライドすると、各マーカーとも
  初回は必ず少しだけ動いて止まる（2回目は動くことがある）。PCのマウスでは
  起きない。
- **原因：** `startDragPin()`の移動処理が、指が動くたびに`renderPins()`で
  全マーカー線を削除→作り直していた。タッチイベントは常に「タッチを
  始めた要素」へ届くが、その要素がDOMから取り除かれると、以降の
  touchmove/touchendは切り離された要素に届くだけでdocumentまで伝わらない。
  documentに付けていたtouchmoveは最初の1回しか呼ばれず、そこで止まって
  いた（指を離した処理も走らないため、後始末も残ったままになっていた）。
  マウスのmousemoveは「今ポインタの下にある要素」に届くため影響がなかった。
- **解決（v2.16.2）：** ドラッグ中は要素を作り直さず、つかんだマーカー線の
  `left`と所属する行（`appendChild`で付け替え）だけをその場で更新する。
  番号の振り直し・リスト更新・保存は指を離した時に1回だけ。タッチの
  touchmove/touchend/touchcancelは、タッチを始めた要素自身に付ける。
  あわせて`touch-action: none`と、線の左右に広い透明なつかみ判定
  （`.vbar-line::after`）を追加。
- **教訓：** **ドラッグ中（特にタッチ）は、つかんでいる要素を削除・再生成しない。**
  位置だけを書き換え、全体の再描画はドロップ時にまとめる。タッチの後続
  イベントはdocumentではなくタッチ開始要素に付けるのが確実。

### 3-21. 無限ループのCSSアニメーションが、表示中ずっとスタイル再計算を起こす
- **現象：** 停止中・操作なしでも、パフォーマンスモニターの「スタイル再計算/秒」が
  約100前後で張り付く（Controlパネルを開いている時、長い曲名の時）。
  レイアウト/秒は0。
- **原因：** `animation: ... infinite`の常時アニメーション。特にON状態の
  トグル（`.glow-switch`、Speed/Key/EQの3個）の明滅が`box-shadow`を
  動かしており、毎フレームのスタイル再計算＋再描画が発生していた。
  曲名のマーキー（transform）も、計測上は毎フレームの再計算を伴っていた。
  opacityに変えても、無限に動き続ける限り再計算は消えなかった。
- **解決（v2.16.3）：** 光(box-shadow)は固定の擬似要素に持たせてopacityだけを
  動かし、明滅は2回で止める（表示された時・ONにした時に再生される）。
  曲名マーキーは3周で止め、タイトルにマウスを乗せる/タップで再度流す
  （`replayAppTitleMarquee()`）。SPのアイコンバーのスクロールヒントも3回で停止。
  計測（Chrome、CDP Performance.getMetrics）で全パネル0回/秒を確認。
- **教訓：** **`infinite`のアニメーションを常時表示の要素に付けない。**
  必要なら回数を限定し、きっかけ（表示・操作）で再生し直す。
  特に`box-shadow`・`filter`・`background`等はアニメーションさせない。

## 4. データフロー・状態管理の要点

- **`playlist`配列**（`player-core.js`）: `{ file, name, title, artist,
  duration, enabled, favorite }`の配列。メモリ上の唯一の真実の情報源。
  並び順そのものが表示順・再生順を決める。
- **IndexedDB (`qnaudio_playlist_db` / `tracks`ストア、keyPath: `name`)**:
  `playlist`の永続化先。レコードは`{ name, type, blob, savedAt, enabled,
  title, artist, favorite }`。`savedAt`の昇順が読み込み時の並び順になる
  （`loadAllPlaylistTracks()`）。**`blob`フィールドは音声実体そのもので
  重い**（§3-5参照、書き込み時は要注意）。
- **プレイリストのメタデータ（v2.13.5〜）**: `localStorage`のキー
  `qn_playlist_meta_v1`に`{ ファイル名: { savedAt, enabled, title, artist,
  favorite } }`で保存。並び順・ON/OFF・表示名・お気に入りの変更はここだけに
  書き、IndexedDBのレコードは書き直さない（§3-11）。読み込み時はこちらが
  優先され、無い項目はIndexedDBレコード側の値（旧データ）を使う。
- **マーカーメモのプリセット自動カラー（v2.15.0〜）**: `localStorage`の
  `qn_marker_preset_colors_v1`に`{ プリセット名: 色キー|null }`で保存。
  未保存のプリセットは`MARKER_PRESET_COLOR_DEFAULTS`（player-markers.js）の
  初期配色を使う。色キーは`MARKER_COLOR_PALETTE`（=QN_THEMESのname）。
- **`openPlaylistDB()`**: DB接続はキャッシュされ使い回される
  （呼ぶたびに`indexedDB.open()`し直さない）。
- **`pins`配列**（`player-core.js`）: 現在再生中の曲のマーカー一覧。
  曲を切り替えると`loadFile()`内で`localStorage`（キー: `mp3_pins_<ファイル名>`）
  から都度読み直す。**IndexedDBではなくlocalStorage。**
- **テキストメモ**: `localStorage`のキー`mp3_text_<ファイル名>`。こちらも曲ごと。
- **`loopActiveMarkerIndex`** / **`isSeeking`**: ループ折り返し判定用の
  グローバル状態（§3-1, 3-2参照）。新しいシーク操作や区間変更操作を
  追加するときは必ずこの2つの整合性を意識する。
- **お気に入り（ピン留め）**: `track.favorite`フラグ。ONにした曲は
  `toggleTrackFavorite()`が`playlist`配列内で実際に「お気に入りグループの
  末尾」まで移動させる（表示だけのソートではない）。ドラッグ並び替えは
  このグループ分けを意識しないので、跨いで並び替えることも可能
  （再度ピンを押せばグループ境界に戻る、という仕様）。

---

## 5. AIアシスタントへの運用ルール

修正依頼を受けたら、着手前に以下を確認する。

0. **§3冒頭の早見表と§7のチェックリストを確認**: 報告された症状に近い行が
   早見表にあれば、その項目から読む。新しいUI・アニメーション・ポップアップ・
   音声/保存処理を書く場合は§7を一通り確認してから着手する。
1. **§2・§3を確認**: 依頼内容がSP版の見た目/挙動に関わる場合は§2を、
   ループ・シーク・削除・並び替え・インポート・CSSの表示順に関わる場合は
   §3の該当項目を必ず読み返してから着手する。
2. **「見た目」と「永続化」を分けて確認する**: プレイリスト・マーカー・
   設定を変更する機能を追加/修正する際は、「`playlist`/`pins`配列（メモリ）」
   「IndexedDB」「localStorage」のどれを更新すべきかを明確にし、
   更新漏れがないか（§3-4のような）を確認する。
3. **曲数が多い場合の負荷を意識する**: プレイリスト全曲に対してループする
   処理（保存・削除・エクスポート等）を書くときは、§3-5の教訓に従い、
   「音声実体（Blob/File）を含めて全曲分書き直していないか」を必ず自問する。
   全曲ループが必要な処理は、可能な限り「変更があった曲だけ」に絞るか、
   Blobを含まない軽量な更新にする。
4. **PC v2のDOM移植構造を壊さない**: `player-ui-pc-v2.js`の`build()`・
   `syncBottomBarPosition()`・`attachSelectionHandlers()`は、複数の
   グローバル状態・DOM順序の前提の上に成り立っている。新しいボタンや
   要素を下部バー/アイコンバー周辺に追加する場合、これらの関数も
   一緒に更新する必要がないか確認する。
5. **回帰を防ぐ**: 修正が§3の履歴にある領域と重なる場合、そのバグを
   再び作り込んでいないか（特に3-2・3-5・3-7のような「見えにくい」
   類の不具合）を意識して見直す。
6. **バージョン番号の更新とZIP化**: 修正のたびに`index.html`内の
   `window.QN_APP_VERSION`を更新し（機能追加はマイナー、バグ修正/微調整は
   パッチ）、全JS構文チェック・HTML構文チェック・CSS波括弧対応チェック・
   ID重複チェックを行ってからZIPを作成する。**同時に`CHANGELOG.md`の末尾に
   新バージョンの変更点を追記する**（書式は同ファイル冒頭のルール参照）。
7. **このドキュメント自体を毎回更新する**: 修正やバグ調査を1件終えるたびに、
   このファイルへの反映が必要かを確認し、該当すれば追記する。
   - §1（構成）: ファイルの新設・分割・統合・読み込み順の変更があった場合
   - §2（設計事実）: SP/PC表示の切り替え方式など、プロジェクト全体に
     関わる前提が変わった場合
   - §3冒頭の早見表: §3に項目を追加したら、症状→項目の行を1行足す
   - §7（落とし穴チェックリスト）: 実機でしか出ない種類の新しい教訓が
     得られたら、チェック項目として1行足す
   - §3（バグ履歴）: 「現象→原因→解決→教訓」が言えるバグを直した場合は、
     既存の項目群と同じ形式で新しい項目として追記する。似た系統の
     バグを見つけたが既存項目でカバーできる場合は、その項目に
     「関連事例」として追記するだけでよい（新規項目を乱立させない）
   - §4（データフロー）: 新しい状態変数・ストレージ（IndexedDB/localStorage
     の新しいキーやストア）・グローバル変数を追加した場合
   - §5（このルール自体）: 運用ルールとして繰り返し役立つ知見が
     得られた場合
   - §6（確認コマンド）: 毎回の検証手順に新しいチェック項目を
     加えるべきだと分かった場合
   - `PC_V2_FILE_INDEX.md`: `player-ui-pc-v2.js`や`style-layout-pc-v2.css`
     に新しい関数・セクションを追加/変更/削除した場合（同ファイル末尾の
     「目次の更新ルール」参照）。他のファイルが1000行を超えて育った
     場合は、同じ形式でセクションを追加してよい。
   - `DOM_ID_REFERENCE.md`: 新しいモーダル/パネル/機能ブロックのID群を
     追加した場合、該当グループに追記する。
   - `UI_TERMINOLOGY.md`: ユーザーの言葉とUI要素の対応で行き違いが
     起きた場合（無駄なやり取りが発生した場合）、その場で追記する。
   追記は該当セクションの末尾に、既存の項目と同じ見出しレベル・文体で
   行う。過去の記述を消すのは、実際に廃止された仕組みや誤りが判明した
   場合のみとし、通常は追記していく。反映を終えたら、更新後の
   `AI_ASSISTANT_PROJECT_CONTEXT.md`を毎回、最終成果物のZIPと一緒に
   出力する。

---

## 6. 毎回の検証コマンド（納品前チェックリスト）

修正が完了したら、ZIP化する前に以下を通す。曲数が多い環境を想定した
確認も含む。

```bash
# 1. 全JSファイルの構文チェック
for f in JS/*.js; do node --check "$f" 2>&1 | grep -v "^$" && echo "FAIL: $f"; done; echo "JS OK"

# 2. HTML構文チェック
python3 -c "
from html.parser import HTMLParser
class P(HTMLParser):
    def error(self, message): print('ERROR:', message)
p = P()
p.feed(open('index.html', encoding='utf-8').read())
print('HTML OK')
"

# 3. 全CSSファイルの波括弧対応チェック（テキスト置換ミスの検出に有効）
for f in CSS/*.css; do python3 -c "
content = open('$f', encoding='utf-8').read()
o, c = content.count('{'), content.count('}')
if o != c:
    print('MISMATCH in $f:', o, c)
"; done; echo "CSS check done"

# 4. HTML内のid重複チェック（新要素追加時のtypo検出）
grep -o 'id="[a-zA-Z0-9_]*"' index.html | sort | uniq -c | awk '$1>1'

# 5. JS側が参照するgetElementById("...")と、HTML側のid定義の突き合わせ
#    （新モーダル・新パネルを作った直後に特に有効。片方だけ書き忘れると
#    ここで拾える）
grep -o 'getElementById("[a-zA-Z0-9_]*")' JS/<対象ファイル>.js | sed 's/getElementById("//;s/")//' | sort -u
grep -o 'id="[a-zA-Z0-9_]*"' index.html | sed 's/id="//;s/"//' | sort -u
```

**§3-5のような「重い処理」系のバグは上記の静的チェックでは検出できない。**
プレイリスト全曲・全マーカーに対してループする新しいコードを書いた場合は、
チェックリストとは別に「このループは曲数に比例して音声Blobを書き直して
いないか」を必ずコードレビューする（§3-5、§5の運用ルール3番目参照）。

---

## 7. 重さ・端末特有の落とし穴チェックリスト（新機能を作る前に確認）

§3の教訓のうち、「静的チェックでは見つからず、実機でしか症状が出ない」
種類のものをまとめたもの。新しいUI・アニメーション・ポップアップ・
音声処理・保存処理を書くときは、着手前と納品前に一通り確認する。

**描画・負荷（PC/SP共通）**
- [ ] `requestAnimationFrame`ループを新設していないか。するなら、
  (1)間引けないか、(2)変化が無い時は描画をスキップしているか、
  (3)ループ内で`getBoundingClientRect`・`getComputedStyle`・配列/文字列の
  新規生成をしていないか（3-10）。PC v2はSPでも常に動く（§2）。
- [ ] `textContent`・`style.xxx`を定期的に書く処理は、値が変わった時だけ
  書いているか（3-16）。
- [ ] 全画面の要素や非表示の要素に`backdrop-filter`・`filter`・大きな
  `box-shadow`が残っていないか。非表示時は必ず`none`（3-16）。
- [ ] 無限アニメーション（`infinite`）を追加していないか。常時表示の要素には
  付けず、回数を限定する。動かすのは`transform`/`opacity`だけ
  （`box-shadow`等を動かさない）（3-21）。

**iOS Safari特有**
- [ ] タップで動く要素（とその子孫）に、`:hover`で`display`/`visibility`を
  変えるCSSを書いていないか。必要なら`@media (hover: hover) and
  (pointer: fine)`で囲む（3-14）。
- [ ] 音声Blobを含むIndexedDBレコードを書き直していないか。メタデータは
  localStorage（`qn_playlist_meta_v1`）へ（3-11）。
- [ ] `audio.play()`をユーザー操作のコールスタック内で同期的に呼んでいるか（3-3）。
- [ ] 再生用の`AudioContext`（`getAudioCtx()`）を、EQ/Speed/Keyを使う
  瞬間より前に作っていないか。デコードだけなら`OfflineAudioContext`（3-10）。

**デザインの統一**
- [ ] 新しいスタイルでpx値の角丸・文字サイズを直書きしていないか。
  §8のトークン（`--radius-*`・`--fs-*`・`--btn-h`）を使っているか。
- [ ] リストや設定項目を角丸の枠で囲んでいないか（線で区切る）。

**レイアウト・ポップアップ**
- [ ] 下段バー（SPで横スクロール）の中にポップアップを置いていないか。
  置くなら`document.body`直下＋`position: fixed`（3-15）。
- [ ] 行の中に一時的なUI（入力補助・プリセット等）を足して、リストの行
  高さを変えていないか。ポップアップにする（3-18）。
- [ ] ドラッグ中に、つかんでいる要素を`innerHTML`やrender関数で
  作り直していないか。位置だけ更新し、再描画はドロップ時に（3-20）。
- [ ] ドラッグ・スライダーはPointer Events（マウス/タッチ両対応）か。
  `mousedown`だけになっていないか（3-15）。
- [ ] パネルに新しい実体（使い回す中身）を追加したら、`stashPanelContents()`
  の対象にも加えたか。非表示中もdocument内に置かないと、裏での更新が
  空振りする（3-19）。
- [ ] markers/playlist共通セレクタのCSSを変えるとき、両パネルのタップ判定
  （`.pin-del-zone`/`.playlist-del-zone`）を壊していないか（3-12）。

**音声・状態**
- [ ] 再生中の音声経路を差し替える処理で、切り替え開始〜完了の間に
  `await`を挟んでいないか（3-17）。
- [ ] 曲名キーで保存するデータ（マーカー・テキスト等）を、曲切替と同じ
  瞬間に同期で読み込んでいるか（3-13）。

---

## 8. UIデザインの統一ルール（v2.16.0〜）

角丸・文字サイズ・ボタン寸法は`style-core.css`の`:root`にトークンとして
定義してある。**パネル内・ポップアップ・ボタン・入力欄に新しいスタイルを
書くときは、px値を直書きせず必ずトークンを使う。**

| 用途 | トークン | 値 |
|---|---|---|
| 文字入りボタン・チップ・トグル・ステッパー・バッジ・セグメント | `--radius-pill` | 999px（左右が完全な半円） |
| アイコンだけのボタン | `--radius-round` | 50% |
| 入力欄・テキストエリア・ドロップゾーン | `--radius-field` | 10px |
| ポップアップ・ドロップダウン・カード | `--radius-popup` | 14px |
| モーダル | `--radius-modal` | 20px |
| パネル見出し | `--fs-title` | 20px |
| セクション見出し（SPEED/KEY/EQUALIZER等） | `--fs-heading` | 15px |
| リストの主テキスト・入力欄・行ラベル | `--fs-body` | 14px |
| 補足・説明・サイズ表示・アーティスト名 | `--fs-small` | 12px |
| EQ目盛り・バッジ等の極小表示 | `--fs-micro` | 11px |
| 二次ボタン（RESET・プリセット・全選択等） | `--fs-btn` / `--btn-h` / `--btn-pad-x` | 12px / 30px / 14px |
| 主ボタン（DOWNLOAD/IMPORT/ADD AUDIO等） | `--fs-btn-primary` | 14px |
| 二次ボタンの枠線 | `--border-strong` | rgba(255,255,255,0.14) |

- **リストの行・パネル内の区切りは角丸の枠を使わず、線（`--border-subtle`）で
  区切る。** カード状の箱で囲まない。
- **例外（意図的にルール外）：** 下部コントロールバー（`#pcV2BottomBar`内、
  よく使う・アイコンだけでは分かりにくい所は文字入り・大きめ）、アイコンバーの
  ラベル、ロゴ・スプラッシュ、波形上のマーカーラベル、テキストのフルスクリーン
  表示、料金モーダルの大見出し、スライダーのトラックやスクロールバー等の
  2〜4pxの細部。
- **テーマ色（`--accent-primary`）で塗るもの（v2.16.4〜）：** フローティング
  ボタン（`.panel-fab-btn`＝ADD AUDIO/ADD MARKER/EDIT/Fullscreen等）の背景と、
  パネル見出し（`.pcv2-panel-header-title`）の文字。EDITの編集中(OK、`.active`)は
  「白地＋テーマ色の文字」に反転して区別する。Deleteは常に赤（`--danger`）。
- **アイコンボタンの色（v2.16.5〜）：** SVGは`fill: currentColor`にして、線と塗りを
  同じ色（ボタンの`color`）で決める（fillだけ固定色にすると、線と塗りを併用する
  アイコンで色が混ざる）。下段バーの状態を持つボタンは「通常＝`--icon-muted`、
  ON/表示中＝`--accent-primary`」で統一（Speed/Key/EQは`:not(.effect-off)`、
  Volumeは`.is-open`）。ホバーの明色化はマウス環境限定。
- **シークバー（`#pcV2WaveArea .vbar`）の高さは固定値・vhで指定しない。**
  `#vbarContainer`が波形エリアの残り高さを受け取り、6本で等分する（flex、
  min/max-heightで上下限のみ指定）。高さ変化時のcanvas再描画は
  `player-ui-pc-v2.js`のResizeObserverが担当（v2.16.1〜）。
- 汎用セレクタ（`.playlistItem button`・`.pinItem button`は丸ボタン指定）より
  個別のボタンを優先させたい時は、`.playlistItem .playlist-skip-toggle`のように
  親クラスを前置して詳細度を上げる。
