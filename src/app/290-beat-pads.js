  // ======================================================================
  // Beat Pads: 16 pads × 4 banks, chop, live recording with quantize and swing, note repeat
  // ======================================================================
  const BP_BANK_COL = ["#c4a3ff", "#7fd6c2", "#ffb65c", "#ff8ac6"];
  const bpPadDef = src => ({ src, tune: 0, decay: 0.5, tone: 0.5, pan: 0, level: 0.8, choke: 0, rev: false });
  // bank A for finger drumming (pad 1 bottom-left): kick snare hat open-hat / rim cross-stick pedal tambourine / toms shaker / crash ride bell cowbell
  const BP_A = ["st:kick", "st:snare", "st:hhc", "st:hho", "st:rim", "st:xstick", "st:hhp", "st:tamb", "st:ltom", "st:mtom", "st:htom", "st:shaker", "st:crash", "st:ride", "st:bell", "st:cowbell"];
  const BP_B = ["st:conga", "st:tumba", "st:bongoh", "st:bongol", "st:claves", "st:cabasa", "st:agogoh", "st:agogol", "st:tri", "st:cowbell", "st:tamb", "st:shaker", "tr:boom", "tr:snap", "tr:clap", "808:cp"];
  const BPS = { v: 1, banks: [BP_A.map(bpPadDef), BP_B.map(bpPadDef), new Array(16).fill(null).map(() => bpPadDef(null)), new Array(16).fill(null).map(() => bpPadDef(null))],
    ev: [], bars: 2, q: 1, qs: 1, sw: 0.5, rep: false, rate: 1, full: false, click: false, cin: true, bank: 0, sel: 0, level: 0.85, src: 0, mode: "tr", sens: 0.55, to: 2 };
  BPS.banks[0][3].choke = 1; BPS.banks[0][2].choke = 1; BPS.banks[0][6].choke = 1;   // the hats cut each other off
  try {
    const o = JSON.parse(localStorage.getItem("nightbloom-bp") || "null");
    if (o && o.v === 1 && Array.isArray(o.banks)) { Object.assign(BPS, o); BPS.banks = o.banks.map(b => b.map(p => Object.assign(bpPadDef(null), p))); }
  } catch (e) {}
  BPS.ev.forEach(e => { delete e.cyc; });
  // part 2: eight sequences (the one you're on is BPS.ev / BPS.bars), the song chain, 16 Levels
  if (!Array.isArray(BPS.seqs) || !BPS.seqs.length) BPS.seqs = [{ ev: BPS.ev, bars: BPS.bars }];
  while (BPS.seqs.length < 8) BPS.seqs.push({ ev: [], bars: 2 });
  BPS.seqs = BPS.seqs.slice(0, 8).map(q => ({ ev: Array.isArray(q && q.ev) ? q.ev : [], bars: [1, 2, 4, 8].includes(q && q.bars) ? q.bars : 2 }));
  if (!(BPS.cur >= 0 && BPS.cur < 8)) BPS.cur = 0;
  BPS.ev = BPS.seqs[BPS.cur].ev; BPS.bars = BPS.seqs[BPS.cur].bars;
  BPS.seqs.forEach(q => q.ev.forEach(e => { delete e.cyc; }));
  BPS.song = Array.isArray(BPS.song) ? BPS.song.filter(x => x && x.n >= 0 && x.n < 8).map(x => ({ n: x.n, x: Math.max(1, Math.min(4, x.x || 1)) })) : [];
  BPS.songOn = !!BPS.songOn; BPS.l16 = !!BPS.l16; if (!["tune", "vel", "decay", "filter"].includes(BPS.l16p)) BPS.l16p = "tune"; if (!(BPS.l16src >= 0 && BPS.l16src < 64)) BPS.l16src = 0;
  let bpSaveT = 0; const bpSave = () => { clearTimeout(bpSaveT); bpSaveT = setTimeout(() => { try { bpSeqSync(); localStorage.setItem("nightbloom-bp", JSON.stringify(BPS)); } catch (e) {} }, 300); };
  const BP = { playing: false, rec: false, aT: 0, aPos: 0, sd: 0.125, sched: 0, pass: 0, voices: [], held: new Map(), rep: new Map(), bus: null, busTo: null, rev: {}, free: false };
  const bpPad = k => BPS.banks[Math.floor(k / 16)] && BPS.banks[Math.floor(k / 16)][k % 16];
  const bpIsPlaying = () => BP.playing || BP.free || (!!ctx && BP.voices.some(v => v.end > ctx.currentTime + 1));
  function bpFade(v, now, tau) { try { v.cg.gain.cancelScheduledValues(now); v.cg.gain.setValueAtTime(v.cg.gain.value, now); v.cg.gain.linearRampToValueAtTime(0, now + (tau || 0.012)); } catch (e) {} v.end = now; }
  const bpSd = () => 60 / rcBpm() / 4;
  const bpPosAt = t => BP.aPos + (t - BP.aT) / BP.sd;
  const bpTimeAt = p => BP.aT + (p - BP.aPos) * BP.sd;
  const bpName = P => {
    if (!P || !P.src) return "";
    if (typeof P.src === "object") { const sl = state.samp.slots[P.src.slot]; if (P.src.nm) return P.src.nm; return (P.src.n ? "Chop " + P.src.n : "Chop") + (sl && sl.name ? " · " + baseName(sl.name) : ""); }
    const sd = rcSnd(P.src); return sd ? sd.name.replace(/^Real /, "") : P.src;
  };
  // ---------- sound out ----------
  if (!FXC.by.bp) { fxcParams("bp").on = false; fxcSave(); }
  fxcNames.bp = "Beat Pads";
  function bpBus() {
    if (!BP.bus || BP.bus.context !== ctx) { BP.bus = ctx.createGain(); BP.bus.gain.value = BPS.level; BP.bus.__soloGroup = "bp"; BP.busTo = null; }
    const c = FXC.by.bp && FXC.by.bp.on ? fxcGet("bp") : null, to = c ? c.input : fx.comp;
    if (BP.busTo !== to) { try { BP.bus.disconnect(); } catch (e) {} BP.bus.connect(to); BP.busTo = to; }
    return BP.bus;
  }
  function bpRevBuf(slot, b) {
    const c = BP.rev[slot]; if (c && c.src === b) return c.buf;
    const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let ch = 0; ch < b.numberOfChannels; ch++) { const a = b.getChannelData(ch), o = r.getChannelData(ch), n = a.length; for (let i = 0; i < n; i++) o[i] = a[n - 1 - i]; }
    BP.rev[slot] = { src: b, buf: r }; return r;
  }
  function bpHit(k, t, vel, mod) {
    let P = bpPad(k); if (!P || !P.src || !ctx) return; if (mod) P = bpModPad(P, mod);
    const now = ctx.currentTime; t = Math.max(t, now);
    const cg = ctx.createGain(); cg.gain.value = P.level * P.level * 1.25; let pn = null;
    if (Math.abs(P.pan) > 0.01) { pn = ctx.createStereoPanner(); pn.pan.value = P.pan; cg.connect(pn).connect(bpOut()); } else cg.connect(bpOut());
    if (P.choke) BP.voices.forEach(v => { if (v.choke === P.choke && v.k !== k && v.end > t) { try { v.cg.gain.setTargetAtTime(0, t, 0.008); } catch (e) {} v.end = t + 0.05; } });
    let end = t + 0.5;
    if (typeof P.src === "string") {
      const id = P.src, eng = rcEngine(id);
      const p = { v: vel * rcGain(id), r: Math.pow(2, P.tune / 12), d: Math.pow(2, (P.decay - 0.5) * 2.4), dec: P.decay, tone: P.tone, ch: 0.5, beat: 60 / rcBpm() };
      if (eng === "smp") { const V = rcSampleHit(id, t, p, cg); if (V) end = V.end; else rcSampleBuf(id); }
      else if (RC_SYN[id]) { const V = rcV(t, cg, p.v); RC_SYN[id](V, p); V.go(); end = V.end; }
    } else {
      const S = P.src, b = sampBuf[S.slot]; if (!b) return;
      const buf = P.rev ? bpRevBuf(S.slot, b) : b, a0 = Math.max(0, Math.min(b.duration, S.a)), b0 = Math.max(a0 + 0.005, Math.min(b.duration, S.b));
      const off = P.rev ? b.duration - b0 : a0, len = b0 - a0, rate = Math.pow(2, P.tune / 12), dur = len / rate;
      const keep = P.decay >= 0.5 ? dur : Math.max(0.03, dur * Math.pow(P.decay / 0.5, 1.4));
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(), pk = Math.pow(Math.max(0.05, vel), 1.2);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.002); g.gain.setValueAtTime(pk, t + Math.max(0.003, keep - 0.012)); g.gain.linearRampToValueAtTime(0, t + keep);
      let node = src;
      if (P.tone < 0.48) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300 * Math.pow(2, P.tone / 0.48 * 6); node.connect(f); node = f; }
      else if (P.tone > 0.52) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 30 * Math.pow(2, (P.tone - 0.52) / 0.48 * 6); node.connect(f); node = f; }
      node.connect(g).connect(cg); src.start(t, off, len + 0.02); src.stop(t + keep + 0.03); end = t + keep;
    }
    const vo = { k, choke: P.choke, cg, end }; BP.voices.push(vo);
    if (BP.voices.length > 64) BP.voices = BP.voices.filter(v => v.end > now - 0.2);
    setTimeout(() => { try { cg.disconnect(); if (pn) pn.disconnect(); } catch (e) {} }, (end - now + 1) * 1000);
    if (!BP.off) bpFlash(mod && mod.i != null && BPS.l16 ? BPS.bank * 16 + mod.i : k, t);
    return vo;
  }
  function bpClick(t, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1760 : 1175; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.25 : 0.16, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(fx.comp); o.start(t); o.stop(t + 0.06);
  }
  // ---------- quantize and swing (on playback, so they can change after recording) ----------
  function bpQ(s) {
    const L = BPS.bars * 16, g = +BPS.q; let q = s;
    if (g > 0) { const qs = Math.round(s / g) * g; q = s + (qs - s) * BPS.qs; }
    if (BPS.sw > 0.501 && (g === 1 || g === 2 || g === 0.5)) {   // MPC swing: the off-beat of each pair moves late
      const pair = g === 2 ? 4 : 2, inPair = ((Math.round(q / (pair / 2)) % 2) + 2) % 2;
      if (inPair === 1 && Math.abs(q - Math.round(q / (pair / 2)) * (pair / 2)) < 0.05) q += (BPS.sw - 0.5) * pair;
    }
    return ((q % L) + L) % L;
  }
  // ---------- the clock ----------
  function bpTick() {
    if (!ctx) return;
    const now = ctx.currentTime, sd = bpSd();
    if ((BP.playing || BP.free) && Math.abs(sd - BP.sd) > 1e-7) { const p = bpPosAt(now); BP.aPos = p; BP.aT = now; BP.sd = sd; }
    if (BP.playing) {
      for (let guard = 0; guard < 64; guard++) {
        const L = BPS.bars * 16, horizon = bpPosAt(now + NB_LA);
        if (BP.sched >= horizon - 1e-9) break;
        const from = BP.sched, cyc = Math.floor(from / L), base = cyc * L, end = base + L, to = Math.min(horizon, from < 0 ? Math.min(0, horizon) : end);
        if (from >= 0) for (const e of BPS.ev) { const q = bpQ(e.s); if (q >= from - base && q < to - base && e.cyc !== cyc) bpHit(e.k, bpTimeAt(base + q), e.v, e.m); }
        for (let b = Math.ceil(from / 4) * 4; b < to; b += 4) if (BPS.click || from < 0) bpClick(bpTimeAt(b), ((b % 16) + 16) % 16 === 0);
        BP.sched = to;
        if (from < 0 && to >= 0 && BP.armed) { BP.armed = false; BP.rec = true; bpPaintTop(); }
        // the end of a pass: the song moves on, or the sequence you picked takes over
        if (from >= 0 && to === end && !BP.armed && (!BP.rec || BP.queued != null)) { const nx = bpNextAt(); if (nx != null) bpAdvance(nx, bpTimeAt(end), end); }
      }
    }
    // note repeat: every held pad rolls on the grid (with 16 Levels, at the level it was hit with)
    if (BPS.rep && BP.held.size) {
      const rg = +BPS.rate, horizon = bpPosAt(now + NB_LA);
      for (const [k, h] of BP.rep) {
        if (![...BP.held.values()].some(x => x.k === k)) { BP.rep.delete(k); continue; }
        while (h.next < horizon) {
          const t = bpTimeAt(h.next), src = h.src ?? k; bpHit(src, t, h.vel, h.mod);
          if (BP.rec && h.next >= 0) bpRecord(src, h.next, h.vel, true, h.mod);
          h.next += rg;
        }
      }
    }
    if (BP.free && !BP.held.size && !BP.playing) BP.free = false;
  }
  setInterval(bpTick, 25);
  function bpTransport(on) {
    if (on) {
      start(); if (!ctx) return; if (BP.playing) return; bpSongTop();
      bpBus(); BP.sd = bpSd(); BPS.banks.flat().forEach(P => { if (P && typeof P.src === "string" && rcEngine(P.src) === "smp") rcSampleBuf(P.src); });
      let t0 = ctx.currentTime + 0.08;
      if (RC.playing) {   // start on the Rhythm Creator's next bar
        const sd = BP.sd, nb = Math.ceil(RC.step / 16) * 16; t0 = RC.nextT + (nb - RC.step) * sd; if (t0 < ctx.currentTime + 0.03) t0 += 16 * sd;
      }
      const cin = BP.armed && BPS.cin && !RC.playing;
      BP.aT = t0; BP.aPos = cin ? -16 : 0; BP.sched = BP.aPos; BP.playing = true; BP.free = false;
      if (BP.armed && !cin) { BP.armed = false; BP.rec = true; }
    } else {
      BP.playing = false; BP.rec = false; BP.armed = false; BP.rep.clear(); BP.queued = null; BPS.ev.forEach(e => { delete e.cyc; });
      if (ctx) { const now = ctx.currentTime; BP.voices.forEach(v => { if (v.end > now + 1.5) bpFade(v, now, 0.05); }); }   // long samples stop with the loop; drum tails ring out
    }
    bpPaintTop();
  }
  // ---------- recording ----------
  function bpRecord(k, pos, vel, onGrid, mod) {
    const L = BPS.bars * 16, cyc = Math.floor(pos / L), s = pos - cyc * L;
    BPS.ev.push(Object.assign({ s: onGrid ? s : Math.round(s * 1000) / 1000, k, v: Math.round(vel * 100) / 100, pass: BP.pass, cyc }, mod ? { m: mod } : {}));
    bpSave(); const el = bpGrid.querySelector(`.bp-pad[data-k="${k}"]`); if (el) el.classList.add("has");   // (no repaint: a finger may be on a pad)
    document.getElementById("bpUndo").disabled = false;
  }
  function bpStartRec() {
    start(); if (!ctx) return;
    if (!BP.rec && !BP.armed && BPS.songOn) { BPS.songOn = false; BP.queued = null; bpSave(); noteMsg("Song is off while you record into Seq " + (BPS.cur + 1)); }
    if (BP.rec || BP.armed) { BP.rec = false; BP.armed = false; BPS.ev.forEach(e => { delete e.cyc; }); bpSave(); bpPaintTop(); return; }
    BP.pass++;
    try { window.__nbStep && __nbStep("bp", "Beat Pads · recording"); } catch (e) {}
    if (BP.playing) { BP.rec = true; }
    else { BP.armed = true; bpTransport(true); }
    bpPaintTop();
  }
  // ---------- pads: touch, mouse and keys ----------
  const bpGrid = document.getElementById("bpGrid"), bpView = document.getElementById("bpView"), bpBtn = document.getElementById("bpBtn");
  const bpVel = (el, y) => { if (BPS.l16 && BPS.l16p === "vel") return bpL16Vel(+el.dataset.k % 16); if (BPS.full) return 1; const r = el.getBoundingClientRect(); const rel = Math.min(1, Math.max(0, (y - r.top) / r.height)); return Math.round((0.35 + 0.65 * (1 - rel)) * 100) / 100; };
  function bpDown(k, vel, id) {
    start(); if (!ctx) return;
    BP.held.set(id, { k, vel });
    const lv = bpL16(k, vel), src = lv ? lv.src : k, mod = lv ? lv.mod : undefined; if (lv) vel = lv.vel;
    if (!lv && BPS.sel !== k) { BPS.sel = k; bpMarkSel(); bpPaintEdit(); bpSave(); }
    if (BPS.rep) {
      if (!BP.playing && !BP.free) { BP.free = true; BP.sd = bpSd(); BP.aT = ctx.currentTime + 0.005; BP.aPos = 0; }
      const rg = +BPS.rate, pos = bpPosAt(ctx.currentTime + 0.01);
      if (!BP.playing) { bpHit(src, ctx.currentTime + 0.005, vel, mod); BP.rep.set(k, { next: pos + rg, vel, src, mod }); }
      else BP.rep.set(k, { next: Math.ceil(pos / rg) * rg, vel, src, mod });
      return;
    }
    const t = ctx.currentTime + 0.005; bpHit(src, t, vel, mod);
    if (BP.rec && BP.playing) { const pos = bpPosAt(t); if (pos > -0.5) bpRecord(src, Math.max(0, pos), vel, false, mod); }
  }
  function bpUp(id) { BP.held.delete(id); }
  bpGrid.addEventListener("pointerdown", e => {
    const el = e.target.closest(".bp-pad"); if (!el) return; e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
    bpDown(+el.dataset.k, bpVel(el, e.clientY), "p" + e.pointerId);
  });
  bpGrid.addEventListener("pointermove", e => { const h = BP.held.get("p" + e.pointerId); if (!h) return; const el = bpGrid.querySelector(`.bp-pad[data-k="${h.k}"]`); if (el) { h.vel = bpVel(el, e.clientY); const r = BP.rep.get(h.k); if (r) r.vel = h.vel; } });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => bpGrid.addEventListener(n, e => bpUp("p" + e.pointerId)));
  ["pointerup", "pointercancel"].forEach(n => window.addEventListener(n, e => { if (BP.held.has("p" + e.pointerId)) bpUp("p" + e.pointerId); }, true));
  // the pads on the keyboard: the left-hand block, laid out like the pads (1–4 on top, Z–V at the bottom), by
  // physical key, so Shift, Caps Lock or another layout still land on the same pad
  const BP_CODES = ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyA", "KeyS", "KeyD", "KeyF", "KeyQ", "KeyW", "KeyE", "KeyR", "Digit1", "Digit2", "Digit3", "Digit4"];
  const BP_KEYS = { z: 0, x: 1, c: 2, v: 3, a: 4, s: 5, d: 6, f: 7, q: 8, w: 9, e: 10, r: 11, "1": 12, "2": 13, "3": 14, "4": 15 };
  const bpKeyPad = e => { const i = BP_CODES.indexOf(e.code); if (i >= 0) return i; const kk = (e.key || "").toLowerCase(); return !e.code && kk in BP_KEYS ? BP_KEYS[kk] : -1; };
  const bpKeyHeld = new Map();   // key code → pad (1–16), lit while the key is down
  const bpKeyEl = i => bpGrid.querySelector(`.bp-pad[data-k="${BPS.bank * 16 + i}"]`);
  function bpKeyLight(i, on) { const el = bpKeyEl(i); if (el) el.classList.toggle("kd", on); }
  // hold Shift for note repeat (like holding an MPC's Note Repeat); it isn't saved, and lets go with the key
  function bpRepShift(on) {
    if (on) { if (BPS.rep || BP.shiftRep) return; BP.shiftRep = true; BPS.rep = true; }
    else { if (!BP.shiftRep) return; BP.shiftRep = false; BPS.rep = false; BP.rep.clear(); bpSave(); }
    const rb = document.getElementById("bpRep"); if (rb) rb.setAttribute("aria-pressed", String(!!BPS.rep));
  }
  function bpKeysOff() { bpKeyHeld.forEach((i, code) => { bpUp("k" + code); bpKeyLight(i, false); }); bpKeyHeld.clear(); bpRepShift(false); }
  function bpBankStep(d) { const nb = (BPS.bank + d + 4) % 4, btn = document.querySelector(`#bpBanks button[data-b="${nb}"]`); bpKeysOff(); if (btn) btn.click(); }
  function bpSeqStep(d) { const n = ((BPS.cur + d) % 8 + 8) % 8; bpSeqSelect(n); noteMsg(BP.playing && BP.queued != null ? "Seq " + (n + 1) + " plays next" : "Seq " + (n + 1)); }
  window.addEventListener("keydown", e => {
    if (bpView.hidden) return;
    const tg = e.target, range = !!(tg && tg.type === "range");
    if (tg && ((/INPUT|SELECT|TEXTAREA/.test(tg.tagName) && !range) || tg.isContentEditable)) return;
    if (!document.getElementById("bpHelp").hidden || !document.getElementById("bpKitSheet").hidden) return;   // a sheet on top keeps its own keys (Esc closes it)
    const done = () => { e.preventDefault(); e.stopImmediatePropagation(); if (KBD_LABELS === null) kbSeen(); };
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyZ") { done(); if (!e.repeat) { const u = document.getElementById("bpUndo"); if (u && !u.disabled) u.click(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") { if (!e.repeat) bpRepShift(true); return; }
    if (e.code === "Space") { done(); if (!e.repeat) bpTransport(!BP.playing); return; }
    if (e.code === "Enter" || e.code === "NumpadEnter") { done(); if (!e.repeat) bpStartRec(); return; }
    if (!range && (e.code === "ArrowLeft" || e.code === "ArrowRight")) { done(); bpBankStep(e.code === "ArrowRight" ? 1 : -1); return; }
    if (!range && (e.code === "ArrowUp" || e.code === "ArrowDown")) { done(); if (!e.repeat) bpSeqStep(e.code === "ArrowUp" ? 1 : -1); return; }
    const i = bpKeyPad(e); if (i < 0) return;
    done(); if (e.repeat || bpKeyHeld.has(e.code || e.key)) return;
    const id = e.code || e.key; bpKeyHeld.set(id, i); bpKeyLight(i, true);
    bpDown(BPS.bank * 16 + i, BPS.full ? 1 : 0.85, "k" + id);
  }, true);
  window.addEventListener("keyup", e => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") bpRepShift(false);
    if (bpView.hidden) { if (bpKeyHeld.size) bpKeysOff(); return; }
    if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); e.stopImmediatePropagation(); return; }   // (a focused button would click too)
    const id = e.code || e.key, i = bpKeyHeld.get(id); if (i == null) return;
    e.stopImmediatePropagation(); bpKeyHeld.delete(id); bpKeyLight(i, false); bpUp("k" + id);
  }, true);
  window.addEventListener("blur", () => { if (bpKeyHeld.size || BP.shiftRep) bpKeysOff(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && (bpKeyHeld.size || BP.shiftRep)) bpKeysOff(); });
  // ---------- the screen ----------
  const BP_ROWS = [12, 8, 4, 0];   // top row shows pads 13–16; pad 1 is bottom-left
  const BP_KEYCAP = ["Z", "X", "C", "V", "A", "S", "D", "F", "Q", "W", "E", "R", "1", "2", "3", "4"];
  function bpPaintGrid() {
    const bk = BPS.bank, used = new Set(BPS.ev.map(e => e.k));
    bpGrid.style.setProperty("--bk", BP_BANK_COL[bk]);
    let h = "";
    BP_ROWS.forEach(r => { for (let c = 0; c < 4; c++) { const i = r + c, k = bk * 16 + i, P = BPS.banks[bk][i];
      h += `<button class="bp-pad${P && P.src ? "" : " empty"}${BPS.sel === k ? " sel" : ""}${used.has(k) ? " has" : ""}" data-k="${k}" aria-label="Pad ${i + 1}${P && P.src ? ": " + bpName(P) : " (empty)"}"><b>${i + 1}</b><i>${BP_KEYCAP[i]}</i><span>${P && P.src ? (typeof P.src === "object" ? (P.src.nm || "Chop " + (P.src.n || "")) : bpName(P)) : "empty"}</span></button>`; } });
    bpGrid.innerHTML = h;
    document.getElementById("bpBanks").innerHTML = "ABCD".split("").map((L, b) => `<button data-b="${b}" style="--bk:${BP_BANK_COL[b]}" aria-pressed="${b === bk}">${L}<small>${BPS.banks[b].filter(p => p && p.src).length}</small></button>`).join("")
      + `<button class="bp-bkit" data-kit title="Load a whole kit onto bank ${"ABCD"[bk]}" aria-label="Load a kit onto bank ${"ABCD"[bk]}">Kit…</button>`
      + `<button class="bp-bclr" data-clr${BPS.banks[bk].some(p => p && p.src) ? "" : " disabled"} title="Empty every pad on bank ${"ABCD"[bk]}" aria-label="Clear every pad on bank ${"ABCD"[bk]}">Clear ${"ABCD"[bk]}</button>`;
  }
  function bpMarkSel() { bpGrid.querySelectorAll(".bp-pad").forEach(el => el.classList.toggle("sel", +el.dataset.k === BPS.sel)); }
  function bpFlash(k, t) {
    const ms = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => { const el = bpGrid.querySelector(`.bp-pad[data-k="${k}"]`); if (!el) return; el.classList.add("hit"); setTimeout(() => el.classList.remove("hit"), 110); }, ms);
  }
  function bpClearBank() {
    const bk = BPS.bank, L = "ABCD"[bk], pads = BPS.banks[bk], n = pads.filter(p => p && p.src).length;
    if (!n) return;
    const keepPads = pads.map(p => p && Object.assign({}, p)), keepEv = BPS.ev, cur = BPS.cur, lo = bk * 16, hi = lo + 16;
    BPS.banks[bk] = pads.map(() => bpPadDef(null));
    BPS.ev = BPS.ev.filter(e => e.k < lo || e.k >= hi);
    const gone = keepEv.length - BPS.ev.length;
    const paint = () => { bpSave(); bpPaintGrid(); bpPaintEdit(); bpPaintTop(); if (typeof bpL16Paint === "function") bpL16Paint(); };
    paint();
    undoToast("Emptied bank " + L + ": " + n + (n === 1 ? " pad" : " pads") + (gone ? ", " + gone + (gone === 1 ? " hit" : " hits") + " in Seq " + (cur + 1) : ""), () => {
      BPS.banks[bk] = keepPads.map(p => Object.assign(bpPadDef(null), p || {}));
      if (BPS.cur === cur) BPS.ev = keepEv; else if (BPS.seqs && BPS.seqs[cur]) BPS.seqs[cur].ev = keepEv;
      paint();
    });
  }
  document.getElementById("bpBanks").addEventListener("click", e => { if (e.target.closest("button[data-clr]")) { bpClearBank(); return; } const b = e.target.closest("button[data-b]"); if (!b) return; BPS.bank = +b.dataset.b; BPS.sel = BPS.bank * 16 + (BPS.sel % 16); bpSave(); bpPaintGrid(); bpPaintEdit(); });
  const bpPlayBtn = document.getElementById("bpPlay"), bpRecBtn = document.getElementById("bpRec");
  function bpPaintTop() {
    bpPlayBtn.textContent = BP.playing ? "■ Stop" : "▶ Play"; bpPlayBtn.setAttribute("aria-pressed", String(BP.playing));
    bpRecBtn.setAttribute("aria-pressed", String(BP.rec)); bpRecBtn.classList.toggle("armed", !!BP.armed); bpRecBtn.textContent = BP.armed ? "● Count-in…" : BP.rec ? "● Recording" : "● Rec";
    document.getElementById("bpBpm").textContent = (Math.round(rcBpm() * 10) / 10) + " bpm" + (rcFollow() ? " · DJ" : "");
    const on = !!(FXC.by.bp && FXC.by.bp.on), fb = document.getElementById("bpFx"); fb.setAttribute("aria-pressed", String(on)); fb.textContent = on ? "Effects on Beat Pads: On" : "Effects on Beat Pads: Off";
    { const u = document.getElementById("bpUndo"); if (u && window.__nbCanUndo) u.disabled = !__nbCanUndo("bp"); }
    bpBtn.classList.toggle("live", BP.playing); bpBtn.setAttribute("aria-label", BP.playing ? "Beats (playing)" : "Beats");
    ["bpBars", "bpQ", "bpRate"].forEach(id => { const el = document.getElementById(id), v = { bpBars: BPS.bars, bpQ: BPS.q, bpRate: BPS.rate }[id]; const o = [...el.options].find(x => Math.abs(+x.value - +v) < 0.01); if (o) el.value = o.value; });
    document.getElementById("bpQs").value = Math.round(BPS.qs * 100); document.getElementById("bpQsV").textContent = Math.round(BPS.qs * 100) + "%";
    document.getElementById("bpSw").value = Math.round(BPS.sw * 100); document.getElementById("bpSwV").textContent = Math.round(BPS.sw * 100) + "%";
    [["bpRep", BPS.rep], ["bpFull", BPS.full], ["bpClick", BPS.click], ["bpCin", BPS.cin]].forEach(([id, v]) => document.getElementById(id).setAttribute("aria-pressed", String(!!v)));
  }
  const BP_KN = [["level", "Level", 0, 1, v => Math.round(v * 100)], ["tune", "Tune", -24, 24, v => (v > 0 ? "+" : "") + Math.round(v) + " st"], ["decay", "Decay", 0, 1, v => v >= 0.5 ? "full" : Math.round(v * 200) + "%"], ["tone", "Tone", 0, 1, v => v < 0.48 ? "darker" : v > 0.52 ? "brighter" : "flat"], ["pan", "Pan", -1, 1, v => Math.abs(v) < 0.01 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100)]];
  function bpPaintEdit() {
    const k = BPS.sel, P = bpPad(k), el = document.getElementById("bpEdit"); if (!P) { el.innerHTML = ""; return; }
    const isChop = P.src && typeof P.src === "object";
    let opts = rcSoundOptions(typeof P.src === "string" ? P.src : "").replace(/<option value="an:[^"]*"[^>]*>[^<]*<\/option>/g, "");
    opts = `<option value=""${P.src ? "" : " selected"}>Empty</option>` + (isChop ? `<option value="__chop" selected>${bpName(P)}</option>` : "") + opts;
    el.innerHTML = `<div class="bp-edhead"><strong>Pad ${k % 16 + 1} · bank ${"ABCD"[Math.floor(k / 16)]}</strong><select id="bpSnd" aria-label="Pad sound">${opts}</select>
        <button class="btn" id="bpAud" title="Hear it">▶</button>
        <label class="rc-mini">Choke <select id="bpChoke"><option value="0">Off</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        ${isChop ? `<button class="btn" id="bpRev" aria-pressed="${!!P.rev}">Reverse</button>` : ""}
        <button class="btn" id="bpErase" title="Remove this pad's hits from the loop">Erase hits</button></div>
      <div class="bp-knobs">` + BP_KN.map(([kk, lab, lo, hi, fmt]) => `<label class="rc-k"><span>${lab}<em id="bpV_${kk}">${fmt(P[kk])}</em></span><input type="range" data-k="${kk}" min="${lo}" max="${hi}" step="${kk === "tune" ? 1 : 0.01}" value="${P[kk]}"></label>`).join("") + `</div>`;
    el.querySelector("#bpChoke").value = String(P.choke || 0);
  }
  const bpEditEl = document.getElementById("bpEdit");
  let bpAudT = 0;
  function bpAudPaint() {
    const b = document.getElementById("bpAud"); if (!b) return;
    const on = !!(BP.aud && ctx && BP.aud.end > ctx.currentTime + 0.05);
    b.textContent = on ? "■" : "▶"; b.setAttribute("aria-label", on ? "Stop" : "Hear it"); b.title = on ? "Stop" : "Hear it";
    clearTimeout(bpAudT); if (on) bpAudT = setTimeout(bpAudPaint, (BP.aud.end - ctx.currentTime) * 1000 + 60);
  }
  function bpAudition(k, toggle) {
    start(); if (!ctx) return;
    const now = ctx.currentTime;
    if (BP.aud && BP.aud.end > now + 0.05) { bpFade(BP.aud, now, 0.03); BP.aud = null; if (toggle) { bpAudPaint(); return; } }
    const v = bpHit(k, now + 0.01, 0.85); if (!v) return;
    if (v.end > now + 4.01) { try { v.cg.gain.setValueAtTime(v.cg.gain.value, now + 3.6); v.cg.gain.linearRampToValueAtTime(0, now + 4); } catch (e) {} v.end = now + 4; }
    BP.aud = v.end - now > 0.6 ? v : null; bpAudPaint();
  }
  bpEditEl.addEventListener("input", e => { const kk = e.target.dataset && e.target.dataset.k, P = bpPad(BPS.sel); if (!kk || !P) return; P[kk] = +e.target.value; const K = BP_KN.find(x => x[0] === kk); document.getElementById("bpV_" + kk).textContent = K[4](P[kk]); bpSave(); });
  bpEditEl.addEventListener("change", e => {
    const P = bpPad(BPS.sel); if (!P) return;
    if (e.target.id === "bpSnd") { const v = e.target.value; if (v === "__chop") return; P.src = v || null; P.rev = false; if (v && rcEngine(v) === "smp") rcSampleBuf(v); bpSave(); bpPaintGrid(); bpPaintEdit(); if (v) setTimeout(() => bpAudition(BPS.sel), 250); }
    if (e.target.id === "bpChoke") { P.choke = +e.target.value; bpSave(); }
  });
  bpEditEl.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; const P = bpPad(BPS.sel);
    if (b.id === "bpAud") bpAudition(BPS.sel, true);
    if (b.id === "bpRev" && P) { P.rev = !P.rev; bpSave(); bpPaintEdit(); bpAudition(BPS.sel); }
    if (b.id === "bpErase") { const before = BPS.ev.length; BPS.ev = BPS.ev.filter(x => x.k !== BPS.sel); bpSave(); bpPaintGrid(); BP.loopDirty = true; noteMsg("Erased " + (before - BPS.ev.length) + " hits"); }
  });
  // ---------- the loop strip ----------
  const loopCv = document.getElementById("bpLoopCv");
  function bpDrawLoop() {
    const W = loopCv.clientWidth, H = loopCv.clientHeight; if (!W) return;
    const dpr = Math.min(2, devicePixelRatio || 1); if (loopCv.width !== Math.round(W * dpr)) { loopCv.width = Math.round(W * dpr); loopCv.height = Math.round(H * dpr); }
    const c = loopCv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const L = BPS.bars * 16;
    for (let s = 0; s <= L; s += 4) { c.fillStyle = s % 16 === 0 ? "rgba(196,163,255,0.45)" : "rgba(255,255,255,0.08)"; c.fillRect(Math.round(s / L * (W - 1)), 0, 1, H); }
    BPS.ev.forEach(e => { const x = bpQ(e.s) / L * W, b = Math.floor(e.k / 16), row = e.k % 16; c.fillStyle = BP_BANK_COL[b]; c.globalAlpha = 0.35 + 0.65 * e.v; c.fillRect(x - 1, 3 + (15 - row) / 16 * (H - 8), 3, 3); });
    c.globalAlpha = 1;
    if (BP.playing && ctx) { const p = bpPosAt(ctx.currentTime); if (p >= 0) { const x = ((p % L) + L) % L / L * W; c.fillStyle = BP.rec ? "#e5484d" : "#7fd6c2"; c.fillRect(x - 1, 0, 2, H); } }
    const st = document.getElementById("bpStatus"), p = BP.playing && ctx ? bpPosAt(ctx.currentTime) : null;
    st.textContent = bpSeqTag() + (p == null ? BPS.ev.length + " hits · " + BPS.bars + " bar" + (BPS.bars > 1 ? "s" : "") : p < 0 && BP.aPos < 0 ? "count-in " + (4 - Math.floor((p + 16) / 4)) : "bar " + (Math.floor((((p % L) + L) % L) / 16) + 1) + " of " + BPS.bars + " · " + BPS.ev.length + " hits");
  }
  let bpLast = 0;
  (function frame(ts) { requestAnimationFrame(frame); if (bpView.hidden) return; if (ts - bpLast < (window.NB_LITE ? 50 : 33)) return; bpLast = ts; bpDrawLoop(); })(0);
  // ---------- controls ----------
  bpPlayBtn.addEventListener("click", () => bpTransport(!BP.playing));
  bpRecBtn.addEventListener("click", bpStartRec);
  document.getElementById("bpUndo").addEventListener("click", () => {
    if (!BPS.ev.length) return; const last = Math.max(...BPS.ev.map(e => e.pass || 0)); const n0 = BPS.ev.length;
    BPS.ev = BPS.ev.filter(e => (e.pass || 0) !== last); bpSave(); bpPaintGrid(); bpPaintTop(); noteMsg("Took back the last pass (" + (n0 - BPS.ev.length) + " hits)");
  });
  document.getElementById("bpClear").addEventListener("click", () => {
    if (!BPS.ev.length) return; try { window.__nbStep && __nbStep("bp", "Beat Pads · Clear"); } catch (e) {} const keep = BPS.ev; BPS.ev = []; bpSave(); bpPaintGrid(); bpPaintTop();
    undoToast("Cleared " + keep.length + " hits", () => { BPS.ev = keep; bpSave(); bpPaintGrid(); bpPaintTop(); });
  });
  document.getElementById("bpFx").addEventListener("click", () => { start(); const p = fxcParams("bp"); p.on = !p.on; fxcSave(); if (ctx) { fxcGet("bp"); applyFx(); bpBus(); } bpPaintTop(); });
  document.getElementById("bpBars").addEventListener("change", e => { BPS.bars = +e.target.value; BPS.ev = BPS.ev.filter(x => x.s < BPS.bars * 16); bpSave(); bpPaintTop(); bpPaintGrid(); });
  document.getElementById("bpQ").addEventListener("change", e => { BPS.q = +e.target.value; bpSave(); });
  document.getElementById("bpRate").addEventListener("change", e => { BPS.rate = +e.target.value; bpSave(); });
  document.getElementById("bpQs").addEventListener("input", e => { BPS.qs = +e.target.value / 100; document.getElementById("bpQsV").textContent = e.target.value + "%"; bpSave(); });
  document.getElementById("bpSw").addEventListener("input", e => { BPS.sw = +e.target.value / 100; document.getElementById("bpSwV").textContent = e.target.value + "%"; bpSave(); });
  [["bpRep", "rep"], ["bpFull", "full"], ["bpClick", "click"], ["bpCin", "cin"]].forEach(([id, k]) => document.getElementById(id).addEventListener("click", () => { BPS[k] = !BPS[k]; bpSave(); bpPaintTop(); }));
  document.getElementById("bpDone").addEventListener("click", () => { bpView.hidden = true; });
  document.getElementById("bpHelpBtn").addEventListener("click", () => { document.getElementById("bpHelp").hidden = false; });
  document.getElementById("bpHelpDone").addEventListener("click", () => { document.getElementById("bpHelp").hidden = true; });
  function bpHush() {
    if (ctx) { const now = ctx.currentTime; BP.voices.forEach(v => { if (v.end > now) bpFade(v, now); }); }
    BP.held.clear(); BP.rep.clear(); BP.free = false; BP.aud = null; BP.wav = null; if (typeof bpAudPaint === "function") bpAudPaint();
  }
  document.getElementById("stopAll").addEventListener("click", () => { bpTransport(false); bpHush(); });
  { const pe = bpPaintEdit; let dirty = false;   // (138: a hit on a hidden Beat Pads used to rebuild the editor each time)
    bpPaintEdit = function () { if (bpView.hidden) { dirty = true; return; } dirty = false; return pe.apply(this, arguments); };
    new MutationObserver(() => { if (!bpView.hidden && dirty) bpPaintEdit(); }).observe(bpView, { attributes: true, attributeFilter: ["hidden"] }); }
  document.addEventListener("visibilitychange", () => { if (document.hidden && BP.playing && !nbKeepPlaying()) bpTransport(false); });
  bpBtn.addEventListener("click", () => {
    start(); bpView.hidden = false; bpPaintGrid(); bpPaintEdit(); bpPaintTop(); bpPaintChop();
    if (ctx) BPS.banks.flat().forEach(P => { if (P && typeof P.src === "string" && rcEngine(P.src) === "smp") rcSampleBuf(P.src); });
  });
  setInterval(() => { if (!bpView.hidden) { const t = (Math.round(rcBpm() * 10) / 10) + " bpm" + (rcFollow() ? " · DJ" : ""), el = document.getElementById("bpBpm"); if (el.textContent !== t) el.textContent = t; } }, 500);
  { const mc = mixChannels; mixChannels = function () { const ch = mc(); ch.push({ group: "Beat Pads", name: "Beat Pads", sub: "all 64 pads", get: () => BPS.level, set: v => { BPS.level = v; if (BP.bus) BP.bus.gain.setTargetAtTime(v, ctx.currentTime, 0.03); bpSave(); }, dflt: 0.85, live: true }); return ch; }; }
  // ---------- chop ----------
  const bpSrc = document.getElementById("bpSrc"), bpWave = document.getElementById("bpWave");
  let bpCuts = null;
  function bpPaintChop() {
    let h = ""; for (let i = 0; i < NSLOTS; i++) h += `<option value="${i}"${i === BPS.src ? " selected" : ""}${sampBuf[i] ? "" : " disabled"}>S${i + 1}${sampBuf[i] ? " · " + baseName(state.samp.slots[i].name || "sample") : " (empty)"}</option>`;
    bpSrc.innerHTML = h;
    document.getElementById("bpMode").value = BPS.mode; document.getElementById("bpSens").value = Math.round(BPS.sens * 100); document.getElementById("bpTo").value = "ABCD"[BPS.to];
    bpCuts = sampBuf[BPS.src] ? bpCut(sampBuf[BPS.src]) : null; bpDrawWave();
  }
  function bpCut(b) {
    const d = b.duration;
    if (BPS.mode !== "tr") { const n = +BPS.mode; return new Array(n).fill(0).map((_, i) => i * d / n); }
    const x = b.getChannelData(0), x2 = b.numberOfChannels > 1 ? b.getChannelData(1) : x, sr = b.sampleRate, hop = 256, N = Math.floor(x.length / hop);
    const e = new Float32Array(N); for (let f = 0; f < N; f++) { let s2 = 0; for (let i = f * hop; i < f * hop + hop; i++) { const v = (x[i] + x2[i]) * 0.5; s2 += v * v; } e[f] = Math.log(1e-5 + Math.sqrt(s2 / hop)); }
    const fl = new Float32Array(N); for (let f = 1; f < N; f++) fl[f] = Math.max(0, e[f] - e[f - 1]);
    let m = 0, sq = 0; for (let f = 0; f < N; f++) { m += fl[f]; sq += fl[f] * fl[f]; } m /= N; const sdv = Math.sqrt(Math.max(0, sq / N - m * m));
    const thr = m + (2.6 - BPS.sens * 2.2) * sdv, gap = Math.round(0.07 * sr / hop), peaks = [];
    for (let f = 2; f < N - 1; f++) if (fl[f] > thr && fl[f] >= fl[f - 1] && fl[f] >= fl[f + 1]) { if (peaks.length && f - peaks[peaks.length - 1][0] < gap) { if (fl[f] > peaks[peaks.length - 1][1]) peaks[peaks.length - 1] = [f, fl[f]]; } else peaks.push([f, fl[f]]); }
    const top = peaks.sort((a, b2) => b2[1] - a[1]).slice(0, 15).map(p => Math.max(0, (p[0] - 1) * hop / sr - 0.003));
    const cuts = [0].concat(top.filter(t => t > 0.03)).sort((a, b2) => a - b2);
    return cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.03).slice(0, 16);
  }
  function bpDrawWave() {
    const W = bpWave.clientWidth, H = bpWave.clientHeight; if (!W) return;
    const dpr = Math.min(2, devicePixelRatio || 1); bpWave.width = Math.round(W * dpr); bpWave.height = Math.round(H * dpr);
    const c = bpWave.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const b = sampBuf[BPS.src];
    if (!b) { c.fillStyle = "#8e86a6"; c.font = "12px system-ui"; c.fillText("Pick a sampler slot with a sound in it, or load a WAV / MP3", 10, H / 2 + 4); return; }
    const x = b.getChannelData(0), n = x.length, step = Math.max(1, Math.floor(n / W));
    c.fillStyle = "#c4a3ff";
    for (let px = 0; px < W; px++) { let mx = 0; const i0 = Math.floor(px / W * n); for (let i = i0; i < Math.min(n, i0 + step); i++) { const v = Math.abs(x[i]); if (v > mx) mx = v; } const h = Math.max(1, mx * (H - 6)); c.fillRect(px, (H - h) / 2, 1, h); }
    if (bpCuts) bpCuts.forEach((t, i) => { const px = t / b.duration * W; c.fillStyle = BP_BANK_COL[BPS.to]; c.fillRect(px, 0, 1.5, H); c.font = "600 10px ui-monospace,monospace"; c.fillText(String(i + 1), px + 3, 11); });
  }
  bpWave.addEventListener("click", e => {
    const b = sampBuf[BPS.src]; if (!b || !bpCuts) return; start(); if (!ctx) return;
    const r = bpWave.getBoundingClientRect(), t = (e.clientX - r.left) / r.width * b.duration; let i = 0; bpCuts.forEach((c0, j) => { if (c0 <= t) i = j; });
    const now = ctx.currentTime;
    if (BP.wav && BP.wav.end > now + 0.05) { const same = BP.wav.i === i && BP.wav.src === BPS.src; bpFade(BP.wav, now, 0.02); BP.wav = null; if (same) return; }
    const s0 = bpCuts[i], s1 = Math.min(bpCuts[i + 1] ?? b.duration, s0 + 6), src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; g.gain.value = 0.9; src.connect(g).connect(bpBus());
    const t0 = now + 0.01, d = s1 - s0; src.start(t0, s0, d); src.stop(t0 + d + 0.02); if (d > 0.1) { g.gain.setValueAtTime(0.9, t0 + d - 0.03); g.gain.linearRampToValueAtTime(0, t0 + d); }
    BP.wav = { k: -1, cg: g, end: t0 + d, i, src: BPS.src }; BP.voices.push(BP.wav);
    src.onended = () => { try { g.disconnect(); } catch (er) {} };
  });
  bpSrc.addEventListener("change", () => { BPS.src = +bpSrc.value; bpSave(); bpPaintChop(); });
  document.getElementById("bpMode").addEventListener("change", e => { BPS.mode = e.target.value; bpSave(); bpPaintChop(); });
  document.getElementById("bpSens").addEventListener("input", e => { BPS.sens = +e.target.value / 100; if (sampBuf[BPS.src]) { bpCuts = bpCut(sampBuf[BPS.src]); bpDrawWave(); } });
  document.getElementById("bpSens").addEventListener("change", () => bpSave());
  document.getElementById("bpTo").addEventListener("change", e => { BPS.to = "ABCD".indexOf(e.target.value); bpSave(); bpDrawWave(); });
  document.getElementById("bpChopGo").addEventListener("click", () => {
    const b = sampBuf[BPS.src]; if (!b) { noteMsg("Load a sound first"); return; }
    const cuts = bpCut(b), bank = BPS.to, keep = BPS.banks[bank].map(p => Object.assign({}, p)), keepEv = BPS.ev;
    const cap = BPS.mode === "tr" ? 8 : Infinity;
    BPS.banks[bank] = new Array(16).fill(null).map((_, i) => i < cuts.length ? Object.assign(bpPadDef({ slot: BPS.src, a: cuts[i], b: Math.min(cuts[i + 1] ?? b.duration, cuts[i] + cap), n: i + 1 }), {}) : bpPadDef(null));
    BPS.ev = BPS.ev.filter(e => Math.floor(e.k / 16) !== bank || (e.k % 16) < cuts.length);
    BPS.bank = bank; BPS.sel = bank * 16; bpSave(); bpPaintGrid(); bpPaintEdit(); bpPaintChop();
    undoToast(cuts.length + " slices on bank " + "ABCD"[bank] + " · pad 1 is the start", () => { BPS.banks[bank] = keep; BPS.ev = keepEv; bpSave(); bpPaintGrid(); bpPaintEdit(); });
  });
  document.getElementById("bpLoad").addEventListener("click", () => { start(); document.getElementById("bpFile").click(); });
  document.getElementById("bpFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f || !ctx) return;
    try {
      const buf = await decode(await f.arrayBuffer());
      let slot = sampBuf.findIndex((x, i) => !x && i < NSLOTS); if (slot < 0) slot = BPS.src;
      setSample(slot, buf, f.name); storeSample(slot, f.name, bufferToWav(buf));
      BPS.src = slot; bpSave(); bpPaintChop(); noteMsg("Loaded " + f.name + " into S" + (slot + 1));
    } catch (err) { noteMsg("Couldn't read that file", true); }
  });
  window.__bp = { BPS, BP, hit: (k, v) => bpHit(k, ctx.currentTime + 0.01, v), down: bpDown, up: bpUp, transport: bpTransport, rec: bpStartRec, q: bpQ, cut: () => bpCuts };
  bpPaintTop();


