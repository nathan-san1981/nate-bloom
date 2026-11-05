"""(235) Windows QA audit. Runs the real app on a GitHub Windows machine and checks it the way a person would use it.
usage: audit.py EXE MODE OUTDIR      MODE = normal | min
  min: the app and everything it starts are held to 2 CPU cores, about 1.5 cores' worth of time, 3 GB of memory (a 4 GB
  computer with Windows' own share taken), no graphics card (software drawing), and told the computer has 4 GB.
Checks: startup time, the page is the Windows one, sound starts, a note sounds, every sound plays (silent / NaN /
errors), the audio keeps up under a big chord (audio clock vs wall clock, underruns where Chrome reports them), every
tab opens without a page error, memory used, screenshots. Prints PASS/FAIL/WARN/INFO lines and writes OUTDIR/result.json."""
import asyncio, ctypes, json, os, subprocess, sys, time
from ctypes import wintypes
import psutil
from playwright.async_api import async_playwright

EXE, MODE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
R = {"mode": MODE, "checks": [], "info": {}}
def rep(kind, text):
    print(kind, text, flush=True); R["checks"].append([kind, text])

# ---- the min-spec box: a Windows job object around the app and every process it starts ----
k32 = ctypes.WinDLL("kernel32", use_last_error=True)
class IO_COUNTERS(ctypes.Structure):
    _fields_ = [(n, ctypes.c_ulonglong) for n in ("r", "w", "o", "rb", "wb", "ob")]
class BASIC(ctypes.Structure):
    _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong), ("PerJobUserTimeLimit", ctypes.c_longlong), ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t), ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]
class EXT(ctypes.Structure):
    _fields_ = [("Basic", BASIC), ("Io", IO_COUNTERS), ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]
class CPURATE(ctypes.Structure):
    _fields_ = [("ControlFlags", wintypes.DWORD), ("CpuRate", wintypes.DWORD)]
k32.CreateJobObjectW.restype = wintypes.HANDLE
k32.OpenProcess.restype = wintypes.HANDLE
JOB = None
def box(pid):
    global JOB
    JOB = k32.CreateJobObjectW(None, None)
    e = EXT(); ncpu = os.cpu_count() or 4
    e.Basic.LimitFlags = 0x200 | 0x10 | 0x2000    # job memory, affinity, kill on close
    e.Basic.Affinity = 0b11; e.JobMemoryLimit = 3 * 1024 ** 3
    if not k32.SetInformationJobObject(JOB, 9, ctypes.byref(e), ctypes.sizeof(e)): rep("WARN", "job limits not set (%d)" % ctypes.get_last_error())
    c = CPURATE(); c.ControlFlags = 0x1 | 0x4; c.CpuRate = int(10000 * 1.5 / ncpu)   # enabled, hard cap: 1.5 cores of this machine
    if not k32.SetInformationJobObject(JOB, 15, ctypes.byref(c), ctypes.sizeof(c)): rep("WARN", "CPU cap not set (%d)" % ctypes.get_last_error())
    h = k32.OpenProcess(0x1F0FFF, False, pid)
    if not k32.AssignProcessToJobObject(JOB, h): rep("WARN", "app not put in the job (%d)" % ctypes.get_last_error())
    R["info"]["box"] = {"cores": 2, "cpu_cap_cores": 1.5, "memory_gb": 3, "machine_cores": ncpu}
def job_peak():
    if not JOB: return None
    e = EXT(); n = wintypes.DWORD()
    k32.QueryInformationJobObject(JOB, 9, ctypes.byref(e), ctypes.sizeof(e), ctypes.byref(n))
    return round(e.PeakJobMemoryUsed / 1048576)

def tree_mb(p):
    try:
        ps = [p] + p.children(recursive=True); return round(sum(x.memory_info().rss for x in ps if x.is_running()) / 1048576)
    except Exception: return None
def kill_all():
    subprocess.run(["taskkill", "/F", "/T", "/IM", os.path.basename(EXE)], capture_output=True)

MEAS = """async ([ms]) => { const T = window.__nbTest; let pk = 0, n = 0, nan = false; const end = performance.now() + ms;
  while (performance.now() < end) { const l = T.level(); if (l !== l) nan = true; else if (Array.isArray(l)) { pk = Math.max(pk, l[0]); n++; } await new Promise(r => setTimeout(r, 30)); }
  return { pk, nan }; }"""
