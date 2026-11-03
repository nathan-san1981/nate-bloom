  // ======================================================================
  // The analog core: modelled filters (AudioWorklet), drift, and the timing guard
  // ======================================================================
  const NBAN = { on: !window.NB_LITE, model: "auto", drive: 0.3, drift: 0.35, ok: false, loading: null, made: 0, alive: 0, plain: 0, stalls: 0, lastStall: 0 };
  const NBAN_MAX = 48, NBAN_LIVE = new Map();
  // the filters working now: the ones heard from lately (one whose voice was unplugged isn't worked on any more, and goes quiet)
  function nbanCount() { const now = performance.now(); for (const [k, at] of NBAN_LIVE) if (now > at) NBAN_LIVE.delete(k); NBAN.alive = NBAN_LIVE.size; return NBAN.alive; }
  setInterval(nbanCount, 1000);   // (174) modelled filters running at once; past this a new voice gets the browser's own filter (one audio thread does all the work, however many cores)
  try { const o = JSON.parse(localStorage.getItem("nightbloom-analog") || "null"); if (o) ["on", "model", "drive", "drift"].forEach(k => { if (o[k] != null) NBAN[k] = o[k]; }); } catch (e) {}
  const saveAn = () => { try { localStorage.setItem("nightbloom-analog", JSON.stringify({ on: NBAN.on, model: NBAN.model, drive: NBAN.drive, drift: NBAN.drift })); } catch (e) {} };
  // Two filters, solved without delay in the feedback (topology-preserving transform), with soft saturation:
  //   ladder: four one-pole stages and global feedback, the Moog / Juno family, 24 dB, gain kept as resonance rises
  //   svf:    the state-variable filter of the Oberheim SEM / OB family, 12 dB
  // Cutoff and resonance arrive as a BiquadFilter's would (Hz, and Q in dB), so the synths drive them unchanged.
  const NB_VCF_SRC = `
const sat = x => x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x);
class NBVcf extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: "frequency", defaultValue: 350, minValue: 10, maxValue: 22000, automationRate: "a-rate" },
    { name: "Q", defaultValue: 1, minValue: -40, maxValue: 40, automationRate: "k-rate" },
    { name: "detune", defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: "a-rate" } ]; }
  constructor(o) {
    super(); const p = (o && o.processorOptions) || {};
    this.lad = p.model === "ladder"; this.mode = 0;
    const d = Math.max(0, Math.min(1, p.drive == null ? 0.3 : p.drive)); this.drv = 1 + 3 * d;
    // each note's filter sits a little differently; a 24 dB ladder sits a little higher so it's as open as the filter it replaces
    this.dr = (this.lad ? 1.25 : 1) * (1 + (Math.random() * 2 - 1) * 0.035 * (p.drift == null ? 0.35 : p.drift));
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0; this.ic1 = 0; this.ic2 = 0; this.quiet = 0; this.hb = 0; this.heard = false;
    this.w = Math.PI / sampleRate; this.ny = sampleRate * 0.45;
    this.port.onmessage = e => { const t = e.data && e.data.type; if (t) this.mode = t === "highpass" ? 1 : t === "bandpass" ? 2 : 0; };
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0][0];
    // (174) a filter lets go ~0.1 s after its note has gone silent; before the note has sounded (an arp or Seq note set up
    // ahead of time) it waits up to a second
    const wait = this.heard ? 40 : 400;
    if (++this.hb >= 150) { this.hb = 0; this.port.postMessage(1); }   // (174) "still working", every ~0.4 s: a filter whose voice was unplugged goes quiet and stops counting
    if (!inp || !inp.length) { out.fill(0); if (++this.quiet < wait) return true; this.port.postMessage(0); return false; }
    { const x0 = inp[0]; let pk = 0; for (let i = 0; i < x0.length; i += 4) { const a = x0[i] < 0 ? -x0[i] : x0[i]; if (a > pk) pk = a; }   // (174) a silent block: no maths
      if (pk < 1e-7 && Math.abs(this.s4) + Math.abs(this.ic2) + Math.abs(this.s1) + Math.abs(this.ic1) < 1e-7) { out.fill(0); if (++this.quiet < wait) return true; this.port.postMessage(0); return false; } }
    const x = inp[0], fr = params.frequency, dtp = params.detune, n = out.length, qd = params.Q[0], drv = this.drv, idr = 1 / drv, lad = this.lad, mode = this.mode;
    const qlin = mode === 2 ? Math.max(0.1, qd) : Math.pow(10, Math.max(-20, Math.min(30, qd)) / 20);
    const k = lad ? Math.min(3.85, 4 * (1 - 1 / Math.max(1, qlin))) : 1 / Math.max(0.5, qlin);
    let s1 = this.s1, s2 = this.s2, s3 = this.s3, s4 = this.s4, ic1 = this.ic1, ic2 = this.ic2, lastF = -1, g = 0, G = 0, a1 = 0, a2 = 0, a3 = 0, en = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 3) === 0 || lastF < 0) { let f = (fr.length > 1 ? fr[i] : fr[0]) * this.dr; const dv = dtp.length > 1 ? dtp[i] : dtp[0]; if (dv) f *= Math.pow(2, dv / 1200); if (f > this.ny) f = this.ny; else if (f < 10) f = 10;
      if (f !== lastF) { lastF = f; g = Math.tan(this.w * f); if (lad) G = g / (1 + g); else { a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; } } }
      const v0 = x[i]; en += v0 * v0;
      if (lad) {
        const G2 = G * G, G4 = G2 * G2, S = (G2 * G * s1 + G2 * s2 + G * s3 + s4) / (1 + g);
        const y4e = (G4 * v0 * (1 + k) + S) / (1 + k * G4);
        const u = sat((v0 * (1 + k) - k * y4e) * drv) * idr;
        let v = (u - s1) * G; const y1 = v + s1; s1 = y1 + v;
        v = (y1 - s2) * G; const y2 = v + s2; s2 = y2 + v;
        v = (y2 - s3) * G; const y3 = v + s3; s3 = y3 + v;
        v = (y3 - s4) * G; const y4 = v + s4; s4 = y4 + v;
        out[i] = mode === 1 ? u - 4 * y1 + 6 * y2 - 4 * y3 + y4 : mode === 2 ? (y2 - y4) * 2 : y4;
      } else {
        const vs = sat(v0 * drv) * idr, v3 = vs - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = sat((2 * v1 - ic1) * 0.5) * 2; ic2 = 2 * v2 - ic2;
        out[i] = mode === 1 ? vs - k * v1 - v2 : mode === 2 ? v1 : v2;
      }
    }
    const tiny = 1e-15;
    this.s1 = Math.abs(s1) < tiny ? 0 : s1; this.s2 = Math.abs(s2) < tiny ? 0 : s2; this.s3 = Math.abs(s3) < tiny ? 0 : s3; this.s4 = Math.abs(s4) < tiny ? 0 : s4;
    this.ic1 = Math.abs(ic1) < tiny ? 0 : ic1; this.ic2 = Math.abs(ic2) < tiny ? 0 : ic2;
    // a note that has gone quiet for a few seconds is finished: let the node go
    if (en < 1e-12 && Math.abs(s4) + Math.abs(ic2) < 1e-6) this.quiet++; else { this.quiet = 0; if (en > 1e-10) this.heard = true; }
    if (this.quiet < (this.heard ? 40 : 400)) return true;   // (174: ~0.1 s of silence, not 2.7 s: a fast arp across five layers kept a hundred of these running)
    this.port.postMessage(0); return false;
  }
}
registerProcessor("nb-vcf", NBVcf);`;
  function nbAnLoad() {
    if (NBAN.loading || !ctx || !ctx.audioWorklet) return NBAN.loading;
    return (NBAN.loading = (async () => {
      for (const url of [() => URL.createObjectURL(new Blob([NB_VCF_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(NB_VCF_SRC)]) {
        try { await ctx.audioWorklet.addModule(url()); NBAN.ok = true; return true; } catch (e) {}
      }
      return false;
    })());
  }
  setInterval(() => { if (ctx && NBAN.on && !NBAN.loading) nbAnLoad(); }, 400);
  // a filter for a synth voice: the modelled one when Analog is on (and ready), the browser's otherwise
  function nbVF(def) {
    if (!NBAN.on || !ctx) return ctx.createBiquadFilter();
    if (!NBAN.ok) { nbAnLoad(); return ctx.createBiquadFilter(); }
    nbanCount();
    if (NBAN.alive >= (performance.now() < NB_HOT ? 16 : NBAN_MAX)) { NBAN.plain++; return ctx.createBiquadFilter(); }   // (175) fewer while the sound is dropping out
    const model = NBAN.model === "auto" ? def : NBAN.model;
    let n;
    try { n = new AudioWorkletNode(ctx, "nb-vcf", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit", processorOptions: { model, drive: NBAN.drive, drift: NBAN.drift } }); }
    catch (e) { return ctx.createBiquadFilter(); }
    n.frequency = n.parameters.get("frequency"); n.Q = n.parameters.get("Q"); n.detune = n.parameters.get("detune"); n.nbAn = true; n.nbModel = model;
    let ty = "lowpass"; Object.defineProperty(n, "type", { get: () => ty, set: v => { if (v !== ty) { ty = v; n.port.postMessage({ type: v }); } } });
    NBAN.made++; const key = NBAN.made; NBAN_LIVE.set(key, performance.now() + 1500); NBAN.alive = NBAN_LIVE.size;
    n.port.onmessage = e => { if (e.data === 1) { if (NBAN_LIVE.has(key)) NBAN_LIVE.set(key, performance.now() + 1200); return; } NBAN_LIVE.delete(key); NBAN.alive = NBAN_LIVE.size; n.port.onmessage = null; };   // (it says it's working, and when it's finished)
    return n;
  }
  // drift: a slightly different, slowly wandering tuning on every note
  function nbDrift(oscs, t) {
    if (!NBAN.on || !ctx || NBAN.drift < 0.01 || !oscs || !oscs.length) return;
    const tgt = oscs.filter(o => o && o.detune && o.frequency && o.frequency.value > 25); if (!tgt.length) return;
    const lfo = ctx.createOscillator(), g = ctx.createGain(); lfo.frequency.value = 0.06 + Math.random() * 0.24; g.gain.value = NBAN.drift * (3 + Math.random() * 4);
    lfo.connect(g); tgt.forEach(o => g.connect(o.detune)); lfo.start(t); oscs.push(lfo);
    if (ctx.createConstantSource) { const cs = ctx.createConstantSource(); cs.offset.value = (Math.random() * 2 - 1) * NBAN.drift * 4; tgt.forEach(o => cs.connect(o.detune)); cs.start(t); oscs.push(cs); }
  }
  // ---- the Analog bar ----
  const AN_FILTERED = new Set(["saw", "analog", "vital", "juno", "tyrell", "mono", "sync", "pluck"]);
  function anPaint() {
    const bar = document.getElementById("anBar"); if (!bar) return;
    const id = state.engine, show = !!ENGINES[id] && id !== "fm";
    bar.hidden = !show; if (!show) return;
    const filt = AN_FILTERED.has(id);
    bar.classList.toggle("off", !NBAN.on);
    const b = document.getElementById("anOn"); b.setAttribute("aria-pressed", String(NBAN.on)); b.textContent = NBAN.on ? "On" : "Off";
    const fs = document.getElementById("anFilt"); fs.hidden = !filt; fs.value = NBAN.model;
    document.getElementById("anDriveK").hidden = !filt;
    document.getElementById("anDrive").value = Math.round(NBAN.drive * 100); document.getElementById("anDriveV").textContent = Math.round(NBAN.drive * 100);
    document.getElementById("anDrift").value = Math.round(NBAN.drift * 100); document.getElementById("anDriftV").textContent = Math.round(NBAN.drift * 100);
  }
  { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); try { anPaint(); } catch (e) {} return r; }; }
  document.getElementById("anOn").addEventListener("click", () => { NBAN.on = !NBAN.on; saveAn(); if (NBAN.on) { start(); nbAnLoad(); } anPaint(); noteMsg(NBAN.on ? "Analog on: modelled filters and drift on the next notes" : "Analog off: clean digital filters"); });
  document.getElementById("anMore").addEventListener("click", () => { const bar = document.getElementById("anBar"), o = bar.classList.toggle("open"); document.getElementById("anMore").setAttribute("aria-expanded", String(o)); });
  document.getElementById("anFilt").addEventListener("change", e => { NBAN.model = e.target.value; saveAn(); anPaint(); });
  document.getElementById("anDrive").addEventListener("input", e => { NBAN.drive = +e.target.value / 100; document.getElementById("anDriveV").textContent = e.target.value; saveAn(); });
  document.getElementById("anDrift").addEventListener("input", e => { NBAN.drift = +e.target.value / 100; document.getElementById("anDriftV").textContent = e.target.value; saveAn(); });
  anPaint();
  // ---- the timing guard: look further ahead while the screen is struggling, ease back when it's calm ----
  const NBLA_BASE = (window.matchMedia && matchMedia("(pointer: coarse)").matches) ? 0.15 : 0.12;
  NB_LA = NBLA_BASE;
  {
    let last = performance.now(), calm = 0; const T0 = performance.now();
    const raise = ms => { const want = Math.min(0.4, ms / 1000 + 0.08); if (want > NB_LA) NB_LA = want; calm = 0; NBAN.stalls++; NBAN.lastStall = Math.round(ms); };
    setInterval(() => {
      const now = performance.now(), gap = now - last; last = now; window.__nbLagMs = (window.__nbLagMs || 0) + Math.max(0, gap - 25);
      if (document.hidden || now - T0 < 4000) { calm = 0; return; }
      if (gap > 75) raise(gap);
      else if (NB_LA > NBLA_BASE && ++calm > 120) { NB_LA = Math.max(NBLA_BASE, NB_LA - 0.03); calm = 100; }
    }, 25);
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 60 && !document.hidden && performance.now() - T0 > 4000) raise(e.duration); }).observe({ type: "longtask" }); } catch (e) {}
  }
  window.__analog = { NBAN, la: () => NB_LA, vf: d => nbVF(d) };


  // ======================================================================
  // Work you can't lose: storage status, backups, a reminder · live stems · more in the MIDI file
  // ======================================================================
  KEEP_KEYS.push("nightbloom-backup");   // (a project never carries the backup date)
  function bkGet() { try { return JSON.parse(localStorage.getItem("nightbloom-backup") || "null") || {}; } catch (e) { return {}; } }
  function bkSet(o) { try { localStorage.setItem("nightbloom-backup", JSON.stringify(Object.assign(bkGet(), o))); } catch (e) {} }
  if (!bkGet().first) bkSet({ first: Date.now() });
  async function storeStatus() {
    const o = { persisted: false, usage: 0 };
    try { if (navigator.storage && navigator.storage.persisted) o.persisted = await navigator.storage.persisted(); } catch (e) {}
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); o.usage = e.usage || 0; } } catch (e) {}
    return o;
  }
  async function askPersist() { try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); } catch (e) {} return false; }
  const bkDays = ms => ms ? Math.floor((Date.now() - ms) / 86400000) : null;
  async function paintSafe() {
    const st = await storeStatus(), d = bkDays(bkGet().at), mb = st.usage / 1048576;
    document.getElementById("prSafeS").textContent = (mb >= 0.1 ? mb.toFixed(mb < 10 ? 1 : 0) + " MB on this device · " : "") +
      (st.persisted ? "kept safe from the browser's clean-up ✓" : "the browser may clear it if space runs low") + " · " +
      (d == null ? "never backed up" : d === 0 ? "backed up today" : "last backup " + d + " day" + (d > 1 ? "s" : "") + " ago");
    document.getElementById("prSafe").classList.toggle("warn", d == null || d > 7);
  }
  async function backupNow() {
    start(); prInfo.textContent = "Packing everything…";
    try {
      const name = "Nate Bloom backup " + stamp(), p = await snapshotProject(name);
      const msg = await saveFileOut(name.replace(/[^\w\- ]+/g, "").trim(), "nbproj", packProject(p));
      if (msg) bkSet({ at: Date.now() });
      prInfo.textContent = msg ? msg + " · open it with Import file, on this or any device" : "";
    } catch (e) { prInfo.textContent = "Couldn't back up: " + (e && e.message || e); }
    paintSafe();
  }
  document.getElementById("prBackup").addEventListener("click", backupNow);
  document.getElementById("prBtn").addEventListener("click", () => { paintSafe(); askPersist().then(paintSafe); });
  // ask once the app is in use (Chrome decides quietly; nothing pops up)
  { let asked = false; document.getElementById("startBtn").addEventListener("click", () => { if (!asked) { asked = true; setTimeout(askPersist, 3000); } }); }
  // a gentle reminder: real work, no backup for a week (or never, after a few days), at most every 3 days
  const hasWork = () => { try { return sampBuf.some(Boolean) || BPS.seqs.some(q => q.ev.length) || ((JSON.parse(localStorage.getItem("nightbloom-tracks") || "null") || {}).clips || []).length > 0; } catch (e) { return false; } };
  const bkToast = (() => {
    const el = document.createElement("div"); el.className = "undotoast"; el.hidden = true; el.setAttribute("role", "status");
    el.innerHTML = '<span></span><button class="btn">Back up</button>'; document.body.appendChild(el);
    let t = 0;
    el.querySelector("button").addEventListener("click", () => { el.hidden = true; clearTimeout(t); backupNow(); });
    return msg => { el.querySelector("span").textContent = msg; el.hidden = false; clearTimeout(t); t = setTimeout(() => { el.hidden = true; }, 12000); };
  })();
  setTimeout(() => {
    const b = bkGet(), now = Date.now(), d = bkDays(b.at);
    if (!hasWork() || (b.nag && now - b.nag < 3 * 86400000)) return;
    if (d == null ? now - (b.first || now) > 3 * 86400000 : d > 7) { bkSet({ nag: now }); bkToast(d == null ? "Your beats and samples live only in this browser. Back them up to a file?" : "Last backup " + d + " days ago. Back up your work?"); }
  }, 45000);

  // ---------- MIDI file: the Rhythm Creator and Beat Pads too ----------
  function rcGM(id) {
    const sd = (typeof rcSnd === "function" && rcSnd(id)) || {}, nm = (sd.name || id).toLowerCase(), role = sd.role || "";
    const has = w => nm.includes(w);
    if (role === "kick" || has("kick") || has("boom")) return 36;
    if (has("cross") || has("stick")) return 37;
    if (role === "snare" || has("snare") || has("snap")) return 38;
    if (role === "clap" || has("clap")) return 39;
    if (role === "rim" || has("rim")) return 37;
    if (has("pedal")) return 44;
    if (role === "oh" || has("open hat")) return 46;
    if (role === "ch" || has("hat")) return 42;
    if (role === "tom" || has("tom")) return has("floor") ? 41 : has("low") ? 45 : has("high") ? 50 : 47;
    if (has("ride bell") || (has("bell") && has("ride"))) return 53;
    if (has("ride")) return 51;
    if (role === "cym" || has("crash") || has("cymbal")) return 49;
    if (has("cowbell") || has("cow")) return 56;
    if (has("tamb")) return 54;
    if (has("maraca")) return 70;
    if (has("shaker") || role === "shaker") return 82;
    if (has("cabasa")) return 69;
    if (has("clave")) return 75;
    if (has("agogo")) return has("low") || has("lo") ? 68 : 67;
    if (has("tri")) return 81;
    if (has("bongo")) return has("low") || has("lo") ? 61 : 60;
    if (has("conga") || has("tumba")) return has("low") || has("tumba") ? 64 : has("mid") ? 63 : 62;
    if (has("timb")) return has("low") || has("lo") ? 66 : 65;
    return role === "bell" ? 56 : 76;
  }
  function midiExtra(track, step) {
    const out = [];
    try {
      const S = rcSigOf(), total = S.bar * 4, ev = [], solo = RCP.tracks.some(t => t && t.solo);
      RCP.tracks.forEach(tr => {
        if (!tr || tr.mute || (solo && !tr.solo)) return;
        const note = rcGM(tr.snd), L = Math.max(1, tr.len || S.bar);
        for (let n = 0; n < total; n++) {
          const i = n % L; if (!tr.on[i]) continue;
          const t = n * step, v = tr.acc && tr.acc[i] ? 120 : 90, r = Math.max(1, (tr.roll && tr.roll[i]) || 1);
          if (tr.flam && tr.flam[i] && t >= 24) ev.push([t - 24, [0x99, note, 48]], [t - 4, [0x89, note, 0]]);
          for (let k = 0; k < r; k++) { const tt = t + Math.round(k * step / r); ev.push([tt, [0x99, note, k ? Math.round(v * 0.8) : v]], [tt + 30, [0x89, note, 0]]); }
        }
      });
      if (ev.length) out.push(track(ev, "Rhythm Creator (GM, ch 10)"));
    } catch (e) {}
    try {
      bpSeqSync();
      const segs = BPS.songOn && BPS.song.length ? bpSongSegs() : [{ ev: BPS.ev, bars: BPS.bars }], ev = [], kb = BPS.bars; let base = 0;
      try { segs.forEach(sg => { BPS.bars = sg.bars; sg.ev.forEach(e => { const t = Math.round((base + bpQ(e.s)) * step), n = 36 + e.k; ev.push([t, [0x99, n, Math.max(1, Math.min(127, Math.round(e.v * 127)))]], [t + 60, [0x89, n, 0]]); }); base += sg.bars * 16; }); }
      finally { BPS.bars = kb; }
      if (ev.length) out.push(track(ev, "Beat Pads (pad 1 of bank A = note 36 … pad 16 of D = 99, ch 10)"));
    } catch (e) {}
    return out;
  }

  // ---------- Stems of everything playing ----------
  const NB_STEMS_SRC = `
class NBStems extends AudioWorkletProcessor {
  constructor(o) { super(); const p = o.processorOptions; this.n = p.n; this.start = p.start; this.len = p.len; this.b = [];
    for (let i = 0; i < this.n; i++) this.b.push([new Int16Array(this.len), new Int16Array(this.len)]);
    this.pk = new Float32Array(this.n); this.state = 0; this.tick = 0; this.job = null; }
  process(inputs) {
    if (this.state === 2) return this.sendSome();
    const f0 = currentFrame, s0 = this.start, n = this.len;
    for (let i = 0; i < this.n; i++) { const inp = inputs[i]; if (!inp || !inp.length) continue; const L = inp[0], R = inp[1] || inp[0], B = this.b[i]; let pk = this.pk[i];
      for (let k = 0; k < L.length; k++) { const p = f0 + k - s0; if (p < 0 || p >= n) continue; const l = L[k], r = R[k];
        B[0][p] = l <= -1 ? -32767 : l >= 1 ? 32767 : l * 32767; B[1][p] = r <= -1 ? -32767 : r >= 1 ? 32767 : r * 32767;
        const a = l < 0 ? -l : l, c = r < 0 ? -r : r; if (a > pk) pk = a; if (c > pk) pk = c; } this.pk[i] = pk; }
    if (++this.tick % 64 === 0) this.port.postMessage({ at: Math.max(0, f0 - s0) });
    if (f0 + 128 >= s0 + n) { this.state = 2; this.port.postMessage({ begin: true, peaks: Array.from(this.pk) }); this.job = { i: 0, at: 0 }; }
    return true;
  }
  sendSome() { const J = this.job; if (!J) return false;
    if (J.i >= this.n) { this.port.postMessage({ fin: true }); this.job = null; this.b = null; return false; }
    const k = Math.min(65536, this.len - J.at), L = this.b[J.i][0].slice(J.at, J.at + k), R = this.b[J.i][1].slice(J.at, J.at + k);
    this.port.postMessage({ i: J.i, at: J.at, L, R }, [L.buffer, R.buffer]); J.at += k; if (J.at >= this.len) { J.i++; J.at = 0; }
    return true; }
}
registerProcessor("nb-stems", NBStems);`;
  const STEM = { busy: false, ready: null };
  function stemsReady() {
    if (STEM.ready) return STEM.ready;
    return (STEM.ready = (async () => {
      for (const url of [() => URL.createObjectURL(new Blob([NB_STEMS_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(NB_STEMS_SRC)]) {
        try { await ctx.audioWorklet.addModule(url()); return true; } catch (e) {}
      }
      STEM.ready = null; return false;
    })());
  }
  const STEM_NAMES = { drum: "Drums", samp: "Samples", pads: "Pads", inst: "Instrument", dj: "DJ", rc: "Rhythm Creator", bp: "Beat Pads", lib: "Library" };
  const stemName = id => (ENGINES[id] && ENGINES[id].name) || STEM_NAMES[id] || (typeof fxcNames !== "undefined" && fxcNames[id]) || id;
  // where the next bar starts, and how long a bar is, on whatever's playing
  function stemGrid() {
    const now = ctx.currentTime;
    if (playing) { const st = stepsNow(), d = stepDur(); return { t: nextTime + ((st - curStep % st) % st) * d, bar: st * d, what: "the sequencer" }; }
    if (RC.playing) { const S = rcSigOf(), d = rcStepDur(); return { t: RC.nextT + ((S.bar - RC.step % S.bar) % S.bar) * d, bar: S.bar * d, what: "the Rhythm Creator" }; }
    if (BP.playing) { const p = bpPosAt(now + 0.15), nb = Math.max(0, Math.ceil(p / 16) * 16); return { t: bpTimeAt(nb), bar: 16 * BP.sd, what: "Beat Pads" }; }
    return { t: now + 0.3, bar: stepsNow() * stepDur(), what: "" };
  }
  function wav16(L, R, rate) {
    const n = L.length, ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab), str = (o, x) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 4, true);
    const o = new Int16Array(ab, 44); for (let i = 0; i < n; i++) { o[2 * i] = L[i]; o[2 * i + 1] = R[i]; }
    return new Uint8Array(ab);
  }
  async function recordStems() {
    start(); if (!ctx || STEM.busy) return;
    const btn = document.getElementById("exStRec");
    if (!ctx.audioWorklet || !(await stemsReady())) { exInfo.textContent = "This browser can't record stems."; return; }
    const taps = [];
    for (const id in fxChan) { const c = fxChan[id]; if (!c || (c.w && c.w.parked)) continue; taps.push({ name: stemName(id), nodes: c.w && c.w.lean ? [c.core] : [c.dry, c.echoOut] }); }
    if (BP.bus && !(FXC.by.bp && FXC.by.bp.on)) taps.push({ name: "Beat Pads", nodes: [BP.bus] });
    if (DJ.bus && typeof fxcOn === "function" && !fxcOn("dj")) taps.push({ name: "DJ", nodes: [DJ.bus] });
    const seen = new Set(); for (let i = taps.length - 1; i >= 0; i--) { if (seen.has(taps[i].name)) taps[i].name += " " + (i + 1); seen.add(taps[i].name); }
    taps.splice(14);   // (a phone's memory: 14 parts at most)
    if (fx.verbOut) taps.push({ name: "Reverb (shared)", nodes: [fx.verbOut] });
    if (nbwStemTaps) nbwStemTaps().forEach(t => taps.push(t));
    taps.push({ name: "Full mix", nodes: [analyser] });
    const bars = +document.getElementById("exStBars").value, G = stemGrid(), sr = ctx.sampleRate;
    let secs = bars * G.bar; if (secs > 120) secs = Math.floor(120 / G.bar) * G.bar || 120;
    const startF = Math.round(G.t * sr), len = Math.round(secs * sr);
    const rec = new AudioWorkletNode(ctx, "nb-stems", { numberOfInputs: taps.length, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit", processorOptions: { n: taps.length, start: startF, len } });
    const mute = ctx.createGain(); mute.gain.value = 0; rec.connect(mute).connect(ctx.destination);
    // each part through a plain gain of its own: the solo gates re-route connections from tagged buses, and a tap
    // must land on its own input of the recorder
    const mids = taps.map(() => ctx.createGain()); mids.forEach((m, i) => m.connect(rec, 0, i));
    taps.forEach((tp, i) => tp.nodes.forEach(n => { try { n.connect(mids[i]); } catch (e) {} }));
    STEM.busy = true; btn.disabled = true; btn.classList.add("live"); btn.textContent = "● Recording";
    exInfo.textContent = G.what ? "Starts on the next bar of " + G.what + "…" : "Recording " + bars + " bars at " + state.seq.bpm + " BPM: play now";
    const parts = taps.map(() => [new Int16Array(len), new Int16Array(len)]);
    const done = await new Promise(res => {
      let peaks = null;
      const to = setTimeout(() => res(null), (secs + (G.t - ctx.currentTime) + 30) * 1000);
      rec.port.onmessage = e => { const d = e.data;
        if (d.at != null && d.i == null) { const b = Math.min(bars, Math.floor(d.at / sr / G.bar) + 1); exInfo.textContent = "● Recording bar " + b + " of " + Math.round(secs / G.bar) + " · " + taps.length + " stems"; }
        if (d.begin) { peaks = d.peaks; exInfo.textContent = "Packing " + taps.length + " stems…"; }
        if (d.i != null) { parts[d.i][0].set(d.L, d.at); parts[d.i][1].set(d.R, d.at); }
        if (d.fin) { clearTimeout(to); res(peaks); }
      };
    });
    taps.forEach((tp, i) => tp.nodes.forEach(n => { try { n.disconnect(mids[i]); } catch (e) {} })); mids.forEach(m => { try { m.disconnect(); } catch (e) {} });
    try { rec.disconnect(); mute.disconnect(); } catch (e) {}
    STEM.busy = false; btn.disabled = false; btn.classList.remove("live"); btn.textContent = "Record";
    if (!done) { exInfo.textContent = "The recording didn't finish. Try again."; return null; }
    const files = []; let k = 0;
    taps.forEach((tp, i) => { if (done[i] < 0.0003 && tp.name !== "Full mix") return; k++; files.push({ name: String(k).padStart(2, "0") + " " + safeName(tp.name) + ".wav", data: wav16(parts[i][0], parts[i][1], sr) }); });
    const msg = await saveZip(takeName() + "-stems-" + bars + "-bars", zipMany(files));
    exInfo.textContent = (msg || "") + " · " + files.length + " stems, " + secs.toFixed(1) + " s each, all starting on the same downbeat (silent parts left out)";
    return { files: files.map(f => f.name), secs };
  }
  document.getElementById("exStRec").addEventListener("click", () => recordStems().catch(e => { STEM.busy = false; exInfo.textContent = "Couldn't record stems: " + (e && e.message || e); const b = document.getElementById("exStRec"); b.disabled = false; b.classList.remove("live"); b.textContent = "Record"; }));
  window.__safe = { paintSafe, backupNow, storeStatus, midiExtra: () => midiFile(), recordStems, stemGrid, bkGet, bkSet };


