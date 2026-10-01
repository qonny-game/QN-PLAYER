# QNPLAYER YouTubeアプリ 仕様と規約ルール

（旧名「YouTube埋め込み プロトタイプ仕様」。v2.17.0でQNPLAYER本体に統合され、
このファイルは**現行のYouTubeアプリの仕様書 兼 規約遵守ルール**になった。
（旧名 YT_PROTOTYPE_SPEC.md から改名）

- 実装：`JS/qn-app-youtube.js`（アプリ本体）／`CSS/style-apps.css`（見た目）／`JS/qn-apps.js`（アプリ名バッジ・アプリ一覧フライアウト・表示領域）
- 最終更新：QNPLAYER v3.7.1（PLAYERのマーカー線クリックでポップアップが出ない不具合を修正）（2026-10-01）
- **YouTube関連の変更をするときは、まず§2（規約遵守ルール）を読む。** 便利さのために§2を破る実装は入れない。

---

## 0. 目的と方針

**最終目標：YouTube規約に照らして健全なページを作り、将来的に広告収益を得る。**
そのため、規約的にグレーになり得る実装は最初から採用しない（§2が最優先）。

- 使うのは**YouTube公式のIFrame Player API（埋め込みプレイヤー）のみ**。
- 音声・映像の抽出／ダウンロード／保存／Web Audio接続は**一切しない**。
  そのためYouTubeでは波形表示・ピッチ変更（Web Audio処理）は**できない**（対象外）。
- 保存するのは「URL・**利用者が手入力したタイトル**・マーカー（秒数・メモ・色）」という文字列／数値データだけ。
- 本体（PLAYER）と同じ操作・見た目に揃える（§3）が、YouTube側だけ機能が違う所（波形なし等）は§3に明記する。

---

## 1. 現在できること（実装済み）

### 1-1. 入口とサイドバー
- サイドバー先頭のアプリ名バッジ（＞付き）にマウスを載せる（SPはタップ）とアプリ一覧のフライアウトが出る → YOUTUBEを選ぶと、サイドバーが上段「Library / Markers」、下段「Backup / Import / Keyboard / Color」（本体と同じ並び）に切り替わる。
  先頭のバッジは現在のアプリ名を表示し、ここからいつでも他のアプリへ切り替えられる。仕組みは`PC_V2_FILE_INDEX.md`のqn-apps.jsの項。
- アプリ表示中は本体の下段バーを隠し、本体のaudioを一時停止、キーボードショートカットと「曲追加」D&Dを無効化する（`body.qn-app-open`）。
- Colorボタンは全アプリで常駐。アプリ表示中はPLAYERと同じ「パネル」として開く（Marker Memo Colorsだけ非表示）。

### 1-2. URLの読み込み
- 対応：`youtube.com/watch?v=` / `youtu.be/` / `youtube.com/shorts/` / `youtube.com/embed/`。不正なURLはエラー表示。
- IFrame APIのスクリプトは**初めて動画を読み込む時まで取得しない**（QNPLAYERを開いただけではYouTubeへ通信しない）。
- 埋め込み禁止の動画は`onError`で「埋め込み再生できません」と表示する（回避策は作らない）。
- **Save**で URL＋手入力タイトルをLibraryに保存。保存したら入力欄は空に戻す。

### 1-3. Library（本体のLibraryパネルと同じ行・同じ操作）
- 行：つかみ（ドラッグで並べ替え）／サムネイル（16:9のまま表示のみ。読み込めない時は再生アイコン）／タイトル（ホバーの鉛筆で編集）。行クリックで再生。
- 右下のFAB **EDIT→OK**：タイトルが常時入力欄になり、**PLAY/SKIP**トグル（SKIPはAuto Nextで飛ばす）と削除用の丸チェックが出る。選択して**Delete**で一括削除（フェード付き）。選択中はPLAY/SKIPを押せない。
- **Auto Next**：動画が終わったらLibraryの次（SKIPを除く）を読み込む。初期OFF・利用者がONにした時だけ。§2-2参照。

### 1-4. Markers（本体のMarkersパネルと同じ行・同じ操作）
- 行：色の丸（押すとカラーパレット）／「番号 - メモ」（メモが空なら時刻）／鉛筆（メモ編集＋プリセットチップ。プリセットを選ぶと色も自動で付く。カスタムプリセットも並ぶ）／A・B（ABループ指定。編集モード中は隠す）／目（表示/非表示）。
- 右下のFAB：通常は**ADD MARKER**（現在位置に追加）と**EDIT**、編集中は**Delete**と**OK**。丸チェックで選んで一括削除。
- 非表示にしたマーカーは、シークバーに出さず、前/次マーカー移動でも飛ばす。
- **チャプターを貼り付け**（Markersパネル上部）：利用者が説明欄からコピーした`時間 タイトル`のテキストを貼ると、1行ずつ解析してマーカーにする（§2-3も参照）。
  対応形式：`0:00 タイトル`／`1:02:03 - タイトル`／`[2:45] タイトル`／`- 0:45 Aメロ`（全角数字・記号可）。同時刻の重複と動画長超えはスキップ。プリセット名と一致するメモは色を自動付与。
- ABループ：マーカー2つをA点・B点に指定。再生中B点に達したら`seekTo`でA点へ戻す（自前ポーリング）。Loop ON/OFF、Clear AB。

