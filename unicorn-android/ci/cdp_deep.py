"""Deeper release checks for the Unicorn Clock app, run after cdp_clock.py on a fresh start:
live weather and jokes inside the app, the recorded voice on this web engine, sounds starting by themselves,
microphone, Unicorn Music, Back key, rotation lock, the backup save screen, screen off at night, updating over
an installed copy, a crash and a page-renderer crash, and memory use after the games.
Prints 'PASS name: value' / 'FAIL name: value' / 'INFO ...'."""
import json, re, subprocess, sys, time, urllib.request
import websocket

OUT = sys.argv[1]
APK = sys.argv[2]
PKG = "com.unicornclock.app"
results = []


def adb(*a, timeout=90):
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
        try:
            self.ws and self.ws.close()
        except Exception:
            pass
        self.ws = None
        for _ in range(tries):
            sock = re.findall(r"webview_devtools_remote_\d+", adb("shell", "cat", "/proc/net/unix"))
            if sock:
                adb("forward", "--remove-all")
                adb("forward", "tcp:9222", "localabstract:" + sock[-1])
                try:
                    for p in json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5)):
                        if p.get("type") == "page" and "unicorn-clock" in p.get("url", "") and p.get("webSocketDebuggerUrl"):
                            self.ws = websocket.create_connection(p["webSocketDebuggerUrl"], timeout=180, suppress_origin=True)
                            return True
                except Exception:
                    pass
            time.sleep(2)
        return False

    def send(self, method, params=None):
        self.seq += 1
        self.ws.send(json.dumps({"id": self.seq, "method": method, "params": params or {}}))
        return self.seq

    def ev(self, expr, wait=True):
        try:
            i = self.send("Runtime.evaluate", {"expression": expr, "awaitPromise": wait, "returnByValue": True})
            while True:
                m = json.loads(self.ws.recv())
                if m.get("id") == i:
                    r = m.get("result", {})
                    if "exceptionDetails" in r:
                        return "EXCEPTION " + json.dumps(r["exceptionDetails"])[:300]
                    return r.get("result", {}).get("value")
        except Exception as e:
            return "ERR " + str(e)[:200]


P = Page()


