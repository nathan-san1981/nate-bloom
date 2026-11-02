    // ======================================================================
    // 168: Elephant as a general effect, in the FX Lab. The elephant's voice (770's: a trumpeting saw, its octave and a
    // sub, driven by the shape: the pitch glides up, the growl comes in, then it dives) sits on the master, and whatever
    // plays is vocoded onto it: 14 bands read the mix's spectrum and open the same bands of the elephant's voice. Every
    // note sets the shape off at that note's pitch (a chord sets it off once, at its lowest note); Length is the shape's
    // length in seconds; Blend goes from the mix as it is to the elephant alone with the mix's character on it. The
    // sampler's Elephant mode (770) stays as it was, per sample; this one is for anything.
    // ======================================================================
    let EF = null;   // the nodes, rebuilt with the effects chain
    const EFX = { car: null, at: 0, pending: 0, note: 60 };
    const efLen = v => expMap(v, 0.15, 5);
    const efOn = () => !!(bfx.eleOn && betaOn);
    { const ob = buildChain; buildChain = function () {
        ob();
        if (!B || !B.betaOut || !ctx) { EF = null; return; }
        // the dry path through a gain (Blend turns it down); the wet path beside it
        try { B.betaOut.disconnect(fx.comp); } catch (e) {}
        const dry = ctx.createGain(); dry.gain.value = 1; B.betaOut.connect(dry).connect(fx.comp);
        const carIn = ctx.createGain(); carIn.gain.value = 1;
        const voc = ctx.createGain(); voc.gain.value = 1;
        const rectCurve = (() => { const c = new Float32Array(257); for (let k = 0; k < 257; k++) c[k] = Math.abs(k / 128 - 1); return c; })();
        const NB = 14;
        for (let k = 0; k < NB; k++) {
          const fk = 150 * Math.pow(7000 / 150, k / (NB - 1));
          const mb = ctx.createBiquadFilter(); mb.type = "bandpass"; mb.frequency.value = fk; mb.Q.value = 5;
          const rect = ctx.createWaveShaper(); rect.curve = rectCurve;
          const env = ctx.createBiquadFilter(); env.type = "lowpass"; env.frequency.value = 45; env.Q.value = 0.5;
          const eg = ctx.createGain(); eg.gain.value = 6;
          const cb = ctx.createBiquadFilter(); cb.type = "bandpass"; cb.frequency.value = fk; cb.Q.value = 5;
          const cg = ctx.createGain(); cg.gain.value = 0;
          B.betaOut.connect(mb).connect(rect).connect(env).connect(eg).connect(cg.gain);
          carIn.connect(cb).connect(cg).connect(voc);
        }
        const drive = ctx.createWaveShaper(); drive.curve = eleCurve(bfx.eleDrive); drive.oversample = "2x";
        const post = ctx.createBiquadFilter(); post.type = "lowpass"; post.frequency.value = 9000; post.Q.value = 0.7;
        const wet = ctx.createGain(); wet.gain.value = 0;
        voc.connect(drive).connect(post).connect(wet).connect(fx.comp);
        EF = { dry, carIn, voc, drive, post, wet, __drive: bfx.eleDrive };
        applyEle();
      }; }
    function applyEle() {
      if (!EF || !ctx) return;
      const on = efOn(), now = ctx.currentTime, blend = bfx.eleBlend ?? 0.6;
      EF.dry.gain.setTargetAtTime(on ? 1 - blend : 1, now, 0.03);
      EF.wet.gain.setTargetAtTime(on ? blend * 0.55 * (0.3 + 1.4 * (bfx.eleLevel ?? 0.7)) : 0, now, 0.03);   // (at the defaults it sits about where the mix was)
      if (EF.__drive !== bfx.eleDrive) { EF.__drive = bfx.eleDrive; EF.drive.curve = eleCurve(bfx.eleDrive); }
      if (EFX.car) { const c = EFX.car; c.setWah(bfx.eleWah); c.setGrowl(bfx.eleGrowl); }
      if (!on && EFX.car) efStop(EFX.car, now);
    }
    { const ab = applyBfx; applyBfx = function () { const r = ab.apply(this, arguments); try { applyEle(); } catch (e) {} return r; }; }
    // ---- the elephant's voice, set off by a note ----
    function efStop(c, at) {
      const end = at + 0.06;
      try { c.g.gain.cancelScheduledValues(at); c.g.gain.setValueAtTime(c.g.gain.value, at); c.g.gain.linearRampToValueAtTime(0.0001, end); } catch (e) {}
      c.oscs.forEach(o => { try { o.stop(end + 0.02); } catch (e) {} });
      try { c.shape.stop(end + 0.02); c.lfo.stop(end + 0.02); } catch (e) {}
      setTimeout(() => { try { c.g.disconnect(); } catch (e) {} }, 200);
      if (EFX.car === c) EFX.car = null;
    }
    function efTrigger(midi, when) {
      if (!EF || !ctx || !efOn()) return;
      const t = Math.max(ctx.currentTime, when || ctx.currentTime);
      if (EFX.car && t - EFX.car.t < 0.03) { if (midi < EFX.car.midi) { efStop(EFX.car, t); } else return; }   // a chord: once, at its lowest note
      if (EFX.car) efStop(EFX.car, t);
      const rate = Math.pow(2, (midi - 60) / 12), fc = 261.6256 * rate, P = { eGlide: bfx.eleGlide };
      const L = efLen(bfx.eleLen), R = Math.max(0.03, ELE_RISE * L), D0 = Math.max(t + R + 0.005, t + ELE_DIVE * L), DL = Math.max(0.03, (1 - ELE_DIVE) * L);
      const [r0, r1] = eleRates(P, rate);
      const shape = ctx.createConstantSource(); shape.offset.value = 0;
      const Bq = Math.max(1.05, r1 / r0), N = 48;
      const curve = up => Float32Array.from({ length: N }, (_, k) => { const x = up ? k / (N - 1) : 1 - k / (N - 1); return (Math.pow(Bq, x) - 1) / (Bq - 1); });
      shape.offset.setValueAtTime(0, t); shape.offset.setValueCurveAtTime(curve(true), t, R); shape.offset.setValueCurveAtTime(curve(false), D0, DL);
      const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.006);
      // the formant on the voice (Wah): a bandpass that opens with the shape
      let fTop = eleWahHz(bfx.eleWah);
      const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 4; f1.frequency.value = ELE_F0;
      const gF1 = ctx.createGain(); gF1.gain.value = fTop - ELE_F0; shape.connect(gF1).connect(f1.frequency);
      const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 2500;
      const sum = ctx.createGain(); f1.connect(sum); body.connect(sum);
      const am = ctx.createGain(); sum.connect(am).connect(g).connect(EF.carIn);
      const oscs = [];
      [["sawtooth", 1, 0.55, 0], ["sawtooth", 2, 0.3, 7], ["square", 0.5, 0.25, 0]].forEach(([type, mult, gg, cents]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = fc * mult * (r0 / rate); o.detune.value = cents;
        const gp = ctx.createGain(); gp.gain.value = fc * mult * (r1 - r0) / rate; shape.connect(gp).connect(o.frequency);
        const og = ctx.createGain(); og.gain.value = gg; o.connect(og); og.connect(f1); og.connect(body); oscs.push(o); o.__mult = mult;
      });
      // the growl, growing with the shape: on the level, the pitch and the formant
      const lfo = ctx.createOscillator(); lfo.type = "sawtooth"; lfo.frequency.value = eleRateHz(bfx.eleGrowl);
      const mul = ctx.createGain(); mul.gain.value = 0; lfo.connect(mul); shape.connect(mul.gain);
      let dep = eleDepth(bfx.eleGrowl);
      am.gain.value = 1 - dep / 2; const gAm = ctx.createGain(); gAm.gain.value = dep / 2; mul.connect(gAm).connect(am.gain);
      const gFm = ctx.createGain(); gFm.gain.value = 0.02 * fc * dep; oscs.forEach(o => gFm.connect(o.frequency)); mul.connect(gFm);
      const gWm = ctx.createGain(); gWm.gain.value = 0.3 * fTop * dep; mul.connect(gWm).connect(f1.frequency);
      shape.start(t); lfo.start(t); oscs.forEach(o => o.start(t));
      const c = { t, midi, g, oscs, shape, lfo,
        setWah(v) { const now = ctx.currentTime; fTop = eleWahHz(v); gF1.gain.setTargetAtTime(fTop - ELE_F0, now, 0.02); gWm.gain.setTargetAtTime(0.3 * fTop * dep, now, 0.02); },
        setGrowl(v) { const now = ctx.currentTime; dep = eleDepth(v); lfo.frequency.setTargetAtTime(eleRateHz(v), now, 0.02); am.gain.setTargetAtTime(1 - dep / 2, now, 0.02); gAm.gain.setTargetAtTime(dep / 2, now, 0.02); gFm.gain.setTargetAtTime(0.02 * fc * dep, now, 0.02); gWm.gain.setTargetAtTime(0.3 * fTop * dep, now, 0.02); } };
      EFX.car = c;
      // the voice stays a little past the shape's dive, then goes (a new note starts a new one)
      setTimeout(() => { if (EFX.car === c) efStop(c, ctx.currentTime); }, (L + 0.4 + (t - ctx.currentTime)) * 1000);
    }
    // every note sets it off: the synth voices, the sampler (not its own Elephant mode), the library, the plugins
    { const mv = makeVoice; makeVoice = function (midi, id, mix, when) { try { efTrigger(midi, when); } catch (e) {} return mv.apply(this, arguments); }; }
    { const ms = makeSampleVoice; makeSampleVoice = function (midi, i, when) { try { const sl = state.samp.slots[i]; if (!sl || sl.mode !== "elephant") efTrigger(midi, when); } catch (e) {} return ms.apply(this, arguments); }; }
    if (typeof makeInstVoice === "function") { const mi = makeInstVoice; makeInstVoice = function (midi, when) { try { efTrigger(midi, when); } catch (e) {} return mi.apply(this, arguments); }; }
    window.__live31 = { EFX, efTrigger, applyEle, efLen, get EF() { return EF; } };
