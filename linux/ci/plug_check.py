"""(177) CI: VST3 and CLAP plugins in the installed app, over its DevTools port. The test plugins (linux/ci/plugtest:
a sine instrument and a gain effect in each format, built in CI) and any others installed (Surge XT) are found by
the scan; an instrument plays alone from the Plugins sheet and is heard; its window opens (a screenshot of the
screen); an effect goes on the whole mix and its Gain, set from Nate Bloom, changes the level; the chain and the
effect's setting come back after a reload. Prints PASS/FAIL lines; never fails the build.
usage: plug_check.py PORT OUT [instrument names to try, comma-separated]"""
import asyncio, json, sys, math, subprocess
from playwright.async_api import async_playwright
PORT, OUT = sys.argv[1], sys.argv[2]
TRY = (sys.argv[3] if len(sys.argv) > 3 else "NB Test Sine,NB Test VSine").split(",")
INIT = """(()=>{const O=window.AudioContext;window.AudioContext=function(...a){const c=new O(...a);const f=c.createDynamicsCompressor.bind(c);c.createDynamicsCompressor=function(){const n=f();window.__last=n;window.__lc=c;return n};return c};window.AudioContext.prototype=O.prototype;})()"""
MEASURE = """(async (ms) => {
  const c = window.__lc; if (!c || !window.__last) return null;
  if (!window.__an || window.__anc !== c) { window.__an = c.createAnalyser(); __an.fftSize = 4096; __last.connect(__an); window.__anc = c; }
  await new Promise(r => setTimeout(r, 300));
  const d = new Float32Array(4096); let s = 0, n = 0; const end = performance.now() + ms;
  while (performance.now() < end) { __an.getFloatTimeDomainData(d); for (const x of d) { s += x * x; n++; } await new Promise(r => setTimeout(r, 50)); }
  return Math.sqrt(s / Math.max(1, n));
})"""
async def chord(pg, ms=900):
    await pg.mouse.click(5, 5)
    for k in "adg": await pg.keyboard.down(k)
    r = await pg.evaluate(MEASURE + "(" + str(ms) + ")")
    for k in "adg": await pg.keyboard.up(k)
    await pg.wait_for_timeout(1200)
    return r or 0
