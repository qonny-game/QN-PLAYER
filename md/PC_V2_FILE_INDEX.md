# QN-PLAYER 大型ファイル目次

`player-ui-pc-v2.js`（約2200行）・`style-layout-pc-v2.css`（約1500行、
PC v2のシェル＝外枠）・`style-pcv2-panels.css`（約910行、PC v2の中央パネルの
中身）は、PC v2 UIの全てを担う最大の3ファイル
（`AI_ASSISTANT_PROJECT_CONTEXT.md`§2参照）。
中身を探すたびにスクロールして迷子にならないよう、処理のまとまりごとに
行番号の目安をリストにしておく。**行番号はファイルが編集されるたびにズレるので、
目安として使い、まず`grep -n`で見出しのキーワードを検索して実際の行を確認すること。**

---

## JS/player-ui-pc-v2.js

### 骨組みの構築（起動時に1回）
- `build()` — DOM骨組み全体を組み立てるメイン関数。アイコンバー
  （`ICON_ITEMS`配列）・パネル・波形エリア・下段バー・PLAY/MARKERアンカー
  タブを生成し、既存の`.app-container`直後に挿入する。**新しいサイドメニュー
  項目、新しい下段バーのボタンを追加する起点はここ。**
- `el(html)` — HTML文字列から1個のDOM要素を作る小さなヘルパー。
- `setupVolumeControl()` — 音量スライダーの初期化。v2.14.0〜ポップアップを
  `document.body`直下へ移して`position: fixed`で表示、Pointer Eventsで
  マウス/タッチ両対応（§3-15）。
- `initPanels()` — Control/Markers/Library/Text等、各パネルの中身の
  初期構築。

### レイアウト同期（SP⇔PC幅切り替え時にも呼ばれる）
- `syncBottomBarPosition()` — 下段バー(`#pcV2BottomBar`)とPLAY/MARKER
  アンカータブ(`#pcV2BottomBarAnchorTabs`)を、SP幅では`#pcV2Layout`内
  （アイコンバーの直前）へ、PC幅では`#pcV2Root`直下へDOM移動する。
  **新しい要素を下段バー周辺に追加したときは、ここも一緒に見直すこと**
  （`AI_ASSISTANT_PROJECT_CONTEXT.md`§2参照）。
- `syncTimeRowPosition()` — 時刻表示行(`#pcV2TimeRow`)のDOM位置調整。
- `updateIconBarScrollHint()` / `setupIconBarScrollHint()` — アイコン
  バーが横スクロール可能なことを示す右端の矢印ヒント。
- `updatePcv2BottomBarsHeightVar()` — 下段バー・アイコンバーの高さを
  CSS変数に反映（波形エリアのpadding計算等で使用）。

### パネル開閉・切り替え
- `handleIconClick(item)` — サイドメニューのアイコンをクリックした時の
  分岐（`panelType`が`"action"`（Add File）/ `"close"`のみ特別扱い、
  それ以外は`openPanelOverlay()`へ）。**新しいサイドメニュー
  項目のクリック挙動を足す/変えるのはここ。**
- `window.qnPcv2DismissAuxPanel()` — Backup/Importパネルを閉じる
  （SP幅：オーバーレイを閉じる、PC幅：Libraryパネルへ切替）。
  `player-track-backup.js`の`closeTrack*Modal()`から呼ばれる（v2.14.0〜）。
- `openPanelOverlay(panelId)` / `closePanelOverlay()` — パネルの
  開閉（SP幅ではオーバーレイ表示）。
- `getPanelStash()` / `stashPanelContents(panelBody)` — パネル切替時、
  使い回す中身を`#pcV2PanelStash`（document内の非表示div）へ退避する
  （v2.15.1〜、§3-19）。**パネルに新しい実体を足したら対象リストに追加。**
