  // ---------- Jam: four loops that record what you play, and a band that follows your chords ----------
  // One clock drives both, at the sequencer tempo (or the DJ tempo while a deck is playing). Loops
  // record keys, drums and pads with the sound they were played with, quantised to 16ths, up to 4
  // bars, and go round in time. The band plays a bass line and a drum pattern in whatever chord you
  // hold on the keys, in a style you pick.
  const JAM = { clock: 0, step: 0, nextT: 0, rec: null, tracks: [0, 1, 2, 3].map(() => ({ events: [], len: 0, start: 0, on: false })), live: [[], [], [], []],
    band: { on: false, style: "house", bass: "mono", bassLvl: 0.7, drumLvl: 0.8, chord: { root: 0, q: "maj" }, held: new Set() }, replaying: false, drumBus: null, drumBusFor: null, fired: 0 };
  try { const o = JSON.parse(localStorage.getItem("nightbloom-jam") || "{}"); if (o.band) Object.assign(JAM.band, o.band, { on: false, held: new Set() }); if (Array.isArray(o.tracks)) o.tracks.forEach((t, k) => { if (t && t.len && Array.isArray(t.events)) Object.assign(JAM.tracks[k], { events: t.events, len: t.len, start: t.start || 0, on: false }); }); } catch (e) {}
  let jamSaveT = 0; const jamSave = () => { clearTimeout(jamSaveT); jamSaveT = setTimeout(() => { try { localStorage.setItem("nightbloom-jam", JSON.stringify({ band: { style: JAM.band.style, bass: JAM.band.bass, bassLvl: JAM.band.bassLvl, drumLvl: JAM.band.drumLvl }, tracks: JAM.tracks.map(t => ({ events: t.events, len: t.len, start: t.start })) })); } catch (e) {} }, 200); };
  const BAR = 16, MAX_BARS = 4;
  const jamBpm = () => { try { const L = LEAD(); if (L && L.playing && L.bpm0) return djEff(L) * L.bend; } catch (e) {} return state.seq.bpm; };
  const jamStepDur = () => 60 / jamBpm() / 4;
  const jamActive = () => !!JAM.rec || JAM.band.on || JAM.tracks.some(t => t.on && t.len > 0);
  // --- styles: a bass pattern (step, semitones from the root, length in steps) and a drum pattern from the beat library ---
  const JAM_STYLES = {
    house:  { name: "House",   beat: "House",        bass: [[0, 0, 2], [2, 0, 1], [4, 0, 2], [6, 0, 1], [8, 0, 2], [10, 7, 1], [12, 0, 2], [14, 12, 1]] },
    pop:    { name: "Pop",     beat: "Disco",        bass: [[0, 0, 4], [4, 0, 2], [6, 0, 2], [8, 7, 4], [12, 0, 2], [14, 5, 2]] },
    funk:   { name: "Funk",    beat: "Funk",         bass: [[0, 0, 1], [3, 0, 1], [6, 12, 1], [7, 10, 1], [8, 0, 1], [10, 7, 1], [11, 0, 1], [13, 12, 1], [14, 10, 1]] },
    hiphop: { name: "Hip-hop", beat: "Boom Bap",     bass: [[0, 0, 6], [7, 0, 1], [8, 0, 4], [12, 7, 2], [14, 5, 2]] },
    lofi:   { name: "Lo-fi",   beat: "Dusty Lo-Fi",  bass: [[0, 0, 8], [8, 7, 4], [12, 0, 4]] },
    rock:   { name: "Rock",    beat: "Rock",         bass: [[0, 0, 2], [2, 0, 2], [4, 0, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 7, 2]] },
    latin:  { name: "Latin",   beat: "Dembow",       bass: [[0, 0, 3], [3, 0, 3], [6, 7, 2], [8, 0, 2], [11, 7, 1], [12, 12, 2], [14, 7, 2]] },
    techno: { name: "Techno",  beat: "Techno",       bass: [[2, 0, 1], [6, 0, 1], [10, 0, 1], [14, 0, 1], [0, -12, 1], [8, -12, 1]] },
    trap:   { name: "Trap",    beat: "Trap",         bass: [[0, 0, 8], [8, 0, 3], [11, 3, 1], [12, 0, 4]] },
  };
  const jamBeatIdx = () => { const nm = JAM_STYLES[JAM.band.style].beat, i = BEATS.findIndex(b => b[0] === nm); return i >= 0 ? i : 0; };
  // --- the chord you're holding ---
  const CHORD_TPL = { maj: [0, 4, 7], min: [0, 3, 7], "7": [0, 4, 7, 10], min7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6], "5": [0, 7] };
  function jamChordFrom(midis) {
    if (!midis.length) return null;
    const pcs = [...new Set(midis.map(m => ((m % 12) + 12) % 12))], low = Math.min(...midis);
    if (pcs.length === 1) return { root: pcs[0], q: JAM.band.chord.q === "min" || JAM.band.chord.q === "min7" ? "min" : "maj", low };
    let best = null;
    for (let root = 0; root < 12; root++) for (const q in CHORD_TPL) {
      const tpl = CHORD_TPL[q].map(x => (root + x) % 12), hit = pcs.filter(p => tpl.includes(p)).length, extra = pcs.length - hit, miss = tpl.length - hit;
      const s = hit * 2 - extra - miss * 0.6 + (root === low % 12 ? 0.8 : 0);
      if (!best || s > best.s) best = { s, root, q };
    }
    return { root: best.root, q: best.q, low };
  }
  function jamNoteChange() {
    const held = [...voices.keys()]; heldVoices.forEach(v => held.push(...v.tones));
    const c = jamChordFrom(held); if (!c) return;
    JAM.band.chord = { root: c.root, q: c.q }; jamPaintBand();
  }
  // --- the clock ---
  function jamSchedule() {
    if (JAM.nextT < ctx.currentTime - 0.05) { const d = jamStepDur(), k = Math.ceil((ctx.currentTime - JAM.nextT) / d); JAM.nextT += k * d; JAM.step += k; }
    while (JAM.nextT < ctx.currentTime + NB_LA) {
      const s = JAM.step, t = JAM.nextT, dur = jamStepDur();
      if (JAM.rec) {
        if (JAM.rec.armed && s >= JAM.rec.start) { JAM.rec.armed = false; jamPaintLoops(); }
        else if (!JAM.rec.armed && s - JAM.rec.start >= MAX_BARS * BAR) jamRecStop();
      }
      jamTrackStep(s, t); if (JAM.band.on) jamBandStep(s, t);
      JAM.nextT += dur; JAM.step++;
    }
  }
  function jamClockOn() {
    if (JAM.clock) return; start();
    if (!jamActive()) JAM.step = 0;
    // start on the DJ lead's next bar so everything sits on the song
    let at = ctx.currentTime + 0.05;
    try { const L = LEAD(); if (L && L.playing && L.bpm0) { const per = djPer(L), pos = djPos(L), k = Math.ceil((pos - L.off) / per / 4 + 0.03) * 4; at = ctx.currentTime + Math.max(0.05, ((L.off + k * per) - pos) / (L.rate * L.bend)); JAM.step = 0; } } catch (e) {}
    JAM.nextT = at; JAM.clock = setInterval(jamSchedule, 25);
  }
  function jamClockOff() { if (!jamActive() && JAM.clock) { clearInterval(JAM.clock); JAM.clock = 0; } }
  // --- loops: recording ---
  const jamPos = () => JAM.rec ? (ctx.currentTime - JAM.rec.t0) / jamStepDur() : 0;   // (147: 0 once the recording has stopped)
  function jamRecord(kind, data, v) {
    if (!JAM.rec || JAM.rec.armed || JAM.replaying) return v;
    const ev = Object.assign({ p: Math.round(jamPos()), kind, h: 0 }, data); if (ev.p < 0) { if (ev.p < -2) return v; ev.p = 0; }   // (147: just early counts on the bar)
    JAM.rec.events.push(ev);
    if (kind === "note" && v) { ev.h = null; const v0 = v; return Object.assign(Object.create(Object.getPrototypeOf(v0)), v0, { stop(at) { v0.stop(at); if (ev.h == null) ev.h = Math.max(1, Math.round(jamPos()) - ev.p); } }); }
    return v;
  }
  function jamRecStart(k) {
    if (JAM.rec) { const same = JAM.rec.k === k; jamRecStop(); if (same) return; }
    start(); jamClear(k, true);
    const running = !!JAM.clock; jamClockOn();
    const wait = running ? (BAR - JAM.step % BAR) % BAR : 0;
    JAM.rec = { k, armed: wait > 0, start: JAM.step + wait, t0: JAM.nextT + wait * jamStepDur(), events: [] };
    jamPaintLoops(); noteMsg(wait ? "Loop " + (k + 1) + ": recording starts on the next bar…" : "Recording loop " + (k + 1) + " · play keys, drums or pads · tap it again to stop (4 bars max)");
  }
  function jamRecStop() {
    if (!JAM.rec) return; const r = JAM.rec; JAM.rec = null;
    if (!r.armed) {
      const t = JAM.tracks[r.k], played = (ctx.currentTime - r.t0) / jamStepDur();
      let bars = Math.floor(played / BAR); if (played - bars * BAR > 4) bars++; bars = Math.max(1, Math.min(MAX_BARS, bars));
      t.len = bars * BAR; t.start = r.start;
      t.events = r.events.filter(ev => ev.p < t.len).map(ev => { if (ev.kind === "note" && (ev.h == null || ev.p + ev.h > t.len)) ev.h = Math.max(1, t.len - ev.p); return ev; });
      t.on = t.events.length > 0;
      if (!t.on) { t.len = 0; noteMsg("Nothing was played, so loop " + (r.k + 1) + " stayed empty"); }
      else noteMsg("Loop " + (r.k + 1) + " is going round (" + bars + (bars === 1 ? " bar" : " bars") + ") · play along or record another");
      jamSave();
    }
    jamPaintLoops(); jamClockOff();
  }
  // --- loops: playback, with each event's own sound ---
  function jamFire(ev, t) {
    JAM.replaying = true;
    try {
      if (ev.kind === "drum") playDrum(ev.id, t);
      else if (ev.kind === "pad") playPad(ev.k, t);
      else {
        const keep = { engine: state.engine, slot: state.samp.slot, chord: chordType }, delay = Math.max(0, (t - ctx.currentTime) * 1000);
        setTimeout(() => {
          JAM.replaying = true;
          try { const ks = state.stack; state.stack = ev.stk || { syn: false, lib: false, inst: false, samp: -1, f: ks ? ks.f : "" }; state.engine = ev.engine; state.samp.slot = ev.slot; let v; try { v = makeNote(ev.midi); } finally { state.stack = ks; } state.engine = keep.engine; state.samp.slot = keep.slot; if (v) setTimeout(() => v.stop(), Math.max(60, ev.h * jamStepDur() * 1000)); } catch (e) {} finally { JAM.replaying = false; }
        }, delay);
      }
    } finally { JAM.replaying = false; }
  }
  function jamTrackStep(s, t) {
    JAM.tracks.forEach((tr, k) => {
      if (!tr.on || !tr.len) return;
      const local = ((s - tr.start) % tr.len + tr.len) % tr.len;
      for (const ev of tr.events) if (ev.p === local) jamFire(ev, t);
      const el = jamTrackEls[k]; if (el) el.querySelector(".jam-bar").style.width = ((local + 1) / tr.len * 100) + "%";
    });
    if (JAM.rec && !JAM.rec.armed) { const el = jamTrackEls[JAM.rec.k]; if (el) el.querySelector(".jam-bar").style.width = Math.min(100, (s - JAM.rec.start + 1) / (MAX_BARS * BAR) * 100) + "%"; }
  }
  function jamClear(k, quiet) { if (JAM.rec && JAM.rec.k === k) JAM.rec = null; const t = JAM.tracks[k]; t.events = []; t.len = 0; t.on = false; t.start = 0; jamSave(); if (!quiet) { jamPaintLoops(); jamClockOff(); } }
  function jamTap(k) { start(); if (JAM.rec && JAM.rec.k === k) { jamRecStop(); return; } const t = JAM.tracks[k]; if (!t.len) { jamRecStart(k); return; } t.on = !t.on; if (t.on) jamClockOn(); else jamClockOff(); jamPaintLoops(); }
  function jamLoopsOff() { if (JAM.rec) jamRecStop(); JAM.tracks.forEach(t => { t.on = false; }); jamPaintLoops(); jamClockOff(); }
  // --- the band ---
  function jamBandStep(s, t) {
    const st = JAM_STYLES[JAM.band.style], b = JAM.band, bi = jamBeatIdx(), rows = buildBeat(bi), n = rows[DRUMS[0][0]].length, swing = BEATS[bi][3], dur = jamStepDur();
    const ds = s % n, dt = ds % 2 === 1 ? t + swing * dur * 0.5 : t;
    if (!JAM.drumBus || JAM.drumBusFor !== fx.drumBus) { JAM.drumBus = ctx.createGain(); JAM.drumBus.gain.value = b.drumLvl; JAM.drumBus.__soloGroup = "band"; JAM.drumBus.connect(fx.drumBus); JAM.drumBusFor = fx.drumBus; }
    const keepBus = fx.drumBus; fx.drumBus = JAM.drumBus; JAM.replaying = true;
    try { for (const [id] of DRUMS) if (rows[id] && rows[id][ds]) playDrum(id, dt); } finally { fx.drumBus = keepBus; JAM.replaying = false; }
    const bs = s % 16;
    for (const [step, semis, len] of st.bass) if (step === bs) {
      let semi = semis; if ((b.chord.q === "min" || b.chord.q === "min7" || b.chord.q === "dim") && (semi % 12 === 4)) semi -= 1;   // thirds follow the chord
      const midi = 36 + b.chord.root + semi, id = (typeof NEW_ENGINES !== "undefined" && NEW_ENGINES[b.bass]) || ENGINES[b.bass] ? b.bass : "analog";
      JAM.replaying = true;
      try { const v = makeVoice(midi, id, b.bassLvl * 1.1, t); if (v) v.stop(t + Math.max(0.08, len * dur * 0.92)); } catch (e) {} finally { JAM.replaying = false; }
    }
  }
  function jamBandOn(on) { JAM.band.on = on; if (on) { jamClockOn(); noteMsg("Band on: " + JAM_STYLES[JAM.band.style].name + " · hold a chord on the keys and the bass follows it"); } else { jamClockOff(); } jamPaintBand(); }
  // --- the strip ---
  const jamRow = document.getElementById("jamRow"), jamTrackEls = [];
  const JAM_NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  function jamPaintLoops() {
    JAM.tracks.forEach((t, k) => {
      const el = jamTrackEls[k], rec = JAM.rec && JAM.rec.k === k;
      el.className = "jam-trk" + (t.len ? " has" : "") + (t.on && t.len ? " on" : "") + (rec ? (JAM.rec.armed ? " armed" : " rec") : "");
      el.querySelector("b").textContent = rec ? (JAM.rec.armed ? "Ready…" : "■ Stop") : !t.len ? "● Rec" : t.on ? "♫ " + (t.len / BAR) + (t.len === BAR ? " bar" : " bars") : "▶ Play";
      el.querySelector(".jam-x").hidden = !t.len || !!rec;
      if (!t.on && !rec) el.querySelector(".jam-bar").style.width = "0%";
    });
  }
  function jamPaintBand() {
    const b = JAM.band, q = { maj: "", min: "m", "7": "7", min7: "m7", sus4: "sus4", dim: "dim", "5": "5" }[b.chord.q] || "";
    document.getElementById("jamBandOn").setAttribute("aria-pressed", String(b.on));
    document.getElementById("jamChord").textContent = JAM_NOTES[b.chord.root % 12] + q;
    document.getElementById("jamStyle").value = b.style; document.getElementById("jamBass").value = b.bass;
    document.getElementById("jamBassLvl").value = b.bassLvl; document.getElementById("jamDrumLvl").value = b.drumLvl;
    document.getElementById("jamTempo").textContent = Math.round(jamBpm()) + " bpm" + (JAM.clock && jamBpm() !== state.seq.bpm ? " (DJ)" : "");
  }
  {
    const ls = document.getElementById("jamLoops");
    for (let k = 0; k < 4; k++) {
      const el = document.createElement("div"); el.className = "jam-trk"; el.innerHTML = '<button class="btn jam-main"><span>' + (k + 1) + '</span><b>● Rec</b><i class="jam-bar"></i></button><button class="btn jam-x" aria-label="Clear loop ' + (k + 1) + '">✕</button>';
      el.querySelector(".jam-main").addEventListener("click", () => jamTap(k));
      el.querySelector(".jam-x").addEventListener("click", () => { jamClear(k); noteMsg("Loop " + (k + 1) + " is empty again"); });
      ls.appendChild(el); jamTrackEls.push(el);
    }
    document.getElementById("jamLoopsOff").addEventListener("click", jamLoopsOff);
    const sel = document.getElementById("jamStyle"); for (const id in JAM_STYLES) { const o = document.createElement("option"); o.value = id; o.textContent = JAM_STYLES[id].name; sel.appendChild(o); }
    const bs = document.getElementById("jamBass"); const engs = Object.assign({}, typeof NEW_ENGINES !== "undefined" ? NEW_ENGINES : {}, ENGINES);
    for (const id of ["mono", "sync", "analog", "pluck", "saw", "fm", "hoover"]) if (engs[id]) { const o = document.createElement("option"); o.value = id; o.textContent = engs[id].short || id; bs.appendChild(o); }
    if (!engs[JAM.band.bass]) JAM.band.bass = bs.value || "analog";
    sel.addEventListener("change", () => { JAM.band.style = sel.value; jamSave(); jamPaintBand(); });
    bs.addEventListener("change", () => { JAM.band.bass = bs.value; jamSave(); });
    document.getElementById("jamBassLvl").addEventListener("input", e => { JAM.band.bassLvl = +e.target.value; jamSave(); });
    document.getElementById("jamDrumLvl").addEventListener("input", e => { JAM.band.drumLvl = +e.target.value; if (JAM.drumBus) JAM.drumBus.gain.setTargetAtTime(JAM.band.drumLvl, ctx.currentTime, 0.02); jamSave(); });
    document.getElementById("jamBandOn").addEventListener("click", () => { start(); jamBandOn(!JAM.band.on); });
    // what you play is heard by the band (the chord) and by a recording loop
    const n0 = noteOn, f0 = noteOff, h0 = toggleHeld, pd0 = playDrum, pp0 = playPad;
    noteOn = function (m) { const r = n0(m); if (JAM.rec && !JAM.rec.armed && !JAM.replaying && voices.has(m)) { const v = voices.get(m); voices.set(m, jamRecord("note", { midi: m, engine: state.engine, slot: state.samp.slot, stk: state.stack ? JSON.parse(JSON.stringify(state.stack)) : null }, v)); } jamNoteChange(); return r; };
    noteOff = function (m) { const r = f0(m); jamNoteChange(); return r; };
    toggleHeld = function (m) { const r = h0(m); jamNoteChange(); return r; };
    playDrum = function (id, t) { if (!JAM.replaying && JAM.rec && ctx && (t == null || t <= ctx.currentTime + 0.03)) jamRecord("drum", { id }); return pd0(id, t); };
    playPad = function (k, t) { if (!JAM.replaying && JAM.rec && ctx && (t == null || t <= ctx.currentTime + 0.03)) jamRecord("pad", { k }); return pp0(k, t); };
    document.getElementById("stopAll").addEventListener("click", () => { jamLoopsOff(); if (JAM.band.on) jamBandOn(false); });
    // the panel button
    const pJam = document.getElementById("pJam"), sp1 = setPanel;
    setPanel = function (which) { if (which === "jam") { sp1("hide"); state.panel = "jam"; } else sp1(which); jamRow.hidden = which !== "jam"; pJam.setAttribute("aria-pressed", String(which === "jam")); document.getElementById("pHide").setAttribute("aria-pressed", String(which === "hide")); if (which === "jam") { jamPaintLoops(); jamPaintBand(); } try { localStorage.setItem("nightbloom-jam-open", which === "jam" ? "1" : "0"); } catch (e) {} };
    pJam.addEventListener("click", () => setPanel("jam"));
    try { if (localStorage.getItem("nightbloom-jam-open") === "1") setPanel("jam"); } catch (e) {}
    setInterval(() => { if (!jamRow.hidden) jamPaintBand(); }, 1000);
    // the DJ's key gives the band its first chord
    try { const L = LEAD(); if (L && L.key) { const m = /^(\S+) (major|minor)/.exec(L.key); if (m) { const r = JAM_NOTES.indexOf(m[1]); if (r >= 0) JAM.band.chord = { root: r, q: m[2] === "minor" ? "min" : "maj" }; } } } catch (e) {}
    jamPaintLoops(); jamPaintBand();
  }

  // ---------- Sample from an input: a USB audio interface, the tablet's mic, anything plugged in ----------
  // Pick the input, watch the level, record up to 60 seconds straight into the current sampler slot,
  // with the option of chopping it onto the pads as it lands. The K.O. II (or any box) goes in here.
  const LINE = { stream: null, node: null, src: null, an: null, L: [], R: [], len: 0, rec: false, t0: 0, timer: 0, raf: 0, devId: "" };
  const lineEl = document.getElementById("lineSheet"), lineDev = document.getElementById("lineDev"), lineStatus = document.getElementById("lineStatus"), lineMeter = document.getElementById("lineMeter"), lineRec = document.getElementById("lineRec");
  async function lineDevices() {
    lineDev.innerHTML = "";
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
      devs.forEach((d, i) => { const o = document.createElement("option"); o.value = d.deviceId; o.textContent = d.label || ("Input " + (i + 1)); lineDev.appendChild(o); });
      if (LINE.devId && devs.some(d => d.deviceId === LINE.devId)) lineDev.value = LINE.devId;
      else { const ko = devs.find(d => /k\.?\s?o\.?\s?ii|ep-?133/i.test(d.label || "")); if (ko) lineDev.value = ko.deviceId; }
      if (!devs.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "No inputs found"; lineDev.appendChild(o); }
    } catch (e) { const o = document.createElement("option"); o.value = ""; o.textContent = "Inputs unavailable"; lineDev.appendChild(o); }
  }
  async function lineOpen() {
    start(); lineStop(false);
    const id = lineDev.value || LINE.devId;
    const cons = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } };
    if (id) cons.audio.deviceId = { exact: id };
    try { LINE.stream = await navigator.mediaDevices.getUserMedia(cons); }
    catch (e) { lineStatus.textContent = "The input isn't allowed here (" + (e && e.name || "error") + "). Allow the microphone / audio input for this site and try again."; return false; }
    LINE.devId = id; try { localStorage.setItem("nightbloom-linein", id); } catch (e) {}
    LINE.src = ctx.createMediaStreamSource(LINE.stream); LINE.an = ctx.createAnalyser(); LINE.an.fftSize = 1024; LINE.src.connect(LINE.an);
    await lineDevices();
    lineStatus.textContent = "Listening · play something and watch the meter, then Record";
    lineMeterLoop();
    return true;
  }
  function lineMeterLoop() {
    cancelAnimationFrame(LINE.raf);
    const c = lineMeter.getContext("2d"), buf = new Float32Array(1024);
    const draw = () => {
      if (!LINE.an) return;
      LINE.an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v));
      const w = lineMeter.width = lineMeter.clientWidth * (window.devicePixelRatio || 1), h = lineMeter.height = lineMeter.clientHeight * (window.devicePixelRatio || 1);
      c.clearRect(0, 0, w, h); const db = 20 * Math.log10(pk + 1e-6), x = Math.max(0, Math.min(1, (db + 60) / 60)) * w;
      c.fillStyle = pk > 0.95 ? "#ff5c7a" : pk > 0.6 ? "#ffb65c" : "#7fd6c2"; c.fillRect(0, 0, x, h);
      c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(w * (54 / 60), 0, 2, h);
      LINE.raf = requestAnimationFrame(draw);
    };
    draw();
  }
  function lineStart() {
    if (!LINE.src || LINE.rec) return;
    LINE.L = []; LINE.R = []; LINE.len = 0; LINE.rec = true; LINE.t0 = ctx.currentTime;
    const node = ctx.createScriptProcessor(4096, 2, 1), mute = ctx.createGain(); mute.gain.value = 0;
    node.onaudioprocess = ev => { if (!LINE.rec) return; const ib = ev.inputBuffer; LINE.L.push(new Float32Array(ib.getChannelData(0))); LINE.R.push(new Float32Array(ib.numberOfChannels > 1 ? ib.getChannelData(1) : ib.getChannelData(0))); LINE.len += ib.length; if (LINE.len >= ctx.sampleRate * 60) lineStop(true); };
    LINE.src.connect(node); node.connect(mute).connect(ctx.destination); LINE.node = node;
    lineRec.textContent = "■ Stop"; lineRec.setAttribute("aria-pressed", "true");
    LINE.timer = setInterval(() => { lineStatus.textContent = "Recording… " + (ctx.currentTime - LINE.t0).toFixed(1) + " s (60 s max)"; }, 200);
  }
  function lineStop(keep) {
    clearInterval(LINE.timer);
    if (LINE.node) { try { LINE.src.disconnect(LINE.node); LINE.node.disconnect(); } catch (e) {} LINE.node = null; }
    const was = LINE.rec; LINE.rec = false; lineRec.textContent = "● Record"; lineRec.setAttribute("aria-pressed", "false");
    if (!was || !keep) return;
    const n = LINE.len, L = new Float32Array(n), R = new Float32Array(n); let o = 0; LINE.L.forEach((c, i) => { L.set(c, o); R.set(LINE.R[i], o); o += c.length; }); LINE.L = []; LINE.R = [];
    let a = 0, b = n; const th = 0.006;
    if (document.getElementById("lineTrim").checked) { while (a < b && Math.abs(L[a]) < th && Math.abs(R[a]) < th) a++; while (b > a && Math.abs(L[b - 1]) < th && Math.abs(R[b - 1]) < th) b--; a = Math.max(0, a - 200); b = Math.min(n, b + 2000); }
    if (b - a < ctx.sampleRate * 0.1) { lineStatus.textContent = "Nothing came in: check the input and its level, then try again"; return; }
    const chans = [L.subarray(a, b), R.subarray(a, b)], rate = ctx.sampleRate, buf = makeBuffer(chans, rate), i = state.samp.slot;
    const nm = (lineDev.selectedOptions[0] ? lineDev.selectedOptions[0].textContent.split(" (")[0].slice(0, 16) : "Input") + " " + new Date().toTimeString().slice(0, 5);
    setSample(i, buf, nm); storeSample(i, nm, bufferToWav(buf)); if (state.samp.slots[i].mode === "grain") state.samp.slots[i].mode = "play"; renderEngine(); save();
    let msg = "S" + (i + 1) + " = " + nm + " (" + buf.duration.toFixed(1) + " s)";
    if (document.getElementById("lineChop").checked) {
      const nPads = 8, cuts = detectSlices(chans, rate, nPads, 0.6); let made = 0;
      for (let k = 0; k + 1 < cuts.length && made < nPads; k++) {
        const fa = Math.round(cuts[k] * rate), fb = Math.round(cuts[k + 1] * rate); if (fb - fa < 64) continue;
        const pcs = chans.map(c => { const x = c.slice(fa, fb), f = Math.min(128, x.length >> 2); for (let q = 0; q < f; q++) x[x.length - 1 - q] *= q / f; return x; });
        const pb = makeBuffer(pcs, rate), pn = nm + " " + (made + 1); setPad(made, pb, pn); storePad(made, pn, pb); made++;
      }
      msg += " · chopped into " + made + " pads";
    }
    lineStatus.textContent = msg + " · record again or Done"; noteMsg(msg);
  }
  function lineClose() { lineStop(false); cancelAnimationFrame(LINE.raf); if (LINE.stream) { LINE.stream.getTracks().forEach(t => t.stop()); LINE.stream = null; } LINE.src = null; LINE.an = null; lineEl.hidden = true; }
  try { LINE.devId = localStorage.getItem("nightbloom-linein") || ""; } catch (e) {}
  document.getElementById("lineBtn").addEventListener("click", async () => { lineEl.hidden = false; lineStatus.textContent = "Opening the input…"; lineRec.textContent = "● Record"; await lineOpen(); });
  lineDev.addEventListener("change", () => lineOpen());
  lineRec.addEventListener("click", () => { if (!LINE.src) { lineOpen(); return; } if (LINE.rec) lineStop(true); else lineStart(); });
  document.getElementById("lineDone").addEventListener("click", lineClose);
  document.getElementById("lineRefresh").addEventListener("click", () => lineOpen());



  // ---------- progress strip: anything that analyses, downloads or encodes shows a bar ----------
  const JOBS = { el: null, map: new Map() };
  function jobSet(id, label, p, onCancel) {
    if (!JOBS.el) { JOBS.el = document.createElement("div"); JOBS.el.className = "jobs"; JOBS.el.setAttribute("aria-live", "polite"); document.body.appendChild(JOBS.el); }
    let j = JOBS.map.get(id);
    if (!j) { j = document.createElement("div"); j.className = "job"; j.innerHTML = '<div class="jl"><span></span><small></small><button class="jx" aria-label="Cancel" hidden>✕</button></div><div class="jb"><i></i></div>'; JOBS.el.appendChild(j); JOBS.map.set(id, j); }
    if (onCancel) { const x = j.querySelector(".jx"); x.hidden = false; x.onclick = () => { x.disabled = true; j.querySelector(".jl span").textContent = "Cancelling…"; try { onCancel(); } catch (e) {} }; }
    if (label != null) j.querySelector(".jl span").textContent = label;
    const wait = p == null || !(p >= 0);
    j.classList.toggle("wait", wait);
    j.querySelector(".jl small").textContent = wait ? "" : Math.round(Math.min(1, p) * 100) + "%";
    if (!wait) j.querySelector(".jb i").style.width = Math.round(Math.min(1, p) * 100) + "%";
  }
  function jobEnd(id) { const j = JOBS.map.get(id); if (j) { j.remove(); JOBS.map.delete(id); } }
  // every job runs through here: label, a progress callback the task calls with 0..1, and cleanup whatever happens
  // fn(report, cancelled) — report(0..1) moves the bar; cancelled() turns true when the ✕ is tapped (only shown when `cancellable`)
  async function jobRun(id, label, fn, cancellable) {
    let off = false; const cancelled = () => off;
    jobSet(id, label, null, cancellable ? () => { off = true; } : null);
    try { return await fn(p => { if (!off) jobSet(id, null, p); }, cancelled); } finally { jobEnd(id); }
  }
  {
    // beat and key analysis
    const an0 = djAnalyseAsync;
    djAnalyseAsync = buf => DJ_AN_CACHE.has(buf) ? an0(buf) : jobRun("an", "Finding the beat and key…", (rep, off) => new Promise((res, rej) => {
      const poll = setInterval(() => { if (off()) { clearInterval(poll); if (djAnWorker) { try { djAnWorker.terminate(); } catch (e) {} djAnWorker = null; djAnWait.clear(); } rej(new Error("cancelled")); } }, 120);
      an0(buf).then(v => { clearInterval(poll); res(v); }, e => { clearInterval(poll); rej(e); });
    }), true);
    // opening a song file
    const df0 = djDecodeFile;
    djDecodeFile = file => jobRun("open", "Opening " + file.name + "…", () => df0(file));
    // MP3 export
    const m0 = mp3Encode;
    mp3Encode = (L, R, rate, kbps, onProgress) => jobRun("mp3", "Making the MP3…", rep => m0(L, R, rate, kbps, p => { rep(p); if (onProgress) onProgress(p); }));
  }
  // a shimmer on a song that's being analysed
  {
    const pc0 = djPaintCrate;
    djPaintCrate = function () {
      pc0();
      document.querySelectorAll(".dj-song").forEach((row, i) => { const it = DJ.crate[i], t = row.querySelector(".t"); if (!t) return; let b = t.querySelector(".busy"); if (it && it.busy) { if (!b) { b = document.createElement("span"); b.className = "busy"; t.appendChild(b); } } else if (b) b.remove(); });
    };
  }
  // long-press anywhere (keys, pads, buttons) must never open the browser's page menu; text fields keep theirs
  document.addEventListener("contextmenu", e => { const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return; e.preventDefault(); }, { capture: true });

  // ---------- sampler tools on the panel: Tempo / Match / Fit / Length / Pitch, and Loop ----------
  // Each slot keeps its original audio (sampOrig); the slot plays a copy rendered at its Length and Pitch.
  // Rendering runs in a worker, so it works while everything else keeps playing.
  {
    const STR_SRC = `
function stretch(L, R, s, report) {
  const N = 2048, H = 512, OV = 512, SR = 360, len = L.length, outLen = Math.max(1, Math.round(len * s));
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const oL = new Float32Array(outLen + N), oR = new Float32Array(outLen + N), nm = new Float32Array(outLen + N);
  let pos = 0, prev = -1, o = 0, step = 0;
  while (o < outLen) {
    let src = Math.round(pos);
    if (prev >= 0) {
      const ref = prev + H; let best = -1e30, bd = 0;
      if (ref + OV < len) {
        const scan = (st, a, b) => { for (let d = a; d <= b; d += st) { const c = Math.round(pos) + d; if (c < 0 || c + OV >= len) continue; let x = 0, e = 0; for (let i = 0; i < OV; i += 2) { const p = L[ref + i] + R[ref + i], q = L[c + i] + R[c + i]; x += p * q; e += q * q; } const v = e > 1e-12 ? x / Math.sqrt(e) : -1e30; if (v > best) { best = v; bd = d; } } };
        scan(3, -SR, SR); const d0 = bd; scan(1, d0 - 2, d0 + 2);
      }
      src = Math.round(pos) + bd;
    }
    src = Math.max(0, Math.min(len - 1, src));
    for (let i = 0; i < N; i++) { const k = src + i; if (k >= len) break; const w = win[i]; oL[o + i] += L[k] * w; oR[o + i] += R[k] * w; nm[o + i] += w; }
    prev = src; pos += H / s; o += H; if (pos > len - 1) pos = len - 1;
    if ((++step & 255) === 0) report(o / outLen);
  }
  const L2 = new Float32Array(outLen), R2 = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) { const g = nm[i] > 1e-3 ? 1 / Math.max(nm[i], 0.15) : 1; L2[i] = oL[i] * g; R2[i] = oR[i] * g; }
  return [L2, R2];
}
onmessage = e => { const { L, R, s } = e.data; const out = stretch(L, R, s, p => postMessage({ p })); postMessage({ out }, [out[0].buffer, out[1].buffer]); };`;
    function stretchRun(chans, s, label) {
      return jobRun("stretch", label, (rep, off) => new Promise((res, rej) => {
        let w;
        try { const url = URL.createObjectURL(new Blob([STR_SRC], { type: "text/javascript" })); w = new Worker(url); setTimeout(() => URL.revokeObjectURL(url), 5000); }
        catch (e) { rej(e); return; }
        const poll = setInterval(() => { if (off()) { clearInterval(poll); w.terminate(); res(null); } }, 120);
        w.onmessage = e => { if (e.data.out) { clearInterval(poll); w.terminate(); res(e.data.out); } else rep(e.data.p); };
        w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); clearInterval(poll); w.terminate(); rej(new Error("stretch failed")); };
        const L = chans[0].slice(), R = (chans[1] || chans[0]).slice();
        w.postMessage({ L, R, s }, [L.buffer, R.buffer]);
      }), true);
    }
    const sampOrig = Array(NSLOTS).fill(null);
    const fitOf = i => { const sl = state.samp.slots[i]; if (!sl.fit) sl.fit = { s: 1, st: 0, bpm: 0 }; return sl.fit; };
    const isPlain = f => Math.abs(f.s - 1) < 0.002 && !f.st;
    let internal = false;
    // every way audio gets into a slot comes through here: new audio is the slot's new original
    const ss0 = setSample;
    setSample = function (i, buf, name, opts) {
      if (internal) return ss0(i, buf, name);
      sampOrig[i] = buf;
      if (opts && opts.placeholder) { ss0(i, buf, name); return; }   // the startup chime: the slot's saved sound and settings load next
      const keep = opts && opts.keepFit;
      if (!keep) state.samp.slots[i].fit = { s: 1, st: 0, bpm: 0 };
      ss0(i, buf, name);
      if (buf && keep && !isPlain(fitOf(i))) render(i);
      if (buf && !fitOf(i).bpm) findBpm(i);
      if (i === state.samp.slot) paint();
    };
    const el = document.getElementById("sfit"), lenS = document.getElementById("sfLen"), lenV = document.getElementById("sfLenV"), pS = document.getElementById("sfPitch"), pV = document.getElementById("sfPitchV");
    const bpmEl = document.getElementById("sfBpm"), matchBtn = document.getElementById("sfMatch");
    const appBpm = () => state.seq.bpm || 120;
    const sliderFor = f => Math.max(-200, Math.min(200, Math.round(Math.log2(f) * 100)));
    const seqs = Array(NSLOTS).fill(0), finding = new Set();
    function paint() {
      const i = state.samp.slot, sl = state.samp.slots[i], has = !!sampOrig[i];
      el.hidden = state.engine !== "samp";
      if (el.hidden) return;
      el.querySelectorAll("button, input").forEach(x => { x.disabled = !has; });
      const f = fitOf(i);
      if (document.activeElement !== lenS) lenS.value = sliderFor(f.s);
      if (document.activeElement !== pS) pS.value = f.st;
      lenV.textContent = f.s.toFixed(2) + "×"; pV.textContent = (f.st > 0 ? "+" : "") + f.st + " st";
      bpmEl.textContent = !has ? "—" : finding.has(i) ? "finding…" : f.bpm ? (f.bpm / f.s).toFixed(1) + " BPM" + (Math.abs(f.s - 1) > 0.004 ? " (was " + f.bpm.toFixed(1) + ")" : "") : "no steady beat";
      matchBtn.textContent = "Match " + appBpm(); matchBtn.disabled = !has || !f.bpm;
    }
    async function findBpm(i) {
      const buf = sampOrig[i]; if (!buf || finding.has(i)) return;
      if (buf.duration < 4) { fitOf(i).bpm = 0; paint(); return; }
      finding.add(i); paint();
      try { const an = await djAnalyseAsync(buf); let b = an && an.bpm || 0; if (b && b < 70) b *= 2; else if (b > 180) b /= 2; if (sampOrig[i] === buf) { fitOf(i).bpm = b; save(); } }
      catch (e) {}
      finding.delete(i); paint();
    }
    // play the original at this slot's Length and Pitch
    async function render(i) {
      const orig = sampOrig[i]; if (!orig) return;
      const f = fitOf(i), id = ++seqs[i], name = state.samp.slots[i].name;
      if (isPlain(f)) { internal = true; try { setSample(i, orig, name); } finally { internal = false; } paint(); return; }
      const r = Math.pow(2, f.st / 12), chans = [orig.getChannelData(0), orig.numberOfChannels > 1 ? orig.getChannelData(1) : orig.getChannelData(0)];
      el.classList.add("busy");
      try {
        let out = await stretchRun(chans, f.s * r, "S" + (i + 1) + ": " + (f.st ? "changing length and pitch…" : "changing the length…"));
        if (!out || id !== seqs[i] || sampOrig[i] !== orig) return;
        if (f.st) { out = await aiResample(out, Math.round(orig.sampleRate * r), orig.sampleRate); if (id !== seqs[i] || sampOrig[i] !== orig) return; }
        const buf = makeBuffer(orig.numberOfChannels > 1 ? out : [out[0]], orig.sampleRate);
        internal = true; try { setSample(i, buf, name); } finally { internal = false; }
        if (i === state.samp.slot) noteMsg("S" + (i + 1) + ": " + buf.duration.toFixed(2) + " s = " + (buf.duration / (4 * 60 / appBpm())).toFixed(2) + " bars at " + appBpm() + " BPM");
      } catch (e) { noteMsg("Couldn't change the length here (" + (e && e.message || e) + ")", true); }
      finally { if (id === seqs[i]) el.classList.remove("busy"); paint(); }
    }
    const set = (s, st) => { const i = state.samp.slot; if (!sampOrig[i]) return; const f = fitOf(i); if (s != null) f.s = Math.max(0.25, Math.min(4, s)); if (st != null) f.st = st; save(); paint(); render(i); };
    lenS.addEventListener("input", () => { lenV.textContent = Math.pow(2, +lenS.value / 100).toFixed(2) + "×"; });
    pS.addEventListener("input", () => { pV.textContent = (+pS.value > 0 ? "+" : "") + pS.value + " st"; });
    lenS.addEventListener("change", () => { set(Math.pow(2, +lenS.value / 100), null); lenS.blur(); });
    pS.addEventListener("change", () => { set(null, +pS.value); pS.blur(); });
    document.getElementById("sfReset").addEventListener("click", () => set(1, 0));
    document.getElementById("sfHalf").addEventListener("click", () => { const f = fitOf(state.samp.slot); if (f.bpm) { f.bpm /= 2; save(); paint(); } });
    document.getElementById("sfDbl").addEventListener("click", () => { const f = fitOf(state.samp.slot); if (f.bpm) { f.bpm *= 2; save(); paint(); } });
    matchBtn.addEventListener("click", () => { const f = fitOf(state.samp.slot); if (f.bpm) set(f.bpm / appBpm(), null); });
    el.querySelectorAll("[data-sfit]").forEach(b => b.addEventListener("click", () => {
      const i = state.samp.slot, o = sampOrig[i]; if (!o) return;
      const want = +b.dataset.sfit * 4 * 60 / appBpm(), f = want / o.duration;
      if (f < 0.25 || f > 4) { noteMsg("That would need " + f.toFixed(2) + "× (the range is ¼× to 4×) · try " + (f < 0.25 ? "more" : "fewer") + " bars", true); return; }
      set(f, null);
    }));
    // what's already in the slots counts as their originals
    for (let i = 0; i < NSLOTS; i++) if (sampBuf[i]) sampOrig[i] = sampBuf[i];
    // the editor works on the slot's original; saving makes the edit the new original
    const oe0 = openEditor; openEditor = function (target) { if (target && state.engine === "samp" && /^S\d/.test(target.label || "")) { const i = +target.label.slice(1, 2) - 1; if (sampOrig[i]) target.buf = sampOrig[i]; } return oe0(target); };

    // Loop for held notes (play mode)
    const loopBtn = document.getElementById("mLoop");
    const paintLoop = () => { const sl = state.samp.slots[state.samp.slot]; loopBtn.setAttribute("aria-pressed", String(!!(sl && sl.loop))); loopBtn.hidden = !sl || sl.mode !== "play"; };
    loopBtn.addEventListener("click", () => { const sl = state.samp.slots[state.samp.slot]; if (!sl) return; sl.loop = !sl.loop; save(); paintLoop(); });
    const re1 = renderEngine; renderEngine = function () { re1(); paintLoop(); paint(); };
    { const sb0 = setBpm; setBpm = function (b) { sb0(b); paint(); }; }
    paintLoop(); paint();
  }
  // ---------- DJ: choose the deck the next song comes in on ----------
  {
    DJ.nextDeck = "auto";
    try { const o = JSON.parse(localStorage.getItem("nightbloom-dj2") || "{}"); if (o.nextDeck === 0 || o.nextDeck === 1) DJ.nextDeck = o.nextDeck; } catch (e) {}
    const ft0 = djFromTo;
    djFromTo = function () {
      const d = DJ.nextDeck; if (d !== 0 && d !== 1) return ft0();
      const to = DJ.decks[d], other = DJ.decks[1 - d];
      if (!to.playing && !other.playing) return { from: to, to: other, chosen: true };   // nothing playing: the next song simply starts on the chosen deck
      if (to.playing && !other.playing) return ft0();                                    // the chosen deck is the one playing: it can't be replaced mid-song
      return { from: other, to, chosen: true };                                          // the chosen deck takes the next song; the other one mixes out
    };
    const seg = document.getElementById("djNextDeck"), hint = document.getElementById("djNextHint");
    function paintNext() {
      seg.querySelectorAll("[data-nd]").forEach(b => b.setAttribute("aria-pressed", String(String(DJ.nextDeck) === b.dataset.nd)));
      const d = DJ.nextDeck; let h = "";
      if (d === 0 || d === 1) { const to = DJ.decks[d], other = DJ.decks[1 - d]; if (to.playing && !other.playing) h = "AB"[d] + " is the one playing, so this time it goes on " + "AB"[1 - d]; }
      hint.textContent = h;
    }
    seg.querySelectorAll("[data-nd]").forEach(b => b.addEventListener("click", () => {
      DJ.nextDeck = b.dataset.nd === "auto" ? "auto" : +b.dataset.nd;
      try { const o = JSON.parse(localStorage.getItem("nightbloom-dj2") || "{}"); o.nextDeck = DJ.nextDeck; localStorage.setItem("nightbloom-dj2", JSON.stringify(o)); } catch (e) {}
      paintNext(); djPaintAll();
      djMsg(DJ.nextDeck === "auto" ? "The next song goes on whichever deck isn't playing" : "The next song comes in on deck " + "AB"[DJ.nextDeck]);
    }));
    const pa = djPaintAll; djPaintAll = function () { pa(); paintNext(); };
    paintNext();
  }
