// (199) Nate Bloom's plugin store: free, open-source instruments and effects for Linux, each fetched from its own
// project's latest Linux release on GitHub, unpacked and copied into ~/.clap, ~/.vst3 or ~/.lv2 (the home folder,
// no sudo), so Nate Bloom's scan (and Bitwig's) finds them. Nothing is bundled with the app: every download is the
// project's own build, and its licence travels with it.
// Used by main.js (nb:store-* calls) and by CI (node plugin-store.js --resolve | --install-all).
"use strict";
const https = require("https"), fs = require("fs"), fsp = require("fs/promises"), path = require("path"), os = require("os");
const { execFile } = require("child_process");

// kind: synth | sampler | fx. repo: where its releases are. bundle: the plugin files to take (a package may hold more).
// asset: extra filter on the release file's name. pre: may take a pre-release (the project only publishes those).
// formats: the order to prefer when a release has several. share: data folders a .deb puts in /usr/share that the
// plugin also looks for in ~/.local/share.
const CATALOG = [
  { id: "surge-xt", name: "Surge XT", kind: "synth", repo: "surge-synthesizer/releases-xt", bundle: /surge.?xt/i, share: /^surge-xt$/i, licence: "GPL-3.0",
    blurb: "Deep hybrid synth, huge preset library, great evolving pads" },
  { id: "ob-xf", name: "OB-Xf", kind: "synth", repo: "surge-synthesizer/OB-Xf", bundle: /ob-?xf/i, pre: true, licence: "GPL-3.0",
    blurb: "Oberheim OB-X/Xa: warm analog brass and pads" },
  { id: "odin2", name: "Odin 2", kind: "synth", repo: "TheWaveWarden/odin2", bundle: /odin/i, licence: "GPL-3.0",
    blurb: "Friendly semi-modular analog-style synth" },
  { id: "dexed", name: "Dexed", kind: "synth", repo: "asb2m10/dexed", bundle: /dexed/i, formats: ["vst3", "clap"], licence: "GPL-3.0",
    blurb: "DX7 FM, loads real DX7 patches: bells, glass, '80s keys" },
  { id: "cardinal", name: "Cardinal", kind: "synth", repo: "DISTRHO/Cardinal", bundle: /^cardinal/i, asset: /x86_64|x64|amd64/i, licence: "GPL-3.0",
    blurb: "VCV Rack modular as a plugin: generative patches" },
  { id: "spectmorph", name: "SpectMorph", kind: "synth", repo: "swesterfeld/spectmorph", bundle: /spectmorph/i, licence: "LGPL-3.0",
    blurb: "Morphs between real instruments: eerie choirs and pads" },
  { id: "floe", name: "Floe", kind: "sampler", repo: "floe-audio/Floe", bundle: /floe/i, pre: true, licence: "GPL-3.0",
    blurb: "Sample-library player with free atmospheric libraries" },
  { id: "shortcircuit-xt", name: "Shortcircuit XT", kind: "sampler", repo: "surge-synthesizer/shortcircuit-xt", bundle: /short.?circuit/i, pre: true, licence: "GPL-3.0",
    blurb: "Full sampler for your own samples and field recordings" },
  { id: "dragonfly", name: "Dragonfly Reverb", kind: "fx", repo: "michaelwillis/dragonfly-reverb", bundle: /dragonfly/i, licence: "GPL-3.0",
    blurb: "Huge, smooth halls, rooms and plates" },
  { id: "chowtape", name: "CHOWTapeModel", kind: "fx", repo: "jatinchowdhury18/AnalogTapeModel", bundle: /chow.?tape/i, licence: "GPL-3.0",
    blurb: "Analog tape: saturation, wow and flutter" },
  { id: "actuate", name: "Actuate", kind: "fx", repo: "ardura/Actuate", bundle: /actuate/i, pre: true, formats: ["vst3", "clap"], licence: "GPL-3.0",
    blurb: "Granular sampler and texture machine" },
  // (205) more from the plan: drums made from scratch, the SFZ player (for the free libraries), a granular effect
  { id: "geonkick", name: "Geonkick", kind: "synth", repo: "Geonkick-Synthesizer/geonkick", bundle: /geonkick/i, licence: "GPL-3.0",
    blurb: "Percussion synth: 808, 909 and CR-78-style kicks, snares and hats, built from scratch" },
  { id: "sfizz", name: "sfizz", kind: "sampler", repo: "sfztools/sfizz-ui", bundle: /sfizz/i, licence: "BSD-2-Clause",
    blurb: "Plays SFZ sample libraries: free orchestras, pianos, guitars, choirs" },
  { id: "argotlunar", name: "Argotlunar", kind: "fx", repo: "mourednik/argotlunar", bundle: /argotlunar/i, licence: "GPL-2.0",
    blurb: "Real-time granular effect: smears, stutters and shimmering clouds" },
  { id: "airwindows", name: "Airwindows Consolidated", kind: "fx", repo: "baconpaul/airwin2rack", bundle: /airwin/i, pre: true, licence: "MIT",
    blurb: "Hundreds of small, excellent effects in one plugin" },
];

