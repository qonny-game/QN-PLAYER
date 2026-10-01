# 次のチャットへの引き継ぎメモ（2026-10-01 / v3.12.7 時点）

このファイルは、新しいチャットで作業を再開する時に最初に読ませるためのもの。`PLAYER_LAYOUT_V3_SPEC.md`（次の大仕事の仕様）と一緒に渡す。

---

## 1. 進め方のルール（ユーザーの常設ルール）

- 口調：**陽気でフレンドリーな日本語**。
- 納品：**変更したファイルだけ**のパッチZIP。**フォルダ構成を保つ**（`JS/`、`CSS/`、`md/`、ルートに `index.html`）。**`PATCH_FILES.txt` は作らない。**
- 毎回：`index.html` の `window.QN_APP_VERSION` を上げる／`md/CHANGELOG.md` に追記／関係するmd（`YOUTUBE_APP.md`、`DOM_ID_REFERENCE.md`、`PC_V2_FILE_INDEX.md` など）を更新。
- 作業環境は**使い捨て**：新しいチャットでは、触るファイルを**ユーザーにアップロードしてもらう**（必要なファイルを最初に聞く）。`style-pcv2-panels.css` のように、手元に無くて困ったファイルが過去にあった。
- 実ブラウザで動作確認できない（`node --check` と、ヘッドレスChromeでの簡易CSS確認まで）。**確認できていないことは正直に書く。** ユーザーのスクショが最重要の手がかり。

## 2. プロジェクトの現状

- **QNPLAYER**：ブラウザ完結のMP3プレイヤー。PC v2のDOMが唯一の実装で、SP幅（≤900px）は同じDOMをCSSで組み替える。
- **QNApps**：本体の中でアプリを切り替える枠組み（`JS/qn-apps.js`）。いまは **YouTubeアプリ**（`JS/qn-app-youtube.js`）が入っている。YouTubeは規約遵守が最優先（公式メソッドのみ・利用者操作起点・プレイヤーに重ねない・最小200px）。
- 共通コード：**`JS/qn-marker-core.js`**（v3.11.0〜）に、PLAYERとYouTubeで共通の「区間の決め方・プリロール込みの範囲判定・前後マーカー移動・A-B範囲外判定」を集約。**マーカー/ループの挙動を直す時は、まずここ。** 折り返しの実処理（`audio.currentTime` / `player.seekTo`）は媒体が違うため別実装のまま。
- 主なファイル（PLAYER側）：`player-core.js`（状態・A/B保存）、`player-ui-shared.js`（`updateBars`＝毎フレームのループ処理・波形）、`player-markers.js`（マーカー・ポップアップ・A/B点・Color/ラベル）、`player-controls.js`（Speed/Key/LOOPボタン）、`player-ui-pc-v2.js`（PC v2のDOM組み立て・下段バー）、`player-track-backup.js`、CSSは `style-core.css` / `style-layout-pc-v2.css` / `style-pcv2-panels.css` / `style-apps.css`（**最後に読み込まれ、PLAYERとYouTube共通の指定もここ**）。

### 保存キー（localStorage）
`qn_yt_*`（YouTube）、`mp3_pins_<ファイル名>`（マーカー）、`mp3_ab_<ファイル名>`（A/B点 `{a,b}`）、`mp3player_loop_mode` / `mp3player_loop_enabled`、`qn_marker_preset_colors_v1` / `qn_marker_custom_presets_v1`（ラベルのプリセット。PLAYERとYouTubeで共用）、`qn_yt_panel_collapsed`、`qn_yt_rate`、`qn_yt_preroll`。

