  // ======================================================================
  // 219: a sound taken out of Playing stops sounding, its held notes too. Hold off used to leave the notes it had
  // latched ringing ("Hold: Off · 7 ringing"), on whatever sound they were played with, after that sound was taken
  // out (Only, ✕, swapping it for another): seven Hoover notes kept playing under the Supersaw. Every note a sound
  // plays is noted with the sound it belongs to; when that sound is no longer in Playing its notes stop, and a held
  // note with nothing left sounding is let go. (Sounds still playing keep their held notes, as before.)
  // ======================================================================
  {
    const REG = new Map();   // tag → the voices of that sound still sounding
    let making = null;       // the voices made for the note being made right now
    const tagOf = c => {
      if (!c) return "";
      if (ENGINES[c.key]) return "e:" + c.key + (c.copy != null ? "#" + c.copy : "");
      if (/^lib\d+$/.test(c.key || "")) { const pt = state.lib.parts[+c.key.slice(3)]; return "l:" + (pt && pt.id || c.key); }
      return String(c.key || "");
    };
    const tagOfItem = it => it.t === "syn" ? "e:" + it.id : it.t === "syn2" ? "e:" + it.id + "#" + it.ci : it.t === "lib" ? "l:" + it.id : it.t === "hwx" ? "hwx:" + it.id : it.t;
    function track(tag, v) {
      if (!v || typeof v.stop !== "function" || v.__sg) return v;
      v.__sg = tag; let s = REG.get(tag); if (!s) REG.set(tag, s = new Set()); s.add(v);
      const st = v.stop; v.stop = function () { s.delete(v); if (v.__gone) return; v.__gone = true; return st.apply(this, arguments); };
      if (making) making.push(v);
      return v;
    }
    // (221) key zones for any sound: each sound in Playing can have its own part of the keyboard
    const ZK = "nightbloom-zones"; let ZONES = {};
    try { ZONES = JSON.parse(localStorage.getItem(ZK) || "{}") || {}; } catch (e) {}
    const zSave = () => { try { localStorage.setItem(ZK, JSON.stringify(ZONES)); } catch (e) {} };
    let VELS = {}; try { VELS = JSON.parse(localStorage.getItem("nightbloom-velsplit") || "{}") || {}; } catch (e) {}
    const inVel = tag => { const z = VELS[tag] || VELS[tag.replace(/#\d+$/, "")]; if (!z) return true; const v = typeof NB_VEL7 === "number" ? NB_VEL7 : 100; return v >= z[0] && v <= z[1]; };   // (224) a soft sound and a hard one
    // (239) each keyboard can have its own split ("nightbloom-zones-kb": { keyboard: { sound: [lo, hi] } }), used for
    // the notes from that keyboard instead of the shared one, and can play only one sound ("nightbloom-kb-only")
    let ZKB = {}, KONLY = {};
    const zkbLoad = () => { try { ZKB = JSON.parse(localStorage.getItem("nightbloom-zones-kb") || "{}") || {}; KONLY = JSON.parse(localStorage.getItem("nightbloom-kb-only") || "{}") || {}; } catch (e) {} };
    zkbLoad();
    const inZone = (tag, m) => { const src = window.__nbSrc, base = tag.replace(/#\d+$/, "");
      if (src != null && ZKB[src]) { const zk = ZKB[src][tag] || ZKB[src][base]; return !zk || (m >= zk[0] && m <= zk[1]); }
      const z = ZONES[tag] || ZONES[base]; return !z || (m >= z[0] && m <= z[1]); };
    const kbOK = tag => { const src = window.__nbSrc; if (src == null || !KONLY[src]) return true; const o = KONLY[src]; return tag === o || tag.replace(/#\d+$/, "") === o; };
    const vcG = voiceComponents;
    voiceComponents = function () {
      const r = vcG.apply(this, arguments);
      if (!Array.isArray(r)) return r;
      return r.map(c => { if (!c || typeof c.make !== "function" || c.__sg) return c; const tag = tagOf(c), mk = c.make, acc = c.accepts || (() => true);
        return Object.assign({}, c, { __sg: 1, accepts: m => acc(m) && kbOK(tag) && inZone(tag, m) && inVel(tag), make() { return track(tag, mk.apply(this, arguments)); } }); });
    };
    // which voices each key's note (and each held note) is made of
    const mnG = makeNote;
    makeNote = function () {
      const outer = making, mine = []; making = mine;
      let n; try { n = mnG.apply(this, arguments); } finally { making = outer; if (outer) outer.push(...mine); }
      if (n && typeof n === "object") n.__parts = mine;
      return n;
    };
    function sweep() {
      let its; try { its = window.__stk.items(); } catch (e) { return; }
      const keep = new Set(its.map(tagOfItem)); let n = 0;
      for (const [tag, s] of REG) {
        if (!s.size) { REG.delete(tag); continue; }
        const base = tag.replace(/#\d+$/, "");
        if (keep.has(tag) || (tag.startsWith("e:") && !tag.includes("#") && keep.has(base))) continue;
        for (const v of [...s]) { try { v.stop(); } catch (e) {} n++; }
        REG.delete(tag);
      }
      // an arp left running on a sound that's gone (it carried on after a switch): it stops too
      try { for (const p of PARTS.slice()) { const ls = (p.layers && p.layers.length ? p.layers : [p.eng]).filter(id => ENGINES[id]); if (ls.length && !ls.some(id => keep.has("e:" + id))) { dropPart(p, true); n++; } } } catch (e) {}
      if (!n) return;
      // held notes with nothing left sounding: let go, so Hold and the Still playing strip say what's really there
      let let_ = 0;
      for (const [root, h] of [...heldVoices]) { const ps = h && h.__parts; if (ps && ps.length && ps.every(v => v.__gone)) { heldVoices.delete(root); try { markTones(h.tones, markHeld, false); } catch (e) {} let_++; } }
      if (let_) { try { updateHoldBtn(); } catch (e) {} }
      try { window.__nbAdd && window.__nbAdd("gone", n + " notes stopped with the sound taken out" + (let_ ? " · " + let_ + " held let go" : "")); } catch (e) {}
    }
    window.__nbSweep = sweep;
    { const re = renderEngine; renderEngine = function () { const r = re.apply(this, arguments); setTimeout(sweep, 0); return r; }; }
    setInterval(sweep, 1000);   // (and changes that don't redraw the screen)
    window.__nbZonesReload = () => { try { ZONES = JSON.parse(localStorage.getItem(ZK) || "{}") || {}; VELS = JSON.parse(localStorage.getItem("nightbloom-velsplit") || "{}") || {}; } catch (e) {} zkbLoad(); };
    window.__nbVoiceReg = () => [...REG].map(([t, s]) => [t, s.size]);
  }
