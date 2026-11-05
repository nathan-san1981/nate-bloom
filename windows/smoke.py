"""(234) CI: start the Windows app, connect to its page, check it is the app, that it starts sound, and that the main
pieces are there. Prints PASS/FAIL lines. usage: smoke.py EXE"""
import asyncio, os, subprocess, sys, time
from playwright.async_api import async_playwright
EXE = sys.argv[1]
async def main():
    env = dict(os.environ, NB_NO_UPDATE="1")
    p = subprocess.Popen([EXE, "--remote-debugging-port=9333"], env=env)
    try:
        async with async_playwright() as pw:
            b = None
            for _ in range(40):
                try: b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
                except Exception: await asyncio.sleep(1)
            if not b: print("FAIL the app's page never came up"); return
            pg = None
            for _ in range(20):
                ps = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
                if ps: pg = ps[0]; break
                await asyncio.sleep(1)
            if not pg: print("FAIL no app:// page"); return
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.wait_for_timeout(4000)
            r = await pg.evaluate("({ platform: window.NB_NATIVE && NB_NATIVE.platform, version: window.NB_NATIVE && NB_NATIVE.version, build: window.NB_BUILD, yours: window.NB_YOURS, test: typeof window.__nbTest })")
            print("INFO", r)
            print(("PASS" if r.get("platform") == "windows" else "FAIL") + " platform is windows")
            print(("PASS" if r.get("yours") is False else "FAIL") + " Nathan's plugins are labelled for anyone")
            try: await pg.click("#startBtn", timeout=4000)
            except Exception: pass
            await pg.wait_for_timeout(2500)
            a = await pg.evaluate("(() => { const T = window.__nbTest; T.on(60); return new Promise(res => setTimeout(() => { const l = T.level(); T.off(60); res({ level: l }); }, 700)); })()")
            print("INFO", a)
            lv = a.get("level")
            print(("PASS" if isinstance(lv, list) and lv[0] > 0.003 else "FAIL") + " a note makes sound (peak " + str(lv) + ")")
            print(("PASS" if not errs else "FAIL") + " no page errors " + str(errs[:3]))
    finally:
        p.kill()
asyncio.run(main())
