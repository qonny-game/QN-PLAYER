// ============================================================
// player-ui-shared.js
// PC版・SP版共通のUI操作（DOM操作・イベントハンドラ・画面レイアウト調整）。
// player-core.jsが提供する変数・関数（audio, playlist, currentSpeed,
// setAppTitle, updatePlaybackRate 等）に依存するため、必ずplayer-core.jsの
// 後に読み込むこと。
//
// このファイルの中には、isMobileLayout()でPC/SPの分岐を行っている関数が
// 含まれる（例: renderPins等）。将来的にPC専用/SP専用ファイルへ分割する場合は、
// これらの分岐を持つ関数を書き直す必要がある点に注意。
// 下記のSECTIONコメントは、将来の分割時の切り出し単位の目安として付けている。
// ============================================================


// 初回案内オーバーレイ(welcomeOverlay)は撤去済み（シークバーエリア右下の
// +ADD AUDIOボタン(#pcV2WaveAddAudioBtn、player-ui-pc-v2.js側)に一本化した
// ため）。hideWelcomeOverlay()自体は他ファイル(loadFile内)からの呼び出しが
// 残っているため、関数としては残し、対象要素が存在しない場合は何もしない
// 安全な実装にしている。
function hideWelcomeOverlay() {
  const overlay = document.getElementById("welcomeOverlay");
  if (overlay) overlay.classList.add("hidden");
}



// 波形表示専用のデコード。低サンプルレートのOfflineAudioContextを使い、
// 対応していない環境では従来通り共有AudioContextにフォールバックする。
async function decodeForWaveform(arrayBuffer) {
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OfflineCtx) {
    for (const rate of [8000, 22050]) {
      try {
        const offline = new OfflineCtx(1, 1, rate);
        return await offline.decodeAudioData(arrayBuffer.slice(0));
      } catch (err) {
        // このサンプルレートが非対応なら次の候補へ
      }
    }
  }
  const ctx = getAudioCtx();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

async function decodeWaveform(file, token) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (token !== waveformDecodeToken) return;
    // 【v2.13.4 負荷対策】以前はgetAudioCtx()（再生用の共有AudioContext）で
    // デコードしていたため、EQ等を一切使わない通常再生でも曲を読み込んだ瞬間に
    // リアルタイムのAudioContextが生成・常駐し（しかも再生中は2秒ごとの監視で
    // resumeされ続け）、iOS Safariで「Web Audioに触れない」設計が崩れていた。
    // また44.1/48kHzのままデコードすると、3分のステレオ曲で約60MBのPCMが
    // 一時的に確保される。波形表示は4000本のピークしか使わないため、
    // 低サンプルレートのOfflineAudioContext（音は出ない・常駐しない）で
    // デコードしてメモリ量を1/5程度に抑える。
    const audioBuffer = await decodeForWaveform(arrayBuffer);

    if (token !== waveformDecodeToken) return; // 別ファイルが読み込まれていたら破棄

    const channelCount = audioBuffer.numberOfChannels;
    const rawLength = audioBuffer.length;
    const samples = 4000; // 波形の解像度（全体でこの本数のピークを算出）
    const blockSize = Math.max(1, Math.floor(rawLength / samples));
    const peaks = new Float32Array(samples);

    // 全チャンネルをミックスして振幅の最大値を取る
    const channelData = [];
    for (let c = 0; c < channelCount; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }

    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      const end = Math.min(rawLength, start + blockSize);
      let max = 0;
      for (let j = start; j < end; j++) {
        for (let c = 0; c < channelCount; c++) {
          const v = Math.abs(channelData[c][j]);
          if (v > max) max = v;
        }
      }
      peaks[i] = max;
    }

    // 正規化（最大値を1.0にする）
    let peakMax = 0;
    for (let i = 0; i < samples; i++) {
      if (peaks[i] > peakMax) peakMax = peaks[i];
    }
    if (peakMax > 0) {
      for (let i = 0; i < samples; i++) {
        peaks[i] = peaks[i] / peakMax;
      }
    }

    if (token !== waveformDecodeToken) return;

    waveformPeaks = peaks;
    drawWaveform();
  } catch (err) {
    console.warn("Waveform decode failed:", err);
    waveformPeaks = null;
  }
}

function drawWaveform() {
  if (!waveformPeaks || !audio.duration) return;
  // PC v2側(player-ui-pc-v2.js)の上書き描画は「変化がなければ描き直さない」
  // 方式のため、ここでcanvasを描き直したことを知らせるカウンタを進める
  // （これが無いと、この関数の灰色描画でPC v2の色付き波形が消えたままになる）。
  window.__qnWaveformDrawCount = (window.__qnWaveformDrawCount || 0) + 1;
  const dur = audio.duration;
  const { s1, s2, s3, s4, s5 } = getSegments(dur);
  const bounds = [0, s1, s2, s3, s4, s5, dur];

  for (let row = 0; row < 6; row++) {
    const canvas = document.getElementById(`wave${row + 1}`);
    const bar = document.getElementById(`bar${row + 1}`);
    if (!canvas || !bar) continue;

    const rect = bar.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx2d = canvas.getContext("2d");
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);

    const rowStart = bounds[row];
    const rowEnd = bounds[row + 1];
    const totalSamples = waveformPeaks.length;

    const startIdx = Math.floor((rowStart / dur) * totalSamples);
    const endIdx = Math.max(startIdx + 1, Math.floor((rowEnd / dur) * totalSamples));
    const sliceCount = endIdx - startIdx;
    if (sliceCount <= 0) continue;

    const barGap = 1 * dpr;
    const barWidth = Math.max(1, canvas.width / sliceCount - barGap);

    ctx2d.fillStyle = "rgba(255, 255, 255, 0.16)";

    for (let i = 0; i < sliceCount; i++) {
      const peak = waveformPeaks[startIdx + i] || 0;
      // 下から上へ伸びるボリューム波形（イコライザー風）。以前は中央基準の
      // 上下対称バーだったが、下端(canvas.height)を基準に音量分だけ上に
      // 伸びる形に変更した。
      const barHeight = Math.max(2 * dpr, peak * canvas.height * 0.85);
      const x = i * (canvas.width / sliceCount);
      ctx2d.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
    }
  }
}

