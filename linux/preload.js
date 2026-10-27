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
