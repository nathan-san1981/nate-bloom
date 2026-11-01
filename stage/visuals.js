/*
 * NBVisuals: music-driven visuals engine (WebGL 1, Canvas 2D fallback).
 * Classic script, no dependencies. Defines window.NBVisuals.
 *
 *   var vis = NBVisuals.create(canvas [, options]);
 *   vis.start(); vis.setMode(id);   // ids: see MODES below / vis.modes (id, name, desc)
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

  // One entry per look. prog: key in PROGRAMS (below); sim: key in SIMS for a feedback pass;
  // layout: how notes are positioned for the shader (0 plane, 1 polar/folded, 2 depth);
  // look2d: which Canvas-2D fallback drawing to use (0 bloom, 1 kaleido, 2 drift).
  var MODES = [
    { id: 'bloom', name: 'Bloom', desc: 'Ink blooms spread and drift through a slow current; each note drops a new colour in.', prog: 'bloom', sim: 'ink', layout: 0, look2d: 0 },
    { id: 'kaleido', name: 'Kaleido', desc: 'A six-fold mirrored colour field folds and unfolds with the chords.', prog: 'kaleido', layout: 1, look2d: 1 },
    { id: 'drift', name: 'Drift', desc: 'Flight down a soft tunnel of rings and aurora ribbons; notes pass by as lights.', prog: 'drift', layout: 2, look2d: 2 },
    { id: 'lava', name: 'Lava', desc: 'Molten metaballs rise, merge and split in a glass lamp lit from below; notes are new blobs.', prog: 'lava', layout: 0, look2d: 0 },
    { id: 'bauhaus', name: 'Bauhaus', desc: 'Flat paper, black rules and primary blocks; the composition re-cuts itself on every bar.', prog: 'bauhaus', layout: 0, look2d: 0 },
    { id: 'mosaic', name: 'Mosaic', desc: 'Backlit stained glass in leaded cells; every kick shatters the panes outward and they settle back.', prog: 'mosaic', layout: 0, look2d: 0 },
    { id: 'gridrun', name: 'Gridrun', desc: 'A neon wireframe terrain streams under you toward a banded sun; notes stand up as light pillars.', prog: 'gridrun', layout: 2, look2d: 2 },
    { id: 'swarm', name: 'Swarm', desc: 'A murmuration wheels over a dusk sky, folding toward the notes and scattering on each kick.', prog: 'swarm', layout: 0, look2d: 0 },
    { id: 'coral', name: 'Coral', desc: 'Living reaction-diffusion growth: notes seed colonies that spread, branch and crowd each other.', prog: 'coral', sim: 'rd', layout: 0, look2d: 0 },
    { id: 'hallway', name: 'Hallway', desc: 'A slow walk down a concrete corridor of neon octagons; kicks flash the frames and notes race down them toward you.', prog: 'hallway', layout: 2, look2d: 2 },
    { id: 'scope', name: 'Scope', desc: 'A big green oscilloscope: the chord and every note are sine traces with phosphor trails, and hits tear the raster.', prog: 'scope', layout: 0, look2d: 0 },
    { id: 'roots', name: 'Roots', desc: 'A slow creep through a cavern of glowing root networks; kicks pulse the veins and notes light new ones in their colour.', prog: 'roots', layout: 0, look2d: 0 },
    { id: 'factory', name: 'Factory', desc: 'A derelict hall with an aurora pouring through its broken windows; lamps swing, the oil puddle ripples with the kick, notes drift up the aisle as lights.', prog: 'factory', layout: 2, look2d: 2 },
    { id: 'void', name: 'Void', desc: 'Translucent tendrils drift in black water, their nerve nets flashing with the kick; notes are bioluminescent flares.', prog: 'void', layout: 0, look2d: 0 }
  ];
  var MODE_INDEX = {};
  for (var mdi = 0; mdi < MODES.length; mdi++) MODE_INDEX[MODES[mdi].id] = mdi;
  function modeList() { return MODES.map(function (m) { return { id: m.id, name: m.name, desc: m.desc }; }); }
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
    'uniform vec4 uBeat;',  // beat count, bar count, beat phase, playing amount
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

  // Lava: metaballs in a lamp. One pass accumulates the Gaussian field, its analytic gradient and a
  // weighted colour, so the glossy lighting needs no extra field evaluations.
  var FS_LAVA = [
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float asp = uRes.x / uRes.y;',
    '  float t = uTime;',
    '  vec2 p = p0 + 0.018 * uPulse.z * vec2(sin(p0.y * 11.0 + t * 3.0), cos(p0.x * 9.0 + t * 2.3));',
    '  vec3 bg = uPal[0] * (0.3 + 0.45 * smoothstep(0.7, -0.6, p0.y));',
    '  bg += uPal[1] * 0.4 * exp(-pow((p0.y + 0.58) * 1.7, 2.0)) * (0.75 + 0.6 * uPulse.z + 0.35 * uSpec.x);',
    '  bg += uPal[2] * 0.05 * exp(-pow((p0.x + 0.33 * asp) * 5.0, 2.0));',
    '  bg += uGlow * 0.05;',
    '  float F = 0.0, W = 0.0001;',
    '  vec2 G = vec2(0.0);',
    '  vec3 C = vec3(0.0);',
    '  for (int i = 0; i < 8; i++) {',
    '    float fi = float(i);',
    '    float h = hash12(vec2(fi * 3.1 + 0.7, 7.7));',
    '    float h2 = fract(h * 13.7), h3 = fract(h * 51.3);',
    '    float sp = 0.05 + 0.055 * h2;',
    '    float y = sin(t * sp + h * 6.2832) * 0.5;',
    '    float x = (h3 - 0.5) * 1.15 * asp + 0.07 * sin(t * 0.13 + fi * 1.9);',
    '    x += 0.025 * sin(t * (0.9 + h) + fi * 2.0) * uMood.z;',
    '    vec4 sel = step(abs(vec4(0.0, 1.0, 2.0, 3.0) - mod(fi, 4.0)), vec4(0.5));',
    '    float band = dot(uSpec, sel);',
    '    float r = (0.1 + 0.085 * h2) * (1.0 + 0.3 * band) * (1.0 + 0.1 * uPulse.z + 0.06 * uPulse.x);',
    '    vec2 d = p - vec2(x, y);',
    '    d.y *= 1.0 - 0.18 * cos(t * sp + h * 6.2832);',
    '    float e = exp(-dot(d, d) / (r * r));',
    '    F += e; G += e * d / (r * r);',
    '    C += mix(uPal[1], uPal[2], fract(h * 3.3)) * e; W += e;',
    '  }',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    float r = n.z * 1.7;',
    '    vec2 d = p - n.xy;',
    '    float e = n.w * exp(-dot(d, d) / (r * r));',
    '    F += e; G += e * d / (r * r);',
    '    C += uC[i].rgb * 1.3 * e; W += e;',
    '  }',
    '  vec3 blob = C / W;',
    '  float cover = smoothstep(0.42, 0.56, F);',
    '  vec3 N = normalize(vec3(G * 0.42 / sqrt(max(F - 0.4, 0.015)), 1.0));',
    '  vec3 L = normalize(vec3(-0.45, 0.75, 0.55));',
    '  float diff = max(dot(N, L), 0.0);',
    '  float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);',
    '  float rim = pow(1.0 - N.z, 3.0);',
    '  vec3 lava = blob * (0.35 + 0.6 * diff) * (0.8 + 0.6 * smoothstep(0.35, -0.6, p0.y));',
    '  lava += uPal[3] * spec * 0.6 + mix(uPal[3], blob, 0.6) * rim * 0.4;',
    '  lava *= 1.0 + 0.25 * uPulse.w;',
    '  vec3 col = bg + blob * 0.14 * smoothstep(0.08, 0.42, F);',
    '  col = mix(col, lava, cover);',
    '  col += sparkles(p0) * 0.5;',
    '  col *= 1.0 - 0.4 * smoothstep(0.45, 1.1, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Bauhaus: a hashed non-uniform grid of paper and primary blocks, re-cut on every bar and snapped on every beat.
  var FS_BAUHAUS = [
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float asp = uRes.x / uRes.y;',
    '  float t = uTime;',
    '  float playing = smoothstep(0.3, 0.7, uBeat.w);',
    '  float seed = mix(floor(t / 7.0), uBeat.y, playing);',
    '  float beatI = mix(floor(t / 1.75), floor(uBeat.x), playing);',
    '  float beatPh = mix(fract(t / 1.75), uBeat.z, playing);',
    '  float snap = exp(-beatPh * 7.0);',
    '  float sc = (1.0 - 0.03 * uPulse.z) * (1.0 + 0.02 * snap);',
    '  vec2 p = rot(0.025 * uMood.z * sin(t * 0.37)) * p0 / sc;',
    '  vec2 q = vec2(p.x / asp * 0.5 + 0.5, p.y * 0.5 + 0.5);',
    '  float nc = 3.0 + floor(hash12(vec2(seed, 1.0)) * 2.99);',
    '  float tot = 0.0;',
    '  for (int i = 0; i < 5; i++) { if (float(i) < nc) tot += 0.45 + hash12(vec2(seed * 1.3, 10.0 + float(i))); }',
    '  float x0 = 0.0, x1 = 1.0, ci = 0.0, acc = 0.0;',
    '  for (int i = 0; i < 5; i++) {',
    '    if (float(i) >= nc) break;',
    '    float w = (0.45 + hash12(vec2(seed * 1.3, 10.0 + float(i)))) / tot;',
    '    if (q.x >= acc && q.x < acc + w) { x0 = acc; x1 = acc + w; ci = float(i); }',
    '    acc += w;',
    '  }',
    '  float nr = 2.0 + floor(hash12(vec2(seed * 0.7, 20.0 + ci)) * 2.99);',
    '  tot = 0.0;',
    '  for (int i = 0; i < 4; i++) { if (float(i) < nr) tot += 0.45 + hash12(vec2(seed * 0.9 + ci, 30.0 + float(i))); }',
    '  float y0 = 0.0, y1 = 1.0, ri = 0.0;',
    '  acc = 0.0;',
    '  for (int i = 0; i < 4; i++) {',
    '    if (float(i) >= nr) break;',
    '    float w = (0.45 + hash12(vec2(seed * 0.9 + ci, 30.0 + float(i)))) / tot;',
    '    if (q.y >= acc && q.y < acc + w) { y0 = acc; y1 = acc + w; ri = float(i); }',
    '    acc += w;',
    '  }',
    '  vec2 cid = vec2(ci, ri);',
    '  float hs = hash12(cid * 3.7 + seed * 0.11 + 5.0);',
    '  float sub = 0.0;',
    '  if (hs > 0.58) {',
    '    if ((x1 - x0) * asp > (y1 - y0)) { float xm = mix(x0, x1, 0.35 + 0.3 * fract(hs * 7.0)); if (q.x < xm) x1 = xm; else { x0 = xm; sub = 1.0; } }',
    '    else { float ym = mix(y0, y1, 0.35 + 0.3 * fract(hs * 7.0)); if (q.y < ym) y1 = ym; else { y0 = ym; sub = 1.0; } }',
    '  }',
    '  vec2 cid2 = cid + vec2(sub * 0.5, seed * 0.37);',
    '  float hc = hash12(cid2 * 2.1 + 9.0);',
    '  vec3 paper = mix(vec3(1.55, 1.45, 1.25), uPal[3] * 1.6, 0.18);',
    '  paper = mix(paper, vec3(0.22, 0.2, 0.19), uMood.z * 0.75);',
    '  vec3 col = paper;',
    '  if (hc > 0.92) col = vec3(0.02);',
    '  else if (hc > 0.80) col = uPal[0] * 1.4;',
    '  else if (hc > 0.66) col = uPal[2] * 1.3;',
    '  else if (hc > 0.52) col = uPal[1] * 1.3;',
    '  float flip = step(0.9, hash12(cid2 * 1.7 + beatI * 0.713));',
    '  col = mix(col, uPal[2] * 1.4, flip * (0.5 + 0.5 * snap));',
    '  vec2 X0 = vec2((x0 - 0.5) * 2.0 * asp, (y0 - 0.5) * 2.0), X1 = vec2((x1 - 0.5) * 2.0 * asp, (y1 - 0.5) * 2.0);',
    '  vec2 cc = 0.5 * (X0 + X1), ext = 0.5 * (X1 - X0);',
    '  if (hc > 0.3 && hc < 0.52) {',
    '    vec4 sel = step(abs(vec4(0.0, 1.0, 2.0, 3.0) - mod(ci + ri, 4.0)), vec4(0.5));',
    '    float band = dot(uSpec, sel);',
    '    float rad = min(ext.x, ext.y) * (0.22 + 0.68 * band) * (1.0 + 0.08 * uPulse.x);',
    '    float dc = length(p - cc) - rad;',
    '    vec3 circ = hc > 0.41 ? uPal[1] * 1.3 : vec3(0.03);',
    '    col = mix(col, circ, smoothstep(0.004, -0.004, dc));',
    '  }',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    float inside = step(X0.x, n.x) * step(n.x, X1.x) * step(X0.y, n.y) * step(n.y, X1.y);',
    '    col = mix(col, uC[i].rgb * 1.5, inside * min(n.w * 1.3, 1.0) * 0.9);',
    '  }',
    '  float px = 1.0 / uRes.y;',
    '  float dist = min(min(p.x - X0.x, X1.x - p.x), min(p.y - X0.y, X1.y - p.y));',
    '  float lw = 0.0085 + 0.006 * uMood.z + 0.004 * uPulse.x;',
    '  float line = 1.0 - smoothstep(lw - px, lw + px, dist);',
    '  col = mix(col, vec3(0.012 + 0.08 * snap * uPulse.y), line);',
    '  col *= 0.95 + 0.07 * hash12(fc * 0.37 + floor(t * 3.0)) + 0.05 * fbm3(p * 2.5);',
    '  col += sparkles(p0) * 0.35;',
    '  col *= 1.0 - 0.25 * smoothstep(0.6, 1.25, length(p0 * vec2(0.75, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Mosaic: backlit Voronoi glass with lead lines; kicks throw the cells outward from the centre, cracks rise with tension.
  var FS_MOSAIC = [
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float scale = 4.2;',
    '  vec2 p = p0 * (1.0 - 0.02 * uPulse.z);',
    '  vec2 g = p * scale;',
    '  vec2 ig = floor(g), fg = fract(g);',
    '  float F1 = 9.0, F2 = 9.0;',
    '  vec2 c1 = vec2(0.0), id1 = vec2(0.0);',
    '  for (int j = -1; j <= 1; j++) {',
    '    for (int i = -1; i <= 1; i++) {',
    '      vec2 o = vec2(float(i), float(j));',
    '      vec2 cid = ig + o;',
    '      vec2 h = hash22(cid);',
    '      vec2 cc = o + 0.15 + 0.7 * h;',
    '      cc += 0.05 * vec2(sin(t * 0.37 + h.x * 6.28), cos(t * 0.31 + h.y * 6.28));',
    '      vec2 world = (ig + cc) / scale;',
    '      float k = uPulse.z * (0.45 + 0.6 * hash12(cid + 3.3));',
    '      cc += world * k * 0.45 + (hash22(cid + 9.1) - 0.5) * k * 0.6;',
    '      vec2 d = cc - fg;',
    '      float dist = dot(d, d);',
    '      if (dist < F1) { F2 = F1; F1 = dist; c1 = cc; id1 = cid; }',
    '      else if (dist < F2) F2 = dist;',
    '    }',
    '  }',
    '  float edge = sqrt(F2) - sqrt(F1);',
    '  float hh = hash12(id1 * 1.7 + 0.5);',
    '  vec3 glass = uPal[1];',
    '  if (hh > 0.78) glass = uPal[0] * 2.6;',
    '  else if (hh > 0.56) glass = uPal[3] * 0.9;',
    '  else if (hh > 0.3) glass = uPal[2];',
    '  glass *= 0.7 + 0.6 * fract(hh * 7.3);',
    '  glass = mix(glass, uPal[0] * 1.5, uMood.z * 0.45);',
    '  float streak = fbm3(p * 7.0 + id1 * 3.1 + vec2(0.0, t * 0.02));',
    '  glass *= 0.8 + 0.5 * streak;',
    '  vec2 sun = vec2(0.5 * sin(t * 0.09), 0.3 * cos(t * 0.07));',
    '  vec2 cw = (ig + c1) / scale;',
    '  float light = 0.55 + 0.6 * exp(-dot(cw - sun, cw - sun) * 2.2);',
    '  vec4 sel = step(abs(vec4(0.0, 1.0, 2.0, 3.0) - floor(fract(hh * 3.1) * 3.99)), vec4(0.5));',
    '  light += 0.55 * dot(uSpec, sel) + 0.25 * uPulse.x;',
    '  vec3 col = glass * light;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    vec2 d = cw - n.xy;',
    '    float r = n.z * 2.6;',
    '    col += uC[i].rgb * n.w * 1.6 * exp(-dot(d, d) / (r * r));',
    '  }',
    '  col += uGlow * 0.08;',
    '  float crackAmt = clamp(uMood.z * 0.8 + uPulse.z * 0.7, 0.0, 1.0);',
    '  float crack = pow(clamp(1.0 - abs(gnoise(p * 16.0 + id1)) * 1.6, 0.0, 1.0), 24.0);',
    '  col *= 1.0 - 0.8 * crack * crackAmt;',
    '  float leadW = 0.055 + 0.03 * uMood.z;',
    '  float px = scale / uRes.y;',
    '  float lead = smoothstep(leadW - px, leadW + px * 1.5, edge);',
    '  float bevel = smoothstep(leadW, leadW + 0.12, edge);',
    '  col *= 0.75 + 0.25 * bevel;',
    '  col += uPal[3] * 0.12 * (1.0 - bevel) * lead;',
    '  col = mix(vec3(0.015, 0.014, 0.013) + uPal[3] * 0.02 * uPulse.x, col, lead);',
    '  col += sparkles(p0) * 0.6;',
    '  col *= 1.0 - 0.3 * smoothstep(0.5, 1.15, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Gridrun: a neon wireframe heightfield streaming under the camera (plane intersection relaxed onto the
  // terrain in three steps), spectrum-shaped mountains on the horizon, a banded sun, note pillars in depth.
  var FS_GRIDRUN = [
    'uniform float uCamZ;',
    'float sdSeg2(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }',
    'float terrain(vec2 xz) { float road = smoothstep(0.7, 2.6, abs(xz.x)); return (0.5 + fbm3(xz * 0.33 + vec2(0.0, 1.0))) * 0.55 * road * (1.0 + 0.4 * uSpec.x); }',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float cz = uCamZ * 7.0;',
    '  vec2 p = p0;',
    '  float gy = fract(t * 0.23) * 1.4 - 0.7;',
    '  p.x += 0.06 * uMood.z * smoothstep(0.025, 0.0, abs(p0.y - gy)) * sign(sin(t * 9.0));',
    '  p = rot(0.03 * sin(t * 0.17)) * p;',
    '  float hor = 0.1;',
    '  vec3 ro = vec3(0.35 * sin(t * 0.11), 1.05 + 0.05 * sin(t * 0.31) - 0.08 * uPulse.z, 0.0);',
    '  vec3 rd = normalize(vec3(p.x, p.y - hor, 0.95));',
    '  vec3 col = mix(uPal[0] * 0.5, uPal[1] * 0.55, smoothstep(0.35, -0.02, rd.y)) * (1.0 - 0.45 * uMood.z);',
    '  vec2 sunP = vec2(0.0, hor + 0.21);',
    '  float sr = length(p - sunP);',
    '  float disc = smoothstep(0.215, 0.205, sr);',
    '  float bands = step(0.55, fract((p.y - sunP.y) * 26.0 - t * 0.6)) * smoothstep(sunP.y, sunP.y - 0.22, p.y);',
    '  disc *= 1.0 - 0.9 * bands;',
    '  vec3 sunC = mix(uPal[2], uPal[3], smoothstep(sunP.y - 0.2, sunP.y + 0.2, p.y));',
    '  col += sunC * disc * (1.3 + 0.3 * uPulse.y) + uPal[2] * 0.3 * exp(-sr * sr * 5.0);',
    '  float star = pow(hash12(floor(p * 160.0)), 90.0) * 0.8 * smoothstep(0.1, 0.4, p.y) * (0.6 + 0.4 * sin(t * 2.0 + hash12(floor(p * 160.0) + 1.0) * 6.28));',
    '  col += vec3(star) * (0.5 + 0.5 * uMood.z);',
    '  float mx = p.x / 0.95;',
    '  float mFar = hor + 0.03 + 0.11 * (fbm3(vec2(mx * 2.2 + cz * 0.004, 3.0)) + 0.5) * (0.7 + 0.6 * uSpec.y);',
    '  float mNear = hor - 0.005 + 0.16 * (fbm3(vec2(mx * 3.1 + cz * 0.011, 8.0)) + 0.5) * (0.6 + 0.8 * uSpec.z);',
    '  float farM = smoothstep(mFar + 0.002, mFar - 0.002, p.y);',
    '  float nearM = smoothstep(mNear + 0.002, mNear - 0.002, p.y);',
    '  col = mix(col, uPal[0] * 0.35 + uPal[1] * 0.1, farM);',
    '  col += uPal[2] * 0.6 * farM * smoothstep(0.012, 0.0, mFar - p.y);',
    '  col = mix(col, uPal[0] * 0.2, nearM);',
    '  col += mix(uPal[2], uPal[3], 0.3) * 0.9 * nearM * smoothstep(0.01, 0.0, mNear - p.y);',
    '  if (rd.y < -0.002) {',
    '    float tt = -ro.y / rd.y;',
    '    for (int k = 0; k < 3; k++) {',
    '      vec3 gp = ro + rd * tt;',
    '      float h = terrain(vec2(gp.x, gp.z + cz));',
    '      tt = (h - ro.y) / rd.y;',
    '    }',
    '    tt = max(tt, 0.05);',
    '    vec3 gp = ro + rd * tt;',
    '    gp.z += cz;',
    '    float lw = max(0.028, 2.2 * tt / uRes.y);',
    '    vec2 gf = abs(fract(gp.xz + 0.5) - 0.5);',
    '    float grid = max(1.0 - smoothstep(0.0, lw, gf.x), 1.0 - smoothstep(0.0, lw, gf.y));',
    '    float fog = exp(-tt * 0.075);',
    '    float wave = exp(-pow(fract(gp.z * 0.06 - t * 0.12) * 4.0, 2.0));',
    '    float h0 = terrain(gp.xz);',
    '    vec3 ground = uPal[0] * 0.22 + uPal[1] * 0.1 * h0;',
    '    vec3 gridC = mix(uPal[2], uPal[3], 0.25 * wave + 0.3 * uPulse.x) * (0.9 + 1.3 * uPulse.x + 0.6 * wave);',
    '    vec3 g = ground + gridC * grid;',
    '    g += uPal[2] * 0.25 * smoothstep(0.08, 0.0, abs(gp.x)) * (1.0 - smoothstep(0.0, 0.9, abs(gp.x)));',
    '    col = mix(col, g, fog * smoothstep(0.0, 0.03, -rd.y));',
    '  }',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    float pr = uC[i].a;',
    '    float zr = 0.8 + 14.0 * pow(1.0 - pr, 1.6);',
    '    float x = n.x * 2.8, top = 0.25 + n.z * 0.55;',
    '    vec2 a = vec2(x * 0.95 / zr, hor + (-0.1 - ro.y) * 0.95 / zr);',
    '    vec2 b = vec2(x * 0.95 / zr, hor + (top - ro.y) * 0.95 / zr);',
    '    float dd = sdSeg2(p, a, b);',
    '    float w = (0.004 + 0.02 / zr) * n.z;',
    '    float fog = exp(-zr * 0.05);',
    '    col += uC[i].rgb * n.w * fog * (exp(-dd * dd / (w * w)) * 1.2 + exp(-dd * dd / (w * w * 30.0)) * 0.25);',
    '  }',
    '  col += uGlow * 0.04;',
    '  col += sparkles(p0) * 0.7;',
    '  col *= (0.9 + 0.2 * uPulse.w);',
    '  col *= 1.0 - 0.35 * smoothstep(0.5, 1.15, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Swarm: a murmuration over a dusk sky. Agents live in grid cells attached to a wandering flock centre; each
  // one oscillates on an analytic path (so its velocity, and the dash orientation, is exact), a phase wave runs
  // through the flock, notes pull the centre toward them and kicks scatter the cells.
  var FS_SWARM = [
    'float sdSeg2(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float asp = uRes.x / uRes.y;',
    '  float t = uTime;',
    '  float px = 1.0 / uRes.y;',
    '  vec3 sky = mix(uPal[1] * 1.1, uPal[0] * 0.75, smoothstep(-0.55, 0.65, p0.y));',
    '  sky += uPal[2] * 0.5 * exp(-pow((p0.y + 0.42) * 2.4, 2.0));',
    '  float cl = fbm3(p0 * vec2(1.4, 3.0) + vec2(t * 0.02, 0.0)) + 0.5;',
    '  sky += uPal[3] * 0.1 * smoothstep(0.35, 0.8, cl) * (1.0 - 0.7 * uMood.z);',
    '  sky *= 1.0 - 0.55 * uMood.z * smoothstep(0.2, 0.8, cl + 0.3);',
    '  sky *= 0.9 + 0.2 * uPulse.w;',
    '  vec3 col = sky;',
    '  vec2 att = vec2(0.0);',
    '  float aw = 0.0;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    att += n.xy * n.w; aw += n.w;',
    '    vec2 d = p0 - n.xy;',
    '    float r = n.z * 1.8;',
    '    col += uC[i].rgb * n.w * (0.35 * exp(-dot(d, d) / (r * r)) + 0.12 * exp(-dot(d, d) / (r * r * 9.0)));',
    '  }',
    '  vec2 wander = vec2(sin(t * 0.09) * 0.3 * asp + sin(t * 0.023 + 1.0) * 0.15, cos(t * 0.071) * 0.2 + 0.05);',
    '  vec2 wanderV = vec2(cos(t * 0.09) * 0.09 * 0.3 * asp + cos(t * 0.023 + 1.0) * 0.023 * 0.15, -sin(t * 0.071) * 0.071 * 0.2);',
    '  float pull = min(aw, 1.0) * 0.55;',
    '  vec2 fcen = mix(wander, att / max(aw, 1e-3), pull);',
    '  vec2 fvel = wanderV * (1.0 - pull);',
    '  float dark = 0.0;',
    '  float spread = 1.15 + 0.35 * uPulse.w + 0.5 * uPulse.z;',
    '  float wdir = t * 0.05;',
    '  vec2 wv = vec2(cos(wdir), sin(wdir));',
    '  for (int L = 0; L < 2; L++) {',
    '    float fl = float(L);',
    '    float sc = 17.0 + 11.0 * fl;',
    '    float amp = (0.42 + 0.25 * uSpec.y) / sc;',
    '    vec2 q = (p0 - fcen) * sc;',
    '    vec2 iq = floor(q);',
    '    for (int j = -1; j <= 1; j++) {',
    '      for (int i = -1; i <= 1; i++) {',
    '        vec2 cid = iq + vec2(float(i), float(j));',
    '        vec2 h = hash22(cid + fl * 17.3);',
    '        vec2 base = (cid + 0.2 + 0.6 * h) / sc;',
    '        float rr = length(base * vec2(1.0, 1.5)) / spread;',
    '        float shape = gnoise(base * 2.4 + vec2(t * 0.07, fl * 3.0));',
    '        float dens = smoothstep(0.6, 0.12, rr + 0.3 * shape) * (0.9 + 0.4 * fl);',
    '        if (hash12(cid * 1.3 + fl) > dens) continue;',
    '        float phw = dot(base, wv) * (9.0 + 4.0 * uSpec.x) + h.x * 2.0;',
    '        float w1 = 1.6 + 0.6 * uSpec.y, w2 = 1.1;',
    '        vec2 disp = amp * vec2(sin(t * w1 + phw), cos(t * w2 + phw * 0.7 + h.y * 6.28));',
    '        vec2 dvel = amp * vec2(w1 * cos(t * w1 + phw), -w2 * sin(t * w2 + phw * 0.7 + h.y * 6.28));',
    '        vec2 jit = (hash22(cid + 5.1 + floor(t * 2.0)) - 0.5) * uMood.z * 0.3 / sc;',
    '        vec2 pos = fcen + base * spread + disp + jit;',
    '        vec2 vel = fvel + dvel + base * 0.5 * uPulse.z;',
    '        float vl = length(vel);',
    '        vec2 dir = vl > 1e-4 ? vel / vl : vec2(1.0, 0.0);',
    '        float flap = sin(t * 7.0 + h.x * 6.28) * 0.35;',
    '        vec2 wing = rot(flap) * vec2(-dir.y, dir.x);',
    '        float len = (0.0058 + 0.0025 * h.y) * (1.0 - 0.3 * fl);',
    '        float d1 = sdSeg2(p0, pos - dir * len * 0.6, pos + dir * len * 0.6);',
    '        float d2 = sdSeg2(p0, pos - wing * len * 1.2, pos + wing * len * 1.2);',
    '        float dd = min(d1, d2);',
    '        dark = max(dark, 1.0 - smoothstep(0.0, 1.6 * px, dd - 0.6 * px));',
    '      }',
    '    }',
    '  }',
    '  col = mix(col, uPal[0] * 0.08, dark * 0.95);',
    '  col += sparkles(p0) * 0.4;',
    '  col *= 1.0 - 0.3 * smoothstep(0.5, 1.15, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Coral, pass 1: Gray-Scott reaction-diffusion on the ping-pong buffer (r = U, g = V, b = note tag that
  // diffuses with V). Notes seed V in their colour; idle seeds keep it alive; mood moves feed/kill.
  var FS_RD = [
    'uniform sampler2D uPrev;',
    'uniform vec2 uTexel;',
    'uniform float uAsp;',
    'uniform float uDt60;',
    'uniform float uPass;',
    'uniform float uWarm;',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec4 c = texture2D(uPrev, uv);',
    '  vec4 l = texture2D(uPrev, uv - vec2(uTexel.x, 0.0));',
    '  vec4 r = texture2D(uPrev, uv + vec2(uTexel.x, 0.0));',
    '  vec4 d = texture2D(uPrev, uv - vec2(0.0, uTexel.y));',
    '  vec4 u = texture2D(uPrev, uv + vec2(0.0, uTexel.y));',
    '  vec4 dg = texture2D(uPrev, uv + vec2(-uTexel.x, -uTexel.y)) + texture2D(uPrev, uv + vec2(uTexel.x, -uTexel.y))',
    '          + texture2D(uPrev, uv + vec2(-uTexel.x, uTexel.y)) + texture2D(uPrev, uv + uTexel);',
    '  vec4 lap = (l + r + d + u) * 0.2 + dg * 0.05 - c;',
    '  float U = c.r, V = c.g, B = c.b;',
    // feed/kill sit in the branching ("coral") band of the Pearson map; mood nudges them without leaving it
    '  float f = 0.0545 + 0.0035 * uMood.z - 0.002 * uMood.w + 0.002 * uPulse.z;',
    '  float k = 0.062 - 0.0008 * uMood.z + 0.0004 * uMood.x;',
    '  float uvv = U * V * V;',
    '  float dt = 1.0;',
    '  U += (1.0 * lap.r - uvv + f * (1.0 - U)) * dt;',
    '  V += (0.5 * lap.g + uvv - (f + k) * V) * dt;',
    '  B += (0.5 * lap.b - 0.004 * B) * dt;',
    '  vec2 p = (uv - 0.5) * vec2(uAsp, 1.0);',
    '  if (uPass < 0.5) {',
    '    for (int i = 0; i < NN; i++) {',
    '      vec4 n = uN[i];',
    '      if (n.w < 0.001) continue;',
    '      vec2 dd = p - n.xy;',
    '      float rr = n.z * 0.45;',
    '      float inj = n.w * smoothstep(rr, rr * 0.3, length(dd));',
    '      V = max(V, inj * 0.5);',
    '      B = max(B, inj);',
    '    }',
    '    vec2 sc = floor(p * 7.0);',
    '    float ep = floor(uTime * 0.45);',
    '    float ss = hash12(sc * 1.7 + ep * 0.37);',
    '    if (ss > 0.985) {',
    '      vec2 cc = (sc + 0.5 + (hash22(sc + ep) - 0.5) * 0.7) / 7.0;',
    '      V = max(V, 0.5 * smoothstep(0.016, 0.004, length(p - cc)));',
    '    }',
    '    float w0 = (1.0 - uWarm);',
    '    if (w0 > 0.001) {',
    '      float h = hash12(floor(p * 5.0) + 0.5);',
    '      V = max(V, w0 * 0.5 * smoothstep(0.03, 0.0, length(p - vec2(0.0, 0.0)) - 0.03));',
    '      V = max(V, w0 * 0.5 * step(0.97, h) * smoothstep(0.03, 0.01, length(fract(p * 5.0) - 0.5) / 5.0));',
    '    }',
    '  }',
    '  vec3 o = clamp(vec3(U, V, B), 0.0, 1.0);',
    '#ifdef INK_LOWP',
    '  o += (hash12(gl_FragCoord.xy + fract(uTime * 1.37) * 91.0 + uPass * 7.0) - 0.5) / 255.0;',
    '#endif',
    '  gl_FragColor = vec4(o, 1.0);',
    '}'
  ].join('\n');

  // Coral, pass 2: display. V is embossed with a gradient normal and coloured by the palette; the diffused
  // note tag tints colonies with the sounding notes' glow.
  var FS_CORAL = [
    'uniform sampler2D uSim;',
    'uniform vec2 uTexel;',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float asp = uRes.x / uRes.y;',
    '  float t = uTime;',
    '  vec2 p = p0 * (1.0 - 0.02 * uPulse.z);',
    '  vec2 uv = p / vec2(asp, 1.0) + 0.5;',
    '  vec4 s = texture2D(uSim, uv);',
    '  float vl = texture2D(uSim, uv - vec2(uTexel.x, 0.0)).g;',
    '  float vr = texture2D(uSim, uv + vec2(uTexel.x, 0.0)).g;',
    '  float vd = texture2D(uSim, uv - vec2(0.0, uTexel.y)).g;',
    '  float vu = texture2D(uSim, uv + vec2(0.0, uTexel.y)).g;',
    '  float V = s.g;',
    '  vec3 N = normalize(vec3((vl - vr) * 9.0, (vd - vu) * 9.0, 1.0));',
    '  vec3 L = normalize(vec3(-0.5, 0.65, 0.6));',
    '  float light = 0.45 + 0.55 * max(dot(N, L), 0.0);',
    '  float rock = fbm3(p0 * 4.0) + 0.5;',
    '  vec3 base = uPal[0] * (0.35 + 0.4 * rock) * (0.85 + 0.3 * smoothstep(-0.6, 0.6, p0.y));',
    '  base += uPal[1] * 0.05 * smoothstep(0.4, 0.9, rock);',
    '  base *= 0.93 + 0.07 * hash12(fc * 0.5);',
    '  float cover = smoothstep(0.07, 0.17, V);',
    '  vec3 cc = mix(uPal[1], uPal[2], smoothstep(0.15, 0.42, V));',
    '  cc = mix(cc, uPal[3], smoothstep(0.3, 0.55, V) * 0.5);',
    '  float tag = clamp(s.b * 2.2, 0.0, 1.0);',
    '  vec3 gl = uGlow * 3.0 + uPal[2] * 0.2;',
    '  cc = mix(cc, gl, tag * 0.85);',
    '  vec3 coral = cc * light * (1.0 + 0.25 * uPulse.x + 0.3 * uPulse.z);',
    '  coral += uPal[3] * pow(1.0 - N.z, 2.0) * 0.5;',
    '  vec3 col = mix(base, coral, cover);',
    '  col += cc * 0.12 * smoothstep(0.0, 0.07, V) * (1.0 - cover);',
    '  col += uGlow * 0.03;',
    '  col += sparkles(p0) * 0.5;',
    '  col *= 1.0 - 0.35 * smoothstep(0.5, 1.15, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Hallway: a brutalist octagonal corridor from a low camera on a slow forward dolly with handheld sway. The tunnel is
  // eight planes, so each ray hits it analytically (and once more for the wet floor's reflection). Neon frames run round
  // the walls every few metres: kicks flash them and breathe the lens, the swell lifts them, notes send a pulse of their
  // colour rushing down the corridor toward the viewer (brighter on the side the note sits), the low band thickens the
  // floor mist, the mids etch a faint UV pattern into the concrete, tension turns the neon from magenta to ultraviolet.
  var FS_HALLWAY = [
    'uniform float uCamZ;',
    'const float HW = 1.3, HH = 0.85, HD = 1.75, AD = 2.3;',
    // distance from ro along rd to the walls, ceiling or corner cuts (not the floor); n = outward normal there
    'float tunnel(vec3 ro, vec3 rd, out vec3 n) {',
    '  float best = (HW - sign(rd.x) * ro.x) / max(abs(rd.x), 1e-5);',
    '  n = vec3(sign(rd.x), 0.0, 0.0);',
    '  if (rd.y > 1e-5) { float ty = (HH - ro.y) / rd.y; if (ty < best) { best = ty; n = vec3(0.0, 1.0, 0.0); } }',
    '  for (int k = 0; k < 4; k++) {',
    '    vec2 s = vec2(k < 2 ? 1.0 : -1.0, (k == 0 || k == 2) ? 1.0 : -1.0);',
    '    float nd = dot(s, rd.xy);',
    '    if (nd <= 1e-5) continue;',
    '    float td = (HD - dot(s, ro.xy)) / nd;',
    '    if (td < best) { best = td; n = vec3(s * 0.7071, 0.0); }',
    '  }',
    '  return best;',
    '}',
    // the note pulses: each sounding note is a band of its colour travelling from the far end toward the camera
    'vec3 notePulse(vec3 P, float cz) {',
    '  vec3 acc = vec3(0.0);',
    '  vec2 dir0 = normalize(P.xy - vec2(0.0, -0.3));',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 nn = uN[i];',
    '    if (nn.w < 0.001) continue;',
    '    float pr = uC[i].a;',
    '    float zn = cz + mix(AD * 6.5, -AD * 0.7, pr);',
    '    float dd = (P.z - zn) / (AD * 0.32);',
    '    float sec = 0.55 + 0.45 * dot(dir0, normalize(nn.xy));',
    '    acc += uC[i].rgb * nn.w * exp(-dd * dd) * sec * (1.0 - 0.45 * pr);',
    '  }',
    '  return acc;',
    '}',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float px = 1.0 / uRes.y;',
    '  float kick = uPulse.z;',
    '  float snare = 0.0, hat = 0.0;',
    '  for (int k = 0; k < 4; k++) { vec4 sp = uSpk[k]; snare = max(snare, sp.x * step(1.1, sp.z)); hat = max(hat, sp.x * step(sp.z, 0.9)); }',
    '  vec2 p = p0;',
    '  float ty = hash12(vec2(floor(t * 3.0), 2.0)) * 0.8 - 0.4;',
    '  p.x += snare * 0.02 * (1.0 - smoothstep(0.0, 0.05, abs(p0.y - ty) - 0.015)) * sign(sin(t * 7.0));',
    '  float cz = uCamZ * 3.5;',
    '  vec3 ro = vec3(0.09 * sin(t * 0.31) + 0.05 * sin(t * 0.77 + 1.0), -0.4 + 0.03 * sin(t * 0.53) + 0.02 * sin(t * 1.3), cz);',
    '  float roll = 0.02 * sin(t * 0.23) + 0.012 * sin(t * 0.61);',
    '  vec2 look = vec2(0.03 * sin(t * 0.19 + 2.0), 0.015 * sin(t * 0.27));',
    '  float foc = 1.15 * (1.0 - 0.05 * kick);',
    '  vec3 rd = normalize(vec3(rot(roll) * p + look, foc));',
    '  vec3 n;',
    '  float tw = tunnel(ro, rd, n);',
    '  float tf = rd.y < -1e-4 ? (-HH - ro.y) / rd.y : 1e5;',
    '  float onFloor = step(tf, tw);',
    '  float tt = min(tf, tw);',
    '  if (onFloor > 0.5) n = vec3(0.0, -1.0, 0.0);',
    '  vec3 P = ro + rd * tt;',
    '  float u = n.y * P.x - n.x * P.y;',
    '  if (onFloor > 0.5) u = P.x;',
    // neon frames: one every AD, each with its own flicker and dropouts
    '  float za = P.z / AD;',
    '  float ai = floor(za + 0.5);',
    '  float dz = (za - ai) * AD;',
    '  float lw = max(0.022, 1.6 * px * tt / (foc * max(dot(n, rd), 0.02)));',
    '  float ha = hash12(vec2(ai, 1.0));',
    '  float flick = 1.0 - 0.25 * step(0.55, ha) * (0.5 + 0.5 * sin(t * (11.0 + 9.0 * ha) + ai * 7.0)) * (0.6 + 0.8 * uSpec.w);',
    '  flick *= 1.0 - 0.7 * step(0.975, hash12(vec2(ai, floor(t * 18.0)))) * step(0.3, ha);',
    '  float uv = clamp(0.5 + 0.5 * sin(ai * 1.7 + t * 0.15) + 0.6 * uMood.z, 0.0, 1.0);',
    '  vec3 neon = mix(vec3(1.0, 0.06, 0.6), vec3(0.5, 0.08, 1.0), uv);',
    '  neon = mix(neon, uPal[2] * 1.6, 0.14);',
    '  float archI = (0.8 + 0.5 * uPulse.x + 1.5 * kick) * flick * (0.75 + 0.3 * uPulse.w) * smoothstep(30.0, 10.0, tt);',
    '  vec3 pulse = notePulse(P, cz);',
    '  vec3 archC = neon * archI + pulse * 1.3;',
    '  float ca = kick * 0.0035 * tt;',
    '  vec3 core = vec3(exp(-pow(dz + ca, 2.0) / (lw * lw)), exp(-dz * dz / (lw * lw)), exp(-pow(dz - ca, 2.0) / (lw * lw))) * (0.016 / lw);',
    '  float halo = exp(-abs(dz) * 5.0) * 0.35 + exp(-abs(dz) * 1.3) * 0.05;',
    '  core += vec3(exp(-dz * dz / (lw * lw * 12.0))) * 0.3;',
    // concrete, panel seams, a faint UV graffiti pattern from the mids
    '  float conc = fbm3(vec2(P.z * 0.7, u * 1.3)) + 0.5;',
    '  vec2 seam = abs(fract(vec2(P.z / 1.15, u / 0.9) + 0.5) - 0.5);',
    '  float seamL = 1.0 - smoothstep(0.0, 0.02 + tt * px * 2.0, min(seam.x * 1.15, seam.y * 0.9));',
    '  vec3 alb = vec3(0.1, 0.09, 0.115) * (0.65 + 0.7 * conc) * (1.0 - 0.6 * seamL);',
    '  float graf = pow(max(1.0 - abs(gnoise(vec2(P.z * 2.6, u * 2.6) + vec2(t * 0.05, 0.0))) * 2.4, 0.0), 9.0);',
    '  vec3 col;',
    '  if (onFloor > 0.5) {',
    '    float wet = smoothstep(0.15, 0.6, fbm3(P.xz * 0.55 + vec2(3.0, 1.0)) + 0.5);',
    '    vec3 fl = vec3(0.06, 0.055, 0.075) * (0.6 + 0.6 * conc) * (1.0 - 0.35 * wet);',
    '    vec3 rr = vec3(rd.x, -rd.y, rd.z);',
    '    vec3 n2;',
    '    float t2 = tunnel(P, rr, n2);',
    '    vec3 P2 = P + rr * t2;',
    '    float za2 = P2.z / AD;',
    '    float ai2 = floor(za2 + 0.5);',
    '    float dz2 = (za2 - ai2) * AD;',
    '    float lw2 = max(0.022, 1.6 * px * (tt + t2) / (foc * max(dot(n2, rr), 0.02))) * (3.0 + 5.0 * (1.0 - wet));',
    '    float fl2 = 1.0 - 0.25 * step(0.55, hash12(vec2(ai2, 1.0))) * (0.5 + 0.5 * sin(t * 13.0 + ai2 * 7.0));',
    '    float uv2 = clamp(0.5 + 0.5 * sin(ai2 * 1.7 + t * 0.15) + 0.6 * uMood.z, 0.0, 1.0);',
    '    vec3 neon2 = mix(mix(vec3(1.0, 0.06, 0.6), vec3(0.5, 0.08, 1.0), uv2), uPal[2] * 1.6, 0.14);',
    '    vec3 refl = (neon2 * (0.8 + 0.5 * uPulse.x + 1.5 * kick) * fl2 + notePulse(P2, cz) * 1.3) * (exp(-dz2 * dz2 / (lw2 * lw2)) * (0.016 / lw2) * 3.0 + exp(-abs(dz2) * 2.0) * 0.1);',
    '    float fres = mix(0.35, 1.0, pow(1.0 - clamp(-rd.y, 0.0, 1.0), 2.0));',
    '    col = fl * (0.06 + 0.8 * halo * archI) * (neon * 0.8 + 0.2);',
    '    col += refl * mix(0.3, 1.0, wet) * fres * exp(-t2 * 0.1);',
    '    col += archC * core * 0.8;',
    '  } else {',
    '    col = alb * (0.04 + halo * 1.8 * archI) * (neon * 1.3 + 0.1);',
    '    col += vec3(0.35, 0.2, 1.0) * graf * (0.03 + 0.25 * uSpec.y) * (0.05 + halo * archI);',
    '    col += archC * core;',
    '    col += (neon * archI * 0.2 + pulse * 0.06) * halo;',
    '  }',
    '  col *= exp(-tt * 0.16);',
    // low mist in the corridor: exponential height fog integrated along the ray, swirled by noise at mist height
    '  float h = 0.16;',
    '  float a = (ro.y + HH) / h, b = rd.y / h;',
    '  float fogI = abs(b) > 1e-4 ? exp(-a) * (1.0 - exp(-b * tt)) / b : exp(-a) * tt;',
    '  float tm = rd.y < -1e-3 ? clamp((-HH + 0.1 - ro.y) / rd.y, 0.0, tt) : min(tt, 6.0);',
    '  vec3 M = ro + rd * tm;',
    '  float mn = fbm3(M.xz * 0.8 + vec2(t * 0.07, t * 0.04)) + 0.5;',
    '  float mist = (1.0 - exp(-fogI * (0.5 + 0.9 * uSpec.x + 0.3 * uPulse.w) * (0.1 + 2.0 * mn * mn))) * exp(-tm * 0.2);',
    '  vec3 mistC = mix(vec3(0.25, 0.8, 1.0), vec3(0.55, 0.25, 1.0), smoothstep(0.3, 0.8, mn + 0.3 * uMood.z));',
    '  mistC = mix(mistC, uPal[3], 0.2) * (0.3 + 0.2 * uPulse.w + 0.3 * kick) * (0.5 + 0.8 * exp(-abs(dz) * 1.5) * archI);',
    '  col += mistC * mist;',
    '  col += neon * 0.02 * exp(-abs(dz) * 2.0) * mist;',
    '  col += uGlow * 0.03;',
    '  col += sparkles(p0) * 0.3;',
    '  col *= 1.0 + 0.1 * (hash12(fc + fract(t * 0.77) * 191.0) - 0.5);',
    '  col *= 1.0 - 0.4 * smoothstep(0.45, 1.1, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Scope: one big vector oscilloscope on a curved CRT. The chord puts up to four carrier sines (fundamental, third,
  // fifth, seventh at the chord's ratios: a bright third for warm chords, a flat one for dark, a fourth for open, a
  // tritone for tense) whose amplitudes follow the spectrum bands; every sounding note adds a sine whose frequency is
  // its pitch, drawn in green tinted by the note's colour. Each trace trails phosphor ghosts. A Lissajous figure in the
  // middle sweeps its phase with the bars and grows with the level. Kicks pump the beam and the amplitudes, snares and
  // hats tear the raster sideways, tension makes the sync slip and the picture roll.
  var FS_SCOPE = [
    'const vec3 PHOS = vec3(0.25, 1.0, 0.42);',
    // one sine trace y = yo + A sin(f x + ph) with two phosphor ghosts lagging behind it; returns the glow
    'float trace(vec2 q, float f, float ph, float A, float yo, float w, float ghosts) {',
    '  float ang = f * q.x + ph;',
    '  float y = yo + A * sin(ang);',
    '  float sl = A * f * cos(ang);',
    '  float d = abs(q.y - y) / sqrt(1.0 + sl * sl);',
    '  float acc = 2.2 * exp(-d * d / (w * w)) + 0.09 * exp(-d / (w * 3.0)) + 0.006 * exp(-d / (w * 12.0));',
    '  for (int g = 1; g < 3; g++) {',
    '    float fg = float(g);',
    '    if (fg > ghosts) break;',
    '    ang = f * q.x + ph - fg * 0.22;',
    '    y = yo + A * sin(ang);',
    '    sl = A * f * cos(ang);',
    '    d = abs(q.y - y) / sqrt(1.0 + sl * sl);',
    '    float ww = w * (1.0 + 1.1 * fg);',
    '    acc += (2.2 * exp(-d * d / (ww * ww)) + 0.09 * exp(-d / (ww * 3.0))) * (fg < 1.5 ? 0.2 : 0.06);',
    '  }',
    '  return acc;',
    '}',
    // Lissajous x = cos s, y = cos(n s + dl) in Chebyshev form (n = 1, 2 or 3): two explicit branches, distance to the
    // nearer one measured against its tangent
    'float lissa(vec2 q, float n, float dl, float w) {',
    '  float x = clamp(q.x, -1.0, 1.0);',
    '  float T = n < 1.5 ? x : (n < 2.5 ? 2.0 * x * x - 1.0 : 4.0 * x * x * x - 3.0 * x);',
    '  float dT = n < 1.5 ? 1.0 : (n < 2.5 ? 4.0 * x : 12.0 * x * x - 3.0);',
    '  float cd = cos(dl), sd = sin(dl);',
    '  float s = sqrt(max(1.0 - T * T, 0.0));',
    '  float ds = -T * dT / max(s, 0.05);',
    '  float y1 = T * cd + s * sd, y2 = T * cd - s * sd;',
    '  float k1 = clamp(dT * cd + ds * sd, -6.0, 6.0), k2 = clamp(dT * cd - ds * sd, -6.0, 6.0);',
    '  float ox = max(abs(q.x) - 1.0, 0.0);',
    '  float d1 = length(vec2(ox, (q.y - y1) / sqrt(1.0 + k1 * k1)));',
    '  float d2 = length(vec2(ox, (q.y - y2) / sqrt(1.0 + k2 * k2)));',
    '  float d = min(d1, d2);',
    '  return exp(-d * d / (w * w)) + 0.1 * exp(-d / (w * 4.0));',
    '}',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float asp = uRes.x / uRes.y;',
    '  float t = uTime;',
    '  float kick = uPulse.z;',
    '  float snare = 0.0, hat = 0.0, hitSeed = 0.0;',
    '  for (int k = 0; k < 4; k++) { vec4 sp = uSpk[k]; float sn = sp.x * step(1.1, sp.z); if (sn > snare) { snare = sn; hitSeed = sp.y; } hat = max(hat, sp.x * step(sp.z, 0.9)); }',
    // glass: barrel curvature, rounded screen, bezel
    '  vec2 uv = p0 / vec2(asp * 0.5, 0.5);',
    '  float rr = dot(uv, uv);',
    '  vec2 cc = uv * (1.0 + 0.09 * rr);',
    '  vec2 bx = abs(cc) - vec2(0.97, 0.955);',
    '  float corner = length(max(bx + 0.08, 0.0)) - 0.08;',
    '  float inside = 1.0 - smoothstep(-0.008, 0.004, corner);',
    // raster faults: tearing on snares and hats, sync slip and roll with tension
    '  vec2 sc = cc;',
    '  float slip = uMood.z * 0.5 + 0.5 * step(0.94, hash12(vec2(floor(t * 1.5), 3.0)));',
    '  sc.y += 0.02 * slip * sin(sc.y * 9.0 + t * 23.0) + 0.3 * slip * step(0.985, hash12(vec2(floor(t * 2.0), 8.0))) * (fract(t * 2.0) - 0.5);',
    '  float ty = fract(hitSeed * 0.37) * 1.6 - 0.8;',
    '  float band = 1.0 - smoothstep(0.0, 0.12, abs(sc.y - ty) - 0.06);',
    '  sc.x += snare * 0.35 * band * (hash12(vec2(floor(sc.y * 60.0), mod(floor(t * 30.0), 4096.0))) - 0.5);',
    '  float ty2 = hash12(vec2(floor(t * 4.0), 5.0)) * 1.6 - 0.8;',
    '  sc.x += hat * 0.06 * (1.0 - smoothstep(0.0, 0.05, abs(sc.y - ty2) - 0.02)) * sign(sin(t * 11.0));',
    // graticule
    '  vec2 gq = sc * vec2(5.0, 4.0);',
    '  vec2 gf = abs(fract(gq + 0.5) - 0.5);',
    '  float gl = (1.0 - smoothstep(0.0, 0.03, gf.x)) + (1.0 - smoothstep(0.0, 0.035, gf.y));',
    '  float axes = (1.0 - smoothstep(0.0, 0.012, abs(sc.x))) + (1.0 - smoothstep(0.0, 0.012, abs(sc.y)));',
    '  vec3 col = PHOS * (0.025 * gl + 0.04 * axes) * (0.6 + 0.4 * uPulse.w) + vec3(0.002, 0.006, 0.003);',
    // the beam
    '  float beam = (0.5 + 0.4 * uPulse.w) * (1.0 + 0.5 * kick) * (0.75 + 0.25 * uBeat.w);',
    '  float w = 0.012 * (1.0 + 0.3 * kick);',
    '  float f0 = 2.2 + 0.6 * uMood.y;',
    '  float gain = (0.26 + 0.45 * uPulse.w) * (1.0 + 0.35 * kick);',
    '  float third = uMood.w > 0.5 ? 1.3333 : (uMood.x > 0.0 ? 1.25 : 1.2);',
    '  float fifth = uMood.z > 0.5 ? 1.4 : 1.5;',
    '  float drift = t * 1.1 + uBeat.z * 0.4;',
    '  vec3 tr = vec3(0.0);',
    '  tr += PHOS * trace(sc, f0 * 3.14159, -drift, gain * (0.5 + 0.8 * uSpec.x), 0.0, w, 2.0) * 1.0;',
    '  tr += mix(PHOS, vec3(0.2, 1.0, 0.9), 0.3) * trace(sc, f0 * third * 3.14159, -drift * third + 1.0, gain * (0.35 + 0.8 * uSpec.y), 0.0, w * 0.9, 2.0) * 0.9;',
    '  tr += mix(PHOS, vec3(0.9, 1.0, 0.3), 0.25) * trace(sc, f0 * fifth * 3.14159, -drift * fifth + 2.1, gain * (0.2 + 0.7 * uSpec.z), 0.0, w * 0.85, 1.0) * 0.65;',
    '  tr += mix(PHOS, vec3(1.0, 0.3, 0.8), 0.3) * trace(sc, f0 * 1.75 * 3.14159, -drift * 1.75 + 3.3, gain * (0.1 + 0.6 * uSpec.w) * smoothstep(0.2, 0.9, uMood.y), 0.0, w * 0.8, 1.0) * 0.5;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.04) continue;',
    '    float pn = clamp(n.y / 0.78 + 0.5, 0.0, 1.0);',
    '    float f = 1.6 * pow(2.0, pn * 2.7) * 3.14159;',
    '    float ph = n.x * 6.0 - t * (1.6 + 2.5 * pn) * sign(n.x);',
    '    float A = min((0.04 + 0.32 * n.w) * (1.0 + 0.25 * kick) * (0.75 + 0.35 * n.z / 0.09), 0.5);',
    '    vec3 tc = mix(PHOS, uC[i].rgb * 1.3, 0.45);',
    '    tr += tc * trace(sc, f, ph, A, 0.0, w * (0.8 + 0.3 * n.w), 1.0) * (0.15 + 1.0 * n.w);',
    '  }',
    '  float ln = uMood.y > 0.6 ? 3.0 : (uMood.x < 0.0 ? 2.0 : 1.0);',
    '  float dl = t * 0.35 + uBeat.y * 0.8 + uBeat.z * 0.3;',
    '  float lsz = 0.3 + 0.22 * uPulse.w + 0.1 * kick;',
    '  tr += mix(PHOS, vec3(0.3, 0.9, 1.0), 0.6) * lissa(sc / vec2(lsz * 1.3, lsz), ln, dl, 0.014 / lsz) * (0.35 + 0.55 * uBeat.w) * 0.8;',
    '  col += tr * beam / (1.0 + 0.2 * dot(tr, vec3(0.33)));',
    // phosphor bloom: a soft haze following the traces' energy, strongest mid-screen
    '  float haze = exp(-dot(sc * vec2(0.7, 1.4), sc * vec2(0.7, 1.4)) * 0.9);',
    '  col += PHOS * haze * (0.015 + 0.06 * uPulse.w + 0.06 * kick) * beam;',
    '  col += uGlow * 0.04 * haze;',
    // raster, glass, grain
    '  col *= 0.8 + 0.2 * sin(fc.y * 2.094 + 0.5);',
    '  col *= 1.0 - 0.45 * smoothstep(0.35, 1.5, rr);',
    '  vec2 hl = cc - vec2(-0.55, 0.62);',
    '  col += vec3(0.6, 0.7, 0.75) * 0.025 * exp(-dot(hl, hl) * 2.2) * (1.0 - smoothstep(0.35, 1.0, rr));',
    '  col *= inside;',
    '  float bez = (1.0 - inside) * smoothstep(0.2, -0.01, corner);',
    '  col += vec3(0.02, 0.022, 0.024) * bez * (0.5 + 0.5 * smoothstep(0.1, -0.1, corner)) + PHOS * 0.02 * bez * haze * uPulse.w;',
    '  col += sparkles(p0) * 0.15 * inside;',
    '  col *= 1.0 + 0.12 * (hash12(fc + fract(t * 0.61) * 173.0) - 0.5);',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Roots: a dark cavern of bioluminescent root networks. Each network is the zero-set of a domain-warped noise in
  // log-polar coordinates round its trunk (stretched along the radius so the lines run outward and split as they go),
  // drawn as thin electric veins with a finer net of rootlets further out and a bright trunk. Three such networks sit
  // at three depths (the far ones dimmer and tinted toward the backlight) under a slow creeping pan and zoom, with a
  // purple floor vein and glowing fungal stalks along the bottom and drifting spores throughout. Kicks send a bright
  // pulse out along the veins and breathe the view, the mids thicken the veins, the highs wake the spores, the low band
  // and tension fill the ultraviolet backlight, and every note lights the veins around it in its own colour and wakes
  // the spores nearby.
  var FS_ROOTS = [
    'vec2 gWarp;',
    'float gKick, gMids;',
    // vein network of one layer: p relative to the trunk origin; sc scales the network; returns line intensity
    'float veins(vec2 p, float sc, float seed, float level) {',
    '  float r = length(p) + 0.015;',
    '  float a = atan(p.x, -p.y);',
    '  vec2 q = vec2(a * 3.0, log(r) * 1.4 - uTime * 0.015) + gWarp * 0.55 + seed;',
    '  float v = fbm3(q * sc);',
    '  float k = 1.0 - 0.35 * gMids;',
    '  float br = level < 0.5 ? 0.45 + 0.55 * gnoise(vec2(a * 1.7 + seed, log(r) * 0.6 + 5.0)) : 0.75;',
    '  float line = (exp(-v * v * 1500.0 * k) + 0.15 * exp(-v * v * 300.0 * k)) * br;',
    '  float cone = smoothstep(1.95, 1.0, abs(a)) * smoothstep(-0.03, 0.08, -p.y + 0.04);',
    '  float fl = 0.0;',
    '  if (level < 1.5) {',
    '    float f = gnoise(q * sc * vec2(2.6, 2.2) + 3.7);',
    '    fl = (exp(-f * f * 2500.0 * k) + 0.12 * exp(-f * f * 500.0 * k)) * smoothstep(0.12, 0.4, r) * (1.0 - 0.6 * level) * (0.5 + 0.5 * br);',
    '  }',
    '  float trunk = exp(-pow(p.x / (0.012 + 0.03 * smoothstep(0.25, 0.0, -p.y)), 2.0)) * smoothstep(0.3, 0.02, -p.y) * step(0.0, -p.y);',
    '  return (line * smoothstep(0.0, 0.1, r) + 0.6 * fl + trunk * 1.2) * cone * smoothstep(0.85, 0.3, r);',
    '}',
    'float particles(vec2 p, float t) {',
    '  float acc = 0.0;',
    '  float px = 1.0 / uRes.y;',
    '  for (int L = 0; L < 2; L++) {',
    '    float fl = float(L);',
    '    float sc = 7.0 + fl * 6.0;',
    '    vec2 q = (p + vec2(fl * 1.37 + 0.06 * sin(t * 0.07 + fl * 2.1), t * (0.006 + 0.004 * fl))) * sc;',
    '    vec2 id = floor(q);',
    '    float h = hash12(id + fl * 31.7);',
    '    if (h < 0.7) continue;',
    '    vec2 o = (hash22(id + fl * 7.3) - 0.5) * 0.6;',
    '    vec2 d = (fract(q) - 0.5 - o) / sc;',
    '    float rad = max(0.0012 + 0.0014 * fract(h * 7.1), 1.1 * px);',
    '    float tw = 0.5 + 0.5 * sin(t * (0.5 + h) + h * 40.0);',
    '    acc += exp(-dot(d, d) / (rad * rad)) * tw * (0.3 + 0.7 * fract(h * 3.3)) * (1.0 - fl * 0.2);',
    '  }',
    '  return acc;',
    '}',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float asp = uRes.x / uRes.y;',
    '  float t = uTime;',
    '  float kick = uPulse.z;',
    '  gKick = kick; gMids = clamp(0.5 * (uSpec.y + uSpec.z), 0.0, 1.0);',
    '  vec2 p = p0 * (1.0 - 0.025 * kick) + vec2(0.03 * sin(t * 0.11), 0.015 * sin(t * 0.17));',
    '  vec2 s = p * 2.2 + vec2(t * 0.01, 0.0);',
    '  gWarp = vec2(fbm3(s + vec2(0.0, t * 0.02)), fbm3(s + vec2(4.7, 2.1) - vec2(t * 0.015, 0.0)));',
    // cavern: soil and rock round a dark opening, lit faintly by the backlight pockets
    '  float rock = gWarp.x * 0.7 + 0.5 * gnoise(p * 7.0 + gWarp * 2.0) + 0.5;',
    '  float open = smoothstep(0.05, -0.3, length(p * vec2(0.75, 1.1)) - 0.68 + 0.2 * gWarp.y);',
    '  vec3 soil = vec3(0.05, 0.034, 0.03) * (0.5 + 0.8 * rock);',
    '  vec3 uvc = mix(vec3(0.42, 0.08, 0.95), vec3(0.95, 0.15, 0.7), 0.5 + 0.5 * sin(t * 0.13) + 0.4 * uMood.z);',
    '  uvc = mix(uvc, uPal[1] * 1.6, 0.3);',
    '  float bl = 0.0;',
    '  for (int k = 0; k < 3; k++) {',
    '    float fk = float(k);',
    '    vec2 c = vec2(-0.5 + 0.5 * fk + 0.08 * sin(t * 0.09 + fk * 2.0), -0.3 + 0.05 * cos(t * 0.07 + fk));',
    '    bl += exp(-dot(p - c, p - c) * (9.0 - 3.0 * fk)) * (0.6 + 0.5 * fract(fk * 0.37));',
    '  }',
    '  float backI = (0.35 + 0.6 * uSpec.x + 0.3 * uPulse.y) * (0.6 + 0.6 * uMood.z) * (0.8 + 0.4 * uPulse.w);',
    '  vec3 col = soil * (0.1 + 0.5 * bl * backI) * (1.0 - 0.93 * open);',
    '  col += uvc * bl * backI * 0.07 * (0.3 + 0.7 * open);',
    // the networks: three layers on a slow approach cycle
    '  vec3 cyan = vec3(0.15, 1.0, 1.0), acid = vec3(0.35, 1.0, 0.15);',
    '  float hueN = gnoise(p * 1.3 + vec2(t * 0.03, 7.0));',
    '  vec3 veinC = mix(cyan, acid, smoothstep(-0.1, 0.4, hueN));',
    '  veinC = mix(veinC, uPal[2] * 1.5, 0.15);',
    '  vec3 noteL = vec3(0.0);',
    '  float noteA = 0.0;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    vec2 d = p - n.xy;',
    '    float r = n.z * 1.7;',
    '    float g = exp(-dot(d, d) / (r * r));',
    '    noteL += uC[i].rgb * n.w * g;',
    '    noteA += n.w * g;',
    '    col += uC[i].rgb * n.w * 0.12 * exp(-dot(d, d) / (r * r * 0.08));',
    '  }',
    '  float lit = 0.0;',
    '  vec2 pan = vec2(0.1 * sin(t * 0.045), 0.03 * sin(t * 0.031));',
    '  float zoom = 1.0 + 0.12 * sin(t * 0.06);',
    '  for (int L = 0; L < 3; L++) {',
    '    float fl = float(L);',
    '    float depth = 1.0 + 0.9 * fl;',
    '    vec2 og = vec2(0.0, 0.5) + vec2(0.7 * sin(fl * 2.1) * (depth - 0.4), 0.12 * fl);',
    '    vec2 q = ((p - pan / depth) * zoom - og) * depth;',
    '    float vn = veins(q, 1.0 + 0.25 * fl, fl * 17.0, fl);',
    '    float r = length(q);',
    '    float pulse = 0.5 + 0.5 * sin(r * 9.0 - t * 2.4 - fl);',
    '    float kw = exp(-pow(fract(r * 0.6 - uBeat.z * 0.6) * 4.0, 2.0)) * kick;',
    '    float I = (0.35 + 0.55 * pulse * (0.5 + 0.8 * uPulse.w) + 1.6 * kw) / (0.25 + depth * depth * depth * 0.75);',
    '    vec3 lc = mix(veinC, mix(uvc, veinC, 0.4), (depth - 1.0) * 0.35);',
    '    col += (lc * I + noteL * 1.6) * vn;',
    '    lit += vn * I;',
    '  }',
    // soil floor with a purple vein running along it and fungal stalks standing on it
    '  float yf = -0.34 + 0.03 * sin(p.x * 3.0 + 1.0) + 0.02 * gWarp.x;',
    '  float below = smoothstep(0.0, 0.02, yf - p.y);',
    '  col = mix(col, soil * (0.25 + 0.7 * bl * backI) + uvc * 0.02 * backI, below * 0.85);',
    '  float fv = gnoise(vec2(p.x * 2.4 + t * 0.02, (p.y - yf) * 9.0) + gWarp * 0.6);',
    '  float fvl = pow(max(1.0 - abs(fv) * 2.8, 0.0), 5.0) * smoothstep(0.1, 0.02, abs(p.y - yf + 0.03));',
    '  col += uvc * fvl * (0.5 + 0.6 * uPulse.y + 0.7 * kick + 0.4 * uSpec.x);',
    '  for (int k = 0; k < 6; k++) {',
    '    float fk = float(k);',
    '    float hx = hash12(vec2(fk * 3.1, 9.0));',
    '    float x = (hx - 0.5) * asp * 0.95;',
    '    float yb = -0.34 + 0.03 * sin(x * 3.0 + 1.0);',
    '    float h = 0.05 + 0.07 * fract(hx * 7.7);',
    '    float sw = h * 0.9;',
    '    vec2 d = p - vec2(x, yb);',
    '    d.x -= 0.008 * sin(t * 0.8 + fk) * d.y / h;',
    '    float stalk = length(vec2(d.x, d.y - clamp(d.y, 0.0, h))) - 0.006 - 0.004 * (1.0 - d.y / h);',
    '    vec2 cd = (d - vec2(0.0, h)) / vec2(0.055 * sw / 0.09, 0.025 * sw / 0.09);',
    '    float cap = length(cd) - 1.0;',
    '    if (cd.y < -0.05) cap = max(cap, -cd.y * 0.025 * sw / 0.09 - 0.004);',
    '    float m = min(stalk, cap);',
    '    float body = 1.0 - smoothstep(-0.002, 0.003, m);',
    '    float gl = exp(-max(m, 0.0) * 55.0);',
    '    vec4 sel = step(abs(vec4(0.0, 1.0, 2.0, 3.0) - mod(fk, 4.0)), vec4(0.5));',
    '    float band = dot(uSpec, sel);',
    '    vec3 mc = mix(vec3(0.6, 0.75, 1.0), uvc, 0.4 + 0.3 * fract(hx * 5.3)) * (0.35 + 0.8 * band + 0.3 * uPulse.x);',
    '    float gill = smoothstep(0.0, -0.12, cd.y) * smoothstep(-0.5, -0.1, cd.y) * step(cap, 0.0);',
    '    col = mix(col, mc * (0.6 + 0.6 * gill), body * 0.8);',
    '    col += mc * gl * 0.25 * (1.0 - body);',
    '  }',
    // spores, brighter in the lit parts and round the notes
    '  col += mix(veinC, vec3(0.9, 1.0, 1.0), 0.5) * particles(p, t) * (0.25 + 0.5 * uSpec.w + 0.7 * noteA + 0.4 * min(lit, 1.0));',
    '  col += uGlow * 0.03 * open;',
    '  col += sparkles(p0) * 0.3;',
    '  col *= 1.0 - 0.45 * smoothstep(0.4, 1.1, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Factory: a steady track down the aisle of a derelict hall. The hall is a box (walls, roof, floor hit analytically),
  // with a machinery plane in front of each wall (box silhouettes with gear wheels, moss and graffiti), roof trusses
  // (three planes ahead, X-webs tested as steel), tall window grids with broken panes and roof openings that show an
  // aurora mapped on the view direction, three lamps swinging on cords ahead of the camera (projected in the shader,
  // and lighting the floor and machines as warm point lights), and a wet floor that reflects the windows, skylights
  // and lamps, with an oil-slick puddle in the aisle. Kicks ripple the puddle, flare the lamps and brighten the
  // aurora; the mids swirl it faster and the openness/tension of the chord tilt it cyan or magenta; the low band
  // thickens the haze and its light shafts; the highs flicker the moss and lamps; snares tear the picture and flash
  // the lamps white; notes are floating lights drifting up the aisle toward you in their own colour.
  var FS_FACTORY = [
    'uniform float uCamZ;',
    'const float HW = 2.3, FL = -1.0, HT = 2.1, XM = 1.45, TD = 4.0, LD = 5.0, WZ = 3.0;',
    'float sdSeg2(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }',
    'vec3 gAur; vec3 gLamp[3]; float gLampI[3]; float gPivX[3];',
    // window glass mask at wall coordinates (z, y): 1 where lit glass, frame = mullions and sills
    'float windows(vec2 zy, out float frame, float soft) {',
    '  float cell = floor(zy.x / WZ);',
    '  float u = zy.x - cell * WZ;',
    '  float inW = step(0.45, u) * step(u, WZ - 0.45) * step(-0.3, zy.y) * step(zy.y, 1.72);',
    '  vec2 pg = vec2((u - 0.45) / 0.35, (zy.y + 0.3) / 0.404);',
    '  vec2 pf = fract(pg);',
    '  float mull = step(min(min(pf.x, 1.0 - pf.x), min(pf.y, 1.0 - pf.y)), 0.075);',
    '  float hp = hash12(floor(pg) + cell * 7.3);',
    '  float broken = step(0.74, hp);',
    '  float shard = step(pf.x * 0.8 + pf.y * 0.6, fract(hp * 9.0) * 1.1 - 0.1);',
    '  float sill = step(abs(zy.y + 0.3), 0.06) + step(abs(u - 0.45), 0.05) + step(abs(u - WZ + 0.45), 0.05);',
    '  frame = inW * clamp(mull + sill, 0.0, 1.0);',
    '  return inW * mix((1.0 - mull) * mix(1.0, shard, broken), 0.7, soft);',
    '}',
    // roof: open panels show the aurora, closed ones are corrugated metal; returns openness, metal in m
    'float roof(vec2 xz, out float m) {',
    '  vec2 g = xz / vec2(0.95, 1.15);',
    '  vec2 gf = fract(g);',
    '  float purlin = step(min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y)), 0.06);',
    '  float h = hash12(floor(g) + 2.1);',
    '  float open = step(0.48, h) * (1.0 - purlin);',
    '  m = (1.0 - open) * (0.6 + 0.4 * step(0.5, fract(xz.x * 9.0))) * (1.0 - 0.6 * purlin);',
    '  return open;',
    '}',
    // machine profile along a wall: height above the floor of the block in this cell, 0 in the gaps
    'float machineH(float z, float side) {',
    '  float c = floor(z / 3.0 + side * 0.5);',
    '  float u = fract(z / 3.0 + side * 0.5);',
    '  float h = hash12(vec2(c, 4.0 + side));',
    '  float gap = step(0.12, u) * step(u, 0.88 - 0.25 * fract(h * 7.0));',
    '  float skip = side > 0.5 ? step(0.45, fract(h * 3.0)) : 1.0;',
    '  return (0.5 + 1.05 * fract(h * 5.0)) * gap * skip;',
    '}',
    // warm light at P from the three lamps
    'vec3 lampLight(vec3 P, vec3 n) {',
    '  vec3 acc = vec3(0.0);',
    '  for (int k = 0; k < 3; k++) {',
    '    vec3 L = gLamp[k] - P;',
    '    float d2 = dot(L, L);',
    '    acc += vec3(1.0, 0.42, 0.1) * gLampI[k] * max(dot(n, L) * inversesqrt(d2), 0.0) * 0.55 / (d2 + 0.25);',
    '  }',
    '  return acc;',
    '}',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float px = 1.0 / uRes.y;',
    '  float kick = uPulse.z;',
    '  float snare = 0.0, hat = 0.0;',
    '  for (int k = 0; k < 4; k++) { vec4 sp = uSpk[k]; snare = max(snare, sp.x * step(1.1, sp.z)); hat = max(hat, sp.x * step(sp.z, 0.9)); }',
    '  vec2 p = p0;',
    '  float ty = hash12(vec2(floor(t * 3.0), 2.0)) * 0.8 - 0.4;',
    '  p.x += snare * 0.03 * (1.0 - smoothstep(0.0, 0.07, abs(p0.y - ty) - 0.02)) * sign(sin(t * 9.0));',
    '  float cz = uCamZ * 2.6;',
    '  vec3 ro = vec3(0.18 * sin(t * 0.13), 0.04 * sin(t * 0.37) - 0.05 * kick, cz);',
    '  vec2 look = vec2(0.025 * sin(t * 0.11), -0.04 + 0.012 * sin(t * 0.23));',
    '  float foc = 1.1 * (1.0 - 0.04 * kick);',
    '  vec3 rd = normalize(vec3(rot(0.012 * sin(t * 0.29)) * p + look, foc));',
    // the aurora outside, mapped on the view direction
    '  vec2 aq = rd.xy / max(rd.z, 0.25) * 2.6 + vec2(t * 0.02, t * 0.013);',
    '  float w1 = fbm3(aq * 1.3);',
    '  float w2 = gnoise(aq * 1.7 * M2 + vec2(3.1, 1.7) + 2.2 * w1 - vec2(0.0, t * 0.03)) * 0.8;',
    '  float sw = 0.5 + 0.5 * sin((w1 + 0.8 * w2) * 14.0 + t * (0.3 + 0.8 * uSpec.y));',
    '  vec3 aur = mix(vec3(1.0, 0.1, 0.75), vec3(0.45, 0.1, 1.0), smoothstep(-0.25, 0.25, w1));',
    '  aur = mix(aur, vec3(0.1, 0.85, 1.0), smoothstep(-0.1, 0.35, w2 + 0.3 * uMood.w - 0.25 * uMood.z));',
    '  aur = mix(aur, uPal[2] * 1.5, 0.15);',
    '  aur = mix(vec3(0.08, 0.03, 0.22), aur, smoothstep(0.1, 0.6, sw));',
    '  aur *= (0.1 + 1.1 * sw * sw * sw) * (0.5 + 0.4 * uSpec.y + 0.3 * uPulse.y + 0.3 * kick);',
    '  gAur = aur;',
    // lamps ahead: pendulums on cords from the roof
    '  float k0 = floor(cz / LD) + 1.0;',
    '  for (int k = 0; k < 3; k++) {',
    '    float ki = k0 + float(k);',
    '    float hk = hash12(vec2(ki, 6.0));',
    '    float th = (0.14 + 0.14 * uPulse.w + 0.06 * kick) * sin(t * (1.15 + 0.2 * hk) + ki * 2.1);',
    '    vec3 piv = vec3(0.6 * (hk - 0.5), HT, ki * LD + 1.2 * fract(hk * 3.0));',
    '    gLamp[k] = piv + 1.15 * vec3(sin(th), -cos(th), 0.0);',
    '    gPivX[k] = piv.x;',
    '    gLampI[k] = (0.8 + 0.4 * sin(t * 17.0 * (0.7 + hk) + hk * 40.0) * uSpec.w) * (1.0 + 1.5 * snare + 0.4 * kick) * (1.0 - 0.3 * uMood.z);',
    '  }',
    // nearest surface: walls, roof, floor, the machine planes, the trusses
    '  float tHit = (HW - sign(rd.x) * ro.x) / max(abs(rd.x), 1e-5);',
    '  float which = 0.0;',
    '  if (rd.y > 1e-5) { float ty2 = (HT - ro.y) / rd.y; if (ty2 < tHit) { tHit = ty2; which = 1.0; } }',
    '  if (rd.y < -1e-5) { float tf = (FL - ro.y) / rd.y; if (tf < tHit) { tHit = tf; which = 2.0; } }',
    '  for (int s = 0; s < 2; s++) {',
    '    float sd = s == 0 ? 1.0 : -1.0;',
    '    if (rd.x * sd > 1e-5) {',
    '      float tm = (XM * sd - ro.x) / rd.x;',
    '      vec3 Pm = ro + rd * tm;',
    '      if (tm < tHit && Pm.y < FL + machineH(Pm.z, float(s))) { tHit = tm; which = 3.0 + float(s); }',
    '    }',
    '  }',
    '  float kt = floor(ro.z / TD) + 1.0;',
    '  for (int j = 0; j < 3; j++) {',
    '    float zk = (kt + float(j)) * TD;',
    '    float tz = (zk - ro.z) / max(rd.z, 1e-4);',
    '    if (tz > tHit) break;',
    '    vec3 Pt = ro + rd * tz;',
    '    float yf = (Pt.y - (HT - 0.5)) / 0.5;',
    '    if (yf < 0.0 || yf > 1.0 || abs(Pt.x) > HW) continue;',
    '    float xx = Pt.x / 0.65;',
    '    float zig = abs(fract(xx) - 0.5) * 2.0;',
    '    float steel = step(yf, 0.1) + step(0.9, yf) + step(abs(yf - zig), 0.07) + step(abs(fract(xx + 0.5) - 0.5), 0.035);',
    '    if (steel > 0.5) { tHit = tz; which = 5.0; break; }',
    '  }',
    '  vec3 P = ro + rd * tHit;',
    '  vec3 col = vec3(0.0);',
    '  vec3 lampN = vec3(0.0);',
    '  if (which < 0.5) {',
    // a wall: windows with the aurora behind, brick between, graffiti tags
    '    float side = sign(P.x);',
    '    float frame;',
    '    float glass = windows(vec2(P.z, P.y), frame, 0.0);',
    '    float row = step(0.5, fract(P.y * 7.0));',
    '    float brick = 0.5 + 0.5 * step(0.08, fract(P.z * 3.0 + 0.5 * row)) * step(0.1, fract(P.y * 7.0));',
    '    vec3 alb = vec3(0.09, 0.06, 0.055) * (0.5 + 0.6 * brick) * (0.6 + 0.6 * (gnoise(P.zy * 3.0) + 0.5));',
    '    float tag = pow(max(1.0 - abs(gnoise(vec2(P.z * 2.2, P.y * 2.6) + 4.0)) * 2.6, 0.0), 6.0) * step(0.5, hash12(vec2(floor(P.z / WZ), 13.0))) * step(P.y, 1.0) * step(-0.9, P.y);',
    '    vec3 tagC = mix(vec3(0.3, 1.0, 0.15), vec3(1.0, 0.2, 0.8), step(0.5, hash12(vec2(floor(P.z / WZ), 17.0))));',
    '    lampN = lampLight(P, vec3(-side, 0.0, 0.0));',
    '    col = alb * (0.02 + 0.2 * length(gAur) * 0.3 + lampN * 1.5);',
    '    col = mix(col, vec3(0.008, 0.007, 0.008) + lampN * 0.4, frame);',
    '    col += gAur * glass * (1.0 - frame) * 0.9;',
    '    col += tagC * tag * (0.08 + 0.3 * uSpec.w) * (1.0 - glass);',
    '  } else if (which < 1.5) {',
    // the roof: openings show the aurora through the lattice, closed panels are corrugated metal
    '    float m;',
    '    float open = roof(P.xz, m);',
    '    col = gAur * open * 0.8 + vec3(0.03, 0.025, 0.03) * m * (0.2 + 0.5 * length(gAur) * 0.3) + lampLight(P, vec3(0.0, -1.0, 0.0)) * 0.3;',
    '  } else if (which < 2.5) {',
    // the floor: wet concrete reflecting the windows, roof openings and lamps; an oil-slick puddle in the aisle
    '    vec2 xz = P.xz;',
    '    float fn = gnoise(xz * 1.6) * 0.8 + 0.5;',
    '    float wn = fbm3(xz * 0.4 + 7.0) + 0.5;',
    '    float wet = smoothstep(0.15, 0.6, wn);',
    '    float pud = smoothstep(0.62, 0.74, wn) * smoothstep(1.7, 0.9, abs(P.x));',
    '    vec3 alb = vec3(0.075, 0.07, 0.075) * (0.5 + 0.9 * fn) * (1.0 - 0.4 * wet);',
    '    float debris = step(0.93, hash12(floor(xz * 6.0))) * step(0.3, fract(fn * 5.0));',
    '    alb *= 1.0 - 0.6 * debris;',
    '    lampN = lampLight(P, vec3(0.0, 1.0, 0.0));',
    '    col = alb * (0.02 + 0.07 * length(gAur) + lampN * 2.0);',
    '    vec3 rr = vec3(rd.x, -rd.y, rd.z);',
    '    float fres = mix(0.2, 1.0, pow(1.0 - clamp(-rd.y, 0.0, 1.0), 3.0));',
    '    vec3 refl = vec3(0.0);',
    '    float tw2 = (HW - sign(rr.x) * P.x) / max(abs(rr.x), 1e-5);',
    '    float tc2 = (HT - P.y) / max(rr.y, 1e-5);',
    '    if (tw2 < tc2) {',
    '      vec3 P2 = P + rr * tw2;',
    '      float fr2; float gl2 = windows(vec2(P2.z, P2.y), fr2, 1.0);',
    '      float mh = machineH(P2.z, rr.x > 0.0 ? 0.0 : 1.0);',
    '      float tm2 = (XM * sign(rr.x) - P.x) / max(abs(rr.x), 1e-5);',
    '      float blocked = step((P + rr * tm2).y, FL + mh);',
    '      refl = gAur * gl2 * (1.0 - blocked) * 0.75 + vec3(0.02) * blocked;',
    '    } else {',
    '      vec3 P3 = P + rr * tc2;',
    '      refl = gAur * 0.1;',
    '    }',
    '    for (int k = 0; k < 3; k++) {',
    '      vec3 Lm = vec3(gLamp[k].x, 2.0 * FL - gLamp[k].y, gLamp[k].z) - P;',
    '      float cosA = dot(normalize(Lm), rr);',
    '      refl += vec3(1.0, 0.45, 0.12) * gLampI[k] * 1.6 * exp(-(1.0 - cosA) * 1400.0) + vec3(1.0, 0.5, 0.2) * gLampI[k] * 0.12 * exp(-(1.0 - cosA) * 90.0);',
    '    }',
    '    col += refl * mix(0.05, 0.6, wet) * fres * (1.0 - 0.6 * pud);',
    '    float rip = 0.0;',
    '    for (int k = 0; k < 2; k++) {',
    '      vec2 rc = vec2(0.6 - 1.2 * float(k), cz + 3.5 + 3.0 * float(k));',
    '      float dr = length(xz - rc);',
    '      rip += sin(dr * 28.0 - t * 9.0) * exp(-dr * 1.1) * kick;',
    '    }',
    '    if (pud > 0.002) {',
    '    float hh = fbm3(xz * 1.8 + vec2(t * 0.05, 0.0)) * 2.6 + 0.4 * rip + t * 0.03;',
    '    vec3 iri = 0.5 + 0.5 * cos(6.2832 * (hh + vec3(0.0, 0.33, 0.67)));',
    '    iri = iri * iri;',
    '    col = mix(col, iri * (0.25 + 0.75 * fres) * (0.2 + 0.7 * length(gAur) * 0.5 + lampN * 2.0) * (1.0 + 0.5 * kick), pud * 0.9);',
    '    }',
    '  } else if (which < 4.5) {',
    // machinery: dark rusted blocks with a gear wheel, moss glowing acid green, a rim lit by the aurora
    '    float side = which < 3.5 ? 1.0 : -1.0;',
    '    float sIdx = which < 3.5 ? 0.0 : 1.0;',
    '    float c = floor(P.z / 3.0 + sIdx * 0.5), u = fract(P.z / 3.0 + sIdx * 0.5);',
    '    float hgt = machineH(P.z, sIdx);',
    '    float rust = gnoise(P.zy * 2.0 + c) * 0.8 + 0.5;',
    '    vec3 alb = mix(vec3(0.05, 0.045, 0.05), vec3(0.1, 0.05, 0.03), smoothstep(0.3, 0.7, rust)) * (0.6 + 0.6 * rust);',
    '    vec2 gc = vec2((u - 0.5) * 3.0, P.y - (FL + hgt * 0.5));',
    '    float gr = hgt * 0.36;',
    '    float ring = step(abs(length(gc) - gr), 0.035) + step(abs(length(gc) - gr * 0.3), 0.025);',
    '    float ang = atan(gc.y, gc.x);',
    '    float spoke = step(abs(fract(ang * 0.955 + t * 0.02 * (1.0 + 3.0 * uPulse.w)) - 0.5), 0.04) * step(length(gc), gr) * step(gr * 0.3, length(gc));',
    '    float teeth = step(0.5, fract(ang * 6.0)) * step(gr, length(gc)) * step(length(gc), gr + 0.06);',
    '    float gear = clamp(ring + spoke + teeth, 0.0, 1.0) * step(0.4, fract(hash12(vec2(c, 21.0 + sIdx)) * 3.0));',
    '    float moss = smoothstep(0.64, 0.8, fbm3(P.zy * 2.8 + 11.0) + 0.5 + 0.1 * smoothstep(0.8, 0.0, P.y - FL));',
    '    float top = smoothstep(0.12, 0.0, FL + hgt - P.y);',
    '    lampN = lampLight(P, vec3(-side, 0.0, 0.0));',
    '    col = alb * (0.02 + 0.15 * length(gAur) * 0.3 + lampN * 1.5) * (0.5 + 0.5 * smoothstep(0.0, 0.6, P.y - FL));',
    '    col += gAur * top * 0.5;',
    '    col = mix(col, vec3(0.012) + gAur * 0.25 + lampN * 0.5, gear * 0.85);',
    '    col += vec3(0.25, 0.9, 0.3) * moss * (0.06 + 0.22 * uSpec.w + 0.1 * uPulse.x) * (0.7 + 0.3 * sin(t * 3.0 + P.z * 4.0));',
    '  } else {',
    // truss steel: a silhouette with a rusty rim
    '    col = vec3(0.012, 0.01, 0.011) + gAur * 0.06 + lampLight(P, vec3(0.0, -1.0, 0.0)) * 0.2;',
    '  }',
    // haze with light shafts, the far end lost in it
    '  float shaft = pow(0.5 + 0.5 * gnoise(vec2(dot(p0, vec2(0.8, 0.6)) * 8.0, dot(p0, vec2(-0.6, 0.8)) * 1.0 - t * 0.08)), 2.0);',
    '  float haze = 1.0 - exp(-tHit * (0.028 + 0.04 * uSpec.x + 0.012 * uPulse.w));',
    '  vec3 hazeB = mix(vec3(0.5, 0.12, 0.9), vec3(1.0, 0.15, 0.7), 0.5 + 0.5 * sin(t * 0.07 + 1.0));',
    '  hazeB = mix(hazeB, vec3(0.15, 0.8, 1.0), clamp(0.3 + 0.4 * uMood.w - 0.3 * uMood.z + 0.3 * shaft, 0.0, 1.0));',
    '  hazeB = mix(hazeB, uPal[2] * 1.4, 0.15) * (0.4 + 0.4 * uSpec.y + 0.3 * uPulse.y + 0.3 * kick);',
    '  vec3 hazeC = hazeB * (0.07 + 0.3 * shaft * smoothstep(-0.2, 0.5, -p0.x + p0.y)) * (0.7 + 0.5 * uPulse.w);',
    '  col = mix(col, hazeC, haze);',
    // the lamps themselves and the notes as floating lights, with a little glow in the haze
    '  for (int k = 0; k < 3; k++) {',
    '    vec3 v = gLamp[k] - ro;',
    '    if (v.z < 0.3) continue;',
    '    vec2 s = v.xy * foc / v.z - look;',
    '    vec2 d = p - s;',
    '    float r = 0.045 * foc / v.z;',
    '    float occ = 1.0 - 0.92 * step(tHit * rd.z + 0.3, v.z);',
    '    vec3 lc = vec3(1.0, 0.55, 0.2) * gLampI[k];',
    '    col += lc * (exp(-dot(d, d) / (r * r)) * 3.0 + exp(-length(d) / (r * 4.0)) * 0.35 + exp(-length(d) * 16.0) * 0.05) * occ;',
    '    vec2 pv = (vec2(gPivX[k], HT) - ro.xy) * foc / v.z - look;',
    '    float cord = sdSeg2(p, pv, s + vec2(0.0, r * 2.0));',
    '    col = mix(col, vec3(0.01), (1.0 - smoothstep(0.0, 1.5 * px, cord - 0.8 * px)) * occ);',
    '    vec2 sh = d - vec2(0.0, r * 1.7);',
    '    float shade = step(abs(sh.x), r * (1.8 + 1.5 * clamp(sh.y / (r * 1.5), 0.0, 1.0))) * step(0.0, sh.y) * step(sh.y, r * 1.6);',
    '    col = mix(col, vec3(0.03, 0.02, 0.015) + lc * 0.15, shade * occ);',
    '  }',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    float pr = uC[i].a;',
    '    vec3 w = vec3(n.x * 1.5, n.y * 0.8 + 0.35 + 0.1 * sin(t * 1.3 + float(i)), cz + mix(17.0, 0.6, pr));',
    '    vec3 v = w - ro;',
    '    if (v.z < 0.3) continue;',
    '    vec2 s = v.xy * foc / v.z - look;',
    '    vec2 d = p - s;',
    '    float r = n.z * 0.035 * foc / v.z;',
    '    float vis = exp(-v.z * 0.05) * (1.0 - 0.85 * step(tHit * rd.z + 0.2, v.z));',
    '    col += uC[i].rgb * n.w * vis * (exp(-dot(d, d) / (r * r)) * 2.0 + exp(-length(d) / (r * 3.0)) * 0.3 + exp(-length(d) * 18.0) * 0.04);',
    '  }',
    '  col += uGlow * 0.02;',
    '  col += sparkles(p0) * 0.3;',
    '  col *= 1.0 + 0.1 * (hash12(fc + fract(t * 0.71) * 151.0) - 0.5);',
    '  col *= 1.0 - 0.4 * smoothstep(0.45, 1.1, length(p0 * vec2(0.8, 1.0)));',
    '  gl_FragColor = vec4(finish(col, fc), 1.0);',
    '}'
  ].join('\n');

  // Void: translucent ribbon tendrils undulating in black water, seen on a slow orbital drift. Each ribbon is a band
  // round a centre line that is a sum of travelling sines, twisting (its width breathes along its length) so it reads
  // as a turning sheet; the body is a faint blue fill with a fresnel limb, and the nearest ribbon to each pixel
  // carries a nerve net (Voronoi cell edges in its own coordinates) that brightens toward the limb and twinkles cell
  // by cell. Kicks flash the nets and ripple the ribbons, with a red/blue fringe on the limbs; the mids drive the
  // twinkle, the highs wake the particulate field, tension turns the glow ultraviolet, openness turns it cyan; every
  // note is a bioluminescent flash that lights the nets around it in its colour.
  var FS_VOID = [
    // ribbon k: local coordinates of p (u across in units of the half-width, v along); returns u in r.x, v in r.y,
    // the half-width in r.z and the depth scale in r.w
    'vec4 ribbon(vec2 p, float k, float t) {',
    '  float h = hash12(vec2(k * 3.7, 1.0));',
    '  float h2 = fract(h * 7.3), h3 = fract(h * 23.1);',
    '  float depth = 0.6 + 1.1 * h3;',
    '  vec2 q = rot(h * 6.2832 + 0.15 * sin(t * 0.05 + k)) * p * depth;',
    '  float v = q.y + t * (0.04 + 0.03 * h2);',
    '  float xc = (h2 - 0.5) * 1.2 + 0.22 * sin(v * 2.1 + t * 0.6 + h * 9.0) + 0.1 * sin(v * 4.7 - t * 0.9 + h2 * 5.0) + 0.05 * sin(v * 9.0 + t * 1.7);',
    '  xc += 0.03 * uPulse.z * sin(v * 14.0 - t * 6.0);',
    '  float w = (0.06 + 0.1 * h2) * (0.3 + 0.7 * abs(sin(v * 1.1 + t * 0.3 + h * 3.0)));',
    '  return vec4((q.x - xc) / w, v, w, depth);',
    '}',
    'float particles(vec2 p, float t) {',
    '  float acc = 0.0;',
    '  float px = 1.0 / uRes.y;',
    '  for (int L = 0; L < 3; L++) {',
    '    float fl = float(L);',
    '    float sc = 6.0 + fl * 5.0;',
    '    vec2 q = (p + vec2(fl * 1.37 + t * 0.004 * (1.0 + fl), 0.03 * sin(t * 0.1 + fl))) * sc;',
    '    vec2 id = floor(q);',
    '    float h = hash12(id + fl * 31.7);',
    '    if (h < 0.74) continue;',
    '    vec2 o = (hash22(id + fl * 7.3) - 0.5) * 0.6;',
    '    vec2 d = (fract(q) - 0.5 - o) / sc;',
    '    float rad = max(0.001 + 0.0012 * fract(h * 7.1), 1.1 * px);',
    '    float tw = 0.5 + 0.5 * sin(t * (0.4 + h) + h * 40.0);',
    '    acc += exp(-dot(d, d) / (rad * rad)) * tw * (0.3 + 0.7 * fract(h * 3.3)) * (1.0 - fl * 0.25);',
    '  }',
    '  return acc;',
    '}',
    'void main() {',
    '  vec2 fc = gl_FragCoord.xy;',
    '  vec2 p0 = (fc - 0.5 * uRes) / uRes.y;',
    '  float t = uTime;',
    '  float kick = uPulse.z;',
    '  float mids = clamp(0.5 * (uSpec.y + uSpec.z), 0.0, 1.0);',
    '  vec2 p = rot(t * 0.015 + 0.1 * sin(t * 0.07)) * p0 * (1.0 + 0.08 * sin(t * 0.04) - 0.02 * kick) + vec2(0.06 * sin(t * 0.09), 0.04 * cos(t * 0.06));',
    '  vec3 cyan = vec3(0.0, 0.97, 1.0), blue = vec3(0.0, 0.27, 1.0), uvc = vec3(0.54, 0.17, 0.89);',
    '  float uvA = clamp(0.3 + 0.5 * uMood.z - 0.4 * uMood.w, 0.0, 1.0);',
    '  vec3 glowC = mix(cyan, uvc, uvA * 0.6);',
    '  glowC = mix(glowC, uPal[2] * 1.4, 0.15);',
    '  vec3 bodyC = mix(blue, uvc, uvA) * 0.5;',
    '  vec3 col = vec3(0.0, 0.004, 0.012) * (1.0 + 0.5 * uPulse.w) + blue * 0.01 * exp(-dot(p0, p0) * 2.0);',
    // the notes: flashes that light the nets round them
    '  vec3 noteL = vec3(0.0);',
    '  float noteA = 0.0;',
    '  for (int i = 0; i < NN; i++) {',
    '    vec4 n = uN[i];',
    '    if (n.w < 0.001) continue;',
    '    vec2 d = p0 - n.xy;',
    '    float r = n.z * 2.2;',
    '    float g = exp(-dot(d, d) / (r * r));',
    '    noteL += uC[i].rgb * n.w * g;',
    '    noteA += n.w * g;',
    '    col += uC[i].rgb * n.w * (0.8 * exp(-dot(d, d) / (r * r * 0.012)) + 0.015 * g) + vec3(0.6, 0.9, 1.0) * n.w * 0.5 * exp(-dot(d, d) / (r * r * 0.002));',
    '  }',
    // the ribbons: limbs for all, the net for the nearest
    '  float best = 1e9;',
    '  vec4 R = vec4(0.0);',
    '  float bk = 0.0;',
    '  float ca = 0.05 * kick;',
    '  for (int k = 0; k < 5; k++) {',
    '    float fk = float(k);',
    '    vec4 r = ribbon(p, fk, t);',
    '    float au = abs(r.x);',
    '    if (au < best) { best = au; R = r; bk = fk; }',
    '    float inside = 1.0 - smoothstep(0.92, 1.08, au);',
    '    float limb = pow(clamp(au, 0.0, 1.0), 5.0) * inside;',
    '    vec3 fr = vec3(pow(clamp(au + ca, 0.0, 1.0), 5.0) * (1.0 - smoothstep(0.92, 1.08, au + ca)), limb, pow(clamp(au - ca, 0.0, 1.0), 5.0) * (1.0 - smoothstep(0.92, 1.08, au - ca)));',
    '    float fade = 1.0 / (0.4 + r.w * r.w * 0.6);',
    '    float halo = exp(-max(au - 1.0, 0.0) * 9.0) * (1.0 - inside) * 0.08;',
    '    vec3 lc = mix(glowC, uvc, smoothstep(0.8, 1.7, r.w) * 0.5);',
    '    col += (bodyC * inside * (0.04 + 0.1 * (1.0 - au * au)) + lc * fr * (0.4 + 0.4 * uPulse.w + 0.5 * kick) + lc * halo) * fade;',
    '  }',
    '  if (best < 1.15) {',
    '    vec2 nq = vec2(R.x * 2.2 + bk * 3.1, R.y * 24.0 + bk * 7.0);',
    '    vec2 ig = floor(nq), fg = fract(nq);',
    '    float F1 = 9.0, F2 = 9.0;',
    '    vec2 id1 = vec2(0.0);',
    '    for (int j = -1; j <= 1; j++) {',
    '      for (int i = -1; i <= 1; i++) {',
    '        vec2 o = vec2(float(i), float(j));',
    '        vec2 cid = ig + o;',
    '        vec2 h = hash22(cid);',
    '        vec2 cc = o + 0.2 + 0.6 * h + 0.06 * vec2(sin(t * 1.1 + h.x * 6.28), cos(t * 0.9 + h.y * 6.28));',
    '        vec2 d = cc - fg;',
    '        float dist = dot(d, d);',
    '        if (dist < F1) { F2 = F1; F1 = dist; id1 = cid; }',
    '        else if (dist < F2) F2 = dist;',
    '      }',
    '    }',
    '    float edge = sqrt(F2) - sqrt(F1);',
    '    float net = exp(-edge * edge * 160.0) + 0.3 * exp(-edge * 10.0);',
    '    float hc = hash12(id1 * 1.3 + 0.7);',
    '    float twk = pow(0.5 + 0.5 * sin(t * (1.5 + 2.0 * hc) + hc * 40.0 + R.y * 3.0), 2.0);',
    '    float patch = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(R.y * 1.9 + bk * 2.0 + t * 0.25) * sin(R.y * 0.7 - t * 0.1 + hc));',
    '    float wave = exp(-pow(fract(R.y * 0.25 - uBeat.z * 0.5 - bk * 0.1) * 3.0, 2.0));',
    '    float au = clamp(best, 0.0, 1.0);',
    '    float nI = (0.08 + 0.35 * patch + 0.6 * twk * (0.3 + mids) + 1.3 * wave * kick + 0.3 * uPulse.x) * (0.12 + 0.88 * au * au) * (1.0 - smoothstep(0.95, 1.1, best));',
    '    float fade = 1.0 / (0.4 + R.w * R.w * 0.6);',
    '    vec3 lc = mix(glowC, uvc, smoothstep(0.8, 1.7, R.w) * 0.5);',
    '    col += (lc * nI + noteL * 1.8) * net * fade * (0.9 + 0.3 * uPulse.w);',
    '  }',
    // the particulate field
    '  col += mix(glowC, vec3(0.9, 1.0, 1.0), 0.5) * particles(p, t) * (0.12 + 0.35 * uSpec.w + 0.5 * noteA);',
    '  col += uGlow * 0.01;',
    '  col += sparkles(p0) * 0.2;',
    '  col *= 1.0 + 0.1 * (hash12(fc + fract(t * 0.63) * 137.0) - 0.5);',
    '  col *= 1.0 - 0.5 * smoothstep(0.4, 1.1, length(p0 * vec2(0.8, 1.0)));',
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

  var COMMON_UNIFORMS = ['uRes', 'uTime', 'uFade', 'uPulse', 'uSpec', 'uMood', 'uGlow', 'uPal', 'uN', 'uC', 'uSpk', 'uBeat'];

  // Display programs, by MODES[].prog. fs: shader body (COMMON is prepended); extra: its own uniforms;
  // tex: the sampler that receives the mode's sim texture.
  var PROGRAMS = {
    bloom: { fs: FS_BLOOM, extra: ['uSim'], tex: 'uSim' },
    kaleido: { fs: FS_KALEIDO, extra: [] },
    drift: { fs: FS_DRIFT, extra: ['uCamZ'] },
    lava: { fs: FS_LAVA, extra: [] },
    bauhaus: { fs: FS_BAUHAUS, extra: [] },
    mosaic: { fs: FS_MOSAIC, extra: [] },
    gridrun: { fs: FS_GRIDRUN, extra: ['uCamZ'] },
    swarm: { fs: FS_SWARM, extra: [] },
    coral: { fs: FS_CORAL, extra: ['uSim', 'uTexel'], tex: "uSim" },
    hallway: { fs: FS_HALLWAY, extra: ['uCamZ'] },
    void: { fs: FS_VOID, extra: [] },
    factory: { fs: FS_FACTORY, extra: ['uCamZ'] },
    scope: { fs: FS_SCOPE, extra: [] },
    roots: { fs: FS_ROOTS, extra: [] }
  };
  // Feedback simulations, by MODES[].sim. Each is a ping-pong pair at simSize(); passes = iterations per frame;
  // clear = value the buffers are reset to on mode entry; optional = the display pass still runs without it.
  var SIMS = {
    ink: { prog: 'sim', fs: FS_SIM, extra: ['uPrev', 'uTexel', 'uAsp', 'uDt60', 'uDecay', 'uInject'], clear: [0, 0, 0, 1], passes: 1, optional: true },
    rd: { prog: "rdsim", fs: FS_RD, extra: ['uPrev', 'uTexel', 'uAsp', 'uDt60', 'uPass', 'uWarm'], clear: [1, 0, 0, 1], passes: 3, optional: false }
  };

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
    var progs = {}, quadBuf = null, sims = {}, snapTex = null, snapOn = false, snapT = 0;
    var drawnMode = -1, fellBack = false;
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

    function freeSim(key) {
      var sim = sims[key];
      if (!sim) return;
      for (var i = 0; i < 2; i++) { gl.deleteFramebuffer(sim.t[i].fb); gl.deleteTexture(sim.t[i].tex); }
      delete sims[key];
    }

    function clearSim(key) {
      var sim = sims[key], c = SIMS[key].clear;
      if (!sim) return;
      for (var k = 0; k < 2; k++) { gl.bindFramebuffer(gl.FRAMEBUFFER, sim.t[k].fb); gl.clearColor(c[0], c[1], c[2], c[3]); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function buildSim(key) {
      freeSim(key);
      var sz = simSize();
      var a = makeTarget(sz[0], sz[1], inkType), b = a && makeTarget(sz[0], sz[1], inkType);
      if (!a || !b) { if (a) { gl.deleteFramebuffer(a.fb); gl.deleteTexture(a.tex); } return false; }
      sims[key] = { w: sz[0], h: sz[1], t: [a, b], cur: 0 };
      clearSim(key);
      return true;
    }

    // (Re)build every sim whose program compiled; a sim that cannot get a buffer loses its program.
    function buildSims(force) {
      var sz = simSize();
      for (var key in SIMS) {
        if (!SIMS.hasOwnProperty(key) || !progs[SIMS[key].prog]) continue;
        var sim = sims[key];
        if (force || !sim || Math.abs(sz[0] - sim.w) > 2 || Math.abs(sz[1] - sim.h) > 2) {
          if (!buildSim(key)) progs[SIMS[key].prog] = null;
        }
      }
    }

    function simNeeded() {
      for (var key in SIMS) if (SIMS.hasOwnProperty(key) && progs[SIMS[key].prog]) return true;
      return false;
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

    function anyModeProgram() {
      for (var i = 0; i < MODES.length; i++) if (progs[MODES[i].prog]) return true;
      return false;
    }

    function buildGL() {
      glOK = false; progs = {}; sims = {}; snapTex = null; snapOn = false; tex2D = null;
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
      if (progs.blit) { gl.useProgram(progs.blit.p); gl.uniform1i(progs.blit.u.uTex, 0); }
      var key, P;
      for (key in PROGRAMS) {
        if (!PROGRAMS.hasOwnProperty(key)) continue;
        P = progs[key] = makeProgram(PROGRAMS[key].fs, PROGRAMS[key].extra, head);
        if (!P) warn('mode program "' + key + '" failed to compile; its mode will fall back');
        else if (PROGRAMS[key].tex) { gl.useProgram(P.p); gl.uniform1i(P.u[PROGRAMS[key].tex], 0); }
      }
      for (key in SIMS) {
        if (!SIMS.hasOwnProperty(key)) continue;
        P = progs[SIMS[key].prog] = makeProgram(SIMS[key].fs, SIMS[key].extra, head);
        if (!P) warn('sim program "' + key + '" failed to compile');
        else { gl.useProgram(P.p); gl.uniform1i(P.u.uPrev, 0); }
      }
      buildSims(true);
      blit2D = !anyModeProgram() && !!progs.blit;
      if (blit2D) { warn('WebGL shaders unavailable, using Canvas 2D look'); init2D(); }
      glOK = !!progs.blit || anyModeProgram();
      warmT = 0;
    }

    // a mode is drawable when its display program compiled and (unless the sim is optional) its sim is ready
    function usable(i) {
      var M = MODES[i];
      if (!M || !progs[M.prog]) return false;
      if (M.sim && !SIMS[M.sim].optional && !(progs[SIMS[M.sim].prog] && sims[M.sim])) return false;
      return true;
    }

    function pickDrawMode() {
      if (usable(mode)) return mode;
      for (var i = 0; i < MODES.length; i++) if (usable(i)) return i;
      return -1;
    }

    function onLost(e) { e.preventDefault(); glOK = false; sims = {}; progs = {}; snapTex = null; snapOn = false; }
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
      if (isGL && glOK && simNeeded()) buildSims(force);
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
      if (i == null) { i = Math.round(num(name, -1)); if (!(i >= 0 && i < MODES.length)) return; }
      if (i === mode && pendingMode < 0) return;
      if (isGL && glOK && !blit2D && running && frames > 0) pendingMode = i;
      else enterMode(i);
    }

    function enterMode(i) {
      mode = i;
      var M = MODES[i];
      if (M.sim && isGL && glOK && sims[M.sim]) { clearSim(M.sim); warmT = 0; }
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
        var grow = smooth01(n.age / n.life), layout = MODES[mode].layout;
        if (layout === 0) {
          NB[o] = (n.spread - 0.5) * asp * 0.86;
          NB[o + 1] = (n.pn - 0.5) * 0.78 + n.age * 0.012;
          NB[o + 2] = n.size * (0.05 + 0.035 * n.vel) * (1 + 0.5 * grow);
          NB[o + 3] = n.s;
          NC[o + 3] = n.age;
        } else if (layout === 1) {
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
      var ph = beat - Math.floor(beat);
      gl.uniform4f(u.uBeat, beat, Math.floor(beat / 4), ph, playAmt);
    }

    // per-mode uniforms beyond COMMON
    function modeUniforms(M, P) {
      var u = P.u;
      if (u.uCamZ) gl.uniform1f(u.uCamZ, camZ);
      if (u.uTexel) { var s = M.sim && sims[M.sim]; gl.uniform2f(u.uTexel, s ? 1 / s.w : 1 / 448, s ? 1 / s.h : 1 / 300); }
    }

    // per-sim uniforms; pass = iteration index within the frame
    function simUniforms(key, P, sim, dt, pass) {
      var u = P.u;
      gl.uniform2f(u.uTexel, 1 / sim.w, 1 / sim.h);
      gl.uniform1f(u.uAsp, sim.w / sim.h);
      if (key === 'ink') {
        var d60 = Math.min(dt * 60, 6);
        gl.uniform1f(u.uDt60, d60);
        gl.uniform1f(u.uDecay, Math.pow(0.985, d60));
        gl.uniform1f(u.uInject, 0.003 * (1 + 7 * (1 - smooth01(warmT / 1.8))));
      } else if (key === 'rd') {
        gl.uniform1f(u.uDt60, Math.min(dt * 60, 3));
        gl.uniform1f(u.uPass, pass);
        gl.uniform1f(u.uWarm, smooth01(warmT / 3));
      }
    }

    function draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

    function renderGL(dt, lvlP) {
      if (!glOK || gl.isContextLost()) return;
      if (blit2D) { render2D(off2Dctx, bw, bh, lvlP); blitCanvas(); return; }
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      var mi = pickDrawMode();
      if (mi < 0) return;
      drawnMode = mi; fellBack = mi !== mode;
      var M = MODES[mi], P;
      var S = M.sim ? SIMS[M.sim] : null, sim = S ? sims[M.sim] : null, SP = S ? progs[S.prog] : null;
      if (S && sim && SP) {
        for (var pass = 0; pass < S.passes; pass++) {
          var dst = sim.cur ^ 1;
          gl.bindFramebuffer(gl.FRAMEBUFFER, sim.t[dst].fb);
          gl.viewport(0, 0, sim.w, sim.h);
          gl.useProgram(SP.p); setCommon(SP, lvlP);
          simUniforms(M.sim, SP, sim, dt, pass);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sim.t[sim.cur].tex);
          draw();
          sim.cur = dst;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, bw, bh);
      P = progs[M.prog]; gl.useProgram(P.p); setCommon(P, lvlP);
      modeUniforms(M, P);
      gl.activeTexture(gl.TEXTURE0);
      if (sim) gl.bindTexture(gl.TEXTURE_2D, sim.t[sim.cur].tex);
      draw();
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
      var spr, look = MODES[mode].look2d;
      if (look === 1) {
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
      } else if (look === 2) {
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
      modes: modeList(),
      beatClock: beatClock,
      note: note,
      noteOff: noteOff,
      chord: chord,
      level: level,
      spectrum: spectrum,
      hit: hit,
      destroy: destroy,
      // diagnostics: which programs compiled, which mode actually drew, whether that was a fallback
      stats: function () {
        var compiled = {}, k;
        for (k in PROGRAMS) if (PROGRAMS.hasOwnProperty(k)) compiled[k] = !!progs[k];
        for (k in SIMS) if (SIMS.hasOwnProperty(k)) compiled[SIMS[k].prog] = !!progs[SIMS[k].prog];
        compiled.blit = !!progs.blit;
        var simsOK = {};
        for (k in SIMS) if (SIMS.hasOwnProperty(k)) simsOK[k] = !!sims[k];
        var missing = [];
        for (var i = 0; i < MODES.length; i++) if (isGL && !blit2D && !usable(i)) missing.push(MODES[i].id);
        return { renderer: isGL ? (blit2D ? 'webgl-2d-blit' : 'webgl') : 'canvas2d', mode: MODES[mode].id,
          drawn: drawnMode >= 0 ? MODES[drawnMode].id : null, fallback: fellBack, compiled: compiled, sims: simsOK, unusable: missing };
      }
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
    // test hooks: frames rendered so far; override a sim's iterations per frame (0 restores the default)
    api._frames = function () { return frames; };
    api._simPasses = function (key, n) { if (SIMS[key]) SIMS[key].passes = n > 0 ? Math.round(n) : SIMS[key].passes0; };
    for (var sk in SIMS) if (SIMS.hasOwnProperty(sk) && SIMS[sk].passes0 == null) SIMS[sk].passes0 = SIMS[sk].passes;
    // test hook: render n frames of the current mode back to back and wait for the GPU; returns ms per frame
    // (a one-pixel readback is the drain: gl.finish() returns early under Chrome's command buffer)
    api._bench = function (n) {
      if (!isGL || !glOK || blit2D || !(cssW > 0)) return null;
      n = n > 0 ? n : 10;
      var lv = update(1 / 60); packNotes();
      var px = new Uint8Array(4);
      function drain() { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      renderGL(1 / 60, lv); drain();
      var t0 = now();
      for (var i = 0; i < n; i++) renderGL(1 / 60, lv);
      drain();
      return (now() - t0) / n;
    };
    // test hook: histogram of one channel of a sim buffer (readback may be unsupported for float targets)
    api._simHist = function (key, ch) {
      var sim = sims[key]; if (!sim || !isGL) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim.t[sim.cur].fb);
      var type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE), fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
      var HALF = 0x8D61, half = type === HALF, n = sim.w * sim.h * 4, hist = [], i;
      var buf = type === gl.FLOAT ? new Float32Array(n) : half ? new Uint16Array(n) : new Uint8Array(n);
      try { gl.readPixels(0, 0, sim.w, sim.h, fmt, type, buf); } catch (e) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { error: String(e) }; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      for (i = 0; i < 10; i++) hist.push(0);
      function h2f(h) { var s = h >> 15 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * m * Math.pow(2, -24) : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * Math.pow(2, e - 15); }
      var sc = type === gl.FLOAT || half ? 1 : 1 / 255;
      for (i = (ch || 0); i < n; i += 4) { var v = (half ? h2f(buf[i]) : buf[i]) * sc; if (v === v) hist[Math.max(0, Math.min(9, Math.floor(v * 10)))]++; }
      return { type: type === gl.FLOAT ? 'float' : half ? 'half' : 'ubyte', fmt: fmt, hist: hist, err: gl.getError() };
    };
    return api;
  }

  window.NBVisuals = { create: create, modes: modeList() };
})();
