// (177) The plugin scanner: main.js runs this in a process of its own (Electron as plain Node), so a plugin that
// crashes while it's looked at takes only this down. It reads the files to look at from argv (JSON), and for each
// writes (to fd 3, so what plugins print themselves doesn't mix in) "BEGIN <n>" and then "DONE <n> <json>" (what's in it, or {"error": …}). main.js starts it again after the
// one that crashed.
const path = require("path"), fs = require("fs");
const say = s => { try { fs.writeSync(3, s + "\n"); } catch (e) {} };
let P = null;
for (const p of [path.join(__dirname, "native", "build", "Release", "nbplug.node"), path.join(__dirname.replace(/app\.asar$/, "app.asar.unpacked"), "native", "build", "Release", "nbplug.node")]) {
  try { P = require(p); break; } catch (e) {}
}
const list = JSON.parse(process.argv[2] || "[]");
if (!P) { say("NOADDON"); process.exit(0); }
for (let i = 0; i < list.length; i++) {
  const [fmt, file] = list[i];
  say("BEGIN " + i);
  let out;
  try { out = P.plug_scan(fmt, file); } catch (e) { out = JSON.stringify({ error: String(e && e.message || e) }); }
  say("DONE " + i + " " + out);
}
process.exit(0);   // (without waiting for plugins' own threads)