window.addEventListener("resize", () => {
  if (waveformPeaks) drawWaveform();
});

// Volume persistence
const savedVolume = localStorage.getItem("mp3player_volume");
if (savedVolume !== null) {
  audio.volume = parseFloat(savedVolume);
} else {
  audio.volume = 0.8;
}

const volumeDisplay = document.getElementById("volumeDisplay");
const controlVolumeDisplay = document.getElementById("controlVolumeDisplay");
if (volumeDisplay) volumeDisplay.textContent = audio.volume.toFixed(2);
if (controlVolumeDisplay) controlVolumeDisplay.textContent = audio.volume.toFixed(2);

// VOL/SPEED/KEYボタン内に現在値を表示する共通ヘルパー（Basic欄側のトグルボタンの値表示のみ）
function updateAvToggleValue(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

updateAvToggleValue("volToggleValue", Math.round(audio.volume * 100) + "%");

// Volumeスライダー：Basic欄(#volume)とCONTROLタブ(#controlVolume)、両方の入力要素を
// 同じ値に同期させる。どちらを動かしても、audio.volumeへの反映と、もう片方への値のミラーを行う。
function applyVolumeChange(val) {
  audio.volume = val;
  if (volumeDisplay) volumeDisplay.textContent = val.toFixed(2);
  if (controlVolumeDisplay) controlVolumeDisplay.textContent = val.toFixed(2);
  updateAvToggleValue("volToggleValue", Math.round(val * 100) + "%");
  localStorage.setItem("mp3player_volume", val);
}

[document.getElementById("volume"), document.getElementById("controlVolume")].forEach(input => {
  if (!input) return;
  input.value = audio.volume;
  input.oninput = e => {
    const otherInput = input.id === "volume" ? document.getElementById("controlVolume") : document.getElementById("volume");
    const val = parseFloat(e.target.value);
    if (otherInput) otherInput.value = val;
    applyVolumeChange(val);
  };
});

document.getElementById("fileInput").onchange = e => addFilesToPlaylist(Array.from(e.target.files));

// ドラッグ&ドロップでのファイル追加処理は player-ui-pc-v2.js に移動済み
// （旧player-ui-pc.js。ファイル整理により統合）


// player-playlist.js に分割移動済み（Playlist機能：追加・描画・削除・並び替え・再生切り替え）


// 直前にaudio.srcへ設定したオブジェクトURL。曲を切り替える際に解放するために保持しておく。
// URL.createObjectURL()で作ったURLは、revokeObjectURL()で明示的に解放しない限り、
// そのファイルのデータがページを閉じるまでメモリ上に residentし続ける。
// 曲を切り替えるたびに解放を忘れると「曲数 × ファイルサイズ」分のメモリが積み上がり、
// 特にモバイル環境（iOS SafariのPWA化時など）で長時間利用した際にメモリ不足による
// ページのクラッシュ/強制再読み込みを引き起こす。
let currentObjectUrl = null;

function loadFile(file) {
  if (!file) return;
  
  setAppTitle(file.name);
  hideWelcomeOverlay();

  // 曲を切り替えるため、ループ折り返し判定の対象区間インデックスを破棄する
  // （旧曲のpins配列に基づくインデックスを新曲へ引き継がないようにする）。
  loopActiveMarkerIndex = null;

  // 前の曲のオブジェクトURLをここで解放する。audio.srcを新しいURLに差し替えた後だと
  // 再生中のデータを引き剥がすことになるため、差し替えの直前に解放しておく。
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  const url = URL.createObjectURL(file);
  currentObjectUrl = url;
  audio.src = url;
  audio.load();
  updatePlaybackRate();

  // setupAudioGraph()（Web Audio APIへの接続、EQ/位相ボコーダー用）は、ここでは呼ばない。
  // 曲の読み込み時に毎回呼んでいたが、これによりEQを一切使わない場合でも常時
  // <audio>要素がWeb Audio APIのグラフに接続された状態になり、iOS Safari
  // （Chromeでは同じ端末・同じPWA化でも再現しないため、Safari固有の問題と判明している）で
  // 長時間再生後にページがクラッシュ/強制再読み込みされる不具合の原因になっていた。
  // 今はEQボタンが実際に押された瞬間（setupAudioGraphOnDemand、下記）にのみ接続する。

  // 波形解析（非同期・別トークンで前回分を無効化）
  waveformPeaks = null;
  waveformDecodeToken++;
  decodeWaveform(file, waveformDecodeToken);

  audio.onloadedmetadata = () => {
    prevTime = audio.currentTime;
    drawWaveform();
    
    const savedPins = localStorage.getItem("mp3_pins_" + file.name);
    if (savedPins) {
      try {
        const raw = JSON.parse(savedPins);
        pins = raw.map(p => typeof p === 'number' ? { t: p, enabled: true, memo: "", color: null } : { t: p.t, enabled: p.enabled !== false, memo: p.memo || "", color: p.color || null });
      } catch (e) { pins = []; }
    } else {
      pins = [];
    }

    // Textタブのメモも曲ごとに読み込む（未保存なら空欄にする）。
    // player-text.js側のトップレベル変数noteTextAreaElに依存すると、
    // <script>の読み込み順に実行結果が左右されてしまうため、ここでは
    // 都度DOM取得することでファイル間の初期化順序に依存しないようにする。
    const noteTextAreaElForLoad = document.getElementById("noteTextArea");
    if (noteTextAreaElForLoad) {
      noteTextAreaElForLoad.value = localStorage.getItem("mp3_text_" + file.name) || "";
    }

    renderPins();
    renderSegments();
    renderPinList();
    if (window.__qnAudioCtx && window.__qnAudioCtx.state === "suspended") {
      window.__qnAudioCtx.resume().catch(() => {});
    }
    // 読み込み完了後に自動再生はしない。ユーザーがPlayを押すまで待機状態のまま。
    updatePlayButtonState();
  };
}



function updatePlayButtonState() {
  const playBtn = document.getElementById("playToggle");
  updateMediaSessionPlaybackState(); // Media Session連携。不要なら本行を削除するだけでよい。
  if (!playBtn) return;

  const label = playBtn.querySelector(".top-controls-btn-label");
  const labelText = label ? label.textContent : "";

  if (!audio.paused) {
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    playBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    playBtn.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.4)";
  } else {
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    playBtn.style.background = "";
    playBtn.style.boxShadow = "";
  }

  const newLabel = document.createElement("span");
  newLabel.className = "top-controls-btn-label";
  newLabel.textContent = labelText || "Play";
  playBtn.appendChild(newLabel);
}

