  // ======================================================================
  // Rhythm Creator: a 16-track drum machine. Each track picks a sound from 808, 909, Analog (modelled),
  // FM, Trap, Hand percussion, Electro/FX or samples, and has its own level, pan, tune, decay, tone,
  // character, filter, drive and length. Steps take accents, flams, rolls, a chance and a nudge.
  // Tools: Euclidean fill, Make a beat, Vary, swing, and Morph between two saved kits.
  //   808 voices follow iO-808 by Vincent Riemer (MIT licence, Copyright (c) 2016 Vincent Riemer):
  //   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  //   documentation files (the "Software"), to deal in the Software without restriction, including without
  //   limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
  //   Software, and to permit persons to whom the Software is furnished to do so, subject to the following
  //   conditions: The above copyright notice and this permission notice shall be included in all copies or
  //   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
  //   The Analog engine ports Mutable Instruments Plaits drum models (Emilie Gillet, MIT licence; notice in RC_AN_SRC).
  //   The Real 808 kit is Michael Fischer's TR-808 sample set (CC0).
  // ======================================================================
  const RC_MAX = 64, RC_NTR = 16;
  const RC_CHANCE = [100, 75, 50, 25, "1:2", "2:2", "1:4", "4:4"];
  const RC_CHANCE_LAB = ["", "75%", "50%", "25%", "1:2", "2:2", "1:4", "4:4"];
  const RC_NUDGE = [0, 0.25, 0.5, -0.5, -0.25];   // of a step
  // [id, group, name, code, role, character label]
  const RC_SOUNDS = [
    ["808:bd", "808", "Kick", "BD", "kick", "Click"], ["808:sd", "808", "Snare", "SD", "snare", "Snappy"], ["808:lt", "808", "Low tom", "LT", "tom", "Noise"], ["808:mt", "808", "Mid tom", "MT", "tom", "Noise"],
    ["808:ht", "808", "High tom", "HT", "tom", "Noise"], ["808:lc", "808", "Low conga", "LC", "perc", "Click"], ["808:mc", "808", "Mid conga", "MC", "perc", "Click"], ["808:hc", "808", "High conga", "HC", "perc", "Click"],
    ["808:rs", "808", "Rim", "RS", "rim", "Snap"], ["808:cl", "808", "Claves", "CL", "perc", "Ring"], ["808:cp", "808", "Clap", "CP", "clap", "Tail"], ["808:ma", "808", "Maracas", "MA", "shaker", "Air"],
    ["808:cb", "808", "Cowbell", "CB", "bell", "Ring"], ["808:cy", "808", "Cymbal", "CY", "cym", "Shimmer"], ["808:ch", "808", "Closed hat", "CH", "ch", "Metal"], ["808:oh", "808", "Open hat", "OH", "oh", "Metal"],
    ["909:bd", "909", "Kick", "BD", "kick", "Attack"], ["909:sd", "909", "Snare", "SD", "snare", "Snappy"], ["909:lt", "909", "Low tom", "LT", "tom", "Noise"], ["909:mt", "909", "Mid tom", "MT", "tom", "Noise"],
    ["909:ht", "909", "High tom", "HT", "tom", "Noise"], ["909:rs", "909", "Rim", "RS", "rim", "Snap"], ["909:cp", "909", "Clap", "CP", "clap", "Tail"], ["909:ch", "909", "Closed hat", "CH", "ch", "Noise"],
    ["909:oh", "909", "Open hat", "OH", "oh", "Noise"], ["909:cr", "909", "Crash", "CR", "cym", "Noise"], ["909:rd", "909", "Ride", "RD", "ride", "Ping"],
    ["an:bd", "Analog", "Analog kick", "AK", "kick", "Punch"], ["an:sd", "Analog", "Analog snare", "AS", "snare", "Snappy"], ["an:sbd", "Analog", "Synth kick", "SK", "kick", "Dirt"],
    ["an:ssd", "Analog", "Synth snare", "SS", "snare", "Snappy"], ["an:mh", "Analog", "Metal hat", "MH", "ch", "Noise"], ["an:rh", "Analog", "Ring hat", "RH", "ch", "Noise"],
    ["fm:bd", "FM", "FM kick", "FK", "kick", "FM"], ["fm:tom", "FM", "FM tom", "FT", "tom", "FM"], ["fm:sd", "FM", "FM snare", "FS", "snare", "Noise"], ["fm:bell", "FM", "FM bell", "FB", "bell", "FM"], ["fm:metal", "FM", "FM metal", "FX", "perc", "FM"],
    ["tr:boom", "Trap", "808 boom", "BM", "boom", "Glide"], ["tr:snap", "Trap", "Snap", "SN", "clap", "Body"], ["tr:clap", "Trap", "Stacked clap", "SC", "clap", "Width"], ["tr:hat", "Trap", "Trap hat", "TH", "ch", "Bright"],
    ["hp:shaker", "Hand percussion", "Shaker", "SH", "shaker", "Grain"], ["hp:tamb", "Hand percussion", "Tambourine", "TB", "shaker", "Jingle"], ["hp:bongohi", "Hand percussion", "Bongo high", "BH", "perc", "Slap"],
    ["hp:bongolo", "Hand percussion", "Bongo low", "BL", "perc", "Slap"], ["hp:timbhi", "Hand percussion", "Timbale high", "TI", "perc", "Ring"], ["hp:timblo", "Hand percussion", "Timbale low", "TL", "perc", "Ring"],
    ["hp:tri", "Hand percussion", "Triangle", "TR", "bell", "Open"], ["hp:agogohi", "Hand percussion", "Agogo high", "AH", "bell", "Ring"], ["hp:agogolo", "Hand percussion", "Agogo low", "AL", "bell", "Ring"],
    ["hp:cabasa", "Hand percussion", "Cabasa", "CA", "shaker", "Grain"],
    ["fx:zap", "Electro & FX", "Zap", "ZP", "fx", "Sweep"], ["fx:riser", "Electro & FX", "Noise riser", "RI", "fx", "Sweep"], ["fx:revcym", "Electro & FX", "Reverse cymbal", "RV", "fx", "Swell"], ["fx:tomdrop", "Electro & FX", "Tom drop", "TD", "tom", "Sweep"],
  ];
  //@include data/rc-f808.js
  const RC_F808_ROLE = { bd: "kick", bdl: "kick", sd: "snare", cp: "clap", ch: "ch", oh: "oh", cy: "cym", cb: "bell", cl: "perc", rs: "rim", ma: "shaker", lt: "tom", mt: "tom", ht: "tom", lc: "perc", mc: "perc", hc: "perc" };
  RC_F808.forEach(s => RC_SOUNDS.push(["f8:" + s.id, "Real 808 (samples)", "808 " + s.name.toLowerCase(), s.id.toUpperCase().slice(0, 2), RC_F808_ROLE[s.id] || "perc", "—"]));
  // Studio kit: recorded drums (Virtuosity Drums, CC0), shown first in the sound list
  const RC_STK = [["kick", "Real kick", "BD", "kick"], ["snare", "Real snare", "SD", "snare"], ["rim", "Real rimshot", "RS", "snare"], ["xstick", "Real cross-stick", "XS", "rim"],
    ["hhc", "Real hi-hat", "HH", "ch"], ["hhp", "Real pedal hat", "PH", "ch"], ["hho", "Real open hat", "OH", "oh"], ["ltom", "Real floor tom", "FT", "tom"], ["mtom", "Real mid tom", "MT", "tom"],
    ["htom", "Real high tom", "HT", "tom"], ["ride", "Real ride", "RD", "ride"], ["bell", "Real ride bell", "RB", "ride"], ["crash", "Real crash", "CR", "cym"]];
  const RC_STP = [["shaker", "Real shaker", "SH", "shaker"], ["tamb", "Real tambourine", "TB", "clap"], ["cowbell", "Real cowbell", "CB", "bell"], ["conga", "Real conga", "CG", "perc"],
    ["tumba", "Real tumba", "TU", "perc"], ["bongoh", "Real bongo high", "BH", "perc"], ["bongol", "Real bongo low", "BL", "perc"], ["claves", "Real claves", "CL", "perc"],
    ["cabasa", "Real cabasa", "CA", "shaker"], ["agogoh", "Real agogo high", "AH", "bell"], ["agogol", "Real agogo low", "AL", "bell"], ["tri", "Real triangle", "TR", "bell"]];
  RC_SOUNDS.unshift(...RC_STK.map(x => ["st:" + x[0], "Studio kit (real drums)", x[1], x[2], x[3], "Room"]), ...RC_STP.map(x => ["st:" + x[0], "Studio percussion (real)", x[1], x[2], x[3], "Room"]));
  const RC_BY = {}; RC_SOUNDS.forEach(s => { RC_BY[s[0]] = { id: s[0], group: s[1], name: s[1] === "808" || s[1] === "909" ? s[1] + " " + s[2].toLowerCase() : s[2], code: s[3], role: s[4], chLab: s[5] }; });
  // samples from the sampler slots, the pads and the kits are added on the fly
  function rcSnd(id) {
    if (RC_BY[id]) return RC_BY[id];
    let m;
    if ((m = /^s(\d)$/.exec(id))) return { id, group: "Sampler", name: "S" + (+m[1] + 1) + (state.samp.slots[+m[1]] && sampBuf[+m[1]] ? " · " + baseName(state.samp.slots[+m[1]].name) : " (empty)"), code: "S" + (+m[1] + 1), role: "perc", chLab: "—" };
    if ((m = /^p(\d+)$/.exec(id))) return { id, group: "Pads", name: "P" + (+m[1] + 1) + (padBuf[+m[1]] ? " · " + baseName(state.pads.names[+m[1]]) : " (empty)"), code: "P" + (+m[1] + 1), role: "perc", chLab: "—" };
    if ((m = /^k:([\w-]+):(\d+)$/.exec(id)) && window.NB_KITS && NB_KITS[m[1]]) { const K = NB_KITS[m[1]], pd = K.pads[+m[2]]; if (pd) return { id, group: "Kits", name: K.name + " · " + pd.name, code: pd.name.slice(0, 2).toUpperCase(), role: /kick/i.test(pd.name) ? "kick" : /snare/i.test(pd.name) ? "snare" : /closed/i.test(pd.name) ? "ch" : /open/i.test(pd.name) ? "oh" : /clap/i.test(pd.name) ? "clap" : "perc", chLab: "—" }; }
    return null;
  }
  const rcEngine = id => id.startsWith("an:") ? "an" : (id.startsWith("st:") || id.startsWith("f8:") || /^s\d$/.test(id) || /^p\d+$/.test(id) || id.startsWith("k:")) ? "smp" : "syn";

  // ---------- the pattern ----------
  const RC_DEFAULT0 = ["909:bd", "909:sd", "808:lt", "808:mt", "808:ht", "808:rs", "909:cp", "909:ch", "909:oh", "909:cr", "909:rd", "808:cb", "an:bd", "hp:shaker", "808:hc", "tr:boom"];   // the kit before the Studio kit
  const RC_DEFAULT = [["st:kick"], ["st:snare"], ["st:ltom"], ["st:mtom"], ["st:htom"], ["st:xstick"], ["st:tamb"], ["st:hhc"], ["st:hho"], ["st:crash"], ["st:ride"], ["st:cowbell"], ["st:hhp"], ["st:shaker"], ["st:conga"], ["tr:boom"]];
  const rcZeros = () => new Array(RC_MAX).fill(0);
  const rcTrack = snd => ({ snd, vol: 0.8, pan: 0, tune: 0, decay: 0.5, tone: 0.5, char: 0.5, ft: "off", ff: 0.75, fq: 0.15, drive: 0, len: 16, mute: false, solo: false,
    on: rcZeros(), acc: rcZeros(), flam: rcZeros(), roll: rcZeros(), prob: rcZeros(), nudge: rcZeros() });
  const RCP = { v: 1, steps: 16, swing: 0, level: 0.85, tracks: RC_DEFAULT.map(([s]) => rcTrack(s)), morph: { a: null, b: null, m: 0 }, style: "Pop", busy: 0.5, cplx: 0.4, feel: 0.35, room: 0.35 };
  const RC_KNOBS = ["vol", "pan", "tune", "decay", "tone", "char", "ff", "fq", "drive"];
  (() => {   // a first beat: a pop groove on the Studio kit
    const T = RCP.tracks, on = (i, steps) => steps.forEach(s => { T[i].on[s] = 1; });
    on(0, [0, 7, 8, 10]); on(1, [4, 12]); on(7, [0, 2, 4, 6, 8, 10, 12]); on(8, [14]); on(6, [4, 12]); [0, 4, 8, 12].forEach(s => { T[7].acc[s] = 1; }); T[0].acc[0] = 1; T[1].acc[4] = T[1].acc[12] = 1;
  })();
  let rcHadSaved = false; try { rcHadSaved = !!localStorage.getItem("nightbloom-rc"); } catch (e) {}
  try {
    const o = JSON.parse(localStorage.getItem("nightbloom-rc") || "null");
    if (o && o.v === 1 && Array.isArray(o.tracks)) {
      Object.assign(RCP, o, { tracks: o.tracks.slice(0, RC_NTR).map(t => Object.assign(rcTrack(t.snd || "909:bd"), t, ...["on", "acc", "flam", "roll", "prob", "nudge"].map(k => ({ [k]: (Array.isArray(t[k]) ? t[k] : []).concat(rcZeros()).slice(0, RC_MAX) })))) });
      while (RCP.tracks.length < RC_NTR) RCP.tracks.push(rcTrack(RC_DEFAULT[RCP.tracks.length][0]));
    }
  } catch (e) {}
  let rcSaveT = 0;
  const rcSave = () => { clearTimeout(rcSaveT); rcSaveT = setTimeout(() => { try { localStorage.setItem("nightbloom-rc", JSON.stringify(RCP)); } catch (e) {} }, 400); };
  const RC = { playing: false, step: 0, nextT: 0, timer: 0, page: 0, sel: 0, mode: "hits", queue: [], bus: null, busTo: null, trk: [], an: null, anReady: null, anLast: 0, samp: {}, ohVoices: new Set(), shown: -1 };
  window.__rcSnap = () => ({ playing: RC.playing, steps: RCP.steps, swing: RCP.swing, level: RCP.level, morph: { a: !!RCP.morph.a, b: !!RCP.morph.b, m: RCP.morph.m },
    tracks: RCP.tracks.map(t => ({ snd: t.snd, hits: t.on.slice(0, t.len).filter(Boolean).length, len: t.len, mute: t.mute, solo: t.solo, vol: t.vol, ft: t.ft, drive: t.drive })), analogNode: !!RC.an });

  // ---------- audio: the bus, each track's chain ----------
  fxcNames.rc = "Rhythm";
  function rcBus() {
    if (!RC.bus) {
      RC.bus = ctx.createGain(); RC.bus.gain.value = RCP.level;
      // gentle glue: the kit moves together, peaks a little tamer (most of the compressor's own make-up gain is taken back out)
      const g = RC.glue = ctx.createDynamicsCompressor(); g.threshold.value = -18; g.knee.value = 12; g.ratio.value = 2; g.attack.value = 0.012; g.release.value = 0.16;
      RC.post = ctx.createGain(); RC.post.gain.value = RC_GLUE_TRIM; RC.post.__soloGroup = "rc";
      RC.bus.connect(g).connect(RC.post);
    }
    const c = fxcGet("rc"), to = c ? c.input : fx.comp;
    if (RC.busTo !== to) { try { RC.post.disconnect(); } catch (e) {} RC.post.connect(to); RC.busTo = to; }
    return RC.bus;
  }
  const rcDriveCurve = (() => { const cache = {}; return d => { const k = Math.round(d * 20); if (cache[k]) return cache[k]; const n = 1024, c = new Float32Array(n), a = 1 + k * 0.6; for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * a) / Math.tanh(a); } return (cache[k] = c); }; })();
  const rcLevel = v => v * v * 1.25;
  function rcWire(i) {
    const tr = RCP.tracks[i], T = RC.trk[i]; if (!T) return;
    [T.in, T.sh, T.f, T.pan].forEach(n => { if (n) try { n.disconnect(); } catch (e) {} });
    T.in.gain.value = rcLevel(tr.vol);
    let node = T.in;
    if (tr.drive > 0.02) { if (!T.sh) { T.sh = ctx.createWaveShaper(); T.sh.oversample = "2x"; } T.sh.curve = rcDriveCurve(tr.drive); node.connect(T.sh); node = T.sh; }
    if (tr.ft !== "off") { if (!T.f) T.f = ctx.createBiquadFilter(); T.f.type = { lp: "lowpass", hp: "highpass", bp: "bandpass" }[tr.ft]; T.f.frequency.value = 30 * Math.pow(2, tr.ff * 9.4); T.f.Q.value = 0.5 + tr.fq * 14; node.connect(T.f); node = T.f; }
    if (Math.abs(tr.pan) > 0.01) { if (!T.pan) T.pan = ctx.createStereoPanner(); T.pan.pan.value = tr.pan; node.connect(T.pan); node = T.pan; }
    node.connect(rcBus()); rcSendWire(i, node); T.shape = [tr.drive > 0.02, tr.ft, Math.abs(tr.pan) > 0.01].join();
  }
  function rcTrackIn(i) {
    let T = RC.trk[i]; if (!T) { T = RC.trk[i] = { in: ctx.createGain() }; rcWire(i); }
    rcBus(); return T.in;
  }
  // knob changes that don't change the chain's shape are applied in place
  function rcApplyTrack(i) {
    const tr = RCP.tracks[i], T = RC.trk[i]; if (!T || !ctx) return;
    if (T.shape !== [tr.drive > 0.02, tr.ft, Math.abs(tr.pan) > 0.01].join()) { rcWire(i); return; }
    const t = ctx.currentTime;
    T.in.gain.setTargetAtTime(rcLevel(tr.vol), t, 0.02);
    if (T.sh && tr.drive > 0.02) T.sh.curve = rcDriveCurve(tr.drive);
    if (T.f && tr.ft !== "off") { T.f.frequency.setTargetAtTime(30 * Math.pow(2, tr.ff * 9.4), t, 0.02); T.f.Q.setTargetAtTime(0.5 + tr.fq * 14, t, 0.02); }
    if (T.pan) T.pan.pan.setTargetAtTime(tr.pan, t, 0.02);
    rcSendLevel(i);
  }

  // ---------- synthesized voices ----------
  let rcPinkBuf = null, rcPulseBuf = null; const RCV = new Set();
  const rcPink = () => rcPinkBuf || (rcPinkBuf = (() => { const n = ctx.sampleRate, b = ctx.createBuffer(1, n, n), d = b.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } return b; })());
  const rcPulse = () => rcPulseBuf || (rcPulseBuf = (() => { const n = Math.round(ctx.sampleRate * 0.001), b = ctx.createBuffer(1, n, ctx.sampleRate); b.getChannelData(0).fill(1); return b; })());
  const RC_CLIP = (() => { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); } return c; })();
  const RC_RECT = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = x > 0 ? Math.tanh(x * 3) : 0; } return c; })();
  // one voice: its nodes, an output gain, and a clean stop when its sound has died away
  function rcV(t, out, vel) {
    const V = { srcs: [], o: ctx.createGain(), out, extra: [], t, end: t + 0.1 };
    V.o.gain.value = vel; V.o.connect(out);
    V.osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; V.srcs.push(o); return o; };
    V.buf = (b, loop) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = !!loop; V.srcs.push(s); return s; };
    V.noise = () => V.buf(fx.noise, true);
    V.pink = () => V.buf(rcPink(), true);
    V.g = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    V.f = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
    V.sh = curve => { const w = ctx.createWaveShaper(); w.curve = curve; return w; };
    V.pulse = (amp, lp) => { const s = V.buf(rcPulse()), f = V.f("lowpass", lp || 5000, 1), g = V.g(amp); s.connect(f).connect(g); return g; };
    // linear attack, then exponential or linear fall to silence
    V.ad = (param, a, d, peak, lin, at) => { const s = at ?? t; param.setValueAtTime(0, s); param.linearRampToValueAtTime(peak, s + a); if (lin) param.linearRampToValueAtTime(0, s + a + d); else { param.exponentialRampToValueAtTime(Math.max(1e-4, peak * 1e-4), s + a + d); param.setValueAtTime(0, s + a + d + 0.001); } V.end = Math.max(V.end, s + a + d + 0.01); };
    V.go = () => {
      const stopAt = V.end + 0.02;
      let left = V.srcs.length;
      RCV.add(V);
      const done = () => { if (--left > 0) return; RCV.delete(V); try { V.o.disconnect(); } catch (e) {} V.extra.forEach(n => { try { n.disconnect(); } catch (e) {} }); };
      V.srcs.forEach(s => { try { if (s.__off) s.start(Math.max(t, ctx.currentTime), s.__off); else s.start(Math.max(t, ctx.currentTime)); s.stop(stopAt); s.onended = done; } catch (e) { done(); } });
      return V;
    };
    return V;
  }
  // 808 metal: six square oscillators (the original's frequencies), shared by the hats and the cymbal
  const RC_METAL = [263, 400, 421, 474, 587, 845];
  function rcMetal(V, mul, amp) { const sum = V.g(amp); RC_METAL.forEach(f => { const o = V.osc("square", f * mul); o.connect(sum); }); return sum; }
  function rcFM(V, f, ratio, index, idec, pmul, pdec, a, d, at) {
    const t = at ?? V.t, car = V.osc("sine", f), mod = V.osc("sine", f * ratio), mg = V.g(0), amp = V.g(0);
    mod.connect(mg); mg.connect(car.frequency); car.connect(amp);
    mg.gain.setValueAtTime(index * f, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.5, index * f * 0.002), t + idec);
    if (pmul !== 1) { car.frequency.setValueAtTime(f * pmul, t); car.frequency.exponentialRampToValueAtTime(f, t + pdec); mod.frequency.setValueAtTime(f * ratio * pmul, t); mod.frequency.exponentialRampToValueAtTime(f * ratio, t + pdec); }
    V.ad(amp.gain, a, d, 1, false, t); return amp;
  }
  const RC_GAIN = { "808:sd": 0.85, "808:lt": 1.1, "808:mt": 1.1, "808:lc": 0.9, "808:mc": 0.9, "808:hc": 0.9, "808:rs": 0.85, "808:cl": 1.3, "808:cp": 1.7, "808:ma": 1.3, "808:cb": 1.9, "808:cy": 4.5, "808:ch": 3.2, "808:oh": 3.2,
    "909:bd": 0.9, "909:lt": 1.1, "909:mt": 1.1, "909:ht": 1.1, "909:rs": 8, "909:cp": 1.6, "909:ch": 2, "909:oh": 1.35, "909:cr": 1.25, "909:rd": 4,
    "fm:tom": 1.1, "fm:sd": 1.1, "fm:bell": 1.7, "fm:metal": 1.9, "tr:boom": 1.6, "tr:snap": 3.2, "tr:clap": 3.6, "tr:hat": 4,
    "hp:shaker": 1.3, "hp:tamb": 1.35, "hp:bongohi": 1.2, "hp:bongolo": 1.2, "hp:timbhi": 1.1, "hp:timblo": 1.1, "hp:agogohi": 1.2, "hp:agogolo": 1.2, "hp:cabasa": 1.4,
    "fx:zap": 1.8, "fx:riser": 1.2, "fx:revcym": 1.5, "fx:tomdrop": 1.2,
    "f8:bd": 2.3, "f8:bdl": 1.6, "f8:sd": 1.9, "f8:cp": 1.5, "f8:ch": 2.2, "f8:oh": 1.5, "f8:cy": 1.35, "f8:cb": 1.6, "f8:cl": 1.9, "f8:rs": 1.5, "f8:ma": 1.35, "f8:lt": 1.7, "f8:mt": 1.65, "f8:ht": 1.6, "f8:lc": 1.7, "f8:mc": 2.4, "f8:hc": 1.6 };
  const rcGain = id => RC_GAIN[id] || (rcEngine(id) === "smp" ? 1.5 : 1);
  // p: v (velocity), r (tune ratio), d (decay scale, 1 = default), dec (0..1), tone (0..1), ch (0..1), beat (s)
  const RC_SYN = {
    "808:bd": (V, p) => { const t = V.t, dec = 0.3 * p.d, f0 = 48 * p.r, o = V.osc("sine", f0 + 50 * p.r), vca = V.g(0), lp = V.f("lowpass", 200 + p.tone * 2000, 1), sh = V.sh(RC_CLIP), out = V.g(1.1);
      o.frequency.setValueAtTime((48 + 50) * p.r, t); o.frequency.exponentialRampToValueAtTime(f0, t + dec);
      o.connect(vca); V.pulse(0.3 + p.ch * 1.0).connect(vca); vca.connect(lp).connect(sh).connect(out).connect(V.o); V.ad(vca.gain, 0.002, dec, 1, true); },
    "808:sd": (V, p) => { const t = V.t, hi = V.osc("sine", 476 * p.r), lo = V.osc("sine", 238 * p.r), ov = V.g(0), nz = V.noise(), hp = V.f("highpass", 800 + p.tone * 2000), nv = V.g(0);
      hi.connect(ov); lo.connect(ov); ov.connect(V.o); nz.connect(hp).connect(nv).connect(V.o);
      V.ad(ov.gain, 0.0001, 0.05 * p.d * 1.5, 0.15 + (1 - p.ch) * 0.5, true); V.ad(nv.gain, 0.0001, 0.075 * p.d * 1.6, 0.25 + p.ch * 0.6, true); },
    "808:lt": (V, p) => rcTom808(V, p, 80, 100, 0.2, true), "808:mt": (V, p) => rcTom808(V, p, 120, 160, 0.13, true), "808:ht": (V, p) => rcTom808(V, p, 165, 220, 0.2, true),
    "808:lc": (V, p) => rcTom808(V, p, 165, 220, 0.18, false), "808:mc": (V, p) => rcTom808(V, p, 250, 310, 0.1, false), "808:hc": (V, p) => rcTom808(V, p, 370, 455, 0.18, false),
    "808:rs": (V, p) => { const rim = V.osc("sine", 480 * p.r), bp = V.f("bandpass", 480 * p.r), tri = V.osc("triangle", 1750 * p.r), hp = V.f("highpass", 2450), sw = V.g(0), rect = V.sh(RC_RECT), hp2 = V.f("highpass", 480);
      rim.connect(bp).connect(sw); tri.connect(hp).connect(sw); sw.connect(rect).connect(hp2).connect(V.o); V.ad(sw.gain, 0.0001, 0.012 * p.d * (0.6 + p.ch), 1.7, true); },
    "808:cl": (V, p) => { const o = V.osc("triangle", 2450 * p.r), bp = V.f("bandpass", 2450 * p.r, 1 + p.ch * 6), a = V.g(0); o.connect(bp).connect(a).connect(V.o); V.ad(a.gain, 0.0001, 0.04 * p.d, 1.4, false); },
    "808:cp": (V, p) => { const t = V.t, nz = V.noise(), bp = V.f("bandpass", 1000 * Math.pow(2, (p.tone - 0.5) * 2), 1.2), saw = V.g(0), rev = V.g(0);
      nz.connect(bp); bp.connect(saw).connect(V.o); bp.connect(rev).connect(V.o);
      for (let i = 0; i < 4; i++) { saw.gain.setValueAtTime(1 - i / 3.2, t + i * 0.01); saw.gain.linearRampToValueAtTime(0, t + (i + 1) * 0.01); }
      V.ad(rev.gain, 0.0002, 0.115 * p.d * (0.5 + p.ch), 0.75, true); },
    "808:ma": (V, p) => { const nz = V.noise(), hp = V.f("highpass", 5000 * Math.pow(2, (p.tone - 0.5) * 1.5)), a = V.g(0); nz.connect(hp).connect(a).connect(V.o); V.ad(a.gain, 0.0002 + p.ch * 0.01, 0.03 * p.d, 0.6, true); },
    "808:cb": (V, p) => { const hi = V.osc("square", 800 * p.r), lo = V.osc("square", 540 * p.r), sv = V.g(0), lv = V.g(0), bp = V.f("bandpass", 2640, 1);
      hi.connect(sv); lo.connect(sv); hi.connect(lv); lo.connect(lv); sv.connect(bp); lv.connect(bp); bp.connect(V.o);
      V.ad(sv.gain, 0.0001, 0.015, 0.375, true); V.ad(lv.gain, 0.015, 0.4 * p.d * (0.5 + p.ch), 0.125 + p.ch * 0.1, false); },
    "808:cy": (V, p) => { const m = rcMetal(V, p.r, 0.3), lowB = V.f("bandpass", 5000), lowV = V.g(0), lowH = V.f("highpass", 5000), midB = V.f("bandpass", 10000), midV = V.g(0), midH = V.f("highpass", 10000), hiV = V.g(0), hiH = V.f("highpass", 8000);
      m.connect(lowB).connect(lowV).connect(lowH).connect(V.o); m.connect(midB); midB.connect(midV).connect(midH).connect(V.o); midB.connect(hiV).connect(hiH).connect(V.o);
      V.ad(lowV.gain, 0.0001, (0.7 + 0.85 * p.dec) * p.d, 0.666 - p.tone * 0.666 + 0.05, false); V.ad(midV.gain, 0.0001, 0.4 * p.d, 0.333, false); V.ad(hiV.gain, 0.0001, 0.15 * p.d, 0.666 * p.tone + 0.05 + p.ch * 0.2, false); },
    "808:ch": (V, p) => rcHat808(V, p, 0.05),
    "808:oh": (V, p) => rcHat808(V, p, 0.09 + 0.36 * p.dec),
    // --- 909 ---
    "909:bd": (V, p) => { const t = V.t, f1 = 52 * p.r, o = V.osc("triangle", f1), sh = V.sh(RC_CLIP), amp = V.g(0), lp = V.f("lowpass", 2200 + p.tone * 4000, 0.7), cl = V.noise(), clf = V.f("bandpass", 3200, 0.8), clv = V.g(0);
      o.frequency.setValueAtTime(f1 * 4.6, t); o.frequency.exponentialRampToValueAtTime(f1 * 1.6, t + 0.012); o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
      const drive = V.g(2.2); o.connect(drive).connect(sh).connect(amp).connect(lp).connect(V.o); cl.connect(clf).connect(clv).connect(V.o);
      V.ad(amp.gain, 0.001, 0.32 * p.d, 0.75, false); V.ad(clv.gain, 0.0002, 0.006 + p.ch * 0.01, 0.15 + p.ch * 0.9, false); V.pulse(0.25 + p.ch * 0.5, 2600).connect(V.o); },
    "909:sd": (V, p) => { const t = V.t, a = V.osc("triangle", 185 * p.r), b = V.osc("triangle", 330 * p.r), tv = V.g(0), nz = V.noise(), hp = V.f("highpass", 1400 + p.tone * 2600), lp = V.f("lowpass", 9000), nv = V.g(0);
      [a, b].forEach((o, i) => { const f = o.frequency.value; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.025); o.connect(tv); });
      tv.connect(V.o); nz.connect(hp).connect(lp).connect(nv).connect(V.o);
      V.ad(tv.gain, 0.0005, 0.12 * p.d, 0.55 * (1.15 - p.ch * 0.6), false); V.ad(nv.gain, 0.0005, (0.12 + 0.12 * p.ch) * p.d, 0.25 + p.ch * 0.6, false); },
    "909:lt": (V, p) => rcTom909(V, p, 95), "909:mt": (V, p) => rcTom909(V, p, 135), "909:ht": (V, p) => rcTom909(V, p, 185),
    "909:rs": (V, p) => { [[220, 0.5], [500, 0.6], [1030, 0.45]].forEach(([f, g]) => { const bp = V.f("bandpass", f * p.r, 18 + p.ch * 20), gg = V.g(g * 3.2); V.pulse(1, 9000).connect(bp).connect(gg).connect(V.o); }); V.end = V.t + 0.08 * p.d; },
    "909:cp": (V, p) => { const t = V.t, nz = V.noise(), bp = V.f("bandpass", 1200 * Math.pow(2, (p.tone - 0.5) * 2), 1.6), hp = V.f("highpass", 600), a = V.g(0), tail = V.g(0);
      nz.connect(bp).connect(hp); hp.connect(a).connect(V.o); hp.connect(tail).connect(V.o);
      [0, 0.011, 0.023, 0.031].forEach((o, i) => { a.gain.setValueAtTime(i === 3 ? 0.9 : 1, t + o); a.gain.exponentialRampToValueAtTime(0.02, t + o + 0.009); });
      a.gain.setValueAtTime(0, t + 0.045); V.ad(tail.gain, 0.03, 0.18 * p.d * (0.5 + p.ch), 0.7, false); },
    "909:ch": (V, p) => rcHat909(V, p, 0.045 * p.d),
    "909:oh": (V, p) => rcHat909(V, p, (0.22 + 0.55 * p.dec) * p.d),
    "909:cr": (V, p) => { const m = rcMetal(V, p.r * 1.12, 0.18), nz = V.noise(), ng = V.g(0.2 + p.ch * 0.4), hp = V.f("highpass", 4500 + p.tone * 3000), bp = V.f("peaking", 9000, 1), a = V.g(0), sp = V.g(0);
      m.connect(hp); nz.connect(ng).connect(hp); hp.connect(bp).connect(a).connect(V.o); bp.connect(sp).connect(V.o); bp.gain.value = 6;
      V.ad(a.gain, 0.0005, (1.2 + 1.3 * p.dec) * p.d, 0.55, false); V.ad(sp.gain, 0.0002, 0.05, 0.6, false); },
    "909:rd": (V, p) => { const m = rcMetal(V, p.r * 1.53, 0.2), bp = V.f("bandpass", 6800 + p.tone * 2500, 1.6), hp = V.f("highpass", 3500), a = V.g(0), ping = V.osc("sine", 5200 * p.r), pg = V.g(0);
      m.connect(bp).connect(hp).connect(a).connect(V.o); ping.connect(pg).connect(V.o);
      V.ad(a.gain, 0.0005, (0.9 + 1.2 * p.dec) * p.d, 0.8, false); V.ad(pg.gain, 0.0002, 0.25, 0.05 + p.ch * 0.2, false); },
    // --- FM ---
    "fm:bd": (V, p) => { rcFM(V, 52 * p.r, 1, 2 + p.ch * 8, 0.02 + p.tone * 0.05, 3.2, 0.045, 0.001, 0.38 * p.d).connect(V.g(1.1)).connect(V.o); },
    "fm:tom": (V, p) => { rcFM(V, 130 * p.r, 1.5, 1 + p.ch * 5, 0.04 + p.tone * 0.1, 1.6, 0.06, 0.001, 0.32 * p.d).connect(V.o); },
    "fm:sd": (V, p) => { rcFM(V, 190 * p.r, 2.3, 3 + p.tone * 4, 0.03, 1.5, 0.02, 0.001, 0.12 * p.d).connect(V.g(0.6)).connect(V.o);
      const nz = V.noise(), hp = V.f("highpass", 1600), nv = V.g(0); nz.connect(hp).connect(nv).connect(V.o); V.ad(nv.gain, 0.0005, 0.16 * p.d, 0.25 + p.ch * 0.6, false); },
    "fm:bell": (V, p) => { rcFM(V, 560 * p.r, 1.41, 1.5 + p.ch * 4, 0.3 + p.tone * 0.6, 1, 0.01, 0.001, 0.7 * p.d).connect(V.g(0.6)).connect(V.o); },
    "fm:metal": (V, p) => { rcFM(V, 330 * p.r, 3.71, 4 + p.ch * 10, 0.08 + p.tone * 0.2, 1, 0.01, 0.0005, 0.26 * p.d).connect(V.g(0.55)).connect(V.o); },
    // --- trap & modern ---
    "tr:boom": (V, p) => { const t = V.t, f0 = 44 * p.r, o = V.osc("sine", f0), sh = V.sh(RC_CLIP), drv = V.g(1.2 + p.tone * 2), amp = V.g(0), out = V.g(0.9 / (1 + p.tone * 0.6));
      o.frequency.setValueAtTime(f0 * Math.pow(2, p.ch * 1.2), t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.04 + p.ch * 0.18);
      o.connect(amp).connect(drv).connect(sh).connect(out).connect(V.o); V.pulse(0.18, 1800).connect(V.o);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(1, t + 0.003); amp.gain.setTargetAtTime(0.75, t + 0.003, 0.08); amp.gain.setTargetAtTime(0, t + 0.15, (0.15 + 0.9 * p.dec) * p.d); V.end = t + 0.15 + 5 * (0.15 + 0.9 * p.dec) * p.d; },
    "tr:snap": (V, p) => { const t = V.t, nz = V.noise(), bp = V.f("bandpass", 2400 * Math.pow(2, (p.tone - 0.5) * 1.5), 2.5), a = V.g(0), body = V.osc("sine", 1500 * p.r), bv = V.g(0);
      nz.connect(bp).connect(a).connect(V.o); body.connect(bv).connect(V.o);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(1.2, t + 0.001); a.gain.exponentialRampToValueAtTime(0.05, t + 0.012); a.gain.linearRampToValueAtTime(0.7, t + 0.016); a.gain.exponentialRampToValueAtTime(1e-4, t + 0.016 + 0.06 * p.d); a.gain.setValueAtTime(0, t + 0.017 + 0.06 * p.d);
      V.ad(bv.gain, 0.0005, 0.02, 0.1 + p.ch * 0.4, false); V.end = t + 0.1 * p.d + 0.03; },
    "tr:clap": (V, p) => { const t = V.t, w = p.ch;
      [[-w, 0, 1100], [w, 0.008, 1500]].forEach(([pan, off, f]) => { const nz = V.noise(), bp = V.f("bandpass", f * Math.pow(2, (p.tone - 0.5) * 2), 1.3), a = V.g(0), pn = ctx.createStereoPanner(); pn.pan.value = pan;
        nz.connect(bp).connect(a).connect(pn).connect(V.o);
        [0, 0.01, 0.021].forEach(o => { a.gain.setValueAtTime(1, t + off + o); a.gain.exponentialRampToValueAtTime(0.05, t + off + o + 0.009); });
        a.gain.setValueAtTime(0.6, t + off + 0.03); a.gain.exponentialRampToValueAtTime(1e-4, t + off + 0.03 + 0.2 * p.d); a.gain.setValueAtTime(0, t + off + 0.031 + 0.2 * p.d); });
      V.end = t + 0.25 * p.d + 0.05; },
    "tr:hat": (V, p) => { const m = rcMetal(V, p.r * 1.3, 0.12), nz = V.noise(), ng = V.g(0.15 + p.ch * 0.2), hp = V.f("highpass", 8500 + p.tone * 3000), a = V.g(0); m.connect(hp); nz.connect(ng).connect(hp); hp.connect(a).connect(V.o); V.ad(a.gain, 0.0003, 0.035 * p.d, 1, false); },
    // --- hand percussion ---
    "hp:shaker": (V, p) => { const nz = V.noise(), bp = V.f("bandpass", 6500 * Math.pow(2, (p.tone - 0.5) * 1.2), 1.4), a = V.g(0); nz.connect(bp).connect(a).connect(V.o); V.ad(a.gain, 0.008 + p.ch * 0.02, 0.07 * p.d, 0.9, true); },
    "hp:tamb": (V, p) => { const nz = V.noise(), hp = V.f("highpass", 7000), a = V.g(0); nz.connect(hp).connect(a).connect(V.o); V.ad(a.gain, 0.001, 0.22 * p.d, 0.5, false);
      [5600, 7900, 10400].forEach((f, i) => { const o = V.osc("square", f * p.r * (1 + i * 0.013)), g = V.g(0), b = V.f("bandpass", f * p.r, 8); o.connect(b).connect(g).connect(V.o); V.ad(g.gain, 0.001, 0.18 * p.d, 0.06 + p.ch * 0.14, false); }); },
    "hp:bongohi": (V, p) => rcSkin(V, p, 400, 0.12), "hp:bongolo": (V, p) => rcSkin(V, p, 290, 0.16),
    "hp:timbhi": (V, p) => rcTimb(V, p, 520), "hp:timblo": (V, p) => rcTimb(V, p, 380),
    "hp:tri": (V, p) => { [1, 2.76, 5.4].forEach((m, i) => { const o = V.osc("sine", 2300 * p.r * m), g = V.g(0); o.connect(g).connect(V.o); V.ad(g.gain, 0.001, (0.12 + 1.5 * p.ch) * p.d / (1 + i * 0.6), [0.5, 0.3, 0.16][i], false); }); },
    "hp:agogohi": (V, p) => rcAgogo(V, p, 920), "hp:agogolo": (V, p) => rcAgogo(V, p, 640),
    "hp:cabasa": (V, p) => { const nz = V.noise(), bp = V.f("bandpass", 9000 * Math.pow(2, (p.tone - 0.5)), 2), a = V.g(0); nz.connect(bp).connect(a).connect(V.o); V.ad(a.gain, 0.004 + p.ch * 0.012, 0.055 * p.d, 1.1, true); },
    // --- electro & fx ---
    "fx:zap": (V, p) => { const t = V.t, o = V.osc(p.tone > 0.5 ? "square" : "sine", 3000 * p.r), a = V.g(0), lp = V.f("lowpass", 6000); o.frequency.setValueAtTime(3200 * p.r, t); o.frequency.exponentialRampToValueAtTime(90 * p.r, t + (0.06 + 0.25 * p.ch) * p.d);
      o.connect(lp).connect(a).connect(V.o); V.ad(a.gain, 0.001, (0.08 + 0.25 * p.ch) * p.d, 0.5, false); },
    "fx:riser": (V, p) => { const t = V.t, L = p.beat * (1 + Math.round(p.dec * 7)), nz = V.noise(), bp = V.f("bandpass", 300, 1.5 + p.ch * 6), a = V.g(0);
      bp.frequency.setValueAtTime(250 * p.r, t); bp.frequency.exponentialRampToValueAtTime(9000 * p.r, t + L); nz.connect(bp).connect(a).connect(V.o);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.8, t + L); a.gain.linearRampToValueAtTime(0, t + L + 0.02); V.end = t + L + 0.03; },
    "fx:revcym": (V, p) => { const t = V.t, L = p.beat * (1 + Math.round(p.dec * 3)), m = rcMetal(V, p.r * 1.12, 0.15), nz = V.noise(), ng = V.g(0.3), hp = V.f("highpass", 5000 + p.tone * 3000), a = V.g(0);
      m.connect(hp); nz.connect(ng).connect(hp); hp.connect(a).connect(V.o);
      a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(0.7, t + L); a.gain.linearRampToValueAtTime(0, t + L + 0.015); V.end = t + L + 0.02; },
    "fx:tomdrop": (V, p) => { const t = V.t, o = V.osc("triangle", 300 * p.r), a = V.g(0), sh = V.sh(RC_CLIP), dr = V.g(1.5); o.frequency.setValueAtTime(320 * p.r * (1 + p.ch), t); o.frequency.exponentialRampToValueAtTime(55 * p.r, t + 0.4 * p.d);
      o.connect(dr).connect(sh).connect(a).connect(V.o); V.ad(a.gain, 0.002, 0.45 * p.d, 0.8, false); },
  };
  function rcTom808(V, p, lo, hi, dec, noisy) {
    const f = (lo + (hi - lo) * p.tone) * p.r, o = V.osc("sine", f), ov = V.g(0); o.connect(ov).connect(V.o); V.ad(ov.gain, 0.0001, dec * p.d * 1.3, 0.9, true);
    V.pulse(0.2 + p.ch * 0.3).connect(V.o);
    if (noisy) { const nz = V.pink(), lp = V.f("lowpass", 10000), nv = V.g(0); nz.connect(lp).connect(nv).connect(V.o); V.ad(nv.gain, 0.0001, 0.2 * p.d, 0.1 + p.ch * 0.3, true); }
  }
  function rcHat808(V, p, dec) {
    const m = rcMetal(V, p.r, 0.3), bp = V.f("bandpass", 10000 * Math.pow(2, (p.tone - 0.5)), 1), env = V.g(0), hp = V.f("highpass", 8000), out = V.g(0.9 + p.ch * 0.6);
    m.connect(bp).connect(env).connect(hp).connect(out).connect(V.o); V.ad(env.gain, 0.0001, dec * p.d, 1, true);
  }
  function rcHat909(V, p, dec) {
    const m = rcMetal(V, p.r * 1.07, 0.16), nz = V.noise(), ng = V.g(0.12 + p.ch * 0.5), hp = V.f("highpass", 7000 + p.tone * 3500), bp = V.f("peaking", 10500, 1.2), env = V.g(0);
    bp.gain.value = 4; m.connect(hp); nz.connect(ng).connect(hp); hp.connect(bp).connect(env).connect(V.o); V.ad(env.gain, 0.0003, dec, 1.1, false);
  }
  function rcTom909(V, p, f0) {
    const t = V.t, f = f0 * p.r * Math.pow(2, (p.tone - 0.5) * 0.6), o = V.osc("sine", f), o2 = V.osc("triangle", f * 1.5), a = V.g(0), a2 = V.g(0);
    [o, o2].forEach(x => { const ff = x.frequency.value; x.frequency.setValueAtTime(ff * 1.45, t); x.frequency.exponentialRampToValueAtTime(ff, t + 0.06); });
    o.connect(a).connect(V.o); o2.connect(a2).connect(V.o); V.ad(a.gain, 0.0008, 0.3 * p.d, 0.85, false); V.ad(a2.gain, 0.0008, 0.08 * p.d, 0.2, false);
    const nz = V.noise(), lp = V.f("lowpass", 3000), nv = V.g(0); nz.connect(lp).connect(nv).connect(V.o); V.ad(nv.gain, 0.0005, 0.05, 0.05 + p.ch * 0.25, false);
  }
  function rcSkin(V, p, f0, dec) {
    const t = V.t, f = f0 * p.r * Math.pow(2, (p.tone - 0.5) * 0.5), o = V.osc("sine", f), a = V.g(0); o.frequency.setValueAtTime(f * 1.18, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
    o.connect(a).connect(V.o); V.ad(a.gain, 0.0005, dec * p.d, 0.8, false);
    const nz = V.noise(), bp = V.f("bandpass", f * 4, 2), nv = V.g(0); nz.connect(bp).connect(nv).connect(V.o); V.ad(nv.gain, 0.0003, 0.012, 0.2 + p.ch * 0.8, false);
  }
  function rcTimb(V, p, f0) {
    const f = f0 * p.r, o = V.osc("sine", f), o2 = V.osc("triangle", f * 2.62), a = V.g(0), a2 = V.g(0);
    o.connect(a).connect(V.o); o2.connect(a2).connect(V.o); V.ad(a.gain, 0.0005, (0.2 + 0.3 * p.ch) * p.d, 0.7, false); V.ad(a2.gain, 0.0005, 0.12 * p.d, 0.12 + p.tone * 0.2, false);
    const nz = V.noise(), hp = V.f("highpass", 3000), nv = V.g(0); nz.connect(hp).connect(nv).connect(V.o); V.ad(nv.gain, 0.0003, 0.04, 0.25, false);
  }
  function rcAgogo(V, p, f0) {
    const f = f0 * p.r, o = V.osc("sine", f), o2 = V.osc("sine", f * 2.31), a = V.g(0), a2 = V.g(0);
    o.connect(a).connect(V.o); o2.connect(a2).connect(V.o); V.ad(a.gain, 0.0008, (0.2 + 0.3 * p.ch) * p.d, 0.6, false); V.ad(a2.gain, 0.0008, 0.12 * p.d, 0.12 + p.tone * 0.3, false);
  }

  // ---------- sample voices (Real 808, sampler slots, pads, kits) ----------
  const rcB64 = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  function rcSampleBuf(id) {
    if (id.startsWith("st:")) return rcStLoad(id.slice(3));
    let m;
    if ((m = /^s(\d)$/.exec(id))) return sampBuf[+m[1]] || null;
    if ((m = /^p(\d+)$/.exec(id))) return padBuf[+m[1]] || null;
    const c = RC.samp[id]; if (c) return c.buf || null;
    let data = null;
    if (id.startsWith("f8:")) { const s = RC_F808.find(x => "f8:" + x.id === id); if (s) data = s.mp3; }
    else if ((m = /^k:([\w-]+):(\d+)$/.exec(id)) && window.NB_KITS && NB_KITS[m[1]] && NB_KITS[m[1]].pads[+m[2]]) {
      data = NB_KITS[m[1]].pads[+m[2]].mp3;
      if (!data && window.__nbKitData && ctx) {   // (162: the kit's sounds are a file on the site: fetched, then decoded)
        const entry = RC.samp[id] = { buf: null }, n = +m[2];
        __nbKitData(m[1]).then(K => decode(rcB64(K.pads[n].mp3))).then(b => { entry.buf = b; }, () => { delete RC.samp[id]; });
        return null;
      }
    }
    if (!data || !ctx) return null;
    const entry = RC.samp[id] = { buf: null };
    decode(rcB64(data)).then(b => { entry.buf = b; }, () => { delete RC.samp[id]; });
    return null;
  }
  function rcSampleHit(id, t, p, out) {
    if (id.startsWith("st:")) return rcStHit(id, t, p, out);
    const b = rcSampleBuf(id); if (!b) return null;
    const V = rcV(t, out, p.v), s = V.buf(b), g = V.g(1);
    s.playbackRate.value = p.r;
    let node = s;
    if (p.tone < 0.48) { const f = V.f("lowpass", 300 * Math.pow(2, p.tone / 0.48 * 6), 0.7); node.connect(f); node = f; }
    else if (p.tone > 0.52) { const f = V.f("highpass", 30 * Math.pow(2, (p.tone - 0.52) / 0.48 * 6), 0.7); node.connect(f); node = f; }
    node.connect(g).connect(V.o);
    const full = b.duration / p.r, len = Math.min(full, p.dec >= 0.98 ? full : 0.03 + full * Math.pow(p.dec / 0.98, 1.6) * 1.2);
    g.gain.setValueAtTime(1, t); if (len < full) { g.gain.setValueAtTime(1, t + len * 0.7); g.gain.linearRampToValueAtTime(0, t + len); }
    V.end = t + len + 0.01;
    return V.go();
  }

  // ---------- the Analog engine (AudioWorklet, one node for all tracks) ----------
  const RC_AN_SRC = "// Analog drum models for the Rhythm Creator, running in an AudioWorklet. One node serves every track that\n// uses an Analog sound (one output per track), and closes itself when nothing has played for a while.\n//\n// Ported from Mutable Instruments Plaits (analog_bass_drum.h, analog_snare_drum.h, hi_hat.h,\n// synthetic_bass_drum.h, synthetic_snare_drum.h).\n// Copyright 2016 Emilie Gillet. MIT licence:\n// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated\n// documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation\n// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and\n// to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above\n// copyright notice and this permission notice shall be included in all copies or substantial portions of the\n// Software. THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT\n// LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT\n// SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION\n// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER\n// DEALINGS IN THE SOFTWARE.\nlet seed = 0x2468ace1;\nconst rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };\nconst st2r = s => Math.pow(2, s / 12);\nconst softLimit = x => x * (27 + x * x) / (27 + 9 * x * x);\nconst softClip = x => x < -3 ? -1 : x > 3 ? 1 : softLimit(x);\nconst tanDirty = f => f * (Math.PI + 0.3736 * Math.PI * Math.PI * Math.PI * f * f);\nconst tanFast = f => { const f2 = f * f; return f * (Math.PI + f2 * (0.326 * Math.PI ** 3 + 0.1823 * Math.PI ** 5 * f2)); };\nconst tanExact = f => Math.tan(Math.PI * Math.min(f, 0.497));\nclass Svf {\n  constructor() { this.g = 0.03; this.r = 0.01; this.h = 1; this.s1 = 0; this.s2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; }\n  set(g, q) { this.g = g; this.r = 1 / q; this.h = 1 / (1 + this.r * g + g * g); }\n  run(x) {\n    const g = this.g, hp = (x - this.r * this.s1 - g * this.s1 - this.s2) * this.h, bp = g * hp + this.s1;\n    this.s1 = g * hp + bp; const lp = g * bp + this.s2; this.s2 = g * bp + lp;\n    this.hp = hp; this.bp = bp; this.lp = lp; return bp;\n  }\n}\nclass OnePole {\n  constructor() { this.g = 0.1; this.gi = 1; this.s = 0; }\n  set(f) { this.g = tanFast(f); this.gi = 1 / (1 + this.g); }\n  lp(x) { const lp = (this.g * x + this.s) * this.gi; this.s = this.g * (x - lp) + lp; return lp; }\n  hp(x) { return x - this.lp(x); }\n}\nconst diode = x => x >= 0 ? x : (x *= 2, 0.7 * x / (1 + Math.abs(x)));\n\n// --- 808 bass drum model, revisited ---\nfunction analogKick(P, SR) {\n  const kTrig = Math.round(1e-3 * SR), kFM = Math.round(6e-3 * SR), kPulseDecay = 0.2e-3 * SR, kPulseFilt = 0.1e-3 * SR, kRetrig = 0.05 * SR;\n  const f0 = P.f / SR, tone = P.tone, decay = P.decay, accent = P.v;\n  const atk = Math.min(P.ch * 4, 1), self = Math.max(Math.min(P.ch * 4 - 1, 1), 0);\n  const scale = 0.001 / f0, q = 1500 * st2r(decay * 80), toneF = Math.min(4 * f0 * st2r(tone * 108), 1), leak = 0.08 * (tone + 0.25);\n  let pulseRem = kTrig, fmRem = kFM, pulse_ = 0, height = 3 + 7 * accent, pulseLp = 0, fmLp = 0, retrig = 0, lpOut = 0, toneLp = 0;\n  const res = new Svf();\n  return () => {\n    let pulse = 0;\n    if (pulseRem) { --pulseRem; pulse = pulseRem ? height : height - 1; pulse_ = pulse; } else { pulse_ *= 1 - 1 / kPulseDecay; pulse = pulse_; }\n    pulseLp += (pulse - pulseLp) / kPulseFilt;\n    pulse = diode((pulse - pulseLp) + pulse * 0.044);\n    let fmPulse = 0;\n    if (fmRem) { --fmRem; fmPulse = 1; retrig = fmRem ? 0 : -0.8; } else retrig *= 1 - 1 / kRetrig;\n    fmLp += (fmPulse - fmLp) / kPulseFilt;\n    const punch = 0.7 + diode(10 * lpOut - 1);\n    let f = f0 * (1 + fmLp * 1.7 * atk + punch * 0.08 * self); if (f > 0.4) f = 0.4; if (f < 0) f = 0;\n    res.set(tanDirty(f), 1 + q * f);\n    const bp = res.run((pulse - retrig * 0.2) * scale); lpOut = res.lp;\n    toneLp += toneF * (pulse * leak + bp - toneLp);\n    return toneLp;\n  };\n}\n// --- 808 snare drum model, with extra modes above 2/3 of Tone ---\nfunction analogSnare(P, SR) {\n  const f0 = P.f / SR, decay = P.decay, accent = P.v; let tone = P.tone, snappy = P.ch;\n  const decayXt = decay * (1 + decay * (decay - 1)), kTrig = Math.round(1e-3 * SR), kPulseDecay = 0.1e-3 * SR;\n  const q = 2000 * st2r(decayXt * 84), nDecay = 1 - 0.0017 * st2r(-decay * (50 + snappy * 10)) * (48000 / SR), leak = snappy * (2 - snappy) * 0.1;\n  snappy = Math.max(0, Math.min(1, snappy * 1.1 - 0.05));\n  const modes = [1, 2, 3.18, 4.16, 5.62], res = modes.map(() => new Svf()), gain = [0, 0, 0, 0, 0];\n  modes.forEach((m, i) => { const f = Math.min(f0 * m, 0.499); res[i].set(tanFast(f), 1 + f * (i === 0 ? q : q * 0.25)); });\n  if (tone < 0.666667) { tone *= 1.5; gain[0] = 1.5 + (1 - tone) * (1 - tone) * 4.5; gain[1] = 2 * tone + 0.15; }\n  else { tone = (tone - 0.666667) * 3; gain[0] = 1.5 - tone * 0.5; gain[1] = 2.15 - tone * 0.7; for (let i = 2; i < 5; i++) { gain[i] = tone; tone *= tone; } }\n  const fn = Math.min(f0 * 16, 0.499), nf = new Svf(); nf.set(tanFast(fn), 1 + fn * 1.5);\n  let pulseRem = kTrig, pulse_ = 0, height = 3 + 7 * accent, pulseLp = 0, nEnv = 2;\n  return () => {\n    let pulse = 0;\n    if (pulseRem) { --pulseRem; pulse = pulseRem ? height : height - 1; pulse_ = pulse; } else { pulse_ *= 1 - 1 / kPulseDecay; pulse = pulse_; }\n    pulseLp += 0.75 * (pulse - pulseLp);\n    let shell = 0;\n    for (let i = 0; i < 5; i++) {\n      if (!gain[i]) continue;\n      const ex = i === 0 ? (pulse - pulseLp) + 0.006 * pulse : 0.026 * pulse;\n      shell += gain[i] * (res[i].run(ex) + ex * leak);\n    }\n    shell = softClip(shell);\n    let noise = 2 * rnd() - 1; if (noise < 0) noise = 0;\n    nEnv *= nDecay; noise *= nEnv * snappy * 2;\n    noise = nf.run(noise);\n    return noise + shell * (1 - snappy);\n  };\n}\n// --- hi-hat: 808-style square metallic noise (swing VCA) or ring-modulated noise (two-stage envelope) ---\nfunction hiHat(P, SR, ring) {\n  const f0 = P.f / SR, tone = P.tone, decay = P.decay, accent = P.v; let noisiness = P.ch;\n  const k = 48000 / SR, envDecay = 1 - 0.003 * st2r(-decay * 84) * k, cutDecay = 1 - 0.0025 * st2r(-decay * 36) * k;\n  let env = (1.5 + 0.5 * (1 - decay)) * (0.3 + 0.7 * accent);\n  let cutoff = 150 / SR * st2r(tone * 72); cutoff = Math.min(cutoff, 16000 / SR);\n  const col = new Svf(); col.set(tanExact(cutoff), ring ? 1 : 3 + 3 * tone);\n  const hpf = new Svf(); hpf.set(tanExact(cutoff), 0.5);\n  noisiness *= noisiness;\n  const noiseF = Math.min(0.5, f0 * (16 + 16 * (1 - noisiness)));\n  let nClock = 0, nSample = 0;\n  const ratios = [1, 1.304, 1.466, 1.787, 1.932, 2.536], ph = [0, 0, 0, 0, 0, 0], inc = ratios.map(r => Math.min(2 * f0 * r, 0.499));\n  const ratio = (2 * f0) / (0.01 + 2 * f0), rf = [[200, 7530], [510, 8075], [730, 10500]].map(p => [p[0] / SR * ratio, p[1] / SR * ratio]), rp = [[0, 0], [0, 0], [0, 0]];\n  return () => {\n    let s;\n    if (!ring) { let n = 0; for (let i = 0; i < 6; i++) { ph[i] += inc[i]; if (ph[i] >= 1) ph[i] -= 1; if (ph[i] >= 0.5) n++; } s = 0.33 * n - 1; }\n    else { s = 0; for (let i = 0; i < 3; i++) { const p = rp[i]; p[0] += rf[i][0]; if (p[0] >= 1) p[0] -= 1; p[1] += rf[i][1]; if (p[1] >= 1) p[1] -= 1; s += (p[0] < 0.5 ? 0.5 : -0.5) * (p[1] - 0.5); } }\n    s = col.run(s);\n    nClock += noiseF; if (nClock >= 1) { nClock -= 1; nSample = rnd() - 0.5; }\n    s += noisiness * (nSample - s);\n    env *= env > 0.5 || !ring ? envDecay : cutDecay;\n    if (!ring) { let x = s * (s > 0 ? 4 : 0.1); x = x / (1 + Math.abs(x)); s = (x + 0.1) * env; } else s *= env;\n    hpf.run(s); return hpf.hp;\n  };\n}\n// --- synthetic (909-flavoured) bass drum ---\nfunction synthKick(P, SR) {\n  const f0 = P.f / SR, tone = P.tone, accent = P.v, k = 48000 / SR;\n  const decay = P.decay * P.decay, dirt = P.ch * Math.max(1 - 8 * f0, 0), fmAmt = 0.6, fmEnvDecay = 0.25;\n  const fmDecay = 1 - 1 / (0.008 * (1 + fmEnvDecay * 4) * SR), bodyDecay = 1 - 1 / (0.02 * SR) * st2r(-decay * 60), transDecay = 1 - 1 / (0.005 * SR);\n  const toneF = Math.min(4 * f0 * st2r(tone * 108), 1);\n  let phase = 0, phaseNoise = 0, fm = 1, fmLp = 0, body = 0.3 + 0.7 * accent, trans = body, bodyLp = 0, transLp = 0, bodyW = Math.round(SR * 0.001), fmW = Math.round(SR * 0.0013), toneLp = 0;\n  let cLp = 0, cHp = 0, nLp = 0, nHp = 0; const cf = new Svf(); cf.set(tanFast(5000 / SR), 2);\n  const sine = p => Math.sin(2 * Math.PI * p);\n  return () => {\n    phaseNoise += 0.002 * (rnd() - 0.5 - phaseNoise);\n    if (fmW) { --fmW; phase = 0.25; } else { fm *= fmDecay; phase += Math.min(f0 * (1 + fmAmt * 3.5 * fmLp), 0.5); if (phase >= 1) phase -= 1; }\n    if (bodyW) --bodyW; else { body *= bodyDecay; trans *= transDecay; }\n    bodyLp += 0.1 * (body - bodyLp); transLp += 0.1 * (trans - transLp); fmLp += 0.1 * (fm - fmLp);\n    let p = phase + phaseNoise * dirt; p -= Math.floor(p);\n    const tri = (p < 0.5 ? p : 1 - p) * 4 - 1, ds = 2 * tri / (1 + Math.abs(tri)), clean = sine(p + 0.75), bodyS = ds + (1 - dirt) * (clean - ds);\n    const ci = bodyW ? 0 : 1; const e = ci - cLp; cLp += (e > 0 ? 0.5 : 0.1) * e; cHp += 0.04 * (cLp - cHp); cf.run(cLp - cHp);\n    nLp += 0.05 * (rnd() - nLp); nHp += 0.005 * (nLp - nHp);\n    const transient = cf.lp + (nLp - nHp);\n    let s = (bodyS - 0.6) * bodyLp; s = 3 * s / (2 + Math.abs(s)) + bodyLp * 0.3;\n    const mix = -s - transient * transLp * tone;\n    toneLp += toneF * (mix - toneLp);\n    return toneLp * k;\n  };\n}\n// --- synthetic (909-flavoured) snare drum ---\nfunction synthSnare(P, SR) {\n  const f0 = P.f / SR, decay = P.decay, accent = P.v; let snappy = P.ch; const fmAmount = 0.25 * 0.25;\n  const decayXt = decay * (1 + decay * (decay - 1));\n  const drumDecay = 1 - 1 / (0.015 * SR) * st2r(-decayXt * 72 - fmAmount * 12 + snappy * 7), snareDecay = 1 - 1 / (0.01 * SR) * st2r(-decay * 60 - snappy * 7), fmDecay = 1 - 1 / (0.007 * SR);\n  snappy = Math.max(0, Math.min(1, snappy * 1.1 - 0.05));\n  const drumLevel = Math.sqrt(1 - snappy), snareLevel = Math.sqrt(snappy);\n  const hp = new OnePole(); hp.set(Math.min(10 * f0, 0.5)); const lp = new Svf(); lp.set(tanFast(Math.min(35 * f0, 0.5)), 0.5 + 2 * snappy); const dlp = new OnePole(); dlp.set(3 * f0);\n  let snareAmp = 0.3 + 0.7 * accent, drumAmp = snareAmp, fm = 1, p0 = 0, p1 = 0, hold = Math.round((0.04 + decay * 0.03) * SR), n = 0;\n  const ds = p => { const t = (p < 0.5 ? p : 1 - p) * 4 - 1.3; return 2 * t / (1 + Math.abs(t)); };\n  return () => {\n    drumAmp *= (drumAmp > 0.03 || !(n++ & 1)) ? drumDecay : 1;\n    if (hold) --hold; else snareAmp *= snareDecay;\n    fm *= fmDecay;\n    const f = f0 * (1 + fmAmount * 4 * fm); p0 += f; p1 += f * 1.47; if (p0 >= 1) p0 -= 1; if (p1 >= 1) p1 -= 1;\n    let drum = -0.1 + ds(p0) * 0.6 + ds(p1) * 0.25; drum *= drumAmp * drumLevel; drum = dlp.lp(drum);\n    lp.run(rnd()); let snare = hp.hp(lp.lp); snare = (snare + 0.1) * (snareAmp + fm) * snareLevel;\n    return snare + drum;\n  };\n}\nconst MODELS = { bd: analogKick, sd: analogSnare, mh: (P, SR) => hiHat(P, SR, false), rh: (P, SR) => hiHat(P, SR, true), sbd: synthKick, ssd: synthSnare };\nclass RCAnalog extends AudioWorkletProcessor {\n  constructor() {\n    super(); this.voices = []; this.pending = []; this.closing = false; this.dirty = new Set();\n    this.port.onmessage = e => {\n      const m = e.data;\n      if (m === \"close\") { this.closing = true; return; }\n      if (m.choke != null) { for (const v of this.voices) if (v.tr === m.choke) v.chokeAt = m.t; return; }\n      if (m.kind && MODELS[m.kind]) { this.pending.push(m); this.closing = false; }\n    };\n  }\n  process(inputs, outputs) {\n    const n = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128, t0 = currentTime, sr = sampleRate;\n    for (const i of this.dirty) { const o = outputs[i] && outputs[i][0]; if (o) o.fill(0); }\n    this.dirty.clear();\n    if (this.pending.length) {\n      const keep = [];\n      for (const h of this.pending) {\n        const off = Math.round((h.t - t0) * sr);\n        if (off >= n) { keep.push(h); continue; }\n        this.voices.push({ tr: h.tr, gain: h.gain, run: MODELS[h.kind](h, sr), off: Math.max(0, off), age: 0, quiet: 0, chokeAt: -1, fade: 1, max: Math.round(sr * 6) });\n      }\n      this.pending = keep;\n    }\n    if (!this.voices.length) return !this.closing || this.pending.length > 0;\n    const quietN = Math.round(sr * 0.08);\n    this.voices = this.voices.filter(v => {\n      const o = outputs[v.tr] && outputs[v.tr][0]; if (!o) return false;\n      this.dirty.add(v.tr);\n      const chokeK = v.chokeAt >= 0 ? Math.round((v.chokeAt - t0) * sr) : Infinity;\n      for (let k = v.off; k < n; k++) {\n        let y = v.run() * v.gain;\n        if (k >= chokeK) { v.fade *= 0.995; y *= v.fade; }\n        o[k] += y;\n        v.age++;\n        if (Math.abs(y) < 2e-5) v.quiet++; else v.quiet = 0;\n      }\n      v.off = 0;\n      return !(v.age > sr * 0.03 && v.quiet > quietN) && v.age < v.max && v.fade > 0.001;\n    });\n    return true;\n  }\n}\nregisterProcessor(\"nb-rc-analog\", RCAnalog);\n";
  const RC_AN = { "an:bd": ["bd", 50, 1.7], "an:sd": ["sd", 190, 1.0], "an:sbd": ["sbd", 52, 1.05], "an:ssd": ["ssd", 190, 1.15], "an:mh": ["mh", 400, 1.05], "an:rh": ["rh", 400, 2.75] };
  function rcAnalogReady() {
    if (RC.anReady) return RC.anReady;
    if (!ctx || !ctx.audioWorklet) return (RC.anReady = Promise.resolve(false));
    return (RC.anReady = (async () => {
      for (const url of [() => URL.createObjectURL(new Blob([RC_AN_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(RC_AN_SRC)]) {
        try { await ctx.audioWorklet.addModule(url()); return true; } catch (e) {}
      }
      return false;
    })());
  }
  function rcAnalogHit(i, id, t, p) {
    if (!RC.anOK) { rcAnalogReady().then(ok => { RC.anOK = ok; }); return; }
    if (!RC.an) { RC.an = new AudioWorkletNode(ctx, "nb-rc-analog", { numberOfInputs: 0, numberOfOutputs: RC_NTR, outputChannelCount: new Array(RC_NTR).fill(1) }); RC.anConn = new Set(); }
    if (!RC.anConn.has(i)) { RC.an.connect(rcTrackIn(i), i); RC.anConn.add(i); }
    const [kind, f, gain] = RC_AN[id];
    const dec = kind === "mh" || kind === "rh" ? p.dec * 0.75 : p.dec;
    RC.an.port.postMessage({ kind, tr: i, t, v: Math.min(1, p.v), f: f * p.r, tone: p.tone, decay: dec, ch: p.ch, gain });
    RC.anLast = ctx.currentTime;
    clearTimeout(RC.anIdle); RC.anIdle = setTimeout(rcAnalogClose, 8000);
  }
  function rcAnalogClose() {
    if (!RC.an) return;
    if (RC.playing && RCP.tracks.some(tr => rcEngine(tr.snd) === "an" && tr.on.some(Boolean))) { RC.anIdle = setTimeout(rcAnalogClose, 8000); return; }
    try { RC.an.port.postMessage("close"); RC.an.disconnect(); } catch (e) {}
    RC.an = null; RC.anConn = null;
  }

  // ---------- one hit on one track ----------
  function rcHit(i, t, vel) {
    const tr = RCP.tracks[i], id = tr.snd, eng = rcEngine(id), snd = rcSnd(id); if (!snd || !ctx) return;
    const p = { v: vel, r: Math.pow(2, tr.tune / 12), d: Math.pow(2, (tr.decay - 0.5) * 2.4), dec: tr.decay, tone: tr.tone, ch: tr.char, beat: 60 / rcBpm() };
    if (snd.role === "ch") rcChoke(t);
    // where worklets can't run (the claude.ai preview), the Analog sounds fall back to their nearest synthesized cousins
    if (eng === "an" && RC.anOK === false) { const fb = { "an:bd": "808:bd", "an:sd": "808:sd", "an:sbd": "909:bd", "an:ssd": "909:sd", "an:mh": "808:ch", "an:rh": "909:ch" }[id]; const V = rcV(t, rcTrackIn(i), vel * rcGain(fb)); RC_SYN[fb](V, p); V.go(); return; }
    if (eng === "an") { rcAnalogHit(i, id, t, p); return; }
    const out = rcTrackIn(i);
    p.v *= rcGain(id);
    if (eng === "smp") { const V = rcSampleHit(id, t, p, out); if (V && snd.role === "oh") rcChokeable(V); return; }
    const fn = RC_SYN[id]; if (!fn) return;
    const V = rcV(t, out, p.v); fn(V, p); V.go();
    if (snd.role === "oh") rcChokeable(V);
  }
  // a closed hat cuts an open hat off, like the real machines
  function rcChokeable(V) { const cg = ctx.createGain(); try { V.o.disconnect(V.out); } catch (e) {} V.o.connect(cg).connect(V.out); V.extra.push(cg); RC.ohVoices.add({ cg, end: V.end }); }
  function rcChoke(t) {
    RCP.tracks.forEach((tr, i) => { const s = rcSnd(tr.snd); if (s && s.role === "oh" && rcEngine(tr.snd) === "an" && RC.an) RC.an.port.postMessage({ choke: i, t }); });
    RC.ohVoices.forEach(v => { if (v.end < t) { RC.ohVoices.delete(v); return; } try { v.cg.gain.setTargetAtTime(0, t, 0.006); } catch (e) {} RC.ohVoices.delete(v); });
  }

  // ---------- the clock ----------
  const rcBpm = () => { const f = rcFollow(); return f ? f.bpm : (RC.playing && RC.djHold) || state.seq.bpm; };   // Auto BPM: a playing DJ deck sets the tempo
  const rcStepDur = () => 60 / rcBpm() / 4;
  function rcScheduleStep(n, t, sd) {
    const swingT = n % 2 === 1 ? t + RCP.swing * sd * 0.5 : t;
    const anySolo = RCP.tracks.some(tr => tr.solo);
    RCP.tracks.forEach((tr, i) => {
      if (tr.mute || (anySolo && !tr.solo)) return;
      const L = Math.max(1, Math.min(RC_MAX, tr.len)), s = n % L, loop = Math.floor(n / L);
      if (!tr.on[s]) return;
      const pc = RC_CHANCE[tr.prob[s] || 0];
      if (typeof pc === "number") { if (pc < 100 && Math.random() * 100 >= pc) return; }
      else { const [a, b] = pc.split(":").map(Number); if (loop % b !== a - 1) return; }
      const fl = rcFeel(tr, s), at = swingT + (RC_NUDGE[tr.nudge[s] || 0] || 0) * sd + fl.dt, vel = (tr.acc[s] ? 1 : 0.7) * fl.dv, r = Math.max(1, tr.roll[s] || 1);
      if (tr.flam[s]) rcHit(i, at - 0.018 - Math.random() * 0.012 * (RCP.feel || 0), vel * 0.5);
      for (let k = 0; k < r; k++) rcHit(i, at + k * sd / r, k ? vel * (0.78 + 0.1 * k / r) : vel);
    });
    RC.queue.push({ n, t: swingT }); if (RC.queue.length > 64) RC.queue.shift();
  }
  function rcTick() {
    if (!ctx || !RC.playing) return;
    const sd = rcStepDur();
    if (RC.nextT < ctx.currentTime - 0.05) { const k = Math.ceil((ctx.currentTime - RC.nextT) / sd); RC.nextT += k * sd; RC.step += k; }   // timers were paused
    while (RC.nextT < ctx.currentTime + NB_LA) { rcScheduleStep(RC.step, RC.nextT, sd); RC.nextT += sd; RC.step++; }
  }
  function rcPlay(on) {
    if (on) {
      start(); if (!ctx) return;
      if (RC.playing) return;
      if (RCP.tracks.some(tr => rcEngine(tr.snd) === "an")) rcAnalogReady().then(ok => { RC.anOK = ok; });
      RCP.tracks.forEach(tr => { if (rcEngine(tr.snd) === "smp") rcSampleBuf(tr.snd); });
      RC.playing = true;
      if (playing) { RC.nextT = nextTime; RC.step = curStep; }   // lock onto the sequencer's grid
      else { RC.nextT = ctx.currentTime + 0.06; RC.step = 0; const g = NB_GRID && NB_GRID(0); if (g) { RC.nextT = Math.max(ctx.currentTime, g.t); RC.step = g.abs; } }
      rcTick(); RC.timer = setInterval(rcTick, 25);
    } else { RC.playing = false; clearInterval(RC.timer); RC.queue.length = 0; }
    rcPaintTransport();
  }
  function rcHush() {
    if (!ctx) return; const now = ctx.currentTime;
    RCV.forEach(V => { if (V.o.context !== ctx) return; if (V.end < now - 1) { RCV.delete(V); return; } try { V.o.gain.cancelScheduledValues(now); V.o.gain.setValueAtTime(V.o.gain.value, now); V.o.gain.linearRampToValueAtTime(0, now + 0.012); } catch (e) {} });
  }
  document.getElementById("stopAll").addEventListener("click", () => { rcPlay(false); rcHush(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && RC.playing && !nbKeepPlaying()) rcPlay(false); });
  // the sequencer starting while the Rhythm Creator plays: line up with it
  { const ss = startSeq; startSeq = function () { const was = playing; const r = ss.apply(this, arguments); if (!was && playing && RC.playing) { RC.nextT = nextTime; RC.step = curStep; } return r; }; }

  // ---------- pattern tools ----------
  function rcEuclid(k, n, rot) {
    k = Math.max(0, Math.min(n, k)); const out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) out[i] = Math.floor((i * k) / n) !== Math.floor(((i - 1) * k) / n) || (i === 0 && k > 0) ? 1 : 0;
    if (k === 0) out.fill(0);
    const r = ((rot % n) + n) % n; return out.slice(n - r).concat(out.slice(0, n - r));
  }
  // probability templates per role (16 steps), for each style
  const RC_STYLES = {
    "House": { bpm: 124, swing: 0.1, kick: "9000900090009000", snare: "0000900000009000", clap: "0000900000009000", ch: "0090009000900090", oh: "0050005000500050", ride: "4040404040404040", perc: "0020003000200030", shaker: "5555555555555555", tom: "0000000000000020", cym: "9000000000000000", bell: "0000003000000300", rim: "0002000000020000", boom: "9000000000000000", fx: "0000000000000003" },
    "Techno": { bpm: 130, swing: 0, kick: "9000900090009000", snare: "0000000000000000", clap: "0000700000007000", ch: "6060606060606060", oh: "0090009000900090", ride: "0000000000000000", perc: "0030200300302003", shaker: "3333333333333333", tom: "0000002000000030", cym: "5000000000000000", bell: "0000000000000000", rim: "0020000300200003", boom: "0000000000000000", fx: "0000000000000004" },
    "Trap": { bpm: 140, swing: 0, kick: "9000000400900000", snare: "0000000090000000", clap: "0000000090000000", ch: "9999999999999999", oh: "0000000000000030", ride: "0000000000000000", perc: "0000000300000020", shaker: "0000000000000000", tom: "0000000000000030", cym: "6000000000000000", bell: "0000000000000000", rim: "0000000000000300", boom: "9000000300900000", fx: "0000000000000004" },
    "Boom bap": { bpm: 90, swing: 0.28, kick: "9000000600900300", snare: "0000900000009000", clap: "0000300000003000", ch: "9090909090909090", oh: "0000000000000030", ride: "0000000000000000", perc: "0000000000300000", shaker: "3030303030303030", tom: "0000000000000020", cym: "4000000000000000", bell: "0000000000000000", rim: "0003000000030000", boom: "9000000600900300", fx: "0000000000000000" },
    "Lo-fi": { bpm: 82, swing: 0.35, kick: "9000005000900000", snare: "0000900000009000", clap: "0000000000000000", ch: "7070707070707070", oh: "0000000000000020", ride: "0000000000000000", perc: "0000300000003000", shaker: "4444444444444444", tom: "0000000000000000", cym: "0000000000000000", bell: "0000000000000000", rim: "0000500000005000", boom: "9000005000900000", fx: "0000000000000000" },
    "Drum & bass": { bpm: 172, swing: 0, kick: "9000000000900000", snare: "0000900000009000", clap: "0000300000003000", ch: "9090909090909090", oh: "0000000300000000", ride: "4040404040404040", perc: "0000000000300030", shaker: "5555555555555555", tom: "0000000000000020", cym: "5000000000000000", bell: "0000000000000000", rim: "0003000000000300", boom: "9000000000900000", fx: "0000000000000000" },
    "Reggaeton": { bpm: 95, swing: 0, kick: "9000900090009000", snare: "0009009000090090", clap: "0009009000090090", ch: "7070707070707070", oh: "0000000000000000", ride: "0000000000000000", perc: "0030003000300030", shaker: "5555555555555555", tom: "0000000000000000", cym: "4000000000000000", bell: "0000000000000000", rim: "0009009000090090", boom: "9000900090009000", fx: "0000000000000000" },
    "Afrobeat": { bpm: 105, swing: 0.15, kick: "9000009000900000", snare: "0000900000009000", clap: "0000000000000000", ch: "9090909090909090", oh: "0000000000000030", ride: "0000000000000000", perc: "0090090090090090", shaker: "7777777777777777", tom: "0000000000000030", cym: "0000000000000000", bell: "9009009000900900", rim: "0000900000009000", boom: "9000009000900000", fx: "0000000000000000" },
    "Funk": { bpm: 100, swing: 0.15, kick: "9000003000900300", snare: "0000900300009000", clap: "0000000000000000", ch: "9999999999999999", oh: "0000000000000090", ride: "0000000000000000", perc: "0000000030000003", shaker: "0000000000000000", tom: "0000000000000030", cym: "4000000000000000", bell: "0000000000000000", rim: "0300000000300000", boom: "9000003000900300", fx: "0000000000000000" },
    "Electro": { bpm: 120, swing: 0, kick: "9000000090300000", snare: "0000900000009000", clap: "0000900000009000", ch: "9090909090909090", oh: "0000000000000000", ride: "0000000000000000", perc: "0000000000000300", shaker: "0000000000000000", tom: "0000000000300030", cym: "4000000000000000", bell: "0000000300000000", rim: "0000000000000000", boom: "9000000090300000", fx: "0000000300000004" },
    "Rock": { bpm: 112, swing: 0, kick: "9000000090900000", snare: "0000900000009000", clap: "0000000000000000", ch: "9090909090909090", oh: "0000000000000040", ride: "0000000000000000", perc: "0000000000000000", shaker: "0000000000000000", tom: "0000000000000003", cym: "4000000000000000", bell: "0000000000000000", rim: "0000000000000000", boom: "0000000000000000", fx: "0000000000000000" },
    "Pop": { bpm: 100, swing: 0.05, kick: "9000003090000000", snare: "0000900000009000", clap: "0000700000007000", ch: "9696969696969696", oh: "0000000000000030", ride: "0000000000000000", perc: "0000000000000000", shaker: "6666666666666666", tom: "0000000000000000", cym: "2000000000000000", bell: "0000000000000000", rim: "0000000000000000", boom: "0000000000000000", fx: "0000000000000000" },
    "Jazz": { bpm: 138, swing: 0.6, kick: "0000000000300000", snare: "0000002000020002", clap: "0000000000000000", ch: "0000900000009000", oh: "0000000000000000", ride: "9000900990009009", perc: "0000000000000000", shaker: "0000000000000000", tom: "0000000000000000", cym: "0000000000000000", bell: "0000000000000000", rim: "0000000000000000", boom: "0000000000000000", fx: "0000000000000000" },
  };
  function rcMakeBeat(style, busy, cplx) {
    const S = RC_STYLES[style]; if (!S) return;
    const roleOf = tr => (rcSnd(tr.snd) || {}).role || "perc";
    const used = {};
    RCP.tracks.forEach(tr => {
      const role = roleOf(tr), tpl = S[role] || S.perc, n = (used[role] = (used[role] || 0) + 1);
      ["on", "acc", "flam", "roll", "prob", "nudge"].forEach(k => tr[k].fill(0));
      tr.len = 16;
      // a second track with the same role plays a thinner, shifted version
      const thin = n > 1 ? 0.35 : 1;
      for (let s = 0; s < 16; s++) {
        let pr = (+tpl[s] / 9) * thin;
        if (pr > 0 && pr < 1) pr = Math.min(1, pr * (0.5 + busy));
        if (pr === 0 && role !== "kick" && role !== "boom" && role !== "cym" && Math.random() < cplx * busy * 0.12) pr = 0.6;
        if (Math.random() < pr) tr.on[s] = 1;
      }
      if (role === "kick" || role === "boom") { if (+tpl[0] >= 9) tr.on[0] = 1; }
      if ((role === "snare" || role === "clap") && n === 1) for (let s = 0; s < 16; s++) if (+tpl[s] >= 9) tr.on[s] = 1;
      for (let s = 0; s < 16; s++) if (tr.on[s]) {
        if (s % 4 === 0 && Math.random() < 0.6) tr.acc[s] = 1;
        if (role === "ch" && style === "Trap" && Math.random() < 0.15 + cplx * 0.35) tr.roll[s] = [2, 3, 4][Math.floor(Math.random() * 3)];
        if ((role === "snare" || role === "clap") && Math.random() < cplx * 0.12) tr.flam[s] = 1;
        if ((role === "perc" || role === "shaker" || role === "ch") && Math.random() < cplx * 0.25) tr.prob[s] = 1 + Math.floor(Math.random() * 3);
        if ((role === "perc" || role === "shaker") && Math.random() < cplx * 0.15) tr.nudge[s] = Math.random() < 0.5 ? 1 : 4;
      }
    });
    // more than one hat lane, or an open hat on the same step as the closed one: keep the open one
    RCP.swing = S.swing; setBpm(S.bpm); RCP.style = style; RCP.busy = busy; RCP.cplx = cplx;
    rcSave(); rcRender(); noteMsg("Made a " + style + " beat · " + S.bpm + " bpm · tap Vary for a variation");
  }
  function rcVary(amount = 0.15) {
    RCP.tracks.forEach(tr => {
      const role = (rcSnd(tr.snd) || {}).role || "perc", L = tr.len;
      for (let s = 0; s < L; s++) {
        if ((role === "kick" || role === "boom") && s % 8 === 0) continue;   // keep the downbeats
        if ((role === "snare" || role === "clap") && tr.on[s] && s % 8 === 4) continue;   // and the backbeat
        if (Math.random() >= amount * (role === "kick" ? 0.5 : 1)) continue;
        if (tr.on[s]) { if (Math.random() < 0.5) tr.on[s] = 0; else if (role === "ch" || role === "shaker") tr.roll[s] = tr.roll[s] > 1 ? 0 : 2; else tr.acc[s] = tr.acc[s] ? 0 : 1; }
        else if (tr.on.slice(0, L).some(Boolean) && Math.random() < (s % 2 ? 0.45 : 0.3)) { tr.on[s] = 1; if (role !== "kick") tr.prob[s] = Math.random() < 0.4 ? 1 : 0; }
      }
    });
    rcSave(); rcRender();
  }
  // morph: two saved kits (A, B) and a slider between them
  const rcKit = () => RCP.tracks.map(tr => RC_KNOBS.reduce((o, k) => (o[k] = tr[k], o), {}));
  function rcMorph(m) {
    const { a, b } = RCP.morph; if (!a || !b) return;
    RCP.morph.m = m;
    RCP.tracks.forEach((tr, i) => { if (!a[i] || !b[i]) return; RC_KNOBS.forEach(k => { tr[k] = a[i][k] + (b[i][k] - a[i][k]) * m; }); rcApplyTrack(i); });
    rcSave(); if (!rcView.hidden) rcPaintEditor();
  }

  // ---------- the screen ----------
  const rcView = document.getElementById("rcView"), rcGrid = document.getElementById("rcGrid"), rcEd = document.getElementById("rcEd");
  const rcBtn = document.getElementById("rcBtn"), rcPlayBtn = document.getElementById("rcPlay");
  function rcPaintTransport() {
    rcPlayBtn.textContent = RC.playing ? "■ Stop" : "▶ Play"; rcPlayBtn.setAttribute("aria-pressed", String(RC.playing));
    rcBtn.classList.toggle("live", RC.playing); rcBtn.setAttribute("aria-label", RC.playing ? "Rhythm (playing)" : "Rhythm");
    document.getElementById("rcBpm").textContent = Math.round(rcBpm()) + " bpm";
  }
  const rcStepLen = () => Math.max(rcSigOf().bar, RCP.steps);
  function rcRender() {
    const W = rcPageW(), pages = Math.ceil(rcStepLen() / W); if (RC.page >= pages) RC.page = 0;
    const pg = document.getElementById("rcPages"); let ph = "";
    for (let k = 0; k < pages; k++) ph += `<button data-p="${k}" aria-pressed="${k === RC.page}">${k * W + 1}–${(k + 1) * W}</button>`;
    pg.innerHTML = ph; pg.hidden = pages < 2;
    rcGrid.style.setProperty("--rcw", W); rcGrid.classList.toggle("zoom", !!RC.zoom);
    document.getElementById("rcZoom").setAttribute("aria-pressed", String(!!RC.zoom));
    const base = RC.page * W, anySolo = RCP.tracks.some(t => t.solo);
    let h = "";
    RCP.tracks.forEach((tr, i) => {
      const s = rcSnd(tr.snd) || { code: "?", name: "?" };
      h += `<div class="rc-row${i === RC.sel ? " sel" : ""}${tr.mute || (anySolo && !tr.solo) ? " muted" : ""}" data-t="${i}"><button class="rc-lab" data-t="${i}" title="${s.name}"><b>${s.code}</b><small>${s.name}</small></button>`;
      for (let k = 0; k < W; k++) {
        const st = base + k, out = st >= tr.len, on = !out && tr.on[st];
        const marks = on ? (tr.roll[st] > 1 ? `<i class="r">${tr.roll[st]}</i>` : "") + (tr.flam[st] ? `<i class="f"></i>` : "") + (tr.prob[st] ? `<i class="p">${RC_CHANCE_LAB[tr.prob[st]]}</i>` : "") + (tr.nudge[st] ? `<i class="n${RC_NUDGE[tr.nudge[st]] > 0 ? "r" : "l"}"></i>` : "") : "";
        h += `<button class="rc-c${on ? " on" : ""}${on && tr.acc[st] ? " acc" : ""}${out ? " out" : ""}${rcIsBeat(st) ? " beat" : ""}${st % rcSigOf().bar === 0 && st ? " bar" : ""}" data-t="${i}" data-s="${st}" aria-label="${s.name} step ${st + 1}">${marks}</button>`;
      }
      h += `</div>`;
    });
    rcGrid.innerHTML = h; RC.shown = -1;
    rcPaintEditor(); rcPaintTransport();
    document.querySelectorAll("#rcModes button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === RC.mode)));
    document.getElementById("rcSwing").value = Math.round(RCP.swing * 100); document.getElementById("rcSwingV").textContent = Math.round(RCP.swing * 100) + "%";
    document.getElementById("rcLen").value = String(RCP.steps);
    const mm = document.getElementById("rcMorph"); mm.disabled = !(RCP.morph.a && RCP.morph.b); mm.value = Math.round(RCP.morph.m * 100);
    document.getElementById("rcMorphA").classList.toggle("set", !!RCP.morph.a); document.getElementById("rcMorphB").classList.toggle("set", !!RCP.morph.b);
  }
  // the selected track's sound and knobs
  function rcSoundOptions(cur) {
    const groups = {};
    RC_SOUNDS.forEach(s => { (groups[s[1]] = groups[s[1]] || []).push([s[0], RC_BY[s[0]].name]); });
    groups["Sampler"] = []; for (let i = 0; i < 8; i++) groups["Sampler"].push(["s" + i, rcSnd("s" + i).name]);
    groups["Pads"] = []; for (let k = 0; k < 12; k++) if (padBuf[k]) groups["Pads"].push(["p" + k, rcSnd("p" + k).name]);
    if (window.NB_KITS) Object.entries(NB_KITS).forEach(([kid, K]) => { groups[K.name] = K.pads.map((pd, j) => pd && ["k:" + kid + ":" + j, pd.name]).filter(Boolean); });
    return Object.entries(groups).filter(([, v]) => v.length).map(([g, v]) => `<optgroup label="${g}">` + v.map(([id, n]) => `<option value="${id}"${id === cur ? " selected" : ""}>${n}</option>`).join("") + `</optgroup>`).join("");
  }
  const RC_ED_KNOBS = [["vol", "Level", 0, 1, v => Math.round(v * 100)], ["pan", "Pan", -1, 1, v => v === 0 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100)], ["tune", "Tune", -24, 24, v => (v > 0 ? "+" : "") + Math.round(v) + " st"],
    ["decay", "Decay", 0, 1, v => Math.round(v * 100)], ["tone", "Tone", 0, 1, v => Math.round(v * 100)], ["char", "Character", 0, 1, v => Math.round(v * 100)], ["ff", "Filter freq", 0, 1, v => Math.round(30 * Math.pow(2, v * 9.4)) + " Hz"],
    ["fq", "Resonance", 0, 1, v => Math.round(v * 100)], ["drive", "Drive", 0, 1, v => Math.round(v * 100)]];
  function rcPaintEditor() {
    const i = RC.sel, tr = RCP.tracks[i], s = rcSnd(tr.snd) || { name: "?", group: "", chLab: "Character" };
    rcEd.innerHTML = `<div class="rc-edhead"><strong>Track ${i + 1}</strong><select id="rcSnd" aria-label="Sound">${rcSoundOptions(tr.snd)}</select>
        <button class="btn" id="rcAud" title="Hear this sound">▶</button>
        <button class="btn${tr.mute ? " on" : ""}" id="rcMute" aria-pressed="${tr.mute}">Mute</button><button class="btn${tr.solo ? " on" : ""}" id="rcSolo" aria-pressed="${tr.solo}">Solo</button></div>
      <div class="rc-knobs">` + RC_ED_KNOBS.map(([k, lab, lo, hi, fmt]) => `<label class="rc-k"><span>${k === "char" ? s.chLab && s.chLab !== "—" ? s.chLab : "Character" : lab}<em id="rcV_${k}">${fmt(tr[k])}</em></span>
        <input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${k === "tune" ? 1 : 0.01}" value="${tr[k]}"></label>`).join("") + `
        <label class="rc-k"><span>Filter</span><select id="rcFt"><option value="off">Off</option><option value="lp">Low-pass</option><option value="hp">High-pass</option><option value="bp">Band-pass</option></select></label>
        <label class="rc-k"><span>Track length<em>${tr.len} steps</em></span><input type="range" id="rcTlen" min="1" max="${RC_MAX}" step="1" value="${tr.len}"></label>
      </div>
      <div class="rc-euc"><span class="lab2">Euclid</span><label>Hits <input type="number" id="rcEk" min="0" max="64" value="${tr.on.slice(0, tr.len).filter(Boolean).length || 4}"></label>
        <label>Rotate <input type="number" id="rcEr" min="0" max="63" value="0"></label><button class="btn" id="rcEgo">Fill ${tr.len} steps</button><button class="btn" id="rcClrT">Clear track</button></div>`;
    rcEd.querySelector("#rcFt").value = tr.ft;
  }
  rcEd.addEventListener("input", e => {
    const k = e.target.dataset && e.target.dataset.k, tr = RCP.tracks[RC.sel];
    if (k) { tr[k] = +e.target.value; const K = RC_ED_KNOBS.find(x => x[0] === k); const em = document.getElementById("rcV_" + k); if (em) em.textContent = K[4](tr[k]); if (ctx) rcApplyTrack(RC.sel); rcSave(); return; }
    if (e.target.id === "rcTlen") { tr.len = +e.target.value; e.target.previousElementSibling.querySelector("em").textContent = tr.len + " steps"; rcSave(); rcRenderSoon(); }
  });
  let rcRT = 0; const rcRenderSoon = () => { clearTimeout(rcRT); rcRT = setTimeout(rcRender, 120); };
  rcEd.addEventListener("change", e => {
    const tr = RCP.tracks[RC.sel];
    if (e.target.id === "rcSnd") { tr.snd = e.target.value; if (rcEngine(tr.snd) === "smp") rcSampleBuf(tr.snd); if (rcEngine(tr.snd) === "an") rcAnalogReady().then(ok => { RC.anOK = ok; }); rcSave(); rcRender(); rcAudition(RC.sel); }
    if (e.target.id === "rcFt") { tr.ft = e.target.value; if (ctx) rcApplyTrack(RC.sel); rcSave(); }
  });
  rcEd.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; const tr = RCP.tracks[RC.sel];
    if (b.id === "rcAud") rcAudition(RC.sel);
    if (b.id === "rcMute") { tr.mute = !tr.mute; rcSave(); rcRender(); }
    if (b.id === "rcSolo") { tr.solo = !tr.solo; rcSave(); rcRender(); }
    if (b.id === "rcClrT") { ["on", "acc", "flam", "roll", "prob", "nudge"].forEach(k => tr[k].fill(0)); rcSave(); rcRender(); }
    if (b.id === "rcEgo") {
      const k = +document.getElementById("rcEk").value || 0, r = +document.getElementById("rcEr").value || 0, pat = rcEuclid(k, tr.len, r);
      for (let s = 0; s < tr.len; s++) { tr.on[s] = pat[s]; if (!pat[s]) { tr.acc[s] = tr.flam[s] = tr.roll[s] = tr.prob[s] = tr.nudge[s] = 0; } }
      rcSave(); rcRender(); noteMsg("Euclid: " + k + " hits spread over " + tr.len + " steps" + (r ? ", rotated " + r : ""));
    }
  });
  function rcAudition(i) {
    start(); if (!ctx) return;
    const tr = RCP.tracks[i];
    if (rcEngine(tr.snd) === "an" && !RC.anOK) { rcAnalogReady().then(ok => { RC.anOK = ok; if (ok) rcHit(i, ctx.currentTime + 0.03, 0.85); }); return; }
    if (rcEngine(tr.snd) === "smp" && !rcSampleBuf(tr.snd)) { setTimeout(() => rcHit(i, ctx.currentTime + 0.02, 0.85), 250); return; }
    rcHit(i, ctx.currentTime + 0.01, 0.85);
  }
  // tapping the grid: what a tap does depends on the mode row
  rcGrid.addEventListener("click", e => {
    if (RC.noClick) { RC.noClick = false; return; }
    const lab = e.target.closest(".rc-lab");
    if (lab) { RC.sel = +lab.dataset.t; rcRender(); rcAudition(RC.sel); return; }
    const c = e.target.closest(".rc-c"); if (!c || c.classList.contains("out")) return;
    const i = +c.dataset.t, s = +c.dataset.s, tr = RCP.tracks[i];
    if (RC.sel !== i) { RC.sel = i; }
    switch (RC.mode) {
      case "hits": tr.on[s] = tr.on[s] ? 0 : 1; if (!tr.on[s]) tr.acc[s] = tr.flam[s] = tr.roll[s] = tr.prob[s] = tr.nudge[s] = 0; else if (!RC.playing) rcAudition(i); break;
      case "acc": tr.on[s] = 1; tr.acc[s] = tr.acc[s] ? 0 : 1; break;
      case "flam": tr.on[s] = 1; tr.flam[s] = tr.flam[s] ? 0 : 1; break;
      case "roll": tr.on[s] = 1; tr.roll[s] = tr.roll[s] >= 4 ? 0 : Math.max(2, (tr.roll[s] || 1) + 1); break;
      case "prob": tr.on[s] = 1; tr.prob[s] = ((tr.prob[s] || 0) + 1) % RC_CHANCE.length; break;
      case "nudge": tr.on[s] = 1; tr.nudge[s] = ((tr.nudge[s] || 0) + 1) % RC_NUDGE.length; break;
    }
    rcSave(); rcRender();
  });
  document.getElementById("rcModes").addEventListener("click", e => { const b = e.target.closest("button[data-m]"); if (!b) return; RC.mode = b.dataset.m; rcRender(); });
  document.getElementById("rcPages").addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (!b) return; RC.page = +b.dataset.p; rcRender(); });
  rcPlayBtn.addEventListener("click", () => rcPlay(!RC.playing));
  document.getElementById("rcDone").addEventListener("click", () => { rcView.hidden = true; });
  rcBtn.addEventListener("click", () => { start(); rcView.hidden = false; rcRender(); if (ctx && RCP.tracks.some(tr => rcEngine(tr.snd) === "an")) rcAnalogReady().then(ok => { RC.anOK = ok; }); RCP.tracks.forEach(tr => { if (ctx && rcEngine(tr.snd) === "smp") rcSampleBuf(tr.snd); }); });
  document.getElementById("rcBpmDown").addEventListener("click", () => { setBpm(state.seq.bpm - 1); rcPaintTransport(); });
  document.getElementById("rcBpmUp").addEventListener("click", () => { setBpm(state.seq.bpm + 1); rcPaintTransport(); });
  document.getElementById("rcSwing").addEventListener("input", e => { RCP.swing = +e.target.value / 100; document.getElementById("rcSwingV").textContent = e.target.value + "%"; rcSave(); });
  document.getElementById("rcLen").addEventListener("change", e => { const n = +e.target.value, prev = RCP.steps; RCP.steps = n; RCP.tracks.forEach(tr => { if (tr.len === prev || tr.len > n) tr.len = n; }); RC.page = 0; rcSave(); rcRender(); });
  document.getElementById("rcMake").addEventListener("click", () => { start(); rcMakeBeat(document.getElementById("rcStyle").value, +document.getElementById("rcBusy").value / 100, +document.getElementById("rcCplx").value / 100); });
  document.getElementById("rcVary").addEventListener("click", () => { rcVary(0.15); noteMsg("Varied about 15% of the hits · tap again for more"); });
  document.getElementById("rcClear").addEventListener("click", () => { RCP.tracks.forEach(tr => ["on", "acc", "flam", "roll", "prob", "nudge"].forEach(k => tr[k].fill(0))); rcSave(); rcRender(); });
  document.getElementById("rcMorphA").addEventListener("click", () => { RCP.morph.a = rcKit(); if (!RCP.morph.b) RCP.morph.m = 0; rcSave(); rcRender(); noteMsg("Kit A saved · change the knobs and save B, then slide between them"); });
  document.getElementById("rcMorphB").addEventListener("click", () => { RCP.morph.b = rcKit(); RCP.morph.m = 1; rcSave(); rcRender(); noteMsg("Kit B saved · the Morph slider moves between A and B"); });
  document.getElementById("rcMorph").addEventListener("input", e => rcMorph(+e.target.value / 100));
  document.getElementById("rcLevel").addEventListener("input", e => { RCP.level = +e.target.value / 100; if (RC.bus) RC.bus.gain.setTargetAtTime(RCP.level, ctx.currentTime, 0.02); rcSave(); });
  document.getElementById("rcHelpBtn").addEventListener("click", () => { document.getElementById("rcHelp").hidden = false; });
  document.getElementById("rcHelpDone").addEventListener("click", () => { document.getElementById("rcHelp").hidden = true; });
  document.getElementById("rcRec").addEventListener("click", () => document.getElementById("takeBtn").click());
  {
    const sel = document.getElementById("rcStyle"); sel.innerHTML = Object.keys(RC_STYLES).map(k => `<option${k === RCP.style ? " selected" : ""}>${k}</option>`).join("");
    document.getElementById("rcBusy").value = Math.round(RCP.busy * 100); document.getElementById("rcCplx").value = Math.round(RCP.cplx * 100); document.getElementById("rcLevel").value = Math.round(RCP.level * 100);
    setInterval(() => { if (rcView.hidden) return; const tb = document.getElementById("takeBtn"), rb = document.getElementById("rcRec"); if (rb.textContent !== tb.textContent) rb.textContent = tb.textContent; rb.classList.toggle("live", tb.classList.contains("live")); }, 300);
  }
  // the playhead: one column lit while playing
  function rcFrame() {
    requestAnimationFrame(rcFrame);
    if (rcView.hidden || !ctx) return;
    let cur = -1;
    if (RC.playing) { const now = ctx.currentTime; for (const q of RC.queue) if (q.t <= now) cur = q.n; }
    const col = cur < 0 ? -1 : cur;
    if (col === RC.shown) return;
    rcGrid.querySelectorAll(".rc-c.now").forEach(c => c.classList.remove("now"));
    if (col >= 0) RCP.tracks.forEach((tr, i) => { const s = col % tr.len; if (Math.floor(s / rcPageW()) !== RC.page) return; const el = rcGrid.querySelector(`.rc-c[data-t="${i}"][data-s="${s}"]`); if (el) el.classList.add("now"); });
    RC.shown = col;
  }
  requestAnimationFrame(rcFrame);
  // the mixer gets a Rhythm Creator fader; the FX "Apply to" row gets Rhythm
  { const mc = mixChannels; mixChannels = function () { const ch = mc(); const at = ch.findIndex(c => c.group === "DJ"); ch.splice(at < 0 ? ch.length : at, 0, { group: "Rhythm Creator", name: "Rhythm Creator", sub: "all 16 tracks", get: () => RCP.level, set: v => { RCP.level = v; if (RC.bus) RC.bus.gain.setTargetAtTime(v, ctx.currentTime, 0.02); rcSave(); }, dflt: 0.85, live: true }); return ch; }; }
