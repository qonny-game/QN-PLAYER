# qa.py — 出荷前の一括チェック。smoke / i18n_check / md_audit / js_unused / css_audit / release.py check を順に実行し、結果を1画面にまとめる。
# 使い方: cd <ルート> && python3 -I md/tools/qa.py   (全部で数分。ツール呼び出しの時間制限がある環境では nohup で背景実行し、出力ファイルを読む)
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
steps = [("smoke", ["smoke.py"]), ("i18n", ["i18n_check.py"]), ("md_audit", ["md_audit.py"]),
         ("js_unused", ["js_unused.py"]), ("css_audit", ["css_audit.py"]), ("release check", ["release.py", "check"])]
for name, cmd in steps:
    print("\n=== %s ===" % name, flush=True)
    try:
        r = subprocess.run([sys.executable, "-I", os.path.join(here, cmd[0])] + cmd[1:],
                           capture_output=True, text=True, timeout=300)
        out = (r.stdout + r.stderr).strip().splitlines()
        print("\n".join(out[-8:]))
        print("-> exit", r.returncode, flush=True)
    except subprocess.TimeoutExpired:
        print("-> 時間切れ(300s)", flush=True)
