# QN-PLAYER バージョン履歴

`window.QN_APP_VERSION`の更新履歴。新しいセッションの最初に「前回どこまで
進んだか」を確認する用途、および過去のバグ（`AI_ASSISTANT_PROJECT_CONTEXT.md`
§3）がどのバージョンで混入・修正されたかを追う用途に使う。

**新しいバージョンをリリースしたら、このファイルの末尾に追記すること。**
書式は `## <バージョン> — <一言タイトル>` の下に変更点を箇条書き。

---

## 2.2.0 — マーカーループのプリロール/ポストロール機能
- ループ再生時、マーカーの何秒前から再生を始めるか／何秒後まで聴いて
  から折り返すか（前後共通秒数）を設定できるように。Loopボタンの右に
  ステッパーUIを追加。

## 2.5.0 — 1曲バックアップ機能（初版）
- Playlist EDITモードの各曲行にダウンロードボタンを追加。音声データ／
  曲名／アーティスト／マーカー位置／マーカーメモ／テキストメモを選んで
  ZIPでダウンロード。

## 2.6.0 — バックアップの一括化
- 曲ごとのダウンロードボタンを撤去し、PC v2サイドメニューに「Backup」
  アイコンを新設。ライブラリ全曲を一括バックアップする方式に変更。

## 2.6.1 — バックアップモーダルのデザイン修正
- チェックボックス行の横はみ出し（見切れ）を修正。丸いチェック円デザイン
  に刷新。

## 2.7.0 — インポート機能の追加
- Backup/Importタブ構成のモーダルに。ZIPまたはmarkers.json単体を読み込み、
  ライブラリへの追加・マーカー/メモの反映・重複曲の上書き/スキップ選択に
  対応。

## 2.8.0 — サイドメニュー整理、削除の一括トグル
- Exportアイコンをサイドメニューから非表示（機能は温存）。重複曲リストに
  「すべて上書き/すべてスキップ」の一括トグルを追加。PC幅で2列レイアウト
  （後に撤回、§2.9.0参照）。

## 2.8.1 — Importモーダル使用中のD&D誤爆防止
- Backup/Importモーダルが開いている間、ページ全体の「曲追加用」D&Dを
  無効化。

## 2.8.2 — Backup/Importモーダルのサイズ固定
- PC2列レイアウトを撤廃し常に縦積みに。モーダル幅・本文の最小高さを
  固定し、タブ切替のたびに位置が動く問題を解消。

## 2.9.0 — トグルUIの刷新、Import完了後のBack導線
- 上書き/スキップの選択を2ボタンからカプセル型トグル1個に変更。ZIP読込後
  ドロップゾーンを隠し「読み込み済み」表示＋Cancelを「Back」に変更する
  導線を追加。

## 2.9.1 — トグルをEQと同じON/OFFスイッチに統一
- カプセルトグルをやめ、`.glow-switch`（EQのON/OFFと同じ丸ノブ型）を採用。
  左の読み込み済みカードをコンパクトな帯に縮小。

## 2.10.0 — お気に入り（ピン留め）機能
- ライブラリ各曲にピンアイコンを追加。ONにした曲は実データ上「お気に
  入りグループの末尾」に移動し、リスト上段に固定される。上書き/スキップ
  のON/OFF意味を反転（ON=上書き、OFF=スキップ）。

## 2.10.1〜2.10.3 — お気に入りピンのデザイン調整
- アイコンをハート型から画鋲（push pin）型に変更。サイズ調整、配置を
  duration（時間表記）の右へ移動、EDITモード中は非表示にしてタイトル
  欄を広げる対応。

## 2.10.4 — 【重要】SP再生不可・削除未反映バグ修正
- （`AI_ASSISTANT_PROJECT_CONTEXT.md`§3-3・§3-4の初出）`audio.play()`を
  タップのコールスタック内で同期的に呼ぶよう順序変更。PC v2の一括削除に
  `deletePlaylistTrack()`呼び出しを追加（IndexedDB未削除だったバグ）。

## 2.10.5 — 削除選択中のSKIP/PLAY誤操作防止
- DELETE用チェックが1件でもある間はSKIP/PLAYトグルを無効化。

## 2.10.6 — 削除の当たり判定拡大、フェードアウト演出
- 削除チェック（●）の実際のタップ判定を周辺帯全体に拡大。一括削除確定時
  にフェードアウトしてから消えるアニメーションを追加。

## 2.11.0 — Backup/Importの音声なし出力対応
- 「音声データ」チェックを外した場合、ZIPではなくmarkers.json単体で
  ダウンロード。Import側もZIP/JSON両対応に。

## 2.12.0 — Backup/Importのモーダル分離、フロー変更
- サイドメニューのBackup/Importアイコンを分離（別モーダル）。Backupの
  フローを「曲を選択→項目選択→Download」に変更。曲ごとの概算ファイル
  サイズ・合計サイズ表示を追加。

## 2.12.1 — 【重要】インポート後の不安定さ調査（第一弾、不十分）
- `persistPlaylistOrder()`を並行実行(`Promise.all`)から直列実行に変更、
  IndexedDB接続をキャッシュして使い回すように。**この時点ではまだ
  「全曲分Blobごと書き直す」設計自体は変えていない
  （根本修正は§2.13.3、`AI_ASSISTANT_PROJECT_CONTEXT.md`§3-5参照）。**

## 2.12.2 — 【重要】ループのシーク混線バグ修正
- （§3-2の初出）シーク開始箇所11箇所を`beginSeek()`という共通関数に統一。
  プリロール設定中、別マーカーへシークした際に前の区間の判定が生き
  続けてしまう不具合を修正。

## 2.13.0 — SP下部コントロールの拡大、PLAY/MARKERアンカータブ
- Play/Marker/Loop等のボタンをSP幅でサイドバーと同程度のサイズに拡大。
  下段バーの直上にPLAY/MARKERアンカータブを新設（バーの横スクロール
  位置をジャンプさせる）。

## 2.13.1 — アンカータブ位置の微調整、区切り線追加
- PLAYタブを実際のPlayボタンの真上に動的配置。下段バーとアイコンバーの
  境界に区切り線を追加。

## 2.13.2 — 【重要】アンカータブの表示位置バグ修正
- （§3-6の初出）CSSの`order`に小数値（`1.5`, `1.8`）を使っていたため
  無効値として無視され、タブがヘッダー直下に表示されてしまう不具合を
  修正。全要素の`order`を整数で振り直し。

## 2.13.3 — 【最重要】persistPlaylistOrder()の重さを根本修正
- （§3-5の本修正）`persistPlaylistOrder()`を「Blobに一切触れず、
  savedAt/enabled/title/artist/favoriteだけ更新する」軽量な実装に変更。
  ピン留め・並び替え・インポートいずれの操作後も、アプリ全体が不安定に
  なる（再生できない、フリーズ）症状の根本原因を解消。

## 2.13.4 — 【最重要】SPで再生中にページが強制再読み込みされる不具合の対策
- （§3-10）PC v2の波形上書き描画（`pcv2WaveLoop`）が毎フレーム・常時
  6本のcanvasへ約4000本のバーを全描き直しし、1フレームごとに
  `getBoundingClientRect()`×6・`getComputedStyle()`×6・色文字列生成を
  行っていた負荷を削減。約10回/秒に間引き、変化が無ければ描画自体を
  スキップ。サイズ計測はresize時のみ、色文字列はキャッシュ。
- 波形用デコードを共有AudioContextから低サンプルレートの
  `OfflineAudioContext`に変更（通常再生でリアルタイムAudioContextが
  常駐しないように。デコード時の一時メモリも約1/5に）。
- スライダー進捗同期ループ（約5回/秒）とGlowテーマ（約15回/秒）も間引き。

## 2.13.5 — 【最重要】並び替え後に再生できなくなる不具合の根本修正ほか
- （§3-11）ライブラリの並び替え・お気に入り・タイトル編集後、曲名だけ
  切り替わって再生・波形・マーカーが更新されなくなる不具合を修正。
  iOS Safariでは音声Blobを持つIndexedDBレコードをget→putし直すだけで
  Blob実体が作り直され、メモリ上の各曲Fileが読めなくなっていた。
  メタデータ（並び順・ON/OFF・タイトル・アーティスト・お気に入り）を
  localStorage（`qn_playlist_meta_v1`）へ分離し、これらの操作では
  IndexedDBに一切書き込まないように変更。読み込めなかった場合に
  IndexedDBから音声を読み直して1回だけ再試行する保険も追加。
