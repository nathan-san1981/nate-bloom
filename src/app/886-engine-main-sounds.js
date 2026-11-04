  // ======================================================================
  // 223: each engine's main sounds, the ones the instrument it's after is known for, as presets under it in the
  // right-hand panel (By engine), the Sounds list and Find. The engines that had one to six presets get the most.
  // ======================================================================
  {
    const P = (name, eng, k, sub, oct = 0, fx = {}) => [name, eng, { [eng]: k }, { sub, oct, fx: Object.assign({ drive: 0, wobble: 0, echo: 0.15, space: 0.3 }, fx) }];
    const L = [];
    if (ENGINES.alpha) L.push(
      P("Dominator Dive", "alpha", { wave: 0.45, pw: 0.6, pwm: 1, sub: 0.45, dive: 0.95, chorus: 1, cutoff: 0.95, res: 0.08, attack: 0, release: 0.55 }, "the full hoover dive · Human Resource", 0, { drive: 0.15, echo: 0.1, space: 0.3 }),
      P("Rave Stab", "alpha", { wave: 0.45, pw: 0.5, pwm: 0.6, sub: 0.25, dive: 0.2, chorus: 0.9, cutoff: 0.8, res: 0.2, attack: 0, release: 0.15 }, "short hoover chord stab · '91 rave", 0, { drive: 0.1, echo: 0.3, space: 0.35 }),
      P("PWM Lead", "alpha", { wave: 0.9, pw: 0.45, pwm: 0.7, sub: 0.1, dive: 0.05, chorus: 0.5, cutoff: 0.75, res: 0.2, attack: 0.02, release: 0.35 }, "the pulse lead with movement"),
      P("Org Bass", "alpha", { wave: 0.85, pw: 0.2, pwm: 0, sub: 0.7, dive: 0, chorus: 0, cutoff: 0.3, res: 0.1, attack: 0, release: 0.15 }, "organ-style pulse bass · house", -1, { echo: 0, space: 0.05 }),
      P("Sub Bass", "alpha", { wave: 0.05, pw: 0.5, pwm: 0, sub: 1, dive: 0, chorus: 0, cutoff: 0.18, res: 0.05, attack: 0, release: 0.25 }, "deep sine-ish sub", -1, { echo: 0, space: 0 }),
      P("Pizz Pluck", "alpha", { wave: 0.1, pw: 0.5, pwm: 0, sub: 0.1, dive: 0, chorus: 0.6, cutoff: 0.35, res: 0.35, attack: 0, release: 0.12 }, "plucky saw with the filter snapped shut"),
      P("Juno-ish Pad", "alpha", { wave: 0.9, pw: 0.55, pwm: 0.85, sub: 0.2, dive: 0, chorus: 1, cutoff: 0.45, res: 0.05, attack: 0.55, release: 0.8 }, "slow PWM pad through its chorus", 0, { space: 0.5 }),
      P("Detuned Saw Lead", "alpha", { wave: 0.25, pw: 0.5, pwm: 0.3, sub: 0.3, dive: 0.1, chorus: 0.8, cutoff: 0.85, res: 0.15, attack: 0.01, release: 0.35 }, "SAW02 lead, wide with the chorus", 0, { echo: 0.3 }),
      P("Bell Arp", "alpha", { wave: 0.65, pw: 0.3, pwm: 0.2, sub: 0, dive: 0, chorus: 0.7, cutoff: 0.7, res: 0.45, attack: 0, release: 0.3 }, "bright resonant arp sound", 1, { echo: 0.45, space: 0.4 }),
      P("Acid Alpha", "alpha", { wave: 0.05, pw: 0.5, pwm: 0, sub: 0.2, dive: 0.15, chorus: 0, cutoff: 0.25, res: 0.8, attack: 0, release: 0.15 }, "squelchy saw bass", -1, { drive: 0.3, echo: 0.2 }));
    L.push(
      P("Mentasm", "hoover", { detune: 0.75, dive: 0.4, width: 0.8, attack: 0.02, release: 0.45 }, "Second Phase · the original hoover", 0, { drive: 0.15, echo: 0.2, space: 0.35 }),
      P("Hoover Stab", "hoover", { detune: 0.55, dive: 0.3, width: 0.6, attack: 0, release: 0.15 }, "short and punchy", 0, { drive: 0.1, echo: 0.3 }),
      P("Gabber Hoover", "hoover", { detune: 0.9, dive: 0.85, width: 0.7, attack: 0, release: 0.35 }, "harder, distorted", 0, { drive: 0.6, echo: 0.1, space: 0.2 }),
      P("Slow Hoover Pad", "hoover", { detune: 0.45, dive: 0.15, width: 0.9, attack: 0.5, release: 0.85 }, "the hoover as a pad", 0, { space: 0.6 }),
      P("Hoover Bass", "hoover", { detune: 0.4, dive: 0.5, width: 0.3, attack: 0, release: 0.25 }, "an octave down, narrow", -1, { drive: 0.2, space: 0.1 }));
    L.push(
      P("Sylenth Pluck", "pluck", { bright: 0.75, body: 0.35, pick: 0.7, decay: 0.3, release: 0.18 }, "the bright EDM pluck", 0, { echo: 0.55, space: 0.45 }),
      P("Marimba Pluck", "pluck", { bright: 0.35, body: 0.7, pick: 0.4, decay: 0.25, release: 0.15 }, "woody and short", 0, { echo: 0.2, space: 0.3 }),
      P("Harp Gliss", "pluck", { bright: 0.55, body: 0.6, pick: 0.35, decay: 0.75, release: 0.6 }, "long, ringing pluck", 0, { echo: 0.25, space: 0.55 }),
      P("Tropical Pluck", "pluck", { bright: 0.6, body: 0.5, pick: 0.55, decay: 0.2, release: 0.12 }, "tropical house", 0, { echo: 0.45, space: 0.35 }),
      P("Pluck Bass", "pluck", { bright: 0.4, body: 0.75, pick: 0.6, decay: 0.35, release: 0.2 }, "plucked bass", -1, { echo: 0, space: 0.08 }),
      P("Music Box Pluck", "pluck", { bright: 0.9, body: 0.2, pick: 0.8, decay: 0.55, release: 0.4 }, "high, glassy", 1, { echo: 0.3, space: 0.5 }),
      P("Chord Pluck", "pluck", { bright: 0.5, body: 0.45, pick: 0.5, decay: 0.45, release: 0.3 }, "for chord stabs", 0, { echo: 0.35, space: 0.4 }));
    L.push(
      P("Cars Lead", "sync", { sync: 0.7, sweep: 0.55, bite: 0.5, attack: 0.02, release: 0.35 }, "Gary Numan · Prophet sync", 0, { echo: 0.25, space: 0.3 }),
      P("Jump Sync", "sync", { sync: 0.3, sweep: 0.2, bite: 0.7, attack: 0, release: 0.3 }, "bright brassy sync chord"),
      P("Sync Bass", "sync", { sync: 0.45, sweep: 0.65, bite: 0.8, attack: 0, release: 0.2 }, "growling synced bass", -1, { drive: 0.2, space: 0.08 }),
      P("Sync Sweep Pad", "sync", { sync: 0.6, sweep: 0.9, bite: 0.25, attack: 0.5, release: 0.75 }, "slow sweeping sync pad", 0, { space: 0.55 }),
      P("Laser Sync", "sync", { sync: 0.95, sweep: 1, bite: 0.9, attack: 0, release: 0.2 }, "zappy, high sync", 1, { echo: 0.4 }),
      P("Soft Sync Lead", "sync", { sync: 0.25, sweep: 0.35, bite: 0.35, attack: 0.05, release: 0.4 }, "gentle, singing lead", 0, { echo: 0.3, space: 0.4 }));
    L.push(
      P("Serum Growl", "vital", { morph: 0.55, motion: 0.85, tone: 0.45, attack: 0.02, release: 0.3 }, "moving wavetable growl", -1, { drive: 0.3, space: 0.15 }),
      P("Wavetable Keys", "vital", { morph: 0.25, motion: 0.15, tone: 0.65, attack: 0.02, release: 0.45 }, "bright digital keys"),
      P("PPG Wave", "vital", { morph: 0.4, motion: 0.4, tone: 0.55, attack: 0.15, release: 0.55 }, "the PPG's stepped sweep", 0, { space: 0.45 }),
      P("Evolving Wavetable", "vital", { morph: 0.6, motion: 0.7, tone: 0.5, attack: 0.65, release: 0.85 }, "slow evolving pad", 0, { space: 0.6 }),
      P("Digital Bass", "vital", { morph: 0.85, motion: 0.2, tone: 0.4, attack: 0, release: 0.2 }, "hard digital bass", -1, { drive: 0.15, space: 0.05 }));
    L.push(
      P("Tubular Bells", "bells", { material: 0.75, ring: 0.85, hardness: 0.6, shimmer: 0.3, release: 0.8 }, "long metal tubes", 0, { space: 0.5 }),
      P("Vibraphone", "bells", { material: 0.6, ring: 0.6, hardness: 0.3, shimmer: 0.55, release: 0.55 }, "soft mallets, gentle shimmer", 0, { space: 0.4 }),
      P("Celesta", "bells", { material: 0.9, ring: 0.4, hardness: 0.4, shimmer: 0.2, release: 0.4 }, "tiny bright bells", 1, { space: 0.4 }),
      P("Gamelan", "bells", { material: 0.4, ring: 0.7, hardness: 0.75, shimmer: 0.65, release: 0.65 }, "clangy gongs and keys", 0, { space: 0.45 }),
      P("Wind Chimes", "bells", { material: 1, ring: 0.9, hardness: 0.2, shimmer: 1, release: 0.9 }, "airy, endless", 1, { echo: 0.3, space: 0.7 }));
    L.push(
      P("CS-80 Strings", "tyrell", { swell: 0.6, bite: 0.1, vibrato: 0.3, attack: 0.5, release: 0.7 }, "soft swelling strings", 0, { space: 0.55 }),
      P("Brass Fanfare", "tyrell", { swell: 0.3, bite: 0.75, vibrato: 0.2, attack: 0.1, release: 0.45 }, "bright, cutting brass", 0, { space: 0.4 }),
      P("Love Theme", "tyrell", { swell: 0.7, bite: 0.25, vibrato: 0.55, attack: 0.35, release: 0.8 }, "Vangelis · singing, with vibrato", 0, { echo: 0.3, space: 0.6 }),
      P("Synth Horn", "tyrell", { swell: 0.5, bite: 0.45, vibrato: 0.15, attack: 0.2, release: 0.4 }, "mellow horn section"),
      P("Brass Bass", "tyrell", { swell: 0.2, bite: 0.6, vibrato: 0, attack: 0.05, release: 0.3 }, "brassy synth bass", -1, { space: 0.1 }));
    if (ENGINES.fm) L.push(
      P("E. Piano (DX)", "fm", { bright: 0.35, feedback: 0.15, spread: 0.2, attack: 0, release: 0.55 }, "the DX7 electric piano"),
      P("FM Bass", "fm", { bright: 0.55, feedback: 0.45, spread: 0.05, attack: 0, release: 0.25 }, "the DX slap and synth bass", -1, { space: 0.05 }),
      P("FM Bells", "fm", { bright: 0.8, feedback: 0.1, spread: 0.35, attack: 0, release: 0.8 }, "glassy DX bells", 0, { space: 0.5 }),
      P("FM Brass", "fm", { bright: 0.65, feedback: 0.55, spread: 0.15, attack: 0.1, release: 0.35 }, "'80s FM brass"),
      P("Tubular FM", "fm", { bright: 0.7, feedback: 0.25, spread: 0.45, attack: 0, release: 0.9 }, "DX tubular bells", 0, { space: 0.5 }),
      P("FM Marimba", "fm", { bright: 0.45, feedback: 0.05, spread: 0.1, attack: 0, release: 0.2 }, "short, woody"),
      P("Glass Pad", "fm", { bright: 0.6, feedback: 0.2, spread: 0.6, attack: 0.6, release: 0.85 }, "airy FM pad", 0, { space: 0.6 }),
      P("FM Clav", "fm", { bright: 0.75, feedback: 0.6, spread: 0, attack: 0, release: 0.15 }, "funky, biting"));
    L.push(
      P("Chirpy Robot", "speech", { speed: 0.6, formant: 0.65, glide: 0.1, vib: 0.1, grit: 0.5 }, "fast, high, crunchy chip voice"),
      P("Slow Singer", "speech", { speed: 0.3, formant: 0.45, glide: 0.4, vib: 0.45, grit: 0.2 }, "slow, gliding, with vibrato", 0, { space: 0.4 }),
      P("Deep Computer", "speech", { speed: 0.4, formant: 0.25, glide: 0, vib: 0, grit: 0.4 }, "low, flat machine voice", -1),
      P("Choir of Chips", "speech", { speed: 0.35, formant: 0.5, glide: 0.2, vib: 0.35, grit: 0.15 }, "smooth, for chords", 0, { echo: 0.3, space: 0.55 }));
    L.push(
      P("Juno Brass", "juno", { pwm: 0.2, chorus: 0.45, cutoff: 0.6, attack: 0.08, release: 0.4 }, "Juno-60 brass section"),
      P("Juno Bass", "juno", { pwm: 0.1, chorus: 0, cutoff: 0.3, attack: 0, release: 0.2 }, "punchy Juno sub-osc bass", -1, { space: 0.05 }),
      P("Saw Anthem", "saw", { detune: 0.75, cutoff: 0.85, res: 0.1, attack: 0.02, release: 0.5 }, "the wide supersaw lead", 0, { echo: 0.3, space: 0.45 }),
      P("Reese Pad", "saw", { detune: 0.85, cutoff: 0.4, res: 0.15, attack: 0.5, release: 0.8 }, "dark detuned pad", 0, { space: 0.55 }),
      P("Matrix Strings", "analog", { cutoff: 0.5, env: 0.2, res: 0.1, attack: 0.45, release: 0.7 }, "Oberheim string pad", 0, { space: 0.5 }),
      P("Juno Lead", "analog", { cutoff: 0.65, env: 0.4, res: 0.3, attack: 0.02, release: 0.35 }, "classic poly lead"),
      P("Moog Lead", "mono", { cutoff: 0.6, env: 0.45, res: 0.35, glide: 0.2, release: 0.35 }, "Minimoog solo lead", 0, { echo: 0.25, space: 0.3 }),
      P("Taurus Bass", "mono", { cutoff: 0.18, env: 0.2, res: 0.15, glide: 0, release: 0.4 }, "deep pedal bass", -2, { space: 0.05 }),
      P("Vox Humana", "choir", { vowel: 0.35, breath: 0.15, vib: 0.4, attack: 0.5, release: 0.6 }, "organ-like voices"),
      P("Ah Pad", "choir", { vowel: 0.1, breath: 0.35, vib: 0.2, attack: 0.75, release: 0.85 }, "slow choir pad", 0, { space: 0.6 }),
      P("Space Drone", "zeb", { bright: 0.5, oddeven: 0.3, evolve: 0.55, attack: 0.7, release: 0.9 }, "slow cosmic drone", 0, { space: 0.7 }));
    // only engines that are here (FM is the beta one), and no doubles by name
    const have = new Set(CLASSIC_PRESETS.map(p => p[0]).concat(NB_PRESETS.map(p => p[0])));
    for (const p of L) { if (!ENGINES[p[1]] || have.has(p[0])) continue; have.add(p[0]); CLASSIC_PRESETS.push(p); NB_PRESETS.push(p); }
  }
