  // ======================================================================
  // Morph: for every synth sound, four snapshots on the corners of a pad that blends between them, Mutate (subtle,
  // medium, wild) with undo, and eight macros that each move several knobs. Natewave morphs live while notes play;
  // the other engines take the new settings on the next notes.
  // ======================================================================
  {
    const MO_KEY = "nightbloom-morph";
    const MO = { by: {}, undo: {}, fxToo: false, assign: null, t: 0 };
    try { const o = JSON.parse(localStorage.getItem(MO_KEY) || "{}"); if (o && o.by) { MO.by = o.by; MO.fxToo = !!o.fxToo; } } catch (e) {}
    const moSave = () => { clearTimeout(MO.t); MO.t = setTimeout(() => { try { localStorage.setItem(MO_KEY, JSON.stringify({ by: MO.by, fxToo: MO.fxToo })); } catch (e) {} }, 300); };
    const isSynth = id => !!(ENGINES[id]);
    const moEng = () => isSynth(state.engine) ? state.engine : isSynth(state.melodic) ? state.melodic : null;
    const moOf = id => MO.by[id] || (MO.by[id] = { snaps: [null, null, null, null], x: 0, y: 0, macros: Array.from({ length: 8 }, (_, i) => ({ name: "Macro " + (i + 1), v: 0, targets: [] })) });
    const W = () => window.__wv;
    const FXK = ["drive", "wobble", "echo", "space"];
    const clone = o => JSON.parse(JSON.stringify(o));
    function moTake(id) {
      const s = { p: clone(state.params[id]), fx: Object.fromEntries(FXK.map(k => [k, state.fx[k]])) };
      if (id === "wave" && W()) s.wave = clone(W().patch);
      return s;
    }
    function moPut(id, s, fx) {
      Object.assign(state.params[id], clone(s.p));
      if (fx && s.fx) { Object.assign(state.fx, s.fx); if (ctx) applyFx(); }
      if (id === "wave" && s.wave && W()) { W().patch = W().wvFill(s.wave); W().wvChanged(); }
    }
    function moUndoPush(id) { const u = MO.undo[id] || (MO.undo[id] = []); u.push(moTake(id)); if (u.length > 30) u.shift(); }
    // ---- blending ----
    function blendTree(vals, w) {
      // numbers: weighted; anything else: the heaviest corner's; arrays of mod lines: matched by source → destination
      const top = vals.reduce((bi, v, i) => w[i] > w[bi] ? i : bi, 0), first = vals[top];
      if (typeof first === "number") return vals.reduce((s, v, i) => s + (typeof v === "number" ? v : first) * w[i], 0);
      if (Array.isArray(first)) {
        if (first.length && first[0] && typeof first[0] === "object" && "src" in first[0]) {
          const keyOf = m => m.src + ">" + m.dst + ">" + (m.via || ""), lines = new Map();
          vals.forEach((arr, i) => (arr || []).forEach(m => { const k = keyOf(m); if (!lines.has(k)) lines.set(k, Object.assign({}, m, { amt: 0 })); lines.get(k).amt += m.amt * w[i]; }));
          return [...lines.values()].filter(m => Math.abs(m.amt) > 0.004).slice(0, 16);
        }
        return clone(first);
      }
      if (first && typeof first === "object") { const o = {}; for (const k in first) o[k] = blendTree(vals.map(v => v && typeof v === "object" ? v[k] : undefined).map(v => v === undefined ? first[k] : v), w); return o; }
      return first;
    }
    let moFresh = 0;
    function moApply(id) {
      const M = moOf(id), filled = M.snaps.map((s, i) => s ? i : -1).filter(i => i >= 0);
      if (filled.length < 2) return false;
      const x = M.x, y = M.y, raw = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
      let w = raw.map((v, i) => M.snaps[i] ? v : 0), sum = w.reduce((a, b) => a + b, 0);
      if (sum < 1e-6) { w = raw.map((v, i) => M.snaps[i] ? 1 : 0); sum = filled.length; }
      w = w.map(v => v / sum);
      const vals = filled.map(i => M.snaps[i]), ww = filled.map(i => w[i]);
      const p = blendTree(vals.map(s => s.p), ww); Object.assign(state.params[id], p);
      if (MO.fxToo) { const f = blendTree(vals.map(s => s.fx || {}), ww); Object.assign(state.fx, f); if (ctx) applyFx(); }
      if (id === "wave" && W() && vals.every(s => s.wave)) { const P = blendTree(vals.map(s => s.wave), ww); P.name = vals[ww.indexOf(Math.max(...ww))].wave.name; W().patch = P; W().wvChanged(); }
      clearTimeout(moFresh); moFresh = setTimeout(() => { save(); if (state.panel === "sound") renderEngine(); }, 350);
      return true;
    }
    // ---- mutate (the other engines: their sliders, and the effects unless kept) ----
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    function moMutate(id, amt, keepSound, keepFx) {
      moUndoPush(id);
      if (id === "wave" && W()) { if (!keepSound) W().wvMutate(amt); }
      else if (!keepSound) {
        const P = state.params[id];
        ENGINES[id].knobs.forEach(([k]) => {
          const lim = /attack/.test(k) ? Math.max(0.6, P[k]) : /release|decay/.test(k) ? Math.max(0.8, P[k]) : /res/.test(k) ? Math.max(0.85, P[k]) : 1;
          let v = P[k] + gauss() * amt; if (amt >= 0.3 && Math.random() < 0.3) v = Math.random() * lim;
          P[k] = Math.max(0, Math.min(lim, v));
        });
      }
      if (!keepFx) { FXK.forEach(k => { state.fx[k] = Math.max(0, Math.min(k === "drive" ? 0.7 : 0.9, state.fx[k] + gauss() * amt * 0.6)); }); if (ctx) applyFx(); refreshFxKnobs(); }
      save(); moPaint(); moPreview();
    }
    function moPreview() { if (ctx) { const t = ctx.currentTime + 0.03; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.6)); } }
    // ---- macros (Natewave's are its own faders) ----
    function moMacroSet(id, i, v) {
      const m = moOf(id).macros[i]; m.v = v;
      for (const t of m.targets) {
        const val = t.from + (t.to - t.from) * v;
        if (t.k === "p" && state.params[id]) state.params[id][t.key] = val;
        else if (t.k === "fx") { state.fx[t.key] = val; if (ctx) applyFx(); }
        else if (t.k === "lv" && state.layers[id]) state.layers[id].level = val;
      }
      moSave(); clearTimeout(moFresh); moFresh = setTimeout(() => { save(); if (m.targets.some(t => t.k === "fx")) refreshFxKnobs(); }, 300);
    }
    const bar = document.createElement("div"); bar.className = "learnbar mo-bar"; bar.hidden = true; bar.setAttribute("role", "status");
    bar.innerHTML = '<span></span><button class="btn">Cancel</button><button class="btn primary">Done</button>'; document.body.appendChild(bar);
    function moAssignStart(id, i) {
      MO.assign = { id, i, before: { p: clone(state.params[id]), fx: clone(state.fx), lv: state.layers[id].level } };
      bar.hidden = false; bar.querySelector("span").textContent = moOf(id).macros[i].name + ": move the sliders it should control, on Sound or FX, to where the macro's top should take them. Then Done.";
      setPanel("sound");
    }
    function moAssignEnd(keep) {
      const A = MO.assign; if (!A) return; MO.assign = null; bar.hidden = true;
      const { id, i, before } = A, m = moOf(id).macros[i], now = { p: clone(state.params[id]), fx: clone(state.fx), lv: state.layers[id].level };
      if (keep) {
        const t = [];
        for (const k in before.p) if (typeof before.p[k] === "number" && Math.abs(now.p[k] - before.p[k]) > 0.005) t.push({ k: "p", key: k, from: before.p[k], to: now.p[k] });
        FXK.concat(["volume"]).forEach(k => { if (Math.abs(now.fx[k] - before.fx[k]) > 0.005) t.push({ k: "fx", key: k, from: before.fx[k], to: now.fx[k] }); });
        if (Math.abs(now.lv - before.lv) > 0.005) t.push({ k: "lv", key: "level", from: before.lv, to: now.lv });
        m.targets = t; m.v = 0;
        if (t.length && m.name.startsWith("Macro ")) m.name = t.map(x => x.k === "fx" ? x.key : (ENGINES[id].knobs.find(k => k[0] === x.key) || [0, x.key])[1]).slice(0, 2).join(" + ");
      }
      Object.assign(state.params[id], before.p); Object.assign(state.fx, before.fx); state.layers[id].level = before.lv;
      if (ctx) applyFx(); refreshFxKnobs(); save(); moSave();
      setPanel("morph"); moPaint();
      if (keep) noteMsg(m.targets.length ? m.name + " moves " + m.targets.length + " slider" + (m.targets.length > 1 ? "s" : "") + "." : "Nothing moved, so " + m.name + " controls nothing yet.");
    }
    bar.querySelectorAll(".btn")[0].addEventListener("click", () => moAssignEnd(false));
    bar.querySelectorAll(".btn")[1].addEventListener("click", () => moAssignEnd(true));
    // ---- the panel ----
    const row = document.createElement("div"); row.className = "row mo"; row.id = "morphRow"; row.hidden = true;
    row.innerHTML = `<div class="row-label"><span>Morph · <b id="moName"></b></span><span class="rtools"><button class="btn" id="moUndo" title="Back to before the last Mutate or snapshot">↶</button></span></div>
      <div class="mo-wrap">
        <div class="mo-padcol">
          <div class="mo-pad" id="moPad" role="group" aria-label="Morph pad"><i class="mo-dot" id="moDot"></i>
            ${["A", "B", "C", "D"].map((c, i) => `<button class="mo-c mo-c${i}" data-c="${i}" title="Tap: save the sound here (or go to it once saved). Long-press: save over it.">${c}</button>`).join("")}</div>
          <label class="mo-sl">Left–right <input type="range" id="moX" min="0" max="1000" aria-label="Morph left–right"></label>
          <label class="mo-sl">Up–down <input type="range" id="moY" min="0" max="1000" aria-label="Morph up–down"></label>
        </div>
        <div class="mo-side">
          <div class="mo-h">Snapshots</div>
          <p class="mo-info" id="moInfo"></p>
          <div class="mo-r"><button class="btn" id="moFx" aria-pressed="false">Morph the effects too</button><button class="btn" id="moClear">Clear snapshots</button></div>
          <div class="mo-h">Mutate</div>
          <div class="mo-r"><button class="btn" data-mu="0.06">Subtle</button><button class="btn" data-mu="0.16">Medium</button><button class="btn" data-mu="0.4">Wild</button>
            <button class="btn" id="moKeepS" aria-pressed="false">Keep sound</button><button class="btn" id="moKeepF" aria-pressed="true">Keep effects</button></div>
          <div class="mo-h">Macros</div>
          <div class="mo-macs" id="moMacs"></div>
        </div>
      </div>`;
    document.getElementById("jamRow").before(row);
    const pad = row.querySelector("#moPad"), dot = row.querySelector("#moDot"), sx = row.querySelector("#moX"), sy = row.querySelector("#moY");
    const dotAt = (x, y) => { dot.style.left = `calc(26px + ${x} * (100% - 52px))`; dot.style.top = `calc(26px + ${y} * (100% - 52px))`; };
    const padXY = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left - 26) / (r.width - 52), (e.clientY - r.top - 26) / (r.height - 52)]; };
    function moPaint() {
      const id = moEng(); if (!id) return;
      const M = moOf(id); row.querySelector("#moName").textContent = ENGINES[id].name;
      dotAt(M.x, M.y); sx.value = Math.round(M.x * 1000); sy.value = Math.round(M.y * 1000);
      row.querySelectorAll(".mo-c").forEach(b => b.classList.toggle("set", !!M.snaps[+b.dataset.c]));
      const n = M.snaps.filter(Boolean).length;
      row.querySelector("#moInfo").textContent = n === 0 ? "Tap A to save this sound on that corner; change the sound and tap B (and C, D). Then drag the dot, or move the sliders (both can follow a MIDI knob through MIDI learn)."
        : n === 1 ? "One saved. Change the sound and save another corner, then drag between them." : n + " saved: drag the dot to blend. " + (id === "wave" ? "Natewave changes while notes play." : "Notes take the blend as they start.");
      row.querySelector("#moFx").setAttribute("aria-pressed", String(MO.fxToo));
      const macs = row.querySelector("#moMacs"); macs.innerHTML = "";
      if (id === "wave") { const p = document.createElement("p"); p.className = "mo-info"; p.textContent = "Natewave's eight macros are its faders on the Sound panel; Edit → Macros sets what they move."; macs.appendChild(p); return; }
      M.macros.forEach((m, i) => {
        const c = document.createElement("div"); c.className = "mo-mac"; macs.appendChild(c);
        const holder = { ["m" + i]: m.v };
        makeKnob(c, "m" + i, m.name, () => holder, () => moMacroSet(id, i, holder["m" + i]));
        const a = document.createElement("button"); a.className = "btn"; a.textContent = m.targets.length ? "Reassign" : "Assign"; a.title = m.targets.length ? "Moves: " + m.targets.map(t => t.key).join(", ") : "Pick the sliders this macro moves";
        a.addEventListener("click", () => moAssignStart(id, i)); c.appendChild(a);
      });
    }
    const go = (x, y) => { const id = moEng(); if (!id) return; const M = moOf(id); M.x = Math.max(0, Math.min(1, x)); M.y = Math.max(0, Math.min(1, y)); dotAt(M.x, M.y); sx.value = Math.round(M.x * 1000); sy.value = Math.round(M.y * 1000); moApply(id); moSave(); };
    let pid = null;
    pad.addEventListener("pointerdown", e => { if (e.target.closest(".mo-c")) return; pid = e.pointerId; pad.setPointerCapture(pid); e.preventDefault(); const id = moEng(); if (id) moUndoPush(id); go(...padXY(e)); });
    pad.addEventListener("pointermove", e => { if (e.pointerId !== pid) return; go(...padXY(e)); });
    const up = e => { if (e.pointerId === pid) pid = null; }; pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", up);
    sx.addEventListener("input", () => { const id = moEng(); if (id) go(sx.value / 1000, moOf(id).y); });
    sy.addEventListener("input", () => { const id = moEng(); if (id) go(moOf(id).x, sy.value / 1000); });
    // corners: tap an empty one to save; tap a saved one to go there; long-press to save over it
    row.querySelectorAll(".mo-c").forEach(b => {
      let lp = 0, longed = false;
      const c = +b.dataset.c, cx = c % 2, cy = c > 1 ? 1 : 0;
      const store = () => { const id = moEng(); if (!id) return; moOf(id).snaps[c] = moTake(id); moSave(); moPaint(); noteMsg("Saved on " + b.textContent + "."); };
      b.addEventListener("pointerdown", e => { e.stopPropagation(); longed = false; lp = setTimeout(() => { longed = true; store(); }, 600); });
      b.addEventListener("pointerup", () => clearTimeout(lp)); b.addEventListener("pointerleave", () => clearTimeout(lp));
      b.addEventListener("click", () => {
        if (longed) return; const id = moEng(); if (!id) return; const M = moOf(id);
        if (!M.snaps[c]) { store(); M.x = cx; M.y = cy; moPaint(); return; }
        moUndoPush(id); M.x = cx; M.y = cy;
        if (!moApply(id)) moPut(id, M.snaps[c], MO.fxToo);
        moPaint(); moSave(); moPreview();
      });
      b.addEventListener("contextmenu", e => e.preventDefault());
    });
    row.querySelector("#moFx").addEventListener("click", () => { MO.fxToo = !MO.fxToo; moSave(); moPaint(); });
    row.querySelector("#moClear").addEventListener("click", () => { const id = moEng(); if (!id) return; moOf(id).snaps = [null, null, null, null]; moSave(); moPaint(); });
    const keep = { s: false, f: true };
    row.querySelector("#moKeepS").addEventListener("click", e => { keep.s = !keep.s; e.target.setAttribute("aria-pressed", String(keep.s)); });
    row.querySelector("#moKeepF").addEventListener("click", e => { keep.f = !keep.f; e.target.setAttribute("aria-pressed", String(keep.f)); });
    row.querySelectorAll("[data-mu]").forEach(b => b.addEventListener("click", () => { const id = moEng(); if (id) moMutate(id, +b.dataset.mu, keep.s, keep.f); }));
    row.querySelector("#moUndo").addEventListener("click", () => { const id = moEng(); if (!id) return; const u = MO.undo[id]; if (!u || !u.length) { noteMsg("Nothing to undo."); return; } moPut(id, u.pop(), true); if (ctx) applyFx(); refreshFxKnobs(); save(); moPaint(); moPreview(); });
    // the panel button, after Arp
    const pM = document.createElement("button"); pM.id = "pMorph"; pM.setAttribute("aria-pressed", "false"); pM.textContent = "Morph"; pM.title = "Snapshots to morph between, Mutate, and macros";
    document.getElementById("pArp").after(pM);
    const sp = setPanel;
    setPanel = function (which) {
      const was = state.panel;
      if (which === "morph") { sp("hide"); state.panel = "morph"; } else sp(which);
      row.hidden = which !== "morph"; pM.setAttribute("aria-pressed", String(which === "morph"));
      if (which === "morph") { document.getElementById("pHide").setAttribute("aria-pressed", "false"); moPaint(); }
      if (was === "morph" && which === "sound") renderEngine();
    };
    pM.addEventListener("click", () => setPanel("morph"));
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); if (!row.hidden) moPaint(); return r; }; }
    // saved sounds keep their snapshots and macros
    { const cs = captureSound; captureSound = function () { const s = cs.apply(this, arguments); const id = isSynth(s.engine) ? s.engine : null; if (id && MO.by[id]) s.morph = clone(MO.by[id]); return s; }; }
    { const as = applySound; applySound = function (s) { const r = as.apply(this, arguments); if (s && s.morph && isSynth(s.engine)) { MO.by[s.engine] = clone(s.morph); moSave(); moPaint(); } return r; }; }
    // MIDI learn reaches Natewave's editor knobs too
    { const ld = learnDesc; learnDesc = function (el) { const k = el && el.closest && el.closest(".wvk[data-path]"); if (k) return { t: { k: "wv", path: k.dataset.path }, name: "Natewave " + k.getAttribute("aria-label") }; return ld.apply(this, arguments); }; }
    { const la = learnApply; learnApply = function (t, v) { if (t.k === "wv") { const w = W(); if (!w) return false; w.set(t.path, v); return true; } return la.apply(this, arguments); }; }
    window.__mo = { MO, moApply, moMutate, moOf, moTake, moEng, moPaint, blendTree, moMacroSet, moAssignStart, moAssignEnd };
  }
