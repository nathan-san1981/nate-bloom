    // ======================================================================
    // The strip (tablet): the MiniLab's 8 knobs, 4 faders and 16 pads across the top of every screen, each named
    // for what it does there. Drag a knob or fader in the strip to move it by touch, tap a pad to play it. Hold a
    // knob or fader (or ✎, then tap anything in the strip) to give it another job on this screen.
    // ======================================================================
    ML.strip = (window.NB_LITE || !window.NB_YOURS) ? "ml" : "always"; /* (235: others see it only with a MiniLab plugged in) */ ML.stripPads = true; ML.padMap = []; ML.edit = false; ML.pick = null;
    try { const o = JSON.parse(localStorage.getItem("nightbloom-minilab") || "{}"); if (["always", "ml", "off"].includes(o.strip)) ML.strip = o.strip; if (o.stripPads === false) ML.stripPads = false; } catch (e) {}
    try { const a = JSON.parse(localStorage.getItem("nightbloom-minilab-pads") || "[]"); if (Array.isArray(a)) ML.padMap = a.filter(m => m && m.pg && m.i >= 0 && m.i < 16 && m.t); } catch (e) {}
    const padSave = () => { try { localStorage.setItem("nightbloom-minilab-pads", JSON.stringify(ML.padMap)); } catch (e) {} };
    const mlId = cc => { const c = ctlOf(cc); return c && (c.kind === "K" || c.kind === "F") ? c.kind + c.i : null; };
    const ctlOfMap = m => m.ml ? { kind: m.ml[0], i: +m.ml.slice(1) } : ctlOf(m.cc);
    { const la = learnApply; learnApply = function (t) { if (t && t.k === "none") return true; return la.apply(this, arguments); }; }
    // ---------- what a pad does when you've given it another job ----------
    const ELSEL = "button, [role=button], .pad, .bp-pad, .gb-pad, .gb-chord, .rc-lab";
    function elRef(el) {
      if (el.id) return { k: "el", id: el.id };
      const box = el.parentElement && el.parentElement.closest("[id]"), all = box ? [...box.querySelectorAll(ELSEL)] : [];
      return { k: "el", box: box ? box.id : "", text: (el.textContent || "").trim().slice(0, 40), al: el.getAttribute("aria-label") || "", i: all.indexOf(el) };
    }
    function findEl(t) {
      if (t.id) return document.getElementById(t.id);
      const box = t.box ? document.getElementById(t.box) : null; if (!box) return null;
      const all = [...box.querySelectorAll(ELSEL)];
      return all.find(b => (b.textContent || "").trim().slice(0, 40) === t.text && (b.getAttribute("aria-label") || "") === t.al) || all[t.i] || null;
    }
    const elName = el => { const a = (el.getAttribute("aria-label") || el.getAttribute("title") || "").split(/[:(]/)[0].trim(), x = (el.textContent || "").replace(/\s+/g, " ").trim(); return (x && x.length <= 24 ? x : a || x).slice(0, 24) || "a button"; };
    function tapEl(el) {   // what a finger does: down, up, click (some controls listen to one, some to another)
      const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, pointerId: 4343, isPrimary: true, pointerType: "touch", clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.6 };
      el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new PointerEvent("pointerup", o));
      el.dispatchEvent(new MouseEvent("click", o));
    }
    function padOverrides(lay, pg) {
      lay.P0 = (lay.P || []).slice(); lay.Pyours = new Set();
      ML.padMap.forEach(m => {
        if (m.pg !== pg) return;
        lay.Pyours.add(m.i);
        if (m.t.k === "none") lay.P[m.i] = null;
        else if (m.t.k === "role") lay.P[m.i] = lay.P0[m.t.j] ? Object.assign({}, lay.P0[m.t.j]) : null;
        else if (m.t.k === "el") lay.P[m.i] = { n: m.name, c: "#9a8cc4", down() { const el = findEl(m.t); if (el) tapEl(el); else mlHud("Pad " + (m.i + 1), "can't find " + m.name + " here"); } };
      });
    }
    // ---------- the strip ----------
    const strip = document.createElement("div"); strip.className = "mls"; strip.id = "miniStrip"; strip.hidden = true;
    strip.setAttribute("role", "toolbar"); strip.setAttribute("aria-label", "MiniLab 3: knobs, faders and pads on this screen");
    strip.innerHTML = `<div class="mls-row">
        <button class="mls-name" id="mlsName" title="The MiniLab's map of this screen"><b>MiniLab</b><span id="mlsPg"></span></button>
        <div class="mls-k" id="mlsK"></div><div class="mls-f" id="mlsF"></div>
        <div class="mls-tools"><button class="btn" id="mlsEdit" aria-pressed="false" title="Change what a knob, fader or pad does here">✎</button><button class="btn" id="mlsPads" title="Show or hide the pads row" aria-label="Show or hide the pads row">▴</button></div>
      </div>
      <div class="mls-p" id="mlsP"></div>`;
    document.body.appendChild(strip);
    // (173) a 9th knob and faders 5–9 for the KeyLab (shown with body.kl-on)
    const sK = [], sF = [], sP = [];
    for (let i = 0; i < 9; i++) { const c = document.createElement("div"); c.className = "mls-c" + (i > 7 ? " mls-x" : ""); c.dataset.c = "K" + i; c.innerHTML = `<b>${i + 1}</b><span></span><em></em><i><s></s></i>`; $id("mlsK").appendChild(c); sK.push(c); }
    for (let i = 0; i < 9; i++) { const c = document.createElement("div"); c.className = "mls-c mls-fc" + (i > 3 ? " mls-x" : ""); c.dataset.c = "F" + i; c.innerHTML = `<b>${i + 1}</b><span></span><em></em><i><s></s></i>`; $id("mlsF").appendChild(c); sF.push(c); }
    for (let i = 0; i < 16; i++) { const c = document.createElement("div"); c.className = "mls-pad" + (i === 8 ? " mls-b" : ""); c.dataset.p = i; c.innerHTML = `<b>${i + 1}</b><span></span>`; $id("mlsP").appendChild(c); sP.push(c); }
    const tablet = () => { try { return matchMedia("(min-width: 760px)").matches; } catch (e) { return innerWidth >= 760; } };
    const stripOn = () => ML.strip !== "off" && tablet() && (ML.strip === "always" || mlLive()) && !document.body.classList.contains("live-on") && !document.body.classList.contains("setup-on");
    // what a knob or fader does on this screen: what you gave it, or the layout's
    function eff(kind, i, lay) {
      const pg = lay.page, id = kind + i;
      const m = LEARN.map.find(x => x.pg === pg && ((x.ml && x.ml === id) || (!x.ml && (() => { const c = ctlOf(x.cc); return c && c.kind === kind && c.i === i; })())))
        || LEARN.map.find(x => x.pg === "all" && !x.ml && (() => { const c = ctlOf(x.cc); return c && c.kind === kind && c.i === i; })());
      return m ? { t: m.t, name: m.name.replace(/ \(.*\)$/, ""), yours: true, m } : { t: (kind === "K" ? lay.K : lay.F)[i] || null, name: null, yours: false };
    }
    let stripPage = "", stripOnNow = false;
    function paintStrip(full) {
      const on = stripOn();
      if (on !== stripOnNow) {
        stripOnNow = on; strip.hidden = !on; document.body.classList.toggle("mls-on", on);
        if (!on) { closeEd(); setPick(null); }
        full = true;
      }
      if (!on) return;
      const lay = mlLayout(full), pg = lay.page;
      if (pg !== stripPage) { stripPage = pg; full = true; closeEd(); }
      document.body.classList.toggle("mls-nopads", !ML.stripPads);
      if (full) {
        $id("mlsPg").textContent = PAGE_NAME[pg] || "";
        { const kl = ML.dev === "kl"; document.body.classList.toggle("kl-on", kl); const b = strip.querySelector(".mls-name b"); if (b) b.textContent = kl ? "KeyLab" : "MiniLab"; strip.setAttribute("aria-label", (kl ? "KeyLab Essential: knobs, faders" : "MiniLab 3: knobs, faders") + " and pads on this screen"); }
        $id("mlsPads").textContent = ML.stripPads ? "▴" : "▾";
      }
      const sig = (lay.P || []).map(p => p ? (p.n || "") + "|" + (p.c || "") : "-").join(",") + [...(lay.Pyours || [])].join(",");
      if (full || sig !== strip.__sig) {
        strip.__sig = sig;
        sP.forEach((cell, i) => { const p = lay.P && lay.P[i]; cell.classList.toggle("none", !p); cell.classList.toggle("yours", !!(lay.Pyours && lay.Pyours.has(i))); cell.style.setProperty("--pc", p && p.c ? p.c : "transparent"); cell.querySelector("span").textContent = p ? p.n || "(empty)" : "—"; cell.title = "Pad " + (i + 1) + ": " + (p ? p.n || "empty" : "nothing here"); });
      }
      const fill = (cells, kind) => cells.forEach((cell, i) => {
        const e = eff(kind, i, lay), t = e.t && e.t.k !== "none" ? e.t : null, v = t ? mlGet(t) : null;
        cell.classList.toggle("none", !t); cell.classList.toggle("yours", e.yours);
        const nm = t ? (e.name || mlName(t, "")) : e.yours ? "Nothing" : "—";
        if (cell.__nm !== nm) { cell.__nm = nm; cell.querySelector("span").textContent = nm; cell.title = (kind === "K" ? "Knob " : "Fader ") + (i + 1) + ": " + nm + (e.yours ? " (yours)" : ""); }
        const tx = t ? mlText(t) : ""; if (cell.__tx !== tx) { cell.__tx = tx; cell.querySelector("em").textContent = tx; }
        cell.querySelector("s").style.width = v == null ? "0" : Math.round(Math.max(0, Math.min(1, v)) * 100) + "%";
      });
      fill(sK, "K"); fill(sF, "F");
    }
    function stripFlash(i, on) { const c = sP[i]; if (c) c.classList.toggle("hit", on); }
    function stripHot(c) { if (!c || !stripOnNow) return; const cell = (c.kind === "K" ? sK : sF)[c.i]; if (!cell) return; cell.classList.add("hot"); clearTimeout(cell.__h); cell.__h = setTimeout(() => cell.classList.remove("hot"), 450); }
    setInterval(() => { if (!document.hidden && (stripOnNow || ML.strip !== "off")) paintStrip(false); }, 300);
    setInterval(() => { if (!document.hidden && stripOnNow) paintStrip(true); }, 1500);
    addEventListener("resize", () => paintStrip(true));
    // ---------- touch: drag a knob or fader across, tap a pad; hold (or ✎) to change it ----------
    function stripCtl(cell) { const k = cell.dataset.c; return { kind: k[0], i: +k.slice(1) }; }
    ["mlsK", "mlsF"].forEach(id => $id(id).addEventListener("pointerdown", e => {
      const cell = e.target.closest(".mls-c"); if (!cell) return; e.preventDefault();
      const c = stripCtl(cell);
      if (ML.edit) { openEd(c.kind, c.i, cell); return; }
      const lay = mlLayout(), ef = eff(c.kind, c.i, lay), t = ef.t && ef.t.k !== "none" ? ef.t : null;
      try { cell.setPointerCapture(e.pointerId); } catch (x) {}
      const x0 = e.clientX, w = cell.getBoundingClientRect().width, v0 = t ? mlGet(t) : null; let moved = false;
      const hold = setTimeout(() => { if (!moved) openEd(c.kind, c.i, cell); }, 550);
      const mv = ev => {
        if (Math.abs(ev.clientX - x0) > 4) moved = true;
        if (!moved || !t || v0 == null) return;
        const v = Math.max(0, Math.min(1, v0 + (ev.clientX - x0) / Math.max(180, w * 2)));
        start(); learnApply(t, v); const tk = JSON.stringify(t); ML.virt.set(tk, v); ML.fad.delete(tk);
        mlHud((c.kind === "K" ? "Knob " : "Fader ") + (c.i + 1) + " · " + (ef.name || mlName(t, "")), mlText(t), v);
        paintStrip(false);
      };
      const up = () => { clearTimeout(hold); cell.removeEventListener("pointermove", mv); cell.removeEventListener("pointerup", up); cell.removeEventListener("pointercancel", up); if (!moved && !t && !$id("mlsEd")) mlHud((c.kind === "K" ? "Knob " : "Fader ") + (c.i + 1), "nothing here: hold it to give it a job"); };
      cell.addEventListener("pointermove", mv); cell.addEventListener("pointerup", up); cell.addEventListener("pointercancel", up);
    }));
    const stripHeld = new Map();
    $id("mlsP").addEventListener("pointerdown", e => {
      const cell = e.target.closest(".mls-pad"); if (!cell) return; e.preventDefault();
      const i = +cell.dataset.p;
      if (ML.edit) { openEd("P", i, cell); return; }
      try { cell.setPointerCapture(e.pointerId); } catch (x) {}
      const lay = mlLayout(), p = lay.P && lay.P[i]; if (!p || !p.down) { mlHud("Pad " + (i + 1), "nothing here: ✎ then tap it to give it a job"); return; }
      start(); const r = cell.getBoundingClientRect(), vel = Math.round(40 + 87 * Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
      try { p.down(vel); } catch (x) {}
      stripHeld.set(e.pointerId, { p, i }); stripFlash(i, true); mlLight(i, true);
    });
    const padLift = e => { const h = stripHeld.get(e.pointerId); if (!h) return; stripHeld.delete(e.pointerId); stripFlash(h.i, false); mlLight(h.i, false); if (h.p.up) { try { h.p.up(); } catch (x) {} } };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => $id("mlsP").addEventListener(n, padLift));
    $id("mlsName").addEventListener("click", () => { map.hidden = !map.hidden; document.body.classList.toggle("mini-open", !map.hidden); paintMap(); });
    $id("mlsPads").addEventListener("click", () => { ML.stripPads = !ML.stripPads; mlSave(); paintStrip(true); });
    function setEdit(on) { ML.edit = on; strip.classList.toggle("editing", on); $id("mlsEdit").setAttribute("aria-pressed", String(on)); if (!on) closeEd(); }
    $id("mlsEdit").addEventListener("click", () => { setEdit(!ML.edit); if (ML.edit) mlHud("Change one", "tap a knob, fader or pad in the strip"); });
    // ---------- giving a knob, fader or pad another job on this screen ----------
    const ROOT = { synths: ".app", samples: ".app", drums: ".app", dj: "#djView", grid: "#rcView", pads: "#bpView", garage: "#gbView", mix: "#mixer" };
    function screenControls(pg) {   // the knobs and sliders on this screen, named
      const root = document.querySelector(ROOT[pg] || ".app"); if (!root) return [];
      const vis = el => el.getClientRects().length > 0 && !el.closest("[hidden]") && !el.closest("#miniStrip, #miniMap, #mlsEd");
      const out = [], seen = new Set();
      // Synths, Samples and Drums: every panel's controls (Sound, FX, Arp, Motion, Jam), open or not
      const PANELS = [["#engineRow", "Sound"], ["#fxRow", "FX"], ["#arpRow", "Arp"], ["#morphRow", "Motion"], ["#jamRow", "Jam"]];
      const groupOf = el => { for (const [sel, n] of PANELS) if (el.closest(sel)) return n; return ""; };
      const main = ROOT[pg] === ".app";
      // the open panel: what you can see in it; the others: their own controls
      const KNOWN = { "#engineRow": "#engineKnobs .knob", "#fxRow": "#fxKnobs .knob, #fxVerb, #fxEchoSync, #fxDuck", "#arpRow": "#arpMode, #arpRate, #arpGate", "#morphRow": "#moX, #moY, #moMacs .knob", "#jamRow": "#jamRow input[type=range], #jamRow select" };
      const els = main ? PANELS.flatMap(([sel]) => {
          const row = document.querySelector(sel); if (!row) return [];
          const open = row.getClientRects().length > 0 && !row.closest("[hidden]");
          return open ? [...row.querySelectorAll(".knob, input[type=range], select")].filter(vis) : [...document.querySelectorAll(KNOWN[sel])];
        }) : [...root.querySelectorAll(".knob, input[type=range], select")].filter(vis);
      els.forEach(el => {
        let t = null;
        if (el.classList.contains("knob")) { const d = learnDesc(el); if (d) t = d.t; }
        else if (el.id) t = el.tagName === "SELECT" ? Q("#" + CSS.escape(el.id)) : { k: "range", id: el.id };
        else { const box = el.closest("[id]"), sel = el.tagName === "SELECT" ? "select" : "input[type=range]"; if (box) { const all = [...box.querySelectorAll(sel)]; t = Q("#" + CSS.escape(box.id) + " " + sel, all.indexOf(el)); } }
        if (!t) return; const key = JSON.stringify(t); if (seen.has(key)) return; seen.add(key);
        out.push({ t, name: mlName(t, el.getAttribute("aria-label") || ""), group: main ? groupOf(el) : "" });
      });
      return out;
    }
    function setKnob(kind, i, pg, t, name) {
      const id = kind + i, ccs = (kind === "K" ? ENC : FAD).map(s => s[i]);
      LEARN.map = LEARN.map.filter(m => !(m.pg === pg && (m.ml === id || (!m.ml && ccs.includes(m.cc)))));
      if (t) LEARN.map.push({ ml: id, t, name, pg });
      saveLearn(); renderLearn(); ML.lay = null; mlRefresh(true); paintStrip(true); if (!map.hidden) paintMap();
    }
    function setPad(i, pg, t, name) {
      ML.padMap = ML.padMap.filter(m => !(m.pg === pg && m.i === i));
      if (t) ML.padMap.push({ pg, i, t, name });
      padSave(); ML.lay = null; ML.sent.clear(); mlRefresh(true); paintStrip(true); if (!map.hidden) paintMap();
    }
    const ed = document.createElement("div"); ed.className = "mls-ed"; ed.hidden = true; ed.setAttribute("role", "dialog");
    document.body.appendChild(ed);
    function closeEd() { ed.hidden = true; ed.innerHTML = ""; ed.removeAttribute("id"); }
    function openEd(kind, i, cell) {
      const lay = mlLayout(true), pg = lay.page, isPad = kind === "P", label = (isPad ? "Pad " : kind === "K" ? "Knob " : "Fader ") + (i + 1);
      ed.id = "mlsEd"; ed.setAttribute("aria-label", label); hud.hidden = true; clearTimeout(ML.hudT);
      let now, yours, dflt;
      if (isPad) { const p = lay.P[i]; now = p ? p.n || "(empty)" : "nothing"; yours = !!(lay.Pyours && lay.Pyours.has(i)); dflt = lay.P0[i] ? lay.P0[i].n || "(empty)" : "nothing"; }
      else { const e = eff(kind, i, lay); now = e.t && e.t.k !== "none" ? (e.name || mlName(e.t, "")) : "nothing"; yours = e.yours; const d = (kind === "K" ? lay.K : lay.F)[i]; dflt = d ? mlName(d, "") : "nothing"; }
      ed.innerHTML = `<div class="mls-eh"><strong></strong><button class="btn" data-x aria-label="Close">✕</button></div>
        <p class="mls-now"></p>
        <div class="mls-eb"><button class="btn primary" data-pick></button><button class="btn" data-def></button><button class="btn" data-none>Nothing</button></div>
        <p class="mls-lab"></p><div class="mls-list"></div><p class="mls-foot">Only on ${PAGE_NAME[pg]}: the other screens keep theirs.</p>`;
      ed.querySelector("strong").textContent = label + " on " + PAGE_NAME[pg];
      ed.querySelector(".mls-now").textContent = "Now: " + now + (yours ? " (yours)" : " (the layout's)");
      ed.querySelector("[data-pick]").textContent = isPad ? "Tap a button on the screen" : "Tap a control on the screen";
      const db = ed.querySelector("[data-def]"); db.textContent = "Back to: " + dflt; db.disabled = !yours;
      const list = ed.querySelector(".mls-list"), lab = ed.querySelector(".mls-lab");
      const item = (txt, sub, fn, cur) => { const b = document.createElement("button"); b.className = "mls-it" + (cur ? " cur" : ""); b.innerHTML = "<span></span><small></small>"; b.firstChild.textContent = txt; b.lastChild.textContent = sub || ""; b.addEventListener("click", fn); list.appendChild(b); };
      if (isPad) {
        lab.textContent = "Or one of this screen's pads:";
        (lay.P0 || []).forEach((p, j) => { if (p && p.down) item(p.n || "(empty)", "pad " + (j + 1) + " of the layout", () => { setPad(i, pg, j === i ? null : { k: "role", j }, p.n || ""); closeEd(); }, lay.P[i] && lay.P[i].n === p.n); });
      } else {
        lab.textContent = "Or one of this screen's controls:";
        const cur = eff(kind, i, lay), curK = cur.t ? JSON.stringify(cur.t) : "";
        screenControls(pg).forEach(o => item(o.name, (o.group ? o.group + " · " : "") + mlText(o.t), () => { setKnob(kind, i, pg, o.t, o.name); closeEd(); }, JSON.stringify(o.t) === curK));
        if (kind === "F") {
          let chs = []; try { chs = mixChannels(); } catch (e) {}
          chs.forEach(ch => { const nm = ch.name.replace(/ volume$/, ""), tt = mixFn("n:" + nm, list2 => list2.find(c => c.name === ch.name), nm); item(nm, "Mixer", () => { setKnob(kind, i, pg, tt, nm + " (Mixer)"); closeEd(); }); });
        }
      }
      ed.querySelector("[data-x]").addEventListener("click", closeEd);
      ed.querySelector("[data-none]").addEventListener("click", () => { if (isPad) setPad(i, pg, { k: "none" }, "Nothing"); else setKnob(kind, i, pg, { k: "none" }, "Nothing"); closeEd(); });
      db.addEventListener("click", () => { if (isPad) setPad(i, pg, null); else setKnob(kind, i, pg, null); closeEd(); });
      ed.querySelector("[data-pick]").addEventListener("click", () => { closeEd(); setPick({ kind, i, pg }); });
      ed.hidden = false;
      const r = cell.getBoundingClientRect(), w = Math.min(340, innerWidth - 16);
      ed.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px"; ed.style.top = (r.bottom + 6) + "px"; ed.style.width = w + "px";
    }
    // "tap a control on the screen": the next touch picks it (a knob or slider for a knob or fader, anything you can press for a pad)
    const pickBar = document.createElement("div"); pickBar.className = "learnbar mls-pick"; pickBar.hidden = true; pickBar.setAttribute("role", "status");
    pickBar.innerHTML = '<span></span><button class="btn">Cancel</button>'; document.body.appendChild(pickBar);
    pickBar.querySelector("button").addEventListener("click", () => setPick(null));
    function setPick(p) {
      ML.pick = p; pickBar.hidden = !p; document.body.classList.toggle("mls-picking", !!p);
      if (p) pickBar.querySelector("span").textContent = (p.kind === "P" ? "Tap the button or pad for Pad " : "Tap the knob or slider for " + (p.kind === "K" ? "Knob " : "Fader ")) + (p.i + 1) + " on " + PAGE_NAME[p.pg];
    }
    document.addEventListener("pointerdown", e => {
      const p = ML.pick; if (!p || (e.target.closest && e.target.closest(".mls-pick"))) return;
      if (e.target.closest && e.target.closest("#miniStrip, #miniMap")) return;
      let done = false;
      if (p.kind === "P") {
        const el = e.target.closest && e.target.closest(ELSEL);
        if (el) { setPad(p.i, p.pg, elRef(el), elName(el)); done = true; mlHud("Pad " + (p.i + 1), elName(el)); }
      } else {
        const d = learnDesc(e.target);
        if (d) { const nm = (d.name || "").replace(/ \(.*\)$/, ""); setKnob(p.kind, p.i, p.pg, d.t, nm); done = true; mlHud((p.kind === "K" ? "Knob " : "Fader ") + (p.i + 1), nm); }
        else if (e.target.closest && e.target.closest("select")) { const s = e.target.closest("select"), t = s.id ? Q("#" + CSS.escape(s.id)) : null; if (t) { const nm = mlName(t, ""); setKnob(p.kind, p.i, p.pg, t, nm); done = true; mlHud((p.kind === "K" ? "Knob " : "Fader ") + (p.i + 1), nm); } }
      }
      if (done) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); setPick(null); setEdit(false); ML.eatClick = performance.now(); }
    }, true);
    // (the tap that picked something doesn't also press it)
    ["click", "pointerup", "mousedown", "mouseup"].forEach(n => document.addEventListener(n, e => { if (ML.eatClick && performance.now() - ML.eatClick < 700) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if (n === "click") ML.eatClick = 0; } }, true));
    document.addEventListener("pointerdown", e => { if (!ed.hidden && !e.target.closest("#mlsEd, #miniStrip")) closeEd(); }, true);
    window.addEventListener("keydown", e => { if (e.key === "Escape" && (!ed.hidden || ML.pick)) { e.preventDefault(); e.stopImmediatePropagation(); closeEd(); setPick(null); } }, true);
    // ---------- its setting, in the MiniLab's section of the MIDI sheet ----------
    { const opts = document.querySelector("#miniSec .md-opts");
      if (opts) { const l = document.createElement("label"); l.innerHTML = 'Strip at the top <select id="miniStrip2" aria-label="The MiniLab strip at the top (tablet)"><option value="always">Always (tablet)</option><option value="ml">With the MiniLab</option><option value="off">Off</option></select>'; opts.insertBefore(l, opts.firstChild.nextSibling); }
      const s = $id("miniStrip2"); if (s) { s.value = ML.strip; s.addEventListener("change", () => { ML.strip = s.value; mlSave(); paintStrip(true); }); $id("midiBtn").addEventListener("click", () => { s.value = ML.strip; }); }
    }
    // a fader given a Mixer channel keeps it after a reload
    function regMix(id) { const nm = id.slice(6); return mixFn("n:" + nm, ch => ch.find(c => c.name === nm), nm); }
    LEARN.map.forEach(m => { if (m.t && m.t.k === "fn" && /^mix:n:/.test(m.t.id) && !FNS[m.t.id]) regMix(m.t.id); });
    paintStrip(true);
