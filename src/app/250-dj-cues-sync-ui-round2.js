  // ======================================================================
  // DJ: start both decks together, link near-simultaneous starts, CDJ-style Cue, coloured quantized hot cues
  // ======================================================================
  const DJ_HC_COL = ["#7fd6c2", "#7fb0ff", "#ffb65c", "#ff7ab8"];
  {
    const LINK_WIN = 1.5;
    DJ.link = true; DJ.quant = true;
    try { const o = JSON.parse(localStorage.getItem("nightbloom-djopts") || "{}"); if (o.link === false) DJ.link = false; if (o.quant === false) DJ.quant = false; } catch (e) {}
    const saveOpts = () => { try { localStorage.setItem("nightbloom-djopts", JSON.stringify({ link: DJ.link, quant: DJ.quant })); } catch (e) {} };
    const firstBeat = d => { if (!d.bpm0) return 0; const p = djPer(d); return ((d.off % p) + p) % p; };
    const topOf = d => { const fb = firstBeat(d); return fb < 1.2 ? fb : 0; };
    const lastStart = [-1e9, -1e9];
    DJ.lastStart = lastStart;
    const otherPlaying = d => DJ.decks[1 - d.i].playing;
    // a deck started soon after the other joins it: it plays as if both had been pressed at the same moment
    const locked = (d, o) => DJ.sync && o.bpm0 && d.bpm0;
    // start d from \`from\` on the playing deck o's beat (sync on): o leads, d comes in at the nearest matching beat
    const inOnBeat = (d, o, from) => { DJ.lead = o.i; d.playing = false; d.p0 = Math.max(0, Math.min(from, d.buf.duration - 0.05)); if (!djAlign(true)) djStartSrc(d, ctx.currentTime + 0.02, d.p0); };
    function joinOther(d, from) {
      const o = DJ.decks[1 - d.i];
      if (!DJ.link || !o.playing || !o.buf || !ctx) return false;
      const now = ctx.currentTime + 0.03;
      if (now - lastStart[o.i] > LINK_WIN) return false;
      const at = Math.max(now, lastStart[o.i]), ahead = Math.max(0, at - lastStart[o.i]) * d.rate * d.bend, p = Math.min(from + ahead, d.buf.duration - 0.05);
      if (d.loop && (p < d.loop.a || p >= d.loop.b)) djLoop(d, 0);
      if (locked(d, o)) inOnBeat(d, o, p); else djStartSrc(d, at, p);
      lastStart[d.i] = lastStart[o.i];
      djMsg("Deck " + "AB"[d.i] + " joined " + "AB"[o.i] + ": started together" + (ahead > 0.02 ? " (caught up " + ahead.toFixed(2) + " s)" : ""));
      return true;
    }
    const startDeck = (d, from, msg) => {
      if (d.loop && (from < d.loop.a || from >= d.loop.b)) djLoop(d, 0);
      if (!joinOther(d, from)) {
        const o = DJ.decks[1 - d.i];
        if (o.playing && locked(d, o)) inOnBeat(d, o, from); else djStartSrc(d, ctx.currentTime + 0.02, from);
        lastStart[d.i] = d.t0;
        if (msg) djMsg(msg);
      }
      if (DJ.auto) djTickOn();
    };
    // ▶: a stopped deck may join the other; ▶ while previewing from Cue keeps it playing
    { const pl = djPlay; djPlay = function (d, on) {
        if (d.cuePrev && (on == null || on)) { d.cuePrev = false; paintCue(d); djPaintAll(); return; }
        if (on == null) on = !d.playing;
        if (on && !d.playing && d.buf && djBuild()) {
          if (d.p0 >= d.buf.duration - 0.05) d.p0 = 0;
          if (joinOther(d, d.p0)) { if (DJ.auto) djTickOn(); djPaintAll(); return; }
        }
        const r = pl.call(this, d, on); if (on && d.playing) lastStart[d.i] = d.t0; return r;
      }; }
    function paintCue(d) { const b = deckEls[d.i].querySelector(".dj-cue"); if (b) b.classList.toggle("prev", !!d.cuePrev); }
    function hotJump(d, p, k) {
      if (!djBuild()) return;
      if (!d.playing) { startDeck(d, p, "Deck " + "AB"[d.i] + " from hot cue " + (k + 1) + " (" + djFmt(p) + ")"); djPaintAll(); return; }
      if (d.loop && (p < d.loop.a || p >= d.loop.b)) djLoop(d, 0);
      const o = DJ.decks[1 - d.i], locked = DJ.sync && o.playing && o.bpm0 && d.bpm0;
      let at = ctx.currentTime + 0.01;
      if (DJ.quant && d.bpm0) { const ref = locked ? o : d, per = djPer(ref), sp = ref.rate * ref.bend; let wait = (1 - djPhaseAt(ref, 0)) * per / sp; if (wait < 0.03) wait += per / sp; at = ctx.currentTime + wait; }
      djStartSrc(d, at, locked ? djInPhase(d, o, p, at) : p); const onBeat = DJ.quant && d.bpm0;   // only this deck moves
      djMsg("Hot cue " + (k + 1) + " (" + djFmt(p) + ")" + (onBeat ? " on the next beat" : ""));
      djPaintDeck(d);
    }
    deckEls.forEach((el, i) => {
      const d = DJ.decks[i];
      const swap = sel => { const old = el.querySelector(sel), nb = old.cloneNode(true); old.replaceWith(nb); return nb; };   // drop the old handlers
      // ⏮: the song's first beat, playing; two restarts close together start together
      const rb = swap(".dj-restart"); rb.title = "Back to the first beat and play · restart both decks within 1.5 s and they start together";
      rb.addEventListener("click", () => {
        if (!d.buf) { djLoadMenu(d); return; } if (!djBuild()) return;
        d.cuePrev = false; startDeck(d, topOf(d), "Deck " + "AB"[d.i] + ": " + (d.name || "the song") + " from the top"); djPaintAll();
      });
      // Cue, CDJ style
      const cb = swap(".dj-cue"); cb.title = "Stopped: tap to set the cue here, hold to hear it from the cue · Playing: back to the cue, stopped";
      cb.addEventListener("pointerdown", e => {
        e.preventDefault(); if (!d.buf) { djMsg("Load a song on " + "AB"[d.i] + " first"); return; } if (!djBuild()) return;
        try { cb.setPointerCapture(e.pointerId); } catch (er) {}
        if (d.playing) { djPlay(d, false); d.p0 = d.cue; djMsg("Back to the cue (" + djFmt(d.cue) + ") on " + "AB"[d.i] + " · hold Cue to hear it, ▶ to go"); djPaintAll(); return; }
        if (Math.abs(d.p0 - d.cue) < 0.03) { d.cuePrev = true; djStartSrc(d, ctx.currentTime + 0.01, d.cue); paintCue(d); djPaintAll(); return; }
        d.cue = d.bpm0 ? Math.max(0, djBeatFloor(d, d.p0 + djPer(d) / 2)) : d.p0; d.p0 = d.cue; djStoreGrid(d);
        djMsg("Cue set at " + djFmt(d.cue) + " on " + "AB"[d.i] + " · hold Cue to hear it, ▶ to play"); djPaintDeck(d);
      });
      const cueUp = () => { if (!d.cuePrev) return; d.cuePrev = false; if (d.playing) { djStopSrc(d, ctx.currentTime); d.playing = false; } d.p0 = d.cue; paintCue(d); djPaintAll(); };
      cb.addEventListener("pointerup", cueUp); cb.addEventListener("pointercancel", cueUp); cb.addEventListener("lostpointercapture", cueUp);
      cb.addEventListener("contextmenu", e => e.preventDefault());
      // hot cues
      el.querySelectorAll(".dj-cues .btn[data-c]").forEach(old => {
        const b = old.cloneNode(true); old.replaceWith(b); const k = +b.dataset.c; let hold = 0, held = false;
        b.style.setProperty("--hc", DJ_HC_COL[k]);
        b.title = "Empty: tap to set it here · Set: tap to jump there (a stopped deck starts from it) · hold to clear (or ✕, then the cue)";
        b.addEventListener("pointerdown", e => { e.preventDefault(); held = false; clearTimeout(hold); if (d.cues[k] != null) hold = setTimeout(() => { held = true; d.cues[k] = null; djStoreGrid(d); djPaintDeck(d); djMsg("Hot cue " + (k + 1) + " cleared"); }, 550); });
        b.addEventListener("pointerup", () => {
          clearTimeout(hold); if (held) { held = false; return; }
          if (!d.buf) { djMsg("Load a song on " + "AB"[d.i] + " first"); return; }
          if (d.cues[k] == null) { const p = djPos(d); d.cues[k] = d.bpm0 ? Math.max(0, djBeatFloor(d, p + djPer(d) / 2)) : p; djStoreGrid(d); djPaintDeck(d); djMsg("Hot cue " + (k + 1) + " set at " + djFmt(d.cues[k]) + " on " + "AB"[d.i] + " · tap to jump there · to clear it: hold it, or ✕ then the cue"); return; }
          hotJump(d, d.cues[k], k);
        });
        b.addEventListener("pointerleave", () => clearTimeout(hold)); b.addEventListener("pointercancel", () => clearTimeout(hold)); b.addEventListener("contextmenu", e => e.preventDefault());
      });
    });
    // a new song's cue point is its first beat
    { const dl = djLoad; djLoad = async function (d) { const r = await dl.apply(this, arguments); if (d.buf && d.cue === 0 && d.bpm0) { const fb = firstBeat(d); if (fb > 0.005 && fb < 2) { d.cue = fb; if (!d.playing && d.p0 === 0) d.p0 = fb; djPaintDeck(d); } } return r; }; }
    // both decks at once
    function bothGo(top) {
      if (!djBuild()) return;
      const A = DJ.decks[0], B = DJ.decks[1];
      if (!A.buf || !B.buf) { djMsg("Load a song on both decks first"); return; }
      if (!top && A.playing && B.playing) { const t = ctx.currentTime + 0.01; [A, B].forEach(d => { d.p0 = djPos(d); djStopSrc(d, t); d.playing = false; d.cuePrev = false; }); djMsg("Both decks stopped together"); djPaintAll(); return; }
      if (!top && A.playing !== B.playing) DJ.lead = A.playing ? 0 : 1;   // the one already playing leads and keeps going
      const at = ctx.currentTime + 0.08, L = LEAD(), F = FOL(), grids = L.bpm0 && F.bpm0;
      if (DJ.sync && grids) { const mr = djMatchRate(); if (mr) { if (mr.m !== 1) { F.bpm0 *= mr.m; F.off = ((F.off % djPer(F)) + djPer(F)) % djPer(F); } F.rate = Math.max(0.5, Math.min(2, mr.r)); F.bend = 1; } }
      const fromOf = d => top ? topOf(d) : d.playing ? djPos(d) + (at - ctx.currentTime) * d.rate * d.bend : (d.p0 >= d.buf.duration - 0.05 ? 0 : d.p0);
      const fL = fromOf(L); let fF = fromOf(F);
      if (!top && grids) { const phL = frac((fL - L.off) / djPer(L)), pF = djPer(F); fF = F.off + (Math.round((fF - F.off) / pF - phL) + phL) * pF; if (fF < 0) fF += pF; }   // in on the lead's beat
      const go = (d, f) => { d.cuePrev = false; if (d.loop && (f < d.loop.a || f >= d.loop.b)) djLoop(d, 0); djStartSrc(d, at, Math.min(f, d.buf.duration - 0.05)); lastStart[d.i] = at; };
      if (top || !L.playing) go(L, fL);
      go(F, fF);
      if (DJ.auto) djTickOn();
      djMsg(top ? "Both decks from their first beat, together" : "Both decks started together" + (grids ? ", " + "AB"[F.i] + " on " + "AB"[L.i] + "'s beat" : ""));
      djPaintAll();
    }
    const bp = document.getElementById("djBothPlay"), bt = document.getElementById("djBothTop"), lk = document.getElementById("djLink"), qb = document.getElementById("djQuant");
    bp.addEventListener("click", () => bothGo(false)); bt.addEventListener("click", () => bothGo(true));
    lk.addEventListener("click", () => { DJ.link = !DJ.link; saveOpts(); paintBoth(); djMsg(DJ.link ? "Link on: start a deck within 1.5 s of the other and they start together" : "Link off: each deck starts exactly when you press it"); });
    qb.addEventListener("click", () => { DJ.quant = !DJ.quant; saveOpts(); paintBoth(); djMsg(DJ.quant ? "Q on: hot cue jumps wait for the next beat" : "Q off: hot cue jumps happen right away"); });
    function paintBoth() {
      const both = DJ.decks.every(d => d.playing);
      bp.textContent = both ? "■ Both" : "▶ Both"; bp.dataset.on = both ? "1" : "0";
      lk.setAttribute("aria-pressed", String(!!DJ.link)); qb.setAttribute("aria-pressed", String(!!DJ.quant));
    }
    { const pa = djPaintAll; djPaintAll = function () { const r = pa.apply(this, arguments); paintBoth(); return r; }; }
    paintBoth();
  }
  // ======================================================================
  // DJ: land a deck on the other song's beat (sync) without moving the other song; ✕ to clear hot cues
  // ======================================================================
  const djInPhase = (d, o, p, at) => {   // the spot nearest p where d's beat lines up with o's at time `at`
    const ph = djPhaseAt(o, Math.max(0, at - ctx.currentTime)), per = djPer(d);
    let x = d.off + (Math.round((p - d.off) / per - ph) + ph) * per;
    if (x < 0) x += per; if (x > d.buf.duration - 0.1) x -= per;
    return Math.max(0, x);
  };
  deckEls.forEach((el, i) => {
    const d = DJ.decks[i], row = el.querySelector(".dj-cues"), x = document.createElement("button");
    x.className = "btn dj-hcx"; x.textContent = "✕"; x.setAttribute("aria-pressed", "false"); x.setAttribute("aria-label", "Clear hot cues");
    x.title = "Clear a hot cue: tap ✕, then the cue · hold ✕ to clear all four";
    row.querySelector('.btn[data-c="3"]').after(x);
    let armT = 0, hold = 0, held = false;
    const arm = on => { d.hcClear = on; clearTimeout(armT); row.classList.toggle("clearing", on); x.setAttribute("aria-pressed", String(on)); if (on) armT = setTimeout(() => arm(false), 8000); };
    const any = () => d.cues.some(v => v != null);
    x.addEventListener("pointerdown", e => {
      e.preventDefault(); held = false; clearTimeout(hold);
      hold = setTimeout(() => { held = true; arm(false); if (any()) { d.cues = [null, null, null, null]; djStoreGrid(d); djPaintDeck(d); djMsg("All hot cues cleared on " + "AB"[d.i]); } else djMsg("No hot cues set on " + "AB"[d.i]); }, 600);
    });
    x.addEventListener("pointerup", () => {
      clearTimeout(hold); if (held) { held = false; return; }
      if (d.hcClear) { arm(false); djMsg("Hot cues kept"); return; }
      if (!any()) { djMsg("No hot cues set on " + "AB"[d.i]); return; }
      arm(true); djMsg("Tap a hot cue on " + "AB"[d.i] + " to clear it · hold ✕ to clear all four");
    });
    x.addEventListener("pointerleave", () => clearTimeout(hold)); x.addEventListener("pointercancel", () => clearTimeout(hold)); x.addEventListener("contextmenu", e => e.preventDefault());
    // while ✕ is lit, a tap on a hot cue clears it (caught on the row, before the cue's own handlers)
    const cueOf = e => { const b = e.target.closest && e.target.closest(".btn[data-c]"); return b && row.contains(b) ? b : null; };
    row.addEventListener("pointerdown", e => { if (d.hcClear && cueOf(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
    row.addEventListener("pointerup", e => {
      const b = cueOf(e); if (!d.hcClear || !b) return;
      e.stopPropagation(); const k = +b.dataset.c; arm(false);
      if (d.cues[k] == null) { djMsg("Hot cue " + (k + 1) + " is already empty"); return; }
      d.cues[k] = null; djStoreGrid(d); djPaintDeck(d); djMsg("Hot cue " + (k + 1) + " cleared on " + "AB"[d.i]);
    }, true);
  });
  // ======================================================================
  // Rhythm Creator: Auto BPM, locked to the DJ deck that's playing
  // ======================================================================
  function rcFollow() {   // the DJ deck the Rhythm Creator follows right now, or null
    if (RCP.djLock === false) return null;
    for (const d of [LEAD(), FOL()]) if (d && d.buf && d.playing && d.bpm0) return { d, bpm: djEff(d) * d.bend };
    return null;
  }
  {
    const RC_OFF = 2882880;   // a large multiple of every common track length, so patterns stay on the song's bars
    const djBtnRc = document.getElementById("rcDj"), bpmEl = document.getElementById("rcBpm");
    const tk = rcTick;
    rcTick = function () {
      if (ctx && RC.playing) {
        const f = rcFollow();
        if (f) {
          const d = f.d, now = ctx.currentTime; RC.djHold = f.bpm;
          if (now >= d.t0 + 0.02) {   // (a start or jump that's still pending: keep time until it lands)
            const speed = d.rate * d.bend, per = djPer(d), sd = per / 4 / speed, ref = d.phrase != null ? d.phrase : d.off;
            const mf = (djPos(d) + (RC.nextT - now) * speed - ref) / per * 4;
            let m = Math.round(mf), tg = RC.nextT - (mf - m) * sd;
            while (tg < now + 0.004) { m++; tg += sd; }
            const diff = tg - RC.nextT;
            if (Math.abs(diff) > sd * 0.3) RC.nextT = tg;                                  // the song jumped: snap
            else if (Math.abs(diff) > 0.0015) RC.nextT += Math.max(-0.003, Math.min(0.003, diff));   // drift: ease back
            if (!d.loop) RC.step = m + RC_OFF;   // (in a deck loop the pattern keeps running instead of repeating with it)
          }
        }
      }
      const r = tk.apply(this, arguments);
      const shown = Math.round(rcBpm() * 10) + (rcFollow() ? 1e6 : 0);
      if (shown !== RC.bpmShown) { RC.bpmShown = shown; rcPaintTransport(); }
      return r;
    };
    { const rp = rcPlay; rcPlay = function (on) { if (!on) RC.djHold = 0; return rp.apply(this, arguments); }; }
    { const pt = rcPaintTransport; rcPaintTransport = function () {
        pt.apply(this, arguments);
        const f = rcFollow();
        if (f) bpmEl.textContent = f.bpm.toFixed(1) + " · DJ";
        else if (RC.playing && RC.djHold) bpmEl.textContent = RC.djHold.toFixed(1) + " bpm";
        djBtnRc.setAttribute("aria-pressed", String(RCP.djLock !== false)); djBtnRc.classList.toggle("live", !!f);
      }; }
    { const pa = djPaintAll; djPaintAll = function () { const r = pa.apply(this, arguments); if (!rcView.hidden) rcPaintTransport(); return r; }; }
    const setLock = on => { RCP.djLock = on; rcSave(); RC.bpmShown = null; rcPaintTransport(); };
    djBtnRc.addEventListener("click", () => {
      const on = RCP.djLock === false;
      if (!on) { const f = rcFollow(), cur = f ? f.bpm : (RC.playing && RC.djHold) || 0; if (cur) setBpm(Math.round(cur)); RC.djHold = 0; }   // carry on at about the same tempo
      setLock(on);
      undoToast(on ? "Auto BPM on: follows the DJ's tempo and beat while a deck plays" : "Auto BPM off: the Rhythm Creator keeps its own tempo (" + state.seq.bpm + " bpm)", () => setLock(!on));
    });
    // − / + while following: take the tempo back, starting from the DJ's
    [["rcBpmDown", -1], ["rcBpmUp", 1]].forEach(([id, dir]) => {
      const old = document.getElementById(id), btn = old.cloneNode(true); old.replaceWith(btn);
      btn.addEventListener("click", () => {
        const f = rcFollow(), from = f ? f.bpm : (RC.playing && RC.djHold) || 0;
        if (f) { RCP.djLock = false; rcSave(); undoToast("Auto BPM off: you set the tempo", () => setLock(true)); }
        RC.djHold = 0; setBpm((from ? Math.round(from) : state.seq.bpm) + dir); RC.bpmShown = null; rcPaintTransport();
      });
    });
  }
  // ======================================================================
  // UI round 2: source row, engine strip, phone menu, sideways-scroll fades
  // ======================================================================
  {
    // ---- the sampler's slots + Load and the Inst picker show with every panel ----
    const srcRow = document.createElement("div"); srcRow.className = "srcrow"; srcRow.id = "srcRow";
    document.querySelector(".panelbar").after(srcRow);
    const sline = document.createElement("div"); sline.className = "sbar srcline"; sline.id = "srcSamp"; sline.setAttribute("role", "group"); sline.setAttribute("aria-label", "Sampler slots");
    sline.append(document.getElementById("slots"), document.getElementById("loadBtn"));
    srcRow.append(sline, document.getElementById("instbar"));
    const syncSrc = () => {
      sline.hidden = state.engine !== "samp";
      srcRow.hidden = state.panel === "hide" || ![...srcRow.children].some(c => !c.hidden);
    };
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); syncSrc(); return r; }; }
    { const rm = renderMore; renderMore = function () { const r = rm.apply(this, arguments); syncSrc(); return r; }; }
    { const sp = setPanel; setPanel = function () { const r = sp.apply(this, arguments); syncSrc(); return r; }; }
    syncSrc();

    // ---- the engine strip scrolls to the selected tab when it changes ----
    let shownEng = null;
    const showTab = smooth => {
      const t = tabsEl.querySelector('.tab[aria-pressed="true"]'); if (!t || !t.offsetParent) return;
      const r = t.getBoundingClientRect(), s = tabsEl.getBoundingClientRect();
      if (r.left >= s.left + 20 && r.right <= s.right - 20) return;
      tabsEl.scrollBy({ left: (r.left + r.width / 2) - (s.left + s.width / 2), behavior: smooth ? "smooth" : "auto" });
    };
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); if (state.engine !== shownEng) { const first = shownEng === null; shownEng = state.engine; requestAnimationFrame(() => showTab(!first)); } return r; }; }
    requestAnimationFrame(() => { shownEng = state.engine; showTab(false); });

    // ---- phones: ☰ Menu instead of the sideways tool row ----
    const menu = document.getElementById("menuSheet"), grid = document.getElementById("menuGrid");
    const ITEMS = [
      ["setupBtn", "Set up", "The rig: sound, MIDI, Gear, Pixelbook, projects, the app, help"],
      ["findBtn", "Find", "Any setting, sound, song or action: two letters (/ or Ctrl-K)"],
      ["playBtn", "Play", "The performance surface: the stack, eight macros, pads, the set list"],
      ["liveBtn", "Live", "Big knobs, faders and pads for playing out"],
      ["prBtn", "Projects", "Save, open and share everything"],
      ["wamBtn", "Plugins", "Plugin instruments and effects"],
      ["msBtn", "My sounds", "Save the sound you've dialled in"],
      ["exBtn", "Export", "Stems, MIDI file, K.O. II pads"],
      ["midiBtn", "MIDI", "Keyboards in, clock in and out"],
      ["gearBtn", "Gear", "What's plugged in: the MiniLab, the K.O. II, sound, Pixelbook, who keeps time"],
      ["lkBtn", "Link", "Send projects to the computer and play together"],
      ["installBtn", "Install", "Add Nate Bloom to the home screen"],
      ["hisBtn", "History", "Every change, newest first: go back to any of them"],
      ["helpBtn", "Help", "How it works · vibration · report a problem"],
      ["exitBtn", "Exit", "Save your work and close"],
    ];
    const fill = () => {
      grid.innerHTML = "";
      ITEMS.forEach(([id, name, sub]) => {
        const src = document.getElementById(id); if (!src || src.hidden) return;
        const t = document.createElement("button"); t.className = "menu-tile"; t.innerHTML = "<b></b><small></small>";
        t.querySelector("b").textContent = name; t.querySelector("small").textContent = sub;
        t.addEventListener("click", () => { menu.hidden = true; src.click(); });
        grid.appendChild(t);
      });
    };
    document.getElementById("menuBtn").addEventListener("click", () => { fill(); menu.hidden = false; });
    document.getElementById("menuDone").addEventListener("click", () => { menu.hidden = true; });
    menu.addEventListener("click", e => { if (e.target === menu) menu.hidden = true; });

    // ---- rows that scroll sideways fade at the edge that has more ----
    const hf = el => {
      if (!el || el.__hf) return; el.__hf = true; el.classList.add("hfade");
      const upd = () => { const max = el.scrollWidth - el.clientWidth; el.style.setProperty("--fl", el.scrollLeft > 2 ? "26px" : "0px"); el.style.setProperty("--fr", max > 2 && el.scrollLeft < max - 2 ? "26px" : "0px"); };
      el.addEventListener("scroll", upd, { passive: true });
      try { new ResizeObserver(upd).observe(el); } catch (e) {}
      new MutationObserver(upd).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
      upd();
    };
    ["#tabs", "#betaBar", ".sc-tools", ".trk-tools", ".trk-sel", "#drChips"].forEach(sel => document.querySelectorAll(sel).forEach(hf));
  }
  // ======================================================================
  // the red global Stop
  // ======================================================================
  {
    const sa = document.getElementById("stopAll");
    sa.addEventListener("click", () => { nbStopSources(); document.getElementById("panic").click(); });   // + the DJ, Jam, Rhythm Creator and tail stops hooked on it
    document.querySelectorAll("[data-stopall]").forEach(b => b.addEventListener("click", () => sa.click()));
  }
  // ---- keyboard letters on the keys: the Help switch ----
  {
    const b = document.getElementById("kbdLabBtn");
    const paint = () => { b.textContent = "Letters on keys: " + (KBD_LABELS ? "On" : "Off"); b.setAttribute("aria-pressed", String(!!KBD_LABELS)); document.body.classList.toggle("kbd", !!KBD_LABELS); };
    b.addEventListener("click", () => { KBD_LABELS = !KBD_LABELS; try { localStorage.setItem("nightbloom-kbd", KBD_LABELS ? "1" : "0"); } catch (e) {} paint(); kbLabel(); });
    paint(); kbLabel();
    { const bp = buildPads; buildPads = function () { const r = bp.apply(this, arguments); kbLabel(); return r; }; }
    { const bk = buildKitPads; buildKitPads = function () { const r = bk.apply(this, arguments); kbLabel(); return r; }; }
  }
  // ======================================================================
  // DJ key shift: a Key row on each deck (needs key lock's stretcher)
  // ======================================================================
  const camShift = (cam, st) => { if (!cam || !st) return cam || ""; const n = +cam.slice(0, -1), l = cam.slice(-1); return ((((n - 1 + 7 * st) % 12) + 12) % 12 + 1) + l; };
  const keyShiftName = (key, st) => { if (!key || !st) return key || ""; const m = key.match(/^(\S+)\s+(major|minor)$/); if (!m) return key; const i = KEYS.indexOf(m[1]); return i < 0 ? key : KEYS[((i + st) % 12 + 12) % 12] + " " + m[2]; };
  function djSetSemi(d, st) {
    st = Math.max(-6, Math.min(6, Math.round(st || 0)));
    if ((d.semi || 0) === st) return;
    d.semi = st;
    if (d.playing && d.buf && ctx) { const p = djPos(d); djStartSrc(d, ctx.currentTime + 0.02, p); if (DJ.sync && LEAD().playing && FOL().playing) setTimeout(() => djAlign(false), 60); }
    djPaintDeck(d);
  }
  deckEls.forEach((el, i) => {
    const d = DJ.decks[i]; d.semi = 0;
    const row = document.createElement("div"); row.className = "dj-key"; row.hidden = true;
    row.innerHTML = '<span>Key</span><button class="btn sm dj-kd" aria-label="Key down a semitone">−</button><output title="Tap to put the song back in its own key">0 st</output><button class="btn sm dj-ku" aria-label="Key up a semitone">+</button><small></small>';
    el.querySelector(".dj-speed").after(row);
    row.querySelector(".dj-kd").addEventListener("click", () => { if (!d.buf) return; djSetSemi(d, (d.semi || 0) - 1); djMsg("Deck " + "AB"[d.i] + " key " + (d.semi > 0 ? "+" : "") + d.semi + " st" + (d.cam ? " · " + camShift(d.cam, d.semi) : "")); });
    row.querySelector(".dj-ku").addEventListener("click", () => { if (!d.buf) return; djSetSemi(d, (d.semi || 0) + 1); djMsg("Deck " + "AB"[d.i] + " key " + (d.semi > 0 ? "+" : "") + d.semi + " st" + (d.cam ? " · " + camShift(d.cam, d.semi) : "")); });
    row.querySelector("output").addEventListener("click", () => { if (d.semi) { djSetSemi(d, 0); djMsg("Deck " + "AB"[d.i] + " back in its own key"); } });
  });
  { const pd = djPaintDeck; djPaintDeck = function (d) {
      pd.apply(this, arguments);
      const row = deckEls[d.i].querySelector(".dj-key"); if (!row) return;
      row.hidden = !DJ.stretchOK;
      const st = d.semi || 0, o = row.querySelector("output");
      o.textContent = (st > 0 ? "+" : "") + st + " st"; o.classList.toggle("moved", !!st);
      row.querySelector("small").textContent = !d.buf ? "" : !d.cam ? "key not found" : st ? keyShiftName(d.key, st) + " · " + d.cam + " → " + camShift(d.cam, st) : d.key + " · " + d.cam;
    }; }
  { const dl = djLoad; djLoad = async function (d) { d.semi = 0; const r = await dl.apply(this, arguments); djPaintDeck(d); return r; }; }
  { const sr = djStretchReady; djStretchReady = async function () { const r = await sr.apply(this, arguments); DJ.decks.forEach(djPaintDeck); return r; }; }
  // ======================================================================
  // DJ song structure: 8-bar phrases labelled intro / build / drop / break / groove / outro
  // ======================================================================
  const DJ_SECT_COL = { intro: "#6f83ad", build: "#ffb65c", drop: "#ff6b9a", break: "#7fd6c2", groove: "#9b8ae0", outro: "#6a6280" };
  const DJ_SECT_NAME = { intro: "intro", build: "build-up", drop: "drop", break: "breakdown", groove: "groove", outro: "outro" };
  const DJ_SECT = new WeakMap();
  async function djSections(d, onProg) {
    if (!d || !d.buf || !d.bpm0) return null;
    const buf = d.buf, per = djPer(d), bar = per * 4, a0 = d.phrase != null ? d.phrase : d.off;
    const sig = d.bpm0.toFixed(4) + "|" + d.off.toFixed(4) + "|" + (d.phrase == null ? "" : d.phrase.toFixed(4));
    const have = DJ_SECT.get(buf); if (have && have.sig === sig) return have;
    const first = a0 - Math.ceil(a0 / bar - 1e-9) * bar, nb = Math.max(1, Math.ceil((buf.duration - first) / bar));
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, sr = buf.sampleRate, n = L.length;
    const E = new Float64Array(nb), Lo = new Float64Array(nb), Hi = new Float64Array(nb), C = new Float64Array(nb);
    const D = 4, dt = D / sr, aLo = 1 - Math.exp(-2 * Math.PI * 150 * dt), aHi = 1 - Math.exp(-2 * Math.PI * 2000 * dt), spb = bar * sr;
    let lo = 0, lp = 0;
    for (let s0 = 0; s0 < n; s0 += 1 << 18) {
      const s1 = Math.min(n, s0 + (1 << 18));
      if (onProg) { try { onProg(s0 / n); } catch (e) {} }
      for (let i = s0; i < s1; i += D) {
        const x = (L[i] + R[i]) * 0.5; lo += aLo * (x - lo); lp += aHi * (x - lp); const hi = x - lp;
        const b = Math.floor((i - first * sr) / spb); if (b < 0 || b >= nb) continue;
        E[b] += x * x; Lo[b] += lo * lo; Hi[b] += hi * hi; C[b]++;
      }
      await new Promise(z => setTimeout(z, 0));
      if (d.buf !== buf) return null;   // a new song went on the deck meanwhile
    }
    for (let b = 0; b < nb; b++) { const c = C[b] || 1; E[b] = Math.sqrt(E[b] / c); Lo[b] = Math.sqrt(Lo[b] / c); Hi[b] = Math.sqrt(Hi[b] / c); }
    const norm = A => { const v = [...A].filter(x => x > 0).sort((p, q) => p - q), m = v.length ? v[Math.floor(v.length * 0.9)] || v[v.length - 1] : 1; return [...A].map(x => Math.min(1.3, x / (m || 1))); };
    const e = norm(E), l = norm(Lo), h = norm(Hi);
    // where the 8-bar phrases fall: the Phrase mark if there is one, else the offset where the music changes most
    let o = 0;
    if (d.phrase == null) {
      let best = -1;
      for (let k = 0; k < 8; k++) { let sc = 0, cnt = 0; for (let b = k === 0 ? 8 : k; b < nb; b += 8) { sc += Math.abs(e[b] - e[b - 1]) + Math.abs(l[b] - l[b - 1]) + 0.5 * Math.abs(h[b] - h[b - 1]); cnt++; } sc /= Math.max(1, cnt); if (sc > best + 1e-9) { best = sc; o = k; } }
    } else o = Math.round((a0 - first) / bar) % 8;
    const cuts = []; if (o > 0) cuts.push([0, o]); for (let b = o; b < nb; b += 8) cuts.push([b, Math.min(nb, b + 8)]);
    if (cuts.length > 1 && cuts[cuts.length - 1][1] - cuts[cuts.length - 1][0] < 3) { const t = cuts.pop(); cuts[cuts.length - 1][1] = t[1]; }
    const mean = (A, b0, b1) => { let s2 = 0; for (let b = b0; b < b1; b++) s2 += A[b]; return s2 / Math.max(1, b1 - b0); };
    const P = cuts.map(([b0, b1]) => ({ b0, b1, bars: b1 - b0, start: Math.max(0, first + b0 * bar), end: Math.min(buf.duration, first + b1 * bar), e: mean(e, b0, b1), l: mean(l, b0, b1), h: mean(h, b0, b1) }));
    const high = p => p.e >= 0.72;
    let fi = P.findIndex(high), li = P.length - 1 - [...P].reverse().findIndex(high); if (fi < 0) { fi = 0; li = P.length - 1; }
    P.forEach((p, i) => {
      if (i < fi) p.label = "intro";
      else if (i > li) p.label = "outro";
      else if (p.e >= 0.8 && p.l >= 0.7) p.label = "drop";
      else if (p.l < 0.45 && p.e < 0.72) p.label = "break";
      else p.label = "groove";
    });
    P.forEach((p, i) => { const nx = P[i + 1]; if (i > 0 && nx && nx.label === "drop" && p.label !== "drop" && nx.e > p.e + 0.08) p.label = "build"; });
    const sections = []; P.forEach(p => { const lst = sections[sections.length - 1]; if (lst && lst.label === p.label) { lst.end = p.end; lst.bars += p.bars; } else sections.push({ label: p.label, start: p.start, end: p.end, bars: p.bars }); });
    const r = { sig, bar, first, phrases: P, sections, buf };
    DJ_SECT.set(buf, r); return r;
  }
  // read every song that goes onto a deck, then draw its sections under the waveform
  const djSectFor = (d, onProg) => { if (!d.buf || !d.bpm0) return Promise.resolve(null); const p = djSections(d, onProg).then(r => { if (r && d.buf === r.buf) { d.sect = r; d.img = null; djPaintDeck(d); djPaintAll(); } return r; }); d.sectP = p; return p; };
  { const dl = djLoad; djLoad = async function (d) { d.sect = null; const r = await dl.apply(this, arguments); djSectFor(d); return r; }; }
  { const dw = djDrawWave; djDrawWave = function (d) {
      dw.apply(this, arguments);
      const r = d.sect; if (!d.buf || !r || r.buf !== d.buf) return;
      const S = djSize(d.waveEl || (d.waveEl = deckEls[d.i].querySelector(".dj-wave"))); if (!S) return;
      const { c, w, h } = S, dur = d.buf.duration;
      r.phrases.forEach(p => { c.fillStyle = DJ_SECT_COL[p.label]; c.fillRect(p.start / dur * w, h - 4, Math.max(1, (p.end - p.start) / dur * w - 1), 4); });
    }; }
