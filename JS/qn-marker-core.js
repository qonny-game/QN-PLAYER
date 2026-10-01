/* qn-marker-core.js — PLAYER と YouTube で共有する「マーカー/区間ループ/A-B/前後マーカー移動」の判定ルール（v3.11.0）
   ここは「秒数だけを扱う純粋な関数」。音声(audio)やYouTubeプレイヤーには触らない。
   マーカーの時刻配列(times)は「表示ON(enabled)のマーカーだけを昇順に並べたもの」を渡す。 */
var QNMarkerCore = (function () {
  var EPS = 0.05;

  // 現在地ctを含む区間（times[i]〜times[i+1]）の番号。マーカーが2つ未満なら-1。
  // 最後の区間だけ終端を含む。最初のマーカーより前にいる時は最初の区間、最後より後ろは最後の区間。
  function pickSectionIndex(times, ct) {
    if (!times || times.length < 2) return -1;
    for (var i = 0; i < times.length - 1; i++) {
      var s = times[i], e = times[i + 1];
      if (i === times.length - 2) { if (ct >= s && ct <= e) return i; }
      else if (ct >= s && ct < e) return i;
    }
    return ct < times[0] ? 0 : times.length - 2;
  }

  // ctが区間start〜end（前後のプリロール/ポストロールを含む）の内側か
  function inRange(start, end, ct, preroll, dur) {
    var pr = preroll || 0;
    return ct >= Math.max(0, start - pr) - EPS && ct <= Math.min(dur || (end + pr), end + pr) + EPS;
  }

  function inSectionRange(times, idx, ct, preroll, dur) {
    if (idx === null || idx === undefined || idx < 0 || idx >= times.length - 1) return false;
    return inRange(times[idx], times[idx + 1], ct, preroll, dur);
  }

  // 前/次マーカーボタンが基準にする「現在地」。区間ループ中のプリロール/ポストロール再生中は、
  // 区間の内側（頭／終わりの少し手前）にいるものとして扱う。
  function navRefTime(times, idx, ct, preroll, loopOn) {
    if (!loopOn || idx === null || idx === undefined || !(preroll > 0)) return ct;
    if (idx < 0 || idx >= times.length - 1) return ct;
    var start = times[idx], end = times[idx + 1];
    if (ct > end && ct <= end + preroll + EPS) return Math.max(start, end - 0.1);
    if (ct < start && ct >= start - preroll - EPS) return start;
    return ct;
  }

  // 次のマーカー（無ければ最初へ戻る）
  function nextTime(times, ref) {
    if (!times.length) return null;
    for (var i = 0; i < times.length; i++) if (times[i] > ref + EPS) return times[i];
    return times[0];
  }

  // 前のマーカー（直近のマーカーに着いて0.5秒以内なら、もう1つ前。無ければ最後へ戻る）
  function prevTime(times, ref) {
    if (!times.length) return null;
    var target = null, i;
    for (i = times.length - 1; i >= 0; i--) if (times[i] <= ref + EPS) { target = times[i]; break; }
    if (target === null) return times[times.length - 1];
    if (ref - target <= 0.5) {
      var earlier = null;
      for (i = times.length - 1; i >= 0; i--) if (times[i] < target - EPS) { earlier = times[i]; break; }
      return earlier !== null ? earlier : times[times.length - 1];
    }
    return target;
  }

  // A-Bループ中に、A〜Bの外側へシークしたか（→ LOOPをOFFにする。A/B点は残す）
  function isOutsideAB(a, b, t) {
    if (a === null || b === null || a === undefined || b === undefined) return false;
    var s = Math.min(a, b), e = Math.max(a, b);
    return t < s - EPS || t > e + EPS;
  }

  return {
    pickSectionIndex: pickSectionIndex, inRange: inRange, inSectionRange: inSectionRange,
    navRefTime: navRefTime, nextTime: nextTime, prevTime: prevTime, isOutsideAB: isOutsideAB
  };
})();
