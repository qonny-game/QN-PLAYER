// ============================================================
// player-track-backup.js
// PC v2サイドメニュー(#pcV2IconBar)のBackupアイコン用。
// モーダル内はBackup/Importの2タブ構成：
// - Backup: ライブラリ全曲分の音声データ・メタデータ(title/artist)・
//   マーカー(位置/メモ)・テキストメモを、チェックボックスで選んだ
//   項目だけJSZipで1つのZIPにまとめてダウンロードする。
// - Import: Backupで書き出したZIPを読み込み、ライブラリに曲を追加し、
//   マーカー・メタデータ・テキストメモを反映する。同名の曲が既に
//   ライブラリにある場合は、曲ごとに「上書き」か「スキップ」かを選ぶ。
//
// ZIP構成は「インポートエクスポート機能.md」(将来の全曲一括インポート/
// エクスポート機能)と互換になるよう合わせている：
//   qnplayer_library_backup_YYYYMMDD.zip
//   ├── markers.json   … tracks配列に全曲分のメタデータ・マーカーを格納
//   └── audio/
//       └── <各曲の元のファイル名>
//
// 依存: player-core.js（playlist配列, savePlaylistTrack）、
// player-ui-shared.js（hapticTap等）、player-playlist.js（renderPlaylist,
// persistPlaylistOrder）。JSZip(JS/jszip.min.js)はこのファイルより前に
// 読み込むこと。
// ============================================================

const trackBackupModalOverlay = document.getElementById("trackBackupModalOverlay");
const trackBackupModalCloseBtn = document.getElementById("trackBackupModalCloseBtn");
const trackBackupCancelBtn = document.getElementById("trackBackupCancelBtn");
const trackBackupRunBtn = document.getElementById("trackBackupRunBtn");
const trackBackupStatusEl = document.getElementById("trackBackupStatus");
const trackBackupTargetNameEl = document.getElementById("trackBackupTargetName");
const trackBackupModalTitleEl = document.getElementById("trackBackupModalTitle");

const trackBackupCheckboxes = {
  audio: document.getElementById("trackBackupIncludeAudio"),
  title: document.getElementById("trackBackupIncludeTitle"),
  artist: document.getElementById("trackBackupIncludeArtist"),
  markerPos: document.getElementById("trackBackupIncludeMarkerPos"),
  markerMemo: document.getElementById("trackBackupIncludeMarkerMemo"),
  text: document.getElementById("trackBackupIncludeText")
};

// --- タブ切り替え(Backup/Import) ---
const trackBackupTabBackupBtn = document.getElementById("trackBackupTabBackup");
const trackBackupTabImportBtn = document.getElementById("trackBackupTabImport");
const trackBackupPaneBackupEl = document.getElementById("trackBackupPaneBackup");
const trackBackupPaneImportEl = document.getElementById("trackBackupPaneImport");
const trackImportRunBtn = document.getElementById("trackImportRunBtn");

function setTrackBackupTab(tab) {
  const isImport = tab === "import";
  if (trackBackupTabBackupBtn) trackBackupTabBackupBtn.classList.toggle("active", !isImport);
  if (trackBackupTabImportBtn) trackBackupTabImportBtn.classList.toggle("active", isImport);
  if (trackBackupPaneBackupEl) trackBackupPaneBackupEl.style.display = isImport ? "none" : "flex";
  if (trackBackupPaneImportEl) trackBackupPaneImportEl.style.display = isImport ? "flex" : "none";
  if (trackBackupRunBtn) trackBackupRunBtn.style.display = isImport ? "none" : "";
  if (trackImportRunBtn) trackImportRunBtn.style.display = isImport ? "" : "none";
  if (trackBackupModalTitleEl) trackBackupModalTitleEl.textContent = isImport ? "Import Library" : "Backup Library";
  if (trackBackupStatusEl) trackBackupStatusEl.textContent = "";
  updateTrackBackupCancelBtnMode();
}

if (trackBackupTabBackupBtn) trackBackupTabBackupBtn.onclick = () => setTrackBackupTab("backup");
if (trackBackupTabImportBtn) trackBackupTabImportBtn.onclick = () => setTrackBackupTab("import");

