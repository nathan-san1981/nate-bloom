"""(205) CI: what the doorways can load. For Surge XT, Dexed, Odin 2 and Shortcircuit XT (installed by plugin-store.js):
what their data folders hold, and for Surge XT whether a factory patch (.fxp) given to the plugin as its state loads
and plays (whole file, and without the 60-byte fxp header). Prints INFO/PASS/FAIL lines.
usage: doorway_probe.py PORT OUT"""
import asyncio, base64, json, os, sys
from playwright.async_api import async_playwright
PORT, OUT = sys.argv[1], sys.argv[2]
SHARE = os.path.expanduser("~/.local/share")

def listing():
    for d in sorted(os.listdir(SHARE)) if os.path.isdir(SHARE) else []:
        if not any(k in d.lower() for k in ("surge", "dexed", "odin", "shortcircuit", "geonkick", "sfizz")): continue
        n, cats = 0, {}
        for root, _, files in os.walk(os.path.join(SHARE, d)):
            for f in files:
                n += 1; rel = os.path.relpath(root, os.path.join(SHARE, d)); cats.setdefault(rel, []).append(f)
        print("INFO share", d, n, "files")
        for k in sorted(cats)[:60]: print("INFO   ", d + "/" + k, len(cats[k]), "e.g.", ", ".join(sorted(cats[k])[:6]))

PROBE = """async ([state, label]) => {
  const W = window.__nbPlug, spec = W.plugins.filter(p => /surge.?xt/i.test(p.name) && p.kind === 'instrument').sort((a, b) => (a.fmt === 'clap' ? 0 : 1) - (b.fmt === 'clap' ? 0 : 1))[0];
  if (!spec) return { err: 'no Surge XT' };
  const c = window.__nfp.ctx(), sp = window.__nbPlugSpec('vst:' + spec.fmt + ':' + (spec.uid || '') + '@' + spec.path) || null;
  const key = W.plugins.indexOf(spec) >= 0 ? null : null;
  const s2 = Object.assign({}, sp || {}, { key: 'vst:' + spec.fmt + ':' + (spec.uid || '') + '@' + spec.path, fmt: spec.fmt, path: spec.path, uid: spec.uid, name: spec.name });
  const inst = await window.__nbPlugCreate(s2, c), n = inst.audioNode;
  const an = c.createAnalyser(); an.fftSize = 4096; n.connect(an);
  const before = await n.getParameterValues(true);
  let ok = null; if (state) { try { await n.setState({ nbplug: 1, fmt: spec.fmt, uid: spec.uid, state }); ok = true; } catch (e) { ok = String(e); } }
  await new Promise(r => setTimeout(r, 600));
  const after = await n.getParameterValues(true); let changed = 0; for (const k in after) if (before[k] && Math.abs(after[k].value - before[k].value) > 1e-4) changed++;
  const t = c.currentTime + 0.1; n.scheduleEvents({ type: 'wam-midi', time: t, data: { bytes: [0x90, 60, 100] } }); n.scheduleEvents({ type: 'wam-midi', time: t + 0.8, data: { bytes: [0x80, 60, 0] } });
  const d = new Float32Array(4096); let s = 0, k = 0; const end = performance.now() + 1100; await new Promise(r => setTimeout(r, 120));
  while (performance.now() < end) { an.getFloatTimeDomainData(d); for (const x of d) { s += x * x; k++; } await new Promise(r => setTimeout(r, 40)); }
  const st = await n.getState(); try { n.destroy(); } catch (e) {}
  return { fmt: spec.fmt, set: ok, changed, rms: Math.sqrt(s / Math.max(1, k)), stateLen: st && st.state ? st.state.length : 0, head: st && st.state ? atob(st.state).slice(0, 12).replace(/[^\\x20-\\x7e]/g, '.') : '' };
}"""

async def main():
    listing()
    pats = []
    base = os.path.join(SHARE, "surge-xt", "patches_factory")
    for root, _, files in os.walk(base):
        for f in sorted(files):
            if f.endswith(".fxp"): pats.append(os.path.join(root, f))
    want = [p for p in pats if "/Plucks/" in p][:1] + [p for p in pats if "/Bells" in p or "/Keys/" in p][:1] + [p for p in pats if "/Vox" in p or "/Vocal" in p or "/Formant" in p][:1]
    print("INFO surge patches", len(pats), "categories", sorted({os.path.basename(os.path.dirname(p)) for p in pats})[:60])
    async with async_playwright() as p:
        b = None
        for _ in range(30):
            try: b = await p.chromium.connect_over_cdp("http://127.0.0.1:" + PORT); break
            except Exception: await asyncio.sleep(1)
        if not b: print("FAIL no app"); return
        pg = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")][0]
        try: await pg.click("#startBtn", timeout=3000)
        except Exception: pass
        await pg.wait_for_timeout(2000)
        for f in [None] + want:
            raw = open(f, "rb").read() if f else b""
            for label, data in ([("default", None)] if not f else [("whole fxp", raw), ("fxp minus 60", raw[60:])]):
                try:
                    r = await asyncio.wait_for(pg.evaluate(PROBE, [base64.b64encode(data).decode() if data else None, label]), 60)
                except Exception as e: r = {"err": str(e)[:200]}
                print("INFO surge", os.path.basename(f) if f else "-", label, json.dumps(r))
        if raw: print("INFO fxp head", raw[:64])

asyncio.run(main())
