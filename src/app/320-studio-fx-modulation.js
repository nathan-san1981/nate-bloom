  // ======================================================================
  // Studio effects: algorithmic reverbs, tempo-locked echo, kick ducking, mixer EQ
  // ======================================================================
  const NBFX = { verb: "classic", echo: "free", duck: "off" };
  try { const o = JSON.parse(localStorage.getItem("nightbloom-fx2") || "null"); if (o) Object.assign(NBFX, o); } catch (e) {}
  const saveFx2 = () => { try { localStorage.setItem("nightbloom-fx2", JSON.stringify(NBFX)); } catch (e) {} };
  // size (×), decay (RT60 s), damping (Hz), pre-delay (ms), modulation, diffusion, width, level
  const VERB_P = {
    plate: { size: 0.72, decay: 2.3, damp: 9500, pre: 8, mod: 0.55, diff: 0.75, width: 1, gain: 0.72 },
    room: { size: 0.36, decay: 0.75, damp: 6500, pre: 3, mod: 0.2, diff: 0.62, width: 0.8, gain: 0.68 },
    chamber: { size: 0.58, decay: 1.5, damp: 7000, pre: 12, mod: 0.35, diff: 0.7, width: 0.9, gain: 0.7 },
    shimmer: { size: 1.25, decay: 5.5, damp: 6000, pre: 22, mod: 0.7, diff: 0.75, width: 1, gain: 0.8, shim: 0.32 },
    cathedral: { size: 1.5, decay: 6.5, damp: 4300, pre: 34, mod: 0.8, diff: 0.7, width: 1, gain: 0.85 },
  };
  const NB_VERB_SRC = `
const BASE = [31.71, 37.11, 40.23, 44.79, 52.13, 57.97, 64.81, 71.33], AP = [4.77, 3.59, 12.73, 9.31];
class NBVerb extends AudioWorkletProcessor {
  constructor() { super(); const sr = sampleRate; this.sr = sr;
    this.len = Math.ceil(sr * 0.2) + 8; this.L = BASE.map(() => new Float32Array(this.len)); this.w = 0; this.lp = new Float64Array(8);
    this.pd = new Float32Array(Math.ceil(sr * 0.25) + 2); this.pw = 0;
    this.ap = AP.map(ms => new Float32Array(Math.ceil(sr * ms / 1000 * 1.6) + 2)); this.apw = AP.map(() => 0); this.apn = AP.map(() => 1);
    this.ph = [0, 2.1, 4.2]; this.y = new Float64Array(8); this.h = new Float64Array(8); this.psb = new Float32Array(8192); this.psw = 0; this.psp = 0; this.psy = 0; this.pslp = 0; this.sh = 0; this.set({ size: 0.6, decay: 1.6, damp: 7000, pre: 10, mod: 0.4, diff: 0.7, width: 1 });
    this.port.onmessage = e => { const d = e.data || {}; if (d.clear) this.clear(); else this.set(d); }; }
  clear() { this.L.forEach(b => b.fill(0)); this.lp.fill(0); this.pd.fill(0); this.ap.forEach(b => b.fill(0)); this.psb.fill(0); this.psy = 0; this.pslp = 0; }
  set(p) { const sr = this.sr, size = Math.max(0.25, Math.min(1.7, p.size || 0.6));
    this.d = BASE.map(ms => Math.min(this.len - 6, Math.round(ms * size * sr / 1000)));
    // each line loses what its length costs at this decay; highs decay faster (a shorter decay up top, set by damping)
    const dec = Math.max(0.1, p.decay || 1.5), hr = Math.max(0.3, Math.min(0.9, (p.damp || 7000) / 10000));
    this.b0 = new Float64Array(8); this.a1 = new Float64Array(8);
    this.d.forEach((d, i) => { const gdc = Math.pow(10, -3 * (d / sr) / dec), ghf = Math.pow(10, -3 * (d / sr) / (dec * hr)), a1 = (gdc - ghf) / (gdc + ghf); this.a1[i] = a1; this.b0[i] = gdc * (1 - a1); });
    this.pdn = Math.max(1, Math.min(this.pd.length - 1, Math.round((p.pre || 0) * sr / 1000)));
    this.apn = AP.map((ms, i) => Math.max(1, Math.min(this.ap[i].length - 1, Math.round(ms * Math.sqrt(size) * sr / 1000))));
    this.gd = Math.max(0.3, Math.min(0.8, p.diff || 0.7)); this.md = (p.mod || 0) * sr * 0.0012; this.wd = p.width == null ? 1 : p.width; this.sh = Math.max(0, Math.min(0.4, p.shim || 0));
    this.fr = [0.53, 0.77, 1.09].map(f => 2 * Math.PI * f / sr); }
  process(inputs, outputs) {
    const inp = inputs[0], oL = outputs[0][0], oR = outputs[0][1] || outputs[0][0], n = oL.length;
    const iL = inp && inp[0], iR = inp && (inp[1] || inp[0]);
    const Ls = this.L, len = this.len, d = this.d, b0 = this.b0, fa = this.a1, lp = this.lp, gd = this.gd, md = this.md;
    for (let k = 0; k < n; k++) {
      let x = (iL ? (iL[k] + iR[k]) * 0.5 : 0) + this.psy * this.sh * 0.6;
      // pre-delay
      this.pd[this.pw] = x; let pr = this.pw - this.pdn; if (pr < 0) pr += this.pd.length; x = this.pd[pr]; if (++this.pw >= this.pd.length) this.pw = 0;
      // input diffusion: four allpasses
      for (let j = 0; j < 4; j++) { const B = this.ap[j], N = this.apn[j]; let r = this.apw[j] - N; if (r < 0) r += B.length; const z = B[r], gg = j < 2 ? gd : gd * 0.85, v = x - gg * z; x = gg * v + z; B[this.apw[j]] = v; if (++this.apw[j] >= B.length) this.apw[j] = 0; }
      // read the eight lines (three of them slowly modulated)
      const y = this.y, h = this.h;
      for (let i = 0; i < 8; i++) {
        let dd = d[i]; if (i === 0 || i === 3 || i === 6) { const m = i === 0 ? 0 : i === 3 ? 1 : 2; this.ph[m] += this.fr[m]; if (this.ph[m] > 6.283185307) this.ph[m] -= 6.283185307; dd += md * (1 + Math.sin(this.ph[m])); }
        let rp = this.w - dd; while (rp < 0) rp += len; const i0 = rp | 0, f = rp - i0, i1 = i0 + 1 >= len ? 0 : i0 + 1, v = Ls[i][i0] * (1 - f) + Ls[i][i1] * f;
        lp[i] = b0[i] * v + fa[i] * lp[i]; y[i] = lp[i];
      }
      // Hadamard mix
      let a0 = y[0] + y[1], a1 = y[0] - y[1], a2 = y[2] + y[3], a3 = y[2] - y[3], a4 = y[4] + y[5], a5 = y[4] - y[5], a6 = y[6] + y[7], a7 = y[6] - y[7];
      let c0 = a0 + a2, c1 = a1 + a3, c2 = a0 - a2, c3 = a1 - a3, c4 = a4 + a6, c5 = a5 + a7, c6 = a4 - a6, c7 = a5 - a7;
      h[0] = c0 + c4; h[1] = c1 + c5; h[2] = c2 + c6; h[3] = c3 + c7; h[4] = c0 - c4; h[5] = c1 - c5; h[6] = c2 - c6; h[7] = c3 - c7; const sc = 0.35355339;
      const w = this.w;
      for (let i = 0; i < 8; i++) { let v = h[i] * sc + x * (i & 1 ? -0.5 : 0.5); if (v > 4) v = 4; else if (v < -4) v = -4; Ls[i][w] = v; }
      if (++this.w >= len) this.w = 0;
      const outL = (y[0] - y[3] + y[4] - y[7] + y[2]) * 0.45, outR = (y[1] - y[2] + y[5] - y[6] + y[3]) * 0.45, M = (outL + outR) * 0.5, S = (outL - outR) * 0.5 * this.wd;
      oL[k] = M + S; oR[k] = M - S;
      if (this.sh > 0) {   // shimmer: two read heads sliding through the tail one sample per sample play it an octave up
        const B = this.psb, N = 2048; B[this.psw] = M;
        this.psp += 1 / N; if (this.psp >= 1) this.psp -= 1;
        let o = 0;
        for (let q = 0; q < 2; q++) { let ph = this.psp + q * 0.5; if (ph >= 1) ph -= 1; const dl = 8 + (1 - ph) * N; let rp = this.psw - dl; if (rp < 0) rp += 8192; const i0 = rp | 0, fr = rp - i0, a = B[i0], b = B[(i0 + 1) & 8191], sw = Math.sin(Math.PI * ph); o += (a + (b - a) * fr) * sw * sw; }
        this.pslp += (o - this.pslp) * 0.35; const z = this.pslp; this.psy = z / (1 + Math.abs(z) * 3);   // (louder → less fed back, so it can't run away)
        oL[k] += z * this.sh * 1.6; oR[k] += z * this.sh * 1.6;   // the octave-up tail is heard, and fed back in a little (so it climbs)
        this.psw = (this.psw + 1) & 8191;
      }
    }
    return true;
  }
}
registerProcessor("nb-verb", NBVerb);`;
  let verbMod = null;
  function verbReady() {
    if (verbMod) return verbMod;
    return (verbMod = (async () => {
      for (const url of [() => URL.createObjectURL(new Blob([NB_VERB_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(NB_VERB_SRC)]) {
        try { await ctx.audioWorklet.addModule(url()); return true; } catch (e) {}
      }
      verbMod = null; return false;
    })());
  }
  const FV = { conv: null, hp: null, convG: null, fdnG: null, node: null, linked: false };
  function fxFind() {   // the shared hall's convolver and the high-pass in front of it, in the master chain
    if (!fx || !fx.chainNodes) return null;
    const conv = fx.chainNodes.find(n => n instanceof ConvolverNode), hp = fx.chainNodes.find(n => n instanceof BiquadFilterNode && n.type === "highpass" && Math.abs(n.frequency.value - 180) < 1);
    return conv && hp ? { conv, hp } : null;
  }
  async function applyVerb() {
    if (!ctx || !fx || !fx.verbOut) return;
    const f = fxFind(); if (!f) return;
    if (FV.conv !== f.conv) {   // a new master chain: the hall goes out through a level that can crossfade with the others
      FV.conv = f.conv; FV.hp = f.hp; FV.node = null; FV.linked = false;
      try { f.conv.disconnect(fx.verbOut); } catch (e) {}
      FV.convG = ctx.createGain(); f.conv.connect(FV.convG).connect(fx.verbOut);
      FV.fdnG = ctx.createGain(); FV.fdnG.gain.value = 0; FV.fdnG.connect(fx.verbOut);
    }
    const P = NBFX.verb !== "classic" && VERB_P[NBFX.verb], t = ctx.currentTime;
    if (P) {
      if (!ctx.audioWorklet || !(await verbReady())) { NBFX.verb = "classic"; saveFx2(); fxMorePaint(); return applyVerb(); }
      if (!FV.node) { FV.node = new AudioWorkletNode(ctx, "nb-verb", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" }); FV.node.connect(FV.fdnG); }
      FV.node.port.postMessage(P);
      if (!FV.linked) { FV.hp.connect(FV.node); FV.linked = true; }
      FV.fdnG.gain.setTargetAtTime(P.gain, t, 0.06); FV.convG.gain.setTargetAtTime(0, t, 0.06);
      setTimeout(() => { if (NBFX.verb !== "classic" && FV.hp) { try { FV.hp.disconnect(FV.conv); } catch (e) {} } }, 400);   // the convolver rests
    } else {
      try { FV.hp.connect(FV.conv); } catch (e) {}
      FV.convG.gain.setTargetAtTime(1, t, 0.06); FV.fdnG.gain.setTargetAtTime(0, t, 0.06);
      setTimeout(() => { if (NBFX.verb === "classic" && FV.linked && FV.node) { try { FV.hp.disconnect(FV.node); } catch (e) {} FV.linked = false; FV.node.port.postMessage({ clear: true }); } }, 400);
    }
  }
  setInterval(() => { if (ctx && fx) { const f = fxFind(); if (f && f.conv !== FV.conv) applyVerb(); } }, 1000);
  ["stopAll", "panic"].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => { if (FV.node) FV.node.port.postMessage({ clear: true }); }); });
  // ---------- echo time: free, or locked to the tempo ----------
  function echoPairs() {
    const out = [];
    if (fx && fx.chainNodes) { const ds = fx.chainNodes.filter(n => n instanceof DelayNode && n.delayTime.maxValue > 1.5); if (ds.length >= 2) out.push([ds[0], ds[1]]); }
    for (const id in fxChan) { const c = fxChan[id]; if (c && c.dL && c.dR) out.push([c.dL, c.dR]); }
    return out;
  }
  let echoKey = "";
  function applyEcho(force) {
    if (!ctx || !fx) return;
    const bpm = rcBpm() || state.seq.bpm || 120, key = NBFX.echo + "@" + bpm.toFixed(2) + "#" + Object.keys(fxChan).length + (fx.chainNodes ? fx.chainNodes.length : 0);
    if (!force && key === echoKey) return; echoKey = key;
    const t = ctx.currentTime, free = NBFX.echo === "free", d = free ? 0 : Math.min(1.95, 60 / bpm * +NBFX.echo);
    echoPairs().forEach(([L, R]) => { L.delayTime.setTargetAtTime(free ? 0.375 : d, t, 0.04); R.delayTime.setTargetAtTime(free ? 0.5 : d, t, 0.04); });
  }
  setInterval(() => applyEcho(false), 300);
  // ---------- duck on the kick ----------
  const DUCK = { light: [0.63, 0.16], medium: [0.4, 0.2], pump: [0.16, 0] };   // level in the dip, release (0: with the tempo)
  const duckable = id => !!ENGINES[id] || id === "samp" || id === "inst" || id === "pads";
  let duckLast = -1;
  function nbDuck(t) {
    if (NBFX.duck === "off" || !ctx || BP.off || t == null) return;
    if (Math.abs(t - duckLast) < 0.03) return; duckLast = t;
    const D = DUCK[NBFX.duck] || DUCK.light, rel = D[1] || 60 / (rcBpm() || 120) * 0.42;
    for (const id in fxChan) { if (!duckable(id)) continue; const gp = fxChan[id].input.gain; gp.setTargetAtTime(D[0], t, 0.004); gp.setTargetAtTime(1, t + 0.035, rel / 3); }
  }
  function duckOff() { if (!ctx) return; const t = ctx.currentTime; for (const id in fxChan) { const gp = fxChan[id].input.gain; try { gp.cancelScheduledValues(t); } catch (e) {} gp.setTargetAtTime(1, t, 0.02); } }
  const kickIds = new Map(); const isKick = id => { if (!kickIds.has(id)) kickIds.set(id, rcGM(id) === 36); return kickIds.get(id); };
  { const pd = playDrum; playDrum = function (id, t) { const r = pd.apply(this, arguments); if (id === "kick" && NBFX.duck !== "off") nbDuck(t == null ? ctx.currentTime : t); return r; }; }
  { const rh = rcHit; rcHit = function (i, t, vel) { const r = rh.apply(this, arguments); if (NBFX.duck !== "off") { const tr = RCP.tracks[i]; if (tr && isKick(tr.snd)) nbDuck(t); } return r; }; }
  { const bh = bpHit; bpHit = function (k, t, vel, mod) { const r = bh.apply(this, arguments); if (NBFX.duck !== "off" && !BP.off) { const P = bpPad(k); if (P && typeof P.src === "string" && isKick(P.src)) nbDuck(t); } return r; }; }
  // ---------- the FX tab row ----------
  function fxMorePaint() {
    const v = document.getElementById("fxVerb"), e = document.getElementById("fxEchoSync"), d = document.getElementById("fxDuck"); if (!v) return;
    v.value = NBFX.verb; e.value = NBFX.echo; d.value = NBFX.duck;
    v.classList.toggle("on", NBFX.verb !== "classic"); e.classList.toggle("on", NBFX.echo !== "free"); d.classList.toggle("on", NBFX.duck !== "off");
  }
  document.getElementById("fxVerb").addEventListener("change", ev => { start(); NBFX.verb = ev.target.value; saveFx2(); fxMorePaint(); applyVerb(); noteMsg(NBFX.verb === "classic" ? "Reverb: the classic hall" : "Reverb: " + ev.target.selectedOptions[0].textContent + " · turn up Space to hear more of it"); });
  document.getElementById("fxEchoSync").addEventListener("change", ev => { start(); NBFX.echo = ev.target.value; saveFx2(); fxMorePaint(); applyEcho(true); noteMsg(NBFX.echo === "free" ? "Echo: free time" : "Echo locked to the tempo: " + ev.target.selectedOptions[0].textContent + " · turn up Echo to hear it"); });
  document.getElementById("fxDuck").addEventListener("change", ev => { start(); NBFX.duck = ev.target.value; saveFx2(); fxMorePaint(); if (NBFX.duck === "off") duckOff(); noteMsg(NBFX.duck === "off" ? "Ducking off" : "The synths dip on every kick (" + NBFX.duck + ")"); });
  fxMorePaint();
  // ---------- mixer EQ ----------
  const EQS = {}; try { Object.assign(EQS, JSON.parse(localStorage.getItem("nightbloom-eq") || "{}")); } catch (e) {}
  const saveEq = () => { try { localStorage.setItem("nightbloom-eq", JSON.stringify(EQS)); } catch (e) {} };
  const eqFlat = e => !e || (Math.abs(e.lo || 0) < 0.05 && Math.abs(e.mid || 0) < 0.05 && Math.abs(e.hi || 0) < 0.05);
  function eqNodes() {
    const lo = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
    lo.type = "lowshelf"; lo.frequency.value = 200; mid.type = "peaking"; mid.Q.value = 0.9; mid.frequency.value = 1000; hi.type = "highshelf"; hi.frequency.value = 6000;
    lo.connect(mid).connect(hi); return { lo, mid, hi, input: lo, output: hi };
  }
  function eqSet(E, e) { if (!E) return; const t = ctx.currentTime; e = e || {}; E.lo.gain.setTargetAtTime(e.lo || 0, t, 0.02); E.mid.gain.setTargetAtTime(e.mid || 0, t, 0.02); E.mid.frequency.setTargetAtTime(e.mf || 1000, t, 0.02); E.hi.gain.setTargetAtTime(e.hi || 0, t, 0.02); }
  function eqChain(id) {   // between a sound's input and its effects
    if (!ctx || id === "bp") return;
    const c = fxcGet(id); if (!c) return;
    if (!c.eq) {
      if (eqFlat(EQS[id])) return;
      c.eq = eqNodes(); try { c.core.disconnect(c.driveIn); } catch (er) {} c.core.connect(c.eq.input); c.eq.output.connect(c.driveIn);
      if (c.w && c.w.lean && !c.w.parked) { try { c.core.disconnect(c.w.to); } catch (er) {} c.eq.output.connect(c.w.to); }
    }
    eqSet(c.eq, EQS[id]);
  }
  { const fe = fxcEdges; fxcEdges = function (c, w) { const E = fe(c, w); if (c && c.eq) E.forEach(e => { if (e[0] === c.core) e[0] = c.eq.output; }); return E; }; }
  { const fa = fxcApply; fxcApply = function (id) { const r = fa.apply(this, arguments); try { if (EQS[id] && !eqFlat(EQS[id]) && fxChan[id] && !fxChan[id].eq) eqChain(id); } catch (e) {} return r; }; }
  // Beat Pads: its bus can skip the chains, so its EQ sits right on the bus
  bpBus = function () {
    if (!BP.bus || BP.bus.context !== ctx) { BP.bus = ctx.createGain(); BP.bus.gain.value = BPS.level; BP.bus.__soloGroup = "bp"; BP.busTo = null; BP.eqOn = null; }
    const c = FXC.by.bp && FXC.by.bp.on ? fxcGet("bp") : null, to = c ? c.input : fx.comp, eqOn = !eqFlat(EQS.bp);
    if (BP.busTo !== to || BP.eqOn !== eqOn) {
      try { BP.bus.disconnect(); } catch (e) {} if (BP.eqN) { try { BP.eqN.output.disconnect(); } catch (e) {} }
      if (eqOn) { if (!BP.eqN || BP.eqN.lo.context !== ctx) BP.eqN = eqNodes(); BP.bus.connect(BP.eqN.input); BP.eqN.output.connect(to); eqSet(BP.eqN, EQS.bp); }
      else BP.bus.connect(to);
      BP.busTo = to; BP.eqOn = eqOn;
    }
    return BP.bus;
  };
  function eqApply(id) { if (!ctx) return; if (id === "bp") { bpBus(); if (BP.eqN) eqSet(BP.eqN, EQS.bp); } else eqChain(id); }
  // the mixer moves what's sounding into "Playing now": find each channel's own group again
  const eqGroup = c => c.group !== "Playing now" ? c.group : Object.keys(ENGINES).some(k => ENGINES[k].name === c.name) ? "Synths" : c.name === "All drums" ? "Drums"
    : /^S\d+ · /.test(c.name) ? "Sampler" : c.name === "Rhythm Creator" ? "Rhythm Creator" : c.name === "Beat Pads" ? "Beat Pads" : c.sub === "Inst tab" ? "Instrument" : c.group;
  function eqIdFor(c0, firstOfGroup) {
    const c = Object.assign({}, c0, { group: eqGroup(c0) });
    if (c.group === "Synths") return Object.keys(ENGINES).find(k => ENGINES[k].name === c.name) || null;
    if (c.group === "Drums") return c.name === "All drums" ? "drum" : null;
    if (c.group === "Rhythm Creator") return "rc";
    if (c.group === "Beat Pads") return "bp";
    if (c.group === "Instrument") return "inst";
    if (c.group === "Sampler" && firstOfGroup) return "samp";
    if (c.group === "Pads" && firstOfGroup) return "pads";
    return null;
  }
  const mfOf = v => Math.round(150 * Math.pow(40, v / 100)), mfPos = hz => Math.round(Math.log((hz || 1000) / 150) / Math.log(40) * 100);
  const dbTxt = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(Math.abs(v) % 1 ? 1 : 0) + " dB";
  { const rm = renderMixer; renderMixer = function () {
      const r = rm.apply(this, arguments);
      try {
        const seen = new Set();
        mixChannels().forEach((c, n) => {
          const g = eqGroup(c), first = !seen.has(g); seen.add(g);
          const id = eqIdFor(c, first), inp = document.getElementById("mx" + n); if (!id || !inp) return;
          const row = inp.closest(".mx-row"); if (!row || row.querySelector(".mx-eqb")) return;
          const b = document.createElement("button"); b.className = "btn mx-eqb" + (eqFlat(EQS[id]) ? "" : " on"); b.textContent = "EQ";
          b.setAttribute("aria-label", "EQ for " + (c.group === "Sampler" ? "every sampler slot" : c.group === "Pads" ? "every pad" : c.name)); b.setAttribute("aria-expanded", "false");
          row.classList.add("has-eq"); row.appendChild(b);
          b.addEventListener("click", () => {
            const open = row.nextElementSibling && row.nextElementSibling.classList.contains("mx-eq");
            if (open) { row.nextElementSibling.remove(); b.setAttribute("aria-expanded", "false"); return; }
            const e = EQS[id] || { lo: 0, mid: 0, hi: 0, mf: 1000 }, P = document.createElement("div"); P.className = "mx-eq";
            P.innerHTML = `<label><span>Low <em data-o="lo"></em></span><input type="range" min="-12" max="12" step="0.5" data-b="lo" aria-label="Low shelf, dB"></label>
              <label><span>Mid <em data-o="mid"></em></span><input type="range" min="-12" max="12" step="0.5" data-b="mid" aria-label="Mid, dB"></label>
              <label><span>Mid at <em data-o="mf"></em></span><input type="range" min="0" max="100" data-b="mf" aria-label="Mid frequency"></label>
              <label><span>High <em data-o="hi"></em></span><input type="range" min="-12" max="12" step="0.5" data-b="hi" aria-label="High shelf, dB"></label>
              <button class="btn" data-flat="1">Flat</button>`;
            const paint = () => { const q = EQS[id] || e; ["lo", "mid", "hi"].forEach(k => { P.querySelector(`[data-b="${k}"]`).value = q[k] || 0; P.querySelector(`[data-o="${k}"]`).textContent = dbTxt(q[k] || 0); });
              P.querySelector('[data-b="mf"]').value = mfPos(q.mf); P.querySelector('[data-o="mf"]').textContent = (q.mf || 1000) >= 1000 ? ((q.mf || 1000) / 1000).toFixed(1) + " kHz" : (q.mf || 1000) + " Hz"; b.classList.toggle("on", !eqFlat(EQS[id])); };
            P.addEventListener("input", ev => { const k = ev.target.dataset && ev.target.dataset.b; if (!k) return; start(); const q = EQS[id] = Object.assign({ lo: 0, mid: 0, hi: 0, mf: 1000 }, EQS[id]); q[k] = k === "mf" ? mfOf(+ev.target.value) : +ev.target.value; eqApply(id); saveEq(); paint(); });
            P.querySelector("[data-flat]").addEventListener("click", () => { EQS[id] = { lo: 0, mid: 0, hi: 0, mf: (EQS[id] || {}).mf || 1000 }; eqApply(id); saveEq(); paint(); });
            row.after(P); paint(); b.setAttribute("aria-expanded", "true");
          });
        });
      } catch (e) {}
      return r;
    }; }
  window.__fx2 = { NBFX, FV, applyVerb, applyEcho, echoPairs, nbDuck, EQS, eqApply, VERB_P, chains: () => fxChan };


  // ======================================================================
  // Modulation and control: MIDI learn, per-note modulation, Tracks automation
  // ======================================================================
  // ---------- MIDI learn ----------
  const LEARN = { map: [], on: false, pick: null, xyStep: 0 };
  try { const m = JSON.parse(localStorage.getItem("nightbloom-midilearn") || "[]"); if (Array.isArray(m)) LEARN.map = m; } catch (e) {}
  const saveLearn = () => { try { localStorage.setItem("nightbloom-midilearn", JSON.stringify(LEARN.map)); } catch (e) {} };
  const PANEL_NAMES = { engineKnobs: "Sound", fxKnobs: "FX", labStrip: "FX Lab", drumKnobs: "Drums" };
  function learnDesc(el) {
    if (!el || !el.closest) return null;
    const kn = el.closest(".knob");
    if (kn && kn.__nbSet) {
      const box = kn.parentElement && kn.parentElement.closest("[id]"), pid = box ? box.id : "", idx = box ? [...box.querySelectorAll(".knob")].indexOf(kn) : -1;
      if (!pid || idx < 0) return null;
      return { t: { k: "knob", panel: pid, idx }, name: kn.getAttribute("aria-label") + " (" + (PANEL_NAMES[pid] || pid) + " knob " + (idx + 1) + ")" };
    }
    if (el.closest("#xyPad")) return { t: { k: "xy" }, name: "XY pad" };
    const r = el.closest('input[type="range"]');
    if (r) {
      const al = r.getAttribute("aria-label") || "";
      if (r.id && !/^mx\d+$/.test(r.id)) return { t: { k: "range", id: r.id }, name: al || r.id };
      if (al) return { t: { k: "rangeL", label: al }, name: al };
    }
    return null;
  }
  function learnFind(t) {
    if (t.k === "knob") { const box = document.getElementById(t.panel); return box ? box.querySelectorAll(".knob")[t.idx] || null : null; }
    if (t.k === "range") return document.getElementById(t.id);
    if (t.k === "rangeL") { try { return document.querySelector('input[type="range"][aria-label="' + CSS.escape(t.label) + '"]'); } catch (e) { return null; } }
    return null;
  }
  const lrnT = new WeakMap();
  function learnApply(t, v) {
    if (t.k === "xy") { if (t.axis === "y") mo.y = v; else mo.x = v; paintXY(); try { xyApply(t.axis !== "y", t.axis === "y"); } catch (e) {} clearTimeout(lrnT.get(mo)); lrnT.set(mo, setTimeout(saveMo, 300)); return true; }
    const el = learnFind(t); if (!el) return false;
    if (el.__nbSet) { el.__nbSet(v); return true; }
    const min = el.min === "" ? 0 : +el.min, max = el.max === "" ? 100 : +el.max, st = el.step && el.step !== "any" ? +el.step : 0;
    let x = min + v * (max - min); if (st) x = Math.round(x / st) * st;
    el.value = x; el.dispatchEvent(new Event("input", { bubbles: true }));
    clearTimeout(lrnT.get(el)); lrnT.set(el, setTimeout(() => el.dispatchEvent(new Event("change", { bubbles: true })), 180));
    return true;
  }
  const lbar = document.createElement("div"); lbar.id = "learnBar"; lbar.className = "learnbar"; lbar.hidden = true; lbar.setAttribute("role", "status");
  lbar.innerHTML = '<span></span><button class="btn primary">Done</button>'; document.body.appendChild(lbar);
  const learnSay = t => { lbar.querySelector("span").textContent = t; };
  let pickEl = null;
  const markPick = el => { if (pickEl) pickEl.classList.remove("learn-pick"); pickEl = el; if (el) el.classList.add("learn-pick"); };
  function learnStart() {
    LEARN.on = true; LEARN.pick = null; LEARN.xyStep = 0; document.body.classList.add("learn-on"); lbar.hidden = false; mdEl.hidden = true;
    learnSay(md.access ? "MIDI learn: touch a knob or slider in the app, or Plugin control… for a plugin's" : "MIDI learn: connect first (MIDI → Connect), then touch a knob or slider");
  }
  function learnStop() { LEARN.on = false; LEARN.pick = null; markPick(null); document.body.classList.remove("learn-on"); lbar.hidden = true; }
  lbar.querySelector("button").addEventListener("click", learnStop);
  document.addEventListener("pointerdown", e => {
    if (!LEARN.on || (e.target.closest && e.target.closest("#learnBar"))) return;
    const d = learnDesc(e.target); if (!d) return;   // anything else (tabs, menus) works as usual while learning
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    LEARN.pick = d; LEARN.xyStep = 0; markPick(e.target.closest(".knob, input[type=range], #xyPad"));
    learnSay(d.t.k === "xy" ? "XY pad: move the controller knob for left–right" : "Now move a knob on your controller for " + d.name);
  }, true);
  function nbCC(ch, cc, val) {
    if (LEARN.on && LEARN.pick) {
      let t = LEARN.pick.t, name = LEARN.pick.name;
      if (t.k === "xy") { t = { k: "xy", axis: LEARN.xyStep ? "y" : "x" }; name = "XY pad " + (LEARN.xyStep ? "up–down" : "left–right"); }
      LEARN.map = LEARN.map.filter(m => !(m.cc === cc && m.ch === ch) && JSON.stringify(m.t) !== JSON.stringify(t));
      LEARN.map.push({ ch, cc, t, name }); saveLearn(); renderLearn();
      if (LEARN.pick.t.k === "xy" && !LEARN.xyStep) { LEARN.xyStep = 1; learnSay("Left–right is CC " + cc + ". Now the knob for up–down"); return true; }
      learnSay("CC " + cc + " → " + name + ". Touch another control, or Done"); LEARN.pick = null; markPick(null);
      return true;
    }
    let hit = false;
    for (const m of LEARN.map) if (m.cc === cc && m.ch === ch) hit = learnApply(m.t, val / 127) || hit;
    return hit;
  }
  function renderLearn() {
    const box = document.getElementById("mdLearnList"); if (!box) return;
    box.innerHTML = "";
    LEARN.map.forEach((m, i) => {
      const r = document.createElement("div"); r.className = "ml-row";
      r.innerHTML = '<b></b><span></span><button class="btn" aria-label="Remove this mapping">✕</button>';
      r.querySelector("b").textContent = m.ml ? "MiniLab " + (m.ml[0] === "K" ? "knob " : "fader ") + (+m.ml.slice(1) + 1) : "CC " + m.cc + " · ch " + (m.ch + 1); r.querySelector("span").textContent = m.name + (m.pg ? " · " + (({ synths: "Synths", samples: "Samples", drums: "Drums", dj: "DJ", grid: "Rhythm", pads: "Beats", garage: "Garage", mix: "Mixer", all: "every screen" })[m.pg] || m.pg) : "");
      r.querySelector("button").addEventListener("click", () => { LEARN.map.splice(i, 1); saveLearn(); renderLearn(); });
      box.appendChild(r);
    });
    if (LEARN.map.length > 1) { const c = document.createElement("button"); c.className = "btn"; c.textContent = "Clear all mappings"; c.addEventListener("click", () => { LEARN.map = []; saveLearn(); renderLearn(); }); box.appendChild(c); }
  }
  document.getElementById("mlLearn").addEventListener("click", learnStart);
  document.getElementById("midiBtn").addEventListener("click", renderLearn);

  // ---------- per-note modulation: every sounding note's cutoff and pitch follow the Motion LFOs ----------
  const MODV = { cut: null, pitch: null, bc: null, bp: null, pend: [] };
  function modv() {
    if (!ctx) return false;
    if (!MODV.cut || MODV.cut.context !== ctx) {
      MODV.cut = ctx.createGain(); MODV.pitch = ctx.createGain(); MODV.pend = [];
      if (ctx.createConstantSource) { MODV.bc = ctx.createConstantSource(); MODV.bc.offset.value = 0; MODV.bc.connect(MODV.cut); MODV.bc.start(); MODV.bp = ctx.createConstantSource(); MODV.bp.offset.value = 0; MODV.bp.connect(MODV.pitch); MODV.bp.start(); }
    }
    return true;
  }
  { const v0 = nbVF; nbVF = function (def) { const n = v0.apply(this, arguments); try { if (n && n.detune && modv()) { const rx = ctx.createGain(); MODV.cut.connect(rx); rx.connect(n.detune); MODV.pend.push(rx); } } catch (e) {} return n; }; }
  function modVoice(oscs) {
    const rxs = MODV.pend; MODV.pend = [];
    if (!modv() || !oscs) return;
    const tgt = oscs.filter(o => o && o.detune && o.frequency && o.frequency.value > 25);
    if (tgt.length) { const rx = ctx.createGain(); MODV.pitch.connect(rx); tgt.forEach(o => rx.connect(o.detune)); rxs.push(rx); }
    if (!rxs.length) return;
    const free = () => rxs.forEach(rx => { try { MODV.cut.disconnect(rx); } catch (e) {} try { MODV.pitch.disconnect(rx); } catch (e) {} try { rx.disconnect(); } catch (e) {} });
    const src = tgt[0] || oscs.find(o => o && o.addEventListener);
    if (src) src.addEventListener("ended", free); else free();
  }
  { const d0 = nbDrift; nbDrift = function (oscs, t) { d0.apply(this, arguments); try { modVoice(oscs); } catch (e) {} }; }
  MO_TARGETS.push(["cutoff", "Synth cutoff (each note)"], ["pitch", "Synth pitch (each note)"]);
  const padLfos = () => { while (mo.lfo.length < 4) mo.lfo.push(mo.lfo.length === 2 ? { on: false, target: "cutoff", shape: "triangle", rate: 0.42, depth: 0.45 } : { on: false, target: "pitch", shape: "sine", rate: 0.9, depth: 0.2 }); };
  padLfos();
  { const mp = moParam; moParam = function (target) { if (target === "cutoff" || target === "pitch") return modv() ? (target === "cutoff" ? [MODV.cut, 2400] : [MODV.pitch, 60]) : null; return mp.apply(this, arguments); }; }
  function xyBias() {
    if (!modv() || !MODV.bc) return;
    const t = ctx.currentTime, val = tg => (mo.xyX === tg ? mo.x : mo.xyY === tg ? mo.y : null), c = val("cutoff"), p = val("pitch");
    MODV.bc.offset.setTargetAtTime(c == null ? 0 : (c - 0.5) * 4800, t, 0.03); MODV.bp.offset.setTargetAtTime(p == null ? 0 : (p - 0.5) * 200, t, 0.03);
  }
  { const ma = motionApply; motionApply = function () { padLfos(); const r = ma.apply(this, arguments); try { xyBias(); const xa = xyApply; xyApply = (dx, dy) => { xa(dx, dy); xyBias(); }; } catch (e) {} return r; }; }
  { const rm = renderMotion; renderMotion = function () { padLfos(); return rm.apply(this, arguments); }; }

  // ---------- Tracks: volume automation ----------
  const AUTO = { touch: new Set(), last: new Map(), timers: new Map() };
  const trkAutoOn = t => !!(t && t.auto && t.auto.on && t.auto.pts && t.auto.pts.length);
  function autoAt(t, x) {
    const P = t.auto && t.auto.pts; if (!P || !P.length) return t.vol;
    if (x <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const [t0, v0] = P[i - 1], [t1, v1] = P[i]; return t1 > t0 ? v0 + (v1 - v0) * (x - t0) / (t1 - t0) : v1; }
    return P[P.length - 1][1];
  }
  function trkAutoSched(t, param, from, at) {
    if (!trkAutoOn(t)) return;
    try { param.cancelScheduledValues(at); } catch (e) {}
    param.setValueAtTime(autoAt(t, from), at);
    for (const [tt, v] of t.auto.pts) if (tt > from) param.linearRampToValueAtTime(v, at + (tt - from));
  }
  function trkAutoResched(t) {
    const n = tnodes.get(t.id); if (!n || !playing_t) return;
    const now = ctx.currentTime, pos = playFrom + Math.max(0, now - playAt), g = n.g.gain;
    try { g.cancelScheduledValues(now); } catch (e) {}
    if (!audible(t)) { g.setTargetAtTime(0, now, 0.02); return; }
    g.setTargetAtTime(autoAt(t, pos), now, 0.02);
    for (const [tt, v] of t.auto.pts) if (tt > pos + 0.05) g.linearRampToValueAtTime(v, now + (tt - pos));
  }
  liveMix = function () {
    tnodes.forEach((n, id) => {
      const t = T.tracks.find(x => x.id === id); if (!t) return;
      if (trkAutoOn(t) && !AUTO.touch.has(id)) trkAutoResched(t);
      else n.g.gain.setTargetAtTime(audible(t) ? t.vol : 0, ctx.currentTime, 0.02);
      n.p.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.02);
    });
  };
  function autoWrite(t, v) {   // touch: overwrite only while the fader is moving
    if (!playing_t) return;
    const now = Math.round((playFrom + Math.max(0, ctx.currentTime - playAt)) * 1000) / 1000;   // (rounded once: the last point must not look newer than itself)
    t.auto = t.auto || { on: true, pts: [] }; t.auto.on = true;
    const P = t.auto.pts, from = AUTO.touch.has(t.id) ? (AUTO.last.get(t.id) ?? now) : now - 0.02;
    if (!AUTO.touch.has(t.id)) { AUTO.touch.add(t.id); const n = tnodes.get(t.id); if (n) { try { n.g.gain.cancelScheduledValues(ctx.currentTime); } catch (e) {} n.g.gain.setTargetAtTime(v, ctx.currentTime, 0.02); } }
    for (let i = P.length - 1; i >= 0; i--) if (P[i][0] > from && P[i][0] <= now + 0.001) P.splice(i, 1);
    P.push([now, Math.round(v * 1000) / 1000]); P.sort((a, b) => a[0] - b[0]);
    AUTO.last.set(t.id, now);
    clearTimeout(AUTO.timers.get(t.id));
    AUTO.timers.set(t.id, setTimeout(() => { AUTO.touch.delete(t.id); AUTO.last.delete(t.id); trkAutoResched(t); trkSave(); }, 450));
    autoDraw(t);
  }
  function autoDraw(t) {
    const row = trkInner.querySelector(`.trow[data-track="${t.id}"]`); if (!row) return;
    const lane = row.querySelector(".tlane"); if (!lane) return;
    let svg = lane.querySelector("svg.tauto");
    if (!(t.auto && t.auto.on && t.auto.pts && t.auto.pts.length)) { if (svg) svg.remove(); return; }
    const w = Math.max(lane.scrollWidth, lane.clientWidth, 10), H = 66, y = v => (1 - Math.max(0, Math.min(1, v))) * (H - 10) + 5, P = t.auto.pts;
    if (!svg) { svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "tauto"); svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "polyline")); lane.appendChild(svg); }
    svg.setAttribute("width", w); svg.setAttribute("viewBox", `0 0 ${w} ${H}`); svg.setAttribute("preserveAspectRatio", "none");
    const pts = [[0, y(P[0][1])]].concat(P.map(([tt, v]) => [tt * T.pps, y(v)]), [[w, y(P[P.length - 1][1])]]);
    svg.querySelector("polyline").setAttribute("points", pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "));
  }
  { const tr = trkRender; trkRender = function () {
      const r = tr.apply(this, arguments);
      try {
        T.tracks.forEach(t => {
          const row = trkInner.querySelector(`.trow[data-track="${t.id}"]`); if (!row) return;
          const th1 = row.querySelector(".th1"), vol = row.querySelector(".tvol"); if (!th1 || !vol) return;
          const b = document.createElement("button"); b.className = "tb ta" + (t.auto && t.auto.on ? " on" : ""); b.textContent = "A";
          b.setAttribute("aria-label", "Volume automation"); b.title = "Volume automation: play and move the volume to record it · double-tap to clear";
          let tapT = 0;
          b.addEventListener("click", ev => {
            ev.stopPropagation();
            const now = Date.now();
            if (now - tapT < 350 && t.auto && t.auto.pts && t.auto.pts.length) { snapshot(); t.auto.pts = []; trkSave(); autoDraw(t); liveMix(); trkSay("Volume automation cleared on " + t.name + " (↶ undoes it)"); tapT = 0; return; }
            tapT = now;
            t.auto = t.auto || { on: false, pts: [] }; t.auto.on = !t.auto.on; b.classList.toggle("on", t.auto.on); trkSave(); autoDraw(t); liveMix();
            trkSay(t.auto.on ? "Automation on " + t.name + ": play, then move its volume to record. It overwrites only while you move it." : "Automation off on " + t.name + " (the curve is kept)");
          });
          const th2 = row.querySelector(".th2"), nb = th2 && th2.querySelector(".tin");   // next to the faders it automates; the name keeps its room
          if (th2) th2.insertBefore(b, nb || null); else th1.appendChild(b);
          vol.addEventListener("input", () => { if (t.auto && t.auto.on && playing_t) { autoWrite(t, vol.value / 100); b.classList.add("rec"); clearTimeout(b.__rt); b.__rt = setTimeout(() => b.classList.remove("rec"), 500); } });
          autoDraw(t);
        });
      } catch (e) {}
      return r;
    }; }
  window.__mod = { LEARN, nbCC, learnStart, learnStop, MODV, autoAt, autoWrite, trkAutoOn, tnodes: () => tnodes };


