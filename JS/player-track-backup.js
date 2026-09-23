// ============================================================
// player-track-backup.js
// PC v2サイドメニュー(#pcV2IconBar)のBackup/Importアイコン用。
// Backup/Importはそれぞれ別モーダル(#trackBackupModalOverlay /
// #trackImportModalOverlay)として独立している。
//
// - Backup: フローは「曲を選択（全選/全解除＋個別チェック、選択中の
//   合計ファイルサイズを表示）→ 含める項目を選択 → Download」。
//   「音声データ」にチェックが入っていればJSZipでZIP化(markers.json +
//   audio/フォルダ)、チェックが外れていれば音声実体を含まないため
//   ZIP化せずmarkers.json単体をそのまま出力する（曲名/マーカー/メモ
//   だけを軽量に共有したい用途）。
// - Import: Backupで書き出したZIPまたはmarkers.json単体を読み込み、
//   ライブラリに曲を追加し、マーカー・メタデータ・テキストメモを反映
//   する。同名の曲が既にライブラリにある場合は、曲ごとに「上書き」か
//   「スキップ」かを選ぶ。JSON単体インポートは音声実体を含まないため、
//   新規曲は追加できず（再生できないため）、既存曲への上書きにのみ
//   使える。インポート完了後はImportボタンが「Close」に変わり、結果
//   を確認したらそのままモーダルを閉じられる。
//
// ZIP/JSONの構成は「インポートエクスポート機能.md」(将来の全曲一括
// インポート/エクスポート機能)と互換になるよう合わせている：
//   qnplayer_library_backup_YYYYMMDD.zip  （音声データを含む場合）
//   ├── markers.json   … tracks配列に選択曲分のメタデータ・マーカーを格納
//   └── audio/
//       └── <各曲の元のファイル名>
//   qnplayer_library_backup_YYYYMMDD.json （音声データを含まない場合）
//   … markers.json単体と同じ内容をそのまま
//
// 依存: player-core.js（playlist配列, savePlaylistTrack）、
// player-ui-shared.js（hapticTap等）、player-playlist.js（renderPlaylist,
// persistPlaylistOrder）。JSZip(JS/jszip.min.js)はこのファイルより前に
// 読み込むこと（音声データを含むBackup/ZIPインポート時のみ使用）。
// ============================================================

// ============================================================
// Backupモーダル
// ============================================================
const trackBackupModalOverlay = document.getElementById("trackBackupModalOverlay");
const trackBackupModalCloseBtn = document.getElementById("trackBackupModalCloseBtn");
const trackBackupCancelBtn = document.getElementById("trackBackupCancelBtn");
const trackBackupRunBtn = document.getElementById("trackBackupRunBtn");
const trackBackupStatusEl = document.getElementById("trackBackupStatus");

const trackBackupTrackListEl = document.getElementById("trackBackupTrackList");
const trackBackupSelectAllBtn = document.getElementById("trackBackupSelectAllBtn");
const trackBackupSelectNoneBtn = document.getElementById("trackBackupSelectNoneBtn");
const trackBackupSelectedCountEl = document.getElementById("trackBackupSelectedCount");
const trackBackupTotalSizeEl = document.getElementById("trackBackupTotalSize");

const trackBackupCheckboxes = {
  audio: document.getElementById("trackBackupIncludeAudio"),
  title: document.getElementById("trackBackupIncludeTitle"),
  artist: document.getElementById("trackBackupIncludeArtist"),
  markerPos: document.getElementById("trackBackupIncludeMarkerPos"),
  markerMemo: document.getElementById("trackBackupIncludeMarkerMemo"),
  text: document.getElementById("trackBackupIncludeText")
};

// 曲一覧のチェック状態。キーはtrack.name。開くたびに全曲trueでリセットする。
let trackBackupSelectedNames = new Set();

// ファイルサイズを「12.3 MB」のような表示用文字列に整形する。
// 1000バイト区切り(MB/KB)ではなく1024バイト区切りにする（OSのファイル
// サイズ表示に近く、ユーザーの感覚に合わせやすいため）。
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  return `${mb.toFixed(mb < 10 ? 1 : 1)} MB`;
}

