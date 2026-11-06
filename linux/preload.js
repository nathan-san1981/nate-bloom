// What the page sees of the Linux app: window.NB_NATIVE (the same hooks the Android app gives it) and
// window.NBFastPads (Beat Pads' low-latency player, nb_fastpads_linux.cc).
const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");

let version = "1.0";
try { version = require("./package.json").version; } catch (e) {}

let fp = null;
for (const p of [path.join(__dirname, "native", "build", "Release", "nbfastpads.node"), path.join(__dirname.replace(/app\.asar$/, "app.asar.unpacked"), "native", "build", "Release", "nbfastpads.node")]) {
  try { fp = require(p); break; } catch (e) {}
}
if (!fp) console.warn("Fast pads aren't available here; Beat Pads plays through the browser's audio");

contextBridge.exposeInMainWorld("NB_NATIVE", {
  platform: process.platform === "win32" ? "windows" : "linux",   // (234) the same app built for Windows: the Linux-only parts look for "linux"
  version,
  shellLatest: () => ipcRenderer.invoke("nb:shell-latest"),   // (232) a newer Linux app package
  shellInstall: () => ipcRenderer.invoke("nb:shell-install"),
  makeWait: pids => ipcRenderer.invoke("nb:make-wait", pids),   // (243) a busy program of the user's own gives way to the sound
  waited: () => ipcRenderer.invoke("nb:waited"),
  background: true,                       // minimised, it keeps playing
  setPlaying: on => ipcRenderer.send("nb:playing", !!on),
  toast: msg => ipcRenderer.send("nb:toast", String(msg)),
  foreground: () => {},
  back: () => false,
  // (173) Across both screens: the window spans the screens, the page uses the whole width
  setWide: on => ipcRenderer.send("nb:set-wide", !!on),
  wideState: () => ipcRenderer.invoke("nb:wide"),
  // (179) the CPU meter: real measurements of the computer and of Nate Bloom's audio threads (main.js)
  cpu: () => ipcRenderer.invoke("nb:cpu"),
  onWide: cb => ipcRenderer.on("nb:wide", (e, on) => { try { cb(!!on); } catch (er) {} }),
  // (193) the low-latency output: frames this start uses (0 = off), the choice for the next start, a restart to apply it
  lowLatency: {
    frames: (() => { try { return +ipcRenderer.sendSync("nb:ll-active") || 0; } catch (e) { return 0; } })(),
    get: () => ipcRenderer.invoke("nb:low-latency"),
    set: on => ipcRenderer.invoke("nb:low-latency", { on: !!on, frames: 256 }),
    restart: () => ipcRenderer.invoke("nb:restart"),
  },
  // (198) Linux's volumes for the interface's input and output and this app's stream; fix sets them to 100%
  levels: { get: () => ipcRenderer.invoke("nb:levels"), fix: () => ipcRenderer.invoke("nb:levels-fix") },
});

