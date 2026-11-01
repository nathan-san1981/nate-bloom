  // ======================================================================
  // Arpeggiator: every voice (each stacked engine, each library layer,
  // the instrument and the sampler) has its own arp settings
  // ======================================================================
  const ARP_MODES = [["up", "Up"], ["down", "Down"], ["updown", "Up & down"], ["random", "Random"], ["played", "As played"], ["chord", "Chord pulse"]];
  const ARP_RATES = [["1/4", 1], ["1/8", 0.5], ["1/8T", 1 / 3], ["1/16", 0.25], ["1/16T", 1 / 6], ["1/32", 0.125]];
  const arpDefault = () => ({ on: false, mode: "up", rate: "1/16", oct: 1, gate: 0.6 });
  function getArp(key) { if (!state.arp[key]) state.arp[key] = arpDefault(); return state.arp[key]; }
  const arpOn = key => !!(state.arp[key] && state.arp[key].on);

  // the separate sounds that make up what the keyboard plays right now
  function voiceComponents(eng = state.engine) {
    if (ENGINES[eng]) {
      const ids = activeLayers(), norm = 1 / Math.sqrt(ids.length);
      return ids.map(id => ({ key: id, name: ENGINES[id].name, accepts: () => true,
        make: (m, when, scale = 1) => makeVoice(m, id, state.layers[id].level * 1.25 * norm * scale, when) }));
    }
    if (eng === "lib") {
      return state.lib.parts.map((pt, i) => [pt, i]).filter(([pt, i]) => pt && pt.on && libInsts[i]).map(([pt, i]) => ({
        key: "lib" + i, name: pt.name, accepts: m => m >= pt.lo && m <= pt.hi,
        make: (m, when, scale = 1) => {
          const P = pt.sus ? Object.assign({}, state.lib.p, { decay: 1 }) : state.lib.p;
          if (!ctx) return makeInstVoice(m + 12 * (pt.oct || 0), when, scale * (pt.level ?? 0.8) * 1.25, libInsts[i], P);
          const k0 = LVK; LVK = "l:" + i;   // (the layer's own bus carries its fader, live)
          try { return makeInstVoice(m + 12 * (pt.oct || 0), when, scale * 0.8 * 1.25, libInsts[i], P); } finally { LVK = k0; }
        } }));
    }
    if (eng === "inst") return [{ key: "inst", name: curInst ? curInst.name : "Instrument", accepts: () => true, make: (m, when, scale = 1) => makeInstVoice(m, when, scale) }];
    if (eng === "samp") return [{ key: "samp", name: "Sampler", accepts: () => true, make: (m, when, scale = 1) => makeSampleVoice(m, state.samp.slot, when, scale) }];
    return [];
  }

  // keys play straight through, except for voices whose arp is on: those wait for the arp clock
  makeNote = function (root) {
    const tones = chordTones(root), scale = NB_VEL / Math.sqrt(tones.length), parts = [];
    for (const c of voiceComponents()) {
      if (arpOn(c.key)) continue;
      for (const m of tones) if (c.accepts(m)) { const v = c.make(m, undefined, scale); if (v) parts.push(v); }
    }
    return { tones, stop() { parts.forEach(x => x.stop()); } };
  };

  // notes the arp plays: everything held down plus anything latched with Hold
  function arpNotes(played) {
    const list = [];
    for (const v of voices.values()) for (const m of v.tones) if (!list.includes(m)) list.push(m);
    for (const v of heldVoices.values()) for (const m of v.tones) if (!list.includes(m)) list.push(m);
    return played ? list : list.slice().sort((a, b) => a - b);
  }
  function arpSequence(cfg, notes) {
    const base = [];
    for (let o = 0; o < cfg.oct; o++) for (const n of notes) base.push(n + 12 * o);
    if (cfg.mode === "down") return base.slice().reverse();
    if (cfg.mode === "updown") return base.length > 2 ? base.concat(base.slice(1, -1).reverse()) : base;
    return base;
  }

  let arpAnchor = null, arpFree = null, arpTimer = 0;
  const arpRun = {};   // per voice: { step, next }
  {
    const origStart = startSeq;
    startSeq = function () { if (ctx && !playing) arpAnchor = ctx.currentTime + 0.06; origStart(); };
  }
  function arpTick() {
    if (!ctx) return;
    const arpEng = ["drum", "pads"].includes(state.engine) ? (state.melodic || "saw") : state.engine;
    const now = ctx.currentTime, comps = voiceComponents(arpEng).filter(c => arpOn(c.key));
    const live = new Set(comps.map(c => c.key));
    for (const k in arpRun) if (!live.has(k)) delete arpRun[k];
    const sorted = arpNotes(false), played = arpNotes(true);
    if (!sorted.length) { for (const k in arpRun) delete arpRun[k]; arpFree = null; return; }
    for (const c of comps) {
      const cfg = getArp(c.key);
      const notesS = sorted.filter(c.accepts), notesP = played.filter(c.accepts);
      if (!notesS.length) { delete arpRun[c.key]; continue; }
      const dur = 60 / state.seq.bpm * (ARP_RATES.find(r => r[0] === cfg.rate) || ARP_RATES[3])[1];
      let run = arpRun[c.key];
      if (!run) {
        // line up with the sequencer when it is playing, otherwise start right away
        let next;
        if (playing && arpAnchor != null) next = arpAnchor + Math.ceil((now + 0.005 - arpAnchor) / dur) * dur;
        else { if (arpFree == null) arpFree = now + 0.01; next = arpFree + Math.ceil(Math.max(0, now + 0.005 - arpFree) / dur) * dur; }
        run = arpRun[c.key] = { step: 0, next };
      }
      if (run.next < now - 0.05) { const k = Math.ceil((now - run.next) / dur); run.next += k * dur; run.step += k; }   // back from the background: resume on the grid
      while (run.next < now + 0.1) {
        const t = run.next, len = Math.max(0.03, dur * cfg.gate);
        let hits;
        if (cfg.mode === "chord") hits = notesS.map(n => n + 12 * (run.step % cfg.oct));
        else if (cfg.mode === "random") { const seq = arpSequence(cfg, notesS); hits = [seq[Math.floor(Math.random() * seq.length)]]; }
        else { const seq = arpSequence(cfg, cfg.mode === "played" ? notesP : notesS); hits = [seq[run.step % seq.length]]; }
        const scale = 1 / Math.sqrt(hits.length);
        for (const m of hits) { const v = c.make(m, t, scale); if (v) v.stop(t + len); flashArpKey(m, t, len); }
        run.step++; run.next += dur;
      }
    }
  }
  function flashArpKey(m, t, len) {
    const el = keyEls.get(m); if (!el) return;
    const d = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => { el.classList.add("arphit"); setTimeout(() => el.classList.remove("arphit"), Math.max(60, len * 1000)); }, d);
  }
  function arpClock() {
    const any = Object.values(state.arp).some(a => a && a.on);
    if (any && !arpTimer) arpTimer = setInterval(arpTick, 25);
    if (!any && arpTimer) { clearInterval(arpTimer); arpTimer = 0; }
  }

  // ---------- Arp panel ----------
  const arpVoicesEl = document.getElementById("arpVoices"), arpOnBtn = document.getElementById("arpOn");
  const arpModeSel = document.getElementById("arpMode"), arpRateSel = document.getElementById("arpRate");
  const arpOctEl = document.getElementById("arpOct"), arpGate = document.getElementById("arpGate"), arpHint = document.getElementById("arpHint");
  ARP_MODES.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; arpModeSel.appendChild(o); });
  ARP_RATES.forEach(([v]) => { const o = document.createElement("option"); o.value = v; o.textContent = v; arpRateSel.appendChild(o); });
  let arpSel = null;
  function renderArpPanel() {
    const comps = voiceComponents();
    arpVoicesEl.innerHTML = "";
    const ctl = document.getElementById("arpCtl");
    if (!comps.length) {
      ctl.hidden = true;
      arpHint.textContent = "pick a synth, library sound, instrument or sampler";
      return;
    }
    ctl.hidden = false;
    if (!comps.some(c => c.key === arpSel)) arpSel = comps[0].key;
    arpHint.textContent = comps.length > 1 ? "each sound has its own arp" : "tap Arp on, then hold keys";
    comps.forEach(c => {
      const b = document.createElement("button"); b.className = "chip arpchip"; b.dataset.key = c.key;
      b.setAttribute("aria-pressed", String(c.key === arpSel));
      b.innerHTML = '<span class="arpdot"></span><span></span>';
      b.lastChild.textContent = c.name;
      b.classList.toggle("armed", arpOn(c.key));
      b.addEventListener("click", () => { arpSel = c.key; renderArpPanel(); });
      arpVoicesEl.appendChild(b);
    });
    const cfg = getArp(arpSel);
    arpOnBtn.setAttribute("aria-pressed", String(cfg.on)); arpOnBtn.textContent = cfg.on ? "Arp on" : "Arp off";
    arpModeSel.value = cfg.mode; arpRateSel.value = cfg.rate;
    arpOctEl.textContent = cfg.oct + (cfg.oct > 1 ? " oct" : " oct");
    arpGate.value = Math.round(cfg.gate * 100);
  }
  const arpChange = fn => { if (!arpSel) return; fn(getArp(arpSel)); save(); arpClock(); renderArpPanel(); };
  arpOnBtn.addEventListener("click", () => arpChange(c => {
    c.on = !c.on;
    // notes already ringing for this voice keep ringing; new presses follow the arp
  }));
  arpModeSel.addEventListener("change", () => arpChange(c => { c.mode = arpModeSel.value; }));
  arpRateSel.addEventListener("change", () => arpChange(c => { c.rate = arpRateSel.value; }));
  document.getElementById("arpOctDn").addEventListener("click", () => arpChange(c => { c.oct = Math.max(1, c.oct - 1); }));
  document.getElementById("arpOctUp").addEventListener("click", () => arpChange(c => { c.oct = Math.min(4, c.oct + 1); }));
  arpGate.addEventListener("input", () => { if (arpSel) { getArp(arpSel).gate = arpGate.value / 100; save(); } });
  document.getElementById("pArp").addEventListener("click", () => setPanel("arp"));
  {
    const origBar = updateSoundBar;
    updateSoundBar = function () { origBar(); renderArpPanel(); };
  }
  arpClock();
  renderArpPanel();


  // ======================================================================
  // Mixer: one place to set the volume of every sound
  // ======================================================================
  const mxEl = document.getElementById("mixer"), mxList = document.getElementById("mxList");
  function mixChannels() {
    const ch = [];
    const add = (group, name, sub, get, set, dflt, live) => ch.push({ group, name, sub, get, set, dflt, live });
    add("Master", "Master volume", "everything you hear", () => state.fx.volume, v => { state.fx.volume = v; applyFx(); }, 0.7, true);
    ch[ch.length - 1].law = 2;
    const synthNow = ENGINES[state.engine] || !!(state.stack && state.stack.syn);
    for (const [id, e] of Object.entries(ENGINES)) {
      const on = synthNow && state.layers[id].on;
      add("Synths", e.name, on ? "playing now" : e.after, () => state.layers[id].level, v => { state.layers[id].level = v; }, 0.8);
    }
    state.lib.parts.forEach((pt, i) => { if (pt && pt.id) add("Library layers", pt.name, "layer " + (i + 1) + (pt.on ? "" : " · off"), () => pt.level ?? 0.8, v => { pt.level = v; }, 0.8); });
    if (state.inst.cur) add("Instrument", curInst ? curInst.name : "My instrument", "Inst tab", () => state.inst.p.level, v => { state.inst.p.level = v; }, 0.8);
    state.samp.slots.forEach((sl, i) => { if (sampBuf[i]) add("Sampler", "S" + (i + 1) + " · " + baseName(sl.name), sl.mode, () => sl.p.level, v => { sl.p.level = v; }, 0.8); });
    add("Drums", "All drums", "the Drums tab (the Rhythm Creator has its own fader)", () => state.drum.level, v => { state.drum.level = v; applyDrum(); }, 0.85, true);
    DRUMS.forEach(([id, code, name]) => add("Drums", name, code, () => state.drumPads[id].vol, v => { state.drumPads[id].vol = v; }, 0.8, true));
    for (let k = 0; k < NPADS; k++) if (padBuf[k]) add("Pads", "P" + (k + 1) + " · " + baseName(state.pads.names[k]), "sample pad", () => state.pads.p[k].level, v => { state.pads.p[k].level = v; }, 0.8, true);
    return ch;
  }
  const mxLevel = (pos, law) => Math.pow(Math.max(0, Math.min(100, +pos)) / 100, 3 / (law || 1));
  const mxPos = (lv, law) => Math.max(lv > 0 ? 1 : 0, Math.min(100, Math.round(100 * Math.pow(Math.max(0, +lv || 0), (law || 1) / 3))));
  const mxDb = (lv, ref, law) => { if (!(lv > 0)) return "off"; const d = 20 * (law || 1) * Math.log10(lv / (ref || 0.8)); return Math.abs(d) < 0.5 ? "0 dB" : (d > 0 ? "+" : "−") + Math.abs(d).toFixed(Math.abs(d) < 9.5 ? 1 : 0) + " dB"; };
  function renderMixer() {
    mxList.innerHTML = "";
    let group = "";
    mixChannels().forEach((c, n) => {
      if (c.group !== group) {
        const h = document.createElement("div"); h.className = "bt-style"; h.textContent = c.group; mxList.appendChild(h); group = c.group;
      }
      const row = document.createElement("div"); row.className = "mx-row";
      const lab = document.createElement("div"); lab.className = "mx-lab";
      lab.innerHTML = "<b></b><small></small>";
      lab.querySelector("b").textContent = c.name; lab.querySelector("small").textContent = c.sub;
      const val = document.createElement("span"); val.className = "mx-val";
      const r = document.createElement("input"); r.type = "range"; r.min = 0; r.max = 100; r.id = "mx" + n;
      r.setAttribute("aria-label", c.name + " volume");
      const show = () => { val.textContent = r.value == 0 ? "off" : mxDb(mxLevel(r.value, c.law), c.dflt, c.law); row.classList.toggle("muted", r.value == 0); r.setAttribute("aria-valuetext", val.textContent); };
      r.value = mxPos(c.get(), c.law); show();
      r.addEventListener("input", () => { c.set(mxLevel(r.value, c.law)); show(); save(); });
      r.addEventListener("dblclick", () => { c.set(c.dflt); r.value = mxPos(c.dflt, c.law); show(); save(); });
      row.append(lab, r, val);
      mxList.appendChild(row);
    });
  }
  function openMixer() { mxEl.hidden = false; renderMixer(); mxList.scrollTop = 0; }
  function closeMixer() { mxEl.hidden = true; renderEngine(); }
  document.getElementById("mixBtn").addEventListener("click", openMixer);
  document.getElementById("mxDone").addEventListener("click", closeMixer);
  let mxArm = 0;
  const mxReset = document.getElementById("mxReset");
  mxReset.addEventListener("click", () => {
    if (!mxArm) { mxReset.textContent = "Reset all?"; mxArm = setTimeout(() => { mxArm = 0; mxReset.textContent = "Reset levels"; }, 2500); return; }
    clearTimeout(mxArm); mxArm = 0; mxReset.textContent = "Reset levels";
    mixChannels().forEach(c => c.set(c.dflt));
    save(); renderMixer();
  });


  // ======================================================================
  // Notation pad: write a melody on a grand staff. It loops with the
  // sequencer clock and plays through whatever sound is selected.
  // Two ways in: scDrag on the staff to choose a pitch, or play the keys
  // below to type notes in at the cursor.
  // ======================================================================
  const notesArea = document.getElementById("notesArea");
  const scSvg = document.getElementById("scSvg"), scHead = document.getElementById("scHead"), scScroll = document.getElementById("scScroll");
  const scInfo = document.getElementById("scInfo");
  const SC_KEYS = [["C", "C / Am", 0], ["G", "G / Em", 1], ["D", "D / Bm", 2], ["A", "A / F♯m", 3], ["E", "E / C♯m", 4],
    ["F", "F / Dm", -1], ["Bb", "B♭ / Gm", -2], ["Eb", "E♭ / Cm", -3], ["Ab", "A♭ / Fm", -4]];
  const scDefault = () => ({ bars: 4, key: "C", notes: [], level: 0.8 });
  {
    let sc = null;
    try { const sv = JSON.parse(localStorage.getItem("nightbloom") || "null"); sc = sv && sv.seq && sv.seq.score; } catch (e) {}
    const S = Object.assign(scDefault(), sc && typeof sc === "object" ? sc : {});
    S.bars = Math.min(16, Math.max(1, (S.bars | 0) || 4));
    if (!SC_KEYS.some(k => k[0] === S.key)) S.key = "C";
    S.notes = Array.isArray(S.notes) ? S.notes.filter(n => n && ["b", "s", "d", "m", "dia"].every(k => Number.isFinite(n[k]))) : [];
    if (!Number.isFinite(S.level)) S.level = 0.8;
    state.seq.score = S;
  }
  const SC = () => state.seq.score;

  // ---------- pitch spelling ----------
  const LET_PC = [0, 2, 4, 5, 7, 9, 11], LET_NAME = "CDEFGAB";
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
  const keyCount = () => (SC_KEYS.find(x => x[0] === SC().key) || SC_KEYS[0])[2];
  function keyAccs() {
    const k = keyCount(), a = [0, 0, 0, 0, 0, 0, 0];
    if (k > 0) SHARP_ORDER.slice(0, k).forEach(i => { a[i] = 1; });
    if (k < 0) FLAT_ORDER.slice(0, -k).forEach(i => { a[i] = -1; });
    return a;
  }
  const letterOf = dia => ((dia % 7) + 7) % 7;
  const diaMidi = dia => 12 * (Math.floor(dia / 7) + 1) + LET_PC[letterOf(dia)];   // C4 (dia 28) = 60
  function spell(m) {
    const acc = keyAccs(), k = keyCount(), pc = ((m % 12) + 12) % 12;
    let best = null;
    for (let L = 0; L < 7; L++) for (const a of [0, 1, -1]) {
      if ((((LET_PC[L] + a) % 12) + 12) % 12 !== pc) continue;
      const sc = a === acc[L] ? 0 : a === 0 ? 1 : (a > 0) === (k >= 0) ? 2 : 3;
      if (!best || sc < best.sc) best = { L, a, sc };
    }
    return (Math.floor((m - best.a) / 12) - 1) * 7 + best.L;
  }
  function shownAcc(n) {
    const a = n.m - diaMidi(n.dia);
    if (a === keyAccs()[letterOf(n.dia)]) return "";
    return a === 0 ? "♮" : a === 1 ? "♯" : a === -1 ? "♭" : a === 2 ? "𝄪" : "𝄫";
  }
  function pitchName(m, dia) {
    const a = m - diaMidi(dia);
    return LET_NAME[letterOf(dia)] + (a === 1 ? "♯" : a === -1 ? "♭" : a === 2 ? "𝄪" : a === -2 ? "𝄫" : "") + Math.floor(dia / 7);
  }

  // ---------- geometry ----------
  const HALF = 5, TOPDIA = 44, LOWDIA = 14, RULER = 16, Y0 = RULER + 6, SW = 18, BARPAD = 10;
  const yOf = dia => Y0 + (TOPDIA - dia) * HALF;
  const SC_H = yOf(LOWDIA) + 8;
  const barW = () => stepsNow() * SW + BARPAD;
  const barX = b => b * barW() + 6;
  const DUR_NAMES = { 1: "sixteenth", 2: "eighth", 3: "dotted eighth", 4: "quarter", 6: "dotted quarter", 8: "half", 12: "dotted half", 16: "whole", 24: "dotted whole" };

  // ---------- editing state ----------
  const scEd = { dur: 4, dot: false, acc: null, cursor: 0, last: { t: 0, pos: 0 }, undo: [] };
  const curDur = () => scEd.dur * (scEd.dot ? 1.5 : 1);
  const absOf = n => n.b * stepsNow() + n.s;
  {
    const S = SC(), st = stepsNow();
    scEd.cursor = S.notes.reduce((mx, n) => Math.max(mx, n.b * st + n.s + n.d), 0);
    if (scEd.cursor >= S.bars * st) scEd.cursor = 0;
  }
  let scWriteOn = false;
  {
    const wb = document.getElementById("scWrite");
    wb.addEventListener("click", () => {
      scWriteOn = !scWriteOn; wb.setAttribute("aria-pressed", String(scWriteOn)); scEd.last.t = 0;
      scInfo.textContent = scWriteOn ? "keys now write at the cursor" : "keys just play";
    });
  }
  const visibleNote = n => n.b < SC().bars && n.s < stepsNow();
  const prVelGain = n => n.v == null ? 1 : Math.min(1.3, Math.pow(Math.max(1, n.v) / 100, 1.2));
  const scSnapS = () => JSON.stringify({ notes: SC().notes, bars: SC().bars, key: SC().key, cursor: scEd.cursor });
  function scPush(before) { const u = scEd.undo; if (u[u.length - 1] === before) return; u.push(before); if (u.length > 60) u.shift(); }
  function scPut(snap) {
    const o = JSON.parse(snap), S = SC();
    S.notes = o.notes; S.bars = o.bars; if (o.key) S.key = o.key; scEd.cursor = Math.min(o.cursor || 0, S.bars * stepsNow() - 1); scEd.last.t = 0;
    const ks = document.getElementById("scKey"); if (ks) ks.value = S.key;
    save(); renderHead(); scRender(); scrollToCursor();
  }

  // ---------- drawing ----------
  function glyph(x, cy, d, up, color, filledOverride) {
    // closest written value at or below the length
    const vals = [24, 16, 12, 8, 6, 4, 3, 2, 1];
    const v = vals.find(q => q <= d) || 1;
    const hollow = v >= 8, stem = v < 16, flags = v <= 1 ? 2 : v <= 3 ? 1 : 0, dot = [3, 6, 12, 24].includes(v);
    let out = `<ellipse cx="${x}" cy="${cy}" rx="5.4" ry="3.9" transform="rotate(-22 ${x} ${cy})" fill="${hollow && !filledOverride ? "none" : color}" stroke="${color}" stroke-width="${hollow ? 1.6 : 1}"/>`;
    if (stem) {
      const sx = up ? x + 4.8 : x - 4.8, ey = up ? cy - 28 : cy + 28;
      out += `<line x1="${sx}" y1="${cy + (up ? -1 : 1)}" x2="${sx}" y2="${ey}" stroke="${color}" stroke-width="1.3"/>`;
      for (let f = 0; f < flags; f++) {
        const fy = ey + (up ? f * 6 : -f * 6);
        out += up ? `<path d="M${sx} ${fy} c1 5 8 7 7 14" fill="none" stroke="${color}" stroke-width="1.6"/>`
                  : `<path d="M${sx} ${fy} c1 -5 8 -7 7 -14" fill="none" stroke="${color}" stroke-width="1.6"/>`;
      }
    }
    if (dot) out += `<circle cx="${x + 9}" cy="${cy - 1.5}" r="1.6" fill="${color}"/>`;
    return out;
  }
  const stemUp = dia => (dia >= 28 ? dia < 34 : dia < 22);
  function ledgers(x, dia, color) {
    let out = "";
    const line = d => { out += `<line x1="${x - 9}" x2="${x + 9}" y1="${yOf(d)}" y2="${yOf(d)}" stroke="${color}" stroke-width="1"/>`; };
    for (let d = 40; d <= dia; d += 2) line(d);
    if (dia === 28) line(28);
    for (let d = 16; d >= dia; d -= 2) line(d);
    return out;
  }
  const staffLines = (x1, x2) => [30, 32, 34, 36, 38, 18, 20, 22, 24, 26]
    .map(d => `<line x1="${x1}" x2="${x2}" y1="${yOf(d)}" y2="${yOf(d)}" stroke="var(--sc-line)" stroke-width="1"/>`).join("");

  function renderHead() {
    const k = keyCount(), n = Math.abs(k), w = 38 + n * 8 + 4;
    let s = staffLines(0, w);
    s += `<line x1="1" x2="1" y1="${yOf(38)}" y2="${yOf(18)}" stroke="var(--sc-line)" stroke-width="1.5"/>`;
    s += `<text x="3" y="${yOf(31) + 9}" font-size="40" fill="var(--ink)" class="sc-clef">𝄞</text>`;
    s += `<text x="4" y="${yOf(24) + 6}" font-size="27" fill="var(--ink)" class="sc-clef">𝄢</text>`;
    const tr = k > 0 ? [38, 35, 39, 36, 33, 37, 34] : [34, 37, 33, 36, 32, 35, 31];
    for (let i = 0; i < n; i++) for (const off of [0, -14]) {
      const x = 38 + i * 8, y = yOf(tr[i] + off);
      s += `<text x="${x}" y="${y + 4}" font-size="13" text-anchor="middle" fill="var(--ink)">${k > 0 ? "♯" : "♭"}</text>`;
    }
    scHead.setAttribute("width", w); scHead.setAttribute("height", SC_H);
    scHead.setAttribute("viewBox", `0 0 ${w} ${SC_H}`);
    scHead.innerHTML = s;
  }

  let scGhost = null, playX = null;
  function scRender() {
    const S = SC(), st = stepsNow(), bw = barW(), total = barX(S.bars) + 6;
    const beats = beatStarts();
    let s = `<rect x="0" y="0" width="${total}" height="${RULER}" fill="var(--sc-ruler)"/>`;
    s += staffLines(0, total);
    for (let b = 0; b < S.bars; b++) {
      const x = barX(b);
      s += `<text x="${x + 3}" y="${RULER - 4}" font-size="10" fill="var(--dim)" class="sc-num">${b + 1}</text>`;
      for (const bs of beats) if (bs > 0) s += `<line x1="${x + bs * SW}" x2="${x + bs * SW}" y1="${yOf(42)}" y2="${yOf(16)}" stroke="var(--sc-beat)" stroke-width="1" stroke-dasharray="2 3"/>`;
      s += `<line x1="${x + st * SW + BARPAD / 2}" x2="${x + st * SW + BARPAD / 2}" y1="${yOf(38)}" y2="${yOf(18)}" stroke="var(--sc-line)" stroke-width="${b === S.bars - 1 ? 3 : 1.2}"/>`;
    }
    // length bars behind the notes, then the notes
    const notes = S.notes.filter(visibleNote);
    for (const n of notes) {
      const x = barX(n.b) + n.s * SW;
      s += `<rect x="${x + 2}" y="${yOf(n.dia) - 4}" width="${Math.max(6, n.d * SW - 4)}" height="8" rx="4" fill="var(--sc-len)"/>`;
    }
    for (const n of notes) {
      const x = barX(n.b) + n.s * SW + SW / 2, cy = yOf(n.dia);
      s += ledgers(x, n.dia, "var(--sc-line)");
      const acc = shownAcc(n);
      if (acc) s += `<text x="${x - 12}" y="${cy + 4}" font-size="13" text-anchor="middle" fill="var(--ink)">${acc}</text>`;
      s += `<g class="sc-note">${glyph(x, cy, n.d, stemUp(n.dia), "var(--ink)")}</g>`;
    }
    // cursor
    const cb = Math.floor(scEd.cursor / st), cs = scEd.cursor % st;
    if (cb < S.bars) {
      const cx = barX(cb) + cs * SW + 1;
      s += `<rect x="${cx - 1}" y="${RULER}" width="3" height="${SC_H - RULER}" fill="var(--amber)" opacity="0.75" rx="1.5"/>`;
      s += `<path d="M${cx - 5} 0 h13 l-6.5 7 z" fill="var(--amber)"/>`;
    }
    if (scGhost) {
      const x = barX(scGhost.b) + scGhost.s * SW + SW / 2, cy = yOf(scGhost.dia);
      s += `<rect x="${x - SW / 2 + 2}" y="${cy - 4}" width="${Math.max(6, scGhost.d * SW - 4)}" height="8" rx="4" fill="var(--lilac)" opacity="0.35"/>`;
      s += ledgers(x, scGhost.dia, "var(--lilac)");
      const acc = shownAcc(scGhost);
      if (acc) s += `<text x="${x - 12}" y="${cy + 4}" font-size="13" text-anchor="middle" fill="var(--lilac)">${acc}</text>`;
      s += glyph(x, cy, scGhost.d, stemUp(scGhost.dia), "var(--lilac)");
      s += `<rect x="${x - 22}" y="${Math.max(RULER + 1, cy - 30)}" width="44" height="16" rx="8" fill="var(--lilac)"/>`;
      s += `<text x="${x}" y="${Math.max(RULER + 1, cy - 30) + 12}" font-size="10.5" text-anchor="middle" fill="var(--panel)" font-weight="700">${pitchName(scGhost.m, scGhost.dia)}</text>`;
    }
    s += `<line id="scPlay" x1="0" x2="0" y1="${RULER}" y2="${SC_H}" stroke="var(--lilac)" stroke-width="2" opacity="0"/>`;
    scSvg.setAttribute("width", total); scSvg.setAttribute("height", SC_H);
    scSvg.setAttribute("viewBox", `0 0 ${total} ${SC_H}`);
    scSvg.innerHTML = s;
    playX = scSvg.querySelector("#scPlay");
    document.getElementById("scBars").textContent = S.bars + (S.bars === 1 ? " bar" : " bars");
    if (!scGhost) scInfo.textContent = notes.length ? notes.length + (notes.length === 1 ? " note" : " notes") + " · tap one to erase" : "drag on the staff · ✎ Keys to type notes";
  }
  function scrollToCursor() {
    const x = barX(Math.floor(scEd.cursor / stepsNow())) + (scEd.cursor % stepsNow()) * SW;
    const v = scScroll;
    if (x < v.scrollLeft + 20 || x > v.scrollLeft + v.clientWidth - 40) v.scrollLeft = Math.max(0, x - v.clientWidth / 3);
  }

  // ---------- adding and removing ----------
  function preview(m) {
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    melodicVoices(m, t, 0.8).forEach(v => v.stop(t + 0.28));
  }
  function moveCursor(abs) {
    const S = SC(), st = stepsNow();
    if (abs >= S.bars * st) { if (S.bars < 16 && abs < 16 * st) { S.bars = Math.ceil((abs + 1) / st); } else abs = 0; }
    scEd.cursor = abs;
  }
  function addAt(abs, ms, dias) {
    const before = scSnapS();
    const S = SC(), st = stepsNow(), b = Math.floor(abs / st), s = abs % st;
    if (b >= 16) return null;
    if (b >= S.bars) S.bars = b + 1;
    const d = Math.max(1, Math.min(curDur(), st - s)), added = [];
    ms.forEach((m, i) => {
      if (S.notes.some(n => n.b === b && n.s === s && n.m === m)) return;
      const n = { b, s, d, m, dia: dias ? dias[i] : spell(m) };
      S.notes.push(n); added.push(n);
    });
    if (added.length) scPush(before);
    moveCursor(abs + d);
    save();
    return d;
  }
  function removeNote(n) {
    const S = SC(), i = S.notes.indexOf(n);
    if (i < 0) return;
    scPush(scSnapS());
    S.notes.splice(i, 1);
    save();
  }
  function noteAt(b, s, dia) {
    let best = null, bd = 99;
    for (const n of SC().notes) {
      if (!visibleNote(n) || n.b !== b) continue;
      const dx = Math.abs(n.s - s), dy = Math.abs(n.dia - dia);
      if (dx <= 0.6 && dy <= 1 && dx + dy < bd) { best = n; bd = dx + dy; }
    }
    return best;
  }

  // step entry from the keyboard: each key press writes a note at the cursor
  // and moves on; keys pressed together land on the same spot as a chord
  {
    const origOn = noteOn;
    noteOn = function (midi) {
      origOn(midi);
      if (state.mode !== "notes" || !ctx || !scWriteOn) return;
      const now = performance.now(), tones = chordTones(midi);
      const together = now - scEd.last.t < 140;
      const pos = together ? scEd.last.pos : scEd.cursor;
      const keepCursor = scEd.cursor;
      addAt(pos, tones);
      if (together) scEd.cursor = Math.max(keepCursor, scEd.cursor);
      scEd.last = { t: now, pos };
      scRender(); scrollToCursor();
    };
  }

  // ---------- touch on the staff ----------
  let scDrag = null;
  function pointAt(ev) {
    const r = scSvg.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const st = stepsNow(), bw = barW();
    const b = Math.max(0, Math.min(SC().bars - 1, Math.floor((x - 6) / bw)));
    const raw = Math.max(0, Math.min(st - 1, Math.floor((x - barX(b)) / SW)));
    const dia = Math.max(LOWDIA, Math.min(TOPDIA - 1, Math.round(TOPDIA - (y - Y0) / HALF)));
    return { x, y, b, raw, dia };
  }
  function snapStep(raw) {
    let q = Math.min(scEd.dur, 4);
    if (q === 4 && meterOf(state.seq.meter)[1].includes(6)) q = 2;
    return Math.floor(raw / q) * q;
  }
  function ghostFor(p) {
    const s = snapStep(p.raw), L = letterOf(p.dia);
    const a = scEd.acc != null ? scEd.acc : keyAccs()[L];
    return { b: p.b, s, dia: p.dia, m: diaMidi(p.dia) + a, d: Math.max(1, Math.min(curDur(), stepsNow() - s)) };
  }
  scSvg.addEventListener("pointerdown", ev => {
    if (ev.button > 0) return;
    const p = pointAt(ev);
    if (p.y < RULER + 2) {   // the strip along the top moves the cursor
      scEd.cursor = p.b * stepsNow() + snapStep(p.raw); scEd.last.t = 0; scRender(); return;
    }
    scDrag = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, hit: noteAt(p.b, p.raw, p.dia), moved: false };
    try { scSvg.setPointerCapture(ev.pointerId); } catch (e) {}
    if (!scDrag.hit) { scGhost = ghostFor(p); preview(scGhost.m); scInfo.textContent = pitchName(scGhost.m, scGhost.dia) + " · " + DUR_NAMES[curDur()] + " · lift to place"; scRender(); }
  });
  scSvg.addEventListener("pointermove", ev => {
    if (!scDrag || ev.pointerId !== scDrag.id) return;
    if (Math.abs(ev.clientY - scDrag.y0) > 5 || Math.abs(ev.clientX - scDrag.x0) > 8) scDrag.moved = true;
    if (scDrag.hit && !scDrag.moved) return;
    const g = ghostFor(pointAt(ev));
    if (!scGhost || g.m !== scGhost.m || g.dia !== scGhost.dia || g.s !== scGhost.s || g.b !== scGhost.b) {
      if (!scGhost || g.m !== scGhost.m) preview(g.m);
      scGhost = g;
      scInfo.textContent = pitchName(g.m, g.dia) + " · " + DUR_NAMES[curDur()] + " · lift to place";
      scRender();
    }
  });
  function endDrag(ev, cancel) {
    if (!scDrag || ev.pointerId !== scDrag.id) return;
    const d = scDrag; scDrag = null;
    if (!cancel) {
      if (d.hit && !d.moved) removeNote(d.hit);
      else if (scGhost) { addAt(scGhost.b * stepsNow() + scGhost.s, [scGhost.m], [scGhost.dia]); scEd.acc = null; paintTools(); }
    }
    scGhost = null; scRender();
  }
  scSvg.addEventListener("pointerup", ev => endDrag(ev, false));
  scSvg.addEventListener("pointercancel", ev => endDrag(ev, true));

  // ---------- toolbar ----------
  const durBtns = [...document.querySelectorAll("#scDurs button")];
  durBtns.forEach(b => {
    const d = +b.dataset.d;
    b.innerHTML = `<svg width="18" height="26" viewBox="0 0 18 26" aria-hidden="true">${glyph(7, 20, d, true, "currentColor")}</svg>`;
    b.addEventListener("click", () => { scEd.dur = d; if (d === 16 && scEd.dot && stepsNow() < 24) scEd.dot = false; paintTools(); scRender(); });
  });
  const dotBtn = document.getElementById("scDot");
  dotBtn.addEventListener("click", () => { scEd.dot = !scEd.dot; paintTools(); });
  const accBtns = [...document.querySelectorAll("#scAccs button")];
  accBtns.forEach(b => b.addEventListener("click", () => { const a = +b.dataset.a; scEd.acc = scEd.acc === a ? null : a; paintTools(); }));
  function paintTools() {
    durBtns.forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.d === scEd.dur)));
    dotBtn.setAttribute("aria-pressed", String(scEd.dot));
    accBtns.forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.a === scEd.acc)));
  }
  document.getElementById("scRest").addEventListener("click", () => {
    const st = stepsNow(), s = scEd.cursor % st;
    scPush(scSnapS());
    moveCursor(scEd.cursor + Math.max(1, Math.min(curDur(), st - s))); scEd.last.t = 0;
    scRender(); scrollToCursor(); save();
  });
  document.getElementById("scUndo").addEventListener("click", () => {
    const u = scEd.undo.pop(); if (!u) return;
    scPut(u);
  });
  const keySel = document.getElementById("scKey");
  SC_KEYS.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; keySel.appendChild(o); });
  keySel.value = SC().key;
  keySel.addEventListener("change", () => {
    scPush(scSnapS()); SC().key = keySel.value;
    SC().notes.forEach(n => { n.dia = spell(n.m); });
    save(); renderHead(); scRender();
  });
  document.getElementById("scBarsDn").addEventListener("click", () => {
    const S = SC(); if (S.bars <= 1) return; scPush(scSnapS()); S.bars--;
    if (scEd.cursor >= S.bars * stepsNow()) scEd.cursor = 0;
    save(); scRender();
  });
  document.getElementById("scBarsUp").addEventListener("click", () => { const S = SC(); if (S.bars < 16) { scPush(scSnapS()); S.bars++; save(); scRender(); } });
  let scArm = 0;
  const scClear = document.getElementById("scClear");
  scClear.addEventListener("click", () => {
    if (!SC().notes.length) return;
    if (!scArm) { scClear.textContent = "Sure?"; scArm = setTimeout(() => { scArm = 0; scClear.textContent = "Clear"; }, 2500); return; }
    clearTimeout(scArm); scArm = 0; scClear.textContent = "Clear";
    scPush(scSnapS());
    SC().notes = []; scEd.cursor = 0;
    save(); scRender(); scScroll.scrollLeft = 0;
  });
  meterSel.addEventListener("change", () => { scEd.cursor = Math.min(scEd.cursor, SC().bars * stepsNow() - 1); scRender(); });

  // ---------- playback: rides along with the sequencer clock ----------
  let scBar = 0, scFresh = true;
  const scQueue = [];
  {
    const o = startSeq;
    startSeq = function () { if (!playing) { scFresh = true; scQueue.length = 0; } o(); };
    const os = stopSeq;
    stopSeq = function () { os(); scQueue.length = 0; if (playX) playX.setAttribute("opacity", "0"); };
    const sched = scheduleStep;
    scheduleStep = function (s, t) {
      sched(s, t);
      const S = SC();
      if (scFresh) { scBar = 0; scFresh = false; }
      else if (s === 0) scBar = (scBar + 1) % S.bars;
      if (scBar >= S.bars) scBar = 0;
      const tt = s % 2 === 1 ? t + state.drum.swing * stepDur() * 0.5 : t;
      const hits = S.level > 0 && !scMuted("notes") ? S.notes.filter(n => n.b === scBar && n.s === s) : [];
      const scale = S.level * 1.1 / Math.sqrt(Math.max(1, hits.length));
      for (const n of hits) {
        const len = Math.max(0.05, n.d * stepDur() * 0.95);
        { const vg = prVelGain(n), kv = NB_VEL, k7 = NB_VEL7; NB_VEL = vg; NB_VEL7 = n.v == null ? 100 : n.v; try { melodicVoices(n.m, tt, scale * vg).forEach(v => v.stop(tt + len)); } finally { NB_VEL = kv; NB_VEL7 = k7; } }
      }
      scQueue.push({ b: scBar, s, t });
      if (scQueue.length > 48) scQueue.shift();
    };
  }
  let scLastBar = -1;
  function scFrame() {
    requestAnimationFrame(scFrame);
    if (!playing || notesArea.hidden || !ctx || !playX) return;
    const now = ctx.currentTime;
    let cur = null;
    for (const q of scQueue) if (q.t <= now) cur = q;
    if (!cur) return;
    const x = barX(cur.b) + cur.s * SW + 1;
    playX.setAttribute("x1", x); playX.setAttribute("x2", x); playX.setAttribute("opacity", "0.9");
    if (cur.b !== scLastBar) {
      scLastBar = cur.b;
      const v = scScroll, bx = barX(cur.b);
      if (bx < v.scrollLeft || bx + barW() > v.scrollLeft + v.clientWidth) v.scrollLeft = bx - 6;
    }
  }
  requestAnimationFrame(scFrame);

  // ---------- mixer channel ----------
  {
    const o = mixChannels;
    mixChannels = function () {
      const ch = o();
      ch.splice(1, 0, { group: "Notation", name: "Notation pad", sub: SC().notes.length + " notes · current sound",
        get: () => SC().level, set: v => { SC().level = v; }, dflt: 0.8 });
      return ch;
    };
  }

  // ---------- piano roll: the same notes on a pitch-by-step grid, with a velocity lane ----------
  const PR = { on: false, LO: 21, HI: 108, RH: 12, SW: 20, KW: 36, RUL: 16, VEL: 44, drag: null, sel: null, centred: false };
  try { PR.on = localStorage.getItem("nightbloom-roll") === "1"; } catch (e) {}
  try { if (matchMedia("(pointer: coarse)").matches) { PR.RH = 15; PR.SW = 24; } } catch (e) {}   // (bigger cells for fingers)
  const prScroll = document.getElementById("prScroll"), prSvg = document.getElementById("prSvg"), prKeys = document.getElementById("prKeys"), prRuler = document.getElementById("prRuler"), prVel = document.getElementById("prVel");
  const PR_BLACK = new Set([1, 3, 6, 8, 10]);
  const prY = m => (PR.HI - m) * PR.RH;
  const prVis = n => visibleNote(n) && n.m >= PR.LO && n.m <= PR.HI;
  let prPlay = null;
  function prKeysDraw() {
    const H = (PR.HI - PR.LO + 1) * PR.RH; let k = "";
    for (let m = PR.HI; m >= PR.LO; m--) {
      const y = prY(m), blk = PR_BLACK.has(m % 12);
      k += `<rect x="0" y="${y}" width="${blk ? 22 : PR.KW}" height="${PR.RH}" fill="${blk ? "var(--pr-key-b)" : "var(--pr-key-w)"}"/>`;
      if (!blk && (m % 12 === 4 || m % 12 === 11)) k += `<line x1="0" x2="${PR.KW}" y1="${y}" y2="${y}" stroke="var(--panel)" stroke-width="1"/>`;
      if (m % 12 === 0) k += `<text x="${PR.KW - 3}" y="${y + PR.RH - 3}" font-size="8.5" text-anchor="end" fill="var(--ink)" class="sc-num">C${m / 12 - 1}</text>`;
    }
    prKeys.setAttribute("width", PR.KW); prKeys.setAttribute("height", H); prKeys.setAttribute("viewBox", `0 0 ${PR.KW} ${H}`); prKeys.innerHTML = k;
  }
  function prRender() {
    if (!PR.on) return;
    const S = SC(), st = stepsNow(), beats = beatStarts(), W = S.bars * st * PR.SW, H = (PR.HI - PR.LO + 1) * PR.RH;
    let g = "";
    for (let m = PR.HI; m >= PR.LO; m--) {
      const y = prY(m);
      if (PR_BLACK.has(m % 12)) g += `<rect x="0" y="${y}" width="${W}" height="${PR.RH}" fill="var(--pr-black)"/>`;
      if (m % 12 === 0) g += `<line x1="0" x2="${W}" y1="${y + PR.RH - 0.5}" y2="${y + PR.RH - 0.5}" stroke="var(--sc-beat)" stroke-width="1"/>`;
    }
    for (let b = 0; b < S.bars; b++) for (let i = 0; i < st; i++) {
      const x = (b * st + i) * PR.SW + 0.5, bar = i === 0, beat = beats.has(i);
      g += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="${bar ? "var(--sc-line)" : beat ? "var(--sc-beat)" : "var(--pr-step)"}" stroke-width="${bar ? 1.3 : 1}"/>`;
    }
    const D = PR.drag, shown = S.notes.filter(prVis);
    for (const n of shown) {
      const live = D && D.n === n && D.moved && D.kind !== "pan" ? D.to : n;
      const x = (live.b * st + live.s) * PR.SW, y = prY(live.m), w = Math.max(5, live.d * PR.SW - 2), v = n.v == null ? 100 : n.v, hot = D && D.n === n;
      g += `<rect x="${x + 1}" y="${y + 1}" width="${w}" height="${PR.RH - 2}" rx="3" fill="var(--lilac)" fill-opacity="${(0.4 + 0.6 * v / 127).toFixed(2)}" stroke="${hot ? "var(--amber)" : "var(--lilac)"}" stroke-width="${hot ? 1.6 : 1}"/>`;
      if (w > 12) g += `<rect x="${x + w - 3}" y="${y + 3}" width="2" height="${PR.RH - 6}" rx="1" fill="var(--panel)" opacity="0.65"/>`;
      if (w > 30) g += `<text x="${x + 4}" y="${y + PR.RH - 3}" font-size="8" fill="var(--panel)" font-weight="700">${pitchName(live.m, live.dia == null ? spell(live.m) : live.dia)}</text>`;
    }
    if (D && D.kind === "add" && D.ghost) { const q = D.ghost, x = q.abs * PR.SW, y = prY(q.m); g += `<rect x="${x + 1}" y="${y + 1}" width="${Math.max(5, q.d * PR.SW - 2)}" height="${PR.RH - 2}" rx="3" fill="var(--amber)" opacity="0.55"/>`; }
    const cx = scEd.cursor * PR.SW;
    if (scEd.cursor < S.bars * st) g += `<rect x="${cx}" y="0" width="2" height="${H}" fill="var(--amber)" opacity="0.6"/>`;
    g += `<line id="prPlay" x1="0" x2="0" y1="0" y2="${H}" stroke="var(--lilac)" stroke-width="2" opacity="0"/>`;
    prSvg.setAttribute("width", W); prSvg.setAttribute("height", H); prSvg.setAttribute("viewBox", `0 0 ${W} ${H}`); prSvg.innerHTML = g;
    prPlay = prSvg.querySelector("#prPlay");
    // the ruler: bar numbers, beats and the cursor
    let r = `<rect x="0" y="0" width="${W}" height="${PR.RUL}" fill="var(--sc-ruler)"/>`;
    for (let b = 0; b < S.bars; b++) {
      const x = b * st * PR.SW;
      r += `<line x1="${x + 0.5}" x2="${x + 0.5}" y1="0" y2="${PR.RUL}" stroke="var(--sc-line)"/><text x="${x + 4}" y="${PR.RUL - 4}" font-size="10" fill="var(--dim)" class="sc-num">${b + 1}</text>`;
      for (const bs of beats) if (bs > 0) r += `<line x1="${x + bs * PR.SW + 0.5}" x2="${x + bs * PR.SW + 0.5}" y1="${PR.RUL - 5}" y2="${PR.RUL}" stroke="var(--sc-beat)"/>`;
    }
    if (scEd.cursor < S.bars * st) r += `<path d="M${cx - 5} 0 h12 l-6 7 z" fill="var(--amber)"/>`;
    prRuler.setAttribute("width", W); prRuler.setAttribute("height", PR.RUL); prRuler.setAttribute("viewBox", `0 0 ${W} ${PR.RUL}`); prRuler.innerHTML = r;
    // velocity: one bar per note at its start
    let vv = `<line x1="0" x2="${W}" y1="${PR.VEL - 4.5}" y2="${PR.VEL - 4.5}" stroke="var(--line)"/>`;
    for (let b = 0; b < S.bars; b++) vv += `<line x1="${b * st * PR.SW + 0.5}" x2="${b * st * PR.SW + 0.5}" y1="0" y2="${PR.VEL}" stroke="var(--line)"/>`;
    for (const n of shown) {
      const x = absOf(n) * PR.SW + 4, v = n.v == null ? 100 : n.v, y = PR.VEL - 5 - (v / 127) * (PR.VEL - 12), hot = PR.sel === n || (D && D.n === n);
      vv += `<line x1="${x}" x2="${x}" y1="${PR.VEL - 5}" y2="${y}" stroke="${hot ? "var(--amber)" : "var(--lilac)"}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" fill="${hot ? "var(--amber)" : "var(--lilac)"}"/>`;
    }
    prVel.setAttribute("width", W); prVel.setAttribute("height", PR.VEL); prVel.setAttribute("viewBox", `0 0 ${W} ${PR.VEL}`); prVel.innerHTML = vv;
    if (!PR.centred && prScroll.clientHeight) {   // open on the notes (or middle C)
      PR.centred = true;
      const ms = shown.map(n => n.m).sort((a, b) => a - b), mid = ms.length ? ms[ms.length >> 1] : 64;
      prScroll.scrollTop = Math.max(0, prY(mid) + PR.RUL - prScroll.clientHeight / 2);
    }
  }
  const prSnap = () => { let q = Math.min(scEd.dur, 4); if (q === 4 && meterOf(state.seq.meter)[1].includes(6)) q = 2; return q; };
  function prPoint(ev) {
    const r = prSvg.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    return { x, y, abs: Math.max(0, Math.floor(x / PR.SW)), m: Math.max(PR.LO, Math.min(PR.HI, PR.HI - Math.floor(y / PR.RH))) };
  }
  function prHit(p) {
    const st = stepsNow();
    for (const n of SC().notes) {
      if (!prVis(n) || n.m !== p.m) continue;
      const x0 = (n.b * st + n.s) * PR.SW, x1 = x0 + Math.max(5, n.d * PR.SW - 2);
      if (p.x >= x0 && p.x <= x1 + 2) return { n, edge: p.x > x1 - Math.max(5, Math.min(10, (x1 - x0) * 0.35)) };
    }
    return null;
  }
  prSvg.addEventListener("pointerdown", ev => {
    if (ev.button > 0) return;
    start();
    const p = prPoint(ev), h = prHit(p), S = SC(), st = stepsNow();
    try { prSvg.setPointerCapture(ev.pointerId); } catch (e) {}
    PR.drag = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, p0: p, sl: prScroll.scrollLeft, stp: prScroll.scrollTop, moved: false, before: scSnapS() };
    if (h) {
      const n = h.n; PR.sel = n;
      Object.assign(PR.drag, { kind: h.edge ? "len" : "move", n, to: { b: n.b, s: n.s, d: n.d, m: n.m, dia: n.dia } });
      preview(n.m); scInfo.textContent = pitchName(n.m, n.dia) + (h.edge ? " · drag for length" : " · drag to move · lift to erase");
    } else {
      let abs = Math.floor(p.abs / prSnap()) * prSnap(); abs = Math.min(abs, S.bars * st - 1);
      const d = Math.max(1, Math.min(curDur(), st - (abs % st)));
      Object.assign(PR.drag, { kind: "add", ghost: { abs, m: p.m, d } });
      preview(p.m); scInfo.textContent = pitchName(p.m, spell(p.m)) + " · " + (DUR_NAMES[curDur()] || "") + " · lift to place";
    }
    prRender();
  });
  prSvg.addEventListener("pointermove", ev => {
    const D = PR.drag; if (!D || ev.pointerId !== D.id) return;
    const dx = ev.clientX - D.x0, dy = ev.clientY - D.y0;
    if (!D.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    D.moved = true;
    if (D.kind === "add") D.kind = "pan";   // dragging empty space scrolls
    if (D.kind === "pan") { prScroll.scrollLeft = D.sl - dx; prScroll.scrollTop = D.stp - dy; return; }
    const S = SC(), st = stepsNow(), n = D.n, end = S.bars * st;
    if (D.kind === "move") {
      const q = prSnap(), ds = Math.round(dx / PR.SW / q) * q, dm = -Math.round(dy / PR.RH);
      const abs = Math.max(0, Math.min(end - 1, n.b * st + n.s + ds)), m = Math.max(PR.LO, Math.min(PR.HI, n.m + dm));
      if (m !== D.to.m) preview(m);
      D.to = { b: Math.floor(abs / st), s: abs % st, d: Math.max(1, Math.min(n.d, end - abs)), m, dia: m === n.m ? n.dia : spell(m) };
      scInfo.textContent = pitchName(m, D.to.dia) + " · bar " + (D.to.b + 1) + " step " + (D.to.s + 1);
    } else {
      const abs = n.b * st + n.s, d = Math.max(1, Math.min(32, end - abs, Math.round((p => p.x)(prPoint(ev)) / PR.SW - abs)));
      D.to = { b: n.b, s: n.s, d, m: n.m, dia: n.dia };
      scInfo.textContent = pitchName(n.m, n.dia) + " · " + (DUR_NAMES[d] || d + " steps");
    }
    prRender();
  });
  function prEnd(ev, cancel) {
    const D = PR.drag; if (!D || ev.pointerId !== D.id) return;
    PR.drag = null;
    if (!cancel) {
      if (D.kind === "add" && D.ghost) addAt(D.ghost.abs, [D.ghost.m], [spell(D.ghost.m)]);
      else if ((D.kind === "move" || D.kind === "len") && !D.moved) { removeNote(D.n); PR.sel = null; }
      else if ((D.kind === "move" || D.kind === "len") && D.to) {
        const n = D.n, t = D.to;
        if (t.b !== n.b || t.s !== n.s || t.d !== n.d || t.m !== n.m) {
          // (a note moved onto the same pitch at the same start replaces it)
          const S = SC(), dup = S.notes.find(o => o !== n && o.b === t.b && o.s === t.s && o.m === t.m);
          scPush(D.before); if (dup) S.notes.splice(S.notes.indexOf(dup), 1);
          Object.assign(n, t); save();
        }
      }
    }
    scRender();
  }
  prSvg.addEventListener("pointerup", ev => prEnd(ev, false));
  prSvg.addEventListener("pointercancel", ev => prEnd(ev, true));
  // velocity lane: drag the bar of a note (every note starting there, for a chord)
  let prVD = null;
  const prVAt = ev => { const r = prVel.getBoundingClientRect(); return { x: ev.clientX - r.left, v: Math.max(1, Math.min(127, Math.round((PR.VEL - 5 - (ev.clientY - r.top)) / (PR.VEL - 12) * 127))) }; };
  prVel.addEventListener("pointerdown", ev => {
    if (ev.button > 0) return;
    const p = prVAt(ev), shown = SC().notes.filter(prVis); if (!shown.length) return;
    let best = null, bd = 1e9;
    for (const n of shown) { const d = Math.abs(absOf(n) * PR.SW + 4 - p.x); if (d < bd || (d === bd && n === PR.sel)) { best = n; bd = d; } }
    if (!best || bd > PR.SW * 0.75) return;
    const at = absOf(best), group = PR.sel && absOf(PR.sel) === at ? [PR.sel] : shown.filter(n => absOf(n) === at);
    prVD = { id: ev.pointerId, group, before: scSnapS(), changed: false };
    try { prVel.setPointerCapture(ev.pointerId); } catch (e) {}
    const set = v => { group.forEach(n => { n.v = v; }); prVD.changed = true; scInfo.textContent = "velocity " + v + (group.length > 1 ? " · " + group.length + " notes" : ""); prRender(); };
    prVD.set = set; set(p.v);
  });
  prVel.addEventListener("pointermove", ev => { if (prVD && ev.pointerId === prVD.id) prVD.set(prVAt(ev).v); });
  const prVEnd = ev => { if (!prVD || ev.pointerId !== prVD.id) return; const D = prVD; prVD = null; if (D.changed) { scPush(D.before); save(); } scRender(); };
  prVel.addEventListener("pointerup", prVEnd); prVel.addEventListener("pointercancel", prVEnd);
  prKeys.addEventListener("pointerdown", ev => { start(); const r = prKeys.getBoundingClientRect(), m = PR.HI - Math.floor((ev.clientY - r.top) / PR.RH); if (m >= PR.LO && m <= PR.HI) { preview(m); scInfo.textContent = pitchName(m, spell(m)); } });
  prRuler.addEventListener("pointerdown", ev => {
    const r = prRuler.getBoundingClientRect(), S = SC(), st = stepsNow();
    let abs = Math.floor((ev.clientX - r.left) / PR.SW / prSnap()) * prSnap();
    scEd.cursor = Math.max(0, Math.min(S.bars * st - 1, abs)); scEd.last.t = 0; scRender();
  });
  function prShow(on) {
    PR.on = on; try { localStorage.setItem("nightbloom-roll", on ? "1" : "0"); } catch (e) {}
    notesArea.classList.toggle("roll", on); prScroll.hidden = !on;
    document.querySelectorAll("#scView button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.v === "roll") === on)));
    if (on) { prKeysDraw(); prRender(); }
  }
  document.getElementById("scView").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { prShow(b.dataset.v === "roll"); scRender(); } });
  { const r0 = scRender; scRender = function () { r0.apply(this, arguments); if (PR.on && !notesArea.hidden) prRender(); }; }
  { const c0 = scrollToCursor; scrollToCursor = function () {
      if (!PR.on) return c0.apply(this, arguments);
      const x = scEd.cursor * PR.SW + PR.KW, v = prScroll;
      if (x < v.scrollLeft + PR.KW + 20 || x > v.scrollLeft + v.clientWidth - 40) v.scrollLeft = Math.max(0, x - PR.KW - v.clientWidth / 3);
    }; }
  let prLastBar = -1;
  (function prFrame() {
    requestAnimationFrame(prFrame);
    if (!PR.on || !playing || notesArea.hidden || !ctx || !prPlay) return;
    const now = ctx.currentTime; let cur = null;
    for (const q of scQueue) if (q.t <= now) cur = q;
    if (!cur) return;
    const st = stepsNow(), x = (cur.b * st + cur.s) * PR.SW + 1;
    prPlay.setAttribute("x1", x); prPlay.setAttribute("x2", x); prPlay.setAttribute("opacity", "0.9");
    if (cur.b !== prLastBar) {
      prLastBar = cur.b;
      const v = prScroll, bx = cur.b * st * PR.SW, bw = st * PR.SW;
      if (bx < v.scrollLeft || bx + bw > v.scrollLeft + v.clientWidth - PR.KW) v.scrollLeft = Math.max(0, bx - 6);
    }
  })();
  { const ss = stopSeq; stopSeq = function () { ss.apply(this, arguments); if (prPlay) prPlay.setAttribute("opacity", "0"); prLastBar = -1; }; }
  if (PR.on) { notesArea.classList.add("roll"); prScroll.hidden = false; document.querySelectorAll("#scView button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === "roll"))); prKeysDraw(); }
  window.__pr = { PR, show: prShow, render: prRender, snap: scSnapS, put: scPut };

  // ---------- the third view ----------
  setMode = function (mode) {
    state.mode = mode;
    const seq = mode === "seq", notes = mode === "notes";
    document.getElementById("modeKeys").setAttribute("aria-pressed", String(mode === "keys"));
    document.getElementById("modeSeq").setAttribute("aria-pressed", String(seq));
    document.getElementById("modeNotes").setAttribute("aria-pressed", String(notes));
    document.getElementById("playrow").hidden = seq; seqArea.hidden = !seq; notesArea.hidden = !notes;
    document.querySelector(".app").classList.toggle("notesmode", notes);
    if (seq) requestAnimationFrame(updateThumb);
    document.getElementById("octGroup").hidden = seq;
    document.getElementById("bpmGroup").hidden = !seq;
    holdBtn.hidden = mode !== "keys"; clearBtn.hidden = !seq;
    document.getElementById("chordWrap").hidden = seq;
    document.getElementById("meterWrap").hidden = mode === "keys";
    document.getElementById("beatsBtn").hidden = !seq;
    if (notes) { renderHead(); scRender(); scrollToCursor(); }
  };
  document.getElementById("modeNotes").addEventListener("click", () => setMode("notes"));
  paintTools();
  renderHead();


