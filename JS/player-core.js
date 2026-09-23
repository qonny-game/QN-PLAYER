// ============================================================
// player-core.js
// 音声処理とデータ管理を担う中核ロジック。DOM操作を一切含まない
// （例外的にsetAppTitleのみ、曲名確定というcore的処理のためここに置くが、
//  #appTitle要素が存在しない環境でも安全に動くようガードされている）。
// PC版・SP版どちらの画面からも、このファイルの関数・変数を共通で利用する。
// このファイルは player-ui-shared.js より先に読み込むこと。
// ============================================================

let audio = new Audio();
let pins = [];
let loopEnabled = false;
let isSeeking = false;

// マーカー区間ループ折り返し判定用：現在ループ対象として固定している
// マーカーペアのインデックス（activePins配列上のi、区間は[i, i+1]）。
// nullの間は「まだ対象区間が決まっていない」状態で、updateBars側が
// audio.currentTimeから最初に1回だけ計算してセットする。
// これをジャンプのたびに再計算せず固定することで、プリロール(pre-roll)
// によって現在地(ct)がジャンプ直後に前のマーカー区間側へ入り込んでも、
// 折り返し判定の対象区間が「1個前のマーカー」にすり替わらないようにする
// （プリロール機能追加時に発覚したバグの修正）。
// マーカーの追加/削除/色変更、シーク、ループON/OFF切替、曲切替時は
// 必ずnullにリセットし、次回のupdateBarsで現在地から再計算させる。
let loopActiveMarkerIndex = null;

// isSeeking = trueにする箇所は必ずこの関数を経由すること（直接代入しない）。
// シーク先がたまたま現在ループ中の区間のpre/post-roll範囲内に着地すると、
// updateBars側の「区間外に出たかどうか」判定だけではシークが起きた
// こと自体を検知できず、見た目は別の区間にいるのに裏では古い区間の
// ループ判定が生き続けてしまうバグがあった（例：3秒プリロール設定で
// マーカー3をループ中、タップでマーカー4の頭付近へシークすると、見た目は
// 4を再生しているのに実際には3のpostroll範囲内として扱われ続け、4の
// 3秒後に3へ戻ってしまう）。シークは常に「今いる区間の外に移動する
// 操作」として扱い、ここで確実にloopActiveMarkerIndexを破棄する。
function beginSeek() {
  isSeeking = true;
  loopActiveMarkerIndex = null;
}

// マーカーの色付けに使うカラーパレット。Colorパネル（player-theme.js側の
// QN_THEMES配列）と全く同じ一覧をそのまま流用する。
// 読み込み順の都合（このファイルはplayer-theme.jsより先に読み込まれるため、
// 定義された直後の時点ではwindow.QN_THEMESはまだ存在しない）、まずは
// 最低限のフォールバック値（旧・14色）で初期化しておき、後から
// applyMarkerColorPaletteFromThemes()でQN_THEMES(42色)の内容に
// 差し替える。既存コードは全てMARKER_COLOR_PALETTE[キー]という
// プロパティアクセスのため、オブジェクト自体の参照を保ったまま中身だけ
// 書き換えれば、呼び出し側の変更は不要。
const MARKER_COLOR_PALETTE = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  lime: "#84cc16",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  purple: "#8b5cf6",
  violet: "#a855f7",
  pink: "#ec4899",
  rose: "#f43f5e"
};

// window.QN_THEMES（player-theme.js側で定義・公開）の内容で、
// MARKER_COLOR_PALETTEの中身を洗い替える。QN_THEMESは
// { name, title, primary, secondary } の配列で、Light/Base/Darkの
// 3トーン×14色相=42エントリを持つため、置き換え後はマーカー色の
// 選択肢もColorパネルと同じ42色になる。
function applyMarkerColorPaletteFromThemes() {
  if (!Array.isArray(window.QN_THEMES) || window.QN_THEMES.length === 0) return;
  Object.keys(MARKER_COLOR_PALETTE).forEach(key => delete MARKER_COLOR_PALETTE[key]);
  window.QN_THEMES.forEach(theme => {
    if (theme && theme.name && theme.primary) {
      MARKER_COLOR_PALETTE[theme.name] = theme.primary;
    }
  });
}
applyMarkerColorPaletteFromThemes();
document.addEventListener("DOMContentLoaded", applyMarkerColorPaletteFromThemes);

// "#rrggbb"形式のHEXカラーを、指定した不透明度のrgba()文字列に変換する。
// マーカーの色付きループエリア背景（segmentHighlight）等で使用。
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// リピートモード: "off" -> "one"（1曲リピート） -> "all"（プレイリスト全体を繰り返し） -> "off" ...
let repeatMode = "off";
let isJumping = false;
let prevTime = 0;

// プレイリスト管理
let playlist = []; // { file: File, name: string }[]
let currentPlaylistIndex = -1;

