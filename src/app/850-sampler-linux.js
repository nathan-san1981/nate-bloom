    // ======================================================================
    // (187) The Linux app's sampler, more of it. ▶ by Edit plays the selected slot without the keys (looping when its
    // Loop is on); the Player plays any of the eight slots at once, each looping or not, at its own level and pitch,
    // starting on the bar of the ones already playing, so loops layer in time. The editor zooms, snaps to zero
    // crossings, copies and pastes, duplicates and ping-pongs, makes silence, sets the slot's loop from the selection
    // and plays it round, crossfades the loop's seam, shifts the pitch (keeping the length) or the speed (tape-style),
    // stretches a loop to a number of beats at the tempo, cuts lows and highs, makes it mono, swaps or widens the
    // sides, trims the silence off the ends and takes out DC.
    // ======================================================================
    {
      const NNs = window.NB_NATIVE;
      if (NNs && /^(linux|windows)$/.test(NNs.platform)) {
        const $s = id => document.getElementById(id), ed = window.__nbEd;   // (a name 470 uses for its own)
        const mkb = (txt, id, title) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = txt; if (id) b.id = id; if (title) b.title = title; return b; };
        const bpmNow = () => (state && state.seq && state.seq.bpm) || 120;
        // ---------- playing slots without the keys ----------
        const PL = { v: new Map(), t0: 0, q: true, semi: Array(NSLOTS).fill(0), raf: 0 };
        try { const o = JSON.parse(localStorage.getItem("nightbloom-splayer") || "{}"); if (o.q === false) PL.q = false; if (Array.isArray(o.semi)) o.semi.forEach((v, i) => { if (i < NSLOTS) PL.semi[i] = Math.max(-24, Math.min(24, v | 0)); }); } catch (e) {}
        const plSave = () => { try { localStorage.setItem("nightbloom-splayer", JSON.stringify({ q: PL.q, semi: PL.semi })); } catch (e) {} };
        const slotLen = i => { const b = sampBuf[i]; if (!b) return 0; const P = state.samp.slots[i].p, off = P.start * b.duration * 0.98; return Math.max(0.02, P.length * (b.duration - off)); };
        function plStart(i) {
          if (!sampBuf[i] || !ctx) return false;
          start(); plStop(i);
          const bar = 4 * 60 / bpmNow(), now = ctx.currentTime + 0.03;
          let at = now;
          if (PL.q && PL.v.size && PL.t0) at = PL.t0 + Math.ceil((now - PL.t0) / bar - 1e-6) * bar;   // (in time with the ones playing)
          else PL.t0 = now;
          const v = makeSampleVoice(60 + (PL.semi[i] || 0), i, at); if (!v) return false;
          const loop = state.samp.slots[i].mode === "play" && !!state.samp.slots[i].loop;
          const len = slotLen(i) / Math.pow(2, (PL.semi[i] || 0) / 12);
          PL.v.set(i, { v, at, loop, len, end: loop ? Infinity : at + len });
          plPaint(); return true;
        }
        function plStop(i) { const r = PL.v.get(i); if (!r) return; PL.v.delete(i); try { r.v.stop(); } catch (e) {} if (!PL.v.size) PL.t0 = 0; plPaint(); }
        const plStopAll = () => { [...PL.v.keys()].forEach(plStop); };
        ["panic", "stopAll"].forEach(id => { const b = $s(id); if (b) b.addEventListener("click", plStopAll); });
        // ▶ by Edit: the selected slot
        const sbar = $s("sbar"), editB = $s("editBtn");
        const playB = mkb("▶ Play", "sPlayBtn", "Play the selected slot without the keys (it loops when its Loop is on)");
        const plB = mkb("Player…", "sPlayerBtn", "Play several slots at once, looped, layered in time");
        if (editB) { editB.after(playB); playB.after(plB); }
        playB.addEventListener("click", () => { const i = state.samp.slot; if (PL.v.has(i)) plStop(i); else if (!plStart(i)) noteMsg("S" + (i + 1) + " is empty. Load a sample first.", true); });
        // the Player sheet
        const sh = document.createElement("div"); sh.className = "editor sheet"; sh.id = "spSheet"; sh.hidden = true;
        sh.innerHTML = `<div class="ed-card" role="dialog" aria-label="Sample player">
          <div class="ed-head"><strong>Sample player</strong><span class="ed-info" id="splInfo"></span></div>
          <span class="ed-info" style="text-align:left">Each slot plays as the sampler has it (its region, Loop, level, tone, mode), at its own pitch here. With <b>On the bar</b> on, a slot you start comes in on the next bar of the ones already playing, so loops layer in time. Edit… sets a slot's loop from a selection.</span>
          <div id="splRows" style="display:flex;flex-direction:column;gap:6px"></div>
          <div class="ed-foot sheet-foot"><button class="btn big" id="splAll">▶ All</button><button class="btn big" id="splStop">■ All</button><button class="btn big" id="splQ" aria-pressed="true">On the bar</button><button class="btn big primary" id="splDone">Done</button></div>
        </div>`;
        document.body.appendChild(sh);
        function plRows() {
          const box = $s("splRows"); box.innerHTML = "";
          for (let i = 0; i < NSLOTS; i++) {
            const b = sampBuf[i], sl = state.samp.slots[i];
            const r = document.createElement("div"); r.className = "ly-quick spl-row"; r.dataset.i = i; r.style.cssText = "align-items:center;gap:6px;flex-wrap:wrap";
            const nm = document.createElement("span"); nm.className = "dj-lab"; nm.style.cssText = "flex:1 1 140px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
            nm.textContent = "S" + (i + 1) + " · " + (b ? baseName(sl.name) + " · " + slotLen(i).toFixed(2) + " s" : "empty");
            const go = mkb("▶"); go.className = "btn spl-go"; go.disabled = !b; go.setAttribute("aria-label", "Play S" + (i + 1));
            go.addEventListener("click", () => { if (PL.v.has(i)) plStop(i); else plStart(i); });
            const lp = mkb("Loop"); lp.setAttribute("aria-pressed", String(!!sl.loop && sl.mode === "play")); lp.disabled = !b || sl.mode !== "play"; lp.title = sl.mode === "play" ? "Loop this slot (the sampler's own Loop)" : "Loop works in Play mode";
            lp.addEventListener("click", () => { sl.loop = !sl.loop; save(); try { renderEngine(); } catch (e) {} if (PL.v.has(i)) plStart(i); plRows(); });
            const lv = document.createElement("input"); lv.type = "range"; lv.min = 0; lv.max = 100; lv.value = Math.round((sl.p.level || 0) * 100); lv.disabled = !b; lv.style.cssText = "flex:1 1 90px;min-width:70px"; lv.setAttribute("aria-label", "S" + (i + 1) + " level");
            lv.addEventListener("input", () => { sl.p.level = +lv.value / 100; save(); });
            lv.addEventListener("change", () => { if (PL.v.has(i)) plStart(i); });
            const st = document.createElement("select"); st.disabled = !b; st.setAttribute("aria-label", "S" + (i + 1) + " pitch");
            for (let k = -12; k <= 12; k++) { const o = document.createElement("option"); o.value = k; o.textContent = (k > 0 ? "+" : "") + k + " st"; st.appendChild(o); }
            st.value = PL.semi[i] || 0; st.addEventListener("change", () => { PL.semi[i] = +st.value; plSave(); if (PL.v.has(i)) plStart(i); });
            const ed2 = mkb("Edit…"); ed2.disabled = !b; ed2.addEventListener("click", () => { state.samp.slot = i; save(); sh.hidden = true; editB.click(); });
            const bar = document.createElement("i"); bar.className = "spl-bar"; bar.style.cssText = "flex:1 0 100%;height:3px;border-radius:2px;background:#2a2438;position:relative;overflow:hidden"; bar.innerHTML = '<u style="position:absolute;left:0;top:0;bottom:0;width:0;background:#7fd6c2"></u>';
            r.append(nm, go, lp, lv, st, ed2, bar); box.appendChild(r);
          }
          plPaint();
        }
        function plPaint() {
          playB.textContent = PL.v.has(state.samp.slot) ? "■ Stop" : "▶ Play";
          plB.textContent = PL.v.size ? "Player · " + PL.v.size : "Player…";
          if (sh.hidden) return;
          $s("splQ").setAttribute("aria-pressed", String(PL.q));
          $s("splInfo").textContent = (PL.v.size ? PL.v.size + " playing · " : "") + bpmNow() + " BPM";
          sh.querySelectorAll(".spl-row").forEach(r => { const on = PL.v.has(+r.dataset.i), g = r.querySelector(".spl-go"); g.textContent = on ? "■" : "▶"; g.classList.toggle("primary", on); });
        }
        function plTick() {
          if (ctx) {
            const now = ctx.currentTime;
            PL.v.forEach((r, i) => { if (now > r.end + 0.2) { PL.v.delete(i); if (!PL.v.size) PL.t0 = 0; plPaint(); } });
            if (!sh.hidden) sh.querySelectorAll(".spl-row").forEach(row => { const r = PL.v.get(+row.dataset.i), u = row.querySelector(".spl-bar u"); if (!u) return; const x = r && now >= r.at ? ((now - r.at) % r.len) / r.len : 0; u.style.width = (x * 100).toFixed(1) + "%"; });
          }
          PL.raf = requestAnimationFrame(plTick);
        }
        plTick();
        plB.addEventListener("click", () => { start(); sh.hidden = false; plRows(); });
        $s("splDone").addEventListener("click", () => { sh.hidden = true; });
        $s("splStop").addEventListener("click", plStopAll);
        $s("splQ").addEventListener("click", () => { PL.q = !PL.q; plSave(); plPaint(); });
        $s("splAll").addEventListener("click", () => { start(); plStopAll(); const t = ctx.currentTime + 0.05; PL.t0 = t; for (let i = 0; i < NSLOTS; i++) if (sampBuf[i]) plStart(i); });
        // the selected slot changed: the ▶ button says what it'll do
        setInterval(plPaint, 500);

        // ---------- the editor, more of it ----------
        const edCard = edEl.querySelector(".ed-card"), grid = edEl.querySelector(".ed-grid");
        const row = (label, items) => { const r = document.createElement("div"); r.className = "ed-row nb-edx"; const l = document.createElement("span"); l.className = "lab2"; l.textContent = label; r.appendChild(l); items.forEach(x => r.appendChild(x)); return r; };
        const B = {}; const eb = (k, txt, title, fn) => { const b = mkb(txt, "edx" + k, title); b.addEventListener("click", fn); B[k] = b; return b; };
        let SNAP = true, CLIP = null;
        try { if (localStorage.getItem("nightbloom-edsnap") === "0") SNAP = false; } catch (e) {}
        const sel = () => edSel(), full = () => { const [a, b] = sel(); return a === 0 && b === edLen(); };
        const splice = (a, b, ins) => { ed.chans = ed.chans.map((c, k) => { const x = ins[Math.min(k, ins.length - 1)], o = new Float32Array(c.length - (b - a) + x.length); o.set(c.subarray(0, a), 0); o.set(x, a); o.set(c.subarray(b), a + x.length); return o; }); };
        const sub = () => { const [a, b] = sel(); return ed.chans.map(c => c.slice(a, b)); };
        const say = m => edRefresh(m);
        // view
        const zoom = f => { if (!ed.chans) return; const n = edLen(), [v0, v1] = edView(), [a, b] = sel(), mid = full() ? (v0 + v1) / 2 : (a + b) / 2, span = Math.max(256, Math.min(n, (v1 - v0) * f));
          let s0 = Math.round(mid - span / 2); s0 = Math.max(0, Math.min(n - span, s0)); ed.v0 = s0; ed.v1 = Math.round(s0 + span); if (ed.v1 >= n && ed.v0 <= 0) { ed.v0 = 0; ed.v1 = 0; } edDraw(); };
        const scroll = d => { if (!ed.chans) return; const n = edLen(), [v0, v1] = edView(), span = v1 - v0; if (span >= n) return; let s0 = Math.round(v0 + d * span * 0.5); s0 = Math.max(0, Math.min(n - span, s0)); ed.v0 = s0; ed.v1 = s0 + span; edDraw(); };
        edWave.addEventListener("wheel", e => { if (!ed.chans) return; e.preventDefault(); if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) zoom(e.deltaY > 0 ? 1.25 : 0.8); else scroll((e.deltaX || e.deltaY) > 0 ? 0.25 : -0.25); }, { passive: false });
        // zero crossings: the edges of a selection move to the nearest one (within 5 ms), so cuts and loops don't click
        const zc = s => { const c = ed.chans[0], n = c.length, r = Math.round(ed.rate * 0.005); if (s <= 0 || s >= n) return s;
          for (let d = 0; d <= r; d++) { for (const q of [s - d, s + d]) { if (q > 0 && q < n && (c[q - 1] <= 0) !== (c[q] <= 0)) return q; } } return s; };
        window.__edSnap = () => { if (!SNAP || !ed.chans || full()) return; ed.a = zc(ed.a); ed.b = zc(ed.b); };
        // the loop: the slot's region and Loop, set from the selection (a sampler slot only)
        const slotIdx = () => { const m = ed.target && /^S(\d+)$/.exec(ed.target.label || ""); return m ? +m[1] - 1 : -1; };
        ed.loop = null;
        { const oe = openEditor; openEditor = function (t) { const r = oe.apply(this, arguments); ed.loop = null; const i = slotIdx();
            if (i >= 0 && ed.chans) { const sl = state.samp.slots[i], n = edLen(), off = Math.round(sl.p.start * n * 0.98), len = Math.round(sl.p.length * (n - off)); if (sl.loop && (off > 0 || off + len < n)) ed.loop = { a: off, b: Math.min(n, off + len) }; }
            B.setLoop.hidden = i < 0; return r; }; }
        { const od = edDraw; edDraw = function () { od.apply(this, arguments); const L = ed.loop; if (!L || !ed.chans) return; const w = edWave.clientWidth, h = edWave.clientHeight, [v0, v1] = edView(), x = s => (s - v0) / (v1 - v0) * w;
            edCtx.fillStyle = "#7fd6c2"; [L.a, L.b].forEach(s => edCtx.fillRect(Math.round(x(s)) - 1, 0, 2, 10)); edCtx.fillRect(x(L.a), 0, Math.max(1, x(L.b) - x(L.a)), 2); }; }
        // after Save to a slot: its region and Loop follow the loop set here
        $s("edSave").addEventListener("click", () => { const i = slotIdx(), L = ed.loop, n = ed.chans ? edLen() : 0; if (i < 0 || !L || !n) return;
          setTimeout(() => { const sl = state.samp.slots[i], b = sampBuf[i]; if (!b || Math.abs(b.length - n) > 2) return; sl.p.start = Math.min(1, L.a / (n * 0.98)); const off = sl.p.start * n * 0.98; sl.p.length = Math.max(0.001, Math.min(1, (L.b - off) / Math.max(1, n - off))); sl.loop = true; if (sl.mode !== "play") sl.mode = "play"; save(); try { renderEngine(); } catch (e) {} }, 0); }, true);
        // loop play: the selection (or the loop) round and round
        function loopPlay() {
          if (!ed.chans || !ctx) return;
          if (edSrc) { edStop(); return; }
          const [a, b] = ed.loop && full() ? [ed.loop.a, ed.loop.b] : sel();
          const src = ctx.createBufferSource(); src.buffer = makeBuffer(ed.chans.map(c => c.slice(a, b)), ed.rate); src.loop = true; src.__len = b - a;
          src.connect(fx.input); edSrc = src; edPlayFrom = a; edPlayStart = ctx.currentTime; src.start(); edPlayBtn.textContent = "■ Stop"; requestAnimationFrame(edAnim);
        }
        // offline: the stretcher the DJ decks use (200), pitch kept or moved, the length set
        async function wsola(chs, rate, pitch) {
          const n = chs[0].length, outLen = Math.max(128, Math.round(n / rate)), pad = Math.ceil(2048 * pitch) + 8;
          const ext = c => { const o = new Float32Array(n + pad); o.set(c, 0); for (let i = 0; i < pad; i++) o[n + i] = c[i % n]; return o; };   // (the start again after the end: a loop stays whole to its last sample)
          const oc = new OfflineAudioContext(2, outLen, ed.rate);
          const url = URL.createObjectURL(new Blob([STRETCH_SRC], { type: "text/javascript" }));
          try { await oc.audioWorklet.addModule(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
          const L = ext(chs[0]), R = ext(chs[1] || chs[0]);
          const nd = new AudioWorkletNode(oc, "nb-stretch", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { L, R, from: 0, rate, pitch } });
          nd.connect(oc.destination); const out = await oc.startRendering();
          return chs.length > 1 ? [out.getChannelData(0).slice(), out.getChannelData(1).slice()] : [out.getChannelData(0).slice()];
        }
        async function filt(chs, type, f) {
          const n = chs[0].length, oc = new OfflineAudioContext(chs.length, n, ed.rate), b = oc.createBuffer(chs.length, n, ed.rate); chs.forEach((c, k) => b.copyToChannel(c, k));
          const s = oc.createBufferSource(); s.buffer = b; const q = oc.createBiquadFilter(); q.type = type; q.frequency.value = f; q.Q.value = 0.707; s.connect(q).connect(oc.destination); s.start();
          const r = await oc.startRendering(); return chs.map((_, k) => r.getChannelData(k).slice());
        }
        let busy = false;
        async function asyncOp(label, fn) {   // fn(selection) → the new selection (its length may change)
          if (!ed.chans || busy) return; busy = true; edStop(); say(label + "…");
          try { const [a, b] = sel(), out = await fn(sub()); if (!out || !ed.chans) return; edPush(); splice(a, b, out); ed.a = a; ed.b = a + out[0].length; ed.loop = null; edRefresh(label + ": done"); }
          catch (e) { edRefresh(label + " didn't work here (" + (e && e.message || e) + ")"); }
          finally { busy = false; }
        }
        const resample = (chs, r) => chs.map(c => { const n = Math.max(1, Math.round(c.length / r)), o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; o[i] = (c[k] || 0) + ((c[k + 1] || 0) - (c[k] || 0)) * f; } return o; });
        const beatsSel = document.createElement("select"); beatsSel.setAttribute("aria-label", "Beats to fit");
        [["auto", "Nearest bars"], ["1", "1 beat"], ["2", "2 beats"], ["4", "1 bar"], ["8", "2 bars"], ["16", "4 bars"], ["32", "8 bars"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; beatsSel.appendChild(o); });
        const fitRate = n => { const secs = n / ed.rate, beat = 60 / bpmNow(); let beats = beatsSel.value === "auto" ? Math.max(1, Math.pow(2, Math.round(Math.log2(secs / beat)))) : +beatsSel.value; return { rate: secs / (beats * beat), beats }; };
        const snapB = eb("snap", "Snap", "The selection's edges move to the nearest zero crossing, so cuts and loops don't click", () => { SNAP = !SNAP; B.snap.setAttribute("aria-pressed", String(SNAP)); try { localStorage.setItem("nightbloom-edsnap", SNAP ? "1" : "0"); } catch (e) {} if (SNAP) { window.__edSnap(); edRefresh(); } });
        snapB.setAttribute("aria-pressed", String(SNAP));
        const rows = [
          row("View", [eb("zin", "Zoom +", "Zoom in (or the mouse wheel)", () => zoom(0.5)), eb("zout", "Zoom −", "Zoom out", () => zoom(2)), eb("zsel", "Fit selection", "Zoom to the selection", () => { if (!ed.chans) return; const [a, b] = sel(); if (full()) { ed.v0 = 0; ed.v1 = 0; } else { const m = Math.round((b - a) * 0.05); ed.v0 = Math.max(0, a - m); ed.v1 = Math.min(edLen(), b + m); } edDraw(); }),
            eb("zl", "◀", "Scroll left", () => scroll(-1)), eb("zr", "▶", "Scroll right", () => scroll(1)), snapB]),
          row("Edit", [eb("copy", "Copy", "Copy the selection", () => { if (!ed.chans) return; CLIP = sub(); say("Copied " + fmtS(CLIP[0].length)); }),
            eb("paste", "Paste", "Paste over the selection (with nothing selected: at the end)", () => { if (!CLIP) { say("Copy something first"); return; } edOp(() => { const [a, b] = full() ? [edLen(), edLen()] : sel(); splice(a, b, CLIP); ed.a = a; ed.b = a + CLIP[0].length; }); }),
            eb("ins", "Insert", "Insert what you copied at the start of the selection", () => { if (!CLIP) { say("Copy something first"); return; } edOp(() => { const [a] = sel(); splice(a, a, CLIP); ed.a = a; ed.b = a + CLIP[0].length; }); }),
            eb("dup", "Duplicate", "The selection twice, one after the other", () => edOp(() => { const [a, b] = sel(), x = sub(); splice(b, b, x); ed.a = a; ed.b = b + (b - a); })),
            eb("ping", "Ping-pong", "The selection, then the same backwards", () => edOp(() => { const [a, b] = sel(), x = sub().map(c => c.reverse()); splice(b, b, x); ed.a = a; ed.b = b + (b - a); })),
            eb("sil", "Silence", "Make the selection silent", () => edOp(() => { const [a, b] = sel(); ed.chans.forEach(c => c.fill(0, a, b)); })),
            eb("gap", "+ 1 beat", "Insert a beat of silence (at the tempo) at the start of the selection", () => edOp(() => { const [a] = sel(), n = Math.round(ed.rate * 60 / bpmNow()); splice(a, a, ed.chans.map(() => new Float32Array(n))); ed.a = a; ed.b = a + n; })),
            eb("toslot", "→ Empty slot", "Put the selection into the next empty sampler slot (to layer it in the Player)", () => { if (!ed.chans) return; const j = sampBuf.findIndex(b => !b); if (j < 0) { say("All eight slots are full"); return; } const buf = makeBuffer(sub(), ed.rate), nm = baseName(ed.name) + " part"; setSample(j, buf, nm); storeSample(j, nm, bufferToWav(buf)); save(); say("Selection → S" + (j + 1)); })]),
          row("Loop", [(() => eb("setLoop", "Set loop", "The slot plays the selection, round and round (Loop on)", () => { if (!ed.chans) return; const [a, b] = sel(); ed.loop = full() ? null : { a, b }; say(ed.loop ? "Loop " + fmtS(a) + "–" + fmtS(b) + " · Save to keep it" : "Loop: the whole sample"); }))(),
            eb("lplay", "⟳ Play loop", "Play the selection (or the loop) round and round", loopPlay),
            eb("xfade", "Crossfade seam", "Blend the loop's end into what comes before its start, so it goes round without a bump", () => edOp(() => { const [a, b] = ed.loop && full() ? [ed.loop.a, ed.loop.b] : sel(), L = Math.min(Math.round(ed.rate * 0.03), Math.floor((b - a) / 4));
              ed.chans.forEach(c => { if (a >= L) for (let i = 0; i < L; i++) { const t = (i + 1) / L, e = c[b - L + i], s = c[a - L + i]; c[b - L + i] = e * Math.cos(t * Math.PI / 2) + s * Math.sin(t * Math.PI / 2); }
                else { const f = Math.min(L, 256); for (let i = 0; i < f; i++) { c[a + i] *= i / f; c[b - 1 - i] *= i / f; } } }); })),
            beatsSel,
            eb("fit", "Stretch to fit", "Make the selection exactly that many beats at the tempo, keeping its pitch", () => { const n = sel()[1] - sel()[0], { rate, beats } = fitRate(n); asyncOp("Stretch to " + beats + (beats === 1 ? " beat" : " beats") + " at " + bpmNow(), x => wsola(x, rate, 1)); }),
            eb("fitv", "Speed to fit", "The same by speed (tape-style: the pitch moves with it)", () => { const n = sel()[1] - sel()[0], { rate, beats } = fitRate(n); edOp(() => { const [a, b] = sel(), x = resample(sub(), rate); splice(a, b, x); ed.a = a; ed.b = a + x[0].length; }); say("Speed to " + beats + " beats"); })]),
          row("Pitch", [eb("pd", "Pitch −1", "Down a semitone, the length kept", () => asyncOp("Pitch −1", x => wsola(x, 1, Math.pow(2, -1 / 12)))), eb("pu", "Pitch +1", "Up a semitone, the length kept", () => asyncOp("Pitch +1", x => wsola(x, 1, Math.pow(2, 1 / 12)))),
            eb("p12d", "−12", "Down an octave, the length kept", () => asyncOp("Pitch −12", x => wsola(x, 1, 0.5))), eb("p12u", "+12", "Up an octave, the length kept", () => asyncOp("Pitch +12", x => wsola(x, 1, 2))),
            eb("sd", "Slower", "Tape-style: a semitone lower and longer", () => edOp(() => { const [a, b] = sel(), x = resample(sub(), Math.pow(2, -1 / 12)); splice(a, b, x); ed.a = a; ed.b = a + x[0].length; })),
            eb("su", "Faster", "Tape-style: a semitone higher and shorter", () => edOp(() => { const [a, b] = sel(), x = resample(sub(), Math.pow(2, 1 / 12)); splice(a, b, x); ed.a = a; ed.b = a + x[0].length; }))]),
          row("Tone", [eb("lc", "Low cut", "Take out the lows below 120 Hz", () => asyncOp("Low cut", x => filt(x, "highpass", 120))), eb("lc2", "Low cut 400", "Thinner: below 400 Hz", () => asyncOp("Low cut 400", x => filt(x, "highpass", 400))),
            eb("hc", "High cut", "Darker: above 6 kHz", () => asyncOp("High cut", x => filt(x, "lowpass", 6000))), eb("hc2", "High cut 2k", "Much darker: above 2 kHz", () => asyncOp("High cut 2k", x => filt(x, "lowpass", 2000))),
            eb("mono", "Mono", "Both sides the same", () => edOp(() => { const [a, b] = sel(); if (ed.chans.length < 2) return; const [L, R] = ed.chans; for (let i = a; i < b; i++) { const m = (L[i] + R[i]) / 2; L[i] = m; R[i] = m; } })),
            eb("swap", "Swap L/R", "Left and right swapped", () => edOp(() => { const [a, b] = sel(); if (ed.chans.length < 2) return; const [L, R] = ed.chans; for (let i = a; i < b; i++) { const t = L[i]; L[i] = R[i]; R[i] = t; } })),
            eb("wide", "Wider", "More of the sides", () => edOp(() => { const [a, b] = sel(); if (ed.chans.length < 2) return; const [L, R] = ed.chans; for (let i = a; i < b; i++) { const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2 * 1.4; L[i] = m + s; R[i] = m - s; } })),
            eb("trims", "Trim silence", "Cut the quiet off both ends (below −50 dB)", () => edOp(() => { const n = edLen(), th = 0.00316; let a = 0, b = n; const loud = i => ed.chans.some(c => Math.abs(c[i]) > th); while (a < n && !loud(a)) a++; while (b > a && !loud(b - 1)) b--; if (b - a < 64) return; a = Math.max(0, a - Math.round(ed.rate * 0.002)); ed.chans = ed.chans.map(c => c.slice(a, b)); ed.a = 0; ed.b = edLen(); ed.loop = null; })),
            eb("dc", "Remove DC", "Centre the wave (takes out a constant offset)", () => edOp(() => { const [a, b] = sel(); ed.chans.forEach(c => { let m = 0; for (let i = a; i < b; i++) m += c[i]; m /= Math.max(1, b - a); for (let i = a; i < b; i++) c[i] -= m; }); }))]),
        ];
        const legend = edCard.querySelector(".ed-legend");
        rows.forEach(r => legend.before(r));
        // a wider card for the extra rows
        edCard.classList.add("nb-edx-card");
      }
    }
