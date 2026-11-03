  // ---------- recording banner: impossible to miss, on every screen, with Stop → sampler ----------
  // (set up once the rest of the script has run: the Rec button and take code are declared further down)
  setTimeout(() => {
    const bn = document.createElement("div"); bn.className = "recbanner"; bn.hidden = true; bn.setAttribute("role", "status");
    bn.innerHTML = '<span class="dot"></span><span class="lbl">REC<span class="lbl-long"> · everything you hear</span></span><span class="t">0:00</span><select class="rectarget" id="recbTo" aria-label="Where the recording goes"></select><button class="btn" id="recbStop">■ Stop</button>';
    document.body.appendChild(bn);
    const tEl = bn.querySelector(".t");
    let timer = 0;
    // where the recording goes: "take" (decide afterwards), a sampler slot "s0".."s7", or "trk" (a new track in Tracks)
    let recTo = "take"; try { const v = localStorage.getItem("nightbloom-recto"); if (v) recTo = v; } catch (e) {}
    const sels = ["recTo", "djRecTo", "recbTo"].map(id => document.getElementById(id)).filter(Boolean);
    const label = v => v === "take" ? "→ Take" : v === "trk" ? "→ Garage" : "→ S" + (+v.slice(1) + 1);
    function fillSels() {
      const opts = [["take", "→ Take", "Keep it as a take: export, sampler or the Garage afterwards"]];
      for (let j = 0; j < NSLOTS; j++) opts.push(["s" + j, "→ S" + (j + 1), "Sampler slot S" + (j + 1) + (sampBuf[j] ? " (replaces " + baseName(state.samp.slots[j].name || "its sound").slice(0, 18) + ")" : " (empty)")]);
      opts.push(["trk", "→ Garage", "A new audio track in the Garage"]);
      sels.forEach(sel => { sel.innerHTML = ""; opts.forEach(([v, l, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; o.title = t; sel.appendChild(o); }); sel.value = recTo; sel.title = opts.find(o => o[0] === recTo)[2]; });
    }
    sels.forEach(sel => {
      sel.addEventListener("focus", fillSels);
      sel.addEventListener("change", () => { recTo = sel.value; try { localStorage.setItem("nightbloom-recto", recTo); } catch (e) {} fillSels(); noteMsg("Recordings go " + label(recTo).replace("→", "to").replace("to Take", "to the take bar")); });
    });
    fillSels();
    const paint = () => { tEl.textContent = fmtClock(ctx.currentTime - take.startedAt); };
    const st0 = startTake; startTake = function () { st0(); if (take.rec) { bn.hidden = false; document.body.classList.add("recording"); paint(); clearInterval(timer); timer = setInterval(paint, 250); } };
    // stopping delivers the recording where it was set to go
    const sp0 = stopTake; stopTake = function () {
      clearInterval(timer); bn.hidden = true; document.body.classList.remove("recording");
      const r = sp0(); const where = recTo;
      if (take.done && where !== "take") {
        if (where === "trk") document.getElementById("takeToTracks").click();
        else { const j = +where.slice(1); state.samp.slot = j; document.getElementById("takeToSlot").click(); setTimeout(() => { fillSels(); noteMsg("Recorded into S" + (j + 1)); if (typeof djMsg === "function" && !document.getElementById("djView").hidden) djMsg("Recorded into sampler slot S" + (j + 1)); }, 400); }
        takeBar.hidden = true;   // it's been delivered: no take bar or "what to do with it" menu
      }
      return r;
    };
    takeBtn.title = "Record everything you hear; stop it from the red banner, or send it straight to the sampler";
    bn.querySelector("#recbStop").addEventListener("click", () => stopTake());
  }, 0);
  // ---------- Report: everything needed to diagnose a problem, in one zip ----------
  {
    const add = window.__nbAdd || (() => {});
    // more detail in the log from inside the app
    try { if (ctx) ctx.addEventListener("statechange", () => add("audio", ctx.state)); } catch (e) {}
    { const st = start; start = function () { const had = !!ctx; st(); if (!had && ctx) { add("audio", "started · " + ctx.sampleRate + " Hz · " + ctx.state); ctx.addEventListener("statechange", () => add("audio", ctx.state)); } }; }
    { const j0 = jobRun; jobRun = async function (id, label, fn, c) { const t0 = performance.now(); add("job", "start " + label); try { const r = await j0(id, label, fn, c); add("job", "done " + label + " · " + Math.round(performance.now() - t0) + " ms" + (r == null ? " (cancelled or empty)" : "")); return r; } catch (e) { add("job", "failed " + label + ": " + (e && e.message || e)); throw e; } }; }
    { const sm = setMode; setMode = function (m) { add("view", m); return sm(m); }; }
    { const ns = noteMsg; noteMsg = function (m, err) { add(err ? "msg!" : "msg", m); return ns(m, err); }; }

    const brief = b => b ? { sec: +(b.duration).toFixed(2), ch: b.numberOfChannels, rate: b.sampleRate } : null;
    let REPORT_NOTE = "", PRE = null;   // (139: PRE: the sound grabbed the moment the Log was tapped)
    async function snapshot() {
      const r = { app: "Nate Bloom", made: new Date().toString(), page: location.href.split("?")[0], whatWentWrong: REPORT_NOTE };
      r.device = { ua: navigator.userAgent, screen: screen.width + "x" + screen.height, window: innerWidth + "x" + innerHeight, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency, memoryGB: navigator.deviceMemory,
        installed: matchMedia("(display-mode: standalone)").matches, online: navigator.onLine, touch: navigator.maxTouchPoints, language: navigator.language };
      try { if (window.__ne) r.nativeEngine = window.__ne.state(); } catch (e) {}   // (176)
      try { if (window.__nbPlug && window.__nbPlug.ok) r.vstPlugins = { loaded: window.__nbPlug.state ? window.__nbPlug.state() : [], found: window.__nbPlug.plugins.length, errors: window.__nbPlug.errors.length, suspects: Object.keys(window.__nbPlug.suspects || {}) }; } catch (e) {}   // (177)
      try { if (window.__nbRel) r.ringing = window.__nbRel(); } catch (e) {}
      try { if (performance.memory) r.device.jsHeapMB = Math.round(performance.memory.usedJSHeapSize / 1048576) + " of " + Math.round(performance.memory.jsHeapSizeLimit / 1048576); } catch (e) {}
      try { const est = await navigator.storage.estimate(); r.device.storageMB = Math.round(est.usage / 1048576) + " of " + Math.round(est.quota / 1048576); r.device.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) {}
      try { const a = navigator.gpu ? await navigator.gpu.requestAdapter() : null; r.device.gpu = a ? (a.info ? { vendor: a.info.vendor, arch: a.info.architecture, device: a.info.device, desc: a.info.description } : "available") : "none"; } catch (e) { r.device.gpu = "error " + e.message; }
      r.audio = ctx ? { state: ctx.state, rate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency, time: +ctx.currentTime.toFixed(2), pageTime: +(performance.now() / 1000).toFixed(2), capture: CAP.kind || "off", capturePingMs: CAP.pingMs, captureErr: CAP.lastErr || "", sounding: voices.size, held: heldVoices.size != null ? heldVoices.size : heldVoices.length } : "not started";
      r.state = Object.assign({}, { view: state.mode, engine: state.engine, panel: state.panel, octave: state.octave, hold: state.hold, bpm: state.seq.bpm, playing: playing, fx: state.fx, fxMode: FXC.mode });
      r.sampler = state.samp.slots.map((x, i) => ({ slot: "S" + (i + 1), name: x.name, mode: x.mode, loop: !!x.loop, fit: x.fit || null, audio: brief(sampBuf[i]) }));
      r.dj = { open: !document.getElementById("djView").hidden, lead: DJ.lead, sync: DJ.sync, xf: DJ.xf, keylock: DJ.keylock, auto: DJ.auto, style: DJ.style, nextDeck: DJ.nextDeck, mixing: DJ.trans ? { style: DJ.trans.style, bars: DJ.trans.bars } : null,
        decks: DJ.decks.map(d => ({ name: d.name, bpm: d.bpm0, rate: d.rate, bend: d.bend, playing: d.playing, pos: d.buf ? +djPos(d).toFixed(2) : null, loop: d.loop ? d.loop.n : null, eq: d.eq, keyLockNode: !!d.st, audio: brief(d.buf) })),
        songs: DJ.crate.map(it => it && { name: it.name, bpm: it.bpm, key: it.key, cam: it.cam, decoded: !!it.buf, busy: it.busy }), bank: DJ.bank.map(it => it && { name: it.name, beats: it.beats }) };
      r.jam = { loops: JAM.tracks.map(t => ({ len: t.len, on: t.on, events: t.events.length })), band: JAM.band && { on: JAM.band.on, style: JAM.band.style }, recording: !!JAM.rec, clock: !!JAM.clock };
      r.recording = { take: !!take.rec, takeReady: !!take.done, recTo: (() => { try { return localStorage.getItem("nightbloom-recto"); } catch (e) { return null; } })() };
      r.jobsOnScreen = [...document.querySelectorAll(".job .jl span")].map(x => x.textContent);
      r.openSheets = [...document.querySelectorAll(".editor:not([hidden]), .dj:not([hidden]), .trk:not([hidden]), .browser:not([hidden])")].map(e => e.id || e.className);
      try { r.rc = window.__rcSnap ? window.__rcSnap() : null; } catch (e) { r.rc = "error " + e.message; }
      r.settings = {};
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k.startsWith("nightbloom")) continue; let v = localStorage.getItem(k); if (v.length > 20000) v = v.slice(0, 20000) + "…(" + v.length + " chars)"; try { r.settings[k] = JSON.parse(v); } catch (e) { r.settings[k] = v; } } } catch (e) {}
      (window.__nbReportExtras || []).forEach(f => { try { Object.assign(r, f()); } catch (e) { r.extrasError = String(e && e.message || e); } });
      r.log = (window.__nbLog || []).map(([t, k, d]) => (t / 1000).toFixed(2) + "s  " + k.padEnd(13) + " " + d);
      return r;
    }
    function wav16(L, R, rate) {
      const n = L.length, b = new ArrayBuffer(44 + n * 4), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 4, true);
      const o = new Int16Array(b, 44); for (let i = 0; i < n; i++) { o[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; o[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      return new Uint8Array(b);
    }
    async function makeReport() {
      const btn = document.getElementById("reportBtn"); btn.disabled = true;
      add("report", "building");
      try {
        const files = [];
        const snap = await snapshot();
        let soundNote = ctx ? "no sound captured: " + (CAP.lastErr || "unknown") + " · capture " + (CAP.kind || "off") + (CAP.pingMs != null ? " · ping " + CAP.pingMs + " ms" : " · no ping") : "no sound captured (audio wasn't started)";
        try {
          if (ctx && CAP.node) {
            const pre = PRE && Date.now() - PRE.at < 600000 ? PRE : null, secs = pre ? pre.secs : 30; PRE = null;
            let got = pre ? await pre.p : null; if (!got || !got.L) got = await capGrab(secs);
            if (got && got.L && got.L.length) { const keep = Math.min(got.L.length, got.rate * secs), a = got.L.length - keep, nm = "last-" + secs + "-seconds.wav"; files.push({ name: nm, data: wav16(got.L.subarray(a), got.R.subarray(a), got.rate) }); soundNote = "last " + (keep / got.rate).toFixed(1) + " s of sound in " + nm + (pre ? " (grabbed when the Log was tapped)" : ""); }
          }
        } catch (e) { soundNote = "sound capture failed: " + (e && e.message || e); }
        snap.sound = soundNote;
        files.unshift({ name: "report.json", data: new TextEncoder().encode(JSON.stringify(snap, null, 2)) });
        files.splice(1, 0, { name: "log.txt", data: new TextEncoder().encode(snap.log.join("\n")) });
        if (snap.liveTimeline && snap.liveTimeline.rows.length) { const q = x => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x);
          files.push({ name: "live-timeline.csv", data: new TextEncoder().encode([snap.liveTimeline.columns.join(",")].concat(snap.liveTimeline.rows.map(r => r.map(q).join(","))).join("\n")) }); }
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
        const msg = await saveZip("nate-bloom-report-" + stamp, zipMany(files));
        noteMsg(msg ? msg + " · attach it in the chat with Claude" : "Report not saved");
      } catch (e) { noteMsg("Couldn't build the report (" + (e && e.message || e) + ")", true); }
      finally { btn.disabled = false; }
    }
    const rSheet = document.getElementById("reportSheet"), rNote = document.getElementById("reportNote");
    document.getElementById("reportBtn").addEventListener("click", () => { start(); capInit(); rSheet.hidden = false; setTimeout(() => { try { rNote.focus(); } catch (e) {} }, 50); });
    document.getElementById("reportCancel").addEventListener("click", () => { rSheet.hidden = true; });
    { const ph0 = rNote.placeholder;
      window.__nbReport = { grab: sec => capGrab(sec), open(secs, hint) {
        start(); capInit(); PRE = null;
        try { if (ctx && CAP.node) PRE = { at: Date.now(), secs: secs || 30, p: capGrab(secs || 30).catch(() => null) }; } catch (e) {}
        rNote.placeholder = hint || ph0; rSheet.hidden = false; setTimeout(() => { try { rNote.focus(); } catch (e) {} }, 50);
      } };
      document.getElementById("reportCancel").addEventListener("click", () => { PRE = null; rNote.placeholder = ph0; }); }
    document.getElementById("reportGo").addEventListener("click", () => { rSheet.hidden = true; REPORT_NOTE = rNote.value.trim(); add("note", REPORT_NOTE); capInit().then(makeReport, makeReport); rNote.value = ""; });
  }
  // ---------- one place decides how a sound's effects chain is wired ----------
  // full: the chain's dry, echo and hall send go out. lean: none of its effects are in use, so the sound goes
  // straight out and the chain (drive, the wobble oscillators, the echo loop) is left unconnected: the audio
  // engine skips nodes that nothing listens to. parked: quiet for a while, nothing connected at all.
  function fxcEdges(c, w) {
    if (w.parked) return [];
    if (w.lean) return [[c.core, w.to]];
    return [[c.dry, w.to], [c.echoOut, w.to], [c.verbSend, fx.verbIn]];
  }
  function fxcWire(c, patch) {
    if (!c) return;
    const was = c.w || { parked: false, lean: false, to: fx.master }, now = Object.assign({}, was, patch);
    if (!now.to) now.to = fx.master;
    const A = fxcEdges(c, was), N = fxcEdges(c, now), same = (x, y) => x[0] === y[0] && x[1] === y[1];
    A.forEach(e => { if (!N.some(n => same(n, e))) { try { e[0].disconnect(e[1]); } catch (er) {} } });
    N.forEach(e => { if (!A.some(o => same(o, e))) { try { e[0].connect(e[1]); } catch (er) {} } });
    c.w = now; c.parked = now.parked; c.outTo = now.to;
  }
  // a chain is lean when nothing it does would be heard
  function fxcLean(id) {
    const a = fxcAmt(id), f = state.fx;
    return !(a > 0.001 && ((f.drive || 0) > 0.001 || (f.wobble || 0) > 0.001 || (f.echo || 0) > 0.001 || (f.space || 0) > 0.001));
  }
  // ---------- resource diet: nothing processes unless it can be heard ----------
  {
    // 1. FX Lab stages: "off" used to mean volume 0 while still processing every sample. Now an off stage is unplugged
    //    once its tail has died away, and plugged back in the moment it's switched on.
    const unplugT = {};
    function plug(key, on, conn, cut, tail) {
      clearTimeout(unplugT[key]);
      const st = (plug.st = plug.st || {});
      if (on) { if (st[key] !== "on") { try { conn(); } catch (e) {} st[key] = "on"; } }
      else if (st[key] !== "off") unplugT[key] = setTimeout(() => { try { cut(); } catch (e) {} st[key] = "off"; }, tail * 1000);
    }
    function dietLab() {
      if (!ctx || !B) return;
      const on = betaOn && state.fx.on !== false;   // FX: Off silences the Lab stages, so they needn't process either
      if (B !== dietLab.B) { dietLab.B = B; plug.st = { dens: "on", lofi: "on", hall: "on" }; }   // a rebuilt chain starts fully wired
      plug("dens", on && bfx.densOn && bfx.dens > 0.01, () => B.densShaper.connect(B.densWet), () => B.densShaper.disconnect(B.densWet), 0.2);
      plug("lofi", on && bfx.lofiOn, () => B.bitShaper.connect(B.lofiTone), () => B.bitShaper.disconnect(B.lofiTone), 0.2);
      plug("hall", on && bfx.hallOn, () => B.hall.connect(B.hallWet), () => B.hall.disconnect(B.hallWet), 8);
      if (typeof BM !== "undefined" && BM) {
        if (BM !== dietLab.BM) { dietLab.BM = BM; plug.st.shim = "on"; plug.st.frz = "on"; }
        plug("shim", on && bfx.shimOn, () => BM.shimWet.connect(fx.comp), () => BM.shimWet.disconnect(fx.comp), 10);
        plug("frz", on && bfx.frzOn, () => BM.frzWet.connect(fx.comp), () => BM.frzWet.disconnect(fx.comp), 4);
      }
    }
    { const ab = applyBfx; applyBfx = function (r) { ab(r); dietLab(); }; }
    { const af = applyFreeze; applyFreeze = function () { const v = af.apply(this, arguments); dietLab(); return v; }; }
    setTimeout(dietLab, 0);

    // 2. per-sound effect chains park after 20 s without a note on that sound (and nothing still sounding)
    const PARK_AFTER = 20;
    const park = c => { if (!c.parked) fxcWire(c, { parked: true }); };
    const unpark = c => { if (c.parked) fxcWire(c, { parked: false }); };
    { const g0 = fxcGet; fxcGet = function (id) { const c = g0(id); if (c) { c.lastUse = ctx.currentTime; if (c.parked) unpark(c); } return c; }; }
    setInterval(() => {
      if (!ctx || document.hidden) return;
      const held = heldVoices.size != null ? heldVoices.size : heldVoices.length;
      const quiet = voices.size === 0 && !held && !padPlaying.some(Boolean) && !playing;
      if (!quiet) return;
      const now = ctx.currentTime;
      for (const id in fxChan) { if (id === "drum" || id === "dj" || id === "rc") continue; const c = fxChan[id]; if (!c.parked && now - (c.lastUse || 0) > PARK_AFTER) park(c); }
    }, 2000);

    // 3. drawing: skip frames nobody can see or that wouldn't change
    const djView = document.getElementById("djView");
    const covered = () => !djView.hidden || !document.getElementById("rcView").hidden || document.body.classList.contains("trk-open") || document.body.classList.contains("live-on") || document.body.classList.contains("setup-on");
    let flat = 0;
    { const d0 = draw; draw = function () {
        if (covered()) { requestAnimationFrame(draw); return; }
        if (analyser && state.engine !== "samp" && state.engine !== "pads") {
          if (!draw.buf) draw.buf = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(draw.buf); let pk = 0; for (let i = 0; i < draw.buf.length; i += 8) { const a = Math.abs(draw.buf[i]); if (a > pk) pk = a; }
          if (pk < 1e-4) { if (++flat > 2) { requestAnimationFrame(draw); return; } } else flat = 0;
        } else flat = 0;
        d0();
      }; }
    if (typeof djFrame === "function") {
      let sig = "", still = 0;
      const f0 = djFrame; djFrame = function (t) {
        const moving = DJ.trans || DJ.decks.some(d => d.playing) || DJ.beat || DJ.padPlay && DJ.padPlay.some(Boolean);
        if (moving) { still = 0; sig = ""; return f0(t); }   // playing: just draw, nothing to compare
        const now = JSON.stringify([DJ.decks.map(d => [d.p0, d.rate, d.bend, !!d.loop, d.cue, d.cues, d.phrase, d.bpm0, d.off]), DJ.xf, DJ.lead, DJ.sync, innerWidth, innerHeight]);
        if (!moving && now === sig && ++still > 3) { DJ.raf = requestAnimationFrame(djFrame); if (djView.hidden) { cancelAnimationFrame(DJ.raf); DJ.raf = 0; } return; }
        if (now !== sig) still = 0; sig = now;
        return f0(t);
      };
    }
  }
  // ---------- FX on the sounds you pick (one set of knobs) + DJ in the master mix ----------
  {
    // a dry path that skips every effect, FX Lab included, at the master volume
    function dryBus() {
      if (!ctx || !fx || !fx.comp) return null;
      if (!fx.dryBus) { fx.dryBus = ctx.createGain(); fx.dryBus.gain.value = fx.master.gain.value; fx.dryBus.connect(fx.comp); }
      return fx.dryBus;
    }
    { const af = applyFx; applyFx = function () { const r = af.apply(this, arguments); try { const d = dryBus(); if (d) d.gain.setTargetAtTime(state.fx.volume * state.fx.volume * 0.9, ctx.currentTime, 0.03); } catch (e) {} return r; }; }
    { const bc = buildChain; buildChain = function () { fx.dryBus = null; const r = bc.apply(this, arguments); return r; }; }
    // route each sound's chain: picked → effects and FX Lab; not picked → straight out
    function routeChain(id) {
      const c = fxChan[id]; if (!c) return;
      fxcWire(c, { to: fxcOn(id) ? fx.master : (dryBus() || fx.master), lean: fxcLean(id) });
    }
    { const fa = fxcApply; fxcApply = function (id) { fa(id); routeChain(id); }; }
    const DEFAULT_ON = id => !["drum", "samp", "pads", "inst", "dj"].includes(id);
    // everyone moves to the new model once: one set of knobs, synths picked, everything else clean
    try {
      if (!(FXC.v >= 3)) {
        const ids = new Set(["drum", "samp", "pads", "inst", "dj"].concat(Object.keys(ENGINES), typeof NEW_ENGINES !== "undefined" ? Object.keys(NEW_ENGINES) : []));
        ids.forEach(id => { fxcParams(id).on = DEFAULT_ON(id); });
        FXC.mode = "global"; FXC.v = 3; localStorage.setItem("nightbloom-fxby", JSON.stringify(FXC));
      }
    } catch (e) {}
    FXC.mode = "global";
    // the DJ decks can go through the effects too (off by default)
    function routeDj() {
      if (!DJ.bus || !ctx) return;
      const on = fxcOn("dj"), to = on ? (fxcGet("dj") || {}).input : fx.comp;
      if (!to || DJ.busTo === to) return;
      try { DJ.bus.disconnect(); } catch (e) {} DJ.bus.connect(to); DJ.busTo = to;
    }
    // the panel: knobs edit the one set; the row below says which sounds use them
    const pick = document.getElementById("fxPick");
    const pickIds = () => {
      const tabs = [...document.querySelectorAll(".tab[data-engine]")].map(t => t.dataset.engine).filter(id => ENGINES[id] || (typeof NEW_ENGINES !== "undefined" && NEW_ENGINES[id]));
      return [...new Set(tabs)].concat(["drum", "samp", "pads", "inst", "rc", "dj"]);
    };
    const pickName = id => id === "dj" ? "DJ" : id === "inst" ? "Lib & Inst" : fxcName(id);
    function paintPick() {
      pick.innerHTML = '<span class="lab2">Apply to</span>';
      pickIds().forEach(id => {
        const b = document.createElement("button"); b.className = "btn"; b.textContent = pickName(id);
        const on = !!(FXC.by[id] && FXC.by[id].on !== false); b.setAttribute("aria-pressed", String(on));
        b.title = on ? pickName(id) + " goes through the effects · tap to play it clean" : pickName(id) + " plays clean · tap to send it through the effects";
        b.addEventListener("click", () => {
          start(); const p = fxcParams(id); p.on = !on; fxcSave();
          if (ctx) { if (id === "dj") routeDj(); else { fxcGet(id); applyFx(); } }
          paintPick(); fxcPaint2();
        });
        pick.appendChild(b);
      });
    }
    function fxcPaint2() {
      const n = pickIds().filter(id => FXC.by[id] && FXC.by[id].on !== false).length;
      if (fxRowLabel) fxRowLabel.textContent = "Effects · on " + n + (n === 1 ? " sound" : " sounds");
      const on = state.fx.on !== false; fxOnBtn.setAttribute("aria-pressed", String(on)); fxOnBtn.textContent = on ? "FX: On" : "FX: Off";
      fxOnBtn.title = "Switch every effect off or on (the ` key)"; appRoot.classList.toggle("fxoff", !on);
    }
    { const pf = paintFxState; paintFxState = function () { pf(); fxcPaint2(); }; }
    { const re = renderEngine; renderEngine = function () { re(); fxcPaint2(); }; }
    { const db = djBuild; djBuild = function () { const had = !!DJ.bus; const r = db(); if (DJ.bus && !had) { DJ.bus.gain.value = DJ.busVol; routeDj(); } return r; }; }
    document.getElementById("pFx").addEventListener("click", () => setTimeout(paintPick, 0));

    // ---- DJ in the Mix sheet ----
    DJ.busVol = 0.85; try { const v = parseFloat(localStorage.getItem("nightbloom-djvol")); if (v >= 0 && v <= 1.5) DJ.busVol = v; } catch (e) {}
    const om = mixChannels;
    mixChannels = function () {
      const ch = om(), at = ch.findIndex(c => c.group !== "Master"), add = [];
      const mk = (name, sub, get, set, dflt) => add.push({ group: "DJ", name, sub, get, set, dflt, live: true });
      mk("DJ (both decks)", "the songs on the decks", () => DJ.busVol, v => { DJ.busVol = v; if (DJ.bus) DJ.bus.gain.setTargetAtTime(v, ctx.currentTime, 0.03); try { localStorage.setItem("nightbloom-djvol", String(v)); } catch (e) {} }, 0.85);
      DJ.decks.forEach(d => mk("Deck " + "AB"[d.i], d.name ? d.name.slice(0, 26) : "empty", () => d.eq.vol, v => { d.eq.vol = v; djApplyEq(d); try { djPaintDeck(d); } catch (e) {} }, 0.9));
      add.forEach(c => { if (c.name.startsWith("Deck ")) c.law = 2; });
      ch.splice(at < 0 ? ch.length : at, 0, ...add);
      return ch;
    };
    setTimeout(() => { paintPick(); fxcPaint2(); refreshFxKnobs(); }, 0);
  }
  // ---------- vocal separation was removed: free what it left on this device (once) ----------
  setTimeout(async () => {
    try { if (localStorage.getItem("nightbloom-sepgone")) return; } catch (e) { return; }
    try { ["nightbloom-ai-nogpu", "nightbloom-vxai", "nightbloom-ort", "nightbloom-model", "nightbloom-model-remote"].forEach(k => localStorage.removeItem(k)); } catch (e) {}
    try {
      if (window.caches) {
        await caches.delete("nate-bloom-models");   // the 67 MB model
        for (const name of await caches.keys()) { const c = await caches.open(name); for (const req of await c.keys()) if (req.url.includes("onnxruntime-web")) await c.delete(req); }
      }
    } catch (e) {}
    try { const db = await idb(); await new Promise(res => { const tx = db.transaction("samples", "readwrite"); tx.objectStore("samples").delete(IDBKeyRange.bound("stems:", "stems:￿")); tx.oncomplete = tx.onerror = tx.onabort = () => res(); }); } catch (e) {}
    try { localStorage.setItem("nightbloom-sepgone", "1"); } catch (e) {}
  }, 8000);
  // ---------- one frame clock for every drawing loop, capped at 30 frames a second ----------
  // The tablet's screen runs at 90 Hz and some iPhones at 120: drawing the scope, the decks and the meters at that
  // rate costs 3-4x what anyone can see. Every requestAnimationFrame joins one queue that runs at most every 33 ms.
  (() => {
    const raf0 = window.requestAnimationFrame.bind(window);
    let q = new Map(), seq = 0, pending = 0, last = -1e9;
    const MIN = 1000 / 30 - 3;
    function pump(t) {
      pending = 0;
      if (t - last < MIN) { pending = raf0(pump); return; }
      last = t; const run = q; q = new Map();
      run.forEach(cb => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }, 0); } });
      if (q.size && !pending) pending = raf0(pump);
    }
    window.requestAnimationFrame = cb => { const id = ++seq; q.set(id, cb); if (!pending) pending = raf0(pump); return id; };
    window.cancelAnimationFrame = id => { q.delete(id); };
  })();
  // ---------- Motion stage: out of the master path while no LFO runs and the XY pad rests ----------
  {
    const neutral = () => {
      if (betaOn && mo.lfo.some(L => L.on)) return false;
      const moved = (target, v) => target === "filter" ? v < 0.985 : target === "pan" ? Math.abs(v - 0.5) > 0.01 : false;
      return !(betaOn && (moved(mo.xyX, mo.x) || moved(mo.xyY, mo.y)));
    };
    function moSync(force) {
      if (!BM || !B || !fx || !fx.master) return;
      const by = !force && neutral();
      if (by === !!BM.bypass) return;
      if (by) { try { fx.master.disconnect(BM.modFilter); } catch (e) {} fx.master.connect(B.densIn); }
      else { try { fx.master.disconnect(B.densIn); } catch (e) {} fx.master.connect(BM.modFilter); }
      BM.bypass = by;
    }
    const ma0 = motionApply;
    motionApply = function () {
      const r = ma0.apply(this, arguments);
      moSync();
      const xa = xyApply; xyApply = (dx, dy) => { moSync(true); xa(dx, dy); clearTimeout(moSync.t); moSync.t = setTimeout(() => moSync(), 400); };
      return r;
    };
    setTimeout(() => { try { motionApply(); } catch (e) {} }, 0);
  }
  // ---------- previews (kit browser, editor, takes) play clean; the old global chain's effects stop running ----------
  {
    const bc = buildChain;
    buildChain = function () {
      const r = bc.apply(this, arguments);
      try { fx.dry.disconnect(fx.master); } catch (e) {} try { fx.echoOut.disconnect(fx.master); } catch (e) {}
      try { if (fx.verbSend) fx.verbSend.disconnect(fx.verbIn); } catch (e) {}
      try { fx.input.disconnect(fx.driveIn); } catch (e) {}
      fx.input.connect(fx.master);
      return r;
    };
  }