function updateTrackBackupSelectionSummary() {
  if (!Array.isArray(playlist)) return;
  const selectedTracks = playlist.filter(t => trackBackupSelectedNames.has(t.name));
  if (trackBackupSelectedCountEl) {
    trackBackupSelectedCountEl.textContent = `${selectedTracks.length}曲選択中`;
  }
  if (trackBackupTotalSizeEl) {
    const totalBytes = selectedTracks.reduce((sum, t) => sum + (t.file && t.file.size ? t.file.size : 0), 0);
    trackBackupTotalSizeEl.textContent = formatFileSize(totalBytes);
  }
  if (trackBackupRunBtn) {
    trackBackupRunBtn.disabled = selectedTracks.length === 0;
  }
}

function renderTrackBackupTrackList() {
  if (!trackBackupTrackListEl) return;
  trackBackupTrackListEl.innerHTML = "";

  (Array.isArray(playlist) ? playlist : []).forEach(track => {
    const row = document.createElement("label");
    row.className = "track-backup-track-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = trackBackupSelectedNames.has(track.name);
    checkbox.onchange = () => {
      if (checkbox.checked) {
        trackBackupSelectedNames.add(track.name);
      } else {
        trackBackupSelectedNames.delete(track.name);
      }
      updateTrackBackupSelectionSummary();
    };
    row.appendChild(checkbox);

    const nameSpan = document.createElement("span");
    nameSpan.className = "track-backup-track-name";
    nameSpan.textContent = track.title || track.name;
    nameSpan.title = track.title || track.name;
    row.appendChild(nameSpan);

    const sizeSpan = document.createElement("span");
    sizeSpan.className = "track-backup-track-size";
    sizeSpan.textContent = formatFileSize(track.file && track.file.size);
    row.appendChild(sizeSpan);

    trackBackupTrackListEl.appendChild(row);
  });
}

if (trackBackupSelectAllBtn) {
  trackBackupSelectAllBtn.onclick = () => {
    hapticTap();
    trackBackupSelectedNames = new Set((Array.isArray(playlist) ? playlist : []).map(t => t.name));
    renderTrackBackupTrackList();
    updateTrackBackupSelectionSummary();
  };
}
if (trackBackupSelectNoneBtn) {
  trackBackupSelectNoneBtn.onclick = () => {
    hapticTap();
    trackBackupSelectedNames = new Set();
    renderTrackBackupTrackList();
    updateTrackBackupSelectionSummary();
  };
}

function openBulkBackupModal() {
  if (!trackBackupModalOverlay) return;

  // 開くたびに全曲選択・全項目チェック済みの状態にリセットする
  // （前回の選択を引き継がない）。
  trackBackupSelectedNames = new Set((Array.isArray(playlist) ? playlist : []).map(t => t.name));
  Object.values(trackBackupCheckboxes).forEach(cb => { if (cb) cb.checked = true; });

  renderTrackBackupTrackList();
  updateTrackBackupSelectionSummary();

  if (trackBackupRunBtn) trackBackupRunBtn.textContent = "Download";
  if (trackBackupStatusEl) trackBackupStatusEl.textContent = "";

  trackBackupModalOverlay.classList.add("open");
}

function closeTrackBackupModal() {
  if (!trackBackupModalOverlay) return;
  trackBackupModalOverlay.classList.remove("open");
}

if (trackBackupModalCloseBtn) trackBackupModalCloseBtn.onclick = closeTrackBackupModal;
if (trackBackupCancelBtn) trackBackupCancelBtn.onclick = closeTrackBackupModal;
if (trackBackupModalOverlay) {
  trackBackupModalOverlay.addEventListener("click", (e) => {
    if (e.target === trackBackupModalOverlay) closeTrackBackupModal();
  });
}

