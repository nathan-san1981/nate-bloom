  // ---------- Samples ----------
  function makeExampleChime() {
    const rate = ctx.sampleRate, len = Math.floor(rate * 3);
    const buf = ctx.createBuffer(2, len, rate);
    const partials = [[523.25, 1, 1.6], [1444, 0.45, 0.9], [2826, 0.25, 0.5], [784, 0.35, 2.2], [1046.5, 0.2, 1.2]];
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        let v = 0;
        for (const [f, a, dec] of partials) v += a * Math.sin(2 * Math.PI * f * (1 + c * 0.0015) * t) * Math.exp(-t / dec);
        v += (Math.random() * 2 - 1) * 0.08 * Math.exp(-t / 0.01);
        d[i] = v * 0.35 * Math.min(1, t / 0.002);
      }
    }
    return buf;
  }
  function computePeaks(buf, bins = 240) {
    const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / bins)), out = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      let m = 0;
      for (let i = b * step, e = Math.min(d.length, i + step); i < e; i += 4) { const a = Math.abs(d[i]); if (a > m) m = a; }
      out[b] = m;
    }
    const mx = Math.max(0.01, ...out);
    return out.map(v => v / mx);
  }
  function trimBuffer(buf) {
    if (buf.duration <= MAX_SAMPLE_SEC) return buf;
    const len = Math.floor(MAX_SAMPLE_SEC * buf.sampleRate);
    const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(0, len), c);
    return out;
  }
  function setSample(i, buf, name) {
    sampBuf[i] = buf; sampPeaks[i] = buf ? computePeaks(buf) : null;
    state.samp.slots[i].name = name || "";
    if (typeof refreshSamplesUI === "function") refreshSamplesUI();
  }
  function decode(arrayBuffer) {
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(arrayBuffer, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }

  // Imported files are kept in this browser's IndexedDB so they survive a reload
  function idb() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open("nightbloom", 4);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("samples")) db.createObjectStore("samples");
          if (!db.objectStoreNames.contains("instruments")) db.createObjectStore("instruments");
          if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks");
          if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  async function storeSample(i, name, data) {
    try {
      const db = await idb();
      db.transaction("samples", "readwrite").objectStore("samples").put({ name, data }, i);
    } catch (e) {}
  }
  async function loadStoredSamples() {
    try {
      const db = await idb();
      for (let i = 0; i < NSLOTS; i++) {
        const rec = await new Promise(res => {
          const r = db.transaction("samples").objectStore("samples").get(i);
          r.onsuccess = () => res(r.result); r.onerror = () => res(null);
        });
        if (rec && rec.data) {
          try { setSample(i, trimBuffer(await decode(rec.data.slice(0))), rec.name, { keepFit: true }); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // One voice of the sampler: plain playback, or a cloud of short grains (or the Elephant, 770, which plays the sample under its shape)
  const recentGrains = [];
  let eleVoiceHook = null;
  function makeSampleVoice(midi, i, when, scale = 1) {
    const buf = sampBuf[i]; if (!buf || !ctx) return null;
    const slot = state.samp.slots[i], P = slot.p, mode = slot.mode;
    if (mode === "elephant" && eleVoiceHook) return eleVoiceHook(midi, i, when, scale);
    const t = when ?? ctx.currentTime, rate = Math.pow(2, (midi - 60) / 12), dur = buf.duration;
    const out = ctx.createGain(); out.gain.value = 0.0001;
    const lvl = ctx.createGain(); lvl.gain.value = P.level * 1.4 * scale;
    out.connect(lvl).connect(fx.input);

    if (mode === "play" || mode === "slice") {
      const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = expMap(P.tone, 250, 20000);
      tone.connect(out);
      const src = ctx.createBufferSource(); src.buffer = buf;
      let off, playLen;
      if (mode === "slice") {
        // each key plays the next slice, from C3 up, at its original pitch
        const sl = getSlices(i), n = sl.length - 1, k = (((midi - 48) % n) + n) % n;
        off = sl[k]; playLen = Math.max(0.01, sl[k + 1] - sl[k]);
        src.playbackRate.value = 1;
        recentGrains.push({ slot: i, x: off / dur, t });
      } else {
        src.playbackRate.value = rate;
        off = P.start * dur * 0.98; playLen = Math.max(0.02, P.length * (dur - off));
      }
      src.connect(tone);
      if (mode === "play" && slot.loop) { src.loop = true; src.loopStart = off; src.loopEnd = off + playLen; src.start(t, off); } else src.start(t, off, playLen);
      out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + 0.004);
      const fade = expMap(P.fade, 0.02, 3);
      return {
        stop(at) {
          const now = ctx.currentTime;
          if (at == null) { at = now; out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now); }
          out.gain.setTargetAtTime(0.0001, at, fade / 4);
          const end = at + fade * 1.6 + 0.05;
          try { src.stop(end); } catch (e) {}
          setTimeout(() => { out.disconnect(); lvl.disconnect(); }, (end - now) * 1000 + 300);
        },
      };
    }

    // granular
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + 0.06);
    let nextGrain = t, endAt = Infinity, scanOff = 0;
    const hasPanner = typeof ctx.createStereoPanner === "function";
    function grain(gt) {
      const size = expMap(P.size, 0.02, 0.5), dens = expMap(P.density, 4, 60);
      const overlap = Math.max(1, size * dens);
      const center = (P.pos * dur + scanOff) % dur;
      let off = center + (Math.random() - 0.5) * P.spray * dur * 0.4;
      const span = size * rate;
      off = Math.min(Math.max(0, off), Math.max(0, dur - span - 0.001));
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      if (more2Ready) pitchConnect(src);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, gt);
      g.gain.linearRampToValueAtTime(0.75 / Math.sqrt(overlap), gt + size * 0.5);
      g.gain.linearRampToValueAtTime(0, gt + size);
      if (hasPanner) {
        const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * (0.3 + P.spray);
        src.connect(g).connect(pan).connect(out);
      } else src.connect(g).connect(out);
      src.start(gt, off, span); src.stop(gt + size + 0.02);
      recentGrains.push({ slot: i, x: off / dur, t: gt });
      if (recentGrains.length > 120) recentGrains.splice(0, 40);
      return 1 / dens;
    }
    let lastScan = t;
    const timer = setInterval(() => {
      const horizon = Math.min(ctx.currentTime + 0.1, endAt);
      if (nextGrain < ctx.currentTime - 0.05) { nextGrain = lastScan = ctx.currentTime + 0.01; }   // timers were paused: don't fire the missed grains in a burst
      while (nextGrain < horizon) {
        // scan sweeps the read position forward through the file, wrapping at the end
        const speed = P.scan * P.scan * 1.5;
        scanOff = (scanOff + (nextGrain - lastScan) * speed) % dur;
        lastScan = nextGrain;
        nextGrain += grain(nextGrain) * (0.7 + Math.random() * 0.6);
      }
    }, 20);
    return {
      stop(at) {
        const now = ctx.currentTime;
        if (at == null) { at = now; out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now); }
        const rel = 0.5;
        out.gain.setTargetAtTime(0.0001, at, rel / 4);
        endAt = at + rel;
        setTimeout(() => { clearInterval(timer); setTimeout(() => { out.disconnect(); lvl.disconnect(); }, 800); }, (endAt - now) * 1000 + 50);
      },
    };
  }

  function applyDrum() {
    if (!fx) return;
    fx.drumBus.gain.setTargetAtTime(state.drum.level * 1.1, ctx.currentTime, 0.02);
  }

  // ---------- 808 ----------
  let openHat = null;
  function playDrum(id, t) {
    if (!ctx) return;
    const p = state.drum, nodes = [];
    // each 808 sound has its own pitch (±12 semitones), length (¼× to 4×) and volume
    const D = (state.drumPads && state.drumPads[id]) || { pitch: 0.5, length: 0.5, vol: 0.8 };
    const pf = Math.pow(2, Math.round((D.pitch - 0.5) * 24) / 12), lf = Math.pow(2, (D.length - 0.5) * 4);
    const bus = ctx.createGain(); bus.gain.value = D.vol * 1.25; bus.connect(fx.drumBus);
    const g = (peak, decay, at = t) => {
      const n = ctx.createGain();
      n.gain.setValueAtTime(peak, at); n.gain.exponentialRampToValueAtTime(0.0008, at + decay * lf);
      return n;
    };
    const osc = (type, freq) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * pf; nodes.push(o); return o; };
    const noiseSrc = () => { const n = ctx.createBufferSource(); n.buffer = fx.noise; n.loop = true; nodes.push(n); return n; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f * pf; b.Q.value = q; return b; };
    let len = 0.5;

    if (id === "kick") {
      const base = 40 + p.tune * 25, decay = expMap(p.boom, 0.15, 1.6);
      const o = osc("sine", base * 3.2);
      o.frequency.setValueAtTime(base * 3.2 * pf, t);
      o.frequency.exponentialRampToValueAtTime(base * pf, t + 0.07);
      o.connect(g(1.0, decay)).connect(bus);
      const click = osc("square", 1200); click.connect(g(0.08, 0.008)).connect(bus);
      len = decay * lf;
    }
    if (id === "snare") {
      const tn = 0.9 + p.tune * 0.25;
      osc("triangle", 185 * tn).connect(g(0.45, 0.12)).connect(bus);
      osc("triangle", 330 * tn).connect(g(0.3, 0.08)).connect(bus);
      noiseSrc().connect(filt("highpass", 1800)).connect(g(0.25 + p.snap * 0.6, 0.12 + p.snap * 0.14)).connect(bus);
      len = 0.3 * lf;
    }
    if (id === "clap") {
      const n = noiseSrc(), bp = filt("bandpass", 1100, 1.4), env = ctx.createGain();
      env.gain.setValueAtTime(0.0008, t);
      [0, 0.011, 0.022].forEach(o => {
        env.gain.setValueAtTime(0.9, t + o); env.gain.exponentialRampToValueAtTime(0.12, t + o + 0.009);
      });
      env.gain.setValueAtTime(0.75, t + 0.031);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.031 + (0.18 + p.snap * 0.15) * lf);
      n.connect(bp).connect(env).connect(bus);
      len = 0.45 * lf;
    }
    if (id === "ch" || id === "oh") {
      const decay = (id === "ch" ? 0.035 + p.hat * 0.07 : 0.16 + p.hat * 0.8) * lf;
      const env = g(id === "ch" ? 0.55 : 0.45, decay / lf);
      const bp = filt("bandpass", 10000, 0.8), hp = filt("highpass", 7000);
      [205.3, 304.4, 369.6, 522.7, 540, 800].forEach(f => {
        const gg = ctx.createGain(); gg.gain.value = 0.16;
        osc("square", f * (1.6 + p.tune * 0.4)).connect(gg).connect(bp);
      });
      bp.connect(hp).connect(env).connect(bus);
      if (id === "ch" && openHat && openHat.end > t) {
        openHat.env.gain.cancelScheduledValues(t);
        openHat.env.gain.setTargetAtTime(0.0008, t, 0.008);
      }
      if (id === "oh") openHat = { env, end: t + decay };
      len = decay;
    }
    if (id === "tom") {
      const f = 90 * (0.85 + p.tune * 0.4), o = osc("sine", f);
      o.frequency.setValueAtTime(f * 1.15 * pf, t); o.frequency.exponentialRampToValueAtTime(f * 0.85 * pf, t + 0.25);
      o.connect(g(0.8, 0.25 + p.boom * 0.4)).connect(bus);
      len = 0.7 * lf;
    }
    if (id === "rim") {
      osc("triangle", 1700).connect(filt("bandpass", 1700, 3)).connect(g(0.9, 0.025)).connect(bus);
      osc("square", 480).connect(filt("highpass", 300)).connect(g(0.12, 0.012)).connect(bus);
      len = 0.06 * lf;
    }
    if (id === "cow") {
      const bp = filt("bandpass", 800, 2.2), env = ctx.createGain();
      env.gain.setValueAtTime(0.5, t);
      env.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.32 * lf);
      const tn = 0.92 + p.tune * 0.16;
      osc("square", 540 * tn).connect(bp); osc("square", 800 * tn).connect(bp);
      bp.connect(env).connect(bus);
      len = 0.35 * lf;
    }
    nodes.forEach(n => { n.start(t); n.stop(t + len + 0.05); });
    setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, (t - ctx.currentTime + len + 0.4) * 1000);
    flashPad(id, t);
  }

  // ---------- Voices ----------
  const expMap = (v, lo, hi) => lo * Math.pow(hi / lo, v);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function ampEnv(gainNode, t, attack, peak) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
  }

  let wavesCache = null;
  function getWaves() {
    if (wavesCache) return wavesCache;
    const N = 48, make = fn => {
      const real = new Float32Array(N), imag = new Float32Array(N);
      for (let n = 1; n < N; n++) imag[n] = fn(n);
      return ctx.createPeriodicWave(real, imag);
    };
    wavesCache = [
      make(n => n === 1 ? 1 : n === 2 ? 0.3 : n === 4 ? 0.15 : n === 8 ? 0.06 : 0),          // glass
      make(n => Math.pow(n, -1.7)),                                                           // warm
      make(n => n % 2 ? 1 / n : 0),                                                           // hollow
      make(n => Math.exp(-Math.pow(n - 3, 2) / 2) + 0.7 * Math.exp(-Math.pow(n - 7, 2) / 3) + 0.3 / n), // vocal
      make(n => Math.pow(n, -0.85)),                                                          // bright
    ];
    return wavesCache;
  }

  function activeLayers() {
    const on = Object.keys(ENGINES).filter(id => state.layers[id].on);
    return on.length ? on : ["saw"];
  }

  function makeVoice(midi, id, mix, when) {
    const p = state.params[id], f = mtof(midi), t = when ?? ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.0001;
    const lvl = ctx.createGain(); lvl.gain.value = mix;
    out.connect(lvl).connect(fx.input);
    const oscs = [];
    let release = expMap(p.release, 0.05, 6);
    const attack = p.attack != null ? expMap(p.attack, 0.004, 4) : 0.003;

    if (id === "saw") {
      const filt = nbVF("svf"); filt.type = "lowpass";
      filt.frequency.value = expMap(p.cutoff, 180, 14000); filt.Q.value = 0.5 + p.res * 14;
      filt.connect(out);
      const spread = p.detune * 45;
      const offsets = [-1, -0.62, -0.28, 0, 0.28, 0.62, 1];
      const gC = ctx.createGain(), gS = ctx.createGain(); gC.gain.value = 0.16; gS.gain.value = 0.11; gC.connect(filt); gS.connect(filt);
      offsets.forEach((o, i) => {
        const osc = ctx.createOscillator(); osc.type = "sawtooth";
        osc.frequency.value = f; osc.detune.value = o * spread;
        osc.connect(i === 3 ? gC : gS); osc.start(t, Math.random() * 0.01); oscs.push(osc);
      });
      ampEnv(out, t, attack, 0.32);
    }

    if (id === "analog") {
      const filt = nbVF("svf"); filt.type = "lowpass"; filt.Q.value = 0.7 + p.res * 16;
      const base = expMap(p.cutoff, 120, 9000);
      const top = Math.min(16000, base * (1 + p.env * 18));
      filt.frequency.setValueAtTime(base, t);
      filt.frequency.linearRampToValueAtTime(top, t + Math.max(0.005, attack * 0.6));
      filt.frequency.setTargetAtTime(base * 1.3, t + attack * 0.6, 0.35);
      filt.connect(out);
      const a = ctx.createOscillator(); a.type = "sawtooth"; a.frequency.value = f; a.detune.value = -6;
      const b = ctx.createOscillator(); b.type = "square"; b.frequency.value = f; b.detune.value = 7;
      const sub = ctx.createOscillator(); sub.type = "triangle"; sub.frequency.value = f / 2;
      const ga = ctx.createGain(); ga.gain.value = 0.22;
      const gb = ctx.createGain(); gb.gain.value = 0.12;
      const gs = ctx.createGain(); gs.gain.value = 0.18;
      a.connect(ga).connect(filt); b.connect(gb).connect(filt); sub.connect(gs).connect(filt);
      [a, b, sub].forEach(o => { o.start(t); oscs.push(o); });
      ampEnv(out, t, attack, 0.5);
      out.gain.setTargetAtTime(0.38, t + attack, 0.4);
    }

    if (id === "vital") {
      const W = getWaves();
      const pos = p.morph * (W.length - 1), i0 = Math.min(W.length - 2, Math.floor(pos)), frac = pos - i0;
      const cut = expMap(p.tone, 400, 14000);
      const tone = nbVF("svf"); tone.type = "lowpass"; tone.frequency.value = cut; tone.Q.value = 0.6;
      tone.connect(out);
      const gA = ctx.createGain(), gB = ctx.createGain();
      gA.gain.value = 1 - frac; gB.gain.value = frac;
      gA.connect(tone); gB.connect(tone);
      [[W[i0], gA], [W[i0 + 1], gB]].forEach(([wave, g]) => {
        [-7, 7].forEach(det => {
          const o = ctx.createOscillator(); o.setPeriodicWave(wave);
          o.frequency.value = f; o.detune.value = det + (Math.random() - 0.5) * 4;
          const og = ctx.createGain(); og.gain.value = 0.24;
          o.connect(og).connect(g); o.start(t); oscs.push(o);
        });
      });
      // motion sweeps between the two neighbouring tables and breathes the filter
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08 + p.motion * 1.1;
      const dA = ctx.createGain(), dB = ctx.createGain(), dF = ctx.createGain();
      const depth = p.motion * Math.min(0.5, Math.max(frac, 1 - frac));
      dA.gain.value = -depth; dB.gain.value = depth; dF.gain.value = p.motion * cut * 0.45;
      lfo.connect(dA).connect(gA.gain); lfo.connect(dB).connect(gB.gain); lfo.connect(dF).connect(tone.frequency);
      lfo.start(t); oscs.push(lfo);
      ampEnv(out, t, attack, 0.42);
    }

    if (id === "juno") {
      const filt = nbVF("ladder"); filt.type = "lowpass";
      const cut = expMap(p.cutoff, 180, 14000); filt.Q.value = 1.1;
      // (166) the VCF envelope the Juno leans on: the filter opens with the note and settles back toward the cutoff;
      // the sweep is wider the more closed the filter (an open one has nowhere to go), the decay follows Release
      const sweep = 0.8 + 1.1 * (1 - p.cutoff), fa = Math.max(0.012, attack * 0.8), fd = 0.35 + 0.9 * p.release;
      filt.frequency.setValueAtTime(cut, t);
      filt.frequency.linearRampToValueAtTime(Math.min(16000, cut * Math.pow(2, sweep)), t + fa);
      filt.frequency.setTargetAtTime(Math.min(16000, cut * Math.pow(2, sweep * 0.3)), t + fa, fd);
      // (168) the 106's DCO, after the KR-106: saw, pulse (saw minus a delayed copy of itself; moving the delay is PWM), the
      // sub an octave down and noise, mixed by DCO: saw → saw+pulse → pulse → pulse+sub → sub+noise
      const dco = p.dco == null ? 0.35 : p.dco;
      const lv = x => Math.max(0, 1 - Math.abs(x)), mSaw = lv(dco / 0.45) * 0.36, mPls = lv((dco - 0.5) / 0.5) * 0.26 + (dco > 0.2 && dco < 0.8 ? 0.04 : 0), mSub = lv((dco - 0.8) / 0.35) * 0.2, mNse = Math.max(0, dco - 0.75) * 0.8;
      const sum = ctx.createGain(); sum.gain.value = mPls;
      const saw = ctx.createOscillator(); saw.type = "sawtooth"; saw.frequency.value = f;
      const dl = ctx.createDelay(0.1); dl.delayTime.value = 0.5 / f;
      const inv = ctx.createGain(); inv.gain.value = -1;
      saw.connect(sum); saw.connect(dl).connect(inv).connect(sum);
      const sawG = ctx.createGain(); sawG.gain.value = mSaw; saw.connect(sawG);
      const pwmLfo = ctx.createOscillator(); pwmLfo.frequency.value = 0.55 + Math.random() * 0.1;
      const pwmDepth = ctx.createGain(); pwmDepth.gain.value = p.pwm * 0.42 / f;
      pwmLfo.connect(pwmDepth).connect(dl.delayTime);
      const sub = ctx.createOscillator(); sub.type = "square"; sub.frequency.value = f / 2;
      const subG = ctx.createGain(); subG.gain.value = mSub;
      // (168) the 106's HPF: off, or one of three corners before the VCF (position 0 on the real one is a little bass lift: left flat)
      const hpfV = p.hpf == null ? 0 : p.hpf, hpfHz = hpfV < 0.2 ? 0 : hpfV < 0.5 ? 90 : hpfV < 0.8 ? 230 : 520;
      const hpf = ctx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = Math.max(10, hpfHz); hpf.Q.value = 0.6;
      const dcoOut = hpfHz ? hpf : filt; if (hpfHz) hpf.connect(filt);
      sub.connect(subG).connect(dcoOut); sum.connect(dcoOut); sawG.connect(dcoOut);
      if (mNse > 0.001) { const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0); for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1; const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; const ng = ctx.createGain(); ng.gain.value = mNse; ns.connect(ng).connect(dcoOut); ns.start(t); oscs.push(ns); }
      // Juno-style stereo chorus: short delays swept against each other. (166) Three voices: left and right swept against each other as the Juno's two lines are, and a centre voice a quarter-cycle between them
      // (left, right, and a centre voice that comes in as the knob goes up: the Juno's I+II, and JS80P's chorus 1),
      // the wet path high-passed below 60 Hz so the sub stays put (the sweep itself is full-band, as the Juno's is)
      // (168) the 106's chorus buttons: I (slow, wide), II (faster, shallower), I+II (both at once, the "crunchy" one); off below the first step
      const chMode = p.chorus < 0.12 ? 0 : p.chorus < 0.55 ? 1 : p.chorus < 0.88 ? 2 : 3;
      const chAmt = chMode ? 0.85 : 0;
      const dry = ctx.createGain(); dry.gain.value = 1 - chAmt * 0.35;
      filt.connect(dry).connect(out);
      const merger = ctx.createChannelMerger(2);
      const cRate = chMode === 2 ? 0.86 : 0.51, cDepth = chMode === 2 ? 0.0024 : 0.0033;
      const wetHp = ctx.createBiquadFilter(); wetHp.type = "highpass"; wetHp.frequency.value = 60; wetHp.Q.value = 0.5; filt.connect(wetHp);
      const chLfos = [];
      [[0, 0, chAmt], [1, 1 / 2, chAmt], [2, 1 / 4, chMode === 3 ? 0.6 : 0]].forEach(([k, ph, wetG]) => {
        const lfo = ctx.createOscillator(); lfo.frequency.value = k === 2 && chMode === 3 ? 0.86 : cRate;
        const a = ph * Math.PI * 2; lfo.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, Math.sin(a)]), new Float32Array([0, Math.cos(a)]), { disableNormalization: true }));
        const d = ctx.createDelay(0.05); d.delayTime.value = 0.0045 + k * 0.0009;
        const dep = ctx.createGain(); dep.gain.value = cDepth;
        lfo.connect(dep).connect(d.delayTime);
        const wet = ctx.createGain(); wet.gain.value = wetG;
        wetHp.connect(d).connect(wet);
        if (k < 2) wet.connect(merger, 0, k); else { wet.connect(merger, 0, 0); wet.connect(merger, 0, 1); }
        chLfos.push(lfo);
      });
      merger.connect(out);
      [saw, pwmLfo, sub, ...chLfos].forEach(o => { o.start(t); oscs.push(o); });
      ampEnv(out, t, attack, 0.5);
      out.gain.setTargetAtTime(0.42, t + attack, 0.5);
    }

    if (id === "tyrell") {
      // CS-80-style brass: swelling 24 dB filter, a little pitch scoop, delayed vibrato
      const f1 = nbVF("ladder"), f2 = ctx.createBiquadFilter();
      f1.type = f2.type = "lowpass"; if (f1.nbModel === "ladder") f2.type = "allpass";   // the ladder is the whole 24 dB f1.Q.value = 0.5 + p.bite * 6; f2.Q.value = 0.7;
      const base = 240, peak = Math.min(16000, base * (2 + p.bite * 16)), swell = expMap(p.swell, 0.03, 1.5);
      [f1, f2].forEach(fl => {
        fl.frequency.setValueAtTime(base, t);
        fl.frequency.linearRampToValueAtTime(peak, t + swell);
        fl.frequency.setTargetAtTime(peak * 0.45, t + swell, 0.6);
      });
      f1.connect(f2).connect(out);
      const vib = ctx.createOscillator(); vib.frequency.value = 5.6;
      const vibG = ctx.createGain();
      vibG.gain.setValueAtTime(0, t); vibG.gain.linearRampToValueAtTime(p.vibrato * 22, t + 0.75);
      vib.connect(vibG); vib.start(t); oscs.push(vib);
      [["sawtooth", -8, 0.2], ["sawtooth", 8, 0.2], ["square", 0, 0.1]].forEach(([type, det, lvl]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        o.detune.setValueAtTime(det - 28, t); o.detune.linearRampToValueAtTime(det, t + 0.08);
        vibG.connect(o.detune);
        const g = ctx.createGain(); g.gain.value = lvl;
        o.connect(g).connect(f1); o.start(t); oscs.push(o);
      });
      ampEnv(out, t, attack, 0.48);
    }

    if (id === "choir") {
      const x = p.vowel * 4, i0 = Math.min(3, Math.floor(x)), fr = x - i0;
      const forms = [0, 1, 2].map(k => VOWELS[i0][k] * (1 - fr) + VOWELS[i0 + 1][k] * fr);
      const src = ctx.createGain(), sumF = ctx.createGain(); sumF.gain.value = 3.4;
      sumF.connect(out);
      [[8, 1], [11, 0.6], [13, 0.35]].forEach(([q, lvl], k) => {
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = forms[k]; bp.Q.value = q;
        const g = ctx.createGain(); g.gain.value = lvl;
        src.connect(bp).connect(g).connect(sumF);
      });
      const vib = ctx.createOscillator(); vib.frequency.value = 5.0 + Math.random() * 0.6;
      const vibG = ctx.createGain(); vibG.gain.value = p.vib * 26;
      vib.connect(vibG); vib.start(t); oscs.push(vib);
      [[-7, 0.22], [6, 0.22], [1200 + 3, 0.06]].forEach(([det, lvl]) => {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
        vibG.connect(o.detune);
        const g = ctx.createGain(); g.gain.value = lvl;
        o.connect(g).connect(src); o.start(t); oscs.push(o);
      });
      const n = ctx.createBufferSource(); n.buffer = fx.noise; n.loop = true;
      const nh = ctx.createBiquadFilter(); nh.type = "highpass"; nh.frequency.value = 700;
      const ng = ctx.createGain(); ng.gain.value = p.breath * 0.35;
      n.connect(nh).connect(ng).connect(src); n.start(t, Math.random()); oscs.push(n);
      ampEnv(out, t, attack, 0.42);
    }

    if (id === "zeb") {
      const spectrum = (shiftPeak) => {
        const N = 64, real = new Float32Array(N), imag = new Float32Array(N);
        const tilt = 2.3 - p.bright * 1.9, b = p.oddeven;
        const oddW = Math.max(0.3, Math.min(1, (1 - b) * 2)), evenW = Math.min(1, b * 2);
        for (let n = 1; n < N; n++) {
          let a = Math.pow(n, -tilt) * (n % 2 ? oddW : evenW);
          if (n === 1) a = 1;
          if (shiftPeak) a *= 1 + 2.5 * Math.exp(-Math.pow(n - shiftPeak, 2) / 6);
          imag[n] = a;
        }
        return ctx.createPeriodicWave(real, imag);
      };
      const wA = spectrum(0), wB = spectrum(5 + Math.round(p.bright * 6));
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9000; lp.connect(out);
      const gA = ctx.createGain(), gB = ctx.createGain(); gA.gain.value = 0.6; gB.gain.value = 0.4;
      gA.connect(lp); gB.connect(lp);
      [[wA, -5, gA], [wA, 5, gA], [wB, 0, gB]].forEach(([w, det, g]) => {
        const o = ctx.createOscillator(); o.setPeriodicWave(w); o.frequency.value = f; o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = 0.26;
        o.connect(og).connect(g); o.start(t); oscs.push(o);
      });
      // evolve slowly trades the plain spectrum for the formant-peaked one
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + p.evolve * 0.3;
      const dA = ctx.createGain(), dB = ctx.createGain();
      dA.gain.value = -p.evolve * 0.4; dB.gain.value = p.evolve * 0.4;
      lfo.connect(dA).connect(gA.gain); lfo.connect(dB).connect(gB.gain);
      lfo.start(t); oscs.push(lfo);
      const sub = ctx.createOscillator(); sub.frequency.value = f / 2;
      const sg = ctx.createGain(); sg.gain.value = 0.12;
      sub.connect(sg).connect(out); sub.start(t); oscs.push(sub);
      ampEnv(out, t, attack, 0.42);
    }

    if (id === "bells") {
      // resonant bell/kalimba bank: tuned partials ringing down at different rates
      const m = p.material * 2, i0 = Math.min(1, Math.floor(m)), fr = m - i0;
      const ratios = MODES[0].map((_, k) => MODES[i0][k] * (1 - fr) + MODES[i0 + 1][k] * fr);
      const ring = expMap(p.ring, 0.3, 8);
      const amps = [1, 0.5, 0.35, 0.25, 0.18];
      ratios.forEach((r, k) => {
        const freq = f * r; if (freq > 17000) return;
        const a = amps[k] * (k ? 0.4 + p.hardness * 0.9 : 1) * 0.3;
        const dec = ring / (1 + k * 0.9);
        [[0, 1], [p.shimmer * 14, 0.6]].forEach(([det, lv]) => {
          if (lv < 1 && p.shimmer < 0.02) return;
          const o = ctx.createOscillator(); o.frequency.value = freq; o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * lv, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
          o.connect(g).connect(out); o.start(t); oscs.push(o);
        });
      });
      const n = ctx.createBufferSource(); n.buffer = fx.noise;
      const nh = ctx.createBiquadFilter(); nh.type = "highpass"; nh.frequency.value = 2000 + p.hardness * 5000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(p.hardness * 0.25, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
      n.connect(nh).connect(ng).connect(out); n.start(t, Math.random() * 0.5); oscs.push(n);
      ampEnv(out, t, 0.002, 1);
    }

    if (id === "fm") { release = fmVoice(f, t, p, out, oscs); ampEnv(out, t, 0.003, 1); }
    if (id !== "fm") nbDrift(oscs, t);

    return {
      midi,
      stop(at) {
        const now = ctx.currentTime, g = out.gain;
        if (at == null) {
          at = now;
          g.cancelScheduledValues(now);
          g.setValueAtTime(Math.max(0.0001, g.value), now);
        }
        g.setTargetAtTime(0.0001, at, release / 4);
        const end = at + release * 1.6 + 0.1;
        oscs.forEach(o => { try { o.stop(end); } catch (e) {} });
        setTimeout(() => { out.disconnect(); lvl.disconnect(); }, (end - now) * 1000 + 200);
      },
    };
  }

  const MAX_VOICES = NB_BIG ? 32 : 8;   // (173) notes sounding at once before the oldest is let go
  const voices = new Map();   // midi -> voice
  const order = [];

  function layerVoices(midi, when, scale = 1) {
    const ids = activeLayers();
    const norm = scale / Math.sqrt(ids.length);
    return ids.map(id => makeVoice(midi, id, state.layers[id].level * 1.25 * norm, when));
  }

