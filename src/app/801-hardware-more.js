    // ======================================================================
    // 219: every hardware synth that's plugged in gets its own Quick sound, not only the one the Minilogue sheet is set
    // to: the MicroFreak beside the Minilogue XD. Each plays over its own USB MIDI port with whatever else is playing
    // (keys, chords, Hold, the Arp, the sequencer), with its own channel, mute and ✕ in Playing. Its sound reaches you
    // from its own outputs (a mixer, the interface's direct monitoring); if it comes into the computer, pick that input
    // in its sheet and Nate Bloom mixes it in and records it.
    // ======================================================================
    {
      const H = window.__hw;
      if (H && H.models) {
        const KEY = "nightbloom-hwx"; let CFG = {};
        try { CFG = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
        const cfgSave = () => { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch (e) {} };
        const outs = () => H.outsAll();
        const INST = new Map();
        const outMs = () => ctx ? ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000 : 0;
        const inMs = () => 12 + (ctx && ctx.baseLatency ? ctx.baseLatency * 1000 : 0);
        function make(m) {
          const c = CFG[m.id] || (CFG[m.id] = { ch: 1, out: "", dev: "", pick: "12", level: 0.8, seen: false });
          const X = { id: m.id, name: m.name, short: m.short, cfg: c, notes: new Map(), mute: false, src: null, stream: null, bus: null, err: "", label: "" };
          X.port = () => {
            const all = outs(); if (c.out) { const o = all.find(o => mdKey("out", o) === c.out); if (o) return o; }
            const xs = all.filter(o => m.re.test(H.pname(o)));
            return (m.port && xs.find(o => m.port.test(o.name || ""))) || (m.skip && xs.find(o => !m.skip.test(o.name || ""))) || xs[0] || null;
          };
          X.present = () => !!X.port();
          X.shown = () => X.present() || !!c.seen;
          X.ready = () => X.present();
          X.why = () => !md.access ? "connect MIDI" : !X.present() ? "not plugged in" : "";
          // when a note goes out: played live, at once; lined up by the sequencer, so it meets Nate Bloom's own sounds
          // (heard from its own outputs: that much later; through Nate Bloom's input: that much earlier)
          const at = when => { if (!ctx || when == null) return 0; const ahead = (when - ctx.currentTime) * 1000; if (ahead < 30) return 0; const ms = ahead + (c.dev && !H.direct ? -inMs() : outMs()); return ms > 1 ? performance.now() + ms : 0; };
          X.voice = (n0, when) => {
            if (X.mute) return { midi: n0, hw: true, stop() {} };
            const p = X.port(); if (!p) return null;
            const ch = (c.ch - 1) & 15, n = n0 & 127, vel = Math.max(1, Math.min(127, Math.round(NB_VEL7 || 100))), t = at(when);
            try { p.send([0x90 | ch, n, vel], t); } catch (e) { return null; }
            X.notes.set(n, (X.notes.get(n) || 0) + 1);
            let done = false;
            return { midi: n0, hw: true, stop(tt) {
              if (done) return; done = true;
              const k = (X.notes.get(n) || 1) - 1; if (k > 0) { X.notes.set(n, k); return; } X.notes.delete(n);
              const off = tt == null ? 0 : at(tt);
              try { p.send([0x80 | ch, n, 0], off && t ? Math.max(off, t + 1) : off); } catch (e) {}
            } };
          };
          X.allOff = () => { const p = X.port(); if (!p) return; const ch = (c.ch - 1) & 15; try { X.notes.forEach((k, n) => p.send([0x80 | ch, n, 0])); p.send([0xb0 | ch, 123, 0]); } catch (e) {} X.notes.clear(); };
          X.added = () => { c.seen = true; cfgSave(); if (!X.present()) toast(X.name + " added · plug it in over USB and it plays"); wire(X); };
          X.open = () => openSheet(X);
          return X;
        }
        function toast(t) { const e = document.getElementById("uiToast"); if (!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 2800); }
        // the synths this covers: every known one plugged in (or added before) that the Minilogue sheet isn't set to
        function all() {
          const main = H.modelId(), plugged = new Set(outs().map(H.modelOf).filter(Boolean).map(m => m.id));
          return H.models.filter(m => m.id !== "other" && m.id !== main && (plugged.has(m.id) || (CFG[m.id] && CFG[m.id].seen)))
            .map(m => { if (!INST.has(m.id)) INST.set(m.id, make(m)); return INST.get(m.id); });
        }
        window.__hwx = { all, get: id => all().find(X => X.id === id) || null };
        const inStack = X => { try { return (window.__stk.S().hwx || []).includes(X.id); } catch (e) { return false; } };
        // ---- its sound in (optional): an input of the interface, into the mix (or, with direct monitoring, the recorders) ----
        function closeIn(X) { try { if (X.src) X.src.disconnect(); if (X.bus) X.bus.disconnect(); } catch (e) {} if (X.stream) X.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); X.src = X.stream = X.bus = null; X.dest = null; X.label = ""; }
        async function openIn(X) {
          if (X.opening || !ctx || !X.cfg.dev) return;
          X.opening = true; X.err = "";
          try {
            const st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: X.cfg.dev }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, latency: { ideal: 0.005 } } });
            closeIn(X); X.stream = st; X.src = ctx.createMediaStreamSource(st); X.label = (st.getAudioTracks()[0] || {}).label || "";
            const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2); X.src.connect(sp);
            const L = X.cfg.pick === "2" ? 1 : 0, R = X.cfg.pick === "12" ? 1 : L; sp.connect(mg, L, 0); sp.connect(mg, R, 1);
            X.bus = ctx.createGain(); mg.connect(X.bus); X.merge = mg;
          } catch (e) { X.err = "the input didn't open (" + (e && e.name || "error") + ")"; }
          X.opening = false; route(X);
        }
        function route(X) {
          if (!X.bus || !fx) return;
          X.bus.gain.value = X.mute ? 0 : X.cfg.level / 0.8;
          const dest = H.direct ? analyser : (fx.limiter || fx.input); if (!dest || X.dest === dest) return;
          try { X.bus.disconnect(); } catch (e) {} X.bus.connect(dest); X.dest = dest;
        }
        function wire(X) { const want = !!X.cfg.dev && inStack(X) && X.present(); if (want && !X.src && !X.opening && !X.err) openIn(X); else if (!want && X.src) closeIn(X); else if (X.src) route(X); }
        setInterval(() => { if (!ctx) return; all().forEach(wire); }, 1000);
        // ---- the ports came or went: the Quick row has it once it's been plugged in ----
        { const op = md.onPorts; md.onPorts = function () { if (op) op.apply(this, arguments); let ch = false; all().forEach(X => { if (X.present() && !X.cfg.seen) { X.cfg.seen = true; ch = true; } }); if (ch) cfgSave(); try { window.__stk.paint(); } catch (e) {} }; }
        // ---- its sheet ----
        const sh = document.createElement("div"); sh.className = "editor sheet"; sh.id = "hwxSheet"; sh.hidden = true;
        sh.innerHTML = `<div class="ed-card" role="dialog" aria-label="Hardware synth">
          <div class="ed-head"><strong id="hxTitle"></strong><span class="ed-info" id="hxState"></span></div>
          <span class="ed-info" style="text-align:left">Nate Bloom plays it over USB MIDI with whatever else is playing. Its sound reaches you from its own outputs; if it also comes into this computer, pick that input below and it's mixed in and recorded too.</span>
          <div id="hxMf"></div>
          <div class="sp-lab"><span>MIDI to it</span></div>
          <div class="ly-quick"><select id="hxOut" aria-label="MIDI output" style="flex:1;min-width:0"></select><select id="hxCh" aria-label="MIDI channel"></select></div>
          <div class="sp-lab"><span>Its sound comes in from</span></div>
          <div class="ly-quick"><select id="hxDev" aria-label="Audio input" style="flex:1;min-width:0"></select><select id="hxPick" aria-label="Which inputs"><option value="12">Inputs 1+2 (stereo)</option><option value="1">Input 1</option><option value="2">Input 2</option></select></div>
          <div class="ly-quick" id="hxLvlRow"><span class="dj-lab" style="min-width:44px">Level</span><input type="range" id="hxLvl" min="0" max="125" style="flex:1" aria-label="Level"><span class="dj-lab" id="hxLvlV" style="min-width:48px;text-align:right"></span></div>
          <span class="ed-info" id="hxMsg" style="text-align:left"></span>
          <div class="ed-foot sheet-foot"><button class="btn big" id="hxTest">Test note</button><button class="btn big" id="hxIn"></button><button class="btn big primary" id="hxDone">Done</button></div>
        </div>`;
        document.body.appendChild(sh);
        const $x = id => document.getElementById(id);
        for (let c = 1; c <= 16; c++) { const o = document.createElement("option"); o.value = c; o.textContent = "Ch " + c; $x("hxCh").appendChild(o); }
        let cur = null;
        const add = (sel, v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
        async function paintSheet() {
          const X = cur; if (!X) return; const c = X.cfg;
          $x("hxTitle").textContent = X.name;
          { const b = $x("hxMf"); b.innerHTML = ""; if (X.id === "mf" && window.__mfCtl) { const l = document.createElement("div"); l.className = "sp-lab"; l.innerHTML = "<span>What it plays: its own presets and engines</span>"; b.appendChild(l); window.__mfCtl(b); } }
          const out = $x("hxOut"); out.innerHTML = ""; const p = X.port();
          add(out, "", "Automatic · " + (p && !c.out ? p.name : "the " + X.name + " when it's plugged in"));
          outs().forEach(o => add(out, mdKey("out", o), o.name + (o.manufacturer ? " · " + o.manufacturer : "")));
          out.value = c.out && outs().some(o => mdKey("out", o) === c.out) ? c.out : "";
          $x("hxCh").value = c.ch; $x("hxPick").value = c.pick;
          const dev = $x("hxDev"); dev.innerHTML = ""; add(dev, "", "Not through Nate Bloom (its own outputs)");
          let devs = []; try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) {}
          devs.forEach((d, i) => add(dev, d.deviceId, d.label || "Input " + (i + 1)));
          dev.value = c.dev && devs.some(d => d.deviceId === c.dev) ? c.dev : "";
          $x("hxPick").hidden = $x("hxLvlRow").hidden = !c.dev;
          $x("hxLvl").value = Math.round(c.level / 0.8 * 100); $x("hxLvlV").textContent = mxDb(c.level, 0.8);
          const on = inStack(X); $x("hxIn").textContent = on ? "Take it out" : "+ Play it with the rest";
          $x("hxState").textContent = !md.access ? "MIDI isn't connected" : !X.present() ? "not plugged in" : on ? "playing with the rest" : "plugged in · not playing";
          $x("hxMsg").textContent = !md.access ? "Connect MIDI first (Settings › MIDI)." : !X.present() ? "Plug the " + X.name + " in over USB, or pick the MIDI output it's on." : X.err ? X.err.charAt(0).toUpperCase() + X.err.slice(1) + "." : X.src ? "Coming in from " + (X.label || "the input") + "." : "";
        }
        function openSheet(X) { start(); if (!md.access) { try { connectMidi(); } catch (e) {} } cur = X; sh.hidden = false; paintSheet(); }
        const ch = fn => e => { if (!cur) return; fn(cur, e); cfgSave(); paintSheet(); try { window.__stk.paint(); } catch (er) {} };
        $x("hxOut").addEventListener("change", ch((X, e) => { X.allOff(); X.cfg.out = e.target.value; }));
        $x("hxCh").addEventListener("change", ch((X, e) => { X.allOff(); X.cfg.ch = +e.target.value; }));
        $x("hxDev").addEventListener("change", ch((X, e) => { X.cfg.dev = e.target.value; X.err = ""; closeIn(X); wire(X); }));
        $x("hxPick").addEventListener("change", ch((X, e) => { X.cfg.pick = e.target.value; closeIn(X); wire(X); }));
        $x("hxLvl").addEventListener("input", e => { if (!cur) return; cur.cfg.level = (+e.target.value / 100) * 0.8; $x("hxLvlV").textContent = mxDb(cur.cfg.level, 0.8); cfgSave(); route(cur); });
        $x("hxTest").addEventListener("click", () => { if (!cur) return; start(); const v = cur.voice(60); if (!v) { $x("hxMsg").textContent = "No MIDI output for it yet."; return; } setTimeout(() => v.stop(), 600); });
        $x("hxIn").addEventListener("click", () => {
          const X = cur, st = window.__stk; if (!X || !st) return; start();
          if (inStack(X)) { const it = st.items().find(x => x.t === "hwx" && x.id === X.id); if (it) st.drop(it); }
          else { const s = st.S(); s.hwx = (s.hwx || []).filter(x => x !== X.id).concat(X.id); renderEngine(); save(); X.added(); }
          setTimeout(paintSheet, 50);
        });
        $x("hxDone").addEventListener("click", () => { sh.hidden = true; });
        ["panic", "stopAll"].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => all().forEach(X => X.allOff())); });
        addEventListener("pagehide", () => all().forEach(X => X.allOff()));
        // the mute button (it stays in, silent): no notes go to it, and its input goes quiet
        setInterval(() => all().forEach(X => { if (X.bus) X.bus.gain.value = X.mute ? 0 : X.cfg.level / 0.8; }), 500);
      }
    }
