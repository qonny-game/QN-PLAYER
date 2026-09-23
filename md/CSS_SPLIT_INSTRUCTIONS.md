# PC v2 CSS分割 作業指示書（保留中タスク）

**ステータス：未着手。** ユーザーの希望で、実施は必ず**別のチャット**で行う
（このドキュメントを書いた時点のチャットでは分割作業そのものはやっていない）。
着手する時は、このファイル1本を読めば作業できるように書いてある。

## 0. 背景・目的

`CSS/style-layout-pc-v2.css`（PC v2の唯一のレイアウト実装、詳細は
`AI_ASSISTANT_PROJECT_CONTEXT.md`§2）が2166行まで育っており、ユーザーから
「パネルの中身のCSSだけ分けたら作業しやすいか」と相談があった。調査の結果、
このファイルは実質2つの異なる関心事が同居している。

1. **シェル（外枠）**：3カラムグリッド、左アイコンバー、右の波形エリア、
   下部固定コントロールバー、Volumeポップアップ、ヘッダーのQN Seriesナビ、
   SP幅での縦積みレイアウト（`@media (max-width: 900px)`）
2. **パネルの中身**：中央パネル（`#pcV2PanelBody`）に表示される
   Control/EQ・Markers・Library・Text・Backup/Import・Color/Keyboardの
   各コンテンツ、パネル見出し（`#pcV2PanelHeader`）、右下FABボタン
   （`#pcV2PanelFab`）

行数の内訳（本ドキュメント作成時点）：

| 区分 | 行数（概算） |
|---|---|
| 全体 | 2166行 |
| パネルの中身（PC幅ブロック） | 約525行 |
| シェル（PC幅ブロック） | 約679行 |
| SP幅の`@media`ブロック（末尾、1792〜2154行） | 約363行 |
| コメント・空行・見出し等 | 残り |

**重要な発見：** SP幅の`@media`ブロック（363行）の中身を1つずつ調べたところ、
**パネルの中身に関するセレクタは1つも含まれていなかった**（全部シェル側：
アイコンバー・下部バー・波形エリア・時刻行・パネルの開閉サイズ調整など）。
つまりこの`@media`ブロックは分割不要で、**丸ごとシェル側に残せる**。
これにより分割作業の難易度・リスクはかなり下がっている
（当初「SP対応部分も中身に応じて振り分ける必要がある」と想定していたが、
実際に中身を調べたらその必要がなかった）。

**このドキュメントの判定基準（§2）と対象リスト（§3）は、実際に
本ドキュメント作成時点のファイルへ機械的に適用してドライラン済み。**
全208ブロック（トップレベルのセレクタ単位、SP `@media`ブロックは
中身を分解せず1個として数える）を分類・分割し、§4-4の検証スクリプトで
「欠落0件・重複0件・完全一致」を確認している。つまりこの判定基準を
そのまま適用すれば、少なくとも本ドキュメント作成時点のファイルに対しては
安全に分割できることを確認済み。着手時にファイルが変わっていても、
基本方針（判定基準）は変わらないはずだが、§4-4の検証は必ず実行すること。

## 1. 分割方針

- 既存ファイル `CSS/style-layout-pc-v2.css` は**そのまま残し、シェル専用にする**
  （SP幅`@media`ブロックも含めて丸ごと残る）。
- 新規ファイル `CSS/style-pcv2-panels.css` を作り、パネルの中身のセレクタを
  ここへ移す（新規ファイルに`@media`は不要 — §0の発見の通り）。
- ファイル名は正式決定ではないので、着手時にユーザーに確認してもよい
  （このドキュメントでは仮に`style-pcv2-panels.css`とする）。

## 2. 移行の判定基準（セレクタ→行き先）

以下の優先順位で判定する（上から順にチェックし、最初に一致した規則を適用）。

**パネル（`style-pcv2-panels.css`へ）：**
1. `#pcV2PanelHeader` またはそれで始まるセレクタ（`.pcv2-panel-header-title`含む）
2. `#pcV2PanelFab` またはそれで始まるセレクタ、`.panel-fab-*`
3. セレクタのどこかに`#pcV2PanelBody`を含むもの（`#pcV2PanelBody`単体・
   `#pcV2PanelBody.pcv2-panel-xxx`・`#pcV2PanelBody 子孫セレクタ`の
   すべてを含む。**`#pcV2PanelBody`単体の基本ルール(overflow-y:auto等)も
   パネル側に含める**——中央パネルという「枠」自体もパネルの一部として扱う）
