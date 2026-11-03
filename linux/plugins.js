// (177) VST3 and CLAP plugins, the app's side: where they're looked for, the scan (in its own process, plugscan.js),
// what was found (kept in plugins.json in the app's folder, so a plugin is looked at again only when its file
// changes), the folders you add, and which plugins were loaded when the page crashed (those don't load by
// themselves the next time: plug-suspect.json).
const fs = require("fs"), fsp = fs.promises, path = require("path"), os = require("os");
const { spawn } = require("child_process");

function setup({ app, ipcMain, dialog, getWin, log }) {
  const UD = app.getPath("userData");
  const CACHE = path.join(UD, "plugins.json"), FOLDERS = path.join(UD, "plugin-folders.json"), LIVE = path.join(UD, "plug-live.json"), SUSPECT = path.join(UD, "plug-suspect.json");
  const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
  const writeJ = (f, v) => { try { fs.writeFileSync(f + ".part", JSON.stringify(v)); fs.renameSync(f + ".part", f); } catch (e) {} };
  const home = os.homedir(), env = k => (process.env[k] || "").split(":").filter(Boolean);
  function folders() {
    const own = readJ(FOLDERS, []);
    return {
      vst3: [...new Set([path.join(home, ".vst3"), "/usr/lib/vst3", "/usr/local/lib/vst3", "/usr/lib64/vst3", "/usr/local/lib64/vst3", ...env("VST3_PATH"), ...own])],
      clap: [...new Set([path.join(home, ".clap"), "/usr/lib/clap", "/usr/local/lib/clap", "/usr/lib64/clap", "/usr/local/lib64/clap", ...env("CLAP_PATH"), ...own])],
      own,
    };
  }
  // the files: .vst3 bundles (folders) or files, .clap files, a few folders deep
  async function find() {
    const F = folders(), out = [], seen = new Set();
    async function walk(dir, depth) {
      let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        let isDir = e.isDirectory(), isFile = e.isFile();
        if (e.isSymbolicLink()) { try { const s = await fsp.stat(p); isDir = s.isDirectory(); isFile = s.isFile(); } catch (er) { continue; } }
        if (/\.vst3$/i.test(e.name) && (isDir || isFile)) { if (!seen.has(p)) { seen.add(p); out.push(["vst3", p]); } continue; }
        if (/\.clap$/i.test(e.name) && isFile) { if (!seen.has(p)) { seen.add(p); out.push(["clap", p]); } continue; }
        if (isDir && depth < 4 && !e.name.startsWith(".")) await walk(p, depth + 1);
      }
    }
    for (const d of new Set([...F.vst3, ...F.clap])) await walk(d, 0);
    return out;
  }
  const stampOf = async p => { try { const s = await fsp.stat(p); let t = s.mtimeMs;
    if (s.isDirectory()) { try { const so = path.join(p, "Contents", "x86_64-linux"); for (const f of await fsp.readdir(so)) t = Math.max(t, (await fsp.stat(path.join(so, f))).mtimeMs); } catch (e) {} }
    return Math.round(t); } catch (e) { return 0; } };
  // look at the files, in a process of its own; one that crashes it is noted and the rest go on in a new one
  function runScan(list) {
    return new Promise(resolve => {
      const res = new Array(list.length).fill(null);
      const go = from => {
        if (from >= list.length) return resolve(res);
        const part = list.slice(from);
        let cur = -1, buf = "";
        const ch = spawn(process.execPath, [path.join(__dirname, "plugscan.js"), JSON.stringify(part)], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "ignore", "ignore", "pipe"] });
        const kill = setTimeout(() => { try { ch.kill("SIGKILL"); } catch (e) {} }, 20000 + part.length * 4000);
        let idle = null; const tick = () => { clearTimeout(idle); idle = setTimeout(() => { try { ch.kill("SIGKILL"); } catch (e) {} }, 15000); };   // (one plugin that hangs)
        tick();
        ch.stdio[3].on("data", d => {
          buf += d.toString(); let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1); tick();
            if (line === "NOADDON") { list.forEach((x, k) => { if (k >= from) res[k] = { error: "the plugin host isn't in this build" }; }); }
            const b = /^BEGIN (\d+)$/.exec(line); if (b) { cur = from + +b[1]; continue; }
            const m = /^DONE (\d+) (.*)$/.exec(line);
            if (m) { try { res[from + +m[1]] = JSON.parse(m[2]); } catch (e) { res[from + +m[1]] = { error: "unreadable" }; } cur = -1; }
          }
        });
        ch.on("exit", (code, sig) => {
          clearTimeout(kill); clearTimeout(idle);
          if (cur >= 0 && res[cur] == null) { res[cur] = { error: sig === "SIGKILL" ? "it stopped answering while being looked at" : "it crashed while being looked at", crashed: true }; if (log) log("plugin scan: " + list[cur][1] + " " + res[cur].error); }
          const next = res.findIndex((r, k) => k >= from && r == null);
          if (next < 0) return resolve(res);
          if (cur < 0 && next === from) { for (let k = from; k < list.length; k++) if (res[k] == null) res[k] = { error: "not looked at (the scanner stopped)" }; return resolve(res); }
          go(next);
        });
        ch.on("error", () => { for (let k = from; k < list.length; k++) if (res[k] == null) res[k] = { error: "the scanner wouldn't start" }; resolve(res); });
      };
      go(0);
    });
  }
  let scanning = null;
  async function scan(full) {
    if (scanning) return scanning;
    scanning = (async () => {
      const t0 = Date.now(), cache = full ? { files: {} } : readJ(CACHE, { files: {} }), files = await find(), todo = [], next = { files: {} };
      for (const [fmt, p] of files) {
        const st = await stampOf(p), c = cache.files && cache.files[p];
        if (c && c.stamp === st && c.fmt === fmt) next.files[p] = c; else todo.push([fmt, p, st]);
      }
      if (todo.length) {
        const r = await runScan(todo.map(([f, p]) => [f, p]));
        todo.forEach(([fmt, p, st], i) => { const x = r[i]; next.files[p] = Array.isArray(x) ? { fmt, stamp: st, found: x } : { fmt, stamp: st, found: [], error: (x && x.error) || "?" }; });
      }
      next.at = new Date().toISOString(); writeJ(CACHE, next);
      return { ...listOf(next), scanned: todo.length, ms: Date.now() - t0 };
    })().finally(() => { scanning = null; });
    return scanning;
  }
  function listOf(c) {
    const plugins = [], errors = [];
    for (const p in c.files) { const f = c.files[p]; (f.found || []).forEach(x => plugins.push(x)); if (f.error) errors.push({ path: p, fmt: f.fmt, error: f.error }); }
    plugins.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "instrument" ? -1 : 1) || a.name.localeCompare(b.name));
    return { plugins, errors, folders: folders(), at: c.at || null };
  }
  ipcMain.handle("nb:plug-list", () => listOf(readJ(CACHE, { files: {} })));
  ipcMain.handle("nb:plug-scan", (e, full) => scan(!!full));
  ipcMain.handle("nb:plug-folder", async () => {
    const w = getWin(); const r = await dialog.showOpenDialog(w, { title: "A folder with VST3 or CLAP plugins", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    const own = readJ(FOLDERS, []); if (!own.includes(r.filePaths[0])) own.push(r.filePaths[0]); writeJ(FOLDERS, own);
    return scan(false);
  });
  ipcMain.handle("nb:plug-unfolder", (e, p) => { writeJ(FOLDERS, readJ(FOLDERS, []).filter(x => x !== p)); return scan(false); });
  // crashes: the plugins that were loaded when the page went down
  ipcMain.handle("nb:plug-suspects", () => readJ(SUSPECT, {}));
  ipcMain.handle("nb:plug-trust", (e, key) => { const s = readJ(SUSPECT, {}); delete s[key]; writeJ(SUSPECT, s); return s; });
  const live = new Set();
  ipcMain.on("nb:plug-live", (e, key, on) => { if (on) live.add(String(key)); else live.delete(String(key)); writeJ(LIVE, [...live]); });
  function pageCrashed() {
    // returns true when plugins were loaded (the crash is put down to them, not the native engine)
    const l = [...live]; live.clear(); try { fs.unlinkSync(LIVE); } catch (e) {}
    if (!l.length) return false;
    const s = readJ(SUSPECT, {}); l.forEach(k => { s[k] = { n: ((s[k] && s[k].n) || 0) + 1, t: Date.now() }; }); writeJ(SUSPECT, s);
    if (log) log("page crashed with plugins loaded: " + l.join(", "));
    return true;
  }
  try { fs.unlinkSync(LIVE); } catch (e) {}
  const pageReset = () => { live.clear(); try { fs.unlinkSync(LIVE); } catch (e) {} };   // (a reload unloads them all)
  return { scan, pageCrashed, pageReset };
}
module.exports = { setup };