function togglePlay() {
  hapticTap();
  // ユーザー操作の直接のトリガーであるこの箇所で、AudioContextの一時停止を確実に解除する
  // （resumeはユーザー操作をきっかけに呼ぶ必要があるため、ここが最も確実なタイミング）。
  if (window.__qnAudioCtx && window.__qnAudioCtx.state === "suspended") {
    window.__qnAudioCtx.resume().catch(() => {});
  }

  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
  updatePlayButtonState();
}

// ============================================================
// Media Session API（ロック画面・通知に曲名や再生コントロールを表示する）
// この節は既存の再生ロジックに変更を加えず、navigator.mediaSessionへ情報を渡すだけの独立した機能。
// 非対応ブラウザでは"mediaSession" in navigatorがfalseになり、何もせず安全にスキップされる。
// 不要になった場合はこのブロックと、setAppTitle内のupdateMediaSessionMetadata()呼び出し1行を
// 削除するだけで元に戻せる。
// ============================================================
function updateMediaSessionMetadata(name) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: name || "QNPLAYER",
      artist: "QNPLAYER"
    });
  } catch (e) {
    // MediaMetadata非対応環境などは無視する
  }
}

function updateMediaSessionPlaybackState() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
}

if ("mediaSession" in navigator) {
  // ロック画面・通知のコントロールボタンから、既存のtogglePlay等をそのまま呼ぶ
  navigator.mediaSession.setActionHandler("play", () => togglePlay());
  navigator.mediaSession.setActionHandler("pause", () => togglePlay());
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    const prevIndex = findEnabledTrackIndex(currentPlaylistIndex, -1, false);
    if (prevIndex !== -1) playTrackAt(prevIndex);
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    const nextIndex = findEnabledTrackIndex(currentPlaylistIndex, 1, false);
    if (nextIndex !== -1) playTrackAt(nextIndex);
  });
}

// 再生中、AudioContextがBluetooth接続の瞬断等で予期せず"suspended"状態になった場合に
// 自動的にresume()する定期監視。再生開始で監視を始め、一時停止/終了で止める
// （止まっている間は監視する意味がないうえ、無駄なタイマーを残さないため）。
let audioContextWatchTimer = null;
function startAudioContextWatch() {
  if (audioContextWatchTimer) return;
  audioContextWatchTimer = setInterval(() => {
    if (window.__qnAudioCtx && window.__qnAudioCtx.state === "suspended") {
      console.warn("AudioContext became suspended during playback — attempting to resume.");
      window.__qnAudioCtx.resume().catch(err => console.warn("AudioContext resume failed:", err));
    }
  }, 2000);
}
function stopAudioContextWatch() {
  if (audioContextWatchTimer) {
    clearInterval(audioContextWatchTimer);
    audioContextWatchTimer = null;
  }
}

audio.onplay = () => {
  updatePlayButtonState();
  startAudioContextWatch();
};
audio.onpause = () => {
  updatePlayButtonState();
  stopAudioContextWatch();
};
audio.onended = () => {
  // iOS(Safari/Chrome)では、Bluetooth接続の瞬断・オーディオセッションの再構築などが起きた際に、
  // 実際には曲の途中なのに"ended"イベントが誤って発火することがある（既知の挙動）。
  // 本当に曲が終わったのかを、currentTimeがdurationのごく近く(1秒以内)にあるかで確認し、
  // 途中で誤発火した場合は次の曲に進めず、同じ曲の同じ位置から再生を再開する。
  const dur = audio.duration;
  const ct = audio.currentTime;
  const reallyEnded = !dur || !isFinite(dur) || (dur - ct) < 1;

  if (!reallyEnded) {
    console.warn(`Spurious 'ended' event detected at ${ct.toFixed(1)}s / ${dur.toFixed(1)}s — resuming playback instead of advancing.`);
    audio.play().catch(err => console.warn("Resume after spurious ended failed:", err));
    updatePlayButtonState();
    return;
  }

  updatePlayButtonState();

  if (repeatMode === "one") {
    // 1曲リピート：同じ曲を繰り返す（現在の曲自体がOFFになっていても、
    // 既に選んで再生していた曲なのでそのままリピートする）
    audio.currentTime = 0;
    audio.play();
    updatePlayButtonState();
    return;
  }

  // 通常再生・全体リピートいずれの場合も、OFFの曲は自動的にスキップして次のON曲を探す。
  // repeatMode==="all"の時だけ、末尾まで来たら先頭に戻ってループを続ける(wrapAround)。
  const wrapAround = repeatMode === "all";
  const nextIndex = findEnabledTrackIndex(currentPlaylistIndex, 1, wrapAround);
  if (nextIndex !== -1) {
    playTrackAt(nextIndex);
  } else {
    // 次のON曲が見つからない場合（残り全部OFF、またはoffモードで末尾に到達）はそのまま停止するため、
    // 再生中の監視も一緒に止める（onpauseは発火しないため、ここで明示的に止める必要がある）。
    stopAudioContextWatch();
  }
};

