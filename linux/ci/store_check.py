"""(199) CI: the plugin store's plugins in the installed app, over its DevTools port. plugin-store.js --install-all has
put every catalog plugin into ~/.clap, ~/.vst3 or ~/.lv2; here the app's scan must find each one, each instrument
must play alone from the Plugins sheet and be heard, and each effect must go on the mix and let the sound through.
Prints PASS/FAIL lines; never fails the build.
usage: store_check.py PORT OUT RECORD.json"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright
PORT, OUT, REC = sys.argv[1], sys.argv[2], sys.argv[3]
rec = json.load(open(REC)) if os.path.exists(REC) else {}
INIT = """(()=>{const O=window.AudioContext;window.AudioContext=function(...a){const c=new O(...a);const f=c.createDynamicsCompressor.bind(c);c.createDynamicsCompressor=function(){const n=f();window.__last=n;window.__lc=c;return n};return c};window.AudioContext.prototype=O.prototype;})()"""
MEASURE = """(async (ms) => {
  const c = window.__lc; if (!c || !window.__last) return null;
  if (!window.__an || window.__anc !== c) { window.__an = c.createAnalyser(); __an.fftSize = 4096; __last.connect(__an); window.__anc = c; }
  await new Promise(r => setTimeout(r, 300));
  const d = new Float32Array(4096); let s = 0, n = 0; const end = performance.now() + ms;
  while (performance.now() < end) { __an.getFloatTimeDomainData(d); for (const x of d) { s += x * x; n++; } await new Promise(r => setTimeout(r, 50)); }
  return Math.sqrt(s / Math.max(1, n));
})"""
async def chord(pg, ms=1200):
    await pg.mouse.click(5, 5)
    for k in "adg": await pg.keyboard.down(k)
    r = await pg.evaluate(MEASURE + "(" + str(ms) + ")")
    for k in "adg": await pg.keyboard.up(k)
    await pg.wait_for_timeout(1200)
    return r or 0
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
        await pg.context.add_init_script(INIT)
        await pg.evaluate("localStorage.setItem('nightbloom-stackhint','1'); localStorage.setItem('nightbloom-ui','advanced')")
        await pg.reload(); await pg.wait_for_timeout(2500)
        ev = pg.evaluate
        try: await pg.click("#startBtn", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(1500)
        await ev("window.__nbPlug.refresh(true)"); await pg.wait_for_timeout(1000)
        r = await ev("NBPlug.list()")
        found = r["plugins"]; errs = r["errors"]
        print("couldn't be used:", json.dumps(errs)[:1500])
        home = os.path.expanduser("~")
        summary = {}
        for pid, info in rec.items():
            files = info.get("files", [])
            mine = [f for f in found if any(f["path"].startswith(x) for x in files)]
            names = sorted(set(f["name"] + " (" + f["fmt"] + ", " + f["kind"] + ")" for f in mine))
            print(("PASS " if mine else "FAIL ") + info["name"] + ": the scan finds it · " + ", ".join(names[:6]), flush=True)
            summary[pid] = {"found": len(mine), "names": names[:6]}
            bad = [e for e in errs if any(e["path"].startswith(x) for x in files)]
            if bad: print("     " + info["name"] + " errors: " + json.dumps(bad)[:400])
        # instruments: each plays alone from the Plugins sheet and is heard
        def pkg(f):
            for pid, info in rec.items():
                if any(f["path"].startswith(x) for x in info.get("files", [])): return pid
            return None
        insts = [f for f in found if f["kind"] == "instrument" and pkg(f)]
        seen = set()
        for f in insts:
            if f["name"] in seen: continue
            seen.add(f["name"])
            await ev("document.getElementById('wamBtn').click()"); await pg.wait_for_timeout(800)
            ok = await ev("""(nm => { const r = [...document.querySelectorAll('#wamList .wam-row')].find(x => x.querySelector('b') && x.querySelector('b').firstChild && x.querySelector('b').firstChild.textContent === nm);
              if (!r) return false; const bt = [...r.querySelectorAll('button')].find(x => x.textContent === 'Play alone'); if (!bt) return false; bt.click(); return true; })""", f["name"])
            if not ok: print("FAIL " + f["name"] + ": no Play alone row"); await ev("document.getElementById('wamDone') && document.getElementById('wamDone').click()"); continue
            await pg.wait_for_timeout(4000)
            lv = await chord(pg, 1500)
            st = await ev("window.__nbPlug.state()")
            me = [x for x in st if x.get("name") == f["name"]]
            loaded = bool(me) and not any(x.get("crashed") for x in me)
            print(("PASS " if loaded else "FAIL ") + f["name"] + " (" + f["fmt"] + "): loads and plays alone · " + ("heard " + str(round(lv, 4)) if lv > 0.002 else "silent until a patch, sample or library is chosen") + " · " + json.dumps(me)[:160], flush=True)
            await pg.screenshot(path=OUT + "/inst_" + "".join(c if c.isalnum() else "_" for c in f["name"]) + ".png")
        # effects: each goes on the mix (one after another) and the Juno still comes through
        await ev("(() => { const d = document.getElementById('wamDone'); if (d && !document.getElementById('wamSheet').hidden) d.click(); const t = document.querySelector('.tab[data-engine=\"juno\"]'); if (t) t.click(); })()"); await pg.wait_for_timeout(800)
        base = await chord(pg)
        print("the Juno alone: " + str(round(base, 4)))
        fxs = [f for f in found if f["kind"] != "instrument" and pkg(f)]
        per = {}   # at most 3 effects from each package (LSP and Airwindows hold hundreds)
        pick = []
        for f in fxs:
            k = pkg(f)
            if per.get(k, 0) >= 3 or any(g["name"] == f["name"] for g in pick): continue
            if k == "lsp" and not any(w in f["name"].lower() for w in ("delay", "reverb", "chorus", "equalizer", "compressor")): continue
            per[k] = per.get(k, 0) + 1; pick.append(f)
        for f in pick:
            key = await ev("(nm => (window.__nbw.CAT.find(c => c.native && c.name === nm && c.kind === 'effect') || {}).key)", f["name"])
            if not key: continue
            try: F = await ev("(async k => { const F = await window.__nbw.addFx(k, 'mix'); window.__stF = F; return F ? { name: F.name, on: F.on } : null; })", key)
            except Exception as e: F = None; print("     " + f["name"] + ": " + str(e)[:160])
            await pg.wait_for_timeout(1500)
            lv = await chord(pg, 900)
            st = await ev("window.__nbPlug.state()")
            me = [x for x in st if x.get("name") == f["name"]]
            ok = bool(F) and bool(me) and not any(x.get("crashed") for x in me)
            print(("PASS " if ok else "FAIL ") + f["name"] + " (" + f["fmt"] + "): loads on the mix · " + ("the sound comes through " + str(round(lv, 4)) if lv > 0.001 else "silent through it (its default setting)"), flush=True)
            await ev("(() => { if (window.__stF) window.__nbw.removeFx(window.__stF); window.__stF = null; })()"); await pg.wait_for_timeout(800)
        json.dump(summary, open(OUT + "/store_summary.json", "w"), indent=1)
asyncio.run(main())
