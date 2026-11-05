"""(235) The installer and the portable .exe as someone downloads them: install silently, check it landed with its
Start menu and desktop shortcuts, open the installed app (at 150% display scaling, the default on many laptops),
screenshot it, close it, uninstall, check it's gone; then open the portable .exe and time it.
usage: install_check.py SETUP.exe PORTABLE.exe OUTDIR"""
import asyncio, glob, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
SETUP, PORT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
res = []
def rep(k, t): print(k, t, flush=True); res.append([k, t])
LAD = os.environ.get("LOCALAPPDATA", ""); APD = os.environ.get("APPDATA", "")
INST = os.path.join(LAD, "Programs", "Nate Bloom")
def kill(): subprocess.run(["taskkill", "/F", "/T", "/IM", "Nate Bloom.exe"], capture_output=True); subprocess.run(["taskkill", "/F", "/T", "/IM", os.path.basename(PORT)], capture_output=True)

async def openit(exe, extra, shot, label):
    env = dict(os.environ, NB_NO_UPDATE="1"); t0 = time.time()
    p = subprocess.Popen([exe, "--remote-debugging-port=9334"] + extra, env=env)
    try:
        async with async_playwright() as pw:
            b = None; pg = None; seen = set()
            for i in range(360):
                try:
                    if b is None or i % 20 == 19:
                        try:
                            if b: await b.close()
                        except Exception: pass
                        b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9334", timeout=5000)
                    ps = [x for c in b.contexts for x in c.pages]
                    for x in ps: seen.add(x.url[:60])
                    ps = [x for x in ps if x.url.startswith("app://")]
                    if ps: pg = ps[0]; break
                except Exception as ex: seen.add("err " + str(ex)[:50]); b = None
                await asyncio.sleep(0.5)
            if not pg: rep("FAIL", label + ": no page after 3 min, seen " + str(sorted(seen)[:5])); return
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.wait_for_function("window.NB_BUILD && document.getElementById('startBtn')", timeout=120000)
            dt = time.time() - t0
            info = await pg.evaluate("({ build: NB_BUILD, version: NB_NATIVE && NB_NATIVE.version, dpr: devicePixelRatio, w: innerWidth, h: innerHeight })")
            try: await pg.click("#startBtn", timeout=4000)
            except Exception: pass
            await pg.wait_for_timeout(3000)
            await pg.screenshot(path=os.path.join(OUT, shot))
            # nothing cut off at this size: no sideways scroll on the page
            ov = await pg.evaluate("document.documentElement.scrollWidth - innerWidth")
            rep("PASS" if dt < 45 else "WARN", "%s opens in %.1f s %s" % (label, dt, info))
            rep("PASS" if ov <= 2 else "WARN", "%s: nothing runs off the side (%d px over)" % (label, ov))
            rep("PASS" if not errs else "FAIL", "%s: no page errors %s" % (label, errs[:3]))
    finally:
        kill(); time.sleep(2)

async def main():
    kill()
    t0 = time.time(); r = subprocess.run([SETUP, "/S"], capture_output=True, timeout=600); t = time.time() - t0
    exe = os.path.join(INST, "Nate Bloom.exe")
    lnk = None
    for _ in range(60):
        if os.path.exists(exe): break
        sm0 = glob.glob(os.path.join(APD, "Microsoft", "Windows", "Start Menu", "Programs", "**", "Nate Bloom*.lnk"), recursive=True)
        if sm0:
            lnk = sm0[0]
            t = subprocess.run(["powershell", "-NoProfile", "-Command", "(New-Object -ComObject WScript.Shell).CreateShortcut('%s').TargetPath" % lnk], capture_output=True, text=True).stdout.strip()
            if t and os.path.exists(t): exe = t; break
        time.sleep(1)
    print("INFO installed exe:", exe, "| Programs:", os.listdir(os.path.join(LAD, "Programs")) if os.path.isdir(os.path.join(LAD, "Programs")) else "none", flush=True)
    rep("PASS" if os.path.exists(exe) else "FAIL", "installer runs silently and installs to %s (%.0f s, exit %d)" % (os.path.dirname(exe), t, r.returncode))
    time.sleep(5); kill()   # (runAfterFinish starts it)
    sm = glob.glob(os.path.join(APD, "Microsoft", "Windows", "Start Menu", "Programs", "**", "Nate Bloom*.lnk"), recursive=True)
    dk = glob.glob(os.path.join(os.path.expanduser("~"), "Desktop", "Nate Bloom*.lnk")) + glob.glob(os.path.join(os.environ.get("PUBLIC", "C:\\Users\\Public"), "Desktop", "Nate Bloom*.lnk"))
    rep("PASS" if sm else "FAIL", "Start menu shortcut " + str(sm[:1]))
    rep("PASS" if dk else "WARN", "desktop shortcut " + str(dk[:1]))
    if os.path.exists(exe):
        await openit(exe, ["--force-device-scale-factor=1.5"], "installed-150pct.png", "installed app at 150% scaling")
        await openit(exe, ["--force-device-scale-factor=1"], "installed-100pct.png", "installed app at 100% scaling")
    un = glob.glob(os.path.join(os.path.dirname(exe), "Uninstall*.exe"))
    if un:
        subprocess.run([un[0], "/S"], capture_output=True, timeout=300)
        for _ in range(60):
            if not os.path.exists(exe): break
            time.sleep(1)
        rep("PASS" if not os.path.exists(exe) else "FAIL", "uninstaller removes it")
    else: rep("FAIL", "no uninstaller found")
    await openit(PORT, [], "portable.png", "portable .exe")
    with open(os.path.join(OUT, "install.json"), "w") as f: json.dump(res, f, indent=1)
asyncio.run(main())
sys.exit(1 if any(k == "FAIL" for k, _ in res) else 0)