### 1-5. 自前シークバー（プレイヤーの外）
- 見た目は本体（PC v2の`.vbar`）に寄せる：角丸なし・#111の帯・再生済みはテーマ色・現在位置は細い白線・高さ40px（SPは36px）。
  **波形は使わない**（音声・映像データに触れないため）。
- 3行に分割（全長を3等分）。どの行でもクリック／ドラッグで`seekTo`。
- マーカーは縦線（2px・マーカー色）＋線の真上に番号＋右にメモ（右端近くは左側）。ドラッグで位置変更（行またぎ可）、動かさず離すとジャンプ。
- 時刻表示、`◀◀10s` / `|◀ Marker` / `+ Marker` / `Marker ▶|` / `10s ▶▶`。前/次マーカーは**現在位置基準**（`getCurrentTime`→`seekTo`のみ）。

### 1-6. 再生スピード
- プレイヤーの**外**の自前UI。倍率はYouTube標準と同じ（`getAvailablePlaybackRates()`）、変更は`setPlaybackRate()`のみ。選択は`qn_yt_rate`に保存。

### 1-7. Backup / Import
- **v3.17.0〜：Backup/Importは本体(PLAYER)と共通の1画面**（実体は`JS/player-track-backup.js`。YouTubeのパネルは`window.qnBackupMountInto()`でその画面を借りる）。YouTube側は`window.QNYouTubeBackup`（`list`/`buildExport`/`parseImport`/`exists`/`titleOf`/`applyImport`）でデータの出し入れだけ提供する。
- Backup：曲リストに「PLAYER」「YouTube」の見出しで両方が並ぶ。両方を選ぶと**1つのZIP**（`qnplayer_backup_YYYYMMDD.zip`＝`markers.json`＋`audio/`＋`youtube.json`）。YouTubeだけなら従来どおり`qn-youtube-library_YYYYMMDD.json`、PLAYERだけなら従来どおり。「設定データ」＝タイトル・マーカー・AB点（YouTube分も同じチェック）。
- Import：ZIP/JSONの中身を自動判定（`markers.json`＝PLAYER／`youtube.json`またはformat=qn-youtube-library＝YouTube）。videoId／曲名が重複するものは上書き/スキップ（行ごと＋一括トグル）。値は検証・整形して取り込む（不正なマーカーは捨てる）。どちらのアプリから開いても同じ。
- 形式は§4。含めるのはURL・手入力タイトル・マーカーのみ。

### 1-8. 画面スリープ防止
- `JS/qn-wakelock.js`（Screen Wake Lock API）。PLAYERのaudio再生中／YouTubeの再生中（PLAYING）だけ保持し、一時停止・終了・非表示で解放。非対応環境では何もしない。

### 1-9. SP幅のレイアウト（規約優先・ざっくり実装）
- パネル（Library等）を開いても**プレイヤーは画面上部に残す**（高さ`max(200px,30dvh)`、最低200px、覆わない）。パネルはその下の残り領域。
  パネルを開いている間、自前シークバー等とフッターは隠す（閉じると戻る）。Colorパネルもプレイヤーの直下から始まる。
- プレイヤーの要素には`data-qn-keep-visible`が付いており、`qn-apps.js`のColorパネルがこれを避けて配置する。
- 細かい比率は後日調整予定。

### 1-10. 未対応・今後
- サムネイル表示：v2.29.0で実装（表示のみ・保存なし・切り抜きなし。§付録参照）。
- TUNER / PITCH：準備中の枠のみ。
- 公開準備（§2-7）、広告枠の設置（§2-5）。

---

## 2. 規約遵守ルール（最優先・破らない）

根拠：YouTube API Services Developer Policies（<https://developers.google.com/youtube/terms/developer-policies>）と
Required Minimum Functionality。規約は更新されるため、公開・収益化の前に必ず原文を再確認すること。

### 2-1. 埋め込みプレイヤーには手を加えない
- 公式のIFrame Player APIで表示し、**YouTube標準のコントロールをそのまま表示する**（`controls: 1`。`controls: 0`は使わない）。
- プレイヤーの上にUIを**重ねない**（オーバーレイ、透明レイヤー、`pointer-events`での操作ブロックも禁止）。
- CSSでプレイヤーを**切り抜かない・隠さない・歪めない**（`overflow`での切り取り、`clip-path`、`opacity`、極小化、画面外配置など。プレイヤー枠に`overflow:hidden`や角丸も付けない）。
- YouTubeのロゴ・リンク・帰属表示を隠さない、変更しない。
- プレイヤーは**常に画面内に表示する**。非表示にして音だけ流す（バックグラウンド再生）は禁止。
  → アプリを閉じる／隠す時は`pauseVideo()`で一時停止する。**SP幅でもパネルでプレイヤーを覆わない**（§1-9）。
- サイズは**最低200×200px**（公式の推奨サイズ。実装時に公式ドキュメントで再確認）。
- iframeを入れ子にしない。

### 2-2. 自前UIは「埋め込みの外」に置く
- 自前シークバー・マーカーUI・スピードUIは、プレイヤーの**外側（下）**に余白を空けて配置する。
- 呼んでよいのは**公式ドキュメントに載っているメソッドだけ**。現在使っているもの：
  `seekTo` / `getCurrentTime` / `getDuration` / `loadVideoById` / `cueVideoById` / `playVideo`（利用者操作起点のみ）/ `pauseVideo` /
  `setPlaybackRate` / `getPlaybackRate` / `getAvailablePlaybackRates`。新しいメソッドを足す時は公式ドキュメントで確認する。
