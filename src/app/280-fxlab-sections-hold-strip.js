  // ======================================================================
  // FX Lab sections + live line on held notes; Rhythm Creator time, sync and fill
  // ======================================================================
  // ---------- mixer: each synth, sampler slot and the instrument play through a level of their own, so a fader
  // move is heard on notes already sounding (held notes, pads, long releases), not just the next note ----------
  const LV = {};
  let LVK = null;
  function lvLevel(k) {
    if (k.startsWith("e:")) return (state.layers[k.slice(2)] || {}).level;
    if (k.startsWith("s:")) { const sl = state.samp.slots[+k.slice(2)]; return sl && sl.p ? sl.p.level : 0.8; }
    if (k === "inst") return state.inst.p.level;
    if (k.startsWith("l:")) { const pt = state.lib.parts[+k.slice(2)]; return pt ? (pt.level ?? 0.8) : 0.8; }
    return 0.8;
  }
  // (172) a muted sound keeps its place in what's playing; its bus goes to silence, held notes included
  function lvMuted(k) {
    if (k.startsWith("e:")) return !!(state.layers[k.slice(2)] || {}).mute;
    if (k.startsWith("s:")) { const sl = state.samp.slots[+k.slice(2)]; return !!(sl && sl.mute); }
    if (k === "inst") return !!(state.inst && state.inst.mute);
    if (k.startsWith("l:")) { const pt = state.lib.parts[+k.slice(2)]; return !!(pt && pt.mute); }
    return false;
  }
  const lvGain = k => { if (lvMuted(k)) return 0; const v = lvLevel(k); return Number.isFinite(v) ? Math.max(0, v) / 0.8 : 1; };
  function lvBus(k, dest) {
    let g = LV[k];
    if (!g || g.__to !== dest || g.context !== ctx) { g = ctx.createGain(); g.gain.value = g.__v = lvGain(k); g.connect(dest); g.__to = dest; LV[k] = g; }
    return g;
  }
  function lvApply() { if (!ctx) return; for (const k in LV) { const g = LV[k], v = lvGain(k); if (Math.abs(v - g.__v) > 0.001) { g.__v = v; g.gain.setTargetAtTime(v, ctx.currentTime, 0.025); } } }
  { const mv = makeVoice; makeVoice = function (m, id, mix, when) {
      const eid = id || state.engine, L = state.layers[eid];
      if (!L || !ctx || mix == null || !Number.isFinite(L.level)) return mv.apply(this, arguments);
      const a = [...arguments]; a[2] = L.level > 0.005 ? mix * 0.8 / L.level : 1;   // the voice plays at the standard level; the bus carries the fader
      const k0 = LVK; LVK = "e:" + eid; try { return mv.apply(this, a); } finally { LVK = k0; }
    }; }
  { const ms = makeSampleVoice; makeSampleVoice = function (m, i) {
      const sl = state.samp.slots[i]; if (!sl || !sl.p || !ctx || !Number.isFinite(sl.p.level)) return ms.apply(this, arguments);
      const real = sl.p.level, k0 = LVK; sl.p.level = 0.8; LVK = "s:" + i;
      try { return ms.apply(this, arguments); } finally { sl.p.level = real; LVK = k0; }
    }; }
  { const mi = makeInstVoice; makeInstVoice = function (m, when, scale, inst, P) {
      if (P && P !== state.inst.p) return mi.apply(this, arguments);   // library layers carry their own level
      const p = state.inst.p; if (!ctx || !Number.isFinite(p.level)) return mi.apply(this, arguments);
      const real = p.level, k0 = LVK; p.level = 0.8; LVK = "inst";
      try { return mi.apply(this, arguments); } finally { p.level = real; LVK = k0; }
    }; }
  document.getElementById("mxList").addEventListener("input", () => setTimeout(lvApply, 0));
  setInterval(lvApply, 300);   // (the Sound panel's level knobs too)
  window.__lv = { LV, lvLevel, lvApply, key: () => LVK };

  // ---------- time signatures: bar length in 16ths, where the beats fall, the backbeat ----------
  const RC_SIGS = {
    "4/4": { bar: 16, beats: [0, 4, 8, 12], back: [4, 12] }, "3/4": { bar: 12, beats: [0, 4, 8], back: [4, 8] },
    "6/8": { bar: 12, beats: [0, 6], back: [6] }, "5/4": { bar: 20, beats: [0, 4, 8, 12, 16], back: [4, 12] },
    "7/8": { bar: 14, beats: [0, 4, 8], back: [8] }, "12/8": { bar: 24, beats: [0, 6, 12, 18], back: [6, 18] },
  };
  if (!RC_SIGS[RCP.sig]) RCP.sig = "4/4";
  function rcSigOf() { return RC_SIGS[RCP.sig] || RC_SIGS["4/4"]; }
  function rcIsBeat(st) { const S = rcSigOf(); return S.beats.includes(st % S.bar); }
  function rcPageW() { const b = rcSigOf().bar; return RC.zoom ? (b === 16 ? 8 : Math.ceil(b / 2)) : b; }
  const sigSel = document.getElementById("rcSig"), lenSel = document.getElementById("rcLen");
  function rcPaintSig() {
    const S = rcSigOf(), maxBars = Math.max(1, Math.floor(RC_MAX / S.bar));
    sigSel.value = RCP.sig;
    let h = ""; for (let k = 1; k <= Math.min(4, maxBars); k++) h += `<option value="${k * S.bar}">${k * S.bar}${S.bar !== 16 ? " · " + k + " bar" + (k > 1 ? "s" : "") : ""}</option>`;
    if (lenSel.dataset.sig !== RCP.sig) { lenSel.innerHTML = h; lenSel.dataset.sig = RCP.sig; }
    if (![...lenSel.options].some(o => +o.value === RCP.steps)) { const o = document.createElement("option"); o.value = RCP.steps; o.textContent = RCP.steps; lenSel.appendChild(o); }
    lenSel.value = String(RCP.steps);
    const z = document.getElementById("rcZoom"); z.textContent = (S.bar === 16 ? 8 : Math.ceil(S.bar / 2)) + " steps";
  }
  sigSel.addEventListener("change", () => {
    const old = rcSigOf(), was = RCP.sig, nv = sigSel.value; if (!RC_SIGS[nv] || nv === was) return;
    rcPushUndo();
    const S = RC_SIGS[nv], bars = Math.max(1, Math.round(RCP.steps / old.bar)), steps = Math.min(bars, Math.max(1, Math.floor(RC_MAX / S.bar))) * S.bar, prev = RCP.steps;
    RCP.sig = nv; RCP.steps = steps;
    RCP.tracks.forEach(tr => { if (tr.len === prev || tr.len > steps) tr.len = steps; });
    RC.page = 0; rcSave(); rcRender();
    undoToast("Time " + nv + " · Make builds beats in " + nv, rcDoUndo);
  });
  // a beat in any time: each role gets a part built on the bar's beats
  function rcMakeBeatSig(style, busy, cplx) {
    const S = rcSigOf(), b = S.bar, ST = RC_STYLES[style] || {}, used = {};
    const eighth = s => s % 2 === 0, beat = s => S.beats.includes(s), mid = S.beats[Math.floor(S.beats.length / 2)];
    RCP.tracks.forEach(tr => {
      const role = (rcSnd(tr.snd) || {}).role || "perc", n = (used[role] = (used[role] || 0) + 1), thin = n > 1 ? 0.35 : 1;
      ["on", "acc", "flam", "roll", "prob", "nudge"].forEach(k => tr[k].fill(0)); tr.len = b;
      for (let s = 0; s < b; s++) {
        let p = 0;
        switch (role) {
          case "kick": p = s === 0 ? 1 : s === mid && b !== 12 ? 0.55 : beat(s) ? 0.2 * busy : eighth(s) ? 0.12 * busy * (0.5 + cplx) : 0; break;
          case "boom": p = s === 0 ? 1 : s === mid ? 0.4 : 0; break;
          case "snare": p = S.back.includes(s) ? 1 : !eighth(s) ? 0.12 * cplx : 0.05 * cplx; break;
          case "clap": p = S.back.includes(s) ? 0.7 : 0; break;
          case "rim": p = !beat(s) && eighth(s) ? 0.12 * cplx : 0; break;
          case "ch": p = eighth(s) ? 0.95 : 0.45 * busy * busy; break;
          case "oh": p = s === b - 2 ? 0.45 : 0; break;
          case "ride": p = beat(s) ? 0.85 : eighth(s) ? 0.3 * busy : 0; break;
          case "shaker": p = 0.35 + 0.4 * busy; break;
          case "perc": p = !beat(s) && eighth(s) ? 0.15 + 0.3 * cplx : 0.05 * cplx; break;
          case "bell": p = beat(s) ? 0.2 * cplx : 0; break;
          case "tom": p = s >= b - 4 ? 0.15 * cplx : 0; break;
          case "cym": p = s === 0 ? 0.3 : 0; break;
          default: p = 0;
        }
        p *= thin; if (role === "snare" && n === 1 && S.back.includes(s)) p = 1; if ((role === "kick" || role === "boom") && n === 1 && s === 0) p = 1;
        if (Math.random() < p) { tr.on[s] = 1; if (beat(s) && Math.random() < 0.6) tr.acc[s] = 1; }
      }
    });
    RCP.steps = b; if (ST.bpm) { RCP.swing = ST.swing || 0; setBpm(ST.bpm); } RCP.style = style; RCP.busy = busy; RCP.cplx = cplx;
    rcSave(); rcRender(); noteMsg("Made a " + style + " beat in " + RCP.sig);
  }
  { const mb = rcMakeBeat; rcMakeBeat = function (style, busy, cplx) {
      if (RCP.sig === "4/4") return mb.apply(this, arguments);
      rcPushUndo(); rcMakeBeatSig(style, busy, cplx); undoToast("New " + style + " beat in " + RCP.sig, rcDoUndo);
    }; }
  // ---------- Fill: a drum fill into the next bar, crash on the one ----------
  const fillBtn = document.getElementById("rcFill");
  function rcArmFill() {
    if (!RC.playing) { rcPlay(true); }
    const S = rcSigOf(), b = S.bar, len = b - S.beats[S.beats.length - 1], cur = RC.step + 1;
    let from = cur - (cur % b) + b - len; if (from < cur) from += b;
    const role = i => (rcSnd(RCP.tracks[i].snd) || {}).role;
    const idx = r => RCP.tracks.map((tr, i) => i).filter(i => role(i) === r && !RCP.tracks[i].mute);
    const toms = idx("tom"), sn = idx("snare")[0], cym = idx("cym")[0], kick = idx("kick")[0];
    const voices = [sn].concat(toms.slice().reverse()).filter(i => i != null);   // snare, then the toms from high to low
    if (!voices.length) { noteMsg("A fill needs a snare or tom track"); return; }
    RC.fill = { from, to: from + len, voices, cym, kick };
    fillBtn.classList.add("armed"); fillBtn.textContent = "Fill ↘";
  }
  fillBtn.addEventListener("click", () => { start(); if (!ctx) return; if (RC.fill) { RC.fill = null; fillBtn.classList.remove("armed"); fillBtn.textContent = "Fill"; return; } rcArmFill(); });
  {
    const FILL_ROLES = new Set(["snare", "clap", "rim", "ch", "oh", "ride", "shaker", "perc", "tom", "bell"]);
    const ss = rcScheduleStep;
    rcScheduleStep = function (n, t, sd) {
      const F = RC.fill;
      if (!F || n < F.from || n > F.to) return ss.apply(this, arguments);
      const swingT = n % 2 === 1 ? t + RCP.swing * sd * 0.5 : t;
      if (n === F.to) {   // the one after the fill: crash and kick on top of the pattern
        const r = ss.apply(this, arguments);
        if (F.cym != null) rcHit(F.cym, swingT, 1); if (F.kick != null && !RCP.tracks[F.kick].on[0]) rcHit(F.kick, swingT, 1);
        RC.fill = null; fillBtn.classList.remove("armed"); fillBtn.textContent = "Fill";
        return r;
      }
      // inside the fill: the kick keeps going, the rest make room
      const keep = RCP.tracks.map(tr => tr.mute);
      RCP.tracks.forEach(tr => { if (FILL_ROLES.has((rcSnd(tr.snd) || {}).role)) tr.mute = true; });
      let r; try { r = ss.apply(this, arguments); } finally { RCP.tracks.forEach((tr, i) => { tr.mute = keep[i]; }); }
      const k = n - F.from, L = F.to - F.from, vi = F.voices[Math.min(F.voices.length - 1, Math.floor(k / L * F.voices.length))], vel = 0.62 + 0.38 * (k / Math.max(1, L - 1));
      rcHit(vi, swingT, vel);
      if (k < L / 2 && (RCP.cplx || 0) > 0.5) rcHit(vi, swingT + sd / 2, vel * 0.8);   // busier fills double up the first half
      return r;
    };
  }
  { const rp = rcPlay; rcPlay = function (on) { if (!on) { RC.fill = null; fillBtn.classList.remove("armed"); fillBtn.textContent = "Fill"; } return rp.apply(this, arguments); }; }
  // ---------- sync to the DJ, said out loud ----------
  const syncEl = document.getElementById("rcSync"), syncTxt = document.getElementById("rcSyncTxt"), syncBtn = document.getElementById("rcSyncBtn");
  function rcDeckPlaying() { for (const d of DJ.decks) if (d && d.buf && d.playing && d.bpm0) return d; return null; }
  function rcPaintSync() {
    const f = rcFollow(), d = rcDeckPlaying();
    if (f) {
      syncEl.hidden = false; syncEl.classList.remove("off");
      syncTxt.textContent = (RC.playing ? "Synced to Deck " : "Will sync to Deck ") + "AB"[f.d.i] + " · " + f.bpm.toFixed(1) + " bpm · locked to its beat";
      syncBtn.textContent = "Unsync"; syncBtn.dataset.a = "off";
    } else if (d) {
      syncEl.hidden = false; syncEl.classList.add("off");
      syncTxt.textContent = "Deck " + "AB"[d.i] + " is playing at " + (djEff(d) * d.bend).toFixed(1) + " bpm";
      syncBtn.textContent = "Sync to it"; syncBtn.dataset.a = "on";
    } else syncEl.hidden = true;
    const djR = document.getElementById("djRhythm"); if (djR) djR.setAttribute("aria-pressed", String(RC.playing));
  }
  syncBtn.addEventListener("click", () => { const btn = document.getElementById("rcDj"); if ((syncBtn.dataset.a === "on") === (RCP.djLock === false)) btn.click(); rcPaintSync(); });
  { const pt = rcPaintTransport; rcPaintTransport = function () { const r = pt.apply(this, arguments); try { rcPaintSync(); } catch (e) {} return r; }; }
  setInterval(() => { if (!rcView.hidden || !djEl.hidden) rcPaintSync(); }, 700);
  document.getElementById("djRhythm").addEventListener("click", () => {
    start(); if (!ctx) return;
    if (RC.playing) { rcPlay(false); djMsg("Rhythm Creator stopped"); }
    else {
      if (RCP.djLock === false) { RCP.djLock = true; rcSave(); }
      rcPlay(true);
      const f = rcFollow(); djMsg(f ? "Rhythm Creator playing along, locked to Deck " + "AB"[f.d.i] + " · open it from Rhythm to change the beat" : "Rhythm Creator playing · start a deck and it locks to the song");
    }
    rcPaintSync();
  });
  { const r0 = rcRender; rcRender = function () { const r = r0.apply(this, arguments); try { rcPaintSig(); rcPaintSync(); } catch (e) {} return r; }; }
  rcPaintSig();

  // ---------- FX Lab: section bar, arrows and fades ----------
  {
    const nav = document.getElementById("labNav"), prev = document.getElementById("labPrev"), next = document.getElementById("labNext"), count = document.getElementById("labCount");
    labStrip.classList.add("hfade");
    const groups = () => [...labStrip.querySelectorAll(".labgrp")];
    function upd() {
      const max = labStrip.scrollWidth - labStrip.clientWidth, x = labStrip.scrollLeft;
      labStrip.style.setProperty("--fl", x > 2 ? "34px" : "0px"); labStrip.style.setProperty("--fr", max > 2 && x < max - 2 ? "34px" : "0px");
      prev.hidden = x <= 2; next.hidden = !(max > 2 && x < max - 2);
      const G = groups(); let cur = 0; G.forEach((g, k) => { if (g.offsetLeft - labStrip.offsetLeft <= x + 12) cur = k; });
      if (max > 2 && x >= max - 2) cur = G.length - 1;
      nav.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-selected", String(k === cur)));
      const on = G.filter(g => !g.classList.contains("off")).length;
      count.textContent = "· " + G.length + " effects" + (on ? ", " + on + " on" : ", all off");
    }
    function paintNav() {
      nav.innerHTML = "";
      groups().forEach(g => {
        const tg = g.querySelector(".labtg"), b = document.createElement("button"); b.setAttribute("role", "tab");
        b.innerHTML = "<i></i>"; b.append(tg.textContent.replace(/ · .*/, "").replace(/^LFO (\d).*/, "LFO $1")); b.classList.toggle("on", !g.classList.contains("off"));
        b.addEventListener("click", () => { labStrip.scrollTo({ left: g.offsetLeft - labStrip.offsetLeft - 4, behavior: "smooth" }); });
        nav.appendChild(b);
      });
      upd();
    }
    const step = dir => labStrip.scrollBy({ left: dir * Math.max(160, labStrip.clientWidth * 0.75), behavior: "smooth" });
    prev.addEventListener("click", () => step(-1)); next.addEventListener("click", () => step(1));
    labStrip.addEventListener("scroll", upd, { passive: true });
    try { new ResizeObserver(upd).observe(labStrip); } catch (e) {}
    new MutationObserver(() => paintNav()).observe(labStrip, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    // touching a slider in a section that's off turns the section on
    const wake = e => {
      const g = e.target.closest(".labgrp"); if (!g || !g.classList.contains("off") || !e.target.closest(".knobs")) return;
      g.querySelector(".labtg").click(); g.classList.remove("flash"); void g.offsetWidth; g.classList.add("flash");
    };
    labStrip.addEventListener("pointerdown", wake, true); labStrip.addEventListener("keydown", wake, true);
    paintNav();
  }

  // ---------- the live line: what you hear the changes on ----------
  {
    const lives = [...document.querySelectorAll(".fxlive")], heldFxBtn = document.getElementById("heldFx");
    const pickId = e => e === "lib" ? "inst" : e;
    const heldIds = () => [...new Set([...heldVoices.values()].map(v => pickId(v.engine || state.engine)))];
    const isOn = id => !!(FXC.by[id] ? FXC.by[id].on !== false : !["drum", "samp", "pads", "inst", "dj"].includes(id));
    function setRoute(id, on) {
      if (isOn(id) === on) return;
      const b = [...document.querySelectorAll("#fxPick button")].find(x => x.textContent === (id === "inst" ? "Lib & Inst" : fxcName(id)));
      if (b) b.click(); else { start(); fxcParams(id).on = on; fxcSave(); if (ctx) { fxcGet(id); applyFx(); } }
    }
    function paintLive() {
      const ids = heldIds(), n = heldCount(), fxIsOn = state.fx.on !== false;
      const allOn = ids.length && ids.every(isOn);
      heldFxBtn.hidden = !n; heldFxBtn.setAttribute("aria-pressed", String(!!allOn)); heldFxBtn.textContent = allOn ? "FX ✓" : "FX off";
      lives.forEach(el => {
        const where = el.dataset.where; el.innerHTML = ""; el.className = "fxlive";
        if (el.closest("[hidden]")) return;
        if (n) {
          const names = ids.map(fxcName).join(", ");
          el.classList.add(allOn && fxIsOn ? "live" : "clean");
          const dot = document.createElement("i"); dot.className = "fxl-dot";
          const t = document.createElement("span");
          t.textContent = !fxIsOn ? "Effects are switched off · held notes play clean" : allOn ? "Live on your " + n + " held note" + (n > 1 ? "s" : "") + " (" + names + ") · every change is heard right away" : "Your held notes (" + names + ") skip the effects";
          const b = document.createElement("button"); b.className = "btn"; b.setAttribute("aria-pressed", String(!!allOn));
          b.textContent = !fxIsOn ? "Switch FX on" : allOn ? "Effects on held notes ✓" : "Apply to held notes";
          b.addEventListener("click", () => { if (!fxIsOn) document.getElementById("fxOnBtn").click(); else ids.forEach(id => setRoute(id, !allOn)); paintLive(); });
          el.append(dot, t, b);
        } else {
          const t = document.createElement("span"); t.textContent = where === "lab" ? "Hold a chord, then move the sliders: you hear every change as you make it" : "Hold a chord to hear the effects change as you turn them";
          const b = document.createElement("button"); b.className = "btn"; b.textContent = "Hold a chord";
          b.addEventListener("click", () => {
            start(); if (!ctx) return;
            const base = 12 * (state.octave != null ? state.octave + 1 : 4);
            const keepC = chordType; if (chordType === "off") chordType = "maj";   // one held chord, at chord level
            try { if (!heldVoices.has(base)) toggleHeld(base); } finally { chordType = keepC; }
            updateHoldBtn();
          });
          el.append(t, b);
        }
      });
    }
    heldFxBtn.addEventListener("click", () => { const ids = heldIds(), allOn = ids.every(isOn); start(); ids.forEach(id => setRoute(id, !allOn)); paintLive(); });
    { const u = updateHoldBtn; updateHoldBtn = function () { const r = u.apply(this, arguments); try { paintLive(); } catch (e) {} return r; }; }
    { const sp = setPanel; setPanel = function () { const r = sp.apply(this, arguments); try { paintLive(); } catch (e) {} return r; }; }
    document.getElementById("fxPick").addEventListener("click", () => setTimeout(paintLive, 0));
    { const pf = paintFxState; paintFxState = function () { const r = pf.apply(this, arguments); try { paintLive(); } catch (e) {} return r; }; }
    paintLive();
  }

  // ======================================================================
  // what keeps sounding: Hold On/Off, Arp On, and a Still playing strip
  // ======================================================================
  {
    const carry = document.getElementById("carryBar"), items = document.getElementById("carryItems"), pArpB = document.getElementById("pArp");
    function holdLabel() {
      const n = heldCount(), narrow = innerWidth < 700;
      const t = narrow ? (state.hold ? "Hold ✓" + (n ? " " + n : "") : n ? "Held " + n : "Hold") : state.hold ? "Hold: On" + (n ? " · " + n : "") : n ? "Hold: Off · " + n + " ringing" : "Hold: Off";
      const tn = [...holdBtn.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
      if (tn) tn.textContent = t + " "; else if (!holdBtn.children.length) holdBtn.textContent = t; else holdBtn.prepend(document.createTextNode(t + " "));
      holdBtn.title = state.hold ? "Hold is on: notes keep sounding after you let go · tap to turn it off" : "Hold is off · tap so notes keep sounding after you let go";
    }
    { const u = updateHoldBtn; updateHoldBtn = function () { const r = u.apply(this, arguments); try { holdLabel(); paintCarry(); } catch (e) {} return r; }; }
    const arpHere = () => {
      if (ENGINES[state.engine]) return activeLayers().some(id => arpOn(id));
      try { return voiceComponents(state.engine).some(c => arpOn(c.key)); } catch (e) { return false; }
    };
    function paintArpTab() { const on = arpHere(); pArpB.classList.toggle("arp-on", on); const t = on ? "Arp: On" : "Arp"; if (pArpB.textContent !== t) pArpB.textContent = t; }
    let sig = "";
    function paintCarry(flash) {
      const list = [];
      PARTS.forEach(p => list.push(["arp", p, nbEngName(p.eng) + " arp", p.notes.slice().sort((a, b) => a - b).map(nbNoteName).join(" ")]));
      // held notes made with another synth: the held bar itself says so
      const other = [...heldVoices.values()].some(v => v.engine && v.engine !== state.engine);
      const hb = document.getElementById("heldBar"); hb.classList.toggle("carry", other);
      const hi = document.querySelector("#heldInfo i"); if (hi && other && !/^Still ringing/.test(hi.textContent)) hi.textContent = hi.textContent.replace(/^Held/, "Still ringing");
      const k = list.map(x => x[2] + x[3]).join("|");
      carry.hidden = !list.length;
      if (k !== sig) {
        sig = k; items.innerHTML = "";
        list.forEach(([kind, ref, name, sub]) => {
          const c = document.createElement("span"); c.className = "cb-item"; c.innerHTML = "<b></b><small></small>";
          c.querySelector("b").textContent = name; c.querySelector("small").textContent = sub;
          const b = document.createElement("button"); b.className = "btn"; b.textContent = kind === "arp" ? "■ Stop" : "Release";
          b.addEventListener("click", () => { if (kind === "arp") dropPart(ref, true); else { ref.forEach(([r]) => dropHeld(r)); updateHoldBtn(); } paintCarry(); });
          c.appendChild(b); items.appendChild(c);
        });
      }
      if (flash && list.length) { carry.classList.remove("flash"); void carry.offsetWidth; carry.classList.add("flash");
        const nb = document.getElementById("nowBar"); if (nb) { nb.classList.remove("carryflash"); void nb.offsetWidth; nb.classList.add("carryflash"); } }   // phones: the Playing bar at the top flashes instead
    }
    document.getElementById("carryStop").addEventListener("click", () => {
      PARTS.slice().forEach(p => dropPart(p, true));
      [...heldVoices.entries()].filter(([, v]) => v.engine && v.engine !== state.engine).forEach(([r]) => dropHeld(r));
      updateHoldBtn(); paintCarry();
    });
    let lastE = state.engine;
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); try { const sw = state.engine !== lastE; lastE = state.engine; paintArpTab(); holdLabel(); paintCarry(sw); } catch (e) {} return r; }; }
    setInterval(() => { try { paintCarry(); paintArpTab(); } catch (e) {} }, 600);
    holdLabel(); paintArpTab(); paintCarry();
  }