// localStorageに保存されているマーカー(pins)・テキストメモを、対象曲の
// ファイル名キーで読み出す。現在再生中の曲であってもメモリ上のpins/
// noteTextAreaは見ず、常にlocalStorageの保存値を正とする（保存済みの
// 状態＝savePins/saveNoteTextが最後に書き込んだ内容をバックアップしたいため）。
function loadStoredPinsFor(fileName) {
  try {
    const raw = localStorage.getItem("mp3_pins_" + fileName);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function loadStoredNoteTextFor(fileName) {
  try {
    return localStorage.getItem("mp3_text_" + fileName) || "";
  } catch (e) {
    return "";
  }
}

async function runTrackBackup() {
  const targetTracks = (Array.isArray(playlist) ? playlist : []).filter(t => trackBackupSelectedNames.has(t.name));
  if (targetTracks.length === 0) {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "曲を1つ以上選択してください。";
    return;
  }

  const opts = {
    audio: trackBackupCheckboxes.audio ? trackBackupCheckboxes.audio.checked : false,
    title: trackBackupCheckboxes.title ? trackBackupCheckboxes.title.checked : false,
    artist: trackBackupCheckboxes.artist ? trackBackupCheckboxes.artist.checked : false,
    markerPos: trackBackupCheckboxes.markerPos ? trackBackupCheckboxes.markerPos.checked : false,
    markerMemo: trackBackupCheckboxes.markerMemo ? trackBackupCheckboxes.markerMemo.checked : false,
    text: trackBackupCheckboxes.text ? trackBackupCheckboxes.text.checked : false
  };

  if (!Object.values(opts).some(Boolean)) {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "少なくとも1項目を選択してください。";
    return;
  }

  // 音声データを含める場合のみZIP化するためJSZipが要る。含めない場合は
  // markers.json単体で出力するためJSZip自体を使わない。
  if (opts.audio && typeof JSZip === "undefined") {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "JSZipが読み込まれていません。";
    return;
  }

  hapticTap();
  if (trackBackupRunBtn) {
    trackBackupRunBtn.disabled = true;
    trackBackupRunBtn.textContent = "Preparing...";
  }
  if (trackBackupStatusEl) trackBackupStatusEl.textContent = "";

  try {
    const tracksForExport = targetTracks.map(track => {
      let markersForExport = [];
      if (opts.markerPos || opts.markerMemo) {
        const storedPins = loadStoredPinsFor(track.name);
        markersForExport = storedPins.map(p => {
          const m = {};
          if (opts.markerPos) {
            m.time = p.t;
            m.enabled = p.enabled !== false;
            m.color = p.color || null;
          }
          if (opts.markerMemo) {
            m.memo = p.memo || "";
          }
          return m;
        });
      }

      const trackData = { name: track.name };
      if (opts.title) trackData.title = track.title || null;
      if (opts.artist) trackData.artist = track.artist || null;
      if (opts.markerPos || opts.markerMemo) trackData.markers = markersForExport;
      if (opts.text) trackData.noteText = loadStoredNoteTextFor(track.name);

      return trackData;
    });

    const exportData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      tracks: tracksForExport
    };
    const markersJsonText = JSON.stringify(exportData, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    let downloadBlob;
    let downloadName;

    if (opts.audio) {
      // 音声データを含む場合は、従来通りmarkers.json + audio/フォルダの
      // ZIP形式で出力する（音声実体があるためテキストのみでは完結しない）。
      const zip = new JSZip();
      const audioFolder = zip.folder("audio");
      targetTracks.forEach(track => audioFolder.file(track.name, track.file));
      zip.file("markers.json", markersJsonText);
      downloadBlob = await zip.generateAsync({ type: "blob" });
      downloadName = `qnplayer_library_backup_${dateStr}.zip`;
    } else {
      // 音声データを含めない場合はZIPにせず、markers.json単体をそのまま
      // ダウンロードする（曲名/マーカー/メモだけを軽量に共有したい用途）。
      downloadBlob = new Blob([markersJsonText], { type: "application/json" });
      downloadName = `qnplayer_library_backup_${dateStr}.json`;
    }

    const downloadUrl = URL.createObjectURL(downloadBlob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    hapticSuccess();
    closeTrackBackupModal();
  } catch (err) {
    console.warn("runTrackBackup failed:", err);
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "バックアップの作成に失敗しました。";
  } finally {
    if (trackBackupRunBtn) {
      trackBackupRunBtn.disabled = false;
      trackBackupRunBtn.textContent = "Download";
    }
  }
}

if (trackBackupRunBtn) trackBackupRunBtn.onclick = runTrackBackup;

// ============================================================
// Importモーダル
// ============================================================
const trackImportModalOverlay = document.getElementById("trackImportModalOverlay");
const trackImportModalCloseBtn = document.getElementById("trackImportModalCloseBtn");
const trackImportCancelBtn = document.getElementById("trackImportCancelBtn");
const trackImportRunBtn = document.getElementById("trackImportRunBtn");
const trackImportStatusEl = document.getElementById("trackImportStatus");

const trackImportDropZoneEl = document.getElementById("trackImportDropZone");
const trackImportFileInputEl = document.getElementById("trackImportFileInput");
const trackImportLoadedInfoEl = document.getElementById("trackImportLoadedInfo");
const trackImportLoadedFileNameEl = document.getElementById("trackImportLoadedFileName");
const trackImportLoadedFileCountEl = document.getElementById("trackImportLoadedFileCount");
const trackImportDuplicateListEl = document.getElementById("trackImportDuplicateList");
const trackImportDuplicateRowsEl = document.getElementById("trackImportDuplicateRows");
const trackImportSummaryEl = document.getElementById("trackImportSummary");
const trackImportBulkToggle = document.getElementById("trackImportBulkToggle");
const trackImportBulkToggleLabelEl = document.getElementById("trackImportBulkToggleLabel");

// 選択されたZIP/JSONから読み取った内容。parsedData: markers.jsonの中身、
// audioFiles: Map<fileName, Blob>（audio/フォルダの中身、JSON単体の場合は空）。
// duplicateChoices: Map<fileName, "overwrite"|"skip">（重複曲ごとの選択）。
let trackImportParsedData = null;
let trackImportAudioFiles = null;
let trackImportDuplicateChoices = new Map();

// Cancel/Backボタン(#trackImportCancelBtn)は、ファイル読み込み前は
// モーダルを閉じる「Cancel」、読み込み後は選び直すための「Back」に
// なる（resetImportState()を呼んでドロップゾーン表示へ戻す）。
function updateTrackImportCancelBtnMode() {
  if (!trackImportCancelBtn) return;
  if (trackImportParsedData) {
    trackImportCancelBtn.textContent = "Back";
    trackImportCancelBtn.onclick = resetImportState;
  } else {
    trackImportCancelBtn.textContent = "Cancel";
    trackImportCancelBtn.onclick = closeTrackImportModal;
  }
}

// trackImportRunBtnの見た目と押した時の挙動をまとめて切り替える。
// "import": 通常時、押すとrunTrackImportを実行する。
// "importing": 実行中、無効化して待たせる。
// "close": インポート完了後、押すとモーダルを閉じる（結果を確認して
// そのまま終えられるようにするため、"Import"のまま無効化していた
// 以前の挙動から変更した）。
function setTrackImportRunBtnMode(mode) {
  if (!trackImportRunBtn) return;
  if (mode === "importing") {
    trackImportRunBtn.disabled = true;
    trackImportRunBtn.textContent = "Importing...";
    trackImportRunBtn.onclick = null;
  } else if (mode === "close") {
    trackImportRunBtn.disabled = false;
    trackImportRunBtn.textContent = "Close";
    trackImportRunBtn.onclick = closeTrackImportModal;
  } else {
    trackImportRunBtn.disabled = !trackImportParsedData;
    trackImportRunBtn.textContent = "Import";
    trackImportRunBtn.onclick = runTrackImport;
  }
}

function openBulkImportModal() {
  if (!trackImportModalOverlay) return;
  resetImportState();
  if (trackImportStatusEl) trackImportStatusEl.textContent = "";
  trackImportModalOverlay.classList.add("open");
}

function closeTrackImportModal() {
  if (!trackImportModalOverlay) return;
  trackImportModalOverlay.classList.remove("open");
}

if (trackImportModalCloseBtn) trackImportModalCloseBtn.onclick = closeTrackImportModal;
if (trackImportModalOverlay) {
  trackImportModalOverlay.addEventListener("click", (e) => {
    if (e.target === trackImportModalOverlay) closeTrackImportModal();
  });
}

function resetImportState() {
  trackImportParsedData = null;
  trackImportAudioFiles = null;
  trackImportDuplicateChoices = new Map();
  if (trackImportDropZoneEl) trackImportDropZoneEl.style.display = "flex";
  if (trackImportLoadedInfoEl) trackImportLoadedInfoEl.style.display = "none";
  if (trackImportDuplicateListEl) trackImportDuplicateListEl.style.display = "none";
  if (trackImportDuplicateRowsEl) trackImportDuplicateRowsEl.innerHTML = "";
  if (trackImportBulkToggle) trackImportBulkToggle.setAttribute("aria-checked", "true");
  if (trackImportBulkToggleLabelEl) trackImportBulkToggleLabelEl.textContent = "すべて上書き";
  if (trackImportSummaryEl) {
    trackImportSummaryEl.style.display = "none";
    trackImportSummaryEl.textContent = "";
  }
  if (trackImportFileInputEl) trackImportFileInputEl.value = "";
  setTrackImportRunBtnMode("import");
  updateTrackImportCancelBtnMode();
}

if (trackImportDropZoneEl) {
  trackImportDropZoneEl.addEventListener("click", () => {
    if (trackImportFileInputEl) trackImportFileInputEl.click();
  });
  trackImportDropZoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    trackImportDropZoneEl.classList.add("dragover");
  });
  trackImportDropZoneEl.addEventListener("dragleave", (e) => {
    e.stopPropagation();
    trackImportDropZoneEl.classList.remove("dragover");
  });
  trackImportDropZoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    trackImportDropZoneEl.classList.remove("dragover");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleTrackImportFileSelected(file);
  });
}

