# QN-PLAYER 大型ファイル目次

`player-ui-pc-v2.js`（約2000行）と`style-layout-pc-v2.css`（約1800行）は、
PC v2 UIの全てを担う最大の2ファイル（`AI_ASSISTANT_PROJECT_CONTEXT.md`§2参照）。
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

## CSS/style-layout-pc-v2.css

このファイルは**メディアクエリを含まない基本ブロック（PC幅想定、
0〜1442行付近）**と、**ファイル末尾の`@media screen and (max-width: 900px)`
ブロック（1443行以降、SP幅上書き）**の2部構成。同じセレクタが両方に
出てくることが多く（例: `#pcV2BottomBar`）、SP幅での見た目を変えたい
ときは末尾ブロック側を探すこと。

### 基本ブロック（PC幅、メディアクエリなし）
- `#pcV2Root` / `#pcV2Layout` — 全体の入れ物。PC幅では`#pcV2Layout`は
  `display: grid`（3カラム）、SP幅では`display: flex; flex-direction: column`
  に切り替わる（§2の3カラム⇔縦積みの要）。
- `#pcV2TimeRow` — 時刻表示行。PC幅では`display: none`（SP幅でのみ表示）。
- `#pcV2IconBar` / `.pcv2-icon-item` — 左の縦アイコンバー（サイドメニュー）。
- `#pcV2Panel` / `#pcV2PanelHeader` / `#pcV2PanelFab` — 中央パネルの
  ヘッダー・FAB（＋ボタン）。
- `#pcV2PanelBody` 配下 — Markers/Playlistの削除選択UI
  （`.del-btn` / `.playlist-del-zone` / `.pcv2-selected` /
  `.pcv2-row-deleting`、§3-4・3-7・フェードアウト演出関連）、
  Export系モーダルの共通スタイル（`.export-*`、§3-8のモーダル共通化）。
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
- `.tripleNavBtn-third` / `.tripleNavBtn-center` / `.loopbtn` の
  SP幅での拡大（タップ領域・アイコンサイズ、アイコンバーと揃える調整）。
- `#pcV2BottomBar` と `#pcV2IconBar` の境界線・余白（アプリ切り替え
  誤操作防止マージンは`#pcV2IconBar`の`padding-bottom`側、その「上」に
  区切り線がある構成）。
- `.pcv2-ctrl-btn`（EQ/Speed/Key等）のSP幅拡大。

---

## 目次の更新ルール

`AI_ASSISTANT_PROJECT_CONTEXT.md`と同様、この目次も更新対象。
- `player-ui-pc-v2.js` / `style-layout-pc-v2.css` に新しい関数・
  新しいセクションを追加した場合は、該当する見出しの下に一行追記する。
- 既存の関数名・セレクタ名を変更/削除した場合は、該当行を修正する
  （放置すると目次自体が誤誘導になるため、これは他ファイルより優先度高）。
- 他のファイルが同程度の規模（1000行超）に育った場合は、同じ形式で
  このファイルにセクションを追加してよい。
