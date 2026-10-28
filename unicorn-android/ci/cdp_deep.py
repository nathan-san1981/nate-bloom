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
# Android's one-time "Viewing full screen" tip takes the Back key while it shows (a grown-up taps Got it once on a
# real tablet); mark it seen so the Back key checks below reach the clock
adb("shell", "settings", "put", "secure", "immersive_mode_confirmations", "confirmed")
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
# the clock unpacks its voice clips at start-up, so read one straight from the app's copy of the page
r = P.ev("""(async()=>{var t=await (await fetch(location.href.split('#')[0])).text();var i=t.indexOf('id="voicePack"');if(i<0)return 'no voice pack in the page';
  var j=t.indexOf('</script>',i),C=JSON.parse(t.slice(t.indexOf('>',i)+1,j)).clips;t=null;
  var k=Object.keys(C)[0],b=atob(C[k]),u=new Uint8Array(b.length);for(var i2=0;i2<b.length;i2++)u[i2]=b.charCodeAt(i2);
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
check("Unicorn Music opens", isinstance(r, int) and r > 40, r)

# ---------- Back key and rotation ----------
P.ev("document.getElementById('btnJokes').click()")
time.sleep(3)
before = P.ev("(document.querySelector('.screen.on')||{}).id")
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(2)
after = P.ev("(document.querySelector('.screen.on')||{}).id")
check("Back key closes the screen that's open (jokes -> clock)", before == "jokes" and after in ("day", "night", "morning"), {"before": before, "after": after})
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(2)
check("Back key on the clock stays on the clock", PKG in top(), top()[:120])

# ---------- older web engines: the flex-gap stand-in spaces buttons out ----------
r = P.ev("""(function(){var shim=document.documentElement.className.indexOf('no-flex-gap')>=0,ok=0,bad=[],n=0;
  var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var e=all[i],cs=getComputedStyle(e);
    if(cs.display!=='flex'||cs.flexDirection!=='row'||cs.flexWrap!=='nowrap')continue;var g=parseFloat(cs.columnGap);if(!(g>0))continue;
    var k=[].filter.call(e.children,function(c){var r=c.getBoundingClientRect();return r.width>0&&getComputedStyle(c).position!=='absolute'});
    if(k.length<2||!e.getClientRects().length)continue;n++;var d=k[1].getBoundingClientRect().left-k[0].getBoundingClientRect().right;
    if(d>=g-1)ok++;else bad.push((e.id||e.className||e.tagName)+':'+Math.round(d)+'/'+g)}
  return {shim:shim,rows:n,spaced:ok,bad:bad.slice(0,6)}})()""")
info(f"flex gap stand-in: {r}")
check("buttons in a row are spaced out on this web engine", isinstance(r, dict) and r.get("rows", 0) > 0 and r.get("spaced", 0) >= r.get("rows", 0) * 0.9, r)
shot("11_clock_spacing")
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
def app_pid():
    return adb("shell", "pidof", PKG).strip().split(" ")[0]


def crash_app():
    pid = app_pid()
    out = adb("shell", "am", "crash", pid)
    return pid, out


P.ev("localStorage.setItem('uc.deep.mark','kept')")
time.sleep(12)
pid0, out = crash_app()
if "Unknown command" in out or "Error" in out:
    info("am crash not available on this Android version: " + out.strip()[:80])
else:
    time.sleep(12)
    back = wait_front(15)
    pid1 = app_pid()
    check("app crash: reopens by itself", back and pid1 and pid1 != pid0, {"top": top()[:100], "pid before": pid0, "pid after": pid1})

# ---------- swiped away from Recents: the app's process is gone, and it still comes back ----------
# kill it while it is out of sight (as Recents does), after it has armed its comeback alarm; if it already
# came back by itself before that moment, try again
gone = False
for attempt in range(3):
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    pid = None
    for _ in range(20):
        time.sleep(0.25)
        if PKG not in top() and re.search(r"#\d+: Alarm\{[^}]*" + re.escape(PKG) + r"\}", adb("shell", "dumpsys", "alarm")):
            pid = app_pid()
            break
    if pid:
        adb("shell", "kill", "-9", pid)   # what clearing it from Recents does (the tests run as root)
        time.sleep(2)
        gone = app_pid() != pid
        break
    wait_front(10)
time.sleep(14)
check("cleared from Recents: comes back by itself", gone and wait_front(10), {"killed": gone, "top": top()[:100]})
P.connect(20)

# ---------- updating over an installed copy keeps her data and reopens ----------
r = adb("install", "-r", "-g", APK, timeout=180)
time.sleep(15)
check("update installs over the current copy", "Success" in r, r.strip()[-80:])
check("opens again by itself after an update", wait_front(15), top()[:120])
P.connect(20)
check("her saved data survives the update", P.ev("localStorage.getItem('uc.deep.mark')") == "kept")

errs = [l for l in adb("logcat", "-d", "-s", "UnicornClock:W").splitlines() if "page:" in l]
check("no page errors logged", not errs, errs[:5])

# ---------- a clock that keeps crashing gives up after 3 tries in 10 minutes (never takes over the tablet) ----------
pid, out = crash_app()
if "Unknown command" in out or "Error" in out:
    info("am crash not available: skipped the crash-loop check")
else:
    seen = []
    for n in range(4):
        time.sleep(11)
        seen.append(PKG in top())
        if n < 3:
            crash_app()
    # crashes 1-3 restart; the 4th (just above, n=2 crash -> 4th overall) must not
    check("keeps crashing: stops reopening after 3 crashes in 10 minutes", seen[:2] == [True, True] and not seen[3],
          {"in front after each crash": seen})
    adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
    check("opening it by hand still works after that", wait_front(20), top()[:120])
print("SUMMARY", sum(1 for _, ok in results if ok), "passed,", sum(1 for _, ok in results if not ok), "failed", flush=True)