// 【v2.13.5 保険】曲の読み込みに失敗した（playlist側のFileが読めなくなって
// いた）場合、IndexedDBから音声を読み直して1回だけ再試行する（§3-11）。
let lastAudioRecoveryName = null;
audio.addEventListener("error", async () => {
  if (typeof currentPlaylistIndex === "undefined" || currentPlaylistIndex < 0) return;
  const track = playlist[currentPlaylistIndex];
  if (!track || !track.file) return;
  const name = track.file.name;
  if (lastAudioRecoveryName === name) return; // 同じ曲で無限に再試行しない
  lastAudioRecoveryName = name;
  console.warn("Audio load failed — reloading track data from storage:", name);
  const fresh = typeof reloadTrackFileFromDB === "function" ? await reloadTrackFileFromDB(name) : null;
  if (!fresh || playlist[currentPlaylistIndex] !== track) return;
  track.file = fresh;
  loadFile(fresh);
  audio.play().catch(() => {});
});
audio.addEventListener("loadedmetadata", () => { lastAudioRecoveryName = null; });

document.getElementById("playToggle").onclick = togglePlay;


// player-markers.js に分割移動済み（Marker追加/前後ジャンプ）


const prevTrackBtn = document.getElementById("prevTrackBtn");
// playPrevTrack/playNextTrackはplayer-playlist.js側の関数。この時点(スクリプト
// 読み込み時)ではまだ定義されていない可能性があるため、直接の関数参照ではなく
// 無名関数でラップして遅延呼び出しにする（クリックされた時点なら全スクリプトの
// 読み込みが完了しているため安全）。
if (prevTrackBtn) prevTrackBtn.onclick = () => playPrevTrack();

const nextTrackBtn = document.getElementById("nextTrackBtn");
if (nextTrackBtn) nextTrackBtn.onclick = () => playNextTrack();

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  const activePins = pins.filter(p => p.enabled);

  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    togglePlay();
  }
  else if (e.key === "Enter") {
    e.preventDefault();
    if (typeof seekToTrackStart === "function") seekToTrackStart();
  }
  else if (e.key === "l" || e.key === "L") {
    e.preventDefault();
    const loopBtn = document.getElementById("loopToggleBtn");
    if (loopBtn) loopBtn.click();
  }
  else if (e.ctrlKey && (e.key === "r" || e.key === "R")) {
    e.preventDefault();
    const speedResetBtnEl = document.getElementById("controlSpeedResetBtn");
    if (speedResetBtnEl && !speedResetBtnEl.disabled) speedResetBtnEl.click();
    const keyResetBtnEl = document.getElementById("controlKeyResetBtn");
    if (keyResetBtnEl && !keyResetBtnEl.disabled) keyResetBtnEl.click();
  }
  else if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    const allRepeatBtn = document.getElementById("allRepeatToggleBtn");
    if (allRepeatBtn) allRepeatBtn.click();
  }
  else if (e.key === "p" || e.key === "P" || e.key === "m" || e.key === "M") {
    e.preventDefault();
    addCurrentPin();
  }
  else if (e.ctrlKey && e.key === "ArrowRight") {
    e.preventDefault();
    setSpeed(currentSpeed + 0.01);
  }
  else if (e.ctrlKey && e.key === "ArrowLeft") {
    e.preventDefault();
    setSpeed(currentSpeed - 0.01);
  }
  else if (e.ctrlKey && e.key === "ArrowUp") {
    e.preventDefault();
    const keyUpBtnEl = document.getElementById("keyUpBtn");
    if (!keyUpBtnEl || !keyUpBtnEl.disabled) setKeySemitones(currentKeySemitones + 1);
  }
  else if (e.ctrlKey && e.key === "ArrowDown") {
    e.preventDefault();
    const keyDownBtnEl = document.getElementById("keyDownBtn");
    if (!keyDownBtnEl || !keyDownBtnEl.disabled) setKeySemitones(currentKeySemitones - 1);
  }
  else if (e.key === "ArrowRight") {
    e.preventDefault();
    jumpToNextMarker();
  }
  else if (e.key === "ArrowLeft") {
    e.preventDefault();
    jumpToPrevMarker();
  }
  else if (e.key === "ArrowUp") {
    if (activePins.length > 0) {
      e.preventDefault();
      beginSeek();
      audio.currentTime = activePins[0].t;
      prevTime = activePins[0].t;
      audio.play();
      updatePlayButtonState();
      renderSegments(getActiveSegment(activePins[0].t));
      setTimeout(() => { isSeeking = false; }, 150);
    }
  }
  else if (e.key === "ArrowDown") {
    if (activePins.length > 0) {
      e.preventDefault();
      beginSeek();
      audio.currentTime = activePins[activePins.length - 1].t;
      prevTime = activePins[activePins.length - 1].t;
      audio.play();
      updatePlayButtonState();
      renderSegments(getActiveSegment(activePins[activePins.length - 1].t));
      setTimeout(() => { isSeeking = false; }, 150);
    }
  }
  else if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
    e.preventDefault();
    const index = parseInt(e.key) - 1;
    if (pins[index] !== undefined) {
      pins[index].enabled = !pins[index].enabled;
      renderPins();
      renderSegments();
      renderPinList();
      savePins();
    }
  }
  else if (!e.ctrlKey && e.key >= "1" && e.key <= "9") {
    const index = parseInt(e.key) - 1;
    // リストに表示されている番号（1〜9、OFFのマーカーも含む通し番号）と一致させるため、
    // ONのものだけを抜き出したactivePinsではなく、pins配列を直接参照する。
    if (pins[index] !== undefined) {
      e.preventDefault();
      beginSeek();
      audio.currentTime = pins[index].t;
      prevTime = pins[index].t;
      audio.play();
      updatePlayButtonState();
      renderSegments(getActiveSegment(pins[index].t));
      setTimeout(() => { isSeeking = false; }, 150);
    }
  }
});