- 非公式・未文書のAPIやYouTubeページのDOM操作には一切頼らない。
- **再生／停止は標準コントロールを使う**。自前の再生・停止ボタンは付けない。
- 動画の再生開始は**利用者の操作起点**にする。`autoplay: 0`。マーカーのクリックによるジャンプは利用者操作なのでOK。
- **Auto Next**（終了したら次を再生）は、利用者が明示的にONにした時だけ動く（初期OFF、`qn_yt_autonext`）。
  自動再生は「プレイヤーが見えていて、半分超が見えている」場合に限る：別タブ／アプリ非表示／プレイヤーが半分以上隠れている時は進まない（`playerMostlyVisible()`）。
  プレイヤーは常に1つだけなので、同時に自動再生するプレイヤーは1つ。
- 画面スリープ防止（§1-8）は「画面が見えている間だけ」画面を消さないためのもの。バックグラウンド再生を作るものではない。

### 2-3. 音声・映像データ／YouTubeのデータに触れない
- 音声・映像のダウンロード、キャッシュ、保存、オフライン再生機能は**作らない**。
- 音声と映像の分離、Web Audio APIへの接続、`captureStream`等による取り込みは**やらない**。
- YouTubeページや動画データの**スクレイピングはしない**。YouTube Data APIも使わない
  （チャプターの自動取得は、公式プレイヤーAPIに機能が無く、Data API利用は審査・保存制限の対象になるため見送り）。
  → チャプターは**利用者が説明欄からコピーして貼り付けた文字列**を処理するだけ（YouTubeからは何も取得しない）。

### 2-4. 保存するデータを最小限にする
- 保存してよいもの：`videoId` / 入力されたURL / **利用者が自分で付けたタイトル** / マーカー（秒数・メモ・色・有効/無効）/ AB点 / PLAY・SKIP。
- **YouTubeから自動取得したタイトル・サムネイル・再生数などは保存しない**（`getVideoData().title`も保存に使わない。画面の一時表示のみ）。
  規約上、YouTube由来のデータを長期保存できない。タイトルは常に利用者の手入力。
- 音声・映像・サムネイル画像のデータは保存しない。

### 2-5. 広告・課金の設計ルール（収益化を見据えて）
- **広告はプレイヤーの外に置く**（上・中・重なる位置・直接隣接に置かない）。現状は広告コード無し、`.qn-yt-ad-slot`で枠だけ確保。
- **「YouTubeのコンテンツしかないページ」にならないこと**。マーカー管理・リスト管理・ローカルファイル再生など、独自機能がそれだけで価値になるようにする。
- ポップアップ、全画面インタースティシャル、誤クリックを誘う配置など、邪魔な広告は使わない。
- **YouTube動画の視聴そのものを有料にしない・条件付けしない**（課金は独自機能側のみ）。
- チャンネル登録・高評価・シェア等を視聴の条件やポイント付与の対象にしない。
- 広告ネットワーク（AdSense等）側の独自審査基準も別途確認する。

### 2-6. 著作権への配慮
- 権利者に無断でアップロードされた動画の利用を助長しない。画面に「権利者に無断でアップロードされた動画は使用しないでください」の注意書きを置く（`.qn-yt-notice`）。

### 2-7. 一般公開する時に必要になるもの（メモ）
- 独自の利用規約に「YouTube利用規約（<https://www.youtube.com/t/terms>）への同意」を明記し、リンクを表示する。
- プライバシーポリシー（常時見える位置）。含める内容：YouTube API Servicesを利用していること／Googleプライバシーポリシー（<http://www.google.com/policies/privacy>）へのリンク／広告など第三者コンテンツの開示／Cookie・ローカルストレージ利用の開示。
- 埋め込む動画の「子ども向け」判定の扱い（子ども向け動画ではトラッキングを止める必要がある）。**公開前に調査して設計する**。
- HTTPSでの配信。広告ネットワークの審査。

---

## 3. 本体（PLAYER）との違いと対応表

| 項目 | PLAYER | YOUTUBE |
|---|---|---|
| 波形 | あり | **なし**（音声に触れないため。#111の帯＋テーマ色の塗り） |
| 再生/停止 | 自前ボタン | **YouTube標準コントロールのみ** |
| サムネイル | ID3の画像 | YouTubeの画像URLを<img>で表示のみ（保存しない） |
| ピッチ/EQ/Speedのエフェクト | Web Audio | 不可。スピードのみ`setPlaybackRate` |
| Library行 | `.playlistItem` | 同じクラスを流用（PLAY/SKIPはAuto Nextで使用） |
| Markers行 | `.pinItem` | 同じクラスを流用（A/Bだけ独自） |
| マーカーの保存先 | `localStorage: mp3_pins_<ファイル名>` | `qn_yt_items`内の各動画の`markers` |
| FAB / EDITモード | `player-ui-pc-v2.js` | `qn-app-youtube.js`が同じ見た目で自前実装（`.qn-yt[data-edit]`とCSS） |

