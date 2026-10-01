# PLAYER 下段コントロール集約 ＋ パネル格納 仕様書

- 対象：QNPLAYER 本体（PLAYERアプリ）の PC v2 UI（`JS/player-ui-pc-v2.js` / `CSS/style-layout-pc-v2.css`）
- 作成：2026-10-01（QNPLAYER v3.4.0 時点）／**改訂：2026-10-01（v3.12.6 時点で現行コードと突き合わせて再点検。§10 に改訂内容をまとめた）**
- 状態：**仕様A＝v3.13.0で実装済み（方針：横スクロールのみ）。仕様B＝v3.14.0で実装済み（Seekbarアイコンは元々PC幅で非表示のため§8-6は対応不要）**。先にYouTubeアプリ側で実装・確認済みの方式（v3.2.0 / v3.4.0）を、PLAYER側へ展開する。
- 版番号：旧版では v3.5.0 / v3.6.0 と書いていたが、すでに別の変更で使用済み。**仕様A＝v3.13.0、仕様B＝v3.14.0**（以降の連番で調整）。
- 関連：`YOUTUBE_APP.md`（付録：シークバー下のコントロールバー v3.2.0／PC幅のパネル格納 v3.4.0）、`PC_V2_FILE_INDEX.md`、`UI_TERMINOLOGY.md`

---

## 0. ひと言でいうと

1. **下段コントロールバーの集約**：今は画面の最下段を「サイドバーの下まで」全幅で横切っている `#pcV2BottomBar` を、**シークバーのすぐ下（右カラムの下端）に吸着**させる。サイドバー・パネルの下には伸ばさない。
2. **パネル格納（PC幅）**：開いているパネルのサイドアイコンをもう一度押すと、パネル（375px）が左へ格納され、シークバー側が広がる。別のアイコンを押すと開く。状態は保存。

SP幅（≤900px）は **現行のまま**（バーはアイコンバーの直上、パネルは全面オーバーレイ）。今回の変更の対象外。

---

## 1. 現状（調査結果）

### 1-1. DOM 構造（PC幅）

```
#pcV2Root  (flex column)
├─ #pcV2Layout  (grid: 76px 375px 1fr / rows: 1fr)
│   ├─ #pcV2IconBar   … サイドバー(アイコン) ※アプリバッジ・Color等は qn-apps.js が差し込む
│   ├─ #pcV2Panel     … Library / Markers / Text / Control / Backup / Import …
│   │    └ #pcV2PanelHeader / #pcV2PanelBody / #pcV2PanelFab(FAB)
│   └─ #pcV2WaveArea  … 波形(#vbarContainer) ＋ #pcV2WaveFabRow(ADD AUDIO / ADD MARKER)
└─ #pcV2BottomBar  ← ★全幅（サイドバー〜右端）。ここを変える
    └─ #topControls
        ├─ group1 (#pcV2BottomBarGroupPlay)   : Track / Play / Track / Repeat / 時刻表示
        ├─ divider
        ├─ group2 (#pcV2BottomBarGroupMarker) : Marker / +Marker / Marker / Set A / Set B / Loop / プリロール秒数(−0s＋) / Clear AB
        └─ rightGroup(spacerの右)            : Volume / Speed(−＋ステッパー) / Key(−＋ステッパー) / EQ
        ※ v3.7.0〜 Set A/Set B/Clear AB、v3.10.0〜 Speed/Keyのステッパー、v3.12.4〜 全ボタンに文字ラベル。
```

### 1-2. SP幅での扱い（変えない）

- `syncBottomBarPosition()`（resizeで呼ばれる）が、SP幅では `#pcV2BottomBar`（と `#pcV2BottomBarAnchorTabs`）を **`#pcV2Layout` 内・`#pcV2IconBar` の直前**へ DOM 移動する。PC幅では `#pcV2Root` 直下（Layoutの後）へ戻す。
- SP幅の時刻表示は `#pcV2TimeRow`（波形の下の専用行）。PC幅は group1 内。`syncTimeRowPosition()`。
- パネルは `#pcV2Layout.pcv2-panel-open` で全面オーバーレイ。`updatePcv2BottomBarsHeightVar()` がバー＋アイコンバーの高さを測る。

### 1-3. パネル切替の入口（格納に影響するもの）