4. `.pin-*` / `.playlist-*` / `.export-*` / `.track-backup*` / `.track-import*` /
   `#trackBackupSize*` / `#trackImport*` で始まるセレクタ（`#pcV2PanelBody`が
   セレクタ文字列に出てこなくても、これらは全てパネル内のコンテンツ用）
5. `.pcv2-row-deleting` / `.pcv2-eq-heading*` / `.pcv2-control-eq-heading` /
   `.pcv2-section-divider`

**シェル（`style-layout-pc-v2.css`に残す）：**
- 上記に当てはまらない全て。具体的には：`#pcV2Root` / `#pcV2Layout` /
  `#pcV2TimeRow` / `#pcV2IconBar`とその子孫（`.pcv2-icon-item`等） /
  `#pcV2Panel`（`#pcV2PanelHeader`ではなく、外枠の`#pcV2Panel`単体） /
  `#pcV2WaveArea`とその子孫（`#pcV2WaveFabRow` / `#appTitle` / `.vbar*` /
  `#vbarContainer`含む） / `#pcV2BottomBar`とその子孫（`.pcv2-ctrl-*` /
  `.tripleNavBtn*` / `.loopbtn*` / `.loop-preroll-*`含む） /
  `#pcV2VolumePopup`とその子孫 / `body.pc-v2-active #appHeader/#appLogo/
  #appVersion/#qnMenuMount` / `#pcV2HeaderNav`と`.pcv2-header-nav-*` /
  `.pcv2-qn-loading` / SP幅の`@media`ブロック全体（§0参照）

判定に迷うセレクタが出てきたら、「このセレクタが実際にスタイルしている
DOM要素は、パネルを切り替えても常に画面上に存在し続けるか（＝シェル）、
それともパネルの種類によって表示・非表示が切り替わる/中身が変わるか
（＝パネル）」で考えると大体判断できる。

## 3. 移行対象の全リスト（本ドキュメント作成時点でのスナップショット）

以下は`CSS/style-layout-pc-v2.css`の現在の内容を実際に1ブロックずつ
解析して分類した結果（行番号はこのドキュメント作成時点のもの。**着手時に
ファイルが変わっている可能性があるので、行番号は目安とし、必ず§4の
自動判定スクリプトで再生成すること**）。

### パネル側へ移すセレクタ（99ブロック、約525行）

```
184-197   #pcV2PanelHeader
201-204   .pcv2-panel-header-title
220-230   #pcV2PanelFab
235-240   #pcV2PanelFab .pcv2-fab-addgroup
246-310   .panel-fab-btn 関連（svg/hover/active/active:hover/
          .panel-fab-delete-btn/:hover/:disabled）
322-426   #pcV2PanelBody 配下の削除選択UI一式
          （.pin-del-zone / .playlist-del-zone / .pin-edit-btn /
          .toggle-btn:disabled / .del-btn / .pcv2-selected / ::after）
433-438   .pcv2-row-deleting
444-449   #pcV2PanelBody（基本ルール）
456-470   #pcV2PanelBody.pcv2-panel-markers 及び ::after
476-499   #pcV2PanelBody.pcv2-panel-import 配下（footer/status/run-btn）
518-849   #pcV2PanelBody.pcv2-panel-backup 配下 一式、
          .track-backup-options-* 一式、#trackBackupSizeAudio、
          #pcV2PanelBody .export-* 一式（Export/Control共通モーダル部）、
          #pcV2PanelBody .auto-speed-number
853-910   .pcv2-control-eq-heading / .pcv2-section-divider /
          .pcv2-eq-heading-row 及びその子孫一式
1699-1707 #pcV2PanelBody.pcv2-panel-color 配下（.qn-menu-section*）
1713-1733 #pcV2PanelBody（2つ目の基本ルール定義箇所）と
          ::-webkit-scrollbar 系
1738-1767 #pcV2PanelBody.pcv2-panel-text 配下（.note-textarea等）
```

### シェル側に残すセレクタ（107ブロック＋SP媒体クエリ全体、約679+363行）

```
22-182    #pcV2Root / html.pc-v2-active-html / body.pc-v2-active 系 /
          #pcV2Layout / #pcV2TimeRow / #pcV2IconBar と子孫一式 /
          #pcV2IconBarSpacer / #pcV2IconBarBottom / #pcV2Panel（外枠）
913-1147  #pcV2WaveArea と子孫一式（#pcV2WaveFabRow / #appTitle /
          #pcV2TimeRow #timeDisplay系 / .vbar* / #vbarContainer /
          .vbar-line* / .vbar-label* / .vfill）
1155-1351 #pcV2BottomBarAnchorTabs / #pcV2BottomBar と子孫一式
          （.top-controls / .pcv2-ctrl-* / .pcv2-ctrl-btn系） /
          #pcV2VolumePopup と子孫一式
1358-1538 #pcV2BottomBar #topControls / .tripleNavBtn* / .loopbtn* /
          .loop-preroll-*
1541-1696 body.pc-v2-active #appHeader/#appLogo/#appVersion/
          #qnMenuMount / #pcV2HeaderNav と .pcv2-header-nav-* 一式 /
          #pcV2WaveArea #topControls / .pcv2-qn-loading
1792-2154 @media screen and (max-width: 900px) ブロック全体
          （中身を精査済み、パネル関連セレクタは0件 — §0参照）
```