KEEPUP = """async ([notes, ms]) => { const T = window.__nbTest; const lt = []; let po;
  try { po = new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(e.duration))); po.observe({ type: "longtask", buffered: false }); } catch (e) {}
  const st0 = ctx.playbackStats ? { ...JSON.parse(JSON.stringify(ctx.playbackStats)) } : null;
  notes.forEach(n => T.on(n)); await new Promise(r => setTimeout(r, 300));
  const a0 = ctx.currentTime, w0 = performance.now(); let pk = 0;
  while (performance.now() - w0 < ms) { const l = T.level(); if (Array.isArray(l)) pk = Math.max(pk, l[0]); await new Promise(r => setTimeout(r, 50)); }
  const a1 = ctx.currentTime, w1 = performance.now(); notes.forEach(n => T.off(n)); try { po && po.disconnect(); } catch (e) {}
  const st1 = ctx.playbackStats ? JSON.parse(JSON.stringify(ctx.playbackStats)) : null;
  return { audio_s: a1 - a0, wall_s: (w1 - w0) / 1000, pk, longtasks: lt.length, longest: lt.length ? Math.max(...lt) : 0,
    base: ctx.baseLatency, out: ctx.outputLatency, sr: ctx.sampleRate, stats0: st0, stats1: st1 }; }"""