const HOME = os.homedir();
const DEST = { clap: path.join(HOME, ".clap"), vst3: path.join(HOME, ".vst3"), lv2: path.join(HOME, ".lv2") };
const UA = "nate-bloom-plugin-store";

// ---- fetching ----
function get(url, opt = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 8) return reject(new Error("too many redirects"));
    const h = { "User-Agent": UA, Accept: opt.json ? "application/vnd.github+json" : "*/*" };
    if (opt.json && process.env.GITHUB_TOKEN) h.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
    const req = https.get(url, { headers: h, timeout: 30000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), opt, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " for " + url.replace(/\?.*/, ""))); }
      if (opt.file) {
        const total = +res.headers["content-length"] || 0; let got = 0, last = 0;
        const out = fs.createWriteStream(opt.file);
        res.on("data", c => { got += c.length; const now = Date.now(); if (opt.onProgress && now - last > 250) { last = now; opt.onProgress(got, total); } });
        res.pipe(out); out.on("finish", () => out.close(() => resolve(opt.file))); out.on("error", reject); res.on("error", reject);
      } else {
        const bufs = []; res.on("data", c => bufs.push(c)); res.on("error", reject);
        res.on("end", () => { const s = Buffer.concat(bufs).toString("utf8"); try { resolve(opt.json ? JSON.parse(s) : s); } catch (e) { reject(e); } });
      }
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
  });
}
const run = (cmd, args, cwd) => new Promise((res, rej) => execFile(cmd, args, { cwd, timeout: 300000, maxBuffer: 64 << 20 }, (e, out, err) => e ? rej(new Error(cmd + ": " + (String(err || "").trim().split("\n").pop() || e.message))) : res(out)));

