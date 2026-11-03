  // ======================================================================
  // (179) The CPU meter, in the Linux app only (the website and the tablet can't see the processor, so they don't
  // show one). Every second the app reads Linux's own counts (/proc, main.js): how much of one core each thread the
  // sound depends on used over that second, Nate Bloom as a whole, and the whole computer. The number on the button is
  // the busiest of those sound threads (the browser's audio thread, the native engine's, each plugin's): at 100% that
  // thread has no time left and the sound drops out. A tap shows each one, and the dropouts of the last minute.
  // ======================================================================
  {
    const NN = window.NB_NATIVE;
    if (NN && NN.platform === "linux" && typeof NN.cpu === "function") {
      const esc3 = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
      const C = window.__nbCpu = { last: null, drops: [], dropPrev: null, open: false, peak: 0 };
      const mk = id => { const b = document.createElement("button"); b.type = "button"; b.className = "btn nb-cpu"; b.id = id;
        b.innerHTML = '<b>CPU</b><span class="v">—</span><i class="bar"><u></u></i>'; b.title = "CPU: how hard the sound's threads are working · tap for each one";
        b.addEventListener("click", e => { e.stopPropagation(); C.open = !C.open; C.at = b; paintPop(); }); return b; };
      const btns = [mk("shCpu"), mk("lvCpuLx")];
      const pop = document.createElement("div"); pop.className = "nb-cpu-pop"; pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "CPU");
      document.body.appendChild(pop);
      document.addEventListener("pointerdown", e => { if (C.open && !pop.contains(e.target) && !btns.some(b => b.contains(e.target))) { C.open = false; paintPop(); } });
      // the buttons go in the top strip, by Log, and in Live's bar (both are redrawn at times: put back when missing)
      const place = () => {
        const lg = document.getElementById("shLog"); if (lg && btns[0].nextSibling !== lg) lg.before(btns[0]);
        const lv = document.getElementById("lvJam") || document.getElementById("lvMeter"); if (lv && btns[1].nextSibling !== lv) lv.before(btns[1]);
      };
      const plugName = id => { try { const P = window.__nbPlug && window.__nbPlug.live.get(+id); return P ? P.name + " (" + (P.fmt === "clap" ? "CLAP" : P.fmt === "lv2" ? "LV2" : "VST3") + ")" : "plugin " + id; } catch (e) { return "plugin " + id; } };
      // dropouts the browser itself reports (its output had to fill in), plus the engine's and plugins' late blocks
      function dropTick() {
        let n = 0;
        try { const s = ctx && (ctx.playoutStats || ctx.playbackStats); if (s && s.fallbackFramesEvents != null) n += s.fallbackFramesEvents; } catch (e) {}
        try { if (window.__ne && window.__ne.ok) n += window.__ne.state().underruns || 0; } catch (e) {}
        try { if (window.__nbPlug && window.__nbPlug.state) window.__nbPlug.state().forEach(x => { n += x.underruns || 0; }); } catch (e) {}
        const d = C.dropPrev == null || n < C.dropPrev ? 0 : n - C.dropPrev; C.dropPrev = n;
        C.drops.push(d); if (C.drops.length > 60) C.drops.shift();
      }
      const sum = a => a.reduce((x, y) => x + y, 0), r1 = x => Math.round(x);
      function headline(r) {
        const parts = [r.audio, ...(r.engine || []), ...Object.values(r.plugins || {})];
        return parts.length ? Math.max(...parts) : 0;
      }
      async function tick() {
        place();
        if (document.hidden) return;
        let r = null; try { r = await NN.cpu(); } catch (e) {}
        dropTick();
        if (!r || r.warming) return;
        C.last = r; const h = headline(r), d10 = sum(C.drops.slice(-10));
        C.peak = Math.max(h, C.peak * 0.9);
        btns.forEach(b => {
          b.querySelector(".v").textContent = r1(h) + "%" + (d10 ? " ⚠" : "");   // (the number stays; a dropout in the last 10 s turns it red)
          b.querySelector("u").style.width = Math.min(100, h) + "%";
          b.classList.toggle("warm", !d10 && h >= 60 && h < 85); b.classList.toggle("hot", !!d10 || h >= 85);
          b.title = "CPU: the busiest sound thread " + r1(h) + "% of a core · the computer " + r1(r.computer) + "%" + (d10 ? " · the sound dropped out in the last 10 s" : "");
        });
        paintPop();
      }
      const row = (name, v, note, bar = true) => `<div class="nbc-row${v >= 85 ? " hot" : v >= 60 ? " warm" : ""}"><span>${esc3(name)}</span><b>${v == null ? "—" : r1(v) + "%"}</b>${bar ? `<i class="bar"><u style="width:${Math.min(100, v || 0)}%"></u></i>` : '<i class="bar off"></i>'}<small>${esc3(note)}</small></div>`;
      function paintPop() {
        pop.hidden = !C.open; if (!C.open) return;
        const r = C.last;
        if (!r) { pop.innerHTML = '<p class="nbc-note">Measuring… (the first figures come after a second)</p>'; return; }
        const eng = r.engine || [], plugs = Object.entries(r.plugins || {}), d60 = sum(C.drops), d10 = sum(C.drops.slice(-10));
        pop.innerHTML = `<div class="nbc-h"><strong>CPU</strong><small>measured by Linux over the last second</small></div>
          <div class="nbc-g">The sound's threads <small>each a share of one core: at 100% it has no time left and the sound drops out</small></div>
          ${row("Browser audio", r.audio, "every browser synth, sample, effect and the mix")}
          ${eng.length ? row("Native engine", Math.max(...eng), eng.length + (eng.length === 1 ? " thread" : " threads") + (eng.length > 1 ? ", the busiest shown · " + r1(sum(eng)) + "% in all" : "") + " · " + (window.__ne && window.__ne.ok ? "Juno and the other native synths" : "idle")) : row("Native engine", null, window.__ne && window.__ne.on ? "not running" : "switched off (Settings › App)", false)}
          ${plugs.length ? plugs.map(([id, v]) => row(plugName(id), v, "its own audio thread")).join("") : '<p class="nbc-note">No VST3, CLAP or LV2 plugins loaded.</p>'}
          ${r.pluginMain > 0.5 ? row("Plugin windows", r.pluginMain, "plugins' own windows, loading and settings (not the sound)") : ""}
          <div class="nbc-g">Altogether</div>
          ${row("Nate Bloom", r.app / Math.max(1, r.cores), r1(r.app) + "% of one core across all its processes (screen, sound, network), of " + r.cores + " cores")}
          ${row("This computer", r.computer, "everything running · busiest core " + r1(r.busiestCore) + "%")}
          <div class="nbc-row${d10 ? " hot" : d60 ? " warm" : ""}"><span>Dropouts</span><b>${d60}</b><i class="bar off"></i><small>${d60 ? "in the last minute" + (d10 ? ", " + d10 + " in the last 10 s" : "") + " (the output filled in, or a native part was late)" : "none in the last minute"}</small></div>`;
        const b = C.at && document.body.contains(C.at) && C.at.offsetParent ? C.at : btns.find(x => x.offsetParent);
        if (b) { const rc = b.getBoundingClientRect(), w = Math.min(420, innerWidth - 16); pop.style.width = w + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.right - w)) + "px"; pop.style.top = (rc.bottom + 6) + "px"; }
      }
      setInterval(tick, 1000); tick();
      // the Log's timeline gets the same figures
      setInterval(() => {
        const L = window.__live5, r = C.last; if (!L || !L.TL || !L.TL.length || !r) return;
        const K = ["cpu_audio_pct", "cpu_engine_max_pct", "cpu_plugins_max_pct", "cpu_app_pct", "cpu_computer_pct"], H = L.TL_HEAD;
        K.forEach(k => { if (!H.includes(k)) H.push(k); });
        const row = L.TL[L.TL.length - 1]; if (!row || row.__nb179) return; row.__nb179 = 1;
        const i0 = H.indexOf(K[0]); while (row.length < i0) row.push("");
        const pv = Object.values(r.plugins || {});
        row.splice(i0, K.length, r.audio, r.engine && r.engine.length ? Math.max(...r.engine) : "", pv.length ? Math.max(...pv) : "", r.app, r.computer);
      }, 1000);
      (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ cpuMeasured: C.last, dropsLastMinute: sum(C.drops) }));
    }
  }
