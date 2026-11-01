  // ---------- the editor ----------
  const wvGet = path => path.split(".").reduce((o, k) => o == null ? o : o[k], WV.patch);
  const wvPut = (path, v) => { const ks = path.split("."), last = ks.pop(); ks.reduce((o, k) => o[k], WV.patch)[last] = v; };
  const aT = v => 0.0008 * Math.pow(12500, v), rT = v => 0.004 * Math.pow(2500, v);
  const fT = s => s >= 1 ? s.toFixed(s >= 10 ? 0 : 1) + " s" : Math.round(s * 1000) + " ms";
  const fHz = hz => hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 0 : 1) + " kHz" : (hz >= 100 ? Math.round(hz) : hz.toFixed(hz >= 10 ? 1 : 2)) + " Hz";
  const pc = v => Math.round(v * 100) + "%", bip = v => { const x = Math.round((v - 0.5) * 200); return (x > 0 ? "+" : "") + x + "%"; };
  function wvFmt(path, v) {
    const k = path.split(".").pop(), sec = path.split(".")[0];
    if (k === "pitch") { const s = Math.round((v - 0.5) * 48); return (s > 0 ? "+" : "") + s + " st"; }
    if (k === "fine") { const c = Math.round((v - 0.5) * 200); return (c > 0 ? "+" : "") + c + " ct"; }
    if (k === "det") return Math.round(v * v * 100) + " ct";
    if (k === "cut") return fHz(20 * Math.pow(2, v * 9.966));
    if (k === "env" || k === "pan" || (k === "wamt" && [1, 4].includes(wvGet(sec + ".warp")))) return bip(v);
    if (k === "a") return fT(aT(v));
    if (k === "d" || k === "r") return fT(rT(v));
    if (k === "rate") { const l = wvGet(sec); return l && l.sync ? WV_SYNC[Math.min(WV_SYNC.length - 1, Math.floor(v * WV_SYNC.length))] : fHz(0.02 * Math.pow(1500, v)); }
    if (k === "fade") return v < 0.01 ? "off" : fT(v * v * 6);
    if (k === "glide") return v < 0.01 ? "off" : fT(v * v * 2);
    if (k === "uni") return v + (v === 1 ? " voice" : " voices");
    if (k === "max") return v + " notes";
    if (k === "pos") { const T = WT.cache.get(wvGet(sec + ".table")); return T ? "frame " + (Math.round(v * (T.F - 1)) + 1) : pc(v); }
    return pc(v);
  }
  const WV_INT = { uni: [1, 8], max: [1, 16] };
  const WV_DEF = path => { const k = path.split(".").pop(), s = path.split(".")[0]; const d = wvInit(); const v = path.split(".").reduce((o, x) => o == null ? o : o[x], d); return v != null ? v : k === "level" ? 0.8 : 0.5; };
  const wvModsOn = dst => WV.patch.mods.filter(m => m.dst === dst);
  const arcD = (r, a0, a1) => { const p = a => [22 + r * Math.cos(a * Math.PI / 180), 22 + r * Math.sin(a * Math.PI / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  function wvKnob(parent, path, label, opt = {}) {
    const el = document.createElement("div"); el.className = "wvk"; el.tabIndex = 0; el.setAttribute("role", "slider"); el.setAttribute("aria-label", label);
    el.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><path class="t"/><path class="m"/><path class="v"/></svg><b></b><span></span>`;
    el.querySelector("b").textContent = label;
    const k = path.split(".").pop(), I = WV_INT[k], dst = WV_DSTS.some(d => d[0] === path) ? path : null, bipolar = ["env", "pan", "pitch", "fine"].includes(k) || (k === "wamt");
    el.dataset.path = path;
    if (dst) { el.classList.add("modable"); el.dataset.dst = dst; }
    const getV = () => { const v = wvGet(path); return I ? (v - I[0]) / (I[1] - I[0]) : v; };
    const setV = v => {
      v = Math.max(0, Math.min(1, v));
      let x = I ? Math.round(I[0] + v * (I[1] - I[0])) : k === "pitch" ? Math.round((v - 0.5) * 48) / 48 + 0.5 : v;
      if (wvGet(path) === x) return; wvPut(path, x); paint(); if (opt.on) opt.on(x); wvChanged();
    };
    const paint = () => {
      const v = getV(), a = 135 + v * 270, c = bipolar && !(k === "wamt" && ![1, 4].includes(wvGet(path.split(".")[0] + ".warp"))) ? 270 : 135;
      el.querySelector(".t").setAttribute("d", arcD(17, 135, 405));
      el.querySelector(".v").setAttribute("d", Math.abs(a - c) < 0.5 ? "" : arcD(17, Math.min(a, c), Math.max(a, c)));
      let lo = 0, hi = 0; if (dst) wvModsOn(dst).forEach(m => { if (m.amt > 0) hi += m.amt; else lo += m.amt; });
      const m0 = 135 + Math.max(0, v + lo) * 270, m1 = 135 + Math.min(1, v + hi) * 270;
      el.querySelector(".m").setAttribute("d", m1 - m0 > 0.5 ? arcD(20.5, m0, m1) : "");
      el.classList.toggle("has-mod", hi - lo > 0);
      const shown = wvGet(path); el.querySelector("span").textContent = wvFmt(path, shown);
      el.setAttribute("aria-valuenow", Math.round(v * 100)); el.setAttribute("aria-valuetext", wvFmt(path, shown));
      el.classList.toggle("armable", !!(WV.arm && dst));
    };
    let pid = null, y0 = 0, v0 = 0, moved = false, modAmt = null;
    el.addEventListener("pointerdown", e => {
      pid = e.pointerId; el.setPointerCapture(pid); e.preventDefault(); el.focus({ preventScroll: true }); moved = false; y0 = e.clientY; v0 = getV(); modAmt = null;
      if (WV.arm && dst) { const m = WV.patch.mods.find(x => x.src === WV.arm && x.dst === dst && !x.via); modAmt = m ? m.amt : null; }
    });
    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return; const dy = (y0 - e.clientY) / (e.shiftKey ? 600 : 160); if (Math.abs(y0 - e.clientY) > 3) moved = true; if (!moved) return;
      if (WV.arm && dst) { const m = wvAssign(WV.arm, dst, true); m.amt = Math.max(-1, Math.min(1, Math.round(((modAmt ?? 0) + dy) * 100) / 100)); wvChanged(); wvPaintAll(); wvSay(wvSrcName(m.src) + " → " + wvDstName(dst) + ": " + Math.round(m.amt * 100) + "%"); return; }
      setV(v0 + dy);
    });
    const end = e => {
      if (e.pointerId !== pid) return; pid = null;
      if (!moved && WV.arm && dst) { const had = WV.patch.mods.some(x => x.src === WV.arm && x.dst === dst && !x.via); const m = wvAssign(WV.arm, dst); if (m) wvSay(had ? "Drag the knob up or down while " + wvSrcName(WV.arm) + " is lit to set how much." : wvSrcName(m.src) + " → " + wvDstName(dst) + " at " + Math.round(m.amt * 100) + "%. Drag the knob to set how much."); }
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", () => { if (WV.arm && dst) return; setV(I ? (WV_DEF(path) - I[0]) / (I[1] - I[0]) : WV_DEF(path)); });
    el.addEventListener("wheel", e => { e.preventDefault(); setV(getV() - Math.sign(e.deltaY) * (I ? 1 / (I[1] - I[0]) : 0.01)); }, { passive: false });
    el.addEventListener("keydown", e => {
      const st = I ? 1 / (I[1] - I[0]) : k === "pitch" ? 1 / 48 : 0.01;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") { setV(getV() + st); e.preventDefault(); }
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") { setV(getV() - st); e.preventDefault(); }
    });
    el.__paint = paint; WV.knobs.push(el); paint(); parent.appendChild(el);
    return el;
  }
  function wvSelect(parent, path, label, options, onSet) {
    const w = document.createElement("label"); w.className = "wv-sel"; w.innerHTML = "<span></span><select></select>";
    w.querySelector("span").textContent = label;
    const sel = w.querySelector("select"); sel.setAttribute("aria-label", label);
    options.forEach(([v, t]) => { const o = document.createElement("option"); o.value = String(v); o.textContent = t; sel.appendChild(o); });
    const num = typeof options[0][0] === "number";
    sel.value = String(wvGet(path));
    sel.addEventListener("change", () => { const v = num ? +sel.value : sel.value; wvPut(path, v); if (onSet) onSet(v); wvChanged(); });
    w.__paint = () => { sel.value = String(wvGet(path)); }; WV.knobs.push(w);
    parent.appendChild(w); return w;
  }
  function wvToggle(parent, path, label, onSet) {
    const b = document.createElement("button"); b.className = "btn wv-tog"; b.textContent = label;
    const paint = () => b.setAttribute("aria-pressed", String(!!wvGet(path)));
    b.addEventListener("click", () => { wvPut(path, !wvGet(path)); paint(); if (onSet) onSet(); wvChanged(); });
    b.__paint = paint; WV.knobs.push(b); paint(); parent.appendChild(b); return b;
  }
  const wvSrcName = s => (WV_SRCS.find(x => x[0] === s) || [s, s])[1].replace(/^M(\d)$/, (m, i) => "M" + i + " " + (WV.patch.macros[i - 1] || ""));
  const wvDstName = d => (WV_DSTS.find(x => x[0] === d) || [d, d])[1];
  function wvAssign(src, dst, silent) {
    let m = WV.patch.mods.find(x => x.src === src && x.dst === dst && !x.via);
    if (!m) {
      if (WV.patch.mods.length >= 16) { wvSay("The mod matrix is full (16). Remove one under Mod matrix."); return null; }
      m = { src, dst, amt: 0.3 }; WV.patch.mods.push(m); wvChanged(); wvPaintAll(); if (WV.sec === "mod") wvRender();
    }
    return m;
  }
  // ---------- the editor's layout ----------
  const WV_SECS = [["osc1", "Osc 1"], ["osc2", "Osc 2"], ["src", "Sub & noise"], ["filt", "Filters"], ["env", "Envelopes"], ["lfo", "LFOs"], ["mod", "Mod matrix"], ["mac", "Macros"]];
  let wvDock = null, wvBody = null, wvMsg = null;
  const wvSay = t => { if (wvMsg) { wvMsg.textContent = t; clearTimeout(wvSay.t); wvSay.t = setTimeout(() => { if (wvMsg) wvMsg.textContent = ""; }, 5000); } };
  function wvPaintAll() { WV.knobs = WV.knobs.filter(k => k.isConnected); WV.knobs.forEach(k => k.__paint && k.__paint()); wvDrawAll(); wvMacroLabels(); }
  function wvBuildDock() {
    if (wvDock) return;
    wvDock = document.createElement("div"); wvDock.className = "wv-dock"; wvDock.id = "wvDock"; wvDock.hidden = true;
    wvDock.innerHTML = `<div class="ed-card wv-card" role="dialog" aria-label="Natewave">
      <div class="wv-head">
        <button class="btn wv-pn" data-d="-1" aria-label="Previous sound">‹</button>
        <button class="btn wv-name" id="wvName" title="Natewave sounds"></button>
        <button class="btn wv-pn" data-d="1" aria-label="Next sound">›</button>
        <button class="btn" id="wvMutBtn" title="Change the sound a little, more, or a lot">Mutate</button>
        <button class="btn" id="wvUndo" title="Back to before the last change from Mutate or a sound" aria-label="Undo">↶</button>
        <span class="wv-sp"></span>
        <button class="btn primary" id="wvDone">Done</button>
      </div>
      <div class="wv-mut" id="wvMut" hidden>
        <div class="wv-mrow"><button class="btn" data-mut="0.06">Subtle</button><button class="btn" data-mut="0.16">Medium</button><button class="btn" data-mut="0.4">Wild</button></div>
        <div class="wv-mrow wv-locks"><small>Keep as is:</small></div>
      </div>
      <nav class="wv-nav" id="wvNav"></nav>
      <div class="wv-body" id="wvBody"></div>
      <div class="wv-msg" id="wvMsg" aria-live="polite"></div>
      <div class="wv-srcs" id="wvSrcs" aria-label="Modulation sources: drag one onto a knob, or tap one then tap knobs"></div>
    </div>`;
    document.body.appendChild(wvDock);
    wvBody = wvDock.querySelector("#wvBody"); wvMsg = wvDock.querySelector("#wvMsg");
    const nav = wvDock.querySelector("#wvNav");
    WV_SECS.forEach(([id, name]) => { const b = document.createElement("button"); b.className = "btn"; b.dataset.sec = id; b.textContent = name; b.addEventListener("click", () => { WV.sec = id; wvRender(); }); nav.appendChild(b); });
    wvDock.querySelector("#wvDone").addEventListener("click", wvClose);
    wvDock.querySelectorAll(".wv-pn").forEach(b => b.addEventListener("click", () => wvStep(+b.dataset.d)));
    wvDock.querySelector("#wvName").addEventListener("click", () => wvPresetList());
    wvDock.querySelector("#wvMutBtn").addEventListener("click", () => { const m = wvDock.querySelector("#wvMut"); m.hidden = !m.hidden; });
    wvDock.querySelectorAll("[data-mut]").forEach(b => b.addEventListener("click", () => wvMutate(+b.dataset.mut)));
    const locks = wvDock.querySelector(".wv-locks");
    [["osc1", "Osc 1"], ["osc2", "Osc 2"], ["src", "Sub & noise"], ["filt", "Filters"], ["env", "Envelopes"], ["lfo", "LFOs"], ["mod", "Mods"]].forEach(([id, n]) => {
      const b = document.createElement("button"); b.className = "btn wv-tog"; b.textContent = n; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { WV.locks[id] = !WV.locks[id]; b.setAttribute("aria-pressed", String(!!WV.locks[id])); }); locks.appendChild(b);
    });
    wvDock.querySelector("#wvUndo").addEventListener("click", () => { const p = WV.undo.pop(); if (!p) { wvSay("Nothing to undo."); return; } WV.patch = p; wvChanged(); wvRender(); wvSay("Back to before."); });
    // the sources: drag onto a knob, or tap to light one and tap knobs
    const srcs = wvDock.querySelector("#wvSrcs");
    WV_SRCS.forEach(([id, name]) => {
      const b = document.createElement("button"); b.className = "wv-src"; b.dataset.src = id; b.textContent = name; srcs.appendChild(b);
      let pid = null, sx = 0, sy = 0, ghost = null;
      b.addEventListener("pointerdown", e => { pid = e.pointerId; b.setPointerCapture(pid); sx = e.clientX; sy = e.clientY; e.preventDefault(); });
      b.addEventListener("pointermove", e => {
        if (e.pointerId !== pid) return;
        if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { ghost = document.createElement("div"); ghost.className = "wv-ghost"; ghost.textContent = name; document.body.appendChild(ghost); wvArm(id, true); }
        if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; }
      });
      const up = e => {
        if (e.pointerId !== pid) return; pid = null;
        if (ghost) {
          ghost.remove(); ghost = null;
          const hit = document.elementFromPoint(e.clientX, e.clientY), k = hit && hit.closest(".wvk.modable");
          if (k) { const m = wvAssign(id, k.dataset.dst); if (m) wvSay(wvSrcName(id) + " → " + wvDstName(k.dataset.dst) + " at " + Math.round(m.amt * 100) + "%. Tap " + wvSrcName(id) + ", then drag the knob to set how much."); }
          wvArm(null);
        } else wvArm(WV.arm === id ? null : id);
      };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
    });
    // the computer keyboard keeps playing notes while the editor is open (it's not a form)
    wvDock.addEventListener("keydown", e => { if (e.key === "Escape") { if (WV.arm) wvArm(null); else wvClose(); } });
  }
  function wvArm(id, quiet) {
    WV.arm = id; wvDock.classList.toggle("arming", !!id);
    wvDock.querySelectorAll(".wv-src").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.src === id)));
    if (id && !quiet) wvSay(wvSrcName(id) + " is lit: tap knobs to send it there (the lit knobs can take it), drag a knob to set how much. Tap it again when you're done.");
    wvPaintAll();
  }
  function wvOpen() {
    wvBuildDock(); wvDock.hidden = false; WV.open = true;
    const R = wvRec(); if (R && R.ready) R.node.port.postMessage({ t: "viz", on: true });
    wvRender(); wvAnim();
  }
  function wvClose() {
    if (!wvDock) return; wvDock.hidden = true; WV.open = false; wvArm(null);
    const R = wvRec(false); if (R && R.ready) R.node.port.postMessage({ t: "viz", on: false });
  }
  const wvH = (p, t) => { const h = document.createElement("div"); h.className = "wv-h"; h.textContent = t; p.appendChild(h); return h; };
  const wvRow = (p, cls = "") => { const r = document.createElement("div"); r.className = "wv-row " + cls; p.appendChild(r); return r; };
  function wvRender() {
    if (!wvDock) return;
    WV.knobs = [];
    wvDock.querySelector("#wvName").textContent = WV.patch.name || "Init";
    wvDock.querySelectorAll("#wvNav .btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sec === WV.sec)));
    wvBody.innerHTML = ""; wvBody.dataset.sec = WV.sec;
    const S = WV.sec;
    if (S === "osc1" || S === "osc2") {
      const k = S === "osc1" ? "o1" : "o2", o = WV.patch[k];
      const top = wvRow(wvBody, "wv-otop");
      wvToggle(top, k + ".on", "On", () => { if (o.on && o.level < 0.05) o.level = 0.7; wvRender(); });
      const tb = document.createElement("button"); tb.className = "btn wv-tbl"; tb.textContent = wtName(o.table) + " ▾"; tb.title = "Choose the wavetable";
      tb.addEventListener("click", () => wvTablePicker(k)); top.appendChild(tb);
      const cv = document.createElement("canvas"); cv.className = "wv-wt"; cv.dataset.osc = k; wvBody.appendChild(cv);
      const r1 = wvRow(wvBody, "wv-knobs");
      wvKnob(r1, k + ".pos", "Position"); wvSelect(r1, k + ".warp", "Warp", WV_WARPS.map((n, i) => [i, n]), v => { o.wamt = [1, 4].includes(v) ? 0.5 : 0; wvRender(); });
      wvKnob(r1, k + ".wamt", "Warp amt"); wvKnob(r1, k + ".pitch", "Pitch"); wvKnob(r1, k + ".fine", "Fine"); wvKnob(r1, k + ".level", "Level"); wvKnob(r1, k + ".pan", "Pan");
      const r2 = wvRow(wvBody, "wv-knobs");
      wvKnob(r2, k + ".uni", "Unison"); wvKnob(r2, k + ".det", "Detune"); wvKnob(r2, k + ".spread", "Width"); wvToggle(r2, k + ".rnd", "Free phase");
      if (typeof NB_LITE !== "undefined" && NB_LITE) { const n = document.createElement("small"); n.className = "wv-note"; n.textContent = "Lite plays up to 3 unison voices and 6 notes."; r2.appendChild(n); }
      wvDrawAll();
    } else if (S === "src") {
      wvH(wvBody, "Sub oscillator (one or two octaves down)");
      const r = wvRow(wvBody, "wv-knobs"); wvKnob(r, "sub.level", "Level"); wvSelect(r, "sub.oct", "Octave", [[1, "−1 octave"], [2, "−2 octaves"]]); wvSelect(r, "sub.shape", "Shape", [[0, "Sine"], [1, "Square"], [2, "Triangle"]]);
      wvH(wvBody, "Noise");
      const r2 = wvRow(wvBody, "wv-knobs"); wvKnob(r2, "noise.level", "Level"); wvKnob(r2, "noise.color", "Color");
    } else if (S === "filt") {
      const r0 = wvRow(wvBody); wvSelect(r0, "route", "Routing", [["serial", "Serial: 1 then 2"], ["parallel", "Parallel: 1 and 2 side by side"], ["split", "Split: Osc 1 → 1, the rest → 2"]]);
      for (const k of ["f1", "f2"]) {
        wvH(wvBody, k === "f1" ? "Filter 1" : "Filter 2");
        const r = wvRow(wvBody, "wv-knobs"); wvSelect(r, k + ".type", "Type", WV_FT, () => wvRender());
        if (WV.patch[k].type !== "off") { wvKnob(r, k + ".cut", WV.patch[k].type === "formant" ? "Vowel" : "Cutoff"); wvKnob(r, k + ".res", "Resonance"); wvKnob(r, k + ".drive", "Drive"); wvKnob(r, k + ".key", "Key track"); wvKnob(r, k + ".env", "Env 2 amt"); }
      }
    } else if (S === "env") {
      [["amp", "Amp: the volume of every note"], ["e2", "Env 2: moves the filters (Env 2 amt) and anything you send it to"], ["e3", "Env 3: free, for the mod matrix"]].forEach(([k, t]) => {
        wvH(wvBody, t); const r = wvRow(wvBody, "wv-knobs");
        wvKnob(r, k + ".a", "Attack"); wvKnob(r, k + ".d", "Decay"); wvKnob(r, k + ".s", "Sustain"); wvKnob(r, k + ".r", "Release"); if (k === "amp") wvKnob(r, "amp.level", "Volume");
      });
      wvH(wvBody, "Voices");
      const r = wvRow(wvBody, "wv-knobs"); wvSelect(r, "voice.mode", "Play", [["poly", "Poly"], ["mono", "Mono"], ["legato", "Legato (glides, no retrigger)"]]); wvKnob(r, "voice.glide", "Glide"); wvKnob(r, "voice.max", "Max notes");
    } else if (S === "lfo") {
      for (const k of ["l1", "l2", "l3"]) {
        wvH(wvBody, "LFO " + k.slice(1)); const r = wvRow(wvBody, "wv-knobs");
        wvSelect(r, k + ".shape", "Shape", WV_LSH.map((n, i) => [i, n])); wvKnob(r, k + ".rate", "Rate"); wvToggle(r, k + ".sync", "Tempo", () => wvPaintAll()); wvToggle(r, k + ".retrig", "Restart per note"); wvKnob(r, k + ".fade", "Fade in");
      }
    } else if (S === "mod") {
      const info = document.createElement("p"); info.className = "wv-info"; info.textContent = "Drag a source from the strip below onto any knob with a ring, or tap a source and tap knobs. Each line here: a source, where it goes, how much, and optionally another source that scales it (Via: e.g. a macro that sets how much an LFO moves).";
      wvBody.appendChild(info);
      const list = document.createElement("div"); list.className = "wv-mods"; wvBody.appendChild(list);
      WV.patch.mods.forEach((m, i) => {
        const r = document.createElement("div"); r.className = "wv-mod";
        const mk = (opts, val, set, lab) => { const s = document.createElement("select"); s.setAttribute("aria-label", lab); opts.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = val; s.addEventListener("change", () => { set(s.value); wvChanged(); wvPaintAll(); }); r.appendChild(s); return s; };
        mk(WV_SRCS.map(([v]) => [v, wvSrcName(v)]), m.src, v => { m.src = v; }, "Source");
        const ar = document.createElement("span"); ar.textContent = "→"; r.appendChild(ar);
        mk(WV_DSTS, m.dst, v => { m.dst = v; }, "Destination");
        const amt = document.createElement("input"); amt.type = "range"; amt.min = -100; amt.max = 100; amt.value = Math.round(m.amt * 100); amt.setAttribute("aria-label", "Amount");
        const out = document.createElement("output"); out.textContent = Math.round(m.amt * 100) + "%";
        amt.addEventListener("input", () => { m.amt = amt.value / 100; out.textContent = amt.value + "%"; wvChanged(); });
        r.append(amt, out);
        mk([["", "Via: —"], ...WV_SRCS.map(([v]) => [v, "Via " + wvSrcName(v)])], m.via || "", v => { if (v) m.via = v; else delete m.via; }, "Scaled by");
        const x = document.createElement("button"); x.className = "btn"; x.textContent = "✕"; x.setAttribute("aria-label", "Remove"); x.addEventListener("click", () => { WV.patch.mods.splice(i, 1); wvChanged(); wvRender(); });
        r.appendChild(x); list.appendChild(r);
      });
      if (!WV.patch.mods.length) { const e = document.createElement("p"); e.className = "wv-info"; e.textContent = "Nothing is modulated yet."; list.appendChild(e); }
      const add = document.createElement("button"); add.className = "btn"; add.textContent = "+ Add a line";
      add.addEventListener("click", () => { if (WV.patch.mods.length >= 16) { wvSay("16 is the most."); return; } WV.patch.mods.push({ src: "l1", dst: "o1.pos", amt: 0.3 }); wvChanged(); wvRender(); });
      wvBody.appendChild(add);
    } else if (S === "mac") {
      const info = document.createElement("p"); info.className = "wv-info"; info.textContent = "Eight macros, also on the main screen (and MIDI-learnable). Name one, then tap its M in the strip below and tap the knobs it should move.";
      wvBody.appendChild(info);
      const grid = document.createElement("div"); grid.className = "wv-macs"; wvBody.appendChild(grid);
      for (let i = 0; i < 8; i++) {
        const r = document.createElement("div"); r.className = "wv-mac"; grid.appendChild(r);
        const nm = document.createElement("input"); nm.type = "text"; nm.maxLength = 14; nm.value = WV.patch.macros[i]; nm.setAttribute("aria-label", "Macro " + (i + 1) + " name");
        nm.addEventListener("change", () => { WV.patch.macros[i] = nm.value.trim() || "Macro " + (i + 1); wvChanged(); wvMacroLabels(); });
        const fd = document.createElement("div"); fd.className = "wv-macknob";
        const src = "m" + (i + 1);
        makeKnob(fd, src, "M" + (i + 1), () => state.params.wave, () => {});
        const t = document.createElement("small"); t.textContent = WV.patch.mods.filter(m => m.src === src || m.via === src).map(m => (m.via === src ? wvSrcName(m.src) + " amount on " : "") + wvDstName(m.dst) + " " + (m.amt > 0 ? "+" : "") + Math.round(m.amt * 100) + "%").join(" · ") || "Not assigned";
        const col = document.createElement("div"); col.className = "wv-mcol"; col.append(nm, t); r.append(fd, col);
      }
    }
    wvPaintAll();
  }
  // ---------- the wavetable picture: every frame, with the one playing lit ----------
  function wvDraw(cv) {
    const k = cv.dataset.osc, o = WV.patch[k], T = wtGet(o.table), r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext("2d"); g.clearRect(0, 0, W, H);
    const F = T.F, step = Math.max(1, Math.round(F / 24)), w = W * 0.7, h = H * 0.24, ox = W * 0.04, oy = H * 0.7, dx = W * 0.24, dy = H * 0.44;
    const live = WV.viz && WV.open ? (k === "o1" ? WV.viz.p1 : WV.viz.p2) : null, pos = live != null ? live : o.pos;
    const line = (f, fr, fill) => {
      const a = (f * WT_LV) * WT_N, b = Math.min(F - 1, f + 1) * WT_LV * WT_N, x0 = ox + (f + fr) / Math.max(1, F - 1) * dx, y0 = oy - (f + fr) / Math.max(1, F - 1) * dy;
      g.beginPath();
      for (let i = 0; i <= 128; i++) { const n = Math.min(WT_N - 1, Math.round(i / 128 * WT_N)), v = T.data[a + n] + (T.data[b + n] - T.data[a + n]) * fr; const x = x0 + i / 128 * w, y = y0 - v * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      if (fill) { g.save(); g.lineTo(x0 + w, y0); g.lineTo(x0, y0); g.closePath(); g.fillStyle = fill; g.fill(); g.restore(); g.beginPath();
        for (let i = 0; i <= 128; i++) { const n = Math.min(WT_N - 1, Math.round(i / 128 * WT_N)), v = T.data[a + n] + (T.data[b + n] - T.data[a + n]) * fr; const x = x0 + i / 128 * w, y = y0 - v * h; i ? g.lineTo(x, y) : g.moveTo(x, y); } }
      g.stroke();
    };
    const p = pos * (F - 1), f0 = Math.min(F - 2, Math.floor(p)), fr = F > 1 ? p - f0 : 0;
    g.lineWidth = dpr;
    for (let f = F - 1; f >= 0; f -= step) { const near = Math.max(0, 1 - Math.abs(f - p) / 3); g.strokeStyle = `rgba(${180 + near * 60},${170 + near * 20},${220 - near * 60},${0.16 + near * 0.3})`; line(f, 0); }
    const lit = o.on === false ? "rgba(200,200,200,0.5)" : "#ffb65c";
    g.lineWidth = 2.4 * dpr; g.strokeStyle = lit; g.shadowColor = "rgba(255,182,92,0.6)"; g.shadowBlur = 8 * dpr;
    line(Math.max(0, f0), F > 1 ? fr : 0, "rgba(255,182,92,0.12)"); g.shadowBlur = 0;
    g.fillStyle = "rgba(220,215,240,0.7)"; g.font = `${11 * dpr}px ui-monospace, monospace`; g.fillText(wtName(o.table) + " · " + F + " frames", 6 * dpr, H - 6 * dpr);
  }
  const wvDrawAll = () => { if (wvDock && !wvDock.hidden) wvDock.querySelectorAll("canvas.wv-wt").forEach(wvDraw); };
  function wvAnim() { if (!WV.open) return; if (WV.viz) wvDrawAll(); setTimeout(() => requestAnimationFrame(wvAnim), 50); }
  // ---------- choosing a wavetable ----------
  function wvOverlay(title) {
    const ov = document.createElement("div"); ov.className = "wv-over";
    ov.innerHTML = `<div class="wv-oh"><b></b><button class="btn primary">Close</button></div><div class="wv-ol"></div>`;
    ov.querySelector("b").textContent = title; ov.querySelector(".btn").addEventListener("click", () => ov.remove());
    wvDock.querySelector(".wv-card").appendChild(ov); return ov;
  }
  function wvTablePicker(k) {
    const ov = wvOverlay("Wavetable for " + (k === "o1" ? "Osc 1" : "Osc 2")), L = ov.querySelector(".wv-ol");
    const pick = id => { WV.patch[k].table = id; wvChanged(); wvRender(); ov.remove(); };
    for (const cat of WT_CATS) {
      const items = cat === "Yours" ? Object.keys(WV_USER).map(id => [id, WV_USER[id].name]) : WT_DEFS.filter(d => d[2] === cat).map(d => [d[0], d[1]]);
      const h = document.createElement("div"); h.className = "wv-h"; h.textContent = cat; L.appendChild(h);
      const grid = document.createElement("div"); grid.className = "wv-grid"; L.appendChild(grid);
      items.forEach(([id, name]) => {
        const b = document.createElement("button"); b.className = "btn"; b.textContent = name; b.setAttribute("aria-pressed", String(WV.patch[k].table === id));
        b.addEventListener("click", () => pick(id)); grid.appendChild(b);
        if (cat === "Yours") { const x = document.createElement("button"); x.className = "btn wv-del"; x.textContent = "✕"; x.setAttribute("aria-label", "Delete " + name); x.addEventListener("click", () => { delete WV_USER[id]; WT.cache.delete(id); wvSaveUser(); ["o1", "o2"].forEach(o => { if (WV.patch[o].table === id) WV.patch[o].table = "basic"; }); wvChanged(); ov.remove(); wvTablePicker(k); }); grid.appendChild(x); }
      });
      if (cat === "Yours") { const b = document.createElement("button"); b.className = "btn"; b.textContent = "+ Make one from a sample…"; b.addEventListener("click", () => { ov.remove(); wvMaker(k); }); grid.appendChild(b); }
    }
  }
  // ---------- your own wavetables (and whole sounds) from a sample ----------
  function wvFrames(buf, start, len, F) {
    const sr = buf.sampleRate, ch = buf.numberOfChannels, n0 = Math.floor(start * buf.length), n = Math.max(2048, Math.floor(len * (buf.length - n0)));
    const x = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n && n0 + i < d.length; i++) x[i] += d[n0 + i] / ch; }
    // the period: autocorrelation over a window in the steady part
    const per = (() => {
      const w = Math.min(4096, x.length >> 1), o = Math.min(x.length - 2 * w, Math.floor(x.length * 0.25)), lo = Math.floor(sr / 1500), hi = Math.min(w, Math.floor(sr / 40));
      if (o < 0 || hi <= lo) return 0;
      let e0 = 0; for (let i = 0; i < w; i++) e0 += x[o + i] * x[o + i];
      if (e0 < 1e-6) return 0;
      let best = 0, bl = 0;
      for (let L = lo; L < hi; L++) { let s = 0, e1 = 0; for (let i = 0; i < w; i++) { s += x[o + i] * x[o + i + L]; e1 += x[o + i + L] * x[o + i + L]; } const r = s / Math.sqrt(e0 * e1 + 1e-12); if (r > best + 1e-3) { best = r; bl = L; } else if (best > 0.9 && r < best - 0.2) break; }
      return best > 0.75 ? bl : 0;
    })();
    const frames = [];
    for (let f = 0; f < F; f++) {
      const y = new Float64Array(WT_N), c = Math.floor(f / Math.max(1, F - 1) * (x.length - (per || 2048) - 1));
      if (per) {
        let s = c; for (let i = 0; i < per && s + 1 < x.length; i++, s++) if (x[s] <= 0 && x[s + 1] > 0) break;   // start on a rising zero crossing
        for (let i = 0; i < WT_N; i++) { const p = s + i / WT_N * per, i0 = Math.floor(p), fr = p - i0; y[i] = (x[i0] || 0) + ((x[i0 + 1] || 0) - (x[i0] || 0)) * fr; }
      } else {
        for (let i = 0; i < WT_N; i++) y[i] = x[Math.min(x.length - 1, c + i)] || 0;
        for (let i = 0; i < 128; i++) { const g = i / 128; y[i] *= g; y[WT_N - 1 - i] *= g; }   // (no pitch: soften the loop point)
      }
      frames.push(y);
    }
    return { frames, per, x, sr };
  }
  function wvMaker(k) {
    const ov = wvOverlay("Make a wavetable from a sample"), L = ov.querySelector(".wv-ol");
    const slots = state.samp.slots.map((s, i) => [i, s]).filter(([i]) => sampBuf[i]);
    if (!slots.length) { const p = document.createElement("p"); p.className = "wv-info"; p.textContent = "Load or record a sample in the Sampler (Smp tab) first; any sound works: a voice, a synth, a field recording."; L.appendChild(p); return; }
    const opt = { slot: slots[0][0], start: 0, len: 1, F: 16 };
    L.innerHTML = `<p class="wv-info">Natewave cuts the sample into single cycles from start to end (or, for sounds without a pitch, short slices), and Position scans through them. <b>Make a sound</b> also copies how the sample starts, fades and changes into the envelopes and filter.</p>
      <div class="wv-form"><label>Sample <select data-o="slot"></select></label><label>Start <input type="range" min="0" max="95" value="0" data-o="start"></label>
      <label>Length <input type="range" min="5" max="100" value="100" data-o="len"></label><label>Frames <select data-o="F"><option>8</option><option selected>16</option><option>32</option></select></label></div>
      <div class="wv-row"><button class="btn" data-go="table">Make a wavetable</button><button class="btn primary" data-go="sound">Make a sound</button></div><p class="wv-info" data-st></p>`;
    const sel = L.querySelector('[data-o="slot"]');
    slots.forEach(([i, s]) => { const o = document.createElement("option"); o.value = i; o.textContent = "S" + (i + 1) + " · " + (s.name || "sample"); sel.appendChild(o); });
    L.querySelectorAll("[data-o]").forEach(el => el.addEventListener("input", () => { const v = el.value; opt[el.dataset.o] = el.dataset.o === "start" || el.dataset.o === "len" ? v / 100 : +v; }));
    const st = L.querySelector("[data-st]");
    L.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
      const buf = sampBuf[opt.slot]; if (!buf) return;
      const r = wvFrames(buf, opt.start, opt.len, opt.F), name = (state.samp.slots[opt.slot].name || "Sample").replace(/\.[a-z0-9]+$/i, "").replace(/\s*\([^)]*\)\s*$/, "").slice(0, 26);
      const id = "u" + Date.now().toString(36);
      WV_USER[id] = { name, frames: r.frames };
      const ids = Object.keys(WV_USER); while (ids.length > 6) { const old = ids.shift(); if (old !== WV.patch.o1.table && old !== WV.patch.o2.table) { delete WV_USER[old]; WT.cache.delete(old); } }
      if (!wvSaveUser()) st.textContent = "Made it, but there's no room left to keep it after a reload. Delete one of your wavetables.";
      WV.undo.push(JSON.parse(JSON.stringify(WV.patch))); if (WV.undo.length > 30) WV.undo.shift();
      WV.patch[k].table = id; WV.patch[k].on = true; if (WV.patch[k].level < 0.3) WV.patch[k].level = 0.8; WV.patch[k].warp = 0; WV.patch[k].wamt = 0;
      if (b.dataset.go === "sound") wvMatch(k, r, name);
      wvChanged(); WV.sec = k === "o1" ? "osc1" : "osc2"; ov.remove(); wvRender();
      wvSay((r.per ? "Found its pitch (" + (r.sr / r.per).toFixed(1) + " Hz): each frame is one cycle." : "No steady pitch, so each frame is a short slice.") + (b.dataset.go === "sound" ? " The envelopes, filter and Env 3 → Position follow the sample." : " Play it, and move Position."));
    }));
  }
  // a starting patch that behaves like the sample: loudness over time → the amp envelope, brightness over time → the
  // filter and Env 2, its frames scanned by Env 3 over the sample's own length, noise → the noise level
  function wvMatch(k, r, name) {
    const { x, sr } = r, hop = Math.round(sr * 0.01), env = [], cen = [], flat = [];
    for (let i = 0; i + hop <= x.length; i += hop) {
      let e = 0, zc = 0, d = 0; for (let j = i; j < i + hop; j++) { e += x[j] * x[j]; if (j > i && (x[j] > 0) !== (x[j - 1] > 0)) zc++; d += Math.abs(x[j] - (x[j - 1] || 0)); }
      env.push(Math.sqrt(e / hop)); cen.push(zc / hop * sr / 2); flat.push(d / (Math.sqrt(e / hop) * hop + 1e-9));
    }
    const P = WV.patch, pk = Math.max(...env), pi = env.indexOf(pk), dur = env.length * 0.01;
    const inv = (t, f) => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(m) < t) lo = m; else hi = m; } return (lo + hi) / 2; };
    let a10 = env.findIndex(v => v > pk * 0.1); if (a10 < 0) a10 = 0;
    const att = Math.max(0.001, (pi - a10) * 0.01);
    const tail = env.slice(pi), mid = tail.slice(Math.floor(tail.length * 0.3), Math.floor(tail.length * 0.7)).sort((a, b) => a - b), sus = mid.length ? mid[mid.length >> 1] / pk : 0;
    const lastLoud = env.length - 1 - [...env].reverse().findIndex(v => v > pk * 0.05), endsQuiet = env[env.length - 1] < pk * 0.05;
    let d37 = tail.findIndex(v => v < sus * pk + (pk - sus * pk) * 0.37); if (d37 < 0) d37 = tail.length;
    P.amp.a = inv(att, aT); P.amp.s = Math.min(1, Math.max(0, sus)); P.amp.d = inv(Math.max(0.02, d37 * 0.01 * 2.2), rT);
    P.amp.r = endsQuiet && sus < 0.2 ? inv(Math.max(0.05, (lastLoud - pi) * 0.01 * 0.5), rT) : inv(0.35, rT);
    const early = cen.slice(pi, pi + 10), late = cen.slice(Math.floor(cen.length * 0.6)), avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const cE = avg(early) || 2000, cL = avg(late) || cE, loud = env.map(v => v > pk * 0.1), fl = avg(flat.filter((v, i) => loud[i]));
    P.f1.type = "ladder"; P.f1.res = 0.1; P.f1.key = 0.5; P.f1.drive = 0.05;
    P.f1.cut = Math.max(0.3, Math.min(1, Math.log2(Math.max(200, cL * 4) / 20) / 9.966));
    const fall = Math.log2(Math.max(1, cE / Math.max(1, cL)));
    P.f1.env = Math.min(1, 0.5 + fall * 0.12); P.e2 = { a: 0, d: P.amp.d, s: 0, r: P.amp.r };
    P.noise.level = r.per ? 0 : Math.min(0.5, Math.max(0, (fl - 0.6) * 0.4)); P.noise.color = 0.6;
    P.mods = P.mods.filter(m => !(m.dst === k + ".pos" && (m.src === "e3" || m.src === "l1")));
    P[k].pos = 0; P.e3 = { a: inv(Math.max(0.05, Math.min(10, dur * 0.85)), aT), d: 0.5, s: 1, r: P.amp.r };
    P.mods.push({ src: "e3", dst: k + ".pos", amt: 1 });
    P.name = name; P.voice.mode = "poly";
  }
  // ---------- the sounds that come with it ----------
  const WV_PRESETS = [
    // [name, what it is, patch (over Init), macro positions]
    ["Glass Arp", "bell-glass pluck, made to arpeggiate", { o1: { table: "fmbell", pos: 0.35, warp: 0 }, o2: { on: true, table: "glass", pos: 0.6, level: 0.45, pitch: 0.75 }, f1: { type: "lp12", cut: 0.7, res: 0.2, env: 0.75 }, amp: { a: 0, d: 0.38, s: 0, r: 0.4, level: 0.85 }, e2: { a: 0, d: 0.32, s: 0, r: 0.3 },
      mods: [{ src: "m1", dst: "f1.cut", amt: 0.3 }, { src: "e2", dst: "o1.pos", amt: 0.4 }, { src: "m2", dst: "o1.pos", amt: 0.5 }, { src: "vel", dst: "f1.cut", amt: 0.2 }], macros: ["Bright", "Metal", "Macro 3", "Macro 4"] }, [0.4, 0.2]],
    ["Vowel Pad", "a choir that moves through its vowels", { o1: { table: "vowels", pos: 0, uni: 4, det: 0.3, spread: 0.8, warp: 0 }, o2: { on: true, table: "choir", pos: 0.3, uni: 2, level: 0.5, pitch: 0.75 }, f1: { type: "lp12", cut: 0.68, res: 0.1, env: 0.5 }, amp: { a: 0.62, d: 0.6, s: 0.9, r: 0.7 },
      l1: { shape: 6, rate: 0.28 }, mods: [{ src: "l1", dst: "o1.pos", amt: 0.45, via: "m2" }, { src: "m1", dst: "f1.cut", amt: 0.3 }, { src: "l2", dst: "o2.pos", amt: 0.3 }, { src: "m3", dst: "o1.det", amt: 0.4 }], macros: ["Bright", "Vowels", "Width", "Macro 4"] }, [0.3, 0.7, 0.2]],
    ["Growl Bass", "talking dubstep bass: the mod wheel opens its mouth", { o1: { table: "growlv", pos: 0.2, warp: 7, wamt: 0.2 }, sub: { level: 0.55 }, f1: { type: "ladder", cut: 0.52, res: 0.35, drive: 0.35, env: 0.5 }, amp: { a: 0, d: 0.5, s: 0.9, r: 0.2 }, voice: { mode: "legato", glide: 0.18 },
      mods: [{ src: "wheel", dst: "o1.pos", amt: 0.8 }, { src: "m1", dst: "o1.wamt", amt: 0.6 }, { src: "l1", dst: "o1.pos", amt: 0.4, via: "m2" }, { src: "m2", dst: "f1.cut", amt: 0.25 }], l1: { sync: true, rate: 0.75, shape: 0 }, macros: ["Grit", "Wobble", "Macro 3", "Macro 4"] }, [0.3, 0], -1],
    ["Wobble Bass", "LFO in time with the tempo; Rate macro picks the beat", { o1: { table: "wobblev", pos: 0, uni: 2, det: 0.15 }, sub: { level: 0.6, shape: 1 }, f1: { type: "ladder", cut: 0.45, res: 0.45, drive: 0.3, env: 0.5 }, l1: { sync: true, rate: 0.75, shape: 0, retrig: true },
      amp: { a: 0, d: 0.5, s: 1, r: 0.18 }, voice: { mode: "mono", glide: 0.1 }, mods: [{ src: "l1", dst: "f1.cut", amt: 0.35, via: "m1" }, { src: "l1", dst: "o1.pos", amt: 0.8, via: "m1" }, { src: "m2", dst: "l1.rate", amt: 0.2 }, { src: "m3", dst: "f1.drive", amt: 0.5 }], macros: ["Wobble", "Faster", "Dirt", "Macro 4"] }, [0.8, 0, 0.2], -1],
    ["Reese", "two detuned basses rubbing: drum & bass", { o1: { table: "reese", pos: 0.3, uni: 3, det: 0.32, spread: 0.4 }, o2: { on: true, table: "sawfade", pos: 0.9, level: 0.6, fine: 0.53 }, sub: { level: 0.5 }, f1: { type: "ladder", cut: 0.5, res: 0.15, drive: 0.4, env: 0.5 },
      amp: { a: 0, d: 0.5, s: 1, r: 0.25 }, voice: { mode: "mono", glide: 0.12 }, l2: { rate: 0.2 }, mods: [{ src: "l2", dst: "o1.pos", amt: 0.25 }, { src: "m1", dst: "f1.cut", amt: 0.35 }, { src: "m2", dst: "o1.det", amt: 0.3 }], macros: ["Open", "Rub", "Macro 3", "Macro 4"] }, [0.2, 0.3], -1],
    ["Supersaw XL", "seven-voice saws on both oscillators", { o1: { table: "basic", pos: 0.66, uni: 7, det: 0.42, spread: 0.9, warp: 0 }, o2: { on: true, table: "sawpair", pos: 0.4, uni: 5, det: 0.35, spread: 0.9, level: 0.55, pitch: 0.75 }, f1: { type: "lp12", cut: 0.82, res: 0.08, env: 0.55 },
      amp: { a: 0.08, d: 0.5, s: 0.85, r: 0.45 }, mods: [{ src: "m1", dst: "f1.cut", amt: 0.18 }, { src: "m2", dst: "o1.det", amt: 0.35 }, { src: "m2", dst: "o2.det", amt: 0.35 }], macros: ["Bright", "Wide", "Macro 3", "Macro 4"] }, [0.5, 0.2]],
    ["Hoover XL", "rave hoover with a pitch dive", { o1: { table: "hoover", pos: 0.5, uni: 5, det: 0.45, spread: 0.7 }, o2: { on: true, table: "pulse", pos: 0.3, level: 0.5, pitch: 0.25, uni: 3 }, f1: { type: "lp12", cut: 0.85, res: 0.05 }, amp: { a: 0.05, d: 0.6, s: 0.9, r: 0.45 },
      e3: { a: 0, d: 0.4, s: 0, r: 0.3 }, mods: [{ src: "e3", dst: "o1.pitch", amt: -0.06 }, { src: "e3", dst: "o2.pitch", amt: -0.06 }, { src: "l1", dst: "o1.pos", amt: 0.25 }, { src: "m1", dst: "o1.det", amt: 0.3 }], macros: ["Width", "Macro 2", "Macro 3", "Macro 4"] }, [0.3]],
    ["PPG Strings", "classic digital strings, slow scan", { o1: { table: "strings", pos: 0.3, uni: 3, det: 0.25, spread: 0.8 }, o2: { on: true, table: "build", pos: 0.4, level: 0.5, uni: 2, fine: 0.47 }, f1: { type: "lp12", cut: 0.7, res: 0.05 }, amp: { a: 0.55, d: 0.6, s: 0.9, r: 0.62 },
      l1: { shape: 1, rate: 0.22, retrig: false }, mods: [{ src: "l1", dst: "o1.pos", amt: 0.35 }, { src: "l2", dst: "o2.pos", amt: 0.3 }, { src: "m1", dst: "f1.cut", amt: 0.25 }], macros: ["Bright", "Macro 2", "Macro 3", "Macro 4"] }, [0.3]],
    ["Sync Lead", "hard-sync sweep on every note", { o1: { table: "syncsaw", pos: 0, uni: 2, det: 0.2 }, f1: { type: "lp12", cut: 0.8, res: 0.15 }, e3: { a: 0, d: 0.45, s: 0.2, r: 0.3 }, amp: { a: 0, d: 0.5, s: 0.85, r: 0.3 }, voice: { mode: "legato", glide: 0.15 },
      mods: [{ src: "e3", dst: "o1.pos", amt: 0.8 }, { src: "m1", dst: "o1.pos", amt: 0.5 }, { src: "wheel", dst: "o1.pos", amt: 0.4 }], macros: ["Sync", "Macro 2", "Macro 3", "Macro 4"] }, [0]],
    ["Formant Lead", "a lead that talks through a vowel filter", { o1: { table: "sawfade", pos: 1, uni: 2, det: 0.2 }, f1: { type: "formant", cut: 0.2, res: 0.5 }, f2: { type: "lp12", cut: 0.85 }, amp: { a: 0.02, d: 0.5, s: 0.9, r: 0.3 }, voice: { mode: "legato", glide: 0.12 },
      l1: { rate: 0.5, fade: 0.5 }, mods: [{ src: "m1", dst: "f1.cut", amt: 0.8 }, { src: "l1", dst: "f1.cut", amt: 0.3, via: "wheel" }, { src: "press", dst: "f1.cut", amt: 0.4 }], macros: ["Vowel", "Macro 2", "Macro 3", "Macro 4"] }, [0.3]],
    ["Deep Sub", "near-sine sub bass", { o1: { table: "subharm", pos: 0.2 }, sub: { level: 0.4 }, f1: { type: "ladder", cut: 0.4, res: 0.05, env: 0.5 }, amp: { a: 0, d: 0.5, s: 1, r: 0.2 }, voice: { mode: "mono", glide: 0.08 },
      mods: [{ src: "m1", dst: "o1.pos", amt: 0.8 }, { src: "m1", dst: "f1.cut", amt: 0.2 }], macros: ["Harmonics", "Macro 2", "Macro 3", "Macro 4"] }, [0.1], -1],
    ["Digital Pluck", "short and bright, scans as it fades", { o1: { table: "digi3", pos: 0.1, uni: 2, det: 0.15 }, f1: { type: "lp12", cut: 0.6, res: 0.25, env: 0.8 }, amp: { a: 0, d: 0.36, s: 0, r: 0.36 }, e2: { a: 0, d: 0.3, s: 0, r: 0.3 },
      mods: [{ src: "e2", dst: "o1.pos", amt: 0.6 }, { src: "m1", dst: "o1.pos", amt: 0.5 }, { src: "rand", dst: "o1.pos", amt: 0.1 }], macros: ["Tone", "Macro 2", "Macro 3", "Macro 4"] }, [0.2]],
    ["Evolving Pad", "three slow LFOs, never the same twice", { o1: { table: "stack2", pos: 0.2, uni: 3, det: 0.3, spread: 0.9 }, o2: { on: true, table: "phaser", pos: 0.5, level: 0.5, uni: 2, pitch: 0.75 }, noise: { level: 0.12, color: 0.75 }, f1: { type: "lp12", cut: 0.62, res: 0.2 },
      amp: { a: 0.7, d: 0.6, s: 0.9, r: 0.75 }, l1: { shape: 6, rate: 0.15 }, l2: { shape: 0, rate: 0.12 }, l3: { shape: 6, rate: 0.2 },
      mods: [{ src: "l1", dst: "o1.pos", amt: 0.5 }, { src: "l2", dst: "o2.pos", amt: 0.5 }, { src: "l3", dst: "f1.cut", amt: 0.15 }, { src: "m1", dst: "f1.cut", amt: 0.25 }, { src: "m2", dst: "l1.rate", amt: 0.3 }], macros: ["Bright", "Speed", "Macro 3", "Macro 4"] }, [0.3, 0.1]],
    ["FM Keys", "electric piano: harder is brighter", { o1: { table: "epiano", pos: 0.2 }, o2: { on: true, table: "basic", pos: 0, level: 0.35, pitch: 0.75 }, f1: { type: "lp12", cut: 0.75, res: 0.05, env: 0.6 }, amp: { a: 0, d: 0.55, s: 0.25, r: 0.4 }, e2: { a: 0, d: 0.42, s: 0.1, r: 0.4 },
      mods: [{ src: "vel", dst: "o1.pos", amt: 0.5 }, { src: "e2", dst: "o1.pos", amt: 0.25 }, { src: "m1", dst: "o1.pos", amt: 0.4 }, { src: "l1", dst: "o1.pitch", amt: 0.003, via: "wheel" }], l1: { rate: 0.55 }, macros: ["Tine", "Macro 2", "Macro 3", "Macro 4"] }, [0.2]],
    ["Acid Square", "squelchy mono line with glide", { o1: { table: "acid", pos: 0.2 }, f1: { type: "ladder", cut: 0.35, res: 0.75, drive: 0.4, env: 0.85 }, amp: { a: 0, d: 0.5, s: 0.8, r: 0.15 }, e2: { a: 0, d: 0.3, s: 0, r: 0.2 }, voice: { mode: "legato", glide: 0.22 },
      mods: [{ src: "m1", dst: "f1.cut", amt: 0.4 }, { src: "m2", dst: "f1.res", amt: 0.2 }, { src: "e2", dst: "o1.pos", amt: 0.5 }], macros: ["Cutoff", "Squelch", "Macro 3", "Macro 4"] }, [0.2, 0.3], -1],
    ["Neuro", "folded FM bass, macro 1 tears it open", { o1: { table: "neuro", pos: 0.3, warp: 7, wamt: 0.1 }, o2: { on: true, table: "basic", pos: 0, level: 0, warp: 0 }, sub: { level: 0.5 }, f1: { type: "ladder", cut: 0.55, res: 0.3, drive: 0.5 }, f2: { type: "comb+", cut: 0.4, res: 0.3 }, route: "serial",
      amp: { a: 0, d: 0.5, s: 1, r: 0.2 }, voice: { mode: "mono", glide: 0.06 }, l1: { sync: true, rate: 0.85, shape: 6 },
      mods: [{ src: "m1", dst: "o1.wamt", amt: 0.7 }, { src: "m1", dst: "o1.pos", amt: 0.5 }, { src: "l1", dst: "f2.cut", amt: 0.4, via: "m2" }, { src: "m2", dst: "f2.res", amt: 0.4 }], macros: ["Tear", "Metal", "Macro 3", "Macro 4"] }, [0.2, 0], -1],
    ["Choir Ahh", "soft choir, vowels on the mod wheel", { o1: { table: "choir", pos: 0, uni: 4, det: 0.25, spread: 0.7 }, o2: { on: true, table: "vowelssop", pos: 0, level: 0.4, uni: 3, pitch: 0.75 }, noise: { level: 0.1, color: 0.7 }, f1: { type: "lp12", cut: 0.66 }, amp: { a: 0.55, d: 0.6, s: 0.95, r: 0.65 },
      l1: { rate: 0.45, fade: 0.6 }, mods: [{ src: "wheel", dst: "o1.pos", amt: 1 }, { src: "wheel", dst: "o2.pos", amt: 0.8 }, { src: "l1", dst: "o1.pitch", amt: 0.003 }, { src: "m1", dst: "f1.cut", amt: 0.25 }], macros: ["Air", "Macro 2", "Macro 3", "Macro 4"] }, [0.2]],
    ["Bell Tower", "big inharmonic bells with a long tail", { o1: { table: "bellcyc", pos: 0.8 }, o2: { on: true, table: "fmbell", pos: 0.6, level: 0.5, pitch: 0.75 + 7 / 48 - 0.25 }, f1: { type: "lp12", cut: 0.85, res: 0.1, env: 0.6 }, amp: { a: 0, d: 0.75, s: 0, r: 0.75 }, e2: { a: 0, d: 0.6, s: 0, r: 0.6 },
      mods: [{ src: "e2", dst: "o1.pos", amt: -0.5 }, { src: "m1", dst: "o2.level", amt: 0.4 }, { src: "vel", dst: "f1.cut", amt: 0.2 }], macros: ["Shimmer", "Macro 2", "Macro 3", "Macro 4"] }, [0.3]],
    ["Laser Lead", "a single harmonic sweeping up", { o1: { table: "laser", pos: 0.3, uni: 2, det: 0.1 }, f1: { type: "lp12", cut: 0.9 }, e3: { a: 0, d: 0.35, s: 0.3, r: 0.3 }, amp: { a: 0, d: 0.5, s: 0.9, r: 0.3 }, voice: { mode: "legato", glide: 0.1 },
      mods: [{ src: "e3", dst: "o1.pos", amt: 0.6 }, { src: "m1", dst: "o1.pos", amt: 0.4 }, { src: "l1", dst: "o1.pitch", amt: 0.004, via: "wheel" }], macros: ["Height", "Macro 2", "Macro 3", "Macro 4"] }, [0.2]],
    ["Robot Voice", "talking square, vowels follow the keys", { o1: { table: "robot", pos: 0 }, f1: { type: "lp12", cut: 0.75, res: 0.2 }, amp: { a: 0.01, d: 0.5, s: 0.9, r: 0.25 }, mods: [{ src: "key", dst: "o1.pos", amt: 0.6 }, { src: "l1", dst: "o1.pos", amt: 0.25, via: "m1" }, { src: "rand", dst: "o1.pos", amt: 0.15 }], macros: ["Chatter", "Macro 2", "Macro 3", "Macro 4"] }, [0.4]],
    ["Dust Drone", "noisy texture for the background", { o1: { table: "grit", pos: 0.3, level: 1 }, o2: { on: true, table: "air", pos: 0.5, level: 0.7 }, noise: { level: 0.25, color: 0.3 }, f1: { type: "bp", cut: 0.55, res: 0.4, drive: 0.3 }, amp: { a: 0.62, d: 0.6, s: 1, r: 0.8, level: 1 },
      l1: { shape: 6, rate: 0.12 }, l2: { shape: 6, rate: 0.18 }, mods: [{ src: "l1", dst: "f1.cut", amt: 0.25 }, { src: "l2", dst: "o1.pos", amt: 0.6 }, { src: "m1", dst: "f1.cut", amt: 0.3 }], macros: ["Band", "Macro 2", "Macro 3", "Macro 4"] }, [0.3]],
    ["Comb Keys", "plucked comb-filter keys", { o1: { table: "pulse", pos: 0.5 }, noise: { level: 0.35, color: 0.6 }, f1: { type: "comb+", cut: 0.45, res: 0.85, key: 1 }, f2: { type: "lp12", cut: 0.75 }, amp: { a: 0, d: 0.5, s: 0, r: 0.45 },
      mods: [{ src: "m1", dst: "f1.res", amt: 0.1 }, { src: "vel", dst: "noise.level", amt: 0.2 }], macros: ["Ring", "Macro 2", "Macro 3", "Macro 4"] }, [0.3]],
    ["CZ Brass", "phase-distortion brass swell", { o1: { table: "czsaw", pos: 0.2, uni: 2, det: 0.15 }, o2: { on: true, table: "czsquare", pos: 0.3, level: 0.4 }, f1: { type: "lp12", cut: 0.8, res: 0.1 }, amp: { a: 0.3, d: 0.5, s: 0.85, r: 0.35 }, e2: { a: 0.35, d: 0.5, s: 0.5, r: 0.4 },
      mods: [{ src: "e2", dst: "o1.pos", amt: 0.5 }, { src: "e2", dst: "o2.pos", amt: 0.5 }, { src: "m1", dst: "o1.pos", amt: 0.4 }, { src: "vel", dst: "o1.pos", amt: 0.2 }], macros: ["Brass", "Macro 2", "Macro 3", "Macro 4"] }, [0.2]],
    ["Shepard Rise", "a tone that seems to climb forever", { o1: { table: "shepard", pos: 0 }, o2: { on: true, table: "shepard", pos: 0.5, level: 0.8 }, f1: { type: "lp12", cut: 0.9 }, amp: { a: 0.4, d: 0.6, s: 1, r: 0.6 }, l1: { shape: 2, rate: 0.12, retrig: false }, l2: { shape: 2, rate: 0.12, retrig: false },
      mods: [{ src: "l1", dst: "o1.pos", amt: 1 }, { src: "l2", dst: "o2.pos", amt: 1 }, { src: "m1", dst: "l1.rate", amt: 0.3 }, { src: "m1", dst: "l2.rate", amt: 0.3 }], macros: ["Speed", "Macro 2", "Macro 3", "Macro 4"] }, [0]],
  ];
  // a preset → the patch (and the macro positions, which live with the main screen's knobs)
  function wvPresetPatch(i) {
    const [name, sub, p] = WV_PRESETS[i], P = wvFill(p); P.name = name;
    P.o1 = Object.assign(wvOsc({}), wvInit().o1, { warp: 0, wamt: 0 }, p.o1 || {}); P.o2 = Object.assign(wvOsc({ level: 0, on: false }), p.o2 || {});
    if (p.o2 && p.o2.on && p.o2.level == null) P.o2.level = 0.6;
    P.macros = (p.macros || []).concat(["Macro 1", "Macro 2", "Macro 3", "Macro 4", "Macro 5", "Macro 6", "Macro 7", "Macro 8"].slice((p.macros || []).length));
    return P;
  }
  function wvLoadPreset(i, quiet) {
    WV.undo.push(JSON.parse(JSON.stringify(WV.patch))); if (WV.undo.length > 30) WV.undo.shift();
    WV.patch = wvPresetPatch(i); WV.cur = i;
    const mac = WV_PRESETS[i][3] || []; for (let m = 0; m < 8; m++) state.params.wave["m" + (m + 1)] = mac[m] || 0;
    wvChanged(); if (!quiet) { wvRender(); renderEngine(); save(); }
  }
  function wvStep(d) { const n = WV_PRESETS.length, i = WV.cur == null ? (d > 0 ? 0 : n - 1) : (WV.cur + d + n) % n; wvLoadPreset(i); if (ctx) { const t = ctx.currentTime + 0.02; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.6)); } }
  function wvPresetList() {
    const ov = wvOverlay("Natewave sounds"), L = ov.querySelector(".wv-ol"), grid = document.createElement("div"); grid.className = "wv-plist"; L.appendChild(grid);
    WV_PRESETS.forEach(([n, sub], i) => {
      const b = document.createElement("button"); b.className = "btn wv-pre"; b.innerHTML = "<b></b><small></small>"; b.querySelector("b").textContent = n; b.querySelector("small").textContent = sub;
      b.setAttribute("aria-pressed", String(WV.cur === i)); b.addEventListener("click", () => { wvLoadPreset(i); ov.remove(); if (ctx) { const t = ctx.currentTime + 0.02; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.6)); } }); grid.appendChild(b);
    });
    const ini = document.createElement("button"); ini.className = "btn"; ini.textContent = "Start from Init"; ini.addEventListener("click", () => { WV.undo.push(JSON.parse(JSON.stringify(WV.patch))); WV.patch = wvFill(null); WV.cur = null; for (let m = 0; m < 8; m++) state.params.wave["m" + (m + 1)] = 0; wvChanged(); wvRender(); renderEngine(); save(); ov.remove(); });
    L.appendChild(ini);
  }
  // ---------- Mutate: small, medium or wild changes, sections you lock stay as they are ----------
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function wvMutate(amt) {
    WV.undo.push(JSON.parse(JSON.stringify(WV.patch))); if (WV.undo.length > 30) WV.undo.shift();
    const P = WV.patch, L = WV.locks, wild = amt >= 0.3, med = amt >= 0.1;
    const nud = (o, k, lo = 0, hi = 1) => { if (typeof o[k] !== "number") return; o[k] = Math.max(lo, Math.min(hi, o[k] + gauss() * amt)); };
    const sameCat = id => { const d = WT_DEFS.find(x => x[0] === id), pool = WT_DEFS.filter(x => !d || wild || x[2] === d[2]); return pool[Math.floor(Math.random() * pool.length)][0]; };
    [["osc1", "o1"], ["osc2", "o2"]].forEach(([sec, k]) => {
      if (L[sec]) return; const o = P[k]; if (!o.on && !wild) return;
      ["pos", "det", "spread"].forEach(x => nud(o, x)); if (o.warp) nud(o, "wamt");
      if (med && Math.random() < (wild ? 0.4 : 0.15)) o.table = sameCat(o.table);
      if (wild && Math.random() < 0.3) { o.warp = Math.floor(Math.random() * WV_WARPS.length); o.wamt = [1, 4].includes(o.warp) ? 0.5 + gauss() * 0.2 : Math.random() * 0.5; }
      if (wild && Math.random() < 0.25) o.pitch = 0.5 + [0, 0, 12, -12, 7, 19][Math.floor(Math.random() * 6)] / 48;
      if (o.on) o.level = Math.max(0.3, Math.min(1, o.level + gauss() * amt * 0.5));
    });
    if (!L.src) { nud(P.sub, "level", 0, 0.8); nud(P.noise, "level", 0, 0.5); nud(P.noise, "color"); }
    if (!L.filt) {
      ["f1", "f2"].forEach(k => { const f = P[k]; if (f.type === "off") return; nud(f, "cut", 0.25, 1); nud(f, "res", 0, Math.max(0.85, f.res)); nud(f, "drive", 0, 0.8); nud(f, "env"); });
      if (wild && Math.random() < 0.3) P.f1.type = ["ladder", "lp12", "bp", "formant", "comb+"][Math.floor(Math.random() * 5)];
    }
    if (!L.env) {
      ["amp", "e2", "e3"].forEach(k => { const e = P[k]; nud(e, "a", 0, Math.max(0.6, e.a)); nud(e, "d"); nud(e, "s", k === "amp" ? 0.1 : 0, 1); nud(e, "r", 0, Math.max(0.75, e.r)); });
    }
    if (!L.lfo) ["l1", "l2", "l3"].forEach(k => { nud(P[k], "rate"); if (wild && Math.random() < 0.3) P[k].shape = Math.floor(Math.random() * WV_LSH.length); });
    if (!L.mod) {
      P.mods.forEach(m => { m.amt = Math.max(-1, Math.min(1, m.amt + gauss() * amt * 0.6)); });
      if (med && P.mods.length < 16 && Math.random() < (wild ? 0.7 : 0.25)) {
        const s = ["l1", "l2", "l3", "e2", "e3", "vel", "rand"][Math.floor(Math.random() * 7)], d = ["o1.pos", "o2.pos", "f1.cut", "o1.wamt", "o2.pos"][Math.floor(Math.random() * 5)];
        if (!P.mods.some(m => m.src === s && m.dst === d)) P.mods.push({ src: s, dst: d, amt: Math.round((Math.random() * 0.6 - 0.2) * 100) / 100 });
      }
    }
    if (!/ \(mutated\)$/.test(P.name)) P.name = (P.name || "Init") + " (mutated)";
    wvChanged(); wvRender();
    wvSay((wild ? "Wild" : med ? "Medium" : "Subtle") + " changes. ↶ goes back; lock sections to keep them.");
    if (ctx) { const t = ctx.currentTime + 0.02; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.6)); }
  }
  // ---------- the main screen: macro names on the eight faders, and Edit ----------
  function wvMacroLabels() {
    if (state.engine !== "wave") return;
    document.querySelectorAll("#engineKnobs .knob").forEach((el, i) => { if (i < 8) { const n = el.querySelector(".k-name"); if (n) n.textContent = WV.patch.macros[i]; el.setAttribute("aria-label", WV.patch.macros[i]); el.classList.toggle("wv-free", !WV.patch.mods.some(m => m.src === "m" + (i + 1) || m.via === "m" + (i + 1))); } });
  }
  {
    const tools = document.querySelector("#engineRow .rtools"), eb = document.createElement("button");
    eb.className = "btn"; eb.id = "wvEditBtn"; eb.textContent = "Edit"; eb.title = "Open Natewave's oscillators, filters, envelopes, LFOs, mod matrix and macros"; eb.hidden = true;
    eb.addEventListener("click", () => { start(); wvOpen(); });
    if (tools) tools.insertBefore(eb, tools.querySelector(".demo"));
    const re = renderEngine;
    renderEngine = function () {
      const r = re.apply(this, arguments);
      const on = state.engine === "wave"; eb.hidden = !on;
      document.getElementById("engineKnobs").classList.toggle("wvmac", on);
      if (on) { wvMacroLabels(); const a = document.getElementById("engineAfter"); if (a) a.textContent = WV.patch.name || "Init"; if (ctx) wvRec(); }
      return r;
    };
    if (state.engine === "wave") renderEngine();
  }
  // saved sounds carry the whole patch
  { const cs = captureSound; captureSound = function () { const s = cs.apply(this, arguments); if (state.layers.wave && (state.layers.wave.on || s.engine === "wave")) s.wave = JSON.parse(JSON.stringify(WV.patch)); return s; }; }
  { const as = applySound; applySound = function (s) { if (s && s.wave) { WV.undo.push(JSON.parse(JSON.stringify(WV.patch))); WV.patch = wvFill(s.wave); wvChanged(); if (WV.open) wvRender(); } return as.apply(this, arguments); }; }
  // the sound browser: a Natewave category
  {
    const WV_BASE = NB_PRESETS.length;
    WV_PRESETS.forEach(([name, sub, p, mac, oct]) => NB_PRESETS.push([name, "wave", { wave: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => ["m" + i, (mac || [])[i - 1] || 0])) }, { sub, oct: oct || 0, wv: true }]));
    LIB_CATS.splice(3, 0, ["wave", "Natewave"]);
    const chip = document.createElement("button"); chip.className = "chip"; chip.dataset.cat = "wave"; chip.textContent = "Natewave";
    chip.addEventListener("click", () => { brCat = "wave"; brSearch.value = ""; renderBrowser(true); });
    const cl = brCats.querySelector('.chip[data-cat="classic"]'); if (cl) cl.after(chip); else brCats.appendChild(chip);
    const ae = allEntries;
    allEntries = function () { const list = ae(); for (const e of list) if (e.id.startsWith("n:")) { const i = Number(e.id.slice(2)); if (i >= WV_BASE && i < WV_BASE + WV_PRESETS.length) { e.cat = "wave"; e.sub = WV_PRESETS[i - WV_BASE][1]; } } return list; };
    const ap = applyPreset;
    applyPreset = function (i) { if (i >= WV_BASE && i < WV_BASE + WV_PRESETS.length) { WV.undo.push(JSON.parse(JSON.stringify(WV.patch))); WV.patch = wvPresetPatch(i - WV_BASE); WV.cur = i - WV_BASE; wvChanged(); if (WV.open) wvRender(); } return ap.apply(this, arguments); };
  }
  // a knob set from outside (MIDI learn), 0..1 across its range
  function wvSetNorm(path, v) {
    const k = path.split(".").pop(), I = WV_INT[k];
    v = Math.max(0, Math.min(1, v));
    wvPut(path, I ? Math.round(I[0] + v * (I[1] - I[0])) : k === "pitch" ? Math.round((v - 0.5) * 48) / 48 + 0.5 : v); wvChanged();
  }
  window.__wv = { WV, wtGet, WT_DEFS, wvRec, wvOpen, wvClose, wvLoadPreset, wvMutate, wvFrames, wvMatch, WV_PRESETS, wvFill, wvChanged, wvRender, set: wvSetNorm,
    get patch() { return WV.patch; }, set patch(p) { WV.patch = p; } };
  }