// ============================================================
// プレイリスト永続化(IndexedDB)
// 音声ファイルの実体(Blob)ごとブラウザ内に保存し、ページを再読み込みしても
// プレイリストが「表示だけ残って再生できない」状態にならないようにする。
// キーはファイル名（savePins等、既存のマーカー保存キーと合わせる）。
// ============================================================
const PLAYLIST_DB_NAME = "qnaudio_playlist_db";
const PLAYLIST_DB_VERSION = 1;
const PLAYLIST_STORE_NAME = "tracks";

// 一度開いたDB接続を使い回す（呼ばれるたびに indexedDB.open() し直すと、
// 曲数が多いときに接続のオープン自体がオーバーヘッドになり、iOS Safari
// で特に不安定になりやすかったため）。同時に複数箇所から呼ばれた場合も
// 同じPromiseを共有し、openを1回だけに抑える。
let cachedPlaylistDB = null;
let openPlaylistDBPromise = null;

function openPlaylistDB() {
  if (cachedPlaylistDB) return Promise.resolve(cachedPlaylistDB);
  if (openPlaylistDBPromise) return openPlaylistDBPromise;

  openPlaylistDBPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB not supported")); return; }
    const req = indexedDB.open(PLAYLIST_DB_NAME, PLAYLIST_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PLAYLIST_STORE_NAME)) {
        db.createObjectStore(PLAYLIST_STORE_NAME, { keyPath: "name" });
      }
    };
    req.onsuccess = () => {
      cachedPlaylistDB = req.result;
      // 他のタブ/ウィンドウでDBのバージョンが上がった場合など、接続が
      // 予期せず閉じられることがあるため、そのときはキャッシュを破棄して
      // 次回呼び出し時に再オープンできるようにする。
      cachedPlaylistDB.onclose = () => { cachedPlaylistDB = null; };
      resolve(cachedPlaylistDB);
    };
    req.onerror = () => reject(req.error);
  }).finally(() => {
    openPlaylistDBPromise = null;
  });

  return openPlaylistDBPromise;
}

// 曲を1件、実体(Blob)ごと保存する。同名ファイルは上書きする。
// savedAtを明示的に指定しない場合は現在時刻（＝新規追加として最後尾）になる。
// title/artist/favoriteは手動編集された値で、指定しなければ既存の保存値を
// 変えない（undefinedの場合はputで上書きしないよう事前に既存レコードを
// 読み、マージしてから保存する）。
// ============================================================
// 【v2.13.5】曲のメタデータ（並び順savedAt・ON/OFF・タイトル・アーティスト・
// お気に入り）は、音声Blobを持つIndexedDBレコードとは別に、localStorageの
// PLAYLIST_META_KEYへ保存する。
//
// 理由（§3-11）：iOS Safari(WebKit)のIndexedDBでは、Blobを含むレコードを
// get→putし直すと、たとえBlobの中身を変えていなくてもBlobの実体ファイルが
// 作り直され、古い実体が削除される。すると、起動時に読み込んでplaylist配列に
// 持っている各曲のFile(=古い実体を指している)が「中身の無い死んだBlob」になり、
// その曲を再生しようとしても読み込めない（曲名だけ切り替わり、シークバー・
// 波形・マーカーは前の曲のまま、再生もされない）。v2.13.3の
// persistPlaylistOrder()は「Blobに触れない」つもりでget→putしていたため、
// 並び替えのたびに全曲のBlobが死んでいた。
// メタデータをIndexedDBの外に出すことで、並び替え・お気に入り・タイトル編集では
// 音声レコードに一切書き込まないようにする。
// ============================================================
const PLAYLIST_META_KEY = "qn_playlist_meta_v1";

function readPlaylistMeta() {
  try {
    const raw = localStorage.getItem(PLAYLIST_META_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return {};
  }
}

function writePlaylistMeta(meta) {
  try {
    localStorage.setItem(PLAYLIST_META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn("writePlaylistMeta failed:", e);
  }
}

// 1曲分のメタデータを更新する（指定されたフィールドだけ上書き）。
function updatePlaylistMetaEntry(name, fields) {
  const meta = readPlaylistMeta();
  const cur = meta[name] || {};
  Object.keys(fields).forEach(k => {
    if (fields[k] !== undefined) cur[k] = fields[k];
  });
  meta[name] = cur;
  writePlaylistMeta(meta);
}

function removePlaylistMetaEntry(name) {
  const meta = readPlaylistMeta();
  if (name in meta) {
    delete meta[name];
    writePlaylistMeta(meta);
  }
}

function getPlaylistMetaSavedAt(name) {
  const entry = readPlaylistMeta()[name];
  return entry && typeof entry.savedAt === "number" ? entry.savedAt : undefined;
}

async function savePlaylistTrack(file, savedAt, enabled, title, artist, favorite) {
  const effectiveSavedAt = typeof savedAt === "number" ? savedAt : Date.now();
  try {
    const db = await openPlaylistDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLIST_STORE_NAME, "readwrite");
      const store = tx.objectStore(PLAYLIST_STORE_NAME);
      const getReq = store.get(file.name);
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        store.put({
          name: file.name,
          type: file.type,
          blob: file,
          savedAt: effectiveSavedAt,
          enabled: enabled !== false,
          title: title !== undefined ? title : existing.title,
          artist: artist !== undefined ? artist : existing.artist,
          favorite: favorite !== undefined ? favorite : (existing.favorite || false)
        });
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("savePlaylistTrack failed:", err);
  }
  // メタデータ側にも同じ内容を記録する（読み込み時はこちらが優先される）。
  updatePlaylistMetaEntry(file.name, {
    savedAt: effectiveSavedAt,
    enabled: enabled !== false,
    title: title,
    artist: artist,
    favorite: favorite
  });
}

// 指定ファイル名の曲をストレージから削除する。
async function deletePlaylistTrack(name) {
  try {
    const db = await openPlaylistDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLIST_STORE_NAME, "readwrite");
      tx.objectStore(PLAYLIST_STORE_NAME).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("deletePlaylistTrack failed:", err);
  }
  removePlaylistMetaEntry(name);
}

