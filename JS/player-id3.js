// ============================================================
// player-id3.js
// MP3ファイルのID3v2タグからTitle(TIT2)/Artist(TPE1)フレームだけを
// 読み取る、外部ライブラリに依存しない最小限のパーサー。
// ID3v1(ファイル末尾128byte)のフォールバックにも対応する。
//
// 依存: なし（単体で動作する）。player-playlist.js側から
// readId3Tags(file) を呼び出して使う。
// ============================================================

/**
 * ファイルの先頭部分を読み、ID3v2ヘッダー内のTIT2(タイトル)/TPE1(アーティスト)
 * フレームを探して返す。見つからなければID3v1(ファイル末尾128byte)も試す。
 * どちらも無ければ { title: null, artist: null } を返す。
 * @param {File} file
 * @returns {Promise<{title: string|null, artist: string|null}>}
 */
async function readId3Tags(file) {
  try {
    // ID3v2ヘッダー(10byte)+タグ本体を読むため、先頭512KBだけ読めば
    // 通常のタグサイズ(数KB〜十数KB程度)には十分足りる。
    const headSize = Math.min(file.size, 512 * 1024);
    const headBuf = await file.slice(0, headSize).arrayBuffer();
    const head = new Uint8Array(headBuf);

    const v2 = parseId3v2(head);
    if (v2.title || v2.artist) return v2;

    // ID3v2で見つからなければID3v1(ファイル末尾128byte、"TAG"で始まる)を試す。
    if (file.size >= 128) {
      const tailBuf = await file.slice(file.size - 128, file.size).arrayBuffer();
      const tail = new Uint8Array(tailBuf);
      const v1 = parseId3v1(tail);
      if (v1.title || v1.artist) return v1;
    }

    return { title: null, artist: null };
  } catch (e) {
    console.warn("readId3Tags failed:", e);
    return { title: null, artist: null };
  }
}

function parseId3v1(bytes) {
  // "TAG" + title(30) + artist(30) + album(30) + year(4) + comment(30) + genre(1)
  if (bytes.length < 128 || bytes[0] !== 0x54 || bytes[1] !== 0x41 || bytes[2] !== 0x47) {
    return { title: null, artist: null };
  }
  const decode = (start, len) => {
    const slice = bytes.slice(start, start + len);
    let text = new TextDecoder("latin1").decode(slice);
    return text.replace(/\0.*$/, "").trim() || null;
  };
  return {
    title: decode(3, 30),
    artist: decode(33, 30),
  };
}

function parseId3v2(bytes) {
  const result = { title: null, artist: null };
  // ヘッダー: "ID3" + version(2byte) + flags(1byte) + size(4byte synchsafe)
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return result;
  }
  const majorVersion = bytes[3];
  const flags = bytes[5];
  const tagSize = synchsafeToInt(bytes[6], bytes[7], bytes[8], bytes[9]);
  let offset = 10;

  // Extended header(存在する場合)をスキップする
  const hasExtendedHeader = (flags & 0x40) !== 0;
  if (hasExtendedHeader && offset + 4 <= bytes.length) {
    const extSize = majorVersion >= 4
      ? synchsafeToInt(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
      : readUint32BE(bytes, offset);
    offset += extSize;
  }

  const tagEnd = Math.min(bytes.length, 10 + tagSize);

  while (offset + 10 <= tagEnd) {
    let frameId, frameSize, frameFlagsSize;
    if (majorVersion === 2) {
      // ID3v2.2: フレームID3byte、サイズ3byte、フラグなし
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
      frameSize = readUint24BE(bytes, offset + 3);
      frameFlagsSize = 0;
      offset += 6;
    } else {
      // ID3v2.3/2.4: フレームID4byte、サイズ4byte、フラグ2byte
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      frameSize = majorVersion >= 4
        ? synchsafeToInt(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
        : readUint32BE(bytes, offset + 4);
      frameFlagsSize = 2;
      offset += 10;
    }

    if (frameSize <= 0 || offset + frameSize > bytes.length) break;
    // フレームIDが全て0x00ならパディング領域に入ったとみなし終了する
    if (frameId.charCodeAt(0) === 0) break;

    const isTitle = frameId === "TIT2" || frameId === "TT2";
    const isArtist = frameId === "TPE1" || frameId === "TP1";
    if (isTitle || isArtist) {
      const text = decodeTextFrame(bytes, offset, frameSize);
      if (isTitle && text) result.title = text;
      if (isArtist && text) result.artist = text;
    }

    offset += frameSize;
    if (result.title && result.artist) break;
  }

  return result;
}

function decodeTextFrame(bytes, start, size) {
  if (size <= 0) return null;
  const encodingByte = bytes[start];
  const textBytes = bytes.slice(start + 1, start + size);
  let text;
  try {
    if (encodingByte === 0x01 || encodingByte === 0x02) {
      // UTF-16 (BOM付き or BE固定)
      text = new TextDecoder(encodingByte === 0x02 ? "utf-16be" : "utf-16").decode(textBytes);
    } else if (encodingByte === 0x03) {
      text = new TextDecoder("utf-8").decode(textBytes);
    } else {
      // 0x00: ISO-8859-1 (Latin1)
      text = new TextDecoder("latin1").decode(textBytes);
    }
  } catch (e) {
    return null;
  }
  // 末尾のnull終端・制御文字を除去
  text = text.replace(/\0+$/, "").trim();
  return text || null;
}

function synchsafeToInt(b0, b1, b2, b3) {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function readUint32BE(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function readUint24BE(bytes, offset) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

/**
 * 音声ファイルの長さ(秒)を取得する。一時的な<audio>要素でメタデータだけを
 * 読み込み、durationが確定した時点で解決する。
 * @param {File} file
 * @returns {Promise<number|null>}
 */
function readAudioDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const tempAudio = new Audio();
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, 8000);
      const cleanup = () => {
        clearTimeout(timeoutId);
        tempAudio.removeEventListener("loadedmetadata", onLoaded);
        tempAudio.removeEventListener("durationchange", onLoaded);
        tempAudio.removeEventListener("error", onError);
        URL.revokeObjectURL(url);
      };
      const onLoaded = () => {
        if (settled) return;
        const dur = tempAudio.duration;
        // 一部のMP3(特にVBR)はloadedmetadata時点でIsFinite(duration)が
        // falseになることがある(Infinityを経て後からdurationchangeで
        // 確定する)。durationchangeも合わせて listenし、有限値が
        // 得られた時点で確定させる。
        if (!Number.isFinite(dur)) return;
        settled = true;
        cleanup();
        resolve(dur);
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      };
      tempAudio.addEventListener("loadedmetadata", onLoaded);
      tempAudio.addEventListener("durationchange", onLoaded);
      tempAudio.addEventListener("error", onError);
      tempAudio.preload = "metadata";
      tempAudio.src = url;
    } catch (e) {
      resolve(null);
    }
  });
}