// ---- picking the release file ----
const word = s => new RegExp("(^|[^a-z0-9])(" + s + ")([^a-z0-9]|$)", "i");
const OTHER_OS = [word("win|win32|win64|windows|msvc"), word("mac|macos|osx|darwin|apple"), word("arm|arm64|armhf|aarch64|riscv64"), word("i386|i686|win-x86"), /(^|[^a-z0-9])x86(?!_64|-64)([^a-z0-9]|$)/i, word("ios|android|wasm"), word("freebsd|openbsd|netbsd|solaris")];
const NOT_PKG = /\.(exe|dmg|pkg|msi|sha256|sha512|sig|asc|txt|json|md5|appimage|rpm|flatpak|snap|zst)$|source|\bsrc\b|symbols|debug|dbgsym/i;
const ARCHIVE = /\.(tar\.gz|tgz|tar\.xz|txz|tar\.bz2|zip|deb|7z)$/i;
function assetScore(e, a) {
  const n = a.name;
  if (!ARCHIVE.test(n) || NOT_PKG.test(n)) return -1;
  if (OTHER_OS.some(r => r.test(n))) return -1;
  const linux = /linux|lin64|lnx|\.deb$/i.test(n);
  if (!linux && !/x86_64|x64|amd64/i.test(n)) return -1;
  if (e.asset && !e.asset.test(n)) return -1;
  let s = 10;
  if (linux) s += 2;
  if (/x86_64|x64|amd64/i.test(n)) s += 3;
  if (/\.deb$/i.test(n)) s -= 2;                  // a tarball keeps everything in one place; a .deb also works
  if (/clap/i.test(n)) s += 2; else if (/vst3/i.test(n)) s += 1;
  if (/lv2|vst2|ladspa|standalone|jack|headless/i.test(n) && !/clap|vst3/i.test(n)) s -= 3;
  return s;
}
async function candidates(e) {
  const list = await get("https://api.github.com/repos/" + e.repo + "/releases?per_page=20", { json: true });
  const rels = (Array.isArray(list) ? list : []).filter(r => !r.draft);
  const one = r => { const ranked = (r.assets || []).map(a => [assetScore(e, a), a]).filter(x => x[0] >= 0).sort((x, y) => y[0] - x[0]); return ranked.length ? { tag: r.tag_name, pre: !!r.prerelease, date: (r.published_at || "").slice(0, 10), asset: ranked[0][1].name, url: ranked[0][1].browser_download_url, size: ranked[0][1].size } : null; };
  const stable = rels.filter(r => !r.prerelease).map(one).filter(Boolean), pre = rels.filter(r => r.prerelease).map(one).filter(Boolean);
  return stable.length ? (e.pre ? stable.concat(pre) : stable) : pre;
}
async function resolve(e) { return (await candidates(e))[0] || null; }

// ---- will it run here? A Linux build asks for a minimum glibc and libstdc++; one built on a newer system than this
// one won't load at all ("crashed while being looked at"), so the store steps back to an older release instead ----
const verOf = (buf, re) => { let m, best = 0; re.lastIndex = 0; while ((m = re.exec(buf))) { const v = +m[1]; if (v > best) best = v; } return best; };
let SYS = null;
function sysLibs() {
  if (SYS) return SYS;
  let glibc = 0; try { const g = (process.report && process.report.getReport().header.glibcVersionRuntime) || ""; glibc = +(String(g).split(".")[1] || 0); } catch (e) {}
  let cxx = 0;
  for (const p of ["/usr/lib/x86_64-linux-gnu/libstdc++.so.6", "/lib/x86_64-linux-gnu/libstdc++.so.6", "/usr/lib64/libstdc++.so.6"]) { try { cxx = verOf(fs.readFileSync(p).toString("latin1"), /GLIBCXX_3\.4\.(\d+)/g); if (cxx) break; } catch (e) {} }
  return (SYS = { glibc, cxx });
}
async function binsOf(b) {
  if (b.fmt === "clap") { try { if ((await fsp.stat(b.path)).isFile()) return [b.path]; } catch (e) {} }
  const out = []; const w = async (d, n) => { if (n < 0) return; let es = []; try { es = await fsp.readdir(d, { withFileTypes: true }); } catch (e) { return; } for (const x of es) { const p = path.join(d, x.name); if (x.isDirectory()) { if (!/arm|aarch64|i386|i686|windows|macos/i.test(x.name)) await w(p, n - 1); } else if (/\.(so|clap)$/i.test(x.name)) out.push(p); } };
  await w(b.path, 4); return out;
}
async function needs(bundles) {
  let glibc = 0, cxx = 0;
  for (const b of bundles) for (const f of await binsOf(b)) { try { const t = (await fsp.readFile(f)).toString("latin1"); glibc = Math.max(glibc, verOf(t, /GLIBC_2\.(\d+)/g)); cxx = Math.max(cxx, verOf(t, /GLIBCXX_3\.4\.(\d+)/g)); } catch (e) {} }
  return { glibc, cxx };
}

