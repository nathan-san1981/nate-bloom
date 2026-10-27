"""Drive the Linux app over its DevTools port (the app runs with --remote-debugging-port) and check what it adds:
the page from inside the app, fast pads, a Studio instrument from the app's own files, a library sound fetched and
kept, saving to Downloads/Nate Bloom, Lite. Prints one line per check; screenshots go to OUT."""
import asyncio, json, os, sys, glob
from playwright.async_api import async_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else "9333"; OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
HOME = os.path.expanduser("~")
async def main():
    async with async_playwright() as p:
        b = None
        for _ in range(60):
            try: b = await p.chromium.connect_over_cdp("http://127.0.0.1:" + PORT); break
            except Exception: await asyncio.sleep(1)
        if not b: print("no app to connect to"); return
        pg = None
        for _ in range(30):
            pgs = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
            if pgs: pg = pgs[0]; break
            await asyncio.sleep(1)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.wait_for_timeout(1500)
        print("page:", await pg.evaluate("location.href + ' | ' + document.title"))
        print("native:", await pg.evaluate("JSON.stringify({ platform: NB_NATIVE.platform, v: NB_NATIVE.version, fast: !!window.NBFastPads, app: document.body.classList.contains('nb-app') })"))
        await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.click("#startBtn"); await pg.wait_for_timeout(1200)
        print("audio:", await pg.evaluate("(() => { const c = window.__vx && __vx.getCtx(); return c ? [c.state, c.sampleRate, Math.round((c.baseLatency + (c.outputLatency || 0)) * 1000) + ' ms'] : 'no ctx' })()"))
        await pg.screenshot(path=OUT + "/l1_main.png")
        # a Studio instrument from the app's own files
        await pg.click("#sndOpen"); await pg.wait_for_timeout(300); await pg.click('#brCats .chip[data-cat="studio"]'); await pg.wait_for_timeout(300)
        await pg.click('#brList .br-row[data-id="w:nb-violin"] .br-main'); await pg.wait_for_timeout(2500)
        print("Studio violin:", await pg.evaluate("[document.getElementById('sndName').textContent, document.getElementById('sndSub').textContent]"))
        # a library sound: fetched once, then kept for offline
        await pg.click('#brCats .chip[data-cat="strings"]'); await pg.wait_for_timeout(300)
        await pg.evaluate("(() => { const r = [...document.querySelectorAll('#brList .br-row')].find(r => r.querySelector('.br-name').textContent === 'Cello'); r && r.querySelector('.br-main').click(); })()"); await pg.wait_for_timeout(5000)
        print("library Cello:", await pg.evaluate("[document.getElementById('sndName').textContent, document.getElementById('sndSub').textContent]"),
              "| kept:", [os.path.basename(f) for f in glob.glob(HOME + "/.config/*/site/snd/*.json")][:3])
        await pg.click("#brDone"); await pg.wait_for_timeout(300)
        # Beat Pads: fast pads get ready, keys play through them
        await pg.click("#bpBtn")
        for _ in range(80):
            await pg.wait_for_timeout(500)
            n = await pg.evaluate("window.__nfp ? [...__nfp.NFP.pads.values()].filter(r => r.ok).length : -1")
            if n >= 16 or n < 0: break
        print("fast pads:", await pg.evaluate("JSON.stringify({ ready: window.__nfp ? [...__nfp.NFP.pads.values()].filter(r => r.ok).length : 'no page support', info: window.NBFastPads ? NBFastPads.info() : null, badge: (document.getElementById('bpFast') || {}).textContent })"))
        p0 = await pg.evaluate("window.__nfp ? __nfp.NFP.plays : 0")
        for ch in "zxcvzxcv": await pg.keyboard.press(ch); await pg.wait_for_timeout(120)
        print("keys through fast pads:", await pg.evaluate("window.__nfp ? __nfp.NFP.plays : 0") - p0, "of 8")
        await pg.screenshot(path=OUT + "/l2_beatpads.png")
        await pg.click("#bpDone"); await pg.wait_for_timeout(300)
        # MIDI
        print("midi:", await pg.evaluate("(async () => { try { const a = await navigator.requestMIDIAccess({ sysex: true }); return 'ok: ' + a.inputs.size + ' in, ' + a.outputs.size + ' out'; } catch (e) { return 'error: ' + e.message; } })()"))
        # (saving is checked by save_check.mjs: Playwright takes over downloads while it's connected)
        # Lite
        await pg.goto("app://nate-bloom/lite/"); await pg.wait_for_timeout(2000)
        print("lite:", await pg.evaluate("location.href + ' | ' + document.title + ' | native ' + !!window.NB_NATIVE"))
        await pg.screenshot(path=OUT + "/l3_lite.png")
        await pg.goto("app://nate-bloom/"); await pg.wait_for_timeout(1500)
        print("errors:", errs)
asyncio.run(main())