if (trackImportFileInputEl) {
  trackImportFileInputEl.addEventListener("change", () => {
    const file = trackImportFileInputEl.files && trackImportFileInputEl.files[0];
    if (file) handleTrackImportFileSelected(file);
  });
}

async function handleTrackImportFileSelected(file) {
  const isZip = /\.zip$/i.test(file.name);
  const isJson = /\.json$/i.test(file.name);
  if (!isZip && !isJson) {
    if (trackImportStatusEl) trackImportStatusEl.textContent = "ZIPまたはJSONファイルを選択してください。";
    return;
  }
  if (isZip && typeof JSZip === "undefined") {
    if (trackImportStatusEl) trackImportStatusEl.textContent = "JSZipが読み込まれていません。";
    return;
  }

  resetImportState();
  if (trackImportStatusEl) trackImportStatusEl.textContent = "読み込み中...";

  try {
    let parsed;
    const audioMap = new Map();

    if (isZip) {
      const zip = await JSZip.loadAsync(file);
      const markersEntry = zip.file("markers.json");
      if (!markersEntry) {
        if (trackImportStatusEl) trackImportStatusEl.textContent = "markers.jsonが見つかりません。";
        return;
      }
      const markersText = await markersEntry.async("string");
      parsed = JSON.parse(markersText);

      // audio/フォルダ配下のファイルを、ファイル名をキーにしたMapへ集める。
      const audioFolderFiles = zip.folder("audio") ? zip.folder("audio").file(/.*/) : [];
      for (const entry of audioFolderFiles) {
        const blob = await entry.async("blob");
        const baseName = entry.name.split("/").pop();
        audioMap.set(baseName, blob);
      }
    } else {
      // markers.json単体でのインポート。音声データは含まれないため、
      // 既存曲への上書き（メタデータ/マーカー/メモのみ）専用になる
      // （音声実体が無い新規曲は、この後の重複判定・runTrackImport側の
      // 「音声なしのためスキップ」ロジックがそのまま処理する）。
      const jsonText = await file.text();
      parsed = JSON.parse(jsonText);
    }

    if (!parsed || !Array.isArray(parsed.tracks)) {
      if (trackImportStatusEl) trackImportStatusEl.textContent = "ファイルの内容を読み取れませんでした。";
      return;
    }

    trackImportParsedData = parsed;
    trackImportAudioFiles = audioMap;

    if (trackImportStatusEl) trackImportStatusEl.textContent = "";

    // 読み込み後はドロップゾーンを隠し、代わりに読み込み済み情報を
    // 表示する（ドロップ位置によって「通常のファイル追加」と「ZIP/JSON
    // インポート」の挙動が入り乱れるのを避けるため、読み込み後は
    // ドロップ自体を受け付ける場所を無くす）。選び直したい場合は
    // Cancelボタンが「Back」になり、resetImportState()で元に戻す。
    if (trackImportDropZoneEl) trackImportDropZoneEl.style.display = "none";
    if (trackImportLoadedInfoEl) trackImportLoadedInfoEl.style.display = "flex";
    if (trackImportLoadedFileNameEl) trackImportLoadedFileNameEl.textContent = file.name;
    if (trackImportLoadedFileCountEl) trackImportLoadedFileCountEl.textContent = `${parsed.tracks.length}曲`;
    setTrackImportRunBtnMode("import");
    updateTrackImportCancelBtnMode();

    // 既存ライブラリとの重複を検出し、曲ごとの上書き/スキップ選択UIを出す。
    const existingNames = new Set((Array.isArray(playlist) ? playlist : []).map(t => t.name));
    const duplicateNames = parsed.tracks.map(t => t.name).filter(name => existingNames.has(name));

    if (duplicateNames.length > 0) {
      duplicateNames.forEach(name => trackImportDuplicateChoices.set(name, "overwrite"));
      renderTrackImportDuplicateRows(duplicateNames);
      if (trackImportDuplicateListEl) trackImportDuplicateListEl.style.display = "flex";
    }
  } catch (err) {
    console.warn("handleTrackImportFileSelected failed:", err);
    if (trackImportStatusEl) trackImportStatusEl.textContent = "ファイルの読み込みに失敗しました。";
  }
}

