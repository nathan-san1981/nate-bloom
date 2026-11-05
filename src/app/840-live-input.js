  // ======================================================================
  // (183) Your inputs through plugins, in the Linux app: an audio interface's input (the Volt 2's 1, 2 or both, a
  // guitar, a mic, a synth) played live into a sound channel of its own, "Input". It has Nate Bloom's own effects
  // like any sound, and plugin effects go on it from Plugins (the Input tab above the effect list): an amp, a
  // reverb, anything. It's in the mix, so Takes, Keep, Tracks and the Log hear it. Off until you switch it on; it
  // comes back on when the app does. You hear it a little after you play it (the browser's input and output): the
  // panel says how long, measured.
  // ======================================================================
  {
    const NN = window.NB_NATIVE;
    if (NN && /^(linux|windows)$/.test(NN.platform)) {
      const IN = window.__nbIn = { on: false, dev: "", pick: "1", level: 0.8, stream: null, src: null, split: null, merge: null, gain: null, an: null, dest: null, err: "", label: "", devs: [] };
      try { const o = JSON.parse(localStorage.getItem("nightbloom-input") || "{}"); ["dev", "pick"].forEach(k => { if (typeof o[k] === "string") IN[k] = o[k]; }); if (Number.isFinite(o.level)) IN.level = o.level; IN.on = !!o.on; } catch (e) {}
      const save = () => { try { localStorage.setItem("nightbloom-input", JSON.stringify({ dev: IN.dev, pick: IN.pick, level: IN.level, on: IN.on })); } catch (e) {} };
      try { if (typeof fxcNames === "object") fxcNames.in = "Input"; } catch (e) {}
      async function devices() { try { IN.devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) { IN.devs = []; } return IN.devs; }
      function close() {
        try { if (IN.src) IN.src.disconnect(); if (IN.split) IN.split.disconnect(); if (IN.merge) IN.merge.disconnect(); if (IN.gain) IN.gain.disconnect(); } catch (e) {}
        if (IN.stream) IN.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        Object.assign(IN, { stream: null, src: null, split: null, merge: null, gain: null, an: null, dest: null });
      }
      function pick() {   // 1, 2 or both (stereo), to both sides of the channel
        if (!IN.split || !IN.merge) return;
        let chs = 2; try { chs = IN.stream.getAudioTracks()[0].getSettings().channelCount || 2; } catch (e) {}
        try { IN.split.disconnect(); } catch (e) {}
        const two = chs > 1, L = IN.pick === "2" && two ? 1 : 0, R = IN.pick === "12" && two ? 1 : L;   // (one input: on both sides)
        IN.split.connect(IN.merge, L, 0); IN.split.connect(IN.merge, R, 1);
      }
      function wire() {   // into the Input channel (its effects, then the mix); again if the channel is rebuilt
        if (!IN.gain || !ctx || !fx) return;
        let c = null; try { c = fxcGet("in"); } catch (e) {}
        const dest = c ? c.input : fx.input; if (!dest || IN.dest === dest) return;
        try { IN.gain.disconnect(); } catch (e) {} IN.gain.connect(dest); IN.dest = dest;
      }
      async function open() {
        if (!ctx) return false;
        close(); IN.err = "";
        const cons = id => ({ audio: Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, latency: { ideal: 0.003 } }, id ? { deviceId: { exact: id } } : {}) });
        let st = null, why = "";
        try { st = await navigator.mediaDevices.getUserMedia(cons(IN.dev)); } catch (e) { why = e && e.name || "error"; }
        if (!st && IN.dev) { try { st = await navigator.mediaDevices.getUserMedia(cons("")); } catch (e) {} }
        if (!st) { IN.err = why === "NotAllowedError" ? "the input isn't allowed" : "the input didn't open (" + why + ")"; return false; }
        IN.stream = st; IN.src = ctx.createMediaStreamSource(st); IN.split = ctx.createChannelSplitter(2); IN.merge = ctx.createChannelMerger(2);
        IN.gain = ctx.createGain(); IN.gain.gain.value = IN.level / 0.8; IN.an = ctx.createAnalyser(); IN.an.fftSize = 1024;
        IN.src.connect(IN.split); pick(); IN.merge.connect(IN.gain); IN.merge.connect(IN.an);
        const tr = st.getAudioTracks()[0]; IN.label = tr ? tr.label : ""; IN.ctx = ctx;
        if (tr) tr.addEventListener("ended", () => { if (IN.stream !== st) return; IN.err = "the input went away"; close(); paint(); });
        wire(); await devices(); return true;
      }
      async function set(on) { IN.on = on; save(); if (on) await open(); else close(); paint(); if (window.__nbw) window.__nbw.paint(); }
      setInterval(() => { if (IN.on && ctx && (!IN.stream || IN.ctx !== ctx) && !IN.busy) { IN.busy = true; open().finally(() => { IN.busy = false; }); } else if (IN.on) wire(); }, 2000);   // (back after the sound restarts)
      // the latency you hear, measured: the browser's input (the track's own figure) and its output
      const latMs = () => { let a = 0; try { a = IN.stream.getAudioTracks()[0].getSettings().latency || 0; } catch (e) {} return Math.round((a + (ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000); };
      let host = null, rafId = 0;
      function paint() {
        if (!host || !document.body.contains(host)) return;
        const live = !!IN.stream;
        host.querySelector(".nbi-state").textContent = IN.err ? IN.err : live ? "Listening to " + (IN.label || "the input") + " · you hear it about " + latMs() + " ms after you play (turn the interface's direct monitor off, or you'll hear it twice)" : "Off";
        host.querySelector(".nbi-on").textContent = IN.on ? "On" : "Off"; host.querySelector(".nbi-on").setAttribute("aria-pressed", String(IN.on));
      }
      function meter() {
        cancelAnimationFrame(rafId); const cv = host && host.querySelector("canvas"); if (!cv) return;
        const buf = new Float32Array(1024), c = cv.getContext("2d");
        const draw = () => {
          if (!document.body.contains(cv)) return;
          let pk = 0; if (IN.an) { IN.an.getFloatTimeDomainData(buf); for (const v of buf) pk = Math.max(pk, Math.abs(v)); }
          const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, db = 20 * Math.log10(pk + 1e-6), x = Math.max(0, Math.min(1, (db + 60) / 60)) * w;
          c.clearRect(0, 0, w, h); c.fillStyle = pk > 0.95 ? "#ff5c7a" : pk > 0.6 ? "#ffb65c" : "#7fd6c2"; c.fillRect(0, 0, x, h);
          rafId = requestAnimationFrame(draw);
        };
        draw();
      }
      window.__nbInputPaint = async ({ list, head, note, btn }) => {
        head("Your inputs through plugins");
        note("An input of your audio interface (a guitar, a mic, the Minilogue) played live into its own channel, Input. Put plugin effects on it above (the Input tab in Effects) and Nate Bloom's own (FX); it's in everything you record.", true);
        host = document.createElement("div"); host.className = "nbi";
        const row1 = document.createElement("div"); row1.className = "wam-tg";
        const on = btn(IN.on ? "On" : "Off", () => set(!IN.on), IN.on, "Input on or off"); on.classList.add("nbi-on");
        const sel = document.createElement("select"); sel.className = "nbi-dev"; sel.setAttribute("aria-label", "Which input");
        const devs = IN.devs.length ? IN.devs : await devices();
        [["", "The system's input"], ...devs.map((d, i) => [d.deviceId, d.label || "Input " + (i + 1)])].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; if (v === IN.dev) o.selected = true; sel.appendChild(o); });
        if (!IN.dev) { const v = devs.find(d => /volt/i.test(d.label || "")); if (v) sel.value = v.deviceId; }
        sel.addEventListener("change", () => { IN.dev = sel.value; save(); if (IN.on) open().then(paint); });
        const ch = document.createElement("div"); ch.className = "seg";
        [["1", "1"], ["2", "2"], ["12", "1 + 2"]].forEach(([v, t]) => { const b = btn(t, () => { IN.pick = v; save(); pick(); ch.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === v))); }, IN.pick === v, "Input " + t); b.dataset.v = v; ch.appendChild(b); });
        const lv = document.createElement("input"); lv.type = "range"; lv.min = 0; lv.max = 150; lv.value = Math.round(IN.level / 0.8 * 100); lv.setAttribute("aria-label", "Input level");
        lv.addEventListener("input", () => { IN.level = lv.value / 100 * 0.8; if (IN.gain) IN.gain.gain.setTargetAtTime(lv.value / 100, ctx.currentTime, 0.02); save(); });
        row1.append(on, sel, ch, lv); host.appendChild(row1);
        const cv = document.createElement("canvas"); cv.className = "nbi-meter"; host.appendChild(cv);
        const st = document.createElement("p"); st.className = "wam-msg dim nbi-state"; host.appendChild(st);
        list.appendChild(host); paint(); meter();
      };
      (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ input: { on: IN.on, open: !!IN.stream, label: IN.label, pick: IN.pick, level: IN.level, err: IN.err, latencyMs: IN.stream ? latMs() : null } }));
    }
  }