- 本体側のCSSは`#pcV2PanelBody …`で限定されているものが多い。YouTube側は`style-apps.css`の「Library / Markers：本体(PLAYER)のパネルと同じ行・同じ操作」の節に同等ルールを`.qn-yt[data-edit]`付きで再掲している。**本体のCSSを直したら、こちらも合わせる。**

---

## 4. データ構造

### 4-1. localStorage
| キー | 内容 |
|---|---|
| `qn_yt_items` | Libraryの配列（下記） |
| `qn_yt_rate` | 再生スピードの選択（数値） |
| `qn_yt_autonext` | Auto NextのON/OFF |
| `qn_marker_preset_colors_v1` / `qn_marker_custom_presets_v1` | 本体と共通のメモプリセット色／カスタムプリセット（`player-markers.js`） |

```json
[
  {
    "id": "item_xxx",
    "type": "youtube",
    "videoId": "xxxxxxxxxxx",
    "url": "https://youtu.be/xxxxxxxxxxx",
    "title": "利用者が手入力したタイトル",
    "skip": true,
    "markers": [
      { "id": "m_xxx", "time": 83.5, "label": "Chorus", "color": "red", "enabled": false }
    ],
    "loopA": "m_xxx", "loopB": null,
    "createdAt": 1790000000000
  }
]
```
- `skip`・`color`・`enabled`は**付いている時だけ**保存（デフォルトは付けない）。`time`は0.1秒刻み。
- 音声・映像データ、YouTube由来のタイトル・サムネイルは一切含めない。`type: "youtube"`は将来ローカルファイルと同じリストに並べるため。

### 4-2. Backup / Importの形式
```json
{ "format": "qn-youtube-library", "version": 1, "exportedAt": "ISO日時",
  "items": [ { "videoId": "...", "url": "...", "title": "?", "markers": [{"id","time","label","color?","enabled?"}], "loopA": "?", "loopB": "?" } ] }
```
- 旧形式（`color`・`enabled`なし）も読める。Importは`normalizeImport()`で検証し、不正な値は捨てる（`color`は`MARKER_COLOR_PALETTE`にある名前のみ）。

---

## 5. 画面レイアウト

```
PC幅                                             SP幅（パネルを開いた時）
+--+----------------+---------------------+       +-----------------------+
|サ|パネル(375px)   | YouTube埋め込み     |       | ヘッダー              |
|イ|Library/Markers | (16:9・標準コントロール)|       | YouTubeプレイヤー      |
|ド|Backup/Import   +---------------------+       | (max(200px,30dvh))    |
|バ|または Color    | 時刻 / 3行シークバー  |       +-----------------------+
|ー|[EDIT]FAB       | ◀◀ |◀ +Marker ▶| ▶▶   |       | パネル(Library等)     |
|  |                | Speed / Auto Next / AB|       +-----------------------+
+--+----------------+ 注意書き / 広告枠      |       | サイドバー(下)         |
```

---

## 6. 技術方針
- HTML／CSS／JSのみ。IFrame Player API（`https://www.youtube.com/iframe_api`）を公式の方法で初回に取得。
- プレイヤー生成：`playerVars: { controls: 1, autoplay: 0, playsinline: 1, disablekb: 0 }`。
- 現在位置は`setInterval`で`getCurrentTime()`をポーリング（このアプリが表示されている間だけ。非表示で停止）。全長は`getDuration()`、状態は`onStateChange`。
- シークバー操作中はポーリングによる表示更新を止める。
- `file://`で開くとIFrame埋め込みがエラーになることがある。ローカルサーバー経由で確認する（`python -m http.server`等）。
- 開発時の動作確認は、`https://www.youtube.com/iframe_api`をモック（偽の`YT.Player`）に差し替えたPlaywrightで行っている。
- §2に反する実装（オーバーレイ、プレイヤーの隠蔽、音声取得など）を、便利さのために追加しない。

---

## 7. 受け入れチェックリスト（YouTube関連の変更後に確認）

### 規約チェック（すべてチェックが付くこと）
- [ ] 標準コントロールが表示されている（`controls: 1`）
- [ ] プレイヤーの上に何も重なっていない（パネル・Colorパネル・ポップアップ含む。SP幅も）
- [ ] プレイヤーがCSSで切り抜かれたり隠されたりしていない／SPで200px以上ある
- [ ] 見えないまま音だけ流れる状態がない（アプリを閉じる／隠す時は一時停止）
- [ ] 自動再生していない（`autoplay: 0`。Auto Nextは初期OFF・見えている時だけ）
- [ ] 自前の再生/停止ボタンがない
- [ ] 使用しているAPIメソッドが§2-2の一覧（公式）だけ
- [ ] 保存データにYouTube由来のタイトル・サムネイル・音声・映像が含まれていない
- [ ] ダウンロード（音声・映像）・書き出しの機能が存在しない
- [ ] 注意書き（無断アップロード動画の不使用）が表示されている

### 機能チェック
- [ ] URL読み込み／不正URLのエラー／Saveでリスト保存（入力欄が空に戻る）／リロード後も残る
- [ ] Library：並べ替え、EDIT→PLAY/SKIP・選択削除、Auto Nextの順送り
- [ ] Markers：追加、色、メモ＋プリセット、表示/非表示、選択削除、チャプター貼り付け、A/BループとClear AB
- [ ] シークバー：クリック/ドラッグ、マーカーのドラッグ移動、前/次マーカー移動
- [ ] Backup→Importで元に戻る（旧形式のファイルも読める）
- [ ] SP幅：パネル開閉でプレイヤーが隠れない、Colorパネルがプレイヤーを覆わない

