    // ======================================================================
    // 166: the MiniLab's screen shows where you are. The readout (mlHud) mirrors onto the MiniLab's two lines while
    // it's up, as before; two seconds after the last message the screen settles on an idle page: line 1 the sound
    // the keys play (the stack's sound, the name the sound bar and Live's lvSnd show), line 2 the set list's song
    // with "> next" when there is one, or, with no set list, the tempo and the key. It is repainted only when the
    // text changes (sysex to the keyboard is slow) and only while the MiniLab is live with Lights on. The idle page
    // follows the state document while it's wanted (one subscriber, no reads of its own); a readout, the 165 octave
    // message among them, pushes the idle page back by its two seconds. Lights is one tap now: when a MiniLab is live
    // and the lights are off, the MiniLab section of the MIDI sheet (Settings → MIDI parks that sheet) shows "Light up
    // the MiniLab (pads, screen)", which does what the checkbox does, from a tap (Chrome asks for sysex on a gesture).
    // The default stays off.
    // ======================================================================
    const SCR = { at: 0, on: "", t: 0, unsub: null, tick: 0 };
    const SCR_IDLE = 2000;
    const scrKey = (a, b) => String(a || "") + "\n" + String(b || "");
    const scrWant = () => !!(md.access && ML.lights && mlLive());
    function scrIdleText(d) {
      d = d || nbsGet(); const st = d.stack || {}, sl = d.setlist || {}, t = d.transport || {};
      const snd = (st.sound && st.sound.name) || (st.layers && st.layers[0] && st.layers[0].name) || "Nate Bloom";
      let b;
      if (sl.name) b = sl.name + (sl.next ? " > " + sl.next : "");
      else { const k = t.key || {}, key = k.scale && k.scale !== "off" ? (KEY_NAMES[(((k.root | 0) % 12) + 12) % 12] || "") + " " + k.scale : ""; b = (t.tempo == null ? "" : Math.round(t.tempo) + " bpm") + (key ? " " + key : ""); }
      return [String(snd).trim(), String(b).trim()];
    }
    const scrWrite = mlScreen;   // the original: the two lines to the keyboard (debounced 25 ms), nothing else
    function scrMaybe(d) {
      if (!scrWant() || performance.now() - SCR.at < SCR_IDLE) return;   // (a readout is up: its timer brings the idle page back)
      const [a, b] = scrIdleText(d), k = scrKey(a, b);
      if (k === SCR.on) return;
      SCR.on = k; scrWrite(a, b);
    }
    function scrIdle() { SCR.t = 0; scrMaybe(null); }
    // every readout goes through mlScreen: note the time and what the screen shows, and come back two seconds later
    mlScreen = function (a, b) {
      SCR.at = performance.now(); SCR.on = scrKey(a, b);
      clearTimeout(SCR.t); SCR.t = setTimeout(scrIdle, SCR_IDLE + 30);
      return scrWrite.apply(this, arguments);
    };
    // the document is followed only while the MiniLab is live with Lights on
    function scrFollow() {
      const w = scrWant();
      if (w && !SCR.unsub) { SCR.unsub = nbsSubscribe(d => scrMaybe(d)); }
      else if (!w && SCR.unsub) { SCR.unsub(); SCR.unsub = null; SCR.on = ""; }   // (a screen we stopped writing to may show anything: paint afresh next time)
    }
    SCR.tick = setInterval(() => { if (document.hidden) return; scrFollow(); if (!$id("midiSheet").hidden) litPaint(); }, 1000);
    // new ports (Connect, Rescan, asking again for sysex, a MiniLab plugged in): what its screen shows is anyone's guess, so paint afresh
    { const op = md.onPorts; md.onPorts = function () { const r = op ? op.apply(this, arguments) : undefined; SCR.on = ""; scrFollow(); if (SCR.unsub) setTimeout(() => scrMaybe(null), 700); return r; }; }
    // ---- Lights in one tap ----
    const litBtn = document.createElement("button"); litBtn.type = "button"; litBtn.className = "btn primary"; litBtn.id = "miniLit"; litBtn.hidden = true;
    litBtn.textContent = "Light up the MiniLab (pads, screen)"; litBtn.title = "The same as the box below: Chrome asks once to control MIDI devices";
    { const st = $id("miniSt"); if (st && st.parentNode) st.parentNode.insertBefore(litBtn, st.nextSibling); }
    function litPaint() { const show = !ML.lights && mlLive(); if (litBtn.hidden === show) litBtn.hidden = !show; }
    litBtn.addEventListener("click", () => {
      const cb = $id("miniLights"); if (!cb || cb.checked) { litPaint(); return; }
      cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));   // (the checkbox's own handler: save, ask Chrome for sysex, light the pads)
      add139("midi", "MiniLab lights on (one tap)"); litPaint(); scrFollow();
    });
    { const ps = paintSec; paintSec = function () { const r = ps.apply(this, arguments); try { litPaint(); } catch (e) {} return r; }; }
    $id("midiBtn").addEventListener("click", litPaint);   // (the sheet's own listener holds the old paintSec by reference)
    $id("miniLights").addEventListener("change", () => { litPaint(); scrFollow(); });
    window.__live29 = { SCR, SCR_IDLE, scrIdleText, scrMaybe, scrFollow, litPaint, litBtn };
