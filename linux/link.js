// Nate Bloom Link, the computer's side: the tablet app finds this computer on the same Wi-Fi (a UDP broadcast on
// port 47811), connects over TCP (port 47812, one JSON message per line) and, the first time, proves it with the
// 4-digit code this computer shows. After that the two pages talk through here: projects, tempo, play together.
// The page does the music; this file only finds, admits and relays.
const dgram = require("dgram");
const net = require("net");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DISCOVER_PORT = 47811, PORT = 47812, MAX_LINE = 8 * 1024 * 1024;

function createLink({ userData, send, log = () => {} }) {
  const name = (os.hostname() || "Computer").replace(/\.local$/, "");
  const store = path.join(userData, "link.json");
  let known = {}, enabled = false;
  try { const o = JSON.parse(fs.readFileSync(store, "utf8")); known = o.tokens || {}; enabled = !!o.enabled; } catch (e) {}
  const keep = () => { try { fs.writeFileSync(store, JSON.stringify({ tokens: known, enabled })); } catch (e) {} };
  const peers = new Map();   // id → { sock, name, ok }
  let nextId = 1, udp = null, server = null;

  const toPage = msg => send(JSON.stringify(msg));
  const write = (p, msg) => { try { p.sock.write(JSON.stringify(msg) + "\n"); } catch (e) {} };
  const list = () => [...peers.values()].filter(p => p.ok).map(p => ({ id: p.id, name: p.name }));

  function admit(p, m) {
    if (m.t === "hello") {
      p.name = String(m.name || "Tablet").slice(0, 40);
      if (m.token && known[m.token]) { welcome(p, m.token); return; }
      p.code = String(crypto.randomInt(1000, 10000));
      write(p, { t: "code?", name });
      toPage({ t: "code", code: p.code, name: p.name });
    } else if (m.t === "code" && p.code) {
      if (String(m.code).trim() === p.code) {
        const token = crypto.randomBytes(16).toString("hex");
        known[token] = { name: p.name, since: Date.now() }; keep();
        toPage({ t: "code-done" });
        welcome(p, token);
      } else if (++p.tries >= 3) { write(p, { t: "denied" }); toPage({ t: "code-done" }); p.sock.end(); }
      else write(p, { t: "code?", name, wrong: true });
    }
  }
  function welcome(p, token) {
    p.ok = true; p.code = null;
    write(p, { t: "welcome", name, token });
    toPage({ t: "peers", peers: list(), joined: p.name });
  }
  function start() {
    if (server) return;
    // being found
    try {
      udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
      udp.on("message", (buf, rinfo) => {
        if (!String(buf).startsWith("NBLINK?")) return;
        const reply = Buffer.from(JSON.stringify({ nb: 1, name, port: PORT }));
        udp.send(reply, rinfo.port, rinfo.address);
      });
      udp.on("error", e => log("link: discovery off: " + e.message));
      udp.bind(DISCOVER_PORT);
    } catch (e) { log("link: discovery off: " + e.message); }

    // being linked to
    server = net.createServer(sock => {
      const p = { id: nextId++, sock, name: "Tablet", ok: false, code: null, tries: 0, buf: "" };
      peers.set(p.id, p);
      sock.setNoDelay(true); sock.setKeepAlive(true, 15000);
      const hello = setTimeout(() => { if (!p.ok && !p.code) sock.destroy(); }, 15000);
      sock.on("data", chunk => {
        p.buf += chunk.toString("utf8");
        if (p.buf.length > MAX_LINE) { sock.destroy(); return; }
        let i;
        while ((i = p.buf.indexOf("\n")) >= 0) {
          const line = p.buf.slice(0, i); p.buf = p.buf.slice(i + 1);
          if (!line.trim()) continue;
          let m; try { m = JSON.parse(line); } catch (e) { continue; }
          if (!p.ok) { admit(p, m); continue; }
          m.from = p.id; m.peer = p.name; toPage(m);
        }
      });
      const gone = () => {
        clearTimeout(hello);
        if (!peers.has(p.id)) return;
        peers.delete(p.id);
        if (p.ok) toPage({ t: "peers", peers: list(), left: p.name });
        if (p.code) toPage({ t: "code-done" });
      };
      sock.on("close", gone); sock.on("error", gone);
    });
    server.on("error", e => { log("link: off: " + e.message); toPage({ t: "link-off", why: e.message }); try { server.close(); } catch (x) {} server = null; });
    server.listen(PORT, "0.0.0.0");

  }
  function stop() {
    try { udp && udp.close(); } catch (e) {} udp = null;
    try { server && server.close(); } catch (e) {} server = null;
    for (const p of peers.values()) p.sock.destroy();
    peers.clear(); toPage({ t: "peers", peers: [] });
  }

  if (enabled) start();
  return {
    name,
    // from the page: { to: id | "*", ...message }
    out(json) {
      let m; try { m = JSON.parse(json); } catch (e) { return; }
      const to = m.to; delete m.to;
      for (const p of peers.values()) if (p.ok && (to === "*" || to == null || p.id === to)) write(p, m);
    },
    status: () => ({ hub: true, enabled: !!server, name, port: PORT, peers: list(), addresses: Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === "IPv4" && !a.internal).map(a => a.address) }),
    forget() { known = {}; keep(); for (const p of peers.values()) p.sock.destroy(); },
    enable(on) { enabled = !!on; keep(); if (enabled) start(); else stop(); return enabled; },
    stop,
  };
}
module.exports = { createLink, DISCOVER_PORT, PORT };
