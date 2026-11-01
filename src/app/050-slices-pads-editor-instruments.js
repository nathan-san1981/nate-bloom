  // ======================================================================
  // Slices, pads, sample editor and loadable instruments
  // ======================================================================

  // ---------- shared helpers ----------
  const AUDIO_RE = /\.(wav|wave|mp3|m4a|aac|aiff?|flac|caf)$/i;
  const hzLabel = hz => hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : Math.round(hz) + "";
  const baseName = n => (n || "Sample").replace(AUDIO_RE, "").replace(/ \(edited\)$/, "").replace(/ \(first (60s|5 min)\)$/, "");
  function noteMsg(msg, err) {
    const after = document.getElementById("engineAfter");
    after.textContent = msg; after.classList.toggle("err", !!err);
  }
  function bufferToWav(buf) {
    const ch = Math.min(2, buf.numberOfChannels), n = buf.length, rate = buf.sampleRate;
    const ab = new ArrayBuffer(44 + n * 2 * ch), v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2 * ch, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2 * ch, true); v.setUint16(32, 2 * ch, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2 * ch, true);
    const out = new Int16Array(ab, 44), cs = [];
    for (let c = 0; c < ch; c++) cs.push(buf.getChannelData(c));
    let o = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = cs[c][i]; out[o++] = (x < -1 ? -1 : x > 1 ? 1 : x) * 0x7fff; }
    return ab;
  }
  function makeBuffer(chans, rate) {
    const n = Math.max(1, chans[0].length), b = ctx.createBuffer(chans.length, n, rate);
    chans.forEach((c, i) => b.copyToChannel(c.length ? c : new Float32Array(1), i));
    return b;
  }
  function chansOf(buf) {
    const out = [];
    for (let c = 0; c < buf.numberOfChannels; c++) out.push(buf.getChannelData(c).slice());
    return out;
  }

  // ---------- slicing (used by Slice mode and Chop → Pads) ----------
  // sens 0 = an even grid; higher = cut on hits (rises in loudness), up to count slices
  function detectSlices(chans, rate, count, sens) {
    const len = chans[0].length, dur = len / rate;
    const even = () => Array.from({ length: count + 1 }, (_, k) => (k / count) * dur);
    if (sens <= 0.01 || len < rate * 0.05) return even();
    const hop = 512, frames = Math.floor(len / hop), rms = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let s = 0;
      for (let i = f * hop, e = i + hop; i < e; i += 2) { let x = 0; for (const c of chans) x += c[i]; s += x * x; }
      rms[f] = Math.sqrt(s / (hop / 2));
    }
    const nov = new Float32Array(frames);
    let mx = 0;
    for (let f = 1; f < frames; f++) { nov[f] = Math.max(0, rms[f] - rms[f - 1]); if (nov[f] > mx) mx = nov[f]; }
    if (mx <= 0) return even();
    const thr = mx * (0.02 + 0.6 * (1 - sens));
    const cands = [];
    for (let f = 2; f < frames - 1; f++) if (nov[f] >= thr && nov[f] >= nov[f - 1] && nov[f] >= nov[f + 1]) cands.push(f);
    cands.sort((x, y) => nov[y] - nov[x]);
    const minGap = Math.max(3, Math.floor(frames / (count * 3)));
    const picked = [];
    for (const f of cands) {
      if (picked.length >= count - 1) break;
      if (f < minGap) continue;
      if (picked.every(p => Math.abs(p - f) >= minGap)) picked.push(f);
    }
    picked.sort((x, y) => x - y);
    return [0, ...picked.map(f => Math.max(0, f * hop / rate - 0.004)), dur];
  }
  function getSlices(i) {
    const buf = sampBuf[i], P = state.samp.slots[i].p;
    const count = SLICE_COUNTS[Math.round(P.slices * (SLICE_COUNTS.length - 1))];
    const sens = Math.round(P.sens * 20) / 20, key = count + "|" + sens;
    const c = getSlices.cache || (getSlices.cache = []);
    if (c[i] && c[i].buf === buf && c[i].key === key) return c[i].s;
    const chans = [];
    for (let k = 0; k < buf.numberOfChannels; k++) chans.push(buf.getChannelData(k));
    const s = detectSlices(chans, buf.sampleRate, count, sens);
    c[i] = { buf, key, s };
    return s;
  }
  function drawSliceMarks(i, w, h) {
    const buf = sampBuf[i]; if (!buf) return;
    const s = getSlices(i), dur = buf.duration;
    sctx.fillStyle = amber;
    for (let k = 1; k < s.length - 1; k++) sctx.fillRect(s[k] / dur * w - 0.5, 0, 1.5, h);
    sctx.font = "9px IBM Plex Mono, monospace"; sctx.textAlign = "left"; sctx.textBaseline = "top"; sctx.fillStyle = "#ece7f7";
    for (let k = 0; k < s.length - 1; k++) {
      if ((s[k + 1] - s[k]) / dur * w > 12) sctx.fillText(String(k + 1), s[k] / dur * w + 2, 2);
    }
  }

  // ---------- Pads ----------
  function setPad(k, buf, name) {
    padBuf[k] = buf; padPeaks[k] = buf ? computePeaks(buf) : null;
    state.pads.names[k] = buf ? (name || "") : "";
    if (state.engine === "pads") { renderPadsPanel(); buildKitPads(); }
    if (seqBuilt) buildSeq();
  }
  async function storePad(k, name, buf, raw) {
    try {
      const db = await idb(), st = db.transaction("samples", "readwrite").objectStore("samples");
      if (buf) st.put({ name, data: raw || bufferToWav(buf) }, "pad" + k); else st.delete("pad" + k);
    } catch (e) {}
  }
  function playPad(k, t) {
    const buf = padBuf[k]; if (!buf || !ctx) return;
    const P = state.pads.p[k], dur = buf.duration;
    t = t ?? ctx.currentTime;
    const prev = padPlaying[k];
    if (prev) { try { prev.g.gain.cancelScheduledValues(t); prev.g.gain.setTargetAtTime(0, t, 0.006); prev.src.stop(t + 0.05); } catch (e) {} }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const rate = Math.pow(2, Math.round((P.pitch - 0.5) * 24) / 12);
    src.playbackRate.value = rate;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = expMap(P.tone, 250, 20000);
    const g = ctx.createGain();
    const off = P.start * dur * 0.98, len = Math.max(0.01, P.length * (dur - off)), real = len / rate;
    const lv = P.level * 1.3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 0.002);
    g.gain.setValueAtTime(lv, t + Math.max(0.003, real - 0.008));
    g.gain.linearRampToValueAtTime(0, t + real);
    src.connect(tone).connect(g).connect(fx.input);
    src.start(t, off, len);
    padPlaying[k] = { src, g };
    src.onended = () => { if (padPlaying[k] && padPlaying[k].src === src) padPlaying[k] = null; try { g.disconnect(); } catch (e) {} };
    flashPad("k" + k, t);
  }
  function buildKitPads() {
    keysEl.innerHTML = ""; keyEls.clear(); padEls.clear();
    keysEl.classList.add("pads", "kit");
    for (let k = 0; k < NPADS; k++) {
      const el = document.createElement("div");
      el.className = "pad" + (padBuf[k] ? "" : " empty") + (k === state.pads.sel ? " sel" : "");
      el.dataset.kit = k;
      el.innerHTML = `<span>P${k + 1}</span><small></small>`;
      el.querySelector("small").textContent = padBuf[k] ? baseName(state.pads.names[k]).slice(0, 12) : "empty";
      keysEl.appendChild(el); padEls.set("k" + k, el);
    }
  }
  function kitPadDown(k) {
    if (!ctx) return;
    if (state.pads.sel !== k) {
      state.pads.sel = k;
      padEls.forEach((el, id) => el.classList.toggle("sel", id === "k" + k));
      renderPadsPanel(); save();
    }
    if (padBuf[k]) playPad(k);
  }
  const padbar = document.getElementById("padbar"), padFile = document.getElementById("padFile");
  const padFrom = document.getElementById("padFrom");
  for (let i = 0; i < NSLOTS; i++) { const o = document.createElement("option"); o.value = i; o.textContent = "S" + (i + 1); padFrom.appendChild(o); }
  function renderPadsPanel() {
    const k = state.pads.sel;
    document.getElementById("engineLabel").textContent = "Pads · P" + (k + 1);
    noteMsg(padBuf[k] ? baseName(state.pads.names[k]) : "P" + (k + 1) + " is empty · load a sample or chop one in Edit");
    engineKnobsEl.innerHTML = "";
    PAD_KNOBS.forEach(([key, label]) => makeKnob(engineKnobsEl, key, label, () => state.pads.p[state.pads.sel], () => {}));
    padFrom.value = "";
  }
  document.getElementById("padLoad").addEventListener("click", () => { start(); padFile.click(); });
  padFile.addEventListener("change", async () => {
    const list = [...(padFile.files || [])].slice(0, NPADS); padFile.value = "";
    if (!list.length) return;
    let k = state.pads.sel, ok = 0;
    for (const f of list) {
      try {
        noteMsg("Loading " + f.name + "…");
        const data = await f.arrayBuffer();
        let buf = await decode(data.slice(0)), nm = f.name, raw = data;
        if (buf.duration > PICK_OVER_SEC) {
          noteMsg("Choose the part of " + f.name + " you want…");
          const r = await chooseSection(buf, f.name);
          if (!r) continue;
          buf = r.buf; nm = r.name; raw = r.whole ? data : undefined;
        }
        buf = trimBuffer(buf);
        setPad(k, buf, nm); storePad(k, nm, buf, raw); ok++;
        k = (k + 1) % NPADS;
      } catch (e) { noteMsg("Couldn't read " + f.name + ". Try a WAV or MP3.", true); }
    }
    if (ok) renderPadsPanel();
  });
  padFrom.addEventListener("change", () => {
    if (padFrom.value === "") return;
    const i = Number(padFrom.value), k = state.pads.sel;
    if (!sampBuf[i]) { noteMsg("Slot S" + (i + 1) + " is empty.", true); padFrom.value = ""; return; }
    const nm = baseName(state.samp.slots[i].name);
    setPad(k, sampBuf[i], nm); storePad(k, nm, sampBuf[i]); renderPadsPanel();
  });
  document.getElementById("padEdit").addEventListener("click", () => {
    start();
    const k = state.pads.sel;
    if (!padBuf[k]) { noteMsg("P" + (k + 1) + " is empty. Load a sample first.", true); return; }
    openEditor({
      buf: padBuf[k], label: "P" + (k + 1), name: state.pads.names[k],
      save(buf) { const nm = baseName(state.pads.names[k]) + " (edited)"; setPad(k, buf, nm); storePad(k, nm, buf); renderPadsPanel(); },
    });
  });
  const padClear = document.getElementById("padClear");
  let padClearArm = 0;
  padClear.addEventListener("click", () => {
    const k = state.pads.sel; if (!padBuf[k]) return;
    if (!padClearArm) {
      padClear.textContent = "Clear P" + (k + 1) + "?";
      padClearArm = setTimeout(() => { padClearArm = 0; padClear.textContent = "Clear"; }, 2500);
      return;
    }
    clearTimeout(padClearArm); padClearArm = 0; padClear.textContent = "Clear";
    setPad(k, null); storePad(k, null, null); renderPadsPanel();
  });
  function drawPadWave(w, h) {
    const k = state.pads.sel, peaks = padPeaks[k], P = state.pads.p[k];
    if (!peaks) {
      sctx.fillStyle = "#8e86a6"; sctx.font = "11px IBM Plex Mono, monospace"; sctx.textAlign = "center"; sctx.textBaseline = "middle";
      sctx.fillText("P" + (k + 1) + " is empty", w / 2, h / 2);
      return;
    }
    const a = P.start * 0.98, b = a + P.length * (1 - a);
    sctx.fillStyle = "rgba(196,163,255,0.12)";
    sctx.fillRect(a * w, 0, (b - a) * w, h);
    const n = peaks.length, bw = w / n;
    for (let j = 0; j < n; j++) {
      const x = j / n;
      sctx.fillStyle = x >= a && x <= b ? lilac : "rgba(196,163,255,0.35)";
      const ph = Math.max(1, peaks[j] * h * 0.86);
      sctx.fillRect(j * bw, (h - ph) / 2, Math.max(1, bw - 0.6), ph);
    }
  }

  // ---------- Sample editor ----------
  const ed = { chans: null, rate: 44100, a: 0, b: 0, undo: [], orig: null, target: null, name: "" };
  const edEl = document.getElementById("editor"), edWave = document.getElementById("edWave"), edCtx = edWave.getContext("2d");
  const edInfo = document.getElementById("edInfo"), edPlayBtn = document.getElementById("edPlay");
  const edLen = () => ed.chans[0].length;
  const fmtS = n => (n / ed.rate).toFixed(2) + "s";
  function edSel() {
    const a = Math.min(ed.a, ed.b), b = Math.max(ed.a, ed.b);
    return b - a < 32 ? [0, edLen()] : [a, b];
  }
  function openEditor(target) {
    if (!ctx || !target.buf) return;
    ed.chans = chansOf(target.buf); ed.rate = target.buf.sampleRate; ed.orig = ed.chans.map(c => c.slice());
    ed.a = 0; ed.b = edLen(); ed.undo = []; ed.target = target; ed.name = target.name;
    document.getElementById("edTitle").textContent = "Edit · " + target.label;
    document.getElementById("edSave").textContent = "Save to " + target.label;
    document.getElementById("edToPad").textContent = "Selection → P" + (state.pads.sel + 1);
    edEl.hidden = false;
    requestAnimationFrame(edRefresh);
  }
  function closeEditor() {
    edStop(); edEl.hidden = true;
    ed.chans = null; ed.orig = null; ed.undo = []; ed.target = null;
  }
  function edRefresh(msg) {
    if (!ed.chans) return;
    const [a, b] = edSel();
    edInfo.textContent = typeof msg === "string" ? msg
      : fmtS(edLen()) + " · selected " + fmtS(a) + "–" + fmtS(b);
    document.getElementById("edUndo").disabled = !ed.undo.length;
    edDraw();
  }
  function edDraw() {
    const dpr = window.devicePixelRatio || 1, w = edWave.clientWidth, h = edWave.clientHeight;
    if (!w || !h) return;
    edWave.width = Math.round(w * dpr); edWave.height = Math.round(h * dpr);
    edCtx.setTransform(dpr, 0, 0, dpr, 0, 0); edCtx.clearRect(0, 0, w, h);
    const n = edLen(), lo = Math.min(ed.a, ed.b), hi = Math.max(ed.a, ed.b);
    const ax = lo / n * w, bx = hi / n * w;
    edCtx.fillStyle = "rgba(196,163,255,0.14)"; edCtx.fillRect(ax, 0, Math.max(1, bx - ax), h);
    const cols = Math.max(1, Math.floor(w)), step = n / cols;
    for (let x = 0; x < cols; x++) {
      const i0 = Math.floor(x * step), i1 = Math.min(n, Math.floor((x + 1) * step) + 1);
      const inc = Math.max(1, Math.floor((i1 - i0) / 200));
      let mn = 0, mx = 0;
      for (const c of ed.chans) for (let i = i0; i < i1; i += inc) { const v = c[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      edCtx.fillStyle = x >= ax && x <= bx ? lilac : "rgba(196,163,255,0.4)";
      edCtx.fillRect(x, h / 2 - mx * h * 0.46, 1, Math.max(1, (mx - mn) * h * 0.46));
    }
    edCtx.fillStyle = amber;
    [ax, bx].forEach(x => {
      edCtx.fillRect(Math.min(w - 2, Math.max(0, x - 1)), 0, 2, h);
      edCtx.fillRect(Math.min(w - 12, Math.max(0, x - 6)), h - 14, 12, 14);
    });
    if (edSrc && ctx) {
      const pos = edPlayFrom + (ctx.currentTime - edPlayStart) * ed.rate;
      edCtx.fillStyle = "#ece7f7"; edCtx.fillRect(pos / n * w, 0, 1.5, h);
    }
  }
  let edDrag = null;
  function edPos(e) {
    const r = edWave.getBoundingClientRect(), px = e.clientX - r.left;
    return { px, w: r.width, s: Math.round(Math.max(0, Math.min(1, px / r.width)) * edLen()) };
  }
  edWave.addEventListener("pointerdown", e => {
    if (!ed.chans) return;
    e.preventDefault(); edWave.setPointerCapture(e.pointerId);
    const { px, w, s } = edPos(e), n = edLen();
    const lo = Math.min(ed.a, ed.b), hi = Math.max(ed.a, ed.b), ax = lo / n * w, bx = hi / n * w;
    const da = Math.abs(px - ax), db = Math.abs(px - bx);
    if (da <= 22 && da <= db) { ed.a = hi; ed.b = lo; edDrag = { id: e.pointerId, handle: true, moved: false }; }
    else if (db <= 22) { ed.a = lo; ed.b = hi; edDrag = { id: e.pointerId, handle: true, moved: false }; }
    else edDrag = { id: e.pointerId, handle: false, moved: false, anchor: s };
  });
  edWave.addEventListener("pointermove", e => {
    if (!edDrag || e.pointerId !== edDrag.id) return;
    const { s } = edPos(e);
    if (!edDrag.handle) {
      if (!edDrag.moved && Math.abs(s - edDrag.anchor) < edLen() * 0.004) return;
      ed.a = edDrag.anchor;
    }
    edDrag.moved = true; ed.b = s; edRefresh();
  });
  const edUp = e => {
    if (!edDrag || e.pointerId !== edDrag.id) return;
    if (!edDrag.moved && !edDrag.handle) { ed.a = 0; ed.b = edLen(); }
    const lo = Math.min(ed.a, ed.b), hi = Math.max(ed.a, ed.b); ed.a = lo; ed.b = hi;
    edDrag = null; edRefresh();
  };
  edWave.addEventListener("pointerup", edUp);
  edWave.addEventListener("pointercancel", edUp);

  function edPush() {
    const max = edLen() * ed.chans.length > 3e6 ? 1 : 4;
    ed.undo.push({ chans: ed.chans.map(c => c.slice()), a: ed.a, b: ed.b });
    while (ed.undo.length > max) ed.undo.shift();
  }
  function edOp(fn) { if (!ed.chans) return; edStop(); edPush(); fn(); edRefresh(); }
  const edBtn = (id, fn) => document.getElementById(id).addEventListener("click", fn);
  edBtn("edAll", () => { if (!ed.chans) return; ed.a = 0; ed.b = edLen(); edRefresh(); });
  edBtn("edTrim", () => edOp(() => {
    const [a, b] = edSel(); ed.chans = ed.chans.map(c => c.slice(a, b)); ed.a = 0; ed.b = edLen();
  }));
  edBtn("edCut", () => {
    const [a, b] = edSel();
    if (a === 0 && b === edLen()) { edRefresh("Select part of the sample to cut it out."); return; }
    edOp(() => {
      ed.chans = ed.chans.map(c => {
        const out = new Float32Array(c.length - (b - a));
        out.set(c.subarray(0, a), 0); out.set(c.subarray(b), a);
        const f = Math.min(64, a, out.length - a);
        for (let i = 0; i < f; i++) { out[a - 1 - i] *= i / f; out[a + i] *= i / f; }
        return out;
      });
      ed.a = 0; ed.b = edLen();
    });
  });
  edBtn("edRev", () => edOp(() => { const [a, b] = edSel(); ed.chans.forEach(c => c.subarray(a, b).reverse()); }));
  edBtn("edNorm", () => edOp(() => {
    const [a, b] = edSel(); let pk = 0;
    for (const c of ed.chans) for (let i = a; i < b; i++) { const v = Math.abs(c[i]); if (v > pk) pk = v; }
    if (pk > 0) { const g = 0.97 / pk; for (const c of ed.chans) for (let i = a; i < b; i++) c[i] *= g; }
  }));
  const fade = up => edOp(() => {
    const [a, b] = edSel(), n = b - a;
    for (const c of ed.chans) for (let i = 0; i < n; i++) { const x = i / n; c[a + i] *= up ? x : 1 - x; }
  });
  edBtn("edFadeIn", () => fade(true));
  edBtn("edFadeOut", () => fade(false));
  const gain = g => edOp(() => { const [a, b] = edSel(); for (const c of ed.chans) for (let i = a; i < b; i++) c[i] *= g; });
  edBtn("edDown", () => gain(0.7079));
  edBtn("edUp", () => gain(1.4125));
  edBtn("edUndo", () => {
    const u = ed.undo.pop(); if (!u) return;
    edStop(); ed.chans = u.chans; ed.a = u.a; ed.b = u.b; edRefresh();
  });
  edBtn("edRevert", () => edOp(() => { ed.chans = ed.orig.map(c => c.slice()); ed.a = 0; ed.b = edLen(); }));

  let edSrc = null, edPlayFrom = 0, edPlayStart = 0;
  function edStop() {
    if (edSrc) { const s = edSrc; edSrc = null; try { s.stop(); } catch (e) {} }
    edPlayBtn.textContent = "▶ Play";
  }
  function edAnim() { if (!edSrc) { if (ed.chans) edDraw(); return; } edDraw(); requestAnimationFrame(edAnim); }
  edPlayBtn.addEventListener("click", () => {
    if (!ed.chans || !ctx) return;
    if (edSrc) { edStop(); return; }
    const [a, b] = edSel();
    const src = ctx.createBufferSource(); src.buffer = makeBuffer(ed.chans.map(c => c.slice(a, b)), ed.rate);
    src.connect(fx.input);
    src.onended = () => { if (edSrc === src) edStop(); };
    edSrc = src; edPlayFrom = a; edPlayStart = ctx.currentTime;
    src.start(); edPlayBtn.textContent = "■ Stop";
    requestAnimationFrame(edAnim);
  });

  let chopHits = true, chopArm = 0;
  const edChop = document.getElementById("edChop"), edChopN = document.getElementById("edChopN");
  function setChopMethod(h) {
    chopHits = h;
    document.getElementById("edEven").setAttribute("aria-pressed", String(!h));
    document.getElementById("edHits").setAttribute("aria-pressed", String(h));
  }
  edBtn("edEven", () => setChopMethod(false));
  edBtn("edHits", () => setChopMethod(true));
  edChop.addEventListener("click", () => {
    if (!ed.chans) return;
    const n = Number(edChopN.value);
    if (!chopArm) {
      edChop.textContent = "Replace P1–P" + n + "?";
      chopArm = setTimeout(() => { chopArm = 0; edChop.textContent = "Chop → Pads"; }, 2500);
      return;
    }
    clearTimeout(chopArm); chopArm = 0; edChop.textContent = "Chop → Pads";
    const [a, b] = edSel(), sub = ed.chans.map(c => c.subarray(a, b));
    const cuts = detectSlices(sub, ed.rate, n, chopHits ? 0.6 : 0), base = baseName(ed.name);
    let made = 0;
    for (let k = 0; k + 1 < cuts.length && made < n; k++) {
      const fa = Math.round(cuts[k] * ed.rate), fb = Math.round(cuts[k + 1] * ed.rate);
      if (fb - fa < 64) continue;
      const pcs = sub.map(c => {
        const x = c.slice(fa, fb), f = Math.min(128, x.length >> 2);
        for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
        return x;
      });
      const buf = makeBuffer(pcs, ed.rate), nm = base + " " + (made + 1);
      setPad(made, buf, nm); storePad(made, nm, buf); made++;
    }
    closeEditor();
    state.engine = "pads"; state.pads.sel = 0; renderEngine(); save();
    noteMsg("Chopped into " + made + " pads. Tap them, or put them in Seq.");
  });
  edBtn("edToPad", () => {
    if (!ed.chans) return;
    const [a, b] = edSel(), k = state.pads.sel, nm = baseName(ed.name) + " cut";
    const buf = makeBuffer(ed.chans.map(c => c.slice(a, b)), ed.rate);
    setPad(k, buf, nm); storePad(k, nm, buf);
    edRefresh("Sent " + fmtS(b - a) + " to P" + (k + 1) + ".");
  });
  edBtn("edCancel", closeEditor);
  edBtn("edSave", () => {
    if (!ed.chans) return;
    const buf = makeBuffer(ed.chans, ed.rate), t = ed.target;
    closeEditor(); t.save(buf);
  });
  window.addEventListener("resize", () => { if (ed.chans) edDraw(); });

  document.getElementById("editBtn").addEventListener("click", () => {
    start();
    const i = state.samp.slot;
    if (!sampBuf[i]) { noteMsg("Slot S" + (i + 1) + " is empty. Load a sample first.", true); return; }
    openEditor({
      buf: sampBuf[i], label: "S" + (i + 1), name: state.samp.slots[i].name,
      save(buf) {
        const nm = baseName(state.samp.slots[i].name) + " (edited)";
        setSample(i, buf, nm); storeSample(i, nm, bufferToWav(buf)); renderEngine(); save();
      },
    });
  });

  // ---------- Loadable instruments (SoundFont, SFZ, DecentSampler, multi-WAV) ----------
  function noteNum(v) {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    const m = /^([a-gA-G])([#b♯♭]?)(-?\d+)$/.exec(s);
    if (!m) return null;
    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
    const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0;
    return (parseInt(m[3], 10) + 1) * 12 + base + acc;
  }
  function normPath(p) {
    const out = [];
    for (const seg of String(p).replace(/\\/g, "/").split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") out.pop(); else out.push(seg);
    }
    return out.join("/");
  }
  function resolveIn(fs, baseDir, rel) {
    const want = normPath((baseDir ? baseDir + "/" : "") + rel);
    if (fs.names.includes(want)) return want;
    const lw = want.toLowerCase();
    let hit = fs.names.find(n => n.toLowerCase() === lw);
    if (hit) return hit;
    const base = lw.split("/").pop();
    hit = fs.names.find(n => n.toLowerCase().split("/").pop() === base);
    return hit || null;
  }
  function filesFS(list) {
    const map = new Map(list.map(f => [normPath(f.name), f]));
    return { names: [...map.keys()], async read(n, copy = true) { const f = map.get(n); if (!f) throw new Error("Missing " + n); return copy ? f.data.slice(0) : f.data; } };
  }
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === "undefined") throw new Error("This iPhone can't open zip files here. Update iOS, or unzip it in Files and pick the files instead.");
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function zipFS(ab) {
    const u8 = new Uint8Array(ab), dv = new DataView(ab);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("That file isn't a readable zip.");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    if (p === 0xffffffff) throw new Error("That zip is too large for this app.");
    const entries = new Map(), utf8 = new TextDecoder();
    for (let k = 0; k < count && p + 46 <= u8.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = utf8.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith("/") || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)) continue;
      entries.set(normPath(name), { method, csize, lho });
    }
    return {
      names: [...entries.keys()],
      async read(n) {
        const e = entries.get(n); if (!e) throw new Error("Missing " + n);
        const nl = dv.getUint16(e.lho + 26, true), xl = dv.getUint16(e.lho + 28, true);
        const st = e.lho + 30 + nl + xl, raw = u8.subarray(st, st + e.csize);
        if (e.method === 0) return raw.slice().buffer;
        if (e.method === 8) return (await inflateRaw(raw)).buffer;
        throw new Error("That zip uses a compression this app can't read.");
      },
    };
  }
  function wavInfo(ab) {
    const u8 = new Uint8Array(ab); if (u8.length < 12) return {};
    const dv = new DataView(ab), id = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (id(0) !== "RIFF" || id(8) !== "WAVE") return {};
    const out = {};
    let p = 12;
    while (p + 8 <= u8.length) {
      const c = id(p), size = dv.getUint32(p + 4, true);
      if (c === "fmt " && p + 16 <= u8.length) out.rate = dv.getUint32(p + 12, true);
      if (c === "smpl" && size >= 60 && p + 8 + 60 <= u8.length && dv.getUint32(p + 8 + 28, true) > 0)
        out.loop = [dv.getUint32(p + 8 + 44, true), dv.getUint32(p + 8 + 48, true)];
      p += 8 + size + (size & 1);
    }
    return out;
  }
  function parseSFZ(text) {
    text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const defs = {};
    text = text.replace(/#define\s+(\$\w+)\s+(\S+)/g, (_, k, v) => { defs[k] = v; return ""; });
    for (const k of Object.keys(defs).sort((x, y) => y.length - x.length)) text = text.split(k).join(defs[k]);
    const parseOps = body => {
      const ops = {}, re = /([A-Za-z0-9_]+)=/g, keys = [];
      let m;
      while ((m = re.exec(body))) keys.push([m[1], m.index, re.lastIndex]);
      keys.forEach(([k, , vs], j) => { ops[k] = body.slice(vs, j + 1 < keys.length ? keys[j + 1][1] : body.length).trim(); });
      return ops;
    };
    const regions = [];
    let control = {}, global = {}, master = {}, group = {};
    const parts = text.split(/<(\w+)>/);
    for (let j = 1; j < parts.length; j += 2) {
      const h = parts[j].toLowerCase(), ops = parseOps(parts[j + 1] || "");
      if (h === "control") control = Object.assign({}, control, ops);
      else if (h === "global") { global = ops; master = {}; group = {}; }
      else if (h === "master") { master = ops; group = {}; }
      else if (h === "group") group = ops;
      else if (h === "region") regions.push(Object.assign({}, global, master, group, ops));
    }
    const dp = control.default_path || "";
    return regions
      .filter(r => r.sample && !/^\*/.test(r.sample) && (r.trigger || "attack") === "attack"
        && (r.seq_position == null || r.seq_position === "1") && (r.lorand == null || parseFloat(r.lorand) === 0))
      .map(r => {
        const key = noteNum(r.key), lm = (r.loop_mode || r.loopmode || "").toLowerCase();
        return {
          file: dp + r.sample,
          lo: noteNum(r.lokey) ?? key ?? 0, hi: noteNum(r.hikey) ?? key ?? 127,
          root: noteNum(r.pitch_keycenter) ?? key ?? 60,
          lov: parseInt(r.lovel ?? 0, 10), hiv: parseInt(r.hivel ?? 127, 10),
          tune: parseFloat(r.tune || 0) + 100 * parseFloat(r.transpose || 0),
          gainDb: parseFloat(r.volume || 0), pan: parseFloat(r.pan || 0) / 100,
          loop: lm === "loop_continuous" || lm === "loop_sustain",
          ls: r.loop_start ?? r.loopstart, le: r.loop_end ?? r.loopend,
          offset: parseInt(r.offset || 0, 10),
          keytrack: r.pitch_keytrack != null ? parseFloat(r.pitch_keytrack) / 100 : 1,
        };
      });
  }
  function parseAttrs(s) {
    const o = {}, re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) o[m[1]] = m[3] ?? m[4];
    return o;
  }
  function parseDS(xml) {
    xml = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");
    const found = [], stack = [], re = /<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
    let m;
    while ((m = re.exec(xml))) {
      const [, close, tag, attrs, self] = m, t = tag.toLowerCase();
      if (close) { const i = stack.map(x => x.t).lastIndexOf(t); if (i >= 0) stack.length = i; continue; }
      const a = parseAttrs(attrs);
      if (t === "sample") {
        const inh = {};
        for (const s of stack) if (s.t === "groups" || s.t === "group") Object.assign(inh, s.a);
        found.push(Object.assign(inh, a));
        continue;
      }
      if (!self) stack.push({ t, a });
    }
    const vol = v => v == null || v === "" ? 0 : /db$/i.test(v) ? parseFloat(v) : 20 * Math.log10(Math.max(1e-4, parseFloat(v)));
    return found
      .filter(s => s.path && (!s.trigger || /^(attack|first)$/i.test(s.trigger)) && (!s.seqPosition || s.seqPosition === "1"))
      .map(s => {
        const root = noteNum(s.rootNote) ?? 60;
        return {
          file: s.path, root,
          lo: noteNum(s.loNote) ?? 0, hi: noteNum(s.hiNote) ?? 127,
          lov: parseInt(s.loVel ?? 0, 10), hiv: parseInt(s.hiVel ?? 127, 10),
          tune: 100 * parseFloat(s.tuning || 0), gainDb: vol(s.volume), pan: parseFloat(s.pan || 0) / 100,
          loop: String(s.loopEnabled).toLowerCase() === "true",
          ls: s.loopStart, le: s.loopEnd, offset: parseInt(s.start || 0, 10),
          keytrack: s.pitchKeyTrack != null ? parseFloat(s.pitchKeyTrack) : 1,
        };
      });
  }
  function multiRegions(names) {
    const audio = names.filter(n => AUDIO_RE.test(n)).sort();
    const parsed = audio.map(n => {
      const base = n.split("/").pop().replace(/\.[^.]+$/, "");
      const m = /(?:^|[^A-Za-z])([A-Ga-g])([#b]?)(-?\d)(?!\d)/.exec(base);
      let note = m ? noteNum(m[1] + m[2] + m[3]) : null;
      if (note == null) { const mm = /(?:^|\D)(\d{2,3})(?:\D|$)/.exec(base); if (mm && +mm[1] >= 12 && +mm[1] <= 127) note = +mm[1]; }
      return { file: n, note };
    });
    const mk = (file, lo, hi, root) => ({ file, lo, hi, root, lov: 0, hiv: 127, tune: 0, gainDb: 0, pan: 0, loop: false, offset: 0, keytrack: 1 });
    if (!parsed.length) return [];
    if (parsed.every(p => p.note != null)) {
      const seen = new Set(), list = parsed.filter(p => !seen.has(p.note) && seen.add(p.note)).sort((a, b) => a.note - b.note);
      return list.map((p, i) => mk(p.file,
        i === 0 ? 0 : Math.floor((list[i - 1].note + p.note) / 2) + 1,
        i === list.length - 1 ? 127 : Math.floor((p.note + list[i + 1].note) / 2), p.note));
    }
    // no note names: one sample per key, starting at C3, played at its own pitch
    return parsed.slice(0, 61).map((p, i) => mk(p.file, 48 + i, 48 + i, 48 + i));
  }
  function parseSF2(ab) {
    const dv = new DataView(ab), u8 = new Uint8Array(ab);
    const id = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (u8.length < 12 || id(0) !== "RIFF" || id(8) !== "sfbk") throw new Error("That isn't a SoundFont (.sf2) file.");
    const chunks = {};
    const walk = (from, to) => {
      let p = from;
      while (p + 8 <= to) {
        const cid = id(p), size = dv.getUint32(p + 4, true);
        if (cid === "LIST") walk(p + 12, Math.min(to, p + 8 + size));
        else chunks[cid] = { off: p + 8, size: Math.min(size, u8.length - p - 8) };
        p += 8 + size + (size & 1);
      }
    };
    walk(12, Math.min(u8.length, 8 + dv.getUint32(4, true)));
    for (const n of ["phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr", "smpl"])
      if (!chunks[n]) throw new Error("That SoundFont is missing data this app needs.");
    const str20 = o => { let s = ""; for (let i = 0; i < 20 && u8[o + i]; i++) s += String.fromCharCode(u8[o + i]); return s.trim(); };
    const recs = (name, size, fn) => { const c = chunks[name], out = []; for (let o = c.off; o + size <= c.off + c.size; o += size) out.push(fn(o)); return out; };
    const phdr = recs("phdr", 38, o => ({ name: str20(o), preset: dv.getUint16(o + 20, true), bank: dv.getUint16(o + 22, true), bag: dv.getUint16(o + 24, true) }));
    const pbag = recs("pbag", 4, o => dv.getUint16(o, true));
    const gen = o => ({ op: dv.getUint16(o, true), s: dv.getInt16(o + 2, true), lo: u8[o + 2], hi: u8[o + 3], u: dv.getUint16(o + 2, true) });
    const pgen = recs("pgen", 4, gen), igen = recs("igen", 4, gen);
    const inst = recs("inst", 22, o => ({ name: str20(o), bag: dv.getUint16(o + 20, true) }));
    const ibag = recs("ibag", 4, o => dv.getUint16(o, true));
    const shdr = recs("shdr", 46, o => ({ start: dv.getUint32(o + 20, true), end: dv.getUint32(o + 24, true), ls: dv.getUint32(o + 28, true), le: dv.getUint32(o + 32, true), rate: dv.getUint32(o + 36, true), pitch: u8[o + 40], corr: dv.getInt8(o + 41) }));
    const smpl = chunks.smpl;
    const zonesOf = (bags, gens, from, to) => {
      const zones = [];
      for (let b = from; b < to && b + 1 < bags.length; b++) {
        const g = {};
        for (let k = bags[b]; k < bags[b + 1] && k < gens.length; k++) g[gens[k].op] = gens[k];
        zones.push(g);
      }
      return zones;
    };
    const presets = phdr.slice(0, -1).map((p, i) => ({ name: p.name, bank: p.bank, preset: p.preset, idx: i }))
      .sort((a, b) => a.bank - b.bank || a.preset - b.preset);
    function regionsFor(pi) {
      const p = phdr[pi]; if (!p || !phdr[pi + 1]) return [];
      const pz = zonesOf(pbag, pgen, p.bag, phdr[pi + 1].bag);
      const pglobal = pz.length && pz[0][41] == null ? pz.shift() : {};
      const out = [];
      for (const z of pz) {
        const zz = Object.assign({}, pglobal, z);
        if (zz[41] == null) continue;
        const ins = inst[zz[41].u], next = inst[zz[41].u + 1];
        if (!ins || !next) continue;
        const iz = zonesOf(ibag, igen, ins.bag, next.bag);
        const iglobal = iz.length && iz[0][53] == null ? iz.shift() : {};
        const pk = zz[43] ? [zz[43].lo, zz[43].hi] : [0, 127], pv = zz[44] ? [zz[44].lo, zz[44].hi] : [0, 127];
        for (const z2 of iz) {
          const g = Object.assign({}, iglobal, z2);
          if (g[53] == null) continue;
          const s = shdr[g[53].u]; if (!s) continue;
          const ik = g[43] ? [g[43].lo, g[43].hi] : [0, 127], iv = g[44] ? [g[44].lo, g[44].hi] : [0, 127];
          const lo = Math.max(pk[0], ik[0]), hi = Math.min(pk[1], ik[1]);
          if (lo > hi) continue;
          const iv0 = (op, d = 0) => (g[op] ? g[op].s : d);
          const add = op => iv0(op) + (zz[op] ? zz[op].s : 0);   // preset generators add to instrument ones
          const start = s.start + iv0(0) + 32768 * iv0(4), end = s.end + iv0(1) + 32768 * iv0(12);
          const ls = s.ls + iv0(2) + 32768 * iv0(45), le = s.le + iv0(3) + 32768 * iv0(50);
          const root = g[58] && g[58].s >= 0 && g[58].s <= 127 ? g[58].s : (s.pitch <= 127 ? s.pitch : 60);
          const modes = g[54] ? g[54].u & 3 : 0;
          out.push({
            sid: g[53].u, start, end, rate: s.rate || 44100, lo, hi,
            lov: Math.max(pv[0], iv[0]), hiv: Math.min(pv[1], iv[1]), root,
            tune: 100 * add(51) + add(52) + s.corr,
            gainDb: -0.04 * add(48), pan: Math.max(-1, Math.min(1, add(17) / 500)),
            loop: modes === 1 || modes === 3, ls: ls - start, le: le - start,
            keytrack: (g[56] ? g[56].s : 100) / 100,
            // volume envelope (timecents → seconds; sustain is centibels of attenuation)
            env: {
              attack: g[34] || zz[34] ? Math.pow(2, add(34) / 1200) : 0.001,
              hold: g[35] || zz[35] ? Math.pow(2, add(35) / 1200) : 0.001,
              decay: g[36] || zz[36] ? Math.pow(2, add(36) / 1200) : 0.001,
              sustain: g[37] || zz[37] ? Math.pow(10, -Math.max(0, add(37)) / 200) : 1,
            },
          });
        }
      }
      return out;
    }
    function pcm(r) {
      const total = smpl.size >> 1;
      const s = Math.max(0, Math.min(r.start, total - 1)), e = Math.max(s + 1, Math.min(r.end, total));
      const n = e - s, out = new Float32Array(n), byte = smpl.off + s * 2;
      if (byte % 2 === 0) { const src = new Int16Array(ab, byte, n); for (let i = 0; i < n; i++) out[i] = src[i] / 32768; }
      else for (let i = 0; i < n; i++) out[i] = dv.getInt16(byte + i * 2, true) / 32768;
      return out;
    }
    return { presets, regionsFor, pcm };
  }
  function makeAudio(f32, rate) {
    try { const b = ctx.createBuffer(1, f32.length, rate); b.copyToChannel(f32, 0); return b; }
    catch (e) {
      const r2 = ctx.sampleRate, n2 = Math.max(1, Math.round(f32.length * r2 / rate)), o = new Float32Array(n2);
      for (let i = 0; i < n2; i++) { const x = i * rate / r2, i0 = Math.floor(x), fr = x - i0; o[i] = (f32[i0] || 0) * (1 - fr) + (f32[i0 + 1] || 0) * fr; }
      const b = ctx.createBuffer(1, n2, r2); b.copyToChannel(o, 0); return b;
    }
  }
  async function openInstrument(files) {
    const fs = files.length === 1 && /\.zip$/i.test(files[0].name) ? zipFS(files[0].data) : filesFS(files);
    const sf2Name = fs.names.find(n => /\.sf2$/i.test(n));
    if (sf2Name) {
      const sf = parseSF2(await fs.read(sf2Name, false));
      if (!sf.presets.length) throw new Error("That SoundFont has no presets.");
      return { kind: "sf2", sf, presets: sf.presets.map(p => ({ id: p.idx, name: p.name || "Preset " + p.preset })) };
    }
    const pf = fs.names.filter(n => /\.(dspreset|sfz)$/i.test(n)).sort();
    if (pf.length) return { kind: "preset", fs, presets: pf.map((n, i) => ({ id: i, file: n, name: n.split("/").pop().replace(/\.(dspreset|sfz)$/i, "") })) };
    if (fs.names.some(n => AUDIO_RE.test(n))) return { kind: "multi", fs, presets: [{ id: 0, name: "All samples" }] };
    throw new Error("No instrument found. Pick a .sf2, a DecentSampler or SFZ .zip, or a set of WAVs.");
  }
  async function loadRegionsAudio(fs, regs, baseDir, progress) {
    const files = new Map();
    for (const r of regs) { r.path = resolveIn(fs, baseDir, r.file); if (r.path && !files.has(r.path)) files.set(r.path, null); }
    const paths = [...files.keys()];
    if (!paths.length) throw new Error("Couldn't find the sample files that preset points to.");
    if (paths.length > 400) throw new Error("That instrument has " + paths.length + " sample files, too many for a phone.");
    let done = 0;
    const q = paths.slice();
    const worker = async () => {
      while (q.length) {
        const p = q.shift();
        try { const data = await fs.read(p); const info = wavInfo(data); files.set(p, { info, buf: await decode(data) }); } catch (e) {}
        progress(++done, paths.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const out = [];
    for (const r of regs) {
      const f = r.path && files.get(r.path); if (!f) continue;
      const rate0 = f.info.rate || f.buf.sampleRate;
      const num = v => v == null || v === "" ? null : Number(v);
      const ls = num(r.ls) ?? (f.info.loop ? f.info.loop[0] : null), le = num(r.le) ?? (f.info.loop ? f.info.loop[1] : null);
      out.push({
        buf: f.buf, lo: r.lo, hi: r.hi, lov: r.lov, hiv: r.hiv, root: r.root, tune: r.tune || 0,
        gain: Math.pow(10, (r.gainDb || 0) / 20), pan: r.pan || 0,
        loop: !!r.loop && ls != null && le != null && le > ls, lsSec: (ls || 0) / rate0, leSec: Math.min(f.buf.duration, (le || 0) / rate0),
        offsetSec: (r.offset || 0) / rate0, keytrack: r.keytrack ?? 1,
      });
    }
    return out;
  }
  async function buildPreset(src, pi, progress = () => {}) {
    const pr = src.presets[pi] || src.presets[0];
    if (src.kind === "sf2") {
      const cache = new Map(), regions = [];
      for (const r of src.sf.regionsFor(pr.id)) {
        const key = r.sid + ":" + r.start + ":" + r.end;
        if (!cache.has(key)) cache.set(key, makeAudio(src.sf.pcm(r), r.rate));
        const buf = cache.get(key);
        regions.push({
          buf, lo: r.lo, hi: r.hi, lov: r.lov, hiv: r.hiv, root: r.root, tune: r.tune,
          gain: Math.pow(10, r.gainDb / 20), pan: r.pan, loop: r.loop && r.le > r.ls,
          lsSec: r.ls / r.rate, leSec: Math.min(buf.duration, r.le / r.rate), offsetSec: 0, keytrack: r.keytrack, env: r.env,
        });
      }
      if (!regions.length) throw new Error("That preset has no samples.");
      return { name: pr.name, regions };
    }
    let regs, baseDir = "";
    if (src.kind === "preset") {
      const text = new TextDecoder().decode(await src.fs.read(pr.file));
      regs = /\.sfz$/i.test(pr.file) ? parseSFZ(text) : parseDS(text);
      baseDir = pr.file.includes("/") ? pr.file.slice(0, pr.file.lastIndexOf("/")) : "";
    } else regs = multiRegions(src.fs.names);
    if (!regs.length) throw new Error("That preset has no playable samples.");
    const regions = await loadRegionsAudio(src.fs, regs, baseDir, progress);
    if (!regions.length) throw new Error("Couldn't decode those samples. iPhone can't play OGG; WAV, FLAC, MP3 and M4A work.");
    return { name: pr.name, regions };
  }

  let curInst = null, curSource = null, instStatus = "", instErr = false, loadToken = 0;
  const memLib = new Map();
  const instMeta = (() => { try { const v = JSON.parse(localStorage.getItem("nightbloom-insts") || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
  const writeMeta = () => { try { localStorage.setItem("nightbloom-insts", JSON.stringify(instMeta.filter(m => !m.temp))); } catch (e) {} };
  async function instPut(id, rec) {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction("instruments", "readwrite");
      tx.objectStore("instruments").put(rec, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  async function instGet(id) {
    if (memLib.has(id)) return memLib.get(id);
    const db = await idb();
    return new Promise(res => { const r = db.transaction("instruments").objectStore("instruments").get(id); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  }
  async function instDel(id) { try { const db = await idb(); db.transaction("instruments", "readwrite").objectStore("instruments").delete(id); } catch (e) {} }

  function pickRegions(midi, inst) {
    const R = inst.regions;
    let rs = R.filter(r => r.lo <= midi && midi <= r.hi);
    if (!rs.length) {
      // outside every zone: borrow the nearest one so each key still sounds
      let best = null, bd = 1e9;
      for (const r of R) { const d = midi < r.lo ? r.lo - midi : midi - r.hi; if (d < bd) { bd = d; best = r; } }
      rs = best ? R.filter(r => r.lo === best.lo && r.hi === best.hi) : [];
    }
    const vv = NB_VEL7, v = rs.filter(r => r.lov <= vv && vv <= r.hiv);
    if (v.length) return v.slice(0, 4);
    // no recording at this velocity for this key: the nearest layer that has one (never all layers at once)
    const dist = r => vv < r.lov ? r.lov - vv : vv > r.hiv ? vv - r.hiv : 0, best = Math.min(...rs.map(dist));
    return rs.filter(r => dist(r) === best).slice(0, 4);
  }
  let nbwVoice = null, nbwCtl = null, nbwStemTaps = null;   // (Plugins, further down)
  function makeInstVoice(midi, when, scale = 1, inst = curInst, P = state.inst.p) {
    if (!ctx || !inst) return null;
    if (inst.regions && inst.regions.wam) return nbwVoice ? nbwVoice(midi, when, scale, inst, P) : null;
    const rs = pickRegions(midi, inst); if (!rs.length) return null;
    const t = when ?? ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.0001;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = expMap(P.tone, 250, 20000);
    const lvl = ctx.createGain(); lvl.gain.value = P.level * 1.2 * scale;
    tone.connect(out).connect(lvl).connect(fx.input);
    const shift = Math.round((P.tune - 0.5) * 24), srcs = [];
    for (const r of rs) {
      const src = ctx.createBufferSource(); src.buffer = r.buf;
      src.playbackRate.value = Math.pow(2, ((midi - r.root) * r.keytrack + shift + r.tune / 100) / 12);
      if (r.loop && r.leSec > r.lsSec + 0.001) { src.loop = true; src.loopStart = r.lsSec; src.loopEnd = r.leSec; }
      const g = ctx.createGain(); g.gain.value = r.gain;
      if (r.env && r.env.sustain < 0.98 && r.env.decay > 0.005) {
        const ah = Math.max(0.002, r.env.attack) + r.env.hold;
        g.gain.setValueAtTime(r.gain, t + ah);
        g.gain.setTargetAtTime(r.gain * Math.max(0.0001, r.env.sustain), t + ah, r.env.decay / 4.6);
      }
      let node = src.connect(g);
      if (r.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = r.pan; node = node.connect(pn); }
      node.connect(tone);
      src.start(t, Math.max(0, Math.min(r.offsetSec || 0, r.buf.duration - 0.01)));
      srcs.push(src);
    }
    const atk = P.attack <= 0.001 ? 0.003 : expMap(P.attack, 0.003, 4), rel = expMap(P.release, 0.03, 8);
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + atk);
    if (P.decay != null && P.decay < 0.99) out.gain.setTargetAtTime(0.0001, t + atk, expMap(P.decay, 0.12, 8));
    return {
      stop(at) {
        const now = ctx.currentTime;
        if (at == null) { at = now; out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now); }
        out.gain.setTargetAtTime(0.0001, at, rel / 4);
        const end = at + rel * 1.6 + 0.05;
        srcs.forEach(s => { try { s.stop(end); } catch (e) {} });
        setTimeout(() => { try { lvl.disconnect(); } catch (e) {} }, (end - now) * 1000 + 300);
      },
    };
  }

  const instbar = document.getElementById("instbar"), instSel = document.getElementById("instSel");
  const presetSel = document.getElementById("presetSel"), presetWrap = document.getElementById("presetWrap");
  const instFile = document.getElementById("instFile"), instRemove = document.getElementById("instRemove");
  function instNote(msg, err) {
    instStatus = msg; instErr = !!err;
    if (state.engine === "inst") noteMsg(msg || instSummary(), instErr);
  }
  const instSummary = () => curInst ? curInst.name + " · " + curInst.regions.length + " zones"
    : instMeta.length ? "Pick an instrument" : "Load a .sf2, SFZ or DecentSampler .zip, or WAVs";
  function renderInstPanel() {
    document.getElementById("engineLabel").textContent = "Instrument";
    noteMsg(instStatus || instSummary(), instStatus && instErr);
    engineKnobsEl.innerHTML = "";
    INST_KNOBS.forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.inst.p, () => {}));
    instSel.innerHTML = "";
    const none = document.createElement("option"); none.value = ""; none.textContent = instMeta.length ? "—" : "None yet";
    instSel.appendChild(none);
    instMeta.forEach(m => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.name + (m.temp ? " (this session)" : ""); instSel.appendChild(o); });
    instSel.value = state.inst.cur || "";
    const many = !!(curSource && curSource.presets.length > 1);
    presetWrap.hidden = !many;
    if (many) {
      presetSel.innerHTML = "";
      curSource.presets.forEach((p, i) => { const o = document.createElement("option"); o.value = i; o.textContent = p.name; presetSel.appendChild(o); });
      presetSel.value = String(state.inst.preset);
    }
    instRemove.hidden = !state.inst.cur;
  }
  const renderIfInst = () => { if (state.engine === "inst") renderInstPanel(); };
  async function usePreset(pi, tok) {
    instNote("Loading samples…");
    const built = await buildPreset(curSource, pi, (d, n) => { if (tok === loadToken) instNote("Loading samples " + d + "/" + n + "…"); });
    if (tok !== loadToken) return;
    curInst = built; state.inst.preset = pi; instStatus = ""; instErr = false; save(); renderIfInst();
  }
  async function selectInstrument(id, pi = 0) {
    const tok = ++loadToken, meta = instMeta.find(m => m.id === id);
    if (!meta) { curInst = null; curSource = null; state.inst.cur = ""; instStatus = ""; save(); renderIfInst(); return; }
    state.inst.cur = id; renderIfInst();
    instNote("Opening " + meta.name + "…");
    try {
      const rec = await instGet(id);
      if (!rec || !rec.files) throw new Error("This instrument's files aren't on this phone anymore. Load it again.");
      const src = await openInstrument(rec.files);
      if (tok !== loadToken) return;
      curSource = src;
      await usePreset(Math.min(pi, src.presets.length - 1), tok);
    } catch (e) { if (tok === loadToken) { curInst = null; instNote(e.message || "Couldn't open that instrument.", true); renderIfInst(); } }
  }
  document.getElementById("instLoad").addEventListener("click", () => { start(); instFile.click(); });
  instFile.addEventListener("change", async () => {
    const list = [...(instFile.files || [])]; instFile.value = "";
    if (!list.length) return;
    const pre = list.find(f => /\.(sfz|dspreset)$/i.test(f.name));
    const name = (list.length === 1 ? list[0].name : pre ? pre.name : list.length + " samples").replace(/\.(zip|sf2|sfz|dspreset)$/i, "");
    const tok = ++loadToken;
    try {
      instNote("Reading " + (list.length === 1 ? list[0].name : list.length + " files") + "…");
      const files = [];
      for (const f of list) files.push({ name: f.name, data: await f.arrayBuffer() });
      const src = await openInstrument(files);
      if (tok !== loadToken) return;
      const idNew = "i" + Date.now().toString(36);
      let kept = true;
      try { await instPut(idNew, { files }); } catch (e) { kept = false; memLib.set(idNew, { files }); }
      instMeta.push({ id: idNew, name, kind: src.kind, temp: !kept }); writeMeta();
      curSource = src; state.inst.cur = idNew; state.inst.preset = 0;
      await usePreset(0, tok);
      if (!kept && tok === loadToken) instNote(curInst.name + " · loaded for this session only (too big to keep on this phone)");
    } catch (e) { if (tok === loadToken) instNote(e.message || "Couldn't open that instrument.", true); }
  });
  instSel.addEventListener("change", () => selectInstrument(instSel.value, 0));
  presetSel.addEventListener("change", async () => {
    const tok = ++loadToken;
    try { await usePreset(Number(presetSel.value), tok); }
    catch (e) { if (tok === loadToken) instNote(e.message || "Couldn't load that preset.", true); }
  });
  let rmArm = 0;
  instRemove.addEventListener("click", () => {
    const id = state.inst.cur; if (!id) return;
    if (!rmArm) {
      instRemove.textContent = "Remove?";
      rmArm = setTimeout(() => { rmArm = 0; instRemove.textContent = "Remove"; }, 2500);
      return;
    }
    clearTimeout(rmArm); rmArm = 0; instRemove.textContent = "Remove";
    instDel(id); memLib.delete(id);
    const i = instMeta.findIndex(m => m.id === id); if (i >= 0) instMeta.splice(i, 1);
    writeMeta(); loadToken++;
    curInst = null; curSource = null; state.inst.cur = ""; instStatus = ""; save(); renderIfInst();
  });

  // ---------- Tabs, panel switching, startup ----------
  [["pads", "Pads", "12 pads"], ["inst", "Inst", "SF2 · SFZ"]].forEach(([id, short, sub]) => {
    const wrap = document.createElement("div"); wrap.className = "tabwrap";
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.engine = id;
    b.innerHTML = `${short}<small>${sub}</small>`;
    b.addEventListener("click", () => { state.engine = id; renderEngine(); save(); });
    wrap.append(b); tabsEl.appendChild(wrap);
  });
  function renderMore() {
    const isPads = state.engine === "pads";
    document.getElementById("sbar").hidden = true;
    padbar.hidden = !isPads; instbar.hidden = state.engine !== "inst";
    document.getElementById("libbar").hidden = state.engine !== "lib";
    document.getElementById("drbar").hidden = true;
    if (isPads) renderPadsPanel(); else if (state.engine === "lib") renderLibPanel(); else renderInstPanel();
    document.querySelectorAll(".tab").forEach(t => {
      t.setAttribute("aria-pressed", String(t.dataset.engine === state.engine));
      t.classList.toggle("on", !!(state.layers[t.dataset.engine] && state.layers[t.dataset.engine].on));
    });
    if (keysReady) buildKeys();
  }
  async function loadMoreStored() {
    try {
      const db = await idb();
      for (let k = 0; k < NPADS; k++) {
        const rec = await new Promise(res => {
          const r = db.transaction("samples").objectStore("samples").get("pad" + k);
          r.onsuccess = () => res(r.result); r.onerror = () => res(null);
        });
        if (rec && rec.data) { try { setPad(k, await decode(rec.data.slice(0)), rec.name); } catch (e) {} }
      }
    } catch (e) {}
    if (state.inst.cur && instMeta.some(m => m.id === state.inst.cur)) selectInstrument(state.inst.cur, state.inst.preset);
    else if (state.inst.cur) { state.inst.cur = ""; save(); }
  }
  moreReady = true;
  if (state.engine === "pads" || state.engine === "inst") renderEngine();
  {
    const selTab = tabsEl.querySelector('.tab[aria-pressed="true"]');
    if (selTab) selTab.closest(".tabwrap").scrollIntoView({ block: "nearest", inline: "center" });
  }


