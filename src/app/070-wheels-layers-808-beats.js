  // ======================================================================
  // Pitch-bend and vibrato wheels
  // ======================================================================
  let modDepth = 0, pmNodes = null;
  const pm = { bend: 0, mod: 0, range: 2 };
  const WHEEL_DRAW = {}, MODSRC = { wheel: 0, press: 0 };
  try { const r = Number(localStorage.getItem("nightbloom-bend")); if ([2, 7, 12].includes(r)) pm.range = r; } catch (e) {}
  // every oscillator or sample that a played note creates follows the wheels
  // (138: plugged in only while a wheel is away from rest; plugged in, every oscillator works out its pitch sample by sample)
  const pmLive = new Set(); let pmOn = false, pmOffT = 0;
  function pitchConnect(node) {
    if (!pmNodes || !node.detune) return;
    const bus = pmNodes.bus; pmLive.add(node);
    try { node.addEventListener("ended", () => { pmLive.delete(node); if (node.__pm) { node.__pm = false; try { bus.disconnect(node.detune); } catch (e) {} } }); } catch (e) {}
    if (pmOn) { try { bus.connect(node.detune); node.__pm = true; } catch (e) {} }
  }
  function pmPlug(on) {
    if (!pmNodes || on === pmOn) return; pmOn = on;
    for (const n of pmLive) { try { if (on && !n.__pm) { pmNodes.bus.connect(n.detune); n.__pm = true; } else if (!on && n.__pm) { pmNodes.bus.disconnect(n.detune); n.__pm = false; } } catch (e) {} }
  }
  function setupPitchMod() {
    if (pmNodes || !ctx) return;
    const bus = ctx.createGain();
    let one;
    if (ctx.createConstantSource) { one = ctx.createConstantSource(); one.offset.value = 1; }
    else { one = ctx.createBufferSource(); const b = ctx.createBuffer(1, 128, ctx.sampleRate); b.getChannelData(0).fill(1); one.buffer = b; one.loop = true; }
    const bend = ctx.createGain(); bend.gain.value = 0;
    one.connect(bend).connect(bus); one.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
    const vib = ctx.createGain(); vib.gain.value = 0;
    lfo.connect(vib).connect(bus); lfo.start();
    pmNodes = { bus, bend, vib };
    const co = ctx.createOscillator.bind(ctx), cb = ctx.createBufferSource.bind(ctx);
    ctx.createOscillator = function () { const o = co(); if (modDepth > 0) { try { o.detune.automationRate = "k-rate"; } catch (e) {} pitchConnect(o); } return o; };   // (138: tuning once per block)
    ctx.createBufferSource = function () { const s = cb(); if (modDepth > 0) pitchConnect(s); return s; };
    if (window.__nbMobile) { const cf = ctx.createBiquadFilter.bind(ctx); ctx.createBiquadFilter = function () { const f = cf(); if (modDepth > 0) { try { f.frequency.automationRate = "k-rate"; f.detune.automationRate = "k-rate"; f.Q.automationRate = "k-rate"; } catch (e) {} } return f; }; }
    applyPitch();
  }
  function applyPitch() {
    if (!pmNodes) return;
    const t = ctx.currentTime;
    pmNodes.bend.gain.setTargetAtTime(pm.bend * pm.range * 100, t, 0.008);
    pmNodes.vib.gain.setTargetAtTime(pm.mod * pm.mod * 55, t, 0.04);
    const away = Math.abs(pm.bend) > 0.002 || pm.mod > 0.002;
    if (away) { clearTimeout(pmOffT); pmOffT = 0; pmPlug(true); }
    else if (pmOn && !pmOffT) pmOffT = setTimeout(() => { pmOffT = 0; if (Math.abs(pm.bend) <= 0.002 && pm.mod <= 0.002) pmPlug(false); }, 400);
  }
  const wrapMod = fn => function () { modDepth++; try { return fn.apply(this, arguments); } finally { modDepth--; } };
  makeVoice = wrapMod(makeVoice);
  makeSampleVoice = wrapMod(makeSampleVoice);
  makeInstVoice = wrapMod(makeInstVoice);
  {
    const origBuild = buildAudio;
    buildAudio = function () { origBuild(); setupPitchMod(); };
    if (ctx) setupPitchMod();
  }
  function setupWheel(el, kind) {
    const track = el.querySelector(".wtrack"), thumb = el.querySelector(".wthumb");
    const draw = () => {
      const v = kind === "bend" ? (pm.bend + 1) / 2 : pm.mod;
      thumb.style.top = ((1 - v) * 100) + "%";
      el.setAttribute("aria-valuenow", Math.round((kind === "bend" ? pm.bend : pm.mod) * 100));
      el.classList.toggle("live", kind === "bend" ? Math.abs(pm.bend) > 0.01 : pm.mod > 0.01);
    };
    const fromY = y => { const r = track.getBoundingClientRect(); return Math.min(1, Math.max(0, 1 - (y - r.top) / r.height)); };
    WHEEL_DRAW[kind] = draw;
    const set = v => { if (kind === "bend") pm.bend = v * 2 - 1; else { MODSRC.wheel = v; pm.mod = Math.max(v, MODSRC.press); } draw(); applyPitch(); };
    let pid = null;
    el.addEventListener("pointerdown", e => {
      if (e.target.closest(".wlab")) return;
      e.preventDefault(); pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (err) {}
      el.classList.remove("spring"); set(fromY(e.clientY));
    });
    el.addEventListener("pointermove", e => { if (e.pointerId === pid) set(fromY(e.clientY)); });
    const up = e => {
      if (e.pointerId !== pid) return;
      pid = null;
      if (kind === "bend") { el.classList.add("spring"); pm.bend = 0; draw(); applyPitch(); }
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", e => {
      const step = e.key === "ArrowUp" ? 0.05 : e.key === "ArrowDown" ? -0.05 : 0;
      if (!step) return;
      e.preventDefault();
      if (kind === "bend") set(Math.min(1, Math.max(0, (pm.bend + 1) / 2 + step))); else set(Math.min(1, Math.max(0, pm.mod + step)));
    });
    el.addEventListener("keyup", e => { if (kind === "bend" && (e.key === "ArrowUp" || e.key === "ArrowDown")) { pm.bend = 0; draw(); applyPitch(); } });
    draw();
    return draw;
  }
  setupWheel(document.getElementById("bendWheel"), "bend");
  setupWheel(document.getElementById("modWheel"), "mod");
  const bendRangeBtn = document.getElementById("bendRange");
  bendRangeBtn.textContent = "±" + pm.range;
  bendRangeBtn.addEventListener("click", () => {
    pm.range = pm.range === 2 ? 7 : pm.range === 7 ? 12 : 2;
    bendRangeBtn.textContent = "±" + pm.range;
    try { localStorage.setItem("nightbloom-bend", String(pm.range)); } catch (e) {}
    applyPitch();
  });

  // ======================================================================
  // Library layers & key zones: up to 4 library sounds at once
  // ======================================================================
  const PART_COLORS = ["#c4a3ff", "#ffb65c", "#6fd6c4", "#ff8fab", "#7fb2ff", "#b6e36b", "#ffd36b", "#e48bff"];
  const MAX_PARTS = 8;
  const libInsts = new Array(MAX_PARTS).fill(null);
  const libTokens = new Array(MAX_PARTS).fill(0);
  const noteLabel = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const activeParts = () => state.lib.parts.map((p, i) => [p, i]).filter(([p, i]) => p && p.on && libInsts[i]);
  function libVoices(m, when, scale = 1) {
    const out = [];
    state.lib.parts.forEach((pt, i) => {
      if (!pt || !pt.on || !libInsts[i] || m < pt.lo || m > pt.hi) return;
      // sustaining sounds (pads, strings, organs) ignore the Decay slider
      const P = pt.sus ? Object.assign({}, state.lib.p, { decay: 1 }) : state.lib.p;
      // (the note plays at the usual level; the layer's own bus carries its fader, so a move is heard at once)
      const live = !!ctx, k0 = live ? LVK : null; if (live) LVK = "l:" + i;
      try { const v = makeInstVoice(m + 12 * (pt.oct || 0), when, scale * (live ? 0.8 : (pt.level ?? 0.8)) * 1.25, libInsts[i], P); if (v) out.push(v); }
      finally { if (live) LVK = k0; }
    });
    return out;
  }
  async function assignPart(pi, entry, preview) {
    const tok = ++libTokens[pi], stem = entry.id.slice(2);
    if (pi === 0) { state.cur = { id: entry.id, cat: entry.cat }; setSoundText(entry.name, "Loading…"); }
    try {
      const inst = await loadWaf(stem);
      if (tok !== libTokens[pi]) return;
      const prev = state.lib.parts[pi];
      state.lib.parts[pi] = Object.assign({ on: true, lo: 0, hi: 127, oct: 0, level: 0.8 }, prev || {},
        { id: stem, name: entry.name, sub: entry.sub, sus: entry.sus ? 1 : 0 });
      libInsts[pi] = { name: entry.name, sub: entry.sub, regions: inst.regions };
      if (pi === 0) { libInst = libInsts[0]; state.lib.id = stem; }
      state.engine = "lib";
      renderEngine(); save();
      if (!layersEl.hidden) renderLayers();
      if (preview) {
        const t = ctx.currentTime + 0.03, pt = state.lib.parts[pi];
        const P = pt.sus ? Object.assign({}, state.lib.p, { decay: 1 }) : state.lib.p;
        const root = Math.min(Math.max(60, pt.lo), pt.hi);
        const v = makeInstVoice(root + 12 * (pt.oct || 0), t, pt.level * 1.25, libInsts[pi], P);
        if (v) v.stop(t + 0.8);
      }
    } catch (e) {
      if (tok === libTokens[pi] && pi === 0) setSoundText(entry.name, "Couldn't load this sound. Check your connection.");
    }
  }
  // the browser's normal pick replaces the first layer and keeps the others
  selectLib = (entry, preview) => assignPart(0, entry, preview);
  libStartup = function () {
    if (!state.lib.parts.length && state.lib.id) {
      const e = entryById("w:" + state.lib.id);
      state.lib.parts[0] = { id: state.lib.id, name: e ? e.name : state.lib.id, sub: e ? e.sub : "", sus: e && e.sus ? 1 : 0, on: true, lo: 0, hi: 127, oct: 0, level: 0.8 };
    }
    state.lib.parts.forEach((pt, i) => {
      if (!pt || !pt.id) return;
      loadWaf(pt.id).then(inst => {
        libInsts[i] = { name: pt.name, sub: pt.sub, regions: inst.regions };
        if (i === 0) libInst = libInsts[0];
        if (state.engine === "lib") renderEngine();
      }).catch(() => { if (i === 0 && state.engine === "lib") setSoundText(pt.name, "Couldn't load this sound. Check your connection."); });
    });
  };
  function libLabel() {
    const on = state.lib.parts.filter(p => p && p.on && p.id);
    if (!on.length) return ["Library", "Tap to browse sounds"];
    if (on.length === 1) return [on[0].name, on[0].sub + " · tap to browse"];
    const split = on.some(p => p.lo > 0 || p.hi < 127);
    return [on.map(p => p.name).join(" + "), on.length + (split ? " zones" : " layers") + " · tap to browse"];
  }

  // ---------- keyboard zone strips ----------
  function decorateZones() {
    keyEls.forEach(el => { const z = el.querySelector(".zstrip"); if (z) z.remove(); });
    if (state.engine !== "lib") return;
    const parts = state.lib.parts.map((p, i) => [p, i]).filter(([p]) => p && p.on && p.id);
    if (parts.length < 2 && !parts.some(([p]) => p.lo > 0 || p.hi < 127)) return;
    keyEls.forEach((el, m) => {
      const z = document.createElement("div"); z.className = "zstrip";
      for (const [p, i] of parts) {
        if (m < p.lo || m > p.hi) continue;
        const s = document.createElement("i"); s.style.background = PART_COLORS[i];
        z.appendChild(s);
      }
      el.appendChild(z);
    });
  }

  // ---------- Layers & splits sheet ----------
  const layersEl = document.getElementById("layers"), lyParts = document.getElementById("lyParts"), lyInfo = document.getElementById("lyInfo");
  let zoneCapture = null, pickFor = null;
  function openLayers() { start(); layersEl.hidden = false; renderLayers(); }
  function closeLayers() { layersEl.hidden = true; renderEngine(); }
  document.getElementById("lyOpen").addEventListener("click", openLayers);
  document.getElementById("lyDone").addEventListener("click", closeLayers);
  function noteSelect(val, onChange, label) {
    const sel = document.createElement("select"); sel.setAttribute("aria-label", label);
    for (let m = 0; m <= 127; m++) { const o = document.createElement("option"); o.value = m; o.textContent = noteLabel(m); sel.appendChild(o); }
    sel.value = String(val);
    sel.addEventListener("change", () => onChange(Number(sel.value)));
    return sel;
  }
  function partChanged() { save(); renderLayers(); if (state.engine === "lib") renderEngine(); else buildKeys(); }
  function renderLayers(msg) {
    lyParts.innerHTML = "";
    const parts = state.lib.parts;
    lyInfo.textContent = msg || "Up to 8 sounds · layer them or give each its own keys · switch them on and off with the buttons under the sound name";
    for (let i = 0; i < MAX_PARTS; i++) {
      const pt = parts[i];
      const card = document.createElement("div"); card.className = "ly-part"; card.style.setProperty("--pc", PART_COLORS[i]);
      if (!pt || !pt.id) {
        if (i > 0 && !(parts[i - 1] && parts[i - 1].id)) break;
        const add = document.createElement("button"); add.className = "btn ly-add";
        add.textContent = i === 0 ? "+ Choose a first sound" : "+ Add sound " + (i + 1);
        add.addEventListener("click", () => openBrowserFor(i));
        card.appendChild(add); lyParts.appendChild(card);
        break;
      }
      const top = document.createElement("div"); top.className = "ly-top";
      const dot = document.createElement("span"); dot.className = "ly-dot";
      const snd = document.createElement("button"); snd.className = "ly-sound";
      snd.innerHTML = "<b></b><small></small>";
      snd.querySelector("b").textContent = pt.name + (libInsts[i] ? "" : " (loading…)");
      snd.querySelector("small").textContent = pt.sub + " · tap to change";
      snd.addEventListener("click", () => openBrowserFor(i));
      const on = document.createElement("button"); on.className = "btn ly-on";
      on.setAttribute("aria-pressed", String(!!pt.on)); on.textContent = pt.on ? "On" : "Off";
      on.addEventListener("click", () => { pt.on = !pt.on; partChanged(); });
      top.append(dot, snd, on);
      if (i > 0) {
        const rm = document.createElement("button"); rm.className = "btn ly-rm"; rm.textContent = "✕";
        rm.setAttribute("aria-label", "Remove sound " + (i + 1));
        rm.addEventListener("click", () => { parts.splice(i, 1); libInsts.splice(i, 1); libInsts.push(null); libTokens.splice(i, 1); libTokens.push(0); partChanged(); });
        top.append(rm);
      }
      const keys = document.createElement("div"); keys.className = "ly-row";
      const kl = document.createElement("span"); kl.className = "lab2"; kl.textContent = "Keys";
      const loSel = noteSelect(pt.lo, v => { pt.lo = Math.min(v, pt.hi); partChanged(); }, "Lowest key");
      const dash = document.createElement("span"); dash.textContent = "to";
      const hiSel = noteSelect(pt.hi, v => { pt.hi = Math.max(v, pt.lo); partChanged(); }, "Highest key");
      const setBtn = document.createElement("button"); setBtn.className = "btn"; setBtn.textContent = "Set with keys";
      setBtn.addEventListener("click", () => {
        zoneCapture = { pi: i, step: 0 }; layersEl.hidden = true;
        if (document.getElementById("modeSeq").getAttribute("aria-pressed") === "true") document.getElementById("modeKeys").click();
        setSoundText("Tap the lowest key for sound " + (i + 1), pt.name);
      });
      keys.append(kl, loSel, dash, hiSel, setBtn);
      const mix = document.createElement("div"); mix.className = "ly-row";
      const ol = document.createElement("span"); ol.className = "lab2"; ol.textContent = "Octave";
      const dn = document.createElement("button"); dn.className = "btn"; dn.textContent = "−"; dn.setAttribute("aria-label", "Octave down");
      const ov = document.createElement("span"); ov.className = "ly-oct"; ov.textContent = (pt.oct > 0 ? "+" : "") + (pt.oct || 0);
      const up = document.createElement("button"); up.className = "btn"; up.textContent = "+"; up.setAttribute("aria-label", "Octave up");
      dn.addEventListener("click", () => { pt.oct = Math.max(-3, (pt.oct || 0) - 1); partChanged(); });
      up.addEventListener("click", () => { pt.oct = Math.min(3, (pt.oct || 0) + 1); partChanged(); });
      const ll = document.createElement("span"); ll.className = "lab2"; ll.textContent = "Level";
      const lv = document.createElement("input"); lv.type = "range"; lv.min = 0; lv.max = 100; lv.value = Math.round((pt.level ?? 0.8) * 100);
      lv.className = "ly-level"; lv.setAttribute("aria-label", "Level of sound " + (i + 1));
      lv.addEventListener("input", () => { pt.level = lv.value / 100; save(); });
      mix.append(ol, dn, ov, up, ll, lv);
      card.append(top, keys, mix);
      lyParts.appendChild(card);
    }
  }
  // quick setups
  document.getElementById("lyLayer").addEventListener("click", () => {
    state.lib.parts.forEach(p => { if (p) { p.lo = 0; p.hi = 127; } }); partChanged();
  });
  document.getElementById("lySplit").addEventListener("click", () => {
    const ps = state.lib.parts.filter(p => p && p.id);
    if (ps.length < 2) { renderLayers("Add a second sound first, then split."); return; }
    ps[0].lo = 60; ps[0].hi = 127; ps[1].lo = 0; ps[1].hi = 59;
    ps.slice(2).forEach(p => { p.lo = 0; p.hi = 127; });
    partChanged();
  });
  document.getElementById("lySpread").addEventListener("click", () => {
    const ps = state.lib.parts.filter(p => p && p.id), n = ps.length;
    if (n < 2) { renderLayers("Add more sounds first, then spread them across the keys."); return; }
    const start0 = BASE + state.octave * 12, count = kbKeyCount();
    ps.forEach((p, k) => {
      p.lo = k === 0 ? 0 : start0 + Math.floor(k * count / n);
      p.hi = k === n - 1 ? 127 : start0 + Math.floor((k + 1) * count / n) - 1;
    });
    partChanged();
  });
  // capture a key range from the keyboard
  function zoneKey(m) {
    if (!zoneCapture) return false;
    const pt = state.lib.parts[zoneCapture.pi];
    if (!pt) { zoneCapture = null; return false; }
    if (zoneCapture.step === 0) {
      zoneCapture.lo = m; zoneCapture.step = 1;
      setSoundText("Now tap the highest key for sound " + (zoneCapture.pi + 1), "Lowest: " + noteLabel(m));
      return true;
    }
    pt.lo = Math.min(zoneCapture.lo, m); pt.hi = Math.max(zoneCapture.lo, m);
    zoneCapture = null; save(); buildKeys(); openLayers();
    return true;
  }
  // choose a sound for one layer from the browser
  function openBrowserFor(pi) {
    pickFor = pi; layersEl.hidden = true;
    openBrowser();
    const c = state.lib.parts[pi] && entryById("w:" + state.lib.parts[pi].id);
    brCat = c ? c.cat : "pads";
    document.getElementById("brDone").textContent = "Back";
    renderBrowser(true);
  }
  // ---------- library panel ----------
  renderLibPanel = function () {
    document.getElementById("engineLabel").textContent = "Library";
    const n = state.lib.parts.filter(p => p && p.id && p.on).length;
    noteMsg(n > 1 ? n + " sounds · " + (state.lib.parts.some(p => p && (p.lo > 0 || p.hi < 127)) ? "split across the keys" : "layered") : libInst ? libInst.name + " · " + libInst.sub : "Tap the sound name above to pick from the library");
    document.getElementById("lySum").textContent = n > 1 ? n + " sounds" : "1 sound";
    engineKnobsEl.innerHTML = "";
    LIB_KNOBS.forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.lib.p, () => {}));
  };


  // ======================================================================
  // 808 beats (30, any time signature) + per-sound pitch / length
  // ======================================================================
  // Each beat is written as one 4/4 bar (four 4-step beats). For other meters the
  // bar is rebuilt beat by beat: first beat, backbeats, and a last beat, so every
  // pattern still lands on the pulse in 3/4, 5/4, 6/8, 7/8, 12/8 and so on.
  const BEATS = [
    ["Boom Bap", "Hip-hop", 90, 0.35, { kick: "x......x..x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Boom Bap Bounce", "Hip-hop", 88, 0.4, { kick: "x..x...x..x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.xx", oh: "..............x." }],
    ["Golden Era", "Hip-hop", 94, 0.3, { kick: "x.......x.x.....", snare: "....x..x....x...", ch: "x.xxx.x.x.xxx.x.", rim: ".......x........" }],
    ["New Jack Swing", "Hip-hop", 105, 0.5, { kick: "x..x..x...x..x..", clap: "....x.......x...", ch: "x.xxx.xxx.xxx.xx" }],
    ["Dusty Lo-Fi", "Lo-fi", 78, 0.55, { kick: "x......x..x.....", rim: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Lo-Fi Shuffle", "Lo-fi", 82, 0.6, { kick: "x.....x...x..x..", rim: "....x.......x...", ch: "x.xxx.xxx.xxx.xx" }],
    ["Lo-Fi Rimshot", "Lo-fi", 75, 0.5, { kick: "x..x......x.....", rim: "....x..x....x...", ch: "x...x...x...x...", oh: "..x.......x....." }],
    ["Trap", "Trap", 140, 0, { kick: "x.....x...x.....", clap: "........x.......", ch: "xxxxxxxxxxxxxxxx" }],
    ["Trap Rolls", "Trap", 140, 0, { kick: "x.......x.x....x", clap: "........x.......", ch: "x.x.x.xxx.x.xxxx" }],
    ["Trap Bounce", "Trap", 145, 0, { kick: "x..x....x..x.x..", clap: "........x.......", ch: "x.x.x.x.x.xxx.x.", oh: "......x........." }],
    ["Drill", "Trap", 142, 0, { kick: "x......x.x......", snare: "......x.......x.", ch: "x..x..x.x..x..x." }],
    ["Miami Bass", "Electro", 128, 0, { kick: "x......x..x.....", clap: "....x.......x...", ch: "xxxxxxxxxxxxxxxx", tom: ".........x...x.." }],
    ["Electro", "Electro", 125, 0, { kick: "x.....x..x......", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", cow: ".....x......x..." }],
    ["Electro Funk", "Electro", 127, 0.1, { kick: "x.....x...x.x...", clap: "....x.......x...", ch: "xxxxxxxxxxxxxxxx", cow: "x..x..x...x..x.." }],
    ["Breakbeat", "Breaks", 130, 0.1, { kick: "x.x.......xx....", snare: "....x..x.x..x..x", ch: "x.x.x.x.x.x.x.x." }],
    ["Funk", "Funk", 100, 0.15, { kick: "x..x..x...x..x..", snare: "....x..x.x..x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Funky Breaks", "Funk", 98, 0.2, { kick: "x.x...x...x..x..", snare: "....x..x.x..x..x", ch: "xxxxxxxxxxxx.xxx", oh: "............x..." }],
    ["Disco", "Dance", 118, 0, { kick: "x...x...x...x...", snare: "....x.......x...", oh: "..x...x...x...x.", ch: "x...x...x...x..." }],
    ["House", "Dance", 124, 0, { kick: "x...x...x...x...", clap: "....x.......x...", oh: "..x...x...x...x." }],
    ["Deep House", "Dance", 122, 0.15, { kick: "x...x...x...x...", clap: "....x.......x...", rim: "......x.......x.", ch: "..x...x...x...x." }],
    ["Techno", "Dance", 130, 0, { kick: "x...x...x...x...", ch: "..x...x...x...x.", rim: "......x.......x.", tom: "..........x....." }],
    ["Dembow", "Latin", 95, 0, { kick: "x...x...x...x...", snare: "...x..x....x..x.", ch: "x.x.x.x.x.x.x.x." }],
    ["Dancehall", "Latin", 100, 0.1, { kick: "x.....x...x.....", rim: "...x..x....x..x.", ch: "x.x.x.x.x.x.x.x." }],
    ["Bossa Nova", "Latin", 130, 0, { kick: "x..xx..xx..xx..x", rim: "x..x..x...x..x..", ch: "x.x.x.x.x.x.x.x." }],
    ["Afrobeat", "World", 110, 0.1, { kick: "x..x..x...x..x..", snare: "....x..x....x...", cow: "x.x.xx.x.x.xx.x.", ch: "..x...x...x...x." }],
    ["Rock", "Band", 110, 0, { kick: "x.....x.x.......", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Pop Ballad", "Band", 76, 0, { kick: "x.......x.x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Trip-Hop", "Downtempo", 85, 0.25, { kick: "x......x.x......", snare: "....x.......x...", ch: "x.xxx.x.x.xxx.x.", oh: ".............x.." }],
    ["Ambient Pulse", "Downtempo", 70, 0, { kick: "x.......x.......", rim: "........x.......", ch: "..x...x...x...x." }],
    ["Psych Halftime", "Downtempo", 80, 0.2, { kick: "x.........x.....", snare: "........x.......", ch: "x.x.x.x.x.x.x.x.", tom: "............x.x." }],
    ["Cypher", "Rap", 92, 0.3, { kick: "x.....x...x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Head Nod", "Rap", 90, 0.35, { kick: "x..x......x..x..", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", oh: "......x........." }],
    ["East Coast", "Rap", 94, 0.3, { kick: "x.......x.x.....", snare: "....x.......x...", ch: "x.xxx.x.x.xxx.x." }],
    ["West Coast Roll", "Rap", 92, 0.2, { kick: "x..x..x...x.....", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", oh: "..............x." }],
    ["Bounce Back", "Rap", 95, 0.3, { kick: "x..x...xx..x....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Dilla Drag", "Rap", 88, 0.6, { kick: "x......x.x....x.", snare: "....x.......x...", ch: "x.xxx.x.x.xxx.x.", rim: ".......x........" }],
    ["Smoke Session", "Rap", 84, 0.4, { kick: "x.......xx......", snare: "....x.......x...", ch: "x...x.x.x...x.x." }],
    ["Underground", "Rap", 92, 0.25, { kick: "x..x....x..x....", snare: "....x.......x.x.", ch: "xxx.xxx.xxx.xxx." }],
    ["Sample Chop", "Rap", 88, 0.35, { kick: "x.x.....x.x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", tom: "...............x" }],
    ["G-Funk", "Rap", 92, 0.2, { kick: "x.......x.x.....", clap: "....x.......x...", ch: "xxxxxxxxxxxxxxxx", oh: "......x.......x." }],
    ["Crunk", "Rap", 80, 0, { kick: "x.x...x.x.x.....", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Battle", "Rap", 96, 0.25, { kick: "x...x..x..x....x", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Jazz Rap", "Rap", 90, 0.5, { kick: "x......x..x.....", rim: "....x.......x...", ch: "x.xx..x.xx..x.xx", oh: "..........x....." }],
    ["Gritty", "Rap", 86, 0.3, { kick: "x.....x.x.......", snare: "....x.......x..x", ch: "x.x.x.x.x.x.x.x." }],
    ["Laid Back", "Rap", 80, 0.45, { kick: "x.......x.......", snare: "....x.......x...", ch: "x...x...x...x...", oh: "......x.......x." }],
    ["Hard Knock", "Rap", 95, 0.2, { kick: "x..x..x.x.......", snare: "....x.......x...", clap: "............x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Old School 808", "Rap", 100, 0.15, { kick: "x......x..x...x.", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", cow: "..x.......x....." }],
    ["Southern Slide", "Rap", 76, 0.2, { kick: "x.....x.x.....x.", clap: "....x.......x...", ch: "x.x.x.xxx.x.x.xx" }],
    ["Conscious", "Rap", 88, 0.35, { kick: "x......x..x..x..", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", rim: "..x.......x....." }],
    ["Nineties", "Rap", 93, 0.3, { kick: "x..x....x.x.....", snare: "....x.......x...", ch: "x.xxx.xxx.xxx.xx" }],
    ["Breakbeat Rap", "Rap", 98, 0.2, { kick: "x.x.......x.....", snare: "....x..x.x..x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Lo-Fi Rap", "Rap", 76, 0.55, { kick: "x.......x.x.....", rim: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Mafioso", "Rap", 89, 0.3, { kick: "x..x.x....x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", oh: "..............x." }],
    ["Freestyle", "Rap", 94, 0.25, { kick: "x....x....x..x..", snare: "....x.......x...", ch: "xxx.xxx.xxx.xxx." }],
    ["Grimey", "Rap", 90, 0.3, { kick: "x......x.xx.....", snare: "....x.......x...", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Atlanta", "Trap", 140, 0, { kick: "x.......x..x....", clap: "........x.......", ch: "x.x.x.x.x.x.x.x." }, { ch: "..............3." }],
    ["Rolling Hats", "Trap", 140, 0, { kick: "x.....x...x.....", clap: "........x.......", ch: "xxxxxxxxxxxxxxxx" }, { ch: "...2.......3...4" }],
    ["Triplet Flow", "Trap", 145, 0, { kick: "x.......x.x.....", clap: "........x.......", ch: "x.x.x.x.x.x.x.x." }, { ch: "..3...3...3...3." }],
    ["808 Slide", "Trap", 138, 0, { kick: "x.........x..x..", clap: "........x.......", ch: "x.x.x.xxx.x.x.xx" }, { ch: "......2.......4." }],
    ["Dark Trap", "Trap", 142, 0, { kick: "x..x......x.....", snare: "........x.......", ch: "x.x.x.x.x.x.x.x.", oh: "......x........." }, { ch: "..........3....." }],
    ["Rage", "Trap", 150, 0, { kick: "x.x.x...x.x.x...", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }, { ch: "..............4." }],
    ["Plugg", "Trap", 145, 0, { kick: "x......x..x.....", clap: "........x.......", ch: "x.x.x.x.x.x.x.x.", rim: ".....x......x..." }],
    ["UK Drill", "Trap", 142, 0, { kick: "x......x.x......", snare: "......x.......x.", ch: "x..x..x.x..x..x." }, { ch: "...........3...." }],
    ["NY Drill", "Trap", 144, 0, { kick: "x.....x...x.x...", snare: "......x.......x.", ch: "x..x..x.x..x..x.", oh: "...............x" }],
    ["Memphis", "Trap", 136, 0, { kick: "x..x..x...x..x..", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", cow: "x.......x......." }],
    ["Phonk", "Trap", 130, 0, { kick: "x.....x.x.....x.", clap: "....x.......x...", ch: "xxxxxxxxxxxxxxxx", cow: "x..x..x.x..x..x." }],
    ["Drift Phonk", "Trap", 128, 0, { kick: "x..x....x.x.....", clap: "....x.......x...", cow: "x.x.x.x.x.x.x.x.", ch: "x.x.x.x.x.x.x.x." }],
    ["Trap Soul", "Trap", 135, 0, { kick: "x.......x.......", clap: "........x.......", ch: "x.x.x.x.x.x.x.x.", rim: "......x.....x..." }, { ch: "..............2." }],
    ["Hard Trap", "Trap", 148, 0, { kick: "x.x.....x..x....", clap: "........x.......", snare: "........x.......", ch: "x.x.x.x.x.x.x.x." }, { ch: "......3.......4." }],
    ["Melodic Trap", "Trap", 140, 0, { kick: "x.......x.x....x", clap: "........x.......", ch: "x.x.x.x.x.x.x.x.", oh: "......x........." }, { ch: "..........3....." }],
    ["Stutter", "Trap", 140, 0, { kick: "x..x..x.x.......", clap: "........x.......", ch: "xxxxxxxxxxxxxxxx" }, { ch: "..2...3...2...4." }],
    ["Cloud Trap", "Trap", 130, 0, { kick: "x.........x.....", clap: "........x.......", ch: "x...x...x...x...", oh: "..x.......x....." }, { ch: "............3..." }],
    ["Jersey Club", "Trap", 140, 0, { kick: "x..x..x.x.x...x.", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Bounce Trap", "Trap", 146, 0, { kick: "x..x....x..x.x..", clap: "........x.......", ch: "x.x.x.x.x.x.x.x." }, { ch: "...2...........4" }],
    ["Sparse Trap", "Trap", 138, 0, { kick: "x...........x...", clap: "........x.......", ch: "x...x...x...x..." }, { ch: "....3.......3..." }],
    ["Detroit", "Trap", 100, 0, { kick: "x.xx..x...x.x...", clap: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Opium", "Trap", 155, 0, { kick: "x.x.x.x.x.x.x.x.", clap: "....x.......x...", ch: "xxxxxxxxxxxxxxxx" }],
    ["Half-Time Heavy", "Trap", 140, 0, { kick: "x.........x...x.", snare: "........x.......", clap: "........x.......", ch: "x.x.x.x.x.x.x.x.", oh: "...............x" }],
    ["Triplet Kick", "Trap", 140, 0, { kick: "x..x..x.........", clap: "........x.......", ch: "x.x.x.x.x.x.x.x." }, { ch: ".......3........" }],
    ["Late Night Trap", "Trap", 132, 0, { kick: "x......x..x.....", clap: "........x.......", ch: "x.x.x.x.x.x.x.x.", rim: "...x.......x...." }, { ch: "..............3." }],
    ["Heartbeat", "Ambient", 62, 0, { kick: "x..x............" }],
    ["Pulse", "Ambient", 70, 0, { kick: "x.......x.......", ch: "....x.......x..." }],
    ["Raindrop Rims", "Ambient", 72, 0.1, { kick: "x...............", rim: "x..x..x...x..x.." }],
    ["Tidal", "Ambient", 64, 0, { kick: "x.........x.....", oh: "........x......." }],
    ["Distant Toms", "Ambient", 68, 0, { kick: "x...............", tom: "x.....x...x....." }],
    ["Glass Ticks", "Ambient", 80, 0, { kick: "x.......x.......", ch: "x..x..x..x..x..x" }],
    ["Slow Bloom", "Ambient", 66, 0, { kick: "x...............", clap: "........x.......", oh: "....x.......x..." }],
    ["Driftwood", "Ambient", 75, 0.15, { tom: "x.......x.......", rim: "..x...x...x...x." }],
    ["Moss", "Ambient", 70, 0.1, { kick: "x.....x.........", rim: "........x.......", ch: "..x...x...x...x." }],
    ["Starlight", "Ambient", 84, 0, { kick: "x...............", ch: "x.x.x.x.x.x.x.x.", oh: "..............x." }],
    ["Breathing", "Ambient", 60, 0, { kick: "x.......x.......", oh: "...x.......x...." }],
    ["Cave Drip", "Ambient", 72, 0, { rim: "x......x...x....", tom: "....x.........x." }],
    ["Downtempo", "Ambient", 85, 0.3, { kick: "x......x..x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Chillwave", "Ambient", 88, 0.1, { kick: "x.......x.......", clap: "....x.......x...", ch: "..x...x...x...x." }],
    ["Trip-Hop Haze", "Ambient", 80, 0.35, { kick: "x......x.x......", snare: "....x.......x...", ch: "x.x.x.xxx.x.x.x.", oh: "..............x." }],
    ["Bristol Fog", "Ambient", 78, 0.3, { kick: "x.....x...x.....", snare: "....x.......x...", ch: "x...x.x.x...x.x." }],
    ["Lullaby Bells", "Ambient", 64, 0, { rim: "x...x...x...x...", cow: ".......x......x." }],
    ["Orbit", "Ambient", 76, 0, { kick: "x...............", tom: "x..x..x.x..x..x." }],
    ["Haze", "Ambient", 70, 0.2, { kick: "x.......x.......", snare: "........x.......", ch: "....x.......x..." }],
    ["Deep Space", "Ambient", 60, 0, { kick: "x...............", oh: "........x......." }],
    ["Ambient Garage", "Ambient", 90, 0.5, { kick: "x.......x.x.....", clap: "....x.......x...", ch: "..x...x...x...x." }],
    ["Ocean Floor", "Ambient", 66, 0, { kick: "x.....x.........", tom: "...........x....", rim: "....x.......x..." }],
    ["Snowfall", "Ambient", 72, 0, { ch: "x..x..x..x..x..x", rim: ".......x.......x" }],
    ["Lantern", "Ambient", 78, 0.15, { kick: "x.......x.......", rim: "....x.......x...", oh: "......x.......x." }],
    ["Zen Garden", "Ambient", 68, 0, { tom: "x.......x.......", rim: "x..x...x..x.....", cow: "........x......." }],
    ["Motorik", "Psychedelic", 120, 0, { kick: "x...x...x...x...", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x." }],
    ["Krautrock", "Psychedelic", 128, 0, { kick: "x.x.x.x.x.x.x.x.", snare: "....x.......x...", ch: "xxxxxxxxxxxxxxxx" }],
    ["Tape Loop Toms", "Psychedelic", 108, 0.1, { kick: "x......x..x.....", snare: "....x..x....x...", tom: "..x...x...x...x.", ch: "x.x.x.x.x.x.x.x." }],
    ["Acid Rain", "Psychedelic", 124, 0, { kick: "x...x...x...x...", clap: "....x.......x...", oh: "..x...x...x...x.", ch: "x.x.x.x.x.x.x.x." }],
    ["Funk Break", "Psychedelic", 100, 0.15, { kick: "x.x...x...x.....", snare: "....x..x.x..x..x", ch: "x.x.x.x.x.x.x.x." }],
    ["Tribal", "Psychedelic", 110, 0.1, { kick: "x.......x.......", tom: "x..x..x...x.x...", rim: "..x.......x....." }],
    ["Paisley", "Psychedelic", 104, 0.3, { kick: "x......x..x.....", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", cow: "...x.......x...." }],
    ["Kaleidobreak", "Psychedelic", 112, 0.2, { kick: "x.x.......x.x...", snare: "....x..x....x...", ch: "x.xxx.xxx.xxx.xx" }],
    ["Dub Echo", "Psychedelic", 75, 0.2, { kick: "x.......x.......", rim: "....x.......x...", oh: "..x...x...x...x." }],
    ["One Drop", "Psychedelic", 76, 0.25, { kick: "........x.......", rim: "........x.......", ch: "x.x.x.x.x.x.x.x." }],
    ["Shoegaze", "Psychedelic", 118, 0, { kick: "x.......x.x.....", snare: "....x.......x...", oh: "x.x.x.x.x.x.x.x." }],
    ["Desert Psych", "Psychedelic", 96, 0.2, { kick: "x..x..x...x.....", tom: "...x..x....x..x.", snare: "....x.......x..." }],
    ["Madchester", "Psychedelic", 108, 0.4, { kick: "x.....x...x.....", snare: "....x.......x...", ch: "xxxxxxxxxxxxxxxx", oh: "..x...x...x...x." }],
    ["Space Rock", "Psychedelic", 124, 0, { kick: "x.x...x.x.x...x.", snare: "....x.......x...", oh: "x...x...x...x..." }],
    ["Raga Pulse", "Psychedelic", 100, 0.1, { kick: "x.......x.......", tom: "x..x..x.x..x..x.", rim: "....x..x....x..." }],
    ["Fuzz Break", "Psychedelic", 102, 0.2, { kick: "x..x..x...x.x...", snare: "....x.......x.x.", ch: "x.x.x.x.x.x.x.x." }],
    ["Neo-Psych", "Psychedelic", 110, 0.15, { kick: "x.......xx......", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", tom: "..............xx" }],
    ["Mushroom Shuffle", "Psychedelic", 98, 0.55, { kick: "x.....x...x.....", snare: "....x.......x...", ch: "x.xx.xx.xx.xx.xx" }],
    ["Swirl", "Psychedelic", 116, 0, { kick: "x...x...x...x...", clap: "..x...x...x...x.", ch: "xxxxxxxxxxxxxxxx" }],
    ["Prism", "Psychedelic", 105, 0.15, { kick: "x.x...x..x..x...", rim: "....x.......x...", cow: "x..x..x..x..x..." }],
    ["Electric Sitar", "Psychedelic", 95, 0.2, { kick: "x..x....x..x....", snare: "....x.......x...", tom: "x.......x......." }],
    ["Liquid Light", "Psychedelic", 90, 0.25, { kick: "x.......x.x.....", snare: "....x.......x...", oh: "......x.......x.", ch: "x...x...x...x..." }],
    ["Wah Groove", "Psychedelic", 100, 0.3, { kick: "x.x...x.x.......", snare: "....x.......x...", ch: "x.xxx.xxx.xxx.xx", oh: "......x........." }],
    ["Dream Machine", "Psychedelic", 112, 0.1, { kick: "x.......x.......", snare: "....x.......x...", ch: "x.x.x.x.x.x.x.x.", tom: "......x.......x.", cow: "..x.......x....." }],
    ["Cosmic Disco", "Psychedelic", 118, 0, { kick: "x...x...x...x...", clap: "....x.......x...", oh: "..x...x...x...x." }],
  ];
  const HAT_ROWS = ["ch", "oh"];
  // which of the four written beats each beat of the current meter borrows
  function beatOrder(n, half) {
    if (n <= 1) return [0];
    // half-time beats put the snare on beat 3, so shorter bars keep a mid-bar snare
    if (half) return n === 2 ? [0, 2] : n === 3 ? [0, 2, 3] : n === 4 ? [0, 1, 2, 3] : [0, 1, 2, 3, 3].slice(0, n);
    if (n === 2) return [0, 1];
    const seq = [0];
    for (let k = 1; k < n - 1; k++) seq.push(k % 2 === 1 ? 1 : 2);
    seq.push(3);
    return seq;
  }
  function cellFor(row, cell, size) {
    const hits = [...cell].map((c, i) => c === "x" ? i : -1).filter(i => i >= 0);
    if (size === 4) return hits;
    // 6-step (dotted) beats: hats become an eighth-note pulse, other hits keep their place
    if (HAT_ROWS.includes(row) && hits.length >= 2) return hits.length >= 4 ? [0, 1, 2, 3, 4, 5] : hits.length === 3 ? [0, 2, 3, 4] : [0, 2, 4];
    return [...new Set(hits.map(i => Math.min(5, Math.round(i * 1.5))))];
  }
  function buildBeat(i) {
    const pat = BEATS[i][4], groups = meterOf(state.seq.meter)[1];
    const back = ["snare", "clap", "rim"].map(r => pat[r] || "").join("|");
    const half = !["snare", "clap", "rim"].some(r => pat[r] && pat[r][4] === "x") && ["snare", "clap", "rim"].some(r => pat[r] && pat[r][8] === "x");
    const order = beatOrder(groups.length, half);
    const rows = {};
    for (const [id] of DRUMS) {
      const row = emptyRow(), src = pat[id];
      if (src) {
        let at = 0;
        groups.forEach((size, k) => {
          const ci = order[k], cell = src.slice(ci * 4, ci * 4 + 4);
          cellFor(id, cell, size).forEach(s => { if (at + s < MAXSTEPS) row[at + s] = true; });
          at += size;
        });
      }
      rows[id] = row;
    }
    return rows;
  }
  let beatUndo = null;
  const btEl = document.getElementById("beats"), btList = document.getElementById("btList"), btInfo = document.getElementById("btInfo");
  const btTempo = document.getElementById("btTempo"), btUndo = document.getElementById("btUndo");
  try { btTempo.checked = localStorage.getItem("nightbloom-beattempo") === "1"; } catch (e) {}
  btTempo.addEventListener("change", () => { try { localStorage.setItem("nightbloom-beattempo", btTempo.checked ? "1" : "0"); } catch (e) {} });
  function applyBeat(i, fromUser) {
    if (fromUser) {
      beatUndo = { rows: Object.fromEntries(DRUMS.map(([id]) => [id, state.seq.rows[id].slice()])), swing: state.drum.swing, bpm: state.seq.bpm, beat: state.seq.beat };
      btUndo.disabled = false;
    }
    const rows = buildBeat(i);
    for (const id in rows) state.seq.rows[id] = rows[id];
    state.seq.beat = { i, dirty: false };
    if (fromUser) {
      state.drum.swing = BEATS[i][3];
      if (btTempo.checked) setBpm(BEATS[i][2]);
    }
    if (seqBuilt) paintSeq();
    save();
  }
  // Beat picker: tap a beat to hear it (nothing changes yet), then "Use this beat" or "Cancel".
  let btPick = null, pv = null;
  const btUse = document.getElementById("btUse");
  function stopPreview() {
    if (pv) { clearInterval(pv.timer); pv = null; }
    btList.querySelectorAll(".bt-play").forEach(x => { x.textContent = "▶"; x.setAttribute("aria-label", x.dataset.label); });
  }
  function startPreview(i) {
    stopPreview();
    start(); if (!ctx) return;
    if (playing) stopSeq();
    const rows = buildBeat(i), n = stepsNow();
    const bpm = btTempo.checked ? BEATS[i][2] : state.seq.bpm, swing = BEATS[i][3];
    const dur = 60 / bpm / 4;
    pv = { i, step: 0, next: ctx.currentTime + 0.06 };
    const tick = () => {
      if (pv && pv.next < ctx.currentTime - 0.05) { const k = Math.ceil((ctx.currentTime - pv.next) / dur); pv.next += k * dur; pv.step = (pv.step + k) % n; }
      while (pv && pv.next < ctx.currentTime + NB_LA) {
        const s = pv.step, t = s % 2 === 1 ? pv.next + swing * dur * 0.5 : pv.next;
        for (const [id] of DRUMS) if (rows[id][s]) playDrum(id, t);
        pv.next += dur; pv.step = (s + 1) % n;
      }
    };
    tick(); pv.timer = setInterval(tick, 25);
    const b = btList.querySelector('.bt-play[data-i="' + i + '"]');
    if (b) { b.textContent = "■"; b.setAttribute("aria-label", "Stop preview"); }
  }
  function pickBeat(i) {
    btPick = i;
    btList.querySelectorAll(".bt-item").forEach(r => r.classList.toggle("on", Number(r.dataset.i) === i));
    btUse.disabled = false;
    btUse.textContent = "Use " + BEATS[i][0];
  }
  function renderBeats(msg) {
    btList.innerHTML = "";
    btInfo.textContent = msg || "Tap a beat to hear it. Nothing changes until you tap Use.";
    let lastStyle = "";
    beatOrderIdx().forEach(i => { const [name, style, bpm, swing] = BEATS[i];
      if (style !== lastStyle) {
        const h = document.createElement("div"); h.className = "bt-style"; h.textContent = style; btList.appendChild(h); lastStyle = style;
      }
      const item = document.createElement("div"); item.className = "bt-item"; item.dataset.i = i;
      if (btPick === i) item.classList.add("on");
      const play = document.createElement("button"); play.className = "bt-play"; play.dataset.i = i;
      play.dataset.label = "Hear " + name; play.setAttribute("aria-label", play.dataset.label);
      play.textContent = pv && pv.i === i ? "■" : "▶";
      play.addEventListener("click", () => {
        if (pv && pv.i === i) { stopPreview(); return; }
        pickBeat(i); startPreview(i);
      });
      const b = document.createElement("button"); b.className = "bt-row";
      b.innerHTML = "<b></b><small></small>";
      b.querySelector("b").textContent = name;
      const current = state.seq.beat && state.seq.beat.i === i;
      b.querySelector("small").textContent = bpm + " bpm" + (swing ? " · swing" : "") + (current ? (state.seq.beat.dirty ? " · in use, edited" : " · in use") : "");
      b.addEventListener("click", () => { pickBeat(i); startPreview(i); });
      item.append(play, b);
      btList.appendChild(item);
    });
  }
  function openBeats() {
    btPick = null; btUse.disabled = true; btUse.textContent = "Use this beat";
    btEl.hidden = false; renderBeats();
    const cur = state.seq.beat && btList.querySelector('.bt-item[data-i="' + state.seq.beat.i + '"]');
    if (cur) cur.scrollIntoView({ block: "center" }); else btList.scrollTop = 0;
  }
  function closeBeats() { stopPreview(); btEl.hidden = true; }
  document.getElementById("beatsBtn").addEventListener("click", openBeats);
  document.getElementById("stopAll").addEventListener("click", () => { if (pv) stopPreview(); });
  document.getElementById("btCancel").addEventListener("click", closeBeats);
  btUse.addEventListener("click", () => {
    if (btPick == null) return;
    const i = btPick;
    stopPreview();
    applyBeat(i, true);
    btEl.hidden = true;
    if (document.getElementById("modeSeq").getAttribute("aria-pressed") !== "true") setMode("seq");
    if (!playing) startSeq();
  });
  btUndo.addEventListener("click", () => {
    if (!beatUndo) return;
    stopPreview();
    for (const id in beatUndo.rows) state.seq.rows[id] = beatUndo.rows[id];
    state.drum.swing = beatUndo.swing; setBpm(beatUndo.bpm); state.seq.beat = beatUndo.beat;
    beatUndo = null; btUndo.disabled = true;
    if (seqBuilt) paintSeq();
    save(); renderBeats("Your previous drums are back.");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopPreview(); });

  // ---------- per-sound pitch / length / volume ----------
  function renderDrumPanel() {
    const sel = state.drumSel;
    document.getElementById("engineLabel").textContent = "808 · " + DRUMS.find(d => d[0] === sel)[2];
    noteMsg("Pick a sound, then set its pitch and length");
    document.querySelectorAll("#drChips .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.drum === sel)));
    engineKnobsEl.innerHTML = "";
    DRUM_PAD_KNOBS.forEach(([k, label]) => makeKnob(engineKnobsEl, k, label, () => state.drumPads[state.drumSel], () => {}));
    makeKnob(engineKnobsEl, "swing", "Swing", () => state.drum, applyDrum);
    makeKnob(engineKnobsEl, "level", "Level", () => state.drum, applyDrum);
    padEls.forEach((el, id) => el.classList.toggle("sel", id === sel));
  }
  const drChips = document.getElementById("drChips");
  DRUMS.forEach(([id, code, name]) => {
    const c = document.createElement("button"); c.className = "chip"; c.dataset.drum = id; c.textContent = code;
    c.setAttribute("aria-label", name);
    c.addEventListener("click", () => { state.drumSel = id; renderDrumPanel(); save(); start(); if (ctx) playDrum(id, ctx.currentTime); });
    drChips.appendChild(c);
  });
  document.getElementById("drBeats").addEventListener("click", openBeats);
  document.getElementById("drReset").addEventListener("click", () => {
    Object.assign(state.drumPads[state.drumSel], { pitch: 0.5, length: 0.5, vol: 0.8 });
    renderDrumPanel(); save(); if (ctx) playDrum(state.drumSel, ctx.currentTime);
  });


