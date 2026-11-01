  // ======================================================================
  // Chord Morph: a second chord, and a slider that slides every note of the chord you hold toward it (each voice
  // glides to its new note; halfway is literally between). MPE and polyphonic aftertouch: each note gets its own bend,
  // pressure and slide (CC 74). Per-note pitch reaches every synth and sampler sound; pressure and slide reach Natewave.
  // ======================================================================
  {
    const CM = { b: "off", amt: 0, bus: [], ctx: null, root: null, idx: -1, waves: [] };
    const MPE = { on: false, range: 48, chNote: {}, chBend: {}, note: -1, bus: {}, ctx: null, waves: {} };
    try { const o = JSON.parse(localStorage.getItem("nightbloom-chordmorph") || "{}"); if (o.b && CHORDS.some(c => c[0] === o.b)) CM.b = o.b; CM.amt = +o.amt || 0; } catch (e) {}
    try { MPE.on = localStorage.getItem("nightbloom-mpe") === "1"; } catch (e) {}
    const cmSave = () => { try { localStorage.setItem("nightbloom-chordmorph", JSON.stringify({ b: CM.b, amt: CM.amt })); } catch (e) {} };
    const ivA = () => (CHORDS.find(c => c[0] === chordType) || CHORDS[0])[2], ivB = () => CM.b === "off" ? null : (CHORDS.find(c => c[0] === CM.b) || [0, 0, null])[2];
    function cmShift(i) { const A = ivA(), B = ivB(); if (!B || i < 0 || i >= A.length) return 0; return (B[Math.min(i, B.length - 1)] - A[i]) * CM.amt; }
    const cs = c => { if (c.createConstantSource) { const n = c.createConstantSource(); n.offset.value = 0; n.start(); return n; } return null; };
    function cmBus(i) {
      if (CM.ctx !== ctx) { CM.ctx = ctx; CM.bus = []; }
      if (!CM.bus[i]) { CM.bus[i] = cs(ctx); if (CM.bus[i]) CM.bus[i].offset.value = cmShift(i) * 100; }
      return CM.bus[i];
    }
    function mpeBus(n) {
      if (MPE.ctx !== ctx) { MPE.ctx = ctx; MPE.bus = {}; }
      if (!MPE.bus[n]) MPE.bus[n] = cs(ctx);
      return MPE.bus[n];
    }
    function cmApply() {
      if (!ctx) return; const t = ctx.currentTime;
      CM.bus.forEach((b, i) => { if (b) b.offset.setTargetAtTime(cmShift(i) * 100, t, 0.03); });
      CM.waves = CM.waves.slice(-64);
      CM.waves.forEach(w => { try { w.R.node.port.postMessage({ t: "vctl", id: w.id, k: "shift", v: cmShift(w.i), g: 0.05 }); } catch (e) {} });
    }
    // every oscillator or sample a played note makes: its chord voice's glide, and its own note's MPE bend
    { const pc = pitchConnect; pitchConnect = function (node) {
        pc.apply(this, arguments);
        try {
          if (!node || !node.detune) return;
          const list = [];
          if (CM.idx >= 0 && CM.b !== "off") { const b = cmBus(CM.idx); if (b) list.push(b); }
          if (MPE.on && MPE.note >= 0) { const b = mpeBus(MPE.note); if (b) list.push(b); }
          if (!list.length) return;
          list.forEach(b => b.connect(node.detune));
          node.addEventListener("ended", () => list.forEach(b => { try { b.disconnect(node.detune); } catch (e) {} }));
        } catch (e) {}
      }; }
    // which chord voice is being made
    { const mn = makeNote; makeNote = function (root) { const k = CM.root; CM.root = root; try { return mn.apply(this, arguments); } finally { CM.root = k; } }; }
    const tagged = fn => function (m) {
      const k = CM.idx;
      CM.idx = CM.root != null ? chordTones(CM.root).indexOf(m) : -1;
      try { return fn.apply(this, arguments); } finally { CM.idx = k; }
    };
    makeVoice = tagged(makeVoice); layerVoices = tagged(layerVoices); libVoices = tagged(libVoices); makeSampleVoice = tagged(makeSampleVoice); makeInstVoice = tagged(makeInstVoice);
    // Natewave asks as each voice starts
    NB_CM = {
      wave(R, id, midi) {
        const i = CM.idx;
        if (i >= 0 && CM.b !== "off") CM.waves.push({ R, id, i });
        if (MPE.on || MPE.poly) { const w = MPE.waves[midi] || (MPE.waves[midi] = []); w.push({ R, id }); if (w.length > 8) w.shift(); }
        return { shift: i >= 0 ? cmShift(i) : 0, bend: MPE.on && MPE.note === midi ? MPE.chBend[MPE.chOf] || 0 : 0 };
      },
    };
    // ---- per note: bend, pressure, slide ----
    const toWave = (n, k, v) => (MPE.waves[n] || []).forEach(w => { try { w.R.node.port.postMessage({ t: "vctl", id: w.id, k, v }); } catch (e) {} });
    function mpeBend(n, semis) { const b = MPE.bus[n]; if (b && ctx) b.offset.setTargetAtTime(semis * 100, ctx.currentTime, 0.004); toWave(n, "bend", semis); }
    { const om = onMidi; onMidi = function (e) {
        const d = e.data || [], st = d[0], d1 = d[1], d2 = d[2], cmd = st & 0xf0, ch = st & 15;
        if (!md.ins.has(e.target.id) || !md.opt.noteIn) return om.apply(this, arguments);
        if (cmd === 0xa0) { MPE.poly = true; toWave(d1, "press", d2 / 127); return; }   // polyphonic aftertouch: that note's pressure
        if (MPE.on && ch !== 0) {
          if (cmd === 0x90 && d2 > 0) {
            MPE.chNote[ch] = d1; MPE.note = d1; MPE.chOf = ch;
            const b = mpeBus(d1); if (b) b.offset.setValueAtTime((MPE.chBend[ch] || 0) * 100, ctx ? ctx.currentTime : 0);
            try { return om.apply(this, arguments); } finally { MPE.note = -1; }
          }
          if (cmd === 0xe0) { const semis = (((d2 << 7) | d1) / 8192 - 1) * MPE.range; MPE.chBend[ch] = semis; const n = MPE.chNote[ch]; if (n != null) mpeBend(n, semis); return; }
          if (cmd === 0xd0) { const n = MPE.chNote[ch]; if (n != null) toWave(n, "press", d1 / 127); return; }
          if (cmd === 0xb0 && d1 === 74) { const n = MPE.chNote[ch]; if (n != null) toWave(n, "slide", d2 / 127); return; }
        }
        return om.apply(this, arguments);
      }; }
    // ---- the controls: "→ chord" and its slider, next to Chord; MPE in the MIDI sheet ----
    const wrap = document.createElement("span"); wrap.className = "cm-wrap"; wrap.id = "cmWrap";
    wrap.innerHTML = `<label class="meter"><span class="mlab">Morph to</span><select id="cmB" aria-label="Chord to morph to"></select></label><input type="range" id="cmAmt" min="0" max="1000" aria-label="Chord morph">`;
    document.getElementById("chordWrap").after(wrap);
    const selB = wrap.querySelector("#cmB"), amt = wrap.querySelector("#cmAmt");
    [["off", "—"], ...CHORDS.filter(c => c[0] !== "off").map(c => [c[0], c[1]])].forEach(([v, n]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; selB.appendChild(o); });
    const paint = () => { selB.value = CM.b; amt.value = Math.round(CM.amt * 1000); amt.hidden = CM.b === "off"; wrap.classList.toggle("on", CM.b !== "off"); wrap.hidden = chordType === "off" && CM.b === "off"; };
    selB.addEventListener("change", () => { CM.b = selB.value; cmSave(); paint(); cmApply(); });
    amt.addEventListener("input", () => { CM.amt = amt.value / 1000; cmSave(); cmApply(); });
    chordSel.addEventListener("change", () => { paint(); cmApply(); });
    paint();
    const vel = document.getElementById("mdVel");
    if (vel) {
      const lab = document.createElement("label"); lab.innerHTML = 'MPE <select id="mdMpe" aria-label="MPE controller"><option value="off">Off</option><option value="on">On: each note its own bend, pressure, slide</option></select>';
      vel.closest("label").after(lab);
      const sel = lab.querySelector("select"); sel.value = MPE.on ? "on" : "off";
      sel.addEventListener("change", () => { MPE.on = sel.value === "on"; try { localStorage.setItem("nightbloom-mpe", MPE.on ? "1" : "0"); } catch (e) {} });
    }
    window.__cm = { CM, MPE, cmApply, cmShift, paint };
  }

  // plugins follow the tempo and the sequencer (arpeggiators, glitch steps, tempo-synced delays)
  {
    let last = "", bar0 = 0;
    setInterval(() => {
      const W = window.__wam; if (!W || !W.NBW || !ctx) return;
      const bpm = state.seq && state.seq.bpm || 120, on = !!(typeof playing !== "undefined" && playing), key = bpm + "|" + on;
      if (on && !last.endsWith("|true")) bar0 = ctx.currentTime;
      if (key === last && !(on && Math.random() < 0.05)) return; last = key;
      const ev = { type: "wam-transport", time: ctx.currentTime, data: { tempo: bpm, timeSigNumerator: 4, timeSigDenominator: 4, playing: on, currentBar: 0, currentBarStarted: bar0 } };
      const nodes = [...W.NBW.parts.values()].map(p => p.node).concat([W.NBW.fx, ...Object.values(W.NBW.chains || {})].flat().map(F => F.node));
      nodes.forEach(n => { try { if (n && n.context === ctx && n.scheduleEvents) n.scheduleEvents(ev); } catch (e) {} });
    }, 200);
  }
  // ---------- Sound out: the output device ----------
  {
    const KEY = "nightbloom-sink", row = document.getElementById("sinkRow"), sel = document.getElementById("sinkSel"), info = document.getElementById("sinkInfo");
    const can = typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices;
    let want = null; try { want = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    const fastTo = label => { try { if (window.NBFastPads && window.NBFastPads.setDevice) window.NBFastPads.setDevice(label || ""); } catch (e) {} };
    async function apply(quiet) {
      if (!can || !ctx || !want || !want.id) return;
      try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audiooutput");
        const d = devs.find(x => x.deviceId === want.id) || devs.find(x => want.label && x.label === want.label);
        if (!d) { if (!quiet) noteMsg((want.label || "That output") + " isn't connected; playing on the default."); await ctx.setSinkId(""); fastTo(""); return; }
        if (ctx.sinkId !== d.deviceId) await ctx.setSinkId(d.deviceId);
        fastTo(d.label);
      } catch (e) { if (!quiet) noteMsg("Couldn't switch the output: " + (e && e.message || e), true); }
    }
    async function list() {
      sel.innerHTML = "";
      let devs = [];
      try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audiooutput"); } catch (e) {}
      const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
      add("", "System default");
      devs.filter(d => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications").forEach((d, i) => add(d.deviceId, d.label || "Output " + (i + 1)));
      if (devs.length && !devs.some(d => d.label)) add("?names", "Show their names…");
      sel.value = want && want.id && [...sel.options].some(o => o.value === want.id) ? want.id : "";
      info.textContent = ctx && ctx.sinkId && want ? "Playing on " + (want.label || "the chosen output") + (window.NBFastPads ? "; fast pads too" : "") : "Where Nate Bloom plays: a USB interface, headphones, HDMI";
    }
    if (can) {
      row.hidden = false;
      sel.addEventListener("change", async () => {
        if (sel.value === "?names") {   // the browser names outputs once a microphone permission exists
          try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); } catch (e) {}
          return list();
        }
        const o = sel.options[sel.selectedIndex];
        want = sel.value ? { id: sel.value, label: o.textContent } : null;
        try { localStorage.setItem(KEY, JSON.stringify(want)); } catch (e) {}
        start();
        if (!want) { try { await ctx.setSinkId(""); } catch (e) {} fastTo(""); noteMsg("Playing on the system default"); }
        else { await apply(false); noteMsg("Playing on " + want.label); }
        list();
      });
      document.getElementById("midiBtn").addEventListener("click", list);
      try { navigator.mediaDevices.addEventListener("devicechange", () => { list(); apply(true); }); } catch (e) {}
      const ba = buildAudio; buildAudio = function () { const r = ba.apply(this, arguments); setTimeout(() => apply(true), 0); return r; };
      if (ctx) apply(true);
    }
  }
  // ---------- Link: the tablet and the computer on the same Wi-Fi ----------
  {
    const LN = window.NBLinkNative || null;
    const LK = { hub: !!(LN && LN.hub), on: false, peers: [], found: [], finding: false, me: null, off: new Map(), pings: new Map(), together: true, quiet: 0, inbox: new Map(), status: "", codeFor: null, lastSent: null };
    const KEY = "nightbloom-link";
    try { if (typeof KEEP_KEYS !== "undefined" && !KEEP_KEYS.includes(KEY)) KEEP_KEYS.push(KEY); } catch (e) {}   // (not part of a project)
    try { Object.assign(LK, { me: JSON.parse(localStorage.getItem(KEY) || "null") }); } catch (e) {}
    if (LK.me && LK.me.together === false) LK.together = false;
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, LK.me || {}, { together: LK.together }))); } catch (e) {} };
    const now = () => performance.timeOrigin + performance.now();
    const btn = document.getElementById("lkBtn"), sheet = document.getElementById("lkSheet"), body = document.getElementById("lkBody"), info = document.getElementById("lkInfo"), dot = document.getElementById("lkDot");
    const devName = () => { const m = /Android[^;]*;\s*([^;)]+?)(?: Build|\))/.exec(navigator.userAgent), md = m && m[1].trim(); return md && md !== "K" ? "Tablet (" + md + ")" : "Tablet"; };
    function send(m, to) {
      if (!LN) return false;
      const o = Object.assign({}, m); if (LK.hub) o.to = to == null ? "*" : to;
      try { return LN.send(JSON.stringify(o)) !== false; } catch (e) { return false; }
    }
    const linked = () => LK.hub ? LK.peers.length > 0 : LK.on;
    const peerName = id => LK.hub ? ((LK.peers.find(p => p.id === id) || LK.peers[0] || {}).name || "the tablet") : ((LK.me && LK.me.name) || "the computer");
    // clocks: each side keeps how far the other's clock is from its own (the best of recent pings)
    function ping(to) { send({ t: "ping", a: now() }, to); }
    function offOf(from) { const s = LK.off.get(from == null ? 0 : from); return s ? s.off : 0; }
    let pingT = 0;
    function pinging(on) {
      clearInterval(pingT); pingT = 0; if (!on) return;
      let n = 0; const burst = setInterval(() => { ping(); if (++n >= 6) clearInterval(burst); }, 120);
      pingT = setInterval(() => ping(), 4000);
    }
    // ---- messages in ----
    function handle(m) {
      const from = m.from == null ? 0 : m.from;
      switch (m.t) {
        case "found": if (!LK.found.some(f => f.host === m.host)) LK.found.push({ name: m.name, host: m.host, port: m.port }); paint(); break;
        case "find-done": LK.finding = false; if (!LK.found.length) LK.status = "No computer answered. Is Nate Bloom open on it, with Let the tablet link on, and on the same Wi-Fi?"; paint(); break;
        case "connected": LK.status = "Linking…"; send({ t: "hello", name: devName(), token: LK.me && LK.me.token }); paint(); break;
        case "code?": LK.codeFor = m.name; LK.status = m.wrong ? "That code didn't match. Try again." : ""; paint(); break;
        case "welcome": LK.on = true; LK.codeFor = null; LK.me = Object.assign({}, LK.me, { name: m.name, token: m.token }); keep(); LK.status = ""; pinging(true); paint(); noteMsg("Linked with " + m.name); break;
        case "denied": LK.codeFor = null; LK.status = "The computer said no (three wrong codes). Find it again to retry."; paint(); break;
        case "disconnected": if (LK.on) noteMsg("Link to " + peerName() + " ended"); LK.on = false; pinging(false); paint(); break;
        case "link-error": LK.on = false; LK.status = "Couldn't reach it: " + (m.why || "no answer") + "."; paint(); break;
        case "peers": LK.peers = m.peers || []; if (m.joined) noteMsg(m.joined + " linked"); if (m.left) noteMsg(m.left + " unlinked"); pinging(LK.peers.length > 0); paint(); break;
        case "code": showCode(m.name, m.code); break;
        case "code-done": showCode(null); break;
        case "ping": send({ t: "pong", a: m.a, b: now() }, m.from); break;
        case "pong": { const t1 = now(), rtt = t1 - m.a, off = m.b - (m.a + rtt / 2), cur = LK.off.get(from);
          if (rtt < 2000 && (!cur || rtt <= cur.rtt * 1.5 || t1 - cur.at > 20000)) LK.off.set(from, { off, rtt, at: t1 });
          break; }
        case "tempo": if (LK.together && Number.isFinite(m.bpm)) { LK.quiet++; try { setBpm(m.bpm); } finally { LK.quiet--; } } break;
        case "play": if (LK.together) remotePlay(m, from); break;
        case "stop": if (LK.together) { LK.quiet++; try { if (playing) stopSeq(); } finally { LK.quiet--; } } break;
        case "proj": recvChunk(m, from); break;
        case "proj-get": sendProject(from); break;
      }
    }
    if (LN) { window.__nbLinkIn = s => { try { handle(JSON.parse(s)); } catch (e) {} }; if (LN.onMessage) LN.onMessage(s => window.__nbLinkIn(s)); }
    // ---- play together ----
    const LEAD = 0.25;   // seconds between pressing Play and both starting
    function ctxAt(epochMs) { const lat = (ctx && (ctx.outputLatency || ctx.baseLatency)) || 0; return ctx.currentTime + (epochMs - now()) / 1000 - lat; }
    function remotePlay(m, from) {
      if (!ctx) { start(); if (!ctx) return; }
      LK.quiet++;
      try {
        if (Number.isFinite(m.bpm) && m.bpm !== state.seq.bpm) setBpm(m.bpm);
        if (playing) stopSeq();
        NB_START_AT = ctxAt(m.at - offOf(from)); LK.lastStart = now() + (NB_START_AT - ctx.currentTime) * 1000; startSeq();
      } finally { NB_START_AT = null; LK.quiet--; }
    }
    { const s0 = startSeq; startSeq = function () {
        if (LK.quiet || !linked() || !LK.together || !ctx || playing || NB_START_AT != null) return s0.apply(this, arguments);
        const at = now() + LEAD * 1000;   // start here and there at the same moment, a beat of a breath from now
        send({ t: "play", at, bpm: state.seq.bpm });
        NB_START_AT = ctxAt(at); LK.lastStart = now() + (NB_START_AT - ctx.currentTime) * 1000;
        try { return s0.apply(this, arguments); } finally { NB_START_AT = null; }
      };
      const p0 = stopSeq; stopSeq = function () { const was = playing, r = p0.apply(this, arguments); if (was && !LK.quiet && linked() && LK.together) send({ t: "stop" }); return r; };
      const b0 = setBpm; let bt = 0; setBpm = function (b) { const r = b0.apply(this, arguments); if (!LK.quiet && linked() && LK.together) { clearTimeout(bt); bt = setTimeout(() => send({ t: "tempo", bpm: state.seq.bpm }), 120); } return r; }; }
    // ---- projects ----
    const CHUNK = 192 * 1024;
    const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
    async function sendProject(to) {
      if (!linked()) return;
      const name = "From " + (LK.hub ? (LK.selfName || "the computer") : devName()) + " " + stamp();
      LK.status = "Packing the project…"; paint();
      try {
        const p = await snapshotProject(name), u8 = packProject(p), id = Date.now().toString(36), n = Math.max(1, Math.ceil(u8.length / CHUNK));
        for (let i = 0; i < n; i++) {
          send({ t: "proj", id, name, i, n, size: u8.length, d: b64(u8.subarray(i * CHUNK, (i + 1) * CHUNK)) }, to);
          if (i % 4 === 3) { LK.status = "Sending “" + name + "”… " + Math.round((i + 1) / n * 100) + "%"; paint(); await new Promise(r => setTimeout(r, 30)); }
        }
        LK.status = "Sent “" + name + "” (" + (u8.length / 1048576).toFixed(1) + " MB) to " + peerName(to) + "."; paint();
      } catch (e) { LK.status = "Couldn't send it: " + (e && e.message || e); paint(); }
    }
    async function recvChunk(m, from) {
      let box = LK.inbox.get(m.id);
      if (!box) { box = { parts: new Array(m.n), got: 0, name: m.name, size: m.size, from }; LK.inbox.set(m.id, box); }
      if (!box.parts[m.i]) { box.parts[m.i] = m.d; box.got++; }
      LK.status = "Receiving “" + box.name + "” from " + peerName(from) + "… " + Math.round(box.got / m.n * 100) + "%"; paint();
      if (box.got < m.n) return;
      LK.inbox.delete(m.id);
      try {
        const parts = box.parts.map(unb64), u8 = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; parts.forEach(p => { u8.set(p, o); o += p.length; });
        const p = unpackProject(u8); p.size = sizeOf(p);
        const key = "p" + Date.now(), st = await projDB("readwrite"); st.put(p, key);
        LK.got = { key, p, from: peerName(from) }; LK.status = ""; paint();
        try { if (sheet.hidden) { sheet.hidden = false; } } catch (e) {}
      } catch (e) { LK.status = "That project didn't arrive whole: " + (e && e.message || e); paint(); }
    }
    async function openGot() {
      const g = LK.got; if (!g) return;
      LK.status = "Keeping your current work in Projects first…"; paint();
      try { const cur = await snapshotProject("Before " + g.p.name); cur.size = sizeOf(cur); const st = await projDB("readwrite"); st.put(cur, "p" + Date.now()); } catch (e) {}
      loadProjectData(g.p);
    }
    // ---- the sheet ----
    let codeT = 0;
    function showCode(name, code) {
      const box = document.getElementById("lkCode"); clearTimeout(codeT);
      if (!name) { box.hidden = true; return; }
      document.getElementById("lkCodeWho").textContent = name + " wants to link"; document.getElementById("lkCodeNum").textContent = code; box.hidden = false;
      codeT = setTimeout(() => { box.hidden = true; }, 120000);
    }
    document.getElementById("lkCode").addEventListener("click", () => { document.getElementById("lkCode").hidden = true; });
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const button = (txt, fn, primary) => { const b = el("button", "btn" + (primary ? " primary" : ""), txt); b.addEventListener("click", fn); return b; };
    async function paint() {
      if (!LN) return;
      btn.classList.toggle("on", linked()); dot.classList.toggle("on", linked());
      if (sheet.hidden) return;
      body.innerHTML = "";
      if (LK.hub) {
        let st = null; try { st = await LN.status(); } catch (e) {}
        const enabled = !!(st && st.enabled); if (st && st.name) LK.selfName = st.name;
        info.textContent = enabled ? "This computer can be found by the Nate Bloom tablet app on the same Wi-Fi. On the tablet: ☰ → Link → Find computers." : "Let the Nate Bloom tablet app on your Wi-Fi find this computer, send projects both ways and play together.";
        const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", "Let the tablet link"), el("small", "", enabled && st ? (st.name + " · " + (st.addresses || []).join(", ")) : "off"));
        r.append(g, button(enabled ? "Turn off" : "Turn on", async () => { try { await LN.enable(!enabled); } catch (e) {} setTimeout(paint, 300); }, !enabled)); body.appendChild(r);
        LK.peers.forEach(p => { const row = el("div", "lk-row"), gg = el("div", "grow"); gg.append(el("b", "", p.name), el("small", "", "linked")); row.append(gg, button("Send this project", () => sendProject(p.id)), button("Get theirs", () => send({ t: "proj-get" }, p.id))); body.appendChild(row); });
        if (enabled && !LK.peers.length) body.appendChild(el("small", "", "Waiting for the tablet. The first time, it asks for a code that shows up here."));
      } else {
        info.textContent = linked() ? "Linked with " + peerName() + "." : "Link with the Nate Bloom app on your computer (Linux) on the same Wi-Fi: send projects both ways and play together.";
        if (!linked()) {
          if (LK.codeFor) {
            const r = el("div", "lk-row"), inp = el("input", "lk-in"); inp.inputMode = "numeric"; inp.maxLength = 4; inp.placeholder = "Code on " + LK.codeFor; inp.setAttribute("aria-label", "Code shown on the computer");
            const ok = button("Link", () => { send({ t: "code", code: inp.value.trim() }); LK.status = "Checking…"; paint(); }, true);
            inp.addEventListener("keydown", e => { if (e.key === "Enter") ok.click(); });
            r.append(inp, ok); body.appendChild(r); setTimeout(() => inp.focus(), 50);
          } else {
            body.appendChild(button(LK.finding ? "Looking…" : "Find computers", () => { LK.found = []; LK.finding = true; LK.status = ""; paint(); try { LN.find(); } catch (e) {} }, true));
            LK.found.forEach(f => { const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", f.name), el("small", "", f.host)); r.append(g, button("Link", () => connect(f.host, f.port, f.name), true)); body.appendChild(r); });
            if (LK.me && LK.me.host) { const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", LK.me.name || LK.me.host), el("small", "", "last time · " + LK.me.host)); r.append(g, button("Link again", () => connect(LK.me.host, LK.me.port, LK.me.name))); body.appendChild(r); }
            const r = el("div", "lk-row"), inp = el("input", "lk-in"); inp.placeholder = "or its address, like 192.168.1.20"; inp.setAttribute("aria-label", "Computer's address");
            r.append(inp, button("Link", () => { const v = inp.value.trim(); if (v) connect(v.split(":")[0], +(v.split(":")[1] || 47812), v); })); body.appendChild(r);
          }
        } else {
          const acts = el("div", "lk-acts");
          acts.append(button("Send this project", () => sendProject(), true), button("Get theirs", () => send({ t: "proj-get" })), button("Unlink", () => { try { LN.close(); } catch (e) {} LK.on = false; paint(); }));
          body.appendChild(acts);
        }
      }
      if (linked()) {
        const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", "Play together"), el("small", "", LK.together ? "one tempo; Play and Stop on both" : "off: each plays on its own"));
        const t = button(LK.together ? "On" : "Off", () => { LK.together = !LK.together; keep(); paint(); if (LK.together) send({ t: "tempo", bpm: state.seq.bpm }); }); t.setAttribute("aria-pressed", String(LK.together)); r.append(g, t); body.appendChild(r);
      }
      if (LK.got) {
        const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", LK.got.p.name), el("small", "", "from " + LK.got.from + " · " + ((LK.got.p.size || 0) / 1048576).toFixed(1) + " MB · kept in Projects"));
        r.append(g, button("Open it", openGot, true), button("Later", () => { LK.got = null; paint(); })); body.appendChild(r);
      }
      if (LK.status) body.appendChild(el("small", "", LK.status));
    }
    function connect(host, port, name) {
      LK.me = Object.assign({}, LK.me, { host, port: port || 47812, name: name || host }); if (LK.me.host !== host) LK.me.token = null; keep();
      LK.status = "Connecting to " + (name || host) + "…"; LK.found = []; paint();
      try { LN.connect(host, port || 47812); } catch (e) {}
    }
    if (LN) {
      btn.hidden = false;
      btn.addEventListener("click", () => { start(); sheet.hidden = false; paint(); });
      document.getElementById("lkDone").addEventListener("click", () => { sheet.hidden = true; });
      // the tablet links again by itself when it knows the computer
      if (!LK.hub && LK.me && LK.me.host && LK.me.token) setTimeout(() => { try { LN.connect(LK.me.host, LK.me.port || 47812); } catch (e) {} }, 1500);
      if (LK.hub) setTimeout(async () => { try { const st = await LN.status(); LK.peers = (st && st.peers) || []; if (st && st.name) LK.selfName = st.name; if (LK.peers.length) pinging(true); } catch (e) {} paint(); }, 500);   // (after a reload, the tablet is still linked)
    }
    window.__lk = { LK, handle, send, paint, sendProject, ctxAt, offOf };
  }
  // ---------- Ableton Link (the apps): Bitwig and the other Link apps on the network ----------
  {
    const AB = window.NBAbleton || null, Q = 4, KEY = "nightbloom-ablink";
    const A = { on: false, sync: true, nudge: 0, st: null, offs: [], off: null, quiet: 0, tLocal: 0, applied: null, was: null, last: "seq", sig: "", n: 0, timer: 0 };
    try { if (typeof KEEP_KEYS !== "undefined" && !KEEP_KEYS.includes(KEY)) KEEP_KEYS.push(KEY); } catch (e) {}   // (not part of a project)
    try { const k = JSON.parse(localStorage.getItem(KEY) || "null"); if (k) { A.on = !!k.on; A.sync = k.sync !== false; A.nudge = Math.max(-80, Math.min(80, +k.nudge || 0)); } } catch (e) {}
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: A.on, sync: A.sync, nudge: A.nudge })); } catch (e) {} };
    const fmt = b => String(Math.round(b * 10) / 10);
    // ---- clocks: Link's (µs) against this page's (performance.now, ms), the reading with the shortest round trip
    // of the last few seconds; and the page's against the sound card's (when a sample is heard) ----
    function sample() {
      if (!AB) return null;
      const p0 = performance.now(); let st = null; try { st = JSON.parse(AB.state(Q)); } catch (e) {} const p1 = performance.now();
      A.st = st; if (!st || !st.on) return st;
      A.offs.push({ at: p1, rtt: p1 - p0, off: st.now / 1000 - (p0 + p1) / 2 });
      while (A.offs.length > 1 && (p1 - A.offs[0].at > 4000 || A.offs.length > 120)) A.offs.shift();
      A.off = A.offs.reduce((b, x) => x.rtt < b.rtt ? x : b).off;
      st.at = (p0 + p1) / 2;
      return st;
    }
    // (the sound card's clock: performanceTime − contextTime·1000 from getOutputTimestamp, the median of the last
    // couple of seconds, since each reading jitters by an audio block; it starts over after a jump, like a resume)
    const K = []; let Kv = null;
    function kSample() {
      try {
        const ts = ctx && ctx.getOutputTimestamp && ctx.getOutputTimestamp();
        if (!ts || !(ts.performanceTime > 0) || !(ts.contextTime > 0)) return;
        const k = ts.performanceTime - ts.contextTime * 1000;
        if (Kv != null && Math.abs(k - Kv) > 50) K.length = 0;
        K.push(k); if (K.length > 40) K.shift();
        const so = K.slice().sort((a, b) => a - b); Kv = so[so.length >> 1];
      } catch (e) {}
    }
    const kNow = () => { if (Kv == null) kSample(); return Kv != null ? Kv : performance.now() - (ctx.currentTime - ((ctx.outputLatency || ctx.baseLatency) || 0)) * 1000; };
    // (A.nudge, ms: Nate Bloom sounds that much later than the session's grid; for a sound card that reports its
    // delay wrong)
    const ctxToHost = t => (t * 1000 + kNow() + A.off - A.nudge) * 1000;
    const hostToCtx = h => (h / 1000 - A.off - kNow() + A.nudge) / 1000;
    const beatAtHost = h => A.st.beat + (h - A.st.now) / 1e6 * A.st.tempo / 60;
    const hostAtBeat = b => A.st.now + (b - A.st.beat) * 60 / A.st.tempo * 1e6;
    const beatAtCtx = t => beatAtHost(ctxToHost(t)), ctxAtBeat = b => hostToCtx(hostAtBeat(b));
    const live = () => !!(AB && A.on && A.st && A.st.on && A.off != null && ctx);
    const anyPlaying = () => playing || RC.playing;
    // ---- a start: beat 0 here when nobody else is in the session, else their next bar; when they're already playing
    // (Start/Stop Sync), come in on the next 16th, in step with them ----
    NB_GRID = function (steps) {
      if (!AB || !A.on || !ctx) return null;
      if (!sample() || !live()) return null;
      kSample();
      const st = A.st, t = ctx.currentTime + 0.08;
      if (A.sync && st.peers > 0 && st.playing) {
        let b = beatAtCtx(t); const bp = st.tPlay > st.now ? st.beatAtPlay : -1e9; if (bp > b) b = bp;   // (not before they start)
        const n = Math.ceil(b * 4 - 1e-6);
        return { t: ctxAtBeat(n / 4), step: steps ? ((n % steps) + steps) % steps : 0, abs: n };
      }
      let T0 = 0; try { T0 = AB.start(ctxToHost(t), Q); } catch (e) {}
      sample();   // (the local beats moved: beat 0 is the start)
      A.was = A.sync ? true : A.was;
      return T0 > 0 ? { t: hostToCtx(T0), step: 0, abs: 0 } : null;
    };
    // ---- keep the sequencer and the Rhythm Creator on the session's grid (16ths, and the bar in 4/4) ----
    function lock() {
      if (!live()) return;
      const st = A.st;
      const fix = (t, step, bar, sd) => {
        const b = beatAtCtx(t), n = Math.round(b * 4), err = (b * 4 - n) * sd;   // seconds behind the grid (+) or ahead (−)
        let dt = 0, ds = 0;
        if (Math.abs(err) > 0.0012) dt = Math.abs(err) > 0.02 ? -err : -err * 0.6;
        if (bar) { const d = (((n - step) % bar) + bar) % bar; if (d) ds = d > bar / 2 ? d - bar : d; }
        return { dt, ds };
      };
      if (playing && Math.abs(st.tempo - state.seq.bpm) < 0.01) {
        const f = fix(nextTime, curStep, stepsNow() % 16 === 0 ? 16 : 0, stepDur());
        nextTime += f.dt; if (f.ds) curStep = (((curStep + f.ds) % stepsNow()) + stepsNow()) % stepsNow();
        if ((f.dt || f.ds) && RC.playing && Math.abs(RC.nextT - (nextTime - f.dt)) < 0.002) { RC.nextT = nextTime; RC.step += f.ds; return; }   // (locked onto the sequencer: move together)
      }
      if (RC.playing && Math.abs(st.tempo - rcBpm()) < 0.01) {
        const S = rcSigOf(), f = fix(RC.nextT, RC.step, S.bar === 16 ? 16 : 0, rcStepDur());
        RC.nextT += f.dt; RC.step += f.ds;
      }
    }
    // ---- tempo both ways ----
    function takeTempo(bpm) {
      const v = Math.round(bpm * 1000) / 1000; A.applied = v;
      A.quiet++;
      try {
        setBpm(v);
        if (state.seq.bpm !== v && v >= 20 && v <= 300) { state.seq.bpm = v; bpmLabel.textContent = fmt(v) + " bpm"; save(); }   // (past the buttons' 50–180)
      } finally { A.quiet--; }
    }
    { const b0 = setBpm; setBpm = function () {
        const r = b0.apply(this, arguments);
        if (state.seq.bpm % 1) bpmLabel.textContent = fmt(state.seq.bpm) + " bpm";
        if (AB && A.on && !A.quiet) { A.tLocal = performance.now(); try { AB.setTempo(state.seq.bpm); } catch (e) {} }
        return r;
      }; }
    // ---- Play and Stop (Start/Stop Sync) ----
    { const s0 = startSeq; startSeq = function () {
        const was = playing, r = s0.apply(this, arguments);
        if (!was && playing) { A.last = "seq"; try { if (A.on && arpAnchor != null) arpAnchor = nextTime; } catch (e) {} }
        return r;
      };
      const p0 = stopSeq; stopSeq = function () { const was = playing, r = p0.apply(this, arguments); if (was) stopped(); return r; };
      const r0 = rcPlay; rcPlay = function (on) { const was = RC.playing, r = r0.apply(this, arguments); if (on && !was && RC.playing && !playing) A.last = "rc"; if (!on && was) stopped(); return r; }; }
    function stopped() {
      if (!AB || !A.on || A.quiet || !A.sync || anyPlaying()) return;
      try { AB.stop(AB.now()); } catch (e) {} A.was = false;
    }
    function follow(st) {
      if (!A.sync || A.quiet) { A.was = st.playing; return; }
      if (A.was != null && st.playing !== A.was && st.peers > 0) {
        A.quiet++;
        try {
          if (st.playing && !anyPlaying()) { start(); if (ctx) { if (A.last === "rc") rcPlay(true); else startSeq(); } }
          else if (!st.playing && anyPlaying()) { if (playing) stopSeq(); if (RC.playing) rcPlay(false); }
        } finally { A.quiet--; }
      }
      A.was = st.playing;
    }
    // ---- the loop: 20 times a second while it's on ----
    function poll() {
      const st = sample(); if (!st || !st.on) return;
      if (ctx) kSample();
      if (Math.abs(st.tempo - state.seq.bpm) > 0.004 && st.tempo !== A.applied && performance.now() - A.tLocal > 400) takeTempo(st.tempo);
      follow(st);
      if (++A.n % 4 === 0) lock();
      bpmLabel.classList.toggle("abl", st.peers > 0);
      const sig = st.peers + "|" + fmt(st.tempo) + "|" + st.playing;
      if (sig !== A.sig) { A.sig = sig; if (!sheet.hidden) paint(); }
    }
    function setOn(on) {
      A.on = on; keep(); clearInterval(A.timer); A.timer = 0; A.offs = []; A.off = null; A.was = null; A.applied = null;
      let ok = false; try { ok = AB.enable(on, state.seq.bpm); if (on) AB.sync(A.sync); } catch (e) {}
      if (on && ok) {
        A.timer = setInterval(poll, 50);
        setTimeout(() => { const st = sample(); if (A.on && st && st.on && !st.peers) { try { AB.setTempo(state.seq.bpm); } catch (e) {} } }, 250);   // alone: the session takes this tempo
      }
      if (!on) bpmLabel.classList.remove("abl");
      paint();
    }
    // ---- the sheet ----
    const btn = document.getElementById("lkBtn"), sheet = document.getElementById("lkSheet"), box = document.getElementById("ablBody");
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    function row(title, sub, label, fn, on) {
      const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", title), el("small", "", sub));
      const b = el("button", "btn" + (on ? "" : " primary"), label); b.setAttribute("aria-pressed", String(!!on)); b.addEventListener("click", fn); r.append(g, b); return r;
    }
    function paint() {
      if (!AB || !box) return;
      box.hidden = false; box.innerHTML = "";
      const st = A.st || {};
      box.appendChild(el("div", "bt-style", "Ableton Link"));
      const sub = !A.on ? "Off. Shares the tempo and the bars with Bitwig and other Link apps on this network."
        : st.on ? (st.peers ? "Connected to " + st.peers + " app" + (st.peers === 1 ? "" : "s") : "On. No other Link apps yet") + " · " + fmt(st.tempo || state.seq.bpm) + " bpm" + (st.peers && st.playing && A.sync ? " · playing" : "") : "Starting…";
      box.appendChild(row("Ableton Link", sub, A.on ? "On" : "Off", () => { start(); setOn(!A.on); }, A.on));
      if (A.on) {
        box.appendChild(row("Start/Stop Sync", A.sync ? "Play and Stop here start and stop the others, and theirs start and stop Nate Bloom" : "Off: tempo and bars only; each starts on its own", A.sync ? "On" : "Off",
          () => { A.sync = !A.sync; keep(); try { AB.sync(A.sync); } catch (e) {} A.was = null; paint(); }, A.sync));
        if (st.on && (st.tempo < 20 || st.tempo > 300)) box.appendChild(el("small", "", "The session's tempo (" + fmt(st.tempo) + ") is past what Nate Bloom plays (20–300), so it isn't following."));
        const r = el("div", "lk-row"), g = el("div", "grow"), v = el("b", "", (A.nudge > 0 ? "+" : A.nudge < 0 ? "−" : "") + Math.abs(A.nudge) + " ms");
        g.append(el("b", "", "Timing"), el("small", "", A.nudge ? "Nate Bloom plays " + Math.abs(A.nudge) + " ms " + (A.nudge > 0 ? "later" : "earlier") + " than the others' beat" : "If Nate Bloom sounds early or late against the others, move it here"));
        const nb = (txt, d) => { const b = el("button", "btn", txt); b.setAttribute("aria-label", d > 0 ? "Later" : "Earlier"); b.addEventListener("click", () => { A.nudge = Math.max(-80, Math.min(80, A.nudge + d)); keep(); paint(); }); return b; };
        v.style.cssText = "min-width:54px;text-align:center;font-family:var(--font-mono)";
        r.append(g, nb("−", -5), v, nb("+", 5)); box.appendChild(r);
        if (st.on && st.peers && !(st.tempo < 20 || st.tempo > 300)) box.appendChild(el("small", "", "Play waits for the next bar, so it starts on the beat with the others."));
      }
    }
    if (AB) {
      btn.hidden = false;
      btn.addEventListener("click", () => { if (!window.NBLinkNative) { start(); sheet.hidden = false; } paint(); });
      if (!window.NBLinkNative) document.getElementById("lkDone").addEventListener("click", () => { sheet.hidden = true; });
      if (A.on) setTimeout(() => setOn(true), 600);   // (it was on last time)
    }
    window.__abl = { A, sample, lock, paint, setOn, kNow, beatAtCtx, ctxAtBeat, ctxToHost, hostToCtx, seq: () => ({ playing, nextTime, curStep, steps: stepsNow(), sd: stepDur() }), rc: () => ({ playing: RC.playing, nextT: RC.nextT, step: RC.step, sd: rcStepDur() }) };
  }
