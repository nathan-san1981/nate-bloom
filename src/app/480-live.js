    // ======================================================================
    // Live: a screen for playing out with the MiniLab and the K.O. II, by touch. No keys (the MiniLab has them):
    // eight big knobs and four faders laid out like the MiniLab's, a page of knobs for each job (Sound, FX, FX Lab,
    // Mix, Mine), sixteen big pads with sets to flip between (Beat Pads banks, notes, chords, FX moves, samples,
    // the Rhythm Creator's tracks), the transport, the K.O. II's clock, and the effects one tap away. Tap a knob's
    // or fader's name to give it another job; the MiniLab follows whatever is on screen.
    // ======================================================================
    // (138: on a tablet every write costs a relayout: Live's screen only writes what changed)
    function nbT(el, v) { v = String(v); if (el && el.textContent !== v) el.textContent = v; }
    function nbA(el, k, v) { v = String(v); if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); }
    const LV = { kpage: "sound", pages: {}, F: [null, null, null, null], pset: "bp0", play: "rc", fx: false };
    try { const o = JSON.parse(localStorage.getItem("nightbloom-live") || "{}"); Object.assign(LV, o, { fx: false }); } catch (e) {}
    if (!Array.isArray(LV.F) || LV.F.length !== 4) LV.F = [null, null, null, null];
    if (!LV.pages || typeof LV.pages !== "object") LV.pages = {};
    const lvSave = () => { try { localStorage.setItem("nightbloom-live", JSON.stringify({ kpage: LV.kpage, pages: LV.pages, F: LV.F, pset: LV.pset, play: LV.play })); } catch (e) {} };
    // ---------- what the knobs and faders can be ----------
    const fxK = i => Q("#fxKnobs .knob", i);
    const HALL_IR = new Set(["hdecay", "hsize", "hdamp", "hwidth"]);   // (these rebuild the hall's reverb)
    const labSet = (k, v) => { bfx[k] = v; saveBfx(); applyBfx(HALL_IR.has(k)); };
    // FX Lab as knobs: turning an effect's main knob up switches it on, all the way down switches it off
    function labKnob(id, name, key, onKey, inv) {
      return FN("lab:" + id, {
        name,
        get: () => { const v = inv ? 1 - bfx[key] : bfx[key]; return onKey && !bfx[onKey] ? 0 : v; },
        set: v => {
          if (onKey) { const on = v > 0.02; if (on !== !!bfx[onKey]) { bfx[onKey] = on; if (!on) { saveBfx(); applyBfx(false); return; } } }
          labSet(key, inv ? 1 - v : v);
        },
        text: () => (onKey && !bfx[onKey]) ? "off" : Math.round((inv ? 1 - bfx[key] : bfx[key]) * 100) + "%",
      });
    }
    const LAB_K = [labKnob("dens", "Density", "dens", "densOn"), labKnob("crush", "Lo-fi crush", "bits", "lofiOn", true), labKnob("ltone", "Lo-fi tone", "tone"), labKnob("hall", "Hall+", "hmix", "hallOn"),
      labKnob("hdecay", "Hall decay", "hdecay"), labKnob("frz", "Freeze", "frzMix", "frzOn"), labKnob("shim", "Shimmer", "shim", "shimOn"), labKnob("shimfb", "Shimmer climb", "shimFb")];
    // every FX Lab setting on its own, as the FX Lab sheet has them
    const LABP = {};
    BFX_ROWS.forEach(([onKey, title, sub, sliders]) => sliders.forEach(([k, label]) => {
      LABP[k] = FN("labp:" + k, { name: title + " " + label.toLowerCase(), get: () => bfx[k], set: v => labSet(k, v), text: () => Math.round(bfx[k] * 100) + "%" });
    }));
    // the sound's filter (whichever of its knobs that is), for a fader and the FX moves
    const F_FILTER = FN("live:filter", {
      el() { const ks = [...document.querySelectorAll("#engineKnobs .knob")]; return ks.find(k => /cutoff|filter|bright|tone|colou?r/i.test(k.getAttribute("aria-label") || "")) || null; },
      name() { const k = this.el(); return k ? (k.getAttribute("aria-label") || "Filter").split(/[:,(]/)[0].trim() : "Filter"; },
      get() { const k = this.el(); return k && k.__nbGet ? k.__nbGet() : null; },
      set(v) { const k = this.el(); if (k && k.__nbSet) k.__nbSet(v); },
      text() { const k = this.el(), kv = k && k.querySelector(".k-val"); return kv ? kv.textContent : "—"; },
    });
    const mixCh = (id, name) => mixFn("lv:" + id, ch => ch.find(c => c.name === name), name);
    const F_DRUMS = mixCh("drums", "All drums"), F_DECKA = mixCh("deckA", "Deck A"), F_DECKB = mixCh("deckB", "Deck B");
    // a saved choice can name a control made on demand: make it again
    function lvFix(t) {
      if (!t || t.k !== "fn" || FNS[t.id]) return t;
      const m = /^mix:lv:p:(.+)$/.exec(t.id); if (m) mixCh("p:" + m[1], m[1]);
      return t;
    }
    const KPAGES = [["sound", "Sound"], ["fx", "FX"], ["lab", "FX Lab"], ["mix", "Mix"], ["mine", "Mine"]];
    const KDEF = {
      sound: () => { const n = document.querySelectorAll("#engineKnobs .knob").length, T = []; for (let i = 0; i < Math.min(n, 6); i++) T.push(Q("#engineKnobs .knob", i)); [0, 1, 3, 2, 5].forEach(j => { if (T.length < 8) T.push(fxK(j)); }); return T; },
      fx: () => [fxK(0), fxK(1), fxK(2), fxK(3), Q("#fxEchoSync", 0, "Echo time"), Q("#fxVerb", 0, "Reverb"), F_FX, Q("#fxDuck", 0, "Duck on the kick")],
      lab: () => LAB_K.slice(),
      mix: () => [F_NOW, F_DRUMS, F_RC, F_BP, F_DECKA, F_DECKB, F_FX, F_MASTER],
      mine: () => [],
    };
    const FDEF = () => [F_FILTER, fxK(2), fxK(3), F_MASTER];
    const kpName = k => (KPAGES.find(x => x[0] === k) || KPAGES[0])[1];
    const slotT = (o, d) => o ? (o.none ? null : lvFix(o.t)) : d || null;
    function lvK() { const d = (KDEF[lvKP()] || KDEF.sound)(), o = LV.pages[lvKP()] || []; const out = []; for (let i = 0; i < 8; i++) out.push(slotT(o[i], d[i])); return out; }
    function lvF() { if (LV.shift && !lv.hidden) return SFDEF(); const d = FDEF(); return d.map((t, i) => slotT(LV.F[i], t)); }
    const lvOwn = (kind, i) => kind === "F" ? (LV.shift ? null : LV.F[i]) : (LV.pages[lvKP()] || [])[i];
    // what a knob or fader really does here: something learned on Live (MIDI learn) wins, as it does for the MiniLab
    function lvEff(kind, i) {
      const e = eff(kind, i, { page: "live", K: lvK(), F: lvF() });
      if (e.yours) return e;
      const o = lvOwn(kind, i);
      return { t: e.t, name: o && !o.none ? o.name : null, yours: !!o };
    }
    // ---------- the pad sets ----------
    const PSETS = [["bp0", "A"], ["bp1", "B"], ["bp2", "C"], ["bp3", "D"], ["notes", "Notes"], ["chords", "Chords"], ["fxm", "FX moves"], ["samples", "Samples"], ["rhythm", "Rhythm"]];
    const isBank = s => /^bp\d$/.test(s);
    function bankName(b) {
      try { const K = window.__bpkits; if (K) for (const [, kits] of K.KITS) for (const kit of kits) if (K.on(kit[0], b)) return kit[1]; } catch (e) {}
      const n = (BPS.banks[b] || []).filter(p => p && p.src).length; return n ? n + " pads" : "empty";
    }
    const bpVel = vel => BPS.full ? 1 : Math.max(0.12, Math.min(1, vel / 127));
    function lvBeatPad(b, i) {
      const k = b * 16 + i, P = BPS.banks[b] && BPS.banks[b][i];
      return { n: P && P.src ? bpName(P).slice(0, 16) : "", c: P && P.src ? BP_BANK_COL[b] : null, down(vel) { bpDown(k, bpVel(vel), "lv" + i); }, up() { bpUp("lv" + i); } };
    }
    const scaleIv = () => { const sc = SCALES.find(x => x[0] === scl.scale); return sc && sc[2] && sc[2].length ? sc[2] : [0, 2, 4, 5, 7, 9, 11]; };
    function notePad(i) {
      const iv = scaleIv(), n = iv.length, m = 48 + scl.key + iv[i % n] + 12 * Math.floor(i / n);
      return { n: NN[m % 12] + (Math.floor(m / 12) - 1), c: i % n === 0 ? "#ffb65c" : "#c4a3ff", down(vel) { start(); if (ctx) padVoices("lvn" + i, [m], vel); }, up() { padStop("lvn" + i); } };
    }
    function seventhPad(i) {
      const iv0 = scaleIv(), iv = iv0.length === 7 ? iv0 : [0, 2, 4, 5, 7, 9, 11];
      const deg = d => iv[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7), tones = [0, 2, 4, 6].map(j => 48 + scl.key + deg(i + j));
      const third = tones[1] - tones[0], fifth = tones[2] - tones[0], sev = tones[3] - tones[0];
      const q = third === 3 ? (fifth === 6 ? "ø7" : "m7") : sev === 11 ? "maj7" : "7";
      return { n: NN[tones[0] % 12] + q, c: "#7fd6c2", down(vel) { start(); if (ctx) padVoices("lv7" + i, tones, vel); }, up() { padStop("lv7" + i); } };
    }
    // FX moves: hold a pad and the effect comes in, let go and it's back as it was
    const LVH = {};
    const lvPadEls = [];
    function hold(id, apply, fx) {
      const at = () => lvPadEls[+id.slice(2)];
      return {
        down() {
          start(); if (!ctx) return; if (LVH[id]) LVH[id]();
          const undo = [];
          if (fx && state.fx.on === false) { setFxOn(true); undo.push(() => setFxOn(false)); }   // (a move needs the effects on)
          const r = apply(); if (r) undo.push(r);
          LVH[id] = () => undo.reverse().forEach(f => { try { f(); } catch (e) {} });
          const el = at(); if (el) el.classList.add("held");
        },
        up() { const r = LVH[id]; delete LVH[id]; if (r) r(); const el = at(); if (el) el.classList.remove("held"); },
      };
    }
    const lvRelease = () => Object.keys(LVH).forEach(id => { const r = LVH[id]; delete LVH[id]; try { r(); } catch (e) {} const el = lvPadEls[+id.slice(2)]; if (el) el.classList.remove("held"); });
    const tweakT = (t, v) => () => { const was = mlGet(t); if (was == null) return null; learnApply(t, v); return () => learnApply(t, was); };
    const tweakLab = o => () => {
      const was = {}; Object.keys(o).forEach(k => { was[k] = bfx[k]; bfx[k] = o[k]; }); applyBfx(false);
      return () => { Object.assign(bfx, was); applyBfx(false); };
    };
    const both = (...fs) => () => { const rs = fs.map(f => f()).filter(Boolean); return () => rs.reverse().forEach(r => r()); };
    const FXM = [
      ["Echo throw", "#5cc8ff", tweakT(fxK(2), 0.95), 1], ["Hall wash", "#c4a3ff", tweakLab({ hallOn: true, hmix: 0.85 }), 1], ["Freeze", "#7fd6c2", tweakLab({ frzOn: true, frzMix: 0.8 }), 1], ["Lo-fi", "#ffb65c", tweakLab({ lofiOn: true, bits: 0.12 }), 1],
      ["Shimmer", "#ff8ac6", tweakLab({ shimOn: true, shim: 0.85 }), 1], ["Filter dip", "#ffd54f", tweakT(F_FILTER, 0.12)], ["Drive", "#ff6b6b", tweakT(fxK(0), 0.9), 1], ["Wobble", "#b8e986", tweakT(fxK(1), 0.9), 1],
      ["Drums out", "#8e86a6", both(tweakT(F_DRUMS, 0), tweakT(F_RC, 0), tweakT(F_BP, 0))], ["Synth out", "#8e86a6", tweakT(F_NOW, 0)], ["Fill", "#ffb65c", () => { tap("rcFill"); return null; }], ["FX off", "#8e86a6", tweakT(F_FX, 0)],
      ["Space max", "#c4a3ff", tweakT(fxK(3), 1), 1], ["Echo + Space", "#5cc8ff", both(tweakT(fxK(2), 0.9), tweakT(fxK(3), 0.9)), 1], ["Filter open", "#ffd54f", tweakT(F_FILTER, 1)], ["Crush hard", "#ff6b6b", tweakLab({ lofiOn: true, bits: 0, tone: 0.3 }), 1],
    ];
    const FXM_PADS = FXM.map(([n, c, f, fx], i) => Object.assign({ n, c }, hold("fx" + i, f, !!fx)));
    function lvPads() {
      const s = LV.pset;
      if (isBank(s)) { const b = +s[2]; return Array.from({ length: 16 }, (_, i) => lvBeatPad(b, i)); }
      if (s === "notes") return Array.from({ length: 16 }, (_, i) => notePad(i));
      if (s === "chords") return [0, 1, 2, 3, 4, 5, 6, 7].map(chordPad).concat([0, 1, 2, 3, 4, 5, 6, 7].map(seventhPad));
      if (s === "fxm") return FXM_PADS;
      if (s === "samples") { const P = []; for (let k = 0; k < 12; k++) P.push(samplePad(k)); for (let i = 0; i < 4; i++) P.push(slotPad(i)); return P; }
      if (s === "rhythm") return Array.from({ length: 16 }, (_, i) => gridPad(i));
      return new Array(16).fill(null);
    }
    const psetName = s => { const p = PSETS.find(x => x[0] === s); if (!p) return ""; return isBank(s) ? "Beat Pads " + p[1] + " · " + bankName(+s[2]) : p[1]; };
    // ---------- the MiniLab on Live: knobs and faders as on screen, pads the set on screen ----------
    const lvPlayName = () => ({ seq: "the Seq", rc: "the Rhythm Creator", bp: "Beat Pads" })[LV.play] || "";
    function lvTransport() { start(); if (LV.play === "seq") tap("play"); else if (LV.play === "bp") bpTransport(!BP.playing); else rcPlay(!RC.playing); lvPaintTop(); }
    function lvRec() { if (LV.play === "bp") bpStartRec(); else recToggle(); lvPaintTop(); }   // (142: Live records with its own recorder)
    const step = (arr, cur, d) => { const i = arr.findIndex(x => x[0] === cur); return arr[((i < 0 ? 0 : i) + d + arr.length) % arr.length][0]; };
    L.live = () => ({ K: lvK(), F: lvF(), P: lvPads(), kfor: kpName(LV.kpage) + " page", pa: psetName(LV.pset) + " (1–8)", pb: psetName(LV.pset) + " (9–16)",
      M: { turn: ["Knob page (Sound, FX, FX Lab, Mix, Mine)", d => setKPage(step(KPAGES, LV.kpage, d))], click: ["▶ / ■ " + lvPlayName(), lvTransport], sturn: ["Sound (plays the one you stop on)", d => browse(d)], sclick: ["● Rec", lvRec] },
      keys: "Play the sound" });
    { const mp = mlPage; mlPage = function () { if (shown("mixer")) return "mix"; if (shown("liveView")) return "live"; return mp.apply(this, arguments); }; }
    PAGE_NAME.live = "Live"; HINT.live = "pads: the set on screen · knobs and faders: as on screen, hold Shift for the Shift layer · big knob: knob pages, with Shift: sounds";
    // ---------- the screen ----------
    const lv = document.createElement("div"); lv.className = "dj live"; lv.id = "liveView"; lv.hidden = true; lv.setAttribute("role", "dialog"); lv.setAttribute("aria-label", "Live");
    lv.innerHTML = `<div class="lv-top">
        <button class="btn primary" id="lvDone">Done</button><strong class="lv-title">Live</strong>
        <div class="lv-snd"><button class="btn" id="lvPrev" aria-label="Previous sound">‹</button><button class="lv-sname" id="lvSnd" title="Choose a sound"><b></b><small></small></button><button class="btn" id="lvNext" aria-label="Next sound">›</button></div>
        <div class="lv-tempo"><button class="btn" id="lvBpmD" aria-label="Slower">−</button><span id="lvBpm"></span><button class="btn" id="lvBpmU" aria-label="Faster">+</button></div>
        <div class="seg lv-play" role="group" aria-label="What ▶ plays"><button data-p="seq">Seq</button><button data-p="rc">Rhythm</button><button data-p="bp">Pads</button></div>
        <button class="btn lv-go" id="lvGo">▶</button><button class="btn lv-rec" id="lvRec">● Rec</button>
        <button class="btn lv-ko" id="lvKo" title="Send clock and start/stop to the K.O. II (and other gear on MIDI out)"></button>
        <button class="btn lv-dev" id="lvDev"></button>
        <button class="btn lv-fxb" id="lvFx" aria-pressed="false" title="Effects and FX Lab"><b>FX</b><small>+ Lab</small></button>
        <button class="btn stopall" id="lvStop" aria-label="Stop everything" title="Stop everything">■</button>
      </div>
      <div class="lv-body">
        <section class="lv-ml" aria-label="Knobs and faders">
          <div class="lv-pages" id="lvPages" role="group" aria-label="Knob pages"></div>
          <div class="lv-knobs" id="lvKnobs"></div><div class="lv-faders" id="lvFaders"></div>
        </section>
        <section class="lv-padarea" aria-label="Pads">
          <div class="lv-sets"><div class="lv-psets" id="lvPsets" role="group" aria-label="Pad sets"></div><button class="btn" id="lvKit">Kit…</button></div>
          <div class="lv-pads" id="lvPads"></div>
        </section>
      </div>
      <aside class="lv-fxp" id="lvFxp" hidden aria-label="Effects"></aside>
      <div class="lv-pick" id="lvPick" hidden role="dialog" aria-label="Give it another job"></div>`;
    document.body.appendChild(lv);
    // a knob you turn by dragging up and down, drawn like the MiniLab's; a fader you slide
    const ARC = (a0, a1, r) => { const p = a => [50 + r * Math.cos(a), 50 + r * Math.sin(a)], [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    const KNOB_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="lv-arc0" d="${ARC(A0, A1, 41)}"/><path class="lv-arc1" d=""/><circle class="lv-cap" cx="50" cy="50" r="29"/><line class="lv-tick" x1="50" y1="50" x2="50" y2="26"/></svg>`;
    function paintArc(host, x) {
      const a = A0 + (A1 - A0) * x; host.querySelector(".lv-arc1").setAttribute("d", x > 0.004 ? ARC(A0, Math.max(a, A0 + 0.001), 41) : "");
      const tk = host.querySelector(".lv-tick"); tk.setAttribute("x2", (50 + 24 * Math.cos(a)).toFixed(2)); tk.setAttribute("y2", (50 + 24 * Math.sin(a)).toFixed(2));
    }
    // drag to move a target: up is more; the drag is relative, so nothing jumps where you touch
    function dragTo(surf, getT, span, onMove, onEmpty) {
      let pid = null, y0 = 0, v0 = 0;
      surf.addEventListener("pointerdown", e => {
        const t = getT(); if (!t) { if (onEmpty) onEmpty(); return; }
        const v = mlGet(t); if (v == null) return; e.preventDefault();
        pid = e.pointerId; try { surf.setPointerCapture(pid); } catch (x) {} y0 = e.clientY; v0 = v; surf.classList.add("on");
      });
      surf.addEventListener("pointermove", e => {
        if (e.pointerId !== pid) return; const t = getT(); if (!t) return;
        const v = Math.max(0, Math.min(1, v0 + (y0 - e.clientY) / span())); start(); learnApply(t, v);
        const tk = JSON.stringify(t); ML.virt.set(tk, v); ML.fad.delete(tk); onMove();
      });
      const end = e => { if (e.pointerId === pid) { pid = null; surf.classList.remove("on"); } };
      surf.addEventListener("pointerup", end); surf.addEventListener("pointercancel", end);
    }
    const lvKnobEls = [], lvFaderEls = [];
    function ctlUI(box, i, kind) {
      const el = document.createElement("div"); el.className = kind === "F" ? "lv-f" : "lv-k";
      el.innerHTML = kind === "F"
        ? `<em></em><div class="lv-ftrack" role="slider" tabindex="0"><div class="lv-ffill"></div><div class="lv-fcap"></div></div><button class="lv-name" data-edit><b>F${i + 1}</b><span></span></button>`
        : `<div class="lv-ksurf" role="slider" tabindex="0">${KNOB_SVG}</div><em></em><button class="lv-name" data-edit><b>${i + 1}</b><span></span></button>`;
      box.appendChild(el);
      const T = () => lvEff(kind, i).t, surf = el.querySelector(kind === "F" ? ".lv-ftrack" : ".lv-ksurf");
      dragTo(surf, T, () => kind === "F" ? Math.max(80, surf.getBoundingClientRect().height - 14) : 200, () => paintOne(el, kind, i), () => openPick(kind, i, el));
      surf.addEventListener("keydown", e => {
        const t = T(); if (!t) return; const v = mlGet(t); if (v == null) return;
        const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.02 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.02 : 0;
        if (d) { e.preventDefault(); learnApply(t, Math.max(0, Math.min(1, v + d))); paintOne(el, kind, i); }
      });
      el.querySelector("[data-edit]").addEventListener("click", () => openPick(kind, i, el));
      return el;
    }
    function paintOne(el, kind, i) {
      const E = lvEff(kind, i), t = E.t, v = t ? mlGet(t) : null;
      const nm = t ? (E.name || mlName(t, "")) || "—" : "tap to choose", tx = t ? mlText(t) : "";
      el.classList.toggle("none", !t); el.classList.toggle("yours", E.yours);
      if (el.__nm !== nm) { el.__nm = nm; el.querySelector(".lv-name span").textContent = nm; el.querySelector("[role=slider]").setAttribute("aria-label", (kind === "F" ? "Fader " : "Knob ") + (i + 1) + ": " + nm); }
      if (el.__tx !== tx) { el.__tx = tx; el.querySelector("em").textContent = tx; el.querySelector("[role=slider]").setAttribute("aria-valuetext", tx); }
      const x = v == null ? 0 : Math.max(0, Math.min(1, v)), xr = Math.round(x * 1000);
      if (el.__x === xr) return; el.__x = xr;
      if (kind === "F") { el.querySelector(".lv-ffill").style.height = (x * 100) + "%"; el.querySelector(".lv-fcap").style.bottom = `calc(${x * 100}% - 8px)`; }
      else paintArc(el, x);
      el.querySelector("[role=slider]").setAttribute("aria-valuenow", Math.round(x * 100));
    }
    for (let i = 0; i < 8; i++) lvKnobEls.push(ctlUI($id("lvKnobs"), i, "K"));
    for (let i = 0; i < 4; i++) lvFaderEls.push(ctlUI($id("lvFaders"), i, "F"));
    // pads: landscape, 9–16 on top and 1–8 below, the MiniLab's two banks; standing up, 4 × 4 with 1–4 along the bottom
    for (let i = 0; i < 16; i++) {
      const el = document.createElement("div"); el.className = "lv-pad"; el.dataset.p = i;
      el.style.setProperty("--ol", i >= 8 ? i - 8 : i + 8); el.style.setProperty("--op", (3 - Math.floor(i / 4)) * 4 + (i % 4));
      el.innerHTML = `<b>${i + 1}</b><span></span>`; $id("lvPads").appendChild(el); lvPadEls[i] = el;
    }
    const lvHeld = new Map();
    $id("lvPads").addEventListener("pointerdown", e => {
      const el = e.target.closest(".lv-pad"); if (!el) return; e.preventDefault();
      const i = +el.dataset.p, p = lvPads()[i]; if (!p || !p.down) return;
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
      const r = el.getBoundingClientRect(), rel = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      const vel = BPS.full ? 127 : Math.round(127 * (0.35 + 0.65 * (1 - rel)));   // (as on Beat Pads: harder towards the top)
      start(); try { p.down(vel); } catch (x) {}
      lvHeld.set(e.pointerId, { p, i }); el.classList.add("hit"); lvHwLight(i, true);
    });
    const lvLift = e => { const h = lvHeld.get(e.pointerId); if (!h) return; lvHeld.delete(e.pointerId); lvPadEls[h.i].classList.remove("hit"); lvHwLight(h.i, false); if (h.p.up) { try { h.p.up(); } catch (x) {} } };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => $id("lvPads").addEventListener(n, lvLift));
    $id("lvPads").addEventListener("contextmenu", e => e.preventDefault());
    function lvPaintPads(names) {
      const P = lvPads();
      lvPadEls.forEach((el, i) => {
        const p = P[i], n = p ? p.n || "" : "", c = p && p.c ? p.c : "";
        el.classList.toggle("none", !c); if (el.__c !== c) { el.__c = c; el.style.setProperty("--pc", c || "transparent"); }
        if (el.__n !== n) { el.__n = n; nbT(el.querySelector("span"), n); }
      });
      $id("lvPsets").querySelectorAll("button").forEach(b => {
        nbA(b, "aria-pressed", String(b.dataset.s === LV.pset));
        if (names && isBank(b.dataset.s)) { const nm = bankName(+b.dataset.s[2]); nbT(b.querySelector("small"), nm); nbA(b, "title", "Beat Pads bank " + "ABCD"[+b.dataset.s[2]] + " · " + nm); }
      });
      $id("lvKit").hidden = !isBank(LV.pset);
    }
    function lvPaintKnobs() {
      lvKnobEls.forEach((el, i) => paintOne(el, "K", i)); lvFaderEls.forEach((el, i) => paintOne(el, "F", i));
      $id("lvPages").querySelectorAll("button").forEach(b => nbA(b, "aria-pressed", String(b.dataset.k === lvKP())));
    }
    KPAGES.forEach(([k, n]) => { const b = document.createElement("button"); b.dataset.k = k; b.textContent = n; b.addEventListener("click", () => setKPage(k)); $id("lvPages").appendChild(b); });
    PSETS.forEach(([s, n]) => { const b = document.createElement("button"); b.dataset.s = s; b.innerHTML = isBank(s) ? `<b>${n}</b><small></small>` : `<b>${n}</b>`; b.addEventListener("click", () => setPset(s)); $id("lvPsets").appendChild(b); });
    function setKPage(k) { if (!KDEF[k]) return; LV.kpage = k; lvSave(); ML.lay = null; closePick(); lvPaintKnobs(); if (!lv.hidden) mlScreen("Knob page", kpName(k)); }
    function setPset(s) { if (!PSETS.some(x => x[0] === s)) return; lvRelease(); LV.pset = s; lvSave(); ML.lay = null; ML.sent.clear(); lvPaintPads(); mlLightAll(); if (!lv.hidden) mlScreen("Pads", psetName(s)); }
    $id("lvKit").addEventListener("click", () => {
      if (!isBank(LV.pset)) return; const b = +LV.pset[2];
      BPS.bank = b; BPS.sel = b * 16; try { bpPaintGrid(); } catch (e) {}
      const k = document.querySelector("#bpBanks button[data-kit]"); if (k) k.click();
    });
    { const ks = $id("bpKitSheet"); if (ks) new MutationObserver(() => { if (ks.hidden && !lv.hidden) lvPaintPads(true); }).observe(ks, { attributes: true, attributeFilter: ["hidden"] }); }
    // ---------- the top bar ----------
    const koOut = () => md.access ? [...md.access.outputs.values()].find(o => /k\.?\s?o\.?\s?ii|ep-?133/i.test(o.name || "")) : null;
    function lvPaintTop() {
      const sn = $id("sndName"), ss = $id("sndSub");
      if (!$id("lvSnd").classList.contains("browsing")) { nbT($id("lvSnd").querySelector("b"), sn ? sn.textContent : ""); nbT($id("lvSnd").querySelector("small"), (ss ? ss.textContent : "").replace(/\s*·\s*tap.*$/i, "")); }
      nbT($id("lvBpm"), Math.round(rcBpm()) + " bpm");
      const on = { seq: playing, rc: RC.playing, bp: BP.playing };
      lv.querySelectorAll(".lv-play button").forEach(b => { nbA(b, "aria-pressed", String(b.dataset.p === LV.play)); b.classList.toggle("live", !!on[b.dataset.p]); });
      const go = $id("lvGo"), now = !!on[LV.play]; nbT(go, now ? "■" : "▶"); go.classList.toggle("on", now); nbA(go, "aria-label", (now ? "Stop " : "Play ") + lvPlayName());
      const rec = $id("lvRec"), bpRec = LV.play === "bp", tb = $id("takeBtn");
      nbT(rec, bpRec ? (BP.armed ? "● Count-in" : BP.rec ? "● Looping" : "● Loop") : (tb ? tb.textContent : "● Rec"));
      rec.classList.toggle("on", bpRec ? !!(BP.rec || BP.armed) : !!(tb && tb.classList.contains("live")));
      nbA(rec, "title", bpRec ? "Record what you play on the pads into the loop (Beat Pads)" : "Record everything you hear");
      const ko = koOut(), kb = $id("lvKo"), sync = !!(md.access && md.opt.clockOut && outPorts().length);
      nbT(kb, (ko ? "K.O. II" : "Clock") + (sync ? " · sync" : " · off")); kb.classList.toggle("on", sync); nbA(kb, "aria-pressed", String(!!md.opt.clockOut));
      const ml = mlLive(), dv = $id("lvDev"); nbT(dv, ml ? "MiniLab 3" : md.access ? "MIDI" : "Connect MIDI"); dv.classList.toggle("on", ml);
      nbA(dv, "title", ml ? "The MiniLab is playing this screen (tap for the MIDI sheet)" : "Connect the MiniLab (and the K.O. II)");
      const fx = $id("lvFx"); fx.classList.toggle("off", state.fx.on === false); nbA(fx, "aria-pressed", String(LV.fx));
    }
    lv.querySelectorAll(".lv-play button").forEach(b => b.addEventListener("click", () => { LV.play = b.dataset.p; lvSave(); ML.lay = null; lvPaintTop(); }));
    $id("lvGo").addEventListener("click", lvTransport);
    $id("lvRec").addEventListener("click", lvRec);
    $id("lvBpmD").addEventListener("click", () => { tap("bpmDown"); lvPaintTop(); });
    $id("lvBpmU").addEventListener("click", () => { tap("bpmUp"); lvPaintTop(); });
    const afterSound = () => setTimeout(() => { ML.lay = null; lvPaintTop(); lvPaintKnobs(); }, 80);
    $id("lvPrev").addEventListener("click", () => { start(); nextSound(-1); afterSound(); });
    $id("lvNext").addEventListener("click", () => { start(); nextSound(1); afterSound(); });
    $id("lvSnd").addEventListener("click", () => { start(); tap("sndOpen"); });
    $id("lvStop").addEventListener("click", () => { lvRelease(); tap("stopAll"); lvPaintTop(); });
    $id("lvDev").addEventListener("click", async () => { if (!md.access || !mlLive()) { try { await connectMidi(); } catch (e) {} } else tap("midiBtn"); lvPaintTop(); mlRefresh(true); });
    $id("lvKo").addEventListener("click", async () => {
      if (!md.access) { try { await connectMidi(); } catch (e) {} }
      const want = !md.opt.clockOut, ko = koOut();
      if (want && ko && !md.outs.has(ko.id)) { md.outs.add(ko.id); try { mdRemember("out", ko, true); renderMidi(); } catch (e) {} }
      md.opt.clockOut = want; saveMd(); try { paintMdOpts(); } catch (e) {} lvPaintTop();
      const sync = !!(md.access && md.opt.clockOut && outPorts().length);
      mlHud(want ? "Clock out on" : "Clock out off", want ? (sync ? (ko ? "the K.O. II follows the tempo, ▶ and ■" : "gear on MIDI out follows the tempo, ▶ and ■") : "nothing on MIDI out yet: plug the K.O. II in") : "", null);
    });
    // ---------- the effects, one tap away: the FX knobs and every FX Lab effect ----------
    const fxp = $id("lvFxp");
    function knobMini(w, t, name) {
      w.innerHTML = `<div class="lv-ksurf" role="slider" tabindex="0">${KNOB_SVG}</div><em></em><span></span>`;
      const surf = w.querySelector(".lv-ksurf");
      const paint = () => { const v = mlGet(t); paintArc(w, v == null ? 0 : Math.max(0, Math.min(1, v))); const nm = name || mlName(t, ""); w.querySelector("span").textContent = nm; w.querySelector("em").textContent = mlText(t); surf.setAttribute("aria-label", nm); };
      dragTo(surf, () => t, () => 200, paint);
      w.__paint = paint; paint(); return w;
    }
    function lvPaintFx() {
      const on = state.fx.on !== false;
      fxp.innerHTML = `<div class="lv-fxh"><strong>Effects</strong><button class="btn lv-fxon" id="lvFxOn" aria-pressed="${on}">${on ? "FX: On" : "FX: Off"}</button><button class="btn" id="lvFxClose" aria-label="Close the effects">✕</button></div>
        <div class="lv-fxq"><span>On the knobs:</span><button class="btn" data-kp="fx">FX</button><button class="btn" data-kp="lab">FX Lab</button></div>
        <div class="lv-fxsec"><h4>FX</h4><div class="lv-fxk" id="lvFxK"></div></div>
        <div class="lv-fxsec"><h4>FX Lab</h4><div class="lv-labs" id="lvLab"></div></div>`;
      $id("lvFxOn").addEventListener("click", () => { start(); setFxOn(state.fx.on === false); lvPaintFx(); lvPaintTop(); });
      $id("lvFxClose").addEventListener("click", () => setFx(false));
      fxp.querySelectorAll("[data-kp]").forEach(b => { b.setAttribute("aria-pressed", String(LV.kpage === b.dataset.kp)); b.addEventListener("click", () => { setKPage(b.dataset.kp); lvPaintFx(); }); });
      const mini = (box, t, name) => { const w = document.createElement("div"); w.className = "lv-mk"; box.appendChild(w); knobMini(w, t, name); };
      [0, 1, 2, 3].forEach(i => mini($id("lvFxK"), fxK(i))); mini($id("lvFxK"), F_FX, "Amount");
      [["#fxEchoSync", "Echo time"], ["#fxVerb", "Reverb"], ["#fxDuck", "Duck"]].forEach(([sel, nm]) => {
        const s = document.querySelector(sel); if (!s) return;
        const l = document.createElement("label"); l.className = "lv-sel"; l.innerHTML = "<span></span>"; l.firstChild.textContent = nm;
        const c = s.cloneNode(true); c.removeAttribute("id"); c.value = s.value;
        c.addEventListener("change", () => { start(); s.value = c.value; s.dispatchEvent(new Event("change", { bubbles: true })); ML.lay = null; });
        l.appendChild(c); $id("lvFxK").appendChild(l);
      });
      BFX_ROWS.forEach(([onKey, title, sub, sliders]) => {
        const card = document.createElement("div"); card.className = "lv-lab" + (bfx[onKey] ? " on" : "");
        card.innerHTML = `<div class="lv-labh"><button class="btn" aria-pressed="${!!bfx[onKey]}"><i></i><b></b></button><small></small></div><div class="lv-labk"></div>`;
        card.querySelector("b").textContent = title; card.querySelector("small").textContent = sub;
        card.querySelector("button").addEventListener("click", () => { start(); bfx[onKey] = !bfx[onKey]; if (bfx[onKey] && state.fx.on === false) setFxOn(true); saveBfx(); applyBfx(onKey === "hallOn"); lvPaintFx(); lvPaintKnobs(); });
        sliders.forEach(([k, label]) => mini(card.querySelector(".lv-labk"), LABP[k], label));
        $id("lvLab").appendChild(card);
      });
    }
    function setFx(on) { LV.fx = on; fxp.hidden = !on; lv.classList.toggle("fxopen", on); if (on) lvPaintFx(); lvPaintTop(); }
    $id("lvFx").addEventListener("click", () => { start(); setFx(!LV.fx); });
    // ---------- giving a knob or fader another job, live: one tap on its name ----------
    const pick = $id("lvPick");
    function pickGroups() {
      const G = [], add = (name, items) => { items = items.filter(x => x && x.t && mlGet(x.t) != null); if (items.length) G.push([name, items]); };
      add("Sound", [...document.querySelectorAll("#engineKnobs .knob")].map((k, i) => ({ t: Q("#engineKnobs .knob", i) })));
      add("FX", [0, 1, 2, 3].map(i => ({ t: fxK(i) })).concat([{ t: F_FX, n: "Effects amount" }, { t: Q("#fxEchoSync", 0, "Echo time") }, { t: Q("#fxVerb", 0, "Reverb") }, { t: Q("#fxDuck", 0, "Duck on the kick") }]));
      add("FX Lab", LAB_K.map(t => ({ t })).concat(Object.keys(LABP).filter(k => !["dens", "bits", "tone", "hmix", "hdecay", "frzMix", "shim", "shimFb"].includes(k)).map(k => ({ t: LABP[k] }))));
      add("Motion", [...document.querySelectorAll("#moMacs .knob")].map((k, i) => ({ t: Q("#moMacs .knob", i) })).concat([{ t: { k: "xy", axis: "x" }, n: "XY left–right" }, { t: { k: "xy", axis: "y" }, n: "XY up–down" }]));
      let chs = []; try { chs = mixChannels(); } catch (e) {}
      add("Mix", [{ t: F_NOW, n: "This sound" }].concat(chs.map(c => ({ t: mixCh("p:" + c.name, c.name), n: c.name.replace(/ volume$/, "") }))));
      add("Rhythm Creator", [["#rcSwing", "Swing"], ["#rcFeel", "Feel"], ["#rcRoom", "Room"], ["#rcBusy", "Busy"], ["#rcCplx", "Complexity"], ["#rcMorph", "Morph"], ["#rcLevel", "Level"]].map(([s, n]) => ({ t: Q(s, 0, "Rhythm " + n.toLowerCase()), n })));
      add("Beat Pads", [["#bpSw", "Swing"], ["#bpQs", "Quantize strength"], ["#bpRate", "Repeat rate"]].map(([s, n]) => ({ t: Q(s, 0, "Beat Pads " + n.toLowerCase()), n })));
      add("Arp", [["#arpGate", "Gate"], ["#arpRate", "Rate"], ["#arpMode", "Pattern"]].map(([s, n]) => ({ t: Q(s, 0, "Arp " + n.toLowerCase()), n })));
      return G;
    }
    function closePick() { pick.hidden = true; lv.querySelectorAll(".lv-k.picking, .lv-f.picking").forEach(x => x.classList.remove("picking")); }
    function openPick(kind, i, anchor) {
      closePick();
      const own = lvOwn(kind, i), E = lvEff(kind, i), where = kind === "F" ? "Fader " + (i + 1) : "Knob " + (i + 1) + " · " + kpName(LV.kpage) + " page";
      const def = (kind === "F" ? (LV.shift ? SFDEF() : FDEF()) : (KDEF[lvKP()] || KDEF.sound)())[i] || null;
      pick.innerHTML = `<div class="lv-pkh"><div><strong></strong><small></small></div><button class="btn" id="lvPickClose" data-x aria-label="Close">✕</button></div>
        <div class="lv-pkb"><button class="btn" data-def></button><button class="btn" data-none>Nothing</button></div><div class="lv-pkl"></div>`;
      pick.querySelector("strong").textContent = where;
      pick.querySelector("small").textContent = E.yours && !own ? "set by MIDI learn on Live: change it in the MIDI sheet" : "now: " + (E.t ? E.name || mlName(E.t, "") : "nothing");
      const db = pick.querySelector("[data-def]"); db.textContent = "Back to " + (def ? mlName(def, "the page's") : "nothing"); db.disabled = !own;
      const list = pick.querySelector(".lv-pkl"), curK = E.t ? JSON.stringify(E.t) : "";
      pickGroups().forEach(([g, items]) => {
        const h = document.createElement("div"); h.className = "lv-pkg"; h.textContent = g; list.appendChild(h);
        const row = document.createElement("div"); row.className = "lv-pkr"; list.appendChild(row);
        items.forEach(it => {
          const b = document.createElement("button"); b.className = "btn" + (JSON.stringify(it.t) === curK ? " cur" : ""); const nm = it.n || mlName(it.t, "");
          b.textContent = nm; b.addEventListener("click", () => setSlot(kind, i, { t: it.t, name: nm })); row.appendChild(b);
        });
      });
      pick.querySelector("[data-x]").addEventListener("click", closePick);
      db.addEventListener("click", () => setSlot(kind, i, null));
      pick.querySelector("[data-none]").addEventListener("click", () => setSlot(kind, i, { none: true, name: "Nothing" }));
      pick.hidden = false; anchor.classList.add("picking");
      // next to the control, kept on screen; on a phone, a sheet from the bottom
      const r = anchor.getBoundingClientRect(), W = innerWidth, H = innerHeight, w = Math.min(480, W - 20);
      if (W < 600) { pick.style.cssText = `left:10px;right:10px;bottom:10px;top:auto;width:auto;max-height:${Math.round(H * 0.7)}px`; return; }
      const below = H - r.bottom - 16, above = r.top - 16, maxH = Math.min(560, Math.max(below, above));
      let left = r.left + r.width / 2 - w / 2; left = Math.max(10, Math.min(W - w - 10, left));
      pick.style.cssText = `width:${w}px;left:${left}px;max-height:${maxH}px;` + (below >= above ? `top:${r.bottom + 6}px` : `bottom:${H - r.top + 6}px`);
    }
    function setSlot(kind, i, v) {
      if (kind === "F") { if (!LV.shift) LV.F[i] = v; }
      else { const kp = lvKP(), a = (LV.pages[kp] || []).slice(0, 8); while (a.length < 8) a.push(null); a[i] = v; LV.pages[kp] = a; }
      lvSave(); ML.lay = null; closePick(); lvPaintKnobs();
      const E = lvEff(kind, i); mlHud((kind === "F" ? "Fader " : "Knob ") + (i + 1), E.t ? E.name || mlName(E.t, "") : "nothing", null);
    }
    lv.addEventListener("pointerdown", e => { if (!pick.hidden && !e.target.closest(".lv-pick, [data-edit]")) closePick(); }, true);
    // ---------- the MiniLab while Live is open: the screen lights up instead of the pop-up ----------
    { const mf = mlFlash; mlFlash = function (i, on) { mf.apply(this, arguments); const j = lvPadIdx(i); if (!lv.hidden && lvPadEls[j]) lvPadEls[j].classList.toggle("hit", !!on); }; }
    const lvSoonQ = new Map(); let lvSoonR = 0;
    function lvSoon(el, k, i) { lvSoonQ.set(el, [k, i]); if (!lvSoonR) lvSoonR = requestAnimationFrame(() => { lvSoonR = 0; const q = [...lvSoonQ]; lvSoonQ.clear(); q.forEach(([e, [k2, i2]]) => paintOne(e, k2, i2)); }); }
    { const ms = mlShow; mlShow = function (c, t, name) {
        if (lv.hidden || !c || (c.kind !== "K" && c.kind !== "F")) return ms.apply(this, arguments);
        const el = (c.kind === "K" ? lvKnobEls : lvFaderEls)[c.i];
        if (el) { lvSoon(el, c.kind, c.i); if (!el.__isHot) { el.__isHot = 1; el.classList.add("hot"); } clearTimeout(el.__hot); el.__hot = setTimeout(() => { el.__isHot = 0; el.classList.remove("hot"); }, 450); }
        mlScreen(name || mlName(t, ""), mlText(t));
      }; }
    { const mh = mlHud; mlHud = function (a, b) { if (!lv.hidden && /^Pad \d/.test(a || "") && !/^nothing/.test(b || "")) return; return mh.apply(this, arguments); }; }
    // ---------- open and close ----------
    let lvT = 0, lvTick = 0;
    function lvOpen() {
      start(); lv.hidden = false; document.body.classList.add("live-on"); ML.lay = null; ML.sent.clear();
      lvPaintTop(); lvPaintKnobs(); lvPaintPads(true); setFx(false);
      clearInterval(lvT); lvT = setInterval(() => {
        if (lv.hidden) { clearInterval(lvT); return; }
        lvPaintKnobs(); lvPaintTop(); if (++lvTick % 5 === 0) lvPaintPads();
        if (LV.fx) fxp.querySelectorAll(".lv-mk").forEach(w => w.__paint && w.__paint());
      }, 200);
      try { paintStrip(true); } catch (e) {} mlRefresh(true);
    }
    function lvClose() {
      lvRelease(); lv.hidden = true; closePick(); setFx(false); document.body.classList.remove("live-on"); clearInterval(lvT); ML.lay = null;
      try { paintStrip(true); } catch (e) {} mlRefresh(true);
    }
    $id("lvDone").addEventListener("click", lvClose);
    // (Back and Esc close the choices, then the effects, then Live: they're layers like any sheet)
    // the Live button in the top bar (and in the menu)
    const lb = document.createElement("button"); lb.className = "btn livebtn"; lb.id = "liveBtn"; lb.setAttribute("aria-label", "Live");
    lb.title = window.NB_YOURS ? "Live: big knobs, faders and pads for playing out with the MiniLab and the K.O. II" : "Live: big knobs, faders and pads for playing out";
    lb.innerHTML = '<i aria-hidden="true"></i><span>Live</span>';
    { const mix = $id("mixBtn"); if (mix && mix.parentNode) mix.parentNode.insertBefore(lb, mix); }
    lb.addEventListener("click", lvOpen);
    window.__live = { LV, open: lvOpen, close: lvClose, pads: lvPads, K: lvK, F: lvF, eff: lvEff, setKPage, setPset, setSlot, FXM, LVH, pickGroups };
