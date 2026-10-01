# QN-PLAYER バージョン履歴

`window.QN_APP_VERSION`の更新履歴。「前回どこまで進んだか」の確認用。**新しい版は末尾に追記**（`## <版> — <一言>`＋箇条書き）。
細かい調整・不具合修正の経緯は、再発しうる教訓だけ`GOTCHAS.md`に残し、ここには残していない（古い版は大きな節目だけに畳んである）。

---

## 2.x（〜2.31）の主な節目
- **2.2** マーカーループのプリロール/ポストロール。
- **2.5〜2.12** Backup/Import（1曲→ライブラリ一括、ZIP、音声なし出力、モーダル分離）／お気に入り（ピン留め）／削除のフェード演出／ループのシーク混線の修正。
- **2.13** SP下部コントロール拡大とPLAY/MARKERアンカータブ。再生中にSPが強制再読み込みされる不具合・並び替え後に再生できなくなる不具合を根本修正（波形描画の間引き、IndexedDBの音声レコードを書き直さない設計＝メタデータを`qn_playlist_meta_v1`へ）。
- **2.14〜2.16** Backup/Importのパネル化、PC版の重さ対策（非表示時のbackdrop-filter等）、マーカーメモのプリセットと自動カラー、UIデザイン統一（角丸・文字サイズ・ボタンのトークン化）、シークバー高さの自動化、常時アニメーション撤去、PC v2のCSSをシェルとパネルに分割。
- **2.17〜2.31** アプリ基盤（QNApps）とYouTubeアプリの統合：Library/Markers/3行シークバー/ABループ/Auto Next/チャプター貼り付け/Backup・Import/サムネイル表示、アプリ中のColor常駐、マーカーメモのカスタムプリセット、再生中の画面スリープ防止(Wake Lock)、最後に開いたアプリの復元、バックグラウンド再生対策。

## 3.x
- **3.0** アプリ切替をバッジ(＞)のフライアウトに変更（MORE撤去）。**3.0.3** PLAYERアプリのサイドバー並びを変更。
- **3.1** YouTubeにYouTube本家準拠のショートカット＋Keyboardパネル。
- **3.2** YouTubeのシークバー下コントロールをPLAYER下段バーのデザインに統一。
- **3.3〜3.4** YouTube：シークバー1タップのA/B/＋Markerポップアップ、PC幅のパネル格納、プレイヤーを縦いっぱいに拡大、LOOP 3モード、プリロール、区間ループの追従、ポップアップに－Marker/Color/Hide。
- **3.5** PLAYERの波形ポップアップ（＋/－/Color/Hide）。**3.6** Speed/Keyを「アイコン(ON/OFF)＋−＋」の操作に統一。
- **3.7〜3.8** PLAYERにもA/BとLOOP 3モード。**3.8.0** A/Bをマーカーに紐づけない「使い捨ての区切り位置」（秒数のみ）に変更（PLAYER・YouTube共通）。
- **3.9** ポップアップのColorを「ラベル入力＋プリセット＋色」に。
- **3.10〜3.12** PLAYER下部バーのSpeed/Keyステッパー化・全ボタンを「アイコン＋ラベル」に統一、YouTube下段バーと寸法統一。**3.11.0** マーカー/ループ判定を`JS/qn-marker-core.js`に共通化。
- **3.13.0** PLAYER下段バーを右カラム下端（波形の真下）へ集約（PC幅。`#pcV2Layout`を2行grid化。必要幅が足りなければ横スクロール）。
- **3.14.0** PLAYERのパネル格納（PC幅。サイドアイコン再押下で格納、`qn_panel_collapsed`に保存）。
- **3.15.0** 時刻表示を曲名の行（`#pcV2WaveHead`）へ移設。狭いPC幅ではVolume/Speed/Key/EQを下段バーから隠す（パネル展開中1340px以下、格納中960px以下）。
- **3.16.0** PLAYER下部バーをYouTubeと完全に揃える。Startを撤去し±10sを追加。
- **3.17.0** サイドバーの下段を「Backup / Import / Keyboard / Color」に統一。Backup/Importを本体の1画面に共通化（YouTubeは`qnBackupMountInto`で借りる）。結合ZIP（`markers.json`＋`audio/`＋`youtube.json`）。
- **3.18.0** Keyboard表の共通化（`QNApps.renderShortcuts`）。
- **3.19.0** Backup/Import CSSの共通化（`:is()`で両アプリ共用）。`QNApps.register`に`shortcuts`/`shortcutsNote`。
- **3.20.0** YouTubeのColorパネルにもMarker Memo Colorsを表示。

## お掃除（見た目・動作は変えない）
- **3.20.1** 未使用コードの削除：使われていない関数4つと、HTML/JSに出てこないCSSクラスのルール約50個（旧YouTube画面の名残など）。動的に組み立てるクラス名（`.is-a`/`.is-b`、`.pcv2-panel-*`）は残した。
- **3.20.2**
  - 未使用のHTML id 10個と`.qn-yt-title-edit`を削除。`hexToRgbaLocal`を`hexToRgba`に統合、`player-ui-pc-v2.js`内のSP幅判定を`isSpWidthNow()`に統一。
  - 大きいファイルの分割（読み込み順は維持）：`style-apps.css`→`style-apps.css`（アプリ枠）＋`style-youtube.css`、`style-layout-pc-v2.css`→PC幅＋`style-layout-pc-v2-sp.css`（SP幅）、`player-markers.js`→`player-markers.js`＋`player-marker-presets.js`。`player-ui-pc-v2.js`と`qn-app-youtube.js`は1つの関数内で多数の変数を共有しているため分割しない。
  - mdの大整理：実装済みの`PLAYER_LAYOUT_V3_SPEC.md`と古い`HANDOFF_NEXT_CHAT.md`を削除、`GOTCHAS_REFERENCE.md`＋チェックリストを`GOTCHAS.md`に統合・圧縮、`YOUTUBE_APP.md`の版ごとの付録を現行仕様に統合、`DOM_ID_REFERENCE.md`/`UI_TERMINOLOGY.md`/`PC_V2_FILE_INDEX.md`を現行コードに合わせて縮小、存在しないファイルを指すコメント・ドキュメントを修正。
  - 確認：Playwrightで33画面（PC1440/SP390×PLの各パネル・YouTubeの各サイドメニュー）の計算済みスタイルを前後比較して差分0。音声読み込み→Backup→Import、マーカー追加・メモ編集、ページエラー0を確認。実機・実YouTube再生は未確認。
