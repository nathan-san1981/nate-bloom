    // ======================================================================
    // 166: Elephant, the Skrillex-style trumpeting growl, as an effect on the sample itself. The sampler's fourth
    // mode (Play · Grain · Elephant · Slice): the slot's sample plays as Play plays it (Start, Length, Loop, the
    // waveform untouched) and a shape rides on it, sized to the sample: the pitch glides up (Glide, in semitones),
    // two formants open with it (Wah), a saw-wave growl grows in as it climbs (Growl: the rasp on the level, the
    // pitch and the formant), the whole thing is driven into a tanh (Drive), and at the end it dives back down.
    // Length is the shape's length: ×1 is the time the sample takes to play under the glide, so Fit puts the dive at
    // the sample's end; shorter samples get a shorter elephant. dB trims the level, −24 to +12, so it sits against
    // the other sounds. The pad (under the sample bar, and bigger in the Shape sheet) moves Wah and Growl live while
    // you play; Shape… opens a sheet like the sample editor's: the waveform with the shape drawn over it (drag the
    // amber end to stretch the shape), the pad, a slider per control, Preview, Fit and Reset.
    // ======================================================================
    const ELE = { live: new Set(), prev: null, prevAt: 0, prevL: 0, raf: 0, drag: null, last: "" };
    const ELE_KEYS = SAMP_ELE_KNOBS.map(k => k[0]);
    const ELE_DEF = Object.fromEntries(SAMP_ELE_KNOBS.map(([k,, v]) => [k, v]));
    const eleSlot = () => state.samp.slot;
    const eleP = i => state.samp.slots[i == null ? eleSlot() : i].p;
    const eleGlideSt = v => 24 * v;                             // semitones the pitch climbs over the rise
    const eleWahHz = v => 300 * Math.pow(2, 0.5 + 3 * v);       // where the first formant opens to (425 Hz to 3.4 kHz)
    const eleRateHz = v => 12 + 40 * v;                         // the growl's speed
    const eleDepth = v => 0.15 + 0.6 * v;                       // and its depth
    const eleDb = v => -24 + 36 * v;
    const eleLenX = v => Math.pow(4, 2 * v - 1);                // ×0.25 to ×4 of the fitted length
    const eleOn = () => state.engine === "samp" && state.samp.slots[eleSlot()].mode === "elephant";
    const ELE_F0 = 300, ELE_RISE = 0.32, ELE_DIVE = 0.76;
    function eleRates(P, rate) { const g = eleGlideSt(P.eGlide); return [rate * Math.pow(2, -g * 0.3 / 12), rate * Math.pow(2, g * 0.7 / 12)]; }
    // how much faster than `rate` the sample runs under the shape, on average (the rise and the dive are exponential glides)
    function eleAvgRate(P, rate) { const [r0, r1] = eleRates(P, rate); const m = r1 - r0 < 1e-6 ? r0 : (r1 - r0) / Math.log(r1 / r0); return (ELE_RISE + (1 - ELE_DIVE)) * m + (ELE_DIVE - ELE_RISE) * r1; }
    function eleRegion(i) { const buf = sampBuf[i], P = eleP(i); if (!buf) return { off: 0, len: 0, dur: 0 }; const dur = buf.duration, off = P.start * dur * 0.98; return { off, len: Math.max(0.02, P.length * (dur - off)), dur }; }
    function eleFitLen(i, rate) { const P = eleP(i); return eleRegion(i).len / eleAvgRate(P, rate || 1); }   // the shape that ends with the sample
    function eleShapeLen(i, rate) { return Math.max(0.05, eleFitLen(i, rate) * eleLenX(eleP(i).eLen)); }
    function eleCurve(d) {
      const k = 1 + 24 * d, n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
      for (let j = 0; j < n; j++) { const x = j / (n - 1) * 2 - 1; c[j] = Math.tanh(k * x) / norm; }
      return c;
    }
    const eleMakeup = d => 0.8 / (1 + 1.6 * d);   // the drive makes it louder; at the default the elephant sits about where Play does (test166e checks)
    const eleLevel = (P, scale) => P.level * 1.4 * scale * Math.pow(10, eleDb(P.eDb) / 20) * eleMakeup(P.eDrive);
    function eleVoice(midi, i, when, scale) {
      const buf = sampBuf[i]; if (!buf || !ctx) return null;
      const slot = state.samp.slots[i], P = slot.p;
      const t = when ?? ctx.currentTime, rate = Math.pow(2, (midi - 60) / 12);
      const { off, len } = eleRegion(i);
      const L = eleShapeLen(i, rate), R = Math.max(0.03, ELE_RISE * L), D0 = Math.max(t + R + 0.005, t + ELE_DIVE * L), DL = Math.max(0.03, (1 - ELE_DIVE) * L);
      const out = ctx.createGain(); out.gain.value = 0.0001;
      const lvl = ctx.createGain(); lvl.gain.value = eleLevel(P, scale);
      out.connect(lvl).connect(fx.input);
      // the sample, as Play plays it
      const src = ctx.createBufferSource(); src.buffer = buf;
      let [r0, r1] = eleRates(P, rate);
      src.playbackRate.value = r0;
      // the shape: 0 → 1 over the rise (an exponential, so the pitch climbs evenly), held, 1 → 0 over the dive
      const shape = ctx.createConstantSource(); shape.offset.value = 0;
      const B = Math.max(1.05, r1 / r0), N = 48;
      const curve = up => Float32Array.from({ length: N }, (_, k) => { const x = up ? k / (N - 1) : 1 - k / (N - 1); return (Math.pow(B, x) - 1) / (B - 1); });
      shape.offset.setValueAtTime(0, t); shape.offset.setValueCurveAtTime(curve(true), t, R); shape.offset.setValueCurveAtTime(curve(false), D0, DL);
      const gPitch = ctx.createGain(); gPitch.gain.value = r1 - r0; shape.connect(gPitch).connect(src.playbackRate);
      // two formants that open with the shape, over a little of the sample's own body
      const pre = ctx.createGain(); pre.gain.value = 1; src.connect(pre);
      let fTop = eleWahHz(P.eWah);
      const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 8; f1.frequency.value = ELE_F0;
      const f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 6; f2.frequency.value = ELE_F0 * 2.4;
      const gF1 = ctx.createGain(); gF1.gain.value = fTop - ELE_F0; shape.connect(gF1).connect(f1.frequency);
      const gF2 = ctx.createGain(); gF2.gain.value = (fTop - ELE_F0) * 2.4; shape.connect(gF2).connect(f2.frequency);
      const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 900; body.Q.value = 0.5;
      const sum = ctx.createGain(); sum.gain.value = 1;
      const m1 = ctx.createGain(); m1.gain.value = 1.8; pre.connect(f1).connect(m1).connect(sum);
      const m2 = ctx.createGain(); m2.gain.value = 0.8; pre.connect(f2).connect(m2).connect(sum);
      const m3 = ctx.createGain(); m3.gain.value = 0.55; pre.connect(body).connect(m3).connect(sum);
      // the growl: a saw LFO that grows with the shape, on the level, the pitch and the first formant
      const lfo = ctx.createOscillator(); lfo.type = "sawtooth"; lfo.frequency.value = eleRateHz(P.eGrowl);
      const mul = ctx.createGain(); mul.gain.value = 0; lfo.connect(mul); shape.connect(mul.gain);
      let dep = eleDepth(P.eGrowl);
      const am = ctx.createGain(); am.gain.value = 1 - dep / 2;
      const gAm = ctx.createGain(); gAm.gain.value = dep / 2; mul.connect(gAm).connect(am.gain);
      const gFm = ctx.createGain(); gFm.gain.value = 0.05 * rate * dep; mul.connect(gFm).connect(src.playbackRate);
      const gWm = ctx.createGain(); gWm.gain.value = 0.3 * fTop * dep; mul.connect(gWm).connect(f1.frequency);
      // the drive, then the sample's Tone, then the growl's level, then the envelope
      const drive = ctx.createWaveShaper(); drive.curve = eleCurve(P.eDrive); drive.oversample = "2x";
      const post = ctx.createBiquadFilter(); post.type = "lowpass"; post.frequency.value = Math.min(expMap(P.tone, 250, 20000), 12000); post.Q.value = 0.7;
      sum.connect(drive).connect(post).connect(am).connect(out);
      if (slot.loop) { src.loop = true; src.loopStart = off; src.loopEnd = off + len; src.start(t, off); } else src.start(t, off, len);
      shape.start(t); lfo.start(t);
      out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + 0.004);
      const fade = expMap(P.fade, 0.02, 3);
      const v = {
        ele: true, slot: i, rate, t, L,
        set(key, val) {   // the pad and the sheet move a playing elephant
          const now = ctx.currentTime;
          if (key === "eWah") { fTop = eleWahHz(val); gF1.gain.setTargetAtTime(fTop - ELE_F0, now, 0.02); gF2.gain.setTargetAtTime((fTop - ELE_F0) * 2.4, now, 0.02); gWm.gain.setTargetAtTime(0.3 * fTop * dep, now, 0.02); }
          else if (key === "eGrowl") { dep = eleDepth(val); lfo.frequency.setTargetAtTime(eleRateHz(val), now, 0.02); am.gain.setTargetAtTime(1 - dep / 2, now, 0.02); gAm.gain.setTargetAtTime(dep / 2, now, 0.02); gFm.gain.setTargetAtTime(0.05 * rate * dep, now, 0.02); gWm.gain.setTargetAtTime(0.3 * fTop * dep, now, 0.02); }
          else if (key === "eGlide") { [r0, r1] = eleRates(P, rate); src.playbackRate.setTargetAtTime(r0, now, 0.02); gPitch.gain.setTargetAtTime(r1 - r0, now, 0.02); }
          else if (key === "eDrive") { drive.curve = eleCurve(val); lvl.gain.setTargetAtTime(eleLevel(P, scale), now, 0.02); }
          else if (key === "eDb") lvl.gain.setTargetAtTime(eleLevel(P, scale), now, 0.02);
        },
        stop(at) {
          const now = ctx.currentTime;
          if (at == null) { at = now; out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now); }
          out.gain.setTargetAtTime(0.0001, at, fade / 4);
          const end = at + fade * 1.6 + 0.05;
          try { src.stop(end); } catch (e) {} try { shape.stop(end); lfo.stop(end); } catch (e) {}
          if (at <= now + 0.01) ELE.live.delete(v); else setTimeout(() => ELE.live.delete(v), (at - now) * 1000);   // (a stop set for later: the pad still moves it until then)
          setTimeout(() => { try { out.disconnect(); lvl.disconnect(); } catch (e) {} }, (end - now) * 1000 + 300);
        },
      };
      ELE.live.add(v);
      src.onended = () => { ELE.live.delete(v); };
      return v;
    }
    eleVoiceHook = eleVoice;
    // ---- setting a control: the slot, every playing elephant, the knob, the sliders, the pads ----
    function eleSet(key, val, i) {
      i = i == null ? eleSlot() : i; const P = eleP(i); val = Math.min(1, Math.max(0, +val || 0));
      if (P[key] === val) return;
      P[key] = val;
      for (const v of ELE.live) if (v.slot === i) { try { v.set(key, val); } catch (e) {} }
      if (i === eleSlot()) {
        const lab = (SAMP_ELE_KNOBS.find(k => k[0] === key) || [])[1];
        const el = lab && [...document.querySelectorAll("#engineKnobs .knob")].find(k => k.getAttribute("aria-label") === lab);
        if (el && el.__nbSet) el.__nbSet(val); else save();   // (the knob repaints; P already holds the value)
        elePaintAll();
      }
    }
    // ---- the pads ----
    const padXY = $id("eleXY"), padXY2 = $id("eleXY2"), padEl = $id("elePad"), eleBtn = $id("eleBtn");
    function padDraw(cv) {
      if (!cv || cv.offsetParent === null) return;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      c.strokeStyle = "rgba(196,163,255,0.14)"; c.lineWidth = 1;
      for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(w * k / 4, 0); c.lineTo(w * k / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, h * k / 4); c.lineTo(w, h * k / 4); c.stroke(); }
      c.font = "10px ui-monospace, Menlo, monospace"; c.fillStyle = "rgba(236,231,247,0.45)";
      c.textAlign = "right"; c.fillText("Wah →", w - 8, h - 7); c.textAlign = "left"; c.fillText("↑ Growl", 8, 14);
      const P = eleP(), x = P.eWah * w, y = (1 - P.eGrowl) * h;
      c.strokeStyle = "rgba(196,163,255,0.35)"; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      c.fillStyle = ELE.drag && ELE.drag.cv === cv ? amber : lilac; c.beginPath(); c.arc(x, y, ELE.drag && ELE.drag.cv === cv ? 11 : 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#0d0b13"; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    }
    function padFrom(cv, e) { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))]; }
    function padWire(cv) {
      cv.addEventListener("pointerdown", e => {
        if (!eleOn() && cv === padXY) return;
        e.preventDefault(); cv.setPointerCapture(e.pointerId); ELE.drag = { cv, id: e.pointerId };
        const [x, y] = padFrom(cv, e); eleSet("eWah", x); eleSet("eGrowl", y); padDraw(cv);
      });
      cv.addEventListener("pointermove", e => { if (!ELE.drag || ELE.drag.cv !== cv || ELE.drag.id !== e.pointerId) return; const [x, y] = padFrom(cv, e); eleSet("eWah", x); eleSet("eGrowl", y); });
      const end = e => { if (ELE.drag && ELE.drag.cv === cv) { ELE.drag = null; padDraw(cv); save(); } };
      cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    }
    padWire(padXY); padWire(padXY2);
    // ---- the Shape sheet ----
    const sheet = $id("eleSheet"), eleWave = $id("eleWave"), eleInfo = $id("eleInfo");
    const sl = Object.fromEntries(ELE_KEYS.map(k => [k, $id("ele" + k.slice(1))]));   // eGlide → #eleGlide …
    const slV = Object.fromEntries(ELE_KEYS.map(k => [k, $id("ele" + k.slice(1) + "V")]));
    const eleFmt = (k, v) => display(k, v, eleP());
    function eleSheetPaint() {
      if (sheet.hidden) return;
      const P = eleP();
      for (const k of ELE_KEYS) { const want = String(Math.round(P[k] * 1000)); if (sl[k].value !== want) sl[k].value = want; slV[k].textContent = eleFmt(k, P[k]); }
      const i = eleSlot(), { len } = eleRegion(i), L = eleShapeLen(i, 1), fit = eleFitLen(i, 1);
      eleInfo.textContent = (sampBuf[i] ? fmtTime(len) + " of sample · " : "") + "shape " + fmtTime(L) + (Math.abs(L - fit) < 0.01 ? " (fits)" : L > fit ? " (longer than the sample)" : " (ends before the sample)");
      padDraw(padXY2); eleWaveDraw();
    }
    function eleWaveDraw() {
      const cv = eleWave, i = eleSlot(), buf = sampBuf[i]; if (!cv || sheet.hidden) return;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      if (!buf) { c.fillStyle = "rgba(236,231,247,0.5)"; c.font = "12px ui-monospace, Menlo, monospace"; c.fillText("Load a sample into this slot first", 12, h / 2); return; }
      const P = eleP(i), { off, len } = eleRegion(i), L = eleShapeLen(i, 1);
      const span = Math.max(len / eleAvgRate(P, 1), L) * 1.06;   // seconds across the canvas: the sample as it plays under the shape, and the shape
      const avg = eleAvgRate(P, 1), sx = (len / avg) / span * w;   // the sample's played part, in pixels
      // the sample's waveform (the played part, as it plays under the shape: squeezed by the glide), in lilac
      const chans = Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k)), sr = buf.sampleRate;
      const i0 = Math.floor(off * sr), n = Math.max(1, Math.floor(len * sr)), cols = Math.max(1, Math.floor(sx)), step = n / cols;
      for (let x = 0; x < cols; x++) {
        const a = i0 + Math.floor(x * step), b = Math.min(i0 + n, i0 + Math.floor((x + 1) * step) + 1), inc = Math.max(1, Math.floor((b - a) / 160));
        let mn = 0, mx = 0;
        for (const ch of chans) for (let j = a; j < b; j += inc) { const v = ch[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
        c.fillStyle = "rgba(196,163,255,0.55)"; c.fillRect(x, h / 2 - mx * h * 0.44, 1, Math.max(1, (mx - mn) * h * 0.44));
      }
      // the shape: pitch over time, in amber (the rise, the hold with the growl, the dive)
      const Lx = L / span * w, [r0, r1] = eleRates(P, 1), g = eleGlideSt(P.eGlide);
      const yOf = s => h * 0.82 - s * h * 0.64 * Math.min(1, 0.25 + g / 24);
      c.strokeStyle = amber; c.lineWidth = 2; c.beginPath();
      const B = Math.max(1.05, r1 / r0), dep = eleDepth(P.eGrowl);
      for (let x = 0; x <= Lx; x++) {
        const u = x / Lx; let s;
        if (u < ELE_RISE) s = (Math.pow(B, u / ELE_RISE) - 1) / (B - 1); else if (u < ELE_DIVE) s = 1; else s = (Math.pow(B, 1 - (u - ELE_DIVE) / (1 - ELE_DIVE)) - 1) / (B - 1);
        const growl = s * dep * 0.06 * h * Math.sin(x * 0.9);   // the rasp, drawn as a shiver
        x === 0 ? c.moveTo(x, yOf(s)) : c.lineTo(x, yOf(s) + growl);
      }
      c.stroke();
      // the end marker (drag it) and the sample's end
      c.fillStyle = amber; c.fillRect(Math.min(w - 2, Math.max(0, Lx - 1)), 0, 2, h); c.fillRect(Math.min(w - 14, Math.max(0, Lx - 7)), h - 14, 14, 14);
      c.fillStyle = "rgba(236,231,247,0.35)"; c.fillRect(Math.min(w - 1, sx), 0, 1, h);
      c.font = "10px ui-monospace, Menlo, monospace"; c.fillStyle = "rgba(236,231,247,0.6)"; c.textAlign = "left";
      c.fillText("sample ends " + fmtTime(len / avg), Math.min(w - 120, sx + 4), 12);
      c.fillStyle = amber; c.textAlign = Lx > w - 90 ? "right" : "left"; c.fillText("shape " + fmtTime(L), Lx > w - 90 ? Lx - 6 : Lx + 6, h - 18);
      if (ELE.prev && ctx) {   // the preview's playhead
        const pos = (ctx.currentTime - ELE.prevAt) / span * w;
        if (pos >= 0 && pos <= w) { c.fillStyle = "#ece7f7"; c.fillRect(pos, 0, 1.5, h); }
      }
    }
    // dragging on the wave sets the shape's length (the amber end follows the finger)
    eleWave.addEventListener("pointerdown", e => {
      if (!sampBuf[eleSlot()]) return;
      e.preventDefault(); eleWave.setPointerCapture(e.pointerId); ELE.wdrag = e.pointerId; eleWaveTo(e);
    });
    eleWave.addEventListener("pointermove", e => { if (ELE.wdrag === e.pointerId) eleWaveTo(e); });
    const wEnd = e => { if (ELE.wdrag === e.pointerId) { ELE.wdrag = null; save(); } };
    eleWave.addEventListener("pointerup", wEnd); eleWave.addEventListener("pointercancel", wEnd);
    function eleWaveTo(e) {
      const i = eleSlot(), P = eleP(i), r = eleWave.getBoundingClientRect(), { len } = eleRegion(i), L = eleShapeLen(i, 1);
      const span = Math.max(len / eleAvgRate(P, 1), L) * 1.06, want = Math.max(0.05, (e.clientX - r.left) / r.width * span);
      const x = want / eleFitLen(i, 1);   // ×fit → the knob: lenX = 4^(2v−1)
      eleSet("eLen", (Math.log(Math.max(0.25, Math.min(4, x))) / Math.log(4) + 1) / 2);
    }
    function eleOpen() {
      if (!eleOn()) return;
      start();
      const i = eleSlot(), s = state.samp.slots[i];
      $id("eleTitle").textContent = "Elephant · S" + (i + 1) + (s.name ? " · " + s.name : "");
      sheet.hidden = false; requestAnimationFrame(eleSheetPaint);
    }
    function eleClose() { elePrevStop(); sheet.hidden = true; }
    function elePrevStop() { if (ELE.prev) { try { ELE.prev.stop(); } catch (e) {} ELE.prev = null; } cancelAnimationFrame(ELE.raf); ELE.raf = 0; $id("elePlay").textContent = "▶ Preview"; }
    function elePrev() {
      if (ELE.prev) { elePrevStop(); eleWaveDraw(); return; }
      const i = eleSlot(); if (!sampBuf[i] || !ctx) return;
      start();
      const v = makeSampleVoice(60, i, undefined, 1); if (!v) return;
      ELE.prev = v; ELE.prevAt = ctx.currentTime; ELE.prevL = v.L || eleShapeLen(i, 1);
      const P = eleP(i), until = Math.max(ELE.prevL, eleRegion(i).len / eleAvgRate(P, 1)) + 0.05;
      v.stop(ELE.prevAt + until);
      $id("elePlay").textContent = "■ Stop";
      const tick = () => { if (!ELE.prev) return; if (ctx.currentTime - ELE.prevAt > until + 0.4) { ELE.prev = null; $id("elePlay").textContent = "▶ Preview"; eleWaveDraw(); return; } eleWaveDraw(); ELE.raf = requestAnimationFrame(tick); };
      ELE.raf = requestAnimationFrame(tick);
    }
    for (const k of ELE_KEYS) sl[k].addEventListener("input", () => eleSet(k, sl[k].value / 1000));
    $id("elePlay").addEventListener("click", elePrev);
    $id("eleFit").addEventListener("click", () => { eleSet("eLen", 0.5); add139("sampler", "Elephant fit to the sample"); });
    $id("eleReset").addEventListener("click", () => { for (const k of ELE_KEYS) eleSet(k, ELE_DEF[k]); });
    $id("eleDone").addEventListener("click", eleClose);
    sheet.addEventListener("click", e => { if (e.target === sheet) eleClose(); });
    eleBtn.addEventListener("click", eleOpen);
    // ---- paint: the pad and Shape… show in Elephant mode; the pad follows the knobs ----
    function elePaintAll() { padDraw(padXY); eleSheetPaint(); }
    function elePaint() {
      const on = eleOn();
      if (padEl.hidden === on) padEl.hidden = !on;
      if (eleBtn.hidden === on) eleBtn.hidden = !on;
      if (!on && !sheet.hidden) eleClose();
      if (on) requestAnimationFrame(() => padDraw(padXY));
    }
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); try { elePaint(); } catch (e) {} return r; }; }
    { const rs = refreshSamplesUI; refreshSamplesUI = function () { const r = rs.apply(this, arguments); try { elePaint(); } catch (e) {} return r; }; }
    setInterval(() => {   // a knob turned by hand (or the MiniLab) moves the pad's dot
      if (document.hidden || !eleOn() || ELE.drag) return;
      const P = eleP(), k = P.eWah.toFixed(3) + "," + P.eGrowl.toFixed(3) + "," + P.eLen.toFixed(3) + "," + P.eGlide.toFixed(3);
      if (k !== ELE.last) { ELE.last = k; elePaintAll(); }
    }, 200);
    elePaint();
    window.__live30 = { ELE, eleVoice, eleSet, eleShapeLen, eleFitLen, eleAvgRate, eleRegion, eleOpen, eleClose, elePrev, eleLevel, eleMakeup, eleWahHz, eleRateHz, eleGlideSt, eleDb };