// #controlVolume(旧volumeInput)のPC v2向けイベントハンドラは
// player-ui-pc-v2.js（Volumeポップアップ部分）にある




// player-controls.js に分割移動済み（Speed/AutoSpeed/Key/AVポップアップ共通処理）




// updateBarsは再生中、毎フレーム(最大60回/秒)呼ばれ続けるため、その中で使う配列・DOM参照は
// 毎回生成/検索せず使い回す。小さなオブジェクトでも長時間の蓄積はガベージコレクションの
// 頻度を押し上げ続け、モバイル環境（特にiOS SafariのPWA化時）でのメモリ圧迫要因になり得るため。
//
// さらに、時刻表示・シークバー（.vbar-fill）の見た目更新は人の目には10回/秒程度でも
// 十分滑らかに見えるため、UPDATE_BARS_VISUAL_INTERVAL_MS間隔に間引く。
// 一方でマーカー区間ループの折り返し判定はタイミングの正確さが重要なため、これは間引かず
// 毎フレーム行う（見た目の更新頻度とループ精度を分離することで、両方を両立させている）。
const updateBarsFillEls = [1, 2, 3, 4, 5, 6].map(i => document.getElementById(`fill${i}`));
const updateBarsCurrentValEl = document.getElementById("currentTimeVal");
const updateBarsDurationValEl = document.getElementById("durationVal");
const updateBarsP = [0, 0, 0, 0, 0, 0];
const updateBarsThresholds = [0, 0, 0, 0, 0, 0, 0];
const UPDATE_BARS_VISUAL_INTERVAL_MS = 100; // 10回/秒程度
let lastVisualUpdateTime = 0;

