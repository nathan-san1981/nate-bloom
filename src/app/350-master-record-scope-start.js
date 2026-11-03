  // ---------- Record the master output and export it ----------
  const take = { rec: false, L: [], R: [], len: 0, startedAt: 0, done: null, node: null, mute: null, timer: 0 };
  const MAX_TAKE_SEC = NB_BIG ? 3600 : 300;   // (173) an hour on a big computer
  const takeBtn = document.getElementById("takeBtn"), takeBar = document.getElementById("takeBar");
  const takeInfo = document.getElementById("takeInfo");
  const fmtClock = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  const toI16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]; o[i] = v * 0x7fff; } return o; };

  function startTake() {
    start();
    if (take.rec || !analyser) return;
    take.L = []; take.R = []; take.len = 0; take.done = null; takeBar.hidden = true;
    const node = ctx.createScriptProcessor(4096, 2, 2), mute = ctx.createGain(); mute.gain.value = 0;
    node.onaudioprocess = ev => {
      if (!take.rec) return;
      const ib = ev.inputBuffer;
      take.L.push(toI16(ib.getChannelData(0)));
      take.R.push(toI16(ib.numberOfChannels > 1 ? ib.getChannelData(1) : ib.getChannelData(0)));
      take.len += ib.length;
      if (take.len >= ctx.sampleRate * MAX_TAKE_SEC) stopTake();
    };
    analyser.connect(node); node.connect(mute).connect(ctx.destination);
    take.node = node; take.mute = mute; take.rec = true; take.startedAt = ctx.currentTime;
    takeBtn.classList.add("live");
    const tickT = () => { takeBtn.textContent = "■ " + fmtClock(ctx.currentTime - take.startedAt); };
    tickT(); take.timer = setInterval(tickT, 250);
  }
  function stopTake() {
    if (!take.rec) return;
    take.rec = false; clearInterval(take.timer);
    try { analyser.disconnect(take.node); take.node.disconnect(); take.mute.disconnect(); } catch (e) {}
    takeBtn.classList.remove("live"); takeBtn.textContent = "● Rec";
    if (take.len < ctx.sampleRate * 0.2) { takeInfo.textContent = "Take too short to keep."; takeBar.hidden = false; takeBar.dataset.empty = "1"; return; }
    take.done = { L: take.L, R: take.R, len: take.len, rate: ctx.sampleRate };
    take.L = []; take.R = [];
    const mb = (44 + take.done.len * 4) / 1048576;
    takeInfo.textContent = "Take ready · " + fmtClock(take.done.len / take.done.rate) + " · " + mb.toFixed(1) + " MB WAV";
    delete takeBar.dataset.empty;
    takeBar.hidden = false;
  }
  takeBtn.addEventListener("click", () => (take.rec ? stopTake() : startTake()));

  function takeWav(t) {
    const n = t.len, ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, t.rate, true); v.setUint32(28, t.rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 4, true);
    const out = new Int16Array(ab, 44);
    let o = 0;
    for (let c = 0; c < t.L.length; c++) {
      const l = t.L[c], r = t.R[c];
      for (let i = 0; i < l.length && o < n * 2; i++) { out[o++] = l[i]; out[o++] = r[i]; }
    }
    return ab;
  }

  // Minimal store-only ZIP, for viewers that can save .zip but not .wav
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipOne(name, u8) {
    const nm = new TextEncoder().encode(name), crc = crc32(u8), size = u8.length;
    const lh = new DataView(new ArrayBuffer(30)), cd = new DataView(new ArrayBuffer(46)), end = new DataView(new ArrayBuffer(22));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(10, 0, true); lh.setUint16(12, 33, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true);
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(14, 33, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true); cd.setUint16(28, nm.length, true);
    cd.setUint32(42, 0, true);
    const cdSize = 46 + nm.length, cdOff = 30 + nm.length + size;
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, cdOff, true);
    return new Blob([lh, nm, u8, cd, nm, end], { type: "application/zip" });
  }

  function takeName() {
    const d = new Date(), p = x => String(x).padStart(2, "0");
    return `nate-bloom-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }
  async function exportTake() {
    if (!take.done) return;
    const name = takeName(), wav = takeWav(take.done);
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    if (dl) {
      try {
        await dl.save({ filename: name + ".zip", data: zipOne(name + ".wav", new Uint8Array(wav)) });
        takeInfo.textContent = "Saved " + name + ".zip · open it in Files to get the WAV";
      } catch (e) {
        if (e && e.code === "declined") return;
        takeInfo.textContent = e && e.code === "too_large" ? "That take is too large to save here. Record a shorter one." : "Couldn't save here. Try again in a moment.";
      }
      return;
    }
    const file = new File([wav], name + ".wav", { type: "audio/wav" });
    try {
      if (nbShareFiles(file)) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  document.getElementById("takeExport").addEventListener("click", exportTake);
  document.getElementById("takeDiscard").addEventListener("click", () => { take.done = null; takeBar.hidden = true; });
  document.getElementById("takeToSlot").addEventListener("click", async () => {
    if (!take.done) return;
    const wav = takeWav(take.done), i = state.samp.slot;
    try {
      const buf = trimBuffer(await decode(wav.slice(0)));
      const nm = "Resampled take " + fmtClock(take.done.len / take.done.rate);
      setSample(i, buf, nm);
      if (state.samp.slots[i].mode === "grain") state.samp.slots[i].mode = "play";
      storeSample(i, nm, wav);
      state.engine = "samp"; renderEngine(); save();
      takeInfo.textContent = "Loaded into sampler slot S" + (i + 1);
    } catch (e) { takeInfo.textContent = "Couldn't load that take into the sampler."; }
  });

  // ---------- Scope ----------
  const scope = document.getElementById("scope"), sctx = scope.getContext("2d");
  const scopeSz = { w: 0, h: 0 };
  try { new ResizeObserver(() => { scopeSz.w = 0; }).observe(scope); } catch (e) {}
  window.addEventListener("resize", () => { scopeSz.w = 0; });
  const lilac = getComputedStyle(document.documentElement).getPropertyValue("--lilac").trim() || "#c4a3ff";
  let wave = null;
  const amber = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#ffb65c";
  function drawSample(w, h) {
//@site-only
    if (rec.active || pendingPeaks) {
      const peaks = rec.active ? rec.peaks : pendingPeaks;
      const n = rec.active ? Math.max(120, peaks.length) : peaks.length;
      const bw = w / n;
      sctx.fillStyle = "#ff5c8a";
      for (let k = 0; k < peaks.length; k++) {
        const ph = Math.max(1, Math.min(1, peaks[k] * (rec.active ? 2.2 : 1)) * h * 0.86);
        sctx.fillRect(k * bw, (h - ph) / 2, Math.max(1, bw - 0.4), ph);
      }
      if (rec.active && ctx) {
        sctx.fillStyle = "#ffe0ea"; sctx.font = "11px IBM Plex Mono, monospace"; sctx.textAlign = "right"; sctx.textBaseline = "top";
        sctx.fillText((ctx.currentTime - rec.startedAt).toFixed(1) + "s", w - 6, 4);
      }
      return;
    }
//@end
    const i = state.samp.slot, peaks = sampPeaks[i], slot = state.samp.slots[i], P = slot.p;
    if (!peaks) {
      sctx.fillStyle = "#8e86a6"; sctx.font = "11px IBM Plex Mono, monospace"; sctx.textAlign = "center"; sctx.textBaseline = "middle";
      sctx.fillText(ctx ? "Tap Load WAV/MP3 to fill S" + (i + 1) : "Start sound to load samples", w / 2, h / 2);
      return;
    }
    // highlighted region: playback window, or the grain read zone
    let a, b;
    if (slot.mode === "slice") { a = 0; b = 1; }
    else if (slot.mode === "play") { a = P.start * 0.98; b = a + P.length * (1 - a); }
    else { a = P.pos - P.spray * 0.2; b = P.pos + P.spray * 0.2 + 0.01; }
    sctx.fillStyle = "rgba(196,163,255,0.12)";
    sctx.fillRect(Math.max(0, a) * w, 0, (Math.min(1, b) - Math.max(0, a)) * w, h);
    const n = peaks.length, bw = w / n;
    for (let k = 0; k < n; k++) {
      const x = k / n, inside = x >= a && x <= b;
      sctx.fillStyle = inside ? lilac : "rgba(196,163,255,0.35)";
      const ph = Math.max(1, peaks[k] * h * 0.86);
      sctx.fillRect(k * bw, (h - ph) / 2, Math.max(1, bw - 0.6), ph);
    }
    if (slot.mode === "slice") drawSliceMarks(i, w, h);
    if (ctx) {
      const now = ctx.currentTime;
      sctx.fillStyle = amber;
      for (const g of recentGrains) {
        if (g.slot !== i || g.t > now || now - g.t > 0.35) continue;
        const alpha = 1 - (now - g.t) / 0.35;
        sctx.globalAlpha = alpha;
        sctx.fillRect(g.x * w - 1, 2, 2, h - 4);
      }
      sctx.globalAlpha = 1;
    }
  }
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    if (!scopeSz.w) { scopeSz.w = scope.clientWidth; scopeSz.h = scope.clientHeight; }
    const w = scopeSz.w, h = scopeSz.h;
    if (scope.width !== Math.round(w * dpr)) { scope.width = Math.round(w * dpr); scope.height = Math.round(h * dpr); }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, w, h);
    if (state.engine === "samp") { drawSample(w, h); requestAnimationFrame(draw); return; }
    if (state.engine === "pads") { drawPadWave(w, h); requestAnimationFrame(draw); return; }
    sctx.strokeStyle = "rgba(196,163,255,0.12)"; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();
    sctx.strokeStyle = lilac; sctx.lineWidth = 1.6; sctx.beginPath();
    if (analyser) {
      if (!wave) wave = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(wave);
      // trigger on rising zero crossing for a stable trace
      let s = 0;
      for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { s = i; break; }
      const n = wave.length / 2, stp = Math.max(1, Math.floor(n / Math.max(64, w / 2)));   // one point per ~2 px is all a screen shows
      for (let i = 0; i < n; i += stp) {
        const x = (i / (n - 1)) * w, y = h / 2 - wave[s + i] * h * 0.9;
        i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
      }
    } else {
      for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * w, y = h / 2 + Math.sin(i / 80 * Math.PI * 6) * h * 0.18 * Math.sin(i / 80 * Math.PI);
        i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
      }
    }
    sctx.stroke();
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // ---------- Start / unlock ----------
  // iOS: keep audio in the "playback" category so the silent switch never mutes it.
  // Two layers: the Audio Session API (Safari 16.4+) and a looping silent <audio>
  // element, which forces playback mode on older iOS and inside embedded frames.
  function setPlayback() {
//@site-only
    if (recWanted || rec.active || (trec && trec.on && trec.mic)) return;
//@end
//@art-only
    if (trec && trec.on && trec.mic) return;
//@end
    try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch (e) {}
  }
  setPlayback();
  let keepAlive = null;
  function silentWavUrl() {
    const rate = 8000, n = rate * 20; // 20 s of silence, 8-bit mono (fewer loop restarts)
    const b = new ArrayBuffer(44 + n), v = new DataView(b);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, "data"); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
  }
  function ensureKeepAlive() {
    try {
      if (!keepAlive) {
        keepAlive = document.createElement("audio");
        keepAlive.src = silentWavUrl();
        keepAlive.loop = true;
        keepAlive.setAttribute("playsinline", "");
        keepAlive.setAttribute("x-webkit-airplay", "deny");
        keepAlive.preload = "auto";
        keepAlive.style.display = "none";
        document.body.appendChild(keepAlive);
      }
      if (keepAlive.paused) { const p = keepAlive.play(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  }
  {   // (its own block: its helpers keep their short names)
