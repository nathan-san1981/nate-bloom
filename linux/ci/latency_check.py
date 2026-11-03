"""(181) CI: how long the installed app's sound takes to come out, as Chromium reports it (baseLatency + outputLatency),
for each sound buffer setting, with the sound server (PulseAudio or PipeWire) the job started. Prints one line per
setting. usage: latency_check.py PORT LABEL"""
import asyncio, json, sys
from playwright.async_api import async_playwright
PORT, LABEL = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = None
        for _ in range(60):
            try: b = await p.chromium.connect_over_cdp("http://127.0.0.1:" + PORT); break
            except Exception: await asyncio.sleep(1)
        if not b: print(LABEL, "no app"); return
        pg = None
        for _ in range(30):
            pgs = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
            if pgs: pg = pgs[0]; break
            await asyncio.sleep(1)
        for buf in ["fast", "steady"]:
            await pg.evaluate(f"localStorage.setItem('nightbloom-buffer', '{buf}'); localStorage.setItem('nightbloom-stackhint','1')")
            await pg.reload(); await pg.wait_for_timeout(2000)
            try: await pg.click("#startBtn", timeout=3000)
            except Exception: pass
            await pg.wait_for_timeout(4000)
            r = await pg.evaluate("""(() => { const c = window.__ne && window.__ne.ctx; const x = c || null; if (!x) return null;
              const s = x.playoutStats || {}; return { base: Math.round(x.baseLatency * 1000 * 10) / 10, out: Math.round((x.outputLatency || 0) * 1000 * 10) / 10, rate: x.sampleRate,
                fallback: s.fallbackFramesEvents, engineAhead: window.__ne.hdr ? window.__ne.hdr[5] : null }; })()""")
            print(LABEL, buf, json.dumps(r), flush=True)
asyncio.run(main())
