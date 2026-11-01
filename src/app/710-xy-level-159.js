    // ======================================================================
    // 159: the XY pad on the Pixelbook holds the level. Opening the filter and adding Space make the sound louder,
    // and on stage that's a volume jump, not the tonal move you meant. While the pad is touched the tablet measures
    // what comes out and, if it climbs more than 2 dB over where it was the moment you touched, pulls it back there
    // (never up: a closed filter stays as quiet as it is). Let go and the level is handed back over half a second.
    // ======================================================================
    const XYL = { on: false, ring: [], ref: null, g: 1, t: 0, min: 1, td: null };
    function xylRms() {
      if (!analyser || !ctx) return 0;
      if (!XYL.td || XYL.td.length !== analyser.fftSize) XYL.td = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(XYL.td); let s = 0; for (let i = 0; i < XYL.td.length; i++) s += XYL.td[i] * XYL.td[i];
      return Math.sqrt(s / XYL.td.length);
    }
    function xylNode() {   // a gain between the soft clipper and the analyser, put there once per chain
      if (!ctx || !fx || !fx.safe) return null;
      if (fx.xyRider && fx.xyRiderOn === fx.safe) return fx.xyRider;
      const R = ctx.createGain();
      try { fx.safe.disconnect(analyser); } catch (e) {}
      fx.safe.connect(R).connect(analyser); fx.xyRider = R; fx.xyRiderOn = fx.safe; return R;
    }
    setInterval(() => { if (ctx && ctx.state === "running" && !document.hidden) { XYL.ring.push(xylRms()); if (XYL.ring.length > 15) XYL.ring.shift(); } }, 100);
    function xylStart() {
      if (XYL.on) return; XYL.on = true; XYL.min = 1;
      const v = XYL.ring.filter(x => x > 0.005); XYL.ref = v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null;
      const R = xylNode(); if (!R || XYL.ref == null) return;
      XYL.ms = null;
      clearInterval(XYL.t); XYL.t = setInterval(() => {
        if (!XYL.on || !ctx) return;
        const m0 = xylRms(), ref = XYL.ref; let g = XYL.g;
        const m = XYL.ms = XYL.ms == null ? m0 : XYL.ms * 0.7 + m0 * 0.3;   // (a 21 ms window of a low note wobbles: smooth it)
        if (m > ref * 1.26) g = Math.max(0.2, Math.min(1, g * Math.pow(ref * 1.12 / m, 0.4)));
        else if (g < 1 && m < ref * 0.85) g = Math.min(1, g * Math.pow(ref / Math.max(m, 1e-4), 0.15));
        if (g !== XYL.g) { XYL.g = g; XYL.min = Math.min(XYL.min, g); R.gain.setTargetAtTime(g, ctx.currentTime, 0.04); }
      }, 50);
    }
    function xylStop() {
      if (!XYL.on) return; XYL.on = false; clearInterval(XYL.t); XYL.t = 0;
      const R = fx && fx.xyRider; if (R && ctx) { R.gain.cancelScheduledValues(ctx.currentTime); R.gain.setTargetAtTime(1, ctx.currentTime, 0.15); }
      if (XYL.min < 0.98) { try { window.__nbAdd && window.__nbAdd("link", "XY pad: held the level (" + Math.round(20 * Math.log10(XYL.min)) + " dB at the most)"); } catch (e) {} }
      XYL.g = 1; XYL.ref = null;
    }
    { const x0 = lkXY; lkXY = function (d) { const r = x0.apply(this, arguments); try { if (d && d.on) xylStart(); else xylStop(); } catch (e) {} return r; }; }
    window.__live24 = { XYL, xylStart, xylStop, xylRms, xylNode };
