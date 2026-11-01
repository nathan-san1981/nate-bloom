  // ======================================================================
  // Blend: notes you play swell in softly and ring on after you let go,
  // so each one melts into the next. The slider sets how much.
  // Only touches notes you play live on synths and instruments (keys, Hold, MIDI keyboards); never the sampler.
  // ======================================================================
  {
    const bl = { on: false, amt: 0.45 };
    try { Object.assign(bl, JSON.parse(localStorage.getItem("nightbloom-blend") || "{}")); } catch (e) {}
    const saveBl = () => { try { localStorage.setItem("nightbloom-blend", JSON.stringify(bl)); } catch (e) {} };
    const inv = (s, a, b) => Math.log(s / a) / Math.log(b / a);    // seconds -> 0..1 slider position for expMap(x, a, b)
    const attackSec = () => 0.03 + Math.pow(bl.amt, 1.6) * 0.9;      // up to ~0.9 s swell
    const tailSec = () => 0.08 + bl.amt * 1.8;                       // keep ringing up to ~1.9 s after release
    let live = false;
    {
      const om = makeNote;
      makeNote = function (root) {
        if (!bl.on || state.engine === "samp") return om(root);   // samples play exactly as recorded
        live = true; let v;
        try { v = om(root); } finally { live = false; }
        const stop0 = v.stop.bind(v), tail = tailSec();
        return Object.assign(v, { stop() { setTimeout(stop0, tail * 1000); } });
      };
      const mv = makeVoice;
      makeVoice = function (midi, id, mix, when) {
        if (!live) return mv(midi, id, mix, when);
        const p = state.params[id], had = "attack" in p, keep = p.attack;
        p.attack = Math.max(had ? keep : 0, inv(attackSec(), 0.004, 4));
        try { return mv(midi, id, mix, when); } finally { if (had) p.attack = keep; else delete p.attack; }
      };
      const iv = makeInstVoice;
      makeInstVoice = function (midi, when, scale, inst, P) {
        if (!live) return iv(midi, when, scale, inst, P);
        const P0 = P || state.inst.p, P2 = Object.assign({}, P0, { attack: Math.max(P0.attack || 0, inv(attackSec(), 0.003, 4)) });
        return iv(midi, when, scale, inst, P2);
      };
    }
    const row = document.getElementById("blendRow"), btn = document.getElementById("blendBtn"), sl = document.getElementById("blendAmt"), val = document.getElementById("blendVal");
    function paint() {
      btn.setAttribute("aria-pressed", String(bl.on)); btn.textContent = bl.on ? "Blend: On" : "Blend: Off";
      sl.value = Math.round(bl.amt * 100); val.textContent = sl.value + "%";
      row.classList.toggle("off", !bl.on);
      row.hidden = state.mode === "seq" || ["drum", "pads", "samp"].includes(state.engine);
    }
    btn.addEventListener("click", () => { bl.on = !bl.on; saveBl(); paint(); });
    sl.addEventListener("input", () => { bl.amt = sl.value / 100; if (!bl.on) bl.on = true; saveBl(); paint(); });
    { const om = setMode; setMode = function (m) { om(m); paint(); }; }
    { const ou = updateSoundBar; updateSoundBar = function () { ou(); paint(); }; }
    paint();
  }


  // ======================================================================
  // Drum machines: the 808 plus a 909 and a CR-78, stackable like the synths
  // (every hit plays on each machine that's switched on). And 100 more beats.
  // ======================================================================
  const MACHINES = [["808", "808", "deep and boomy"], ["909", "909", "punchy and bright"], ["cr78", "CR-78", "soft vintage"]];
  const mach = { on: { "808": true, "909": false, cr78: false }, lvl: { "808": 1, "909": 0.8, cr78: 0.8 } };
  try { const s = JSON.parse(localStorage.getItem("nightbloom-machines") || "null"); if (s) { Object.assign(mach.on, s.on || {}); Object.assign(mach.lvl, s.lvl || {}); } } catch (e) {}
  if (!Object.values(mach.on).some(Boolean)) mach.on["808"] = true;
  const saveMach = () => { try { localStorage.setItem("nightbloom-machines", JSON.stringify(mach)); } catch (e) {} };

  function drumVoice(machine, id, t) {
    // shared plumbing: per-sound pitch / length / volume from the 808 panel apply to every machine
    const p = state.drum, D = (state.drumPads && state.drumPads[id]) || { pitch: 0.5, length: 0.5, vol: 0.8 };
    const pf = Math.pow(2, Math.round((D.pitch - 0.5) * 24) / 12), lf = Math.pow(2, (D.length - 0.5) * 4);
    const bus = ctx.createGain(); bus.gain.value = D.vol * 1.25 * (mach.lvl[machine] ?? 0.8); bus.connect(fx.drumBus);
    const nodes = [];
    const env = (peak, decay, at = t) => { const n = ctx.createGain(); n.gain.setValueAtTime(peak, at); n.gain.exponentialRampToValueAtTime(0.0008, at + decay * lf); return n; };
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * pf; nodes.push(o); return o; };
    const noise = () => { const n = ctx.createBufferSource(); n.buffer = fx.noise; n.loop = true; nodes.push(n); return n; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f * pf; b.Q.value = q; return b; };
    let len = 0.4;
    if (machine === "909") {
      if (id === "kick") {   // fast pitch drop, tight body, beater click
        const base = 48 + p.tune * 18, dec = 0.18 + p.boom * 0.5;
        const o = osc("sine", base * 5); o.frequency.setValueAtTime(base * 5 * pf, t); o.frequency.exponentialRampToValueAtTime(base * 1.6 * pf, t + 0.02); o.frequency.exponentialRampToValueAtTime(base * pf, t + 0.1);
        const sh = ctx.createWaveShaper(); sh.curve = driveCurve(0.35); o.connect(sh).connect(env(1, dec)).connect(bus);
        noise().connect(filt("bandpass", 3500, 0.8)).connect(env(0.35, 0.012)).connect(bus);
        len = dec * lf;
      } else if (id === "snare") {
        osc("triangle", 190 + p.tune * 30).connect(env(0.5, 0.09)).connect(bus);
        osc("triangle", 340 + p.tune * 40).connect(env(0.25, 0.06)).connect(bus);
        noise().connect(filt("highpass", 2400)).connect(env(0.55 + p.snap * 0.4, 0.16 + p.snap * 0.1)).connect(bus);
        len = 0.3 * lf;
      } else if (id === "clap") {
        const n = noise(), bp = filt("bandpass", 1400, 1.1), e = ctx.createGain();
        e.gain.setValueAtTime(0.0008, t);
        [0, 0.008, 0.016, 0.024].forEach(o => { e.gain.setValueAtTime(1, t + o); e.gain.exponentialRampToValueAtTime(0.1, t + o + 0.007); });
        e.gain.setValueAtTime(0.8, t + 0.032); e.gain.exponentialRampToValueAtTime(0.0008, t + 0.032 + 0.22 * lf);
        n.connect(bp).connect(e).connect(bus); len = 0.4 * lf;
      } else if (id === "ch" || id === "oh") {   // brighter, noisier hats
        const dec = id === "ch" ? 0.04 + p.hat * 0.05 : 0.25 + p.hat * 0.6;
        const e = env(id === "ch" ? 0.6 : 0.5, dec), hp = filt("highpass", 8500);
        noise().connect(hp);
        [263, 400, 421, 474, 587, 845].forEach(f => { const g2 = ctx.createGain(); g2.gain.value = 0.08; osc("square", f * 2).connect(g2).connect(hp); });
        hp.connect(e).connect(bus); len = dec * lf;
      } else if (id === "tom") {
        const f = 120 + p.tune * 40, o = osc("sine", f); o.frequency.setValueAtTime(f * 1.4 * pf, t); o.frequency.exponentialRampToValueAtTime(f * pf, t + 0.08);
        o.connect(env(0.8, 0.3 + p.boom * 0.3)).connect(bus); noise().connect(filt("lowpass", 900)).connect(env(0.15, 0.04)).connect(bus); len = 0.6 * lf;
      } else if (id === "rim") {
        osc("triangle", 2200).connect(filt("bandpass", 2200, 4)).connect(env(1, 0.02)).connect(bus);
        noise().connect(filt("highpass", 5000)).connect(env(0.3, 0.006)).connect(bus); len = 0.05 * lf;
      } else if (id === "cow") {   // the 909 has a ride where the 808 has a cowbell
        const hp = filt("highpass", 5500), e = env(0.35, 1.1 + p.hat * 0.8);
        [310, 465, 580, 735, 960, 1220].forEach(f => { const g2 = ctx.createGain(); g2.gain.value = 0.1; osc("square", f * 1.9).connect(g2).connect(hp); });
        hp.connect(e).connect(bus); len = 2 * lf;
      }
    } else if (machine === "cr78") {
      if (id === "kick") {   // round, short, no click
        const f = 58 + p.tune * 16, o = osc("sine", f); o.frequency.setValueAtTime(f * 1.5 * pf, t); o.frequency.exponentialRampToValueAtTime(f * pf, t + 0.03);
        o.connect(filt("lowpass", 400)).connect(env(0.9, 0.22 + p.boom * 0.2)).connect(bus); len = 0.5 * lf;
      } else if (id === "snare") {
        osc("sine", 230 + p.tune * 30).connect(env(0.35, 0.07)).connect(bus);
        noise().connect(filt("bandpass", 1800, 0.9)).connect(env(0.4 + p.snap * 0.3, 0.13)).connect(bus); len = 0.25 * lf;
      } else if (id === "clap") {   // tambourine
        const hp = filt("highpass", 6500), e = ctx.createGain(); e.gain.setValueAtTime(0.0008, t);
        [0, 0.03, 0.055].forEach((o, k) => { e.gain.setValueAtTime(0.6 - k * 0.15, t + o); e.gain.exponentialRampToValueAtTime(0.02, t + o + 0.05); });
        e.gain.exponentialRampToValueAtTime(0.0008, t + 0.2 * lf);
        noise().connect(hp).connect(e).connect(bus); len = 0.3 * lf;
      } else if (id === "ch" || id === "oh") {   // soft metallic hiss
        const dec = id === "ch" ? 0.03 + p.hat * 0.03 : 0.3 + p.hat * 0.5;
        noise().connect(filt("bandpass", 9000, 1.2)).connect(env(id === "ch" ? 0.35 : 0.3, dec)).connect(bus); len = dec * lf;
      } else if (id === "tom") {   // bongo
        const f = 300 + p.tune * 80, o = osc("sine", f); o.frequency.setValueAtTime(f * 1.12 * pf, t); o.frequency.exponentialRampToValueAtTime(f * pf, t + 0.03);
        o.connect(env(0.7, 0.14)).connect(bus); len = 0.25 * lf;
      } else if (id === "rim") {   // claves
        osc("sine", 2500).connect(env(0.8, 0.05)).connect(bus); len = 0.08 * lf;
      } else if (id === "cow") {   // the CR-78's bright cowbell, a little sweeter than the 808's
        const bp = filt("bandpass", 1000, 3), e = env(0.45, 0.22);
        osc("square", 587).connect(bp); osc("square", 845).connect(bp); bp.connect(e).connect(bus); len = 0.3 * lf;
      }
    }
    nodes.forEach(n => { n.start(t); n.stop(t + len + 0.1); });
    setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, (t - ctx.currentTime + len + 0.4) * 1000);
  }
  {
    const o808 = playDrum;
    playDrum = function (id, t) {
      if (!ctx) return;
      if (mach.on["808"]) o808(id, t);
      if (mach.on["909"]) drumVoice("909", id, t);
      if (mach.on.cr78) drumVoice("cr78", id, t);
    };
  }
  const machBar = document.getElementById("machBar");
  function paintMach() {
    machBar.querySelectorAll("button[data-m]").forEach(b => b.setAttribute("aria-pressed", String(!!mach.on[b.dataset.m])));
    machBar.hidden = !(state.engine === "drum" || state.mode === "seq");
  }
  MACHINES.forEach(([id, name, sub]) => {
    const b = document.createElement("button"); b.className = "btn mchip"; b.dataset.m = id; b.innerHTML = "<b></b><small></small>";
    b.firstChild.textContent = name; b.lastChild.textContent = sub;
    b.addEventListener("click", () => {
      mach.on[id] = !mach.on[id];
      if (!Object.values(mach.on).some(Boolean)) mach.on[id] = true;   // keep at least one machine sounding
      saveMach(); paintMach();
      if (ctx) { start(); const t = ctx.currentTime + 0.01; playDrum("kick", t); playDrum("snare", t + 0.22); playDrum("ch", t + 0.11); playDrum("ch", t + 0.33); }
    });
    machBar.appendChild(b);
  });
  { const om = setMode; setMode = function (m) { om(m); paintMach(); }; }
  { const ou = updateSoundBar; updateSoundBar = function () { ou(); paintMach(); }; }
  {
    const omc = mixChannels;
    mixChannels = function () {
      const ch = omc(), i = ch.findIndex(c => c.group === "Drums");
      const extra = MACHINES.filter(m => m[0] !== "808").map(([id, name]) => ({ group: "Drums", name: name + " machine", sub: mach.on[id] ? "playing" : "off · switch on in Drums", get: () => mach.lvl[id], set: v => { mach.lvl[id] = v; saveMach(); }, dflt: 0.8 }));
      ch.splice(i < 0 ? ch.length : i + 1, 0, ...extra);
      return ch;
    };
  }
  paintMach();

  // ---------- beats: rolls, grouping, style filter, previews with rolls ----------
  const BEAT_STYLE_ORDER = ["Rap", "Hip-hop", "Trap", "Ambient", "Psychedelic", "Lo-fi", "Downtempo"];
  const BEAT_FILTERS = [["all", "All"], ["rap", "Rap"], ["trap", "Trap"], ["ambient", "Ambient"], ["psych", "Psychedelic"], ["more", "More"]];
  let btFilterSel = "all";
  try { btFilterSel = localStorage.getItem("nightbloom-beatfilter") || "all"; } catch (e) {}
  function beatFilterOk(style) {
    if (btFilterSel === "all") return true;
    if (btFilterSel === "rap") return style === "Rap" || style === "Hip-hop";
    if (btFilterSel === "trap") return style === "Trap";
    if (btFilterSel === "ambient") return style === "Ambient" || style === "Downtempo";
    if (btFilterSel === "psych") return style === "Psychedelic";
    return !["Rap", "Hip-hop", "Trap", "Ambient", "Downtempo", "Psychedelic"].includes(style);
  }
  function beatOrderIdx() {
    const rank = s => { const k = BEAT_STYLE_ORDER.indexOf(s); return k < 0 ? 50 : k; };
    return BEATS.map((b, i) => i).filter(i => beatFilterOk(BEATS[i][1])).sort((a, b) => rank(BEATS[a][1]) - rank(BEATS[b][1]) || a - b);
  }
  {
    const fEl = document.getElementById("btFilter");
    BEAT_FILTERS.forEach(([k, label]) => {
      const b = document.createElement("button"); b.className = "btn"; b.dataset.f = k; b.textContent = label;
      b.addEventListener("click", () => { btFilterSel = k; try { localStorage.setItem("nightbloom-beatfilter", k); } catch (e) {} paintFilter(); renderBeats(); btList.scrollTop = 0; });
      fEl.appendChild(b);
    });
    function paintFilter() { fEl.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === btFilterSel))); }
    paintFilter();
  }
  // a beat's rolls map straight onto 4/4; other time signatures play the beat without them
  function beatRolls(i) {
    const r = BEATS[i][5]; if (!r || meterOf(state.seq.meter)[1].join() !== "4,4,4,4") return {};
    const out = {}; for (const id in r) { out[id] = Array(MAXSTEPS).fill(1); [...r[id]].forEach((c, s) => { if (/[2-4]/.test(c)) out[id][s] = +c; }); }
    return out;
  }
  {
    const oa = applyBeat;
    applyBeat = function (i, fromUser) {
      oa(i, fromUser);
      for (const [id] of DRUMS) { delete state.seq.rat[id]; delete state.seq.prob[id]; }
      Object.assign(state.seq.rat, beatRolls(i));
      if (seqBuilt) paintSeq(); save();
    };
  }
  startPreview = function (i) {
    stopPreview();
    start(); if (!ctx) return;
    if (playing) stopSeq();
    const rows = buildBeat(i), n = stepsNow(), rolls = beatRolls(i);
    const bpm = btTempo.checked ? BEATS[i][2] : state.seq.bpm, swing = BEATS[i][3];
    const dur = 60 / bpm / 4;
    pv = { i, step: 0, next: ctx.currentTime + 0.06 };
    const tick = () => {
      if (pv && pv.next < ctx.currentTime - 0.05) { const k = Math.ceil((ctx.currentTime - pv.next) / dur); pv.next += k * dur; pv.step = (pv.step + k) % n; }
      while (pv && pv.next < ctx.currentTime + NB_LA) {
        const s = pv.step, t = s % 2 === 1 ? pv.next + swing * dur * 0.5 : pv.next;
        for (const [id] of DRUMS) if (rows[id][s]) { const r = (rolls[id] && rolls[id][s]) || 1; for (let k = 0; k < r; k++) playDrum(id, t + k * dur / r); }
        pv.next += dur; pv.step = (s + 1) % n;
      }
    };
    tick(); pv.timer = setInterval(tick, 25);
    const b = btList.querySelector('.bt-play[data-i="' + i + '"]');
    if (b) { b.textContent = "■"; b.setAttribute("aria-label", "Stop preview"); }
  };