- （§3-12）マーカーのEDITモードで削除●を選択できない不具合を修正
  （`.del-btn`の`pointer-events: none`をplaylistパネル限定に）。
- 波形（シークバー）をGlowの明滅対象外に。Glow中は元のアクセント色で
  固定表示し、停止中の波形再描画をゼロに。

## 2.14.0 — Backup/Importのパネル化、ADD MARKER追加、SP操作性の修正まとめ
- Backup/Importをモーダルからサイドメニューのパネル表示に統一（PC・SP共通）。
  閉じるだけのCancelは非表示、完了後はSP=パネルを閉じる／PC=Libraryへ切替。
- シークバーエリアのADD AUDIOの右隣にADD MARKERボタンを追加。
- （§3-13）テキストメモ・マーカーを、音声の読み込み完了を待たず曲切替の
  瞬間に読み込むよう変更（前の曲のテキストが残り、新しい曲名で上書き
  保存されて「全曲共通」に見える問題の対策）。
- （§3-14）ライブラリのワンタップ再生が効かないことがある不具合を修正。
  iOSでホバー時に鉛筆アイコンが出るCSSが「1回目のタップ＝ホバーのみ」
  扱いを招いていたため、ホバー表示をマウス環境限定に。行のどこを
  タップしても再生されるように（サムネイル・長さ表示・余白も対象）。
  マーカー名も同様。タッチ端末のマーカーメモ編集はEDITモードで鉛筆を常時表示。
- （§3-15）SPでVolumeの縦スライダーが背面に隠れて操作できない不具合を修正
  （ポップアップをbody直下・position:fixedへ、タッチ操作にも対応）。
- Markers/Libraryリストのスクロール終端を約2行分延長（右下ボタンに
  隠れた行も押せるように）。
- SP：下段バーのMARKERグループとVolume/Speed/Key/EQの間に仕切り線を追加。

## 2.14.1 — 【重要】PC版Chromeで全体がもっさりする不具合の対策
- （§3-16）閉じているモーダルの器（`.export-modal-overlay`、5個）に
  `backdrop-filter: blur(0px)`が常時付いており、画面全体の背景フィルター
  合成レイヤーが5枚重なり続けていた。閉じている間は`backdrop-filter: none`
  ＋`visibility: hidden`に変更。
- 時刻表示・シークバー進捗のDOM書き込みを「値が変わった時だけ」に。
- PC v2波形のアクセント色読み取り(getComputedStyle)を0.5秒に1回までに。

## 2.14.2 — Controlパネル初回表示時の再生途切れを修正
- （§3-17）`setupAudioGraph()`の順序を変更。SoundTouchJSの読み込み・
  AudioWorklet登録・EQフィルター作成・AudioContextのresumeを全て済ませて
  から、最後に`createMediaElementSource()`〜出力先への接続を同期的に一気に
  行う。以前は先に音声要素をグラフへ回してから準備を待っていたため、
  その間（初回0.1〜0.2秒）無音になっていた。
- 準備中に操作されたEQスライダー値も、接続時にフィルターへ反映し直す。

## 2.15.0 — マーカーメモのプリセット改善・自動カラー、削除判定の拡大
- マーカーEDITモードの削除●のタップ判定を、Libraryと同じ広いゾーン
  （`.pin-del-zone`、行の上下いっぱい・右端まで）に拡大。DELETE選択が
  1件でもある間は表示/非表示（目）アイコンを押せない仕様もLibraryと統一。
- （§3-18）マーカーメモのプリセットを行内ではなくポップアップで表示
  （リストが広がらない）。プリセットを押すと、メモ確定・ポップアップと
  編集モードの終了まで自動で行う。
- 新機能：Colorパネルに「Marker Memo Colors」を追加。プリセットごとに
  自動で付くマーカー色を設定できる（初期配色は色相が離れるよう設定、
  「色なし」も選択可）。プリセットのチップ先頭に設定色の丸を表示。
- ドキュメント：`AI_ASSISTANT_PROJECT_CONTEXT.md`に§3の症状→項目早見表と、
  §7「重さ・端末特有の落とし穴チェックリスト」を追加。

## 2.15.1 — Backupパネルのレイアウト刷新、パネル裏更新の不具合修正
- （§3-19）別パネル表示中に曲を切り替えると、Markers（およびLibrary・
  Text）パネルに前の曲の内容が残る不具合を修正。パネルの中身を
  切り離さず、document内の非表示の退避場所`#pcV2PanelStash`へ移す方式に。
- Backupパネル：曲選択リストがパネルの残りの高さを全部使うように拡大。
  「含める項目」は折りたたみ式にし、見出しに「N/6項目・約◯MB」を表示。
  各項目の右端に推定サイズ（音声データは選択曲の合計）を表示。
  角丸の枠をやめ、線で区切るシンプルな行に。全選択/全解除の下に余白。
  曲の行のチェックも丸型に統一。
- パネル内のDOWNLOAD/IMPORT等のボタンを左右完全な半円（pill型）に。

## 2.16.0 — UIデザインの統一（角丸・文字サイズ・ボタン）
- `style-core.css`の`:root`に角丸（pill/round/field/popup/modal）・文字サイズ
  （title/heading/body/small/micro/btn/btn-primary）・二次ボタン寸法の
  トークンを追加し、パネル・ポップアップ・ボタン・入力欄の直書き値を
  トークンへ置き換え（§8）。
- RESET・EQプリセット・Save as Preset・全選択/全解除・Auto Speedの方向切替・
  Exportの選択肢・PLAY/SKIP等の文字入りボタンを全てpill型に。
  KEYの−/＋、鉛筆・目・ピン等のアイコンボタンは丸型に統一。
- 文字サイズを5段階に統一（例：マーカー名15px・曲名13px→ともに14px、
  アーティスト名・曲の長さ11px→12px、RESET 10px→12px）。
- Importパネルの読み込み済み情報・重複曲リスト・結果表示も、角丸の枠を
  やめて線で区切る表示に。
- 下部コントロールバー等の意図的な例外は§8に明記。

## 2.16.1 — シークバーを画面に収まる範囲で最大の高さに
- シークバー6本の高さを固定値ではなく、波形エリアの残り高さを等分する
  flexレイアウトに変更（PC・SP共通）。ウインドウを小さくしてもスクロール
  バーが出ず、大きくすれば可能な範囲で高くなる（1本あたり最小24px/SP20px、
  最大180px）。
- 右下のADD AUDIO/ADD MARKERに最下段が隠れないよう、その分だけ下を確保。
- バーの大きさが変わったらResizeObserverでcanvasの解像度を合わせて描き直す。
- ユーザー側の調整（`.vbar`の背景#111、`#vbarContainer`のmargin-top削除、
  `#pcV2WaveArea`のgap削除）を反映。

## 2.16.2 — SPでマーカー線のドラッグが初回だけ止まる不具合を修正
- （§3-20）ドラッグ中に毎回マーカー線を作り直していたため、iOS等で
  タッチの後続イベントが届かなくなり、初回は少しだけ動いて止まっていた。
  ドラッグ中はつかんだ線の位置だけをその場で更新し、番号の振り直し・
  リスト更新・保存は指を離した時に1回だけ行うよう変更。タッチの
  イベントはタッチを始めた要素自身で受ける。
- マーカー線に`touch-action: none`と、左右に広い透明なつかみ判定を追加
  （細い線でも指でつかみやすく）。
- 6px未満の小さな指のブレではマーカーが動かないように（タップ判定を優先）。

## 2.16.3 — 常時アニメーションによるスタイル再計算を解消
- （§3-21）Controlパネル表示中に「スタイル再計算/秒」が約100に張り付く
  原因だった、ON状態トグル（Speed/Key/EQ・Glow）の無限明滅を修正。
  box-shadowは固定の擬似要素に持たせてopacityだけを動かし、明滅は2回で
  停止（表示時・ON時に再生）。
- 長い曲名のマーキーは3周で停止し、タイトルにマウスを乗せる/タップで再度流す。
- SPのアイコンバーのスクロールヒント矢印も3回で停止。
- 計測で、Library/Control/Markers/Colorの全パネルとも停止中のスタイル
  再計算0回/秒を確認。

## 2.16.4 — フローティングボタンとパネル見出しをテーマ色に
- ADD AUDIO/ADD MARKER/EDIT/Fullscreen等のフローティングボタンの背景を
  Colorパネルで選んだテーマ色（`--accent-primary`）に。ホバーは`--accent-hover-1`。
