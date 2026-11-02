  // ======================================================================
  // BETA · Tracks: multitrack audio editor
  //   unlimited tracks (128 cap) · import files · record Nate Bloom or the mic
  //   while the other tracks play · move/trim/split/copy/fade/gain clips ·
  //   mute/solo/volume/pan · snap to beat/bar · trkUndoFn · WAV mixdown
  //   Audio lives in IndexedDB; the arrangement in localStorage.
  // ======================================================================
  const TRK_HEAD = 148, TRK_ROW = 66, TRK_MAX = 128;
  const TRK_COLORS = ["#c4a3ff", "#ffb65c", "#7fd6c2", "#ff8fa3", "#9ec1ff", "#e6d27a", "#b6e37f", "#f2a2e8"];
  const T = { tracks: [], clips: [], pps: 40, snap: "beat", playhead: 0, withBeat: false, sel: null, selTrack: null };
  const trkAudio = new Map(), trkPeaks = new Map();
  let trkLoaded = false, trkUndo = [], trkRedo = [];
  const trkUid = () => Math.random().toString(36).slice(2, 10);
  const trkEl = document.getElementById("tracks"), trkScroll = document.getElementById("trkScroll"), trkInner = document.getElementById("trkInner");
  const trkStatus = document.getElementById("trkStatus"), trkTime = document.getElementById("trkTime"), trkPlayBtn = document.getElementById("trkPlay");
  const trkRecBtn = document.getElementById("trkRec"), trkSelBar = document.getElementById("trkSelBar"), trkMini = document.getElementById("trkMini");
  const trkSay = msg => { trkStatus.textContent = msg; };

  function trkSave() {
    try { localStorage.setItem("nightbloom-tracks", JSON.stringify({ tracks: T.tracks, clips: T.clips, pps: T.pps, snap: T.snap, withBeat: T.withBeat })); } catch (e) {}
  }
  function snapshot() {
    trkUndo.push(JSON.stringify({ tracks: T.tracks, clips: T.clips }));
    if (trkUndo.length > 60) trkUndo.shift();
  }
  function trkUndoFn() {
    const s = trkUndo.pop(); if (!s) { trkSay("Nothing to undo"); return; }
    const o = JSON.parse(s); T.tracks = o.tracks; T.clips = o.clips; T.sel = null;
    trkSave(); trkRender(); trkSay("Undone");
  }

  // ---------- storage ----------
  async function putAudio(id, buf, name) {
    try {
      const chans = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(toI16(buf.getChannelData(c)));
      const db = await idb();
      db.transaction("tracks", "readwrite").objectStore("tracks").put({ rate: buf.sampleRate, name, chans }, id);
    } catch (e) { trkSay("Couldn't save audio in this browser; it will be lost on reload."); }
  }
  async function getAudio(id) {
    try {
      const db = await idb();
      const trec = await new Promise(res => { const r = db.transaction("tracks").objectStore("tracks").get(id); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (!trec) return null;
      const buf = new AudioBuffer({ length: trec.chans[0].length, numberOfChannels: trec.chans.length, sampleRate: trec.rate });
      trec.chans.forEach((ch, c) => { const d = buf.getChannelData(c); for (let i = 0; i < ch.length; i++) d[i] = ch[i] / 32767; });
      return buf;
    } catch (e) { return null; }
  }
  async function dropUnusedAudio() {
    try {
      const used = new Set(T.clips.map(c => c.audio));
      const db = await idb(), st = db.transaction("tracks", "readwrite").objectStore("tracks");
      const keys = await new Promise(res => { const r = st.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
      const undoUsed = new Set(); trkUndo.concat(trkRedo).forEach(s => JSON.parse(s).clips.forEach(c => undoUsed.add(c.audio)));
      keys.forEach(k => { if (!used.has(k) && !undoUsed.has(k)) st.delete(k); });
    } catch (e) {}
  }
  function addAudio(buf, name) {
    const id = trkUid(); trkAudio.set(id, buf); peaksFor(id); putAudio(id, buf, name); return id;
  }
  function peaksFor(id) {
    if (trkPeaks.has(id)) return trkPeaks.get(id);
    const buf = trkAudio.get(id); if (!buf) return null;
    const per = Math.max(1, Math.floor(buf.sampleRate / 200)), n = Math.ceil(buf.length / per), pk = new Float32Array(n);
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    for (let i = 0; i < n; i++) { let m = 0; const e = Math.min(buf.length, (i + 1) * per); for (let j = i * per; j < e; j++) { const v = Math.max(Math.abs(a[j]), Math.abs(b[j])); if (v > m) m = v; } pk[i] = m; }
    trkPeaks.set(id, pk); return pk;
  }
  async function trkLoad() {
    if (trkLoaded) return; trkLoaded = true;
    try {
      const s = JSON.parse(localStorage.getItem("nightbloom-tracks") || "null");
      if (s && Array.isArray(s.tracks)) Object.assign(T, { tracks: s.tracks, clips: s.clips || [], pps: s.pps || 40, snap: s.snap || "beat", withBeat: !!s.withBeat });
    } catch (e) {}
    if (!T.tracks.length) for (let i = 0; i < 4; i++) newTrack(false);
    trkSay("Loading audio…");
    for (const id of new Set(T.clips.map(c => c.audio))) { const b = await getAudio(id); if (b) { trkAudio.set(id, b); peaksFor(id); } }
    T.clips = T.clips.filter(c => trkAudio.has(c.audio));
    trkRender(); trkSay(T.clips.length ? T.clips.length + " clips on " + T.tracks.length + " tracks" : "Import audio, or arm a track and press ● to record");
  }

  // ---------- model helpers ----------
  function newTrack(pushUndo = true, name) {
    if (T.tracks.length >= TRK_MAX) { trkSay("That's the maximum of " + TRK_MAX + " tracks"); return null; }
    if (pushUndo) snapshot();
    const n = T.tracks.length;
    const t = { id: trkUid(), name: name || "Track " + (n + 1), color: TRK_COLORS[n % TRK_COLORS.length], vol: 0.8, pan: 0, mute: false, solo: false, arm: false, input: "nb" };
    T.tracks.push(t); return t;
  }
  const trackOf = c => T.tracks.find(t => t.id === c.track);
  const clipEnd = c => c.start + c.dur;
  const projectEnd = () => T.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
  const beatSec = () => 60 / state.seq.bpm;
  const barSec = () => stepsNow() * stepDur();
  function snapT(t) {
    if (T.snap === "off") return Math.max(0, t);
    const q = T.snap === "bar" ? barSec() : beatSec();
    return Math.max(0, Math.round(t / q) * q);
  }
  const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2); };
  const audible = t => { const anySolo = T.tracks.some(x => x.solo); return !t.mute && (!anySolo || t.solo); };

  // ---------- rendering ----------
  function trkRender() {
    const W = Math.max(trkScroll.clientWidth, TRK_HEAD + (Math.max(projectEnd(), barSec() * 16) + barSec() * 4) * T.pps);
    trkInner.style.width = W + "px";
    trkInner.innerHTML = "";
    // ruler
    const ruler = document.createElement("div"); ruler.className = "trow ruler";
    const corner = document.createElement("div"); corner.className = "thead corner";
    corner.innerHTML = '<span>' + T.tracks.length + ' tracks</span>';
    const rl = document.createElement("div"); rl.className = "tlane rlane"; rl.id = "trkRuler";
    const bs = barSec(), bpx = bs * T.pps, every = bpx < 26 ? Math.ceil(26 / bpx) : 1;
    for (let b = 0; b * bs * T.pps < W; b++) {
      const x = b * bpx;
      const tick = document.createElement("i"); tick.style.left = x + "px"; tick.className = b % every ? "minor" : "";
      if (b % every === 0) tick.textContent = b + 1;
      rl.appendChild(tick);
      if (bpx > 60) for (let q = 1; q < 4; q++) { const s = document.createElement("i"); s.className = "beat"; s.style.left = (x + q * bpx / 4) + "px"; rl.appendChild(s); }
    }
    ruler.append(corner, rl); trkInner.appendChild(ruler);
    // rows
    T.tracks.forEach((t, ti) => {
      const row = document.createElement("div"); row.className = "trow" + (T.selTrack === t.id ? " tsel" : ""); row.dataset.track = t.id;
      const h = document.createElement("div"); h.className = "thead"; h.style.setProperty("--tc", t.color);
      h.innerHTML = `<div class="th1"><input class="tname" aria-label="Track name" maxlength="24"><button class="tb tm" aria-label="Mute">M</button><button class="tb ts" aria-label="Solo">S</button><button class="tb tr" aria-label="Arm for recording">●</button></div>
        <div class="th2"><input class="tvol" type="range" min="0" max="100" aria-label="Volume"><input class="tpan" type="range" min="-100" max="100" aria-label="Pan"><button class="tb tin" aria-label="Record source"></button></div>`;
      const nm = h.querySelector(".tname"); nm.value = t.name;
      nm.addEventListener("change", () => { snapshot(); t.name = nm.value.trim() || t.name; trkSave(); });
      const tb = (sel, key, cls) => { const b = h.querySelector(sel); b.classList.toggle("on", !!t[key]); b.addEventListener("click", ev => { ev.stopPropagation(); t[key] = !t[key]; b.classList.toggle("on", t[key]); trkSave(); liveMix(); if (key === "arm") updateRecBtn(); }); };
      tb(".tm", "mute"); tb(".ts", "solo"); tb(".tr", "arm");
      const vol = h.querySelector(".tvol"), pan = h.querySelector(".tpan"), inp = h.querySelector(".tin");
      vol.value = Math.round(t.vol * 100); pan.value = Math.round(t.pan * 100);
      vol.addEventListener("input", () => { t.vol = vol.value / 100; liveMix(); trkSave(); });
      vol.addEventListener("dblclick", () => { t.vol = 0.8; vol.value = 80; liveMix(); trkSave(); });
      pan.addEventListener("input", () => { t.pan = pan.value / 100; liveMix(); trkSave(); });
      pan.addEventListener("dblclick", () => { t.pan = 0; pan.value = 0; liveMix(); trkSave(); });
      inp.textContent = t.input === "mic" ? "Mic" : "NB";
      inp.title = "Record from: " + (t.input === "mic" ? "microphone" : "Nate Bloom");
      inp.addEventListener("click", ev => { ev.stopPropagation(); t.input = t.input === "mic" ? "nb" : "mic"; trkSave(); trkRender(); });
      h.addEventListener("pointerdown", ev => { if (ev.target.closest("input,button")) return; T.selTrack = t.id; T.sel = null; trkRender(); });
      const lane = document.createElement("div"); lane.className = "tlane";
      T.clips.filter(c => c.track === t.id).forEach(c => lane.appendChild(clipEl(c, t)));
      row.append(h, lane); trkInner.appendChild(row);
    });
    const add = document.createElement("div"); add.className = "trow addrow";
    add.innerHTML = '<div class="thead"><button class="btn" id="trkAddRow">+ Add track</button></div><div class="tlane"></div>';
    trkInner.appendChild(add);
    add.querySelector("#trkAddRow").addEventListener("click", () => { const t = newTrack(); if (t) { trkSave(); trkRender(); trkScroll.scrollTop = trkScroll.scrollHeight; } });
    const ph = document.createElement("div"); ph.className = "tplayhead"; ph.id = "trkPH"; trkInner.appendChild(ph);
    placePlayhead();
    renderSelBar(); updateRecBtn();
  }
  function clipEl(c, t) {
    const el = document.createElement("div"); el.className = "tclip" + (T.sel === c.id ? " sel" : ""); el.dataset.clip = c.id;
    el.style.left = c.start * T.pps + "px"; el.style.width = Math.max(4, c.dur * T.pps) + "px"; el.style.setProperty("--tc", t.color);
    const cw = Math.min(6000, Math.max(4, Math.round(c.dur * T.pps))), cv = document.createElement("canvas");
    cv.width = cw; cv.height = 46; drawWave(cv, c, t.color);
    const lab = document.createElement("span"); lab.className = "tlab"; lab.textContent = c.name + (c.gain !== 1 ? "  " + (20 * Math.log10(Math.max(1e-4, c.gain))).toFixed(1) + " dB" : "");
    const fi = document.createElement("div"); fi.className = "tfade fin"; fi.style.width = c.fadeIn * T.pps + "px";
    const fo = document.createElement("div"); fo.className = "tfade fout"; fo.style.width = c.fadeOut * T.pps + "px";
    el.append(cv, fi, fo, lab);
    ["hl", "hr", "hfi", "hfo"].forEach(k => { const h = document.createElement("div"); h.className = "th " + k; h.dataset.h = k; if (k === "hfi") h.style.left = Math.max(0, c.fadeIn * T.pps - 7) + "px"; if (k === "hfo") h.style.right = Math.max(0, c.fadeOut * T.pps - 7) + "px"; el.appendChild(h); });
    return el;
  }
  function drawWave(cv, c, color) {
    const g = cv.getContext("2d"), w = cv.width, h = cv.height, pk = peaksFor(c.audio), buf = trkAudio.get(c.audio);
    g.clearRect(0, 0, w, h); if (!pk || !buf) return;
    g.fillStyle = color; g.globalAlpha = 0.85;
    const per = buf.length / pk.length / buf.sampleRate;   // seconds per peak
    for (let x = 0; x < w; x++) {
      const t0 = c.offset + x / w * c.dur, t1 = c.offset + (x + 1) / w * c.dur;
      let m = 0; for (let i = Math.floor(t0 / per), e = Math.min(pk.length, Math.ceil(t1 / per) + 1); i < e; i++) if (pk[i] > m) m = pk[i];
      // fades shape the drawing too
      const lt = x / w * c.dur;
      let f = c.gain; if (c.fadeIn > 0 && lt < c.fadeIn) f *= lt / c.fadeIn; if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) f *= (c.dur - lt) / c.fadeOut;
      const a = Math.min(1, m * f) * (h / 2 - 1);
      g.fillRect(x, h / 2 - a, 1, Math.max(1, a * 2));
    }
  }
  function placePlayhead() {
    const ph = document.getElementById("trkPH"); if (ph) ph.style.left = (TRK_HEAD + T.playhead * T.pps) + "px";
    trkTime.textContent = fmtT(T.playhead);
    const mt = document.getElementById("trkMiniTime"); if (mt) mt.textContent = fmtT(T.playhead);
  }
  function renderSelBar() {
    const c = T.clips.find(x => x.id === T.sel);
    trkSelBar.hidden = !c;
    if (!c) return;
    document.getElementById("trkSelName").textContent = c.name + " · " + c.dur.toFixed(2) + "s";
    const g = document.getElementById("trkGain"); g.value = Math.round(20 * Math.log10(Math.max(1e-4, c.gain)));
    document.getElementById("trkGainVal").textContent = g.value + " dB";
  }
  function updateRecBtn() {
    const armed = T.tracks.filter(t => t.arm).length;
    trkRecBtn.title = armed ? "Record on " + armed + " armed track" + (armed > 1 ? "s" : "") : "Record on a new track";
  }

  // ---------- touch editing ----------
  let trkDrag = null;
  trkInner.addEventListener("pointerdown", ev => {
    const ruler = ev.target.closest(".rlane");
    const xIn = e => e.clientX - trkInner.getBoundingClientRect().left - TRK_HEAD;
    if (ruler) {
      ev.preventDefault(); ruler.setPointerCapture(ev.pointerId);
      const seek = e => { T.playhead = Math.max(0, xIn(e) / T.pps); placePlayhead(); };
      seek(ev);
      trkDrag = { kind: "seek", id: ev.pointerId, move: seek };
      return;
    }
    const clipNode = ev.target.closest(".tclip");
    if (clipNode) {
      ev.preventDefault();
      const c = T.clips.find(x => x.id === clipNode.dataset.clip); if (!c) return;
      if (T.sel !== c.id) { T.sel = c.id; T.selTrack = c.track; document.querySelectorAll(".tclip.sel").forEach(n => n.classList.remove("sel")); clipNode.classList.add("sel"); renderSelBar(); }
      const handle = ev.target.dataset.h || "move";
      clipNode.setPointerCapture(ev.pointerId);
      trkDrag = { kind: handle, id: ev.pointerId, c, x0: ev.clientX, y0: ev.clientY, orig: Object.assign({}, c), node: clipNode, moved: false, snapped: false };
      return;
    }
    const lane = ev.target.closest(".tlane");
    if (lane && !ev.target.closest(".addrow")) trkDrag = { kind: "tap", id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t: xIn(ev) / T.pps };
  });
  trkInner.addEventListener("pointermove", ev => {
    if (!trkDrag || ev.pointerId !== trkDrag.id) return;
    if (trkDrag.kind === "seek") { trkDrag.move(ev); return; }
    if (trkDrag.kind === "tap") return;
    const dx = (ev.clientX - trkDrag.x0) / T.pps, dy = ev.clientY - trkDrag.y0, c = trkDrag.c, o = trkDrag.orig;
    if (!trkDrag.moved && Math.abs(ev.clientX - trkDrag.x0) < 4 && Math.abs(dy) < 6) return;
    if (!trkDrag.moved) { trkDrag.moved = true; snapshot(); }
    const buf = trkAudio.get(c.audio), full = buf ? buf.duration : o.offset + o.dur;
    if (trkDrag.kind === "move") {
      c.start = snapT(o.start + dx);
      const ti = T.tracks.findIndex(t => t.id === o.track) + Math.round(dy / TRK_ROW);
      const nt = T.tracks[Math.max(0, Math.min(T.tracks.length - 1, ti))]; c.track = nt.id;
    } else if (trkDrag.kind === "hl") {
      let ns = snapT(o.start + dx); ns = Math.max(o.start - o.offset, Math.min(ns, o.start + o.dur - 0.02));
      c.offset = o.offset + (ns - o.start); c.dur = o.dur - (ns - o.start); c.start = ns;
      c.fadeIn = Math.min(c.fadeIn, c.dur / 2); c.fadeOut = Math.min(c.fadeOut, c.dur / 2);
    } else if (trkDrag.kind === "hr") {
      const ne = snapT(o.start + o.dur + dx);
      c.dur = Math.max(0.02, Math.min(ne - o.start, full - o.offset));
      c.fadeIn = Math.min(c.fadeIn, c.dur / 2); c.fadeOut = Math.min(c.fadeOut, c.dur / 2);
    } else if (trkDrag.kind === "hfi") c.fadeIn = Math.max(0, Math.min(c.dur - c.fadeOut, o.fadeIn + dx));
    else if (trkDrag.kind === "hfo") c.fadeOut = Math.max(0, Math.min(c.dur - c.fadeIn, o.fadeOut - dx));
    // cheap live update: re-place this clip only
    const t = trackOf(c), lane = trkInner.querySelector(`.trow[data-track="${c.track}"] .tlane`);
    const fresh = clipEl(c, t); fresh.classList.add("sel");
    try { trkDrag.node.releasePointerCapture(ev.pointerId); } catch (e) {}
    trkDrag.node.remove(); lane.appendChild(fresh); trkDrag.node = fresh;
    try { fresh.setPointerCapture(ev.pointerId); } catch (e) {}
    trkSay(trkDrag.kind === "move" ? "at " + fmtT(c.start) : trkDrag.kind === "hfi" ? "fade in " + c.fadeIn.toFixed(2) + "s" : trkDrag.kind === "hfo" ? "fade out " + c.fadeOut.toFixed(2) + "s" : "length " + c.dur.toFixed(2) + "s");
  });
  const trkEndDrag = ev => {
    if (!trkDrag || ev.pointerId !== trkDrag.id) return;
    const d = trkDrag; trkDrag = null;
    if (d.kind === "tap") {
      if (ev.type === "pointerup" && Math.abs(ev.clientX - d.x0) < 6 && Math.abs(ev.clientY - d.y0) < 6) {
        T.sel = null; T.playhead = Math.max(0, d.t); if (playing_t) { trkStop(true); playTracks(); } trkRender();
      }
      return;
    }
    if (d.kind === "seek") { if (playing_t && !trec.on) { trkStop(true); playTracks(); } return; }
    if (d.moved) { trkSave(); trkRender(); }
  };
  trkInner.addEventListener("pointerup", trkEndDrag);
  trkInner.addEventListener("pointercancel", trkEndDrag);

  // ---------- clip actions ----------
  const selClip = () => T.clips.find(x => x.id === T.sel);
  function splitAt() {
    const t = T.playhead;
    let targets = T.sel ? [selClip()] : T.clips.filter(c => c.track === T.selTrack);
    targets = targets.filter(c => c && t > c.start + 0.01 && t < clipEnd(c) - 0.01);
    if (!targets.length) { trkSay("Put the playhead over a clip to split it"); return; }
    snapshot();
    targets.forEach(c => {
      const cut = t - c.start;
      const b = Object.assign({}, c, { id: trkUid(), start: t, offset: c.offset + cut, dur: c.dur - cut, fadeIn: 0 });
      c.dur = cut; c.fadeOut = 0; T.clips.push(b);
    });
    trkSave(); trkRender(); trkSay("Split " + targets.length + " clip" + (targets.length > 1 ? "s" : ""));
  }
  function dupClip() {
    const c = selClip(); if (!c) { trkSay("Select a clip first"); return; }
    snapshot(); const n = Object.assign({}, c, { id: trkUid(), start: clipEnd(c) }); T.clips.push(n); T.sel = n.id;
    trkSave(); trkRender(); trkSay("Copied after the original");
  }
  let delArm = 0;
  function delSel() {
    const c = selClip();
    if (c) { snapshot(); T.clips = T.clips.filter(x => x !== c); T.sel = null; trkSave(); trkRender(); trkSay("Clip deleted · Undo brings it back"); dropUnusedAudio(); return; }
    const t = T.tracks.find(x => x.id === T.selTrack);
    if (!t) { trkSay("Select a clip, or tap a track's header to select the track"); return; }
    const btn = document.getElementById("trkDel");
    if (!delArm) { btn.textContent = "Delete track?"; delArm = setTimeout(() => { delArm = 0; btn.textContent = "Delete"; }, 2500); return; }
    clearTimeout(delArm); delArm = 0; btn.textContent = "Delete";
    snapshot(); T.clips = T.clips.filter(x => x.track !== t.id); T.tracks = T.tracks.filter(x => x !== t); T.selTrack = null;
    if (!T.tracks.length) newTrack(false);
    trkSave(); trkRender(); trkSay("Track deleted · Undo brings it back");
  }
  document.getElementById("trkSplit").addEventListener("click", splitAt);
  document.getElementById("trkDup").addEventListener("click", dupClip);
  document.getElementById("trkDel").addEventListener("click", delSel);
  document.getElementById("trkUndo").addEventListener("click", trkUndoFn);
  document.getElementById("trkAdd").addEventListener("click", () => { const t = newTrack(); if (t) { trkSave(); trkRender(); trkScroll.scrollTop = trkScroll.scrollHeight; trkSay(T.tracks.length + " tracks"); } });
  const snapBtn = document.getElementById("trkSnap");
  const paintSnap = () => { snapBtn.textContent = "Snap: " + ({ off: "Off", beat: "Beat", bar: "Bar" })[T.snap]; };
  snapBtn.addEventListener("click", () => { T.snap = T.snap === "beat" ? "bar" : T.snap === "bar" ? "off" : "beat"; paintSnap(); trkSave(); });
  const trkZoom = f => {
    const centre = (trkScroll.scrollLeft + trkScroll.clientWidth / 2 - TRK_HEAD) / T.pps;
    T.pps = Math.max(4, Math.min(600, T.pps * f)); trkSave(); trkRender();
    trkScroll.scrollLeft = Math.max(0, centre * T.pps + TRK_HEAD - trkScroll.clientWidth / 2);
  };
  document.getElementById("trkZoomIn").addEventListener("click", () => trkZoom(1.5));
  document.getElementById("trkZoomOut").addEventListener("click", () => trkZoom(1 / 1.5));
  trkScroll.addEventListener("wheel", ev => { if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); trkZoom(ev.deltaY < 0 ? 1.15 : 1 / 1.15); } }, { passive: false });
  const beatBtn = document.getElementById("trkWithBeat");
  const paintBeat = () => { beatBtn.setAttribute("aria-pressed", String(T.withBeat)); };
  beatBtn.addEventListener("click", () => { T.withBeat = !T.withBeat; paintBeat(); trkSave(); });
  const gainR = document.getElementById("trkGain");
  gainR.addEventListener("pointerdown", () => snapshot());
  gainR.addEventListener("input", () => {
    const c = selClip(); if (!c) return; c.gain = Math.pow(10, gainR.value / 20);
    document.getElementById("trkGainVal").textContent = gainR.value + " dB";
    const node = trkInner.querySelector(`.tclip[data-clip="${c.id}"] canvas`); if (node) drawWave(node, c, trackOf(c).color);
    trkSave();
  });
  document.getElementById("trkNorm").addEventListener("click", () => {
    const c = selClip(), buf = c && trkAudio.get(c.audio); if (!buf) return;
    let m = 0; const a = Math.floor(c.offset * buf.sampleRate), b = Math.min(buf.length, Math.floor((c.offset + c.dur) * buf.sampleRate));
    for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } }
    if (m < 1e-5) return; snapshot(); c.gain = 0.98 / m; trkSave(); trkRender(); trkSay("Normalized to -0.2 dB");
  });

  // ---------- import ----------
  const trkFile = document.getElementById("trkFile");
  document.getElementById("trkImport").addEventListener("click", () => trkFile.click());
  trkFile.addEventListener("change", async () => {
    start();
    const files = [...trkFile.files]; trkFile.value = "";
    if (!files.length) return;
    snapshot();
    let n = 0;
    // reuse an empty selected or first empty track for the first file, new tracks for the rest
    for (const f of files) {
      trkSay("Importing " + f.name + "…");
      try {
        const buf = await ctx.decodeAudioData(await f.arrayBuffer());
        const name = f.name.replace(/\.[^.]+$/, "");
        let t = T.tracks.find(x => x.id === T.selTrack && !T.clips.some(c => c.track === x.id));
        if (!t || n > 0) t = T.tracks.find(x => !T.clips.some(c => c.track === x.id) && !x._used);
        if (!t) t = newTrack(false, name);
        if (!t) break;
        t._used = true; if (/^Track \d+$/.test(t.name)) t.name = name.slice(0, 24);
        const id = addAudio(buf, name);
        T.clips.push({ id: trkUid(), track: t.id, audio: id, name, start: snapT(T.playhead), offset: 0, dur: buf.duration, gain: 1, fadeIn: 0, fadeOut: 0 });
        n++;
      } catch (e) { trkSay("Couldn't read " + f.name); }
    }
    T.tracks.forEach(t => delete t._used);
    trkSave(); trkRender(); if (n) trkSay("Imported " + n + " file" + (n > 1 ? "s" : ""));
  });

  // ---------- playback ----------
  let playing_t = false, playAt = 0, playFrom = 0, srcs = [], tnodes = new Map(), beatStarted = false;
  function liveMix() {
    tnodes.forEach((n, id) => { const t = T.tracks.find(x => x.id === id); if (!t) return; n.g.gain.setTargetAtTime(audible(t) ? t.vol : 0, ctx.currentTime, 0.02); n.p.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.02); });
  }
  function scheduleClips(ac, dest, from, at, nodesOut) {
    const out = [];
    T.tracks.forEach(t => {
      const g = ac.createGain(), p = ac.createStereoPanner();
      g.gain.value = audible(t) ? t.vol : 0; p.pan.value = t.pan; if (audible(t)) trkAutoSched(t, g.gain, from, at); g.connect(p).connect(dest);
      if (nodesOut) nodesOut.set(t.id, { g, p });
      T.clips.filter(c => c.track === t.id && clipEnd(c) > from).forEach(c => {
        const buf = trkAudio.get(c.audio); if (!buf) return;
        const skip = Math.max(0, from - c.start), when = at + Math.max(0, c.start - from), len = c.dur - skip;
        if (len <= 0) return;
        const s = ac.createBufferSource(); s.buffer = buf;
        const cg = ac.createGain(), G = cg.gain;
        const valAt = lt => { let f = c.gain; if (c.fadeIn > 0 && lt < c.fadeIn) f *= lt / c.fadeIn; if (c.fadeOut > 0 && lt > c.dur - c.fadeOut) f *= Math.max(0, (c.dur - lt) / c.fadeOut); return f; };
        G.setValueAtTime(valAt(skip), when);
        if (c.fadeIn > 0 && skip < c.fadeIn) G.linearRampToValueAtTime(c.gain, when + (c.fadeIn - skip));
        if (c.fadeOut > 0) {
          const fs = c.dur - c.fadeOut;
          if (skip < fs) G.setValueAtTime(c.gain, when + (fs - skip));
          G.linearRampToValueAtTime(0, when + len);
        }
        s.connect(cg).connect(g);
        s.start(when, c.offset + skip, len); out.push(s);
      });
    });
    return out;
  }
  function playTracks(recording) {
    start();
    if (playing_t) return;
    if (!recording && T.playhead >= projectEnd() - 0.05) { T.playhead = 0; placePlayhead(); trkScroll.scrollLeft = 0; }   // at the end: start over
    playFrom = T.playhead; playAt = ctx.currentTime + 0.08;
    tnodes = new Map();
    srcs = scheduleClips(ctx, B.trackBus, playFrom, playAt, tnodes);
    playing_t = true; paintPlay();
    if (T.withBeat && !playing) { startSeq(); beatStarted = true; }
    requestAnimationFrame(tick_t);
  }
  function trkStop(keepBeat) {
    if (!playing_t) return;
    playing_t = false;
    srcs.forEach(s => { try { s.stop(); } catch (e) {} }); srcs = [];
    tnodes.forEach(n => { try { n.p.disconnect(); } catch (e) {} }); tnodes = new Map();
    if (beatStarted && !keepBeat) { stopSeq(); beatStarted = false; }
    paintPlay();
  }
  function tick_t() {
    if (!playing_t) return;
    T.playhead = playFrom + Math.max(0, ctx.currentTime - playAt);
    placePlayhead();
    // follow the playhead
    const x = TRK_HEAD + T.playhead * T.pps;
    if (!trkEl.hidden && (x > trkScroll.scrollLeft + trkScroll.clientWidth - 30 || x < trkScroll.scrollLeft + TRK_HEAD)) trkScroll.scrollLeft = x - TRK_HEAD - 20;
    if (!trec.on && T.playhead > projectEnd() + 0.3) { trkStop(); T.playhead = playFrom; placePlayhead(); return; }   // back to where play started
    requestAnimationFrame(tick_t);
  }
  function paintPlay() {
    trkPlayBtn.textContent = playing_t ? "■" : "▶"; trkPlayBtn.setAttribute("aria-pressed", String(playing_t));
    const mp = document.getElementById("trkMiniPlay"); mp.textContent = playing_t ? "■" : "▶";
  }
  const togglePlay = () => { if (trec.on) { stopRec(); return; } playing_t ? trkStop() : playTracks(); };
  trkPlayBtn.addEventListener("click", togglePlay);
  document.getElementById("trkMiniPlay").addEventListener("click", togglePlay);
  document.getElementById("trkHome").addEventListener("click", () => { const p = playing_t; trkStop(true); T.playhead = 0; placePlayhead(); trkScroll.scrollLeft = 0; if (p) playTracks(); });

  // ---------- recording (overdub) ----------
  const trec = { on: false, node: null, mute: null, L: [], R: [], len: 0, mic: null, micNode: null, mL: [], mR: [], mlen: 0, at: 0, from: 0, targets: [] };
  // one take is held in memory as it records (and once more while it becomes a clip): past this a phone's
  // browser would run out of memory and lose the lot, so the take stops here and is kept
  const MAX_TRK_REC_SEC = (NB_BIG ? 60 : 10) * 60;
  const trecFull = () => { if (!trec.on || trec.full) return; trec.full = true; setTimeout(() => { stopRec(); trkSay("Recording stopped at " + nbMinSec(MAX_TRK_REC_SEC) + ", the longest one take can be. It's kept."); }, 0); };
  async function startRec() {
    start();
    if (trec.on) return;
    let targets = T.tracks.filter(t => t.arm);
    if (!targets.length) { snapshot(); const t = newTrack(false); if (!t) return; t.arm = true; targets = [t]; }
    const wantMic = targets.some(t => t.input === "mic");
    if (wantMic) {
      try {
        try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        trec.mic = stream; const src = ctx.createMediaStreamSource(stream), n = ctx.createScriptProcessor(4096, 2, 2), mute = ctx.createGain(); mute.gain.value = 0;
        n.onaudioprocess = ev => { if (!trec.on) return; const ib = ev.inputBuffer; trec.mL.push(new Float32Array(ib.getChannelData(0))); trec.mR.push(new Float32Array(ib.numberOfChannels > 1 ? ib.getChannelData(1) : ib.getChannelData(0))); trec.mlen += ib.length; if (trec.mlen >= ctx.sampleRate * MAX_TRK_REC_SEC) trecFull(); };
        src.connect(n); n.connect(mute).connect(ctx.destination); trec.micNode = { src, n, mute };
      } catch (e) {
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e2) {}
        trkSay("The microphone isn't available here (it works in the hosted version). Switch those tracks to NB.");
        return;
      }
    }
    const n = ctx.createScriptProcessor(4096, 2, 2), mute = ctx.createGain(); mute.gain.value = 0;
    n.onaudioprocess = ev => { if (!trec.on) return; const ib = ev.inputBuffer; trec.L.push(new Float32Array(ib.getChannelData(0))); trec.R.push(new Float32Array(ib.numberOfChannels > 1 ? ib.getChannelData(1) : ib.getChannelData(0))); trec.len += ib.length; if (trec.len >= ctx.sampleRate * MAX_TRK_REC_SEC) trecFull(); };
    B.betaOut.connect(n); n.connect(mute).connect(ctx.destination);
    Object.assign(trec, { node: n, mute, L: [], R: [], len: 0, mL: [], mR: [], mlen: 0, full: false, targets: targets.map(t => t.id), from: T.playhead });
    trec.on = true; trec.at = ctx.currentTime;
    trkRecBtn.classList.add("live"); trkMini.classList.add("rec");
    playTracks(true);
    // play along: shrink the editor so the keys, pads and beat are reachable
    minimize();
    trkSay("Recording… play Nate Bloom, then tap ■");
  }
  function joinChunks(chunks, len) { const o = new Float32Array(len); let p = 0; for (const c of chunks) { o.set(c.subarray(0, Math.min(c.length, len - p)), p); p += c.length; if (p >= len) break; } return o; }
  function stopRec() {
    if (!trec.on) return;
    trec.on = false; trkRecBtn.classList.remove("live"); trkMini.classList.remove("rec");
    try { B.betaOut.disconnect(trec.node); trec.node.disconnect(); trec.mute.disconnect(); } catch (e) {}
    if (trec.micNode) { try { trec.micNode.src.disconnect(); trec.micNode.n.disconnect(); trec.micNode.mute.disconnect(); } catch (e) {} trec.mic.getTracks().forEach(t => t.stop()); trec.micNode = null; trec.mic = null; try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {} }
    trkStop();
    T.playhead = trec.from; placePlayhead();
    // captured audio starts when recording began; line it up with the timeline and remove output latency
    const lat = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    const lead = Math.max(0, playAt - trec.at);            // audio captured before the timeline started moving
    const mk = (L, R, len, name, mic) => {
      // you play along to what you hear, which reaches you output-latency late; the mic adds its own input delay
      const skip = Math.min(len - 1, Math.floor((lead + lat + (mic ? 0.01 : 0)) * ctx.sampleRate));
      const n = len - skip; if (n < ctx.sampleRate * 0.15) return null;
      const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: ctx.sampleRate });
      // straight from the recorded chunks into the clip (no second full-length copy, which on a long take
      // could be what runs a phone out of memory), letting each chunk go once it's in
      [[L, buf.getChannelData(0)], [R, buf.getChannelData(1)]].forEach(([chunks, out]) => {
        let pos = 0;   // position in the recording
        for (let c = 0; c < chunks.length; c++) {
          const ch = chunks[c]; chunks[c] = null;
          const a = Math.max(0, skip - pos), b = Math.min(ch.length, len - pos);
          if (b > a) out.set(ch.subarray(a, b), pos + a - skip);
          pos += ch.length; if (pos >= len) break;
        }
      });
      return addAudio(buf, name);
    };
    snapshot();
    let made = 0, nbId = null, micId = null;
    trec.targets.forEach(tid => {
      const t = T.tracks.find(x => x.id === tid); if (!t) return;
      let id;
      if (t.input === "mic") { if (!micId && trec.mlen) micId = mk(trec.mL, trec.mR, trec.mlen, "Mic take", true); id = micId; }
      else { if (!nbId && trec.len) nbId = mk(trec.L, trec.R, trec.len, "Nate Bloom take", false); id = nbId; }
      if (!id) return;
      const buf = trkAudio.get(id);
      T.clips.push({ id: trkUid(), track: t.id, audio: id, name: t.input === "mic" ? "Mic take" : "NB take", start: trec.from, offset: 0, dur: buf.duration, gain: 1, fadeIn: 0, fadeOut: 0 });
      made++;
    });
    trec.L = trec.R = trec.mL = trec.mR = [];
    trkSave(); trkRender(); trkSay(made ? "Recorded " + made + " clip" + (made > 1 ? "s" : "") : "Take too short to keep");
  }
  trkRecBtn.addEventListener("click", () => (trec.on ? stopRec() : startRec()));
  document.getElementById("trkMiniRec").addEventListener("click", () => (trec.on ? stopRec() : startRec()));

  // ---------- mixdown ----------
  function wavOf(buf) {
    const n = buf.length, ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 4, true);
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, out = new Int16Array(ab, 44);
    for (let i = 0, o = 0; i < n; i++) { out[o++] = Math.max(-1, Math.min(1, L[i])) * 32767; out[o++] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    return ab;
  }
  async function saveWav(name, wav) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name + ".zip", data: zipOne(name + ".wav", new Uint8Array(wav)) }); trkSay("Saved " + name + ".zip · open it in Files to get the WAV"); }
      catch (e) { if (!(e && e.code === "declined")) trkSay(e && e.code === "too_large" ? "Too large to save here. Export a shorter section, or use the hosted version." : "Couldn't save here. Try again in a moment."); }
      return;
    }
    const file = new File([wav], name + ".wav", { type: "audio/wav" });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); trkSay("Saved " + file.name);
  }
  async function mixdown() {
    const end = projectEnd(); if (end <= 0) return null;
    const rate = (ctx && ctx.sampleRate) || 44100;
    const oc = new OfflineAudioContext(2, Math.ceil((end + 0.05) * rate), rate);
    scheduleClips(oc, oc.destination, 0, 0, null);
    return oc.startRendering();
  }
  document.getElementById("trkExport").addEventListener("click", async () => {
    if (!T.clips.length) { trkSay("Nothing to export yet"); return; }
    trkSay("Mixing down…");
    try {
      const buf = await mixdown(); let peak = 0;
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
      await saveWav(takeName() + "-tracks", wavOf(buf));
      if (peak > 1) trkSay("Exported, but the mix clips (peak " + (20 * Math.log10(peak)).toFixed(1) + " dB). Turn tracks down and export again.");
    } catch (e) { trkSay("Couldn't mix down: " + (e && e.message ? e.message : "unknown error")); }
  });
  document.getElementById("trkBounce").addEventListener("click", async () => {
    if (!T.clips.length) { trkSay("Nothing to bounce yet"); return; }
    trkSay("Bouncing…");
    try {
      const buf = await mixdown(); snapshot();
      const t = newTrack(false, "Bounce"); if (!t) return;
      const id = addAudio(buf, "Bounce");
      T.clips.push({ id: trkUid(), track: t.id, audio: id, name: "Bounce", start: 0, offset: 0, dur: buf.duration, gain: 1, fadeIn: 0, fadeOut: 0 });
      T.tracks.forEach(x => { if (x !== t) x.mute = true; });
      trkSave(); trkRender(); trkSay("Bounced to a new track; the others are muted");
    } catch (e) { trkSay("Couldn't bounce"); }
  });
  // a Nate Bloom ● Rec take can go straight onto a new track
  document.getElementById("takeToTracks").addEventListener("click", async () => {
    if (!take.done) return;
    const d = take.done, buf = new AudioBuffer({ length: d.len, numberOfChannels: 2, sampleRate: d.rate });
    const L = buf.getChannelData(0), R = buf.getChannelData(1); let o = 0;
    for (let c = 0; c < d.L.length; c++) { const l = d.L[c], r = d.R[c]; for (let i = 0; i < l.length && o < d.len; i++, o++) { L[o] = l[i] / 32767; R[o] = r[i] / 32767; } }
    const res = window.__gbAudio && __gbAudio([{ buf, name: "Take", start: 0 }], { open: true });
    takeInfo.textContent = res ? "Added to the Garage as a new track" : "Couldn't add it to the Garage";
  });

  // ---------- open / minimize ----------
  function openTracks() {
    start();
    trkEl.hidden = false; trkMini.hidden = true; document.body.classList.add("trk-open");
    trkLoad().then(() => { paintSnap(); paintBeat(); trkRender(); });
  }
  function minimize() { trkEl.hidden = true; document.body.classList.remove("trk-open"); trkMini.hidden = !betaOn; }
  function closeTracks() { minimize(); if (!playing_t && !trec.on) trkMini.hidden = true; }
  document.getElementById("betaTracksBtn").addEventListener("click", openTracks);
  document.getElementById("trkMiniOpen").addEventListener("click", openTracks);
  document.getElementById("trkDone").addEventListener("click", closeTracks);
  document.getElementById("trkMin").addEventListener("click", minimize);
  window.addEventListener("keydown", ev => {
    if (trkEl.hidden || ev.target.closest && ev.target.closest("input")) return;
    if (ev.key === " ") { ev.preventDefault(); togglePlay(); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); delSel(); }
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !ev.shiftKey) { ev.preventDefault(); trkUndoFn(); }
    else if (ev.key.toLowerCase() === "s" && !ev.ctrlKey && !ev.metaKey) splitAt();
  }, true);
  window.addEventListener("resize", () => { if (!trkEl.hidden) trkRender(); });
  onBeta(on => {
    if (!on) { if (trec.on) stopRec(); trkStop(); trkEl.hidden = true; trkMini.hidden = true; document.body.classList.remove("trk-open"); }
    document.getElementById("takeToTracks").hidden = !on;
  });
  document.getElementById("takeToTracks").hidden = !betaOn;


