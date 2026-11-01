  // ======================================================================
  // DJ → Tracks (mashups)
  // ======================================================================
  {
    const btn = document.getElementById("djToTracks");
    let busy = false;
    async function stretchInto(octx) {
      for (const url of [() => URL.createObjectURL(new Blob([STRETCH_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(STRETCH_SRC)]) {
        try { await octx.audioWorklet.addModule(url()); return true; } catch (e) {}
      }
      return false;
    }
    // the song at `rate` (speed) and `semi` (key), pitch kept by the key-lock stretcher where it can run
    async function renderDeck(d, rate, semi) {
      const buf = d.buf, sr = buf.sampleRate;
      if (Math.abs(rate - 1) < 1e-4 && !semi) return { buf, locked: true };
      const len = Math.min(Math.ceil(buf.duration / rate * sr) + 1, sr * 60 * 8);
      const octx = new OfflineAudioContext(2, len, sr);
      let locked = false;
      if (DJ.stretchOK && octx.audioWorklet && await stretchInto(octx)) {
        try {
          const i16 = a => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) { const v = a[i]; o[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : v * 32767; } return o; };
          const L = i16(buf.getChannelData(0)), R = buf.numberOfChannels > 1 ? i16(buf.getChannelData(1)) : L;
          const node = new AudioWorkletNode(octx, "nb-stretch", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { L, R, from: 0, rate, pitch: Math.pow(2, (semi || 0) / 12) } });
          node.connect(octx.destination); locked = true;
        } catch (e) { locked = false; }
      }
      if (!locked) { const src = octx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate; src.connect(octx.destination); src.start(0); }
      return { buf: await octx.startRendering(), locked };
    }
    async function toTracks() {
      if (busy) return;
      const A = DJ.decks[0], B = DJ.decks[1];
      if (!A.buf || !B.buf) { djMsg("Load a song on both decks first"); return; }
      if (!A.bpm0 || !B.bpm0) { djMsg("Both songs need a beat grid (Tap along with the one that has none)"); return; }
      if (!djBuild()) return;
      busy = true; btn.disabled = true; btn.textContent = "Rendering…";
      try {
        const L = A.playing && !B.playing ? A : B.playing && !A.playing ? B : LEAD(), F = DJ.decks[1 - L.i];
        const live = A.playing && B.playing;
        let bpm = A.playing || B.playing ? djEff(L) * L.bend : ((djRecBpm(L, { bpm: F.bpm0 }) || {}).bpm || djEff(L));
        bpm = Math.max(50, Math.min(180, Math.round(bpm)));
        const fit = d => { let m = 1; [2, 0.5].forEach(x => { if (Math.abs(Math.log(bpm / (d.bpm0 * x))) < Math.abs(Math.log(bpm / (d.bpm0 * m)))) m = x; }); return bpm / (d.bpm0 * m); };
        const rL = fit(L), rF = fit(F);
        let sL = L.semi || 0, sF = F.semi || 0, keyNote = "";
        if (!sL && !sF && DJ.stretchOK && L.cam && F.cam && djCompat(L.cam, F.cam) < 2) for (const st of [1, -1, 2, -2]) if (djCompat(L.cam, camShift(F.cam, st)) >= 2) { sF = st; keyNote = " · " + "AB"[F.i] + (st > 0 ? " up " : " down ") + Math.abs(st) + " semitone" + (Math.abs(st) > 1 ? "s" : "") + " so the keys fit (" + F.cam + " → " + camShift(F.cam, st) + ")"; break; }
        const posL = djPos(L), posF = djPos(F);
        djMsg("Rendering " + "AB"[L.i] + " at " + bpm + " BPM for the Garage…", true);
        const oL = await renderDeck(L, rL, sL);
        djMsg("Rendering " + "AB"[F.i] + " at " + bpm + " BPM for the Garage…", true);
        const oF = await renderDeck(F, rF, sF);
        // Tracks' grid follows the app's tempo
        setBpm(bpm);
        const barS = barSec(), anc = (d, r) => (d.phrase != null ? d.phrase : d.off) / r;
        let stL = Math.max(1, Math.ceil(anc(L, rL) / barS - 1e-6)) * barS - anc(L, rL), stF;
        if (live) stF = stL + posL / rL - posF / rF;            // exactly as they sound now
        else stF = stL + anc(L, rL) - anc(F, rF);              // first downbeats (or Phrase marks) on the same bar
        const low = Math.min(stL, stF); if (low < 0) { const k = Math.ceil(-low / barS - 1e-6) * barS; stL += k; stF += k; }
        const nm = d => "AB"[d.i] + " · " + (d.name || "song");
        const pitchNote0 = !oL.locked || !oF.locked ? " · without key lock here, the speed change moves the pitch" : "";
        if (!window.__gbAudio || !__gbAudio([{ buf: oL.buf, name: nm(L), start: Math.max(0, stL) }, { buf: oF.buf, name: nm(F), start: Math.max(0, stF) }], { bpm, song: "DJ mashup", open: true,
          say: "Both songs at " + bpm + " BPM, " + (live ? "lined up as they were playing" : "first downbeats on the same bar") + keyNote + ". Split, move and copy to build the mashup" + pitchNote0 })) { djMsg("Couldn't put the songs in the Garage"); return; }
        const pitchNote = !oL.locked || !oF.locked ? " · without key lock here, the speed change moves the pitch" : "";
        djMsg("Both songs are in the Garage at " + bpm + " BPM" + keyNote + pitchNote, true);
      } catch (e) { djMsg("Couldn't put the songs in the Garage: " + (e && e.message || e)); }
      finally { busy = false; btn.disabled = false; btn.textContent = "→ Garage"; }
    }
    btn.addEventListener("click", toTracks);
  }
  // ======================================================================
  // mouse: the wheel scrolls sideways rows, and fine-tunes the slider or knob you've clicked
  // ======================================================================
  {
    const sideways = el => {
      for (let n = 0; el && el !== document.body && n < 8; el = el.parentElement, n++) {
        if (el.scrollWidth <= el.clientWidth + 2) continue;
        const cs = getComputedStyle(el);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && !(el.scrollHeight > el.clientHeight + 2 && (cs.overflowY === "auto" || cs.overflowY === "scroll"))) return el;
      }
      return null;
    };
    document.addEventListener("wheel", e => {
      if (e.ctrlKey) return;
      const t = e.target;
      // a focused slider or knob: the wheel moves it
      const kn = t.closest && t.closest(".knob");
      if (kn && kn === document.activeElement) { e.preventDefault(); kn.dispatchEvent(new KeyboardEvent("keydown", { key: e.deltaY < 0 ? "ArrowUp" : "ArrowDown", bubbles: true })); return; }
      if (t.matches && t.matches('input[type="range"]') && t === document.activeElement && !t.disabled) {
        e.preventDefault();
        const st = +t.step || 1, mn = +t.min || 0, mx = t.max === "" ? 100 : +t.max, by = Math.max(st, (mx - mn) / 100);
        t.value = Math.max(mn, Math.min(mx, +t.value + (e.deltaY < 0 ? by : -by)));
        t.dispatchEvent(new Event("input", { bubbles: true })); t.dispatchEvent(new Event("change", { bubbles: true })); return;
      }
      // a row that scrolls sideways takes vertical wheel turns until it reaches its end
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const row = sideways(t); if (!row) return;
      const before = row.scrollLeft; row.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
      if (row.scrollLeft !== before) e.preventDefault();
    }, { passive: false, capture: true });
    // clicking a knob with the mouse focuses it, so the wheel and arrow keys reach it
    document.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") return; const kn = e.target.closest && e.target.closest(".knob"); if (kn && kn !== document.activeElement) { try { kn.focus({ preventScroll: true }); } catch (er) {} } }, true);
  }
  // the start screen answers Enter or Space
  { const sb = document.getElementById("startBtn"), st = document.getElementById("start"); if (sb && st && !st.hidden) { try { sb.focus({ preventScroll: true }); } catch (e) {} } }
  // ======================================================================
  // fit: on a short window, Seq and Notes start with the slider panel tucked away (Sound / FX / Arp bring it back);
  // going back to Keys brings back whatever was open
  // ======================================================================
  {
    const shortWin = () => innerWidth > 600 && innerHeight < 820;
    let autoHid = null;
    const om = setMode;
    setMode = function (mode) {
      om(mode);
      try {
        if (((mode === "seq" && shortWin()) || (mode === "notes" && innerWidth > 600 && innerHeight < 960)) && state.panel !== "hide" && state.panel !== "jam") { if (autoHid == null) autoHid = state.panel; setPanel("hide"); }
        else if (mode === "keys" && autoHid != null) { const was = autoHid; autoHid = null; if (state.panel === "hide") setPanel(was); }
      } catch (e) {}
    };
    ["pSound", "pFx", "pArp", "pLab", "pJam", "pHide"].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => { autoHid = null; }); });
  }
  // ======================================================================
  // Exit: save your work as a project, stop everything, let go of the sound
  // ======================================================================
  {
    const sheet = document.getElementById("exitSheet"), nameEl = document.getElementById("exitName"), info = document.getElementById("exitInfo");
    const saveBtn = document.getElementById("exitSave"), noBtn = document.getElementById("exitNoSave");
    const shut = document.createElement("div");
    shut.className = "exitscreen"; shut.id = "exitScreen"; shut.hidden = true;
    shut.innerHTML = '<div class="ex-card"><h2>Nate Bloom is closed</h2><p id="exitMsg"></p><p class="ex-sub">You can close this window. Opening Nate Bloom again picks up where you left off.</p><button class="btn big primary" id="exitAgain">Open again</button></div>';
    document.body.appendChild(shut);
    document.getElementById("exitBtn").addEventListener("click", () => {
      nameEl.value = "Session " + stamp(); info.textContent = ""; saveBtn.disabled = noBtn.disabled = false; sheet.hidden = false;
    });
    document.getElementById("exitCancel").addEventListener("click", () => { sheet.hidden = true; });
    async function leave(msg) {
      window.__nbClosed = true;
      try { save(); } catch (e) {}
      try { document.getElementById("stopAll").click(); } catch (e) {}
      try { if (ctx && ctx.state === "running") await ctx.suspend(); } catch (e) {}
      try { if (keepAlive) keepAlive.pause(); } catch (e) {}
      sheet.hidden = true;
      document.getElementById("exitMsg").textContent = msg;
      shut.hidden = false;
      try { window.__nbAdd && window.__nbAdd("exit", msg); } catch (e) {}
      // an installed app's window can close itself; a browser tab usually can't, and keeps this screen
      try { if (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches) setTimeout(() => { try { window.close(); } catch (e) {} }, 900); } catch (e) {}
    }
    saveBtn.addEventListener("click", async () => {
      const name = (nameEl.value || "").trim() || "Session " + stamp();
      saveBtn.disabled = noBtn.disabled = true; info.textContent = "Saving…";
      try {
        const p = await snapshotProject(name); p.size = sizeOf(p);
        const st = await projDB("readwrite");
        await new Promise((res, rej) => { const r = st.put(p, "p" + Date.now()); r.onsuccess = res; r.onerror = () => rej(r.error); });
        await leave("Saved as “" + name + "” in Projects.");
      } catch (e) {
        info.textContent = "Couldn't save: " + (e && e.message ? e.message : "storage is full?") + " Nothing was closed.";
        saveBtn.disabled = noBtn.disabled = false;
      }
    });
    noBtn.addEventListener("click", () => leave("Closed without adding a project."));
    document.getElementById("exitAgain").addEventListener("click", () => { window.__nbClosed = false; shut.hidden = true; start(); });
  }
  // ======================================================================
  // what you play: Synths · Samples · Drums (DJ and Rhythm open their own screens)
  // ======================================================================
  {
    const modesEl = document.getElementById("modes"), toolRow = document.getElementById("toolRow"), hright = document.querySelector("header .hright");
    const MODE_OF = e => e === "drum" ? "drums" : (e === "samp" || e === "pads") ? "samples" : "synths";
    const PADLIKE = () => state.engine === "drum" || state.engine === "pads";
    let mem = { synths: "saw", samples: "samp" };
    try { Object.assign(mem, JSON.parse(localStorage.getItem("nightbloom-modemem") || "{}")); } catch (e) {}
    // where the section sits: top right on wide screens, the row under the title otherwise (fixed along the bottom on a phone)
    const wide = matchMedia("(min-width: 1100px)");
    const place = () => { if (wide.matches) { if (modesEl.parentElement !== hright) hright.appendChild(modesEl); } else if (modesEl.parentElement !== toolRow) toolRow.insertBefore(modesEl, toolRow.firstChild); };
    place(); try { wide.addEventListener("change", place); } catch (e) { wide.addListener(place); }
    // the engine row: label each tab with its section
    const classify = () => {
      [...tabsEl.children].forEach(el => {
        const t = el.querySelector && el.querySelector(".tab"), eng = t && t.dataset.engine;
        let m = "synths";
        if (el.classList.contains("tabs-lab")) m = (el.classList.contains("eng") || el.classList.contains("snd")) ? "synths" : "none";
        else if (eng === "drum") m = "drums";
        else if (eng === "samp" || eng === "pads") m = "samples";
        if (el.dataset.m !== m) el.dataset.m = m;
      });
    };
    new MutationObserver(classify).observe(tabsEl, { childList: true });
    // dimmed, with the reason
    const NA = [
      ["chordWrap", "Chords play on the keys. Each pad plays one sound."],
      ["octGroup", "The octave moves the keys. The pads stay the same."],
      ["pArp", "The arpeggiator plays held keys, not pads."],
      ["hold", "Hold keeps keys ringing. Pads play once per tap."],
    ];
    const say = msg => { const el = document.getElementById("uiToast"); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { el.hidden = true; }, 2600); };
    const block = e => {
      const na = e.target && e.target.closest && e.target.closest(".na"); if (!na) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.type === "click") say(na.dataset.why || "That doesn't apply here.");
    };
    ["click", "pointerdown", "mousedown", "touchstart"].forEach(t => document.addEventListener(t, block, { capture: true, passive: false }));
    function paintModes() {
      const m = MODE_OF(state.engine);
      if (m !== "drums") mem[m] = state.engine;
      try { localStorage.setItem("nightbloom-modemem", JSON.stringify(mem)); } catch (e) {}
      classify();
      if (tabsEl.dataset.mode !== m) tabsEl.dataset.mode = m;
      modesEl.querySelectorAll(".btn.mode[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      const pad = PADLIKE();
      NA.forEach(([id, why]) => {
        const el = document.getElementById(id); if (!el) return;
        el.classList.toggle("na", pad); if (pad) { el.dataset.why = why; el.setAttribute("aria-disabled", "true"); } else el.removeAttribute("aria-disabled");
      });
      // the selected tab of this section scrolls into view
      const cur = tabsEl.querySelector('.tab[aria-pressed="true"]');
      if (cur && m !== "drums") { const r = cur.getBoundingClientRect(), R = tabsEl.getBoundingClientRect(); if (r.right > R.right || r.left < R.left) tabsEl.scrollLeft += r.left - R.left - 40; }
    }
    window.__nbPaintModes = paintModes;
    const usb = updateSoundBar;
    updateSoundBar = function () { const r = usb.apply(this, arguments); try { paintModes(); } catch (e) {} return r; };
    modesEl.querySelectorAll(".btn.mode[data-mode]").forEach(b => b.addEventListener("click", () => {
      start();
      const m = b.dataset.mode; if (MODE_OF(state.engine) === m) return;
      let target = m === "drums" ? "drum" : mem[m];
      if (!target || MODE_OF(target) !== m || !tabsEl.querySelector('.tab[data-engine="' + target + '"]')) target = m === "samples" ? "samp" : "saw";
      const tab = tabsEl.querySelector('.tab[data-engine="' + target + '"]');
      if (tab) tab.click(); else { state.engine = target; renderEngine(); save(); }
      paintModes();
    }));
    paintModes();
  }
  // ======================================================================
  // Rhythm Creator: real drums (Studio kit), feel, room, kit swap
  // ======================================================================
  // takes back most of the compressor's automatic make-up gain (+3.5 dB measured), so the kit peaks where it did before the glue
  const RC_GLUE_TRIM = 0.85;
  // Studio levels against the 909 kit, measured hit for hit
  const RC_ST_GAIN = { "st:kick": 1.5, "st:snare": 1.35, "st:rim": 1, "st:xstick": 1.05, "st:hhc": 2.2, "st:hhp": 0.8, "st:hho": 2.1, "st:ltom": 1, "st:mtom": 1, "st:htom": 1, "st:ride": 1.6, "st:bell": 1.2, "st:crash": 1,
    "st:shaker": 0.65, "st:tamb": 0.6, "st:cowbell": 0.85, "st:conga": 0.9, "st:tumba": 0.9, "st:bongoh": 0.9, "st:bongol": 0.9, "st:claves": 0.85, "st:cabasa": 0.85, "st:agogoh": 0.8, "st:agogol": 0.8, "st:tri": 0.75 };
  // ---------- the recordings: decoded on first use, each take starts at its own onset ----------
  const STK = { buf: {}, pend: {}, last: {}, alt: {} };
  const STK_SRC = { mtom: "htom" }, STK_TUNE = { mtom: -4 };   // the mid tom is the high tom tuned down
  function rcStOnset(b) {
    const a = b.getChannelData(0), c = b.numberOfChannels > 1 ? b.getChannelData(1) : a, n = Math.min(a.length, Math.round(b.sampleRate * 0.15));
    let pk = 0; for (let i = 0; i < n; i++) { const v = Math.max(Math.abs(a[i]), Math.abs(c[i])); if (v > pk) pk = v; }
    const th = pk * 0.05; for (let i = 0; i < n; i++) if (Math.abs(a[i]) > th || Math.abs(c[i]) > th) return Math.max(0, i / b.sampleRate - 0.001);
    return 0;
  }
  function rcStLoad(pc) {
    const src = STK_SRC[pc] || pc;
    if (STK.buf[src]) return STK.buf[src];
    if (STK.pend[src] || !ctx || !window.NB_STUDIO || !NB_STUDIO[src]) return null;
    STK.pend[src] = Promise.all(NB_STUDIO[src].map(layer => Promise.all(layer.map(b64 => decode(rcB64(b64)).then(b => { b.__on = rcStOnset(b); return b; })))))
      .then(L => { STK.buf[src] = L; delete STK.pend[src]; }, () => { delete STK.pend[src]; });
    return null;
  }
  // velocity picks the loudness layer, then an alternate take that isn't the last one played
  function rcStHit(id, t, p, out) {
    const pc = id.slice(3), L = rcStLoad(pc); if (!L) return null;
    const vel = Math.max(0, p.v / rcGain(id)), n = L.length;
    let li;
    if (pc === "shaker") li = (STK.alt[id] = !STK.alt[id]) ? 0 : Math.min(1, n - 1);   // down and up strokes, like a hand
    else li = Math.max(0, Math.min(n - 1, Math.round((vel - 0.25) / 0.75 * (n - 1))));
    const layer = L[li], key = id + li;
    let ri = Math.floor(Math.random() * layer.length);
    if (layer.length > 1 && ri === STK.last[key]) ri = (ri + 1 + Math.floor(Math.random() * (layer.length - 1))) % layer.length;
    STK.last[key] = ri;
    const b = layer[ri], lv = pc === "shaker" ? 0.7 : n > 1 ? 0.25 + 0.75 * li / (n - 1) : 0.7;
    const g = Math.max(0.6, Math.min(1.35, Math.pow(Math.max(0.05, vel) / lv, 0.6)));
    const V = rcV(t, out, rcGain(id) * g), s = V.buf(b), gg = V.g(1);
    s.__off = b.__on || 0;
    s.playbackRate.value = p.r * Math.pow(2, (STK_TUNE[pc] || 0) / 12) * (1 + (Math.random() - 0.5) * 0.005);
    let node = s;
    if (p.tone < 0.48) { const f = V.f("lowpass", 300 * Math.pow(2, p.tone / 0.48 * 6), 0.7); node.connect(f); node = f; }
    else if (p.tone > 0.52) { const f = V.f("highpass", 30 * Math.pow(2, (p.tone - 0.52) / 0.48 * 6), 0.7); node.connect(f); node = f; }
    node.connect(gg).connect(V.o);
    const full = (b.duration - s.__off) / s.playbackRate.value, len = Math.min(full, p.dec >= 0.5 ? full : Math.max(0.04, full * Math.pow(p.dec / 0.5, 1.4)));
    gg.gain.setValueAtTime(1, t); if (len < full) { gg.gain.setValueAtTime(1, t + len * 0.6); gg.gain.linearRampToValueAtTime(0, t + len); }
    V.end = t + len + 0.01;
    return V.go();
  }
  Object.entries(RC_ST_GAIN).forEach(([k, v]) => { RC_GAIN[k] = v * 0.8; });   // the whole Studio kit sits about where the 909 kit did
  // ---------- feel: what a drummer does without thinking ----------
  const rcGauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  function rcFeel(tr, s) {
    const F = RCP.feel || 0; if (F <= 0) return { dt: 0, dv: 1 };
    const role = (rcSnd(tr.snd) || {}).role || "perc", pos = rcIsBeat(s) ? 0 : s % 2 === 0 ? 2 : 1;
    let dt = Math.max(-0.012, Math.min(0.012, rcGauss() * F * 0.0045)), dv = 1 + Math.max(-0.18, Math.min(0.18, rcGauss() * F * 0.07));
    if (role === "ch" || role === "shaker" || role === "ride") dv *= pos === 0 ? 1 : pos === 2 ? 1 - 0.16 * F : 1 - 0.34 * F;   // hats breathe
    if (role === "snare" && !tr.acc[s] && pos !== 0) dv *= 1 - 0.55 * F;   // off-beat snare hits are ghost notes
    if (role === "snare" || role === "clap") dt += 0.004 * F;   // the backbeat sits a hair behind
    if (role === "kick" || role === "boom") dt -= 0.001 * F;
    return { dt, dv };
  }
  // ---------- room: a small studio, each track sends to it ----------
  const RC_ROOM_ROLE = { kick: 0.4, boom: 0, snare: 1, clap: 0.9, rim: 0.9, tom: 0.9, ch: 0.5, oh: 0.65, ride: 0.55, cym: 0.65, perc: 0.8, shaker: 0.6, bell: 0.7, fx: 0.5 };
  function rcRoomIR() {
    // Lite: one channel and a shorter tail, half the work on a slow computer
    const lite = !!window.NB_LITE, sr = ctx.sampleRate, len = Math.round(sr * (lite ? 0.36 : 0.6)), b = ctx.createBuffer(lite ? 1 : 2, len, sr), rt = lite ? 0.38 : 0.45;
    const ER = [[0.0041, 0.55], [0.0067, -0.45], [0.0093, 0.38], [0.0124, -0.32], [0.0161, 0.27], [0.0207, -0.22], [0.0259, 0.18], [0.0316, -0.14], [0.0378, 0.11]];
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c); let lp = 0, e = 0;
      ER.forEach(([dt, g], k) => { const i = Math.round(dt * (c ? 1.09 : 0.93) * sr); if (i < len) d[i] += g * (c && k % 3 === 1 ? -1 : 1); });
      for (let i = Math.round(0.005 * sr); i < len; i++) {
        const tt = i / sr, env = Math.exp(-6.91 * tt / rt) * Math.min(1, (tt - 0.005) / 0.015), k = Math.min(0.92, 0.2 + tt * 1.7);
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);   // the tail darkens as it dies, like walls soaking up the highs
        d[i] += lp * env * 0.5;
      }
      const f = Math.round(0.02 * sr); for (let i = 0; i < f; i++) d[len - 1 - i] *= i / f;
      for (let i = 0; i < len; i++) e += d[i] * d[i];
      const g = Math.sqrt(0.3 / e); for (let i = 0; i < len; i++) d[i] *= g;
    }
    return b;
  }
  // the room only runs while drums play (and its tail rings out); asleep it costs nothing
  function rcRoomIn() {
    if (!RC.room) {
      const inG = ctx.createGain(), hp = ctx.createBiquadFilter(), cv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), ret = ctx.createGain();
      hp.type = "highpass"; hp.frequency.value = 240; hp.Q.value = 0.6; lp.type = "lowpass"; lp.frequency.value = 7500; lp.Q.value = 0.5;
      if (window.NB_LITE) { hp.channelCount = 1; hp.channelCountMode = "explicit"; }
      cv.normalize = false; cv.buffer = rcRoomIR();
      inG.connect(hp); lp.connect(ret).connect(rcBus());
      RC.room = { in: inG, hp, cv, lp, ret, awake: false };
    }
    return RC.room.in;
  }
  function rcRoomWake() {
    const R = RC.room; if (!R || R.awake || !(RCP.room > 0)) return;
    R.hp.connect(R.cv); R.cv.connect(R.lp); R.awake = true;
  }
  function rcRoomSleep() {
    const R = RC.room; if (!R || !R.awake) return;
    try { R.hp.disconnect(R.cv); } catch (e) {} try { R.cv.disconnect(R.lp); } catch (e) {} R.awake = false;
  }
  { const h0 = rcHit; rcHit = function (i, t) { if (ctx) { rcRoomWake(); clearTimeout(RC.roomT); RC.roomT = setTimeout(rcRoomSleep, Math.max(0, (t || 0) - ctx.currentTime) * 1000 + 2000); } return h0.apply(this, arguments); }; }
  const rcSendAmt = i => {
    const tr = RCP.tracks[i]; if (!tr) return 0;
    const sd = rcSnd(tr.snd), role = (sd || {}).role || "perc", st = tr.snd.startsWith("st:");
    return (RCP.room || 0) * (RC_ROOM_ROLE[role] ?? 0.7) * (st ? 2 * tr.char : 0.75);
  };
  function rcSendWire(i, node) {
    const T = RC.trk[i]; if (!T) return;
    const a = rcSendAmt(i);
    if (!T.send) { if (a <= 0.001) return; T.send = ctx.createGain(); T.send.gain.value = 0; T.send.connect(rcRoomIn()); }
    node.connect(T.send); T.send.gain.setTargetAtTime(a, ctx.currentTime, 0.02);
  }
  function rcSendLevel(i) {
    const T = RC.trk[i]; if (!T || !ctx) return;
    const a = rcSendAmt(i);
    if (!T.send) { if (a > 0.001) rcWire(i); return; }
    T.send.gain.setTargetAtTime(a, ctx.currentTime, 0.03);
  }
  const rcSendAll = () => { if (ctx) RCP.tracks.forEach((tr, i) => rcSendLevel(i)); };
  // ---------- kits: every track to the matching sound of one kit ----------
  const RC_KITS = {
    studio: ["Studio (real drums)", { kick: ["st:kick"], snare: ["st:snare", "st:rim"], clap: ["st:rim"], rim: ["st:xstick"], tom: ["st:ltom", "st:mtom", "st:htom"], ch: ["st:hhc", "st:hhp"], oh: ["st:hho"], cym: ["st:crash"], ride: ["st:ride", "st:bell"], bell: ["st:cowbell", "st:agogoh", "st:agogol", "st:tri"], perc: ["st:conga", "st:bongoh", "st:tumba", "st:bongol", "st:claves"], shaker: ["st:shaker", "st:cabasa"] }],
    "808": ["808", { kick: ["808:bd"], snare: ["808:sd"], clap: ["808:cp"], rim: ["808:rs"], tom: ["808:lt", "808:mt", "808:ht"], ch: ["808:ch"], oh: ["808:oh"], cym: ["808:cy"], ride: ["808:cy"], bell: ["808:cb"], perc: ["808:lc", "808:mc", "808:hc", "808:cl"], shaker: ["808:ma"] }],
    "909": ["909", { kick: ["909:bd"], snare: ["909:sd"], clap: ["909:cp"], rim: ["909:rs"], tom: ["909:lt", "909:mt", "909:ht"], ch: ["909:ch"], oh: ["909:oh"], cym: ["909:cr"], ride: ["909:rd"], bell: ["808:cb"], perc: ["808:lc", "808:mc", "808:hc"], shaker: ["hp:shaker"] }],
    f8: ["Real 808 (samples)", { kick: ["f8:bd", "f8:bdl"], snare: ["f8:sd"], clap: ["f8:cp"], rim: ["f8:rs"], tom: ["f8:lt", "f8:mt", "f8:ht"], ch: ["f8:ch"], oh: ["f8:oh"], cym: ["f8:cy"], ride: ["f8:cy"], bell: ["f8:cb"], perc: ["f8:lc", "f8:mc", "f8:hc", "f8:cl"], shaker: ["f8:ma"] }],
    analog: ["Analog", { kick: ["an:bd", "an:sbd"], snare: ["an:sd", "an:ssd"], clap: ["an:ssd"], ch: ["an:mh", "an:rh"], oh: ["909:oh"] }],
  };
  if (window.NB_KITS) Object.entries(NB_KITS).forEach(([kid, K]) => {
    const find = re => { const j = K.pads.findIndex(pd => pd && re.test(pd.name)); return j < 0 ? null : "k:" + kid + ":" + j; };
    const m = { kick: [find(/kick/i)], snare: [find(/snare/i)], clap: [find(/clap/i)], rim: [find(/rim/i)], tom: [find(/low tom/i), find(/mid tom/i), find(/high tom/i)], ch: [find(/closed/i)], oh: [find(/open/i)], cym: [find(/crash/i)], ride: [find(/ride/i)], bell: [find(/cowbell/i)] };
    Object.keys(m).forEach(k => { m[k] = m[k].filter(Boolean); if (!m[k].length) delete m[k]; });
    RC_KITS["k:" + kid] = [K.name, m];
  });
  const rcKitIds = kid => { const K = RC_KITS[kid]; return new Set(K ? Object.values(K[1]).flat() : []); };
  function rcKitNow() {
    let best = "", bestN = 0; const n0 = RCP.tracks.length;
    Object.keys(RC_KITS).forEach(kid => { const ids = rcKitIds(kid), n = RCP.tracks.filter(tr => ids.has(tr.snd)).length; if (n > bestN) { best = kid; bestN = n; } });
    return bestN >= Math.ceil(n0 * 0.6) ? best : "";
  }
  function rcSwapKit(kid, quiet) {
    const K = RC_KITS[kid]; if (!K) return 0;
    const used = {}; let changed = 0;
    RCP.tracks.forEach((tr, i) => {
      const sd = rcSnd(tr.snd), role = sd && sd.role, list = role && K[1][role]; if (!list || !list.length) return;
      const k = used[role] = (used[role] || 0) + 1, id = list[Math.min(k - 1, list.length - 1)];
      if (id === tr.snd || !rcSnd(id)) return;
      tr.snd = id; tr.tune = 0; tr.decay = 0.5; tr.tone = 0.5; tr.char = 0.5; changed++;
      if (ctx) { if (rcEngine(id) === "smp") rcSampleBuf(id); if (rcEngine(id) === "an") rcAnalogReady().then(ok => { RC.anOK = ok; }); rcApplyTrack(i); }
    });
    if (!quiet) { rcSave(); rcRender(); }
    return changed;
  }
  const kitSel = document.getElementById("rcKitSel");
  function rcPaintKit() {
    const now = rcKitNow();
    kitSel.innerHTML = (now ? "" : `<option value="" selected>Mixed kit · swap to…</option>`) + Object.entries(RC_KITS).map(([kid, K]) => `<option value="${kid}"${kid === now ? " selected" : ""}>${K[0]}</option>`).join("");
    kitSel.classList.toggle("real", now === "studio");
    const fv = Math.round((RCP.feel || 0) * 100), rv = Math.round((RCP.room || 0) * 100);
    document.getElementById("rcFeel").value = fv; document.getElementById("rcFeelV").textContent = fv;
    document.getElementById("rcRoom").value = rv; document.getElementById("rcRoomV").textContent = rv;
  }
  kitSel.addEventListener("change", () => {
    const kid = kitSel.value; if (!kid) return;
    start(); rcPushUndo();
    const n = rcSwapKit(kid);
    if (n) undoToast("Swapped " + n + " track" + (n > 1 ? "s" : "") + " to " + RC_KITS[kid][0], rcDoUndo); else noteMsg("Already on " + RC_KITS[kid][0]);
    rcPaintKit();
    if (RC.sel != null && !RC.playing) setTimeout(() => rcAudition(RC.sel), 350);
  });
  document.getElementById("rcFeel").addEventListener("input", e => { RCP.feel = +e.target.value / 100; document.getElementById("rcFeelV").textContent = e.target.value; rcSave(); });
  document.getElementById("rcRoom").addEventListener("input", e => { RCP.room = +e.target.value / 100; document.getElementById("rcRoomV").textContent = e.target.value; rcSave(); rcSendAll(); if (!(RCP.room > 0)) rcRoomSleep(); else if (RC.playing) rcRoomWake(); });
  // Character on a Studio sound is its room amount
  rcEd.addEventListener("input", e => { if (e.target.dataset && e.target.dataset.k === "char") rcSendLevel(RC.sel); });
  { const r0 = rcRender; rcRender = function () { const r = r0.apply(this, arguments); try { rcPaintKit(); } catch (e) {} return r; }; }
  // a beat still on the old default kit moves to the Studio kit once (Undo puts the old sounds back); a changed kit gets a pointer
  let rcStTip = 0, rcStOld = null;
  try {
    if (!localStorage.getItem("nightbloom-rc-st")) {
      localStorage.setItem("nightbloom-rc-st", "1");
      if (rcHadSaved) {
        const same = RCP.tracks.filter((tr, i) => tr.snd === RC_DEFAULT0[i]).length;
        if (same >= 12) { rcStOld = RCP.tracks.map(tr => [tr.snd, tr.tune, tr.decay, tr.tone, tr.char]); rcSwapKit("studio", true); rcSave(); rcStTip = 1; }
        else rcStTip = 2;
      }
    }
  } catch (e) {}
  const kitNew = document.createElement("span"); kitNew.className = "rc-kitnew"; kitNew.textContent = "New: real drums · pick Studio"; kitNew.hidden = rcStTip !== 2; kitSel.after(kitNew);
  kitSel.addEventListener("change", () => { kitNew.hidden = true; });
  rcBtn.addEventListener("click", () => {
    RCP.tracks.forEach(tr => { if (ctx && tr.snd.startsWith("st:")) rcSampleBuf(tr.snd); });
    if (rcStTip === 1) { rcStTip = 0; const old = rcStOld; setTimeout(() => undoToast("Your beat now plays real recorded drums (Studio kit)", () => {
      RCP.tracks.forEach((tr, i) => { if (old[i]) [tr.snd, tr.tune, tr.decay, tr.tone, tr.char] = old[i]; if (ctx) rcApplyTrack(i); }); rcSave(); rcRender(); }), 300); }
  });
  { const p0 = rcPlay; rcPlay = function (on) { if (on && ctx) RCP.tracks.forEach(tr => { if (tr.snd.startsWith("st:")) rcSampleBuf(tr.snd); }); return p0.apply(this, arguments); }; }
  { const s0 = window.__rcSnap; window.__rcSnap = () => Object.assign(s0(), { feel: RCP.feel, room: RCP.room, kit: rcKitNow(), studioReady: Object.keys(STK.buf), roomNode: !!RC.room, roomAwake: !!(RC.room && RC.room.awake), glue: !!RC.glue }); }
  window.__rcStudio = { load: pc => rcStLoad(pc), buf: STK.buf, last: STK.last, swap: rcSwapKit, kits: () => Object.keys(RC_KITS) };
  rcPaintKit();

