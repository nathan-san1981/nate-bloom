  // ======================================================================
  // BETA · Batch 1: Motion (LFOs, drift, XY pad), Freeze + Shimmer,
  // Projects (save/load/export whole sessions), My sounds (user presets)
  // ======================================================================
  let BM = null;   // motion / freeze / shimmer nodes, rebuilt with the effects chain

  // ---------- octave-up pitch shifter (two crossfaded sweeping delays) ----------
  function octaveUp(w = 0.08) {
    const N = 32, sawA = { re: new Float32Array(N + 1), im: new Float32Array(N + 1) }, sawB = { re: new Float32Array(N + 1), im: new Float32Array(N + 1) };
    for (let n = 1; n <= N; n++) { const c = -2 / (Math.PI * n); sawA.im[n] = c; sawB.im[n] = c * (n % 2 ? -1 : 1); }
    const winA = { re: new Float32Array([0, -0.5]), im: new Float32Array(2) }, winB = { re: new Float32Array([0, 0.5]), im: new Float32Array(2) };
    const pw = o => ctx.createPeriodicWave(o.re, o.im, { disableNormalization: true });
    const input = ctx.createGain(), output = ctx.createGain(), nodes = [], t0 = ctx.currentTime + 0.05;
    [[sawA, winA], [sawB, winB]].forEach(([saw, win]) => {
      const d = ctx.createDelay(0.5); d.delayTime.value = w / 2;
      const so = ctx.createOscillator(); so.setPeriodicWave(pw(saw)); so.frequency.value = 1 / w;
      const sg = ctx.createGain(); sg.gain.value = -w / 2; so.connect(sg).connect(d.delayTime);
      const g = ctx.createGain(); g.gain.value = 0.5;
      const wo = ctx.createOscillator(); wo.setPeriodicWave(pw(win)); wo.frequency.value = 1 / w; wo.connect(g.gain);
      input.connect(d).connect(g).connect(output);
      so.start(t0); wo.start(t0); nodes.push(d, so, sg, g, wo);
    });
    return { input, output, nodes };
  }
  let shimIR = null;
  // reverb impulse scaled to unity energy, so the feedback amount means what it says
  function normIR(buf) {
    let e = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; e = Math.max(e, s); }
    const k = e > 0 ? 1 / Math.sqrt(e) : 1;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
    return buf;
  }
  const softClipCurve = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.5) / Math.tanh(1.5); } return c; })();
  {
    const ob = buildChain;
    buildChain = function () {
      ob();
      if (!B) return;
      const m = fx.master;
      // motion stage between the master and the beta effects
      try { m.disconnect(B.densIn); } catch (e) {}
      const modFilter = ctx.createBiquadFilter(); modFilter.type = "lowpass"; modFilter.frequency.value = 20000; modFilter.Q.value = 0.7;
      const modPan = ctx.createStereoPanner(), modAmp = ctx.createGain();
      m.connect(modFilter).connect(modPan).connect(modAmp).connect(B.densIn);
      // freeze: four cross-coupled delays that keep recirculating once frozen
      const frzIn = ctx.createGain(), frzWet = ctx.createGain(), frzSum = ctx.createGain(); frzWet.gain.value = 0; frzSum.gain.value = 0;
      const lens = [0.913, 1.271, 1.597, 1.973], dl = [], fbs = [], lps = [];
      B.betaOut.connect(frzIn);
      lens.forEach((L, i) => {
        const d = ctx.createDelay(3); d.delayTime.value = L;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + i * 0.031; const lg = ctx.createGain(); lg.gain.value = 0.0035; lfo.connect(lg).connect(d.delayTime); lfo.start();
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6000;
        const fb = ctx.createGain(); fb.gain.value = 0;
        frzIn.connect(d); d.connect(lp); lp.connect(fb).connect(d); lp.connect(frzSum); frzSum.connect(d);
        lp.connect(frzWet);
        dl.push(d); fbs.push(fb); lps.push(lp);
      });
      frzWet.connect(fx.comp);
      // shimmer: send -> octave up -> reverb -> back into the octave shifter (each pass climbs an octave)
      const shimSend = ctx.createGain(); shimSend.gain.value = 0;
      const ps = octaveUp(), shimVerb = ctx.createConvolver(), shimFb = ctx.createGain(), shimWet = ctx.createGain();
      shimFb.gain.value = 0; shimWet.gain.value = 0;
      if (!shimIR) shimIR = normIR(hallIR(ctx.sampleRate, { hdecay: 0.6, hsize: 0.7, hdamp: 0.45, hwidth: 1, irMax: window.__nbMobile ? 4 : 0 }));
      shimVerb.buffer = shimIR;
      const shimHP = ctx.createBiquadFilter(); shimHP.type = "highpass"; shimHP.frequency.value = 300;
      B.betaOut.connect(shimSend).connect(ps.input); ps.output.connect(shimHP).connect(shimVerb);
      const shimLP = ctx.createBiquadFilter(); shimLP.type = "lowpass"; shimLP.frequency.value = 6000;
      const shimClip = ctx.createWaveShaper(); shimClip.curve = softClipCurve; shimClip.oversample = window.__nbMobile ? "none" : "2x";
      shimVerb.connect(shimWet).connect(fx.comp); shimVerb.connect(shimFb).connect(shimLP).connect(shimClip).connect(ps.input);
      BM = { modFilter, modPan, modAmp, frzIn, frzWet, frzSum, fbs, lps, shimSend, shimFb, shimWet };
      applyFreeze(); motionApply();
    };
  }
  bfx.frzOn = false;   // never come back frozen on a silent buffer
  function applyFreeze() {
    if (!BM) return;
    const now = ctx.currentTime, on = betaOn;
    const frozen = on && bfx.frzOn, g = frozen ? 0.997 : 0;
    // Householder feedback (I − ½·ones): energy-preserving, so the frozen sound sustains
    BM.fbs.forEach(f => f.gain.setTargetAtTime(g, now, 0.02));
    BM.frzSum.gain.setTargetAtTime(frozen ? -0.5 * g : 0, now, 0.02);
    BM.frzIn.gain.setTargetAtTime(frozen ? 0 : 1, now + (frozen ? 0.03 : 0), 0.02);
    BM.frzWet.gain.setTargetAtTime(frozen ? 0.35 + (bfx.frzMix ?? 0.7) * 0.9 : 0, now, frozen ? 0.05 : 0.6);
    BM.lps.forEach(l => l.frequency.setTargetAtTime(800 + Math.pow(bfx.frzTone ?? 0.6, 2) * 12000, now, 0.05));
    const sOn = on && bfx.shimOn;
    BM.shimSend.gain.setTargetAtTime(sOn ? 0.15 + (bfx.shim ?? 0.4) * 0.6 : 0, now, 0.05);
    BM.shimWet.gain.setTargetAtTime(sOn ? 0.3 + (bfx.shim ?? 0.4) * 0.9 : 0, now, 0.05);
    BM.shimFb.gain.setTargetAtTime(sOn ? (bfx.shimFb ?? 0.5) * 0.45 : 0, now, 0.05);
  }

  // ---------- Motion: two LFOs plus an XY pad ----------
  const MO_TARGETS = [["filter", "Filter"], ["pan", "Pan"], ["volume", "Volume"], ["space", "Space"], ["echo", "Echo"], ["wobble", "Wobble"], ["shimmer", "Shimmer"]];
  const MO_SHAPES = [["sine", "Sine"], ["triangle", "Triangle"], ["square", "Square"], ["sawtooth", "Ramp"], ["drift", "Drift"]];
  const moDef = () => ({ lfo: [{ on: false, target: "filter", shape: "sine", rate: 0.3, depth: 0.5 }, { on: false, target: "pan", shape: "drift", rate: 0.25, depth: 0.5 }], xyX: "filter", xyY: "space", x: 1, y: 0.5 });
  const mo = moDef();
  try { const s = JSON.parse(localStorage.getItem("nightbloom-motion") || "null"); if (s && Array.isArray(s.lfo)) Object.assign(mo, s); } catch (e) {}
  const saveMo = () => { try { localStorage.setItem("nightbloom-motion", JSON.stringify(mo)); } catch (e) {} };
  const rateHz = r => 0.01 * Math.pow(800, r);    // 0.01 Hz (100 s) … 8 Hz
  let moNodes = [], moTimers = [], xyApply = () => {};
  function moParam(target) {
    if (!BM) return null;
    return { filter: [BM.modFilter.detune, 3600], pan: [BM.modPan.pan, 1], volume: [BM.modAmp.gain, 0.45], space: [fx.verbOut.gain, 1.2], echo: [fx.echoOut.gain, 0.6], wobble: [fx.wowDepth.gain, 0.004], shimmer: [BM.shimWet.gain, 0.8] }[target] || null;
  }
  function motionApply() {
    moNodes.forEach(n => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); moNodes = [];
    moTimers.forEach(clearInterval); moTimers = [];
    if (!BM || !ctx) return;
    const now = ctx.currentTime;
    // resting filter / pan come from the XY pad (the other XY targets change only when the pad is touched)
    const xyRest = (target, v) => {
      if (target === "filter") BM.modFilter.frequency.setTargetAtTime(120 * Math.pow(2, v * 7.4), now, 0.03);
      else if (target === "pan") BM.modPan.pan.setTargetAtTime(v * 2 - 1, now, 0.03);
    };
    const xyVal = (target, v) => {
      if (target === "filter") BM.modFilter.frequency.setTargetAtTime(120 * Math.pow(2, v * 7.4), now, 0.03);
      else if (target === "pan") BM.modPan.pan.setTargetAtTime(v * 2 - 1, now, 0.03);
      else if (target === "space") { state.fx.space = v; applyFx(); }
      else if (target === "echo") { state.fx.echo = v; applyFx(); }
      else if (target === "wobble") { state.fx.wobble = v; applyFx(); }
      else if (target === "shimmer") { bfx.shim = v; if (v > 0.02 && !bfx.shimOn) bfx.shimOn = true; applyFreeze(); }
    };
    BM.modFilter.frequency.setTargetAtTime(20000, now, 0.03); BM.modPan.pan.setTargetAtTime(0, now, 0.03);
    if (betaOn) { xyRest(mo.xyX, mo.x); xyRest(mo.xyY, mo.y); }
    xyApply = (dx, dy) => { if (!betaOn) return; if (dx) xyVal(mo.xyX, mo.x); if (dy) xyVal(mo.xyY, mo.y); };
    let volDip = 0;
    if (betaOn) mo.lfo.forEach(L => {
      if (!L.on) return;
      const tp = moParam(L.target); if (!tp) return;
      const [param, scale] = tp, depth = L.depth * scale;
      const g = ctx.createGain(); g.gain.value = depth; g.connect(param); moNodes.push(g);
      if (L.target === "volume") volDip = Math.max(volDip, depth);
      if (L.shape === "drift") {
        const cs = ctx.createConstantSource(); cs.offset.value = 0; cs.connect(g); cs.start(); moNodes.push(cs);
        const period = 1 / rateHz(L.rate);
        const step = () => cs.offset.setTargetAtTime(Math.random() * 2 - 1, ctx.currentTime, period / 3);
        step(); moTimers.push(setInterval(step, Math.max(60, period * 1000)));
      } else {
        const o = ctx.createOscillator(); o.type = L.shape; o.frequency.value = rateHz(L.rate); o.connect(g); o.start(); moNodes.push(o);
      }
    });
    BM.modAmp.gain.setTargetAtTime(1 - volDip, now, 0.05);
  }
  const moEl = document.getElementById("motion"), moList = document.getElementById("moList");
  const xyPad = document.getElementById("xyPad"), xyDot = document.getElementById("xyDot");
  const fill = (sel, opts, v) => { sel.innerHTML = ""; opts.forEach(([k, l]) => { const o = document.createElement("option"); o.value = k; o.textContent = l; sel.appendChild(o); }); sel.value = v; };
  function renderMotion() {
    moList.innerHTML = "";
    mo.lfo.forEach((L, i) => {
      const card = document.createElement("div"); card.className = "mo-card";
      card.innerHTML = `<div class="lab-head"><div><b>LFO ${i + 1}</b><small></small></div><button class="btn" aria-pressed="${L.on}">${L.on ? "On" : "Off"}</button></div>
        <div class="mo-row"><label>Moves <select class="mo-t"></select></label><label>Shape <select class="mo-s"></select></label></div>
        <div class="mx-row"><div class="mx-lab"><b>Speed</b></div><input type="range" class="mo-r" min="0" max="100"><span class="mx-val mo-rv"></span></div>
        <div class="mx-row"><div class="mx-lab"><b>Depth</b></div><input type="range" class="mo-d" min="0" max="100"><span class="mx-val mo-dv"></span></div>`;
      const rv = card.querySelector(".mo-rv"), dv = card.querySelector(".mo-dv"), r = card.querySelector(".mo-r"), d = card.querySelector(".mo-d");
      const fmtRate = () => { const hz = rateHz(L.rate); rv.textContent = hz < 1 ? (1 / hz).toFixed(hz < 0.1 ? 0 : 1) + "s" : hz.toFixed(1) + "Hz"; };
      card.querySelector("small").textContent = L.shape === "drift" ? "slow random wandering" : "repeating wave";
      fill(card.querySelector(".mo-t"), MO_TARGETS, L.target); fill(card.querySelector(".mo-s"), MO_SHAPES, L.shape);
      r.value = Math.round(L.rate * 100); d.value = Math.round(L.depth * 100); fmtRate(); dv.textContent = d.value;
      card.querySelector(".lab-head .btn").addEventListener("click", () => { start(); L.on = !L.on; saveMo(); motionApply(); renderMotion(); });
      card.querySelector(".mo-t").addEventListener("change", e => { L.target = e.target.value; saveMo(); motionApply(); });
      card.querySelector(".mo-s").addEventListener("change", e => { L.shape = e.target.value; saveMo(); motionApply(); renderMotion(); });
      r.addEventListener("input", () => { L.rate = r.value / 100; fmtRate(); saveMo(); });
      r.addEventListener("change", motionApply);
      d.addEventListener("input", () => { L.depth = d.value / 100; dv.textContent = d.value; saveMo(); motionApply(); });
      moList.appendChild(card);
    });
    fill(document.getElementById("xyX"), MO_TARGETS.filter(t => t[0] !== "volume"), mo.xyX);
    fill(document.getElementById("xyY"), MO_TARGETS.filter(t => t[0] !== "volume"), mo.xyY);
    paintXY();
  }
  function paintXY() { xyDot.style.left = mo.x * 100 + "%"; xyDot.style.top = (1 - mo.y) * 100 + "%"; }
  document.getElementById("xyX").addEventListener("change", e => { mo.xyX = e.target.value; saveMo(); motionApply(); });
  document.getElementById("xyY").addEventListener("change", e => { mo.xyY = e.target.value; saveMo(); motionApply(); });
  {
    let on = false;
    const setXY = e => { const r = xyPad.getBoundingClientRect(); mo.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); mo.y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); paintXY(); xyApply(true, true); };
    xyPad.addEventListener("pointerdown", e => { start(); on = true; xyPad.setPointerCapture(e.pointerId); setXY(e); });
    xyPad.addEventListener("pointermove", e => { if (on) setXY(e); });
    const end = () => { if (on) { on = false; saveMo(); } };
    xyPad.addEventListener("pointerup", end); xyPad.addEventListener("pointercancel", end);
  }
  document.getElementById("moBtn").addEventListener("click", () => { start(); moEl.hidden = false; renderMotion(); });
  document.getElementById("moDone").addEventListener("click", () => { moEl.hidden = true; });
  document.getElementById("moReset").addEventListener("click", () => { Object.assign(mo, moDef()); saveMo(); state.fx.space = 0.55; applyFx(); motionApply(); renderMotion(); });
  onBeta(() => { motionApply(); applyFreeze(); });

  // ---------- small file helpers ----------
  async function saveFileOut(name, ext, u8, mime) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name + ".zip", data: zipOne(name + "." + ext, u8) }); return "Saved " + name + ".zip"; }
      catch (e) { if (e && e.code === "declined") return ""; return e && e.code === "too_large" ? "Too large to save here; use the hosted version." : "Couldn't save here. Try again."; }
    }
    const file = new File([u8], name + "." + ext, { type: mime || "application/octet-stream" });
    try { if (nbShareFiles(file)) { await navigator.share({ files: [file], title: name }); return "Shared " + file.name; } } catch (e) { if (e && e.name === "AbortError") return ""; }
    const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return "Saved " + file.name;
  }
  const stamp = () => { const d = new Date(), p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  // ---------- Projects ----------
  const KEEP_KEYS = ["nightbloom-ui", "nightbloom-beta", "nightbloom-favorites"];   // (200) favorites stay across projects, like My sounds
  const prEl = document.getElementById("projects"), prList = document.getElementById("prList"), prInfo = document.getElementById("prInfo"), prName = document.getElementById("prName");
  async function storeAll(name) {
    const db = await idb();
    return Promise.all([name].map(st => new Promise(res => {
      const t = db.transaction(st).objectStore(st), out = [];
      const rk = t.getAllKeys(), rv = t.getAll();
      rv.onsuccess = () => { rk.result.forEach((k, i) => out.push([k, rv.result[i]])); res(out); };
      rv.onerror = () => res([]);
    }))).then(a => a[0]);
  }
  async function snapshotProject(name) {
    save(); trkSave && trkSave();
    await new Promise(r => setTimeout(r, 450));   // let the debounced save land
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("nightbloom") && !KEEP_KEYS.includes(k) && k !== "nightbloom-mysounds") ls[k] = localStorage.getItem(k); }
    return { v: 1, name, date: stamp(), ls, samples: await storeAll("samples"), tracks: await storeAll("tracks") };
  }
  async function projDB(mode) { const db = await idb(); return db.transaction("projects", mode).objectStore("projects"); }
  async function listProjects() {
    try {
      const st = await projDB("readonly");
      return await new Promise(res => { const rk = st.getAllKeys(), rv = st.getAll(); rv.onsuccess = () => res(rv.result.map((p, i) => ({ key: rk.result[i], name: p.name, date: p.date, size: p.size || 0 }))); rv.onerror = () => res([]); });
    } catch (e) { return []; }
  }
  const sizeOf = p => { let n = 0; const walk = v => { if (!v) return; if (v instanceof ArrayBuffer) n += v.byteLength; else if (ArrayBuffer.isView(v)) n += v.byteLength; else if (typeof v === "string") n += v.length; else if (typeof v === "object") for (const k in v) walk(v[k]); }; walk(p); return n; };
  async function saveProject() {
    const name = (prName.value || "").trim() || "Project " + stamp();
    prInfo.textContent = "Saving…";
    try {
      const p = await snapshotProject(name); p.size = sizeOf(p);
      const st = await projDB("readwrite");
      await new Promise((res, rej) => { const r = st.put(p, "p" + Date.now()); r.onsuccess = res; r.onerror = () => rej(r.error); });
      prName.value = ""; prInfo.textContent = "Saved \"" + name + "\""; renderProjects();
    } catch (e) { prInfo.textContent = "Couldn't save: " + (e && e.message ? e.message : "storage is full?"); }
  }
  async function loadProjectData(p) {
    const db = await idb();
    for (const st of ["samples", "tracks"]) {
      await new Promise(res => { const t = db.transaction(st, "readwrite"), s = t.objectStore(st); s.clear(); (p[st] || []).forEach(([k, v]) => s.put(v, k)); t.oncomplete = res; t.onerror = res; });
    }
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("nightbloom") && !KEEP_KEYS.includes(k) && k !== "nightbloom-mysounds") drop.push(k); }
    drop.forEach(k => localStorage.removeItem(k));
    Object.entries(p.ls || {}).forEach(([k, v]) => localStorage.setItem(k, v));
    prInfo.textContent = "Loading \"" + p.name + "\"…";
    setTimeout(() => location.reload(), 150);
  }
  // project file: "NBPROJ01" + json length + json + binary chunks (audio stays exact)
  function packProject(p) {
    const bins = [];
    const json = JSON.stringify(p, (k, v) => {
      if (v instanceof ArrayBuffer) { bins.push(new Uint8Array(v)); return { $b: bins.length - 1, t: "AB" }; }
      if (ArrayBuffer.isView(v)) { bins.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); return { $b: bins.length - 1, t: v.constructor.name }; }
      return v;
    });
    const j = new TextEncoder().encode(json), total = 12 + j.length + bins.reduce((a, b) => a + 4 + b.length, 0);
    const out = new Uint8Array(total), dv = new DataView(out.buffer);
    out.set(new TextEncoder().encode("NBPROJ01"), 0); dv.setUint32(8, j.length, true); out.set(j, 12);
    let o = 12 + j.length; bins.forEach(b => { dv.setUint32(o, b.length, true); out.set(b, o + 4); o += 4 + b.length; });
    return out;
  }
  function unpackProject(u8) {
    if (new TextDecoder().decode(u8.subarray(0, 8)) !== "NBPROJ01") throw new Error("That isn't a Nate Bloom project file.");
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), jl = dv.getUint32(8, true);
    const bins = []; let o = 12 + jl;
    while (o + 4 <= u8.length) { const n = dv.getUint32(o, true); bins.push(u8.slice(o + 4, o + 4 + n)); o += 4 + n; }
    const T = { AB: b => b.buffer, Int16Array: b => new Int16Array(b.buffer), Float32Array: b => new Float32Array(b.buffer), Uint8Array: b => b };
    return JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + jl)), (k, v) => (v && typeof v === "object" && "$b" in v ? (T[v.t] || T.Uint8Array)(bins[v.$b]) : v));
  }
  async function renderProjects() {
    const items = await listProjects();
    prList.innerHTML = "";
    if (!items.length) { const e = document.createElement("div"); e.className = "pr-empty"; e.textContent = "No saved projects yet."; prList.appendChild(e); }
    items.sort((a, b) => (a.key < b.key ? 1 : -1)).forEach(it => {
      const row = document.createElement("div"); row.className = "pr-row";
      row.innerHTML = `<div class="mx-lab"><b></b><small></small></div><button class="btn pl">Load</button><button class="btn px" aria-label="Export">⇪</button><button class="btn pd" aria-label="Delete">✕</button>`;
      row.querySelector("b").textContent = it.name; row.querySelector("small").textContent = it.date + " · " + (it.size / 1048576).toFixed(1) + " MB";
      row.querySelector(".pl").addEventListener("click", async () => { const st = await projDB("readonly"); const r = st.get(it.key); r.onsuccess = () => r.result && loadProjectData(r.result); });
      row.querySelector(".px").addEventListener("click", async () => {
        prInfo.textContent = "Packing…";
        const st = await projDB("readonly"); const r = st.get(it.key);
        r.onsuccess = async () => { const msg = await saveFileOut(it.name.replace(/[^\w\- ]+/g, "").trim() || "nate-bloom-project", "nbproj", packProject(r.result)); prInfo.textContent = msg || ""; };
      });
      let arm = 0; const del = row.querySelector(".pd");
      del.addEventListener("click", async () => {
        if (!arm) { del.textContent = "Sure?"; arm = setTimeout(() => { arm = 0; del.textContent = "✕"; }, 2500); return; }
        const st = await projDB("readwrite"); st.delete(it.key); setTimeout(renderProjects, 100);
      });
      prList.appendChild(row);
    });
  }
  const prFile = document.getElementById("prFile");
  document.getElementById("prImport").addEventListener("click", () => prFile.click());
  prFile.addEventListener("change", async () => {
    const f = prFile.files && prFile.files[0]; prFile.value = ""; if (!f) return;
    try {
      let ab = await f.arrayBuffer();
      if (new Uint8Array(ab, 0, 2)[0] === 0x50) { const z = zipFS(ab), n = z.names.find(x => /\.nbproj$/i.test(x)); if (!n) throw new Error("No project inside that zip."); ab = await z.read(n); }
      const p = unpackProject(new Uint8Array(ab)); p.size = sizeOf(p);
      const st = await projDB("readwrite"); st.put(p, "p" + Date.now());
      prInfo.textContent = "Imported \"" + p.name + "\". Tap Load to open it."; setTimeout(renderProjects, 150);
    } catch (e) { prInfo.textContent = e && e.message ? e.message : "Couldn't read that file."; }
  });
  document.getElementById("prSave").addEventListener("click", saveProject);
  document.getElementById("prBtn").addEventListener("click", () => { prEl.hidden = false; prInfo.textContent = "Saves everything: sounds, beat, melody, samples, pads, tracks and settings."; renderProjects(); });
  document.getElementById("prDone").addEventListener("click", () => { prEl.hidden = true; });

  // ---------- My sounds ----------
  const msEl = document.getElementById("mySounds"), msList = document.getElementById("msList"), msName = document.getElementById("msName"), msInfo = document.getElementById("msInfo");
  let mySounds = [];
  try { const s = JSON.parse(localStorage.getItem("nightbloom-mysounds") || "[]"); if (Array.isArray(s)) mySounds = s; } catch (e) {}
  const saveMs = () => { try { localStorage.setItem("nightbloom-mysounds", JSON.stringify(mySounds)); } catch (e) {} };
  const soundLabel = () => { try { return document.getElementById("sndName").textContent; } catch (e) { return "My sound"; } };
  function captureSound(name) {
    return { name, date: stamp(), engine: state.engine, layers: JSON.parse(JSON.stringify(state.layers)), params: JSON.parse(JSON.stringify(state.params)),
      lib: JSON.parse(JSON.stringify(state.lib)), fmSel, arp: JSON.parse(JSON.stringify(state.arp || {})), chord: chordType };
  }
  let sndQuiet = false;   // (an undo puts a sound back without playing it)
  function applySound(s) {
    start();
    for (const id in s.layers) if (state.layers[id]) Object.assign(state.layers[id], s.layers[id]);
    for (const id in s.params) if (state.params[id]) Object.assign(state.params[id], s.params[id]);
    if (s.engine === "lib" || (s.lib && s.lib.parts && s.lib.parts.length)) {
      state.lib = JSON.parse(JSON.stringify(s.lib)); libInsts.fill(null); libInst = null; libStartup();
    }
    if (typeof s.fmSel === "number") { fmSel = s.fmSel; try { localStorage.setItem("nightbloom-fmsel", fmSel); } catch (e) {} renderFmSel(); }
    if (s.arp) { state.arp = JSON.parse(JSON.stringify(s.arp)); arpClock(); }
    if (s.chord && CHORDS.some(c => c[0] === s.chord)) { chordType = s.chord; chordSel.value = s.chord; try { localStorage.setItem("nightbloom-chord", s.chord); } catch (e) {} }
    state.engine = s.engine === "fm" && !betaOn ? "saw" : s.engine;
    state.cur = null;
    renderEngine(); save();
    if (!sndQuiet) setTimeout(() => { if (ctx) { const t = ctx.currentTime + 0.02; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.7)); } }, state.engine === "lib" ? 900 : 30);
    if (!sndQuiet) msInfo.textContent = "Loaded \"" + s.name + "\"";
  }
  function renderMySounds() {
    msList.innerHTML = "";
    if (!mySounds.length) { const e = document.createElement("div"); e.className = "pr-empty"; e.textContent = "No saved sounds yet. Shape a sound, then save it here."; msList.appendChild(e); }
    mySounds.forEach((s, i) => {
      const row = document.createElement("div"); row.className = "pr-row";
      row.innerHTML = `<div class="mx-lab"><b></b><small></small></div><button class="btn pl">Load</button><button class="btn pd" aria-label="Delete">✕</button>`;
      row.querySelector("b").textContent = s.name;
      const what = ENGINES[s.engine] ? Object.keys(s.layers).filter(k => s.layers[k] && s.layers[k].on).map(k => ENGINES[k] ? ENGINES[k].short : k).join(" + ") : s.engine === "lib" ? (s.lib.parts || []).filter(p => p && p.on).map(p => p.name).join(" + ") || "Library" : s.engine;
      row.querySelector("small").textContent = what + " · " + s.date;
      row.querySelector(".pl").addEventListener("click", () => applySound(s));
      let arm = 0; const del = row.querySelector(".pd");
      del.addEventListener("click", () => { if (!arm) { del.textContent = "Sure?"; arm = setTimeout(() => { arm = 0; del.textContent = "✕"; }, 2500); return; } mySounds.splice(i, 1); saveMs(); renderMySounds(); });
      msList.appendChild(row);
    });
  }
  document.getElementById("msSave").addEventListener("click", () => {
    if (["drum", "pads"].includes(state.engine)) { msInfo.textContent = "Pick a synth, library sound, FM, sampler or instrument first."; return; }
    const name = (msName.value || "").trim() || soundLabel() + " (mine)";
    mySounds.unshift(captureSound(name)); saveMs(); msName.value = ""; msInfo.textContent = "Saved \"" + name + "\""; renderMySounds();
  });
  document.getElementById("msBtn").addEventListener("click", () => { msEl.hidden = false; msInfo.textContent = "Saves the current sound: stacked synths, slider settings, library layers, FM patch, arp and chord."; renderMySounds(); });
  document.getElementById("msDone").addEventListener("click", () => { msEl.hidden = true; });


