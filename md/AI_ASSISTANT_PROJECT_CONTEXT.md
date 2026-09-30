# QN-PLAYER プロジェクトコンテキスト & AI協業ガイド

QN-PLAYER（QNシリーズのブラウザ完結型MP3プレイヤー）の開発を効率よく進めるための
プロジェクト固有の知識をまとめたドキュメント。修正依頼の前に該当セクションを
確認することで、同じ調査・同じ失敗を繰り返さないようにする。

**関連ファイル（このドキュメントと一緒に渡す/参照する）：**
- `QUICK_START.md` — **作業開始時、まずこれを読む。** 依頼の種類ごとにどのファイルを見るべきかの早見表と、実装〜ドキュメント更新までの手順。
- `PC_V2_FILE_INDEX.md` — 最大3ファイル（`player-ui-pc-v2.js` /  `style-layout-pc-v2.css` / `style-pcv2-panels.css`）の処理内容目次。
- `DOM_ID_REFERENCE.md` — HTML静的ID・JS動的生成IDの一覧  （特にBackup/Importモーダルの`trackBackup*` / `trackImport*`）。
- `UI_TERMINOLOGY.md` — ユーザーの言葉とDOM要素・コード上の名前の対応表。  画面上の場所を指す言葉が食い違いそうなときに確認する。
- `YOUTUBE_APP.md` — **YouTubeアプリ専用**の仕様＋規約ルール（最優先）。YouTube/アプリ関連の作業前に必ず読む。
- `CHANGELOG.md` — バージョンごとの変更履歴。前回どこまで進んだかの確認用。
- `GOTCHAS_REFERENCE.md` — 不具合、エラー、バグなどのまとめ
---

## 1. プロジェクト構成（ファイルマップ）

```text
QNPLAYER/
├── index.html                  # 全体のHTML骨格、モーダル類、<script>読み込み順
├── JS/
│   ├── player-core.js          # 中核データ・状態管理。DOM操作なし。
│   │                           #   audio要素、pins配列、playlist配列、
│   │                           #   IndexedDB(qnaudio_playlist_db)アクセス全般
│   ├── player-ui-shared.js     # PC/SP共通のUI操作。loadFile、updateBars
│   │                           #   （毎フレームのシーク・ループ判定）、togglePlay等
│   ├── player-ui-pc-v2.js      # 【最重要・最大】現在の唯一のUI実装（詳細は§2、
│   │                           #   関数一覧は別ファイルPC_V2_FILE_INDEX.md）
│   ├── player-playlist.js      # プレイリスト：追加/削除/並び替え/お気に入り
│   ├── player-markers.js       # マーカー：追加/削除/ドラッグ移動/波形描画
│   ├── player-controls.js      # Speed/AutoSpeed/Key/Loop/PreRollのつまみ系
│   ├── player-control-eq.js    # EQ（5バンドイコライザー）
│   ├── player-track-backup.js  # ライブラリの一括Backup/Importモーダル
│   ├── player-export.js        # 現在曲の範囲書き出し（WAV/MP3）
│   ├── player-shareware.js     # 無料版の機能制限・アンロックモーダル
│   ├── player-theme.js         # カラーテーマ・ショートカット一覧・ハンバーガーメニュー
│   ├── player-id3.js           # MP3のID3v2タグ読み取り（Title/Artist）
│   ├── player-text.js          # Textタブ（歌詞・メモ）
│   ├── player-auth.js          # Firebase Auth（Googleログイン）
│   ├── qn-wakelock.js          # 【v2.21.1〜】再生中の画面スリープ防止。window.QNWake.set(key,on)。
│   │                           #   PLAYERのaudio再生とアプリ再生(YouTube等)が使う
│   ├── qn-apps.js              # 【v2.17.0〜】MORE/アプリ一覧/アプリ表示領域/アプリ名バッジ。
│   │                           #   QNApps.register()でアプリを足す。TUNER/PITCHは準備中の枠だけ。
│   │                           #   Colorボタン常駐＋Colorパネル借用(initColorKeeper)もここ
│   ├── qn-app-youtube.js       # 【v2.17.0〜】YouTubeアプリ（IFrame埋め込み＋3行シークバー＋Library/Markers
│   │                           #   （本体と同じ行・EDIT/DEL）＋ABループ＋Auto Next＋チャプター貼り付け＋Backup/Import）。
│   │                           #   仕様・規約ルールはmd/YOUTUBE_APP.md（最優先）
│   ├── jszip.min.js / lame_min.js  # 外部ライブラリ（ZIP圧縮／MP3エンコード）
├── CSS/
│   ├── style-core.css          # PC版デフォルトレイアウト＋PC/SP共通デザイン
│   ├── style-layout-pc-v2.css  # 【最重要】PC v2のシェル（外枠）実装：アイコンバー・
│   │                           #   波形エリア・下部バー・Volumeポップアップ・
│   │                           #   ヘッダーナビ・3カラムグリッド・SP幅の縦積み
│   │                           #   レイアウト（詳細は§2、セクション一覧はPC_V2_FILE_INDEX.md）
│   ├── style-pcv2-panels.css   # PC v2の中央パネル（#pcV2PanelBody）の中身の実装：
│   │                           #   Control/EQ・Markers・Library・Text・Backup/Import・
│   │                           #   Color/Keyboard、パネル見出し・右下FABボタン
│   ├── style-apps.css          # 【v2.17.0〜】MORE/アプリ一覧/#qnAppHost/YouTubeアプリの見た目
│   ├── style-layout-sp.css     # 旧SP版上書き（現在は実質未使用、詳細は§2）
│   ├── style-playlist.css / style-markers.css / style-controls.css /
│   │   style-control-eq.css / style-export.css / style-shareware.css /
│   │   style-text.css / style-theme.css / style-auth.css
│   │                           # 各機能ごとのUIスタイル（ファイル名で対応するJSが分かる）
```