---
参照規約：YouTube API Services Developer Policies（2026-09-14更新版を確認）／作成日 2026-09-29／全面改訂 2026-09-30（v2.23.0時点）


## 付録：スペースキーで再生/一時停止（v2.25.0）
- アプリ表示中のみ有効（`onShow`でリスナー登録、`onHide`で解除）。公式の`getPlayerState()`/`playVideo()`/`pauseVideo()`を、利用者のキー操作を起点に呼ぶだけ。規約OK（§2の「playVideoは利用者操作から」を満たす）。
- 文字入力中（input/textarea/select/contenteditable）・Ctrl/Alt/Meta/Shift併用・キーリピートは無視。動画が未読み込みなら何もしない。
- YouTube iframe内にフォーカスがある時のスペースはYouTube側の標準動作（親ページには届かない）。

## 付録：YouTube本家と同じショートカット＋Keyboardパネル（v3.1.0）
- 上の「スペースキー」の仕組み（`onShow`で登録／`onHide`で解除、`onSpaceKey`）を拡張。公式メソッドを利用者のキー操作を起点に呼ぶだけ。
- キー：Space/K 再生⇄一時停止、J/L ±10秒、←/→ ±5秒、↑/↓ 音量±5%、M ミュート、0〜9 動画の0〜90%へ、Home/End 先頭/末尾、`,` `.` 一時停止中のみ1フレーム(約1/30秒)、`<` `>`(Shift+,/.) 速度−/＋（`availableRates()`を1段階、Speedチップにも反映・`qn_yt_rate`へ保存）、Shift+P/N Libraryの前/次の動画（`gotoNeighbor`）。
- 意図的に入れていないもの：F(全画面)・T(シアター)・C(字幕)・I(ミニプレイヤー)など、iframe内部の機能。
- 音量・速度・ミュートの変更は`QNApps.toast()`で一言表示。文字入力中・Ctrl/Meta/Alt併用は無視。ページスクロール防止のため、処理したキーは`preventDefault`。
- サイドバーの最後に`Keyboard`項目（`data-panel="keyboard"`・`.qn-yt-sec-keyboard`）。表の組み立ては共通の`QNApps.renderShortcuts(hostEl, "youtube")`（qn-apps.js、PLと同じ`<kbd>`表示）。一覧の元データは`SHORTCUTS`配列で、`QNApps.register({shortcuts, shortcutsNote})`で登録している。

## 付録：シークバー下のコントロールバー（v3.2.0）
- `.qn-yt-bar`（`BAR_HTML`）。PLAYERの下段バー(`#pcV2BottomBar`/`.pcv2-ctrl-btn`/`.tripleNavBtn`)と同じ枠なしフラットなアイコン＋英字。並び：再生系（Track / -10s / Play / +10s / Track / Auto Next）│ マーカー系（Marker / +Marker / Marker / Loop / A・B表示 / Clear AB）│ スピード（− 1x Speed ＋）。
- PC幅：`.qn-yt`のgridで、左=パネル(縦いっぱい)、右=ステージ＋その下のバー。バーはステージ側の下端に吸着し、サイドバー/パネル側へは伸ばさない。横幅が足りない時はバー内を横スクロール。
- SP幅：PLAYER同様、アイコンバーの直上に固定（`position: sticky; bottom: 0`、横スクロール、アイコン・文字を大きく）。パネルを開いている間は隠す（従来の自前UIと同じ）。※PLAYERにある「PLAY/MARKERアンカータブ」は未対応。
- 旧`.qn-yt-ctrl-row`（Prev/Next・±10s・Marker・Speedチップ・Auto Next行・AB行）は撤去。機能は維持：Auto Nextは`.is-active`のボタンに、LoopはON時`.is-active`（ABが無い間は`disabled`）、スピードチップは`−/＋`ステッパーに変更（`stepRate`。本家ショートカット`<` `>`と同じ処理）。
- 再生ボタンは`updatePlayBtn`がアイコン＋「Play/Pause」表示ごと差し替える。

## 付録：シークバー1クリック/1タップ → A / B / +Marker ポップアップ（v3.3.0）
- シークバー(3行のどこでも)を**動かさずに**押して離すと、通常どおりその位置へシークし、同時にその位置の真上（収まらなければ真下）へポップアップ（`showSeekPop`）。ドラッグ（4px超の移動）の時は出ない。マーカー上の操作は従来どおり（ポップアップなし）。
- ボタン：A(Start)／B(End)／＋(Marker)。ABは「マーカー」で持つ仕組みのため、押した位置（0.1秒単位）にマーカーを作ってA点/B点にする（`seekPopAction`）。**±0.5秒以内に既存マーカーがあれば新規作成せずそれを使う**。A/Bが両方そろうとLoopが押せるようになる（自動ONにはしない）。保存形式の変更なし（Backup/Import影響なし）。
- 閉じ方：4秒放置・外側のタップ・Esc・選択後・resize・アプリを隠す時。body直下のposition:fixed（z-index 330、プレイヤーには重ねない）。
- 押した結果は`QNApps.toast()`で一言表示。

