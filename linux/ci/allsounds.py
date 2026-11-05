"""(232) Play every sound: each engine, each Nate Bloom preset, each Nate Bloom plugin and its presets, the studio
samples. A note (C4, 0.7 s), then the release: flags silent, clipping, NaN or still sounding 2 s after release.
usage: allsounds.py URL [OUT.json]"""
import asyncio, json, sys, time
from playwright.async_api import async_playwright
URL = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/claude-0/allsounds.json"
MEAS = """async ([ms]) => { const T = window.__nbTest; let pk = 0, rs = 0, n = 0, nan = false; const end = performance.now() + ms;
  while (performance.now() < end) { const l = T.level(); if (l !== l) nan = true; else if (Array.isArray(l)) { pk = Math.max(pk, l[0]); rs += l[1]; n++; } await new Promise(r => setTimeout(r, 30)); }
  return { pk, rms: n ? rs / n : 0, nan }; }"""
async def main():
  async with async_playwright() as p:
    br = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = await br.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    await pg.goto(URL); await pg.wait_for_timeout(3000)
    try: await pg.click("#startBtn", timeout=4000)
    except Exception: pass
    await pg.wait_for_timeout(2500)
    ents = await pg.evaluate("__nbTest.entries().filter(e => /^(e:|n:|w:wam:(natebloom|nathan)\\/|w:nb-)/.test(e.id) && !/^e:(drum|samp|pads)$/.test(e.id)).map(e => [e.id, e.name])")
    print(len(ents), "sounds"); res = []
    for i, (eid, name) in enumerate(ents):
      t0 = time.time()
      try:
        ok = await asyncio.wait_for(pg.evaluate("id => __nbTest.choose(id)", eid), 25)
        await pg.wait_for_timeout(900 if eid.startswith("w:") else 300)
        await pg.evaluate("__nbTest.on(60)"); on = await pg.evaluate(MEAS, [700]); await pg.evaluate("__nbTest.off(60)")
        await pg.wait_for_timeout(2000); tail = await pg.evaluate(MEAS, [300])
        flags = []
        if on["nan"] or tail["nan"]: flags.append("NaN")
        if on["pk"] < 0.003: flags.append("silent")
        if on["pk"] > 0.99: flags.append("clips")
        if tail["rms"] > 0.02 and tail["rms"] > on["rms"] * 0.5: flags.append("still sounding 2 s after release")
        r = {"id": eid, "name": name, "peak": round(on["pk"], 3), "rms": round(on["rms"], 4), "tail": round(tail["rms"], 4), "flags": flags}
      except Exception as e:
        r = {"id": eid, "name": name, "flags": ["error: " + str(e)[:120]]}
      res.append(r)
      if r["flags"]: print("FLAG", r)
    json.dump({"results": res, "errors": errs}, open(OUT, "w"), indent=1)
    bad = [r for r in res if r["flags"]]; print("done", len(res), "flagged", len(bad), "page errors", len(errs))
    await br.close()
asyncio.run(main())