- `switchPanel(panelId)` — パネルの中身をControl/Markers/Library/Text/
  Export/Backup/Import等に切り替える（Backup/Importはv2.14.0〜、Exportと
  同じく「モーダルを開く→外枠のopenを外す→body/footerをパネルへ移す」）。**このファイル最大の関数の1つ。新しいパネル
  種別を足す場合はここに分岐が要る。**

### 編集モード（EDIT）・削除選択
- `toggleEditMode(panelId)` — Markers/PlaylistパネルのEDITモードON/OFF。
- `attachDisableGuard(panelId)` — 通常モード中、編集系ボタンのクリックを
  無効化するガード。
- `getListContainer(panelId)` / `getRowItems(panelId)` — 現在の
  Markers/Playlist一覧のDOMコンテナ・行要素を取得する共通ヘルパー。
- `attachSelectionHandlers(panelId)` — **削除選択（丸チェック）の
  実処理。`.del-btn`/`.playlist-del-zone`のクリックをキャプチャフェーズで
  奪う張本人**（`AI_ASSISTANT_PROJECT_CONTEXT.md`§3-7参照）。
- `clearSelectionVisuals(panelId)` — 選択状態のクリア（見た目・内部状態
  両方）。
- `deleteSelectedItems(panelId)` — 削除確定ボタンが呼ぶ。フェードアウト
  演出を先に掛けてから、`performDelete`で実データを消す
  （§3-4・3-5関連、IndexedDB書き込みの重さに注意）。

### 下段バーのエフェクトボタン（Speed/Key/EQ等のON/OFF同期）
- `appendEqDivider(container)` / `toggleBottomBarEffect(id, btn)` /
  `syncBottomBarEffectButton(id, btn)` / `syncAllBottomBarEffectButtons()` /
  `setupControlPanelEffectSync()` — Controlパネル内のトグルと、下段バー
  上の対応するボタンの見た目を同期させる一連の処理。

### Textパネル・QN Seriesメニュー連携
- `setupTextPanelHeaderControls()` — Textタブのヘッダー操作。
- `qnSectionSelector(panelId)` / `tryClaimQnSections()` /
  `renderQnMenuSectionPanel(panelId, panelBody)` — `player-theme.js`側の
  Keyboard Shortcuts/Colorセクションを、PC v2のパネルとして表示するための
  連携処理。

### SP⇔PC幅切り替えのDOM退避・復元
- `markAnchor(key, elmt)` / `restoreAnchor(key, elmt)` — PC v2構築時に
  元の位置を退避し、後で元に戻すための汎用ペア関数。
- `activate()` / `deactivate()` / `sync()` — PC v2全体のON/OFF切り替え。
  **`PC_BREAKPOINT`が常時trueのため、実質`deactivate()`は呼ばれない**
  （§2参照）。

### 波形描画
- `pcv2DrawWaveform(force)` — PC v2波形エリアでの波形バー描画本体。
  状態の署名が前回と同じなら描画をスキップする（v2.13.4〜、§3-10）。
- `pcv2MeasureRows()` — 6行分のcanvasサイズ計測（resize/曲読込時のみ）。
- `pcv2MarkersSig()` / `pcv2RgbaFor()` — 変化検知用署名・色文字列キャッシュ。
- `hexToRgbaLocal(hex, alpha)` — 色変換の小さなヘルパー。
- `pcv2WaveLoop()` — 波形の再生位置ハイライトを更新する
  `requestAnimationFrame`ループ。`PCV2_WAVE_INTERVAL_MS`（100ms）間隔に間引き。

### 旧SP→PC v2フラット化（大手術の名残）
- `flattenForPc()` / `restoreForSp()` / `syncTopControlsLayout()` —
  「大手術」（`AI_ASSISTANT_PROJECT_CONTEXT.md`のqnplayer-pc-v2-appメモリ
  参照）以前の旧SP版レイアウトをPC v2構造へ畳み込む処理。現在はPC v2が
  常時activeなため実行経路は限定的だが、`#topControls`内のボタン構成
  （Play系/Marker系グループ）を扱う数少ない箇所でもあるため、Play/Marker
  ボタンの並び順・グルーピングを変えるときは目を通す価値がある。

