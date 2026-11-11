// Nate Bloom for Linux (Mint and other Ubuntu-based systems).
// The app is the same Nate Bloom as the website, served from inside the app at app://nate-bloom/ so it works
// offline and keeps its own storage. It updates itself from the website in the background; instruments and
// library sounds are kept after their first download. Saves land in Downloads/Nate Bloom.
const { app, BrowserWindow, Menu, Notification, net, powerSaveBlocker, protocol, session, shell, ipcMain, dialog, screen } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { createLink } = require("./link");

const SITE = "https://nathan-san1981.github.io/nate-bloom/";
const REMOTE_WAF = "https://surikov.github.io/webaudiofontdata/sound/";
const ORIGIN = "app://nate-bloom";
const BUNDLED = app.isPackaged ? path.join(process.resourcesPath, "site") : path.join(__dirname, "site");
const CACHE = path.join(app.getPath("userData"), "site");   // newer pages and downloaded sounds
// saves: Downloads/Nate Bloom (a system without a Downloads folder set gets ~/Downloads)
const SAVE_DIR = (() => { let d = app.getPath("downloads"); if (path.resolve(d) === path.resolve(app.getPath("home"))) d = path.join(d, "Downloads"); return path.join(d, "Nate Bloom"); })();

app.setName("Nate Bloom");
// (box) the Nate Bloom Box: a Raspberry Pi 5 with a 5" screen, started full screen by cage with --box (box/ in the repo).
// One window over the whole screen, no menu, Play at start (?box=1), the GPU draws the page so the cores stay on sound.
const BOX = process.argv.includes("--box") || process.env.NB_BOX === "1";
const BOX_HELPER = "/usr/local/sbin/nb-box-helper";
if (BOX) {
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess,Translate,MediaRouter,HardwareMediaKeyHandling,WebRtcHideLocalIpsWithMdns");
  app.commandLine.appendSwitch("noerrdialogs");
}
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// (173) a computer, not a tablet: the page may use up to 8 GB for long takes, big samples and many instruments
// (235) at most half the computer's memory, so a 4 or 8 GB machine cleans up before it runs out instead of after
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=" + Math.max(1024, Math.min(8192, Math.round((+process.env.NB_TOTALMEM_MB || require("os").totalmem() / 1048576) / 2))));
// (174) the sound's audio thread (where every synth, plugin and effect is worked out) at real-time priority, so the
// rest of the computer can't push it late; Mint's rtkit grants it. Unknown names are ignored by Electron.
app.commandLine.appendSwitch("enable-features", "AudioWorkletRealtimeThread,AudioWorkletThreadRealtimePriority");
// (181) low latency: a smaller buffer between the page's sound and the sound server (the browser's own
// "audio-buffer-size", in frames, and the PulseAudio/PipeWire client latency). Chosen with Fast/Steady in the app
// (low-latency.json), applied when the app starts. NB_LOW_LATENCY=frames for tests.
{
  let ll = null;
  try { ll = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "low-latency.json"), "utf8")); } catch (e) {}
  // (193) on unless switched off: 256 frames took a key-to-sound from about 47 ms to about 16 ms here
  // (237) Windows: off unless chosen (its shared-mode output works in 10 ms periods; a forced small buffer only adds risk there)
  const frames = process.env.NB_LOW_LATENCY ? +process.env.NB_LOW_LATENCY || 256 : (ll ? ll.on : process.platform !== "win32") ? (+(ll && ll.frames) || 256) : 0;
  global.NB_LL_ACTIVE = frames >= 64 && frames <= 2048 ? frames : 0;
  if (frames >= 64 && frames <= 2048) {
    app.commandLine.appendSwitch("audio-buffer-size", String(frames));
    if (!process.env.PULSE_LATENCY_MSEC) process.env.PULSE_LATENCY_MSEC = String(Math.max(3, Math.round(frames / 48)));
  }
}
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2" };
const typeOf = p => TYPES[path.extname(p).toLowerCase()] || "application/octet-stream";
const exists = p => fs.promises.stat(p).then(s => s.isFile(), () => false);
const inside = (root, p) => { const r = path.resolve(root, p); return r.startsWith(path.resolve(root) + path.sep) ? r : null; };

// the pages: the newer of the copy inside the app and the last update fetched from the website
function stampOf(file) { try { return Date.parse(fs.readFileSync(file, "utf8").trim()) || 0; } catch (e) { return 0; } }
function dropStaleCache() {
  // an updated app (its own copy newer than the last fetched update) uses its own copy again
  const built = stampOf(path.join(BUNDLED, "BUILD.txt")), fetched = stampOf(path.join(CACHE, "FETCHED.txt"));
  if (built && fetched && built > fetched) for (const f of ["index.html", "lite/index.html", "FETCHED.txt"]) { try { fs.rmSync(path.join(CACHE, f)); } catch (e) {} }
}

async function fetchTo(url, dest) {
  const r = await net.fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status + " " + url);
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest + ".part", buf); await fsp.rename(dest + ".part", dest);
  return buf;
}

// (176) cross-origin isolated, so the page can share memory (a SharedArrayBuffer) with the native synth engine's
// threads; "credentialless" keeps the fonts and other outside files loading as before
const COI = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "credentialless", "cross-origin-resource-policy": "cross-origin" };
async function serve(req) {
  const u = new URL(req.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  rel = rel.replace(/^lite\/(snd|inst)\//, "$1/");   // Lite shares the instruments and sounds
  if (rel === "sw.js" || rel === "lite/sw.js") return new Response("", { status: 404 });   // no service worker: the app is its own offline copy
  // (box) the home screen, Listen and Keys live in /opt/nb-box/apps (box/apps in the repo), on the app's own origin so
  // MIDI and saved progress work there too; Keys' /api/ (its box server in the spec) is answered here
  if (BOX && rel.startsWith("api/")) return boxApi(req, rel.slice(4));
  if (BOX && rel.startsWith("box/")) {
    const p = inside(BOX_APPS, rel.slice(4));
    if (p && await exists(p)) return new Response(fs.createReadStream(p), { headers: { "content-type": typeOf(p), "cache-control": "no-cache", ...COI } });
    return new Response("", { status: 404 });
  }
  for (const root of [CACHE, BUNDLED]) {
    const p = inside(root, rel);
    if (p && await exists(p)) return new Response(fs.createReadStream(p), { headers: { "content-type": typeOf(p), "cache-control": "no-cache", ...COI } });
  }
  // not here yet: instruments come from the website, library sounds from their home; both are kept for offline use
  try {
    const dest = inside(CACHE, rel); if (!dest) return new Response("", { status: 404 });
    let src = null;
    const waf = /^snd\/([\w.-]+)\.json$/.exec(rel);
    if (waf) src = REMOTE_WAF + waf[1] + ".js";
    else if (/^(inst|wam)\//.test(rel) || /\.(png|webmanifest)$/.test(rel)) src = SITE + rel;   // (plugins added to the website later)
    if (!src) return new Response("", { status: 404 });
    const buf = await fetchTo(src, dest);
    return new Response(buf, { headers: { "content-type": typeOf(rel), ...COI } });
  } catch (e) {
    return new Response("", { status: 404 });
  }
}

// a newer website: fetched quietly, used the next time the app opens
async function checkForUpdate(win) {
  if (process.env.NB_NO_UPDATE) return;   // (CI: a test build checks its own page, not the website's)
  const pages = ["index.html", "lite/index.html"];
  let changed = 0;
  for (const rel of pages) {
    try {
      const r = await net.fetch(SITE + rel, { cache: "no-store" }); if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 200000 || !buf.includes("Nate Bloom")) continue;   // not the app (a captive portal, an error page)
      let cur = null;
      for (const root of [CACHE, BUNDLED]) { try { cur = await fsp.readFile(path.join(root, rel)); break; } catch (e) {} }
      const h = b => crypto.createHash("sha256").update(b).digest("hex");
      if (cur && h(cur) === h(buf)) continue;
      const dest = path.join(CACHE, rel); await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest + ".part", buf); await fsp.rename(dest + ".part", dest); changed++;
    } catch (e) {}
  }
  if (changed) {
    await fsp.writeFile(path.join(CACHE, "FETCHED.txt"), new Date().toISOString());
    if (win && !win.isDestroyed()) win.webContents.send("nb:update-ready");
  }
}

let win = null, blocker = null;
// (173) Across both screens: the window spans every screen side by side (their common height), and the page uses the
// whole width (the 61 keys of the KeyLab across both). View › Across Both Screens or Ctrl+Shift+F; it reopens that way.
// (175) Cinnamon (and GNOME) keep an ordinary window on one screen when a program sizes it across two. So on X11 it
// goes fullscreen over the screens: xspan.py tells the desktop which screens (_NET_WM_FULLSCREEN_MONITORS). If the
// desktop doesn't take that, the window loses its title bar (a window without one isn't held to one screen) and is
// sized across them; the title bar comes back when it's off. If it still ends up on one screen, it says so.
let WIDE = false, wideBack = null, wideMax = false, wideHow = "", wideInfo = {}, wideSeq = 0, ownFs = 0, wideBare = false;
function spanBounds() {
  const a = screen.getAllDisplays().map(d => d.workArea);
  const x = Math.min(...a.map(r => r.x)), y = Math.max(...a.map(r => r.y));
  return { x, y, width: Math.max(...a.map(r => r.x + r.width)) - x, height: Math.max(400, Math.min(...a.map(r => r.y + r.height)) - y) };
}
const fullSpan = () => { const a = screen.getAllDisplays().map(d => d.bounds); const x = Math.min(...a.map(r => r.x)); return Math.max(...a.map(r => r.x + r.width)) - x; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let XSPAN = null;
function xSpan(mode) {   // "on" | "off" (fullscreen over the screens) | "bare" | "framed" (the title bar)
  return new Promise(res => {
    if (process.platform !== "linux" || !process.env.DISPLAY || process.env.XDG_SESSION_TYPE === "wayland" || !win || win.isDestroyed()) return res({ ok: false, why: "not X11" });
    let xid;
    try { const h = win.getNativeWindowHandle(); xid = h.length >= 8 ? Number(h.readBigUInt64LE(0)) : h.readUInt32LE(0); } catch (e) { return res({ ok: false, why: "no window id" }); }
    try { if (XSPAN == null) XSPAN = fs.readFileSync(path.join(__dirname, "xspan.py"), "utf8"); } catch (e) { return res({ ok: false, why: "no xspan.py" }); }
    execFile("python3", ["-c", XSPAN, String(xid), mode], { timeout: 6000 }, (err, out, eout) => {
      if (err) return res({ ok: false, why: String(eout || err.message).trim().slice(-240) });
      try { res(JSON.parse(String(out).trim().split("\n").pop())); } catch (e) { res({ ok: false, why: "odd reply: " + String(out).slice(0, 160) }); }
    });
  });
}
const unmax = () => new Promise(r => { if (!win.isMaximized()) return r(); let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 150); } }; win.once("unmaximize", go); win.unmaximize(); setTimeout(go, 800); });
const leaveFs = () => new Promise(r => { if (!win.isFullScreen()) return r(); ownFs = Date.now(); let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 200); } }; win.once("leave-full-screen", go); win.setFullScreen(false); setTimeout(go, 1200); });
function wideTell() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("nb:wide", WIDE);
  try { buildMenu(); } catch (e) {}
}
// sized across the screens' work areas, without a title bar where X11 lets it take that off
async function wideSized(seq) {
  wideHow = "sized";
  if (win.isFullScreen()) await leaveFs();
  await unmax();
  if (seq !== wideSeq || !WIDE) return;
  const b = await xSpan("bare"); wideInfo.bare = b; wideBare = !!b.ok;
  if (b.ok) await wait(350);
  if (seq !== wideSeq || !WIDE) return;
  const want = spanBounds(); wideInfo.want = want;
  win.setBounds(want);
  await wait(700);
  if (seq === wideSeq && WIDE && win.getBounds().width < want.width * 0.9) win.setBounds(want);
  setTimeout(() => wideCheck(seq), 1500);
}
async function setWide(on) {
  if (!win || win.isDestroyed()) return;
  const seq = ++wideSeq;
  WIDE = !!on;
  wideTell();
  const n = screen.getAllDisplays().length;
  if (WIDE) {
    if (!wideHow && !win.isFullScreen()) { wideMax = win.isMaximized(); wideBack = wideMax ? null : win.getBounds(); }
    if (n < 2) { wideHow = "one screen"; wideInfo = { screens: n }; if (win.isFullScreen()) await leaveFs(); if (!win.isMaximized()) win.maximize(); return; }
    const x = await xSpan("on");
    if (seq !== wideSeq) return;
    wideInfo = { screens: n, want: spanBounds(), x11: x };
    if (x.ok && x.fsm) {
      wideHow = "fullscreen";
      if (wideBare) { await xSpan("framed"); wideBare = false; }
      if (!win.isFullScreen()) { ownFs = Date.now(); win.setFullScreen(true); }
      // (some desktops take the hint only once the window is fullscreen: it's sent again)
      setTimeout(() => { if (seq === wideSeq && WIDE && wideHow === "fullscreen") xSpan("on"); }, 500);
      setTimeout(() => wideCheck(seq), 2200);
    } else await wideSized(seq);
  } else {
    const was = wideHow; wideHow = "";
    xSpan("off");
    if (win.isFullScreen()) await leaveFs();
    if (seq !== wideSeq) return;
    if (was !== "one screen" || !wideMax) await unmax();
    if (wideMax) win.maximize();
    else if (wideBack && Number.isFinite(wideBack.x) && Number.isFinite(wideBack.y)) win.setBounds(wideBack);
    else { win.setSize(1280, 800); win.center(); }
    if (wideBare) { await wait(200); await xSpan("framed"); wideBare = false; }
    wideBack = null; wideMax = false;
  }
}
// (175) it checks: fullscreen that stayed on one screen tries the sized way; if that's held to one screen too, it says so
let wideWarned = false;
function wideCheck(seq) {
  if (seq !== wideSeq || !WIDE || !win || win.isDestroyed() || screen.getAllDisplays().length < 2) return;
  const b = win.getBounds(), want = wideHow === "fullscreen" ? fullSpan() : (wideInfo.want || spanBounds()).width;
  wideInfo.got = b;
  if (b.width >= want * 0.9) return;
  if (wideHow === "fullscreen") { xSpan("off"); wideSized(seq); return; }
  if (wideWarned) return;
  wideWarned = true;
  const x = wideInfo.x11 || {}, w = wideInfo.want || spanBounds();
  dialog.showMessageBox(win, { type: "warning", title: "Across both screens", message: "Your desktop kept Nate Bloom on one screen",
    detail: `Asked for ${w.width}×${w.height} across ${wideInfo.screens} screens and got ${b.width}×${b.height}.\n` +
      `Window manager: ${x.wm || "unknown"} · spanning hint: ${x.fsm === true ? "supported" : x.fsm === false ? "not supported" : "unknown"}${x.why ? " · " + x.why : ""} · title bar off: ${wideBare ? "yes" : "no"}\n` +
      `Screens X sees: ${(x.mons || []).map(m => m[3] + "×" + m[4] + " at " + m[1] + "," + m[2]).join(" · ") || "unknown"}` });
}