## 付録：PC幅のパネル格納（v3.4.0）
- PC幅で、開いているパネル(Library等)のサイドアイコンをもう一度押すと、パネル(375px)が左へ縮んで格納される（`.qn-yt.qn-yt-collapsed`、gridの`grid-template-columns: 0 1fr`を220msでアニメーション）。格納中にどのアイコンを押しても、パネルが開いてそのパネルを表示する。
- **プレイヤー(iframe)は広げない**：格納前と同じ幅で固定（`--qn-yt-player-w`＝min(1280, ステージ幅−375−48)、`applyCollapse`）。シークバー・コントロールバーは広がる。
- 格納中はサイドアイコンの選択表示を外す（`setSideActive(null)`）。状態は`localStorage: qn_yt_panel_collapsed`に保存し、再読み込み後も維持。
- SP幅は従来どおり（同じアイコンをもう一度でパネルを閉じる）。この格納は使わず、クラスも付かない。

## 付録：PC幅のステージ配置／LOOP 3モード（v3.4.1）
- **ステージ配置（PC幅）**：プレイヤー領域(`.qn-yt-player-wrap`)が、タイトル・シークバー3本を除いた余りの高さを全部使い、中のプレイヤーは16:9のまま「領域の横か縦のどちらかが枠に当たるまで」最大に拡大（container queries：`min(100cqw, 100cqh*16/9)`）。シークバー3本まで1画面に収まる。最小高200px（規約）を下回る小さな窓ではステージがスクロール。SP幅は従来どおり。
- **撤去したもの**：タイトル下の時刻表示（`curTime/durTime`）、シークバー下のヒント文、ステージ下のフッター（権利者への注意書き＋広告枠）。※YouTube API利用・規約リンクの表示は、Libraryパネル内の`.qn-yt-legal`に残っている。
- **LOOPボタン（1つで3モード）**：押すたびに `OFF → A-Bループ → 区間ループ → OFF`（A/Bが未設定の時はA-Bを飛ばして `OFF → 区間 → OFF`）。`current.loopMode`=`off|ab|sec`（`setLoopMode`。`current.looping`は「ループ中か」の互換用）。ボタンのラベルは Loop / A-B Loop / Section。
- **区間ループの区間**：ボタンを押した時点の再生位置を含む「マーカー〜次のマーカー」。前にマーカーが無ければ動画の先頭から、後ろに無ければ動画の終わりまで（`sectionRangeAt`。押した時に区間を固定し`current.secRange`へ保持）。ループ帯（シークバー上の色帯）にも表示。保存はしない（動画を開き直すとOFF）。**v3.4.3〜：区間は再生位置に追従**（下記）。
- 区間の終わりが動画の終わりの時は、`ended`になる前(終了0.3秒前)に先頭へ戻す。

## 付録：A/B設定の拡充とプリロール（v3.4.2）
- **既存マーカーのクリック/タップ**でも、その位置にA / Bのポップアップが出る（＋Markerは出さない。通常どおりそのマーカーへシークもする）。ドラッグで動かした時は出ない。
- **下段バーの Set A / Set B**：現在の再生位置にマーカーを作って（±0.5秒以内に既存があればそれを使う）A点/B点に設定（`setLoopPointAt`。ポップアップと共通処理）。ボタンのラベルは設定済みの時刻（`A 01:00`／`B --`）、設定済みの間はテーマ色。旧「A/B時刻表示」は撤去（ボタンに統合）。
- **A/B区間の視覚化**：区間の色帯を濃く＋上下に3pxのテーマ色の線（ループON中はさらに濃く）。A点・B点のマーカーは線を太くし、「A」「B」の旗（`.qn-yt-marker-ab`）を付ける（A=線の右、B=線の左）。
- **プリロール/ポストロール**（PLAYERの`loopPreRollSeconds`と同じ考え方：前後共通の秒数）：Loopの右のステッパー（`−／＋`、`qn_yt_preroll`に保存、0〜10秒・1秒刻み）。折り返しは「区間の終わり＋秒数」まで再生し、「区間の開始−秒数」へ戻る（A-Bループ・区間ループの両方）。※PLAYER本体の刻み・上限は`player-controls.js`側のため未確認。必要なら合わせる。
- 下段バーが長くなったためPC幅のボタン左右余白を詰めた（1280px幅で1行に収まる。狭い窓では横スクロール）。

## 付録：区間ループの追従（v3.4.3）
- Sectionモード中、`poll()`が再生位置`t`を見て、`t`が現在の区間から外れたら（開始−プリロール−1秒 より前、または 終了＋プリロール＋1秒 より後）、その位置を含む区間（`sectionRangeAt(t)`）へ`current.secRange`を切り替える。帯・トースト(`Section mm:ss - mm:ss`)も更新。
- 区間の終わりに達した時は従来どおり区間の先頭へ戻る（自然再生で次の区間へ進むことはない）。つまり「別の区間へシーク/マーカー移動したら、そこがループ区間になる」動き。
- 判定にプリロール分の余裕を入れているのは、折り返しの前後（プリロール再生中）に誤って区間が切り替わらないようにするため。