function updateBars() {
  requestAnimationFrame(updateBars);
  if (!audio.duration) return;

  const dur = audio.duration;
  const ct = audio.currentTime;
  const now = performance.now();

  if (now - lastVisualUpdateTime >= UPDATE_BARS_VISUAL_INTERVAL_MS) {
    lastVisualUpdateTime = now;

    if (updateBarsCurrentValEl && updateBarsDurationValEl) {
      updateBarsCurrentValEl.textContent = formatTime(ct);
      updateBarsDurationValEl.textContent = formatTime(dur);
    }

    const step = dur / 6;
    updateBarsThresholds[0] = 0;
    updateBarsThresholds[1] = step;
    updateBarsThresholds[2] = step * 2;
    updateBarsThresholds[3] = step * 3;
    updateBarsThresholds[4] = step * 4;
    updateBarsThresholds[5] = step * 5;
    updateBarsThresholds[6] = dur;

    for (let i = 0; i < 6; i++) {
      if (ct >= updateBarsThresholds[i + 1]) {
        updateBarsP[i] = 100;
      } else if (ct > updateBarsThresholds[i]) {
        updateBarsP[i] = ((ct - updateBarsThresholds[i]) / (updateBarsThresholds[i + 1] - updateBarsThresholds[i])) * 100;
        break;
      } else {
        updateBarsP[i] = 0;
      }
    }

    for (let i = 0; i < 6; i++) {
      if (updateBarsFillEls[i]) updateBarsFillEls[i].style.width = updateBarsP[i] + "%";
    }
  }

  // マーカー区間ループの折り返し判定はタイミングの正確さが重要なため、見た目更新の間引きとは
  // 独立して毎フレーム行う。ループがOFFの間はこの配列生成自体が無駄になるため、
  // loopEnabledの判定を先に行う。
  if (loopEnabled && !isSeeking && !isJumping && !audio.paused) {
    const activePinObjs = pins.filter(p => p.enabled);
    const activePins = activePinObjs.map(p => p.t);
    if (activePins.length >= 2) {
      const preroll = typeof loopPreRollSeconds === "number" ? loopPreRollSeconds : 0;

      // 対象区間がまだ決まっていない、または現在地(ct)がその区間の
      // 許容範囲(pre/post-roll込み)から外れている場合は、現在地から
      // 改めてどのマーカーペアの内側にいるかを計算し直す。
      // 「外れている」を判定に使うのは、マーカーの追加/削除/シーク/
      // 曲切替など対象区間を無効化すべきあらゆる操作を個別に検知せずとも、
      // 結果として区間外にいれば自動的に正しい区間へ追従できるようにするため。
      const inCurrentRange = loopActiveMarkerIndex !== null &&
        loopActiveMarkerIndex < activePins.length - 1 &&
        ct >= Math.max(0, activePins[loopActiveMarkerIndex] - preroll) - 0.05 &&
        ct <= Math.min(audio.duration || activePins[loopActiveMarkerIndex + 1], activePins[loopActiveMarkerIndex + 1] + preroll) + 0.05;

      if (!inCurrentRange) {
        let foundIndex = -1;
        for (let i = 0; i < activePins.length - 1; i++) {
          const s = activePins[i];
          const e = activePins[i + 1];
          if (i === activePins.length - 2) {
            if (ct >= s && ct <= e) { foundIndex = i; break; }
          } else {
            if (ct >= s && ct < e) { foundIndex = i; break; }
          }
        }
        if (foundIndex === -1) {
          foundIndex = ct < activePins[0] ? 0 : activePins.length - 2;
        }
        loopActiveMarkerIndex = foundIndex;
      }

      const i = loopActiveMarkerIndex;
      const start = activePins[i];
      const end = activePins[i + 1];
      // 折り返し判定自体は「マーカーの何秒後まで聴かせるか(postroll)」を
      // 反映してendPlaybackより後ろにずらす。ジャンプ先(jumpTarget)は
      // 「マーカーの何秒前から聴かせるか(preroll)」を反映してstartより
      // 前にずらす。どちらも区間の外(前のマーカーより前・曲末尾より後)に
      // はみ出さないようclampする。
      const jumpTarget = Math.max(0, start - preroll);
      const endPlayback = Math.min(audio.duration || end, end + preroll);

      if (prevTime < endPlayback && ct >= endPlayback) {
        // シェアウェア制限：無料版はAB間ループ5回で自動停止。
        let stoppedByShareware = false;
        if (typeof isUnlocked === "function" && !isUnlocked()) {
          swAbLoopCount++;
          swUpdateLoopCounterUI();
          if (swAbLoopCount >= SW_LIMITS.AB_LOOP_MAX_COUNT) {
            loopEnabled = false;
            swAbLoopCount = 0;
            if (typeof applyLoopButtonUI === "function") applyLoopButtonUI();
            swUpdateLoopCounterUI();
            swShowUnlockToast(`無料版のAB間ループは${SW_LIMITS.AB_LOOP_MAX_COUNT}回で自動停止します。`);
            stoppedByShareware = true;
          }
        }
        if (!stoppedByShareware) {
          audio.currentTime = jumpTarget;
          isJumping = true;
          // このマーカー(区間の開始側)に設定された色をそのまま引き継ぐ。
          // {start, end}だけを渡すとcolorがundefinedになり、renderSegments
          // 内のif (active.color && ...)判定が外れてデフォルトカラーに
          // フォールバックしてしまう（2周目以降で色が消えるバグの原因）。
          renderSegments({ start, end, color: activePinObjs[i].color || null });
          notifyLoopCompleted();
          setTimeout(() => {
            isJumping = false;
          }, 200);
        }
      }
    }
  }

  prevTime = audio.currentTime;
  // renderSegments()は区間が実際に変わった時だけ呼ぶ（マーカー追加/削除/シーク/Loop切替時）。
  // 毎フレーム呼ぶとDOM要素(.segmentHighlight)が再生成され続け、
  // スマホでのタップ・ドラッグ操作の途中でイベントターゲットが失われて操作不能になるため。
}

updateBars();

function calcTimeFromBarPosition(bar, barIndex, clientX) {
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const dur = audio.duration;
  const { s1, s2, s3, s4, s5 } = getSegments(dur);
  const boundaries = [0, s1, s2, s3, s4, s5, dur];
  return boundaries[barIndex] + ratio * (boundaries[barIndex + 1] - boundaries[barIndex]);
}

document.querySelectorAll(".vbar").forEach((bar, index) => {
  bar.addEventListener("click", e => {
    beginSeek();

    const clickedTime = calcTimeFromBarPosition(bar, index, e.clientX);

    audio.currentTime = clickedTime;
    prevTime = clickedTime;

    renderSegments(getActiveSegment(clickedTime));
    audio.play();
    updatePlayButtonState();

    setTimeout(() => {
      isSeeking = false;
    }, 150);
  });
});


// player-controls.js に分割移動済み（Loop/Repeat）

// addPinBtnのonclick登録は player-markers.js に分割移動済み



const isMobileLayout = () => window.matchMedia("(max-width: 768px)").matches;


// player-markers.js に分割移動済み（Marker移動/カラーピッカー/メモ編集/ループ区間描画）


// Keyboard Shortcuts は player-theme.js が window.QN_SHORTCUTS を読んで自動生成する（index.html側で定義）

// スマホ専用タブ切り替え（Time&Vol / Speed&Key / Markers / Playlist）
// Markers/Playlistのタブ切り替え。PC/SP完全に同じレイアウトに統一されたため、
// 以前あった「SP幅だけ選択中タブを#mobileTabSlotへ移動する」複雑な仕組みは不要になった。
// 今は単純に、選択中のパネルにだけ.mobile-tab-activeを付けてCSS側で表示を切り替えるだけで済む。
const mobileTabBtns = document.querySelectorAll(".mobile-tab-btn");
let currentMobileTab = "playlist";

function applyMobileTabLayout() {
  document.querySelectorAll(".mobile-tab-panel").forEach(panel => {
    const tabName = panel.getAttribute("data-tab-panel");
    panel.classList.toggle("mobile-tab-active", tabName === currentMobileTab);
  });
}