読み込み順（index.html末尾）：
`jszip.min.js → lame_min.js → player-shareware.js → player-core.js →
player-ui-shared.js → player-id3.js → player-playlist.js →
player-track-backup.js → player-markers.js → player-control-eq.js →
player-controls.js → player-export.js → player-text.js →
player-ui-pc-v2.js → qn-wakelock.js → qn-apps.js → qn-app-youtube.js → player-theme.js →
player-auth.js(module)`（qn-apps.jsはplayer-ui-pc-v2.jsより後、アプリ側ファイルはqn-apps.jsより後）

**新しい関数を他ファイルから参照する場合は、この順序で「呼ぶ側より前に定義されているか」を必ず確認する。**
特に `player-core.js` はほぼ全ファイルの先頭にあるので、共通ヘルパーを追加する定位置として適している。

---

## 2. 最重要の設計事実：「PC v2」が唯一の実UI

これを理解していないと調査が必ず遠回りになる。

- `player-ui-pc-v2.js` 内の `PC_BREAKPOINT = "(min-width: 0px)"` は**常にtrue**。
  つまり画面幅を問わず常にPC v2のDOM構造（`#pcV2Root`以下）がactivateされている。
- 旧来の「SP専用UI」（`.app-container`直下の要素、`style-layout-sp.css`の
  `@media (max-width: 768px)`ブロック等）は`body.pc-v2-active`が付くと
  `display: none`になり、**実質死んでいる**。
- SP幅での見た目・挙動は、**PC v2のDOM構造をCSSの`@media (max-width: 900px)`
  ブロック（`style-layout-pc-v2.css`末尾）で作り替えたもの**。
- 結果として：
  - 削除・選択などのUIロジックは、SP版のonclickハンドラ（例:
    `player-playlist.js`の`delBtn.onclick`）を直接見ても**発火しない**ことが多い。
    実際の処理は`player-ui-pc-v2.js`の`attachSelectionHandlers`等、
    PC v2側のキャプチャフェーズハンドラが奪っている（§3-2参照）。
  - 「SP版の見た目がおかしい」系の相談は、まず`style-layout-pc-v2.css`の
    `@media (max-width: 900px)`ブロックを疑う。`style-layout-sp.css`側は
    基本的に無関係。
  - 下部コントロールバー(`#pcV2BottomBar`)・アイコンバー(`#pcV2IconBar`)は
    PC幅では別の位置にあるが、SP幅では`syncBottomBarPosition()`
    （`player-ui-pc-v2.js`）がJSでDOM上の位置ごと移動させている。
    新しい要素をこの周辺に追加する場合、この関数も一緒に更新しないと
    SP⇔PC幅切替時に迷子になる。

---

## 3. 過去のバグ修正履歴（Gotchas）