function renderTrackImportDuplicateRows(names) {
  if (!trackImportDuplicateRowsEl) return;
  trackImportDuplicateRowsEl.innerHTML = "";

  names.forEach(name => {
    const row = document.createElement("div");
    row.className = "track-import-duplicate-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "track-import-duplicate-name";
    nameSpan.textContent = name;
    nameSpan.title = name;
    row.appendChild(nameSpan);

    row.appendChild(createTrackImportChoiceToggle(name));

    trackImportDuplicateRowsEl.appendChild(row);
  });
}

// 上書き/スキップの1件分を、EQのON/OFFトグル(.glow-switch)と同じ
// 小さい丸ノブ型スイッチ＋左に添える短いテキストラベルで表す
// （以前はカプセル内に「上書き」「スキップ」両方のラベルを常時表示する
// デザインだったが、場所を取りすぎるとの指摘を受け、状態を示す
// テキストは1つだけに絞り、スイッチ自体も最小サイズにした。これで
// 曲名の表示スペース(.track-import-duplicate-name)を広く取れる）。
// aria-checked="true"=上書き(ON)、"false"=スキップ(OFF)。
function createTrackImportChoiceToggle(name) {
  const wrap = document.createElement("div");
  wrap.className = "track-import-choice-wrap";

  const label = document.createElement("span");
  label.className = "track-import-choice-label";

  const isOverwrite = trackImportDuplicateChoices.get(name) !== "skip";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "glow-switch track-import-choice-switch";
  toggle.dataset.name = name;
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", String(isOverwrite));
  toggle.innerHTML = '<span class="glow-switch-knob"></span>';

  function applyState(overwrite) {
    label.textContent = overwrite ? "上書き" : "スキップ";
    label.classList.toggle("is-skip", !overwrite);
    toggle.setAttribute("aria-checked", String(overwrite));
    toggle.title = overwrite ? "スキップに切り替え" : "上書きに切り替え";
  }
  applyState(isOverwrite);

  toggle.onclick = () => {
    const nextOverwrite = toggle.getAttribute("aria-checked") !== "true";
    trackImportDuplicateChoices.set(name, nextOverwrite ? "overwrite" : "skip");
    applyState(nextOverwrite);
  };

  wrap.appendChild(label);
  wrap.appendChild(toggle);
  return wrap;
}

