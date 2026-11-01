    // ======================================================================
    // 159: notes that never stop (reports 0432 and 0434: a drone of held notes through the FX chain, Stop all three
    // times and still held). Four routes lost note-offs, each fixed where it lives: the Garage took every note-off
    // while open (420), Beat Pads took them when its view was open at the note-off (300), the scale snap mapped a
    // note-off to another note when the scale had changed (160), and a plugin that was no longer a layer kept its
    // notes (340). This part is the net under all of that: Stop all forces every voice off whatever the wrappers
    // do, a watchdog releases a MIDI note nothing could still be holding, and the log says what it did.
    // The K.O. II's notes no longer play the keys unless its Keys switch is on (140).
    // ======================================================================
    const NSRC = new Map();   // sounding note → { t: when it started (ms), port: the MIDI input it came from, or "" }
    let MIDI_FROM = "";
    { const om = onMidi; onMidi = function (e) { const p = e && e.target; MIDI_FROM = p ? String(p.name || "MIDI") : "MIDI"; try { return om.apply(this, arguments); } finally { MIDI_FROM = ""; } }; }
    { const n0 = noteOn, f0 = noteOff;
      noteOn = function (m) {
        const before = new Set(voices.keys()), r = n0.apply(this, arguments), t = performance.now();
        voices.forEach((v, k) => { if (!before.has(k) || k === m) NSRC.set(k, { t, port: MIDI_FROM }); });
        return r;
      };
      noteOff = function (m) { const r = f0.apply(this, arguments); NSRC.forEach((s, k) => { if (!voices.has(k)) NSRC.delete(k); }); return r; }; }
    const noteNm = m => ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
    const log159 = (k, d) => { try { window.__nbAdd && window.__nbAdd(k, d); } catch (e) {} };
    // ---- everything off, for certain ----
    function nbReleaseAll(why) {
      const keys = [...voices.keys()];
      keys.forEach(m => { try { noteOff(m); } catch (e) {} });   // the usual way first, so every layer, the recorder and the link hear it
      let forced = 0;
      voices.forEach((v, m) => { forced++; try { v.stop(); } catch (e) {} try { markTones(v.tones, markKey, false); } catch (e) {} });
      voices.clear(); order.length = 0; NSRC.clear();
      try { SUS.held.clear(); } catch (e) {}
      try { releaseHeld(); } catch (e) {}
      try { document.querySelectorAll(".key.down").forEach(k => k.classList.remove("down")); } catch (e) {}
      try { if (window.__wam && __wam.allOff) __wam.allOff(true); } catch (e) {}
      try { if (window.__gb && __gb.liveAllOff) __gb.liveAllOff(); } catch (e) {}
      if (forced) log159("midi", "Stop all forced " + forced + (forced === 1 ? " note" : " notes") + " off that a note-off never reached" + (why ? " · " + why : ""));
      return forced;
    }
    $id("panic").addEventListener("click", () => nbReleaseAll());   // (after 030's own: stopSeq + allOff)
    // ---- the watchdog: a note from a MIDI input that has sounded far longer than anyone holds a key ----
    const STUCK_MS = { ko: 20000, other: 90000 };   // the K.O. II's sequencer notes are short; a keyboard's drone gets a minute and a half
    const isKOName = n => /k\.?\s?o\.?\s?ii|ep-?133/i.test(n || "");
    function stuckList(now) {
      now = now == null ? performance.now() : now; const out = [];
      if (state.hold || SUS.on) return out;
      NSRC.forEach((s, m) => { if (!s.port || !voices.has(m)) return; const lim = isKOName(s.port) ? STUCK_MS.ko : STUCK_MS.other; if (now - s.t > lim) out.push(m); });
      return out;
    }
    function stuckSweep() {
      const L = stuckList(); if (!L.length) return 0;
      L.forEach(m => { const s = NSRC.get(m) || {}; try { noteOff(m); } catch (e) {} if (voices.has(m)) { const v = voices.get(m); try { v.stop(); } catch (e) {} try { markTones(v.tones, markKey, false); } catch (e) {} voices.delete(m); const i = order.indexOf(m); if (i >= 0) order.splice(i, 1); } NSRC.delete(m);
        log159("midi", "released stuck " + noteNm(m) + " from " + (s.port || "MIDI") + " after " + Math.round((performance.now() - (s.t || 0)) / 1000) + " s");
        try { window.__live20 && __live20.shSay("Released a stuck " + noteNm(m) + " (" + (s.port || "MIDI") + ")", false); } catch (e) {} });
      return L.length;
    }
    setInterval(stuckSweep, 2000);
    window.__live23 = { NSRC, nbReleaseAll, stuckList, stuckSweep, STUCK_MS, stuckN: () => stuckList().length, get midiFrom() { return MIDI_FROM; } };