def shot(name):
    try: subprocess.run(["bash", "-c", f"import -window root {OUT}/{name}.png 2>/dev/null || xwd -root -silent | convert xwd:- {OUT}/{name}.png"], timeout=20)
    except Exception as e: print("screenshot:", e)
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
        pg.on("console", lambda m: print("console:", m.type, m.text[:240]) if m.type in ("warning", "error") else None)
        fails = []
        def check(n, ok, info=""):
            print(("PASS " if ok else "FAIL ") + n + (" · " + str(info) if info != "" else ""), flush=True)
            if not ok: fails.append(n)
        check("the plugin host is offered (NBPlug) and the page is " + str(await ev("window.NB_BUILD")), await ev("!!window.NBPlug && !!(window.__nbPlug && window.__nbPlug.ok)"))
        print("page:", await ev("JSON.stringify({ nbw: !!window.__nbw, paint: !!window.__nbPlugPaint, create: !!window.__nbPlugCreate, found: window.__nbPlug && window.__nbPlug.plugins.length, at: window.__nbPlug && window.__nbPlug.at, url: location.href, keys: Object.keys(window.NBPlug || {}).join(' ') })"))
        await ev("localStorage.setItem('nightbloom-stackhint','1'); localStorage.setItem('nightbloom-ui','advanced'); localStorage.removeItem('nightbloom-wam')")
        await pg.reload(); await pg.wait_for_timeout(2500)
        try: await pg.click("#startBtn", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(1500)
        await ev("window.__nbPlug.refresh(true)")
        r = await ev("NBPlug.list()")
        names = sorted(set(f["name"] + " (" + f["fmt"] + ", " + f["kind"] + ")" for f in r["plugins"]))
        check("the scan finds the test plugins", all(any(n.startswith(t + " ") for n in names) for t in ["NB Test Sine", "NB Test Gain", "NB Test VSine", "NB Test VGain", "NB Test LSine", "NB Test LGain"]), names[:40])
        print("couldn't be used:", json.dumps(r["errors"])[:600]); print("found in the page:", await ev("window.__nbPlug.plugins.length"))
        await ev("(async () => { const W = window.__nbPlug; const s = await NBPlug.list(); })()")
        await ev("document.getElementById('wamBtn').click()"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + "/sheet.png", full_page=False)
        sheet = await ev("document.getElementById('wamList').innerText")
        check("the Plugins sheet lists them, with the VST3 and CLAP section", "on this computer" in sheet.lower() and "NB Test Sine" in sheet, sheet[:300].replace("\n", " | "))
        heard = {}
        for nm in TRY:
            nm = nm.strip()
            if not nm: continue
            nm, fmt = (nm.split("#") + [""])[:2]
            # Play alone from its row
            ok = await ev("""(([nm, fmt]) => { const rows = [...document.querySelectorAll('#wamList .wam-row')]; const r = rows.find(x => x.querySelector('b') && x.querySelector('b').firstChild && x.querySelector('b').firstChild.textContent === nm && (!fmt || (x.querySelector('small') || {}).textContent.startsWith(fmt + ' ') || (x.querySelector('small') || {}).textContent.includes(' · ' + fmt + ' ')));
              if (!r) return false; const bt = [...r.querySelectorAll('button')].find(x => x.textContent === 'Play alone'); if (!bt) return false; bt.click(); return true; })""", [nm, fmt])
            if not ok: check(nm + " " + fmt + ": its row has Play alone", False); await ev("document.getElementById('wamBtn').click()"); await pg.wait_for_timeout(600); continue
            await pg.wait_for_timeout(2500)
            lv = await chord(pg, 1200)
            live = await ev("window.__nbPlug.state()")
            lab = nm + (" (" + fmt + ")" if fmt else "")
            heard[lab] = lv
            check(lab + ": plays alone and is heard", lv > 0.003, [round(lv, 4), live])
            # its window
            await ev("document.getElementById('wamBtn').click()"); await pg.wait_for_timeout(600)
            await ev("""(([nm, fmt]) => { const rows = [...document.querySelectorAll('#wamList .wam-row')]; const r = rows.find(x => x.querySelector('b') && x.querySelector('b').firstChild && x.querySelector('b').firstChild.textContent === nm && (!fmt || (x.querySelector('small') || {}).textContent.startsWith(fmt + ' ') || (x.querySelector('small') || {}).textContent.includes(' · ' + fmt + ' ')));
              const bt = r && [...r.querySelectorAll('button')].find(x => x.textContent === 'Controls'); if (bt) bt.click(); return !!bt; })""", [nm, fmt])
            await pg.wait_for_timeout(2500)
            gui = await ev("document.getElementById('wamGuiBox').innerText")
            opened = await ev("window.__nbPlug.state().some(x => x.open)")
            shot("win_" + (nm + "_" + fmt).replace(" ", "_"))
            check(lab + ": its own window opens", opened, gui[:160])
            await ev("[...document.querySelectorAll('#wamGuiBox button')].find(x => x.textContent === 'Close its window').click()"); await pg.wait_for_timeout(600)
            check(lab + ": and closes", not await ev("window.__nbPlug.state().some(x => x.open)"))
            await ev("document.getElementById('wamGuiDone').click()"); await pg.wait_for_timeout(400)
            await ev("document.getElementById('wamBtn').click()"); await pg.wait_for_timeout(600)
        # an effect on the whole mix: its gain set from Nate Bloom halves the level
        await ev("document.getElementById('wamDone').click()"); await pg.wait_for_timeout(300)
        await ev("(() => { const t = document.querySelector('.tab[data-engine=\"juno\"]'); if (t) t.click(); })()"); await pg.wait_for_timeout(600)
        before = await chord(pg)
        key = await ev("(window.__nbw.CAT.find(c => c.native && c.name === 'NB Test Gain') || {}).key")
        F = await ev("(async k => { const F = await window.__nbw.addFx(k, 'mix'); return { name: F.name, on: F.on }; })", key) if key else None
        await pg.wait_for_timeout(1200)
        mid = await chord(pg)
        await ev("""(async () => { const node = [...window.__nbPlug.live.values()].filter(x => x.fx && x.name === 'NB Test Gain').pop().node; const info = await node.getParameterInfo(); const id = Object.keys(info)[0]; await node.setParameterValues({ [id]: { id, value: 0.25, normalized: true } }); })()""")
        await pg.wait_for_timeout(500)
        after = await chord(pg)
        db1 = 20 * math.log10(max(1e-9, mid) / max(1e-9, before)); db2 = 20 * math.log10(max(1e-9, after) / max(1e-9, mid))
        check("NB Test Gain on the mix: the Juno goes through it unchanged (Gain 1)", F and abs(db1) < 1.5 and before > 0.003, [F, round(before, 4), round(mid, 4), round(db1, 2)])
        check("its Gain set to a quarter of its range from Nate Bloom (0.5): about -6 dB", -8 < db2 < -4.5, round(db2, 2))
        await ev("(() => { document.getElementById('wamBtn').click(); })()"); await pg.wait_for_timeout(500)
        await ev("document.getElementById('wamDone').click()"); await pg.wait_for_timeout(1500)   # (Done keeps every plugin's settings)
        # after a reload, the chain and its setting come back
        await pg.reload(); await pg.wait_for_timeout(2500)
        try: await pg.click("#startBtn", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(5000)
        back = await ev("window.__nbPlug.state()")
        await ev("(() => { const t = document.querySelector('.tab[data-engine=\"juno\"]'); if (t) t.click(); })()"); await pg.wait_for_timeout(600)
        again = await chord(pg)
        db3 = 20 * math.log10(max(1e-9, again) / max(1e-9, before))
        check("after a reload NB Test Gain is back on the mix with its setting (-6 dB)", any(x["name"] == "NB Test Gain" for x in back) and -8 < db3 < -4.5, [back, round(db3, 2)])
        print("plugins:", json.dumps(back))
        # (184) a plugin that crashes takes only its own process down: the test sine crashes on note 127
        oop = await ev("!!(window.NBPlug.oop && NBPlug.oop().on)")
        print("each plugin in its own process:", oop)
        live = await ev("[...window.__nbPlug.live.values()].filter(x => x.name === 'NB Test Sine' && !x.fx).map(x => x.id)") if oop else []
        if not oop: pass
        elif not live:
            await ev("(async () => { const k = window.__nbw.CAT.find(c => c.native && c.name === 'NB Test Sine').key; const sp = window.__nbw.spec(k); const inst = await window.__nbPlugCreate(sp, window.__ne.ctx || window.__lc); window.__crashInst = inst; })()")
            await pg.wait_for_timeout(1500)
            live = await ev("[...window.__nbPlug.live.values()].filter(x => x.name === 'NB Test Sine' && !x.fx).map(x => x.id)")
        if not oop: pass
        elif live:
            await ev(f"NBPlug.midi({live[-1]}, Math.round((window.__lc.currentTime + 0.2) * window.__lc.sampleRate), 0x90, 127, 100)")
            await pg.wait_for_timeout(3000)
            st = await ev("window.__nbPlug.state()")
            alive = await ev("1 + 1")
            check("a plugin that crashes takes only its own process down (the page carries on, the plugin shows as crashed)", alive == 2 and any(x.get("crashed") for x in st), st)
        else: check("a plugin that crashes takes only its own process down", False, "no test sine loaded")
        if not oop: print("(the crash test needs each plugin in its own process: the second pass has it)")
        check("no page errors", not errs, errs[:3])
        print("RESULT " + ("OK" if not fails else "FAILED: " + "; ".join(fails)))
asyncio.run(main())
