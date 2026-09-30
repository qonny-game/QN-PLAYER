// qn-wakelock.js — 再生中は画面スリープを防ぐ（Screen Wake Lock API）。
// 対応していない環境では何もしない。PLAYER(audio)の再生中と、YouTubeアプリの再生中に
// 保持し、一時停止・終了・画面が隠れた時に解放する（表示に戻れば自動で再取得）。
// 公開: window.QNWake.set(理由キー, true/false)
(function () {
  "use strict";
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
    if (sentinel || pending) return;
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

  function set(key, on) { reasons[key] = !!on; sync(); }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") sync();
  });

  function hookAudio() {
    if (typeof audio === "undefined" || !audio || !audio.addEventListener) return false;
    audio.addEventListener("play", function () { set("player", true); });
    audio.addEventListener("playing", function () { set("player", true); });
    audio.addEventListener("pause", function () { set("player", false); });
    audio.addEventListener("ended", function () { set("player", false); });
    if (!audio.paused) set("player", true);
    return true;
  }

  window.QNWake = { set: set };
  if (!hookAudio()) document.addEventListener("DOMContentLoaded", hookAudio);
})();
