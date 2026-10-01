# QN-PLAYER DOM要素ID一覧

`index.html`に静的に書かれているIDと、JS側（主に`player-ui-pc-v2.js`）が
実行時に動的生成するIDを分けて整理する。「このIDどこで定義/参照してる？」
を`grep`し直す手間を省くための一覧。**新しいID群を追加したら、該当する
グループの末尾に追記すること。**

---

## 静的ID（`index.html`に直接書かれている）

### Backupモーダル（`trackBackup*`、`player-track-backup.js`が制御）
※v2.14.0〜、PC v2では外枠（Overlay/✕）は使わず、`.export-modal-body`と
`.export-modal-footer`だけをサイドメニューの「Backup」パネルへ移して表示する
（Exportパネルと同じ方式）。
| ID | 役割 |
|---|---|
| `trackBackupModalOverlay` | モーダル全体のオーバーレイ |
| `trackBackupModalCloseBtn` | ✕閉じるボタン |
| `trackBackupCancelBtn` | Cancelボタン |
| `trackBackupRunBtn` | Downloadボタン |
| `trackBackupStatus` | エラー/状態メッセージ表示 |
| `trackBackupTrackList` | 曲選択リストのコンテナ |
| `trackBackupSelectAllBtn` / `trackBackupSelectNoneBtn` | 全選択/全解除 |
| `trackBackupSelectedCount` | 「N曲選択中」表示 |
| `trackBackupTotalSize` | 合計ファイルサイズ表示 |
| `trackBackupOptionsSection` / `trackBackupOptionsToggle` / `trackBackupOptionsSummary` / `trackBackupOptionsBody` | 含める項目の折りたたみ一式（v2.15.1〜、`.is-open`で展開） |
| `trackBackupSizeAudio` / `…Title` / `…Artist` / `…MarkerPos` / `…MarkerMemo` / `…Text` | 含める項目の各行右端の推定サイズ（v2.15.1〜） |
| `trackBackupIncludeAudio` / `trackBackupIncludeTitle` / `trackBackupIncludeArtist` / `trackBackupIncludeMarkerPos` / `trackBackupIncludeMarkerMemo` / `trackBackupIncludeText` | 含める項目チェックボックス6種 |

### Importモーダル（`trackImport*`、`player-track-backup.js`が制御）
※v2.14.0〜、Backupと同様にサイドメニューの「Import」パネルとして表示。
`trackImportCancelBtn`は`data-mode`（`cancel`/`back`）を持ち、パネル内では
`cancel`の時だけ非表示になる。
| ID | 役割 |
|---|---|
| `trackImportModalOverlay` | モーダル全体のオーバーレイ |
| `trackImportModalCloseBtn` | ✕閉じるボタン |
| `trackImportCancelBtn` | Cancel/Back兼用ボタン（§動的挙動は`updateTrackImportCancelBtnMode()`） |
| `trackImportRunBtn` | Import/Close兼用ボタン（`setTrackImportRunBtnMode()`で切替） |
| `trackImportStatus` | エラー/状態メッセージ表示 |
| `trackImportLayout` | Importタブ全体のレイアウトコンテナ |
| `trackImportDropZone` | ドロップゾーン（未読込時） |
| `trackImportFileInput` | `<input type="file">`本体 |
| `trackImportLoadedInfo` / `trackImportLoadedFileName` / `trackImportLoadedFileCount` | 読込済み表示（ドロップゾーンと排他） |
| `trackImportDuplicateList` / `trackImportDuplicateRows` | 重複曲リストのコンテナ |
| `trackImportBulkToggle` / `trackImportBulkToggleLabel` | 一括上書き/スキップトグル |
| `trackImportSummary` | インポート完了後のサマリー表示 |
| `trackBackupPaneImport` | （命名注意：`trackBackup`だがImportモーダル内。Backup/Import分離前の名残） |