function setMobileTab(tabName) {
  currentMobileTab = tabName;
  mobileTabBtns.forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });
  applyMobileTabLayout();
  // updateSidebarHeightForTextTabはplayer-text.js側の関数。setMobileTab自体は
  // このファイル読み込み中に初期化目的で即時呼び出しされる箇所があり（下記参照）、
  // その時点ではまだplayer-text.jsが読み込まれていない可能性があるため、
  // 存在チェックしてから呼ぶ。
  if (typeof updateSidebarHeightForTextTab === "function") {
    updateSidebarHeightForTextTab();
  }
}


// player-text.js に分割移動済み（Textタブ自動保存登録）

// #sidebarSection自体はPC v2が土台として使い続けるため要素参照は残す
// （player-text.js側でも高さ調整等に使われている）。
// SP幅限定の右端サイドバー開閉ナビ(sidebarToggleTabs/sidebarOverlay/
// sp-status-panel、およびそれを開閉していたopenSidebar/closeSidebar/
// updateSidebarToggleActiveState関数)は撤去。旧SP版専用の仕組みで、
// PC v2では使っておらず、SP版自体もゼロから作り直す前提のため、
// 居座っていた古い実装として削除した。
const sidebarSection = document.getElementById("sidebarSection");

// Play/Repeat/前後曲送りの三分割ボタンは、PC/SP完全に同じレイアウト（topControls内に常時表示）に
// 統一されたため、以前あった「PC幅⇔SP幅で#playbackButtonsGroupを移動する」ロジックは不要になり、
// 呼び出し元も含めて完全に削除した。

// ============================================================
// EQセクションはPC/SP問わず常にEQモーダル内（元の位置）に留める。
// SP版では画面のスクロールとEQスライダーのドラッグ操作が競合し、
// スクロールできなくなる問題があったため、モーダルの中に閉じ込めて解決している。
// ============================================================
const eqInlineSection = document.getElementById("eqInlineSection");
let eqInlineOrigin = null;
if (eqInlineSection) {
  eqInlineOrigin = {
    parent: eqInlineSection.parentNode,
    nextSibling: eqInlineSection.nextSibling
  };
}

function applyEqInlineLayout() {
  if (!eqInlineSection || !eqInlineOrigin) return;
  if (eqInlineSection.parentNode !== eqInlineOrigin.parent) {
    eqInlineOrigin.parent.insertBefore(eqInlineSection, eqInlineOrigin.nextSibling);
  }
}

mobileTabBtns.forEach(btn => {
  btn.onclick = () => {
    hapticTap();
    setMobileTab(btn.getAttribute("data-tab"));
  };
});

setMobileTab("playlist");
applyEqInlineLayout();

function syncAllMobileLayout() {
  applyEqInlineLayout();
}
window.addEventListener("resize", syncAllMobileLayout);

function syncTopControlsSpacerHeight() {
  const topControls = document.getElementById("topControls");
  const spacer = document.getElementById("topControlsSpacer");
  const sidebarSection = document.querySelector(".sidebar-section");
  const mobileTabPanels = document.querySelectorAll(".mobile-tab-panel");
  if (!topControls || !spacer) return;

  const h = topControls.getBoundingClientRect().height;

  // PC/SP共通：topControlsは常時画面下部にposition: fixedで固定されているため、
  // ページ本体（body）の最下部にその高さ分の余白を必ず確保する。
  // これがないと、PC幅でサイドバーの中身（マーカーやプレイリスト）が増えて
  // ページ全体がスクロールした際、一番下の項目がtopControlsの裏に隠れてしまう。
  spacer.style.height = h + "px";

  // 【大手術後の対応】この関数は本来、.app-container内でtopControlsが
  // position:fixedで浮くこと前提の「隠れてしまう分の余白」補正。
  // PC v2のbuild()はmobile-tab-panel等をmarkAnchor/restoreAnchorで
  // .app-containerの外（#pcV2PanelBody内）へ実際に移動させるため、
  // 移動済みの要素にここでpadding-bottomを付けてしまうと、PC v2の
  // パネル下部に不要な余白ができるバグになる。
  // body.pc-v2-activeクラスでの判定はスクリプト読み込み順（この関数の
  // 初回実行がPC v2のbuild()より先に走る）に左右され取りこぼすため、
  // 各要素ごとに実際に.app-containerの中に留まっているかで判定する。
  mobileTabPanels.forEach(panel => {
    const stillInAppContainer = !!panel.closest(".app-container");
    if (!stillInAppContainer) {
      panel.style.paddingBottom = "";
      return;
    }
    if (isMobileLayout()) {
      // SP幅ではbody自体はスクロールしない(overflow: hidden)ため、bodyへのpadding-bottomは意味を持たない。
      // 実際にスクロールするのは.sidebar-section内側の.mobile-tab-panel（タブの中身）なので、
      // そちら自身にtopControlsの高さ分の余白を確保し、スクロール最下部のコンテンツが
      // topControls(画面下部固定)の裏に隠れないようにする。
      // （.sidebar-section自体はoverflow: hiddenでスクロールしない外枠のため、
      //   そちらにpadding-bottomを入れても実際のスクロール領域には反映されない）
      panel.style.paddingBottom = (h + 8) + "px";
    } else {
      panel.style.paddingBottom = "";
    }
  });

  if (isMobileLayout()) {
    if (sidebarSection) sidebarSection.style.paddingBottom = "";
    document.body.style.paddingBottom = "";
  } else {
    // PC幅ではページ本体(body)自体がスクロールするため、上のspacer(bodyの最後尾の余白)だけで十分。
    document.body.style.paddingBottom = "";
    if (sidebarSection) sidebarSection.style.paddingBottom = "";
  }
}
syncTopControlsSpacerHeight();
window.addEventListener("resize", syncTopControlsSpacerHeight);

