# QN-PLAYER バージョン履歴

`window.QN_APP_VERSION`更新ごとに**末尾へ1行追記**（`- 版 一言`）。経緯・不具合の詳細は書かない（再発しうる教訓だけ`GOTCHAS.md`）。

- 〜3.20.0 PLAYER(PC v2)＋アプリ基盤(QNApps)＋YouTubeアプリ(Library/Markers/3行シークバー/A-B/Auto Next/Backup・Import共通画面)まで実装済み。詳細は各mdの現行仕様を参照。
- 3.20.1 未使用JS関数・未使用CSSクラスを削除（動的クラス`.is-a/.is-b`・`.pcv2-panel-*`は残す）。
- 3.20.2 未使用id削除、重複関数統合、大型ファイル分割(`style-youtube.css`/`style-layout-pc-v2-sp.css`/`player-marker-presets.js`)、md整理。`player-ui-pc-v2.js`/`qn-app-youtube.js`は共有変数が多く分割しない。
- 3.20.3 JS/CSS/HTMLのコメントを「注意・禁止・規約・順序依存・仕様メモ」だけに圧縮。検証用swDebugコード(JS/CSS)と無効なCSSルール(`.tripleNavBtn`重複)を削除。
- 3.20.4 YouTubeに無断アップロード禁止の注意書きを再表示、Set A/Bのツールチップ修正。Backup/Importの外枠(モーダル)とPC v2の旧レイアウト復元処理(`deactivate`/anchor)を削除し、Backup/Import表示を`qnBackupMount`に一本化。
- 3.21.0 TUNERアプリを追加(qn-app-tuner.js/qn-pitch-core.js/style-tuner.css)。Mic Tuner(Gauge/Guitar Meter)・Tone Generator・Sensitivity・Display。PLAYERのパネル/下段バー/部品デザインで統一。QNPITCH(旧アプリ)から移植、保存キーはqn_tuner_*で新規。
