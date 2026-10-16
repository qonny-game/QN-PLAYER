# EXPORTアプリ(書き出し専門ツール) — v4.70.0〜

QNPLAYER内のアプリ `id:"export"`(ロゴ表記 QNEXPORT)。音声ファイルを読み込み、Trim/Speed/Key/EQ/Compressor/Normalizeをかけて WAV / MP3 / FLAC / OGG Opus / M4A(AAC)で書き出す。処理はすべて端末内(サーバー送信なし)。

## ファイル
| ファイル | 役割 |
|---|---|
| `JS/qn-export-core.js` | `window.QNExportCore`。DOMなしの処理本体。`decode(blob)` → `process(buf, opts, onProgress)` → `{blob, ext, sampleRate, channels, info, duration}`。`peaks` `toAudioBuffer` `encodeWav` `analyze`も公開 |
| `JS/qn-export-codecs.js` | `QNExportCodecs`。FLAC(自前: 固定予測+Rice)、OggのOpus(WebCodecs+自前Ogg)、M4A(WebCodecs AAC+自前MP4)。`supports()`で端末対応を調べる |
| `JS/soundtouch-core.js` + `JS/LICENSE-soundtouchjs.txt` | SoundTouch(MPL-2.0)を同梱。`window.QNSoundTouch`。速度は`tempo=speed/pitch`、キーは`pitchSemitones` |
| `JS/lame_min.js` | MP3エンコード。MP3書き出し時に初めて読む(遅延読み込み。`window.lamejs`はMp3Encoderを持つ関数) |
| `JS/qn-app-export.js` | UI・登録。サイドバーなし。ステージに曲ごとのブロック(折りたたみ可。波形+Split/Preview+その曲の一括+範囲一覧)、上に全曲の一括(All files)、下バーにDownload/接尾辞/Export |
| `CSS/style-qnx.css` | `.qn-ex*`(`style-export.css`は別物なので使わない) |
| `md/tools/e2e_export.py` | 実処理の確認(長さ・天井・ヘッダ・Library追加・ZIP) |

## 処理の順番
decode → Trim → SoundTouch(Speed/Key) → OfflineAudioContextでEQ(10バンド peaking Q1.4、PLAYERと同じ周波数)+Compressor → Normalize(peak=-1 dBFS天井 / loud=ゲート付きRMSを目標にそろえ、リミッタ) → WAV(16/24/32f) か MP3。
設定は範囲(Part)ごと(`g.o`)。上段「All parts」(`S.def`)は一括指定で、触った項目を全範囲に反映し新しい範囲の初期値にもなる(`qn_export_settings`の`def`)。範囲ごとの設定帯は、[形式·ビット/ビットレート·サンプルレート]ボタン(popup=out)・[Speed·Key·EQ]ボタン(popup=tone)の2つ+アイコンの下のスイッチ(Mono/Normalize/Comp/Library。Normalize/Compのアイコンは押すとモード・強さのpopup)。データは`normOn/compOn/speedOn/keyOn/eqOn`+値(`norm/comp/speed/key/eq`)。メイン画面の下にはファイルごとのブロックが並び、その中に範囲が並ぶ(波形は選択中の範囲)。All partsは全ファイル全範囲。複数ファイルはDownload時に自動でZIP。パネルの折りたたみは`qn_export_panel_collapsed`。

## Libraryとの関係
- 読み込んだファイルはLibraryに入らない(メモリ上だけ)。
- `From Library`は`playlist[i].file`を一覧に足す(コピー)。
- `Add to Library`ON → 書き出し結果を`new File([blob], name)`で`addFilesToPlaylist`へ。`Download`とは独立(両方OFFだとExport不可)。
- 名前は `<元の名前><Suffix>.<拡張子>`。同名は`_2`…を付ける。複数+Zip ONで`qnplayer_export_<日付>.zip`。

## 制限・今後
- 形式: WAV・MP3・FLAC・OGG(Opus)・M4A(AAC-LC)。Vorbis(.ogg)は未対応。OGG/M4AはWebCodecsのAudioEncoder対応時だけ形式に出る(素のChromiumはAAC不可)。
- 分割: 1ファイルは複数の範囲(`segs`: name/start/end/on)を持てる。波形クリックで分割点→Split。範囲ごとに名前とトリムを持ち、全部が別ファイルになる。Trimのスライダー・ハンドルは選択中の範囲に効く。
- プレビューはTrim開始から最大20秒を同じ処理で作って再生。
- 長い曲(数十分)はメモリを使う。無料/有料の制限は未適用。
- ヘッドレスChromiumでの確認のみ。実機の音・長尺・iOS Safariは未確認。

## v4.74.0 構成メモ
- サイドバー(Edit/Output)は撤去。Trimは波形のハンドルのみ、Download・接尾辞は下バー。
- 曲(`it`)が`def`(その曲の一括表示値)・`segs`・波形(`it.pk`ピークのみ保持。音声は読み込み後に捨て、Preview/書き出し時に再デコード)・`folded`を持つ。読み込みは1曲ずつの直列キュー。
- 一括は2種類: `"bulk"`(全曲・`S.def`)と`{fb: it}`(その曲の全範囲・`it.def`)。`setOpts`が分岐。