function createWindow() {
  const statePath = path.join(app.getPath("userData"), "window.json");
  let st = { width: 1280, height: 800 };
  try { st = Object.assign(st, JSON.parse(fs.readFileSync(statePath, "utf8"))); } catch (e) {}
  // (box: the whole screen at its own resolution, whatever is plugged in, nothing remembered. Text size is the page
  // zoom, NB_BOX_ZOOM from /etc/nb-box.conf's SCALE: auto = 1.333 on a screen 800 px tall or less (the 5" panel, 720
  // once turned) and 1 on a TV or monitor; 1.25 / 1.333 / 1.5 force one)
  const boxBounds = () => screen.getPrimaryDisplay().bounds;
  const boxZoom = () => { const z = parseFloat(process.env.NB_BOX_ZOOM); return z >= 0.5 && z <= 4 ? z : (boxBounds().height <= 800 ? 1.333 : 1); };
  const boxFit = () => { if (!win || win.isDestroyed()) return; win.setBounds(boxBounds()); win.setFullScreen(true); win.webContents.setZoomFactor(boxZoom()); };
  if (BOX) st = { width: boxBounds().width, height: boxBounds().height };
  win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y, minWidth: BOX ? 320 : 360, minHeight: BOX ? 240 : 560, show: false,
    title: "Nate Bloom", backgroundColor: "#13111b", autoHideMenuBar: true,
    ...(BOX ? { frame: false, fullscreen: true, kiosk: true } : {}),
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, additionalArguments: ["--nb-userdata=" + app.getPath("userData")].concat(BOX ? ["--nb-box"] : []) },
  });
  if (st.max && !st.wide && !BOX) win.maximize();
  win.once("ready-to-show", () => {
    win.show();
    if (BOX) boxFit();
    if (st.wide) {
      wideMax = !!st.max; wideBack = !wideMax && Number.isFinite(st.x) ? { x: st.x, y: st.y, width: st.width, height: st.height } : null;
      wideHow = "starting"; setTimeout(() => setWide(true), 600);   // (once the desktop has the window)
    }
  });
  const saveState = () => { try { const b = WIDE ? (wideBack || { width: 1280, height: 800 }) : win.getNormalBounds(); fs.writeFileSync(statePath, JSON.stringify({ ...b, max: WIDE ? wideMax : win.isMaximized(), wide: WIDE })); } catch (e) {} };
  win.webContents.on("did-finish-load", () => { if (WIDE) win.webContents.send("nb:wide", true); if (BOX) win.webContents.setZoomFactor(boxZoom()); });
  // screens plugged in or out while it's across them: it fits what's there now (not on every small change)
  let lastScreens = "";
  const screensKey = () => screen.getAllDisplays().map(d => [d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height].join(",")).join(" ");
  lastScreens = screensKey();
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"]) screen.on(ev, () => {
    setTimeout(() => { const k = screensKey(); if (k === lastScreens) return; lastScreens = k; if (WIDE && win && !win.isDestroyed()) setWide(true);
      if (BOX) boxFit(); }, 600);
  });
  // F11 (or the desktop) taking it out of fullscreen while it's across the screens: that's across both screens off
  win.on("leave-full-screen", () => { if (WIDE && wideHow === "fullscreen" && Date.now() - ownFs > 1500) { WIDE = false; wideHow = ""; ++wideSeq; xSpan("off"); wideBack = null; wideMax = false; wideTell(); } });
  // Ctrl+Shift+F works with the menu bar hidden too (and only once)
  win.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && i.control && i.shift && !i.alt && !i.meta && i.code === "KeyF") { e.preventDefault(); setWide(!WIDE); } });
  if (!BOX) win.on("close", saveState);
  // (box) a Home button on the pages that have no way back of their own (Keys, Karaoke): always on top, bottom-left
  if (BOX) win.webContents.on("did-finish-load", () => {
    const u = win.webContents.getURL();
    if (!(u.startsWith(ORIGIN + "/box/keys/") || karaokeUrl(u))) return;
    win.webContents.executeJavaScript(`(() => { if (document.getElementById("nbBoxHome")) return;
      const b = document.createElement("button"); b.id = "nbBoxHome"; b.type = "button"; b.title = "Back to the home screen";
      b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></svg><span>Home</span>';
      b.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:2147483647;display:flex;align-items:center;gap:8px;height:48px;padding:0 18px 0 14px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(20,21,26,.88);color:#fff;font:600 16px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent";
      b.addEventListener("click", e => { e.stopPropagation(); if (window.NBBox && NBBox.go) NBBox.go("home"); else location.href = ${JSON.stringify(ORIGIN + "/box/home.html")}; });
      document.documentElement.appendChild(b); })()`).catch(() => {});
  });
  // (box) the phone controllers' QR code (box/pad-server.py, port 8810), bottom-right on the box's own pages: scan it and
  // the phone is a remote, a game pad (one per phone), a touchpad and a keyboard. It goes once a phone says "Everyone's
  // in" and comes back from any phone's "Show QR". The app asks the pad server (net.fetch) and hands the page its state.
  if (BOX) {
    let padKey = "";
    const padPage = () => { try { return win && !win.isDestroyed() && win.webContents.getURL().startsWith(ORIGIN + "/box/"); } catch (e) { return false; } };
    win.webContents.on("did-finish-load", () => {
      padKey = "";
      if (!padPage()) return;
      win.webContents.executeJavaScript(`(() => { if (window.__nbPadQr || location.pathname.endsWith("/box/players.html")) return;   // (Players shows its own big code)
        const c = document.createElement("div"); c.id = "nbPadQr";
        c.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483646;width:150px;padding:10px;border-radius:14px;background:rgba(20,21,26,.92);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.45);font:600 13px Inter,system-ui,sans-serif;color:#fff;text-align:center;display:none;pointer-events:none";
        document.documentElement.appendChild(c);
        window.__nbPadQr = st => {
          const on = !!(st && st.qr && st.matrix); c.style.display = on ? "block" : "none";
          const main = document.getElementById("main"); if (main && location.pathname.endsWith("/box/home.html")) main.style.right = on ? "182px" : "";   // (the tiles make room)
          if (!on) return;
          const m = st.matrix, n = m.length; let d = "";
          m.forEach((row, y) => row.forEach((v, x) => { if (v) d += "M" + x + " " + y + "h1v1h-1z"; }));
          const dots = (st.players || []).map(p => '<i style="display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 3px;background:' + p.color + '"></i>').join("");
          c.innerHTML = '<div style="background:#fff;border-radius:10px;padding:7px"><svg viewBox="0 0 ' + n + ' ' + n + '" width="116" height="116" shape-rendering="crispEdges" style="display:block"><path d="' + d + '" fill="#000"/></svg></div>'
            + '<div style="margin-top:8px">Scan to play</div>' + (dots ? '<div style="margin-top:6px;line-height:0">' + dots + '</div>' : "");
        };
      })()`).catch(() => {});
    });
    setInterval(async () => {
      if (!padPage()) return;
      let st = null;
      try { const r = await net.fetch("http://127.0.0.1:8810/api/state", { cache: "no-store" }); if (r.ok) st = await r.json(); } catch (e) {}
      const key = st ? JSON.stringify([st.qr, st.url, st.players, st.controllers]) : "off";
      if (key === padKey) return;
      padKey = key;
      win.webContents.executeJavaScript(`window.__nbPadQr && window.__nbPadQr(${JSON.stringify(st)}); window.__nbPadState && window.__nbPadState(${JSON.stringify(st)})`).catch(() => {});
    }, 1500);
  }
  // (box) screensaver: after SAVER_S (10 minutes) with no button pressed anywhere (the box's keyboard and mouse, a phone,
  // an 8BitDo...) on the box's own menus, a dark screen with a slowly drifting clock. Any button wakes it, and that press
  // does nothing else. Never over a game, Kodi, Moonlight, Keys or karaoke.
  if (BOX) {
    const SAVER_S = +(process.env.NB_SAVER_S || 600);
    let lastInput = Date.now(), saverOn = false;
    win.webContents.on("input-event", () => { lastInput = Date.now(); });
    win.webContents.on("did-finish-load", () => { lastInput = Date.now(); saverOn = false; });
    const SAVER_JS = on => `(on => { let s = document.getElementById("nbSaver");
      if (!s) {
        s = document.createElement("div"); s.id = "nbSaver";
        s.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000;opacity:0;transition:opacity 1.5s;pointer-events:none;cursor:none;overflow:hidden";
        s.innerHTML = '<div id="nbSaverC" style="position:absolute;left:30%;top:30%;color:rgba(255,255,255,.8);font:200 132px/1 Inter,system-ui,sans-serif;text-align:center;white-space:nowrap;transition:opacity 2s"><div id="nbSaverT"></div><div id="nbSaverD" style="font-size:32px;font-weight:400;margin-top:16px;color:rgba(255,255,255,.5)"></div><div style="font-size:19px;font-weight:400;margin-top:30px;color:rgba(255,255,255,.28)">Press any button</div></div>';
        document.documentElement.appendChild(s);
        const c = s.querySelector("#nbSaverC");
        let woke = 0, tick = null, n = 0;
        const draw = () => { const d = new Date();
          s.querySelector("#nbSaverT").textContent = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          s.querySelector("#nbSaverD").textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          if (++n % 30 === 0) { c.style.opacity = "0"; setTimeout(() => { const W = innerWidth - c.offsetWidth, H = innerHeight - c.offsetHeight;
            c.style.left = Math.max(0, Math.random() * W) + "px"; c.style.top = Math.max(0, Math.random() * H) + "px"; c.style.opacity = "1"; }, 2100); } };
        s.__set = v => { s.__on = v; s.style.pointerEvents = v ? "auto" : "none"; s.style.opacity = v ? "1" : "0";
          clearInterval(tick); if (v) { n = 0; draw(); tick = setInterval(draw, 1000); } else woke = Date.now(); };
        const eat = e => { if (s.__on) { e.preventDefault(); e.stopImmediatePropagation(); s.__set(false); }
          else if (Date.now() - woke < 500) { e.preventDefault(); e.stopImmediatePropagation(); } };
        for (const t of ["keydown", "keyup", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "wheel", "touchstart"]) addEventListener(t, eat, { capture: true, passive: false });
      }
      s.__set(on); })(${on})`;
    setInterval(async () => {
      if (!win || win.isDestroyed()) return;
      let u = ""; try { u = win.webContents.getURL(); } catch (e) { return; }
      const here = u.startsWith(ORIGIN + "/box/") && !u.startsWith(ORIGIN + "/box/keys/");
      let padIdle = Infinity;
      try { const r = await net.fetch("http://127.0.0.1:8810/api/state", { cache: "no-store" }); if (r.ok) { const st = await r.json(); if (typeof st.idle === "number") padIdle = st.idle; } } catch (e) {}
      let want = here && Math.min((Date.now() - lastInput) / 1000, padIdle) >= SAVER_S;
      if (want && !saverOn) {   // (a game or Kodi over the top: that counts as being used)
        let busy = false; try { busy = require("child_process").spawnSync("pgrep", ["-x", "retroarch|moonlight-qt|kodi.bin"], { timeout: 1000 }).status === 0; } catch (e) {}
        if (busy) { lastInput = Date.now(); want = false; }
      }
      if (want === saverOn) return;
      saverOn = want;
      win.webContents.executeJavaScript(SAVER_JS(want)).catch(() => {});
    }, 1500);
  }
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (process.env.NB_DEBUG) console.log("[nb] will-navigate", url.slice(0, 80)); if (!url.startsWith(ORIGIN) && !karaokeUrl(url)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // (176) a page that crashes is reloaded; two crashes within 2 minutes of each other switch the native synth engine off
  // (preload reads engine-crash.json), so a fault in it can never keep the app from working. 10 minutes without one clears it.
  const crashPath = path.join(app.getPath("userData"), "engine-crash.json");
  win.webContents.on("did-start-loading", () => { if (plugs) plugs.pageReset(); });   // (177)
  win.webContents.on("render-process-gone", (e, d) => {
    if (d.reason === "clean-exit") return;
    const byPlugin = plugs && /crashed|abnormal|oom/.test(d.reason) && plugs.pageCrashed();   // (177) plugins were loaded: put down to them (they don't load by themselves next time), not the engine
    if (!byPlugin) try { let c = { n: 0, t: 0 }; try { c = JSON.parse(fs.readFileSync(crashPath, "utf8")); } catch (er) {} const now = Date.now(); c = { n: now - c.t < 120000 ? c.n + 1 : 1, t: now, reason: d.reason }; fs.writeFileSync(crashPath, JSON.stringify(c)); } catch (er) {}
    setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 800);
  });
  setTimeout(() => { try { const c = JSON.parse(fs.readFileSync(crashPath, "utf8")); if (Date.now() - c.t > 600000 && c.n < 2) fs.unlinkSync(crashPath); } catch (er) {} }, 600000);
  // (box) Listen's music stops when you leave it, unless "Keep playing" is on (Jam along): then it plays on under
  // Nate Bloom, Keys and the home screen, and stops only for Stream, Media, Games or Stop
  if (BOX) win.webContents.on("did-start-navigation", (e) => {
    const u = (e && e.url) || ""; if (e && e.isMainFrame === false) return;
    if (u.includes("/box/keys/")) boxLast = "keys"; else if (/\/\?box=1/.test(u)) boxLast = "bloom"; else if (u.includes("/box/sheets.html")) boxLast = "sheets";
    if (!u.includes("/box/listen.html") && !u.includes("/box/radio.html") && !listenKeep()) listenStop();
  });
  win.loadURL(ORIGIN + (BOX ? boxStartPage() : "/"));
  win.webContents.once("did-finish-load", () => setTimeout(() => checkForUpdate(win), 4000));
}