// 「すべて上書き」「すべてスキップ」：重複リスト全行の選択を一括で
// 同じ側に揃える。少数だけ個別に変えたい場合のベース状態としても使える
// （全部揃えてから、ごく一部だけ行ごとのスイッチでクリックし直す運用）。
function setAllTrackImportDuplicateChoices(choice) {
  if (!trackImportDuplicateRowsEl) return;
  const overwrite = choice !== "skip";
  trackImportDuplicateRowsEl.querySelectorAll(".track-import-choice-switch").forEach(toggle => {
    const name = toggle.dataset.name;
    trackImportDuplicateChoices.set(name, choice);
    toggle.setAttribute("aria-checked", String(overwrite));
    const label = toggle.previousElementSibling;
    if (label && label.classList.contains("track-import-choice-label")) {
      label.textContent = overwrite ? "上書き" : "スキップ";
      label.classList.toggle("is-skip", !overwrite);
      toggle.title = overwrite ? "スキップに切り替え" : "上書きに切り替え";
    }
  });
}

if (trackImportBulkToggle) {
  trackImportBulkToggle.setAttribute("aria-checked", "true");
  trackImportBulkToggle.onclick = () => {
    const nextOverwrite = trackImportBulkToggle.getAttribute("aria-checked") !== "true";
    trackImportBulkToggle.setAttribute("aria-checked", String(nextOverwrite));
    if (trackImportBulkToggleLabelEl) {
      trackImportBulkToggleLabelEl.textContent = nextOverwrite ? "すべて上書き" : "すべてスキップ";
    }
    trackImportBulkToggle.title = nextOverwrite ? "すべてスキップに切り替え" : "すべて上書きに切り替え";
    setAllTrackImportDuplicateChoices(nextOverwrite ? "overwrite" : "skip");
  };
}