### 現在の仕様の要点（最近の変更）
- **A/B**：マーカーではない「使い捨ての区間点」（秒数だけ）。波形/シークバー上でドラッグ移動、同じ位置(±0.5秒)でもう一度押すと解除、ポップアップの「－ Point」でも解除。マーカーを消しても残る。バックアップJSONは `abA`/`abB`（旧形式も読める）。
- **LOOP 3モード**：OFF → A-B → Section → OFF。A-B中にA〜Bの外をクリック（波形・マーカー・A/B点・一覧）するとLOOP OFF（A/B点は残す）。
- **区間（Section）**：表示ONのマーカー同士。2つ未満だと動かない。プリロール/ポストロール（0〜5秒）込みの範囲内なら今の区間のまま。
- **クリックの挙動**：シークバー/マーカーのクリック＝シーク＋再生（YouTubeは `playVideo()` を利用者操作起点で）。
- **ポップアップ（シークバー/波形のクリック）**：空き位置＝A/B/＋Marker、マーカー上＝A/B/－Marker(2回タップ)/Color/Hide。**Color＝ラベル入力＋プリセット＋色のセット**（`openMarkerStylePopup`、PLAYERとYouTube共通）。
- **下段バー（PLAYER `#pcV2BottomBar` とYouTube `.qn-yt-bar`）**：全ボタン「アイコン＋ラベル」、寸法はv3.12.6で共通化（`style-apps.css` 末尾）。Speed/Keyは `−［アイコン 値/名前］＋` のステッパー（アイコン＝ON/OFF）。YouTubeのSpeedはアイコンを押すと1xに戻る。

## 3. 次にやる大仕事

`PLAYER_LAYOUT_V3_SPEC.md`（改訂済み）：**仕様A＝下段バーを右カラム下端へ集約（v3.13.0）→ 仕様B＝パネル格納（v3.14.0）**。各段階でパッチを分け、実機確認を待ってから次へ。
着手前に決める最重要事項：**§8-4 下段バーの必要幅が約1000px（概算）で、1280pxでもはみ出す**。まずDevToolsで `#pcV2BottomBar` の `scrollWidth` を実測して、方式（横スクロール／コンパクト表示／要素の移動）を決める。

## 4. 未解決・要確認（ユーザーに聞く/確認する）

- アプリ一覧フライアウト（PCで「シュッ」と出ない）：OSの「視覚効果を減らす」設定が原因の可能性が高いとして v3.11.1 でCSSの該当指定を削除済み。**ユーザーの実機で直ったか未確認。**
- YouTubeの実再生（プリロール中に別区間へ飛ぶ件を v3.10.2/v3.11.0 で修正）：**実機で未確認。**
- YouTubeのスクロールバーはPLAYERのパネルと同じ値に揃えた（v3.12.2）。見た目の最終確認はユーザー。
- PLAYER下段のSpeed/Keyステッパーの詰め具合・上揃え（v3.12.3〜v3.12.6）：**スクショ確認待ち**。
- SP幅の見た目は、ここ最近の下段バー変更（v3.12.4〜v3.12.6）後に**未確認**。
- A-Bループの折り返し処理を共通コアに寄せるか（動作確認できないため据え置き）。

## 5. 過去の失敗から得た教訓（同じことを繰り返さない）

1. **大きな文字列置換で、無関係なコードを巻き込んで消した**（v3.8.0で `preRoll`/`setPreRoll`/`renderPreRoll`/`setBtnLabel` が消え、YouTubeが壊れた。v3.10.1で復旧）。→ 大きく書き換えた後は、**直前の版と関数名・トップレベル変数の差分（`diff`）を取って、意図しない削除が無いか確認**する。`node --check` だけでは見つからない。
2. **マウスのクリックが効かないバグ**（v3.7.1）：ドラッグ処理の終了時にDOMを作り直すと、元の要素が消えて `click` が届かない。→ タップ処理は `pointerup`/`stop()` 側で行い、`click` との二重処理を時刻ガード（`lastPinTapAt`）で防ぐ。
3. **スクショが出たら最優先で原因を読む**：Colorボタンのレイアウト崩れ（固定高さが無かった）、Speed/Keyが−＋ごと見えない（`.pcv2-ctrl-btn span{display:none}` が原因）など、CSSの「別の場所の既存ルール」が原因のことが多い。**既存ルールを `grep` で探してから足す。**
4. **ヘッドレスChromeは使える**：`python3` の `playwright`（`p.chromium.launch()`）で、実CSSを読み込んだ簡易HTMLの挙動（transition・clip-path・prefers-reduced-motionなど）を再現して確認できる（フライアウトの件で実績あり）。
5. **ファイルが手元に無い時は推測で作らず、ユーザーにアップしてもらう**（`style-pcv2-panels.css` の時のように）。

## 6. 新しいチャットの最初にやること

1. このファイルと `PLAYER_LAYOUT_V3_SPEC.md` を読む。
2. ユーザーに、作業に必要なファイル（最新のJS/CSS/index.html/md一式）のアップロードをお願いする。
3. §3 の「バー幅の方針（§8-4）」をユーザーと決めてから、仕様A（v3.13.0）に着手する。