## 4. 作業手順

### 4-1. 安全網の準備（最重要・必ず作業開始前に実行）

分割は「ブロックを1つも取りこぼさず、1つも重複させず、中身も一切変えずに
2ファイルへ移し替える」だけの単純作業であるべきだが、手作業だと事故りやすい。
そこで、**分割前と分割後で「全セレクタ＋その中身」の集合が完全一致するか**を
機械的に検証する。作業前に、まず元ファイルから正規化済みの「ブロック一覧」を
生成して保存しておく。

```python
# save as /tmp/extract_blocks.py などにして使う
import re, json, sys

def extract_blocks(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    blocks = []
    depth = 0
    buf = []
    sel = None
    for line in lines:
        if depth == 0 and '{' in line and not line.strip().startswith('/*'):
            sel = line.split('{', 1)[0].strip()
            depth += line.count('{') - line.count('}')
            buf = [line]
            continue
        if depth > 0:
            buf.append(line)
            depth += line.count('{') - line.count('}')
            if depth <= 0:
                # 正規化：空白の差異を無視して比較できるようにする
                norm = re.sub(r'\s+', ' ', '\n'.join(buf)).strip()
                blocks.append((sel, norm))
                buf = []
                sel = None
    return blocks

blocks = extract_blocks(sys.argv[1])
# (セレクタ, 正規化した中身) のペアを全部集合として保存
print(json.dumps(sorted(blocks), ensure_ascii=False))
```

実行して結果を保存：

```bash
cd /path/to/QNPLAYER
python3 /tmp/extract_blocks.py CSS/style-layout-pc-v2.css > /tmp/before_blocks.json
```

この`/tmp/before_blocks.json`が「答え合わせ用の正解データ」になる。
**分割作業がどんな手順であっても、最後に必ずこれと突き合わせて検証する
（§4-4）。**

### 4-2. 新ファイルの作成とセレクタの移動

§2の判定基準と§3のリストを使い、`CSS/style-layout-pc-v2.css`から
パネル側のブロックを1つずつ切り出して、新規`CSS/style-pcv2-panels.css`へ
**コメントごと丸ごと**移す（コメントは直前のセレクタの説明であることが
多いので、一緒に移すこと。特に§3で触れている歴史的な経緯コメント
——`v2.13.x`〜`v2.16.x`の変更理由——は、パネルの中身についての説明が
大半なので新ファイルに集約されるはず）。

新ファイルの先頭には、既存ファイルの先頭コメント（ファイル全体の説明）に
倣って、以下のような説明を書く：

```css
/* ============================================================
   style-pcv2-panels.css
   PC v2（QNPLAYER 2.0の唯一の実UI）の中央パネル（#pcV2PanelBody）に
   表示される中身のスタイル。Control/EQ・Markers・Library・Text・
   Backup/Import・Color/Keyboardの各パネルコンテンツ、パネル見出し
   （#pcV2PanelHeader）、右下フローティングボタン（#pcV2PanelFab）。

   外枠（アイコンバー・波形エリア・下部バー・Volumeポップアップ・
   ヘッダーナビ・3カラムグリッド・SP幅の縦積みレイアウト）は
   style-layout-pc-v2.css側（分割の経緯はCSS_SPLIT_INSTRUCTIONS.md、
   CHANGELOGのバージョンXXX参照）。
   ============================================================ */
```

`CSS/style-layout-pc-v2.css`側の冒頭コメントにも、「パネルの中身は
style-pcv2-panels.css側」という一文を追記しておく。

移動が終わったら、元ファイルに残った内容が§3「シェル側に残すセレクタ」の
リストと一致しているか（過不足がないか）を目視でも確認する。

### 4-3. `index.html`の更新

既存の`<link>`（`CSS/style-layout-pc-v2.css`）のすぐ後ろに、新しい
`<link>`を追加する。**現在の読み込み順は以下の通りで、
`style-layout-pc-v2.css`は他の機能別CSS（playlist/markers/control-eq/
controls/export/text/layout-sp）より後、`style-auth.css`等より前に
配置されている（＝カスケードで機能別CSSより優先される）。新しい
`style-pcv2-panels.css`も同じ位置（機能別CSSより後）に置く必要がある：**

