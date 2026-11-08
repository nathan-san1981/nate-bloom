// Nate Bloom for Linux (Mint and other Ubuntu-based systems).
// The app is the same Nate Bloom as the website, served from inside the app at app://nate-bloom/ so it works
// offline and keeps its own storage. It updates itself from the website in the background; instruments and
// library sounds are kept after their first download. Saves land in Downloads/Nate Bloom.
const { app, BrowserWindow, Menu, Notification, net, powerSaveBlocker, protocol, session, shell, ipcMain, dialog, screen } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
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
  app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess,Translate,MediaRouter,HardwareMediaKeyHandling");
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
  if (BOX) st = { width: 1280, height: 720 };   // (box: the whole screen, nothing remembered)
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
    if (st.wide) {
      wideMax = !!st.max; wideBack = !wideMax && Number.isFinite(st.x) ? { x: st.x, y: st.y, width: st.width, height: st.height } : null;
      wideHow = "starting"; setTimeout(() => setWide(true), 600);   // (once the desktop has the window)
    }
  });
  const saveState = () => { try { const b = WIDE ? (wideBack || { width: 1280, height: 800 }) : win.getNormalBounds(); fs.writeFileSync(statePath, JSON.stringify({ ...b, max: WIDE ? wideMax : win.isMaximized(), wide: WIDE })); } catch (e) {} };
  win.webContents.on("did-finish-load", () => { if (WIDE) win.webContents.send("nb:wide", true); });
  // screens plugged in or out while it's across them: it fits what's there now (not on every small change)
  let lastScreens = "";
  const screensKey = () => screen.getAllDisplays().map(d => [d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height].join(",")).join(" ");
  lastScreens = screensKey();
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"]) screen.on(ev, () => {
    setTimeout(() => { const k = screensKey(); if (k === lastScreens) return; lastScreens = k; if (WIDE && win && !win.isDestroyed()) setWide(true); }, 600);
  });
  // F11 (or the desktop) taking it out of fullscreen while it's across the screens: that's across both screens off
  win.on("leave-full-screen", () => { if (WIDE && wideHow === "fullscreen" && Date.now() - ownFs > 1500) { WIDE = false; wideHow = ""; ++wideSeq; xSpan("off"); wideBack = null; wideMax = false; wideTell(); } });
  // Ctrl+Shift+F works with the menu bar hidden too (and only once)
  win.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && i.control && i.shift && !i.alt && !i.meta && i.code === "KeyF") { e.preventDefault(); setWide(!WIDE); } });
  if (!BOX) win.on("close", saveState);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (process.env.NB_DEBUG) console.log("[nb] will-navigate", url.slice(0, 80)); if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
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
  win.loadURL(ORIGIN + (BOX ? "/?box=1" : "/"));
  win.webContents.once("did-finish-load", () => setTimeout(() => checkForUpdate(win), 4000));
}

// (box) what only the Box asks of the computer: temperature, power, Wi-Fi, shutdown. Everything that needs root goes
// through one small script (box/nb-box-helper, allowed for the box's user by sudoers) and only with the actions it knows.
const BOX_ACTIONS = new Set(["shutdown", "reboot", "wifi-on", "wifi-off", "rotate-90", "rotate-270", "scale-125", "scale-133", "scale-150", "restart-app"]);
const boxRun = args => new Promise(res => execFile("sudo", ["-n", BOX_HELPER, ...args], { timeout: 120000 }, (err, out, errOut) => res({ ok: !err, out: String(out || "").trim(), error: err ? String(errOut || err.message || err).trim() : "" })));
ipcMain.handle("nb:box-status", async () => {
  if (!BOX) return null;
  const s = { temp: null, throttled: null, undervolt: false, hot: false, wifi: null, output: null };
  try { s.temp = Math.round(+fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8") / 100) / 10; } catch (e) {}
  const r = await boxRun(["status"]);
  if (r.ok) try { Object.assign(s, JSON.parse(r.out)); } catch (e) {}
  if (s.throttled != null) { s.undervolt = !!(s.throttled & 0x1); s.hot = !!(s.throttled & 0x8) || (s.temp || 0) >= 80; }
  return s;
});
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
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(ok.has(perm) && (details.requestingUrl || "").startsWith(ORIGIN)));
  ses.setPermissionCheckHandler((wc, perm, origin) => ok.has(perm) && (origin || "").startsWith(ORIGIN));
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
