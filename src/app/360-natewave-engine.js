  // ======================================================================
  // Natewave: a wavetable synth. Two oscillators scan wavetables (a hundred built in, or made from your own samples),
  // with unison and warps; a sub and noise; two filters; three envelopes, three LFOs, a mod matrix and eight macros.
  // One AudioWorklet plays every voice; its sound goes through the "Wave" channel like any other engine.
  // ======================================================================
  const WV_SRC = `// nb-wave: Natewave, the wavetable synth. One processor plays every voice.
var WN = 2048, WLV = 11, WMASK = 2047, CH = 32;
var SRC = ["e2", "e3", "l1", "l2", "l3", "vel", "key", "wheel", "press", "slide", "rand", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];
var DST = ["o1.pos", "o1.wamt", "o1.pitch", "o1.level", "o1.pan", "o1.det", "o2.pos", "o2.wamt", "o2.pitch", "o2.level", "o2.pan", "o2.det",
  "sub.level", "noise.level", "f1.cut", "f1.res", "f1.drive", "f2.cut", "f2.res", "f2.drive", "amp.level", "l1.rate", "l2.rate", "l3.rate"];
var FTYPES = ["off", "ladder", "lp12", "bp", "hp", "notch", "comb+", "comb-", "formant"];
var SYNC_BEATS = [16, 8, 4, 2, 1, 0.5, 1 / 3, 0.25, 1 / 6, 0.125];
var VOWF = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]];
var VOWG = [[1, 0.5, 0.25], [1, 0.45, 0.3], [1, 0.4, 0.3], [1, 0.55, 0.12], [1, 0.35, 0.08]];
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function tanhA(x) { if (x > 3) return 1; if (x < -3) return -1; var x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
function envK(sec) { return 1 - Math.exp(-1 / Math.max(1, sec * sampleRate)); }
function aTime(v) { return 0.0008 * Math.pow(12500, v); }   // 0.8 ms .. 10 s
function rTime(v) { return 0.004 * Math.pow(2500, v); }     // 4 ms .. 10 s
function FS() { this.ic1 = 0; this.ic2 = 0; this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0; this.buf = null; this.w = 0; this.f = null;
  this.ty = 0; this.g = 0; this.k = 0; this.a1 = 0; this.a2 = 0; this.a3 = 0; this.G = 0; this.D = 2; this.fb = 0; this.drv = 1; this.comp = 1; this.fg = null; }
function Voice() {
  this.active = false; this.id = 0; this.note = 60; this.vel = 0.8; this.gain = 1; this.released = false; this.age = 0;
  this.ph1 = new Float64Array(8); this.ph2 = new Float64Array(8); this.subPh = 0;
  this.ev = new Float64Array(3); this.es = new Int8Array(3);   // envelope value, stage: 0 off 1 attack 2 decay 3 sustain 4 release
  this.lph = new Float64Array(3); this.lv = new Float64Array(3); this.lsh = new Float64Array(3); this.lnx = new Float64Array(3);
  this.t = 0; this.pitch = 60; this.ptarget = 60; this.prate = 0; this.bend = 0; this.press = -1; this.slide = 0; this.rand = 0;
  this.cshift = 0; this.ctarget = 0; this.crate = 0; this.fade = 1; this.fading = false;
  this.fs = [new FS(), new FS(), new FS(), new FS()];
  this.prev = new Float64Array(DST.length); this.cur = new Float64Array(DST.length); this.first = true;
  this.nz = 0; this.o1prev = 0; this.amp0 = 0;
  this.inc1 = new Float64Array(8); this.inc2 = new Float64Array(8); this.gl1 = new Float64Array(8); this.gr1 = new Float64Array(8); this.gl2 = new Float64Array(8); this.gr2 = new Float64Array(8);
}
class NBWave extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: "detune", defaultValue: 0, minValue: -4800, maxValue: 4800, automationRate: "k-rate" }]; }
  constructor() {
    super();
    this.tables = {}; this.C = null; this.q = []; this.voices = []; for (var i = 0; i < 24; i++) this.voices.push(new Voice());
    this.mv = this.voices[0]; this.stack = []; this.ctl = { wheel: 0, press: 0, bpm: 120 }; this.macro = new Float64Array(8);
    this.gph = new Float64Array(3); this.lastPitch = -1; this.ageC = 0; this.seed = 22222; this.viz = false; this.vizT = 0; this.quiet = 0;
    this.S = new Float64Array(SRC.length); this.M = new Float64Array(DST.length);
    var self = this;
    this.port.onmessage = function (e) { self.msg(e.data); };
  }
  rnd() { var x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
  msg(d) {
    if (d.t === "patch") this.compile(d.p);
    else if (d.t === "table") this.tables[d.id] = { F: d.F, data: d.data };
    else if (d.t === "drop") delete this.tables[d.id];
    else if (d.t === "on" || d.t === "off") { var i = this.q.length; while (i > 0 && this.q[i - 1].time > d.time) i--; this.q.splice(i, 0, d); }
    else if (d.t === "kill") { this.q = []; this.stack = []; for (var j = 0; j < this.voices.length; j++) this.voices[j].active = false; }
    else if (d.t === "ctl") { if (d.k === "macro") this.macro[d.i] = d.v; else this.ctl[d.k] = d.v; }
    else if (d.t === "vctl") { var v = this.find(d.id); if (v) { if (d.k === "shift") { v.ctarget = d.v; v.crate = d.g > 0 ? Math.abs(d.v - v.cshift) / (d.g * sampleRate) : 1e9; } else v[d.k] = d.v; } }
    else if (d.t === "viz") this.viz = !!d.on;
  }
  find(id) { if (this.C && this.C.mode && this.mv.id === id) return this.mv; for (var i = 0; i < this.voices.length; i++) { var v = this.voices[i]; if (v.active && v.id === id) return v; } return null; }
  compile(p) {
    var C = { base: new Float64Array(DST.length), o: [], f: [], l: [], mods: [] };
    for (var k = 0; k < 2; k++) {
      var o = p["o" + (k + 1)];
      C.o.push({ on: o.on !== false, table: o.table, warp: o.warp | 0, fine: o.fine, uni: Math.max(1, Math.min(8, o.uni | 0)), spread: o.spread, rnd: o.rnd !== false, phase: o.phase || 0 });
      C.base[DST.indexOf("o" + (k + 1) + ".pos")] = o.pos; C.base[DST.indexOf("o" + (k + 1) + ".wamt")] = o.wamt; C.base[DST.indexOf("o" + (k + 1) + ".pitch")] = o.pitch;
      C.base[DST.indexOf("o" + (k + 1) + ".level")] = o.on === false ? 0 : o.level; C.base[DST.indexOf("o" + (k + 1) + ".pan")] = o.pan; C.base[DST.indexOf("o" + (k + 1) + ".det")] = o.det;
      var f = p["f" + (k + 1)];
      C.f.push({ ty: Math.max(0, FTYPES.indexOf(f.type)), key: f.key, env: (f.env - 0.5) * 2 });
      C.base[DST.indexOf("f" + (k + 1) + ".cut")] = f.cut; C.base[DST.indexOf("f" + (k + 1) + ".res")] = f.res; C.base[DST.indexOf("f" + (k + 1) + ".drive")] = f.drive;
    }
    C.sub = { oct: p.sub.oct === 2 ? 4 : 2, shape: p.sub.shape | 0 }; C.base[DST.indexOf("sub.level")] = p.sub.level;
    C.noise = { color: p.noise.color }; C.base[DST.indexOf("noise.level")] = p.noise.level;
    C.route = ["serial", "parallel", "split"].indexOf(p.route); if (C.route < 0) C.route = 0;
    C.env = [p.amp, p.e2, p.e3]; C.base[DST.indexOf("amp.level")] = p.amp.level;
    for (var j = 0; j < 3; j++) { var l = p["l" + (j + 1)]; C.l.push({ shape: l.shape | 0, sync: !!l.sync, retrig: l.retrig !== false, fade: l.fade, rate: l.rate }); C.base[DST.indexOf("l" + (j + 1) + ".rate")] = l.rate; }
    C.mode = ["poly", "mono", "legato"].indexOf(p.voice.mode); if (C.mode < 0) C.mode = 0;
    C.glide = p.voice.glide * p.voice.glide * 2; C.max = Math.max(1, Math.min(16, p.voice.max | 0 || 8));
    (p.mods || []).forEach(function (m) { var s = SRC.indexOf(m.src), d = DST.indexOf(m.dst), v = m.via ? SRC.indexOf(m.via) : -1; if (s >= 0 && d >= 0 && m.amt) C.mods.push({ s: s, d: d, a: m.amt, v: v }); });
    this.C = C;
  }
  lfoRate(i, v) { var l = this.C.l[i]; if (l.sync) { var b = SYNC_BEATS[Math.min(SYNC_BEATS.length - 1, Math.floor(v * SYNC_BEATS.length))]; return this.ctl.bpm / 60 / b; } return 0.02 * Math.pow(1500, v); }
  start(v, d, retrig) {
    var C = this.C;
    var wasActive = v.active;
    v.active = true; v.released = false; v.fading = false; v.fade = 1; v.id = d.id; v.note = d.note; v.vel = d.vel; v.gain = d.gain; v.age = ++this.ageC;
    v.bend = d.bend || 0; v.press = -1; v.slide = 0; v.cshift = d.shift || 0; v.ctarget = v.cshift; v.rand = this.rnd() * 2 - 1;
    var sounding = C.mode && wasActive && v.ev[0] > 0.001;   // (a mono retrigger keeps the oscillators and filters running)
    if (retrig) {
      v.t = 0; v.first = !sounding;
      for (var e = 0; e < 3; e++) { v.es[e] = 1; if (e > 0) v.ev[e] = 0; }
      if (!sounding) v.ev[0] = 0;
    }
    if (retrig && !sounding) {
      for (var k = 0; k < 2; k++) { var o = C.o[k], ph = k ? v.ph2 : v.ph1; for (var u = 0; u < 8; u++) ph[u] = o.rnd ? this.rnd() : (o.phase + u * 0.37) % 1; }
      v.subPh = 0;
      for (var j = 0; j < 3; j++) { v.lph[j] = C.l[j].retrig ? 0 : this.gph[j]; v.lsh[j] = this.rnd() * 2 - 1; v.lnx[j] = this.rnd() * 2 - 1; }
      for (var f = 0; f < 4; f++) { var s = v.fs[f]; s.ic1 = s.ic2 = s.s1 = s.s2 = s.s3 = s.s4 = 0; if (s.buf) s.buf.fill(0); if (s.f) s.f.fill(0); }
    }
    var from = C.glide > 0 && this.lastPitch >= 0 ? this.lastPitch : d.note;
    if (!retrig && C.mode) from = v.pitch;
    v.pitch = from; v.ptarget = d.note; v.prate = C.glide > 0 ? Math.abs(d.note - from) / Math.max(1, C.glide * sampleRate) : 1e9;
    this.lastPitch = d.note;
  }
  noteOn(d) {
    var C = this.C; if (!C) return;
    if (C.mode) {
      this.stack = this.stack.filter(function (x) { return x.id !== d.id; }); this.stack.push(d);
      var v = this.mv, legato = C.mode === 2 && v.active && !v.released;
      this.start(v, d, !legato);
      if (!legato) { v.es[0] = 1; v.es[1] = 1; v.es[2] = 1; }
      return;
    }
    var free = null, n = 0, oldest = null, quiet = null;
    for (var i = 1; i < this.voices.length; i++) {
      var w = this.voices[i];
      if (!w.active) { if (!free) free = w; continue; }
      if (w.fading) continue;
      n++;
      if (w.released && (!quiet || w.ev[0] < quiet.ev[0])) quiet = w;
      if (!oldest || w.age < oldest.age) oldest = w;
    }
    if (n >= C.max) { var st = quiet || oldest; if (st) { st.fading = true; } }
    if (!free) { free = quiet || oldest || this.voices[1]; }
    this.start(free, d, true);
  }
  noteOff(d) {
    var C = this.C; if (!C) return;
    if (C.mode) {
      var wasTop = this.stack.length && this.stack[this.stack.length - 1].id === d.id;
      this.stack = this.stack.filter(function (x) { return x.id !== d.id; });
      var v = this.mv;
      if (!wasTop || v.id !== d.id) return;
      if (this.stack.length) { var t = this.stack[this.stack.length - 1]; v.id = t.id; v.note = t.note; v.ptarget = t.note; v.prate = C.glide > 0 ? Math.abs(t.note - v.pitch) / Math.max(1, C.glide * sampleRate) : 1e9; this.lastPitch = t.note; }
      else { v.released = true; for (var e = 0; e < 3; e++) v.es[e] = 4; }
      return;
    }
    for (var i = 1; i < this.voices.length; i++) { var w = this.voices[i]; if (w.active && w.id === d.id && !w.released) { w.released = true; for (var k = 0; k < 3; k++) w.es[k] = 4; } }
  }
  // envelope e of voice v over n samples
  env(v, e, n) {
    var A = this.C.env[e], st = v.es[e], x = v.ev[e];
    if (st === 1) { var ta = aTime(A.a), k = 1 - Math.exp(-n * 1.466 / Math.max(1, ta * sampleRate)); x += (1.3 - x) * k; if (x >= 1) { x = 1; st = 2; } }
    else if (st === 2) { var td = rTime(A.d), kd = 1 - Math.exp(-n * 6.9 / Math.max(1, td * sampleRate)); x += (A.s - x) * kd; if (Math.abs(x - A.s) < 0.001) { x = A.s; st = 3; } }
    else if (st === 3) x = A.s;
    else if (st === 4) { var tr = rTime(A.r), kr = 1 - Math.exp(-n * 6.9 / Math.max(1, tr * sampleRate)); x -= x * kr; if (x < 0.0002) { x = 0; st = 0; } }
    v.es[e] = st; v.ev[e] = x; return x;
  }
  lfo(v, j, n) {
    var l = this.C.l[j], r = this.lfoRate(j, v.cur[21 + j]), ph = v.lph[j] + r * n / sampleRate, out;
    if (ph >= 1) { ph -= Math.floor(ph); v.lsh[j] = v.lnx[j]; v.lnx[j] = this.rnd() * 2 - 1; }
    v.lph[j] = ph;
    switch (l.shape) {
      case 1: out = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: out = 2 * ph - 1; break;
      case 3: out = 1 - 2 * ph; break;
      case 4: out = ph < 0.5 ? 1 : -1; break;
      case 5: out = v.lsh[j]; break;
      case 6: var s = ph * ph * (3 - 2 * ph); out = v.lsh[j] + (v.lnx[j] - v.lsh[j]) * s; break;
      default: out = Math.sin(6.283185307 * ph);
    }
    if (l.fade > 0.001) out *= Math.min(1, v.t / (l.fade * l.fade * 6));
    return out;
  }
  setupF(s, ty, cutHz, cutN, res, drive) {
    s.ty = ty; s.drv = 1 + drive * drive * 15; s.comp = 1;
    if (ty === 0) return;
    var nyq = sampleRate * 0.49, fc = Math.min(nyq * 0.95, Math.max(15, cutHz));
    if (ty <= 5 || ty === 1) { s.g = Math.tan(Math.PI * fc / sampleRate); }
    if (ty === 1) { s.G = s.g / (1 + s.g); s.k = res * 3.95; s.comp = 1 + s.k * 0.45; }
    else if (ty <= 5) { s.k = 2 - 1.97 * res; s.a1 = 1 / (1 + s.g * (s.g + s.k)); s.a2 = s.g * s.a1; s.a3 = s.g * s.a2; }
    else if (ty <= 7) { if (!s.buf) s.buf = new Float32Array(4096); s.D = Math.min(4000, Math.max(2, sampleRate / fc)); s.fb = (ty === 6 ? 1 : -1) * res * 0.97; s.comp = 1 - res * 0.45; }
    else {
      if (!s.f) { s.f = new Float64Array(6); s.fg = new Float64Array(12); }
      var x = cutN * 4, i = Math.min(3, Math.floor(x)), fr = x - i, Q = 3 + res * 18;
      for (var b = 0; b < 3; b++) {
        var hz = VOWF[i][b] + (VOWF[i + 1][b] - VOWF[i][b]) * fr, gn = VOWG[i][b] + (VOWG[i + 1][b] - VOWG[i][b]) * fr;
        var g = Math.tan(Math.PI * Math.min(nyq * 0.9, hz) / sampleRate), k = 1 / Q, a1 = 1 / (1 + g * (g + k));
        s.fg[b * 4] = a1; s.fg[b * 4 + 1] = g * a1; s.fg[b * 4 + 2] = g * g * a1; s.fg[b * 4 + 3] = gn * k * 3;
      }
    }
  }
  filt(s, x) {
    var ty = s.ty; if (ty === 0) return x;
    if (s.drv > 1.05) x = tanhA(x * s.drv) * (1 + 1 / s.drv) * 0.5;
    if (ty === 1) {
      var G = s.G, b1 = (1 - G) * s.s1, b2 = (1 - G) * s.s2, b3 = (1 - G) * s.s3, b4 = (1 - G) * s.s4, G2 = G * G, G4 = G2 * G2;
      var S = G2 * G * b1 + G2 * b2 + G * b3 + b4, y4 = (G4 * x + S) / (1 + s.k * G4), u = tanhA(x - s.k * y4);
      var v1 = (u - s.s1) * G, y1 = v1 + s.s1; s.s1 = y1 + v1;
      var v2 = (y1 - s.s2) * G, y2 = v2 + s.s2; s.s2 = y2 + v2;
      var v3 = (y2 - s.s3) * G, y3 = v3 + s.s3; s.s3 = y3 + v3;
      var v4 = (y3 - s.s4) * G, y = v4 + s.s4; s.s4 = y + v4;
      return y * s.comp;
    }
    if (ty <= 5) {
      var v3b = x - s.ic2, vv1 = s.a1 * s.ic1 + s.a2 * v3b, vv2 = s.ic2 + s.a2 * s.ic1 + s.a3 * v3b;
      s.ic1 = 2 * vv1 - s.ic1; s.ic2 = 2 * vv2 - s.ic2;
      return ty === 2 ? vv2 : ty === 3 ? vv1 * s.k : ty === 4 ? x - s.k * vv1 - vv2 : x - s.k * vv1;
    }
    if (ty <= 7) {
      var buf = s.buf, rp = s.w - s.D, i0 = Math.floor(rp), fr = rp - i0, a = buf[(i0 + 4096) & 4095], b = buf[(i0 + 4097) & 4095];
      var yc = x + s.fb * (a + (b - a) * fr); buf[s.w] = yc; s.w = (s.w + 1) & 4095;
      return yc * s.comp;
    }
    var f = s.f, fg = s.fg, out = 0;
    for (var bb = 0; bb < 3; bb++) {
      var o = bb * 2, q = bb * 4, w3 = x - f[o + 1], w1 = fg[q] * f[o] + fg[q + 1] * w3, w2 = f[o + 1] + fg[q + 1] * f[o] + fg[q + 2] * w3;
      f[o] = 2 * w1 - f[o]; f[o + 1] = 2 * w2 - f[o + 1]; out += w1 * fg[q + 3];
    }
    return out;
  }
  render(v, L, R, i0, i1, detune) {
    var C = this.C, n = i1 - i0, sr = sampleRate;
    // fading out (a stolen voice)
    // control: envelopes, LFOs, the mod matrix
    var amp0 = v.ev[0], amp1 = this.env(v, 0, n), e2 = this.env(v, 1, n), e3 = this.env(v, 2, n);
    var S = this.S, M = this.M;
    S[0] = e2; S[1] = e3; S[2] = this.lfo(v, 0, n); S[3] = this.lfo(v, 1, n); S[4] = this.lfo(v, 2, n);
    S[5] = v.vel; S[6] = Math.max(-1, Math.min(1, (v.note - 60) / 48)); S[7] = this.ctl.wheel; S[8] = v.press >= 0 ? v.press : this.ctl.press; S[9] = v.slide; S[10] = v.rand;
    for (var m = 0; m < 8; m++) S[11 + m] = this.macro[m];
    M.fill(0);
    for (var j = 0; j < C.mods.length; j++) { var md = C.mods[j]; M[md.d] += S[md.s] * md.a * (md.v >= 0 ? S[md.v] : 1); }
    var cur = v.cur, prev = v.prev;
    for (var d = 0; d < DST.length; d++) cur[d] = clamp01(C.base[d] + M[d]);
    if (v.first) { prev.set(cur); v.first = false; }
    v.t += n / sr;
    // pitch: glide, chord shift, bends
    if (v.pitch !== v.ptarget) { var step = v.prate * n; if (Math.abs(v.ptarget - v.pitch) <= step) v.pitch = v.ptarget; else v.pitch += v.ptarget > v.pitch ? step : -step; }
    if (v.cshift !== v.ctarget) { var cs = v.crate * n; if (Math.abs(v.ctarget - v.cshift) <= cs) v.cshift = v.ctarget; else v.cshift += v.ctarget > v.cshift ? cs : -cs; }
    var semis = v.pitch + v.bend + v.cshift + detune / 100;
    // oscillators: per unison voice increments and pans
    var lv1 = 0, lv2 = 0, T1 = null, T2 = null, F1 = 0, F2 = 0, U1 = 0, U2 = 0;
    for (var k = 0; k < 2; k++) {
      var o = C.o[k], T = this.tables[o.table]; if (!T) continue;
      var pi = k ? 8 : 2, f0 = 440 * Math.pow(2, (semis + (cur[pi] - 0.5) * 48 + (o.fine - 0.5) * 2 - 69) / 12);
      var U = o.uni, det = cur[pi + 3] * cur[pi + 3] * 100, pan = (cur[pi + 2] - 0.5) * 2, inc = k ? v.inc2 : v.inc1, gl = k ? v.gl2 : v.gl1, gr = k ? v.gr2 : v.gr1;
      var norm = 1 / Math.sqrt(U), maxF = 0;
      for (var u = 0; u < U; u++) {
        var x = U === 1 ? 0 : u / (U - 1) * 2 - 1, fr = f0 * Math.pow(2, x * det / 1200);
        inc[u] = fr / sr; if (fr > maxF) maxF = fr;
        var pp = Math.max(-1, Math.min(1, pan + x * o.spread));
        gl[u] = norm * Math.min(1, 1 - pp); gr[u] = norm * Math.min(1, 1 + pp);
      }
      var Hmax = sr * 0.5 / Math.max(1, maxF), lev = Hmax >= 1023 ? 0 : Math.min(WLV - 1, Math.ceil(Math.log2(1023 / Math.max(1, Hmax))));
      if (Hmax < 1) continue;
      if (k) { T2 = T; F2 = T.F; U2 = U; lv2 = lev; } else { T1 = T; F1 = T.F; U1 = U; lv1 = lev; }
    }
    var f0s = 440 * Math.pow(2, (semis - 69) / 12) / C.sub.oct / sr;
    // filters
    var key = (v.note - 60) / 12;
    for (var fi = 0; fi < 2; fi++) {
      var fp = C.f[fi], ci = fi ? 17 : 14, cn = cur[ci];
      var hz = 20 * Math.pow(2, cn * 9.966 + fp.key * key + fp.env * e2 * 7);
      this.setupF(v.fs[fi * 2], fp.ty, hz, cn, cur[ci + 1], cur[ci + 2]); this.setupF(v.fs[fi * 2 + 1], fp.ty, hz, cn, cur[ci + 1], cur[ci + 2]);
    }
    var fL1 = v.fs[0], fR1 = v.fs[1], fL2 = v.fs[2], fR2 = v.fs[3], route = C.route, t1 = C.f[0].ty, t2 = C.f[1].ty;
    // ramps across the chunk
    var p1a = prev[0] * (F1 - 1), p1b = cur[0] * (F1 - 1), w1a = prev[1], w1b = cur[1], g1a = prev[3] * prev[3], g1b = cur[3] * cur[3];
    var p2a = prev[6] * (F2 - 1), p2b = cur[6] * (F2 - 1), w2a = prev[7], w2b = cur[7], g2a = prev[9] * prev[9], g2b = cur[9] * cur[9];
    var sa = prev[12] * prev[12], sb = cur[12] * cur[12], na = prev[13] * prev[13] * 0.5, nb = cur[13] * cur[13] * 0.5;
    var la = prev[20] * prev[20] * 1.4, lb = cur[20] * cur[20] * 1.4, gain = v.gain * 0.5;
    var wp1 = C.o[0].warp, wp2 = C.o[1].warp, ncol = C.noise.color, nk = ncol < 0.5 ? 0.02 + ncol * 1.9 : 0.15, shape = C.sub.shape;
    if (g1a === 0 && g1b === 0 && wp2 !== 6 && wp2 !== 8) T1 = null;   // (a silent oscillator isn't computed)
    if (g2a === 0 && g2b === 0 && wp1 !== 6 && wp1 !== 8) T2 = null;
    var useSub = sa > 0 || sb > 0, useNz = na > 0 || nb > 0;
    var D1 = T1 ? T1.data : null, D2 = T2 ? T2.data : null, o1prev = v.o1prev, nz = v.nz, subPh = v.subPh, ph1 = v.ph1, ph2 = v.ph2;
    var fadeStep = v.fading ? 1 / 96 : 0, fade = v.fade, invn = 1 / n, mono = true;
    if (D1) for (var m1 = 0; m1 < U1; m1++) if (v.gl1[m1] !== v.gr1[m1]) mono = false;
    if (D2) for (var m2 = 0; m2 < U2; m2++) if (v.gl2[m2] !== v.gr2[m2]) mono = false;
    if (route === 2 && t1 !== t2) mono = false;   // (left and right still match, but keep it simple)
    for (var i = i0; i < i1; i++) {
      var t = (i - i0 + 1) * invn, ol2 = 0, or2 = 0, o2m = 0, ol1 = 0, or1 = 0, o1m = 0;
      // oscillator 2 first (oscillator 1 can FM or ring-modulate from it)
      if (D2) {
        var pos2 = p2a + (p2b - p2a) * t, fa2 = pos2 | 0; if (fa2 > F2 - 2) fa2 = Math.max(0, F2 - 2); var ff2 = F2 > 1 ? pos2 - fa2 : 0;
        var bA2 = (fa2 * WLV + lv2) * WN, bB2 = F2 > 1 ? bA2 + WLV * WN : bA2, wa2 = w2a + (w2b - w2a) * t;
        for (var u2 = 0; u2 < U2; u2++) {
          var q2 = ph2[u2] + v.inc2[u2]; q2 -= Math.floor(q2); ph2[u2] = q2;
          var s2 = this.osc(D2, bA2, bB2, ff2, wp2 > 0 && wp2 < 7 ? this.warp(q2, wp2, wa2, o1prev) : q2);
          if (wp2 === 7) s2 = Math.sin(1.5707963 * (1 + wa2 * 6) * s2); else if (wp2 === 8) s2 = s2 * (1 - wa2) + s2 * o1prev * wa2;
          ol2 += s2 * v.gl2[u2]; or2 += s2 * v.gr2[u2]; o2m += s2;
        }
        var g2 = g2a + (g2b - g2a) * t; ol2 *= g2; or2 *= g2; o2m /= U2;
      }
      if (D1) {
        var pos1 = p1a + (p1b - p1a) * t, fa1 = pos1 | 0; if (fa1 > F1 - 2) fa1 = Math.max(0, F1 - 2); var ff1 = F1 > 1 ? pos1 - fa1 : 0;
        var bA1 = (fa1 * WLV + lv1) * WN, bB1 = F1 > 1 ? bA1 + WLV * WN : bA1, wa1 = w1a + (w1b - w1a) * t;
        for (var u1 = 0; u1 < U1; u1++) {
          var q1 = ph1[u1] + v.inc1[u1]; q1 -= Math.floor(q1); ph1[u1] = q1;
          var s1 = this.osc(D1, bA1, bB1, ff1, wp1 > 0 && wp1 < 7 ? this.warp(q1, wp1, wa1, o2m) : q1);
          if (wp1 === 7) s1 = Math.sin(1.5707963 * (1 + wa1 * 6) * s1); else if (wp1 === 8) s1 = s1 * (1 - wa1) + s1 * o2m * wa1;
          ol1 += s1 * v.gl1[u1]; or1 += s1 * v.gr1[u1]; o1m += s1;
        }
        var g1 = g1a + (g1b - g1a) * t; ol1 *= g1; or1 *= g1; o1prev = o1m / U1;
      }
      // sub and noise
      var other = 0;
      if (useSub) {
        subPh += f0s; if (subPh >= 1) subPh -= 1;
        var sv = Math.sin(6.283185307 * subPh); if (shape === 1) sv = tanhA(sv * 4); else if (shape === 2) sv = subPh < 0.5 ? 4 * subPh - 1 : 3 - 4 * subPh;
        other = sv * (sa + (sb - sa) * t);
      }
      if (useNz) { var wn = this.rnd() * 2 - 1; nz += (wn - nz) * nk; other += (ncol < 0.5 ? nz * (1.4 - ncol) : wn - nz * (1 - (ncol - 0.5) * 2) * 0.9) * (na + (nb - na) * t); }
      // filters
      var xl, xr, yl, yr;
      if (route === 2) {
        yl = (t1 ? this.filt(fL1, ol1) : ol1) + (t2 ? this.filt(fL2, ol2 + other) : ol2 + other);
        yr = mono ? yl : (t1 ? this.filt(fR1, or1) : or1) + (t2 ? this.filt(fR2, or2 + other) : or2 + other);
      } else {
        xl = ol1 + ol2 + other; xr = or1 + or2 + other;
        if (route === 1 && t1 && t2) { yl = (this.filt(fL1, xl) + this.filt(fL2, xl)) * 0.6; yr = mono ? yl : (this.filt(fR1, xr) + this.filt(fR2, xr)) * 0.6; }
        else {
          yl = t1 ? this.filt(fL1, xl) : xl; if (t2) yl = this.filt(fL2, yl);
          if (mono) yr = yl; else { yr = t1 ? this.filt(fR1, xr) : xr; if (t2) yr = this.filt(fR2, yr); }
        }
      }
      var a = (amp0 + (amp1 - amp0) * t) * (la + (lb - la) * t) * gain;
      if (fadeStep) { fade -= fadeStep; if (fade < 0) fade = 0; a *= fade; }
      L[i] += yl * a; R[i] += yr * a;
    }
    v.o1prev = o1prev; v.nz = nz; v.subPh = subPh; v.fade = fade;
    for (var z = 0; z < 4; z++) { var sz = v.fs[z]; if (Math.abs(sz.ic1) < 1e-15) sz.ic1 = 0; if (Math.abs(sz.ic2) < 1e-15) sz.ic2 = 0; if (Math.abs(sz.s4) < 1e-15) { sz.s1 = sz.s2 = sz.s3 = sz.s4 = 0; } }
    prev.set(cur);
    if ((v.es[0] === 0 && v.released) || (v.fading && fade <= 0)) { v.active = false; v.fading = false; }
  }
  osc(D, bA, bB, ff, q) {
    var x = q * WN, i = x | 0, fr = x - i, j = (i + 1) & WMASK; i &= WMASK;
    var a = D[bA + i] + (D[bA + j] - D[bA + i]) * fr; if (bB === bA) return a;
    var b = D[bB + i] + (D[bB + j] - D[bB + i]) * fr; return a + (b - a) * ff;
  }
  warp(q, w, amt, mod) {
    switch (w) {
      case 1: { var b = (amt - 0.5) * 2; return b >= 0 ? Math.pow(q, 1 + b * 3) : 1 - Math.pow(1 - q, 1 - b * 3); }
      case 2: { var r = q * (1 + amt * 7); return r - Math.floor(r); }
      case 3: { var m = q < 0.5 ? q * 2 : 2 - q * 2; return q + (m * 0.5 - q) * amt; }
      case 4: { var wd = 0.5 - (amt - 0.5) * 0.9; return q < wd ? q * 0.5 / wd : 0.5 + (q - wd) * 0.5 / (1 - wd); }
      case 5: { var st = Math.pow(2, 1 + (1 - amt) * 10); return Math.floor(q * st) / st; }
      case 6: { var p = q + amt * amt * 2 * mod; return p - Math.floor(p); }
      default: return q;
    }
  }
  process(inputs, outputs, params) {
    var out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, C = this.C;
    if (!C) return true;
    var detune = params.detune[0], pos = 0;
    for (var j = 0; j < 3; j++) { this.gph[j] += this.lfoRate(j, C.base[21 + j]) * n / sampleRate; this.gph[j] -= Math.floor(this.gph[j]); }
    var any = false;
    while (pos < n) {
      var t = currentTime + pos / sampleRate;
      while (this.q.length && this.q[0].time <= t + 0.5 / sampleRate) { var d = this.q.shift(); if (d.t === "on") this.noteOn(d); else this.noteOff(d); }
      var end = Math.min(n, pos + CH);
      if (this.q.length) { var off = Math.ceil((this.q[0].time - currentTime) * sampleRate); if (off > pos && off < end) end = off; }
      for (var i = 0; i < this.voices.length; i++) { var v = this.voices[i]; if (v.active) { any = true; this.render(v, L, R, pos, end, detune); } }
      pos = end;
    }
    if (this.viz && any) {
      this.vizT += n;
      if (this.vizT > 2048) {
        this.vizT = 0; var nv = null;
        for (var k = 0; k < this.voices.length; k++) { var w = this.voices[k]; if (w.active && (!nv || w.age > nv.age)) nv = w; }
        if (nv) this.port.postMessage({ t: "viz", p1: nv.cur[0], p2: nv.cur[6], c1: nv.cur[14], c2: nv.cur[17], a: nv.ev[0] });
      }
    }
    return true;
  }
}
registerProcessor("nb-wave", NBWave);
`;
  let WV_USER = {};   // your wavetables: id → { name, frames }
  // ---------- Natewave wavetables ----------
  // Each table is a set of single-cycle frames (2048 samples) that the oscillator scans with Position. Tables are made
  // here when first used: every frame is band-limited into 11 copies (all harmonics down to 1) so high notes don't alias.
  const WT_N = 2048, WT_H = 1023, WT_LV = 11;
  const WT = { cache: new Map(), order: [] };
  const wtFFT = (() => {
    const N = WT_N, rev = new Uint16Array(N), cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
    for (let i = 0, j = 0; i < N; i++) { rev[i] = j; let b = N >> 1; while (j & b) { j ^= b; b >>= 1; } j |= b; }
    for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / N); sn[i] = Math.sin(2 * Math.PI * i / N); }
    // in place; inv: e^{+i}, no scaling
    return (re, im, inv) => {
      for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, step = N / size;
        for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
          const wr = cs[k * step], wi = inv ? sn[k * step] : -sn[k * step], a = s + k, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    };
  })();
  // a frame from a function of phase (0..1)
  const wtT = fn => { const y = new Float64Array(WT_N); for (let i = 0; i < WT_N; i++) y[i] = fn(i / WT_N); return y; };
  // a frame from harmonic amplitudes: fn(h) → amplitude, or [amplitude, phase]; sine phase
  const wtHarm = fn => {
    const re = new Float64Array(WT_N), im = new Float64Array(WT_N);
    for (let h = 1; h <= WT_H; h++) {
      let a = fn(h), ph = 0; if (Array.isArray(a)) { ph = a[1]; a = a[0]; }
      if (!a) continue;
      re[h] = WT_N / 2 * a * Math.sin(ph); im[h] = -WT_N / 2 * a * Math.cos(ph);
      re[WT_N - h] = re[h]; im[WT_N - h] = -im[h];
    }
    wtFFT(re, im, true); for (let i = 0; i < WT_N; i++) re[i] /= WT_N;
    return re;
  };
  const wtMorph = (anchors, F = 16) => {   // F frames crossfading through the anchor frames
    const out = [];
    for (let k = 0; k < F; k++) {
      const x = k / (F - 1) * (anchors.length - 1), i = Math.min(anchors.length - 2, Math.floor(x)), fr = x - i, A = anchors[i], B = anchors[i + 1], y = new Float64Array(WT_N);
      for (let n = 0; n < WT_N; n++) y[n] = A[n] + (B[n] - A[n]) * fr;
      out.push(y);
    }
    return out;
  };
  const wtFrames = (F, fn) => Array.from({ length: F }, (_, k) => fn(k / (F - 1), k));
  const frac = x => x - Math.floor(x), TAU = Math.PI * 2;
  const sawT = p => 1 - 2 * frac(p), sqT = p => frac(p) < 0.5 ? 1 : -1, triT = p => { const x = frac(p); return x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4; };
  const sinT = p => Math.sin(TAU * p);
  const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // formants: amplitude of harmonic h at base pitch f0 through three resonances
  const VOW = { a: [[730, 1, 90], [1090, 0.5, 110], [2440, 0.25, 160]], e: [[530, 1, 70], [1840, 0.45, 110], [2480, 0.3, 160]],
    i: [[270, 1, 60], [2290, 0.4, 110], [3010, 0.3, 170]], o: [[570, 1, 80], [840, 0.55, 100], [2410, 0.12, 160]], u: [[300, 1, 60], [870, 0.35, 90], [2240, 0.08, 150]] };
  const formAmp = (fq, fs, shift = 1) => { let a = 0.004; for (const [f, g, bw] of fs) { const d = (fq - f * shift) / (bw * shift * 1.2); a += g / (1 + d * d); } return a; };
  const vowelSet = (order, f0, shift, src = h => 1 / Math.pow(h, 0.6)) => order.map(v => wtHarm(h => h * f0 > 9000 ? 0 : src(h) * formAmp(h * f0, VOW[v], shift)));
  const lerpSet = (a, b, x) => a.map(([f, g, bw], i) => [f + (b[i][0] - f) * x, g + (b[i][1] - g) * x, bw + (b[i][2] - bw) * x]);
  const fm = (c, m, I, fb = 0) => wtT(p => Math.sin(TAU * c * p + I * Math.sin(TAU * m * p)));
  const cz = (shape, x) => wtT(p => {   // Casio CZ phase distortion; x = amount 0..1
    const d = 0.5 - x * 0.48;
    if (shape === "saw") { const q = p < d ? p * 0.5 / d : 0.5 + (p - d) * 0.5 / (1 - d); return Math.cos(TAU * q); }
    if (shape === "square") { const w = 0.5 - x * 0.48, q = p < 0.5 ? (p < w ? p * 0.25 / w : 0.25) : (p - 0.5 < w ? 0.5 + (p - 0.5) * 0.25 / w : 0.75); return Math.cos(TAU * q); }
    if (shape === "pulse") { const w = 1 - x * 0.9, q = p < w ? p / w : 1; return Math.cos(TAU * q); }
    if (shape === "double") { const q = frac(p * 2), d2 = 0.5 - x * 0.48, r = q < d2 ? q * 0.5 / d2 : 0.5 + (q - d2) * 0.5 / (1 - d2); return Math.cos(TAU * r) * (p < 0.5 ? 1 : 0.7); }
    if (shape === "sawpulse") { const q = p < 0.5 ? (p < d / 2 ? p * 0.25 / (d / 2) : 0.25 + (p - d / 2) * 0.25 / (0.5 - d / 2)) : (p < 0.5 + (1 - x) * 0.25 ? 0.5 + (p - 0.5) * 0.5 / ((1 - x) * 0.25 + 1e-6) : 1); return Math.cos(TAU * Math.min(1, q)); }
    // resonant: a high sine windowed by a falling ramp / triangle / trapezoid
    const r = 1 + x * 14, s = Math.cos(TAU * frac(p * r));
    if (shape === "reso1") return 1 - (1 - s) * (1 - p);
    if (shape === "reso2") return 1 - (1 - s) * (p < 0.5 ? 2 * p : 2 - 2 * p);
    return 1 - (1 - s) * Math.min(1, (1 - p) * 2.5) * Math.min(1, p * 8);
  });
  const fold = (x, g) => Math.sin(Math.PI / 2 * g * x);
  const randSpec = (seed, tilt, rphase) => { const R = seeded(seed); return wtHarm(h => { const a = Math.pow(h, -tilt) * (0.2 + R()) * (h > 160 ? 0 : 1); return rphase ? [a, R() * TAU] : a; }); };
  const crush = (y, bits) => { const q = Math.pow(2, bits - 1); return y.map(v => Math.round(v * q) / q); };
  const hold = (fn, steps) => wtT(p => fn(Math.floor(p * steps) / steps));
  const reso = (src, c, q) => wtHarm(h => { const r = h / c, d = (1 - r * r), amp = 1 / Math.sqrt(d * d + (r / q) * (r / q)); return src(h) * amp; });
  const DRAWBARS = [[8,0,0,0,0,0,0], [8,8,0,0,0,0,0], [8,8,8,0,0,0,0], [8,0,8,0,0,0,0], [8,8,8,8,0,0,0], [6,8,8,6,0,0,0], [8,8,8,8,8,8,8], [8,4,0,4,0,0,2],
    [8,0,6,0,4,0,2], [4,8,8,8,4,0,0], [8,8,0,0,0,0,8], [8,6,4,2,0,0,0], [8,3,6,0,4,0,6], [8,8,8,0,0,0,8], [5,8,8,8,8,6,4], [8,8,8,8,8,8,0]];
  const DB_H = [1, 2, 3, 4, 5, 6, 8];
  // [id, name, category, frames()]
  const WT_DEFS = [
    ["basic", "Basic Shapes", "Analog", () => wtMorph([wtT(sinT), wtT(triT), wtT(sawT), wtT(sqT)], 16)],
    ["sawfade", "Saw Fade", "Analog", () => wtFrames(16, x => { const c = 1 + x * x * 220; return wtHarm(h => 1 / h / (1 + Math.pow(h / c, 4))); })],
    ["sqfade", "Square Fade", "Analog", () => wtFrames(16, x => { const c = 1 + x * x * 220; return wtHarm(h => h % 2 ? 1 / h / (1 + Math.pow(h / c, 4)) : 0); })],
    ["pulse", "Pulse Width", "Analog", () => wtFrames(16, x => { const w = 0.5 - x * 0.47; return wtT(p => p < w ? 1 - w : -w); })],
    ["sawpair", "Saw Pair", "Analog", () => wtFrames(16, x => wtT(p => sawT(p) * 0.6 + sawT(p + x * 0.5) * 0.6))],
    ["syncsaw", "Sync Saw", "Analog", () => wtFrames(16, x => wtT(p => sawT(p * (1 + x * 7))))],
    ["syncsq", "Sync Square", "Analog", () => wtFrames(16, x => wtT(p => sqT(p * (1 + x * 5)) * 0.8))],
    ["syncsine", "Sync Sine", "Analog", () => wtFrames(16, x => wtT(p => Math.sin(TAU * frac(p) * (1 + x * 5))))],
    ["resosaw", "Resonant Saw", "Analog", () => wtFrames(16, x => reso(h => 1 / h, 2 + x * x * 60, 7))],
    ["resosq", "Resonant Square", "Analog", () => wtFrames(16, x => reso(h => h % 2 ? 1 / h : 0, 3 + x * x * 60, 8))],
    ["trifold", "Triangle Fold", "Analog", () => wtFrames(16, x => wtT(p => fold(triT(p), 1 + x * 5)))],
    ["sinefold", "Sine Fold", "Analog", () => wtFrames(16, x => wtT(p => fold(sinT(p), 1 + x * 7)))],
    ["single", "Single Harmonic", "Harmonic", () => wtFrames(16, (x, k) => wtHarm(h => h === k + 1 ? 1 : 0))],
    ["build", "Harmonic Build", "Harmonic", () => wtFrames(16, x => { const n = 1 + x * 39; return wtHarm(h => h <= n ? 1 / h : h < n + 1 ? (n + 1 - h) / h : 0); })],
    ["oddbuild", "Odd Build", "Harmonic", () => wtFrames(16, x => { const n = 1 + x * 50; return wtHarm(h => h % 2 && h <= n ? 1 / h : 0); })],
    ["evenglow", "Even Glow", "Harmonic", () => wtFrames(16, x => { const n = 2 + x * 30; return wtHarm(h => h === 1 ? 1 : h % 2 === 0 && h <= n ? 0.7 / Math.sqrt(h) : 0); })],
    ["formsweep", "Formant Sweep", "Harmonic", () => wtFrames(16, x => { const c = 2 * Math.pow(25, x); return wtHarm(h => 0.25 / Math.pow(h, 0.5) + 1 / (1 + Math.pow(Math.log2(h / c) * 3, 2)) / h * c * 0.4); })],
    ["twinpeaks", "Twin Peaks", "Harmonic", () => wtFrames(16, x => { const a = 4 / (1 + x), b = 4 * (1 + x * 6); return wtHarm(h => 0.15 / h + 1 / (1 + Math.pow(Math.log2(h / a) * 4, 2)) + 0.6 / (1 + Math.pow(Math.log2(h / b) * 4, 2))); })],
    ["comb", "Comb Spectra", "Harmonic", () => wtFrames(16, x => { const sp = 2 + x * 10; return wtHarm(h => (1 + Math.cos(TAU * h / sp)) / 2 / h); })],
    ["drawbar", "Organ Drawbars", "Harmonic", () => DRAWBARS.map(d => wtHarm(h => { const i = DB_H.indexOf(h); return i >= 0 && d[i] ? Math.pow(10, (d[i] - 8) * 3 / 20) : 0; }))],
    ["hollow", "Hollow", "Harmonic", () => wtFrames(16, x => wtHarm(h => h % 2 ? (h % 4 === 1 ? 1 : 0.2 + x * 0.8) / h : (h & (h - 1)) === 0 ? 0.5 / h * x : 0))],
    ["tilt", "Spectral Tilt", "Harmonic", () => wtFrames(16, x => wtHarm(h => h > 200 ? 0 : Math.pow(h, -2 + x * 1.7)))],
    ["bellcyc", "Bell Cycle", "Harmonic", () => wtFrames(16, x => wtHarm(h => ({ 1: 1, 3: 0.6, 5: 0.5, 9: 0.35, 13: 0.25, 17: 0.18, 23: 0.12 })[h] * (h === 1 ? 1 : x * 0.9 + 0.1) || 0))],
    ["glass", "Glass", "Harmonic", () => wtFrames(16, x => wtHarm(h => h === 1 ? 1 : [7, 11, 13, 17, 19, 23].includes(h) ? x * 0.4 / Math.sqrt(h / 7) : 0))],
    ["metal", "Metal", "Harmonic", () => wtFrames(16, x => { const c = 12 + x * 40; return wtHarm(h => (h === 1 ? 0.5 : 0) + Math.exp(-Math.pow((h - c) / 4, 2)) * 0.5 * ((h * 7) % 3 ? 1 : 0.4)); })],
    ...[1, 2, 3, 4].map(i => ["stack" + i, "Wavestack " + i, "Harmonic", () => wtMorph([0, 1, 2, 3].map(j => randSpec(i * 101 + j * 7, 1.0, false)), 16)]),
    ["vowels", "Vowels", "Vocal", () => wtMorph(vowelSet(["a", "e", "i", "o", "u"], 130, 1), 16)],
    ["vowelsbass", "Vowels Bass", "Vocal", () => wtMorph(vowelSet(["o", "a", "e", "u"], 82, 0.85), 16)],
    ["vowelssop", "Vowels Soprano", "Vocal", () => wtMorph(vowelSet(["a", "e", "i", "o", "u"], 260, 1.2), 16)],
    ["choir", "Choir Ah-Oo", "Vocal", () => wtFrames(16, x => wtHarm(h => h * 196 > 8000 ? 0 : formAmp(h * 196, x < 0.5 ? lerpSet(VOW.a, VOW.o, x * 2) : lerpSet(VOW.o, VOW.u, x * 2 - 1), 1.1) / Math.pow(h, 0.9)))],
    ["whisper", "Whisper", "Vocal", () => { const R = seeded(77); const ph = Array.from({ length: WT_H + 1 }, () => R() * TAU); return wtMorph(["a", "e", "i", "o"].map(v => wtHarm(h => h * 130 > 9000 ? 0 : [formAmp(h * 130, VOW[v], 1) * 0.6, ph[h]])), 16); }],
    ["talkbox", "Talk Box", "Vocal", () => wtFrames(16, x => wtHarm(h => h * 110 > 9000 ? 0 : formAmp(h * 110, [[300 + x * 500, 1, 80], [2200 - x * 1300, 0.6, 120], [2600, 0.2, 160]], 1) / Math.pow(h, 0.4)))],
    ["robot", "Robot", "Vocal", () => wtMorph(vowelSet(["u", "o", "a", "e", "i"], 110, 1, h => h % 2 ? 1 / Math.pow(h, 0.5) : 0.05), 16)],
    ["growlv", "Growl", "Vocal", () => wtMorph(["o", "a", "e"].map(v => { const b = wtHarm(h => h * 82 > 9000 ? 0 : formAmp(h * 82, VOW[v], 0.9) / Math.pow(h, 0.3)); let pk = 0; for (const s of b) pk = Math.max(pk, Math.abs(s)); return b.map(s => Math.tanh(3 * s / pk)); }), 16)],
    ...[[1, "1:1"], [2, "1:2"], [3, "1:3"], [4, "1:4"], [5, "1:5"], [7, "1:7"]].map(([m, n]) => ["fm" + m, "FM " + n, "Digital", () => wtFrames(16, x => fm(1, m, x * x * 8))]),
    ["fm32", "FM 3:2", "Digital", () => wtFrames(16, x => fm(3, 2, x * 6))],
    ["fmbell", "FM Bell", "Digital", () => wtFrames(16, x => fm(2, 7, x * 5))],
    ["fmfb", "FM Feedback", "Digital", () => wtFrames(16, x => { const b = x * 1.6, y = new Float64Array(WT_N); let prev = 0; for (let pass = 0; pass < 3; pass++) for (let i = 0; i < WT_N; i++) { prev = Math.sin(TAU * i / WT_N + b * prev); y[i] = prev; } return y; })],
    ...[["saw", "CZ Saw"], ["square", "CZ Square"], ["pulse", "CZ Pulse"], ["double", "CZ Double Sine"], ["sawpulse", "CZ Saw-Pulse"], ["reso1", "CZ Reso 1"], ["reso2", "CZ Reso 2"], ["reso3", "CZ Reso 3"]]
      .map(([s, n]) => ["cz" + s, n, "Digital", () => wtFrames(16, x => cz(s, x))]),
    ["cheby", "Chebyshev", "Digital", () => wtFrames(16, x => wtT(p => { const c = Math.cos(TAU * p); let t0 = 1, t1 = c, sum = c; for (let n = 2; n <= 9; n++) { const t2 = 2 * c * t1 - t0; t0 = t1; t1 = t2; sum += t2 * Math.max(0, Math.min(1, x * 9 - n + 2)) / n * 2; } return sum; }))],
    ["shaper", "Waveshaper", "Digital", () => wtFrames(16, x => wtT(p => Math.tanh((sinT(p) + 0.3 * sawT(p)) * (1 + x * 12))))],
    ["crushsine", "Crushed Sine", "Digital", () => wtFrames(16, x => crush(wtT(sinT), 8 - x * 6.5))],
    ["crushsaw", "Crushed Saw", "Digital", () => wtFrames(16, x => crush(wtT(sawT), 8 - x * 6.5))],
    ["decsine", "Decimated Sine", "Digital", () => wtFrames(16, x => hold(sinT, Math.round(64 / Math.pow(16, x))))],
    ["decsaw", "Decimated Saw", "Digital", () => wtFrames(16, x => hold(sawT, Math.round(64 / Math.pow(16, x))))],
    ...Array.from({ length: 10 }, (_, i) => ["digi" + (i + 1), "Digital " + (i + 1), "Digital", () => wtMorph([0, 1, 2, 3, 4].map(j => randSpec(900 + i * 31 + j, 0.35 + (i % 3) * 0.25, i % 2 === 0)), 16)]),
    ["reese", "Reese Grind", "Bass & Lead", () => wtFrames(16, x => wtT(p => sawT(p) * 0.6 + sawT(2 * p + x * 0.5) * 0.35 + sawT(p + 0.25 + x * 0.25) * 0.3))],
    ["hoover", "Hoover", "Bass & Lead", () => wtFrames(16, x => { const w = 0.5 - x * 0.4; return wtT(p => sawT(p) * 0.5 + (frac(p) < w ? 0.6 : -0.6) + sawT(p * 2) * 0.15 * x); })],
    ["acid", "Acid", "Bass & Lead", () => wtFrames(16, x => reso(h => h % 2 ? 1 / h : 0.15 / h, 2 + x * x * 40, 14))],
    ["subharm", "Sub Harmonics", "Bass & Lead", () => wtFrames(16, x => wtHarm(h => h === 1 ? 1 : h === 2 ? x * 0.5 : h === 3 ? x * x * 0.3 : h === 4 ? x * x * 0.12 : 0))],
    ["neuro", "Neuro", "Bass & Lead", () => wtFrames(16, x => wtT(p => fold(Math.sin(TAU * p + x * 3 * Math.sin(TAU * 2 * p)), 1 + x * 3)))],
    ["wobblev", "Wobble Vowel", "Bass & Lead", () => wtMorph(vowelSet(["u", "o", "a", "o", "u"], 65, 0.8, h => 1 / Math.pow(h, 0.35)), 16)],
    ["growlsaw", "Growl Saw", "Bass & Lead", () => wtFrames(16, x => { const y = wtT(p => sawT(p) + x * 0.8 * Math.sin(TAU * 5 * p + 2 * x * sinT(p))); return y.map(v => Math.tanh(v * (1 + x * 2))); })],
    ["laser", "Laser", "Bass & Lead", () => wtFrames(16, x => { const c = 1 + x * 24; return wtHarm(h => Math.exp(-Math.pow(h - c, 2) / 3) + 0.2 / h); })],
    ["brass", "Brass", "Bass & Lead", () => wtFrames(16, x => { const c = 2 + x * x * 40; return wtHarm(h => 1 / h / (1 + Math.pow(h / c, 3)) * (1 + 0.6 * Math.exp(-Math.pow(Math.log2(h / 6), 2)))); })],
    ["strings", "Strings", "Bass & Lead", () => wtFrames(16, x => wtHarm(h => 1 / h * (0.65 + 0.35 * Math.cos(TAU * h * (0.08 + x * 0.12))) / (1 + Math.pow(h / (30 + x * 60), 2))))],
    ["epiano", "E-Piano", "Bass & Lead", () => wtFrames(16, x => wtT(p => Math.sin(TAU * p + x * 2.5 * Math.sin(TAU * p) + x * x * 0.6 * Math.sin(TAU * 14 * p))))],
    ["clav", "Clav", "Bass & Lead", () => wtFrames(16, x => { const w = 0.25 - x * 0.2; return wtHarm(h => { const a = Math.sin(Math.PI * h * w) / h; return h < 2 ? a * 0.5 : a; }); })],
    ["marimba", "Marimba", "Bass & Lead", () => wtFrames(16, x => wtHarm(h => h === 1 ? 1 : h === 4 ? 0.5 * x : h === 10 ? 0.25 * x * x : 0))],
    ["pluckb", "Pluck Bright", "Bass & Lead", () => wtFrames(16, x => wtHarm(h => Math.sin(Math.PI * h * (0.1 + x * 0.3)) / Math.pow(h, 1.1)))],
    ["grit", "Grit", "Noise & Texture", () => { const R = seeded(4242), ph = Array.from({ length: WT_H + 1 }, () => R() * TAU); return wtFrames(16, x => { const c = 4 * Math.pow(60, x); return wtHarm(h => [1 / (1 + Math.pow(Math.log2(h / c) * 1.5, 2)) / Math.sqrt(h), ph[h]]); }); }],
    ["dust", "Dust", "Noise & Texture", () => { const R = seeded(31337); const pts = Array.from({ length: 24 }, () => [R(), R() * 2 - 1]); return wtFrames(16, x => { const n = 2 + Math.round(x * 22); return wtT(p => { let y = 0; for (let i = 0; i < n; i++) { const d = frac(p - pts[i][0] + 0.5) - 0.5; y += pts[i][1] * Math.exp(-d * d * 4e4); } return y; }); }); }],
    ["air", "Air", "Noise & Texture", () => { const R = seeded(555), ph = Array.from({ length: WT_H + 1 }, () => R() * TAU); return wtFrames(16, x => wtHarm(h => h < 8 + x * 40 ? 0 : h > 300 ? 0 : [0.3 / Math.sqrt(h), ph[h]])); }],
    ["hissform", "Hiss Formant", "Noise & Texture", () => { const R = seeded(99), ph = Array.from({ length: WT_H + 1 }, () => R() * TAU); return wtMorph(["u", "o", "a", "e", "i"].map(v => wtHarm(h => h * 60 > 9000 ? 0 : [formAmp(h * 60, VOW[v], 1) * 0.5, ph[h]])), 16); }],
    ["static", "Static", "Noise & Texture", () => wtFrames(16, (x, k) => randSpec(7000 + k, 0.3 + x * 0.6, true))],
    ["rust", "Rust", "Noise & Texture", () => { const R = seeded(808), ph = Array.from({ length: WT_H + 1 }, () => R() * TAU); return wtFrames(16, x => wtHarm(h => h > 250 ? 0 : [(h % 2 ? 1 : x) / Math.pow(h, 0.8), ph[h] * x])); }],
    ["phaser", "Phaser Sweep", "Motion", () => wtFrames(16, x => wtHarm(h => { const c1 = 3 + x * 30, c2 = c1 * 2.4; return 1 / h * (1 - 0.95 / (1 + Math.pow((h - c1) / (c1 * 0.15), 2)) - 0.95 / (1 + Math.pow((h - c2) / (c2 * 0.15), 2))); }))],
    ["shepard", "Shepard", "Motion", () => wtFrames(16, x => wtHarm(h => { const o = Math.log2(h) - x; const d = frac(o + 0.5) - 0.5; return Math.abs(d) < 0.08 && h > 0 ? Math.exp(-Math.pow((Math.log2(h) - 3.5) / 2, 2)) : 0; }))],
    ["pulsetrain", "Pulse Train", "Motion", () => wtFrames(16, (x, k) => { const n = 1 + Math.floor(x * 7.99); return wtT(p => frac(p * n) < 0.12 ? 1 : -0.14); })],
    ["ripple", "Ripple", "Motion", () => wtFrames(16, x => wtT(p => sinT(p) + x * 0.35 * Math.sin(TAU * p * 9) * Math.cos(TAU * p)))],
    ["spiral", "Spiral", "Motion", () => wtFrames(16, x => wtHarm(h => h > 64 ? 0 : [1 / h, h * h * x * 0.4]))],
    ["stepped", "Stepped", "Motion", () => wtFrames(16, x => { const n = 2 + Math.round(x * 14); return wtT(p => Math.floor(frac(p) * n) / (n - 1) * 2 - 1); })],
    ["trapezoid", "Trapezoid", "Motion", () => wtFrames(16, x => { const s = 0.01 + x * 0.24; return wtT(p => Math.max(-1, Math.min(1, triT(p) / (s * 4 + 1e-6) * 1))); })],
    ["expo", "Exponential", "Motion", () => wtFrames(16, x => { const k = 1 + x * 12; return wtT(p => { const q = frac(p); return (q < 0.5 ? (Math.exp(k * q * 2) - 1) / (Math.exp(k) - 1) : (Math.exp(k * (1 - q) * 2) - 1) / (Math.exp(k) - 1)) * 2 - 1; }); })],
    ["rampbend", "Ramp Bend", "Motion", () => wtFrames(16, x => wtT(p => 1 - 2 * Math.pow(frac(p), 1 + x * 5)))],
    ["bouncing", "Bouncing", "Motion", () => wtFrames(16, x => wtT(p => Math.sin(TAU * p * (2 + x * 10)) * Math.exp(-p * (1 + x * 6))))],
    ["gate", "Gated Sine", "Motion", () => wtFrames(16, x => wtT(p => frac(p) < 1 - x * 0.85 ? Math.sin(TAU * frac(p) / (1 - x * 0.85)) : 0))],
    ["halfrect", "Half Wave", "Motion", () => wtFrames(16, x => wtT(p => { const s = sinT(p); return s > 0 ? s : s * (1 - x); }))],
    ["sinestack", "Octave Sines", "Motion", () => wtFrames(16, x => wtHarm(h => (h & (h - 1)) === 0 && h <= 64 ? Math.exp(-Math.pow(Math.log2(h) - x * 6, 2)) : 0))],
    ["fifths", "Fifths", "Motion", () => wtFrames(16, x => wtHarm(h => h === 1 ? 1 : h === 3 ? x : h === 2 ? 0.6 : h === 6 ? x * 0.5 : h === 4 ? 0.3 : 0))],
    ["sweepnotch", "Notch Sweep", "Motion", () => wtFrames(16, x => { const c = 2 + x * 40; return wtHarm(h => 1 / h * Math.min(1, Math.abs(h - c) / 2)); })],
  ];
  const WT_CATS = ["Analog", "Harmonic", "Vocal", "Digital", "Bass & Lead", "Noise & Texture", "Motion", "Yours"];
  // the frames → the band-limited copies (Float32Array: frame × level × 2048), each frame at the same loudness
  function wtBuild(frames) {
    const F = frames.length, out = new Float32Array(F * WT_LV * WT_N), re = new Float64Array(WT_N), im = new Float64Array(WT_N), sre = new Float64Array(WT_N), sim = new Float64Array(WT_N);
    for (let f = 0; f < F; f++) {
      const y = frames[f]; let dc = 0;
      for (let i = 0; i < WT_N; i++) { sre[i] = y[i]; sim[i] = 0; dc += y[i]; }
      wtFFT(sre, sim, false); sre[0] = 0; sim[0] = 0; sre[WT_N / 2] = 0; sim[WT_N / 2] = 0;
      let norm = 0;
      for (let lv = 0; lv < WT_LV; lv++) {
        const maxH = WT_H >> lv;
        for (let i = 0; i < WT_N; i++) { const h = i <= WT_N / 2 ? i : WT_N - i; if (h <= maxH) { re[i] = sre[i]; im[i] = sim[i]; } else { re[i] = 0; im[i] = 0; } }
        wtFFT(re, im, true);
        const o = (f * WT_LV + lv) * WT_N;
        if (lv === 0) { let pk = 0; for (let i = 0; i < WT_N; i++) pk = Math.max(pk, Math.abs(re[i])); norm = pk > 1e-9 ? 0.92 / (pk / WT_N) : 0; }
        for (let i = 0; i < WT_N; i++) out[o + i] = re[i] / WT_N * norm;
      }
    }
    return out;
  }
  function wtGet(id) {
    if (WT.cache.has(id)) { WT.order = WT.order.filter(x => x !== id).concat(id); return WT.cache.get(id); }
    let frames = null;
    const d = WT_DEFS.find(x => x[0] === id);
    if (d) frames = d[3]();
    else if (WV_USER[id]) frames = WV_USER[id].frames;
    if (!frames) frames = WT_DEFS[0][3]();
    const T = { id, F: frames.length, data: wtBuild(frames) };
    WT.cache.set(id, T); WT.order.push(id);
    while (WT.order.length > 8) { const old = WT.order.shift(); WT.cache.delete(old); }
    return T;
  }
  const wtName = id => { const d = WT_DEFS.find(x => x[0] === id); return d ? d[1] : WV_USER[id] ? WV_USER[id].name : "Basic Shapes"; };

  const WV_KEY = "nightbloom-wave", WV_TKEY = "nightbloom-wt";
  const WV_SRCS = [["e2", "Env 2"], ["e3", "Env 3"], ["l1", "LFO 1"], ["l2", "LFO 2"], ["l3", "LFO 3"], ["vel", "Velocity"], ["key", "Key"], ["wheel", "Mod wheel"],
    ["press", "Pressure"], ["slide", "Slide"], ["rand", "Random"], ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ["m" + i, "M" + i])];
  const WV_DSTS = [["o1.pos", "Osc 1 position"], ["o1.wamt", "Osc 1 warp"], ["o1.pitch", "Osc 1 pitch"], ["o1.level", "Osc 1 level"], ["o1.pan", "Osc 1 pan"], ["o1.det", "Osc 1 detune"],
    ["o2.pos", "Osc 2 position"], ["o2.wamt", "Osc 2 warp"], ["o2.pitch", "Osc 2 pitch"], ["o2.level", "Osc 2 level"], ["o2.pan", "Osc 2 pan"], ["o2.det", "Osc 2 detune"],
    ["sub.level", "Sub level"], ["noise.level", "Noise level"], ["f1.cut", "Filter 1 cutoff"], ["f1.res", "Filter 1 resonance"], ["f1.drive", "Filter 1 drive"],
    ["f2.cut", "Filter 2 cutoff"], ["f2.res", "Filter 2 resonance"], ["f2.drive", "Filter 2 drive"], ["amp.level", "Volume"], ["l1.rate", "LFO 1 rate"], ["l2.rate", "LFO 2 rate"], ["l3.rate", "LFO 3 rate"]];
  const WV_WARPS = ["Off", "Bend", "Sync", "Mirror", "Squeeze", "Crush", "FM from the other osc", "Fold", "Ring with the other osc"];
  const WV_FT = [["off", "Off"], ["ladder", "Ladder 24 dB"], ["lp12", "Low-pass 12"], ["bp", "Band-pass"], ["hp", "High-pass"], ["notch", "Notch"], ["comb+", "Comb +"], ["comb-", "Comb −"], ["formant", "Formant (vowels)"]];
  const WV_LSH = ["Sine", "Triangle", "Saw up", "Saw down", "Square", "Sample & hold", "Smooth random"];
  const WV_SYNC = ["4 bars", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];
  const wvOsc = o => Object.assign({ on: true, table: "basic", pos: 0, warp: 0, wamt: 0, pitch: 0.5, fine: 0.5, uni: 1, det: 0.25, spread: 0.6, level: 0.8, pan: 0.5, rnd: true }, o);
  const wvAdsr = (a, d, s, r) => ({ a, d, s, r });
  function wvInit() {
    return {
      name: "Init", o1: wvOsc({ pos: 0.66, warp: 1, wamt: 0.5 }), o2: wvOsc({ level: 0, on: false }),
      sub: { level: 0, oct: 1, shape: 0 }, noise: { level: 0, color: 0.5 },
      f1: { type: "ladder", cut: 0.72, res: 0.15, drive: 0.1, key: 0.5, env: 0.62 }, f2: { type: "off", cut: 1, res: 0, drive: 0, key: 0, env: 0.5 }, route: "serial",
      amp: { a: 0, d: 0.45, s: 0.8, r: 0.32, level: 0.8 }, e2: wvAdsr(0, 0.42, 0.3, 0.4), e3: wvAdsr(0.5, 0.5, 0.5, 0.5),
      l1: { shape: 0, rate: 0.5, sync: false, retrig: true, fade: 0 }, l2: { shape: 1, rate: 0.35, sync: false, retrig: false, fade: 0 }, l3: { shape: 6, rate: 0.3, sync: false, retrig: true, fade: 0 },
      voice: { mode: "poly", glide: 0, max: 8 },
      mods: [{ src: "m1", dst: "f1.cut", amt: 0.3 }, { src: "l1", dst: "o1.pos", amt: 0.3, via: "m2" }, { src: "m3", dst: "o1.wamt", amt: 0.45 }, { src: "m4", dst: "sub.level", amt: 0.75 }],
      macros: ["Bright", "Motion", "Bend", "Sub", "Macro 5", "Macro 6", "Macro 7", "Macro 8"],
    };
  }
  // a preset or saved patch over the defaults, so older patches keep working as the synth grows
  function wvFill(p) {
    const b = wvInit(), out = JSON.parse(JSON.stringify(b));
    if (!p) return out;
    for (const k in p) {
      if (k === "mods" || k === "macros") { if (Array.isArray(p[k])) out[k] = JSON.parse(JSON.stringify(p[k])); }
      else if (p[k] && typeof p[k] === "object" && out[k] && typeof out[k] === "object") Object.assign(out[k], JSON.parse(JSON.stringify(p[k])));
      else out[k] = p[k];
    }
    while (out.macros.length < 8) out.macros.push("Macro " + (out.macros.length + 1));
    return out;
  }
  const WV = { patch: null, recs: new Map(), id: 1, open: false, undo: [], arm: null, viz: null, knobs: [], saveT: 0, mac: [], sec: "osc1", locks: {} };
  try { WV.patch = wvFill(JSON.parse(localStorage.getItem(WV_KEY) || "null")); } catch (e) { WV.patch = wvFill(null); }
  // your wavetables are kept compact (16-bit) with the app's other settings, so projects carry them
  try {
    const o = JSON.parse(localStorage.getItem(WV_TKEY) || "{}");
    for (const id in o) {
      const bin = atob(o[id].d), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(u8.buffer), F = o[id].F, frames = [];
      for (let f = 0; f < F; f++) { const y = new Float64Array(WT_N); for (let i = 0; i < WT_N; i++) y[i] = i16[f * WT_N + i] / 32767; frames.push(y); }
      WV_USER[id] = { name: o[id].name, frames };
    }
  } catch (e) {}
  function wvSaveUser() {
    const o = {};
    for (const id in WV_USER) {
      const U = WV_USER[id], i16 = new Int16Array(U.frames.length * WT_N);
      U.frames.forEach((y, f) => { let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v)); const k = pk > 0 ? 1 / pk : 0; for (let i = 0; i < WT_N; i++) i16[f * WT_N + i] = Math.round(y[i] * k * 32767); });
      const u8 = new Uint8Array(i16.buffer); let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      o[id] = { name: U.name, F: U.frames.length, d: btoa(s) };
    }
    try { localStorage.setItem(WV_TKEY, JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  // ---------- the processor, one per audio context ----------
  function wvRec(create = true) {
    if (!ctx || !ctx.audioWorklet || typeof AudioWorkletNode === "undefined") return null;
    let R = WV.recs.get(ctx); if (R || !create) return R || null;
    R = { ctx, node: null, out: ctx.createGain(), dest: null, sent: [], pending: [], ready: false, failed: false, detune: false, mac: [], ctl: {} };
    WV.recs.set(ctx, R);
    (async () => {
      let ok = false;
      for (const url of [() => URL.createObjectURL(new Blob([WV_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(WV_SRC)]) {
        try { await R.ctx.audioWorklet.addModule(url()); ok = true; break; } catch (e) {}
      }
      if (!ok) { R.failed = true; R.pending = []; noteMsg("Natewave can't start here: this page may not load its audio processor.", true); return; }
      try { R.node = new AudioWorkletNode(R.ctx, "nb-wave", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }); } catch (e) { R.failed = true; return; }
      R.node.connect(R.out);
      R.node.port.onmessage = e => { if (e.data && e.data.t === "viz") WV.viz = e.data; };
      R.ready = true; wvSync(R); wvCtl(R, true);
      if (WV.open) R.node.port.postMessage({ t: "viz", on: true });
      const now = R.ctx.currentTime; R.pending.forEach(d => { if (d.time != null) d.time = Math.max(d.time, now); R.node.port.postMessage(d); }); R.pending = [];
    })();
    return R;
  }
  const wvPost = (R, d) => { if (R.ready) R.node.port.postMessage(d); else if (!R.failed) R.pending.push(d); };
  function wvPatchOut() {   // Lite plays fewer unison voices and notes
    const p = JSON.parse(JSON.stringify(WV.patch));
    if (typeof NB_LITE !== "undefined" && NB_LITE) { p.o1.uni = Math.min(3, p.o1.uni); p.o2.uni = Math.min(3, p.o2.uni); p.voice.max = Math.min(6, p.voice.max); }
    return p;
  }
  function wvSync(R) {
    if (!R || !R.ready) return;
    const need = [WV.patch.o1.table, WV.patch.o2.table];
    for (const id of need) {
      if (R.sent.includes(id)) { R.sent = R.sent.filter(x => x !== id).concat(id); continue; }
      const T = wtGet(id), data = T.data.slice();
      R.node.port.postMessage({ t: "table", id, F: T.F, data }, [data.buffer]); R.sent.push(id);
    }
    const spare = R.sent.filter(x => !need.includes(x));
    while (R.sent.length > 6 && spare.length) { const old = spare.shift(); R.sent = R.sent.filter(x => x !== old); R.node.port.postMessage({ t: "drop", id: old }); }
    R.node.port.postMessage({ t: "patch", p: wvPatchOut() });
  }
  // macros, wheels and tempo follow the app
  function wvCtl(R, force) {
    if (!R || !R.ready) return;
    const P = state.params.wave || {};
    for (let i = 0; i < 8; i++) { const v = +P["m" + (i + 1)] || 0; if (force || R.mac[i] !== v) { R.mac[i] = v; R.node.port.postMessage({ t: "ctl", k: "macro", i, v }); } }
    const ms = typeof MODSRC !== "undefined" ? MODSRC : { wheel: pm.mod, press: 0 };
    const c = { wheel: ms.wheel, press: Math.min(1, ms.press / 0.8), bpm: state.seq && state.seq.bpm || 120 };
    for (const k in c) if (force || R.ctl[k] !== c[k]) { R.ctl[k] = c[k]; R.node.port.postMessage({ t: "ctl", k, v: c[k] }); }
  }
  setInterval(() => { const R = wvRec(false); if (R && R.ready) wvCtl(R); }, 30);
  let wvChT = 0;
  function wvChanged(quiet) {
    if (!wvChT) wvChT = requestAnimationFrame(() => { wvChT = 0; const R = wvRec(false); if (R) wvSync(R); wvPaintAll(); });
    clearTimeout(WV.saveT); WV.saveT = setTimeout(() => { try { localStorage.setItem(WV_KEY, JSON.stringify(WV.patch)); } catch (e) {} }, 400);
  }
  // ---------- playing ----------
  const WV_DUMMY = midi => ({ midi, stop() {} });
  wvVoice = function (midi, mix, when) {
    const R = wvRec(); if (!R || R.failed) return WV_DUMMY(midi);
    const dest = fx.input;
    if (R.dest !== dest) { try { R.out.disconnect(); } catch (e) {} R.out.connect(dest); R.dest = dest; }
    if (R.node && !R.detune && typeof pmNodes !== "undefined" && pmNodes) { try { pmNodes.bus.connect(R.node.parameters.get("detune")); R.detune = true; } catch (e) {} }
    const id = WV.id++, t = Math.max(ctx.currentTime, when ?? 0), vel = Math.max(0, Math.min(1, (typeof NB_VEL !== "undefined" ? NB_VEL : 1) / 1.3));
    const cm = typeof NB_CM !== "undefined" && NB_CM ? NB_CM.wave(R, id, midi) : null;
    wvPost(R, { t: "on", id, note: midi, vel, gain: mix, time: t, shift: cm ? cm.shift : 0, bend: cm ? cm.bend : 0 });
    let done = false;
    return { midi, wvId: id, stop(at) { if (done || !ctx) return; done = true; wvPost(R, { t: "off", id, time: Math.max(ctx.currentTime, at ?? 0) }); } };
  };
  // the sound engine started (or restarted): get the processor ready before the first note
  { const ba = buildAudio; buildAudio = function () { const r = ba.apply(this, arguments); if (state.layers.wave && (state.layers.wave.on || state.engine === "wave")) setTimeout(() => wvRec(), 0); return r; }; }
  ["stopAll", "panic"].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => { WV.recs.forEach(R => wvPost(R, { t: "kill" })); }); });