### 下段コントロール（`player-controls.js`等が制御、静的HTML）
| ID | 役割 |
|---|---|
| `playToggle` | Play/Pauseボタン（`.tripleNavBtn-center`） |
| `prevTrackBtn` / `nextTrackBtn` | 曲送りボタン |
| `playbackTripleBtn` | 上記3つを束ねるコンテナ |
| `prevMarkerBtn` / `nextMarkerBtn` | マーカー送りボタン |
| `loopToggleBtn` | Loopトグル |
| `loopPreRollControl` / `loopPreRollMinus` / `loopPreRollPlus` / `loopPreRollValue` / `loopInfo` | プリロール秒数ステッパー一式 |
| `playlistBox` / `playlistInfo` | プレイリスト一覧コンテナ・情報表示 |

### その他の主要グループ
- `eq*`（27個）: EQ（5バンドイコライザー）関連、`player-control-eq.js`。
- `control*`（23個→v3.6.0で`controlSpeedDownBtn`/`controlSpeedUpBtn`を追加）: Speed/AutoSpeed/Key関連、`player-controls.js`。`controlSpeedEnableToggle`/`controlKeyEnableToggle`はv3.6.0からスイッチではなく「アイコンボタン(role=switch, aria-checked)」で、`.control-stepper`内に`[アイコン][−][＋]`で並ぶ（Speed=5%刻み、Key=1刻み。`controlKeyDownBtn`/`controlKeyUpBtn`もラベル行へ移動し、下のバーは表示のみ）。
- `export*`（21個）: 現在曲の範囲書き出し、`player-export.js`。
- `user*`（10個）: シェアウェア/課金関連、`player-shareware.js`。
- `qn*`（8個）: ハンバーガーメニュー（`#qnMenuMount`配下）、`player-theme.js`。
- `sw*`: シェアウェア制限のカウンター表示等。
- `note*`: Textタブのメモ機能、`player-text.js`。
- `splash*`: 起動スプラッシュ画面。
- `wave1`〜`wave6` / `vbar*`: 波形バー本体（6分割）。
- `appTitle` / `appTitleInner` / `appTitleText`: 曲名・アーティスト表示
  （PC v2構築時に`#pcV2WaveArea`内へ移動される、`AI_ASSISTANT_PROJECT_CONTEXT.md`§2参照）。

---

### Colorパネル内：マーカーメモの自動カラー設定（v2.15.0〜）
| ID | 役割 |
|---|---|
| `qnMarkerPresetColorRows` | プリセットごとの色設定行の入れ物（`renderMarkerPresetColorSettings()`、player-markers.jsが中身を生成） |

## 動的ID（`player-ui-pc-v2.js`が実行時に生成、`index.html`には存在しない）

PC v2の骨組み要素は全てJSの`build()`関数（`PC_V2_FILE_INDEX.md`参照）内で
`el()`ヘルパーを使って作られる。**`grep`で`index.html`を探しても見つからない
ので注意。**

