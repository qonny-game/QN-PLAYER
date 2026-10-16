# e2e_backup_folders.py — Backupのzipが Library のフォルダ構造(audio/<フォルダ名>/<曲>)を保つか確認。ルートで: QN_WAV=... python3 -I md/tools/e2e_backup_folders.py
import sys, os, shutil, zipfile, tempfile
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
wp = os.path.abspath(os.environ.get("QN_WAV", "guitar_test.wav"))
tmp = tempfile.mkdtemp(); a = os.path.join(tmp, "song_in_folder.wav"); b = os.path.join(tmp, "song_loose.wav")
shutil.copy(wp, a); shutil.copy(wp, b)
ok = True
def check(n, c, i=""):
    global ok; print(("OK  " if c else "NG  ") + n, i); ok = ok and bool(c)
with QNBrowser(".") as qb:
    pg = qb.new_page(width=1280, height=800, lang="en", accept_downloads=True) if "accept_downloads" in QNBrowser.new_page.__code__.co_varnames else qb.new_page(width=1280, height=800, lang="en")
    qb.goto(pg); qb.add_track(pg, a); pg.wait_for_timeout(1500); qb.add_track(pg, b); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const f = createPlaylistFolder('My: Folder/1'); const t = playlist.find(x => x.name === 'song_in_folder.wav'); moveTracksToFolder([playlist.indexOf(t)], f.id); renderPlaylist(); }""")
    pg.wait_for_timeout(500)
    qb.open_panel(pg, "Settings", 500)
    pg.evaluate("document.querySelector('#pcV2PanelBody .qn-set-list-item[data-panel-id=backup]').click()"); pg.wait_for_timeout(600)
    pg.evaluate("document.getElementById('trackBackupSelectAllBtn').click()"); pg.wait_for_timeout(300)
    with pg.expect_download(timeout=30000) as dl:
        pg.evaluate("document.getElementById('trackBackupRunBtn').click()")
    path = os.path.join(tmp, "out.zip"); dl.value.save_as(path)
    names = zipfile.ZipFile(path).namelist(); print(names)
    check("folder track goes under audio/<folder>/", any(n.startswith("audio/My_ Folder_1/") and n.endswith("song_in_folder.wav") for n in names))
    check("unsorted track stays directly in audio/", "audio/song_loose.wav" in names)
    check("markers.json present", "markers.json" in names)
sys.exit(0 if ok else 1)
