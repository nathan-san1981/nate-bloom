// ---------- virtual Acer Chromebook Spin 311 (only with ?sim in the address, from sim.html) ----------
// Makes this device behave like the Spin 311 (MediaTek MT8183, 4 GB): the page's own work is slowed by however much
// faster this device is, and the audio thread gets the extra load the Spin 311's slower processor would carry.
// Calibration: the same speed test on a Chrome slowed to score like the Spin 311 on Octane 2.0 (9,875).
(() => {
  const q = new URLSearchParams(location.search); if (!q.has("sim")) return;
  const T_REF = 48, T_SPIN_MAIN = 200, AUDIO_RATIO = 4.75;   // ms here at full speed, ms at Spin 311 speed; audio: Octane ratio
  const _now = performance.now.bind(performance), _setTimeout = setTimeout, _setInterval = setInterval, _raf = requestAnimationFrame.bind(window);
  function nbBench() {
    const t0 = _now(); let acc = 0;
    for (let r = 0; r < 5; r++) {
      const arr = [];
      for (let i = 0; i < 20000; i++) arr.push({ a: i, b: Math.sin(i * 0.01), s: "n" + (i % 97) });
      arr.sort((x, y) => x.b - y.b);
      for (const o of arr) acc += o.a * o.b + o.s.length;
      const f = new Float32Array(65536); for (let i = 0; i < f.length; i++) f[i] = Math.sin(i * 0.001) * Math.cos(i * 0.0003);
      for (let k = 0; k < 4; k++) for (let i = 1; i < f.length - 1; i++) f[i] = (f[i - 1] + f[i] + f[i + 1]) / 3;
      acc += f[1234];
      let str = ""; for (let i = 0; i < 3000; i++) str += String.fromCharCode(65 + (i % 26)); acc += str.split("A").length;
      const m = new Map(); for (let i = 0; i < 20000; i++) m.set("k" + (i % 5000), i); acc += m.size;
    }
    self.__benchSink = acc; return _now() - t0;
  }
  nbBench(); let tDev = Infinity; for (let i = 0; i < 4; i++) tDev = Math.min(tDev, nbBench());
  const off = q.get("sim") === "off";
  const S = window.NB_SIM = {
    tDev: Math.round(tDev), faster: T_SPIN_MAIN / tDev, F: off ? 1 : Math.max(1, T_SPIN_MAIN / tDev), off,
    // audio: this device's own cost is (tDev / T_REF) of the reference cost; the Spin 311's is AUDIO_RATIO times it
    audioExtra: off ? 0 : Math.max(0, AUDIO_RATIO - tDev / T_REF),
    voices: new Set(), other: 0, otherBase: null, loadPct: 0, busy: 0, frames: 0,
  };
  // ---- 1. the page's work takes F times as long ----
  const F = S.F;
  const spin = ms => { const end = _now() + ms; while (_now() < end) {} };
  let depth = 0, busyAcc = 0;
  const wrap = fn => function () {
    if (depth) return fn.apply(this, arguments);
    depth++; const t0 = _now();
    try { return fn.apply(this, arguments); }
    finally { depth--; queueMicrotask(() => { const dt = _now() - t0; busyAcc += dt * F; if (F > 1.02) spin(dt * (F - 1)); }); }
  };
  if (F > 1.02) {
    const map = new WeakMap();
    const wrapL = l => { if (typeof l === "function") { let w = map.get(l); if (!w) { w = wrap(l); map.set(l, w); } return w; }
      if (l && typeof l.handleEvent === "function") { let w = map.get(l); if (!w) { const o = l; w = wrap(function (e) { return o.handleEvent(e); }); map.set(l, w); } return w; } return l; };
    const ael = EventTarget.prototype.addEventListener, rel = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (t, l, o) { return ael.call(this, t, wrapL(l), o); };
    EventTarget.prototype.removeEventListener = function (t, l, o) { return rel.call(this, t, (l && map.get(l)) || l, o); };
    window.setTimeout = function (fn, ...a) { return _setTimeout(typeof fn === "function" ? wrap(fn) : fn, ...a); };
    window.setInterval = function (fn, ...a) { return _setInterval(typeof fn === "function" ? wrap(fn) : fn, ...a); };
    window.requestAnimationFrame = function (fn) { return _raf(wrap(fn)); };
    // handlers set as properties (onclick, port.onmessage, …)
    for (const [proto, props] of [[HTMLElement.prototype, ["onclick", "oninput", "onchange", "onpointerdown", "onpointerup", "onkeydown"]], [window, ["onresize", "onkeydown"]], [MessagePort.prototype, ["onmessage"]], [FileReader.prototype, ["onload"]]]) {
      for (const p of props) {
        const d = Object.getOwnPropertyDescriptor(proto, p) || (proto === window ? null : Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), p));
        if (!d || !d.set) continue;
        Object.defineProperty(proto, p, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); }, set(v) { d.set.call(this, typeof v === "function" ? wrap(v) : v); } });
      }
    }
  }
  // ---- 2. the audio thread carries the Spin 311's load ----
  // voice cost here (percent of a render quantum on the reference machine), from measurements
  const W = { saw: 1.8, analog: 1.1, vital: 1.8, juno: 1.4, tyrell: 1.7, choir: 4.6, zeb: 1.5, bells: 1.5, fm: 1.3, mono: 0.8, sync: 0.7, hoover: 1.7, pluck: 2.4 };
  const BASE = 5.5, OTHER = 0.25;
  let building = null;
  S.beginVoice = id => (building = { id, live: 0 });
  S.endBuild = r => { building = null; if (r.live > 0) S.voices.add(r); };
  for (const P of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype, OscillatorNode.prototype, window.ConstantSourceNode && ConstantSourceNode.prototype]) {
    if (!P || !Object.prototype.hasOwnProperty.call(P, "start")) continue;
    const st = P.start;
    P.start = function () {
      const r = this.__nbr !== undefined ? this.__nbr : building;
      if (!this.__nbStarted) {
        this.__nbStarted = true;
        // a voice is over when all its sources have ended, or, once it's been let go, when the ones it stopped have
        // (an engine's never-ending helpers don't keep it alive)
        if (r) { r.live++; const me = this; this.addEventListener("ended", () => { r.live--; if (me.__nbStopped) r.pend--; if (r.live <= 0 || (r.rel && r.pend <= 0)) S.voices.delete(r); }); }
        else { S.other++; this.addEventListener("ended", () => { S.other--; }); }
      }
      return st.apply(this, arguments);
    };
    const sp = P.stop;
    if (sp) P.stop = function () { const r = this.__nbr; if (r && this.__nbStarted && !this.__nbStopped) { this.__nbStopped = true; r.rel = true; r.pend = (r.pend || 0) + 1; } return sp.apply(this, arguments); };
  }
  for (const m of ["createOscillator", "createBufferSource", "createConstantSource"]) {
    const o = BaseAudioContext.prototype[m];
    BaseAudioContext.prototype[m] = function () { const n = o.apply(this, arguments); n.__nbr = building; return n; };
  }
  const BURN = `class B extends AudioWorkletProcessor {
    constructor() { super(); this.us = 0; this.x = 1.5;
      this.port.onmessage = e => { this.us = e.data.us || 0; };
      const loop = n => { let x = this.x; for (let i = 0; i < n; i++) x = (x * 1.0000001 + 0.5) % 1000.5; this.x = x; };
      loop(300000);
      let n = 0; const t0 = Date.now(); while (Date.now() - t0 < 30) { loop(5000); n += 5000; }
      this.perUs = n / 30000; this.port.postMessage({ perUs: this.perUs }); }
    process() { if (this.us > 0) { const n = (this.us * this.perUs) | 0; let x = this.x; for (let i = 0; i < n; i++) x = (x * 1.0000001 + 0.5) % 1000.5; this.x = x; } return true; }
  }
  registerProcessor("nb-sim-burn", B);`;
  const AC = window.AudioContext;
  if (AC) window.AudioContext = class extends AC {
    constructor(o) {
      super(o); S.ctx = this; const ctx = this;
      ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([BURN], { type: "text/javascript" }))).then(() => {
        const n = new AudioWorkletNode(ctx, "nb-sim-burn", { numberOfInputs: 0, numberOfOutputs: 1 });
        const g = ctx.createGain(); g.gain.value = 0; n.connect(g).connect(ctx.destination); S.burn = n;
        n.port.onmessage = e => { S.perUs = e.data.perUs; };
      }).catch(e => { S.burnErr = String(e); });
      _setTimeout(() => { S.otherBase = S.other; }, 2500);
    }
  };
  // every tenth of a second: the Spin 311's estimated audio load, and the extra work to put on this device's audio thread
  let lastBusy = _now(), fr = 0, lag = 0;
  const count = () => { fr++; _raf(count); }; _raf(count);
  // how long a tap waits before the page gets to it
  _setInterval(() => { const t0 = _now(); _setTimeout(() => { lag = Math.max(lag, _now() - t0); }, 0); }, 100);
  _setInterval(() => {
    const ws = []; S.voices.forEach(r => ws.push(W[r.id] != null ? W[r.id] : 1.2)); ws.sort((a, b) => b - a);
    let v = 0; ws.slice(0, 12).forEach(x => { v += x; });
    const other = Math.max(0, S.other - (S.otherBase == null ? S.other : S.otherBase));
    const here = BASE + v + other * OTHER;                 // percent of a quantum on the reference machine
    S.loadPct = Math.round(here * AUDIO_RATIO);             // on the Spin 311
    const ctx = S.ctx;
    if (S.burn && ctx) { const qUs = 128 / ctx.sampleRate * 1e6; S.burn.port.postMessage({ us: here / 100 * S.audioExtra * qUs }); }
  }, 100);
  _setInterval(() => {
    const now = _now(), wall = now - lastBusy; lastBusy = now;
    S.busy = Math.min(100, Math.round(busyAcc / wall * 100)); busyAcc = 0; S.fps = Math.round(fr * 1000 / wall); fr = 0; S.lag = Math.round(lag); lag = 0;
    try { if (parent !== window) parent.postMessage({ nbsim: { faster: +S.faster.toFixed(2), F: +F.toFixed(2), off: S.off, load: S.loadPct, lag: S.lag, fps: S.fps, voices: S.voices.size, burn: !!S.burn, err: S.burnErr || null } }, "*"); } catch (e) {}
  }, 500);
})();