function openBulkBackupModal() {
  if (!trackBackupModalOverlay) return;

  if (trackBackupTargetNameEl) {
    const count = Array.isArray(playlist) ? playlist.length : 0;
    trackBackupTargetNameEl.textContent = `ライブラリ全曲（${count}曲）`;
  }
  if (trackBackupRunBtn) {
    trackBackupRunBtn.disabled = false;
    trackBackupRunBtn.textContent = "Download";
  }

  // 開くたびに全項目チェック済みの状態にリセットする（前回の選択を引き継がない）。
  Object.values(trackBackupCheckboxes).forEach(cb => { if (cb) cb.checked = true; });

  resetImportState();
  setTrackBackupTab("backup");

  trackBackupModalOverlay.classList.add("open");
}

function closeTrackBackupModal() {
  if (!trackBackupModalOverlay) return;
  trackBackupModalOverlay.classList.remove("open");
}

if (trackBackupModalCloseBtn) trackBackupModalCloseBtn.onclick = closeTrackBackupModal;
// trackBackupCancelBtnのonclickはCancel/Back兼用のため固定では割り当てず、
// updateTrackBackupCancelBtnMode()（モーダルを開く/タブ切替/ZIP読み込み/
// Backのたびに呼ばれる）に一任する。
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
  if (typeof JSZip === "undefined") {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "JSZipが読み込まれていません。";
    return;
  }
  if (!Array.isArray(playlist) || playlist.length === 0) {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "バックアップ対象の曲がありません。";
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

  hapticTap();
  if (trackBackupRunBtn) {
    trackBackupRunBtn.disabled = true;
    trackBackupRunBtn.textContent = "Preparing...";
  }
  if (trackBackupStatusEl) trackBackupStatusEl.textContent = "";

  try {
    const zip = new JSZip();
    const audioFolder = opts.audio ? zip.folder("audio") : null;

    const tracksForExport = playlist.map(track => {
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

      if (opts.audio && audioFolder) {
        audioFolder.file(track.name, track.file);
      }

      return trackData;
    });

    const exportData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      tracks: tracksForExport
    };
    zip.file("markers.json", JSON.stringify(exportData, null, 2));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const downloadUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `qnplayer_library_backup_${dateStr}.zip`;
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
// Import（読み込み）
// ============================================================
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

// 選択されたZIPから読み取った内容。parsedData: markers.jsonの中身、
// audioFiles: Map<fileName, Blob>（audio/フォルダの中身）。
// duplicateChoices: Map<fileName, "overwrite"|"skip">（重複曲ごとの選択）。
let trackImportParsedData = null;
let trackImportAudioFiles = null;
let trackImportDuplicateChoices = new Map();

// Cancel/Backボタン(#trackBackupCancelBtn)は、ZIP読み込み前は
// モーダルを閉じる「Cancel」、読み込み後は選び直すための「Back」に
// なる（resetImportState()を呼んでドロップゾーン表示へ戻す）。
function updateTrackBackupCancelBtnMode() {
  if (!trackBackupCancelBtn) return;
  const isImportTab = trackBackupTabImportBtn && trackBackupTabImportBtn.classList.contains("active");
  if (isImportTab && trackImportParsedData) {
    trackBackupCancelBtn.textContent = "Back";
    trackBackupCancelBtn.onclick = resetImportState;
  } else {
    trackBackupCancelBtn.textContent = "Cancel";
    trackBackupCancelBtn.onclick = closeTrackBackupModal;
  }
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
  if (trackImportRunBtn) {
    trackImportRunBtn.disabled = true;
    trackImportRunBtn.textContent = "Import";
  }
  if (trackImportFileInputEl) trackImportFileInputEl.value = "";
  updateTrackBackupCancelBtnMode();
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
  if (typeof JSZip === "undefined") {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "JSZipが読み込まれていません。";
    return;
  }
  if (!/\.zip$/i.test(file.name)) {
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "ZIPファイルを選択してください。";
    return;
  }

  resetImportState();
  if (trackBackupStatusEl) trackBackupStatusEl.textContent = "読み込み中...";

  try {
    const zip = await JSZip.loadAsync(file);
    const markersEntry = zip.file("markers.json");
    if (!markersEntry) {
      if (trackBackupStatusEl) trackBackupStatusEl.textContent = "markers.jsonが見つかりません。";
      return;
    }
    const markersText = await markersEntry.async("string");
    const parsed = JSON.parse(markersText);
    if (!parsed || !Array.isArray(parsed.tracks)) {
      if (trackBackupStatusEl) trackBackupStatusEl.textContent = "ZIPの内容を読み取れませんでした。";
      return;
    }

    // audio/フォルダ配下のファイルを、ファイル名をキーにしたMapへ集める。
    const audioMap = new Map();
    const audioFolderFiles = zip.folder("audio") ? zip.folder("audio").file(/.*/) : [];
    for (const entry of audioFolderFiles) {
      const blob = await entry.async("blob");
      const baseName = entry.name.split("/").pop();
      audioMap.set(baseName, blob);
    }

    trackImportParsedData = parsed;
    trackImportAudioFiles = audioMap;

    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "";

    // ZIP読み込み後はドロップゾーンを隠し、代わりに読み込み済み情報を
    // 表示する（ドロップ位置によって「通常のファイル追加」と「ZIP
    // インポート」の挙動が入り乱れるのを避けるため、読み込み後は
    // ドロップ自体を受け付ける場所を無くす）。選び直したい場合は
    // Cancelボタンが「Back」になり、resetImportState()で元に戻す。
    if (trackImportDropZoneEl) trackImportDropZoneEl.style.display = "none";
    if (trackImportLoadedInfoEl) trackImportLoadedInfoEl.style.display = "flex";
    if (trackImportLoadedFileNameEl) trackImportLoadedFileNameEl.textContent = file.name;
    if (trackImportLoadedFileCountEl) trackImportLoadedFileCountEl.textContent = `${parsed.tracks.length}曲`;
    updateTrackBackupCancelBtnMode();

    // 既存ライブラリとの重複を検出し、曲ごとの上書き/スキップ選択UIを出す。
    const existingNames = new Set((Array.isArray(playlist) ? playlist : []).map(t => t.name));
    const duplicateNames = parsed.tracks.map(t => t.name).filter(name => existingNames.has(name));

    if (duplicateNames.length > 0) {
      duplicateNames.forEach(name => trackImportDuplicateChoices.set(name, "overwrite"));
      renderTrackImportDuplicateRows(duplicateNames);
      if (trackImportDuplicateListEl) trackImportDuplicateListEl.style.display = "flex";
    }

    if (trackImportRunBtn) trackImportRunBtn.disabled = false;
  } catch (err) {
    console.warn("handleTrackImportFileSelected failed:", err);
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "ZIPの読み込みに失敗しました。";
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
  if (trackImportRunBtn) {
    trackImportRunBtn.disabled = true;
    trackImportRunBtn.textContent = "Importing...";
  }
  if (trackBackupStatusEl) trackBackupStatusEl.textContent = "";

  let addedCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  let noAudioSkippedCount = 0;

  try {
    const existingByName = new Map((Array.isArray(playlist) ? playlist : []).map(t => [t.name, t]));

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
        // title/artist/file(音声実体)の実際のIndexedDB書き込みは、
        // このループの後にまとめて呼ぶpersistPlaylistOrder()に任せる
        // （playlist配列を直接書き換えているため、そこから改めて全曲分を
        // 保存し直せば十分。savedAtも現在の並び順のまま振り直される）。
        applyImportedMarkersAndText(name, trackData);
        overwrittenCount++;
      } else {
        // --- 新規追加 ---
        if (!audioBlob) {
          // 音声データを含まないZIP(または対象曲の音声だけ無い)の場合、
          // 新規追加は音声実体が無いと再生できないためスキップする。
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
        applyImportedMarkersAndText(name, trackData);
        addedCount++;
      }
    }

    if (typeof persistPlaylistOrder === "function") await persistPlaylistOrder();
    if (typeof renderPlaylist === "function") renderPlaylist();

    let summary = `新規追加: ${addedCount}件\n上書き: ${overwrittenCount}件\nスキップ: ${skippedCount}件`;
    if (noAudioSkippedCount > 0) summary += `\n音声なしのためスキップ: ${noAudioSkippedCount}件`;
    if (trackImportSummaryEl) {
      trackImportSummaryEl.textContent = summary;
      trackImportSummaryEl.style.display = "block";
    }
    if (trackImportRunBtn) {
      trackImportRunBtn.disabled = true;
      trackImportRunBtn.textContent = "Import";
    }
    hapticSuccess();
  } catch (err) {
    console.warn("runTrackImport failed:", err);
    if (trackBackupStatusEl) trackBackupStatusEl.textContent = "インポートに失敗しました。";
    if (trackImportRunBtn) {
      trackImportRunBtn.disabled = false;
      trackImportRunBtn.textContent = "Import";
    }
  }
}

// マーカー(位置/メモ)・テキストメモをlocalStorageへ反映する。
// trackData.markersが無ければマーカーには触れない（ZIP側でチェックを
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

if (trackImportRunBtn) trackImportRunBtn.onclick = runTrackImport;
