    // ======================================================================
    // Live's CPU readout (141). A page can't read the tablet's processor directly, so the readout puts together what
    // it can measure cheaply, once a second, from what Live already watches: how busy the app's own work keeps the
    // screen (long tasks and timers running late), whether the sound keeps up with the clock, the audio engine's load
    // where Chrome reports it, and the tablet's CPU pressure where Android reports it. A tap shows the breakdown and
    // switches for the heaviest effects that are on.
    // ======================================================================
    const cpuB = mkBtn("lvCpu", "lv-cpu", '<b>CPU</b><span class="v">—</span><i class="bar"><u></u></i>', "CPU: how hard the tablet is working · tap for the breakdown");
    // (147: not shown: a web page can't see the tablet's processor, so the number was a guess; real dropouts mark the Log button)
    const CPU = { pct: 0, screen: 0, fps: 0, audio: null, peak: null, under: null, press: "", hist: [], tip: "" };
    let pressObs = null;
    function cpuWatch(on) {
      try {
        if (on && !pressObs && "PressureObserver" in window) { pressObs = new PressureObserver(r => { const x = r[r.length - 1]; if (x) CPU.press = x.state; }); pressObs.observe("cpu", { sampleInterval: 2000 }).catch(() => { pressObs = null; }); }
        else if (!on && pressObs) { pressObs.disconnect(); pressObs = null; }
      } catch (e) { pressObs = null; }
      try {
        const rc = ctx && ctx.renderCapacity;
        if (rc) { if (on) { rc.onupdate = e => { CPU.audio = Math.round((e.averageLoad || 0) * 100); CPU.peak = Math.round((e.peakLoad || 0) * 100); CPU.under = e.underrunRatio; }; rc.start({ updateInterval: 1 }); } else rc.stop(); }
      } catch (e) {}
    }
    new MutationObserver(() => cpuWatch(!lv.hidden)).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    const CPU_WORD = { nominal: "relaxed", fair: "fair", serious: "busy", critical: "overloaded" };
    {
      const t0 = tlTick;
      tlTick = function () {
        const longMs = TLS.longMs, frames = TLS.frames, lag = window.__nbLagMs || 0; window.__nbLagMs = 0;
        const r = t0.apply(this, arguments);
        if (!ctx || document.hidden) return r;
        const row = TL[TL.length - 1] || [];
        const screen = Math.min(100, Math.max(longMs, lag) / 10), behind = +row[2] || 0;
        CPU.screen = Math.round(screen); CPU.fps = frames;
        CPU.hist.push(behind); if (CPU.hist.length > 60) CPU.hist.shift();
        const raw = Math.max(screen, CPU.audio || 0);
        CPU.pct = Math.round(CPU.pct ? CPU.pct * 0.5 + raw * 0.5 : raw);
        const recent = CPU.hist.slice(-10).filter(x => x > 25).length + cpuDrops(10);
        const lvl = CPU.pct >= 80 || CPU.press === "critical" || recent >= 2 ? "hot" : CPU.pct >= 50 || CPU.press === "serious" || recent >= 1 ? "warm" : "";
        nbT(cpuB.querySelector(".v"), cpuDrops(10) ? "drops" : CPU.pct + "%"); cpuB.classList.toggle("drops", cpuDrops(10) > 0); cpuB.querySelector("u").style.width = Math.min(100, CPU.pct) + "%";
        cpuB.classList.toggle("warm", lvl === "warm"); cpuB.classList.toggle("hot", lvl === "hot");
        nbA(cpuB, "title", "CPU " + CPU.pct + "% · screen " + CPU.screen + "%" + (CPU.audio != null ? " · audio " + CPU.audio + "%" : "") + (CPU.press ? " · tablet " + (CPU_WORD[CPU.press] || CPU.press) : "") + (cpuDrops(10) ? " · the sound dropped out " + cpuDrops(10) + "× in the last 10 s" : recent ? " · the sound fell behind lately" : "") + " · tap for the breakdown");
        row.push(CPU.pct, CPU.screen, CPU.audio == null ? "" : CPU.audio, CPU.press);
        if (!pick.hidden && pick.querySelector(".lc-wrap")) paintCpu();
        return r;
      };
      TL_HEAD.push("cpu_pct", "screen_pct", "audio_load_pct", "tablet_pressure");
    }
    // the breakdown, and switches for the heaviest effects that are on
    const HEAVY = [["shimOn", "Shimmer", "a reverb inside a feedback loop"], ["hallOn", "Hall+", "a long reverb"], ["frzOn", "Freeze", "four delays held in a loop"], ["densOn", "Density", "oversampled saturation"], ["lofiOn", "Lo-fi", ""]];
    function cpuHTML() {
      const fell = CPU.hist.filter(x => x > 25), worst = fell.length ? Math.max(...fell) : 0, on = HEAVY.filter(([k]) => bfx[k]);
      const its = num(() => __stk.items().length, 0), vs = num(() => voices.size, 0) + num(() => BP.voices.filter(v => v.end > ctx.currentTime).length, 0) + num(() => heldVoices.size, 0);
      const audio = CPU.audio != null ? CPU.audio + "% of what it can do" + (CPU.peak != null ? " (peaks " + CPU.peak + "%)" : "") : fell.length ? "fell behind " + fell.length + (fell.length === 1 ? " time" : " times") + " in the last minute (worst " + worst + " ms)" : cpuDrops(60) ? "not keeping up: see the dropouts" : "keeping up";
      return `<div class="lv-pkh"><div><strong>CPU ${CPU.pct}%</strong><small>Measured once a second from what Live already watches</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl lc-wrap">
          <div class="lc-row"><span>Screen</span><b>${CPU.screen}%</b><i class="bar"><u style="width:${CPU.screen}%"></u></i><small>the app's own work · ${CPU.fps} frames a second</small></div>
          <div class="lc-row${(fell.length || cpuDrops(60)) && CPU.audio == null ? " bad" : ""}"><span>Audio</span><b>${CPU.audio != null ? CPU.audio + "%" : fell.length || cpuDrops(60) ? "!" : "OK"}</b>${CPU.audio != null ? `<i class="bar"><u style="width:${CPU.audio}%"></u></i>` : '<i class="bar off"></i>'}<small>${audio}</small></div>
          ${dropRow()}<div class="lc-row"><span>Tablet</span><b>${CPU.press ? esc3(CPU_WORD[CPU.press] || CPU.press) : "—"}</b><i class="bar off"></i><small>${CPU.press ? "the whole tablet's CPU, as Android reports it" : "this tablet doesn't report its CPU to web pages"}</small></div>
          <div class="lv-pkg">Playing</div>
          <p class="lv-note">${its} ${its === 1 ? "sound" : "sounds layered"} · ${vs} ${vs === 1 ? "voice" : "voices"} sounding · FX Lab: ${on.length ? on.map(x => x[1]).join(", ") : "nothing on"}${state.fx && state.fx.space > 0.01 ? " · Space " + Math.round(state.fx.space * 100) : ""}</p>
          ${on.length ? `<div class="lv-pkg">Lighten it</div><div class="lc-off">${on.map(([k, n, why]) => `<button class="btn" data-k="${k}">${esc3(n)} off<small>${esc3(why)}</small></button>`).join("")}</div>` : ""}
          ${bufHTML()}
        </div>`;
    }
    function paintCpu() {
      const keep = pick.querySelector(".lv-pkl") ? pick.querySelector(".lv-pkl").scrollTop : 0;
      pick.innerHTML = cpuHTML(); const l = pick.querySelector(".lv-pkl"); if (l) l.scrollTop = keep;
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelectorAll(".lc-off button").forEach(b => b.addEventListener("click", () => { bfx[b.dataset.k] = false; saveBfx(); applyBfx(false); lvPaintKnobs(); mlHud(b.textContent.replace(/ off.*/, "") + " off", "lighter on the tablet", null); paintCpu(); }));
    }
    cpuB.addEventListener("click", () => { start(); if (!pick.hidden && pick.querySelector(".lc-wrap")) { closePick(); return; } popAt(cpuB, 400, cpuHTML()); paintCpu(); });
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ cpu: { pct: CPU.pct, screen: CPU.screen, fps: CPU.fps, audioLoad: CPU.audio, audioPeak: CPU.peak, underrunRatio: CPU.under, tablet: CPU.press || "not reported", pressureApi: "PressureObserver" in window, renderCapacityApi: !!(ctx && ctx.renderCapacity), fellBehindLastMinute: CPU.hist.filter(x => x > 25).length } }));
    window.__live7 = { CPU, cpuHTML };
