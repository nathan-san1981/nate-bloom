/* Nate Bloom Stage: the Pixelbook's side. A monitor of everything the tablet is doing, extra hands for it (loops, the
   band, ▶, the set list, an XY pad), music-driven visuals, an editor (set list with song notes, the Rhythm pattern, pad
   kits), the band and a backing track played from here in time with the tablet, and the whole set kept as MIDI.
   Nothing on the tablet depends on this page. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const setT = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const setA = (el, a, v) => { if (el && el.getAttribute(a) !== v) el.setAttribute(a, v); };
  const q = new URLSearchParams(location.search);
  let toastT = 0; const toast = m => { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); };
  const NN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const X = { L: null, mode: "off", brokers: 0, of: 0, st: null, stAt: 0, grid: null, band: null, lv: null, setlist: null, rhythm: null, kits: null, here: false, view: "vMon", dirty: true };
  window.__stage = X;
  // ---------- clocks: the tablet's performance.now() ↔ ours ↔ our audio clock ----------
  const synced = () => !!(X.L && X.L.offset != null);
  const tabNow = () => performance.now() + (X.L && X.L.offset != null ? X.L.offset : 0);
  const fromTab = t => t - (X.L && X.L.offset != null ? X.L.offset : 0);
  const up = () => X.mode === "direct" || X.mode === "relay";
  // ---------- audio (made on the first tap: Chrome wants a gesture) ----------
  let actx = null, master = null, bandBus = null, trackBus = null, band = null;
  function audio() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
      master = actx.createGain(); master.connect(actx.destination);
      bandBus = actx.createGain(); bandBus.gain.value = +$("bLvl").value; bandBus.connect(master);
      trackBus = actx.createGain(); trackBus.gain.value = +$("tLvl").value; trackBus.connect(master);
      if (window.NBBand) { try { band = NBBand.create(actx, bandBus); } catch (e) { console.error(e); } }
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function ctxAt(sp) {   // our audio clock's time that's heard at our performance.now() time sp
    try { const ts = actx.getOutputTimestamp && actx.getOutputTimestamp(); if (ts && ts.performanceTime > 0) return ts.contextTime + (sp - ts.performanceTime) / 1000; } catch (e) {}
    return actx.currentTime + (sp - performance.now()) / 1000 - ((actx.baseLatency || 0) + (actx.outputLatency || 0));
  }
  // ---------- the link ----------
  function linkStart() {
    if (X.L) { X.L.close(); X.L = null; }
    const code = ls.get("stage-code", "");
    X.mode = "off"; paintConn();
    if (!window.NBLink || !NBLink.normCode(code)) { openPair(); return; }
    const o = { role: "stage", code, onMessage: onMsg, onState: s => {
      const was = X.mode; X.mode = s.mode; X.brokers = s.brokers; X.of = s.of; paintConn();
      if (up() && was !== s.mode) { X.L.send("hi", { v: 1 }); setTimeout(() => { pull("setlist"); pull("rhythm"); pull("kits"); if (X.here) X.L.send("bandHere", { on: true }); }, 300); }
      midiAuto(); } };
    if (q.get("nbbroker")) Object.assign(o, { brokers: q.get("nbbroker").split(","), iceServers: [], gatherMs: 800, helloMs: 2000, directWaitMs: 3000 });
    if (q.get("nbrtc") === "0") o.rtc = false;
    X.L = NBLink.create(o);
  }
  const send = (t, d, lossy) => !!(X.L && X.L.send(t, d, lossy ? { lossy: true } : null));
  const cmd = d => { if (!up()) { toast("Not linked to the tablet"); return false; } if (X.st && X.st.ctl === false) { toast("Control from here is switched off on the tablet (Gear)"); return false; } return send("cmd", d); };
  const pull = kind => send("pull", { kind });
  function paintConn() {
    const c = $("conn"), m = X.mode, code = ls.get("stage-code", "");
    let txt, cls;
    if (!code) { txt = "Not paired: tap to pair"; cls = "bad"; }
    else if (m === "direct") { txt = "Tablet · direct" + (X.L && X.L.rtt != null ? " · " + X.L.rtt + " ms" : ""); cls = "direct"; }
    else if (m === "relay") { txt = "Tablet · through the internet (slower)"; cls = "relay"; }
    else if (m === "connecting") { txt = "Found the tablet: connecting…"; cls = "connecting"; }
    else if (X.L && X.of && !X.brokers) { txt = "Can't reach the internet"; cls = "bad"; }
    else { txt = "Looking for the tablet (" + code + ")"; cls = "look"; }
    c.className = "conn " + cls; setT(c.querySelector("span"), txt);
    const w = $("wait"), show = !up() || !X.st;
    w.hidden = !show || X.view === "vEdit" || X.view === "vMidi" || X.view === "vBand";
    if (show) {
      setT($("waitH"), !code ? "Pair with the tablet" : m === "connecting" ? "Found the tablet: connecting…" : up() ? "Connected: waiting for the first update…" : X.L && X.of && !X.brokers ? "Can't reach the internet" : "Waiting for the tablet");
      setT($("waitP"), !code ? "Tap the box at the top left and type the code from the tablet (Live → Gear → Pixelbook)." : X.L && X.of && !X.brokers ? "The two find each other over the internet: join Wi-Fi or the iPhone's hotspot." : "In Nate Bloom on the tablet: Live → Gear (the No sync / clock button) → Pixelbook → Turn on. Code here: " + code + ".");
    }
  }
  setInterval(paintConn, 2000);
  // ---------- pairing ----------
  function openPair() { $("pair").hidden = false; const i = $("pairCode"); i.value = ls.get("stage-code", ""); i.classList.remove("bad"); setTimeout(() => i.focus(), 30); setT($("pairMore"), ls.get("stage-code", "") ? "Paired with " + ls.get("stage-code", "") + ". A new code from the tablet goes here." : ""); }
  $("conn").addEventListener("click", openPair);
  $("pairCancel").addEventListener("click", () => { $("pair").hidden = true; });
  $("pairCode").addEventListener("input", e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); e.target.value = v.length > 4 ? v.slice(0, 4) + "-" + v.slice(4, 8) : v; e.target.classList.remove("bad"); });
  $("pairCode").addEventListener("keydown", e => { if (e.key === "Enter") $("pairGo").click(); if (e.key === "Escape") $("pairCancel").click(); });
  $("pairGo").addEventListener("click", () => {
    const c = NBLink.normCode($("pairCode").value); if (!c) { $("pairCode").classList.add("bad"); toast("A code is 8 letters and numbers, like ABCD-EFGH"); return; }
    ls.set("stage-code", c); $("pair").hidden = true; X.st = null; linkStart(); toast("Looking for the tablet…");
  });
  // ---------- what comes in ----------
  function onMsg(t, d) {
    if (t === "st") { X.st = d; X.stAt = performance.now(); X.dirty = true; midiState(d); if (!$("wait").hidden) paintConn(); }
    else if (t === "grid") X.grid = d;
    else if (t === "band") { const was = X.band; X.band = d; if (band) band.set({ style: d.style, bass: d.bass, bassLvl: d.bassLvl, drumLvl: d.drumLvl, chord: d.chord }); if (vis && d.chord && (!was || !was.chord || was.chord.root !== d.chord.root || was.chord.q !== d.chord.q)) vis.chord(d.chord.root, d.chord.q); }
    else if (t === "lv") { X.lv = d; paintLevel(d); if (vis) { vis.level(d.r, d.p); if (d.s) vis.spectrum(d.s); } }
    else if (t === "ev") (d || []).forEach(onEv);
    else if (t === "data") onData(d);
    else if (t === "ack") { toast(d.msg || (d.ok ? "Done" : "Not done")); edStat(d.msg, d.ok); }
  }
  const ROLE_VIS = { kick: "kick", boom: "kick", snare: "snare", clap: "snare", rim: "snare", ch: "hat", oh: "hat", ride: "hat", cym: "hat", shaker: "hat" };
  const later = (tp, f) => { const d = fromTab(tp) - performance.now(); if (d > 5) setTimeout(f, Math.min(d, 2000)); else f(); };
  function onEv(e) {
    midiEv(e);
    const k = e[0];
    if (k === "n") { if (vis) later(e[1], () => vis.note(e[2], e[3] / 127, e[4] === "pd" ? 1 : 0)); }
    else if (k === "f") { if (vis && vis.noteOff) later(e[1], () => vis.noteOff(e[2])); }
    else if (k === "p" || k === "P" || k === "r" || k === "R") {
      if (vis) later(e[1], () => vis.hit(ROLE_VIS[e[4]] || "other", e[3]));
      if (k === "p" || k === "r") later(e[1], () => flashPad(k, e[2]));
    }
  }
  // ---------- views ----------
  function setView(v) {
    X.view = v; ls.set("stage-view", v);
    document.querySelectorAll(".tabs button").forEach(b => setA(b, "aria-selected", String(b.dataset.v === v)));
    document.querySelectorAll(".view").forEach(s => { s.hidden = s.id !== v; });
    if (v === "vVis") visOn(); else visOff();
    if (v === "vEdit") edPaint();
    if (v === "vMidi") midiPaint();
    X.dirty = true; paintConn();
  }
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setView(b.dataset.v)));
  $("fsBtn").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
  // ---------- the monitor ----------
  const KN = [], FD = [], PD = [];
  {
    const kg = $("mKnobs");
    for (let i = 0; i < 8; i++) { const d = document.createElement("div"); d.className = "kn"; d.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="#272236" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="75 100" transform="rotate(135 50 50)"/><circle class="v" cx="50" cy="50" r="38" fill="none" stroke="#c4a3ff" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(135 50 50)"/><circle cx="50" cy="50" r="24" fill="#241f31" stroke="#3b3450" stroke-width="2"/><line class="t" x1="50" y1="50" x2="50" y2="31" stroke="#ece7f7" stroke-width="5" stroke-linecap="round"/></svg><b>–</b><span></span><em>${i + 1}</em>`; kg.appendChild(d); KN.push(d); }
    kg.appendChild(document.createElement("i"));
    for (let i = 0; i < 4; i++) { const d = document.createElement("div"); d.className = "fd"; d.innerHTML = `<div class="rail"><u></u></div><b>–</b><span></span>`; kg.appendChild(d); FD.push(d); }
    const pg = $("mPads"), order = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
    order.forEach(i => { const d = document.createElement("div"); d.className = "pd"; d.innerHTML = `<em>${i + 1}</em><span></span>`; pg.appendChild(d); PD[i] = d; });
    const lg = $("mLoops"); for (let k = 0; k < 4; k++) { const d = document.createElement("div"); d.className = "loop"; d.innerHTML = `<span>LOOP ${k + 1}</span><b>empty</b>`; lg.appendChild(d); }
  }
  function flashPad(kind, i) {
    const s = X.st; if (!s) return;
    const set = s.pads.name || "";
    let idx = -1;
    if (kind === "p" && /^Beat Pads ([A-D])/.test(set)) { const b = "ABCD".indexOf(set.match(/^Beat Pads ([A-D])/)[1]); if (Math.floor(i / 16) === b) idx = i % 16; }
    if (kind === "r" && set === "Rhythm") idx = i;
    const d = PD[idx]; if (!d) return; d.classList.add("hit"); setTimeout(() => d.classList.remove("hit"), 90);
  }
  const PLAYN = { seq: "Seq", rc: "Rhythm", bp: "Pads" };
  function syncLabel(g) { const L = g.ko ? { lead: "K.O. II follows", follow: "K.O. II leads", off: "No sync" } : { lead: "Clock out", follow: "Clock in", off: "No sync" }; return L[g.sync] || "No sync"; }
  function paintMon() {
    const s = X.st; if (!s) return;
    const playingNow = s.on[s.play], anyOn = s.on.seq || s.on.rc || s.on.bp;
    setT($("mBpm").firstChild, s.bpm + " ");
    $("mPlay").innerHTML = `<span class="pill${playingNow ? " on" : ""}">${playingNow ? "▶" : "■"} ${PLAYN[s.play]}</span>` + Object.keys(PLAYN).filter(k => k !== s.play && s.on[k]).map(k => `<span class="pill on">▶ ${PLAYN[k]}</span>`).join("") +
      (s.bpRec ? `<span class="pill rec">● ${s.bpRec === "count" ? "Count-in" : "Looping"}</span>` : "") + (s.rec != null ? `<span class="pill rec">● Rec ${Math.floor(s.rec / 60)}:${String(s.rec % 60).padStart(2, "0")}</span>` : "") + (!s.live ? `<span class="pill warn">Live closed on the tablet</span>` : "");
    setT($("mSongLab"), s.song.n ? (s.song.cur >= 0 ? "Song " + (s.song.cur + 1) + " of " + s.song.n : "Set list · " + s.song.n + " songs") : "Set list");
    setT($("mSong"), s.song.name || (s.song.n ? "Pick a song" : "No songs saved"));
    setT($("mNext"), s.song.next ? (s.song.pend ? "Next bar → " : "Next: ") + s.song.next : "");
    setT($("mNotes"), s.song.notes || "");
    const g = s.gear;
    $("mGear").innerHTML = `<div class="lab">Gear</div>
      <div class="gr"><i class="${g.ml ? "on" : ""}"></i>MiniLab ${g.ml ? "connected" : "not connected"}</div>
      <div class="gr"><i class="${g.ko ? "on" : ""}"></i>${g.ko ? "K.O. II on MIDI" : "No K.O. II on MIDI"} · ${esc(syncLabel(g))}</div>
      <div class="gr"><i class="${s.drops ? "bad" : s.drops === 0 ? "on" : ""}"></i>${s.drops == null ? "Dropouts not reported" : s.drops ? "Dropped out " + s.drops + "× in the last minute" : "No dropouts"}</div>
      <div class="gr"><i class="${s.buf === "steady" ? "warn" : "on"}"></i>Buffer ${s.buf === "steady" ? "Steady" : "Fast"}${s.lat != null ? " · " + s.lat + " ms key to sound" : ""}</div>
      <div class="gr"><i class="${s.fx ? "on" : "warn"}"></i>Effects ${s.fx ? "on" : "off"}</div>
      <div class="gr"><i class="${X.mode === "direct" ? "on" : "warn"}"></i>Link ${X.mode === "direct" ? "direct" + (X.L && X.L.rtt != null ? ", " + X.L.rtt + " ms round trip" : "") : "through the internet"}</div>`;
    setT($("mSnd"), s.sound.name || "–"); setT($("mSub"), s.sound.sub || "");
    $("mLayers").innerHTML = s.layers.length > 1 || (s.layers[0] && s.layers[0].a) ? s.layers.map(l => `<span class="chip${l.a ? " arp" : ""}">${esc(l.n)}</span>`).join("") : "";
    $("mHA").innerHTML = `<span class="pill${s.hold ? " on" : ""}">Hold ${s.hold ? "on" : "off"}</span><span class="pill${s.arp.on ? " on" : ""}">Arp ${s.arp.on ? "on · " + s.arp.oct + " oct" : "off"}</span>`;
    $("mHeld").innerHTML = s.held.length ? esc(s.held.join(" ")) + (s.jam && s.jam.band.on ? `<small>${esc(s.jam.band.chord)}</small>` : "") : "";
    const lg = $("mLoops").children;
    s.jam.loops.forEach((l, k) => { const d = lg[k]; const cls = "loop" + (l.bars ? " has" : "") + (l.on ? " on" : "") + (l.rec ? " " + l.rec : ""); if (d.className !== cls) d.className = cls; setT(d.querySelector("b"), l.rec === "rec" ? "● recording" : l.rec === "ready" ? "ready…" : !l.bars ? "empty" : l.on ? "♫ " + l.bars + (l.bars === 1 ? " bar" : " bars") : "stopped"); });
    const b = s.jam.band; setT($("mChord"), b.chord);
    $("mBand").innerHTML = `<span class="pill${b.on ? " on" : ""}">Band ${b.on ? "on" : "off"} · ${esc(b.name)}</span> <span class="pill${b.where === "pixelbook" ? " warn" : ""}">${b.where === "pixelbook" ? "playing on the Pixelbook" : "on the tablet"}</span>`;
    setT($("mKp"), s.kp.name + " page");
    s.kp.k.forEach((k, i) => { const d = KN[i]; if (!d) return; const v = k[2] == null ? 0 : k[2]; d.querySelector(".v").setAttribute("stroke-dasharray", (v * 75).toFixed(1) + " 100"); d.querySelector(".t").setAttribute("transform", `rotate(${-135 + v * 270} 50 50)`); setT(d.querySelector("b"), k[1] || "–"); setT(d.querySelector("span"), k[0] || ""); });
    s.kp.f.forEach((f, i) => { const d = FD[i]; if (!d) return; d.querySelector("u").style.height = ((f[2] || 0) * 100) + "%"; setT(d.querySelector("b"), f[1] || "–"); setT(d.querySelector("span"), "F" + (i + 1) + " " + (f[0] || "")); });
    setT($("mPs"), s.pads.name); s.pads.n.forEach((n, i) => { if (PD[i]) setT(PD[i].querySelector("span"), n); });
    setT($("mLat"), s.lat != null ? "Key to sound on the tablet: " + s.lat + " ms" : "");
    // hands share the same snapshot
    paintHands();
  }
  function paintLevel(d) {
    $("meterU").style.height = Math.min(100, Math.sqrt(d.p) * 100) + "%";
    if (X.view !== "vMon" || !d.s) return;
    const c = $("mSpec"), w = c.clientWidth | 0; if (c.width !== w) c.width = w;
    const g = c.getContext("2d"), n = d.s.length, bw = w / n; g.clearRect(0, 0, w, c.height);
    d.s.forEach((v, i) => { const h = v * (c.height - 4); const gr = g.createLinearGradient(0, c.height, 0, 0); gr.addColorStop(0, "#7fd6c2"); gr.addColorStop(1, "#c4a3ff"); g.fillStyle = gr; g.fillRect(i * bw + 2, c.height - h, bw - 4, h); });
  }
  function beatNow() {   // where the tablet's grid is now, from the synced clock (null when nothing plays)
    const g = X.grid; if (!g || !g.src || g.perf0 == null || !synced()) return null;
    const steps = (tabNow() - g.perf0) / (g.sd * 1000); return { steps, beat: steps / 4, bpm: g.bpm };
  }
  function frame() {
    const b = beatNow(), bar = $("mBar");
    if (X.view === "vMon") {
      if (b && b.steps >= 0) { const bn = Math.floor(b.steps / 16) + 1, bt = Math.floor(b.steps / 4) % 4 + 1; setT(bar.firstChild, String(bn)); setT(bar.lastChild, String(bt)); [...$("mBeats").children].forEach((d, i) => { const on = i + 1 === bt; d.classList.toggle("on", on); d.classList.toggle("one", on && i === 0); }); }
      else { setT(bar.firstChild, "–"); setT(bar.lastChild, "–"); [...$("mBeats").children].forEach(d => d.classList.remove("on", "one")); }
    }
    if (X.view === "vVis" && !$("visCap").hidden) { const s = X.st; setT($("visCap").querySelector("b"), s ? s.song.name || s.sound.name : ""); setT($("visCap").querySelector("span"), b && b.steps >= 0 ? "bar " + (Math.floor(b.steps / 16) + 1) + " · " + (s ? s.bpm + " bpm" : "") : ""); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setInterval(() => { if (X.dirty && X.st && (X.view === "vMon" || X.view === "vHands")) { X.dirty = false; try { paintMon(); } catch (e) { console.error(e); } } }, 200);
  // ---------- hands ----------
  const STY = [["house", "House"], ["pop", "Pop"], ["funk", "Funk"], ["hiphop", "Hip-hop"], ["lofi", "Lo-fi"], ["rock", "Rock"], ["latin", "Latin"], ["techno", "Techno"], ["trap", "Trap"]];
  {
    const hl = $("hLoops");
    for (let k = 0; k < 4; k++) {
      const b = document.createElement("button"); b.className = "hb"; b.id = "hL" + (k + 1); b.innerHTML = `<span>LOOP ${k + 1}</span><b>empty</b><kbd>${k + 1}</kbd><i class="hold"></i>`; hl.appendChild(b);
      let t0 = 0, held = false, raf = 0;
      const bar = b.querySelector(".hold");
      const grow = () => { const f = Math.min(1, (performance.now() - t0) / 800); bar.style.width = f * 100 + "%"; if (f >= 1 && !held) { held = true; cmd({ do: "loopClear", k }); toast("Loop " + (k + 1) + " cleared"); } else if (!held) raf = requestAnimationFrame(grow); };
      b.addEventListener("pointerdown", e => { t0 = performance.now(); held = false; raf = requestAnimationFrame(grow); });
      const end = tapIt => { cancelAnimationFrame(raf); bar.style.width = "0"; if (tapIt && !held && t0) cmd({ do: "loop", k }); t0 = 0; };
      b.addEventListener("pointerup", () => end(true)); b.addEventListener("pointerleave", () => end(false)); b.addEventListener("pointercancel", () => end(false));
      b.addEventListener("keydown", e => { if (e.key === "Enter") cmd({ do: "loop", k }); });
    }
    const hs = $("hStyles"); STY.forEach(([id, n]) => { const b = document.createElement("button"); b.dataset.s = id; b.textContent = n; b.addEventListener("click", () => cmd({ do: "style", id })); hs.appendChild(b); });
    $("hBand").addEventListener("click", () => cmd({ do: "band" }));
    $("hGo").addEventListener("click", () => cmd({ do: "play" }));
    $("hHold").addEventListener("click", () => cmd({ do: "hold" }));
    $("hArp").addEventListener("click", () => cmd({ do: "arp" }));
    $("hSlow").addEventListener("click", () => cmd({ do: "tempo", d: -1 }));
    $("hFast").addEventListener("click", () => cmd({ do: "tempo", d: 1 }));
    $("hStop").addEventListener("click", () => cmd({ do: "stopAll" }));
    $("hPrev").addEventListener("click", () => cmd({ do: "song", d: -1 }));
    $("hNextB").addEventListener("click", () => cmd({ do: "song", d: 1 }));
    $("hWhat").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { if (X.st && X.st.play !== b.dataset.w) cmd({ do: "play", what: b.dataset.w }); }));
  }
  function paintHands() {
    const s = X.st; if (!s) return;
    s.jam.loops.forEach((l, k) => { const b = $("hL" + (k + 1)); const cls = "hb" + (l.bars ? " has" : "") + (l.on ? " on" : "") + (l.rec ? " " + l.rec : ""); if (b.className !== cls) b.className = cls; setT(b.querySelector("b"), l.rec === "rec" ? "● Stop" : l.rec === "ready" ? "Ready…" : !l.bars ? "● Rec" : l.on ? "♫ " + l.bars + (l.bars === 1 ? " bar" : " bars") : "▶ Play"); });
    const bd = s.jam.band; $("hBand").classList.toggle("pressed", bd.on); setT($("hBand").querySelector("b"), bd.on ? bd.chord : "Off"); setT($("hBand").querySelector("span"), bd.on ? "Band · " + bd.name : "Band");
    $("hStyles").querySelectorAll("button").forEach(b => setA(b, "aria-pressed", String(b.dataset.s === bd.style)));
    const now = s.on[s.play]; setT($("hGo").querySelector("b"), now ? "■" : "▶"); $("hGo").classList.toggle("pressed", now); setT($("hGoWhat"), PLAYN[s.play]);
    $("hHold").classList.toggle("pressed", s.hold); $("hArp").classList.toggle("pressed", s.arp.on); setT($("hBpm"), s.bpm + " bpm");
    $("hWhat").querySelectorAll("button").forEach(b => setA(b, "aria-pressed", String(b.dataset.w === s.play)));
    setT($("hSongLab"), s.song.n ? (s.song.cur >= 0 ? "Song " + (s.song.cur + 1) + " of " + s.song.n : s.song.n + " songs") : "Set list"); setT($("hSong"), s.song.name || (s.song.n ? "Pick a song" : "No songs saved")); setT($("hNext"), s.song.next ? "Next: " + s.song.next : "");
  }
  // the XY pad: the filter across, Space up; let go and both go back
  {
    const xy = $("xy"), dot = xy.querySelector(".dot"); let on = false, lastSent = 0, pend = null, tmr = 0;
    const at = e => { const r = xy.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)), px: e.clientX - r.left, py: e.clientY - r.top }; };
    const flush = () => { tmr = 0; if (!pend) return; lastSent = performance.now(); cmd(pend); pend = null; };
    const go = (p, onNow) => { dot.style.left = p.px + "px"; dot.style.top = p.py + "px"; pend = { do: "xy", x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, on: onNow }; const gap = X.mode === "direct" ? 35 : 160, wait = gap - (performance.now() - lastSent); if (!onNow || wait <= 0) { clearTimeout(tmr); flush(); } else if (!tmr) tmr = setTimeout(flush, wait); };
    xy.addEventListener("pointerdown", e => { if (!up()) { toast("Not linked to the tablet"); return; } xy.setPointerCapture(e.pointerId); on = true; xy.classList.add("on"); go(at(e), true); });
    xy.addEventListener("pointermove", e => { if (on) go(at(e), true); });
    const end = e => { if (!on) return; on = false; xy.classList.remove("on"); clearTimeout(tmr); tmr = 0; pend = null; cmd({ do: "xy", x: 0, y: 0, on: false }); };
    xy.addEventListener("pointerup", end); xy.addEventListener("pointercancel", end); xy.addEventListener("lostpointercapture", end);
  }
  // keys on the Pixelbook (not while typing, and not in the editor where the grid has its own)
  document.addEventListener("keydown", e => {
    const t = e.target; if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    if (e.ctrlKey || e.metaKey || e.altKey || !$("pair").hidden) return;
    if (X.view === "vEdit") return;
    const k = e.key, low = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    if (["1", "2", "3", "4"].includes(k)) { if (!e.repeat) cmd({ do: "loop", k: +k - 1 }); }
    else if (low === "b") { if (!e.repeat) cmd({ do: "band" }); }
    else if (k === " ") { if (!e.repeat) cmd({ do: "play" }); }
    else if (low === "h") { if (!e.repeat) cmd({ do: "hold" }); }
    else if (low === "a") { if (!e.repeat) cmd({ do: "arp" }); }
    else if (k === "ArrowRight" || k === "PageDown") { if (!e.repeat) cmd({ do: "song", d: 1 }); }
    else if (k === "ArrowLeft" || k === "PageUp") { if (!e.repeat) cmd({ do: "song", d: -1 }); }
    else if (k === "-" || k === "_") cmd({ do: "tempo", d: -1 });
    else if (k === "=" || k === "+") cmd({ do: "tempo", d: 1 });
    else if (low === "v" && X.view === "vVis" && vis) { const m = vis.modes, i = m.findIndex(x => x.id === visMode); visSet(m[(i + 1) % m.length].id); }
    else if (low === "f" && X.view === "vVis") $("visFs").click();
    else used = false;
    if (used) e.preventDefault();
  });
  // ---------- visuals ----------
  let vis = null, visMode = ls.get("stage-vis", "bloom"), visHideT = 0;
  function visOn() {
    if (!vis && window.NBVisuals) {
      try {
        vis = NBVisuals.create($("visCanvas"));
        vis.beatClock(() => { const b = beatNow(); return b ? { beat: b.beat, bpm: b.bpm, playing: true } : null; });
        const ms = $("visModes"); ms.innerHTML = vis.modes.map(m => `<button data-m="${m.id}">${esc(m.name)}</button>`).join("");
        ms.querySelectorAll("button").forEach(b => b.addEventListener("click", () => visSet(b.dataset.m)));
        if (X.band && X.band.chord) vis.chord(X.band.chord.root, X.band.chord.q);
      } catch (e) { console.error(e); vis = null; }
    }
    if (vis) { visSet(visMode); vis.resize(); vis.start(); }
    visPoke();
  }
  function visOff() { if (vis) vis.stop(); }
  function visSet(m) { visMode = m; ls.set("stage-vis", m); if (vis) vis.setMode(m); $("visModes").querySelectorAll("button").forEach(b => setA(b, "aria-pressed", String(b.dataset.m === m))); }
  function visPoke() { const b = $("visBar"); b.classList.remove("hide"); clearTimeout(visHideT); visHideT = setTimeout(() => { if (X.view === "vVis") b.classList.add("hide"); }, 3000); document.body.style.cursor = ""; }
  $("vVis").addEventListener("pointermove", visPoke); $("vVis").addEventListener("pointerdown", visPoke);
  $("visCapBtn").addEventListener("click", () => { const c = $("visCap"); c.hidden = !c.hidden; setA($("visCapBtn"), "aria-pressed", String(!c.hidden)); ls.set("stage-viscap", !c.hidden); });
  if (ls.get("stage-viscap", false)) { $("visCap").hidden = false; setA($("visCapBtn"), "aria-pressed", "true"); }
  $("visFs").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
  document.addEventListener("fullscreenchange", () => { document.body.classList.toggle("fs", !!document.fullscreenElement && X.view === "vVis"); if (vis) setTimeout(() => vis.resize(), 60); });
  setInterval(() => { if (vis && X.view === "vVis") setT($("visFps"), Math.round(vis.fps || 0) + " fps"); }, 1000);
  window.addEventListener("resize", () => { if (vis && X.view === "vVis") vis.resize(); });
  // ---------- the editor ----------
  const ED = { tab: "sl", sl: null, slDirty: false, rc: null, rcDirty: false, cur: { r: 0, c: 0 } };
  function edStat(m, ok) { const e = $("eStat"); setT(e, m || ""); e.className = "estat" + (ok === true ? " ok" : ok === false ? " no" : ""); }
  function onData(d) {
    if (!d || !d.kind) return;
    if (d.kind === "setlist") { X.setlist = d; if (!ED.slDirty || !ED.sl || ED.sl.ver !== d.ver) { ED.sl = JSON.parse(JSON.stringify(d)); ED.slDirty = false; } if (X.view === "vEdit" && ED.tab === "sl") edPaint(); }
    else if (d.kind === "rhythm") { X.rhythm = d; if (!ED.rcDirty || !ED.rc || ED.rc.ver !== d.ver) { ED.rc = JSON.parse(JSON.stringify(d)); ED.rcDirty = false; } if (X.view === "vEdit" && ED.tab === "rc") edPaint(); }
    else if (d.kind === "kits") { X.kits = d; if (X.view === "vEdit" && ED.tab === "kit") edPaint(); }
  }
  $("eTabs").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { ED.tab = b.dataset.e; edPaint(); }));
  $("ePull").addEventListener("click", () => { if (!up()) { toast("Not linked to the tablet"); return; } const k = { sl: "setlist", rc: "rhythm", kit: "kits" }[ED.tab]; if (ED.tab === "sl") ED.slDirty = false; if (ED.tab === "rc") ED.rcDirty = false; pull(k); edStat("Asked the tablet…"); });
  $("ePush").addEventListener("click", edPush);
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && X.view === "vEdit") { e.preventDefault(); edPush(); } });
  function edPush() {
    if (!up()) { toast("Not linked to the tablet"); return; }
    const id = Math.random().toString(36).slice(2, 8);
    if (ED.tab === "sl" && ED.sl) { send("push", { kind: "setlist", id, ver: ED.sl.ver, songs: ED.sl.songs.map(x => ({ i: x.i, name: x.name, notes: x.notes })) }); ED.slDirty = false; edStat("Sending…"); }
    else if (ED.tab === "rc" && ED.rc) { send("push", { kind: "rhythm", id, ver: ED.rc.ver, tracks: ED.rc.tracks.map(t => ({ i: t.i, len: t.len, on: t.on, acc: t.acc })) }); ED.rcDirty = false; edStat("Sending…"); }
    else if (ED.tab === "kit") toast("Pick a kit and press Load on a bank");
  }
  function edPaint() {
    $("eTabs").querySelectorAll("button").forEach(b => setA(b, "aria-pressed", String(b.dataset.e === ED.tab)));
    $("eSl").hidden = ED.tab !== "sl"; $("eRc").hidden = ED.tab !== "rc"; $("eKit").hidden = ED.tab !== "kit";
    $("ePush").hidden = ED.tab === "kit";
    if (ED.tab === "sl") slPaint(); else if (ED.tab === "rc") rcPaint(); else kitPaint();
  }
  function slPaint() {
    const body = $("slBody"), S = ED.sl;
    if (!S) { body.innerHTML = ""; $("slEmpty").hidden = false; setT($("slEmpty"), up() ? "Asking the tablet for its set list…" : "Link to the tablet to edit its set list."); return; }
    $("slEmpty").hidden = S.songs.length > 0; setT($("slEmpty"), "No songs on the tablet yet: in Live, tap the set list box and save one.");
    const cur = X.setlist ? X.setlist.cur : -1;
    body.innerHTML = S.songs.map((x, n) => `<tr data-n="${n}" class="${x.i === cur ? "cur" : ""}"><td><div class="num">${n + 1}<button class="btn mv" data-a="up" aria-label="Move up"${n === 0 ? " disabled" : ""}>↑</button><button class="btn mv" data-a="dn" aria-label="Move down"${n === S.songs.length - 1 ? " disabled" : ""}>↓</button></div></td>
      <td><input class="nm" value="${esc(x.name)}" maxlength="40" aria-label="Song ${n + 1} name"><textarea placeholder="Notes for this song: key, what to play, what comes next…" aria-label="Song ${n + 1} notes">${esc(x.notes)}</textarea><div class="meta">${x.bpm ? x.bpm + " bpm" : ""}${x.label ? " · " + esc(x.label) : ""}${x.i === cur ? " · playing now" : ""}</div></td>
      <td><div class="acts"><button class="btn" data-a="go">Go to it</button><button class="btn" data-a="del">Remove</button></div></td></tr>`).join("");
    body.querySelectorAll("tr").forEach(tr => {
      const n = +tr.dataset.n, x = S.songs[n];
      tr.querySelector(".nm").addEventListener("input", e => { x.name = e.target.value; ED.slDirty = true; edStat("Not sent yet"); });
      tr.querySelector("textarea").addEventListener("input", e => { x.notes = e.target.value; ED.slDirty = true; edStat("Not sent yet"); });
      tr.querySelectorAll("button[data-a]").forEach(b => b.addEventListener("click", () => {
        const a = b.dataset.a;
        if (a === "up" || a === "dn") { const j = a === "up" ? n - 1 : n + 1; [S.songs[n], S.songs[j]] = [S.songs[j], S.songs[n]]; ED.slDirty = true; edStat("Not sent yet"); slPaint(); }
        else if (a === "del") { S.songs.splice(n, 1); ED.slDirty = true; edStat("Not sent yet: Send to the tablet removes it there"); slPaint(); }
        else if (a === "go") { if (ED.slDirty) { toast("Send the changes first, then Go"); return; } cmd({ do: "songGo", i: x.i }); }
      }));
    });
  }
  function rcPaint() {
    const box = $("rcGrid"), R = ED.rc;
    if (!R) { box.innerHTML = `<p class="note">${up() ? "Asking the tablet for its pattern…" : "Link to the tablet to edit its Rhythm pattern."}</p>`; return; }
    const maxLen = Math.max(16, ...R.tracks.map(t => t.len));
    box.innerHTML = R.tracks.map((t, r) => `<div class="rrow${t.mute ? " mute" : ""}" data-r="${r}"><div class="rn">${esc(t.name)}<small>${esc(t.role)}${t.mute ? " · muted" : ""}</small></div>
      <select aria-label="${esc(t.name)} length">${[4, 8, 12, 16, 24, 32, 48, 64].map(L => `<option value="${L}"${L === t.len ? " selected" : ""}>${L}</option>`).join("")}</select>
      <div class="cells">${Array.from({ length: maxLen }, (_, c) => `<button class="cell${c % 4 === 0 ? " bt" : ""}${c >= t.len ? " off" : ""}${t.on[c] ? " on" : ""}${t.on[c] && t.acc[c] ? " acc" : ""}" data-c="${c}" aria-label="step ${c + 1}" tabindex="${r === ED.cur.r && c === ED.cur.c ? 0 : -1}"></button>`).join("")}</div></div>`).join("");
    box.querySelectorAll(".rrow").forEach(row => {
      const r = +row.dataset.r, t = R.tracks[r];
      row.querySelector("select").addEventListener("change", e => { t.len = +e.target.value; ED.rcDirty = true; edStat("Not sent yet"); rcPaint(); });
      row.querySelectorAll(".cell").forEach(b => b.addEventListener("click", e => { const c = +b.dataset.c; if (c >= t.len) return; ED.cur = { r, c }; rcToggle(t, c, e.shiftKey); }));
    });
  }
  function rcToggle(t, c, acc) {
    if (acc) { if (!t.on[c]) t.on[c] = 1; t.acc[c] = t.acc[c] ? 0 : 1; } else { t.on[c] = t.on[c] ? 0 : 1; if (!t.on[c]) t.acc[c] = 0; }
    ED.rcDirty = true; edStat("Not sent yet"); rcPaint(); const f = $("rcGrid").querySelector(`.rrow[data-r="${ED.cur.r}"] .cell[data-c="${ED.cur.c}"]`); if (f) f.focus();
  }
  $("rcGrid").addEventListener("keydown", e => {
    const R = ED.rc; if (!R) return; const c0 = ED.cur;
    const mv = (dr, dc) => { const r = Math.max(0, Math.min(R.tracks.length - 1, c0.r + dr)), c = Math.max(0, Math.min(R.tracks[r].len - 1, c0.c + dc)); ED.cur = { r, c }; const f = $("rcGrid").querySelector(`.rrow[data-r="${r}"] .cell[data-c="${c}"]`); if (f) { $("rcGrid").querySelectorAll(".cell").forEach(x => x.tabIndex = -1); f.tabIndex = 0; f.focus(); } };
    if (e.key === "ArrowRight") mv(0, 1); else if (e.key === "ArrowLeft") mv(0, -1); else if (e.key === "ArrowDown") mv(1, 0); else if (e.key === "ArrowUp") mv(-1, 0);
    else if (e.key === " " || e.key === "Enter") rcToggle(R.tracks[c0.r], c0.c, false); else if (e.key.toLowerCase() === "a") rcToggle(R.tracks[c0.r], c0.c, true);
    else return; e.preventDefault();
  });
  function kitPaint() {
    const box = $("kitCards"), K = X.kits;
    if (!K) { box.innerHTML = `<p class="note">${up() ? "Asking the tablet for its kits…" : "Link to the tablet to load kits."}</p>`; return; }
    const groups = [...new Set(K.list.map(k => k.group))];
    box.innerHTML = [0, 1, 2, 3].map(b => `<div class="card kitc"><div class="lab">Bank ${"ABCD"[b]}</div><div class="cur">${esc(K.banks[b])}</div>
      <select aria-label="Kit for bank ${"ABCD"[b]}">${groups.map(g => `<optgroup label="${esc(g)}">${K.list.filter(k => k.group === g).map(k => `<option value="${esc(k.id)}"${k.name === K.banks[b] ? " selected" : ""}>${esc(k.name)}</option>`).join("")}</optgroup>`).join("")}</select>
      <button class="btn" data-b="${b}">Load onto bank ${"ABCD"[b]}</button></div>`).join("");
    box.querySelectorAll("button[data-b]").forEach(btn => btn.addEventListener("click", () => {
      if (!up()) { toast("Not linked to the tablet"); return; }
      const b = +btn.dataset.b, id = btn.parentElement.querySelector("select").value;
      send("push", { kind: "kit", bank: b, id, id2: Math.random().toString(36).slice(2, 8) }); edStat("Loading…");
    }));
  }
  // ---------- the band, from here ----------
  const PAT = {   // the band's patterns, as on the tablet (drums: 16 steps; bass: [step, semitones, length])
    house: { sw: 0, d: { kick: "x...x...x...x...", clap: "....x.......x...", oh: "..x...x...x...x." }, b: [[0, 0, 2], [2, 0, 1], [4, 0, 2], [6, 0, 1], [8, 0, 2], [10, 7, 1], [12, 0, 2], [14, 12, 1]] },
    pop: { sw: 0, d: { kick: "x...x...x...x...", snare: "....x.......x...", oh: "..x...x...x...x.", ch: "x...x...x...x..." }, b: [[0, 0, 4], [4, 0, 2], [6, 0, 2], [8, 7, 4], [12, 0, 2], [14, 5, 2]] },
    funk: { sw: 0.15, d: { kick: "x..x..x...x..x..", snare: "....x..x.x..x...", ch: "x.x.x.x.x.x.x.x." }, b: [[0, 0, 1], [3, 0, 1], [6, 12, 1], [7, 10, 1], [8, 0, 1], [10, 7, 1], [11, 0, 1], [13, 12, 1], [14, 10, 1]] },
    hiphop: { sw: 0.35, d: { kick: "x......x..x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }, b: [[0, 0, 6], [7, 0, 1], [8, 0, 4], [12, 7, 2], [14, 5, 2]] },
    lofi: { sw: 0.55, d: { kick: "x......x..x.....", rim: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }, b: [[0, 0, 8], [8, 7, 4], [12, 0, 4]] },
    rock: { sw: 0, d: { kick: "x.....x.x.......", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }, b: [[0, 0, 2], [2, 0, 2], [4, 0, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, 7, 2]] },
    latin: { sw: 0, d: { kick: "x...x...x...x...", snare: "...x..x....x..x.", ch: "x.x.x.x.x.x.x.x." }, b: [[0, 0, 3], [3, 0, 3], [6, 7, 2], [8, 0, 2], [11, 7, 1], [12, 12, 2], [14, 7, 2]] },
    techno: { sw: 0, d: { kick: "x...x...x...x...", ch: "..x...x...x...x.", rim: "......x.......x.", tom: "..........x....." }, b: [[2, 0, 1], [6, 0, 1], [10, 0, 1], [14, 0, 1], [0, -12, 1], [8, -12, 1]] },
    trap: { sw: 0, d: { kick: "x.....x...x.....", clap: "........x.......", ch: "xxxxxxxxxxxxxxxx" }, b: [[0, 0, 8], [8, 0, 3], [11, 3, 1], [12, 0, 4]] },
  };
  const BS = { next: null, sig: "", okAt: 0 };
  X.nudge = ls.get("stage-nudge", 0);
  $("bNudge").value = X.nudge; setT($("bNudgeO"), X.nudge + " ms");
  $("bNudge").addEventListener("input", e => { X.nudge = +e.target.value; ls.set("stage-nudge", X.nudge); setT($("bNudgeO"), (X.nudge > 0 ? "+" : "") + X.nudge + " ms"); BS.next = null; });
  $("bLvl").value = ls.get("stage-blvl", 1); setT($("bLvlO"), Math.round($("bLvl").value * 100) + "%");
  $("bLvl").addEventListener("input", e => { ls.set("stage-blvl", +e.target.value); setT($("bLvlO"), Math.round(e.target.value * 100) + "%"); if (bandBus) bandBus.gain.setTargetAtTime(+e.target.value, actx.currentTime, 0.03); });
  $("bHere").addEventListener("click", () => {
    audio(); if (!band) { toast("The band engine didn't load: reload the page"); return; }
    X.here = !X.here; setA($("bHere"), "aria-pressed", String(X.here)); setT($("bHere"), X.here ? "Playing the band here" : "Play the band here");
    send("bandHere", { on: X.here }); if (X.here) { BS.next = null; if (X.band) band.set({ style: X.band.style, bass: X.band.bass, bassLvl: X.band.bassLvl, drumLvl: X.band.drumLvl, chord: X.band.chord }); }
    bandSay();
  });
  function bandSay() {
    const b = X.band;
    setT($("bSay"), !up() ? "Not linked to the tablet" : !X.here ? "The tablet plays the band" : !synced() ? "Lining up with the tablet's clock…" : b && b.on ? "Playing here, in time with the tablet" : "Ready: the band plays here whenever it's on (tablet or Hands)");
  }
  setInterval(bandSay, 1000);
  function bandEvents(n, tp, sd) {   // what the band plays on step n (tablet time tp): for the MIDI file and the visuals
    const b = X.band, P = PAT[b.style] || PAT.house, s16 = ((n % 16) + 16) % 16, sw = s16 % 2 === 1 ? P.sw * sd * 500 : 0, out = [];
    for (const id in P.d) if (P.d[id][s16] === "x") out.push(["bd", tp + sw, id]);
    for (const [st, semi0, len] of P.b) if (st === s16) { let semi = semi0; if ((b.chord.q === "min" || b.chord.q === "min7" || b.chord.q === "dim") && semi % 12 === 4) semi -= 1; out.push(["bb", tp, 36 + b.chord.root + semi, Math.max(80, len * sd * 920)]); }
    return out;
  }
  const BD_VIS = { kick: "kick", snare: "snare", clap: "snare", rim: "snare", ch: "hat", oh: "hat" };
  setInterval(() => {   // the band's scheduler: 25 ms, 0.3 s ahead
    const b = X.band;
    if (X.here && up() && synced() && actx && actx.state === "running" && performance.now() - BS.okAt > 1000) { BS.okAt = performance.now(); send("bandOk", 1); }
    if (!b || !b.on || !b.clock || b.perf0 == null || !synced()) { BS.next = null; return; }
    const sig = b.perf0.toFixed(0) + ":" + b.sd; if (sig !== BS.sig) { BS.sig = sig; BS.next = null; }
    const sdm = b.sd * 1000, nowTab = tabNow(), horizon = nowTab + 300;
    if (BS.next == null) BS.next = Math.max(0, Math.ceil((nowTab + 40 - b.perf0) / sdm));
    for (let guard = 0; guard < 64; guard++) {
      const n = BS.next, tp = b.perf0 + n * sdm; if (tp > horizon) break;
      BS.next++;
      if (tp < nowTab - 30) continue;
      const evs = bandEvents(n, tp, b.sd);
      evs.forEach(e => { midiEv(e); if (vis && e[0] === "bd") later(e[1], () => vis.hit(BD_VIS[e[2]] || "other", 0.8)); });
      if (X.here && band && actx && actx.state === "running") { try { band.playStep(n, Math.max(actx.currentTime, ctxAt(fromTab(tp) + X.nudge)), b.sd); } catch (e) { console.error(e); } }
    }
  }, 25);
  // ---------- the backing track ----------
  const TR = { buf: null, src: null, name: "", taps: [] };
  $("tLvl").value = ls.get("stage-tlvl", 0.8); setT($("tLvlO"), Math.round($("tLvl").value * 100) + "%");
  $("tLvl").addEventListener("input", e => { ls.set("stage-tlvl", +e.target.value); setT($("tLvlO"), Math.round(e.target.value * 100) + "%"); if (trackBus) trackBus.gain.setTargetAtTime(+e.target.value, actx.currentTime, 0.03); });
  $("tFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return; audio();
    setT($("tName"), "Loading " + f.name + "…");
    try { TR.buf = await actx.decodeAudioData(await f.arrayBuffer()); TR.name = f.name; const m = /(\d{2,3}(?:\.\d)?)\s*bpm/i.exec(f.name); if (m) $("tBpm").value = m[1];
      setT($("tName"), f.name + " · " + Math.floor(TR.buf.duration / 60) + ":" + String(Math.floor(TR.buf.duration % 60)).padStart(2, "0")); $("tGo").disabled = false; }
    catch (x) { setT($("tName"), "Couldn't read that file"); TR.buf = null; $("tGo").disabled = true; }
  });
  $("tTap").addEventListener("click", () => { const t = performance.now(); TR.taps = TR.taps.filter(x => t - x < 3000); TR.taps.push(t); if (TR.taps.length >= 3) { const d = (TR.taps[TR.taps.length - 1] - TR.taps[0]) / (TR.taps.length - 1); $("tBpm").value = (60000 / d).toFixed(1); } });
  const tabBpm = () => (X.grid && X.grid.bpm) || (X.st && X.st.bpm) || null;
  const trRate = () => { const tb = tabBpm(), own = +$("tBpm").value; return $("tFollow").checked && tb && own > 0 ? tb / own : 1; };
  function nextBarSp() {   // our performance time of the tablet's next bar line (null: nothing keeps time there)
    const g = X.grid && X.grid.src ? X.grid : X.band && X.band.clock && X.band.perf0 != null ? { perf0: X.band.perf0, sd: X.band.sd } : null;
    if (!g || !synced()) return null;
    const bar = g.sd * 16000, n = Math.ceil((tabNow() + 150 - g.perf0) / bar); return fromTab(g.perf0 + n * bar);
  }
  $("tGo").addEventListener("click", () => {
    if (!TR.buf) return; audio(); trStop();
    const src = actx.createBufferSource(); src.buffer = TR.buf; src.playbackRate.value = trRate(); src.connect(trackBus);
    const sp = nextBarSp(), t = sp == null ? actx.currentTime + 0.05 : Math.max(actx.currentTime + 0.02, ctxAt(sp + X.nudge));
    src.start(t, Math.max(0, +$("tOff").value || 0)); TR.src = src; src.onended = () => { if (TR.src === src) { TR.src = null; trPaint(); } };
    trPaint(sp == null ? "Started now (nothing on the tablet keeps time yet)" : "Starts on the next bar");
  });
  function trStop() { if (TR.src) { try { TR.src.stop(); } catch (e) {} TR.src = null; } trPaint(); }
  $("tStop").addEventListener("click", trStop);
  function trPaint(m) { $("tStop").disabled = !TR.src; setT($("tSay"), m || (TR.src ? "Playing at " + trRate().toFixed(2) + "×" : "")); }
  setInterval(() => { if (TR.src && actx) { const r = trRate(); if (Math.abs(TR.src.playbackRate.value - r) > 0.0005) TR.src.playbackRate.setTargetAtTime(r, actx.currentTime, 0.05); trPaint(); } }, 500);
  // ---------- the set, as MIDI ----------
  const TRK = [["keys", "Keys"], ["pd", "Pad notes (Notes, Chords, slots)"], ["bpp", "Beat Pads you hit"], ["rcp", "Rhythm pads you hit"], ["pat", "Patterns (Beat Pads and Rhythm playing)"], ["bb", "Band bass"], ["bd", "Band drums"], ["cc", "Knobs and faders (controllers)"]];
  const INC = Object.assign(Object.fromEntries(TRK.map(([k]) => [k, true])), ls.get("stage-midi-inc", {}));
  $("mTracks").innerHTML = TRK.map(([k, n]) => `<label class="chk"><input type="checkbox" data-k="${k}"${INC[k] ? " checked" : ""}> ${esc(n)}</label>`).join("");
  $("mTracks").querySelectorAll("input").forEach(i => i.addEventListener("change", () => { INC[i.dataset.k] = i.checked; ls.set("stage-midi-inc", INC); }));
  $("mAuto").checked = ls.get("stage-midi-auto", true);
  $("mAuto").addEventListener("change", e => { ls.set("stage-midi-auto", e.target.checked); midiAuto(); });
  const REC = { on: false, take: null, lastUp: 0, saveT: 0, takes: [] };
  function recStart() {
    if (REC.on) return; const t0 = tabNow();
    REC.take = { id: "t" + Date.now(), date: Date.now(), t0, t1: t0, evs: [], tempo: [[t0, (X.st && X.st.bpm) || 120]], marks: [], cc: [], kp: "" };
    if (X.st && X.st.song.name) REC.take.marks.push([t0, X.st.song.name]);
    REC.on = true; midiPaint();
  }
  function recStop() { if (!REC.on) return; REC.on = false; const T = REC.take; T.t1 = tabNow(); if (T.evs.length || T.cc.length) { dbPut(T); REC.takes.unshift(T); } REC.take = null; midiPaint(); }
  $("mRec").addEventListener("click", () => { if (REC.on) { recStop(); REC.manualOff = true; } else { REC.manualOff = false; recStart(); } });
  function midiAuto() {
    if (up()) REC.lastUp = performance.now();
    if ($("mAuto").checked && up() && !REC.on && !REC.manualOff) recStart();
  }
  setInterval(() => { if (up()) REC.lastUp = performance.now(); else if (REC.on && performance.now() - REC.lastUp > 10000 && $("mAuto").checked) recStop(); if (REC.on && REC.take.evs.length && performance.now() - REC.saveT > 15000) { REC.saveT = performance.now(); REC.take.t1 = tabNow(); dbPut(REC.take); } midiPaintRec(); }, 1000);
  function midiEv(e) {
    if (!REC.on) return; const T = REC.take;
    if (T.evs.length > 400000) return;
    T.evs.push(e); if (e[1] > T.t1) T.t1 = e[1];
  }
  function midiState(s) {
    if (!REC.on) return; const T = REC.take, t = tabNow() - (X.L && X.L.rtt ? X.L.rtt / 2 : 0);
    const lastBpm = T.tempo[T.tempo.length - 1][1]; if (s.bpm && Math.abs(s.bpm - lastBpm) > 0.05) T.tempo.push([t, s.bpm]);
    const lastMark = T.marks.length ? T.marks[T.marks.length - 1][1] : ""; if (s.song.name && s.song.name !== lastMark) T.marks.push([t, s.song.name]);
    if (s.kp.name !== T.kp) { T.kp = s.kp.name; T.cc.push([t, "page", s.kp.name, s.kp.k.map(k => k[0]).join(", ")]); }
    const vals = s.kp.k.map(k => k[2]).concat(s.kp.f.map(f => f[2]));
    if (!T.lastVals) T.lastVals = [];
    vals.forEach((v, i) => { if (v == null) return; const c = Math.round(v * 127); if (T.lastVals[i] !== c) { T.lastVals[i] = c; T.cc.push([t, "cc", i, c]); } });
  }
  const GM = { kick: 36, boom: 35, snare: 38, clap: 39, rim: 37, ch: 42, oh: 46, tom: 45, cym: 49, ride: 51, bell: 56, shaker: 70, perc: 63, fx: 54, cow: 56 };
  function buildMidi(T) {
    const PPQ = 480, t0 = T.t0, tempo = T.tempo.slice().sort((a, b) => a[0] - b[0]);
    const tick = t => { let acc = 0; t = Math.max(t0, t); for (let i = 0; i < tempo.length; i++) { const ts = Math.max(t0, tempo[i][0]), te = i + 1 < tempo.length ? Math.max(t0, tempo[i + 1][0]) : Infinity; if (t <= ts) break; acc += (Math.min(t, te) - ts) / 60000 * tempo[i][1] * PPQ; } return Math.round(acc); };
    const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const txt = (type, s) => { const b = [...new TextEncoder().encode(s)]; return [0xff, type, ...vlq(b.length), ...b]; };
    const chunk = (name, evs) => { evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const out = [0, ...txt(3, name)]; let last = 0; evs.forEach(([tk, , bytes]) => { out.push(...vlq(Math.max(0, tk - last)), ...bytes); last = Math.max(last, tk); }); out.push(0, 0xff, 0x2f, 0); return [0x4d, 0x54, 0x72, 0x6b, ...u32(out.length), ...out]; };
    const end = T.t1 + 500;
    // the conductor: tempo and songs
    const cond = [];
    tempo.forEach(([t, bpm]) => { const us = Math.round(60000000 / bpm); cond.push([tick(t), 0, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]]); });
    T.marks.forEach(([t, s]) => cond.push([tick(t), 1, txt(6, s)]));
    const tracks = [chunk("Nate Bloom set", cond)];
    const notes = (ch, list) => {   // list: [t, midi, vel(1–127), durMs or null for on/off pairs]
      const out = []; list.forEach(([t, m, v, dur]) => { if (m < 0 || m > 127) return; out.push([tick(t), 1, [0x90 | ch, m, Math.max(1, Math.min(127, v | 0))]]); out.push([tick(t + dur), 0, [0x80 | ch, m, 0]]); }); return out;
    };
    const pairs = (src, ch) => {   // note on/off events from the tablet → notes
      const open = new Map(), out = [];
      T.evs.forEach(e => { if ((e[0] === "n" || e[0] === "f") && e[e[0] === "n" ? 4 : 3] === src) { if (e[0] === "n") { if (open.has(e[2])) out.push([open.get(e[2])[0], e[2], open.get(e[2])[1], Math.max(10, e[1] - open.get(e[2])[0])]); open.set(e[2], [e[1], e[3]]); } else if (open.has(e[2])) { const o = open.get(e[2]); open.delete(e[2]); out.push([o[0], e[2], o[1], Math.max(10, e[1] - o[0])]); } } });
      open.forEach((o, m) => out.push([o[0], m, o[1], Math.max(10, end - o[0])]));
      return notes(ch, out);
    };
    const hits = (kinds, ch, map) => notes(ch, T.evs.filter(e => kinds.includes(e[0])).map(e => [e[1], map(e), Math.round(Math.max(0.05, e[3]) * 127), 80]));
    if (INC.keys) tracks.push(chunk("Keys", pairs("k", 0)));
    if (INC.pd) tracks.push(chunk("Pad notes", pairs("pd", 1)));
    if (INC.bpp) tracks.push(chunk("Beat Pads (hit)", hits(["p"], 9, e => GM[e[4]] || 36 + (e[2] % 16))));
    if (INC.rcp) tracks.push(chunk("Rhythm pads (hit)", hits(["r"], 9, e => GM[e[4]] || 60 + e[2])));
    if (INC.pat) tracks.push(chunk("Patterns (Beat Pads, Rhythm)", hits(["P", "R"], 9, e => GM[e[4]] || 60 + (e[2] % 16))));
    if (INC.bb) tracks.push(chunk("Band bass", notes(2, T.evs.filter(e => e[0] === "bb").map(e => [e[1], e[2], 100, e[3]]))));
    if (INC.bd) tracks.push(chunk("Band drums", notes(9, T.evs.filter(e => e[0] === "bd").map(e => [e[1], GM[e[2]] || 36, 100, 80]))));
    if (INC.cc) { const cc = []; T.cc.forEach(c => { if (c[1] === "cc") cc.push([tick(c[0]), 1, [0xb0, c[2] < 8 ? 20 + c[2] : 28 + (c[2] - 8), c[3]]]); else cc.push([tick(c[0]), 0, txt(1, "Knob page: " + c[2] + " (CC 20–27: " + c[3] + "; faders CC 28–31)")]); }); tracks.push(chunk("Knobs", cc)); }
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return new Uint8Array(head.concat(...tracks));
  }
  function saveMidi(T) {
    const d = new Date(T.date), name = "Nate Bloom set " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + "-" + String(d.getMinutes()).padStart(2, "0") + ".mid";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buildMidi(T)], { type: "audio/midi" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("Saved " + name);
  }
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const counts = T => { const n = T.evs.filter(e => e[0] === "n").length, h = T.evs.filter(e => "pPrR".includes(e[0])).length, b = T.evs.filter(e => e[0] === "bb" || e[0] === "bd").length; return n + " notes · " + h + " hits · " + b + " band"; };
  function midiPaintRec() {
    const on = REC.on, T = REC.take;
    $("recdot").classList.toggle("on", on); if (on) setT($("recdot").querySelector("span"), fmt(tabNow() - T.t0));
    if (X.view !== "vMidi") return;
    setA($("mRec"), "aria-pressed", String(on)); setT($("mRec"), on ? "■ Stop recording" : "● Record");
    setT($("mRecSay"), on ? "Recording " + fmt(tabNow() - T.t0) + " · " + counts(T) : up() ? "Not recording" : "Not linked: recording starts when the tablet links" + ($("mAuto").checked ? "" : " (if Record is on)"));
  }
  function midiPaint() {
    midiPaintRec();
    const box = $("mTakes"), all = (REC.on ? [REC.take] : []).concat(REC.takes);
    box.innerHTML = all.length ? all.map((T, i) => `<div class="take"><div><b>${new Date(T.date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${REC.on && i === 0 ? " · recording" : ""}</b><small>${fmt(T.t1 - T.t0)} · ${counts(T)}</small></div><button class="btn" data-i="${i}" data-a="save">Save .mid</button>${REC.on && i === 0 ? "" : `<button class="btn" data-i="${i}" data-a="del">Delete</button>`}</div>`).join("") : `<p class="note">Nothing recorded yet.</p>`;
    box.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const T = all[+b.dataset.i]; if (!T) return;
      if (b.dataset.a === "save") saveMidi(T); else { REC.takes = REC.takes.filter(x => x !== T); dbDel(T.id); midiPaint(); }
    }));
  }
  // takes are kept in IndexedDB, so a reload or a closed lid loses nothing
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("nb-stage", 1); r.onupgradeneeded = () => r.result.createObjectStore("takes", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const dbPut = T => db().then(d => { const o = Object.assign({}, T); delete o.lastVals; d.transaction("takes", "readwrite").objectStore("takes").put(o); }).catch(() => {});
  const dbDel = id => db().then(d => d.transaction("takes", "readwrite").objectStore("takes").delete(id)).catch(() => {});
  db().then(d => { const r = d.transaction("takes").objectStore("takes").getAll(); r.onsuccess = () => { REC.takes = (r.result || []).sort((a, b) => b.date - a.date).concat(REC.takes.filter(t => !(r.result || []).some(x => x.id === t.id))); if (X.view === "vMidi") midiPaint(); }; }).catch(() => {});
  window.__stage.midi = { REC, buildMidi, recStart, recStop };
  // ---------- keep the screen awake while linked ----------
  let wake = null;
  setInterval(async () => { try { if (up() && !wake && navigator.wakeLock && document.visibilityState === "visible") { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch (e) {} }, 5000);
  // ---------- go ----------
  setView(ls.get("stage-view", "vMon"));
  if (!window.NBBand) $("bHere").disabled = true;
  linkStart();
})();
