  // ======================================================================
  // Lighted note grid: a Launchpad-style surface that swaps in for the
  // piano keys. Pads light when you touch them, when the arp hits them,
  // and when the sequencer or notation pad plays their note.
  // ======================================================================
  const GRID_SCALES = [["major", "Major", [0, 2, 4, 5, 7, 9, 11]], ["minor", "Minor", [0, 2, 3, 5, 7, 8, 10]],
    ["penta", "Pentatonic", [0, 2, 4, 7, 9]], ["mpenta", "Minor penta", [0, 3, 5, 7, 10]], ["blues", "Blues", [0, 3, 5, 6, 7, 10]],
    ["dorian", "Dorian", [0, 2, 3, 5, 7, 9, 10]], ["chrom", "Chromatic", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]]];
  const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  state.grid = { on: false, root: 0, scale: "major" };
  try { Object.assign(state.grid, JSON.parse(localStorage.getItem("nightbloom-grid") || "{}")); } catch (e) {}
  if (!GRID_SCALES.some(s => s[0] === state.grid.scale)) state.grid.scale = "major";
  state.grid.root = ((state.grid.root | 0) % 12 + 12) % 12;
  const saveGrid = () => { try { localStorage.setItem("nightbloom-grid", JSON.stringify(state.grid)); } catch (e) {} };

  const gridBtn = document.getElementById("gridBtn"), gridBar = document.getElementById("gridBar");
  const gridRoot = document.getElementById("gridRoot"), gridScale = document.getElementById("gridScale");
  NOTE_NAMES.forEach((n, i) => { const o = document.createElement("option"); o.value = i; o.textContent = n; gridRoot.appendChild(o); });
  GRID_SCALES.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; gridScale.appendChild(o); });
  const gridEls = new Map();   // midi -> every pad that plays it
  const gridActive = () => state.grid.on && state.mode !== "seq" && !["drum", "pads"].includes(state.engine);

  function buildGrid() {
    document.getElementById("wheels").hidden = false;
    keysEl.classList.remove("pads", "kit"); padEls.clear();
    keysEl.classList.add("grid");
    keysEl.innerHTML = ""; keyEls.clear(); gridEls.clear();
    const sc = GRID_SCALES.find(s => s[0] === state.grid.scale)[2], chrom = sc.length === 12;
    const cols = 8, w = keysEl.clientWidth || 300, h = keysEl.clientHeight || 220;
    const rows = Math.max(3, Math.min(8, Math.round(h / ((w - 4 * 7) / cols + 4))));
    keysEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    keysEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    const start = BASE + state.octave * 12 + state.grid.root;
    const rowStep = chrom ? 5 : 3;   // each row up a fourth
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) {
      const i = c + r * rowStep;
      const m = chrom ? start + i : start + 12 * Math.floor(i / sc.length) + sc[i % sc.length];
      const deg = chrom ? (m - start) % 12 : i % sc.length;
      const el = document.createElement("div");
      el.className = "gp" + (deg === 0 ? " root" : "");
      if (chrom && [1, 3, 6, 8, 10].includes(((m - start) % 12 + 12) % 12)) el.classList.add("off");
      el.dataset.midi = m;
      el.innerHTML = `<span>${NOTE_NAMES[((m % 12) + 12) % 12]}${deg === 0 ? Math.floor(m / 12) - 1 : ""}</span>`;
      keysEl.appendChild(el);
      if (!gridEls.has(m)) gridEls.set(m, []);
      gridEls.get(m).push(el);
      if (!keyEls.has(m)) keyEls.set(m, el);
    }
    document.getElementById("octLabel").textContent = NOTE_NAMES[state.grid.root] + (Math.floor(start / 12) - 1);
    voices.forEach(v => markTones(v.tones, markKey, true));
    heldVoices.forEach(v => markTones(v.tones, markHeld, true));
  }
  function gridUI() {
    const melodic = !["drum", "pads"].includes(state.engine);
    gridBtn.hidden = state.mode === "seq" || !melodic;
    gridBtn.setAttribute("aria-pressed", String(state.grid.on));
    gridBar.hidden = !gridActive();
    gridRoot.value = state.grid.root; gridScale.value = state.grid.scale;
  }
  {
    const orig = buildKeys;
    buildKeys = function () {
      gridUI();
      if (gridActive()) { buildGrid(); return; }
      keysEl.classList.remove("grid"); keysEl.style.gridTemplateColumns = keysEl.style.gridTemplateRows = ""; gridEls.clear();
      orig();
    };
    const om = setMode;
    setMode = function (mode) { const was = gridActive(); om(mode); if (gridActive() !== was || gridActive()) buildKeys(); else gridUI(); };
  }
  // every copy of a note lights together
  {
    const all = (m, fn) => { const list = gridEls.get(m); if (list) list.forEach(fn); };
    const ok = markKey, oh = markHeld;
    markKey = function (m, on) { if (gridEls.size) all(m, el => el.classList.toggle("down", on)); else ok(m, on); };
    markHeld = function (m, on) { if (gridEls.size) all(m, el => el.classList.toggle("held", on)); else oh(m, on); };
  }
  // light keys and pads when something else plays the note
  function lightAt(m, t, tEnd) {
    if (!ctx) return;
    const els = gridEls.size ? (gridEls.get(m) || []) : (keyEls.get(m) ? [keyEls.get(m)] : []);
    if (!els.length) return;
    const on = Math.max(0, (t - ctx.currentTime) * 1000), off = Math.max(on + 70, (tEnd - ctx.currentTime) * 1000);
    setTimeout(() => els.forEach(el => el.classList.add("lit")), on);
    setTimeout(() => els.forEach(el => el.classList.remove("lit")), off);
  }
  flashArpKey = function (m, t, len) { lightAt(m, t, t + Math.max(0.06, len)); };
  {
    const omv = melodicVoices;
    melodicVoices = function (m, when, scale) {
      const vs = omv(m, when, scale);
      if (!vs.length || !ctx) return vs;
      const t0 = when == null ? ctx.currentTime : when;
      let lit = false;
      return vs.map(v => Object.assign({}, v, { stop(t) {
        v.stop(t);
        if (!lit) { lit = true; lightAt(m, t0, t == null ? ctx.currentTime + 0.1 : t); }
      } }));
    };
  }
  gridBtn.addEventListener("click", () => { state.grid.on = !state.grid.on; saveGrid(); buildKeys(); });
  gridRoot.addEventListener("change", () => { state.grid.root = +gridRoot.value; saveGrid(); buildKeys(); });
  gridScale.addEventListener("change", () => { state.grid.scale = gridScale.value; saveGrid(); buildKeys(); });
  {
    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (gridActive()) buildKeys(); }, 150); });
  }
  gridUI();
  if (gridActive()) requestAnimationFrame(() => buildKeys());


  // the page scrolls now; this button jumps down to the pads or keys whenever they are off screen
  {
    const playrowEl = document.getElementById("playrow"), jump = document.getElementById("jumpPlay");
    const appEl = document.querySelector(".app");
    let seen = 1;
    const refresh = () => {
      appEl.classList.toggle("gridmode", gridActive());
      jump.textContent = gridActive() ? "▼ Pads" : "▼ Keys";
      jump.hidden = playrowEl.hidden || seen > 0.6;
    };
    new IntersectionObserver(es => { for (const e of es) seen = e.intersectionRatio; refresh(); }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] }).observe(playrowEl);
    jump.addEventListener("click", () => playrowEl.scrollIntoView({ block: "end", behavior: "smooth" }));
    const ob = buildKeys;
    buildKeys = function () { ob(); refresh(); };
    const om = setMode;
    setMode = function (mode) { om(mode); refresh(); };
    refresh();
  }


  // ======================================================================
  // Every control is on: there is no Simple / Advanced switch any more.
  // ======================================================================
  {
    document.getElementById("fxMix").addEventListener("click", openMixer);
    try { localStorage.removeItem("nightbloom-ui"); } catch (e) {}
  }


  // ======================================================================
  // "Also playing": everything besides the 808 that loops with Play,
  // named in one strip, each tap-to-mute, plus an 808-only switch
  // ======================================================================
  {
    try { const sv = JSON.parse(localStorage.getItem("nightbloom") || "null"); const m = sv && sv.seq && sv.seq.mute; state.seq.mute = m && typeof m === "object" ? m : {}; } catch (e) { state.seq.mute = {}; }
    const bar = document.getElementById("alsoBar"), chipsEl = document.getElementById("alsoChips"), only = document.getElementById("alsoOnly");
    function sources() {
      const N = stepsNow(), out = [], R = state.seq.rows;
      const nn = SC().notes.filter(visibleNote).length;
      if (nn) out.push(["notes", "Notes melody · " + nn]);
      if (state.seq.synth.slice(0, N).some(x => x != null)) out.push(["synth", "SY synth row"]);
      for (let i = 0; i < NSLOTS; i++) if (sampBuf[i] && R["s" + i] && R["s" + i].slice(0, N).some(Boolean)) out.push(["s" + i, "S" + (i + 1) + " " + baseName(state.samp.slots[i].name)]);
      for (let k = 0; k < NPADS; k++) if (padBuf[k] && R["p" + k] && R["p" + k].slice(0, N).some(Boolean)) out.push(["p" + k, "P" + (k + 1) + " " + baseName(state.pads.names[k])]);
      return out;
    }
    let sig = "";
    function renderAlso(force) {
      const src = sources(), show = state.mode === "seq" || (src.length > 0 && state.mode === "keys" && playing);
      const s = JSON.stringify([show, src, state.seq.mute, state.seq.melody || null]);
      if (s === sig && !force) return; sig = s;
      bar.hidden = !show; if (!show) return;
      try { document.getElementById("alsoMelody").textContent = "♪ " + (state.seq.melody ? MELODIES[state.seq.melody.i][0] : "Melody"); } catch (e) {}
      document.getElementById("alsoLab").innerHTML = src.length ? "Also<br>playing" : "";
      only.hidden = !src.length;
      chipsEl.innerHTML = "";
      src.forEach(([k, label]) => {
        const b = document.createElement("button"); b.className = "alsochip";
        const on = !scMuted(k);
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-label", label + (on ? ", playing. Tap to mute" : ", muted. Tap to play"));
        b.innerHTML = '<i></i><span></span>'; b.lastChild.textContent = label;
        b.addEventListener("click", () => { state.seq.mute[k] = on; save(); renderAlso(true); });
        chipsEl.appendChild(b);
      });
      const allMuted = src.every(([k]) => scMuted(k));
      only.textContent = allMuted ? "Play all" : "Drums only";
      only.onclick = () => { src.forEach(([k]) => { state.seq.mute[k] = !allMuted; }); save(); renderAlso(true); };
    }
    setInterval(() => renderAlso(false), 400);
    renderAlso(true);
  }


  // ======================================================================
  // Formerly "Beta": all of it is simply on now (betaOn stays as a constant so the
  // feature code reads the same).
  //   · FX Lab: Density (Airwindows-style), Lo-fi (DeRez-style), Hall+ (Dragonfly-style)
  //   · FM engine (Dexed-style 6-operator FM, imports DX7 .syx banks)
  //   · Tracks: multitrack audio editor (separate block below)
  // ======================================================================
  const appRoot = document.querySelector(".app");
  const betaOn = true;
  const betaListeners = [];
  const onBeta = fn => betaListeners.push(fn);

  // ---------- FX Lab ----------
  const BFX_DEF = { dens: 0.35, densOn: false, bits: 0.35, tone: 0.6, lofiOn: false, hmix: 0.3, hdecay: 0.55, hsize: 0.5, hdamp: 0.45, hwidth: 0.8, hallOn: false, frzOn: false, frzMix: 0.7, frzTone: 0.6, shimOn: false, shim: 0.4, shimFb: 0.5, eleOn: false, eleGlide: 0.5, eleWah: 0.6, eleGrowl: 0.5, eleBlend: 0.6, eleDrive: 0.5, eleLen: 0.45, eleLevel: 0.7 };
  const bfx = Object.assign({}, BFX_DEF);
  try { Object.assign(bfx, JSON.parse(localStorage.getItem("nightbloom-bfx") || "{}")); } catch (e) {}
  let bfxSaveT = 0; const saveBfxNow = () => { clearTimeout(bfxSaveT); bfxSaveT = 0; try { localStorage.setItem("nightbloom-bfx", JSON.stringify(bfx)); } catch (e) {} };
  const saveBfx = () => { clearTimeout(bfxSaveT); bfxSaveT = setTimeout(saveBfxNow, 300); };   // (a knob sends dozens of values a second: write once it settles)
  addEventListener("pagehide", () => { if (bfxSaveT) saveBfxNow(); }); document.addEventListener("visibilitychange", () => { if (document.hidden && bfxSaveT) saveBfxNow(); });
  let B = null;   // beta audio nodes

  function densityCurve(a) {
    // Airwindows Density-style: sine saturation that thickens as it's pushed, blended with the clean signal
    const n = 2048, c = new Float32Array(n), k = 1 + a * 3.2;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1, y = x * k;
      const s = Math.abs(y) >= Math.PI / 2 ? Math.sign(y) : Math.sin(y);
      c[i] = s / Math.max(1, Math.sin(Math.min(Math.PI / 2, k)));
    }
    return c;
  }
  function bitCurve(bits) {
    const n = 4096, c = new Float32Array(n), steps = Math.pow(2, bits) / 2;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
    return c;
  }
  const NB_MOBILE = window.__nbMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ""));
  const NB_IR_MAX = NB_MOBILE ? 8 : 24;   // (a phone or tablet: long halls fade out by 8 s)
  function hallIR(rate, P) {
    // Dragonfly-style hall: sparse early reflections, then a dense tail whose highs die faster than its lows
    const decay = 0.8 + P.hdecay * P.hdecay * 18, pre = 0.005 + P.hsize * 0.06;
    const full = Math.floor(rate * (decay * 1.15 + pre + 0.1)), len = Math.min(full, Math.floor(rate * (P.irMax || NB_IR_MAX)));
    const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: rate });
    const preN = Math.floor(pre * rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // early reflections: 14 taps spread over ~20–90 ms, scaled with size
      let seed = ch ? 7919 : 104729;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let k = 0; k < 14; k++) {
        const t = preN + Math.floor((0.004 + rnd() * (0.02 + P.hsize * 0.07)) * rate);
        if (t < len) d[t] += (rnd() < 0.5 ? -1 : 1) * (0.55 - k * 0.025);
      }
      // diffuse tail with time-varying damping (one-pole lowpass closing over time)
      let lp = 0;
      const tailStart = preN + Math.floor(0.012 * rate);
      for (let i = tailStart; i < len; i++) {
        const t = (i - tailStart) / rate;
        const env = Math.exp(-6.9 * t / decay) * Math.min(1, t / 0.03);
        const cutoff = 0.92 - Math.min(0.88, P.hdamp * 0.9 * (t / decay) * 3);
        lp += (rnd() * 2 - 1 - lp) * Math.max(0.03, cutoff);
        d[i] += lp * env * 0.6;
      }
    }
    // width: blend the two channels toward mono
    const L = buf.getChannelData(0), R = buf.getChannelData(1), w = P.hwidth;
    for (let i = 0; i < len; i++) { const m = (L[i] + R[i]) * 0.5; L[i] = m + (L[i] - m) * w; R[i] = m + (R[i] - m) * w; }
    if (len < full) { const n = Math.min(len, Math.floor(rate * 1.5)); for (let i = 0; i < n; i++) { const g = Math.cos((i / n) * Math.PI / 2); L[len - n + i] *= g * g; R[len - n + i] *= g * g; } }   // (a shortened tail fades, no cut)
    { let e = 0; for (let i = 0; i < len; i++) e += L[i] * L[i] + R[i] * R[i]; const g = Math.sqrt(0.8 / Math.max(1e-9, e)); for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; } }
    return buf;
  }
  let irTimer = 0;
  function applyBfx(rebuildIR) {
    if (!B) return;
    const on = betaOn, now = ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, now, 0.03);
    const dOn = on && bfx.densOn && bfx.dens > 0.01;
    if (B.__dens !== bfx.dens) { B.__dens = bfx.dens; B.densShaper.curve = densityCurve(bfx.dens); }
    set(B.densWet.gain, dOn ? 0.5 + bfx.dens * 0.5 : 0); set(B.densDry.gain, dOn ? 1 - bfx.dens * 0.7 : 1);
    const lOn = on && bfx.lofiOn;
    { const bq = Math.round(3 + bfx.bits * 9); if (B.__bits !== bq) { B.__bits = bq; B.bitShaper.curve = bitCurve(bq); } }
    B.lofiTone.frequency.setTargetAtTime(lOn ? 1200 + bfx.tone * bfx.tone * 16000 : 20000, now, 0.03);
    set(B.lofiWet.gain, lOn ? 1 : 0); set(B.lofiDry.gain, lOn ? 0 : 1);
    const hOn = on && bfx.hallOn;
    set(B.hallWet.gain, hOn ? bfx.hmix * 1.5 : 0); if (B.hallDry) set(B.hallDry.gain, hOn ? 1 - 0.5 * bfx.hmix : 1);
    if (hOn && (rebuildIR || !B.hall.buffer)) {
      clearTimeout(irTimer);
      irTimer = setTimeout(() => { try { const k = [bfx.hdecay, bfx.hsize, bfx.hdamp, bfx.hwidth].map(x => (+x).toFixed(3)).join(); if (B.hall.buffer && B.hall.__k === k) return; B.hall.buffer = hallIR(ctx.sampleRate, bfx); B.hall.__k = k; } catch (e) {} }, rebuildIR ? 320 : 0);
    }
    if (!hOn && B.hall.buffer && !on) B.hall.buffer = null;
    if (typeof applyFreeze === "function") applyFreeze();
  }
  {
    // hooks the chain builder, so the audio watchdog's rebuilds keep the beta stages wired in
    const ob = buildChain;
    buildChain = function () {
      ob();
      // master -> density -> lo-fi -> hall -> (tracks join here) -> compressor
      const m = fx.master, comp = fx.comp;
      try { m.disconnect(comp); } catch (e) { try { m.disconnect(); } catch (e2) {} }
      const densIn = ctx.createGain(), densDry = ctx.createGain(), densWet = ctx.createGain(), densShaper = ctx.createWaveShaper();
      densShaper.oversample = window.__nbMobile ? "2x" : "4x"; densWet.gain.value = 0;
      const lofiIn = ctx.createGain(), lofiDry = ctx.createGain(), lofiWet = ctx.createGain(), bitShaper = ctx.createWaveShaper();
      const lofiTone = ctx.createBiquadFilter(); lofiTone.type = "lowpass"; lofiTone.frequency.value = 20000; lofiWet.gain.value = 0;
      const hallIn = ctx.createGain(), hall = ctx.createConvolver(), hallWet = ctx.createGain(); hallWet.gain.value = 0;
      const betaOut = ctx.createGain();
      const dcB = ctx.createBiquadFilter(); dcB.type = "highpass"; dcB.frequency.value = 10; dcB.Q.value = 0.707; m.connect(dcB).connect(densIn); densIn.connect(densDry).connect(lofiIn);   // (146: no DC offset into Density and the crush) densIn.connect(densShaper).connect(densWet).connect(lofiIn);
      lofiIn.connect(lofiDry).connect(hallIn); lofiIn.connect(bitShaper).connect(lofiTone).connect(lofiWet).connect(hallIn);
      const hallDry = ctx.createGain(); hallIn.connect(hallDry).connect(betaOut); hallIn.connect(hall).connect(hallWet).connect(betaOut);
      betaOut.connect(comp);
      const trackBus = ctx.createGain(); trackBus.__soloGroup = "trk"; trackBus.connect(comp);
      B = { densIn, densShaper, densDry, densWet, bitShaper, lofiTone, lofiDry, lofiWet, hall, hallWet, hallDry, betaOut, trackBus };
      applyBfx(false);
    };
  }

  // ---------- FM engine (Dexed-style) ----------
  // Operators are numbered 1–6 like the DX7. Each algorithm: [modulator -> target] pairs, carriers, feedback operator.
  const FM_ALGS = [
    [[[6,5],[5,4],[4,3],[2,1]],[1,3],6], [[[6,5],[5,4],[4,3],[2,1]],[1,3],2], [[[6,5],[5,4],[3,2],[2,1]],[1,4],6], [[[6,5],[5,4],[3,2],[2,1]],[1,4],4],
    [[[6,5],[4,3],[2,1]],[1,3,5],6], [[[6,5],[4,3],[2,1]],[1,3,5],5], [[[6,5],[5,3],[4,3],[2,1]],[1,3],6], [[[6,5],[5,3],[4,3],[2,1]],[1,3],4],
    [[[6,5],[5,3],[4,3],[2,1]],[1,3],2], [[[3,2],[2,1],[6,4],[5,4]],[1,4],3], [[[3,2],[2,1],[6,4],[5,4]],[1,4],6], [[[2,1],[6,3],[5,3],[4,3]],[1,3],2],
    [[[2,1],[6,3],[5,3],[4,3]],[1,3],6], [[[2,1],[4,3],[6,4],[5,4]],[1,3],6], [[[2,1],[4,3],[6,4],[5,4]],[1,3],2], [[[2,1],[4,3],[3,1],[6,5],[5,1]],[1],6],
    [[[2,1],[4,3],[3,1],[6,5],[5,1]],[1],2], [[[2,1],[3,1],[6,5],[5,4],[4,1]],[1],3], [[[3,2],[2,1],[6,4],[6,5]],[1,4,5],6], [[[3,1],[3,2],[6,4],[5,4]],[1,2,4],3],
    [[[3,1],[3,2],[6,4],[6,5]],[1,2,4,5],3], [[[2,1],[6,3],[6,4],[6,5]],[1,3,4,5],6], [[[3,2],[6,4],[6,5]],[1,2,4,5],6], [[[6,3],[6,4],[6,5]],[1,2,3,4,5],6],
    [[[6,4],[6,5]],[1,2,3,4,5],6], [[[3,2],[5,4],[6,4]],[1,2,4],6], [[[3,2],[5,4],[6,4]],[1,2,4],3], [[[2,1],[5,4],[4,3]],[1,3,6],5],
    [[[4,3],[6,5]],[1,2,3,5],6], [[[5,4],[4,3]],[1,2,3,6],5], [[[6,5]],[1,2,3,4,5],6], [[],[1,2,3,4,5,6],6],
  ];
  // op: [coarse, fine, detune(0–14, 7 = centre), level(0–99), R1,R2,R3,R4, L1,L2,L3,L4, fixed?]
  const FM_PATCHES = [
    { name: "Glass Bells", alg: 5, fb: 4, ops: [[1,0,7,99,95,30,25,40,99,70,0,0],[3,50,9,82,95,40,20,40,99,60,0,0],[1,0,5,95,95,28,24,40,99,72,0,0],[7,0,8,74,95,45,25,40,99,50,0,0],[1,0,9,92,95,26,22,40,99,74,0,0],[11,0,6,66,95,50,30,40,99,40,0,0]] },
    { name: "Soft Tine Piano", alg: 5, fb: 6, ops: [[1,0,7,99,96,25,25,67,99,75,0,0],[14,0,7,58,95,50,35,78,99,40,0,0],[1,0,8,94,95,20,20,67,99,80,0,0],[1,0,6,80,95,29,20,50,99,70,0,0],[1,0,7,86,95,30,20,60,99,75,0,0],[1,0,8,72,95,40,25,50,99,60,0,0]] },
    { name: "Ambient FM Pad", alg: 32, fb: 5, ops: [[1,0,7,92,32,20,20,30,99,95,92,0],[1,0,10,88,30,18,20,30,99,95,92,0],[2,0,4,74,28,18,20,30,99,94,90,0],[0,0,11,80,34,22,20,30,99,96,92,0],[3,0,3,62,26,15,20,30,99,90,85,0],[1,0,7,70,25,14,18,30,99,92,88,0]] },
    { name: "FM Bass", alg: 16, fb: 6, ops: [[0,0,7,99,99,45,30,60,99,80,70,0],[1,0,7,80,99,60,40,60,99,50,30,0],[1,0,7,72,99,55,40,60,99,55,30,0],[3,0,7,60,99,65,40,60,99,40,20,0],[1,0,7,74,99,50,40,60,99,60,30,0],[2,0,7,66,99,60,40,60,99,45,20,0]] },
    { name: "Crystal Choir", alg: 2, fb: 3, ops: [[1,0,7,96,40,25,30,35,99,90,88,0],[1,0,9,70,38,25,30,35,99,85,80,0],[1,0,5,94,42,25,30,35,99,90,88,0],[3,0,7,66,40,30,30,35,99,80,75,0],[4,0,8,58,40,30,30,35,99,80,75,0],[5,0,6,52,38,30,30,35,99,75,70,0]] },
    { name: "Hollow Pluck", alg: 7, fb: 5, ops: [[1,0,7,99,99,40,35,55,99,50,0,0],[2,0,7,76,99,55,40,55,99,30,0,0],[1,0,8,95,99,38,35,55,99,55,0,0],[5,0,7,64,99,60,40,55,99,25,0,0],[3,0,6,70,99,58,40,55,99,30,0,0],[1,0,7,60,99,62,40,55,99,20,0,0]] },
  ];
  let fmBank = [];
  try { const b = JSON.parse(localStorage.getItem("nightbloom-fmbank") || "[]"); if (Array.isArray(b)) fmBank = b; } catch (e) {}
  let fmSel = 0;
  try { fmSel = Math.max(0, parseInt(localStorage.getItem("nightbloom-fmsel") || "0", 10) || 0); } catch (e) {}
  const fmAll = () => FM_PATCHES.concat(fmBank);
  const fmPatch = () => { const a = fmAll(); return a[Math.min(fmSel, a.length - 1)] || FM_PATCHES[0]; };

  const egTime = r => 24 * Math.pow(2, -r / 8.6);
  const egAmp = l => (l <= 0 ? 0 : Math.pow(2, (l - 99) / 10));
  const outAmp = l => (l <= 0 ? 0 : Math.pow(10, ((l - 99) * 0.74) / 20));
  // feedback: self-modulated sine has an exact harmonic series 2·J_n(nβ)/(nβ)
  function besselJ(n, x) { let s = 0, term = Math.pow(x / 2, n); for (let k = 1; k <= n; k++) term /= k; for (let k = 0; k < 30; k++) { s += term; term *= -(x * x / 4) / ((k + 1) * (k + 1 + n)); } return s; }
  const fbWaves = new Map();
  function fbWave(beta) {
    const key = Math.round(beta * 50); if (fbWaves.has(key)) return fbWaves.get(key);
    const N = 48, re = new Float32Array(N + 1), im = new Float32Array(N + 1), b = Math.min(0.99, key / 50);
    for (let n = 1; n <= N; n++) im[n] = b < 0.001 ? (n === 1 ? 1 : 0) : 2 * besselJ(n, n * b) / (n * b);
    const w = ctx.createPeriodicWave(re, im); fbWaves.set(key, w); return w;
  }
  function fmVoice(f, t, p, out, oscs) {
    const P = fmPatch(), [links, carriers, fbOp] = FM_ALGS[(P.alg | 0) % 32];
    const bright = 0.25 + p.bright * 1.75, atk = 1 + p.attack * 12, rel = 0.4 + p.release * 2.2;
    const fbAmt = Math.min(7, (P.fb | 0) + Math.round((p.feedback - 0.3) * 6));
    const ops = [], carGain = ctx.createGain(); carGain.gain.value = 0.32 / Math.sqrt(carriers.length);
    carGain.connect(out);
    let relMax = 0.1;
    for (let k = 0; k < 6; k++) {
      const o = P.ops[k], fixed = !!o[12];
      const ratio = fixed ? 0 : (o[0] === 0 ? 0.5 : o[0]) * (1 + o[1] / 100);
      const freq = fixed ? Math.pow(10, o[0] % 4) * Math.pow(10, o[1] / 100) : f * ratio;
      const osc = ctx.createOscillator();
      if (k + 1 === fbOp && fbAmt > 0) osc.setPeriodicWave(fbWave(fbAmt / 7 * 0.95));
      osc.frequency.value = Math.min(freq, 20000);
      osc.detune.value = (o[2] - 7) * 1.4 + (k % 2 ? 1 : -1) * p.spread * 9 * (k + 1) / 3;
      const env = ctx.createGain(), amp = outAmp(o[3]);
      const isCar = carriers.includes(k + 1);
      // carriers: level is loudness; modulators: level is FM depth in Hz (index × modulator frequency)
      const scale = isCar ? amp : amp * 4.2 * bright * Math.max(20, freq);
      const g = env.gain, [r1, r2, r3, r4] = [o[4], o[5], o[6], o[7]], [l1, l2, l3, l4] = [o[8], o[9], o[10], o[11]];
      g.setValueAtTime(egAmp(l4) * scale, t);
      const t1 = t + egTime(r1) * atk * 0.25, t2 = t1 + egTime(r2) * 0.5, t3 = t2 + egTime(r3) * 0.5;
      g.linearRampToValueAtTime(egAmp(l1) * scale, t1);
      g.linearRampToValueAtTime(egAmp(l2) * scale, t2);
      g.linearRampToValueAtTime(egAmp(l3) * scale + 1e-6, t3);
      relMax = Math.max(relMax, egTime(r4) * 0.5 * rel);
      osc.connect(env);
      osc.start(t); oscs.push(osc);
      ops.push({ osc, env, isCar });
    }
    for (const [from, to] of links) ops[from - 1].env.connect(ops[to - 1].osc.frequency);
    for (const c of carriers) ops[c - 1].env.connect(carGain);
    return Math.min(8, relMax);
  }

  // DX7 sysex: 32-voice bank (packed, 4104 bytes) or single voice (unpacked, 163 bytes)
  function parseSyx(u8) {
    const name = (a, o) => String.fromCharCode(...a.slice(o, o + 10)).replace(/[^\x20-\x7e]/g, " ").trim() || "DX7 voice";
    const out = [];
    let i = u8.indexOf(0xf0);
    if (i < 0) i = 0;
    if (u8[i + 1] === 0x43 && u8[i + 3] === 0x09) {
      const d = u8.slice(i + 6, i + 6 + 4096);
      for (let v = 0; v < 32 && v * 128 + 128 <= d.length; v++) {
        const b = d.slice(v * 128, v * 128 + 128), ops = [];
        for (let k = 0; k < 6; k++) {
          const o = b.slice((5 - k) * 17, (5 - k) * 17 + 17);   // stored op6 first
          ops.push([o[15] >> 1 & 31, o[16] & 127, o[12] >> 3 & 15, o[14] & 127, o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[15] & 1]);
        }
        out.push({ name: name(b, 118), alg: b[110] & 31, fb: b[111] & 7, ops });
      }
    } else if (u8[i + 1] === 0x43 && u8[i + 3] === 0x00) {
      const b = u8.slice(i + 6, i + 6 + 155), ops = [];
      for (let k = 0; k < 6; k++) {
        const o = b.slice((5 - k) * 21, (5 - k) * 21 + 21);
        ops.push([o[18], o[19], o[20], o[16], o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[17] & 1]);
      }
      out.push({ name: name(b, 145), alg: b[134] & 31, fb: b[135] & 7, ops });
    }
    return out;
  }

  // ---------- UI ----------
  const betaBar = document.getElementById("betaBar");
  const fmBar = document.getElementById("fmBar"), fmSelEl = document.getElementById("fmSel"), fmInfo = document.getElementById("fmInfo");
  tabsEl.querySelectorAll('.tab[data-engine="fm"]').forEach(t => t.parentElement.classList.add("betaonly"));
  function renderFmSel() {
    fmSelEl.innerHTML = "";
    const g1 = document.createElement("optgroup"); g1.label = "Nate Bloom FM";
    const g2 = document.createElement("optgroup"); g2.label = "Imported DX7";
    fmAll().forEach((p, i) => { const o = document.createElement("option"); o.value = i; o.textContent = p.name; (i < FM_PATCHES.length ? g1 : g2).appendChild(o); });
    fmSelEl.appendChild(g1); if (fmBank.length) fmSelEl.appendChild(g2);
    fmSelEl.value = Math.min(fmSel, fmAll().length - 1);
    fmInfo.textContent = fmBank.length ? fmBank.length + " imported" : "import .syx banks";
  }
  fmSelEl.addEventListener("change", () => {
    fmSel = +fmSelEl.value; try { localStorage.setItem("nightbloom-fmsel", fmSel); } catch (e) {}
    if (ctx) { const t = ctx.currentTime + 0.01; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.6)); }
  });
  const fmFile = document.getElementById("fmFile");
  document.getElementById("fmImport").addEventListener("click", () => fmFile.click());
  fmFile.addEventListener("change", async () => {
    let added = 0;
    for (const f of fmFile.files) {
      try { const v = parseSyx(new Uint8Array(await f.arrayBuffer())); fmBank = fmBank.concat(v); added += v.length; } catch (e) {}
    }
    fmFile.value = "";
    if (fmBank.length > 512) fmBank = fmBank.slice(-512);
    try { localStorage.setItem("nightbloom-fmbank", JSON.stringify(fmBank)); } catch (e) {}
    const first = fmAll().length - added;
    if (added) { fmSel = first; try { localStorage.setItem("nightbloom-fmsel", fmSel); } catch (e) {} }
    renderFmSel();
    fmInfo.textContent = added ? "added " + added + " voice" + (added === 1 ? "" : "s") : "no DX7 voices found in that file";
  });
  document.getElementById("fmClearBank").addEventListener("click", () => {
    if (!fmBank.length) return;
    fmBank = []; fmSel = Math.min(fmSel, FM_PATCHES.length - 1);
    try { localStorage.setItem("nightbloom-fmbank", "[]"); localStorage.setItem("nightbloom-fmsel", fmSel); } catch (e) {}
    renderFmSel();
  });

  // FX Lab sheet
  const BFX_ROWS = [
    ["densOn", "Density", "Airwindows-style sine saturation", [["dens", "Amount"]]],
    ["lofiOn", "Lo-fi", "DeRez-style bit crush", [["bits", "Bits"], ["tone", "Tone"]]],
    ["hallOn", "Hall+", "Dragonfly-style hall with early reflections", [["hmix", "Mix"], ["hdecay", "Decay"], ["hsize", "Size"], ["hdamp", "Damping"], ["hwidth", "Width"]]],
    ["frzOn", "Freeze", "On = hold the last two seconds forever", [["frzMix", "Level"], ["frzTone", "Tone"]]],
    ["shimOn", "Shimmer", "octave-up reverb that keeps climbing", [["shim", "Amount"], ["shimFb", "Climb"]]],
    ["eleOn", "Elephant", "the trumpeting growl, what plays vocoded onto it; every note sets it off (168: 780)", [["eleGlide", "Glide"], ["eleWah", "Wah"], ["eleGrowl", "Growl"], ["eleBlend", "Blend"], ["eleDrive", "Drive"], ["eleLen", "Length"], ["eleLevel", "Level"]]],
  ];
  const fxLab = document.getElementById("fxLab"), fxLabList = document.getElementById("fxLabList");
  function renderFxLab() {
    fxLabList.innerHTML = "";
    BFX_ROWS.forEach(([onKey, title, sub, sliders]) => {
      const h = document.createElement("div"); h.className = "lab-head";
      h.innerHTML = "<div><b></b><small></small></div>";
      h.querySelector("b").textContent = title; h.querySelector("small").textContent = sub;
      const tg = document.createElement("button"); tg.className = "btn"; tg.setAttribute("aria-pressed", String(!!bfx[onKey]));
      tg.textContent = bfx[onKey] ? "On" : "Off";
      tg.addEventListener("click", () => { bfx[onKey] = !bfx[onKey]; saveBfx(); applyBfx(onKey === "hallOn"); renderFxLab(); });
      h.appendChild(tg); fxLabList.appendChild(h);
      sliders.forEach(([k, label]) => {
        const row = document.createElement("div"); row.className = "mx-row" + (bfx[onKey] ? "" : " muted");
        const lab = document.createElement("div"); lab.className = "mx-lab"; lab.innerHTML = "<b></b>"; lab.firstChild.textContent = label;
        const r = document.createElement("input"); r.type = "range"; r.min = 0; r.max = 100; r.value = Math.round(bfx[k] * 100);
        r.setAttribute("aria-label", title + " " + label);
        const val = document.createElement("span"); val.className = "mx-val"; val.textContent = r.value;
        r.addEventListener("input", () => { bfx[k] = r.value / 100; val.textContent = r.value; saveBfx(); applyBfx(onKey === "hallOn"); });
        row.append(lab, r, val); fxLabList.appendChild(row);
      });
    });
  }
  document.getElementById("betaFxBtn").addEventListener("click", () => { start(); fxLab.hidden = false; renderFxLab(); });
  document.getElementById("fxLabDone").addEventListener("click", () => { fxLab.hidden = true; });
  document.getElementById("fxLabReset").addEventListener("click", () => { Object.assign(bfx, BFX_DEF); saveBfx(); applyBfx(true); renderFxLab(); });

  let btT = 0;
  function betaToast(msg) {
    const el = document.getElementById("uiToast"); if (!el) return;
    el.textContent = msg; el.hidden = false; clearTimeout(btT); btT = setTimeout(() => { el.hidden = true; }, 2200);
  }
  function applyBeta() {
    appRoot.classList.toggle("beta", betaOn);
    betaBar.hidden = !betaOn;
    if (!betaOn) {
      let changed = false;
      if (state.layers.fm && state.layers.fm.on) { state.layers.fm.on = false; changed = true; if (!Object.values(state.layers).some(l => l.on)) state.layers.saw.on = true; }
      if (state.engine === "fm") { state.engine = "saw"; changed = true; }
      if (changed) { renderEngine(); save(); }
      fxLab.hidden = true;
    }
    fmBar.hidden = !(betaOn && state.engine === "fm");
    applyBfx(true);
    betaListeners.forEach(fn => { try { fn(betaOn); } catch (e) {} });
  }
  {
    const ou = updateSoundBar;
    updateSoundBar = function () { ou(); fmBar.hidden = !(betaOn && state.engine === "fm"); };
    const omc = mixChannels;
    mixChannels = function () { const ch = omc(); return betaOn ? ch : ch.filter(c => c.name !== ENGINES.fm.name); };
  }
  renderFmSel();
  applyBeta();

