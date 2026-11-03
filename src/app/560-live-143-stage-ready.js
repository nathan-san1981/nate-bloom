    // ======================================================================
    // Stage-ready (143): sampling in Live, and the DJ made ready for a gig.
    // Sample (Live, by the pad sets): grab what you just heard (the last 1, 2, 4 or 8 bars, at the tempo playing) or
    // record the K.O. II (or the mic); it lands on a pad of the Samples set at once and is kept after a reload.
    // DJ: a lock (hold Done to leave; Back and Esc can't close it), the screen kept awake, the app underneath resting,
    // the CPU readout and the Log, and a keyboard map with each key shown on its control.
    // ======================================================================
    // ---------- Sample, in Live ----------
    const smpB = mkBtn("lvSample", "lv-smp", '<i aria-hidden="true"></i><span>Sample</span>', "Sample: grab what you just heard, or record the K.O. II or the mic, onto a pad");
    $id("lvKit").before(smpB); smpB.dataset.kc = "E";
    const SM = { order: lsGet("nightbloom-live-smp", []), target: null, rec: null };
    if (!Array.isArray(SM.order)) SM.order = [];
    const smpNext = () => { if (SM.target != null) return SM.target; for (let i = 0; i < 4; i++) if (!sampBuf[i]) return i; const o = SM.order.filter(i => i >= 0 && i < 4); return o.length ? o[0] : 0; };
    function smpPut(buf, name) {
      const i = smpNext(); setSample(i, buf, name);
      try { storeSample(i, name, bufWav(buf)); } catch (e) {}
      SM.order = SM.order.filter(x => x !== i).concat(i); lsSet("nightbloom-live-smp", SM.order); SM.target = null;
      if (LV.pset !== "samples") setPset("samples"); ML.lay = null; ML.sent.clear(); lvPaintPads(true); try { mlLightAll(); } catch (e) {}
      const el = lvPadEls[12 + i]; if (el) { el.classList.add("hit"); setTimeout(() => el.classList.remove("hit"), 600); }
      mlHud("Sampled into S" + (i + 1), "pad " + (13 + i) + (L3.split ? " · the MiniLab's pad " + (5 + i) : "") + " · " + buf.duration.toFixed(1) + " s", null);
      add139("sample", "S" + (i + 1) + " · " + name + " · " + buf.duration.toFixed(2) + " s");
      if (!pick.hidden && pick.querySelector(".ls-wrap")) openSample();
    }
    function bufWav(buf) {   // (the sample as a 16-bit WAV, to keep)
      const n = buf.length, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, out = new ArrayBuffer(44 + n * 4);
      new Uint8Array(out).set(new Uint8Array(wavHead(n, buf.sampleRate))); const d = new Int16Array(out, 44);
      for (let k = 0; k < n; k++) { d[2 * k] = Math.max(-1, Math.min(1, L[k])) * 32767; d[2 * k + 1] = Math.max(-1, Math.min(1, R[k])) * 32767; }
      return out;
    }
    const fade = (d, n) => { for (let k = 0; k < n && k < d.length; k++) { const g = k / n; d[k] *= g; d[d.length - 1 - k] *= g; } };
    async function grabBars(bars) {
      start(); const bpm = Math.max(40, rcBpm() || 120), secs = bars * 4 * 60 / bpm;
      if (secs > 85) { mlHud("Too long", "the last 85 seconds can be grabbed", null); return; }
      let got = null; try { got = window.__nbReport && await window.__nbReport.grab(Math.ceil(secs) + 1); } catch (e) {}
      if (!got || !got.L || !got.L.length) { mlHud("Nothing to grab yet", "play something first (the last 90 seconds are always kept)", null); return; }
      const n = Math.min(got.L.length, Math.round(secs * got.rate)), a = got.L.length - n, buf = ctx.createBuffer(2, n, got.rate);
      const L = got.L.slice(a), R = got.R.slice(a); let pk = 0; for (let k = 0; k < n; k += 4) pk = Math.max(pk, Math.abs(L[k]), Math.abs(R[k]));
      if (pk < 0.002) { mlHud("That was silence", "nothing played in the last " + bars + (bars === 1 ? " bar" : " bars"), null); return; }
      const fn = Math.floor(got.rate * 0.004); fade(L, fn); fade(R, fn); buf.copyToChannel(L, 0); buf.copyToChannel(R, 1);
      smpPut(buf, "Live · last " + bars + (bars === 1 ? " bar" : " bars") + " at " + Math.round(bpm));
    }
    // recording the K.O. II (or the mic): tap to start, tap to stop
    async function smpRecStart() {
      if (SM.rec) return; start();
      const ko = await koAudioIn().catch(() => null);
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }, ko && ko.deviceId ? { deviceId: { exact: ko.deviceId } } : {}) }); }
      catch (e) { mlHud("No input", "allow the microphone for this site (the K.O. II comes in through it on USB)", null); return; }
      if (ctx.state !== "running") { try { await ctx.resume(); } catch (e) {} }
      await recNode();   // (loads the recorder's audio-thread code)
      const src = ctx.createMediaStreamSource(stream), mute = ctx.createGain(); mute.gain.value = 0;
      let node; try { node = new AudioWorkletNode(ctx, "nb-rec", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: "explicit" }); } catch (e) { node = null; }
      const R = SM.rec = { stream, src, mute, node, chunks: [], frames: 0, t0: ctx.currentTime, from: ko ? "K.O. II" : "mic", timer: 0, done: null };
      if (node) { node.port.onmessage = e => { if (e.data.pcm) { R.chunks.push(e.data.pcm); R.frames += e.data.pcm.length / 2; if (R.frames > ctx.sampleRate * 30) smpRecStop(); } else if (e.data.done && R.done) R.done(); }; src.connect(node); node.connect(mute).connect(ctx.destination); node.port.postMessage("start"); }
      else { const sp = ctx.createScriptProcessor(4096, 2, 1); sp.onaudioprocess = ev => { const ib = ev.inputBuffer, l = ib.getChannelData(0), r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l, o = new Int16Array(l.length * 2); for (let k = 0; k < l.length; k++) { o[2 * k] = Math.max(-1, Math.min(1, l[k])) * 32767; o[2 * k + 1] = Math.max(-1, Math.min(1, r[k])) * 32767; } R.chunks.push(o); R.frames += l.length; }; src.connect(sp); sp.connect(mute).connect(ctx.destination); R.sp = sp; }
      R.timer = setInterval(() => { const b = pick.querySelector("#lsRec"); if (b) b.textContent = "■ Stop · " + fmtLen(ctx.currentTime - R.t0); smpB.classList.add("on"); }, 250);
      smpB.classList.add("on"); add139("sample", "recording from the " + R.from); if (!pick.hidden && pick.querySelector(".ls-wrap")) openSample();
    }
    async function smpRecStop() {
      const R = SM.rec; if (!R) return; SM.rec = null; clearInterval(R.timer); smpB.classList.remove("on");
      if (R.node) await new Promise(res => { R.done = res; R.node.port.postMessage("stop"); setTimeout(res, 800); });
      try { R.src.disconnect(); (R.node || R.sp).disconnect(); R.mute.disconnect(); } catch (e) {}
      R.stream.getTracks().forEach(t => t.stop());
      const n = R.frames | 0; if (n < ctx.sampleRate * 0.15) { mlHud("Too short", "tap ● Record, play, then tap Stop", null); if (!pick.hidden && pick.querySelector(".ls-wrap")) openSample(); return; }
      const L = new Float32Array(n), Rr = new Float32Array(n); let o = 0;
      for (const c of R.chunks) { for (let k = 0; k + 1 < c.length && o < n; k += 2, o++) { L[o] = c[k] / 32768; Rr[o] = c[k + 1] / 32768; } }
      let pk = 0; for (let k = 0; k < n; k++) pk = Math.max(pk, Math.abs(L[k]), Math.abs(Rr[k]));
      if (pk < 0.003) { mlHud("That was silence", "check the K.O. II's cable and volume", null); if (!pick.hidden && pick.querySelector(".ls-wrap")) openSample(); return; }
      const thr = pk * 0.04; let a = 0; while (a < n && Math.abs(L[a]) < thr && Math.abs(Rr[a]) < thr) a++; let b = n - 1; while (b > a && Math.abs(L[b]) < thr && Math.abs(Rr[b]) < thr) b--;
      a = Math.max(0, a - Math.floor(ctx.sampleRate * 0.01)); b = Math.min(n, b + Math.floor(ctx.sampleRate * 0.12));
      const len = Math.max(1, b - a), buf = ctx.createBuffer(2, len, ctx.sampleRate), g = 0.9 / pk, Ls = L.slice(a, b), Rs = Rr.slice(a, b);
      for (let k = 0; k < len; k++) { Ls[k] *= g; Rs[k] *= g; } const fn = Math.floor(ctx.sampleRate * 0.005); fade(Ls, fn); fade(Rs, fn);
      buf.copyToChannel(Ls, 0); buf.copyToChannel(Rs, 1);
      smpPut(buf, R.from + " · " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }
    async function openSample() {
      const ko = await koAudioIn().catch(() => null), from = ko ? "the K.O. II" : "the mic", bpm = Math.round(rcBpm() || 120), nx = smpNext();
      popAt(smpB, 430, `<div class="lv-pkh"><div><strong>Sample</strong><small>It lands on a pad of the Samples set and is kept after a reload</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl ls-wrap">
          <div class="lv-pkg">What you just heard</div>
          <div class="ls-bars">${[1, 2, 4, 8].map(b => `<button class="btn" data-b="${b}">${b} ${b === 1 ? "bar" : "bars"}<small>${(b * 240 / bpm).toFixed(1)} s</small></button>`).join("")}</div>
          <div class="lv-pkg">From ${from}</div>
          <button class="btn ls-rec${SM.rec ? " on" : ""}" id="lsRec">${SM.rec ? "■ Stop · " + fmtLen(ctx.currentTime - SM.rec.t0) : "● Record " + from + "<small>tap again to stop · up to 30 s</small>"}</button>
          <div class="lv-pkg">Goes to</div>
          <div class="ls-slots">${[0, 1, 2, 3].map(i => `<button class="btn${i === nx ? " next" : ""}${sampBuf[i] ? " has" : ""}" data-s="${i}"${i === nx ? ' aria-current="true"' : ""}>S${i + 1}<small>${i === nx ? "next · " : ""}${sampBuf[i] ? esc3((state.samp.slots[i].name || "sample").slice(0, 16)) : "empty"}</small></button>`).join("")}</div>
          <p class="lv-note">S1–S4 are pads 13–16 of the Samples set${L3.split ? " (the MiniLab's pads 5–8, as the pads are split)" : ""}; the next one lit (a tap picks another).</p>
        </div>`);
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelectorAll(".ls-bars .btn").forEach(b => b.addEventListener("click", () => grabBars(+b.dataset.b)));
      pick.querySelector("#lsRec").addEventListener("click", () => { if (SM.rec) smpRecStop(); else smpRecStart(); });
      pick.querySelectorAll(".ls-slots .btn").forEach(b => b.addEventListener("click", () => { SM.target = +b.dataset.s; openSample(); }));
    }
    smpB.addEventListener("click", () => { start(); if (!pick.hidden && pick.querySelector(".ls-wrap")) closePick(); else openSample(); });
    // ---------- the DJ, for the stage ----------
    const djv = $id("djView"), djDoneB = $id("djDone");
    let djLocked = !!lsGet("nightbloom-dj-lock", false), djLeaving = false, djHoldT = 0;
    const djLockB = mkBtn("djLock", "dj-lock", I_OPEN, "Lock the DJ"); djDoneB.before(djLockB);
    function paintDjLock() {
      djLockB.innerHTML = djLocked ? I_LOCK : I_OPEN; djLockB.setAttribute("aria-pressed", String(djLocked));
      const t = djLocked ? "Locked: hold Done to leave the DJ (tap to unlock)" : "Lock the DJ: Back, Esc and a stray tap on Done can't close it";
      djLockB.title = t; djLockB.setAttribute("aria-label", t); djv.classList.toggle("locked", djLocked); djDoneB.title = djLocked ? "Hold to leave the DJ" : "";
    }
    djLockB.addEventListener("click", () => { djLocked = !djLocked; lsSet("nightbloom-dj-lock", djLocked); paintDjLock(); mlHud(djLocked ? "DJ locked" : "DJ unlocked", djLocked ? "hold Done to leave" : "", null); });
    djv.addEventListener("click", e => { if (!djLocked || djLeaving || !e.target.closest || !e.target.closest("#djDone")) return; e.stopPropagation(); e.preventDefault(); mlHud("The DJ is locked", "hold Done to leave", null); }, true);
    djDoneB.addEventListener("pointerdown", () => { if (!djLocked) return; clearTimeout(djHoldT); djDoneB.classList.add("holding"); djHoldT = setTimeout(() => { djDoneB.classList.remove("holding"); djLeaving = true; try { djDoneB.click(); } finally { djLeaving = false; } }, 700); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(n => djDoneB.addEventListener(n, () => { clearTimeout(djHoldT); djDoneB.classList.remove("holding"); }));
    paintDjLock();
    // the CPU readout (a copy of Live's) and the Log
    const djCpu = mkBtn("djCpu", "lv-cpu dj-cpu", '<b>CPU</b><span class="v">—</span><i class="bar"><u></u></i>', "CPU: how hard the tablet is working");
    const djLog = mkBtn("djLog", "lv-log dj-log", '<i aria-hidden="true"></i><span>Log</span>', "Log: save what the DJ was doing, the last minute of sound and every setting, to send for a fix");
    djLockB.before(djLog);   // (147: no CPU readout)
    djLog.addEventListener("click", () => { const at = TL.length ? TL[TL.length - 1][0] : 0; TLS.marks.push("DJ " + at + " s"); add139("mark", "Log tapped in the DJ"); TLS.seenLag = 0; djLog.classList.remove("warn"); try { window.__nbReport && window.__nbReport.open(60, "DJ: what went wrong just now? (optional)"); } catch (e) {} });
    djCpu.addEventListener("click", () => { const o = CPU; mlHud("CPU " + o.pct + "%", "screen " + o.screen + "%" + (o.audio != null ? " · audio " + o.audio + "%" : "") + (o.press ? " · tablet " + (CPU_WORD[o.press] || o.press) : "") + (CPU.hist.slice(-10).some(x => x > 25) ? " · the sound fell behind lately" : " · the sound keeps up"), Math.min(1, o.pct / 100)); });
    // while the DJ is open: awake, the app underneath resting, the per-second record running
    function djOpenChanged() {
      const on = !djv.hidden;
      document.body.classList.toggle("dj-on", on);
      try { wake(on || !lv.hidden); } catch (e) {}
      if (on) { TLS.since = performance.now() / 1000; TLS.base = null; TLS.lag = 0; TLS.ts = null; clearInterval(tlT); tlT = setInterval(tlTick, 1000); if (!TLS.raf) TLS.raf = requestAnimationFrame(djFrame); paintDjCaps(); add139("dj", "open"); }
      else if (lv.hidden) { add139("dj", "closed"); }
    }
    function djFrame() { TLS.frames++; if (!djv.hidden) TLS.raf = requestAnimationFrame(djFrame); else TLS.raf = 0; }
    new MutationObserver(djOpenChanged).observe(djv, { attributes: true, attributeFilter: ["hidden"] });
    document.addEventListener("visibilitychange", () => { if (!djv.hidden && document.visibilityState === "visible") { try { wake(true); } catch (e) {} } });
    {
      const t0 = tlTick;
      tlTick = function () {
        const r = t0.apply(this, arguments);
        const row = TL[TL.length - 1];
        if (djv.hidden) { if (row) while (row.length <= TL_HEAD.indexOf("dj")) row.push(""); return r; }   // (Live's rows keep the DJ's column, empty)
        if (row) while (row.length < TL_HEAD.indexOf("dj")) row.push("");
        if (row) row.push(num(() => "A " + (DJ.decks[0].playing ? "▶" : "■") + " · B " + (DJ.decks[1].playing ? "▶" : "■") + " · xf " + (+DJ.xf).toFixed(2) + (DJ.sync ? " · sync" : "") + (DJ.trans ? " · mixing" : ""), ""));
        nbT(djCpu.querySelector(".v"), cpuDrops(10) ? "drops" : CPU.pct + "%"); djCpu.classList.toggle("drops", cpuDrops(10) > 0); djCpu.querySelector("u").style.width = Math.min(100, CPU.pct) + "%";
        djCpu.classList.toggle("warm", cpuB.classList.contains("warm")); djCpu.classList.toggle("hot", cpuB.classList.contains("hot"));
        if (logB.classList.contains("warn")) djLog.classList.add("warn");
        return r;
      };
      TL_HEAD.push("dj");
    }
    // the keys
    const djDeck = d => djv.querySelectorAll(".dj-deck")[d];
    const djQ = (d, s) => { const el = djDeck(d); return el && el.querySelector(s); };
    const DJP = { bubbles: true, cancelable: true, pointerId: 4343, isPrimary: true, pointerType: "mouse" };
    const djDown = b => { if (b && !b.disabled) b.dispatchEvent(new PointerEvent("pointerdown", DJP)); }, djUp = b => { if (b) b.dispatchEvent(new PointerEvent("pointerup", DJP)); };
    const djTapB = b => { if (b && !b.disabled) b.click(); };
    const DJK = {   // key -> [what, hold?]
      KeyZ: ["A ▶ ❚❚", () => djTapB(djQ(0, ".dj-play"))], KeyX: ["A Cue (hold)", () => djQ(0, ".dj-cue"), true],
      Digit1: ["A hot cue 1", () => djQ(0, '.dj-cues .btn[data-c="0"]'), true], Digit2: ["A hot cue 2", () => djQ(0, '.dj-cues .btn[data-c="1"]'), true], Digit3: ["A hot cue 3", () => djQ(0, '.dj-cues .btn[data-c="2"]'), true], Digit4: ["A hot cue 4", () => djQ(0, '.dj-cues .btn[data-c="3"]'), true],
      KeyQ: ["A loop 4", () => djTapB(djQ(0, '.dj-loops:not(.dj-cues) .btn[data-n="4"]'))], KeyW: ["A loop 8", () => djTapB(djQ(0, '.dj-loops:not(.dj-cues) .btn[data-n="8"]'))], KeyE: ["A loop the song", () => djTapB(djQ(0, ".dj-lsong"))],
      KeyM: ["B ▶ ❚❚", () => djTapB(djQ(1, ".dj-play"))], Comma: ["B Cue (hold)", () => djQ(1, ".dj-cue"), true],
      Digit7: ["B hot cue 1", () => djQ(1, '.dj-cues .btn[data-c="0"]'), true], Digit8: ["B hot cue 2", () => djQ(1, '.dj-cues .btn[data-c="1"]'), true], Digit9: ["B hot cue 3", () => djQ(1, '.dj-cues .btn[data-c="2"]'), true], Digit0: ["B hot cue 4", () => djQ(1, '.dj-cues .btn[data-c="3"]'), true],
      KeyO: ["B loop 4", () => djTapB(djQ(1, '.dj-loops:not(.dj-cues) .btn[data-n="4"]'))], KeyP: ["B loop 8", () => djTapB(djQ(1, '.dj-loops:not(.dj-cues) .btn[data-n="8"]'))], KeyI: ["B loop the song", () => djTapB(djQ(1, ".dj-lsong"))],
      Space: ["▶ Both", () => djTapB($id("djBothPlay"))], KeyS: ["Auto sync", () => djTapB($id("djAuto"))],
      BracketLeft: ["Nudge: slow the other song (hold)", () => $id("djNudgeL"), true], BracketRight: ["Nudge: push the other song (hold)", () => $id("djNudgeR"), true],
      KeyR: ["● Rec the mix", () => djTapB($id("djRec"))], KeyG: ["Log", () => djLog.click()],
    };
    function djXf(to) { const x = $id("djXf"); if (!x) return; x.value = Math.max(0, Math.min(1, to)); x.dispatchEvent(new Event("input", { bubbles: true })); x.dispatchEvent(new Event("change", { bubbles: true })); mlHud("Crossfader", (+x.value < 0.02 ? "all A" : +x.value > 0.98 ? "all B" : Math.round((1 - x.value) * 100) + " A · " + Math.round(x.value * 100) + " B"), +x.value); }
    const djHeld = new Map();
    window.addEventListener("keydown", e => {
      if (djv.hidden || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if ([...document.querySelectorAll(".editor, .browser")].some(x => !x.hidden && x.getClientRects().length)) return;
      const c = e.code || "";
      if (c === "ArrowLeft" || c === "ArrowRight") { stopKey(e); const x = $id("djXf"), v = x ? +x.value : 0.5, r = c === "ArrowRight"; djXf(e.shiftKey ? (r ? 1 : 0) : v + (r ? 0.1 : -0.1)); return; }
      if (e.key === "?") { stopKey(e); if (!e.repeat) djKeysToggle(); return; }
      const k = DJK[c]; if (!k) return;
      stopKey(e); if (e.repeat || djHeld.has(c)) return;
      if (k[2]) { const b = k[1](); if (b) { djDown(b); djHeld.set(c, b); } } else { k[1](); djHeld.set(c, null); }
    }, true);
    window.addEventListener("keyup", e => { const c = e.code || ""; if (!djHeld.has(c)) return; const b = djHeld.get(c); djHeld.delete(c); if (b) djUp(b); stopKey(e); }, true);
    window.addEventListener("blur", () => { djHeld.forEach(b => { if (b) djUp(b); }); djHeld.clear(); });
    // the keys on the controls, once a keyboard is used, and a list of them
    const KCAP = { KeyZ: "Z", KeyX: "X", KeyQ: "Q", KeyW: "W", KeyM: "M", Comma: ",", KeyO: "O", KeyP: "P", KeyE: "E", KeyI: "I", Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4", Digit7: "7", Digit8: "8", Digit9: "9", Digit0: "0" };
    function paintDjCaps() {
      djv.classList.toggle("dj-kbd", num(() => capsOn(), false));
      const put = (el, k) => { if (el) el.dataset.kc = k; };
      put(djQ(0, ".dj-play"), "Z"); put(djQ(0, ".dj-cue"), "X"); put(djQ(1, ".dj-play"), "M"); put(djQ(1, ".dj-cue"), ",");
      [0, 1, 2, 3].forEach(i => { put(djQ(0, '.dj-cues .btn[data-c="' + i + '"]'), String(i + 1)); put(djQ(1, '.dj-cues .btn[data-c="' + i + '"]'), String((i + 7) % 10)); });
      put(djQ(0, '.dj-loops:not(.dj-cues) .btn[data-n="4"]'), "Q"); put(djQ(0, '.dj-loops:not(.dj-cues) .btn[data-n="8"]'), "W"); put(djQ(1, '.dj-loops:not(.dj-cues) .btn[data-n="4"]'), "O"); put(djQ(1, '.dj-loops:not(.dj-cues) .btn[data-n="8"]'), "P"); put(djQ(0, ".dj-lsong"), "E"); put(djQ(1, ".dj-lsong"), "I");
      put($id("djBothPlay"), "Space"); put($id("djAuto"), "S"); put($id("djRec"), "R"); put(djLog, "G"); put($id("djNudgeL"), "["); put($id("djNudgeR"), "]");
      const xf = $id("djXf"); if (xf && xf.parentElement) xf.parentElement.dataset.kc = "← →";
    }
    { const pc = paintCaps; paintCaps = function () { const r = pc.apply(this, arguments); try { paintDjCaps(); } catch (e) {} return r; }; }
    const djKeys = document.createElement("div"); djKeys.className = "dj-keys"; djKeys.hidden = true; djv.appendChild(djKeys);
    function djKeysToggle() {
      if (!djKeys.hidden) { djKeys.hidden = true; return; }
      const row = (k, w) => `<div class="lk-row"><span class="lk-k">${k.map(x => `<kbd>${esc3(x)}</kbd>`).join("")}</span><span>${esc3(w)}</span></div>`;
      djKeys.innerHTML = `<div class="lv-pkh"><div><strong>DJ keys</strong><small>A computer keyboard runs the DJ alongside the MiniLab</small></div><button class="btn" data-x aria-label="Close">✕</button></div><div class="lv-pkl lk">
        <div class="lv-pkg">Deck A (left hand)</div>${row(["Z"], "▶ ❚❚")}${row(["X"], "Cue (hold)")}${row(["1", "2", "3", "4"], "hot cues (hold)")}${row(["Q", "W"], "loop 4 or 8 beats")}
        <div class="lv-pkg">Deck B (right hand)</div>${row(["M"], "▶ ❚❚")}${row([","], "Cue (hold)")}${row(["7", "8", "9", "0"], "hot cues (hold)")}${row(["O", "P"], "loop 4 or 8 beats")}
        <div class="lv-pkg">The mix</div>${row(["←", "→"], "crossfader (Shift: all the way)")}${row(["Space"], "▶ Both")}${row(["S"], "Auto sync")}${row(["[", "]"], "nudge the other song (hold)")}${row(["R"], "● Rec the mix")}${row(["G"], "Log")}${row(["?"], "this list")}
        <div class="lv-pkg">MiniLab</div><p class="lv-note">Knobs: each deck's high, mid, low and filter · faders: A and B volume, the crossfader, master · pads: play, cue, hot cues and loops for A (1–8) and B (9–16) · big knob: the following deck's speed (Shift: the lead's) · click: ▶ Both · Shift + click: ● Rec the mix.</p></div>`;
      djKeys.querySelector("[data-x]").addEventListener("click", () => { djKeys.hidden = true; });
      djKeys.hidden = false;
    }
    window.__live9 = { SM, grabBars, smpRecStart, smpRecStop, openSample, smpPut, djLockState: () => djLocked, djXf, djKeysToggle };