## 付録：ポップアップの－Marker（削除）（v3.4.4）
- 既存マーカー上のポップアップ（A / B / －Marker）に削除ボタンを追加（`data-pop="D"`。マーカーが無い位置では非表示で、代わりに＋Markerが出る）。
- 誤タップ防止：1回目で「Sure?」（赤）に変わり、3秒以内にもう1回押すと削除（`seekPopDelete` / `armSeekPopDel`）。ポップアップが閉じると解除。
- 削除時：そのマーカーを指すA/B点は外し、A-Bループ中なら解除。区間ループ中は区間を引き直す。保存(`persistMarkers`/`persistLoop`)とトースト付き。

## 付録：ポップアップの Color / Hide（v3.4.5）
- 既存マーカー上のポップアップは `A / B / － / Color / Hide` の5ボタン（＋Markerは出ない）。
- **Color**（`data-pop="C"`）：ポップアップを閉じ、シークバー上のそのマーカー(`data-mid`)を基準に、Markersパネルの色ボタンと同じ`openColorChoicePopup`を開く。ボタンの丸は現在のマーカー色。
- **Hide**（`data-pop="H"`）：`m.enabled=false`（Markersパネルの目と同じ）。シークバー上から消えるので、再表示はMarkersパネルの目から。
- SP幅はボタン最小幅を54pxに縮小（5個でも360px幅に収まる）。

## 付録：PLAYER側のポップアップ／Color崩れ修正／プリロール（v3.5.0）
- **Colorの崩れ修正**：`.qn-yt-seekpop-btn b`をflexにしたせいで、丸(14px)だけ高さが縮み、他のボタンより上にずれていた。`b`に固定の高さ（PC 26px／SP 30px）を付けて解消。
- **プリロール上限を5秒に**：PLAYERの実値（`player-controls.js`：0〜5秒・1秒刻み・前後共通）に合わせた（`PREROLL_MAX = 5`。保存済みの6秒以上は0に戻る）。
- **PLAYER側のシークバーポップアップ**（`player-markers.js`の`showPinPopup`。クラスは`.qn-yt-seekpop`をYouTubeと共用、`.qn-pl-seekpop`を併記）。従来のクリック→シーク＆再生はそのまま、加えて：
  - 空いている位置：`＋ Marker`（その位置にマーカー追加）。
  - 既存マーカー：`－ Marker`（1回目Sure?→2回目で削除）／`Color`（`openMarkerColorPicker`。無料版は従来どおり不可のトースト）／`Hide⇄Show`（`pin.enabled`切替。PLAYERでは波形上に残り無効表示になるので、Show表示で戻せる）。
  - A/Bは出さない（PLAYERのループは「マーカー〜次のマーカー」でA/Bの概念が無いため）。
  - マウスのドラッグ直後のclickではポップアップを出さない（`lastPinDragAt`）。タップは`startDragPin`のstop内で出す。無料版でロック中のマーカーは従来どおり出さない。
  - 波形マーカー線に`data-pin-index`を付与（Colorの基準位置の取得用）。
- 変更ファイル：`JS/player-markers.js`、`JS/player-ui-shared.js`（バー1クリック後に呼ぶ）、`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`。

## 付録：PLAYER側のA/B・LOOP 3モード（v3.7.0）
YouTubeアプリと同じ考え方をPLAYERにも入れた（マーカー機能は両アプリで基本統一する方針）。
- **データ**：A点/B点はマーカー自身に`pin.ab = "A"|"B"`として持たせる（PLAYERのマーカーはIDを持たないため。`mp3_pins_<ファイル名>`にそのまま保存される）。同じ種類は常に1つ。1つのマーカーがA兼Bにはならない。`getABRange()`（player-core.js）がA・Bの揃った時だけ`{start,end,color}`を返す。
- **LOOPボタン**（`#loopToggleBtn`、`player-controls.js`）：押すたびに `OFF → A-B → Section → OFF`（A/B未設定の間はA-Bを飛ばす）。ラベルは Loop / A-B Loop / Section。`loopEnabled`（ON/OFF）＋`loopMode`（`"ab"|"sec"`）で持ち、保存は`mp3player_loop_mode`（旧`mp3player_loop_enabled`も書き続ける）。Section＝従来のマーカー〜次のマーカーのループ（再生位置に追従）。A/Bが無くなった時はA-Bを自動でOFFに戻す（`syncLoopModeWithAB`。保存はしない）。
- **折り返し**：`updateBars()`内。A-Bは`loopWrapAB()`（`player-ui-shared.js`）で、Sectionと同じくプリロール/ポストロール・無料版の回数制限・Auto Speedの周回カウントを適用。区間帯・ハイライトは既存の`segmentHighlight`を流用（`getActiveSegment`がA-B中はA〜Bを返す）。
- **設定方法**：①波形バーのポップアップ（空き位置＝`A / B / ＋Marker`、既存マーカー＝`A / B / － / Color / Hide⇄Show`。A/Bは設定済みの所を押すと解除、設定済みは地色で表示）。②下部バーの`Set A` / `Set B`（`#setABtn`/`#setBBtn`、現在地。±0.5秒以内に既存マーカーがあればそれを使い、無ければ作る。ラベルは`A 01:00`／`B --`、設定済みはテーマ色）。
- **見た目**：A・Bのマーカー線を太くし「A」「B」の旗（`.vbar-ab-flag`）を付ける。
- **バックアップ**：`markers[].ab`を追加（`player-track-backup.js`。古いバックアップ・`ab`なしも読める）。
- 変更ファイル：`JS/player-core.js`、`JS/player-ui-shared.js`、`JS/player-controls.js`、`JS/player-markers.js`、`JS/player-track-backup.js`、`JS/player-ui-pc-v2.js`、`CSS/style-apps.css`、`index.html`。

