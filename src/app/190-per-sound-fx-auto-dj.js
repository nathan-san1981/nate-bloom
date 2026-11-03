  // ---------- Per-sound effects ----------
  // Every sound (each synth engine, the drums, the sampler, the pads, the instruments) gets its own
  // Drive / Wobble / Echo / Space chain with its own on/off and amount, feeding one shared hall and
  // the master. The Effects panel edits the sound whose tab is open. "Global" makes every sound
  // follow the same settings, like before. The FX Lab (beta) and the Mixer's FX switch stay global.
  const FXC = { mode: "sound", by: {} };
  try { const s = JSON.parse(localStorage.getItem("nightbloom-fxby") || "null"); if (s && s.by) { FXC.by = s.by; if (s.mode === "global") FXC.mode = "global"; } } catch (e) {}
  let fxcSaveT = 0; const fxcSave = () => { clearTimeout(fxcSaveT); fxcSaveT = setTimeout(() => { try { localStorage.setItem("nightbloom-fxby", JSON.stringify(FXC)); } catch (e) {} }, 150); };
  const FXC_DRUM = { drive: 0, wobble: 0, echo: 0, space: 0.14, on: true, amount: 1 }, FXC_CLEAN = new Set(["drum", "samp", "pads", "inst"]);
  // older copies gave the sampler, pads and instruments whatever the synth knobs happened to be (often drive and wobble from a preset):
  // once, put them back to clean so recordings play as they were recorded
  try { if (!(FXC.v >= 2)) { for (const id of FXC_CLEAN) if (FXC.by[id]) FXC.by[id] = Object.assign({}, FXC_DRUM); FXC.v = 2; localStorage.setItem("nightbloom-fxby", JSON.stringify(FXC)); } } catch (e) {}
  const fxChan = {};   // sound id -> its chain's nodes (built the first time the sound plays)
  const fxcNames = { drum: "Drums", samp: "Sampler", pads: "Pads", inst: "Instrument" };
  const fxcName = id => ENGINES[id] ? ENGINES[id].short : (typeof NEW_ENGINES !== "undefined" && NEW_ENGINES[id]) ? NEW_ENGINES[id].short : fxcNames[id] || id;
  const fxcCur = () => state.engine;
  let fxcToastT = 0; const fxcToast = msg => { const t = document.getElementById("uiToast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(fxcToastT); fxcToastT = setTimeout(() => { t.hidden = true; }, 2400); };
  function fxcParams(id) {
    if (!FXC.by[id]) FXC.by[id] = FXC_CLEAN.has(id) ? Object.assign({}, FXC_DRUM) : { drive: state.fx.drive, wobble: state.fx.wobble, echo: state.fx.echo, space: state.fx.space, on: true, amount: 1 };
    return FXC.by[id];
  }
  // what the Effects knobs edit: the open sound's chain, or the global settings
  const fxcTarget = () => state.fx;
  // one set of knobs (state.fx); each sound either goes through the effects or bypasses them all
  const fxcOn = id => fxOn() && !!(FXC.by[id] && FXC.by[id].on !== false);
  const fxcAmt = id => !fxcOn(id) ? 0 : fxAmt();
  function fxcBuild() {
    const g = () => ctx.createGain(), c = {};
    c.input = g(); c.core = g(); c.input.connect(c.core); c.driveIn = g(); c.shaper = ctx.createWaveShaper(); c.shaper.oversample = "2x";
    c.wobbleDelay = ctx.createDelay(0.1); c.wobbleDelay.delayTime.value = 0.012;
    c.wow = ctx.createOscillator(); c.wow.frequency.value = 0.6; c.flutter = ctx.createOscillator(); c.flutter.frequency.value = 7.3;
    c.wowDepth = g(); c.flutterDepth = g(); c.wowDepth.gain.value = 0; c.flutterDepth.gain.value = 0;
    c.wow.connect(c.wowDepth).connect(c.wobbleDelay.delayTime); c.flutter.connect(c.flutterDepth).connect(c.wobbleDelay.delayTime); c.wow.start(); c.flutter.start();
    c.tapeTone = ctx.createBiquadFilter(); c.tapeTone.type = "lowpass"; c.tapeTone.frequency.value = 12000;
    c.echoIn = g(); c.dL = ctx.createDelay(2); c.dR = ctx.createDelay(2); c.dL.delayTime.value = 0.375; c.dR.delayTime.value = 0.5; c.fb = g(); c.fb.gain.value = 0.45;
    c.echoTone = ctx.createBiquadFilter(); c.echoTone.type = "lowpass"; c.echoTone.frequency.value = 3200; c.merger = ctx.createChannelMerger(2);
    c.echoIn.connect(c.dL); c.dL.connect(c.echoTone); c.echoTone.connect(c.dR); c.dR.connect(c.fb); c.fb.connect(c.dL); c.dL.connect(c.merger, 0, 0); c.dR.connect(c.merger, 0, 1);
    c.echoOut = g(); c.echoOut.gain.value = 0; c.merger.connect(c.echoOut);
    c.dry = g(); c.verbSend = g(); c.verbSend.gain.value = 0;
    c.core.connect(c.driveIn).connect(c.shaper).connect(c.wobbleDelay).connect(c.tapeTone);
    c.tapeTone.connect(c.dry).connect(fx.master); c.tapeTone.connect(c.echoIn); c.echoOut.connect(fx.master);
    c.tapeTone.connect(c.verbSend); c.echoOut.connect(c.verbSend); c.verbSend.connect(fx.verbIn);
    c.nodes = [c.input, c.core, c.driveIn, c.shaper, c.wobbleDelay, c.wow, c.flutter, c.wowDepth, c.flutterDepth, c.tapeTone, c.echoIn, c.dL, c.dR, c.fb, c.echoTone, c.merger, c.echoOut, c.dry, c.verbSend];
    return c;
  }
  // (wobble at zero: its two oscillators unplugged, so the delay takes its fast path)
  function restIdle(c, drive, wob) {
    if (!c) return;
    const on = wob > 0.001, wd = c.wobbleDelay; if (!wd || c.__wob === on) return; c.__wob = on;
    try { if (on) { c.wowDepth.connect(wd.delayTime); c.flutterDepth.connect(wd.delayTime); } else { c.wowDepth.disconnect(wd.delayTime); c.flutterDepth.disconnect(wd.delayTime); } } catch (e) {}
  }
  function fxcGet(id) {
    if (!ctx || !fx || !fx.master || !fx.verbIn) return null;
    let c = fxChan[id]; if (!c) { c = fxChan[id] = fxcBuild(); fxcApply(id); }
    return c;
  }
  function fxcApply(id) {
    const c = fxChan[id]; if (!c) return;
    const base = state.fx, a = fxcAmt(id), t = ctx.currentTime;
    const p = { drive: base.drive * a, wobble: base.wobble * a, echo: base.echo * a, space: base.space * a };
    try { restIdle(c, p.drive, p.wobble); } catch (e) {}
    c.shaper.curve = driveCurveFx(p.drive); c.shaper.oversample = p.drive > 0.05 ? "2x" : "none";   // (no drive: a gentle curve, no oversampling)
    c.driveIn.gain.setTargetAtTime(1 + p.drive * 1.5, t, 0.02);
    c.wowDepth.gain.setTargetAtTime(p.wobble * 0.0045, t, 0.05); c.flutterDepth.gain.setTargetAtTime(p.wobble * 0.0006, t, 0.05);
    c.tapeTone.frequency.setTargetAtTime(14000 - p.wobble * 9000, t, 0.05);
    c.echoOut.gain.setTargetAtTime(p.echo * 0.8, t, 0.05); c.fb.gain.setTargetAtTime(0.25 + p.echo * 0.4, t, 0.05);
    c.verbSend.gain.setTargetAtTime(p.space * 1.6, t, 0.05); c.dry.gain.setTargetAtTime(1 - p.space * 0.45, t, 0.05);
  }
  // the chain builder: the shared hall takes sends, the drums get a chain of their own, old chains go
  {
    const bc1 = buildChain;
    buildChain = function () {
      bc1();
      for (const id in fxChan) { for (const n of fxChan[id].nodes) { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} } delete fxChan[id]; }
      try { fx.tapeTone.disconnect(fx.verbIn); } catch (e) {} try { fx.echoOut.disconnect(fx.verbIn); } catch (e) {}
      fx.verbSend = ctx.createGain(); fx.tapeTone.connect(fx.verbSend); fx.echoOut.connect(fx.verbSend); fx.verbSend.connect(fx.verbIn); fx.chainNodes.push(fx.verbSend);
      try { fx.drumBus.disconnect(); } catch (e) {}
      const dc = fxcGet("drum"); if (dc) fx.drumBus.connect(dc.input);
      applyFx();
    };
    const af1 = applyFx;
    applyFx = function () {
      af1();
      if (!ctx || !fx || !fx.verbSend) return;
      const t = ctx.currentTime;
      fx.verbSend.gain.setTargetAtTime(state.fx.space * fxAmt() * 1.6, t, 0.05); fx.verbOut.gain.setTargetAtTime(1, t, 0.05);
      for (const id in fxChan) fxcApply(id);
    };
    // Stop empties every sound's echo and hall send too (the global tails are handled by killTails)
    const tailsOff = all => () => {
      if (!ctx) return; const now = ctx.currentTime;
      for (const id in fxChan) { if (!all && (id === "dj" || id === "rc")) continue; const c = fxChan[id]; [c.fb.gain, c.echoOut.gain, c.verbSend.gain].forEach(p => { try { p.cancelScheduledValues(now); } catch (e) {} p.setTargetAtTime(0, now, 0.01); }); }
    };
    document.getElementById("panic").addEventListener("click", tailsOff(false));
    document.getElementById("stopAll").addEventListener("click", tailsOff(true));
  }
  // every voice goes into its own sound's chain (the global input stays for previews)
  const fxcRoute = (fn, pick) => function (...a) {
    const keep = fx.input; let c = null; try { c = fxcGet(pick(...a)); } catch (e) {}
    if (c) fx.input = (LVK && ctx) ? lvBus(LVK, c.input) : c.input;
    try { return fn.apply(this, a); } finally { fx.input = keep; }
  };
  makeVoice = fxcRoute(makeVoice, (m, id) => id || state.engine);
  makeSampleVoice = fxcRoute(makeSampleVoice, () => "samp");
  makeInstVoice = fxcRoute(makeInstVoice, () => "inst");
  playPad = fxcRoute(playPad, () => "pads");
  // --- the Effects panel: edits the open sound, or everything ---
  const fxRowLabel = document.querySelector("#fxRow .row-label > span"), fxTools = document.querySelector("#fxRow .rtools");
  const fxModeBtn = document.createElement("button"); fxModeBtn.className = "btn fxmix"; fxModeBtn.id = "fxModeBtn"; fxModeBtn.title = "Per sound: each sound has its own effects · Global: one setting for everything";
  const fxCopyBtn = document.createElement("button"); fxCopyBtn.className = "btn fxmix"; fxCopyBtn.id = "fxCopyBtn"; fxCopyBtn.textContent = "→ All"; fxCopyBtn.title = "Give every sound this sound's effects";
  fxTools.prepend(fxCopyBtn); fxTools.prepend(fxModeBtn);
  function fxcPaint() {
    const sound = FXC.mode === "sound", cur = fxcCur();
    fxModeBtn.textContent = sound ? "Per sound" : "Global"; fxModeBtn.setAttribute("aria-pressed", String(sound));
    fxCopyBtn.hidden = !sound;
    if (fxRowLabel) fxRowLabel.textContent = sound ? "Effects · " + fxcName(cur) : "Effects · all sounds";
    const on = sound ? fxcParams(cur).on !== false : state.fx.on !== false;
    fxOnBtn.setAttribute("aria-pressed", String(on)); fxOnBtn.textContent = on ? "FX: On" : "FX: Off";
    fxOnBtn.title = sound ? "Switch the effects off or on for " + fxcName(cur) : "Switch every effect off or on";
    appRoot.classList.toggle("fxoff", !on || state.fx.on === false);
  }
  {
    const pf0 = paintFxState; paintFxState = function () { pf0(); fxcPaint(); };
    const so0 = setFxOn;
    setFxOn = function (on) {
      // the Effects panel's switch is per sound; the Mixer's switch (and global mode) is the master
      if (false) { return; }
      so0(on);
    };
    refreshFxKnobs = function () {
      fxKnobsEl.innerHTML = "";
      FX_KNOBS.forEach(([k, label]) => makeKnob(fxKnobsEl, k, label, k === "volume" ? () => state.fx : fxcTarget,
        () => { fxcSave(); if (ctx) { applyFx(); if (k === "amount" && FXC.mode === "global") applyBfx(false); } }));
      if (fxKnobsEl.lastChild) fxKnobsEl.lastChild.classList.add("amt");
    };
    let fxcShown = "";
    const re0 = renderEngine;
    renderEngine = function () { re0(); const key = FXC.mode + ":" + fxcCur(); if (key !== fxcShown) { fxcShown = key; refreshFxKnobs(); } fxcPaint(); };
    fxModeBtn.addEventListener("click", () => {
      start();
      FXC.mode = FXC.mode === "sound" ? "global" : "sound"; fxcSave();
      if (ctx) applyFx(); fxcShown = FXC.mode + ":" + fxcCur(); refreshFxKnobs(); paintFxState();
      fxcToast(FXC.mode === "sound" ? "Per sound: the Effects knobs now change only " + fxcName(fxcCur()) : "Global: one effects setting for every sound");
    });
    fxCopyBtn.addEventListener("click", () => {
      const p = fxcParams(fxcCur());
      for (const id in FXC.by) if (id !== fxcCur()) Object.assign(FXC.by[id], { drive: p.drive, wobble: p.wobble, echo: p.echo, space: p.space, on: p.on, amount: p.amount });
      Object.assign(state.fx, { drive: p.drive, wobble: p.wobble, echo: p.echo, space: p.space });
      fxcSave(); save(); if (ctx) applyFx(); fxcToast("Every sound now has " + fxcName(fxcCur()) + "'s effects");
    });
    // a sound that was never set up follows the global knobs at the moment it first plays, so give
    // every tab its own copy now while the global settings are the ones the user knows
    ["drum", "samp", "pads", "inst"].concat(Object.keys(ENGINES), typeof NEW_ENGINES !== "undefined" ? Object.keys(NEW_ENGINES) : []).forEach(fxcParams);
    fxcShown = FXC.mode + ":" + fxcCur(); refreshFxKnobs(); fxcPaint();
  }

  // ---------- Auto DJ: four songs, a queue, mix styles, a mix tempo, and a beat to play along ----------
  // The crate holds up to four analysed songs (tempo, key, energy). Pick what's next, press MIX IN
  // and the free deck brings it in under the playing one in the chosen style; Auto DJ does that by
  // itself when the playing song is nearly over. A mix tempo can replace the lead song's own tempo,
  // and the drum machine can play a suggested beat in time with the decks.
  Object.assign(DJ, { crate: [null, null, null, null], next: null, trans: null, mixBpm: null, auto: false, style: "auto", beat: null, beatIdx: -1, beatVol: 0.7, tick: 0, lastAn: null, fileTarget: -1 });
  try { const o = JSON.parse(localStorage.getItem("nightbloom-dj2") || "{}"); ["style", "beatVol", "beatIdx", "beatUser"].forEach(k => { if (o[k] != null) DJ[k] = o[k]; }); } catch (e) {}
  const dj2Save = () => { try { const o = JSON.parse(localStorage.getItem("nightbloom-dj2") || "{}"); localStorage.setItem("nightbloom-dj2", JSON.stringify(Object.assign(o, { style: DJ.style, beatVol: DJ.beatVol, beatIdx: DJ.beatIdx, beatUser: !!DJ.beatUser }))); } catch (e) {} };
  const DJ_STYLES = { blend: ["Blend", 16], swap: ["Bass swap", 8], cut: ["Cut", 1], filter: ["Filter", 8], echo: ["Echo out", 8] };

  // --- key and energy ---
  const KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const CAM = { maj: { 0: "8B", 7: "9B", 2: "10B", 9: "11B", 4: "12B", 11: "1B", 6: "2B", 1: "3B", 8: "4B", 3: "5B", 10: "6B", 5: "7B" },
                min: { 9: "8A", 4: "9A", 11: "10A", 6: "11A", 1: "12A", 8: "1A", 3: "2A", 10: "3A", 5: "4A", 0: "5A", 7: "6A", 2: "7A" } };
  const KPROF = { maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], min: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] };
  const FFT4K_MAKE = () => {
    const N = 4096, rev = new Uint16Array(N), cos = new Float32Array(N / 2), sin = new Float32Array(N / 2);
    for (let i = 0; i < N; i++) { let r = 0, x = i; for (let b = 0; b < 12; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
    return { N, run(re, im) {
      for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= N; size <<= 1) { const half = size >> 1, step = N / size; for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) { const wr = cos[k * step], wi = -sin[k * step], a = s + k, b = a + half; const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; } }
    } };
  };
  const FFT4K = FFT4K_MAKE();
  function djKey(buf) {
    const sr = buf.sampleRate, N = FFT4K.N, c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const frames = Math.max(1, Math.min(160, Math.floor(buf.duration / 1.2))), chroma = new Float64Array(12), re = new Float32Array(N), im = new Float32Array(N);
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const kLo = Math.max(2, Math.floor(80 * N / sr)), kHi = Math.min(N / 2 - 1, Math.ceil(4200 * N / sr)), fc = new Float64Array(12);
    for (let f = 0; f < frames; f++) {
      const s0 = Math.floor((buf.length - N) * (f + 0.5) / frames); if (s0 < 0) break;
      for (let i = 0; i < N; i++) { const x = c1 ? 0.5 * (c0[s0 + i] + c1[s0 + i]) : c0[s0 + i]; re[i] = x * win[i]; im[i] = 0; }
      FFT4K.run(re, im); fc.fill(0);
      for (let k = kLo; k <= kHi; k++) {
        const fq = k * sr / N, mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]); if (mag < 1e-6) continue;
        const midi = 69 + 12 * Math.log2(fq / 440), pc = ((Math.round(midi) % 12) + 12) % 12, w = fq < 160 ? Math.pow(fq / 160, 2) : fq > 2000 ? Math.max(0.2, 2000 / fq) : 1;
        fc[pc] += mag * w;
      }
      let mx = 0; for (let i = 0; i < 12; i++) if (fc[i] > mx) mx = fc[i];   // every moment counts the same, loud or quiet
      if (mx > 0) for (let i = 0; i < 12; i++) chroma[i] += fc[i] / mx;
    }
    const corr = (a, b) => { const n = 12; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0; };
    let best = { r: -2, pc: 0, mode: "maj" };
    for (const mode of ["maj", "min"]) for (let pc = 0; pc < 12; pc++) { const prof = new Array(12); for (let i = 0; i < 12; i++) prof[(i + pc) % 12] = KPROF[mode][i]; const r = corr(Array.from(chroma), prof); if (r > best.r) best = { r, pc, mode }; }
    return { key: KEYS[best.pc] + (best.mode === "maj" ? " major" : " minor"), cam: CAM[best.mode][best.pc], keySure: best.r };
  }
  // how well two Camelot codes go together: 3 = same, 2 = neighbour or relative, 1 = two steps, 0 = clash
  function djCompat(a, b) {
    if (!a || !b) return 1;
    const na = +a.slice(0, -1), nb = +b.slice(0, -1), la = a.slice(-1), lb = b.slice(-1), dist = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
    if (dist === 0) return la === lb ? 3 : 2;
    if (dist === 1) return la === lb ? 2 : 1;
    if (dist === 2 && la === lb) return 1;
    return 0;
  }
  {
    const an0 = djAnalyse; DJ_AN_SRC.base = String(an0);
    djAnalyse = function (buf) {
      const r = an0(buf);
      try { Object.assign(r, djKey(buf)); } catch (e) {}
      let s = 0; for (const v of r.env) s += v; r.energy = Math.min(1, (s / Math.max(1, r.env.length)) * 2.2);
      DJ_AN_CACHE.set(buf, r); return r;
    };
    const dl0 = djLoad;
    djLoad = async function (d, buf, name, raw, meta) {
      d.crate = meta && meta.crate != null ? meta.crate : -1; d.key = ""; d.cam = ""; d.energy = 0;
      await dl0(d, buf, name, raw, meta);
      if (meta && meta.cam) { d.key = meta.key; d.cam = meta.cam; d.energy = meta.energy || 0; }
      else if (DJ_AN_CACHE.has(buf)) { const r = DJ_AN_CACHE.get(buf); d.key = r.key || ""; d.cam = r.cam || ""; d.energy = r.energy || 0; }
      if (d.crate >= 0 && DJ.crate[d.crate] && !DJ.crate[d.crate].cam && d.cam) { Object.assign(DJ.crate[d.crate], { key: d.key, cam: d.cam, energy: d.energy, bpm: d.bpm0, off: d.off }); djStoreCrate(d.crate); }
      djPaintCrate();
    };
  }

  // --- the crate ---
  const djCrateEl = document.getElementById("djSongs");
  function djStoreCrate(i) { const it = DJ.crate[i]; djIdbPut("crate" + i, it ? { name: it.name, data: it.raw || (it.buf && it.buf.duration < 90 ? bufferToWav(it.buf) : null), env: it.env || null, envRate: it.envRate || 0, bpm: it.bpm, off: it.off, key: it.key, cam: it.cam, energy: it.energy, phrase: it.phrase != null ? it.phrase : null } : null); }
  async function djCrateAdd(buf, name, raw, meta) {
    let i = DJ.crate.findIndex(x => !x); if (i < 0) { djMsg("All four song spots are full: remove one first"); return -1; }
    const it = { buf, name: name || "Song", raw: raw || null, bpm: 0, off: 0, key: "", cam: "", energy: 0, played: 0, busy: true };
    DJ.crate[i] = it; djPaintCrate(); djMsg("Analysing " + it.name + "…", true);
    await new Promise(r => setTimeout(r, 30));
    if (meta && meta.bpm) Object.assign(it, { bpm: meta.bpm, off: meta.off || 0, key: meta.key || "", cam: meta.cam || "", energy: meta.energy || 0 });
    else { let an; try { an = await djAnalyseAsync(buf); } catch (e) { DJ.crate[i] = null; djPaintCrate(); djMsg("Cancelled: " + it.name + " wasn't added"); return -1; } it.env = an.env; it.envRate = an.envRate; let bpm = an.bpm; if (bpm && bpm < 70) bpm *= 2; else if (bpm > 180) bpm /= 2; Object.assign(it, { bpm, off: an.off, key: an.key || "", cam: an.cam || "", energy: an.energy || 0 }); }
    it.busy = false; djStoreCrate(i); if (it.raw && !DJ.decks.some(d => d.buf === it.buf || d.full === it.buf)) it.buf = null; djPaintCrate();
    djMsg(it.name + ": " + (it.bpm ? it.bpm.toFixed(1) + " BPM" : "no steady beat") + (it.key ? " · " + it.key + " (" + it.cam + ")" : ""));
    return i;
  }
  // (186) edit a song of the four, playing or queued: on a deck, the deck's edit (it plays on); otherwise its sound is
  // opened, edited and kept in its spot (found again by its beat if its length changed)
  async function djEditCrate(i) {
    const it = DJ.crate[i]; if (!it || it.busy) return;
    const onDeck = DJ.decks.find(d => d.crate === i && d.buf); if (onDeck) { djEditDeck(onDeck); return; }
    let buf = it.buf;
    if (!buf && it.raw) { it.busy = true; djPaintCrate(); try { buf = await jobRun("open", "Opening " + it.name + "…", () => decode(it.raw.slice(0))); } catch (e) { buf = null; } it.busy = false; djPaintCrate(); }
    if (!buf) { djMsg("Couldn't open " + it.name + " to edit it"); return; }
    openEditor({ buf, label: "song " + (i + 1), name: it.name, async save(nb) {
      const same = Math.abs(nb.duration - buf.duration) < 0.002;
      Object.assign(it, { buf: nb, name: baseName(it.name) + " (edited)", raw: bufferToWav(nb) });
      if (!same) { try { const an = await djAnalyseAsync(nb); let bpm = an.bpm; if (bpm && bpm < 70) bpm *= 2; else if (bpm > 180) bpm /= 2; Object.assign(it, { env: an.env, envRate: an.envRate, bpm, off: an.off }); } catch (e) {} it.phrase = null; }
      djStoreCrate(i); djPaintCrate(); djMsg("Song " + (i + 1) + ": the edit is in" + (DJ.next === i ? " · still next up" : ""));
    } });
  }
  function djCrateRemove(i) {
    const it = DJ.crate[i]; if (!it) return;
    DJ.decks.forEach(d => { if (d.crate === i) d.crate = -1; });
    if (DJ.next === i) DJ.next = null;
    DJ.crate[i] = null; djIdbPut("crate" + i, null); djPaintCrate(); djMsg(it.name + " removed from the songs (the decks keep playing)");
  }
  async function djLoadCrate(d, i, play) {
    const it = DJ.crate[i]; if (!it || it.busy) return;
    let buf = it.buf;
    if (!buf) { const on = DJ.decks.find(x => x.crate === i && (x.full || x.buf)); buf = on ? (on.full || on.buf) : null; }
    if (!buf && it.raw) {
      it.busy = true; djPaintCrate(); djMsg("Opening " + it.name + "…", true);
      try { buf = await jobRun("open", "Opening " + it.name + "…", () => decode(it.raw.slice(0))); } catch (e) { buf = null; }
      it.busy = false; djPaintCrate();
      if (!buf) { djMsg("Couldn't open " + it.name + " again: remove it and add the file once more"); return; }
    }
    if (!buf) return;
    await djLoad(d, buf, it.name, false, { env: it.env || null, envRate: it.envRate || 0, bpm: it.bpm, off: it.off, key: it.key, cam: it.cam, energy: it.energy, crate: i, phrase: it.phrase != null ? it.phrase : null });
    if (play) { it.played = Date.now(); djPlay(d, true); }
    djPaintCrate();
  }
  const djFile2 = document.getElementById("djFile2");
  djFile2.addEventListener("change", async () => {
    const f = djFile2.files[0]; djFile2.value = ""; if (!f) return;
    djMsg("Opening " + f.name + "…", true);
    try { const { buf, raw } = await djDecodeFile(f); await djCrateAdd(buf, f.name.replace(/\.[^.]+$/, ""), raw); }
    catch (e) { djMsg("Couldn't open " + f.name + ". MP3, WAV, M4A and AAC work."); }
  });
  function djAddMenu() {
    if (!djBuild()) return; djRestore();
    if (!DJ.crate.some(x => !x)) { djMsg("All four song spots are full: tap a song and remove it first"); return; }
    const items = [["btn wide", "Song file… (MP3, WAV, M4A)", () => djFile2.click()], ["lab", "From the sampler"]];
    for (let j = 0; j < NSLOTS; j++) if (sampBuf[j]) items.push(["btn", "S" + (j + 1) + " · " + baseName(state.samp.slots[j].name).slice(0, 22), () => djCrateAdd(sampBuf[j], baseName(state.samp.slots[j].name))]);
    if (!sampBuf.some(Boolean)) items.push(["lab", "(the sampler is empty)"]);
    if (DJ.bank.some(Boolean)) { items.push(["lab", "From the bank"]); DJ.bank.forEach((it, k) => { if (it) items.push(["btn", "Pad " + (k + 1) + " · " + it.name, () => djCrateAdd(it.buf, it.name, null, { bpm: it.bpm, off: 0 })]); }); }
    DJ.decks.forEach(d => { if (d.buf && d.crate < 0) items.push(["btn", "What's on deck " + "AB"[d.i] + " · " + baseName(d.name).slice(0, 18), () => djCrateAdd(d.buf, d.name, null, { bpm: d.bpm0, off: d.off, key: d.key, cam: d.cam, energy: d.energy }).then(i => { if (i >= 0) d.crate = i; djPaintCrate(); })]); });
    djOpenMenu("Add a song", DJ.crate.filter(Boolean).length + " of 4", items);
  }
  document.getElementById("djAddSong").addEventListener("click", djAddMenu);
  function djSongMenu(i) {
    const it = DJ.crate[i]; if (!it) { djAddMenu(); return; }
    const onDeck = DJ.decks.find(d => d.crate === i), items = [];
    items.push(["btn", "Play on A now", () => djLoadCrate(DJ.decks[0], i, true)]);
    items.push(["btn", "Play on B now", () => djLoadCrate(DJ.decks[1], i, true)]);
    items.push(["btn wide", DJ.next === i ? "Not next any more" : "Next up (queue it)", () => { DJ.next = DJ.next === i ? null : i; djPaintCrate(); djMsg(DJ.next === i ? it.name + " is next · MIX IN NEXT brings it in" : "Queue cleared"); }]);
    items.push(["btn wide", "Mix in now (" + djStyleName(djPlan(i).style) + ")", () => djStartMix(djPlan(i))]);
    items.push(["lab", (it.bpm ? it.bpm.toFixed(1) + " BPM" : "no steady beat") + (it.key ? " · " + it.key + " · " + it.cam : "") + " · energy " + Math.round(it.energy * 100) + "%" + (onDeck ? " · on deck " + "AB"[onDeck.i] : "")]);
    items.push(["btn wide", "Edit… (trim, fade, reverse, gain)", () => djEditCrate(i)]);   // (186)
    items.push(["btn danger wide", "Remove from the songs", () => djCrateRemove(i)]);
    djOpenMenu("Song " + (i + 1) + " · " + it.name, "", items);
  }
  function djPaintCrate() {
    if (!djCrateEl) return;
    djCrateEl.innerHTML = "";
    DJ.crate.forEach((it, i) => {
      const b = document.createElement("button"); b.className = "dj-song" + (it ? "" : " empty");
      const deck = it && DJ.decks.find(d => d.crate === i && d.buf);
      if (deck) b.classList.add(deck.i === 0 ? "onA" : "onB"); else if (it && DJ.next === i) b.classList.add("next");
      const tag = !it ? "" : deck ? (deck.playing ? "playing on " : "on ") + "AB"[deck.i] : DJ.next === i ? "next up" : it.played ? "played" : "ready";
      b.innerHTML = '<span class="n"></span><span class="t"><b></b><small></small></span><span class="tag"></span>';
      b.querySelector(".n").textContent = i + 1;
      b.querySelector("b").textContent = it ? it.name : "+ Add song";
      b.querySelector("small").innerHTML = it ? (it.busy ? "analysing…" : (it.bpm ? it.bpm.toFixed(1) + " BPM" : "no beat") + (it.cam ? " · " + it.key + " · " + it.cam : "") + ' · <span class="en"><i style="width:' + Math.round(it.energy * 100) + '%"></i></span>') : "a file, a sampler slot, or a bank pad";
      b.querySelector(".tag").textContent = tag; b.querySelector(".tag").hidden = !tag;
      b.addEventListener("click", () => djSongMenu(i));
      djCrateEl.appendChild(b);
    });
    document.getElementById("djCrateHint").textContent = DJ.crate.filter(Boolean).length ? "" : "";
    djPaintAuto();
  }

  // --- which song is next, and how to bring it in ---
  function djFromTo() {
    const A = DJ.decks[0], B = DJ.decks[1];
    let from = DJ.decks[DJ.lead]; if (!from.playing) from = A.playing ? A : B.playing ? B : from;
    return { from, to: DJ.decks[1 - from.i] };
  }
  function djNextIdx() {
    if (DJ.next != null && DJ.crate[DJ.next]) return DJ.next;
    const { from } = djFromTo(), cur = from.crate;
    let best = -1, bs = -1;
    DJ.crate.forEach((it, i) => {
      if (!it || it.busy || i === cur) return;
      const ratio = it.bpm && from.bpm0 ? djTempoDist(from.bpm0, it.bpm) : 0.2;
      const s = (3 - Math.min(3, ratio * 25)) + djCompat(from.cam, it.cam) + (it.played ? -2 : 0) + (it.energy >= (from.energy || 0) ? 0.5 : 0);
      if (s > bs) { bs = s; best = i; }
    });
    return best >= 0 ? best : null;
  }
  const djTempoDist = (a, b) => Math.min(...[1, 2, 0.5].map(m => Math.abs(Math.log(b * m / a))));
  function djRecBpm(from, it) {
    if (!from || !from.bpm0 || !it || !it.bpm) return null;
    const m = [1, 2, 0.5].reduce((best, x) => Math.abs(Math.log(it.bpm * x / from.bpm0)) < Math.abs(Math.log(it.bpm * best / from.bpm0)) ? x : best, 1);
    const far = djTempoDist(from.bpm0, it.bpm) > 0.08;
    return { bpm: Math.round((far ? from.bpm0 : Math.sqrt(from.bpm0 * it.bpm * m)) * 2) / 2, far };
  }
  function djPlan(idx) {
    const { from, to } = djFromTo(); idx = idx != null ? idx : djNextIdx();
    const it = idx != null ? DJ.crate[idx] : null, rec = it ? djRecBpm(from.bpm0 ? from : to, it) : null;
    let style = DJ.style, why = "";
    if (it && style === "auto") {
      const comp = djCompat(from.cam, it.cam), far = rec && rec.far;
      if (far) { style = "cut"; why = "tempos far apart, so cut on the bar"; }
      else if (comp >= 2) { style = (it.energy || 0) > (from.energy || 0) + 0.12 ? "swap" : "blend"; why = comp === 3 ? "same key: long blend" : style === "swap" ? "keys fit and it's more energetic: drop the bass over" : "keys fit: long blend"; }
      else if (comp === 1) { style = "filter"; why = "keys only half fit: filter the old song away"; }
      else { style = "echo"; why = "keys clash: echo the old song out"; }
    } else if (it) why = DJ_STYLES[style][0].toLowerCase() + " (your pick)";
    return { from, to, idx, it, style: DJ_STYLES[style] ? style : "blend", bars: DJ_STYLES[style] ? DJ_STYLES[style][1] : 16, bpm: DJ.mixBpm || (rec && !rec.far ? rec.bpm : (from.bpm0 ? djEff(from) * from.bend : it && it.bpm)), rec, why };
  }
  const djStyleName = s => (DJ_STYLES[s] || DJ_STYLES.blend)[0];

  // --- the mix itself ---
  function djStartMix(plan) {
    if (!plan || !plan.it || !djBuild()) { djMsg("Add a song and choose what's next first"); return; }
    if (DJ.trans) { djMsg("A mix is already running"); return; }
    const { from, to, idx, it, style } = plan;
    if (!from.buf || !from.playing) { djLoadCrate(from, idx, true); djMsg("Nothing was playing, so " + it.name + " just starts on " + "AB"[from.i]); return; }
    if (!from.bpm0 || !it.bpm) { djMsg("Both songs need a beat grid to mix (Tap on the deck)"); return; }
    (async () => {
      if (to.playing) djPlay(to, false);
      if (to.crate !== idx || !to.buf) await djLoadCrate(to, idx, false);
      if (DJ.trans) return;
      DJ.lead = from.i;
      if (plan.bpm) djSetRate(from, Math.max(0.5, Math.min(2, plan.bpm / from.bpm0)));
      const beat = 60 / (djEff(from) * from.bend), bars = plan.bars, t0 = ctx.currentTime;
      const eqFrom = Object.assign({}, from.eq), eqTo = Object.assign({}, to.eq);
      const T = { from, to, idx, style, bars, beat, t0, eqFrom, eqTo, xf0: DJ.xf, target: to.i === 0 ? 0 : 1, cutAt: 0, done: false };
      to.p0 = Math.max(0, to.off); to.loop = null; to.bend = 1;
      if (style === "cut") {
        // start the new song on the old one's next bar line, at full, and drop the old one there
        const per = djPer(from), pos = djPos(from), k = Math.ceil((pos - from.off) / per / 4 + 0.02) * 4, tCut = t0 + Math.max(0.05, ((from.off + k * per) - pos) / (from.rate * from.bend));
        T.cutAt = tCut; const mr = djMatchRate(); if (mr) { if (mr.m !== 1) { to.bpm0 *= mr.m; } to.rate = Math.max(0.5, Math.min(2, mr.r)); }
        djStartSrc(to, tCut, to.p0); it.played = Date.now();
        to.xfg.gain.setValueAtTime(to.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2), t0); to.xfg.gain.setValueAtTime(1, tCut);
        from.xfg.gain.setValueAtTime(from.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2), t0); from.xfg.gain.setValueAtTime(0, tCut);
      } else {
        if (style === "blend" || style === "swap") { to.eq.lo = -26; }
        if (style === "filter") { to.eq.filt = -0.8; }
        djApplyEq(to);
        djAlign(true); it.played = Date.now(); DJ.sync = true;
      }
      DJ.trans = T; djTickOn();
      djMsg(djStyleName(style) + ": " + it.name + " comes in on " + "AB"[to.i] + (style === "cut" ? " on the next bar" : " over " + bars + " bars") + (plan.why ? " · " + plan.why : ""), true);
      djPaintAll(); djPaintCrate();
    })();
  }
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  function djMixStep() {
    const T = DJ.trans; if (!T) return;
    const { from, to, style } = T, now = ctx.currentTime;
    if (style === "cut") {
      if (now >= T.cutAt - 0.03 && DJ.xf !== T.target) { DJ.xf = T.target; const x = document.getElementById("djXf"); if (x) x.value = DJ.xf; }
      if (now >= T.cutAt + T.beat) djMixEnd();
      return;
    }
    const p = (now - T.t0) / (T.bars * 4 * T.beat), t = now;
    const eqSet = (d, k, v) => { d.eq[k] = v; };
    if (style === "blend") {
      DJ.xf = lerp(T.xf0, T.target, p);
      if (p >= 0.5) { const q = (p - 0.5) / 0.08; eqSet(to, "lo", lerp(-26, T.eqTo.lo, q)); eqSet(from, "lo", lerp(T.eqFrom.lo, -26, q)); }
    } else if (style === "swap") {
      DJ.xf = p < 0.5 ? lerp(T.xf0, 0.5, p / 0.5) : lerp(0.5, T.target, (p - 0.5) / 0.5);
      if (p >= 0.5) { const q = (p - 0.5) / 0.05; eqSet(to, "lo", lerp(-26, T.eqTo.lo, q)); eqSet(from, "lo", lerp(T.eqFrom.lo, -26, q)); }
    } else if (style === "filter") {
      DJ.xf = lerp(T.xf0, T.target, p);
      eqSet(from, "filt", lerp(T.eqFrom.filt, 1, p)); eqSet(to, "filt", lerp(-0.8, T.eqTo.filt, p));
    } else if (style === "echo") {
      DJ.xf = lerp(T.xf0, T.target, p / 0.5);
      if (p >= 0.5) { if (from.echoSend && !T.echoed) { T.echoed = true; from.echoDelay.delayTime.setValueAtTime(Math.min(1.9, T.beat * 0.75), t); from.echoSend.gain.setTargetAtTime(0.9, t, 0.05); } eqSet(from, "vol", lerp(T.eqFrom.vol, 0, (p - 0.5) / 0.45)); }
    }
    djApplyXf(); djApplyEq(from); djApplyEq(to);
    const x = document.getElementById("djXf"); if (x) x.value = DJ.xf;
    if (p >= 1) djMixEnd();
  }
  function djMixEnd(cancel) {
    const T = DJ.trans; if (!T) return; DJ.trans = null;
    const { from, to } = T, t = ctx.currentTime;
    if (!cancel) {
      DJ.xf = T.target; djApplyXf();
      if (T.style === "echo" && from.echoSend) { from.echoSend.gain.setTargetAtTime(0, t + 0.3, 0.4); }
      djPlay(from, false);
      from.eq = T.eqFrom; to.eq = T.eqTo; djApplyEq(from); djApplyEq(to);
      from.xfg.gain.cancelScheduledValues(t); to.xfg.gain.cancelScheduledValues(t); djApplyXf();
      DJ.lead = to.i; DJ.sync = false;
      if (DJ.next === T.idx) DJ.next = null;
      // get the next song ready on the deck that just went quiet
      const nx = djNextIdx();
      if (nx != null) djLoadCrate(from, nx, false).then(() => djMsg(to.name + " is playing · " + DJ.crate[nx].name + " is ready on " + "AB"[from.i] + (DJ.auto ? " · Auto DJ brings it in" : " · MIX IN NEXT when you like")));
      else djMsg(to.name + " is playing · add or queue another song for the next mix");
    } else { from.eq = T.eqFrom; to.eq = T.eqTo; djApplyEq(from); djApplyEq(to); from.xfg.gain.cancelScheduledValues(t); to.xfg.gain.cancelScheduledValues(t); djApplyXf(); djMsg("Mix stopped where it was: both decks keep playing, the crossfader is yours"); }
    djPaintAll(); djPaintCrate();
  }
  document.getElementById("djMixIn").addEventListener("click", () => { if (DJ.trans) { djMixEnd(true); return; } djStartMix(djPlan()); });
  document.getElementById("djXf").addEventListener("pointerdown", () => { if (DJ.trans && DJ.trans.style !== "cut") djMixEnd(true); });

  // --- echo on each deck (for "echo out") ---
  {
    const ch0 = djChain;
    djChain = function (d) {
      ch0(d);
      d.echoSend = ctx.createGain(); d.echoSend.gain.value = 0; d.echoDelay = ctx.createDelay(2); d.echoDelay.delayTime.value = 0.4;
      const fbk = ctx.createGain(); fbk.gain.value = 0.55; const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2800;
      d.vol.connect(d.echoSend).connect(d.echoDelay).connect(tone).connect(fbk).connect(d.echoDelay); tone.__soloGroup = "dj" + d.i; tone.connect(DJ.bus);
    };
  }

  // --- auto DJ, the mix tempo, and the ticking that keeps it all going when the view is closed ---
  function djTickOn() { if (!DJ.tick) DJ.tick = setInterval(djTick, 50); }
  function djTick() {
    if (!ctx) return;
    if (DJ.trans) djMixStep();
    if (DJ.beat) djBeatSched();
    if (DJ.auto && !DJ.trans) {
      const { from } = djFromTo();
      if (from.playing && from.buf) {
        const plan = djPlan();
        if (plan.it && plan.it.bpm) {
          const left = (from.buf.duration - djPos(from)) / (from.rate * from.bend), need = plan.bars * 4 * (60 / (djEff(from) * from.bend)) + 1.5;
          if (left <= need && !(from.loop && from.loop.n === "song")) djStartMix(plan);   // (175) a deck looping its song holds the mix
        }
      } else if (!DJ.decks.some(d => d.playing)) { const plan = djPlan(); if (plan.it) { djLoadCrate(plan.to, plan.idx, true); djMsg("Auto DJ: " + plan.it.name + " starts on " + "AB"[plan.to.i]); } }
    }
    if (!DJ.trans && !DJ.beat && !(DJ.auto && DJ.decks.some(d => d.playing))) { clearInterval(DJ.tick); DJ.tick = 0; }
  }
  function djSetMixBpm(b) {
    DJ.mixBpm = b ? Math.max(50, Math.min(200, Math.round(b * 2) / 2)) : null;
    const L = LEAD();
    if (L.buf && L.bpm0 && djBuild()) { djSetRate(L, DJ.mixBpm ? DJ.mixBpm / L.bpm0 : 1); if (DJ.sync && FOL().playing) djAlign(false); else if (DJ.sync) { const mr = djMatchRate(); if (mr) djSetRate(FOL(), mr.r); } }
    djPaintAll(); djPaintAuto();
  }
  document.getElementById("djBpmDown").addEventListener("click", () => djSetMixBpm((DJ.mixBpm || djShownBpm()) - 0.5));
  document.getElementById("djBpmUp").addEventListener("click", () => djSetMixBpm((DJ.mixBpm || djShownBpm()) + 0.5));
  document.getElementById("djBpmRec").addEventListener("click", () => { const plan = djPlan(); if (plan.rec) { djSetMixBpm(plan.rec.bpm); djMsg("Mix tempo " + plan.rec.bpm + " BPM" + (plan.rec.far ? " (the next song is far from this one; a Cut or Echo out suits that)" : " · halfway between the two songs")); } else djMsg("Needs a playing song and a next song to recommend a tempo"); });
  document.getElementById("djBpmOff").addEventListener("click", () => { djSetMixBpm(null); djMsg("Back to the lead song's own tempo"); });
  const djShownBpm = () => { const L = LEAD(); return DJ.mixBpm || (L.bpm0 ? djEff(L) * L.bend : 120); };
  document.getElementById("djAutoOn").addEventListener("click", () => { DJ.auto = !DJ.auto; if (DJ.auto) { djBuild(); djTickOn(); const plan = djPlan(); djMsg(plan.it ? "Auto DJ on: " + plan.it.name + " comes in by itself when this song is nearly over (" + djStyleName(plan.style) + ")" : "Auto DJ on: add more songs and it mixes them in by itself", true); } else djMsg("Auto DJ off"); djPaintAuto(); });
  djEl.querySelectorAll("#djStyle button").forEach(b => b.addEventListener("click", () => { DJ.style = b.dataset.style; dj2Save(); djPaintAuto(); }));

  // --- a beat to play along: the drum machine, in time with the decks ---
  const djBeatOrder = () => { const bpm = djShownBpm(); return BEATS.map((b, i) => [i, djTempoDist(bpm, b[2]) + (Math.abs(Math.log(b[2] / bpm)) > 0.2 ? 0.05 : 0)]).sort((a, b) => a[1] - b[1]).map(x => x[0]); };
  // the suggestion follows the tempo until a beat is picked by hand
  function djBeatPick() { const order = djBeatOrder(); if (!DJ.beatUser || DJ.beatIdx < 0 || !BEATS[DJ.beatIdx]) DJ.beatIdx = order[0]; return DJ.beatIdx; }
  function djBeatMove(dir) { const order = djBeatOrder(), k = Math.max(0, order.indexOf(djBeatPick())), nk = Math.max(0, Math.min(order.length - 1, k + dir)); DJ.beatIdx = order[nk]; DJ.beatUser = true; dj2Save(); if (DJ.beat) { DJ.beat.rows = buildBeat(DJ.beatIdx); DJ.beat.n = DJ.beat.rows[DRUMS[0][0]].length; DJ.beat.i = DJ.beatIdx; } djPaintAuto(); }
  document.getElementById("djBeatPrev").addEventListener("click", () => djBeatMove(-1));
  document.getElementById("djBeatNext").addEventListener("click", () => djBeatMove(1));
  document.getElementById("djBeatVol").addEventListener("input", e => { DJ.beatVol = +e.target.value; dj2Save(); if (DJ.beatBus) DJ.beatBus.gain.setTargetAtTime(DJ.beatVol, ctx.currentTime, 0.02); });
  function djBeatStart() {
    if (!djBuild()) return;
    const i = djBeatPick(), rows = buildBeat(i), n = rows[DRUMS[0][0]].length;
    if (!DJ.beatBus || DJ.beatBusFor !== fx.drumBus) { DJ.beatBus = ctx.createGain(); DJ.beatBus.gain.value = DJ.beatVol; DJ.beatBus.__soloGroup = "djbeat"; DJ.beatBus.connect(fx.drumBus); DJ.beatBusFor = fx.drumBus; }
    // start on the lead's next bar line so the beat sits on the song
    const L = LEAD(); let at = ctx.currentTime + 0.08;
    if (L.playing && L.bpm0) { const per = djPer(L), pos = djPos(L), k = Math.ceil((pos - L.off) / per / 4 + 0.03) * 4; at = ctx.currentTime + Math.max(0.05, ((L.off + k * per) - pos) / (L.rate * L.bend)); }
    DJ.beat = { i, rows, n, step: 0, next: at }; djTickOn(); djPaintAuto();
  }
  function djBeatStop() { DJ.beat = null; djPaintAuto(); }
  function djBeatSched() {
    const Bt = DJ.beat; if (!Bt) return;
    const bpm = djShownBpm(), dur = 60 / bpm / 4, swing = BEATS[Bt.i][3];
    if (Bt.next < ctx.currentTime - 0.05) { const k = Math.ceil((ctx.currentTime - Bt.next) / dur); Bt.next += k * dur; Bt.step = (Bt.step + k) % Bt.n; }
    while (Bt.next < ctx.currentTime + NB_LA) {
      const s = Bt.step, t = s % 2 === 1 ? Bt.next + swing * dur * 0.5 : Bt.next, keep = fx.drumBus;
      fx.drumBus = DJ.beatBus;
      try { for (const [id] of DRUMS) if (Bt.rows[id] && Bt.rows[id][s]) playDrum(id, t); } finally { fx.drumBus = keep; }
      Bt.next += dur; Bt.step = (s + 1) % Bt.n;
    }
  }
  document.getElementById("djBeatPlay").addEventListener("click", () => { if (DJ.beat) djBeatStop(); else djBeatStart(); });
  function djPaintAuto() {
    document.getElementById("djAutoOn").setAttribute("aria-pressed", String(DJ.auto));
    djEl.querySelectorAll("#djStyle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.style === DJ.style)));
    const L = LEAD(), plan = djPlan();
    document.getElementById("djBpmVal").textContent = (DJ.mixBpm ? DJ.mixBpm.toFixed(1) : L.bpm0 ? (djEff(L) * L.bend).toFixed(1) : "—") + (DJ.mixBpm ? "" : "");
    document.getElementById("djBpmVal").title = DJ.mixBpm ? "Mix tempo (set by you)" : "The lead song's tempo";
    document.getElementById("djBpmRec").textContent = "Recommended: " + (plan.rec ? plan.rec.bpm.toFixed(1) : "—");
    document.getElementById("djBpmOff").hidden = !DJ.mixBpm;
    const bi = djBeatPick(); document.getElementById("djBeatName").textContent = BEATS[bi][0] + " · " + BEATS[bi][1] + " (" + BEATS[bi][2] + ")";
    const pb = document.getElementById("djBeatPlay"); pb.setAttribute("aria-pressed", String(!!DJ.beat)); pb.textContent = DJ.beat ? "■ Stop beat" : "▶ Play along";
    const mi = document.getElementById("djMixIn"); mi.setAttribute("aria-pressed", String(!!DJ.trans)); mi.textContent = DJ.trans ? "MIXING… tap to take over" : "MIX IN NEXT ▶";
    const pl = document.getElementById("djPlan");
    if (DJ.trans) pl.innerHTML = "<b>" + djStyleName(DJ.trans.style) + "</b> · " + DJ.trans.to.name + " coming in on " + "AB"[DJ.trans.to.i];
    else if (!plan.it) pl.textContent = DJ.crate.some(Boolean) ? "Tap a song to make it next, or Auto picks the best fit" : "Add songs, play one, pick what's next";
    else if (!plan.from.buf || !plan.from.playing) pl.innerHTML = "Nothing is playing yet: MIX IN NEXT just starts <b>" + plan.it.name + "</b>, or tap a song for Play on A / B";
    else pl.innerHTML = "Next: <b>" + plan.it.name + "</b> on " + "AB"[plan.to.i] + " · " + djStyleName(plan.style) + (plan.style !== "cut" ? " over " + plan.bars + " bars" : "") + (plan.bpm ? " at " + (+plan.bpm).toFixed(1) + " BPM" : "") + (plan.why ? " · " + plan.why : "") + (plan.it.cam && plan.from.cam ? " · keys " + plan.from.cam + "→" + plan.it.cam + ["clash", "half fit", "fit", "match"][djCompat(plan.from.cam, plan.it.cam)] : "");
  }
  // the decks' Load menu offers the songs; the ? help knows about all this; Stop stops the beat and the mix
  {
    const om0 = djOpenMenu;
    djOpenMenu = function (title, info, items) {
      if (/^Load deck [AB]$/.test(title) && DJ.crate.some(Boolean)) {
        const d = DJ.decks["AB".indexOf(title.slice(-1))], extra = [["lab", "From the songs"]];
        DJ.crate.forEach((it, i) => { if (it && !it.busy) extra.push(["btn", (i + 1) + " · " + it.name, () => djLoadCrate(d, i, false)]); });
        items = [items[0]].concat(extra, items.slice(1));
      }
      return om0(title, info, items);
    };
    const pa0 = djPaintAll; djPaintAll = function () { pa0(); djPaintAuto(); };
    document.getElementById("stopAll").addEventListener("click", () => { if (DJ.trans) djMixEnd(true); if (DJ.beat) djBeatStop(); });
    document.getElementById("djStop").addEventListener("click", () => { if (DJ.trans) djMixEnd(true); if (DJ.beat) djBeatStop(); });
    const rs0 = djRestore;
    djRestore = async function () {
      const first = !DJ.loaded; await rs0();
      if (!first) return;
      for (let i = 0; i < 4; i++) { const r = await djIdbGet("crate" + i); if (r && r.data) { try { DJ.crate[i] = { buf: null, name: r.name, raw: r.data, env: r.env || null, envRate: r.envRate || 0, bpm: r.bpm || 0, off: r.off || 0, key: r.key || "", cam: r.cam || "", energy: r.energy || 0, played: 0, busy: false, phrase: r.phrase != null ? r.phrase : null }; } catch (e) {} } }
      DJ.decks.forEach(d => { if (d.buf) { const i = DJ.crate.findIndex(it => it && it.name === d.name && Math.abs((it.bpm || 0) - d.bpm0) < 0.5); if (i >= 0) { d.crate = i; if (!DJ.crate[i].env && d.env) { DJ.crate[i].env = d.env; DJ.crate[i].envRate = d.envRate; } } } });
      djPaintCrate();
    };
    const hp = document.querySelector("#djHelp .dj-helptext");
    if (hp) hp.insertAdjacentHTML("beforeend", "<p><b>Songs &amp; Auto DJ:</b> add up to four songs; each is analysed for tempo, key (Camelot code, e.g. 8A) and energy. Tap a song for <b>Next up</b>, or let Auto pick the best fit. <b>MIX IN NEXT</b> brings it in on the free deck (or the one you pick under <b>Next song on</b>) in the chosen style: Blend (16 bars, bass swaps halfway), Bass swap (8 bars), Cut (on the next bar), Filter (the old song filters away), Echo out (the old song echoes away); Auto chooses from the two songs' tempo, key and energy. Tap MIXING… or grab the crossfader to take over. <b>Auto DJ</b> starts the mix by itself when the playing song is nearly over. <b>Mix tempo</b> replaces the lead's own tempo (Recommended = halfway between the two songs when they're close). <b>Beat</b> suggests a drum pattern for the tempo and plays it in time with the decks.</p>");
  }
  // --- the record button, mirrored from the top bar, so the mix can be recorded from here ---
  {
    const djRec = document.getElementById("djRec"), tb = () => document.getElementById("takeBtn");
    djRec.addEventListener("click", () => { const was = tb().classList.contains("live"); tb().click(); if (was) setTimeout(djTakeMenu, 200); else djMsg("Recording everything you hear · tap ■ to stop", true); });
    function djTakeMenu() {
      if (document.getElementById("takeBar").hidden) return;
      djOpenMenu("Recording ready", document.getElementById("takeInfo").textContent, [
        ["btn", "Export WAV", () => document.getElementById("takeExport").click()],
        ["btn", "Export MP3", () => document.getElementById("takeMp3").click()],
        ["btn", "Send to sampler", () => document.getElementById("takeToSlot").click()],
        ["btn wide", "Keep it for later (the take bar in the main view has it)", () => {}],
        ["btn danger wide", "Discard", () => document.getElementById("takeDiscard").click()]]);
    }
    setInterval(() => { if (djEl.hidden) return; const b = tb(); if (!b) return; if (djRec.textContent !== b.textContent) djRec.textContent = b.textContent; djRec.classList.toggle("live", b.classList.contains("live")); }, 250);
    const pl0 = djPlay; djPlay = function (d, on) { pl0(d, on); if (DJ.auto) djTickOn(); };
  }
  djPaintCrate();