GOTCHAS_REFERENCE.mdにまとめました。
上記に追記したほうが良いものは以下のテンプレでまとめてコードブロックで出力し、追記を促してください。

```
### バグのタイトル
- **現象：** 
- **原因：** 
- **解決：** 
- **教訓：** 
```

---

## 4. データフロー・状態管理の要点

- **`playlist`配列**（`player-core.js`）: `{ file, name, title, artist,
  duration, enabled, favorite }`の配列。メモリ上の唯一の真実の情報源。
  並び順そのものが表示順・再生順を決める。
- **IndexedDB (`qnaudio_playlist_db` / `tracks`ストア、keyPath: `name`)**:
  `playlist`の永続化先。レコードは`{ name, type, blob, savedAt, enabled,
  title, artist, favorite }`。`savedAt`の昇順が読み込み時の並び順になる
  （`loadAllPlaylistTracks()`）。**`blob`フィールドは音声実体そのもので
  重い**（§3-5参照、書き込み時は要注意）。
- **プレイリストのメタデータ（v2.13.5〜）**: `localStorage`のキー
  `qn_playlist_meta_v1`に`{ ファイル名: { savedAt, enabled, title, artist,
  favorite } }`で保存。並び順・ON/OFF・表示名・お気に入りの変更はここだけに
  書き、IndexedDBのレコードは書き直さない（§3-11）。読み込み時はこちらが
  優先され、無い項目はIndexedDBレコード側の値（旧データ）を使う。
- **マーカーメモのプリセット自動カラー（v2.15.0〜）**: `localStorage`の
  `qn_marker_preset_colors_v1`に`{ プリセット名: 色キー|null }`で保存。
  未保存のプリセットは`MARKER_PRESET_COLOR_DEFAULTS`（player-markers.js）の
  初期配色を使う。色キーは`MARKER_COLOR_PALETTE`（=QN_THEMESのname）。
- **マーカーメモのカスタムプリセット（v2.21.0〜）**: `localStorage`の
  `qn_marker_custom_presets_v1`に`[{label,color}]`（最大30件）。Colorパネル
  「Marker Memo Colors」末尾の入力行で編集。`getAllMarkerPresetLabels()`が
  組み込み＋カスタムを返し、マーカー編集のプリセットチップと自動カラーに使われる。
  YouTubeアプリのマーカー編集も同じ関数・同じ保存先を共用する。
- **YouTubeアプリのデータ（v2.17.0〜）**: `localStorage`の`qn_yt_items`
  （`[{videoId,url,title,skip,markers[{id,time,label,color?,enabled?}],loopA,loopB}]`）、
  `qn_yt_rate`（再生速度）、`qn_yt_autonext`（Auto Next、初期OFF）。
  YouTube由来データ（サムネ・公式タイトル等）は**保存しない**（規約）。詳細は`YOUTUBE_APP.md` §4。
- **`openPlaylistDB()`**: DB接続はキャッシュされ使い回される
  （呼ぶたびに`indexedDB.open()`し直さない）。
- **`pins`配列**（`player-core.js`）: 現在再生中の曲のマーカー一覧。
  曲を切り替えると`loadFile()`内で`localStorage`（キー: `mp3_pins_<ファイル名>`）
  から都度読み直す。**IndexedDBではなくlocalStorage。**
- **テキストメモ**: `localStorage`のキー`mp3_text_<ファイル名>`。こちらも曲ごと。
- **`loopActiveMarkerIndex`** / **`isSeeking`**: ループ折り返し判定用の
  グローバル状態（§3-1, 3-2参照）。新しいシーク操作や区間変更操作を
  追加するときは必ずこの2つの整合性を意識する。
- **お気に入り（ピン留め）**: `track.favorite`フラグ。ONにした曲は
  `toggleTrackFavorite()`が`playlist`配列内で実際に「お気に入りグループの
  末尾」まで移動させる（表示だけのソートではない）。ドラッグ並び替えは
  このグループ分けを意識しないので、跨いで並び替えることも可能
  （再度ピンを押せばグループ境界に戻る、という仕様）。

---

## 5. AIアシスタントへの運用ルール

修正依頼を受けたら、着手前に以下を確認する。

0. **§3冒頭の早見表と§7のチェックリストを確認**: 報告された症状に近い行が
   早見表にあれば、その項目から読む。新しいUI・アニメーション・ポップアップ・
   音声/保存処理を書く場合は§7を一通り確認してから着手する。
