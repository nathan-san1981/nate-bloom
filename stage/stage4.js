/* Nate Bloom Stage, stage 4 (160): the audio line from the tablet, Capture (a WAV on this Pixelbook with a marker per
   song, written as it records so nothing is lost), the Health panel, the click in these headphones, and the audience
   window (visuals only, no controls, on a second screen). The audio line is for recording and pictures, never for
   what you hear: it is decoded here muted. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const A = () => window.__stageAPI, X = () => window.__stage;
  const setT = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmtS = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + p(d.getMinutes()); };
  const songNow = () => { try { const d = window.__console && __console.doc, sl = d && d.setlist; return sl && sl.cur >= 0 && sl.songs[sl.cur] ? { i: sl.cur, name: sl.songs[sl.cur].name } : null; } catch (e) { return null; } };
  // ---------- the audio line ----------
  const ST = { stream: null, src: null, in: null, an: null, ctx: null, want: false, on: false, rate: 0, since: 0, td: null, lost: 0, backAt: 0 };
  function streamIn(stream) {
    const had = !!ST.stream; ST.stream = stream || null;
    const el = $("rtAudio"); if (el) { try { el.srcObject = ST.stream; el.muted = true; if (ST.stream) el.play().catch(() => {}); } catch (e) {} }
    if (ST.stream) { ST.since = performance.now(); if (had === false && CAP.on) mark("audio line back"); }
    else if (had && CAP.on) { ST.lost++; mark("audio line lost"); }
    wireStream(); paintStream();
  }
  function wireStream() {
    const a = A() && A().audio ? A().audio() : null; if (!a) return;
    if (!ST.in || ST.ctx !== a) { ST.in = a.createGain(); ST.an = a.createAnalyser(); ST.an.fftSize = 1024; ST.in.connect(ST.an); ST.ctx = a; if (CAP.node && CAP.ctx === a) ST.in.connect(CAP.node); }
    if (ST.src && (ST.src.mediaStream !== ST.stream || ST.src.context !== a)) { try { ST.src.disconnect(); } catch (e) {} ST.src = null; }
    if (ST.stream && !ST.src) { try { ST.src = a.createMediaStreamSource(ST.stream); ST.src.connect(ST.in); } catch (e) { ST.src = null; } }
  }
  function streamRms() { if (!ST.an) return 0; if (!ST.td) ST.td = new Float32Array(ST.an.fftSize); ST.an.getFloatTimeDomainData(ST.td); let s = 0; for (let i = 0; i < ST.td.length; i++) s += ST.td[i] * ST.td[i]; return Math.sqrt(s / ST.td.length); }
  function streamWant(on) { ST.want = !!on; const a = A(); if (a && a.up()) a.send("cmd", { do: "audio", on: ST.want }); paintStream(); }
  function onAudioData(d) { ST.on = !!d.on; ST.rate = d.rate || 0; paintStream(); }
  function paintStream() {
    const cb = $("cLine"); if (cb && cb.checked !== ST.want) cb.checked = ST.want;
    const a = A(), up = a && a.up();
    setT($("cLineSay"), !up ? "not linked" : !ST.want ? "off" : !ST.on ? "asked the tablet…" : !ST.stream ? "the tablet sends, nothing arrives yet (a direct line is needed: not through the internet)" : "on · " + (ST.rate ? ST.rate / 1000 + " kHz" : "") + " stereo Opus 192 kbit/s");
  }
  // ---------- Capture: a WAV written as it records ----------
  const CAP = { on: false, node: null, ctx: null, frames: 0, rate: 48000, t0: 0, w0: 0, chunks: [], bytes: 0, writable: null, name: "", markers: [], q: Promise.resolve(), backlog: 0, gaps: 0, drift: 0, mem: true, err: "", last: null, songSig: "", pong: 0, pingAt: 0, markN: 0 };
  const s16 = v => { v = v < -1 ? -1 : v > 1 ? 1 : v; return (v < 0 ? v * 32768 : v * 32767) | 0; };
  const str = (dv, o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  function wavHeader(rate, frames, tailBytes) {
    const data = frames * 4, dv = new DataView(new ArrayBuffer(44));
    str(dv, 0, "RIFF"); dv.setUint32(4, 36 + data + tailBytes, true); str(dv, 8, "WAVE"); str(dv, 12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(dv, 36, "data"); dv.setUint32(40, data, true);
    return new Uint8Array(dv.buffer);
  }
  function cueChunks(ms) {   // standard cue points with labels (Audacity, Reaper and the rest read them as markers)
    const n = ms.length; if (!n) return new Uint8Array(0);
    const cue = new DataView(new ArrayBuffer(12 + 24 * n)); str(cue, 0, "cue "); cue.setUint32(4, 4 + 24 * n, true); cue.setUint32(8, n, true);
    ms.forEach((m, i) => { const o = 12 + 24 * i; cue.setUint32(o, i + 1, true); cue.setUint32(o + 4, m.frame, true); str(cue, o + 8, "data"); cue.setUint32(o + 12, 0, true); cue.setUint32(o + 16, 0, true); cue.setUint32(o + 20, m.frame, true); });
    const enc = new TextEncoder(), labls = ms.map((m, i) => { const t = enc.encode(String(m.name || "mark").slice(0, 120)), len = 4 + t.length + 1, b = new Uint8Array(8 + len + (len % 2)), dv = new DataView(b.buffer); str(dv, 0, "labl"); dv.setUint32(4, len, true); dv.setUint32(8, i + 1, true); b.set(t, 12); return b; });
    const total = labls.reduce((s, x) => s + x.length, 0), list = new DataView(new ArrayBuffer(12)); str(list, 0, "LIST"); list.setUint32(4, 4 + total, true); str(list, 8, "adtl");
    const parts = [new Uint8Array(cue.buffer), new Uint8Array(list.buffer)].concat(labls), out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out;
  }
  function write(buf) { CAP.backlog++; CAP.q = CAP.q.then(() => CAP.writable.write(buf)).catch(e => { CAP.err = String(e && e.message || e); }).then(() => { CAP.backlog--; }); return CAP.q; }
  function onBlock(e) {
    const d = e.data; if (!d) return;
    if (d.pong) { CAP.pong = performance.now(); return; }
    if (!d.l || (!CAP.on && !d.last)) return;
    const n = d.l.length; if (n) { const pcm = new Int16Array(n * 2); for (let i = 0, j = 0; i < n; i++) { pcm[j++] = s16(d.l[i]); pcm[j++] = s16(d.r[i]); } CAP.frames += n; CAP.bytes += pcm.byteLength; if (CAP.writable) write(pcm); else CAP.chunks.push(pcm); }
  }
  function mark(name) { if (!CAP.on) return; CAP.markers.push({ frame: CAP.frames, name: String(name || "mark").slice(0, 120), at: Date.now() }); paintCap(); }
  function markSong(force) { const s = songNow(), sig = s ? s.i + ":" + s.name : ""; if (sig !== CAP.songSig || force) { CAP.songSig = sig; mark(s ? s.name : (force ? "start" : "no song")); } }
  async function capStart() {
    if (CAP.on) return;
    const a = A() && A().audio ? A().audio() : null; if (!a) { A().toast("Tap once anywhere first: the browser wants a touch before sound"); return; }
    streamWant(true);
    try {
      if (!CAP.node || CAP.ctx !== a) { await a.audioWorklet.addModule("capture-worklet.js?v=160"); CAP.node = new AudioWorkletNode(a, "nb-capture", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers" }); CAP.ctx = a; CAP.node.port.onmessage = onBlock; wireStream(); if (ST.in) ST.in.connect(CAP.node); }
    } catch (e) { A().toast("Can't record here: " + (e && e.message || e)); return; }
    const name = "Nate Bloom set " + stamp() + ".wav";
    CAP.writable = null; CAP.mem = true; CAP.err = "";
    if (window.showSaveFilePicker && !window.__nbNoPicker) {
      try { const h = await showSaveFilePicker({ suggestedName: name, types: [{ description: "WAV audio", accept: { "audio/wav": [".wav"] } }] }); CAP.writable = await h.createWritable(); CAP.mem = false; CAP.name = h.name || name; }
      catch (e) { CAP.writable = null; CAP.mem = true; }   // (cancelled or not allowed: kept in memory, offered as a download at Stop)
    }
    if (CAP.mem) CAP.name = name;
    CAP.rate = a.sampleRate; CAP.frames = 0; CAP.chunks = []; CAP.bytes = 0; CAP.markers = []; CAP.gaps = 0; CAP.drift = 0; CAP.backlog = 0; CAP.q = Promise.resolve(); CAP.songSig = ""; CAP.markN = 0;
    if (CAP.writable) await write(new Uint8Array(44));
    if (a.state !== "running") { try { await a.resume(); } catch (e) {} }
    CAP.on = true; CAP.t0 = a.currentTime; CAP.w0 = performance.now(); CAP.pong = performance.now(); CAP.node.port.postMessage("start");
    markSong(true); paintCap();
  }
  async function capStop() {
    if (!CAP.on) return; CAP.on = false; try { CAP.node.port.postMessage("stop"); } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
    const tail = cueChunks(CAP.markers), header = wavHeader(CAP.rate, CAP.frames, tail.byteLength);
    if (CAP.writable) {
      await write(tail); await CAP.q;
      try { await CAP.writable.write({ type: "write", position: 0, data: header }); await CAP.writable.close(); } catch (e) { CAP.err = String(e && e.message || e); }
      CAP.writable = null; A().toast("Saved " + CAP.name);
    } else if (CAP.frames) {
      const blob = new Blob([header].concat(CAP.chunks, [tail]), { type: "audio/wav" }), u = URL.createObjectURL(blob), el = document.createElement("a"); el.href = u; el.download = CAP.name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); CAP.chunks = [];
      A().toast("Downloading " + CAP.name);
    }
    CAP.last = { name: CAP.name, seconds: CAP.frames / CAP.rate, markers: CAP.markers.length, gaps: CAP.gaps, mem: CAP.mem, err: CAP.err };
    paintCap();
  }
  function capWatch() {   // once a second: the song marker, the drift between the worklet's frames and the wall clock, the worklet's pulse
    if (!CAP.on) return;
    markSong(false);
    const a = CAP.ctx, wall = (performance.now() - CAP.w0) / 1000, got = CAP.frames / CAP.rate, drift = wall - got;
    if (drift - CAP.drift > 0.5) { CAP.gaps++; mark("gap " + Math.round((drift - CAP.drift) * 1000) + " ms"); }
    CAP.drift = Math.max(CAP.drift, drift);
    if (a && a.state !== "running") { try { a.resume(); } catch (e) {} }
    if (performance.now() - CAP.pong > 4000 && performance.now() - CAP.pingAt > 4000) { CAP.pingAt = performance.now(); try { CAP.node.port.postMessage("ping"); } catch (e) {} }
    paintCap();
  }
  setInterval(capWatch, 1000);
  function paintCap() {
    const b = $("cRec"); if (!b) return;
    b.setAttribute("aria-pressed", String(CAP.on)); b.textContent = CAP.on ? "■ Stop" : "● Record audio"; b.classList.toggle("on", CAP.on); $("cMark").disabled = !CAP.on;
    const secs = CAP.frames / CAP.rate, mb = CAP.bytes / 1048576;
    setT($("cStat"), CAP.on ? "Recording " + fmtS(secs) + " · " + mb.toFixed(0) + " MB · " + CAP.markers.length + (CAP.markers.length === 1 ? " marker" : " markers") + " · " + (CAP.gaps ? CAP.gaps + " gap" + (CAP.gaps === 1 ? "" : "s") : "no gaps") + (CAP.mem ? " · kept in memory until Stop (no file was chosen)" : " · writing to " + CAP.name + (CAP.backlog > 20 ? " · the disk is " + CAP.backlog + " blocks behind" : "")) + (CAP.err ? " · " + CAP.err : "")
      : CAP.last ? "Last take: " + CAP.last.name + " · " + fmtS(CAP.last.seconds) + " · " + CAP.last.markers + " markers · " + (CAP.last.gaps ? CAP.last.gaps + " gaps" : "no gaps") + (CAP.last.err ? " · " + CAP.last.err : "") : "Nothing recorded yet. Record asks where to save the file; it's written as it goes, so a crash or a closed lid loses nothing before it.");
    const mk = $("cMarks"); if (mk) { const html = CAP.markers.slice(-8).map(m => `<span class="chip">${fmtS(m.frame / CAP.rate)} ${esc(m.name)}</span>`).join(" "); if (mk.__html !== html) { mk.__html = html; mk.innerHTML = html; } }
    const m = $("cMeter"); if (m) { const r = streamRms(); m.style.height = Math.min(100, Math.round(Math.sqrt(r) * 130)) + "%"; }
  }
  setInterval(() => { const m = $("cMeter"); if (m && ST.src) { const r = streamRms(); m.style.height = Math.min(100, Math.round(Math.sqrt(r) * 130)) + "%"; } }, 80);
  // ---------- the click in these headphones ----------
  const K = { on: false, vol: 0.6, acc: true, onlyPlay: true, last: null, bus: null, ctx: null };
  try { Object.assign(K, JSON.parse(localStorage.getItem("stage-click") || "{}"), { last: null, bus: null, ctx: null }); } catch (e) {}
  const kSave = () => { try { localStorage.setItem("stage-click", JSON.stringify({ on: K.on, vol: K.vol, acc: K.acc, onlyPlay: K.onlyPlay })); } catch (e) {} };
  function clickAt(a, when, accent) {
    if (!K.bus || K.ctx !== a) { K.bus = a.createGain(); K.bus.connect(a.destination); K.ctx = a; }
    K.bus.gain.value = K.vol * K.vol;
    const o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.value = accent ? 1500 : 1000;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(accent ? 1 : 0.7, when + 0.002); g.gain.exponentialRampToValueAtTime(0.001, when + (accent ? 0.05 : 0.03));
    o.connect(g).connect(K.bus); o.start(when); o.stop(when + 0.08);
  }
  let clickN = 0;
  function clickTick() {
    const a = A(); if (!K.on || !a || !a.up()) return;
    const S = X(), g = S && S.grid; if (!g || !g.src || g.perf0 == null || !(S.L && S.L.offset != null)) return;
    if (K.onlyPlay && !(S.st && S.st.on && Object.values(S.st.on).some(Boolean))) return;
    const ac = a.audio(); if (!ac) return;
    const beatMs = 4 * g.sd * 1000, now = a.tabNow(), horizon = now + 350;
    let n = Math.ceil((now + 15 - g.perf0) / beatMs);
    for (let t = g.perf0 + n * beatMs; t < horizon; t += beatMs, n++) {
      if (K.last != null && t <= K.last) continue; K.last = t;
      const when = a.ctxAt(a.fromTab(t)); if (when < ac.currentTime) continue;
      clickAt(ac, when, K.acc && n % 4 === 0); clickN++;
    }
  }
  setInterval(clickTick, 100);
  function paintClick() { const b = $("kOn"); if (!b) return; b.setAttribute("aria-pressed", String(K.on)); $("kVol").value = Math.round(K.vol * 100); setT($("kVolO"), Math.round(K.vol * 100) + "%"); $("kAcc").checked = K.acc; $("kOnlyPlay").checked = K.onlyPlay; }
  // ---------- the audience window ----------
  const AUDR = { ch: null, win: null, cap: false, songSig: "", mode: "" };
  const post = (t, d) => { if (AUDR.ch) { try { AUDR.ch.postMessage({ t, d }); } catch (e) {} } };
  function audOpen() {
    if (!AUDR.ch) AUDR.ch = new BroadcastChannel("nb-stage-audience");
    try { AUDR.win = window.open("audience.html?v=160", "nb-audience", "popup=1,width=1280,height=720"); } catch (e) { AUDR.win = null; }
    if (!AUDR.win) { A().toast("The browser blocked the window: allow pop-ups for this page"); return; }
    setTimeout(() => { post("mode", { id: AUDR.mode || localStorage.getItem("stage-vis") && JSON.parse(localStorage.getItem("stage-vis")) }); post("cap", { on: AUDR.cap }); audSong(true); }, 800);
    A().toast("Audience window open: drag it to the other screen and tap it for full screen");
  }
  function audSong(force) { const s = songNow(), sig = s ? s.i + ":" + s.name : ""; if (sig !== AUDR.songSig || force) { AUDR.songSig = sig; post("song", { name: s ? s.name : "" }); } }
  window.__audRelay = (t, d) => { if (!AUDR.ch) return; if (t === "mode") AUDR.mode = d && d.id; post(t, d); };
  setInterval(() => { if (!AUDR.ch) return; const a = A(); const b = a && a.beatNow ? a.beatNow() : null; post("beat", b ? { beat: b.beat, bpm: b.bpm, playing: true } : null); audSong(false); }, 250);
  // ---------- the Health panel ----------
  const kv = (box, rows) => { const html = rows.map(([k, v]) => `<div class="kvr"><span>${esc(k)}</span><b>${esc(v == null ? "—" : v)}</b></div>`).join(""); if (box.__html !== html) { box.__html = html; box.innerHTML = html; } };
  let stats = null, statsAt = 0, batt = null, fps = 0, frames = 0, fpsAt = performance.now();
  (function fpsLoop() { frames++; const now = performance.now(); if (now - fpsAt >= 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; } requestAnimationFrame(fpsLoop); })();
  try { if (navigator.getBattery) navigator.getBattery().then(b => { batt = b; }); } catch (e) {}
  async function healthPaint() {
    const S = X(); if (!S || S.view !== "vHealth") return;
    const d = window.__console && __console.doc, a = A();
    const r = d && d.rig || {}, h = d && d.health || {}, t = d && d.transport || {};
    kv($("hTab"), [["Build", r.build || "older than 159"], ["App", r.app ? "Android " + r.app : (r.android ? "Android" : "browser")], ["Sound goes to", r.out || "—"], ["Buffer", r.buffer || "—"], ["Latency", r.latencyMs != null ? r.latencyMs + " ms" : "—"], ["Dropouts (last minute)", h.dropouts != null ? h.dropouts : "—"], ["Tempo", t.tempo ? Math.round(t.tempo) + " bpm" : "—"], ["Playing", t.playing ? Object.keys(t.playing).filter(k => t.playing[k]).join(", ") || "nothing" : "—"], ["MiniLab · K.O. II", (r.minilab ? "MiniLab" : "no MiniLab") + " · " + (r.ko2 ? "K.O. II" : "no K.O. II")], ["Purist", r.purist || "—"]]);
    const L = S.L || {};
    kv($("hLink"), [["Line", S.mode === "direct" ? "direct (same Wi-Fi)" : S.mode === "relay" ? "through the internet (slower; no audio line)" : S.mode], ["Round trip", L.rtt != null ? L.rtt + " ms" : "—"], ["Clock offset", L.offset != null ? Math.round(L.offset) + " ms" : "—"], ["Brokers", S.brokers + " of " + S.of + " reachable"], ["State document", d ? "v" + d.ver + (__console.lastDoc ? " · " + Math.round((performance.now() - __console.lastDoc) / 1000) + " s ago" : "") : "none yet"], ["A change takes", __console && __console.rtt && __console.rtt.length ? Math.round(__console.rtt.reduce((x, y) => x + y, 0) / __console.rtt.length) + " ms" : "—"]]);
    if (performance.now() - statsAt > 2000 && S.L && S.L.stats) { statsAt = performance.now(); try { stats = await S.L.stats(); } catch (e) { stats = null; } }
    const ib = stats && stats.inbound;
    kv($("hAud"), [["Audio line", !ST.want ? "off" : ST.stream ? "on" : "asked for"], ["Arriving", ib ? (ib.bytes / 1048576).toFixed(1) + " MB · " + ib.packets + " packets · " + ib.lost + " lost · jitter " + ib.jitterMs + " ms" : "—"], ["Level here", ST.src ? Math.round(20 * Math.log10(Math.max(1e-4, streamRms()))) + " dB" : "—"], ["Line lost while recording", ST.lost + (ST.lost === 1 ? " time" : " times")], ["Recording", CAP.on ? fmtS(CAP.frames / CAP.rate) + " · " + CAP.markers.length + " markers · " + (CAP.gaps ? CAP.gaps + " gaps" : "no gaps") + (CAP.mem ? " · in memory" : " · to disk") : CAP.last ? "last: " + fmtS(CAP.last.seconds) + ", " + (CAP.last.gaps ? CAP.last.gaps + " gaps" : "no gaps") : "not recording"], ["Disk behind by", CAP.on && !CAP.mem ? CAP.backlog + " blocks" : "—"]]);
    const ac = window.__stageActx ? __stageActx() : null;
    kv($("hPb"), [["Frames a second", fps], ["Battery", batt ? Math.round(batt.level * 100) + "%" + (batt.charging ? " · charging" : "") : "—"], ["Audio here", ac ? ac.state + " · " + ac.sampleRate / 1000 + " kHz · " + Math.round((ac.baseLatency || 0) * 1000) + " ms" : "not started (tap Record or the band)"], ["Click", K.on ? "on · " + Math.round(K.vol * 100) + "%" + (K.onlyPlay ? " · while the tablet plays" : "") : "off"], ["Audience window", AUDR.win && !AUDR.win.closed ? "open" : "closed"], ["Screen", screen.width + "×" + screen.height + " · " + (document.fullscreenElement ? "full screen" : "windowed")]]);
    const notes = (h.notes || []).concat(CAP.err ? ["Recording: " + CAP.err] : []);
    setT($("hNotes"), notes.length ? notes.join("  ·  ") : "nothing");
  }
  setInterval(healthPaint, 1000);
  // ---------- wiring ----------
  function wire() {
    $("cRec").addEventListener("click", () => { if (CAP.on) capStop(); else capStart(); });
    $("cMark").addEventListener("click", () => mark("mark " + (++CAP.markN)));
    $("cLine").addEventListener("change", e => streamWant(e.target.checked));
    $("kOn").addEventListener("click", () => { K.on = !K.on; K.last = null; if (K.on) { const a = A(); if (a && a.audio) a.audio(); } kSave(); paintClick(); });
    $("kVol").addEventListener("input", e => { K.vol = +e.target.value / 100; kSave(); paintClick(); });
    $("kAcc").addEventListener("change", e => { K.acc = e.target.checked; kSave(); });
    $("kOnlyPlay").addEventListener("change", e => { K.onlyPlay = e.target.checked; kSave(); });
    $("visAud").addEventListener("click", audOpen);
    try { new MutationObserver(() => { const on = $("visCapBtn").getAttribute("aria-pressed") === "true"; if (on !== AUDR.cap) { AUDR.cap = on; post("cap", { on }); } }).observe($("visCapBtn"), { attributes: true, attributeFilter: ["aria-pressed"] }); } catch (e) {}
    paintClick(); paintCap(); paintStream();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  window.__stage4 = { ST, CAP, K, AUDR, streamIn, streamWant, onAudioData, capStart, capStop, mark, wavHeader, cueChunks, clickTick, get clickN() { return clickN; }, healthPaint, audOpen };
})();