---

## CSS/style-layout-pc-v2.css（シェル＝外枠）

PC v2の外枠（アイコンバー・波形エリア・下部バー・Volumeポップアップ・
ヘッダーナビ・3カラムグリッド・SP幅の縦積みレイアウト）専用。
中央パネル（`#pcV2PanelBody`）の中身は`style-pcv2-panels.css`側
（分割の経緯は`CSS_SPLIT_INSTRUCTIONS.md`）。

このファイルは**メディアクエリを含まない基本ブロック（PC幅想定、
0〜1140行付近）**と、**ファイル末尾の`@media screen and (max-width: 900px)`
ブロック（1140行以降、SP幅上書き）**の2部構成。同じセレクタが両方に
出てくることが多く（例: `#pcV2BottomBar`）、SP幅での見た目を変えたい
ときは末尾ブロック側を探すこと。

### 基本ブロック（PC幅、メディアクエリなし）
- `#pcV2Root` / `#pcV2Layout` — 全体の入れ物。PC幅では`#pcV2Layout`は
  `display: grid`（3カラム）、SP幅では`display: flex; flex-direction: column`
  に切り替わる（§2の3カラム⇔縦積みの要）。
- `#pcV2TimeRow` — 時刻表示行。PC幅では`display: none`（SP幅でのみ表示）。
- `#pcV2IconBar` / `.pcv2-icon-item` — 左の縦アイコンバー（サイドメニュー）。
- `#pcV2Panel`（外枠単体。ヘッダー・FABは`style-pcv2-panels.css`側）。
- `#pcV2WaveArea` — 右の波形エリア。`#pcV2WaveAddAudioBtn`（+ADD AUDIO）
  もこの中。
- `#pcV2BottomBarAnchorTabs` / `.pcv2-anchor-tab` — PLAY/MARKERアンカー
  タブ（基本ブロックでは`display: none`、SP幅ブロックで表示に切り替わる）。
- `#pcV2BottomBar` 配下 — 下段固定コントロールバー。`.pcv2-ctrl-group` /
  `.tripleNavBtn-third` / `.tripleNavBtn-center` / `.loopbtn` /
  `.loop-preroll-control`（プリロール秒数ステッパー、§3-1関連）。
- ヘッダー（QN Seriesドロップダウン等）関連。

### SP幅ブロック（`@media screen and (max-width: 900px)`、ファイル末尾）
- `#pcV2Layout` の`flex`化（3カラム→縦積み）。
- `#pcV2WaveArea` / `#pcV2BottomBarAnchorTabs` / `#pcV2TimeRow` /
  `#pcV2BottomBar` / `#pcV2IconBar` の**表示順（`order`プロパティ）**。
  **`order`は整数のみ有効**（§3-6）。現在の採番は
  `waveArea:1 → timeRow:2 → anchorTabs:3 → bottomBar:4 → iconBar:5`。
  間に新しい要素を挟みたい場合は、既存の番号をずらすか、初めから
  10刻み等の余裕を持った採番に変更することを検討する。
  （このSP幅ブロックの中身はシェル関連のセレクタのみ。パネルの中身に
  関するセレクタは1つも含まれないことを分割時に確認済み。）
- `.tripleNavBtn-third` / `.tripleNavBtn-center` / `.loopbtn` の
  SP幅での拡大（タップ領域・アイコンサイズ、アイコンバーと揃える調整）。
- `#pcV2BottomBar` と `#pcV2IconBar` の境界線・余白（アプリ切り替え
  誤操作防止マージンは`#pcV2IconBar`の`padding-bottom`側、その「上」に
  区切り線がある構成）。
- `.pcv2-ctrl-btn`（EQ/Speed/Key等）のSP幅拡大。

---

## CSS/style-pcv2-panels.css（中央パネルの中身）

