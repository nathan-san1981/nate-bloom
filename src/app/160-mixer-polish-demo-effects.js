  // ======================================================================
  // Mixer, easier: a level meter that warns about clipping, and an
  // overall volume for Tracks
  // ======================================================================
  {
    let trkVol = 0.8;
    try { const v = parseFloat(localStorage.getItem("nightbloom-trackvol")); if (Number.isFinite(v)) trkVol = v; } catch (e) {}
    const applyTrkVol = () => { if (B && B.trackBus) B.trackBus.gain.setTargetAtTime(trkVol * 1.25, ctx.currentTime, 0.03); };
    { const ob = buildChain; buildChain = function () { ob(); applyTrkVol(); }; }
    const omc = mixChannels;
    mixChannels = function () {
      const ch = omc();
      if (window.__nbTracksMix) ch.splice(1, 0, { group: "Tracks", name: "All tracks", sub: "overall volume of the Tracks editor", get: () => trkVol,
        set: v => { trkVol = v; try { localStorage.setItem("nightbloom-trackvol", v); } catch (e) {} applyTrkVol(); }, dflt: 0.8 });
      // what's sounding right now goes to the top, so the loud thing is easy to find
      const live = c => (c.group === "Synths" && c.sub === "playing now") || (c.group === "Library layers" && !/ · off$/.test(c.sub) && (state.engine === "lib" || !!(state.stack && state.stack.lib)))
        || (c.group === "Instrument" && state.engine === "inst") || (c.group === "Sampler" && state.engine === "samp")
        || (c.group === "Drums" && (c.name === "All drums" || / machine$/.test(c.name) && c.sub === "playing"))
        || (c.group === "Notation" && SC().notes.length > 0) || c.group === "Tracks";
      const top = ch.filter((c, i) => i > 0 && live(c)).map(c => Object.assign({}, c, { group: "Playing now" }));
      return [ch[0], ...top, ...ch.slice(1).filter(c => !live(c))];
    };
    // level meter
    const bar = document.getElementById("mxMeterBar"), lab = document.getElementById("mxMeterLab");
    const buf = new Float32Array(1024); let raf = 0, hold = 0, clipUntil = 0;
    function meter() {
      if (mxEl.hidden || !analyser) { raf = 0; return; }
      analyser.getFloatTimeDomainData(buf);
      let pk = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > pk) pk = v; }
      hold = Math.max(pk, hold * 0.94);
      const now = performance.now(); if (pk >= 0.98) clipUntil = now + 1500;
      const db = 20 * Math.log10(Math.max(1e-5, hold)), pct = Math.max(0, Math.min(1, (db + 48) / 48));
      bar.style.width = (pct * 100).toFixed(1) + "%";
      const clip = now < clipUntil;
      bar.classList.toggle("hot", db > -6 && !clip); bar.classList.toggle("clip", clip);
      lab.textContent = clip ? "Too loud: turn something down" : hold < 0.001 ? "Silent" : db > -6 ? "Loud" : "OK";
      raf = requestAnimationFrame(meter);
    }
    const mo = openMixer;
    openMixer = function () { start(); mo(); if (!raf) raf = requestAnimationFrame(meter); };
    ["mixBtn", "fxMix"].forEach(id => { const el = document.getElementById(id); el.removeEventListener("click", mo); el.addEventListener("click", () => openMixer()); });
  }

  // ---------- Polish batch: limiter, scale lock, tap tempo + click, undo for Clear, shortcuts, help ----------

  // 1. Safety limiter. The compressor shapes the sound; this brickwall after it means stacking three
  //    drum machines, four layers and a held chord can get loud but never distorts or clips.
  {
    const chain0 = buildChain;
    buildChain = function () {
      chain0();
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
      const trim = ctx.createGain(); trim.gain.value = Math.pow(10, -(3 - 3 / 20) * 0.6 / 20);   // take the limiter's automatic make-up gain back out
      // and a soft clipper for the last 1.5 dB: whatever gets past the limiter is rounded off, never clipped flat
      const safe = ctx.createWaveShaper(); safe.oversample = "2x";
      safe.curve = (() => { const n = 4096, c = new Float32Array(n), k = 0.84; for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k))); } return c; })();
      try { fx.comp.disconnect(analyser); } catch (e) {}
      fx.comp.connect(lim).connect(trim).connect(safe).connect(analyser);
      fx.limiter = lim; fx.chainNodes.push(lim, trim, safe);
    };
    if (ctx && fx.comp) buildChain();
  }

  // 2. Scale lock: pick a key and scale, and every key you press lands in it. Keys outside the scale
  //    dim and snap to the nearest note that fits. Works for touch, the computer keyboard, MIDI in,
  //    Hold and the arpeggiator (which plays the notes you held).
  const SCALES = [
    ["off", "Off (all notes)", null], ["maj", "Major", [0, 2, 4, 5, 7, 9, 11]], ["min", "Minor", [0, 2, 3, 5, 7, 8, 10]],
    ["pmaj", "Pentatonic major", [0, 2, 4, 7, 9]], ["pmin", "Pentatonic minor", [0, 3, 5, 7, 10]], ["blues", "Blues", [0, 3, 5, 6, 7, 10]],
    ["dor", "Dorian", [0, 2, 3, 5, 7, 9, 10]], ["mixo", "Mixolydian", [0, 2, 4, 5, 7, 9, 10]], ["lyd", "Lydian", [0, 2, 4, 6, 7, 9, 11]],
    ["hmin", "Harmonic minor", [0, 2, 3, 5, 7, 8, 11]], ["phry", "Phrygian", [0, 1, 3, 5, 7, 8, 10]], ["whole", "Whole tone", [0, 2, 4, 6, 8, 10]],
    ["jin", "Hirajōshi", [0, 2, 3, 7, 8]], ["arab", "Double harmonic", [0, 1, 4, 5, 7, 8, 11]],
  ];
  const KEY_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const scl = { key: 0, scale: "off" };
  try { Object.assign(scl, JSON.parse(localStorage.getItem("nightbloom-scale") || "{}")); } catch (e) {}
  if (!SCALES.some(s => s[0] === scl.scale)) scl.scale = "off";
  scl.key = ((+scl.key || 0) % 12 + 12) % 12;
  const saveScale = () => { try { localStorage.setItem("nightbloom-scale", JSON.stringify(scl)); } catch (e) {} };
  const scaleSet = () => { const s = SCALES.find(x => x[0] === scl.scale); return s && s[2] ? new Set(s[2].map(i => (i + scl.key) % 12)) : null; };
  const inScale = (set, m) => set.has(((m % 12) + 12) % 12);
  function snapNote(m) {
    const set = scaleSet(); if (!set || inScale(set, m)) return m;
    for (let d = 1; d < 7; d++) { if (inScale(set, m - d)) return m - d; if (inScale(set, m + d)) return m + d; }
    return m;
  }
  {
    const on0 = noteOn, off0 = noteOff, held0 = toggleHeld;
    noteOn = function (m) { return on0(snapNote(m)); };
    noteOff = function (m) { return off0(snapNote(m)); };
    toggleHeld = function (m) { return held0(snapNote(m)); };
  }
  function paintScale() {
    const set = scaleSet();
    keyEls.forEach((el, m) => { el.classList.toggle("out", !!set && !inScale(set, m)); el.classList.toggle("root", !!set && ((m % 12) + 12) % 12 === scl.key); });
    const btn = document.getElementById("scaleBtn");
    const s = SCALES.find(x => x[0] === scl.scale);
    const SHORT = { maj: "major", min: "minor", pmaj: "pent", pmin: "min pent", blues: "blues", dor: "dorian", mixo: "mixo", lyd: "lydian", hmin: "harm min", phry: "phryg", whole: "whole", jin: "hirajōshi", arab: "dbl harm" };
    btn.textContent = s && s[2] ? "♪ " + KEY_NAMES[scl.key] + " " + SHORT[scl.scale] : "Scale: Off";
    btn.setAttribute("aria-pressed", String(!!(s && s[2])));
  }
  {
    const bk0 = buildKeys;
    buildKeys = function () { bk0(); paintScale(); };
  }
  const scEl = document.getElementById("scaleSheet");
  function renderScaleSheet() {
    const kk = document.getElementById("scKeys"); kk.innerHTML = "";
    KEY_NAMES.forEach((n, i) => {
      const b = document.createElement("button"); b.className = "btn"; b.textContent = n; b.setAttribute("aria-pressed", String(scl.key === i));
      b.addEventListener("click", () => { scl.key = i; saveScale(); renderScaleSheet(); paintScale(); scalePreview(); });
      kk.appendChild(b);
    });
    const ss = document.getElementById("scScales"); ss.innerHTML = "";
    SCALES.forEach(([id, name, iv]) => {
      const b = document.createElement("button"); b.className = "btn mchip"; b.innerHTML = "<b></b><small></small>";
      b.firstChild.textContent = name; b.lastChild.textContent = iv ? iv.length + " notes" : "no snapping";
      b.setAttribute("aria-pressed", String(scl.scale === id));
      b.addEventListener("click", () => { scl.scale = id; saveScale(); renderScaleSheet(); paintScale(); scalePreview(); });
      ss.appendChild(b);
    });
  }
  let scPrevT = [];
  function scalePreview() {
    // a quick run up the scale so you can hear the choice
    const s = SCALES.find(x => x[0] === scl.scale); if (!s || !s[2] || !ctx) return;
    scPrevT.forEach(clearTimeout); scPrevT = [];
    if (["drum", "pads"].includes(state.engine)) return;
    const notes = [...s[2], 12].map(i => 60 + scl.key + i);
    notes.forEach((m, k) => scPrevT.push(setTimeout(() => { if (scEl.hidden) return; const v = makeNote(m); setTimeout(() => v.stop(), 160); }, k * 110)));
  }
  document.getElementById("scaleBtn").addEventListener("click", () => { start(); scEl.hidden = false; renderScaleSheet(); });
  document.getElementById("scDone").addEventListener("click", () => { scEl.hidden = true; scPrevT.forEach(clearTimeout); });
  document.getElementById("scOff").addEventListener("click", () => { scl.scale = "off"; saveScale(); renderScaleSheet(); paintScale(); });
  {
    // the Scale button lives next to Blend and hides with it
    const row = document.getElementById("blendRow"), sb = document.getElementById("scaleBtn");
    const obs = new MutationObserver(() => { sb.hidden = row.hidden; });
    obs.observe(row, { attributes: true, attributeFilter: ["hidden"] }); sb.hidden = row.hidden;
  }
  paintScale();

  // 3. Tap tempo (tap the bpm readout in time) and a click track.
  {
    let taps = [];
    bpmLabel.style.cursor = "pointer"; bpmLabel.title = "Tap in time to set the tempo"; bpmLabel.setAttribute("role", "button"); bpmLabel.tabIndex = 0;
    const tap = () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now); if (taps.length > 8) taps.shift();
      bpmLabel.classList.remove("tapped"); void bpmLabel.offsetWidth; bpmLabel.classList.add("tapped");
      if (taps.length < 3) { bpmLabel.textContent = "tap " + (3 - taps.length) + " more"; return; }
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      setBpm(Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
    };
    bpmLabel.addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
    bpmLabel.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tap(); } });
  }
  let clickOn = false;
  const clickBtn = document.getElementById("clickBtn");
  clickBtn.addEventListener("click", () => { clickOn = !clickOn; clickBtn.setAttribute("aria-pressed", String(clickOn)); });
  function playClick(t, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    o.connect(g).connect(fx.comp); o.start(t); o.stop(t + 0.07);
  }
  {
    const ss0 = scheduleStep;
    scheduleStep = function (s, t) {
      ss0(s, t);
      if (clickOn && beatStarts().has(s)) playClick(t, s === 0);
    };
  }

  // 4. Undo after Clear: the pattern comes back with one tap for a few seconds.
  const nbToast = document.getElementById("nbToast");
  let nbToastT = 0, nbUndoFn = null;
  function toastUndo(msg, fn) {
    nbToast.firstChild.textContent = msg; nbUndoFn = fn; nbToast.hidden = false;
    clearTimeout(nbToastT); nbToastT = setTimeout(() => { nbToast.hidden = true; nbUndoFn = null; }, 7000);
  }
  nbToast.lastChild.addEventListener("click", () => { if (nbUndoFn) nbUndoFn(); nbToast.hidden = true; nbUndoFn = null; });
  clearBtn.addEventListener("click", () => {
    if (!clearArmed) return;   // first tap only arms the button
    const snap = { rows: JSON.parse(JSON.stringify(state.seq.rows)), synth: state.seq.synth.slice(), beat: state.seq.beat,
      prob: JSON.parse(JSON.stringify(state.seq.prob || {})), rat: JSON.parse(JSON.stringify(state.seq.rat || {})) };
    setTimeout(() => toastUndo("Pattern cleared", () => {
      for (const id in snap.rows) state.seq.rows[id] = snap.rows[id]; state.seq.synth = snap.synth; state.seq.beat = snap.beat;
      if (state.seq.prob) Object.assign(state.seq.prob, snap.prob); if (state.seq.rat) Object.assign(state.seq.rat, snap.rat);
      if (seqBuilt) paintSeq(); save();
    }), 0);
  }, true);

  // 5. Keyboard shortcuts for the laptop / tablet keyboard. Letters still play notes.
  const helpEl = document.getElementById("helpSheet");
  window.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tgt = e.target; if (tgt && tgt.closest && tgt.closest("input, textarea, select, [contenteditable]")) return;
    if (document.querySelector(".editor:not([hidden]), .browser:not([hidden]), .trk:not([hidden])")) {
      if (e.key === "Escape") { const c = document.querySelector(".editor:not([hidden]) .sheet-foot .btn, .editor:not([hidden]) .ed-foot .btn"); if (c) { e.preventDefault(); c.click(); } }
      return;
    }
    if (!document.getElementById("start").hidden) return;
    const k = e.key;
    if (k === " ") { e.preventDefault(); start(); playBtn.click(); }
    else if (k === "Escape") { e.preventDefault(); document.getElementById("panic").click(); }
    else if (k === "ArrowDown" || k === "ArrowUp" || k === "ArrowLeft" || k === "ArrowRight") {
      // a focused knob or slider keeps its arrows
      if (tgt && tgt.closest && tgt.closest(".knob, [role=slider], .cell, .rc-c")) return;
      e.preventDefault();
      if (k === "ArrowDown" || k === "ArrowUp") { if (!e.repeat) document.getElementById(k === "ArrowDown" ? "octDown" : "octUp").click(); }
      else setBpm(state.seq.bpm + (k === "ArrowLeft" ? -2 : 2));
    }
    else if (k === "?") { e.preventDefault(); openHelp(); }
    else if (k === "Enter" && e.shiftKey) { e.preventDefault(); holdBtn.click(); }
  });

  // 6. Help: a one-screen guide, from the ? button and the ? key.
  function openHelp() { helpEl.hidden = false; }
  document.getElementById("helpBtn").addEventListener("click", openHelp);
  document.getElementById("helpDone").addEventListener("click", () => { helpEl.hidden = true; });

  // ---------- Demo phrases + FX Lab docked beside the keys ----------

  // Demo: five notes that show a sound or effect off — two short, one medium, one long, then a high
  // note with a tail so echo, space and shimmer can be heard. Drums get a bar, pads a run across the
  // kit, the Arp and Motion demos hold a chord.
  let demoT = [], demoNotes = new Set(), demoHeld = [], demoBtn = null;
  function demoStop() {
    demoT.forEach(clearTimeout); demoT = [];
    demoNotes.forEach(m => noteOff(m)); demoNotes.clear();
    if (demoHeld.length) { demoHeld.forEach(m => dropHeld(snapNote(m))); demoHeld = []; updateHoldBtn(); }
    if (demoBtn) { demoBtn.textContent = demoBtn.dataset.label; demoBtn.setAttribute("aria-pressed", "false"); demoBtn = null; }
  }
  function demoPlay(btn, kind) {
    start(); if (!ctx) return;
    const again = demoBtn === btn; demoStop(); if (again) return;
    demoBtn = btn; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = "■ Stop"; btn.setAttribute("aria-pressed", "true");
    const at = (ms, fn) => demoT.push(setTimeout(fn, ms));
    const note = (m, ms, len) => { at(ms, () => { noteOn(m); demoNotes.add(m); }); at(ms + len, () => { noteOff(m); demoNotes.delete(m); }); };
    const eng = state.engine; let total;
    if (eng === "drum") {
      const d = 60000 / state.seq.bpm / 4;
      [["kick", 0], ["ch", 1], ["snare", 2], ["ch", 3], ["kick", 4], ["ch", 5], ["snare", 6], ["clap", 6], ["ch", 7], ["oh", 7],
       ["kick", 8], ["ch", 9], ["snare", 10], ["ch", 11], ["kick", 12], ["kick", 13], ["snare", 14], ["ch", 15], ["cow", 15]].forEach(([id, s]) => at(s * d, () => playDrum(id, ctx.currentTime)));
      total = 16 * d + 900;
    } else if (eng === "pads") {
      for (let k = 0; k < 8; k++) at(k * 230, () => kitPadDown(k));
      total = 8 * 230 + 1500;
    } else if (kind === "arp" || kind === "motion") {
      const chord = [60, 64, 67, 71];
      at(0, () => { chord.forEach(m => { toggleHeld(m); demoHeld.push(m); }); });
      total = kind === "motion" ? 7000 : 4000;
      at(total - 900, () => { demoHeld.forEach(m => dropHeld(snapNote(m))); demoHeld = []; updateHoldBtn(); });
    } else {
      note(60, 0, 170); note(64, 330, 170); note(67, 660, 430); note(72, 1250, 850); note(79, 2350, 1300);
      total = 3650 + 2300;
    }
    at(total, demoStop);
  }
  document.querySelectorAll("[data-demo]").forEach(b => b.addEventListener("click", () => demoPlay(b, b.dataset.demo)));
  document.getElementById("panic").addEventListener("click", demoStop);
  {
    const sm0 = setMode;
    setMode = function (mode) { demoStop(); const r = sm0(mode); document.getElementById("pLab").hidden = !betaOn || mode !== "keys"; return r; };
  }

  // FX Lab as a panel: the Beta "FX Lab" button now docks the effects above the keys
  // (Density, Lo-fi, Hall+, Freeze, Shimmer and both Motion LFOs); ⤢ Full opens the big sheet.
  const labRow = document.getElementById("labRow"), labStrip = document.getElementById("labStrip"), pLab = document.getElementById("pLab");
  function miniFader(container, label, get, put, fmt) {
    const el = document.createElement("div");
    el.className = "knob"; el.tabIndex = 0; el.setAttribute("role", "slider"); el.setAttribute("aria-orientation", "vertical");
    el.setAttribute("aria-label", label); el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
    el.innerHTML = `<div class="k-val"></div><div class="fader"><div class="ticks"></div><div class="fill"></div><div class="thumb"></div></div><div class="k-name"></div>`;
    el.lastChild.textContent = label; container.appendChild(el);
    const fader = el.querySelector(".fader"), fill = el.querySelector(".fill"), thumb = el.querySelector(".thumb"), val = el.querySelector(".k-val");
    const render = () => { const v = get(); fill.style.height = (v * 100) + "%"; el.style.setProperty("--v", (+v || 0).toFixed(3)); thumb.style.bottom = `calc(${v * 100}% * 0.9 + 5%)`; val.textContent = fmt ? fmt(v) : Math.round(v * 100); el.setAttribute("aria-valuenow", Math.round(v * 100)); };
    const set = v => { put(Math.min(1, Math.max(0, v))); render(); };
    let pid = null, startY = 0, startV = 0;
    el.addEventListener("pointerdown", e => {
      pid = e.pointerId; el.setPointerCapture(pid); e.preventDefault(); el.classList.add("active"); startY = e.clientY; startV = get();
      if (e.target.closest(".fader") && !KROT(el)) { const r = fader.getBoundingClientRect(); set(1 - (e.clientY - r.top - r.height * 0.05) / (r.height * 0.9)); startV = get(); }
    });
    el.addEventListener("pointermove", e => { if (e.pointerId !== pid) return; const r = fader.getBoundingClientRect(); set(startV + (startY - e.clientY) / (KROT(el) ? 160 : r.height * 0.9)); });
    const end = e => { if (e.pointerId === pid) { pid = null; el.classList.remove("active"); } };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", e => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { set(get() + 0.02); e.preventDefault(); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { set(get() - 0.02); e.preventDefault(); }
    });
    render(); return render;
  }
  function renderLab() {
    labStrip.innerHTML = "";
    const group = (title, isOn, toggle, build) => {
      const g = document.createElement("div"); g.className = "labgrp" + (isOn() ? "" : " off");
      const tg = document.createElement("button"); tg.className = "btn labtg"; tg.textContent = title; tg.setAttribute("aria-pressed", String(isOn()));
      tg.addEventListener("click", () => { toggle(); g.classList.toggle("off", !isOn()); tg.setAttribute("aria-pressed", String(isOn())); });
      const kn = document.createElement("div"); kn.className = "knobs lab"; build(kn); g.append(tg, kn); labStrip.appendChild(g);
    };
    BFX_ROWS.forEach(([onKey, title, sub, sliders]) => group(title, () => !!bfx[onKey], () => { bfx[onKey] = !bfx[onKey]; saveBfx(); applyBfx(onKey === "hallOn"); },
      kn => sliders.forEach(([k, label]) => miniFader(kn, label, () => bfx[k], v => { bfx[k] = v; saveBfx(); applyBfx(onKey === "hallOn"); }))));
    mo.lfo.forEach((L, i) => group("LFO " + (i + 1) + " · " + L.target, () => L.on, () => { L.on = !L.on; saveMo(); motionApply(); }, kn => {
      miniFader(kn, "Speed", () => L.rate, v => { L.rate = v; saveMo(); motionApply(); }, v => { const hz = rateHz(v); return hz < 1 ? (1 / hz).toFixed(hz < 0.1 ? 0 : 1) + "s" : hz.toFixed(1) + "Hz"; });
      miniFader(kn, "Depth", () => L.depth, v => { L.depth = v; saveMo(); motionApply(); });
    }));
  }
  {
    const sp0 = setPanel;
    setPanel = function (which) {
      if (which === "lab" && !betaOn) which = "fx";
      sp0(which);
      labRow.hidden = which !== "lab";
      pLab.setAttribute("aria-pressed", String(which === "lab"));
      if (which === "lab") renderLab();
      try { localStorage.setItem("nightbloom-lab", which === "lab" ? "1" : "0"); } catch (e) {}
    };
    pLab.addEventListener("click", () => setPanel("lab"));
    // the sheet and the strip edit the same settings, so keep the strip fresh after sheet changes
    const rf0 = renderFxLab; renderFxLab = function () { rf0(); if (!labRow.hidden) renderLab(); };
    const rm0 = renderMotion; renderMotion = function () { rm0(); if (!labRow.hidden) renderLab(); };
    const old = document.getElementById("betaFxBtn"), fresh = old.cloneNode(true); old.replaceWith(fresh);
    fresh.addEventListener("click", () => {
      start();
      if (state.mode !== "keys") document.getElementById("modeKeys").click();
      setPanel("lab");
      labRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    document.getElementById("labFull").addEventListener("click", () => { fxLab.hidden = false; renderFxLab(); });
    document.getElementById("labMotion").addEventListener("click", () => document.getElementById("moBtn").click());
    document.getElementById("fxLabDone").addEventListener("click", () => { if (!labRow.hidden) renderLab(); });
    document.getElementById("moDone").addEventListener("click", () => { if (!labRow.hidden) renderLab(); });
    onBeta(on => { pLab.hidden = !on || state.mode !== "keys"; if (!on && state.panel === "lab") setPanel("fx"); });
    pLab.hidden = !betaOn || state.mode !== "keys";
    let saved = ""; try { saved = localStorage.getItem("nightbloom-lab") || ""; } catch (e) {}
    if (saved === "1" && betaOn) setPanel("lab");
  }

  // ---------- Stop flushes effect tails ----------
  // Stop used to silence the voices but leave Freeze holding, the shimmer loop circulating and the
  // echo repeating. Now it also turns Freeze off and empties the feedback loops, then restores the
  // settings a moment later so the effects are ready for the next note.
  let tailT = 0;
  function killTails() {
    if (!ctx) return;
    const now = ctx.currentTime, zero = p => { try { p.cancelScheduledValues(now); } catch (e) {} p.setTargetAtTime(0, now, 0.01); };
    if (bfx.frzOn) { bfx.frzOn = false; saveBfx(); }
    if (BM) { zero(BM.shimSend.gain); zero(BM.shimFb.gain); zero(BM.shimWet.gain); zero(BM.frzWet.gain); BM.fbs.forEach(f => zero(f.gain)); zero(BM.frzSum.gain); }
    if (fx.fb) zero(fx.fb.gain);
    if (fx.echoOut) zero(fx.echoOut.gain);
    if (fx.verbOut) zero(fx.verbOut.gain);
    if (B && B.hallWet) zero(B.hallWet.gain);
    if (!labRow.hidden) renderLab(); if (!fxLab.hidden) renderFxLab();
    clearTimeout(tailT); tailsMuted = true;
    tailT = setTimeout(restoreTails, 4000);   // long enough for the old reverb tail to die inside the muted stages
  }
  let tailsMuted = false;
  function restoreTails() {
    clearTimeout(tailT); if (!tailsMuted || !ctx) return; tailsMuted = false;
    applyFx(); applyBfx(false);
  }
  document.getElementById("panic").addEventListener("click", killTails);
  {
    // the next thing you play brings the effects straight back
    const n0 = noteOn, h0 = toggleHeld, d0 = playDrum, s0 = startSeq;
    noteOn = function (m) { if (tailsMuted) restoreTails(); return n0(m); };
    toggleHeld = function (m) { if (tailsMuted) restoreTails(); return h0(m); };
    playDrum = function (id, t) { if (tailsMuted) restoreTails(); return d0(id, t); };
    startSeq = function () { if (tailsMuted) restoreTails(); return s0(); };
  }

  // ---------- Effects on/off and amount ----------
  // One switch bypasses every effect (Drive, Wobble, Echo, Space and the FX Lab stages) and one
  // Amount scales them all, from the Effects panel or the Mix sheet.
  FX_KNOBS.push(["amount", "Amount", 1]);
  if (state.fx.amount == null) state.fx.amount = 1;
  state.fx.on = state.fx.on !== false;
  const fxOn = () => state.fx.on !== false;
  const fxAmt = () => fxOn() ? Math.min(1, Math.max(0, state.fx.amount ?? 1)) : 0;
  {
    const af0 = applyFx;
    applyFx = function () {
      const real = state.fx, a = fxAmt();
      state.fx = Object.assign({}, real, { drive: real.drive * a, wobble: real.wobble * a, echo: real.echo * a, space: real.space * a });
      try { af0(); } finally { state.fx = real; }
      paintFxState();
    };
    const ab0 = applyBfx;
    applyBfx = function (rebuildIR) {
      const a = fxAmt(), on = fxOn();
      const keep = { densOn: bfx.densOn, lofiOn: bfx.lofiOn, hallOn: bfx.hallOn, frzOn: bfx.frzOn, shimOn: bfx.shimOn, dens: bfx.dens, hmix: bfx.hmix, frzMix: bfx.frzMix, shim: bfx.shim };
      if (!on) bfx.densOn = bfx.lofiOn = bfx.hallOn = bfx.frzOn = bfx.shimOn = false;
      else { bfx.dens = keep.dens * a; bfx.hmix = keep.hmix * a; bfx.frzMix = keep.frzMix * a; bfx.shim = keep.shim * a; }
      try { ab0(rebuildIR); } finally { Object.assign(bfx, keep); }
      // lo-fi has no amount of its own, so the FX amount blends it with the clean signal
      if (B && ctx && on && betaOn && bfx.lofiOn) { const t = ctx.currentTime; B.lofiWet.gain.setTargetAtTime(a, t, 0.03); B.lofiDry.gain.setTargetAtTime(1 - a, t, 0.03); }
    };
    // a rebuilt chain comes up with the unscaled settings; scale it again
    const bc0 = buildChain;
    buildChain = function () { bc0(); applyBfx(false); };
  }
  function setFxOn(on) {
    state.fx.on = !!on;
    if (!on && bfx.frzOn) { bfx.frzOn = false; saveBfx(); }   // nothing stays frozen while the effects are off
    if (ctx) { applyFx(); applyBfx(false); }
    save(); paintFxState();
    if (!mxEl.hidden) renderMixer();
    if (!labRow.hidden) renderLab(); if (!fxLab.hidden) renderFxLab();
  }
  const fxOnBtn = document.getElementById("fxOnBtn");
  function paintFxState() {
    const on = state.fx.on !== false;
    fxOnBtn.setAttribute("aria-pressed", String(on)); fxOnBtn.textContent = on ? "FX: On" : "FX: Off";
    appRoot.classList.toggle("fxoff", !on);
    const badge = document.getElementById("labOff"); if (badge) badge.hidden = on;
  }
  fxOnBtn.addEventListener("click", () => { start(); setFxOn(state.fx.on === false); });
  // Amount fader beside the other effect sliders
  fxKnobsEl.classList.add("six");
  makeKnob(fxKnobsEl, "amount", "Amount", () => state.fx, () => { if (ctx) { applyFx(); applyBfx(false); } });
  fxKnobsEl.lastChild.classList.add("amt");
  // Mix sheet: an Effects row with its own switch, right under Master volume
  {
    const rm0 = renderMixer;
    renderMixer = function () {
      rm0();
      const row = document.createElement("div"); row.className = "mx-row fxrow" + (state.fx.on === false ? " muted" : "");
      row.innerHTML = '<div class="mx-lab"><b>Effects</b><small>drive · wobble · echo · space · FX Lab</small></div><button class="btn" aria-pressed="true"></button><input type="range" min="0" max="100" aria-label="Effects amount"><span class="mx-val"></span>';
      const tg = row.querySelector("button"), r = row.querySelector("input"), val = row.querySelector(".mx-val");
      const show = () => { const on = state.fx.on !== false; tg.textContent = on ? "On" : "Off"; tg.setAttribute("aria-pressed", String(on)); row.classList.toggle("muted", !on); val.textContent = on ? Math.round(state.fx.amount * 100) : "off"; r.value = Math.round(state.fx.amount * 100); r.disabled = !on; };
      tg.addEventListener("click", () => { start(); setFxOn(state.fx.on === false); show(); });
      r.addEventListener("input", () => { state.fx.amount = r.value / 100; if (ctx) { applyFx(); applyBfx(false); } save(); show(); });
      r.addEventListener("dblclick", () => { state.fx.amount = 1; if (ctx) { applyFx(); applyBfx(false); } save(); show(); });
      show();
      const rows = [...mxList.querySelectorAll(".mx-row")], master = rows.find(x => /master volume/i.test(x.textContent));
      if (master) master.after(row); else mxList.prepend(row);
    };
  }
  paintFxState();
  if (ctx) { applyFx(); applyBfx(false); }

  // ---------- Tablet keyboard: three octaves on wide screens ----------
  {
    let lastCount = kbKeyCount(), rt = 0;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (kbKeyCount() !== lastCount) { lastCount = kbKeyCount(); buildKeys(); } }, 150);
    });
    // (and when the keyboard itself changes width: the strip, the wheels, a sheet beside it)
    try { new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (keysEl.classList.contains("pads") || keysEl.classList.contains("kit")) return; if (kbKeyCount() !== lastCount) { lastCount = kbKeyCount(); buildKeys(); } }, 150); }).observe(keysEl); } catch (e) {}
  }

  // ---------- Drummer: the beat changes by itself ----------
  // Varies whatever drum pattern is loaded in 16-bar phrases: fills every 4 bars, a big fill every 8,
  // breakdowns, half-time and busier hats. Nothing in the pattern itself is changed: hits are dropped
  // or added on the way to the drum machines, so the grid stays yours and Song mode still works.
  const DR_MODES = ["off", "gentle", "lively"];
  const drummer = { mode: "off" };
  try { const m = localStorage.getItem("nightbloom-drummer"); if (DR_MODES.includes(m)) drummer.mode = m; } catch (e) {}
  const DR_PHRASES = {
    gentle: ["base", "base", "base", "fill", "base", "hats", "base", "bigfill", "lite", "lite", "base", "fill", "hats", "hats", "half", "bigfill"],
    lively: ["base", "hats", "base", "fill", "hats", "hats", "half", "bigfill", "sparse", "lite", "hats", "fill", "base", "hats", "hats", "bigfill"],
  };
  const DR_NAMES = { base: "groove", hats: "busy hats", fill: "fill", bigfill: "big fill", lite: "breakdown", sparse: "kick and hats", half: "half time" };
  let drBar = -1, drPlan = null, drStep = null, drBypass = false, drCrash = false;
  function drPlanBar(bar) {
    const N = stepsNow(), starts = [...beatStarts()].sort((a, b) => a - b), last = starts[starts.length - 1];
    const prev = starts.length > 1 ? starts[starts.length - 2] : last;
    const half = starts.length >= 3 ? starts[Math.floor(starts.length / 2)] : last;   // the backbeat
    const phrase = DR_PHRASES[drummer.mode] || DR_PHRASES.gentle;
    let kind = phrase[bar % phrase.length];
    if (drummer.mode === "lively" && !["fill", "bigfill"].includes(kind) && Math.random() < 0.2) kind = ["hats", "half", "base"][Math.floor(Math.random() * 3)];
    const plan = { kind, drop: () => false, extra: Array.from({ length: N }, () => []), crash: drCrash };
    drCrash = false;
    const TOP = ["snare", "clap", "tom", "rim", "cow"], SN = ["snare", "clap"];
    const evenHats = () => { for (let s = 0; s < N; s += 2) plan.extra[s].push(["ch", 1, true]); };
    if (kind === "hats") { evenHats(); plan.extra[Math.max(0, N - 2)].push(["oh", 1, false]); }
    else if (kind === "lite") plan.drop = (id, s) => TOP.includes(id) || (id === "kick" && !starts.includes(s));
    else if (kind === "sparse") { plan.drop = (id, s) => !(id === "kick" && s === 0) && id !== "ch"; evenHats(); }
    else if (kind === "half") plan.drop = (id, s) => SN.includes(id) && s !== half;
    else if (kind === "fill") {
      plan.drop = (id, s) => s >= last && (id === "ch" || id === "oh");
      for (let s = last; s < N; s++) plan.extra[s].push(["snare", s === N - 1 ? 2 : 1, false]);
    } else if (kind === "bigfill") {
      plan.drop = (id, s) => s >= prev && ["ch", "oh", "kick", "clap", "snare"].includes(id);
      for (let s = prev; s < last; s++) plan.extra[s].push([(s - prev) % 2 ? "tom" : "snare", 1, false]);
      for (let s = last; s < N; s++) plan.extra[s].push([s === N - 1 ? "snare" : (s - last) % 2 ? "snare" : "tom", s === N - 1 ? 3 : 1, false]);
      drCrash = true;   // the next bar opens with the open hat
    }
    if (plan.crash) { plan.extra[0].push(["oh", 1, false]); const d0 = plan.drop; plan.drop = (id, s) => d0(id, s) || (s === 0 && id === "ch"); }
    return plan;
  }
  const drNow = document.getElementById("drummerNow"), drBarEl = document.getElementById("drummerBar");
  function drPaint() {
    drBarEl.querySelectorAll("button[data-dr]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dr === drummer.mode)));
    if (drummer.mode === "off") drNow.textContent = "the beat changes by itself: fills, breakdowns, half-time";
    else if (playing && drPlan) drNow.textContent = "bar " + (drBar + 1) + " · " + (drPlan.crash ? "crash · " : "") + DR_NAMES[drPlan.kind];
    else drNow.textContent = drummer.mode === "gentle" ? "fills every 4 bars, a breakdown every 8" : "busier: more hats, half-time and surprises";
  }
  {
    const ss0 = scheduleStep, pd0 = playDrum, st0 = startSeq, sp0 = stopSeq;
    scheduleStep = function (s, t) {
      const on = drummer.mode !== "off";
      if (on) { if (s === 0 || !drPlan) { drBar = s === 0 ? drBar + 1 : Math.max(0, drBar); drPlan = drPlanBar(drBar); drPaint(); } drStep = s; }
      try { ss0(s, t); } finally { drStep = null; }
      if (on && drPlan && drPlan.extra[s]) {
        drBypass = true;
        try {
          for (const [id, r, onlyIfEmpty] of drPlan.extra[s]) {
            if (onlyIfEmpty && state.seq.rows[id] && state.seq.rows[id][s]) continue;
            for (let k = 0; k < r; k++) pd0(id, t + k * stepDur() / r);
          }
        } finally { drBypass = false; }
      }
    };
    playDrum = function (id, t) {
      if (drStep != null && !drBypass && drPlan && drummer.mode !== "off" && drPlan.drop(id, drStep)) return;
      return pd0(id, t);
    };
    startSeq = function () { if (!playing) { drBar = -1; drPlan = null; drCrash = false; } const r = st0(); drPaint(); return r; };
    stopSeq = function () { const r = sp0(); drPaint(); return r; };
    const sm0 = setMode;
    setMode = function (mode) { const r = sm0(mode); drBarEl.hidden = state.mode !== "seq"; return r; };
    drBarEl.hidden = state.mode !== "seq";
  }
  drBarEl.querySelectorAll("button[data-dr]").forEach(b => b.addEventListener("click", () => {
    drummer.mode = b.dataset.dr; try { localStorage.setItem("nightbloom-drummer", drummer.mode); } catch (e) {}
    if (drummer.mode === "off") { drPlan = null; } else if (playing && !drPlan) { drBar = Math.max(0, drBar); drPlan = drPlanBar(drBar); }
    drPaint();
  }));
  drPaint();

