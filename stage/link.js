/* Nate Bloom link: the tablet and a second screen (the Pixelbook's Stage) find each other through public MQTT brokers,
   then talk straight to each other over a WebRTC data channel on the same Wi-Fi or hotspot. The brokers only carry the
   setup, encrypted with the pairing code (AES-GCM), on a topic derived from the code. If a direct connection can't be
   made (some hotspots keep their devices apart), messages go through the brokers instead, encrypted, more slowly.
   Stage asks the time now and then, so it knows the tablet's clock to a few milliseconds on a direct link.

   const L = NBLink.create({ role: "tablet" | "stage", code, onMessage(type, data), onState(st) });
   L.send(type, data, { lossy })   lossy: may be dropped through the brokers (meters, frequent state)
   L.mode    "off" | "looking" (no tablet/stage yet) | "connecting" (found, making a direct line) | "direct" | "relay"
   L.offset  (stage) the tablet's performance.now() minus ours, in ms;  L.rtt  round trip in ms
   L.close() */
(function () {
  "use strict";
  const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://broker.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
  const enc = new TextEncoder(), dec = new TextDecoder();
  const now = () => performance.now();
  const rid = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, "0")).join(""); };
  function newCode() {
    const a = new Uint8Array(8); crypto.getRandomValues(a);
    const s = [...a].map(b => ALPH[b % ALPH.length]).join(""); return s.slice(0, 4) + "-" + s.slice(4);
  }
  function normCode(s) {
    const t = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    if (t.length !== 8 || [...t].some(c => !ALPH.includes(c))) return null;
    return t.slice(0, 4) + "-" + t.slice(4);
  }
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  async function keysFor(code) {
    const c = normCode(code); if (!c) throw new Error("bad code");
    const k = await crypto.subtle.digest("SHA-256", enc.encode("natebloom-link-v1:key:" + c));
    const t = await crypto.subtle.digest("SHA-256", enc.encode("natebloom-link-v1:topic:" + c));
    return { key: await crypto.subtle.importKey("raw", k, "AES-GCM", false, ["encrypt", "decrypt"]), topic: "natebloom/v1/" + hex(t).slice(0, 32) };
  }
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
  }
  async function open(key, bytes) {
    if (bytes.length < 29) return null;
    try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)))); } catch (e) { return null; }
  }

  // ---------- a minimal MQTT 3.1.1 client over WebSocket (QoS 0: connect, subscribe, publish, ping) ----------
  const vlen = n => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
  const mstr = s => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  function pkt(type, body) { const b = body instanceof Uint8Array ? [...body] : body; return new Uint8Array([type, ...vlen(b.length), ...b]); }
  function Broker(url, topic, onMsg, onUp) {
    const B = { url, up: false, ws: null, tries: 0, dead: false, buf: new Uint8Array(0), ping: 0, timer: 0 };
    function connect() {
      if (B.dead) return;
      let ws; try { ws = new WebSocket(url, ["mqtt"]); } catch (e) { retry(); return; }
      B.ws = ws; ws.binaryType = "arraybuffer";
      ws.onopen = () => { const cid = "nb" + rid(8); ws.send(pkt(0x10, [...mstr("MQTT"), 4, 0x02, 0, 30, ...mstr(cid)])); };
      ws.onmessage = e => { const d = new Uint8Array(e.data), n = new Uint8Array(B.buf.length + d.length); n.set(B.buf); n.set(d, B.buf.length); B.buf = n; parse(); };
      ws.onclose = () => { const was = B.up; B.up = false; clearInterval(B.ping); if (was) onUp(); retry(); };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    }
    function retry() { if (B.dead) return; B.tries++; clearTimeout(B.timer); B.timer = setTimeout(connect, Math.min(30000, 1500 * Math.pow(1.6, Math.min(B.tries, 8)))); }
    function parse() {
      for (;;) {
        const b = B.buf; if (b.length < 2) return;
        let len = 0, mul = 1, i = 1, byte;
        do { if (i >= b.length) return; byte = b[i++]; len += (byte & 127) * mul; mul *= 128; } while (byte & 128);
        if (b.length < i + len) return;
        const type = b[0] >> 4, body = b.slice(i, i + len); B.buf = b.slice(i + len);
        if (type === 2) {   // CONNACK
          if (body[1] !== 0) { try { B.ws.close(); } catch (e) {} return; }
          B.ws.send(pkt(0x82, [0, 1, ...mstr(topic), 0]));
          B.up = true; B.tries = 0; clearInterval(B.ping); B.ping = setInterval(() => { try { B.ws.send(new Uint8Array([0xc0, 0])); } catch (e) {} }, 20000); onUp();
        } else if (type === 3) {   // PUBLISH (QoS 0)
          const tl = (body[0] << 8) | body[1], qos = (b[0] >> 1) & 3, off = 2 + tl + (qos ? 2 : 0);
          onMsg(body.slice(off));
        }
      }
    }
    B.publish = bytes => { if (!B.up) return false; try { B.ws.send(pkt(0x30, [...mstr(topic), ...bytes])); return true; } catch (e) { return false; } };
    B.close = () => { B.dead = true; clearTimeout(B.timer); clearInterval(B.ping); try { B.ws.send(new Uint8Array([0xe0, 0])); B.ws.close(); } catch (e) {} };
    connect(); return B;
  }

  function create(opt) {
    const role = opt.role, me = rid(6), other = role === "tablet" ? "stage" : "tablet";
    const L = { role, id: me, mode: "off", peer: null, offset: null, rtt: null, brokersUp: 0, sentDirect: 0, sentRelay: 0, closed: false };
    const brokers = [], seen = new Map();
    let keys = null, pc = null, dc = null, lastHeard = 0, lastPeerSign = 0, offerAt = 0, contactAt = 0, relayT = 0, sync = [], helloT = 0, hbT = 0, syncT = 0, relayBudget = { t: 0, n: 0 };
    const state = () => { try { opt.onState && opt.onState({ mode: L.mode, brokers: L.brokersUp, of: brokers.length, peer: !!L.peer, rtt: L.rtt }); } catch (e) {} };
    const setMode = m => { if (L.mode !== m) { L.mode = m; state(); } };
    function deliver(type, data) { lastHeard = now(); try { opt.onMessage && opt.onMessage(type, data); } catch (e) { console.error(e); } }
    // ---- the brokers ----
    async function sign(t, d, to) {
      if (!keys) return; const msg = { f: me, r: role, to: to || null, m: rid(5), t, d };
      const bytes = await seal(keys.key, msg); let ok = false;
      brokers.forEach(B => { if (B.publish(bytes)) ok = true; }); return ok;
    }
    async function onSignal(bytes) {
      const msg = await open(keys.key, bytes); if (!msg || msg.f === me || msg.r !== other) return;
      if (seen.has(msg.m)) return; seen.set(msg.m, now()); if (seen.size > 400) { const old = now() - 60000; seen.forEach((v, k) => { if (v < old) seen.delete(k); }); }
      if (msg.to && msg.to !== me) return;
      lastPeerSign = now();
      if (L.peer !== msg.f) { L.peer = msg.f; contactAt = now(); dropPc(); state(); }
      if (msg.t === "hello") { if (role === "stage" && !direct()) sign("hello"); if (role === "tablet" && !direct()) offer(); }
      else if (msg.t === "offer" && role === "stage") answer(msg.d);
      else if (msg.t === "answer" && role === "tablet" && pc && pc.signalingState === "have-local-offer") { try { await pc.setRemoteDescription(msg.d); } catch (e) {} }
      else if (msg.t === "app") inbound(msg.d.t, msg.d.d);
      else if (msg.t === "bye") { dropPc(); L.peer = null; setMode("looking"); }
      if (!direct() && msg.t !== "bye") checkRelay();
    }
    // ---- the direct connection ----
    const direct = () => !!(dc && dc.readyState === "open");
    function dropPc() { try { dc && dc.close(); } catch (e) {} try { pc && pc.close(); } catch (e) {} dc = null; pc = null; if (L.mode === "direct") setMode(L.peer ? "relay" : "looking"); }
    function newPc() {
      dropPc();
      if (opt.rtc === false || typeof RTCPeerConnection === "undefined") return null;
      pc = new RTCPeerConnection({ iceServers: opt.iceServers || ICE });
      const p = pc; p.onconnectionstatechange = () => { if (p === pc && (p.connectionState === "failed" || p.connectionState === "closed")) { dropPc(); checkRelay(); } };
      return p;
    }
    const gathered = p => new Promise(res => { if (p.iceGatheringState === "complete") return res(); const t = setTimeout(res, opt.gatherMs || 2500); p.addEventListener("icegatheringstatechange", () => { if (p.iceGatheringState === "complete") { clearTimeout(t); res(); } }); });
    function wire(ch) {
      dc = ch; ch.binaryType = "arraybuffer";
      ch.onopen = () => { if (ch !== dc) return; lastHeard = now(); setMode("direct"); };
      ch.onclose = () => { if (ch === dc) { dc = null; setMode(L.peer ? "relay" : "looking"); checkRelay(); } };
      if (ch.readyState === "open") { lastHeard = now(); setMode("direct"); }
      ch.onmessage = e => { let o; try { o = JSON.parse(typeof e.data === "string" ? e.data : dec.decode(e.data)); } catch (x) { return; } if (o && o.t) inbound(o.t, o.d); };
    }
    async function offer() {
      if (now() - offerAt < 4000 || L.closed) return; offerAt = now();
      const p = newPc(); if (!p) return;
      wire(p.createDataChannel("nb", { ordered: true }));
      try { await p.setLocalDescription(await p.createOffer()); await gathered(p); if (p === pc) sign("offer", { type: "offer", sdp: p.localDescription.sdp }, L.peer); } catch (e) {}
    }
    async function answer(sdp) {
      const p = newPc(); if (!p) return;
      p.ondatachannel = e => { if (p === pc) wire(e.channel); };
      try { await p.setRemoteDescription(sdp); await p.setLocalDescription(await p.createAnswer()); await gathered(p); if (p === pc) sign("answer", { type: "answer", sdp: p.localDescription.sdp }, L.peer); } catch (e) {}
    }
    // ---- through the brokers, while there's no direct line ----
    function checkRelay() {   // (a few seconds to make a direct line first; then the brokers carry it)
      if (direct() || !L.peer) return;
      if (now() - lastPeerSign > 45000) { setMode("looking"); return; }
      const wait = opt.rtc === false ? 0 : (opt.directWaitMs || 6000) - (now() - contactAt);
      if (wait <= 0) setMode("relay");
      else { setMode("connecting"); clearTimeout(relayT); relayT = setTimeout(checkRelay, wait + 50); }
    }
    // ---- messages ----
    function inbound(t, d) {
      if (t === "_p") { L.send("_q", { a: d.a, b: now() }); return; }
      if (t === "_q") { const c = now(), rtt = c - d.a; sync.push({ rtt, off: d.b - (d.a + c) / 2 }); if (sync.length > 10) sync.shift(); const best = sync.reduce((x, y) => y.rtt < x.rtt ? y : x); L.offset = best.off; L.rtt = Math.round(best.rtt); return; }
      if (t === "_hb") { lastHeard = now(); return; }
      deliver(t, d);
    }
    L.send = (t, d, o) => {
      if (L.closed) return false;
      if (direct()) { try { dc.send(JSON.stringify({ t, d })); L.sentDirect++; return true; } catch (e) { return false; } }
      if (L.mode !== "relay") return false;
      if (o && o.lossy) { const s = Math.floor(now() / 1000); if (relayBudget.t !== s) { relayBudget.t = s; relayBudget.n = 0; } if (++relayBudget.n > (opt.relayPerSec || 6)) return false; }
      L.sentRelay++; sign("app", { t, d }, L.peer); return true;
    };
    L.close = () => {
      if (L.closed) return; L.closed = true;
      try { if (keys && L.peer) sign("bye"); } catch (e) {}
      clearInterval(helloT); clearInterval(hbT); clearInterval(syncT); clearTimeout(relayT);
      setTimeout(() => brokers.forEach(B => B.close()), 150); dropPc(); setMode("off");
    };
    (async () => {
      try { keys = await keysFor(opt.code); } catch (e) { setMode("off"); return; }
      if (L.closed) return;
      setMode("looking");
      (opt.brokers || BROKERS).forEach(u => brokers.push(Broker(u, keys.topic, b => onSignal(b), () => { const was = L.brokersUp; L.brokersUp = brokers.filter(B => B.up).length; if (L.brokersUp > was) sign("hello"); state(); })));
      helloT = setInterval(() => {
        if (direct()) return;
        if (L.peer && now() - lastPeerSign > 45000) { L.peer = null; dropPc(); setMode("looking"); }
        sign("hello");
        if (role === "tablet" && L.peer && now() - offerAt > 30000) offer();   // keep trying for a direct line
      }, opt.helloMs || 10000);
      hbT = setInterval(() => {
        if (direct()) { L.send("_hb", 0); if (now() - lastHeard > 7000) { dropPc(); checkRelay(); } }
      }, 2000);
      if (role === "stage") { let n = 0; syncT = setInterval(() => { if (L.mode === "direct" || L.mode === "relay") { if (n < 8 || n % 4 === 0) L.send("_p", { a: now() }); n++; } }, 250); }
    })();
    return L;
  }
  window.NBLink = { create, newCode, normCode, BROKERS };
})();