// (176) the native synth engine (nb_engine.cc): voices worked out on a pool of threads, into shared memory the page's
// AudioWorklet plays from. attach() takes the page's shared Float64Array header and Float32Array ring.
let engineOK = true;   // (176) off after two page crashes close together (main.js writes engine-crash.json)
try { const ud = (process.argv.find(a => a.startsWith("--nb-userdata=")) || "").slice(14); if (ud) { const c = JSON.parse(require("fs").readFileSync(path.join(ud, "engine-crash.json"), "utf8")); if (c && c.n >= 2) engineOK = false; } } catch (e) {}
if (fp && fp.eng_attach && engineOK && !process.env.NB_NO_ENGINE) {
  // the page posts { nbEngAttach: { id, hdr, ring, sr, buses, cap, ahead } } to its own window (structured clone shares
  // SharedArrayBuffers there, which the bridge won't); this answers { nbEngAttached: { id, ok, why } }
  window.addEventListener("message", e => {
    const d = e.data && e.data.nbEngAttach; if (!d || e.source !== window) return;
    let ok = false, why = "";
    try { ok = !!fp.eng_attach(new Float64Array(d.hdr), new Float32Array(d.ring), d.sr, d.buses, d.cap, d.ahead); if (!ok) why = "the engine refused the memory"; } catch (er) { why = String(er && er.message || er); }
    window.postMessage({ nbEngAttached: { id: d.id, ok, why } }, "*");
  });
}
if (fp && fp.eng_attach && engineOK && !process.env.NB_NO_ENGINE) contextBridge.exposeInMainWorld("NBEngine", {
  // (the shared memory can't cross this bridge: the page posts it to the window, and the listener below hands it to the engine)
  attach: () => false,
  note: (id, bus, frame, midi, mix, params) => fp.eng_note(id, bus, frame, midi, mix, params),
  off: (id, frame) => fp.eng_off(id, frame),
  kill: id => fp.eng_kill(id == null ? -1 : id),
  pitch: (bend, vib) => fp.eng_pitch(bend, vib),
  table: (id, h) => fp.eng_table ? fp.eng_table(id, h || undefined) : false,   // (185)
  stats: () => fp.eng_stats(),
  stop: () => fp.eng_stop(),
});

// (187) Nate Bloom ↔ Bitwig (native/nb_bridge.cc): the page posts { nbBridgeAttach: { hdr, rings, midi } } (its shared
// memory) to its own window and this hands it on; the rest goes over NBBridge
if (fp && fp.br_start && !process.env.NB_NO_BRIDGE) {
  window.addEventListener("message", e => {
    const d = e.data && e.data.nbBridgeAttach; if (!d || e.source !== window) return;
    let ok = false, why = "";
    try { ok = !!fp.br_start(new Float64Array(d.hdr), new Float32Array(d.rings), new Float64Array(d.midi)); if (!ok) why = "the bridge refused the memory"; } catch (er) { why = String(er && er.message || er); }
    window.postMessage({ nbBridgeAttached: { ok, why } }, "*");
  });
  contextBridge.exposeInMainWorld("NBBridge", {
    info: () => { try { return JSON.parse(fp.br_info()); } catch (e) { return null; } },
    jack: (on, parts) => fp.br_jack(!!on, parts | 0),
    midi: on => fp.br_midi(!!on),
    plugin: () => ipcRenderer.invoke("nb:bridge-plugin"),
  });
}
if (fp) contextBridge.exposeInMainWorld("NBFastPads", {
  start: () => fp.start(),
  sleep: () => fp.sleep(),
  info: () => fp.info(),
  rate: () => fp.rate(),
  load: (slot, b64, frames) => fp.load(slot, Buffer.from(String(b64), "base64"), frames),
  clear: slot => fp.clear(slot),
  play: (slot, gl, gr, choke, pad) => fp.play(slot, gl, gr, choke, pad),
  stopAll: () => fp.stopAll(),
  stopPad: pad => fp.stopPad(pad),
  choke: (group, exceptPad) => fp.choke(group, exceptPad),
  setDevice: name => fp.setDevice ? fp.setDevice(String(name || "")) : false,
  devices: () => { try { return JSON.parse(fp.devices ? fp.devices() : "[]"); } catch (e) { return []; } },
  // Nathan's plugin instruments, native (see native/nbsynth)
  synthList: () => fp.synthList ? fp.synthList() : "[]",
  synthLoad: i => fp.synthLoad ? fp.synthLoad(i | 0) : false,
  synthOff: i => fp.synthOff && fp.synthOff(i | 0),
  synthMidi: (i, a, b, c) => fp.synthMidi && fp.synthMidi(i | 0, a | 0, b | 0, c | 0),
  synthParam: (i, k, v) => fp.synthParam && fp.synthParam(i | 0, k | 0, +v),
  synthTempo: (bpm, playing) => fp.synthTempo && fp.synthTempo(+bpm, playing ? 1 : 0),
  synthGain: (i, g) => fp.synthGain && fp.synthGain(i | 0, +g),
});

