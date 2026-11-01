    // ======================================================================
    // 152: MIDI devices that arrive after Nate Bloom opened. In the Android app, Rescan reused the list Android gave at
    // the first connect, so a controller plugged in later only showed up if Android's "device added" call reached the
    // page. Now Rescan asks Android again, the list is read again every few seconds and on coming back from another
    // app, Rescan says what it found, every change is logged ("midi + Arturia Minilab3"), and the report carries what
    // Android lists at that moment.
    // ======================================================================
    const MDL = { asks: 0, changes: [], last: null };
    const mdUniq = a => [...new Set(a)];
    const mdIns = () => md.access ? mdUniq([...md.access.inputs.values()].map(p => p.name || "MIDI input")) : [];
    function mdAsk() {
      if (!md.access) return;
      if (window.__nbMidiState) { try { __nbMidiState(); MDL.asks++; } catch (e) {} }   // (the app: read Android's list again)
      const now = mdIns(), prev = MDL.last; MDL.last = now;
      if (prev === null) { add139("midi", "connected · " + (now.length ? now.join(", ") : "no MIDI devices")); return; }
      const gone = prev.filter(x => !now.includes(x)), came = now.filter(x => !prev.includes(x));
      if (!gone.length && !came.length) return;
      const s = (came.length ? "+ " + came.join(", ") : "") + (came.length && gone.length ? " · " : "") + (gone.length ? "− " + gone.join(", ") : "");
      add139("midi", s); MDL.changes.push([Math.round(performance.now() / 1000), s]); if (MDL.changes.length > 40) MDL.changes.shift();
    }
    $id("mdConnect").addEventListener("click", () => setTimeout(() => {
      mdAsk(); if (!md.access) return;
      const n = mdIns(), info = $id("mdInfo");
      if (info) info.textContent = n.length ? "Rescanned · found " + n.join(", ") + "."
        : (window.NB_NATIVE ? "Rescanned · Android shows no MIDI devices. Check the controller's lights are on, then unplug its cable and plug it back in."
          : "Rescanned · no MIDI devices found. Check the controller is plugged in and on.");
      add139("midi", "Rescan · " + (n.length ? n.join(", ") : "nothing found"));
    }, 400));
    setInterval(() => { if (!document.hidden) mdAsk(); }, 3000);
    $id("startBtn").addEventListener("click", () => setTimeout(mdAsk, 800));   // (the first look, once it connects by itself)
    document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(mdAsk, 400); });
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => {
      let android = "not the Android app";
      try { if (window.NBMidiBridge && NBMidiBridge.list) android = JSON.parse(NBMidiBridge.list() || "[]").map(p => p.type + ": " + p.name); } catch (e) { android = "unreadable"; }
      return { midiDetail: { connected: !!md.access, inputs: mdIns(), outputs: md.access ? md.access.outputs.size : 0, androidLists: android, asks: MDL.asks, changes: MDL.changes } };
    });
    window.__live17 = { MDL, mdAsk, mdIns };
