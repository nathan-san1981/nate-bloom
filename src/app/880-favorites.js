  // ======================================================================
  // 200: Favorites (the Linux app). A Favorite is a named sound that comes back exactly as it was left: what's
  // playing (one sound or a stack), every knob (My sounds' capture: engine, layers and levels, params, Natewave,
  // Morph, arp, chord, octave, the Effects knobs), plus what My sounds never kept: each sound's effects switch and
  // amount, Analog (on, filter model, Drive, Drift), each plugin instrument's own state, the plugin effects on each
  // of those sounds (in order, with their states), their Send A/B levels, which controller plays each one, and the
  // hardware synth's settings. ★ Save on the Playing row; the Favorites row above Quick loads one; Find knows them.
  // Loading one touches only the sounds it holds. Kept across projects (like My sounds), with the last five saves
  // of each for undo, and exported or imported as a file.
  // ======================================================================
  if (window.NB_NATIVE && window.NB_NATIVE.platform === "linux" && !window.NB_LITE) {
    const FV_KEY = "nightbloom-favorites";
    let FAV = []; try { const v = JSON.parse(localStorage.getItem(FV_KEY) || "[]"); if (Array.isArray(v)) FAV = v; } catch (e) {}
    const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));
    let fvT = 0;
    const fvToast = m => { const t = document.getElementById("uiToast"); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(fvT); fvT = setTimeout(() => { t.hidden = true; }, 3200); };
    const fvSave = () => { try { localStorage.setItem(FV_KEY, JSON.stringify(FAV)); return true; } catch (e) { fvToast("Couldn't keep it: storage is full (export your favorites, then delete some)"); return false; } };
    const WM = () => window.__wam || null;
    async function stOf(node, dflt) { try { if (node && node.getState) { const s = await node.getState(); if (s != null) return s; } } catch (e) {} return dflt == null ? null : dflt; }
    const idsOf = its => its.map(it => it.t === "syn" ? it.id : it.t === "lib" ? "lib" : it.t);   // the per-sound effects keys
    function targetsOf(its) {
      const T = new Set();
      its.forEach(it => {
        if (it.t === "syn") T.add("ch:" + it.id);
        else if (it.t === "lib") { T.add("ch:inst"); if (typeof it.id === "string" && it.id.startsWith("wam:")) T.add("plug:" + it.id); }
        else T.add("ch:" + it.t);
      });
      return [...T];
    }
    const nameOf = its => its.length ? its.map(it => it.name).join(" + ") : "Sound";

    // ---- capture ----
    async function fvCapture(name) {
      const snap = captureSound(name);
      const its = window.__stk ? window.__stk.items() : [];
      const ex = { v: 1, items: its.map(it => ({ t: it.t, id: it.id, name: it.name, kind: it.kind })) };
      if (typeof FXC !== "undefined") { ex.fxMode = FXC.mode; ex.fxby = {}; idsOf(its).forEach(id => { if (FXC.by[id]) ex.fxby[id] = clone(FXC.by[id]); }); }
      ex.fxGlobal = clone(state.fx);
      try { const A = window.__analog.NBAN; ex.analog = { on: !!A.on, model: A.model, drive: A.drive, drift: A.drift }; } catch (e) {}
      const w = WM();
      if (w && w.NBW) {
        const N = w.NBW; ex.plug = { parts: {}, chains: {}, sends: {} };
        for (const p of (state.lib.parts || [])) if (p && typeof p.id === "string" && p.id.startsWith("wam:")) {
          const Wp = N.parts.get(p.id); ex.plug.parts[p.id] = Wp && Wp.node ? await stOf(Wp.node, N.saved[p.id]) : (N.saved[p.id] == null ? null : N.saved[p.id]);
        }
        for (const t of targetsOf(its)) {
          const ch = (w.chainOf(t) || []);
          ex.plug.chains[t] = [];
          for (const F of ch) ex.plug.chains[t].push({ key: F.key, on: F.on !== false, name: F.name || F.key, state: await stOf(F.node, F.state) });
          if (N.sendLv[t]) ex.plug.sends[t] = clone(N.sendLv[t]);
        }
      }
      if (window.__nbCtl) { ex.ctl = {}; its.forEach(it => { const k = window.__nbCtl.keyOf(it); ex.ctl[k] = (window.__nbCtl.get(k) || []).slice(); }); }
      ex.stackHw = !!(state.stack && state.stack.hw);
      if (its.some(it => it.t === "hw") && window.__hw) { const H = window.__hw; ex.hw = { model: H.model, out: H.out, ch: H.ch, dev: H.dev, pick: H.pick, level: H.level, thru: H.thru, fxOn: H.fxOn, direct: H.direct }; }
      try { const Z = JSON.parse(localStorage.getItem("nightbloom-zones") || "{}") || {}; if (Object.keys(Z).length) ex.zones = Z; } catch (e) {}   // (224) the keyboard split goes with it
      try { const V = JSON.parse(localStorage.getItem("nightbloom-velsplit") || "{}") || {}; if (Object.keys(V).length) ex.vel = V; } catch (e) {}
      snap.fav = ex;
      return snap;
    }

    // ---- apply ----
    let loading = false;
    async function fvApply(f) {
      if (loading) return; loading = true;
      const ex = f.fav || {}, missing = [];
      try {
        start();
        const w = WM(), have = k => !!(w && w.CAT && w.CAT.some(c => c.key === k));
        // the plugin instruments' states first, so they come up with them when the sound loads
        if (w && w.NBW && ex.plug) for (const id in ex.plug.parts) {
          if (!have(id.slice(4))) { const it = (ex.items || []).find(x => x.id === id); missing.push(it ? it.name : id.slice(4)); continue; }
          if (ex.plug.parts[id] != null) w.NBW.saved[id] = ex.plug.parts[id];
          const Wp = w.NBW.parts.get(id); if (Wp && Wp.node && Wp.node.setState && ex.plug.parts[id] != null) { try { await Wp.node.setState(ex.plug.parts[id]); } catch (e) {} }
        }
        sndQuiet = true; try { applySound(f); } finally { sndQuiet = false; }
        if (state.stack) state.stack.hw = !!ex.stackHw;
        try { localStorage.setItem("nightbloom-zones", JSON.stringify(ex.zones || {})); localStorage.setItem("nightbloom-velsplit", JSON.stringify(ex.vel || {})); window.__nbZonesReload && window.__nbZonesReload(); window.__kz && window.__kz.paint(); } catch (e) {}   // (224)
        if (ex.hw && window.__hw) { Object.assign(window.__hw, ex.hw); try { window.__hw.save && window.__hw.save(); } catch (e) {} try { window.__hwDbg.hwWire(); } catch (e) {} }
        if (ex.fxby && typeof FXC !== "undefined") { for (const id in ex.fxby) Object.assign(fxcParams(id), ex.fxby[id]); fxcSave(); }
        if (ex.fxGlobal) Object.assign(state.fx, ex.fxGlobal);
        try { if (ctx) { applyFx(); applyBfx(false); } refreshFxKnobs(); } catch (e) {}
        if (ex.analog) {
          try {
            const A = window.__analog.NBAN;
            if (!!A.on !== !!ex.analog.on) document.getElementById("anOn").click();
            A.model = ex.analog.model; A.drive = ex.analog.drive; A.drift = ex.analog.drift;
            localStorage.setItem("nightbloom-analog", JSON.stringify({ on: A.on, model: A.model, drive: A.drive, drift: A.drift }));
          } catch (e) {}
        }
        if (w && w.NBW && ex.plug) {
          for (const t in ex.plug.chains) {
            (w.chainOf(t) || []).slice().forEach(F => { try { window.__nbw.removeFx(F); } catch (e) {} });
            for (const F of ex.plug.chains[t]) {
              if (!have(F.key)) { missing.push(F.name || F.key); continue; }
              try { await w.addFx(F.key, F.on, F.state, true, t); } catch (e) { missing.push(F.name || F.key); }
            }
          }
          for (const t in ex.plug.sends) for (const x in ex.plug.sends[t]) { try { w.setSend(t, x, ex.plug.sends[t][x]); } catch (e) {} }
        }
        if (ex.ctl && window.__nbCtl) for (const k in ex.ctl) window.__nbCtl.set(k, ex.ctl[k]);
        renderEngine(); save(); try { window.__stk.paint(); } catch (e) {}
        state.cur = null;
        fvToast("★ " + f.name + (missing.length ? " · not installed: " + [...new Set(missing)].join(", ") + " (Plugins › Get free plugins)" : ""));
        if (ctx) setTimeout(() => { const t = ctx.currentTime + 0.02; melodicVoices(60, t, 0.9).forEach(v => v.stop(t + 0.7)); }, 600);
        try { window.__nbAdd && window.__nbAdd("fav", "loaded " + f.name); } catch (e) {}
      } finally { loading = false; FV.cur = f.id; fvPaint(); }
    }

    // ---- save, update, rename, undo, delete ----
    async function fvNew(name) {
      const s = await fvCapture(name); s.id = "f" + Date.now().toString(36); s.hist = [];
      FAV.unshift(s); if (!fvSave()) { FAV.shift(); return null; }
      FV.cur = s.id; fvPaint(); fvToast("Saved ★ " + name); return s;
    }
    async function fvUpdate(f) {
      const s = await fvCapture(f.name), { hist, ...prev } = f;
      s.id = f.id; s.hist = [prev].concat(hist || []).slice(0, 5);
      const i = FAV.indexOf(f); if (i < 0) return; FAV[i] = s; if (!fvSave()) { FAV[i] = f; return; }
      fvPaint(); fvToast("Updated ★ " + f.name + " (Undo update puts the last one back)");
    }
    function fvUndo(f) {
      if (!f.hist || !f.hist.length) return; const [prev, ...rest] = f.hist; const s = Object.assign(prev, { id: f.id, hist: rest });
      const i = FAV.indexOf(f); FAV[i] = s; fvSave(); fvPaint(); fvToast("★ " + s.name + ": the save before is back"); fvApply(s);
    }
    function fvDelete(f) { FAV = FAV.filter(x => x !== f); fvSave(); fvPaint(); fvToast("Deleted ★ " + f.name); }
    function fvExport() {
      const blob = new Blob([JSON.stringify({ app: "Nate Bloom", kind: "favorites", v: 1, favorites: FAV }, null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nate-bloom-favorites.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
    function fvImport() {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        try {
          const o = JSON.parse(await file.text()), list = Array.isArray(o) ? o : o && Array.isArray(o.favorites) ? o.favorites : [];
          let n = 0; for (const f of list) { if (!f || !f.name || !f.fav) continue; if (!f.id || FAV.some(x => x.id === f.id)) f.id = "f" + Date.now().toString(36) + n; FAV.push(f); n++; }
          fvSave(); fvPaint(); fvToast(n ? "Added " + n + " favorite" + (n === 1 ? "" : "s") : "No favorites in that file");
        } catch (e) { fvToast("That file isn't a favorites file"); }
      });
      inp.click();
    }

    // ---- the popover (name a favorite, or its menu) ----
    const pop = document.createElement("div"); pop.className = "nb-favpop"; pop.hidden = true; pop.setAttribute("role", "dialog"); document.body.appendChild(pop);
    document.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target) && !(e.target.closest && e.target.closest(".fv-open"))) pop.hidden = true; });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) pop.hidden = true; });
    function popAt(btn) {
      pop.hidden = false; const r = btn.getBoundingClientRect(), pw = Math.min(320, innerWidth - 16);
      pop.style.width = pw + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left)) + "px";
      const ph = pop.offsetHeight; pop.style.top = (r.bottom + 6 + ph < innerHeight ? r.bottom + 6 : Math.max(8, r.top - ph - 6)) + "px";
    }
    const mk = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
    function askName(btn, title, value, ok) {
      pop.innerHTML = ""; pop.setAttribute("aria-label", title);
      pop.appendChild(mk("b", "", title));
      const inp = mk("input"); inp.type = "text"; inp.value = value || ""; inp.maxLength = 60; inp.setAttribute("aria-label", "Name"); pop.appendChild(inp);
      const row = mk("div", "fv-btns"), go = mk("button", "btn primary", "Save"), no = mk("button", "btn", "Cancel");
      const done = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } pop.hidden = true; ok(v); };
      go.addEventListener("click", done); no.addEventListener("click", () => { pop.hidden = true; });
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); done(); } e.stopPropagation(); });
      row.append(no, go); pop.appendChild(row); popAt(btn); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }
    function menu(btn, title, items) {
      pop.innerHTML = ""; pop.setAttribute("aria-label", title); pop.appendChild(mk("b", "", title));
      items.forEach(([label, run, sub, danger]) => { const b = mk("button", "fv-item" + (danger ? " danger" : "")); b.appendChild(mk("span", "", label)); if (sub) b.appendChild(mk("small", "", sub)); b.addEventListener("click", () => { pop.hidden = true; run(); }); pop.appendChild(b); });
      popAt(btn);
    }
    function saveFlow(btn) {
      const its = window.__stk ? window.__stk.items() : [];
      if (!its.length) { fvToast("Nothing is playing: pick a sound first"); return; }
      askName(btn, "Save as a favorite", nameOf(its), async v => {
        const same = FAV.find(f => f.name.toLowerCase() === v.toLowerCase());
        if (same) { await fvUpdate(same); FV.cur = same.id; fvPaint(); } else await fvNew(v);
      });
    }

    // ---- the Favorites row (above Quick) and ★ Save on the Playing row ----
    const FV = { cur: null };
    const stk = document.getElementById("stk"), qk = document.getElementById("qk");
    const row = mk("div", "qk fav-row"); row.id = "favRow";
    const lab = mk("span", "qk-lab", "★ Favorites"); const list = mk("div", "qk-row"); list.id = "favList"; list.setAttribute("role", "group"); list.setAttribute("aria-label", "Favorites");
    row.append(lab, list);
    if (stk && qk) stk.insertBefore(row, qk);
    function sumOf(f) { const its = (f.fav && f.fav.items) || []; return its.length ? its.map(x => x.name).join(" + ") : (ENGINES[f.engine] ? ENGINES[f.engine].name : f.engine || ""); }
    function fvPaint() {
      if (!list) return;
      const sc = list.scrollLeft; list.innerHTML = "";
      if (!FAV.length) list.appendChild(mk("span", "fv-none", "★ Save on the Playing row keeps a sound with its settings and effects"));
      FAV.forEach(f => {
        const t = mk("div", "qk-t fv-t" + (FV.cur === f.id ? " cur" : ""));
        const m = mk("button", "qm"); m.innerHTML = "<b></b><small></small>"; m.querySelector("b").textContent = f.name; m.querySelector("small").textContent = sumOf(f);
        m.title = "Load " + f.name + ": " + sumOf(f); m.setAttribute("aria-label", m.title); m.addEventListener("click", () => fvApply(f));
        const o = mk("button", "qs fv-open", "⋯"); o.title = f.name + ": update, rename, undo or delete"; o.setAttribute("aria-label", o.title);
        o.addEventListener("click", () => menu(o, "★ " + f.name, [
          ["Update", () => fvUpdate(f), "save what's playing now over it"],
          ["Rename", () => askName(o, "Rename", f.name, v => { f.name = v; fvSave(); fvPaint(); })],
          ...(f.hist && f.hist.length ? [["Undo update", () => fvUndo(f), f.hist.length + " earlier save" + (f.hist.length === 1 ? "" : "s") + " kept"]] : []),
          ["Move to the front", () => { FAV = [f].concat(FAV.filter(x => x !== f)); fvSave(); fvPaint(); }],
          ["Delete", () => fvDelete(f), null, true]]));
        t.append(m, o); list.appendChild(t);
      });
      const more = mk("button", "qs fv-open fv-more", "⋯"); more.title = "Export or import favorites"; more.setAttribute("aria-label", more.title);
      more.addEventListener("click", () => menu(more, "Favorites", [["Export all", fvExport, FAV.length + " as one file, for another computer"], ["Import…", fvImport, "add favorites from a file"]]));
      list.appendChild(more);
      list.scrollLeft = sc;
    }
    // ★ Save sits after + Add on the Playing row, which repaints itself often
    const stkRow = document.getElementById("stkRow");
    function addSave() {
      if (!stkRow || stkRow.querySelector(".fv-save")) return;
      const b = mk("button", "btn fv-save fv-open", "★ Save"); b.title = "Save what's playing as a favorite: the sound, its settings and its effects"; b.setAttribute("aria-label", b.title);
      b.addEventListener("click", () => { start(); saveFlow(b); });
      stkRow.appendChild(b);
    }
    if (stkRow) { new MutationObserver(addSave).observe(stkRow, { childList: true }); addSave(); }
    fvPaint();

    // ---- Find knows them; the report counts them ----
    (window.__nbFindMore = window.__nbFindMore || []).push(add => FAV.forEach(f => add("Sounds", "★ " + f.name, "Favorite · " + sumOf(f), () => fvApply(f), "favorite fav star " + f.name + " " + sumOf(f))));
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ favorites: FAV.map(f => ({ name: f.name, items: sumOf(f), plugins: f.fav && f.fav.plug ? Object.keys(f.fav.plug.parts).length + Object.values(f.fav.plug.chains).reduce((a, c) => a + c.length, 0) : 0, hist: (f.hist || []).length })) }));
    window.__fav = { list: () => FAV, capture: fvCapture, apply: fvApply, add: fvNew, update: fvUpdate, undo: fvUndo, del: fvDelete, paint: fvPaint, dbg: { state: () => state, fxc: () => (typeof FXC !== "undefined" ? FXC : null) } };
  }
