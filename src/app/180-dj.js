  // ---------- DJ: two decks, beat-grid sync (dial + auto), and an 8-pad grab bank ----------
  const DJ = { decks: [], lead: 0, sync: false, bus: null, padBus: null, bank: Array(8).fill(null), padPlay: Array(8).fill(null),
    src: 0, len: 4, q: true, loopPads: false, padVol: 0.85, xf: 0.5, loaded: false, raf: 0, nudge: 0 };
  try { const o = JSON.parse(localStorage.getItem("nightbloom-dj") || "{}"); ["lead", "src", "len", "q", "loopPads", "padVol", "xf"].forEach(k => { if (o[k] != null) DJ[k] = o[k]; }); } catch (e) {}
  const djSave = () => { try { localStorage.setItem("nightbloom-dj", JSON.stringify({ lead: DJ.lead, src: DJ.src, len: DJ.len, q: DJ.q, loopPads: DJ.loopPads, padVol: DJ.padVol, xf: DJ.xf })); } catch (e) {} };
  const djEl = document.getElementById("djView"), djMsgEl = document.getElementById("djMsg");
  let djMsgT = 0;
  const djMsg = (t, keep) => { djMsgEl.textContent = t; clearTimeout(djMsgT); if (!keep) djMsgT = setTimeout(() => { djMsgEl.textContent = djHint(); }, 6000); };
  const DJ_COL = ["#c4a3ff", "#ffb65c", "#7fd6c2", "#ff8fab", "#8ec5ff", "#ffe066", "#9be38a", "#f7a8ff"];
  const djFmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };
  const LEAD = () => DJ.decks[DJ.lead], FOL = () => DJ.decks[1 - DJ.lead];
  const djEff = d => d.bpm0 * d.rate;            // the tempo you hear (without a nudge)
  const djPer = d => 60 / d.bpm0;                // one beat, in seconds of the song itself

  // --- beat finder: onset strength → autocorrelation → a comb fit over the whole song ---
  // analysis results per decoded song (doesn't keep the song alive), and the worker that computes them off the main thread
  const DJ_AN_CACHE = new WeakMap(), DJ_AN_SRC = { base: "" };
  let djAnWorker = null, djAnSeq = 0; const djAnWait = new Map();
  function djAnWorkerGet() {
    if (djAnWorker !== null) return djAnWorker;
    try {
      const src = "const FFT4K = (" + String(FFT4K_MAKE) + ")();\nconst KEYS = " + JSON.stringify(KEYS) + ", CAM = " + JSON.stringify(CAM) + ", KPROF = " + JSON.stringify(KPROF) + ";\n" +
        DJ_AN_SRC.base + "\n" + String(djKey) + "\n" +
        "onmessage = e => { const { id, mono, sr } = e.data; try { const buf = { sampleRate: sr, length: mono.length, duration: mono.length / sr, numberOfChannels: 1, getChannelData: () => mono };" +
        " const r = djAnalyse(buf); try { Object.assign(r, djKey(buf)); } catch (x) {} let s = 0; for (const v of r.env) s += v; r.energy = Math.min(1, (s / Math.max(1, r.env.length)) * 2.2);" +
        " postMessage({ id, r }, [r.env.buffer]); } catch (x) { postMessage({ id, err: String(x && x.message || x) }); } };";
      djAnWorker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      djAnWorker.onmessage = e => { const w = djAnWait.get(e.data.id); if (w) { djAnWait.delete(e.data.id); w(e.data); } };
      djAnWorker.onerror = () => { djAnWorker.terminate(); djAnWorker = false; djAnWait.forEach(w => w({ err: "worker" })); djAnWait.clear(); };
    } catch (e) { djAnWorker = false; }
    return djAnWorker;
  }
  async function djAnalyseAsync(buf) {
    if (DJ_AN_CACHE.has(buf)) return DJ_AN_CACHE.get(buf);
    const w = DJ_AN_SRC.base ? djAnWorkerGet() : false;
    if (w) {
      const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, n = buf.length, mono = new Float32Array(n);
      if (c1) for (let i = 0; i < n; i++) mono[i] = 0.5 * (c0[i] + c1[i]); else mono.set(c0);
      const id = ++djAnSeq;
      const res = await new Promise(r => { djAnWait.set(id, r); w.postMessage({ id, mono, sr: buf.sampleRate }, [mono.buffer]); });
      if (res && res.r) { DJ_AN_CACHE.set(buf, res.r); return res.r; }
    }
    return djAnalyse(buf);   // no worker here: the same code on the main thread
  }
  function djAnalyse(buf) {
    const sr = buf.sampleRate, n = buf.length, hop = Math.max(1, Math.round(sr / 200)), fr = sr / hop, F = Math.floor(n / hop);
    const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const env = new Float32Array(F), low = new Float32Array(F), a = Math.exp(-2 * Math.PI * 150 / sr); let y = 0;
    for (let f = 0; f < F; f++) {
      let e = 0, el = 0; const i0 = f * hop;
      for (let i = i0; i < i0 + hop; i++) { const x = c1 ? 0.5 * (c0[i] + c1[i]) : c0[i]; y = (1 - a) * x + a * y; e += x * x; el += y * y; }
      env[f] = Math.sqrt(e / hop); low[f] = Math.sqrt(el / hop);
    }
    let on = new Float32Array(F);
    for (let f = 1; f < F; f++) {
      const d1 = Math.log(1e-3 + env[f]) - Math.log(1e-3 + env[f - 1]), d2 = Math.log(1e-3 + low[f]) - Math.log(1e-3 + low[f - 1]);
      on[f] = 0.5 * Math.max(0, d1) + Math.max(0, d2);
    }
    // remove the slow average so loud sections don't dominate, and smooth a touch
    const W = Math.round(fr * 0.3), ps = new Float64Array(F + 1); for (let f = 0; f < F; f++) ps[f + 1] = ps[f] + on[f];
    const o2 = new Float32Array(F);
    for (let f = 0; f < F; f++) { const lo = Math.max(0, f - W), hi = Math.min(F, f + W + 1); o2[f] = Math.max(0, on[f] - (ps[hi] - ps[lo]) / (hi - lo)); }
    on = new Float32Array(F); for (let f = 1; f < F - 1; f++) on[f] = 0.25 * o2[f - 1] + 0.5 * o2[f] + 0.25 * o2[f + 1];
    let mx = 1e-9; for (let f = 0; f < F; f++) if (env[f] > mx) mx = env[f]; for (let f = 0; f < F; f++) env[f] /= mx;
    const res = { env, envRate: fr, bpm: 0, off: 0 };
    if (F < fr * 4) return res;
    // tempo candidates: autocorrelation weighted toward 120 BPM, with the double-lag as support
    const lagMin = Math.floor(fr * 60 / 200), lagMax = Math.ceil(fr * 60 / 60), ac = new Float64Array(lagMax * 2 + 2);
    for (let L = lagMin; L <= Math.min(lagMax * 2 + 1, F - 1); L++) { let s = 0; for (let f = L; f < F; f++) s += on[f] * on[f - L]; ac[L] = s / (F - L); }
    let best = -1, bL = 0;
    for (let L = lagMin; L <= lagMax; L++) {
      const bpm = 60 * fr / L, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
      const sc = (ac[L] + 0.5 * (ac[2 * L] || 0)) * w;
      if (sc > best) { best = sc; bL = L; }
    }
    if (!bL) return res;
    const l0 = ac[bL - 1] || ac[bL], l2 = ac[bL + 1] || ac[bL], den = l0 - 2 * ac[bL] + l2, adj = den ? 0.5 * (l0 - l2) / den : 0;
    let bpm = 60 * fr / (bL + Math.max(-0.5, Math.min(0.5, adj)));
    // comb fit: the tempo and first-beat position whose grid lands on the most onsets across the song
    const at = t => { const x = t * fr, i = Math.floor(x); if (i < 0 || i >= F - 1) return 0; const u = x - i; return on[i] * (1 - u) + on[i + 1] * u; };
    const dur = n / sr;
    function score(b) {
      const p = 60 / b, steps = 48; let top = -1, off = 0;
      for (let k = 0; k < steps; k++) {
        const o = k * p / steps; let s = 0, c = 0;
        for (let t = o; t < dur; t += p) { s += at(t); c++; }
        s /= Math.max(1, c); if (s > top) { top = s; off = o; }
      }
      return { s: top, off };
    }
    let bb = bpm, bs = score(bpm);
    for (let b = bpm * 0.985; b <= bpm * 1.015; b += 0.05) { const r = score(b); if (r.s > bs.s) { bs = r; bb = b; } }
    for (let b = bb - 0.06; b <= bb + 0.06; b += 0.005) { const r = score(b); if (r.s > bs.s) { bs = r; bb = b; } }
    // most music sits on a whole-number tempo: take it when it fits as well
    const ri = Math.round(bb);
    if (Math.abs(ri - bb) < 0.12) { const r = score(ri); if (r.s >= bs.s * 0.97) { bs = r; bb = ri; } }
    // fine-tune the first beat to a fraction of a frame
    const p = 60 / bb; let fo = bs.off, ft = -1;
    for (let d = -0.01; d <= 0.01; d += 0.0005) { const o = bs.off + d; let s = 0; for (let t = o; t < dur; t += p) s += at(t); if (s > ft) { ft = s; fo = o; } }
    res.bpm = Math.round(bb * 100) / 100; res.off = ((fo % p) + p) % p;
    return res;
  }

  // --- audio: decks → EQ → filter → volume → crossfader → DJ bus → the app's compressor/limiter ---
  function djBuild() {
    if (DJ.bus) return true;
    start(); if (!ctx || !fx || !fx.comp) return false;
    DJ.bus = ctx.createGain(); DJ.bus.gain.value = 0.85; DJ.bus.__soloGroup = "pass"; DJ.bus.connect(fx.comp);
    DJ.padBus = ctx.createGain(); DJ.padBus.gain.value = DJ.padVol; DJ.padBus.__soloGroup = "djpad"; DJ.padBus.connect(DJ.bus);
    DJ.decks.forEach(d => djChain(d));
    djApplyXf();
    return true;
  }
  const bq = (type, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; return b; };
  function djChain(d) {
    d.in = ctx.createGain();
    d.lo = bq("lowshelf", 220, null, 0); d.mid = bq("peaking", 1000, 0.8, 0); d.hi = bq("highshelf", 3500, null, 0);
    d.lp = bq("lowpass", 20000, 0.8); d.hp = bq("highpass", 10, 0.8); d.vol = ctx.createGain(); d.xfg = ctx.createGain();
    d.in.connect(d.lo).connect(d.mid).connect(d.hi).connect(d.lp).connect(d.hp).connect(d.vol).connect(d.xfg); d.xfg.__soloGroup = "dj" + d.i; d.xfg.connect(DJ.bus);
    djApplyEq(d);
  }
  const djEqDb = v => v <= -25.5 ? -50 : v;   // all the way down = kill
  function djApplyEq(d) {
    if (!d.in) return; const t = ctx.currentTime;
    d.lo.gain.setTargetAtTime(djEqDb(d.eq.lo), t, 0.02); d.mid.gain.setTargetAtTime(djEqDb(d.eq.mid), t, 0.02); d.hi.gain.setTargetAtTime(djEqDb(d.eq.hi), t, 0.02);
    const f = d.eq.filt;
    d.lp.frequency.setTargetAtTime(f < -0.02 ? 18000 * Math.pow(150 / 18000, -f) : 20000, t, 0.03);
    d.hp.frequency.setTargetAtTime(f > 0.02 ? 15 * Math.pow(5000 / 15, f) : 10, t, 0.03);
    d.vol.gain.setTargetAtTime(d.eq.vol * d.eq.vol, t, 0.02);
  }
  function djApplyXf() {
    if (!DJ.bus) return; const t = ctx.currentTime, x = DJ.xf;
    DJ.decks[0].xfg.gain.setTargetAtTime(Math.cos(x * Math.PI / 2), t, 0.015);
    DJ.decks[1].xfg.gain.setTargetAtTime(Math.sin(x * Math.PI / 2), t, 0.015);
  }
  function djNewDeck(i) {
    return { i, buf: null, name: "", bpm0: 0, off: 0, env: null, envRate: 200, rate: 1, bend: 1, src: null, sg: null, t0: 0, p0: 0, playing: false, loop: null, cue: 0,
      eq: { hi: 0, mid: 0, lo: 0, filt: 0, vol: 0.9 }, taps: [], img: null, cues: [null, null, null, null] };
  }
  DJ.decks = [djNewDeck(0), djNewDeck(1)];

  // --- transport ---
  function djPos(d) {
    if (!d.buf) return 0;
    if (!d.playing || !ctx) return d.p0;
    let p = d.p0 + Math.max(0, ctx.currentTime - d.t0) * d.rate * d.bend;
    if (d.loop && p >= d.loop.b) { const L = d.loop.b - d.loop.a; p = d.loop.a + ((p - d.loop.a) % L); }
    return Math.min(p, d.buf.duration);
  }
  function djRebase(d) { d.p0 = djPos(d); d.t0 = Math.max(ctx.currentTime, d.t0); if (d.t0 > ctx.currentTime) return; d.t0 = ctx.currentTime; }
  function djSetRate(d, r) {
    r = Math.max(0.5, Math.min(2, r));
    if (d.playing) { djRebase(d); d.src.playbackRate.setValueAtTime(r * d.bend, ctx.currentTime); }
    d.rate = r;
  }
  function djSetBend(d, b) {
    if (d.playing) { djRebase(d); d.src.playbackRate.setValueAtTime(d.rate * b, ctx.currentTime); }
    d.bend = b;
  }
  function djStopSrc(d, at) {
    if (!d.src) return; const s = d.src, g = d.sg; d.src = null; d.sg = null;
    try { g.gain.setValueAtTime(1, at); g.gain.linearRampToValueAtTime(0, at + 0.008); s.stop(at + 0.012); } catch (e) {}
  }
  function djStartSrc(d, at, from) {
    from = Math.max(0, Math.min(from, d.buf.duration - 0.01));
    const src = ctx.createBufferSource(); src.buffer = d.buf; src.playbackRate.value = d.rate * d.bend;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.008);
    if (d.loop) { src.loop = true; src.loopStart = d.loop.a; src.loopEnd = d.loop.b; }
    src.connect(g).connect(d.in);
    djStopSrc(d, at);
    src.start(at, from);
    src.onended = () => { if (d.src === src) { d.src = null; d.playing = false; d.p0 = d.buf.duration; djPaintDeck(d); } };
    d.src = src; d.sg = g; d.t0 = at; d.p0 = from; d.playing = true;
  }
  function djPlay(d, on) {
    if (!d.buf || !djBuild()) return;
    if (on == null) on = !d.playing;
    if (!on && d.playing) { d.p0 = djPos(d); djStopSrc(d, ctx.currentTime); d.playing = false; }
    else if (on && !d.playing) {
      if (d.p0 >= d.buf.duration - 0.05) d.p0 = 0;
      const o = DJ.decks[1 - d.i];
      if (DJ.sync && o.playing && o.bpm0 && d.bpm0) { if (d.i === DJ.lead) DJ.lead = 1 - d.i; djAlign(true); }   // locked: come in on the beat
      else djStartSrc(d, ctx.currentTime + 0.02, d.p0);
    }
    djPaintAll();
  }
  function djSeek(d, p) {
    if (!d.buf) return;
    p = Math.max(0, Math.min(p, d.buf.duration - 0.05));
    const o = DJ.decks[1 - d.i];
    if (d.playing && DJ.sync && o.playing && o.bpm0 && d.bpm0) p = djInPhase(d, o, p, ctx.currentTime + 0.01);   // stay locked by landing on the other song's beat; the other song is never moved
    if (djOutOfLoop(d, p)) djLoop(d, 0);
    if (d.playing) djStartSrc(d, ctx.currentTime + 0.01, p); else d.p0 = p;
  }
  // (175) a beat loop ends when the song jumps out of it; the song loop (n "song") goes round whatever it jumps to
  const djOutOfLoop = (d, p) => !!d.loop && d.loop.n !== "song" && (p < d.loop.a || p >= d.loop.b);
  const djBeatFloor = (d, p) => d.bpm0 ? d.off + Math.floor((p - d.off) / djPer(d) + 1e-6) * djPer(d) : p;
  function djLoop(d, n) {
    if (!d.buf) return;
    if (d.playing) djRebase(d);
    if (!n || (d.loop && d.loop.n === n)) {
      d.loop = null; if (d.src) d.src.loop = false;
    } else {
      if (!d.bpm0) { djMsg("Deck " + "AB"[d.i] + " has no beat grid yet: tap Tap along with the beat first"); return; }
      const p = djPos(d); let a = djBeatFloor(d, p); if (a < 0) a += djPer(d);
      const b = Math.min(d.buf.duration, a + n * djPer(d));
      d.loop = { a, b, n };
      if (d.src) { d.src.loopStart = a; d.src.loopEnd = b; d.src.loop = true; }
    }
    djPaintDeck(d);
  }
  // (175) loop the whole song on a deck: with a beat grid, from its first beat to the end of its last whole bar, so it goes
  // round on the beat (and stays locked with the other deck); without one, start to end. The intro plays the first time.
  function djLoopSong(d) {
    if (!d.buf) return;
    if (d.loop && d.loop.n === "song") { djLoop(d, 0); djMsg("Deck " + "AB"[d.i] + " plays on to the end of the song"); return; }
    if (d.playing) djRebase(d);
    const dur = d.buf.duration; let a = 0, b = dur;
    if (d.bpm0) {
      const per = djPer(d), bar = 4 * per;
      a = ((d.off % per) + per) % per;
      const nb = Math.floor((dur - a) / bar + 1e-6);
      if (nb >= 1) b = a + nb * bar; else a = 0;
    }
    d.loop = { a, b, n: "song" };
    if (d.src) { d.src.loopStart = a; d.src.loopEnd = b; d.src.loop = true; }
    djMsg("Deck " + "AB"[d.i] + " loops the song" + (d.bpm0 ? " (" + djFmt(a) + " to " + djFmt(b) + ", whole bars, on the beat)" : "") + " · tap Song again to let it end");
    djPaintDeck(d);
  }
  function djCue(d) {
    if (!d.buf) return;
    if (d.playing) { djSeek(d, d.cue); djMsg("Back to the cue point (" + djFmt(d.cue) + ") on " + "AB"[d.i]); }
    else { d.cue = d.bpm0 ? Math.max(0, djBeatFloor(d, d.p0 + djPer(d) / 2)) : d.p0; d.p0 = d.cue; djMsg("Cue set at " + djFmt(d.cue) + " on " + "AB"[d.i] + " · Cue while playing jumps back here (tap the wave to pick another spot first)"); }
    djPaintDeck(d);
  }

  // --- sync ---
  const frac = x => x - Math.floor(x);
  function djPhaseAt(d, ahead) { return frac((djPos(d) + ahead * d.rate * d.bend - d.off) / djPer(d)); }
  function djDiff() {   // the other song's beat offset from the lead, in beats (−0.5…0.5); + means it's ahead
    const L = LEAD(), F = FOL(); if (!L.bpm0 || !F.bpm0 || !L.playing || !F.playing) return null;
    let x = djPhaseAt(F, 0) - djPhaseAt(L, 0); return x - Math.round(x);
  }
  function djMatchRate() {   // the other song's rate that matches the lead (allowing for half/double-time grids)
    const L = LEAD(), F = FOL(); if (!L.bpm0 || !F.bpm0) return null;
    let best = null;
    for (const m of [1, 2, 0.5]) { const r = djEff(L) / (F.bpm0 * m); if (!best || Math.abs(Math.log(r)) < Math.abs(Math.log(best.r))) best = { r, m }; }
    return best;
  }
  function djAlign(startIt) {
    const L = LEAD(), F = FOL();
    const mr = djMatchRate(); if (!mr) return false;
    if (mr.m !== 1) { F.bpm0 *= mr.m; F.off = ((F.off % djPer(F)) + djPer(F)) % djPer(F); }
    const r = Math.max(0.5, Math.min(2, mr.r));
    if (!F.playing && !startIt) { djSetRate(F, r); return true; }
    const lead = 0.06, at = ctx.currentTime + lead;
    const phL = L.playing ? djPhaseAt(L, lead) : frac((L.p0 - L.off) / djPer(L));
    const posNow = F.playing ? djPos(F) + lead * F.rate * F.bend : F.p0, pF = djPer(F);
    let k = Math.round((posNow - F.off) / pF - phL), target = F.off + (k + phL) * pF;
    if (target < 0) target += pF; if (target > F.buf.duration - 0.1) target -= pF * Math.ceil((target - F.buf.duration + 0.1) / pF);
    if (djOutOfLoop(F, target)) { F.loop = null; }
    F.rate = r; F.bend = 1;
    djStartSrc(F, at, target);
    return true;
  }
  function djAuto() {
    if (!djBuild()) return;
    const A = DJ.decks[0], B = DJ.decks[1];
    if (!A.buf || !B.buf) { djMsg("Load a song on both decks first"); return; }
    if (DJ.sync) { DJ.sync = false; djMsg("Sync unlocked: the songs keep playing as they are"); djPaintAll(); return; }
    // the song that's already playing leads
    if (A.playing !== B.playing) DJ.lead = A.playing ? 0 : 1;
    const L = LEAD(), F = FOL();
    if (!L.bpm0 || !F.bpm0) { djMsg("Deck " + "AB"[(L.bpm0 ? F : L).i] + " has no beat grid: tap Tap along with it, then try again"); return; }
    if (!L.playing) djStartSrc(L, ctx.currentTime + 0.02, L.p0);
    djAlign(true); DJ.sync = true;
    const r = F.rate; djMsg("Locked: " + "AB"[F.i] + " plays at " + djEff(F).toFixed(1) + " BPM, on " + "AB"[L.i] + "'s beat" + (Math.abs(r - 1) > 0.16 ? " (that's a big tempo change; try another song if it sounds stretched)" : ""));
    djSave(); djPaintAll();
  }
  function djJump(beats) {
    const F = FOL(); if (!F.buf || !F.bpm0) { djMsg("The other deck needs a song with a beat grid"); return; }
    djSeek(F, djPos(F) + beats * djPer(F)); djMsg("Moved " + "AB"[F.i] + (beats > 0 ? " forward" : " back") + " one beat");
  }

  // --- loading ---
  async function djDecodeFile(file) { const ab = await file.arrayBuffer(); const copy = ab.slice(0); return { buf: await decode(ab), raw: copy }; }
  async function djLoad(d, buf, name, raw, meta) {
    if (!djBuild()) return;
    if (d.playing) { djStopSrc(d, ctx.currentTime); d.playing = false; }
    d.buf = buf; d.name = name || "Song"; d.p0 = 0; d.cue = 0; d.loop = null; d.rate = 1; d.bend = 1; d.img = null; d.bpm0 = 0; d.off = 0; d.cues = [null, null, null, null];
    djPaintDeck(d); djMsg("Finding the beat on " + "AB"[d.i] + "…", true);
    await new Promise(r => setTimeout(r, 30));
    let an; try { an = meta && meta.env ? { env: meta.env, envRate: meta.envRate } : await djAnalyseAsync(buf); } catch (e) { d.buf = null; d.name = ""; djPaintDeck(d); djMsg("Cancelled"); return; } d.env = an.env; d.envRate = an.envRate;
    if (meta && meta.bpm) { d.bpm0 = meta.bpm; d.off = meta.off || 0; } else { d.bpm0 = an.bpm; d.off = an.off; }
    if (d.bpm0 && d.bpm0 < 70) { d.bpm0 *= 2; } else if (d.bpm0 > 180) d.bpm0 /= 2;
    d.img = null; djPaintDeck(d);
    djMsg(d.bpm0 ? "Deck " + "AB"[d.i] + ": " + d.bpm0.toFixed(2) + " BPM. If that's double or half, use ½× / 2×" : "No steady beat found on " + "AB"[d.i] + ": tap Tap along with it");
    if (raw !== false) djStoreDeck(d, raw);
    if (DJ.sync && DJ.decks.every(x => x.playing)) djAlign(false);
  }
  function djStoreDeck(d, raw) {
    if (!raw && d.buf && d.buf.duration < 90) raw = bufferToWav(d.buf);
    djIdbPut("deck" + d.i, raw ? { name: d.name, data: raw, bpm: d.bpm0, off: d.off } : null);
  }
  const djStoreGrid = d => { if (d && d.buf) setTimeout(() => { try { djSectFor(d); } catch (e) {} }, 50); djIdbGet("deck" + d.i).then(r => { if (r) { r.bpm = d.bpm0; r.off = d.off; r.cues = d.cues; r.cue = d.cue; r.phrase = d.phrase; djIdbPut("deck" + d.i, r); } }); };
  async function djIdbPut(key, val) { try { const db = await idb(), st = db.transaction("samples", "readwrite").objectStore("samples"); if (val) st.put(val, key); else st.delete(key); } catch (e) {} }
  async function djIdbGet(key) { try { const db = await idb(); return await new Promise(res => { const r = db.transaction("samples").objectStore("samples").get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch (e) { return null; } }
  async function djRestore() {
    if (DJ.loaded) return; DJ.loaded = true;
    for (let k = 0; k < 8; k++) { const r = await djIdbGet("dj" + k); if (r && r.data) { try { DJ.bank[k] = { buf: await decode(r.data.slice(0)), name: r.name, bpm: r.bpm || 0, beats: r.beats || 0 }; } catch (e) {} } }
    djPaintPads();
    for (const d of DJ.decks) {
      if (d.buf) continue;
      const r = await djIdbGet("deck" + d.i);
      if (r && r.data) { try { await djLoad(d, await decode(r.data.slice(0)), r.name, false, { bpm: r.bpm, off: r.off }); if (Array.isArray(r.cues)) d.cues = r.cues.slice(0, 4).concat([null, null, null, null]).slice(0, 4); if (r.cue != null && r.cue < d.buf.duration) { d.cue = r.cue; if (!d.playing) d.p0 = r.cue; } djPaintDeck(d); } catch (e) {} }
    }
    djMsgEl.textContent = djHint();
  }
  const djFile = document.getElementById("djFile"); let djFileDeck = 0;
  djFile.addEventListener("change", async () => {
    const f = djFile.files[0]; djFile.value = ""; if (!f) return;
    const d = DJ.decks[djFileDeck];
    djMsg("Opening " + f.name + "…", true);
    try { const { buf, raw } = await djDecodeFile(f); await djLoad(d, buf, f.name.replace(/\.[^.]+$/, ""), raw); }
    catch (e) { djMsg("Couldn't open " + f.name + ". MP3, WAV, M4A and AAC work."); }
  });

  // --- tap tempo: 4+ taps set the tempo and where the beat falls ---
  function djTap(d) {
    if (!d.buf || !djBuild()) return;
    const now = performance.now(); d.taps = d.taps.filter(t => now - t < 2500); d.taps.push(now);
    if (d.taps.length < 4) { djMsg("Keep tapping on the beat… (" + d.taps.length + ")", true); return; }
    const iv = []; for (let k = 1; k < d.taps.length; k++) iv.push(d.taps[k] - d.taps[k - 1]);
    const ms = iv.reduce((a, b) => a + b, 0) / iv.length, heard = 60000 / ms;
    d.bpm0 = Math.round(heard / (d.rate * d.bend) * 100) / 100;
    if (d.playing) d.off = ((djPos(d) - 0.03) % djPer(d) + djPer(d)) % djPer(d);   // the last tap was a beat (minus a little reaction time)
    if (d.taps.length > 8) d.taps.shift();
    djStoreGrid(d); djMsg("Deck " + "AB"[d.i] + " set to " + d.bpm0.toFixed(2) + " BPM by tapping"); djPaintDeck(d);
  }

  // --- the bank: grab exactly N beats, in time, from a deck or the mix ---
  async function djGrab(k) {
    if (!djBuild()) return;
    const n = DJ.len, srcSel = DJ.src;
    if (srcSel < 2) {
      const d = DJ.decks[srcSel]; if (!d.buf) { djMsg("Deck " + "AB"[srcSel] + " is empty"); return; }
      const per = d.bpm0 ? djPer(d) : 0.5, p = djPos(d) + (d.playing ? 0.02 : 0);
      let a = d.bpm0 ? djBeatFloor(d, p) : p; if (d.playing && d.bpm0 && p - a > per * 0.75) a += per;   // nearly on the next beat: start there
      a = Math.max(0, a); const len = Math.min(Math.round(n * per * d.buf.sampleRate), d.buf.length - Math.round(a * d.buf.sampleRate));
      if (len < 256) { djMsg("Not enough song left on " + "AB"[srcSel] + " to grab"); return; }
      const out = ctx.createBuffer(d.buf.numberOfChannels, len, d.buf.sampleRate), i0 = Math.round(a * d.buf.sampleRate);
      for (let c = 0; c < d.buf.numberOfChannels; c++) out.copyToChannel(d.buf.getChannelData(c).subarray(i0, i0 + len), c);
      djDeclick(out);
      djSetPad(k, { buf: out, name: baseName(d.name).slice(0, 18) + " · " + n + (n === 1 ? " beat" : " beats"), bpm: d.bpm0 || 120, beats: n });
      djMsg("Grabbed " + n + (n === 1 ? " beat" : " beats") + " of " + "AB"[srcSel] + " from " + djFmt(a) + " into pad " + (k + 1));
      return;
    }
    // the mix: render both decks from the next beat, through their EQ, filter, volume and the crossfader
    const L = LEAD(), playing = DJ.decks.filter(d => d.buf && d.playing);
    if (!playing.length) { djMsg("Play a deck first, then grab the mix"); return; }
    const tl = L.playing && L.bpm0 ? L : playing.find(d => d.bpm0) || playing[0];
    const per = tl.bpm0 ? 60 / (djEff(tl) * tl.bend) : 0.5;
    const wait = tl.bpm0 ? (1 - djPhaseAt(tl, 0.03)) * per + 0.03 : 0.03, t0 = ctx.currentTime + wait;
    const sr = ctx.sampleRate, len = Math.round(n * per * sr);
    DJ.busy = k; djPaintPads();
    try {
      const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, len, sr);
      for (const d of playing) {
        const g = x => oc.createGain(), q = (type, f, Q, gn) => { const b = oc.createBiquadFilter(); b.type = type; b.frequency.value = f; if (Q != null) b.Q.value = Q; if (gn != null) b.gain.value = gn; return b; };
        const chain = [q("lowshelf", 220, null, djEqDb(d.eq.lo)), q("peaking", 1000, 0.8, djEqDb(d.eq.mid)), q("highshelf", 3500, null, djEqDb(d.eq.hi)),
          q("lowpass", d.lp.frequency.value, 0.8), q("highpass", d.hp.frequency.value, 0.8)];
        const vol = g(); vol.gain.value = d.eq.vol * d.eq.vol * (d.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2));
        const s = oc.createBufferSource(); s.buffer = d.buf; s.playbackRate.value = d.rate * d.bend;
        if (d.loop) { s.loop = true; s.loopStart = d.loop.a; s.loopEnd = d.loop.b; }
        let node = s; for (const c of chain) node = node.connect(c); node.connect(vol).connect(oc.destination);
        let from = djPos(d) + (t0 - ctx.currentTime) * d.rate * d.bend;
        if (d.loop && from >= d.loop.b) from = d.loop.a + ((from - d.loop.a) % (d.loop.b - d.loop.a));
        if (from < d.buf.duration) s.start(0, from);
      }
      const out = await oc.startRendering(); djDeclick(out);
      djSetPad(k, { buf: out, name: "Mix · " + n + (n === 1 ? " beat" : " beats"), bpm: tl.bpm0 ? djEff(tl) * tl.bend : 120, beats: n });
      djMsg("Grabbed " + n + (n === 1 ? " beat" : " beats") + " of the mix into pad " + (k + 1));
    } catch (e) { djMsg("Couldn't grab the mix here (" + (e && e.message || e) + ")"); }
    DJ.busy = -1; djPaintPads();
  }
  function djDeclick(buf) { const f = Math.min(96, buf.length >> 3); for (let c = 0; c < buf.numberOfChannels; c++) { const x = buf.getChannelData(c); for (let i = 0; i < f; i++) { x[i] *= i / f; x[x.length - 1 - i] *= i / f; } } }
  function djSetPad(k, item) {
    djPadStop(k);
    DJ.bank[k] = item; djPaintPads();
    djIdbPut("dj" + k, item ? { name: item.name, data: bufferToWav(item.buf), bpm: item.bpm, beats: item.beats } : null);
  }
  function djPadStop(k, at) { const p = DJ.padPlay[k]; if (!p) return; DJ.padPlay[k] = null; try { const t = at || ctx.currentTime; p.g.gain.setTargetAtTime(0, t, 0.01); p.s.stop(t + 0.08); } catch (e) {} djPaintPads(); }
  function djPadPlay(k) {
    const it = DJ.bank[k]; if (!it || !djBuild()) return;
    if (DJ.padPlay[k] && DJ.loopPads) { djPadStop(k); return; }
    const tl = [LEAD(), FOL()].find(d => d.playing && d.bpm0);
    let at = ctx.currentTime + 0.005, rate = 1;
    if (DJ.q && tl) {
      const per = 60 / (djEff(tl) * tl.bend), ph = djPhaseAt(tl, 0.01);
      at = ctx.currentTime + 0.01 + (ph < 0.12 ? 0 : (1 - ph) * per);   // just past the beat: go now
      if (it.bpm) rate = Math.max(0.5, Math.min(2, djEff(tl) * tl.bend / it.bpm));
    }
    djPadStop(k, at);
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = it.buf; s.playbackRate.value = rate; s.loop = DJ.loopPads;
    g.gain.value = 1; s.connect(g).connect(DJ.padBus); s.start(at);
    const rec = { s, g }; DJ.padPlay[k] = rec;
    s.onended = () => { if (DJ.padPlay[k] === rec) { DJ.padPlay[k] = null; djPaintPads(); } };
    djPaintPads();
  }
  function djPadMenu(k) {
    const it = DJ.bank[k]; if (!it) return;
    const items = [["lab", "Send to the sampler"]];
    for (let j = 0; j < NSLOTS; j++) items.push(["btn", "→ S" + (j + 1) + (sampBuf[j] ? " (replace)" : " (empty)"), () => {
      const b = trimBuffer(it.buf); setSample(j, b, it.name); storeSample(j, it.name, bufferToWav(b)); state.samp.slot = j; save();
      djMsg("Pad " + (k + 1) + " is in sampler slot S" + (j + 1) + " · play it from the Smp tab");
    }]);
    const pe = padBuf.findIndex(b => !b);
    items.push(["lab", "Other places"]);
    items.push(["btn", pe >= 0 ? "→ Pads (P" + (pe + 1) + ")" : "→ Pads (P1, replace)", () => { const j = pe >= 0 ? pe : 0; setPad(j, it.buf, it.name); storePad(j, it.name, it.buf); djMsg("Pad " + (k + 1) + " is on drum pad P" + (j + 1)); }]);
    items.push(["btn", "Save WAV", () => { saveWav(it.name.replace(/[^\w\- ]+/g, "").trim() || "dj-sample", bufferToWav(it.buf)); }]);
    items.push(["btn", "→ Deck A", () => djLoad(DJ.decks[0], it.buf, it.name, null, { bpm: it.bpm, off: 0 })]);
    items.push(["btn", "→ Deck B", () => djLoad(DJ.decks[1], it.buf, it.name, null, { bpm: it.bpm, off: 0 })]);
    items.push(["btn danger wide", "Clear pad " + (k + 1), () => { djSetPad(k, null); djMsg("Pad " + (k + 1) + " cleared"); }]);
    djOpenMenu("Pad " + (k + 1) + " · " + it.name, (it.buf.duration).toFixed(2) + " s" + (it.bpm ? " · " + it.bpm.toFixed(1) + " BPM" : ""), items);
  }
  function djLoadMenu(d) {
    const items = [["btn wide", "Song file… (MP3, WAV, M4A)", () => { djFileDeck = d.i; djFile.click(); }], ["lab", "From the sampler"]];
    for (let j = 0; j < NSLOTS; j++) if (sampBuf[j]) items.push(["btn", "S" + (j + 1) + " · " + baseName(state.samp.slots[j].name).slice(0, 22), () => djLoad(d, sampBuf[j], baseName(state.samp.slots[j].name))]);
    if (!sampBuf.some(Boolean)) items.push(["lab", "(the sampler is empty)"]);
    if (DJ.bank.some(Boolean)) { items.push(["lab", "From the bank"]); DJ.bank.forEach((it, k) => { if (it) items.push(["btn", "Pad " + (k + 1) + " · " + it.name, () => djLoad(d, it.buf, it.name, null, { bpm: it.bpm, off: 0 })]); }); }
    if (d.buf) items.push(["btn danger wide", "Eject " + "AB"[d.i], () => { djPlay(d, false); d.buf = null; d.name = ""; d.env = null; d.bpm0 = 0; d.img = null; d.loop = null; if (DJ.sync) DJ.sync = false; djIdbPut("deck" + d.i, null); djPaintAll(); }]);
    djOpenMenu("Load deck " + "AB"[d.i], "", items);
  }
  const djMenu = document.getElementById("djMenu"), djmList = document.getElementById("djmList");
  function djOpenMenu(title, info, items) {
    document.getElementById("djmTitle").textContent = title; document.getElementById("djmInfo").textContent = info;
    djmList.innerHTML = "";
    for (const [kind, label, fn] of items) {
      if (kind === "lab") { const s = document.createElement("div"); s.className = "lab"; s.textContent = label; djmList.appendChild(s); continue; }
      const b = document.createElement("button"); b.className = kind.replace("btn", "btn") + ""; b.className = "btn " + kind.replace(/^btn\s*/, ""); b.textContent = label;
      b.addEventListener("click", () => { djMenu.hidden = true; fn(); });
      djmList.appendChild(b);
    }
    djMenu.hidden = false;
  }
  document.getElementById("djmCancel").addEventListener("click", () => { djMenu.hidden = true; });

  // --- the deck panels ---
  const djTpl = d => `
    <div class="dj-dh"><span class="dj-letter">${"AB"[d]}</span><span class="dj-beat"></span><div class="dj-name"><b>Empty</b><small>Load a song</small></div><button class="btn dj-load">Load…</button></div>
    <canvas class="dj-wave" aria-label="Song overview: tap to jump"></canvas>
    <div class="dj-row">
      <button class="btn dj-play" aria-pressed="false" aria-label="Play or pause">▶</button>
      <button class="btn dj-cue" title="Stopped: set the cue point here · Playing: jump back to it and keep going">Cue</button>
      <button class="btn dj-restart" aria-label="Restart the song" title="Back to the start of the song (starts it if it's stopped)">⏮</button>
      <div class="dj-bpm"><b>—</b><small>BPM</small></div>
      <span class="dj-gridfix"><small>BPM wrong?</small><button class="btn sm dj-half" title="The BPM was found twice too fast: halve the number (the speed doesn't change)">½×</button><button class="btn sm dj-dbl" title="The BPM was found twice too slow: double the number (the speed doesn't change)">2×</button><button class="btn sm dj-tap" title="Tap 4 or more times on the beat to set the BPM by hand">Tap</button></span>
    </div>
    <div class="dj-speed"><span>Speed</span><button class="btn sm dj-spd" data-s="-0.5" aria-label="Slower">−</button><input type="range" class="dj-tempo" min="-25" max="25" step="0.05" value="0" aria-label="Speed"><button class="btn sm dj-spd" data-s="0.5" aria-label="Faster">+</button><output>0.0%</output></div>
    <div class="dj-loops dj-cues"><span>Hot cues</span><button class="btn" data-c="0" title="Empty: tap to set a cue here · Set: tap to jump there · hold to clear">1</button><button class="btn" data-c="1">2</button><button class="btn" data-c="2">3</button><button class="btn" data-c="3">4</button></div>
    <div class="dj-loops"><span>Loop beats</span><button class="btn" data-n="1">1</button><button class="btn" data-n="2">2</button><button class="btn" data-n="4">4</button><button class="btn" data-n="8">8</button><button class="btn" data-n="16">16</button><button class="btn" data-n="32">32</button><button class="btn dj-lsong" title="Loop the whole song: from its last whole bar it goes round to its first beat, on the beat, until you tap it again">Song</button></div>
    <div class="dj-eq">
      <label class="dj-sl"><span>High</span><input type="range" data-eq="hi" min="-26" max="6" step="0.5" value="0" aria-label="High"><output></output></label>
      <label class="dj-sl"><span>Mid</span><input type="range" data-eq="mid" min="-26" max="6" step="0.5" value="0" aria-label="Mid"><output></output></label>
      <label class="dj-sl"><span>Low</span><input type="range" data-eq="lo" min="-26" max="6" step="0.5" value="0" aria-label="Low"><output></output></label>
      <label class="dj-sl"><span>Filter</span><input type="range" data-eq="filt" min="-1" max="1" step="0.01" value="0" aria-label="Filter"><output></output></label>
      <label class="dj-sl"><span>Volume</span><input type="range" data-eq="vol" min="0" max="1" step="0.01" value="0.9" aria-label="Volume"><output></output></label>
    </div>`;
  const deckEls = [...djEl.querySelectorAll(".dj-deck")];
  deckEls.forEach((el, i) => {
    el.innerHTML = djTpl(i); const d = DJ.decks[i], q = s => el.querySelector(s);
    q(".dj-load").addEventListener("click", () => { djBuild(); djRestore(); djLoadMenu(d); });
    q(".dj-play").addEventListener("click", () => { if (!d.buf) { djLoadMenu(d); return; } djPlay(d); });
    q(".dj-cue").addEventListener("click", () => djCue(d));
    q(".dj-restart").addEventListener("click", () => {
      if (!d.buf) { djLoadMenu(d); return; }
      djSeek(d, 0); if (!d.playing) djPlay(d, true);
      djMsg("Deck " + "AB"[d.i] + ": " + (d.name || "the song") + " from the start"); djPaintDeck(d);
    });
    q(".dj-tap").addEventListener("click", () => djTap(d));
    const gridFix = m => { if (!d.buf) { djMsg("Load a song on " + "AB"[d.i] + " first"); return; } if (!d.bpm0) { djMsg("No beat grid on " + "AB"[d.i] + " yet: tap Tap along with the beat"); return; } d.bpm0 *= m; djStoreGrid(d); djPaintDeck(d); if (DJ.sync) djAlign(false); djMsg("Beat grid on " + "AB"[d.i] + " is now " + d.bpm0.toFixed(1) + " BPM · the speed didn't change (that's the Speed slider)"); };
    q(".dj-half").addEventListener("click", () => gridFix(0.5));
    q(".dj-dbl").addEventListener("click", () => gridFix(2));
    el.querySelectorAll(".dj-spd").forEach(b => b.addEventListener("click", () => { const t = q(".dj-tempo"); t.value = Math.max(-25, Math.min(25, +t.value + +b.dataset.s)); t.dispatchEvent(new Event("input")); }));
    el.querySelectorAll(".dj-cues .btn").forEach(b => {
      const k = +b.dataset.c; let hold = 0, held = false;
      const set = () => { if (!d.buf) { djMsg("Load a song on " + "AB"[d.i] + " first"); return; } const p = djPos(d); d.cues[k] = d.bpm0 ? Math.max(0, djBeatFloor(d, p + djPer(d) / 2)) : p; djStoreGrid(d); djPaintDeck(d); djMsg("Hot cue " + (k + 1) + " set at " + djFmt(d.cues[k]) + " on " + "AB"[d.i] + " · tap it to jump there, hold to clear"); };
      b.addEventListener("pointerdown", e => { e.preventDefault(); held = false; clearTimeout(hold); if (d.cues[k] != null) hold = setTimeout(() => { held = true; d.cues[k] = null; djStoreGrid(d); djPaintDeck(d); djMsg("Hot cue " + (k + 1) + " cleared"); }, 550); });
      const up = () => { clearTimeout(hold); if (held) { held = false; return; } if (d.cues[k] == null) set(); else { djSeek(d, d.cues[k]); djMsg("Jumped to hot cue " + (k + 1) + " (" + djFmt(d.cues[k]) + ") on " + "AB"[d.i]); djPaintDeck(d); } };
      b.addEventListener("pointerup", up); b.addEventListener("pointerleave", () => clearTimeout(hold)); b.addEventListener("pointercancel", () => clearTimeout(hold)); b.addEventListener("contextmenu", e => e.preventDefault());
    });
    const tempo = q(".dj-tempo");
    tempo.addEventListener("input", () => {
      if (!djBuild()) return;
      djSetRate(d, 1 + tempo.value / 100);
      if (DJ.sync) { if (d.i === DJ.lead) { const mr = djMatchRate(); if (mr) djSetRate(FOL(), mr.r); } else { DJ.sync = false; djMsg("Sync unlocked because you moved " + "AB"[d.i] + "'s tempo"); } }
      djPaintAll();
    });
    tempo.addEventListener("dblclick", () => { tempo.value = 0; tempo.dispatchEvent(new Event("input")); });
    q(".dj-speed output").addEventListener("click", () => { tempo.value = 0; tempo.dispatchEvent(new Event("input")); djMsg("Speed back to normal on " + "AB"[d.i]); });
    el.querySelectorAll(".dj-loops .btn[data-n]").forEach(b => b.addEventListener("click", () => djLoop(d, +b.dataset.n)));
    q(".dj-lsong").addEventListener("click", () => djLoopSong(d));
    el.querySelectorAll("[data-eq]").forEach(r => {
      r.addEventListener("input", () => { d.eq[r.dataset.eq] = +r.value; if (djBuild()) djApplyEq(d); djPaintDeck(d); });
      r.addEventListener("dblclick", () => { r.value = r.dataset.eq === "vol" ? 0.9 : 0; r.dispatchEvent(new Event("input")); });
    });
    const wave = q(".dj-wave");
    wave.addEventListener("pointerdown", e => {
      if (!d.buf) { djLoadMenu(d); return; }
      const r = wave.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      let p = x * d.buf.duration; if (d.bpm0) p = djBeatFloor(d, p + djPer(d) / 2);
      djSeek(d, p); djPaintDeck(d);
    });
  });
  function djPaintDeck(d) {
    const el = deckEls[d.i], q = s => el.querySelector(s);
    el.classList.toggle("lead", DJ.lead === d.i);
    q(".dj-name b").textContent = d.buf ? baseName(d.name) : "Empty";
    q(".dj-name small").textContent = d.buf ? djFmt(djPos(d)) + " / " + djFmt(d.buf.duration) + (d.loop ? " · looping " + (d.loop.n === "song" ? "the song" : d.loop.n) : "") + (DJ.lead === d.i ? " · lead" : "") : "Tap Load… for a song";
    const pb = q(".dj-play"); pb.textContent = d.playing ? "❚❚" : "▶"; pb.setAttribute("aria-pressed", String(d.playing));
    q(".dj-bpm b").textContent = d.bpm0 ? (djEff(d) * d.bend).toFixed(1) : "—";
    q(".dj-bpm small").textContent = d.bpm0 ? (Math.abs(d.rate - 1) > 0.0004 ? "from " + d.bpm0.toFixed(1) : "BPM") : "BPM";
    const tempo = q(".dj-tempo"), pct = (d.rate - 1) * 100;
    if (document.activeElement !== tempo) tempo.value = Math.max(-25, Math.min(25, pct));
    q(".dj-speed output").textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    el.querySelectorAll(".dj-cues .btn[data-c]").forEach(b => { const v = d.cues[+b.dataset.c]; b.setAttribute("aria-pressed", String(v != null)); b.textContent = v != null ? (+b.dataset.c + 1) + " · " + djFmt(v) : String(+b.dataset.c + 1); });
    el.querySelectorAll(".dj-loops .btn[data-n]").forEach(b => b.setAttribute("aria-pressed", String(!!d.loop && d.loop.n === +b.dataset.n)));
    q(".dj-lsong").setAttribute("aria-pressed", String(!!d.loop && d.loop.n === "song")); q(".dj-lsong").disabled = !d.buf;
    el.querySelectorAll("[data-eq]").forEach(r => {
      const k = r.dataset.eq, v = d.eq[k]; r.value = v;
      r.nextElementSibling.textContent = k === "vol" ? Math.round(v * 100) + "%" : k === "filt" ? (Math.abs(v) < 0.02 ? "off" : v < 0 ? "low-p" : "high-p") : v <= -25.5 ? "kill" : (v > 0 ? "+" : "") + v + " dB";
    });
  }
  function djPaintAll() {
    DJ.decks.forEach(djPaintDeck);
    djEl.querySelectorAll("[data-lead]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.lead === DJ.lead)));
    const au = document.getElementById("djAuto"); au.setAttribute("aria-pressed", String(DJ.sync)); au.textContent = DJ.sync ? "SYNCED · tap to unlock" : "AUTO SYNC";
    document.getElementById("djXf").value = DJ.xf;
    djEl.querySelectorAll("#djSrc button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.src === DJ.src)));
    djEl.querySelectorAll("#djLen button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.n === DJ.len)));
    document.getElementById("djQ").setAttribute("aria-pressed", String(DJ.q));
    document.getElementById("djLoopPads").setAttribute("aria-pressed", String(DJ.loopPads));
    document.getElementById("djPadVol").value = DJ.padVol;
    const live = DJ.decks.some(d => d.playing), hb = document.getElementById("djBtn"); if (hb) { hb.classList.toggle("live", live); hb.setAttribute("aria-label", live ? "DJ (playing)" : "DJ"); }
    djPaintPads();
  }
  const djPadsEl = document.getElementById("djPads"); DJ.busy = -1;
  for (let k = 0; k < 8; k++) {
    const b = document.createElement("button"); b.className = "dj-pad"; b.style.setProperty("--pc", DJ_COL[k]); b.dataset.k = k;
    b.innerHTML = '<span class="dj-pn"></span><b></b><small></small>';
    let hold = 0, held = false;
    b.addEventListener("pointerdown", e => { e.preventDefault(); held = false; clearTimeout(hold); if (DJ.bank[k]) hold = setTimeout(() => { held = true; djPadMenu(k); }, 520); });
    b.addEventListener("pointerup", () => { clearTimeout(hold); if (held) return; if (DJ.bank[k]) djPadPlay(k); else djGrab(k); });
    b.addEventListener("pointerleave", () => clearTimeout(hold)); b.addEventListener("pointercancel", () => clearTimeout(hold));
    b.addEventListener("contextmenu", e => e.preventDefault());
    djPadsEl.appendChild(b);
  }
  function djPaintPads() {
    djPadsEl.querySelectorAll(".dj-pad").forEach((b, k) => {
      const it = DJ.bank[k]; b.classList.toggle("has", !!it); b.classList.toggle("playing", !!DJ.padPlay[k]); b.classList.toggle("busy", DJ.busy === k);
      b.querySelector(".dj-pn").textContent = k + 1;
      b.querySelector("b").textContent = it ? it.name.split(" · ")[0] : DJ.busy === k ? "Grabbing…" : "+ Grab";
      b.querySelector("small").textContent = it ? (it.beats ? it.beats + (it.beats === 1 ? " beat" : " beats") : it.buf.duration.toFixed(1) + " s") + (DJ.padPlay[k] ? " · ▶" : "") : DJ.len + " from " + ["A", "B", "mix"][DJ.src];
      b.setAttribute("aria-label", it ? "Pad " + (k + 1) + ": " + it.name + ". Tap to play, hold for options" : "Pad " + (k + 1) + ": empty. Tap to grab " + DJ.len + " beats from " + ["deck A", "deck B", "the mix"][DJ.src]);
    });
  }

  // --- centre: lead, sync dial, nudge, jump, auto, crossfader ---
  djEl.querySelectorAll("[data-lead]").forEach(b => b.addEventListener("click", () => { DJ.lead = +b.dataset.lead; djSave(); if (DJ.sync) djAlign(false); djPaintAll(); }));
  document.getElementById("djAuto").addEventListener("click", djAuto);
  document.getElementById("djJumpL").addEventListener("click", () => djJump(-1));
  document.getElementById("djJumpR").addEventListener("click", () => djJump(1));
  const xf = document.getElementById("djXf");
  xf.addEventListener("input", () => { DJ.xf = +xf.value; djApplyXf(); djSave(); });
  xf.addEventListener("dblclick", () => { DJ.xf = 0.5; xf.value = 0.5; djApplyXf(); djSave(); });
  djEl.querySelectorAll("#djSrc button").forEach(b => b.addEventListener("click", () => { DJ.src = +b.dataset.src; djSave(); djPaintAll(); }));
  djEl.querySelectorAll("#djLen button").forEach(b => b.addEventListener("click", () => { DJ.len = +b.dataset.n; djSave(); djPaintAll(); }));
  document.getElementById("djQ").addEventListener("click", () => { DJ.q = !DJ.q; djSave(); djPaintAll(); });
  document.getElementById("djLoopPads").addEventListener("click", () => { DJ.loopPads = !DJ.loopPads; if (!DJ.loopPads) DJ.padPlay.forEach((p, k) => { if (p) p.s.loop = false; }); djSave(); djPaintAll(); });
  document.getElementById("djPadVol").addEventListener("input", e => { DJ.padVol = +e.target.value; if (DJ.padBus) DJ.padBus.gain.setTargetAtTime(DJ.padVol, ctx.currentTime, 0.02); djSave(); });
  [["djNudgeL", 0.96], ["djNudgeR", 1.04]].forEach(([id, b]) => {
    const el = document.getElementById(id), off = () => { el.classList.remove("on"); const F = FOL(); if (F.buf && F.bend !== 1) djSetBend(F, 1); };
    el.addEventListener("pointerdown", e => { e.preventDefault(); const F = FOL(); if (!F.playing) { djMsg("Play the other deck (" + "AB"[F.i] + ") to nudge it"); return; } if (!djBuild()) return; el.classList.add("on"); djSetBend(F, b); try { el.setPointerCapture(e.pointerId); } catch (er) {} });
    el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("lostpointercapture", off);
  });
  // the sync dial: turns the other song's tempo; slow turns are fine, fast turns are big; it clicks onto the match
  const dial = document.getElementById("djDial"), dctx = dial.getContext("2d");
  {
    let drag = null;
    const ang = e => { const r = dial.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    dial.addEventListener("pointerdown", e => { e.preventDefault(); if (!djBuild()) return; const F = FOL(); if (!F.buf) { djMsg("Load a song on deck " + "AB"[F.i] + " to use the dial"); return; } drag = { a: ang(e), t: performance.now(), snapped: false }; dial.setPointerCapture(e.pointerId); dial.style.cursor = "grabbing"; });
    dial.addEventListener("pointermove", e => {
      if (!drag) return; const F = FOL(), a = ang(e), now = performance.now();
      let da = a - drag.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const dt = Math.max(1, now - drag.t), speed = Math.abs(da) / (2 * Math.PI) / (dt / 1000);   // turns per second
      drag.a = a; drag.t = now;
      let r = F.rate * (1 + da / (2 * Math.PI) * (0.012 + 0.05 * Math.min(1, speed / 1.5)));
      const mr = djMatchRate();
      if (mr && Math.abs(r / mr.r - 1) < 0.0012) { if (!drag.snapped) { try { navigator.vibrate && navigator.vibrate(10); } catch (er) {} } drag.snapped = true; r = mr.r; } else drag.snapped = false;
      if (DJ.sync) { DJ.sync = false; djMsg("Sync unlocked: you're steering " + "AB"[F.i] + " by hand"); }
      djSetRate(F, Math.max(0.75, Math.min(1.25, r))); djPaintAll();
    });
    const up = () => { drag = null; dial.style.cursor = "grab"; };
    dial.addEventListener("pointerup", up); dial.addEventListener("pointercancel", up);
    dial.addEventListener("dblclick", () => { const mr = djMatchRate(); if (mr && djBuild()) { djSetRate(FOL(), mr.r); djMsg("Tempos matched · now line up the beats with ◀◀ ▶▶ or Auto sync"); djPaintAll(); } });
  }
  // canvas sizes are read once and again only when a canvas resizes (reading them every frame forces a layout)
  const djSz = new WeakMap(), djRO = (() => { try { return new ResizeObserver(es => es.forEach(e => djSz.delete(e.target))); } catch (e) { return null; } })();
  window.addEventListener("resize", () => { document.querySelectorAll("#djView canvas").forEach(cv => djSz.delete(cv)); });
  const djSize = (cv) => {
    const dpr = window.devicePixelRatio || 1; let S = djSz.get(cv);
    if (!S || S.dpr !== dpr) {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      S = { c: cv.getContext("2d"), w, h, dpr }; djSz.set(cv, S); if (djRO) djRO.observe(cv);
    }
    S.c.setTransform(dpr, 0, 0, dpr, 0, 0); return S;
  };
  let djFontFam = "";
  function djDrawDial() {
    const S = djSize(dial); if (!S) return; const { c, w, h } = S, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6;
    c.clearRect(0, 0, w, h);
    const F = FOL(), L = LEAD(), col = F.i === 0 ? lilac : amber;
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5, toA = r => a0 + span * (Math.max(0.75, Math.min(1.25, r)) - 0.75) / 0.5;
    // tempo track
    c.lineWidth = 8; c.lineCap = "round"; c.strokeStyle = "#2e2a3d"; c.beginPath(); c.arc(cx, cy, R, a0, a0 + span); c.stroke();
    c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, R, toA(1), toA(F.rate), F.rate < 1); c.stroke();
    const mr = djMatchRate();
    if (mr) { const am = toA(mr.r); c.fillStyle = "#7fd6c2"; c.beginPath(); c.moveTo(cx + Math.cos(am) * (R + 6), cy + Math.sin(am) * (R + 6)); c.lineTo(cx + Math.cos(am - 0.06) * (R - 9), cy + Math.sin(am - 0.06) * (R - 9)); c.lineTo(cx + Math.cos(am + 0.06) * (R - 9), cy + Math.sin(am + 0.06) * (R - 9)); c.fill(); }
    // knob body with a pointer
    c.fillStyle = "#1d1a28"; c.beginPath(); c.arc(cx, cy, R - 14, 0, 2 * Math.PI); c.fill(); c.strokeStyle = "#2e2a3d"; c.lineWidth = 1; c.stroke();
    const ap = toA(F.rate); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(cx + Math.cos(ap) * (R - 30), cy + Math.sin(ap) * (R - 30)); c.lineTo(cx + Math.cos(ap) * (R - 16), cy + Math.sin(ap) * (R - 16)); c.stroke();
    // beat ring: dot at the top = in time
    const diff = djDiff(), Rb = R - 40;
    c.strokeStyle = "#2e2a3d"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, Rb, 0, 2 * Math.PI); c.stroke();
    c.fillStyle = "#4a4560"; c.fillRect(cx - 1, cy - Rb - 7, 2, 7);
    if (diff != null) {
      const ms = diff * 60 / (djEff(L) * L.bend) * 1000, good = Math.abs(ms) < 12, near = Math.abs(ms) < 35, ad = -Math.PI / 2 + diff * 2 * Math.PI;
      c.fillStyle = good ? "#7fd6c2" : near ? amber : "#ff7a8a"; c.beginPath(); c.arc(cx + Math.cos(ad) * Rb, cy + Math.sin(ad) * Rb, 6, 0, 2 * Math.PI); c.fill();
    }
    // readout
    c.textAlign = "center"; c.fillStyle = col; c.font = "600 22px " + (djFontFam || (djFontFam = getComputedStyle(document.body).fontFamily));
    c.fillText(F.bpm0 ? (djEff(F) * F.bend).toFixed(1) : "—", cx, cy + 4);
    c.fillStyle = "#8e86a6"; c.font = "10px ui-monospace, monospace";
    c.fillText(F.buf ? "AB"[F.i] + " BPM" : "deck " + "AB"[F.i] + " empty", cx, cy + 19);
    if (L.bpm0) c.fillText("lead " + (djEff(L) * L.bend).toFixed(1), cx, cy - 18);
  }
  function djDrawAlign() {
    const cv = document.getElementById("djAlign"), S = djSize(cv); if (!S) return; const { c, w, h } = S;
    c.clearRect(0, 0, w, h);
    const L = LEAD(), F = FOL(), ref = L.bpm0 ? L : F.bpm0 ? F : null;
    const win = ref ? 4 * 60 / (djEff(ref) * ref.bend) : 3;   // wall seconds across the strip
    [L, F].forEach((d, row) => {
      const y0 = row ? h / 2 + 2 : 0, hh = h / 2 - 2, col = d.i === 0 ? lilac : amber;
      if (!d.buf || !d.env) { c.fillStyle = "#4a4560"; c.font = "10px ui-monospace, monospace"; c.textAlign = "left"; c.fillText("AB"[d.i] + " · " + (d.buf ? "analysing…" : "empty"), 6, y0 + hh / 2 + 3); return; }
      const pos = djPos(d), sp = d.rate * d.bend, E = d.env, er = d.envRate;
      c.fillStyle = col; c.globalAlpha = 0.55;
      for (let x = 0; x < w; x += 2) { const t = pos + (x / w - 0.5) * win * sp, i = Math.floor(t * er); const v = i >= 0 && i < E.length ? E[i] : 0; const bh = v * hh; c.fillRect(x, y0 + (hh - bh) / 2, 2, Math.max(1, bh)); }
      c.globalAlpha = 1;
      if (d.bpm0) {
        const p = djPer(d); let k = Math.ceil((pos - win * sp / 2 - d.off) / p);
        for (;; k++) { const tb = d.off + k * p, x = ((tb - pos) / sp / win + 0.5) * w; if (x > w) break; c.fillStyle = col; c.fillRect(x - 1, y0, 2, hh); }
      }
      c.fillStyle = "#8e86a6"; c.font = "9px ui-monospace, monospace"; c.textAlign = "left"; c.fillText("AB"[d.i], 3, y0 + 10);
    });
    c.fillStyle = "#ece7f7"; c.fillRect(w / 2 - 0.5, 0, 1, h);
  }
  function djDrawWave(d) {
    const cv = d.waveEl || (d.waveEl = deckEls[d.i].querySelector(".dj-wave")), S = djSize(cv); if (!S) return; const { c, w, h } = S;
    const col = d.i === 0 ? lilac : amber;
    if (!d.img || d.img.w !== w || d.img.h !== h) {
      const off = document.createElement("canvas"), dpr = window.devicePixelRatio || 1; off.width = Math.round(w * dpr); off.height = Math.round(h * dpr);
      const o = off.getContext("2d"); o.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (d.env) { const E = d.env, per = E.length / w; o.fillStyle = col; for (let x = 0; x < w; x++) { let m = 0; const i0 = Math.floor(x * per), i1 = Math.max(i0 + 1, Math.floor((x + 1) * per)); for (let i = i0; i < i1; i++) if (E[i] > m) m = E[i]; const bh = Math.max(1, m * (h - 6)); o.fillRect(x, (h - bh) / 2, 1, bh); } }
      d.img = { cv: off, w, h };
    }
    c.clearRect(0, 0, w, h);
    if (!d.buf) { c.fillStyle = "#4a4560"; c.font = "11px ui-monospace, monospace"; c.textAlign = "center"; c.fillText("Tap to load a song", w / 2, h / 2 + 4); return; }
    const dur = d.buf.duration, pos = djPos(d), px = pos / dur * w;
    c.globalAlpha = 0.45; c.drawImage(d.img.cv, 0, 0, w, h); c.globalAlpha = 1;
    c.save(); c.beginPath(); c.rect(0, 0, px, h); c.clip(); c.drawImage(d.img.cv, 0, 0, w, h); c.restore();
    if (d.loop) { c.fillStyle = "rgba(127,214,194,0.22)"; c.fillRect(d.loop.a / dur * w, 0, Math.max(2, (d.loop.b - d.loop.a) / dur * w), h); }
    c.fillStyle = "#7fd6c2"; c.fillRect(d.cue / dur * w - 1, h - 8, 2, 8);
    d.cues.forEach((v, k) => { if (v == null) return; const x = v / dur * w; c.fillStyle = DJ_HC_COL[k]; c.beginPath(); c.moveTo(x - 5, 0); c.lineTo(x + 5, 0); c.lineTo(x, 7); c.fill(); c.fillStyle = "#0f0d16"; c.font = "bold 8px ui-monospace, monospace"; c.textAlign = "center"; c.fillText(String(k + 1), x, 6); });
    c.fillStyle = "#ece7f7"; c.fillRect(px - 1, 0, 2, h);
  }
  let djLastPaint = 0;
  function djFrame(t) {
    DJ.raf = 0; if (djEl.hidden) return;
    DJ.decks.forEach(djDrawWave); djDrawAlign(); djDrawDial();
    DJ.decks.forEach(d => { const on = d.playing && d.bpm0 && djPhaseAt(d, 0) < 0.15; (d.beatEl || (d.beatEl = deckEls[d.i].querySelector(".dj-beat"))).classList.toggle("on", !!on); });
    if (t - djLastPaint > 250) { djLastPaint = t; DJ.decks.forEach(djPaintDeck); djSyncInfo(); }
    DJ.raf = requestAnimationFrame(djFrame);
  }
  function djSyncInfo() {
    const el = document.getElementById("djSyncInfo"), L = LEAD(), F = FOL(), diff = djDiff();
    el.className = "dj-syncinfo";
    if (!L.buf || !F.buf) { el.textContent = "Load both decks"; return; }
    if (!L.bpm0 || !F.bpm0) { el.textContent = "Needs a beat grid on both decks (Tap)"; return; }
    const dB = djEff(F) * F.bend - djEff(L) * L.bend, tempoOk = Math.abs(dB) < 0.05;
    if (diff == null) { el.textContent = "Tempo " + (tempoOk ? "matched ✓" : (dB > 0 ? "+" : "") + dB.toFixed(2) + " BPM") + " · play both to line up the beats"; el.classList.add(tempoOk ? "ok" : "near"); return; }
    const ms = Math.round(diff * 60 / (djEff(L) * L.bend) * 1000);
    if (tempoOk && Math.abs(ms) < 12) { el.textContent = "In time ✓" + (DJ.sync ? " · locked" : ""); el.classList.add("ok"); }
    else { el.textContent = (tempoOk ? "Tempo ✓" : "Tempo " + (dB > 0 ? "+" : "") + dB.toFixed(2)) + " · " + "AB"[F.i] + " " + Math.abs(ms) + " ms " + (ms > 0 ? "early (hold ◀◀)" : "late (hold ▶▶)"); el.classList.add(Math.abs(ms) < 35 && Math.abs(dB) < 0.3 ? "near" : "off"); }
  }
  const djHint = () => { const A = DJ.decks[0], B = DJ.decks[1]; return !A.buf || !B.buf ? "Load a song on each deck (Load…), then press Auto sync" : DJ.sync ? "Locked together · move the lead's tempo and the other follows" : "Press Auto sync, or match by hand with the dial and ◀◀ ▶▶"; };

  // --- open / close ---
  function djOpen() {
    if (!djBuild()) return;
    djEl.hidden = false; djPaintAll(); djRestore(); djMsgEl.textContent = djHint();
    if (!DJ.raf) DJ.raf = requestAnimationFrame(djFrame);
  }
  document.getElementById("djDone").addEventListener("click", () => { djEl.hidden = true; djMenu.hidden = true; djPaintAll(); });
  document.getElementById("djHelpBtn").addEventListener("click", () => { document.getElementById("djHelp").hidden = false; });
  document.getElementById("djHelpDone").addEventListener("click", () => { document.getElementById("djHelp").hidden = true; });
  document.getElementById("djBtn").addEventListener("click", djOpen);
  // Stop (here or in the main view) stops the decks and the pads
  const djStopAll = () => { DJ.decks.forEach(d => { if (d.playing) djPlay(d, false); }); DJ.padPlay.forEach((p, k) => djPadStop(k)); djPaintAll(); };
  document.getElementById("stopAll").addEventListener("click", djStopAll);
  document.getElementById("djStop").addEventListener("click", djStopAll);
  window.addEventListener("resize", () => DJ.decks.forEach(d => { d.img = null; }));
  djPaintAll();