| 入口 | 現状の動き（PC幅） |
|---|---|
| サイドバーのアイコン（`handleIconClick`→`openPanelOverlay`→`switchPanel`） | 同じアイコンでも再描画するだけ（閉じない） |
| 下段バーの Speed/Key/EQ の右クリック・長押し | `switchPanel("control")` |
| Backup / Import の完了・Cancel（`qnPcv2DismissAuxPanel`） | PC幅は Library へ `switchPanel("playlist")` |
| Keyboard / Color（サイドバー下段） | `switchPanel`（`renderQnMenuSectionPanel` で各セクションを借りる） |
| 初期表示 | `currentPanel = "playlist"`（PC幅は常時Library表示） |

---

## 2. 目標デザイン（PC幅）

### 2-1. 通常時（パネル表示中）

```
┌──────┬────────────┬──────────────────────────────┐
│ icon │  PANEL     │   波形 / シークバー           │
│ bar  │  (375px)   │                              │
│      │            │                              │
│      │            ├──────────────────────────────┤ ← 境界線
│      │            │ ▶ Track Play … │ Marker … │ Vol Speed Key EQ │ ← 下段バー（右カラムの下端に吸着）
└──────┴────────────┴──────────────────────────────┘
```

- サイドバー(`#pcV2IconBar`)と パネル(`#pcV2Panel`)は **最下端まで縦いっぱい**（バーの高さ分も使う）。
- 下段バーは **波形エリアの真下、右カラムだけ**。

### 2-2. 格納時

```
┌──────┬───────────────────────────────────────────────┐
│ icon │   波形 / シークバー（幅が広がる）              │
│ bar  │                                               │
│      ├───────────────────────────────────────────────┤
│      │ ▶ … 下段バー（同様に広がる）                  │
└──────┴───────────────────────────────────────────────┘
```

---

## 3. 仕様A：下段コントロールバーの集約（PC幅）

### 3-1. 構造

`#pcV2Layout` を **2行グリッド**にする。

```css
#pcV2Layout {
  grid-template-columns: 76px 375px 1fr;
  grid-template-rows: minmax(0, 1fr) auto;
}
#pcV2IconBar { grid-column: 1; grid-row: 1 / span 2; }
#pcV2Panel   { grid-column: 2; grid-row: 1 / span 2; }
#pcV2WaveArea{ grid-column: 3; grid-row: 1; }
#pcV2BottomBar { grid-column: 3; grid-row: 2; }   /* ← 右カラムの下だけ */
```

- `#pcV2BottomBar` を **`#pcV2Layout` の子**にする（今は `#pcV2Root` の子）。`syncBottomBarPosition()` の PC幅の分岐を「`layoutEl.appendChild(bottomBar)`」に変更。SP幅の分岐は現行のまま。
- `#pcV2BottomBarAnchorTabs`（PLAY/MARKERのSP専用タブ）はPC幅では `display:none` のまま。DOM位置はバーと同じ親に置く。
- `#pcV2Root` は Layout 1つだけの縦積みになる（`flex:1` は維持）。

### 3-2. 見た目

- ボタン・グループ・区切り線・時刻表示・プリロールステッパー・Volume/Speed/Key/EQ は **現行デザインのまま**（`#pcV2BottomBar .pcv2-ctrl-btn` 等のCSSは変更しない）。変えるのは「置き場所」と「幅」だけ。
- **寸法はYouTubeの下段バー(`.qn-yt-bar`)と共通仕様**（v3.12.6、`style-apps.css` 末尾のブロック）：バー `min-height:80px / padding:10px 12px`、ボタン `padding:8px 4px`（PC）、アイコン20px（中央32px）、ラベル9px、区切り余白6px。Speed/Keyのステッパーだけ例外。バーを移動しても、この共通ブロックを崩さない（`#pcV2BottomBar` のセレクタのまま使える）。
- バーの `border-top`（既存）は維持。左端（サイドバー側）へは線を伸ばさない。
- YouTubeアプリの `.qn-yt-bar`（`YOUTUBE_APP.md` 付録 v3.2.0）が同じ考え方の実装例。

### 3-3. 幅が足りない時（重要）