async function runTrackImport() {
  if (!trackImportParsedData) return;

  hapticTap();
  setTrackImportRunBtnMode("importing");
  if (trackImportStatusEl) trackImportStatusEl.textContent = "";

  let addedCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  let noAudioSkippedCount = 0;

  try {
    const existingByName = new Map((Array.isArray(playlist) ? playlist : []).map(t => [t.name, t]));
    // インポートで実際に変更された曲（新規追加/上書き）だけを、都度
    // その場でIndexedDBへ直列保存する。以前はループ後にまとめて
    // persistPlaylistOrder()を呼んでいたが、これは「並び順が変わった」
    // 時のための処理で、ライブラリ全曲（インポートと無関係な曲も含む）の
    // savedAtを振り直しながら音声Blobごと保存し直す重い処理になる。
    // インポートでは並び順自体は変わらない（新規曲は末尾に追加される
    // だけ、上書き曲は元の位置のまま）ため、変更された曲だけを保存すれば
    // 十分。曲数が多いインポートほど、この違いが「保存が終わるまでの
    // 時間」に直結し、その間に再生操作をすると音声のロードと
    // IndexedDB書き込みがリソースを奪い合って再生できない/フリーズする
    // という不具合（インポート後、アプリを再起動するまで不安定になる）
    // につながっていた。

    for (const trackData of trackImportParsedData.tracks) {
      const name = trackData.name;
      if (!name) continue;

      const isDuplicate = existingByName.has(name);
      const choice = isDuplicate ? (trackImportDuplicateChoices.get(name) || "overwrite") : null;

      if (isDuplicate && choice === "skip") {
        skippedCount++;
        continue;
      }

      const audioBlob = trackImportAudioFiles ? trackImportAudioFiles.get(name) : null;

      if (isDuplicate) {
        // --- 重複曲の上書き ---
        const existingTrack = existingByName.get(name);
        if (trackData.title !== undefined) existingTrack.title = trackData.title;
        if (trackData.artist !== undefined) existingTrack.artist = trackData.artist;
        if (audioBlob) {
          existingTrack.file = new File([audioBlob], name, { type: audioBlob.type || "audio/mpeg" });
        }
        // 既存のsavedAt（＝現在の並び順）を保ったまま、この1曲分だけ
        // 保存する。
        // 【v2.13.5】音声ごと差し替えた場合だけIndexedDBの音声レコードも
        // 書き直す（新しいBlobはメモリ上のデータなので安全）。メタデータだけの
        // 上書きならIndexedDBには触れない（§3-11）。
        if (audioBlob && typeof savePlaylistTrackAudioKeepingOrder === "function") {
          await savePlaylistTrackAudioKeepingOrder(existingTrack);
        } else if (typeof savePlaylistMetadataFor === "function") {
          await savePlaylistMetadataFor(existingTrack);
        }
        applyImportedMarkersAndText(name, trackData);
        overwrittenCount++;
      } else {
        // --- 新規追加 ---
        if (!audioBlob) {
          // 音声データを含まないインポート(ZIPでチェックを外した場合や
          // markers.json単体インポート)の場合、新規追加は音声実体が
          // 無いと再生できないためスキップする。
          noAudioSkippedCount++;
          continue;
        }
        const newFile = new File([audioBlob], name, { type: audioBlob.type || "audio/mpeg" });
        const newTrack = {
          file: newFile,
          name,
          title: trackData.title || null,
          artist: trackData.artist || null,
          duration: null,
          enabled: true,
          favorite: false
        };
        playlist.push(newTrack);
        // savedAt未指定＝現在時刻として保存され、末尾（最新）扱いになる
        // （playlist配列上もpushで末尾に追加済みのため、実際の並び順と
        // 一致する）。
        if (typeof savePlaylistTrack === "function") {
          await savePlaylistTrack(newTrack.file, undefined, newTrack.enabled, newTrack.title, newTrack.artist, newTrack.favorite);
        }
        applyImportedMarkersAndText(name, trackData);
        addedCount++;
      }
    }

    if (typeof renderPlaylist === "function") renderPlaylist();

    let summary = `新規追加: ${addedCount}件\n上書き: ${overwrittenCount}件\nスキップ: ${skippedCount}件`;
    if (noAudioSkippedCount > 0) summary += `\n音声なしのためスキップ: ${noAudioSkippedCount}件`;
    if (trackImportSummaryEl) {
      trackImportSummaryEl.textContent = summary;
      trackImportSummaryEl.style.display = "block";
    }
    // インポート完了後は、ボタンを「Close」に切り替えてそのまま閉じられる
    // ようにする（結果を確認したら、Backで別のファイルを選び直すか、この
    // Closeでモーダルを閉じるかの2択になる）。
    setTrackImportRunBtnMode("close");
    hapticSuccess();
  } catch (err) {
    console.warn("runTrackImport failed:", err);
    if (trackImportStatusEl) trackImportStatusEl.textContent = "インポートに失敗しました。";
    setTrackImportRunBtnMode("import");
  }
}

// マーカー(位置/メモ)・テキストメモをlocalStorageへ反映する。
// trackData.markersが無ければマーカーには触れない（ZIP/JSON側でチェックを
// 外してエクスポートされた場合、既存のマーカーを消さないようにするため）。
// 同様にnoteTextがundefinedならテキストメモにも触れない。
function applyImportedMarkersAndText(name, trackData) {
  if (Array.isArray(trackData.markers)) {
    const pinsToSave = trackData.markers.map(m => ({
      t: typeof m.time === "number" ? m.time : 0,
      enabled: m.enabled !== false,
      memo: m.memo || "",
      color: m.color || null
    }));
    try {
      localStorage.setItem("mp3_pins_" + name, JSON.stringify(pinsToSave));
    } catch (e) {}
  }
  if (typeof trackData.noteText === "string") {
    try {
      localStorage.setItem("mp3_text_" + name, trackData.noteText);
    } catch (e) {}
  }
}
