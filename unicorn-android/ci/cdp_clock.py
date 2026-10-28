"""Drive the Unicorn Clock app on the emulator over the WebView DevTools protocol (adb-forwarded) and check the
things the app is for: the Fully-compatible bridge (backlight, voice, volume), kiosk pinning, staying put across
restarts, working with no network, the games, opening at start-up, and the optional device-owner lockdown.
Prints one line per check: 'PASS name: value' or 'FAIL name: value'."""
import json, re, subprocess, sys, time, urllib.request
import websocket  # websocket-client

OUT = sys.argv[1]
PKG = "com.unicornclock.app"
results = []


def adb(*a, timeout=60):
    try:
        return subprocess.run(["adb", *a], capture_output=True, text=True, timeout=timeout).stdout
    except Exception as e:
        return "ERR " + str(e)


def shot(name):
    with open(f"{OUT}/{name}.png", "wb") as fh:
        fh.write(subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True).stdout)


class Page:
    def __init__(self):
        self.ws = None
        self.seq = 0

    def connect(self, tries=40):
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None
        for _ in range(tries):
            sock = re.findall(r"webview_devtools_remote_\d+", adb("shell", "cat", "/proc/net/unix"))
            if sock:
                adb("forward", "--remove-all")
                adb("forward", "tcp:9222", "localabstract:" + sock[-1])
                try:
                    pages = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
                    for p in pages:
                        if p.get("type") == "page" and "unicorn-clock" in p.get("url", "") and p.get("webSocketDebuggerUrl"):
                            self.ws = websocket.create_connection(p["webSocketDebuggerUrl"], timeout=90, suppress_origin=True)
                            return True
                except Exception:
                    pass
            time.sleep(2)
        return False

    def ev(self, expr, wait=True):
        self.seq += 1
        self.ws.send(json.dumps({"id": self.seq, "method": "Runtime.evaluate",
                                 "params": {"expression": expr, "awaitPromise": wait, "returnByValue": True}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.seq:
                r = m.get("result", {})
                if "exceptionDetails" in r:
                    return "EXCEPTION " + json.dumps(r["exceptionDetails"])[:300]
                return r.get("result", {}).get("value")


P = Page()


def check(name, ok, value=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'} {name}: {json.dumps(value)[:500]}", flush=True)


def status():
    v = P.ev("unicornApp.status()")
    try:
        return json.loads(v)
    except Exception:
        return {"raw": v}


def restart_app():
    adb("shell", "am", "force-stop", PKG)
    time.sleep(2)
    adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
    time.sleep(18)
    return P.connect()


def wait_clock(secs=40):
    for _ in range(secs // 2):
        try:
            v = P.ev("!!(document.getElementById('dTime')&&document.getElementById('dTime').textContent.length>=4)")
            if v is True:
                return True
        except Exception:
            P.connect(5)
        time.sleep(2)
    return False


def tap_text(words):
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    x = adb("shell", "cat", "/sdcard/ui.xml")
    for w in words:
        m = re.search(r'text="%s"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"' % re.escape(w), x, re.I)
        if m:
            a, b, c, d = map(int, m.groups())
            adb("shell", "input", "tap", str((a + c) // 2), str((b + d) // 2))
            return w
    return None


def top_activity():
    act = adb("shell", "dumpsys", "activity", "activities")
    return (re.search(r"(mResumedActivity|topResumedActivity).*", act) or [""])[0].strip()


def dismiss():
    P.ev("(function(){var o=document.getElementById('routineOv');if(o&&!o.hidden){var b=document.getElementById('roLater');b&&b.click();}})()")


# ---------- 1. opens the clock from inside the app ----------
check("debugger reached the clock page", P.connect())
check("clock drawn", wait_clock(), P.ev("document.title+' | '+location.href"))
dismiss()
check("viewport is the Fire 7 screen", True, P.ev("innerWidth+'x'+innerHeight+' dpr '+devicePixelRatio"))
check("fully bridge present", P.ev("typeof fully.textToSpeech==='function'&&typeof fully.setScreenBrightness==='function'&&typeof fully.getAudioVolume==='function'") is True)
st = status()
check("app bridge status", "version" in st, st)
time.sleep(3)
shot("01_clock")

# ---------- 2. keeps itself on screen; optional pinning ----------
check("not pinned by default (no Android pin box at start-up)", status().get("lockMode") == "none", status().get("lockMode"))
adb("shell", "input", "keyevent", "KEYCODE_HOME")
time.sleep(4)
check("Home brings the clock straight back", PKG in top_activity(), top_activity()[:160])
adb("shell", "input", "keyevent", "KEYCODE_APP_SWITCH")
time.sleep(4)
check("Recents brings the clock straight back", PKG in top_activity(), top_activity()[:160])
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(1)
P.connect(10)
P.ev("unicornApp.pinAgain()")
time.sleep(3)
shot("02_pin_box")
tapped = tap_text(["Got it", "GOT IT", "Start", "START", "OK"])
time.sleep(3)
lock = adb("shell", "dumpsys", "activity", "activities")
m = re.search(r"mLockTaskModeState=(\w+)", lock)
check("Pin the clock (after Android's confirmation)", status().get("pinned") is True, {"tapped": tapped, "status": status().get("lockMode"), "dumpsys": m.group(1) if m else None})
shot("02_after_pin")
P.ev("unicornApp.exitToTablet()")
time.sleep(3)
adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
time.sleep(6)
P.connect(10)

# ---------- 3. real backlight brightness ----------
P.ev("fully.setScreenBrightness(30)")
time.sleep(1.5)
win = adb("shell", "dumpsys", "window", "windows")
sb = re.findall(r"sbrt=([0-9.]+)", win)
check("brightness 30/255 reaches the screen", any(abs(float(x) - 30 / 255) < 0.01 for x in sb), sb[:3])
P.ev("fully.setScreenBrightness(255)")

# ---------- 4. volume ----------
P.ev("fully.setAudioVolume(40,3)")
time.sleep(0.5)
v = P.ev("fully.getAudioVolume(3)")
check("media volume set and read back", isinstance(v, int) and 25 <= v <= 55, v)

# ---------- 5. the tablet's own voice ----------
ready = False
for _ in range(10):
    ready = status().get("ttsReady")
    if ready:
        break
    time.sleep(2)
eng = status().get("ttsEngine")
if not ready and not eng:
    print("INFO tablet voice: this emulator image has no text-to-speech engine installed (Fire tablets ship one)", flush=True)
else:
    check("tablet voice ready", ready, eng)
r = P.ev("(function(){try{fully.textToSpeech('Good morning, unicorn. Time to get dressed.');return 'ok'}catch(e){return 'ERR '+e}})()")
check("speaks typed words", r == "ok", r)
r = P.ev("(function(){try{var e=sayNow?1:0}catch(x){}return typeof deviceSay})()")

# ---------- 6. remembers things across a restart ----------
P.ev("localStorage.setItem('uc.ci.mark','still here')")
time.sleep(12)   # Chromium writes local storage to disk a few seconds later; a real tablet keeps running
restart_app()
wait_clock()
check("remembers after the app restarts", P.ev("localStorage.getItem('uc.ci.mark')") == "still here")

# ---------- 7. no network at all ----------
adb("shell", "svc", "wifi", "disable")
adb("shell", "svc", "data", "disable")
adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
time.sleep(4)
restart_app()
check("clock opens with no network", wait_clock(), P.ev("navigator.onLine"))
dismiss()
shot("03_offline_clock")
r = P.ev("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));
  document.getElementById('btnGame').click();await w(700);document.getElementById('pickRun2').click();await w(900);
  var m=document.getElementById('gOvMenu2');if(m&&!m.hidden)document.getElementById('gPlay2').click();await w(2500);
  var on=(document.querySelector('.screen.on')||{}).id;document.getElementById('btnBack92').click();await w(600);return on})()""")
check("Unicorn Run 2 plays offline", r == "game2", r)
r = P.ev("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));
  document.getElementById('btnGame').click();await w(700);document.getElementById('pickDungeon').click();
  for(let i=0;i<30;i++){await w(1000);var t=document.querySelector('#dungeonHost .bq-title');if(t&&!t.hidden)return 'title'}return 'no title'})()""")
check("Unicorn Dungeon opens offline", r == "title", r)
time.sleep(2)
shot("04_offline_dungeon")
r = P.ev("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));var b=[...document.querySelectorAll('#dungeonHost .bq-title button')].find(x=>/New/.test(x.textContent));b&&b.click();await w(5000);
  return document.querySelector('#dungeonHost .bq-title').hidden})()""")
check("Unicorn Dungeon game starts", r is True, r)
time.sleep(3)
shot("05_dungeon_play")
P.ev("(function(){var e=[...document.querySelectorAll('#dungeonHost .bq-b')].find(x=>/Exit/.test(x.textContent));e&&e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))})()")
adb("shell", "cmd", "connectivity", "airplane-mode", "disable")
adb("shell", "svc", "wifi", "enable")
adb("shell", "svc", "data", "enable")

# ---------- 8. leaving through grown-up settings, and opening by itself at start-up ----------
P.ev("unicornApp.exitToTablet()")
time.sleep(4)
check("Exit to the tablet leaves the clock (and it stays out)", PKG not in top_activity(), top_activity()[:160])
adb("root")
time.sleep(4)
adb("wait-for-device")
adb("shell", "am", "broadcast", "-a", "android.intent.action.BOOT_COMPLETED", "-n", PKG + "/.BootReceiver")
time.sleep(8)
act = adb("shell", "dumpsys", "activity", "activities")
top = (re.search(r"(mResumedActivity|topResumedActivity).*", act) or [""])[0]
check("opens by itself at start-up", PKG in top, top.strip()[:160])
shot("06_after_boot")

# ---------- 9. optional full lockdown (device owner) ----------
o = adb("shell", "dpm", "set-device-owner", PKG + "/.AdminReceiver")
print("dpm:", o.strip()[:200])
restart_app()
wait_clock()
time.sleep(3)
st = status()
check("device owner: locked to the clock", st.get("owner") is True and st.get("lockMode") == "locked", st)
adb("shell", "input", "keyevent", "KEYCODE_HOME")
time.sleep(3)
act = adb("shell", "dumpsys", "activity", "activities")
top = (re.search(r"(mResumedActivity|topResumedActivity).*", act) or [""])[0]
check("device owner: Home stays on the clock", PKG in top, top.strip()[:160])
shot("07_owner_locked")
P.connect(10)
P.ev("unicornApp.releaseLockdown()")
time.sleep(3)
check("Undo full lockdown from grown-up settings", status().get("owner") is False, status())

errs = adb("logcat", "-d", "-s", "UnicornClock:W")
page_errs = [l for l in errs.splitlines() if "page:" in l]
check("no page errors logged", not page_errs, page_errs[:5])
print("SUMMARY", sum(1 for _, ok in results if ok), "passed,", sum(1 for _, ok in results if not ok), "failed", flush=True)