右カラムの幅は「画面幅 − 76 − 375」。**バーの中身は v3.7.0〜v3.12.x で増えた**（Set A/Set B/Clear AB、Speed/Keyのステッパー、全ボタンの文字ラベル、要素間の余白）ため、必要幅は旧版の想定（約740px）から **約 1000px**（概算・未実測）に増えている。

| 画面幅 | 右カラム幅 | バー内容の必要幅（概算） | 結果 |
|---|---|---|---|
| 1440px | 989px | 約 1000px | ほぼ限界 |
| 1280px | 829px | 約 1000px | **はみ出す**（旧版は「収まる」） |
| 1100px | 649px | 約 1000px | **大きくはみ出す** |
| 格納時 1280px | 1204px | 約 1000px | 収まる |
| 格納時 1100px | 1024px | 約 1000px | 収まる |

→ 標準的なノートPC（1280〜1440px）で、**パネル表示中はふだんから横スクロールになる**。横スクロールだけに頼る方針（下の1）は見栄えの面で弱いので、実装前に §8-4 を決める（コンパクト表示の前倒し、または Speed/Key/EQ/Volume の置き場所の見直し）。着手時にまず実測（DevToolsで `#pcV2BottomBar` の `scrollWidth`）して、この表を更新すること。

対応（この順で採用）：
1. バーに `overflow-x: auto; scrollbar-width: none`（横スクロール）を付ける。`.qn-yt-bar` と同じ。`#pcV2BottomBar` は SP用に既にこの指定があるので、PC幅にも適用する。
2. `.pcv2-ctrl-spacer`（flex:1）は最小幅だけ確保して、余白で潰れないようにする。
3. それでも不満なら、右カラム幅が足りない範囲（目安：画面幅 901〜1450px・パネル表示中）で「コンパクト表示」を追加する（ラベル非表示、ボタンpadding縮小、Speed/Keyステッパーの幅縮小など）。**旧版は「今回は対象外」だったが、上の表のとおり1280pxでもはみ出すため、仕様Aに含める方向で §8-4 で決める。**
   - ただし v3.12.4 で「全ボタンをアイコン＋ラベルに統一」したばかりなので、ラベルを消す案は方針と衝突する。優先順：①余白(gap/margin)の縮小 → ②Volume/Speed/Key/EQのステッパー幅縮小 → ③ラベル非表示、の順で検討。

### 3-4. 影響する既存処理（要確認）

| 項目 | 確認内容 |
|---|---|
| `alignPlayAnchorTab()` | SP専用。PC幅で計算が走っても問題ないか |
| Volume ポップアップ(`#pcV2VolumePopup`) | `position:fixed` でボタン位置から計算。バー位置が変わっても `left/top` が正しく出るか |
| `#topControlsSpacer` | PC v2 では `display:none`。影響なし |
| 波形エリアの高さ | 縦方向はバーの高さ分だけ「波形エリア」側が変わらない（今と同じ高さ）か。Layout の行高（`1fr + auto`）で吸収される |
| `#pcV2WaveFabRow`（ADD AUDIO/ADD MARKER）| 波形エリア右下の絶対配置。バー移動で位置が変わらないこと |
| `body.qn-app-open #pcV2BottomBar{display:none}`（`style-apps.css`） | アプリ表示中はバーを隠す。Layout内へ移しても、グリッドの2行目(auto)が高さ0になるだけで問題なし（確認のみ） |
| 下段バーのA/B・Clear AB・プリロール等 | 親が変わってもIDは同じ（`#setABtn`/`#setBBtn`/`#clearABBtn`/`#loopPreRollControl`）。`player-markers.js` の `updateABButtons()` は `document.getElementById` なので影響なし |

---

## 4. 仕様B：パネル格納（PC幅）

YouTubeアプリの実装（v3.4.0、`onSidebar`／`setCollapsed`／`applyCollapse`）を踏襲する。

### 4-1. 操作

| 操作 | 結果 |
|---|---|
| パネル表示中に、**表示中のパネルのアイコン**を押す | パネルが左へ格納される（220ms） |
| 格納中に、**どのアイコン**を押しても | パネルが開き、そのアイコンの内容を表示 |
| 格納中に、サイドバーの選択表示 | 全アイコンの `.active` を外す（格納されていることが分かる） |
| 下段バーの Speed/Key/EQ の右クリック等が `switchPanel("control")` を呼ぶ | 格納中なら **展開してから** Control を表示 |
| Backup/Import の完了→Library へ戻る（`qnPcv2DismissAuxPanel`） | 格納中なら展開して Library を表示 |

