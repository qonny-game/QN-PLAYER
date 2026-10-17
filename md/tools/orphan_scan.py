# orphan_scan.py — お掃除の洗い出し補助: index.htmlのid重複・どこからも参照されないid・宣言のみで参照1か所のJS関数/変数を出す。
# 使い方: python3 -I md/tools/orphan_scan.py [ルート]（引数なしはカレント）
# 注意: eqBand0〜9/eqGain0〜9は動的生成、swUnlockPremium/openEqModalは残置リスト(CLEANUP.md §5)。出力は候補で、削除前に動的参照を確認する。
import collections, glob, os, re, sys
root = sys.argv[1] if len(sys.argv) > 1 else "."
os.chdir(root)
html = open("index.html", encoding="utf-8").read()
ids = re.findall(r'\bid="([^"]+)"', html)
print("重複id:", [i for i in set(ids) if ids.count(i) > 1])
skip = re.compile(r"jszip|lame_min|qn-basic-pitch|soundtouch-core")
src = {f: open(f, encoding="utf-8", errors="ignore").read() for f in glob.glob("JS/**/*.js", recursive=True) if not skip.search(f)}
alljs = "".join(src.values())
css = "".join(open(f, encoding="utf-8").read() for f in glob.glob("CSS/*.css"))
rest = re.sub(r'\bid="[^"]+"', "", html)
print("参照のないid:", [i for i in sorted(set(ids)) if i not in alljs and i not in css and i not in rest])
tok = collections.Counter(re.findall(r"[A-Za-z_$][\w$]*", alljs + html))
for f, t in src.items():
    for m in re.finditer(r"(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", t):
        if tok[m.group(1)] <= 1: print("参照なしの関数", f, m.group(1))
    for m in re.finditer(r"(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", t):
        if tok[m.group(1)] <= 1: print("参照なしの変数", f, m.group(1))