// ---- unpacking and finding the plugin files ----
async function extract(file, dir) {
  await fsp.mkdir(dir, { recursive: true });
  if (/\.zip$/i.test(file)) {
    try { await run("unzip", ["-q", "-o", file, "-d", dir]); }
    catch (er) { await run("python3", ["-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", file, dir]); }
    // zipfile drops the executable bit: plugin libraries need it back
    try { await run("find", [dir, "-name", "*.so", "-exec", "chmod", "+x", "{}", "+"]); await run("find", [dir, "-name", "*.clap", "-type", "f", "-exec", "chmod", "+x", "{}", "+"]); } catch (er) {}
  } else if (/\.7z$/i.test(file)) {
    let done = false;
    for (const z of ["7z", "7za", "7zr"]) { try { await run(z, ["x", "-y", "-o" + dir, file]); done = true; break; } catch (er) { if (!/ENOENT/.test(String(er && er.message))) throw er; } }
    if (!done) throw new Error("it comes as a .7z: install 7-Zip first (sudo apt install p7zip-full), then Get again");
  } else if (/\.deb$/i.test(file)) {
    try { await run("dpkg-deb", ["-x", file, dir]); }
    catch (er) { await run("bash", ["-c", 'cd "$1" && ar x "$2" && for d in data.tar.*; do tar -xf "$d"; done', "x", dir, file]); }
  } else await run("tar", ["-xf", file, "-C", dir]);
}
async function walk(dir, depth, out) {
  if (depth < 0) return out;
  let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of ents) {
    const p = path.join(dir, d.name), m = d.name.match(/\.(clap|vst3|lv2)$/i);
    if (m) { out.push({ fmt: m[1].toLowerCase(), path: p, name: d.name }); continue; }   // (a bundle: not looked inside)
    if (d.isDirectory()) await walk(p, depth - 1, out);
    else if (depth > 2 && ARCHIVE.test(d.name) && !/\.deb$/i.test(d.name) && !OTHER_OS.some(r => r.test(d.name))) {   // an archive inside the archive
      const sub = p + ".x"; try { await extract(p, sub); await walk(sub, depth - 1, out); } catch (e) {}
    }
  }
  return out;
}
async function findShare(dir, re, out = []) {
  for (const base of ["usr/share", "usr/local/share"]) {
    let ents = []; try { ents = await fsp.readdir(path.join(dir, base), { withFileTypes: true }); } catch (e) { continue; }
    for (const d of ents) if (d.isDirectory() && re.test(d.name)) out.push(path.join(dir, base, d.name));
  }
  return out;
}

// ---- installed record ----
function recFile(cfgDir) { return path.join(cfgDir || path.join(HOME, ".config", "Nate Bloom"), "plugin-store.json"); }
function readRec(cfgDir) { try { return JSON.parse(fs.readFileSync(recFile(cfgDir), "utf8")); } catch (e) { return {}; } }
function writeRec(rec, cfgDir) { try { fs.mkdirSync(path.dirname(recFile(cfgDir)), { recursive: true }); fs.writeFileSync(recFile(cfgDir), JSON.stringify(rec, null, 1)); } catch (e) {} }