1. **§2・§3を確認**: 依頼内容がSP版の見た目/挙動に関わる場合は§2を、
   ループ・シーク・削除・並び替え・インポート・CSSの表示順に関わる場合は
   §3の該当項目を必ず読み返してから着手する。
2. **「見た目」と「永続化」を分けて確認する**: プレイリスト・マーカー・
   設定を変更する機能を追加/修正する際は、「`playlist`/`pins`配列（メモリ）」
   「IndexedDB」「localStorage」のどれを更新すべきかを明確にし、
   更新漏れがないか（§3-4のような）を確認する。
3. **曲数が多い場合の負荷を意識する**: プレイリスト全曲に対してループする
   処理（保存・削除・エクスポート等）を書くときは、§3-5の教訓に従い、
   「音声実体（Blob/File）を含めて全曲分書き直していないか」を必ず自問する。
   全曲ループが必要な処理は、可能な限り「変更があった曲だけ」に絞るか、
   Blobを含まない軽量な更新にする。
4. **PC v2のDOM移植構造を壊さない**: `player-ui-pc-v2.js`の`build()`・
   `syncBottomBarPosition()`・`attachSelectionHandlers()`は、複数の
   グローバル状態・DOM順序の前提の上に成り立っている。新しいボタンや
   要素を下部バー/アイコンバー周辺に追加する場合、これらの関数も
   一緒に更新する必要がないか確認する。
5. **回帰を防ぐ**: 修正が§3の履歴にある領域と重なる場合、そのバグを
   再び作り込んでいないか（特に3-2・3-5・3-7のような「見えにくい」
   類の不具合）を意識して見直す。
6. **バージョン番号の更新と納品**: 修正のたびに`index.html`内の
   `window.QN_APP_VERSION`を更新し（機能追加はマイナー、バグ修正/微調整は
   パッチ）、全JS構文チェック・HTML構文チェック・CSS波括弧対応チェック・
   ID重複チェックを行ってから納品する。**納品は「変更したファイルだけのパッチZIP」（フォルダ構成を保持、`PATCH_FILES.txt`は付けない）が標準**。全体ZIPは依頼された時だけ。**同時に`CHANGELOG.md`の末尾に
   新バージョンの変更点を追記する**（書式は同ファイル冒頭のルール参照）。
7. **このドキュメント自体を毎回更新する**: 修正やバグ調査を1件終えるたびに、
   このファイルへの反映が必要かを確認し、該当すれば追記する。
   - §1（構成）: ファイルの新設・分割・統合・読み込み順の変更があった場合
   - §2（設計事実）: SP/PC表示の切り替え方式など、プロジェクト全体に
     関わる前提が変わった場合
   - §3冒頭の早見表: §3に項目を追加したら、症状→項目の行を1行足す
   - §7（落とし穴チェックリスト）: 実機でしか出ない種類の新しい教訓が
     得られたら、チェック項目として1行足す
   - §3（バグ履歴）: 「現象→原因→解決→教訓」が言えるバグを直した場合は、
     既存の項目群と同じ形式で新しい項目として追記する。似た系統の
     バグを見つけたが既存項目でカバーできる場合は、その項目に
     「関連事例」として追記するだけでよい（新規項目を乱立させない）
   - §4（データフロー）: 新しい状態変数・ストレージ（IndexedDB/localStorage
     の新しいキーやストア）・グローバル変数を追加した場合
   - §5（このルール自体）: 運用ルールとして繰り返し役立つ知見が
     得られた場合
   - §6（確認コマンド）: 毎回の検証手順に新しいチェック項目を
     加えるべきだと分かった場合
   - `PC_V2_FILE_INDEX.md`: `player-ui-pc-v2.js`・`style-layout-pc-v2.css`・
     `style-pcv2-panels.css`に新しい関数・セクションを追加/変更/削除した場合
     （同ファイル末尾の「目次の更新ルール」参照）。他のファイルが1000行を
     超えて育った場合は、同じ形式でセクションを追加してよい。
   - `DOM_ID_REFERENCE.md`: 新しいモーダル/パネル/機能ブロックのID群を
     追加した場合、該当グループに追記する。
   - `YOUTUBE_APP.md`: YouTubeアプリの機能・データ・規約対応を変えたら、同ファイルの該当節と§7チェックリストを更新。
   - `UI_TERMINOLOGY.md`: ユーザーの言葉とUI要素の対応で行き違いが
     起きた場合（無駄なやり取りが発生した場合）、その場で追記する。
   追記は該当セクションの末尾に、既存の項目と同じ見出しレベル・文体で
   行う。過去の記述を消すのは、実際に廃止された仕組みや誤りが判明した
   場合のみとし、通常は追記していく。反映を終えたら、更新後の
   `AI_ASSISTANT_PROJECT_CONTEXT.md`も（変更があれば）同じパッチZIPに含める。