| ID | 役割 |
|---|---|
| `pcV2Root` | PC v2全体の最上位コンテナ |
| `pcV2Layout` | 3カラム（PC幅）/縦積み（SP幅）レイアウト |
| `pcV2IconBar` | 左の縦アイコンバー（サイドメニュー） |
| `pcV2IconBarScrollHint` / `pcV2IconBarSpacer` / `pcV2IconBarBottom` | アイコンバー付随要素 |
| `pcV2Panel` / `pcV2PanelHeader` / `pcV2PanelBody` / `pcV2PanelFab` | 中央パネル一式 |
| `pcV2PanelStash` | 非表示中のパネルの中身の退避場所（body直下、display:none。v2.15.1〜） |
| `pcV2WaveArea` / `pcV2WaveFabRow` / `pcV2WaveAddAudioBtn` / `pcV2WaveAddMarkerBtn` | 波形エリア・右下ボタン列（v2.14.0〜横並び）・+ADD AUDIO・+ADD MARKER |
| `pcV2TimeRow` | 時刻表示行（SP幅限定） |
| `pcV2BottomBar` | 下段固定コントロールバー（PC幅v3.13.0〜：`#pcV2Layout`の子、右カラム下端。SP幅はアイコンバー直上） |
| `pcV2Layout.pcv2-collapsed` | PC幅でパネルを格納中のクラス（v3.14.0〜。localStorage `qn_panel_collapsed`） |
| `pcV2WaveHead` | PC幅の波形エリア先頭行（左＝`#appTitle`、右＝時刻表示。v3.15.0〜） |
| `pcV2BottomBarGroupRight` | 下段バー右グループ（Volume/Speed/Key/EQ）。狭いPC幅では非表示 |
| `pcV2BottomBarAnchorTabs` | PLAY/MARKERアンカータブ |
| `pcV2BottomBarGroupPlay` / `pcV2BottomBarGroupMarker` | 上記タブのスクロール先ターゲット（`.pcv2-ctrl-group`に付与） |
| `pcV2DeleteSelectedBtn` | 削除選択の確定ボタン（`#pcV2PanelHeader`内） |
| `pcV2StartBtn` / `pcV2AddMarkerBtn` | Startボタン・+Markerボタン |
| `pcV2LibraryAddFileBtn` | Libraryパネル内のADD FILEボタン |
| `pcV2TextEditBtn` / `pcV2TextControlsHolder` | Textパネル関連 |
| `pcV2VolumeBtn` / `pcV2VolumePopup` / `pcV2VolumeFill` / `pcV2VolumeThumb` | 音量ポップアップ一式（v2.14.0〜`pcV2VolumePopup`は`document.body`直下へ移動、`position: fixed`） |
| `pcV2HeaderNav` / `pcV2HeaderNavTrigger` | ヘッダーのQN Seriesドロップダウン |

---

## 一覧の取り直し方（このファイルが古くなったとき）

```bash
# 静的ID（index.html）の全リスト
grep -o 'id="[a-zA-Z0-9_]*"' index.html | sed 's/id="//;s/"//' | sort

# 動的ID（player-ui-pc-v2.js内でel()に渡されるHTML文字列のid属性）
grep -o 'id="[a-zA-Z0-9]*"' JS/player-ui-pc-v2.js | sed 's/id="//;s/"//' | sort -u

# 特定の機能グループ（例: track始まり）だけ抽出
grep -o 'id="track[a-zA-Z0-9_]*"' index.html | sed 's/id="//;s/"//' | sort
```

新しいモーダル/パネルを作るときは、その機能グループのIDプレフィックスを
1つに統一する（`trackBackup*` / `trackImport*`のように）と、後から
`grep`で一括抽出しやすく、この一覧にも足しやすい。


---

## アプリ一覧・YouTubeアプリ（v2.17.0〜）

