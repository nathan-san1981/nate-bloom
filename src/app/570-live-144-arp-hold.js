    // ======================================================================
    // 144: the Arp always does something when it's switched on, Hold lets go when it's switched off, and the CPU
    // readout counts the sound's actual dropouts (Chrome's playback stats), which is what a crackle is.
    // ======================================================================
    // ---------- the Arp follows what Live asked for when the layers change ----------
    // (a new sound comes into the arp, and arpeggiates if the Arp was on; "left out" only lasts while that layer plays)
    let arpSig = null, arpWant = null;
    function arpFollow() {
      const cs = compsNow(); if (!cs.length) return;
      const keys = cs.map(c => c.key), sig = keys.join(",");
      if (arpSig === null) { arpSig = sig; arpWant = arpLive(); return; }
      if (sig === arpSig) { arpWant = arpLive(); return; }
      arpSig = sig;
      const out = L3.arpOut.filter(k => keys.includes(k)); if (out.length !== L3.arpOut.length) { L3.arpOut = out; l3Save(); }
      if (arpWant ? cs.some(c => armed(c.key) && !arpOn(c.key)) || cs.some(c => !armed(c.key) && arpOn(c.key)) : arpLive()) arpApply(!!arpWant);
    }
    { const p0 = paintPerf; paintPerf = function () { try { arpFollow(); } catch (e) {} return p0.apply(this, arguments); }; }
    function arpSay(want) {
      if (!want) { mlHud("Arp off", "", null); return; }
      const cs = compsNow(), n = cs.filter(c => arpOn(c.key)).length;
      if (n) mlHud("Arp on", (cs.length > 1 ? n + " of " + cs.length + " layers · " : "") + "hold notes (or tap Hold) and it plays", null);
      else mlHud("Arp", cs.length ? "this sound doesn't arpeggiate" : "pick a sound to arpeggiate", null);
    }
    // the app's own Arp panel (under Live) is brought up to date when Live closes, not on every tap
    new MutationObserver(() => { if (lv.hidden && arpPanelDirty) { arpPanelDirty = false; try { renderArpPanel(); } catch (e) {} } }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    // ---------- Hold ----------
    // In Live, Hold off lets go of everything held: latched notes, and an arp still playing from a sound you left.
    // With Hold already off, notes still ringing (latched in the app, or carried over) show, and a tap lets them go.
    const partsN = () => { try { return PARTS.length; } catch (e) { return 0; } };
    function stillHeld() { try { return heldVoices.size + partsN() > 0; } catch (e) { return false; } }
    function letGo() {
      const n = num(() => heldCount(), 0), p = partsN();
      try { releaseHeld(); } catch (e) {}
      try { PARTS.slice().forEach(x => dropPart(x, true)); } catch (e) {}
      try { updateHoldBtn(); } catch (e) {}
      return [n, p];
    }
    function holdTap() {
      let say;
      if (holdOn()) { tap("hold"); const [n, p] = letGo(); say = ["Hold off", n || p ? "let go of " + (n ? n + (n === 1 ? " note" : " notes") : "") + (n && p ? " and " : "") + (p ? (p === 1 ? "an arp" : p + " arps") : "") : ""]; }
      else if (stillHeld()) { const [n, p] = letGo(); say = ["Let go", (n ? n + (n === 1 ? " note" : " notes") : "") + (n && p ? " and " : "") + (p ? (p === 1 ? "an arp" : p + " arps") : "") + " stopped · tap Hold again to hold"]; }
      else { tap("hold"); say = ["Hold on", "notes keep sounding until you tap Hold again"]; }
      add139("live", "hold " + (holdOn() ? "on" : "off") + (say[0] !== "Hold on" && say[1] ? " · " + say[1] : ""));
      paintPerf(); try { paintHeld(); } catch (e) {}
      mlHud(say[0], say[1], null);
    }
    paintHeld = function () {
      let txt = "", ring = false;
      try {
        const ms = [...new Set([...heldVoices.values()].flatMap(v => v.tones || []))].sort((a, b) => a - b);
        const nm = ms.slice(0, 8).map(noteName).join(" ") + (ms.length > 8 ? " +" + (ms.length - 8) : ""), p = partsN();
        if (state.hold && ms.length) txt = "Holding " + nm;
        else if (ms.length) { txt = "Still ringing " + nm; ring = true; }
        else if (p) { txt = (p === 1 ? "An arp" : p + " arps") + " still playing"; ring = true; }
        else if (SUS.on) txt = "Sustain (MiniLab Hold)" + (SUS.held.size ? " · " + SUS.held.size + (SUS.held.size === 1 ? " note" : " notes") : "");
      } catch (e) {}
      const hb = $id("lvHold"); nbT($id("lvHeld"), txt);
      hb.classList.toggle("sus", !!txt && !ring && !txt.startsWith("Holding")); hb.classList.toggle("ring", ring);
    };
    // ---------- dropouts: the sound itself missing its deadline ----------
    const DROP = { api: "", n0: null, ms0: null, hist: [], total: 0, totalMs: 0 };
    function dropRead() {
      try { const s = ctx.playbackStats; if (s && s.underrunEvents != null) return { api: "playbackStats", n: s.underrunEvents, ms: (s.underrunDuration || 0) * 1000 }; } catch (e) {}
      try { const s = ctx.playoutStats; if (s && s.fallbackFramesEvents != null) return { api: "playoutStats", n: s.fallbackFramesEvents, ms: s.fallbackFramesDuration || 0 }; } catch (e) {}
      return null;
    }
    function dropTick() {
      const r = dropRead(); let d = 0, ms = 0;
      if (r) {
        DROP.api = r.api;
        if (DROP.n0 != null && r.n >= DROP.n0) d = r.n - DROP.n0;
        if (DROP.ms0 != null && r.ms >= DROP.ms0) ms = r.ms - DROP.ms0;
        DROP.n0 = r.n; DROP.ms0 = r.ms;
      }
      DROP.hist.push(d); if (DROP.hist.length > 60) DROP.hist.shift();
      if (d) {
        DROP.total += d; DROP.totalMs += ms; TLS.seenLag += d;
        logB.classList.add("warn"); logB.title = "The sound dropped out " + TLS.seenLag + (TLS.seenLag === 1 ? " time" : " times") + " since the last log: tap Log to save it";
        add139("dropout", d + (d === 1 ? " dropout" : " dropouts") + " (" + Math.round(ms) + " ms) · FX Lab " + fxOnStr() + " · " + num(() => __stk.items().length, 0) + " layers");
      }
      return d;
    }
    function cpuDrops(n) { const h = DROP.hist; let s = 0; for (let i = Math.max(0, h.length - n); i < h.length; i++) s += h[i]; return s; }
    function dropRow() {
      if (!DROP.api) return "";
      const m = cpuDrops(60);
      return `<div class="lc-row${m ? " bad" : ""}"><span>Dropouts</span><b>${m}</b><i class="bar off"></i><small>${m ? "the sound missed its deadline " + m + (m === 1 ? " time" : " times") + " in the last minute: that's the crackle (lighten it below)" : "none in the last minute"}</small></div>`;
    }
    {
      const t0 = tlTick;
      tlTick = function () {
        const on = !!ctx && !document.hidden, d = on ? dropTick() : 0, last0 = TL[TL.length - 1];
        const r = t0.apply(this, arguments);
        const row = TL[TL.length - 1];
        if (on && row && row !== last0) { const i = TL_HEAD.indexOf("dropouts"); while (row.length < i) row.push(""); row.push(d); }
        return r;
      };
      TL_HEAD.push("dropouts");
    }
    window.__live10 = { arpFollow, arpSay, holdTap, letGo, stillHeld, DROP, dropTick, cpuDrops };