window.onload = async () => {
  updatePlayButtonState();
  syncTopControlsSpacerHeight();

  // スプラッシュ表示中に初期化（IndexedDBからのプレイリスト復元）を進める。
  // 初期化がどれだけ速く終わっても、ロゴがふわっと出て消える演出として
  // 最低限視認できるよう、最短表示時間(splashMinDurationMs)を設ける。
  // ロゴのフェードイン演出自体が1.1s(CSS側 splashLogoIn)のため、それより
  // 短いとアニメーション完了前にフェードアウトが始まってしまう。
  const splashStart = Date.now();
  const splashMinDurationMs = 1400;

  try {
    await restorePlaylistFromStorage();
  } catch (e) {
    // 復元に失敗した場合もスプラッシュだけは必ず消す（エラー自体はconsoleに残す）。
    console.error("restorePlaylistFromStorage failed:", e);
  }

  const elapsed = Date.now() - splashStart;
  const remaining = Math.max(0, splashMinDurationMs - elapsed);
  setTimeout(hideSplashOverlay, remaining);
};

// 起動時スプラッシュをフェードアウトさせる。CSS側のtransitionで実際の
// 見た目のフェードを行い、完了後にdisplay:noneへ切り替えてクリックや
// レイアウトへの影響を完全に無くす。
function hideSplashOverlay() {
  const splash = document.getElementById("splashOverlay");
  if (!splash) return;
  splash.classList.add("splash-fade-out");
  setTimeout(() => {
    splash.style.display = "none";
  }, 550); // CSS側のtransition/ロゴのsplashLogoOut(共に0.5s)より少し長めに待ってから完全に消す
}

// 起動時、IndexedDBに保存されている曲を全てプレイリストへ復元する。
// addFilesToPlaylistと違い、復元時は自動再生しない（ユーザー操作なしのplay()はブラウザにブロックされ得るうえ、
// 意図せず音が鳴るのを避けるため）。また復元した曲を再度IndexedDBに書き戻す必要はない。
async function restorePlaylistFromStorage() {
  const savedTracks = await loadAllPlaylistTracks();
  if (savedTracks.length === 0) return;

  savedTracks.forEach(({ file, enabled, title, artist, favorite }) => {
    playlist.push({ file, name: file.name, enabled, title: title || null, artist: artist || null, duration: null, favorite: !!favorite });
  });
  renderPlaylist();

  // 長さ(duration)はIndexedDBに保存していないため、復元時に読み直す。
  playlist.forEach(track => {
    if (typeof readAudioDuration === "function") {
      readAudioDuration(track.file).then(dur => {
        if (dur) {
          track.duration = dur;
          renderPlaylist();
        }
      });
    }
  });

  // 1曲目を選曲済み状態にする（タイトル表示・波形読み込みまで行うが、
  // autoplay: falseにより自動再生はしない。ページを開いた直後に
  // 意図せず音が鳴らないようにするため）。
  playTrackAt(0, false);
}

// ============================================================
// ハプティクス（対応デバイスのみ、非対応環境では何も起きず安全に無視される）
// docs/ui-motion-haptics-design.md の4パターンに対応：
//   tap     : ボタン全般の押下、タブ切替、ポップアップ開閉、スウォッチ選択
//   tick    : スライダーが目盛りの区切りを跨いだ瞬間（呼び出し側で間引くこと）
//   success : マーカー追加、Export完了など「達成」の区切り
//   warning : 削除確認、エラー、範囲の上限/下限到達など注意を引きたい場面
// ============================================================
function hapticTap() {
  if (navigator.vibrate) navigator.vibrate(10);
}
function hapticTick() {
  if (navigator.vibrate) navigator.vibrate(6);
}
function hapticSuccess() {
  if (navigator.vibrate) navigator.vibrate([15, 40, 15]);
}
function hapticWarning() {
  if (navigator.vibrate) navigator.vibrate([20, 60, 20, 60, 20]);
}

// player-export.js に分割移動済み（Exportモーダル・実行処理）



// player-text.js に分割移動済み（Textタブ：フルスクリーン表示＋文字サイズ調整）

// ============================================================
// Speed/Volume/EQバンドスライダーのCSS変数(--range-progress)更新。
// style-core.css側で.control-card input[type="range"]::-webkit-slider-
// runnable-trackが、style-control-eq.css側で.eq-vsliderのbackgroundが、
// この変数を見て進捗より左側だけaccent-primary色に塗り分ける仕組みに
// なっている。
// resetSpeedAndKey()等、JS側で.valueを直接書き換える箇所があり、その
// 全てにイベント発火の手当てをするのは漏れやすいため、軽量な
// requestAnimationFrameループで継続的に同期する（値が変わった時だけ
// スタイル更新するので負荷は小さい）。
(function syncRangeProgressLoop() {
  const targets = Array.from(document.querySelectorAll(".control-card input[type=\"range\"], .eq-vslider"));
  const lastValues = new Map();
  // 【v2.13.4 負荷対策】毎フレーム(60〜120回/秒)の常時監視は不要なため、
  // 約5回/秒に間引く（値の変化に対する見た目の追従はこれで十分）。
  let lastTickAt = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden || (now - lastTickAt) < 200) return;
    lastTickAt = now;
    targets.forEach(input => {
      if (lastValues.get(input) !== input.value) {
        lastValues.set(input, input.value);
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;
        const val = parseFloat(input.value);
        const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
        input.style.setProperty("--range-progress", String(pct));
      }
    });
  }
  if (targets.length > 0) requestAnimationFrame(tick);
})();