- SP幅：現行のまま（同じアイコン再タップで閉じる、全面オーバーレイ）。格納の仕組みは使わない（クラスも付けない）。
- キーボードショートカットは影響なし（パネルの開閉と独立）。

### 4-2. 実装方針

```css
#pcV2Layout { transition: grid-template-columns 220ms cubic-bezier(0.2, 0.8, 0.2, 1); }
#pcV2Layout.pcv2-collapsed { grid-template-columns: 76px 0 1fr; }
#pcV2Panel { overflow: hidden; }
#pcV2Panel > * { min-width: 374px; }          /* 縮む途中で中身が潰れないように */
#pcV2Layout.pcv2-collapsed #pcV2Panel { visibility: hidden; transition: visibility 0s linear 220ms; }
```

JS（`player-ui-pc-v2.js`）：

- 状態 `panelCollapsed`（`localStorage: qn_panel_collapsed`）。`isCollapsed() = panelCollapsed && !isSpWidth`。
- `openPanelOverlay(panelId)` の PC幅分岐：
  - 格納中 → `setCollapsed(false)` してから `switchPanel(panelId)`
  - 展開中かつ `currentPanel === panelId` → `setCollapsed(true)`
  - それ以外 → `switchPanel(panelId)`
- `setCollapsed(on)`：状態保存 → `#pcV2Layout` に `pcv2-collapsed` を付け外し → アイコンの `.active` を更新（格納中は全て外す）。
- `switchPanel()` は先頭で「格納中なら `setCollapsed(false)`」を呼ぶ（外部からの呼び出しを漏れなく展開にするための保険）。
- resize で SP⇄PC を跨いだ時、`applyCollapse()` でクラスを付け外し（SPでは付けない）。

### 4-3. 格納中のレイアウト

- 波形エリアと下段バーは右カラム（1fr）なので、**自動で幅が広がる**。
- YouTubeアプリと違い、PLAYERには「固定すべきiframe」が無いので、幅固定の処理は不要。

### 4-4. 波形（シークバー）の再計算（要確認・最大のリスク）

- 幅が変わった時に、波形(`#vbarContainer`)・マーカー線・ラベルが正しく再配置されるか。マーカー位置・A/B点(`.vbar-ab-pt`)は `%` 指定のため基本は追従する。
  - **現行コードで確認済み**：波形キャンバスはピクセル幅を持つが、`player-ui-pc-v2.js` に `#vbarContainer` を監視する `ResizeObserver`（v2.16.1〜）があり、幅が変わるたびに `drawWaveform()` と `pcv2DrawWaveform(true)` を1フレーム1回再実行する。**格納アニメ(220ms)中も毎フレーム再描画されるが、rAFで間引かれるので許容範囲**。追加の `transitionend` 処理は原則不要（重いと感じたら、アニメ中は再描画を間引く）。
  - 要実測：マーカーラベルの左右反転（`.pcv2-label-flip`）の判定タイミング。幅の変化後に再判定されるか。
- プレイ中に格納・展開しても、再生位置・カーソルのずれが出ないこと。

---

## 5. 変更ファイル（想定）

| ファイル | 変更 |
|---|---|
| `JS/player-ui-pc-v2.js` | `syncBottomBarPosition()` のPC分岐／`openPanelOverlay`／`switchPanel` 先頭／`setCollapsed`・`applyCollapse` 追加／`qnPcv2DismissAuxPanel` |
| `CSS/style-layout-pc-v2.css` | `#pcV2Layout` を2行グリッド化／`#pcV2BottomBar` の配置とPC幅の横スクロール／`.pcv2-collapsed` と `#pcV2Panel` の格納CSS |
| `index.html` | バージョンのみ |
| `md/` | `CHANGELOG.md`、`PC_V2_FILE_INDEX.md`、`DOM_ID_REFERENCE.md`、`UI_TERMINOLOGY.md`、`GOTCHAS_REFERENCE.md`（新しい落とし穴が出たら）、`AI_ASSISTANT_PROJECT_CONTEXT.md`（§レイアウト） |

