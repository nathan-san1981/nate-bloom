    // ======================================================================
    // (187) Nate Bloom ↔ Bitwig, in the Linux app. In Bitwig, the Nate Bloom Bridge plugin (a CLAP instrument the app
    // puts in ~/.clap) goes on a track: the track's notes, knobs and wheels play a sound of Nate Bloom's (what's
    // playing, or one sound picked for that track here), and that sound comes back on the track in time (the plugin
    // reports the delay and Bitwig makes up for it). Audio sent into the plugin can come into Nate Bloom too. Bitwig's
    // tempo, and its start and stop if you like, reach Nate Bloom. JACK ports (a stereo pair for the mix and for each
    // of four parts) and MIDI ports ("Nate Bloom in" to play it from any app, "Nate Bloom send" → "Nate Bloom out" for
    // its MIDI out) do the same for other apps. The meeting place is native (nb_bridge.cc); this side keeps a shared
    // ring per bridge: an AudioWorklet writes the part's sound into it at the plugin's frame numbers, and the plugin's
    // MIDI comes out of it, each event played at the moment of the ring it belongs to.
    // ======================================================================
    {
      const NNb = window.NB_NATIVE, NBB = window.NBBridge;
      if (NNb && NNb.platform === "linux" && NBB && typeof SharedArrayBuffer === "function" && window.crossOriginIsolated) {
        const NS = 16, HSZ = 32, RG = 16384, NMZ = 512;
        const hdrB = new SharedArrayBuffer((NS + 2) * HSZ * 8), ringB = new SharedArrayBuffer(NS * 4 * RG * 4), midiB = new SharedArrayBuffer((NS + 1) * NMZ * 4 * 8);
        const HB = new Float64Array(hdrB), MB = new Float64Array(midiB);
        const BW = window.__nbBridge = { ok: false, why: "", slots: [], info: null, plugin: null, late: 0, notes: 0, leads: [], spk: null, spkCtx: null, wl: null, wlCtx: null, last: { bpm: 0, play: 0 } };
        const OPTK = "nightbloom-bitwig"; let OPT = { routes: {}, hear: {}, only: true, tempo: true, transport: false, jack: false, midi: true };
        try { OPT = Object.assign(OPT, JSON.parse(localStorage.getItem(OPTK) || "{}")); } catch (e) {}
        const optSave = () => { try { localStorage.setItem(OPTK, JSON.stringify(OPT)); } catch (e) {} };
        for (let i = 0; i <= NS; i++) BW.slots.push({ gen: -1, name: "", kind: 1, node: null, nodeCtx: null, tap: null, voices: new Map(), sus: null, live: false });
        window.addEventListener("message", e => { const d = e.data && e.data.nbBridgeAttached; if (!d) return; BW.ok = !!d.ok; BW.why = d.why || ""; });
        window.postMessage({ nbBridgeAttach: { hdr: hdrB, rings: ringB, midi: midiB } }, "*");
        try { if (OPT.midi) NBB.midi(true); } catch (e) {}
        try { if (OPT.jack) NBB.jack(true, 4); } catch (e) {}
        try { NBB.plugin().then(p => { BW.plugin = p; }).catch(() => {}); } catch (e) {}
        const routeOf = sl => OPT.routes[sl.name] || "stack";
        const CHAIN_LAT = 0.0135;
        const hdr = i => i * HSZ;
        // ---- the worklet: the part's sound into the ring at the plugin's frames; Bitwig's audio out of it ----
        const WSRC = `class NBBridgeP extends AudioWorkletProcessor {
  constructor(o) { super(); const p = o.processorOptions; this.H = new Float64Array(p.hdr); this.R = new Float32Array(p.rings); this.s = p.slot; this.RG = p.ring; this.HS = p.hs;
    this.gen = -1; this.W = null; this.ph = 0; this.pL = 0; this.pR = 0; this.rin = null; this.hear = false; this.dead = false;
    this.port.onmessage = e => { const d = e.data || {}; if (d.stop) this.dead = true; if (d.hear != null) this.hear = !!d.hear; }; }
  process(inputs, outputs) {
    if (this.dead) return false;
    const H = this.H, b = this.s * this.HS, RG = this.RG, out = outputs[0];
    for (const c of out) c.fill(0);
    if (H[b] !== 1) { this.W = null; return true; }
    if (H[b + 1] !== this.gen) { this.gen = H[b + 1]; this.W = null; this.rin = null; }
    if (H[b + 13] > 600) { this.W = null; return true; }   // (the host isn't processing: nothing to keep up with)
    const psr = H[b + 2] || sampleRate, L = H[b + 7] || Math.round(0.032 * psr), R0 = H[b + 4], r0 = psr / sampleRate;
    const D = Math.max(Math.round(0.008 * psr), L - Math.round(0.0295 * psr));   // (lead over the plugin's reading: L less the time a note takes to get here, 16 ms, and the effects chain's 13.5 ms)
    if (this.W === null || Math.abs((this.W - R0) - D) > L) { this.W = Math.max(0, R0 + D); this.ph = 0; const o = this.s * 4 * this.RG; this.R.fill(0, o, o + 2 * this.RG); }   // (starting over: nothing old left in the ring)
    const err = (this.W - R0) - D, rr = r0 * Math.max(0.995, Math.min(1.005, 1 - err / (psr * 4)));   // (a touch faster or slower until the lead is right: the two clocks drift)
    const inp = inputs[0], xL = inp && inp[0], xR = inp && (inp[1] || inp[0]);
    H[b + 18] = currentFrame - 1 + this.ph; H[b + 19] = this.W; H[b + 20] = rr;
    const oL = this.s * 4 * RG, oR = oL + RG, step = 1 / rr, R = this.R;
    let W = this.W, ph = this.ph, pL = this.pL, pR = this.pR;
    for (let k = 0; k < 128; k++) { const cL = xL ? xL[k] : 0, cR = xR ? xR[k] : 0;
      while (ph < 1) { const i = W % RG; R[oL + i] = pL + (cL - pL) * ph; R[oR + i] = pR + (cR - pR) * ph; W++; ph += step; }
      ph -= 1; pL = cL; pR = cR; }
    this.W = W; this.ph = ph; this.pL = pL; this.pR = pR; H[b + 5] = W;
    // Bitwig's audio into the plugin → here (a little behind what's arrived)
    if (this.hear && H[b + 14]) {
      const inW = H[b + 6], iL = oL + 2 * RG, iR = oL + 3 * RG, Din = Math.round(0.012 * psr);
      if (this.rin === null || Math.abs(inW - this.rin - Din) > L) this.rin = inW - Din;
      const ri = r0 * Math.max(0.995, Math.min(1.005, 1 + ((inW - this.rin) - Din) / (psr * 4)));
      const L0 = out[0], R1 = out[1] || out[0];
      for (let k = 0; k < 128; k++) { const x = this.rin, i0 = Math.floor(x), f = x - i0, a = ((i0 % RG) + RG) % RG, c = (a + 1) % RG;
        if (i0 >= 0 && i0 + 1 < inW) { L0[k] = R[iL + a] + (R[iL + c] - R[iL + a]) * f; R1[k] = R[iR + a] + (R[iR + c] - R[iR + a]) * f; }
        this.rin += ri; }
    }
    return true;
  }
}
registerProcessor("nb-bridge", NBBridgeP);`;
        async function wlReady() {
          if (!ctx || !ctx.audioWorklet) return false;
          if (BW.wlCtx === ctx && BW.wl) return BW.wl;
          if (BW.wlCtx === ctx && BW.wlP) return BW.wlP;
          BW.wlCtx = ctx; BW.wl = null;
          BW.wlP = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WSRC], { type: "text/javascript" }))).then(() => (BW.wl = true)).catch(() => false);
          return BW.wlP;
        }
        // ---- the speakers: Nate Bloom's own output, off while Bitwig carries the mix ----
        function spkWire() {
          if (!ctx || !analyser) return null;
          if (BW.spkCtx === ctx && BW.spk && BW.spkA === analyser) return BW.spk;
          try { analyser.disconnect(ctx.destination); } catch (e) {}
          const g = ctx.createGain(); analyser.connect(g).connect(ctx.destination);
          BW.spk = g; BW.spkCtx = ctx; BW.spkA = analyser; return g;
        }
        // ---- what a bridge carries: the mix (what's playing), or one sound's own channel ----
        const chainOf = r => r.startsWith("e:") ? r.slice(2) : r.startsWith("s:") ? "samp" : r === "inst" ? "inst" : r.startsWith("l:") ? "lib" : r === "hw" ? "hw" : null;
        function untap(sl) {
          const t = sl.tap; if (!t) return; sl.tap = null;
          t.srcs.forEach(n => { try { n.disconnect(t.to); } catch (e) {} if (t.cut && fx && fx.master && t.ctx === ctx) { try { n.connect(fx.master); } catch (e) {} } });
        }
        function tapFor(sl, route) {
          if (!sl.node) return;
          const key = route + "|" + (OPT.only ? 1 : 0);
          if (sl.tap && sl.tap.key === key && sl.tap.ctx === ctx && sl.tap.to === sl.node && sl.tap.srcs.every(n => n.context === ctx)) return;
          untap(sl);
          let srcs = [], cut = false;
          if (route === "stack" || route === "none") { if (fx && fx.master) srcs = [fx.master]; }   // (the mix before Nate Bloom's master compressor and limiter: Bitwig's own master does that job, and they'd hold it back further)
          else { const id = chainOf(route); let c = null; try { c = id ? fxcGet(id) : null; } catch (e) {} if (c) { srcs = [c.dry, c.echoOut].filter(Boolean); cut = !!OPT.only; } }
          srcs.forEach(n => { try { n.connect(sl.node); if (cut && fx && fx.master) n.disconnect(fx.master); } catch (e) {} });
          sl.tap = { key, ctx, to: sl.node, srcs, cut };
        }
        async function nodeFor(i, sl) {
          if (!ctx) return null;
          if (sl.node && sl.nodeCtx === ctx) return sl.node;
          if (!(await wlReady())) return null;
          if (sl.node) { try { sl.node.port.postMessage({ stop: 1 }); sl.node.disconnect(); } catch (e) {} untap(sl); }
          const n = new AudioWorkletNode(ctx, "nb-bridge", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit", processorOptions: { hdr: hdrB, rings: ringB, slot: i, ring: RG, hs: HSZ } });
          n.connect(fx && fx.master ? fx.master : ctx.destination);   // (Bitwig's audio, when it's let in; silent otherwise)
          sl.node = n; sl.nodeCtx = ctx; n.port.postMessage({ hear: !!OPT.hear[sl.name] });
          return n;
        }
        function dropSlot(sl) {
          sl.voices.forEach(vs => vs.forEach(v => { try { v.stop(); } catch (e) {} })); sl.voices.clear(); sl.sus = null;
          untap(sl); if (sl.node) { try { sl.node.port.postMessage({ stop: 1 }); sl.node.disconnect(); } catch (e) {} } sl.node = null; sl.live = false;
        }
        // ---- its MIDI, each event at the moment of the ring it belongs to ----
        function whenOf(b, frame) {
          if (!ctx || frame < 0) return undefined;
          const af = HB[b + 18], aw = HB[b + 19], rr = HB[b + 20];
          if (!(rr > 0)) return undefined;
          // (each sound's effects chain holds it back by its tape-wobble delay, 12 ms, before it reaches the tap: played that much earlier)
          const t = (af + (frame - aw) / rr) / ctx.sampleRate - CHAIN_LAT, now = ctx.currentTime;
          BW.leads.push(Math.round((t - now) * 10000) / 10); if (BW.leads.length > 40) BW.leads.shift();   // (ms to spare when it arrived; below 0: late)
          if (t < now + 0.002) { BW.late++; return undefined; }
          return t > now + 1 ? undefined : t;
        }
        function midiIn(i, sl, route) {
          const b = hdr(i); let tl = HB[b + 12]; const hd = HB[b + 11];
          if (hd - tl > NMZ) tl = hd - NMZ;
          for (; tl < hd; tl++) {
            const m = MB.subarray(((i * NMZ) + (tl % NMZ)) * 4, ((i * NMZ) + (tl % NMZ)) * 4 + 4);
            const fr = m[0], s0 = m[1] | 0, d1 = m[2] | 0, d2 = m[3] | 0, cmd = s0 & 0xf0, when = whenOf(b, fr);
            try { start(); } catch (e) {}
            if (cmd === 0x90 && d2 > 0) {
              const k = (s0 & 15) + ":" + d1, old = sl.voices.get(k); if (old) old.forEach(v => { try { v.stop(when); } catch (e) {} });
              NB_VEL7 = d2; let vs = []; try { vs = window.__nbRoute.voices(route, d1, window.__nbRoute.velGain(d2), when); } catch (e) {} finally { NB_VEL7 = 100; }
              sl.voices.set(k, vs); BW.notes++;
            } else if (cmd === 0x80 || cmd === 0x90) {
              const k = (s0 & 15) + ":" + d1, vs = sl.voices.get(k); if (!vs) continue;
              if (sl.sus) { sl.sus.add(k); vs.off = true; continue; }
              sl.voices.delete(k); vs.forEach(v => { try { v.stop(when); } catch (e) {} });
            } else if (cmd === 0xb0 && d1 === 64) {
              if (d2 >= 64) sl.sus = sl.sus || new Set();
              else if (sl.sus) { const held = sl.sus; sl.sus = null; held.forEach(k => { const vs = sl.voices.get(k); if (vs && vs.off) { sl.voices.delete(k); vs.forEach(v => { try { v.stop(when); } catch (e) {} }); } }); }
            } else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { sl.voices.forEach(vs => vs.forEach(v => { try { v.stop(when); } catch (e) {} })); sl.voices.clear(); sl.sus = null; }
            else if (cmd === 0xb0 || cmd === 0xe0 || cmd === 0xd0 || cmd === 0xa0) {
              // knobs, wheels, pressure: to the plugin it plays, at their moment; the wheels move Nate Bloom's own sounds too
              let ps = []; try { ps = window.__nbRoute.plugs(route); } catch (e) {}
              ps.forEach(P => { try { P.node.scheduleEvents({ type: "wam-midi", time: when == null ? P.ctx.currentTime : when, data: { bytes: [s0, d1, d2] } }); } catch (e) {} });
              try {
                if (cmd === 0xe0) { pm.bend = Math.max(-1, Math.min(1, ((d2 << 7) | d1) / 8192 - 1)); applyPitch(); }
                else if (cmd === 0xb0 && d1 === 1) { MODSRC.wheel = d2 / 127; pm.mod = Math.max(MODSRC.wheel, MODSRC.press); applyPitch(); }
              } catch (e) {}
            }
          }
          HB[b + 12] = tl;
        }
        // ---- every couple of milliseconds: who's there, their sound and MIDI, the speakers, the tempo ----
        function tick() {
          if (!BW.ok || !ctx) return;
          HB[(NS + 1) * HSZ] = ctx.sampleRate;
          let carriesMix = false;
          for (let i = 0; i < NS; i++) {
            const b = hdr(i), sl = BW.slots[i], on = HB[b] === 1;
            if (!on) { if (sl.live) dropSlot(sl); sl.gen = -1; continue; }
            if (HB[b + 1] !== sl.gen) { dropSlot(sl); sl.gen = HB[b + 1]; }
            sl.live = true; sl.kind = HB[b + 17] || 1;
            const route = routeOf(sl);
            if (!sl.node || sl.nodeCtx !== ctx) { if (!sl.pending) { sl.pending = true; nodeFor(i, sl).finally(() => { sl.pending = false; }); } }
            else tapFor(sl, route);
            midiIn(i, sl, route);
            if ((route === "stack") && HB[b + 13] < 600) carriesMix = true;
          }
          // the "Nate Bloom in" MIDI port: other apps play it, at once
          { const sl = BW.slots[NS]; midiIn(NS, sl, OPT.routes["Nate Bloom in"] || "stack"); }
          const g = spkWire(); if (g) { const want = carriesMix && OPT.only ? 0 : 1; if (g.gain.value !== want) g.gain.setTargetAtTime(want, ctx.currentTime, 0.02); }
          BW.carriesMix = carriesMix;
          // Bitwig's tempo, start and stop (from the first plugin that's playing a part)
          const pl = BW.slots.findIndex((s, i) => i < NS && s.live && s.kind === 1 && HB[hdr(i) + 13] < 600);
          if (pl >= 0) { const b = hdr(pl), bpm = HB[b + 8], play = HB[b + 9] | 0;
            if (OPT.tempo && bpm >= 40 && Math.abs(bpm - BW.last.bpm) > 0.05) { BW.last.bpm = bpm; if (Math.round(bpm) !== state.seq.bpm) try { setBpm(Math.round(bpm)); } catch (e) {} }
            if (OPT.transport && play !== BW.last.play) { try { if (play && !playing) startSeq(); else if (!play && playing) stopSeq(); } catch (e) {} }
            BW.last.play = play; }
        }
        setInterval(tick, 2);
        BW.level = () => { if (!analyser) return null; const d = new Float32Array(2048); analyser.getFloatTimeDomainData(d); let q = 0; for (const x of d) q += x * x; return Math.sqrt(q / 2048); };
        // names (the host's track names) and the ports' state, twice a second
        setInterval(() => {
          let inf = null; try { inf = NBB.info(); } catch (e) {} if (!inf) return; BW.info = inf;
          inf.slots.forEach((s, i) => { const sl = BW.slots[i]; if (sl && s.state === 1 && s.name !== sl.name) { sl.name = s.name; if (sl.node) sl.node.port.postMessage({ hear: !!OPT.hear[sl.name] }); untap(sl); } });
          paintBtn(); if (!sh.hidden) paintSheet();
        }, 500);
        // ---- the button and the sheet ----
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn nb-bw"; btn.id = "shBw"; btn.innerHTML = "<b>Bitwig</b><span class='v'></span>"; btn.title = "Nate Bloom with Bitwig: the bridge plugin, JACK and MIDI ports";
        btn.addEventListener("click", () => { start(); sh.hidden = false; paintSheet(); });
        const placeBtn = () => { const c = document.getElementById("shCpu") || document.getElementById("shLog"); if (c && btn.nextSibling !== c) c.before(btn); };
        setInterval(placeBtn, 1500); placeBtn();
        const live = () => BW.slots.filter((s, i) => i < NS && s.live);
        function paintBtn() { const n = live().filter(s => s.kind === 1).length; btn.querySelector(".v").textContent = n ? " · " + n : ""; btn.classList.toggle("on", n > 0); }
        const sh = document.createElement("div"); sh.className = "editor sheet"; sh.id = "bwSheet"; sh.hidden = true;
        sh.innerHTML = `<div class="ed-card" role="dialog" aria-label="Bitwig"><div class="ed-head"><strong>Bitwig</strong><span class="ed-info" id="bwState"></span></div>
          <div id="bwBody" style="display:flex;flex-direction:column;gap:8px"></div>
          <div class="ed-foot sheet-foot"><button class="btn big primary" id="bwDone">Done</button></div></div>`;
        document.body.appendChild(sh);
        sh.querySelector("#bwDone").addEventListener("click", () => { sh.hidden = true; });
        const esc4 = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
        function tog(label, sub, on, fn) { const r = document.createElement("label"); r.className = "md-row"; r.innerHTML = `<input type="checkbox"${on ? " checked" : ""}><span><b>${esc4(label)}</b><small style="display:block;font:0.66rem var(--font-mono);color:var(--dim)">${esc4(sub)}</small></span>`; r.querySelector("input").addEventListener("change", e => fn(e.target.checked)); return r; }
        function lab(t) { const d = document.createElement("div"); d.className = "sp-lab"; d.innerHTML = "<span></span>"; d.firstChild.textContent = t; return d; }
        function note(t) { const p = document.createElement("p"); p.className = "ed-info"; p.style.textAlign = "left"; p.textContent = t; return p; }
        function paintSheet() {
          const body = sh.querySelector("#bwBody"); if (!body) return; body.innerHTML = "";
          const bridges = BW.slots.map((s, i) => ({ s, i })).filter(x => x.i < NS && x.s.live);
          const plugs = bridges.filter(x => x.s.kind === 1);
          sh.querySelector("#bwState").textContent = !BW.ok ? (BW.why || "starting…") : plugs.length ? plugs.length + (plugs.length === 1 ? " bridge" : " bridges") + " connected" : "no bridge yet";
          body.appendChild(lab("In Bitwig"));
          body.appendChild(note(BW.plugin && BW.plugin.installed ? "Put Nate Bloom Bridge (Browser › Instruments, by Nate Bloom; it's in ~/.clap) on a track. Its notes, knobs and wheels play the sound picked for it below, and that sound comes back on the track in time, ready to record and mix. One bridge per sound you want on a track of its own." : "The bridge plugin isn't installed" + (BW.plugin && BW.plugin.why ? " (" + BW.plugin.why + ")" : "") + "."));
          if (BW.plugin && BW.plugin.updated) body.appendChild(note("The plugin was just updated: if Bitwig was open, rescan its plugins (Settings › Locations › Rescan) or restart it."));
          const opts = (() => { try { return window.__nbRoute.options().filter(o => o[0] !== "none"); } catch (e) { return [["stack", "What's playing"]]; } })();
          bridges.forEach(({ s, i }) => {
            const b = hdr(i), r = document.createElement("div"); r.className = "ly-quick"; r.style.cssText = "align-items:center;gap:8px;flex-wrap:wrap";
            const age = HB[b + 13], st = age > 600 ? "paused (Bitwig isn't playing audio)" : HB[b + 16] > 0 ? "running" : "running";
            const nm = document.createElement("span"); nm.className = "dj-lab"; nm.style.cssText = "flex:1 1 160px;min-width:0"; nm.innerHTML = `<b style="color:var(--ink)">${esc4(s.name || "Bridge " + (i + 1))}</b> · ${s.kind === 2 ? "JACK" : "bridge"} · ${esc4(st)}`;
            const sel = document.createElement("select"); sel.setAttribute("aria-label", "What " + (s.name || "this bridge") + " carries");
            const cur = routeOf(s); let has = false;
            opts.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = (v === "stack" ? "Everything (what's playing)" : t); if (v === cur) has = true; sel.appendChild(o); });
            if (!has) { const o = document.createElement("option"); o.value = cur; o.textContent = "(not loaded) " + cur; sel.appendChild(o); }
            sel.value = cur; sel.addEventListener("change", () => { OPT.routes[s.name] = sel.value; optSave(); untap(s); s.voices.forEach(vs => vs.forEach(v => { try { v.stop(); } catch (e) {} })); s.voices.clear(); });
            r.append(nm, sel);
            if (s.kind === 1) { const h = document.createElement("button"); h.type = "button"; h.className = "btn"; const on = !!OPT.hear[s.name]; h.textContent = (on ? "✓ " : "") + "Hear its input"; h.title = "Audio sent into the bridge (a sidechain in Bitwig) plays through Nate Bloom"; h.setAttribute("aria-pressed", String(on));
              h.addEventListener("click", () => { OPT.hear[s.name] = !OPT.hear[s.name]; optSave(); if (s.node) s.node.port.postMessage({ hear: !!OPT.hear[s.name] }); paintSheet(); }); r.appendChild(h); }
            body.appendChild(r);
          });
          if (!bridges.length) body.appendChild(note("Nothing connected. Once a bridge is on a track (and Bitwig's audio is running) it shows here."));
          body.appendChild(lab("Together"));
          body.appendChild(tog("Only through Bitwig", "while a bridge carries everything, Nate Bloom's own output is off (no doubled sound); a bridge carrying one sound takes that sound out of Nate Bloom's mix", OPT.only, v => { OPT.only = v; optSave(); BW.slots.forEach(untap); }));
          body.appendChild(tog("Follow Bitwig's tempo", "Nate Bloom's tempo is Bitwig's (Ableton Link does this too, both ways)", OPT.tempo, v => { OPT.tempo = v; optSave(); }));
          body.appendChild(tog("Start and stop with Bitwig", "Bitwig's play and stop run Nate Bloom's sequencer", OPT.transport, v => { OPT.transport = v; optSave(); }));
          body.appendChild(lab("Other apps"));
          const inf = BW.info || {};
          body.appendChild(tog("MIDI ports", inf.midi && inf.midi.on ? "on: \"Nate Bloom in\" plays what's playing from any app (in Bitwig: a track's output or a controller); \"Nate Bloom out\" carries Nate Bloom's MIDI out" : (inf.midi && inf.midi.why) || "\"Nate Bloom in\" and \"Nate Bloom out\" for other apps", OPT.midi, v => { OPT.midi = v; optSave(); try { NBB.midi(v); } catch (e) {} setTimeout(paintSheet, 300); }));
          const so = (() => { try { return window.__nbRoute.sendOn(); } catch (e) { return null; } })();
          if (OPT.midi && so != null) body.appendChild(tog("Send Nate Bloom's MIDI out to \"Nate Bloom out\"", "the MIDI sheet's Send options (melody, keys, drums, clock) then reach other apps too", !!so, v => { try { window.__nbRoute.sendPort(v); } catch (e) {} setTimeout(paintSheet, 200); }));
          body.appendChild(tog("JACK ports", inf.jack && inf.jack.on ? "on: Nate Bloom in JACK / PipeWire with \"mix\" and \"part 1–4\" pairs; pick each part's sound above (JACK · part N)" : (inf.jack && inf.jack.why) || "a stereo pair for the mix and for four parts, for any JACK app (Bitwig on its JACK engine, qpwgraph)", OPT.jack, v => { OPT.jack = v; optSave(); try { NBB.jack(v, 4); } catch (e) {} setTimeout(paintSheet, 400); }));
          if (BW.late) body.appendChild(note(BW.late + " notes arrived too late to land exactly and played at once."));
        }
        (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ bitwig: { ok: BW.ok, why: BW.why, notes: BW.notes, late: BW.late, carriesMix: !!BW.carriesMix, info: BW.info, opt: OPT,
          slots: BW.slots.map((s, i) => s.live ? { i, name: s.name, kind: s.kind, route: routeOf(s), age: HB[hdr(i) + 13], under: HB[hdr(i) + 16], lat: HB[hdr(i) + 7], sr: HB[hdr(i) + 2] } : null).filter(Boolean) } }));
      }
    }
