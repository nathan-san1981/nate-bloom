    // ======================================================================
    // 165: the MiniLab's other buttons. Oct − / Oct + move the keyboard itself, not the app: the MiniLab sends no
    // message for them, the keys simply arrive an octave up or down. So the app reads the octave off the notes its
    // keys send (25 keys, C3 to C5 at octave 0; a semitone of transpose either side is allowed for) and follows: the
    // on-screen keys, Play's Octave buttons and the strip move with it, and the readout says so. It can only tell
    // once a note lands outside the window the keyboard was on, so after Oct − it follows at the first low note.
    // The MiniLab's Shift + pads 13–16 (loop, stop, play, record) arrive on its DAW port as Mackie Control notes;
    // they used to be dropped. Now play / stop / record drive what ▶ ■ ● do on the screen you're on.
    // ======================================================================
    const OCT = { k: null, applied: null, hist: [] };
    const octWord = k => k > 0 ? "+" + k : k < 0 ? "−" + (-k) : "0";
    function mlOctApply(k) {
      const want = Math.max(-2, Math.min(2, k));
      if (state.octave !== want) { state.octave = want; OCT.applied = want; try { buildKeys(); } catch (e) {} try { if (window.__live21) __live21.plPaintTop(); } catch (e) {} }
      mlHud("Octave " + octWord(k), "the MiniLab's keys moved; the screen follows" + (k !== want ? " (it stops at " + octWord(want) + ")" : ""));
      add139("midi", "MiniLab octave " + octWord(k));
    }
    function mlOctNote(n) {
      const now = performance.now();
      OCT.hist.push({ n, t: now }); OCT.hist = OCT.hist.filter(h => now - h.t < 20000).slice(-12);
      const moved = OCT.applied != null && state.octave !== OCT.applied;   // the screen's octave was changed by hand since
      const cur = OCT.k == null || moved ? (state.octave || 0) : OCT.k;
      if (moved) OCT.applied = null;
      const fits = (k, list) => list.every(h => h.n >= 47 + 12 * k && h.n <= 73 + 12 * k);
      if (fits(cur, OCT.hist)) { OCT.k = cur; return; }
      let list = OCT.hist.slice(), K = [];
      while (list.length && !K.length) { for (let k = -4; k <= 4; k++) if (fits(k, list)) K.push(k); if (!K.length) list.shift(); }
      OCT.hist = list;
      if (!K.length) return;
      const k = K.reduce((b, x) => Math.abs(x - cur) < Math.abs(b - cur) ? x : b, K[0]);
      if (k !== OCT.k) { OCT.k = k; mlOctApply(k); }
    }
    // ---- the DAW port: Mackie Control transport ----
    const MCU = { 94: "play", 93: "stop", 95: "rec", 86: "loop", 91: "start", 92: "ff", 89: "metro", 81: "undo", 80: "save" };   // (186: the KeyLab's Metro, Undo and Save too)
    const isMlDaw = p => isML(p) && /mcu|hui|alv|din/i.test(p.name || "");
    const liveOpen = () => { const l = $id("liveView"); return !!l && !l.hidden; };
    // (186) on the Garage its transport is the song's: ▶ plays or stops it, ● records on the selected track, ⟳ cycle,
    // ⏪ ⏩ a bar back and on (⏪ at the start of the song, or while it plays: back to the start), Metro, Undo
    const gbOpenNow = () => { const v = $id("gbView"); return !!v && !v.hidden && !liveOpen(); };
    function gbTransport(what) {
      const G = window.__gb && __gb.ml; if (!G) return false;
      const S = G.song();
      if (what === "play") { tap("gbPlay"); mlHud("▶ / ■", "the song"); }
      else if (what === "stop") { if (G.playing()) { G.stop(); mlHud("■", "the song stopped"); } else { tap("gbHome"); mlHud("⏮", "back to the start"); } }
      else if (what === "rec") { tap("gbRec"); mlHud("●", "records on " + ((G.curTr() || {}).name || "the selected track")); }
      else if (what === "loop") { G.cycle(); mlHud("⟳", "cycle"); }
      else if (what === "start") { if (G.playing() || !S || !S.ph) { tap("gbHome"); mlHud("⏮", "back to the start"); } else { G.seekBy(-1); mlHud("⏪", "a bar back"); } }
      else if (what === "ff") { G.seekBy(1); mlHud("⏩", "a bar on"); }
      else if (what === "metro") { G.metro(); mlHud("Metronome", S && S.metro ? "on" : "off"); }
      else if (what === "undo") { G.undo(); mlHud("Undo", ""); }
      else if (what === "save") { G.saveSong(); mlHud("Saved", S ? S.name : ""); }
      else return false;
      add139("midi", (ML.dev === "kl" ? "KeyLab" : "MiniLab") + " transport " + what + " (Garage)");
      return true;
    }
    function mlTransport(what) {
      start();
      if (gbOpenNow() && gbTransport(what)) return;
      if (what === "play") { if (liveOpen()) tap("lvGo"); else if ($id("bdPlay") && !$id("buildBar").hidden) tap("bdPlay"); else tap("play"); mlHud("▶", liveOpen() ? "Live's ▶ target" : "plays this tab"); }
      else if (what === "stop") { tap("stopAll"); mlHud("■", "everything stopped"); }
      else if (what === "rec") { if (liveOpen()) tap("lvRec"); else tap("takeBtn"); mlHud("●", liveOpen() ? "Live's recorder" : "a take"); }
      else if (what === "loop") { if (liveOpen()) { tap("lvRec"); mlHud("Loop", "Live's loop recorder"); } else if ($id("gbView") && !$id("gbView").hidden) { tap("gbLoopsBtn"); mlHud("Loop", "the Garage's loops"); } else mlHud("Loop", "nothing to loop on this screen"); }
      else if (what === "start") { tap("stopAll"); mlHud("⏮", "back to the start"); }
      else mlHud(ML.dev === "kl" ? "KeyLab" : "MiniLab", what);
      add139("midi", (ML.dev === "kl" ? "KeyLab" : "MiniLab") + " transport " + what);
    }
    { const om = onMidi; onMidi = function (e) {
        const p = e.target, d = e.data || [];
        if (p && ML.mode !== "off" && d.length >= 3 && isML(p)) {
          const st = d[0], d1 = d[1], d2 = d[2], cmd = st & 0xf0, ch = st & 15;
          if (isMlDaw(p)) {
            if (cmd === 0x90 && d2 > 0 && MCU[d1]) { mlTransport(MCU[d1]); return; }
            if (cmd === 0x90 || cmd === 0x80) return;   // (the release, or a Mackie key the app has no job for)
            return om.apply(this, arguments);
          }
          if (cmd === 0x90 && d2 > 0 && ch !== ML.padCh && md.ins.has(p.id) && mlPortOn(p) && !isKL(p)) { try { mlOctNote(d1); } catch (err) {} }   // (173: not the KeyLab: its 61 keys don't move the screen)
        }
        return om.apply(this, arguments);
      }; }
    window.__live28 = { OCT, mlOctNote, mlOctApply, mlTransport, MCU };
