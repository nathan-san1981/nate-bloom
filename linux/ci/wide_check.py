"""(175) Across both screens, checked on the installed app over its DevTools port: turn it on, see what the main process
did (fullscreen over the screens, or sized across without a title bar) and how wide the window ended up, then off.
usage: wide_check.py PORT OUT LABEL"""
import asyncio, json, sys
from playwright.async_api import async_playwright
PORT, OUT, LABEL = sys.argv[1], sys.argv[2], sys.argv[3]
async def main():
    async with async_playwright() as p:
        b = None
        for _ in range(60):
            try: b = await p.chromium.connect_over_cdp("http://127.0.0.1:" + PORT); break
            except Exception: await asyncio.sleep(1)
        if not b: print(LABEL, "no app to connect to"); return
        pg = None
        for _ in range(30):
            pgs = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
            if pgs: pg = pgs[0]; break
            await asyncio.sleep(1)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.wait_for_timeout(2500)
        st = lambda: pg.evaluate("NB_NATIVE.wideState().then(r => JSON.stringify(r))")
        print(LABEL, "before:", await st())
        await pg.evaluate("NB_NATIVE.setWide(true)"); await pg.wait_for_timeout(6000)
        on = json.loads(await st())
        span = max(d["bounds"]["x"] + d["bounds"]["width"] for d in on["displays"]) - min(d["bounds"]["x"] for d in on["displays"])
        print(LABEL, "on:", json.dumps(on))
        print(LABEL, "page:", await pg.evaluate("JSON.stringify({ wide: document.body.classList.contains('nb-wide'), w: innerWidth, h: innerHeight })"))
        print(LABEL, ("PASS" if on["wide"] and on["bounds"]["width"] >= span * 0.9 else "FAIL"), "across:", on["how"], on["bounds"], "of", span)
        await pg.screenshot(path=OUT + "/wide_" + LABEL + ".png")
        await pg.evaluate("NB_NATIVE.setWide(false)"); await pg.wait_for_timeout(3000)
        off = json.loads(await st())
        print(LABEL, ("PASS" if not off["wide"] and off["bounds"]["width"] < span * 0.75 else "FAIL"), "back:", off["how"], off["bounds"])
        print(LABEL, "page errors:", errs[:3])
asyncio.run(main())