```html
<link rel="stylesheet" href="CSS/style-core.css">
<link rel="stylesheet" href="CSS/style-playlist.css">
<link rel="stylesheet" href="CSS/style-markers.css">
<link rel="stylesheet" href="CSS/style-control-eq.css">
<link rel="stylesheet" href="CSS/style-controls.css">
<link rel="stylesheet" href="CSS/style-export.css">
<link rel="stylesheet" href="CSS/style-text.css">
<link rel="stylesheet" href="CSS/style-layout-sp.css">
<link rel="stylesheet" href="CSS/style-layout-pc-v2.css">
<link rel="stylesheet" href="CSS/style-pcv2-panels.css">  <!-- ★追加 -->
<link rel="stylesheet" href="CSS/style-auth.css">
<link rel="stylesheet" href="CSS/style-shareware.css">
<link rel="stylesheet" href="CSS/style-theme.css">
```

### 4-4. 検証（分割の正しさを機械的に確認）

```bash
python3 /tmp/extract_blocks.py CSS/style-layout-pc-v2.css > /tmp/after_shell.json
python3 /tmp/extract_blocks.py CSS/style-pcv2-panels.css > /tmp/after_panels.json
python3 - << 'EOF'
import json
before = json.load(open('/tmp/before_blocks.json'))
shell = json.load(open('/tmp/after_shell.json'))
panels = json.load(open('/tmp/after_panels.json'))
after = sorted(shell + panels)
before_set = [tuple(x) for x in before]
after_set = [tuple(x) for x in after]

missing = set(before_set) - set(after_set)
extra = set(after_set) - set(before_set)

if not missing and not extra:
    print(f"OK: 完全一致。ブロック数 {len(before_set)} 件、過不足なし。")
else:
    print(f"NG: 差分あり。missing={len(missing)} extra={len(extra)}")
    for sel, body in list(missing)[:10]:
        print("  [MISSING]", sel)
    for sel, body in list(extra)[:10]:
        print("  [EXTRA]", sel)
EOF
```

**`OK`が出るまで分割作業を完了させたことにしない。** `NG`が出た場合、
`missing`はどちらのファイルにも移されなかったセレクタ（消失）、`extra`は
中身が変わった/重複したセレクタなので、1件ずつ原因を確認して直す。

このほか、プロジェクト既存の検証コマンド
（`AI_ASSISTANT_PROJECT_CONTEXT.md`§6）も通常通り実行する：
- 全JSファイルの`node --check`
- HTML構文チェック（`HTMLParser`で読めるか）
- 全CSSファイルの波括弧`{`/`}`対応数チェック
- `index.html`内のID重複チェック（`grep -o 'id="[^"]*"' | sort | uniq -c`）

### 4-5. 見た目の確認（実際に描画して比較）

行が完全一致していても、`index.html`への`<link>`追加漏れや、
カスケード順（§4-3）を間違えると見た目が変わる可能性はゼロではない。
Playwright等のヘッダレスブラウザが使えるなら、分割前後で以下を撮って
見比べる（本チャットでの過去の作業でも同様の手法を使っている）：

- PC幅・SP幅それぞれで、Control/EQ・Markers・Library・Text・Backup・
  Import・Color・Keyboardの全パネルを開いた状態のスクリーンショット
- SP幅でパネルを開閉した時のアニメーション・レイアウト崩れの有無
- 右下FABボタン（ADD AUDIO/ADD MARKER/EDIT）の位置・色
- ブラウザのコンソールエラーが増えていないか

## 5. ドキュメント更新（分割後、忘れずに）

`style-layout-pc-v2.css`という名前を参照している既存箇所を確認した結果、
**本当に更新が必要なもの**と**そのままで問題ないもの**を切り分け済み。
以下の表の通りに対応する（行番号は本ドキュメント作成時点のもの、
ズレていたら`grep -n "style-layout-pc-v2.css"`で探し直す）。

