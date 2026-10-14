// qn-features.js — 機能の表示ON/OFF。公開時に隠す機能のスイッチ(index.htmlで最初に読む)。
// 公開版の既定: tab / stem / rec / chords をOFF(画面にもメニューにも設定にも出さず、裏の処理も動かさない)。
// 戻す: 下のFのtrueにする。開発・動作確認だけで出したい時は、ブラウザのコンソールで localStorage.qn_dev_features = "tab,stem,rec,chords"(または "all")→再読み込み。消す: localStorage.removeItem("qn_dev_features")
// chords=コード表示・拍/小節の解析・Grid click・マーカーの小節/拍への吸着(拍の解析に頼る機能をまとめて)。tab/stem/recはそれぞれのパネル。
(function () {
  "use strict";
  var F = { tab: false, stem: false, rec: false, chords: false };
  try {
    String(localStorage.getItem("qn_dev_features") || "").split(",").forEach(function (k) {
      k = k.trim();
      if (k === "all") { for (var x in F) F[x] = true; } else if (k in F) F[k] = true;
    });
  } catch (e) {}
  window.QN_FEATURES = F;
  // 登録の無い名前(library/markersなど)は常にtrue
  window.qnFeature = function (k) { return F[k] !== false; };
  // 設定行の配列から、feat(機能名)がOFFの行を除く。行は {feat:"chords", ...} のように書く
  window.qnFeatRows = function (rows) { return rows.filter(function (r) { return !r.feat || F[r.feat] !== false; }); };
})();
