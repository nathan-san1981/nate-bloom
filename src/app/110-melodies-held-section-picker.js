  // ======================================================================
  // Melodies: a picker of ready-made melodies, loaded into the Notes melody
  // so they play with Play, follow the time signature and key, and stay editable.
  // Each note: start (16ths), length (16ths), semitones from the key's root.
  // ======================================================================
  const arp = (bars, chords, pat, len = 2, oct = 0) => {
    // chords: one array of tones per bar; pat: indexes into the chord, one per step of `len` 16ths
    const out = [];
    chords.slice(0, bars).forEach((ch, b) => pat.forEach((k, i) => { if (k == null) return; out.push([b * 16 + i * len, len, ch[k % ch.length] + 12 * Math.floor(k / ch.length) + oct]); }));
    return out;
  };
  const chordsOf = (bars, chords, len = 16, oct = 0) => {
    const out = []; chords.slice(0, bars).forEach((ch, b) => ch.forEach(t => out.push([b * 16, len, t + oct]))); return out;
  };
  const seqN = (str) => str.trim().split(/\s+/).map(x => x.split(":").map(Number));
  const MELODIES = [
    // name, style, mode, bars (in 4/4), notes
    ["Drift", "Ambient", "maj", 4, seqN("0:8:7 8:8:4 16:12:9 28:4:7 32:8:4 40:8:2 48:16:0").concat(chordsOf(4, [[-12], [-15], [-8], [-5]]))],
    ["Glass Lake", "Ambient", "min", 4, seqN("0:6:12 6:2:10 8:8:7 16:6:15 22:2:12 24:8:10 32:6:7 38:2:5 40:8:3 48:16:0")],
    ["Bell Tower", "Ambient", "maj", 4, chordsOf(4, [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]).concat(seqN("0:4:12 8:4:11 16:4:9 24:4:7 32:4:5 40:4:4 48:8:2 56:8:7"))],
    ["Gamelan Mist", "Ambient", "min", 2, seqN("0:2:0 2:2:1 4:2:5 6:4:7 10:2:8 12:4:7 16:2:12 18:2:8 20:2:7 22:4:5 26:2:1 28:4:0")],
    ["Kaleidoscope", "Psychedelic", "min", 4, arp(4, [[0, 3, 7, 9], [-2, 2, 5, 9], [-4, 0, 3, 7], [-5, -1, 2, 5]], [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 5], 1)],
    ["Lydian Float", "Psychedelic", "maj", 4, seqN("0:4:0 4:4:4 8:4:6 12:4:11 16:8:12 24:4:11 28:4:7 32:4:6 36:4:4 40:8:2 48:4:4 52:4:6 56:8:7")],
    ["Desert Mirage", "Psychedelic", "maj", 2, seqN("0:3:0 3:1:1 4:4:4 8:2:5 10:2:7 12:4:8 16:3:7 19:1:8 20:2:7 22:2:5 24:4:4 28:2:1 30:2:0")],
    ["Space Echo", "Psychedelic", "min", 4, seqN("0:2:12 6:2:15 12:2:19 20:2:17 26:2:15 32:2:10 38:2:12 44:2:7 52:12:12")],
    ["Sunbeam Hook", "Pop", "maj", 2, seqN("0:2:4 2:2:4 4:2:5 6:4:7 10:2:4 12:4:2 16:2:0 18:2:2 20:2:4 22:4:7 26:2:9 28:4:7")],
    ["Anthem", "Pop", "maj", 4, seqN("0:4:7 4:4:9 8:6:11 14:2:12 16:12:12 28:4:11 32:4:9 36:4:7 40:6:4 46:2:5 48:16:7")],
    ["Bubblegum", "Pop", "maj", 2, seqN("0:1:12 2:1:12 4:2:11 6:2:9 8:2:7 10:2:9 12:4:7 16:1:5 18:1:5 20:2:4 22:2:2 24:2:4 26:2:7 28:4:0")],
    ["Night Drive", "Synthwave", "min", 4, arp(4, [[0, 3, 7, 12], [-4, 0, 3, 8], [3, 7, 10, 15], [-2, 2, 5, 10]], [0, 1, 2, 3, 2, 1, 2, 3], 2)],
    ["Neon Lead", "Synthwave", "min", 4, seqN("0:4:12 4:2:10 6:2:12 8:8:15 16:4:14 20:2:12 22:2:10 24:8:12 32:4:8 36:2:7 38:2:8 40:8:10 48:6:7 54:2:5 56:8:7")],
    ["Lo-fi Sunday", "Chill", "maj", 2, seqN("0:3:11 3:3:9 6:2:7 8:8:4 16:3:12 19:3:11 22:2:9 24:8:7").concat(chordsOf(2, [[-12, -8, -1], [-15, -12, -5]]))],
    ["Raindrops", "Chill", "maj", 2, seqN("0:2:9 3:1:7 6:2:4 10:2:7 12:2:2 16:2:4 19:1:7 22:2:9 24:2:12 27:1:9 30:2:7")],
    ["Kalimba Lullaby", "Chill", "maj", 4, seqN("0:4:0 4:4:4 8:4:7 12:4:9 16:8:7 24:8:4 32:4:2 36:4:4 40:4:7 44:4:4 48:16:0")],
    ["Spiral", "Arpeggio", "min", 2, arp(2, [[0, 3, 7], [-2, 2, 5]], [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1], 1)],
    ["Rising Fifths", "Arpeggio", "maj", 4, arp(4, [[0, 7, 14], [-3, 4, 11], [-7, 0, 7], [-5, 2, 9]], [0, 1, 2, 1, 0, 1, 2, 3], 2)],
    ["Cascade", "Arpeggio", "maj", 2, arp(2, [[0, 4, 7, 11], [-3, 0, 4, 7]], [7, 6, 5, 4, 3, 2, 1, 0, 7, 6, 5, 4, 3, 2, 1, 0], 1)],
    ["Deep Pulse", "Bass line", "min", 2, seqN("0:3:-12 3:1:-12 4:2:0 6:2:-12 8:3:-12 11:1:-9 12:2:-7 14:2:-5 16:3:-16 19:1:-16 20:2:-4 22:2:-16 24:3:-14 27:1:-14 28:2:-2 30:2:-5")],
    ["Funk Walk", "Bass line", "min", 2, seqN("0:2:-12 3:1:-12 4:1:-9 6:2:-7 8:1:-5 10:2:-2 12:1:-5 14:2:-7 16:2:-12 19:1:-10 20:2:-9 22:1:-7 24:2:-5 27:1:-7 28:2:-9 30:2:-10")],
    ["Shadows", "Dark", "min", 4, seqN("0:6:0 6:2:3 8:8:7 16:6:8 22:2:7 24:8:3 32:6:11 38:2:12 40:8:14 48:16:12").concat(chordsOf(4, [[-12], [-16], [-13], [-12]]))],
    ["Twinkle Star", "Kids & classics", "maj", 4, seqN("0:4:0 4:4:0 8:4:7 12:4:7 16:4:9 20:4:9 24:8:7 32:4:5 36:4:5 40:4:4 44:4:4 48:4:2 52:4:2 56:8:0")],
    ["Ode to Joy", "Kids & classics", "maj", 4, seqN("0:4:4 4:4:4 8:4:5 12:4:7 16:4:7 20:4:5 24:4:4 28:4:2 32:4:0 36:4:0 40:4:2 44:4:4 48:6:4 54:2:2 56:8:2")],
  ];
  const KEY_PC = { C: 0, G: 7, D: 2, A: 9, E: 4, F: 5, Bb: 10, Eb: 3, Ab: 8 };

  // turn a 4/4 melody into Notes for the current time signature and key
  function melodyToScore(i) {
    const [, , mode, bars, notes] = MELODIES[i];
    const G = meterOf(state.seq.meter)[1], nb = G.length;
    const groupStart = G.map((_, j) => G.slice(0, j).reduce((a, b) => a + b, 0));
    let root = (KEY_PC[SC().key] || 0) + (mode === "min" ? 9 : 0); root %= 12;
    const base = 60 + root - (root > 5 ? 12 : 0);
    const out = [];
    for (const [s16, d16, semi] of notes) {
      const k = Math.floor(s16 / 4), p = s16 % 4, j = k % nb, bar = Math.floor(k / nb);
      const scale = G[j] / 4;
      const s = groupStart[j] + Math.round(p * scale);
      const st = stepsNow();
      const d = Math.max(1, Math.min(st - s, Math.round(d16 * scale)));
      const m = base + semi;
      if (bar >= 16 || m < 24 || m > 108) continue;
      if (out.some(n => n.b === bar && n.s === s && n.m === m)) continue;
      out.push({ b: bar, s, d, m, dia: spell(m) });
    }
    const totalBeats = bars * 4;
    return { notes: out, bars: Math.min(16, Math.max(1, Math.ceil(totalBeats / nb))) };
  }

  const mlEl = document.getElementById("melodies"), mlList = document.getElementById("mlList"), mlUse = document.getElementById("mlUse");
  const mlInfo = document.getElementById("mlInfo"), mlUndoBtn = document.getElementById("mlUndo"), mlBeat = document.getElementById("mlBeat");
  let mlPick = null, mlPv = null, mlUndo = null;
  try { mlBeat.checked = localStorage.getItem("nightbloom-mlbeat") !== "off"; } catch (e) { mlBeat.checked = true; }
  mlBeat.addEventListener("change", () => { try { localStorage.setItem("nightbloom-mlbeat", mlBeat.checked ? "on" : "off"); } catch (e) {} if (mlPv) mlPreview(mlPv.i); });
  function mlStopPreview() {
    if (mlPv) { clearInterval(mlPv.timer); mlPv = null; }
    mlList.querySelectorAll(".bt-play").forEach(x => { x.textContent = "▶"; x.setAttribute("aria-label", x.dataset.label); });
  }
  function mlPreview(i) {
    mlStopPreview(); start(); if (!ctx) return;
    if (playing) stopSeq();
    const sc = melodyToScore(i), n = stepsNow(), dur = stepDur(), total = sc.bars * n;
    const byStep = new Map();
    sc.notes.forEach(x => { const k = x.b * n + x.s; if (!byStep.has(k)) byStep.set(k, []); byStep.get(k).push(x); });
    mlPv = { i, step: 0, next: ctx.currentTime + 0.06 };
    const tick = () => {
      while (mlPv && mlPv.next < ctx.currentTime + NB_LA) {
        const k = mlPv.step, t = mlPv.next, s = k % n;
        if (mlBeat.checked) for (const [id] of DRUMS) if (state.seq.rows[id][s] && !scMuted(id)) playDrum(id, t);
        const hits = byStep.get(k) || [], sc2 = 0.9 / Math.sqrt(Math.max(1, hits.length));
        hits.forEach(x => melodicVoices(x.m, t, sc2).forEach(v => v.stop(t + Math.max(0.05, x.d * dur * 0.95))));
        mlPv.next += dur; mlPv.step = (k + 1) % total;
      }
    };
    tick(); mlPv.timer = setInterval(tick, 25);
    const b = mlList.querySelector('.bt-play[data-i="' + i + '"]');
    if (b) { b.textContent = "■"; b.setAttribute("aria-label", "Stop preview"); }
  }
  function mlChoose(i) {
    mlPick = i;
    mlList.querySelectorAll(".bt-item").forEach(r => r.classList.toggle("on", Number(r.dataset.i) === i));
    mlUse.disabled = false; mlUse.textContent = "Use " + MELODIES[i][0];
  }
  function renderMelodies(msg) {
    mlList.innerHTML = "";
    mlInfo.textContent = msg || "Tap a melody to hear it with the current sound. Nothing changes until you tap Use.";
    let last = "";
    MELODIES.forEach(([name, style, mode, bars], i) => {
      if (style !== last) { const h = document.createElement("div"); h.className = "bt-style"; h.textContent = style; mlList.appendChild(h); last = style; }
      const item = document.createElement("div"); item.className = "bt-item" + (mlPick === i ? " on" : ""); item.dataset.i = i;
      const play = document.createElement("button"); play.className = "bt-play"; play.dataset.i = i;
      play.dataset.label = "Hear " + name; play.setAttribute("aria-label", play.dataset.label);
      play.textContent = mlPv && mlPv.i === i ? "■" : "▶";
      play.addEventListener("click", () => { if (mlPv && mlPv.i === i) { mlStopPreview(); return; } mlChoose(i); mlPreview(i); });
      const b = document.createElement("button"); b.className = "bt-row"; b.innerHTML = "<b></b><small></small>";
      b.querySelector("b").textContent = name;
      const cur = state.seq.melody && state.seq.melody.i === i;
      b.querySelector("small").textContent = (mode === "min" ? "minor" : "major") + " · " + bars + " bar" + (bars > 1 ? "s" : "") + (cur ? " · in use" : "");
      b.addEventListener("click", () => { mlChoose(i); mlPreview(i); });
      item.append(play, b); mlList.appendChild(item);
    });
  }
  function openMelodies() {
    mlPick = null; mlUse.disabled = true; mlUse.textContent = "Use this melody";
    mlUndoBtn.disabled = !mlUndo;
    mlEl.hidden = false; renderMelodies();
    const cur = state.seq.melody && mlList.querySelector('.bt-item[data-i="' + state.seq.melody.i + '"]');
    if (cur) cur.scrollIntoView({ block: "center" }); else mlList.scrollTop = 0;
  }
  function closeMelodies() { mlStopPreview(); mlEl.hidden = true; }
  document.getElementById("mlCancel").addEventListener("click", closeMelodies);
  mlUse.addEventListener("click", () => {
    if (mlPick == null) return;
    const i = mlPick; mlStopPreview();
    const S = SC();
    mlUndo = { notes: S.notes.slice(), bars: S.bars, melody: state.seq.melody || null, synthMuted: !!state.seq.mute.synth };
    const sc = melodyToScore(i);
    S.notes = sc.notes; S.bars = sc.bars; S.level = S.level || 0.8;
    state.seq.mute.notes = false;
    state.seq.mute.synth = true;          // the old one-bar starter tune steps aside (tap its chip to bring it back)
    state.seq.melody = { i };
    save(); closeMelodies();
    if (state.mode === "notes") { renderHead(); scRender(); }
    if (!playing) startSeq();
  });
  mlUndoBtn.addEventListener("click", () => {
    if (!mlUndo) return;
    mlStopPreview();
    const S = SC(); S.notes = mlUndo.notes; S.bars = mlUndo.bars; state.seq.melody = mlUndo.melody; state.seq.mute.synth = mlUndo.synthMuted;
    mlUndo = null; mlUndoBtn.disabled = true; save();
    if (state.mode === "notes") scRender();
    renderMelodies("Your previous melody is back.");
  });
  document.getElementById("mlOpenNotes").addEventListener("click", openMelodies);
  document.getElementById("alsoMelody").addEventListener("click", openMelodies);
  document.addEventListener("visibilitychange", () => { if (document.hidden) mlStopPreview(); });
  try { const sv = JSON.parse(localStorage.getItem("nightbloom") || "null"); if (sv && sv.seq && sv.seq.melody) state.seq.melody = sv.seq.melody; } catch (e) {}


  // ======================================================================
  // Held notes: keep ringing when you switch to the 808 or Pads, and can be
  // paused and played again with the sound they were held with.
  // ======================================================================
  {
    const heldBar = document.getElementById("heldBar"), heldInfo = document.getElementById("heldInfo"), heldPP = document.getElementById("heldPP");
    let heldPaused = [];   // [{ root, engine, tones }]
    const NAMES12 = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    const nm = m => NAMES12[m % 12] + (Math.floor(m / 12) - 1);
    const engName = e => (ENGINES[e] ? ENGINES[e].name : e === "lib" ? (libInst ? libInst.name : "Library") : e === "inst" ? "Instrument" : e === "samp" ? "Sampler" : e);
    function paintHeld() {
      const live = [...heldVoices.values()], paused = heldPaused.length > 0;
      const tones = paused ? heldPaused.flatMap(p => p.tones) : live.flatMap(v => v.tones);
      heldBar.hidden = !tones.length;
      if (!tones.length) return;
      const eng = paused ? heldPaused[0].engine : (live[0].engine || state.engine);
      heldInfo.innerHTML = "";
      const lab = document.createElement("i"); lab.textContent = (paused ? "Paused" : "Held") + " · " + engName(eng); heldInfo.appendChild(lab);
      // one chip per held note or chord: tap to let just that one go
      const roots = paused ? heldPaused.map(p => [p.root, p.tones]) : [...heldVoices.entries()].map(([r, v]) => [r, v.tones]);
      roots.forEach(([root, t]) => {
        const c = document.createElement("button"); c.className = "heldchip";
        c.textContent = (t.length > 1 ? nm(root) + "+" + (t.length - 1) : nm(root)) + " ✕";
        c.setAttribute("aria-label", "Release " + nm(root));
        c.addEventListener("click", () => {
          if (paused) heldPaused = heldPaused.filter(p => p.root !== root);
          else dropHeld(root);
          updateHoldBtn();
        });
        heldInfo.appendChild(c);
      });
      heldPP.textContent = paused ? "▶ Play" : "⏸ Pause";
      heldPP.setAttribute("aria-label", paused ? "Play held notes" : "Pause held notes");
      heldBar.classList.toggle("paused", paused);
    }
    // remember which sound each held note was made with
    {
      const ot = toggleHeld;
      toggleHeld = function (root) {
        const had = heldVoices.has(root);
        // tapping a note that's already held leaves it ringing (drop single notes from the Held bar)
        if (had) { const k = keyEls.get(root); if (k) { k.classList.add("arphit"); setTimeout(() => k.classList.remove("arphit"), 160); } return; }
        if (heldPaused.length) heldPaused = [];      // a new held note starts a fresh set
        ot(root);
        const v = heldVoices.get(root); if (v && !had) v.engine = state.engine;
        paintHeld();
      };
      const ou = updateHoldBtn;
      updateHoldBtn = function () { ou(); paintHeld(); };
    }
    function pauseHeld() {
      if (!heldVoices.size) return;
      heldPaused = [...heldVoices.entries()].map(([root, v]) => ({ root, engine: v.engine || state.engine, tones: v.tones.slice() }));
      [...heldVoices.keys()].forEach(dropHeld);
      updateHoldBtn();
    }
    function playHeld() {
      if (!heldPaused.length || !ctx) return;
      const keepEngine = state.engine, keepChord = chordType;
      chordType = "off";
      for (const p of heldPaused) {
        state.engine = p.engine;
        const parts = p.tones.map(m => makeNote(m));
        const v = { tones: p.tones, engine: p.engine, stop() { parts.forEach(x => x.stop()); } };
        heldVoices.set(p.root, v);
        markTones(v.tones, markHeld, true);
      }
      state.engine = keepEngine; chordType = keepChord;
      heldPaused = [];
      updateHoldBtn();
    }
    // turning Hold on while fingers are on keys latches those notes instead of leaving them stranded
    holdBtn.addEventListener("click", () => {
      if (!state.hold || !voices.size) return;
      for (const [m, v] of [...voices.entries()]) {
        if (heldVoices.has(m)) { v.stop(); continue; }
        v.engine = state.engine; heldVoices.set(m, v); markTones(v.tones, markHeld, true);
      }
      voices.clear(); order.length = 0; touches.clear(); heldPaused = [];
      updateHoldBtn();
    });
    heldPP.addEventListener("click", () => { start(); heldPaused.length ? playHeld() : pauseHeld(); });
    document.getElementById("heldRelease").addEventListener("click", () => { heldPaused = []; releaseHeld(); });
    document.getElementById("panic").addEventListener("click", () => { heldPaused = []; paintHeld(); });

    // fingers still down when the keyboard turns into 808 or kit pads: their notes move to Hold
    let lastEngine = state.engine;
    const ore = renderEngine;
    renderEngine = function () {
      const now = state.engine, toPads = ["drum", "pads"].includes(now) && !["drum", "pads"].includes(lastEngine);
      if (toPads && voices.size && ctx) {
        for (const [m, v] of [...voices.entries()]) {
          if (heldVoices.has(m)) { v.stop(); continue; }
          v.engine = lastEngine;
          heldVoices.set(m, v);
          markTones(v.tones, markHeld, true);
        }
        voices.clear(); order.length = 0; touches.clear();
        heldPaused = [];
      }
      lastEngine = now;
      ore();
      updateHoldBtn();
    };
    paintHeld();
  }


  // ======================================================================
  // Section picker: files longer than a minute open here, showing the whole
  // file, so any part of it (up to 5 minutes) can become the sample.
  // ======================================================================
  const PICK_OVER_SEC = 60;
  const sp = { buf: null, name: "", a: 0, b: 0, res: null, src: null, t0: 0, from: 0, raf: 0, peaks: null, drag: null };
  const spEl = document.getElementById("secPick"), spAll = document.getElementById("spAll"), spZoom = document.getElementById("spZoom");
  const spInfo = document.getElementById("spInfo"), spUse = document.getElementById("spUse"), spPlay = document.getElementById("spPlay");
  const spUseAll = document.getElementById("spUseAll");
  const fmtM = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2); };

  function spPeaks(buf, n) {
    const out = new Float32Array(n), per = buf.length / n, chs = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * per), b = Math.min(buf.length, Math.floor((i + 1) * per)), step = Math.max(1, Math.floor((b - a) / 300));
      let m = 0; for (const d of chs) for (let j = a; j < b; j += step) { const v = Math.abs(d[j]); if (v > m) m = v; }
      out[i] = m;
    }
    return out;
  }
  function spView() {   // the zoomed window around the selection
    const len = sp.b - sp.a, pad = Math.max(0.5, len * 0.12);
    return [Math.max(0, sp.a - pad), Math.min(sp.buf.duration, sp.b + pad)];
  }
  function drawCanvas(cv, t0, t1, peaksFn) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const X = t => (t - t0) / (t1 - t0) * w, ax = X(sp.a), bx = X(sp.b);
    g.fillStyle = "rgba(196,163,255,0.16)"; g.fillRect(ax, 0, Math.max(1, bx - ax), h);
    const pk = peaksFn(Math.max(1, Math.floor(w)));
    for (let x = 0; x < pk.length; x++) {
      const t = t0 + (x + 0.5) / w * (t1 - t0), a = pk[x] * h * 0.46;
      g.fillStyle = t >= sp.a && t <= sp.b ? lilac : "rgba(196,163,255,0.35)";
      g.fillRect(x, h / 2 - a, 1, Math.max(1, a * 2));
    }
    g.fillStyle = amber;
    [ax, bx].forEach(x => { g.fillRect(Math.min(w - 3, Math.max(0, x - 1.5)), 0, 3, h); g.beginPath(); g.arc(Math.min(w - 6, Math.max(6, x)), h - 8, 7, 0, Math.PI * 2); g.fill(); });
    if (sp.src) { const pt = sp.from + (ctx.currentTime - sp.t0); if (pt >= t0 && pt <= t1) { g.fillStyle = "#fff"; g.fillRect(X(pt), 0, 2, h); } }
  }
  function spDraw() {
    if (!sp.buf) return;
    const D = sp.buf.duration;
    drawCanvas(spAll, 0, D, n => { if (!sp.peaks || sp.peaks.length !== n) sp.peaks = spPeaks(sp.buf, n); return sp.peaks; });
    const [z0, z1] = spView();
    drawCanvas(spZoom, z0, z1, n => {
      const out = new Float32Array(n), rate = sp.buf.sampleRate, chs = [];
      for (let c = 0; c < sp.buf.numberOfChannels; c++) chs.push(sp.buf.getChannelData(c));
      for (let i = 0; i < n; i++) {
        const a = Math.floor((z0 + i / n * (z1 - z0)) * rate), b = Math.floor((z0 + (i + 1) / n * (z1 - z0)) * rate), step = Math.max(1, Math.floor((b - a) / 200));
        let m = 0; for (const d of chs) for (let j = a; j < b; j += step) { const v = Math.abs(d[j] || 0); if (v > m) m = v; }
        out[i] = m;
      }
      return out;
    });
    const len = sp.b - sp.a;
    spInfo.textContent = fmtM(sp.a) + " – " + fmtM(sp.b) + " · " + len.toFixed(2) + " s of " + fmtM(D);
    spUse.disabled = len < 0.05 || len > MAX_SAMPLE_SEC;
    spUse.textContent = len > MAX_SAMPLE_SEC ? "Max " + nbMinSec(MAX_SAMPLE_SEC) + " — shorten it" : "Use " + len.toFixed(1) + " s";
    spUseAll.hidden = D > MAX_SAMPLE_SEC;
  }
  function spLoop() { spDraw(); if (sp.src) sp.raf = requestAnimationFrame(spLoop); }
  function spStop() { if (sp.src) { try { sp.src.stop(); } catch (e) {} sp.src = null; } cancelAnimationFrame(sp.raf); spPlay.textContent = "▶ Preview"; spDraw(); }
  function spPreview() {
    if (sp.src) { spStop(); return; }
    start();
    const s = ctx.createBufferSource(); s.buffer = sp.buf; s.connect(fx.master || ctx.destination);
    sp.from = sp.a; sp.t0 = ctx.currentTime + 0.02;
    s.start(sp.t0, sp.a, sp.b - sp.a); s.onended = () => { if (sp.src === s) spStop(); };
    sp.src = s; spPlay.textContent = "■ Stop"; spLoop();
  }
  spPlay.addEventListener("click", spPreview);
  // dragging: near a handle moves that handle; elsewhere on the overview draws a new selection
  function spPointer(cv, isZoom) {
    const toT = e => {
      const r = cv.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const [t0, t1] = isZoom ? sp.dragView || spView() : [0, sp.buf.duration];
      return t0 + f * (t1 - t0);
    };
    const hx = (t, e) => { const r = cv.getBoundingClientRect(), [t0, t1] = isZoom ? spView() : [0, sp.buf.duration]; return Math.abs(r.left + (t - t0) / (t1 - t0) * r.width - e.clientX); };
    cv.addEventListener("pointerdown", e => {
      if (!sp.buf) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
      sp.dragView = isZoom ? spView() : null;
      const t = toT(e), da = hx(sp.a, e), db = hx(sp.b, e);
      if (Math.min(da, db) < 22) sp.drag = { which: da <= db ? "a" : "b" };
      else if (isZoom) sp.drag = { which: Math.abs(t - sp.a) < Math.abs(t - sp.b) ? "a" : "b" };
      else sp.drag = { which: "new", anchor: t };
      if (sp.drag.which !== "new") sp[sp.drag.which] = t;
      if (sp.a > sp.b) [sp.a, sp.b] = [sp.b, sp.a];
      spDraw();
    });
    cv.addEventListener("pointermove", e => {
      if (!sp.drag) return;
      const t = toT(e);
      if (sp.drag.which === "new") { sp.a = Math.min(sp.drag.anchor, t); sp.b = Math.max(sp.drag.anchor, t); }
      else { sp[sp.drag.which] = t; if (sp.a > sp.b) { [sp.a, sp.b] = [sp.b, sp.a]; sp.drag.which = sp.drag.which === "a" ? "b" : "a"; } }
      spDraw();
    });
    const end = () => {
      if (!sp.drag) return;
      if (sp.drag.which === "new" && sp.b - sp.a < 0.05) { const len = Math.min(10, sp.buf.duration); sp.a = Math.max(0, Math.min(sp.drag.anchor, sp.buf.duration - len)); sp.b = sp.a + len; }
      sp.drag = null; sp.dragView = null; spDraw();
    };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }
  spPointer(spAll, false); spPointer(spZoom, true);
  const nudge = (which, d) => { sp[which] = Math.max(0, Math.min(sp.buf.duration, sp[which] + d)); if (sp.a > sp.b) [sp.a, sp.b] = [sp.b, sp.a]; spDraw(); };
  document.getElementById("spA-").addEventListener("click", () => nudge("a", -0.05));
  document.getElementById("spA+").addEventListener("click", () => nudge("a", 0.05));
  document.getElementById("spB-").addEventListener("click", () => nudge("b", -0.05));
  document.getElementById("spB+").addEventListener("click", () => nudge("b", 0.05));
  document.querySelectorAll("[data-splen]").forEach(btn => btn.addEventListener("click", () => {
    const len = +btn.dataset.splen; sp.b = Math.min(sp.buf.duration, sp.a + len); if (sp.b - sp.a < len) sp.a = Math.max(0, sp.b - len); spDraw();
  }));
  function sliceBuf(buf, a, b) {
    const rate = buf.sampleRate, i0 = Math.floor(a * rate), n = Math.max(1, Math.floor((b - a) * rate));
    const out = ctx.createBuffer(buf.numberOfChannels, n, rate), fade = Math.min(Math.floor(rate * 0.004), Math.floor(n / 4));
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = out.getChannelData(c); d.set(buf.getChannelData(c).subarray(i0, i0 + n));
      for (let i = 0; i < fade; i++) { const g = i / fade; d[i] *= g; d[n - 1 - i] *= g; }   // tiny fades so the cut points don't click
    }
    return out;
  }
  function spFinish(result) { spStop(); spEl.hidden = true; const r = sp.res; sp.res = null; sp.buf = null; sp.peaks = null; if (r) r(result); }
  spUse.addEventListener("click", () => {
    const base = sp.name.replace(AUDIO_RE, "");
    spFinish({ buf: sliceBuf(sp.buf, sp.a, sp.b), name: base + " (" + fmtM(sp.a).replace(/\.\d+$/, "") + "–" + fmtM(sp.b).replace(/\.\d+$/, "") + ")" });
  });
  spUseAll.addEventListener("click", () => spFinish({ buf: sp.buf, name: sp.name, whole: true }));
  document.getElementById("spCancel").addEventListener("click", () => spFinish(null));
  function chooseSection(buf, name) {
    return new Promise(res => {
      sp.buf = buf; sp.name = name; sp.res = res; sp.peaks = null;
      sp.a = 0; sp.b = Math.min(buf.duration, 30);
      document.getElementById("spTitle").textContent = name.replace(AUDIO_RE, "");
      spEl.hidden = false; requestAnimationFrame(spDraw);
    });
  }
  window.addEventListener("resize", () => { if (!spEl.hidden) spDraw(); });


