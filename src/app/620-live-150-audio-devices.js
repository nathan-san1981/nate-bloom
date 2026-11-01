    // ======================================================================
    // 150: what the tablet's sound is plugged into, for a report. The app keeps the list of audio devices Android
    // shows the page (names once a microphone permission exists, otherwise only kinds) and logs every change: a hub or
    // a K.O. II dropping out and coming back shows as "− … then + …", with the time. The report carries the list, the
    // output the app chose (if any) and, inside the Android app, its fast-pads engine's state. Gear says when the
    // K.O. II's own sound card is connected, since Android may then send the tablet's sound there.
    // ======================================================================
    const ADEV = { list: [], at: 0, changes: [] };
    const devName = d => (d.label || (d.kind === "audiooutput" ? "an output" : "an input") + " (" + String(d.deviceId || d.groupId || "").slice(0, 6) + ")") + (d.kind === "audiooutput" ? " · out" : " · in");
    async function adevRead(why) {
      let devs = [];
      try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput" || d.kind === "audiooutput"); } catch (e) { return; }
      const now = devs.filter(d => d.deviceId !== "default" && d.deviceId !== "communications").map(devName);
      if (why !== "start") {
        const gone = ADEV.list.filter(x => !now.includes(x)), came = now.filter(x => !ADEV.list.includes(x));
        if (gone.length || came.length) { const s = (gone.length ? "− " + gone.join(", ") : "") + (gone.length && came.length ? " · " : "") + (came.length ? "+ " + came.join(", ") : ""); add139("devices", s); ADEV.changes.push([Math.round(performance.now() / 1000), s]); if (ADEV.changes.length > 40) ADEV.changes.shift(); }
      }
      ADEV.list = now; ADEV.at = Date.now();
    }
    adevRead("start");
    try { navigator.mediaDevices.addEventListener("devicechange", () => setTimeout(() => adevRead("change"), 250)); } catch (e) {}
    setInterval(() => { if (!document.hidden) adevRead("poll"); }, 15000);   // (a WebView may not say when something changes)
    const koCard = () => ADEV.list.some(x => /k\.?\s?o\.?\s?ii|ep-?133|teenage/i.test(x));
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => {
      let fast = null; try { if (window.NBFastPads && NBFastPads.info) { const s = NBFastPads.info(); fast = typeof s === "string" ? JSON.parse(s) : s; } } catch (e) { fast = "unreadable"; }
      return { audioDevices: { list: ADEV.list, namesShown: ADEV.list.some(x => !/^an (output|input) \(/.test(x)), changes: ADEV.changes, chosenOutput: (ctx && ctx.sinkId) || "system default", koSoundCard: koCard(),
        app: window.NB_NATIVE ? "Android app " + (NB_NATIVE.version || "") : "browser", fastPads: fast } };
    });
    // Gear: a word when the K.O. II's sound card is there
    { const gs = gearSnd; gearSnd = function () {
        const r = gs.apply(this, arguments);
        return r + (koCard() ? `<p class="lv-note"><b>The K.O. II's sound card is connected.</b> Android may send the tablet's sound to the K.O. II instead of your headphones; if the sound goes missing, ☰ → Help → Fix sound.</p>` : "");
      }; }
    if (window.__live12) window.__live12.gearSnd = gearSnd;   // (Gear's template asks through __live12)
    window.__live15 = { ADEV, adevRead, koCard };
