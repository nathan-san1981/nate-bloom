  // ======================================================================
  // Speech: a talking, singing synth after Plogue's Chipspeech. Thirteen voices from the machines that first spoke
  // (1939–1986), each made the way its machine made it: formant filters, LPC chips, synced oscillators, a filter bank.
  // Type the words; every note sings the next syllable.
  // ======================================================================
  {
    const $ = id => document.getElementById(id);
    const I = {   // little pictures of the machines
      chip: '<rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M6 7H3M6 10H3M6 13H3M6 16H3M18 7h3M18 10h3M18 13h3M18 16h3"/><circle cx="9" cy="7" r="0.9" fill="currentColor"/>',
      computer: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M2 19h20M7 15l-1 4M17 15l1 4"/><path d="M6 8h5M6 11h8"/>',
      mainframe: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/><circle cx="6.5" cy="8" r="1.6"/><circle cx="17.5" cy="8" r="1.6"/><path d="M5 14h3M5 17h3M16 14h3M16 17h3"/>',
      toy: '<rect x="3" y="3" width="18" height="18" rx="4"/><rect x="6" y="6" width="12" height="4" rx="1"/><path d="M6.5 13.5h2M10.5 13.5h2M14.5 13.5h2M6.5 17h2M10.5 17h2M14.5 17h2"/>',
      box: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M6 10.5h7M6 13.5h4"/><circle cx="17" cy="12" r="1.8"/>',
      mac: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><rect x="7.5" y="5" width="9" height="7" rx="1"/><path d="M8 16h3M14 17.5h2"/>',
      wave: '<path d="M2 12h2c1.5 0 1.5-6 3-6s1.5 6 3 6 1.5-4 3-4 1.5 4 3 4 1.5-2 3-2 1.5 2 3 2h0"/><path d="M2 18h20" opacity="0.4"/>',
      mouth: '<path d="M3 12c3-4 15-4 18 0-3 5-15 5-18 0z"/><path d="M3 12h18M8 10.2v3.6M12 9.6v4.8M16 10.2v3.6"/>',
      keys: '<rect x="2.5" y="8" width="19" height="10" rx="1.5"/><path d="M6.3 8v10M10.1 8v10M13.9 8v10M17.7 8v10"/><path d="M8 4l2 4M16 4l-2 4"/>',
    };
    const svg = k => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + I[k] + "</svg>";
    // the voices, oldest first; m is how the processor makes them (its method, its sample rate, its bits)
    const SP_CHARS = [
      { id: "voder", name: "Voder", year: 1939, tech: "filter bank, played by hand", what: "Bell Labs' talking organ: an operator shaped every sound on ten filters, at the 1939 World's Fair", cs: "VODER", icon: "keys", pitch: 110, col: "#b98a4a", m: { r: "bank", sr: 22050, lvl: 0.68 } },
      { id: "ibm704", name: "IBM 704", year: 1961, tech: "vocal-tract model", what: "Kelly and Lochbaum's tube model of the throat: the first computer to sing (Daisy Bell)", cs: "Dandy 704", icon: "mainframe", pitch: 120, col: "#7a8aa6", m: { r: "tube", src: "rosen", sr: 10000, lvl: 0.25 } },
      { id: "mozer", name: "S14001A", year: 1976, tech: "Mozer compression", what: "Forrest Mozer's squeezed speech chip: the Speech+ calculator, Berzerk", cs: "Otto Mozer", icon: "chip", pitch: 110, col: "#8a6fb0", m: { r: "formant", src: "rosen", sr: 8000, post: "mozer", lvl: 0.48 } },
      { id: "spell", name: "Speak & Spell", year: 1978, tech: "TMS5100 LPC · bendable", what: "TI's talking toy. Turn Grit past halfway to circuit-bend it", cs: "Speak & Spell (circuit bend)", icon: "toy", pitch: 125, fs: 1.05, col: "#d9443a", m: { r: "lpc", chip: "tms5100", src: "chirp", sr: 8000, bend: true, lvl: 0.44 } },
      { id: "vosim", name: "VOSIM", year: 1978, tech: "pulse-train synthesis", what: "Kaegi and Tempelaars' voice simulation: bursts of sine-squared pulses", cs: "VOSIM", icon: "wave", pitch: 130, col: "#3fa39e", m: { r: "vosim", sr: 20000, bits: 12, lvl: 0.46 } },
      { id: "term99", name: "TI-99/4A", year: 1979, tech: "LPC-10 speech module", what: "The Speech Synthesizer module's own male voice", cs: "Terminal 99", icon: "computer", pitch: 105, col: "#5f7fc0", m: { r: "lpc", chip: "tms5220", src: "chirp", sr: 8000, lvl: 0.42 } },
      { id: "votrax", name: "Votrax SC-01", year: 1980, tech: "analog formant chip", what: "The arcade robot: Q*bert, Gorf, Wizard of Wor", cs: "Bert Gotrax", icon: "chip", pitch: 110, col: "#c9822e", m: { r: "formant", src: "votrax", sr: 20000, q: true, bw: 0.55, f3only: true, lp: 0.4, steps: 4, lvl: 0.29 } },
      { id: "al2", name: "SP0256-AL2", year: 1981, tech: "LPC-12 allophones", what: "General Instrument's speech chip: Currah µSpeech, the Radio Shack synthesizer", cs: "Spencer AL2", icon: "chip", pitch: 95, col: "#4f9a5c", m: { r: "lpc", chip: "sp0256", src: "impulse", sr: 10000, bits: 7, lvl: 0.56 } },
      { id: "sam", name: "SAM", year: 1982, tech: "4-bit formant software", what: "Software Automatic Mouth: the Commodore 64, Atari 800 and Apple II", cs: "SAM", icon: "mouth", pitch: 105, col: "#c95f9a", m: { r: "sam", sr: 22050, bits: 4, lvl: 0.48 } },
      { id: "parsec", name: "TI-99/4A Parsec", year: 1982, tech: "LPC-10, female", what: "The same TI module's female voice, from the game Parsec", cs: "Lady Parsec", icon: "computer", pitch: 205, fs: 1.17, col: "#a65fc0", m: { r: "lpc", chip: "tms5220", src: "chirp", sr: 8000, lvl: 0.43 } },
      { id: "dectalk", name: "DECtalk", year: 1984, tech: "Klatt formant synthesis", what: "Dennis Klatt's formant synthesizer, in a box: the clearest of them", cs: "Dee Klatt", icon: "box", pitch: 115, col: "#4a9fd0", m: { r: "formant", src: "rosen", sr: 10000, jit: 4, lvl: 0.14 } },
      { id: "macintalk", name: "MacInTalk", year: 1984, tech: "formant synthesis, 8-bit", what: "The first Macintosh's voice (on the Amiga it was narrator.device)", cs: "CiderTalk'84", icon: "mac", pitch: 115, col: "#9aa0a6", m: { r: "formant", src: "rosen2", sr: 11025, bits: 8, f3only: true, lvl: 0.28 } },
      { id: "atarist", name: "Atari ST", year: 1986, tech: "windowed oscillator sync", what: "STSPEECH.TOS, the ST's speech program", cs: "Rotten.ST", icon: "computer", pitch: 110, col: "#6f8a3a", m: { r: "fof", sr: 16000, bits: 8, lvl: 0.7 } },
    ];
    const SPCH = id => SP_CHARS.find(c => c.id === id) || SP_CHARS[10];
    const DAISY = "Daisy, Daisy, give me your answer do.\nI'm half crazy, all for the love of you!";
    const SP_EXAMPLES = [["Daisy Bell (1892)", DAISY], ["Twinkle, Twinkle", "Twinkle, twinkle, little star, how I wonder what you are.\nUp above the world so high, like a diamond in the sky."],
      ["Row your boat", "Row, row, row your boat, gently down the stream.\nMerrily, merrily, merrily, merrily, life is but a dream."], ["Robot hello", "Hello. I am a talking computer. Please enter your name."],
      ["Holds a note", "Oh - - - yeah - - -"], ["Phonemes", "[HH AH0 L OW1] [W ER1 L D]"]];
    // ---------- what it's set to ----------
    const SP_KEY = "nightbloom-speech";
    const SPS = { ch: "dectalk", text: DAISY, mode: "sing", loop: true };
    try { const v = JSON.parse(localStorage.getItem(SP_KEY) || "null"); if (v && typeof v === "object") { if (SP_CHARS.some(c => c.id === v.ch)) SPS.ch = v.ch; if (typeof v.text === "string") SPS.text = v.text.slice(0, 4000); if (["sing", "word", "line"].includes(v.mode)) SPS.mode = v.mode; SPS.loop = v.loop !== false; } } catch (e) {}
    let spSaveT = 0; const spSave = () => { clearTimeout(spSaveT); spSaveT = setTimeout(() => { try { localStorage.setItem(SP_KEY, JSON.stringify(SPS)); } catch (e) {} }, 300); };
    const SPC = { P: null, pos: 0, last: null, lastT: -1, lastF: 0, lastOff: -9, demo: null, demoPos: 0, say: null };
    const spParsed = () => { if (!SPC.P) SPC.P = spParse(SPS.text); return SPC.P; };
    function spReparse() { SPC.P = null; spParsed(); if (SPC.pos >= SPC.P.syl.length) SPC.pos = 0; spPaintSyl(); }
    // the dictionary unpacks in the background the first time Speech is near; the lyrics are read again with it
    const spWarm = () => { if (!SPD.map) spDictLoad().then(() => { SPC.P = null; spPaintSyl(); }); };
    // ---------- the engine ----------
    ENGINES.speech = { name: "Speech", short: "Speech", after: "talking chips · after Plogue Chipspeech", knobs: [["speed", "Speed", 0.5], ["formant", "Formant", 0.5], ["glide", "Glide", 0], ["vib", "Vibrato", 0.2], ["grit", "Grit", 0.35]] };
    NEW_ENGINES.speech = ENGINES.speech; TAB_SUB.speech = "Chipspeech";
    {
      let saved = null; try { saved = JSON.parse(localStorage.getItem("nightbloom") || "null"); } catch (e) {}
      state.params.speech = Object.fromEntries(ENGINES.speech.knobs.map(([k, , v]) => [k, v]));
      if (saved && saved.params && saved.params.speech) Object.assign(state.params.speech, saved.params.speech);
      state.layers.speech = { on: false, level: 0.8 };
      if (saved && saved.layers && saved.layers.speech) Object.assign(state.layers.speech, saved.layers.speech);
      const drumWrap = tabsEl.querySelector('.tab[data-engine="drum"]'), wrap = document.createElement("div"); wrap.className = "tabwrap";
      const b = document.createElement("button"); b.className = "tab"; b.dataset.engine = "speech"; b.innerHTML = "Speech<small>Chipspeech</small>";
      b.addEventListener("click", () => { state.engine = "speech"; const anyOther = Object.keys(ENGINES).some(x => x !== "speech" && state.layers[x] && state.layers[x].on); if (!anyOther) for (const x in state.layers) state.layers[x].on = x === "speech"; renderEngine(); save(); });
      wrap.append(b); if (drumWrap) drumWrap.parentElement.before(wrap); else tabsEl.append(wrap);
      if (saved && saved.engine === "speech") { state.engine = "speech"; state.melodic = "speech"; }
    }
    // one processor for each place the voices go (the Speech sound's own effects, a Garage track…)
    const SPR = new Map();
    let SPMOD = null;
    function spNode() {
      if (!ctx || !ctx.audioWorklet || typeof AudioWorkletNode === "undefined") return null;
      if (!SPMOD || SPMOD.ctx !== ctx) {
        const M = SPMOD = { ctx, ready: false, failed: false, pr: null };
        M.pr = (async () => {
          for (const url of [() => URL.createObjectURL(new Blob([SP_WK], { type: "text/javascript" })), () => "data:text/javascript;charset=utf-8," + encodeURIComponent(SP_WK)]) {
            try { await ctx.audioWorklet.addModule(url()); M.ready = true; return; } catch (e) {}
          }
          M.failed = true; noteMsg("Speech can't start here: this page may not load its audio processor.", true);
        })();
        SPR.clear();
      }
      const dest = fx.input; let R = SPR.get(dest);
      if (!R) {
        R = { node: null, pending: [], dest };
        SPR.set(dest, R);
        SPMOD.pr.then(() => {
          if (!SPMOD.ready || SPMOD.ctx !== ctx) return;
          try { R.node = new AudioWorkletNode(ctx, "nb-speech", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }); } catch (e) { return; }
          R.node.connect(dest);
          try { if (typeof pmNodes !== "undefined" && pmNodes && pmNodes.bus) pmNodes.bus.connect(R.node.parameters.get("detune")); } catch (e) {}
          const now = ctx.currentTime; R.pending.forEach(d => { if (d.time != null) d.time = Math.max(d.time, now); R.node.port.postMessage(d); }); R.pending = [];
        });
      }
      return R;
    }
    const spPost = (R, d) => { if (R.node) R.node.port.postMessage(d); else if (!SPMOD.failed) R.pending.push(d); };
    let spId = 1;
    // the next thing a note sings: a syllable, a word, or a line
    function spTake(P, pos, mode) {
      const S = P.syl; if (!S.length) return { syls: [spParse("la").syl[0]], next: pos };
      let i = pos >= S.length ? 0 : pos;
      if (mode === "sing") return { syls: [S[i]], next: i + 1 };
      const out = [S[i]], w = S[i].w; i++;
      if (mode === "word") { while (i < S.length && S[i].w === w && !S[i].first) out.push(S[i++]); return { syls: out, next: i }; }
      while (i < S.length && !out[out.length - 1].pause && S[i].line === out[0].line) out.push(S[i++]);
      return { syls: out, next: i };
    }
    function spVoice(midi, mix, when) {
      start(); spWarm();
      const R = spNode(); if (!R) return { midi, stop() {} };
      const p = state.params.speech || {}, C = SPCH(SPS.ch), t = Math.max(ctx.currentTime, when ?? 0);
      const speed = Math.pow(2, (0.5 - (p.speed ?? 0.5)) * 1.6), fsc = (C.fs || 1) * Math.pow(2, ((p.formant ?? 0.5) - 0.5) * 0.8);
      let segs;
      if (SPC.say) segs = spPhraseSegs(SPC.say, speed, 1);
      else {
        const P = SPC.demo || spParsed(), mode = SPC.demo ? "sing" : SPS.mode;
        let syls;
        if (mode === "sing" && SPC.last && Math.abs(t - SPC.lastT) < 0.03) syls = SPC.last;   // (a chord sings one syllable)
        else {
          const pos = SPC.demo ? SPC.demoPos : SPC.pos, got = spTake(P, pos, mode);
          syls = got.syls; SPC.last = syls; SPC.lastT = t;
          if (SPC.demo) SPC.demoPos = got.next; else { SPC.pos = got.next >= P.syl.length ? (SPS.loop ? 0 : P.syl.length) : got.next; spPaintSoon(); }
        }
        segs = mode === "sing" ? spSylSegs(syls[0], speed) : spPhraseSegs(syls, speed, 1);
      }
      const f0 = mtof(midi), gl = p.glide > 0.02 && SPC.lastF && (t - SPC.lastOff < 0.3 || SPC.held > 0) ? 0.015 + p.glide * p.glide * 0.6 : 0;
      const vel = Math.max(0.15, Math.min(1.2, typeof NB_VEL !== "undefined" ? NB_VEL : 1)), id = spId++;
      spPost(R, { t: "on", id, time: t, f0, from: gl ? SPC.lastF : f0, glide: gl, vib: p.vib ?? 0.2, fsc, grit: p.grit ?? 0.35, breath: p.breath ?? 0.08, gain: (mix ?? 1) * vel, m: C.m, segs });
      SPC.lastF = f0; SPC.held = (SPC.held || 0) + 1;
      let done = false;
      return { midi, stop(at) { if (done || !ctx) return; done = true; SPC.held = Math.max(0, SPC.held - 1); SPC.lastOff = Math.max(ctx.currentTime, at ?? 0); spPost(R, { t: "off", id, time: SPC.lastOff }); } };
    }
    { const nev = newEngineVoice; newEngineVoice = function (midi, id, mix, when) { return id === "speech" ? spVoice(midi, mix, when) : nev.apply(this, arguments); }; }
    const spKill = () => SPR.forEach(R => spPost(R, { t: "kill" }));
    ["stopAll", "panic"].forEach(id => { const b = $(id); if (b) b.addEventListener("click", () => { spKill(); spSayStop(); }); });
    { const ba = buildAudio; buildAudio = function () { const r = ba.apply(this, arguments); SPR.clear(); SPMOD = null; return r; }; }
    // the lyrics start again with the sequencer, and with the Garage
    function spRestart() { SPC.pos = 0; SPC.last = null; spPaintSyl(); }
    { const ss = startSeq; startSeq = function () { if (!playing && state.layers.speech && (state.layers.speech.on || state.engine === "speech")) spRestart(); return ss.apply(this, arguments); }; }
    // ---------- Say it: the whole text, spoken at the voice's own pitch ----------
    let spSayV = null, spSayT = 0;
    function spSayStop() { if (spSayV) { try { spSayV.stop(); } catch (e) {} spSayV = null; } clearTimeout(spSayT); const b = $("spSay"); if (b) { b.textContent = "▶ Say it"; b.setAttribute("aria-pressed", "false"); } }
    function spSay() {
      if (spSayV) { spSayStop(); return; }
      start(); if (!ctx) return; spWarm();
      const go = () => {
        const P = spParsed(); if (!P.syl.length) return;
        const C = SPCH(SPS.ch), m = 12 * Math.log2(C.pitch / 440) + 69;
        SPC.say = P.syl;
        try { spSayV = makeVoice(m, "speech", 0.8, ctx.currentTime + 0.03); } finally { SPC.say = null; }
        const p = state.params.speech, speed = Math.pow(2, (0.5 - (p.speed ?? 0.5)) * 1.6), dur = spPhraseSegs(P.syl, speed, 1).reduce((a, g) => a + g.d, 0);
        const b = $("spSay"); b.textContent = "■ Stop"; b.setAttribute("aria-pressed", "true");
        spSayT = setTimeout(() => { if (spSayV) try { spSayV.stop(); } catch (e) {} spSayV = null; const bb = $("spSay"); if (bb) { bb.textContent = "▶ Say it"; bb.setAttribute("aria-pressed", "false"); } }, dur * 1000 + 300);
      };
      if (!SPD.map) spDictLoad().then(() => { SPC.P = null; go(); }); else go();
    }
    // ---------- Demo: Daisy Bell, as the IBM 704 sang it in 1961 ----------
    { const dp = demoPlay; demoPlay = function (btn, kind) {
        if (kind !== "sound" || state.engine !== "speech") return dp.apply(this, arguments);
        start(); if (!ctx) return;
        const again = demoBtn === btn; demoStop(); if (again) return;
        demoBtn = btn; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = "■ Stop"; btn.setAttribute("aria-pressed", "true");
        spWarm();
        const C = SPCH(SPS.ch), up = C.pitch > 160 ? 0 : -12, q = 380, at = (ms, fn) => demoT.push(setTimeout(fn, ms));
        const mel = [[67, 3], [64, 3], [60, 3], [55, 3], [57, 1], [59, 1], [60, 1], [57, 2], [60, 1], [55, 5]];
        const go = () => {
          SPC.demo = spParse("Daisy, Daisy, give me your answer do"); SPC.demoPos = 0;
          let ms = 0; mel.forEach(([m, b]) => { const n = m + up, len = b * q - 40; at(ms, () => { noteOn(n); demoNotes.add(n); }); at(ms + len, () => { noteOff(n); demoNotes.delete(n); }); ms += b * q; });
          at(ms + 900, demoStop);
        };
        if (!SPD.map) spDictLoad().then(go); else go();
      }; }
    { const ds = demoStop; demoStop = function () { SPC.demo = null; return ds.apply(this, arguments); }; }
    // ---------- the panel ----------
    const card = $("spCard"), chars = $("spChars"), text = $("spText"), syls = $("spSyls");
    function spPaintChars() {
      chars.replaceChildren();
      SP_CHARS.forEach(c => {
        const b = document.createElement("button"); b.className = "sp-ch"; b.dataset.ch = c.id; b.style.setProperty("--cc", c.col);
        b.setAttribute("aria-pressed", String(c.id === SPS.ch)); b.title = c.what + " · in Chipspeech: " + c.cs;
        b.innerHTML = '<i>' + svg(c.icon) + '</i><span><b></b><small></small></span>';
        b.querySelector("b").textContent = c.name; b.querySelector("small").textContent = c.year + " · " + c.tech;
        b.addEventListener("click", () => {
          SPS.ch = c.id; spSave(); chars.querySelectorAll(".sp-ch").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.ch === c.id))); spPaintInfo();
          if (state.engine !== "speech") { state.engine = "speech"; renderEngine(); save(); }
        });
        chars.append(b);
      });
      spPaintInfo();
    }
    function spPaintInfo() {
      const c = SPCH(SPS.ch), el = $("spInfo"); if (el) el.textContent = c.what + ". In Chipspeech: " + c.cs + ".";
      const on = chars.querySelector(".sp-ch[aria-pressed=true]");   // (the chosen voice in view)
      if (on && !card.hidden) { const l = on.offsetLeft - chars.offsetLeft, r = l + on.offsetWidth; if (l < chars.scrollLeft || r > chars.scrollLeft + chars.clientWidth) chars.scrollLeft = Math.max(0, l - 8); }
    }
    let spPT = 0;
    const spPaintSoon = () => { if (!spPT) spPT = requestAnimationFrame(() => { spPT = 0; spPaintCur(); }); };
    function spPaintSyl() {
      if (!syls || card.hidden) return;
      const P = spParsed(); syls.replaceChildren();
      if (!P.syl.length) { const e = document.createElement("span"); e.className = "sp-empty"; e.textContent = "Type words above: each note sings the next syllable"; syls.append(e); return; }
      let line = 0;
      P.syl.forEach((s, i) => {
        if (s.line !== line) { line = s.line; const br = document.createElement("span"); br.className = "sp-br"; br.textContent = "↵"; syls.append(br); }
        const b = document.createElement("button"); b.className = "sp-sy" + (s.first && i ? " w" : "") + (s.hold ? " hold" : ""); b.textContent = s.t || "·"; b.dataset.i = i;
        b.title = [...s.on, s.nuc, ...s.coda].filter(Boolean).join(" ");
        b.addEventListener("click", () => { SPC.pos = i; SPC.last = null; spPaintCur(); });
        syls.append(b);
      });
      spPaintCur();
    }
    function spPaintCur() {
      if (!syls) return;
      const P = spParsed(), take = spTake(P, SPC.pos, SPS.mode), from = SPC.pos >= P.syl.length ? 0 : SPC.pos, to = from + take.syls.length;
      syls.querySelectorAll(".sp-sy").forEach(b => { const i = +b.dataset.i; b.classList.toggle("on", i >= from && i < to); });
      const on = syls.querySelector(".sp-sy.on");
      if (on && !card.hidden) { const r = on.offsetParent === syls ? on.offsetTop : on.offsetTop - syls.offsetTop; if (r < syls.scrollTop || r > syls.scrollTop + syls.clientHeight - on.offsetHeight) syls.scrollTop = Math.max(0, r - 4); }
      const pc = $("spPos"); if (pc) pc.textContent = P.syl.length ? (from + 1) + " / " + P.syl.length : "";
    }
    function spPaintMode() { document.querySelectorAll("#spMode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === SPS.mode))); $("spLoop").setAttribute("aria-pressed", String(SPS.loop)); }
    let spTT = 0;
    text.value = SPS.text;
    // the box grows with the words (up to six lines, then it scrolls)
    function spFitText() { if (card.hidden) return; text.style.height = "auto"; text.style.height = Math.min(text.scrollHeight + 2, 156) + "px"; }
    text.addEventListener("input", spFitText);
    text.addEventListener("input", () => { SPS.text = text.value.slice(0, 4000); spSave(); clearTimeout(spTT); spTT = setTimeout(() => { SPC.pos = 0; SPC.last = null; spReparse(); }, 250); });
    text.addEventListener("focus", spWarm);
    // the computer keyboard plays notes, so typing in the box must not
    text.addEventListener("keydown", e => e.stopPropagation()); text.addEventListener("keyup", e => e.stopPropagation());
    document.querySelectorAll("#spMode button").forEach(b => b.addEventListener("click", () => { SPS.mode = b.dataset.m; SPC.last = null; spSave(); spPaintMode(); spPaintCur(); }));
    $("spLoop").addEventListener("click", () => { SPS.loop = !SPS.loop; spSave(); spPaintMode(); });
    $("spRestart").addEventListener("click", spRestart);
    $("spSay").addEventListener("click", spSay);
    const ex = $("spEx");
    SP_EXAMPLES.forEach(([n]) => { const o = document.createElement("option"); o.value = n; o.textContent = n; ex.append(o); });
    ex.addEventListener("change", () => {
      const e = SP_EXAMPLES.find(x => x[0] === ex.value); ex.value = ""; if (!e) return;
      const keep = SPS.text; SPS.text = text.value = e[1]; spSave(); SPC.pos = 0; spReparse(); spFitText();
      if (typeof undoToast === "function") undoToast("Lyrics: " + e[0], () => { SPS.text = text.value = keep; spSave(); SPC.pos = 0; spReparse(); });
    });
    spPaintMode();
    // a mouse wheel scrolls the voices sideways
    chars.addEventListener("wheel", e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && chars.scrollWidth > chars.clientWidth) { chars.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const spSetVoice = id => { if (!SP_CHARS.some(c => c.id === id)) return; SPS.ch = id; spSave(); chars.querySelectorAll(".sp-ch").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.ch === id))); spPaintInfo(); };
    const spSetText = t => { SPS.text = text.value = String(t || "").slice(0, 4000); spSave(); SPC.pos = 0; SPC.last = null; spReparse(); spFitText(); };
    // the panel shows with the Speech sound
    { const re = renderEngine; renderEngine = function () {
        const r = re.apply(this, arguments);
        const on = state.engine === "speech", was = !card.hidden;
        card.hidden = !on;
        if (on && !was) { if (!chars.children.length) spPaintChars(); else spPaintInfo(); spWarm(); spPaintSyl(); spFitText(); }
        return r;
      }; }
    window.__sp = { SPS, SPC, SP_CHARS, setVoice: spSetVoice, setText: spSetText, parse: spParse, word: spWord, syls: spSylSegs, phrase: spPhraseSegs, restart: spRestart, say: spSay, dict: () => SPD, voice: spVoice, nodes: SPR };
    if (state.engine === "speech") setTimeout(() => { try { renderEngine(); } catch (e) {} }, 0);
  }
  }

