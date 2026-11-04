  // ======================================================================
  // (177) VST3 and CLAP plugins in the Linux app. The app finds the plugins on this computer (~/.vst3, ~/.clap, the
  // system folders and any you add) and lists them in Plugins with the others: an instrument plays alone or together
  // with what's playing (the stack, chords, Hold, the arp, the sequencer), an effect goes on the mix, a send, a sound's
  // channel or another plugin. Each one runs in the app's native plugin host (nb_plug.cc) on a thread of its own,
  // through shared memory this AudioWorklet ("nb-plug-io") reads and writes, so its sound goes through Nate Bloom's
  // mixer, effects, recording and Log like any other. Its own controls open in a window of its own.
  // Anywhere else (the website, the tablet, Lite) none of this is here.
  // ======================================================================
  {
    const NP = window.NBPlug || null;
    const PL = window.__nbPlug = { ok: !!NP, plugins: [], errors: [], folders: null, at: null, scanning: false, suspects: {}, live: new Map(), msg: "", shown: false };
    const setup = () => {
      const CAP = 8192, W = window.__nbw;
      const SRC = `class NBPlugIO extends AudioWorkletProcessor {
  constructor(o) { super(); const p = o.processorOptions; this.h = new Float64Array(p.hdr); this.i = new Float32Array(p.inR); this.o = new Float32Array(p.outR); this.cap = p.cap; this.fx = p.fx; this.lat = this.h[6] || 384; this.live = true;
    this.port.onmessage = e => { if (e.data === "stop") this.live = false; }; }
  process(inputs, outputs) {
    const h = this.h, cap = this.cap, f0 = currentFrame, out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    if (this.fx) {
      const a = inputs[0] && inputs[0][0], b = inputs[0] && (inputs[0][1] || inputs[0][0]), i0 = f0 % cap;
      for (let i = 0; i < n; i++) { const k = (i0 + i) % cap; this.i[k] = a ? a[i] : 0; this.i[cap + k] = b ? b[i] : 0; }
      h[0] = f0 + n;
      const rf = f0 - this.lat;
      if (rf >= 0 && h[1] >= rf + n) { const r0 = rf % cap; for (let i = 0; i < n; i++) { const k = (r0 + i) % cap; L[i] = this.o[k]; R[i] = this.o[cap + k]; } }
      else if (rf >= 0 && h[1] > 0) { h[2]++; if (this.lat < 2048 && f0 - (this.bump || 0) > 4800) { this.lat += 128; h[6] = this.lat; this.bump = f0; } }   // (it wasn't ready: a little more room from now on)
    } else {
      if (h[1] >= f0 + n) { const i0 = f0 % cap; for (let i = 0; i < n; i++) { const k = (i0 + i) % cap; L[i] = this.o[k]; R[i] = this.o[cap + k]; } }
      else if (h[1] > 0) { h[2]++; if (h[5] < 2048 && f0 - (this.bump || 0) > 4800) { h[5] += 128; this.bump = f0; } }
      h[0] = f0 + n;
    }
    return this.live;
  }
}
registerProcessor("nb-plug-io", NBPlugIO);`;
      const mods = new WeakMap();
      const addMod = c => { if (!mods.has(c)) mods.set(c, c.audioWorklet.addModule(URL.createObjectURL(new Blob([SRC], { type: "text/javascript" })))); return mods.get(c); };
      const fmtName = f => f === "clap" ? "CLAP" : f === "lv2" ? "LV2" : "VST3";
      const keyOf = f => "vst:" + f.fmt + ":" + f.uid + "@" + f.path;
      const parse = key => { const m = /^vst:(clap|vst3|lv2):([^@]*)@(.+)$/.exec(key); return m ? { fmt: m[1], uid: m[2], path: m[3] } : null; };
      const base = p => String(p).split("/").filter(Boolean).pop().replace(/\.(vst3|clap)$/i, "");
      const catOf = f => ({ key: keyOf(f), name: f.name, vendor: f.vendor || fmtName(f.fmt), kind: f.kind === "instrument" ? "instrument" : "effect", type: fmtName(f.fmt) + " on this computer",
        desc: [fmtName(f.fmt), f.version ? "v" + f.version : "", f.features ? f.features.split(/[|,]/).filter(x => !/^(fx|instrument|audio-effect|stereo|mono)$/i.test(x)).slice(0, 3).join(", ").toLowerCase() : "", "in " + f.path.replace(/^\/home\/[^/]+/, "~")].filter(Boolean).join(" · "),
        native: true, fmt: f.fmt, path: f.path, uid: f.uid });
      function fill(r) {
        if (!r) return;
        PL.plugins = r.plugins || []; PL.errors = r.errors || []; PL.folders = r.folders || null; PL.at = r.at || null;
        for (let i = W.CAT.length - 1; i >= 0; i--) if (W.CAT[i].native) W.CAT.splice(i, 1);
        W.CAT.unshift(...PL.plugins.map(catOf).sort((a, b) => a.fmt.localeCompare(b.fmt) || a.name.localeCompare(b.name)));   // (yours first in each list, CLAP then VST3)
      }
      window.__nbPlugSpec = key => {
        const c = W.CAT.find(x => x.key === key); if (c) return c;
        const p = parse(key); if (!p) return null;
        return { key, name: base(p.path), vendor: fmtName(p.fmt), kind: "instrument", type: fmtName(p.fmt) + " on this computer", desc: "", native: true, ...p };   // (not found in the last look: tried anyway)
      };
      // ---- an instance, looking like a Web Audio Module to the rest of Plugins (340) ----
      window.__nbPlugCreate = async (sp, c) => {
        if (PL.suspects[sp.key]) throw new Error(sp.name + " was loaded when Nate Bloom crashed, so it waits: load it again from Plugins (Load anyway)");
        const info = await NP.load(sp.fmt, sp.path, sp.uid, c.sampleRate, sp.key);
        const id = info.id, fx = !info.instrument;
        let node = null;
        try {
          await addMod(c);
          const hdr = new SharedArrayBuffer(64), inR = new SharedArrayBuffer(CAP * 8), outR = new SharedArrayBuffer(CAP * 8), h = new Float64Array(hdr);
          h[0] = Math.floor(c.currentTime * c.sampleRate); h[3] = CAP; h[4] = fx ? 2 : 1; h[5] = window.__nbAhead ? window.__nbAhead(c) : 256; h[6] = Math.max(384, h[5] + 128);   // (180: past the browser's burst, as the engine)   // (an effect's output plays 384 frames, 8 ms, after its input; more if it needs it)
          node = new AudioWorkletNode(c, "nb-plug-io", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit", processorOptions: { hdr, inR, outR, cap: CAP, fx } });
          const ans = await new Promise(res => {
            const tok = Math.random().toString(36).slice(2), to = setTimeout(() => { removeEventListener("message", on); res({ ok: false, why: "the app didn't answer" }); }, 3000);
            const on = e => { const d = e.data && e.data.nbPlugAttached; if (!d || d.id !== tok) return; clearTimeout(to); removeEventListener("message", on); res(d); };
            addEventListener("message", on);
            postMessage({ nbPlugAttach: { id: tok, inst: id, hdr, inR, outR, cap: CAP } }, location.origin);
          });
          if (!ans.ok) throw new Error(ans.why || "its sound couldn't be connected");
          if (!fx) { const keep = c.createGain(); keep.gain.value = 0; node.connect(keep).connect(c.destination); node.__keep = keep; }   // (it keeps running while nothing else listens)
          node.__hdr = h;
        } catch (e) { try { node && node.port.postMessage("stop"); } catch (er) {} NP.unload(id).catch(() => {}); throw e; }
        let params = info.params || [];
        const P = { id, fx, name: info.name, vendor: info.vendor, gui: info.gui, key: sp.key, fmt: sp.fmt, node, ctx: c, params, open: false };
        PL.live.set(id, P);
        const fr = t => Math.round((t == null ? c.currentTime : Math.max(c.currentTime, t)) * c.sampleRate);
        const norm = (p, v) => p.max > p.min ? (v - p.min) / (p.max - p.min) : 0, plain = (p, n) => p.min + n * (p.max - p.min);
        const pById = pid => params.find(p => String(p.id) === String(pid));
        Object.assign(node, {
          scheduleEvents: (...evs) => evs.flat().forEach(ev => { if (ev && ev.type === "wam-midi" && ev.data && ev.data.bytes) { const b = ev.data.bytes; NP.midi(id, fr(ev.time), b[0] | 0, b[1] | 0, b[2] | 0); } }),
          clearEvents: () => NP.flush(id),
          getState: async () => ({ nbplug: 1, fmt: sp.fmt, uid: sp.uid, state: await NP.getState(id) }),
          setState: async s => { if (s && s.nbplug && s.state) await NP.setState(id, s.state); },
          getParameterInfo: async () => { try { params = await NP.params(id); P.params = params; } catch (e) {} const o = {};
            params.filter(p => p.auto !== false).forEach(p => { o[String(p.id)] = { id: String(p.id), label: p.name, type: p.steps ? "int" : "float", minValue: 0, maxValue: 1, defaultValue: norm(p, p.def), discreteStep: p.steps ? 1 / p.steps : 0 }; }); return o; },
          getParameterValues: async (normalized, ...ids) => { try { params = await NP.params(id); P.params = params; } catch (e) {} const o = {};
            params.forEach(p => { if (ids.length && !ids.map(String).includes(String(p.id))) return; o[String(p.id)] = { id: String(p.id), value: normalized ? norm(p, p.value) : p.value, normalized: !!normalized }; }); return o; },
          setParameterValues: async obj => { for (const k in obj) { const p = pById(k), x = obj[k]; if (!p || !x) continue; const v = x.normalized === false ? x.value : plain(p, Math.max(0, Math.min(1, x.value))); NP.param(id, p.id, v); } },
          destroy: () => { PL.live.delete(id); try { node.port.postMessage("stop"); } catch (e) {} try { node.disconnect(); } catch (e) {} if (node.__keep) try { node.__keep.disconnect(); } catch (e) {} NP.unload(id).catch(() => {}); },
        });
        const inst = {
          descriptor: { name: info.name, vendor: info.vendor },
          audioNode: node,
          // its own controls: a window of its own beside Nate Bloom's (this panel says so, and can bring it back or close it)
          createGui: async () => {
            const box = document.createElement("div"); box.className = "nbp-gui";
            const p = document.createElement("p"); p.className = "wam-msg"; box.appendChild(p);
            const row = document.createElement("div"); row.className = "nbp-row"; box.appendChild(row);
            const b = (t, fn) => { const x = document.createElement("button"); x.className = "btn"; x.textContent = t; x.addEventListener("click", fn); row.appendChild(x); return x; };
            // (184) a plugin with no window of its own (a VST3 built without an editor, as nih-plug makes them by default),
            // or one whose window won't open here: its parameters as sliders in this panel, as a DAW shows them
            const gen = document.createElement("div"); gen.className = "nbp-params"; gen.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow-y:auto;margin-top:8px"; box.appendChild(gen);
            let genT = 0;
            const fmtV = (q, v) => q.steps > 0 && q.steps <= 12 ? String(Math.round(v)) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
            async function sliders() {
              let ps = []; try { ps = await NP.params(id); P.params = ps; } catch (e) {}
              gen.innerHTML = "";
              const list = ps.filter(q => q.auto !== false && q.max > q.min);
              if (!list.length) { const n = document.createElement("p"); n.className = "wam-msg dim"; n.textContent = "It shows no parameters either."; gen.appendChild(n); return; }
              list.forEach(q => {
                const r = document.createElement("label"); r.className = "ly-quick"; r.style.cssText = "align-items:center;gap:8px";
                const nm = document.createElement("span"); nm.className = "dj-lab"; nm.style.cssText = "flex:0 0 38%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"; nm.textContent = q.name; nm.title = q.name;
                const sl = document.createElement("input"); sl.type = "range"; sl.min = 0; sl.max = 1000; sl.style.flex = "1"; sl.setAttribute("aria-label", q.name); sl.dataset.pid = q.id;
                const vv = document.createElement("span"); vv.className = "dj-lab"; vv.style.cssText = "min-width:52px;text-align:right";
                const toN = v => Math.round((v - q.min) / (q.max - q.min) * 1000), toV = n => { let v = q.min + n / 1000 * (q.max - q.min); if (q.steps > 0) { const st = (q.max - q.min) / q.steps; v = q.min + Math.round((v - q.min) / st) * st; } return v; };
                sl.value = toN(q.value); vv.textContent = fmtV(q, q.value);
                sl.addEventListener("input", () => { const v = toV(+sl.value); vv.textContent = fmtV(q, v); try { NP.param(id, q.id, v); } catch (e) {} sl.__t = Date.now(); });
                sl.__q = q; sl.__vv = vv; r.append(nm, sl, vv); gen.appendChild(r);
              });
              clearInterval(genT);
              genT = setInterval(async () => {   // (moves made from MIDI learn, automation or the plugin itself show here)
                if (!box.isConnected) { clearInterval(genT); return; }
                let ps2 = []; try { ps2 = await NP.params(id); } catch (e) { return; }
                gen.querySelectorAll("input[type=range]").forEach(sl => { if (Date.now() - (sl.__t || 0) < 800) return; const q2 = ps2.find(x => String(x.id) === sl.dataset.pid); if (!q2) return; const q = sl.__q; sl.value = Math.round((q2.value - q.min) / (q.max - q.min) * 1000); sl.__vv.textContent = fmtV(q, q2.value); });
              }, 600);
            }
            const show = async () => {
              if (!info.gui) { row.hidden = true; p.textContent = info.name + " has no window of its own, so its controls are here (and under MIDI learn and Tracks automation)."; sliders(); return; }
              p.textContent = "Opening " + info.name + "'s window…";
              let r = null; try { r = await NP.gui(id, true, info.name + " · Nate Bloom"); } catch (e) { r = { open: false, why: String(e && e.message || e) }; }
              P.open = !!(r && r.open);
              if (P.open) { p.textContent = info.name + "'s own controls are in their own window, beside Nate Bloom's. Close it there or here; what you change is kept with the plugin."; gen.innerHTML = ""; clearInterval(genT); }
              else { const why = r && r.why ? r.why : ""; p.textContent = /has no window/.test(why) ? info.name + " has no window of its own (it was built without one), so its controls are here, and under MIDI learn and Tracks automation." : "Its window didn't open" + (why ? ": " + why : "") + ", so its controls are here."; sliders(); }
            };
            b("Show its window", show); b("Close its window", async () => { try { await NP.gui(id, false); } catch (e) {} P.open = false; p.textContent = "Closed. Show its window opens it again."; });
            show();
            return box;
          },
          destroyGui: () => {},
        };
        return inst;
      };
      // a plugin's window closed by itself, and the controls it changed (so automation and the panel keep up)
      setInterval(() => { if (!PL.live.size) return; let n = []; try { n = NP.notices() || []; } catch (e) {} n.forEach(s => { const m = /^closed:(\d+)$/.exec(s); if (m) { const P = PL.live.get(+m[1]); if (P) P.open = false; }
        const c = /^crashed:(\d+)$/.exec(s); if (c) { const P = PL.live.get(+c[1]); if (P) { P.crashed = true; P.open = false;   // (184) it crashed in its own process: the page carried on
          PL.msg = P.name + " crashed (in its own process, so Nate Bloom carried on) and is silent now. Remove it and add it again to bring it back.";
          try { if (typeof betaToast === "function") betaToast(P.name + " crashed; Nate Bloom carried on"); } catch (e) {} try { window.__nbAdd && window.__nbAdd("plugin", P.name + " crashed in its own process"); } catch (e) {} W.paint(); } } }); }, 1000);
      // the tempo and whether the sequencer plays, for plugins that follow them (arpeggiators, synced delays)
      setInterval(() => { try { NP.transport(state.seq.bpm, false); } catch (e) {} }, 1000);
      // ---- looking for plugins ----
      async function refresh(full) {
        PL.scanning = true; PL.msg = ""; W.paint();
        try { fill(await NP.scan(!!full)); PL.msg = PL.plugins.length ? "" : "No VST3, CLAP or LV2 plugins found yet."; } catch (e) { PL.msg = "Couldn't look for plugins: " + (e && e.message || e); }
        PL.scanning = false; try { PL.suspects = await NP.suspects() || {}; } catch (e) {}
        W.paint();
      }
      NP.list().then(r => { fill(r); refresh(false); }).catch(() => {});   // (what was found last time at once, then a quick look for new or changed files)
      PL.refresh = full => refresh(full);
      NP.suspects().then(s => { PL.suspects = s || {}; }).catch(() => {});
      // ---- in the Plugins sheet (340 calls this) ----
      window.__nbPlugPaint = ({ list, head, note, row, btn, repaint }) => {
        head("VST3, CLAP and LV2 on this computer");
        const ni = PL.plugins.filter(f => f.kind === "instrument").length, ne = PL.plugins.length - ni;
        const F = PL.folders, where = F ? [...new Set([...F.vst3.slice(0, 1), ...F.clap.slice(0, 1), ...(F.lv2 || []).slice(0, 1)])].map(x => x.replace(/^\/home\/[^/]+/, "~")).join(" and ") : "~/.vst3, ~/.clap and ~/.lv2";
        note(PL.scanning ? "Looking for plugins…" : PL.plugins.length
          ? ni + " instrument" + (ni === 1 ? "" : "s") + " (first under Instruments) and " + ne + " effect" + (ne === 1 ? "" : "s") + " (first under + Add an effect). They're looked for in " + where + ", the system's plugin folders and the folders you add."
          : "Put .vst3, .clap and .lv2 plugins (Linux builds) in " + where + ", or add the folder they're in, then Look again. Each runs on a thread of its own, its controls in a window of its own.", true);
        const bar = document.createElement("div"); bar.className = "wam-tg";
        bar.append(btn(PL.scanning ? "Looking…" : "Look again", () => { if (!PL.scanning) refresh(false); }), btn("Add a folder…", async () => { PL.scanning = true; repaint(); try { const r = await NP.addFolder(); if (r) fill(r); } catch (e) {} PL.scanning = false; repaint(); }));
        let o = { on: false, next: false }; try { if (typeof NP.oop === "function") o = NP.oop(); } catch (e) {}
        if (o.on || o.next) {   // (184) each plugin in its own process: held back (in testing it took the app's helper processes down); shown only where it was switched on

          const b = btn((o.next ? "✓ " : "") + "Each in its own process", () => { NP.setOop(!o.next); repaint(); }, null, "A plugin that crashes then takes only itself down. Takes effect the next time Nate Bloom opens.");
          b.setAttribute("aria-pressed", String(!!o.next)); bar.append(b);
          if (o.next !== o.on) note(o.next ? "Plugins run in their own processes the next time Nate Bloom opens." : "Plugins run inside Nate Bloom again the next time it opens.");
        }
        if (PL.folders && PL.folders.own && PL.folders.own.length) PL.folders.own.forEach(f => bar.append(btn("✕ " + f.replace(/^\/home\/[^/]+/, "~"), async () => { fill(await NP.removeFolder(f)); repaint(); }, null, "Stop looking in " + f)));
        list.appendChild(bar);
        const sus = Object.keys(PL.suspects || {});
        sus.forEach(k => {
          const sp = window.__nbPlugSpec(k), r = row("", sp ? sp.name : k, "It was loaded when Nate Bloom closed unexpectedly, so it doesn't load by itself. Load anyway lets it again.");
          r.append(btn("Load anyway", async () => { try { PL.suspects = await NP.trust(k) || {}; } catch (e) {} repaint(); }, null, "Let " + (sp ? sp.name : "it") + " load again"));
          list.appendChild(r);
        });
        if (PL.errors.length) {
          const d = document.createElement("details"); d.className = "nbp-err"; const s = document.createElement("summary"); s.textContent = PL.errors.length + " file" + (PL.errors.length === 1 ? "" : "s") + " couldn't be used"; d.appendChild(s);
          PL.errors.forEach(e => { const p = document.createElement("p"); p.className = "wam-msg dim"; p.textContent = e.path.replace(/^\/home\/[^/]+/, "~") + ": " + e.error; d.appendChild(p); });
          list.appendChild(d);
        }
        if (PL.msg) note(PL.msg);
        if (!PL.shown && !PL.at && !PL.scanning) { PL.shown = true; refresh(false); }
        if (window.__nbInputPaint) window.__nbInputPaint({ list, head, note, row, btn, repaint });   // (183) your inputs through plugins (840)
        storePaint({ list, head, note, row, btn, repaint });
      };
      // ---- (199) Get free plugins: open-source instruments and effects, each from its own project's latest Linux release,
      // installed into ~/.clap, ~/.vst3 or ~/.lv2 (no password), then found by the scan like any other ----
      const ST = { items: null, busy: new Map(), err: {}, all: false };
      const SP = NP.store || null;
      async function storeLoad() { if (!SP) return; try { ST.items = await SP.list(); } catch (e) { ST.items = []; } }
      if (SP) { storeLoad(); SP.onProgress(m => { if (!m || !m.id) return; if (m.stage === "failed") { ST.busy.delete(m.id); ST.err[m.id] = m.error; } else ST.busy.set(m.id, m); try { W.paint(); } catch (e) {} }); }
      async function storeGet(id) {
        delete ST.err[id]; ST.busy.set(id, { id, stage: "starting", frac: 0 }); W.paint();
        let r = null; try { r = await SP.install(id); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
        ST.busy.delete(id); if (!r || !r.ok) ST.err[id] = (r && r.error) || "didn't install";
        await storeLoad(); return !!(r && r.ok);
      }
      async function storeGetAll() {
        if (ST.all || !ST.items) return; ST.all = true; W.paint();
        for (const it of ST.items) if (!it.installed && !ST.busy.has(it.id)) await storeGet(it.id);
        ST.all = false; await refresh(false); W.paint();
      }
      function storePaint({ list, head, note, row, btn, repaint }) {
        if (!SP) return;
        head("Get free plugins");
        if (!ST.items) { note("Loading the list…"); storeLoad().then(repaint); return; }
        const left = ST.items.filter(x => !x.installed).length;
        note("Free, open-source instruments and effects. Each comes from its own project's latest Linux release and goes into your home folder (~/.clap, ~/.vst3 or ~/.lv2), so Bitwig finds them too. Synths and samplers then show under Instruments; effects under + Add an effect.", true);
        const bar = document.createElement("div"); bar.className = "wam-tg";
        bar.append(btn(ST.all ? "Installing…" : left ? "Get all " + left : "All installed ✓", () => storeGetAll(), null, "Download and install every plugin below that isn't installed yet"));
        list.appendChild(bar);
        const kinds = [["synth", "Synths"], ["sampler", "Samplers"], ["fx", "Effects"]];
        kinds.forEach(([k, label]) => {
          const its = ST.items.filter(x => x.kind === k); if (!its.length) return;
          const h = document.createElement("div"); h.className = "wam-msg dim"; h.textContent = label; list.appendChild(h);
          its.forEach(it => {
            const b = ST.busy.get(it.id), er = ST.err[it.id];
            const sub = b ? (b.stage + (b.frac && b.frac < 1 ? " · " + Math.round(b.frac * 100) + "%" : "")) : er ? "Couldn't install: " + er : it.installed ? "Installed · " + it.installed.tag + " · " + it.installed.fmt.toUpperCase() + " · " + it.licence : it.blurb + " · " + it.licence;
            const r = row("", it.name, sub);
            if (b) { /* in progress */ }
            else if (it.installed) {
              r.append(btn("Update", async () => { await storeGet(it.id); await refresh(false); repaint(); }, null, "Get " + it.name + "'s latest release again"));
              r.append(btn("Remove", async () => { try { await SP.remove(it.id); } catch (e) {} await storeLoad(); await refresh(false); repaint(); }, null, "Delete " + it.name + "'s files from your home folder"));
            } else r.append(btn(er ? "Try again" : "Get", async () => { const ok = await storeGet(it.id); if (ok) await refresh(false); repaint(); }, null, "Download and install " + it.name));
            list.appendChild(r);
          });
        });
      }
      window.__nbStore = { ST, load: storeLoad, get: storeGet, getAll: storeGetAll };
      // Settings › App and the report: what's loaded and how hard each one works
      PL.state = () => [...PL.live.values()].map(P => { let s = null; try { s = NP.stats(P.id); } catch (e) {} return { name: P.name, fmt: P.fmt, fx: P.fx, open: P.open, crashed: !!P.crashed, underruns: P.node.__hdr ? P.node.__hdr[2] : 0, delayMs: P.fx && P.node.__hdr ? Math.round(P.node.__hdr[6] / P.ctx.sampleRate * 1000) : 0, blockUs: s ? Math.round(s.blockUs) : null, budgetUs: s ? Math.round(s.budgetUs) : null }; });
    };
    PL.state = () => [];
    if (NP) { if (window.__nbw) setup(); else { let n = 0; const iv = setInterval(() => { if (window.__nbw) { clearInterval(iv); setup(); } else if (++n > 100) { clearInterval(iv); PL.why = "the Plugins sheet isn't here"; } }, 300); } }
    // (177) the Log's timeline (Live › Log): how hard the native engine and the plugins work, each second
  setInterval(() => {
    const L = window.__live5; if (!L || !L.TL || !L.TL.length || !(window.NBEngine || window.NBPlug)) return;   // (the Linux app only)
    const K = ["native_eng_pct", "native_voices", "native_underruns", "vst_loaded", "vst_pct", "vst_underruns"], H = L.TL_HEAD;
    K.forEach(k => { if (!H.includes(k)) H.push(k); });
    const row = L.TL[L.TL.length - 1]; if (!row || row.__nb177) return; row.__nb177 = 1;
    let e = null, p = []; try { e = window.__ne && window.__ne.ok ? window.__ne.state() : null; } catch (er) {} try { p = window.__nbPlug && window.__nbPlug.state ? window.__nbPlug.state() : []; } catch (er) {}
    const pct = (u, b) => u != null && b ? Math.round(u / b * 1000) / 10 : "";
    const i0 = H.indexOf(K[0]); while (row.length < i0) row.push("");
    row.splice(i0, K.length, e && e.engine ? pct(e.engine.blockUs, e.engine.budgetUs) : "", e && e.engine ? e.engine.voices : "", e ? e.underruns : "",
      p.length || "", p.length ? Math.round(p.reduce((a, x) => a + (x.blockUs && x.budgetUs ? x.blockUs / x.budgetUs * 100 : 0), 0) * 10) / 10 : "", p.length ? p.reduce((a, x) => a + (x.underruns || 0), 0) : "");
  }, 1000);
}