---

## 6. 毎回の検証コマンド（納品前チェックリスト）

修正が完了したら、ZIP化する前に以下を通す。曲数が多い環境を想定した
確認も含む。

```bash
# 1. 全JSファイルの構文チェック
for f in JS/*.js; do node --check "$f" 2>&1 | grep -v "^$" && echo "FAIL: $f"; done; echo "JS OK"

# 2. HTML構文チェック
python3 -c "
from html.parser import HTMLParser
class P(HTMLParser):
    def error(self, message): print('ERROR:', message)
p = P()
p.feed(open('index.html', encoding='utf-8').read())
print('HTML OK')
"

# 3. 全CSSファイルの波括弧対応チェック（テキスト置換ミスの検出に有効）
for f in CSS/*.css; do python3 -c "
content = open('$f', encoding='utf-8').read()
o, c = content.count('{'), content.count('}')
if o != c:
    print('MISMATCH in $f:', o, c)
"; done; echo "CSS check done"

# 4. HTML内のid重複チェック（新要素追加時のtypo検出）
grep -o 'id="[a-zA-Z0-9_]*"' index.html | sort | uniq -c | awk '$1>1'

# 5. JS側が参照するgetElementById("...")と、HTML側のid定義の突き合わせ
#    （新モーダル・新パネルを作った直後に特に有効。片方だけ書き忘れると
#    ここで拾える）
grep -o 'getElementById("[a-zA-Z0-9_]*")' JS/<対象ファイル>.js | sed 's/getElementById("//;s/")//' | sort -u
grep -o 'id="[a-zA-Z0-9_]*"' index.html | sed 's/id="//;s/"//' | sort -u
```

**§3-5のような「重い処理」系のバグは上記の静的チェックでは検出できない。**
プレイリスト全曲・全マーカーに対してループする新しいコードを書いた場合は、
チェックリストとは別に「このループは曲数に比例して音声Blobを書き直して
いないか」を必ずコードレビューする（§3-5、§5の運用ルール3番目参照）。

---

## 7. 重さ・端末特有の落とし穴チェックリスト（新機能を作る前に確認）

§3の教訓のうち、「静的チェックでは見つからず、実機でしか症状が出ない」
種類のものをまとめたもの。新しいUI・アニメーション・ポップアップ・
音声処理・保存処理を書くときは、着手前と納品前に一通り確認する。

**描画・負荷（PC/SP共通）**
- [ ] `requestAnimationFrame`ループを新設していないか。するなら、
  (1)間引けないか、(2)変化が無い時は描画をスキップしているか、
  (3)ループ内で`getBoundingClientRect`・`getComputedStyle`・配列/文字列の
  新規生成をしていないか（3-10）。PC v2はSPでも常に動く（§2）。
- [ ] `textContent`・`style.xxx`を定期的に書く処理は、値が変わった時だけ
  書いているか（3-16）。
- [ ] 全画面の要素や非表示の要素に`backdrop-filter`・`filter`・大きな
  `box-shadow`が残っていないか。非表示時は必ず`none`（3-16）。
- [ ] 無限アニメーション（`infinite`）を追加していないか。常時表示の要素には
  付けず、回数を限定する。動かすのは`transform`/`opacity`だけ
  （`box-shadow`等を動かさない）（3-21）。

**iOS Safari特有**
- [ ] タップで動く要素（とその子孫）に、`:hover`で`display`/`visibility`を
  変えるCSSを書いていないか。必要なら`@media (hover: hover) and
  (pointer: fine)`で囲む（3-14）。
- [ ] 音声Blobを含むIndexedDBレコードを書き直していないか。メタデータは
  localStorage（`qn_playlist_meta_v1`）へ（3-11）。
