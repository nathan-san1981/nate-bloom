  // ======================================================================
  // UI / UX round: now playing, Back, undo, phone layout, Rhythm Creator touch, Play view, haptics
  // ======================================================================
  // ---------- a tap of vibration on steps and pads (Android; iPhone browsers can't) ----------
  let HAPTIC = true; try { HAPTIC = localStorage.getItem("nightbloom-haptic") !== "0"; } catch (e) {}
  const buzz = ms => { if (!HAPTIC || !navigator.vibrate) return; try { navigator.vibrate(ms || 8); } catch (e) {} };
  document.addEventListener("pointerdown", e => { if (e.pointerType === "touch" && e.target.closest && e.target.closest(".cell, .rc-c, .pad, .kpad, .dj-pad")) buzz(8); }, { capture: true, passive: true });
  {
    const hb = document.getElementById("hapticBtn"), paint = () => { hb.setAttribute("aria-pressed", String(HAPTIC)); hb.textContent = "Vibrate on taps: " + (HAPTIC ? "On" : "Off"); };
    if (!navigator.vibrate) hb.hidden = true;
    hb.addEventListener("click", () => { HAPTIC = !HAPTIC; try { localStorage.setItem("nightbloom-haptic", HAPTIC ? "1" : "0"); } catch (e) {} paint(); buzz(20); });
    paint();
  }

  // ---------- isolate: every source passes a gate into the mix; isolating one closes the others' ----------
  let SOLO = null, SOLO_CUR = null;
  const soloSets = new Map();   // group -> Set of gates
  const soloLevel = g => (SOLO == null || g === SOLO ? 1 : 0);
  function setSolo(g) {
    SOLO = g || null;
    if (!ctx) return;
    const t = ctx.currentTime;
    soloSets.forEach((set, grp) => set.forEach(n => { try { n.gain.setTargetAtTime(soloLevel(grp), t, 0.015); } catch (e) {} }));
  }
  {
    const c0 = AudioNode.prototype.connect, d0 = AudioNode.prototype.disconnect, gates = new Map();
    const gateFor = (grp, dest) => {
      let m = gates.get(grp); if (!m) { m = new WeakMap(); gates.set(grp, m); }
      let g = m.get(dest);
      if (!g) { g = dest.context.createGain(); g.__solo = true; g.gain.value = soloLevel(grp); c0.call(g, dest); m.set(dest, g);
        let set = soloSets.get(grp); if (!set) { set = new Set(); soloSets.set(grp, set); } set.add(g); }
      return g;
    };
    AudioNode.prototype.connect = function (dest, out) {
      if (dest instanceof AudioNode && !this.__solo) {
        let grp = this.__soloGroup;
        if (!grp && SOLO_CUR && (dest === fx.input || dest === fx.drumBus)) grp = SOLO_CUR;
        if (grp && grp !== "pass") {
          const g = gateFor(grp, dest);
          (this.__soloLinks || (this.__soloLinks = new Map())).set(dest, g);
          c0.call(this, g, out || 0); return dest;
        }
      }
      return c0.apply(this, arguments);
    };
    AudioNode.prototype.disconnect = function (dest) {
      if (dest instanceof AudioNode && this.__soloLinks && this.__soloLinks.has(dest)) {
        const g = this.__soloLinks.get(dest); this.__soloLinks.delete(dest);
        const a = [...arguments]; a[0] = g; if (a.length > 2) a.length = 2; return d0.apply(this, a);
      }
      if (!arguments.length && this.__soloLinks) this.__soloLinks.clear();
      return d0.apply(this, arguments);
    };
    // sounds scheduled by each player belong to it
    const tagged = (fn, grp) => function () { const was = SOLO_CUR; SOLO_CUR = grp; try { return fn.apply(this, arguments); } finally { SOLO_CUR = was; } };
    scheduleStep = tagged(scheduleStep, "seq");
    toggleHeld = tagged(toggleHeld, "held");
    kitPadDown = tagged(kitPadDown, "pads");
    jamBandStep = tagged(jamBandStep, "band");
    jamTrackStep = tagged(jamTrackStep, "loops");
    rcScheduleStep = tagged(rcScheduleStep, "rc");
    window.__nbSoloDbg = () => ({ solo: SOLO, gates: [...soloSets].map(([g, set]) => [g, [...set].map(n => +n.gain.value.toFixed(2))]) });
  }

  // ---------- arp parts: an arp keeps its synth when you pick another one ----------
  const PARTS = []; let partN = 0, partsTimer = 0;
  const NOTE_N = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const nbNoteName = m => NOTE_N[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const nbEngName = e => (ENGINES[e] && ENGINES[e].name) || ({ lib: "Library sound", inst: "Instrument", samp: "Sampler" })[e] || "Synth";
  const arpDesc = (key, notes) => { const c = getArp(key); return (ARP_MODES.find(m => m[0] === c.mode) || ["", c.mode])[1] + " · " + c.rate + (c.oct > 1 ? " · " + c.oct + " oct" : "") + (notes.length ? " · " + notes.slice().sort((a, b) => a - b).map(nbNoteName).join(" ") : ""); };
  function partComps(p) {
    if (ENGINES[p.eng]) { const norm = 1 / Math.sqrt(Math.max(1, p.layers.length)); return p.layers.filter(id => arpOn(id)).map(id => ({ key: id, accepts: () => true, make: (m, when, scale = 1) => makeVoice(m, id, state.layers[id].level * 1.25 * norm * scale, when) })); }
    return voiceComponents(p.eng).filter(c => arpOn(c.key));
  }
  function partsTick() {
    if (!ctx || !PARTS.length) return;
    const now = ctx.currentTime;
    for (const p of PARTS.slice()) {
      const comps = partComps(p);
      if (!comps.length) { dropPart(p, true); continue; }
      const was = SOLO_CUR; SOLO_CUR = p.id;
      try {
        for (const c of comps) {
          const cfg = getArp(c.key), notesS = p.notes.slice().sort((a, b) => a - b).filter(c.accepts), notesP = p.notes.filter(c.accepts);
          if (!notesS.length) continue;
          const dur = 60 / state.seq.bpm * (ARP_RATES.find(r => r[0] === cfg.rate) || ARP_RATES[3])[1];
          let run = p.run[c.key]; if (!run) run = p.run[c.key] = { step: 0, next: now + 0.02 };
          if (run.next < now - 0.05) { const k = Math.ceil((now - run.next) / dur); run.next += k * dur; run.step += k; }
          while (run.next < now + 0.1) {
            const t = run.next, len = Math.max(0.03, dur * cfg.gate);
            let hits;
            if (cfg.mode === "chord") hits = notesS.map(n => n + 12 * (run.step % cfg.oct));
            else if (cfg.mode === "random") { const sq = arpSequence(cfg, notesS); hits = [sq[Math.floor(Math.random() * sq.length)]]; }
            else { const sq = arpSequence(cfg, cfg.mode === "played" ? notesP : notesS); hits = [sq[run.step % sq.length]]; }
            const scale = 1 / Math.sqrt(hits.length);
            for (const m of hits) { const v = c.make(m, t, scale); if (v) v.stop(t + len); }
            run.step++; run.next += dur;
          }
        }
      } finally { SOLO_CUR = was; }
    }
  }
  const partsClock = () => { if (PARTS.length && !partsTimer) partsTimer = setInterval(partsTick, 25); if (!PARTS.length && partsTimer) { clearInterval(partsTimer); partsTimer = 0; } };
  function dropPart(p, stopSound) {
    const i = PARTS.indexOf(p); if (i < 0) return; PARTS.splice(i, 1);
    if (stopSound) p.held.forEach(v => { try { v.stop(); } catch (e) {} });
    if (SOLO === p.id) setSolo(null);
    partsClock();
  }
  let lastEng = state.engine, lastLayers = [];
  let nbKeepHeld = 0;   // (170) while a sound is added to what plays, the held notes stay put: nothing is handed to an arp part
  function detachArp(eng) {
    if (eng === "drum" || eng === "pads" || (!heldVoices.size && !voices.size)) return;
    const keys = (ENGINES[eng] ? lastLayers : voiceComponents(eng).map(c => c.key)).filter(k => arpOn(k));
    if (!keys.length) return;
    const notes = []; [heldVoices, voices].forEach(M => M.forEach(v => v.tones.forEach(m => { if (!notes.includes(m)) notes.push(m); })));
    const run = {}; keys.forEach(k => { if (arpRun[k]) run[k] = Object.assign({}, arpRun[k]); delete arpRun[k]; });
    const p = { id: "part" + (++partN), eng, layers: ENGINES[eng] ? lastLayers.slice() : [], notes, roots: [...new Set([...heldVoices.keys(), ...voices.keys()])], run, held: [...heldVoices.values()] };
    // the held notes go with it (anything of theirs that sounds without the arp keeps sounding with it)
    heldVoices.forEach(v => markTones(v.tones, markHeld, false)); heldVoices.clear(); updateHoldBtn();
    PARTS.push(p); partsClock();
    try { noteMsg(nbEngName(eng) + " arp keeps playing · Playing ▾ to edit or stop it"); } catch (e) {}
  }
  { const re = renderEngine; renderEngine = function () {
      if (state.engine !== lastEng) { const from = lastEng; lastEng = state.engine; if (!nbKeepHeld) try { detachArp(from); } catch (e) {} }
      const r = re.apply(this, arguments);
      if (ENGINES[state.engine]) lastLayers = activeLayers().slice();
      return r;
    }; }
  if (ENGINES[state.engine]) lastLayers = activeLayers().slice();
  const nbCloseLayers = () => {
    [["djView", "djDone"], ["rcView", "rcDone"], ["bpView", "bpDone"], ["tracks", "trkDone"]].forEach(([v, d]) => { const el = document.getElementById(v), b = document.getElementById(d); if (el && !el.hidden && b) b.click(); });
    document.querySelectorAll(".editor:not([hidden]) .ed-foot .btn.primary").forEach(b => { if (/Done|Close/.test(b.textContent)) b.click(); });
  };
  function editPart(p) {
    start(); nbCloseLayers();
    dropPart(p, false);
    p.held.forEach(v => { try { v.stop(); } catch (e) {} });   // its notes are held again below, with the same sound
    if (ENGINES[p.eng]) { for (const x in state.layers) state.layers[x].on = p.layers.includes(x); }
    state.engine = p.eng;
    if (state.mode !== "keys") document.getElementById("modeKeys").click();
    renderEngine(); save();
    for (const k in p.run) arpRun[k] = p.run[k];   // the arp carries on in time
    if (!state.hold) { state.hold = true; }
    p.roots.forEach(m => { if (!heldVoices.has(m)) toggleHeld(m); });
    updateHoldBtn();
    setPanel("arp");
    try { noteMsg("Editing " + nbEngName(p.eng) + " arp: tap keys to add or take away notes"); } catch (e) {}
  }
  // the Playing list: what each thing is doing, and where Edit takes you
  function enrichSources(s) {
    const open = id => { const b = document.getElementById(id); if (b) b.click(); };
    const seqHere = () => { nbCloseLayers(); if (state.mode !== "seq") open("modeSeq"); };
    const keysHere = () => { nbCloseLayers(); if (state.mode !== "keys") open("modeKeys"); };
    for (const x of s) {
      const id = x[0];
      if (id === "seq") { x[3] = state.seq.bpm + " bpm"; x[4] = seqHere; }
      else if (id === "rc") { x[3] = Math.round(rcBpm()) + " bpm"; x[4] = () => { if (document.getElementById("rcView").hidden) { nbCloseLayers(); open("rcBtn"); } }; }
      else if (/^dj/.test(id)) { const d = /^dj\d$/.test(id) ? DJ.decks[+id.slice(2)] : null; x[3] = d && d.name ? d.name : ""; if (d && DJ.mash) x[1] += DJ.mash.top === d ? " · mashup, on top" : DJ.mash.bed === d ? " · mashup, underneath" : ""; x[4] = () => { if (document.getElementById("djView").hidden) { nbCloseLayers(); open("djBtn"); } }; }
      else if (id === "band" || id === "loops") { x[4] = () => { keysHere(); open("pJam"); }; }
      else if (id === "trk") { x[4] = () => { if (document.getElementById("tracks").hidden) { nbCloseLayers(); open("betaTracksBtn"); } }; }
      else if (id === "pads") { x[4] = () => { keysHere(); open("mSamples"); const t = document.querySelector('#tabs .tab[data-engine="pads"]'); if (t && state.engine !== "pads") t.click(); }; }
      else if (id === "held") {
        const notes = []; [heldVoices, voices].forEach(M => M.forEach(v => v.tones.forEach(m => { if (!notes.includes(m)) notes.push(m); })));
        const arpKey = voiceComponents().map(c => c.key).find(k => arpOn(k));
        if (arpKey) { x[1] = nbEngName(state.engine) + " arp"; x[3] = arpDesc(arpKey, notes); x[4] = () => { keysHere(); setPanel("arp"); }; }
        else { x[3] = notes.slice().sort((a, b) => a - b).map(nbNoteName).join(" "); x[4] = keysHere; }
      }
    }
    PARTS.forEach(p => { const k = p.layers.find(id => arpOn(id)) || (voiceComponents(p.eng)[0] || {}).key; s.push([p.id, nbEngName(p.eng) + " arp", () => dropPart(p, true), k ? arpDesc(k, p.notes) : "", () => editPart(p)]); });
    return s;
  }
  document.getElementById("panic").addEventListener("click", () => { PARTS.slice().forEach(p => dropPart(p, true)); });

  let nbStopSources = () => {};
  // ---------- Now playing ----------
  {
    const bars = [...document.querySelectorAll(".nowbar")], trkPlayBtn = document.getElementById("trkPlay");
    const stopPads = () => padPlaying.forEach((p, k) => { if (!p) return; try { const t = ctx.currentTime; p.g.gain.cancelScheduledValues(t); p.g.gain.setTargetAtTime(0, t, 0.01); p.src.stop(t + 0.06); } catch (e) {} padPlaying[k] = null; });
    const sources = () => {
      const s = [];
      if (playing) s.push(["seq", "Sequencer", () => stopSeq()]);
      if (RC.playing) s.push(["rc", "Rhythm Creator", () => rcPlay(false)]);
      if (bpIsPlaying()) s.push(["bp", "Beat Pads", () => { bpTransport(false); bpHush(); }]);
      DJ.decks.forEach(d => { if (d.playing) s.push(["dj" + d.i, "DJ deck " + "AB"[d.i], () => { djPlay(d, false); djPaintAll(); }]); });
      if (DJ.padPlay && DJ.padPlay.some(Boolean)) s.push(["djpad", "DJ pads", () => DJ.padPlay.forEach((p, k) => djPadStop(k))]);
      if (DJ.beat) s.push(["djbeat", "DJ beat", () => djBeatStop()]);
      if (JAM.band.on) s.push(["band", "Jam band", () => jamBandOn(false)]);
      if (JAM.rec || JAM.tracks.some(t => t.on && t.len > 0)) s.push(["loops", "Jam loops", () => jamLoopsOff()]);
      if (trkPlayBtn && trkPlayBtn.getAttribute("aria-pressed") === "true") s.push(["trk", "Tracks", () => trkPlayBtn.click()]);
      if (heldVoices.size) s.push(["held", "Held notes · " + heldVoices.size, () => { releaseHeld(); updateHoldBtn(); }]);
      if (padPlaying.some(Boolean)) s.push(["pads", "Pads", stopPads]);
      return enrichSources(s);
    };
    let sig = "", cur = [], popFor = null;
    // the Android app keeps running in the background only while something is sounding
    if (window.NB_NATIVE && window.NB_NATIVE.setPlaying) { let was = null; setInterval(() => { let on = false; try { on = sources().length > 0; } catch (e) {} if (on !== was) { was = on; window.NB_NATIVE.setPlaying(on); } }, 700); }
    nbStopSources = () => { sources().forEach(x => { try { x[2](); } catch (er) {} }); stopPads(); };
    const pop = document.createElement("div"); pop.className = "now-pop"; pop.id = "nowPop"; pop.hidden = true;
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "What's playing");
    document.body.appendChild(pop);
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    function placePop() {
      if (!popFor || pop.hidden) return;
      const r = popFor.getBoundingClientRect(), w = Math.min(innerWidth - 16, 760);
      pop.style.width = w + "px"; pop.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8))) + "px";
      pop.style.top = Math.round(r.bottom + 6) + "px"; pop.style.maxHeight = Math.max(160, innerHeight - r.bottom - 20) + "px";
    }
    function paintNowPop() {
      if (pop.hidden) return;
      const card = ([id, name, , detail]) => {
        const st = SOLO === id ? " solo" : SOLO ? " muted" : "";
        return `<div class="np-card${st}" data-edit="${id}" title="Edit"><div class="np-name"><i></i><b>${esc(name)}</b>${SOLO === id ? "<em>only this</em>" : SOLO ? "<em>muted</em>" : ""}</div>`
          + (detail ? `<small>${esc(detail)}</small>` : "")
          + `<div class="np-btns"><button class="btn np-only" data-solo="${id}" aria-pressed="${SOLO === id}" title="Hear only this one; the rest keep going, silent">${SOLO === id ? "Hear all" : "Only this"}</button><button class="btn" data-edit="${id}">Edit</button><button class="btn np-stop" data-now="${id}">■ Stop</button></div></div>`;
      };
      pop.innerHTML = '<div class="np-head"><b>Playing</b><span>tap one to edit it</span></div><div class="np-cards">' + cur.map(card).join("") + '</div><div class="np-foot">'
        + (SOLO ? '<button class="btn now-hear" data-hearall="1">Hear all</button>' : "") + (cur.length > 1 ? '<button class="btn now-all" data-now="all">■ Stop all</button>' : "")
        + '<button class="btn" data-close="1">Close</button></div>';
      placePop();
    }
    function paintNow() {
      cur = sources();
      if (SOLO && !cur.some(x => x[0] === SOLO)) setSolo(null);   // the isolated one stopped: everything comes back
      if (!cur.length && !pop.hidden) { pop.hidden = true; popFor = null; }
      const k = cur.map(x => x[0] + x[1] + (x[3] || "")).join("|") + "#" + SOLO + "#" + pop.hidden; if (k === sig) return; sig = k;
      const h = cur.length ? `<span class="now-lab">Playing</span><button class="btn now-open" aria-haspopup="dialog" aria-expanded="${!pop.hidden}" title="What's playing: edit one, hear only one, or stop"><i></i><span class="now-names">${esc(cur.map(x => x[1]).join(" · "))}</span>${cur.length > 1 ? `<span class="now-n">${cur.length}</span>` : ""}<b>▾</b></button>`
        + (SOLO ? '<button class="btn now-hear" data-hearall="1">Hear all</button>' : "") + (cur.length > 1 ? '<button class="btn now-all" data-now="all">Stop all</button>' : "") : "";
      bars.forEach(b => { b.hidden = !cur.length; b.innerHTML = h; });
      paintNowPop();
    }
    const act = e => {
      const t = e.target.closest && e.target.closest("button, .np-card"); if (!t) return;
      const redo = () => { sig = null; paintNow(); };
      if (t.classList.contains("now-open")) { if (pop.hidden) { popFor = t.closest(".nowbar"); pop.hidden = false; } else { pop.hidden = true; popFor = null; } return redo(); }
      if (t.dataset.close) { pop.hidden = true; popFor = null; return redo(); }
      if (t.dataset.hearall) { setSolo(null); return redo(); }
      if (t.dataset.solo) { start(); setSolo(SOLO === t.dataset.solo ? null : t.dataset.solo); return redo(); }
      if (t.dataset.now) {
        if (t.dataset.now === "all") { setSolo(null); document.getElementById("stopAll").click(); }
        else { const x = cur.find(c => c[0] === t.dataset.now); if (x) { try { x[2](); } catch (er) {} } }
        sig = null; setTimeout(paintNow, 80); return;
      }
      if (t.dataset.edit) {
        const x = cur.find(c => c[0] === t.dataset.edit); pop.hidden = true; popFor = null;
        if (x && x[4]) { try { x[4](); } catch (er) {} }
        sig = null; setTimeout(paintNow, 80);
      }
    };
    bars.forEach(b => b.addEventListener("click", act)); pop.addEventListener("click", act);
    document.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target) && !(e.target.closest && e.target.closest(".now-open"))) { pop.hidden = true; popFor = null; sig = null; paintNow(); } }, true);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { pop.hidden = true; popFor = null; sig = null; paintNow(); } }, true);
    addEventListener("resize", placePop);
    setInterval(() => { if (!document.hidden) paintNow(); }, 400);
  }

  // ---------- Back closes what's on top (Android's back gesture, the browser's Back, Escape) ----------
  {
    const isLayer = el => el.matches && el.matches(".editor, .dj, .trk, .browser, .rc-pop, .lv-fxp, .lv-pick, .lv-jamp");
    const stack = []; let ignorePop = 0;
    const closeBtnOf = el => [...el.querySelectorAll("button")].find(b => /(Done|Cancel|Close)$/.test(b.id) && !b.closest("[hidden]"))
      || [...el.querySelectorAll("button")].find(b => /^(Done|Cancel|Close|Back)$/i.test(b.textContent.trim()) && !b.closest("[hidden]"));
    const closeLayer = el => { const b = closeBtnOf(el); if (b) b.click(); else el.hidden = true; };
    // Every open sheet, overlay and pop-up has one history entry above the page's own, so Back closes
    // what's on top. sync() keeps the entries in step with the open layers, one traversal at a time:
    // history.back() lands later, and a pushState made before it lands is thrown away by it. Doing both
    // at once (a pop-up closing as another opens) used to leave fewer entries than layers, until a later
    // close stepped back past the page itself: out of the app, or closing the installed app.
    let depth = 0, travelGen = 0, backClosing = 0;   // depth: our entries above the page's, where we are
    if (history.state && history.state.nbLayer) { try { history.replaceState(null, ""); } catch (e) {} }   // reloaded with a sheet open
    const sync = () => {
      for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].isConnected || stack[i].hidden) stack.splice(i, 1);
      if (ignorePop || backClosing) return;            // a traversal or a Back-close is under way: finish after it
      while (depth < stack.length) { try { history.pushState({ nbLayer: depth + 1 }, ""); depth++; } catch (e) { break; } }
      if (depth > stack.length) {
        const n = depth - stack.length, gen = ++travelGen;
        ignorePop++; depth -= n;
        try { history.go(-n); } catch (e) { ignorePop--; depth += n; return; }
        // a traversal that never reports back must not freeze the bookkeeping
        setTimeout(() => { if (gen === travelGen && ignorePop) { ignorePop = 0; sync(); } }, 1500);
      }
    };
    new MutationObserver(recs => {
      recs.forEach(r => {
        const el = r.target; if (!isLayer(el)) return;
        if (!el.hidden && !stack.includes(el)) stack.push(el);
        else if (el.hidden && stack.includes(el)) stack.splice(stack.indexOf(el), 1);
      });
      sync();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    window.addEventListener("popstate", e => {
      if (ignorePop) { ignorePop--; travelGen++; sync(); return; }
      const at = e.state && typeof e.state.nbLayer === "number" ? e.state.nbLayer : 0;
      if (at > depth) { ignorePop++; try { history.go(depth - at); } catch (er) { ignorePop--; } return; }   // Forward into an old entry
      // the user's Back: the browser has already left our top entry
      depth = at;
      const el = stack[stack.length - 1];
      if (!el) { sync(); return; }
      backClosing++; closeLayer(el);
      // a moment for the layer to close (some animate); one that refused gets its entry back
      setTimeout(() => { backClosing--; sync(); }, 60);
    });
    window.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !stack.length) return;
      const t = e.target; if (t && t.closest && t.closest("input, textarea, select")) return;
      e.preventDefault(); e.stopImmediatePropagation(); closeLayer(stack[stack.length - 1]);
    }, true);
    window.__nbLayers = () => stack.map(e => e.id || e.className);
  }

  // ---------- undo: a toast after big changes, and an Undo button ----------
  let undoToast = (() => {
    const el = document.createElement("div"); el.className = "undotoast"; el.hidden = true; el.setAttribute("role", "status");
    el.innerHTML = '<span></span><button class="btn">Undo</button>'; document.body.appendChild(el);
    let fn = null, t = 0;
    el.querySelector("button").addEventListener("click", () => { const f = fn; fn = null; el.hidden = true; clearTimeout(t); if (f) f(); });
    return (msg, undo) => { fn = undo; el.querySelector("span").textContent = msg; el.hidden = false; clearTimeout(t); t = setTimeout(() => { el.hidden = true; fn = null; }, 8000); };
  })();
  // Rhythm Creator: every change to the pattern can be undone (20 steps back)
  const rcUndo = [];
  const rcSnapP = () => JSON.stringify({ tracks: RCP.tracks, steps: RCP.steps, swing: RCP.swing, bpm: state.seq.bpm });
  const rcUndoBtn = document.getElementById("rcUndo");
  const rcPaintUndo = () => { rcUndoBtn.disabled = !rcUndo.length; rcUndoBtn.textContent = "↶"; };
  function rcPushUndo() { const s = rcSnapP(); if (rcUndo[rcUndo.length - 1] === s) return; rcUndo.push(s); if (rcUndo.length > 20) rcUndo.shift(); rcPaintUndo(); }
  function rcDoUndo() {
    const s = rcUndo.pop(); if (!s) return; const o = JSON.parse(s);
    RCP.tracks = o.tracks; RCP.steps = o.steps; RCP.swing = o.swing; if (o.bpm && o.bpm !== state.seq.bpm) setBpm(o.bpm);
    if (ctx) RCP.tracks.forEach((tr, i) => rcApplyTrack(i));
    rcSave(); rcRender(); rcPaintUndo(); noteMsg("Undone");
  }
  rcUndoBtn.addEventListener("click", rcDoUndo);
  { const mb = rcMakeBeat; rcMakeBeat = function () { rcPushUndo(); const r = mb.apply(this, arguments); undoToast("New " + arguments[0] + " beat", rcDoUndo); return r; }; }
  { const v0 = rcVary; rcVary = function () { rcPushUndo(); const r = v0.apply(this, arguments); undoToast("Varied the pattern", rcDoUndo); return r; }; }
  document.getElementById("rcClear").addEventListener("click", () => { rcPushUndo(); setTimeout(() => undoToast("Cleared every track", rcDoUndo), 0); }, true);
  rcEd.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.id === "rcClrT" || b.id === "rcEgo") { rcPushUndo(); if (b.id === "rcClrT") setTimeout(() => undoToast("Cleared the track", rcDoUndo), 0); } }, true);
  rcEd.addEventListener("input", e => { if (e.target.id === "rcTlen" && !rcEd.dataset.lenUndo) { rcPushUndo(); rcEd.dataset.lenUndo = "1"; setTimeout(() => { delete rcEd.dataset.lenUndo; }, 1500); } }, true);
  document.getElementById("rcLen").addEventListener("change", () => rcPushUndo(), true);
  // the sequencer: steps, Clear, Reset and beats can be undone too
  const seqUndo = [], seqUndoBtn = document.getElementById("seqUndo");
  const seqSnap = () => JSON.stringify({ seq: state.seq, swing: state.drum.swing });
  const seqPaintUndo = () => { seqUndoBtn.disabled = !seqUndo.length; };
  function seqPushUndo() { const s = seqSnap(); if (seqUndo[seqUndo.length - 1] === s) return; seqUndo.push(s); if (seqUndo.length > 20) seqUndo.shift(); seqPaintUndo(); }
  function seqDoUndo() {
    const s = seqUndo.pop(); if (!s) return; const o = JSON.parse(s);
    Object.keys(state.seq).forEach(k => { if (!(k in o.seq)) delete state.seq[k]; }); Object.assign(state.seq, o.seq);
    state.drum.swing = o.swing; setBpm(state.seq.bpm);
    if (seqBuilt) paintSeq(); save(); seqPaintUndo(); noteMsg("Undone");
  }
  seqUndoBtn.addEventListener("click", seqDoUndo);
  seqEl.addEventListener("pointerdown", e => { if (e.target.closest(".cell")) seqPushUndo(); }, true);
  document.getElementById("clear").addEventListener("click", () => { if (clearBtn.textContent === "Clear all?") { seqPushUndo(); setTimeout(() => undoToast("Cleared the pattern", seqDoUndo), 0); } }, true);
  document.getElementById("stepReset").addEventListener("click", () => { seqPushUndo(); setTimeout(() => undoToast("Reset chance and rolls", seqDoUndo), 0); }, true);
  { const ab = applyBeat; applyBeat = function (i, fromUser) { if (fromUser) seqPushUndo(); return ab.apply(this, arguments); }; }
  { const sm = setMode; setMode = function (m) { const r = sm.apply(this, arguments); seqUndoBtn.hidden = clearBtn.hidden; const pb = document.getElementById("perfBtn"); pb.hidden = m !== "keys"; if (m !== "keys" && document.body.classList.contains("perf")) perfOn(false); return r; }; }
  setTimeout(() => { seqUndoBtn.hidden = clearBtn.hidden; seqPaintUndo(); rcPaintUndo(); }, 0);

  // ---------- Rhythm Creator: drag to paint, long-press for a step's options, 8-step zoom ----------
  try { const z = localStorage.getItem("nightbloom-rczoom"); RC.zoom = z == null ? innerWidth < 500 : z === "1"; } catch (e) { RC.zoom = innerWidth < 500; }
  document.getElementById("rcZoom").addEventListener("click", () => { RC.zoom = !RC.zoom; RC.page = 0; try { localStorage.setItem("nightbloom-rczoom", RC.zoom ? "1" : "0"); } catch (e) {} rcRender(); });
  {
    const pop = document.getElementById("rcPop");
    let g = null;   // the gesture in progress
    const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest(".rc-c") : null; };
    const setCell = (c, val) => {
      const i = +c.dataset.t, st = +c.dataset.s, tr = RCP.tracks[i]; if (c.classList.contains("out")) return;
      tr.on[st] = val ? 1 : 0; if (!val) tr.acc[st] = tr.flam[st] = tr.roll[st] = tr.prob[st] = tr.nudge[st] = 0;
      c.classList.toggle("on", !!val); if (!val) { c.classList.remove("acc"); c.innerHTML = ""; }
    };
    rcGrid.addEventListener("pointerdown", e => {
      const c = e.target.closest(".rc-c"); if (!c || c.classList.contains("out") || e.button > 0) return;
      const i = +c.dataset.t, st = +c.dataset.s;
      g = { c, i, x: e.clientX, y: e.clientY, paint: false, val: !RCP.tracks[i].on[st], id: e.pointerId, lp: 0 };
      g.lp = setTimeout(() => { if (!g || g.paint) return; RC.noClick = true; openPop(i, st, c); g = null; }, 480);
    });
    rcGrid.addEventListener("pointermove", e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.paint) {
        if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
        clearTimeout(g.lp);
        if (RC.mode !== "hits" || Math.abs(dy) > Math.abs(dx)) { g = null; return; }   // a vertical drag scrolls the page
        g.paint = true; rcPushUndo(); setCell(g.c, g.val);
      }
      const c = cellAt(e.clientX, e.clientY);
      if (c && +c.dataset.t === g.i && !c.classList.contains("out") && !!RCP.tracks[g.i].on[+c.dataset.s] !== g.val) { setCell(c, g.val); buzz(5); }
    });
    const end = () => { if (!g) return; clearTimeout(g.lp); if (g.paint) { RC.noClick = true; rcSave(); rcRender(); } g = null; };
    rcGrid.addEventListener("pointerup", end); rcGrid.addEventListener("pointercancel", () => { if (g) { clearTimeout(g.lp); if (g.paint) { rcSave(); rcRender(); } g = null; } });
    rcGrid.addEventListener("contextmenu", e => { if (e.target.closest(".rc-c")) e.preventDefault(); });
    // a plain tap still toggles (the existing click handler), with an undo step first
    rcGrid.addEventListener("click", e => { if (!RC.noClick && e.target.closest(".rc-c:not(.out)")) rcPushUndo(); }, true);
    // the step's options
    let P = null;
    function paintPop() {
      if (!P) return; const tr = RCP.tracks[P.i], s = P.s, snd = rcSnd(tr.snd) || { code: "?", name: "?" };
      document.getElementById("rcPopT").textContent = snd.code + " · " + snd.name + " · step " + (s + 1);
      pop.querySelectorAll("[data-k]").forEach(b => b.setAttribute("aria-pressed", String(!!tr[b.dataset.k][s])));
      pop.querySelectorAll("[data-roll]").forEach(b => b.setAttribute("aria-pressed", String((tr.roll[s] || 0) === +b.dataset.roll || (+b.dataset.roll === 0 && (tr.roll[s] || 0) <= 1))));
      pop.querySelectorAll("[data-prob]").forEach(b => b.setAttribute("aria-pressed", String((tr.prob[s] || 0) === +b.dataset.prob)));
      pop.querySelectorAll("[data-nudge]").forEach(b => b.setAttribute("aria-pressed", String((tr.nudge[s] || 0) === +b.dataset.nudge)));
    }
    function openPop(i, s, c) {
      P = { i, s }; RC.sel = i; buzz(15);
      pop.hidden = false; paintPop();
      const r = c.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      let top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
      pop.style.top = top + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
      rcGrid.querySelectorAll(".rc-c.lp").forEach(x => x.classList.remove("lp")); c.classList.add("lp");
    }
    pop.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b || !P) return;
      const tr = RCP.tracks[P.i], s = P.s;
      if (b.id === "rcPopX") { pop.hidden = true; P = null; rcRender(); return; }
      if (b.id === "rcPopPlay") { rcAudition(P.i); return; }
      rcPushUndo();
      if (b.dataset.k) { const k = b.dataset.k; tr[k][s] = tr[k][s] ? 0 : 1; if (k !== "on") tr.on[s] = 1; else if (!tr.on[s]) tr.acc[s] = tr.flam[s] = tr.roll[s] = tr.prob[s] = tr.nudge[s] = 0; }
      if (b.dataset.roll != null) { tr.on[s] = 1; tr.roll[s] = +b.dataset.roll; }
      if (b.dataset.prob != null) { tr.on[s] = 1; tr.prob[s] = +b.dataset.prob; }
      if (b.dataset.nudge != null) { tr.on[s] = 1; tr.nudge[s] = +b.dataset.nudge; }
      rcSave(); rcRender(); paintPop();
      const c = rcGrid.querySelector(`.rc-c[data-t="${P.i}"][data-s="${s}"]`); if (c) c.classList.add("lp");
    });
    document.addEventListener("pointerdown", e => { if (!pop.hidden && !e.target.closest("#rcPop") && !e.target.closest(".rc-c")) { pop.hidden = true; P = null; rcGrid.querySelectorAll(".rc-c.lp").forEach(x => x.classList.remove("lp")); } }, true);
    document.getElementById("rcDone").addEventListener("click", () => { pop.hidden = true; P = null; });
  }

  // ---------- Play view: just the keys ----------
  const perfBtn = document.getElementById("perfBtn");
  function perfOn(on) {
    document.body.classList.toggle("perf", on); perfBtn.setAttribute("aria-pressed", String(on));
    perfBtn.title = on ? "Back to the full view" : "Play view: just the keys";
    if (on) { const k = document.querySelector(".keys"); if (k) setTimeout(() => k.scrollIntoView({ block: "end", behavior: "smooth" }), 50); }
    setTimeout(() => { try { buildKeys(); } catch (e) {} }, 60);
  }
  perfBtn.addEventListener("click", () => perfOn(!document.body.classList.contains("perf")));

  // ---------- the feature row: Install only until it's installed; Report lives in Help ----------
  {
    const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const paintInstall = () => { const h = installed(); document.getElementById("installBtn").hidden = h; document.getElementById("installSep").hidden = h; };
    paintInstall(); window.addEventListener("appinstalled", () => setTimeout(paintInstall, 300));
    try { matchMedia("(display-mode: standalone)").addEventListener("change", paintInstall); } catch (e) {}
    document.getElementById("reportBtn").addEventListener("click", () => { document.getElementById("helpSheet").hidden = true; });
  }
