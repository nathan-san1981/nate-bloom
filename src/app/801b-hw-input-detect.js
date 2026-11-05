  // ======================================================================
  // 227: which input of the interface each hardware synth's sound is on, found by listening. The Minilogue's input took
  // both of the Volt's inputs (1+2), so a MicroFreak on input 2 came through as the Minilogue, and with its own input
  // unset the MicroFreak's chip had nothing. When a synth's own keys play a note (the MicroFreak's, the Minilogue's
  // MIDI OUT), each input of the Volt is measured just before and just after: the one that jumps is that synth's.
  // Twice the same answer and it's set (the MicroFreak on input 2, the Minilogue on input 1, say). Heard on neither:
  // its sound isn't reaching the computer, and its sheet says so.
  // ======================================================================
  {
    const H = window.__hw;
    if (H && window.__hwx && navigator.mediaDevices) {
      const P = window.__hwProbe = { st: null, an: [], dev: "", label: "", err: "", opening: false, base: [0, 0], quietAt: 0, res: {}, last: {}, until: 0 };
      const buf = new Float32Array(2048);
      const rms = a => { a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
      const say = (t) => { try { window.__nbAdd && window.__nbAdd("hw", t); } catch (e) {} };
      const toast = m => { const e = document.getElementById("uiToast"); if (!e) return; e.textContent = m; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 4500); };
      async function voltDev() {
        const ds = await navigator.mediaDevices.enumerateDevices();
        return ds.find(d => d.kind === "audioinput" && H.dev && d.deviceId === H.dev) || ds.find(d => d.kind === "audioinput" && /volt/i.test(d.label || "")) || null;
      }
      async function open() {
        if (P.st || P.opening || !ctx) return; P.opening = true;
        try {
          const d = await voltDev(); if (!d) { P.err = "no Volt"; return; }
          const st = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: d.deviceId }, channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          P.st = st; P.dev = d.deviceId; P.label = d.label || "the interface"; P.err = "";
          const src = ctx.createMediaStreamSource(st), sp = ctx.createChannelSplitter(2); src.connect(sp); P.src = src;
          P.an = [0, 1].map(i => { const a = ctx.createAnalyser(); a.fftSize = 2048; sp.connect(a, i); return a; });
        } catch (e) { P.err = (e && e.name) || "error"; }
        finally { P.opening = false; }
      }
      function close() { try { P.src && P.src.disconnect(); } catch (e) {} if (P.st) P.st.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); P.st = P.src = null; P.an = []; }
      // the resting level of each input, between notes
      setInterval(() => { if (!P.an.length || performance.now() < P.quietAt) return; P.an.forEach((a, i) => { const v = rms(a); P.base[i] = P.base[i] ? P.base[i] * 0.7 + v * 0.3 : v; }); }, 120);
      const XD = () => ({ id: "hw", name: H.name, get pick() { return H.pick; }, dev: () => H.dev, set(dev, pick) { H.pick = pick; try { H.save(); H.pickApply && H.pickApply(); } catch (e) {} } });
      const MF = id => { const X = window.__hwx.get(id); return X && { id, name: X.name, get pick() { return X.cfg.pick; }, dev: () => X.cfg.dev, set(dev, pick) { X.cfg.dev = dev; X.cfg.pick = pick; try { window.__hwxCfgSave(); X.rewire && X.rewire(); } catch (e) {} } }; };
      function heard(who) {
        if (!P.an.length) return;
        // (239) the MicroFreak's keys playing Nate Bloom (which plays the Minilogue) brought the Minilogue in: that isn't
        // the MicroFreak's own sound, so it doesn't count
        if (who !== "hw" && performance.now() - (H.sentAt || 0) < 600) return;
        if (who !== "hw" && window.__mfMode && window.__mfMode() === "nb") { try { if (window.__stk.items().some(it => it.t === "hw")) return; } catch (e) {} }
        const b = P.base.slice(), mx = [0, 0]; let n = 0; P.quietAt = performance.now() + 700;
        const t = setInterval(() => {
          P.an.forEach((a, i) => { mx[i] = Math.max(mx[i], rms(a)); });
          if (++n < 5) return; clearInterval(t);
          const up = mx.map((v, i) => v > 0.004 && v > 3 * Math.max(b[i], 0.0004));
          const ans = up[0] && up[1] ? "12" : up[0] ? "1" : up[1] ? "2" : "";
          const L = P.last[who] || { ans: null, k: 0 }; L.k = L.ans === ans ? L.k + 1 : 1; L.ans = ans; P.last[who] = L;
          if (L.k >= 2) decide(who, ans);
        }, 90);
      }
      function decide(who, ans) {
        const prev = P.res[who]; P.res[who] = { ans, at: Date.now() };
        if (prev && prev.ans === ans) return;
        const S = who === "hw" ? XD() : MF(who); if (!S) return;
        if (!ans) { say(S.name + ": not heard on " + P.label + " when it plays");
          // (229) its input set to the interface (or "default", which is the interface) only brings in the other synth again: off
          if (who !== "hw") { const d = S.dev(); if (d && (d === P.dev || d === "default")) { S.set("", "12"); say(S.name + "'s input cleared (it was taking " + P.label + ", the other synth's sound)"); } } if (who !== "hw") toast(S.name + " isn't heard on " + P.label + ": USB carries only its MIDI. Run a cable from its audio out to a free input."); try { window.__hwxRepaint && window.__hwxRepaint(); } catch (e) {} return; }
        const name = ans === "12" ? "inputs 1+2" : "input " + ans;
        say(S.name + " heard on " + P.label + " " + name);
        // its own: set when it has none, or when it was taking both and only one is its
        const mine = S.dev(), onVolt = !mine || mine === P.dev;
        if (onVolt && S.pick !== ans && (who !== "hw" || ans !== "12")) { S.set(P.dev, ans); toast(S.name + " is on " + P.label + " " + name + " · set"); }
        // the other synth taking both inputs gives up this one
        if (ans !== "12") {
          const other = ans === "1" ? "2" : "1";
          const others = [XD()].concat(window.__hwx.all().map(X => MF(X.id))).filter(o => o && o.id !== who);
          others.forEach(o => { const od = o.dev(), same = o.id === "hw" ? (!od || od === P.dev) : od === P.dev; if (same && o.pick === "12") { o.set(P.dev, other); say(o.name + " moved to " + P.label + " input " + other + " (" + S.name + " is on input " + ans + ")"); } });
        }
        try { window.__hwxRepaint && window.__hwxRepaint(); window.__stk.paint(); } catch (e) {}
      }
      // its own keys: listen on each synth's MIDI input directly (whatever Nate Bloom does with those notes)
      const hooked = new WeakSet();
      function hook() {
        if (!md.access) return;
        for (const i of md.access.inputs.values()) {
          if (hooked.has(i)) continue; const nm = (i.name || "") + " " + (i.manufacturer || "");
          const m = H.models.find(x => x.id !== "other" && x.re.test(nm)); if (!m) continue;
          if (m.skip && !/kbd|knob|midi out/i.test(i.name || "") && /sound/i.test(i.name || "")) continue;   // (the XD's own keys come from its MIDI OUT port)
          hooked.add(i);
          i.addEventListener("midimessage", e => {
            const d = e.data; if (!d || (d[0] & 0xf0) !== 0x90 || !d[2]) return;
            const who = H.modelId() === m.id ? "hw" : m.id; P.until = Date.now() + 10 * 60000;
            if (!P.st) { open(); return; }
            heard(who);
          });
        }
      }
      setInterval(() => {
        hook();
        if (P.st && Date.now() > P.until) close();   // (only open while someone is playing them)
      }, 2000);
      P.decide = decide;
      // (229) once: a MicroFreak input left on "default" (the Volt, which carries the Minilogue) doubled the Minilogue in
      // recordings; its sound isn't on the Volt (USB only), so that input goes back to "its own outputs"
      setTimeout(() => { try { if (localStorage.getItem("nb-mf-dev-229")) return; localStorage.setItem("nb-mf-dev-229", "1");
        const X = window.__hwx.get("mf"); if (X && X.cfg.dev === "default" && X.cfg.pick === "12") { X.cfg.dev = ""; window.__hwxCfgSave(); X.rewire && X.rewire(); say("MicroFreak's input (default, the Volt) cleared: it brought the Minilogue in twice"); } } catch (e) {} }, 4000);
      P.text = id => { const r = P.res[id]; if (!r) return P.err ? "" : "Play a few notes on its own keys: Nate Bloom finds which input of " + (P.label || "the interface") + " it's on."; return r.ans ? "Heard on " + P.label + (r.ans === "12" ? " inputs 1+2" : " input " + r.ans) + "." : "Not heard on " + P.label + " when it plays: its sound isn't coming into the computer. USB carries only its MIDI: run a cable from its audio out to a free input on " + (P.label || "the interface") + "."; };
    }
  }