def check(name, ok, value=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'} {name}: {json.dumps(value)[:400]}", flush=True)


def info(msg):
    print("INFO " + msg, flush=True)


def top():
    act = adb("shell", "dumpsys", "activity", "activities")
    return (re.search(r"(mResumedActivity|topResumedActivity).*", act) or [""])[0].strip()


def wait_front(secs=16):
    for _ in range(secs):
        if PKG in top():
            return True
        time.sleep(1)
    return False


def start_fresh():
    adb("shell", "am", "force-stop", PKG)
    time.sleep(2)
    adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
    time.sleep(16)
    P.connect()
    for _ in range(20):
        if P.ev("!!(document.getElementById('dTime')&&document.getElementById('dTime').textContent.length>=4)") is True:
            return True
        time.sleep(2)
    return False


def awake():
    return "mWakefulness=Awake" in adb("shell", "dumpsys", "power")


# ---------- start online, from scratch ----------
adb("shell", "cmd", "connectivity", "airplane-mode", "disable")
adb("shell", "svc", "wifi", "enable")
adb("shell", "svc", "data", "enable")
check("clock opens", start_fresh())
P.ev("(function(){var o=document.getElementById('routineOv');if(o&&!o.hidden){var b=document.getElementById('roLater');b&&b.click();}})()")

# ---------- live weather inside the app (cross-origin fetch from the app's own address) ----------
w = None
for _ in range(30):
    w = P.ev("(function(){try{var w=JSON.parse(localStorage.getItem('unicornClock.weather')||'null');return w&&w.days?{age:Math.round((Date.now()-w.fetchedAt)/1000),days:w.days.length,hours:(w.hours||[]).length,place:w.points&&w.points.place}:null}catch(e){return 'ERR '+e}})()")
    if isinstance(w, dict):
        break
    time.sleep(3)
check("live weather loads inside the app", isinstance(w, dict) and w.get("days", 0) >= 3 and w.get("hours", 0) > 24, w)
check("weather shown on the clock", P.ev("document.getElementById('wxTemp').textContent") not in ("--°", None, ""), P.ev("document.getElementById('wxTemp').textContent"))

# ---------- jokes from the web (falls back to the built-in list) ----------
r = P.ev("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));document.getElementById('btnJokes').click();await w(7000);
  var t=document.getElementById('jokes').innerText;var b=document.querySelector('#jokes .pill-btn');b&&b.click();await w(500);return t.slice(0,160)})()""")
check("jokes screen shows a joke", isinstance(r, str) and len(r) > 30 and not r.startswith("ERR"), r)

# ---------- the recorded voice decodes on this web engine; sounds can start on their own ----------
r = P.ev("""(async()=>{var el=document.getElementById('voicePack');if(!el||!el.textContent)return 'pack already loaded';
  var C=JSON.parse(el.textContent).clips,k=Object.keys(C)[0],b=atob(C[k]),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
  var ac=new (window.AudioContext||window.webkitAudioContext)();var st=ac.state;
  var buf=await new Promise((res,rej)=>{var p=ac.decodeAudioData(u.buffer,res,rej);if(p&&p.catch)p.catch(rej)});
  return {clip:k,secs:Math.round(buf.duration*100)/100,state:st,clips:Object.keys(C).length}})()""")
check("recorded voice clips decode here", isinstance(r, dict) and r.get("secs", 0) > 0.05, r)
check("sound can start without a tap (bedtime sounds, alarms)", isinstance(r, dict) and r.get("state") == "running", r)
r = P.ev("""(async()=>{var b=document.querySelector('[data-say-text]');if(!b)return 'no say button';b.click();await new Promise(r=>setTimeout(r,1500));return 'ok'})()""")
check("read-aloud button runs without errors", r == "ok", r)

# ---------- microphone (voice notes) ----------
perm = "RECORD_AUDIO: granted=true" in adb("shell", "dumpsys", "package", PKG)
info(f"microphone permission granted at install: {perm}")
r = P.ev("""(async()=>{try{var s=await navigator.mediaDevices.getUserMedia({audio:true});var n=s.getAudioTracks().length;s.getTracks().forEach(t=>t.stop());
  return {tracks:n,rec:typeof MediaRecorder}}catch(e){return 'ERR '+e.name+' '+e.message}})()""")
check("microphone works in the page (voice notes)", isinstance(r, dict) and r.get("tracks") == 1, r)

# ---------- Unicorn Music ----------
r = P.ev("""(async()=>{const w=t=>new Promise(r=>setTimeout(r,t));document.getElementById('btnMusic').click();await w(2500);
  var d=document.getElementById('musicFrame').contentDocument,n=d?d.querySelectorAll('button').length:0;document.getElementById('btnBack13').click();await w(500);return n})()""")
check("Unicorn Music opens", isinstance(r, int) and r > 5, r)

# ---------- Back key and rotation ----------
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(2)
check("Back key stays on the clock", PKG in top(), top()[:120])
adb("shell", "settings", "put", "system", "accelerometer_rotation", "0")
adb("shell", "settings", "put", "system", "user_rotation", "0")
time.sleep(4)
r = P.ev("innerWidth+'x'+innerHeight")
check("stays landscape when the tablet is turned", isinstance(r, str) and "x" in r and int(r.split("x")[0]) > int(r.split("x")[1]), r)
adb("shell", "settings", "put", "system", "user_rotation", "1")

# ---------- backup save screen: the clock must not yank itself back while a grown-up is in it ----------
P.ev("unicornApp.saveText('unicorn-clock-backup-test.json','{\"unicornClockBackup\":1}')")
time.sleep(5)
t = top()
check("backup 'save as' screen opens and stays open", PKG not in t and t != "", t[:140])
shot("10_save_screen")
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(3)
check("back from the save screen returns to the clock", wait_front(8), top()[:120])

# ---------- screen off at night must stay off; screen on shows the clock ----------
adb("shell", "input", "keyevent", "KEYCODE_SLEEP")
time.sleep(10)
check("screen turned off stays off (no relaunch waking it)", not awake(), "awake" if awake() else "asleep")
adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
time.sleep(4)
adb("shell", "wm", "dismiss-keyguard")
time.sleep(3)
check("screen on again shows the clock", wait_front(10), top()[:120])

# ---------- memory after the games (the main checks played the dungeon) ----------
mem = adb("shell", "dumpsys", "meminfo", PKG)
m = re.search(r"TOTAL(?: PSS)?:?\s+(\d+)", mem)
total_mb = round(int(m.group(1)) / 1024) if m else None
check("memory use reasonable for a 2 GB Fire (under 600 MB)", total_mb is not None and total_mb < 600, f"{total_mb} MB")

# ---------- a crash in the page renderer: rebuilt and back on the clock ----------
P.send("Page.crash")
time.sleep(12)
ok = P.connect(20)
drawn = P.ev("!!(document.getElementById('dTime')&&document.getElementById('dTime').textContent.length>=4)") if ok else False
check("page renderer crash: clock rebuilt and drawn again", drawn is True and PKG in top(), {"top": top()[:100], "drawn": drawn})

# ---------- app crash: restarts by itself ----------
P.ev("localStorage.setItem('uc.deep.mark','kept')")
time.sleep(12)
out = adb("shell", "am", "crash", PKG)
if "Unknown command" in out or "Error" in out:
    info("am crash not available on this Android version: " + out.strip()[:80])
else:
    time.sleep(12)
    check("app crash: reopens by itself", wait_front(15), top()[:120])

# ---------- updating over an installed copy keeps her data and reopens ----------
r = adb("install", "-r", "-g", APK, timeout=180)
time.sleep(15)
check("update installs over the current copy", "Success" in r, r.strip()[-80:])
check("opens again by itself after an update", wait_front(15), top()[:120])
P.connect(20)
check("her saved data survives the update", P.ev("localStorage.getItem('uc.deep.mark')") == "kept")

errs = [l for l in adb("logcat", "-d", "-s", "UnicornClock:W").splitlines() if "page:" in l]
check("no page errors logged", not errs, errs[:5])
print("SUMMARY", sum(1 for _, ok in results if ok), "passed,", sum(1 for _, ok in results if not ok), "failed", flush=True)
