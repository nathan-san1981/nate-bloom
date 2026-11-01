    // ======================================================================
    // 147: Jam in Live. The Jam button (where the CPU readout was: a web page can't see the tablet's processor, so that
    // number was a guess) opens the main screen's Jam over the knobs: four loops that record what you play (the keys
    // and every pad set) and go round in time, and the band (bass and drums in the chord you hold, in a style). The
    // pads, the keys and the column stay playable while it's open, and the MiniLab's knobs keep their page. J opens it,
    // B is the band, Y U I O are the loops. Jam keeps to the bar of what ▶ plays: it starts on their next bar, and
    // Rhythm, Pads and the Seq start in step with it. The sound buffer and the dropouts (which the tablet really
    // does report) move to Gear.
    // ======================================================================
    const LOOPK = ["Y", "U", "I", "O"];
    const jamB = mkBtn("lvJam", "lv-jam", '<i aria-hidden="true"></i><b>Jam</b><small></small>', "Jam: loops, and a band that follows your chord");
    $id("lvMeter").before(jamB); jamB.dataset.kc = "J";
    const jp = document.createElement("div"); jp.className = "lv-jamp"; jp.id = "lvJamP"; jp.hidden = true; jp.setAttribute("role", "region"); jp.setAttribute("aria-label", "Jam");
    jp.innerHTML = `<div class="lj-h"><strong>Jam</strong><span class="lj-tempo" id="lvJTempo"></span><span class="lj-sp"></span><button class="btn" id="lvJStop" title="Stop every loop (they keep what they recorded)">■ Loops</button><button class="btn" id="lvJClose" aria-label="Close Jam">✕</button></div>
      <div class="lj-loops">${[0, 1, 2, 3].map(k => `<div class="lj-trk" data-k="${k}"><button class="lj-main" id="lvJL${k + 1}" data-kc="${LOOPK[k]}"><span>Loop ${k + 1}</span><b>● Rec</b><i class="lj-bar"></i></button><button class="lj-x" id="lvJX${k + 1}" aria-label="Clear loop ${k + 1}" hidden>✕</button></div>`).join("")}</div>
      <div class="lj-band">
        <button class="lj-bandon" id="lvJBand" aria-pressed="false" data-kc="B"><b>Band</b><small>bass + drums</small></button>
        <div class="lj-chord"><small>chord</small><b id="lvJChord">C</b></div>
        <div class="seg lj-styles" id="lvJStyles" role="group" aria-label="Band style">${Object.keys(JAM_STYLES).map(id => `<button data-s="${id}">${JAM_STYLES[id].name}</button>`).join("")}</div>
      </div>
      <div class="lj-mix">
        <label class="lj-sel">Bass sound <select id="lvJBass" aria-label="Bass sound"></select></label>
        <label class="lj-lvl">Bass <input type="range" id="lvJBassLvl" min="0" max="1" step="0.01" aria-label="Bass level"></label>
        <label class="lj-lvl">Drums <input type="range" id="lvJDrumLvl" min="0" max="1" step="0.01" aria-label="Drums level"></label>
      </div>
      <p class="lv-note lj-note">Loops record the keys and the pads, up to 4 bars, from the bar. The band plays bass and drums in the chord you hold.</p>`;
    lv.querySelector(".lv-ml").appendChild(jp);
    { const src = $id("jamBass"), dst = $id("lvJBass"); if (src) dst.innerHTML = src.innerHTML; }
    const jlTrk = k => jp.querySelector(`.lj-trk[data-k="${k}"]`);
    function jlChord() { const b = JAM.band, q = { maj: "", min: "m", "7": "7", min7: "m7", sus4: "sus4", dim: "dim", "5": "5" }[b.chord.q] || ""; return JAM_NOTES[b.chord.root % 12] + q; }
    function jbPaint() {
      const n = JAM.tracks.filter(t => t.on && t.len).length, rec = JAM.rec, band = JAM.band.on;
      const s = rec ? (rec.armed ? "ready…" : "rec " + (rec.k + 1)) : [n ? n + (n === 1 ? " loop" : " loops") : "", band ? "band" : ""].filter(Boolean).join(" · ");
      nbT(jamB.querySelector("small"), s);
      jamB.classList.toggle("j-on", !!(n || band)); jamB.classList.toggle("j-rec", !!rec && !rec.armed); jamB.classList.toggle("j-arm", !!rec && !!rec.armed);
      nbA(jamB, "aria-pressed", String(!jp.hidden));
    }
    function jlPaint() {
      jbPaint(); if (jp.hidden) return;
      JAM.tracks.forEach((t, k) => {
        const el = jlTrk(k), rec = JAM.rec && JAM.rec.k === k;
        const cls = "lj-trk" + (t.len ? " has" : "") + (t.on && t.len ? " on" : "") + (rec ? (JAM.rec.armed ? " armed" : " rec") : "");
        if (el.className !== cls) el.className = cls;
        nbT(el.querySelector("b"), rec ? (JAM.rec.armed ? "Ready…" : "■ Stop") : !t.len ? "● Rec" : t.on ? "♫ " + (t.len / BAR) + (t.len === BAR ? " bar" : " bars") : "▶ Play");
        const x = el.querySelector(".lj-x"), hide = !t.len || !!rec; if (x.hidden !== hide) x.hidden = hide;
        if (!t.on && !rec) el.querySelector(".lj-bar").style.width = "0%";
      });
      const b = JAM.band;
      nbA($id("lvJBand"), "aria-pressed", String(b.on)); nbT($id("lvJChord"), jlChord());
      jp.querySelectorAll("#lvJStyles button").forEach(x => nbA(x, "aria-pressed", String(x.dataset.s === b.style)));
      const sel = $id("lvJBass"); if (document.activeElement !== sel && sel.value !== b.bass) sel.value = b.bass;
      [["lvJBassLvl", b.bassLvl], ["lvJDrumLvl", b.drumLvl]].forEach(([id, v]) => { const el = $id(id); if (document.activeElement !== el && +el.value !== v) el.value = v; });
      nbT($id("lvJTempo"), Math.round(jamBpm()) + " bpm" + (JAM.clock && jamBpm() !== state.seq.bpm ? " (DJ)" : ""));
    }
    { const pl = jamPaintLoops; jamPaintLoops = function () { const r = pl.apply(this, arguments); jlPaint(); return r; }; }
    { const pb = jamPaintBand; jamPaintBand = function () { const r = pb.apply(this, arguments); jlPaint(); return r; }; }
    // the loops' progress, as the main screen's
    { const ts = jamTrackStep; jamTrackStep = function (s, t) {
        const r = ts.apply(this, arguments);
        if (!jp.hidden && !lv.hidden) {
          const bars = jp.querySelectorAll(".lj-bar");
          JAM.tracks.forEach((tr, k) => { if (!tr.on || !tr.len) return; const local = ((s - tr.start) % tr.len + tr.len) % tr.len; bars[k].style.width = ((local + 1) / tr.len * 100) + "%"; });
          if (JAM.rec && !JAM.rec.armed) bars[JAM.rec.k].style.width = Math.min(100, (s - JAM.rec.start + 1) / (MAX_BARS * BAR) * 100) + "%";
        }
        return r; }; }
    // (open or not is remembered; it shows only while Live does, so Back and Esc close it first and never while it's out of sight)
    const JL = { open: !!lsGet("nightbloom-live-jam", false) };
    const jlShow = () => { const h = !(JL.open && !lv.hidden); if (jp.hidden !== h) jp.hidden = h; };
    function jlOpen(on, quiet) {
      if (on == null) on = !JL.open;
      JL.open = on; lsSet("nightbloom-live-jam", on); jlShow();
      if (on) { closePick(); if (LV.fx) setFx(false); }
      jlPaint(); if (!quiet) add139("live", "jam " + (on ? "open" : "closed"));
    }
    function jlSay(k) {
      const t = JAM.tracks[k], rec = JAM.rec && JAM.rec.k === k;
      return rec ? (JAM.rec.armed ? "ready: it records from the next bar" : "recording · " + LOOPK[k] + " again to stop") : !t.len ? "empty" : t.on ? "playing (" + t.len / BAR + (t.len === BAR ? " bar)" : " bars)") : "stopped";
    }
    function jlLoop(k) { start(); jamTap(k); add139("live", "jam loop " + (k + 1) + ": " + jlSay(k)); }
    function jlBand(on) { start(); jamBandOn(on == null ? !JAM.band.on : on); add139("live", "jam band " + (JAM.band.on ? "on · " + JAM.band.style : "off")); }
    function jlKey(low) {
      if (low === "j") { start(); jlOpen(); return; }
      if (low === "b") { jlBand(); mlHud("Band", JAM.band.on ? JAM_STYLES[JAM.band.style].name + " · hold a chord" : "off", null); return; }
      const k = "yuio".indexOf(low); if (k < 0) return;
      jlLoop(k); mlHud("Loop " + (k + 1), jlSay(k), null);
    }
    jamB.addEventListener("click", () => { start(); jlOpen(); });
    $id("lvJClose").addEventListener("click", () => jlOpen(false));
    $id("lvJStop").addEventListener("click", () => { jamLoopsOff(); add139("live", "jam loops stopped"); });
    for (let k = 0; k < 4; k++) {
      $id("lvJL" + (k + 1)).addEventListener("click", () => jlLoop(k));
      $id("lvJX" + (k + 1)).addEventListener("click", () => { jamClear(k); mlHud("Loop " + (k + 1), "empty again", null); add139("live", "jam loop " + (k + 1) + " cleared"); });
    }
    $id("lvJBand").addEventListener("click", () => jlBand());
    jp.querySelectorAll("#lvJStyles button").forEach(x => x.addEventListener("click", () => { JAM.band.style = x.dataset.s; jamSave(); jamPaintBand(); add139("live", "jam style " + x.dataset.s); }));
    $id("lvJBass").addEventListener("change", e => { JAM.band.bass = e.target.value; jamSave(); jamPaintBand(); });
    $id("lvJBassLvl").addEventListener("input", e => { JAM.band.bassLvl = +e.target.value; jamSave(); });
    $id("lvJDrumLvl").addEventListener("input", e => { JAM.band.drumLvl = +e.target.value; if (JAM.drumBus) JAM.drumBus.gain.setTargetAtTime(JAM.band.drumLvl, ctx.currentTime, 0.02); jamSave(); });
    setInterval(() => { if (!lv.hidden && !jp.hidden) nbT($id("lvJTempo"), Math.round(jamBpm()) + " bpm" + (JAM.clock && jamBpm() !== state.seq.bpm ? " (DJ)" : "")); }, 1000);
    new MutationObserver(() => { jlShow(); if (!lv.hidden) jlPaint(); }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    // ---------- what Live's pads play goes into a recording loop too ----------
    // Beat Pads (banks A–D), Notes, Chords, the sampler's slots and Rhythm, as well as the keys and Samples (already heard)
    let jlBpLive = 0, jlRcLive = 0;
    const jlRecOn = () => !!(JAM.rec && !JAM.rec.armed && !JAM.replaying && ctx);
    { const bd = bpDown; bpDown = function () { jlBpLive++; try { return bd.apply(this, arguments); } finally { jlBpLive--; } }; }
    { const bh = bpHit; bpHit = function (k, t, vel, mod) {
        if (jlBpLive && jlRecOn() && t <= ctx.currentTime + 0.03) jamRecord("bp", Object.assign({ k, v: Math.round(vel * 100) / 100 }, mod ? { m: JSON.parse(JSON.stringify(mod)) } : {}));
        return bh.apply(this, arguments); }; }
    { const gp = gridPad; gridPad = function () { const p = gp.apply(this, arguments); if (p && p.down) { const d = p.down; p.down = function () { jlRcLive++; try { return d.apply(this, arguments); } finally { jlRcLive--; } }; } return p; }; }
    { const ra = rcAudition; rcAudition = function (i) { if (jlRcLive && jlRecOn()) jamRecord("rc", { i, v: 0.85 }); const k = jlRcLive; jlRcLive = 0; try { return ra.apply(this, arguments); } finally { jlRcLive = k; } }; }   // (a sound still loading plays a moment later)
    { const rh = rcHit; rcHit = function (i, t, vel) { if (jlRcLive && jlRecOn() && t <= ctx.currentTime + 0.03) jamRecord("rc", { i, v: Math.round(vel * 100) / 100 }); return rh.apply(this, arguments); }; }
    const jlPadNotes = new Map();   // notes a pad holds (Notes, Chords, a slot): the band hears them as a chord
    { const pv = padVoices, ps = padStop;
      padVoices = function (id, notes, vel, setup) {
        const r = pv.apply(this, arguments);
        jlPadNotes.set(id, notes.slice());
        if (jlRecOn()) {
          let eng = state.engine, slot = state.samp.slot;
          if (setup) { const e0 = state.engine, s0 = state.samp.slot; try { setup(); eng = state.engine; slot = state.samp.slot; } catch (e) {} finally { state.engine = e0; state.samp.slot = s0; } }
          const made = PV.get(id), stk = state.stack ? JSON.parse(JSON.stringify(state.stack)) : null;
          notes.forEach((m, j) => { const v = made && made.length === notes.length ? made[j] : null, w = jamRecord("note", { midi: m, engine: eng, slot, stk }, v); if (v && w !== v) made[j] = w; });
        }
        jamNoteChange(); return r;
      };
      padStop = function (id) { const r = ps.apply(this, arguments); if (jlPadNotes.delete(id)) jamNoteChange(); return r; }; }
    jamNoteChange = function () {
      const held = [...voices.keys()]; heldVoices.forEach(v => held.push(...v.tones)); jlPadNotes.forEach(ns => held.push(...ns));
      const c = jamChordFrom(held); if (!c) return;
      JAM.band.chord = { root: c.root, q: c.q }; jamPaintBand();
    };
    { const jf = jamFire; jamFire = function (ev, t) {
        if (ev.kind === "bp") { JAM.replaying = true; try { bpHit(ev.k, t, ev.v, ev.m); } catch (e) {} finally { JAM.replaying = false; } return; }
        if (ev.kind === "rc") { JAM.replaying = true; try { rcHit(ev.i, t, ev.v); } catch (e) {} finally { JAM.replaying = false; } return; }
        return jf.apply(this, arguments); }; }
    // ---------- one grid: Jam starts on the bar of what plays, and what ▶ plays starts in step with Jam ----------
    function jlBarAhead() {   // the next bar line of Rhythm, Pads or the Seq, if one is playing
      if (!ctx) return null; const now = ctx.currentTime + 0.03;
      if (RC.playing) { const sd = rcStepDur(), n = Math.ceil(RC.step / 16) * 16; let t = RC.nextT + (n - RC.step) * sd; if (t < now) t += 16 * sd; return t; }
      if (BP.playing) { const p = bpPosAt(now), n = Math.ceil(p / 16) * 16; return bpTimeAt(n); }
      if (playing) { const sd = stepDur(); let t = nextTime + ((16 - curStep % 16) % 16) * sd; if (t < now) t += 16 * sd; return t; }
      return null;
    }
    function jlNextBar() { if (!JAM.clock || !ctx) return null; const sd = jamStepDur(), n = Math.ceil(JAM.step / 16) * 16; let t = JAM.nextT + (n - JAM.step) * sd; if (t < ctx.currentTime + 0.03) t += 16 * sd; return t; }
    { const jc = jamClockOn; jamClockOn = function () {
        const was = !!JAM.clock, r = jc.apply(this, arguments);
        if (!was && JAM.clock) {
          JAM.step = Math.ceil(JAM.step / 16) * 16;   // (a fresh start begins on a bar of the band's pattern)
          let lead = false; try { const L = LEAD(); lead = !!(L && L.playing && L.bpm0); } catch (e) {}
          if (!lead) { const t = jlBarAhead(); if (t != null) JAM.nextT = t; }
        }
        return r; }; }
    { const rs = jamRecStart; jamRecStart = function () {   // (waiting for the bar shows as Ready…)
        const r = rs.apply(this, arguments);
        if (JAM.rec && !JAM.rec.armed && ctx && JAM.rec.t0 > ctx.currentTime + 0.15) { JAM.rec.armed = true; jamPaintLoops(); }
        return r; }; }
    const withJamGrid = f => function () {   // (Ableton Link's grid comes first when it's on)
      if (!JAM.clock || !ctx) return f.apply(this, arguments);
      const g0 = NB_GRID;
      NB_GRID = steps => { const g = g0 ? g0(steps) : null; if (g) return g; const L = steps || 16; return { t: JAM.nextT, step: ((JAM.step % L) + L) % L, abs: JAM.step }; };
      try { return f.apply(this, arguments); } finally { NB_GRID = g0; }
    };
    rcPlay = withJamGrid(rcPlay); startSeq = withJamGrid(startSeq);
    { const bt = bpTransport; bpTransport = function (on) {
        const was = BP.playing, r = bt.apply(this, arguments);
        if (on && !was && BP.playing && JAM.clock && !RC.playing && ctx) { const t = jlNextBar(); if (t != null) { BP.aT = t; BP.sched = BP.aPos; } }
        return r; }; }
    // ---------- Gear: the sound buffer and the dropouts ----------
    function gearSnd() {
      const d = DROP.api ? cpuDrops(60) : null;
      return `<div class="lv-pkg">Sound on this tablet</div>
        ${d != null ? `<div class="lv-gr"><span class="lv-st${d ? " bad" : " on"}"></span><span>${d ? "The sound dropped out " + d + (d === 1 ? " time" : " times") + " in the last minute" : "No dropouts in the last minute"}${DROP.total ? " · " + DROP.total + " since the app opened" : ""}</span></div>` : ""}
        ${bufHTML().replace('<div class="lv-pkg">Sound buffer</div>', "")}`;
    }
    { const og = openGear; openGear = function () {
        const r = og.apply(this, arguments);
        pick.querySelectorAll(".lc-buf button").forEach(b => b.addEventListener("click", () => { lsSet("nightbloom-buffer", b.dataset.b); add139("live", "sound buffer → " + b.dataset.b + " (after a reload)"); openGear(); }));
        const rl = pick.querySelector("#lcReload"); if (rl) rl.addEventListener("click", () => { add139("live", "reload for the sound buffer"); location.reload(); });
        return r; }; }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ liveJam: { open: !jp.hidden, band: JAM.band.on ? JAM.band.style : "off", chord: jlChord(), clock: !!JAM.clock,
      loops: JAM.tracks.map(t => t.len ? (t.on ? "playing " : "stopped ") + t.len / BAR + " bars, " + t.events.length + " hits" : "empty"), recording: JAM.rec ? (JAM.rec.armed ? "ready, loop " : "loop ") + (JAM.rec.k + 1) : "" } }));
    jlShow(); jlPaint();
    window.__live12 = { jlOpen, jlPaint, jlKey, jlLoop, jlBand, jlBarAhead, jlNextBar, gearSnd, jlPadNotes };
