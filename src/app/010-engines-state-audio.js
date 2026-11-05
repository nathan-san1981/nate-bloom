  // ---------- Engine + knob definitions ----------
  const ENGINES = {
    saw:    { name: "Supersaw",      short: "Saw",    after: "after Surge XT",
              knobs: [["detune","Detune",0.45],["cutoff","Cutoff",0.62],["res","Reso",0.2],["attack","Attack",0.1],["release","Release",0.45]] },
    analog: { name: "Analog Poly",   short: "Analog", after: "after OB-Xf",
              knobs: [["cutoff","Cutoff",0.35],["env","Env amt",0.55],["res","Reso",0.3],["attack","Attack",0.05],["release","Release",0.4]] },
    vital:  { name: "Morph Pad",     short: "Morph",  after: "after Vital",
              knobs: [["morph","Morph",0.35],["motion","Motion",0.4],["tone","Tone",0.55],["attack","Attack",0.6],["release","Release",0.7]] },
    juno:   { name: "Juno Strings",  short: "Juno",   after: "after TAL-NoiseMaker",
              knobs: [["pwm","PWM",0.5],["dco","DCO",0.35],["chorus","Chorus",0.6],["cutoff","Cutoff",0.55],["hpf","HPF",0],["attack","Attack",0.35],["release","Release",0.6]] },   // 168: DCO mix, chorus I / II / I+II and the HPF, as the Juno-106 (after the KR-106)
    tyrell: { name: "Blade Brass",   short: "Brass",  after: "after TyrellN6",
              knobs: [["swell","Swell",0.45],["bite","Bite",0.4],["vibrato","Vibrato",0.35],["attack","Attack",0.25],["release","Release",0.55]] },
    choir:  { name: "Ghost Choir",   short: "Choir",  after: "after Spitfire LABS",
              knobs: [["vowel","Vowel",0.1],["breath","Breath",0.3],["vib","Vibrato",0.3],["attack","Attack",0.55],["release","Release",0.65]] },
    zeb:    { name: "Spectral Drone",short: "Drone",  after: "after Zebralette",
              knobs: [["bright","Bright",0.45],["oddeven","Odd/Even",0.5],["evolve","Evolve",0.4],["attack","Attack",0.6],["release","Release",0.75]] },
    bells:  { name: "Comb Bells",    short: "Bells",  after: "after Triple Cheese",
              knobs: [["material","Material",0.45],["ring","Ring",0.5],["hardness","Hardness",0.5],["shimmer","Shimmer",0.35],["release","Release",0.6]] },
    fm:     { name: "FM Glass",      short: "FM",     after: "after Dexed · beta",
              knobs: [["bright","Bright",0.5],["feedback","Feedback",0.3],["spread","Spread",0.15],["attack","Attack",0],["release","Release",0.5]] },
  };
  const TAB_SUB = { saw: "Surge XT", analog: "OB-Xf", vital: "Vital", juno: "NoiseMaker", tyrell: "TyrellN6",
                    choir: "LABS", zeb: "Zebralette", bells: "TripleChz", fm: "Dexed" };
  const VOWELS = [[730,1090,2440],[530,1840,2480],[270,2290,3010],[570,840,2410],[300,870,2240]];
  const MODES = [[1, 2.0, 3.0, 4.2, 5.4], [1, 2.76, 5.4, 8.93, 13.34], [1, 1.59, 2.14, 2.65, 3.16]];
  const FX_KNOBS = [["drive","Drive",0.15],["wobble","Wobble",0.35],["echo","Echo",0.3],["space","Space",0.55],["volume","Volume",0.7]];
  const FM_RATIOS = [0.5, 1, 1.5, 2, 3, 3.5, 4, 5, 7, 9];
  const DRUM = { name: "Drum machines", short: "Drums", after: "808 · 909 · CR-78" };
  const DRUM_KNOBS = [["tune","Tune",0.4],["boom","Boom",0.45],["snap","Snap",0.5],["hat","Hats",0.3],["swing","Swing",0],["level","Level",0.85]];
  const DRUMS = [["kick","BD","Kick"],["snare","SD","Snare"],["clap","CP","Clap"],["ch","CH","Closed hat"],
                 ["oh","OH","Open hat"],["tom","LT","Tom"],["rim","RS","Rim"],["cow","CB","Cowbell"]];
  const PENTA = [0, 3, 5, 7, 10];
  const degToSemis = d => 12 * Math.floor(d / 5) + PENTA[((d % 5) + 5) % 5];
  const MAX_DEG = 14;
  const SAMP = { name: "Sampler", short: "Smp", after: "your files" };
  const SAMP_PLAY_KNOBS = [["start","Start",0],["length","Length",1],["tone","Tone",1],["fade","Fade",0.3],["level","Level",0.8]];
  const SAMP_GRAIN_KNOBS = [["pos","Position",0.25],["scan","Scan",0.15],["size","Size",0.45],["density","Density",0.5],["spray","Spray",0.25],["level","Level",0.8]];
  const NSLOTS = 8;
  const NPADS = 12;
  const SAMP_SLICE_KNOBS = [["slices","Slices",0.34],["sens","Detect",0],["tone","Tone",1],["fade","Fade",0.15],["level","Level",0.8]];
  // 166: Elephant (770): the shape's pitch glide, the formant sweep, the growl, Blend (167: the sample vocoding the elephant's own voice), the drive, the shape's length (×1 = the sample's) and a dB trim
  const SAMP_ELE_KNOBS = [["eGlide","Glide",0.5],["eWah","Wah",0.6],["eGrowl","Growl",0.5],["eBlend","Blend",0.6],["eDrive","Drive",0.5],["eLen","Length",0.5],["eDb","dB",2 / 3]];
  const PAD_KNOBS = [["pitch","Pitch",0.5],["start","Start",0],["length","Length",1],["tone","Tone",1],["level","Level",0.8]];
  const INST_KNOBS = [["tune","Tune",0.5],["tone","Tone",1],["attack","Attack",0],["release","Release",0.35],["level","Level",0.8]];
  const SLICE_COUNTS = [4, 6, 8, 12, 16, 24, 32];
  var moreReady = false, libReady = false;
  var more2Ready = false, more3Ready = false;
  const DRUM_PAD_KNOBS = [["pitch","Pitch",0.5],["length","Length",0.5],["vol","Volume",0.8]];
  const LIB_KNOBS = [["tune","Tune",0.5],["tone","Tone",1],["attack","Attack",0],["decay","Decay",0.62],["release","Release",0.3],["level","Level",0.8]];
  // (173) a computer with room to spare: the Linux app, or a desktop browser with 8 GB or more (not Lite, not a touch
  // screen). It plays more notes at once and records and samples for longer; phones and tablets keep the old limits.
  // (234) the Windows app is for anyone: Nathan's own plugins are "by Nathan" there, not "yours"
  const NB_YOURS = !(window.NB_NATIVE && window.NB_NATIVE.platform === "windows"); window.NB_YOURS = NB_YOURS;
  const NB_BIG = !window.NB_LITE && ((!!window.NB_NATIVE && /^(linux|windows)$/.test(window.NB_NATIVE.platform)) ||
    ((navigator.deviceMemory || 0) >= 8 && (navigator.hardwareConcurrency || 0) >= 6 && !(window.matchMedia && matchMedia("(pointer: coarse)").matches)));
  window.NB_BIG = NB_BIG;
  // (173) saving a file: the share sheet on a phone, tablet or Chromebook; on a computer (the Linux app included) it's a download
  // (the Linux app files it in Downloads/Nate Bloom). A share with nowhere to go used to lose the file there.
  const nbShareFiles = f => { try { const mob = /Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ""));
    return mob && !(window.NB_NATIVE && /^(linux|windows)$/.test(window.NB_NATIVE.platform)) && !!navigator.canShare && navigator.canShare({ files: [f] }); } catch (e) { return false; } };
  const MAX_SAMPLE_SEC = NB_BIG ? 1200 : 300;   // samples can be up to 5 minutes (20 on a big computer); longer files open the section picker
  const nbMinSec = s => (s % 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : s / 60 + ":00");   // 300 → "5:00"
  const sampleDefaults = () => Object.fromEntries([...SAMP_SLICE_KNOBS, ...SAMP_PLAY_KNOBS, ...SAMP_GRAIN_KNOBS, ...SAMP_ELE_KNOBS].map(([k,,v]) => [k, v]));

  // ---------- State ----------
  const state = { engine: "saw", octave: 0, hold: false, params: {} };
  for (const [id, e] of Object.entries(ENGINES)) {
    state.params[id] = Object.fromEntries(e.knobs.map(([k,,v]) => [k, v]));
  }
  state.fx = Object.fromEntries(FX_KNOBS.map(([k,,v]) => [k, v]));
  state.layers = Object.fromEntries(Object.keys(ENGINES).map(id => [id, { on: id === "saw", level: 0.8 }]));
  state.drum = Object.fromEntries(DRUM_KNOBS.map(([k,,v]) => [k, v]));
  state.drumPads = Object.fromEntries(DRUMS.map(([id]) => [id, { pitch: 0.5, length: 0.5, vol: 0.8 }]));
  state.drumSel = "kick";
  state.arp = {};
  state.mode = "keys";
  // Steps are 16th notes. Groups say where each beat starts, so odd meters show their pulse.
  const METERS = [
    ["4/4", [4, 4, 4, 4]], ["3/4", [4, 4, 4]], ["2/4", [4, 4]], ["5/4", [4, 4, 4, 4, 4]],
    ["6/8", [6, 6]], ["9/8", [6, 6, 6]], ["12/8", [6, 6, 6, 6]],
    ["5/8", [6, 4]], ["7/8", [4, 4, 6]], ["7/8 (3+2+2)", [6, 4, 4]],
  ];
  const MAXSTEPS = 24;
  const meterOf = name => METERS.find(m => m[0] === name) || METERS[0];
  const stepsNow = () => meterOf(state.seq.meter)[1].reduce((a, b) => a + b, 0);
  const beatStarts = () => { const out = new Set(); let at = 0; for (const g of meterOf(state.seq.meter)[1]) { out.add(at); at += g; } return out; };
  const emptyRow = () => Array(MAXSTEPS).fill(false);
  const fitRow = (a, fill) => { const o = Array(MAXSTEPS).fill(fill); a.slice(0, MAXSTEPS).forEach((v, i) => { o[i] = v; }); return o; };
  function examplePattern() {
    const rows = Object.fromEntries(DRUMS.map(([id]) => [id, emptyRow()]));
    for (let i = 0; i < NSLOTS; i++) rows["s" + i] = emptyRow();
    for (let k = 0; k < NPADS; k++) rows["p" + k] = emptyRow();
    [0, 8, 11].forEach(i => rows.kick[i] = true);
    [4, 12].forEach(i => rows.snare[i] = true);
    [12].forEach(i => rows.clap[i] = true);
    [0, 2, 4, 6, 8, 10, 12].forEach(i => rows.ch[i] = true);
    rows.oh[14] = true;
    const synth = Array(MAXSTEPS).fill(null);
    synth[0] = 5; synth[3] = 7; synth[6] = 8; synth[10] = 9; synth[12] = 7;
    return { bpm: 96, meter: "4/4", rows, synth };
  }
  state.seq = examplePattern();
  state.samp = { slot: 0, slots: Array.from({ length: NSLOTS }, (_, i) => ({ name: "", mode: "play", p: sampleDefaults() })) };
  const sampBuf = Array(NSLOTS).fill(null), sampPeaks = Array(NSLOTS).fill(null);
  const padBuf = Array(NPADS).fill(null), padPeaks = Array(NPADS).fill(null), padPlaying = Array(NPADS).fill(null);
  state.pads = { sel: 0, p: Array.from({ length: NPADS }, () => Object.fromEntries(PAD_KNOBS.map(([k,,v]) => [k, v]))), names: Array(NPADS).fill("") };
  state.inst = { cur: "", preset: 0, p: Object.fromEntries(INST_KNOBS.map(([k,,v]) => [k, v])) };
  state.lib = { id: "", parts: [], p: Object.fromEntries(LIB_KNOBS.map(([k,,v]) => [k, v])) };
  state.cur = null; state.melodic = "saw";
  let seqBuilt = false;
  try {
    const saved = JSON.parse(localStorage.getItem("nightbloom") || "null");
    if (saved && saved.params) {
      for (const id in saved.params) if (state.params[id]) Object.assign(state.params[id], saved.params[id]);
      if (saved.fx) Object.assign(state.fx, saved.fx);
      if (saved.layers) for (const id in saved.layers) if (state.layers[id]) Object.assign(state.layers[id], saved.layers[id]);
      if (ENGINES[saved.engine] || ["drum", "samp", "pads", "inst", "lib"].includes(saved.engine)) state.engine = saved.engine;
      if (saved.lib && typeof saved.lib.id === "string") { state.lib.id = saved.lib.id; if (saved.lib.p) Object.assign(state.lib.p, saved.lib.p); }
      if (saved.lib && Array.isArray(saved.lib.parts)) state.lib.parts = saved.lib.parts.filter(x => x && x.id).slice(0, 8);
      if (saved.cur && typeof saved.cur.id === "string") state.cur = { id: saved.cur.id, cat: saved.cur.cat };
      if (typeof saved.melodic === "string") state.melodic = saved.melodic;
      if (saved.stack && typeof saved.stack === "object") state.stack = { syn: !!saved.stack.syn, lib: !!saved.stack.lib, inst: !!saved.stack.inst, samp: Number.isInteger(saved.stack.samp) ? saved.stack.samp : -1, f: typeof saved.stack.f === "string" ? saved.stack.f : "", ls: Number.isInteger(saved.stack.ls) ? saved.stack.ls : 0 };
      if (saved.pads && Array.isArray(saved.pads.p)) {
        state.pads.sel = Math.min(NPADS - 1, saved.pads.sel | 0);
        saved.pads.p.slice(0, NPADS).forEach((x, k) => { if (x) Object.assign(state.pads.p[k], x); });
      }
      if (saved.inst) {
        if (typeof saved.inst.cur === "string") state.inst.cur = saved.inst.cur;
        state.inst.preset = saved.inst.preset | 0;
        if (saved.inst.p) Object.assign(state.inst.p, saved.inst.p);
      }
      if (saved.samp && Array.isArray(saved.samp.slots)) {
        state.samp.slot = Math.min(NSLOTS - 1, saved.samp.slot | 0);
        saved.samp.slots.slice(0, NSLOTS).forEach((x, i) => {
          if (!x) return;
          state.samp.slots[i].mode = ["grain", "play", "slice", "elephant"].includes(x.mode) ? x.mode : "play"; state.samp.slots[i].loop = !!x.loop; if (x.fit && typeof x.fit === "object") state.samp.slots[i].fit = { s: +x.fit.s || 1, st: +x.fit.st || 0, bpm: +x.fit.bpm || 0 };
          if (x.p) Object.assign(state.samp.slots[i].p, x.p);
        });
      }
      if (saved.drum) Object.assign(state.drum, saved.drum);
      if (saved.drumPads) for (const id in state.drumPads) if (saved.drumPads[id]) Object.assign(state.drumPads[id], saved.drumPads[id]);
      if (saved.drumSel && state.drumPads[saved.drumSel]) state.drumSel = saved.drumSel;
      if (saved.arp && typeof saved.arp === "object") for (const k in saved.arp) { const a = saved.arp[k]; if (a) state.arp[k] = { on: !!a.on, mode: a.mode || "up", rate: a.rate || "1/16", oct: Math.min(4, Math.max(1, a.oct | 0 || 1)), gate: Number(a.gate) || 0.6 }; }
      if (saved.seq && saved.seq.rows && Array.isArray(saved.seq.synth)) {
        state.seq.bpm = saved.seq.bpm || 96;
        state.seq.synth = fitRow(saved.seq.synth, null);
        state.seq.meter = METERS.some(m => m[0] === saved.seq.meter) ? saved.seq.meter : "4/4";
        if (saved.seq.beat && typeof saved.seq.beat.i === "number") state.seq.beat = { i: saved.seq.beat.i, dirty: !!saved.seq.beat.dirty };
        for (const id of Object.keys(state.seq.rows)) if (Array.isArray(saved.seq.rows[id])) state.seq.rows[id] = fitRow(saved.seq.rows[id], false);
      }
    }
  } catch (e) {}
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem("nightbloom", JSON.stringify({ engine: state.engine, params: state.params, fx: state.fx, layers: state.layers, drum: state.drum, seq: state.seq,
        samp: { slot: state.samp.slot, slots: state.samp.slots.map(x => ({ mode: x.mode, p: x.p, loop: !!x.loop, fit: x.fit || null })) },
        pads: { sel: state.pads.sel, p: state.pads.p }, inst: state.inst, lib: state.lib, cur: state.cur, melodic: state.melodic,
        drumPads: state.drumPads, drumSel: state.drumSel, arp: state.arp, stack: state.stack })); } catch (e) {}
    }, 300);
  }

  // ---------- Audio graph ----------
  let ctx = null, fx = null, analyser = null;
  let NB_LA = 0.12;   // how far ahead the schedulers look (s): grows when the screen stalls, see the timing guard

  function makeImpulse(seconds) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // dense noise with a soft pre-delay swell and long exponential tail
        const swell = Math.min(1, i / (rate * 0.03));
        d[i] = (Math.random() * 2 - 1) * swell * Math.pow(1 - t, 2.6);
      }
    }
    return buf;
  }

  // the Effects Drive: saturation without the level jump. g sets how hard it bites; a sound peaking at 0.3 comes out
  // about 6 dB up at any setting, louder parts round off instead of piling up
  function driveCurveFx(amount) {
    const n = 2048, c = new Float32Array(n), a = Math.max(0, Math.min(1, amount || 0)), g = 1 + 20 * a, pre = 1 + 1.5 * a, ref = 0.3, M = 2, norm = M * ref / Math.tanh(g * ref);
    for (let i = 0; i < n; i++) { const u = (i / (n - 1)) * 2 - 1; c[i] = norm * Math.tanh(g * u / pre); }
    return c;
  }
  function driveCurve(amount) {
    const n = 1024, curve = new Float32Array(n), k = 1 + amount * 30;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  // The effects chain (everything between the voices and the analyser). Built as a unit so it can be
  // thrown away and rebuilt: if any voice ever produces a NaN (a filter blowing up), it gets stuck in
  // the delays, reverb and compressor and silences everything until reload. The watchdog below
  // detects that and swaps in a fresh chain with fresh entry nodes, leaving the bad voices unplugged.
  function buildChain() {
    if (fx.chainNodes) {
      for (const n of fx.chainNodes) { try { if (n.stop) n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
    }
    const input = ctx.createGain();
    const drumBus = ctx.createGain();

    const shaper = ctx.createWaveShaper(); shaper.oversample = "2x";
    const driveIn = ctx.createGain();

    // Tape wobble: short modulated delay (wow + flutter) with a gentle high cut
    const wobbleDelay = ctx.createDelay(0.1); wobbleDelay.delayTime.value = 0.012;
    const wow = ctx.createOscillator(); wow.frequency.value = 0.6;
    const flutter = ctx.createOscillator(); flutter.frequency.value = 7.3;
    const wowDepth = ctx.createGain(), flutterDepth = ctx.createGain();
    wow.connect(wowDepth).connect(wobbleDelay.delayTime);
    flutter.connect(flutterDepth).connect(wobbleDelay.delayTime);
    wow.start(); flutter.start();
    const tapeTone = ctx.createBiquadFilter(); tapeTone.type = "lowpass"; tapeTone.frequency.value = 12000;

    // Echo: ping-pong style feedback delay, darkened each repeat
    const echoIn = ctx.createGain();
    const dL = ctx.createDelay(2), dR = ctx.createDelay(2);
    dL.delayTime.value = 0.375; dR.delayTime.value = 0.5;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    const echoTone = ctx.createBiquadFilter(); echoTone.type = "lowpass"; echoTone.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2);
    echoIn.connect(dL); dL.connect(echoTone); echoTone.connect(dR); dR.connect(fb); fb.connect(dL);
    dL.connect(merger, 0, 0); dR.connect(merger, 0, 1);
    const echoOut = ctx.createGain();
    merger.connect(echoOut);

    // Space: long convolution hall
    const verb = ctx.createConvolver(); verb.buffer = fx.impulse || (fx.impulse = makeImpulse(5.5));
    const verbIn = ctx.createGain(), verbOut = ctx.createGain();
    const verbHP = ctx.createBiquadFilter(); verbHP.type = "highpass"; verbHP.frequency.value = 180;
    verbIn.connect(verbHP).connect(verb).connect(verbOut);

    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;

    input.connect(driveIn).connect(shaper).connect(wobbleDelay).connect(tapeTone);
    const dry = ctx.createGain();
    tapeTone.connect(dry).connect(master);
    tapeTone.connect(echoIn);
    tapeTone.connect(verbIn);
    echoOut.connect(master);
    echoOut.connect(verbIn);
    verbOut.connect(master);
    master.connect(comp).connect(analyser);

    // 808 bus: skips the tape and echo, gets a little of the hall
    const drumVerb = ctx.createGain(); drumVerb.gain.value = 0.22;
    drumBus.connect(master); drumBus.connect(drumVerb).connect(verbIn);

    Object.assign(fx, { comp, input, driveIn, shaper, wowDepth, flutterDepth, tapeTone, echoIn, echoOut, fb, verbIn, verbOut, dry, master, drumBus,
      chainNodes: [input, drumBus, shaper, driveIn, wobbleDelay, wow, flutter, wowDepth, flutterDepth, tapeTone, echoIn, dL, dR, fb, echoTone,
        merger, echoOut, verb, verbIn, verbOut, verbHP, master, comp, dry, drumVerb] });
  }

  function buildAudio() {
    // "interactive" keeps Android on its fast audio path (asking for a bigger buffer switched it to the slow one: ~250 ms of lag)
    try { localStorage.removeItem("nightbloom-latency"); } catch (e) {}
    // (174) the Linux app starts on Steady, once: Fast leaves the sound about 4 ms of slack, and on Linux (PipeWire through
    // Chrome) a hiccup that size, not the CPU, turned into runs of dropouts with plenty of layers. Fast stays a tap away
    // in Settings › Sound check.
    try { if (!window.NB_LITE && window.NB_NATIVE && window.NB_NATIVE.platform === "linux" && !localStorage.getItem("nightbloom-buffer-lx174")) { localStorage.setItem("nightbloom-buffer", JSON.stringify("steady")); localStorage.setItem("nightbloom-buffer-lx174", "1"); } } catch (e) {}
    let nbSteady = false; try { nbSteady = !window.NB_LITE && JSON.parse(localStorage.getItem("nightbloom-buffer") || "null") === "steady"; } catch (e) {}
    // (194) the Linux app's low-latency output (a 256-frame buffer to the sound server, set when the app starts): the
    // quickest path, so Steady's bigger buffer doesn't put the delay back
    let nbLowest = false; try { nbLowest = !window.NB_LITE && !!(window.NB_NATIVE && window.NB_NATIVE.platform === "linux" && window.NB_NATIVE.lowLatency && window.NB_NATIVE.lowLatency.frames > 0); } catch (e) {}
    if (nbLowest) nbSteady = false;
    if (nbSteady) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "balanced" });   // (145: Steady, chosen in Live's CPU panel)
    else ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    ctx.__nbBuf = nbLowest ? "lowest" : nbSteady ? "steady" : "fast";
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    analyser.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    fx = { noise };
    buildChain();
    applyFx(); applyDrum();
    // (224) the example chime is worked out after the start, when slot 1 is still empty (60 ms the screen used to freeze for)
    loadStoredSamples().then(() => { loadMoreStored(); libStartup(); });
    setTimeout(() => { try { if (!sampBuf[0]) setSample(0, makeExampleChime(), "Example chime (generated)", { placeholder: true }); } catch (e) {} }, 1200);
  }

  function applyFx() {
    if (!fx) return;
    const p = state.fx, t = ctx.currentTime;
    fx.shaper.curve = driveCurveFx(p.drive);
    fx.driveIn.gain.setTargetAtTime(1 + p.drive * 1.5, t, 0.02);
    fx.wowDepth.gain.setTargetAtTime(p.wobble * 0.0045, t, 0.05);
    fx.flutterDepth.gain.setTargetAtTime(p.wobble * 0.0006, t, 0.05);
    fx.tapeTone.frequency.setTargetAtTime(14000 - p.wobble * 9000, t, 0.05);
    fx.echoOut.gain.setTargetAtTime(p.echo * 0.8, t, 0.05);
    fx.fb.gain.setTargetAtTime(0.25 + p.echo * 0.4, t, 0.05);
    fx.verbOut.gain.setTargetAtTime(p.space * 1.6, t, 0.05);
    fx.dry.gain.setTargetAtTime(1 - p.space * 0.45, t, 0.05);
    fx.master.gain.setTargetAtTime(p.volume * p.volume * 0.9, t, 0.03);
  }

