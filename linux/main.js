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
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// (173) a computer, not a tablet: the page may use up to 8 GB for long takes, big samples and many instruments
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=8192");
// (174) the sound's audio thread (where every synth, plugin and effect is worked out) at real-time priority, so the
// rest of the computer can't push it late; Mint's rtkit grants it. Unknown names are ignored by Electron.
app.commandLine.appendSwitch("enable-features", "AudioWorkletRealtimeThread,AudioWorkletThreadRealtimePriority");
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
  win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y, minWidth: 360, minHeight: 560, show: false,
    title: "Nate Bloom", backgroundColor: "#13111b", autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, additionalArguments: ["--nb-userdata=" + app.getPath("userData")] },
  });
  if (st.max && !st.wide) win.maximize();
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
  win.on("close", saveState);
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
  win.loadURL(ORIGIN + "/");
  win.webContents.once("did-finish-load", () => setTimeout(() => checkForUpdate(win), 4000));
}

function buildMenu() {
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
ipcMain.handle("nb:cpu", () => {
  if (process.platform !== "linux" || !win || win.isDestroyed()) return null;
  const t = Number(process.hrtime.bigint()) / 1e9, pid = win.webContents.getOSProcessId(), st = cpuStat(), th = cpuThreads(pid);
  let appPct = 0; try { appPct = app_metrics(); } catch (e) {}
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
  }
  return r;
});
// Nate Bloom's processes together, in % of one core (Electron measures each since the last call)
function app_metrics() { return Math.round(app.getAppMetrics().reduce((a, m) => a + ((m.cpu && m.cpu.percentCPUUsage) || 0), 0) * 10) / 10; }
ipcMain.handle("nb:xid", () => { try { const b = win.getNativeWindowHandle(); return b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0); } catch (e) { return 0; } });

app.on("window-all-closed", () => app.quit());