- EDITの編集中（OK表示）は、通常時と区別できるよう「白地＋テーマ色の文字」に反転。
- パネル見出し（CONTROL/MARKERS/LIBRARY/TEXT等）の文字色をテーマ色に。

## 2.16.5 — 下段バーのVolume/Speed/Key/EQボタンの色を統一
- 通常時は他のアイコンボタンと同じグレー。Speed/Key/EQはONの間だけ、
  Volumeは縦スライダーを表示している間だけ（`.is-open`）テーマ色。
- Speed/Key/EQのアイコンに白・グレー・テーマ色が混ざっていた原因を修正：
  アイコンの塗り(fill)だけ固定グレー、線(stroke)はボタンの文字色、と
  別々に色が決まっていたため。fillも`currentColor`に揃えた。
- ホバーで明るくなるのはマウス環境だけに（タッチ端末でホバー色が残らない）。

## 2.16.6 — ループのプリ/ポストロール中の前/次マーカー移動を修正
- （§3-22）マーカーループ中にプリロール/ポストロール部分を再生している間、
  前/次マーカーボタンは「今ループ中の区間」の内側にいるものとして動作する
  ように。例：1-2ループのポストロール中に「次」→ 2（次の区間2-3の頭）へ。
  「前」→ 1（今の区間の頭）へ。

## 2.16.7 — SPでBackupの「含める項目」を開くとリストに重なる不具合を修正
- （§3-23）`#pcV2PanelBody`（元々overflow-y: autoでスクロールする要素）の
  中で、曲選択リストを「残り高さを全部もらう」ためflex:1を3段重ねていた
  構成が、iOS Safariでリストと後続セクションの重なりを引き起こしていた
  （Chromeでは再現しなかった）。flex:1で埋める構成をやめ、曲選択リストは
  `max-height: min(58vh, 520px)`の上限つき固定高さで自前スクロールする、
  他のパネルと同じシンプルな1箇所スクロール構成に戻した。

## 2.16.8 — マーカーの無料版ロック表示崩れ、曲送りでの制限すり抜けを修正
- （§3-24）無料版でロックされたマーカー行だけ、色の丸と時刻の間が広く
  空いて文字が右寄りになる不具合を修正。`.pinItem`（display: grid、4列
  固定）へ鍵アイコンを別の子要素として追加していたため列がズレていた。
  鍵アイコンをcolorMarkと同じ入れ物(`.pin-leading-cell`)にまとめ、常に
  4個の子要素になるように修正。
- （§3-25）無料版のライブラリ曲数制限が、下部コントローラーの前/次ボタン・
  ロック画面のメディアコントロール・曲終了時の自動送りからは掛からず、
  すり抜けて制限を超えた曲まで再生できてしまう不具合を修正。制限チェックを
  `playTrackAt()`自体に一本化し、どの経路からでも一律にブロックされるように。

## 2.16.9 — Backupパネルの曲選択リストが広すぎて「含める項目」に届きにくい問題を調整
- 曲選択リストの上限の高さを`min(58vh, 520px)`から`min(38vh, 340px)`へ
  縮小。内側のリストと外側のパネル、2つのスクロール領域が両方とも反応
  しようとして、外側（含める項目・DOWNLOAD）まで届かせるのに指を一度
  離して境界の外からもう一度スワイプするようなシビアな操作が必要
  だったのを緩和。曲数が多くても、リストの下にある「含める項目」が
  初期状態（スクロールなし）でも画面内に収まる高さにした。

## 2.16.10 — 【リファクタのみ・動作/見た目の変更なし】PC v2のCSSをシェルとパネルの2ファイルに分割
- `style-layout-pc-v2.css`（2166行）を、外枠（アイコンバー・波形エリア・
  下部バー・Volumeポップアップ・ヘッダーナビ・3カラムグリッド・SP幅レイアウト）
  と、中央パネルの中身（Control/EQ・Markers・Library・Text・Backup/Import・
  Color/Keyboard、パネル見出し・右下FABボタン）の2ファイルに分割。
  `style-layout-pc-v2.css`（シェル専用）はそのまま、新規
  `style-pcv2-panels.css`（パネルの中身専用）を追加。
  全セレクタが過不足なく移動していることを機械的に検証済み
  （詳細は`md/CSS_SPLIT_INSTRUCTIONS.md`）。

## 2.17.0 — MOREボタン＋アプリ一覧、YouTubeアプリを統合
- サイドバー(`#pcV2IconBar`)の一番下（Keyboard/Colorの下）に**MOREボタン**を追加。
  押すとサイドバーが**アプリ一覧**（PLAYER / YOUTUBE / TUNER / PITCH）に切り替わる。
  項目は通常のサイドバーアイコン(`.pcv2-icon-item`)と同じ見た目・サイズ・位置
  （SP幅の横並びも同じ）。MOREは押すとBACKに変わり、通常のサイドバーへ戻る。
- アプリ一覧の仕組みを新規ファイル`JS/qn-apps.js`にまとめた（`QNApps.register()`で
  1アプリ=1登録。今後アプリを増やす時はここに足すだけ）。TUNER/PITCHは「準備中」
  （押すとトースト表示）として先に枠だけ用意。
- YouTubeプロトタイプ(単体版)を`JS/qn-app-youtube.js`＋`CSS/style-apps.css`として統合。
  見た目をQNPLAYERの配色トークン・パネル・ボタンに統一。単体版からの変更点：
  idの名前空間化(`data-yt`)、IFrame APIは初回に動画を読み込む時まで取得しない、
  非表示中はポーリング停止＋`pauseVideo()`、削除は2度押し確認(confirm()廃止)。
  規約ルールは`md/YOUTUBE_APP.md`（YouTubeアプリの仕様＋規約）に集約。
- アプリ表示中は`body.qn-app-open`が付き、本体の下段バー等を隠す＆audioを一時停止＆
  キーボードショートカット(`player-ui-shared.js`のkeydown)を無効化。

## 2.17.1 — アプリ一覧からPLAYERへ戻る導線、YouTube画面への波形ラベル透け修正
- アプリ一覧の「PLAYER」を押すと、アプリを閉じるだけでなく
  サイドバーも通常表示(BACK相当)へ自動で戻る。YouTube画面に本体の波形マーカー
  ラベル(z-index:51)が透けて残る問題を、`#qnAppHost`のz-indexを20→150にして解消。

## 2.18.0 — アプリ表示中のサイドバーをMORE構造に統一
- アプリ表示中のサイドバーを、本体と同じMORE構造に変更。YouTube表示中は
  サイドバーが「Library / Markers」＋MOREになり、アイコンでパネルの中身を切替
  （PC幅=パネル常時表示、SP幅=全面オーバーレイで開閉）。MOREはアプリ一覧の
  表示/非表示だけを切り替え、BACKでも開いているアプリは閉じない（PLAYERを選ぶと本体へ）。
  アプリ側は`QNApps.register({sidebar,onSidebar})`＋`QNApps.setSideActive()`で対応。

