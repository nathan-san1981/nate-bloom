  // ======================================================================
  // (176) The Linux app's native engine: the Juno, Supersaw, Analog, Hoover, Mono, Pluck, Tyrell, Sync Lead and Comb Bells worked out in compiled code on a pool of threads (nb_engine.cc), not
  // on the browser's one audio thread. The engine writes finished audio into shared memory; the AudioWorklet here
  // ("nb-native-out") plays it into the Juno's own channel, so its chorus, effects, level, mute, recording and Log
  // carry on as before. Notes keep their times (an arp or Seq note set up ahead lands on its frame; a key played now
  // sounds ~5 ms later than the browser's synths). Anywhere else (the website, the tablet, Lite, or if the engine
  // can't start) the Juno is the browser's, as before. Settings › App switches it.
  // ======================================================================
  {
    const NAT = window.NBEngine || null;
    const NE = window.__ne = { ok: false, on: true, why: NAT ? "" : "not the Linux app", busy: false, node: null, hdr: null, sr: 48000, ctx: null, id: 0, buses: [], notes: 0, byKind: {} };
    try { if (localStorage.getItem("nightbloom-native") === "off") NE.on = false; } catch (e) {}
    const CAP = 8192, BUSES = 8, AHEAD = 256;
    // (180) how far ahead of the worklet the engine keeps: more than the browser takes in one go. Linux's sound server
    // has it work out ~10 ms (480 frames) at once, back to back, so 256 frames ran out mid-burst (238 dropouts in a
    // minute, at 1% of a core): now the burst plus two blocks, and more if it still runs short
    const nbAhead = c => Math.max(AHEAD, Math.min(2048, Math.ceil(((c.baseLatency || 0) * c.sampleRate) / 128) * 128 + 256));
    window.__nbAhead = nbAhead;
    const SRC = `class NBNativeOut extends AudioWorkletProcessor {
  constructor(o) { super(); const p = o.processorOptions; this.h = new Float64Array(p.hdr); this.r = new Float32Array(p.ring); this.cap = p.cap; this.nb = p.buses; this.live = true; this.port.onmessage = e => { if (e.data === "stop") this.live = false; }; }
  process(inputs, outputs) {
    const h = this.h, r = this.r, cap = this.cap, f0 = currentFrame, n = outputs[0][0].length;
    if (h[1] >= f0 + n) {
      const i0 = f0 % cap;
      for (let b = 0; b < this.nb; b++) { const o = outputs[b]; if (!o || !o[0]) continue; const L = o[0], R = o[1] || o[0], bl = b * 2 * cap, br = bl + cap;
        for (let i = 0; i < n; i++) { const k = (i0 + i) % cap; L[i] = r[bl + k]; R[i] = r[br + k]; } }
    } else if (h[1] > 0) { h[2]++; if (h[5] < 2048 && f0 - (this.bump || 0) > 4800) { h[5] += 128; this.bump = f0; } }   // the engine hadn't got this far: silence, counted, and (180) it keeps further ahead from now on
    h[0] = f0 + n;
    return this.live;
  }
}
registerProcessor("nb-native-out", NBNativeOut);`;
    async function neInit() {
      if (NE.ok || NE.busy || !NAT || !NE.on || window.NB_LITE || !ctx) return;
      if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") { NE.why = "no shared memory here (not cross-origin isolated)"; return; }
      NE.busy = true;
      try {
        const hdr = new SharedArrayBuffer(64), ring = new SharedArrayBuffer(BUSES * 2 * CAP * 4), h = new Float64Array(hdr);
        h[0] = Math.floor(ctx.currentTime * ctx.sampleRate); h[3] = CAP; h[4] = BUSES; h[5] = nbAhead(ctx);
        await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([SRC], { type: "text/javascript" })));
        const node = new AudioWorkletNode(ctx, "nb-native-out", { numberOfInputs: 0, numberOfOutputs: BUSES, outputChannelCount: Array(BUSES).fill(2), processorOptions: { hdr, ring, cap: CAP, buses: BUSES } });
        const keep = ctx.createGain(); keep.gain.value = 0; node.connect(keep, 0).connect(ctx.destination);   // (keeps it running with nothing else connected)
        // the shared memory goes to the engine through the window (the app's bridge can't carry it); the app answers
        const ans = await new Promise(res => {
          const id = Math.random().toString(36).slice(2), to = setTimeout(() => { window.removeEventListener("message", on); res({ ok: false, why: "the app didn't answer" }); }, 3000);
          const on = e => { const d = e.data && e.data.nbEngAttached; if (!d || d.id !== id) return; clearTimeout(to); window.removeEventListener("message", on); res(d); };
          window.addEventListener("message", on);
          window.postMessage({ nbEngAttach: { id, hdr, ring, sr: ctx.sampleRate, buses: BUSES, cap: CAP, ahead: h[5] } }, location.origin);
        });
        if (!ans.ok) { NE.why = "the engine didn't start: " + (ans.why || "?"); try { node.disconnect(); } catch (e) {} return; }
        Object.assign(NE, { node, keep, hdr: h, sr: ctx.sampleRate, ctx, ok: true, why: "", buses: [] });
        // the engine should be writing within a moment; if not, the browser's Juno takes over again
        setTimeout(() => { if (NE.ok && NE.hdr[1] <= 0) { NE.ok = false; NE.why = "the engine wrote nothing (shared memory didn't reach it)"; } }, 1500);
        nePitch();
      } catch (e) { NE.why = String(e && e.message || e).slice(0, 160); }
      finally { NE.busy = false; }
    }
    function neOff(why) {
      if (NE.node) { try { NE.node.port.postMessage("stop"); NE.node.disconnect(); } catch (e) {} }
      try { NAT && NAT.stop(); } catch (e) {}
      Object.assign(NE, { ok: false, node: null, buses: [], why: why || "" });
    }
    { const ba = buildAudio; buildAudio = function () { const r = ba.apply(this, arguments); setTimeout(neInit, 50); return r; }; }
    if (ctx) setTimeout(neInit, 50);
    setInterval(() => { if (NE.ok && NE.ctx !== ctx) { neOff("the sound restarted"); neInit(); } else if (!NE.ok && !NE.busy && NE.on && ctx && NAT && !NE.tried) { NE.tried = true; neInit(); } }, 1000);
    // a bus per channel the Juno plays into (a sound's own channel, its level bus): output b of the worklet goes there
    function busFor(dest) {
      let b = NE.buses.findIndex(x => x && x.dest === dest);
      if (b < 0) { b = NE.buses.findIndex(x => !x); if (b < 0) b = NE.buses.length; if (b >= BUSES) return -1; NE.buses[b] = { dest, chorus: null }; NE.node.connect(dest, b); }
      return b;
    }
    // the synths the engine plays, each from the same settings and formulas as its browser version (020, 170)
    const NATIVE_IDS = new Set(["juno", "saw", "analog", "hoover", "mono", "pluck", "tyrell", "sync", "bells", "vital", "zeb", "choir", "fm", "alpha"]);
    const TABLE_IDS = new Set(["vital", "zeb", "fm"]);   // (185: these need the engine's wavetables, eng_table)
    // (185) a wavetable in the engine for a list of harmonic amplitudes, made once each (the same list, the same table)
    const natTabs = new Map(); let natTabN = 0;
    function natTable(imag) {
      let k = ""; for (let i = 1; i < imag.length; i++) k += (Math.round(imag[i] * 1e6) / 1e6) + ",";
      let id = natTabs.get(k); if (id != null) { natTabs.delete(k); natTabs.set(k, id); return id; }
      id = ++natTabN; if (!NAT.table(id, Float64Array.from(imag))) return -1;
      natTabs.set(k, id);
      // (the least recently used go when there are many, the Drone's knobs make new ones; a note still sounding keeps its own)
      while (natTabs.size > 200) { const [k0, id0] = natTabs.entries().next().value; natTabs.delete(k0); try { NAT.table(id0, null); } catch (e) {} }
      return id;
    }
    let natMonoLast = null;
    function natParams(id, p, midi, t) {
      const f = 440 * Math.pow(2, (midi - 69) / 12), a = new Float64Array(160);
      const AN = typeof NBAN !== "undefined" && NBAN.on, drift = (AN && NBAN.drift >= 0.01) ? (Math.random() * 2 - 1) * NBAN.drift * 4 : 0;
      // (177) the Analog bar, as the browser's voices have it (310): Drive, Drift's wander and each note's filter a little
      // different; with the Analog core off, the browser's plain 12 dB filter (no saturation, no ladder)
      const anSet = () => { a[91] = AN ? 1 + 3 * Math.max(0, Math.min(1, NBAN.drive)) : 0.05; a[92] = AN ? Math.max(0.0001, NBAN.drift) : 0; a[93] = AN ? 1 + (Math.random() * 2 - 1) * 0.035 * NBAN.drift : 1; a[94] = AN && NBAN.model !== "svf" ? 0 : 1; };
      const attack = p.attack != null ? expMap(p.attack, 0.004, 4) : 0.003;
      let release = expMap(p.release == null ? 0.3 : p.release, 0.05, 6);
      if (id === "juno") {
        const cut = expMap(p.cutoff, 180, 14000), sweep = 0.8 + 1.1 * (1 - p.cutoff), fa = Math.max(0.012, attack * 0.8), fd = 0.35 + 0.9 * p.release;
        const dco = p.dco == null ? 0.35 : p.dco, lv = x => Math.max(0, 1 - Math.abs(x));
        const hpfV = p.hpf == null ? 0 : p.hpf, hpfHz = hpfV < 0.2 ? 0 : hpfV < 0.5 ? 90 : hpfV < 0.8 ? 230 : 520;
        const chMode = p.chorus < 0.12 ? 0 : p.chorus < 0.55 ? 1 : p.chorus < 0.88 ? 2 : 3, dryG = 1 - (chMode ? 0.85 : 0) * 0.35;
        a.set([1, cut, Math.min(16000, cut * Math.pow(2, sweep)), Math.min(16000, cut * Math.pow(2, sweep * 0.3)), fa, fd, attack, release,
          lv(dco / 0.45) * 0.36, lv((dco - 0.5) / 0.5) * 0.26 + (dco > 0.2 && dco < 0.8 ? 0.04 : 0), lv((dco - 0.8) / 0.35) * 0.2, Math.max(0, dco - 0.75) * 0.8,
          p.pwm * 0.42, 0.55 + Math.random() * 0.1, hpfHz, dryG, drift]);
        anSet();
        return { a, chorus: chMode ? ["juno", chMode, dryG] : null };
      }
      if (id === "bells") {   // (178) the Comb Bells (020): the modes between materials, each partial and its shimmer copy ringing down
        const m = p.material * 2, i0 = Math.min(1, Math.floor(m)), fr = m - i0, ring = expMap(p.ring, 0.3, 8), amps = [1, 0.5, 0.35, 0.25, 0.18];
        const ratios = MODES[0].map((_, k) => MODES[i0][k] * (1 - fr) + MODES[i0 + 1][k] * fr), parts = [];
        ratios.forEach((r, k) => { if (f * r > 17000) return; const lv0 = amps[k] * (k ? 0.4 + p.hardness * 0.9 : 1) * 0.3, dec = ring / (1 + k * 0.9);
          parts.push([r, 0, lv0, dec]); if (p.shimmer >= 0.02) parts.push([r, p.shimmer * 14, lv0 * 0.6, dec]); });
        a[0] = 3; a[1] = parts.length; parts.forEach((q, k) => a.set(q, 2 + k * 4));
        a[60] = p.hardness * 0.25; a[61] = 2000 + p.hardness * 5000; a[71] = release; a[72] = drift; anSet();
        return { a, chorus: null };
      }
      if (id === "fm") {   // (185) the FM synth (090's fmVoice): six operators, the algorithm's links and carriers, the feedback table
        const P = fmPatch(), [links, carriers, fbOp] = FM_ALGS[(P.alg | 0) % 32];
        const bright = 0.25 + p.bright * 1.75, atk = 1 + p.attack * 12, rel = 0.4 + p.release * 2.2;
        const fbAmt = Math.min(7, (P.fb | 0) + Math.round((p.feedback - 0.3) * 6));
        let relMax = 0.1; a[0] = 4; a[1] = 6;
        for (let k = 0; k < 6; k++) {
          const o = P.ops[k], fixed = !!o[12];
          const ratio = fixed ? 0 : (o[0] === 0 ? 0.5 : o[0]) * (1 + o[1] / 100);
          const freq = fixed ? Math.pow(10, o[0] % 4) * Math.pow(10, o[1] / 100) : f * ratio;
          const isCar = carriers.includes(k + 1), amp = outAmp(o[3]), scale = isCar ? amp : amp * 4.2 * bright * Math.max(20, freq);
          const [r1, r2, r3, r4] = [o[4], o[5], o[6], o[7]], [l1, l2, l3, l4] = [o[8], o[9], o[10], o[11]];
          const t1 = egTime(r1) * atk * 0.25, t2 = t1 + egTime(r2) * 0.5, t3 = t2 + egTime(r3) * 0.5;
          relMax = Math.max(relMax, egTime(r4) * 0.5 * rel);
          a.set([freq, (o[2] - 7) * 1.4 + (k % 2 ? 1 : -1) * p.spread * 9 * (k + 1) / 3, k + 1 === fbOp && fbAmt > 0 ? natTable(fbSpectrum(fbAmt / 7 * 0.95)) : -1, isCar ? 1 : 0,
            egAmp(l4) * scale, t1, egAmp(l1) * scale, t2, egAmp(l2) * scale, t3, egAmp(l3) * scale + 1e-6], 2 + k * 12);
        }
        a[80] = Math.min(16, links.length); links.slice(0, 16).forEach(([fr, to], j) => { a[81 + j * 2] = fr; a[82 + j * 2] = to; });
        a[120] = 0.32 / Math.sqrt(carriers.length); a[121] = Math.min(8, relMax);
        return { a, chorus: null };
      }
      a[0] = 2; a[72] = drift;
      const osc = list => { a[1] = list.length; list.forEach((o, i) => { const b = 2 + i * 7; a[b] = o.w; a[b + 1] = o.mul || 1; a[b + 2] = o.det || 0; a[b + 3] = o.det0 != null ? o.det0 : (o.det || 0); a[b + 4] = o.ramp || 0; a[b + 5] = o.g; a[b + 6] = o.ph || 0; }); };
      const filt = (type, q, mode, base, peak, settle, t1, tau, dr) => { a[58] = type; a[59] = q; a[60] = mode; a[61] = base; a[62] = peak; a[63] = settle; a[64] = t1; a[65] = tau; a[90] = dr || (type === 2 ? 1.25 : 1); };
      const amp = (atk, peak, sus, tau, mode) => { a[66] = atk; a[67] = peak; a[68] = sus; a[69] = tau; a[70] = mode; };
      const SAW = 0, SQR = 1, TRI = 2;
      let chorus = null;
      if (id === "saw") {
        const spread = p.detune * 45, ph = 0;   // (all from phase 0, like the browser's oscillators: the start of the note and how the mix compressor hears it match)
        osc([-1, -0.62, -0.28, 0, 0.28, 0.62, 1].map((o, i) => ({ w: SAW, det: o * spread, g: i === 3 ? 0.16 : 0.11, ph })));
        filt(1, 0.5 + p.res * 14, 0, expMap(p.cutoff, 180, 14000)); amp(attack, 0.32, -1, 0.4, 0);
      } else if (id === "analog") {
        const base = expMap(p.cutoff, 120, 9000), top = Math.min(16000, base * (1 + p.env * 18));
        osc([{ w: SAW, det: -6, g: 0.22 }, { w: SQR, det: 7, g: 0.12 }, { w: TRI, mul: 0.5, g: 0.18 }]);
        filt(1, 0.7 + p.res * 16, 1, base, top, base * 1.3, Math.max(0.005, attack * 0.6), 0.35); amp(attack, 0.5, 0.38, 0.4, 1);
      } else if (id === "hoover") {
        const diveC = p.dive * 1100, diveT = 0.08 + p.dive * 0.4, spread = 8 + p.detune * 30;
        osc([[-1, 1, 0.16], [0, 1, 0.18], [1, 1, 0.16], [0, 0.5, 0.2], [0.5, 2, 0.06]].map(([k, mul, g]) => ({ w: SAW, mul, det: k * spread, det0: k * spread + diveC, ramp: diveT, g })));
        a[75] = 1; a[76] = Math.min(0.045, 0.35 / f); a[77] = Math.min(0.02, p.width * 0.3 / f); a[78] = 3 + p.width * 4; a[79] = -0.7; a[80] = 9500; a[81] = 0.5; a[82] = 0.7;
        amp(attack, 0.4, -1, 0.4, 0); chorus = ["hoover", 0, 0.7];
      } else if (id === "alpha") {   // (201) the Alpha Juno (885): its DCO (wave 6, nb_engine.cc's AJOsc) with PWM, the sub an octave down, the dive, the 24 dB filter, the Juno chorus
        const dv = p.dive || 0, diveC = dv * 1200, diveT = 0.05 + dv * 0.45;
        osc([{ w: 6, g: 0.36, det: 0, det0: diveC, ramp: diveT }, { w: SQR, mul: 0.5, g: (p.sub || 0) * 0.5, det: 0, det0: diveC, ramp: diveT }]);
        a[130] = Math.min(5, Math.floor((p.wave == null ? 0.45 : p.wave) * 6)); a[138] = 0.08 + (p.pw == null ? 0.5 : p.pw) * 0.84; a[139] = (p.pwm || 0) * 0.85; a[140] = 0.3 + (p.pwm || 0) * 5.7;
        const base = expMap(p.cutoff == null ? 0.75 : p.cutoff, 90, 15000);
        filt(2, 0.7 + (p.res || 0) * 16, 1, base, Math.min(16000, base * 2.2), base * 1.15, Math.max(0.005, attack * 0.6), 0.5);
        amp(attack, 0.42, -1, 0.4, 0);
        const ch = p.chorus == null ? 0.9 : p.chorus, cm = ch < 0.12 ? 0 : ch < 0.55 ? 1 : ch < 0.88 ? 2 : 3;
        chorus = cm ? ["juno", cm, 0.8] : null;
      } else if (id === "mono") {
        release = expMap(p.release, 0.04, 2.5);
        const base = expMap(p.cutoff, 60, 8000), peak = Math.min(16000, base * (1 + p.env * 24)), dec = 0.04 + expMap(p.release, 0.05, 1.2) * 0.45;
        const glideT = p.glide > 0.03 && natMonoLast && t - natMonoLast.t < 2 && Math.abs(natMonoLast.f - f) > 1 ? expMap(p.glide, 0.02, 0.6) : 0;
        if (glideT) { a[73] = natMonoLast.f / f; a[74] = glideT; }
        natMonoLast = { f, t };
        osc([{ w: SAW, g: 0.3 }, { w: SQR, det: -5, g: 0.16 }, { w: SQR, mul: 0.5, g: 0.22 }]);
        filt(2, 0.5 + p.res * 11, 2, base, peak, base, 0.004, dec); amp(0.004, 0.55, -1, 0.4, 0);
      } else if (id === "pluck") {
        const dec = expMap(p.decay, 0.06, 1.6), top = expMap(p.bright, 900, 16000), floor = 120 + p.body * 500;
        osc([{ w: SAW, det: -6, g: 0.22 }, { w: SAW, det: 6, g: 0.22 }, { w: SQR, det: 1200, g: 0.05 + p.bright * 0.08 }, { w: TRI, det: -1200, g: 0.12 }]);
        filt(1, 0.7 + p.body * 7, 2, floor, top, floor, 0.003, dec * 0.45);
        a[83] = p.pick * 0.5; a[84] = 2500 + p.pick * 4000; a[85] = 1.5; a[86] = 0.015 + p.pick * 0.02;
        amp(0.003, 0.6, -1, dec / 2.5, 2); release = Math.min(release, dec);
      } else if (id === "tyrell") {
        const peak = Math.min(16000, 240 * (2 + p.bite * 16)), swell = expMap(p.swell, 0.03, 1.5);
        osc([{ w: SAW, det: -8, det0: -36, ramp: 0.08, g: 0.2 }, { w: SAW, det: 8, det0: -20, ramp: 0.08, g: 0.2 }, { w: SQR, det: 0, det0: -28, ramp: 0.08, g: 0.1 }]);
        filt(2, 0.5 + p.bite * 6, 1, 240, peak, peak * 0.45, swell, 0.6); amp(attack, 0.48, -1, 0.4, 0);
        a[87] = p.vibrato * 22; a[88] = 0.75; a[89] = 5.6;
      } else if (id === "sync") {   // (178) three hard-synced waves crossfaded from a high ratio down to the resting one, a sub saw, the svf
        const rEnd = 1 + p.sync * 3, rStart = rEnd * (1 + p.sweep * 1.6), rMid = Math.sqrt(rStart * rEnd), sweepT = 0.05 + p.sweep * 0.5;
        osc([{ w: 4, mul: rStart, g: 0.3 }, { w: 4, mul: rMid, g: 0.3 }, { w: 4, mul: rEnd, g: 0.3 }, { w: SAW, det: -7, g: 0.1 }]);
        a[99] = sweepT; a[100] = 1; a[101] = 2; a[102] = 3;
        filt(1, 1.2, 0, expMap(p.bite, 500, 15000)); amp(attack, 0.5, -1, 0.4, 0);
      } else if (id === "vital") {   // (185) the Morph Pad: two neighbouring tables (two detuned copies each), motion trading them and breathing the filter
        const S = morphSpectra(), pos = p.morph * (S.length - 1), i0 = Math.min(S.length - 2, Math.floor(pos)), frac = pos - i0;
        const cut = expMap(p.tone, 400, 14000), depth = p.motion * Math.min(0.5, Math.max(frac, 1 - frac)), tA = natTable(S[i0]), tB = natTable(S[i0 + 1]);
        if (tA < 0 || tB < 0) return null;
        osc([[tA, -7, 1 - frac], [tA, 7, 1 - frac], [tB, -7, frac], [tB, 7, frac]].map(([tb, det, g]) => ({ w: 5, det: det + (Math.random() - 0.5) * 4, g: 0.24 * g, ph: tb })));
        a[108] = 0.08 + p.motion * 1.1; a[109] = p.motion * cut * 0.45; a[110] = a[111] = -0.24 * depth; a[112] = a[113] = 0.24 * depth;
        filt(1, 0.6, 0, cut); amp(attack, 0.42, -1, 0.4, 0);
      } else if (id === "zeb") {   // (185) the Spectral Drone: the plain spectrum (two detuned) and the peaked one, evolve trading them, a sine sub
        const tA = natTable(zebSpectrum(p, 0)), tB = natTable(zebSpectrum(p, 5 + Math.round(p.bright * 6)));
        if (tA < 0 || tB < 0) return null;
        osc([{ w: 5, det: -5, g: 0.26 * 0.6, ph: tA }, { w: 5, det: 5, g: 0.26 * 0.6, ph: tA }, { w: 5, g: 0.26 * 0.4, ph: tB }, { w: 3, mul: 0.5, g: 0.12 }]);
        a[108] = 0.03 + p.evolve * 0.3; a[110] = a[111] = -p.evolve * 0.4 * 0.26; a[112] = p.evolve * 0.4 * 0.26;
        a[80] = 9000; a[81] = Math.pow(10, 1 / 20); amp(attack, 0.42, -1, 0.4, 0);
      } else if (id === "choir") {   // (185) the Ghost Choir: three saws and breath through three formants of the vowel, vibrato
        const x = p.vowel * 4, i0 = Math.min(3, Math.floor(x)), fr = x - i0;
        osc([{ w: SAW, det: -7, g: 0.22 }, { w: SAW, det: 6, g: 0.22 }, { w: SAW, det: 1203, g: 0.06 }]);
        a[118] = 1; [0, 1, 2].forEach(k => { a[119 + k] = VOWELS[i0][k] * (1 - fr) + VOWELS[i0 + 1][k] * fr; a[122 + k] = [8, 11, 13][k]; a[125 + k] = [1, 0.6, 0.35][k] * 3.4; });
        a[128] = p.breath * 0.35; a[129] = 700;
        a[87] = p.vib * 26; a[88] = 0.001; a[89] = 5.0 + Math.random() * 0.6;
        amp(attack, 0.42, -1, 0.4, 0);
      } else return null;
      a[71] = release;
      anSet();
      if (a[58] && (!AN || NBAN.model === "svf")) { a[58] = 1; a[90] = 1; }   // (no Analog core: the browser's biquad; or the model picked on the Analog bar)
      else if (a[58] && AN && NBAN.model === "ladder") { a[58] = 2; a[90] = 1.25; }
      return { a, chorus };
    }
    window.__nbNativeVoice = (midi, id, mix, when, dest) => {
      if (!NATIVE_IDS.has(id) || !NE.ok || !NE.on || NE.ctx !== ctx || !dest || (TABLE_IDS.has(id) && typeof NAT.table !== "function")) return null;
      const t = when == null ? ctx.currentTime : when;
      const np = natParams(id, state.params[id], midi, t); if (!np) return null;
      const b = busFor(dest); if (b < 0) return null;
      const vid = ++NE.id;
      if (!NAT.note(vid, b, Math.round(t * NE.sr), midi, mix, np.a)) return null;
      NE.notes++; NE.byKind[id] = (NE.byKind[id] || 0) + 1;
      // its chorus (the Juno's, the Hoover's): the channel's one shared chorus (020), fed from this bus
      const bus = NE.buses[b];
      if (np.chorus) { const c = nbSharedChorus(np.chorus[0], np.chorus[1], dest, np.chorus[2]); if (bus.chorus !== c) { if (bus.chorus) { try { NE.node.disconnect(bus.chorus.input, b); } catch (e) {} } NE.node.connect(c.input, b); bus.chorus = c; } }
      else if (bus.chorus) { try { NE.node.disconnect(bus.chorus.input, b); } catch (e) {} bus.chorus = null; }
      return { midi, native: true, oscs: [], stop(at) { try { NAT.off(vid, Math.round((at == null ? ctx.currentTime : at) * NE.sr)); } catch (e) {} } };
    };
    // the wheels: bend and vibrato reach the engine's notes too
    function nePitch() { if (NE.ok) try { NAT.pitch(pm.bend * pm.range * 100, pm.mod * pm.mod * 55); } catch (e) {} }
    { const ap = applyPitch; applyPitch = function () { const r = ap.apply(this, arguments); nePitch(); return r; }; }
    // Stop and Stop all reach it
    ["panic", "stopAll"].forEach(idn => { const el = document.getElementById(idn); if (el) el.addEventListener("click", () => { if (NE.ok) try { NAT.kill(-1); } catch (e) {} }); });
    // what Settings and Log show
    NE.state = () => { let s = null; try { s = NE.ok ? NAT.stats() : null; } catch (e) {} return { on: NE.on, running: NE.ok, why: NE.why, notes: NE.notes, byKind: NE.byKind, buses: NE.buses.filter(Boolean).length, underruns: NE.hdr ? NE.hdr[2] : 0, ahead: NE.hdr ? Math.round((NE.hdr[1] - NE.hdr[0]) / NE.sr * 1000 * 10) / 10 : null, engine: s }; };
    NE.set = on => { NE.on = !!on; try { localStorage.setItem("nightbloom-native", on ? "on" : "off"); } catch (e) {} if (on) neInit(); else neOff("switched off"); };
  }
