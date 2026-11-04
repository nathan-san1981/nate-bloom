    // ======================================================================
    // 173: a hardware synth in the stack (the Minilogue XD; 187: the MicroFreak and others too). Nate Bloom plays it over USB MIDI like any other sound in
    // Playing together (keys, chords, Hold, the Arp, the sequencer), and its sound comes back in through the audio
    // interface (the Volt 2) into the mix, with its own level and mute in the Mixer; Takes and Tracks hear it.
    // A note goes out early by the input's delay, so what comes back lands with Nate Bloom's own sounds.
    // ======================================================================
    {
      // (187) any hardware synth, not only the Minilogue: the ones Nate Bloom knows by their USB names, or any MIDI output
      // you pick. Pass-through keeps its input open all the time, so what it plays by itself (its own keys, sequencer,
      // arp, a pedal after it) comes through the mix too, even when Nate Bloom isn't playing it.
      const MODELS = [
        { id: "mlxd", name: "Minilogue XD", short: "Minilogue", re: /minilogue\s*xd/i, port: /sound/i, skip: /kbd|knob/i },
        { id: "mf", name: "MicroFreak", short: "MicroFreak", re: /micro\s*freak/i },
        { id: "minif", name: "MiniFreak", short: "MiniFreak", re: /mini\s*freak/i },
        { id: "crave", name: "Crave", short: "Crave", re: /crave/i },
        { id: "grind", name: "Grind", short: "Grind", re: /grind/i },
        { id: "mlog", name: "Minilogue", short: "Minilogue", re: /minilogue(?!\s*xd)/i, port: /sound/i, skip: /kbd|knob/i },
        { id: "other", name: "Hardware synth", short: "Hardware", re: /^\b$/ },
      ];
      const HW_KEY = "nightbloom-hw", IF_RE = /volt/i;
      const H = window.__hw = { name: "Minilogue XD", short: "Minilogue", model: "", thru: false, fxOn: false, out: "", ch: 1, dev: "", pick: "12", level: 0.8, seen: false,
        stream: null, src: null, split: null, merge: null, bus: null, dest: null, an: null, err: "", label: "", opening: null, notes: new Map(), sentAt: 0 };
      try {
        const o = JSON.parse(localStorage.getItem(HW_KEY) || "{}");
        ["out", "dev", "pick", "model"].forEach(k => { if (typeof o[k] === "string") H[k] = o[k]; }); H.thru = !!o.thru; H.fxOn = !!o.fxOn; H.direct = !!o.direct;
        if (o.ch >= 1 && o.ch <= 16) H.ch = o.ch; if (Number.isFinite(o.level)) H.level = o.level; H.seen = !!o.seen;
      } catch (e) {}
      try { H.hadIf = localStorage.getItem("nightbloom-hw-if") === "1"; } catch (e) {}
      const hwSave = () => { try { localStorage.setItem(HW_KEY, JSON.stringify({ out: H.out, ch: H.ch, dev: H.dev, pick: H.pick, level: H.level, seen: H.seen, model: H.model, thru: H.thru, fxOn: H.fxOn, direct: !!H.direct })); } catch (e) {} };
      const outs = () => md.access ? [...md.access.outputs.values()] : [];
      const pname = p => ((p && p.name) || "") + " " + ((p && p.manufacturer) || "");
      const modelOf = p => MODELS.find(m => m.id !== "other" && m.re.test(pname(p))) || null;
      // the model in use: the one picked, else the first known synth plugged in, else the one last seen
      function model() {
        if (H.model) { const m = MODELS.find(x => x.id === H.model); if (m) return m; }
        const on = outs().map(modelOf).find(Boolean); if (on) return on;
        return MODELS.find(x => x.id === H.lastModel) || MODELS[0];
      }
      const isHW = p => { const m = model(); return m.id !== "other" && m.re.test(pname(p)); };
      H.isSynthIn = p => !!modelOf(p);   // (its own keys play it, not the stack: MIDI › Keys says otherwise)
      const setNames = () => { const m = model(); H.name = m.name; H.short = m.short; H.lastModel = m.id; try { if (typeof fxcNames === "object") fxcNames.hw = H.short; } catch (e) {} };
      // ---- MIDI to it: the port you picked, else the Minilogue's own (its SOUND port, not KBD/KNOB) ----
      function hwPort() {
        const all = outs(); if (!all.length) return null;
        if (H.out) { const o = all.find(o => mdKey("out", o) === H.out); if (o) return o; }
        const m = model(), xs = all.filter(isHW);
        return (m.port && xs.find(o => m.port.test(o.name || ""))) || (m.skip && xs.find(o => !m.skip.test(o.name || ""))) || xs[0] || null;
      }
      H.present = () => !!hwPort();
      H.shown = () => H.seen || H.present();
      H.ready = () => H.present() && !!H.src;
      H.why = () => !md.access ? "connect MIDI" : !hwPort() ? "not plugged in" : H.opening ? "opening the input…" : !H.src ? (H.err || "no sound in yet") : "";
      const inStack = () => { try { return !!window.__stk.groupsOn().hw; } catch (e) { return false; } };
      const wantIn = () => inStack() || (H.thru && H.present());   // (187) pass-through: heard whenever it's plugged in
      // the input's own delay: the note goes out this much early, so the sound arrives in the mix on time
      function inLatMs() {
        let l = 0; try { const s = H.stream.getAudioTracks()[0].getSettings(); l = s && s.latency; } catch (e) {}
        return Math.max(0, Math.min(200, (Number.isFinite(l) && l > 0 ? l : 0.012) * 1000 + (ctx && ctx.baseLatency ? ctx.baseLatency * 1000 : 0)));
      }
      // (188) with direct monitoring the interface plays the synth in the headphones the moment it sounds, and Nate
      // Bloom's own sounds come out ~baseLatency + outputLatency after their time: a note goes out that much LATE, so
      // the two meet in the headphones. Otherwise it goes out early by the input's delay, so its sound comes back in on time.
      const outLatMs = () => ctx ? ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000 : 0;
      // (193) a note played live (from the KeyLab, say) goes out the moment it's played, never held back: held back by the
      // output latency (~60 ms) it lost its hit, the way a key that answers late feels soft. Only notes scheduled ahead
      // (sequencer, arp, Rhythm Creator) are lined up with Nate Bloom's own sounds.
      const hwAt = when => { if (!ctx) return 0; if (H.direct) { if (when == null || when - ctx.currentTime < 0.03) return 0; const ms = (when - ctx.currentTime) * 1000 + outLatMs(); return ms > 1 ? performance.now() + ms : 0; }
        if (when == null) return 0; const ms = (when - ctx.currentTime) * 1000 - inLatMs(); return ms > 1 ? performance.now() + ms : 0; };
      // ---- a voice: a note on now (or when it's due), a note off when it stops ----
      H.voice = function (m, when) {
        // (183) muted: no notes go to it at all. Silencing its input wasn't enough: the Volt's own monitoring (or the
        // synth's own outputs) still played it in the headphones, so the speaker button looked broken
        if (H.mute) return { midi: m, hw: true, stop() {} };
        const p = hwPort(); if (!p) return null;
        const ch = (H.ch - 1) & 15, n = m & 127, vel = Math.max(1, Math.min(127, Math.round(NB_VEL7 || 100))), at = hwAt(when);
        try { p.send([0x90 | ch, n, vel], at); } catch (e) { return null; }
        H.notes.set(n, (H.notes.get(n) || 0) + 1); H.sentAt = performance.now();
        let done = false;
        return { midi: m, hw: true, stop(t) {
          if (done) return; done = true;
          const k = (H.notes.get(n) || 1) - 1; if (k > 0) { H.notes.set(n, k); return; } H.notes.delete(n);   // (the same note held twice: off once both let go)
          const off = t == null ? 0 : hwAt(t);
          try { p.send([0x80 | ch, n, 0], off && at ? Math.max(off, at + 1) : off); } catch (e) {}
        } };
      };
      H.allOff = function () {
        const p = hwPort(); if (!p) return; const ch = (H.ch - 1) & 15;
        try { H.notes.forEach((c, n) => p.send([0x80 | ch, n, 0])); p.send([0xb0 | ch, 123, 0]); } catch (e) {}
        H.notes.clear();
      };
      ["panic", "stopAll"].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => H.allOff()); });
      addEventListener("pagehide", () => H.allOff());
      // ---- sound from it: the audio interface's inputs into the mix ----
      const inputs = async () => { try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) { return []; } };
      function hwCloseInput() {
        try { if (H.src) H.src.disconnect(); if (H.split) H.split.disconnect(); if (H.merge) H.merge.disconnect(); } catch (e) {}
        if (H.stream) H.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        H.stream = H.src = H.split = H.merge = H.an = H.bus = H.dest = null; H.standIn = false; H.inId = "";
      }
      function hwPick() {
        if (!H.split || !H.merge) return;
        let chs = 2; try { chs = H.stream.getAudioTracks()[0].getSettings().channelCount || 2; } catch (e) {}
        try { H.split.disconnect(); } catch (e) {}
        const L = H.pick === "2" && chs > 1 ? 1 : 0, R = H.pick === "1" || chs < 2 ? 0 : 1;
        H.split.connect(H.merge, L, 0); H.split.connect(H.merge, R, 1);
      }
      // into its own effects chain through its own level (the Mixer's fader, mute) — and back in if the chain is rebuilt
      // (188) direct monitoring: the headphones already have it (the interface's own monitoring), so Nate Bloom doesn't
      // play it again (no doubling) but records it as it is (raw, no effects, no master volume or compressor), lined up
      // the way it's heard: everything else going to the recorders is held back by the round trip (out + in).
      const OUT = window.__nbOut = { on: false, ctx: null, pre: null, del: null, a: null, safe: null, spkFrom: () => (OUT.on && OUT.ctx === ctx && OUT.pre) ? OUT.pre : analyser };
      function outSplit() {
        if (!ctx || !analyser || !fx || !fx.safe) return;
        const bridgeSpk = !!(window.__nbBridge && __nbBridge.spk && __nbBridge.spkCtx === ctx);
        if (H.direct && H.src) {
          const d = Math.min(0.9, Math.max(0, (outLatMs() + inLatMs()) / 1000));
          if (OUT.on && OUT.ctx === ctx && OUT.a === analyser && OUT.safe === fx.safe) { if (Math.abs(OUT.del.delayTime.value - d) > 0.002) OUT.del.delayTime.setTargetAtTime(d, ctx.currentTime, 0.05); return; }
          const pre = ctx.createGain(), del = ctx.createDelay(1); del.delayTime.value = d;
          try { fx.safe.disconnect(analyser); } catch (e) {}
          fx.safe.connect(pre); pre.connect(del).connect(analyser);
          if (!bridgeSpk) { try { analyser.disconnect(ctx.destination); } catch (e) {} pre.connect(ctx.destination); }   // (the Bitwig sheet's speaker switch rewires itself from __nbOut)
          Object.assign(OUT, { on: true, ctx, pre, del, a: analyser, safe: fx.safe });
        } else if (OUT.on) {
          if (OUT.ctx === ctx && OUT.safe === fx.safe && OUT.a === analyser) {
            try { fx.safe.disconnect(OUT.pre); } catch (e) {} try { OUT.pre.disconnect(); OUT.del.disconnect(); } catch (e) {}
            fx.safe.connect(analyser); if (!bridgeSpk) analyser.connect(ctx.destination);
          }
          Object.assign(OUT, { on: false, pre: null, del: null });
        }
      }
      function hwWire() {
        if (!H.merge || !ctx || !fx) return;
        outSplit();
        if (H.direct) {   // raw, into the recorders only
          if (H.dest === analyser && H.bus) { H.bus.gain.value = H.mute ? 0 : H.level / 0.8; return; }
          if (H.bus) { try { H.merge.disconnect(H.bus); } catch (e) {} }
          const g = ctx.createGain(); g.gain.value = H.mute ? 0 : H.level / 0.8; H.merge.connect(g); g.connect(analyser); H.bus = g; H.dest = analyser;
          return;
        }
        if (H.dest === analyser) { try { H.merge.disconnect(H.bus); H.bus.disconnect(); } catch (e) {} H.bus = null; H.dest = null; }
        // (189) clean unless Nate Bloom's effects are switched on for it: straight to the safety limiter (-3 dBFS), past
        // the effects chain (its tape-drive stage saturates even at Drive 0), the master volume and the master
        // compressor (soft-kneed from about -29 dBFS, 4:1, 5 ms attack: that's what ate the Minilogue's low-end punch).
        // The Mixer's fader and mute still work on it.
        let c = null; if (H.fxOn) { try { c = fxcGet("hw"); } catch (e) {} }
        if (!H.fxOn && fx.limiter && (!H.mk || H.mk.context !== ctx || H.mkTo !== fx.limiter)) { H.mk = ctx.createGain(); H.mk.gain.value = 1;   /* (190) unity: the level bus is already 1 at the Mixer's 0 dB and the trim after the limiter undoes its make-up; 189 counted both (+3.6 dB, enough to push its attacks into the limiter) */ H.mk.connect(fx.limiter); H.mkTo = fx.limiter; }
        const dest = H.fxOn ? (c ? c.input : fx.input) : (fx.limiter ? H.mk : fx.input); if (!dest) return;
        if (H.dest === dest && H.bus) return;
        if (H.bus) { try { H.merge.disconnect(H.bus); } catch (e) {} }
        H.bus = lvBus("hw", dest); H.merge.connect(H.bus); H.dest = dest;
      }
      setNames();
      async function hwOpen(force) {
        if (H.opening) return H.opening;
        if (!ctx) return false;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { H.err = "no audio input in this browser"; return false; }
        if (H.err && !force) return false;
        H.opening = (async () => {
          hwCloseInput(); H.err = "";
          const cons = id => ({ audio: Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, latency: { ideal: 0.005 } }, id ? { deviceId: { exact: id } } : {}) });
          let id = H.dev;
          if (!id) {   // the audio interface, by name (names show once an input has been allowed)
            let devs = await inputs();
            if (!devs.some(d => d.label)) { try { const t = await navigator.mediaDevices.getUserMedia({ audio: true }); t.getTracks().forEach(x => x.stop()); } catch (e) {} devs = await inputs(); }
            const v = devs.find(d => IF_RE.test(d.label || "")); if (v) id = v.deviceId;
          }
          let st = null, why = "";
          try { st = await navigator.mediaDevices.getUserMedia(cons(id)); } catch (e) { why = e && e.name || "error"; }
          if (!st && id && !H.dev) { try { st = await navigator.mediaDevices.getUserMedia(cons("")); } catch (e) {} }
          if (!st) { H.err = why === "NotAllowedError" ? "the audio input isn't allowed here" : "the audio input didn't open (" + why + ")"; return false; }
          if (!wantIn()) { st.getTracks().forEach(t => t.stop()); return false; }   // (taken out while it was opening)
          H.stream = st; H.src = ctx.createMediaStreamSource(st);
          H.split = ctx.createChannelSplitter(2); H.merge = ctx.createChannelMerger(2);
          H.src.connect(H.split); hwPick();
          H.an = ctx.createAnalyser(); H.an.fftSize = 1024; H.merge.connect(H.an);
          hwWire();
          const tr = st.getAudioTracks()[0]; H.label = tr ? tr.label : "";
          // (182) which input this really is: the one asked for, or a stand-in (the system's Default) because it wasn't there
          let gotId = ""; try { gotId = (tr && tr.getSettings().deviceId) || ""; } catch (e) {}
          // (a setup without a Volt is never a stand-in: Default is its input. Only once the Volt has been the input here)
          if (!H.dev && IF_RE.test(H.label)) { H.hadIf = true; try { localStorage.setItem("nightbloom-hw-if", "1"); } catch (e) {} }
          H.inId = gotId; H.standIn = H.dev ? gotId !== H.dev : (H.hadIf && !IF_RE.test(H.label));
          try { window.__nbAdd && window.__nbAdd("hw", "sound in from " + (H.label || "?") + (H.standIn ? " (stand-in: " + (H.dev ? "the input you picked" : "the Volt") + " wasn't there)" : "")); } catch (e) {}
          if (tr) tr.addEventListener("ended", () => { if (H.stream !== st) return; H.err = "the audio input went away"; hwCloseInput(); paintAll(); });
          return true;
        })();
        try { return await H.opening; } finally { H.opening = null; paintAll(); }
      }
      // in the stack: the input opens; out of it: the input closes and its notes stop
      setInterval(() => {
        if (!ctx) return;
        setNames();
        const on = wantIn();
        if (on && !H.src && !H.opening && !H.err && H.present()) hwOpen();
        else if (!on && (H.src || H.stream)) { hwCloseInput(); if (!inStack()) H.allOff(); paintAll(); }
        if (on && H.src) hwWire();
        hwFx();   // (keeps its chain awake: its own keys and sequencer make sound Nate Bloom didn't ask for)
      }, 1000);
      // (182) a device came or went. Unplugging the Volt used to leave the Minilogue on the system's Default input (the
      // computer's own mic, or nothing) after the Volt came back: the headphones had it through the Volt's own
      // monitoring, Takes, Tracks and resampling didn't. Now: lost or on a stand-in, it goes back to the real input as
      // soon as that's there (the events come in pairs, so a short wait first).
      let hwDcT = 0;
      async function hwRecheck() {
        if (!wantIn() || H.opening) return;
        if (H.err) { H.err = ""; hwOpen(true); return; }
        if (!H.src || !H.standIn) return;
        const devs = await inputs();
        const real = H.dev ? devs.find(d => d.deviceId === H.dev) : devs.find(d => IF_RE.test(d.label || ""));
        if (real && real.deviceId !== H.inId) { try { window.__nbAdd && window.__nbAdd("hw", "back on " + (real.label || "the input")); } catch (e) {} hwOpen(true); }
      }
      H.recheck = hwRecheck;
      try { navigator.mediaDevices.addEventListener("devicechange", () => { clearTimeout(hwDcT); hwDcT = setTimeout(hwRecheck, 400); if (!sh.hidden) hwSheetPaint(); }); } catch (e) {}
      setInterval(() => { if (H.standIn && H.src) hwRecheck(); }, 5000);   // (and if the event never came)
      // ---- the ports came or went: the Quick row shows it once it's been seen ----
      { const op = md.onPorts; md.onPorts = function () { if (op) op.apply(this, arguments); if (H.present() && !H.seen) { H.seen = true; hwSave(); } paintAll(); }; }
      // ---- in the Mixer ----
      { const mc = mixChannels; mixChannels = function () {
          const ch = mc.apply(this, arguments);
          if (H.shown()) ch.push({ group: "Hardware", name: H.name, sub: wantIn() ? (H.ready() ? (inStack() ? "playing now · " : "pass-through · ") + (H.label || "audio in") + (H.standIn ? " · not the Volt: Takes won't have it" : "") : H.why()) : "add it from Quick sounds",
            get: () => H.level, set: v => { H.level = v; hwSave(); try { lvApply(); } catch (e) {} }, dflt: 0.8, live: true });
          return ch;
        }; }
      // ---- its sheet: where it's played from, where its sound comes in, its level ----
      const sh = document.createElement("div"); sh.className = "editor sheet"; sh.id = "hwSheet"; sh.hidden = true;
      sh.innerHTML = `<div class="ed-card" role="dialog" aria-label="Hardware synth">
        <div class="ed-head"><strong id="hwTitle">Hardware synth</strong><span class="ed-info" id="hwState"></span></div>
        <span class="ed-info" style="text-align:left">Nate Bloom plays it over USB MIDI with whatever else is playing, and its sound comes back in through your audio interface into the mix. Switch off the interface's direct monitoring for these inputs (the Volt 2's Direct Monitoring button, unlit), or turn on Direct monitoring here; otherwise you hear it twice. Its own keys play it directly; MIDI › Keys makes them play the rest of the stack too.</span>
        <div class="sp-lab"><span>Which synth</span></div>
        <div class="ly-quick"><select id="hwModel" aria-label="Which synth" style="flex:1;min-width:0"></select></div>
        <div class="ly-quick"><button class="btn" id="hwThru" aria-pressed="false" style="flex:1">Pass-through: hear it all the time</button><button class="btn" id="hwFxOn" aria-pressed="false" style="flex:1">Nate Bloom's effects on it</button></div>
        <div class="ly-quick"><button class="btn" id="hwDirect" aria-pressed="false" style="flex:1">Direct monitoring: my interface plays it in my headphones</button></div>
        <span class="ed-info" style="text-align:left" id="hwDirectInfo"></span>
        <div class="sp-lab"><span>Its keys and knobs also play</span></div>
        <div id="hwPlays" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        <span class="ed-info" style="text-align:left" id="hwThruInfo">With pass-through on, its own presets, keys, sequencer and arp, and any pedal after it, come through Nate Bloom whether or not Nate Bloom is playing it, so Takes, the Garage and Live's recorder have it too. Its own effects come through as they are; Nate Bloom's go on top only when you switch them on (the Effects knobs; plugin effects can go on it from the Plugins sheet).</span>
        <div class="sp-lab"><span>MIDI to it</span></div>
        <div class="ly-quick"><select id="hwOut" aria-label="MIDI output" style="flex:1;min-width:0"></select><select id="hwCh" aria-label="MIDI channel"></select></div>
        <div class="sp-lab"><span>Its sound comes in from</span></div>
        <div class="ly-quick"><select id="hwDev" aria-label="Audio input" style="flex:1;min-width:0"></select><select id="hwPick" aria-label="Which inputs"><option value="12">Inputs 1+2 (stereo)</option><option value="1">Input 1</option><option value="2">Input 2</option></select><button class="btn" id="hwRe" title="Look for inputs again">↻</button></div>
        <canvas id="hwMeter" aria-label="Input level" style="width:100%;height:14px;border-radius:7px;background:#0f0d16"></canvas>
        <div class="ly-quick"><span class="dj-lab" style="min-width:44px">Level</span><input type="range" id="hwLvl" min="0" max="125" style="flex:1" aria-label="Level"><span class="dj-lab" id="hwLvlV" style="min-width:48px;text-align:right"></span></div>
        <span class="ed-info" id="hwMsg" style="text-align:left"></span>
        <div class="ed-foot sheet-foot"><button class="btn big" id="hwTest">Test note</button><button class="btn big" id="hwIn"></button><button class="btn big primary" id="hwDone">Done</button></div>
      </div>`;
      document.body.appendChild(sh);
      const $h = id => document.getElementById(id);
      for (let c = 1; c <= 16; c++) { const o = document.createElement("option"); o.value = c; o.textContent = "Ch " + c; $h("hwCh").appendChild(o); }
      let raf = 0;
      async function hwSheetPaint() {
        const out = $h("hwOut"); out.innerHTML = "";
        const add = (sel, v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
        const auto = outs().filter(isHW);
        add(out, "", auto.length ? "Automatic · " + (hwPort() && !H.out ? hwPort().name : auto[0].name) : "Automatic · the " + H.name + " when it's plugged in");
        outs().forEach(o => add(out, mdKey("out", o), o.name + (o.manufacturer ? " · " + o.manufacturer : "")));
        out.value = H.out && outs().some(o => mdKey("out", o) === H.out) ? H.out : "";
        $h("hwCh").value = H.ch; $h("hwPick").value = H.pick;
        const dev = $h("hwDev"), devs = await inputs(); dev.innerHTML = "";
        add(dev, "", "Automatic · " + (devs.find(d => IF_RE.test(d.label || "")) ? devs.find(d => IF_RE.test(d.label || "")).label : "the Volt when it's plugged in"));
        devs.forEach((d, i) => add(dev, d.deviceId, d.label || "Input " + (i + 1)));
        dev.value = H.dev && devs.some(d => d.deviceId === H.dev) ? H.dev : "";
        $h("hwLvl").value = Math.round(H.level / 0.8 * 100); $h("hwLvlV").textContent = mxDb(H.level, 0.8);
        const on = inStack();
        $h("hwIn").textContent = on ? "Take it out" : "+ Play it with the rest";
        { const ms = $h("hwModel"); ms.innerHTML = ""; const plugged = outs().map(modelOf).filter(Boolean);
          add(ms, "", "Automatic · " + (plugged[0] ? plugged[0].name : "the first one plugged in"));
          MODELS.forEach(m => add(ms, m.id, m.id === "other" ? "Another synth (pick its MIDI output below)" : m.name + (plugged.includes(m) ? " · plugged in" : "")));
          ms.value = H.model || ""; }
        $h("hwTitle").textContent = H.name;
        // (185) its keys as a controller too: the sounds playing that they play (the chips' 🎹 menus say the same)
        { const box = $h("hwPlays"); box.innerHTML = ""; const C = window.__nbCtl, list = window.__nbCtlList ? window.__nbCtlList() : [], m = model();
          const me = list.find(c => m.re.test(c.full || c.name)) || (H.model === "other" ? null : null);
          const its = (() => { try { return window.__stk.items().filter(x => x.t !== "hw"); } catch (e) { return []; } })();
          if (!me) { const n = document.createElement("span"); n.className = "ed-info"; n.style.textAlign = "left"; n.textContent = md.access ? "Its MIDI input isn't on: switch it on in Settings › MIDI (it's listed as " + H.name + ")." : "Connect MIDI first."; box.appendChild(n); }
          else if (!its.length) { const n = document.createElement("span"); n.className = "ed-info"; n.textContent = "Nothing else is playing. Add a sound (a plugin, say), then tick it here."; box.appendChild(n); }
          else its.forEach(it => { const k = C.keyOf(it), L = C.get(k), on = L.includes(me.key); const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = (on ? "✓ " : "") + it.name; b.setAttribute("aria-pressed", String(on));
            b.addEventListener("click", () => { const L2 = C.get(k).filter(x => x !== me.key); if (!on) L2.push(me.key); C.set(k, L2); hwSheetPaint(); }); box.appendChild(b); }); }
        $h("hwDirect").setAttribute("aria-pressed", String(!!H.direct));
        $h("hwDirectInfo").textContent = H.direct ? "On: Nate Bloom doesn't play it back to you (the interface already does, so it isn't doubled). It records it raw, at full level and lined up the way you hear it: recordings match your headphones. Notes you play go out the moment you play them; the sequencer's go out about " + Math.round(outLatMs()) + " ms later, so they meet Nate Bloom's own sounds in your ears." : "Off: Nate Bloom plays it back through its mix. Switch the interface's own direct monitoring off, or you hear it twice: the raw copy, then Nate Bloom's about 50 ms later, which thins out the low end. On the Volt 2 that's its Direct Monitoring button, unlit. (Or turn the Volt's button on, orange or blue, and this switch on: one copy, the interface's.)";
        $h("hwThru").setAttribute("aria-pressed", String(!!H.thru)); $h("hwFxOn").setAttribute("aria-pressed", String(hwFxIs()));
        $h("hwState").textContent = !md.access ? "MIDI isn't connected" : !H.present() ? "not plugged in" : on ? (H.ready() ? "playing with the rest" : H.why()) : H.thru ? (H.ready() ? "pass-through: you hear it" : H.why()) : "plugged in · not playing";
        const m = $h("hwMsg");
        m.textContent = !md.access ? "Connect MIDI first (MIDI › Connect)." : !H.present() ? "Plug the " + H.name + " in over USB, or pick the MIDI output it's on (the Volt's MIDI out, say)." : H.err ? H.err.charAt(0).toUpperCase() + H.err.slice(1) + ". Pick the input and tap ↻." : (on || H.thru) && H.src ? "Coming in from " + (H.label || "the input") + "." + (H.standIn ? " That isn't " + (H.dev ? "the input you picked" : "the Volt") + ", so Takes and Tracks won't have the " + H.short + ": plug it in and it switches back, or pick the input here." : "") : "";
        meter();
      }
      function meter() {
        cancelAnimationFrame(raf);
        const cv = $h("hwMeter"), c = cv.getContext("2d"), buf = new Float32Array(1024);
        const draw = () => {
          if (sh.hidden) return;
          const w = cv.width = cv.clientWidth * (devicePixelRatio || 1), h = cv.height = cv.clientHeight * (devicePixelRatio || 1);
          c.clearRect(0, 0, w, h);
          if (H.an) { H.an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v));
            const x = Math.max(0, Math.min(1, (20 * Math.log10(pk + 1e-6) + 60) / 60)) * w; c.fillStyle = pk > 0.95 ? "#ff5c7a" : pk > 0.6 ? "#ffb65c" : "#7fd6c2"; c.fillRect(0, 0, x, h); }
          c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(w * (54 / 60), 0, 2, h);
          raf = requestAnimationFrame(draw);
        };
        draw();
      }
      function paintAll() { try { window.__stk.paint(); } catch (e) {} if (!sh.hidden) hwSheetPaint(); }
      H.open = () => { start(); if (!md.access) { try { connectMidi(); } catch (e) {} } sh.hidden = false; hwSheetPaint(); };
      H.added = () => {
        if (!H.present()) { try { (document.getElementById("uiToast") && (() => { const el = document.getElementById("uiToast"); el.textContent = H.name + " added · " + (md.access ? "plug it in over USB" : "connect MIDI") + " and it plays"; el.hidden = false; setTimeout(() => { el.hidden = true; }, 2800); })()); } catch (e) {} }
        if (ctx && !H.src) { H.err = ""; hwOpen(true); }
      };
      // (187) Nate Bloom's effects on its channel: off by default, so its own sound and effects come through untouched
      function hwFxIs() { return !!H.fxOn; }
      function hwFx() { try { const p = fxcParams("hw"), want = !!H.fxOn; if ((p.on !== false) !== want) { p.on = want; try { localStorage.setItem("nightbloom-fxby", JSON.stringify(FXC)); } catch (e) {} if (fxChan.hw) fxcApply("hw"); } } catch (e) {} }
      $h("hwModel").addEventListener("change", e => { H.allOff(); H.model = e.target.value; setNames(); hwSave(); H.err = ""; if (wantIn()) hwOpen(true); hwSheetPaint(); paintAll(); });
      $h("hwDirect").addEventListener("click", () => { start(); H.allOff(); H.direct = !H.direct; hwSave(); try { hwWire(); } catch (e) {} hwSheetPaint(); paintAll(); });
      $h("hwThru").addEventListener("click", () => { start(); H.thru = !H.thru; hwSave(); H.err = ""; if (wantIn() && !H.src) hwOpen(true); hwSheetPaint(); paintAll(); });
      $h("hwFxOn").addEventListener("click", () => { H.fxOn = !H.fxOn; hwSave(); hwFx(); hwSheetPaint(); });
      $h("hwOut").addEventListener("change", e => { H.allOff(); H.out = e.target.value; hwSave(); hwSheetPaint(); paintAll(); });
      $h("hwCh").addEventListener("change", e => { H.allOff(); H.ch = +e.target.value; hwSave(); });
      $h("hwDev").addEventListener("change", e => { H.dev = e.target.value; hwSave(); H.err = ""; if (wantIn()) hwOpen(true); else hwSheetPaint(); });
      $h("hwPick").addEventListener("change", e => { H.pick = e.target.value; hwSave(); hwPick(); });
      $h("hwRe").addEventListener("click", () => { H.err = ""; if (wantIn()) hwOpen(true); else hwSheetPaint(); });
      $h("hwLvl").addEventListener("input", e => { H.level = (+e.target.value / 100) * 0.8; $h("hwLvlV").textContent = mxDb(H.level, 0.8); hwSave(); try { lvApply(); } catch (er) {} });
      $h("hwTest").addEventListener("click", () => { start(); const v = H.voice(60); if (!v) { $h("hwMsg").textContent = "No MIDI output for it yet."; return; } setTimeout(() => v.stop(), 600); });
      $h("hwIn").addEventListener("click", () => {
        start(); const st = window.__stk; if (!st) return;
        if (inStack()) { const it = st.items().find(x => x.t === "hw"); if (it) st.drop(it); }
        else { st.S().hw = true; renderEngine(); save(); H.added(); }
        setTimeout(hwSheetPaint, 50);
      });
      $h("hwDone").addEventListener("click", () => { sh.hidden = true; cancelAnimationFrame(raf); });
      // (173) the Linux app's Across both screens: the page drops its width limit while the window spans the screens
      if (window.NB_NATIVE && window.NB_NATIVE.onWide) {
        const setW = on => { document.body.classList.toggle("nb-wide", !!on); const b = document.getElementById("suWide"); if (b) b.setAttribute("aria-pressed", String(!!on)); };
        window.NB_NATIVE.onWide(setW); try { window.NB_NATIVE.wideState().then(r => setW(r && r.wide)).catch(() => {}); } catch (e) {}
      }
      // the strip's controller dot says which one it is (the KeyLab or the MiniLab)
      setInterval(() => { const kl = ML.dev === "kl" && !!(window.__klHere && window.__klHere()); document.querySelectorAll('.sh-dot[data-k="minilab"]').forEach(d => { const t = kl ? "KeyLab" : "MiniLab"; if (d.textContent !== t) d.textContent = t; }); }, 1500);
      window.__hwDbg = { hwPort, inLatMs, hwAt, hwWire, hwOpen };
    }