| ファイル:行 | 内容 | 対応 |
|---|---|---|
| `AI_ASSISTANT_PROJECT_CONTEXT.md:11` | 「関連ファイル」一覧、`PC_V2_FILE_INDEX.md`の説明文 | **要更新**：「最大2ファイル」→「最大3ファイル」、`style-pcv2-panels.css`も列挙 |
| `AI_ASSISTANT_PROJECT_CONTEXT.md:47` | §1ファイルマップの`style-layout-pc-v2.css`行 | **要更新**：「現在の唯一のレイアウト実装」の説明を「シェル（外枠）実装」に変え、直後に`style-pcv2-panels.css`の行を追加（「パネルの中身の実装」） |
| `AI_ASSISTANT_PROJECT_CONTEXT.md:78` | 「大手術」の説明、`style-layout-pc-v2.css`末尾のSP`@media`ブロックへの言及 | 更新不要（SP`@media`ブロックは丸ごとシェル側=同ファイルに残るため、この記述は分割後も正しい） |
| `AI_ASSISTANT_PROJECT_CONTEXT.md:84` | 「SP版の見た目がおかしい」相談の一次窓口 | 更新不要（同上の理由）。余裕があれば「パネルの中身のSP表示崩れは`style-pcv2-panels.css`側の可能性もある」と一言足すとより親切 |
| `AI_ASSISTANT_PROJECT_CONTEXT.md:323`（§3-12） | markers/playlist共通セレクタの教訓、`.del-btn`等 | **要更新**：該当セレクタは全てパネル側に移動するため、`style-layout-pc-v2.css`→`style-pcv2-panels.css`に差し替え |
| `AI_ASSISTANT_PROJECT_CONTEXT.md:666`（§5運用ルール） | `PC_V2_FILE_INDEX.md`更新対象ファイルの列挙 | **要更新**：`style-pcv2-panels.css`も列挙に追加 |
| `PC_V2_FILE_INDEX.md:3` | 冒頭、対象2ファイルの行数概算 | **要更新**：3ファイル構成に、行数も実測し直す |
| `PC_V2_FILE_INDEX.md:109`（`## CSS/style-layout-pc-v2.css`見出し） | CSSセクション目次 | **要更新**：`## CSS/style-layout-pc-v2.css`（シェルの目次）と`## CSS/style-pcv2-panels.css`（パネルの目次）の2見出しに再構成。既存の「基本ブロック」の記述内容をこの分類に沿って振り分ける |
| `PC_V2_FILE_INDEX.md:158`（目次更新ルール） | 対象ファイルの列挙 | **要更新**：`style-pcv2-panels.css`も対象に追加 |
| `UI_TERMINOLOGY.md:45` | SP幅メディアクエリブロックへの言及 | 更新不要（同上の理由） |
| `JS/player-ui-pc-v2.js:184` | `#pcV2IconBarScrollHint`の配置説明 | 更新不要（アイコンバー＝シェル側、同じファイルのまま） |
| `JS/player-ui-pc-v2.js:1022` | FABボタンの配置説明（`panelBody基準の右下`） | **要更新**：`style-layout-pc-v2.css`→`style-pcv2-panels.css` |
| `index.html:22` | `<link>`タグ本体 | §4-3で対応済み（新規行を追加、既存行はそのまま） |

このほか、`QUICK_START.md`のファイル一覧・ルックアップ表は、CSSファイル名を
直接列挙していないので更新不要（`PC_V2_FILE_INDEX.md`経由で追える）。

## 6. バージョン・CHANGELOG

これは見た目や動作を一切変えない内部リファクタなので、その旨が伝わる形で
`CHANGELOG.md`に追記する。バージョンは着手時点の`window.QN_APP_VERSION`
（`index.html`で確認）から**パッチ番号を1つ上げる**。

```markdown
## X.X.X — 【リファクタのみ・動作/見た目の変更なし】PC v2のCSSをシェルとパネルの2ファイルに分割
- `style-layout-pc-v2.css`（2166行）を、外枠（アイコンバー・波形エリア・
  下部バー・Volumeポップアップ・ヘッダーナビ・3カラムグリッド・SP幅レイアウト）
  と、中央パネルの中身（Control/EQ・Markers・Library・Text・Backup/Import・
  Color/Keyboard、パネル見出し・右下FABボタン）の2ファイルに分割。
  `style-layout-pc-v2.css`（シェル専用）はそのまま、新規
  `style-pcv2-panels.css`（パネルの中身専用）を追加。
  全セレクタが過不足なく移動していることを機械的に検証済み
  （詳細は`md/CSS_SPLIT_INSTRUCTIONS.md`）。
```

`index.html`の`QN_APP_VERSION`もこの番号に更新する。

## 7. 完了後、この指示書自体について

作業が完了したら、このファイル（`md/CSS_SPLIT_INSTRUCTIONS.md`）は
役目を終えるので、内容を「実施済み」に書き換えるか、削除してよい
（ユーザーに確認してから）。削除する場合は、`QUICK_START.md`や
`AI_ASSISTANT_PROJECT_CONTEXT.md`にこのファイルへの言及を追加していないか
一応確認する（本ドキュメント作成時点では追加していない）。
