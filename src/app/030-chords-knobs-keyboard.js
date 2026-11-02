  // ---------- Chords ----------
  const CHORDS = [
    ["off", "Single notes", [0]], ["maj", "Major", [0, 4, 7]], ["min", "Minor", [0, 3, 7]],
    ["sus2", "Sus2", [0, 2, 7]], ["sus4", "Sus4", [0, 5, 7]], ["maj7", "Major 7", [0, 4, 7, 11]],
    ["min7", "Minor 7", [0, 3, 7, 10]], ["dom7", "Dominant 7", [0, 4, 7, 10]], ["add9", "Add 9", [0, 4, 7, 14]],
    ["min9", "Minor 9", [0, 3, 7, 10, 14]], ["maj9", "Major 9", [0, 4, 7, 11, 14]], ["pow", "Power (5th)", [0, 7, 12]],
    ["oct", "Octaves", [0, 12]], ["quart", "Stacked 4ths", [0, 5, 10, 15]],
  ];
  let chordType = "off";
  try { const c = localStorage.getItem("nightbloom-chord"); if (CHORDS.some(x => x[0] === c)) chordType = c; } catch (e) {}
  const chordTones = root => (CHORDS.find(c => c[0] === chordType) || CHORDS[0])[2].map(i => root + i).filter(m => m <= 108);

  // One key press on whatever sound is selected right now: a single note or a whole chord
  let NB_VEL7 = 100;   // the note's MIDI velocity (1–127): picks the velocity layer where a sound has them
  let NB_VEL = 1;   // the level of the note being played: MIDI velocity, 1 from the screen and the computer keyboard
  function makeNote(root) {
    const tones = chordTones(root), scale = NB_VEL / Math.sqrt(tones.length);
    const parts = [];
    for (const m of tones) {
      if (state.engine === "samp") { const v = makeSampleVoice(m, state.samp.slot, undefined, scale); if (v) parts.push(v); }
      else if (state.engine === "inst") { const v = makeInstVoice(m, undefined, scale); if (v) parts.push(v); }
      else if (state.engine === "lib") parts.push(...libVoices(m, undefined, scale));
      else parts.push(...layerVoices(m, undefined, scale));
    }
    return { tones, stop() { parts.forEach(x => x.stop()); } };
  }

  // Held notes live apart from played notes, so you can play over a drone,
  // and they keep the sound they were held with even if you switch engines.
  const heldVoices = new Map();
  const MAX_HELD = 16;
  const heldCount = () => { let n = 0; heldVoices.forEach(v => { n += v.tones.length; }); return n; };
  const markTones = (tones, fn, on) => tones.forEach(m => fn(m, on));
  function dropHeld(root) {
    const v = heldVoices.get(root); if (!v) return;
    v.stop(); heldVoices.delete(root); markTones(v.tones, markHeld, false);
  }
  function toggleHeld(root) {
    if (!ctx) return;
    if (heldVoices.has(root)) dropHeld(root);
    else {
      const v = makeNote(root);
      heldVoices.set(root, v);
      // over 16 held notes: let go of the oldest held notes or chords first
      for (const k of [...heldVoices.keys()]) { if (heldCount() <= MAX_HELD || k === root) break; dropHeld(k); }
      markTones(v.tones, markHeld, true);
    }
    heldVoices.forEach(v => markTones(v.tones, markHeld, true));
    updateHoldBtn();
  }
  function releaseHeld() {
    [...heldVoices.keys()].forEach(dropHeld);
    updateHoldBtn();
  }

  function noteOn(midi) {
    if (!ctx) return;
    SUS.held.delete(midi);
    if (voices.has(midi)) noteOff(midi);
    const v = makeNote(midi);
    voices.set(midi, v); order.push(midi);
    while (voices.size > MAX_VOICES) {
      const oldest = order.shift();
      if (voices.has(oldest)) { const o = voices.get(oldest); o.stop(); voices.delete(oldest); markTones(o.tones, markKey, false); }
    }
    markTones(v.tones, markKey, true);
  }
  function noteOff(midi) {
    const v = voices.get(midi);
    if (v) { v.stop(); voices.delete(midi); markTones(v.tones, markKey, false); }
    const i = order.indexOf(midi); if (i >= 0) order.splice(i, 1);
    // keep keys lit that another sounding chord still uses
    voices.forEach(o => markTones(o.tones, markKey, true));
  }
  function allOff() { [...voices.keys()].forEach(noteOff); releaseHeld(); }

  // ---------- Knobs ----------
  const isSampObj = obj => state.samp.slots.some(x => x.p === obj);
  function display(key, v, obj) {
    const hzOf = x => { const hz = expMap(x, 250, 20000); return hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz) + ""; };
    const semis = x => { const st = Math.round((x - 0.5) * 24); return (st > 0 ? "+" : "") + st + " st"; };
    if (state.pads.p.includes(obj)) {
      const pb = padBuf[state.pads.sel], pd = pb ? pb.duration : 0;
      if (key === "pitch") return semis(v);
      if (key === "start") return (v * pd * 0.98).toFixed(2) + "s";
      if (key === "length") return Math.round(v * 100) + "%";
      if (key === "tone") return hzOf(v);
      return Math.round(v * 100) + "";
    }
    if (state.drumPads && Object.values(state.drumPads).includes(obj)) {
      if (key === "pitch") return semis(v);
      if (key === "length") return "×" + Math.pow(2, (v - 0.5) * 4).toFixed(2);
      return Math.round(v * 100) + "";
    }
    if (obj === state.lib.p) {
      if (key === "tune") return semis(v);
      if (key === "tone") return hzOf(v);
      if (key === "attack") return fmtTime(v <= 0.001 ? 0.003 : expMap(v, 0.003, 4));
      if (key === "decay") return v >= 0.99 ? "Hold" : fmtTime(expMap(v, 0.12, 8));
      if (key === "release") return fmtTime(expMap(v, 0.03, 8));
      return Math.round(v * 100) + "";
    }
    if (obj === state.inst.p) {
      if (key === "tune") return semis(v);
      if (key === "tone") return hzOf(v);
      if (key === "attack") return fmtTime(v <= 0.001 ? 0.003 : expMap(v, 0.003, 4));
      if (key === "release") return fmtTime(expMap(v, 0.03, 8));
      return Math.round(v * 100) + "";
    }
    if (isSampObj(obj)) {
      const buf = sampBuf[state.samp.slot], dur = buf ? buf.duration : 0;
      if (key === "start" || key === "pos") return (v * dur).toFixed(1) + "s";
      if (key === "tone") { const hz = expMap(v, 250, 20000); return hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz) + ""; }
      if (key === "fade") return fmtTime(expMap(v, 0.02, 3));
      if (key === "size") return fmtTime(expMap(v, 0.02, 0.5));
      if (key === "density") return Math.round(expMap(v, 4, 60)) + "/s";
      if (key === "scan") return (v * v * 1.5).toFixed(2) + "×";
      if (key === "slices") return SLICE_COUNTS[Math.round(v * (SLICE_COUNTS.length - 1))] + "";
      if (key === "sens") return v < 0.01 ? "Even" : "Hits " + Math.round(v * 100);
      if (key === "eGlide") return "+" + Math.round(v * 24) + " st";
      if (key === "eWah") { const hz = 300 * Math.pow(2, 0.5 + 3 * v); return hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz) + ""; }
      if (key === "eGrowl") return Math.round(12 + 40 * v) + "Hz";
      if (key === "eBlend") return v < 0.02 ? "sample" : v > 0.98 ? "elephant" : Math.round(v * 100) + "%";
      if (key === "eLen") return window.__live30 ? fmtTime(__live30.eleShapeLen(state.samp.slot, 1)) : "×" + Math.pow(4, 2 * v - 1).toFixed(2);
      if (key === "eDb") { const db = -24 + 36 * v; return (db > 0 ? "+" : "") + db.toFixed(1) + " dB"; }
      return Math.round(v * 100) + "";
    }
    if (obj === state.drum) {
      if (key === "tune") return Math.round(40 + v * 25) + "Hz";
      if (key === "boom") return fmtTime(expMap(v, 0.15, 1.6));
      return Math.round(v * 100) + "";
    }
    if (key === "vowel") return ["A", "E", "I", "O", "U"][Math.round(v * 4)];
    if (state.engine === "juno" || obj === state.params.juno) {   // 168: the 106's switches
      if (key === "chorus") return v < 0.12 ? "Off" : v < 0.55 ? "I" : v < 0.88 ? "II" : "I+II";
      if (key === "dco") return v < 0.2 ? "Saw" : v < 0.45 ? "Saw+Pls" : v < 0.7 ? "Pulse" : v < 0.9 ? "Pls+Sub" : "Sub+Nse";
      if (key === "hpf") return v < 0.2 ? "Off" : v < 0.5 ? "1" : v < 0.8 ? "2" : "3";
    }
    if (key === "material") return v < 0.25 ? "Kalimba" : v < 0.75 ? "Bell" : "Glass";
    if (key === "ring") return fmtTime(expMap(v, 0.3, 8));
    if (key === "swell") return fmtTime(expMap(v, 0.03, 1.5));
    if (key === "morph") return ["Glass", "Warm", "Hollow", "Vocal", "Bright"][Math.round(v * 4)];
    if (key === "attack") return fmtTime(expMap(v, 0.004, 4));
    if (key === "release") return fmtTime(expMap(v, 0.05, 6));
    if (key === "decay") return fmtTime(expMap(v, 0.08, 6));
    if (key === "cutoff") { const hz = state.engine === "analog" ? expMap(v, 120, 9000) : expMap(v, 180, 14000); return hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz) + ""; }
    return Math.round(v * 100) + "";
  }
  function fmtTime(s) { return s < 1 ? Math.round(s * 1000) + "ms" : s.toFixed(1) + "s"; }

  // a control on one of the MiniLab's knobs is drawn as a knob (134): turned by dragging, not jumped to where you touch
  function KROT(el) { return el.classList.contains("ml-b") && /^K/.test(el.getAttribute("data-ml") || ""); }
  function makeKnob(container, key, label, getObj, onChange) {
    const el = document.createElement("div");
    el.className = "knob"; el.tabIndex = 0; el.setAttribute("role", "slider");
    el.setAttribute("aria-orientation", "vertical");
    el.setAttribute("aria-label", label); el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
    el.innerHTML = `<div class="k-val"></div><div class="fader"><div class="ticks"></div><div class="fill"></div><div class="thumb"></div></div><div class="k-name">${label}</div>`;
    container.appendChild(el);
    const fader = el.querySelector(".fader"), fill = el.querySelector(".fill"), thumb = el.querySelector(".thumb"), val = el.querySelector(".k-val");
    function render() {
      const v = getObj()[key];
      fill.style.height = (v * 100) + "%"; el.style.setProperty("--v", (+v || 0).toFixed(3));
      thumb.style.bottom = `calc(${v * 100}% * 0.9 + 5%)`;
      val.textContent = display(key, v, getObj());
      el.setAttribute("aria-valuenow", Math.round(v * 100));
    }
    function set(v) { getObj()[key] = Math.min(1, Math.max(0, v)); render(); onChange(); save(); }
    el.__nbSet = set; el.__nbGet = () => getObj()[key];
    function fromY(y) {
      const r = fader.getBoundingClientRect();
      return 1 - (y - r.top - r.height * 0.05) / (r.height * 0.9);
    }
    let pid = null, startY = 0, startV = 0, moved = false;
    el.addEventListener("pointerdown", e => {
      pid = e.pointerId; el.setPointerCapture(pid); e.preventDefault();
      el.classList.add("active"); moved = false;
      startY = e.clientY; startV = getObj()[key];
      // tapping on the fader jumps there; grabbing the label area nudges relatively
      if (e.target.closest(".fader") && !KROT(el)) set(fromY(e.clientY)), startV = getObj()[key];
    });
    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return;
      moved = true;
      const r = fader.getBoundingClientRect();
      set(startV + (startY - e.clientY) / (KROT(el) ? 160 : r.height * 0.9));
    });
    const end = e => { if (e.pointerId === pid) { pid = null; el.classList.remove("active"); } };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", () => set(defaults(key)));
    el.addEventListener("keydown", e => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { set(getObj()[key] + 0.02); e.preventDefault(); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { set(getObj()[key] - 0.02); e.preventDefault(); }
    });
    function defaults(k) {
      const obj = getObj();
      const list = obj === state.fx ? FX_KNOBS : obj === state.drum ? DRUM_KNOBS
        : isSampObj(obj) ? [...SAMP_PLAY_KNOBS, ...SAMP_GRAIN_KNOBS, ...SAMP_SLICE_KNOBS]
        : Object.values(state.drumPads).includes(obj) ? DRUM_PAD_KNOBS
        : state.pads.p.includes(obj) ? PAD_KNOBS : obj === state.inst.p ? INST_KNOBS : obj === state.lib.p ? LIB_KNOBS : ENGINES[state.engine].knobs;
      if (k === "level" && obj !== state.drum && !isSampObj(obj)) return 0.8;
      const d = list.find(x => x[0] === k); return d ? d[2] : 0.5;
    }
    render();
    return render;
  }

  const engineKnobsEl = document.getElementById("engineKnobs");
  let keysReady = false;
  function renderEngine() {
    if (!["drum", "pads"].includes(state.engine)) state.melodic = state.engine;
    if (["pads", "inst", "lib"].includes(state.engine)) { if (moreReady) renderMore(); updateSoundBar(); return; }
    document.getElementById("padbar").hidden = true; document.getElementById("instbar").hidden = true; document.getElementById("libbar").hidden = true;
    document.getElementById("drbar").hidden = state.engine !== "drum";
    const isDrum = state.engine === "drum", isSamp = state.engine === "samp";
    const e = isDrum ? DRUM : isSamp ? SAMP : ENGINES[state.engine];
    document.getElementById("engineLabel").textContent = isSamp
      ? "Sampler · " + ({ grain: "granular", play: "playback", slice: "slices", elephant: "elephant" })[state.samp.slots[state.samp.slot].mode] : e.name;
    const after = document.getElementById("engineAfter");
    after.classList.remove("err");
    after.textContent = isSamp ? (state.samp.slots[state.samp.slot].name || "Slot S" + (state.samp.slot + 1) + " is empty") : e.after;
    document.getElementById("sbar").hidden = !isSamp;
    engineKnobsEl.innerHTML = "";
    if (isSamp) {
      const slot = state.samp.slots[state.samp.slot];
      (slot.mode === "grain" ? SAMP_GRAIN_KNOBS : slot.mode === "slice" ? SAMP_SLICE_KNOBS : slot.mode === "elephant" ? SAMP_ELE_KNOBS : SAMP_PLAY_KNOBS)
        .forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.samp.slots[state.samp.slot].p, () => {}));
      refreshSamplesUI();
    } else if (isDrum) {
      if (more3Ready) renderDrumPanel();
      else DRUM_KNOBS.forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.drum, applyDrum));
    } else {
      e.knobs.forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.params[state.engine], () => {}));
      makeKnob(engineKnobsEl, "level", "Level", () => state.layers[state.engine], () => {});
    }
    document.querySelectorAll(".tab").forEach(t => {
      t.setAttribute("aria-pressed", String(t.dataset.engine === state.engine));
      t.classList.toggle("on", !!(state.layers[t.dataset.engine] && state.layers[t.dataset.engine].on));
    });
    document.querySelectorAll(".pwr").forEach(b => b.setAttribute("aria-pressed", String(state.layers[b.dataset.engine].on)));
    if (keysReady) buildKeys();
    updateSoundBar();
  }
  const tabsEl = document.getElementById("tabs");
  for (const [id, e] of Object.entries(ENGINES)) {
    const wrap = document.createElement("div"); wrap.className = "tabwrap";
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.engine = id;
    b.innerHTML = `${e.short}<small>${TAB_SUB[id] || ""}</small>`;
    b.addEventListener("click", () => {
      state.engine = id;
      // editing an engine while nothing else is stacked makes it the sound you hear
      const anyOther = Object.keys(ENGINES).some(x => x !== id && state.layers[x].on);
      if (!anyOther) { for (const x in state.layers) state.layers[x].on = x === id; }
      renderEngine(); save();
    });
    const pwr = document.createElement("button");
    pwr.className = "pwr"; pwr.dataset.engine = id; pwr.setAttribute("aria-label", "Stack " + e.name);
    pwr.addEventListener("click", ev => {
      ev.stopPropagation();
      const L = state.layers[id];
      const count = Object.values(state.layers).filter(x => x.on).length;
      if (L.on && count === 1) return; // keep at least one engine sounding
      L.on = !L.on;
      if (L.on) state.engine = id;
      renderEngine(); save();
    });
    wrap.append(b, pwr);
    tabsEl.appendChild(wrap);
  }
  {
    const wrap = document.createElement("div"); wrap.className = "tabwrap";
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.engine = "drum";
    b.innerHTML = `${DRUM.short}<small>808·909·78</small>`;
    b.addEventListener("click", () => { state.engine = "drum"; renderEngine(); save(); });
    wrap.append(b);
    tabsEl.appendChild(wrap);
  }
  {
    const wrap = document.createElement("div"); wrap.className = "tabwrap";
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.engine = "samp";
    b.innerHTML = `Sampler<small>8 slots</small>`;
    b.addEventListener("click", () => { state.engine = "samp"; renderEngine(); save(); });
    wrap.append(b);
    tabsEl.appendChild(wrap);
  }
  const slotsEl = document.getElementById("slots");
  for (let i = 0; i < NSLOTS; i++) {
    const b = document.createElement("button");
    b.className = "slot"; b.textContent = "S" + (i + 1); b.dataset.slot = i;
    b.addEventListener("click", () => { state.samp.slot = i; renderEngine(); save(); });
    slotsEl.appendChild(b);
  }
  function refreshSamplesUI() {
    slotsEl.querySelectorAll(".slot").forEach((b, i) => {
      b.classList.toggle("has", !!sampBuf[i]);
      b.setAttribute("aria-pressed", String(i === state.samp.slot));
    });
    const md = state.samp.slots[state.samp.slot].mode;
    document.getElementById("mPlay").setAttribute("aria-pressed", String(md === "play"));
    document.getElementById("mGrain").setAttribute("aria-pressed", String(md === "grain"));
    document.getElementById("mSlice").setAttribute("aria-pressed", String(md === "slice"));
    document.getElementById("mEle").setAttribute("aria-pressed", String(md === "elephant"));
    if (state.engine === "samp") {
      const after = document.getElementById("engineAfter");
      if (!after.classList.contains("err"))
        after.textContent = state.samp.slots[state.samp.slot].name || "Slot S" + (state.samp.slot + 1) + " is empty";
    }
    if (typeof buildSeq === "function" && seqBuilt) buildSeq();
  }
  function setSampMode(m) { state.samp.slots[state.samp.slot].mode = m; renderEngine(); save(); }
  document.getElementById("mPlay").addEventListener("click", () => setSampMode("play"));
  document.getElementById("mGrain").addEventListener("click", () => setSampMode("grain"));
  document.getElementById("mSlice").addEventListener("click", () => setSampMode("slice"));
  document.getElementById("mEle").addEventListener("click", () => setSampMode("elephant"));
  const fileIn = document.getElementById("fileIn");
  document.getElementById("loadBtn").addEventListener("click", () => { start(); fileIn.click(); });
  fileIn.addEventListener("change", async () => {
    const file = fileIn.files && fileIn.files[0]; fileIn.value = "";
    if (!file) return;
    const i = state.samp.slot, after = document.getElementById("engineAfter");
    after.classList.remove("err"); after.textContent = "Loading " + file.name + "…";
    try {
      const data = await file.arrayBuffer();
      let buf = await decode(data.slice(0)), nm = file.name, stored = data;
      if (buf.duration > PICK_OVER_SEC) {
        after.textContent = "Choose the part you want…";
        const r = await chooseSection(buf, file.name);
        if (!r) { renderEngine(); return; }
        buf = r.buf; nm = r.name; if (!r.whole) stored = bufferToWav(buf);
      }
      buf = trimBuffer(buf);
      setSample(i, buf, nm);
      if (state.samp.slots[i].mode === "grain") state.samp.slots[i].mode = "play";   // a new file plays as it is; Grain stays a choice
      storeSample(i, state.samp.slots[i].name, stored);
      renderEngine(); save();
    } catch (e) {
      after.classList.add("err");
      after.textContent = "Couldn't read " + file.name + ". Try a WAV or MP3.";
    }
  });
  const fxKnobsEl = document.getElementById("fxKnobs");
  FX_KNOBS.forEach(([k, label]) => makeKnob(fxKnobsEl, k, label, () => state.fx, applyFx));
  renderEngine();

  // ---------- Keyboard ----------
  const keysEl = document.getElementById("keys");
  const BASE = 48; // C3
  const keyEls = new Map(); // midi -> element
  const NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  const padEls = new Map();
  function buildPads() {
    keysEl.innerHTML = ""; keyEls.clear(); padEls.clear();
    keysEl.classList.add("pads"); keysEl.classList.remove("kit");
    DRUMS.forEach(([id, code, name]) => {
      const k = document.createElement("div"); k.className = "pad"; k.dataset.drum = id;
      k.innerHTML = `<span>${code}</span><small>${name}</small>`;
      keysEl.appendChild(k); padEls.set(id, k);
    });
  }
  const padTimers = new Map();
  function flashPad(id, t) {
    const el = padEls.get(id); if (!el) return;
    const delay = Math.max(0, (t - ctx.currentTime) * 1000);
    clearTimeout(padTimers.get(id));
    padTimers.set(id, setTimeout(() => {
      el.classList.add("down");
      padTimers.set(id, setTimeout(() => el.classList.remove("down"), 110));
    }, delay));
  }
  // the keys use the tablet's width (133): as many octaves as fit at 40 px or more a white key, two to five
  // (phones: two octaves)
  const kbKeyCount = () => {
    if (window.innerWidth <= 600) return 25;
    const w = keysEl.getBoundingClientRect().width;
    if (!(w > 0)) return window.innerWidth >= 1100 ? 37 : 25;
    return Math.max(2, Math.min(5, Math.floor((w / 40 - 1) / 7))) * 12 + 1;
  };
  function buildKeys() {
    document.getElementById("wheels").hidden = state.engine === "drum" || state.engine === "pads";
    if (state.engine === "drum") return buildPads();
    if (state.engine === "pads") return buildKitPads();
    keysEl.classList.remove("pads", "kit"); padEls.clear();
    keysEl.innerHTML = ""; keyEls.clear();
    const start = BASE + state.octave * 12, count = kbKeyCount();
    const whites = [];
    for (let m = start; m < start + count; m++) if (![1,3,6,8,10].includes(m % 12)) whites.push(m);
    const wPct = 100 / whites.length;
    whites.forEach(m => {
      const k = document.createElement("div"); k.className = "w"; k.dataset.midi = m;
      if (m % 12 === 0) k.textContent = "C" + (Math.floor(m / 12) - 1);
      keysEl.appendChild(k); keyEls.set(m, k);
    });
    for (let m = start; m < start + count; m++) {
      if (![1,3,6,8,10].includes(m % 12)) continue;
      const leftWhite = whites.indexOf(m - 1);
      const k = document.createElement("div"); k.className = "b"; k.dataset.midi = m;
      k.style.left = `calc(${(leftWhite + 1) * wPct}% - ${wPct * 0.31}%)`;
      k.style.width = `${wPct * 0.62}%`;
      keysEl.appendChild(k); keyEls.set(m, k);
    }
    document.getElementById("octLabel").textContent = "C" + (Math.floor(start / 12) - 1);
    if (more2Ready) decorateZones();
    try { kbLabel(); } catch (e) {}   // (not ready yet during the first build)
    voices.forEach(v => markTones(v.tones, markKey, true));
    heldVoices.forEach(v => markTones(v.tones, markHeld, true));
  }
  function markKey(m, on) { const k = keyEls.get(m); if (k) k.classList.toggle("down", on); }
  function markHeld(m, on) { const k = keyEls.get(m); if (k) k.classList.toggle("held", on); }

  const touches = new Map(); // pointerId -> midi
  function midiAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.dataset && el.dataset.midi ? Number(el.dataset.midi) : null;
  }
  function press(m) {
    if (zoneKey(m)) return;
    if (state.hold) toggleHeld(m);
    else noteOn(m);
  }
  function release(m) { if (!state.hold) nbSusOff(m); }
  const SUS = { on: false, held: new Set() };
  function nbSusOff(m) { if (SUS.on && voices.has(m)) { SUS.held.add(m); return; } noteOff(m); }
  function nbSustain(on) {
    if (SUS.on === on) return; SUS.on = on;
    if (!on) { const h = [...SUS.held]; SUS.held.clear(); h.forEach(m => noteOff(m)); }
  }

  keysEl.addEventListener("pointerdown", e => {
    e.preventDefault();
    const pad = e.target.closest && e.target.closest(".pad");
    if (pad) {
      if (pad.dataset.kit != null) kitPadDown(Number(pad.dataset.kit));
      else {
        if (more3Ready && state.drumSel !== pad.dataset.drum) { state.drumSel = pad.dataset.drum; renderDrumPanel(); save(); }
        if (ctx) playDrum(pad.dataset.drum, ctx.currentTime);
      }
      return;
    }
    keysEl.setPointerCapture(e.pointerId);
    const m = midiAt(e.clientX, e.clientY);
    touches.set(e.pointerId, m);
    if (m != null) press(m);
  });
  keysEl.addEventListener("pointermove", e => {
    if (!touches.has(e.pointerId) || state.hold) return;
    const m = midiAt(e.clientX, e.clientY), prev = touches.get(e.pointerId);
    if (m !== prev && m != null) {
      if (prev != null) release(prev);
      if (m != null) noteOn(m);
      touches.set(e.pointerId, m);
    }
  });
  const lift = e => {
    if (!touches.has(e.pointerId)) return;
    const m = touches.get(e.pointerId); touches.delete(e.pointerId);
    if (m != null) release(m);
  };
  keysEl.addEventListener("pointerup", lift);
  keysEl.addEventListener("pointercancel", lift);

  // Computer keyboard (Bluetooth or USB), by key position so any layout works. Two manuals, 37 keys from the left edge
  // of the keys: the Z row plays the white keys with the A row as their black keys; the Q row carries on from F with
  // the number row as its black keys. Each black key's letter sits between its two white keys' letters.
  const KB_MAP = [["KeyZ","Z","z"],["KeyS","S","s"],["KeyX","X","x"],["KeyD","D","d"],["KeyC","C","c"],["KeyV","V","v"],["KeyG","G","g"],["KeyB","B","b"],["KeyH","H","h"],["KeyN","N","n"],["KeyJ","J","j"],["KeyM","M","m"],
    ["Comma",",",","],["KeyL","L","l"],["Period",".","."],["Semicolon",";",";"],["Slash","/","/"],
    ["KeyQ","Q","q"],["Digit2","2","2"],["KeyW","W","w"],["Digit3","3","3"],["KeyE","E","e"],["Digit4","4","4"],["KeyR","R","r"],["KeyT","T","t"],["Digit6","6","6"],["KeyY","Y","y"],["Digit7","7","7"],["KeyU","U","u"],
    ["KeyI","I","i"],["Digit9","9","9"],["KeyO","O","o"],["Digit0","0","0"],["KeyP","P","p"],["Minus","−","-"],["BracketLeft","[","["],["BracketRight","]","]"]];
  // Musical Typing, as in GarageBand: A is C, the home row the white keys, W E T Y U O P the black keys
  const KB_MT = [["KeyA","A","a"],["KeyW","W","w"],["KeyS","S","s"],["KeyE","E","e"],["KeyD","D","d"],["KeyF","F","f"],["KeyT","T","t"],["KeyG","G","g"],["KeyY","Y","y"],["KeyH","H","h"],["KeyU","U","u"],["KeyJ","J","j"],
    ["KeyK","K","k"],["KeyO","O","o"],["KeyL","L","l"],["KeyP","P","p"],["Semicolon",";",";"],["Quote","'","'"]];
  // and the drums: A kick, S snare, D clap, F hat, H open hat, J tom, W rim, E cowbell (the Garage's keys)
  const DRC_MT = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyW", "KeyE"], DRL_MT = "ASDFHJWE".split(""), DRK_MT = "asdfhjwe".split("");
  let KB_LAYOUT = "mt"; try { KB_LAYOUT = localStorage.getItem("nightbloom-kblayout") === "two" ? "two" : "mt"; } catch (e) {}
  let KBC, KBL, KBKS, kbVel = 0.8;
  function kbUse(l) { KB_LAYOUT = l === "two" ? "two" : "mt"; const M = KB_LAYOUT === "two" ? KB_MAP : KB_MT; KBC = M.map(x => x[0]); KBL = M.map(x => x[1]); KBKS = M.map(x => x[2]); }
  kbUse(KB_LAYOUT);
  // drum machine and Pads: the left-hand block, in the same grid as the pads on screen
  const PADC = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF", "KeyZ", "KeyX", "KeyC", "KeyV"], PADL = "QWERASDFZXCV".split(""), PADK = "qwerasdfzxcv".split("");
  const kbDown = new Map();   // key -> the note it started (null for a drum or pad hit)
  let KBD_LABELS = null; try { const v = localStorage.getItem("nightbloom-kbd"); KBD_LABELS = v == null ? null : v === "1"; } catch (e) {}
  if (KBD_LABELS === null) { try { if (matchMedia("(any-pointer: fine)").matches) KBD_LABELS = true; } catch (e) {} }   // a mouse or touchpad: likely a keyboard too
  const kbPadMode = () => state.engine === "drum" || state.engine === "pads";
  const kbIdx = e => {
    const [C, K] = state.engine === "drum" && KB_LAYOUT === "mt" ? [DRC_MT, DRK_MT] : kbPadMode() ? [PADC, PADK] : [KBC, KBKS];
    const i = C.indexOf(e.code); return i >= 0 ? i : (e.code ? -1 : K.indexOf((e.key || "").toLowerCase()));
  };
  const kbBusy = e => {
    const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return true;
    return !!document.querySelector(".editor:not([hidden]), .browser:not([hidden]), .trk:not([hidden]), #start:not([hidden])");
  };
  const kbSeen = () => { if (KBD_LABELS !== null) return; KBD_LABELS = true; try { localStorage.setItem("nightbloom-kbd", "1"); } catch (e) {} document.body.classList.add("kbd"); kbLabel(); };
  window.__kbSeen = kbSeen;
  function kbLabel() {
    keysEl.querySelectorAll(".kl").forEach(x => x.remove());
    if (!KBD_LABELS) return;
    const tag = (el, i) => { if (!el) return; const sp = document.createElement("span"); sp.className = "kl"; sp.textContent = KBL[i]; el.appendChild(sp); };
    const tagP = (el, i) => { if (!el) return; const sp = document.createElement("span"); sp.className = "kl"; sp.textContent = PADL[i]; el.appendChild(sp); };
    if (state.engine === "drum") { const L = KB_LAYOUT === "mt" ? DRL_MT : PADL; DRUMS.forEach(([id], i) => { if (i < L.length) { const el = padEls.get(id); if (!el) return; const sp = document.createElement("span"); sp.className = "kl"; sp.textContent = L[i]; el.appendChild(sp); } }); return; }
    if (state.engine === "pads") { keysEl.querySelectorAll(".pad").forEach((el, i) => { if (i < PADL.length) tagP(el, i); }); return; }
    const start = BASE + state.octave * 12; for (let i = 0; i < KBL.length; i++) tag(keyEls.get(start + i), i);
  }
  // Musical Typing's other keys: Z X an octave down or up, C V softer or harder
  function kbMtExtra(code) {
    if (code === "KeyZ" || code === "KeyX") { if (state.engine === "drum") return; document.getElementById(code === "KeyZ" ? "octDown" : "octUp").click(); return; }
    kbVel = Math.round(Math.min(1, Math.max(0.2, kbVel + (code === "KeyV" ? 0.2 : -0.2))) * 10) / 10;
    noteMsg("Velocity " + Math.round(kbVel * 127) + " (C softer · V harder)");
  }
  const kbAt = fn => { const v = NB_VEL, v7 = NB_VEL7; NB_VEL = kbVel / 0.8; NB_VEL7 = Math.round(kbVel * 127); try { fn(); } finally { NB_VEL = v; NB_VEL7 = v7; } };
  window.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (KB_LAYOUT === "mt" && state.engine !== "pads" && /^Key[ZXCV]$/.test(e.code || "") && !kbBusy(e)) { e.preventDefault(); if (e.repeat) return; kbSeen(); kbMtExtra(e.code); return; }
    const i = kbIdx(e); if (i < 0 || kbBusy(e)) return;
    e.preventDefault();
    const key = e.code || e.key; if (e.repeat || kbDown.has(key)) return;
    kbSeen();
    if (state.engine === "drum") { kbDown.set(key, null); if (i < DRUMS.length && ctx) kbAt(() => playDrum(DRUMS[i][0], ctx.currentTime)); return; }
    if (state.engine === "pads") { kbDown.set(key, null); if (i < NPADS) kitPadDown(i); return; }
    const m = BASE + state.octave * 12 + i;
    kbDown.set(key, m); kbAt(() => press(m));
  });
  window.addEventListener("keyup", e => {
    const key = e.code || e.key; if (!kbDown.has(key)) return;
    const m = kbDown.get(key); kbDown.delete(key); if (m != null) release(m);
  });
  const kbAllUp = () => { kbDown.forEach(m => { if (m != null) release(m); }); kbDown.clear(); };
  window.addEventListener("blur", kbAllUp);
  document.addEventListener("visibilitychange", () => { if (document.hidden) kbAllUp(); });

  document.getElementById("octDown").addEventListener("click", () => { if (state.octave > -2) { state.octave--; buildKeys(); } });
  document.getElementById("octUp").addEventListener("click", () => { if (state.octave < 2) { state.octave++; buildKeys(); } });
  const holdBtn = document.getElementById("hold");
  // Hold on: tap keys to latch or unlatch them. Hold off: latched notes keep ringing and the
  // keys play normally on top. Stop releases everything.
  function updateHoldBtn() {
    const n = heldCount();
    holdBtn.setAttribute("aria-pressed", String(state.hold));
    holdBtn.classList.toggle("has", n > 0);
    holdBtn.textContent = state.hold ? (n ? "Hold · " + n : "Hold") : (n ? "Held · " + n : "Hold");
  }
  holdBtn.addEventListener("click", () => {
    state.hold = !state.hold; updateHoldBtn();
  });
  document.getElementById("panic").addEventListener("click", () => { stopSeq(); allOff(); });
  keysReady = true;
  buildKeys();

