  // ======================================================================
  // (216, Linux) The sound notebook. "📓 Save sound" on the Playing row keeps everything about the moment: what Nate
  // Bloom is playing (each sound, its preset, engine or plugin, all its settings, effects, tempo; the whole thing
  // reloads like a Favorite), and what the Minilogue XD is on, read from the XD itself over USB: its program name and
  // number, and every parameter that makes the sound (oscillators, multi engine, filter, envelopes, LFO, effects), with
  // the XD's own program data kept so the notebook can send the sound back to the XD. Notes are yours to write.
  // The XD's program format is Korg's (minilogue xd MIDI implementation; field layout as in loguetools, BSD).
  // ======================================================================
  if (window.NB_NATIVE && NB_NATIVE.platform === "linux") {
    const NB_KEY = "nightbloom-notebook";
    let NOTES = []; try { NOTES = JSON.parse(localStorage.getItem(NB_KEY) || "[]"); if (!Array.isArray(NOTES)) NOTES = []; } catch (e) { NOTES = []; }
    const nbSave = () => { try { localStorage.setItem(NB_KEY, JSON.stringify(NOTES)); return true; } catch (e) { toast("The notebook is full: export it, then delete some entries"); return false; } };
    const mk = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    const toast = m => { const el = document.getElementById("uiToast"); if (!el) return; el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3200); };

    // ---------- the Minilogue XD ----------
    const XD = { access: null, prog: null, bank: 0, lastPC: null, wait: null };
    const XD_FIELDS = [["program_name", 4, 12], ["octave", 16, 1], ["portamento", 17, 1], ["voice_mode_depth", 19, 2], ["voice_mode_type", 21, 1], ["vco_1_wave", 22, 1], ["vco_1_octave", 23, 1], ["vco_1_pitch", 24, 2], ["vco_1_shape", 26, 2], ["vco_2_wave", 28, 1], ["vco_2_octave", 29, 1], ["vco_2_pitch", 30, 2], ["vco_2_shape", 32, 2], ["sync", 34, 1], ["ring", 35, 1], ["cross_mod_depth", 36, 2], ["multi_type", 38, 1], ["select_noise", 39, 1], ["select_vpm", 40, 1], ["select_user", 41, 1], ["shape_noise", 42, 2], ["shape_vpm", 44, 2], ["shape_user", 46, 2], ["shift_shape_noise", 48, 2], ["shift_shape_vpm", 50, 2], ["shift_shape_user", 52, 2], ["vco_1_level", 54, 2], ["vco_2_level", 56, 2], ["multi_level", 58, 2], ["cutoff", 60, 2], ["resonance", 62, 2], ["cutoff_drive", 64, 1], ["cutoff_keyboard_track", 65, 1], ["amp_eg_attack", 66, 2], ["amp_eg_decay", 68, 2], ["amp_eg_sustain", 70, 2], ["amp_eg_release", 72, 2], ["eg_attack", 74, 2], ["eg_decay", 76, 2], ["eg_int", 78, 2], ["eg_target", 80, 1], ["lfo_wave", 81, 1], ["lfo_mode", 82, 1], ["lfo_rate", 83, 2], ["lfo_int", 85, 2], ["lfo_target", 87, 1], ["mod_fx_on_off", 88, 1], ["mod_fx_type", 89, 1], ["mod_fx_chorus", 90, 1], ["mod_fx_ensemble", 91, 1], ["mod_fx_phaser", 92, 1], ["mod_fx_flanger", 93, 1], ["mod_fx_user", 94, 1], ["mod_fx_time", 95, 2], ["mod_fx_depth", 97, 2], ["delay_on_off", 99, 1], ["delay_sub_type", 100, 1], ["delay_time", 101, 2], ["delay_depth", 103, 2], ["reverb_on_off", 105, 1], ["reverb_sub_type", 106, 1], ["reverb_time", 107, 2], ["reverb_depth", 109, 2], ["bend_range_plus", 111, 1], ["bend_range_minus", 112, 1], ["cutoff_velocity", 128, 1], ["amp_velocity", 129, 1], ["multi_octave", 130, 1], ["multi_routing", 131, 1], ["eg_legato", 132, 1], ["portamento_mode", 133, 1], ["program_level", 135, 1], ["vpm_param1_feedback", 136, 1], ["vpm_param2_noise_depth", 137, 1], ["vpm_param3_shapemodint", 138, 1], ["vpm_param4_mod_attack", 139, 1], ["vpm_param5_mod_decay", 140, 1], ["vpm_param6_modkeytrack", 141, 1], ["program_transpose", 150, 1], ["delay_dry_wet", 151, 2], ["reverb_dry_wet", 153, 2]];
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
      ["Program", "Level", "program_level", v => v], ["Program", "Transpose", "program_transpose", v => (v - 13 > 0 ? "+" : "") + (v - 13)], ["Program", "Amp velocity", "amp_velocity", v => v], ["Program", "Bend range +/−", "bend_range_plus", v => v],
    ];
    function xdDecode(bytes) {
      const o = {}, u8 = bytes;
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
      const hook = () => XD.access.inputs.forEach(i => { if (xdName(i)) i.addEventListener("midimessage", xdMsg); });
      hook(); XD.access.addEventListener("statechange", e => { if (e.port && e.port.type === "input" && e.port.state === "connected" && xdName(e.port)) e.port.addEventListener("midimessage", xdMsg); });
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
    async function saveSound(name, notes, wantXD) {
      const e = { id: "n" + Date.now().toString(36), name, notes: notes || "", at: Date.now(), nb: nbSummary() };
      try { e.snap = await window.__fav.capture(name); } catch (er) {}
      if (wantXD) { const x = await xdRead(); if (x.err) e.xdErr = x.err; else e.xd = x; }
      NOTES.unshift(e); if (!nbSave()) { NOTES.shift(); return null; }
      return e;
    }
    function textOf(e) {
      const L = [e.name, new Date(e.at).toLocaleString(), ""];
      L.push("NATE BLOOM" + (e.nb.bpm ? " · " + e.nb.bpm + " bpm" : ""));
      e.nb.sounds.forEach(s => { L.push("• " + s.name + " (" + s.what + ")"); if (s.knobs) L.push("    " + s.knobs.map(([l, v]) => l + " " + v).join(" · ")); });
      if (e.nb.fx.length) L.push("Effects: " + e.nb.fx.join(", "));
      if (e.xd) {
        L.push("", "MINILOGUE XD · " + e.xd.p.program_name + (e.xd.num ? " · program " + e.xd.num : ""));
        let g = ""; SHOW.forEach(([grp, label, f, how]) => { const v = e.xd.p[f]; if (v == null) return; if (grp !== g) { L.push(grp + ":"); g = grp; } L.push("    " + label + ": " + how(v)); });
      } else if (e.xdErr) L.push("", "Minilogue XD: " + e.xdErr);
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
      const nm = mk("input", "nbk-name"); nm.type = "text"; nm.value = its.map(i => i.name).join(" + ").slice(0, 60) || "My sound"; nm.setAttribute("aria-label", "Name");
      const nt = mk("textarea", "nbk-notes"); nt.placeholder = "Notes: what it's for, the song, what you'd change…"; nt.rows = 4;
      const xdRow = mk("label", "nbk-xd"); const cb = mk("input"); cb.type = "checkbox"; cb.checked = true; xdRow.append(cb, mk("span", "", " Read what the Minilogue XD is on"));
      const info = mk("p", "nbk-info", "Saves what Nate Bloom is playing (everything, so it reloads) and the XD's program: its name, number and every parameter.");
      const go = mk("button", "btn big primary", "Save to notebook");
      go.addEventListener("click", async () => {
        go.disabled = true; go.textContent = cb.checked ? "Reading the Minilogue XD…" : "Saving…";
        const e = await saveSound(nm.value.trim() || "My sound", nt.value, cb.checked);
        go.disabled = false; go.textContent = "Save to notebook";
        if (!e) return;
        toast("Saved 📓 " + e.name + (e.xd ? " · XD: " + e.xd.p.program_name : e.xdErr ? " · " + e.xdErr : ""));
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
      } else xs.appendChild(mk("p", "nbk-info", e.xdErr ? "Minilogue XD: " + e.xdErr : "No Minilogue XD part. Re-read XD adds it."));
      body.appendChild(xs);
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
    window.__nbk = { openSave, openBook, read: xdRead, list: () => NOTES, decode: xdDecode, unpack7, pack7 };
  }
