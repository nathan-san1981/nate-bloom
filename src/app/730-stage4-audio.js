    // ======================================================================
    // 160, stage 4 (the tablet's side): the audio line to the Pixelbook. When Capture or Visuals there ask ("audio"),
    // the tablet's output, after the limiter, goes out as a stereo Opus track on the link's direct line; when they
    // let go, or the link drops, it stops. It is for recording and pictures on the Pixelbook, never for what you hear:
    // nothing on the tablet's own output changes. The document's rig section says whether it's on.
    // ======================================================================
    const AUD = { on: false, dest: null, track: null, from: null, since: 0 };
    const audFrom = () => (fx && (fx.safe || fx.comp)) || null;
    function lkAudio(on) {
      if (on) {
        if (!ctx) start(); const src = audFrom(); if (!ctx || !src) return false;
        if (!AUD.dest || AUD.dest.context !== ctx) { AUD.dest = ctx.createMediaStreamDestination(); AUD.dest.channelCount = 2; AUD.track = AUD.dest.stream.getAudioTracks()[0]; AUD.from = null; }
        if (AUD.from !== src) { if (AUD.from) { try { AUD.from.disconnect(AUD.dest); } catch (e) {} } try { src.connect(AUD.dest); } catch (e) {} AUD.from = src; }
        if (!AUD.on) { AUD.on = true; AUD.since = performance.now(); add139("link", "audio line to the Pixelbook: on"); }
        try { if (LKS.L && LKS.L.setAudio) LKS.L.setAudio(AUD.track); } catch (e) {}
      } else if (AUD.on) {
        AUD.on = false; if (AUD.from) { try { AUD.from.disconnect(AUD.dest); } catch (e) {} AUD.from = null; }
        try { if (LKS.L && LKS.L.setAudio) LKS.L.setAudio(null); } catch (e) {}
        add139("link", "audio line to the Pixelbook: off");
      }
      try { nbsRefresh(true); } catch (e) {}
      return AUD.on;
    }
    const audInfo = () => ({ kind: "audio", on: AUD.on, rate: ctx ? ctx.sampleRate : 0, direct: nbsTry(lkDirect, false), since: AUD.since });
    { const rd = nbsRead; nbsRead = function () { const d = rd.apply(this, arguments); try { if (d.rig) d.rig.audioLine = AUD.on; } catch (e) {} return d; }; }
    { const li = lkIn; lkIn = function (t, d) {
        if (t === "cmd" && d && d.do === "audio") { lkAudio(!!d.on); try { lkSend("data", audInfo()); } catch (e) {} return; }
        if (t === "pull" && d && d.kind === "audio") { try { lkSend("data", audInfo()); } catch (e) {} return; }
        return li.apply(this, arguments);
      }; }
    try { window.__live13.lkIn = lkIn; } catch (e) {}
    // the line follows the link: a new direct line gets the track again (the link keeps it), a dead link ends it
    setInterval(() => { if (AUD.on && !nbsTry(lkUp, false)) lkAudio(false); }, 1000);
    // (the chain can be rebuilt, e.g. after the sound recovers: follow it)
    setInterval(() => { if (AUD.on && audFrom() && audFrom() !== AUD.from) lkAudio(true); }, 2000);
    window.__live26 = { AUD, lkAudio, audInfo };