※ `qn-apps.js`（アプリ切替）への影響：`#qnAppHost` の位置計算 `layoutHost()` は「`#pcV2Layout` と `#pcV2IconBar` の実測」で決めている（PC幅：`left = iconBar.right`、`top = layout.top`、`bottom = innerHeight − layout.bottom`、現行コードで確認済み）。アプリ表示中はバーが `display:none` になるため、バーを Layout 内へ移しても `layout.bottom` は画面下端のまま変わらず、**計算式の変更は不要の見込み**（実機で表示領域のずれがないことだけ確認）。YouTubeアプリの下段バーは `.qn-yt-bar` として自前なので、本体のバーとは別物（二重にならない）。

---

## 6. 実装ステップ（安全に進める順）

| 段階 | 版 | 内容 | 確認 |
|---|---|---|---|
| 1 | v3.13.0 | **仕様A**：下段バーを右カラム下端へ（格納はまだ入れない） | PC幅の見た目／1100px以下の横スクロール／Volumeポップアップ位置／SPが変わっていないこと／`#qnAppHost`（YouTube等）の表示領域 |
| 2 | v3.14.0 | **仕様B**：パネル格納 | 波形の再計算／ショートカット・右クリック等の外部からの `switchPanel` で展開すること／リロード後の状態維持／SPが変わっていないこと |

- 各段階でパッチZIPを分ける（戻しやすくするため）。
- 各段階の実機確認（SP含む）を待ってから次へ。

---

## 7. 受け入れテスト（チェックリスト）

### 仕様A（v3.13.0）
- [ ] PC 1280px：下段バーが右カラムの下端にあり、サイドバー・パネルの下には無い
- [ ] サイドバーとパネルが画面の最下端まで縦いっぱい
- [ ] バーの全ボタン（Track/Play/Repeat/時刻/Marker/Set A/Set B/Loop/プリロール/Clear AB/Volume/Speed(−＋)/Key(−＋)/EQ）が従来どおり動く
- [ ] バーの高さ・アイコン・文字サイズがYouTubeの下段バーと同じ（v3.12.6の共通仕様のまま）
- [ ] PC 1280px / 1100px：バーが（§8-4で決めた方式で）全て操作できる
- [ ] Volume ポップアップがボタンの真上に出る
- [ ] SP 390px：見た目・動作が直前の版（v3.12.6）と同じ（バーはアイコンバーの直上）
- [ ] 画面幅を PC⇄SP に行き来しても、バーの位置が正しく戻る
- [ ] アプリ（YouTube）を開閉しても、表示領域がずれない

### 仕様B（v3.14.0）
- [ ] 表示中パネルのアイコンをもう一度押すと格納され、波形・バーが広がる
- [ ] 格納中に別アイコンを押すとパネルが開く／選択表示が付く
- [ ] 格納中、アイコンの選択表示が全て消えている
- [ ] Speed/Key/EQ の右クリックで Control が開く（格納中でも展開される）
- [ ] Backup/Import 完了後に Library が見える（格納中でも展開される）
- [ ] 格納→リロードで、格納状態が維持される
- [ ] 再生中に格納・展開しても、波形・マーカー・再生カーソルがずれない
- [ ] SP 390px：従来どおり（同じアイコン再タップでオーバーレイが閉じる）

---

## 8. 決めておきたいこと（未決事項）

1. **格納中のパネル用FAB**（ADD MARKER/EDIT 等、パネル右下）は、格納と同時に消えて問題ないか（想定：問題なし）。
2. **初回起動時の状態**：展開（現行と同じ）でよいか。
3. **格納のトグル対象**：サイドバー最上段の「アプリバッジ(＞)」は対象外（アプリ切替用）でよいか。
4. **コンパクト表示（旧：1100px以下）**：バーの必要幅が約1000pxに増えたため、1280px前後でもはみ出す。①横スクロールのままにする／②余白→ステッパー幅→ラベルの順で縮める「コンパクト表示」を仕様Aに含める／③Volume・Speed・Key・EQ を別の場所（例：2段目、またはパネル側）へ移す、のどれにするか。**着手前に決めたい最重要項目。**
5. `#pcV2WaveFabRow`（ADD AUDIO / ADD MARKER）：バー集約後も今の位置（波形エリア右下）のままでよいか。
6. **Seekbarアイコン（サイドバー最上段付近）の扱い**：現行は `panelType:"close"`（PC幅では何も起きない）。格納機能の導入後、「Seekbarを押す＝パネルを格納して波形を広げる」に割り当てるか（案）、現行どおり何もしないか。
7. **格納状態とアプリ切替**：YouTubeアプリ側は独自の格納状態（`qn_yt_panel_collapsed`）を持つ。PLAYER側（`qn_panel_collapsed`）と**別々に保存**でよいか（想定：別々）。
8. **YouTubeアプリのパネル格納中の動画センタリング**（v3.12.0）：PLAYERには固定すべきiframeがないため該当なし。確認のみ。

