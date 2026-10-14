import sys, os
sys.path.insert(0, os.path.abspath("md/tools"))
from qnbrowser import QNBrowser
with QNBrowser(".") as qb:
    for W in (1280, 390):
        pg = qb.new_page(width=W, height=800 if W > 900 else 844)
        qb.goto(pg)
        labels = qb.icon_labels(pg); print(W, labels[:6])
        pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=playlist]')?.click()"); pg.wait_for_timeout(700)
        pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=markers]')?.click()")
        pg.wait_for_timeout(60)
        an = pg.evaluate("document.getAnimations().map(a=>a.animationName||'').filter(n=>n.startsWith('qn')).sort().join(',')")
        print(" anims:", an)
        if W > 900: pg.screenshot(path="side_mid.png")
        pg.wait_for_timeout(500)
        pg.evaluate("document.querySelector('#pcV2IconBar .pcv2-icon-item[data-panel-id=markers]')?.click()")
        pg.wait_for_timeout(60)
        print(" same-click anims:", pg.evaluate("document.getAnimations().map(a=>a.animationName||'').filter(n=>n.startsWith('qnPanel')).join(',')"))
        print(" errors", qb.errors(pg))
