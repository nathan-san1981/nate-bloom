  // ======================================================================
  // Beat Pads part 2: sequences and song, 16 Levels, resample, → Tracks, MIDI clock from Beat Pads / Rhythm Creator
  // ======================================================================
  BP.absBase = 0; BP.queued = null; BP.songPos = 0; BP.songRep = 0; BP.off = null; BP.busy = false;
  const bpOut = () => BP.off || bpBus();
  function bpSeqSync() { const q = BPS.seqs && BPS.seqs[BPS.cur]; if (q) { q.ev = BPS.ev; q.bars = BPS.bars; } }
  function bpSeqLoad(n) {   // sequence n becomes the one that plays and records
    bpSeqSync(); BPS.ev.forEach(e => { delete e.cyc; }); BPS.cur = n; const q = BPS.seqs[n]; BPS.ev = q.ev; BPS.bars = q.bars; BPS.ev.forEach(e => { delete e.cyc; });
  }
  function bpMarkHas() { const used = new Set(BPS.ev.map(e => e.k)); bpGrid.querySelectorAll(".bp-pad").forEach(el => el.classList.toggle("has", !BPS.l16 && used.has(+el.dataset.k))); }
  function bpSeqSelect(n) {
    if (BP.playing) {
      if (BPS.songOn && BPS.song.length) { noteMsg("The song is playing: turn Song off to pick a sequence"); return; }
      if (BP.rec || BP.armed) { BP.rec = false; BP.armed = false; BPS.ev.forEach(e => { delete e.cyc; }); }
      BP.queued = n === BPS.cur ? null : n; bpPaintTop(); return;
    }
    if (n === BPS.cur) return;
    bpSeqLoad(n); bpSave(); bpPaintGrid(); bpPaintTop();
  }
  function bpSongTop() {   // Play: the song (when on) starts from its first step
    BP.absBase = 0; BP.queued = null; BP.songPos = 0; BP.songRep = 0;
    if (BPS.songOn && BPS.song.length) { if (BPS.cur !== BPS.song[0].n) { bpSeqLoad(BPS.song[0].n); setTimeout(() => { bpMarkHas(); bpPaintTop(); }, 0); } }
  }
  function bpNextAt() {   // at the end of a pass: which sequence plays next (null: the same one loops)
    if (BP.queued != null) { const n = BP.queued; BP.queued = null; return n; }
    if (!(BPS.songOn && BPS.song.length)) return null;
    if (!(BP.songPos >= 0 && BP.songPos < BPS.song.length)) { BP.songPos = 0; BP.songRep = 0; return BPS.song[0].n; }
    BP.songRep++;
    if (BP.songRep >= BPS.song[BP.songPos].x) { BP.songPos = (BP.songPos + 1) % BPS.song.length; BP.songRep = 0; }
    return BPS.song[BP.songPos].n;
  }
  function bpAdvance(n, tb, end) {   // the next pass starts at tb, in sequence n
    BP.absBase += end;
    for (const h of BP.rep.values()) h.next -= end;
    if (n !== BPS.cur) bpSeqLoad(n);
    BP.aT = tb; BP.aPos = 0; BP.sched = 0;
    setTimeout(() => { bpMarkHas(); bpPaintTop(); }, Math.max(0, (tb - ctx.currentTime) * 1000));
  }
  function bpSeqTag() {
    const q = BP.queued != null ? " → Seq " + (BP.queued + 1) + " next" : "";
    if (BP.playing && BPS.songOn && BPS.song.length && BP.songPos >= 0) return "Song " + (BP.songPos + 1) + "/" + BPS.song.length + " · Seq " + (BPS.cur + 1) + " · ";
    return "Seq " + (BPS.cur + 1) + q + " · ";
  }
  function bpSongSegs() { bpSeqSync(); const out = []; BPS.song.forEach(st => { for (let r = 0; r < st.x; r++) out.push({ ev: BPS.seqs[st.n].ev, bars: BPS.seqs[st.n].bars, n: st.n }); }); return out; }
  // ---------- 16 Levels ----------
  const BP_L16 = { tune: i => ({ t: i - 8 }), vel: () => ({}), decay: i => ({ d: Math.round((0.03 + 0.47 * i / 15) * 1000) / 1000 }), filter: i => ({ f: Math.round((0.02 + 0.48 * i / 15) * 1000) / 1000 }) };
  const bpL16Vel = i => Math.round((0.1 + 0.9 * i / 15) * 100) / 100;
  function bpL16(k, vel) {
    if (!BPS.l16) return null;
    const P = bpPad(BPS.l16src); if (!P || !P.src) return null;
    const i = k % 16;
    return { src: BPS.l16src, mod: Object.assign({ i }, BP_L16[BPS.l16p](i)), vel: BPS.l16p === "vel" ? bpL16Vel(i) : vel };
  }
  function bpModPad(P, m) { const o = Object.assign({}, P); if (m.t != null) o.tune = Math.max(-36, Math.min(36, P.tune + m.t)); if (m.d != null) o.decay = m.d; if (m.f != null) o.tone = m.f; return o; }
  function bpL16Label(i) {
    const m = BP_L16[BPS.l16p](i);
    if (BPS.l16p === "tune") return m.t === 0 ? "0 st" : (m.t > 0 ? "+" : "−") + Math.abs(m.t) + " st";
    if (BPS.l16p === "vel") return "vel " + Math.round(bpL16Vel(i) * 127);
    if (BPS.l16p === "decay") return i === 15 ? "full" : Math.round(m.d / 0.5 * 100) + "%";
    if (m.f >= 0.48) return "open";
    const hz = 300 * Math.pow(2, m.f / 0.48 * 6); return hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz) + " Hz";
  }
  function bpL16Paint() {
    const P = bpPad(BPS.l16src), on = !!(BPS.l16 && P && P.src);
    bpGrid.classList.toggle("l16", on);
    if (!on) return;
    const nm = bpName(P);
    bpGrid.querySelectorAll(".bp-pad").forEach(el => { const i = +el.dataset.k % 16; el.classList.remove("empty", "sel", "has"); el.querySelector("span").textContent = bpL16Label(i); el.setAttribute("aria-label", "Pad " + (i + 1) + ": " + nm + ", " + bpL16Label(i)); });
  }
  { const pg = bpPaintGrid; bpPaintGrid = function () { pg(); bpL16Paint(); }; }
  // ---------- the controls ----------
  function bpSeqPaint() {
    const box = document.getElementById("bpSeqs"); if (!box) return;
    bpSeqSync();
    box.innerHTML = BPS.seqs.map((q, n) => `<button data-n="${n}" aria-pressed="${n === BPS.cur}" class="${q.ev.length ? "has" : ""}${BP.queued === n ? " q" : ""}" aria-label="Sequence ${n + 1}, ${q.ev.length ? q.ev.length + " hits" : "empty"}">${n + 1}</button>`).join("");
    document.getElementById("bpSong").setAttribute("aria-pressed", String(BPS.songOn));
    document.getElementById("bpSong").textContent = BPS.songOn ? "Song ✓" : "Song";
    document.getElementById("bpSongBox").hidden = !BPS.songOn;
    document.getElementById("bpAddSeq").textContent = "+ Seq " + (BPS.cur + 1);
    const pos = BP.playing && BPS.songOn ? BP.songPos : -1;
    document.getElementById("bpChain").innerHTML = BPS.song.map((st, j) => `<span class="bp-chip${j === pos ? " now" : ""}" data-j="${j}"><button data-act="x" aria-label="Step ${j + 1}: sequence ${st.n + 1}, ${st.x} time${st.x > 1 ? "s" : ""}; tap for more">${st.n + 1}${st.x > 1 ? " ×" + st.x : ""}</button><button data-act="del" aria-label="Remove step ${j + 1}">✕</button></span>`).join("");
    const bars = BPS.song.reduce((a, st) => a + st.x * BPS.seqs[st.n].bars, 0);
    document.getElementById("bpSongInfo").textContent = BPS.song.length ? BPS.song.length + " step" + (BPS.song.length > 1 ? "s" : "") + " · " + bars + " bars" : "";
    const P = bpPad(BPS.l16src), l16 = !!(BPS.l16 && P && P.src);
    document.getElementById("bpL16").setAttribute("aria-pressed", String(l16));
    document.getElementById("bpL16p").value = BPS.l16p;
    document.getElementById("bpL16Tag").textContent = l16 ? bpName(P) + " on all 16" : "";
  }
  { const pt = bpPaintTop; bpPaintTop = function () { pt(); bpSeqPaint(); }; }
  document.getElementById("bpSeqs").addEventListener("click", e => { const b = e.target.closest("button[data-n]"); if (b) bpSeqSelect(+b.dataset.n); });
  document.getElementById("bpCopy").addEventListener("click", () => {
    bpSeqSync();
    if (!BPS.ev.length) { noteMsg("This sequence is empty: nothing to copy"); return; }
    const to = BPS.seqs.findIndex((q, n) => n !== BPS.cur && !q.ev.length);
    if (to < 0) { noteMsg("All 8 sequences have hits: clear one first"); return; }
    BPS.seqs[to] = { ev: BPS.ev.map(e => { const o = Object.assign({}, e); delete o.cyc; if (o.m) o.m = Object.assign({}, o.m); return o; }), bars: BPS.bars };
    const from = BPS.cur; bpSave();
    if (BP.playing && BPS.songOn && BPS.song.length) { bpPaintTop(); noteMsg("Copied Seq " + (from + 1) + " to Seq " + (to + 1)); return; }
    bpSeqSelect(to); noteMsg("Copied Seq " + (from + 1) + " to Seq " + (to + 1) + (BP.playing ? ": it takes over at the end of the loop" : ""));
  });
  document.getElementById("bpSong").addEventListener("click", () => {
    BPS.songOn = !BPS.songOn;
    if (BPS.songOn && !BPS.song.length) BPS.song.push({ n: BPS.cur, x: 1 });
    if (BPS.songOn && BP.playing) { BP.songPos = -1; if (BP.rec || BP.armed) { BP.rec = false; BP.armed = false; BPS.ev.forEach(e => { delete e.cyc; }); } noteMsg("The song starts from the top at the end of this loop"); }
    BP.queued = null; bpSave(); bpPaintTop();
  });
  document.getElementById("bpAddSeq").addEventListener("click", () => {
    if (BPS.song.length >= 32) { noteMsg("The song is full (32 steps)"); return; }
    BPS.song.push({ n: BPS.cur, x: 1 }); bpSave(); bpPaintTop();
  });
  document.getElementById("bpSongClr").addEventListener("click", () => {
    if (!BPS.song.length) return; const keep = BPS.song; BPS.song = []; bpSave(); bpPaintTop();
    undoToast("Cleared the song", () => { BPS.song = keep; bpSave(); bpPaintTop(); });
  });
  document.getElementById("bpChain").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"), c = e.target.closest(".bp-chip"); if (!b || !c) return;
    const j = +c.dataset.j, st = BPS.song[j]; if (!st) return;
    if (b.dataset.act === "x") st.x = st.x % 4 + 1;
    else { BPS.song.splice(j, 1); if (BP.songPos > j) BP.songPos--; }
    bpSave(); bpPaintTop();
  });
  document.getElementById("bpL16").addEventListener("click", () => {
    if (!BPS.l16) {
      const P = bpPad(BPS.sel); if (!P || !P.src) { noteMsg("Pick a pad with a sound first, then 16 Levels"); return; }
      BPS.l16src = BPS.sel; BPS.l16 = true;
    } else BPS.l16 = false;
    bpSave(); bpPaintGrid(); bpPaintTop();
  });
  document.getElementById("bpL16p").addEventListener("change", e => { BPS.l16p = e.target.value; bpSave(); bpPaintGrid(); bpPaintTop(); });
  // ---------- rendering: the pads offline, exactly as they play (dry: the FX stay live) ----------
  async function bpPreload(segs) {
    const ids = new Set();
    segs.forEach(sg => sg.ev.forEach(e => { const P = bpPad(e.k); if (P && typeof P.src === "string" && rcEngine(P.src) === "smp") ids.add(P.src); }));
    for (let tries = 0; tries < 80; tries++) {
      let ok = true;
      ids.forEach(id => { if (!(id.startsWith("st:") ? rcStLoad(id.slice(3)) : rcSampleBuf(id))) ok = false; });
      if (ok) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }
  async function bpRenderSegs(segs, opt = {}) {
    if (!ctx) return null;
    await bpPreload(segs);
    const sd = bpSd(), sr = ctx.sampleRate, steps = segs.reduce((a, sg) => a + sg.bars * 16, 0), len = steps * sd, tail = opt.tail ?? 2.5;
    const list = [], keepBars = BPS.bars; let base = 0;
    try { segs.forEach(sg => { BPS.bars = sg.bars; sg.ev.forEach(e => list.push([(base + bpQ(e.s)) * sd, e])); base += sg.bars * 16; }); }
    finally { BPS.bars = keepBars; }
    list.sort((a, b) => a[0] - b[0]);   // in time order, so chokes cut the right voices
    const oc = new OfflineAudioContext(2, Math.ceil((len + tail) * sr), sr), out = oc.createGain();
    out.gain.value = opt.gain ?? 1; out.connect(oc.destination);
    const live = ctx, keepV = BP.voices;
    ctx = oc; BP.off = out; BP.voices = [];
    try { for (const [t, e] of list) bpHit(e.k, t, e.v, e.m); }
    finally { ctx = live; BP.off = null; BP.voices = keepV; }
    return { buf: await oc.startRendering(), len, sd, steps };
  }
  function bpPeak(b) { let pk = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } } return pk; }
  function bpScale(b, k) { for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  function bpFold(b, frames) {   // a seamless loop: whatever rings past the end is added back onto the start
    const o = new AudioBuffer({ length: frames, numberOfChannels: 2, sampleRate: b.sampleRate });
    for (let c = 0; c < 2; c++) { const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1)), d = o.getChannelData(c); for (let i = 0; i < src.length; i++) d[i % frames] += src[i]; }
    return o;
  }
  function bpTrimTail(b, keep) {   // cut the silence after the last sound (never shorter than keep)
    let last = keep;
    for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = d.length - 1; i >= last; i--) if (Math.abs(d[i]) > 0.0005) { last = i + 1; break; } }
    const n = Math.min(b.length, last + Math.round(b.sampleRate * 0.02)); if (n >= b.length) return b;
    const o = new AudioBuffer({ length: n, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) o.getChannelData(c).set(b.getChannelData(c).subarray(0, n));
    return o;
  }
  function bpBusyBtn(id, on, label) { const b = document.getElementById(id); b.disabled = on; b.textContent = on ? "Rendering…" : label; BP.busy = on; }
  async function bpResample() {
    start(); if (!ctx || BP.busy) return null;
    bpSeqSync();
    const song = BPS.songOn && BPS.song.length > 0, segs = song ? bpSongSegs() : [{ ev: BPS.ev, bars: BPS.bars, n: BPS.cur }];
    if (!segs.some(sg => sg.ev.length)) { noteMsg(song ? "The song's sequences are empty" : "Record some hits into this sequence first"); return null; }
    const slot = sampBuf.findIndex((x, i) => !x && i < NSLOTS);
    if (slot < 0) { noteMsg("All 8 sampler slots are full: clear one on the Samples tab first", true); return null; }
    bpBusyBtn("bpResamp", true);
    try {
      const r = await bpRenderSegs(segs, { tail: 2.5 }); if (!r) return null;
      const frames = Math.round(r.len * r.buf.sampleRate), buf = song ? bpTrimTail(r.buf, frames) : bpFold(r.buf, frames);
      const pk = bpPeak(buf), k = pk > 0.97 ? 0.97 / pk : 1; if (k < 1) bpScale(buf, k);
      let num = 1; (state.samp.slots || []).forEach(sl => { const m = /^Resample (\d+)/.exec(sl && sl.name || ""); if (m) num = Math.max(num, +m[1] + 1); });
      const name = "Resample " + num;
      setSample(slot, buf, name); storeSample(slot, name, bufferToWav(buf));
      // the next empty pad: this bank, then C, D, B, A
      let pad = -1; for (const b of [BPS.bank, 2, 3, 1, 0]) { const i = BPS.banks[b].findIndex(p => !p || !p.src); if (i >= 0) { pad = b * 16 + i; break; } }
      if (pad >= 0) {
        BPS.banks[Math.floor(pad / 16)][pad % 16] = Object.assign(bpPadDef({ slot, a: 0, b: buf.duration, n: 0, nm: name }), { level: Math.min(1, Math.sqrt(0.8 / k)) });
        BPS.bank = Math.floor(pad / 16); BPS.sel = pad;
      }
      BPS.src = slot; bpSave(); bpPaintGrid(); bpPaintEdit(); bpPaintChop(); bpPaintTop();
      noteMsg(name + " is in S" + (slot + 1) + (pad >= 0 ? " and on pad " + (pad % 16 + 1) + " of bank " + "ABCD"[Math.floor(pad / 16)] : " (no empty pad: pick S" + (slot + 1) + " in a pad's sound list)") + (song ? "" : ", a seamless " + BPS.bars + "-bar loop") + ". Chop it below if you like.");
      return { slot, pad, dur: buf.duration };
    } catch (e) { noteMsg("Couldn't resample: " + (e && e.message || e), true); return null; }
    finally { bpBusyBtn("bpResamp", false, "Resample"); }
  }
  async function bpToTracks() {
    start(); if (!ctx || BP.busy) return null;
    bpSeqSync();
    const song = BPS.songOn && BPS.song.length > 0, segs = song ? bpSongSegs() : [0, 1, 2, 3].map(() => ({ ev: BPS.ev, bars: BPS.bars, n: BPS.cur }));
    if (!segs.some(sg => sg.ev.length)) { noteMsg(song ? "The song's sequences are empty" : "Record some hits into this sequence first"); return null; }
    bpBusyBtn("bpToTrk", true);
    try {
      const r = await bpRenderSegs(segs, { gain: BPS.level, tail: 3 }); if (!r) return null;
      const buf = bpTrimTail(r.buf, Math.round(r.len * r.buf.sampleRate)), pk = bpPeak(buf); if (pk > 0.97) bpScale(buf, 0.97 / pk);
      const bpm = rcBpm();
      const name = song ? "Beat Pads · song" : "Beat Pads · Seq " + (BPS.cur + 1), items = []; let at = 0;
      segs.forEach((sg, j) => {
        const len = sg.bars * 16 * r.sd, last = j === segs.length - 1;
        items.push({ buf, name, track: name, label: "Seq " + (sg.n + 1), start: at, off: at, dur: last ? Math.max(0.02, buf.duration - at) : len });
        at += len;
      });
      bpView.hidden = true;
      const res = window.__gbAudio && __gbAudio(items, { bpm, song: "Beat Pads", open: true, say: segs.length + " regions on \"" + name + "\" at " + Math.round(bpm) + " BPM: move, copy or delete them to arrange" });
      if (!res) { noteMsg("Couldn't put it in the Garage", true); return null; }
      return { track: res.tracks[0], clips: segs.length };
    } catch (e) { noteMsg("Couldn't put it in the Garage: " + (e && e.message || e), true); return null; }
    finally { bpBusyBtn("bpToTrk", false, "→ Garage"); }
  }
  document.getElementById("bpResamp").addEventListener("click", bpResample);
  document.getElementById("bpToTrk").addEventListener("click", bpToTracks);
  // ---------- MIDI: pads in, Start/Stop in, clock out from Beat Pads and the Rhythm Creator ----------
  function bpMidiNote(n, v) {
    if (bpView.hidden) return false;
    const i = (((n - 36) % 16) + 16) % 16, k = BPS.bank * 16 + i, id = "m" + n;
    if (v > 0) bpDown(k, BPS.full ? 1 : Math.max(0.12, Math.min(1, v / 127)), id); else bpUp(id);
    return true;
  }
  function bpMidiTransport(on) {
    if (on && window.__liveTransport && window.__liveTransport(true)) return true;
    if (!on) { if (BP.playing) bpTransport(false); if (RC.playing && !playing) rcPlay(false); return false; }
    if (!bpView.hidden) { bpTransport(true); return true; }
    const rv = document.getElementById("rcView"); if (rv && !rv.hidden) { rcPlay(true); return true; }
    return false;
  }
  // 24 pulses per beat on the grid of whatever is playing (the sequencer sends its own); Start on a downbeat
  const BPCLK = { src: null, n: 0, p0: 0, started: false };
  const bpClkTime = p => BPCLK.src === "rc" ? RC.nextT + (p - RC.step) * rcStepDur() : bpTimeAt(p - BP.absBase);
  const bpClkPos = now => BPCLK.src === "rc" ? RC.step - (RC.nextT - now) / rcStepDur() : BP.absBase + bpPosAt(now);
  function bpClockTick() {
    if (!ctx) return;
    const on = !!(md.access && md.opt.clockOut && mdClockPorts().length), now = ctx.currentTime;
    const want = !on || playing ? null : RC.playing ? "rc" : BP.playing ? "bp" : null;
    if (want !== BPCLK.src) {
      if (BPCLK.src && BPCLK.started && on && !playing) send([0xfc]);
      BPCLK.src = want; BPCLK.started = false; BPCLK.n = 0;
      if (want) BPCLK.p0 = Math.max(0, Math.ceil((bpClkPos(now) - 0.01) / 16) * 16);
    }
    if (!BPCLK.src) return;
    for (let guard = 0; guard < 240; guard++) {
      const t = bpClkTime(BPCLK.p0 + BPCLK.n / 6);
      if (t > now + 0.1) break;
      if (t < now - 0.05) { BPCLK.n++; continue; }   // a late timer: skip ahead rather than burst
      if (!BPCLK.started) { send([0xfa], perfAt(t)); BPCLK.started = true; }
      send([0xf8], perfAt(t)); BPCLK.n++;
    }
  }
  setInterval(bpClockTick, 20);
  // ---------- the MIDI sheet: line-up slider ----------
  const mdLatEl = document.getElementById("mdLat");
  function mdLatPaint() {
    const v = +md.opt.lat || 0; mdLatEl.value = v; document.getElementById("mdLatV").textContent = (v > 0 ? "+" : v < 0 ? "−" : "+") + Math.abs(v) + " ms";
    const a = ctx ? Math.round(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000) : 0;
    document.getElementById("mdLatI").textContent = "audio delay measured here " + a + " ms, so clock and notes go out " + Math.round(mdLatMs()) + " ms after the sound is scheduled";
  }
  mdLatEl.addEventListener("input", () => { md.opt.lat = +mdLatEl.value; saveMd(); mdLatPaint(); });
  document.getElementById("midiBtn").addEventListener("click", mdLatPaint);
  window.__bp = Object.assign(window.__bp || {}, { transport: on => bpTransport(on), seq: bpSeqSelect, render: bpRenderSegs, resample: bpResample, toTracks: bpToTracks, midiNote: bpMidiNote, midiTransport: bpMidiTransport, clk: BPCLK, clockTick: bpClockTick, md, latMs: () => mdLatMs(), l16: bpL16, songSegs: bpSongSegs, sync: bpSeqSync });
  bpPaintTop();


