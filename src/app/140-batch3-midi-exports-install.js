  // ======================================================================
  // BETA · Batch 3: MIDI (clock, notes in/out), exports (stems, MIDI file,
  // K.O. II pads), app install
  // ======================================================================

  // ---------- multi-file zip (store only) ----------
  function zipMany(files) {
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const nm = new TextEncoder().encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(12, 33, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(14, 33, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true); cd.setUint16(28, nm.length, true); cd.setUint32(42, off, true);
      parts.push(lh, nm, f.data); central.push(cd, nm); off += 30 + nm.length + size;
    }
    const cdSize = central.reduce((a, x) => a + (x.byteLength || x.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }
  async function saveZip(name, blob) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name + ".zip", data: blob }); return "Saved " + name + ".zip"; }
      catch (e) { if (e && e.code === "declined") return ""; return e && e.code === "too_large" ? "Too large to save here; use the hosted version." : "Couldn't save here. Try again."; }
    }
    const file = new File([blob], name + ".zip", { type: "application/zip" });
    try { if (nbShareFiles(file)) { await navigator.share({ files: [file], title: name }); return "Shared " + file.name; } } catch (e) { if (e && e.name === "AbortError") return ""; }
    const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return "Saved " + file.name;
  }
  const safeName = s => (s || "sound").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 40) || "sound";

  // ---------- Exports ----------
  const exEl = document.getElementById("exports"), exInfo = document.getElementById("exInfo");
  async function exportStems() {
    if (window.__gb && __gb.audioStems) {
      exInfo.textContent = "Rendering the Garage's audio tracks…";
      const st = await __gb.audioStems();
      if (!st.length) { exInfo.textContent = "The Garage song has no audio tracks yet: record or import some first."; return; }
      const files = st.map((x, i) => ({ name: String(i + 1).padStart(2, "0") + " " + safeName(x.name) + ".wav", data: new Uint8Array(wavOf(x.buf)) }));
      exInfo.textContent = (await saveZip(takeName() + "-stems", zipMany(files))) + " · every stem starts at 0:00, so they line up in Bitwig";
      return;
    }
    await trkLoad();
    const used = T.tracks.filter(t => T.clips.some(c => c.track === t.id));
    if (!used.length) { exInfo.textContent = "Tracks is empty: record or import something there first."; return; }
    exInfo.textContent = "Rendering " + used.length + " stems…";
    const end = projectEnd(), rate = (ctx && ctx.sampleRate) || 44100, files = [];
    const keep = T.tracks.map(t => ({ t, mute: t.mute, solo: t.solo }));
    try {
      for (let i = 0; i < used.length; i++) {
        T.tracks.forEach(t => { t.solo = t === used[i]; t.mute = false; });
        const oc = new OfflineAudioContext(2, Math.ceil((end + 0.05) * rate), rate);
        scheduleClips(oc, oc.destination, 0, 0, null);
        const buf = await oc.startRendering();
        files.push({ name: String(i + 1).padStart(2, "0") + " " + safeName(used[i].name) + ".wav", data: new Uint8Array(wavOf(buf)) });
        exInfo.textContent = "Rendered " + (i + 1) + " of " + used.length + "…";
      }
    } finally { keep.forEach(k => { k.t.mute = k.mute; k.t.solo = k.solo; }); }
    exInfo.textContent = (await saveZip(takeName() + "-stems", zipMany(files))) + " · every stem starts at 0:00, so they line up in Bitwig";
  }
  // Standard MIDI file: melody, SY row and drums, at the current tempo and time signature
  function midiFile() {
    const PPQ = 480, step = PPQ / 4, st = stepsNow(), S = SC();
    const bars = Math.max(1, S.notes.some(n => n.b < S.bars) ? S.bars : 1);
    const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const track = (events, name) => {
      events.sort((a, b) => a[0] - b[0] || (a[1][0] & 0xf0) - (b[1][0] & 0xf0));
      const nm = new TextEncoder().encode(name), out = [0, 0xff, 0x03, ...vlq(nm.length), ...nm];
      let last = 0; for (const [t, bytes] of events) { out.push(...vlq(t - last), ...bytes); last = t; }
      out.push(0, 0xff, 0x2f, 0);
      return [0x4d, 0x54, 0x72, 0x6b, (out.length >>> 24) & 255, (out.length >>> 16) & 255, (out.length >>> 8) & 255, out.length & 255, ...out];
    };
    const [num, den] = (state.seq.meter.match(/^(\d+)\/(\d+)/) || [0, 4, 4]).slice(1).map(Number);
    const us = Math.round(60000000 / state.seq.bpm);
    const meta = track([[0, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]], [0, [0xff, 0x58, 4, num, Math.log2(den), 24, 8]]], "Nate Bloom");
    const mel = [];
    S.notes.filter(n => n.b < S.bars && n.s < st).forEach(n => { const t = (n.b * st + n.s) * step; mel.push([t, [0x90, n.m, n.v || 96]], [t + Math.max(1, n.d * step - 10), [0x80, n.m, 0]]); });
    const sy = [], drums = [];
    const GM = { kick: 36, snare: 38, clap: 39, ch: 42, oh: 46, tom: 45, rim: 37, cow: 56 };
    for (let b = 0; b < bars; b++) for (let s = 0; s < st; s++) {
      const t = (b * st + s) * step, d = state.seq.synth[s];
      if (d != null) { const m = BASE + degToSemis(d) + state.octave * 12; sy.push([t, [0x91, m, 96]], [t + step - 10, [0x81, m, 0]]); }
      for (const [id] of DRUMS) if (state.seq.rows[id][s]) {
        const r = stepRat(id, s), p = stepProb(id, s);
        for (let k = 0; k < r; k++) { const tt = t + Math.round(k * step / r); drums.push([tt, [0x99, GM[id], p < 100 ? Math.max(30, Math.round(110 * p / 100)) : 110]], [tt + 30, [0x89, GM[id], 0]]); }
      }
    }
    const tracks = [meta, track(mel, "Melody (Notes)"), track(sy, "SY row"), track(drums, "Drums (GM, ch 10)")].concat(midiExtra(track, step));
    const hdr = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return new Uint8Array([...hdr, ...tracks.flat()]);
  }
  async function exportMidi() {
    exInfo.textContent = await saveZip(takeName() + "-midi", zipMany([{ name: takeName() + ".mid", data: midiFile() }])) + " · melody, SY row, drums, Rhythm Creator and Beat Pads on separate tracks";
  }
  function monoWav(buf) {
    const n = buf.length, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab), str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
    const out = new Int16Array(ab, 44), chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    for (let i = 0; i < n; i++) { let s = 0; for (const d of chs) s += d[i]; s /= chs.length; out[i] = Math.max(-1, Math.min(1, s)) * 32767; }
    return new Uint8Array(ab);
  }
  async function exportPads() {
    const files = [];
    for (let k = 0; k < NPADS; k++) if (padBuf[k]) files.push({ name: String(k + 1).padStart(2, "0") + " " + safeName(baseName(state.pads.names[k])) + ".wav", data: monoWav(padBuf[k]) });
    for (let i = 0; i < NSLOTS; i++) if (sampBuf[i] && document.getElementById("exSlots").checked) files.push({ name: "S" + (i + 1) + " " + safeName(baseName(state.samp.slots[i].name)) + ".wav", data: monoWav(sampBuf[i]) });
    if (!files.length) { exInfo.textContent = "No pads loaded yet. Load or chop samples into Pads first."; return; }
    exInfo.textContent = (await saveZip("nate-bloom-pads", zipMany(files))) + " · " + files.length + " mono WAVs, numbered for the K.O. II sample tool";
  }
  document.getElementById("exStems").addEventListener("click", () => exportStems().catch(e => { exInfo.textContent = "Couldn't export: " + e.message; }));
  document.getElementById("exMidi").addEventListener("click", () => exportMidi().catch(e => { exInfo.textContent = "Couldn't export: " + e.message; }));
  document.getElementById("exPads").addEventListener("click", () => exportPads().catch(e => { exInfo.textContent = "Couldn't export: " + e.message; }));
  document.getElementById("exBtn").addEventListener("click", () => { exEl.hidden = false; exInfo.textContent = "Files to take into Bitwig or onto the K.O. II."; });
  document.getElementById("exDone").addEventListener("click", () => { exEl.hidden = true; });

  // ---------- MIDI ----------
  const mdEl = document.getElementById("midiSheet"), mdInfo = document.getElementById("mdInfo"), mdPorts = document.getElementById("mdPorts");
  const md = { access: null, opt: { noteIn: true, clockOut: false, clockIn: false, notesOut: false, keysOut: false, drumsOut: false, ch: 1, lat: 0, padsIn: true }, outs: new Set(), ins: new Set(), clk: [], lastBpmSet: 0, sounding: new Set() };
  try { Object.assign(md.opt, JSON.parse(localStorage.getItem("nightbloom-midi") || "{}")); } catch (e) {}
  const saveMd = () => { try { localStorage.setItem("nightbloom-midi", JSON.stringify(md.opt)); } catch (e) {} };
  const perfAt = t => performance.now() + Math.max(0, (t - ctx.currentTime) * 1000 + mdLatMs());
  // what's sent goes out when the sound it belongs to reaches the speaker: the tablet's audio delay plus the nudge
  function mdLatMs() { const a = ctx ? ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000 : 0; return Math.max(-50, Math.min(450, a + (+md.opt.lat || 0))); }
  const outPorts = () => md.access ? [...md.access.outputs.values()].filter(o => md.outs.has(o.id)) : [];
  // clock, start and stop go only to the outputs that should get them (136): your pick in the MIDI sheet; otherwise
  // the K.O. II when it's plugged in, every output when it isn't. Notes go to every output as before.
  const send = (bytes, at) => (bytes.length === 1 && bytes[0] >= 0xf8 ? mdClockPorts() : outPorts()).forEach(o => { try { o.send(bytes, at); } catch (e) {} });
  function mdIsKO(p) { return /k\.?\s?o\.?\s?ii|ep-?133/i.test((p && p.name) || ""); }
  function mdClockTo(o) {
    const m = md.opt.clockTo || {}, k = mdKey("out", o);
    if (Object.prototype.hasOwnProperty.call(m, k)) return !!m[k];
    return outPorts().some(mdIsKO) ? mdIsKO(o) : true;
  }
  function mdClockPorts() { return outPorts().filter(mdClockTo); }
  // (159) which inputs play the keys: a keyboard does; the K.O. II doesn't unless you say so, because its sequencer
  // sends every pad hit as a note and that would play the synth stack. Its pads still reach Beat Pads, the Rhythm
  // Creator and the Garage, and its clock still counts.
  function mdKeysFrom(p) {
    if (!p) return true;
    const m = md.opt.keysFrom || {}, k = mdKey("in", p);
    if (Object.prototype.hasOwnProperty.call(m, k)) return !!m[k];
    return !mdIsKO(p) && !/minilogue/i.test(p.name || "") && !(window.__hw && window.__hw.isSynthIn && window.__hw.isSynthIn(p));   // (173) the Minilogue's keys play the Minilogue (187: any known hardware synth's do); Keys ✓ makes them play the stack too
  }
  // how hard you play → how loud: 100 plays as the screen does, 127 a little louder
  const MD_VEL = { off: 0, light: 0.7, normal: 1.3, firm: 2 };
  function mdVelGain(v) { const k = MD_VEL[md.opt.vel || "normal"]; return k ? Math.min(1.3, Math.pow(Math.max(1, v) / 100, k)) : 1; }
  // (184) which sound each controller plays: what's playing (the stack, as before), nothing (pads, clock and learned
  // knobs only), or one sound of its own (a synth, a library sound or plugin, the instrument, a sampler slot, the
  // hardware synth), whatever the rest of the stack is. Several controllers can play the same sound. A controller
  // that plays a plugin also sends it its knobs, wheels and pressure, so the plugin's own MIDI learn takes them.
  function mdOwnPort(p) { return /\bNate Bloom (in|out|send)\b/i.test((p && p.name) || ""); }   // (187: the app's own ALSA ports, nb_bridge.cc)
  function mdRoute(p) {
    const r = (md.opt.routes || {})[mdKey("in", p)];
    if (r) return r;
    return mdKeysFrom(p) ? "stack" : "none";
  }
  function mdRouteSet(p, r) {
    md.opt.routes = Object.assign({}, md.opt.routes, { [mdKey("in", p)]: r });
    md.opt.keysFrom = Object.assign({}, md.opt.keysFrom, { [mdKey("in", p)]: r !== "none" });
    saveMd();
  }
  const libIdx = id => state.lib.parts.findIndex((pt, i) => pt && pt.id === id && libInsts[i]);
  function mdRouteOptions() {
    const o = [["stack", "What's playing"], ["none", "Nothing (pads, clock, knobs)"]];
    Object.keys(ENGINES).forEach(id => { if (id !== "fm" || (typeof betaOn !== "undefined" && betaOn)) o.push(["e:" + id, ENGINES[id].short || ENGINES[id].name]); });
    state.lib.parts.forEach((pt, i) => { if (pt && pt.id && libInsts[i]) o.push(["l:" + pt.id, pt.name || "Library sound " + (i + 1)]); });
    if (curInst) o.push(["inst", "Instrument · " + (curInst.name || "")]);
    for (let i = 0; i < NSLOTS; i++) if (sampBuf[i]) o.push(["s:" + i, "Sampler S" + (i + 1) + " · " + baseName(state.samp.slots[i].name).slice(0, 20)]);
    if (window.__hw && window.__hw.shown && window.__hw.shown()) o.push(["hw", window.__hw.name]);
    if (window.__hwx) window.__hwx.all().filter(X => X.shown()).forEach(X => o.push(["hwx:" + X.id, X.name]));   // (219)
    return o;
  }
  function mdRouteVoices(r, m, scale, when) {
    const out = [];
    try {
      if (r.startsWith("e:")) { const id = r.slice(2); if (ENGINES[id]) { const v = makeVoice(m, id, ((state.layers[id] && state.layers[id].level) || 0.8) * 1.25 * scale, when); if (v) out.push(v); } }
      else if (r.startsWith("l:")) { const i = libIdx(r.slice(2)); if (i >= 0) { const pt = state.lib.parts[i]; if (m >= (pt.lo ?? 0) && m <= (pt.hi ?? 127)) { const P = pt.sus ? Object.assign({}, state.lib.p, { decay: 1 }) : state.lib.p, k0 = LVK; LVK = "l:" + i; try { const v = makeInstVoice(m + 12 * (pt.oct || 0), when, scale * 0.8 * 1.25, libInsts[i], P); if (v) out.push(v); } finally { LVK = k0; } } } }
      else if (r === "inst") { const v = makeInstVoice(m, when, scale); if (v) out.push(v); }
      else if (r.startsWith("s:")) { const v = makeSampleVoice(m, +r.slice(2), when, scale); if (v) out.push(v); }
      else if (r === "hw" && window.__hw) { const v = window.__hw.voice(m, when); if (v) out.push(v); }
      else if (r.startsWith("hwx:") && window.__hwx) { const X = window.__hwx.get(r.slice(4)); const v = X && X.voice(m, when); if (v) out.push(v); }
      else if (r === "stack") { (melodicVoices(m, when, scale) || []).forEach(v => { if (v) out.push(v); }); }   // (187: a bridge playing what's playing)
    } catch (er) {}
    return out;
  }
  const MDR = { v: new Map(), sus: new Map() };   // (port:ch:note → its voices; the port's sustain pedal and the notes it holds)
  // the plugins a controller plays (in the Linux app): the one its route names, or every plugin in the stack
  function mdRoutePlugs(r) {
    const PLm = window.__nbPlug; if (!PLm || !PLm.live || !PLm.live.size) return [];
    const keys = new Set();
    if (r === "stack") state.lib.parts.forEach((pt, i) => { if (pt && pt.on && pt.id && libInsts[i] && pt.id.startsWith("wam:") && (!window.__nbCtl || window.__nbCtl.allows("l:" + pt.id, window.__nbSrc, window.__nbSrcStack))) keys.add(pt.id.slice(4)); });   // (185: only the ones this controller plays)
    else if (r.startsWith("l:") && r.slice(2).startsWith("wam:")) keys.add(r.slice(6));
    return [...PLm.live.values()].filter(P => !P.fx && keys.has(P.key));
  }
  function mdToPlugs(r, bytes) {
    const ps = mdRoutePlugs(r); if (!ps.length) return false;
    ps.forEach(P => { try { P.node.scheduleEvents({ type: "wam-midi", time: P.ctx.currentTime, data: { bytes } }); } catch (er) {} });
    return true;
  }
  function onMidi(e) {
    if (!md.ins.has(e.target.id)) return;
    if (window.__midiTap && window.__midiTap(e)) return;   // (box: a sheet that borrows a fader, e.g. Jam along's backing level)
    const [st, d1, d2] = e.data, cmd = st & 0xf0;
    if (st === 0xf8 && md.opt.clockIn) {
      const now = e.timeStamp || performance.now(); md.clk.push(now); if (md.clk.length > 49) md.clk.shift();
      if (md.clk.length >= 25 && now - md.lastBpmSet > 600) {
        const span = (md.clk[md.clk.length - 1] - md.clk[md.clk.length - 25]) / 24;   // ms per pulse
        const bpm = Math.round(60000 / (span * 24));
        if (bpm >= 30 && bpm <= 300 && Math.abs(bpm - state.seq.bpm) >= 1) setBpm(bpm);
        md.lastBpmSet = now;
      }
      return;
    }
    if ((st === 0xfa || st === 0xfb) && md.opt.clockIn) { start(); if (typeof bpMidiTransport === "function" && bpMidiTransport(true)) return; if (!playing) startSeq(); return; }
    if (st === 0xfc && md.opt.clockIn) { if (typeof bpMidiTransport === "function") bpMidiTransport(false); if (playing) stopSeq(); return; }
    if ((cmd === 0x90 || cmd === 0x80) && md.opt.padsIn && typeof bpMidiNote === "function" && bpMidiNote(d1, cmd === 0x90 ? d2 : 0)) return;
    if (cmd === 0xb0 && typeof nbCC === "function" && nbCC(st & 15, d1, d2)) return;
    if (!md.opt.noteIn) return;
    let route = mdRoute(e.target);
    // (185) the sound chips say which controller plays them: a controller picked there plays those sounds even when
    // it plays nothing else (the MicroFreak's keys: its own sound, and the plugin picked for it)
    const srcKey = mdKey("in", e.target), assigned = !!(window.__nbCtl && window.__nbCtl.assignedTo(srcKey));
    if (route === "none" && assigned) route = "stack";
    if (route === "none") return;
    window.__nbSrc = srcKey; window.__nbSrcStack = mdRoute(e.target) === "stack"; queueMicrotask(() => { window.__nbSrc = null; });   // (only for what this message plays)
    // (184) its knobs (not learned for anything here), wheels and pressure go to the plugin(s) it plays as well
    if ((cmd === 0xb0 && d1 !== 64 && d1 !== 120 && d1 !== 123) || cmd === 0xe0 || cmd === 0xd0 || cmd === 0xa0) { const sent = mdToPlugs(route, [st, d1, d2 == null ? 0 : d2]); if (sent && cmd === 0xb0 && d1 !== 1) return; }
    if (route !== "stack" && (cmd === 0x90 || cmd === 0x80 || (cmd === 0xb0 && (d1 === 64 || d1 === 123 || d1 === 120)))) {
      const pid = e.target.id, k = pid + ":" + (st & 15) + ":" + d1;
      if (cmd === 0xb0) {
        if (d1 === 64) { const on = d2 >= 64, held = MDR.sus.get(pid); if (on) { if (!held) MDR.sus.set(pid, new Set()); } else if (held) { MDR.sus.delete(pid); held.forEach(kk => { const vs = MDR.v.get(kk); if (vs && vs.off) { MDR.v.delete(kk); vs.forEach(v => { try { v.stop(); } catch (er) {} }); } }); } }
        else { MDR.v.forEach((vs, kk) => { if (kk.startsWith(pid + ":")) { vs.forEach(v => { try { v.stop(); } catch (er) {} }); MDR.v.delete(kk); } }); MDR.sus.delete(pid); }
        return;
      }
      if (cmd === 0x90 && d2 > 0) {
        start();
        const old = MDR.v.get(k); if (old) old.forEach(v => { try { v.stop(); } catch (er) {} });
        NB_VEL7 = d2; let vs; try { vs = mdRouteVoices(route, d1, mdVelGain(d2)); } finally { NB_VEL7 = 100; }
        MDR.v.set(k, vs);
      } else {
        const vs = MDR.v.get(k); if (!vs) return;
        const held = MDR.sus.get(pid); if (held) { vs.off = true; held.add(k); return; }
        MDR.v.delete(k); vs.forEach(v => { try { v.stop(); } catch (er) {} });
      }
      return;
    }
    if (cmd === 0xe0) { pm.bend = Math.max(-1, Math.min(1, ((d2 << 7) | d1) / 8192 - 1)); if (WHEEL_DRAW.bend) WHEEL_DRAW.bend(); applyPitch(); return; }
    if (cmd === 0xd0) { MODSRC.press = d1 / 127 * 0.8; pm.mod = Math.max(MODSRC.wheel, MODSRC.press); if (WHEEL_DRAW.mod) WHEEL_DRAW.mod(); applyPitch(); return; }
    if (cmd === 0xb0) {
      if (d1 === 1) { MODSRC.wheel = d2 / 127; pm.mod = Math.max(MODSRC.wheel, MODSRC.press); if (WHEEL_DRAW.mod) WHEEL_DRAW.mod(); applyPitch(); }
      else if (d1 === 64) nbSustain(d2 >= 64);
      else if (d1 === 123 || d1 === 120) { nbSustain(false); allOff(); }
      return;
    }
    if (cmd === 0x90 && d2 > 0) { start(); NB_VEL = mdVelGain(d2); NB_VEL7 = d2; try { state.hold ? press(d1) : noteOn(d1); } finally { NB_VEL = 1; NB_VEL7 = 100; window.__nbSrc = null; } }
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) { if (!state.hold) nbSusOff(d1); }
  }
  // (185) the controllers that are on, for the sound chips' menus: key, a short name, whether they play what's playing
  window.__nbCtlList = () => {
    if (!md.access) return [];
    return [...md.access.inputs.values()].filter(p => md.ins.has(p.id) && !/mcu|hui|alv|din\s*thru|midi through|^through/i.test(p.name || ""))
      .map(p => ({ key: mdKey("in", p), name: (p.name || "MIDI").replace(/^KL\b/i, "KeyLab").replace(/^Arturia\s+/i, "").replace(/\s*(MIDI(\s*\d+)?|mk\s*3|Essential)\s*/gi, " ").replace(/\s*_\s*/g, " ").replace(/\s+/g, " ").trim() || p.name, full: p.name, stack: mdRoute(p) === "stack" }));
  };
  window.__nbRoute = { sendPort(on) { if (!md.access) return false; const o = [...md.access.outputs.values()].find(x => /\bNate Bloom send\b/i.test(x.name || "")); if (!o) return false; mdRemember("out", o, !!on); if (on) md.outs.add(o.id); else md.outs.delete(o.id); renderMidi(); return true; },
    sendOn() { if (!md.access) return null; const o = [...md.access.outputs.values()].find(x => /\bNate Bloom send\b/i.test(x.name || "")); return o ? md.outs.has(o.id) : null; },
    voices: (r, m, sc, when) => mdRouteVoices(r, m, sc, when), options: () => mdRouteOptions(), plugs: r => mdRoutePlugs(r), velGain: v => mdVelGain(v) };   // (187: the Bitwig bridge plays through these)
  window.__nbMidiDbg = { route: p => mdRoute(p), setRoute: (p, r) => mdRouteSet(p, r), opts: () => mdRouteOptions(), feed: e => onMidi(e), md };   // (184: tests feed it messages)
  function renderMidi() {
    mdPorts.innerHTML = "";
    if (!md.access) return;
    const sec = (title, list, set, kind) => {
      const h = document.createElement("div"); h.className = "sp-lab"; h.innerHTML = "<span></span>"; h.firstChild.textContent = title; mdPorts.appendChild(h);
      if (!list.length) { const e = document.createElement("div"); e.className = "pr-empty"; e.textContent = kind === "in" ? "No MIDI inputs found. Plug in the K.O. II or a keyboard over USB." : "No MIDI outputs found."; mdPorts.appendChild(e); }
      const same = {}; list.forEach(p => { same[p.name] = (same[p.name] || 0) + 1; }); const nth = {};   // (156: a device with several ports of one name: numbered)
      list.forEach(p => {
        const row = document.createElement("label"); row.className = "md-row"; nth[p.name] = (nth[p.name] || 0) + 1;
        row.innerHTML = '<input type="checkbox"><span></span>'; row.querySelector("span").textContent = p.name + (p.manufacturer ? " · " + p.manufacturer : "") + (same[p.name] > 1 ? " · port " + nth[p.name] + " of " + same[p.name] : "");
        const cb = row.querySelector("input"); cb.checked = set.has(p.id);
        cb.addEventListener("change", () => { cb.checked ? set.add(p.id) : set.delete(p.id); mdRemember(kind, p, cb.checked); renderMidi(); });
        if (kind === "out") {   // (which outputs get the clock, start and stop)
          const ck = document.createElement("button"); ck.type = "button"; ck.className = "btn md-clk"; const to = mdClockTo(p);
          ck.textContent = to ? "Clock ✓" : "Clock"; ck.setAttribute("aria-pressed", String(to)); ck.classList.toggle("idle", !md.opt.clockOut || !set.has(p.id));
          ck.title = to ? "Gets the clock, start and stop (when Send clock is on)" : "Doesn't get the clock";
          ck.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); md.opt.clockTo = Object.assign({}, md.opt.clockTo, { [mdKey("out", p)]: !mdClockTo(p) }); saveMd(); renderMidi(); });
          row.appendChild(ck);
        }
        if (kind === "in" && set.has(p.id)) {   // (159: whether this input plays the keys; 184: which sound it plays)
          const sel = document.createElement("select"); sel.className = "md-route"; sel.setAttribute("aria-label", "What " + p.name + " plays");
          const cur = mdRoute(p), opts = mdRouteOptions();
          if (!opts.some(o => o[0] === cur)) opts.push([cur, "(not loaded now) " + cur.replace(/^[a-z]:/, "")]);
          opts.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = (v === "stack" || v === "none" ? "" : "Plays ") + t; sel.appendChild(o); });
          sel.value = cur; sel.title = "What this controller's keys play: what's playing, nothing, or one sound of its own (several controllers can play the same one)";
          ["click", "mousedown", "pointerdown"].forEach(ev => sel.addEventListener(ev, e2 => e2.stopPropagation()));
          sel.addEventListener("change", () => { mdRouteSet(p, sel.value); });
          row.appendChild(sel);
        }
        mdPorts.appendChild(row);
      });
    };
    sec("Inputs (keyboards, the K.O. II's clock)", [...md.access.inputs.values()].filter(p => !mdOwnPort(p)), md.ins, "in");
    sec("Outputs (the K.O. II, synths)", [...md.access.outputs.values()].filter(p => !mdOwnPort(p) || /send/i.test(p.name || "")), md.outs, "out");
  }
  function paintMdOpts() {
    document.querySelectorAll("#midiSheet [data-mo]").forEach(cb => { cb.checked = !!md.opt[cb.dataset.mo]; });
    document.getElementById("mdCh").value = md.opt.ch;
    document.getElementById("mdVel").value = md.opt.vel || "normal";
  }
  document.querySelectorAll("#midiSheet [data-mo]").forEach(cb => cb.addEventListener("change", () => { md.opt[cb.dataset.mo] = cb.checked; saveMd(); }));
  document.getElementById("mdCh").addEventListener("change", e => { md.opt.ch = +e.target.value; saveMd(); });
  document.getElementById("mdVel").addEventListener("change", e => { md.opt.vel = e.target.value; saveMd(); });
  function mdKey(kind, p) {
    const all = md.access ? [...(kind === "in" ? md.access.inputs : md.access.outputs).values()] : [];
    const same = all.filter(x => (x.name || "") === (p.name || "") && (x.manufacturer || "") === (p.manufacturer || ""));
    return kind + ":" + (p.name || "") + "|" + (p.manufacturer || "") + "#" + Math.max(0, same.indexOf(p));
  }
  function mdRemember(kind, p, on) { md.opt.ports = Object.assign({}, md.opt.ports, { [mdKey(kind, p)]: !!on }); saveMd(); }
  async function connectMidi() {
    if (!navigator.requestMIDIAccess) { mdInfo.textContent = "This browser has no MIDI. Use Chrome (Android tablet or computer) with the hosted version; Safari on iPhone/iPad doesn't support it."; return; }
    try {
      let wantSx = false; try { wantSx = !!JSON.parse(localStorage.getItem("nightbloom-minilab") || "{}").lights; } catch (e) {}
      let na, sx = wantSx;
      try { na = await navigator.requestMIDIAccess({ sysex: wantSx }); }
      catch (e2) { if (!wantSx) throw e2; na = await navigator.requestMIDIAccess({ sysex: false }); sx = false; }
      // asking again (for the pad lights): the old ports stop listening once the new ones are in hand
      const old = md.access; if (old && old !== na) { old.inputs.forEach(i => { i.onmidimessage = null; }); old.onstatechange = null; }
      md.access = na; md.sysex = sx;
      const hook = () => {
        const mem = md.opt.ports || {};
        // (187) the app's own MIDI ports (Nate Bloom in / send / out, for other apps): never an input here (its own MIDI
        // would come straight back); "send" is an output only when switched on (the Bitwig sheet), "in" and "out" never
        md.access.inputs.forEach(i => { if (mdOwnPort(i)) { i.onmidimessage = null; md.ins.delete(i.id); return; } i.onmidimessage = onMidi; if (!md.seen || !md.seen.has(i.id)) { if (mem[mdKey("in", i)] === false) md.ins.delete(i.id); else md.ins.add(i.id); } });
        md.access.outputs.forEach(o => { if (mdOwnPort(o)) { if (!/send/i.test(o.name || "") || mem[mdKey("out", o)] !== true) md.outs.delete(o.id); else md.outs.add(o.id); return; } if (!md.seen || !md.seen.has(o.id)) { const r = mem[mdKey("out", o)]; if (r === true || (r == null && !(md.isCtl && md.isCtl(o)))) md.outs.add(o.id); else md.outs.delete(o.id); } });
        md.seen = new Set([...md.access.inputs.keys(), ...md.access.outputs.keys()]);
        renderMidi();
        if (md.onPorts) md.onPorts();
      };
      md.access.onstatechange = hook; hook();
      mdInfo.textContent = "Connected. Devices come back on or off as you left them; new ones are switched on.";
      if (md.opt.auto === undefined) { md.opt.auto = true; saveMd(); paintMdOpts(); }
      document.getElementById("mdConnect").textContent = "Rescan";
    } catch (e) { mdInfo.textContent = "MIDI was blocked here (" + (e && e.name ? e.name : "not allowed") + "). The hosted version in Chrome can use it."; }
  }
  document.getElementById("mdConnect").addEventListener("click", connectMidi);
  {
    const can = () => !!navigator.requestMIDIAccess && !location.hostname.endsWith("claude.ai") && !(window.claude && window.claude.use);
    let tried = false;
    if (md.opt.auto === undefined && window.NB_NATIVE) md.opt.auto = true;   // (the Android app asks no permission: on from the start)
    const auto = () => { if (tried || md.access || !md.opt.auto || !can()) return; tried = true; connectMidi(); };
    document.getElementById("startBtn").addEventListener("click", auto);
    document.addEventListener("pointerdown", auto, { capture: true, once: true });
  }
  document.getElementById("midiBtn").addEventListener("click", () => { mdEl.hidden = false; paintMdOpts(); renderMidi(); if (!md.access) mdInfo.textContent = "Tap Connect. Works in Chrome on Android, Windows, Mac and Linux (hosted version)."; });
  document.getElementById("mdDone").addEventListener("click", () => { mdEl.hidden = true; });
  // clock, notes and drums out ride on the sequencer clock
  {
    const sched = scheduleStep;
    scheduleStep = function (s, t) {
      sched(s, t);
      if (!md.access || !betaOn || !outPorts().length || !ctx) return;
      const dur = stepDur(), ch = (md.opt.ch - 1) & 15;
      if (md.opt.clockOut) for (let k = 0; k < 6; k++) send([0xf8], perfAt(t + k * dur / 6));
      if (md.opt.notesOut) {
        const S = SC();
        if (!scMuted("notes")) S.notes.filter(n => n.b === scBar && n.s === s).forEach(n => { send([0x90 | ch, n.m, n.v || 100], perfAt(t)); send([0x80 | ch, n.m, 0], perfAt(t + Math.max(0.03, n.d * dur * 0.95))); });
        const d = state.seq.synth[s];
        if (d != null && !scMuted("synth")) { const m = BASE + degToSemis(d) + state.octave * 12; send([0x90 | ch, m, 100], perfAt(t)); send([0x80 | ch, m, 0], perfAt(t + dur * 0.9)); }
      }
      if (md.opt.drumsOut) {
        const GM = { kick: 36, snare: 38, clap: 39, ch: 42, oh: 46, tom: 45, rim: 37, cow: 56 };
        for (const [id] of DRUMS) if (state.seq.rows[id][s]) { send([0x99, GM[id], 110], perfAt(t)); send([0x89, GM[id], 0], perfAt(t + 0.05)); }
      }
    };
    const os = startSeq, ost = stopSeq;
    startSeq = function () { const was = playing; os(); if (!was && playing && md.access && md.opt.clockOut && betaOn) send([0xfa], perfAt(ctx.currentTime + 0.06)); };
    stopSeq = function () { const was = playing; ost(); if (was && md.access && betaOn) { if (md.opt.clockOut) send([0xfc]); for (let c = 0; c < 16; c++) send([0xb0 | c, 123, 0]); } };
    const on = noteOn, off = noteOff;
    noteOn = function (m) { on(m); if (md.access && md.opt.keysOut && betaOn) send([0x90 | ((md.opt.ch - 1) & 15), m, 100]); };
    noteOff = function (m) { off(m); if (md.access && md.opt.keysOut && betaOn) send([0x80 | ((md.opt.ch - 1) & 15), m, 0]); };
  }
  onBeta(on => { if (!on && md.access) md.access.inputs.forEach(i => { i.onmidimessage = null; }); else if (on && md.access) md.access.inputs.forEach(i => { i.onmidimessage = onMidi; }); });

  // ---------- Install as an app ----------
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
  const inEl = document.getElementById("installSheet");
  document.getElementById("installBtn").addEventListener("click", () => {
    inEl.hidden = false;
    const inArtifact = !!(window.claude && window.claude.use) || location.hostname.endsWith("claude.ai");
    const go = document.getElementById("inGo");
    go.hidden = !installEvt;
    // a Linux computer (not Android, not a Chromebook) gets the real Linux app first; the web-app install stays below it
    const ua = navigator.userAgent || "";
    const linuxPc = /Linux/i.test(ua) && !/Android|CrOS/i.test(ua);
    document.getElementById("inLinux").hidden = !linuxPc;
    if (linuxPc) go.textContent = "Install as a Chrome web app";
    document.getElementById("inInfo").textContent = linuxPc
      ? "On Linux, get the Linux app: it's the full Nate Bloom. The download link always gets the newest version."
      : inArtifact
      ? "Install works from the hosted copy on GitHub Pages (this page lives inside Claude). Open your GitHub Pages link, then follow the steps below."
      : installEvt ? "Tap Install to add Nate Bloom to your home screen. It then opens full screen and keeps working offline." : "Follow the steps below for your device.";
  });
  document.getElementById("inGo").addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; inEl.hidden = true; });
  document.getElementById("inDone").addEventListener("click", () => { inEl.hidden = true; });
  try {
    if ("serviceWorker" in navigator && location.protocol === "https:" && !location.hostname.endsWith("claude.ai") && !(window.claude && window.claude.use)) {
      fetch("sw.js", { method: "HEAD" }).then(r => { if (r.ok) navigator.serviceWorker.register("sw.js").catch(() => {}); }).catch(() => {});
    }
    // ask the browser to keep the samples and songs even when storage gets tight (granted silently once installed)
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {}

