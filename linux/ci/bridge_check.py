"""(187) CI: the Bitwig bridge. The app puts NateBloomBridge.clap in ~/.clap; a small real-time CLAP host
(bridgetest/mini.cc, 128-frame blocks paced by the clock, like a DAW) loads it and plays three notes; the sound that
comes back should start the plugin's reported latency after each note (a DAW makes that up), within a few ms, for a
bridge carrying one sound and one carrying everything.
usage: bridge_check.py PORT OUT MINI"""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright
PORT, OUT, MINI = sys.argv[1], sys.argv[2], sys.argv[3]
PLUG = os.path.expanduser("~/.clap/NateBloomBridge.clap")
ONSETS = """
import numpy as np, sys
x=np.fromfile('/tmp/nb-bridge-rec.f32',dtype=np.float32); sr=48000
env=np.convolve(abs(x),np.ones(96)/96,'same'); out=[]
for n in [48000,168000,288000]:
  w=env[n-2000:n+12000]; on=np.where(w>0.02)[0]; out.append(float(round((on[0]-2000)/sr*1000,2)) if len(on) else None)
import json; print(json.dumps(out))
"""
async def main():
    fails = []
    def check(n, ok, info=""):
        print(("PASS " if ok else "FAIL ") + n + (" · " + str(info) if info != "" else ""), flush=True)
        if not ok: fails.append(n)
    check("the app installed the plugin in ~/.clap", os.path.isfile(PLUG), PLUG)
    async with async_playwright() as p:
        b = None
        for _ in range(60):
            try: b = await p.chromium.connect_over_cdp("http://127.0.0.1:" + PORT); break
            except Exception: await asyncio.sleep(1)
        if not b: print("FAIL no app"); return
        pg = None
        for _ in range(30):
            pgs = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
            if pgs: pg = pgs[0]; break
            await asyncio.sleep(1)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.evaluate("localStorage.setItem('nightbloom-stackhint','1')")
        try: await pg.click("#startBtn", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(2000)
        check("the bridge is up in the app (shared memory)", await pg.evaluate("!!(window.__nbBridge && __nbBridge.ok)"), await pg.evaluate("JSON.stringify(window.__nbBridge && { ok: __nbBridge.ok, why: __nbBridge.why, plugin: __nbBridge.plugin })"))
        lat = None
        for route in ["e:pluck", "stack"]:
            await pg.evaluate("(r => { const o = JSON.parse(localStorage.getItem('nightbloom-bitwig') || '{}'); o.routes = { Bridge: r }; localStorage.setItem('nightbloom-bitwig', JSON.stringify(o)); })", route)
            await pg.reload(); await pg.wait_for_timeout(2500)
            try: await pg.click("#startBtn", timeout=3000)
            except Exception: pass
            await pg.evaluate("(() => { const t = document.querySelector('.tab[data-engine=\"pluck\"]'); if (t) t.click(); })()"); await pg.wait_for_timeout(2500)
            r = subprocess.run([MINI, PLUG], capture_output=True, text=True, timeout=60); print(r.stdout.strip())
            for line in r.stdout.splitlines():
                if line.startswith("latency"): lat = int(line.split()[1])
            ons = json.loads(subprocess.run(["python3", "-c", ONSETS], capture_output=True, text=True).stdout.strip() or "[null, null, null]")
            lms = (lat or 0) / 48.0
            st = await pg.evaluate("JSON.stringify({ notes: __nbBridge.notes, late: __nbBridge.late, leads: __nbBridge.leads.slice(-6) })")
            good = [o for o in ons[1:] if o is not None]
            check(f"{route}: the notes come back ({ons} ms after each, the plugin's latency {lms:.1f} ms)", len(good) == 2, st)
            if good: check(f"{route}: in time once the host makes up the latency (within 8 ms; CI's audio has no real device, so this one is a guide)", all(-2 <= o - lms <= 8 for o in good), [round(o - lms, 1) for o in good])
        check("no page errors", not errs, errs[:3])
        print("RESULT " + ("OK" if not fails else "FAILED: " + "; ".join(fails)))
asyncio.run(main())
