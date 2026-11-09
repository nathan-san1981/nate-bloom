//@site-only
  // ======================================================================
  // (synths) Nate Bloom Synths: the synths alone, for the Galaxy Tab S10 FE+ on the Yamaha P-225. Opened with ?synths=1
  // (the short link synths/ and its own install, "Synths"). One screen: pick a synth, big sliders for its sound, the
  // effects each with an On/Off, Volume, ● Record (Play / Save MP3 / Delete), and keys on screen for when the piano isn't plugged in. When the Yamaha's USB
  // port shows up, every synth goes back to its default sound (once each time it's plugged in) and chords and scale
  // lock go off, so the piano plays plain notes. "Plays" picks Piano / Synth / Piano + Synth
  // (Synth turns the Yamaha's own sound off with MIDI Local Control). Off ?synths=1 none of this exists; the Box (?box=1) never sees it.
  // ======================================================================
  // (anywhere but the Synths screen) if the Synths screen left the Yamaha's own sound off (it was closed mid-way, say),
  // it's turned back on as soon as the Yamaha is seen. Only ever undoes what the Synths screen did.
  {
    let synthsHere = false; try { synthsHere = new URLSearchParams(location.search).get("synths") === "1"; } catch (e) {}
    if (!synthsHere) {
      const fix = () => {
        try {
          if (localStorage.getItem("nb-local-off") !== "1" || !md.access) return;
          const outs = [...md.access.outputs.values()].filter(o => o.state !== "disconnected" && /yamaha|p-?2[0-9]{2}\b|p-?1[0-9]{2}\b|digital piano|clavinova|arius/i.test((o.name || "") + " " + (o.manufacturer || "")));
          if (!outs.length) return;
          outs.forEach(o => { try { for (let ch = 0; ch < 16; ch++) o.send([0xb0 | ch, 122, 127]); } catch (e) {} });
          localStorage.removeItem("nb-local-off");
        } catch (e) {}
      };
      const op = md.onPorts; md.onPorts = function () { try { if (op) op.apply(this, arguments); } catch (e) {} fix(); };
    }
  }
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
.sy-chip.hit i { animation: syHit 0.35s ease-out; }
@keyframes syHit { 0% { background: #fff; box-shadow: 0 0 14px #fff; transform: scale(1.8); } 100% { } }
.sy-sp { flex: 1; }
.sy-b { height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--raised); color: var(--ink); font: 500 1rem var(--font-body); cursor: pointer; white-space: nowrap; }
.sy-b:active { transform: scale(0.97); }
.sy-b.on { background: var(--lilac); color: var(--panel); border-color: var(--lilac); }
.sy-b.ghost { background: transparent; color: var(--dim); }
.sy-rec { color: #ff6b6b; border-color: #ff6b6b66; font-weight: 600; min-width: 132px; }
.sy-rec.live { background: #e5484d; color: #fff; border-color: #e5484d; animation: syPulse 1.2s ease-in-out infinite; }
@keyframes syPulse { 50% { box-shadow: 0 0 0 6px #e5484d33; } }
.sy-take { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--raised); border: 1px solid #e5484d66; border-radius: 16px; padding: 8px 12px; font-size: 1rem; }
.sy-take .sy-tk-dot { color: #e5484d; }
html.nb-synths .recbanner { display: none !important; }
.sy-mode { display: inline-flex; align-items: center; gap: 4px; padding: 4px; border-radius: 14px; background: var(--raised); border: 1px solid var(--line); }
.sy-mode > span { font: 600 0.75rem var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); padding: 0 6px 0 8px; }
.sy-mode button { height: 40px; padding: 0 16px; border-radius: 10px; border: 0; background: transparent; color: var(--ink); font: 600 1rem var(--font-body); cursor: pointer; white-space: nowrap; }
.sy-mode button[aria-pressed="true"] { background: var(--lilac); color: var(--panel); }
.sy.pianoonly .sy-sec:not(.sy-kb) { opacity: 0.45; }
.sy-t { position: relative; }
.sy-t.on { border-color: color-mix(in srgb, var(--lilac) 55%, var(--line)); }
.sy-t .sy-pl { position: absolute; top: -8px; right: -8px; width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--line); background: var(--raised); color: var(--ink); font: 700 1.2rem/1 var(--font-body); display: grid; place-items: center; cursor: pointer; z-index: 1; }
.sy-t.on .sy-pl { background: var(--lilac); color: var(--panel); border-color: var(--lilac); font-size: 1rem; }
.sy-plusk { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--raised); border: 1px solid var(--line); color: var(--ink); font-size: 0.85rem; text-transform: none !important; letter-spacing: 0 !important; }
.sy-tiles { padding-top: 6px; }
.sy-stack, .sy-saved { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sy-stack:empty, .sy-saved:empty { display: none; }
.sy-lab2 { font: 600 0.75rem var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); margin-right: 2px; }
.sy-chip2 { display: inline-flex; align-items: center; height: 44px; border-radius: 22px; border: 2px solid var(--line); background: var(--panel); color: var(--ink); font: 600 1rem var(--font-body); overflow: hidden; }
.sy-chip2.cur { border-color: var(--lilac); background: color-mix(in srgb, var(--lilac) 18%, var(--panel)); }
.sy-chip2 > button { height: 100%; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; padding: 0 12px 0 16px; }
.sy-chip2 > button.x { padding: 0 14px 0 6px; color: var(--dim); font-size: 1.1rem; }
.sy-chip2 small { color: var(--dim); font-weight: 500; font-size: 0.78rem; margin-left: 6px; }
.sy-paused { height: 56px; border-radius: 16px; border: 2px solid #ffb65c; background: #ffb65c22; color: #ffd59e; font: 700 1.1rem var(--font-body); cursor: pointer; }
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
.sy-dials { display: grid; grid-template-columns: repeat(auto-fill, minmax(500px, 1fr)); gap: 4px 28px; }
.sy-d { display: grid; grid-template-columns: 112px minmax(0, 1fr) 76px; align-items: center; gap: 12px; height: 60px; }
.sy-d .sy-lab { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sy-d .sy-nm { font: 600 1.05rem var(--font-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sy-d .sy-vv { font: 500 0.85rem var(--font-mono); color: var(--dim); }
.sy-d .sy-sl { position: relative; height: 60px; touch-action: pan-y; cursor: pointer; outline: none; }
.sy-d .sy-sl:focus-visible .sy-th { box-shadow: 0 0 0 4px color-mix(in srgb, var(--lilac) 45%, transparent); }
.sy-d .sy-tk { position: absolute; left: 18px; right: 18px; top: 50%; height: 14px; margin-top: -7px; border-radius: 7px; background: var(--line); }
.sy-d .sy-fl { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 7px; background: var(--lilac); }
.sy-d .sy-th { position: absolute; top: 50%; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; background: var(--ink); border: 3px solid var(--lilac); box-shadow: 0 2px 8px #0008; transition: transform 0.08s; }
.sy-d.drag .sy-th { transform: scale(1.15); }
.sy-d .sy-dt { position: absolute; top: 50%; width: 2px; height: 22px; margin: -11px 0 0 -1px; background: var(--dim); opacity: 0.6; border-radius: 1px; }
.sy-d.off .sy-fl { background: var(--dim); opacity: 0.35; }
.sy-d.off .sy-th { border-color: var(--dim); background: var(--raised); }
.sy-d.off .sy-nm { color: var(--dim); }
.sy-d .sy-row { display: flex; justify-content: flex-end; }
.sy-d .sy-pill { height: 40px; width: 72px; border-radius: 20px; border: 1px solid var(--line); background: var(--panel); color: var(--dim); font: 600 0.95rem var(--font-body); cursor: pointer; }
.sy-d .sy-pill.on { background: var(--lilac); color: var(--panel); border-color: var(--lilac); }
.sy-d .sy-rs { height: 40px; width: 48px; border-radius: 20px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font-size: 1.15rem; cursor: pointer; }
.sy-d .sy-rs.gone { visibility: hidden; }
.sy-vol { display: flex; align-items: center; gap: 10px; flex: 1 1 260px; max-width: 420px; }
.sy-vol label { font: 600 1rem var(--font-body); }
.sy-vol input { flex: 1; height: 44px; -webkit-appearance: none; appearance: none; background: transparent; touch-action: pan-y; }
.sy-vol input::-webkit-slider-runnable-track { height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--lilac) var(--p, 70%), var(--line) var(--p, 70%)); }
.sy-vol input::-webkit-slider-thumb { -webkit-appearance: none; width: 32px; height: 32px; margin-top: -10px; border-radius: 50%; background: var(--ink); border: 3px solid var(--lilac); box-shadow: 0 2px 8px #0008; }
.sy-vol output { font: 500 0.9rem var(--font-mono); color: var(--dim); width: 3ch; text-align: right; }
.sy-kb { display: flex; flex-direction: column; gap: 8px; position: sticky; bottom: 0; z-index: 2; box-shadow: 0 -12px 24px var(--panel); }
.sy-keys { position: relative; height: 150px; display: flex; touch-action: none; }
.sy-w { flex: 1; background: var(--key-white); border: 1px solid #0004; border-radius: 0 0 8px 8px; margin: 0 1px; position: relative; }
.sy-w.dn { background: var(--key-white-down); }
.sy-k { position: absolute; top: 0; height: 60%; background: var(--key-black); border-radius: 0 0 6px 6px; z-index: 1; border: 1px solid #000; }
.sy-k.dn { background: var(--lilac); }
.sy-w span { position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; font: 500 0.75rem var(--font-mono); color: #0008; }
.sy-oct { display: flex; align-items: center; gap: 8px; }
.sy-oct span { font: 500 0.95rem var(--font-mono); color: var(--dim); min-width: 4ch; text-align: center; }
.sy-note { color: var(--dim); font-size: 0.85rem; line-height: 1.4; }
@media (max-width: 560px) { .sy-dials { grid-template-columns: 1fr; } .sy-d { grid-template-columns: 92px minmax(0, 1fr) 64px; } }
`;
      document.head.appendChild(css);

      // ---- the screen ----
      const root = mk("div", "sy"); root.id = "syView"; root.setAttribute("role", "main");
      root.innerHTML = `
<div class="sy-top">
  <h1>Nate <span>Bloom</span> Synths</h1>
  <span class="sy-chip" id="syKbChip"><i></i><span>No keyboard yet</span></span>
  <div class="sy-mode" id="syMode" role="group" aria-label="What the Yamaha plays" hidden><span>Plays</span><button type="button" data-m="piano">Piano only</button><button type="button" data-m="synth">Synth only</button><button type="button" data-m="both">Both</button></div>
  <span class="sy-sp"></span>
  <button class="sy-b" id="syTest" title="Plays a chord on the synth: if you hear it, the tablet's sound is fine">🔊 Test sound</button>
  <button class="sy-b sy-rec" id="syRec" title="Record what you play">● Record</button>
  <button class="sy-b" id="syKeysBtn" title="Keys on the screen">Keys on screen</button>
</div>
<button class="sy-paused" id="syPaused" hidden>Sound is paused · tap here to turn it back on</button>
<div class="sy-take" id="syTake" hidden><span class="sy-tk-dot">●</span><span id="syTakeInfo">Recording ready</span><span class="sy-sp"></span><button class="sy-b on" id="syTakePlay">▶ Play</button><button class="sy-b" id="syTakeSave" title="Save it as an MP3 (to Downloads, or share it)">Save</button><button class="sy-b ghost" id="syTakeDel">Delete</button></div>
<div class="sy-sec"><div class="sy-h"><b>Synth</b><small>tap one to play it · <b class="sy-plusk">+</b> stacks it with what's playing</small></div>
  <div class="sy-tiles" id="syTiles"></div>
  <div class="sy-stack" id="syStack"></div>
  <div class="sy-saved" id="sySaved"></div>
</div>
<div class="sy-sec"><div class="sy-h"><b>Sound</b><em id="syName"></em><small id="syAfter"></small><span class="sy-sp"></span><button class="sy-b" id="syResetSnd">↺ Default sound</button></div><div class="sy-dials" id="syDials"></div></div>
<div class="sy-sec"><div class="sy-h"><b>Effects</b><small>each one On or Off</small><span class="sy-sp"></span><div class="sy-vol"><label for="syVolume">Volume</label><input type="range" id="syVolume" min="0" max="100" step="1"><output id="syVolV"></output></div><button class="sy-b" id="syFxOff">All effects off</button><button class="sy-b" id="syFxReset">↺ Default effects</button></div>
  <div class="sy-dials" id="syFx"></div>
</div>
<div class="sy-sec sy-kb" id="syKb" hidden>
  <div class="sy-h"><b>Keys</b><span class="sy-sp"></span><span class="sy-oct"><button class="sy-b" id="syOctDn" aria-label="Octave down">−</button><span id="syOct">C3</span><button class="sy-b" id="syOctUp" aria-label="Octave up">+</button></span></div>
  <div class="sy-keys" id="syKeys"></div>
</div>
<div class="sy-h"><div class="sy-mode" id="syOut" role="group" aria-label="Where the synth sound comes out"><span>Sound out</span><button type="button" data-o="tablet">Tablet</button><button type="button" data-o="piano">Piano speakers</button></div></div>
<div class="sy-h"><div class="sy-note" id="syNote" style="flex:1"></div><button class="sy-b ghost" id="syFull" title="The whole of Nate Bloom">Full app</button></div>`;
      document.body.appendChild(root);

      // ---- a slider: tap the track to jump, slide the thumb; ↺ goes back to the default (the mark on the track) ----
      // A vertical swipe still scrolls the page (touch-action: pan-y): a value changes only on a tap or a sideways slide.
      // opt: { name, get(), set(v), def, fmt(v), off: { isOn(), toggle() } }
      function dial(opt) {
        const d = mk("div", "sy-d");
        d.innerHTML = `<div class="sy-lab"><div class="sy-nm"></div><div class="sy-vv"></div></div><div class="sy-sl" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><div class="sy-tk"><div class="sy-fl"></div><div class="sy-dt"></div><div class="sy-th"></div></div></div><div class="sy-row"></div>`;
        const sl = d.querySelector(".sy-sl"), tk = d.querySelector(".sy-tk"), fl = d.querySelector(".sy-fl"), th = d.querySelector(".sy-th"), vv = d.querySelector(".sy-vv"), row = d.querySelector(".sy-row");
        d.querySelector(".sy-nm").textContent = opt.name; sl.setAttribute("aria-label", opt.name);
        d.querySelector(".sy-dt").style.left = (opt.def * 100) + "%";
        let pill = null;
        if (opt.off) { pill = mk("button", "sy-pill"); pill.type = "button"; pill.addEventListener("click", () => { opt.off.toggle(); paint(); }); row.appendChild(pill); }
        const rs = mk("button", "sy-rs", "↺"); rs.type = "button"; rs.title = "Back to " + opt.name + "'s default"; rs.setAttribute("aria-label", rs.title);
        rs.addEventListener("click", () => { opt.set(opt.def); paint(); }); if (!opt.off) row.appendChild(rs);   // (an effect has On/Off; Default effects puts them all back)
        function paint() {
          const v = Math.min(1, Math.max(0, +opt.get() || 0)), isOn = !opt.off || opt.off.isOn();
          fl.style.width = (v * 100) + "%"; th.style.left = (v * 100) + "%";
          vv.textContent = isOn ? opt.fmt(v) : "off";
          d.classList.toggle("off", !isOn);
          sl.setAttribute("aria-valuenow", Math.round(v * 100)); sl.setAttribute("aria-valuetext", vv.textContent);
          if (pill) { pill.textContent = isOn ? "On" : "Off"; pill.classList.toggle("on", isOn); pill.setAttribute("aria-pressed", String(isOn)); pill.title = opt.name + (isOn ? " is on · tap for off" : " is off · tap for on"); }
          rs.classList.toggle("gone", Math.abs(v - opt.def) < 0.005 && isOn);
        }
        const at = x => { const r = tk.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
        const put = v => { if (opt.off && !opt.off.isOn()) opt.off.toggle(); opt.set(v); paint(); };
        // grabbing the thumb moves it from where it is (no jump); anywhere else on the track: a tap jumps there
        let pid = null, x0 = 0, y0 = 0, v0 = 0, grab = false, sliding = false;
        sl.addEventListener("pointerdown", e => {
          pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; v0 = +opt.get() || 0; sliding = false;
          const tr = th.getBoundingClientRect(); grab = Math.abs(e.clientX - (tr.left + tr.width / 2)) < 30;
          if (e.pointerType === "mouse") { try { sl.setPointerCapture(pid); } catch (er) {} }
        });
        sl.addEventListener("pointermove", e => {
          if (e.pointerId !== pid) return;
          if (!sliding) { if (Math.abs(e.clientX - x0) < 6 || Math.abs(e.clientX - x0) < Math.abs(e.clientY - y0)) return; sliding = true; d.classList.add("drag"); try { sl.setPointerCapture(pid); } catch (er) {} }
          const r = tk.getBoundingClientRect();
          put(grab ? Math.min(1, Math.max(0, v0 + (e.clientX - x0) / r.width)) : at(e.clientX));
        });
        sl.addEventListener("pointerup", e => { if (e.pointerId !== pid) return; if (!sliding && !grab) put(at(e.clientX)); pid = null; sliding = false; d.classList.remove("drag"); });
        sl.addEventListener("pointercancel", e => { if (e.pointerId === pid) { pid = null; sliding = false; d.classList.remove("drag"); } });
        sl.addEventListener("contextmenu", e => e.preventDefault());
        sl.addEventListener("keydown", e => {
          const k = e.key, step = e.shiftKey ? 0.1 : 0.02;
          if (k === "ArrowUp" || k === "ArrowRight") { put(Math.min(1, (+opt.get() || 0) + step)); e.preventDefault(); }
          if (k === "ArrowDown" || k === "ArrowLeft") { put(Math.max(0, (+opt.get() || 0) - step)); e.preventDefault(); }
        });
        d.__paint = paint; paint();
        return d;
      }

      // ---- the synths ----
      const synthItems = () => { try { return window.__qk.items().filter(q => q.eng && ENGINES[q.eng] && ENGINES[q.eng].knobs); } catch (e) { return []; } };
      const curEng = () => (ENGINES[state.engine] && ENGINES[state.engine].knobs) ? state.engine : null;
      function paramsOf(id) { if (!state.params[id]) state.params[id] = Object.fromEntries(ENGINES[id].knobs.map(([k, , v]) => [k, v])); return state.params[id]; }
      // ---- stacking: tap a tile = that synth alone; + = add it to (or take it out of) the stack; a stacked synth's
      // tile, or its chip, picks which one the sliders below change ----
      const stkItems = () => { try { return window.__stk.items().filter(x => x.t === "syn"); } catch (e) { return []; } };
      const itemOf = eng => stkItems().find(x => x.id === eng) || null;
      async function playAlone(q) {
        try { start(); } catch (e) {}
        try { allOff(); } catch (e) {}
        const it0 = itemOf(q.eng);
        if (!it0) { try { await window.__qk.alone(q); } catch (e) {} }
        const it = itemOf(q.eng); if (it) { try { window.__stk.only(it); } catch (e) {} }
        if (state.engine !== q.eng) { state.engine = q.eng; try { renderEngine(); } catch (e) {} }
        paintAll();
      }
      function focusSyn(eng) { const it = itemOf(eng); if (it) { try { window.__stk.focusOn(it); } catch (e) {} } if (state.engine !== eng) { state.engine = eng; try { renderEngine(); } catch (e) {} } paintAll(); }
      async function stackToggle(q) {
        try { start(); } catch (e) {}
        const it = itemOf(q.eng), n = stkItems().length;
        if (it) { if (n > 1) { try { window.__stk.drop(it); } catch (e) {} } else { say("That's the only one playing"); } }
        else { try { await window.__qk.toggle(q); } catch (e) {} say(ENGINES[q.eng].name + " added · " + stkItems().map(x => ENGINES[x.id].short || ENGINES[x.id].name).join(" + ")); }
        paintAll();
      }
      function paintTiles() {
        const box = $s("syTiles"); box.innerHTML = "";
        const cur = curEng(), on = new Set(stkItems().map(x => x.id)), many = on.size > 1;
        synthItems().forEach(q => {
          const playing = on.has(q.eng);
          const t = mk("div", "sy-t" + (q.eng === cur ? " cur" : "") + (playing ? " on" : "")); t.setAttribute("role", "button"); t.tabIndex = 0;
          t.append(mk("b", "", q.name), mk("small", "", q.sub || ""));
          t.setAttribute("aria-pressed", String(playing)); t.title = ENGINES[q.eng].name + (playing && many ? " · tap to change its sliders" : " · tap to play it alone");
          t.addEventListener("click", e => { if (e.target.closest(".sy-pl")) return; if (playing && many) focusSyn(q.eng); else playAlone(q); });
          const pl = mk("button", "sy-pl", playing ? "✓" : "+"); pl.type = "button";
          pl.title = playing ? (many ? "Take " + ENGINES[q.eng].name + " out of the stack" : ENGINES[q.eng].name + " is playing") : "Stack " + ENGINES[q.eng].name + " with what's playing"; pl.setAttribute("aria-label", pl.title);
          pl.addEventListener("click", e => { e.stopPropagation(); stackToggle(q); });
          t.appendChild(pl); box.appendChild(t);
        });
        // the stack: one chip per synth playing (tap = its sliders, ✕ = out), then Save
        const st = $s("syStack"); st.innerHTML = "";
        const its = stkItems();
        if (its.length > 1) {
          st.appendChild(mk("span", "sy-lab2", "Playing"));
          its.forEach(it => {
            const c = mk("span", "sy-chip2" + (it.id === cur ? " cur" : "")), b = mk("button", "", ENGINES[it.id].short || ENGINES[it.id].name); b.type = "button";
            b.title = "Change " + ENGINES[it.id].name + "'s sliders"; b.addEventListener("click", () => focusSyn(it.id));
            const x = mk("button", "x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Take " + ENGINES[it.id].name + " out");
            x.addEventListener("click", () => { try { window.__stk.drop(it); } catch (e) {} paintAll(); });
            c.append(b, x); st.appendChild(c);
          });
          const sv = mk("button", "sy-b", "Save this stack"); sv.type = "button"; sv.title = "Keep this sound (the synths, their sliders) to bring back with one tap";
          sv.addEventListener("click", saveStack); st.appendChild(sv);
        }
        const ce = cur && ENGINES[cur];
        $s("syName").textContent = ce ? ce.name : "Pick a synth";
        $s("syAfter").textContent = ce ? (its.length > 1 ? "one of " + its.length + " stacked · its own sliders" : (ce.after || "")) : "";
        paintSaved();
      }
      // ---- saved sounds (Nate Bloom's My sounds): one tap brings a stack back ----
      function stackName() { return stkItems().map(x => ENGINES[x.id].short || ENGINES[x.id].name).join(" + ") || "My sound"; }
      function saveStack() {
        try {
          let nm = stackName(), k = 2; const names = new Set(mySounds.map(x => x.name)); const base = nm; while (names.has(nm)) nm = base + " " + k++;
          mySounds.unshift(captureSound(nm)); saveMs(); try { renderMySounds(); } catch (e) {}
          say("Saved \"" + nm + "\" · it's under Saved"); paintSaved();
        } catch (e) { say("Couldn't save it"); }
      }
      function paintSaved() {
        const box = $s("sySaved"); box.innerHTML = "";
        let list = []; try { list = mySounds.filter(x => x && ENGINES[x.engine]); } catch (e) {}
        if (!list.length) return;
        box.appendChild(mk("span", "sy-lab2", "Saved"));
        list.slice(0, 12).forEach(sd => {
          const c = mk("span", "sy-chip2"), b = mk("button", ""); b.type = "button";
          b.append(document.createTextNode(sd.name));
          const parts = Object.keys(sd.layers || {}).filter(k => sd.layers[k] && sd.layers[k].on && ENGINES[k]).map(k => ENGINES[k].short || ENGINES[k].name);
          if (parts.length && parts.join(" + ") !== sd.name) b.appendChild(mk("small", "", parts.join(" + ")));
          b.title = "Play " + sd.name; b.addEventListener("click", () => { try { allOff(); } catch (e) {} try { applySound(sd); } catch (e) {} paintAll(true); say(sd.name); });
          const x = mk("button", "x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Delete " + sd.name);
          let arm = 0;
          x.addEventListener("click", () => {
            if (!arm) { x.textContent = "Sure?"; arm = setTimeout(() => { arm = 0; x.textContent = "✕"; }, 2500); return; }
            const i = mySounds.indexOf(sd); if (i >= 0) { mySounds.splice(i, 1); saveMs(); try { renderMySounds(); } catch (e) {} } paintSaved();
          });
          c.append(b, x); box.appendChild(c);
        });
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
        const vol = $s("syVolume"); vol.value = Math.round(state.fx.volume * 100); $s("syVolV").textContent = vol.value; vol.style.setProperty("--p", vol.value + "%");
      }
      $s("syVolume").addEventListener("input", e => { fxSet("volume", (+e.target.value) / 100); $s("syVolV").textContent = e.target.value; e.target.style.setProperty("--p", e.target.value + "%"); });
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
        const nm = (inp && inp.name) || "", live = [...md.access.outputs.values()].filter(o => o.state !== "disconnected" && !(typeof mdOwnPort === "function" && mdOwnPort(o)));
        const same = live.filter(o => o.name === nm); if (same.length) return same;
        const y = live.filter(isYamaha); return y.length ? y : live.filter(o => !/through|thru|midi through/i.test(o.name || ""));
      }
      function sendLocal(onv) {
        const outs = outsFor(SY.piano); if (!outs.length) return false;
        outs.forEach(o => { try { for (let ch = 0; ch < 16; ch++) o.send([0xb0 | ch, 122, onv ? 127 : 0]); } catch (e) {} });
        try { if (onv) localStorage.removeItem("nb-local-off"); else localStorage.setItem("nb-local-off", "1"); } catch (e) {}
        return true;
      }
      // What the Yamaha plays: Piano (its own sound; the synth ignores its keys), Synth (Local Control off: the piano's
      // keys only reach the synth), Piano + Synth (both). Her choice is kept, and sent again each time it's plugged in
      // (the piano turns Local Control back on at power-up). Piano gets its own sound back when this closes.
      let mode = "both"; try { const m = localStorage.getItem("nb-synths-mode"); if (["piano", "synth", "both"].includes(m)) mode = m; } catch (e) {}
      SY.mode = () => mode;
      function paintMode() {
        const g = $s("syMode"); g.hidden = !SY.piano;
        g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === mode)));
        root.classList.toggle("pianoonly", !!SY.piano && mode === "piano");
      }
      function applyMode(quiet) {
        const wantLocal = mode !== "synth";
        if (!wantLocal || SY.localOff) { const ok = sendLocal(wantLocal); if (ok) SY.localOff = !wantLocal; else if (!quiet) say("Couldn't reach the Yamaha's MIDI. Turn its volume knob down to hear only the synth."); }
        if (mode === "piano") { try { allOff(); } catch (e) {} try { nbSustain(false); } catch (e) {} }
        paintMode();
      }
      $s("syMode").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
        mode = b.dataset.m; try { localStorage.setItem("nb-synths-mode", mode); } catch (e) {}
        try { start(); } catch (e) {}
        applyMode(false);
        say(mode === "piano" ? "Piano only: the Yamaha's own sound, the synth is off" : mode === "synth" ? "Synth only: the Yamaha's piano sound is off" : "Both: piano and synth together");
      }));
      // Piano: the Yamaha's notes and pedal don't reach the synth (other keyboards and the screen still play it)
      { const t0 = window.__midiTap; window.__midiTap = function (e) {
          // the chip's dot flashes on every key from the keyboard: proof the notes are reaching this screen
          try { if (e && e.data && (e.data[0] & 0xf0) === 0x90 && e.data[2] > 0) { const c = $s("syKbChip"); c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit"); SY.lastNote = Date.now(); const nm = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][e.data[1] % 12] + (Math.floor(e.data[1] / 12) - 1); const sp = c.querySelector("span"); sp.textContent = (SY.yamaha ? "Yamaha" : "Keyboard") + " · " + nm; clearTimeout(SY.chipT); SY.chipT = setTimeout(() => paintChip(), 2500); if (!ctx || ctx.state !== "running") paintSound(true); } } catch (er) {}
          try { if (mode === "piano" && SY.piano && e && e.target && e.target.id === SY.piano.id) { const c = e.data[0] & 0xf0; if (c === 0x90 || c === 0x80 || c === 0xb0 || c === 0xe0 || c === 0xd0 || c === 0xa0) return true; } } catch (er) {}
          return t0 ? t0.apply(this, arguments) : false;
        }; }
      function paintLocal() { paintMode(); }
      // the piano gets its own sound back whenever this isn't on screen (another tab or app, the screen off, closed),
      // and Synth turns it off again when it's back
      window.addEventListener("pagehide", () => { if (SY.localOff) sendLocal(true); });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { if (SY.localOff) { sendLocal(true); SY.localOff = false; } }
        else if (SY.piano && mode === "synth") setTimeout(() => applyMode(true), 200);
      });
      function paintChip() {
        const c = $s("syKbChip"); c.classList.toggle("ok", !!SY.piano);
        c.querySelector("span").textContent = SY.yamaha ? "Yamaha connected" : SY.other ? SY.other + " connected" : (md.access ? "Plug in the Yamaha (USB)" : "Tap to connect the keyboard");
        paintLocal();
      }
      function scanPorts() {
        if (!md.access) { paintChip(); return; }
        const ins = [...md.access.inputs.values()].filter(i => i.state !== "disconnected" && !(typeof mdOwnPort === "function" && mdOwnPort(i)));
        const y = ins.find(isYamaha) || null;
        SY.other = !y && ins.length ? (ins[0].name || "A keyboard") : "";
        const wasP = SY.piano; SY.piano = y || ins.find(i => !/through|thru/i.test(i.name || "")) || null;
        if (SY.piano && !y && (!wasP || wasP.id !== SY.piano.id)) { SY.localOff = false; setTimeout(() => applyMode(true), 300); }
        const was = SY.yamaha; SY.yamaha = y;
        if (y && (!was || was.id !== y.id)) {
          yamahaDefaults();
          showKeys(false);
          SY.localOff = false; setTimeout(() => applyMode(true), 300);
          say("Yamaha connected · every synth is on its default sound");
        }
        if (!y && was) { SY.localOff = false; showKeys(true); say("The Yamaha was unplugged · keys on screen"); }
        paintChip();
      }
      { const op = md.onPorts; md.onPorts = function () { try { if (op) op.apply(this, arguments); } catch (e) {} try { scanPorts(); } catch (e) {} }; }
      $s("syKbChip").addEventListener("click", () => { if (!md.access) { try { connectMidi(); } catch (e) {} } });

      // ---- Record: everything you hear (the app's take), then Play, Save (MP3) or Delete ----
      try { localStorage.setItem("nightbloom-recto", "take"); } catch (e) {}   // (a recording here stays a take, never the sampler or the Garage)
      { const tb = () => $s("takeBtn"), bar = () => $s("takeBar"), rec = $s("syRec");
        const paintRec = () => { const t = tb(); if (!t) return; const live = t.classList.contains("live"); rec.classList.toggle("live", live); rec.textContent = live ? t.textContent.replace(/^■\s*/, "■ Stop ") : "● Record"; rec.setAttribute("aria-pressed", String(live)); };
        rec.addEventListener("click", () => { const t = tb(); if (!t) return; try { start(); } catch (e) {} const was = t.classList.contains("live"); try { if (!was) { const tp = $s("takePlay"); if (tp && /■/.test(tp.textContent)) tp.click(); } } catch (e) {} t.click(); paintRec(); if (!was) $s("syTake").hidden = true; });
        setInterval(paintRec, 250);
        const paintTake = () => {
          const b = bar(), el = $s("syTake"); if (!b) return;
          if (b.hidden) { el.hidden = true; return; }
          if (b.dataset.empty) { el.hidden = true; say("Too short to keep · tap Record, play, then Stop"); return; }
          el.hidden = false;
          const m = /(\d+:\d\d)/.exec(($s("takeInfo") || {}).textContent || "");
          $s("syTakeInfo").textContent = "Recording" + (m ? " · " + m[1] : "") + " ready";
        };
        const b = bar(); if (b) new MutationObserver(paintTake).observe(b, { attributes: true, attributeFilter: ["hidden", "data-empty"] });
        const tpl = $s("takePlay"); if (tpl) new MutationObserver(() => { $s("syTakePlay").textContent = /■/.test(tpl.textContent) ? "■ Stop" : "▶ Play"; }).observe(tpl, { childList: true, characterData: true, subtree: true });
        $s("syTakePlay").addEventListener("click", () => { const x = $s("takePlay"); if (x) x.click(); });
        $s("syTakeSave").addEventListener("click", () => { const x = $s("takeMp3"); if (x) { x.click(); say("Saving the MP3…"); } });
        $s("syTakeDel").addEventListener("click", () => { const x = $s("takeDiscard"); if (x) x.click(); $s("syTake").hidden = true; });
      }

      // ---- sound check: Test sound plays a chord on whatever synths are playing; a paused sound engine says so ----
      function paintSound(flash) {
        const el = $s("syPaused"), st = $s("start"), paused = (!ctx || ctx.state !== "running") && !(st && !st.hidden) && !document.hidden;
        el.hidden = !paused; if (paused && flash) say("Sound is paused · tap the orange bar");
      }
      $s("syPaused").addEventListener("click", () => { try { start(); if (ctx && ctx.resume) ctx.resume().then(() => paintSound(), () => {}); } catch (e) {} setTimeout(paintSound, 400); });
      setInterval(paintSound, 1000);
      $s("syTest").addEventListener("click", () => {
        try { start(); if (ctx && ctx.resume) ctx.resume(); } catch (e) {}
        setTimeout(() => {
          try {
            if (!ctx || ctx.state !== "running") { say("The tablet's sound engine is off · tap the orange bar"); paintSound(); return; }
            [60, 64, 67].forEach((m, i) => setTimeout(() => { try { noteOn(m); setTimeout(() => { try { noteOff(m); } catch (e) {} }, 900); } catch (e) {} }, i * 60));
            say("Playing a chord on " + stkItems().map(x => ENGINES[x.id].short || ENGINES[x.id].name).join(" + ") + " · no sound? turn the tablet's volume up");
          } catch (e) {}
        }, 120);
      });

      // ---- Sound out: Tablet, or the piano's speakers over USB (Android's own setting decides the route: with "Disable USB
      // audio routing" on, the tablet; off, the piano). Piano speakers runs the sound at 44.1 kHz, the P-225's rate. ----
      { let out = "tablet"; try { if (localStorage.getItem("nb-synths-out") === "piano") out = "piano"; } catch (e) {}
        const g = $s("syOut"), paintOut = () => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.o === out)));
        paintOut();
        g.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
          if (b.dataset.o === out) return;
          out = b.dataset.o; try { localStorage.setItem("nb-synths-out", out); } catch (e) {} paintOut();
          say(out === "piano" ? "Piano speakers: in Android's Developer options, turn OFF Disable USB audio routing. Reloading…" : "Tablet: in Developer options, turn ON Disable USB audio routing. Reloading…");
          setTimeout(() => { try { if (SY.localOff) sendLocal(true); } catch (e) {} location.reload(); }, 2600);
        }));
      }

      function paintAll(force) { paintTiles(); paintDials(force); paintFx(force); paintChip(); }
      // the base app plays the synths (not samples or drums)
      function toSynths() { try { const b = $s("mSynths"); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); } catch (e) {} if (!curEng()) { const f = synthItems()[0]; if (f) { state.engine = f.eng; try { renderEngine(); } catch (e) {} } } }
      $s("syNote").innerHTML = "The Yamaha plays whichever synth is lit, with its sustain pedal. <b>Plays</b>: Piano only, Synth only, or Both. If Synth still has the piano under it, turn the Yamaha's volume knob down: the synth keeps playing. Sliders: slide or tap the track; the small mark is the default, and ↺ goes back to it.";
      showKeys(true);
      setTimeout(() => { toSynths(); paintAll(true); }, 0);
      $s("startBtn") && $s("startBtn").addEventListener("click", () => setTimeout(() => { toSynths(); paintAll(true); }, 50));
      window.__synths.paint = paintAll; window.__synths.defaults = yamahaDefaults;
    }
  }
//@end
