  // ======================================================================
  // (203) Motion, in the Linux app: tempo sync, two more shapes (ramp down, random steps), and any knob as a target:
  // touch any knob or slider in the app, or pick a plugin's control, and the LFO moves it around where it was.
  // ======================================================================
  if (window.NB_NATIVE && NB_NATIVE.platform === "linux") {
    const MP_SYNC = [["free", "Free", 0], ["1", "1 bar", 4], ["2", "1/2", 2], ["4", "1/4", 1], ["8", "1/8", 0.5], ["16", "1/16", 0.25], ["4d", "1/4 dotted", 1.5], ["8d", "1/8 dotted", 0.75], ["4t", "1/4 triplet", 2 / 3], ["8t", "1/8 triplet", 1 / 3], ["2b", "2 bars", 8], ["4b", "4 bars", 16]];
    const mpBpm = () => (state.seq && state.seq.bpm) || 120;
    const mpHz = L => { const s = MP_SYNC.find(x => x[0] === L.sync); return s && s[2] ? mpBpm() / 60 / s[2] : rateHz(L.rate); };
    MO_SHAPES.push(["sawdown", "Ramp down"], ["random", "Random steps"]);
    MO_TARGETS.push(["pick", "Any knob…"]);
    // ---------- the value of any control, 0-1 (as MIDI learn sees it) ----------
    async function mpGet(t) {
      if (!t) return null;
      if (t.k === "wam") { try { return await window.__nbw.wlGet(t.ref, t.pid); } catch (e) { return null; } }
      if (t.k === "xy") return t.axis === "y" ? mo.y : mo.x;
      const el = learnFind(t); if (!el) return null;
      if (el.__nbGet) return el.__nbGet();
      if (el.classList && el.classList.contains("knob")) return (+el.getAttribute("aria-valuenow") || 0) / 100;
      if (el.type === "range") { const lo = el.min === "" ? 0 : +el.min, hi = el.max === "" ? 100 : +el.max; return hi > lo ? (+el.value - lo) / (hi - lo) : 0; }
      return null;
    }
    // ---------- the waves, -1..1, from a phase that counts cycles ----------
    const mpRand = new Map();
    function mpWave(L, ph, key) {
      const p = ph - Math.floor(ph), n = Math.floor(ph);
      if (L.shape === "sine") return Math.sin(2 * Math.PI * p);
      if (L.shape === "triangle") return 1 - 4 * Math.abs(p - 0.5);
      if (L.shape === "square") return p < 0.5 ? 1 : -1;
      if (L.shape === "sawtooth") return 2 * p - 1;
      if (L.shape === "sawdown") return 1 - 2 * p;
      let r = mpRand.get(key); if (!r || r.n !== n) { r = { n, a: r ? r.b : Math.random() * 2 - 1, b: Math.random() * 2 - 1 }; mpRand.set(key, r); }
      if (L.shape === "random") return r.b;
      const s = p * p * (3 - 2 * p); return r.a + (r.b - r.a) * s;   // drift: smooth from one random value to the next
    }
    // ---------- knob targets: a timer moves the control (30 times a second) ----------
    let mpTick = 0, mpLast = 0;
    const mpCtl = () => mo.lfo.filter(L => L.on && L.target === "ctl" && L.ctl && L.ctl.t);
    function mpRun() {
      const list = mpCtl();
      if (!list.length) { clearInterval(mpTick); mpTick = 0; return; }
      const now = performance.now(), dt = Math.min(0.2, (now - (mpLast || now)) / 1000); mpLast = now;
      list.forEach((L, i) => {
        L.__ph = (L.__ph || 0) + mpHz(L) * dt;
        if (L.ctl.base == null) return;
        const v = Math.max(0, Math.min(1, L.ctl.base + mpWave(L, L.__ph, L) * L.depth * 0.5));
        try { learnApply(L.ctl.t, v); } catch (e) {}
      });
    }
    function mpCtlStart() { if (!mpTick && mpCtl().length) { mpLast = performance.now(); mpTick = setInterval(mpRun, 33); } }
    // ---------- motionApply, with sync, the new shapes and knob targets ----------
    motionApply = function () {
      moNodes.forEach(n => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); moNodes = [];
      moTimers.forEach(clearInterval); moTimers = [];
      mpCtlStart();
      if (!BM || !ctx) return;
      const now = ctx.currentTime;
      const xyRest = (target, v) => {
        if (target === "filter") BM.modFilter.frequency.setTargetAtTime(120 * Math.pow(2, v * 7.4), now, 0.03);
        else if (target === "pan") BM.modPan.pan.setTargetAtTime(v * 2 - 1, now, 0.03);
      };
      const xyVal = (target, v) => {
        if (target === "filter") BM.modFilter.frequency.setTargetAtTime(120 * Math.pow(2, v * 7.4), now, 0.03);
        else if (target === "pan") BM.modPan.pan.setTargetAtTime(v * 2 - 1, now, 0.03);
        else if (target === "space") { state.fx.space = v; applyFx(); }
        else if (target === "echo") { state.fx.echo = v; applyFx(); }
        else if (target === "wobble") { state.fx.wobble = v; applyFx(); }
        else if (target === "shimmer") { bfx.shim = v; if (v > 0.02 && !bfx.shimOn) bfx.shimOn = true; applyFreeze(); }
      };
      BM.modFilter.frequency.setTargetAtTime(20000, now, 0.03); BM.modPan.pan.setTargetAtTime(0, now, 0.03);
      xyRest(mo.xyX, mo.x); xyRest(mo.xyY, mo.y);
      xyApply = (dx, dy) => { if (dx) xyVal(mo.xyX, mo.x); if (dy) xyVal(mo.xyY, mo.y); };
      let volDip = 0;
      mo.lfo.forEach(L => {
        if (!L.on || L.target === "ctl" || L.target === "pick") return;
        const tp = moParam(L.target); if (!tp) return;
        const [param, scale] = tp, depth = L.depth * scale, hz = mpHz(L);
        const g = ctx.createGain(); g.gain.value = L.shape === "sawdown" ? -depth : depth; g.connect(param); moNodes.push(g);
        if (L.target === "volume") volDip = Math.max(volDip, depth);
        if (L.shape === "drift" || L.shape === "random") {
          const cs = ctx.createConstantSource(); cs.offset.value = 0; cs.connect(g); cs.start(); moNodes.push(cs);
          const period = 1 / hz, stepped = L.shape === "random";
          // (random steps land on the beat grid's own rate; each one is a few ms of ramp so it doesn't click)
          const step = () => { const t = ctx.currentTime, v = Math.random() * 2 - 1; if (stepped) cs.offset.setTargetAtTime(v, t, 0.004); else cs.offset.setTargetAtTime(v, t, period / 3); };
          step(); moTimers.push(setInterval(step, Math.max(30, period * 1000)));
        } else {
          const o = ctx.createOscillator(); o.type = L.shape === "sawdown" ? "sawtooth" : L.shape; o.frequency.value = hz; o.connect(g); o.start(); moNodes.push(o);
        }
      });
      BM.modAmp.gain.setTargetAtTime(1 - volDip, now, 0.05);
    };
    // a new tempo re-times the synced LFOs
    { let bpm0 = 0; setInterval(() => { const b = mpBpm(); if (b !== bpm0) { const was = bpm0; bpm0 = b; if (was && mo.lfo.some(L => L.on && L.sync && L.sync !== "free" && L.target !== "ctl")) motionApply(); } }, 500); }
    // ---------- picking a control ----------
    const pbar = document.createElement("div"); pbar.className = "learnbar"; pbar.id = "moPickBar"; pbar.hidden = true; pbar.setAttribute("role", "status");
    pbar.innerHTML = '<span></span><button class="btn" id="moPickPlug">Plugin control…</button><button class="btn primary" id="moPickCancel">Cancel</button>';
    document.body.appendChild(pbar);
    let picking = null;
    async function mpPicked(L, d) {
      picking = null; pbar.hidden = true; document.body.classList.remove("learn-on");
      L.target = "ctl"; L.ctl = { t: d.t, name: d.name, base: null }; L.on = true;
      const v = await mpGet(d.t); L.ctl.base = v == null ? 0.5 : v;
      saveMo(); motionApply(); moEl.hidden = false; renderMotion();
    }
    function mpPick(L) {
      picking = L; moEl.hidden = true; pbar.hidden = false; document.body.classList.add("learn-on");
      pbar.querySelector("span").textContent = "Motion: touch the knob or slider for LFO " + (mo.lfo.indexOf(L) + 1) + " to move, or pick a plugin's control";
    }
    document.getElementById("moPickCancel").addEventListener("click", () => { const L = picking; picking = null; pbar.hidden = true; document.body.classList.remove("learn-on"); if (L && L.target === "pick") { L.target = "filter"; saveMo(); } moEl.hidden = false; renderMotion(); });
    document.getElementById("moPickPlug").addEventListener("click", () => {
      const L = picking; if (!L || !window.__nbw.pick) return;
      window.__nbw.pick("Motion: a plugin control", "Pick the control the LFO moves.", c => mpPicked(L, { t: { k: "wam", ref: c.ref, pid: c.pid }, name: c.name }));
    });
    document.addEventListener("pointerdown", e => {
      if (!picking || (e.target.closest && e.target.closest("#moPickBar, #wlSheet"))) return;
      const d = learnDesc(e.target); if (!d || d.t.k === "xy") return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      mpPicked(picking, d);
    }, true);
    // ---------- the LFO cards: Sync, and the knob it moves ----------
    { const rm = renderMotion; renderMotion = function () {
        rm.apply(this, arguments);
        ["xyX", "xyY"].forEach(id => { const s = document.getElementById(id); const o = s && s.querySelector('option[value="pick"]'); if (o) o.remove(); });
        [...moList.querySelectorAll(".mo-card")].forEach((card, i) => {
          const L = mo.lfo[i]; if (!L) return;
          const tsel = card.querySelector(".mo-t");
          if (L.target === "ctl" && L.ctl) { const o = document.createElement("option"); o.value = "ctl"; o.textContent = L.ctl.name; tsel.insertBefore(o, tsel.firstChild); tsel.value = "ctl"; card.querySelector("small").textContent = "moving " + L.ctl.name + " around where it was"; }
          tsel.addEventListener("change", () => {
            if (L.ctl && L.ctl.base != null && tsel.value !== "ctl") { try { learnApply(L.ctl.t, L.ctl.base); } catch (e) {} L.ctl = null; saveMo(); }
            if (tsel.value === "pick") mpPick(L); else if (tsel.value === "ctl") { L.target = "ctl"; saveMo(); motionApply(); }
          });
          const row = card.querySelector(".mo-row"), lab = document.createElement("label"); lab.textContent = "Sync ";
          const ss = document.createElement("select"); ss.className = "mo-sync"; MP_SYNC.forEach(([k, l]) => { const o = document.createElement("option"); o.value = k; o.textContent = l; ss.appendChild(o); }); ss.value = L.sync || "free";
          lab.appendChild(ss); row.appendChild(lab);
          const r = card.querySelector(".mo-r"), rv = card.querySelector(".mo-rv"), synced = L.sync && L.sync !== "free";
          r.disabled = !!synced; if (synced) rv.textContent = MP_SYNC.find(x => x[0] === L.sync)[1];
          ss.addEventListener("change", () => { L.sync = ss.value; saveMo(); motionApply(); renderMotion(); });
          if (L.shape === "random") card.querySelector("small").textContent = L.target === "ctl" && L.ctl ? "random steps on " + L.ctl.name : "a new random value each step";
        });
      }; }
    // turning an LFO off puts its knob back where it was
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest(".mo-card .lab-head .btn"); if (!b) return;   // (the card has been redrawn by now, so not "#moList …")
      setTimeout(() => mo.lfo.forEach(L => { if (!L.on && L.target === "ctl" && L.ctl && L.ctl.base != null) try { learnApply(L.ctl.t, L.ctl.base); } catch (er) {} }), 0);
    });
    setTimeout(() => { try { mpCtlStart(); } catch (e) {} }, 1500);
    window.__mp = { mo, run: mpRun, hz: mpHz, pick: mpPick, picked: mpPicked, apply: () => motionApply() };
  }