- [ ] `audio.play()`をユーザー操作のコールスタック内で同期的に呼んでいるか（3-3）。
- [ ] 再生用の`AudioContext`（`getAudioCtx()`）を、EQ/Speed/Keyを使う
  瞬間より前に作っていないか。デコードだけなら`OfflineAudioContext`（3-10）。

**デザインの統一**
- [ ] 新しいスタイルでpx値の角丸・文字サイズを直書きしていないか。
  §8のトークン（`--radius-*`・`--fs-*`・`--btn-h`）を使っているか。
- [ ] リストや設定項目を角丸の枠で囲んでいないか（線で区切る）。

**レイアウト・ポップアップ**
- [ ] 下段バー（SPで横スクロール）の中にポップアップを置いていないか。
  置くなら`document.body`直下＋`position: fixed`（3-15）。
- [ ] 行の中に一時的なUI（入力補助・プリセット等）を足して、リストの行
  高さを変えていないか。ポップアップにする（3-18）。
- [ ] ドラッグ中に、つかんでいる要素を`innerHTML`やrender関数で
  作り直していないか。位置だけ更新し、再描画はドロップ時に（3-20）。
- [ ] ドラッグ・スライダーはPointer Events（マウス/タッチ両対応）か。
  `mousedown`だけになっていないか（3-15）。
- [ ] `overflow-y: auto`の要素（`#pcV2PanelBody`等）の内部で、flex:1を
  何段にも重ねて「残り高さを埋める」構成にしていないか。埋めるのではなく、
  かさばる部分に上限つきの固定的な高さを与えて自前でスクロールさせる方が
  iOS Safariでの相性がよい（3-23）。SPでの見た目はChromeでの確認だけでは
  保証されないので、可能なら実機かSPサイズのスクリーンショットで確認する。
- [ ] パネルに新しい実体（使い回す中身）を追加したら、`stashPanelContents()`
  の対象にも加えたか。非表示中もdocument内に置かないと、裏での更新が
  空振りする（3-19）。
- [ ] `display: grid`の固定`grid-template-columns`を持つ親に、条件付きで
  子要素の個数を増減させる変更をしていないか。増減させたい要素は、既存の
  列に収まる入れ物(wrapper)の中に入れる（3-24）。
- [ ] 新しい制限（無料版の上限等）は、複数ある入口それぞれに書いていないか。
  可能なら「みんなが通る一番奥の関数」（例：`playTrackAt()`）にチェックを
  置き、新しい入口を追加してもチェック漏れが起きない形にする（3-25）。
- [ ] markers/playlist共通セレクタのCSSを変えるとき、両パネルのタップ判定
  （`.pin-del-zone`/`.playlist-del-zone`）を壊していないか（3-12）。

**音声・状態**
- [ ] 再生中の音声経路を差し替える処理で、切り替え開始〜完了の間に
  `await`を挟んでいないか（3-17）。
- [ ] 曲名キーで保存するデータ（マーカー・テキスト等）を、曲切替と同じ
  瞬間に同期で読み込んでいるか（3-13）。

---

## 8. UIデザインの統一ルール（v2.16.0〜）

角丸・文字サイズ・ボタン寸法は`style-core.css`の`:root`にトークンとして
定義してある。**パネル内・ポップアップ・ボタン・入力欄に新しいスタイルを
書くときは、px値を直書きせず必ずトークンを使う。**

| 用途 | トークン | 値 |
|---|---|---|
| 文字入りボタン・チップ・トグル・ステッパー・バッジ・セグメント | `--radius-pill` | 999px（左右が完全な半円） |
| アイコンだけのボタン | `--radius-round` | 50% |
| 入力欄・テキストエリア・ドロップゾーン | `--radius-field` | 10px |
| ポップアップ・ドロップダウン・カード | `--radius-popup` | 14px |
| モーダル | `--radius-modal` | 20px |
| パネル見出し | `--fs-title` | 20px |
| セクション見出し（SPEED/KEY/EQUALIZER等） | `--fs-heading` | 15px |
| リストの主テキスト・入力欄・行ラベル | `--fs-body` | 14px |
| 補足・説明・サイズ表示・アーティスト名 | `--fs-small` | 12px |
| EQ目盛り・バッジ等の極小表示 | `--fs-micro` | 11px |
| 二次ボタン（RESET・プリセット・全選択等） | `--fs-btn` / `--btn-h` / `--btn-pad-x` | 12px / 30px / 14px |
| 主ボタン（DOWNLOAD/IMPORT/ADD AUDIO等） | `--fs-btn-primary` | 14px |
| 二次ボタンの枠線 | `--border-strong` | rgba(255,255,255,0.14) |