PC v2の中央パネル（`#pcV2PanelBody`）に表示される中身専用。
`@media`は不要（SP幅でもパネルの中身自体のCSSは変わらないため）。
パネルの種類によって表示・非表示が切り替わる/中身が変わる要素は
基本的にこちら（判定基準は`CSS_SPLIT_INSTRUCTIONS.md`§2参照）。

- `#pcV2PanelHeader` / `.pcv2-panel-header-title` — パネル見出し
  （CONTROL/MARKERS/LIBRARY/TEXT等の文字、テーマ色に連動、§v2.16.4）。
- `#pcV2PanelFab` / `.panel-fab-btn` / `.panel-fab-delete-btn` — 右下
  フローティングアクションボタン（ADD AUDIO/ADD MARKER/EDIT等）。
- `#pcV2PanelBody` 配下 — Markers/Playlistの削除選択UI
  （`.del-btn` / `.playlist-del-zone` / `.pin-del-zone` / `.pin-edit-btn` /
  `.pcv2-selected` / `.pcv2-row-deleting`、§3-4・3-7・フェードアウト
  演出関連）。
- `#pcV2PanelBody.pcv2-panel-markers` / `.pcv2-panel-import` /
  `.pcv2-panel-backup` / `.pcv2-panel-text` / `.pcv2-panel-color` —
  各パネル種別ごとのコンテンツスタイル。
- Export/Import/Backup系モーダルの共通スタイル（`.export-*` /
  `.track-backup-*` / `#trackBackupSizeAudio` / `#trackImportCancelBtn`、
  §3-8のモーダル共通化）。
- `.pcv2-control-eq-heading` / `.pcv2-section-divider` /
  `.pcv2-eq-heading-row` — Control/EQパネルの見出し・区切り線。
- `#pcV2PanelBody`の基本ルール（`overflow-y: auto`等）とスクロールバー
  カスタマイズ（`::-webkit-scrollbar*`）。

---

## 目次の更新ルール

`AI_ASSISTANT_PROJECT_CONTEXT.md`と同様、この目次も更新対象。
- `player-ui-pc-v2.js` / `style-layout-pc-v2.css` / `style-pcv2-panels.css`
  に新しい関数・新しいセクションを追加した場合は、該当する見出しの下に
  一行追記する。
- 既存の関数名・セレクタ名を変更/削除した場合は、該当行を修正する
  （放置すると目次自体が誤誘導になるため、これは他ファイルより優先度高）。
- 他のファイルが同程度の規模（1000行超）に育った場合は、同じ形式で
  このファイルにセクションを追加してよい。


---

## JS/qn-apps.js / JS/qn-app-youtube.js / CSS/style-apps.css（v2.17.0〜）

アプリ名バッジ(＞)＋アプリ一覧フライアウト・アプリ表示領域と、その第1号のYouTubeアプリ（v3.0.0でMORE/BACK・`.qn-apps-mode`は撤去）。
`player-ui-pc-v2.js`の`build()`が作った`#pcV2IconBar`に**後から**項目を差し込む
方式（MutationObserverで出来上がりを待つ）。`player-ui-pc-v2.js`自体は変更していない。

- `QNApps.register({id,label,icon,order,ready,mount,onShow,onHide})` — アプリ登録。
- `QNApps.open(id)` / `QNApps.close()` — アプリの表示/非表示。`close()`で本体へ戻る。
- `layoutHost()` — `#qnAppHost`(position:fixed)の位置を`#pcV2Layout`と`#pcV2IconBar`
  の実測から決める。PC幅=アイコンバーの右〜下端、SP幅=ヘッダー直下〜アイコンバー直上。
- サイドバーの切替は`#pcV2IconBar.qn-app-sidebar`（アプリ表示中、`.qn-appside-item`とバッジとColorのみ表示）のCSSで行う。
  選択中は`.qn-app-active`（本体側JSが`.active`を外してしまうため別クラス）。
