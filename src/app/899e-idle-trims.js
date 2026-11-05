  // ======================================================================
  // 232: less work while nothing happens. The channel list the KeyLab/MiniLab strip and the Mixer ask for (dozens of
  // times a paint, once per fader and label) is made once per 60 ms; the status-strip state is read twice a second
  // instead of four times; the strip and the chip meters rest while the window is hidden or minimised.
  // (Measured idle on the Linux app before: about 1.3% of a core in scripts, most of it these.)
  // ======================================================================
  {
    const mc = mixChannels; let at = 0, last = null;
    mixChannels = function () { const now = performance.now(); if (last && now - at < 60) return last; last = mc.apply(this, arguments); at = now; return last; };
    window.__mixFresh = () => { last = null; };
  }
