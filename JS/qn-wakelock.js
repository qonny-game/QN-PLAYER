// qn-wakelock.js — 再生中は画面スリープを防ぐ（Screen Wake Lock API）＋PLAYERのバックグラウンド再生の維持。
// 対応していない環境では何もしない。PLAYER(audio)の再生中と、YouTubeアプリの再生中に
// 保持し、一時停止・終了・画面が隠れた時に解放する（表示に戻れば自動で再取得）。
// 公開: window.QNWake.set(理由キー, true/false)
(function () {
  "use strict";
  // v2.30.1：Wake Lockを止めたら、iPhoneのホーム画面アプリでPLAYERのバックグラウンド再生が続くことを確認。
  // v2.31.0：画面が隠れる/ページを離れる時に自分から先にWake Lockを解放する形で再開（OSに任せない）。
  //   PLAYER(audio)側で再び止まるようなら WAKE_FOR_PLAYER を false にする（YouTube側は影響なし）。
  var ENABLE_WAKE_LOCK = true;
  var WAKE_FOR_PLAYER = true;
  var reasons = {};
  var sentinel = null;
  var pending = false;

  function wanted() {
    for (var k in reasons) if (reasons[k]) return true;
    return false;
  }

  function release() {
    if (!sentinel) return;
    try { sentinel.release(); } catch (e) {}
    sentinel = null;
  }

  function acquire() {
    if (!ENABLE_WAKE_LOCK || sentinel || pending) return;
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    pending = true;
    navigator.wakeLock.request("screen").then(function (s) {
      pending = false;
      sentinel = s;
      s.addEventListener("release", function () { if (sentinel === s) sentinel = null; });
      if (!wanted()) release();
    }).catch(function () { pending = false; });
  }

  function sync() { if (wanted()) acquire(); else release(); }

  function set(key, on) {
    if (key === "player" && !WAKE_FOR_PLAYER) on = false;
    reasons[key] = !!on;
    sync();
  }

  // 隠れる時は、OSに解放されるのを待たず自分から先に解放する（バックグラウンド再生を邪魔しない）
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") sync(); else release();
  });
  window.addEventListener("pagehide", release);
  window.addEventListener("pageshow", function () { if (document.visibilityState === "visible") sync(); });

  function hookAudio() {
    if (typeof audio === "undefined" || !audio || !audio.addEventListener) return false;
    audio.addEventListener("play", function () { set("player", true); });
    audio.addEventListener("playing", function () { set("player", true); });
    audio.addEventListener("pause", function () { set("player", false); });
    audio.addEventListener("ended", function () { set("player", false); });
    if (!audio.paused) set("player", true);
    return true;
  }

  // ---------- PLAYER(audio)の再生中は、画面を閉じても/別アプリに切り替えても鳴らし続ける ----------
  // ・navigator.audioSession.type = "playback"：対応ブラウザ(iOS Safari 系など)に「これは音楽再生」と伝え、
  //   画面ロック・バックグラウンドでも止められにくくする（マナーモードでも鳴る）。
  // ・EQ/Speed/Keyを使うとaudioがWeb Audio(AudioContext)経由になり、OSによってAudioContextが
  //   止められることがある。画面が隠れた/戻った時、再生中なのに止まっていれば再開させる。
  // ロック画面の再生/一時停止ボタン(mediaSession)はplayer-ui-shared.jsで設定済み。
  // ※ YouTubeアプリは対象外（規約により、隠れている間は再生しない）。
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}

  function keepAudioAlive() {
    try {
      if (typeof audio === "undefined" || !audio || audio.paused) return;
      var ctx = window.__qnAudioCtx;
      if (ctx && ctx.state !== "running") ctx.resume().catch(function () {});
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", keepAudioAlive);
  window.addEventListener("pagehide", keepAudioAlive);
  window.addEventListener("pageshow", keepAudioAlive);

  window.QNWake = { set: set };
  if (!hookAudio()) document.addEventListener("DOMContentLoaded", hookAudio);
})();
