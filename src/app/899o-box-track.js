//@site-only
  // ======================================================================
  // (box) Fifteen sounds and a Track tab.
  // SOUNDS: on the box the big knob, ‹ › and + Layer walk fifteen synths, not the hundreds of library and classic
  // presets: Supersaw, Analog Poly, Morph Pad, Juno Strings, Alpha Juno, Blade Brass, Ghost Choir, Spectral Drone,
  // Natewave, Mono Bass & Lead, Sync Lead, Pluck, Hoover, Comb Bells, Speech. A tap on the sound's name (or + Layer)
  // opens them as fifteen big buttons: tap one to play it (or, from + Layer, to add it on top).
  // TRACK: make something, then play to it. The Rhythm Creator makes the beat (a style, New for another take, Vary),
  // Pads records your finger drumming on the MiniLab's pads into Beat Pads, and Keys 1–3 each record a loop of what
  // you play on the keys, with the sound (and layers) you had then, so you can change sound and play over them.
  // A recording starts on the next bar, lasts the loop (1, 2 or 4 bars) and plays straight back; ● Rec again adds to
  // it. Everything follows the Rhythm Creator's clock, so it all stays in time. Loops are kept on the box.
  // ======================================================================
  {
    const BOX = window.__box;
    if (BOX && BOX.on) {
      // ---------- keeping the sound clean ----------
      // The Pi's audio thread drops out (a crackle) when too many voices sound at once: a held chord on Hoover, Sync Lead
      // or Comb Bells with the last chord's tails still ringing was enough (measured: 8 notes plus tails, dropouts every
      // second). Nate Bloom already has a lighter setting for that (fewer ringing tails, the plainer filter past 16
      // voices), but it switches on only when Chrome reports a dropout, which the box's Chrome never does; on the box it's
      // simply always on. And at most 10 notes sound at once (the oldest is let go), not the desktop's 32.
      setInterval(() => { NB_HOT = performance.now() + 3000; }, 1000);
      { const BOX_MAX = 10, on0 = noteOn; noteOn = function () {
          const r = on0.apply(this, arguments);
          while (voices.size > BOX_MAX && order.length) { const o = order.shift(); const v = voices.get(o); if (v) { try { v.stop(); } catch (e) {} voices.delete(o); try { markTones(v.tones, markKey, false); } catch (e) {} } }
          return r;
        }; }
      // Saturation: the FX knobs (Drive, Echo, Space) are global and stayed wherever the MiniLab left them, on every sound
      // after: the box was found at Drive 0.81, Echo 0.62, Space 1 (defaults 0.15 / 0.3 / 0.55), so everything came out
      // fuzzed and washed. Each of the fifteen now starts clean (below), and on the box the Drive knob's top is a warm
      // drive (45 % of the desktop's), not a fuzz box. Turned up once by hand it still does what it says.
      const FX_CLEAN = { drive: 0.1, wobble: 0.15, echo: 0.2, space: 0.3 };
      const fxClean = () => { try { Object.assign(state.fx, FX_CLEAN); if (ctx) applyFx(); try { refreshFxKnobs(); } catch (e) {} save(); } catch (e) {} };
      { const a0 = applyFx; applyFx = function () {
          const d = state.fx.drive; state.fx.drive = d * 0.45;
          try { return a0.apply(this, arguments); } finally { state.fx.drive = d; }
        }; }
      try { if (localStorage.getItem("nb-box-fxclean") !== "1") { localStorage.setItem("nb-box-fxclean", "1"); setTimeout(fxClean, 1500); } } catch (e) {}   // (once: the settings it was found with)
      // (a look at the output stages, for checks: what the drive, compressor and limiter are doing right now)
      window.__nbStages = () => { try { return { fx: Object.assign({}, state.fx), comp: fx.comp && +fx.comp.reduction.toFixed(1), lim: fx.limiter && +fx.limiter.reduction.toFixed(1), level: (() => { try { return __nbTest.level(); } catch (e) { return null; } })(), sound: state.cur && state.cur.name, layers: Object.keys(state.layers).filter(k => state.layers[k].on).map(k => [k, state.layers[k].level]) }; } catch (e) { return String(e); } };
      // ---------- the fifteen ----------
      const PICK = ["saw", "analog", "vital", "juno", "alpha", "tyrell", "choir", "zeb", "wave", "mono", "sync", "pluck", "hoover", "bells", "speech"];
      const box15 = () => {
        const ids = PICK.filter(id => ENGINES[id]); if (ids.length < 15 && ENGINES.fm) ids.splice(ids.length - 2, 0, "fm");
        return ids.slice(0, 15).map(id => allEntries().find(e => e.id === "e:" + id)).filter(Boolean);
      };
      window.__box15 = box15;
      // the Quick row of sounds (and Play's tabs) shows the same fifteen synths, not every engine (only on the box, not saved)
      try { tabCfg.hidden = Object.keys(ENGINES).filter(id => !PICK.includes(id) && !(id === "fm" && !ENGINES.alpha)); } catch (e) {}
      const BR = { i: -1, t: 0, last: "" };
      // where the knob is: the sound it last picked, unless something else changed the sound since (the engine is the truth,
      // not state.cur, which can still name a sound that was swapped out)
      function curIdx(list) { const eng = "e:" + state.engine; let i = list.findIndex(e => e.id === eng); if (i < 0) i = list.findIndex(e => state.cur && e.id === state.cur.id); return i; }
      function browse15(d) {
        const list = box15(); if (!list.length) return;
        if (!BR.t && !(BR.i >= 0 && BR.i < list.length && list[BR.i].id === BR.last && "e:" + state.engine === BR.last)) { const i = curIdx(list); BR.i = i < 0 ? (d > 0 ? -1 : 0) : i; }
        BR.i = (BR.i + d + list.length) % list.length;
        const e = list[BR.i]; window.__box15pend = e.name;
        try { window.__pk.flashOn(e.name, (BR.i + 1) + " of " + list.length); } catch (x) {}
        try { const nb = $id("tbName"); if (nb) { nbT(nb.querySelector("b"), e.name); nbT($id("tbSub"), (BR.i + 1) + " of " + list.length); } } catch (x) {}
        clearTimeout(BR.t); BR.t = setTimeout(() => { BR.t = 0; window.__box15pend = ""; play15(e); }, 250);
        return true;   // (899j: the name's already up; don't put the old one back)
      }
      // the MiniLab counts as using the box: its screen draws at full speed while you turn and play, not the 12 frames a
      // second the box drops to after two minutes without a touch (the app only sees touches and keys)
      { let back = 0, was = 0;
        window.__nbMidiTick = () => {
          if (window.__nbFps && window.__nbFps < 30) { was = window.__nbFps; window.__nbFps = 30; }
          if (was) { clearTimeout(back); back = setTimeout(() => { if (window.__nbFps === 30) window.__nbFps = was; was = 0; }, 120000); }
        }; }
      // a picked sound is the only one playing (layers come back with + Layer); before, the old sound kept playing under it
      async function play15(e) {
        start(); BR.last = e.id; const L15 = box15(); BR.i = L15.findIndex(x => x.id === e.id);
        try { await chooseEntry(e); } catch (x) {}
        try { const k = e.id.slice(2), it = window.__stk.items().find(x => x.t === "syn" && x.id === k); if (it) window.__stk.only(it); else { for (const q in state.layers) state.layers[q].on = q === k; state.engine = k; state.melodic = k; renderEngine(); save(); } } catch (x) {}
        fxClean();
        setTimeout(() => { ML.lay = null; try { mlRefresh(true); lvPaintTop(); lvPaintKnobs(); paintCards(true); } catch (x) {} }, 100); }
      async function add15(e) {
        start(); let ok = false; try { ok = await window.__stk.together(e); } catch (x) {}
        mlHud(ok === false ? e.name : "Layered: " + e.name, ok === false ? "already playing" : "added on top", null);
        setTimeout(() => { ML.lay = null; try { mlRefresh(true); lvPaintTop(); lvPaintKnobs(); paintCards(true); } catch (x) {} }, 120);
      }
      if (window.__live4) window.__live4.browse = browse15;   // the big knob (899j turns through __live4.browse)
      window.__box15browse = browse15; window.__box15add = add15;
      // the fifteen as big buttons
      function sheet(mode) {
        let el = $id("tbSheet");
        if (!el) {
          el = document.createElement("div"); el.id = "tbSheet"; el.className = "tb-sheet"; el.hidden = true;
          el.innerHTML = `<div class="tb-sh-head"><strong id="tbShTitle"></strong><button type="button" class="btn" id="tbShClose">Done</button></div><div class="tb-sh-grid" id="tbShGrid"></div>`;
          ($id("playView") || document.body).appendChild(el);
          $id("tbShClose").addEventListener("click", () => { el.hidden = true; });
        }
        el.dataset.mode = mode;
        nbT($id("tbShTitle"), mode === "add" ? "Add a sound on top" : "Pick the sound");
        const g = $id("tbShGrid"); g.innerHTML = "";
        let playing = []; try { playing = window.__stk.keys(); } catch (x) {}
        box15().forEach(e => {
          const b = document.createElement("button"); b.type = "button"; b.className = "tb-snd" + (playing.includes(e.name) ? " on" : "");
          b.innerHTML = "<b></b><small></small>"; b.querySelector("b").textContent = e.name; b.querySelector("small").textContent = (e.sub || "").replace(/^after /, "");
          b.addEventListener("click", () => { el.hidden = true; if (mode === "add") add15(e); else play15(e); });
          g.appendChild(b);
        });
        el.hidden = false;
      }
      window.__box15sheet = sheet;
      // + Layer on the 5" tab screen: the fifteen to add on top
      document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("#plPick"); if (!b || !document.documentElement.classList.contains("nb-tabs")) return; e.preventDefault(); e.stopImmediatePropagation(); sheet("add"); }, true);

      // ---------- the loops ----------
      const LP = { bars: 2, parts: [{ ev: [], snd: "", mute: false }, { ev: [], snd: "", mute: false }, { ev: [], snd: "", mute: false }], beatMute: false, style: "Boom bap", snap: true,
        rec: -1, recStart: 0, pass: 0, sched: null, inPlay: false, timer: 0 };
      try { const o = JSON.parse(localStorage.getItem("nb-box-loops") || "null"); if (o && Array.isArray(o.parts)) { LP.bars = [1, 2, 4].includes(o.bars) ? o.bars : 2; o.parts.slice(0, 3).forEach((p, i) => { LP.parts[i] = { ev: Array.isArray(p.ev) ? p.ev : [], snd: p.snd || "", mute: !!p.mute }; }); LP.beatMute = !!o.beatMute; if (o.style) LP.style = o.style; if (o.snap === false) LP.snap = false; } } catch (e) {}
      const lpSave = () => { try { localStorage.setItem("nb-box-loops", JSON.stringify({ bars: LP.bars, parts: LP.parts.map(p => ({ ev: p.ev.map(e => ({ s: e.s, m: e.m, id: e.id, mix: e.mix, d: e.d })), snd: p.snd, mute: p.mute })), beatMute: LP.beatMute, style: LP.style, snap: LP.snap })); } catch (e) {} };
      // Snap: what was just recorded lands on the nearest 16th (and lasts whole 16ths), so a loop plays back tight; you
      // hear it as you play it while recording, snapped from the first time round
      const snapPass = P => { if (!LP.snap) return; P.ev.forEach(e => { if (e.pass === LP.pass) { e.s = Math.round(e.s) % L(); e.d = Math.max(1, Math.round(e.d || 1)); } }); };
      const L = () => LP.bars * 16;
      const sd = () => rcStepDur();
      const posAt = t => RC.step - (RC.nextT - t) / sd();
      const timeAt = p => RC.nextT - (RC.step - p) * sd();
      // every synth voice made while a Keys part records is written down (layers and the arp included)
      { const mv0 = makeVoice; makeVoice = function (midi, id, mix, when) {
          const v = mv0.apply(this, arguments);
          if (LP.rec >= 0 && !LP.inPlay && v && ctx && RC.playing) {
            const t = when ?? ctx.currentTime, p = posAt(t), rel = p - LP.recStart;
            if (rel >= -0.5 && rel < L()) {
              const ev = { s: Math.max(0, rel) % L(), m: midi, id, mix, d: 0, pass: LP.pass, open: t };
              LP.parts[LP.rec].ev.push(ev);
              const st0 = v.stop; v.stop = function (at) { if (ev.open != null) { const te = at ?? ctx.currentTime; ev.d = Math.max(0.25, (te - ev.open) / sd()); ev.open = null; } return st0.apply(this, arguments); };
            }
          }
          return v;
        }; }
      // the beat can sit out while the loops keep its clock
      { const h0 = rcHit; rcHit = function () { if (LP.beatMute && RC.playing && !LP.audition) return; return h0.apply(this, arguments); }; }
      function lpTick() {
        if (!ctx || !RC.playing) { LP.sched = null; return; }
        const now = ctx.currentTime;
        // a recording ends after one loop
        if (LP.rec >= 0 && posAt(now) >= LP.recStart + L()) {
          const P = LP.parts[LP.rec]; P.ev.forEach(e => { if (e.open != null) { e.d = Math.max(0.25, LP.recStart + L() - (LP.recStart + e.s)); e.open = null; } }); snapPass(P); P.ev.forEach(e => { delete e.pass; });
          mlHud("Keys " + (LP.rec + 1), "recorded · it plays back now", null); LP.rec = -1; lpSave(); paint();
        }
        const from = LP.sched == null ? posAt(now) : LP.sched, to = posAt(now + NB_LA);
        if (to <= from) return;
        LP.parts.forEach((P, pi) => {
          if (P.mute || !P.ev.length) return;
          P.ev.forEach(e => {
            if (LP.rec === pi && e.pass === LP.pass) return;   // (being played live right now)
            if (e.s >= L()) return;
            let abs = Math.ceil((from - e.s) / L()) * L() + e.s;
            for (; abs < to; abs += L()) {
              const when = Math.max(now, timeAt(abs));
              LP.inPlay = true;
              try { const v = makeVoice(e.m, e.id, e.mix, when); if (v) v.stop(when + Math.max(0.25, Math.min(L(), e.d || 1)) * sd()); } catch (x) {}
              LP.inPlay = false;
            }
          });
        });
        LP.sched = to;
      }
      setInterval(lpTick, 20);
      // ---------- the transport and the parts ----------
      const hasPads = () => { try { return BPS.ev.length > 0; } catch (e) { return false; } };
      function go(on) {
        start(); if (!ctx) return;
        if (on) { rcPlay(true); if (hasPads()) setTimeout(() => { try { bpTransport(true); } catch (e) {} }, 30); }
        else { if (LP.rec >= 0) { LP.rec = -1; } rcPlay(false); try { bpTransport(false); } catch (e) {} try { rcHush(); } catch (e) {} }
        paint();
      }
      function recKeys(i) {
        start(); if (!ctx) return;
        if (LP.rec === i) { LP.rec = -1; LP.parts[i].ev.forEach(e => { if (e.open != null) { e.d = 1; e.open = null; } }); snapPass(LP.parts[i]); LP.parts[i].ev.forEach(e => { delete e.pass; }); lpSave(); paint(); return; }
        if (!RC.playing) go(true);
        LP.pass++; LP.rec = i;
        const p = posAt(ctx.currentTime + 0.05); LP.recStart = Math.ceil(p / 16) * 16; if (LP.recStart - p < 1) LP.recStart += 16;
        let names = []; try { names = window.__stk.keys(); } catch (e) {}
        if (!LP.parts[i].ev.length) LP.parts[i].snd = names.join(" + ") || ($id("lvSnd") && $id("lvSnd").querySelector("b") ? $id("lvSnd").querySelector("b").textContent : "");
        mlHud("Keys " + (i + 1), "recording from the next bar · " + LP.bars + (LP.bars === 1 ? " bar" : " bars"), null);
        paint();
      }
      // Pads only: the beat steps out (its clock keeps going, so everything stays in time) and Beat Pads' click counts
      // while you record; Beat + pads brings the pattern back
      LP.clickWas = null;
      function padsOnly(on) {
        LP.beatMute = on; lpSave();
        mlHud(on ? "Pads only" : "Beat + pads", on ? "just your pads · a click keeps time while you record" : "the beat plays with your pads", null);
        paint();
      }
      function clickSync() {   // (the click only while recording pads alone)
        let rec = false; try { rec = BP.rec || BP.armed; } catch (e) { return; }
        const want = rec && LP.beatMute;
        if (want && LP.clickWas == null) { LP.clickWas = !!BPS.click; BPS.click = true; }
        else if (!want && LP.clickWas != null) { BPS.click = LP.clickWas; LP.clickWas = null; }
      }
      setInterval(clickSync, 100);
      function recPads() {
        start(); if (!ctx) return;
        try { BPS.bars = LP.bars; BPS.seqs[BPS.cur].bars = LP.bars; } catch (e) {}
        if (!RC.playing) go(true);
        try { bpStartRec(); } catch (e) {}
        paint();
      }
      function clearPart(k) {
        if (k === "pads") { try { BPS.ev.splice(0); bpSave(); bpPaintGrid(); } catch (e) {} }
        else { if (LP.rec === k) LP.rec = -1; LP.parts[k].ev = []; LP.parts[k].snd = ""; lpSave(); }
        paint();
      }
      function setStyle(d) {
        const ks = Object.keys(RC_STYLES); let i = ks.indexOf(LP.style); i = ((i < 0 ? 0 : i) + d + ks.length) % ks.length;
        LP.style = ks[i]; newBeat(); lpSave();
      }
      function newBeat() { try { rcMakeBeat(LP.style, RCP.busy ?? 0.5, RCP.cplx ?? 0.3); } catch (e) {} paint(); }
      // ---------- the Track screen ----------
      function build(pv) {
        if ($id("tbTrack")) return;
        const body = pv.querySelector(".pl-body"); if (!body) return;
        const sec = document.createElement("section"); sec.className = "tb-track"; sec.id = "tbTrack";
        sec.innerHTML = `<div class="tk-beat">
            <button type="button" class="tk-arrow" id="tkPrev" aria-label="Previous style">‹</button>
            <div class="tk-style"><small>Beat</small><b id="tkStyle"></b><small id="tkBpm"></small></div>
            <button type="button" class="tk-arrow" id="tkNext" aria-label="Next style">›</button>
            <button type="button" class="tk-btn" id="tkNew">New</button><button type="button" class="tk-btn" id="tkVary">Vary</button>
            <button type="button" class="tk-btn tk-two" id="tkBars" title="How long a loop is"><small>loop</small><b></b></button>
            <button type="button" class="tk-btn tk-two" id="tkSnap" title="Snap: recorded notes land on the beat (16ths)"><small>snap</small><b></b></button>
            <button type="button" class="tk-btn tk-two" id="tkBeatOn" title="The beat on or off (the loops keep its time)"><small>beat</small><b></b></button>
            <button type="button" class="tk-btn tk-go" id="tkGo">▶</button></div>
          <div class="tk-parts">
            <div class="tk-row" data-k="pads"><span class="tk-name"><b>Pads</b><small id="tkPadsSub"></small></span><span class="tk-sp"></span><button type="button" class="tk-btn tk-two tk-wide" data-a="only" id="tkPadsOnly" title="Record and play your pads with the beat, or your pads alone (a click keeps time)"><small>pads</small><b></b></button><button type="button" class="tk-btn tk-rec" data-a="rec">● Rec</button><button type="button" class="tk-btn" data-a="clear">Clear</button></div>
            ${[0, 1, 2].map(i => `<div class="tk-row" data-k="${i}"><span class="tk-name"><b>Keys ${i + 1}</b><small id="tkSub${i}"></small></span><span class="tk-sp"></span><button type="button" class="tk-btn tk-mute" data-a="mute">On</button><button type="button" class="tk-btn tk-rec" data-a="rec">● Rec</button><button type="button" class="tk-btn" data-a="clear">Clear</button></div>`).join("")}
          </div>`;
        body.appendChild(sec);
        $id("tkPrev").addEventListener("click", () => setStyle(-1)); $id("tkNext").addEventListener("click", () => setStyle(1));
        $id("tkNew").addEventListener("click", newBeat);
        $id("tkVary").addEventListener("click", () => { try { rcVary(); rcSave(); rcRender(); } catch (e) {} mlHud("Beat", "a variation", null); });
        $id("tkGo").addEventListener("click", () => go(!RC.playing));
        sec.querySelectorAll(".tk-row").forEach(r => r.addEventListener("click", e => {
          const b = e.target.closest("button[data-a]"); if (!b) return; const k = r.dataset.k, a = b.dataset.a;
          if (k === "pads") { if (a === "rec") recPads(); else if (a === "only") padsOnly(!LP.beatMute); else clearPart("pads"); }
          else { const i = +k; if (a === "rec") recKeys(i); else if (a === "clear") clearPart(i); else { LP.parts[i].mute = !LP.parts[i].mute; lpSave(); } }
          paint();
        }));
        $id("tkBars").addEventListener("click", () => { LP.bars = { 1: 2, 2: 4, 4: 1 }[LP.bars] || 2; lpSave(); paint(); mlHud("Loop", LP.bars + (LP.bars === 1 ? " bar" : " bars") + " · for the next recording", null); });
        $id("tkBeatOn").addEventListener("click", () => { LP.beatMute = !LP.beatMute; lpSave(); paint(); });
        $id("tkSnap").addEventListener("click", () => { LP.snap = !LP.snap; lpSave(); paint(); mlHud("Snap " + (LP.snap ? "on" : "off"), LP.snap ? "recorded notes land on the beat" : "recorded as you play them", null); });
      }
      function paint() {
        const sec = $id("tbTrack"); if (!sec) return;
        nbT($id("tkStyle"), LP.style); nbT($id("tkBpm"), Math.round(rcBpm()) + " bpm");
        nbT($id("tkGo"), RC.playing ? "■" : "▶"); $id("tkGo").classList.toggle("on", RC.playing);
        nbT($id("tkSnap").querySelector("b"), LP.snap ? "On" : "Off"); $id("tkSnap").classList.toggle("off", !LP.snap);
        nbT($id("tkBeatOn").querySelector("b"), LP.beatMute ? "Off" : "On"); $id("tkBeatOn").classList.toggle("off", LP.beatMute);
        let padsRec = false, padsN = 0; try { padsRec = BP.rec || BP.armed; padsN = BPS.ev.length; } catch (e) {}
        nbT($id("tkPadsSub"), padsRec ? "recording: play the pads · " + padsN + " hits" : padsN ? padsN + " hits" + (LP.beatMute ? " · pads only" : "") : "your finger drums");
        nbT($id("tkPadsOnly").querySelector("b"), LP.beatMute ? "Only" : "+ Beat"); $id("tkPadsOnly").classList.toggle("on", LP.beatMute);
        sec.querySelector('[data-k="pads"] .tk-rec').classList.toggle("on", padsRec);
        LP.parts.forEach((P, i) => {
          const row = sec.querySelector('[data-k="' + i + '"]'), rec = LP.rec === i;
          let sub = P.ev.length ? (P.snd || "a loop") + " · " + P.ev.length + " notes" : "empty: ● Rec, then play the keys";
          if (rec && ctx) { const left = LP.recStart - posAt(ctx.currentTime); sub = left > 0 ? "get ready… " + Math.ceil(left / 4) : "recording: play the keys"; }
          nbT($id("tkSub" + i), sub);
          row.querySelector(".tk-rec").classList.toggle("on", rec);
          const m = row.querySelector(".tk-mute"); nbT(m, P.mute ? "Off" : "On"); m.classList.toggle("off", P.mute); m.hidden = !P.ev.length;
        });
        nbT($id("tkBars").querySelector("b"), LP.bars + (LP.bars === 1 ? " bar" : " bars"));
      }
      setInterval(() => { const pv = $id("playView"); if (pv && document.documentElement.classList.contains("nb-tabs")) { build(pv); if (pv.classList.contains("tab-track")) paint(); } }, 250);
      window.__boxTrack = { LP, go, recKeys, recPads, clearPart, newBeat, setStyle, paint };
    }
  }
//@end
