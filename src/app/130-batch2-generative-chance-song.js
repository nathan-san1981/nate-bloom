  // ======================================================================
  // BETA · Batch 2: generative melodies (with Evolve), sequencer chance and
  // rolls, and Song mode (patterns A–D chained into an arrangement)
  // ======================================================================

  // ---------- Generative melodies ----------
  const GEN_SCALES = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10], penta: [0, 2, 4, 7, 9], mpenta: [0, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
  const GEN_MINOR = { min: 1, mpenta: 1, dorian: 1 };
  let genCount = 0;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  function generateMelody(mood, scaleId, bars) {
    const sc = GEN_SCALES[scaleId], n = sc.length, out = [];
    const semi = deg => 12 * Math.floor(deg / n) + sc[((deg % n) + n) % n];
    const lens = mood === "ambient" ? [8, 12, 16] : mood === "flow" ? [2, 4, 4, 6, 8] : [1, 2, 2, 2, 4];
    const restP = mood === "ambient" ? 0.3 : mood === "flow" ? 0.15 : 0.1;
    let deg = pick([0, 2, 4]), lastBar = -1;
    for (let b = 0; b < bars; b++) {
      let s = 0;
      // the second half of the phrase answers the first: reuse its rhythm, shift its pitches
      const answer = bars >= 2 && b >= bars / 2 && mood !== "ambient";
      const src = answer ? out.filter(x => Math.floor(x[0] / 16) === b - bars / 2) : null;
      if (src && src.length) {
        const shift = pick([-2, -1, 1, 2]);
        src.forEach(([st, d, sm, dg]) => { const nd = dg + shift + (b === bars - 1 && st % 16 >= 8 ? 0 : 0); out.push([st + bars / 2 * 16, d, semi(nd), nd]); });
        continue;
      }
      while (s < 16) {
        let d = pick(lens); if (s + d > 16) d = 16 - s;
        if (Math.random() < restP && s > 0) { s += Math.min(d, 4); continue; }
        // steps of a scale degree or two, an occasional leap, chord tones on the downbeat
        const r = Math.random();
        deg += r < 0.42 ? pick([-1, 1]) : r < 0.75 ? pick([-2, 2]) : r < 0.9 ? 0 : pick([-4, 4, 3, -3]);
        if (s === 0 && b !== lastBar) { deg = Math.round(deg / 2) * 2; lastBar = b; }
        deg = Math.max(-3, Math.min(n + 5, deg));
        out.push([b * 16 + s, d, semi(deg), deg]);
        s += d;
      }
    }
    // land the phrase on the root
    const last = out[out.length - 1]; if (last) { last[2] = semi(Math.round(last[3] / n) * n); last[3] = Math.round(last[3] / n) * n; }
    if (mood === "ambient") out.push([0, 16 * Math.min(bars, 4), -12, -n]);   // a low root to sit under it
    return out.map(([st, d, sm]) => [st, d, sm]);
  }
  {
    const box = document.getElementById("genBox");
    const moodSel = document.getElementById("genMood"), scaleSel = document.getElementById("genScale"), barsSel = document.getElementById("genBars"), evo = document.getElementById("genEvolve");
    try { const g = JSON.parse(localStorage.getItem("nightbloom-gen") || "null"); if (g) { moodSel.value = g.mood; scaleSel.value = g.scale; barsSel.value = g.bars; evo.checked = !!g.evolve; } } catch (e) {}
    const saveGen = () => { try { localStorage.setItem("nightbloom-gen", JSON.stringify({ mood: moodSel.value, scale: scaleSel.value, bars: barsSel.value, evolve: evo.checked })); } catch (e) {} };
    [moodSel, scaleSel, barsSel, evo].forEach(el => el.addEventListener("change", saveGen));
    document.getElementById("genNew").addEventListener("click", () => {
      const mood = moodSel.value, scale = scaleSel.value, bars = +barsSel.value;
      const notes = generateMelody(mood, scale, bars);
      genCount++;
      const label = moodSel.options[moodSel.selectedIndex].text;
      MELODIES.push(["Generated " + genCount + " · " + label, "Generated", GEN_MINOR[scale] ? "min" : "maj", bars, notes]);
      const gi = MELODIES.length - 1; MELODIES[gi].gen = { scale };
      renderMelodies("New melody ready (it's playing). Use keeps it; Generate again for another.");
      mlChoose(gi); mlPreview(gi);
      const it = mlList.querySelector('.bt-item[data-i="' + gi + '"]'); if (it) it.scrollIntoView({ block: "center" });
    });
    onBeta(on => { box.hidden = !on; });
    box.hidden = !betaOn;
    // Evolve: each time the melody comes round, nudge a note or two within the key
    const keyRoot = () => (KEY_PC[SC().key] || 0);
    function evolveOnce() {
      const S = SC(); if (!S.notes.length) return;
      const minor = state.seq.melody && MELODIES[state.seq.melody.i] && MELODIES[state.seq.melody.i][2] === "min";
      const scale = (state.seq.melody && MELODIES[state.seq.melody.i] && MELODIES[state.seq.melody.i].gen && GEN_SCALES[MELODIES[state.seq.melody.i].gen.scale]) || (minor ? GEN_SCALES.min : GEN_SCALES.maj);
      const root = (keyRoot() + (minor ? 9 : 0)) % 12;
      const inScale = m => scale.includes((((m - root) % 12) + 12) % 12);
      const changes = rnd(1, 2);
      for (let k = 0; k < changes; k++) {
        const n = pick(S.notes); let m = n.m, dir = pick([-1, 1]), tries = 0;
        do { m += dir; tries++; } while (!inScale(m) && tries < 4);
        if (m >= 36 && m <= 96) { n.m = m; n.dia = spell(m); }
      }
      save(); if (state.mode === "notes") scRender();
    }
    const sched = scheduleStep;
    scheduleStep = function (s, t) {
      if (s === 0 && betaOn && evo.checked && playing && scBar === SC().bars - 1) evolveOnce();
      sched(s, t);
    };
  }

  // ---------- Sequencer chance and rolls ----------
  if (!state.seq.prob) state.seq.prob = {};
  if (!state.seq.rat) state.seq.rat = {};
  try { const sv = JSON.parse(localStorage.getItem("nightbloom") || "null"); if (sv && sv.seq) { if (sv.seq.prob) state.seq.prob = sv.seq.prob; if (sv.seq.rat) state.seq.rat = sv.seq.rat; } } catch (e) {}
  const stepProb = (id, s) => (state.seq.prob[id] && state.seq.prob[id][s] != null ? state.seq.prob[id][s] : 100);
  const stepRat = (id, s) => (state.seq.rat[id] && state.seq.rat[id][s] ? state.seq.rat[id][s] : 1);
  let stepMode = "notes";
  const stepBar = document.getElementById("stepBar");
  function paintStepMode() {
    stepBar.querySelectorAll("button[data-sm]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sm === stepMode)));
    document.getElementById("stepHint").textContent = stepMode === "chance" ? "tap a lit drum step: 100 → 75 → 50 → 25%" : stepMode === "rolls" ? "tap a lit drum step: 1 → 2 → 3 → 4 hits" : "tap steps to turn them on and off";
    seqEl.classList.toggle("stepedit", stepMode !== "notes");
  }
  stepBar.querySelectorAll("button[data-sm]").forEach(b => b.addEventListener("click", () => { stepMode = b.dataset.sm; paintStepMode(); }));
  document.getElementById("stepReset").addEventListener("click", () => { state.seq.prob = {}; state.seq.rat = {}; save(); paintSeq(); });
  seqWrap.addEventListener("pointerdown", e => {
    if (stepMode === "notes" || !betaOn) return;
    const c = cellAt(e.clientX, e.clientY); if (!c) return;
    const row = c.dataset.row, s = Number(c.dataset.step);
    if (!DRUMS.some(d => d[0] === row)) return;
    e.preventDefault(); e.stopPropagation();
    if (!state.seq.rows[row][s]) return;
    if (stepMode === "chance") {
      if (!state.seq.prob[row]) state.seq.prob[row] = Array(MAXSTEPS).fill(100);
      const cur = state.seq.prob[row][s] ?? 100; state.seq.prob[row][s] = cur <= 25 ? 100 : cur - 25;
    } else {
      if (!state.seq.rat[row]) state.seq.rat[row] = Array(MAXSTEPS).fill(1);
      const cur = state.seq.rat[row][s] || 1; state.seq.rat[row][s] = cur >= 4 ? 1 : cur + 1;
      if (ctx) { const r = state.seq.rat[row][s], t = ctx.currentTime; for (let k = 0; k < r; k++) playDrum(row, t + k * stepDur() / r); }
    }
    save(); paintSeq();
  }, true);
  {
    const op = paintSeq;
    paintSeq = function () {
      op();
      ROWS.forEach(([id], r) => cellEls[r] && cellEls[r].forEach((c, s) => {
        const on = state.seq.rows[id] && state.seq.rows[id][s] && DRUMS.some(d => d[0] === id);
        const p = on ? stepProb(id, s) : 100, rt = on ? stepRat(id, s) : 1;
        c.style.opacity = p < 100 ? String(0.35 + p / 100 * 0.6) : "";
        c.dataset.prob = p < 100 ? p : ""; c.dataset.rat = rt > 1 ? "•".repeat(rt) : "";
      }));
    };
  }
  const showStepBar = () => { stepBar.hidden = !(betaOn && state.mode === "seq"); };
  onBeta(on => { showStepBar(); if (!on) { stepMode = "notes"; paintStepMode(); } if (seqBuilt) paintSeq(); });
  { const om = setMode; setMode = function (m) { om(m); showStepBar(); }; }
  showStepBar(); paintStepMode();

  // ---------- Song mode ----------
  const songEl = document.getElementById("song"), songSlots = document.getElementById("songSlots"), songChain = document.getElementById("songChain"), songInfo = document.getElementById("songInfo");
  const songOnBtn = document.getElementById("songOn");
  const song = { patterns: {}, chain: [], on: false };
  try { const s = JSON.parse(localStorage.getItem("nightbloom-song") || "null"); if (s) Object.assign(song, s); } catch (e) {}
  song.on = false;
  const saveSong = () => { try { localStorage.setItem("nightbloom-song", JSON.stringify(song)); } catch (e) {} };
  const copy = o => JSON.parse(JSON.stringify(o));
  function capturePattern() {
    return { rows: copy(state.seq.rows), synth: copy(state.seq.synth), notes: copy(SC().notes), bars: SC().bars, melody: state.seq.melody ? copy(state.seq.melody) : null,
      prob: copy(state.seq.prob || {}), rat: copy(state.seq.rat || {}), mute: copy(state.seq.mute || {}) };
  }
  function loadPattern(p) {
    for (const id in p.rows) if (state.seq.rows[id]) state.seq.rows[id] = p.rows[id].slice();
    state.seq.synth = p.synth.slice(); state.seq.prob = copy(p.prob || {}); state.seq.rat = copy(p.rat || {});
    if (p.mute) state.seq.mute = copy(p.mute);
    const S = SC(); S.notes = copy(p.notes); S.bars = p.bars; state.seq.melody = p.melody ? copy(p.melody) : null;
    scFresh = true;
    if (seqBuilt) paintSeq();
    if (state.mode === "notes") scRender();
  }
  const barsOf = p => Math.max(1, p.bars || 1);
  const sp2 = { idx: 0, bar: 0 };
  function songTick() {   // called at the start of every bar while the song plays
    const e = song.chain[sp2.idx]; if (!e) return;
    sp2.bar++;
    if (sp2.bar >= e.bars) {
      sp2.idx = (sp2.idx + 1) % song.chain.length; sp2.bar = 0;
      const n = song.chain[sp2.idx], p = song.patterns[n.p];
      if (p) loadPattern(p);
    }
    paintSongPos();
  }
  {
    const sched = scheduleStep;
    let first = true;
    scheduleStep = function (s, t) {
      if (s === 0 && song.on && betaOn && song.chain.length) { if (first) first = false; else songTick(); }
      sched(s, t);
    };
    const os = startSeq;
    startSeq = function () {
      if (!playing && song.on && betaOn && song.chain.length) {
        first = true; sp2.idx = 0; sp2.bar = 0;
        const p = song.patterns[song.chain[0].p]; if (p) loadPattern(p);
        paintSongPos();
      }
      os();
    };
  }
  function paintSongPos() {
    songChain.querySelectorAll(".song-step").forEach((el, i) => el.classList.toggle("now", song.on && playing && i === sp2.idx));
    const btn = document.getElementById("songBtn");
    btn.textContent = song.on && song.chain.length ? "Song " + (song.chain[sp2.idx] ? song.chain[sp2.idx].p : "") + " ▸" : "Song";
  }
  function renderSong() {
    songSlots.innerHTML = "";
    ["A", "B", "C", "D"].forEach(k => {
      const p = song.patterns[k], card = document.createElement("div"); card.className = "song-slot" + (p ? " has" : "");
      card.innerHTML = `<b>${k}</b><small>${p ? barsOf(p) + " bar" + (barsOf(p) > 1 ? "s" : "") + (p.melody && MELODIES[p.melody.i] ? " · " + MELODIES[p.melody.i][0] : "") : "empty"}</small>
        <div><button class="btn sv">Save here</button><button class="btn ld"${p ? "" : " disabled"}>Load</button><button class="btn ad"${p ? "" : " disabled"}>+ Add</button></div>`;
      card.querySelector(".sv").addEventListener("click", () => { song.patterns[k] = capturePattern(); saveSong(); songInfo.textContent = "Saved the current beat and melody as " + k + "."; renderSong(); });
      card.querySelector(".ld").addEventListener("click", () => { if (p) { loadPattern(p); save(); songInfo.textContent = "Loaded " + k + " to edit. Save it again when you're done."; } });
      card.querySelector(".ad").addEventListener("click", () => { if (p) { song.chain.push({ p: k, bars: Math.max(barsOf(p), 4) }); saveSong(); renderSong(); } });
      songSlots.appendChild(card);
    });
    songChain.innerHTML = "";
    if (!song.chain.length) { const e = document.createElement("div"); e.className = "pr-empty"; e.textContent = "Save patterns in A–D, then tap + Add to build the song in order."; songChain.appendChild(e); }
    song.chain.forEach((e, i) => {
      const el = document.createElement("div"); el.className = "song-step";
      el.innerHTML = `<b>${e.p}</b><button class="btn sb" aria-label="Change length">${e.bars} bar${e.bars > 1 ? "s" : ""}</button><button class="btn sx" aria-label="Remove">✕</button>`;
      el.querySelector(".sb").addEventListener("click", () => { const opts = [1, 2, 4, 8, 16]; e.bars = opts[(opts.indexOf(e.bars) + 1) % opts.length] || 4; saveSong(); renderSong(); });
      el.querySelector(".sx").addEventListener("click", () => { song.chain.splice(i, 1); saveSong(); renderSong(); });
      songChain.appendChild(el);
    });
    const total = song.chain.reduce((a, e) => a + e.bars, 0);
    songOnBtn.setAttribute("aria-pressed", String(song.on)); songOnBtn.textContent = song.on ? "Song mode: On" : "Song mode: Off";
    document.getElementById("songLen").textContent = song.chain.length ? total + " bars · about " + fmtClock(total * barSec()) : "";
    paintSongPos();
  }
  songOnBtn.addEventListener("click", () => {
    song.on = !song.on;
    if (song.on && !song.chain.length) { song.on = false; songInfo.textContent = "Add at least one pattern to the song first."; }
    if (song.on && playing) { stopSeq(); startSeq(); }
    renderSong();
  });
  document.getElementById("songClear").addEventListener("click", () => { song.chain = []; song.on = false; saveSong(); renderSong(); });
  document.getElementById("songPlay").addEventListener("click", () => { if (!song.chain.length) return; song.on = true; if (playing) stopSeq(); startSeq(); renderSong(); });
  document.getElementById("songBtn").addEventListener("click", () => { songEl.hidden = false; songInfo.textContent = "Patterns hold the beat, melody, chance and rolls. Chain them to make a song."; renderSong(); });
  document.getElementById("songDone").addEventListener("click", () => { songEl.hidden = true; });
  onBeta(on => { if (!on) { song.on = false; paintSongPos(); } });
  paintSongPos();