## 2.18.1 — サイドバー/アプリバーのホバーを統一
- サイドバー/アプリバー共通のホバーを「テーマカラー背景＋黒文字(#0a0a0c)」に統一
  （`(hover: hover)`の端末のみ）。MORE(BACK)だけ常時テーマカラー背景＋黒文字にして差別化。
  色は`style-apps.css`の`--sidebar-on-accent`とテーマ変数で決まる。

## 2.19.0 — YouTube Backup / Import、アプリ中のD&D無効化
- YouTubeアプリに**Backup / Import**を追加（サイドバーにBackup・Importアイコン）。
  本体のBackup/Importと同じ部品・流れ：Backup=リスト選択(全選択/全解除)→含める項目
  (タイトル／マーカー・AB点)→Download(JSON、`qn-youtube-library_YYYYMMDD.json`)。
  Import=JSONをドロップ/選択→動画ID(videoId)が重複するものは上書き/スキップ
  (行ごと＋一括トグル)→Import。読み込み時は値を検証・整形（不正なマーカー等は捨てる）。
  含めるのはURL・手入力タイトル・マーカーのみ（YouTube由来データは含めない）。
  アプリ表示中は本体の「曲追加」D&Dを無効化（`player-ui-pc-v2.js`のdragover/drop）。

## 2.19.1 — テキスト選択の解禁
- テキスト選択を解禁。`style-core.css`の`body { user-select: none }`をやめ、
  シークバーエリア（波形・マーカー線/ラベル）、ボタン類、下段バー、サイドバー、
  つまみ、ドラッグのつかみ部分、YouTubeの3行シークバー/マーカーだけ選択不可に。
  それ以外（パネルの文字、リスト、YouTube画面の文字等）は選択・コピー可能。

## 2.20.0 — アプリ名バッジ、YouTube機能拡充(並べ替え/Auto Next/前後マーカー/速度)
- サイドバーの先頭に**現在のアプリ名バッジ**(`#qnAppBadge`、テーマカラー背景＋黒文字)を追加。
  PLAYER表示中は「PLAYER」、YouTube表示中は「YOUTUBE」。押すとMOREと同じアプリ一覧に切り替わる
  （一覧表示中はバッジを隠し、代わりに一覧が並ぶ）。
- YouTubeアプリ：Library並べ替え(つかみドラッグ)／Auto Next(終了時にLibraryの次の動画を
  読み込み。初期OFF・利用者がONにした時のみ。プレイヤーが半分超見えている時だけ動作)／
  +Markerの左右に前・次マーカーへ移動(現在地基準)／再生スピード(プレイヤー外の自前UI、
  YouTube標準と同じ倍率、setPlaybackRate使用)。
  規約対応：SP幅でパネルがプレイヤーを覆う時は一時停止（見えないまま音だけ流れる状態の防止）。

## 2.20.1 — SP幅YouTube：プレイヤーを常に見せる
- SP幅のYouTube：パネル(Library等)を開いても、プレイヤーを画面上部に小さく
  (高さ max(200px, 30dvh))残し、パネルはその下に表示（覆わない）。パネルを開いた時の
  一時停止は廃止。ざっくり実装（比率は後日調整予定）。

## 2.20.2 — Colorボタンをアプリ中も常駐
- Colorボタンをアプリ表示中・アプリ一覧中も常駐させた(MOREと同じ扱い。今後追加するアプリも共通ルール)。
  PLAYER本体では従来通りColorパネルを開き、アプリ側ではテーマ切替セクションをポップオーバー
  (#qnColorPop)へ借りて表示し、閉じたら元の場所へ戻す。外側クリック/Escで閉じる。
  Keyboardはアプリ側では引き続き非表示。実装: JS/qn-apps.js(initColorKeeper)、CSS/style-apps.css。

## 2.21.0 — マーカーメモのカスタムプリセット
- マーカーメモのカスタムプリセット。Colorパネル「Marker Memo Colors」の末尾に
  「テキスト＋色」の入力行を追加。入力すると次の空欄行が自動で増える。追加したメモは
  マーカー編集時のプリセットチップにも組み込みの後ろへ並び、選ぶと色も自動で付く。
  保存: localStorage `qn_marker_custom_presets_v1` ([{label,color}])。最大30件、
  組み込み/他と同名(大文字小文字無視)は無視、テキストを消すと行は削除。
  実装: JS/player-markers.js(getAllMarkerPresetLabels 他)、CSS/style-theme.css。

## 2.21.1 — 再生中の画面スリープ防止(Wake Lock)
- 再生中の画面スリープ防止(Screen Wake Lock API)。JS/qn-wakelock.js を新規追加。
  PLAYERのaudio再生中とYouTubeアプリの再生中(PLAYING)だけ保持し、一時停止・終了・
  アプリ非表示・タブが隠れた時に解放、表示に戻れば再取得。HTTPS必須・非対応環境では何もしない。

## 2.21.2 — カスタムメモ行の削除ボタン
- カスタムメモ行に削除ボタン(×)を追加。文字が入っている行にだけ表示。

## 2.21.3 — アプリ中のColorをPLAYERと同じパネル表示に
- アプリ表示中のColorをポップオーバーからPLAYERと同じ「パネル」表示に変更
  (PC: アイコンバー右の左カラム全高 / SP: アイコンバー上。YouTubeのプレイヤー([data-qn-keep-visible])は覆わない)。
  サイドバーの他項目を押すと閉じる。アプリ表示中はPLAYER専用の「Marker Memo Colors」を非表示。

## 2.22.0 — YouTube Library/MarkersをPLAYERと同じ操作に統一
- YouTubeのLibrary / Markersを本体(PLAYER)と同じ行・同じ操作に統一。
  Library: 行は本体の.playlistItem(ドラッグ、タイトルのホバー鉛筆編集、クリックで再生)。右下のEDIT→OKで
  タイトルを常時入力化し、PLAY/SKIPトグル(SKIPはAuto Nextで飛ばす)と削除用の丸チェックを表示、Deleteで一括削除(フェード付き)。
  Markers: 行は本体の.pinItem(色の丸→カラーパレット、メモ編集＋プリセットチップ(選ぶと色も自動)、目アイコンで表示/非表示、
  EDIT→OKで丸チェックを選んでDelete)。ADD MARKERもFABに追加。A/B(ABループ)は編集していない時だけ行に表示。
  非表示にしたマーカーはシークバーに出さず、前/次マーカー移動でも飛ばす。色はシークバー上のマーカーにも反映。
  Backup/Importにマーカーのcolor・enabledを追加(任意項目・旧形式も読める)。サムネイルは規約方針(保存しない)により未対応。

## 2.22.1 — YouTubeシークバーをPLAYER風に
- YouTubeのシークバーを本体(PLAYER)のシークバーに寄せた。角丸なし・#111の帯(.vbarを流用)・
  再生済みはテーマ色(.vfill)・現在位置は細い白線・高さ40px(SPは36px)。マーカーは本体と同じ縦線(2px、マーカー色)で、
  線の真上に番号、右にメモ(右端近くは左側に反転)。ドラッグ移動・行またぎは従来通り。波形は使わない
  (YouTubeの音声・映像データに触れないため)。幅変更時はマーカー位置を再計算。

## 2.22.2 — YouTube Save後に入力欄をクリア
- YouTube: Saveしたら URL / タイトルの入力欄を空に戻す。

## 2.23.0 — YouTube チャプター貼り付け
- YouTube Markersに「チャプターを貼り付け」を追加。説明欄からコピーしたテキスト
  (「0:00 タイトル」「1:02:03 - タイトル」「[2:45] タイトル」等・全角可)を1行ずつ解析してマーカー化。
  YouTubeからは何も取得しない(利用者が貼ったテキストを処理するだけ)。重複時刻・動画長超えはスキップ、
  プリセット名と一致するメモは色を自動付与。入力欄にはテンプレ例を薄字で表示。

## 2.24.0 — YouTubeシークバーのマーカー区間をマーカー色で表示
- 色を付けたマーカーから「次の表示中マーカー」（最後は動画の終わり）までの区間に色を付ける（`paintMarkerRanges`、`.qn-yt-range`）。
  色なし／非表示のマーカーは塗らず、次のマーカーで区間が切り替わる。複数行にまたがる区間も行ごとに分割。

## 2.24.1 — マーカー区間：未再生は薄く、再生済みはマーカー色で進む
- 区間の未再生部分は薄い色(`.qn-yt-range-bg`、opacity 0.22)、再生済み部分はマーカー色(`.qn-yt-range-on`)で現在位置まで進む
  （`paintPlayed`、`updateDisplay`から毎回更新）。区間外は従来どおりテーマ色で進む。
  区間レイヤーはz-index:2（`.vfill`より前面、現在位置の白線より背面）。汎用名`.on`/`.bg`はグローバルCSSと衝突しやすいので使わない。

## 2.25.0 — YouTube: スペースキーで再生/一時停止
- YouTubeアプリ表示中、フォーカスがプレイヤー外（ボタンや余白）でもスペースキーで再生/一時停止をトグル（`onSpaceKey`、`getPlayerState()===1`なら`pauseVideo()`、それ以外は`playVideo()`）。
  公式メソッドを利用者のキー操作を起点に呼ぶだけ。input/textarea/select/contenteditableで入力中、修飾キー併用、キーリピート中は無視。
  ページのスクロールとフォーカス中ボタンの誤クリックはpreventDefaultで防止。アプリ非表示時はリスナーを外す。動画未読み込み時は何もしない。

## 2.26.0 — YouTube: 再生/一時停止ボタン、Library前/次ボタン
- シークバー下（マーカーボタン行の上）に新しい行`.qn-yt-transport`：Prev（Libraryの前の動画）／再生⇄一時停止／Next（Libraryの次の動画）。配置・デザインは後日調整予定。
- 再生ボタンはスペースキーと同じ`togglePlay()`（`playVideo`/`pauseVideo`）。アイコンは再生状態に追従（`updatePlayBtn`）。
- Prev/NextはSKIPの動画を飛ばし、押した時に再生開始（利用者操作が起点）。端では「最初/最後の動画です」を表示。Libraryに無い動画（未保存URL）の時は「Libraryの動画を選んでください」。

## 2.27.0 — YouTube Library: Load廃止、SaveだけでLoad＆保存
- Loadボタンを廃止。Saveを押すと、入力欄のURLの動画を読み込み（再生はしない）、同時にLibraryへ保存する（`saveFromInputs`）。
- 判定は入力欄のURL基準：Libraryに同じ動画(videoId)がある＝そのタイトルを更新（Libraryから読み込んで名前を直す使い方）／
  無い新しいURL＝**新規追加**。以前は「先に読み込んだ動画」のタイトルを上書きしてしまう場合があった。
- Enter：URL欄→タイトル欄へ移動、タイトル欄→Save。URL未入力・URL不正はメッセージ表示。SPではSave後にパネルを閉じてプレイヤーを見せる。

## 2.28.0 — 再読み込み時に最後に開いていたアプリを復元
- 開いたアプリを`localStorage`の`qn_last_app`に保存（PLAYERへ戻ったら`player`）。ページ読み込み完了後（各アプリのregister後）、保存されたアプリが「使える」状態なら自動で開く（`scheduleRestore`、`qn-apps.js`）。
  PLAYER・準備中(TUNER/PITCH)・未登録は復元せず本体のまま。今後追加するアプリにも自動で適用される。

## 2.29.0 — YouTube: サムネイル表示、規約リンクのフッター
- Libraryの行にサムネイルを表示（YouTubeの画像URLを`<img>`で参照する表示のみ。16:9のまま全体表示、保存・切り抜き・加工なし。読み込めない時は再生アイコン）。
- YouTubeアプリ画面のフッターに、YouTube利用規約・Googleプライバシーポリシーへのリンクと、保存データの扱いの説明を追加。
- 注意：`<img loading="lazy">`はDOMに付ける前だと読み込まれない。画像は先にthumbへ追加して、読み込めたら表示する。

## 2.30.0 — PLAYERの再生中は画面を閉じてもバックグラウンド再生を維持
- `qn-wakelock.js`：`navigator.audioSession.type = "playback"`（対応ブラウザのみ）を設定し、画面が隠れた/戻った/pagehide/pageshow時に、再生中なのにAudioContext(EQ/Speed/Key経由)が止まっていれば`resume()`する。
- YouTubeアプリは対象外（規約により、隠れている間は再生しない。アプリを閉じると一時停止）。
- 実機依存：iOSではEQ/Speed/Keyを使うと（Web Audio経由になるため）OSに止められる場合がある。素の再生（これらを使わない）が最も安定。

## 2.30.1 — 【切り分け用】Wake Lockを一時的に無効化
- iPhoneのホーム画面アプリでPLAYERのバックグラウンド再生が止まる問題の原因調査。v2.17.0以降、再生系コア(player-core/ui-shared/playlist)は無変更で、追加されたのはアプリ系(qn-apps/qn-app-youtube)とWake Lock(v2.21.1)のみ。
  最も疑わしいWake Lockを`ENABLE_WAKE_LOCK=false`で止めて、止まらなくなるかを実機で確認する。結果次第で戻す（画面スリープ防止機能は一時的に効かない）。

## 2.31.0 — Wake Lockを再開（隠れる時に自分から解放）
- v2.30.1のテストで、Wake Lockを止めるとiPhoneのホーム画面アプリでもPLAYERのバックグラウンド再生が続き、YouTubeはホームに戻ると停止（希望どおり）と確認。
- 画面スリープ防止を再開しつつ、画面が隠れる/`pagehide`の時は自分から先に解放する（`release()`）。表示に戻れば再取得。
- PLAYER側でまた止まる場合は`qn-wakelock.js`の`WAKE_FOR_PLAYER = false`にする（YouTube側の画面スリープ防止は残る）。

## 3.0.0 — アプリ切替をバッジ（＞）のフライアウトに変更、MORE撤去
- サイドバー先頭のアプリ名バッジ（`#qnAppBadge`）の右端に「＞」を追加（サブメニューあり）。PCはマウスを載せる（クリックでも可）と、サイドバーの右にサイドバーと同じデザインでアプリ一覧（PLAYER/YOUTUBE/TUNER/PITCH）のフライアウト`#qnAppFlyout`が重なって出る。
- SP/タッチ：バッジをタップするとアイコンバーの真上に一覧が出る。もう一度タップ・外側タップ・Escで閉じる。
- サイドバー最下段のMORE(BACK)ボタンと、アプリ一覧モード（`.qn-apps-mode`/`setAppsMode`/`.qn-app-item`）を撤去。Color（下段）は従来どおり常駐。
- 変更ファイル：`JS/qn-apps.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。`qn-app-youtube.js`は公開API(`QNApps.register/open/close/toast/setSideActive/layout`)のみ使う前提で無変更。
- 実機確認したい点：SPでのバッジのタップ開閉、フライアウトが横スクロールのアイコンバーの上に正しく出るか。

## 3.0.1 — アプリ一覧フライアウトの調整（アニメーション・縦幅いっぱい・目立たせる）
- アプリ一覧を、PCは左から／SPは下から「にゅっと」出るアニメーションに（閉じる時も同様）。
- PCはサイドバーと同じ縦幅いっぱい（下は空白）、SPは幅いっぱいで表示。
- 出たことに気づきやすいよう、ページ全体を薄暗くする幕`#qnAppScrim`（クリックは素通し）、背景をほんのりテーマ色寄りの暗色、縁にテーマ色のラインを追加。
- 変更ファイル：`JS/qn-apps.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.0.2 — フライアウトのPCアニメーションを「スライド」に修正
- v3.0.1のPC表示はフェードに見えていたため、サイドバーの縁の内側から左→右へ押し出されるスライドに変更（`transform`で全幅ぶんずらしつつ、`clip-path`で縁より左側を切り落とす。SPは同様に下から）。フェード(opacity)は廃止。閉じ終わりの`hidden`は280ms後。
- 変更ファイル：`JS/qn-apps.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.0.3 — PLAYERアプリのサイドバーの並び順を変更
- 並び順を Library → Markers → Text → Control → Backup → Import に変更（`player-ui-pc-v2.js`の`ICON_ITEMS`の並べ替えのみ。Seekbarは従来どおりSP幅専用で先頭、Exportは非表示のまま）。並び順に依存する処理は無い（パネルは`data-panel-id`で参照）。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`index.html`（バージョンのみ）。

## 3.1.0 — YouTubeアプリにYouTube本家と同じショートカット＋Keyboardパネル
- ショートカット追加：Space/K、J/L(±10秒)、←/→(±5秒)、↑/↓(音量±5%)、M(ミュート)、0〜9(0〜90%へ)、Home/End、`,`/`.`(一時停止中の1フレーム)、`<`/`>`(速度)、Shift+P/N(Libraryの前/次の動画)。アプリ表示中のみ有効。文字入力中は無効。
- YouTubeアプリのサイドバーに`Keyboard`を追加（末尾）。PLAYERのKeyboard Shortcuts表を複製して同じデザインで一覧表示。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.2.0 — YouTubeのシークバー下コントロールをPLAYER下段バーのデザインに統一
- ボタン群を「アイコン＋英字」のフラットなバー（`.qn-yt-bar`）にし、再生系│マーカー系│スピードの3ブロックに整理（PLAYERの下段バーと同じ見た目）。
- PC幅はステージ側の下端に吸着（サイドバー・パネルの下へは伸ばさない）。SP幅はPLAYERと同じくアイコンバーの直上に固定し横スクロール。
- スピードのチップは`−/＋`ステッパーに、Auto Next・Loopはボタン（ON=テーマ色）に変更。機能は従来どおり。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。
- 次の予定：見た目が良ければPLAYER側の下部コントロールも同じ方式（PC=サイドバー領域まで伸ばさない）へ集約。

## 3.3.0 — YouTube: シークバー1タップでA / B / +Markerポップアップ
- シークバーを動かさずに1クリック(1タップ)すると、その位置へシークしつつ、上にA・B・+Markerのポップアップを表示。押した位置にマーカーを作ってA点/B点に設定（近く±0.5秒に既存マーカーがあればそれを使用）。4秒・外側タップ・Escで閉じる。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.4.0 — YouTube(PC幅): サイドアイコンでパネルを格納
- 開いているパネルのサイドアイコンをもう一度押すとパネルが左へ格納され、別のアイコンを押すと開く。プレイヤーの大きさは変えない（格納前の幅で固定）。格納状態は再読み込み後も維持（`qn_yt_panel_collapsed`）。SP幅は従来どおり。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.4.1 — YouTube: プレイヤー縦いっぱい・1画面収め・LOOP 3モード
- PC幅：プレイヤーを余りの高さいっぱいに16:9で最大化（横か縦が枠に当たるまで）。シークバー3本まで1画面に収める。タイトル下の時刻表示、シークバー下のヒント文、ステージ下の注意書き(フッター)を撤去。
- LOOPボタンを1つで「OFF → A-Bループ → 区間ループ(マーカー〜次のマーカー) → OFF」の切替に。ラベルは Loop / A-B Loop / Section。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.4.2 — YouTube: 既存マーカーのポップアップ、Set A/B、A/B区間の強調、プリロール
- 既存マーカーをクリック/タップしてもA/Bポップアップが出る。下段バーに Set A / Set B（現在地でマーカーを作ってA点/B点に設定。ラベルに設定時刻を表示）を追加。
- A/B区間を濃い色帯＋上下線で強調し、A点・B点のマーカーに「A」「B」の旗を付与。
- プリロール/ポストロール（前後共通秒数、0〜10秒）のステッパーをLoopの右に追加。A-Bループ・区間ループの折り返しに反映。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.4.3 — YouTube: 区間ループが再生位置に追従
- Sectionモード中に別の区間へシーク（マーカー移動・シークバー操作）すると、その位置の区間へループ対象が自動で切り替わる（帯・トースト更新）。区間の終わりでは従来どおり先頭へ折り返す。
- 変更ファイル：`JS/qn-app-youtube.js`、`index.html`（バージョンのみ）。

## 3.4.4 — YouTube: シークバーポップアップに－Marker（削除）
- 既存マーカー上のA/Bポップアップに「－ Marker」を追加。2回押し（Sure?）で削除。A/B点・ループ状態も整合。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.4.5 — YouTube: ポップアップに Color / Hide
- 既存マーカー上のポップアップに、色変更（Color）と非表示（Hide）を追加。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`（バージョンのみ）。

## 3.5.0 — PLAYER: シークバーポップアップ（＋/－/Color/Hide）、YouTube: Color崩れ修正・プリロール上限5秒
- PLAYERの波形バーをクリック/タップすると、従来のシーク＆再生に加えてポップアップを表示。空き位置は＋Marker、既存マーカーは－（2回押しで削除）／Color／Hide⇄Show。
- YouTubeポップアップのColorボタンが上にずれていた崩れを修正。YouTubeのプリロール上限をPLAYERと同じ5秒に統一。
- 変更ファイル：`JS/player-markers.js`、`JS/player-ui-shared.js`、`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`。

## 3.6.0 — PLAYER: Speed/Keyを「アイコン(ON/OFF)＋−＋」の操作に統一
- Controlパネルの Speed / Key のトグルスイッチを、YouTubeアプリと同じ「−＋ステッパー」に置き換え。アイコン（メーター／音符）を押すと従来のON/OFF（効果のバイパス）、−＋は Speed 5%刻み・Key 1刻み。Speedスライダーは残す。
- Speedは5%の倍数にそろえてから進める（1.03→＋で1.05）。無料版の制限（Speed/Key変更不可）は従来どおり。
- 変更ファイル：`index.html`、`CSS/style-core.css`、`JS/player-controls.js`、`md/DOM_ID_REFERENCE.md`。

## 3.7.0 — PLAYER: A/B（Set A/Set B・ポップアップ）とLOOP 3モード
- PLAYERにもA-Bループを追加。LOOPボタンは YouTubeアプリと同じ OFF → A-B → Section → OFF。A点/B点は波形バーのポップアップ、または下部バーのSet A/Set Bで設定（現在地。近くのマーカーにスナップ）。
- A/Bのマーカーに「A」「B」の旗。A-B区間はループ帯で表示。プリロール/ポストロール・無料版回数制限・Auto Speedは従来どおり適用。
- マーカーバックアップ/インポートに`ab`を追加（互換あり）。
- 変更ファイル：`JS/player-core.js`、`JS/player-ui-shared.js`、`JS/player-controls.js`、`JS/player-markers.js`、`JS/player-track-backup.js`、`JS/player-ui-pc-v2.js`、`CSS/style-apps.css`、`index.html`。

## 3.7.1 — PLAYER: マーカー線のクリックでポップアップが出ない不具合を修正
- マウスでマーカー線をクリックしても、ドラッグ処理の終わり(`startDragPin`のstop)でマーカー線のDOMが作り直され、線のonclickが呼ばれずポップアップが出なかった。タッチ・マウスとも`stop()`内でシーク＆再生＋ポップアップを行うように変更（二重処理は`lastPinTapAt`で防止。波形バー側の`click`は直後なら無視）。
- 変更ファイル：`JS/player-markers.js`、`JS/player-ui-shared.js`、`index.html`。

## 3.8.0 — A/Bをマーカー登録しない「使い捨ての区切り位置」に変更（PLAYER・YouTube共通）
- A/Bをセットしてもマーカーは作られない。A点・B点は秒数だけを持つ独立した点で、波形／シークバー上の「A」「B」の旗をドラッグ（D&D）して動かせる。
- 設定方法：下部バーのSet A/Set B、またはポップアップのA/B（空き位置でも、マーカー位置でもOK）。同じ位置（±0.5秒）でもう一度押すと解除。点をタップするとシーク＆再生し、「－ Point」だけのポップアップが出る。
- マーカーを削除してもA/Bは消えない。マーカー一覧のA/Bボタンは、マーカー位置をA/Bにコピーする動作。
- 保存：YouTubeは動画ごと（秒数）、PLAYERはトラックごと（`mp3_ab_<ファイル名>`）。旧データ（マーカーID方式）は読み込み時に秒数へ自動変換。
- バックアップ/インポートの項目を`abA`/`abB`（秒数）に変更（旧形式のインポートも可）。
- 変更ファイル：`JS/qn-app-youtube.js`、`JS/player-core.js`、`JS/player-ui-shared.js`、`JS/player-markers.js`、`JS/player-track-backup.js`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`、`md/YOUTUBE_APP.md`。

## 3.9.0 — ポップアップのColor：「ラベル入力＋プリセット＋色」のセット（PLAYER・YouTube共通）
- シークバー/波形のポップアップの Color を押すと、ラベル入力欄・プリセット（Intro/Verse…＋自作）・色パレットが1つのパネルで開く。プリセットを選ぶとラベルと色が一緒に入り、色だけ・ラベルだけの変更もできる。変更は即反映され、パネル外クリック/Enter/Escで閉じる。
- プリセット（名前と色）はMarkersの設定と共用（PLAYERとYouTubeで同じ内容）。
- 変更ファイル：`JS/player-markers.js`、`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.10.0 — PLAYER: 下部バーのSpeed/Keyをステッパー化／A-B外クリックでA-BループOFF
- 下部バーの Speed / Key を「−［アイコン＋現在値］＋」に変更。アイコン（値表示）を押すと従来どおりON/OFF、−＋はControlパネルと同じ（Speed 5%刻み・Key ±1）。値は1.00x / +0 の形式で表示。右クリックでControlパネルを開く動作も従来どおり。
- A-Bループ中に、A〜Bの範囲外の波形をクリック、または範囲外のマーカーをタップしたら、LOOPをOFFにする（A/B点は残る。再度LOOPを押せば同じA-Bで再開）。範囲内のクリックはそのままループ継続。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`JS/player-ui-shared.js`、`JS/player-markers.js`、`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`。

## 3.10.1 — YouTube不具合の緊急修正／プリロール表示の統一／PLAYER下部バー調整
- 【重要】v3.8.0・v3.9.0の`JS/qn-app-youtube.js`で、プリロール関連（`preRoll`/`setPreRoll`/`renderPreRoll`）と`setBtnLabel`が誤って消えており、YouTubeアプリが正しく動かない状態だった。復活させた（この版で必ず差し替えること）。
- YouTube下段バーのプリロール表示を、PLAYERと同じ「− 0s ＋」（アイコン・文字なしのコンパクト表示）に変更。
- PLAYER下部バーのSpeed/Keyステッパー：値と名前（`1.00x Speed`／`+0 Key`）が表示されず−＋も見えなかった不具合を修正。YouTubeアプリのステッパーと同じ見た目に。
- PLAYER下部バーのA/Bボタン：Set A / Set B のラベル（`A --`等）を表示し、YouTubeと同じ並び（A・B・Loop・プリロール・Clear AB）に。Clear ABを追加（A/B点を両方クリア）。
- 変更ファイル：`JS/qn-app-youtube.js`、`JS/player-ui-pc-v2.js`、`JS/player-markers.js`、`CSS/style-layout-pc-v2.css`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.10.2 — YouTube: プリロール帯の表示／Speedアイコンで1xに戻す／プリロール中に別区間へ飛ぶバグ修正
- シークバーに、ループ区間の前後のプリロール/ポストロール範囲を薄い破線帯で表示（PLAYERの`segmentHighlight-preroll`と同じ見た目）。秒数を変えると即反映。
- 下部のSpeedのアイコン部分を押すと再生スピードを1xに戻す。
- 区間ループ中、プリロール部分（区間の開始より前）を再生している間に、位置が前の区間と判定されてループ対象が切り替わる（例：2-3ループが1に戻される）不具合を修正。判定の余裕を広げ、ループの折り返し直後1.5秒は区間の切替判定をしない。
- 変更ファイル：`JS/qn-app-youtube.js`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.11.0 — PLAYERとYouTubeのマーカー/ループ判定を共通化（`JS/qn-marker-core.js`を新設）
- 区間の決め方・許容範囲(プリロール込み)・前後マーカー移動・A-B範囲外判定を、両アプリ共通のコードに集約。
- YouTubeをPLAYERの挙動に統一：区間は表示ONのマーカー同士（2つ未満なら動かない／先頭・終端は暗黙の区間にしない）、前後マーカー移動はプリロール考慮＋端でぐるっと一周＋移動後に再生、シークバー/マーカー/A・B点のクリックは「シーク＋再生」、A-B範囲外のクリックでLOOP OFF。
- 変更ファイル：`JS/qn-marker-core.js`(新規)、`JS/player-ui-shared.js`、`JS/player-markers.js`、`JS/qn-app-youtube.js`、`index.html`、`md/CHANGELOG.md`、`md/YOUTUBE_APP.md`。

## 3.11.1 — PC: アプリ一覧フライアウトが「シュッ」と出ない問題の修正
- `style-apps.css`の`@media (prefers-reduced-motion: reduce)`でフライアウトとスクリムのtransitionを無効にしていたため、OSの「アニメーション効果」がOFF（Windows）／「視差効果を減らす」ON（Mac）のPCでは、アニメーションなしでパッと出ていた。この指定を削除し、OS設定に関わらず常にスライド表示するようにした。
- 確認：ヘッドレスChromeで、通常設定では約260msで左から滑り出し、旧CSSの「視差効果を減らす」設定では最初のフレームで表示完了（アニメーションなし）になることを再現済み。
- 変更ファイル：`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.0 — YouTubeパネル格納中の動画センタリング／YouTubeスクロールバー／PL下部Speed/Keyステッパーを詰める
- YouTube：パネルを畳んだ時、動画（プレイヤー領域）がステージの中央に来るように修正（左寄せだった）。
- YouTube：パネル・ステージのスクロールバーを、細いダーク配色（テーマに合わせた半透明の丸いつまみ）に変更。ブラウザ標準の見た目をやめた。
- PLAYER下部バー：Speed/Keyの「1.00x Speed」を2行（値／名前）にして幅を縮め、−＋がアイコンに近づくよう余白も調整。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`CSS/style-layout-pc-v2.css`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.1 — PLAYER下部バー：すべてのアイコンに文字ラベル（YouTubeと同じデザイン要素に統一）
- 下部バー右側の Volume / Speed / Key / EQ に文字ラベルを表示（これまでCSSで非表示だった）。アイコンの上下余白・最小高さも他のボタンとそろえた。
- 変更ファイル：`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.2 — YouTubeのスクロールバーをPLAYERと同じ値に
- PLAYERパネル(`#pcV2PanelBody`)のスクロールバー（幅8px・透明トラック・`rgba(255,255,255,.14)`の丸いつまみ・ホバー`.24`・Firefox用`scrollbar-color`）と同じ値をYouTubeのパネル/ステージに適用（v3.12.0の仮デザインを置き換え）。
- 変更ファイル：`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.3 — PLAYER下部バー：Speed/Keyステッパーをさらに詰め、ラベルを上揃えに
- −＋の幅を14pxに、値ラベルの最小幅を26pxに縮めて、−＋をアイコンに近づけた（Keyも同様）。
- 下部バーの各アイコンを上揃え（`align-self:flex-start`）にし、2行ラベル（値／SPEED）のぶんは下へ伸びるようにした。1行目の文字の高さが他のアイコンの文字とそろう。−＋はアイコンの高さに合わせて配置。
- 変更ファイル：`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.4 — PLAYER下部バー：すべてのコントロールを「アイコン＋ラベル」に統一
- これまでアイコンのみだった Track（前/次）・Repeat・Marker（前/次）にもラベルを表示。YouTubeの下段バーと同じ「全アイコン＋文字」になった。アイコン領域の高さを揃えて文字の高さもそろえた。
- 変更ファイル：`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.5 — PLAYER下部バー：Volume/Speed/Key/EQの間隔を広げる
- Speed/Keyステッパーの左右に12px、Volume・EQの左右に6pxの余白を追加し、隣の−＋との区切りを分かりやすくした。
- 変更ファイル：`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.6 — PLAYER下部バーとYouTube下段バーの寸法を統一
- バーの高さ（PC 80px以上）・バー/ボタンの余白（PC: バー10px 12px・ボタン8px 4px）・アイコン（PC 20px／中央32px、SP 26px／38px）・ラベル（PC 9px／SP 11px）・区切り線の余白（6px）・要素間の隙間を、PLAYERとYouTubeで同じ値にそろえた（Speed/Keyのトグルは例外）。
- 変更ファイル：`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`。

## 3.12.7（ドキュメントのみ）— PLAYER_LAYOUT_V3_SPEC.md を v3.12.6 時点に改訂
- 旧版（v3.4.0時点）から変わった点を反映：版番号（仕様A＝v3.13.0／仕様B＝v3.14.0）、下段バーの中身の増加（Set A/B・Clear AB・Speed/Keyステッパー・全ラベル）による必要幅の再見積もり（約740px→約1000px、1280pxでもはみ出す）、寸法の共通仕様（v3.12.6）、`layoutHost()` の確認結果（計算式の変更は不要の見込み）、波形の`ResizeObserver`が既にある点（格納時のリスク低下）、body直下ポップアップは切れない点。
- 新しい未決事項（§8-4 バー幅の方針／§8-6 Seekbarアイコン／§8-7 格納状態の保存／§8-8）と、§10 改訂メモを追加。コードの変更なし。

## 3.12.8（ドキュメントのみ）— 新チャット用の引き継ぎメモを追加
- `md/HANDOFF_NEXT_CHAT.md` を追加（作業ルール、現状の仕様の要点、次の大仕事、未確認事項、過去の失敗から得た教訓）。コードの変更なし。

## 3.13.0 — PLAYER下段バーを右カラム下端へ集約（仕様A）
- PC幅（901px以上）で、下段コントロールバー（`#pcV2BottomBar`）を「波形エリアの真下（右カラムだけ）」へ移動。サイドバー・パネルは画面最下端まで縦いっぱいになった。`#pcV2Layout` を2行グリッド化（1行目＝サイドバー/パネル/波形、2行目＝バー）。
- バーの必要幅（約1030px）が右カラムより広い時は、横スクロール（スクロールバー非表示）で全ボタンに届く（方針は「横スクロールのみ」。コンパクト表示は入れていない）。
- `syncBottomBarPosition()` のPC分岐を「`#pcV2Layout` の末尾へ置く」に変更。SP幅の分岐・CSSは変更なし。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`、`md/PC_V2_FILE_INDEX.md`、`md/DOM_ID_REFERENCE.md`、`md/UI_TERMINOLOGY.md`、`md/AI_ASSISTANT_PROJECT_CONTEXT.md`、`md/PLAYER_LAYOUT_V3_SPEC.md`。

## 3.14.0 — PLAYERパネル格納（仕様B）
- PC幅（901px以上）：開いているパネルのサイドアイコンをもう一度押すと、パネル(375px)が左へ格納され（220ms）、波形と下段バーが広がる。格納中にどのアイコンを押しても開く。格納中は全アイコンの選択表示を外す。
- 状態は `localStorage: qn_panel_collapsed` に保存（YouTubeアプリの `qn_yt_panel_collapsed` とは別）。初期は展開。
- `switchPanel()` の先頭で「格納中なら展開」（Speed/Key/EQの右クリック、Backup/Import完了後のLibrary復帰など外部呼び出しの取りこぼし防止）。初期表示のみ `keepCollapsed` で保存状態を維持。
- SP幅は従来どおり（格納クラスは付けない）。PC⇄SPをまたぐ時は `applyCollapse()` で付け外し。Seekbarアイコンは元々PC幅で非表示のため、§8-6は対応不要。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`、`md/PC_V2_FILE_INDEX.md`、`md/DOM_ID_REFERENCE.md`、`md/PLAYER_LAYOUT_V3_SPEC.md`。

## 3.15.0 — 時刻表示を曲名の行へ移設／狭い時はVolume・Speed・Key・EQを非表示
- PC幅：時刻表示（`.time-controls-row`）を下段バーから、波形エリア先頭行（新設 `#pcV2WaveHead`、左＝曲名 `#appTitle`／右＝時刻）の右端へ移設。SP幅は従来どおり `#pcV2TimeRow`。`syncTimeRowPosition()` のPC分岐を変更し、`#pcV2WaveHead` 生成直後にも1回呼ぶ。
- PC幅でウインドウが狭い時は、下段バーの右グループ（`#pcV2BottomBarGroupRight`＝Volume/Speed/Key/EQ）とspacerを非表示（操作はControlパネルで可能）。境目：パネル展開中は画面幅1340px以下、格納中は960px以下（バー全体の必要幅は約883px）。広い時は従来どおり表示。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`CSS/style-layout-pc-v2.css`、`index.html`、`md/CHANGELOG.md`、`md/DOM_ID_REFERENCE.md`。

## 3.16.0 — PLAYER下部バーをYouTube下段バーと完全にそろえる／Start撤去・±10s追加／格納アニメ・Backup見切れ修正
- ラベルがPLだけ大文字化（`text-transform:uppercase`）＋行の高さ9pxで、YouTubeより幅が広く・1px低く出ていた。YouTubeと同じ（大文字化なし・行の高さnormal）にそろえた。実測でボタン幅・上端・アイコン位置（20px/中央32px）・文字（9px/600）・バー高さ(80px)が一致。
- Speed/Keyの表示を1行（「1.00x Speed」）にして、バーの高さがYouTubeより約10px高くなる問題を解消。グループと区切り線の間隔（4px＋6px）もYouTubeと同じに。
- PLの再生系を「Track / -10s / Play / +10s / Track / Repeat」に。**Startボタンを撤去**（頭出しはEnterキーで継続）、**-10s/+10sを新設**（`#pcV2SkipBackBtn` / `#pcV2SkipFwdBtn`、`pcv2SkipBy()`。`beginSeek()`後に`audio.currentTime`を±10秒、0〜曲長にクランプ）。Trackのアイコンは元の「|◀ / ▶|」（YouTubeと同じ）に戻した。
- パネル格納（v3.14.0）：`prefers-reduced-motion` で動きを止める指定を削除（OSの「視覚効果を減らす」設定で格納がパッと切り替わっていた）。格納後の枠線の消し方もYouTubeと同じ（`border-right-color: transparent`）に。
- **v3.14.0で入れた不具合の修正**：`#pcV2PanelBody` の `min-width:374px` がcontent-boxで、paddingぶん(40px)広がって414pxになり、Backup/Importなどの中身が右へはみ出して見切れていた。`box-sizing:border-box` を追加して374pxに。全パネル（Library/Markers/Text/Control/Backup/Import/Keyboard/Color）で幅374pxに収まることを確認。
- 変更ファイル：`JS/player-ui-pc-v2.js`、`CSS/style-layout-pc-v2.css`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`、`md/DOM_ID_REFERENCE.md`。

## 3.17.0 — サイドバー統一＋Backup/Import共通化（PLAYER/YouTube）
- **サイドバー**：下段グループを本体(PLAYER)・YouTubeとも「Backup / Import / Keyboard / Color」の順に統一（YouTubeはKeyboardがColorの上に来ていなかった／Backup・Importは上段だった）。PL：`ICON_ITEMS`の`bottom:true`、YT：`SIDEBAR`の`bottom:true`＋`qn-apps.js`の`renderAppSideItems()`が`#pcV2IconBarBottom`のColorの直前へ差し込む。
- **Backup/Import共通化**：PLAYERの既存Backup/Import画面を共通の1画面にした。YouTubeアプリのBackup/Importパネルは、その画面を`window.qnBackupMountInto(mode, hostEl, onDismiss)`で借りて表示（YouTube側の専用UIと関連関数は削除）。
  - Backup：曲リストに「PLAYER」「YouTube」の見出しで並べ、両方を選ぶと1つのZIP（`markers.json`＋`audio/`＋`youtube.json`）に。片方だけなら従来の出力（PLAYER=ZIP/JSON、YouTube=JSON）。PLAYER側のZIP構成は従来と同じなので、旧版でも（youtube.jsonを無視して）読める。
  - Import：ZIP/JSONの中身を自動判定。旧PLAYER ZIP／旧markers.json／旧YouTube JSONもそのまま読める。重複は上書き/スキップ（YouTube分は「[YouTube]」付きで同じ一覧に。選択キーは`yt:<videoId>`）。結果は【PLAYER】【YouTube】に分けて表示。
  - YouTube側の窓口：`window.QNYouTubeBackup`（`qn-app-youtube.js`）。
- YouTubeパネル内の見た目：本体の`#pcV2PanelBody`向けBackup/Importのcssを`.qn-yt-sec-backup/.qn-yt-sec-import`へミラー（`style-apps.css`末尾）。**本体側(`style-pcv2-panels.css`)のそのブロックを直したら、ここも同じに直すこと。**
- 見出し「重複する曲」→「重複する項目」。
- 変更ファイル：`JS/player-track-backup.js`、`JS/qn-app-youtube.js`、`JS/qn-apps.js`、`JS/player-ui-pc-v2.js`、`CSS/style-apps.css`、`index.html`、`md/CHANGELOG.md`、`md/YOUTUBE_APP.md`。

## 3.18.0 — Keyboard表の共通化（PL/YT共用）
- `QNApps.renderShortcuts(hostEl, list, note)` / `QNApps.fillShortcutRows(tbody, list)` を qn-apps.js に追加。
  表の組み立て（`<kbd>`枠、`+ / -` は記号扱い）を全アプリ共通にした。各アプリは行リスト `[{key, action}]`（と任意の注記）を渡すだけ。
- PL（player-theme.js）は `window.QN_SHORTCUTS` を共通関数で描画。YT（qn-app-youtube.js）は旧・表複製コード約40行を撤去し共通関数を呼ぶだけに。
  YTのキー表示もPLと同じ `<kbd>` 枠になる（見た目の統一）。
- 今後のTUNER/PITCHは自分のショートカット配列を `QNApps.renderShortcuts` に渡せばKeyboard表が出る。
- Color は共通ポップ（qn-apps.js）を既に両アプリで共用しているため変更なし。

## 3.19.0 — Backup/Import CSSの共通化＋アプリ登録にショートカット欄
- style-apps.css に丸ごと写してあったYT用のBackup/Import CSS（約200行）を撤去。style-pcv2-panels.css の該当ルールを
  `:is(#pcV2PanelBody…, .qn-yt-sec-backup / .qn-yt-sec-import)` にして両アプリで共用（以後はそこを直せば両方に効く）。
  PL側の見た目は変化なし（計算スタイルの比較で差分0）。YT側はPLと完全に同じ値になった
  （セクション余白 26→18px、フッターの並びなど数px）。
- `QNApps.register({ shortcuts, shortcutsNote })` を追加。`QNApps.renderShortcuts(hostEl, "<appId>")` の1行でKeyboard表が出る。YTはこの方式に移行。

## 3.20.0 — YouTubeのColorパネルにもMarker Memo Colorsを表示
- YT表示中のColorパネルだけ「Marker Memo Colors」を隠していたCSS（style-apps.css）を撤去。PLAYERのColorパネルと中身・見た目が同じになった。
- 仕組みは元から共通（PLの`#qnMenuMount`のColorセクションを両アプリのパネルが借りる）。YTのマーカーメモ色（`getMarkerPresetColors()`）もここで設定した色を使う。
