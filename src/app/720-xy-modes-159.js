    // ======================================================================
    // 159: the XY pad on the Pixelbook in several configurations. Across and up each drive one control; the pad's mode
    // picks which two: the filter with Space (as before), the filter with Echo or its own resonance, Drive with
    // Wobble, the FX Lab's Density with Hall+, Lo-fi with Shimmer, Freeze with Space, or the sound's own first two or
    // next two knobs. Let go and both go back where they were; the level hold (710) rides along in every mode.
    // The Pixelbook picks the mode ("xyMode"); the tablet remembers it and answers with the two controls' names.
    // ======================================================================
    const F_RES = FN("live:res", {
      el() { const ks = [...document.querySelectorAll("#engineKnobs .knob")]; return ks.find(k => /reso|resonance|emphasis|peak|^q\b/i.test(k.getAttribute("aria-label") || "")) || null; },
      name() { const k = this.el(); return k ? (k.getAttribute("aria-label") || "Resonance").split(/[:,(]/)[0].trim() : "Resonance"; },
      get() { const k = this.el(); return k && k.__nbGet ? k.__nbGet() : null; },
      set(v) { const k = this.el(); if (k && k.__nbSet) k.__nbSet(v); },
      text() { const k = this.el(), kv = k && k.querySelector(".k-val"); return kv ? kv.textContent : "—"; },
    });
    const sndK = i => Q("#engineKnobs .knob", i);
    const labT = id => LAB_K.find(t => t.id === "lab:" + id) || null;
    const XY_MODES = [
      ["fs", "Filter · Space", () => F_FILTER, () => fxK(3)],
      ["fe", "Filter · Echo", () => F_FILTER, () => fxK(2)],
      ["fr", "Filter · Resonance", () => F_FILTER, () => F_RES],
      ["dw", "Drive · Wobble", () => fxK(0), () => fxK(1)],
      ["dh", "Density · Hall+", () => labT("dens"), () => labT("hall")],
      ["ls", "Lo-fi · Shimmer", () => labT("crush"), () => labT("shim")],
      ["zs", "Freeze · Space", () => labT("frz"), () => fxK(3)],
      ["k12", "The sound's knobs 1 · 2", () => sndK(0), () => sndK(1)],
      ["k34", "The sound's knobs 3 · 4", () => sndK(2), () => sndK(3)],
    ];
    const XYM = { mode: "fs" };
    try { const m = localStorage.getItem("nightbloom-xymode"); if (XY_MODES.some(x => x[0] === m)) XYM.mode = m; } catch (e) {}
    const xyMode = () => XY_MODES.find(x => x[0] === XYM.mode) || XY_MODES[0];
    const xyName = t => { try { const n = mlName(t, ""); return n || "—"; } catch (e) { return "—"; } };
    const isFxK = t => !!(t && t.k === "q" && /fxKnobs/.test(t.s || ""));
    function xyInfo() {
      const M = xyMode(), tx = M[2](), ty = M[3]();
      return { kind: "xy", mode: M[0], name: M[1], xn: tx ? xyName(tx) : "—", yn: ty ? xyName(ty) : "—", modes: XY_MODES.map(x => [x[0], x[1]]) };
    }
    function xySet(mode) {
      if (!XY_MODES.some(x => x[0] === mode)) return false;
      if (LKS.xy) lkXY({ on: false });   // (a mode change mid-touch lets go first)
      XYM.mode = mode; try { localStorage.setItem("nightbloom-xymode", mode); } catch (e) {}
      return true;
    }
    // the pad itself, in the mode's two controls (replaces 148's filter-and-Space pair; the level hold is called here)
    lkXY = function (d) {
      const x = Math.max(0, Math.min(1, +d.x || 0)), y = Math.max(0, Math.min(1, +d.y || 0));
      if (d.on) {
        if (!LKS.xy) {
          const M = xyMode(), tx = M[2](), ty = M[3]();
          LKS.xy = { mode: M[0], tx, ty, xv: tx ? mlGet(tx) : null, yv: ty ? mlGet(ty) : null, fx: (isFxK(tx) || isFxK(ty)) && state.fx.on === false };
          if (LKS.xy.fx) setFxOn(true);
          try { window.__live24 && __live24.xylStart(); } catch (e) {}
        }
        const o = LKS.xy; try { if (o.tx) learnApply(o.tx, x); } catch (e) {} try { if (o.ty) learnApply(o.ty, y); } catch (e) {}
      } else if (LKS.xy) {
        const o = LKS.xy; LKS.xy = null;
        try { if (o.tx && o.xv != null) learnApply(o.tx, o.xv); } catch (e) {} try { if (o.ty && o.yv != null) learnApply(o.ty, o.yv); } catch (e) {}
        if (o.fx) setFxOn(false);
        try { window.__live24 && __live24.xylStop(); } catch (e) {}
      }
    };
    { const li = lkIn; lkIn = function (t, d) {
        if (t === "cmd" && d && d.do === "xyMode") { if (d.mode) xySet(String(d.mode)); try { lkSend("data", xyInfo()); } catch (e) {} add139("link", "from the Pixelbook: XY pad " + xyMode()[1]); return; }
        if (t === "pull" && d && d.kind === "xy") { try { lkSend("data", xyInfo()); } catch (e) {} return; }
        return li.apply(this, arguments);
      }; }
    try { window.__live13.lkIn = lkIn; } catch (e) {}
    window.__live25 = { XY_MODES, XYM, xyMode, xySet, xyInfo, F_RES };