async function install(id, { cfgDir, onProgress } = {}) {
  const e = CATALOG.find(x => x.id === id); if (!e) throw new Error("unknown plugin " + id);
  const say = (stage, frac) => { try { onProgress && onProgress({ id, stage, frac }); } catch (er) {} };
  say("looking up its releases", 0);
  const cands = await candidates(e);
  if (!cands.length) throw new Error(e.name + " has no Linux download in its releases");
  const sys = sysLibs();
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "nb-store-"));
  try {
    let r = null, dir = null, found = null, fmt = null, why = "", tries = 0;
    for (const c of cands) {
      if (++tries > 6) break;
      const file = path.join(tmp, tries + "_" + c.asset.replace(/[^\w.+-]/g, "_"));
      say("downloading " + c.asset, 0);
      await get(c.url, { file, onProgress: (g, t) => say("downloading " + c.asset, t ? g / t : 0) });
      say("unpacking", 1);
      const d = path.join(tmp, "x" + tries); await extract(file, d);
      const fnd = (await walk(d, 10, [])).filter(b => e.bundle.test(b.name));
      const order = e.formats || ["clap", "vst3", "lv2"];
      const f = order.find(x => fnd.some(b => b.fmt === x));
      fsp.rm(file, { force: true }).catch(() => {});
      if (!f) { why = "no CLAP, VST3 or LV2 plugin in " + c.asset; continue; }
      const nd = await needs(fnd.filter(b => b.fmt === f));
      if ((sys.glibc && nd.glibc > sys.glibc) || (sys.cxx && nd.cxx > sys.cxx)) {
        why = c.tag + " needs a newer Linux (glibc 2." + nd.glibc + ", this one has 2." + sys.glibc + ")";
        say(why + ": trying an older release", 1); fsp.rm(d, { recursive: true, force: true }).catch(() => {}); continue;
      }
      r = c; dir = d; found = fnd; fmt = f; break;
    }
    if (!r) throw new Error(e.name + ": " + (why || "nothing usable in its releases"));
    const files = [];
    for (const b of found.filter(b => b.fmt === fmt)) {
      const to = path.join(DEST[fmt], b.name);
      await fsp.mkdir(DEST[fmt], { recursive: true });
      await fsp.rm(to, { recursive: true, force: true });
      await fsp.cp(b.path, to, { recursive: true, preserveTimestamps: true, dereference: true });
      files.push(to);
    }
    if (e.share) for (const s of await findShare(dir, e.share)) {
      const to = path.join(HOME, ".local", "share", path.basename(s));
      await fsp.rm(to, { recursive: true, force: true }); await fsp.cp(s, to, { recursive: true, dereference: true }); files.push(to);
    }
    const rec = readRec(cfgDir); rec[id] = { name: e.name, tag: r.tag, asset: r.asset, fmt, files, at: new Date().toISOString() }; writeRec(rec, cfgDir);
    say("installed", 1);
    return rec[id];
  } finally { fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
async function remove(id, { cfgDir } = {}) {
  const rec = readRec(cfgDir), r = rec[id]; if (!r) return false;
  for (const f of r.files || []) if (f.startsWith(HOME + path.sep)) await fsp.rm(f, { recursive: true, force: true }).catch(() => {});
  delete rec[id]; writeRec(rec, cfgDir); return true;
}
function list(cfgDir) {
  const rec = readRec(cfgDir);
  return CATALOG.map(e => { const r = rec[e.id]; const present = !!(r && (r.files || []).some(f => { try { fs.accessSync(f); return true; } catch (er) { return false; } }));
    return { id: e.id, name: e.name, kind: e.kind, blurb: e.blurb, licence: e.licence, repo: e.repo, installed: present ? { tag: r.tag, fmt: r.fmt, at: r.at } : null }; });
}

module.exports = { CATALOG, resolve, install, remove, list, _t: { extract, walk, assetScore, needs, sysLibs } };

// ---- CI: node plugin-store.js --resolve | --install-all [cfgDir] ----
if (require.main === module) {
  (async () => {
    const mode = process.argv[2], cfg = process.argv[3];
    let bad = 0;
    for (const e of CATALOG) {
      try {
        if (mode === "--assets") { if (cfg && !cfg.split(",").includes(e.id)) continue; const L = await get("https://api.github.com/repos/" + e.repo + "/releases?per_page=6", { json: true }); console.log("== " + e.id); (L || []).forEach(r => console.log("   " + r.tag_name + (r.prerelease ? " (pre)" : "") + " " + (r.published_at || "").slice(0, 10) + ": " + (r.assets || []).map(a => a.name).join(" | "))); continue; }
        if (mode === "--resolve") { const r = await resolve(e); console.log(r ? "OK   " + e.id + "\t" + r.tag + (r.pre ? " (pre)" : "") + "\t" + r.asset : "NONE " + e.id); if (!r) bad++; }
        else if (mode === "--install-all") { const r = await install(e.id, { cfgDir: cfg }); console.log("OK   " + e.id + "\t" + r.tag + "\t" + r.fmt + "\t" + r.files.map(f => path.basename(f)).join(", ")); }
      } catch (er) { bad++; console.log("FAIL " + e.id + "\t" + (er && er.message || er)); }
    }
    console.log(bad ? bad + " not done" : "all done");
  })();
}