// (box) what only the Box asks of the computer: temperature, power, Wi-Fi, shutdown. Everything that needs root goes
// through one small script (box/nb-box-helper, allowed for the box's user by sudoers) and only with the actions it knows.
const BOX_ACTIONS = new Set(["shutdown", "reboot", "wifi-on", "wifi-off", "rotate-90", "rotate-270", "scale-auto", "scale-125", "scale-133", "scale-150", "restart-app",
  "bt-on", "bt-list", "bt-scan", "start-ask", "start-bloom", "start-keys", "start-listen", "start-stream"]);
const boxRun = args => new Promise(res => execFile("sudo", ["-n", BOX_HELPER, ...args], { timeout: 120000 }, (err, out, errOut) => res({ ok: !err, out: String(out || "").trim(), error: err ? String(errOut || err.message || err).trim() : "" })));
async function boxStatus() {
  const s = { temp: null, throttled: null, undervolt: false, hot: false, wifi: null, output: null };
  try { s.temp = Math.round(+fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8") / 100) / 10; } catch (e) {}
  const r = await boxRun(["status"]);
  if (r.ok) try { Object.assign(s, JSON.parse(r.out)); } catch (e) {}
  if (s.throttled != null) { s.undervolt = !!(s.throttled & 0x1); s.hot = !!(s.throttled & 0x8) || (s.temp || 0) >= 80; }
  return s;
}
ipcMain.handle("nb:box-status", async () => BOX ? boxStatus() : null);

// (box) more than music: a home screen at power-on (Nate Bloom, Keys, Listen, Stream, Media, Games). Nate Bloom, Keys,
// Listen and the home screen are pages in this window; Stream (Moonlight) and Media (Kodi) are their own programs, so
// the app writes which one into /run/nb-box/next and quits, and session.sh runs it, then brings this back on the home
// screen. Games reboots into the Batocera USB stick (the box boots USB first, then the card).
const BOX_APPS = process.env.NB_BOX_APPS || "/opt/nb-box/apps";
const BOX_RUN = process.env.NB_BOX_RUN || "/run/nb-box";
const BOX_PAGES = { home: "/box/home.html", bloom: "/?box=1", keys: "/box/keys/index.html?box=1", listen: "/box/listen.html", radio: "/box/radio.html", sheets: "/box/sheets.html", retro: "/box/retro.html", players: "/box/players.html" };
const BOX_OUT = { stream: "/usr/bin/moonlight-qt", media: "/usr/bin/kodi" };
const RETROARCH = "/usr/bin/retroarch", CORES = "/usr/lib/aarch64-linux-gnu/libretro";
const SHEETS_DIR = path.join(app.getPath("home"), "Sheets"), ROMS_DIR = path.join(app.getPath("home"), "ROMs");
let boxLast = "";   // (the last of Nate Bloom / Keys opened: the home screen offers Resume on it)
const hasFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
function boxConf(key) { try { return (new RegExp("^" + key + "=(\\S*)", "m").exec(fs.readFileSync("/etc/nb-box.conf", "utf8")) || [])[1] || ""; } catch (e) { return ""; } }
// (box) Karaoke: the big screen of the karaoke server on another computer (KARAOKE= in /etc/nb-box.conf, e.g.
// https://192.168.4.185:8800), streamed from there, nothing kept here. KARAOKE_CERT= pins its self-made certificate (sha256/...)
const KARAOKE = BOX ? boxConf("KARAOKE").replace(/\/+$/, "") : "";
const KARAOKE_CERT = BOX ? boxConf("KARAOKE_CERT") : "";
function karaokeUrl(u) { if (!KARAOKE || !u) return false; try { return new URL(u).origin === new URL(KARAOKE).origin; } catch (e) { return false; } }
function boxStartPage() {
  if (!hasFile(path.join(BOX_APPS, "home.html"))) return BOX_PAGES.bloom;   // (an install without the home screen, or CI: straight to Play)
  const want = process.env.NB_BOX_START || boxConf("START");
  return BOX_PAGES[want] || BOX_PAGES.home;
}
function gameStick() {   // the Batocera stick: its boot partition is labelled BATOCERA
  return new Promise(res => execFile("lsblk", ["-rno", "LABEL,TRAN,PKNAME"], { timeout: 4000 }, (err, out) => res(!err && /^BATOCERA\b/m.test(String(out)))));
}
async function boxApps() {
  return {
    home: hasFile(path.join(BOX_APPS, "home.html")), bloom: true, karaoke: !!KARAOKE, karaokeQr: KARAOKE ? KARAOKE + "/qr.svg" : "",
    keys: hasFile(path.join(BOX_APPS, "keys/index.html")),
    listen: hasFile(path.join(BOX_APPS, "listen.html")) && (hasFile("/usr/bin/librespot") || hasFile("/usr/bin/shairport-sync") || ytcastReady()),
    radio: hasFile(path.join(BOX_APPS, "radio.html")) && hasFile("/usr/bin/mpv"),
    sheets: hasFile(path.join(BOX_APPS, "sheets.html")) && hasFile("/usr/bin/pdftoppm"),
    retro: hasFile(path.join(BOX_APPS, "retro.html")) && hasFile(RETROARCH), players: hasFile(path.join(BOX_APPS, "players.html")),
    stream: hasFile(BOX_OUT.stream), media: hasFile(BOX_OUT.media), games: await gameStick(),
    start: boxConf("START") || "ask", last: boxLast,
  };
}
const RETRO_HEAVY = /mupen64|parallel_n64|ppsspp|flycast|dolphin|pcsx2/i;
async function boxGo(a, arg) {
  a = String(a || "");
  if (a === "karaoke") { if (!KARAOKE) return { ok: false, error: "not set up" }; win.loadURL(KARAOKE + "/host"); return { ok: true }; }
  if (BOX_PAGES[a] && !(a === "retro" && arg && arg.rom)) {   // (retro with a game starts it: below)
    if (a !== "bloom" && !hasFile(path.join(BOX_APPS, BOX_PAGES[a].replace(/^\/box\//, "").replace(/\?.*$/, "")))) return { ok: false, error: "not installed" };
    win.loadURL(ORIGIN + BOX_PAGES[a]); return { ok: true };
  }
  if (BOX_OUT[a]) {
    if (!hasFile(BOX_OUT[a])) return { ok: false, error: "not installed" };
    try { await fsp.mkdir(BOX_RUN, { recursive: true }); await fsp.writeFile(path.join(BOX_RUN, "next"), a + "\n"); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    boxQuitFor = a; if (!(a === "stream" && listenKeep())) listenStop();   // (music plays on under a game stream; not under Kodi)
    setTimeout(() => app.quit(), 200); return { ok: true };
  }
  if (a === "retro") {   // RetroArch, its own program like Stream: core and game from the picker page, in /run/nb-box/retro
    const o = (arg && typeof arg === "object") ? arg : {};
    const core = String(o.core || "").replace(/[^a-z0-9_]/gi, ""), rom = String(o.rom || "");
    if (!hasFile(RETROARCH) || !core || !hasFile(path.join(CORES, core + "_libretro.so"))) return { ok: false, error: "not installed" };
    const real = await fsp.realpath(rom).catch(() => "");
    if (!(real.startsWith(ROMS_DIR + path.sep) || real.startsWith(USB_ROOT + path.sep)) || !hasFile(real)) return { ok: false, error: "no such game" };
    try { await fsp.mkdir(BOX_RUN, { recursive: true }); await fsp.writeFile(path.join(BOX_RUN, "retro"), JSON.stringify({ core: path.join(CORES, core + "_libretro.so"), rom: real })); await fsp.writeFile(path.join(BOX_RUN, "next"), "retro\n"); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    // 8/16-bit and PS1 leave room for the music; N64 and PSP want the whole Pi
    boxQuitFor = RETRO_HEAVY.test(core) ? "retro-heavy" : "retro"; if (boxQuitFor === "retro-heavy" || !listenKeep()) listenStop();
    setTimeout(() => app.quit(), 200); return { ok: true };
  }
  if (a === "games") { if (!(await gameStick())) return { ok: false, error: "no game stick" }; listenStop(); return boxRun(["games"]); }
  return { ok: false, error: "unknown app" };
}
ipcMain.handle("nb:box-go", (e, a, arg) => BOX ? boxGo(a, arg) : null);
ipcMain.handle("nb:box-apps", () => BOX ? boxApps() : null);
// the power button (box/nb-box-power.py, as root) asks for the home screen by creating /run/nb-box/home;
// ytcast.js asks the radio to stop (a cast starting) with radio-stop
if (BOX) setInterval(() => {
  const rs = path.join(BOX_RUN, "radio-stop"); if (hasFile(rs)) { try { fs.unlinkSync(rs); } catch (e) {} if (listenProcs().some(x => x.name === "radio")) radioStop(); }
  // the phones (box/pad-server.py) ask for a box screen (Players, Games) with /run/nb-box/open; a game being left first
  const op = path.join(BOX_RUN, "open");
  if (hasFile(op)) {
    let busy = false; try { busy = require("child_process").spawnSync("pgrep", ["-x", "retroarch|moonlight-qt|kodi.bin"], { timeout: 1000 }).status === 0; } catch (e) {}
    if (!busy) { let a = ""; try { a = fs.readFileSync(op, "utf8").trim(); fs.unlinkSync(op); } catch (e) {} if (BOX_PAGES[a]) setTimeout(() => boxGo(a), 800); }
  }
  const f = path.join(BOX_RUN, "home");
  if (!hasFile(f)) return;
  try { fs.unlinkSync(f); } catch (e) {}
  if (win && !win.isDestroyed() && hasFile(path.join(BOX_APPS, "home.html"))) win.loadURL(ORIGIN + BOX_PAGES.home);
}, 600);

// (box) Listen: Spotify Connect (librespot, from the raspotify package) and AirPlay (shairport-sync), run by the app
// as the box's user while the Listen page is open, so they play through the same PipeWire output as everything else
// They run detached in their own process group (pids in /run/nb-box/listen.pids), so with "Keep playing" on they go on
// while Moonlight has the screen and the app is closed; the app picks them up again when it comes back.
const LISTEN_NAME = "Nate Bloom Box";
const LISTEN_PIDS = () => path.join(BOX_RUN, "listen.pids");
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
function listenProcs() {
  let l = []; try { l = JSON.parse(fs.readFileSync(LISTEN_PIDS(), "utf8")); } catch (e) {}
  return (Array.isArray(l) ? l : []).filter(p => p && p.pid > 1 && alive(p.pid) && /librespot|shairport|listen-airplay|ytcast|radio/.test(String(p.name)));
}
// YouTube / YouTube Music: ytcast.js (a cast receiver, run with Electron's own Node) playing through mpv + yt-dlp
const YTDLP = "/opt/nb-box/ytdlp/yt-dlp";
const ytcastReady = () => hasFile("/usr/bin/mpv") && hasFile(YTDLP);
const listenSave = l => { try { fs.mkdirSync(BOX_RUN, { recursive: true }); fs.writeFileSync(LISTEN_PIDS(), JSON.stringify(l)); } catch (e) {} };
function listenStart() {
  const have = listenProcs(); if (have.length) return;
  const ev = path.join(BOX_RUN, "listen.json"); try { fs.rmSync(ev); } catch (e) {}
  const l = [];
  const run = (bin, args) => {
    if (!hasFile(bin)) return;
    const p = spawn(bin, args, { stdio: "ignore", detached: true, env: { ...process.env, NB_LISTEN_FILE: ev } });
    p.on("error", () => {}); p.unref(); if (p.pid) l.push({ pid: p.pid, name: path.basename(bin) });
  };
  run("/usr/bin/librespot", ["--name", LISTEN_NAME, "--device-type", "speaker", "--backend", "alsa", "--device", "default", "--bitrate", "320",
    "--initial-volume", "60", "--cache", path.join(app.getPath("userData"), "librespot"), "--disable-audio-cache", "--onevent", "/usr/local/lib/nb-box/listen-event.py"]);
  // AirPlay: a config file instead of options, so its metadata (the song from YouTube, Apple Music…) goes to a pipe that
  // listen-airplay.py reads; a shairport-sync built without metadata support just ignores that part
  if (hasFile("/usr/bin/shairport-sync")) {
    const conf = path.join(app.getPath("userData"), "shairport-sync.conf"), pipe = path.join(BOX_RUN, "airplay-meta");
    try { fs.writeFileSync(conf, `general = { name = "${LISTEN_NAME}"; output_backend = "alsa"; };\nalsa = { output_device = "default"; };\nmetadata = { enabled = "yes"; include_cover_art = "no"; pipe_name = "${pipe}"; };\n`); } catch (e) {}
    run("/usr/bin/shairport-sync", ["-c", conf]);
    if (hasFile("/usr/local/lib/nb-box/listen-airplay.py")) { const p = spawn("/usr/bin/python3", ["/usr/local/lib/nb-box/listen-airplay.py", pipe], { stdio: "ignore", detached: true, env: { ...process.env, NB_LISTEN_FILE: ev } }); p.on("error", () => {}); p.unref(); if (p.pid) l.push({ pid: p.pid, name: "listen-airplay" }); }
  }
  if (ytcastReady()) {
    const cwd = path.join(app.getPath("userData"), "ytcast"); try { fs.mkdirSync(cwd, { recursive: true }); } catch (e) {}
    const p = spawn(process.execPath, [path.join(__dirname, "ytcast.js")], { cwd, stdio: "ignore", detached: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NB_LISTEN_FILE: ev, NB_BOX_RUN: BOX_RUN, NB_YTCAST_FILE: path.join(BOX_RUN, "ytcast.json"), NB_YTCAST_NAME: LISTEN_NAME, NB_YTDLP: YTDLP } });
    p.on("error", () => {}); p.unref(); if (p.pid) l.push({ pid: p.pid, name: "ytcast" });
  }
  listenSave(l);
}
function listenStop() {
  for (const p of listenProcs()) { try { process.kill(-p.pid, "SIGTERM"); } catch (e) { try { process.kill(p.pid, "SIGTERM"); } catch (er) {} } }
  listenSave([]); radioTitle.stop(); for (const f of ["listen.json", "ytcast.json", "radio.json"]) { try { fs.rmSync(path.join(BOX_RUN, f)); } catch (e) {} }
}
// "Keep playing in Nate Bloom, Keys and the home screen": off until switched on in Listen; remembered
const KEEP_FILE = () => path.join(app.getPath("userData"), "listen-keep.json");
function listenKeep(v) {
  if (v === undefined) { try { return !!JSON.parse(fs.readFileSync(KEEP_FILE(), "utf8")).on; } catch (e) { return false; } }
  try { fs.writeFileSync(KEEP_FILE(), JSON.stringify({ on: !!v })); } catch (e) {} return !!v;
}
// the backing track's level: PipeWire's volume on the streams librespot and shairport-sync play into
let listenLevel = 1, listenMuted = false;
async function listenNodes() {
  const pids = new Set(listenProcs().map(p => p.pid));
  return (await pwDump()).filter(o => o.type === "PipeWire:Interface:Node" && o.info && o.info.props && o.info.props["media.class"] === "Stream/Output/Audio" &&
    (pids.has(+o.info.props["application.process.id"]) || /librespot|shairport|nb-ytcast|nb-radio/i.test(String(o.info.props["application.process.binary"] || "") + " " + String(o.info.props["application.name"] || "")))).map(o => o.id);
}
const wp = args => new Promise(res => execFile("wpctl", args, { timeout: 4000 }, err => res(!err)));
async function listenApply() { for (const id of await listenNodes()) { await wp(["set-volume", String(id), listenLevel.toFixed(3)]); await wp(["set-mute", String(id), listenMuted ? "1" : "0"]); } }
function listenStatus() {
  let now = null; try { now = JSON.parse(fs.readFileSync(path.join(BOX_RUN, "listen.json"), "utf8")); } catch (e) {}
  const l = listenProcs();
  let yt = {}; try { yt = JSON.parse(fs.readFileSync(path.join(BOX_RUN, "ytcast.json"), "utf8")); } catch (e) {}
  return { spotify: l.some(p => p.name === "librespot"), airplay: l.some(p => p.name === "shairport-sync"), youtube: l.some(p => p.name === "ytcast"), radio: l.some(p => p.name === "radio"),
    ytCode: yt.code || null, ytPhones: yt.phones || [], name: LISTEN_NAME, now,
    keep: listenKeep(), level: listenLevel, muted: listenMuted };
}
// (a new stream, e.g. the next AirPlay session, starts at full volume: put the chosen level back every few seconds)
if (BOX) setInterval(() => { if ((listenLevel < 0.999 || listenMuted) && listenProcs().length) listenApply(); }, 3000);
// Internet radio (box/apps/radio.html): stations from radio-browser.info, played by mpv as one more Listen source.
// It runs detached like the others, so Keep playing carries it through Nate Bloom, Keys and game streams.
const RADIO_FILE = () => path.join(BOX_RUN, "radio.json"), RADIO_FAVS = () => path.join(app.getPath("userData"), "radio-favs.json");
const radioTitle = { t: 0, stop() { clearInterval(this.t); this.t = 0; } };
function listenNow(o) { try { fs.writeFileSync(path.join(BOX_RUN, "listen.json"), JSON.stringify(Object.assign({ t: Date.now() / 1000 }, o))); } catch (e) {} }
async function radioStart(st) {
  if (!hasFile("/usr/bin/mpv") || !st || !/^https?:\/\//.test(String(st.url || ""))) return { ok: false, error: "no station" };
  radioStop(false);
  try { fs.writeFileSync(path.join(BOX_RUN, "ytcast-stop"), ""); } catch (e) {}   // (one music source at a time: a YouTube cast gives way)
  const sock = path.join(BOX_RUN, "radio.sock"); try { fs.rmSync(sock); } catch (e) {}
  const p = spawn("/usr/bin/mpv", ["--no-video", "--no-terminal", "--audio-client-name=nb-radio", "--input-ipc-server=" + sock, "--volume=70", "--cache=yes", "--cache-secs=8", String(st.url)],
    { stdio: "ignore", detached: true });
  p.on("error", () => {}); p.unref(); if (!p.pid) return { ok: false, error: "mpv didn't start" };
  listenSave(listenProcs().concat([{ pid: p.pid, name: "radio" }]));
  const station = { name: String(st.name || "Radio"), url: String(st.url), favicon: String(st.favicon || ""), uuid: String(st.uuid || ""), country: String(st.country || ""), tags: String(st.tags || "") };
  try { fs.writeFileSync(RADIO_FILE(), JSON.stringify(station)); } catch (e) {}
  listenNow({ name: station.name, artists: "", album: "", state: "playing", source: "Radio" });
  // the song title the stream sends (ICY), every few seconds, from mpv's socket
  radioTitle.stop();
  radioTitle.t = setInterval(() => {
    if (!listenProcs().some(x => x.name === "radio")) { radioTitle.stop(); return; }
    const c = require("net").connect(sock); let buf = "";
    c.on("connect", () => c.write(JSON.stringify({ command: ["get_property", "media-title"], request_id: 1 }) + "\n"));
    c.on("data", d => { buf += d; if (buf.includes("\n")) { try { const m = JSON.parse(buf.split("\n")[0]); const title = m.data && m.data !== station.url ? String(m.data) : "";
      let now = {}; try { now = JSON.parse(fs.readFileSync(path.join(BOX_RUN, "listen.json"), "utf8")); } catch (e) {}
      if (now.source === "Radio" && (now.name !== (title || station.name) || now.artists !== (title ? station.name : ""))) listenNow({ name: title || station.name, artists: title ? station.name : "", album: "", state: "playing", source: "Radio" });
    } catch (e) {} c.destroy(); } });
    c.on("error", () => {}); setTimeout(() => c.destroy(), 3000);
  }, 4000);
  return { ok: true };
}
function radioStop(clear = true) {
  radioTitle.stop();
  const l = listenProcs(); for (const p of l.filter(x => x.name === "radio")) { try { process.kill(p.pid, "SIGTERM"); } catch (e) {} }
  listenSave(l.filter(x => x.name !== "radio"));
  if (clear) { try { fs.rmSync(RADIO_FILE()); } catch (e) {} let now = {}; try { now = JSON.parse(fs.readFileSync(path.join(BOX_RUN, "listen.json"), "utf8")); } catch (e) {} if (now.source === "Radio") listenNow({ state: "idle", source: "Radio" }); }
}
const httpsJson = (url, ms = 12000) => new Promise(res => { const r = net.request({ url, redirect: "follow" }); let b = ""; const t = setTimeout(() => { try { r.abort(); } catch (e) {} res(null); }, ms);
  r.on("response", rs => { rs.on("data", d => { b += d; }); rs.on("end", () => { clearTimeout(t); try { res(JSON.parse(b)); } catch (e) { res(null); } }); rs.on("error", () => { clearTimeout(t); res(null); }); });
  r.on("error", () => { clearTimeout(t); res(null); }); r.setHeader("User-Agent", "NateBloomBox/1.0"); r.end(); });
async function radioSearch(q) {
  q = q && typeof q === "object" ? q : {};
  const u = new URL("https://all.api.radio-browser.info/json/stations/search");
  if (q.name) u.searchParams.set("name", String(q.name).slice(0, 80));
  if (q.tag) u.searchParams.set("tag", String(q.tag).slice(0, 40));
  if (q.country) u.searchParams.set("countrycode", String(q.country).slice(0, 2));
  u.searchParams.set("hidebroken", "true"); u.searchParams.set("order", q.order === "name" ? "name" : "votes"); u.searchParams.set("reverse", q.order === "name" ? "false" : "true"); u.searchParams.set("limit", "60");
  const r = await httpsJson(u.toString());
  if (!Array.isArray(r)) return { ok: false, error: "radio-browser.info didn't answer" };
  return { ok: true, stations: r.filter(s => /^https?:/.test(s.url_resolved || s.url || "")).map(s => ({ uuid: s.stationuuid, name: s.name, url: s.url_resolved || s.url, favicon: s.favicon || "", country: s.countrycode || "", tags: s.tags || "", bitrate: s.bitrate || 0, codec: s.codec || "" })) };
}
ipcMain.handle("nb:box-radio", async (e, cmd, arg) => {
  if (!BOX) return null;
  if (cmd === "play") return radioStart(arg);
  if (cmd === "stop") { radioStop(); return { ok: true }; }
  if (cmd === "search") return radioSearch(arg);
  if (cmd === "favs") { let f = []; try { f = JSON.parse(fs.readFileSync(RADIO_FAVS(), "utf8")); } catch (er) {} if (Array.isArray(arg)) { f = arg.slice(0, 200); try { fs.writeFileSync(RADIO_FAVS(), JSON.stringify(f)); } catch (er) {} } return { ok: true, favs: f }; }
  if (cmd === "status") { let st = null; try { st = JSON.parse(fs.readFileSync(RADIO_FILE(), "utf8")); } catch (er) {} return { ok: true, playing: listenProcs().some(x => x.name === "radio"), station: st }; }
  return { ok: false, error: "unknown" };
});

// Sheet music (box/apps/sheets.html): PDFs from ~/Sheets or a USB stick, drawn page by page with pdftoppm; page turns from
// the keyboard, a touch, the big knob, the controller's pads or the sustain pedal are the page's business
const SHEETS_CACHE = () => path.join(app.getPath("userData"), "sheets-cache");
ipcMain.handle("nb:box-sheets", async (e, cmd, arg) => {
  if (!BOX) return null;
  if (cmd === "list") {
    const out = [];
    async function walk(dir, depth, root, where) {
      if (depth > 4 || out.length >= 2000) return;
      let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (er) { return; }
      ents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      for (const en of ents) {
        if (en.name.startsWith(".")) continue;
        const p = path.join(dir, en.name);
        if (en.isDirectory()) await walk(p, depth + 1, root, where);
        else if (en.isFile() && /\.pdf$/i.test(en.name)) out.push({ path: p, name: en.name.replace(/\.pdf$/i, ""), folder: path.relative(root, dir) || "", where });
      }
    }
    await walk(SHEETS_DIR, 0, SHEETS_DIR, "box");
    let sticks = []; try { sticks = (await fsp.readdir(USB_ROOT, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name); } catch (er) {}
    for (const s of sticks) await walk(path.join(USB_ROOT, s), 0, path.join(USB_ROOT, s), "usb");
    return { ok: true, sheets: out, folder: SHEETS_DIR };
  }
  const real = await fsp.realpath(String(arg && arg.path || "")).catch(() => "");
  if (!(real.startsWith(SHEETS_DIR + path.sep) || real.startsWith(USB_ROOT + path.sep)) || !/\.pdf$/i.test(real) || !hasFile(real)) return { ok: false, error: "no such sheet" };
  if (cmd === "info") return new Promise(res => execFile("pdfinfo", [real], { timeout: 15000 }, (err, out) => res(err ? { ok: false, error: "can't read it" } : { ok: true, pages: +((/^Pages:\s+(\d+)/m.exec(String(out)) || [])[1] || 1) })));
  if (cmd === "page") {
    const n = Math.max(1, Math.floor(+arg.page || 1)), w = Math.min(2600, Math.max(600, Math.floor(+arg.width || 1280)));
    const st = await fsp.stat(real).catch(() => null); if (!st) return { ok: false };
    const key = crypto.createHash("sha1").update(real + "|" + st.mtimeMs + "|" + st.size + "|" + w).digest("hex").slice(0, 16);
    const dir = SHEETS_CACHE(); await fsp.mkdir(dir, { recursive: true }).catch(() => {});
    const base = path.join(dir, key + "-" + n), png = base + ".png";
    if (!hasFile(png)) await new Promise(res => execFile("pdftoppm", ["-png", "-r", "72", "-scale-to-x", String(w), "-scale-to-y", "-1", "-f", String(n), "-l", String(n), "-singlefile", real, base], { timeout: 30000 }, () => res()));
    const b = await fsp.readFile(png).catch(() => null); if (!b) return { ok: false, error: "couldn't draw the page" };
    return { ok: true, png: "data:image/png;base64," + b.toString("base64") };
  }
  return { ok: false, error: "unknown" };
});

// Retro (box/apps/retro.html): the systems RetroArch has cores for, and the games in ~/ROMs/<system> or a stick's roms/<system>
const SYSTEMS = [   // folder, name, cores in order of preference (Debian's libretro-* packages), file types
  ["nes", "NES", ["nestopia", "fceumm"], "nes|zip"], ["snes", "Super Nintendo", ["snes9x", "bsnes_mercury_balanced", "bsnes"], "sfc|smc|zip"],
  ["gb", "Game Boy", ["gambatte", "mgba"], "gb|gbc|zip"], ["gba", "Game Boy Advance", ["mgba"], "gba|zip"],
  ["genesis", "Genesis / Mega Drive", ["genesis_plus_gx", "picodrive"], "md|gen|bin|smd|zip"], ["sms", "Master System", ["genesis_plus_gx", "picodrive"], "sms|gg|zip"],
  ["nds", "Nintendo DS", ["desmume", "melonds"], "nds|zip"], ["psx", "PlayStation", ["beetle_psx", "pcsx_rearmed", "mednafen_psx"], "cue|chd|pbp|m3u"],
  ["n64", "Nintendo 64", ["mupen64plus_next", "mupen64plus", "parallel_n64"], "n64|z64|v64|zip"], ["psp", "PSP", ["ppsspp"], "iso|cso|pbp"],
  ["arcade", "Arcade", ["fbneo", "mame2003_plus", "mame"], "zip"],
];
ipcMain.handle("nb:box-retro", async (e, cmd) => {
  if (!BOX) return null;
  if (cmd !== "list") return { ok: false, error: "unknown" };
  let sticks = []; try { sticks = (await fsp.readdir(USB_ROOT, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => path.join(USB_ROOT, d.name, "roms")); } catch (er) {}
  const systems = [];
  for (const [folder, name, cores, ext] of SYSTEMS) {
    const core = cores.find(c => hasFile(path.join(CORES, c + "_libretro.so")));
    const re = new RegExp("\\.(" + ext + ")$", "i"), games = [];
    for (const root of [ROMS_DIR, ...sticks]) {
      let ents = []; try { ents = await fsp.readdir(path.join(root, folder), { withFileTypes: true }); } catch (er) { continue; }
      for (const en of ents) if (en.isFile() && !en.name.startsWith(".") && re.test(en.name) && games.length < 500) games.push({ name: en.name.replace(/\.[^.]+$/, "").replace(/\s*[\(\[].*$/, "") || en.name, file: en.name, rom: path.join(root, folder, en.name), usb: root !== ROMS_DIR });
    }
    games.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    systems.push({ id: folder, name, core: core || null, heavy: RETRO_HEAVY.test(core || ""), games });
  }
  return { ok: true, systems, folder: ROMS_DIR, retroarch: hasFile(RETROARCH) };
});

// Idle screen (box/apps/idle.js): off until switched on in the home screen's Settings; clock, weather (Open-Meteo, for the
// place typed there), what's playing. The pages do the timing and drawing; this keeps the settings and fetches the weather.
const IDLE_FILE = () => path.join(app.getPath("userData"), "idle.json");
function idleGet() { let o = {}; try { o = JSON.parse(fs.readFileSync(IDLE_FILE(), "utf8")); } catch (e) {} return Object.assign({ on: false, minutes: 5, place: "", lat: null, lon: null, placeName: "", unit: "f" }, o); }
let wx = { t: 0, data: null };
ipcMain.handle("nb:box-idle", async (e, cmd, arg) => {
  if (!BOX) return null;
  if (cmd === "get") return idleGet();
  if (cmd === "set") {
    const o = idleGet(), a = arg && typeof arg === "object" ? arg : {};
    if ("on" in a) o.on = !!a.on;
    if ("minutes" in a) o.minutes = Math.min(60, Math.max(1, Math.floor(+a.minutes) || 5));
    if ("unit" in a) o.unit = a.unit === "c" ? "c" : "f";
    if ("place" in a && String(a.place || "").trim() !== o.place) {
      o.place = String(a.place || "").trim().slice(0, 80); o.lat = o.lon = null; o.placeName = ""; wx = { t: 0, data: null };
      if (o.place) { const g = await httpsJson("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + encodeURIComponent(o.place)); const r = g && g.results && g.results[0];
        if (r) { o.lat = r.latitude; o.lon = r.longitude; o.placeName = [r.name, r.admin1 && r.country_code === "US" ? r.admin1 : r.country].filter(Boolean).join(", "); } else o.placeName = ""; }
    }
    try { fs.writeFileSync(IDLE_FILE(), JSON.stringify(o)); } catch (er) {}
    return o;
  }
  if (cmd === "weather") {
    const o = idleGet(); if (o.lat == null) return { ok: false, error: "no place" };
    if (wx.data && Date.now() - wx.t < 15 * 60000) return wx.data;
    const r = await httpsJson("https://api.open-meteo.com/v1/forecast?latitude=" + o.lat + "&longitude=" + o.lon + "&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=3&timezone=auto&temperature_unit=" + (o.unit === "c" ? "celsius" : "fahrenheit") + "&wind_speed_unit=" + (o.unit === "c" ? "kmh" : "mph"));
    if (!r || !r.current) return { ok: false, error: "no weather" };
    wx = { t: Date.now(), data: { ok: true, place: o.placeName || o.place, unit: o.unit, now: { temp: r.current.temperature_2m, code: r.current.weather_code, wind: r.current.wind_speed_10m }, days: (r.daily.time || []).map((d, i) => ({ day: d, hi: r.daily.temperature_2m_max[i], lo: r.daily.temperature_2m_min[i], code: r.daily.weather_code[i] })) } };
    return wx.data;
  }
  return { ok: false, error: "unknown" };
});

ipcMain.handle("nb:box-listen", async (e, cmd, arg) => {
  if (!BOX) return null;
  if (cmd === "start") listenStart();
  else if (cmd === "stop") listenStop();
  else if (cmd === "keep") listenKeep(!!arg);
  else if (cmd === "level") { const v = +arg; if (v >= 0 && v <= 1) { listenLevel = v; await listenApply(); } }
  else if (cmd === "mute") { listenMuted = !!arg; await listenApply(); }
  return listenStatus();
});
// (quitting for Stream with "Keep playing" on leaves the music running; any other quit stops it)
let boxQuitFor = "";
app.on("before-quit", () => { if (!((boxQuitFor === "stream" || boxQuitFor === "retro") && listenKeep())) listenStop(); });

// (box) Bluetooth: a keyboard, the Xbox controller, headphones. Scanning and pairing need root: the helper does them.
const MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i;
ipcMain.handle("nb:box-bt", async (e, cmd, mac) => {
  if (!BOX) return null;
  cmd = String(cmd || "");
  // pairing with a code: bt-pair.py writes what to show into /run/nb-box/bt-pair.json; the keypad's digits go back in bt-reply
  if (cmd === "pair-status") { try { return JSON.parse(fs.readFileSync(path.join(BOX_RUN, "bt-pair.json"), "utf8")); } catch (er) { return null; } }
  if (cmd === "reply") { const v = String(mac || ""); if (!/^(\d{1,6}|cancel)$/.test(v)) return { ok: false }; try { fs.writeFileSync(path.join(BOX_RUN, "bt-reply"), v); return { ok: true }; } catch (er) { return { ok: false, error: String(er.message || er) }; } }
  if (cmd === "pair") { try { fs.rmSync(path.join(BOX_RUN, "bt-pair.json")); } catch (er) {} }
  if (["pair", "forget", "connect"].includes(cmd)) { if (!MAC.test(String(mac || ""))) return { ok: false, error: "bad address" }; return boxRun(["bt-" + cmd, String(mac).toUpperCase()]); }
  if (!["on", "list", "scan"].includes(cmd)) return { ok: false, error: "unknown" };
  const r = await boxRun(["bt-" + cmd]);
  if (r.ok && cmd !== "on") try { return { ok: true, devices: JSON.parse(r.out) }; } catch (er) { return { ok: false, error: "bad answer" }; }
  return r;
});

// (box) Keys' box API (Keys calls /api/…): saved progress on disk, the sound outputs, power, switching apps
function pwDump() { return new Promise(res => execFile("pw-dump", [], { timeout: 5000, maxBuffer: 32 << 20 }, (err, out) => { try { res(JSON.parse(out)); } catch (x) { res([]); } })); }
async function boxSinks() {
  const d = await pwDump(); let def = "";
  for (const o of d) if (o.type === "PipeWire:Interface:Metadata" && o.props && o.props["metadata.name"] === "default")
    for (const m of o.metadata || []) if (m.key === "default.audio.sink") def = (m.value && m.value.name) || "";
  return d.filter(o => o.type === "PipeWire:Interface:Node" && o.info && o.info.props && o.info.props["media.class"] === "Audio/Sink")
    .map(o => ({ id: o.id, name: o.info.props["node.description"] || o.info.props["node.name"], default: o.info.props["node.name"] === def }));
}
async function boxApi(req, ep) {
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json", ...COI } });
  let body = null; if (req.method === "POST") { try { body = await req.json(); } catch (e) {} }
  const KS = path.join(app.getPath("userData"), "keys-state.json");
  try {
    if (ep === "status") { const s = await boxStatus(); return J({ temp: s.temp, throttled: "0x" + (s.throttled || 0).toString(16), sinks: await boxSinks(), stateFile: true }); }
    if (ep === "state/get") { try { return J(JSON.parse(await fsp.readFile(KS, "utf8"))); } catch (e) { return J(null); } }
    if (ep === "state") { if (body && Array.isArray(body.profiles)) { await fsp.writeFile(KS + ".part", JSON.stringify(body)); await fsp.rename(KS + ".part", KS); } return J({ ok: true }); }
    if (ep === "sink") { const id = parseInt(body && body.id, 10); if (!(id > 0)) return J(null);
      const ok = await new Promise(res => execFile("wpctl", ["set-default", String(id)], { timeout: 5000 }, err => res(!err))); return J(ok ? { ok: true } : null); }
    if (ep === "app") { const to = body && body.to === "home" ? "home" : body && body.to === "keys" ? "keys" : "bloom"; setTimeout(() => boxGo(to), 50); return J({ ok: true }); }
    if (ep === "power") { const a = body && body.action === "shutdown" ? "shutdown" : "reboot"; return J(await boxRun([a])); }
  } catch (e) { return J({ ok: false, error: String(e.message || e) }, 500); }
  return J({ ok: false, error: "unknown" }, 404);
}

// (box) songs from a USB stick for the DJ: nb-box-helper mounts each stick read-only under /media/nb-usb/<device>;
// the page lists them and reads the one it loads. Nothing outside that folder can be listed or read.
const USB_ROOT = "/media/nb-usb";
const MUSIC = /\.(mp3|wav|m4a|aac|flac|ogg|opus|aif|aiff)$/i;
ipcMain.handle("nb:box-music-list", async () => {
  if (!BOX) return null;
  const out = [];
  async function walk(dir, depth, stick) {
    if (depth > 5 || out.length >= 3000) return;
    let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    ents.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    for (const en of ents) {
      if (en.name.startsWith(".") || out.length >= 3000) continue;
      const p = path.join(dir, en.name);
      if (en.isDirectory()) await walk(p, depth + 1, stick);
      else if (en.isFile() && MUSIC.test(en.name)) out.push({ path: p, name: en.name.replace(/\.[^.]+$/, ""), file: en.name, folder: path.relative(path.join(USB_ROOT, stick), dir) || "", stick });
    }
  }
  let sticks = []; try { sticks = (await fsp.readdir(USB_ROOT, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name); } catch (e) {}
  for (const s of sticks) await walk(path.join(USB_ROOT, s), 0, s);
  return { sticks, songs: out };
});
ipcMain.handle("nb:box-music-read", async (e, p) => {
  if (!BOX) return null;
  const real = await fsp.realpath(String(p)).catch(() => "");
  if (!real.startsWith(USB_ROOT + path.sep) || !MUSIC.test(real)) return null;
  const st = await fsp.stat(real).catch(() => null); if (!st || st.size > 400 * 1048576) return null;
  const b = await fsp.readFile(real); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});
ipcMain.handle("nb:box-do", async (e, action) => {
  if (!BOX || !BOX_ACTIONS.has(String(action))) return { ok: false, error: "not an action the box knows" };
  return boxRun([String(action)]);
});

function buildMenu() {
  if (BOX) { Menu.setApplicationMenu(null); return; }   // (box: no menu bar on the kiosk)
  const t = [
    { label: "Nate Bloom", submenu: [
      { label: "Open the Saves Folder", click: async () => { await fsp.mkdir(SAVE_DIR, { recursive: true }); shell.openPath(SAVE_DIR); } },
      { label: "Check for an Update", click: async () => { await checkForUpdate(win); } },
      { type: "separator" },
      { label: "About Nate Bloom", click: () => dialog.showMessageBox(win, { type: "info", title: "Nate Bloom", message: "Nate Bloom " + app.getVersion(), detail: "The same Nate Bloom as the website, as a Linux app.\n" + SITE } ) },
      { role: "quit", accelerator: "Ctrl+Q" },
    ] },
    { label: "View", submenu: [
      { label: "Version", submenu: [
        { label: "Nate Bloom", click: () => win.loadURL(ORIGIN + "/") },
        { label: "Nate Bloom Lite", click: () => win.loadURL(ORIGIN + "/lite/") },
      ] },
      { role: "reload", accelerator: "Ctrl+R" },
      { role: "togglefullscreen", accelerator: "F11" },
      { label: "Across Both Screens", type: "checkbox", checked: WIDE, accelerator: "Ctrl+Shift+F", click: mi => setWide(mi.checked) },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn", accelerator: "Ctrl+=" }, { role: "zoomOut" },
      { type: "separator" },
      { role: "toggleDevTools", accelerator: "Ctrl+Shift+I" },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

// Link: the tablet app finds this computer on the Wi-Fi (when Link is turned on in the page)
let link = null;
function linkUp() {
  if (link) return link;
  link = createLink({ userData: app.getPath("userData"), send: s => { if (win && !win.isDestroyed()) win.webContents.send("nb:link-in", s); }, log: m => { if (process.env.NB_DEBUG) console.log("[nb]", m); } });
  return link;
}
ipcMain.on("nb:link-out", (e, s) => { if (link) link.out(String(s)); });
ipcMain.on("nb:set-wide", (e, on) => setWide(!!on));
ipcMain.handle("nb:wide", async () => ({ wide: WIDE, screens: screen.getAllDisplays().length, how: wideHow, info: wideInfo, bounds: win && !win.isDestroyed() ? win.getBounds() : null,
  displays: screen.getAllDisplays().map(d => ({ bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor })),
  probe: process.env.NB_DEBUG ? await xSpan("probe") : undefined }));   // (the CI check: the helper works from inside the app)
ipcMain.handle("nb:link-status", () => linkUp().status());
ipcMain.handle("nb:link-enable", (e, on) => { linkUp().enable(!!on); return linkUp().status(); });
app.on("before-quit", () => { try { link && link.stop(); } catch (e) {} });

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  dropStaleCache();
  protocol.handle("app", serve);
  const ses = session.defaultSession;
  // MIDI (with SysEx), the microphone, choosing the sound output, and nothing else
  const ok = new Set(["midi", "midiSysex", "media", "speaker-selection", "clipboard-sanitized-write", "fullscreen"]);
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(ok.has(perm) && ((details.requestingUrl || "").startsWith(ORIGIN) || karaokeUrl(details.requestingUrl))));
  ses.setPermissionCheckHandler((wc, perm, origin) => ok.has(perm) && ((origin || "").startsWith(ORIGIN) || karaokeUrl(origin)));
  if (KARAOKE) {   // (box) Karaoke: only its own self-made certificate is trusted, and nothing it sends is kept on disk
    const kHost = new URL(KARAOKE).hostname;
    ses.setCertificateVerifyProc((req, cb) => cb(req.hostname === kHost && KARAOKE_CERT && req.certificate && req.certificate.fingerprint === KARAOKE_CERT ? 0 : -3));
    ses.webRequest.onHeadersReceived({ urls: ["https://*/*", "wss://*/*"] }, (d, cb) => {
      if (!karaokeUrl(d.url)) return cb({});
      const h = d.responseHeaders || {}; for (const k of Object.keys(h)) if (k.toLowerCase() === "cache-control") delete h[k];
      h["Cache-Control"] = ["no-store"]; cb({ responseHeaders: h });
    });
  }
  // (box) Karaoke from a phone: the karaoke page (its TV remote) asks the karaoke server to open Karaoke on the TV or
  // to go back home; this asks the server every 2 s (net.fetch: the pinned certificate above applies). Only commands
  // newer than the last one seen run, and only within 30 s, so nothing stale fires after a restart.
  if (KARAOKE) {
    let boxN = null;
    setInterval(async () => {
      try {
        const r = await net.fetch(KARAOKE + "/api/box", { cache: "no-store" }); if (!r.ok) return;
        const b = await r.json(); if (typeof b.n !== "number") return;
        if (boxN === null) boxN = b.age < 8 ? b.n - 1 : b.n;   // (one sent just before the app started still counts)
        if (b.n <= boxN) return;
        boxN = b.n;
        if (b.age > 30 || !win || win.isDestroyed()) return;
        const onK = karaokeUrl(win.webContents.getURL());
        if (b.cmd === "karaoke" && !onK) boxGo("karaoke");
        else if (b.cmd === "home" && onK) boxGo("home");
      } catch (e) {}
    }, 2000);
  }
  // saves go to Downloads/Nate Bloom, never over an older file
  ses.on("will-download", (e, item) => {
    if (process.env.NB_DEBUG) console.log("[nb] will-download", item.getFilename(), item.getURL().slice(0, 60), SAVE_DIR);
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    const name = item.getFilename().replace(/[\\/:*?"<>|]/g, "_") || "Nate Bloom file";
    let dest = path.join(SAVE_DIR, name), n = 2;
    const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    while (fs.existsSync(dest)) dest = path.join(SAVE_DIR, base + " (" + n++ + ")" + ext);
    item.setSavePath(dest);
    if (process.env.NB_DEBUG) console.log("[nb] saving to", dest);
    item.once("done", (ev, state) => {
      if (process.env.NB_DEBUG) console.log("[nb] download", state, dest);
      if (state !== "completed") return;
      if (win && !win.isDestroyed()) win.webContents.send("nb:saved", "Downloads/Nate Bloom/" + path.basename(dest));
      if (Notification.isSupported()) { const nt = new Notification({ title: "Saved", body: "Downloads/Nate Bloom/" + path.basename(dest), silent: true }); nt.on("click", () => shell.showItemInFolder(dest)); nt.show(); }
    });
  });
  buildMenu();
  createWindow();
  linkUp();   // (listens only if Link was turned on)
});

// while something plays, the computer doesn't sleep underneath it
ipcMain.on("nb:playing", (e, on) => {
  if (on && blocker == null) blocker = powerSaveBlocker.start("prevent-app-suspension");
  if (!on && blocker != null) { powerSaveBlocker.stop(blocker); blocker = null; }
});
ipcMain.on("nb:toast", (e, msg) => { if (Notification.isSupported()) new Notification({ title: "Nate Bloom", body: String(msg).slice(0, 200), silent: true }).show(); });
ipcMain.handle("nb:version", () => app.getVersion());
// (193) the low-latency output: what this start uses, the choice for the next start, and a restart to apply it
const llFile = () => path.join(app.getPath("userData"), "low-latency.json");
ipcMain.on("nb:ll-active", e => { e.returnValue = global.NB_LL_ACTIVE || 0; });
ipcMain.handle("nb:low-latency", (e, set) => {
  if (set && typeof set === "object") { try { fs.writeFileSync(llFile(), JSON.stringify({ on: !!set.on, frames: Math.max(64, Math.min(2048, +set.frames || 256)) })); } catch (er) {} }
  let ll = null; try { ll = JSON.parse(fs.readFileSync(llFile(), "utf8")); } catch (er) {}
  return { active: global.NB_LL_ACTIVE || 0, next: !ll || ll.on ? (+(ll && ll.frames) || 256) : 0 };
});
ipcMain.handle("nb:restart", () => { app.relaunch(); app.exit(0); });
// (198) Linux's own volumes for the audio interface (PipeWire/PulseAudio, through pactl): the interface's input, its
// output, and this app's own playback stream. Any of them below 100% makes recordings (and everything Nate Bloom
// plays) quieter than the interface's direct monitoring, which reads as thin. nb:levels reads them, nb:levels-fix
// sets them to 100% and unmutes.
const PA_RE = /volt|interface|usb audio|scarlett|audiobox|motu|rme|komplete|steinberg|ur\d|behringer|presonus/i;
function pactl(args) {
  return new Promise(res => { try { require("child_process").execFile("pactl", args, { timeout: 4000, maxBuffer: 4 << 20 }, (e, out) => res(e ? null : String(out))); } catch (er) { res(null); } });
}
const paPct = v => { try { const vals = Object.values(v || {}).map(c => +String(c.value_percent || "").replace("%", "")).filter(n => Number.isFinite(n)); return vals.length ? Math.round(Math.max(...vals)) : null; } catch (e) { return null; } };
async function paLevels() {
  const [src, snk, si] = await Promise.all([pactl(["-f", "json", "list", "sources"]), pactl(["-f", "json", "list", "sinks"]), pactl(["-f", "json", "list", "sink-inputs"])]);
  if (src == null && snk == null) return { err: "pactl isn't available" };
  const J = t => { try { return JSON.parse(t || "[]"); } catch (e) { return []; } };
  const pick = L => { const isIf = x => PA_RE.test((x.description || "") + " " + (x.name || "")); return L.find(x => isIf(x) && !/monitor/i.test(x.name || "")) || null; };
  const one = x => x ? { name: x.description || x.name, pct: paPct(x.volume), mute: !!x.mute, id: x.index != null ? x.index : x.name } : null;
  const mine = J(si).filter(x => { const p = x.properties || {}; return /nate.?bloom|electron|chrom/i.test((p["application.name"] || "") + " " + (p["application.process.binary"] || "")); });
  return { source: one(pick(J(src))), sink: one(pick(J(snk))), streams: mine.map(x => ({ id: x.index, pct: paPct(x.volume), mute: !!x.mute, app: (x.properties || {})["application.name"] || "" })) };
}
// (199) the plugin store: free, open-source plugins fetched from their projects' own Linux releases into ~/.clap,
// ~/.vst3 or ~/.lv2 (plugin-store.js). Progress goes to the page as nb:store-progress.
let store = null; try { store = require("./plugin-store.js"); } catch (e) { console.warn("plugin store:", e && e.message); }
const storeBusy = new Set();
ipcMain.handle("nb:store-list", () => store ? store.list(app.getPath("userData")) : []);
ipcMain.handle("nb:store-install", async (e, id) => {
  if (!store) return { ok: false, error: "the plugin store isn't in this app" };
  id = String(id); if (storeBusy.has(id)) return { ok: false, error: "already installing" }; storeBusy.add(id);
  const send = m => { try { if (win && !win.isDestroyed()) win.webContents.send("nb:store-progress", m); } catch (er) {} };
  try { const r = await store.install(id, { cfgDir: app.getPath("userData"), onProgress: send }); return { ok: true, ...r }; }
  catch (er) { send({ id, stage: "failed", error: String(er && er.message || er) }); return { ok: false, error: String(er && er.message || er) }; }
  finally { storeBusy.delete(id); }
});
// (205) a factory preset from an installed plugin's own data folder (~/.local/share/<its folder>), for the doorways:
// the file's bytes as base64, or null. Only .fxp/.vstpreset/.xml/.syx/.sfz under those folders, at most 8 MB.
ipcMain.handle("nb:plug-preset", async (e, rel) => {
  try {
    const fsp = require("fs").promises, base = path.join(require("os").homedir(), ".local", "share");
    const full = path.resolve(base, String(rel || ""));
    if (!full.startsWith(base + path.sep) || !/\.(fxp|vstpreset|xml|syx|sfz)$/i.test(full)) return null;
    const st = await fsp.stat(full); if (!st.isFile() || st.size > 8 * 1024 * 1024) return null;
    return (await fsp.readFile(full)).toString("base64");
  } catch (er) { return null; }
});
// (205) the names of the presets in one of those folders (for the doorway banks), up to 2000
ipcMain.handle("nb:plug-presets", async (e, rel) => {
  try {
    const fsp = require("fs").promises, base = path.join(require("os").homedir(), ".local", "share");
    const root = path.resolve(base, String(rel || "")); if (!root.startsWith(base + path.sep)) return [];
    const out = [];
    async function walk(d, depth) { if (depth > 4 || out.length > 2000) return; let ents = []; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch (er) { return; }
      for (const x of ents) { const f = path.join(d, x.name); if (x.isDirectory()) await walk(f, depth + 1); else if (/\.(fxp|vstpreset|xml|syx|sfz)$/i.test(x.name)) out.push(path.relative(base, f)); } }
    await walk(root, 0); return out;
  } catch (er) { return []; }
});
ipcMain.handle("nb:store-remove", async (e, id) => store ? store.remove(String(id), { cfgDir: app.getPath("userData") }) : false);
// (232) the app itself (the plugin store, the bridge, the native engine) updates only with a new package: the newest
// Linux release on GitHub, and one tap to download its .deb and open it in Mint's package installer
const verNum = v => String(v || "").replace(/^[^\d]*/, "").split(".").map(x => parseInt(x, 10) || 0);
const verNewer = (a, b) => { const A = verNum(a), B = verNum(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0); } return false; };
let shellRel = null;
ipcMain.handle("nb:shell-latest", async () => {
  try {
    const r = await net.fetch("https://api.github.com/repos/nathan-san1981/nate-bloom/releases?per_page=15", { headers: { Accept: "application/vnd.github+json", "User-Agent": "nate-bloom-app" } });
    if (!r.ok) return { current: app.getVersion(), err: "HTTP " + r.status };
    const WIN = process.platform === "win32", PI = !WIN && process.arch === "arm64", TAG = WIN ? /^win-v/ : PI ? /^pi-v/ : /^linux-v/;   // (234) the Windows app: its own releases, the Setup .exe; (box) ARM64 Linux: the Pi's own (pi.yml)
    const rel = (await r.json()).find(x => TAG.test(x.tag_name) && !x.draft); if (!rel) return { current: app.getVersion() };
    const ARM = process.arch === "arm64";   // (236) an ARM64 Windows app updates to the ARM64 installer
    const deb = (rel.assets || []).find(a => WIN ? /setup.*\.exe$/i.test(a.name) && /arm64/i.test(a.name) === ARM : /\.deb$/i.test(a.name));
    shellRel = { latest: rel.tag_name.replace(/^(linux|win|pi)-v/, ""), deb: deb ? deb.browser_download_url : "", name: deb ? deb.name : "" };
    return { current: app.getVersion(), latest: shellRel.latest, newer: verNewer(shellRel.latest, app.getVersion()), hasDeb: !!deb };
  } catch (er) { return { current: app.getVersion(), err: String(er && er.message || er) }; }
});
ipcMain.handle("nb:shell-install", async () => {
  try {
    if (!shellRel || !shellRel.deb) return { ok: false, error: "no package found" };
    await fsp.mkdir(SAVE_DIR, { recursive: true });
    const dest = path.join(SAVE_DIR, shellRel.name);
    const r = await net.fetch(shellRel.deb); if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    await fsp.writeFile(dest + ".part", Buffer.from(await r.arrayBuffer())); await fsp.rename(dest + ".part", dest);
    if (process.platform === "win32") { require("child_process").spawn(dest, ["--updated"], { detached: true, stdio: "ignore" }).unref(); setTimeout(() => app.quit(), 1500); return { ok: true, file: dest }; }   // (the installer replaces the app and starts it again)
    if (BOX) { const r = await boxRun(["install-deb", dest]); return { ok: r.ok, file: dest, error: r.error }; }   // (box: installed by the helper, which restarts the app)
    const why = await shell.openPath(dest);   // (Mint's package installer: Install Package, then reopen Nate Bloom)
    return { ok: !why, file: dest, error: why || "" };
  } catch (er) { return { ok: false, error: String(er && er.message || er) }; }
});
ipcMain.handle("nb:levels", () => paLevels());
ipcMain.handle("nb:levels-fix", async () => {
  const L = await paLevels(); if (L.err) return L;
  const jobs = [];
  if (L.source) jobs.push(pactl(["set-source-volume", String(L.source.id), "100%"]), pactl(["set-source-mute", String(L.source.id), "0"]));
  if (L.sink) jobs.push(pactl(["set-sink-volume", String(L.sink.id), "100%"]), pactl(["set-sink-mute", String(L.sink.id), "0"]));
  for (const s of L.streams || []) jobs.push(pactl(["set-sink-input-volume", String(s.id), "100%"]), pactl(["set-sink-input-mute", String(s.id), "0"]));
  await Promise.all(jobs); return paLevels();
});
// (177) VST3 and CLAP plugins (plugins.js: finding them, the scan in its own process, crash notes)
let plugs = null;
try { plugs = require("./plugins.js").setup({ app, ipcMain, dialog, getWin: () => win, log: m => { if (process.env.NB_DEBUG) console.log("[nb]", m); } }); } catch (e) { console.warn("plugins:", e && e.message); }
// (179) the CPU meter: measured, not estimated. Each second the page asks; this reads the kernel's own counts
// (/proc) for the whole computer and each core, and for the page's threads by name: the browser's real-time audio
// thread ("Realtime AudioW…", where every browser synth and effect is worked out), the native engine's ("nb-engine",
// "nb-eng-w…") and each plugin's ("nb-plug-<n>"). A thread at 100% of one core has no time left: that's a dropout.
// Nate Bloom as a whole comes from Electron's own per-process figures.
let cpuPrev = null;
const cpuStat = () => fs.readFileSync("/proc/stat", "utf8").split("\n").filter(l => /^cpu\d* /.test(l)).map(l => { const f = l.trim().split(/\s+/).slice(1, 9).map(Number); return { idle: f[3] + (f[4] || 0), tot: f.reduce((a, b) => a + b, 0) }; });
function cpuThreads(pid) {
  const out = {};
  let ts = []; try { ts = fs.readdirSync("/proc/" + pid + "/task"); } catch (e) { return out; }
  for (const t of ts) { try { const s = fs.readFileSync("/proc/" + pid + "/task/" + t + "/stat", "utf8"), i = s.lastIndexOf(")"), f = s.slice(i + 2).split(" "); out[t] = { comm: s.slice(s.indexOf("(") + 1, i), ticks: +f[11] + +f[12] }; } catch (e) {} }
  return out;
}
// (187) the Nate Bloom Bridge plugin for Bitwig: shipped inside the app, copied into ~/.clap (where Bitwig and other
// CLAP hosts look; no root needed) whenever it's missing or a newer one came with the app. A copy, not a link: the
// AppImage's own folder changes every time it opens.
const bridgePlugin = { path: "", installed: false, why: "" };
function installBridgePlugin() {
  try {
    const cands = [path.join(process.resourcesPath || "", "clap", "NateBloomBridge.clap"), path.join(__dirname, "native", "build", "Release", "NateBloomBridge.clap")];
    const src = cands.find(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
    if (!src) { bridgePlugin.why = "this build has no bridge plugin"; return; }
    const dir = path.join(require("os").homedir(), ".clap"), dst = path.join(dir, "NateBloomBridge.clap");
    fs.mkdirSync(dir, { recursive: true });
    let same = false; try { const a = fs.readFileSync(src), b = fs.readFileSync(dst); same = a.length === b.length && a.equals(b); } catch (e) {}
    if (!same) { fs.copyFileSync(src, dst + ".part"); fs.chmodSync(dst + ".part", 0o755); fs.renameSync(dst + ".part", dst); }
    Object.assign(bridgePlugin, { path: dst, installed: true, why: "", updated: !same });
  } catch (e) { bridgePlugin.why = String(e && e.message || e); }
}
installBridgePlugin();
ipcMain.handle("nb:bridge-plugin", () => bridgePlugin);
// (237) the programs using the computer besides Nate Bloom: every process's ticks from /proc, the busiest three by name
let topPrev = null;
function topOthers(dt, ours) {
  const now = {}; let names = {};
  try { for (const d of fs.readdirSync("/proc")) { if (!/^\d+$/.test(d) || ours.has(+d)) continue;
    try { const s = fs.readFileSync("/proc/" + d + "/stat", "utf8"), i = s.lastIndexOf(")"), f = s.slice(i + 2).split(" "); now[d] = +f[11] + +f[12]; names[d] = s.slice(s.indexOf("(") + 1, i); } catch (e) {} } } catch (e) {}
  const prev = topPrev; topPrev = now; if (!prev) return [];
  const by = {}, pids = {};
  for (const d in now) { if (prev[d] == null) continue; const p = (now[d] - prev[d]) / 100 / dt * 100; if (p < 5) continue;
    let nm = names[d]; try { const c = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").split("\0").filter(Boolean); const scr = c.slice(1).find(a => /\.(py|js|sh)$/.test(a)); if (scr) nm += " " + path.basename(scr); } catch (e) {}
    by[nm] = (by[nm] || 0) + p; (pids[nm] = pids[nm] || []).push(+d); }
  return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, p]) => ({ name: n, pct: Math.round(p), pids: pids[n], waits: pids[n].every(isIdle) }));
}
// (243) a heavy background job of the user's own (Storytime recording voices, say) made to wait for the sound: every thread
// of it to the idle class (SCHED_IDLE) at the lowest priority. It still uses every core when they're free; it gives them
// up the moment Nate Bloom's audio, or anything else, needs one. Only the user's own processes (no root needed).
const myUid = (() => { try { return process.getuid(); } catch (e) { return -1; } })();
function isIdle(pid) { try { const s = fs.readFileSync("/proc/" + pid + "/sched", "utf8"); return /^policy\s*:\s*5$/m.test(s); } catch (e) { return false; } }
function ownedByMe(pid) { try { return fs.statSync("/proc/" + pid).uid === myUid; } catch (e) { return false; } }
function makeWait(pids) {
  const done = [];
  for (const pid of pids || []) {
    if (!ownedByMe(pid) || isIdle(pid)) continue;
    let tids = []; try { tids = fs.readdirSync("/proc/" + pid + "/task"); } catch (e) {}
    for (const t of tids) { try { require("child_process").spawnSync("chrt", ["-i", "-p", "0", t], { timeout: 1500 }); } catch (e) {} try { require("os").setPriority(+t, 19); } catch (e) {} }
    try { require("child_process").spawnSync("ionice", ["-c", "3", "-p", String(pid)], { timeout: 1500 }); } catch (e) {}
    done.push(pid);
  }
  return done;
}
// Storytime's voice recording waits by itself, whenever Nate Bloom is open
const AUTO_WAIT = /storytime|kokoro/i;
let waited = [];
setInterval(() => {
  if (process.platform !== "linux") return;
  try { for (const d of fs.readdirSync("/proc")) { if (!/^\d+$/.test(d)) continue; let c = ""; try { c = fs.readFileSync("/proc/" + d + "/cmdline", "utf8").replace(/\0/g, " "); } catch (e) { continue; }
    if (!AUTO_WAIT.test(c) || /nate.?bloom|electron/i.test(c)) continue; const r = makeWait([+d]); if (r.length) waited.push({ pid: +d, what: c.slice(0, 80), at: Date.now() }); } } catch (e) {}
  if (waited.length > 20) waited = waited.slice(-20);
}, 5000);
ipcMain.handle("nb:make-wait", (e, pids) => process.platform === "linux" ? makeWait(Array.isArray(pids) ? pids.map(Number).filter(n => n > 1) : []) : []);
ipcMain.handle("nb:waited", () => waited);
// (237) Windows: the whole computer from os.cpus(), Nate Bloom from Electron's own figures (no per-thread view)
let winCpuPrev = null;
function winCpu() {
  const cs = require("os").cpus().map(c => { const t = c.times; return { idle: t.idle, tot: t.user + t.nice + t.sys + t.idle + t.irq }; });
  const prev = winCpuPrev; winCpuPrev = cs; let appPct = 0; try { appPct = app_metrics(); } catch (e) {}
  if (!prev) return { warming: true };
  const busy = (a, b) => { const dT = a.tot - b.tot; return dT > 0 ? Math.round((1 - (a.idle - b.idle) / dT) * 1000) / 10 : 0; };
  const cores = cs.map((c, i) => busy(c, prev[i])), sum = k => cs.reduce((a, c) => a + c[k], 0), psum = k => prev.reduce((a, c) => a + c[k], 0);
  const dT = sum("tot") - psum("tot"), computer = dT > 0 ? Math.round((1 - (sum("idle") - psum("idle")) / dT) * 1000) / 10 : 0;
  return { secs: 1, computer, busiestCore: Math.max(...cores), cores: cores.length, app: appPct, audio: null, audioOut: 0, engine: [], plugins: {}, pluginMain: 0, others: [] };
}
ipcMain.handle("nb:cpu", () => {
  if (process.platform === "win32") return winCpu();
  if (process.platform !== "linux" || !win || win.isDestroyed()) return null;
  const t = Number(process.hrtime.bigint()) / 1e9, pid = win.webContents.getOSProcessId(), st = cpuStat(), th = cpuThreads(pid);
  let appPct = 0; try { appPct = app_metrics(); } catch (e) {}
  // (184) the plugins' own processes (children of the page's): their threads, named nb-ph-<n>
  const kids = {}; try { for (const d of fs.readdirSync("/proc")) { if (!/^\d+$/.test(d)) continue; try { const s = fs.readFileSync("/proc/" + d + "/stat", "utf8"), f = s.slice(s.lastIndexOf(")") + 2).split(" "); if (+f[1] === pid) Object.assign(kids, Object.fromEntries(Object.entries(cpuThreads(+d)).map(([k, v]) => [d + ":" + k, v]))); } catch (e) {} } } catch (e) {}
  Object.assign(th, kids);
  const prev = cpuPrev; cpuPrev = { t, pid, st, th };
  if (!prev || prev.pid !== pid || t - prev.t < 0.25) return { warming: true };
  const dt = t - prev.t, HZ = 100, pct = (a, b) => Math.round(Math.max(0, a - b) / HZ / dt * 1000) / 10;
  const busy = (a, b) => { const dT = a.tot - b.tot; return dT > 0 ? Math.round((1 - (a.idle - b.idle) / dT) * 1000) / 10 : 0; };
  const cores = st.slice(1).map((c, i) => prev.st[i + 1] ? busy(c, prev.st[i + 1]) : 0);
  const r = { secs: Math.round(dt * 100) / 100, computer: prev.st[0] ? busy(st[0], prev.st[0]) : 0, busiestCore: cores.length ? Math.max(...cores) : 0, cores: cores.length, app: appPct, audio: 0, audioOut: 0, engine: [], plugins: {}, pluginMain: 0 };
  for (const id in th) {
    const a = th[id], b = prev.th[id]; if (!b || b.comm !== a.comm) continue;
    const p = pct(a.ticks, b.ticks), c = a.comm;
    if (c.startsWith("Realtime AudioW")) r.audio = Math.max(r.audio, p);
    else if (c.startsWith("AudioOutputDevi")) r.audioOut = Math.max(r.audioOut, p);
    else if (c === "nb-engine" || c.startsWith("nb-eng-w")) r.engine.push(p);
    else if (c === "nb-plugmain") r.pluginMain += p;
    else if (c.startsWith("nb-plug-")) r.plugins[c.slice(8)] = (r.plugins[c.slice(8)] || 0) + p;
    else if (c.startsWith("nb-ph-")) r.plugins[c.slice(6)] = (r.plugins[c.slice(6)] || 0) + p;
    if (id.includes(":")) r.app += p;   // (Electron's own figures don't count the plugins' processes)
  }
  r.app = Math.round(r.app * 10) / 10;
  try { const ours = new Set(app.getAppMetrics().map(m => m.pid).concat(Object.keys(kids).map(k => +k.split(":")[0]).filter(Boolean))); r.others = topOthers(dt, ours); } catch (e) { r.others = []; }
  return r;
});
// Nate Bloom's processes together, in % of one core (Electron measures each since the last call)
function app_metrics() { return Math.round(app.getAppMetrics().reduce((a, m) => a + ((m.cpu && m.cpu.percentCPUUsage) || 0), 0) * 10) / 10; }
ipcMain.handle("nb:xid", () => { try { const b = win.getNativeWindowHandle(); return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0); } catch (e) { return 0; } });

app.on("window-all-closed", () => app.quit());
