"""(176) CI: the native synth engine in the installed app, over its DevTools port: shared memory, the engine running
and writing ahead, then each synth it plays (Juno, Supersaw, Analog, Hoover, Mono, Pluck, Tyrell, Sync Lead, Comb Bells) with the engine on and
off, a chord held through the same channel and effects: the engine had the notes, and the level close to the browser
version's (within 3 dB). Prints PASS/FAIL lines; never fails the build. usage: native_check.py PORT OUT"""
import asyncio, json, sys, math
from playwright.async_api import async_playwright
PORT, OUT = sys.argv[1], sys.argv[2]
INIT = """(()=>{const O=window.AudioContext;window.AudioContext=function(...a){const c=new O(...a);const f=c.createDynamicsCompressor.bind(c);c.createDynamicsCompressor=function(){const n=f();window.__last=n;return n};return c};window.AudioContext.prototype=O.prototype;})()"""
MEASURE = """(async (ms) => {
  const c = window.__ne.ctx || null; if (!c || !window.__last) return null;
  if (!window.__an) { window.__an = c.createAnalyser(); __an.fftSize = 4096; __last.connect(__an); }
  await new Promise(r => setTimeout(r, 350));
  const d = new Float32Array(4096), F = new Float32Array(2048); let s = 0, n = 0, cw = 0, cs = 0; const end = performance.now() + ms;
  while (performance.now() < end) { __an.getFloatTimeDomainData(d); for (const x of d) { s += x * x; n++; }
    __an.getFloatFrequencyData(F); for (let k = 1; k < F.length; k++) { const e = Math.pow(10, F[k] / 10); cw += e * k; cs += e; }   // (the tone: the spectrum's centre of mass)
    await new Promise(r => setTimeout(r, 50)); }
  return { rms: Math.sqrt(s / Math.max(1, n)), centroid: cs > 0 ? cw / cs * c.sampleRate / 4096 : 0 };
})"""
async def chord(pg, ms):
    # a chord on the computer keyboard (real key presses: the page's own Musical Typing)
    await pg.mouse.click(5, 5)
    for k in "adg": await pg.keyboard.down(k)
    r = await pg.evaluate(MEASURE + "(" + str(ms) + ")")
    for k in "adg": await pg.keyboard.up(k)
    await pg.wait_for_timeout(2500)
    return r
async def main():
    async with async_playwright() as p:
        b = None
        for _ in range(60):
            try: b = await p.chromium.connect_over_cdp("http://127.0.0.1:" + PORT); break
            except Exception: await asyncio.sleep(1)
        if not b: print("FAIL no app to connect to"); return
        pg = None
        for _ in range(30):
            pgs = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
            if pgs: pg = pgs[0]; break
            await asyncio.sleep(1)
        await pg.context.add_init_script(INIT); await pg.reload(); await pg.wait_for_timeout(2500)
        ev = pg.evaluate; errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        def check(n, ok, info=""): print(("PASS " if ok else "FAIL ") + n + (" · " + str(info) if info != "" else ""), flush=True)
        check("cross-origin isolated (shared memory)", await ev("window.crossOriginIsolated && typeof SharedArrayBuffer === 'function'"))
        check("the native engine is offered (NBEngine)", await ev("!!window.NBEngine"))
        await ev("localStorage.setItem('nightbloom-stackhint','1')")
        try: await pg.click("#startBtn", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(3000)
        st = await ev("window.__ne ? window.__ne.state() : null")
        check("the engine runs and writes ahead of the worklet", bool(st and st["running"] and (st["ahead"] or 0) > 0), st)
        if not st or not st["running"]:
            print("page build:", await ev("window.NB_BUILD")); return
        for eng in ["juno", "saw", "analog", "hoover", "mono", "pluck", "tyrell", "sync", "bells", "vital", "zeb", "choir", "fm"]:
            tab = await ev(f"(() => {{ const t = document.querySelector('.tab[data-engine=\"{eng}\"]'); if (t) t.click(); return !!t; }})()"); await pg.wait_for_timeout(400)
            if not tab: check(eng + ": its tab is there", False); continue
            await ev("window.__ne.set(true)"); await pg.wait_for_timeout(600)
            n0 = (await ev("window.__ne.state()"))["byKind"].get(eng, 0)
            on = await chord(pg, 900)
            n1 = (await ev("window.__ne.state()"))["byKind"].get(eng, 0)
            await ev("window.__ne.set(false)"); await pg.wait_for_timeout(600)
            off = await chord(pg, 900)
            if not on or not off: check(eng + ": measured", False, [on, off]); continue
            db = 20 * math.log10(max(1e-9, on["rms"]) / max(1e-9, off["rms"]))
            ct = on.get("centroid", 0) / max(1e-9, off.get("centroid", 0))
            check(f"{eng}: the tone matches the browser's (the spectrum's centre {on.get('centroid', 0):.0f} Hz vs {off.get('centroid', 0):.0f} Hz)", 0.8 < ct < 1.25)
            check(f"{eng}: the engine played it ({n1 - n0} notes) and the level is within 3 dB of the browser's ({db:+.1f} dB; {on['rms']:.4f} vs {off['rms']:.4f})", n1 - n0 >= 3 and abs(db) <= 3 and off["rms"] > 0.002)
        await ev("window.__ne.set(true)"); await pg.wait_for_timeout(500)
        s = await ev("window.__ne.state()")
        check("no underruns to speak of", s["underruns"] < 100, s["underruns"])
        print("engine:", json.dumps(s))
        check("no page errors", not errs, errs[:3])
asyncio.run(main())
