  // ======================================================================
  // 221: split the keyboard between the sounds in Playing. Each sound can have the whole keyboard or its own part of
  // it: three zones in one tap for a 61-key board (the bottom 21 keys, the next 20, the top 20), halves, or any range,
  // set from the lists or by playing its lowest and highest keys. The notes the zones use are the keys' own (the
  // KeyLab's C1 to C6); the sequencer and the arp still play everything.
  // ======================================================================
  {
    const ZK = "nightbloom-zones";
    const VK = "nightbloom-velsplit", getV = () => { try { return JSON.parse(localStorage.getItem(VK) || "{}") || {}; } catch (e) { return {}; } };
    const setV = V => { try { localStorage.setItem(VK, JSON.stringify(V)); } catch (e) {} try { window.__nbZonesReload && window.__nbZonesReload(); } catch (e) {} paint(); };
    const VPRE = { any: null, soft: [1, 79], hard: [80, 127] }, VPRE_N = { any: "Any velocity", soft: "Soft playing only (1–79)", hard: "Hard playing only (80–127)" };
    const getZ = () => { try { return JSON.parse(localStorage.getItem(ZK) || "{}") || {}; } catch (e) { return {}; } };
    const setZ = Z => { try { localStorage.setItem(ZK, JSON.stringify(Z)); } catch (e) {} location.hash; };
    const NN = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"], nn = m => NN[m % 12] + (Math.floor(m / 12) - 1);
    const LO = 36, HI = 96;   // a 61-key board: C1 to C6
    const PRE = { all: null, low: [36, 56], mid: [57, 76], high: [77, 96], lowh: [36, 65], highh: [66, 96] };
    const PRE_N = { all: "Whole keyboard", low: "Low · bottom 21 keys (C1–A♭2)", mid: "Middle · next 20 (A2–E4)", high: "High · top 20 (F4–C6)", lowh: "Lower half (C1–F3)", highh: "Upper half (F♯3–C6)", custom: "Custom range…" };
    const tagOfItem = it => it.t === "syn" ? "e:" + it.id : it.t === "syn2" ? "e:" + it.id + "#" + it.ci : it.t === "lib" ? "l:" + it.id : it.t === "hwx" ? "hwx:" + it.id : it.t;
    const items = () => { try { return window.__stk.items(); } catch (e) { return []; } };
    // the zones the 899 wrapper reads live: it keeps its own copy, so hand it the new one
    function apply(Z) { setZ(Z); try { window.__nbZonesReload && window.__nbZonesReload(); } catch (e) {} paint(); try { window.__stk.paint(); } catch (e) {} try { window.__kz.keys(); } catch (e) {} }
    // (230) Clear all that really clears: every split and velocity switch, for every sound (in Playing or not, a second
    // copy's and its engine's alike), and the library layers' own key ranges, so every sound is back on every key.
    // (It cleared only the sounds' exact names: a split kept under the engine's name, or a sound's from before, stayed.)
    function clearAll() {
      try { localStorage.setItem(ZK, "{}"); localStorage.setItem(VK, "{}"); } catch (e) {}
      try { (state.lib.parts || []).forEach(p => { if (p) { p.lo = 0; p.hi = 127; } }); save(); } catch (e) {}
      try { window.__nbZonesReload && window.__nbZonesReload(); } catch (e) {}
      cap = null; paint(); try { window.__stk.paint(); } catch (e) {} try { window.__kz.keys(); } catch (e) {} try { decorateZones(); } catch (e) {}
      try { window.__nbAdd && window.__nbAdd("zones", "split cleared: every sound on every key"); } catch (e) {}
      const t = document.getElementById("uiToast"); if (t) { t.textContent = "Split cleared · every sound plays on every key again"; t.hidden = false; clearTimeout(clearAll.t); clearAll.t = setTimeout(() => { t.hidden = true; }, 3000); }
    }
    const anySplit = () => { const Z = getZ(), V = getV(); let lib = false; try { lib = (state.lib.parts || []).some(p => p && p.id && (p.lo > 0 || p.hi < 127)); } catch (e) {} return Object.keys(Z).length > 0 || Object.keys(V).length > 0 || lib; };
    const sh = document.createElement("div"); sh.className = "editor sheet"; sh.id = "kzSheet"; sh.hidden = true;
    sh.innerHTML = `<div class="ed-card" role="dialog" aria-label="Split the keyboard"><div class="ed-head"><strong>Split the keyboard</strong><span class="ed-info">each sound on its own keys</span></div>
      <span class="ed-info" style="text-align:left">Pick a sound below, then drag across the keys for the part it plays.</span><canvas id="kzMap" style="width:100%;height:72px;border-radius:8px;background:#0f0d16;touch-action:none;cursor:crosshair"></canvas><div class="kz-q" id="kzQ"></div><div id="kzList"></div>
      <span class="ed-info" id="kzMsg" style="text-align:left"></span><div class="ed-foot sheet-foot"><button class="btn big primary" id="kzDone">Done</button></div></div>`;
    document.body.appendChild(sh);
    const $k = id => document.getElementById(id);
    const COL = ["#c9a6ff", "#7fd6c2", "#ffb65c", "#ff8fc7", "#8fb3ff", "#9be38a"];
    let cap = null;   // { tag, lo } while its lowest and highest keys are being played
    let act = null;   // the sound a drag on the keys gives its part to
    function paint() {
      if (sh.hidden) return;
      const Z = getZ(), its = items();
      const q = $k("kzQ"); q.innerHTML = "";
      const qb = (t, fn, dis) => { const b = document.createElement("button"); b.className = "btn"; b.textContent = t; b.disabled = !!dis; b.addEventListener("click", fn); q.appendChild(b); };
      qb("3 zones · 21 / 20 / 20", () => { const Z2 = getZ(); its.slice(0, 3).forEach((it, i) => { Z2[tagOfItem(it)] = PRE[["low", "mid", "high"][i]]; }); apply(Z2); }, its.length < 2);
      qb("2 zones · halves", () => { const Z2 = getZ(); its.slice(0, 2).forEach((it, i) => { Z2[tagOfItem(it)] = PRE[i ? "highh" : "lowh"]; }); apply(Z2); }, its.length < 2);
      qb("Soft / hard · first two sounds", () => { const V = getV(); its.slice(0, 2).forEach((it, i) => { V[tagOfItem(it)] = VPRE[i ? "hard" : "soft"]; }); setV(V); }, its.length < 2);
      qb("Clear all · every sound on every key", () => clearAll());
      if (!its.some(it => tagOfItem(it) === act)) act = its.length ? tagOfItem(its[0]) : null;
      const L = $k("kzList"); L.innerHTML = "";
      if (!its.length) { const p = document.createElement("p"); p.className = "ed-info"; p.textContent = "Nothing is playing. Add sounds (Quick sounds' +), then give each its keys."; L.appendChild(p); }
      its.forEach((it, i) => {
        const tag = tagOfItem(it), z = Z[tag] || Z[tag.replace(/#\d+$/, "")], r = document.createElement("div"); r.className = "kz-row" + (act === tag ? " act" : "");
        const nm = document.createElement("button"); nm.className = "kz-n"; nm.title = "Drag on the keys above to give " + it.name + " its part"; nm.setAttribute("aria-pressed", String(act === tag));
        nm.addEventListener("click", () => { act = tag; paint(); }); nm.innerHTML = '<i style="background:' + COL[i % COL.length] + '"></i>'; nm.appendChild(document.createTextNode(it.name));
        const sel = document.createElement("select"); sel.className = "hw-sel"; sel.setAttribute("aria-label", "Keys for " + it.name);
        const which = !z ? "all" : (Object.keys(PRE).find(k => PRE[k] && PRE[k][0] === z[0] && PRE[k][1] === z[1]) || "custom");
        Object.keys(PRE_N).forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = k === "custom" && which === "custom" ? "Custom · " + nn(z[0]) + "–" + nn(z[1]) : PRE_N[k]; sel.appendChild(o); });
        sel.value = which;
        sel.addEventListener("change", () => { const Z2 = getZ(); if (sel.value === "all") delete Z2[tag]; else if (sel.value === "custom") { Z2[tag] = z || [LO, HI]; } else Z2[tag] = PRE[sel.value]; apply(Z2); });
        r.append(nm, sel);
        if (which === "custom") {
          const nsel = (v, f) => { const s2 = document.createElement("select"); s2.className = "hw-sel kz-nt"; for (let m = 21; m <= 108; m++) { const o = document.createElement("option"); o.value = m; o.textContent = nn(m); s2.appendChild(o); } s2.value = v; s2.addEventListener("change", () => { const Z2 = getZ(), c = Z2[tag] || [LO, HI]; f(c, +s2.value); Z2[tag] = [Math.min(c[0], c[1]), Math.max(c[0], c[1])]; apply(Z2); }); return s2; };
          r.append(nsel(z[0], (c, v) => { c[0] = v; }), nsel(z[1], (c, v) => { c[1] = v; }));
        }
        const pk = document.createElement("button"); pk.className = "btn"; pk.textContent = cap && cap.tag === tag ? (cap.lo == null ? "Play its lowest key…" : "…and its highest") : "Set with keys";
        pk.title = "Play this sound's lowest key, then its highest (on the KeyLab or the screen)";
        pk.addEventListener("click", () => { cap = cap && cap.tag === tag ? null : { tag, lo: null }; paint(); });
        const vz = getV()[tag] || getV()[tag.replace(/#\d+$/, "")], vs = document.createElement("select"); vs.className = "hw-sel kz-vel"; vs.setAttribute("aria-label", "Velocity for " + it.name);
        Object.keys(VPRE_N).forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = VPRE_N[k]; vs.appendChild(o); });
        vs.value = !vz ? "any" : vz[0] >= 80 ? "hard" : vz[1] <= 79 ? "soft" : "any";
        vs.addEventListener("change", () => { const V = getV(); if (vs.value === "any") delete V[tag]; else V[tag] = VPRE[vs.value]; setV(V); });
        r.appendChild(vs);
        const cl = document.createElement("button"); cl.className = "btn"; cl.textContent = "✕ Clear"; cl.title = "Back to the whole keyboard, any velocity"; cl.disabled = !z && !vz;
        cl.addEventListener("click", () => { const Z2 = getZ(), base = tag.replace(/#\d+$/, ""); if (Z2[tag]) delete Z2[tag]; else delete Z2[base]; apply(Z2); const V = getV(); if (V[tag]) delete V[tag]; else delete V[base]; setV(V); });
        r.append(pk, cl); L.appendChild(r);
      });
      $k("kzMsg").textContent = "Zones use the keys' own notes (a 61-key board runs C1 to C6). Velocity picks a sound by how hard you play: soft for one, hard for another. The sequencer and the arp still play every sound.";
      drawMap(Z, its);
    }
    function drawMap(Z, its) {
      const cv = $k("kzMap"), c = cv.getContext("2d"), dpr = devicePixelRatio || 1, w = cv.width = cv.clientWidth * dpr, h = cv.height = cv.clientHeight * dpr;
      const whites = []; for (let m = LO; m <= HI; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      const kw = w / whites.length; c.clearRect(0, 0, w, h);
      whites.forEach((m, i) => { c.fillStyle = "#e9e4f2"; c.fillRect(i * kw + 1, 0, kw - 2, h); if (m % 12 === 0) { c.fillStyle = "#6b6380"; c.font = Math.round(10 * dpr) + "px sans-serif"; c.fillText(nn(m), i * kw + 3 * dpr, h * 0.5); } });
      whites.forEach((m, i) => { if ([0, 2, 5, 7, 9].includes(m % 12) && m + 1 <= HI) { c.fillStyle = "#2a2433"; c.fillRect((i + 0.68) * kw, 0, kw * 0.64, h * 0.4); } });
      its.forEach((it, j) => { const z = Z[tagOfItem(it)] || [LO, HI], band = h / Math.max(1, its.length) * 0.5; c.fillStyle = COL[j % COL.length];
        const x0 = whites.findIndex(m => m >= z[0]), x1 = whites.length - 1 - [...whites].reverse().findIndex(m => m <= z[1]); if (x0 < 0 || x1 < x0) return;
        c.globalAlpha = 0.85; c.fillRect(x0 * kw + 1, h - band * (j + 1), (x1 - x0 + 1) * kw - 2, band - 1); c.globalAlpha = 1; });
    }
    // touching the keys: a drag paints the picked sound's part
    { const cv = $k("kzMap"); let d0 = null;
      const keyAt = e => { const r = cv.getBoundingClientRect(), whites = []; for (let m = LO; m <= HI; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, wi = Math.max(0, Math.min(whites.length - 1, Math.floor(x * whites.length))), m = whites[wi];
        if (y < 0.55) { const fx = x * whites.length - wi; if (fx > 0.7 && [0, 2, 5, 7, 9].includes(m % 12) && m + 1 <= HI) return m + 1; if (fx < 0.3 && [2, 4, 7, 9, 11].includes(m % 12) && m - 1 >= LO) return m - 1; }
        return m; };
      const set = (a, b) => { if (!act) return; const Z = getZ(); Z[act] = [Math.min(a, b), Math.max(a, b)]; if (Z[act][0] <= LO && Z[act][1] >= HI) delete Z[act]; apply(Z); };
      cv.addEventListener("pointerdown", e => { if (!act) return; d0 = keyAt(e); cv.setPointerCapture(e.pointerId); set(d0, d0); });
      cv.addEventListener("pointermove", e => { if (d0 != null) { const m = keyAt(e); const Z = getZ(); Z[act] = [Math.min(d0, m), Math.max(d0, m)]; setZ(Z); try { window.__nbZonesReload(); } catch (er) {} drawMap(Z, items()); } });
      const up = e => { if (d0 == null) return; const m = keyAt(e); set(d0, m); d0 = null; };
      cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => { d0 = null; }); }
    // "Set with keys": the next two keys played set the range, and don't sound
    { const mn = makeNote; makeNote = function (root) {
        if (cap && !sh.hidden) { if (cap.lo == null) { cap.lo = root; paint(); } else { const Z = getZ(); Z[cap.tag] = [Math.min(cap.lo, root), Math.max(cap.lo, root)]; cap = null; apply(Z); } return { tones: [], stop() {} }; }
        return mn.apply(this, arguments);
      }; }
    $k("kzDone").addEventListener("click", () => { cap = null; sh.hidden = true; });
    window.__kz = { open() { sh.hidden = false; paint(); }, paint };
    const stkRow = document.getElementById("stkRow");
    function addBtn() {
      if (!stkRow) return;
      if (!stkRow.querySelector(".kz-btn")) { const b = document.createElement("button"); b.className = "btn kz-btn"; b.textContent = "🎹 Split keys"; b.title = "Put each sound on its own part of the keyboard"; b.setAttribute("aria-label", b.title);
        b.addEventListener("click", () => window.__kz.open()); stkRow.appendChild(b); }
      const on = anySplit(), c0 = stkRow.querySelector(".kz-clr");
      if (on && !c0) { const c = document.createElement("button"); c.className = "btn kz-clr"; c.textContent = "✕ Clear split"; c.title = "Every sound back on every key, any velocity"; c.setAttribute("aria-label", c.title); c.addEventListener("click", () => clearAll()); stkRow.querySelector(".kz-btn").after(c); }
      else if (!on && c0) c0.remove();
    }
    if (stkRow) { new MutationObserver(addBtn).observe(stkRow, { childList: true }); addBtn(); }
    setInterval(() => { if (!sh.hidden && !cap) { const sig = items().map(tagOfItem).join(","); if (sig !== window.__kzSig) { window.__kzSig = sig; paint(); } } }, 800);
    // (230) the split on the keys themselves: once any sound in Playing has its own part, each key on the screen shows
    // whose it is (a colour bar per sound it plays, the key tinted when it's one sound's alone, the sound's name where
    // its part starts), and each sound's chip in Playing carries the same colour
    const zOf = (Z, tag) => Z[tag] || Z[tag.replace(/#\d+$/, "")] || null;
    function keysPaint() {
      let els; try { els = keyEls; } catch (e) { return; }
      const Z = getZ(), its = items(), any = its.some(it => zOf(Z, tagOfItem(it)));
      els.forEach(el => { el.querySelectorAll(".kzstrip,.kzlab").forEach(x => x.remove()); el.classList.remove("kz-one"); el.style.removeProperty("--kzc"); });
      document.querySelectorAll("#stkRow .stk-chip:not(.mf-keys)").forEach((c, i) => { const it = its[i]; c.classList.toggle("kz-on", !!(any && it)); if (any && it) c.style.setProperty("--kzc", COL[i % COL.length]); else c.style.removeProperty("--kzc"); });
      if (!any) return;
      const owners = m => its.map((it, i) => [it, i]).filter(([it]) => { const z = zOf(Z, tagOfItem(it)); return !z || (m >= z[0] && m <= z[1]); });
      const firstWhite = new Map();   // each zone's first key on the screen that can carry a label (a white key)
      els.forEach((el, m) => {
        const o = owners(m); if (!o.length) return;
        const st = document.createElement("div"); st.className = "kzstrip";
        o.forEach(([, i]) => { const b = document.createElement("i"); b.style.background = COL[i % COL.length]; st.appendChild(b); });
        el.appendChild(st);
        if (o.length === 1) { el.classList.add("kz-one"); el.style.setProperty("--kzc", COL[o[0][1] % COL.length]); }
        if (el.classList.contains("w")) o.forEach(([it, i]) => { const z = zOf(Z, tagOfItem(it)); if (z && !firstWhite.has(i) ) firstWhite.set(i, { el, it }); });
      });
      firstWhite.forEach(({ el, it }, i) => { const l = document.createElement("span"); l.className = "kzlab"; l.textContent = it.name; l.style.color = COL[i % COL.length]; el.appendChild(l); });
    }
    let kpSig = "";
    setInterval(() => {
      if (document.hidden) return;
      let n = 0, lo = 0; try { n = keyEls.size; lo = Math.min(...keyEls.keys()); } catch (e) {}
      const sig = localStorage.getItem(ZK) + "|" + items().map(tagOfItem).join(",") + "|" + n + "|" + lo + "|" + document.querySelectorAll("#stkRow .stk-chip").length + "|" + (document.querySelector("#keys .w .kzstrip, .w .kzstrip") ? 1 : 0);
      if (sig !== kpSig) { kpSig = sig; keysPaint(); }
    }, 400);
    window.__kz.keys = keysPaint; window.__kz.clear = clearAll;
    setInterval(addBtn, 700);   // (the Clear split button comes and goes with the split)
  }
