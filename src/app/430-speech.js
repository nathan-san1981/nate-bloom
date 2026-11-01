  // ---------- Speech ----------
  {
  const SP_ALPHA = "!#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghi";
  //@site-only
  //@include data/sp-dict-lazy.js
  //@end
  //@art-only
  //@include data/sp-dict.js
  //@end
  const SP_WK = `// nb-speech: the speech chips. One processor plays every voice; each voice walks through its targets (formants,
// voicing, hiss) and renders them the way its machine did: formant filters, LPC lattices, synced oscillators,
// VOSIM pulse trains, a filter bank.
const SR = sampleRate, TAU = Math.PI * 2;
const F1 = 0, B1 = 5, AV = 10, AH = 11, AF = 12, FF = 13, FB = 14, FF2 = 15, AB = 16, NZ = 17, NP = 18, PM = 19, NV = 20;
// the TMS5220's chirp (its voiced excitation) and reflection-coefficient tables, and the TMS5100's first one
const CHIRP = [0x00, 0x2a, 0xd4, 0x32, 0xb2, 0x12, 0x25, 0x14, 0x02, 0xe1, 0xc5, 0x02, 0x5f, 0x5a, 0x05, 0x0f, 0x26, 0xfc, 0xa5, 0xa5, 0xd6, 0xdd, 0xdc, 0xfc, 0x25, 0x2b,
  0x22, 0x21, 0x0f, 0xff, 0xf8, 0xee, 0xed, 0xef, 0xf7, 0xf6, 0xfa, 0x00, 0x03, 0x02, 0x01].map(b => (b > 127 ? b - 256 : b) / 128);
const KT = [
  [-501, -498, -497, -495, -493, -491, -488, -482, -478, -474, -469, -464, -459, -452, -445, -437, -412, -380, -339, -288, -227, -158, -81, -1, 80, 157, 226, 287, 337, 379, 411, 436],
  [-328, -303, -274, -244, -211, -175, -138, -99, -59, -18, 24, 64, 105, 143, 180, 215, 248, 278, 306, 331, 354, 374, 392, 408, 422, 435, 445, 455, 463, 470, 476, 506],
  [-441, -387, -333, -279, -225, -171, -117, -63, -9, 45, 98, 152, 206, 260, 314, 368], [-328, -273, -217, -161, -106, -50, 5, 61, 116, 172, 228, 283, 339, 394, 450, 506],
  [-328, -282, -235, -189, -142, -96, -50, -3, 43, 90, 136, 182, 229, 275, 322, 368], [-256, -212, -168, -123, -79, -35, 10, 54, 98, 143, 187, 232, 276, 320, 365, 409],
  [-308, -260, -212, -164, -117, -69, -21, 27, 75, 122, 170, 218, 266, 314, 361, 409], [-256, -161, -66, 29, 124, 219, 314, 409],
  [-256, -176, -96, -15, 65, 146, 226, 307], [-205, -132, -59, 14, 87, 160, 234, 307]].map(t => t.map(x => x / 512));
const KT5100 = [[-501, -497, -493, -488, -480, -471, -460, -446, -427, -405, -378, -344, -305, -259, -206, -148, -86, -21, 45, 110, 171, 227, 277, 320, 357, 388, 413, 434, 451, 464, 474, 498].map(x => x / 512)].concat(KT.slice(1));
const ENERGY = [0, 1, 2, 3, 4, 6, 8, 11, 16, 23, 33, 47, 63, 85, 114].map(e => e / 114);
const VOS_DECAY = Array.from({ length: 13 }, (_, k) => Math.pow(0.78, k));
const VOTRAX_GLOT = [1, 0.82, 0.6, 0.4, 0.25, 0.12, 0.02, -0.12, -0.24, -0.3, -0.26, -0.18, -0.1, -0.04, 0, 0];
const VODER_BANDS = [225, 450, 700, 1000, 1400, 2000, 2700, 3800, 5400, 7500];
const near = (tab, x) => { let b = 0, d = 1e9; for (let i = 0; i < tab.length; i++) { const e = Math.abs(tab[i] - x); if (e < d) { d = e; b = i; } } return b; };
const qlog = (x, lo, hi, n) => { const t = Math.round(Math.log(x / lo) / Math.log(hi / lo) * (n - 1)); return lo * Math.pow(hi / lo, Math.max(0, Math.min(n - 1, t)) / (n - 1)); };
// a two-pole resonator with unity gain at 0 Hz (Klatt's), and its inverse
function res() { return { a: 1, b: 0, c: 0, y1: 0, y2: 0 }; }
function rset(r, f, bw, sr) { const T = 1 / sr, e = Math.exp(-Math.PI * bw * T); r.c = -e * e; r.b = 2 * e * Math.cos(TAU * f * T); r.a = 1 - r.b - r.c; }
function rtick(r, x) { const y = r.a * x + r.b * r.y1 + r.c * r.y2; r.y2 = r.y1; r.y1 = y; return y; }
function atick(r, x) { const y = (x - r.b * r.x1 - r.c * r.x2) / r.a; r.x2 = r.x1; r.x1 = x; return y; }
// the spectrum the formants make, at frequency f (for the synths that build sound from it)
function envAt(c, f, nf) { let g = 1; for (let i = 0; i < nf; i++) { const F = c[F1 + i], B = c[B1 + i], F2 = F * F; g *= F2 / Math.sqrt((F2 - f * f) * (F2 - f * f) + (B * f) * (B * f) + 1e-9); } return g; }
const tilt = f => 1 / (1 + (f / 350) * (f / 350)) * (0.4 + f / 900);
// pole pairs to a polynomial, then down to reflection coefficients
function polesToK(poles, sr, p) {
  let a = [1];
  for (const [f, bw] of poles) {
    const r = Math.exp(-Math.PI * bw / sr), th = TAU * f / sr, q = [1, -2 * r * Math.cos(th), r * r], n = new Array(a.length + 2).fill(0);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < 3; j++) n[i + j] += a[i] * q[j];
    a = n;
  }
  const k = new Array(p).fill(0); let A = a.slice(0, p + 1); while (A.length < p + 1) A.push(0);
  for (let i = p; i >= 1; i--) {
    let ki = A[i]; if (!(Math.abs(ki) < 0.995)) ki = Math.sign(ki || 1) * 0.995; k[i - 1] = ki;
    const d = 1 - ki * ki, B = A.slice();
    for (let j = 1; j < i; j++) B[j] = (A[j] - ki * A[i - j]) / d;
    A = B;
  }
  return k;
}
function lpcPoles(v, c, sr, p, m) {
  const ny = sr * 0.46, poles = [], voiced = c[AV] >= 0.25;
  if (voiced || (c[AH] > 0.05 && c[AF] < 0.2)) {
    const wide = voiced ? 1 : 1.8;
    for (let i = 0; i < 5 && poles.length < p / 2; i++) { const f = c[F1 + i]; if (f < ny) poles.push([f, Math.max(40, c[B1 + i] * wide * (m.bw || 1))]); }
    if (c[NP] > 0.3 && poles.length < p / 2) poles.unshift([250, 120]);
  } else {
    if (c[AF] > 0.01) { poles.push([Math.min(ny * 0.95, c[FF]), Math.max(300, c[FB] * 0.7)]); if (c[FF2]) poles.push([Math.min(ny * 0.9, c[FF2]), 900]); }
    poles.push([1500, 2500], [3000, 2500]);
  }
  const spare = [[180, 900], [2500, 3000], [3500, 2000], [800, 3000], [3000, 3500], [1200, 3500]];
  for (let i = 0; poles.length < p / 2; i++) poles.push(spare[i % spare.length]);
  return poles.slice(0, p / 2);
}
function rnd(v) { v.seed = (v.seed * 1664525 + 1013904223) >>> 0; return v.seed / 2147483648 - 1; }
// ---------- a voice ----------
function newVoice(d) {
  const m = d.m, segs = d.segs, first = segs[0] ? segs[0].v.slice() : new Array(NV).fill(0);
  first[AV] = first[AH] = first[AF] = first[AB] = 0;
  const v = { id: d.id, m, segs, i: 0, st: 0, prev: first, cur: first.slice(), t0: d.time || 0, offAt: Infinity, rel: false, ending: false, done: false, age: 0,
    f0: d.f0, from: d.from || d.f0, glide: d.glide || 0, vib: d.vib || 0, fsc: d.fsc || 1, grit: d.grit ?? 0.3, breath: d.breath || 0, gain: d.gain ?? 1,
    seed: (Math.random() * 4294967295) >>> 0, acc: 0, y: 0, lp1: 0, lp2: 0, env: 0, ph: 0, per: 0, persamp: 1, gprev: 0, nprev: 0, f: d.f0,
    r: [res(), res(), res(), res(), res()], rn: res(), rz: { a: 1, b: 0, c: 0, x1: 0, x2: 0 }, rf: res(), rf2: res(), dc: 0, dcx: 0, dm: 0, bendP: 1, gprev2: 0, ph2: 0 };
  v.sr = m.sr * (m.r === "formant" || m.r === "tube" ? 1 - v.grit * 0.3 : 1);
  if (m.r === "lpc" || m.r === "tube") { v.p = m.chip === "sp0256" ? 12 : 10; v.k = new Array(v.p).fill(0); v.kt = v.k.slice(); v.x = new Array(v.p + 1).fill(0); v.u = new Array(v.p + 1).fill(0); v.E = 0; v.Et = 0; v.G = 1; v.fc = 0; v.ic = 0; v.voiced = false; v.sec = [];
    v.flen = m.chip === "sp0256" ? Math.round(v.sr * 0.0128) : Math.round(v.sr * 0.025); v.ilen = Math.max(1, Math.round(v.flen / 8)); }
  if (m.r === "bank") { v.bp = VODER_BANDS.map(fc => { const w = TAU * Math.min(fc, v.sr * 0.45) / v.sr, al = Math.sin(w) / (2 * 2.2), a0 = 1 + al; return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0, gv: 0, gu: 0 }; }); }
  v.snap = { F: [500, 1500, 2500], A: [1, 0.5, 0.25], B: [80, 90, 120] };
  return v;
}
function prep(v) {   // the targets of this moment, turned into the machine's own settings
  const c = v.cur, m = v.m, sr = v.sr, ny = sr * 0.47, fs = v.fsc;
  v.c = c.slice(); const q = v.c;
  for (let i = 0; i < 5; i++) q[F1 + i] = c[F1 + i] * fs;
  q[FF] = Math.min(c[FF] * Math.sqrt(fs), ny * 0.92); q[FF2] = c[FF2] ? Math.min(c[FF2] * Math.sqrt(fs), ny * 0.94) : 0;
  if (m.q) { q[F1] = qlog(q[F1], 180, 1100, 16); q[F1 + 1] = qlog(q[F1 + 1], 550, 2700, 16); q[F1 + 2] = qlog(q[F1 + 2], 1200, 3400, 16); }
  const br = v.breath;
  q[AH] = Math.min(1, c[AH] + br * 0.35 * c[AV]); if (br > 0.8) q[AV] = c[AV] * (1 - (br - 0.8) / 0.2);
  if (m.r === "formant" || m.r === "tube") {
    v.nf = 0;
    for (let i = 0; i < 5; i++) { if (q[F1 + i] < ny) { rset(v.r[i], q[F1 + i], q[B1 + i] * (m.bw || 1), sr); v.nf = i + 1; } else break; }
    if (m.f3only) v.nf = Math.min(v.nf, 3);
    if (q[NP] > 0.01) { rset(v.rn, 270 * fs, 100, sr); rset(v.rz, Math.min(q[NZ] * fs, ny), 120, sr); }
    if (q[AF] > 0.001) { rset(v.rf, q[FF], Math.max(200, q[FB]), sr); if (q[FF2]) rset(v.rf2, q[FF2], 900, sr); }
  } else if (m.r === "fof" || m.r === "sam" || m.r === "vosim") {
    if (!v.snap.s) snap(v);
    if (q[AF] > 0.001) { rset(v.rf, q[FF], Math.max(200, q[FB]), sr); if (q[FF2]) rset(v.rf2, q[FF2], 900, sr); }
  } else if (m.r === "bank") {
    const nf = 5, peak = Math.max(1e-6, ...v.bp.map((b, k) => envAt(q, VODER_BANDS[k], nf) * tilt(VODER_BANDS[k])));
    v.bp.forEach((b, k) => {
      const fc = VODER_BANDS[k], gv = q[AV] * envAt(q, fc, nf) * tilt(fc) / peak;
      let gu = q[AH] * envAt(q, fc, nf) * tilt(fc) / peak * 0.6 + q[AB] * 0.35;
      if (q[AF] > 0.001) { const d = (fc - q[FF]) / Math.max(300, q[FB]); gu += q[AF] * 1 / (1 + d * d); if (q[FF2]) { const d2 = (fc - q[FF2]) / 900; gu += q[AF] * 0.6 / (1 + d2 * d2); } }
      b.tv = gv; b.tu = Math.min(1.5, gu);
    });
  }
}
// ---------- the glottis: one pulse per period, in each machine's shape ----------
function glottal(v, wrap) {
  const m = v.m, p = v.ph;
  if (m.src === "votrax") return VOTRAX_GLOT[Math.min(15, Math.floor(p * 16))] * 0.9;
  if (m.src === "impulse") return wrap ? Math.sqrt(v.persamp) * 0.55 : 0;
  if (m.src === "chirp") return v.per < CHIRP.length ? CHIRP[v.per] * 1.6 : 0;
  const Tp = 0.4, Tn = m.src === "rosen2" ? 0.08 : 0.16;
  const flow = p < Tp ? 0.5 * (1 - Math.cos(Math.PI * p / Tp)) : p < Tp + Tn ? Math.cos(Math.PI * (p - Tp) / (2 * Tn)) : 0;
  const d = flow - v.gprev; v.gprev = flow;
  return d * v.persamp * 0.32;
}
function lpcFrame(v) {
  const m = v.m, q = v.c, sr = v.sr;
  v.voiced = q[AV] >= 0.25;
  const e = Math.sqrt(q[AV] * q[AV] + q[AH] * q[AH] * 0.5 + q[AF] * q[AF] * 0.6 + q[AB] * q[AB] * 0.4);
  let k = polesToK(lpcPoles(v, q, sr, v.p, m), sr, v.p);
  if (m.chip === "tms5220" || m.chip === "tms5100") {
    const T = m.chip === "tms5100" ? KT5100 : KT, idx = k.map((x, i) => near(T[i], x));
    let ei = near(ENERGY, Math.min(1, e));
    if (m.bend && v.grit > 0.45) {   // circuit bending: bits of the frame land in the wrong place
      const g = (v.grit - 0.45) / 0.55, r = () => (rnd(v) + 1) / 2;
      if (r() < g * 0.5) for (let i = 0; i < 10; i++) if (r() < g * 0.4) idx[i] = Math.max(0, Math.min(T[i].length - 1, idx[i] + Math.round(rnd(v) * 6 * g)));
      if (r() < g * 0.25) return;   // (a stuck frame)
      if (r() < g * 0.2) v.bendP = [0.5, 0.75, 1.5, 2][Math.floor(r() * 4)]; else if (r() < 0.3) v.bendP = 1;
      if (r() < g * 0.15) ei = Math.min(14, ei + 3);
    }
    v.kt = idx.map((j, i) => T[i][j]); v.Et = ENERGY[ei];
  } else if (m.chip === "sp0256") {
    v.kt = k.map(x => Math.round(x * 128) / 128); v.Et = Math.round(Math.min(1, e) * 31) / 31;
  } else { v.kt = k; v.Et = e; }
  let G = 1; for (const x of v.kt) G *= 1 - x * x; v.Gt = Math.sqrt(Math.max(1e-4, G));
  if (m.chip !== "tms5220" && m.chip !== "tms5100") { v.k = v.kt.slice(); v.E = v.Et; v.G = v.Gt; }
}
function lpcInterp(v) {   // the TMS chips move to each frame in eight steps
  for (let i = 0; i < v.p; i++) v.k[i] += (v.kt[i] - v.k[i]) * 0.35;
  v.E += (v.Et - v.E) * 0.35; v.G += ((v.Gt || 1) - v.G) * 0.35;
}
// ---------- one sample at the machine's own rate ----------
function tick(v) {
  const m = v.m, c = v.c, sr = v.sr;
  v.ph += v.f / sr; v.per++; let wrap = false;
  if (v.ph >= 1) { v.ph -= 1; wrap = true; v.per = 0; v.persamp = sr / v.f; if (m.r === "fof" || m.r === "sam" || m.r === "vosim") snap(v); }
  const n = rnd(v);
  if (m.r === "lpc" || m.r === "tube") {
    if (m.r === "lpc") {
      if (v.fc <= 0) { v.fc = v.flen; lpcFrame(v); }
      if (v.ic <= 0) { v.ic = v.ilen; if (m.chip === "tms5220" || m.chip === "tms5100") lpcInterp(v); }
      v.fc--; v.ic--;
    } else if (v.fc <= 0) { v.fc = 40; const kk = polesToK(lpcPoles(v, c, sr, 10, m), sr, 10); for (let i = 0; i < 10; i++) v.k[i] += (kk[i] - v.k[i]) * 0.5; let G = 1; for (const x of v.k) G *= 1 - x * x; v.G = Math.sqrt(Math.max(1e-4, G)); v.E = 1; } else v.fc--;
    let e;
    if (m.r === "tube") e = (c[AV] * glottal(v, wrap) + (c[AH] * 0.5 + c[AF] * 0.6 + c[AB] * 0.4) * n * 0.6) * 2.2;
    else e = (v.voiced ? glottal(v, wrap) : n * 0.6) * v.E;
    e *= v.G;
    const p = v.p, k = v.k, x = v.x, u = v.u;
    u[p] = e;
    for (let i = p - 1; i >= 0; i--) u[i] = u[i + 1] - k[i] * x[i];
    for (let i = p - 1; i >= 1; i--) x[i] = x[i - 1] + k[i - 1] * u[i - 1];
    x[0] = u[0];
    let y = u[0];
    if (m.r === "tube") { const r = y - v.gprev2; v.gprev2 = y; y = r * 1.5 + y * 0.15; for (let i = 0; i < p; i++) x[i] *= 0.9995; }
    return y;
  }
  if (m.r === "fof" || m.r === "sam" || m.r === "vosim") {
    const S = v.snap, t = v.per / sr; let y = 0;
    if (c[AV] > 0.01) {
      if (m.r === "fof") { S.at += (1 - S.at) * S.atk; for (let i = 0; i < 3; i++) { const s = S.s[i] * S.c0[i] + S.c[i] * S.s0[i], c = S.c[i] * S.c0[i] - S.s[i] * S.s0[i]; S.s[i] = s; S.c[i] = c; S.e[i] *= S.d[i]; y += S.A[i] * s * S.e[i]; } y *= 1.3 * S.at; }
      else if (m.r === "sam") { if (v.ph < 0.72) y = S.A[0] * Math.sin(TAU * S.F[0] * t) + S.A[1] * Math.sin(TAU * S.F[1] * t) + 0.45 * S.A[2] * (Math.sin(TAU * S.F[2] * t) >= 0 ? 1 : -1); y *= 0.8; }
      else {
        for (let i = 0; i < 3; i++) {
          const T = S.T[i], kk = (v.per / T) | 0;
          if (kk < S.N[i]) { const s = Math.sin(S.w[i] * (v.per - kk * T)); y += S.A[i] * VOS_DECAY[kk] * s * s * (i === 2 ? 0.4 : 1); }
        }
        const hp = y - v.dcx + 0.995 * v.dc; v.dcx = y; v.dc = hp; y = hp * 1.6;
      }
      y *= c[AV];
    }
    const nd = n - v.nprev; v.nprev = n;
    let p = 0; if (c[AF] > 0.001) { p = rtick(v.rf, nd) * c[AF]; if (c[FF2]) p += rtick(v.rf2, nd) * c[AF] * 0.6; }
    p += nd * (c[AB] * 0.45 + c[AH] * 0.25);
    return y + p * 0.8;
  }
  if (m.r === "bank") {
    v.ph2 = (v.ph2 || 0); const buzz = 2 * v.ph - 1;
    let y = 0;
    for (const b of v.bp) {
      b.gv += (b.tv - b.gv) * 0.0016; b.gu += (b.tu - b.gu) * 0.0016;   // (the operator's fingers take a moment)
      const x = b.gv * buzz * 0.9 + b.gu * n;
      const o = b.b0 * x + b.b2 * b.x2 - b.a1 * b.y1 - b.a2 * b.y2; b.x2 = b.x1; b.x1 = x; b.y2 = b.y1; b.y1 = o; y += o;
    }
    return y * 1.4;
  }
  // formant: a glottal source through formant filters, hiss through its own
  const g = glottal(v, wrap), asp = n * (c[AV] > 0.05 ? (v.ph < 0.5 ? 1 : 0.4) : 1);
  let x = c[AV] * g + c[AH] * asp * 0.45;
  if (c[NP] > 0.01) { const xn = atick(v.rz, rtick(v.rn, x)); x += (xn - x) * c[NP]; }
  for (let i = 0; i < v.nf; i++) x = rtick(v.r[i], x);
  const nd = n - v.nprev; v.nprev = n;
  let p = 0; if (c[AF] > 0.001) { p = rtick(v.rf, nd) * c[AF]; if (c[FF2]) p += rtick(v.rf2, nd) * c[AF] * 0.6; }
  p += nd * c[AB] * 0.45;
  let y = x * 1.1 + p * 0.55;
  if (m.post === "mozer") {   // half-period zeroing and 2-bit delta modulation, as on Forrest Mozer's chip
    if (c[AV] > 0.3 && v.ph > 0.5) y = 0;
    const st = 0.045, dd = y - v.dm, s = Math.abs(dd) > 2 * st ? 3 : 1; v.dm += Math.sign(dd) * s * st; y = v.dm;
  }
  return y;
}
function snap(v) {   // the synced-oscillator machines take the shape of the voice at the start of each period
  const q = v.c, F = [], A = [], B = [];
  for (let i = 0; i < 3; i++) { const f = Math.min(q[F1 + i], v.sr * 0.45); F.push(f); A.push(envAt(q, f, 4) * tilt(f)); B.push(Math.max(50, q[B1 + i])); }
  const mx = Math.max(1e-6, A[0], A[1], A[2]), sr = v.sr;
  v.snap = { F, A: A.map(a => a / mx), B, s: [0, 0, 0], c: [1, 1, 1], s0: F.map(f => Math.sin(TAU * f / sr)), c0: F.map(f => Math.cos(TAU * f / sr)), e: [1, 1, 1], d: B.map(b => Math.exp(-Math.PI * b * 1.6 / sr)), at: 0, atk: 1 - Math.exp(-2500 / sr) };
  const S = v.snap; S.T = F.map(f => sr / f); S.N = S.T.map(T => Math.max(1, Math.min(12, Math.floor(0.55 * v.persamp / T)))); S.w = S.T.map(T => Math.PI / T);
}
function quant(y, bits) { if (!bits) return y; const L = Math.pow(2, bits - 1); return Math.max(-1, Math.min(1, Math.round(y * L) / L)); }
// ---------- the processor ----------
class NbSpeech extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: "detune", defaultValue: 0, automationRate: "k-rate" }]; }
  constructor() {
    super(); this.v = [];
    this.port.onmessage = e => {
      const d = e.data;
      if (d.t === "on") { if (this.v.length > 24) this.v.shift(); this.v.push(newVoice(d)); }
      else if (d.t === "off") { for (const v of this.v) if (v.id === d.id) v.offAt = d.time; }
      else if (d.t === "kill") this.v = [];
      else if (d.t === "set") for (const v of this.v) { if (d.vib != null) v.vib = d.vib; if (d.breath != null) v.breath = d.breath; }
    };
  }
  process(ins, outs, params) {
    const out = outs[0], L = out[0], R = out[1], n = L.length, now = currentTime, det = params.detune[0] || 0, dt = n / SR;
    L.fill(0);
    for (const v of this.v) {
      if (v.t0 > now + dt) continue;
      const s0 = Math.max(0, Math.min(n, Math.round((v.t0 - now) * SR)));
      if (!v.rel && now + dt > v.offAt) v.rel = true;
      // where it is in its targets
      if (v.started) {
        v.st += dt; v.age += dt;
        for (;;) {
          const s = v.segs[v.i]; if (!s) { v.ending = true; break; }
          if (s.hold && !v.rel && v.st >= s.d) { v.st = s.d; break; }
          if (v.st < s.d) break;
          v.st -= s.d; v.prev = v.cur.slice(); v.i++;
        }
      } else v.started = true;
      const s = v.segs[Math.min(v.i, v.segs.length - 1)];
      if (s) {
        let x = s.tr > 0 ? Math.min(1, v.st / s.tr) : 1; x = x * x * (3 - 2 * x);
        if (v.m.steps) x = Math.floor(x * v.m.steps + 0.5) / v.m.steps;
        for (let k = 0; k < NV; k++) v.cur[k] = v.prev[k] + (s.v[k] - v.prev[k]) * x;
      }
      prep(v);
      // the pitch: the note, a glide from the last one, vibrato, the wheel
      const gl = v.glide > 0 && v.age < v.glide ? v.from * Math.pow(v.f0 / v.from, v.age / v.glide) : v.f0;
      const vibD = v.vib * 55 * Math.min(1, Math.max(0, (v.age - 0.18) / 0.35)), cents = det + vibD * Math.sin(TAU * 5.6 * v.age) + (v.m.jit ? (Math.random() - 0.5) * v.m.jit : 0);
      let f = gl * (v.cur[PM] || 1) * Math.pow(2, cents / 1200) * v.bendP;
      if ((v.m.r === "lpc" || v.m.r === "sam") && v.grit > 0.7) f = v.sr / Math.round(v.sr / f);   // (whole-sample periods, as the chips had)
      v.f = Math.max(30, Math.min(v.sr * 0.25, f));
      const inc = v.sr / SR, fc = Math.min(SR * 0.45, v.sr * 0.42 * (1 + v.grit * 1.4) * (v.m.lp || 1)), a = 1 - Math.exp(-TAU * fc / SR);
      const bits = v.m.bits ? Math.max(3, v.m.bits - Math.round(v.grit * v.m.bits * 0.35)) : (v.grit > 0.55 ? Math.round(16 - (v.grit - 0.55) * 20) : 0), lvl = v.gain * (v.m.lvl || 1);
      for (let i = s0; i < n; i++) {
        v.acc += inc;
        while (v.acc >= 1) { v.acc -= 1; v.y = quant(tick(v), bits); }
        v.lp1 += (v.y - v.lp1) * a; v.lp2 += (v.lp1 - v.lp2) * a;
        v.env += ((v.ending ? 0 : 1) - v.env) * (v.ending ? 0.003 : 0.05);
        L[i] += v.lp2 * v.env * lvl;
      }
      if (v.ending && v.env < 1e-4) v.done = true;
      if (!(Math.abs(v.lp2) < 50)) v.done = true;   // (a filter that ran away)
    }
    for (let i = 0; i < n; i++) { const x = L[i]; L[i] = x > 1.2 ? 1.2 : x < -1.2 ? -1.2 : x; }
    if (R) R.set(L);
    if (this.v.some(v => v.done)) this.v = this.v.filter(v => !v.done);
    return true;
  }
}
registerProcessor("nb-speech", NbSpeech);
`;
  // ---------- Speech: words to sounds ----------
  // English text becomes phonemes (CMU Pronouncing Dictionary, 125,000 words, unpacked the first time Speech plays;
  // spelling rules for anything it doesn't know), then syllables: each note sings the next one.
  const SPD = { map: null, loading: null };
  const SP_VOW = ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"];
  const SP_CON = ["B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH"];
  const SP_SYMS = SP_VOW.flatMap(v => [v + "0", v + "1", v + "2"]).concat(SP_CON);
  const spIsV = p => /^[A-Z]{2}\d$/.test(p) || SP_VOW.includes(p);
  function spDictParse(txt) {
    const alpha = SP_ALPHA, dec = {}; for (let i = 0; i < SP_SYMS.length; i++) dec[alpha[i]] = SP_SYMS[i];
    const map = new Map(); let prev = "";
    for (const line of txt.split("\n")) {
      if (!line) continue;
      const n = line.charCodeAt(0) - 48, bar = line.indexOf("|"), w = prev.slice(0, n) + line.slice(1, bar), code = line.slice(bar + 1), ph = [];
      for (const c of code) ph.push(dec[c]);
      map.set(w, ph); prev = w;
    }
    return map;
  }
  function spDictLoad() {
    if (SPD.map || SPD.loading) return SPD.loading || Promise.resolve();
    SPD.loading = (async () => {
      try {
        const b64 = SP_DICT_B64 || await (await fetch(window.NB_SND + "sp-dict.b64")).text();   // (162: on the site the dictionary is a file, fetched the first time speech needs it)
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const ds = new DecompressionStream("gzip"), txt = await new Response(new Blob([bin]).stream().pipeThrough(ds)).text();
        SPD.map = spDictParse(txt);
      } catch (e) { SPD.map = new Map(); }   // (no gzip here: the spelling rules do it all)
    })();
    return SPD.loading;
  }
  // spelling rules for words the dictionary doesn't have (after the Naval Research Lab rules of 1976, simplified)
  const SP_RULES = {};
  `a: [a] =AH|[are] =AA R| [ar]o=AX R|[ar]#=EH R|^[as]#=EY S|[a]wa=AX|[aw]=AO| :[any]=EH N IY|[a]^+#=EY|#:[ally]=AX L IY| [al]#=AX L|[again]=AX G EH N|#:[ag]e=IH JH|[a]^+:#=AE| :[a]^+ =EY|[a]^%=EY| [arr]=AX R|[arr]=AE R| :[ar] =AA R|[ar] =ER|[ar]=AA R|[air]=EH R|[ai]=EY|[ay]=EY|[au]=AO|#:[al] =AX L|#:[als] =AX L Z|[alk]=AO K|[al]^=AO L| :[able]=EY B AX L|[able]=AX B AX L|[ang]+=EY N JH|[a]=AE
b: [be]^#=B IH|[being]=B IY IH NG| [both] =B OW TH| [bus]#=B IH Z|[buil]=B IH L|[b]=B
c: [ch]^=K|^e[ch]=K|[ch]=CH| s[ci]#=S AY|[ci]a=SH|[ci]o=SH|[ci]en=SH|[c]+=S|[ck]=K|[com]%=K AH M|[c]=K
d: #:[ded] =D IH D|.e[d] =D|#^:e[d] =T| [de]^#=D IH| [do] =D UW| [does]=D AH Z| [doing]=D UW IH NG| [dow]=D AW|[du]a=JH UW|[d]=D
e: #:[e] =|'^:[e] =| :[e] =IY|#[ed] =D|#:[e]d =|[ev]er=EH V|[e]^%=IY|[eri]#=IY R IY|[eri]=EH R IH|#:[er]#=ER|[er]#=EH R|[er]=ER| [even]=IY V EH N|#:[e]w=|@[ew]=UW|[ew]=Y UW|[e]o=IY|#:&[es] =IH Z|#:[e]s =|#:[ely] =L IY|#:[ement]=M EH N T|[eful]=F UH L|[ee]=IY|[earn]=ER N| [ear]^=ER|[ead]=EH D|#:[ea] =IY AX|[ea]su=EH|[ea]=IY|[eigh]=EY|[ei]=IY| [eye]=AY|[ey]=IY|[eu]=Y UW|[e]=EH
f: [ful]=F UH L|[f]=F
g: [giv]=G IH V| [g]i^=G|[ge]t=G EH|su[gges]=G JH EH S|[gg]=G| b#[g]=G|[g]+=JH|[great]=G R EY T|#[gh]=|[g]=G
h: [hav]=HH AE V| [here]=HH IY R| [hour]=AW ER|[how]=HH AW|[h]#=HH|[h]=
i: [in]=IH N| [i] =AY|[in]d=AY N|[ier]=IY ER|#:r[ied] =IY D|[ied] =AY D|[ien]=IY EH N|[ie]t=AY EH| :[i]%=AY|[i]%=IY|[ie]=IY|[i]^+:#=IH|[ir]#=AY R|[iz]%=AY Z|[is]%=AY Z|[i]d%=AY|+^[i]^+=IH|[i]t%=AY|#^:[i]^+=IH|[i]^+=AY|[ir]=ER|[igh]=AY|[ild]=AY L D|[ign] =AY N|[ign]^=AY N|[ign]%=AY N|[ique]=IY K|[i]=IH
j: [j]=JH
k: [k]n=|[k]=K
l: [lo]c#=L OW|l[l]=|#^:[l]%=AX L|[lead]=L IY D|[l]=L
m: [mov]=M UW V|[m]=M
n: e[ng]+=N JH|[ng]r=NG G|[ng]#=NG G|[ngl]%=NG G AX L|[ng]=NG|[nk]=NG K| [now] =N AW|[n]=N
o: [of] =AX V|[orough]=ER OW|#:[or] =ER|#:[ors] =ER Z|[or]=AO R| [one]=W AH N|[ow]=OW| [over]=OW V ER|[ov]=AH V|[o]^%=OW|[o]^en=OW|[o]^i#=OW|[ol]d=OW L|[ought]=AO T|[ough]=AH F| [ou]=AW|h[ou]s#=AW|[ous]=AX S|[our]=AO R|[ould]=UH D|^[ou]^l=AH|[oup]=UW P|[ou]=AW|[oy]=OY|[oing]=OW IH NG|[oi]=OY|[oor]=AO R|[ook]=UH K|[ood]=UH D|[oo]=UW|[o]e=OW|[o] =OW|[oa]=OW| [only]=OW N L IY| [once]=W AH N S|[on't]=OW N T|c[o]n=AA|[o]ng=AO| :^[o]n=AH|i[on]=AX N|#:[on] =AX N|#^[on]=AX N|[o]st =OW|[of]^=AO F|[other]=AH DH ER|[oss] =AO S|#:^[om]=AH M|[o]=AA
p: [ph]=F|[peop]=P IY P|[pow]=P AW|[put] =P UH T|[p]=P
q: [quar]=K W AO R|[qu]=K W|[q]=K
r: [re]^#=R IY|[r]=R
s: [sh]=SH|#[sion]=ZH AX N|[some]=S AH M|#[sur]#=ZH ER|[sur]#=SH ER|#[su]#=ZH UW|#[ssu]#=SH UW|#[sed] =Z D|#[s]#=Z|[said]=S EH D|^[sion]=SH AX N|[s]s=|.[s] =Z|#:.e[s] =Z|#^:##[s] =Z|#^:#[s] =S|u[s] =S| :#[s] =Z| [sch]=S K|[s]c+=|#[sm]=Z M|#[sn]'=Z AX N|[s]=S
t: [the] =DH AX| [to] =T UW|[that] =DH AE T| [this] =DH IH S| [they]=DH EY| [there]=DH EH R|[ther]=DH ER|[their]=DH EH R| [than] =DH AE N| [them] =DH EH M|[these] =DH IY Z| [then]=DH EH N|[through]=TH R UW|[those]=DH OW Z|[though] =DH OW| [thus]=DH AH S|[th]=TH|#:[ted] =T IH D|s[ti]#n=CH|[ti]o=SH|[ti]a=SH|[tien]=SH AX N|[tur]#=CH ER|[tu]a=CH UW| [two]=T UW|[t]=T
u: [un]i=Y UW N| [un]=AH N| [upon]=AX P AO N|@[ur]#=UH R|[ur]#=Y UH R|[ur]^=ER|[u]^ =AH|[u]^^=AH|[uy]=AY| g[u]#=|g[u]%=|g[u]#=W|#n[u]=Y UW|@[u]=UW|[u]=Y UW
v: [view]=V Y UW|[v]=V
w: [were]=W ER|[wa]s=W AA|[wa]t=W AA|[where]=W EH R|[what]=W AA T|[whol]=HH OW L|[who]=HH UW|[wh]=W|[war]=W AO R|[wor]^=W ER|[wr]=R|[w]=W
x: [x]=K S
y: [young]=Y AH NG| [you]=Y UW| [yes]=Y EH S| [y]=Y|#^:[y] =IY|#^:[y]i=IY| :[y] =AY| :[y]#=AY| :[y]^+:#=IH| :[y]^#=AY|[y]=IH
z: [z]=Z
': [']=`.split("\n").forEach(line => {
    const k = line[0]; SP_RULES[k] = line.slice(2).split("|").map(r => {
      const a = r.indexOf("["), b = r.indexOf("]"), eq = r.indexOf("=", b);
      return { L: r.slice(0, a), M: r.slice(a + 1, b), R: r.slice(b + 1, eq), P: r.slice(eq + 1).trim() ? r.slice(eq + 1).trim().split(" ") : [] };
    });
  });
  const spVL = c => "aeiouy".includes(c), spCL = c => c >= "a" && c <= "z" && !spVL(c);
  // context classes: # vowels, : any consonants, ^ one consonant, . voiced consonant, + e/i/y, % a suffix, & sibilant, @ t s r d l z n j th ch sh
  function spCtxR(pat, s, i) {
    for (const c of pat) {
      if (c === " ") { if (i < s.length && s[i] !== " ") return false; i++; continue; }
      if (c === "#") { if (!spVL(s[i] || "")) return false; while (spVL(s[i] || "")) i++; continue; }
      if (c === ":") { while (spCL(s[i] || "")) i++; continue; }
      if (c === "^") { if (!spCL(s[i] || "")) return false; i++; continue; }
      if (c === ".") { if (!"bdvgjlmnrwz".includes(s[i] || "-")) return false; i++; continue; }
      if (c === "+") { if (!"eiy".includes(s[i] || "-")) return false; i++; continue; }
      if (c === "%") { const t = s.slice(i); const m = ["ing", "ely", "er", "es", "ed", "e"].find(x => t.startsWith(x) && (t.length === x.length || t[x.length] === " ")); if (!m) return false; i += m.length; continue; }
      if (c === "&") { if ("sh,ch".split(",").some(x => s.startsWith(x, i))) { i += 2; continue; } if (!"scgzxj".includes(s[i] || "-")) return false; i++; continue; }
      if (c === "@") { if ("th,ch,sh".split(",").some(x => s.startsWith(x, i))) { i += 2; continue; } if (!"tsrdlznj".includes(s[i] || "-")) return false; i++; continue; }
      if (s[i] !== c) return false; i++;
    }
    return true;
  }
  function spCtxL(pat, s, i) {   // (i: the last letter before the match, walking left)
    for (let k = pat.length - 1; k >= 0; k--) {
      const c = pat[k];
      if (c === " ") { if (i >= 0 && s[i] !== " ") return false; i--; continue; }
      if (c === "#") { if (!spVL(s[i] || "")) return false; while (i >= 0 && spVL(s[i])) i--; continue; }
      if (c === ":") { while (i >= 0 && spCL(s[i])) i--; continue; }
      if (c === "^") { if (!spCL(s[i] || "")) return false; i--; continue; }
      if (c === ".") { if (!"bdvgjlmnrwz".includes(s[i] || "-")) return false; i--; continue; }
      if (c === "+") { if (!"eiy".includes(s[i] || "-")) return false; i--; continue; }
      if (c === "&") { if (i > 0 && ["sh", "ch"].includes(s.slice(i - 1, i + 1))) { i -= 2; continue; } if (!"scgzxj".includes(s[i] || "-")) return false; i--; continue; }
      if (c === "@") { if (i > 0 && ["th", "ch", "sh"].includes(s.slice(i - 1, i + 1))) { i -= 2; continue; } if (!"tsrdlznj".includes(s[i] || "-")) return false; i--; continue; }
      if (s[i] !== c) return false; i--;
    }
    return true;
  }
  function spRules(word) {
    const s = " " + word + " ", out = [];
    for (let i = 1; i < s.length - 1;) {
      const rs = SP_RULES[s[i]]; if (!rs) { i++; continue; }
      let hit = null;
      for (const r of rs) if (s.startsWith(r.M, i) && spCtxL(r.L, s, i - 1) && spCtxR(r.R, s, i + r.M.length)) { hit = r; break; }
      if (!hit) { i++; continue; }
      out.push(...hit.P); i += hit.M.length;
    }
    // stress: the first full vowel; a bare schwa stays unstressed
    let first = true;
    return out.map(p => { if (p === "AX") return "AH0"; if (SP_VOW.includes(p)) { const r = p + (first ? "1" : "0"); first = false; return r; } return p; });
  }
  // a word, as phonemes: the dictionary, then the word with an ending taken off, then two words joined, then the rules
  const SP_SUF = [["'s", ["Z"]], ["s", ["Z"]], ["es", ["IH0", "Z"]], ["ed", ["D"]], ["ing", ["IH0", "NG"]], ["er", ["ER0"]], ["ers", ["ER0", "Z"]], ["est", ["AH0", "S", "T"]], ["ly", ["L", "IY0"]], ["ness", ["N", "AH0", "S"]], ["ful", ["F", "AH0", "L"]], ["less", ["L", "AH0", "S"]], ["y", ["IY0"]], ["in'", ["IH0", "N"]]];
  const spVoiceless = p => ["P", "T", "K", "F", "TH"].includes(p), spSib = p => ["S", "Z", "SH", "ZH", "CH", "JH"].includes(p);
  function spWord(w) {
    w = w.toLowerCase().replace(/[^a-z']/g, "").replace(/^'+|'+$/g, "");
    if (!w) return [];
    const D = SPD.map;
    if (D && D.has(w)) return D.get(w);
    if (D) {
      for (const [suf, add] of SP_SUF) {
        if (!w.endsWith(suf) || w.length - suf.length < 2) continue;
        const st = w.slice(0, -suf.length), cands = [st, st + "e"]; if (st.length > 2 && st[st.length - 1] === st[st.length - 2]) cands.push(st.slice(0, -1)); if (st.endsWith("i")) cands.push(st.slice(0, -1) + "y");
        for (const c of cands) if (D.has(c)) {
          const b = D.get(c), last = b[b.length - 1]; let a = add;
          if (suf === "s" || suf === "'s") a = spSib(last) ? ["IH0", "Z"] : spVoiceless(last) ? ["S"] : ["Z"];
          if (suf === "ed") a = (last === "T" || last === "D") ? ["IH0", "D"] : spVoiceless(last) || ["S", "SH", "CH"].includes(last) ? ["T"] : ["D"];
          return b.concat(a);
        }
      }
      for (let k = w.length - 3; k >= 3; k--) { const a = w.slice(0, k), b = w.slice(k); if (D.has(a) && D.has(b)) return D.get(a).concat(D.get(b).map(p => p.replace(/1$/, "2"))); }
    }
    return spRules(w);
  }
  // numbers, said the way they're written in lyrics
  const SP_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
  const SP_TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
  function spNum(n) {
    n = Math.floor(n); if (n < 20) return SP_ONES[n];
    if (n < 100) return SP_TENS[Math.floor(n / 10)] + (n % 10 ? " " + SP_ONES[n % 10] : "");
    if (n < 1000) return SP_ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + spNum(n % 100) : "");
    if (n >= 1100 && n < 2000 && n % 100 !== 0 || (n >= 2010 && n < 2100)) return spNum(Math.floor(n / 100)) + " " + (n % 100 < 10 ? "oh " + SP_ONES[n % 100] : spNum(n % 100));   // (years: nineteen eighty four)
    if (n < 1e6) return spNum(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + spNum(n % 1000) : "");
    return String(n).split("").map(d => SP_ONES[+d]).join(" ");
  }
  // syllables: each vowel with the consonants before it that can start an English syllable
  const SP_ONSETS = new Set(("P R,P L,B R,B L,T R,D R,K R,K L,G R,G L,F R,F L,TH R,SH R,S P,S T,S K,S M,S N,S L,S W,T W,D W,K W,G W,TH W,P Y,B Y,F Y,M Y,K Y,V Y,HH Y,S F,"
    + "S P R,S P L,S T R,S K R,S K W,S K Y,S P Y").split(",").map(x => x.trim()));
  const spOnsetOK = c => c.length === 0 || (c.length === 1 ? c[0] !== "NG" : SP_ONSETS.has(c.join(" ")));
  function spSyllables(ph) {
    const vi = []; ph.forEach((p, i) => { if (spIsV(p)) vi.push(i); });
    if (!vi.length) return ph.length ? [{ on: ph.slice(), nuc: null, coda: [], st: 0 }] : [];
    const out = vi.map(i => ({ on: [], nuc: ph[i], coda: [], st: +(ph[i].slice(-1)) || 0 }));
    out[0].on = ph.slice(0, vi[0]);
    for (let k = 0; k < vi.length - 1; k++) {
      const cl = ph.slice(vi[k] + 1, vi[k + 1]);
      let split = cl.length;   // as many as can start the next syllable
      for (let j = 0; j <= cl.length; j++) if (spOnsetOK(cl.slice(j))) { split = j; break; }
      out[k].coda = cl.slice(0, split); out[k + 1].on = cl.slice(split);
    }
    out[out.length - 1].coda = ph.slice(vi[vi.length - 1] + 1);
    return out;
  }
  // the written word cut where its syllables start: the letters lined up with the phonemes (for the lyric chips)
  const SP_SPELL = { AA: "a o ah aa au al", AE: "a ai", AH: "u o a e ou oo i", AO: "o a au aw ou augh ough al", AW: "ou ow ough", AY: "i y ie igh ei ai uy eye", EH: "e ea a ai ie", ER: "er ir ur or ear ar our re yr", EY: "a ai ay ei ey eigh ea",
    IH: "i y e ui ie", IY: "e ee ea y i ie ei ey eo", OW: "o oa ow oe ou ough eau", OY: "oi oy", UH: "oo u ou o", UW: "oo u ue ew o ou ui wo",
    B: "b bb", CH: "ch tch t", D: "d dd ed", DH: "th", F: "f ff ph gh", G: "g gg gu gh", HH: "h wh", JH: "j g dg dge ge", K: "k c ck ch q cc x", L: "l ll le", M: "m mm mb", N: "n nn kn gn", NG: "ng n",
    P: "p pp", R: "r rr wr", S: "s ss c sc ce", SH: "sh ti ci ch s ss", T: "t tt ed", TH: "th", V: "v f", W: "w wh u o", Y: "y i u", Z: "z s zz x es", ZH: "s g si" };
  const SP_SP = {}; for (const k in SP_SPELL) SP_SP[k] = SP_SPELL[k].split(" ");
  function spAlign(word, ph) {   // where each phoneme starts in the word
    const w = word.toLowerCase(), L = w.length, P = ph.length, NEG = -1e9;
    const S = Array.from({ length: L + 1 }, () => new Array(P + 1).fill(NEG)), B = Array.from({ length: L + 1 }, () => new Array(P + 1).fill(null));
    S[0][0] = 0;
    for (let i = 0; i <= L; i++) for (let j = 0; j <= P; j++) {
      const v = S[i][j]; if (v === NEG) continue;
      if (i < L && v - 1.2 > S[i + 1][j]) { S[i + 1][j] = v - 1.2; B[i + 1][j] = [i, j]; }   // a silent letter
      if (j < P) {
        const base = ph[j].replace(/\d/, ""), sp = SP_SP[base] || [], isV = SP_VOW.includes(base);
        for (let n = 0; n <= 4 && i + n <= L; n++) {
          const seg = w.slice(i, i + n); let sc;
          if (n === 0) sc = -2.2; else if (sp.includes(seg)) sc = 2 + n * 0.5; else if (n === 1) sc = (spVL(seg) === isV) ? -0.6 : -2.5; else continue;
          if (v + sc > S[i + n][j + 1]) { S[i + n][j + 1] = v + sc; B[i + n][j + 1] = [i, j]; }
        }
      }
    }
    const start = new Array(P).fill(0); let i = L, j = P;
    while (i > 0 || j > 0) { const b = B[i][j]; if (!b) break; if (b[1] !== j) start[b[1]] = b[0]; i = b[0]; j = b[1]; }
    return start;
  }
  function spCutAligned(word, ss) {
    const ph = ss.flatMap(s => [...s.on, s.nuc, ...s.coda].filter(Boolean)), st = spAlign(word, ph), out = [];
    let k = 0, prev = 0;
    const lw = word.toLowerCase();
    ss.forEach((s, n) => {
      if (n > 0) {
        let at = Math.max(prev + 1, Math.min(word.length - 1, st[k]));
        if (at > prev + 1 && lw[at] === lw[at + 1] && !spVL(lw[at])) at++;   // (a double letter splits: hel-lo, ber-ry)
        out.push(word.slice(prev, at)); prev = at;
      }
      k += s.on.length + (s.nuc ? 1 : 0) + s.coda.length;
    });
    out.push(word.slice(prev));
    return out.length === ss.length && out.every(Boolean) ? out : null;
  }
  // (the fallback: letters cut between the vowel groups)
  function spCut(word, n) {
    if (n <= 1) return [word];
    const s = word, low = s.toLowerCase(), groups = [];
    for (let i = 0; i < s.length;) {
      if (spVL(low[i]) && !(low[i] === "y" && i === 0) && !(low[i] === "u" && low[i - 1] === "q")) { const a = i; while (i < s.length && spVL(low[i])) i++; groups.push([a, i]); } else i++;
    }
    if (groups.length > n && /e$/.test(low) && groups[groups.length - 1][0] === s.length - 1) groups.pop();
    if (groups.length > n && /e[sd]$/.test(low)) groups.pop();
    while (groups.length > n) { const g = groups.pop(); groups[groups.length - 1][1] = g[1]; }
    while (groups.length < n) {   // a vowel pair that is two syllables (pi-a-no)
      let best = -1, bl = 1; groups.forEach((g, k) => { if (g[1] - g[0] > bl) { bl = g[1] - g[0]; best = k; } });
      if (best < 0) break; const g = groups[best]; groups.splice(best, 1, [g[0], g[0] + 1], [g[0] + 1, g[1]]);
    }
    if (groups.length !== n) { const L = Math.ceil(s.length / n), out = []; for (let i = 0; i < s.length; i += L) out.push(s.slice(i, i + L)); while (out.length < n) out.push(""); return out.slice(0, n); }
    const cuts = [];
    for (let k = 0; k < n - 1; k++) {
      const a = groups[k][1], b = groups[k + 1][0], cl = low.slice(a, b);
      let c = a;
      if (cl.length === 1) c = a;   // V-CV
      else if (cl.length >= 2) { const pair = low.slice(b - 2, b); c = ["th", "sh", "ch", "ph", "wh", "gh", "ck", "qu"].includes(pair) || ["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "str"].includes(pair) ? b - 2 : a + 1; if (low.slice(a, a + 2) === "ck") c = a + 2; }
      cuts.push(Math.max(c, cuts.length ? cuts[cuts.length - 1] + 1 : 1));
    }
    const out = []; let p = 0; cuts.forEach(c => { out.push(s.slice(p, c)); p = c; }); out.push(s.slice(p));
    return out;
  }
  // the lyrics, as the notes will sing them: syllables, the pauses after punctuation, "-" to hold a vowel over another note,
  // [HH AH0 L OW1] for exact phonemes, a line break to start a new line
  function spParse(text) {
    const syl = [], words = []; let line = 0;
    const src = String(text || "").replace(/\d+/g, m => " " + spNum(+m) + " "), toks = [];
    for (const m of src.matchAll(/\[[^\]]*\]|\n|[A-Za-z'’]+(?:-[A-Za-z'’]+)*-?|[-~](?=\s|$)|[,.;:!?]+/g)) {
      if ((m[0] === "-" || m[0] === "~") && m.index > 0 && !/\s/.test(src[m.index - 1])) continue;   // (a dash on its own holds the vowel)
      toks.push(m[0]);
    }
    for (const t of toks) {
      if (t === "\n") { line++; if (syl.length) syl[syl.length - 1].pause = Math.max(syl[syl.length - 1].pause, 2); continue; }
      if (/^[,.;:!?]+$/.test(t)) { if (syl.length) syl[syl.length - 1].pause = Math.max(syl[syl.length - 1].pause, /[.!?]/.test(t) ? 2 : 1); if (/\?/.test(t) && syl.length) syl[syl.length - 1].q = true; continue; }
      if (t === "-" || t === "~") {   // (the word's last consonants wait for the last held note)
        const pv = syl[syl.length - 1]; if (!pv || !pv.nuc) continue;
        syl.push({ t: "–", on: [], nuc: pv.nuc, coda: pv.coda, st: pv.st, w: pv.w, first: false, end: pv.end, pause: pv.pause, q: pv.q, line, hold: true });
        pv.coda = []; pv.end = false; pv.pause = 0; pv.q = false; continue;
      }
      let ph, parts;
      if (t[0] === "[") {
        ph = t.slice(1, -1).trim().toUpperCase().split(/\s+/).filter(p => SP_SYMS.includes(p) || SP_VOW.includes(p)).map(p => SP_VOW.includes(p) ? p + "1" : p);
        parts = null;
      } else {
        const clean = t.replace(/’/g, "'"), hy = clean.replace(/-$/, "").split("-");
        ph = hy.flatMap(h => spWord(h)); parts = hy;
      }
      const ss = spSyllables(ph); if (!ss.length) continue;
      const wi = words.length; words.push(t);
      let labels;
      if (parts && parts.length === ss.length) labels = parts;
      else if (parts) labels = spCutAligned(parts.join(""), ss) || spCut(parts.join(""), ss.length);
      else labels = ss.map(s => [...s.on, s.nuc || ""].map(p => p.replace(/\d/, "")).join("·").toLowerCase());
      ss.forEach((s, k) => syl.push(Object.assign(s, { t: labels[k] || "", w: wi, first: k === 0, end: k === ss.length - 1, pause: 0, line })));
    }
    return { syl, words };
  }
  // ---------- Speech: phonemes to sound targets ----------
  // Each phoneme is a target the voice moves to: five formants and their widths, voicing, breath, hiss (with where the
  // hiss sits), nasality. A syllable is a list of targets with times; the vowel holds while the key is down.
  const SPX = { F1: 0, F2: 1, F3: 2, F4: 3, F5: 4, B1: 5, B2: 6, B3: 7, B4: 8, B5: 9, AV: 10, AH: 11, AF: 12, FF: 13, FB: 14, FF2: 15, AB: 16, NZ: 17, NP: 18, PM: 19, N: 20 };
  const spT = (f1, f2, f3, b1, b2, b3, o) => { const v = new Array(SPX.N).fill(0); v[0] = f1; v[1] = f2; v[2] = f3; v[3] = 3300; v[4] = 3750; v[5] = b1; v[6] = b2; v[7] = b3; v[8] = 250; v[9] = 200; v[SPX.AV] = 1; v[SPX.PM] = 1; if (o) for (const k in o) v[SPX[k]] = o[k]; return v; };
  // vowels (a diphthong moves to its second target), after Klatt (1980)
  const SP_VT = {
    AA: [spT(700, 1220, 2600, 130, 70, 160), null, 0.24], AE: [spT(620, 1660, 2430, 70, 130, 300), null, 0.23], AH: [spT(620, 1220, 2550, 80, 60, 140), null, 0.14],
    AO: [spT(600, 990, 2570, 90, 100, 80), null, 0.24], EH: [spT(530, 1680, 2500, 60, 90, 200), null, 0.15], ER: [spT(470, 1270, 1540, 100, 60, 110), null, 0.18],
    IH: [spT(400, 1800, 2570, 50, 100, 140), null, 0.135], IY: [spT(310, 2200, 2960, 45, 200, 400), null, 0.23], UH: [spT(450, 1100, 2350, 80, 100, 80), null, 0.16],
    UW: [spT(350, 1250, 2200, 65, 110, 140), spT(320, 900, 2200, 65, 110, 140), 0.21], EY: [spT(480, 1720, 2520, 70, 100, 200), spT(330, 2200, 2600, 55, 150, 300), 0.23],
    AY: [spT(660, 1200, 2550, 100, 70, 200), spT(400, 1880, 2500, 70, 100, 200), 0.25], OW: [spT(540, 1100, 2300, 80, 70, 70), spT(450, 900, 2300, 80, 70, 70), 0.22],
    AW: [spT(640, 1230, 2550, 80, 70, 140), spT(420, 940, 2350, 80, 70, 80), 0.26], OY: [spT(550, 960, 2400, 80, 50, 130), spT(360, 1820, 2450, 60, 50, 160), 0.28],
  };
  const SP_SCHWA = spT(500, 1400, 2400, 100, 80, 120);
  const SP_PLACE = { P: "lab", B: "lab", M: "lab", F: "lab", V: "lab", W: "lab", T: "alv", D: "alv", N: "alv", S: "alv", Z: "alv", L: "alv", TH: "alv", DH: "alv", R: "alv",
    K: "vel", G: "vel", NG: "vel", SH: "pal", ZH: "pal", CH: "pal", JH: "pal", Y: "pal", HH: "glo" };
  const SP_LOCUS = { lab: [250, 800, 2100], alv: [250, 1700, 2600], vel: [250, 1900, 2500], pal: [250, 2000, 2700] };
  // consonants: type, target extras, duration (s)
  const SP_CT = {
    W: ["glide", spT(290, 610, 2150, 50, 80, 60, { AV: 0.8 }), 0.07], Y: ["glide", spT(260, 2070, 3020, 40, 250, 500, { AV: 0.8 }), 0.06],
    R: ["glide", spT(310, 1060, 1380, 70, 100, 120, { AV: 0.8 }), 0.07], L: ["glide", spT(310, 1050, 2880, 50, 100, 280, { AV: 0.75 }), 0.07],
    M: ["nasal", spT(260, 1100, 2150, 80, 300, 300, { AV: 0.6, NZ: 1000, NP: 1 }), 0.07], N: ["nasal", spT(260, 1400, 2500, 80, 300, 300, { AV: 0.6, NZ: 1800, NP: 1 }), 0.06],
    NG: ["nasal", spT(260, 2000, 2700, 80, 300, 300, { AV: 0.6, NZ: 3000, NP: 1 }), 0.07],
    S: ["fric", { AF: 0.9, FF: 5500, FB: 1600, AV: 0 }, 0.12], Z: ["fric", { AF: 0.55, FF: 5500, FB: 1600, AV: 0.5 }, 0.09],
    SH: ["fric", { AF: 1, FF: 2600, FB: 900, FF2: 3900, AV: 0 }, 0.12], ZH: ["fric", { AF: 0.6, FF: 2600, FB: 900, FF2: 3900, AV: 0.5 }, 0.08],
    F: ["fric", { AF: 0.25, AB: 0.45, FF: 6000, FB: 4000, AV: 0 }, 0.11], V: ["fric", { AF: 0.18, AB: 0.3, FF: 6000, FB: 4000, AV: 0.6 }, 0.07],
    TH: ["fric", { AF: 0.22, AB: 0.4, FF: 5000, FB: 4000, AV: 0 }, 0.1], DH: ["fric", { AF: 0.15, AB: 0.25, FF: 5000, FB: 4000, AV: 0.6 }, 0.05],
    HH: ["asp", {}, 0.06],
    P: ["stop", { FF: 1200, FB: 2500, AB: 0.6 }, 0.07], B: ["stop", { FF: 1200, FB: 2500, AB: 0.6, v: 1 }, 0.06],
    T: ["stop", { FF: 4200, FB: 1500 }, 0.06], D: ["stop", { FF: 4200, FB: 1500, v: 1 }, 0.05],
    K: ["stop", { FF: 2100, FB: 700 }, 0.07], G: ["stop", { FF: 2100, FB: 700, v: 1 }, 0.06],
    CH: ["affr", "SH", 0.05], JH: ["affr", "ZH", 0.05],
  };
  const spVowelT = nuc => { const b = (nuc || "AH").replace(/\d/, ""), st = +(nuc || "").slice(-1); if (b === "AH" && st === 0) return [SP_SCHWA, null, 0.07]; return SP_VT[b] || SP_VT.AH; };
  const spBlend = (a, b, x) => a.map((v, i) => v + (b[i] - v) * x);
  function spWith(base, o) { const v = base.slice(); for (const k in o) if (SPX[k] != null) v[SPX[k]] = o[k]; return v; }
  // the targets a consonant passes through next to vowel V (its formants lean toward the vowel's, from its place of articulation)
  function spCons(c, V, coda, speed) {
    const C = SP_CT[c]; if (!C) return [];
    const [type, x, dur] = C, d = s => s * speed, loc = SP_LOCUS[SP_PLACE[c]] || null;
    const lean = (vx, amt) => { const v = vx.slice(); if (loc) for (let i = 0; i < 3; i++) v[i] = loc[i] + (V[i] - loc[i]) * amt; return v; };
    const quiet = o => spWith(V, Object.assign({ AV: 0, AH: 0, AF: 0, AB: 0, NP: 0, NZ: 0 }, o));
    if (type === "glide" || type === "nasal") return [{ v: x.slice(), d: d(dur), tr: type === "nasal" ? 0.02 : 0.035 }];
    if (type === "asp") return [{ v: quiet({ AH: 0.75 }), d: d(dur), tr: 0.01 }];
    if (type === "fric") { const v = lean(quiet(x), 0.35); return [{ v, d: d(dur), tr: 0.02 }]; }
    if (type === "affr") {
      const F = SP_CT[x][1], cl = lean(quiet({ AV: 0 }), 0.2);
      return [{ v: cl, d: d(dur), tr: 0.012 }, { v: lean(quiet(F), 0.35), d: d(0.07), tr: 0.004 }];
    }
    if (type === "stop") {
      const voiced = !!x.v, cl = lean(quiet({ AV: voiced ? 0.12 : 0 }), 0.15); cl[0] = 200;
      const burst = lean(quiet({ AF: 1, FF: x.FF, FB: x.FB, AB: x.AB || 0, AV: voiced ? 0.25 : 0 }), 0.3);
      const out = [{ v: cl, d: d(dur), tr: 0.012 }, { v: burst, d: 0.012, tr: 0.002 }];
      if (!voiced) out.push({ v: lean(quiet({ AH: coda ? 0.35 : 0.6 }), 0.55), d: coda ? 0.03 : d(0.05), tr: 0.004 });
      return out;
    }
    return [];
  }
  // one syllable as targets: onset, the vowel (held while the note is down), then the last consonants
  function spSylSegs(s, speed, opt = {}) {
    const segs = [], [V0, V1, vdur] = spVowelT(s.nuc), sp = speed;
    s.on.forEach((c, k) => {
      const next = s.on[k + 1];
      if (k === 0 && SP_CT[c] && (SP_CT[c][0] === "stop" || SP_CT[c][0] === "affr")) { const g = spCons(c, V0, false, sp); g[0].d *= 0.45; segs.push(...g); return; }   // (a note starts on its consonant, not on a silence)
      if (next && SP_CT[next] && SP_CT[next][0] === "glide" && SP_CT[c][0] !== "stop" && SP_CT[c][0] !== "fric") { segs.push(...spCons(c, SP_CT[next][1], false, sp)); return; }
      segs.push(...spCons(c, V0, false, sp));
    });
    if (s.on[0] === "HH") { const h = segs[0]; if (h) { for (let i = 0; i < 10; i++) h.v[i] = V0[i]; } }   // (h is breath through the vowel's own shape)
    if (s.nuc) {
      const first = !segs.length;
      if (V1) { segs.push({ v: V0.slice(), d: Math.max(0.05, vdur * 0.45), tr: first ? 0.015 : 0.04, hold: true, attack: first }); segs.push({ v: V1.slice(), d: 0.09, tr: 0.08 }); }
      else segs.push({ v: V0.slice(), d: Math.max(0.05, vdur * 0.6), tr: first ? 0.015 : 0.04, hold: true, attack: first });
    }
    const Vend = V1 || V0;
    s.coda.forEach(c => segs.push(...spCons(c, Vend, true, sp)));
    segs.push({ v: spWith(Vend, { AV: 0, AH: 0, AF: 0, AB: 0 }), d: 0.03, tr: s.coda.length ? 0.02 : 0.06 });
    if (opt.pm) segs.forEach(g => { g.v[SPX.PM] = opt.pm; });
    return segs;
  }
  // a whole line, spoken: stressed syllables longer and higher, the pitch drifting down, a rise for a question
  function spPhraseSegs(syls, speed, rate = 1) {
    const segs = [], n = syls.length;
    syls.forEach((s, k) => {
      const st = s.st === 1 ? 1 : s.st === 2 ? 0.75 : 0.5, decl = 1.06 - 0.14 * (k / Math.max(1, n - 1));
      let pm = decl * (s.st === 1 ? 1.1 : 0.97);
      if (k === n - 1) pm *= s.q ? 1.25 : 0.88;
      const ss = spSylSegs(s, speed / rate, { pm });
      const hold = ss.find(g => g.hold); if (hold) { hold.hold = false; hold.d = (0.07 + 0.13 * st) / rate * (k === n - 1 || s.pause ? 1.4 : 1); }
      ss.pop();   // (no silence between syllables of a phrase)
      segs.push(...ss);
      if (s.pause || k === n - 1) segs.push({ v: spWith(segs[segs.length - 1].v, { AV: 0, AH: 0, AF: 0, AB: 0 }), d: (s.pause === 2 ? 0.3 : 0.14) / rate, tr: 0.05 });
    });
    return segs;
  }