async def main():
    env = dict(os.environ, NB_NO_UPDATE="1")
    args = [EXE, "--remote-debugging-port=9333"]
    if MODE == "min":
        env["NB_TOTALMEM_MB"] = "4096"
        args += ["--disable-gpu", "--disable-gpu-compositing"]
    t0 = time.time()
    p = subprocess.Popen(args, env=env)
    if MODE == "min": box(p.pid)
    pp = psutil.Process(p.pid)
    try:
        async with async_playwright() as pw:
            b = None
            for _ in range(90):
                try: b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9333"); break
                except Exception: await asyncio.sleep(1)
            if not b: rep("FAIL", "the app's page never came up"); return
            pg = None
            for _ in range(60):
                ps = [x for c in b.contexts for x in c.pages if x.url.startswith("app://")]
                if ps: pg = ps[0]; break
                await asyncio.sleep(0.5)
            if not pg: rep("FAIL", "no app:// page"); return
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:240]))
            cons = []; pg.on("console", lambda m: cons.append(m.text[:200]) if m.type == "error" else None)
            await pg.wait_for_function("window.NB_BUILD && document.getElementById('startBtn')", timeout=120000)
            ready = time.time() - t0; R["info"]["startup_s"] = round(ready, 1)
            rep("PASS" if ready < 20 else "WARN" if ready < 45 else "FAIL", "the app opens in %.1f s" % ready)
            r = await pg.evaluate("({ platform: NB_NATIVE && NB_NATIVE.platform, version: NB_NATIVE && NB_NATIVE.version, build: NB_BUILD, yours: window.NB_YOURS, ua: navigator.userAgent, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, w: innerWidth, h: innerHeight, dpr: devicePixelRatio })")
            R["info"]["page"] = r; print("INFO", r)
            rep("PASS" if r["platform"] == "windows" else "FAIL", "the page knows it's on Windows")
            rep("PASS" if r["yours"] is False else "FAIL", "set up for anyone (not Nathan's gear)")
            try: gl = await pg.evaluate("(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 'none'; const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl'; })()")
            except Exception as e: gl = "error " + str(e)[:80]
            R["info"]["graphics"] = gl; print("INFO graphics", gl)
            await pg.screenshot(path=os.path.join(OUT, "1-start.png"))
            try: await pg.click("#startBtn", timeout=5000)
            except Exception: pass
            await pg.wait_for_timeout(3000)
            st = await pg.evaluate("ctx ? ctx.state : 'none'")
            rep("PASS" if st == "running" else "FAIL", "sound starts (audio " + str(st) + ")")
            a = await pg.evaluate("(() => { const T = window.__nbTest; T.on(60); return new Promise(res => setTimeout(() => { const l = T.level(); T.off(60); res(l); }, 800)); })()")
            rep("PASS" if isinstance(a, list) and a[0] > 0.003 else "FAIL", "a note sounds (peak %s)" % (a[0] if isinstance(a, list) else a))
            R["info"]["mem_after_start_mb"] = tree_mb(pp)
            await pg.screenshot(path=os.path.join(OUT, "2-ready.png"))

            # the audio keeping up: a big chord on the default sound, then on the heaviest kinds of sound
            heavy = await pg.evaluate("""(() => { const E = __nbTest.entries(); const pick = re => (E.find(e => re.test(e.id)) || {}).id; return [pick(/^e:supersaw$/) || pick(/^e:/), pick(/^w:wam:natebloom\\/(twin77|nebula80|hypnagogia)/), pick(/^w:wam:natebloom\\//)].filter(Boolean); })()""")
            ku = []
            for hid in heavy:
                await pg.evaluate("id => __nbTest.choose(id)", hid); await pg.wait_for_timeout(1500)
                k = await pg.evaluate(KEEPUP, [[48, 55, 60, 64, 67, 71, 72, 76], 8000]); k["sound"] = hid; ku.append(k)
                ratio = k["audio_s"] / k["wall_s"] if k["wall_s"] else 0
                und = None
                if k.get("stats1") and k.get("stats0"):
                    und = (k["stats1"].get("underrunEvents") or 0) - (k["stats0"].get("underrunEvents") or 0)
                kind = "PASS" if ratio > 0.985 and (und is None or und <= 2) else "WARN" if ratio > 0.95 else "FAIL"
                rep(kind, "8-note chord on %s for 8 s: audio clock %.1f%% of real time%s, %d long main-thread stalls (longest %d ms), peak %.2f" % (
                    hid, ratio * 100, "" if und is None else ", %d underruns" % und, k["longtasks"], k["longest"], k["pk"]))
                await pg.wait_for_timeout(1500)
            R["info"]["keepup"] = ku

            # every sound
            ents = await pg.evaluate("__nbTest.entries().filter(e => /^(e:|n:|w:wam:(natebloom|nathan)\\/|w:nb-)/.test(e.id) && !/^e:(drum|samp|pads)$/.test(e.id)).map(e => [e.id, e.name])")
            bad, slow, e0 = [], [], len(errs)
            for eid, name in ents:
                t1 = time.time()
                try:
                    await asyncio.wait_for(pg.evaluate("id => __nbTest.choose(id)", eid), 40)
                    await pg.wait_for_timeout(900 if eid.startswith("w:") else 300)
                    await pg.evaluate("__nbTest.on(60)"); on = await pg.evaluate(MEAS, [700]); await pg.evaluate("__nbTest.off(60)")
                    if on["nan"]: bad.append(name + " NaN")
                    elif on["pk"] < 0.003: bad.append(name + " silent")
                    await pg.wait_for_timeout(400)
                except Exception as ex: bad.append(name + " error " + str(ex)[:80])
                dt = time.time() - t1
                if dt > 6: slow.append("%s %.0fs" % (name, dt))
            R["info"]["sounds"] = {"n": len(ents), "bad": bad, "slow": slow}
            rep("PASS" if not bad else "FAIL", "every sound plays: %d sounds, %d problems %s" % (len(ents), len(bad), bad[:8]))
            if slow: rep("WARN", "slow to load: " + ", ".join(slow[:10]))
            R["info"]["mem_after_sounds_mb"] = tree_mb(pp)

            # every tab
            await pg.keyboard.press("Escape")
            names = ["Play", "Build", "Settings", "Sounds", "Beats", "Rhythm", "Samples", "Songs", "Tracks", "DJ", "Keys", "Seq", "Notes", "Mix", "Synths", "Drums", "Garage"]
            opened, e1 = [], len(errs)
            for i, nm in enumerate(names):
                try:
                    loc = pg.get_by_role("button", name=nm, exact=True)
                    if await loc.count() == 0: continue
                    el = loc.first
                    if not await el.is_visible(): continue
                    await el.click(timeout=3000); await pg.wait_for_timeout(700); opened.append(nm)
                    await pg.keyboard.press("Escape")
                    if nm in ("Build", "Synths", "DJ", "Mix", "Settings"): await pg.screenshot(path=os.path.join(OUT, "tab-%02d-%s.png" % (i, nm)))
                except Exception: pass
            R["info"]["tabs"] = opened
            rep("PASS" if len(opened) >= 5 else "WARN", "tabs opened: " + ", ".join(opened))
            mem = tree_mb(pp); R["info"]["mem_end_mb"] = mem; R["info"]["job_peak_mb"] = job_peak()
            lim = 3072 if MODE == "min" else 8192
            rep("PASS" if mem and mem < lim * 0.8 else "WARN", "memory in use at the end: %s MB (all of the app's processes)%s" % (mem, "" if not JOB else ", peak %s MB of the 3072 MB box" % job_peak()))
            rep("PASS" if not errs else "FAIL", "no page errors (%d) %s" % (len(errs), errs[:4]))
            R["info"]["console_errors"] = cons[:30]
            rep("PASS" if p.poll() is None else "FAIL", "the app is still running at the end")
    finally:
        with open(os.path.join(OUT, "result.json"), "w") as f: json.dump(R, f, indent=1)
        kill_all()
asyncio.run(main())
