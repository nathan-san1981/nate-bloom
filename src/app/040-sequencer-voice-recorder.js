  // ---------- Sequencer ----------
  const seqEl = document.getElementById("seq");
  const cellEls = []; // [rowIndex][step]
  let ROWS = [];
  function computeRows() {
    ROWS = [["synth", "SY"], ...DRUMS.map(([id, code]) => [id, code])];
    for (let i = 0; i < NSLOTS; i++) if (sampBuf[i]) ROWS.push(["s" + i, "S" + (i + 1)]);
    for (let k = 0; k < NPADS; k++) if (padBuf[k]) ROWS.push(["p" + k, "P" + (k + 1)]);
  }
  function hitRow(row, t, s = 0) {
    if (/^p\d+$/.test(row)) playPad(Number(row.slice(1)), t);
    else if (/^s\d$/.test(row)) triggerSample(Number(row[1]), t, s);
    else playDrum(row, t);
  }
  function triggerSample(i, t, step = 0) {
    // slice mode plays slice N on step N, so a full row rebuilds the loop
    const v = makeSampleVoice(state.samp.slots[i].mode === "slice" ? 48 + step : 60, i, t); if (!v) return;
    const gate = state.samp.slots[i].mode === "grain" ? stepDur() * 4 : stepDur() * 16;
    v.stop(t + gate);
  }
  const noteName = d => { const m = BASE + degToSemis(d); return NAMES[m % 12] + (Math.floor(m / 12) - 1); };
  function buildSeq() {
    computeRows(); seqBuilt = true;
    seqEl.innerHTML = ""; cellEls.length = 0;
    const N = stepsNow(), starts = beatStarts();
    seqEl.style.gridTemplateColumns = `${N > 16 ? 22 : 26}px repeat(${N}, minmax(0, 1fr))`;
    seqEl.style.columnGap = N > 16 ? "1px" : "2px";
    ROWS.forEach(([id, code], r) => {
      const lab = document.createElement("div"); lab.className = "lab" + (id === "synth" || /^[sp]\d+$/.test(id) ? " sy" : ""); lab.textContent = code;
      seqEl.appendChild(lab);
      const row = [];
      for (let s = 0; s < N; s++) {
        const c = document.createElement("div");
        c.className = "cell" + (starts.has(s) ? " q" : "") + (s === 0 ? " bar1" : "") + (id === "synth" ? " syn" : "");
        c.dataset.row = id; c.dataset.step = s;
        seqEl.appendChild(c); row.push(c);
      }
      cellEls.push(row);
    });
    paintSeq();
    requestAnimationFrame(updateThumb);
  }

  // Scroll bar beside the grid: drag the thumb or tap the track; the row labels also scroll by swiping
  const seqArea = document.getElementById("seqArea"), seqWrap = document.getElementById("seqWrap");
  const sbTrack = document.getElementById("sbTrack"), sbThumb = document.getElementById("sbThumb");
  function updateThumb() {
    const view = seqWrap.clientHeight, full = seqWrap.scrollHeight, trackH = sbTrack.clientHeight;
    const over = full - view > 1;
    sbTrack.classList.toggle("off", !over);
    if (!over) return;
    const th = Math.max(30, trackH * view / full);
    sbThumb.style.height = th + "px";
    sbThumb.style.top = ((trackH - th) * seqWrap.scrollTop / (full - view)) + "px";
  }
  seqWrap.addEventListener("scroll", updateThumb, { passive: true });
  window.addEventListener("resize", updateThumb);
  let sbDrag = null;
  function scrollFromTrack(y, grabOffset) {
    const r = sbTrack.getBoundingClientRect(), view = seqWrap.clientHeight, full = seqWrap.scrollHeight;
    const th = sbThumb.offsetHeight, range = r.height - th;
    const top = Math.max(0, Math.min(range, y - r.top - grabOffset));
    seqWrap.scrollTop = range > 0 ? (top / range) * (full - view) : 0;
  }
  sbTrack.addEventListener("pointerdown", e => {
    e.preventDefault(); sbTrack.setPointerCapture(e.pointerId); sbTrack.classList.add("drag");
    const tr = sbThumb.getBoundingClientRect();
    const onThumb = e.clientY >= tr.top && e.clientY <= tr.bottom;
    sbDrag = { id: e.pointerId, off: onThumb ? e.clientY - tr.top : sbThumb.offsetHeight / 2 };
    scrollFromTrack(e.clientY, sbDrag.off);
  });
  sbTrack.addEventListener("pointermove", e => { if (sbDrag && e.pointerId === sbDrag.id) scrollFromTrack(e.clientY, sbDrag.off); });
  const sbEnd = e => { if (sbDrag && e.pointerId === sbDrag.id) { sbDrag = null; sbTrack.classList.remove("drag"); } };
  sbTrack.addEventListener("pointerup", sbEnd); sbTrack.addEventListener("pointercancel", sbEnd);

  function paintSeq() {
    ROWS.forEach(([id], r) => cellEls[r].forEach((c, s) => {
      if (id === "synth") {
        const d = state.seq.synth[s];
        c.classList.toggle("on", d != null);
        c.textContent = d != null ? noteName(d).replace(/\d/, "") : "";
      } else c.classList.toggle("on", !!state.seq.rows[id][s]);
    }));
  }
  function cellAt(x, y) { const el = document.elementFromPoint(x, y); return el && el.classList && el.classList.contains("cell") ? el : null; }

  let lastDeg = 5;
  const seqTouch = new Map();
  seqEl.addEventListener("pointerdown", e => {
    const c = cellAt(e.clientX, e.clientY); if (!c) return;
    e.preventDefault(); seqEl.setPointerCapture(e.pointerId);
    const row = c.dataset.row, s = Number(c.dataset.step);
    if (row === "synth") {
      const cur = state.seq.synth[s];
      seqTouch.set(e.pointerId, { kind: "synth", s, y: e.clientY, start: cur, moved: false });
      if (cur == null) { state.seq.synth[s] = lastDeg; seqTouch.get(e.pointerId).added = true; previewNote(lastDeg); }
    } else {
      const val = !state.seq.rows[row][s];
      state.seq.rows[row][s] = val;
      if (state.seq.beat && DRUMS.some(d => d[0] === row)) state.seq.beat.dirty = true;
      if (val && ctx) hitRow(row, ctx.currentTime, s);
      seqTouch.set(e.pointerId, { kind: "drum", row, val });
    }
    paintSeq(); save();
  });
  seqEl.addEventListener("pointermove", e => {
    const t = seqTouch.get(e.pointerId); if (!t) return;
    if (t.kind === "synth") {
      const dy = t.y - e.clientY;
      if (Math.abs(dy) < 8 && !t.moved) return;
      t.moved = true;
      const base = t.start == null ? lastDeg : t.start;
      const d = Math.max(0, Math.min(MAX_DEG, base + Math.round(dy / 14)));
      if (d !== state.seq.synth[t.s]) { state.seq.synth[t.s] = d; lastDeg = d; previewNote(d); paintSeq(); save(); }
    } else {
      const c = cellAt(e.clientX, e.clientY);
      if (c && c.dataset.row === t.row) {
        const s = Number(c.dataset.step);
        if (state.seq.rows[t.row][s] !== t.val) { state.seq.rows[t.row][s] = t.val; paintSeq(); save(); }
      }
    }
  });
  const seqLift = e => {
    const t = seqTouch.get(e.pointerId); if (!t) return;
    seqTouch.delete(e.pointerId);
    if (t.kind === "synth" && !t.moved && !t.added) { state.seq.synth[t.s] = null; paintSeq(); save(); }
    if (t.kind === "synth" && state.seq.synth[t.s] != null) lastDeg = state.seq.synth[t.s];
  };
  seqEl.addEventListener("pointerup", seqLift);
  seqEl.addEventListener("pointercancel", seqLift);
  function previewNote(d) {
    if (!ctx) return;
    const m = BASE + degToSemis(d) + state.octave * 12;
    melodicVoices(m).forEach(v => v.stop(ctx.currentTime + 0.18));
  }

  // Scheduler: look ahead 120 ms, wake every 25 ms
  let playing = false, nextTime = 0, curStep = 0, timer = 0;
  const playQueue = [];
  function stepDur() { return 60 / state.seq.bpm / 4; }
  function scMuted(k) { return !!(state.seq.mute && state.seq.mute[k]); }
  function scheduleStep(s, t) {
    const swingT = s % 2 === 1 ? t + state.drum.swing * stepDur() * 0.5 : t;
    for (const [id] of DRUMS) if (state.seq.rows[id][s]) {
      const pr = stepProb(id, s);
      if (pr < 100 && Math.random() * 100 >= pr) continue;
      const r = stepRat(id, s);
      for (let k = 0; k < r; k++) playDrum(id, swingT + k * stepDur() / r);
    }
    for (let i = 0; i < NSLOTS; i++) if (sampBuf[i] && state.seq.rows["s" + i][s] && !scMuted("s" + i)) triggerSample(i, swingT, s);
    for (let k = 0; k < NPADS; k++) if (padBuf[k] && state.seq.rows["p" + k] && state.seq.rows["p" + k][s] && !scMuted("p" + k)) playPad(k, swingT);
    const d = state.seq.synth[s];
    if (d != null && !scMuted("synth")) {
      const m = BASE + degToSemis(d) + state.octave * 12;
      const gate = stepDur() * 0.9;
      melodicVoices(m, swingT).forEach(v => v.stop(swingT + gate));
    }
    playQueue.push({ s, t: swingT });
  }
  function tick() {
    // back from another app (timers were paused): skip to the current step instead of playing every missed one at once
    if (nextTime < ctx.currentTime - 0.05) { const d = stepDur(), k = Math.ceil((ctx.currentTime - nextTime) / d); nextTime += k * d; curStep = (curStep + k) % stepsNow(); }
    while (nextTime < ctx.currentTime + NB_LA) {
      if (curStep >= stepsNow()) curStep = 0;
      scheduleStep(curStep, nextTime);
      nextTime += stepDur();
      curStep = (curStep + 1) % stepsNow();
    }
  }
  const playBtn = document.getElementById("play");
  let NB_START_AT = null;   // (Link: when the first step should sound, in this AudioContext's time)
  let NB_GRID = null;       // (Ableton Link: where a start lands on the session's beat grid: { t, step, abs })
  function startSeq() {
    if (!ctx || playing) return;
    playing = true; curStep = 0; nextTime = NB_START_AT != null && NB_START_AT > ctx.currentTime ? NB_START_AT : ctx.currentTime + 0.06;
    if (NB_START_AT == null && NB_GRID) { const g = NB_GRID(stepsNow()); if (g) { nextTime = Math.max(ctx.currentTime, g.t); curStep = g.step; } }
    tick(); timer = setInterval(tick, 25);
    playBtn.setAttribute("aria-pressed", "true"); playBtn.textContent = "■ Pause";
  }
  function stopSeq() {
    playing = false; clearInterval(timer); playQueue.length = 0;
    playBtn.setAttribute("aria-pressed", "false"); playBtn.textContent = "▶ Play";
    showStep(-1);
  }
  playBtn.addEventListener("click", () => (playing ? stopSeq() : startSeq()));
  let shown = -1;
  function showStep(s) {
    if (s === shown) return;
    cellEls.forEach(row => { if (row[shown]) row[shown].classList.remove("now"); if (row[s]) row[s].classList.add("now"); });
    shown = s;
  }
  function seqFrame() {
    if (ctx && playing) {
      while (playQueue.length && playQueue[0].t <= ctx.currentTime) showStep(playQueue.shift().s);
    }
    requestAnimationFrame(seqFrame);
  }
  requestAnimationFrame(seqFrame);

  const bpmLabel = document.getElementById("bpmLabel");
  function setBpm(b) { state.seq.bpm = Math.max(50, Math.min(180, b)); bpmLabel.textContent = state.seq.bpm + " bpm"; save(); }
  document.getElementById("bpmDown").addEventListener("click", () => setBpm(state.seq.bpm - 2));
  document.getElementById("bpmUp").addEventListener("click", () => setBpm(state.seq.bpm + 2));
  setBpm(state.seq.bpm);

  const clearBtn = document.getElementById("clear");
  let clearArmed = 0;
  clearBtn.addEventListener("click", () => {
    if (!clearArmed) {
      clearBtn.textContent = "Clear all?";
      clearArmed = setTimeout(() => { clearArmed = 0; clearBtn.textContent = "Clear"; }, 2500);
      return;
    }
    clearTimeout(clearArmed); clearArmed = 0; clearBtn.textContent = "Clear";
    for (const id of Object.keys(state.seq.rows)) state.seq.rows[id] = emptyRow();
    state.seq.synth = Array(MAXSTEPS).fill(null);
    state.seq.beat = null;
    paintSeq(); save();
  });

  function setMode(mode) {
    state.mode = mode;
    const seq = mode === "seq";
    document.getElementById("modeKeys").setAttribute("aria-pressed", String(!seq));
    document.getElementById("modeSeq").setAttribute("aria-pressed", String(seq));
    document.getElementById("playrow").hidden = seq; seqArea.hidden = !seq;
    if (seq) requestAnimationFrame(updateThumb);
    document.getElementById("octGroup").hidden = seq;
    document.getElementById("bpmGroup").hidden = !seq;
    holdBtn.hidden = seq; clearBtn.hidden = !seq;
    document.getElementById("chordWrap").hidden = seq;
    document.getElementById("meterWrap").hidden = !seq;
    document.getElementById("beatsBtn").hidden = !seq;
  }
  const chordSel = document.getElementById("chord");
  CHORDS.forEach(([id, name]) => {
    const o = document.createElement("option"); o.value = id; o.textContent = name; chordSel.appendChild(o);
  });
  chordSel.value = chordType;
  chordSel.addEventListener("change", () => {
    chordType = chordSel.value;
    try { localStorage.setItem("nightbloom-chord", chordType); } catch (e) {}
  });
  const meterSel = document.getElementById("meter");
  METERS.forEach(([name, g]) => {
    const o = document.createElement("option"); o.value = name;
    o.textContent = name;
    meterSel.appendChild(o);
  });
  meterSel.value = state.seq.meter;
  meterSel.addEventListener("change", () => {
    state.seq.meter = meterSel.value;
    // a loaded beat you haven't edited is rebuilt for the new time signature
    if (more3Ready && state.seq.beat && !state.seq.beat.dirty) applyBeat(state.seq.beat.i, false);
    // patterns are kept for the full 24 steps, so switching back restores what was there
    buildSeq(); save();
  });
  // Only one slider panel shows at a time so the keyboard and sequencer get the room
  function setPanel(which) {
    state.panel = which;
    document.getElementById("engineRow").hidden = which !== "sound";
    document.getElementById("fxRow").hidden = which !== "fx";
    document.getElementById("arpRow").hidden = which !== "arp";
    document.getElementById("pArp").setAttribute("aria-pressed", String(which === "arp"));
    document.getElementById("soundbar").classList.toggle("compact", which === "hide");
    document.getElementById("pSound").setAttribute("aria-pressed", String(which === "sound"));
    document.getElementById("pFx").setAttribute("aria-pressed", String(which === "fx"));
    document.getElementById("pHide").setAttribute("aria-pressed", String(which === "hide"));
    try { localStorage.setItem("nightbloom-panel", which); } catch (e) {}
    requestAnimationFrame(updateThumb);
  }
  document.getElementById("pSound").addEventListener("click", () => setPanel("sound"));
  document.getElementById("pFx").addEventListener("click", () => setPanel("fx"));
  document.getElementById("pHide").addEventListener("click", () => setPanel("hide"));
  // picking a sound from the Effects panel jumps back to that sound's sliders; Hide stays hidden
  tabsEl.addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (t && state.panel === "fx") setPanel("sound");
  });
  {
    let saved = "sound";
    try { saved = localStorage.getItem("nightbloom-panel") || "sound"; } catch (e) {}
    setPanel(["sound", "fx", "arp", "hide"].includes(saved) ? saved : "sound");
  }
  // keep the selected tab in view in the swipeable strip
  const sel = tabsEl.querySelector('.tab[aria-pressed="true"]');
  if (sel) sel.closest(".tabwrap").scrollIntoView({ block: "nearest", inline: "center" });

  document.getElementById("modeKeys").addEventListener("click", () => setMode("keys"));
  document.getElementById("modeSeq").addEventListener("click", () => setMode("seq"));
  buildSeq();