## 付録：再生ボタン・Library前/次ボタン（v2.26.0）
- シークバー下の`.qn-yt-transport`行（Prev / 再生⇄一時停止 / Next）。すべて利用者のクリックを起点に公式メソッド（`playVideo`/`pauseVideo`/`loadVideoById`）を呼ぶだけ。
- Prev/Nextは`skip`を飛ばす。Auto Nextと違い、可視判定は不要（利用者操作のため）。

## 付録：Save = 読み込み＋保存（v2.27.0）
- Loadボタンはなし。入力欄のURLが基準で、Libraryに同じ動画があればタイトル更新、無ければ新規追加。保存後は入力欄を空に戻す。


## 付録：サムネイル表示とフッター（v2.29.0）
- Libraryの各行に、`https://i.ytimg.com/vi/<videoId>/mqdefault.jpg`を`<img>`で**表示のみ**（16:9のまま全体表示、`object-fit: contain`、角丸・切り抜き・加工なし）。
  保存（localStorage・キャッシュ化・Backup）には含めない。読み込めない時は再生アイコンのまま。
- YouTubeアプリ画面のフッターに、YouTube利用規約・Googleプライバシーポリシーへのリンクと、「保存データは端末内のみ・YouTubeと通信する」旨の説明を常設。

## 付録：Geminiへの規約確認の結果（未検証の参考情報）
※ 回答は公式原典で未確認。条番号はGemini自身が「旧版の混同あり」と訂正しているため、実装判断の根拠にしない。
- 実装済み機能（埋め込み再生・外側の自前UI・公式メソッドのみ・背景再生の防止 等）：問題なしとの見解。
- サムネイル：表示のみ・保存なし・加工なしならOK。
- 動画下タイトルの転記保存（案A）：oEmbedのデータを永続保存すると「API Dataの30日ルール」に触れる可能性。「Saveを押せば利用者の文章扱い」とする解釈は危うい → **見送り（手動のコピー＆貼り付けのみ）**。
- チャプター自動取得（案C）：HTMLスクレイピングはNG。Data API経由は可能性があるが、APIキー・保存制限・審査の扱いが増えるため見送り。
- コンプライアンス監査：「不要と明記」ではなく「クォータ増枠申請時が対象。IFrame API+oEmbedのみの構成では対象外のはず」という程度の見解。断定しない。
- 公開時：YouTube利用規約とGoogleプライバシーポリシーへのリンク掲載を推奨（→ v2.29.0で対応済み）。

## 付録：A/Bは「使い捨ての区切り位置」（v3.8.0・上記のA/B記述を置き換え）
- PLAYER・YouTubeとも、A/Bはマーカーに紐づかない。秒数だけの独立した点で、旗（A=右、B=左）をドラッグして動かせる。マーカーは作られない／削除してもA/Bは残る。
- 同位置(±0.5秒)で再度A/Bを押すと解除。ポップアップの「－ Point」でも解除。
- 保存：YouTube=動画ごと（`loopA/loopB`は秒数。旧マーカーID形式は`abTimeOf`で変換）、PLAYER=`mp3_ab_<ファイル名>`（`{a,b}`）。
- バックアップJSON：トラックごとに`abA`/`abB`（秒数）。
- v3.7.0付録の「マーカー付属の`pin.ab`」「近くのマーカーにスナップ」は廃止。

## 付録：PLAYERとYouTubeの共通ルール（v3.11.0）
- マーカー／区間ループ／A-B／前後マーカー移動の「判定ルール」は `JS/qn-marker-core.js`（`QNMarkerCore`）に集約し、PLAYER（`player-ui-shared.js`のupdateBars、`player-markers.js`の前後移動）とYouTube（`qn-app-youtube.js`）の両方から使う。秒数だけを扱う純粋な関数で、音声やYouTubeプレイヤーには触らない。
- 区間 = 「表示ONのマーカー〜次の表示ONのマーカー」。マーカーが2つ未満なら区間ループは動かない。最初のマーカーより前は最初の区間、最後より後は最後の区間（YouTubeの「動画の先頭/終わりまで」扱いは廃止）。
- 区間の許容範囲 = 区間の前後にプリロール/ポストロール秒を足した範囲（±0.05秒）。その外へ出たら位置の区間へ切り替える。
- 前/次マーカー：区間ループ中のプリロール/ポストロール再生中は区間の内側にいるものとして扱う。次が無ければ最初、前が無ければ最後へ戻る。移動後は再生する。
- A-Bループ中にA〜Bの外側をクリック（シークバー・マーカー・A/B点・マーカー一覧）したら、LOOPをOFFにする（A/B点は残る）。
- シークバー/マーカーのクリックはシーク＋再生（YouTubeは利用者操作を起点に`playVideo()`）。
- 残る違い（媒体の違いによる）：PLAYERの無料版制限、YouTubeの規約上の制約（プレイヤーに重ねない等）、保存先。
