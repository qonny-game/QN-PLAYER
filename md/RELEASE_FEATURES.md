# 隠した機能を公開する手順 (RELEASE_FEATURES.md)

v4.59.0で、**tab / stem / rec / chords** を公開版で非表示にした（スイッチは `JS/qn-features.js` の `F`）。隠している間も、コードと保存データはそのまま残る。このファイルは「また出す」ための手順書。仕組みの詳細は `GOTCHAS.md`「機能の表示ON/OFF」。

## 1. 機能ごとの中身と依存
| 名前 | 隠れるもの | 注意 |
|---|---|---|
| `tab` | Tabパネル(TAB/五線譜・Basic Pitch解析・譜面ビュー) | 解析元のパートは `stem` に依存。`stem`がOFFだとMixだけ |
| `stem` | Stem分離(パネル・FAB・保存済みstem) | PC専用。モデルの初回ダウンロードあり(利用規約/プライバシーに記載が要る) |
| `rec` | 録音(Rec) | マイク権限を使う。iOSはaudioSession切替(v4.55.1)あり |
| `chords` | コード表示・拍/小節解析・Grid click・マーカーの小節/拍吸着・Grid follows markers | 拍解析に頼る機能をまとめた名前。SP/PCのFAB(メトロノーム/吸着)もこれに連動 |

## 2. 公開する手順（1機能ずつ、または全部）
1. `JS/qn-features.js` の `var F = { tab: false, ... }` を、出したい機能だけ `true` にする。
2. 先に **開発用の上書きで確認**できる: コンソールで `localStorage.qn_dev_features = "tab,stem"`（全部は `"all"`）→再読み込み。戻す: `localStorage.removeItem("qn_dev_features")`。
3. ガイドを確認: `guide/*.html` の `data-feature="…"` が付いた箇所は、その機能がONになると自動で出る。印の付け忘れ・付けすぎが無いか、各ガイドを開いて見る。
4. ガイドのスクリーンショットを撮り直す: `md/tools/guide_shots.py`（出す機能の画面が写る画像があるか）。
5. `terms.html` / `privacy.html` を見直す（`md/USER_DOCS.md` §7）。特に `stem`（モデルのダウンロード、端末内処理）、`rec`/`tab`（マイク、IndexedDBに保存するもの）。隠している間は記載を消していないなら、そのままで足りるか確認。
6. 各機能のREADME相当(`md/TAB_MODE.md` など)と、`CHANGELOG`の一言に「○○を公開」と書く。
7. 確認コマンド:
   - `python3 md/tools/e2e_features.py`（PC/SP、既定とdev=all、ガイドも）。**公開で既定が変わるので、期待値（OFFのはずの項目）を直す**。
   - `python3 md/tools/qa.py --quick` → 出荷時は `qa.py --ship 版 "一言"`。
8. 実機確認（headlessでは出来ない部分）: iPhoneのマイク/録音、Stemの実処理速度、Tabの実曲の精度、GPU。

## 3. 公開後の注意
- すでに端末に残っている保存データ（Tabの記録 `qn_tab_db`、stem `qn_stem_db`、録音、`mp3_lyt_*` など）は、隠している間も消えていない。ONにすればそのまま見える。
- 保存形式を変える時は、隠している間でも古いデータを読めるようにする。
- ONにする機能が増えたら、`qnFeature` を使っている画面・設定行が出ることを `e2e_features.py` で確認する。
- 新しい機能を隠す側に足す時も同じ仕組み: `F` に名前を足し、画面/設定は `qnFeature` / `qnFeatRows`、ガイドは `data-feature`。
