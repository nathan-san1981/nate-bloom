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
  platform: "linux",
  version,
  background: true,                       // minimised, it keeps playing
  setPlaying: on => ipcRenderer.send("nb:playing", !!on),
  toast: msg => ipcRenderer.send("nb:toast", String(msg)),
  foreground: () => {},
  back: () => false,
});

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
