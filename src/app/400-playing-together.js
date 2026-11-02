  // ---------- Playing together: every kind of sound at once ----------
  // What plays is a stack of groups: Nate Bloom's synth engines (state.layers[*].on), the library parts (Studio,
  // library and plugin sounds, state.lib.parts), the SF2/SFZ instrument, and a Sampler slot. The group whose controls
  // show (state.engine) always plays; state.stack marks the others that play along with it.
  {
    const NOSTK = () => ({ syn: false, lib: false, inst: false, samp: -1, f: "" });
    if (!state.stack || typeof state.stack !== "object") state.stack = NOSTK();
    const S = () => state.stack || (state.stack = NOSTK());
    const isSyn = id => !!ENGINES[id] && (id !== "fm" || betaOn);
    const grp = e => ENGINES[e] ? "syn" : (e === "lib" || e === "inst") ? e : null;   // (Samples and Drums aren't part of it)
    const melo = () => grp(state.engine) ? state.engine : grp(S().f) ? S().f : (state.melodic || "saw");
    const PLUG = id => typeof id === "string" && id.startsWith("wam:");
    const synOn = () => Object.keys(ENGINES).filter(id => state.layers[id] && state.layers[id].on && isSyn(id));
    let libSel = 0;
    const ADD = { on: false }, pend = new Set();   // (library slots a sound is loading into)
    function groupsOn(e = melo()) {
      const s = S(), g = { syn: !!s.syn, lib: !!s.lib, inst: !!s.inst, samp: Number.isInteger(s.samp) ? s.samp : -1 };
      const f = grp(e); if (f) g[f] = true;
      if (!(g.samp >= 0 && g.samp < NSLOTS && sampBuf[g.samp])) g.samp = -1;
      if (g.lib && f !== "lib" && !state.lib.parts.some(p => p && p.id)) g.lib = false;
      return g;
    }
    // ---- the voices: everything in the stack ----
    const vc0 = voiceComponents;
    function stackComps(e) {
      const g = groupsOn(e), out = [];
      if (g.syn) out.push(...vc0(isSyn(e) ? e : (synOn()[0] || "saw")));
      if (g.lib) out.push(...vc0("lib"));
      if (g.inst) out.push(...vc0("inst"));
      if (g.samp >= 0) { const sl = g.samp; out.push({ key: "samp", name: "Sampler", accepts: () => true, make: (m, when, scale = 1) => makeSampleVoice(m, sl, when, scale) }); }
      return out;
    }
    voiceComponents = function (eng = state.engine) {
      if (eng !== state.engine || !grp(eng)) return vc0.apply(this, arguments);
      return stackComps(eng);
    };
    { const mvp = melodicVoices;
      melodicVoices = function (m, when, scale = 1) {
        const e = ["drum", "pads"].includes(state.engine) ? melo() : state.engine, f = grp(e);
        if (!f) return mvp.apply(this, arguments);
        const ke = state.engine; let vs;
        state.engine = e; try { vs = mvp.call(this, m, when, scale); } finally { state.engine = ke; }   // (the one with the controls, as before: key lights and all)
        const g = groupsOn(e), more = [];
        if (f !== "syn" && g.syn) more.push(...vc0(synOn()[0] || "saw"));
        if (f !== "lib" && g.lib) more.push(...vc0("lib"));
        if (f !== "inst" && g.inst) more.push(...vc0("inst"));
        if (g.samp >= 0) { const sl = g.samp; more.push({ accepts: () => true, make: (mm, w, sc) => makeSampleVoice(mm, sl, w, sc) }); }
        for (const c of more) if (c.accepts(m)) { const v = c.make(m, when, scale); if (v) vs.push(v); }
        return vs;
      }; }
    // ---- what's in it ----
    function kindOf(p) {
      if (PLUG(p.id)) { const c = ((window.__wam && __wam.CAT) || []).find(c => "wam:" + c.key === p.id); return c && c.vendor === "Nathan" ? "your plugin" : "plugin"; }
      return p.id.startsWith("nb-") ? "studio" : "library";
    }
    const KC = { synth: "var(--lilac)", studio: "#7fd6c2", library: "#8fb3ff", plugin: "var(--amber)", "your plugin": "#ff8fc7", instrument: "#c9a96e", sampler: "#9be38a" };
    function items() {
      const g = groupsOn(), out = [];
      if (g.syn) { const on = synOn(); (on.length ? on : ["saw"]).forEach(id => out.push({ t: "syn", id, name: ENGINES[id].name, kind: "synth" })); }
      if (g.lib) state.lib.parts.forEach((p, i) => { if (p && p.id) out.push({ t: "lib", i, id: p.id, name: p.name, kind: kindOf(p), off: !p.on, wait: !libInsts[i] }); });
      if (g.inst) out.push({ t: "inst", name: curInst ? curInst.name : "My instrument", kind: "instrument", wait: !curInst });
      if (g.samp >= 0) { const sl = state.samp.slots[g.samp]; out.push({ t: "samp", slot: g.samp, name: "Sampler S" + (g.samp + 1) + (sl && sl.name ? " · " + baseName(sl.name) : ""), kind: "sampler" }); }
      return out;
    }
    const libSelOn = () => { const ps = state.lib.parts; return ps[libSel] && ps[libSel].id ? libSel : ps.findIndex(p => p && p.id); };
    if (Number.isInteger(S().ls)) libSel = S().ls;   // (the highlighted library sound, kept across a reload)
    const isSel = it => it.t === "syn" ? state.engine === it.id : it.t === "lib" ? state.engine === "lib" && it.i === libSelOn() : it.t === "inst" ? state.engine === "inst" : false;
    const same = (a, b) => a.t === b.t && (a.t === "syn" ? a.id === b.id : a.t === "lib" ? a.i === b.i : true);
    let toastT = 0;
    function say(msg) { const el = document.getElementById("uiToast"); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2800); }
    // ---- (172) mute: the sound stays in what's playing, silent, until it's unmuted (its bus does it, see lvMuted) ----
    function muteHome(it) {
      if (it.t === "syn") return state.layers[it.id];
      if (it.t === "lib") return state.lib.parts[it.i];
      if (it.t === "inst") return state.inst;
      if (it.t === "samp") return state.samp.slots[it.slot];
      return null;
    }
    const isMuted = it => { const h = muteHome(it); return !!(h && h.mute); };
    function setMute(it, on) { const h = muteHome(it); if (!h) return; if (on) h.mute = true; else delete h.mute; }
    function toggleMute(it) {
      start();
      const on = !isMuted(it); setMute(it, on);
      try { lvApply(); } catch (e) {}
      save(); paint();
      say(on ? it.name + " is muted. It stays in, silent · tap the speaker again to hear it" : it.name + " is back on");
    }
    // a sound that leaves what's playing drops its mute, so it comes back audible when it's added again
    function sweepMutes(its) {
      let n = 0;
      const has = f => its.some(f);
      for (const id in state.layers) if (state.layers[id] && state.layers[id].mute && !has(x => x.t === "syn" && x.id === id)) { delete state.layers[id].mute; n++; }
      state.lib.parts.forEach((p, i) => { if (p && p.mute && !has(x => x.t === "lib" && x.i === i)) { delete p.mute; n++; } });
      if (state.inst && state.inst.mute && !has(x => x.t === "inst")) { delete state.inst.mute; n++; }
      state.samp.slots.forEach((sl, i) => { if (sl && sl.mute && !has(x => x.t === "samp" && x.slot === i)) { delete sl.mute; n++; } });
      if (n) { try { lvApply(); } catch (e) {} }
    }
    const SPK = muted => '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M3 9.5h4l5-4.2v13.4l-5-4.2H3z" fill="currentColor"/>' +
      (muted ? '<path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>'
             : '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>') + '</svg>';
    function muteBtn(cls, it) {
      const m = isMuted(it), b = document.createElement("button"); b.className = cls; b.innerHTML = SPK(m);
      b.title = m ? it.name + " is muted · tap to hear it again" : "Mute " + it.name + " (it stays in, silent)";
      b.setAttribute("aria-label", b.title); b.setAttribute("aria-pressed", String(m));
      b.addEventListener("click", ev => { ev.stopPropagation(); toggleMute(it); });
      return b;
    }
    // ---- changing it ----
    function keepFocusPlaying() { const g = grp(state.engine) || grp(S().f); if (g) S()[g] = true; }   // what had the controls plays on
    function focusOn(it) {
      const s = S();
      if (it.t === "samp") { say(it.name + " plays along with the keys. Its sample and settings are in Samples."); return; }
      const f0 = grp(state.engine), f1 = it.t;
      if (f0 && f0 !== f1) s[f0] = true;
      s[f1] = false;
      if (it.t === "syn") { state.engine = it.id; state.melodic = it.id; if (!(state.cur && state.cur.id.startsWith("n:"))) state.cur = { id: "e:" + it.id, cat: "engines" }; }
      else if (it.t === "lib") { libSel = it.i; state.engine = "lib"; const e = entryById("w:" + it.id); state.cur = { id: "w:" + it.id, cat: e ? e.cat : "plugins" }; if (it.off) { state.lib.parts[it.i].on = true; } }
      else state.engine = "inst";
      renderEngine(); save();
    }
    function removePart(i) {
      const ps = state.lib.parts;
      for (let k = i; k < MAX_PARTS; k++) libTokens[k]++;   // (a sound still loading into a slot that moves is dropped)
      ps.splice(i, 1); libInsts.splice(i, 1); libInsts.push(null);
      libInst = libInsts.find(Boolean) || null; const first = ps.find(p => p && p.id); state.lib.id = first ? first.id : "";
      if (libSel >= i && libSel > 0) libSel--;
      try { if (!layersEl.hidden) renderLayers(); } catch (e) {}
    }
    function drop(it, quiet) {
      const all = items(), rest = all.filter(x => !same(x, it)), s = S();
      if (!quiet && it.t !== "samp" && !rest.some(x => x.t !== "samp")) { say("It's the only sound playing. To change it, pick another sound (tap its name above)."); return false; }
      const wasSel = isSel(it);
      setMute(it, false);   // (172) back audible if it's added again
      if (it.t === "syn") { state.layers[it.id].on = false; if (!synOn().length) s.syn = false; }
      else if (it.t === "lib") { removePart(it.i); if (!state.lib.parts.some(p => p && p.id)) s.lib = false; }
      else if (it.t === "inst") s.inst = false;
      else s.samp = -1;
      const gone = it.t === "syn" ? !synOn().length : it.t === "lib" ? !state.lib.parts.some(p => p && p.id) : it.t === "inst";
      if (wasSel || (gone && grp(state.engine) === it.t)) {
        // its controls go to the next one still playing
        // (one of the same kind if there's one left, so a plugin's controls go to the next plugin)
        const cand = items().filter(x => x.t !== "samp" && !(gone && x.t === it.t)), nxt = cand.find(x => x.t === it.t) || cand[0] || rest.find(x => x.t !== "samp");
        if (nxt) {
          const g0 = grp(state.engine), left = { syn: synOn().length > 0, lib: state.lib.parts.some(p => p && p.id), inst: it.t !== "inst" };
          if (g0 && g0 !== nxt.t) s[g0] = !!left[g0];   // what had the controls plays on if anything of it is left
          if (gone) s[it.t] = false;
          s[nxt.t] = false;
          if (nxt.t === "syn") { state.layers[nxt.id].on = true; state.engine = nxt.id; state.melodic = nxt.id; state.cur = { id: "e:" + nxt.id, cat: "engines" }; }
          else if (nxt.t === "lib") { libSel = nxt.i; state.engine = "lib"; }
          else state.engine = "inst";
        }
      }
      renderEngine(); save();
      if (!quiet) say(it.name + " is out" + (rest.length ? ". Still playing: " + rest.map(x => x.name).join(", ") : "") + " · + in Quick sounds brings it back");
      try { lvApply(); } catch (e) {}
      return true;
    }
    function only(it) {
      const s = S(); s.syn = s.lib = s.inst = false; s.samp = -1;
      setMute(it, false);   // (172) "Only" means hear it
      if (it.t === "syn") { for (const k in state.layers) state.layers[k].on = k === it.id; state.engine = it.id; state.melodic = it.id; }
      else if (it.t === "lib") { for (let k = MAX_PARTS - 1; k >= 0; k--) if (k !== it.i && state.lib.parts[k]) removePart(k); libSel = 0; state.lib.parts.forEach(p => { if (p) p.on = true; }); state.engine = "lib"; }
      else if (it.t === "inst") state.engine = "inst";
      renderEngine(); save(); say("Only " + it.name + " now");
      try { lvApply(); } catch (e) {}
    }
    // + Together: this one plays with everything that's playing (and gets the controls)
    async function together(e) {
      start();
      const id = e.id, s = S();
      if (id.startsWith("e:")) {
        const k = id.slice(2), g = groupsOn();
        if (isSyn(k)) {
          if (g.syn && state.layers[k].on) { say(ENGINES[k].name + " is already playing"); return false; }
          if (!g.syn) for (const x in state.layers) state.layers[x].on = false;
          keepFocusPlaying(); state.layers[k].on = true; s.syn = false;
          state.engine = k; state.melodic = k; state.cur = { id, cat: "engines" };
          renderEngine(); save(); say(ENGINES[k].name + " added · playing together"); return true;
        }
        if (k === "inst") { if (!curInst) { say("Load an instrument in Inst first (SF2 or SFZ), then add it"); return false; } if (g.inst) { say("It's already playing"); return false; } keepFocusPlaying(); s.inst = false; state.engine = "inst"; renderEngine(); save(); say(curInst.name + " added · playing together"); return true; }
        if (k === "samp") { const sl = state.samp.slot; if (!sampBuf[sl]) { say("Load a sample into a Sampler slot first (in Samples), then add it"); return false; } s.samp = sl; renderEngine(); save(); say("Sampler S" + (sl + 1) + " added · plays along with the keys"); return true; }
        say("Drums and pads play from their own pads, so they're always on top of the keys"); return false;
      }
      if (id.startsWith("w:")) {
        const stem = id.slice(2), g = groupsOn();
        if (!g.lib) { for (let k = 0; k < MAX_PARTS; k++) libTokens[k]++; state.lib.parts = []; libInsts.fill(null); libInst = null; libSel = 0; }
        const ps = state.lib.parts;
        if (ps.some(p => p && p.id === stem)) { say(e.name + " is already playing"); return false; }
        let i = 0; while (i < MAX_PARTS && ((ps[i] && ps[i].id) || pend.has(i))) i++;
        if (i >= MAX_PARTS) { say("8 Studio, library and plugin sounds is the most at once"); return false; }
        keepFocusPlaying(); s.lib = false;
        say("Loading " + e.name + "…");
        pend.add(i); try { await assignPart(i, e, false); } finally { pend.delete(i); }   // (no note by itself)
        const ok = state.lib.parts[i] && state.lib.parts[i].id === stem;
        if (ok) { libSel = i; s.lib = false; }
        renderEngine(); save(); say(ok ? e.name + " added · playing together" : "Couldn't load " + e.name); return ok;
      }
      if (id.startsWith("n:")) {   // a Nate Bloom preset: its engines join the others
        const g = groupsOn(), prev = g.syn ? synOn() : [];
        const keepArp = {}; prev.forEach(k => { if (state.arp[k]) keepArp[k] = Object.assign({}, state.arp[k]); });   // (170) a classic sound sets its own arp, not theirs
        keepFocusPlaying();
        applyPreset(Number(id.slice(2)));
        prev.forEach(k => { state.layers[k].on = true; if (keepArp[k]) Object.assign(getArp(k), keepArp[k]); }); s.syn = false;
        try { arpClock(); } catch (e) {}
        renderEngine(); save(); say(e.name + " added · playing together"); return true;
      }
      if (id.startsWith("sp:")) {   // a Studio combination: its instruments join the others
        const P = NB_SPRESETS[Number(id.slice(3))]; if (!P) return false;
        let n = 0;
        for (const [pid, level, oct, lo, hi] of P.parts) {
          const inst = NB_INST[pid]; if (!inst) continue;
          if (await together({ id: "w:nb-" + pid, name: inst.name, sub: inst.sub, cat: "studio", sus: 1 })) {
            const pt = state.lib.parts.find(p => p && p.id === "nb-" + pid); if (pt) Object.assign(pt, { level, oct: oct || 0, lo: lo ?? 0, hi: hi ?? 127 }); n++;
          }
        }
        save(); renderEngine(); if (n) say(P.name + " added · playing together"); return n > 0;
      }
      if (id.startsWith("m:")) {
        keepFocusPlaying(); s.inst = false; state.engine = "inst"; state.cur = { id, cat: "mine" }; renderEngine(); save(); selectInstrument(id.slice(2), 0);
        say(e.name + " added · playing together"); return true;
      }
      say("That one doesn't play from the keys"); return false;
    }
    // (170) adding a sound never moves or stops what's held: the held notes stay where they are, arp and all
    { const t0 = together; together = async function (e) { nbKeepHeld++; try { return await t0.apply(this, arguments); } finally { nbKeepHeld--; } }; }
    window.__nbTogether = together;
    // tap a sound (the sound list, Play alone in Plugins): it plays alone; the arrows swap the highlighted one
    let swapping = false;
    const melodicPick = id => /^(w:|n:|m:|sp:)/.test(id) || (id.startsWith("e:") && (isSyn(id.slice(2)) || ["lib", "inst"].includes(id.slice(2))));
    async function swap(e, preview) {
      const it = items().find(isSel); if (!it) return ce0(e, preview);
      const id = e.id;
      if (it.t === "syn" && id.startsWith("e:") && isSyn(id.slice(2))) {
        const k = id.slice(2); if (k !== it.id) { state.layers[it.id].on = false; state.layers[k].on = true; }
        state.engine = k; state.melodic = k; state.cur = { id, cat: e.cat }; renderEngine(); save(); if (preview) previewSound(); return;
      }
      if (it.t === "syn" && id.startsWith("n:")) return ce0(e, preview);   // (a preset sets the engines; the rest play on)
      if (it.t === "lib" && id.startsWith("w:")) { const ps = state.lib.parts; if (ps.some((p, k) => p && k !== it.i && p.id === id.slice(2))) return; await assignPart(it.i, e, preview && !id.startsWith("w:wam:")); libSel = it.i; state.cur = { id, cat: e.cat }; return; }
      drop(it, true); return together(e);
    }
    const ce0 = chooseEntry;
    chooseEntry = async function (e, preview = true) {
      if (!e || typeof e.id !== "string") return ce0.apply(this, arguments);
      if (ADD.on && !brEl.hidden) { const r = await together(e); if (!brEl.hidden) renderBrowser(false); return r; }
      if (e.id.startsWith("w:wam:")) preview = false;   // plugins don't play a note by themselves
      if (melodicPick(e.id)) {
        if (swapping && items().length > 1) return swap(e, preview);
        const s = S(); s.syn = s.lib = s.inst = false; s.samp = -1;   // alone: the others stop
        const k = e.id.startsWith("e:") ? e.id.slice(2) : "";
        if (isSyn(k)) for (const x in state.layers) state.layers[x].on = x === k;
        if (e.id.startsWith("w:")) { const ps = state.lib.parts; for (let i = MAX_PARTS - 1; i >= 1; i--) if (ps[i]) removePart(i); if (ps[0]) ps[0].on = true; libSel = 0; }
      }
      return ce0.call(this, e, preview);
    };
    { const sp0 = stepSound; stepSound = function () { swapping = true; try { return sp0.apply(this, arguments); } finally { swapping = false; } }; }
    // plugins never play a note by themselves (Layers & zones, Play together, everywhere)
    { const ap0 = assignPart; assignPart = function (pi, entry, preview) { return ap0.call(this, pi, entry, preview && !(entry && typeof entry.id === "string" && entry.id.startsWith("w:wam:"))); }; }
    // a saved sound (My sounds, undo) keeps everything that played together
    { const cs = captureSound; captureSound = function () { const o = cs.apply(this, arguments); try { o.stack = JSON.parse(JSON.stringify(S())); } catch (e) {} return o; }; }
    { const as = applySound; applySound = function (sd) {
        const k = sd && sd.stack && typeof sd.stack === "object" ? sd.stack : null;
        state.stack = k ? { syn: !!k.syn, lib: !!k.lib, inst: !!k.inst, samp: Number.isInteger(k.samp) ? k.samp : -1, f: S().f } : Object.assign(NOSTK(), { f: S().f });
        const plug = !!(sd && sd.lib && Array.isArray(sd.lib.parts) && sd.lib.parts.some(p => p && PLUG(p.id)) && (sd.engine === "lib" || (k && k.lib)));
        if (plug && !sndQuiet) { sndQuiet = true; try { return as.apply(this, arguments); } finally { sndQuiet = false; try { msInfo.textContent = "Loaded \"" + sd.name + "\""; } catch (e) {} } }
        return as.apply(this, arguments);
      }; }
    // back to Synths: the sounds that were playing are still there
    document.addEventListener("click", ev => {
      const b = ev.target && ev.target.closest && ev.target.closest('.btn.mode[data-mode="synths"]'); if (!b || grp(state.engine)) return;
      const f = S().f; if (!grp(f) || (f === "inst" && !curInst)) return;
      ev.stopImmediatePropagation(); ev.preventDefault(); start();
      state.engine = f; if (ENGINES[f]) state.melodic = f;
      renderEngine(); save(); try { window.__nbPaintModes && __nbPaintModes(); } catch (e) {}
    }, true);
    // ⚙ in the library bar opens the highlighted plugin
    document.addEventListener("click", ev => {
      const b = ev.target && ev.target.closest && ev.target.closest("#wamCtl"); if (!b) return;
      const p = state.lib.parts[libSelOn()]; if (!p || !PLUG(p.id) || !window.__wam) return;
      ev.stopImmediatePropagation(); __wam.instrument(p.id).then(W => __wam.openGui(W)).catch(() => {});
    }, true);
    // ---- the strip ----
    const stk = document.getElementById("stk"), stkRow = document.getElementById("stkRow"), stkHelp = document.getElementById("stkHelp");
    const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
    function paint() {
      if (!stk) return;
      const synths = !["drum", "samp", "pads"].includes(state.engine);
      stk.hidden = !synths; if (!synths) return;
      if (grp(state.engine)) S().f = state.engine;
      S().ls = libSelOn();
      const its = items(), n = its.length;
      sweepMutes(its);
      stkRow.innerHTML = ""; stkRow.appendChild(el("span", "stk-lab", n > 1 ? "Playing together" : "Playing"));
      its.forEach(it => {
        const mu = isMuted(it);
        const c = el("div", "stk-chip" + (isSel(it) ? " sel" : "") + (it.off ? " off" : "") + (mu ? " muted" : "")); c.style.setProperty("--kc", KC[it.kind.replace(/^your /, "")] || KC[it.kind] || "var(--lilac)");
        if (it.kind === "your plugin") c.style.setProperty("--kc", KC["your plugin"]);
        const m = el("button", "sc-main"); m.innerHTML = "<i></i><span><b></b><small></small></span>";
        m.querySelector("b").textContent = it.name; m.querySelector("small").textContent = it.kind + (it.wait ? " · loading…" : it.off ? " · off, tap to turn on" : mu ? " · muted" : isSel(it) && n > 1 ? " · controls below" : "");
        m.setAttribute("aria-pressed", String(isSel(it))); m.setAttribute("aria-label", it.name + ", " + it.kind + (mu ? ", muted" : "") + (isSel(it) ? ", its controls are showing" : ". Show its controls"));
        m.addEventListener("click", () => { start(); focusOn(it); });
        c.appendChild(m);
        if (it.t === "lib" && PLUG(it.id) && NBW_OK()) { const g = el("button", "sc-g", "⚙"); g.title = it.name + "'s own controls"; g.setAttribute("aria-label", g.title); g.addEventListener("click", () => { start(); __wam.instrument(it.id).then(W => __wam.openGui(W)).catch(() => {}); }); c.appendChild(g); }
        // (172) the speaker mutes it and brings it back; ✕ takes it out of what's playing (+ in Quick sounds adds it again)
        if (n > 1 || mu) c.appendChild(muteBtn("sc-m", it));
        if (n > 1) { const x = el("button", "sc-x", "✕"); x.title = "Take " + it.name + " out (the others keep playing · + in Quick sounds adds it back)"; x.setAttribute("aria-label", "Take " + it.name + " out of what's playing"); x.addEventListener("click", () => { start(); drop(it); }); c.appendChild(x); }
        stkRow.appendChild(c);
      });
      const add = el("button", "btn stk-add", "+ Add"); add.title = "Play another sound together with " + (n === 1 ? its[0].name : "these"); add.setAttribute("aria-label", add.title);
      add.addEventListener("click", () => { ADD.on = true; openBrowser(); paintBrMode(); });
      stkRow.appendChild(add);
      stkHelp.innerHTML = "";
      if (n > 1) {
        const sel = its.find(isSel), t = el("span"); t.innerHTML = "<span class='long'><b>" + n + " play together</b> · tap one for its controls · the speaker mutes it · ✕ takes it out</span><span class='short'><b>" + n + " play together</b> · speaker: mute · ✕: take out</span>";
        stkHelp.appendChild(t);
        if (sel) { const b = el("button", "btn", "Only " + sel.name); b.title = "Stop the others and keep " + sel.name; b.addEventListener("click", () => { start(); only(sel); }); stkHelp.appendChild(b); }
      } else {
        const t = el("span"); t.innerHTML = "<span class='long'>Tap a Quick sound to switch · <b>+</b> plays it with this one</span><span class='short'>Tap a Quick sound to switch · <b>+</b> plays it with this one</span>";
        stkHelp.appendChild(t);
      }
      const lb = document.getElementById("wamCtl"); if (lb && state.engine === "lib") { const p = state.lib.parts[libSelOn()]; lb.hidden = !(p && PLUG(p.id)); if (p && PLUG(p.id)) lb.textContent = "⚙ " + p.name; }
    }
    const NBW_OK = () => !!(window.__wam && __wam.here);
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); try { paint(); } catch (e) {} return r; }; }
    { const us = updateSoundBar; updateSoundBar = function () { const r = us.apply(this, arguments); try { paint(); } catch (e) {} return r; }; }
    // the sound bar names the highlighted one when several play
    { const cl = currentLabel; currentLabel = function () {
        const r = cl.apply(this, arguments);
        try { const its = items(); if (its.length > 1 && grp(state.engine)) { const it = its.find(isSel); if (it) return [it.t === "syn" ? r[0] : it.name, "with " + (its.length - 1) + " more · ‹ › swap it · tap for all sounds"]; } } catch (e) {}
        return r;
      }; }
    // ---- the sound list: tap = alone, + Together = with what's playing ----
    const brEl = document.getElementById("browser"), brMode = document.getElementById("brMode");
    const inStack = id => {
      const g = groupsOn();
      if (id.startsWith("e:")) { const k = id.slice(2); return isSyn(k) ? g.syn && state.layers[k].on : k === "inst" ? g.inst : k === "samp" ? g.samp >= 0 : false; }
      if (id.startsWith("w:")) return g.lib && state.lib.parts.some(p => p && p.id === id.slice(2));
      return false;
    };
    const togOK = id => /^(w:|n:|m:|sp:)/.test(id) || (id.startsWith("e:") && (isSyn(id.slice(2)) || ["inst", "samp"].includes(id.slice(2))));
    function paintBrMode() {
      if (!brMode) return;
      const its = items(), names = its.map(x => x.name), list = names.length > 3 ? names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more" : names.join(" + ");
      brMode.hidden = pickFor != null;
      brMode.classList.toggle("add", ADD.on);
      brMode.innerHTML = ADD.on ? "<b>Adding to what's playing</b> (" + list.replace(/</g, "&lt;") + "). Tap a sound to add it, then Done."
        : its.length > 1 ? "Tap a sound to <b>play it alone</b> (stops " + list.replace(/</g, "&lt;") + ") · <b>+ Together</b> adds it to them."
        : "Tap a sound to <b>play it</b> · <b>+ Together</b> plays it along with " + list.replace(/</g, "&lt;") + ".";
    }
    { const rb = renderBrowser; renderBrowser = function () {
        const r = rb.apply(this, arguments);
        try {
          paintBrMode();
          if (pickFor != null) return r;
          brList.querySelectorAll(".br-row[data-id]").forEach(row => {
            const id = row.dataset.id; if (!togOK(id)) return;
            const on = inStack(id), b = el("button", "br-tog" + (on ? " on" : "")); b.innerHTML = on ? "✓<small>playing</small>" : "+<small>together</small>";
            const e = entryById(id), nm = e ? e.name : id;
            b.title = on ? nm + " is playing" : "Play " + nm + " together with what's playing"; b.setAttribute("aria-label", b.title);
            b.addEventListener("click", async () => { if (on) return; if (e) { b.innerHTML = "…<small>adding</small>"; await together(e); renderBrowser(false); } });
            const star = row.querySelector(".br-star"); if (star) star.before(b); else row.append(b);
          });
        } catch (e) {}
        return r;
      }; }
    if (brEl) new MutationObserver(() => { if (brEl.hidden) { ADD.on = false; } }).observe(brEl, { attributes: true, attributeFilter: ["hidden"] });
    // the old tab bar's pinned sounds move to ★ Favorites (the bar is gone in Synths)
    try { const ids = (tabCfg.sounds || []).filter(id => /^(w:|n:|sp:|m:)/.test(id) && !favs.includes(id)); if (ids.length) { favs = favs.concat(ids); saveFavs(); } } catch (e) {}
    // (My sounds: the old tab bar is gone in Synths, so no "+ Tab")
    { const rm = renderMySounds; renderMySounds = function () { const r = rm.apply(this, arguments); try { document.querySelectorAll("#msList .btn").forEach(b => { const t = b.textContent.trim(); if (/^[+✓] Tab$/.test(t)) { b.textContent = t[0] + " Quick"; b.title = t[0] === "+" ? "Put it in Quick sounds" : "In Quick sounds · tap to take it out"; b.addEventListener("click", () => setTimeout(paint, 0)); } }); } catch (e) {} return r; }; }
    setTimeout(() => { try { paint(); } catch (e) {} }, 0);
    // ---- Quick sounds: the sounds he pinned, then the engines (the ones that aren't hidden), then Inst ----
    const qkRow = document.getElementById("qkRow"), qkSheet = document.getElementById("qkSheet"), qkList = document.getElementById("qkList");
    const PIN = { on: false };
    const qkSaveTabs = () => { try { saveTabs(); } catch (e) {} try { renderTabs(); } catch (e) {} };
    function qkInfo(id) {
      try { const t = tabInfo(id); if (t) return t; } catch (e) {}
      const e = entryById(id); return e ? { name: e.name, sub: e.sub } : null;
    }
    // (the pins saved with the old tab bar: some, like Studio sounds, weren't known yet when the bar was drawn at start-up)
    try { const raw = JSON.parse(localStorage.getItem("nightbloom-tabs") || "{}"); if (Array.isArray(raw.sounds)) { const keep = raw.sounds.filter(x => typeof x === "string" && qkInfo(x)); tabCfg.sounds = keep.concat(tabCfg.sounds.filter(x => !keep.includes(x))); } } catch (e) {}
    function qkItems() {
      const out = [];
      (tabCfg.sounds || []).forEach(id => { const inf = qkInfo(id); if (inf) out.push({ id, pin: true, name: inf.name, sub: inf.sub || "" }); });
      Object.keys(ENGINES).forEach(id => { if (isSyn(id) && !(tabCfg.hidden || []).includes(id)) out.push({ id: "e:" + id, eng: id, name: ENGINES[id].short || ENGINES[id].name, sub: (typeof TAB_SUB !== "undefined" && TAB_SUB[id]) || "" }); });
      out.push({ id: "e:inst", name: "Inst", sub: "SF2 · SFZ" });
      return out;
    }
    const qkEntry = q => q.id.startsWith("e:") ? { id: q.id, name: q.eng ? ENGINES[q.eng].name : "My instrument", cat: "engines" } : entryById(q.id);
    function qkPlaying(q) {
      if (q.id.startsWith("e:") || q.id.startsWith("w:")) return inStack(q.id);
      if (q.id.startsWith("m:")) return groupsOn().inst && state.cur && state.cur.id === q.id;
      return false;
    }
    async function qkAlone(q) {
      start();
      if (q.id.startsWith("my:")) { try { useSoundTab(q.id); } catch (e) {} return; }
      const e = qkEntry(q); if (!e) return;
      await chooseEntry(e, !q.id.startsWith("e:"));   // (an engine switches quietly, like its tab did; a sound plays a short note, plugins never)
      if (q.pin) { state.cur = { id: q.id, cat: e.cat || state.cur && state.cur.cat }; save(); }
      paint();
    }
    // (172) the playing sound a Quick tile stands for
    const qkItemOf = (q, its) => its.find(x => (q.eng && x.t === "syn" && x.id === q.eng) || (q.id.startsWith("w:") && x.t === "lib" && x.id === q.id.slice(2)) || (q.id === "e:inst" && x.t === "inst"));
    async function qkToggle(q) {
      start();
      if (qkPlaying(q)) {
        const it = qkItemOf(q, items());
        if (it) drop(it); return;
      }
      const e = qkEntry(q); if (!e) return;
      await together(e); paint();
    }
    window.__qkLive = { items: () => qkItems(), alone: q => qkAlone(q), toggle: q => qkToggle(q), playing: q => qkPlaying(q), canLayer: id => !String(id).startsWith("my:") && togOK(id) };
    function paintQuick() {
      if (!qkRow) return;
      const sc = qkRow.scrollLeft; qkRow.innerHTML = "";
      const togOn = q => !q.id.startsWith("my:") && togOK(q.id);
      const its = items(), many = its.length > 1;
      qkItems().forEach(q => {
        const on = qkPlaying(q), cur = !!(state.cur && state.cur.id === q.id), it = on ? qkItemOf(q, its) : null, mu = !!(it && isMuted(it));
        const t = el("div", "qk-t" + (on ? " on" : "") + (cur ? " cur" : "") + (mu ? " muted" : ""));
        const m = el("button", "qm"); m.innerHTML = "<b></b><small></small>"; m.querySelector("b").textContent = q.name; m.querySelector("small").textContent = mu ? "muted" : q.sub;
        m.title = "Play " + q.name + " alone"; m.setAttribute("aria-label", m.title);
        m.addEventListener("click", () => qkAlone(q));
        t.appendChild(m);
        if (it && (many || mu)) t.appendChild(muteBtn("qs", it));   // (172) mute right on the tile while it plays with others
        if (togOn(q)) {
          const p = el("button", "qp", on ? "✓" : "+");
          p.title = on ? q.name + " is playing · tap to take it out" : "Play " + q.name + " together with what's playing"; p.setAttribute("aria-label", p.title);
          p.addEventListener("click", () => qkToggle(q));
          t.appendChild(p);
        }
        qkRow.appendChild(t);
      });
      const ed = el("button", "btn qk-ed", "✎"); ed.title = "Choose the Quick sounds"; ed.setAttribute("aria-label", ed.title);
      ed.addEventListener("click", () => { qkSheet.hidden = false; qkPaint(); });
      qkRow.appendChild(ed);
      qkRow.scrollLeft = sc;
    }
    // ✎: what's in the row
    function qkPaint() {
      qkList.innerHTML = "";
      const row = (title, sub, btns) => { const r = el("div", "lk-row"), g = el("div", "grow"); g.append(el("b", "", title), el("small", "", sub)); r.append(g, ...btns); return r; };
      const b = (txt, fn, aria) => { const x = el("button", "btn", txt); if (aria) x.setAttribute("aria-label", aria); x.addEventListener("click", () => { fn(); qkSaveTabs(); qkPaint(); paint(); }); return x; };
      const pins = tabCfg.sounds || [];
      qkList.appendChild(el("div", "bt-style", "Your sounds"));
      if (!pins.length) qkList.appendChild(el("small", "", "None yet. + Add a sound puts any sound from the list here."));
      pins.forEach((id, i) => {
        const inf = qkInfo(id) || { name: id, sub: "" }, bs = [];
        if (i > 0) bs.push(b("◀", () => { pins.splice(i - 1, 0, pins.splice(i, 1)[0]); }, "Move " + inf.name + " left"));
        if (i < pins.length - 1) bs.push(b("▶", () => { pins.splice(i + 1, 0, pins.splice(i, 1)[0]); }, "Move " + inf.name + " right"));
        bs.push(b("Remove", () => { pins.splice(i, 1); }, "Take " + inf.name + " out of Quick sounds"));
        qkList.appendChild(row(inf.name, inf.sub || "", bs));
      });
      qkList.appendChild(el("div", "bt-style", "Engines"));
      Object.keys(ENGINES).filter(isSyn).forEach(id => {
        const hid = (tabCfg.hidden || []).includes(id);
        qkList.appendChild(row(ENGINES[id].name, hid ? "hidden" : "in the row", [b(hid ? "Show" : "Hide", () => { const h = tabCfg.hidden; const k = h.indexOf(id); if (k >= 0) h.splice(k, 1); else h.push(id); }, (hid ? "Show " : "Hide ") + ENGINES[id].name)]));
      });
      if ((tabCfg.hidden || []).length) qkList.appendChild(b("Show all the engines", () => { tabCfg.hidden = []; }));
    }
    document.getElementById("qkDone").addEventListener("click", () => { qkSheet.hidden = true; });
    document.getElementById("qkAdd").addEventListener("click", () => { qkSheet.hidden = true; PIN.on = true; openBrowser(); paintBrMode(); });
    function qkPin(e) {
      const id = e.id;
      if (id.startsWith("e:") && isSyn(id.slice(2))) { const h = tabCfg.hidden, k = h.indexOf(id.slice(2)); if (k >= 0) h.splice(k, 1); }
      else if (/^(w:|n:|sp:|m:)/.test(id)) { if (!tabCfg.sounds.includes(id)) tabCfg.sounds.push(id); }
      else { say("That one can't go in Quick sounds"); return; }
      qkSaveTabs(); paint(); say(e.name + " is in Quick sounds");
    }
    // back to ✎ when the list closes: in the same tap, so the sheet takes over the list's place in Back history
    document.getElementById("brDone").addEventListener("click", () => { if (PIN.on && brEl.hidden) { PIN.on = false; qkSheet.hidden = false; qkPaint(); } });
    if (brEl) new MutationObserver(() => { if (brEl.hidden) PIN.on = false; }).observe(brEl, { attributes: true, attributeFilter: ["hidden"] });
    { const ce = chooseEntry; chooseEntry = async function (e) { if (PIN.on && !brEl.hidden && e && typeof e.id === "string") { qkPin(e); renderBrowser(false); return; } return ce.apply(this, arguments); }; }
    { const pb = paintBrMode; paintBrMode = function () { pb(); if (PIN.on && brMode) { brMode.hidden = false; brMode.classList.add("add"); brMode.innerHTML = "<b>Adding to Quick sounds.</b> Tap a sound to put it in the row, then Done."; } }; }
    { const rb = renderBrowser; renderBrowser = function () { const r = rb.apply(this, arguments); if (PIN.on) brList.querySelectorAll(".br-tog").forEach(x => x.remove()); return r; }; }
    { const p0 = paint; paint = function () { p0(); try { if (!stk.hidden) paintQuick(); } catch (e) {} }; }
    setTimeout(() => { try { paint(); } catch (e) {} }, 0);
    window.__qk = { items: qkItems, alone: qkAlone, toggle: qkToggle, pin: qkPin, paint: paintQuick, PIN };
    window.__stk = { items, groupsOn, together, drop, only, focusOn, swap: e => swap(e, false), isSel, paint: () => paint(), S, libSel: () => libSelOn(), keys: () => voiceComponents().map(c => c.name),
      seqVoices: () => { if (!ctx) return 0; const t = ctx.currentTime + 0.05, vs = melodicVoices(60, t, 0.01); vs.forEach(v => v.stop(t + 0.02)); return vs.length; } };
  }
