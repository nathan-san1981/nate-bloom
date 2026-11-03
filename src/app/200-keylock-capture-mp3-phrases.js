  // ---------- Key lock for the decks: speed changes without the pitch changing ----------
  // A small time-stretcher (WSOLA) runs in an AudioWorklet per deck: it plays the song at any speed
  // while keeping its pitch, and drops to plain playback when key lock is off. Where worklets can't
  // run (the claude.ai preview) the decks keep working the old way and the button stays hidden.
  const STRETCH_SRC = `
class NBStretch extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.P = 1; this.L = null; this.R = null; this.len = 0; this.sc = 1; this.pos = 0; this.rate = 1; this.playing = false; this.startAt = -1; this.stopAt = -1; this.loop = null; this.on = true;
    const N = this.N = 2048, H = this.H = 512; this.OV = 512; this.SR = 360;
    this.win = new Float32Array(N); for (let i = 0; i < N; i++) this.win[i] = (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)) * 0.5;
    this.accL = new Float32Array(N); this.accR = new Float32Array(N); this.outL = new Float32Array(H); this.outR = new Float32Array(H); this.outN = 0; this.outI = 0; this.prev = -1; this.sent = 0;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.buf) { this.L = m.buf.L; this.R = m.buf.R; this.len = this.L.length; this.sc = this.L instanceof Int16Array ? 1 / 32767 : 1; }
      switch (m.cmd) {
        case "start": this.pos = m.from * sampleRate; this.rate = m.rate; this.P = m.pitch || 1; this.startAt = m.at; this.stopAt = -1; this.loop = m.loop ? { a: m.loop.a * sampleRate, b: m.loop.b * sampleRate } : null; this.on = m.on !== false; this.playing = true; this.fresh(); break;
        case "stop": this.stopAt = m.at; break;
        case "rate": this.rate = m.rate; break;
        case "loop": this.loop = m.loop ? { a: m.loop.a * sampleRate, b: m.loop.b * sampleRate } : null; break;
        case "keylock": if (this.playing) this.pos = this.posOut(); this.on = !!m.on; this.fresh(); break;
        case "pitch": if (this.playing) this.pos = this.posOut(); this.P = m.pitch || 1; this.fresh(); break;
      }
    };
    const po = options && options.processorOptions;   // set up in one go (offline rendering)
    if (po && po.L) { this.L = po.L; this.R = po.R || po.L; this.len = this.L.length; this.sc = this.L instanceof Int16Array ? 1 / 32767 : 1; this.pos = (po.from || 0) * sampleRate; this.rate = po.rate || 1; this.P = po.pitch || 1; this.on = true; this.playing = true; this.startAt = -1; }
  }
  fresh() { this.accL.fill(0); this.accR.fill(0); this.outN = 0; this.outI = 0; this.prev = -1; }
  wrap(p) { const l = this.loop; if (l && p >= l.b && l.b > l.a) p = l.a + ((p - l.a) % (l.b - l.a)); return p; }
  at(arr, p) { const i = Math.floor(p); if (i < 0 || i >= this.len) return 0; if (i >= this.len - 1) return arr[i]; const f = p - i; return arr[i] + (arr[i + 1] - arr[i]) * f; }
  produce() {
    const N = this.N, H = this.H, OV = this.OV, SR = this.SR, L = this.L, R = this.R, win = this.win, accL = this.accL, accR = this.accR, len = this.len, P = this.P;
    const target = this.wrap(this.pos); let src = target;
    if (this.prev >= 0) {
      const ref = this.prev + H * P; let best = -1e30, bestD = 0;
      if (ref + OV * P + 2 < len) {
        const scan = (step, from, to) => {
          for (let d = from; d <= to; d += step) {
            const c = Math.floor(target + d); if (c < 0 || c + OV * P + 2 >= len) continue;
            let s = 0, e = 0;
            for (let i = 0; i < OV; i += 2) { const q = Math.floor(i * P), ri = Math.floor(ref) + q, ci = c + q; const a = L[ri] + R[ri], b = L[ci] + R[ci]; s += a * b; e += b * b; }
            const v = e > 1e-9 ? s / Math.sqrt(e) : -1e30; if (v > best) { best = v; bestD = d; }
          }
        };
        scan(3, -SR, SR); const d0 = bestD; scan(1, d0 - 2, d0 + 2);
      }
      src = target + bestD;
    }
    const si = Math.max(0, Math.floor(src));
    if (P === 1) { for (let i = 0; i < N; i++) { const k = si + i; if (k >= len) break; accL[i] += L[k] * win[i]; accR[i] += R[k] * win[i]; } }
    else { for (let i = 0; i < N; i++) { const q = si + i * P, k = Math.floor(q); if (k >= len - 1) break; const f = q - k; accL[i] += (L[k] + (L[k + 1] - L[k]) * f) * win[i]; accR[i] += (R[k] + (R[k + 1] - R[k]) * f) * win[i]; } }
    this.outL.set(accL.subarray(0, H)); this.outR.set(accR.subarray(0, H)); this.outN = H; this.outI = 0;
    accL.copyWithin(0, H); accL.fill(0, N - H); accR.copyWithin(0, H); accR.fill(0, N - H);
    this.prev = si; this.pos += H * this.rate;
  }
  posOut() { return this.on && this.outN ? Math.max(0, this.pos - (this.outN - this.outI) * this.rate) : this.pos; }
  end() { this.playing = false; this.port.postMessage({ ended: true }); }
  process(inputs, outputs) {
    const out = outputs[0], oL = out[0], oR = out[1] || out[0], n = oL.length, t = currentTime, sr = sampleRate;
    oL.fill(0); if (oR !== oL) oR.fill(0);
    if (!this.playing || !this.L) return true;
    let k0 = 0;
    if (this.startAt >= 0) { if (t + n / sr <= this.startAt) return true; k0 = Math.max(0, Math.min(n, Math.round((this.startAt - t) * sr))); this.startAt = -1; }
    let kEnd = n, stopping = false;
    if (this.stopAt >= 0 && t + n / sr > this.stopAt) { kEnd = Math.max(0, Math.min(n, Math.round((this.stopAt - t) * sr))); stopping = true; }
    const direct = (!this.on || Math.abs(this.rate - 1) < 0.003) && this.P === 1;
    for (let k = k0; k < kEnd; k++) {
      if (direct) { const p = this.wrap(this.pos); if (p >= this.len - 1) { this.end(); break; } oL[k] = this.at(this.L, p) * this.sc; oR[k] = this.at(this.R, p) * this.sc; this.pos += this.rate; }
      else { if (this.outI >= this.outN) { if (this.wrap(this.pos) >= this.len - this.N * this.P - 2) { this.end(); break; } this.produce(); } oL[k] = this.outL[this.outI] * this.sc; oR[k] = this.outR[this.outI] * this.sc; this.outI++; }
    }
    if (stopping) { this.playing = false; this.stopAt = -1; }
    this.sent += n; if (this.sent >= 4096) { this.sent = 0; this.port.postMessage({ pos: this.posOut() / sr }); }
    return true;
  }
}
registerProcessor("nb-stretch", NBStretch);`;
  DJ.keylock = true; DJ.stretchOK = null;
  try { const o = JSON.parse(localStorage.getItem("nightbloom-dj2") || "{}"); if (o.keylock === false) DJ.keylock = false; } catch (e) {}
  async function djStretchReady() {
    if (DJ.stretchOK !== null) return DJ.stretchOK;
    DJ.stretchOK = false;
    if (!ctx || !ctx.audioWorklet) return false;
    for (const url of [() => URL.createObjectURL(new Blob([STRETCH_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(STRETCH_SRC)]) {
      try { await ctx.audioWorklet.addModule(url()); DJ.stretchOK = true; break; } catch (e) {}
    }
    const kb = document.getElementById("djKeyLock"); if (kb) kb.hidden = !DJ.stretchOK;
    return DJ.stretchOK;
  }
  function djStretchAttach(d) {
    if (!DJ.stretchOK || !d.buf) return;
    if (!d.st) {
      d.st = new AudioWorkletNode(ctx, "nb-stretch", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      d.st.port.onmessage = e => {
        const m = e.data;
        if (m.ended) { if (d.src && d.src.isStretch && d.src.onended) d.src.onended(); }
        else if (m.pos != null && d.playing && d.src && d.src.isStretch && ctx.currentTime > d.t0 + 0.15) { const want = djPos(d); if (Math.abs(m.pos - want) > 0.025 && !d.loop) { d.p0 = m.pos; d.t0 = ctx.currentTime; } }
      };
    }
    // 16-bit (half the memory of a float copy), made a slice at a time so the screen never stalls; the deck plays
    // the plain way until it's ready, then switches over if its speed or key has moved
    const buf = d.buf, my = d.stJob = (d.stJob || 0) + 1; d.stReady = false;
    const i16 = async a => { const o = new Int16Array(a.length); for (let s0 = 0; s0 < a.length; s0 += 1 << 18) { const e = Math.min(a.length, s0 + (1 << 18)); for (let i = s0; i < e; i++) { const v = a[i]; o[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : v * 32767; } await new Promise(r => setTimeout(r, 0)); if (d.stJob !== my) return null; } return o; };
    (async () => {
      const L = await i16(buf.getChannelData(0)); if (!L) return;
      const R = buf.numberOfChannels > 1 ? await i16(buf.getChannelData(1)) : L.slice(); if (!R || d.buf !== buf || d.stJob !== my) return;
      d.st.port.postMessage({ buf: { L, R } }, [L.buffer, R.buffer]);
      d.stReady = true;
      if (d.playing && ctx && (Math.abs(d.rate * d.bend - 1) > 0.003 || d.semi)) djStartSrc(d, ctx.currentTime + 0.03, djPos(d));
    })();
  }
  // a stand-in for the buffer source the deck code already knows how to drive
  function djStretchSrc(d) {
    const node = d.st, s = { isStretch: true, onended: null, _loop: false, _a: 0, _b: 0, playbackRate: { value: 1, setValueAtTime(v) { s.playbackRate.value = v; node.port.postMessage({ cmd: "rate", rate: v }); } } };
    const sendLoop = () => node.port.postMessage({ cmd: "loop", loop: s._loop ? { a: s._a, b: s._b } : null });
    Object.defineProperty(s, "loop", { get: () => s._loop, set: v => { s._loop = !!v; sendLoop(); } });
    Object.defineProperty(s, "loopStart", { get: () => s._a, set: v => { s._a = v; if (s._loop) sendLoop(); } });
    Object.defineProperty(s, "loopEnd", { get: () => s._b, set: v => { s._b = v; if (s._loop) sendLoop(); } });
    s.connect = n => { try { node.disconnect(); } catch (e) {} node.connect(n); return n; };
    s.start = (at, from) => node.port.postMessage({ cmd: "start", at, from, rate: s.playbackRate.value, loop: s._loop ? { a: s._a, b: s._b } : null, on: DJ.keylock || !!d.semi, pitch: Math.pow(2, (d.semi || 0) / 12) });
    s.stop = at => node.port.postMessage({ cmd: "stop", at });
    return s;
  }
  {
    const ss0 = djStartSrc;
    djStartSrc = function (d, at, from) {
      if (!(DJ.keylock !== null && DJ.stretchOK && d.st && d.stReady !== false)) return ss0(d, at, from);
      from = Math.max(0, Math.min(from, d.buf.duration - 0.01));
      const src = djStretchSrc(d); src.playbackRate.value = d.rate * d.bend;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.008);
      if (d.loop) { src._a = d.loop.a; src._b = d.loop.b; src._loop = true; }
      djStopSrc(d, at);
      src.connect(g).connect(d.in);
      src.start(at, from);
      src.onended = () => { if (d.src === src) { d.src = null; d.playing = false; d.p0 = d.buf.duration; djPaintDeck(d); } };
      d.src = src; d.sg = g; d.t0 = at; d.p0 = from; d.playing = true;
    };
    const dl1 = djLoad;
    djLoad = async function (d, buf, name, raw, meta) {
      await djStretchReady();
      await dl1(d, buf, name, raw, meta);
      if (d.buf) djStretchAttach(d);
    };
    const kb = document.getElementById("djKeyLock");
    kb.addEventListener("click", () => {
      DJ.keylock = !DJ.keylock; kb.setAttribute("aria-pressed", String(DJ.keylock));
      try { const o = JSON.parse(localStorage.getItem("nightbloom-dj2") || "{}"); o.keylock = DJ.keylock; localStorage.setItem("nightbloom-dj2", JSON.stringify(o)); } catch (e) {}
      DJ.decks.forEach(d => { if (d.st) d.st.port.postMessage({ cmd: "keylock", on: DJ.keylock }); });
      djMsg(DJ.keylock ? "Key lock on: speed changes keep the pitch" : "Key lock off: speed changes shift the pitch too (classic vinyl feel)");
    });
    kb.setAttribute("aria-pressed", String(DJ.keylock));
  }

  // ---------- Capture: the last 90 seconds of everything you hear are always kept ----------
  // "Keep that" saves a moment after it happened: no Rec button in advance. A worklet keeps the ring
  // buffer off the main thread; a ScriptProcessor does the same job where worklets can't run.
  const CAP = { secs: 90, node: null, kind: "", L: null, R: null, w: 0, filled: 0, ready: false };
  const CAP_SRC = `
class NBCap extends AudioWorkletProcessor {
  constructor() { super(); this.n = Math.round(sampleRate * ${CAP.secs}); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); this.w = 0; this.filled = 0;
    this.job = null;
    this.port.onmessage = e => { const d = e.data;
      if (d === "ping") { this.port.postMessage({ pong: true, filled: this.filled }); return; }
      const want = d === "keep" ? this.n : d && d.keep ? Math.round(d.keep * sampleRate) : 0; if (!want) return;
      const m = Math.min(this.filled, this.n, want); this.job = { m, start: (this.w - m + this.n) % this.n, sent: 0 };
      this.port.postMessage({ begin: true, total: m, rate: sampleRate }); }; }
  // big transfers from the audio thread can get lost on some phones: send the ring a piece at a time
  sendSome() { const J = this.job; try {
      const k = Math.min(16384, J.m - J.sent);
      if (k > 0) { const L = new Float32Array(k), R = new Float32Array(k); for (let i = 0; i < k; i++) { let p = J.start + J.sent + i; if (p >= this.n) p -= this.n; L[i] = this.L[p]; R[i] = this.R[p]; } this.port.postMessage({ at: J.sent, L, R }, [L.buffer, R.buffer]); J.sent += k; }
      if (J.sent >= J.m) { this.port.postMessage({ done: true }); this.job = null; }
    } catch (err) { this.port.postMessage({ err: String(err && err.message || err) }); this.job = null; } }
  process(inputs) { const i = inputs[0];
    if (i && i[0]) { const l = i[0], r = i[1] || i[0]; for (let k = 0; k < l.length; k++) { this.L[this.w] = l[k]; this.R[this.w] = r[k]; this.w++; if (this.w >= this.n) this.w = 0; } this.filled += l.length; }
    if (this.job) this.sendSome();
    return true; }
}
registerProcessor("nb-capture", NBCap);`;
  async function capInit() {
    if (CAP.ready || !ctx || !analyser) return; CAP.ready = true;
    const mute = ctx.createGain(); mute.gain.value = 0;
    if (ctx.audioWorklet) {
      for (const url of [() => URL.createObjectURL(new Blob([CAP_SRC], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(CAP_SRC)]) {
        try { await ctx.audioWorklet.addModule(url()); CAP.node = new AudioWorkletNode(ctx, "nb-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit" }); CAP.kind = "worklet"; break; } catch (e) { CAP.node = null; }
      }
    }
    if (!CAP.node) {
      const n = Math.round(ctx.sampleRate * CAP.secs); CAP.L = new Float32Array(n); CAP.R = new Float32Array(n); CAP.w = 0; CAP.filled = 0;
      const sp = ctx.createScriptProcessor(4096, 2, 1);
      sp.onaudioprocess = ev => { const ib = ev.inputBuffer, l = ib.getChannelData(0), r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l; for (let k = 0; k < l.length; k++) { CAP.L[CAP.w] = l[k]; CAP.R[CAP.w] = r[k]; CAP.w = (CAP.w + 1) % n; } CAP.filled += l.length; };
      CAP.node = sp; CAP.kind = "script";
    }
    analyser.connect(CAP.node); CAP.node.connect(mute).connect(ctx.destination);
  }
  function capGrab(secs) {
    return new Promise(res => {
      if (!CAP.node) { res(null); return; }
      if (CAP.kind === "worklet") {
        let L = null, R = null, rate = 0;
        const t = setTimeout(() => { CAP.node.port.onmessage = null; CAP.lastErr = "the capture didn't answer within 8 s"; if (window.__nbAdd) window.__nbAdd("capture", CAP.lastErr); res(null); }, 8000);
        CAP.node.port.onmessage = e => { const d = e.data;
          if (d.begin) { L = new Float32Array(d.total); R = new Float32Array(d.total); rate = d.rate; if (!d.total) { clearTimeout(t); res({ L, R, rate }); } }
          else if (d.L && L) { L.set(d.L, d.at); R.set(d.R, d.at); }
          else if (d.done) { clearTimeout(t); CAP.lastErr = ""; res({ L, R, rate }); }
          else if (d.err) { clearTimeout(t); CAP.lastErr = d.err; if (window.__nbAdd) window.__nbAdd("capture", "error " + d.err); res(null); } };
        CAP.node.port.postMessage(secs ? { keep: secs } : "keep"); return;
      }
      const n = CAP.L.length, m = Math.min(CAP.filled, n), L = new Float32Array(m), R = new Float32Array(m), start = (CAP.w - m + n) % n, first = Math.min(m, n - start);
      L.set(CAP.L.subarray(start, start + first)); R.set(CAP.R.subarray(start, start + first));
      if (m > first) { L.set(CAP.L.subarray(0, m - first), first); R.set(CAP.R.subarray(0, m - first), first); }
      res({ L, R, rate: ctx.sampleRate });
    });
  }
  // the kept moment becomes a take: the take bar offers Export WAV / MP3, Send to sampler, → Tracks
  async function capKeep() {
    start(); await capInit();
    const got = await capGrab(); if (!got || got.L.length < got.rate * 0.5) { noteMsg("Nothing to keep yet · play something first", true); return; }
    let { L, R, rate } = got;
    // drop leading silence, keep a short breath before the first sound
    let a = 0; const th = 0.004; while (a < L.length && Math.abs(L[a]) < th && Math.abs(R[a]) < th) a++;
    a = Math.max(0, a - Math.round(rate * 0.25)); if (a > 0) { L = L.subarray(a); R = R.subarray(a); }
    if (L.length < rate * 0.5) { noteMsg("The last 90 seconds were silent", true); return; }
    if (take.rec) stopTake();
    const chunk = 4096, Ls = [], Rs = [];
    for (let i = 0; i < L.length; i += chunk) { Ls.push(toI16(L.subarray(i, i + chunk))); Rs.push(toI16(R.subarray(i, i + chunk))); }
    take.done = { L: Ls, R: Rs, len: L.length, rate }; take.L = []; take.R = [];
    const mb = (44 + L.length * 4) / 1048576;
    takeInfo.textContent = "Kept the last " + fmtClock(L.length / rate) + " · " + mb.toFixed(1) + " MB WAV";
    delete takeBar.dataset.empty; takeBar.hidden = false;
    noteMsg("Kept the last " + fmtClock(L.length / rate) + " · Export, send to the sampler, or → Tracks in the take bar");
    return take.done;
  }
  document.getElementById("keepBtn").addEventListener("click", () => capKeep());
  document.getElementById("djKeep").addEventListener("click", async () => { const t = await capKeep(); if (t) djTakeMenuAny("Kept the last " + fmtClock(t.len / t.rate)); });
  function djTakeMenuAny(title) {
    djOpenMenu(title, takeInfo.textContent, [
      ["btn", "Export WAV", () => document.getElementById("takeExport").click()],
      ["btn", "Export MP3", () => document.getElementById("takeMp3").click()],
      ["btn", "Send to sampler", () => document.getElementById("takeToSlot").click()],
      ["btn", "Keep for later", () => {}],
      ["btn danger wide", "Discard", () => document.getElementById("takeDiscard").click()]]);
  }
  // a worklet that never answers (seen on some Android tablets) is swapped for the main-thread ring
  function capCheck() {
    if (CAP.kind !== "worklet") return Promise.resolve();
    if (CAP.checkP) return CAP.checkP;
    return (CAP.checkP = (async () => {
      const t0 = performance.now();
      const ok = await new Promise(r => { const to = setTimeout(() => r(false), 2500); CAP.node.port.onmessage = e => { if (e.data && e.data.pong) { clearTimeout(to); r(true); } }; CAP.node.port.postMessage("ping"); });
      if (ok) { CAP.pingMs = Math.round(performance.now() - t0); return; }
      try { analyser.disconnect(CAP.node); CAP.node.disconnect(); } catch (e) {}
      const n = Math.round(ctx.sampleRate * CAP.secs); CAP.L = new Float32Array(n); CAP.R = new Float32Array(n); CAP.w = 0; CAP.filled = 0;
      const sp = ctx.createScriptProcessor(4096, 2, 1), mute = ctx.createGain(); mute.gain.value = 0;
      sp.onaudioprocess = ev => { const ib = ev.inputBuffer, l = ib.getChannelData(0), r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l; for (let k = 0; k < l.length; k++) { CAP.L[CAP.w] = l[k]; CAP.R[CAP.w] = r[k]; CAP.w = (CAP.w + 1) % n; } CAP.filled += l.length; };
      analyser.connect(sp); sp.connect(mute).connect(ctx.destination); CAP.node = sp; CAP.kind = "script (worklet didn't answer)";
      if (window.__nbAdd) window.__nbAdd("capture", "worklet silent, switched to main-thread capture");
    })());
  }
  { const ci = capInit; capInit = async function () { await ci(); try { await capCheck(); } catch (e) {} }; }
  // capture starts with the audio
  { const st0 = start; start = function () { st0(); capInit(); }; }

  // ---------- MP3 export (an in-page encoder; a worker does the work when it can) ----------
  function mp3Encode(L, R, rate, kbps, onProgress) {
    const src = (document.getElementById("lameSrc") || {}).textContent || "";
    const job = { L, R, rate, kbps: kbps || 192 };
    return new Promise((res, rej) => {
      let worker = null;
      try { worker = new Worker(URL.createObjectURL(new Blob([src + "\nonmessage = e => { const { L, R, rate, kbps } = e.data, enc = new lamejs.Mp3Encoder(2, rate, kbps), parts = [], blk = 1152; for (let i = 0; i < L.length; i += blk) { const d = enc.encodeBuffer(L.subarray(i, i + blk), R.subarray(i, i + blk)); if (d.length) parts.push(new Uint8Array(d.buffer, d.byteOffset, d.length)); if (((i / blk) | 0) % 400 === 0) postMessage({ p: i / L.length }); } const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end.buffer, end.byteOffset, end.length)); postMessage({ done: parts }, parts.map(p => p.buffer)); };"], { type: "text/javascript" }))); }
      catch (e) { worker = null; }
      if (worker) {
        worker.onmessage = e => { if (e.data.p != null) { if (onProgress) onProgress(e.data.p); } else { worker.terminate(); res(new Blob(e.data.done, { type: "audio/mpeg" })); } };
        worker.onerror = () => { worker.terminate(); mp3EncodeHere(job, onProgress).then(res, rej); };
        worker.postMessage(job, [L.buffer, R.buffer]);
      } else mp3EncodeHere(job, onProgress).then(res, rej);
    });
  }
  async function mp3EncodeHere({ L, R, rate, kbps }, onProgress) {
    if (typeof lamejs === "undefined") { try { (0, eval)((document.getElementById("lameSrc") || {}).textContent || ""); } catch (e) {} }
    if (typeof lamejs === "undefined") throw new Error("no encoder");
    const enc = new lamejs.Mp3Encoder(2, rate, kbps), parts = [], blk = 1152;
    for (let i = 0; i < L.length; i += blk) { const d = enc.encodeBuffer(L.subarray(i, i + blk), R.subarray(i, i + blk)); if (d.length) parts.push(new Uint8Array(d.buffer, d.byteOffset, d.length)); if (((i / blk) | 0) % 200 === 0) { if (onProgress) onProgress(i / L.length); await new Promise(r => setTimeout(r, 0)); } }
    const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end.buffer, end.byteOffset, end.length));
    return new Blob(parts, { type: "audio/mpeg" });
  }
  const takeI16 = t => { const L = new Int16Array(t.len), R = new Int16Array(t.len); let o = 0; for (let c = 0; c < t.L.length; c++) { L.set(t.L[c], o); R.set(t.R[c], o); o += t.L[c].length; } return { L, R }; };
  async function saveMp3(name, blob) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (dl) {
      try { await dl.save({ filename: name + ".zip", data: zipOne(name + ".mp3", bytes) }); return "Saved " + name + ".zip · open it in Files to get the MP3"; }
      catch (e) { if (e && e.code === "declined") return ""; return e && e.code === "too_large" ? "Too large to save here." : "Couldn't save here. Try again in a moment."; }
    }
    const file = new File([blob], name + ".mp3", { type: "audio/mpeg" });
    try { if (nbShareFiles(file)) { await navigator.share({ files: [file], title: name }); return "Shared " + file.name; } } catch (e) { if (e && e.name === "AbortError") return ""; }
    const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return "Saved " + file.name;
  }
  async function exportTakeMp3() {
    if (!take.done) return;
    const name = takeName(), { L, R } = takeI16(take.done), rate = take.done.rate;
    takeInfo.textContent = "Making the MP3… 0%";
    try {
      const blob = await mp3Encode(L, R, rate, 192, p => { takeInfo.textContent = "Making the MP3… " + Math.round(p * 100) + "%"; });
      const msg = await saveMp3(name, blob);
      takeInfo.textContent = (msg || "MP3 ready") + " · " + (blob.size / 1048576).toFixed(1) + " MB";
    } catch (e) { takeInfo.textContent = "Couldn't make the MP3 here (" + (e && e.message || e) + ") · Export WAV still works"; }
  }
  document.getElementById("takeMp3").addEventListener("click", exportTakeMp3);

  // ---------- Phrase-aware mixing ----------
  // A phrase marker on a deck says where a musical phrase starts (the first beat of a chorus, say).
  // With one set, a mix waits for the next 8-bar boundary of the playing song and the incoming song
  // starts from its own phrase marker, so transitions land where a DJ would put them. Without one
  // they still start on the next bar line.
  const djAnchor = d => d.phrase != null ? d.phrase : d.off;
  // the time (audio clock) when the deck next reaches a boundary of `beats` beats, counted from its anchor
  function djNextBoundary(d, beats) {
    const per = djPer(d), pos = djPos(d), a = djAnchor(d);
    let k = Math.ceil((pos - a) / per / beats - 1e-6); if (k * beats * per + a - pos < per * 0.25) k++;   // too close to the line: take the next one
    const target = a + k * beats * per;
    return { at: ctx.currentTime + Math.max(0.05, (target - pos) / (d.rate * d.bend)), pos: target, bars: Math.round((target - pos) / per / 4 * 10) / 10 };
  }
  djStartMix = function (plan) {
    if (!plan || !plan.it || !djBuild()) { djMsg("Add a song and choose what's next first"); return; }
    if (DJ.trans) { djMsg("A mix is already running"); return; }
    const { from, to, idx, it, style } = plan;
    if (!from.buf || !from.playing) { djLoadCrate(from, idx, true); djMsg("Nothing was playing, so " + it.name + " just starts on " + "AB"[from.i]); return; }
    if (!from.bpm0 || !it.bpm) { djMsg("Both songs need a beat grid to mix (Tap on the deck)"); return; }
    (async () => {
      if (to.playing) djPlay(to, false);
      if (to.crate !== idx || !to.buf) await djLoadCrate(to, idx, false);
      if (DJ.trans || !to.buf || !to.bpm0) return;
      DJ.lead = from.i;
      if (plan.bpm) djSetRate(from, Math.max(0.5, Math.min(2, plan.bpm / from.bpm0)));
      // the incoming song's speed, allowing for a half- or double-time grid
      const mr = djMatchRate(); if (mr) { if (mr.m !== 1) to.bpm0 *= mr.m; to.rate = Math.max(0.5, Math.min(2, mr.r)); } to.bend = 1;
      const beat = 60 / (djEff(from) * from.bend), bars = plan.bars;
      const b = djNextBoundary(from, from.phrase != null ? 32 : 4), tStart = b.at;
      const toFrom = Math.max(0, to.phrase != null ? to.phrase : to.off);
      const eqFrom = Object.assign({}, from.eq), eqTo = Object.assign({}, to.eq);
      const T = { from, to, idx, style, bars, beat, t0: tStart, eqFrom, eqTo, xf0: DJ.xf, target: to.i === 0 ? 0 : 1, cutAt: tStart, done: false, waitBars: b.bars };
      to.loop = null;
      if (style === "blend" || style === "swap") to.eq.lo = -26;
      if (style === "filter") to.eq.filt = -0.8;
      djApplyEq(to);
      djStartSrc(to, tStart, toFrom); it.played = Date.now();
      if (style === "cut") {
        to.xfg.gain.setValueAtTime(to.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2), ctx.currentTime); to.xfg.gain.setValueAtTime(1, tStart);
        from.xfg.gain.setValueAtTime(from.i === 0 ? Math.cos(DJ.xf * Math.PI / 2) : Math.sin(DJ.xf * Math.PI / 2), ctx.currentTime); from.xfg.gain.setValueAtTime(0, tStart);
      }
      DJ.sync = true; DJ.trans = T; djTickOn();
      const wait = b.bars >= 1 ? " · starts in " + b.bars + (b.bars === 1 ? " bar" : " bars") + (from.phrase != null ? " (on the phrase)" : "") : "";
      djMsg(djStyleName(style) + ": " + it.name + " comes in on " + "AB"[to.i] + (style === "cut" ? " on the bar line" : " over " + bars + " bars") + wait + (plan.why ? " · " + plan.why : ""), true);
      djPaintAll(); djPaintCrate();
    })();
  };
  {
    const ms0 = djMixStep;
    djMixStep = function () {
      const T = DJ.trans; if (!T) return;
      if (ctx.currentTime < T.t0) {   // waiting for the bar or phrase line: keep the countdown fresh
        const left = (T.t0 - ctx.currentTime) / T.beat / 4, mi = document.getElementById("djMixIn");
        if (mi) { const tx = "MIX IN · " + (left < 1 ? "next bar…" : Math.ceil(left) + " bars…") + " (tap = go now)"; if (mi.textContent !== tx) mi.textContent = tx; }
        return;
      }
      ms0();
    };
    // a tap while it's waiting goes now; a tap once it's running takes over (as before)
    const mi = document.getElementById("djMixIn"), handlers = [];
    mi.addEventListener("click", e => {
      const T = DJ.trans; if (!T || ctx.currentTime >= T.t0 - 0.05) return;
      e.stopImmediatePropagation();
      const now = ctx.currentTime + 0.06, shift = T.t0 - now; T.t0 = now; T.cutAt = now;
      // the incoming song was scheduled for the boundary: start it again right away from the same spot
      const pos = Math.max(0, T.to.p0); djStartSrc(T.to, now, pos);
      if (T.style === "cut") { T.to.xfg.gain.cancelScheduledValues(ctx.currentTime); T.from.xfg.gain.cancelScheduledValues(ctx.currentTime); T.to.xfg.gain.setValueAtTime(1, now); T.from.xfg.gain.setValueAtTime(0, now); }
      djMsg("Going now"); djPaintAll();
    }, true);
  }
  // Auto DJ allows for the wait before the boundary
  {
    const tk0 = djTick;
    djTick = function () {
      if (DJ.auto && !DJ.trans && ctx) {
        const { from } = djFromTo();
        if (from.playing && from.buf && from.bpm0) {
          const plan = djPlan();
          if (plan.it && plan.it.bpm) {
            const beat = 60 / (djEff(from) * from.bend), left = (from.buf.duration - djPos(from)) / (from.rate * from.bend), need = (plan.bars + (from.phrase != null ? 8 : 1)) * 4 * beat + 1.5;
            if (left <= need) { djStartMix(plan); return; }
          }
        }
      }
      tk0();
    };
  }
  // --- the phrase marker on each deck ---
  deckEls.forEach((el, i) => {
    const d = DJ.decks[i]; d.phrase = null;
    const row = el.querySelector(".dj-cues"), b = document.createElement("button"); b.className = "btn dj-phr"; b.textContent = "Phrase"; b.title = "Tap on the first beat of a phrase (a chorus, a drop): mixes then wait for the next 8-bar line of this song and the next song comes in from its own phrase mark. Hold to clear.";
    row.appendChild(b);
    let hold = 0, held = false;
    b.addEventListener("pointerdown", e => { e.preventDefault(); held = false; clearTimeout(hold); if (d.phrase != null) hold = setTimeout(() => { held = true; d.phrase = null; djStoreGrid(d); if (d.crate >= 0 && DJ.crate[d.crate]) { DJ.crate[d.crate].phrase = null; djStoreCrate(d.crate); } djPaintDeck(d); djMsg("Phrase mark cleared on " + "AB"[d.i]); }, 550); });
    b.addEventListener("pointerup", () => { clearTimeout(hold); if (held) { held = false; return; } if (!d.buf) { djMsg("Load a song on " + "AB"[d.i] + " first"); return; } const p = djPos(d); d.phrase = d.bpm0 ? Math.max(0, djBeatFloor(d, p + djPer(d) / 2)) : p; djStoreGrid(d); if (d.crate >= 0 && DJ.crate[d.crate]) { DJ.crate[d.crate].phrase = d.phrase; djStoreCrate(d.crate); } djPaintDeck(d); djMsg("Phrase starts at " + djFmt(d.phrase) + " on " + "AB"[d.i] + " · mixes into this deck wait for its 8-bar lines, mixes out of it start here"); });
    b.addEventListener("pointerleave", () => clearTimeout(hold)); b.addEventListener("pointercancel", () => clearTimeout(hold)); b.addEventListener("contextmenu", e => e.preventDefault());
  });
  {
    const pd0 = djPaintDeck;
    djPaintDeck = function (d) { pd0(d); const b = deckEls[d.i].querySelector(".dj-phr"); if (b) { b.setAttribute("aria-pressed", String(d.phrase != null)); b.textContent = d.phrase != null ? "Phrase · " + djFmt(d.phrase) : "Phrase"; } };
    const dw0 = djDrawWave;
    djDrawWave = function (d) {
      dw0(d);
      if (!d.buf || d.phrase == null) return;
      const S = djSize(d.waveEl || (d.waveEl = deckEls[d.i].querySelector(".dj-wave"))); if (!S) return; const { c, w, h } = S, x = d.phrase / d.buf.duration * w;
      c.fillStyle = "#ffe066"; c.fillRect(x - 1, 0, 2, h); c.font = "bold 8px ui-monospace, monospace"; c.textAlign = "left"; c.fillText("P", x + 3, h - 3);
    };
    const rs1 = djRestore;
    djRestore = async function () { const first = !DJ.loaded; await rs1(); if (!first) return; for (const d of DJ.decks) { const r = await djIdbGet("deck" + d.i); if (r && d.buf && r.phrase != null) { d.phrase = r.phrase; djPaintDeck(d); } } };
    const dl2 = djLoad;
    djLoad = async function (d, buf, name, raw, meta) { await dl2(d, buf, name, raw, meta); d.phrase = meta && meta.phrase != null ? meta.phrase : null; djPaintDeck(d); };
  }

