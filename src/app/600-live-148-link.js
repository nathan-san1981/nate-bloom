/* Nate Bloom link: the tablet and a second screen (the Pixelbook's Stage) find each other through public MQTT brokers,
   then talk straight to each other over a WebRTC data channel on the same Wi-Fi or hotspot. The brokers only carry the
   setup, encrypted with the pairing code (AES-GCM), on a topic derived from the code. If a direct connection can't be
   made (some hotspots keep their devices apart), messages go through the brokers instead, encrypted, more slowly.
   Stage asks the time now and then, so it knows the tablet's clock to a few milliseconds on a direct link.

   const L = NBLink.create({ role: "tablet" | "stage", code, onMessage(type, data), onState(st) });
   L.send(type, data, { lossy })   lossy: may be dropped through the brokers (meters, frequent state)
   L.mode    "off" | "looking" (no tablet/stage yet) | "connecting" (found, making a direct line) | "direct" | "relay"
   L.offset  (stage) the tablet's performance.now() minus ours, in ms;  L.rtt  round trip in ms
   L.setAudio(track)   (tablet, 160) the audio track sent on the direct line (null: none); opt.onAudio(stream) (stage)
   L.stats()           a summary of the direct line's audio: bytes, packets, lost, jitter
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
    function dropPc() { try { dc && dc.close(); } catch (e) {} try { pc && pc.close(); } catch (e) {} dc = null; pc = null; L.audioTx = null; if (L.audioStream) { L.audioStream = null; try { opt.onAudio && opt.onAudio(null); } catch (e) {} } if (L.mode === "direct") setMode(L.peer ? "relay" : "looking"); }
    // (160) the audio line: stereo Opus at 192 kbit/s, for the Pixelbook's recording and pictures, never for what you hear
    function stereoOpus(sdp) {
      try {
        const m = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp); if (!m) return sdp;
        const pt = m[1], re = new RegExp("a=fmtp:" + pt + " ([^\\r\\n]*)"), add = "stereo=1;sprop-stereo=1;maxaveragebitrate=192000;maxplaybackrate=48000;useinbandfec=1";
        if (re.test(sdp)) return sdp.replace(re, (all, params) => "a=fmtp:" + pt + " " + params.split(";").map(x => x.trim()).filter(x => x && !/^(stereo|sprop-stereo|maxaveragebitrate|maxplaybackrate|useinbandfec)=/.test(x)).concat([add]).join(";"));
        return sdp.replace(m[0], m[0] + "\r\na=fmtp:" + pt + " " + add);
      } catch (e) { return sdp; }
    }
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
      if (opt.audio !== false) { try { L.audioTx = p.addTransceiver("audio", { direction: "sendonly" }); if (L.sendTrack) L.audioTx.sender.replaceTrack(L.sendTrack).catch(() => {}); } catch (e) { L.audioTx = null; } }
      try { const o = await p.createOffer(); await p.setLocalDescription({ type: "offer", sdp: stereoOpus(o.sdp) }); await gathered(p); if (p === pc) sign("offer", { type: "offer", sdp: p.localDescription.sdp }, L.peer); } catch (e) {}
    }
    async function answer(sdp) {
      const p = newPc(); if (!p) return;
      p.ondatachannel = e => { if (p === pc) wire(e.channel); };
      p.ontrack = e => { if (p !== pc || !e.track || e.track.kind !== "audio") return; const s = (e.streams && e.streams[0]) || new MediaStream([e.track]); L.audioStream = s; try { opt.onAudio && opt.onAudio(s, e.track); } catch (x) {} };
      try { await p.setRemoteDescription(sdp); const a = await p.createAnswer(); await p.setLocalDescription({ type: "answer", sdp: stereoOpus(a.sdp) }); await gathered(p); if (p === pc) sign("answer", { type: "answer", sdp: p.localDescription.sdp }, L.peer); } catch (e) {}
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
    L.setAudio = track => { L.sendTrack = track || null; const tx = L.audioTx; if (tx && pc && tx.sender) { try { tx.sender.replaceTrack(L.sendTrack).catch(() => {}); } catch (e) {} } return !!(tx && pc); };
    L.stats = async () => {
      if (!pc) return null;
      try {
        const out = { direct: direct(), inbound: null, outbound: null };
        (await pc.getStats()).forEach(r => {
          if (r.type === "inbound-rtp" && r.kind === "audio") out.inbound = { bytes: r.bytesReceived || 0, packets: r.packetsReceived || 0, lost: r.packetsLost || 0, jitterMs: Math.round((r.jitter || 0) * 1000), concealed: r.concealedSamples || 0, codec: r.codecId || "" };
          if (r.type === "outbound-rtp" && r.kind === "audio") out.outbound = { bytes: r.bytesSent || 0, packets: r.packetsSent || 0 };
        });
        return out;
      } catch (e) { return null; }
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

    // ======================================================================
    // 148: the Pixelbook's Stage. Off until it's turned on in Gear; nothing here waits for it. With a pairing code the
    // tablet and Stage find each other (NBLink: through public brokers for the setup, encrypted with the code, then
    // straight over Wi-Fi or the hotspot; through the brokers when a hotspot keeps them apart). The tablet sends what
    // Stage shows (a snapshot four times a second, the grid of what plays, the notes and hits as they happen, the level)
    // and takes back commands (loops, the band, ▶, the set list, an XY pad on the filter and Space) and edits (the set
    // list with song notes, the Rhythm pattern, a kit on a bank). The band can play on the Pixelbook: the tablet then
    // stays silent on the band only while Stage keeps saying it's playing; the moment it stops, the tablet plays it again.
    // ======================================================================
    const LK = Object.assign({ on: false, code: "", ctl: true }, lsGet("nightbloom-link", {}));
    const lkSave = () => lsSet("nightbloom-link", { on: !!LK.on, code: LK.code, ctl: LK.ctl !== false });
    const LKS = { L: null, mode: "off", brokers: 0, of: 0, rtt: null, wantRemote: false, stageBandAt: 0, remote: false, lastSt: "", stAt: 0, evQ: [], gridSig: "", gridAt: 0, bandSig: "", bandAt: 0, xy: null, tick: 0, t: 0 };
    const lkHere = () => !window.NB_LITE && (/github\.io$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
    const lkUp = () => LKS.mode === "direct" || LKS.mode === "relay";
    const lkDirect = () => LKS.mode === "direct";
    const NNL = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"], nnm = m => NNL[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
    const tp = () => Math.round(performance.now() * 10) / 10;
    // a time on the audio clock → when it's heard, on performance.now()'s clock
    function heardPerf(t) {
      try { const ts = ctx.getOutputTimestamp && ctx.getOutputTimestamp(); if (ts && ts.performanceTime > 0) return ts.performanceTime + (t - ts.contextTime) * 1000; } catch (e) {}
      return performance.now() + (t - ctx.currentTime + (ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000;
    }
    function lkStart() {
      lkStop(); if (!LK.on || !lkHere() || !window.NBLink) return;
      if (!NBLink.normCode(LK.code)) { LK.code = NBLink.newCode(); lkSave(); }
      const o = { role: "tablet", code: LK.code, onMessage: lkIn, onState: s => {
        const was = LKS.mode; Object.assign(LKS, { mode: s.mode, brokers: s.brokers, of: s.of, rtt: s.rtt });
        if (s.mode !== was) { add139("link", "pixelbook: " + s.mode); if (lkUp()) { LKS.lastSt = ""; LKS.gridSig = ""; LKS.bandSig = ""; lkSend("hi", { v: 1, ctl: LK.ctl !== false }); } }
        lkBandCheck(); paintGear(); gearLkPaint(); } };
      const q = new URLSearchParams(location.search);   // (tests: a local broker)
      if (q.get("nbbroker")) Object.assign(o, { brokers: q.get("nbbroker").split(","), iceServers: [], gatherMs: 800, helloMs: 2000, directWaitMs: 3000 });
      if (q.get("nbrtc") === "0") o.rtc = false;
      LKS.L = NBLink.create(o); LKS.mode = "looking";
    }
    function lkStop() { if (LKS.L) { try { LKS.L.close(); } catch (e) {} LKS.L = null; } LKS.mode = "off"; LKS.wantRemote = false; lkBandCheck(); }
    const lkSend = (t, d, lossy) => { try { return !!(LKS.L && LKS.L.send(t, d, lossy ? { lossy: true } : null)); } catch (e) { return false; } };
    // ---------- what Stage shows ----------
    function lkState() {
      const knob = t => { try { const v = mlGet(t); return [mlName(t, ""), mlText(t), v == null ? null : Math.round(v * 1000) / 1000]; } catch (e) { return ["", "", null]; } };
      const held = []; try { [...voices.keys()].forEach(m => held.push(m)); heldVoices.forEach(v => v.tones.forEach(m => { if (!held.includes(m)) held.push(m); })); jlPadNotes.forEach(ns => ns.forEach(m => { if (!held.includes(m)) held.push(m); })); } catch (e) {}
      held.sort((a, b) => a - b);
      const sn = $id("sndName"), ss = $id("sndSub");
      const song = SL.cur >= 0 && SL.songs[SL.cur] ? SL.songs[SL.cur] : null, nx = SL.pend ? SL.pend.i : SL.cue != null ? SL.cue : SL.cur + 1;
      return {
        live: !lv.hidden, bpm: Math.round(rcBpm() * 10) / 10, play: LV.play, on: { seq: !!playing, rc: !!RC.playing, bp: !!BP.playing }, bpRec: BP.armed ? "count" : BP.rec ? "rec" : "",
        rec: RC8.on && ctx ? Math.round(ctx.currentTime - RC8.t0) : null,
        sound: { name: sn ? sn.textContent : "", sub: (ss ? ss.textContent : "").replace(/\s*·\s*tap.*$/i, "") },
        layers: compsNow().map(c => ({ n: c.name, a: arpOn(c.key) })),
        hold: $id("hold") ? $id("hold").getAttribute("aria-pressed") === "true" : false, held: held.slice(0, 12).map(nnm), arp: { on: arpLive(), oct: arpOctNow() },
        kp: { name: kpName(lvKP()), k: lvK().map(knob), f: lvF().map(knob) },
        pads: { name: psetName(LV.pset), n: lvPads().map(p => (p && p.n) || "") },
        jam: { loops: JAM.tracks.map((t, k) => ({ bars: t.len / BAR, on: !!(t.on && t.len), rec: JAM.rec && JAM.rec.k === k ? (JAM.rec.armed ? "ready" : "rec") : "" })),
          band: { on: JAM.band.on, style: JAM.band.style, name: JAM_STYLES[JAM.band.style].name, chord: jlChord(), bass: JAM.band.bass, where: LKS.remote ? "pixelbook" : "tablet" } },
        gear: { sync: syncMode(), ko: !!(koOut2() || koIn()), ml: mlLive() },
        song: { cur: SL.cur, n: SL.songs.length, name: song ? song.name : "", notes: song ? song.notes || "" : "", next: nx >= 0 && nx < SL.songs.length && nx !== SL.cur ? SL.songs[nx].name : "", pend: !!SL.pend },
        drops: DROP.api ? cpuDrops(60) : null, buf: bufNow(), lat: bufMs(), fx: state.fx.on !== false, ctl: LK.ctl !== false,
      };
    }
    // the grid of what plays: when a bar line is heard (performance.now() clock) and how long a 16th is
    function lkGrid() {
      if (!ctx) return { src: null };
      const on = { seq: playing, rc: RC.playing, bp: BP.playing }, order = [LV.play, "rc", "bp", "seq"].filter((x, i, a) => a.indexOf(x) === i);
      let src = order.find(k => on[k]) || (JAM.clock ? "jam" : null), t0 = null, sd = null;
      try {
        if (src === "rc") { sd = rcStepDur(); t0 = RC.nextT - RC.step * sd; }
        else if (src === "bp") { sd = BP.sd; t0 = bpTimeAt(-(BP.absBase || 0)); }
        else if (src === "seq") { sd = stepDur(); t0 = nextTime - curStep * sd; }
        else if (src === "jam") { sd = jamStepDur(); t0 = JAM.nextT - JAM.step * sd; }
      } catch (e) { src = null; }
      if (src == null || !isFinite(t0)) return { src: null, bpm: rcBpm() };
      return { src, perf0: Math.round(heardPerf(t0) * 10) / 10, sd, bpm: Math.round(rcBpm() * 10) / 10 };
    }
    function lkBand() {
      const b = JAM.band, sd = jamStepDur();
      return { on: b.on, clock: !!JAM.clock, style: b.style, bass: b.bass, bassLvl: b.bassLvl, drumLvl: b.drumLvl, chord: { root: ((b.chord.root % 12) + 12) % 12, q: b.chord.q },
        perf0: JAM.clock && ctx ? Math.round(heardPerf(JAM.nextT - JAM.step * sd) * 10) / 10 : null, sd, remote: LKS.remote };
    }
    // ---------- the band on the Pixelbook (only while Stage keeps saying it's playing it) ----------
    function lkBandCheck() {
      const r = !!(LKS.wantRemote && lkUp() && performance.now() - LKS.stageBandAt < 2500);
      if (r !== LKS.remote) { LKS.remote = r; add139("link", "band plays on the " + (r ? "Pixelbook" : "tablet")); try { jlPaint(); } catch (e) {} LKS.bandSig = ""; }
    }
    { const bs = jamBandStep; jamBandStep = function () { if (LKS.remote) return; return bs.apply(this, arguments); }; }
    { const jp0 = jlPaint; jlPaint = function () { const r = jp0.apply(this, arguments); try { nbT($id("lvJBand").querySelector("small"), LKS.remote ? "on the Pixelbook" : "bass + drums"); } catch (e) {} return r; }; }
    // ---------- the notes and hits, as they happen ----------
    const lkEv = a => { if (LKS.L && lkUp() && LKS.evQ.length < 600) LKS.evQ.push(a); };
    const vel7 = () => (typeof NB_VEL7 === "number" ? NB_VEL7 : 100);
    { const n0 = noteOn, f0 = noteOff;
      noteOn = function (m) { const r = n0.apply(this, arguments); if (LKS.L) lkEv(["n", tp(), m, vel7(), "k"]); return r; };
      noteOff = function (m) { const r = f0.apply(this, arguments); if (LKS.L) lkEv(["f", tp(), m, "k"]); return r; }; }
    { const pv = padVoices, ps = padStop;
      padVoices = function (id, notes, vel) { const r = pv.apply(this, arguments); if (LKS.L) notes.forEach(m => lkEv(["n", tp(), m, Math.round(Math.max(1, Math.min(127, vel || 100))), "pd"])); return r; };
      padStop = function (id) { const ns = jlPadNotes.get(id), r = ps.apply(this, arguments); if (LKS.L && ns) ns.forEach(m => lkEv(["f", tp(), m, "pd"])); return r; }; }
    const roleOf = id => { try { const s = typeof id === "string" ? rcSnd(id) : null; return s ? s.role : "perc"; } catch (e) { return "perc"; } };
    { const bh = bpHit; bpHit = function (k, t, vel) {
        const r = bh.apply(this, arguments);
        if (LKS.L && lkUp() && ctx && r) { const P = bpPad(k), live = jlBpLive > 0; if (live || lkDirect()) lkEv([live ? "p" : "P", Math.round(heardPerf(Math.max(t, ctx.currentTime)) * 10) / 10, k, Math.round(vel * 100) / 100, roleOf(P && P.src), live && P ? bpName(P).slice(0, 18) : ""]); }
        return r; }; }
    { const rh = rcHit; rcHit = function (i, t, vel) {
        const r = rh.apply(this, arguments);
        if (LKS.L && lkUp() && ctx) { const tr = RCP.tracks[i], live = jlRcLive > 0; if (tr && (live || lkDirect())) lkEv([live ? "r" : "R", Math.round(heardPerf(Math.max(t, ctx.currentTime)) * 10) / 10, i, Math.round(vel * 100) / 100, roleOf(tr.snd), live ? ((rcSnd(tr.snd) || {}).name || "") : ""]); }
        return r; }; }
    // ---------- the level ----------
    let lkTd = null, lkFd = null;
    function lkLevel() {
      if (!analyser || !ctx) return null;
      if (!lkTd || lkTd.length !== analyser.fftSize) { lkTd = new Float32Array(analyser.fftSize); lkFd = new Uint8Array(analyser.frequencyBinCount); }
      analyser.getFloatTimeDomainData(lkTd); analyser.getByteFrequencyData(lkFd);
      let s = 0, pk = 0; for (let i = 0; i < lkTd.length; i++) { const v = lkTd[i]; s += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
      const bands = [], n = lkFd.length, ny = ctx.sampleRate / 2;
      for (let b = 0; b < 16; b++) { const f0 = 30 * Math.pow(2, b * 0.62), f1 = 30 * Math.pow(2, (b + 1) * 0.62); let i0 = Math.max(1, Math.floor(f0 / ny * n)), i1 = Math.max(i0 + 1, Math.min(n, Math.ceil(f1 / ny * n))), m = 0; for (let i = i0; i < i1; i++) if (lkFd[i] > m) m = lkFd[i]; bands.push(Math.round(m / 2.55) / 100); }
      return { r: Math.round(Math.sqrt(s / lkTd.length) * 1000) / 1000, p: Math.round(pk * 1000) / 1000, s: bands };
    }
    // ---------- the beat of it all: ten times a second while linked ----------
    setInterval(() => {
      if (!LKS.L) return; LKS.tick++;
      lkBandCheck();
      if (!lkUp()) { LKS.evQ.length = 0; return; }
      const nowp = performance.now();
      try {
        if (LKS.evQ.length) { const q = LKS.evQ.splice(0); lkSend("ev", lkDirect() ? q : q.filter(e => e[0] !== "P" && e[0] !== "R")); }
        if (LKS.tick % (lkDirect() ? 2 : 3) === 0 || !LKS.lastSt) {
          const s = JSON.stringify(lkState());
          if (s !== LKS.lastSt || nowp - LKS.stAt > 3000) { LKS.lastSt = s; LKS.stAt = nowp; lkSend("st", JSON.parse(s), !lkDirect()); }
        }
        const g = lkGrid(), gs = g.src + ":" + (g.perf0 != null ? Math.round(g.perf0) % Math.max(1, Math.round(g.sd * 16000)) : "") + ":" + (g.sd || 0).toFixed(5);
        if (gs !== LKS.gridSig || nowp - LKS.gridAt > 2000) { LKS.gridSig = gs; LKS.gridAt = nowp; lkSend("grid", g); }
        const b = lkBand(), bsig = JSON.stringify([b.on, b.clock, b.style, b.bass, b.bassLvl, b.drumLvl, b.chord, b.perf0 != null ? Math.round(b.perf0) % Math.max(1, Math.round(b.sd * 16000)) : null, b.remote]);
        if (bsig !== LKS.bandSig || nowp - LKS.bandAt > 2000) { LKS.bandSig = bsig; LKS.bandAt = nowp; lkSend("band", b); }
        if (lkDirect()) { const lv0 = lkLevel(); if (lv0) lkSend("lv", lv0, true); }
      } catch (e) {}
    }, 100);
    // ---------- what Stage asks for ----------
    const slVer = () => SL.songs.length + ":" + SL.songs.map(S => S.name).join("|");
    const rcVer = () => RCP.tracks.map(tr => tr.snd + tr.len + tr.on.slice(0, tr.len).join("")).join("|");
    function lkData(kind) {
      if (kind === "setlist") return { kind, ver: slVer(), cur: SL.cur, songs: SL.songs.map((S, i) => ({ i, name: S.name, bpm: S.bpm, notes: S.notes || "", label: S.label || "", vis: S.vis || "" })) };   // (166) vis: the Stage visual the song asks for
      if (kind === "rhythm") return { kind, ver: rcVer(), steps: RCP.steps, swing: RCP.swing, tracks: RCP.tracks.map((tr, i) => ({ i, snd: tr.snd, name: (rcSnd(tr.snd) || {}).name || tr.snd, role: roleOf(tr.snd), len: tr.len, on: tr.on.slice(0, RC_MAX).map(x => x ? 1 : 0), acc: tr.acc.slice(0, RC_MAX).map(x => x ? 1 : 0), mute: !!tr.mute })) };
      if (kind === "kits") {
        const K = window.__bpkits, list = [];
        if (K) K.KITS.forEach(([g, kits]) => kits.forEach(k => list.push({ id: k[0], name: k[1], group: g, sub: k[2] })));
        return { kind, list, bank: BPS.bank, banks: [0, 1, 2, 3].map(b => { const k = list.find(x => { try { return K.on(x.id, b); } catch (e) { return false; } }); return k ? k.name : bankName(b); }) };
      }
      return { kind, error: "unknown" };
    }
    function lkPush(d) {
      const ok = msg => lkSend("ack", { id: d.id, ok: true, msg }), no = msg => lkSend("ack", { id: d.id, ok: false, msg });
      if (LK.ctl === false) return no("Editing from the Pixelbook is switched off on the tablet (Gear)");
      if (d.kind === "setlist") {
        if (d.ver !== slVer()) { lkSend("data", lkData("setlist")); return no("The set list changed on the tablet, so it was sent again: make the change once more"); }
        const old = SL.songs, cur = SL.cur >= 0 ? old[SL.cur] : null;
        SL.songs = d.songs.filter(x => old[x.i]).map(x => { const S = old[x.i]; S.name = String(x.name || S.name).slice(0, 40); if (x.notes) S.notes = String(x.notes).slice(0, 2000); else delete S.notes; if (x.vis) S.vis = String(x.vis).slice(0, 24); else delete S.vis; return S; });
        SL.cur = cur ? SL.songs.indexOf(cur) : -1; if (SL.pend) songCancel();
        slSave(); paintSong(); add139("link", "set list from the Pixelbook: " + SL.songs.length + " songs");
        lkSend("data", lkData("setlist")); return ok("Set list saved on the tablet");
      }
      if (d.kind === "rhythm") {
        if (d.ver !== rcVer()) { lkSend("data", lkData("rhythm")); return no("The pattern changed on the tablet, so it was sent again: make the change once more"); }
        d.tracks.forEach(x => { const tr = RCP.tracks[x.i]; if (!tr) return; const L = Math.max(1, Math.min(RC_MAX, x.len | 0)); tr.len = L; for (let s = 0; s < RC_MAX; s++) { tr.on[s] = x.on[s] ? 1 : 0; tr.acc[s] = x.on[s] && x.acc[s] ? 1 : 0; } });
        rcSave(); rcRenderSoon(); add139("link", "rhythm pattern from the Pixelbook");
        lkSend("data", lkData("rhythm")); return ok("Pattern saved on the tablet");
      }
      if (d.kind === "kit") {
        const K = window.__bpkits, b = d.bank | 0; if (!K || b < 0 || b > 3) return no("No kits here");
        const keep = BPS.bank; BPS.bank = b; try { K.load(d.id); } finally { BPS.bank = keep; } try { bpPaintGrid(); lvPaintPads(true); } catch (e) {}
        add139("link", "kit " + d.id + " onto bank " + "ABCD"[b] + " from the Pixelbook");
        lkSend("data", lkData("kits")); return ok("Loaded onto bank " + "ABCD"[b]);
      }
      no("Unknown change");
    }
    function lkCmd(d) {
      if (LK.ctl === false) { lkSend("ack", { id: d.id, ok: false, msg: "Control from the Pixelbook is switched off on the tablet (Gear)" }); return; }
      start();
      const c = d.do;
      if (c === "loop") jlLoop(d.k | 0);
      else if (c === "loopsOff") jamLoopsOff();
      else if (c === "loopClear") jamClear(d.k | 0);
      else if (c === "band") jlBand(d.on);
      else if (c === "style" && JAM_STYLES[d.id]) { JAM.band.style = d.id; jamSave(); jamPaintBand(); }
      else if (c === "bass") { JAM.band.bass = d.id; jamSave(); jamPaintBand(); }
      else if (c === "play") { if (["seq", "rc", "bp"].includes(d.what) && d.what !== LV.play) { LV.play = d.what; lvSave(); } lvTransport(); }
      else if (c === "stopAll") tap("stopAll");
      else if (c === "song") songStep(d.d > 0 ? 1 : -1);
      else if (c === "songGo") songGo(d.i | 0);
      else if (c === "hold") tap("hold");
      else if (c === "arp") { const w = !arpLive(); arpSet(w); arpSay(w); }
      else if (c === "tempo") { for (let n = Math.min(10, Math.abs(d.d | 0)); n > 0; n--) tap(d.d > 0 ? "bpmUp" : "bpmDown"); }
      else if (c === "xy") lkXY(d);
      if (!lv.hidden && c !== "xy") { try { lvPaintTop(); } catch (e) {} }
      if (c !== "xy") add139("link", "from the Pixelbook: " + c + (d.k != null ? " " + d.k : d.id ? " " + d.id : ""));
      LKS.lastSt = "";
    }
    // the XY pad: the filter across, Space up; let go and both go back
    function lkXY(d) {
      const x = Math.max(0, Math.min(1, +d.x || 0)), y = Math.max(0, Math.min(1, +d.y || 0));
      if (d.on) {
        if (!LKS.xy) { LKS.xy = { f: mlGet(F_FILTER), s: mlGet(fxK(3)), fx: state.fx.on === false }; if (LKS.xy.fx) setFxOn(true); }
        learnApply(F_FILTER, x); learnApply(fxK(3), y);
      } else if (LKS.xy) {
        const o = LKS.xy; LKS.xy = null;
        if (o.f != null) learnApply(F_FILTER, o.f); if (o.s != null) learnApply(fxK(3), o.s); if (o.fx) setFxOn(false);
      }
    }
    function lkIn(t, d) {
      if (t === "cmd") lkCmd(d || {});
      else if (t === "pull") lkSend("data", lkData(d && d.kind));
      else if (t === "push") lkPush(d || {});
      else if (t === "bandHere") { LKS.wantRemote = !!(d && d.on); if (d && d.on) LKS.stageBandAt = performance.now(); lkBandCheck(); add139("link", "Stage asks to play the band " + (LKS.wantRemote ? "there" : "here")); }
      else if (t === "bandOk") { LKS.stageBandAt = performance.now(); lkBandCheck(); }
      else if (t === "hi") { LKS.lastSt = ""; LKS.gridSig = ""; LKS.bandSig = ""; }
    }
    // ---------- Gear: the Pixelbook ----------
    const pbDot = document.createElement("i"); pbDot.className = "g-pb"; gearB.insertBefore(pbDot, gearB.querySelector("span"));
    { const pg = paintGear; paintGear = function () { const r = pg.apply(this, arguments); pbDot.classList.toggle("on", lkUp()); pbDot.classList.toggle("look", !!LKS.L && !lkUp()); pbDot.hidden = !LK.on; return r; }; }
    function lkSay() {
      if (!lkHere()) return ["", window.NB_LITE ? "Not in Lite" : "Works from the GitHub site (nathan-san1981.github.io/nate-bloom), not from here"];
      if (!LK.on) return ["", "Off"];
      const m = LKS.mode;
      if (m === "direct") return ["on", "Connected straight over Wi-Fi" + (LKS.L && LKS.L.rtt != null ? "" : "")];
      if (m === "relay") return ["warn", "Connected through the internet: slower (this network keeps the two apart)"];
      if (m === "connecting") return ["look", "Found the Pixelbook: connecting…"];
      if (LKS.L && LKS.of && !LKS.brokers) return ["bad", "Can't reach the internet: the link needs Wi-Fi or the hotspot"];
      return ["look", "Waiting for Stage on the Pixelbook…"];
    }
    function gearHTML() {
      if (window.NB_LITE) return "";
      const [c, s] = lkSay(), here = lkHere();
      return `<div class="lv-pkg">Pixelbook (Stage)</div>
        <div class="lv-gr pb-st"><span class="lv-st${c ? " " + c : ""}"></span><span class="pb-say">${esc3(s)}</span>${here ? `<button class="btn" data-g="lk">${LK.on ? "Turn off" : "Turn on"}</button>` : ""}</div>
        ${here && LK.on ? `<div class="lv-gr pb-code"><span>Code</span><b>${esc3(LK.code)}</b><button class="btn" data-g="lknew">New code</button></div>
        <p class="lv-note">On the Pixelbook open <b>nathan-san1981.github.io/nate-bloom/stage</b> and type the code once. Both on the same Wi-Fi or hotspot. Nothing here waits for it: if the link drops, the tablet carries on as it is.</p>
        <label class="pb-sw"><input type="checkbox" data-g="lkctl"${LK.ctl !== false ? " checked" : ""}> Let the Pixelbook run loops, the band, ▶, the set list and edits</label>` : ""}`;
    }
    function gearLkPaint() {
      if (pick.hidden || !pick.querySelector(".lv-gearl")) return;
      const [c, s] = lkSay(), st = pick.querySelector(".pb-st .lv-st"), say = pick.querySelector(".pb-say");
      if (st) st.className = "lv-st" + (c ? " " + c : ""); if (say) nbT(say, s);
    }
    { const og = openGear; openGear = function () {
        const r = og.apply(this, arguments), g = k => pick.querySelector(`[data-g="${k}"]`);
        if (g("lk")) g("lk").addEventListener("click", () => { LK.on = !LK.on; lkSave(); add139("link", "pixelbook link " + (LK.on ? "on" : "off")); if (LK.on) lkStart(); else lkStop(); paintGear(); openGear(); });
        if (g("lknew")) g("lknew").addEventListener("click", () => { LK.code = NBLink.newCode(); lkSave(); lkStart(); openGear(); });
        if (g("lkctl")) g("lkctl").addEventListener("change", e => { LK.ctl = e.target.checked; lkSave(); LKS.lastSt = ""; if (!LK.ctl && LKS.xy) lkXY({ on: false }); });
        return r; }; }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ pixelbook: { on: !!LK.on, mode: LKS.mode, brokers: LKS.brokers + "/" + LKS.of, rtt: LKS.L ? LKS.L.rtt : null, band: LKS.remote ? "pixelbook" : "tablet", control: LK.ctl !== false } }));
    if (LK.on) setTimeout(lkStart, 1500);
    paintGear();
    window.__live13 = { LK, LKS, lkStart, lkStop, lkState, lkGrid, lkBand, lkData, lkIn, gearHTML, heardPerf };