//@site-only

  // ---------- Voice recorder (hold to record) ----------
  const rec = { active: false, peaks: [], startedAt: 0 };
  let pendingBuf = null, pendingPeaks = null;
  const recBtn = document.getElementById("recBtn");
  const pendingEl = document.getElementById("pending");
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  if (!canRecord) { recBtn.disabled = true; recBtn.textContent = "Recording needs HTTPS"; }
  let micStream = null, recSrc = null, recNode = null, recMute = null, recChunks = [], recLen = 0, recWanted = false;

  function recMsg(text) {
    const after = document.getElementById("engineAfter");
    after.classList.add("err"); after.textContent = text;
  }
  function resetRecBtn() { recBtn.classList.remove("live"); if (canRecord) recBtn.textContent = "● Hold to record"; }
  function stopTracks() {
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
  }

  async function beginRec() {
    if (!canRecord || rec.active) return;
    start();
    recWanted = true;
    recBtn.classList.add("live"); recBtn.textContent = "● Recording… let go to stop";
    const firstAsk = !micStream;
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      recWanted = false; resetRecBtn(); stopTracks();
      recMsg("Microphone is blocked. Allow it for this site in Settings › Apps › Safari › Microphone.");
      return;
    }
    if (!recWanted) {
      // the button was let go while the permission prompt was up
      stopTracks(); resetRecBtn();
      if (firstAsk) recMsg("Microphone allowed. Now hold the button while you record.");
      return;
    }
    if (ctx.state !== "running") await ctx.resume();
    recSrc = ctx.createMediaStreamSource(micStream);
    recNode = ctx.createScriptProcessor(4096, 1, 1);
    recMute = ctx.createGain(); recMute.gain.value = 0;
    recChunks = []; recLen = 0; rec.peaks = []; rec.startedAt = ctx.currentTime; rec.active = true;
    pendingPeaks = null;
    recNode.onaudioprocess = ev => {
      if (!rec.active) return;
      const d = new Float32Array(ev.inputBuffer.getChannelData(0));
      recChunks.push(d); recLen += d.length;
      let m = 0; for (let i = 0; i < d.length; i += 8) { const a = Math.abs(d[i]); if (a > m) m = a; }
      rec.peaks.push(m);
      if (recLen >= ctx.sampleRate * MAX_SAMPLE_SEC) endRec();
    };
    recSrc.connect(recNode); recNode.connect(recMute).connect(ctx.destination);
  }

  function endRec() {
    recWanted = false;
    if (!rec.active) { if (!micStream) resetRecBtn(); return; }
    rec.active = false;
    try { recSrc.disconnect(); recNode.disconnect(); recMute.disconnect(); } catch (e) {}
    stopTracks(); resetRecBtn();

    const all = new Float32Array(recLen);
    let o = 0; for (const c of recChunks) { all.set(c, o); o += c.length; }
    recChunks = [];
    let peak = 0; for (let i = 0; i < all.length; i++) { const a = Math.abs(all[i]); if (a > peak) peak = a; }
    if (all.length < ctx.sampleRate * 0.15 || peak < 0.003) {
      recMsg("That take was too short or silent. Hold the button the whole time you speak.");
      return;
    }
    // trim silence at both ends, normalize, and fade the edges so it doesn't click
    const rate = ctx.sampleRate, thr = peak * 0.04;
    let a = 0; while (a < all.length && Math.abs(all[a]) < thr) a++;
    let b = all.length - 1; while (b > a && Math.abs(all[b]) < thr) b--;
    a = Math.max(0, a - Math.floor(rate * 0.02)); b = Math.min(all.length, b + Math.floor(rate * 0.15));
    const out = all.subarray(a, b), gain = 0.9 / peak, fadeN = Math.min(Math.floor(rate * 0.006), out.length >> 2);
    const buf = ctx.createBuffer(1, out.length, rate), d = buf.getChannelData(0);
    for (let i = 0; i < out.length; i++) {
      let g = gain;
      if (i < fadeN) g *= i / fadeN;
      if (i > out.length - fadeN) g *= (out.length - i) / fadeN;
      d[i] = out[i] * g;
    }
    pendingBuf = buf; pendingPeaks = computePeaks(buf);
    showPending();
  }

  const pendSlots = document.getElementById("pendSlots");
  for (let i = 0; i < NSLOTS; i++) {
    const b = document.createElement("button");
    b.className = "slot"; b.textContent = "S" + (i + 1);
    b.setAttribute("aria-label", "Save take to slot S" + (i + 1));
    b.addEventListener("click", () => saveTake(i));
    pendSlots.appendChild(b);
  }
  function showPending() {
    const used = sampBuf.map(Boolean);
    pendSlots.querySelectorAll(".slot").forEach((b, i) => b.classList.toggle("has", used[i]));
    document.getElementById("pendInfo").textContent =
      "Take ready · " + pendingBuf.duration.toFixed(1) + "s · save to a slot (a dot means it replaces a sample)";
    pendingEl.hidden = false;
  }
  function hidePending() { pendingBuf = null; pendingPeaks = null; pendingEl.hidden = true; }
  function saveTake(i) {
    if (!pendingBuf) return;
    const d = new Date();
    const name = "Voice take " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setSample(i, pendingBuf, name);
    state.samp.slots[i].mode = pendingBuf.duration > 4 ? "grain" : "play";
    storeSample(i, name, encodeWav(pendingBuf));
    state.samp.slot = i;
    hidePending(); renderEngine(); save();
  }
  document.getElementById("pendDiscard").addEventListener("click", hidePending);
  document.getElementById("pendPlay").addEventListener("click", () => {
    if (!pendingBuf || !ctx) return;
    const src = ctx.createBufferSource(); src.buffer = pendingBuf; src.connect(fx.input); src.start();
  });

  function encodeWav(buf) {
    const d = buf.getChannelData(0), n = d.length, rate = buf.sampleRate;
    const ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 0x7fff, true);
    return ab;
  }

  recBtn.addEventListener("pointerdown", e => {
    e.preventDefault(); recBtn.setPointerCapture(e.pointerId); beginRec();
  });
  recBtn.addEventListener("pointerup", endRec);
  recBtn.addEventListener("pointercancel", endRec);
  recBtn.addEventListener("contextmenu", e => e.preventDefault());
  recBtn.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); beginRec(); } });
  recBtn.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") endRec(); });
//@end


