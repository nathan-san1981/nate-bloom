  // ---------- Four more synth engines + 30 classic sounds ----------
  // New engines: Mono (Minimoog / TB-303 bass and leads with glide), Sync (hard-sync lead), Hoover
  // (Alpha Juno rave stack) and Pluck. Then thirty presets after the sounds everyone knows, in a
  // "Classic Synths" category of the sound browser. Each preset is a complete sound: engines, sliders,
  // effects, octave, and an arpeggio or chord where the sound is known for one.
  let wvVoice = null, NB_CM = null;   // (Natewave, and Chord Morph / MPE, further down)
  const NEW_ENGINES = {
    mono:   { name: "Mono Bass & Lead", short: "Mono",   after: "after Minimoog · TB-303",
              knobs: [["cutoff","Cutoff",0.35],["env","Env amt",0.6],["res","Reso",0.45],["glide","Glide",0.15],["release","Decay",0.3]] },
    sync:   { name: "Sync Lead",        short: "Sync",   after: "after Prophet-5 · Jupiter-8",
              knobs: [["sync","Sync",0.5],["sweep","Sweep",0.6],["bite","Bite",0.65],["attack","Attack",0.05],["release","Release",0.35]] },
    hoover: { name: "Hoover",           short: "Hoover", after: "after Alpha Juno",
              knobs: [["detune","Detune",0.55],["dive","Dive",0.6],["width","Width",0.6],["attack","Attack",0.05],["release","Release",0.5]] },
    pluck:  { name: "Pluck",            short: "Pluck",  after: "after Nexus · Sylenth1",
              knobs: [["bright","Bright",0.6],["body","Body",0.45],["pick","Pick",0.5],["decay","Decay",0.4],["release","Release",0.25]] },
    wave:   { name: "Natewave",        short: "Wave",   after: "wavetable synth · after Massive · Serum",
              knobs: [["m1","Macro 1",0],["m2","Macro 2",0],["m3","Macro 3",0],["m4","Macro 4",0],["m5","Macro 5",0],["m6","Macro 6",0],["m7","Macro 7",0],["m8","Macro 8",0]] },
  };
  Object.assign(ENGINES, NEW_ENGINES);
  Object.assign(TAB_SUB, { mono: "Minimoog", sync: "Prophet", hoover: "Alpha Juno", pluck: "Nexus", wave: "Massive" });
  {
    let saved = null; try { saved = JSON.parse(localStorage.getItem("nightbloom") || "null"); } catch (e) {}
    for (const [id, e] of Object.entries(NEW_ENGINES)) {
      state.params[id] = Object.fromEntries(e.knobs.map(([k, , v]) => [k, v]));
      if (saved && saved.params && saved.params[id]) Object.assign(state.params[id], saved.params[id]);
      state.layers[id] = { on: false, level: 0.8 };
      if (saved && saved.layers && saved.layers[id]) Object.assign(state.layers[id], saved.layers[id]);
    }
    // tabs for the new engines, before the drum machines
    const drumWrap = tabsEl.querySelector('.tab[data-engine="drum"]').parentElement;
    for (const [id, e] of Object.entries(NEW_ENGINES)) {
      const wrap = document.createElement("div"); wrap.className = "tabwrap";
      const b = document.createElement("button"); b.className = "tab"; b.dataset.engine = id;
      b.innerHTML = `${e.short}<small>${TAB_SUB[id] || ""}</small>`;
      b.addEventListener("click", () => {
        state.engine = id;
        const anyOther = Object.keys(ENGINES).some(x => x !== id && state.layers[x].on);
        if (!anyOther) { for (const x in state.layers) state.layers[x].on = x === id; }
        renderEngine(); save();
      });
      const pwr = document.createElement("button"); pwr.className = "pwr"; pwr.dataset.engine = id; pwr.setAttribute("aria-label", "Stack " + e.name);
      pwr.addEventListener("click", ev => {
        ev.stopPropagation();
        const L = state.layers[id], count = Object.values(state.layers).filter(x => x.on).length;
        if (L.on && count === 1) return;
        L.on = !L.on; if (L.on) state.engine = id;
        renderEngine(); save();
      });
      wrap.append(b, pwr); drumWrap.before(wrap);
    }
    if (saved && NEW_ENGINES[saved.engine]) { state.engine = saved.engine; state.melodic = saved.engine; }
  }

  // hard-synced sawtooth as a wavetable: a slave saw that restarts every master cycle
  const syncWaves = new Map();
  function syncWave(ratio) {
    const key = Math.round(ratio * 12) / 12;
    if (syncWaves.has(key)) return syncWaves.get(key);
    const N = 512, H = 40, real = new Float32Array(H + 1), imag = new Float32Array(H + 1), y = new Float32Array(N);
    for (let n = 0; n < N; n++) { const ph = (n / N) * key; y[n] = (ph - Math.floor(ph)) * 2 - 1; }
    for (let k = 1; k <= H; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) { const a = 2 * Math.PI * k * n / N; re += y[n] * Math.cos(a); im += y[n] * Math.sin(a); }
      real[k] = 2 * re / N; imag[k] = 2 * im / N;
    }
    const w = ctx.createPeriodicWave(real, imag); syncWaves.set(key, w); return w;
  }
  let monoLast = null;   // the previous Mono note, for glide
  function newEngineVoice(midi, id, mix, when) {
    if (id === "wave") return wvVoice ? wvVoice(midi, mix, when) : { midi, stop() {} };
    const p = state.params[id], f = mtof(midi), t = when ?? ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.0001;
    const lvl = ctx.createGain(); lvl.gain.value = mix;
    out.connect(lvl).connect(fx.input);
    const oscs = [];
    let release = expMap(p.release ?? 0.3, 0.05, 6);
    const attack = p.attack != null ? expMap(p.attack, 0.004, 4) : 0.003;

    if (id === "mono") {
      // saw + square + sub through a 24 dB ladder-style pair of filters with a snappy envelope
      release = expMap(p.release, 0.04, 2.5);
      const f1 = nbVF("ladder"), f2 = ctx.createBiquadFilter(); f1.type = f2.type = "lowpass"; if (f1.nbModel === "ladder") f2.type = "allpass";
      f1.Q.value = 0.5 + p.res * 11; f2.Q.value = 0.7 + p.res * 2;
      const base = expMap(p.cutoff, 60, 8000), peak = Math.min(16000, base * (1 + p.env * 24)), dec = 0.04 + expMap(p.release, 0.05, 1.2) * 0.45;
      [f1, f2].forEach(fl => { fl.frequency.setValueAtTime(peak, t); fl.frequency.setTargetAtTime(base, t + 0.004, dec); });
      f1.connect(f2).connect(out);
      const glideT = p.glide > 0.03 && monoLast && t - monoLast.t < 2 && Math.abs(monoLast.f - f) > 1 ? expMap(p.glide, 0.02, 0.6) : 0;
      const from = glideT ? monoLast.f : f;
      [["sawtooth", 0, 0.3, 1], ["square", -5, 0.16, 1], ["square", 0, 0.22, 0.5]].forEach(([type, det, g, mul]) => {
        const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
        o.frequency.setValueAtTime(from * mul, t); if (glideT) o.frequency.exponentialRampToValueAtTime(f * mul, t + glideT);
        const og = ctx.createGain(); og.gain.value = g; o.connect(og).connect(f1); o.start(t); oscs.push(o);
      });
      monoLast = { f, t };
      ampEnv(out, t, 0.004, 0.55);
    }

    if (id === "sync") {
      // the sweep crossfades three synced waves from a high ratio down to the resting one
      const rEnd = 1 + p.sync * 3, rStart = rEnd * (1 + p.sweep * 1.6), rMid = Math.sqrt(rStart * rEnd), sweepT = 0.05 + p.sweep * 0.5;
      const filt = nbVF("svf"); filt.type = "lowpass"; filt.frequency.value = expMap(p.bite, 500, 15000); filt.Q.value = 1.2; filt.connect(out);
      const gA = ctx.createGain(), gM = ctx.createGain(), gB = ctx.createGain();
      gA.gain.setValueAtTime(1, t); gA.gain.linearRampToValueAtTime(0, t + sweepT);
      gM.gain.setValueAtTime(0, t); gM.gain.linearRampToValueAtTime(1, t + sweepT / 2); gM.gain.linearRampToValueAtTime(0, t + sweepT);
      gB.gain.setValueAtTime(0, t); gB.gain.linearRampToValueAtTime(1, t + sweepT);
      [[rStart, gA], [rMid, gM], [rEnd, gB]].forEach(([r, g]) => {
        const o = ctx.createOscillator(); o.setPeriodicWave(syncWave(r)); o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = 0.3; o.connect(og).connect(g); g.connect(filt); o.start(t); oscs.push(o);
      });
      const sub = ctx.createOscillator(); sub.type = "sawtooth"; sub.frequency.value = f; sub.detune.value = -7;
      const sg = ctx.createGain(); sg.gain.value = 0.1; sub.connect(sg).connect(filt); sub.start(t); oscs.push(sub);
      ampEnv(out, t, attack, 0.5);
    }

    if (id === "hoover") {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9500; lp.Q.value = 0.5;
      const diveC = p.dive * 1100, diveT = 0.08 + p.dive * 0.4, spread = 8 + p.detune * 30;
      const bus = ctx.createGain();
      [[-1, 1, 0.16], [0, 1, 0.18], [1, 1, 0.16], [0, 0.5, 0.2], [0.5, 2, 0.06]].forEach(([k, mul, g]) => {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f * mul;
        o.detune.setValueAtTime(k * spread + diveC, t); o.detune.linearRampToValueAtTime(k * spread, t + diveT);
        const og = ctx.createGain(); og.gain.value = g; o.connect(og).connect(bus); o.start(t); oscs.push(o);
      });
      // pulse-width buzz: the stack minus a wobbling delayed copy of itself
      const dl = ctx.createDelay(0.05); dl.delayTime.value = Math.min(0.045, 0.35 / f);
      const inv = ctx.createGain(); inv.gain.value = -0.7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3 + p.width * 4;
      const dep = ctx.createGain(); dep.gain.value = Math.min(0.02, p.width * 0.3 / f);
      lfo.connect(dep).connect(dl.delayTime); lfo.start(t); oscs.push(lfo);
      bus.connect(lp); bus.connect(dl).connect(inv).connect(lp);
      const dry = ctx.createGain(); dry.gain.value = 0.7; lp.connect(dry).connect(out);
      const merger = ctx.createChannelMerger(2), cl = ctx.createOscillator(); cl.frequency.value = 0.8;
      [[0, 1], [1, -1]].forEach(([ch, sign]) => {
        const d = ctx.createDelay(0.05); d.delayTime.value = 0.006;
        const dp = ctx.createGain(); dp.gain.value = 0.0025 * sign; cl.connect(dp).connect(d.delayTime);
        const wet = ctx.createGain(); wet.gain.value = 0.6; lp.connect(d).connect(wet).connect(merger, 0, ch);
      });
      cl.start(t); oscs.push(cl); merger.connect(out);
      ampEnv(out, t, attack, 0.4);
    }

    if (id === "pluck") {
      const dec = expMap(p.decay, 0.06, 1.6);
      const filt = nbVF("svf"); filt.type = "lowpass"; filt.Q.value = 0.7 + p.body * 7;
      const top = expMap(p.bright, 900, 16000), floor = 120 + p.body * 500;
      filt.frequency.setValueAtTime(top, t); filt.frequency.setTargetAtTime(floor, t + 0.003, dec * 0.45);
      filt.connect(out);
      [["sawtooth", -6, 0.22], ["sawtooth", 6, 0.22], ["square", 1200, 0.05 + p.bright * 0.08], ["triangle", -1200, 0.12]].forEach(([type, det, g]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = g; o.connect(og).connect(filt); o.start(t); oscs.push(o);
      });
      const n = ctx.createBufferSource(); n.buffer = fx.noise;
      const nh = ctx.createBiquadFilter(); nh.type = "bandpass"; nh.frequency.value = 2500 + p.pick * 4000; nh.Q.value = 1.5;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(p.pick * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.015 + p.pick * 0.02);
      n.connect(nh).connect(ng).connect(out); n.start(t, Math.random() * 0.5); oscs.push(n);
      // percussive: it dies away even while the key is held
      const g = out.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(0.6, t + 0.003); g.setTargetAtTime(0.0001, t + 0.003, dec / 2.5);
      release = Math.min(release, dec);
    }
    nbDrift(oscs, t);

    return {
      midi,
      stop(at) {
        const now = ctx.currentTime, g = out.gain;
        if (at == null) { at = now; g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); }
        g.setTargetAtTime(0.0001, at, release / 4);
        const end = at + release * 1.6 + 0.1;
        oscs.forEach(o => { try { o.stop(end); } catch (e) {} });
        setTimeout(() => { out.disconnect(); lvl.disconnect(); }, (end - now) * 1000 + 200);
      },
    };
  }
  {
    const mv0 = makeVoice;
    makeVoice = function (midi, id, mix, when) { return NEW_ENGINES[id] ? newEngineVoice(midi, id, mix, when) : mv0(midi, id, mix, when); };
  }

  // ---------- Classic Synths: 30 sounds everyone knows ----------
  // [name, engine or stack, sliders per engine, { sub, oct, fx, arp, chord, levels }]
  const CLASSIC_PRESETS = [
    // bass
    ["Moog Sub Bass", "mono", { mono: { cutoff: 0.22, env: 0.3, res: 0.2, glide: 0.08, release: 0.3 } }, { sub: "fat Minimoog low end", oct: -1, fx: { drive: 0.1, wobble: 0.1, echo: 0, space: 0.1 } }],
    ["Acid 303", "mono", { mono: { cutoff: 0.3, env: 0.9, res: 0.85, glide: 0.4, release: 0.18 } }, { sub: "TB-303 squelch, glides between notes", oct: -1, fx: { drive: 0.35, wobble: 0.05, echo: 0.25, space: 0.15 } }],
    ["Reese Bass", ["saw", "mono"], { saw: { detune: 0.7, cutoff: 0.28, res: 0.1, attack: 0.02, release: 0.3 }, mono: { cutoff: 0.2, env: 0.1, res: 0.1, glide: 0, release: 0.4 } }, { sub: "detuned saws · jungle and drum & bass", oct: -1, levels: { saw: 0.8, mono: 0.6 }, fx: { drive: 0.25, wobble: 0.05, echo: 0, space: 0.1 } }],
    ["Sequencer Bass", "mono", { mono: { cutoff: 0.45, env: 0.6, res: 0.3, glide: 0, release: 0.12 } }, { sub: "hold a note: pulsing 16ths, Blue Monday style", oct: -1, arp: { mode: "up", rate: "1/16", oct: 1, gate: 0.5 }, fx: { drive: 0.1, wobble: 0, echo: 0.15, space: 0.1 } }],
    ["Jupiter Bass", "analog", { analog: { cutoff: 0.35, env: 0.45, res: 0.2, attack: 0, release: 0.15 } }, { sub: "Axel F style saw bass", oct: -1, fx: { drive: 0.1, wobble: 0, echo: 0.2, space: 0.15 } }],
    ["M1 Organ Bass", "zeb", { zeb: { bright: 0.65, oddeven: 0.95, evolve: 0, attack: 0, release: 0.08 } }, { sub: "house organ bass · Show Me Love", oct: -1, fx: { drive: 0.15, wobble: 0, echo: 0.05, space: 0.1 } }],
    ["Sub Boom", "mono", { mono: { cutoff: 0.05, env: 0, res: 0, glide: 0.05, release: 0.5 } }, { sub: "near-sine sub, 808 style", oct: -1, fx: { drive: 0, wobble: 0, echo: 0, space: 0 } }],
    // leads
    ["Minimoog Lead", "mono", { mono: { cutoff: 0.6, env: 0.35, res: 0.25, glide: 0.25, release: 0.3 } }, { sub: "Lucky Man · Cars", oct: 0, fx: { drive: 0.2, wobble: 0.05, echo: 0.3, space: 0.3 } }],
    ["Sync Lead", "sync", { sync: { sync: 0.55, sweep: 0.75, bite: 0.6, attack: 0.02, release: 0.3 } }, { sub: "Prophet-5 hard sync · Let's Go", oct: 0, fx: { drive: 0.15, wobble: 0, echo: 0.3, space: 0.3 } }],
    ["Hoover", "hoover", { hoover: { detune: 0.6, dive: 0.7, width: 0.65, attack: 0.02, release: 0.5 } }, { sub: "Alpha Juno · Dominator, rave", oct: 0, fx: { drive: 0.1, wobble: 0, echo: 0.2, space: 0.35 } }],
    ["Trance Supersaw", "saw", { saw: { detune: 0.8, cutoff: 0.85, res: 0.1, attack: 0.02, release: 0.4 } }, { sub: "JP-8000 · Out of the Blue", oct: 0, fx: { drive: 0.1, wobble: 0, echo: 0.45, space: 0.5 } }],
    ["CS-80 Lead", "tyrell", { tyrell: { swell: 0.25, bite: 0.7, vibrato: 0.7, attack: 0.08, release: 0.5 } }, { sub: "Blade Runner love theme", oct: 0, fx: { drive: 0.05, wobble: 0.1, echo: 0.4, space: 0.6 } }],
    ["Take On Me Lead", "juno", { juno: { pwm: 0.3, chorus: 0.4, cutoff: 0.8, attack: 0, release: 0.2 } }, { sub: "Juno-60 pulse lead", oct: 0, fx: { drive: 0.05, wobble: 0, echo: 0.35, space: 0.3 } }],
    ["8-bit Square", "juno", { juno: { pwm: 0, chorus: 0, cutoff: 1, attack: 0, release: 0.08 } }, { sub: "chiptune pulse wave", oct: 0, fx: { drive: 0, wobble: 0, echo: 0.2, space: 0.1 } }],
    ["Trance Pluck", "pluck", { pluck: { bright: 0.65, body: 0.4, pick: 0.6, decay: 0.35, release: 0.2 } }, { sub: "Nexus-style pluck · Sandstorm", oct: 0, fx: { drive: 0.05, wobble: 0, echo: 0.5, space: 0.45 } }],
    ["Popcorn", "mono", { mono: { cutoff: 0.7, env: 0.85, res: 0.5, glide: 0, release: 0.05 } }, { sub: "the Moog blip", oct: 0, fx: { drive: 0.05, wobble: 0, echo: 0.25, space: 0.15 } }],
    ["Glide Flute", "mono", { mono: { cutoff: 0.3, env: 0.05, res: 0.6, glide: 0.5, release: 0.35 } }, { sub: "Moog modular flute with portamento", oct: 0, fx: { drive: 0, wobble: 0.1, echo: 0.3, space: 0.4 } }],
    ["Sync Stab", "sync", { sync: { sync: 0.35, sweep: 0.4, bite: 0.85, attack: 0, release: 0.12 } }, { sub: "short synced stab", oct: 0, fx: { drive: 0.2, wobble: 0, echo: 0.25, space: 0.2 } }],
    ["C64 Arp", "juno", { juno: { pwm: 0, chorus: 0, cutoff: 1, attack: 0, release: 0.05 } }, { sub: "hold a chord: SID-style fast arpeggio", oct: 0, arp: { mode: "up", rate: "1/32", oct: 2, gate: 0.5 }, fx: { drive: 0, wobble: 0, echo: 0.15, space: 0.1 } }],
    // pads, brass, keys
    ["Juno Chorus Pad", "juno", { juno: { pwm: 0.7, chorus: 0.95, cutoff: 0.5, attack: 0.5, release: 0.75 } }, { sub: "Juno-106, the 80s pad", oct: 0, fx: { drive: 0, wobble: 0.05, echo: 0.15, space: 0.6 } }],
    ["Jump Brass", "analog", { analog: { cutoff: 0.55, env: 0.6, res: 0.12, attack: 0.01, release: 0.3 } }, { sub: "OB-Xa brass · Van Halen", oct: 0, fx: { drive: 0.05, wobble: 0, echo: 0.1, space: 0.3 } }],
    ["Chariots Brass", "tyrell", { tyrell: { swell: 0.7, bite: 0.4, vibrato: 0.35, attack: 0.5, release: 0.6 } }, { sub: "CS-80 swell · Vangelis", oct: 0, fx: { drive: 0, wobble: 0.05, echo: 0.3, space: 0.55 } }],
    ["Prophet Pad", ["analog", "juno"], { analog: { cutoff: 0.4, env: 0.2, res: 0.2, attack: 0.4, release: 0.6 }, juno: { pwm: 0.4, chorus: 0.7, cutoff: 0.45, attack: 0.4, release: 0.6 } }, { sub: "Prophet-5 poly pad", oct: 0, fx: { drive: 0, wobble: 0.05, echo: 0.2, space: 0.5 } }],
    ["Fantasia", ["bells", "vital", "choir"], { bells: { material: 0.8, ring: 0.6, hardness: 0.3, shimmer: 0.5, release: 0.7 }, vital: { morph: 0.2, motion: 0.4, tone: 0.6, attack: 0.5, release: 0.7 }, choir: { vowel: 0, breath: 0.3, vib: 0.2, attack: 0.6, release: 0.7 } }, { sub: "D-50 bells over a pad", oct: 0, levels: { bells: 0.8, vital: 0.6, choir: 0.45 }, fx: { drive: 0, wobble: 0.05, echo: 0.25, space: 0.6 } }],
    ["Tape Choir", "choir", { choir: { vowel: 0.3, breath: 0.45, vib: 0.2, attack: 0.3, release: 0.5 } }, { sub: "Mellotron choir on wobbling tape", oct: 0, fx: { drive: 0.05, wobble: 0.6, echo: 0.1, space: 0.45 } }],
    ["Oxygène Strings", "juno", { juno: { pwm: 0.3, chorus: 0.9, cutoff: 0.45, attack: 0.3, release: 0.6 } }, { sub: "Eminent strings through a phaser", oct: 0, fx: { drive: 0, wobble: 0.4, echo: 0.2, space: 0.45 } }],
    ["Synthwave Pad", ["saw", "juno"], { saw: { detune: 0.45, cutoff: 0.4, res: 0.1, attack: 0.3, release: 0.6 }, juno: { pwm: 0.5, chorus: 0.8, cutoff: 0.5, attack: 0.3, release: 0.6 } }, { sub: "Jupiter-8 ensemble", oct: 0, fx: { drive: 0, wobble: 0.05, echo: 0.3, space: 0.5 } }],
    ["80s Arp", "analog", { analog: { cutoff: 0.38, env: 0.5, res: 0.3, attack: 0, release: 0.25 } }, { sub: "hold a chord: Stranger Things arpeggio", oct: 0, arp: { mode: "up", rate: "1/16", oct: 2, gate: 0.55 }, fx: { drive: 0.05, wobble: 0, echo: 0.35, space: 0.35 } }],
    ["Drone Cathedral", "zeb", { zeb: { bright: 0.2, oddeven: 0.3, evolve: 0.7, attack: 0.7, release: 0.9 } }, { sub: "slow additive drone", oct: 0, fx: { drive: 0, wobble: 0.1, echo: 0.3, space: 0.85 } }],
    ["Big Room Chord", ["saw", "choir"], { saw: { detune: 0.6, cutoff: 0.8, res: 0.1, attack: 0.02, release: 0.3 }, choir: { vowel: 0.2, breath: 0.2, vib: 0.2, attack: 0.05, release: 0.3 } }, { sub: "one finger = a major chord stab", oct: 0, chord: "maj", levels: { saw: 0.8, choir: 0.4 }, fx: { drive: 0.05, wobble: 0, echo: 0.3, space: 0.4 } }],
  ];
  const NB_BASE = NB_PRESETS.length;
  CLASSIC_PRESETS.forEach(p => NB_PRESETS.push(p));
  LIB_CATS.splice(2, 0, ["classic", "Classic Synths"]);
  {
    const chip = document.createElement("button"); chip.className = "chip"; chip.dataset.cat = "classic"; chip.textContent = "Classic Synths";
    chip.addEventListener("click", () => { brCat = "classic"; brSearch.value = ""; renderBrowser(true); });
    const nb = brCats.querySelector('.chip[data-cat="nb"]'); if (nb) nb.after(chip); else brCats.appendChild(chip);
    const ae0 = allEntries;
    allEntries = function () {
      const list = ae0();
      for (const e of list) if (e.id.startsWith("n:")) { const i = Number(e.id.slice(2)); if (i >= NB_BASE) { e.cat = "classic"; e.sub = NB_PRESETS[i][3].sub; } }
      return list;
    };
    const ap0 = applyPreset;
    applyPreset = function (i) {
      ap0(i);
      const x = NB_PRESETS[i][3]; if (!x) return;
      const stack = Array.isArray(NB_PRESETS[i][1]) ? NB_PRESETS[i][1] : [NB_PRESETS[i][1]];
      if (x.levels) for (const id in x.levels) if (state.layers[id]) state.layers[id].level = x.levels[id];
      state.octave = x.oct ?? 0;
      if (x.fx) { if (typeof FXC !== "undefined" && FXC.mode === "sound") { for (const id of stack) Object.assign(fxcParams(id), x.fx); fxcSave(); } else Object.assign(state.fx, x.fx); if (ctx) applyFx(); }
      for (const id of Object.keys(ENGINES)) if (state.arp[id]) state.arp[id].on = false;   // a classic sound brings its own arp, or none
      if (x.arp) Object.assign(getArp(stack[0]), x.arp, { on: true });
      arpClock(); refreshFxKnobs();
      chordType = x.chord || "off"; chordSel.value = chordType; try { localStorage.setItem("nightbloom-chord", chordType); } catch (e) {}
      state.cur = { id: "n:" + i, cat: "classic" };
      renderEngine(); save();
    };
    // a brand-new engine chosen from a saved session shows its own sliders
    if (NEW_ENGINES[state.engine]) renderEngine();
  }
  // the effect sliders are built once, so redraw them when a sound sets its own effects
  function refreshFxKnobs() {
    fxKnobsEl.innerHTML = "";
    FX_KNOBS.forEach(([k, label]) => makeKnob(fxKnobsEl, k, label, () => state.fx, k === "amount" ? () => { if (ctx) { applyFx(); applyBfx(false); } } : applyFx));
    if (fxKnobsEl.lastChild) fxKnobsEl.lastChild.classList.add("amt");
  }

  // ---------- Your tabs: sounds from the library sit beside the engines ----------
  // + on any library sound, classic synth or saved sound puts it on the tab bar. Long-press a tab for
  // options: remove, hide an engine, move, reset, rename, or save the current settings as a new sound.
  // The bar is grouped and labelled: SOUNDS (yours) · ENGINES (the 13 synths) · MORE (drums, samples).
  const TABS_KEY = "nightbloom-tabs";
  const tabCfg = { sounds: [], hidden: [] };
  try { const c = JSON.parse(localStorage.getItem(TABS_KEY) || "{}"); if (Array.isArray(c.sounds)) tabCfg.sounds = c.sounds.filter(x => typeof x === "string"); if (Array.isArray(c.hidden)) tabCfg.hidden = c.hidden.filter(x => ENGINES[x]); } catch (e) {}
  const saveTabs = () => { try { localStorage.setItem(TABS_KEY, JSON.stringify(tabCfg)); } catch (e) {} };
  // saved sounds get stable ids, so a tab can point at one
  if (mySounds.some(s => !s.id)) { mySounds.forEach((s, i) => { if (!s.id) s.id = "s" + Date.now().toString(36) + i; }); saveMs(); }
  const myById = id => mySounds.find(s => "my:" + s.id === id);
  const tabbable = id => /^(n:|w:|m:|my:|sp:)/.test(id);
  const engList = ids => ids.map(k => (ENGINES[k] || { short: k }).short).join(" + ") || "synth";
  function tabInfo(id) {
    if (id.startsWith("my:")) { const s = myById(id); return s ? { name: s.name, sub: ENGINES[s.engine] ? engList(Object.keys(s.layers || {}).filter(k => s.layers[k] && s.layers[k].on)) : s.engine === "lib" ? "library" : s.engine } : null; }
    const e = entryById(id); if (!e) return null;
    if (id.startsWith("n:")) { const p = NB_PRESETS[Number(id.slice(2))]; return { name: e.name, sub: engList(Array.isArray(p[1]) ? p[1] : [p[1]]) }; }
    if (id.startsWith("w:")) return { name: e.name, sub: id.startsWith("w:nb-") ? "studio" : "library" };
    if (id.startsWith("sp:")) return { name: e.name, sub: "studio" };
    if (id.startsWith("m:")) return { name: e.name, sub: "instrument", adv: true };
    return null;
  }
  const tabToast = (() => { let tt = 0; return msg => { const el = document.getElementById("uiToast"); el.textContent = msg; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2600); }; })();
  function renderTabs() {
    tabsEl.querySelectorAll(".tabwrap.sound, .tabs-lab").forEach(el => el.remove());
    const label = (text, cls) => { const l = document.createElement("div"); l.className = "tabs-lab " + (cls || ""); l.textContent = text; return l; };
    tabCfg.sounds = tabCfg.sounds.filter(id => tabInfo(id));
    let anchor = tabsEl.querySelector('.tab[data-engine="lib"]').parentElement;
    if (tabCfg.sounds.length) { const l = label("Sounds", "snd"); anchor.after(l); anchor = l; }
    for (const id of tabCfg.sounds) {
      const info = tabInfo(id);
      const wrap = document.createElement("div"); wrap.className = "tabwrap sound" + (info.adv ? " adv" : ""); wrap.dataset.sound = id;
      const b = document.createElement("button"); b.className = "tab"; b.dataset.sound = id; b.innerHTML = "<span></span><small></small>";
      b.firstChild.textContent = info.name; b.lastChild.textContent = info.sub; b.title = info.name + " · long-press for options";
      b.addEventListener("click", () => useSoundTab(id));
      wrap.append(b); anchor.after(wrap); anchor = wrap;
    }
    const firstEngine = tabsEl.querySelector('.tab[data-engine="saw"]').parentElement; firstEngine.before(label("Engines", "eng"));
    for (const id in ENGINES) { const t = tabsEl.querySelector(`.tab[data-engine="${id}"]`); if (t) { t.parentElement.classList.add("eng"); t.parentElement.classList.toggle("hiddentab", tabCfg.hidden.includes(id)); } }
    tabsEl.querySelector('.tab[data-engine="drum"]').parentElement.before(label("More"));
    paintTabs();
  }
  function paintTabs() {
    const sid = state.cur && tabCfg.sounds.includes(state.cur.id) ? state.cur.id : null;
    tabsEl.querySelectorAll(".tab[data-sound]").forEach(t => t.setAttribute("aria-pressed", String(t.dataset.sound === sid)));
    if (sid) tabsEl.querySelectorAll(".tab[data-engine]").forEach(t => t.setAttribute("aria-pressed", "false"));
    // each engine tab says whether the current sound is using it
    const synth = !!ENGINES[state.engine];
    for (const id in ENGINES) {
      const t = tabsEl.querySelector(`.tab[data-engine="${id}"]`); if (!t) continue;
      const on = synth && state.layers[id] && state.layers[id].on;
      t.classList.toggle("playing", !!on);
      const sm = t.querySelector("small"); if (sm) sm.textContent = on ? "● playing" : (TAB_SUB[id] || "");
    }
  }
  async function useSoundTab(id) {
    start();
    if (id.startsWith("my:")) { const s = myById(id); if (!s) return; applySound(s); state.cur = { id, cat: "my" }; save(); paintTabs(); updateSoundBar(); return; }
    const e = entryById(id); if (!e) return;
    await chooseEntry(e, true);
    state.cur = { id: e.id, cat: e.cat }; save(); paintTabs();
  }
  function toggleSoundTab(id) {
    const i = tabCfg.sounds.indexOf(id);
    if (i >= 0) tabCfg.sounds.splice(i, 1); else tabCfg.sounds.push(id);
    saveTabs(); renderTabs();
    if (i < 0) {
      let seen = false; try { seen = localStorage.getItem("nightbloom-tabhint") === "1"; localStorage.setItem("nightbloom-tabhint", "1"); } catch (e) {}
      tabToast(seen ? "Added to your tabs" : "Added to your tabs · long-press a tab for options");
    }
  }
  {
    const re0 = renderEngine;
    renderEngine = function () { re0(); paintTabs(); };
    const cl0 = currentLabel;
    currentLabel = function () {
      if (ENGINES[state.engine] && state.cur && (state.cur.id.startsWith("my:") || state.cur.id.startsWith("n:"))) {
        const info = tabInfo(state.cur.id); if (info) return [info.name, info.sub + (state.cur.id.startsWith("my:") ? " · my sound" : "") + " · tap to browse"];
      }
      return cl0();
    };
    // tapping an engine (or the stack dot) means you've left the saved sound
    tabsEl.addEventListener("click", e => {
      if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); return; }
      const t = e.target.closest(".tab, .pwr"); if (!t || !t.dataset.engine) return;
      if (state.cur && tabCfg.sounds.includes(state.cur.id) && !state.cur.id.startsWith("w:")) state.cur = null;
    }, true);
  }
  // my sounds carry effects and the octave too
  {
    const cs0 = captureSound, as0 = applySound;
    captureSound = function (name) { const s = cs0(name); const { on, amount, ...rest } = (typeof FXC !== "undefined" && FXC.mode === "sound") ? fxcParams(state.engine) : state.fx; s.fx = rest; s.octave = state.octave; return s; };
    applySound = function (s) {
      as0(s);
      if (s.fx) { if (typeof FXC !== "undefined" && FXC.mode === "sound") { const ids = Object.keys(s.layers || {}).filter(id => s.layers[id] && s.layers[id].on); for (const id of (ids.length ? ids : [s.engine])) if (id) Object.assign(fxcParams(id), s.fx); fxcSave(); } else Object.assign(state.fx, s.fx); if (ctx) { applyFx(); applyBfx(false); } refreshFxKnobs(); }
      if (typeof s.octave === "number") state.octave = s.octave;
      renderEngine();
    };
    const rm0 = renderMySounds;
    renderMySounds = function () {
      rm0();
      msList.querySelectorAll(".pr-row").forEach((row, i) => {
        const s = mySounds[i]; if (!s) return; const id = "my:" + s.id, on = tabCfg.sounds.includes(id);
        const b = document.createElement("button"); b.className = "btn"; b.textContent = on ? "✓ Tab" : "+ Tab"; b.setAttribute("aria-pressed", String(on));
        b.addEventListener("click", () => { toggleSoundTab(id); renderMySounds(); });
        row.insertBefore(b, row.querySelector(".pd"));
      });
    };
    const rb0 = renderBrowser;
    renderBrowser = function (scrollToSel) {
      rb0(scrollToSel);
      brList.querySelectorAll(".br-row[data-id]").forEach(row => {
        const id = row.dataset.id, eng = id.startsWith("e:") && ENGINES[id.slice(2)] ? id.slice(2) : null;
        if (!tabbable(id) && !eng) return;
        const on = eng ? !tabCfg.hidden.includes(eng) : tabCfg.sounds.includes(id);
        const b = document.createElement("button"); b.className = "br-add" + (on ? " on" : ""); b.textContent = on ? "✓" : "+";
        b.title = eng ? (on ? "On the tab bar · tap to hide" : "Hidden · tap to show its tab") : (on ? "On your tabs · tap to remove" : "Add to your tabs");
        b.setAttribute("aria-label", b.title);
        b.addEventListener("click", () => {
          if (eng) { const i = tabCfg.hidden.indexOf(eng); if (i >= 0) tabCfg.hidden.splice(i, 1); else tabCfg.hidden.push(eng); saveTabs(); renderTabs(); }
          else toggleSoundTab(id);
          renderBrowser(false);
        });
        const star = row.querySelector(".br-star"); if (star) star.before(b); else row.append(b);
      });
    };
  }
  // ---------- long-press menu ----------
  const tabMenu = document.getElementById("tabMenu"), tmList = document.getElementById("tmList"), tmTitle = document.getElementById("tmTitle");
  const nameSheet = document.getElementById("nameSheet"), nsInput = document.getElementById("nsInput"), nsTitle = document.getElementById("nsTitle");
  let nsCb = null;
  function askName(title, value, cb) { nsTitle.textContent = title; nsInput.value = value; nsCb = cb; nameSheet.hidden = false; setTimeout(() => { try { nsInput.focus(); nsInput.select(); } catch (e) {} }, 50); }
  document.getElementById("nsOk").addEventListener("click", () => { const v = nsInput.value.trim(); nameSheet.hidden = true; if (v && nsCb) nsCb(v); nsCb = null; });
  document.getElementById("nsCancel").addEventListener("click", () => { nameSheet.hidden = true; nsCb = null; });
  nsInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("nsOk").click(); } });
  function saveCurrentAsSound() {
    if (["drum", "pads"].includes(state.engine)) { tabToast("Pick a synth or library sound first"); return; }
    const cur = state.cur && tabInfo(state.cur.id), base = cur ? cur.name : ENGINES[state.engine] ? ENGINES[state.engine].name : "Sound";
    askName("Name this sound", base + (cur ? " (mine)" : ""), name => {
      const s = captureSound(name); s.id = "s" + Date.now().toString(36); mySounds.unshift(s); saveMs();
      const id = "my:" + s.id; tabCfg.sounds.push(id); saveTabs(); state.cur = { id, cat: "my" }; save(); renderTabs(); updateSoundBar();
      if (!msEl.hidden) renderMySounds();
      tabToast("Saved \"" + name + "\" and put it on your tabs");
    });
  }
  function openTabMenu(t) {
    const sid = t.dataset.sound, eid = t.dataset.engine;
    const info = sid ? tabInfo(sid) : null;
    tmTitle.textContent = sid ? (info ? info.name : "Sound") : ENGINES[eid] ? ENGINES[eid].name : eid === "lib" ? "Library" : eid === "drum" ? "Drum machines" : eid === "samp" ? "Sampler" : eid === "pads" ? "Pads" : "Instrument";
    tmList.innerHTML = "";
    const add = (label, sub, fn) => {
      const b = document.createElement("button"); b.className = "btn tm"; b.innerHTML = "<b></b><small></small>";
      b.firstChild.textContent = label; b.lastChild.textContent = sub || ""; b.lastChild.hidden = !sub;
      b.addEventListener("click", () => { tabMenu.hidden = true; fn(); }); tmList.appendChild(b);
    };
    const swap = (a, b) => { const s = tabCfg.sounds; [s[a], s[b]] = [s[b], s[a]]; saveTabs(); renderTabs(); };
    if (sid) {
      const i = tabCfg.sounds.indexOf(sid);
      add("Remove from the bar", "the sound stays in the library and in your saved sounds", () => { tabCfg.sounds.splice(i, 1); saveTabs(); renderTabs(); tabToast("Removed · add it again with + in Lib"); });
      if (i > 0) add("Move left", "", () => swap(i, i - 1));
      if (i < tabCfg.sounds.length - 1) add("Move right", "", () => swap(i, i + 1));
      if (sid.startsWith("my:")) add("Rename", "", () => { const s = myById(sid); if (!s) return; askName("Rename sound", s.name, v => { s.name = v; saveMs(); renderTabs(); updateSoundBar(); if (!msEl.hidden) renderMySounds(); }); });
      add("Save the current settings as a new sound", "keeps your slider, effect, octave and arp changes", saveCurrentAsSound);
    } else if (ENGINES[eid]) {
      add("Hide this tab", "clears space · find it under Lib › Engines, or restore from any tab's menu", () => {
        if (!tabCfg.hidden.includes(eid)) tabCfg.hidden.push(eid); saveTabs();
        if (state.engine === eid) { const vis = k => !tabCfg.hidden.includes(k) && (k !== "fm" || betaOn); const next = activeLayers().find(vis) || Object.keys(ENGINES).find(vis); if (next) { state.engine = next; state.melodic = next; } }
        renderTabs(); renderEngine(); save();
      });
      add("Save the current settings as a new sound", "keeps your slider, effect, octave and arp changes", saveCurrentAsSound);
      add("Reset sliders", "back to " + ENGINES[eid].name + "'s defaults", () => { Object.assign(state.params[eid], Object.fromEntries(ENGINES[eid].knobs.map(([k, , v]) => [k, v]))); renderEngine(); save(); });
    } else if (["lib", "inst"].includes(eid)) {
      add("Save the current settings as a new sound", "", saveCurrentAsSound);
    }
    if (tabCfg.hidden.length) add("Restore hidden tabs", tabCfg.hidden.map(k => ENGINES[k].short).join(", "), () => { tabCfg.hidden = []; saveTabs(); renderTabs(); });
    if (!tmList.children.length) add("Nothing to change here", "long-press a synth or sound tab for options", () => {});
    tabMenu.hidden = false;
  }
  document.getElementById("tmCancel").addEventListener("click", () => { tabMenu.hidden = true; });
  let lpTimer = 0, lpStart = null, suppressClick = false;
  const lpCancel = () => { clearTimeout(lpTimer); lpTimer = 0; };
  tabsEl.addEventListener("pointerdown", e => {
    const t = e.target.closest(".tab"); if (!t || (e.button != null && e.button > 0)) return;
    lpStart = { x: e.clientX, y: e.clientY }; lpCancel();
    lpTimer = setTimeout(() => { lpTimer = 0; suppressClick = true; setTimeout(() => { suppressClick = false; }, 700); openTabMenu(t); }, 550);
  });
  tabsEl.addEventListener("pointermove", e => { if (lpTimer && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 8) lpCancel(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => tabsEl.addEventListener(ev, lpCancel));
  tabsEl.addEventListener("contextmenu", e => { const t = e.target.closest(".tab"); if (t) { e.preventDefault(); lpCancel(); openTabMenu(t); } });
  renderTabs();

  // ---------- Stacking engines, made obvious ----------
  // The corner badge on every engine tab is now a clear + (tap to play this engine together with the
  // current sound) that turns into an amber ✓ when the engine is in the stack. The long-press menu
  // says it in words, and the sound bar names the stacked engines.
  const stackCount = () => Object.values(state.layers).filter(x => x.on).length;
  function stackSet(id, on) {
    if (!ENGINES[id]) return;
    if (on) { state.layers[id].on = true; state.engine = id; state.melodic = id; }
    else { if (!state.layers[id].on || stackCount() === 1) return; state.layers[id].on = false; if (state.engine === id) { state.engine = activeLayers()[0]; state.melodic = state.engine; } }
    if (state.cur && (state.cur.id.startsWith("n:") || state.cur.id.startsWith("my:"))) state.cur = null;
    renderEngine(); save();
  }
  function stackAlone(id) {
    for (const k in state.layers) state.layers[k].on = k === id;
    state.engine = id; state.melodic = id; if (state.cur && !state.cur.id.startsWith("w:")) state.cur = null;
    renderEngine(); save();
  }
  {
    // the long-press menu gets the stacking choices first
    const otm0 = openTabMenu;
    openTabMenu = function (t) {
      otm0(t);
      const eid = t.dataset.engine; if (!ENGINES[eid]) return;
      const on = state.layers[eid].on, n = stackCount(), others = activeLayers().filter(k => k !== eid);
      const mk = (label, sub, fn) => { const b = document.createElement("button"); b.className = "btn tm stack"; b.innerHTML = "<b></b><small></small>"; b.firstChild.textContent = label; b.lastChild.textContent = sub; b.addEventListener("click", () => { tabMenu.hidden = true; fn(); }); return b; };
      const items = [];
      if (!on) items.push(mk("Play together with " + engList(others), "adds " + ENGINES[eid].short + " to the stack · the + on the tab does this too", () => stackSet(eid, true)));
      else if (n > 1) { items.push(mk("Take " + ENGINES[eid].short + " out of the stack", "leaves " + engList(others) + " playing", () => stackSet(eid, false))); items.push(mk("Play " + ENGINES[eid].short + " alone", "unstacks the others", () => stackAlone(eid))); }
      else items.push(mk("Play together with another engine", "tap the + badge on any other engine tab", () => { tabToast("Tap the + on another engine's tab to stack it with " + ENGINES[eid].short); }));
      items.reverse().forEach(b => tmList.prepend(b));
    };
    // Tap = switch to that engine (the sliders and the sound). + = stack. A tap on an engine that is
    // already in the stack just shows its sliders. (Before, a tap only changed the sliders when
    // another engine was on, so Saw kept playing while Juno's sliders showed.)
    let hinted = false; try { hinted = localStorage.getItem("nightbloom-stackhint") === "1"; } catch (e) {}
    tabsEl.addEventListener("click", e => {
      if (e.defaultPrevented) return;                       // a long-press release, already swallowed
      const t = e.target.closest(".tab"); if (!t) return;
      const id = t.dataset.engine; if (!ENGINES[id]) return;
      e.stopPropagation();
      const wasStack = stackCount() > 1, inStack = state.layers[id].on;
      state.engine = id; state.melodic = id;
      if (!inStack) {
        for (const k in state.layers) state.layers[k].on = k === id;
        if (!hinted) {
          hinted = true; try { localStorage.setItem("nightbloom-stackhint", "1"); } catch (er) {}
          setTimeout(() => tabToast((wasStack ? "Switched to " + ENGINES[id].short + " alone. " : "") + "To play sounds together, tap the + on a Quick sound."), 50);
        }
      }
      if (state.cur && !state.cur.id.startsWith("w:")) state.cur = null;
      if (state.panel === "fx") setPanel("sound");
      renderEngine(); save();
    }, true);
    const cl0 = currentLabel;
    currentLabel = function () {
      const r = cl0();
      if (ENGINES[state.engine] && !(state.cur && (state.cur.id.startsWith("n:") || state.cur.id.startsWith("my:")))) {
        const on = activeLayers(); if (on.length > 1) r[1] = engList(on) + " stacked · tap to browse";
      }
      return r;
    };
    updateSoundBar();
  }

  // what the editor's buttons do, for anyone hovering or using a reader
  Object.entries({ edPlay: "Play the selection (or everything)", edAll: "Select the whole sample", edTrim: "Keep only the selection", edCut: "Remove the selection", edRev: "Play the selection backwards",
    edNorm: "As loud as it can be without clipping", edFadeIn: "Fade the selection in", edFadeOut: "Fade the selection out", edDown: "Quieter", edUp: "Louder",
    edUndo: "Undo the last change", edRevert: "Back to the original", edChop: "Cut into pieces, one per pad", edToPad: "Send the selection to the selected pad", edCancel: "Close without saving", edSave: "Put this back in the slot" })
    .forEach(([id, t]) => { const el = document.getElementById(id); if (el) el.title = t; });

  // sample-rate conversion with the browser's own (windowed-sinc) decoder resampler; linear interpolation only as a last resort
  function aiWav(chans, rate, asFloat) {
    const n = chans[0].length, ch = chans.length, bps = asFloat ? 4 : 2, dataLen = n * ch * bps, head = asFloat ? 58 : 44;
    const b = new ArrayBuffer(head + dataLen), v = new DataView(b), str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, head + dataLen - 8, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, asFloat ? 18 : 16, true);
    v.setUint16(20, asFloat ? 3 : 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bps * 8, true);
    let o = 36;
    if (asFloat) { v.setUint16(36, 0, true); str(38, "fact"); v.setUint32(42, 4, true); v.setUint32(46, n, true); o = 50; }
    str(o, "data"); v.setUint32(o + 4, dataLen, true); o += 8;
    if (asFloat) { const f = new Float32Array(b, o); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) f[i * ch + c] = chans[c][i]; }
    else { const f = new Int16Array(b, o); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, chans[c][i])); f[i * ch + c] = x < 0 ? x * 32768 : x * 32767; } }
    return b;
  }
  async function aiResample(chans, from, to) {
    if (from === to) return chans;
    const n = Math.round(chans[0].length * to / from), OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    for (const asFloat of [true, false]) {
      try {
        const oc = new OC(chans.length, n, to);
        const buf = await new Promise((res, rej) => { const p = oc.decodeAudioData(aiWav(chans, from, asFloat), res, rej); if (p && p.catch) p.catch(rej); });
        return chans.map((c, i) => buf.getChannelData(i));
      } catch (e) {}
    }
    return chans.map(a => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * from / to, j = Math.floor(p), f = p - j; o[i] = a[j] * (1 - f) + (a[Math.min(j + 1, a.length - 1)] || 0) * f; } return o; });
  }
