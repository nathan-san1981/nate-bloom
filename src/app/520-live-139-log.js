    // ======================================================================
    // Live's Log (139): a button in the top bar that saves the Report straight from Live, with what Live was doing.
    // While Live is open a line a second is kept (the last 15 minutes): how far the sound fell behind the clock
    // (a crackle or a dropout), how long the screen was stuck, frames drawn, MIDI messages, memory, what was playing
    // and which effects were on. A tap on Log marks the moment and grabs the last 60 seconds of sound right away,
    // before the note is typed; the dot on the button means the sound has fallen behind since the last log.
    // ======================================================================
    const logB = mkBtn("lvLog", "lv-log", '<i aria-hidden="true"></i><span>Log</span>', "Log: save what Live is doing, the last minute of sound and every setting, to send for a fix");
    $id("lvStop").before(logB); logB.dataset.kc = "G";
    const TL = [];   // one row a second while Live is open
    const TLS = { since: 0, base: null, lag: 0, ts: null, longMs: 0, longN: 0, midi: 0, frames: 0, raf: 0, worst: 0, stutters: 0, seenLag: 0, marks: [] };
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) { TLS.longMs += e.duration; TLS.longN++; } }).observe({ type: "longtask" }); } catch (e) {}
    { const mm = mlMon; mlMon = function () { TLS.midi++; return mm.apply(this, arguments); }; }
    const fxOnStr = () => { try { return ["densOn:dens", "lofiOn:lofi", "hallOn:hall", "frzOn:frz", "shimOn:shim"].filter(x => bfx[x.split(":")[0]]).map(x => x.split(":")[1]).join("+") || "-"; } catch (e) { return "?"; } };
    const num = (f, d) => { try { const v = f(); return v == null || Number.isNaN(v) ? d : v; } catch (e) { return d; } };
    function tlFrame() { TLS.frames++; if (!lv.hidden) TLS.raf = requestAnimationFrame(tlFrame); else TLS.raf = 0; }
    function tlTick() {
      if (!ctx || document.hidden) return;   // (149: on every screen, not only Live and the DJ)
      const now = performance.now() / 1000, ct = ctx.currentTime;
      if (!TLS.base) TLS.base = { w: now, c: ct };
      const lag = (now - TLS.base.w) - (ct - TLS.base.c), dLag = lag - TLS.lag; TLS.lag = lag;
      let tsd = null;
      try { const o = ctx.getOutputTimestamp && ctx.getOutputTimestamp(); if (o && o.performanceTime) { const off = o.performanceTime - o.contextTime * 1000; tsd = TLS.ts == null ? 0 : off - TLS.ts; TLS.ts = off; } } catch (e) {}
      const drift = TLS.drift || 0, behind = ctx.state === "running" ? Math.max(0, Math.round((dLag - drift) * 1000)) : 0;
      if (ctx.state === "running" && dLag - drift < 0.025) TLS.drift = drift * 0.8 + dLag * 0.2;   // (some tablets' audio clock runs a few % fast)
      if (behind > 25) { TLS.stutters++; TLS.seenLag++; logB.classList.add("warn"); logB.title = "The sound fell behind " + TLS.seenLag + (TLS.seenLag === 1 ? " time" : " times") + " since the last log: tap Log to save it"; }
      if (behind > TLS.worst) TLS.worst = behind;
      let po = "";
      try { const s = ctx.playoutStats || ctx.playbackStats; if (s) po = [s.fallbackFramesEvents, Math.round((s.fallbackFramesDuration || 0) * 1000), s.underrunEvents, Math.round((s.underrunDuration || 0) * 1000)].filter(x => x != null).join("/"); } catch (e) {}
      const its = num(() => __stk.items(), []);
      TL.push([Math.round(now - TLS.since), ctx.state, behind, tsd == null ? "" : Math.round(tsd), po, Math.round(TLS.longMs), TLS.longN, TLS.frames, TLS.midi,
        num(() => Math.round(performance.memory.usedJSHeapSize / 1048576), ""), num(() => voices.size, ""), num(() => BP.voices.filter(v => v.end > ctx.currentTime).length, ""), num(() => heldVoices.size, ""),
        its.length, num(() => arpLive() ? 1 : 0, ""), state.hold ? 1 : 0, fxOnStr(), num(() => Math.round(window.__analog.la() * 1000), ""), num(() => window.__analog.NBAN.stalls, ""),
        LV.kpage + (LV.shift ? "^" + lvSPage() : ""), LV.pset, (LV.play === "bp" ? BP.playing : LV.play === "rc" ? RC.playing : playing) ? 1 : 0, Math.round(rcBpm()),
        String((document.getElementById("sndName") || {}).textContent || "").slice(0, 28),
        num(() => (window.__gb && __gb.AU ? __gb.AU.live.size + __gb.AU.sus.size : 0) + (window.__gbNotes ? __gbNotes.size : 0), ""), num(() => window.__wam && __wam.NBW ? __wam.NBW.parts.size : 0, ""), num(() => window.__live23 ? __live23.stuckN() : 0, "")]);
      if (TL.length > 900) TL.splice(0, 60);
      TLS.longMs = 0; TLS.longN = 0; TLS.frames = 0; TLS.midi = 0;
    }
    const TL_HEAD = ["sec", "audio", "behind_ms", "outTs_ms", "playout", "stuck_ms", "stuck_n", "frames", "midi_msgs", "heap_MB", "voices", "pad_voices", "held", "layers", "arp", "hold", "fxlab", "lookahead_ms", "timing_stalls", "knobs", "pads", "playing", "bpm", "sound", "gb_voices", "plugins", "stuck"];
    let tlT = 0;
    new MutationObserver(() => {
      if (!lv.hidden) { TLS.since = performance.now() / 1000; TLS.base = null; TLS.lag = 0; TLS.ts = null; clearInterval(tlT); tlT = setInterval(tlTick, 1000); if (!TLS.raf) TLS.raf = requestAnimationFrame(tlFrame); add139("live", "open · " + innerWidth + "x" + innerHeight + " · " + fxOnStr()); }
      else { add139("live", "closed"); }   // (149: the per-second record keeps going)
    }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    function add139(k, d) { try { window.__nbAdd && window.__nbAdd(k, d); } catch (e) {} }
    // what Live did, in the app's log (taps and keys are logged already; these come from the MiniLab or the code)
    { const s0 = shiftSet; shiftSet = function (on) { const was = !!LV.shift, r = s0.apply(this, arguments); if (was !== !!LV.shift) add139("live", "Shift " + (LV.shift ? "held · knobs " + lvSPage() : "let go")); return r; }; window.__nbShift = shiftSet; }
    { const k0 = setKPage; setKPage = function (k) { const r = k0.apply(this, arguments); add139("live", "knob page " + LV.kpage); return r; }; }
    { const p0 = setPset; setPset = function (s) { const r = p0.apply(this, arguments); add139("live", "pad set " + LV.pset); return r; }; }
    { const a0 = arpSet; arpSet = function (on) { const r = a0.apply(this, arguments); add139("live", "arp " + (on ? "on" : "off") + " · " + num(() => compsNow().filter(c => arpOn(c.key)).map(c => c.key).join("+"), "")); return r; }; }
    { const b0 = brGo; brGo = function () { const r = b0.apply(this, arguments); add139("live", "sound (big knob) → " + String((document.getElementById("sndName") || {}).textContent || "")); return r; }; }
    { const ab = applyBfx; let last = ""; applyBfx = function () { const r = ab.apply(this, arguments); const f = fxOnStr(); if (f !== last) { last = f; add139("fxlab", f); } return r; }; }
    // the Live part of the report
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => {
      const ins = [], outs = [];
      try { if (md.access) { md.access.inputs.forEach(p => ins.push(p.name + (md.ins.has(p.id) ? "" : " (off)"))); md.access.outputs.forEach(p => outs.push(p.name + (md.outs.has(p.id) ? "" : " (off)"))); } } catch (e) {}
      let hallSec = null; try { hallSec = B && B.hall && B.hall.buffer ? +B.hall.buffer.duration.toFixed(2) : null; } catch (e) {}
      return {
        live: { open: !lv.hidden, knobs: LV.kpage, shiftPage: lvSPage(), shiftHeld: !!LV.shift, pads: LV.pset, play: LV.play, split: !!L3.split, fxDrawer: !!LV.fx,
          layers: num(() => __stk.items().map(i => i.name + " (" + i.kind + ")"), []),
          arp: num(() => Object.fromEntries(compsNow().map(c => { const a = getArp(c.key); return [c.key, { on: arpOn(c.key), oct: a.oct, mode: a.mode, rate: a.rate, inArp: armed(c.key) }]; })), {}),
          hold: !!state.hold, fxLab: num(() => Object.assign({}, bfx), {}), fx: state.fx, hallSeconds: hallSec, mobile: !!window.__nbMobile,
          midi: { in: ins, out: outs, miniLab: num(() => mlLive(), false), sync: num(() => syncMode(), ""), clockTo: num(() => md.opt.clockTo, "") },
          setList: { songs: SL.songs.length, current: SL.cur }, keyboard: { seenLately: num(() => kbRecent(), false), keysShown: num(() => capsOn(), false) },
          sinceOpen: TL.length ? TL[TL.length - 1][0] + " s" : "", audioFellBehind: { times: TLS.stutters, worstMs: TLS.worst }, audioClock: { aheadOfPageMs: Math.round(-TLS.lag * 1000), runsFastMsPerSec: Math.round(-(TLS.drift || 0) * 10000) / 10 }, dropouts: { api: DROP.api || "not reported", lastMinute: cpuDrops(60), sinceOpen: DROP.total, ms: Math.round(DROP.totalMs) }, marks: TLS.marks.slice(-20) },
        liveTimeline: { columns: TL_HEAD, rows: TL.slice() },
      };
    });
    // the button: mark the moment, grab the sound now, then the note
    logB.addEventListener("click", () => {
      const at = TL.length ? TL[TL.length - 1][0] : 0; TLS.marks.push(at + " s"); add139("mark", "Log tapped in Live at " + at + " s · fell behind " + TLS.seenLag + "x since the last log");
      TLS.seenLag = 0; logB.classList.remove("warn"); logB.title = "Log: save what Live is doing, the last minute of sound and every setting, to send for a fix";
      try { window.__nbReport && window.__nbReport.open(60, "Live: what went wrong just now? (optional)"); } catch (e) { noteMsg("Couldn't open the log (" + (e && e.message || e) + ")", true); }
    });
    window.__live5 = { TL, TLS, TL_HEAD, tick: tlTick };
