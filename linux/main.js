// Nate Bloom for Linux (Mint and other Ubuntu-based systems).
// The app is the same Nate Bloom as the website, served from inside the app at app://nate-bloom/ so it works
// offline and keeps its own storage. It updates itself from the website in the background; instruments and
// library sounds are kept after their first download. Saves land in Downloads/Nate Bloom.
const { app, BrowserWindow, Menu, Notification, net, powerSaveBlocker, protocol, session, shell, ipcMain, dialog } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const SITE = "https://nathan-san1981.github.io/nate-bloom/";
const REMOTE_WAF = "https://surikov.github.io/webaudiofontdata/sound/";
const ORIGIN = "app://nate-bloom";
const BUNDLED = app.isPackaged ? path.join(process.resourcesPath, "site") : path.join(__dirname, "site");
const CACHE = path.join(app.getPath("userData"), "site");   // newer pages and downloaded sounds
// saves: Downloads/Nate Bloom (a system without a Downloads folder set gets ~/Downloads)
const SAVE_DIR = (() => { let d = app.getPath("downloads"); if (path.resolve(d) === path.resolve(app.getPath("home"))) d = path.join(d, "Downloads"); return path.join(d, "Nate Bloom"); })();

app.setName("Nate Bloom");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
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

async function serve(req) {
  const u = new URL(req.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  rel = rel.replace(/^lite\/(snd|inst)\//, "$1/");   // Lite shares the instruments and sounds
  if (rel === "sw.js" || rel === "lite/sw.js") return new Response("", { status: 404 });   // no service worker: the app is its own offline copy
  for (const root of [CACHE, BUNDLED]) {
    const p = inside(root, rel);
    if (p && await exists(p)) return new Response(fs.createReadStream(p), { headers: { "content-type": typeOf(p), "cache-control": "no-cache" } });
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
    return new Response(buf, { headers: { "content-type": typeOf(rel) } });
  } catch (e) {
    return new Response("", { status: 404 });
  }
}

// a newer website: fetched quietly, used the next time the app opens
async function checkForUpdate(win) {
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

function createWindow() {
  const statePath = path.join(app.getPath("userData"), "window.json");
  let st = { width: 1280, height: 800 };
  try { st = Object.assign(st, JSON.parse(fs.readFileSync(statePath, "utf8"))); } catch (e) {}
  win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y, minWidth: 360, minHeight: 560, show: false,
    title: "Nate Bloom", backgroundColor: "#13111b", autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  if (st.max) win.maximize();
  win.once("ready-to-show", () => win.show());
  const saveState = () => { try { const b = win.getNormalBounds(); fs.writeFileSync(statePath, JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) {} };
  win.on("close", saveState);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (process.env.NB_DEBUG) console.log("[nb] will-navigate", url.slice(0, 80)); if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on("render-process-gone", (e, d) => { if (d.reason !== "clean-exit") setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 800); });
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
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn", accelerator: "Ctrl+=" }, { role: "zoomOut" },
      { type: "separator" },
      { role: "toggleDevTools", accelerator: "Ctrl+Shift+I" },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

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
});

// while something plays, the computer doesn't sleep underneath it
ipcMain.on("nb:playing", (e, on) => {
  if (on && blocker == null) blocker = powerSaveBlocker.start("prevent-app-suspension");
  if (!on && blocker != null) { powerSaveBlocker.stop(blocker); blocker = null; }
});
ipcMain.on("nb:toast", (e, msg) => { if (Notification.isSupported()) new Notification({ title: "Nate Bloom", body: String(msg).slice(0, 200), silent: true }).show(); });
ipcMain.handle("nb:version", () => app.getVersion());

app.on("window-all-closed", () => app.quit());
