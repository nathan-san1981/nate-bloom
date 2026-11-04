  // ======================================================================
  // Garage: a GarageBand-style studio in its own tab. Pick an instrument (keyboard, drums, smart bass, guitar and
  // strings with chord strips, Nate Bloom's synths, his plugins, the sampler, an audio recorder), play it on a
  // touch instrument, record it into a song of tracks, arrange the regions, edit the notes, mix, export.
  // Every sound comes from the rest of Nate Bloom: the Studio and library instruments, the engines and presets,
  // the plugins, the Rhythm Creator's kits and the sampler slots.
  // ======================================================================
  {
    const $ = id => document.getElementById(id);
    const gbEl = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const NN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    const nname = m => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
    let gbToastT = 0;
    function gbSay(msg) { const t = $("uiToast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(gbToastT); gbToastT = setTimeout(() => { t.hidden = true; }, 3000); }
    const btnE = (txt, fn, cls, aria) => { const b = gbEl("button", "btn" + (cls ? " " + cls : ""), txt); if (aria) b.setAttribute("aria-label", aria); if (fn) b.addEventListener("click", fn); return b; };

    // ---------- the kinds of instrument ----------
    const SV = (d, extra) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + ">" + d + "</svg>";
    const ICON = {
      keys: SV('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M7.2 6v12M11.9 6v12M16.6 6v12"/><path d="M5.6 6v6.5M10.3 6v6.5M15 6v6.5M19.7 6v6.5" stroke-width="2.6"/>'),
      drums: SV('<ellipse cx="12" cy="10" rx="8" ry="3"/><path d="M4 10v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M8 3.5l3 5M16 3.5l-3 5"/>'),
      bass: SV('<path d="M20.5 3.5l-8.2 8.2"/><path d="M12.6 11.4c-1.6-.8-3.6-.4-4.8 1-.8.9-.9 2-.6 3-1.3-.1-2.6.4-3.3 1.4-1.2 1.6-.7 3.8 1 4.6 1.6.8 3.6.2 4.6-1.3.5-.7.7-1.6.5-2.4 1.1.2 2.2-.2 3-1 1.2-1.2 1.4-3.1.6-4.5"/><path d="M18 3l3 3"/>'),
      guitar: SV('<path d="M20 4l-6.5 6.5"/><path d="M13.5 10.5c-1.8-1.2-4.4-.9-5.9.7-.9.9-1.2 2.1-1 3.2-1.4 0-2.8.6-3.5 1.7-1.1 1.7-.4 4 1.5 4.8 1.6.7 3.6.1 4.5-1.4.5-.8.6-1.7.4-2.5 1.2.2 2.5-.2 3.4-1.1 1.6-1.6 1.6-4.2.6-5.4z"/><circle cx="8.8" cy="15.2" r="1.3"/><path d="M18.5 2.5l3 3"/>'),
      strings: SV('<path d="M12 2.5v4"/><path d="M9.5 6.5h5l-.6 2.6c1.7.6 2.8 2 2.8 3.6 0 1.1-.5 2-1.2 2.7.9.6 1.4 1.6 1.4 2.7 0 2.2-2.2 3.4-4.9 3.4s-4.9-1.2-4.9-3.4c0-1.1.5-2.1 1.4-2.7-.7-.7-1.2-1.6-1.2-2.7 0-1.6 1.1-3 2.8-3.6z"/><path d="M10.4 12.5v4M13.6 12.5v4"/>'),
      synth: SV('<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><circle cx="8" cy="9.5" r="2.2"/><circle cx="16" cy="9.5" r="2.2"/><path d="M5.5 15.5h13M8 9.5l1.2-1.2M16 9.5l-1-1.4"/>'),
      plugin: SV('<path d="M9 2.5v5M15 2.5v5"/><rect x="5.5" y="7.5" width="13" height="6" rx="1.5"/><path d="M8 13.5v2a4 4 0 0 0 8 0v-2M12 19.5v2"/>'),
      sampler: SV('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M6 12h1.5l1.5-4 2 8 2-10 2 9 1.5-3H18"/>'),
      audio: SV('<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7"/>'),
    };
    const KIND = {
      keys: { name: "Keyboard", sub: "Grand piano, upright, organ, electric pianos, bells", kc: "#3f9e5c", cg: "linear-gradient(150deg, #2f7d4a, #16351f)", rc: "#6fd08a" },
      drums: { name: "Drums", sub: "The Studio kit (real drums), 808, 909, Real 808 and your kits", kc: "#c7922a", cg: "linear-gradient(150deg, #b7832a, #4a3412)", rc: "#f0c14e" },
      bass: { name: "Smart Bass", sub: "Chord strips that play bass lines, or tap single notes", kc: "#3f7fb0", cg: "linear-gradient(150deg, #2f6d9e, #12283a)", rc: "#6fb4e8" },
      guitar: { name: "Smart Guitar", sub: "Strum chords, pick strings, or let Autoplay strum", kc: "#b0623f", cg: "linear-gradient(150deg, #a3552f, #3e1d10)", rc: "#f09a6a" },
      strings: { name: "Smart Strings", sub: "Studio strings: hold a chord to bow it, or Autoplay", kc: "#8a4fb0", cg: "linear-gradient(150deg, #7a3fa3, #2c1340)", rc: "#c79af0" },
      synth: { name: "Synths", sub: "Nate Bloom's engines and presets: Supersaw, Juno, Moog, CS-80…", kc: "#c74f8a", cg: "linear-gradient(150deg, #b33f7a, #3e1229)", rc: "#f08fc0" },
      plugin: { name: "Your Plugins", sub: "Twin 77, Duet 80, Hypnagogia, Nebula 80 and the rest", kc: "#d0782a", cg: "linear-gradient(150deg, #c86f22, #4a260a)", rc: "#ffb65c" },
      sampler: { name: "Sampler", sub: "Record or load a sound, then play it across the keys", kc: "#3fa39e", cg: "linear-gradient(150deg, #2f8f8a, #10302e)", rc: "#7fd6c2" },
      audio: { name: "Audio Recorder", sub: "Record your voice or an instrument with the mic", kc: "#3f5fb0", cg: "linear-gradient(150deg, #3352a0, #121c3a)", rc: "#7f9cf0" },
    };
    const ORDER = ["keys", "drums", "bass", "guitar", "strings", "synth", "plugin", "sampler", "audio"];
    const SMART = { bass: 1, guitar: 1, strings: 1 };

    // ---------- songs: kept with the rest of Nate Bloom (and in its projects) ----------
    const GBK = "nightbloom-garage", GBP = "nightbloom-garage-s-";
    let IDX = { songs: [], cur: "" };
    try { const v = JSON.parse(localStorage.getItem(GBK) || "null"); if (v && Array.isArray(v.songs)) IDX = { songs: v.songs.filter(x => x && x.id), cur: v.cur || "" }; } catch (e) {}
    const saveIdx = () => { try { localStorage.setItem(GBK, JSON.stringify(IDX)); } catch (e) {} };
    function fixSong(s) {
      const d = { v: 1, name: "My Song", bpm: 100, key: 0, minor: false, sig: 4, bars: 8, auto: true, metro: true, cin: true, merge: false, cyc: { on: false, a: 0, b: 16 }, tracks: [], sel: 0, ph: 0, zoom: 3, view: "browse", mvol: 1 };
      for (const k in d) if (s[k] == null) s[k] = d[k];
      s.bpm = clamp(+s.bpm || 100, 40, 240); s.sig = [2, 3, 4, 5, 6, 7].includes(s.sig) ? s.sig : 4;
      s.tracks = (s.tracks || []).filter(t => t && KIND[t.kind]).map(t => Object.assign({ name: KIND[t.kind].name, snd: defaultSound(t.kind), vol: 0.8, pan: 0, mute: false, solo: false, oct: 0, auto: 0, p: null, regions: [] }, t));
      s.tracks.forEach(t => { t.regions = (t.regions || []).filter(r => r && r.len > 0).map(r => Object.assign({ rep: 1 }, r)); });
      s.sel = clamp(s.sel | 0, 0, Math.max(0, s.tracks.length - 1));
      return s;
    }
    function newSong(name) {
      let n = IDX.songs.length + 1; while (IDX.songs.some(x => x.name === "My Song " + n)) n++;
      return fixSong({ id: uid(), name: name || "My Song " + n });
    }
    function readSong(id) { try { const s = JSON.parse(localStorage.getItem(GBP + id) || "null"); if (s && Array.isArray(s.tracks)) return fixSong(s); } catch (e) {} return null; }
    let S = null, saveT = 0;
    function saveNow() {
      clearTimeout(saveT); if (!S) return;
      try { localStorage.setItem(GBP + S.id, JSON.stringify(S)); } catch (e) { gbSay("Couldn't save the song: this device's storage is full"); }
      const e = IDX.songs.find(x => x.id === S.id);
      if (e) { e.name = S.name; e.t = Date.now(); e.n = S.tracks.length; } else IDX.songs.unshift({ id: S.id, name: S.name, t: Date.now(), n: S.tracks.length });
      IDX.cur = S.id; saveIdx();
    }
    const saveSong = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 350); };
    function ensureSong() {
      if (S) return S;
      S = (IDX.cur && readSong(IDX.cur)) || (IDX.songs[0] && readSong(IDX.songs[0].id)) || null;
      if (!S) { S = newSong(); saveNow(); }
      return S;
    }
    // undo: the song as it was before each change
    const UNDO = [];
    function gbDo() { if (!S) return; UNDO.push(JSON.stringify(S)); if (UNDO.length > 50) UNDO.shift(); try { window.__nbNoted && __nbNoted("gb"); } catch (e) {} }
    // ---------- time ----------
    const spb = () => 60 / S.bpm;
    const rEnd = r => r.start + r.len * (r.rep || 1);
    function songEndBeat() { let e = 0; S.tracks.forEach(t => t.regions.forEach(r => { e = Math.max(e, rEnd(r)); })); return e; }
    function fitLen() { if (S.auto) S.bars = Math.max(8, Math.ceil(songEndBeat() / S.sig / 4 - 1e-6) * 4); }
    const keyName = () => NN[S.key] + (S.minor ? " minor" : "");

    // ---------- the sounds each kind can use ----------
    const entries = () => { try { return allEntries(); } catch (e) { return []; } };
    const plugCat = () => ((window.__wam && __wam.CAT) || []).filter(c => c.kind === "instrument");
    const plugOK = () => !!(window.__wam && __wam.here && __wam.create);
    function soundsFor(kind) {
      const E = entries(), out = [];
      const add = (ref, name, sub, group) => { if (!out.some(x => x.ref === ref)) out.push({ ref, name, sub: sub || "", group: group || "" }); };
      const lib = (e, g) => add("lib:" + e.id.slice(2), e.name, e.sub, g);
      const studio = re => E.filter(e => e.id.startsWith("w:nb-") && re.test(e.id.slice(5)));
      const cat = (c, re) => E.filter(e => e.cat === c && e.id.startsWith("w:") && !e.id.startsWith("w:nb-") && !e.id.startsWith("w:wam:") && (!re || re.test(e.name)));
      const presets = re => E.filter(e => e.id.startsWith("n:") && e.cat !== "wave" && (!re || re.test(e.name + " " + e.sub)));
      const prog = (e, a, b) => { const p = e.prog | 0; return p >= a && p <= b; };
      if (kind === "keys") {
        studio(/piano|upright|organ|grand|harp|marimba|glock|xylo|celest/).forEach(e => lib(e, "Studio"));
        cat("keys").forEach(e => lib(e, "Keys & organ")); cat("bells").forEach(e => lib(e, "Bells & mallets"));
        if (curInst) add("sf2", curInst.name, "your SF2 / SFZ instrument", "My instrument");
        studio(/trumpet|sax|flute|clarinet|horn|brass|choir|voice/).forEach(e => lib(e, "Studio"));
        cat("winds").forEach(e => lib(e, "Winds & brass")); cat("world").forEach(e => lib(e, "World")); cat("perc").forEach(e => lib(e, "Percussion"));
      }
      if (kind === "bass") {
        cat("gtrbass").filter(e => prog(e, 32, 39)).forEach(e => lib(e, "Bass"));
        studio(/dbass/).forEach(e => lib(e, "Studio"));
        presets(/bass/i).forEach(e => add("pre:" + e.id.slice(2), e.name, e.sub, "Synth bass"));
        add("eng:mono", "Mono synth bass", "the Minimoog-style engine", "Synth bass");
      }
      if (kind === "guitar") {
        cat("gtrbass").filter(e => prog(e, 24, 31)).forEach(e => lib(e, "Guitars"));
        if (plugOK()) plugCat().filter(c => /guitar/i.test(c.name)).forEach(c => add("wam:" + c.key, c.name, "plugin, physical model", "Plugins"));
      }
      if (kind === "strings") {
        studio(/string|violin|cello|pizz|viola|harp|dbass/).forEach(e => lib(e, "Studio"));
        cat("strings", /string|violin|viola|cello|contrabass|pizz|orchestra|harp|tremolo/i).forEach(e => lib(e, "Library strings"));
      }
      if (kind === "synth") {
        presets().forEach(e => add("pre:" + e.id.slice(2), e.name, e.sub, e.cat === "classic" ? "Classic synths" : "Nate Bloom presets"));
        Object.keys(ENGINES).filter(id => id !== "fm" || betaOn).forEach(id => add("eng:" + id, ENGINES[id].name, "engine", "Engines"));
        cat("leads").forEach(e => lib(e, "Synth leads")); cat("pads").forEach(e => lib(e, "Pads & atmos"));
      }
      if (kind === "plugin" && plugOK()) plugCat().forEach(c => add("wam:" + c.key, c.name, (c.vendor === "Nathan" ? "yours" : c.vendor) + (c.desc ? " · " + c.desc : ""), c.vendor === "Nathan" ? "Your plugins" : "Nate Bloom's plugins"));
      // (220) the hardware synths plugged in (the Minilogue XD, the MicroFreak): any melodic track can play one over MIDI
      if (!["drums", "audio", "sampler"].includes(kind)) {
        const H = window.__hw; if (H && H.shown && H.shown()) add("hw", H.name, H.present() ? "plays it over MIDI · its own sound" : "not plugged in", "Your hardware synths");
        if (window.__hwx) window.__hwx.all().filter(X => X.shown()).forEach(X => add("hwx:" + X.id, X.name, X.present() ? "plays it over MIDI · its own sound" : "not plugged in", "Your hardware synths"));
      }
      if (kind === "drums") Object.keys(RC_KITS).filter(k => k !== "analog").forEach(k => add("kit:" + k, RC_KITS[k][0], "drum kit", "Kits"));
      if (kind === "sampler") for (let i = 0; i < NSLOTS; i++) add("smp:" + i, "S" + (i + 1) + (sampBuf[i] ? " · " + baseName(state.samp.slots[i].name || "sample") : " (empty)"), sampBuf[i] ? "sampler slot" : "load or record a sample", "Sampler slots");
      return out;
    }
    function defaultSound(kind) {
      const E = entries(), has = id => E.some(e => e.id === "w:" + id);
      const gm = (a, b, want) => { const l = E.filter(e => e.cat === "gtrbass" && e.id.startsWith("w:") && (e.prog | 0) >= a && (e.prog | 0) <= b); const w = l.find(e => (e.prog | 0) === want) || l[0]; return w ? "lib:" + w.id.slice(2) : null; };
      switch (kind) {
        case "keys": return has("nb-piano") ? "lib:nb-piano" : (E.find(e => e.cat === "keys" && e.id.startsWith("w:")) ? "lib:" + E.find(e => e.cat === "keys" && e.id.startsWith("w:")).id.slice(2) : "eng:saw");
        case "drums": return "kit:studio";
        case "bass": return gm(32, 39, 33) || "eng:mono";
        case "guitar": return gm(24, 31, 25) || "eng:pluck";
        case "strings": return has("nb-strings") ? "lib:nb-strings" : "eng:saw";
        case "synth": return "pre:0";
        case "plugin": { const c = plugCat(), y = c.find(x => x.vendor === "Nathan") || c[0]; return y ? "wam:" + y.key : "eng:saw"; }
        case "sampler": { const i = sampBuf.findIndex(Boolean); return "smp:" + (i < 0 ? 0 : i); }
        case "audio": return "audio";
      }
      return "eng:saw";
    }
    function soundName(ref) {
      ref = ref || "";
      if (ref.startsWith("lib:")) { const e = entryById("w:" + ref.slice(4)); return e ? e.name : ref.slice(4); }
      if (ref.startsWith("pre:")) { const p = NB_PRESETS[+ref.slice(4)]; return p ? p[0] : "Preset"; }
      if (ref.startsWith("eng:")) { const e = ENGINES[ref.slice(4)]; return e ? e.name : "Synth"; }
      if (ref.startsWith("wam:")) { const c = plugCat().find(x => "wam:" + x.key === ref); return c ? c.name : "Plugin"; }
      if (ref.startsWith("kit:")) { const k = RC_KITS[ref.slice(4)]; return k ? k[0] : "Kit"; }
      if (ref.startsWith("smp:")) { const i = +ref.slice(4); return "Sampler S" + (i + 1) + (sampBuf[i] ? " · " + baseName(state.samp.slots[i].name || "sample") : " (empty)"); }
      if (ref === "sf2") return curInst ? curInst.name : "My instrument";
      if (ref === "audio") return "Audio";
      if (ref === "hw") return (window.__hw && window.__hw.name) || "Hardware synth";
      if (ref.startsWith("hwx:")) { const X = window.__hwx && window.__hwx.get(ref.slice(4)); return X ? X.name : "Hardware synth"; }
      return "Sound";
    }

    // ---------- audio: each track has its own volume and pan, into Nate Bloom's effects and master ----------
    const AU = { ctx: null, master: null, dest: null, trk: new Map(), plug: new Map(), lib: new Map(), live: new Map(), vs: new Set(), oh: new Map(), sus: new Map() };
    let GBR = false;   // (while a track's voice is made, it goes to the track, not to a sound's own effects chain)
    { const fg = fxcGet; fxcGet = function () { return GBR ? null : fg.apply(this, arguments); }; }
    function gbOut() {
      if (!ctx) return null;
      if (AU.ctx !== ctx) {   // (a new audio context: what was made in the old one goes)
        if (AU.ctx) { AU.trk.clear(); AU.plug.clear(); AU.lib.clear(); AU.live.clear(); AU.vs.clear(); }
        AU.ctx = ctx; AU.master = null; AU.dest = null; AU.vin = null;
      }
      if (!AU.master) { AU.master = ctx.createGain(); AU.master.gain.value = S && S.mvol != null ? S.mvol : 1; }
      // (straight into the master, after Nate Bloom's effects: each track has its own reverb send into the shared hall)
      { const D = AU.nb || (fx && fx.master); if (D && AU.dest !== D) { try { AU.master.disconnect(); } catch (e) {} AU.master.connect(D); AU.dest = D; } }
      if (fx && fx.verbIn && AU.vin !== fx.verbIn && !AU.nb) { AU.vin = fx.verbIn; AU.trk.forEach(N => { try { N.s.disconnect(); } catch (e) {} N.s.connect(AU.vin); }); }
      return AU.master;
    }
    const soloOn = () => S.tracks.some(t => t.solo);
    const VERB = { keys: 0.22, drums: 0.1, bass: 0, guitar: 0.18, strings: 0.32, synth: 0.18, plugin: 0.14, sampler: 0.14, audio: 0.2 };
    const tRv = tr => tr.rv != null ? tr.rv : (VERB[tr.kind] ?? 0.15);
    const tVerb = tr => AU.nb ? 0 : tRv(tr) * 0.9;
    const tLevel = tr => (tr.mute || (soloOn() && !tr.solo)) ? 0 : Math.pow(clamp(tr.vol, 0, 1.2), 2) * 1.25;
    function tNode(tr) {
      const M = gbOut(); if (!M) return null;
      let N = AU.trk.get(tr.id);
      if (!N) {
        const g = ctx.createGain(), p = ctx.createStereoPanner(), s = ctx.createGain();
        g.gain.value = tLevel(tr); p.pan.value = clamp(tr.pan, -1, 1); s.gain.value = tVerb(tr);
        g.connect(p).connect(M); p.connect(s); if (AU.vin) s.connect(AU.vin);
        N = { g, p, s }; AU.trk.set(tr.id, N);
      }
      return N;
    }
    function applyLevels() {
      if (!ctx || !S) return; const t = ctx.currentTime;
      S.tracks.forEach(tr => { const N = AU.trk.get(tr.id); if (N) { N.g.gain.setTargetAtTime(tLevel(tr), t, 0.02); N.p.pan.setTargetAtTime(clamp(tr.pan, -1, 1), t, 0.02); N.s.gain.setTargetAtTime(tVerb(tr), t, 0.03); } });
      if (AU.master) AU.master.gain.setTargetAtTime(S.mvol != null ? S.mvol : 1, t, 0.02);
    }
    // what a sound needs before it can play: library and Studio recordings, a plugin, a kit's recordings
    function libInst(stem) {
      let L = AU.lib.get(stem);
      if (!L) {
        L = { inst: null, pr: null }; AU.lib.set(stem, L);
        const e = entryById("w:" + stem);
        L.pr = loadWaf(stem).then(x => { L.inst = { name: e ? e.name : stem, sub: e ? e.sub : "", regions: x.regions }; }).catch(() => { AU.lib.delete(stem); });
      }
      return L.pr;
    }
    function prep(tr) {
      if (!ctx || !tr) return Promise.resolve();
      const r = tr.snd || "";
      if (r.startsWith("lib:")) return libInst(r.slice(4)) || Promise.resolve();
      if (r.startsWith("wam:")) return plugFor(tr) || Promise.resolve();
      if (r.startsWith("kit:")) { kitPads(r.slice(4)).forEach(p => { if (p.id) try { rcSampleBuf(p.id); } catch (e) {} }); }
      return Promise.resolve();
    }
    // a plugin per track: its own copy, so two tracks can use one plugin with their own settings and levels
    function plugFor(tr) {
      if (!plugOK()) return null;
      const key = tr.snd.slice(4);
      let P = AU.plug.get(tr.id);
      if (P && P.key === key && !(P.failed && Date.now() - P.failed > 10000)) return P.pr;   // (a failed load is tried again after 10 s)
      if (P) dropPlug(tr.id);
      P = { key, inst: null, node: null, g: null }; AU.plug.set(tr.id, P);
      P.pr = __wam.create(key).then(async r => {
        if (AU.plug.get(tr.id) !== P || !ctx) { try { r.inst.audioNode.disconnect(); } catch (e) {} return; }
        const g = ctx.createGain(); g.gain.value = (r.sp && r.sp.trim) || 1;
        const dc = ctx.createBiquadFilter(); dc.type = "highpass"; dc.frequency.value = 10; dc.Q.value = 0.707; r.inst.audioNode.connect(dc).connect(g); g.connect(tNode(tr).g);
        P.inst = r.inst; P.node = r.inst.audioNode; P.g = g; P.name = (r.inst.descriptor && r.inst.descriptor.name) || (r.sp && r.sp.name) || "Plugin";
        const st = tr.pst || (__wam.NBW && __wam.NBW.saved && __wam.NBW.saved["gb:" + tr.id]);
        if (st) { try { await P.node.setState(st); } catch (e) {} }
      }).catch(() => { if (AU.plug.get(tr.id) === P) { P.failed = Date.now(); if (tr.id !== "gb-preview") gbSay("Couldn't load " + soundName(tr.snd) + ": plugins need the Nate Bloom site or app (and a connection the first time)"); } });
      return P.pr;
    }
    function dropPlug(id) {
      const P = AU.plug.get(id); if (!P) return; AU.plug.delete(id);
      try { if (P.node) { P.node.disconnect(); if (P.node.destroy) P.node.destroy(); } if (P.g) P.g.disconnect(); } catch (e) {}
    }
    const plugMidi = (P, t, bytes) => { try { P.node.scheduleEvents({ type: "wam-midi", time: t, data: { bytes } }); } catch (e) {} };
    const engDefaults = id => Object.fromEntries(((ENGINES[id] && ENGINES[id].knobs) || []).map(([k, , v]) => [k, v]));
    function withParams(id, P, fn) { const keep = state.params[id]; state.params[id] = Object.assign({}, keep, P || {}); try { return fn(); } finally { state.params[id] = keep; } }
    function routeTo(tr, fn) {
      const N = tNode(tr); if (!N) return null;
      const keep = fx.input; GBR = true; fx.input = N.g;
      try { return fn(); } catch (e) { return null; } finally { fx.input = keep; GBR = false; }
    }
    const libP = tr => { const e = entryById("w:" + (tr.snd || "").slice(4)); return Object.assign(Object.fromEntries(LIB_KNOBS.map(([k, , v]) => [k, v])), { decay: e && e.sus ? 1 : 0.62 }, tr.p || {}); };
    // one note of a track's sound, from time t; returns { stop(at) }
    function mkVoice(tr, m, t, vel) {
      const r = tr.snd || "", sc = 0.3 + 0.7 * clamp(vel, 0, 1);
      if (r.startsWith("eng:")) {
        const id = r.slice(4); if (!ENGINES[id]) return null;
        return routeTo(tr, () => withParams(id, Object.assign(engDefaults(id), tr.p || {}), () => makeVoice(m, id, sc, t)));
      }
      if (r.startsWith("pre:")) {
        const P = NB_PRESETS[+r.slice(4)]; if (!P) return null;
        const ids = (Array.isArray(P[1]) ? P[1] : [P[1]]).filter(id => ENGINES[id]), n = 1 / Math.sqrt(Math.max(1, ids.length)), oct = 12 * ((P[3] && P[3].oct) || 0), vs = [];
        ids.forEach(id => { const v = routeTo(tr, () => withParams(id, Object.assign(engDefaults(id), (P[2] && P[2][id]) || {}, (tr.p && tr.p[id]) || {}), () => makeVoice(m + oct, id, sc * n, t))); if (v) vs.push(v); });
        return vs.length ? { stop: at => vs.forEach(v => { try { v.stop(at); } catch (e) {} }) } : null;
      }
      if (r.startsWith("lib:")) {
        const L = AU.lib.get(r.slice(4)); if (!L || !L.inst) { libInst(r.slice(4)); return null; }
        return routeTo(tr, () => makeInstVoice(m, t, sc, L.inst, libP(tr)));
      }
      if (r === "sf2") return curInst ? routeTo(tr, () => makeInstVoice(m, t, sc)) : null;
      if (r.startsWith("smp:")) return routeTo(tr, () => makeSampleVoice(m, +r.slice(4), t, sc));
      if (r === "hw" || r.startsWith("hwx:")) {   // (220) a hardware synth: the note goes out over MIDI at its time, with its velocity
        const X = r === "hw" ? window.__hw : window.__hwx && window.__hwx.get(r.slice(4)); if (!X || tr.mute || (soloOn() && !tr.solo)) return null;
        const k7 = NB_VEL7; NB_VEL7 = clamp(Math.round(clamp(vel, 0, 1) * 127), 1, 127);
        try { return X.voice(clamp(Math.round(m), 0, 127), t); } finally { NB_VEL7 = k7; }
      }
      if (r.startsWith("wam:")) {
        const P = AU.plug.get(tr.id); if (!P || !P.node) { plugFor(tr); return null; }
        const note = clamp(Math.round(m), 0, 127), v7 = clamp(Math.round(sc * 118), 1, 127);
        plugMidi(P, Math.max(ctx.currentTime, t ?? 0), [0x90, note, v7]);
        let done = false;
        return { stop(at) { if (done || !ctx) return; done = true; plugMidi(P, Math.max(ctx.currentTime, at ?? 0), [0x80, note, 0]); } };
      }
      return null;
    }
    // ---------- drums: GM notes onto a kit (the Rhythm Creator's sounds) ----------
    const GM = { 35: "kick", 36: "kick", 37: "rim", 38: "snare", 40: "snare", 39: "clap", 41: "tomL", 43: "tomL", 45: "tomM", 47: "tomM", 48: "tomH", 50: "tomH", 42: "ch", 44: "ph", 46: "oh",
      49: "cym", 52: "cym", 55: "cym", 57: "cym", 51: "ride", 59: "ride", 53: "bell", 54: "tamb", 56: "cow", 69: "shaker", 70: "shaker", 82: "shaker", 60: "perc", 61: "perc", 62: "perc", 63: "perc", 64: "perc" };
    const PADS = [[49, "Crash"], [51, "Ride"], [46, "Open hat"], [42, "Closed hat"], [44, "Pedal hat"], [39, "Clap"], [48, "High tom"], [45, "Mid tom"], [41, "Low tom"], [37, "Rim"], [38, "Snare"], [36, "Kick"]];
    const PADCOL = { 49: "#d9b43a", 51: "#c9a23a", 46: "#5fb0c9", 42: "#4f9fb9", 44: "#4a8fa8", 39: "#c95f9a", 48: "#9a6fd0", 45: "#8a5fc0", 41: "#7a4fb0", 37: "#d0783a", 38: "#e0603a", 36: "#e04a4a" };
    const DRUMNAME = m => (PADS.find(p => p[0] === m) || [0, { 53: "Ride bell", 54: "Tambourine", 56: "Cowbell", 69: "Shaker", 70: "Shaker", 82: "Shaker" }[m] || "Perc " + m])[1];
    function kitSound(kid, role) {
      const K = RC_KITS[kid] || RC_KITS.studio, m = (K && K[1]) || {}, f = (k, i = 0) => (m[k] && (m[k][i] || m[k][0])) || null;
      switch (role) {
        case "kick": return f("kick"); case "snare": return f("snare"); case "rim": return f("rim") || (m.snare && m.snare[1]) || f("snare");
        case "clap": return f("clap") || f("snare"); case "ch": return f("ch"); case "ph": return (m.ch && m.ch[1]) || f("ch");
        case "oh": return f("oh") || f("ch"); case "cym": return f("cym") || f("oh"); case "ride": return f("ride") || f("cym");
        case "bell": return (m.ride && m.ride[1]) || f("bell") || f("ride");
        case "tomL": return f("tom", 0); case "tomM": return f("tom", 1); case "tomH": return (m.tom && m.tom[2]) || (m.tom && m.tom[m.tom.length - 1]) || null;
        case "cow": return f("bell") || f("perc"); case "shaker": return f("shaker") || f("ch"); case "tamb": return (m.shaker && m.shaker[1]) || f("shaker") || f("clap");
        case "perc": return f("perc") || f("tom", 2);
      }
      return null;
    }
    const kitPads = kid => PADS.map(([m, name]) => ({ m, name, id: kitSound(kid, GM[m]) }));
    function drumHit(tr, m, t, vel) {
      if (!ctx) return;
      const kid = (tr.snd || "kit:studio").slice(4), role = GM[m] || "perc", id = kitSound(kid, role); if (!id) return;
      const N = tNode(tr); if (!N) return;
      if (role === "ch" || role === "ph") { const V = AU.oh.get(tr.id); if (V && V.o) { try { V.o.gain.setTargetAtTime(0, Math.max(t, ctx.currentTime), 0.008); } catch (e) {} } AU.oh.delete(tr.id); }
      const p = { v: clamp(vel, 0.05, 1.2) * rcGain(id), r: 1, d: 1, dec: 0.5, tone: 0.5, ch: 0.5, beat: spb() };
      let V = null;
      try {
        const eng = rcEngine(id);
        if (eng === "smp") V = rcSampleHit(id, t, p, N.g);
        else if (RC_SYN[id]) { V = rcV(t, N.g, p.v); RC_SYN[id](V, p); V.go(); }
      } catch (e) {}
      if (V && role === "oh") AU.oh.set(tr.id, V);
    }
    // ---------- notes: scheduled ones, and live ones from the touch instruments and MIDI ----------
    function playAt(tr, m, t, d, vel) {
      if (tr.kind === "drums") { drumHit(tr, m, t, vel); return; }
      const v = mkVoice(tr, m, t, vel); if (!v) return;
      AU.vs.add({ v, end: t + Math.max(0.04, d) });
    }
    function releaseDue(horizon) { AU.vs.forEach(x => { if (x.end <= horizon) { try { x.v.stop(x.end); } catch (e) {} AU.vs.delete(x); } }); }
    function click(t, accent) {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = accent ? 1760 : 1245;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.16 : 0.1, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);   // (straight out: never in a recording or an export)
    }
    let sustain = false;
    function liveOn(tr, m, vel, dt = 0) {
      start(); if (!ctx || !tr) return;
      const t = ctx.currentTime + dt;
      if (tr.kind === "drums") { drumHit(tr, m, t, vel); recHit(tr, m, vel); return; }
      const k = tr.id + ":" + m, old = AU.live.get(k) || AU.sus.get(k);
      if (old) { try { old.stop(t); } catch (e) {} AU.live.delete(k); AU.sus.delete(k); recOff(tr, m); }
      const v = mkVoice(tr, m, t, vel);
      if (v) AU.live.set(k, v); else if (((tr.snd || "").startsWith("wam:") && !(AU.plug.get(tr.id) || {}).failed) || (tr.snd || "").startsWith("lib:")) gbSay("Loading " + soundName(tr.snd) + "…");
      recOn(tr, m, vel, dt);
    }
    function liveOff(tr, m) {
      if (!tr || tr.kind === "drums") return;
      const k = tr.id + ":" + m, v = AU.live.get(k);
      if (v) { AU.live.delete(k); if (sustain) { AU.sus.set(k, v); return; } try { v.stop(ctx.currentTime); } catch (e) {} }
      recOff(tr, m);   // (recorded even when the sound was still loading)
    }
    function sustainOff() {
      sustain = false; if (!ctx) return;
      AU.sus.forEach((v, k) => { try { v.stop(ctx.currentTime); } catch (e) {} const [id, m] = k.split(":"), tr = S && S.tracks.find(x => x.id === id); if (tr) recOff(tr, +m); });
      AU.sus.clear();
    }
    function liveAllOff() { try { if (window.__gbNotes) window.__gbNotes.clear(); } catch (e) {} if (!ctx) return; [AU.live, AU.sus].forEach(M => { M.forEach(v => { try { v.stop(ctx.currentTime); } catch (e) {} }); M.clear(); }); }

    // ---------- the transport ----------
    const TP = { on: false, rec: false, t0: 0, b0: 0, next: 0, timer: 0, ev: [], evi: 0, dirty: true, srcs: [], exp: null };
    const beatAt = t => TP.b0 + (t - TP.t0) / spb();
    const timeAt = b => TP.t0 + (b - TP.b0) * spb();
    const beatNow = () => (TP.on && ctx ? beatAt(ctx.currentTime) : S.ph);
    const dirty = () => { TP.dirty = true; };
    function flatNotes(r) {
      const out = [], reps = r.rep || 1;
      for (let k = 0; k < reps; k++) (r.notes || []).forEach(n => { if (n[0] >= 0 && n[0] < r.len - 1e-6) out.push([r.start + k * r.len + n[0], n[1], Math.min(n[2], r.len - n[0]), n[3]]); });
      return out;
    }
    function buildEv() {
      const ev = [];
      S.tracks.forEach(tr => { if (tr.kind !== "audio") tr.regions.forEach(r => flatNotes(r).forEach(n => ev.push({ b: n[0], tr, m: n[1], d: n[2], v: n[3] }))); });
      ev.sort((a, b) => a.b - b.b); TP.ev = ev; TP.dirty = false;
    }
    function seekIdx(b) { let lo = 0, hi = TP.ev.length; while (lo < hi) { const md = (lo + hi) >> 1; if (TP.ev[md].b < b - 1e-6) lo = md + 1; else hi = md; } TP.evi = lo; }
    function audioStart(tr, r, t, off) {
      const buf = ABUF.get(r.key); if (!buf || !ctx) return;
      const N = tNode(tr), o = (r.off || 0) + off, dur = Math.min(r.len * spb() - off, buf.duration - o); if (dur <= 0.01 || o < 0) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const when = Math.max(t, ctx.currentTime), L = Math.min(r.len * spb(), buf.duration - (r.off || 0)), G = ctx.createGain();
      clipEnv(G.gain, r, L, off, when, dur); src.connect(G).connect(N.g);
      src.start(when, o, dur); TP.srcs.push(src);
    }
    // a region's level: its gain, and its fades (seconds, from the start and the end of each time it plays)
    function clipEnvAt(r, L, lt) {
      const g = r.g != null ? r.g : 1, fi = Math.min(r.fi || 0, L / 2), fo = Math.min(r.fo || 0, L / 2);
      return g * (fi > 0 && lt < fi ? Math.max(0, lt / fi) : 1) * (fo > 0 && lt > L - fo ? Math.max(0, (L - lt) / fo) : 1);
    }
    function clipEnv(P, r, L, off, when, dur) {
      const g = r.g != null ? r.g : 1, fi = Math.min(r.fi || 0, L / 2), fo = Math.min(r.fo || 0, L / 2);
      P.setValueAtTime(clipEnvAt(r, L, off), when);
      if (fi > 0 && off < fi) P.linearRampToValueAtTime(g, when + (fi - off));
      if (fo > 0 && off + dur > L - fo - 1e-4) { const fs = L - fo; if (off < fs) P.setValueAtTime(g, when + (fs - off)); P.linearRampToValueAtTime(0, when + Math.max(0.001, L - off)); }
    }
    const audioReps = (r, fn) => { for (let k = 0; k < (r.rep || 1); k++) fn(r.start + k * r.len); };
    function startAudio(b, t) { S.tracks.forEach(tr => { if (tr.kind === "audio" && tLevel(tr) > 0) tr.regions.forEach(r => audioReps(r, s => { if (s < b - 1e-6 && s + r.len > b + 1e-6) audioStart(tr, r, t ?? timeAt(b), (b - s) * spb()); })); }); }
    function stopAudio(t) { TP.srcs.forEach(s => { try { s.stop(t ?? 0); } catch (e) {} }); TP.srcs = []; }
    function schedule(b1, b2) {
      const ev = TP.ev;
      while (TP.evi < ev.length && ev[TP.evi].b < b2 - 1e-9) {
        const e = ev[TP.evi++]; if (e.b < b1 - 1e-6) continue;
        if (tLevel(e.tr) <= 0) continue;
        playAt(e.tr, e.m, timeAt(e.b), e.d * spb(), e.v);
      }
      S.tracks.forEach(tr => { if (tr.kind === "audio" && tLevel(tr) > 0) tr.regions.forEach(r => audioReps(r, s => { if (s >= b1 - 1e-6 && s < b2 - 1e-9) audioStart(tr, r, timeAt(s), 0); })); });
      if (S.metro && !TP.exp) for (let k = Math.ceil(b1 - 1e-6); k < b2 - 1e-9; k++) click(timeAt(k), k % S.sig === 0);
      apTick(b1, b2);
    }
    function tick() {
      if (!TP.on || !ctx) return;
      if (TP.dirty) { buildEv(); seekIdx(TP.next); }
      const horizon = ctx.currentTime + 0.16;
      for (let guard = 0; guard < 8; guard++) {
        const bEnd = beatAt(horizon), cyc = S.cyc.on && S.cyc.b > S.cyc.a + 0.5 && !TP.exp, lim = cyc ? S.cyc.b : Infinity, seg = Math.min(bEnd, lim);
        if (seg > TP.next) { schedule(TP.next, seg); TP.next = seg; }
        if (cyc && bEnd >= lim && TP.next >= lim - 1e-9) {   // the cycle starts over
          const tw = timeAt(lim);
          if (TP.rec) recWrap();
          TP.t0 = tw; TP.b0 = S.cyc.a; TP.next = S.cyc.a; seekIdx(S.cyc.a); stopAudio(tw); startAudio(S.cyc.a, tw); vaSched(S.cyc.a, tw);
          continue;
        }
        break;
      }
      releaseDue(horizon);
      const now = beatAt(ctx.currentTime);
      if (TP.exp) { if (now >= TP.exp.end) expDone(); return; }
      if (TP.rec) { if (S.auto && now > S.bars * S.sig - 1) { S.bars += 4; if (V.open && S.view === "tracks") renderTracks(); } }
      else if (!S.cyc.on && now >= Math.max(S.bars * S.sig, songEndBeat()) + 0.02) { stop(); S.ph = 0; paintBar(); placePh(); }
    }
    function play(rec) {
      start(); if (!ctx || !S) return;
      if (TP.on) stop();
      const tr = curTr();
      if (rec && !tr) { gbSay("Pick an instrument first: each one becomes a track you can record"); return; }
      if (rec && tr.kind === "audio" && tr.input !== "nb" && !MIC.src) { micOpen().then(ok => { if (ok) play(true); }); return; }
      liveAllOff(); buildEv(); if (window.__sp) __sp.restart();
      let from = TP.exp ? 0 : S.ph;
      if (!TP.exp && S.cyc.on && (from < S.cyc.a - 1e-6 || from >= S.cyc.b - 1e-6)) from = S.cyc.a;
      if (rec && !S.cyc.on) from = Math.floor(from / S.sig + 1e-6) * S.sig;   // a take starts on a bar
      const lead = 0.1, cin = rec && S.cin ? S.sig * spb() : 0;
      TP.b0 = from; TP.t0 = ctx.currentTime + lead + cin; TP.next = from; TP.on = true; TP.rec = !!rec;
      if (cin) for (let i = 0; i < S.sig; i++) click(ctx.currentTime + lead + i * spb(), i === 0);
      seekIdx(from); startAudio(from);
      S.tracks.forEach(t => { if ((t.snd || "").startsWith("wam:")) plugFor(t); });
      if (rec) recStart(tr, from);
      vaSched(from, TP.t0); beatAlong(true);
      tick(); TP.timer = setInterval(tick, 25);
      paintBar(); frame();
    }
    function stop() {
      if (!TP.on) return;
      const now = ctx ? ctx.currentTime : 0, b = beatAt(now);
      clearInterval(TP.timer); TP.on = false;
      AU.vs.forEach(x => { try { x.v.stop(now); } catch (e) {} }); AU.vs.clear();
      AU.plug.forEach(P => { if (P.node) plugMidi(P, now, [0xB0, 123, 0]); });
      stopAudio(now); apAfterStop(); vaRest(); beatAlong(false);
      const wasRec = TP.rec; TP.rec = false;
      if (wasRec) recFinish(b);
      if (b >= TP.b0) S.ph = Math.max(0, b);
      paintBar(); placePh(); saveSong();
    }
    // ---------- recording: notes into a region of the selected track ----------
    const REC = { tr: "", b0: 0, notes: [], held: new Map(), cyc: null };
    const recBeat = () => beatAt(ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0));
    function recStart(tr, from) {
      REC.tr = tr.id; REC.b0 = from; REC.notes = []; REC.held.clear(); REC.cyc = S.cyc.on ? { a: S.cyc.a, b: S.cyc.b } : null;
      if (tr.kind === "audio") { if (tr.input === "nb") nbRecStart(tr); else audioRecStart(tr); }
    }
    const recking = tr => TP.on && TP.rec && tr && REC.tr === tr.id;
    function recOn(tr, m, vel, dt = 0) { if (!recking(tr)) return; REC.held.set(m, { b: Math.max(REC.b0, recBeat() + dt / spb()), v: vel }); }
    function recOff(tr, m) {
      if (!recking(tr)) return;
      const h = REC.held.get(m); if (!h) return; REC.held.delete(m);
      let e = recBeat(); if (e < h.b) e = REC.cyc ? REC.cyc.b : h.b + 0.1;
      REC.notes.push([h.b, m, Math.max(0.06, e - h.b), h.v]);
    }
    function recHit(tr, m, vel) { if (recking(tr)) REC.notes.push([Math.max(REC.b0, recBeat()), m, 0.25, vel]); }
    function recNote(tr, m, b, d, vel) { if (recking(tr) && b >= REC.b0 - 1e-6) REC.notes.push([b, m, d, vel]); }
    function recWrap() { if (!REC.cyc) return; REC.held.forEach((h, m) => { REC.notes.push([h.b, m, Math.max(0.06, REC.cyc.b - h.b), h.v]); h.b = REC.cyc.a; }); }
    function trimRegion(r, a, b) {
      if (b - a < 0.02) return null;
      if (r.key) return Object.assign({}, r, { id: uid(), start: a, len: b - a, rep: 1, off: (r.off || 0) + (a - r.start) * spb(), fi: a > r.start + 1e-6 ? 0 : r.fi, fo: b < r.start + r.len - 1e-6 ? 0 : r.fo });
      const notes = flatNotes(r).filter(n => n[0] >= a - 1e-6 && n[0] < b - 1e-6).map(n => [n[0] - a, n[1], Math.min(n[2], b - n[0]), n[3]]);
      return { id: uid(), start: a, len: b - a, rep: 1, notes, name: r.name };
    }
    function placeRegion(tr, R, merge) {
      const a = R.start, b = rEnd(R), keep = [];
      tr.regions.forEach(r => {
        const ra = r.start, rb = rEnd(r);
        if (rb <= a + 1e-6 || ra >= b - 1e-6) { keep.push(r); return; }
        if (merge && !r.key && !R.key) flatNotes(r).forEach(n => { if (n[0] >= a - 1e-6 && n[0] < b - 1e-6) R.notes.push([n[0] - a, n[1], n[2], n[3]]); });
        if (ra < a) keep.push(trimRegion(r, ra, a));
        if (rb > b) keep.push(trimRegion(r, b, rb));
      });
      keep.push(R); tr.regions = keep.filter(Boolean).sort((x, y) => x.start - y.start);
    }
    function recFinish(bStop) {
      const tr = S.tracks.find(t => t.id === REC.tr); if (!tr) return;
      if (tr.kind === "audio") { if (tr.input === "nb") nbRecFinish(tr, bStop); else audioRecFinish(tr, bStop); return; }
      const endB = REC.cyc ? Math.min(bStop, REC.cyc.b) : bStop;
      REC.held.forEach((h, m) => REC.notes.push([h.b, m, Math.max(0.06, endB - h.b), h.v])); REC.held.clear();
      const notes0 = REC.notes.filter(n => Number.isFinite(n[0])); if (!notes0.length) return;
      gbDo();
      let a, b;
      if (REC.cyc) { a = REC.cyc.a; b = REC.cyc.b; }
      else { const hi = Math.max(...notes0.map(n => n[0] + n[2])); a = Math.floor(REC.b0 / S.sig + 1e-6) * S.sig; b = Math.max(a + S.sig, Math.ceil(Math.max(hi, bStop) / S.sig - 1e-6) * S.sig); }
      const notes = notes0.filter(n => n[0] >= a - 1e-6 && n[0] < b).map(n => [Math.max(0, +(n[0] - a).toFixed(4)), n[1], +n[2].toFixed(4), +n[3].toFixed(3)]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      placeRegion(tr, { id: uid(), start: a, len: b - a, rep: 1, notes }, S.merge || !!REC.cyc);
      fitLen(); dirty(); saveSong();
      gbSay("Recorded " + notes.length + (notes.length === 1 ? " note" : " notes") + " into " + tr.name);
      if (V.open) { paintBar(); if (S.view === "tracks") renderTracks(); }
    }
    // ---------- audio: the mic, takes stored with the samples (and in projects) ----------
    const MIC = { stream: null, src: null, an: null, ctx: null, proc: null, mute: null, chunks: [], t0: null, mon: null };
    const ABUF = new Map();
    async function micOpen() {
      if (MIC.src && MIC.ctx === ctx) return true;
      start(); if (!ctx) return false;
      try {
        MIC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        MIC.ctx = ctx; MIC.src = ctx.createMediaStreamSource(MIC.stream); MIC.an = ctx.createAnalyser(); MIC.an.fftSize = 1024; MIC.src.connect(MIC.an);
        return true;
      } catch (e) { gbSay("The microphone isn't available: allow it for Nate Bloom, or plug one in"); return false; }
    }
    function micClose() {
      try { if (MIC.stream) MIC.stream.getTracks().forEach(t => t.stop()); if (MIC.src) MIC.src.disconnect(); if (MIC.mon) MIC.mon.disconnect(); } catch (e) {}
      MIC.stream = MIC.src = MIC.an = MIC.mon = null; MIC.ctx = null;
    }
    function micMonitor(tr, on) {
      if (MIC.mon) { try { MIC.mon.disconnect(); } catch (e) {} MIC.mon = null; }
      if (on && MIC.src) { MIC.mon = ctx.createGain(); MIC.src.connect(MIC.mon); MIC.mon.connect(tNode(tr).g); }
    }
    // A take is held in memory while it records (and copied once more as it becomes a region): past this
    // a phone's browser can run out of memory and lose it all, so recording stops here and the take is kept
    const GB_MAX_REC_SEC = (NB_BIG ? 60 : 10) * 60;
    const recFull = () => setTimeout(() => { if (TP.on && TP.rec) { stop(); gbSay("Recording stopped at " + nbMinSec(GB_MAX_REC_SEC) + ", the longest one take can be. The take is kept."); } }, 0);
    function audioRecStart() {
      if (!MIC.src) return;
      const proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
      MIC.chunks = []; MIC.t0 = null; MIC.len = 0; MIC.full = false;
      proc.onaudioprocess = e => {
        if (!TP.on || !TP.rec) return;
        const n = e.inputBuffer.length, tEnd = ctx.currentTime, tStart = tEnd - n / ctx.sampleRate;
        if (tEnd < TP.t0 - 0.05) return;   // (still counting in)
        if (MIC.t0 == null) MIC.t0 = tStart;
        MIC.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        MIC.len += n; if (MIC.len >= ctx.sampleRate * GB_MAX_REC_SEC && !MIC.full) { MIC.full = true; recFull(); }
      };
      MIC.src.connect(proc); proc.connect(mute).connect(ctx.destination); MIC.proc = proc; MIC.mute = mute;
    }
    async function audioRecFinish(tr, bStop) {
      try { MIC.src.disconnect(MIC.proc); MIC.proc.disconnect(); MIC.mute.disconnect(); } catch (e) {}
      const chunks = MIC.chunks; MIC.chunks = [];
      const total = chunks.reduce((a, c) => a + c.length, 0); if (!total || MIC.t0 == null) return;
      const sr = ctx.sampleRate, buf = ctx.createBuffer(1, total, sr), d = buf.getChannelData(0); let o = 0; chunks.forEach(c => { d.set(c, o); o += c.length; });
      chunks.length = 0;   // (the take is in the buffer now: let the pieces go before the WAV copy is made)
      // the take is late by the trip out to the speakers and back in: line it up with what was playing
      const lat = (ctx.outputLatency || ctx.baseLatency || 0.02) + 4096 / sr;
      const a = REC.b0, startT = MIC.t0 - lat, off = Math.max(0, timeAt(a) - startT);
      const endB = REC.cyc ? Math.min(bStop, REC.cyc.b) : bStop, len = Math.max(0.5, Math.min(endB - a, (buf.duration - off) / spb()));
      const key = "gb:" + S.id + ":" + uid();
      ABUF.set(key, buf);
      gbDo();
      placeRegion(tr, { id: uid(), start: a, len: +len.toFixed(4), rep: 1, key, off: +off.toFixed(4), dur: buf.duration }, false);
      fitLen(); dirty(); saveSong();
      gbSay("Recorded " + (buf.duration - off).toFixed(1) + " s into " + tr.name);
      if (V.open && S.view === "tracks") renderTracks();
      try { const wav = bufferToWav(buf); await idbPut(key, { name: tr.name + " take", data: wav instanceof Blob ? await wav.arrayBuffer() : wav }); } catch (e) { gbSay("Couldn't keep the recording: storage is full"); }
    }
    async function idbPut(key, val) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("samples", "readwrite"); tx.objectStore("samples").put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
    async function idbGet(key) { const db = await idb(); return new Promise(res => { try { const r = db.transaction("samples").objectStore("samples").get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } }); }
    async function idbDel(key) { try { const db = await idb(); db.transaction("samples", "readwrite").objectStore("samples").delete(key); } catch (e) {} }
    async function loadAudio(key) {
      if (ABUF.has(key)) return ABUF.get(key);
      if (key.startsWith("trk:")) { const b = await getAudio(key.slice(4)); if (b) ABUF.set(key, b); return b; }
      const rec = await idbGet(key); if (!rec || !rec.data || !ctx) return null;
      try { const b = await decode(rec.data.slice(0)); ABUF.set(key, b); return b; } catch (e) { return null; }
    }
    const loadSongAudio = () => Promise.all(S.tracks.flatMap(t => t.regions.filter(r => r.key).map(r => loadAudio(r.key)))).then(() => { if (V.open && S.view === "tracks") renderTracks(); });

    // ---------- the screen ----------
    const view = $("gbView"), sheet = $("gbSheet"), shB = $("gbShB"), shT = $("gbShT"), shI = $("gbShI");
    const V = { open: false, rsel: "", menu: false, clip: null, lastTap: null, keys: null, meter: null, guiTr: "" };
    const curTr = () => (S && S.tracks[S.sel]) || null;
    const trById = id => S && S.tracks.find(t => t.id === id);
    const isPhone = () => innerWidth < 700;
    const svgOf = k => ICON[k].replace('stroke="#fff"', 'stroke="currentColor"');
    const TRACKS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="2.5" y="4" width="11" height="4.2" rx="1.3"/><rect x="8" y="10" width="13.5" height="4.2" rx="1.3"/><rect x="2.5" y="16" width="8" height="4.2" rx="1.3"/></svg>';
    const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
    const STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.6"/></svg>';
    // keys and pads that light up when they play, from the screen, the computer keyboard or MIDI
    function lit(m, on) {
      if (!V.keys) return;
      const el = V.keys.get(m); if (!el) return;
      if (el.classList.contains("gb-pad")) { el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 120); return; }
      el.classList.toggle("on", !!on);
    }
    function paintBar() {
      if (typeof mtPaint === "function") try { mtPaint(); } catch (e) {}
      if (!S) return;
      const pb = $("gbPlay"), rb = $("gbRec");
      pb.classList.toggle("on", TP.on); pb.innerHTML = TP.on ? STOP_SVG : PLAY_SVG;
      pb.setAttribute("aria-label", TP.on ? "Stop" : "Play"); pb.title = (TP.on ? "Stop" : "Play") + " (space)";
      rb.classList.toggle("on", TP.on && TP.rec); rb.setAttribute("aria-pressed", String(TP.on && TP.rec));
      $("gbMetro").setAttribute("aria-pressed", String(!!S.metro));
      $("gbUndo").disabled = !UNDO.length;
      $("gbInfo").textContent = S.bpm + " · " + NN[S.key] + (S.minor ? "m" : "") + " · " + S.sig + "/4";
      const vb = $("gbViewBtn"), tr = curTr();
      if (S.view === "tracks") {
        vb.innerHTML = tr ? svgOf(tr.kind) : svgOf("keys"); vb.disabled = false;
        const t = tr ? "Play " + tr.name : "Choose an instrument"; vb.setAttribute("aria-label", t); vb.title = t;
      } else { vb.innerHTML = TRACKS_SVG; vb.disabled = false; vb.setAttribute("aria-label", "Tracks"); vb.title = "Tracks: arrange, edit and mix your song"; }
      $("gbBrowseBtn").setAttribute("aria-pressed", String(S.view === "browse"));
      paintPos();
    }
    function paintPos() {
      if (!S) return;
      const p = $("gbPos"), rb = $("gbRec"); let txt;
      const counting = TP.on && TP.rec && ctx && ctx.currentTime < TP.t0 - 0.005;
      if (counting) txt = "Count " + Math.max(1, Math.ceil((TP.t0 - ctx.currentTime) / spb() - 1e-3));
      else { const b = Math.max(0, beatNow()); txt = (Math.floor(b / S.sig + 1e-9) + 1) + " . " + (Math.floor(b % S.sig + 1e-9) + 1); }
      rb.classList.toggle("count", !!counting);
      if (p.textContent !== txt) p.textContent = txt;
    }
    // ---------- Musical Typing: the computer keyboard as an instrument, as in GarageBand ----------
    const MT_WHITE = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"], MT_WOFF = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
    const MT_BLACK = { KeyW: 1, KeyE: 3, KeyT: 6, KeyY: 8, KeyU: 10, KeyO: 13, KeyP: 15 }, MT_BROW = ["KeyW", "KeyE", "", "KeyT", "KeyY", "KeyU", "", "KeyO", "KeyP"];
    const MT_DRUM = { KeyA: 36, KeyS: 38, KeyD: 39, KeyF: 42, KeyG: 44, KeyH: 46, KeyJ: 41, KeyK: 45, KeyL: 48, Semicolon: 49, Quote: 51, KeyW: 37 };
    const MT_CHAR = { Semicolon: ";", Quote: "'" }; MT_WHITE.concat(Object.keys(MT_BLACK)).forEach(c => { if (!MT_CHAR[c]) MT_CHAR[c] = c.slice(3); });
    const MT_ALL = MT_WHITE.concat(Object.keys(MT_BLACK));
    const MT = { on: IDX.typing != null ? !!IDX.typing : (typeof KBD_LABELS !== "undefined" && !!KBD_LABELS), vel: 0.8 };
    const mtNote = (tr, code) => { if (!tr) return null; if (tr.kind === "drums") return MT_DRUM[code] ?? null; const w = MT_WHITE.indexOf(code); if (w >= 0) return 60 + 12 * (tr.oct | 0) + MT_WOFF[w]; return MT_BLACK[code] != null ? 60 + 12 * (tr.oct | 0) + MT_BLACK[code] : null; };
    function mtOct(tr, d) { const o = clamp((tr.oct | 0) + d, -3, 3); if (o === (tr.oct | 0)) return; tr.oct = o; saveSong(); if (S.view === "inst") renderInst(); mtPaint(); gbSay("Octave " + (o > 0 ? "+" : "") + o + ": A plays " + nname(60 + 12 * o)); }
    function mtVel(d) { MT.vel = Math.round(clamp(MT.vel + d, 0.2, 1) * 10) / 10; mtPaint(); }
    function mtLit(code, on) { const el = document.querySelector('#gbType .mt-k[data-code="' + code + '"]'); if (el) el.classList.toggle("on", on); }
    const mtEl = gbEl("div", "gb-type"); mtEl.id = "gbType"; mtEl.hidden = true; mtEl.setAttribute("aria-label", "Musical Typing: the computer keys and what they play"); view.append(mtEl);
    function mtPaint() {
      $("gbTypeBtn").setAttribute("aria-pressed", String(MT.on));
      mtEl.hidden = !MT.on || !V.open; if (mtEl.hidden) { MT.sig = ""; return; }
      const tr = curTr(), sig = [tr && tr.id, tr && tr.kind, tr && tr.mode, tr && tr.oct, MT.vel, S.key, S.minor].join();
      if (sig === MT.sig) return; MT.sig = sig;   // (nothing changed: the strip stays, keys held on it keep sounding)
      mtEl.replaceChildren();
      const side = gbEl("div", "mt-side"); side.append(gbEl("b", "", "Musical Typing"));
      const row = (k1, txt, k2) => { const r = gbEl("span"); r.append(gbEl("kbd", "", k1), document.createTextNode(" " + txt + " "), gbEl("kbd", "", k2)); return r; };
      if (tr && tr.kind !== "drums" && tr.kind !== "audio") side.append(row("Z", "octave " + ((tr.oct | 0) > 0 ? "+" : "") + (tr.oct | 0), "X"));
      side.append(row("C", "velocity " + Math.round(MT.vel * 100), "V"));
      mtEl.append(side);
      if (!tr) { mtEl.append(gbEl("span", "mt-msg", "Choose an instrument: the keys play it")); return; }
      if (tr.kind === "audio") { mtEl.append(gbEl("span", "mt-msg", tr.input === "nb" ? "R records Nate Bloom (the Garage steps into a small bar) · Space plays" : "R records the microphone · Space plays")); return; }
      const keys = gbEl("div", "mt-keys"), key = (code, cls, label) => { const b = gbEl("button", "mt-k " + cls); b.dataset.code = code; b.append(document.createTextNode(MT_CHAR[code] || code)); if (label) b.append(gbEl("small", "", label)); return b; };
      if (SMART[tr.kind] && tr.mode !== "notes") {
        const cr = gbEl("div", "mt-row"); chordsOf().forEach((c, i) => { const b = key("Digit" + (i + 1), "", c.name); b.firstChild.textContent = String(i + 1); cr.append(b); }); keys.append(cr);
      }
      if (tr.kind === "drums") {
        const r1 = gbEl("div", "mt-row"), r2 = gbEl("div", "mt-row");
        r1.append(key("KeyW", "mt-b", DRUMNAME(37)));
        MT_WHITE.forEach(c => r2.append(key(c, "mt-w", DRUMNAME(MT_DRUM[c]))));
        keys.append(r1, r2);
      } else {
        const r1 = gbEl("div", "mt-row blk"), r2 = gbEl("div", "mt-row");
        MT_BROW.forEach(c => r1.append(c ? key(c, "mt-b", nname(mtNote(tr, c))) : gbEl("span", "mt-k mt-gap")));
        MT_WHITE.forEach(c => r2.append(key(c, "mt-w", nname(mtNote(tr, c)))));
        keys.append(r1, r2);
      }
      mtEl.append(keys);
      // (the strip plays too, by mouse or touch)
      keys.addEventListener("pointerdown", e => {
        const b = e.target.closest(".mt-k[data-code]"); if (!b) return; e.preventDefault(); const code = b.dataset.code, t2 = curTr(); if (!t2) return;
        if (code.startsWith("Digit")) { chordDown(t2, +code.slice(5) - 1, "m" + e.pointerId, MT.vel); b.classList.add("on"); const up = () => { chordUp("m" + e.pointerId); b.classList.remove("on"); removeEventListener("pointerup", up); }; addEventListener("pointerup", up); return; }
        const m = mtNote(t2, code); if (m == null) return;
        liveOn(t2, m, MT.vel); lit(m, true); b.classList.add("on");
        const up = () => { liveOff(t2, m); lit(m, false); b.classList.remove("on"); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
        addEventListener("pointerup", up); addEventListener("pointercancel", up);
      });
    }
    $("gbTypeBtn").addEventListener("click", () => { MT.on = !MT.on; IDX.typing = MT.on; saveIdx(); mtPaint(); if (S && S.view === "inst") renderInst(); });
    function setView(v) {
      if (v === "inst" && !curTr()) v = "browse";
      if (S.view === "inst" && v !== "inst") { liveAllOff(); apStop(); micMonitor(null, false); if (SREC) sampRecStop(); }
      S.view = v; hideMenu(); V.keys = null; V.meter = null;
      $("gbBrowse").hidden = v !== "browse"; $("gbInst").hidden = v !== "inst"; $("gbTracks").hidden = v !== "tracks";
      if (v !== "tracks") edClose();
      if (v === "browse") renderBrowse(); else if (v === "inst") renderInst(); else renderTracks(true);
      paintBar(); saveSong();
    }

    // ---------- choose an instrument ----------
    function renderBrowse() {
      const box = $("gbCards"); box.replaceChildren();
      ORDER.forEach(k => {
        const K = KIND[k], b = gbEl("button", "gb-card"), off = k === "plugin" && !plugOK();
        b.style.setProperty("--cg", K.cg); b.dataset.kind = k;
        b.innerHTML = '<span class="gi">' + ICON[k] + "</span>";
        b.append(gbEl("b", "", K.name), gbEl("small", "", off ? "Plugins open on the Nate Bloom site and in the apps" : K.sub));
        if (SMART[k]) b.append(gbEl("em", "", "SMART"));
        if (k === "audio") b.append(gbEl("em", "", "MIC"));
        b.disabled = off;
        b.addEventListener("click", () => addTrack(k));
        box.append(b);
      });
      $("gbBrowseSub").textContent = S.tracks.length
        ? "Each one becomes a new track in " + S.name + " (it has " + S.tracks.length + (S.tracks.length === 1 ? " track" : " tracks") + "). Play it, press ● to record."
        : "Each one becomes a track. Play it, press ● to record, then arrange it on the timeline.";
      { const ib = gbEl("button", "gb-card gb-import"); ib.style.setProperty("--cg", "linear-gradient(150deg, #2e5d6b, #10232a)"); ib.dataset.kind = "import";
        ib.innerHTML = '<span class="gi">' + ICON.audio + "</span>"; ib.append(gbEl("b", "", "Import audio"), gbEl("small", "", "WAV, MP3, M4A, AIFF or FLAC files onto new audio tracks, at the playhead"));
        ib.addEventListener("click", () => importPick(null)); box.append(ib); }
      { const mb = gbEl("button", "gb-card gb-import"); mb.style.setProperty("--cg", "linear-gradient(150deg, #5a3d7a, #1d1230)"); mb.dataset.kind = "midi";
        mb.innerHTML = '<span class="gi">' + ICON.keys + "</span>"; mb.append(gbEl("b", "", "Import a MIDI song"), gbEl("small", "", "A .mid file becomes a song: each part on its own track, with a matching sound or your hardware synths"));
        mb.addEventListener("click", () => { try { window.__gbMidi.pick(); } catch (e) {} }); box.append(mb); }
    }
    function addTrack(kind, opt) {
      if (S.tracks.length >= 32) { gbSay("A song holds 32 tracks"); return null; }
      gbDo();
      const n = S.tracks.filter(t => t.kind === kind).length;
      const tr = { id: uid(), kind, name: KIND[kind].name + (n ? " " + (n + 1) : ""), snd: defaultSound(kind), vol: 0.8, pan: 0, mute: false, solo: false, oct: 0, auto: 0, p: null, mode: SMART[kind] ? "chords" : "", regions: [] };
      S.tracks.push(tr); S.sel = S.tracks.length - 1;
      start(); prep(tr); dirty(); saveSong();
      if (!(opt && opt.stay)) setView("inst");
      return tr;
    }

    // ---------- the touch instruments ----------
    const IV = { "": [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6] };
    function chordsOf() {
      const maj = [[4, "m"], [9, "m"], [2, "m"], [7, ""], [0, ""], [5, ""], [10, ""], [11, "dim"]];
      const min = [[0, "m"], [5, "m"], [7, "m"], [8, ""], [3, ""], [10, ""], [2, "dim"], [7, ""]];
      return (S.minor ? min : maj).map(([r, q]) => { const pc = (S.key + r) % 12; return { pc, q, name: NN[pc] + (q === "m" ? "m" : q === "dim" ? "°" : "") }; });
    }
    const G_OPEN = [40, 45, 50, 55, 59, 64], B_OPEN = [28, 33, 38, 43];
    // how each Smart instrument voices a chord: guitar in first position (lowest string the root), bass a line's notes, strings an open voicing
    function voicing(kind, ch) {
      const iv = IV[ch.q], pcs = iv.map(i => (ch.pc + i) % 12);
      if (kind === "guitar") {
        let bs = 0, bf = 99;
        for (let s = 0; s < 3; s++) { const f = ((ch.pc - G_OPEN[s]) % 12 + 12) % 12; if (f < bf) { bf = f; bs = s; } }
        return G_OPEN.map((o, s) => { if (s < bs) return null; if (s === bs) return o + bf; for (let f = 0; f <= 4; f++) if (pcs.includes((o + f) % 12)) return o + f; return null; });
      }
      if (kind === "bass") { const r = 28 + ((ch.pc - 4 + 12) % 12); return [r, r + iv[2], r + 12, r + 12 + iv[1]]; }
      let r = 48 + ch.pc; if (r > 54) r -= 12;
      return [r, r + iv[2], r + 12 + iv[1], r + 12 + iv[2]];
    }
    function renderInst() {
      const tr = curTr(), ih = $("gbIh"), ib = $("gbIb"); if (!tr) return;
      liveAllOff(); apStop(); V.keys = null; V.meter = null;
      if (tr.kind !== "audio") micMonitor(null, false);
      ih.replaceChildren(); ib.replaceChildren();
      const K = KIND[tr.kind];
      const tb = gbEl("button", "gb-trk"); tb.style.setProperty("--kc", K.kc); tb.innerHTML = "<i>" + ICON[tr.kind] + "</i>"; tb.append(gbEl("span", "", tr.name));
      tb.title = "Track settings: name, sound, volume"; tb.addEventListener("click", () => trackSheet(tr)); ih.append(tb);
      if (tr.kind !== "audio") {
        const sb = gbEl("button", "gb-snd"); sb.append(gbEl("b", "", soundName(tr.snd)), gbEl("small", "", tr.kind === "drums" ? "drum kit" : tr.kind === "plugin" ? "plugin" : "sound"));
        sb.title = tr.kind === "drums" ? "Choose a kit" : "Choose a sound"; sb.addEventListener("click", () => soundSheet(tr)); ih.append(sb);
      }
      const ctl = (label) => { const c = gbEl("div", "gb-ctl"); if (label) c.append(gbEl("span", "", label)); ih.append(c); return c; };
      const smart = !!SMART[tr.kind], chords = smart && tr.mode !== "notes";
      if (smart) {
        const c = ctl("");
        [["chords", "Chords"], ["notes", "Notes"]].forEach(([v, t]) => { const b = btnE(t, () => { tr.mode = v; saveSong(); renderInst(); }); b.setAttribute("aria-pressed", String((tr.mode || "chords") === v)); c.append(b); });
      }
      if (chords) {
        const c = ctl("Autoplay");
        ["Off", "1", "2", "3", "4"].forEach((t, i) => { const b = btnE(t, () => { tr.auto = i; saveSong(); apStop(); renderInst(); }, "", "Autoplay " + (i ? "pattern " + i : "off")); b.setAttribute("aria-pressed", String((tr.auto | 0) === i)); c.append(b); });
      }
      if (!chords && tr.kind !== "drums" && tr.kind !== "audio") {
        const c = ctl("Octave"), val = gbEl("span", "gb-val", (tr.oct > 0 ? "+" : "") + (tr.oct | 0));
        c.append(btnE("−", () => { if (tr.oct > -3) { tr.oct--; saveSong(); renderInst(); } }, "", "Octave down"), val, btnE("+", () => { if (tr.oct < 3) { tr.oct++; saveSong(); renderInst(); } }, "", "Octave up"));
      }
      if (["keys", "synth", "plugin", "sampler", "strings"].includes(tr.kind) && !chords) {
        const c = ctl(""), b = btnE("Sustain", () => { if (sustain) sustainOff(); else sustain = true; b.setAttribute("aria-pressed", String(sustain)); });
        b.setAttribute("aria-pressed", String(sustain)); b.title = "Notes ring on after you let go (a sustain pedal does the same)"; c.append(b); V.susBtn = b;
      }
      if (tr.kind !== "drums" && tr.kind !== "audio" && tr.snd !== "sf2" && !(tr.snd || "").startsWith("smp:")) {
        const c = ctl(""), b = btnE(tr.kind === "plugin" || (tr.snd || "").startsWith("wam:") ? "Plugin panel" : "Controls", () => ctlSheet(tr));
        b.title = "Smart Controls: shape this track's sound"; c.append(b);
      }
      const tip = t => ib.append(gbEl("div", "gb-tip", t));
      if (tr.kind === "drums") { tip("Tap the pads: harder in the middle. Computer keyboard: A kick, S snare, D clap, F hat (⌨ shows the rest)."); padsUI(ib, tr); }
      else if (chords) { tip(tr.auto ? "Autoplay " + tr.auto + ": tap a chord to start the pattern in time, tap another to change, tap it again to stop. Keys 1–8 play the chords." : tr.kind === "guitar" ? "Tap a chord name to strum it, tap the strings one at a time, or drag across them to strum. Keys 1–8 play the chords." : "Touch a chord to play it, or the boxes below it for single notes. Keys 1–8 play the chords."); stripsUI(ib, tr); }
      else if (smart && tr.kind !== "strings") { tip("Tap a fret to play a note, slide along a string to glide. The left column is the open string."); fretUI(ib, tr); }
      else if (tr.kind === "sampler") samplerUI(ib, tr);
      else if (tr.kind === "audio") audioUI(ib, tr);
      else { tip("Play lower on a key for a louder note, slide across the keys to glide. Computer keyboard: A is middle C, the home row the white keys, W E T Y U O P the black ones, Z X change octave (⌨ shows them)."); keyboardUI(ib, tr); }
      paintBar();
    }
    // a keyboard: multi-touch, glide, velocity from where the key is struck
    function keyboardUI(box, tr) {
      const kb = gbEl("div", "gb-kb"); box.append(kb);
      const w = box.clientWidth || innerWidth, nW = clamp(Math.floor(w / (isPhone() ? 40 : 52)), 7, 24);
      const lo = 48 + 12 * (tr.oct | 0), whites = [], keys = new Map();
      for (let m = lo; whites.length < nW; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      whites.forEach(m => { const k = gbEl("div", "gb-kw", m % 12 === 0 ? nname(m) : ""); k.dataset.m = m; kb.append(k); keys.set(m, k); });
      const bw = 100 / nW * 0.62;
      whites.forEach((m, i) => {
        if (i === whites.length - 1 || ![0, 2, 5, 7, 9].includes(m % 12)) return;
        const k = gbEl("div", "gb-kbk"); k.dataset.m = m + 1; k.style.left = ((i + 1) * 100 / nW - bw / 2) + "%"; k.style.width = bw + "%"; kb.append(k); keys.set(m + 1, k);
      });
      V.keys = keys;
      if (MT.on) MT_ALL.forEach(code => { const m = mtNote(tr, code), k = m != null && keys.get(m); if (k) k.append(gbEl("span", "gb-kl", MT_CHAR[code])); });
      touchPlay(kb, tr, el => el.closest("[data-m]"), (el, y) => { const r = el.getBoundingClientRect(); return clamp(0.35 + 0.65 * (y - r.top) / Math.max(1, r.height), 0.25, 1); });
    }
    // the pointer handling shared by the keyboard and the fretboard: each finger plays one note and glides
    function touchPlay(surface, tr, keyOf, velOf) {
      const act = new Map(), held = m => [...act.values()].some(x => x.m === m);
      const at = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const k = el && keyOf(el); return k && surface.contains(k) ? k : null; };
      const on = (k, e) => { const m = +k.dataset.m; act.set(e.pointerId, { m, k }); k.classList.add("on"); liveOn(tr, m, velOf(k, e.clientY)); };
      const off = id => { const a = act.get(id); if (!a) return; act.delete(id); if (!held(a.m)) { a.k.classList.remove("on"); liveOff(tr, a.m); } };
      surface.addEventListener("pointerdown", e => { e.preventDefault(); try { surface.setPointerCapture(e.pointerId); } catch (x) {} const k = at(e); if (k) on(k, e); });
      surface.addEventListener("pointermove", e => {
        const a = act.get(e.pointerId); if (!a) return;
        const k = at(e); if (k === a.k) return;
        off(e.pointerId); if (k) on(k, e);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => surface.addEventListener(ev, e => off(e.pointerId)));
    }
    function padsUI(box, tr) {
      const g = gbEl("div", "gb-pads"); box.append(g);
      const keys = new Map();
      kitPads((tr.snd || "kit:studio").slice(4)).forEach((p, i) => {
        const d = gbEl("div", "gb-pad" + (p.id ? "" : " dim")); d.dataset.m = p.m; d.style.setProperty("--pc", PADCOL[p.m]);
        d.append(gbEl("span", "", p.name)); { const code = Object.keys(MT_DRUM).find(c => MT_DRUM[c] === p.m); if (MT.on && code) d.append(gbEl("i", "", MT_CHAR[code])); }
        g.append(d); keys.set(p.m, d);
      });
      V.keys = keys;
      g.addEventListener("pointerdown", e => {
        const d = e.target.closest(".gb-pad"); if (!d) return; e.preventDefault();
        const r = d.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
        const m = +d.dataset.m; liveOn(tr, m, clamp(1 - Math.hypot(dx, dy) * 0.9, 0.35, 1)); lit(m, true);
      });
    }
    // the chord strips of Smart Bass, Guitar and Strings
    const CHP = new Map();   // finger (or key) -> the notes it holds
    function chordNotes(tr, ci) { const ch = chordsOf()[ci]; return ch ? voicing(tr.kind, ch) : []; }
    function chordDown(tr, ci, who, vel = 0.85) {
      if ((tr.auto | 0) && tr.mode !== "notes") { apLatch(tr, ci); return; }
      chordUp(who);
      const vo = chordNotes(tr, ci).filter(m => m != null), notes = tr.kind === "bass" ? [vo[0]] : vo;
      notes.forEach((m, j) => liveOn(tr, m, vel * (tr.kind === "guitar" ? 0.9 : 0.8), tr.kind === "guitar" ? j * 0.013 : 0));
      CHP.set(who, { tr: tr.id, notes: new Set(notes), ci });
      paintStrips();
    }
    function chordUp(who) {
      const h = CHP.get(who); if (!h) return; CHP.delete(who);
      const tr = trById(h.tr);
      if (tr) h.notes.forEach(m => { if (![...CHP.values()].some(x => x.tr === h.tr && x.notes.has(m))) liveOff(tr, m); });
      paintStrips();
    }
    function paintStrips() {
      document.querySelectorAll("#gbIb .gb-chord").forEach(el => {
        const ci = +el.dataset.ci;
        el.classList.toggle("on", [...CHP.values()].some(h => h.ci === ci && h.chord));
        el.classList.toggle("auto", AP.ci === ci && AP.tr === (curTr() || {}).id);
      });
    }
    function stripsUI(box, tr) {
      const g = gbEl("div", "gb-strips"); box.append(g);
      const nseg = tr.kind === "guitar" ? 6 : 4, CH = chordsOf();
      CH.forEach((ch, ci) => {
        const col = gbEl("div", "gb-strip"), vo = voicing(tr.kind, ch);
        const lab = gbEl("div", "gb-chord", ch.name); lab.dataset.ci = ci; if (MT.on) lab.append(gbEl("sup", "", String(ci + 1))); col.append(lab);
        for (let s = 0; s < nseg; s++) {
          const j = tr.kind === "guitar" ? s : nseg - 1 - s, m = vo[j];
          const sg = gbEl("div", "gb-seg" + (m == null ? " mute" : ""), m == null ? "×" : nname(m).replace(/-?\d+$/, "")); sg.dataset.ci = ci; sg.dataset.j = j;
          col.append(sg);
        }
        g.append(col);
      });
      const segAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && g.contains(el) ? el.closest(".gb-seg, .gb-chord") : null; };
      const fingers = new Map();
      const segOn = (f, sg) => {
        const ci = +sg.dataset.ci, m = chordNotes(tr, ci)[+sg.dataset.j]; if (m == null) return;
        const keepRing = tr.kind === "guitar";
        if (!keepRing) fingers.get(f).notes.forEach(n => { if (n !== m) liveOff(tr, n); });
        if (!keepRing) fingers.get(f).notes.clear();
        liveOn(tr, m, 0.8); fingers.get(f).notes.add(m); sg.classList.add("on"); setTimeout(() => sg.classList.remove("on"), 140);
      };
      g.addEventListener("pointerdown", e => {
        const el = e.target.closest && e.target.closest(".gb-seg, .gb-chord"); if (!el) return; e.preventDefault(); try { g.setPointerCapture(e.pointerId); } catch (x) {}
        start();
        if (el.classList.contains("gb-chord")) {
          const ci = +el.dataset.ci;
          chordDown(tr, ci, "p" + e.pointerId);
          const h = CHP.get("p" + e.pointerId); if (h) h.chord = true;
          paintStrips(); return;
        }
        if ((tr.auto | 0)) { apLatch(tr, +el.dataset.ci); return; }
        fingers.set(e.pointerId, { notes: new Set(), last: el }); segOn(e.pointerId, el);
      });
      g.addEventListener("pointermove", e => {
        const f = fingers.get(e.pointerId); if (!f) return;
        const el = segAt(e); if (!el || el === f.last || !el.classList.contains("gb-seg")) return;
        f.last = el; segOn(e.pointerId, el);   // (dragging across the strings strums them)
      });
      const up = e => {
        chordUp("p" + e.pointerId);
        const f = fingers.get(e.pointerId); if (!f) return; fingers.delete(e.pointerId);
        f.notes.forEach(m => liveOff(tr, m));
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => g.addEventListener(ev, up));
      paintStrips();
    }
    // a fretboard for Smart Guitar and Smart Bass in Notes: thickest string at the top, as you look down at it
    function fretUI(box, tr) {
      const OPEN = tr.kind === "bass" ? B_OPEN : G_OPEN, nf = clamp(Math.floor((box.clientWidth || innerWidth) / (isPhone() ? 50 : 62)), 6, 15);
      const fb = gbEl("div", "gb-fb"); fb.style.gridTemplateRows = "repeat(" + OPEN.length + ", 1fr)";
      const keys = new Map(), mid = Math.floor(OPEN.length / 2);
      OPEN.forEach((o, s) => {
        const row = gbEl("div", "gb-fs"); row.style.gridTemplateColumns = "0.8fr repeat(" + (nf - 1) + ", 1fr)"; row.style.setProperty("--sw", (OPEN.length - s + 1) * 0.55 + 1 + "px");
        for (let f = 0; f < nf; f++) {
          const m = o + f + 12 * (tr.oct | 0), c = gbEl("div", "gb-fr" + ((s === mid && [3, 5, 7, 9, 12, 15].includes(f)) ? " dot" : ""), f === 0 || m % 12 === 0 ? nname(m) : "");
          c.dataset.m = m; row.append(c); if (!keys.has(m)) keys.set(m, c);
        }
        fb.append(row);
      });
      box.append(fb); V.keys = keys;
      touchPlay(fb, tr, el => el.closest(".gb-fr"), () => 0.8);
    }
    // the sampler: pick a slot, record or load a sound into it, play it across the keys
    let SREC = null;
    function samplerUI(box, tr) {
      const slots = gbEl("div", "gb-slots"), cur = +(tr.snd || "smp:0").slice(4);
      for (let i = 0; i < NSLOTS; i++) {
        const b = btnE("S" + (i + 1) + (sampBuf[i] ? " · " + baseName(state.samp.slots[i].name || "sample") : ""), () => { tr.snd = "smp:" + i; saveSong(); renderInst(); });
        b.setAttribute("aria-pressed", String(cur === i)); b.title = sampBuf[i] ? baseName(state.samp.slots[i].name || "sample") : "empty"; slots.append(b);
      }
      box.append(slots);
      const row = gbEl("div", "gb-row3");
      const rec = btnE(SREC ? "■ Stop" : "● Record a sample", () => sampRec(tr, rec)); if (SREC) rec.classList.add("rec");
      rec.title = "Record from the microphone into S" + (cur + 1) + " (up to 20 seconds)";
      const load = btnE("Load a sound file…", () => {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aif,.aiff";
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return; start();
          try { const ab = await f.arrayBuffer(), buf = await decode(ab.slice(0)); setSample(cur, buf, f.name); storeSample(cur, f.name, ab); gbSay(baseName(f.name) + " is in S" + (cur + 1)); renderInst(); }
          catch (e) { gbSay("Couldn't open that file as audio"); }
        };
        inp.click();
      });
      row.append(rec, load); box.append(row);
      box.append(gbEl("div", "gb-tip", sampBuf[cur] ? "S" + (cur + 1) + " plays across the keys: middle C is the sound as recorded." : "S" + (cur + 1) + " is empty: record or load a sound, then play it on the keys."));
      keyboardUI(box, tr);
    }
    async function sampRec(tr, btn) {
      if (SREC) { sampRecStop(); return; }
      if (!(await micOpen())) return;
      const i = +(tr.snd || "smp:0").slice(4), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
      const chunks = [];
      proc.onaudioprocess = e => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); if (chunks.length * 4096 > ctx.sampleRate * 20) sampRecStop(); };
      MIC.src.connect(proc); proc.connect(mute).connect(ctx.destination);
      SREC = { proc, mute, chunks, i };
      if (btn) { btn.textContent = "■ Stop"; btn.classList.add("rec"); }
    }
    function sampRecStop() {
      const R = SREC; SREC = null; if (!R) return;
      try { MIC.src.disconnect(R.proc); } catch (e) {} try { R.proc.disconnect(); R.mute.disconnect(); } catch (e) {}
      const n = R.chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(n); let o = 0; R.chunks.forEach(c => { all.set(c, o); o += c.length; });
      let a = 0, b = n; while (a < n && Math.abs(all[a]) < 0.012) a++; while (b > a && Math.abs(all[b - 1]) < 0.008) b--;
      a = Math.max(0, a - 256);
      if (b - a < ctx.sampleRate * 0.05) { gbSay("Nothing was recorded: is the microphone on?"); if (V.open && S.view === "inst") renderInst(); return; }
      const buf = ctx.createBuffer(1, b - a, ctx.sampleRate); buf.getChannelData(0).set(all.subarray(a, b));
      const nm = "Garage recording";
      setSample(R.i, buf, nm); storeSample(R.i, nm, bufferToWav(buf));
      gbSay("Recorded " + buf.duration.toFixed(1) + " s into S" + (R.i + 1) + ": play it on the keys");
      if (V.open && S.view === "inst") renderInst();
    }
    function audioUI(box, tr) {
      if (tr.input === "nb") { nbUI(box, tr); return; }
      const w = gbEl("div", "gb-audio");
      w.append(inSw(tr));
      w.append(gbEl("div", "big", MIC.src ? "Microphone on" : "Audio Recorder"));
      w.append(gbEl("div", "gb-tip", "Press ● in the top bar to record. The take lands on this track at the playhead, lined up with what was playing. Use headphones, so the mic doesn't pick up the other tracks."));
      const m = gbEl("div", "gb-meter"); m.innerHTML = "<i></i>"; w.append(m); V.meter = m.firstChild;
      const row = gbEl("div", "gb-row3");
      if (!MIC.src) row.append(btnE("Turn the microphone on", async () => { if (await micOpen()) renderInst(); }, "primary"));
      const mon = btnE("Monitor", () => { tr.mon = !tr.mon; micMonitor(tr, tr.mon && !!MIC.src); mon.setAttribute("aria-pressed", String(!!tr.mon)); saveSong(); });
      mon.setAttribute("aria-pressed", String(!!tr.mon)); mon.title = "Hear the microphone through this track (use headphones)";
      row.append(mon); w.append(row);
      const takes = tr.regions.length; w.append(gbEl("div", "gb-tip", takes ? takes + (takes === 1 ? " take" : " takes") + " on this track: see them on the timeline (◫ Tracks)." : "No takes yet."));
      w.append(btnE("Import an audio file…", () => importPick(tr)));
      box.append(w);
      if (MIC.src) micMonitor(tr, !!tr.mon);
    }
    function meter() {
      if (!V.meter) return;
      if (!MIC.an) { V.meter.style.width = "0"; return; }
      const a = V.mbuf || (V.mbuf = new Float32Array(MIC.an.fftSize)); MIC.an.getFloatTimeDomainData(a);
      let pk = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > pk) pk = v; }
      const db = pk > 0 ? 20 * Math.log10(pk) : -60; V.meter.style.width = clamp((db + 54) / 54 * 100, 0, 100) + "%";
    }
    // ---------- Autoplay: patterns that play the chord you pick, in time with the song ----------
    const AP = { ci: -1, tr: "", timer: 0, t0: 0, b0: 0, next: 0 };
    function apPattern(tr, pat, kb) {
      // events in one beat: o = offset (beats), n = which notes, d = length (beats), v = level, st = strum (s between strings)
      const sig = S.sig;
      if (tr.kind === "guitar") {
        const D = (o, d, v) => ({ o, n: "D", d, v, st: 0.012 }), U = (o, d, v) => ({ o, n: "U", d, v, st: 0.01 });
        if (pat === 1) return [D(0, 1, 0.8)];
        if (pat === 2) return [D(0, 0.5, 0.85), U(0.5, 0.5, 0.58)];
        if (pat === 3) return kb % 2 === 0 ? [{ o: 0, n: "b", d: 1.5, v: 0.8 }, { o: 0.5, n: "s3", d: 1, v: 0.6 }] : [{ o: 0, n: "s4", d: 1, v: 0.6 }, { o: 0.5, n: "s5", d: 1, v: 0.62 }];
        return [D(0, 0.2, 0.9), U(0.25, 0.14, 0.45), D(0.5, 0.2, 0.72), U(0.75, 0.14, 0.52)];
      }
      if (tr.kind === "bass") {
        const B = (o, n, d, v) => ({ o, n: [n], d, v });
        if (pat === 1) return [B(0, 0, 0.9, 0.85)];
        if (pat === 2) return [B(0, 0, 0.45, 0.85), B(0.5, 2, 0.45, 0.7)];
        if (pat === 3) return [B(0, [0, 1, 2, 1][kb % 4], 0.9, 0.8)];
        return [[B(0, 0, 0.7, 0.9), B(0.75, 0, 0.2, 0.6)], [B(0.5, 2, 0.4, 0.7)], [B(0, 1, 0.7, 0.8)], [B(0.5, 0, 0.25, 0.7), B(0.75, 3, 0.2, 0.6)]][kb % 4];
      }
      const A = (o, d, v) => ({ o, n: "all", d, v });
      if (pat === 1) return kb === 0 ? [A(0, sig - 0.06, 0.7)] : [];
      if (pat === 2) return kb % 2 === 0 ? [A(0, Math.min(2, sig - kb) - 0.06, 0.7)] : [];
      if (pat === 3) return [A(0, 0.32, 0.66), A(0.5, 0.32, 0.55)];
      return [{ o: 0, n: [(2 * kb) % 4], d: 0.5, v: 0.64 }, { o: 0.5, n: [(2 * kb + 1) % 4], d: 0.5, v: 0.6 }];
    }
    function apNotes(tr, vo, n) {
      const pl = vo.filter(m => m != null);
      if (n === "D" || n === "all") return pl;
      if (n === "U") return pl.slice(-4).reverse();
      if (n === "b") return pl.slice(0, 1);
      if (/^s\d$/.test(n)) { const k = pl.length - (6 - +n[1]); return pl[clamp(k, 0, pl.length - 1)] != null ? [pl[clamp(k, 0, pl.length - 1)]] : []; }
      return n.map(i => vo[i]).filter(m => m != null);
    }
    function apSched(b1, b2, toT) {
      const tr = trById(AP.tr); if (!tr || AP.ci < 0 || !(tr.auto | 0)) return;
      const vo = chordNotes(tr, AP.ci);
      for (let k = Math.floor(b1 + 1e-9) - 1; k < b2; k++) {
        if (k < 0) continue;
        apPattern(tr, tr.auto | 0, ((k % S.sig) + S.sig) % S.sig).forEach(ev => {
          const eb = k + ev.o; if (eb < b1 - 1e-9 || eb >= b2 - 1e-9) return;
          apNotes(tr, vo, ev.n).forEach((m, j) => {
            const dt = (ev.st || 0) * j;
            if (tLevel(tr) > 0) playAt(tr, m, toT(eb) + dt, ev.d * spb(), ev.v);
            if (TP.on) recNote(tr, m, eb + dt / spb(), ev.d, ev.v);
          });
        });
      }
    }
    function apTick(b1, b2) {
      if (AP.timer) { clearInterval(AP.timer); AP.timer = 0; }   // (the song's clock takes over)
      if (AP.ci >= 0) apSched(b1, b2, timeAt);
    }
    function apFree() {
      if (TP.on || !ctx) { if (AP.timer) { clearInterval(AP.timer); AP.timer = 0; } return; }
      const horizon = ctx.currentTime + 0.12, bEnd = AP.b0 + (horizon - AP.t0) / spb();
      if (bEnd > AP.next) { apSched(AP.next, bEnd, b => AP.t0 + (b - AP.b0) * spb()); AP.next = bEnd; }
      releaseDue(horizon);
    }
    function apRun() { if (TP.on || AP.timer || !ctx) return; AP.t0 = ctx.currentTime + 0.03; AP.b0 = 0; AP.next = 0; AP.timer = setInterval(apFree, 25); apFree(); }
    function apLatch(tr, ci) {
      start(); if (!ctx) return;
      if (AP.ci === ci && AP.tr === tr.id) { apStop(); return; }
      AP.ci = ci; AP.tr = tr.id; apRun(); paintStrips();
    }
    function apStop() { AP.ci = -1; if (AP.timer) { clearInterval(AP.timer); AP.timer = 0; } paintStrips(); }
    function apAfterStop() { if (AP.ci >= 0) apRun(); }

