  // ======================================================================
  // (216, Linux) The sound notebook. "📓 Save sound" on the Playing row keeps everything about the moment: what Nate
  // Bloom is playing (each sound, its preset, engine or plugin, all its settings, effects, tempo; the whole thing
  // reloads like a Favorite), and what the Minilogue XD is on, read from the XD itself over USB: its program name and
  // number, and every parameter that makes the sound (oscillators, multi engine, filter, envelopes, LFO, effects), with
  // the XD's own program data kept so the notebook can send the sound back to the XD. Notes are yours to write.
  // The XD's program format is Korg's (minilogue xd MIDI implementation; field layout as in loguetools, BSD).
  // ======================================================================
  if (window.NB_NATIVE && /^(linux|windows)$/.test(NB_NATIVE.platform)) {
    const NB_KEY = "nightbloom-notebook";
    let NOTES = []; try { NOTES = JSON.parse(localStorage.getItem(NB_KEY) || "[]"); if (!Array.isArray(NOTES)) NOTES = []; } catch (e) { NOTES = []; }
    const nbSave = () => { try { localStorage.setItem(NB_KEY, JSON.stringify(NOTES)); return true; } catch (e) { toast("The notebook is full: export it, then delete some entries"); return false; } };
    const mk = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    const toast = m => { const el = document.getElementById("uiToast"); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3200); };

    // ---------- the Minilogue XD ----------
    const XD = { access: null, prog: null, bank: 0, lastPC: null, wait: null };
    const XD_FIELDS = [["program_name", 4, 12], ["octave", 16, 1], ["portamento", 17, 1], ["voice_mode_depth", 19, 2], ["voice_mode_type", 21, 1], ["vco_1_wave", 22, 1], ["vco_1_octave", 23, 1], ["vco_1_pitch", 24, 2], ["vco_1_shape", 26, 2], ["vco_2_wave", 28, 1], ["vco_2_octave", 29, 1], ["vco_2_pitch", 30, 2], ["vco_2_shape", 32, 2], ["sync", 34, 1], ["ring", 35, 1], ["cross_mod_depth", 36, 2], ["multi_type", 38, 1], ["select_noise", 39, 1], ["select_vpm", 40, 1], ["select_user", 41, 1], ["shape_noise", 42, 2], ["shape_vpm", 44, 2], ["shape_user", 46, 2], ["shift_shape_noise", 48, 2], ["shift_shape_vpm", 50, 2], ["shift_shape_user", 52, 2], ["vco_1_level", 54, 2], ["vco_2_level", 56, 2], ["multi_level", 58, 2], ["cutoff", 60, 2], ["resonance", 62, 2], ["cutoff_drive", 64, 1], ["cutoff_keyboard_track", 65, 1], ["amp_eg_attack", 66, 2], ["amp_eg_decay", 68, 2], ["amp_eg_sustain", 70, 2], ["amp_eg_release", 72, 2], ["eg_attack", 74, 2], ["eg_decay", 76, 2], ["eg_int", 78, 2], ["eg_target", 80, 1], ["lfo_wave", 81, 1], ["lfo_mode", 82, 1], ["lfo_rate", 83, 2], ["lfo_int", 85, 2], ["lfo_target", 87, 1], ["mod_fx_on_off", 88, 1], ["mod_fx_type", 89, 1], ["mod_fx_chorus", 90, 1], ["mod_fx_ensemble", 91, 1], ["mod_fx_phaser", 92, 1], ["mod_fx_flanger", 93, 1], ["mod_fx_user", 94, 1], ["mod_fx_time", 95, 2], ["mod_fx_depth", 97, 2], ["delay_on_off", 99, 1], ["delay_sub_type", 100, 1], ["delay_time", 101, 2], ["delay_depth", 103, 2], ["reverb_on_off", 105, 1], ["reverb_sub_type", 106, 1], ["reverb_time", 107, 2], ["reverb_depth", 109, 2], ["bend_range_plus", 111, 1], ["bend_range_minus", 112, 1], ["cutoff_velocity", 128, 1], ["amp_velocity", 129, 1], ["multi_octave", 130, 1], ["multi_routing", 131, 1], ["eg_legato", 132, 1], ["portamento_mode", 133, 1], ["program_level", 135, 1], ["vpm_param1_feedback", 136, 1], ["vpm_param2_noise_depth", 137, 1], ["vpm_param3_shapemodint", 138, 1], ["vpm_param4_mod_attack", 139, 1], ["vpm_param5_mod_decay", 140, 1], ["vpm_param6_modkeytrack", 141, 1], ["program_transpose", 150, 1], ["delay_dry_wet", 151, 2], ["reverb_dry_wet", 153, 2],
      ["key_trig", 18, 1], ["joystick_assign_plus", 113, 1], ["joystick_range_plus", 114, 1], ["joystick_assign_minus", 115, 1], ["joystick_range_minus", 116, 1], ["cv_in_mode", 117, 1], ["cv_in_1_assign", 118, 1], ["cv_in_1_range", 119, 1], ["cv_in_2_assign", 120, 1], ["cv_in_2_range", 121, 1],
      ["micro_tuning", 122, 1], ["scale_key", 123, 1], ["program_tuning", 124, 1], ["lfo_key_sync", 125, 1], ["lfo_voice_sync", 126, 1], ["lfo_target_osc", 127, 1], ["portamento_bpm_sync", 134, 1],
      ["user_param1", 142, 1], ["user_param2", 143, 1], ["user_param3", 144, 1], ["user_param4", 145, 1], ["user_param5", 146, 1], ["user_param6", 147, 1], ["midi_after_touch_assign", 155, 1],
      ["seq_active_steps", 162, 2], ["bpm", 164, 2], ["step_length", 166, 1], ["step_resolution", 167, 1], ["swing", 168, 1], ["default_gate_time", 169, 1], ["step_on", 170, 2], ["step_motion_on", 172, 2],
      ["motion_1_param", 174, 1], ["motion_2_param", 176, 1], ["motion_3_param", 178, 1], ["motion_4_param", 180, 1], ["arp_gate_time", 1022, 1], ["arp_rate", 1023, 1]];
    const MF_NAMES = { 5: "Glide", 9: "Osc type", 10: "Wave", 12: "Timbre", 13: "Shape", 23: "Cutoff", 83: "Resonance", 26: "Filter amount", 102: "Cycling rise", 103: "Cycling fall", 28: "Cycling hold", 24: "Cycling amount", 105: "Env attack", 106: "Env decay", 29: "Env sustain", 91: "Arp/Seq rate", 93: "LFO rate" };
    const NOTE = n => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n % 12] + (Math.floor(n / 12) - 1);
    const W3 = ["SQR", "TRI", "SAW"], OCT = ["16'", "8'", "4'", "2'"];
    const pct = v => Math.round(v / 1023 * 100) + "% (" + v + ")";
    const SHOW = [   // [group, label, field, how]
      ["Voice", "Voice mode", "voice_mode_type", v => ({ 1: "Arp/Latch", 2: "Chord", 3: "Unison", 4: "Poly" })[v] || v], ["Voice", "Voice mode depth", "voice_mode_depth", pct], ["Voice", "Octave", "octave", v => (v - 2 > 0 ? "+" : "") + (v - 2)], ["Voice", "Portamento", "portamento", v => v],
      ["VCO 1", "Wave", "vco_1_wave", v => W3[v] || v], ["VCO 1", "Octave", "vco_1_octave", v => OCT[v] || v], ["VCO 1", "Pitch", "vco_1_pitch", v => v], ["VCO 1", "Shape", "vco_1_shape", pct],
      ["VCO 2", "Wave", "vco_2_wave", v => W3[v] || v], ["VCO 2", "Octave", "vco_2_octave", v => OCT[v] || v], ["VCO 2", "Pitch", "vco_2_pitch", v => v], ["VCO 2", "Shape", "vco_2_shape", pct],
      ["VCO 2", "Sync", "sync", v => v ? "On" : "Off"], ["VCO 2", "Ring", "ring", v => v ? "On" : "Off"], ["VCO 2", "Cross mod", "cross_mod_depth", pct],
      ["Multi engine", "Type", "multi_type", v => ["Noise", "VPM", "User"][v] || v], ["Multi engine", "Noise type", "select_noise", v => ["High", "Low", "Peak", "Decim"][v] ?? v], ["Multi engine", "VPM type", "select_vpm", v => v + 1], ["Multi engine", "User slot", "select_user", v => v + 1],
      ["Multi engine", "Shape (noise)", "shape_noise", pct], ["Multi engine", "Shape (VPM)", "shape_vpm", pct], ["Multi engine", "Shape (user)", "shape_user", pct], ["Multi engine", "Shift-shape (VPM)", "shift_shape_vpm", pct], ["Multi engine", "Octave", "multi_octave", v => OCT[v] || v],
      ["Mixer", "VCO 1", "vco_1_level", pct], ["Mixer", "VCO 2", "vco_2_level", pct], ["Mixer", "Multi", "multi_level", pct],
      ["Filter", "Cutoff", "cutoff", pct], ["Filter", "Resonance", "resonance", pct], ["Filter", "Drive", "cutoff_drive", v => ["0%", "50%", "100%"][v] || v], ["Filter", "Key track", "cutoff_keyboard_track", v => ["0%", "50%", "100%"][v] || v], ["Filter", "Velocity", "cutoff_velocity", v => v],
      ["Amp EG", "Attack", "amp_eg_attack", pct], ["Amp EG", "Decay", "amp_eg_decay", pct], ["Amp EG", "Sustain", "amp_eg_sustain", pct], ["Amp EG", "Release", "amp_eg_release", pct],
      ["EG", "Attack", "eg_attack", pct], ["EG", "Decay", "eg_decay", pct], ["EG", "Int", "eg_int", v => v], ["EG", "Target", "eg_target", v => ["Cutoff", "Pitch 2", "Pitch"][v] || v],
      ["LFO", "Wave", "lfo_wave", v => W3[v] || v], ["LFO", "Mode", "lfo_mode", v => ["1-Shot", "Normal", "BPM"][v] || v], ["LFO", "Rate", "lfo_rate", pct], ["LFO", "Int", "lfo_int", v => v], ["LFO", "Target", "lfo_target", v => ["Cutoff", "Shape", "Pitch"][v] || v],
      ["Effects", "Mod FX", "mod_fx_on_off", v => v ? "On" : "Off"], ["Effects", "Mod FX type", "mod_fx_type", v => ({ 1: "Chorus", 2: "Ensemble", 3: "Phaser", 4: "Flanger", 5: "User" })[v] || v], ["Effects", "Mod FX time", "mod_fx_time", pct], ["Effects", "Mod FX depth", "mod_fx_depth", pct],
      ["Effects", "Delay", "delay_on_off", v => v ? "On" : "Off"], ["Effects", "Delay type", "delay_sub_type", v => v + 1], ["Effects", "Delay time", "delay_time", pct], ["Effects", "Delay depth", "delay_depth", pct], ["Effects", "Delay dry/wet", "delay_dry_wet", pct],
      ["Effects", "Reverb", "reverb_on_off", v => v ? "On" : "Off"], ["Effects", "Reverb type", "reverb_sub_type", v => v + 1], ["Effects", "Reverb time", "reverb_time", pct], ["Effects", "Reverb depth", "reverb_depth", pct], ["Effects", "Reverb dry/wet", "reverb_dry_wet", pct],
      ["Voice", "Key trig", "key_trig", v => v ? "On" : "Off"], ["Voice", "Portamento mode", "portamento_mode", v => v ? "On" : "Auto"], ["Voice", "Portamento BPM sync", "portamento_bpm_sync", v => v ? "On" : "Off"], ["Voice", "EG legato", "eg_legato", v => v ? "On" : "Off"],
      ["Multi engine", "Routing", "multi_routing", v => v ? "Post VCF" : "Pre VCF"],
      ["Multi engine", "VPM feedback", "vpm_param1_feedback", v => (v - 100) + "%"], ["Multi engine", "VPM noise depth", "vpm_param2_noise_depth", v => (v - 100) + "%"], ["Multi engine", "VPM shape mod int", "vpm_param3_shapemodint", v => (v - 100) + "%"],
      ["Multi engine", "VPM mod attack", "vpm_param4_mod_attack", v => (v - 100) + "%"], ["Multi engine", "VPM mod decay", "vpm_param5_mod_decay", v => (v - 100) + "%"], ["Multi engine", "VPM mod key track", "vpm_param6_modkeytrack", v => (v - 100) + "%"],
      ["Multi engine", "User param 1", "user_param1", v => v], ["Multi engine", "User param 2", "user_param2", v => v], ["Multi engine", "User param 3", "user_param3", v => v], ["Multi engine", "User param 4", "user_param4", v => v], ["Multi engine", "User param 5", "user_param5", v => v], ["Multi engine", "User param 6", "user_param6", v => v],
      ["LFO", "Key sync", "lfo_key_sync", v => v ? "On" : "Off"], ["LFO", "Voice sync", "lfo_voice_sync", v => v ? "On" : "Off"], ["LFO", "Target osc", "lfo_target_osc", v => ["All", "VCO 1+2", "VCO 2", "Multi"][v] ?? v],
      ["Effects", "Chorus sub-type", "mod_fx_chorus", v => v + 1], ["Effects", "Ensemble sub-type", "mod_fx_ensemble", v => v + 1], ["Effects", "Phaser sub-type", "mod_fx_phaser", v => v + 1], ["Effects", "Flanger sub-type", "mod_fx_flanger", v => v + 1], ["Effects", "User FX slot", "mod_fx_user", v => v + 1],
      ["Controls", "Joystick + assign", "joystick_assign_plus", v => v], ["Controls", "Joystick + range", "joystick_range_plus", v => (v - 100) + "%"], ["Controls", "Joystick − assign", "joystick_assign_minus", v => v], ["Controls", "Joystick − range", "joystick_range_minus", v => (v - 100) + "%"],
      ["Controls", "Bend range −", "bend_range_minus", v => v], ["Controls", "Aftertouch assign", "midi_after_touch_assign", v => v], ["Controls", "CV in mode", "cv_in_mode", v => v], ["Controls", "CV in 1", "cv_in_1_assign", v => v], ["Controls", "CV in 2", "cv_in_2_assign", v => v],
      ["Tuning", "Micro tuning", "micro_tuning", v => v], ["Tuning", "Scale key", "scale_key", v => (v - 12 > 0 ? "+" : "") + (v - 12)], ["Tuning", "Program tuning", "program_tuning", v => (v - 50 > 0 ? "+" : "") + (v - 50) + " cents"],
      ["Arp & sequencer", "BPM", "bpm", v => (v / 10).toFixed(1)], ["Arp & sequencer", "Step length", "step_length", v => v], ["Arp & sequencer", "Step resolution", "step_resolution", v => ["1/16", "1/8", "1/4", "1/2", "1/1"][v] || v],
      ["Arp & sequencer", "Swing", "swing", v => (v > 127 ? v - 256 : v) + "%"], ["Arp & sequencer", "Gate time", "default_gate_time", v => Math.round(v / 72 * 100) + "%"], ["Arp & sequencer", "Steps on", "step_on", v => [...Array(16)].map((_, i) => (v >> i) & 1 ? "■" : "□").join("")],
      ["Arp & sequencer", "Arp gate", "arp_gate_time", v => Math.round(v / 72 * 100) + "%"], ["Arp & sequencer", "Arp rate", "arp_rate", v => v],
      ["Arp & sequencer", "Motion 1", "motion_1_param", v => v || "—"], ["Arp & sequencer", "Motion 2", "motion_2_param", v => v || "—"], ["Arp & sequencer", "Motion 3", "motion_3_param", v => v || "—"], ["Arp & sequencer", "Motion 4", "motion_4_param", v => v || "—"],
      ["Program", "Level", "program_level", v => v], ["Program", "Transpose", "program_transpose", v => (v - 13 > 0 ? "+" : "") + (v - 13)], ["Program", "Amp velocity", "amp_velocity", v => v], ["Program", "Bend range +/−", "bend_range_plus", v => v],
    ];
    function xdDecode(bytes) {
      const o = {}, u8 = bytes;
      o.steps = [];
      for (let st = 0; st < 16; st++) { const b = 190 + st * 52, notes = []; for (let k = 0; k < 8; k++) { const nn = u8[b + k], vel = u8[b + 8 + k]; if (nn && vel) notes.push(NOTE(nn) + (vel < 127 ? "·" + vel : "")); } o.steps.push(notes); }
      for (const [n, off, sz] of XD_FIELDS) o[n] = n === "program_name" ? String.fromCharCode(...u8.slice(off, off + sz)).replace(/\0.*$/, "").trim() : sz === 2 ? u8[off] | (u8[off + 1] << 8) : u8[off];
      return o;
    }
    // Korg's 7-bit packing: every 7 bytes travel as 8, the first carrying the top bits of the other seven
    function unpack7(d) { const out = []; for (let i = 0; i < d.length; i += 8) { const m = d[i]; for (let j = 0; j < 7 && i + 1 + j < d.length; j++) out.push(d[i + 1 + j] | (((m >> j) & 1) << 7)); } return out; }
    function pack7(b) { const out = []; for (let i = 0; i < b.length; i += 7) { let m = 0; const g = b.slice(i, i + 7); g.forEach((x, j) => { if (x & 0x80) m |= 1 << j; }); out.push(m, ...g.map(x => x & 0x7f)); } return out; }
    const b64 = a => btoa(String.fromCharCode(...a)), unb64 = s => Array.from(atob(s), c => c.charCodeAt(0));
    const xdName = p => /minilogue\s*xd/i.test((p.name || "") + " " + (p.manufacturer || ""));
    const pickPort = (list) => { const L = [...list.values()].filter(xdName); return L.find(p => /sound/i.test(p.name)) || L[0] || null; };
    async function xdAccess() {
      if (XD.access) return XD.access;
      XD.access = await navigator.requestMIDIAccess({ sysex: true });
      const seen = new WeakSet(), attach = i => { if (seen.has(i) || /nate bloom|midi through/i.test(i.name || "")) return; seen.add(i); i.addEventListener("midimessage", e => { if (xdName(i)) xdMsg(e); try { hwListen(i, e); } catch (er) {} }); };
      XD.access.inputs.forEach(attach);
      XD.access.addEventListener("statechange", e => { if (e.port && e.port.type === "input" && e.port.state === "connected") attach(e.port); try { hwPaint(); } catch (er) {} });
      return XD.access;
    }
    function xdMsg(e) {
      const d = e.data; if (!d || !d.length) return;
      const st = d[0] & 0xf0;
      if (st === 0xb0 && d[1] === 0) XD.bank = d[2];
      else if (st === 0xb0 && d[1] === 32) XD.bank = d[2];
      else if (st === 0xc0) XD.lastPC = XD.bank * 100 + d[1] + 1;   // (the XD's 500 programs: bank 0–4, then 0–99)
      else if (d[0] === 0xf0 && d[1] === 0x42 && (d[2] & 0xf0) === 0x30 && d[3] === 0 && d[4] === 1 && d[5] === 0x51 && d[6] === 0x40 && XD.wait) {
        const raw = unpack7(Array.from(d.slice(7, d.length - 1)));
        const w = XD.wait; XD.wait = null; XD.ch = d[2] & 0x0f; w(raw);
      }
    }
    // the current program (the edit buffer: knob moves since the last write included)
    async function xdRead() {
      let A; try { A = await xdAccess(); } catch (e) { XD.access = null; return { err: "MIDI didn't open (" + ((e && e.name) || "refused") + ")" }; }
      const out = pickPort(A.outputs); if (!out) return { err: "The Minilogue XD isn't plugged in (USB)" };
      if (!pickPort(A.inputs)) return { err: "The Minilogue XD's MIDI input isn't showing" };
      const got = new Promise(res => { XD.wait = res; setTimeout(() => { if (XD.wait === res) { XD.wait = null; res(null); } }, 1500); });
      const chs = XD.ch != null ? [XD.ch] : [...Array(16).keys()];   // its global channel, found once
      for (const g of chs) out.send([0xf0, 0x42, 0x30 | g, 0x00, 0x01, 0x51, 0x10, 0xf7]);
      const raw = await got; if (!raw) return { err: "The Minilogue XD didn't answer (Global › MIDI: is SysEx on?)" };
      if (String.fromCharCode(...raw.slice(0, 4)) !== "PROG") return { err: "The Minilogue XD sent something that isn't a program" };
      return { raw: b64(raw), p: xdDecode(raw), num: XD.lastPC, at: Date.now() };
    }
    async function xdSend(entry) {
      try {
        const A = await xdAccess(), out = pickPort(A.outputs); if (!out) { toast("Plug the Minilogue XD in (USB) to send it"); return; }
        const g = XD.ch != null ? XD.ch : (window.__hw && window.__hw.ch ? window.__hw.ch - 1 : 0);
        out.send([0xf0, 0x42, 0x30 | g, 0x00, 0x01, 0x51, 0x40, ...pack7(unb64(entry.xd.raw)), 0xf7]);
        toast("Sent “" + entry.xd.p.program_name + "” to the Minilogue XD (its edit buffer: write it there to keep it)");
      } catch (e) { toast("Couldn't send it to the Minilogue XD"); }
    }

    // ---------- Nate Bloom's side ----------
    function nbSummary() {
      let its = []; try { its = window.__stk.items(); } catch (e) {}
      const sounds = its.map(it => {
        const o = { name: it.name, what: it.sub || it.kind };
        if ((it.t === "syn" || it.t === "syn2") && ENGINES[it.id]) {
          const E = ENGINES[it.id], P = it.t === "syn2" ? ((state.layers[it.id].copies || [])[it.ci] || {}).params || {} : state.params[it.id] || {};
          o.engine = E.name; o.knobs = E.knobs.map(([k, label]) => [label, Math.round((P[k] ?? 0) * 100) / 100]);
        }
        return o;
      });
      let fx = []; try { const W = window.__wam; for (const t of window.__wamTargets().map(x => x[0])) for (const F of (W.chainOf(t) || [])) fx.push((F.name || F.key) + " on " + t.replace(/^ch:|^plug:wam:nathan\//, "")); } catch (e) {}
      return { sounds, fx, bpm: state.seq && state.seq.bpm, scale: (() => { try { return document.getElementById("scaleBtn").textContent.trim(); } catch (e) { return ""; } })() };
    }

    // ---------- saving ----------
    let saveSound = async function (name, notes, wantXD) {
      const e = { id: "n" + Date.now().toString(36), name, notes: notes || "", at: Date.now(), nb: nbSummary() };
      try { e.snap = await window.__fav.capture(name); } catch (er) {}
      if (wantXD) { const x = await xdRead(); if (x.err) { if (HW.xd && Date.now() - HW.xdAt < 600000) e.xd = HW.xd; else if (!/isn't plugged in/.test(x.err)) e.xdErr = x.err; } else e.xd = x; }
      NOTES.unshift(e); if (!nbSave()) { NOTES.shift(); return null; }
      return e;
    };
    function textOf(e) {
      const L = [e.name, new Date(e.at).toLocaleString(), ""];
      L.push("NATE BLOOM" + (e.nb.bpm ? " · " + e.nb.bpm + " bpm" : ""));
      e.nb.sounds.forEach(s => { L.push("• " + s.name + " (" + s.what + ")"); if (s.knobs) L.push("    " + s.knobs.map(([l, v]) => l + " " + v).join(" · ")); });
      if (e.nb.fx.length) L.push("Effects: " + e.nb.fx.join(", "));
      if (e.xd) {
        L.push("", "MINILOGUE XD · " + e.xd.p.program_name + (e.xd.num ? " · program " + e.xd.num : ""));
        let g = ""; SHOW.forEach(([grp, label, f, how]) => { const v = e.xd.p[f]; if (v == null) return; if (grp !== g) { L.push(grp + ":"); g = grp; } L.push("    " + label + ": " + how(v)); });
        if (e.xd.p.steps && e.xd.p.steps.some(x => x.length)) L.push("Sequence:", ...e.xd.p.steps.map((x, i) => x.length ? "    step " + (i + 1) + ": " + x.join(" ") : "").filter(Boolean));
      } else if (e.xdErr) L.push("", "Minilogue XD: " + e.xdErr);
      if (e.mf) { L.push("", "MICROFREAK · " + (e.mf.name || "preset " + e.mf.preset) + (e.mf.name ? " (preset " + e.mf.preset + ")" : "") + (e.mf.cat ? " · " + e.mf.cat : "")); if (Object.keys(e.mf.cc || {}).length) L.push("Knobs turned since the preset loaded:"); Object.keys(e.mf.cc || {}).forEach(n => L.push("    " + (MF_NAMES[n] || "CC " + n) + ": " + e.mf.cc[n])); }
      if (e.notes) L.push("", "NOTES", e.notes);
      return L.join("\n");
    }

    // ---------- the save dialog and the notebook ----------
    const sheet = mk("div", "editor sheet nbk"); sheet.hidden = true; sheet.id = "nbkSheet";
    const card = mk("div", "ed-card"); card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Sound notebook"); sheet.appendChild(card);
    document.body.appendChild(sheet);
    sheet.addEventListener("click", ev => { if (ev.target === sheet) sheet.hidden = true; });
    const close = () => { sheet.hidden = true; };
    function head(title, extra) {
      const h = mk("div", "ed-head nbk-head"); h.appendChild(mk("strong", "", title));
      if (extra) extra.forEach(b => h.appendChild(b));
      const x = mk("button", "btn", "Done"); x.addEventListener("click", close); h.appendChild(x);
      return h;
    }
    function openSave() {
      start();
      card.innerHTML = "";
      let its = []; try { its = window.__stk.items(); } catch (e) {}
      card.appendChild(head("📓 Save sound"));
      const nm = mk("input", "nbk-name"); nm.type = "text"; nm.value = its.filter(i => i.t !== "hw").map(i => i.name).concat([HW.xd && HW.xd.p.program_name, HW.mf.pc && (HW.mf.name || "MicroFreak " + HW.mf.pc)].filter(Boolean)).join(" + ").slice(0, 80) || "My sound"; nm.setAttribute("aria-label", "Name");
      const nt = mk("textarea", "nbk-notes"); nt.placeholder = "Notes: what it's for, the song, what you'd change…"; nt.rows = 4;
      const cb = { checked: true }, xdRow = mk("span");
      const info = mk("p", "nbk-info", "Saves everything Nate Bloom is playing (it reloads exactly), the Minilogue XD's whole program (name, number, every parameter, its sequence) and the MicroFreak's preset (name, number, category, the knobs you've turned, its saved data), read from them as you save. The name and notes are optional.");
      const go = mk("button", "btn big primary", "Save to notebook");
      go.addEventListener("click", async () => {
        go.disabled = true; go.textContent = "Reading your synths…";
        const e = await saveSound(nm.value.trim() || "My sound", nt.value, cb.checked);
        go.disabled = false; go.textContent = "Save to notebook";
        if (!e) return;
        toast("Saved 📓 " + e.name + (e.xd ? " · XD: " + e.xd.p.program_name : "") + (e.mf ? " · MicroFreak: " + (e.mf.name || e.mf.preset) : ""));
        openBook(e.id);
      });
      const book = mk("button", "btn big", "Open notebook (" + NOTES.length + ")"); book.addEventListener("click", () => openBook());
      const foot = mk("div", "ed-foot sheet-foot"); foot.append(book, go);
      card.append(mk("span", "nbk-lab", "Name"), nm, mk("span", "nbk-lab", "Notes"), nt, xdRow, info, foot);
      sheet.hidden = false; setTimeout(() => nm.select(), 30);
    }
    function openBook(openId) {
      card.innerHTML = "";
      const exp = mk("button", "btn", "Export"); exp.title = "Save the whole notebook as a file";
      exp.addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, notebook: NOTES }, null, 1)], { type: "application/json" })); a.download = "nate-bloom-notebook-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
      const imp = mk("button", "btn", "Import"); imp.addEventListener("click", () => {
        const f = document.createElement("input"); f.type = "file"; f.accept = ".json,application/json";
        f.addEventListener("change", async () => { try { const j = JSON.parse(await f.files[0].text()); const L = (j.notebook || []).filter(x => x && x.id && !NOTES.some(y => y.id === x.id)); NOTES.push(...L); NOTES.sort((a, b) => b.at - a.at); nbSave(); toast("Imported " + L.length); openBook(); } catch (e) { toast("That file isn't a Nate Bloom notebook"); } });
        f.click();
      });
      const nw = mk("button", "btn primary", "📓 Save sound"); nw.addEventListener("click", openSave);
      card.appendChild(head("📓 Sound notebook", [nw, exp, imp]));
      const list = mk("div", "nbk-list"); card.appendChild(list);
      if (!NOTES.length) list.appendChild(mk("p", "nbk-info", "Nothing saved yet. 📓 Save sound on the Playing row keeps what's playing, and what the Minilogue XD is on."));
      NOTES.forEach(e => list.appendChild(entryEl(e, e.id === openId)));
      sheet.hidden = false;
      const op = list.querySelector(".nbk-e.open"); if (op) op.scrollIntoView({ block: "nearest" });
    }
    function entryEl(e, open) {
      const w = mk("div", "nbk-e" + (open ? " open" : ""));
      const h = mk("button", "nbk-eh"); const t = mk("span", "es-t");
      t.append(mk("b", "", e.name), mk("small", "", new Date(e.at).toLocaleString() + " · " + e.nb.sounds.map(s => s.name).join(" + ") + (e.xd ? " · XD: " + e.xd.p.program_name + (e.xd.num ? " (#" + e.xd.num + ")" : "") : "")));
      h.appendChild(t); h.addEventListener("click", () => w.classList.toggle("open")); w.appendChild(h);
      const body = mk("div", "nbk-body");
      const acts = mk("div", "nbk-acts");
      const ld = mk("button", "btn primary", "Load in Nate Bloom"); ld.disabled = !e.snap; ld.addEventListener("click", async () => { start(); try { await window.__fav.apply(e.snap); toast("Loaded " + e.name); } catch (er) { toast("Couldn't load it"); } });
      const sx = mk("button", "btn", "Send to Minilogue XD"); sx.disabled = !e.xd; sx.addEventListener("click", () => xdSend(e));
      const cp = mk("button", "btn", "Copy as text"); cp.addEventListener("click", () => { try { navigator.clipboard.writeText(textOf(e)); toast("Copied"); } catch (er) {} });
      const rd = mk("button", "btn", "Re-read XD"); rd.title = "Replace the XD part with what it's on now"; rd.addEventListener("click", async () => { const x = await xdRead(); if (x.err) { toast(x.err); return; } e.xd = x; delete e.xdErr; nbSave(); openBook(e.id); });
      const del = mk("button", "btn", "Delete"); del.addEventListener("click", () => { if (del.dataset.sure) { NOTES = NOTES.filter(x => x !== e); nbSave(); openBook(); } else { del.dataset.sure = "1"; del.textContent = "Tap again to delete"; } });
      acts.append(ld, sx, cp, rd, del); body.appendChild(acts);
      const nt = mk("textarea", "nbk-notes"); nt.value = e.notes || ""; nt.placeholder = "Notes"; nt.rows = 3;
      nt.addEventListener("input", () => { e.notes = nt.value; clearTimeout(nt.t); nt.t = setTimeout(nbSave, 400); });
      body.append(mk("span", "nbk-lab", "Notes"), nt);
      // Nate Bloom
      const nb = mk("div", "nbk-sec"); nb.appendChild(mk("h4", "", "Nate Bloom" + (e.nb.bpm ? " · " + e.nb.bpm + " bpm" : "")));
      e.nb.sounds.forEach(s => {
        const r = mk("div", "nbk-snd"); r.append(mk("b", "", s.name), mk("small", "", " " + s.what));
        if (s.knobs) { const k = mk("div", "nbk-kn"); s.knobs.forEach(([l, v]) => k.appendChild(mk("span", "", l + " " + v))); r.appendChild(k); }
        nb.appendChild(r);
      });
      if (e.nb.fx.length) nb.appendChild(mk("p", "nbk-fx", "Effects: " + e.nb.fx.join(" · ")));
      body.appendChild(nb);
      // the XD
      const xs = mk("div", "nbk-sec");
      if (e.xd) {
        xs.appendChild(mk("h4", "", "Minilogue XD · " + e.xd.p.program_name + (e.xd.num ? " · program " + e.xd.num : " · program number: change programs once with Nate Bloom open and it's known")));
        const grid = mk("div", "nbk-xdg"); let g = "", box = null;
        SHOW.forEach(([grp, label, f, how]) => {
          const v = e.xd.p[f]; if (v == null) return;
          if (grp !== g) { box = mk("div", "nbk-xb"); box.appendChild(mk("h5", "", grp)); grid.appendChild(box); g = grp; }
          const row = mk("div", "nbk-xr"); row.append(mk("span", "", label), mk("b", "", String(how(v)))); box.appendChild(row);
        });
        xs.appendChild(grid);
        const sq = e.xd.p.steps || []; if (sq.some(x => x.length)) { const b = mk("div", "nbk-xb"); b.appendChild(mk("h5", "", "Sequence (notes per step)")); sq.forEach((x, i) => { if (x.length) { const r = mk("div", "nbk-xr"); r.append(mk("span", "", "Step " + (i + 1)), mk("b", "", x.join(" "))); b.appendChild(r); } }); xs.appendChild(b); }
      } else xs.appendChild(mk("p", "nbk-info", e.xdErr ? "Minilogue XD: " + e.xdErr : "No Minilogue XD part. Re-read XD adds it."));
      body.appendChild(xs);
      if (e.mf) {
        const ms = mk("div", "nbk-sec"); ms.appendChild(mk("h4", "", "MicroFreak · " + (e.mf.name || "preset " + e.mf.preset) + (e.mf.name ? " · preset " + e.mf.preset : "") + (e.mf.cat ? " · " + e.mf.cat : "")));
        ms.appendChild(mk("p", "nbk-info", (Object.keys(e.mf.cc || {}).length ? "Knobs turned since the preset loaded (the rest are as the preset saved them)" : "No knobs turned since the preset loaded: it's the preset as saved") + (e.mf.raw ? " · its saved preset data is kept with this entry" : "")));
        const k = mk("div", "nbk-kn"); Object.keys(e.mf.cc || {}).forEach(n => k.appendChild(mk("span", "", (MF_NAMES[n] || "CC " + n) + " " + e.mf.cc[n]))); ms.appendChild(k); body.appendChild(ms);
      }
      w.appendChild(body);
      return w;
    }

    // ---------- the buttons ----------
    const stkRow = document.getElementById("stkRow");
    function addBtn() {
      if (!stkRow || stkRow.querySelector(".nbk-save")) return;
      const b = mk("button", "btn nbk-save", "📓 Save sound"); b.title = "Save what's playing and what the Minilogue XD is on, with notes, to the sound notebook"; b.setAttribute("aria-label", b.title);
      b.addEventListener("click", openSave); stkRow.appendChild(b);
    }
    if (stkRow) { new MutationObserver(addBtn).observe(stkRow, { childList: true }); addBtn(); }
    (window.__nbFindMore = window.__nbFindMore || []).push(add => {
      add("Sounds", "📓 Sound notebook", NOTES.length + " saved · with the Minilogue XD's settings", () => openBook(), "notebook notes save sound minilogue xd program settings");
      NOTES.forEach(e => add("Sounds", "📓 " + e.name, "Notebook" + (e.xd ? " · XD " + e.xd.p.program_name : ""), () => openBook(e.id), "notebook " + e.name + " " + (e.xd ? e.xd.p.program_name : "")));
    });

    // ---------- (217) the hardware panel: left of the page when there's room ----------
    // The Minilogue XD: its current program, read from it whenever it changes program or a knob moves (the XD answers a
    // program request with its edit buffer), so the panel always shows what it's on. The MicroFreak (Arturia publishes no
    // way to read a preset's name or settings over MIDI): its preset number from Program Change, a name you give it, and
    // every knob it sends as you turn it, by its documented CC numbers. Any other synth plugged in: its program number and
    // the controllers it sends.
    const MF_CC = { 5: "Glide", 9: "Osc type", 10: "Wave", 12: "Timbre", 13: "Shape", 23: "Cutoff", 83: "Resonance", 26: "Filter amount", 102: "Cycling rise", 103: "Cycling fall", 28: "Cycling hold", 24: "Cycling amount", 105: "Env attack", 106: "Env decay", 29: "Env sustain", 91: "Arp/Seq rate", 92: "Arp/Seq rate (sync)", 93: "LFO rate", 94: "LFO rate (sync)", 1: "Mod wheel", 64: "Hold", 7: "Volume" };
    const HW = { xd: null, xdAt: 0, mf: { pc: null, bank: 0, cc: {} }, other: new Map(), names: {} };
    try { HW.names = JSON.parse(localStorage.getItem("nightbloom-hwnames") || "{}") || {}; } catch (e) {}
    const isMF = p => /micro\s*freak/i.test((p && p.name) || "");
    let xdT = 0;
    function hwListen(port, e) {
      const d = e.data, st = d[0] & 0xf0;
      if (xdName(port)) {
        if (st === 0xc0 || st === 0xb0) { clearTimeout(xdT); xdT = setTimeout(hwReadXD, st === 0xc0 ? 150 : 700); }
        return;
      }
      if (isMF(port)) {
        const M = HW.mf;
        if (d[0] === 0xf0) { mfSysex(d); return; }
        if (st === 0xb0 && d[1] === 0) M.bank = d[2];
        else if (st === 0xc0) { M.pc = M.bank * 128 + d[1] + 1; M.cc = {}; M.name = ""; M.cat = null; mfRead(M.pc, false).then(hwPaintSoon); }
        else if (st === 0xb0) M.cc[d[1]] = d[2];
        else return;
        hwPaintSoon(); return;
      }
      if (st !== 0xb0 && st !== 0xc0) return;
      const o = HW.other.get(port.name) || { pc: null, cc: {} }; HW.other.set(port.name, o);
      if (st === 0xc0) o.pc = d[1] + 1; else o.cc[d[1]] = d[2];
      hwPaintSoon();
    }
    // the MicroFreak's preset name and category, and its saved preset data, over Arturia's SysEx (the messages Arturia's
    // MIDI Control Center uses; as worked out by the MicroFreak Reader project). Read from the preset's saved copy:
    // knobs turned since it loaded are the ones listed live.
    const MF_CAT = ["Bass", "Brass", "Keys", "Lead", "Organ", "Pad", "Percussion", "Sequence", "SFX", "Strings", "Template", "Vocoder"];
    const MFQ = { want: null, data: [] };
    function mfSysex(d) {
      if (!(d[1] === 0x00 && d[2] === 0x20 && d[3] === 0x6b) || !MFQ.want) return;
      if (d[8] === 0x52) { const b = Array.from(d.slice(9, d.length - 1)); let nm = ""; for (let i = 12; i < b.length && b[i]; i++) nm += String.fromCharCode(b[i]); MFQ.name = nm.trim(); MFQ.cat = d[19]; const w = MFQ.want; if (w.kind === "name") { MFQ.want = null; w.res(true); } else w.ack && w.ack(); return; }
      if ((d[8] === 0x16 || d[8] === 0x17) && d.length === 42) { MFQ.data.push(...Array.from(d.slice(9, d.length - 1))); const w = MFQ.want; if (w && w.ack) w.ack(); }
    }
    const mfOut = () => { const A = XD.access; return A ? [...A.outputs.values()].find(isMF) || null : null; };
    function mfAsk(bytes, kind, ms = 120) { return new Promise(res => { MFQ.want = { kind, res, ack: () => res(true) }; mfOut().send([0xf0, 0x00, 0x20, 0x6b, ...bytes, 0xf7]); setTimeout(() => { res(false); }, ms); }); }
    let mfQ = Promise.resolve();
    const mfRead = (num, full) => (mfQ = mfQ.then(() => mfRead0(num, full)).catch(() => null));
    async function mfRead0(num, full) {
      const out = mfOut(); if (!out || !num) return null;
      const bank = Math.floor((num - 1) / 128), pre = (num - 1) % 128;
      MFQ.name = ""; MFQ.cat = null; MFQ.data = [];
      const ok = await mfAsk([0x07, 0x01, 0x00, 0x01, 0x19, bank, pre, 0x00], "name", 300);
      MFQ.want = null;
      if (ok && MFQ.name) { HW.mf.name = MFQ.name; HW.mf.cat = MFQ.cat; }
      if (full) {   // the saved preset's data, kept as it comes (40 blocks)
        await mfAsk([0x07, 0x01, 0x01, 0x01, 0x19, bank, pre, 0x01], "head", 120);
        for (let i = 0; i < 40; i++) { const got = await mfAsk([0x07, 0x01, i, 0x01, 0x18, 0x00], "data", 120); if (!got) break; }
        MFQ.want = null;
        return { name: HW.mf.name, cat: HW.mf.cat, raw: MFQ.data.length ? b64(MFQ.data) : null };
      }
      return { name: HW.mf.name, cat: HW.mf.cat };
    }
    // ---------- (221) picking what the MicroFreak plays, from here: any of its presets (their names and categories read
    // from it once, then kept), or its oscillator engine. It plays its own sound; Nate Bloom only tells it which. ----------
    const MF_ENG = [["Basic Waves", 5, 5], ["SuperWave", 14, 11], ["Wavetable", 19, 17], ["Harmo", 25, 23], ["Karplus Strong", 30, 29], ["V. Analog", 36, 34], ["Waveshaper", 41, 40], ["Two Op. FM", 47, 46],
      ["Formant", 52, 52], ["Chords", 58, 58], ["Speech", 63, 64], ["Modal", 69, 69], ["Noise", 74, 75], ["Bass", 80, 87], ["SawX", 85, 93], ["Harm", 91, 98], ["User Wavetable", 96, 104], ["Sample", 102, 110],
      ["Scan Grains", 107, 116], ["Cloud Grains", 113, 122], ["Hit Grains", 118, 127], ["Vocoder", 124, 81]];   // (name, value it takes, value it sends)
    const MFL = (() => { try { return JSON.parse(localStorage.getItem("nightbloom-mf-lib") || "null") || { names: [], cats: [] }; } catch (e) { return { names: [], cats: [] }; } })();
    const mflSave = () => { try { localStorage.setItem("nightbloom-mf-lib", JSON.stringify(MFL)); } catch (e) {} };
    const mfCh = () => { try { const X = window.__hwx && window.__hwx.get("mf"); if (X) return (X.cfg.ch - 1) & 15; const H = window.__hw; if (H && H.modelId && H.modelId() === "mf") return (H.ch - 1) & 15; } catch (e) {} return 0; };
    function mfSelect(num) {
      const out = mfOut(); if (!out) return false; const ch = mfCh(), bank = Math.floor((num - 1) / 128), pre = (num - 1) % 128;
      try { out.send([0xb0 | ch, 0, bank]); out.send([0xb0 | ch, 32, 0]); out.send([0xc0 | ch, pre]); } catch (e) { return false; }
      const M = HW.mf; M.bank = bank; M.pc = num; M.cc = {}; M.name = MFL.names[num - 1] || ""; M.cat = MFL.cats[num - 1] ?? null;
      mfRead(num, false).then(hwPaintSoon); hwPaintSoon(); return true;
    }
    function mfEngine(i) { const out = mfOut(), e = MF_ENG[i]; if (!out || !e) return; try { out.send([0xb0 | mfCh(), 9, e[1]]); } catch (er) {} HW.mf.cc[9] = e[2]; hwPaintSoon(); }
    const mfEngNow = () => { const v = HW.mf.cc[9]; if (v == null) return -1; let b = -1, d = 999; MF_ENG.forEach((e, i) => { const x = Math.abs(e[2] - v); if (x < d) { d = x; b = i; } }); return b; };
    // its preset names, read once in the background (about a second per 50) and kept
    const MFS = { on: false, n: 0 };
    async function mfScan(force) {
      if (MFS.on || !mfOut()) return; if (!force && MFL.names.filter(Boolean).length >= 500) return;
      MFS.on = true; let miss = 0;
      for (let n = 1; n <= 512; n++) {
        if (!force && MFL.names[n - 1]) continue;
        MFS.n = n; if (n % 16 === 0) hwPaintSoon();
        const r = await (mfQ = mfQ.then(async () => { const bank = Math.floor((n - 1) / 128), pre = (n - 1) % 128; MFQ.name = ""; MFQ.cat = null; const ok = await mfAsk([0x07, 0x01, 0x00, 0x01, 0x19, bank, pre, 0x00], "name", 250); MFQ.want = null; return ok && MFQ.name ? { name: MFQ.name, cat: MFQ.cat } : null; }).catch(() => null));
        if (r) { MFL.names[n - 1] = r.name; MFL.cats[n - 1] = r.cat; miss = 0; } else if (++miss >= 4) break;
      }
      MFL.at = Date.now(); mflSave(); MFS.on = false; hwPaintSoon();
    }
    // ---------- (222) the MicroFreak, two ways. Its own sounds: Nate Bloom sends it nothing (no notes, no clock) and takes
    // nothing from it (its keys, knobs, arp and sequencer are all its own); its sound can come in through an input, clean.
    // A Nate Bloom sound: its keys play the sound picked, and its knobs turn that sound's controls, matched by what they
    // do (Cutoff to the cutoff, Attack to the attack…). ----------
    const MFM_KEY = "nightbloom-mf-mode", MFR_KEY = "nightbloom-mf-route";
    let mfMode = (() => { try { return localStorage.getItem(MFM_KEY) === "nb" ? "nb" : "own"; } catch (e) { return "own"; } })();
    let mfRoute = (() => { try { return localStorage.getItem(MFR_KEY) || "stack"; } catch (e) { return "stack"; } })();
    window.__mfMode = () => mfMode; window.__mfRoute = () => mfRoute;
    const mdPort = kind => md.access ? [...md.access[kind === "in" ? "inputs" : "outputs"].values()].find(isMF) || null : null;
    function mfApply() {
      if (!md.access) return;
      const i = mdPort("in"), o = mdPort("out");
      if (o && md.outs.has(o.id)) { mdRemember("out", o, false); md.outs.delete(o.id); }   // (the sequencer's notes and clock never go to it)
      if (i) { const on = mfMode === "nb"; if (md.ins.has(i.id) !== on) { mdRemember("in", i, on); if (on) md.ins.add(i.id); else md.ins.delete(i.id); } if (on) mdRouteSet(i, mfRoute); }
      if (mfMode === "nb") { try { const st = window.__stk, it = st.items().find(x => x.t === "hwx" && x.id === "mf"); if (it) st.drop(it, true); } catch (e) {} }   // (227) with its own sounds it can play along in Playing too
      try { renderMidi(); } catch (e) {}
    }
    function mfSetMode(m) { mfMode = m; try { localStorage.setItem(MFM_KEY, m); } catch (e) {} mfApply(); hwPaintSoon(); try { window.__hwxRepaint && window.__hwxRepaint(); } catch (e) {} }
    setInterval(() => { if (md.access) { const i = mdPort("in"), o = mdPort("out"); if ((o && md.outs.has(o.id)) || (i && md.ins.has(i.id) !== (mfMode === "nb"))) mfApply(); } }, 2000);   // (and after a rescan or a replug)
    // its knobs on a Nate Bloom synth: each to the control that does the same job, the rest in order
    const MF_KN = [[23, /cut|bright|tone|filter|colou?r/i], [83, /res|peak|emph/i], [26, /env|amount|sweep/i], [105, /attack/i], [106, /decay|release/i], [29, /sustain/i],
      [12, /timbre|morph|harm|detune|tone|char/i], [13, /shape|pw|width|motion/i], [10, /wave|osc|mix|sub/i], [5, /glide|porta/i], [93, /rate|lfo|speed|vibrato|wobble|motion/i], [102, null], [103, null], [28, null], [24, null], [94, null]];
    const mfMaps = new Map();
    function mfMapFor(id) {
      if (mfMaps.has(id)) return mfMaps.get(id);
      const K = (ENGINES[id] && ENGINES[id].knobs) || [], used = new Set(), map = {};
      MF_KN.forEach(([cc, re]) => { if (!re) return; const k = K.find(x => !used.has(x[0]) && re.test(x[1])); if (k) { map[cc] = k; used.add(k[0]); } });
      MF_KN.forEach(([cc]) => { if (map[cc]) return; const k = K.find(x => !used.has(x[0])); if (k) { map[cc] = k; used.add(k[0]); } });
      mfMaps.set(id, map); return map;
    }
    const mfTarget = () => { if (mfRoute.startsWith("e:")) return mfRoute.slice(2); if (mfRoute !== "stack") return null; if (ENGINES[state.engine]) return state.engine; try { const it = window.__stk.items().find(x => x.t === "syn"); return it ? it.id : null; } catch (e) { return null; } };
    let mfSayT = 0;
    function mfKnob(cc, v) {
      const id = mfTarget(); if (!id || !ENGINES[id]) return false;
      const k = mfMapFor(id)[cc]; if (!k) return false;
      const x = v / 127, el = id === state.engine ? [...document.querySelectorAll("#engineKnobs .knob")].find(e => e.getAttribute("aria-label") === k[1]) : null;
      if (el && el.__nbSet) el.__nbSet(x); else { state.params[id] = state.params[id] || {}; state.params[id][k[0]] = x; clearTimeout(mfKnob.t); mfKnob.t = setTimeout(() => { try { save(); } catch (e) {} }, 400); }
      const t = document.getElementById("uiToast"); if (t) { t.textContent = "MicroFreak " + (MF_CC[cc] || "CC " + cc) + " → " + ENGINES[id].name + " " + k[1] + " " + Math.round(x * 100) + "%"; t.hidden = false; clearTimeout(mfSayT); mfSayT = setTimeout(() => { t.hidden = true; }, 1200); }
      return true;
    }
    { const om = onMidi; onMidi = function (e) {
        const p = e.target, d = e.data || [];
        if (p && isMF(p)) {
          if (mfMode !== "nb") return;   // its own sounds: nothing of it reaches Nate Bloom
          if ((d[0] & 0xf0) === 0xb0 && MF_KN.some(x => x[0] === d[1]) && mfKnob(d[1], d[2])) return;
        }
        return om.apply(this, arguments);
      }; }
    function mfModeUI(box) {
      const seg = mk("div", "hw-seg");
      [["own", "Its own sounds"], ["nb", "Plays a Nate Bloom sound"]].forEach(([v, t]) => { const b = mk("button", "btn" + (mfMode === v ? " on" : ""), t); b.setAttribute("aria-pressed", String(mfMode === v)); b.addEventListener("click", () => mfSetMode(v)); seg.appendChild(b); });
      box.appendChild(seg);
      if (mfMode === "own") {
        box.appendChild(mk("small", "hw-mfn", "Nate Bloom sends it nothing and takes nothing from it: its keys, knobs, arp and sequencer are all its own. Pick its presets and engine here."));
        box.appendChild(mk("small", "hw-mfn", "Its USB carries MIDI only, no sound. To hear it, run a 1/4\" cable from its Audio Out (back panel) to a free input on the Volt, or plug headphones into its own Phones jack."));
        const X = window.__hwx && window.__hwx.get("mf");
        if (X) {
          const r = mk("div", "hw-mfc"), ds = mk("select", "hw-sel"); ds.setAttribute("aria-label", "MicroFreak's sound comes in from");
          const add = (v, t) => { const o = mk("option", "", t); o.value = v; ds.appendChild(o); };
          add("", "Its sound: from its own outputs (not through Nate Bloom)");
          navigator.mediaDevices.enumerateDevices().then(ls => { ls.filter(x => x.kind === "audioinput").forEach((x, i) => add(x.deviceId, "Its sound comes in from: " + (x.label || "Input " + (i + 1)))); ds.value = X.cfg.dev || ""; }).catch(() => {});
          ds.addEventListener("change", () => { X.cfg.dev = ds.value; X.err = ""; try { window.__hwxCfgSave(); X.rewire && X.rewire(); } catch (e) {} hwPaintSoon(); });
          r.appendChild(ds);
          if (X.cfg.dev) {   // (227) which of its inputs: the Minilogue can be on 1 and this on 2
            const ps = mk("select", "hw-sel"); ps.setAttribute("aria-label", "Which inputs");
            [["12", "Inputs 1+2"], ["1", "Input 1"], ["2", "Input 2"]].forEach(([v, t]) => { const o = mk("option", "", t); o.value = v; ps.appendChild(o); });
            ps.value = X.cfg.pick || "12";
            ps.addEventListener("change", () => { X.cfg.pick = ps.value; try { window.__hwxCfgSave(); X.rewire && X.rewire(); } catch (e) {} });
            r.appendChild(ps);
          }
          box.appendChild(r);
          // (229) the input the Minilogue already comes in on (the Volt, or "default", which is it): its sound twice in recordings
          if (X.cfg.dev && (X.cfg.dev === "default" || (window.__hwProbe && window.__hwProbe.dev && X.cfg.dev === window.__hwProbe.dev)) && X.cfg.pick === "12")
            box.appendChild(mk("small", "hw-mfn", "That input is the Minilogue's too: with Inputs 1+2 the Minilogue comes in here a second time (twice as loud in recordings). Pick the one input the MicroFreak is on, or set it back to its own outputs."));
          { const t = window.__hwProbe && window.__hwProbe.text && window.__hwProbe.text("mf"); if (t) box.appendChild(mk("small", "hw-mfn", t)); }
          box.appendChild(mk("small", "hw-mfn", "+ on MicroFreak in Quick sounds plays it along with what's playing (your KeyLab's notes go to it too); its own keys still play only itself."));
        }
      } else {
        const r = mk("div", "hw-mfc"), rs = mk("select", "hw-sel"); rs.setAttribute("aria-label", "MicroFreak's keys play");
        let opts = []; try { opts = mdRouteOptions().filter(([v]) => v !== "none" && !/^hwx?:?/.test(v) && v !== "hw"); } catch (e) {}
        opts.forEach(([v, t]) => { const o = mk("option", "", "Its keys play: " + t); o.value = v; rs.appendChild(o); });
        rs.value = opts.some(o => o[0] === mfRoute) ? mfRoute : "stack";
        rs.addEventListener("change", () => { mfRoute = rs.value; try { localStorage.setItem(MFR_KEY, mfRoute); } catch (e) {} mfApply(); hwPaintSoon(); });
        r.appendChild(rs); box.appendChild(r);
        const id = mfTarget();
        if (id && ENGINES[id]) { const m = mfMapFor(id), g = mk("div", "nbk-xb"); g.appendChild(mk("h5", "", "Its knobs on " + ENGINES[id].name)); rows(g, MF_KN.filter(([cc]) => m[cc]).slice(0, 8).map(([cc]) => [MF_CC[cc] || "CC " + cc, m[cc][1]])); box.appendChild(g); }
        else box.appendChild(mk("small", "hw-mfn", "Its knobs go to the plugin it plays (the plugin's own MIDI learn takes them)."));
        box.appendChild(mk("small", "hw-mfn", "Its own sound still plays from its outputs: turn its volume down, or switch Local Control off (Utility › MIDI on the MicroFreak), to hear only Nate Bloom."));
      }
    }
    // the two drop-downs (the hardware panel's MicroFreak card, and its sheet)
    function mfCtl(box) {
      mfModeUI(box);
      if (mfMode === "nb") return;
      const on = !!mfOut(), M = HW.mf, row = mk("div", "hw-mfc");
      const ps = mk("select", "hw-sel"); ps.setAttribute("aria-label", "MicroFreak preset");
      const o0 = mk("option", "", on ? (M.pc ? "" : "Pick a preset…") : "Plug the MicroFreak in"); o0.value = ""; ps.appendChild(o0);
      const have = MFL.names.some(Boolean), groups = new Map();
      for (let n = 1; n <= 512; n++) { const nm = MFL.names[n - 1]; if (have && !nm) continue; const c = have ? (MF_CAT[MFL.cats[n - 1]] || "Other") : "Presets"; if (!groups.has(c)) groups.set(c, []); groups.get(c).push([n, nm]); }
      [...groups.keys()].sort((a, b) => a === "Presets" ? -1 : a.localeCompare(b)).forEach(c => { const g = mk("optgroup"); g.label = c; groups.get(c).forEach(([n, nm]) => { const o = mk("option", "", n + (nm ? " · " + nm : "")); o.value = n; g.appendChild(o); }); ps.appendChild(g); });
      ps.value = M.pc ? String(M.pc) : ""; ps.disabled = !on;
      ps.addEventListener("change", () => { const n = +ps.value; if (n) mfSelect(n); });
      const prev = mk("button", "btn", "◀"), next = mk("button", "btn", "▶"); prev.title = "Previous preset"; next.title = "Next preset"; prev.disabled = next.disabled = !on;
      prev.addEventListener("click", () => mfSelect(Math.max(1, (M.pc || 1) - 1))); next.addEventListener("click", () => mfSelect(Math.min(512, (M.pc || 0) + 1)));
      row.append(prev, ps, next); box.appendChild(row);
      const er = mk("div", "hw-mfc"); const es = mk("select", "hw-sel"); es.setAttribute("aria-label", "MicroFreak oscillator engine");
      const e0 = mk("option", "", "Engine: as the preset has it"); e0.value = ""; es.appendChild(e0);
      MF_ENG.forEach((e, i) => { const o = mk("option", "", "Engine: " + e[0]); o.value = i; es.appendChild(o); });
      const ei = mfEngNow(); es.value = ei >= 0 ? String(ei) : ""; es.disabled = !on;
      es.addEventListener("change", () => { if (es.value !== "") mfEngine(+es.value); });
      er.append(es); box.appendChild(er);
      const note = mk("small", "hw-mfn", MFS.on ? "Reading its preset names… " + MFS.n + " of 512" : have ? "" : on ? "Its preset names show once they're read." : "");
      if (note.textContent) box.appendChild(note);
      if (on && !MFS.on) setTimeout(() => mfScan(false), 400);
    }
    window.__mfCtl = mfCtl; window.__mfSel = mfSelect;
    async function hwReadXD() { const x = await xdRead(); if (!x.err) { HW.xd = x; HW.xdAt = Date.now(); HW.xdErr = ""; } else HW.xdErr = x.err; hwPaint(); }
    let hwPT = 0; const hwPaintSoon = () => { clearTimeout(hwPT); hwPT = setTimeout(hwPaint, 120); };
    const hs = mk("aside", "es hws"); hs.id = "hwSide"; hs.hidden = true; hs.setAttribute("aria-label", "Your hardware synths"); document.body.appendChild(hs);
    const appEl = document.querySelector(".app");
    function hwFits() {
      const q = document.getElementById("qk"); if (!appEl || !q || !q.offsetParent || document.body.classList.contains("live-on")) return null;
      const r = appEl.getBoundingClientRect(); if (r.left < 250) return null;
      let top = 0; ["shell", "buildBar", "miniStrip"].forEach(id => { const b = document.getElementById(id); if (b && b.offsetHeight && getComputedStyle(b).position === "fixed") { const br = b.getBoundingClientRect(); if (br.bottom > top && br.top < 200) top = br.bottom; } });
      const w = Math.min(420, Math.round(r.left - 22));
      return { left: Math.round(r.left - 10 - w), top: Math.round(top + 10), width: w };
    }
    let hwShown = false, hwStarted = false;
    function hwPlace() {
      const f = hwFits();
      if (!f) { if (hwShown) { hs.hidden = true; hwShown = false; } return; }
      hs.style.left = f.left + "px"; hs.style.top = f.top + "px"; hs.style.width = f.width + "px";
      if (!hwShown) { hs.hidden = false; hwShown = true; hwPaint(); if (!hwStarted) { hwStarted = true; xdAccess().then(() => { hwPaint(); hwReadXD(); }).catch(e => { HW.midiErr = (e && e.name) || "refused"; hwPaint(); }); } }
    }
    function hwCard(title, sub, live) {
      const c = mk("div", "hw-card"); const h = mk("div", "hw-h");
      h.append(mk("i", "hw-dot" + (live ? " on" : "")), mk("b", "", title)); if (sub) h.appendChild(mk("small", "", sub));
      c.appendChild(h); return c;
    }
    function rows(box, list) { const g = mk("div", "hw-g"); list.forEach(([l, v]) => { const r = mk("div", "nbk-xr"); r.append(mk("span", "", l), mk("b", "", String(v))); g.appendChild(r); }); box.appendChild(g); }
    function hwPaint() {
      if (!hwShown) return;
      const st = hs.scrollTop; hs.innerHTML = "";
      const top = mk("div", "es-top"); top.appendChild(mk("b", "", "Hardware")); top.appendChild(mk("small", "", "what your synths are on")); hs.appendChild(top);
      if (HW.midiErr) { hs.appendChild(mk("p", "es-none", "MIDI didn't open here (" + HW.midiErr + ").")); return; }
      const A = XD.access, ins = A ? [...A.inputs.values()] : [];
      // the Minilogue XD
      const xdOn = ins.some(xdName), c = hwCard("Minilogue XD", xdOn ? "" : "not plugged in", xdOn);
      if (HW.xd) {
        const p = HW.xd.p;
        const pr = mk("div", "hw-prog"); pr.append(mk("b", "", p.program_name || "(no name)"), mk("small", "", HW.xd.num ? "program " + HW.xd.num : "program number: change programs once and it shows")); c.appendChild(pr);
        const pick = ["Voice mode", "Wave", "Octave", "Shape", "Cutoff", "Resonance", "Attack", "Decay", "Sustain", "Release", "Type", "Rate", "Int", "Target", "Mod FX", "Mod FX type", "Delay", "Reverb"];
        let g = "", box = null; const grid = mk("div", "hw-xg"); c.appendChild(grid);
        SHOW.forEach(([grp, label, f, how]) => {
          if (["Program"].includes(grp) || !pick.includes(label) && !(grp === "Mixer")) return;
          const v = p[f]; if (v == null) return;
          if (grp !== g) { box = mk("div", "nbk-xb"); box.appendChild(mk("h5", "", grp)); grid.appendChild(box); g = grp; }
          rows(box, [[label, how(v)]]);
        });
      } else c.appendChild(mk("p", "es-none", xdOn ? (HW.xdErr || "Reading it…") : "Plug it in over USB; its program shows here."));
      const ca = mk("div", "hw-acts");
      const rf = mk("button", "btn", "Read now"); rf.addEventListener("click", hwReadXD);
      const sv = mk("button", "btn", "📓 Save sound"); sv.addEventListener("click", openSave);
      ca.append(rf, sv); c.appendChild(ca); hs.appendChild(c);
      // the MicroFreak
      const mfOn = ins.some(isMF), M = HW.mf, m = hwCard("MicroFreak", mfOn ? "" : "not plugged in", mfOn);
      const key = "mf:" + (M.pc || 0);
      const pr = mk("div", "hw-prog"); pr.append(mk("b", "", M.pc ? (M.name || HW.names[key] || "Preset " + M.pc) : "Preset: change presets once and it shows"), mk("small", "", M.pc ? "preset " + M.pc + (M.cat != null && MF_CAT[M.cat] ? " · " + MF_CAT[M.cat] : "") : "(it tells Nate Bloom which preset when the preset changes)"));
      m.appendChild(pr);
      mfCtl(m);
      if (M.pc && !M.name) {
        const nm = mk("input", "nbk-name hw-nm"); nm.placeholder = "Name this preset"; nm.value = HW.names[key] || "";
        nm.addEventListener("change", () => { HW.names[key] = nm.value.trim(); if (!HW.names[key]) delete HW.names[key]; try { localStorage.setItem("nightbloom-hwnames", JSON.stringify(HW.names)); } catch (e) {} hwPaint(); });
        m.appendChild(nm);
      }
      const ccs = Object.keys(M.cc).map(Number).sort((a, b) => a - b);
      if (ccs.length) { const box = mk("div", "nbk-xb"); box.appendChild(mk("h5", "", "Knobs since this preset")); rows(box, ccs.map(n => [MF_CC[n] || "CC " + n, Math.round(M.cc[n] / 127 * 100) + "% (" + M.cc[n] + ")"])); m.appendChild(box); }
      else m.appendChild(mk("p", "es-none", "Turn a knob on the MicroFreak and it shows here (its MIDI settings: CC output on)."));
      hs.appendChild(m);
      // anything else
      HW.other.forEach((o, name) => {
        const k = hwCard(name.replace(/\s*(MIDI\s*\d*|_.*)$/i, ""), "", ins.some(i => i.name === name));
        k.appendChild(mk("div", "hw-prog")).append(mk("b", "", o.pc ? "Program " + o.pc : "Program —"));
        const n = Object.keys(o.cc).map(Number).sort((a, b) => a - b); if (n.length) { const box = mk("div", "nbk-xb"); rows(box, n.slice(0, 24).map(x => ["CC " + x, o.cc[x]])); k.appendChild(box); }
        hs.appendChild(k);
      });
      hs.scrollTop = st;
    }
    window.__hws = { HW, paint: hwPaint, listen: hwListen, place: hwPlace };
    addEventListener("resize", hwPlace); setInterval(() => { if (!document.hidden) hwPlace(); }, 600); setTimeout(hwPlace, 0);
    // the notebook keeps the MicroFreak's part too
    { const ss = saveSound; saveSound = async function () { const e = await ss.apply(this, arguments); if (e && HW.mf.pc) { let r = null; try { r = await mfRead(HW.mf.pc, true); } catch (er) {} e.mf = { preset: HW.mf.pc, name: (r && r.name) || HW.mf.name || HW.names["mf:" + HW.mf.pc] || "", cat: r && r.cat != null && MF_CAT[r.cat] ? MF_CAT[r.cat] : "", cc: Object.assign({}, HW.mf.cc), raw: r && r.raw || null }; nbSave(); } return e; }; }
    window.__nbk = { openSave, openBook, read: xdRead, list: () => NOTES, decode: xdDecode, unpack7, pack7 };
  }
