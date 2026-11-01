    // ======================================================================
    // 149: Log on every screen. The main screen (beside ☰), Rhythm, Beats and the Garage get the Log button Live and
    // the DJ have: a tap marks the moment, grabs the last minute of sound and opens the report with the screen's
    // name. The per-second record now runs on every screen (it was Live and the DJ only), so a log from anywhere carries
    // the minutes before it. The red dot (the sound dropped out or fell behind since the last log) shows on every Log.
    // ======================================================================
    const LOGS = [logB, djLog];
    function screenName() {
      const open = id => { const e = $id(id); return !!(e && !e.hidden); };
      if (!lv.hidden) return "Live";
      if (open("gbView")) return "Garage"; if (open("bpView")) return "Beats"; if (open("rcView")) return "Rhythm"; if (open("djView")) return "DJ";
      const m = document.querySelector('#modes .mode[aria-pressed="true"]');
      return "Main screen (" + (m ? m.textContent.trim() : state.engine) + ", " + (state.view || "keys") + ")";
    }
    function logTap(where) {
      const at = TL.length ? TL[TL.length - 1][0] : 0; TLS.marks.push(where + " " + at + " s");
      add139("mark", "Log tapped on " + where + " at " + at + " s · fell behind " + TLS.seenLag + "x since the last log");
      TLS.seenLag = 0; LOGS.forEach(b => b && b.classList.remove("warn"));
      try { window.__nbReport && window.__nbReport.open(60, where + ": what went wrong just now? (optional)"); } catch (e) { noteMsg("Couldn't open the log (" + (e && e.message || e) + ")", true); }
    }
    function addLog(id, before, where) {
      const anchor = $id(before); if (!anchor || $id(id)) return null;
      const b = mkBtn(id, "lv-log nb-log", '<i aria-hidden="true"></i><span>Log</span>', "Log: save what the app is doing, the last minute of sound and every setting, to send for a fix");
      anchor.before(b); b.addEventListener("click", () => { start(); logTap(typeof where === "function" ? where() : where); }); LOGS.push(b); LOGA.push([b, anchor]); return b;
    }
    // these bars place their buttons by CSS order: each Log takes the order of the button it sits beside
    const LOGA = [];
    const logOrder = () => LOGA.forEach(([b, a]) => { const o = getComputedStyle(a).order; if (b.style.order !== o) b.style.order = o; });
    addLog("hdrLog", "menuBtn", screenName);
    addLog("rcLog", "rcHelpBtn", "Rhythm");
    addLog("bpLog", "bpHelpBtn", "Beats");
    addLog("gbLog", "gbHelpBtn", "Garage");
    // one red dot for all of them (Live's Log is the one the checks mark)
    new MutationObserver(() => { const w = logB.classList.contains("warn"); LOGS.forEach(b => { if (b && b !== logB) { b.classList.toggle("warn", w); b.title = w ? logB.title : "Log: save what the app is doing, the last minute of sound and every setting, to send for a fix"; } }); })
      .observe(logB, { attributes: true, attributeFilter: ["class"] });
    djLog.addEventListener("click", () => logB.classList.remove("warn"));
    logOrder(); addEventListener("resize", () => setTimeout(logOrder, 50));
    // the record from launch, on every screen (Live and the DJ count their own frames; this counts the rest)
    if (!tlT) { TLS.since = performance.now() / 1000; tlT = setInterval(tlTick, 1000); }
    { const djv0 = $id("djView"); const mainFrame = () => { if (lv.hidden && (!djv0 || djv0.hidden)) TLS.frames++; requestAnimationFrame(mainFrame); }; requestAnimationFrame(mainFrame); }
    window.__live14 = { LOGS, logTap, screenName };
