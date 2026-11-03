// (184) A plugin's own process: the page's plugin host (nbplug.node, in the app) starts one of these per plugin with
// a socket on fd 3 and shared memory on fd 4, and the plugin runs here (plug_serve), so a plugin that crashes takes
// only this process down. Electron runs it as plain Node.
const path = require("path");
let P = null;
for (const p of [path.join(__dirname, "native", "build", "Release", "nbplug.node"), path.join(__dirname.replace(/app\.asar$/, "app.asar.unpacked"), "native", "build", "Release", "nbplug.node")]) {
  try { P = require(p); break; } catch (e) {}
}
if (!P) process.exit(2);
P.plug_serve(3, 4);   // (returns only when Nate Bloom is done with it)
process.exit(0);