---

## 9. 懸念点まとめ

| # | 懸念 | 対策 |
|---|---|---|
| 1 | 下段バーの必要幅（約1000px、v3.12.x時点）が、右カラム（1280pxで829px、1100pxで649px）に収まらない | §3-3・§8-4で方式を決める（横スクロール／コンパクト表示／要素の移動）。格納で解消できる |
| 2 | 波形・マーカーの再描画が幅変化に追従しない可能性 | 仕様B 4-4。`#vbarContainer` の `ResizeObserver` が既にあるため追従する見込み（リスク低下）。ラベルの左右反転の再判定だけ要実測 |
| 3 | `#qnAppHost`（アプリ表示領域）の位置計算が `#pcV2Layout` の矩形に依存 | `layoutHost()` は現行コードで確認済み（計算式の変更は不要の見込み）。実機でのずれ確認のみ |
| 4 | 外部から `switchPanel()` が呼ばれる経路の取りこぼし | `switchPanel()` 先頭で「格納中なら展開」（保険） |
| 5 | SP幅のバー移動（`syncBottomBarPosition`）との競合 | PC分岐のみ変更、SP分岐は触らない。ブレークポイント跨ぎの往復テスト |
| 6 | `overflow:hidden`（`#pcV2Panel`）で、パネル内のポップアップが切れる | パネル内のポップアップ（カラーピッカー・メモ候補等）の位置を確認。必要なら格納中のみ `overflow:hidden`。**現行のポップアップ（`.marker-color-popup`、`.qn-style-pop`、`.pin-memo-preset-popup`、シークバーのA/B/Colorポップアップ）はいずれも `body` 直下の `position:fixed` なので切れない見込み**（確認のみ） |
| 7 | 実機（iOS/Android Chrome）での `grid-template-columns` アニメ | 非対応でも「瞬時に切り替わる」だけ。機能は損なわない |

---

## 10. 改訂メモ（2026-10-01、v3.12.6 時点）

旧版（v3.4.0時点）からの主な差分と、この仕様への影響：

| 変更（版） | 内容 | 仕様への影響 |
|---|---|---|
| v3.5.0〜 | シークバーのポップアップ（＋Marker/A/B/－/Color/Hide）、プリロール0〜5秒 | 影響なし（`body` 直下の fixed ポップアップ） |
| v3.6.0 / v3.10.0 / v3.12.x | Controlパネル・下段バーのSpeed/Keyを−＋ステッパー化、全ボタンに文字ラベル | **バー必要幅が増加** → §3-3 を改訂 |
| v3.7.0〜v3.8.0 | A/Bを「使い捨ての区切り位置」（`mp3_ab_<name>`）に。Set A/Set B/Clear AB を下段バーへ | バー中身が増加（§1-1）。A/B点は%配置でリサイズ追従 |
| v3.11.0 | `JS/qn-marker-core.js` 新設（PLAYER/YouTube共通のマーカー・ループ判定） | 影響なし。`index.html` の読み込み順に注意（`player-core.js` より前） |
| v3.12.6 | 下段バーの寸法をYouTubeと共通仕様に統一（`style-apps.css` 末尾） | §3-2 に追記。移動後もこのブロックを維持 |
| v3.11.1 | アプリ一覧フライアウトのアニメがOSの視覚効果設定で止まる問題を修正 | 影響なし |

実装着手前の確認事項（優先順）：
1. §8-4（バー幅の方針）を決める。
2. バーの実測幅（DevTools `scrollWidth`）を取り、§3-3 の表を更新する。
3. §8-6（Seekbarアイコンの扱い）を決める。