// (177) VST3 and CLAP plugins (native/nb_plug.cc, nbplug.node): the page loads one, then posts its shared memory
// ({ nbPlugAttach: { id, inst, hdr, inR, outR, cap } }, like the engine's); everything else goes over this bridge.
// Promises answer with JSON text. Which plugins are loaded is told to the app, so a crash is put down to them.
let pl = null;
for (const p of [path.join(__dirname, "native", "build", "Release", "nbplug.node"), path.join(__dirname.replace(/app\.asar$/, "app.asar.unpacked"), "native", "build", "Release", "nbplug.node")]) {
  try { pl = require(p); break; } catch (e) {}
}
if (pl && !process.env.NB_NO_PLUGINS) {
  // (184) each plugin in a process of its own (plughost.js), when it can start; otherwise in this one.
  // (187) a switch, off until it's switched on (the Plugins sheet; it takes effect the next time the app opens): with
  // one plugin (Surge XT's VST3 window) it took the app's helper processes down in testing
  const UDp = (process.argv.find(a => a.startsWith("--nb-userdata=")) || "").slice(14), OOPF = UDp ? path.join(UDp, "plug-oop.json") : "";
  let oopOn = process.env.NB_PLUG_OOP === "1";
  try { if (!oopOn && OOPF) oopOn = JSON.parse(require("fs").readFileSync(OOPF, "utf8")).on === true; } catch (e) {}
  if (process.env.NB_PLUG_INPROC) oopOn = false;
  try { if (oopOn && pl.plug_config) pl.plug_config(path.join(__dirname, "plughost.js")); } catch (e) { oopOn = false; }
  window.addEventListener("message", e => {
    const d = e.data && e.data.nbPlugAttach; if (!d || e.source !== window) return;
    let ok = false, why = "";
    try { ok = !!pl.plug_attach(d.inst, new Float64Array(d.hdr), new Float32Array(d.inR), new Float32Array(d.outR), d.cap); if (!ok) why = "the plugin host refused the memory"; } catch (er) { why = String(er && er.message || er); }
    window.postMessage({ nbPlugAttached: { id: d.id, ok, why } }, "*");
  });
  const keys = new Map();   // instance -> its key, for the crash note
  contextBridge.exposeInMainWorld("NBPlug", {
    oop: () => ({ on: oopOn, next: (() => { try { return JSON.parse(require("fs").readFileSync(OOPF, "utf8")).on === true; } catch (e) { return false; } })() }),   // (187)
    setOop: on => { try { require("fs").writeFileSync(OOPF, JSON.stringify({ on: !!on })); return true; } catch (e) { return false; } },
    // (199) free, open-source plugins from their projects' own releases
    store: { list: () => ipcRenderer.invoke("nb:store-list"), install: id => ipcRenderer.invoke("nb:store-install", String(id)), remove: id => ipcRenderer.invoke("nb:store-remove", String(id)),
      onProgress: cb => ipcRenderer.on("nb:store-progress", (e, m) => { try { cb(m); } catch (er) {} }) },
    preset: rel => ipcRenderer.invoke("nb:plug-preset", String(rel)),   // (205) a factory preset file, base64
    presets: rel => ipcRenderer.invoke("nb:plug-presets", String(rel)),
    list: () => ipcRenderer.invoke("nb:plug-list"),
    scan: full => ipcRenderer.invoke("nb:plug-scan", !!full),
    addFolder: () => ipcRenderer.invoke("nb:plug-folder"),
    removeFolder: p => ipcRenderer.invoke("nb:plug-unfolder", String(p)),
    suspects: () => ipcRenderer.invoke("nb:plug-suspects"),
    trust: key => ipcRenderer.invoke("nb:plug-trust", String(key)),
    load: (fmt, file, uid, sr, key) => { ipcRenderer.send("nb:plug-live", String(key), true);
      return pl.plug_load(String(fmt), String(file), String(uid || ""), +sr || 48000).then(j => { const o = JSON.parse(j); keys.set(o.id, String(key)); return o; },
        e => { ipcRenderer.send("nb:plug-live", String(key), false); throw new Error(String(e)); }); },
    midi: (id, frame, a, b, c) => pl.plug_midi(id | 0, +frame, a | 0, b | 0, c | 0),
    flush: id => pl.plug_flush(id | 0),
    param: (id, pid, v, frame) => frame == null ? pl.plug_param(id | 0, pid >>> 0, +v) : pl.plug_param(id | 0, pid >>> 0, +v, +frame),
    params: id => pl.plug_params(id | 0).then(j => JSON.parse(j)),
    getState: id => pl.plug_get_state(id | 0),
    setState: (id, b64) => pl.plug_set_state(id | 0, String(b64)).then(j => j === "true"),
    gui: async (id, open, title) => { let xid = 0; try { xid = await ipcRenderer.invoke("nb:xid"); } catch (e) {} return JSON.parse(await pl.plug_gui(id | 0, !!open, String(title || "Plugin"), +xid || 0)); },
    unload: id => { const k = keys.get(id | 0); keys.delete(id | 0); return pl.plug_unload(id | 0).then(() => { if (k) ipcRenderer.send("nb:plug-live", k, false); return true; }); },
    transport: (bpm, playing) => pl.plug_transport(+bpm, !!playing),
    stats: id => id == null ? pl.plug_stats() : pl.plug_stats(id | 0),
    notices: () => pl.plug_notices(),
  });
}

