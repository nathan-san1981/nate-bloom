//@site-only
  // ======================================================================
  // (synths) Nate Bloom Synths: the synths alone, for the Galaxy Tab S10 FE+ on the Yamaha P-225. Opened with ?synths=1
  // (the short link synths/ and its own install, "Synths"). One screen: pick a synth, big dials for its sound, the
  // effects each with an On/Off, Volume, and keys on screen for when the piano isn't plugged in. When the Yamaha's USB
  // port shows up, every synth goes back to its default sound (once each time it's plugged in) and chords and scale
  // lock go off, so the piano plays plain notes. The Yamaha's own piano sound is left alone unless "Piano sound" is
  // tapped (MIDI Local Control). Off ?synths=1 none of this exists; the Box (?box=1) never sees it.
  // ======================================================================
  {
    let on = false;
    try { on = new URLSearchParams(location.search).get("synths") === "1"; } catch (e) {}
    if (on && !(window.__box && window.__box.on)) {
      document.documentElement.classList.add("nb-synths");
      const SY = window.__synths = { yamaha: null, localOff: false, kbShown: null, dialsFor: "" };
      const $s = id => document.getElementById(id);
      const say = m => { const el = $s("uiToast"); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { el.hidden = true; }, 3600); };
      const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
      const isYamaha = p => /yamaha|p-?2[0-9]{2}\b|p-?1[0-9]{2}\b|digital piano|clavinova|arius/i.test(((p && p.name) || "") + " " + ((p && p.manufacturer) || ""));
      // MIDI on from the first tap, notes in from any keyboard
      try { if (md.opt.auto === undefined) md.opt.auto = true; md.opt.noteIn = true; saveMd(); } catch (e) {}
      // the start card says what this is
      try { const c = document.querySelector("#start .start-sub"); if (c) c.textContent = "The synths, for the Yamaha or the keys on screen."; const h = document.querySelector("#start h2"); if (h) h.textContent = "Nate Bloom Synths"; } catch (e) {}
      document.title = "Nate Bloom Synths";

      const css = mk("style"); css.textContent = `
html.nb-synths, html.nb-synths body { overflow: hidden; }
html.nb-synths #start { z-index: 2147483001; }
html.nb-synths .uitoast { z-index: 2147483002; }
.sy { position: fixed; inset: 0; z-index: 2147483000; background: var(--panel); color: var(--ink); font-family: var(--font-body); display: flex; flex-direction: column;
  padding: max(10px, env(safe-area-inset-top, 0px)) max(14px, env(safe-area-inset-right, 0px)) max(10px, env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-left, 0px)); gap: 10px; overflow-y: auto; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
.sy-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sy-top h1 { font-family: var(--font-display); font-size: 1.25rem; font-weight: 500; margin: 0 6px 0 0; white-space: nowrap; }
.sy-top h1 span { color: var(--lilac); }
.sy-chip { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 20px; background: var(--raised); border: 1px solid var(--line); font-size: 0.95rem; }
.sy-chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--dim); }
.sy-chip.ok i { background: #4ade80; box-shadow: 0 0 8px #4ade8099; }
.sy-sp { flex: 1; }
.sy-b { height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--raised); color: var(--ink); font: 500 1rem var(--font-body); cursor: pointer; white-space: nowrap; }
.sy-b:active { transform: scale(0.97); }
.sy-b.on { background: var(--lilac); color: var(--panel); border-color: var(--lilac); }
.sy-b.ghost { background: transparent; color: var(--dim); }
.sy-sec { background: var(--raised); border: 1px solid var(--line); border-radius: 16px; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
.sy-h { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sy-h b { font: 600 0.8rem var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }
.sy-h em { font-style: normal; font-family: var(--font-display); font-size: 1rem; }
.sy-h small { color: var(--dim); font-size: 0.85rem; }
.sy-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.sy-t { height: 54px; border-radius: 14px; border: 2px solid var(--line); background: var(--panel); color: var(--ink); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; cursor: pointer; font-family: var(--font-body); }
.sy-t b { font: 500 1.05rem var(--font-display); }
.sy-t small { font-size: 0.72rem; color: var(--dim); }
.sy-t.cur { border-color: var(--lilac); background: color-mix(in srgb, var(--lilac) 18%, var(--panel)); }
.sy-dials { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px 8px; justify-items: center; }
.sy-d { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 120px; touch-action: none; }
.sy-d svg { width: 92px; height: 92px; cursor: grab; touch-action: none; }
.sy-d.drag svg { cursor: grabbing; }
.sy-d .sy-trk { fill: none; stroke: var(--line); stroke-width: 10; stroke-linecap: round; }
.sy-d .sy-val { fill: none; stroke: var(--lilac); stroke-width: 10; stroke-linecap: round; }
.sy-d .sy-cap { fill: var(--panel); stroke: var(--line); stroke-width: 2; }
.sy-d .sy-ptr { stroke: var(--ink); stroke-width: 5; stroke-linecap: round; }
.sy-d.off .sy-val { stroke: var(--dim); opacity: 0.35; }
.sy-d.off .sy-ptr { stroke: var(--dim); }
.sy-d .sy-nm { font: 600 1rem var(--font-body); }
.sy-d .sy-vv { font: 500 0.85rem var(--font-mono); color: var(--dim); min-height: 1.1em; }
.sy-d .sy-row { display: flex; gap: 6px; align-items: center; justify-content: center; height: 34px; }
.sy-d .sy-pill { height: 34px; min-width: 64px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--line); background: var(--panel); color: var(--dim); font: 600 0.9rem var(--font-body); cursor: pointer; }
.sy-d .sy-pill.on { background: var(--lilac); color: var(--panel); border-color: var(--lilac); }
.sy-d .sy-rs { height: 34px; width: 40px; border-radius: 18px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font-size: 1.05rem; cursor: pointer; }
.sy-d .sy-rs.gone { visibility: hidden; }
.sy-vol { display: flex; align-items: center; gap: 10px; flex: 1 1 260px; max-width: 420px; }
.sy-vol label { font: 600 1rem var(--font-body); }
.sy-vol input { flex: 1; height: 44px; accent-color: var(--lilac); }
.sy-vol output { font: 500 0.9rem var(--font-mono); color: var(--dim); width: 3ch; text-align: right; }
.sy-kb { display: flex; flex-direction: column; gap: 8px; position: sticky; bottom: 0; z-index: 2; box-shadow: 0 -12px 24px var(--panel); }
.sy-keys { position: relative; height: 170px; display: flex; touch-action: none; }
.sy-w { flex: 1; background: var(--key-white); border: 1px solid #0004; border-radius: 0 0 8px 8px; margin: 0 1px; position: relative; }
.sy-w.dn { background: var(--key-white-down); }
.sy-k { position: absolute; top: 0; height: 60%; background: var(--key-black); border-radius: 0 0 6px 6px; z-index: 1; border: 1px solid #000; }
.sy-k.dn { background: var(--lilac); }
.sy-w span { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; font: 500 0.75rem var(--font-mono); color: #0008; }
.sy-oct { display: flex; align-items: center; gap: 8px; }
.sy-oct span { font: 500 0.95rem var(--font-mono); color: var(--dim); min-width: 4ch; text-align: center; }
.sy-note { color: var(--dim); font-size: 0.85rem; line-height: 1.4; }
@media (max-width: 700px) { .sy-dials { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); } .sy-d { width: 112px; } .sy-d svg { width: 92px; height: 92px; } }
`;
      document.head.appendChild(css);

      // ---- the screen ----
      const root = mk("div", "sy"); root.id = "syView"; root.setAttribute("role", "main");
      root.innerHTML = `
<div class="sy-top">
  <h1>Nate <span>Bloom</span> Synths</h1>
  <span class="sy-chip" id="syKbChip"><i></i><span>No keyboard yet</span></span>
  <button class="sy-b" id="syLocal" hidden title="The Yamaha's own piano sound under the synth (MIDI Local Control)">Piano sound: On</button>
  <span class="sy-sp"></span>
  <button class="sy-b" id="syKeysBtn" title="Keys on the screen">Keys on screen</button>
  <button class="sy-b ghost" id="syFull" title="The whole of Nate Bloom">Full app</button>
</div>
<div class="sy-sec"><div class="sy-h"><b>Synth</b><em id="syName"></em><small id="syAfter"></small></div><div class="sy-tiles" id="syTiles"></div></div>
<div class="sy-sec"><div class="sy-h"><b>Sound</b><small>drag a dial up or down · ↺ puts one back</small><span class="sy-sp"></span><button class="sy-b" id="syResetSnd">↺ Default sound</button></div><div class="sy-dials" id="syDials"></div></div>
<div class="sy-sec"><div class="sy-h"><b>Effects</b><small>each one On or Off</small><span class="sy-sp"></span><div class="sy-vol"><label for="syVolume">Volume</label><input type="range" id="syVolume" min="0" max="100" step="1"><output id="syVolV"></output></div><button class="sy-b" id="syFxOff">All effects off</button><button class="sy-b" id="syFxReset">↺ Default effects</button></div>
  <div class="sy-dials" id="syFx"></div>
</div>
<div class="sy-sec sy-kb" id="syKb" hidden>
  <div class="sy-h"><b>Keys</b><span class="sy-sp"></span><span class="sy-oct"><button class="sy-b" id="syOctDn" aria-label="Octave down">−</button><span id="syOct">C3</span><button class="sy-b" id="syOctUp" aria-label="Octave up">+</button></span></div>
  <div class="sy-keys" id="syKeys"></div>
</div>
<div class="sy-note" id="syNote"></div>`;
      document.body.appendChild(root);

      // ---- a dial: drag up (or right) for more, ↺ or a double tap for its default ----
      const A0 = 135, SWEEP = 270, R = 40, C = 52;   // (drawn on a 104 grid, shown at 92 px)
      const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
      const arc = (v) => { const a1 = -A0, a2 = -A0 + SWEEP * Math.max(0.0001, v); const [x1, y1] = pt(a1, R), [x2, y2] = pt(a2, R); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
      // opt: { name, get(), set(v), def, fmt(v), off: { isOn(), toggle() } }
      function dial(opt) {
        const d = mk("div", "sy-d");
        d.innerHTML = `<svg viewBox="0 0 104 104" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><path class="sy-trk" d="${arc(1)}"/><path class="sy-val"/><circle class="sy-cap" cx="${C}" cy="${C}" r="27"/><line class="sy-ptr" x1="${C}" y1="${C}"/></svg><div class="sy-nm"></div><div class="sy-vv"></div><div class="sy-row"></div>`;
        const svg = d.querySelector("svg"), val = d.querySelector(".sy-val"), ptr = d.querySelector(".sy-ptr"), vv = d.querySelector(".sy-vv"), row = d.querySelector(".sy-row");
        d.querySelector(".sy-nm").textContent = opt.name; svg.setAttribute("aria-label", opt.name);
        let pill = null;
        if (opt.off) { pill = mk("button", "sy-pill"); pill.type = "button"; pill.addEventListener("click", () => { opt.off.toggle(); paint(); }); row.appendChild(pill); }
        const rs = mk("button", "sy-rs", "↺"); rs.type = "button"; rs.title = "Back to " + opt.name + "'s default"; rs.setAttribute("aria-label", rs.title);
        rs.addEventListener("click", () => { opt.set(opt.def); paint(); }); if (!opt.off) row.appendChild(rs);   // (an effect has On/Off; Default effects puts them all back)
        function paint() {
          const v = Math.min(1, Math.max(0, +opt.get() || 0)), isOn = !opt.off || opt.off.isOn();
          val.setAttribute("d", arc(v));
          const [x, y] = pt(-A0 + SWEEP * v, 21); ptr.setAttribute("x2", x.toFixed(1)); ptr.setAttribute("y2", y.toFixed(1));
          vv.textContent = isOn ? opt.fmt(v) : "off";
          d.classList.toggle("off", !isOn);
          svg.setAttribute("aria-valuenow", Math.round(v * 100));
          if (pill) { pill.textContent = isOn ? "On" : "Off"; pill.classList.toggle("on", isOn); pill.setAttribute("aria-pressed", String(isOn)); pill.title = opt.name + (isOn ? " is on · tap for off" : " is off · tap for on"); }
          rs.classList.toggle("gone", Math.abs(v - opt.def) < 0.005 && isOn);
        }
        let pid = null, y0 = 0, x0 = 0, v0 = 0, lastTap = 0;
        svg.addEventListener("pointerdown", e => {
          pid = e.pointerId; try { svg.setPointerCapture(pid); } catch (er) {} e.preventDefault();
          y0 = e.clientY; x0 = e.clientX; v0 = +opt.get() || 0; d.classList.add("drag");
          const now = performance.now(); if (now - lastTap < 320) { opt.set(opt.def); paint(); pid = null; } lastTap = now;
        });
        svg.addEventListener("pointermove", e => {
          if (e.pointerId !== pid) return;
          const dv = ((y0 - e.clientY) + (e.clientX - x0) * 0.6) / 260;   // a 260 px drag is the whole way
          if (opt.off && !opt.off.isOn() && Math.abs(dv) > 0.01) { opt.off.toggle(); v0 = +opt.get() || 0; y0 = e.clientY; x0 = e.clientX; }
          opt.set(Math.min(1, Math.max(0, v0 + dv))); paint();
        });
        const end = e => { if (e.pointerId === pid) { pid = null; d.classList.remove("drag"); } };
        svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
        svg.addEventListener("contextmenu", e => e.preventDefault());
        svg.addEventListener("keydown", e => {
          const k = e.key, step = e.shiftKey ? 0.1 : 0.02;
          if (k === "ArrowUp" || k === "ArrowRight") { opt.set(Math.min(1, (+opt.get() || 0) + step)); paint(); e.preventDefault(); }
          if (k === "ArrowDown" || k === "ArrowLeft") { opt.set(Math.max(0, (+opt.get() || 0) - step)); paint(); e.preventDefault(); }
        });
        d.__paint = paint; paint();
        return d;
      }

      // ---- the synths ----
      const synthItems = () => { try { return window.__qk.items().filter(q => q.eng && ENGINES[q.eng] && ENGINES[q.eng].knobs); } catch (e) { return []; } };
      const curEng = () => (ENGINES[state.engine] && ENGINES[state.engine].knobs) ? state.engine : null;
      function paramsOf(id) { if (!state.params[id]) state.params[id] = Object.fromEntries(ENGINES[id].knobs.map(([k, , v]) => [k, v])); return state.params[id]; }
      function paintTiles() {
        const box = $s("syTiles"); box.innerHTML = "";
        const cur = curEng();
        synthItems().forEach(q => {
          const t = mk("button", "sy-t" + (q.eng === cur ? " cur" : "")); t.type = "button";
          t.append(mk("b", "", q.name), mk("small", "", q.sub || ""));
          t.setAttribute("aria-pressed", String(q.eng === cur)); t.title = ENGINES[q.eng].name;
          t.addEventListener("click", async () => {
            try { start(); } catch (e) {}
            try { allOff(); } catch (e) {}
            try { await window.__qk.alone(q); } catch (e) {}
            if (state.engine !== q.eng) { state.engine = q.eng; try { renderEngine(); } catch (e) {} }
            paintAll();
          });
          box.appendChild(t);
        });
        const e = cur && ENGINES[cur];
        $s("syName").textContent = e ? e.name : "Pick a synth";
        $s("syAfter").textContent = e ? (e.after || "") : "";
      }
      function paintDials(force) {
        const box = $s("syDials"), id = curEng();
        if (!force && SY.dialsFor === id) { box.querySelectorAll(".sy-d").forEach(d => d.__paint && d.__paint()); return; }
        SY.dialsFor = id; box.innerHTML = "";
        if (!id) { box.appendChild(mk("div", "sy-note", "Pick a synth above.")); return; }
        ENGINES[id].knobs.forEach(([k, label, def]) => box.appendChild(dial({
          name: label, def, get: () => paramsOf(id)[k], set: v => { paramsOf(id)[k] = v; save(); try { syncAppKnobs(); } catch (e) {} },
          fmt: v => { try { return display(k, v, paramsOf(id)); } catch (e) { return Math.round(v * 100) + ""; } },
        })));
        box.appendChild(dial({ name: "Level", def: 0.8, get: () => (state.layers[id] || {}).level, set: v => { if (!state.layers[id]) state.layers[id] = { on: true, level: 0.8 }; state.layers[id].level = v; save(); }, fmt: v => Math.round(v * 100) + "" }));
      }
      // effects: Drive, Wobble, Echo, Space, each On/Off (Off remembers where it was)
      const FXD = Object.fromEntries(FX_KNOBS.map(([k, l, v]) => [k, v]));
      let fxKeep = {}; try { fxKeep = JSON.parse(localStorage.getItem("nb-synths-fxkeep") || "{}") || {}; } catch (e) {}
      const saveKeep = () => { try { localStorage.setItem("nb-synths-fxkeep", JSON.stringify(fxKeep)); } catch (e) {} };
      const fxSet = (k, v) => { state.fx[k] = v; try { applyFx(); } catch (e) {} save(); try { syncAppKnobs(); } catch (e) {} };
      const fxIsOn = k => !(k in fxKeep);
      function fxToggle(k) {
        if (fxIsOn(k)) { fxKeep[k] = state.fx[k] > 0.01 ? state.fx[k] : FXD[k]; fxSet(k, 0); }
        else { const v = fxKeep[k]; delete fxKeep[k]; fxSet(k, v > 0.01 ? v : FXD[k]); }
        saveKeep();
      }
      function paintFx(force) {
        const box = $s("syFx");
        if (!force && box.children.length) box.querySelectorAll(".sy-d").forEach(d => d.__paint && d.__paint());
        else {
          box.innerHTML = "";
          FX_KNOBS.filter(([k]) => !["volume", "amount"].includes(k)).forEach(([k, label, def]) => box.appendChild(dial({
            name: label, def, get: () => fxIsOn(k) ? state.fx[k] : (fxKeep[k] || 0),
            set: v => { if (!fxIsOn(k)) { delete fxKeep[k]; saveKeep(); } fxSet(k, v); },
            fmt: v => Math.round(v * 100) + "", off: { isOn: () => fxIsOn(k), toggle: () => fxToggle(k) },
          })));
        }
        const vol = $s("syVolume"); vol.value = Math.round(state.fx.volume * 100); $s("syVolV").textContent = vol.value;
      }
      $s("syVolume").addEventListener("input", e => { fxSet("volume", (+e.target.value) / 100); $s("syVolV").textContent = e.target.value; });
      // the app's own faders (hidden behind this screen) follow, so the full app shows the same
      function syncAppKnobs() { document.querySelectorAll("#engineKnobs .knob, #fxKnobs .knob").forEach(el => { if (el.__nbSet && el.__nbGet) { const v = el.__nbGet(); el.__nbSet(v); } }); }

      function resetSound(id) {
        if (!id || !ENGINES[id] || !ENGINES[id].knobs) return;
        const p = paramsOf(id); ENGINES[id].knobs.forEach(([k, , v]) => { p[k] = v; });
        if (state.layers[id]) state.layers[id].level = 0.8;
      }
      function resetFx() {
        fxKeep = {}; saveKeep(); FX_KNOBS.forEach(([k, , v]) => { state.fx[k] = v; });
        try { Object.keys(ENGINES).forEach(id => { if (FXC.by[id]) FXC.by[id].on = true; }); fxcSave(); } catch (e) {}
        try { if (state.fx.on === false) setFxOn(true); } catch (e) {}
        try { applyFx(); } catch (e) {}
      }
      function plainNotes() {
        try { chordType = "off"; if (typeof chordSel !== "undefined" && chordSel) chordSel.value = "off"; localStorage.setItem("nightbloom-chord", "off"); } catch (e) {}
        try { scl.scale = "off"; saveScale(); paintScale(); } catch (e) {}
      }
      // (the Yamaha) every synth's default sound, the default effects, plain single notes
      function yamahaDefaults() {
        try { allOff(); } catch (e) {}
        Object.keys(ENGINES).forEach(resetSound);
        resetFx(); plainNotes();
        save(); try { renderEngine(); } catch (e) {}
        paintAll(true);
      }
      $s("syResetSnd").addEventListener("click", () => { resetSound(curEng()); save(); try { renderEngine(); } catch (e) {} paintDials(true); say("Default sound"); });
      $s("syFxReset").addEventListener("click", () => { resetFx(); save(); paintFx(true); say("Default effects"); });
      $s("syFxOff").addEventListener("click", () => {
        FX_KNOBS.forEach(([k]) => { if (!["volume", "amount"].includes(k) && fxIsOn(k)) { fxKeep[k] = state.fx[k] > 0.01 ? state.fx[k] : FXD[k]; state.fx[k] = 0; } });
        saveKeep(); try { applyFx(); } catch (e) {} save(); paintFx(true); say("Effects off · tap On under one to bring it back");
      });
      $s("syFull").addEventListener("click", () => { location.href = location.pathname; });

      // ---- keys on screen: two octaves ----
      let base = 48; const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
      function buildKeys() {
        const kb = $s("syKeys"); kb.innerHTML = "";
        const whites = []; for (let m = base; m <= base + 24; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
        const ww = 100 / whites.length;
        whites.forEach((m, i) => { const w = mk("div", "sy-w"); w.dataset.m = m; if (m % 12 === 0) w.appendChild(mk("span", "", "C" + (Math.floor(m / 12) - 1))); kb.appendChild(w);
          if ([0, 2, 5, 7, 9].includes(m % 12) && m + 1 <= base + 24) { const b = mk("div", "sy-k"); b.dataset.m = m + 1; b.style.left = `calc(${(i + 1) * ww}% - ${ww * 0.3}%)`; b.style.width = (ww * 0.6) + "%"; kb.appendChild(b); } });
        $s("syOct").textContent = "C" + (Math.floor(base / 12) - 1);
      }
      { const kb = $s("syKeys"), down = new Map();
        const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest(".sy-w, .sy-k"); };
        const press = (pid, el) => { const was = down.get(pid); if (was === el) return; if (was) { was.classList.remove("dn"); try { noteOff(+was.dataset.m); } catch (e) {} } down.delete(pid);
          if (el) { down.set(pid, el); el.classList.add("dn"); try { start(); noteOn(+el.dataset.m); } catch (e) {} } };
        kb.addEventListener("pointerdown", e => { e.preventDefault(); try { kb.setPointerCapture(e.pointerId); } catch (er) {} press(e.pointerId, keyAt(e.clientX, e.clientY)); });
        kb.addEventListener("pointermove", e => { if (down.has(e.pointerId)) press(e.pointerId, keyAt(e.clientX, e.clientY)); });
        const up = e => press(e.pointerId, null); kb.addEventListener("pointerup", up); kb.addEventListener("pointercancel", up);
        kb.addEventListener("contextmenu", e => e.preventDefault());
      }
      $s("syOctDn").addEventListener("click", () => { if (base > 24) { try { allOff(); } catch (e) {} base -= 12; buildKeys(); } });
      $s("syOctUp").addEventListener("click", () => { if (base < 84) { try { allOff(); } catch (e) {} base += 12; buildKeys(); } });
      // keys show when nothing is plugged in and go away when the Yamaha is; the button flips them any time
      function showKeys(v) { SY.kbShown = v; $s("syKb").hidden = !v; const b = $s("syKeysBtn"); b.classList.toggle("on", v); b.setAttribute("aria-pressed", String(v)); }
      $s("syKeysBtn").addEventListener("click", () => showKeys(!SY.kbShown));
      buildKeys();

      // ---- the Yamaha ----
      function outsFor(inp) {
        if (!md.access) return [];
        const nm = (inp && inp.name) || "";
        const all = [...md.access.outputs.values()].filter(o => o.state !== "disconnected" && isYamaha(o));
        const same = all.filter(o => o.name === nm); return same.length ? same : all;
      }
      function sendLocal(onv) {
        const outs = outsFor(SY.yamaha); if (!outs.length) return false;
        outs.forEach(o => { try { for (let ch = 0; ch < 16; ch++) o.send([0xb0 | ch, 122, onv ? 127 : 0]); } catch (e) {} });
        return true;
      }
      function paintLocal() { const b = $s("syLocal"); b.hidden = !SY.yamaha; b.textContent = "Piano sound: " + (SY.localOff ? "Off" : "On"); b.classList.toggle("on", !SY.localOff); b.setAttribute("aria-pressed", String(!SY.localOff)); }
      $s("syLocal").addEventListener("click", () => {
        const want = !SY.localOff;
        if (!sendLocal(!want)) { say("Couldn't reach the Yamaha. Turn its volume knob down to hear only the synth."); return; }
        SY.localOff = want; paintLocal();
        say(want ? "The Yamaha's piano sound is off: you hear only the synth. Tap again to bring it back." : "The Yamaha's piano sound is back.");
      });
      // the piano gets its own sound back when this closes
      window.addEventListener("pagehide", () => { if (SY.localOff) sendLocal(true); });
      function paintChip() {
        const c = $s("syKbChip"); c.classList.toggle("ok", !!SY.yamaha);
        c.querySelector("span").textContent = SY.yamaha ? "Yamaha connected · default sounds" : SY.other ? SY.other + " connected" : (md.access ? "Plug in the Yamaha (USB)" : "Tap to connect the keyboard");
        paintLocal();
      }
      function scanPorts() {
        if (!md.access) { paintChip(); return; }
        const ins = [...md.access.inputs.values()].filter(i => i.state !== "disconnected" && !(typeof mdOwnPort === "function" && mdOwnPort(i)));
        const y = ins.find(isYamaha) || null;
        SY.other = !y && ins.length ? (ins[0].name || "A keyboard") : "";
        const was = SY.yamaha; SY.yamaha = y;
        if (y && (!was || was.id !== y.id)) {
          yamahaDefaults();
          showKeys(false);
          say("Yamaha connected · every synth is on its default sound");
        }
        if (!y && was) { SY.localOff = false; showKeys(true); say("The Yamaha was unplugged · keys on screen"); }
        paintChip();
      }
      { const op = md.onPorts; md.onPorts = function () { try { if (op) op.apply(this, arguments); } catch (e) {} try { scanPorts(); } catch (e) {} }; }
      $s("syKbChip").addEventListener("click", () => { if (!md.access) { try { connectMidi(); } catch (e) {} } });

      function paintAll(force) { paintTiles(); paintDials(force); paintFx(force); paintChip(); }
      // the base app plays the synths (not samples or drums)
      function toSynths() { try { const b = $s("mSynths"); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); } catch (e) {} if (!curEng()) { const f = synthItems()[0]; if (f) { state.engine = f.eng; try { renderEngine(); } catch (e) {} } } }
      $s("syNote").innerHTML = "The Yamaha plays whichever synth is lit, with its sustain pedal. To hear only the synth, tap <b>Piano sound</b> (or turn the Yamaha's volume down). Dials: drag up for more, down for less; a double tap or ↺ puts one back.";
      showKeys(true);
      setTimeout(() => { toSynths(); paintAll(true); }, 0);
      $s("startBtn") && $s("startBtn").addEventListener("click", () => setTimeout(() => { toSynths(); paintAll(true); }, 50));
      window.__synths.paint = paintAll; window.__synths.defaults = yamahaDefaults;
    }
  }
//@end