- **アプリ一覧フライアウト（v3.0.0〜）：** `#qnAppBadge`（サイドバー先頭、右端に＞）が入口。
  `ensureFlyout()`が`#qnAppFlyout`（body直下・position:fixed・hidden）を作り、`renderAppItems()`が`.qn-flyout-item`を並べる。
  `positionFlyout()`＝PC幅はバッジと同じ高さでサイドバーの右に重ねる／SP幅(≤900px)はアイコンバーの真上に横並び(`.qn-flyout-sp`)。
  `openFlyout()/closeFlyout()`（バッジに`.qn-badge-open`と`aria-expanded`）。PC(hover可・fine pointer)はホバーで開き、離れて160ms後に閉じる（クリックでも開く）。
  SP/タッチはバッジのタップで開閉。閉じる経路は`bindFlyoutGlobal()`（外側pointerdown・Esc・他のサイドバー項目クリック・アイコンバーのスクロール・resize再配置・orientationchange）と、項目選択・`close()`・Colorボタン。

### v2.18〜v2.23 の追記（アプリまわり）

**JS/qn-apps.js**
- `initColorKeeper()` — Colorボタン(`#pcV2IconBarBottom`内)のクリックをキャプチャ段階で受け、アプリ表示中/一覧中は
  `openColorPop()`/`closeColorPop()`でテーマ切替セクション(`.qn-menu-section[data-qn-section="theme"]`)を
  `#qnColorPop`へ借りて表示→閉じたら元の場所へ戻す。`positionColorPop()`が位置決め
  （PC=アイコンバー右の左カラム全高・幅375px / SP=`[data-qn-keep-visible]`の下〜アイコンバー直上）。
  他のサイドバー項目・Esc・Color再押下で閉じる。`close()`でも閉じる（Colorを開く時はフライアウトを閉じる）。
- アプリ名バッジ`#qnAppBadge`（サイドバー先頭。v3.0.0〜押す/ホバーでフライアウト）、`QNApps.toast()`、`QNApps.setSideActive()`、`QNApps.layout()`。

**JS/qn-app-youtube.js**（約1700行・機能ごとの目安）
- データ: `loadItems/saveItems/findItem/findMarker/persistMarkers/persistLoop/sortMarkers`
- プレイヤー: `requestApi/createPlayer/openVideo/pausePlayer/seekTo/applyDesiredRate/renderSpeed/handleEnded(SKIP対応)/playerMostlyVisible`
- シークバー・マーカー: `buildTracks/positionMarker/fillMarkerLabel/attachMarkerDrag/attachTrackSeek/jumpMarker`
- Library: `renderList/playItem/attachReorder`、EDIT系: `updateFab/setEditMode/toggleEdit/toggleSelect/deleteSelected`
- Markers: `renderMarkers/startMemoEdit(プリセットチップ)/markerColorHex/markerText/addMarkerHere`
- チャプター貼り付け: `parseChapters/addChapters`
- Backup/Import: `renderBackupList/downloadBackup/normalizeImport/loadImportFile/runImport/bindBackupImport`
- 未使用(残置): `startInlineEdit`, `armDelete`

**JS/qn-wakelock.js** — `QNWake.set(key,on)`。audio再生/一時停止/終了をフック、visibilitychangeで再取得。

**JS/player-markers.js** — カスタムプリセット: `loadMarkerCustomPresets/saveMarkerCustomPresets/getValidMarkerCustomPresets/getAllMarkerPresetLabels`、
`renderMarkerPresetColorSettings`がカスタム入力行(`.qn-marker-custom-input`/`-del`)を生成。

**CSS/style-apps.css** — セクション: サイドバー(アプリ一覧/アプリ中) / `#qnAppHost` / YouTubeレイアウト(PC・SP) /
シークバー(`.qn-yt-track.vbar`等) / Library・Markers(`[data-edit]`・FAB・del-zone) / チャプター(`.qn-yt-chapter*`) /
`#qnColorPop`（Colorパネル）。