// 保存されている全曲を読み込む。{ file: File, enabled: boolean } の配列を返す。
async function loadAllPlaylistTracks() {
  try {
    const db = await openPlaylistDB();
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLIST_STORE_NAME, "readonly");
      const req = tx.objectStore(PLAYLIST_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    // メタデータ(localStorage)があればそちらを優先し、無い項目だけ
    // IndexedDBレコード側の値（v2.13.4以前に保存されたもの）を使う。
    const meta = readPlaylistMeta();
    const pick = (m, key, fallback) => (m && m[key] !== undefined ? m[key] : fallback);
    const merged = records.map(r => {
      const m = meta[r.name];
      return {
        r,
        savedAt: pick(m, "savedAt", r.savedAt || 0),
        enabled: pick(m, "enabled", r.enabled) !== false,
        title: pick(m, "title", r.title) || null,
        artist: pick(m, "artist", r.artist) || null,
        favorite: pick(m, "favorite", r.favorite) === true
      };
    });
    // savedAt昇順（保存された順）に並べ、BlobをFile相当のオブジェクトに復元する
    merged.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    return merged.map(x => ({
      file: new File([x.r.blob], x.r.name, { type: x.r.type || x.r.blob.type }),
      enabled: x.enabled,
      title: x.title,
      artist: x.artist,
      favorite: x.favorite
    }));
  } catch (err) {
    console.warn("loadAllPlaylistTracks failed:", err);
    return [];
  }
}

// 現在のplaylist配列の並び順を、IndexedDB側のsavedAtにも反映する
// （ドラッグ並び替え後、次回起動時にも並び替えた順序が復元されるようにするため）。
// savedAtに単純増加の連番を振り直すことで、既存のsavedAt昇順ソートと矛盾なく順序を保てる。
// 各トラックのON/OFF状態(enabled)・タイトル/アーティスト・お気に入り状態も同時に保存する。
//
// 重要：savePlaylistTrack()は呼ぶたびに音声の実体(Blob)ごとレコードを
// 書き直すため、全曲分をそれで保存し直すと、曲数分の大容量Blobを毎回
// IndexedDBへ再書き込みすることになり、曲数が多いほど極めて重い処理に
// なる。並び替え・お気に入り登録・インポートなど「並び順や一部の曲だけ
// 変わった」場面でこれを行うと、その間ずっと音声のロード/再生と
// IndexedDBの大容量書き込みがリソースを奪い合い、再生できない・
// フリーズするといった不具合につながっていた（この関数を呼ぶ操作
// すべてに共通する症状だったのはこれが原因）。
// ここでは既存レコードのBlobには一切触れず、savedAt/enabled/title/
// artist/favoriteだけを更新する軽量な書き込みに直列で回す。
async function persistPlaylistOrder() {
  // 【v2.13.5】IndexedDBには一切書き込まない（§3-11）。並び順・状態は
  // localStorageのメタデータにだけ保存する。
  const meta = readPlaylistMeta();
  const base = Date.now();
  for (let i = 0; i < playlist.length; i++) {
    const track = playlist[i];
    const name = track.file ? track.file.name : track.name;
    if (!name) continue;
    const cur = meta[name] || {};
    cur.savedAt = base + i;
    cur.enabled = track.enabled !== false;
    cur.title = track.title;
    cur.artist = track.artist;
    cur.favorite = track.favorite || false;
    meta[name] = cur;
  }
  writePlaylistMeta(meta);
}

// タイトル/アーティスト/お気に入り状態を編集した直後など、並び順を変えずに
// 1曲分だけメタデータを保存したい場合に使う軽量版。savedAtは指定しないため
// 既存のIndexedDB上の値（＝現在の並び順）がそのまま保たれる。
async function savePlaylistMetadataFor(track) {
  // 【v2.13.5】IndexedDB（音声Blobを持つレコード）には書き込まない（§3-11）。
  const name = track.file ? track.file.name : track.name;
  if (!name) return;
  updatePlaylistMetaEntry(name, {
    enabled: track.enabled !== false,
    title: track.title,
    artist: track.artist,
    favorite: track.favorite || false
  });
}

