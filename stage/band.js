/* band.js - NBBand: tiny Web Audio backing band (bass line + drum machine).
 * Classic script, no dependencies. Defines window.NBBand.
 *
 *   var band = NBBand.create(ctx, destinationNode);
 *   band.set({ style, bass, bassLvl, drumLvl, chord: { root: 0-11, q } });
 *   band.playStep(step, time, stepDur);   // one 16th step, scheduled at ctx time `time`
 *   band.hit(drumId, time, vel);          // single drum hit (vel 0..1)
 *   band.note(midi, time, dur, vel);      // single bass note on the current engine
 *   band.styles / band.basses             // [{ id, name }]
 *   band.out                              // output GainNode (connected to destinationNode)
 *   band.lastHits                         // last <= 64 events [{ t, kind, id | midi }]
 *   band.get()                            // (extra) current settings
 *   NBBand.bassMidi(root, q, semis)       // (extra) MIDI note rule used by playStep
 *
 * Signal chain: voices -> drum bus / bass bus (28 Hz HPF) -> soft limiter (WaveShaper,
 * linear below 0.6, saturates smoothly towards 0.94, zero latency) -> out -> destination.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- data
  var STYLE_DEFS = [
    { id: 'house', name: 'House', swing: 0.0,
      pat: { kick: 'x...x...x...x...', clap: '....x.......x...', oh: '..x...x...x...x.' },
      bass: [[0, 0, 2], [2, 0, 1], [4, 0, 2], [6, 0, 1], [8, 0, 2], [10, 7, 1], [12, 0, 2], [14, 12, 1]] },
    { id: 'pop', name: 'Pop', swing: 0.0,
      pat: { kick: 'x...x...x...x...', snare: '....x.......x...', oh: '..x...x...x...x.', ch: 'x...x...x...x...' },
      bass: [[0, 0, 4], [4, 0, 2], [6, 0, 2], [8, 7, 4], [12, 0, 2], [14, 5, 2]] },
    { id: 'funk', name: 'Funk', swing: 0.15,
      pat: { kick: 'x..x..x...x..x..', snare: '....x..x.x..x...', ch: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 0, 1], [3, 0, 1], [6, 12, 1], [7, 10, 1], [8, 0, 1], [10, 7, 1], [11, 0, 1], [13, 12, 1], [14, 10, 1]] },
    { id: 'hiphop', name: 'Hip-hop', swing: 0.35,
      pat: { kick: 'x......x..x.....', snare: '....x.......x...', ch: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 0, 6], [7, 0, 1], [8, 0, 4], [12, 7, 2], [14, 5, 2]] },
    { id: 'lofi', name: 'Lo-fi', swing: 0.55,
      pat: { kick: 'x......x..x.....', rim: '....x.......x...', ch: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 0, 8], [8, 7, 4], [12, 0, 4]] },
    { id: 'rock', name: 'Rock', swing: 0.0,
      pat: { kick: 'x.....x.x.......', snare: '....x.......x...', ch: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 0, 2], [2, 0, 2], [4, 0, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 7, 2]] },
    { id: 'latin', name: 'Latin', swing: 0.0,
      pat: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', ch: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 0, 3], [3, 0, 3], [6, 7, 2], [8, 0, 2], [11, 7, 1], [12, 12, 2], [14, 7, 2]] },
    { id: 'techno', name: 'Techno', swing: 0.0,
      pat: { kick: 'x...x...x...x...', ch: '..x...x...x...x.', rim: '......x.......x.', tom: '..........x.....' },
      bass: [[2, 0, 1], [6, 0, 1], [10, 0, 1], [14, 0, 1], [0, -12, 1], [8, -12, 1]] },
    { id: 'trap', name: 'Trap', swing: 0.0,
      pat: { kick: 'x.....x...x.....', clap: '........x.......', ch: 'xxxxxxxxxxxxxxxx' },
      bass: [[0, 0, 8], [8, 0, 3], [11, 3, 1], [12, 0, 4]] }
  ];

  var BASS_DEFS = [
    { id: 'mono', name: 'Mono' }, { id: 'sync', name: 'Sync' }, { id: 'analog', name: 'Analog' },
    { id: 'pluck', name: 'Pluck' }, { id: 'saw', name: 'Saw' }, { id: 'fm', name: 'FM' },
    { id: 'hoover', name: 'Hoover' }
  ];

  // Scheduling order inside a step: ch last so a same-time closed hat chokes an open hat.
  var DRUM_ORDER = ['kick', 'snare', 'clap', 'rim', 'tom', 'cow', 'oh', 'ch'];
  var MINOR_Q = { min: 1, min7: 1, dim: 1 };
  var MAX_HITS = 64;

  // Pre-index styles: per style, per step -> drum ids and bass notes.
  var STYLES = {};
  STYLE_DEFS.forEach(function (d) {
    var drums = [], bass = [], s, k, id;
    for (s = 0; s < 16; s++) { drums.push([]); bass.push([]); }
    for (k = 0; k < DRUM_ORDER.length; k++) {
      id = DRUM_ORDER[k];
      if (!d.pat[id]) continue;
      for (s = 0; s < 16; s++) if (d.pat[id].charAt(s) === 'x') drums[s].push(id);
    }
    d.bass.forEach(function (e) { bass[e[0]].push(e); });
    STYLES[d.id] = { id: d.id, name: d.name, swing: d.swing, drums: drums, bass: bass };
  });

  function bassMidi(root, q, semis) {
    if (MINOR_Q[q] && (((semis % 12) + 12) % 12) === 4) semis -= 1;
    return 36 + root + semis;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp01(v) { v = +v; return v > 1 ? 1 : (v > 0 ? v : 0); }

  // Output levels (linear, at vel 1). Tuned so drumLvl 0.8 + bassLvl 0.7 peaks near -6 dBFS.
  var LV = {
    kick: 0.40, kickClick: 0.08, snTone: 0.09, snNoise: 0.13, clap: 0.75,
    ch: 0.22, oh: 0.18, tom: 0.38, rim: 0.21, rimClick: 0.07, cow: 0.20
  };

  // Soft limiter curve: identity up to |0.6|, tanh knee towards 0.94. Shaper input is pre-scaled
  // by 0.5 so the curve covers signal levels -2..+2 (beyond that it holds at the ceiling).
  function makeCurve() {
    var N = 4097, c = new Float32Array(N), T = 0.6, L = 0.94, K = L - T, i, y, a, o;
    for (i = 0; i < N; i++) {
      y = ((i / (N - 1)) * 2 - 1) * 2;
      a = Math.abs(y);
      o = a <= T ? a : T + K * Math.tanh((a - T) / K);
      c[i] = y < 0 ? -o : o;
    }
    return c;
  }

  // ---------------------------------------------------------------- engine
  function create(ctx, destination) {
    destination = destination || ctx.destination;
    var sr = ctx.sampleRate;

    // Shared noise buffer (2 s, deterministic xorshift so renders repeat exactly).
    var noiseLen = Math.floor(sr * 2);
    var noiseBuf = ctx.createBuffer(1, noiseLen, sr);
    var nd = noiseBuf.getChannelData(0), seed = 0x2545F491, i;
    for (i = 0; i < noiseLen; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      nd[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    var rnd = 0x1234567;
    function rand() { rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5; return (rnd >>> 0) / 4294967296; }

    // Bus / master chain.
    var out = ctx.createGain(); out.gain.value = 1; out.connect(destination);
    var shaper = ctx.createWaveShaper(); shaper.curve = makeCurve(); shaper.oversample = 'none';
    shaper.connect(out);
    var pre = ctx.createGain(); pre.gain.value = 0.5; pre.connect(shaper);
    var drumBus = ctx.createGain(); drumBus.connect(pre);
    var bassHP = ctx.createBiquadFilter(); bassHP.type = 'highpass'; bassHP.frequency.value = 28;
    bassHP.Q.value = -3; bassHP.connect(pre);
    var bassBus = ctx.createGain(); bassBus.connect(bassHP);

    var state = { style: 'house', bass: 'mono', bassLvl: 0.7, drumLvl: 0.8, chord: { root: 0, q: 'maj' } };
    var lastHits = [];
    var openHat = null;

    function log(ev) { lastHits.push(ev); if (lastHits.length > MAX_HITS) lastHits.shift(); }
    function now() { return ctx.currentTime; }

    // --- node helpers
    function osc(type, f, list) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; list.push(o); return o; }
    function gain(v, list) { var g = ctx.createGain(); g.gain.value = v; list.push(g); return g; }
    function filt(type, f, q, list) {
      var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; list.push(b); return b;
    }
    function noise(t, list) {
      var n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      n.start(t, rand() * 1.5); list.push(n); return n;
    }
    function cleanup(src, list) {
      src.onended = function () {
        for (var k = 0; k < list.length; k++) { try { list[k].disconnect(); } catch (e) { /* already */ } }
        src.onended = null;
      };
    }
    // Linear attack, exponential decay to -60 dB, short linear tail to exactly 0. Returns stop time.
    function perc(p, t, peak, atk, dec) {
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(peak, t + atk);
      p.exponentialRampToValueAtTime(peak * 0.001, t + atk + dec);
      p.linearRampToValueAtTime(0, t + atk + dec + 0.004);
      return t + atk + dec + 0.006;
    }

    // --- drums (each returns nothing; nodes per hit noted)
    var DRUMS = {
      kick: function (t, v) {                                   // 5 nodes
        var L = [];
        var o = osc('sine', 175, L);
        o.frequency.setValueAtTime(175, t);
        o.frequency.exponentialRampToValueAtTime(95, t + 0.03);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.14);
        var g = gain(0, L), end = perc(g.gain, t, v * LV.kick, 0.0015, 0.42);
        o.connect(g); g.connect(drumBus);
        var n = noise(t, L), bp = filt('bandpass', 3200, 0.9, L), cg = gain(0, L);
        var cEnd = perc(cg.gain, t, v * LV.kickClick, 0.0005, 0.012);
        n.connect(bp); bp.connect(cg); cg.connect(drumBus);
        o.start(t); o.stop(end); n.stop(cEnd);
        cleanup(o, L);
      },
      snare: function (t, v) {                                  // 7 nodes
        var L = [];
        var o1 = osc('triangle', 200, L), o2 = osc('sine', 335, L), tg = gain(0, L);
        o1.frequency.setValueAtTime(205, t); o1.frequency.exponentialRampToValueAtTime(178, t + 0.04);
        o2.frequency.setValueAtTime(340, t); o2.frequency.exponentialRampToValueAtTime(300, t + 0.04);
        var tEnd = perc(tg.gain, t, v * LV.snTone, 0.001, 0.13);
        o1.connect(tg); o2.connect(tg); tg.connect(drumBus);
        var n = noise(t, L), hp = filt('highpass', 1400, -1, L), ng = gain(0, L);
        var end = perc(ng.gain, t, v * LV.snNoise, 0.001, 0.22);
        n.connect(hp); hp.connect(ng); ng.connect(drumBus);
        o1.start(t); o2.start(t); o1.stop(tEnd); o2.stop(tEnd); n.stop(end);
        cleanup(n, L);
      },
      clap: function (t, v) {                                   // 4 nodes
        var L = [];
        var n = noise(t, L), bp = filt('bandpass', 1150, 1.1, L), hp = filt('highpass', 650, -3, L), g = gain(0, L);
        var p = g.gain, pk = v * LV.clap, k, b;
        p.setValueAtTime(0, t);
        for (k = 0; k < 3; k++) {
          b = t + k * 0.0105;
          p.linearRampToValueAtTime(pk, b + 0.0008);
          p.exponentialRampToValueAtTime(pk * 0.12, b + 0.0095);
        }
        b = t + 0.0315;
        p.linearRampToValueAtTime(pk * 0.85, b + 0.001);
        p.exponentialRampToValueAtTime(pk * 0.001, b + 0.2);
        p.linearRampToValueAtTime(0, b + 0.204);
        n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(drumBus);
        n.stop(b + 0.206);
        cleanup(n, L);
      },
      ch: function (t, v) {                                     // 4 nodes
        chokeOpenHat(t);
        var L = [];
        var n = noise(t, L), hp = filt('highpass', 7000, -1, L), bp = filt('bandpass', 10000, 0.9, L), g = gain(0, L);
        var end = perc(g.gain, t, v * LV.ch, 0.0008, 0.055);
        n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(drumBus);
        n.stop(end);
        cleanup(n, L);
      },
      oh: function (t, v) {                                     // 5 nodes
        chokeOpenHat(t);                                        // hat voice is monophonic
        var L = [];
        var n = noise(t, L), hp = filt('highpass', 6500, -1, L), bp = filt('bandpass', 9500, 0.8, L);
        var g = gain(0, L), cg = gain(1, L);
        var end = perc(g.gain, t, v * LV.oh, 0.001, 0.40);
        n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(cg); cg.connect(drumBus);
        n.stop(end);
        var h = { cg: cg, src: n, start: t, end: end };
        openHat = h;
        cleanup(n, L);
        var prev = n.onended;
        n.onended = function () { if (openHat === h) openHat = null; prev(); };
      },
      tom: function (t, v) {                                    // 2 nodes
        var L = [];
        var o = osc('sine', 170, L), g = gain(0, L);
        o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(98, t + 0.2);
        var end = perc(g.gain, t, v * LV.tom, 0.002, 0.36);
        o.connect(g); g.connect(drumBus);
        o.start(t); o.stop(end);
        cleanup(o, L);
      },
      rim: function (t, v) {                                    // 7 nodes
        var L = [];
        var o1 = osc('triangle', 1700, L), o2 = osc('sine', 455, L), g = gain(0, L), hp = filt('highpass', 260, -3, L);
        var end = perc(g.gain, t, v * LV.rim, 0.0005, 0.04);
        o1.connect(g); o2.connect(g); g.connect(hp); hp.connect(drumBus);
        var n = noise(t, L), bp = filt('bandpass', 4800, 1.2, L), cg = gain(0, L);
        var cEnd = perc(cg.gain, t, v * LV.rimClick, 0.0003, 0.008);
        n.connect(bp); bp.connect(cg); cg.connect(drumBus);
        o1.start(t); o2.start(t); o1.stop(end); o2.stop(end); n.stop(cEnd);
        cleanup(o1, L);
      },
      cow: function (t, v) {                                    // 5 nodes
        var L = [];
        var o1 = osc('square', 540, L), o2 = osc('square', 800, L), g = gain(0, L);
        var bp = filt('bandpass', 1650, 1.1, L), hp = filt('highpass', 380, -3, L);
        var p = g.gain, pk = v * LV.cow;
        p.setValueAtTime(0, t);
        p.linearRampToValueAtTime(pk, t + 0.001);
        p.exponentialRampToValueAtTime(pk * 0.3, t + 0.03);
        p.exponentialRampToValueAtTime(pk * 0.001, t + 0.34);
        p.linearRampToValueAtTime(0, t + 0.344);
        o1.connect(g); o2.connect(g); g.connect(bp); bp.connect(hp); hp.connect(drumBus);
        o1.start(t); o2.start(t); o1.stop(t + 0.346); o2.stop(t + 0.346);
        cleanup(o1, L);
      }
    };

    function chokeOpenHat(t) {
      var h = openHat;
      if (!h || t < h.start || t >= h.end) return;
      h.cg.gain.setValueAtTime(1, t);
      h.cg.gain.linearRampToValueAtTime(0, t + 0.012);
      try { h.src.stop(t + 0.014); } catch (e) { /* ignore */ }
      openHat = null;
    }

    function drum(id, t, v) {
      var fn = DRUMS[id];
      if (!fn || !(v > 0.0005)) return;
      t = Math.max(t, now());
      fn(t, v);
      log({ t: t, kind: 'drum', id: id });
    }

    // --- bass engines
    // amp ADSR: a (s, linear), d (time constant), s (fraction), r (s, linear release after dur).
    function adsr(p, t, dur, peak, a, d, s, r) {
      p.setValueAtTime(0, t);
      var vEnd;
      if (dur > a) {
        p.linearRampToValueAtTime(peak, t + a);
        p.setTargetAtTime(peak * s, t + a, d);
        vEnd = peak * s + (peak - peak * s) * Math.exp(-(dur - a) / d);
        p.setValueAtTime(vEnd, t + dur);
      } else {
        vEnd = peak * dur / a;
        p.linearRampToValueAtTime(vEnd, t + dur);
      }
      p.linearRampToValueAtTime(0, t + dur + r);
      return t + dur + r;
    }
    function fenv(p, t, from, to, tau) { p.setValueAtTime(from, t); p.setTargetAtTime(to, t, tau); }

    // Each build(f, t, dur, vel, S, L) creates sources (pushed to S and L) and returns the node
    // that feeds the per-note amp. Node counts include the amp.
    var ENGINES = {
      mono: { lvl: 0.147, a: 0.004, d: 0.25, s: 0.75, r: 0.05,          // 6 nodes
        build: function (f, t, dur, vel, S, L) {
          var o1 = osc('sawtooth', f, L), o2 = osc('square', f / 2 >= 27 ? f / 2 : f, L), g2 = gain(0.55, L);
          S.push(o1, o2);
          var lp1 = filt('lowpass', 1000, -3, L), lp2 = filt('lowpass', 1000, 7, L);
          var base = Math.min(f * 1.6 + 140, 2000), top = Math.min(base + 2000 + 1600 * vel, 9000);
          fenv(lp1.frequency, t, top, base, 0.09); fenv(lp2.frequency, t, top, base, 0.09);
          o1.connect(lp1); o2.connect(g2); g2.connect(lp1); lp1.connect(lp2);
          return lp2;
        } },
      sync: { lvl: 0.102, a: 0.003, d: 0.3, s: 0.8, r: 0.05,            // 6 nodes
        build: function (f, t, dur, vel, S, L) {
          var o = osc('sawtooth', f, L), o2 = osc('square', f, L), g2 = gain(0.35, L);
          S.push(o, o2);
          var pk = filt('peaking', f * 6, 3.5, L); pk.gain.value = 16;
          var lp = filt('lowpass', f * 9, -1, L);
          fenv(pk.frequency, t, Math.min(f * 7.5, 8000), f * 2.2, 0.11);
          fenv(lp.frequency, t, Math.min(f * 12, 12000), f * 3.5 + 200, 0.11);
          o.connect(pk); pk.connect(lp); o2.connect(g2); g2.connect(lp);
          return lp;
        } },
      analog: { lvl: 0.116, a: 0.006, d: 0.4, s: 0.85, r: 0.06,         // 4 nodes
        build: function (f, t, dur, vel, S, L) {
          var o1 = osc('sawtooth', f, L), o2 = osc('sawtooth', f, L);
          o1.detune.value = -7; o2.detune.value = 7;
          S.push(o1, o2);
          var lp = filt('lowpass', 1000, 1.5, L);
          fenv(lp.frequency, t, Math.min(f * 10 + 900, 6000), f * 3.2 + 260, 0.16);
          o1.connect(lp); o2.connect(lp);
          return lp;
        } },
      pluck: { lvl: 0.125, a: 0.002, d: 0.11, s: 0.0, r: 0.04,          // 3 nodes
        build: function (f, t, dur, vel, S, L) {
          var o = osc('square', f, L); S.push(o);
          var lp = filt('lowpass', 1000, 5, L);
          fenv(lp.frequency, t, Math.min(f * 14 + 1200, 7000), f * 1.3 + 90, 0.045);
          o.connect(lp);
          return lp;
        } },
      saw: { lvl: 0.076, a: 0.003, d: 0.3, s: 0.9, r: 0.045,            // 6 nodes
        build: function (f, t, dur, vel, S, L) {
          var o1 = osc('sawtooth', f, L), o2 = osc('sawtooth', f, L), sub = osc('sine', f, L), gs = gain(0.6, L);
          o2.detune.value = 9;
          S.push(o1, o2, sub);
          var lp = filt('lowpass', 4000, 2, L);
          fenv(lp.frequency, t, Math.min(f * 30 + 3000, 11000), Math.min(f * 12 + 1800, 7000), 0.12);
          o1.connect(lp); o2.connect(lp); sub.connect(gs); gs.connect(lp);
          return lp;
        } },
      fm: { lvl: 0.15, a: 0.002, d: 0.35, s: 0.7, r: 0.05,             // 4 nodes
        build: function (f, t, dur, vel, S, L) {
          var car = osc('sine', f, L), mod = osc('sine', f, L), mg = gain(0, L);
          S.push(car, mod);
          var i0 = 3.5 + 3 * Math.min(vel, 1.1), i1 = 0.9;
          mg.gain.setValueAtTime(i0 * f, t);
          mg.gain.setTargetAtTime(i1 * f, t, 0.08);
          mod.connect(mg); mg.connect(car.frequency);
          return car;
        } },
      hoover: { lvl: 0.072, a: 0.008, d: 0.3, s: 0.9, r: 0.07,          // 8 nodes
        build: function (f, t, dur, vel, S, L) {
          var cs = ctx.createConstantSource(); L.push(cs); S.push(cs);
          cs.offset.setValueAtTime(0, t);
          cs.offset.linearRampToValueAtTime(-380, t + 0.03);
          cs.offset.linearRampToValueAtTime(0, t + 0.12);
          var lp = filt('lowpass', Math.min(f * 24 + 1500, 6000), 0, L);
          var det = [-21, -8, 8, 21], k, o;
          for (k = 0; k < det.length; k++) {
            o = osc('sawtooth', f, L); o.detune.value = det[k]; S.push(o);
            cs.connect(o.detune); o.connect(lp);
          }
          o = osc('sawtooth', f / 2 >= 27 ? f / 2 : f, L); S.push(o);
          cs.connect(o.detune); o.connect(lp);
          return lp;
        } }
    };

    function bassNote(midi, t, dur, vel) {
      var e = ENGINES[state.bass] || ENGINES.mono;
      if (!(vel > 0.0005)) return;
      var t0 = now();
      if (t < t0) { dur = Math.max(0.03, dur - (t0 - t)); t = t0; }   // keep the note-off where it was
      if (!(dur > 0)) dur = 0.08;
      var f = mtof(midi), S = [], L = [];
      var head = e.build(f, t, dur, vel, S, L);
      var amp = gain(0, L);
      var end = adsr(amp.gain, t, dur, vel * e.lvl, e.a, e.d, e.s, e.r);
      head.connect(amp); amp.connect(bassBus);
      for (var k = 0; k < S.length; k++) { S[k].start(t); S[k].stop(end + 0.005); }
      cleanup(S[0], L);
      log({ t: t, kind: 'bass', midi: midi });
    }

    // ---------------------------------------------------------------- public API
    var band = {
      out: out,
      lastHits: lastHits,
      styles: STYLE_DEFS.map(function (d) { return { id: d.id, name: d.name }; }),
      basses: BASS_DEFS.map(function (d) { return { id: d.id, name: d.name }; }),

      set: function (o) {
        if (!o) return band;
        if (o.style != null && STYLES[o.style]) state.style = o.style;
        if (o.bass != null && ENGINES[o.bass]) state.bass = o.bass;
        if (o.bassLvl != null && isFinite(o.bassLvl)) state.bassLvl = clamp01(o.bassLvl);
        if (o.drumLvl != null && isFinite(o.drumLvl)) state.drumLvl = clamp01(o.drumLvl);
        if (o.chord) {
          var r = o.chord.root != null && isFinite(o.chord.root) ? o.chord.root : state.chord.root;
          state.chord = { root: ((Math.round(r) % 12) + 12) % 12, q: o.chord.q != null ? String(o.chord.q) : state.chord.q };
        }
        return band;
      },

      get: function () {
        return { style: state.style, bass: state.bass, bassLvl: state.bassLvl, drumLvl: state.drumLvl,
          chord: { root: state.chord.root, q: state.chord.q } };
      },

      playStep: function (step, time, stepDur) {
        var st = STYLES[state.style];
        var s = ((Math.floor(step) % 16) + 16) % 16, k, e, ids, sd = stepDur > 0 ? stepDur : 0.125;
        var t = time + ((s & 1) ? st.swing * sd * 0.5 : 0);
        if (state.drumLvl > 0) {
          ids = st.drums[s];
          for (k = 0; k < ids.length; k++) {
            // mild hat accents: quarter > eighth > sixteenth
            var acc = ids[k] === 'ch' ? (s % 4 === 0 ? 1 : (s % 2 === 0 ? 0.82 : 0.66)) : 1;
            drum(ids[k], t, state.drumLvl * acc);
          }
        }
        if (state.bassLvl > 0) {
          ids = st.bass[s];
          for (k = 0; k < ids.length; k++) {
            e = ids[k];
            bassNote(bassMidi(state.chord.root, state.chord.q, e[1]), t,
              Math.max(0.08, e[2] * sd * 0.92), state.bassLvl * 1.1);
          }
        }
      },

      hit: function (drumId, time, vel) {
        drum(drumId, time == null ? now() : time, vel == null ? 1 : Math.max(0, Math.min(1, vel)));
      },

      note: function (midi, time, dur, vel) {
        bassNote(midi, time == null ? now() : time, dur > 0 ? dur : 0.25,
          vel == null ? state.bassLvl * 1.1 : Math.max(0, vel));
      }
    };
    return band;
  }

  global.NBBand = { create: create, bassMidi: bassMidi };
})(typeof window !== 'undefined' ? window : this);