- **リストの行・パネル内の区切りは角丸の枠を使わず、線（`--border-subtle`）で
  区切る。** カード状の箱で囲まない。
- **例外（意図的にルール外）：** 下部コントロールバー（`#pcV2BottomBar`内、
  よく使う・アイコンだけでは分かりにくい所は文字入り・大きめ）、アイコンバーの
  ラベル、ロゴ・スプラッシュ、波形上のマーカーラベル、テキストのフルスクリーン
  表示、料金モーダルの大見出し、スライダーのトラックやスクロールバー等の
  2〜4pxの細部。
- **テーマ色（`--accent-primary`）で塗るもの（v2.16.4〜）：** フローティング
  ボタン（`.panel-fab-btn`＝ADD AUDIO/ADD MARKER/EDIT/Fullscreen等）の背景と、
  パネル見出し（`.pcv2-panel-header-title`）の文字。EDITの編集中(OK、`.active`)は
  「白地＋テーマ色の文字」に反転して区別する。Deleteは常に赤（`--danger`）。
- **アイコンボタンの色（v2.16.5〜）：** SVGは`fill: currentColor`にして、線と塗りを
  同じ色（ボタンの`color`）で決める（fillだけ固定色にすると、線と塗りを併用する
  アイコンで色が混ざる）。下段バーの状態を持つボタンは「通常＝`--icon-muted`、
  ON/表示中＝`--accent-primary`」で統一（Speed/Key/EQは`:not(.effect-off)`、
  Volumeは`.is-open`）。ホバーの明色化はマウス環境限定。
- **シークバー（`#pcV2WaveArea .vbar`）の高さは固定値・vhで指定しない。**
  `#vbarContainer`が波形エリアの残り高さを受け取り、6本で等分する（flex、
  min/max-heightで上下限のみ指定）。高さ変化時のcanvas再描画は
  `player-ui-pc-v2.js`のResizeObserverが担当（v2.16.1〜）。
- 汎用セレクタ（`.playlistItem button`・`.pinItem button`は丸ボタン指定）より
  個別のボタンを優先させたい時は、`.playlistItem .playlist-skip-toggle`のように
  親クラスを前置して詳細度を上げる。

---

## 9. アプリ（YouTube/今後追加するアプリ）共通ルール（v2.17.0〜）

新しいアプリを`QNApps.register()`で足す時も、以下を全アプリ共通ルールとして守る。
YouTubeアプリ固有の仕様・規約は`YOUTUBE_APP.md`。

- **MORE・Colorは常駐：** サイドバー下部のMOREとColorは、アプリ表示中・アプリ一覧中も
  常に押せる。アプリ側でColorを別実装しない（`qn-apps.js`の`initColorKeeper`が
  テーマ切替セクションを`#qnColorPop`パネルへ借りて表示し、閉じたら戻す）。
  アプリ表示中はPLAYER専用の「Marker Memo Colors」を隠す。Keyboardはアプリでは非表示。
- **PLAYERと同じ部品・同じ操作：** リスト行・EDIT→OK・丸チェック削除・カラーパレット・
  プリセットチップ・シークバー(`.vbar`/`.vfill`)は本体のクラスを流用し、挙動を揃える。
  PLAYER側CSSが`#pcV2PanelBody`スコープなら、アプリ側（`.qn-yt`等）へ同等のルールを写す。
- **SP幅：** アプリが映像を持つ場合、パネルを開いても映像は隠さない（YouTubeは
  `max(200px,30dvh)`・最低200px）。`data-qn-keep-visible`を付けた要素はColorパネルも覆わない。
- **状態の持ち方：** アプリのデータは`qn_<アプリ名>_*`のlocalStorageキー。音声実体は持たない。
- **画面スリープ防止：** 再生中は`QNWake.set("<アプリ名>", true)`、停止・非表示で`false`。
- **表示中はPLAYER側を止める：** `body.qn-app-open`でaudio一時停止・下段バー非表示・
  キーボードショートカット無効・曲追加D&D無効。