// 音声データそのものを差し替えた曲（インポートでの上書き等）を、並び順を
// 保ったまま保存する。新しいBlobはユーザーが与えたメモリ上のデータなので、
// 書き込んでもplaylist配列側のFileが死ぬことはない。
async function savePlaylistTrackAudioKeepingOrder(track) {
  const name = track.file.name;
  let keepSavedAt = getPlaylistMetaSavedAt(name);
  if (keepSavedAt === undefined) {
    // メタデータ未作成（v2.13.4以前のデータ）の場合、先に現在の並び順を
    // メタデータへ書き出してから、その値を使う（末尾に飛ばないように）。
    await persistPlaylistOrder();
    keepSavedAt = getPlaylistMetaSavedAt(name);
  }
  await savePlaylistTrack(track.file, keepSavedAt, track.enabled, track.title, track.artist, track.favorite);
}

// 保険：playlist配列が持っているFile（Blob）が何らかの理由で読めなくなって
// いた場合に、IndexedDBから同じ曲の音声を読み直して新しいFileを返す。
// 見つからなければnull。
async function reloadTrackFileFromDB(name) {
  try {
    const db = await openPlaylistDB();
    const rec = await new Promise((resolve) => {
      const tx = db.transaction(PLAYLIST_STORE_NAME, "readonly");
      const req = tx.objectStore(PLAYLIST_STORE_NAME).get(name);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (!rec || !rec.blob) return null;
    return new File([rec.blob], rec.name, { type: rec.type || rec.blob.type });
  } catch (e) {
    return null;
  }
}

// 波形解析用
let waveformPeaks = null; // Float32Array (0-1 正規化された振幅の配列)
let waveformDecodeToken = 0;

// 現在のファイル名。表示用のDOM(#appTitle)はマーキー化されているため、
// マーカー保存キー等で「実際のファイル名」が必要な箇所はこの変数を参照する（appTitle.textContentは見ない）。
let currentFileName = "No file loaded";

function setAppTitle(name) {
  currentFileName = name;
  updateMediaSessionMetadata(name); // Media Session連携。不要なら本行を削除するだけでよい。
  const appTitle = document.getElementById("appTitle");
  const appTitleText = document.getElementById("appTitleText");
  if (!appTitle || !appTitleText) return;

  // マーキー用の複製テキストが残っていれば削除してから作り直す
  const inner = document.getElementById("appTitleInner");
  if (inner) {
    inner.querySelectorAll(".marquee-clone").forEach(el => el.remove());
  }
  appTitleText.textContent = name;
  appTitle.classList.remove("marquee");

  // 描画後に実際の幅を計測し、コンテナに収まらない場合だけマーキーを有効化する
  requestAnimationFrame(() => {
    if (!appTitle || !appTitleText) return;
    const overflowing = appTitleText.scrollWidth > appTitle.clientWidth;
    if (overflowing && inner) {
      // シームレスにループさせるため同じテキストをもう一つ複製して並べる
      const clone = document.createElement("span");
      clone.id = "appTitleTextClone";
      clone.className = "marquee-clone";
      clone.textContent = name;
      inner.appendChild(clone);

      // 文字数に応じてスクロール速度（時間）を調整し、読みやすい一定の速さにする
      const duration = Math.max(6, name.length * 0.28);
      appTitle.style.setProperty("--marquee-duration", duration + "s");
      appTitle.classList.add("marquee");
    }
  });
}

function getAudioCtx() {
  if (!window.__qnAudioCtx) {
    window.__qnAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // ブラウザの自動再生ポリシーによりAudioContextが一時停止状態のまま生成されることがある
  // （特にモバイルで顕著）。その場合、音声グラフを通しても一切音が出ないため、
  // 取得のたびにresumeを試みて確実に動作状態へ復帰させる。
  if (window.__qnAudioCtx.state === "suspended") {
    window.__qnAudioCtx.resume().catch(() => {});
  }
  return window.__qnAudioCtx;
}


// ============================================================
// 本格ピッチシフト（テンポ固定・音程のみ変更、音質重視）
// 以前は位相ボコーダーをAudioWorkletProcessorとして自前実装していたが、
// Speed変更時に高域が削れて音量が下がる問題があったため、SoundTouchJS
// （CDN経由で読み込む、MPL-2.0ライセンスのオープンソースライブラリ）に
// 置き換えた。SpeedとKeyの両方をSoundTouchNode一つで処理する。
// https://github.com/cutterbl/SoundTouchJS
// ============================================================



// SoundTouchJS（CDN配信、ESモジュール）を動的importで読み込む。
// このプロジェクトは<script>タグ(非module)構成のため、通常のimport文は使えず、
// 動的import()でPromiseとして取得する。一度読み込めば以降はキャッシュされる。
const SOUNDTOUCH_MODULE_URL = "https://cdn.jsdelivr.net/npm/@soundtouchjs/audio-worklet@2.1.1/+esm";
const SOUNDTOUCH_PROCESSOR_URL = "https://cdn.jsdelivr.net/npm/@soundtouchjs/audio-worklet@2.1.1/.dist/soundtouch-processor.js";

let soundTouchModulePromise = null;
function loadSoundTouchModule() {
  if (!soundTouchModulePromise) {
    soundTouchModulePromise = import(SOUNDTOUCH_MODULE_URL);
  }
  return soundTouchModulePromise;
}

// SoundTouchNodeのAudioWorkletProcessorを登録する。1つのAudioContextにつき一度だけでよい。
let soundTouchWorkletRegistered = null;
async function ensureSoundTouchWorklet(audioContext, SoundTouchNode) {
  if (soundTouchWorkletRegistered === audioContext) return;
  await SoundTouchNode.register(audioContext, SOUNDTOUCH_PROCESSOR_URL);
  soundTouchWorkletRegistered = audioContext;
}


let audioGraphSetupDone = false;

// 10バンド・グラフィックイコライザー
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let eqFilters = []; // BiquadFilterNode[10]

// 本格ピッチシフト・タイムストレッチ（SoundTouchJS）。
// CDNからの読み込みやAudioWorkletの初期化に失敗した場合のみ、Speed/Keyともに
// 無効化したフォールバック（等速・音程そのまま）に切り替える。
let soundTouchNode = null;
let pitchShiftAvailable = false;

async function setupAudioGraph() {
  if (audioGraphSetupDone) return;
  audioGraphSetupDone = true;

  // 【v2.14.2】「準備を全部終えてから、最後に一瞬で差し替える」順序に変更（§3-17）。
  // 以前は最初にcreateMediaElementSource(audio)を呼んでいた。この瞬間から
  // <audio>の音は通常の出力経路を離れてWeb Audioのグラフ側へ回されるが、
  // 出力先(destination)への接続は、SoundTouchJSのCDN読み込み・AudioWorklet
  // 登録を待った後だった。その待ち時間（初回はネットワーク込みで0.1〜0.2秒程度）
  // だけ音がどこにも出力されず、Controlパネルを初めて開いた時に再生が
  // 「ぷつん」と途切れていた（2回目以降はaudioGraphSetupDoneで何もしない）。
  const ctx = getAudioCtx();

  const filters = EQ_FREQS.map(freq => {
    const filter = ctx.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = freq;
    filter.Q.value = 1.4;
    filter.gain.value = 0;
    return filter;
  });

  // SoundTouchJS（Speed/Keyの本格処理）の初期化を試みる（この間、音は
  // まだ通常の経路で鳴り続けている）。
  // setupAudioGraph自体、EQボタンまたはSPEED/KEY操作のいずれかが実際に行われた
  // タイミングで初めて呼ばれる設計になっているため、呼ばれた時点で常に接続を試みてよい
  // （呼ばれるまでは<audio>要素がWeb Audio APIに一切接続されないため、EQ・Speed・Keyの
  // どれも使わない通常再生では、Safari固有の不具合を避けられる）。
  let stNode = null;
  try {
    if (!ctx.audioWorklet) throw new Error("AudioWorklet is not supported in this browser");
    const { SoundTouchNode } = await loadSoundTouchModule();
    await ensureSoundTouchWorklet(ctx, SoundTouchNode);
    stNode = new SoundTouchNode({ context: ctx });
  } catch (err) {
    console.warn("SoundTouchJS unavailable, Speed/Key features disabled:", err);
    stNode = null;
  }

  // AudioContextが動き出す前に差し替えると、動き出すまでの間が無音になる
  // ため、先に確実にrunning状態にしておく。
  if (ctx.state !== "running") {
    try { await ctx.resume(); } catch (err) {}
  }

  // ここから先は同期処理だけ：音声要素の出力をグラフへ回し、出力先まで
  // 一気につなぐ（途中にawaitを挟まないので、無音の隙間ができない）。
  let source;
  try {
    source = ctx.createMediaElementSource(audio);
  } catch (err) {
    console.warn("Audio graph setup failed:", err);
    return;
  }

  eqFilters = filters;
  soundTouchNode = stNode;
  pitchShiftAvailable = !!stNode;

  let node = source;
  if (pitchShiftAvailable && soundTouchNode) {
    node.connect(soundTouchNode);
    node = soundTouchNode;
  }
  eqFilters.forEach(filter => {
    node.connect(filter);
    node = filter;
  });
  node.connect(ctx.destination);

  // 準備中（await中）にEQスライダーが操作されていても取りこぼさないよう、
  // 接続した時点のスライダー値・EQ ON/OFFをフィルターへ反映し直す。
  if (typeof setEqEffectEnabled === "function" && typeof eqEffectEnabled !== "undefined") {
    setEqEffectEnabled(eqEffectEnabled);
  }

  // 音声グラフが確定してからKey/Speedの現在値を反映する
  updatePlaybackRate();
  updateKeyControlAvailability();
}

// 再生速度と音程（Key）の制御。
// SoundTouchJS（soundTouchNode）がSpeedとKeyの両方を1つのノードで処理する。
// ドキュメント推奨のパターンに従い、audio.playbackRateとsoundTouchNode.playbackRateに
// 同じ値をセットすることで、プロセッサ側が自動的にSpeed変化によるピッチのズレを
// 補正してくれる（以前のように、自前で打ち消し計算をする必要はない）。
// SoundTouchJSが使えない環境（AudioWorklet非対応等）では、Speed/Key機能自体を
// 提供しない（等速・音程そのままの通常再生に留める）。
let currentSpeed = 1.0;
let currentKeySemitones = 0;
// Speed/KeyのON/OFF：トグルOFF中は、UI上のスライダー値(currentSpeed/
// currentKeySemitones)自体は変更せず、実際に音声へ適用する値だけを
// 無効化相当(Speed=1.0, Key=0)にする。ONに戻すと元の値がそのまま復元される。
let speedEffectEnabled = true;
let keyEffectEnabled = true;

function updatePlaybackRate() {
  const effectiveSpeed = speedEffectEnabled ? currentSpeed : 1.0;
  const effectiveKeySemitones = keyEffectEnabled ? currentKeySemitones : 0;
  if (pitchShiftAvailable && soundTouchNode) {
    audio.playbackRate = effectiveSpeed;
    try {
      soundTouchNode.playbackRate.value = effectiveSpeed;
      // プロセッサ内部では「実際に適用されるピッチ倍率 = pitch値 ÷ playbackRate」
      // という計算になっている。そのためpitchを1.0のまま放置すると、
      // playbackRateだけがそのまま反比例でピッチに効いてしまう
      // （Speedを上げるとピッチが下がる、下げると上がる、という逆転現象が発生していた）。
      // pitchをplaybackRateと同じ値にすることで、この割り算を打ち消して
      // 「Speedを変えてもピッチは変えない」を実現する。
      soundTouchNode.pitch.value = effectiveSpeed;
      const clampedSemitones = Math.max(-24, Math.min(24, effectiveKeySemitones));
      soundTouchNode.pitchSemitones.value = clampedSemitones;
    } catch (e) {
      // 何らかの理由でノードが壊れていたら以降はSpeed/Key機能を無効化する（フォールバックはしない）
      pitchShiftAvailable = false;
      currentSpeed = 1.0;
      currentKeySemitones = 0;
      updateKeyControlAvailability();
      audio.playbackRate = 1.0;
    }
  } else {
    // SoundTouchJSが使えない環境では、Speed/Key機能自体を提供しない。
    audio.playbackRate = 1.0;
  }
}

function savePins() {
  if (currentFileName && currentFileName !== "No file loaded") {
    localStorage.setItem("mp3_pins_" + currentFileName, JSON.stringify(pins));
  }
}

// Textタブの自由入力メモ（歌詞・覚え書き等）をファイル名キーでlocalStorageへ保存する。
// savePinsと同じ方針：ファイル未読み込み時は保存しない。
function saveNoteText() {
  if (currentFileName && currentFileName !== "No file loaded") {
    const el = document.getElementById("noteTextArea");
    if (el) localStorage.setItem("mp3_text_" + currentFileName, el.value);
  }
}

function getActiveSegment(atTime) {
  const dur = audio.duration;
  const activePinObjs = pins.filter(p => p.enabled);
  const activePins = activePinObjs.map(p => p.t);
  if (!dur || activePins.length < 2) return null;

  const ct = atTime !== undefined ? atTime : audio.currentTime;

  function withColor(startIndex, endIndex) {
    return { start: activePins[startIndex], end: activePins[endIndex], color: activePinObjs[startIndex].color || null };
  }

  for (let i = 0; i < activePins.length - 1; i++) {
    const start = activePins[i];
    const end = activePins[i+1];

    if (i === activePins.length - 2) {
      if (ct >= start && ct <= end) return withColor(i, i + 1);
    } else {
      if (ct >= start && ct < end) return withColor(i, i + 1);
    }
  }

  if (ct < activePins[0]) return withColor(0, 1);
  if (ct > activePins[activePins.length - 1]) return withColor(activePins.length - 2, activePins.length - 1);

  return withColor(0, 1);
}

function getSegments(dur) {
  const step = dur / 6;
  return {
    s1: step,
    s2: step * 2,
    s3: step * 3,
    s4: step * 4,
    s5: step * 5
  };
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00.0";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const sText = s.toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${sText}`;
}

function getPinRow(t, dur) {
  const { s1, s2, s3, s4, s5 } = getSegments(dur);
  if (t <= s1) return 1;
  if (t <= s2) return 2;
  if (t <= s3) return 3;
  if (t <= s4) return 4;
  if (t <= s5) return 5;
  return 6;
}

function timeToPercentInRow(t, dur) {
  const { s1, s2, s3, s4, s5 } = getSegments(dur);
  const bounds = [0, s1, s2, s3, s4, s5, dur];
  const row = getPinRow(t, dur) - 1;
  const start = bounds[row];
  const end = bounds[row + 1];
  return ((t - start) / (end - start)) * 100;
}

function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  // RIFFヘッダー
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  // fmtチャンク
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmtチャンクサイズ
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // バイトレート
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // ビット深度
  // dataチャンク
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // チャンネルごとのサンプルデータを取り出しておく
  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  // インターリーブしながら16bit PCMに変換して書き込む
  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channelData[ch][i];
      sample = Math.max(-1, Math.min(1, sample)); // クリッピング
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// AudioBufferをMP3形式のBlobに変換する（lamejsを使用）。
// kbpsは128/192/320などのビットレート。lamejsが読み込まれていない環境では例外を投げる。
function audioBufferToMp3Blob(audioBuffer, kbps) {
  if (typeof lamejs === "undefined" || !lamejs.Mp3Encoder) {
    throw new Error("MP3 encoder (lamejs) is not available");
  }

  const numChannels = Math.min(2, audioBuffer.numberOfChannels); // lamejsはモノラル/ステレオのみ対応
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;

  // Float32サンプルを16bit PCM整数(Int16Array)に変換しておく（WAV変換と同じクリッピング処理）
  function toInt16Array(channelData) {
    const out = new Int16Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      let sample = Math.max(-1, Math.min(1, channelData[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }

  const left = toInt16Array(audioBuffer.getChannelData(0));
  const right = numChannels === 2 ? toInt16Array(audioBuffer.getChannelData(1)) : null;

  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps || 128);
  const mp3Chunks = [];
  const blockSize = 1152; // lamejsが1回のencodeBufferで処理する推奨サンプル数

  for (let i = 0; i < numFrames; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const mp3buf = numChannels === 2
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
      : encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) mp3Chunks.push(mp3buf);
  }

  const finalBuf = encoder.flush();
  if (finalBuf.length > 0) mp3Chunks.push(finalBuf);

  return new Blob(mp3Chunks, { type: "audio/mp3" });
}

// 指定した範囲(startTime〜endTime秒)・エフェクト設定(applySpeed/applyKey/applyEq)で
// OfflineAudioContextを使って音声をレンダリングし、結果のAudioBufferを返す。
// 元ファイルは毎回再デコードする（再生用に保持されているAudioBufferがないため、常に正確な結果を得るため）。
// AudioBufferから指定した時間範囲だけを切り出した新しいAudioBufferを作る。
// processOffline()は入力全体を処理する設計のため、Export機能で範囲指定
// （開始〜終了）が必要な場合は、SoundTouch処理に渡す前にここで切り出しておく。
function sliceAudioBuffer(sourceBuffer, startTime, endTime) {
  const sampleRate = sourceBuffer.sampleRate;
  const startFrame = Math.max(0, Math.floor(startTime * sampleRate));
  const endFrame = Math.min(sourceBuffer.length, Math.ceil(endTime * sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);

  const sliced = new AudioBuffer({
    numberOfChannels: sourceBuffer.numberOfChannels,
    length: frameCount,
    sampleRate: sampleRate
  });

  const channelData = new Float32Array(frameCount);
  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
    sourceBuffer.copyFromChannel(channelData, ch, startFrame);
    sliced.copyToChannel(channelData, ch, 0);
  }

  return sliced;
}

async function renderExportBuffer(startTime, endTime, applySpeed, applyKey, applyEq, targetSampleRate) {
  if (currentPlaylistIndex < 0 || !playlist[currentPlaylistIndex]) {
    throw new Error("No file loaded");
  }
  const file = playlist[currentPlaylistIndex].file;
  const arrayBuffer = await file.arrayBuffer();

  // 一時的なAudioContextでデコードする（decodeAudioDataはOfflineAudioContextでも呼べるが、
  // 既存のgetAudioCtx()があればそれを使い回した方が余計なコンテキスト生成を避けられる）。
  const decodeCtx = getAudioCtx();
  const sourceBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));

  const speed = applySpeed ? currentSpeed : 1.0;
  const keySemitones = applyKey ? currentKeySemitones : 0;
  // 出力サンプルレート。未指定なら元ファイルのサンプルレートのまま（従来通り）。
  const outputSampleRate = targetSampleRate || sourceBuffer.sampleRate;

  const clampedStart = Math.max(0, Math.min(startTime, sourceBuffer.duration));
  const clampedEnd = Math.max(clampedStart, Math.min(endTime, sourceBuffer.duration));
  const rangeDuration = clampedEnd - clampedStart;
  if (rangeDuration <= 0) {
    throw new Error("Invalid export range");
  }

  // 1. まず範囲切り出し（Speed/Key適用前の、指定区間だけのAudioBuffer）
  let workingBuffer = sliceAudioBuffer(sourceBuffer, clampedStart, clampedEnd);

  // 2. Speed/KeyをSoundTouchJSのprocessOffline()でまとめて適用する。
  //    再生画面と同じSoundTouchJSエンジンを使うため、Speedを上げても音量が
  //    下がらない（以前の自前位相ボコーダーで発生していた問題が書き出しにも
  //    起きない）。pitchShiftAvailable（AudioWorkletが使える環境）でのみ実行し、
  //    使えない環境ではSpeedのみAudioBufferSourceNode側の等速再生に留める
  //    （Key適用はスキップする）。
  const needsSoundTouch = (applySpeed && speed !== 1.0) || (applyKey && keySemitones !== 0);
  if (needsSoundTouch && pitchShiftAvailable) {
    try {
      const { processOffline } = await loadSoundTouchModule();
      const effectivePlaybackRate = speed || 1.0;
      workingBuffer = await processOffline({
        input: workingBuffer,
        processorUrl: SOUNDTOUCH_PROCESSOR_URL,
        // 実際に適用されるピッチ倍率は「pitch値 ÷ playbackRate」という計算に
        // なっているため、pitchをplaybackRateと同じ値にして打ち消す
        // （再生画面のupdatePlaybackRateと同じ理由。以前は誤ってpitch:1.0固定に
        // していたため、Speedを変えるとピッチが反比例でズレてしまっていた）。
        pitch: effectivePlaybackRate,
        pitchSemitones: keySemitones,
        playbackRate: effectivePlaybackRate
      });
    } catch (err) {
      console.warn("SoundTouchJS offline processing failed, falling back to simple resampling:", err);
      // フォールバック：SoundTouch処理が失敗した場合、Speedのみ簡易リサンプリングで
      // 適用する（Keyは諦める）。既存のOfflineAudioContext+AudioBufferSourceNodeの
      // playbackRateだけを使う、以前と同等の簡易処理。
      if (applySpeed && speed !== 1.0) {
        const fallbackLength = Math.max(1, Math.ceil((workingBuffer.length / speed)));
        const fallbackCtx = new OfflineAudioContext(
          workingBuffer.numberOfChannels,
          fallbackLength,
          workingBuffer.sampleRate
        );
        const fallbackSource = fallbackCtx.createBufferSource();
        fallbackSource.buffer = workingBuffer;
        fallbackSource.playbackRate.value = speed;
        fallbackSource.connect(fallbackCtx.destination);
        fallbackSource.start(0);
        workingBuffer = await fallbackCtx.startRendering();
      }
    }
  } else if (applySpeed && speed !== 1.0) {
    // SoundTouchJS自体が使えない環境向けのSpeedのみの簡易処理。
    const fallbackLength = Math.max(1, Math.ceil((workingBuffer.length / speed)));
    const fallbackCtx = new OfflineAudioContext(
      workingBuffer.numberOfChannels,
      fallbackLength,
      workingBuffer.sampleRate
    );
    const fallbackSource = fallbackCtx.createBufferSource();
    fallbackSource.buffer = workingBuffer;
    fallbackSource.playbackRate.value = speed;
    fallbackSource.connect(fallbackCtx.destination);
    fallbackSource.start(0);
    workingBuffer = await fallbackCtx.startRendering();
  }

  // 3. EQ：再生中と同じ10バンドの設定値をそのまま複製して適用する。
  //    EQが不要、かつサンプルレート変換も不要ならここで終了してよい。
  const needsEq = applyEq && eqFilters.some(f => f.gain.value !== 0);
  const needsResample = outputSampleRate !== workingBuffer.sampleRate;
  if (!needsEq && !needsResample) {
    return workingBuffer;
  }

  const finalCtx = new OfflineAudioContext(
    workingBuffer.numberOfChannels,
    Math.max(1, Math.ceil(workingBuffer.duration * outputSampleRate)),
    outputSampleRate
  );
  const finalSource = finalCtx.createBufferSource();
  finalSource.buffer = workingBuffer;

  let currentNode = finalSource;
  if (needsEq) {
    for (let i = 0; i < eqFilters.length; i++) {
      const gain = eqFilters[i].gain.value;
      if (gain === 0) continue; // 変化がないバンドは接続を省略してよい
      const filter = finalCtx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = EQ_FREQS[i];
      filter.Q.value = 1.4;
      filter.gain.value = gain;
      currentNode.connect(filter);
      currentNode = filter;
    }
  }

  currentNode.connect(finalCtx.destination);
  finalSource.start(0);

  const renderedBuffer = await finalCtx.startRendering();
  return renderedBuffer;
}

function suggestExportFileName() {
  if (!currentFileName || currentFileName === "No file loaded") return "output";
  const dot = currentFileName.lastIndexOf(".");
  return dot > 0 ? currentFileName.slice(0, dot) : currentFileName;
}