| ID / クラス | 内容 |
|---|---|
| `#qnAppFlyout` | アプリ一覧のフライアウト（v3.0.0〜、body直下・position:fixed・`hidden`、z-index 320）。SP幅は`.qn-flyout-sp`（横並び）。※旧`#qnMoreBtn`/`.qn-apps-mode`/`.qn-app-item`はv3.0.0で撤去 |
| `.qn-yt-bar` | YouTubeアプリのシークバー下コントロールバー（v3.2.0〜）。`.qn-yt-bgroup`/`.qn-yt-bdiv`/`.qn-yt-bspacer`、ボタン`.qn-yt-bbtn`(`.center`=Play/+Marker、`.is-active`=ON)、`.qn-yt-abread`、スピード`.qn-yt-bstep`(`data-yt=speedDown/speedUp/speedVal`) |
| `.qn-yt-seekpop` | シークバー1タップのA/B/+Markerポップアップ（v3.3.0〜、body直下・position:fixed・`hidden`・z-index 330）。`data-pop=time/A/B/M` |
| `.qn-yt.qn-yt-collapsed` | YouTubeアプリのパネル格納中（PC幅・v3.4.0〜）。`--qn-yt-player-w`でプレイヤー幅を固定。`localStorage: qn_yt_panel_collapsed` |
| `.qn-yt-marker-ab` / `.qn-yt-marker.is-loop-a` / `.is-loop-b` | A点・B点のマーカー強調（v3.4.2〜）。`.qn-yt-loop-range(.is-on)`がA/B区間の色帯。下段バーの`setABtn`/`setBBtn`/`preDown`/`preUp`/`preVal`（`data-yt`） |
| `#qnAppScrim` | フライアウト表示中にページ全体を薄暗くする幕（v3.0.1〜、z-index 310・pointer-events:none・`.qn-scrim-in`で表示、SPは`.qn-scrim-sp`で少し濃い） |
| `.qn-flyout-item[data-app-id]` | フライアウトの各項目(`.pcv2-icon-item`と併用)。`.qn-app-active`=選択中、`.qn-app-soon`=準備中 |
| `#qnAppHost` | アプリ表示領域(position:fixed)。中に`.qn-app-view[data-app-view=<id>]` |
| `#qnAppToast` | 「◯◯ is coming soon」のトースト |
| `body.qn-app-open` | アプリ表示中(下段バー非表示・ショートカット無効) |
| `#qnYtPlayer` | YouTube IFrame Playerの差し込み先(唯一のid。他は`data-yt="..."`で参照) |
| `localStorage: qn_yt_items` | YouTubeの保存リスト(videoId/URL/手入力タイトル/マーカー/AB点のみ) |

### YouTubeアプリのBackup / Import（v2.19.0〜、`data-yt`属性で参照）
`bkList` `bkAll` `bkNone` `bkCount` `bkMarkerTotal` `bkTitle` `bkMarkers` `bkStatus` `bkRun`（Backup）／
`imDrop` `imFile` `imLoaded` `imName` `imCount` `imDupList` `imBulk` `imBulkLabel` `imDupRows` `imStatus` `imBack` `imRun`（Import）。
エクスポート形式：`{format:"qn-youtube-library", version:1, items:[{videoId,url,title?,markers?[{id,time,label}],loopA?,loopB?}]}`

### v2.18〜v2.23 の追記
| ID / クラス | 内容 |
|---|---|
| `#qnAppBadge` | サイドバー先頭の現在アプリ名バッジ。右端の`.qn-badge-chev`(＞)が「サブメニューあり」の印。ホバー/タップでフライアウトが開き、開いている間`.qn-badge-open`・`aria-expanded=true` |
| `#qnColorPop` | アプリ中のColorパネル(z-index 300)。`.qn-colorpanel-head` / `.qn-colorpanel-body`（テーマ切替セクションを借りて表示） |
| `[data-qn-keep-visible]` | 覆ってはいけない要素の印（YouTubeプレイヤー）。SPのColorパネル位置の基準 |
| `.qn-yt[data-edit]` | YouTubeのEDIT状態（`library` / `markers`）。CSSがこの値で表示を切替 |
| `.qn-yt-libbox` / `.qn-yt-pinbox` | Library / Markersの行コンテナ（中身は本体の`.playlistItem` / `.pinItem`） |
| `.qn-yt-fab` | YouTube右下FAB（`data-yt`: `fabAdd` `fabDel` `fabEdit` `fabEditLabel`） |
| `.qn-yt-track.vbar` / `.qn-yt-fill.vfill` / `.qn-yt-head` | YouTubeシークバー（本体の`.vbar`流用）。マーカーは`.qn-yt-marker`+`.qn-yt-marker-label` |
| チャプター貼り付け | `data-yt`: `chapToggle` `chapBox` `chapText` `chapAdd` `chapClose` `chapMsg` |
| `localStorage` | `qn_yt_items` `qn_yt_rate` `qn_yt_autonext` / `qn_marker_custom_presets_v1` |
