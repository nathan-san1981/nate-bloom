  // ======================================================================
  // MiniLab 3: Arturia's controller gets a layout on every screen. Knobs shape what's on the screen, faders mix,
  // pads play, the big knob picks (turn) and plays (click). MIDI learn keeps each mapping on the screen it was
  // made on, so a knob turned on the Rhythm Creator never touches the synth. The MiniLab's knobs are endless, so a
  // knob takes over from wherever each control already is (no jumps); a fader catches up as it moves.
  // ======================================================================
  {
    const ML = { mode: "auto", lights: false, badges: true, padCh: 9, hw: new Map(), encRel: new Set(), encRun: new Map(), virt: new Map(), fad: new Map(), mainAbs: new Set(), mainRun: new Map(),
      page: "", pgNow: "", pgAt: 0, dev: "ml", devSet: false, keyWay: new Map(), lay: null, layAt: 0, layPage: "", shift: false, held: new Map(), mon: "", seen: false, writeGrid: false, sent: new Map(), hudT: 0, gbDo: 0, src: false };
    try { const o = JSON.parse(localStorage.getItem("nightbloom-minilab") || "{}"); if (["auto", "off", "any"].includes(o.mode)) ML.mode = o.mode; ML.lights = !!o.lights; if (o.badges === false) ML.badges = false; if (o.padCh >= 0 && o.padCh < 16) ML.padCh = o.padCh | 0; } catch (e) {}
    const mlSave = () => { try { localStorage.setItem("nightbloom-minilab", JSON.stringify({ mode: ML.mode, lights: ML.lights, badges: ML.badges, padCh: ML.padCh, strip: ML.strip, stripPads: ML.stripPads })); } catch (e) {} };
    const isML0 = p => !!p && /mini\s*lab\s*(3|iii|mk\s*3)|minilab3/i.test((p.name || "") + " " + (p.manufacturer || ""));
    // (173) the KeyLab Essential 61 mk3 gets the same layouts: knobs 1–8 and faders 1–4 as the MiniLab's, and its knob 9,
    // faders 5–9 and display buttons on top. Its ports: "KL Essential 61 mk3 MIDI" (and DINTHRU, MCU/HUI, ALV).
    const isKL = p => !!p && /key\s*lab\s*essential|kl\s*essential/i.test((p.name || "") + " " + (p.manufacturer || ""));
    const isML = p => isML0(p) || isKL(p);
    window.__klHere = () => !!md.access && [...md.access.inputs.values()].some(i => md.ins.has(i.id) && isKL(i));
    const mlPortOn = p => ML.mode === "any" ? true : ML.mode === "off" ? false : isML(p);
    // is a MiniLab (or, with "any controller", anything) plugged in and switched on in the MIDI sheet?
    const mlLive = () => {
      if (!md.access || ML.mode === "off") return false;
      const ins = [...md.access.inputs.values()].filter(i => md.ins.has(i.id) && mlPortOn(i) && !/mcu|hui|alv|din/i.test(i.name || ""));
      if (!ML.devSet && ins.length) { const nd = ins.some(isKL) && !ins.some(isML0) ? "kl" : "ml"; if (nd !== ML.dev) { ML.dev = nd; ML.lay = null; } }   // (until one of them is played: then the one played last)
      return ins.length > 0;
    };
    // ---------- the MiniLab's controls: the Arturia program and the DAW program send different numbers ----------
    const ENC = [[74, 71, 76, 77, 93, 18, 19, 16], [86, 87, 89, 90, 110, 111, 116, 117]];
    const FAD = [[82, 83, 85, 17], [14, 15, 30, 31]];
    const MAIN = { 114: "turn", 112: "sturn", 115: "click", 113: "sclick", 28: "turn", 29: "sturn", 118: "click", 119: "sclick" };
    const SHIFT_CC = [9, 27];
    const KL_ENC = [74, 71, 76, 77, 93, 18, 19, 16, 17], KL_FAD = [73, 75, 79, 72, 80, 81, 82, 83, 85], KL_BTN = { 30: 1, 31: -1 };   // (its factory program: knobs 1–9, faders 1–9, the display's ‹ ›)
    function ctlOf(cc) {
      if (ML.dev === "kl") {
        let i = KL_ENC.indexOf(cc); if (i >= 0) return { kind: "K", i };
        i = KL_FAD.indexOf(cc); if (i >= 0) return { kind: "F", i };
        if (KL_BTN[cc]) return { kind: "B", d: KL_BTN[cc] };
        if (MAIN[cc]) return { kind: "M", a: MAIN[cc] };
        if (SHIFT_CC.includes(cc)) return { kind: "S" };
        return null;
      }
      for (const s of ENC) { const i = s.indexOf(cc); if (i >= 0) return { kind: "K", i }; }
      for (const s of FAD) { const i = s.indexOf(cc); if (i >= 0) return { kind: "F", i }; }
      if (MAIN[cc]) return { kind: "M", a: MAIN[cc] };
      if (SHIFT_CC.includes(cc)) return { kind: "S" };
      return null;
    }
    // ---------- which screen you're on ----------
    const shown = id => { const el = document.getElementById(id); return !!el && !el.hidden && el.getClientRects().length > 0; };
    function mlPage() {
      if (shown("mixer")) return "mix";
      if (shown("gbView")) return "garage";
      if (shown("bpView")) return "pads";
      if (shown("rcView")) return "grid";
      if (shown("djView")) return "dj";
      const e = state.engine; return e === "drum" ? "drums" : (e === "samp" || e === "pads") ? "samples" : "synths";
    }
    const pageNow = () => { const t = performance.now(); if (t - ML.pgAt > 120) { ML.pgNow = mlPage(); ML.pgAt = t; } return ML.pgNow; };
    const PAGE_NAME = { synths: "Synths", samples: "Samples", drums: "Drums", dj: "DJ", grid: "Rhythm", pads: "Beats", garage: "Garage", mix: "Mixer", all: "every screen" };
    // ---------- controls as targets: what's already learnable, plus a selector and a function ----------
    const Q = (s, i, n) => ({ k: "q", s, i: i || 0, n });
    const FNS = {};
    const FN = (id, o) => { FNS[id] = o; return { k: "fn", id }; };
    { const lf = learnFind; learnFind = function (t) { if (t && t.k === "q") return document.querySelectorAll(t.s)[t.i || 0] || null; return lf.apply(this, arguments); }; }
    { const la = learnApply; learnApply = function (t, v) {
        if (t && t.k === "fn") { const F = FNS[t.id]; if (!F) return false; F.set(Math.max(0, Math.min(1, v))); return true; }
        if (t && t.k === "q") {
          const el = learnFind(t); if (!el) return false;
          if (el.tagName === "SELECT") {
            const n = el.options.length; if (!n) return false; const i = Math.max(0, Math.min(n - 1, Math.round(v * (n - 1))));
            if (el.selectedIndex !== i) { el.selectedIndex = i; el.dispatchEvent(new Event("change", { bubbles: true })); }
            return true;
          }
        }
        return la.apply(this, arguments);
      }; }
    function mlGet(t) {
      if (!t) return null;
      if (t.k === "fn") { const F = FNS[t.id]; const v = F && F.get(); return v == null || isNaN(v) ? null : v; }
      if (t.k === "xy") return t.axis === "y" ? mo.y : mo.x;
      const el = t.k === "wam" || t.k === "wv" ? null : learnFind(t); if (!el) return null;
      if (el.__nbGet) return el.__nbGet();
      if (el.classList && el.classList.contains("knob")) return (+el.getAttribute("aria-valuenow") || 0) / 100;
      if (el.tagName === "SELECT") { const n = el.options.length; return n > 1 ? el.selectedIndex / (n - 1) : 0; }
      if (el.type === "range") { const lo = el.min === "" ? 0 : +el.min, hi = el.max === "" ? 100 : +el.max; return hi > lo ? (+el.value - lo) / (hi - lo) : 0; }
      return null;
    }
    function mlSteps(t) {   // how many values a control has (0: smooth)
      if (!t) return 0;
      if (t.k === "fn") return (FNS[t.id] && FNS[t.id].steps) || 0;
      const el = t.k === "wam" || t.k === "wv" || t.k === "xy" ? null : learnFind(t); if (!el) return 0;
      if (el.tagName === "SELECT") return Math.max(1, el.options.length - 1);
      if (el.type === "range" && el.step && el.step !== "any") { const lo = el.min === "" ? 0 : +el.min, hi = el.max === "" ? 100 : +el.max; const n = Math.round((hi - lo) / +el.step); return n > 0 && n <= 200 ? n : 0; }
      return 0;
    }
    const pct = v => Math.round(v * 100) + "%";
    const NAME_FIX = { sfLen: "Stretch", sfPitch: "Pitch", djXf: "Crossfader" };
    function mlName(t, fall) {
      if (t && t.n) return t.n;
      if (t && t.k === "fn") { const F = FNS[t.id]; return F ? (typeof F.name === "function" ? F.name() : F.name) : fall || ""; }
      if (t && t.k === "xy") return "XY pad " + (t.axis === "y" ? "up–down" : "left–right");
      const el = t && learnFind(t); if (!el) return fall || "";
      const lab = el.closest("label"), sp = lab && lab.querySelector("span");
      if (sp && sp.firstChild && sp.firstChild.nodeType === 3 && sp.firstChild.textContent.trim()) return sp.firstChild.textContent.trim();
      if (NAME_FIX[el.id]) return NAME_FIX[el.id];
      const al = el.getAttribute("aria-label"); if (al) return al.replace(/ volume$/, "").split(/[:,(]/)[0].trim();
      return fall || "";
    }
    function mlText(t) {
      if (!t) return "";
      if (t.k === "fn") { const F = FNS[t.id]; return F && F.text ? F.text() : pct(mlGet(t) || 0); }
      if (t.k === "xy") return pct(mlGet(t) || 0);
      const el = learnFind(t); if (!el) return "";
      if (el.classList.contains("knob")) { const kv = el.querySelector(".k-val"); return kv ? kv.textContent : ""; }
      if (el.tagName === "SELECT") { const o = el.options[el.selectedIndex]; return o ? o.textContent : ""; }
      const vt = el.getAttribute("aria-valuetext"); if (vt) return vt;
      const box = el.closest("label, .mx-row, .rc-k, .dj-sl"), out = box && box.querySelector("em, output, .mx-val");
      if (out && out.textContent.trim()) return out.textContent.trim();
      const v = mlGet(t); return v == null ? "" : pct(v);
    }
    // ---------- the knobs: endless, so each turn moves the control from where it is ----------
    const relOf = v => v >= 57 && v <= 71 ? v - 64 : v >= 1 && v <= 15 ? v : v >= 113 ? v - 128 : 0;
    // a knob set to a relative mode (a User program can be) sends the same ±1 every click; a count never repeats
    // in the middle. Three repeats in a row say relative; a value no relative knob sends says a count again.
    function encMode(key, v, h0) {
      const R = ML.encRun.get(key) || { n: 0 };
      if (h0 != null && v === h0 && v > 0 && v < 127 && relOf(v)) R.n++; else if (h0 != null && v !== h0) R.n = 0;
      ML.encRun.set(key, R);
      if (R.n >= 2) ML.encRel.add(key);
      if ((v > 15 && v < 57) || (v > 71 && v < 113)) ML.encRel.delete(key);
      return ML.encRel.has(key);
    }
    function mlEncoder(key, v, t) {
      const h0 = ML.hw.get(key); ML.hw.set(key, v);
      let d;
      if (encMode(key, v, h0)) { d = relOf(v); if (!d) return false; }
      else {
        if (h0 == null) return false;   // (the first value only says where the MiniLab's count is)
        d = v - h0;
        if (Math.abs(d) > 30) return false;   // a jump: the MiniLab was switched off and on, or changed program; start from here
        if (!d) { if (v >= 127) d = 1; else if (v <= 0) d = -1; else return false; }   // turning on past the end
      }
      const steps = mlSteps(t), unit = steps ? Math.max(1 / 127, 1 / (steps * 3)) : 1 / 127, tol = steps ? Math.max(0.02, 0.5 / steps + 0.002) : 0.02;
      const tk = JSON.stringify(t), cur = mlGet(t);
      let x = ML.virt.get(tk);
      if (cur != null && (x == null || Math.abs(x - cur) > tol)) x = cur;   // moved on the screen since, or the first time
      if (x == null) x = 0.5;
      // one click, one step; a little faster only when the MiniLab's own count would run out before the control's end
      let r = 1;
      if (!ML.encRel.has(key) && h0 != null) {
        if (d > 0) { const H = 127 - h0, T = (1 - x) / unit; if (H > 0 && T > H) r = Math.min(4, T / H); }
        else { const H = h0, T = x / unit; if (H > 0 && T > H) r = Math.min(4, T / H); }
      }
      x = Math.max(0, Math.min(1, x + d * unit * r));
      ML.virt.set(tk, x);
      return learnApply(t, x);
    }
    // ---------- the faders: they have a place, so they catch the control up instead of jumping it ----------
    function mlFader(key, v, t) {
      const h0 = ML.hw.get(key); ML.hw.set(key, v);
      const y = v / 127, cur0 = mlGet(t); if (cur0 == null) return learnApply(t, y);
      const steps = mlSteps(t), tol = steps ? Math.max(0.02, 0.5 / steps + 0.002) : 0.02;
      const tk = JSON.stringify(t), vx = ML.virt.get(tk), cur = vx != null && Math.abs(vx - cur0) <= tol ? vx : cur0;   // (where it really is, between the steps a control rounds to)
      const L = ML.fad.get(tk);
      if ((L && L.key === key && Math.abs(cur - L.v) <= tol) || Math.abs(cur - y) < 0.03) { ML.fad.set(tk, { key, v: y }); ML.virt.set(tk, y); return learnApply(t, y); }
      if (h0 == null || h0 === v) return false;
      const a = h0 / 127; let x;
      if (v > h0) x = cur + (y - a) * (1 - cur) / Math.max(1e-3, 1 - a);   // both reach the top together
      else x = cur - (a - y) * cur / Math.max(1e-3, a);                    // both reach the bottom together
      x = Math.max(0, Math.min(1, x));
      if (Math.abs(x - y) < 0.03) x = y;
      ML.fad.set(tk, { key, v: x === y ? y : -9 });   // (caught: from now on it follows the fader)
      ML.virt.set(tk, x);
      return learnApply(t, x);
    }
    // ---------- the big knob: relative (64 ± n, or 1–15 up and 113–127 down) or a plain count ----------
    function mlDir(key, v) {
      const last = ML.hw.get(key); ML.hw.set(key, v);
      const run = ML.mainRun.get(key) || { d: 0, n: 0, same: 0 };
      if (last != null && v === last && v > 0 && v < 127) { run.same++; run.n = 0; } else run.same = 0;
      if ((v > 15 && v < 56) || (v > 72 && v < 113)) ML.mainAbs.add(key);
      else if (last != null && v !== last && v !== 64 && last !== 64 && Math.abs(v - last) === 1) {   // four steps of one the same way near 64: a count, not ±1s
        const d = Math.sign(v - last); if (d === run.d) run.n++; else { run.d = d; run.n = 1; }
        if (run.n >= 4) ML.mainAbs.add(key);
      }
      if (run.same >= 2 && relOf(v)) ML.mainAbs.delete(key);   // the same ±1 again and again: relative after all
      ML.mainRun.set(key, run);
      if (!ML.mainAbs.has(key)) {
        if (v >= 57 && v <= 71) return Math.sign(v - 64);
        if (v >= 1 && v <= 15) return 1;
        if (v >= 113) return -1;
        return 0;
      }
      if (last == null) return 0;
      return v > last ? 1 : v < last ? -1 : v >= 127 ? 1 : v <= 0 ? -1 : 0;
    }
    // ---------- pieces the layouts use ----------
    const $id = id => document.getElementById(id);
    const tap = id => { const b = typeof id === "string" ? $id(id) : id; if (b && !b.disabled) b.click(); };
    const withVel = (vel, fn) => { const v = NB_VEL, v7 = NB_VEL7; NB_VEL = mdVelGain(vel); NB_VEL7 = vel; try { return fn(); } finally { NB_VEL = v; NB_VEL7 = v7; } };
    let mlSaveT = 0; const saveSoon = () => { clearTimeout(mlSaveT); mlSaveT = setTimeout(() => { try { save(); } catch (e) {} }, 400); };
    // a mixer channel as a control (the level the Mixer shows, on its own curve)
    function mixFn(id, pick, label) {
      const ch = () => { try { return pick(mixChannels()); } catch (e) { return null; } };
      return FN("mix:" + id, {
        get() { const c = ch(); return c ? mxPos(c.get(), c.law) / 100 : null; },
        set(v) { const c = ch(); if (!c) return; c.set(mxLevel(v * 100, c.law)); saveSoon(); },
        text() { const c = ch(); return c ? (c.get() > 0 ? mxDb(c.get(), c.dflt, c.law) : "off") : "—"; },
        name() { const c = ch(); return c ? c.name.replace(/ volume$/, "") : label; },
      });
    }
    const F_NOW = mixFn("now", ch => {
      const e = state.engine;
      if (e === "drum") return ch.find(c => c.name === "All drums");
      if (e === "samp") return ch.find(c => c.name.startsWith("S" + (state.samp.slot + 1) + " · "));
      if (e === "pads") return ch.find(c => c.name.startsWith("P" + (state.pads.sel + 1) + " · "));
      return ch.find(c => c.group === "Playing now" && !["All drums", "Notation pad", "All tracks"].includes(c.name) && !/^Deck |^DJ /.test(c.name)) || ch.find(c => c.group === "Playing now");
    }, "This sound");
    const F_RC = mixFn("rc", ch => ch.find(c => c.name === "Rhythm Creator"), "Rhythm Creator");
    const F_MASTER = mixFn("master", ch => ch.find(c => c.name === "Master volume"), "Master volume");
    const F_BP = mixFn("bp", ch => ch.find(c => c.name === "Beat Pads"), "Beat Pads");
    const F_FX = Q("#fxKnobs .knob", 5, "Effects amount");
    const MIXF = [F_NOW, F_RC, F_FX, F_MASTER];
    // the open panel's knobs and sliders (Sound, FX, Arp, Motion…), then FX knobs to make up eight
    function panelControls() {
      const p = state.panel, rowId = { sound: "engineRow", hide: "engineRow", jam: "engineRow", fx: "fxRow", lab: "fxRow", arp: "arpRow", morph: "morphRow" }[p] || "engineRow";
      const row = $id(rowId), out = [];
      const vis = el => el.getClientRects().length > 0 && !el.closest("[hidden]");
      if (row) {
        const els = [...row.querySelectorAll(rowId === "morphRow" ? "#moMacs .knob" : rowId === "fxRow" ? "#fxKnobs .knob" : rowId === "arpRow" ? "#arpMode, #arpRate, #arpGate" : ".knob, input[type=range]")];
        els.forEach(el => { if (out.length < 8 && (vis(el) || rowId === "engineRow" && el.classList.contains("knob") && el.closest("#engineKnobs"))) out.push(el); });
      }
      const T = out.map(el => {
        if (el.id) return Q("#" + CSS.escape(el.id));
        const box = el.closest("[id]"), all = box ? [...box.querySelectorAll(el.classList.contains("knob") ? ".knob" : "input[type=range]")] : [];
        return box ? Q("#" + CSS.escape(box.id) + (el.classList.contains("knob") ? " .knob" : " input[type=range]"), all.indexOf(el)) : null;
      }).filter(Boolean);
      // make up eight: the effects that matter most while playing, then the sound's own knobs
      const fill = rowId === "engineRow" ? [3, 2, 0, 1].map(i => Q("#fxKnobs .knob", i)) : [0, 1, 2, 3, 4, 5].map(i => Q("#engineKnobs .knob", i));
      for (const f of fill) { if (T.length >= 8) break; if (learnFind(f) && !T.some(x => x.s === f.s && x.i === f.i)) T.push(f); }
      while (T.length < 8) T.push(null);
      return T;
    }
    // chords in the key you've set (Scale), or C major: I ii iii IV V vi vii° and I an octave up
    const NN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    function keyChords() {
      const sc = SCALES.find(x => x[0] === scl.scale), iv = sc && sc[2] && sc[2].length === 7 ? sc[2] : [0, 2, 4, 5, 7, 9, 11];
      const nm = sc && sc[2] && sc[2].length === 7 ? sc[1].toLowerCase() : "major";
      const deg = d => iv[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
      const out = [];
      for (let d = 0; d < 8; d++) {
        const root = 48 + scl.key + deg(d), tones = [0, 2, 4].map(j => 48 + scl.key + deg(d + j));
        const third = tones[1] - tones[0], fifth = tones[2] - tones[0];
        const q = third === 3 && fifth === 6 ? "°" : third === 3 ? "m" : fifth === 8 ? "+" : "";
        out.push({ name: NN[root % 12] + q, tones, root });
      }
      return { chords: out, key: NN[scl.key] + " " + nm };
    }
    const GM_DR = ["kick", "rim", "snare", "clap", "snare", "tom", "ch", "tom", "ch", "tom", "oh", "cow"];   // by note in the octave, as General MIDI lays drums out
    const DRUM_COL = { kick: "#ff6b6b", snare: "#ffb65c", clap: "#ffd54f", ch: "#7fd6c2", oh: "#5cc8ff", tom: "#c4a3ff", rim: "#ff8ac6", cow: "#b8e986" };
    function drumPad(id, name) {
      return { n: name, c: DRUM_COL[id] || "#c4a3ff", down(vel) {
        start(); if (!ctx) return;
        if (more3Ready && state.drumSel !== id && state.engine === "drum") { state.drumSel = id; renderDrumPanel(); save(); }
        const D = state.drumPads && state.drumPads[id], v0 = D ? D.vol : null;
        if (D) D.vol = v0 * Math.min(1.25, mdVelGain(vel));   // (how hard: the drum's level for this one hit)
        try { playDrum(id, ctx.currentTime); } finally { if (D) D.vol = v0; }
      } };
    }
    // a pad's own notes: made straight from the sound (no Scale snap, no Garage detour), stopped by the same pad or ■
    const PV = new Map();
    function padVoices(id, notes, vel, setup) {
      padStop(id);
      const made = []; PV.set(id, made);
      const ct = chordType, eng = state.engine, slot = state.samp.slot; chordType = "off";
      try { if (setup) setup(); withVel(vel, () => notes.forEach(m => { const v = makeNote(m); if (v) made.push(v); })); }
      finally { chordType = ct; state.engine = eng; state.samp.slot = slot; }
    }
    function padStop(id) { const vs = PV.get(id); if (!vs) return; PV.delete(id); vs.forEach(v => { try { v.stop(); } catch (e) {} }); }
    const padStopAll = () => [...PV.keys()].forEach(padStop);
    ["stopAll", "panic"].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener("click", padStopAll); });
    function chordPad(i) {
      const kc = keyChords(), ch = kc.chords[i];
      return { n: ch.name, c: "#c4a3ff", down(vel) { start(); if (!ctx) return; padVoices("ch" + i, ch.tones, vel); }, up() { padStop("ch" + i); } };
    }
    // the sampler: a slot plays its sample at its own pitch while you hold the pad
    function slotPad(i) {
      const sl = state.samp.slots[i], has = !!sampBuf[i];
      return { n: "S" + (i + 1) + (has && sl.name ? " " + baseName(sl.name).slice(0, 8) : ""), c: has ? "#ffb65c" : null, down(vel) {
        start(); if (!ctx || !sampBuf[i]) return;
        if (state.engine === "samp" && state.samp.slot !== i) { state.samp.slot = i; renderEngine(); save(); }
        padVoices("slot" + i, [60], vel, () => { state.engine = "samp"; state.samp.slot = i; });
      }, up() { padStop("slot" + i); } };
    }
    function samplePad(k) {
      const has = !!padBuf[k];
      return { n: "P" + (k + 1) + (has ? " " + baseName(state.pads.names[k] || "").slice(0, 8) : ""), c: has ? "#7fd6c2" : null, down() { start(); if (!ctx) return; if (state.engine === "pads") kitPadDown(k); else playPad(k); } };
    }
    // ---------- the layouts: K knobs 1–8, F faders 1–4, P pads 1–16 (MiniLab bank A then B), M the big knob ----------
    // the next sound of the list you're in (as ‹ › do), staying on Synths: the sampler, pads and drums are skipped
    function nextSound(d) {
      const all = allEntries().filter(x => x.cat !== "kits" && !/^e:(samp|pads|drum)$/.test(x.id));
      let cat = state.cur && state.cur.cat; if (!cat || cat === "kits" || (cat === "fav" && !favs.length)) cat = "engines";
      const list = cat === "fav" ? all.filter(x => favs.includes(x.id)) : all.filter(x => x.cat === cat);
      if (!list.length) return;
      let i = list.findIndex(x => state.cur && x.id === state.cur.id);
      if (i < 0) i = list.findIndex(x => x.id === "e:" + state.engine);
      i = i < 0 ? 0 : (i + d + list.length) % list.length;
      chooseEntry(list[i]); if (cat === "fav" && state.cur) state.cur.cat = "fav";
    }
    const L = {};
    L.synths = () => {
      const kc = keyChords();
      return { K: panelControls(), F: MIXF,
        P: DRUMS.map(([id, code, name]) => drumPad(id, code)).concat([0, 1, 2, 3, 4, 5, 6, 7].map(chordPad)),
        pa: "Drums (the Drums tab's kit)", pb: "Chords in " + kc.key + (scl.scale === "off" ? " (set a key with Scale)" : ""),
        M: { turn: ["Next sound", d => nextSound(d)], click: ["Play / stop the Seq", () => tap("play")], sturn: ["Tempo", d => tap(d > 0 ? "bpmUp" : "bpmDown")], sclick: ["● Rec", () => tap("takeBtn")] },
        keys: "Play the sound" };
    };
    L.samples = () => {
      const padsView = state.engine === "pads", P = [];
      if (padsView) { for (let k = 0; k < 12; k++) P.push(samplePad(k)); for (let i = 0; i < 4; i++) P.push(slotPad(i)); }
      else { for (let i = 0; i < 8; i++) P.push(slotPad(i)); for (let k = 0; k < 8; k++) P.push(samplePad(k)); }
      return { K: panelControls(), F: MIXF, P,
        pa: padsView ? "Pads P1–P8" : "Sampler slots S1–S8 (held: plays the sample)", pb: padsView ? "Pads P9–P12, then slots S1–S4" : "Pads P1–P8",
        M: { turn: [padsView ? "Pick a pad" : "Pick a slot", d => {
            if (padsView) { const k = ((state.pads.sel + d) % NPADS + NPADS) % NPADS; state.pads.sel = k; padEls.forEach((el, id) => el.classList.toggle("sel", id === "k" + k)); renderPadsPanel(); save(); }
            else { state.samp.slot = ((state.samp.slot + d) % NSLOTS + NSLOTS) % NSLOTS; renderEngine(); save(); }
          }], click: ["Play / stop the Seq", () => tap("play")], sturn: ["Tempo", d => tap(d > 0 ? "bpmUp" : "bpmDown")], sclick: ["● Rec", () => tap("takeBtn")] },
        keys: padsView ? "Play the pads: C is P1, C♯ P2… B P12 (any octave)" : "Play the slot's sample" };
    };
    L.drums = () => ({ K: panelControls(), F: MIXF,
      P: DRUMS.map(([id, code]) => drumPad(id, code)).concat(DRUMS.map(([id, code]) => drumPad(id, code))),
      pa: "The 8 drums (a hit also picks it for the knobs)", pb: "The same 8 drums",
      M: { turn: ["Pick a drum", d => { const ids = DRUMS.map(x => x[0]); let i = ids.indexOf(state.drumSel); i = ((i + d) % ids.length + ids.length) % ids.length; state.drumSel = ids[i]; renderDrumPanel(); save(); }],
        click: ["Play / stop the Seq", () => tap("play")], sturn: ["Tempo", d => tap(d > 0 ? "bpmUp" : "bpmDown")], sclick: ["● Rec", () => tap("takeBtn")] },
      keys: "Play the drums: C kick, D snare, D♯ clap, F♯ closed hat, A♯ open hat, C♯ rim, F G A toms, B cowbell (any octave)" });
    // DJ: the left half is deck A, the right half deck B
    const deckEl = d => document.querySelectorAll("#djView .dj-deck")[d];
    const deckBtn = (d, s) => { const el = deckEl(d); return el && el.querySelector(s); };
    const PRESS = { bubbles: true, cancelable: true, pointerId: 4242, isPrimary: true, pointerType: "touch" };
    const press = b => { if (b && !b.disabled) b.dispatchEvent(new PointerEvent("pointerdown", PRESS)); };
    const lift = b => { if (b) b.dispatchEvent(new PointerEvent("pointerup", PRESS)); };
    function deckPads(d) {
      const L2 = "AB"[d], col = d ? "#7fd6c2" : "#c4a3ff";
      return [
        { n: L2 + " ▶ ❚❚", c: "#7fe08a", down() { tap(deckBtn(d, ".dj-play")); } },
        { n: L2 + " Cue", c: "#ffb65c", down() { press(deckBtn(d, ".dj-cue")); }, up() { lift(deckBtn(d, ".dj-cue")); } },
        ...[0, 1, 2, 3].map(k => { const q = '.dj-cues .btn[data-c="' + k + '"]'; return { n: L2 + " Hot " + (k + 1), c: col, down() { press(deckBtn(d, q)); }, up() { lift(deckBtn(d, q)); } }; }),
        { n: L2 + " Loop 4", c: "#5cc8ff", down() { tap(deckBtn(d, '.dj-loops:not(.dj-cues) .btn[data-n="4"]')); } },
        { n: L2 + " Loop 8", c: "#5cc8ff", down() { tap(deckBtn(d, '.dj-loops:not(.dj-cues) .btn[data-n="8"]')); } },
      ];
    }
    function deckSpeed(d, by) {
      const t = deckBtn(d, ".dj-tempo"); if (!t) return;
      t.value = Math.max(-25, Math.min(25, +t.value + by)); t.dispatchEvent(new Event("input", { bubbles: true }));
      mlHud("Deck " + "AB"[d] + " speed", (+t.value > 0 ? "+" : "") + (+t.value).toFixed(2) + "%", (+t.value + 25) / 50);
    }
    L.dj = () => {
      const eq = (d, k, n) => Q('#djView .dj-deck input[data-eq="' + k + '"]', d, "AB"[d] + " " + n);
      const fol = 1 - (DJ.lead | 0);
      return { K: [eq(0, "hi", "High"), eq(0, "mid", "Mid"), eq(0, "lo", "Low"), eq(0, "filt", "Filter"), eq(1, "hi", "High"), eq(1, "mid", "Mid"), eq(1, "lo", "Low"), eq(1, "filt", "Filter")],
        F: [eq(0, "vol", "Volume"), eq(1, "vol", "Volume"), Q("#djXf", 0, "Crossfader"), F_MASTER],
        P: deckPads(0).concat(deckPads(1)), pa: "Deck A: play, cue, hot cues 1–4, loops", pb: "Deck B: the same",
        M: { turn: ["Speed of deck " + "AB"[fol] + " (the one that follows)", d => deckSpeed(fol, d * 0.1)], click: ["▶ Both", () => tap("djBothPlay")],
          sturn: ["Speed of deck " + "AB"[1 - fol], d => deckSpeed(1 - fol, d * 0.1)], sclick: ["● Rec the mix", () => tap("djRec")] },
        keys: "Play the sound" };
    };
    // Beats · Grid: the pads are the 16 tracks
    const RC_COL = ["#ff6b6b", "#ffb65c", "#c4a3ff", "#c4a3ff", "#c4a3ff", "#ff8ac6", "#ff8ac6", "#7fd6c2", "#5cc8ff", "#ffd54f", "#ffd54f", "#b8e986", "#ff8ac6", "#b8e986", "#ffb65c", "#ff6b6b"];
    function gridPad(i) {
      const tr = RCP.tracks[i], s = tr && rcSnd(tr.snd);
      return { n: (s ? s.name.replace(/^Real /, "") : "Track " + (i + 1)).slice(0, 12), c: tr && tr.mute ? "#3a3448" : RC_COL[i], down(vel) {
        start(); if (!ctx || !tr) return;
        const v = Math.max(0.15, Math.min(1, vel / 112));
        if (RC.sel !== i) { RC.sel = i; rcRenderSoon(); }
        if (ML.writeGrid && RC.playing) {   // write it into the grid on the nearest step
          const sd = rcStepDur(), now = ctx.currentTime, n = Math.round(RC.step - (RC.nextT - now) / sd), Ln = Math.max(1, Math.min(RC_MAX, tr.len)), st = ((n % Ln) + Ln) % Ln;
          tr.on[st] = 1; tr.acc[st] = vel >= 110 ? 1 : 0; rcSave(); rcRenderSoon();
          if (n >= RC.step) return;   // (not played yet this time round: the grid plays it)
        }
        if (rcEngine(tr.snd) === "an" && !RC.anOK) { rcAudition(i); return; }
        if (rcEngine(tr.snd) === "smp" && !rcSampleBuf(tr.snd)) { rcAudition(i); return; }
        rcHit(i, ctx.currentTime + 0.005, v);
      } };
    }
    function rcKnob(k) {
      const K = RC_ED_KNOBS.find(x => x[0] === k), lo = K[2], hi = K[3];
      return FN("rc:" + k, {
        name: () => { if (k !== "char") return K[1]; const tr = RCP.tracks[RC.sel], s = tr && rcSnd(tr.snd); return s && s.chLab && s.chLab !== "—" ? s.chLab : "Character"; },
        get: () => { const tr = RCP.tracks[RC.sel]; return tr ? (tr[k] - lo) / (hi - lo) : null; },
        set: v => {
          const i = RC.sel, tr = RCP.tracks[i]; if (!tr) return;
          let x = lo + v * (hi - lo); x = k === "tune" ? Math.round(x) : Math.round(x * 100) / 100; if (tr[k] === x) return;
          tr[k] = x; if (ctx) rcApplyTrack(i); rcSave();
          const head = document.querySelector("#rcEd .rc-edhead strong");
          if (head && head.textContent === "Track " + (i + 1)) { const inp = document.querySelector('#rcEd input[data-k="' + k + '"]'), em = document.getElementById("rcV_" + k); if (inp) inp.value = x; if (em) em.textContent = K[4](x); }
        },
        text: () => { const tr = RCP.tracks[RC.sel]; return tr ? K[4](tr[k]) : ""; },
        steps: k === "tune" ? hi - lo : 0,
        el: () => document.querySelector('#rcEd input[data-k="' + k + '"]'),
      });
    }
    L.grid = () => {
      const ed = k => rcKnob(k);
      const tn = (RCP.tracks[RC.sel] && rcSnd(RCP.tracks[RC.sel].snd) || {}).name || "Track " + (RC.sel + 1);
      return { K: [ed("vol"), ed("pan"), ed("tune"), ed("decay"), ed("tone"), ed("char"), ed("ff"), ed("drive")],
        kfor: "Track " + (RC.sel + 1) + " · " + tn.replace(/^Real /, ""),
        F: [Q("#rcSwing", 0, "Swing"), Q("#rcFeel", 0, "Feel"), Q("#rcRoom", 0, "Room"), Q("#rcLevel", 0, "Level")],
        P: Array.from({ length: 16 }, (_, i) => gridPad(i)), pa: "Tracks 1–8 (a hit picks the track for the knobs)", pb: "Tracks 9–16",
        pnote: ML.writeGrid ? "Writing: hits go into the grid while it plays (Shift + click the big knob to stop)" : "",
        M: { turn: ["Pick a track", d => { RC.sel = ((RC.sel + d) % 16 + 16) % 16; rcRenderSoon(); }], click: ["Play / stop", () => rcPlay(!RC.playing)],
          sturn: ["Tempo", d => tap(d > 0 ? "rcBpmUp" : "rcBpmDown")], sclick: [ML.writeGrid ? "Stop writing hits into the grid" : "Write hits into the grid", () => { ML.writeGrid = !ML.writeGrid; noteMsg(ML.writeGrid ? "MiniLab: pads write into the grid while it plays" : "MiniLab: pads just play"); mlRefresh(true); }] },
        keys: "Play the sound" };
    };
    // Beats · Pads: the 16 pads of the bank on screen; the keys play the pad you hit last, in tune
    function beatPad(i) {
      const k = BPS.bank * 16 + i, P = bpPad(k), col = BP_BANK_COL[BPS.bank];
      return { n: P && P.src ? bpName(P).slice(0, 12) : "", c: P && P.src ? col : null, k, down(vel) { bpDown(k, BPS.full ? 1 : Math.max(0.12, Math.min(1, vel / 127)), "ml" + i); }, up() { bpUp("ml" + i); } };
    }
    L.pads = () => {
      const bk = "ABCD"[BPS.bank], sp = bpPad(BPS.sel);
      return { K: [Q('#bpEdit input[data-k="level"]', 0, "Level"), Q('#bpEdit input[data-k="tune"]', 0, "Tune"), Q('#bpEdit input[data-k="decay"]', 0, "Decay"), Q('#bpEdit input[data-k="tone"]', 0, "Tone"), Q('#bpEdit input[data-k="pan"]', 0, "Pan"),
          Q("#bpSw", 0, "Swing"), Q("#bpQs", 0, "Quantize strength"), Q("#bpRate", 0, "Repeat rate")],
        kfor: "Pad " + (BPS.sel % 16 + 1) + " · bank " + "ABCD"[Math.floor(BPS.sel / 16)] + (sp && sp.src ? " · " + bpName(sp) : ""),
        F: [F_BP, F_RC, F_FX, F_MASTER],
        P: Array.from({ length: 16 }, (_, i) => beatPad(i)), pa: "Pads 1–8 of bank " + bk + " (on screen: the bottom two rows)", pb: "Pads 9–16 of bank " + bk + " (the top two rows)",
        M: { turn: ["Sequence 1–8", d => bpSeqStep(d)], click: ["Play / stop", () => bpTransport(!BP.playing)], sturn: ["Bank A–D", d => bpBankStep(d)], sclick: ["● Rec", () => bpStartRec()] },
        keys: "Play pad " + (BPS.sel % 16 + 1) + (sp && sp.src ? " (" + bpName(sp) + ")" : "") + " in tune: C4 plays it as it is" };
    };
    // the Garage: the selected track's Smart Controls, the volumes of its group of four tracks, and its pads
    const GB = () => window.__gb && __gb.ml;
    function gbControls() {
      const G = GB(), tr = G && G.curTr(); if (!tr) return [];
      const out = []; let gi = 0;
      (G.ctlGroups(tr) || []).forEach(g => g.knobs.forEach(([k, label]) => { if (out.length >= 8) return; const n = gi++;
        out.push(FN("gbk:" + n, { name: label, get: () => { const v = g.get(k); return v == null ? null : +v; }, set: v => { const G2 = GB(); if (!ML.gbDo) { try { G2.gbDo(); } catch (e) {} } clearTimeout(ML.gbDo); ML.gbDo = setTimeout(() => { ML.gbDo = 0; try { GB().saveSong(); } catch (e) {} }, 700); g.set(k, v); }, text: () => Math.round((+g.get(k) || 0) * 100) + "%" }));
      }));
      return out;
    }
    function gbTrackFader(j) {
      return FN("gbf:" + j, {
        tr() { const G = GB(), S = G && G.song(); if (!S) return null; const b = Math.floor((S.sel | 0) / 4) * 4; return S.tracks[b + j] || null; },
        name() { const t = this.tr(); return t ? t.name : "(no track " + (j + 1) + ")"; },
        get() { const t = this.tr(); return t ? Math.max(0, Math.min(1, (t.vol ?? 0.8) / 1.2)) : null; },
        set(v) { const t = this.tr(); if (!t) return; t.vol = v * 1.2; try { GB().applyLevels(); } catch (e) {} clearTimeout(ML.gbF); ML.gbF = setTimeout(() => { try { GB().saveSong(); } catch (e) {} }, 700); },
        text() { const t = this.tr(); if (!t) return ""; const g = Math.pow(t.vol ?? 0.8, 2) * 1.25; return g > 0 ? (20 * Math.log10(g / 0.8)).toFixed(1).replace(/^-/, "−").replace(/^(?=\d)/, "+") + " dB" : "off"; },
      });
    }
    // the selected track's pan and volume
    const gbSel = () => { const G = GB(), S = G && G.song(); return S && S.tracks[S.sel | 0] || null; };
    const gbTrackPan = () => FN("gbpan", { name: "Pan", get: () => { const t = gbSel(); return t ? ((t.pan || 0) + 1) / 2 : null; }, set: v => { const t = gbSel(); if (!t) return; t.pan = Math.round((v * 2 - 1) * 100) / 100; try { GB().applyLevels(); } catch (e) {} clearTimeout(ML.gbF); ML.gbF = setTimeout(() => { try { GB().saveSong(); } catch (e) {} }, 700); },
      text: () => { const t = gbSel(), q = t ? t.pan || 0 : 0; return Math.abs(q) < 0.01 ? "C" : (q < 0 ? "L" : "R") + Math.round(Math.abs(q) * 100); } });
    const gbTrackVol = () => FN("gbvol", { name: "Volume", get: () => { const t = gbSel(); return t ? Math.max(0, Math.min(1, (t.vol ?? 0.8) / 1.2)) : null; }, set: v => { const t = gbSel(); if (!t) return; t.vol = v * 1.2; try { GB().applyLevels(); } catch (e) {} clearTimeout(ML.gbF); ML.gbF = setTimeout(() => { try { GB().saveSong(); } catch (e) {} }, 700); },
      text: () => { const t = gbSel(); if (!t) return ""; const g = Math.pow(t.vol ?? 0.8, 2) * 1.25; return g > 0 ? (20 * Math.log10(g / 0.8)).toFixed(1).replace(/^-/, "−").replace(/^(?=\d)/, "+") + " dB" : "off"; } });
    const GB_COL = ["#ff6b6b", "#ffb65c", "#ffd54f", "#7fd6c2", "#5cc8ff", "#c4a3ff", "#ff8ac6", "#b8e986"];
    L.garage = () => {
      const G = GB(), tr = G && G.curTr(), S = G && G.song();
      const K = gbControls().slice(0, 6); while (K.length < 6) K.push(null);
      K.push(gbTrackPan(), gbTrackVol());
      const P = new Array(16).fill(null);
      let pa = "Pick tracks 1–8", pb = "";
      if (tr && tr.kind === "drums") {
        const RANK = [36, 38, 42, 46, 39, 37, 43, 41, 50, 48, 47, 45, 44, 49, 51, 57, 59, 53];   // kick, snare, hats, clap, rim, toms, pedal hat, cymbals
        const pads = G.kitPads((tr.snd || "kit:studio").slice(4)).map((p, j) => [p, RANK.indexOf(p.m) < 0 ? 99 + j : RANK.indexOf(p.m)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
        pads.slice(0, 12).forEach((p, i) => { P[i] = { n: p.name, c: p.id ? GB_COL[i % 8] : null, down(vel) { start(); const t = GB().curTr(); if (!t || t.kind !== "drums") return; GB().liveOn(t, p.m, Math.max(0.12, Math.min(1, vel / 120))); GB().lit(p.m, true); }, up() { try { GB().lit(p.m, false); } catch (e) {} } }; });
        pa = "Drum pads 1–8"; pb = "Drum pads 9–12, then ⏮ ▶ ● ⟳";
      } else if (tr && G.SMART[tr.kind] && tr.mode !== "notes") {
        const chs = G.chordsOf();
        chs.slice(0, 8).forEach((c, i) => { P[i] = { n: c.name, c: "#c4a3ff", down(vel) { const t = GB().curTr(); if (t && GB().SMART[t.kind] && t.mode !== "notes") GB().chordDown(t, i, "ml" + i, Math.max(0.2, Math.min(1, vel / 115))); }, up() { try { GB().chordUp("ml" + i); } catch (e) {} } }; });
        ["Off", "1", "2", "3"].forEach((x, i) => { P[8 + i] = { n: "Autoplay " + x, c: (tr.auto | 0) === i ? "#ffb65c" : "#5a4a2a", down() { const t = GB().curTr(); if (!t) return; t.auto = i; GB().saveSong(); GB().renderInst(); mlRefresh(true); } }; });
        pa = "The chords 1–8"; pb = "Autoplay off / 1 / 2 / 3, then ⏮ ▶ ● ⟳";
      } else if (S) {
        S.tracks.slice(0, 8).forEach((t, i) => { P[i] = { n: t.name.slice(0, 12), c: i === S.sel ? "#ffb65c" : GB_COL[i], down() { GB().select(i); mlRefresh(true); } }; });
        pb = "⏮ ▶ ● ⟳ on 13–16";
      }
      P[12] = { n: "⏮ Start", c: "#9a8cc4", down() { tap("gbHome"); } };
      P[13] = { n: "▶ / ■", c: "#7fe08a", down() { tap("gbPlay"); } };
      P[14] = { n: "● Record", c: "#ff5c7a", down() { tap("gbRec"); } };
      P[15] = { n: "⟳ Cycle", c: "#ffd54f", down() { try { GB().cycle(); } catch (e) {} } };
      return { K, kfor: tr ? tr.name + " · Smart Controls" : "", F: [0, 1, 2, 3].map(gbTrackFader), ffor: S ? "Tracks " + (Math.floor((S.sel | 0) / 4) * 4 + 1) + "–" + (Math.floor((S.sel | 0) / 4) * 4 + 4) : "",
        P, pa, pb,
        M: { turn: ["Pick a track", d => { const S2 = GB() && GB().song(); if (!S2 || !S2.tracks.length) return; GB().select(Math.max(0, Math.min(S2.tracks.length - 1, (S2.sel | 0) + d))); mlRefresh(true); }],
          click: ["▶ / ■", () => tap("gbPlay")], sturn: ["Move the playhead a bar", d => { try { GB().seekBy(d); } catch (e) {} }], sclick: ["● Record", () => tap("gbRec")] },
        keys: tr ? "Play " + tr.name : "Play the selected track" };
    };
    L.mix = () => {
      const rows = i => Q("#mxList input[type=range]", i);
      return { K: [4, 5, 6, 7, 8, 9, 10, 11].map(rows), F: [0, 1, 2, 3].map(rows), P: new Array(16).fill(null), pa: "", pb: "",
        M: { turn: ["Scroll the list", d => { const l = $id("mxList"); if (l) l.scrollTop += d * 56; }], click: ["Done", () => tap("mxDone")], sturn: ["Scroll faster", d => { const l = $id("mxList"); if (l) l.scrollTop += d * 280; }], sclick: ["Reset levels", () => tap("mxReset")] },
        keys: "Play the sound" };
    };
    // (173) the KeyLab's knob 9 and faders 5–9: tempo, the level of each sound playing (1–4), the master volume;
    // on the Mixer, faders 1–9 and knobs 1–9 are its rows
    const K_TEMPO = FN("tempo", { get: () => (state.seq.bpm - 50) / 130, set(v) { setBpm(Math.round(50 + v * 130)); }, text: () => Math.round(state.seq.bpm) + " bpm", name: () => "Tempo" });
    function stackFader(j) {
      return mixFn("stk" + j, ch => {
        const it = window.__stk && window.__stk.items()[j]; if (!it) return null;
        if (it.t === "syn") return ch.find(c => c.name === ENGINES[it.id].name);
        if (it.t === "samp") return ch.find(c => c.name.startsWith("S" + (it.slot + 1) + " · "));
        if (it.t === "hw") return ch.find(c => c.group === "Hardware");
        if (it.t === "inst") return ch.find(c => c.group === "Instrument") || ch.find(c => c.name === it.name);
        return ch.find(c => c.name === it.name);
      }, "Sound " + (j + 1));
    }
    const F_STK = [0, 1, 2, 3].map(stackFader);
    // (173) on Synths, Samples and Drums the KeyLab is mostly the effects: knobs 1–6 the Effects panel (Drive, Wobble, Echo,
    // Space, Volume, Amount) of the sound with the controls, 7–8 its Send A and Send B, 9 the tempo; faders 1–4 the sound's
    // first four controls, 5–8 the levels of the sounds playing, 9 the master
    const sendFn = x => {
      const lv = () => { const w = window.__wam; if (!w || !w.NBW) return null; const v = (w.NBW.sendLv["ch:" + state.engine] || {})[x]; return Math.max(0, Math.min(1, +v || 0)); };
      return FN("send" + x, { get: lv, set(v) { const w = window.__wam; if (w && w.setSend) { w.setSend("ch:" + state.engine, x, v); saveSoon(); } }, text: () => { const v = lv(); return v == null ? "—" : Math.round(v * 100) + "%"; }, name: () => "Send " + x.toUpperCase() });
    };
    const K_FX = [0, 1, 2, 3, 4, 5].map(i => Q("#fxKnobs .knob", i)).concat([sendFn("a"), sendFn("b")]);
    function klExtras(lay, pg) {
      if (pg === "mix") { const rows = i => Q("#mxList input[type=range]", i); lay.F = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(rows); lay.K = [9, 10, 11, 12, 13, 14, 15, 16, 17].map(rows); return; }
      if (pg === "synths" || pg === "samples" || pg === "drums") {
        lay.K = K_FX.concat([K_TEMPO]);
        lay.F = [0, 1, 2, 3].map(i => Q("#engineKnobs .knob", i)).concat(F_STK, [F_MASTER]);
        return;
      }
      lay.K = (lay.K || []).slice(0, 8); while (lay.K.length < 8) lay.K.push(null); lay.K[8] = K_TEMPO;
      lay.F = (lay.F || []).slice(0, 4); while (lay.F.length < 4) lay.F.push(null);
      F_STK.forEach((f, j) => { lay.F[4 + j] = f; }); lay.F[8] = F_MASTER;
    }
    // ---------- the layout in use, with what you've taught it on this screen on top ----------
    function mlLayout(force) {
      const pg = force ? mlPage() : pageNow(), now = performance.now();
      if (!force && ML.lay && ML.layPage === pg && now - ML.layAt < 400) return ML.lay;
      let lay = null; try { lay = (L[pg] || L.synths)(); } catch (e) { lay = { K: [], F: [], P: [], M: {} }; }
      lay.page = pg; if (ML.dev === "kl") try { klExtras(lay, pg); } catch (e) {}
      try { padOverrides(lay, pg); } catch (e) {} ML.lay = lay; ML.layPage = pg; ML.layAt = now; return lay;
    }
    // learned mappings belong to a screen (old ones are sorted onto the screen their control lives on)
    function learnPage(t) {
      if (!t) return "all";
      if (t.k === "knob") return t.panel === "engineKnobs" ? "synths" : t.panel === "drumKnobs" ? "drums" : "all";
      const id = t.k === "range" ? t.id : "";
      if (/^rc/.test(id)) return "grid"; if (/^bp/.test(id)) return "pads"; if (/^dj/.test(id)) return "dj"; if (/^gb/.test(id)) return "garage";
      const el = (() => { try { return t.k === "range" || t.k === "rangeL" ? learnFind(t) : null; } catch (e) { return null; } })();
      if (el) { if (el.closest("#rcView")) return "grid"; if (el.closest("#bpView")) return "pads"; if (el.closest("#djView")) return "dj"; if (el.closest("#gbView")) return "garage"; }
      return "all";   // (the mixer, the effects, the XY pad, plugins: they worked everywhere and still do)
    }
    { let changed = false; LEARN.map.forEach(m => { if (!m.pg) { m.pg = learnPage(m.t); changed = true; } }); if (changed) saveLearn(); }
    function learnedFor(pg, ch, cc) {
      const id = ML.src ? mlId(cc) : null, hit = m => (m.ml && id && m.ml === id) || (m.cc != null && m.cc === cc && m.ch === ch);
      return LEARN.map.find(m => hit(m) && m.pg === pg) || LEARN.map.find(m => hit(m) && m.pg === "all");
    }
    // MIDI learn and every learned mapping go through here: a mapping only works on its own screen
    nbCC = function (ch, cc, val) {
      const learning = LEARN.on && LEARN.pick;
      if (!learning && !LEARN.map.some(m => (m.ml && ML.src && m.ml === mlId(cc)) || (m.cc != null && m.cc === cc && m.ch === ch))) return false;   // (nothing learned for it: no need to look at the screen)
      const pg = learning ? mlPage() : pageNow();
      if (learning) {
        let t = LEARN.pick.t, name = LEARN.pick.name;
        if (t.k === "xy") { t = { k: "xy", axis: LEARN.xyStep ? "y" : "x" }; name = "XY pad " + (LEARN.xyStep ? "up–down" : "left–right"); }
        const mid = ML.src ? mlId(cc) : null;
        LEARN.map = LEARN.map.filter(m => !((m.pg || "synths") === pg && ((m.cc === cc && m.ch === ch) || (mid && m.ml === mid) || JSON.stringify(m.t) === JSON.stringify(t))));
        LEARN.map.push(Object.assign({ ch, cc, t, name, pg }, mid ? { ml: mid } : {})); saveLearn(); renderLearn(); ML.lay = null; mlRefresh(true);
        const what = ML.src ? mlCtlName(cc) : "CC " + cc;
        if (LEARN.pick.t.k === "xy" && !LEARN.xyStep) { LEARN.xyStep = 1; learnSay(what + " is left–right. Now the knob for up–down"); return true; }
        learnSay(what + " → " + name + " on " + PAGE_NAME[pg] + " only. Touch another control, or Done"); LEARN.pick = null; markPick(null);
        return true;
      }
      const m = learnedFor(pg, ch, cc); if (!m) return false;
      mlMove(m.t, cc, ch, val, m.name);
      return true;   // (handled, even when this value only told where the knob is)
    };
    const mlCtlName = cc => { const c = ctlOf(cc); return !c ? "CC " + cc : c.kind === "K" ? "Knob " + (c.i + 1) : c.kind === "F" ? "Fader " + (c.i + 1) : "CC " + cc; };
    // move a control from a MiniLab knob or fader (or plainly, from anything else)
    function mlMove(t, cc, ch, val, name) {
      if (!t) return false;
      const c = ML.src ? ctlOf(cc) : null, key = ch + ":" + cc;
      let ok;
      if (c && c.kind === "K") ok = mlEncoder(key, val, t);
      else if (c && c.kind === "F") ok = mlFader(key, val, t);
      else ok = learnApply(t, val / 127);
      if (ok !== false && ML.src) mlShow(c, t, name);
      return ok !== false;
    }
    // ---------- MIDI in: the MiniLab first, then everything as before ----------
    const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
    function mlPadHit(i, vel) {
      const lay = mlLayout(), p = lay.P && lay.P[i];
      mlFlash(i, true);
      if (!p || !p.down) { mlHud("Pad " + (i + 1), "nothing here on " + PAGE_NAME[lay.page]); return; }
      try { p.down(vel); } catch (e) {}
      ML.held.set("pad" + i, p);
      if (!$id("miniMap") || $id("miniMap").hidden) mlHud("Pad " + (i + 1), p.n || "");
      else { clearTimeout(ML.padT); ML.padT = setTimeout(() => { ML.lay = null; paintMap(); }, 150); }   // (the map follows the pad or track it picked)
    }
    function mlPadUp(i) { const p = ML.held.get("pad" + i); ML.held.delete("pad" + i); mlFlash(i, false); if (p && p.up) { try { p.up(); } catch (e) {} } }
    function mlMain(a, v, key) {
      const lay = mlLayout(true), M = lay.M || {};
      if (a === "click" || a === "sclick") { if (v < 64) return; const m = M[a]; if (m) { try { m[1](); } catch (e) {} mlHud("Big knob", m[0]); } return; }
      const d = mlDir(key, v); if (!d) return;
      const m = M[a]; if (!m) return;
      try { m[1](d); } catch (e) {}
      ML.lay = null;
      if (a === "turn" || a === "sturn") { clearTimeout(ML.turnT); ML.turnT = setTimeout(() => { const l2 = mlLayout(true); mlBadges(); paintMap(); mlLightAll(); const m2 = l2.M && l2.M[a]; mlHud(m2 ? m2[0] : "", mlPickNow(l2.page, a)); }, 60); }
    }
    // what the big knob just picked, in words
    function mlPickNow(pg, a) {
      try {
        if (pg === "synths" && a === "turn") return $id("sndName") ? $id("sndName").textContent : "";
        if ((pg === "synths" || pg === "samples" || pg === "drums") && a === "sturn") return state.seq.bpm + " bpm";
        if (pg === "samples") return state.engine === "pads" ? "P" + (state.pads.sel + 1) : "S" + (state.samp.slot + 1);
        if (pg === "drums") { const d = DRUMS.find(x => x[0] === state.drumSel); return d ? d[2] : ""; }
        if (pg === "grid" && a === "turn") { const tr = RCP.tracks[RC.sel], s = tr && rcSnd(tr.snd); return "Track " + (RC.sel + 1) + (s ? " · " + s.name.replace(/^Real /, "") : ""); }
        if (pg === "grid" && a === "sturn") return Math.round(rcBpm()) + " bpm";
        if (pg === "pads" && a === "turn") return "Seq " + (BPS.cur + 1) + (BP.playing && BP.queued != null ? " (plays next)" : "");
        if (pg === "pads" && a === "sturn") return "Bank " + "ABCD"[BPS.bank];
        if (pg === "garage" && a === "turn") { const t = GB() && GB().curTr(); return t ? t.name : ""; }
      } catch (e) {}
      return "";
    }
    // (173) the KeyLab's transport over Mackie Control (its MCU/HUI port, when that's switched on): ▶ ■ ● and ⏪ ⏩ for the sounds
    function klMcu(d) {
      const st = d[0], n = d[1], v = d[2];
      if ((st & 0xf0) !== 0x90 || !v) return;
      const act = { 94: ["Play / stop", () => tap("play")], 93: ["Stop", () => tap("stopAll")], 95: ["● Rec", () => tap("takeBtn")], 91: ["Previous sound", () => nextSound(-1)], 92: ["Next sound", () => nextSound(1)] }[n];
      if (act) { start(); try { act[1](); } catch (e) {} mlHud("KeyLab", act[0]); }
    }
    { const om = onMidi; onMidi = function (e) {
        const p = e.target, d = e.data || [];
        if (!p || !md.ins.has(p.id) || !mlPortOn(p) || ML.mode === "off") { ML.src = false; return om.apply(this, arguments); }
        if (isKL(p) && /mcu|hui/i.test(p.name || "")) { klMcu(e.data || []); return; }   // (173) the KeyLab's transport, when its MCU port is on
        if (isML(p) && /mcu|hui|alv|din/i.test(p.name || "")) return;   // (the MiniLab's DAW-control port: Mackie's transport arrives there as notes)
        { const dv = isKL(p) ? "kl" : isML0(p) ? "ml" : ML.dev; if (dv !== ML.dev) { ML.dev = dv; ML.lay = null; } ML.devSet = true; }
        const st = d[0], d1 = d[1], d2 = d[2], cmd = st & 0xf0, ch = st & 15;
        if (st >= 0xf0) { ML.src = false; return om.apply(this, arguments); }
        if (!ML.seen) { ML.seen = true; setTimeout(() => mlRefresh(true), 0); }
        mlMon(st, d1, d2);
        // pads: on their own channel, notes 36–51 (bank A 36–43, bank B 44–51)
        if (ch === ML.padCh && (cmd === 0x90 || cmd === 0x80)) {
          const i = d1 - 36; if (i >= 0 && i < 16) { if (cmd === 0x90 && d2 > 0) mlPadHit(i, d2); else mlPadUp(i); }
          return;
        }
        if (ch === ML.padCh && (cmd === 0xa0 || cmd === 0xd0)) return;   // (pressure on a pad isn't the synth's)
        if (cmd === 0xb0) {
          const c = ctlOf(d1);
          if (c && c.kind === "S") { ML.shift = d2 > 0; try { if (window.__nbShift) window.__nbShift(ML.shift); } catch (e) {} return; }
          if (c && c.kind === "M") { mlMain(c.a, d2, ch + ":" + d1); return; }
          if (c && c.kind === "B") { if (d2 > 0) { const lay = mlLayout(), f = lay.M && lay.M.turn; if (f) { try { f[1](c.d); } catch (er) {} mlHud(f[0], c.d > 0 ? "next" : "back"); } } return; }
          if (c && (c.kind === "K" || c.kind === "F")) {
            ML.src = true;
            try {
              if (nbCC(ch, d1, d2)) return;   // learning, or something learned on this screen
              const lay = mlLayout(), t = (c.kind === "K" ? lay.K : lay.F)[c.i];
              if (t) mlMove(t, d1, ch, d2, null);
              else mlHud((c.kind === "K" ? "Knob " : "Fader ") + (c.i + 1), "nothing here on " + PAGE_NAME[lay.page] + " (MIDI learn can give it a job)");
            } finally { ML.src = false; }
            return;
          }
        }
        if ((cmd === 0x90 || cmd === 0x80) && md.opt.noteIn) {
          const on = cmd === 0x90 && d2 > 0, nk = ch + ":" + d1;
          if (!on) {   // the note-off goes the way the note-on went, whatever screen you're on now
            const way = ML.keyWay.get(nk); ML.keyWay.delete(nk);
            if (way === "bp") { bpUp("mlk" + d1); return; }
            if (way === "drum") return;
            ML.src = false; return om.apply(this, arguments);
          }
          const pg = pageNow();
          // the keys on Drums play the drums (C kick, D snare, F♯ closed hat…, in any octave), on the sampler's Pads the 12 pads
          if ((state.engine === "drum" || state.engine === "pads") && (pg === "drums" || pg === "samples")) {
            ML.keyWay.set(nk, "drum");
            const pc = d1 % 12; if (state.engine === "drum") drumPad(GM_DR[pc], "").down(d2); else { start(); if (ctx) kitPadDown(pc); }
            return;
          }
          if (pg !== "pads") { ML.keyWay.set(nk, "pass"); ML.src = false; return om.apply(this, arguments); }
          // the keys on Beats · Pads play the pad you hit last, in tune (and record like 16 Levels)
          ML.keyWay.set(nk, "bp");
          start(); if (!ctx) return;
          const k = BPS.sel, mod = { t: d1 - 60 }, t0 = ctx.currentTime + 0.005, vel = BPS.full ? 1 : Math.max(0.12, Math.min(1, d2 / 127));
          BP.held.set("mlk" + d1, { k, vel });
          bpHit(k, t0, vel, mod);
          if (BP.rec && BP.playing) { const pos = bpPosAt(t0); if (pos > -0.5) bpRecord(k, Math.max(0, pos), vel, false, mod); }
          return;
        }
        ML.src = false;
        return om.apply(this, arguments);
      }; }
    // the Garage's pads, the Rhythm Creator's notes and Beat Pads' notes also come in on channel 10 from other
    // gear (the K.O. II): that stays as it was; only the MiniLab's pads are read as pads here
    // ---------- what you see: a readout, numbers on the controls, the map, the pads lit ----------
    const hud = document.createElement("div"); hud.className = "mini-hud"; hud.id = "miniHud"; hud.hidden = true; hud.setAttribute("role", "status");
    hud.innerHTML = "<b></b><span></span><em hidden></em><i><s></s></i>"; document.body.appendChild(hud);
    const HINT = { synths: "pads 1–8 drums, 9–16 chords · knobs: the sound", samples: "pads: slots and pads · knobs: the sample", drums: "pads: the 8 drums · knobs: the drum you hit",
      dj: "pads 1–8 deck A, 9–16 deck B · knobs: the EQs", grid: "pads: the 16 tracks · knobs: the track you hit", pads: "pads: 1–16 here · knobs: the pad you hit · keys play it in tune",
      garage: "pads: the track's drums or chords, 13–16 ⏮ ▶ ● ⟳ · knobs: the track", mix: "knobs and faders: the rows of the Mixer" };
    function mlHud(a, b, v, hint) {
      if (!$id("miniMap").hidden && v != null) return;   // (the map shows it)
      hud.querySelector("b").textContent = a; hud.querySelector("span").textContent = b || "";
      const em = hud.querySelector("em"); em.textContent = hint || ""; em.hidden = !hint;
      const bar = hud.querySelector("i"); bar.hidden = v == null; if (v != null) bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + "%";
      hud.hidden = false; clearTimeout(ML.hudT); ML.hudT = setTimeout(() => { hud.hidden = true; }, hint ? 2600 : 1400);
      mlScreen(a, b);
    }
    function mlShow(c, t, name) {
      const lab = c ? (c.kind === "K" ? "Knob " : "Fader ") + (c.i + 1) : "";
      const nm = name || mlName(t, ""), v = mlGet(t);
      const txt = mlText(t);
      mlHud(lab + (nm ? " · " + nm : ""), txt, v);
      if (!map.hidden) mlScreen(nm || lab, txt);
      mlPaintCell(c, t);
    }
    // the last thing the MiniLab sent, in the MIDI sheet: to check the pads' channel and so on
    function mlMon(st, d1, d2) {
      const cmd = st & 0xf0, ch = (st & 15) + 1;
      let s = "";
      if (cmd === 0x90 && d2 > 0) s = (ch === ML.padCh + 1 && d1 >= 36 && d1 < 52 ? "Pad " + (d1 - 35) + " · " : "Key " + noteName(d1) + " · ") + "note " + d1 + ", channel " + ch + ", velocity " + d2;
      else if (cmd === 0xb0) { const c = ctlOf(d1); s = (c ? (c.kind === "K" ? "Knob " + (c.i + 1) : c.kind === "F" ? "Fader " + (c.i + 1) : c.kind === "S" ? "Shift" : "Big knob (" + c.a + ")") + " · " : "") + "CC " + d1 + " = " + d2 + ", channel " + ch; }
      else if (cmd === 0xe0) s = "Pitch strip";
      else return;
      ML.mon = s; const el = $id("miniMon"); if (el && !el.closest("[hidden]")) el.textContent = s;
    }
    // ---------- numbers on the controls the knobs and faders move ----------
    let badged = [];
    function badgeBox(el) { if (!el) return null; if (el.classList.contains("knob")) return el; return el.closest(".rc-k, .dj-sl, .mx-row, label") || el.parentElement; }
    function mlBadges() {
      badged.forEach(b => { b.removeAttribute("data-ml"); b.classList.remove("ml-b"); }); badged = [];
      if (!ML.badges || !mlLive()) return;
      const lay = mlLayout(), pg = lay.page, used = new Set();
      const put = (t, tag) => { if (!t || t.k === "xy" || t.k === "wam" || t.k === "wv") return; const el = t.k === "fn" ? (FNS[t.id] && FNS[t.id].el ? FNS[t.id].el() : null) : learnFind(t), b = badgeBox(el); if (!b || used.has(b)) return; used.add(b); b.setAttribute("data-ml", tag); b.classList.add("ml-b"); badged.push(b); };
      const learned = new Map(); LEARN.map.forEach(m => { if (m.pg === pg || m.pg === "all") { const c = ctlOfMap(m); if (c && (c.kind === "K" || c.kind === "F")) learned.set(c.kind + c.i, m.t); } });
      (lay.K || []).forEach((t, i) => put(learned.get("K" + i) || t, "K" + (i + 1)));
      (lay.F || []).forEach((t, i) => put(learned.get("F" + i) || t, "F" + (i + 1)));
    }
    // ---------- the map: a drawer at the right edge that shows the MiniLab's controls on this screen ----------
    const tab = document.createElement("button"); tab.className = "mini-tab"; tab.id = "miniTab"; tab.hidden = true;
    tab.setAttribute("aria-label", "MiniLab 3: what each knob, fader and pad does here"); tab.title = "MiniLab 3 map";
    tab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="7.5" cy="10.5" r="1.6"/><circle cx="12" cy="10.5" r="1.6"/><circle cx="16.5" cy="10.5" r="1.6"/><path d="M6 15h2.5M10.75 15h2.5M15.5 15h2.5"/></svg>';
    document.body.appendChild(tab);
    const map = document.createElement("aside"); map.className = "mini-map"; map.id = "miniMap"; map.hidden = true; map.setAttribute("role", "dialog"); map.setAttribute("aria-label", "MiniLab 3 map");
    map.innerHTML = `<div class="mm-head"><div><strong>MiniLab 3</strong><span id="miniPg"></span></div><button class="btn" id="miniX">Done</button></div>
      <div class="mm-body">
        <section><h4>Knobs <small>shape</small><em id="miniKfor"></em></h4><div class="mm-k" id="miniK"></div></section>
        <section><h4>Faders <small>mix</small><em id="miniFfor"></em></h4><div class="mm-f" id="miniF"></div></section>
        <section><h4>Pads <small>play</small></h4><p class="mm-pl" id="miniPa"></p><div class="mm-p" id="miniPA"></div><p class="mm-pl" id="miniPb"></p><div class="mm-p" id="miniPB"></div><p class="mm-note" id="miniPnote" hidden></p></section>
        <section><h4>Big knob</h4><div class="mm-m" id="miniM"></div></section>
        <section><h4>Keys</h4><p class="mm-keys" id="miniKeys"></p></section>
        <p class="mm-tip">Give a knob or fader another job on this screen: <b>Learn</b>, touch a control, move the knob. It only changes this screen.</p>
        <div class="mm-foot"><button class="btn" id="miniLearn">Learn</button><button class="btn" id="miniForget">Undo what I taught this screen</button></div>
      </div>`;
    document.body.appendChild(map);
    const cellsK = [], cellsF = [], cellsP = [];
    for (let i = 0; i < 8; i++) { const c = document.createElement("div"); c.className = "mm-c"; c.innerHTML = `<b>${i + 1}</b><span></span><small></small><i><s></s></i>`; $id("miniK").appendChild(c); cellsK.push(c); }
    for (let i = 0; i < 4; i++) { const c = document.createElement("div"); c.className = "mm-c mm-fc"; c.innerHTML = `<b>${i + 1}</b><span></span><small></small><i><s></s></i>`; $id("miniF").appendChild(c); cellsF.push(c); }
    for (let i = 0; i < 16; i++) { const c = document.createElement("div"); c.className = "mm-pad"; c.innerHTML = `<b>${i + 1}</b><span></span>`; $id(i < 8 ? "miniPA" : "miniPB").appendChild(c); cellsP.push(c); }
    let mapRaf = 0;
    function mlPaintCell(c, t) {
      stripHot(c);
      if (map.hidden || !c) return;
      const cell = (c.kind === "K" ? cellsK : cellsF)[c.i]; if (!cell) return;
      cell.classList.add("hot"); clearTimeout(cell.__t); cell.__t = setTimeout(() => cell.classList.remove("hot"), 500);
      if (!mapRaf) mapRaf = requestAnimationFrame(() => { mapRaf = 0; paintMapValues(); });
    }
    function paintMapValues() {
      if (map.hidden) return;
      const lay = mlLayout(), pg = lay.page;
      const learned = new Map(); LEARN.map.forEach(m => { if (m.pg === pg || m.pg === "all") { const c = ctlOfMap(m); if (c && (c.kind === "K" || c.kind === "F")) learned.set(c.kind + c.i, m); } });
      const fill = (cells, T, kind) => cells.forEach((cell, i) => {
        const m = learned.get(kind + i), t = m ? m.t : T[i], v = t ? mlGet(t) : null;
        cell.classList.toggle("none", !t); cell.classList.toggle("learned", !!m);
        cell.querySelector("span").textContent = t ? (m ? m.name.replace(/ \(.*\)$/, "") : mlName(t, "")) : "—";
        cell.querySelector("small").textContent = t ? mlText(t) : "";
        cell.querySelector("s").style.width = v == null ? "0" : Math.round(v * 100) + "%";
      });
      fill(cellsK, lay.K || [], "K"); fill(cellsF, lay.F || [], "F");
    }
    function paintMap() {
      if (map.hidden) return;
      const lay = mlLayout(true);
      $id("miniPg").textContent = PAGE_NAME[lay.page] || "";
      $id("miniKfor").textContent = lay.kfor || ""; $id("miniFfor").textContent = lay.ffor || "";
      $id("miniPa").textContent = lay.pa ? "Bank A · " + lay.pa : ""; $id("miniPb").textContent = lay.pb ? "Bank B · " + lay.pb : "";
      $id("miniPnote").hidden = !lay.pnote; $id("miniPnote").textContent = lay.pnote || "";
      cellsP.forEach((cell, i) => { const p = lay.P && lay.P[i]; cell.classList.toggle("none", !p); cell.style.setProperty("--pc", p && p.c ? p.c : "transparent"); cell.querySelector("span").textContent = p ? p.n || "(empty)" : "—"; });
      const M = lay.M || {}, mm = $id("miniM");
      mm.innerHTML = [["turn", "Turn"], ["click", "Click"], ["sturn", "Shift + turn"], ["sclick", "Shift + click"]].map(([k, l]) => `<div><b>${l}</b><span></span></div>`).join("");
      [["turn"], ["click"], ["sturn"], ["sclick"]].forEach(([k], i) => { mm.children[i].querySelector("span").textContent = M[k] ? M[k][0] : "—"; });
      $id("miniKeys").textContent = lay.keys || "";
      paintMapValues();
    }
    function mlFlash(i, on) {
      const cell = cellsP[i]; if (cell) cell.classList.toggle("hit", on);
      stripFlash(i, on);
      mlLight(i, on);
    }
    tab.addEventListener("click", () => { map.hidden = !map.hidden; document.body.classList.toggle("mini-open", !map.hidden); paintMap(); });
    $id("miniX").addEventListener("click", () => { map.hidden = true; document.body.classList.remove("mini-open"); });
    window.addEventListener("keydown", e => { if (e.key === "Escape" && !map.hidden) { e.preventDefault(); e.stopImmediatePropagation(); map.hidden = true; document.body.classList.remove("mini-open"); } }, true);
    $id("miniLearn").addEventListener("click", () => { learnStart(); });
    $id("miniForget").addEventListener("click", () => {
      const pg = mlPage(), keep = LEARN.map, n = keep.filter(m => m.pg === pg).length, na = keep.filter(m => m.pg === "all").length;
      if (!n && !na) { noteMsg("Nothing taught on " + PAGE_NAME[pg] + " yet: it uses the MiniLab layout"); return; }
      LEARN.map = keep.filter(m => m.pg !== pg && m.pg !== "all"); saveLearn(); renderLearn(); mlRefresh(true);
      undoToast("Forgot " + (n + na) + (n + na === 1 ? " mapping" : " mappings") + (na ? " (" + na + " of them on every screen)" : " on " + PAGE_NAME[pg]), () => { LEARN.map = keep; saveLearn(); renderLearn(); mlRefresh(true); });
    });
    // ---------- pad colours and names on the MiniLab's screen (Arturia's own messages; needs Chrome's permission) ----------
    const SX = [0xf0, 0x00, 0x20, 0x6b, 0x7f, 0x42];
    function mlOuts() { if (!md.access || !ML.lights) return []; try { return [...md.access.outputs.values()].filter(o => mlPortOn(o) && !/din|mcu|hui/i.test(o.name || "")); } catch (e) { return []; } }
    function mlSysex(bytes) { const outs = mlOuts(); if (!outs.length) return; const msg = SX.concat(bytes, [0xf7]); outs.forEach(o => { try { o.send(msg); } catch (e) {} }); }
    const rgb = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); return m ? [1, 2, 3].map(j => parseInt(m[j], 16) >> 1) : [0, 0, 0]; };
    function mlLight(i, hit) {
      if (!ML.lights || !md.access) return;
      const lay = mlLayout(), p = lay.P && lay.P[i];
      let c = p && p.c ? rgb(p.c) : [0, 0, 0];
      if (!hit) c = c.map(x => Math.round(x * 0.22)); else if (!p) c = [24, 24, 24];
      const id = i < 8 ? 0x04 + i : 0x14 + (i - 8), key = c.join(",");
      if (ML.sent.get(i) === key) return; ML.sent.set(i, key);
      mlSysex([0x02, 0x01, 0x16, id, c[0], c[1], c[2]]);
    }
    function mlLightAll() { if (!ML.lights) return; for (let i = 0; i < 16; i++) mlLight(i, false); }
    let scrT = 0;
    function mlScreen(a, b) {
      if (!ML.lights || !md.access) return;
      clearTimeout(scrT); scrT = setTimeout(() => {
        const asc = s => [...String(s || "").normalize("NFKD").replace(/[♯]/g, "#").replace(/[♭]/g, "b").replace(/[–—]/g, "-").replace(/[·•]/g, "-").replace(/[^\x20-\x7e]/g, "")].slice(0, 16).map(ch => ch.charCodeAt(0));
        mlSysex([0x04, 0x02, 0x60, 0x01, ...asc(a), 0x00, 0x02, ...asc(b), 0x00]);
      }, 25);
    }
    // ---------- keeping it all in step with the screen ----------
    function mlRefresh(force) {
      const live = mlLive();
      if (tab.hidden === live) tab.hidden = !live;
      if (!live && !map.hidden) { map.hidden = true; document.body.classList.remove("mini-open"); }
      if (document.body.classList.contains("mini-live") !== live) document.body.classList.toggle("mini-live", live);
      if (!live) { if (ML.wasLive) mlBadges(); ML.page = ""; ML.wasLive = false; return; }
      if (!ML.wasLive) { ML.wasLive = true; setTimeout(() => { const pg0 = mlPage(); mlHud("MiniLab 3 connected", PAGE_NAME[pg0] || "", null, HINT[pg0]); }, 500); }
      const pg = mlPage();
      if (force || pg !== ML.page) {
        const was = ML.page; ML.page = pg; ML.lay = null;
        if (live) {
          mlBadges(); paintMap(); ML.sent.clear(); mlLightAll();
          if (was && was !== pg) mlHud("MiniLab 3", PAGE_NAME[pg] || "", null, HINT[pg]);
        }
      }
    }
    setInterval(() => { if (!md.access) return; mlRefresh(false); if (!map.hidden) paintMapValues(); }, 300);
    setInterval(() => { if (mlLive()) { ML.lay = null; mlBadges(); if (!map.hidden) paintMap(); mlLightAll(); } }, 1500);
    // ---------- the MIDI sheet: the MiniLab's own section ----------
    const sec = document.createElement("div"); sec.className = "mini-sec"; sec.id = "miniSec";
    sec.innerHTML = `<div class="sp-lab"><span>MiniLab 3</span></div>
      <p class="mini-st" id="miniSt"></p>
      <div class="md-opts">
        <label>Layouts <select id="miniMode" aria-label="Controller layouts"><option value="auto">MiniLab 3 (found by name)</option><option value="any">Any controller: read every controller as a MiniLab</option><option value="off">Off</option></select></label>
        <label><input type="checkbox" id="miniBadges"><span>Numbers on the controls<small>K1–K8 and F1–F4 on what the knobs and faders move</small></span></label>
        <label><input type="checkbox" id="miniLights"><span>Light the pads, names on its screen<small>Arturia's own messages, not published, so: try it. Chrome asks to control MIDI devices</small></span></label>
        <label>Pads channel <select id="miniPadCh" aria-label="The MiniLab pads' MIDI channel"></select></label>
      </div>
      <p class="mini-mon">Last: <span id="miniMon">nothing yet</span></p>
      <button class="btn" id="miniMapBtn">Show the map</button>`;
    { const cb = $id("mdConnect"); if (cb && cb.parentNode) cb.parentNode.insertBefore(sec, cb.nextSibling); }
    { const s = $id("miniPadCh"); for (let c = 1; c <= 16; c++) { const o = document.createElement("option"); o.value = c - 1; o.textContent = c + (c === 10 ? " (as it comes)" : ""); s.appendChild(o); } }
    function paintSec() {
      const live = mlLive(), found = md.access && [...md.access.inputs.values()].find(i => isML(i));
      $id("miniSt").textContent = !md.access ? "Tap Connect above with the MiniLab plugged in (a data cable; through a hub with power is fine)."
        : live ? "Connected" + (found ? ": " + found.name : "") + ". Each screen has its own layout: knobs shape, faders mix, pads play, the big knob picks. Turn a knob and the screen says what it moved."
        : ML.mode === "off" ? "Layouts are off: the MiniLab works as a plain MIDI keyboard, with MIDI learn."
        : "No MiniLab 3 found. If yours is plugged in and ticked above, pick “Any controller”.";
      $id("miniMode").value = ML.mode; $id("miniBadges").checked = ML.badges; $id("miniLights").checked = ML.lights; $id("miniPadCh").value = String(ML.padCh);
      $id("miniMon").textContent = ML.mon || "nothing yet";
      $id("miniMapBtn").hidden = !live;
    }
    $id("miniMode").addEventListener("change", e => { ML.mode = e.target.value; mlSave(); ML.lay = null; paintSec(); mlRefresh(true); });
    $id("miniBadges").addEventListener("change", e => { ML.badges = e.target.checked; mlSave(); mlBadges(); });
    $id("miniPadCh").addEventListener("change", e => { ML.padCh = +e.target.value; mlSave(); });
    $id("miniLights").addEventListener("change", e => {
      ML.lights = e.target.checked; mlSave();
      if (ML.lights && md.access && !md.sysex) {   // ask again, with permission for Arturia's messages
        Promise.resolve(connectMidi()).then(() => {
          if (ML.lights && !md.sysex) { ML.lights = false; mlSave(); noteMsg("Chrome didn't allow controlling MIDI devices, so the pads stay as they are"); }
          paintSec(); ML.sent.clear(); mlLightAll();
        });
      }
      else { ML.sent.clear(); if (ML.lights) mlLightAll(); }
    });
    $id("miniMapBtn").addEventListener("click", () => { mdEl.hidden = true; map.hidden = false; document.body.classList.add("mini-open"); paintMap(); });
    $id("midiBtn").addEventListener("click", paintSec);
    $id("mdConnect").addEventListener("click", () => setTimeout(() => { paintSec(); mlRefresh(true); }, 600));
    md.onPorts = () => { ML.hw.clear(); ML.encRel.clear(); ML.encRun.clear(); ML.mainAbs.clear(); ML.mainRun.clear(); paintSec(); ML.sent.clear(); mlRefresh(true); };
    // the MiniLab isn't an output for clock and notes (its knobs would get the sequencer's notes)
    md.isCtl = p => isML(p) && ML.mode !== "off";
