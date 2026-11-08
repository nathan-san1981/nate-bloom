"""CI (pi.yml): the app started with --box, checked over its DevTools port. Prints one line per check."""
import json, sys, time
from playwright.sync_api import sync_playwright

port, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
    pg = None
    for _ in range(30):
        pages = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
        if pages: pg = pages[0]; break
        time.sleep(1)
    if not pg: print("FAIL no page"); sys.exit(0)
    time.sleep(6)
    r = pg.evaluate("""() => ({
      url: location.href,
      box: document.documentElement.classList.contains('nb-box'),
      nbbox: typeof window.NBBox === 'object',
      play: !!document.getElementById('playView') && !document.getElementById('playView').hidden,
      strip: !!document.getElementById('bxStrip'),
      size: innerWidth + 'x' + innerHeight,
      errors: (window.__nbErrors || []).length,
    })""")
    print(json.dumps(r))
    for k in ("box", "nbbox", "play", "strip"):
        print(("OK   " if r.get(k) else "FAIL ") + k)
    try:
        st = pg.evaluate("() => window.NBBox ? window.NBBox.status() : null")
        print("status", json.dumps(st))
    except Exception as e:
        print("status error", e)
    pg.screenshot(path=f"{out}/box.png")
    print("screenshot", f"{out}/box.png")
