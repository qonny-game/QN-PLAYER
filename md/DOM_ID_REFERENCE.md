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
- `control*`（23個）: Speed/AutoSpeed/Key関連、`player-controls.js`。
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
| `pcV2BottomBar` | 下段固定コントロールバー |
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
