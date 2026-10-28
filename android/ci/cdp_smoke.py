"""Drive the app's WebView over the DevTools protocol (adb-forwarded) and check what the app adds.
Prints one line per check; the screenshots are taken by smoke.sh between steps it asks for."""
import json, sys, time, subprocess, urllib.request
import websocket  # websocket-client

OUT = sys.argv[1]

def adb(*a):
    return subprocess.run(["adb", *a], capture_output=True, text=True).stdout

def shot(name):
    with open(f"{OUT}/{name}.png", "wb") as fh:
        fh.write(subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True).stdout)

def page_ws():
    for _ in range(60):
        try:
            pages = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
            for p in pages:
                if p.get("type") == "page" and p.get("webSocketDebuggerUrl"):
                    return p["webSocketDebuggerUrl"]
        except Exception as e:
            pass
        time.sleep(2)
    raise SystemExit("no WebView page to debug")

ws = websocket.create_connection(page_ws(), timeout=60, suppress_origin=True)
seq = 0
def ev(expr, wait=True):
    global seq
    seq += 1
    ws.send(json.dumps({"id": seq, "method": "Runtime.evaluate", "params": {"expression": expr, "awaitPromise": wait, "returnByValue": True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == seq:
            r = m.get("result", {})
            if "exceptionDetails" in r: return "EXCEPTION " + json.dumps(r["exceptionDetails"])[:300]
            return r.get("result", {}).get("value")

def check(name, expr):
    v = ev(expr)
    print(f"{name}: {json.dumps(v)[:400]}", flush=True)
    return v

# the emulator's network can come up after the app has opened on its offline page: retry until the site loads
for i in range(40):
    try:
        href = ev("location.href + ' ' + !!document.getElementById('startBtn')")
    except Exception as e:
        href = "ERR " + str(e)
    if href and "nate-bloom" in href and href.endswith("true"):
        break
    print(f"waiting for the site ({i}): {href}", flush=True)
    try:
        ev("location.href = 'https://nathan-san1981.github.io/nate-bloom/'", wait=False)
    except Exception:
        pass
    time.sleep(6)
time.sleep(4)
check("page", "document.title + ' | ' + location.href")
check("native", "JSON.stringify({native: !!window.NB_NATIVE, v: window.NB_NATIVE && NB_NATIVE.version, ua: navigator.userAgent.slice(-40)})")
check("viewport", "innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio")
shot("01_start")
check("start", "(async()=>{ document.getElementById('startBtn').click(); await new Promise(r=>setTimeout(r,2500)); return {startHidden: !document.getElementById('startBtn').offsetParent} })()")
shot("02_main")
check("midi", "(async()=>{ const a = await navigator.requestMIDIAccess({sysex:false}); return {inputs: a.inputs.size, outputs: a.outputs.size, kind: a.constructor.name} })()")
check("midi sheet", "(async()=>{ document.getElementById('midiBtn').click(); await new Promise(r=>setTimeout(r,800)); const c=[...document.querySelectorAll('#midiSheet button')].find(b=>/connect/i.test(b.textContent)); if (c) c.click(); await new Promise(r=>setTimeout(r,800)); return document.getElementById('midiSheet').innerText.slice(0,200) })()")
shot("03_midi")
check("midi close", "NB_NATIVE.back()")
check("save file", "(async()=>{ try { return await NB_NATIVE.saveBlob(new Blob(['Nate Bloom CI test ' + Date.now()], {type:'text/plain'}), 'nb-ci-test.txt'); } catch(e) { return 'ERR ' + e.message } })()")
check("share path", "(async()=>{ try { await navigator.share({files:[new File([new Uint8Array([1,2,3])], 'nb-ci-share.bin', {type:'application/octet-stream'})]}); return 'ok' } catch(e) { return 'ERR ' + e.message } })()")
check("studio", "(async()=>{ document.getElementById('sndOpen').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('#brCats .chip[data-cat=\"studio\"]').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('#brList .br-row[data-id=\"w:nb-piano\"] .br-main').click(); for (let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,500)); const s=document.getElementById('sndSub').textContent; if(!/Loading|Downloading/.test(s) && /Salamander/.test(s)) return s; } return 'timeout: ' + document.getElementById('sndSub').textContent })()")
shot("04_studio")
check("close browser", "NB_NATIVE.back()")
check("beat pads", "(async()=>{ document.getElementById('bpBtn').click(); await new Promise(r=>setTimeout(r,1200)); return !document.getElementById('bpView').hidden })()")
shot("05_beatpads")
check("fast pads", "(async()=>{ if (!window.NBFastPads) return 'no bridge'; const t0 = performance.now(); for (let i=0;i<80;i++){ await new Promise(r=>setTimeout(r,500)); const N = window.__nfp && __nfp.NFP; if (N && [...N.pads.values()].filter(r=>r.ok).length >= 16) break; } const N = window.__nfp && __nfp.NFP; return { info: NBFastPads.info(), ready: N ? [...N.pads.values()].filter(r=>r.ok).length : -1, secs: Math.round((performance.now()-t0)/100)/10, why: window.__nfp ? __nfp.why() : 'no page support', badge: (document.getElementById('bpFast')||{}).textContent, mb: N ? Math.round(N.bytes/1e5)/10 : 0, webLatency: (()=>{ try { const c = __nfp.ctx(); return [c.baseLatency, c.outputLatency, c.sampleRate]; } catch(e) { return null } })() } })()")
check("fast taps", "(async()=>{ const N = window.__nfp && __nfp.NFP; if (!N) return 'n/a'; const p0 = N.plays; for (const k of [0, 1, 2, 0, 3, 2]) { const el = document.querySelector('.bp-pad[data-k=\"' + k + '\"]'), r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:60+k,clientX:r.left+5,clientY:r.top+3})); el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:60+k})); await new Promise(r=>setTimeout(r,250)); } return { fast: N.plays - p0, of: 6, delta: N.delta, info: NBFastPads.info() } })()")
shot("06_fastpads")
check("back closes beat pads", "(async()=>{ const r = NB_NATIVE.back(); await new Promise(r=>setTimeout(r,500)); return [r, document.getElementById('bpView').hidden] })()")
check("fast plugins (native)", "(async()=>{ if (!window.NBFastPads || !NBFastPads.synthList) return 'no synth'; const ids = JSON.parse(NBFastPads.synthList()); const i = ids.indexOf('twin77'); const ok = NBFastPads.synthLoad(i); NBFastPads.synthMidi(i, 0x90, 60, 100); NBFastPads.synthMidi(i, 0x90, 67, 100); await new Promise(r=>setTimeout(r,900)); NBFastPads.synthMidi(i, 0x80, 60, 0); NBFastPads.synthMidi(i, 0x80, 67, 0); await new Promise(r=>setTimeout(r,400)); NBFastPads.synthOff(i); const j = ids.indexOf('fuzz_bass'); const ok2 = NBFastPads.synthLoad(j); NBFastPads.synthMidi(j, 0x90, 36, 110); await new Promise(r=>setTimeout(r,500)); NBFastPads.synthOff(j); return { ids: ids.join(','), twin77: ok, fuzz_bass: ok2, info: NBFastPads.info() } })()")
check("link (find on the emulator's network)", "(async()=>{ if (!window.NBLinkNative) return 'no link bridge'; const got = []; const o = window.__nbLinkIn; window.__nbLinkIn = s => { got.push(s); if (o) o(s); }; NBLinkNative.find(); await new Promise(r=>setTimeout(r,2800)); window.__nbLinkIn = o; return { msgs: got.slice(0, 3), button: !!document.getElementById('lkBtn') && !document.getElementById('lkBtn').hidden } })()")
check("ableton link (native)", "(async()=>{ if (!window.NBAbleton) return 'no NBAbleton'; const on = NBAbleton.enable(true, 121); await new Promise(r=>setTimeout(r,500)); const s1 = JSON.parse(NBAbleton.state(4)); const t = NBAbleton.now(); const b0 = NBAbleton.start(t + 50000, 4); await new Promise(r=>setTimeout(r,300)); const s2 = JSON.parse(NBAbleton.state(4)); NBAbleton.stop(NBAbleton.now()); const s3 = JSON.parse(NBAbleton.state(4)); NBAbleton.enable(false, 0); return { on, tempo: s1.tempo, peers: s1.peers, beat0InMs: Math.round((b0 - t) / 1000), playing: s2.playing, beatAfter300ms: +s2.beat.toFixed(3), stopped: !s3.playing, ui: !!document.getElementById('ablBody') } })()")
check("errors so far", "JSON.stringify((window.__nbErrors||[]).slice(0,5))")
ws.close()
