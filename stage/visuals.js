/*
 * NBVisuals: music-driven visuals engine (WebGL 1, Canvas 2D fallback).
 * Classic script, no dependencies. Defines window.NBVisuals.
 *
 *   var vis = NBVisuals.create(canvas [, options]);
 *   vis.start(); vis.setMode('bloom' | 'kaleido' | 'drift');
 *   vis.beatClock(fn); vis.note(midi, vel, layer); vis.noteOff(midi);
 *   vis.chord(root, q); vis.level(rms, peak); vis.spectrum(arr16); vis.hit(kind, vel);
 *
 * Note colour wheel: pitch classes are laid out on the circle of fifths
 * (C red, G orange, D amber, A lime, E green, B teal, F# cyan, C# blue,
 *  G# indigo, D# violet, A# magenta, F rose), so a diatonic melody stays
 * inside one coherent arc of hues and key changes move the arc.
 */
(function () {
  'use strict';

  var MODES = [
    { id: 'bloom', name: 'Bloom' },
    { id: 'kaleido', name: 'Kaleido' },
    { id: 'drift', name: 'Drift' }
  ];
  var MODE_INDEX = { bloom: 0, kaleido: 1, drift: 2 };
  var QUALITY = [1, 0.88, 0.77, 0.67, 0.58, 0.5, 0.43, 0.37];
  var DEFAULT_MAX_PIXELS = 1.6e6;
  var DPR_CAP = 2;
  var FOLDS = 6;
  var TAU = Math.PI * 2;
  var LAYER_SIZE = [1.15, 0.9, 0.72, 1.0, 0.6];

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth01(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  function num(x, d) { x = +x; return isFinite(x) ? x : d; }
  function expK(dt, tau) { return 1 - Math.exp(-dt / tau); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ------------------------------------------------------------------ colour */

  function wrapHue(h) { h = h % 360; return h < 0 ? h + 360 : h; }
  function hueDelta(a, b) { return ((b - a) % 360 + 540) % 360 - 180; }
  function hueToward(a, b, t) { return a + hueDelta(a, b) * t; }
  function pcHue(pc) { return wrapHue(25 + 30 * ((pc * 7) % 12)); }

  // OKLCH -> linear sRGB with chroma reduction until in gamut.
  function oklchToLin(L, C, h, out, o) {
    var hr = h * Math.PI / 180, ca = Math.cos(hr), sa = Math.sin(hr);
    for (var it = 0; it < 16; it++) {
      var a = C * ca, b = C * sa;
      var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
      var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
      var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      var bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      if ((r > -0.002 && g > -0.002 && bb > -0.002 && r < 1.002 && g < 1.002 && bb < 1.002) || it === 15) {
        out[o] = clamp01(r); out[o + 1] = clamp01(g); out[o + 2] = clamp01(bb);
        return;
      }
      C *= 0.86;
    }
  }

  var NOTE_LIN = new Float32Array(36);
  (function () {
    for (var pc = 0; pc < 12; pc++) {
      var h = pcHue(pc);
      var yel = Math.exp(-Math.pow(hueDelta(h, 100) / 40, 2));
      oklchToLin(0.74 + 0.06 * yel, 0.155, h, NOTE_LIN, pc * 3);
    }
  })();

  // Chord qualities: hue pull (to, amt), lightness shift, chroma mult, hue spread.
  var QUAL = {
    maj:  { to: 50,  amt: 0.30, dL: 0.03,  cm: 1.00, spread: 38, bgTo: 330, mood: [1, 0, 0, 0] },
    min:  { to: 255, amt: 0.38, dL: -0.04, cm: 0.95, spread: 32, bgTo: 268, mood: [-1, 0, 0, 0] },
    '7':  { to: 40,  amt: 0.22, dL: 0.01,  cm: 1.14, spread: 74, bgTo: 318, mood: [0.6, 1, 0, 0] },
    min7: { to: 262, amt: 0.32, dL: -0.03, cm: 1.10, spread: 66, bgTo: 275, mood: [-0.7, 1, 0, 0] },
    sus4: { to: 195, amt: 0.14, dL: 0.05,  cm: 0.80, spread: 22, bgTo: 250, mood: [0.2, 0, 0, 1] },
    dim:  { to: 300, amt: 0.45, dL: -0.06, cm: 0.92, spread: 96, bgTo: 292, mood: [-0.8, 0.4, 1, 0] },
    '5':  { to: 0,   amt: 0.0,  dL: 0.0,   cm: 0.62, spread: 14, bgTo: 262, mood: [0, 0, 0, 0.5] }
  };
  var QUAL_ALIAS = {
    major: 'maj', M: 'maj', '': 'maj', minor: 'min', m: 'min', dom7: '7', maj7: '7', M7: '7',
    m7: 'min7', min7: 'min7', sus: 'sus4', sus2: 'sus4', dim7: 'dim', o: 'dim', power: '5'
  };

  function yellowness(h) { return Math.exp(-Math.pow(hueDelta(h, 95) / 38, 2)); }

  // yellow-green turns khaki when it's dim: the palette steers out of it, to gold or teal
  function steer(h) { h = wrapHue(h); if (h > 68 && h < 128) return h < 98 ? 60 - (98 - h) * 0.08 : 142 + (h - 98) * 0.08; return h; }
  // Palette in OKLCH (4 colours x L,C,h): deep, mid, accent, highlight.
  function buildPalette(root, q, out) {
    var m = QUAL[q] || QUAL.maj;
    var base = hueToward(pcHue(root), m.to, m.amt);
    var bgH = hueToward(base, m.bgTo, 0.86);   // (the deep colour leans to plum and indigo: warm chords never go brown)
    out[0] = 0.135 + m.dL * 0.5; out[1] = 0.075 * m.cm; out[2] = wrapHue(bgH);
    out[3] = 0.50 + m.dL + 0.07 * yellowness(base); out[4] = 0.165 * m.cm; out[5] = steer(base);
    var h2 = base + m.spread;
    out[6] = 0.66 + m.dL + 0.06 * yellowness(h2); out[7] = 0.18 * m.cm; out[8] = steer(h2);
    var h3 = base - m.spread * 0.6;
    out[9] = 0.86 + m.dL * 0.5; out[10] = 0.075 * m.cm; out[11] = steer(h3);
    return m;
  }

  /* ------------------------------------------------------------------ shaders */

  var VS = 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}';

  var COMMON = [
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uFade;',
    'uniform vec4 uPulse;', // x swell (beat+bar), y bar swell, z kick breath, w level (perceptual)
    'uniform vec4 uSpec;',  // low, low-mid, high-mid, high
    'uniform vec4 uMood;',  // warmth, richness, tension, openness
    'uniform vec3 uGlow;',  // weighted colour of sounding notes
    'uniform vec3 uPal[4];',
    'uniform vec4 uN[NN];',
    'uniform vec4 uC[NN];',
    'uniform vec4 uSpk[4];', // sparkle slots: env, seed, size, density
    'varying vec2 vUv;',
    'const mat2 M2 = mat2(0.8, 0.6, -0.6, 0.8);',
    'mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }',
    'float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }',
    'float gnoise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
    '  float va = dot(hash22(i) * 2.0 - 1.0, f);',
    '  float vb = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));',
    '  float vc = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));',
    '  float vd = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));',
    '  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y);',
    '}',
    'float fbm3(vec2 p) { float f = 0.5 * gnoise(p); p = M2 * p * 2.03; f += 0.25 * gnoise(p); p = M2 * p * 2.01; f += 0.125 * gnoise(p); return f * 1.1428; }',
    'float fbm4(vec2 p) { float f = 0.5 * gnoise(p); p = M2 * p * 2.03; f += 0.25 * gnoise(p); p = M2 * p * 2.01; f += 0.125 * gnoise(p); p = M2 * p * 2.02; f += 0.0625 * gnoise(p); return f * 1.0667; }',
    // drum sparkles: four round-robin slots, each a sparse random set of glints
    'vec3 sparkles(vec2 p) {',
    '  vec3 acc = vec3(0.0);',
    '  float px = 1.0 / uRes.y;',
    '  for (int k = 0; k < 4; k++) {',
    '    vec4 s = uSpk[k];',
    '    if (s.x < 0.004) continue;',
    '    vec2 q = p * 6.0 + s.y;',
    '    vec2 id = floor(q);',
    '    float h = hash12(id + s.y * 1.37);',
    '    if (h > s.w) continue;',
    '    vec2 o = (hash22(id + 7.7 + s.y) - 0.5) * 0.5;',
    '    vec2 d = (fract(q) - 0.5 - o) / 6.0;',
    '    float rad = max(0.0022 * s.z, 1.15 * px);',
    '    float core = exp(-dot(d, d) / (rad * rad));',
    '    float arm = 0.012 * s.z;',
    '    float lw = rad * rad * 0.09 + px * px * 0.6;',
    '    float lx = exp(-d.y * d.y / lw) * exp(-abs(d.x) / arm);',
    '    float ly = exp(-d.x * d.x / lw) * exp(-abs(d.y) / arm);',
    '    float hh = fract(h * 17.13);',
    '    vec3 tint = mix(uPal[3], uPal[2] + 0.25, step(0.5, hh)) * 0.8 + 0.2;',
    '    acc += tint * (core + 0.3 * (lx + ly)) * s.x * (0.45 + 0.75 * fract(h * 31.7));',
    '  }',
    '  return acc;',
    '}',
    // tonemap, gamma, triangular dither (kills banding in the dark gradients)
    'vec3 finish(vec3 c, vec2 fc) {',
    '  c = max(c, vec3(0.0)) * uFade;',
    '  c = vec3(1.0) - exp(-c * 1.1);',
    '  c = max(mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.22), vec3(0.0));',
    '  c = pow(c, vec3(0.4545));',
    '  float n = hash12(fc + fract(uTime * 0.917) * 317.0) + hash12(fc * 1.13 + 71.7 + fract(uTime * 0.513) * 113.0) - 1.0;',
    '  return c + n * (1.25 / 255.0);',
    '}',
    '#ifdef INK_LOWP',
    'vec3 inkDec(vec4 t) { return t.rgb * t.rgb * 4.0; }',
    'vec4 inkEnc(vec3 c, vec2 fc) { vec3 e = sqrt(clamp(c * 0.25, 0.0, 1.0)); e += (hash12(fc + fract(uTime * 1.37) * 91.0) - 0.5) / 255.0; return vec4(e, 1.0); }',
    '#else',
    'vec3 inkDec(vec4 t) { return t.rgb; }',
    'vec4 inkEnc(vec3 c, vec2 fc) { return vec4(clamp(c, 0.0, 16.0), 1.0); }',
    '#endif',
    ''
  ].join('\n');

  // Bloom, pass 1: low-res ink simulation (advection by a curl-noise flow, decay, injection).
  var FS_SIM = [
    'uniform sampler2D uPrev;',
    'uniform vec2 uTexel;',
    'uniform float uAsp;',
    'uniform float uDt60;',
    'uniform float uDecay;',
    'uniform float uInject;',
    'void main() {',
    '  vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0);',
    '  float t = uTime;',
    '  vec2 q = p * 1.6;',
    '  vec2 w = vec2(fbm3(q + vec2(0.0, t * 0.03)), fbm3(q + vec2(5.2, 1.3) - vec2(t * 0.027, 0.0)));',
    '  vec2 r = q * 1.2 + 1.5 * w + vec2(t * 0.015, -t * 0.01);',
    '  float e = 0.05;',
    '  float n0 = gnoise(r);',
    '  float nx = gnoise(r + vec2(e, 0.0));',
    '  float ny = gnoise(r + vec2(0.0, e));',
    '  vec2 curl = vec2(ny - n0, n0 - nx) / e;',
    '  vec2 vel = curl * (0.05 + 0.025 * uPulse.w) + vec2(0.0, 0.007);',
    '  float dts = uDt60 / 60.0;',
    '  vec2 back = vUv - vel * dts / vec2(uAsp, 1.0);',
    '  vec3 c = inkDec(texture2D(uPrev, back));',
    '  vec3 nb = inkDec(texture2D(uPrev, back + vec2(uTexel.x, 0.0))) + inkDec(texture2D(uPrev, back - vec2(uTexel.x, 0.0)))',
    '          + inkDec(texture2D(uPrev, back + vec2(0.0, uTexel.y))) + inkDec(texture2D(uPrev, back - vec2(0.0, uTexel.y)));',
    '  c = mix(c, nb * 0.25, 0.1 * min(uDt60, 3.0));',
    '  c *= uDecay;',
    '  float dn = fbm3(r * 0.7 + vec2(9.1, 3.7) + t * 0.01);',
    '  float dens = pow(clamp(1.0 - abs(dn) * 2.4, 0.0, 1.0), 3.0) * (0.6 + 0.8 * smoothstep(-0.2, 0.4, w.y));',
    '  vec3 tint = mix(uPal[0] * 3.0, uPal[1], smoothstep(-0.2, 0.5, w.x));',
    '  tint = mix(tint, uPal[2], smoothstep(0.3, 0.7, w.y) * 0.35);',
    '  c += tint * dens * uInject * uDt60;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    vec2 d = p - n.xy;',
    '    float rr = n.z * 0.75;',
    '    c += uC[i].rgb * (n.w * 0.02 * uDt60) * exp(-dot(d, d) / (rr * rr));',
    '  }',
    '  vec2 ed = min(vUv, 1.0 - vUv);',
    '  c *= smoothstep(0.0, 0.012, min(ed.x, ed.y));',
    '  gl_FragColor = inkEnc(c, gl_FragCoord.xy);',
    '}'
  ].join('\n');

  // Bloom, pass 2: display.
  var FS_BLOOM = [
    'uniform sampler2D uSim;',
    'float particles(vec2 p, float t) {',
    '  float acc = 0.0;',
    '  float px = 1.0 / uRes.y;',
    '  p += 0.025 * vec2(sin(p.y * 3.1 + t * 0.21), cos(p.x * 2.7 + t * 0.17));',
    '  for (int L = 0; L < 3; L++) {',
    '    float fl = float(L);',
    '    float sc = 8.0 + fl * 6.0;',
    '    vec2 q = (p + vec2(fl * 1.37 + sin(t * 0.05 + fl * 2.1) * 0.08, -t * (0.008 + 0.006 * fl))) * sc;',
    '    vec2 id = floor(q);',
    '    float h = hash12(id + fl * 31.7);',
    '    if (h < 0.62) continue;',
    '    vec2 o = (hash22(id + fl * 7.3) - 0.5) * 0.6;',
    '    vec2 d = (fract(q) - 0.5 - o) / sc;',
    '    float rad = max(0.0011 + 0.0011 * fract(h * 7.1), 1.1 * px);',
    '    float tw = 0.55 + 0.45 * sin(t * (0.35 + h) + h * 40.0);',
    '    acc += exp(-dot(d, d) / (rad * rad)) * tw * (0.3 + 0.7 * fract(h * 3.3)) * (1.0 - fl * 0.22);',
    '  }',
    '  return acc;',
    '}',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  float asp = uRes.x / uRes.y;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  vec2 p = p0 * (1.0 - 0.03 * uPulse.z - 0.012 * uPulse.x);',
    '  float t = uTime;',
    '  vec3 ink = inkDec(texture2D(uSim, p / vec2(asp, 1.0) + 0.5));',
    '  vec3 col = uPal[0] * (0.6 + 0.6 * smoothstep(-0.6, 0.6, p0.y));',
    '  col += uPal[1] * 0.05 * exp(-dot(p0, p0) * 3.0);',
    '  col += uGlow * 0.015 * exp(-dot(p0, p0) * 1.5);',
    '  ink = ink * ink / (ink + 0.06);',
    '  col += ink * (0.95 + 0.3 * uPulse.w);',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    vec2 d = p - n.xy;',
    '    float d2 = dot(d, d);',
    '    float r2 = n.z * n.z;',
    '    col += uC[i].rgb * n.w * (exp(-d2 / (r2 * 0.3)) * 0.7 + exp(-d2 / (r2 * 3.5)) * 0.28);',
    '  }',
    '  col += mix(uPal[3], uPal[2], 0.35) * particles(p, t) * (0.2 + 0.25 * uPulse.w + 0.25 * uSpec.w);',
    '  col += sparkles(p);',
    '  col *= (0.9 + 0.2 * uPulse.w) * (1.0 + 0.1 * uPulse.x);',
    '  col *= 1.0 - 0.45 * smoothstep(0.35, 1.05, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Kaleido: folded domain-warped colour field, notes injected in folded space.
  var FS_KALEIDO = [
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float zoom = 1.08 * (1.0 - 0.055 * uPulse.x - 0.03 * uPulse.z);',
    '  vec2 p = rot(t * 0.021 + 0.3 * sin(t * 0.013)) * (p0 * zoom);',
    '  float r = length(p);',
    '  float a = atan(p.y, p.x);',
    '  float seg = 6.2831853 / FOLDS;',
    '  a = mod(a, seg);',
    '  a = abs(a - 0.5 * seg);',
    '  vec2 q = r * vec2(cos(a), sin(a));',
    '  vec2 s = q * 2.3 - vec2(t * 0.045, 0.0);',
    '  vec2 w = vec2(fbm3(s + vec2(1.7, t * 0.031)), fbm3(s + vec2(8.3, 2.8) - vec2(0.0, t * 0.026)));',
    '  float f = fbm4(s * 1.15 + (1.9 + 0.5 * uMood.y + 0.4 * uSpec.x) * w + vec2(t * 0.01, 0.0));',
    '  float v = clamp(f * 1.1 + 0.5, 0.0, 1.0);',
    '  vec3 col = mix(uPal[0] * 0.8, uPal[1], smoothstep(0.3, 0.7, v));',
    '  col = mix(col, uPal[2], smoothstep(0.55, 0.95, v + 0.3 * w.x) * 0.85);',
    '  float vein = pow(clamp(1.0 - abs(f * 2.6 + 0.3 * w.y), 0.0, 1.0), 8.0);',
    '  col += uPal[3] * vein * (0.35 + 0.3 * uPulse.x);',
    '  float rad = smoothstep(1.15, 0.05, r);',
    '  col *= 0.35 + 0.85 * rad;',
    '  col += uPal[2] * 0.12 * exp(-r * r * 30.0) * (1.0 + uPulse.y);',
    '  vec2 qw = q + w * 0.05;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    vec2 d = qw - n.xy;',
    '    float d2 = dot(d, d);',
    '    float r2 = n.z * n.z;',
    '    col += uC[i].rgb * n.w * (exp(-d2 / r2) * (0.25 + 0.9 * v) + exp(-d2 / (r2 * 0.25)) * 0.35);',
    '  }',
    '  col += uGlow * 0.1 * rad;',
    '  col += sparkles(p0);',
    '  col *= (0.88 + 0.22 * uPulse.w) * (1.0 + 0.08 * uPulse.x);',
    '  col *= 1.0 - 0.35 * smoothstep(0.45, 1.1, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Drift: flight through a soft tunnel of rings and aurora ribbons; notes are passing lights.
  var FS_DRIFT = [
    'uniform float uCamZ;',
    'float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  vec2 vp = vec2(sin(t * 0.041) * 0.07 + sin(t * 0.017 + 1.0) * 0.04, cos(t * 0.033) * 0.045);',
    '  vec2 d = rot(sin(t * 0.023) * 0.4 + t * 0.012) * (p0 - vp);',
    '  d /= 1.0 + 0.035 * uPulse.z + 0.015 * uPulse.x;',
    '  float r = max(length(d), 1e-4);',
    '  float a = atan(d.y, d.x);',
    '  vec2 cs = d / r;',
    '  float TR = 0.42;',
    '  float z = TR / r;',
    '  float zz = z + uCamZ;',
    '  float fog = exp(-z * 0.16);',
    '  float nearF = smoothstep(0.15, 0.7, z);',
    '  float n1 = fbm3(cs * 1.2 + vec2(zz * 0.16, t * 0.015));',
    '  float n2 = gnoise(cs * 3.1 + vec2(zz * 0.4 - t * 0.04, 4.1));',
    '  float band = sin(a * 3.0 + n1 * 4.5 + zz * 0.11 + t * 0.04);',
    '  float rib = pow(0.5 + 0.5 * band, 16.0) * (0.5 + 0.5 * n2 + 0.3 * n1);',
    '  float rays = 0.65 + 0.35 * gnoise(cs * 7.0 + vec2(0.0, zz * 0.9));',
    '  vec3 ribCol = mix(uPal[1], uPal[2], 0.5 + 0.5 * sin(zz * 0.23 + a + n1 * 2.0));',
    '  ribCol = mix(ribCol, uPal[3], pow(clamp(rib, 0.0, 1.0), 3.0) * 0.35);',
    '  vec3 col = uPal[0] * (0.45 + 0.4 * smoothstep(0.05, 0.7, r));',
    '  col += ribCol * max(rib, 0.0) * rays * 0.34 * fog * nearF * (0.8 + 0.25 * uSpec.x);',
    '  float D = 1.7;',
    '  float rz = (zz + 0.14 * sin(a * 2.0 + t * 0.2) + 0.1 * n1) / D;',
    '  float fi = floor(rz + 0.5);',
    '  float dz = (rz - fi) * D;',
    '  float w0 = 0.03;',
    '  float w = max(w0, 1.3 * z * z / (TR * uRes.y));',
    '  float ringE = w0 / w;',
    '  float ring = exp(-dz * dz / (w * w)) * ringE + exp(-dz * dz / (w * w * 25.0)) * ringE * 0.25;',
    '  float hr = hash12(vec2(fi, 3.7));',
    '  float arc = 0.45 + 0.55 * smoothstep(-0.3, 0.8, sin(a + hr * 6.2832 + t * 0.07 * (hr - 0.5)));',
    '  vec3 ringCol = mix(uPal[2], uPal[3], hr * 0.6);',
    '  col += ringCol * ring * arc * fog * nearF * (0.55 + 0.8 * uPulse.x + 0.3 * uPulse.y);',
    '  col += uPal[2] * 0.1 * exp(-r * r * 25.0) + uPal[3] * 0.1 * exp(-r * r * 300.0);',
    '  col += uGlow * 0.006 * fog;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    float pr = uC[i].a;',
    '    float zi = 2.4 * pow(0.05, pr);',
    '    vec2 sp = n.xy * TR / zi;',
    '    vec2 sp2 = n.xy * TR / (zi * 1.35);',
    '    float dd = sdSeg(d, sp, sp2);',
    '    float rad = n.z * (0.006 / zi + 0.006);',
    '    float r2 = rad * rad;',
    '    vec2 ds = d - sp;',
    '    float fl = exp(-dot(ds, ds) / (r2 * 60.0)) * exp(-pr * 7.0);',
    '    col += uC[i].rgb * n.w * (exp(-dd * dd / r2) * 0.9 + exp(-dd * dd / (r2 * 12.0)) * 0.25 + fl * 0.5);',
    '  }',
    '  col += sparkles(p0);',
    '  col *= (0.88 + 0.22 * uPulse.w) * (1.0 + 0.08 * uPulse.x);',
    '  col *= 1.0 - 0.3 * smoothstep(0.5, 1.1, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  var FS_BLIT = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform float uAlpha;',
    'uniform float uScale;',
    'varying vec2 vUv;',
    'void main() { vec2 uv = (vUv - 0.5) / uScale + 0.5; gl_FragColor = vec4(texture2D(uTex, uv).rgb, uAlpha); }'
  ].join('\n');

  var COMMON_UNIFORMS = ['uRes', 'uTime', 'uFade', 'uPulse', 'uSpec', 'uMood', 'uGlow', 'uPal', 'uN', 'uC', 'uSpk'];

  /* ------------------------------------------------------------------ engine */

  function create(canvas, opts) {
    if (!canvas || !canvas.getContext) throw new Error('NBVisuals.create: a <canvas> element is required');
    opts = opts || {};
    var maxPixels = num(opts.maxPixels, DEFAULT_MAX_PIXELS);
    var adaptive = opts.adaptive !== false;
    var qi = 0;
    if (opts.quality != null) {
      var qv = num(opts.quality, 1), best = 0;
      for (var qq = 0; qq < QUALITY.length; qq++) if (Math.abs(QUALITY[qq] - qv) < Math.abs(QUALITY[best] - qv)) best = qq;
      qi = best;
    }
    var dream = opts.dream !== false;

    var NN = 16;
    var notes = [];
    for (var ni = 0; ni < 16; ni++) {
      notes.push({ active: false, ghost: false, midi: 0, vel: 0, layer: 0, vc: 0, pn: 0, age: 0, life: 2, held: false,
        relAge: -1, relLevel: 0, relDur: 1.2, att: 0, env: 0, s: 0, size: 1, spread: 0.5, kang: 0, dx: 0, dy: 1, R: 0.5,
        col: new Float32Array(3) });
    }
    var NB = new Float32Array(64), NC = new Float32Array(64);
    var spk = new Float32Array(16), spkTau = new Float32Array(4), spkNext = 0;
    var palTgt = new Float32Array(12), palCur = new Float32Array(12), pal = new Float32Array(12);
    var mood = new Float32Array(4), moodTgt = new Float32Array(4);
    var glow = new Float32Array(3);
    var spec = new Float32Array(4), specTgt = new Float32Array(4);

    var m0 = buildPalette(8, 'min7', palTgt);
    palCur.set(palTgt);
    for (var mi = 0; mi < 4; mi++) { moodTgt[mi] = m0.mood[mi]; mood[mi] = m0.mood[mi]; }
    for (var pi = 0; pi < 4; pi++) oklchToLin(palCur[pi * 3], palCur[pi * 3 + 1], palCur[pi * 3 + 2], pal, pi * 3);
    var palMoving = false;
    var chordRoot = 8, chordMinorish = true;

    // time & musical state
    var t = 0, camZ = 0, camSpeed = 0.32, startT = 0, fadeIn = 0;
    var clockFn = null, beat = 0, bpm = 100, playAmt = 0, swell = 0, barSwell = 0;
    var kick = 0, kickTgt = 0;
    var lvl = 0, lvlTgt = 0, peak = 0, lvlStamp = -1e9, specStamp = -1e9;
    var golden = Math.random(), side = false, idleNoteT = 0, dreamT = 3, sawNoteOff = false;
    var mode = 0, pendingMode = -1, warmT = 0;

    // render/perf state
    var running = false, raf = 0, lastTs = 0, frames = 0;
    var cssW = 0, cssH = 0, bw = 1, bh = 1;
    var fps = 0, fpsAcc = 0, fpsFrames = 0;
    var emaMs = 16.7, sinceQ = 0, goodT = 0, upWait = 3, downBlock = 0, probe = null, lastUpAt = -1e9;

    // GL state
    var gl = null, glOK = false, isGL = false, ctx2d = null;
    var progs = {}, quadBuf = null, sim = null, snapTex = null, snapOn = false, snapT = 0;
    var inkLowp = !!opts._lowPrecisionInk, inkType = 0;
    var blit2D = false, off2D = null, off2Dctx = null, tex2D = null;
    var sprites = null, whiteSprite = null, palSprites = null, palSpriteAge = 1e9, dots = null;

    var attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };

    /* ---------------- GL setup */

    function warn(msg) { if (window.console && console.warn) console.warn('[NBVisuals] ' + msg); }

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (!gl.isContextLost()) warn('shader compile failed: ' + gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    function makeProgram(fsBody, extra, header) {
      var vs = compile(gl.VERTEX_SHADER, VS);
      var fs = compile(gl.FRAGMENT_SHADER, (header === false ? '' : header) + fsBody);
      if (!vs || !fs) return null;
      var p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        if (!gl.isContextLost()) warn('program link failed: ' + gl.getProgramInfoLog(p));
        gl.deleteProgram(p);
        return null;
      }
      var u = {}, names = (header === false ? [] : COMMON_UNIFORMS).concat(extra || []);
      for (var i = 0; i < names.length; i++) u[names[i]] = gl.getUniformLocation(p, names[i]);
      return { p: p, u: u };
    }

    function makeTex(w, h, type, filter) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (w > 0) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      return tex;
    }

    function makeTarget(w, h, type) {
      var tex = makeTex(w, h, type, gl.LINEAR);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ok) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return null; }
      return { tex: tex, fb: fb };
    }

    function simSize() {
      var w = cssW > 0 ? cssW : 4, h = cssH > 0 ? cssH : 3;
      var L = 448;
      return w >= h ? [L, Math.max(64, Math.round(L * h / w))] : [Math.max(64, Math.round(L * w / h)), L];
    }

    function freeSim() {
      if (!sim) return;
      for (var i = 0; i < 2; i++) { gl.deleteFramebuffer(sim.t[i].fb); gl.deleteTexture(sim.t[i].tex); }
      sim = null;
    }

    function buildSim() {
      freeSim();
      var sz = simSize();
      var a = makeTarget(sz[0], sz[1], inkType), b = a && makeTarget(sz[0], sz[1], inkType);
      if (!a || !b) return false;
      sim = { w: sz[0], h: sz[1], t: [a, b], cur: 0 };
      return true;
    }

    function pickInkFormat() {
      inkType = gl.UNSIGNED_BYTE;
      if (inkLowp) return;
      var hf = gl.getExtension('OES_texture_half_float');
      var hfl = gl.getExtension('OES_texture_half_float_linear');
      gl.getExtension('EXT_color_buffer_half_float');
      if (hf && hfl) {
        var test = makeTarget(8, 8, hf.HALF_FLOAT_OES);
        if (test) { gl.deleteFramebuffer(test.fb); gl.deleteTexture(test.tex); inkType = hf.HALF_FLOAT_OES; return; }
      }
      inkLowp = true;
    }

    function buildGL() {
      glOK = false; progs = {}; sim = null; snapTex = null; snapOn = false; tex2D = null;
      var hp = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      var prec = (hp && hp.precision > 0) ? 'precision highp float;\n' : 'precision mediump float;\n';
      var maxVec = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 16;
      NN = maxVec >= 64 ? 16 : maxVec >= 40 ? 8 : 4;
      pickInkFormat();
      var head = prec + '#define NN ' + NN + '\n#define FOLDS ' + FOLDS.toFixed(1) + '\n' + (inkLowp ? '#define INK_LOWP 1\n' : '') + COMMON;

      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);

      progs.blit = makeProgram(FS_BLIT, ['uTex', 'uAlpha', 'uScale'], false);
      progs.sim = makeProgram(FS_SIM, ['uPrev', 'uTexel', 'uAsp', 'uDt60', 'uDecay', 'uInject'], head);
      progs.bloom = makeProgram(FS_BLOOM, ['uSim'], head);
      progs.kaleido = makeProgram(FS_KALEIDO, [], head);
      progs.drift = makeProgram(FS_DRIFT, ['uCamZ'], head);
      if (progs.sim) { gl.useProgram(progs.sim.p); gl.uniform1i(progs.sim.u.uPrev, 0); }
      if (progs.bloom) { gl.useProgram(progs.bloom.p); gl.uniform1i(progs.bloom.u.uSim, 0); }
      if (progs.blit) { gl.useProgram(progs.blit.p); gl.uniform1i(progs.blit.u.uTex, 0); }
      if (progs.sim && progs.bloom && !buildSim()) { progs.sim = null; }
      blit2D = !(progs.bloom || progs.kaleido || progs.drift) && !!progs.blit;
      if (blit2D) { warn('WebGL shaders unavailable, using Canvas 2D look'); init2D(); }
      glOK = !!(progs.blit || progs.kaleido || progs.drift || progs.bloom);
      warmT = 0;
    }

    function onLost(e) { e.preventDefault(); glOK = false; sim = null; progs = {}; snapTex = null; snapOn = false; }
    function onRestored() { buildGL(); applySize(true); }

    /* ---------------- sizing */

    function measure() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!(w > 0 && h > 0)) {
        var r = canvas.getBoundingClientRect();
        w = r.width; h = r.height;
      }
      cssW = w > 0 ? w : 0; cssH = h > 0 ? h : 0;
    }

    function applySize(force) {
      if (!(cssW > 0 && cssH > 0)) return;
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      var w = cssW * dpr, h = cssH * dpr;
      var cap = Math.min(1, Math.sqrt((isGL && !blit2D ? maxPixels : 0.35e6) / (w * h)));
      var s = cap * (isGL && !blit2D ? QUALITY[qi] : 1);
      var nw = Math.max(16, Math.round(w * s)), nh = Math.max(16, Math.round(h * s));
      if (nw !== canvas.width || nh !== canvas.height) {
        var bwC = canvas.clientWidth, bhC = canvas.clientHeight;
        canvas.width = nw; canvas.height = nh;
        // If the canvas had no CSS size of its own, pin it so the buffer size can't feed back into layout.
        if (Math.abs(canvas.clientWidth - bwC) > 1 || Math.abs(canvas.clientHeight - bhC) > 1) {
          canvas.style.width = bwC + 'px'; canvas.style.height = bhC + 'px';
        }
      }
      bw = nw; bh = nh;
      if (blit2D && off2D) { off2D.width = bw; off2D.height = bh; }
      if (isGL && glOK && progs.sim) {
        var sz = simSize();
        if (force || !sim || Math.abs(sz[0] - sim.w) > 2 || Math.abs(sz[1] - sim.h) > 2) { if (!buildSim()) progs.sim = null; }
      }
    }

    function resize() { measure(); applySize(false); }

    function setQuality(i) {
      i = clamp(i, 0, QUALITY.length - 1);
      if (i === qi) return;
      qi = i; applySize(false);
    }

    // acquire a context (after every var above has been initialised)
    if (!opts.force2D) {
      try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
    }
    measure();
    if (gl) {
      isGL = true;
      canvas.addEventListener('webglcontextlost', onLost, false);
      canvas.addEventListener('webglcontextrestored', onRestored, false);
      buildGL();
    } else {
      ctx2d = canvas.getContext('2d', { alpha: false });
      init2D();
    }

    var ro = null;
    if (window.ResizeObserver) { try { ro = new ResizeObserver(function () { resize(); }); ro.observe(canvas); } catch (e) { ro = null; } }
    window.addEventListener('resize', resize, false);
    measure(); applySize(true);

    /* ---------------- input */

    function pickSlot() {
      var best = -1, bestScore = 1e9;
      for (var i = 0; i < NN; i++) {
        var n = notes[i];
        if (!n.active) return n;
        var sc = n.s + (n.ghost ? -1 : 0) - n.age * 0.01;
        if (sc < bestScore) { bestScore = sc; best = i; }
      }
      return notes[best < 0 ? 0 : best];
    }

    function spawnNote(midi, vel, layer, ghost) {
      midi = clamp(Math.round(num(midi, 60)), 0, 127);
      vel = clamp01(num(vel, 0.7));
      layer = clamp(Math.round(num(layer, 0)), 0, 4);
      var n = pickSlot();
      n.active = true; n.ghost = !!ghost; n.midi = midi; n.vel = vel; n.layer = layer;
      n.age = 0; n.relAge = -1; n.relLevel = 0; n.held = true; n.att = 0; n.env = 0; n.s = 0;
      n.vc = (0.38 + 0.62 * vel) * (ghost ? 0.5 : 1);
      n.pn = clamp01((midi - 30) / 66);
      n.life = (1.5 + 1.5 * vel) * (layer === 4 ? 0.6 : 1) * (ghost ? 1.6 : 1);
      n.size = LAYER_SIZE[layer] * (1.3 - 0.55 * n.pn);
      var pc = midi % 12;
      n.col[0] = NOTE_LIN[pc * 3]; n.col[1] = NOTE_LIN[pc * 3 + 1]; n.col[2] = NOTE_LIN[pc * 3 + 2];
      golden = (golden + 0.6180339887) % 1;
      n.spread = clamp(0.5 + 0.33 * Math.sin(t * 0.19) + 0.1 * Math.sin(t * 0.47 + layer * 1.7) + (golden - 0.5) * 0.2, 0.06, 0.94);
      n.kang = golden * (Math.PI / FOLDS);
      side = !side;
      var th = -Math.PI / 2 + n.pn * Math.PI + (Math.random() - 0.5) * 0.3;
      if (side) th = Math.PI - th;
      n.dx = Math.cos(th); n.dy = Math.sin(th); n.R = 0.3 + 0.55 * Math.random();
      if (!ghost) { idleNoteT = 0; dreamT = 2 + Math.random() * 2; }
    }

    function note(midi, vel, layer) { spawnNote(midi, vel, layer, false); }

    function noteOff(midi) {
      midi = Math.round(num(midi, -1));
      sawNoteOff = true;
      for (var i = 0; i < NN; i++) {
        var n = notes[i];
        if (n.active && n.held && n.midi === midi) {
          n.held = false; n.relAge = n.age; n.relLevel = n.env;
          n.relDur = clamp(n.life - n.age, 1.0, 2.5);
        }
      }
    }

    function chord(root, q) {
      root = ((Math.round(num(root, 0)) % 12) + 12) % 12;
      q = String(q == null ? 'maj' : q);
      if (!QUAL[q]) q = QUAL_ALIAS[q] || (q.charAt(0) === 'm' && q.indexOf('maj') !== 0 ? 'min' : 'maj');
      var m = buildPalette(root, q, palTgt);
      for (var i = 0; i < 4; i++) moodTgt[i] = m.mood[i];
      chordRoot = root; chordMinorish = m.mood[0] < 0;
      palMoving = true;
    }

    function level(rms, pk) {
      lvlTgt = clamp01(num(rms, 0));
      peak = clamp01(num(pk, lvlTgt));
      lvlStamp = now();
    }

    function spectrum(arr) {
      if (!arr || !arr.length) return;
      var n = arr.length, edges = [0, 0.125, 0.375, 0.6875, 1];
      for (var b = 0; b < 4; b++) {
        var i0 = Math.floor(edges[b] * n), i1 = Math.max(i0 + 1, Math.floor(edges[b + 1] * n)), s = 0, c = 0;
        for (var i = i0; i < i1 && i < n; i++) { s += clamp01(num(arr[i], 0)); c++; }
        specTgt[b] = c ? s / c : 0;
      }
      specStamp = now();
    }

    function sparkle(env, size, dens, tau) {
      var k = spkNext; spkNext = (spkNext + 1) & 3;
      spk[k * 4] = env; spk[k * 4 + 1] = Math.random() * 400; spk[k * 4 + 2] = size; spk[k * 4 + 3] = dens;
      spkTau[k] = tau;
    }

    function hit(kind, vel) {
      var v = clamp01(num(vel, 0.8));
      if (kind === 'kick') kickTgt = Math.max(kickTgt, 0.45 + 0.55 * v);
      else if (kind === 'snare') sparkle(0.55 + 0.45 * v, 1.25, 0.075, 0.36);
      else if (kind === 'hat') sparkle(0.3 + 0.4 * v, 0.75, 0.035, 0.2);
      else { sparkle(0.35 + 0.35 * v, 1.0, 0.05, 0.3); kickTgt = Math.max(kickTgt, 0.25 * v); }
    }

    function beatClock(fn) { clockFn = typeof fn === 'function' ? fn : null; }

    function setMode(name) {
      var i = MODE_INDEX[name];
      if (i == null) { i = num(name, -1); if (!(i >= 0 && i < 3)) return; }
      if (i === mode && pendingMode < 0) return;
      if (isGL && glOK && !blit2D && running && frames > 0) pendingMode = i;
      else enterMode(i);
    }

    function enterMode(i) {
      mode = i;
      if (mode === 0 && isGL && glOK && sim) {
        for (var k = 0; k < 2; k++) { gl.bindFramebuffer(gl.FRAMEBUFFER, sim.t[k].fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        warmT = 0;
      }
    }

    /* ---------------- per-frame update */

    function updateNote(n, dt) {
      n.age += dt;
      var a = smooth01(n.age / 0.06);
      n.att = a;
      var env;
      if (n.relAge >= 0) {
        var rr = 1 - (n.age - n.relAge) / n.relDur;
        env = rr > 0 ? n.relLevel * rr * rr : 0;
      } else {
        var nat = 1 - n.age / n.life;
        env = nat > 0 ? nat * nat : 0;
        if (n.held && sawNoteOff) { var sus = 0.42 * (1 - n.age / 14); if (sus > env) env = sus; }
        env *= a;
      }
      n.env = env;
      n.s = n.vc * env;
      if (env <= 0.0005 && n.age >= n.life) n.active = false;
    }

    function update(dt) {
      var tn = now();
      // beat clock
      var c = null;
      if (clockFn) { try { c = clockFn(); } catch (e) { c = null; } }
      var playing = !!(c && c.playing && isFinite(c.beat));
      if (playing) { beat = +c.beat; if (isFinite(c.bpm) && c.bpm > 0) bpm = +c.bpm; }
      playAmt += ((playing ? 1 : 0) - playAmt) * expK(dt, playing ? 0.25 : 0.8);
      var ph = beat - Math.floor(beat);
      var b4 = beat % 4; if (b4 < 0) b4 += 4;
      var bph = b4 / 4;
      var beatRaw = smooth01(ph / 0.1) * Math.pow(1 - ph, 2.2);
      var barRaw = smooth01(bph / 0.03) * Math.pow(1 - bph, 3.5);
      var raw = (0.55 * beatRaw + 0.55 * barRaw) * playAmt + (1 - playAmt) * 0.12 * (0.5 - 0.5 * Math.cos(t * TAU / 9));
      swell += (raw - swell) * expK(dt, raw > swell ? 0.03 : 0.08);
      var braw = barRaw * playAmt;
      barSwell += (braw - barSwell) * expK(dt, braw > barSwell ? 0.04 : 0.12);

      // kick breath and sparkles
      kickTgt *= Math.exp(-dt / 0.22);
      kick += (kickTgt - kick) * expK(dt, 0.045);
      for (var k = 0; k < 4; k++) spk[k * 4] *= Math.exp(-dt / spkTau[k] || 0);

      // level & spectrum (stale input decays to quiet)
      if (tn - lvlStamp > 1200) lvlTgt *= Math.exp(-dt / 0.6);
      lvl += (lvlTgt - lvl) * expK(dt, lvlTgt > lvl ? 0.08 : 0.35);
      for (var b = 0; b < 4; b++) {
        if (tn - specStamp > 1200) specTgt[b] *= Math.exp(-dt / 0.6);
        spec[b] += (specTgt[b] - spec[b]) * expK(dt, specTgt[b] > spec[b] ? 0.07 : 0.3);
      }
      var lvlP = clamp01(Math.sqrt(lvl) * 1.4);

      // palette & mood glide (OKLCH, shortest hue path)
      var kp = expK(dt, 0.45), moving = false;
      for (var j = 0; j < 4; j++) {
        var o = j * 3;
        var dL = palTgt[o] - palCur[o], dC = palTgt[o + 1] - palCur[o + 1], dH = hueDelta(palCur[o + 2], palTgt[o + 2]);
        if (Math.abs(dL) > 1e-4 || Math.abs(dC) > 1e-4 || Math.abs(dH) > 0.05) {
          palCur[o] += dL * kp; palCur[o + 1] += dC * kp; palCur[o + 2] = wrapHue(palCur[o + 2] + dH * kp);
          moving = true;
        }
        mood[j] += (moodTgt[j] - mood[j]) * kp;
      }
      if (moving || palMoving) {
        for (var q = 0; q < 4; q++) oklchToLin(palCur[q * 3], palCur[q * 3 + 1], palCur[q * 3 + 2], pal, q * 3);
        palMoving = moving;
      }

      // idle "dreaming": faint ghost notes after a long silence
      idleNoteT += dt;
      if (dream && idleNoteT > 7) {
        dreamT -= dt;
        if (dreamT <= 0) {
          var sc = chordMinorish ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
          var m = 48 + chordRoot + sc[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 3);
          spawnNote(m, 0.35 + Math.random() * 0.35, Math.random() < 0.7 ? 0 : 1, true);
          dreamT = 2.4 + Math.random() * 3.2;
        }
      }

      // notes
      var gr = 0, gg = 0, gb = 0;
      for (var i = 0; i < NN; i++) {
        var n = notes[i];
        if (!n.active) continue;
        updateNote(n, dt);
        gr += n.col[0] * n.s; gg += n.col[1] * n.s; gb += n.col[2] * n.s;
      }
      var kg = expK(dt, 0.6);
      glow[0] += (gr * 0.5 - glow[0]) * kg; glow[1] += (gg * 0.5 - glow[1]) * kg; glow[2] += (gb * 0.5 - glow[2]) * kg;

      // time flows a touch faster when it's loud; drift camera speed follows tempo a little
      t += dt * (0.9 + 0.3 * lvlP);
      var sp = 0.3 + 0.1 * playAmt * clamp(bpm / 110, 0.6, 1.5) + 0.12 * lvlP;
      camSpeed += (sp - camSpeed) * expK(dt, 1.5);
      camZ += camSpeed * dt;
      if (camZ > 20000) camZ -= 20000 - 20000 % 1.7;
      fadeIn = smooth01((tn - startT) / 1600);
      warmT += dt;
      return lvlP;
    }

    function packNotes() {
      var asp = bw / bh;
      for (var i = 0; i < 16; i++) {
        var n = notes[i], o = i * 4;
        if (i >= NN || !n.active) { NB[o] = NB[o + 1] = NB[o + 2] = NB[o + 3] = 0; NC[o] = NC[o + 1] = NC[o + 2] = NC[o + 3] = 0; continue; }
        NC[o] = n.col[0]; NC[o + 1] = n.col[1]; NC[o + 2] = n.col[2];
        var grow = smooth01(n.age / n.life);
        if (mode === 0) {
          NB[o] = (n.spread - 0.5) * asp * 0.86;
          NB[o + 1] = (n.pn - 0.5) * 0.78 + n.age * 0.012;
          NB[o + 2] = n.size * (0.05 + 0.035 * n.vel) * (1 + 0.5 * grow);
          NB[o + 3] = n.s;
          NC[o + 3] = n.age;
        } else if (mode === 1) {
          var r = 0.05 + 0.5 * n.pn + n.age * 0.02;
          NB[o] = r * Math.cos(n.kang); NB[o + 1] = r * Math.sin(n.kang);
          NB[o + 2] = n.size * (0.045 + 0.03 * n.vel) * (1 + 0.6 * grow);
          NB[o + 3] = n.s;
          NC[o + 3] = n.age;
        } else {
          var pr = n.age / n.life;
          NB[o] = n.dx * n.R; NB[o + 1] = n.dy * n.R; NB[o + 2] = n.size;
          NB[o + 3] = n.vc * n.att * (1 - smooth01((pr - 0.7) / 0.3));
          NC[o + 3] = clamp01(pr);
        }
      }
    }

    /* ---------------- GL render */

    function setCommon(P, lvlP) {
      var u = P.u;
      gl.uniform2f(u.uRes, bw, bh);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uFade, fadeIn);
      gl.uniform4f(u.uPulse, swell, barSwell, kick, lvlP);
      gl.uniform4f(u.uSpec, spec[0], spec[1], spec[2], spec[3]);
      gl.uniform4f(u.uMood, mood[0], mood[1], mood[2], mood[3]);
      gl.uniform3f(u.uGlow, glow[0], glow[1], glow[2]);
      gl.uniform3fv(u.uPal, pal);
      if (u.uN) gl.uniform4fv(u.uN, NN === 16 ? NB : NB.subarray(0, NN * 4));
      if (u.uC) gl.uniform4fv(u.uC, NN === 16 ? NC : NC.subarray(0, NN * 4));
      if (u.uSpk) gl.uniform4fv(u.uSpk, spk);
    }

    function draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

    function renderGL(dt, lvlP) {
      if (!glOK || gl.isContextLost()) return;
      if (blit2D) { render2D(off2Dctx, bw, bh, lvlP); blitCanvas(); return; }
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      var P, m = mode;
      if (m === 0 && !progs.bloom) m = progs.kaleido ? 1 : 2;
      if (m === 1 && !progs.kaleido) m = progs.drift ? 2 : 0;
      if (m === 2 && !progs.drift) m = progs.bloom ? 0 : 1;
      if (m === 0) {
        if (progs.sim && sim) {
          var dst = sim.cur ^ 1;
          gl.bindFramebuffer(gl.FRAMEBUFFER, sim.t[dst].fb);
          gl.viewport(0, 0, sim.w, sim.h);
          P = progs.sim; gl.useProgram(P.p); setCommon(P, lvlP);
          var d60 = Math.min(dt * 60, 6);
          gl.uniform2f(P.u.uTexel, 1 / sim.w, 1 / sim.h);
          gl.uniform1f(P.u.uAsp, sim.w / sim.h);
          gl.uniform1f(P.u.uDt60, d60);
          gl.uniform1f(P.u.uDecay, Math.pow(0.985, d60));
          gl.uniform1f(P.u.uInject, 0.003 * (1 + 7 * (1 - smooth01(warmT / 1.8))));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sim.t[sim.cur].tex);
          draw();
          sim.cur = dst;
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.viewport(0, 0, bw, bh);
        P = progs.bloom; gl.useProgram(P.p); setCommon(P, lvlP);
        gl.activeTexture(gl.TEXTURE0);
        if (sim) gl.bindTexture(gl.TEXTURE_2D, sim.t[sim.cur].tex);
        draw();
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, bw, bh);
        P = m === 1 ? progs.kaleido : progs.drift;
        gl.useProgram(P.p); setCommon(P, lvlP);
        if (m === 2) gl.uniform1f(P.u.uCamZ, camZ);
        draw();
      }
      // mode crossfade: the last frame of the previous look fades out on top
      if (snapOn && progs.blit) {
        snapT += dt;
        var al = 1 - smooth01(snapT / 1.3);
        if (al <= 0.003) snapOn = false;
        else {
          gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(progs.blit.p);
          gl.uniform1f(progs.blit.u.uAlpha, al);
          gl.uniform1f(progs.blit.u.uScale, 1 + 0.05 * snapT);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, snapTex);
          draw();
          gl.disable(gl.BLEND);
        }
      }
      if (pendingMode >= 0) {
        if (progs.blit) {
          if (!snapTex) snapTex = makeTex(0, 0, gl.UNSIGNED_BYTE, gl.LINEAR);
          gl.bindTexture(gl.TEXTURE_2D, snapTex);
          gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, bw, bh, 0);
          snapOn = true; snapT = 0;
        }
        enterMode(pendingMode);
        pendingMode = -1;
      }
    }

    function blitCanvas() {
      if (!progs.blit || !off2D) return;
      if (!tex2D) tex2D = makeTex(0, 0, gl.UNSIGNED_BYTE, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, bw, bh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex2D);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off2D);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.useProgram(progs.blit.p);
      gl.uniform1f(progs.blit.u.uAlpha, 1);
      gl.uniform1f(progs.blit.u.uScale, 1);
      draw();
    }

    /* ---------------- Canvas 2D fallback */


    function srgb(v) { return Math.round(255 * Math.pow(clamp01(v), 1 / 2.2)); }

    function makeSprite(r, g, b) {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var x = c.getContext('2d');
      var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      var rgb = r + ',' + g + ',' + b;
      gr.addColorStop(0, 'rgba(' + rgb + ',1)');
      gr.addColorStop(0.16, 'rgba(' + rgb + ',0.7)');
      gr.addColorStop(0.42, 'rgba(' + rgb + ',0.2)');
      gr.addColorStop(0.7, 'rgba(' + rgb + ',0.05)');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      return c;
    }

    function init2D() {
      if (blit2D) {
        off2D = document.createElement('canvas'); off2D.width = Math.max(16, bw); off2D.height = Math.max(16, bh);
        off2Dctx = off2D.getContext('2d', { alpha: false });
      }
      sprites = [];
      for (var pc = 0; pc < 12; pc++) sprites.push(makeSprite(srgb(NOTE_LIN[pc * 3]), srgb(NOTE_LIN[pc * 3 + 1]), srgb(NOTE_LIN[pc * 3 + 2])));
      whiteSprite = makeSprite(255, 248, 240);
      dots = new Float32Array(60 * 4);
      for (var i = 0; i < 60; i++) { dots[i * 4] = Math.random(); dots[i * 4 + 1] = Math.random(); dots[i * 4 + 2] = Math.random(); dots[i * 4 + 3] = Math.random(); }
    }

    function refreshPalSprites() {
      palSprites = [];
      for (var k = 1; k < 4; k++) palSprites.push(makeSprite(srgb(pal[k * 3]), srgb(pal[k * 3 + 1]), srgb(pal[k * 3 + 2])));
      palSpriteAge = 0;
    }

    function rgbStr(k, mul) {
      return 'rgb(' + srgb(pal[k * 3] * mul) + ',' + srgb(pal[k * 3 + 1] * mul) + ',' + srgb(pal[k * 3 + 2] * mul) + ')';
    }

    function render2D(c, W, H, lvlP) {
      if (!c) return;
      palSpriteAge += 1;
      if (!palSprites || (palMoving && palSpriteAge > 12)) refreshPalSprites();
      var cx = W / 2, cy = H / 2, U = H;
      var gain = (0.85 + 0.25 * lvlP) * (1 + 0.12 * swell) * fadeIn;
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.setTransform(1, 0, 0, 1, 0, 0);
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgbStr(0, 1.25 * fadeIn));
      g.addColorStop(1, rgbStr(0, 0.6 * fadeIn));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      var br = 1 + 0.03 * kick + 0.012 * swell;
      c.setTransform(br, 0, 0, br, cx * (1 - br), cy * (1 - br));
      c.globalCompositeOperation = 'lighter';
      var i, n, s, x, y, R;
      // nebula
      for (var k = 0; k < 3; k++) {
        x = cx + U * 0.45 * Math.sin(t * 0.05 * (k + 1) + k * 2.1);
        y = cy + U * 0.22 * Math.cos(t * 0.043 * (k + 1.3) + k);
        R = U * (0.75 + 0.15 * Math.sin(t * 0.1 + k));
        c.globalAlpha = 0.16 * gain;
        c.drawImage(palSprites[k], x - R, y - R, 2 * R, 2 * R);
      }
      var spr;
      if (mode === 1) {
        var seg = TAU / FOLDS;
        c.save();
        c.translate(cx, cy); c.rotate(t * 0.021);
        var zs = 1 - 0.05 * swell;
        c.scale(zs, zs);
        for (var f = 0; f < FOLDS; f++) {
          for (var mir = -1; mir <= 1; mir += 2) {
            c.save(); c.rotate(f * seg); c.scale(1, mir);
            for (k = 0; k < 2; k++) {
              R = U * 0.18; x = U * (0.22 + 0.12 * k + 0.03 * Math.sin(t * 0.2 + k)); y = U * 0.05 * (1 + k);
              c.globalAlpha = 0.22 * gain; c.drawImage(palSprites[k + 1], x - R * 1.6, y - R * 0.6, R * 3.2, R * 1.2);
            }
            for (i = 0; i < NN; i++) {
              n = notes[i]; if (!n.active || n.s < 0.002) continue;
              s = n.s * gain; R = U * n.size * (0.09 + 0.05 * n.vel) * (1 + 0.6 * smooth01(n.age / n.life));
              var rr = U * (0.05 + 0.5 * n.pn + n.age * 0.02);
              c.globalAlpha = clamp01(s * 0.8);
              c.drawImage(sprites[n.midi % 12], rr * Math.cos(n.kang) - R, rr * Math.sin(n.kang) - R, 2 * R, 2 * R);
            }
            c.restore();
          }
        }
        c.restore();
      } else if (mode === 2) {
        var TR = 0.42 * U, D = 1.7;
        var vx = cx + U * 0.07 * Math.sin(t * 0.041), vy = cy + U * 0.045 * Math.cos(t * 0.033);
        var base = camZ % D;
        c.lineCap = 'round';
        for (k = 0; k < 9; k++) {
          var z = (k + 1) * D - base;
          var rz = TR / z;
          var fog = Math.exp(-z * 0.16) * smooth01((z - 0.15) / 0.55);
          c.globalAlpha = clamp01(0.55 * fog * (0.6 + 0.6 * swell) * gain);
          c.strokeStyle = rgbStr(k % 2 ? 2 : 3, 1);
          c.lineWidth = Math.max(1, 0.05 * U / z);
          c.beginPath(); c.arc(vx, vy, rz, 0, TAU); c.stroke();
        }
        for (i = 0; i < NN; i++) {
          n = notes[i]; if (!n.active) continue;
          var pr = clamp01(n.age / n.life);
          var zi = 2.4 * Math.pow(0.05, pr);
          s = n.vc * n.att * (1 - smooth01((pr - 0.7) / 0.3)) * gain;
          R = U * n.size * (0.03 / zi + 0.02);
          x = vx + n.dx * n.R * TR / zi; y = vy - n.dy * n.R * TR / zi;
          c.globalAlpha = clamp01(s); c.drawImage(sprites[n.midi % 12], x - R, y - R, 2 * R, 2 * R);
        }
      } else {
        for (i = 0; i < NN; i++) {
          n = notes[i]; if (!n.active || n.s < 0.002) continue;
          s = n.s * gain;
          R = U * n.size * (0.1 + 0.07 * n.vel) * (1 + 0.8 * smooth01(n.age / n.life));
          x = cx + U * (n.spread - 0.5) * (W / H) * 0.86;
          y = cy - U * ((n.pn - 0.5) * 0.78 + n.age * 0.012);
          spr = sprites[n.midi % 12];
          c.globalAlpha = clamp01(s * 0.35); c.drawImage(spr, x - R * 2.4, y - R * 2.4, R * 4.8, R * 4.8);
          c.globalAlpha = clamp01(s * 0.9); c.drawImage(spr, x - R, y - R, 2 * R, 2 * R);
        }
      }
      // particles
      for (i = 0; i < 60; i++) {
        var o = i * 4;
        x = ((dots[o] + 0.004 * t * (0.5 + dots[o + 2]) + 0.02 * Math.sin(t * 0.2 + i)) % 1) * W;
        y = (1 - ((dots[o + 1] + 0.01 * t * (0.3 + dots[o + 3])) % 1)) * H;
        R = U * (0.004 + 0.004 * dots[o + 2]);
        c.globalAlpha = clamp01((0.25 + 0.35 * dots[o + 3]) * (0.6 + 0.4 * Math.sin(t * (0.4 + dots[o]) + i)) * gain);
        c.drawImage(whiteSprite, x - R, y - R, 2 * R, 2 * R);
      }
      // drum sparkles
      for (k = 0; k < 4; k++) {
        var e = spk[k * 4]; if (e < 0.01) continue;
        var seed = spk[k * 4 + 1], cnt = Math.round(spk[k * 4 + 3] * 160);
        for (i = 0; i < cnt; i++) {
          var h1 = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; h1 -= Math.floor(h1);
          var h2 = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345; h2 -= Math.floor(h2);
          R = U * 0.012 * spk[k * 4 + 2];
          c.globalAlpha = clamp01(e * 0.9);
          c.drawImage(whiteSprite, h1 * W - R, h2 * H - R, 2 * R, 2 * R);
        }
      }
      // vignette
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      var vg = c.createRadialGradient(cx, cy, U * 0.35, cx, cy, U * 1.05);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
    }

    /* ---------------- loop & perf */

    function adapt(dt) {
      var ms = dt * 1000;
      if (ms > 0 && ms < 1000) emaMs += (Math.min(ms, 250) - emaMs) * 0.06;
      if (!adaptive || !isGL || blit2D) return;
      sinceQ += dt;
      if (downBlock > 0) downBlock -= dt;
      goodT = emaMs < 17.6 ? goodT + dt : 0;
      if (probe) {
        if (sinceQ < 1.2) return;
        if (emaMs < probe.ms * 0.93) { probe = null; }
        else if (probe.steps < 2 && qi < QUALITY.length - 1) { probe.steps++; setQuality(qi + 1); sinceQ = 0; return; }
        else { setQuality(probe.qi); probe = null; downBlock = 90; sinceQ = 0; return; }
      }
      if (emaMs > 20 && sinceQ > 0.8 && downBlock <= 0 && qi < QUALITY.length - 1) {
        if (t - lastUpAt < 4) upWait = Math.min(upWait * 2, 60);
        probe = { qi: qi, ms: emaMs, steps: 1 };
        setQuality(qi + 1); sinceQ = 0; goodT = 0;
      } else if (goodT > upWait && sinceQ > 1 && qi > 0) {
        setQuality(qi - 1); sinceQ = 0; goodT = 0; lastUpAt = t;
      }
    }

    function frame(ts) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      var dt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
      lastTs = ts;
      if (!(dt > 0)) dt = 1 / 60;
      var dtc = Math.min(dt, 0.2);
      fpsAcc += dt; fpsFrames++;
      if (fpsAcc >= 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
      if (canvas.width <= 16 || !(cssW > 0)) { resize(); }
      var lvlP = update(dtc);
      if (cssW > 0 && cssH > 0) {
        packNotes();
        if (isGL) renderGL(dtc, lvlP);
        else render2D(ctx2d, canvas.width, canvas.height, lvlP);
        frames++;
      }
      adapt(dt);
    }

    function start() {
      if (running) return;
      running = true; lastTs = 0;
      if (!startT) startT = now();
      resize();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function destroy() {
      stop();
      window.removeEventListener('resize', resize, false);
      if (ro) ro.disconnect();
      if (isGL) {
        canvas.removeEventListener('webglcontextlost', onLost, false);
        canvas.removeEventListener('webglcontextrestored', onRestored, false);
      }
    }

    var api = {
      start: start,
      stop: stop,
      resize: resize,
      setMode: setMode,
      modes: MODES.map(function (m) { return { id: m.id, name: m.name }; }),
      beatClock: beatClock,
      note: note,
      noteOff: noteOff,
      chord: chord,
      level: level,
      spectrum: spectrum,
      hit: hit,
      destroy: destroy
    };
    Object.defineProperty(api, 'fps', { get: function () { return Math.round(fps * 10) / 10; }, enumerable: true });
    Object.defineProperty(api, 'mode', { get: function () { return MODES[pendingMode >= 0 ? pendingMode : mode].id; }, enumerable: true });
    Object.defineProperty(api, 'info', {
      get: function () {
        return { renderer: isGL ? (blit2D ? 'webgl-2d-blit' : 'webgl') : 'canvas2d', width: bw, height: bh,
          quality: isGL ? QUALITY[qi] : 1, frameMs: Math.round(emaMs * 10) / 10, ink: isGL ? (inkLowp ? 'rgba8' : 'half-float') : 'none', notes: NN };
      }, enumerable: true
    });
    Object.defineProperty(api, '_debug', { get: function () { return { pal: Array.prototype.slice.call(pal), palLCH: Array.prototype.slice.call(palCur), glow: Array.prototype.slice.call(glow), swell: swell, kick: kick, t: t }; } });
    return api;
  }

  window.NBVisuals = { create: create, modes: MODES.map(function (m) { return { id: m.id, name: m.name }; }) };
})();