// Ableton Link (native/ablink, in the same native module): Bitwig and the other Link apps on the network
if (fp && fp.ablState) contextBridge.exposeInMainWorld("NBAbleton", {
  enable: (on, bpm) => fp.ablEnable(!!on, +bpm || 120),
  sync: on => fp.ablSync(!!on),
  state: q => fp.ablState(+q || 4),
  now: () => fp.ablNow(),
  timeAtBeat: (b, q) => fp.ablTimeAtBeat(+b, +q || 4),
  setTempo: bpm => fp.ablTempo(+bpm),
  start: (at, q) => fp.ablStart(+at, +q || 4),
  stop: at => fp.ablStop(+at),
});

// Link: this computer hosts; the tablet app finds it on the Wi-Fi (linux/link.js does the network part)
contextBridge.exposeInMainWorld("NBLinkNative", {
  hub: true,
  send: s => { ipcRenderer.send("nb:link-out", String(s)); return true; },
  status: () => ipcRenderer.invoke("nb:link-status"),
  enable: on => ipcRenderer.invoke("nb:link-enable", !!on),
  onMessage: cb => { ipcRenderer.on("nb:link-in", (e, s) => cb(String(s))); },
});

// a newer Nate Bloom came down from the website: offer to switch to it
ipcRenderer.on("nb:update-ready", () => {
  if (document.getElementById("nbUpdate")) return;
  const bar = document.createElement("div");
  bar.id = "nbUpdate";
  bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;display:flex;gap:12px;align-items:center;padding:10px 12px 10px 16px;border-radius:12px;background:#1d1a28;border:1px solid #c4a3ff;color:#ece7f7;font:500 14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)";
  bar.innerHTML = "<span>An update to Nate Bloom is ready.</span>";
  const go = document.createElement("button"); go.textContent = "Restart now";
  go.style.cssText = "font:600 14px system-ui,sans-serif;background:#c4a3ff;color:#13111b;border:0;border-radius:8px;padding:7px 12px;cursor:pointer";
  go.onclick = () => location.reload();
  const later = document.createElement("button"); later.textContent = "Later";
  later.style.cssText = "font:500 14px system-ui,sans-serif;background:transparent;color:#8e86a6;border:0;padding:7px 6px;cursor:pointer";
  later.onclick = () => bar.remove();
  bar.append(go, later);
  document.body.appendChild(bar);
});
