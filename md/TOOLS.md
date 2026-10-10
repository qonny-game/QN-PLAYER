# 用意してある道具（`md/tools/`）

作業の事故を減らすためのPythonスクリプト。全部 `python3 -I md/tools/<名前>.py ...` で動く（プロジェクトのルートで実行）。ブラウザを使うものはPlaywright(Python)とChromiumが要る。外部ドメインは遮断して動かすので、ログイン・YouTube再生・Stemのモデル取得は確認できない。

| 道具 | 何をするか |
|---|---|
| `release.py` | リリース作業を1本に。`check`（構文・CSS括弧・id重複・版とCHANGELOG・参照ファイル・許可リスト外の混入を確認）／`bump 版 "一言"`（index.htmlの版とCHANGELOGを更新）／`zip`（前回渡した版からの変更ファイルだけのパッチZIP）／`full`（完全版ZIP）／`ship 版 "一言"`（bump→check→記録→zipを一気に）／`status`（変更ファイルと関数名の増減）／`record`（その版を基準として登録） |
| `smoke.py` | 曲追加・フォルダ作成・全パネル切替・アプリ切替(tuner/pitch/youtube/player)をPC 1280/1920・SP 390/360で実行し、JSエラー0を確認 |
| `snap.py` ＋ `compare_snap.py` | 全要素の計算済みスタイルを書き出し、前後で比較（見た目を変えない作業の確認） |
| `i18n_check.py` | 英語表示にして、日本語が残っている文言とページエラーを洗い出す |
| `qnbrowser.py` | ブラウザ確認の共通土台（サーバー起動・PC/SP・無料版解除・言語指定・テスト音声生成・外部遮断・エラー収集・スクショ）。新しい確認スクリプトはこれを使って書く |
| `css_audit.py` / `js_unused.py` / `md_audit.py` | お掃除用。未使用のCSS／未参照の関数／mdが挙げる名前がコードに残っているか（`CLEANUP.md`） |

## 標準の流れ
1. 作業する（コード・必要なmdを直す）。
2. 動作を確認する：`smoke.py <ルート>`、見た目を変えない作業は `snap.py` を前後で出して `compare_snap.py`。
3. `release.py ship <新しい版> "<CHANGELOGの一言>"` → 出力された `QNPLAYER_v<版>_patch.zip` を渡す。
4. 完全版を頼まれたら `release.py full`。

## 基準（前回渡した版）の仕組み
- `md/release_manifest.json` に、渡した版ごとの全ファイルのSHA-256を直近3版ぶん持つ。`ship`が自動で更新し、パッチZIPにも入る。パッチを適用すると基準も一緒に進む。
- 記録が無い場合（別の経路で渡した版など）は、その版の状態で `release.py record` を1回実行してから `ship` する。`--since 版` で基準の版を指定できる。
- 納品ルール（変更ファイルだけ・フォルダ構造維持・`PATCH_FILES.txt`なし・名前固定）はスクリプトが守る。ZIPに入れてよいファイルの許可リストは `release.py` の `ALLOW_*`。
