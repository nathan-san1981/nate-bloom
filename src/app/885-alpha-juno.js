  // ======================================================================
  // 201: the Alpha Juno (the Linux app's native engine). Roland's Alpha Juno DCO, ported from jc303 (GPL-3, the
  // dfl_AlphaJunoOscillator by dfl): SAW01-05 (the sawtooth chopped by gates at +1 and +3 octaves) and the pulse,
  // with audio-rate pulse width and PWM, a sub an octave down, a pitch dive into each note, the 24 dB ladder and the
  // Juno chorus. The rave hoover is its SAW03 with PWM, sub, dive and chorus. Without the native engine it plays the
  // classic Hoover; the old engine stays as "Hoover (classic)".
  // ======================================================================
  if (window.NB_NATIVE && window.NB_NATIVE.platform === "linux" && !window.NB_LITE && window.NBEngine) {
    ENGINES.alpha = { name: "Alpha Juno", short: "Alpha", after: "after Roland Alpha Juno · its DCO from jc303",
      knobs: [["wave", "Wave", 0.45], ["pw", "PW", 0.5], ["pwm", "PWM", 0.9], ["sub", "Sub", 0.3], ["dive", "Dive", 0.5], ["chorus", "Chorus", 0.9], ["cutoff", "Cutoff", 0.75], ["res", "Reso", 0.15], ["attack", "Attack", 0.02], ["release", "Release", 0.45]] };
    NEW_ENGINES.alpha = ENGINES.alpha; TAB_SUB.alpha = "Alpha Juno";
    if (ENGINES.hoover) { ENGINES.hoover.name = "Hoover (classic)"; TAB_SUB.hoover = "classic"; }
    {
      let saved = null; try { saved = JSON.parse(localStorage.getItem("nightbloom") || "null"); } catch (e) {}
      state.params.alpha = Object.fromEntries(ENGINES.alpha.knobs.map(([k, , v]) => [k, v]));
      if (saved && saved.params && saved.params.alpha) Object.assign(state.params.alpha, saved.params.alpha);
      state.layers.alpha = { on: false, level: 0.8 };
      if (saved && saved.layers && saved.layers.alpha) Object.assign(state.layers.alpha, saved.layers.alpha);
      if (saved && saved.engine === "alpha") { state.engine = "alpha"; state.melodic = "alpha"; }
    }
    // the native engine plays it; without it (switched off, or not loaded), the classic Hoover does
    { const nev = newEngineVoice; newEngineVoice = function (midi, id, mix, when) {
        if (id !== "alpha") return nev.apply(this, arguments);
        const nv = window.__nbNativeVoice ? window.__nbNativeVoice(midi, "alpha", mix, when, fx.input) : null;
        return nv || nev(midi, "hoover", mix, when);
      }; }
    // presets in Classic Synths: the hoover family and the Alpha Juno's own sounds
    CLASSIC_PRESETS.push(
      ["Hoover · Alpha Juno", "alpha", { alpha: { wave: 0.45, pw: 0.55, pwm: 0.9, sub: 0.3, dive: 0.55, chorus: 0.95, cutoff: 0.9, res: 0.1, attack: 0.01, release: 0.5 } }, { sub: "the WhatThe hoover · Dominator, rave", oct: 0, fx: { drive: 0.1, wobble: 0, echo: 0.15, space: 0.35 } }],
      ["Hoover Soft", "alpha", { alpha: { wave: 0.45, pw: 0.45, pwm: 0.45, sub: 0.35, dive: 0.25, chorus: 0.7, cutoff: 0.55, res: 0.1, attack: 0.06, release: 0.6 } }, { sub: "gentler hoover, less dive", oct: 0, fx: { drive: 0.05, wobble: 0.05, echo: 0.25, space: 0.45 } }],
      ["Alpha Strings", "alpha", { alpha: { wave: 0.25, pw: 0.5, pwm: 0.35, sub: 0.15, dive: 0, chorus: 0.95, cutoff: 0.5, res: 0.05, attack: 0.45, release: 0.7 } }, { sub: "slow PWM strings with the Juno chorus", oct: 0, fx: { drive: 0, wobble: 0.1, echo: 0.2, space: 0.6 } }],
      ["Alpha Bass", "alpha", { alpha: { wave: 0.1, pw: 0.5, pwm: 0, sub: 0.8, dive: 0.05, chorus: 0, cutoff: 0.35, res: 0.25, attack: 0, release: 0.2 } }, { sub: "saw and sub, punchy", oct: -1, fx: { drive: 0.15, wobble: 0, echo: 0, space: 0.08 } }],
      ["Alpha Brass", "alpha", { alpha: { wave: 0.05, pw: 0.5, pwm: 0.1, sub: 0.3, dive: 0.1, chorus: 0.4, cutoff: 0.6, res: 0.15, attack: 0.12, release: 0.4 } }, { sub: "'80s synth brass", oct: 0, fx: { drive: 0.1, wobble: 0, echo: 0.2, space: 0.4 } }]);
  }
