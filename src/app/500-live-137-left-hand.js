    // ======================================================================
    // Live, for the left hand (137): a column down the left with what you reach for while playing. The sound (‹ ›,
    // and a tap for the Sounds panel: what's playing, each layer in or out of the arp, Quick sounds, favourites and
    // the last ones played; tap for alone, + to layer), Hold, the Arp (tap to switch it, hold it for only as long as
    // you hold) with its octaves, and the pad split: pads 1–8 on the computer keyboard's number keys, 9–16 on the
    // MiniLab's pads.
    // ======================================================================
    const L3 = Object.assign({ split: true, arpOut: [], recent: [] }, lsGet("nightbloom-live3", {})); delete L3.arpKeys; if (!Array.isArray(L3.arpOut)) L3.arpOut = [];
    if (!Array.isArray(L3.recent)) L3.recent = [];
    const l3Save = () => lsSet("nightbloom-live3", { split: !!L3.split, arpOut: L3.arpOut.slice(-24), recent: L3.recent.slice(0, 12) });
    const esc3 = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    // ---------- the column ----------
    const perf = document.createElement("section"); perf.className = "lv-perf"; perf.setAttribute("aria-label", "Play");
    perf.innerHTML = `<div class="lp-snd"><div class="lp-lab">Sound</div><div class="lp-sndname"></div><div class="lp-sndrow"><button class="lp-layers" id="lvLayers"></button></div></div>
      <button class="lp-big lp-hold" id="lvHold" aria-pressed="false"><b>Hold</b><small>notes keep sounding</small></button>
      <div class="lp-arpbox"><div class="lp-arprow"><button class="lp-big lp-arp" id="lvArp" aria-pressed="false"><b>Arp</b><small>tap · or hold</small></button><button class="lp-more" id="lvArpMore" aria-label="Arp settings: layers, pattern, speed">⋯</button></div>
        <div class="lp-lab">Octaves</div><div class="seg lp-oct" id="lvArpOct" role="group" aria-label="Arp octaves">${[1, 2, 3, 4].map(n => `<button data-o="${n}">${n}</button>`).join("")}</div></div>
      <button class="lp-split" id="lvSplit" aria-pressed="false"><span class="lp-sw"><i></i></span><span><b>Split pads</b><small>keys 1–8 · MiniLab 9–16</small></span></button>`;
    lv.querySelector(".lv-body").prepend(perf);
    // the sound picker moves from the top bar into the column (same buttons, same arrows)
    { const row = perf.querySelector(".lp-sndrow"), lay = $id("lvLayers"); perf.querySelector(".lp-sndname").append($id("lvSnd")); row.insertBefore($id("lvPrev"), lay); row.appendChild($id("lvNext")); const old = lv.querySelector(".lv-top .lv-snd"); if (old) old.remove(); }
    // ---------- the layers that play, and each one's arp ----------
    const compsNow = () => { try { return voiceComponents(); } catch (e) { return []; } };
    const stkItems = () => { try { return window.__stk ? __stk.items() : []; } catch (e) { return []; } };
    const itKey = it => it.t === "syn" ? it.id : it.t === "lib" ? "lib" + it.i : it.t === "inst" ? "inst" : "samp";
    const armed = k => !L3.arpOut.includes(k);
    const arpLive = () => compsNow().some(c => arpOn(c.key));
    function arpSet(on) {
      const cs = compsNow();
      if (on && cs.length && !cs.some(c => armed(c.key))) { L3.arpOut = L3.arpOut.filter(k => !cs.some(c => c.key === k)); l3Save(); }   // (every layer left out: Arp puts them back in)
      arpApply(on);
    }
    function arpApply(on) {
      for (const c of compsNow()) getArp(c.key).on = !!on && armed(c.key);
      try { save(); } catch (e) {} arpClock(); arpPanelSoon(); paintPerf();
    }
    let arpPanelDirty = false;
    function arpPanelSoon() { if (document.body.classList.contains("live-on")) { arpPanelDirty = true; return; } try { renderArpPanel(); } catch (e) {} }
    function arpArm(k, inArp) {
      const wasLive = arpLive();
      L3.arpOut = L3.arpOut.filter(x => x !== k); if (!inArp) L3.arpOut.push(k); l3Save();
      if (wasLive) arpApply(true); else paintPerf();
    }
    const arpOctNow = () => { const c = compsNow().find(c => armed(c.key)); return c ? getArp(c.key).oct || 1 : 1; };
    function arpOct(n) { for (const c of compsNow()) if (armed(c.key)) getArp(c.key).oct = n; try { save(); } catch (e) {} arpClock(); arpPanelSoon(); paintPerf(); mlHud("Arp", n + (n > 1 ? " octaves" : " octave"), null); }
    // ---------- Hold ----------
    const holdOn = () => !!state.hold;
    $id("lvHold").addEventListener("click", () => { start(); holdTap(); });
    // ---------- Arp: a tap switches it; held, it plays only while you hold it ----------
    { const b = $id("lvArp"); let down = 0, was = false, mom = false, t = 0;
      b.addEventListener("pointerdown", e => { e.preventDefault(); start(); try { b.setPointerCapture(e.pointerId); } catch (x) {} down = performance.now(); was = arpLive(); mom = false; clearTimeout(t);
        t = setTimeout(() => { mom = true; b.classList.add("mom"); if (!was) arpSet(true); }, 280); });
      const up = () => { if (!down) return; down = 0; clearTimeout(t); b.classList.remove("mom");
        if (mom) { if (!was) arpSet(false); } else { arpSet(!was); arpSay(!was); } };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); arpSet(!arpLive()); } });
      b.addEventListener("click", e => e.preventDefault()); }
    $id("lvArpOct").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { start(); arpOct(+b.dataset.o); }));
    $id("lvArpMore").addEventListener("click", () => { start(); openArp(); });
    function openArp() {
      const comps = compsNow(), cfg = comps.length ? getArp((comps.find(c => armed(c.key)) || comps[0]).key) : { mode: "up", rate: "1/16", gate: 0.6 };
      popSide(420, `<div class="lv-pkh"><div><strong>Arp</strong><small>Which layers arpeggiate, and how. Layers left out keep playing what you hold.</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl">
          <div class="lv-pkg">Layers</div>
          <div class="lp-arpl">${comps.length ? comps.map(c => `<button class="lp-lay" data-k="${esc3(c.key)}" aria-pressed="${armed(c.key)}"><span class="lp-chk"></span><span>${esc3(c.name)}</span><small>${arpOn(c.key) ? "arpeggiating" : armed(c.key) ? "in the arp" : "plays as held"}</small></button>`).join("") : '<p class="lv-note">Pick a synth or instrument first.</p>'}</div>
          <div class="lv-pkg">Pattern</div><div class="lp-opts" data-f="mode">${ARP_MODES.map(([v, l]) => `<button data-v="${v}" aria-pressed="${cfg.mode === v}">${esc3(l)}</button>`).join("")}</div>
          <div class="lv-pkg">Speed</div><div class="lp-opts" data-f="rate">${ARP_RATES.map(([v]) => `<button data-v="${v}" aria-pressed="${cfg.rate === v}">${v}</button>`).join("")}</div>
          <div class="lv-pkg">Gate</div><label class="lp-gate"><input type="range" min="10" max="100" value="${Math.round((cfg.gate || 0.6) * 100)}" id="lvArpGate"><span>${Math.round((cfg.gate || 0.6) * 100)}%</span></label>
        </div>`);
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelectorAll(".lp-lay").forEach(b => b.addEventListener("click", () => { arpArm(b.dataset.k, b.getAttribute("aria-pressed") !== "true"); openArp(); }));
      pick.querySelectorAll(".lp-opts").forEach(g => g.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
        const f = g.dataset.f; for (const c of compsNow()) if (armed(c.key)) getArp(c.key)[f] = b.dataset.v; try { save(); } catch (e) {} arpClock(); arpPanelSoon(); openArp();
      })));
      const gi = pick.querySelector("#lvArpGate");
      if (gi) gi.addEventListener("input", () => { for (const c of compsNow()) if (armed(c.key)) getArp(c.key).gate = gi.value / 100; gi.nextElementSibling.textContent = gi.value + "%"; try { save(); } catch (e) {} });
    }
    // the column's panels open beside it, as tall as the screen allows (a sheet from the bottom on a phone)
    function popSide(w, html) {
      closePick(); pick.innerHTML = html; pick.hidden = false;
      const r = perf.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      if (W < 600) { pick.style.cssText = `left:10px;right:10px;bottom:10px;top:auto;width:auto;max-height:${Math.round(H * 0.8)}px`; return; }
      const top = Math.max(10, Math.round(r.top)), width = Math.min(w, W - r.right - 18);
      pick.style.cssText = `left:${Math.round(r.right + 8)}px;top:${top}px;width:${width}px;max-height:${H - top - 10}px`;
    }
    // ---------- the Sounds panel: what's playing, and everything one tap away ----------
    const qk = () => window.__qkLive || null;
    function entryOf(id) { try { if (id.startsWith("e:")) { const k = id.slice(2); return ENGINES[k] ? { id, name: ENGINES[k].name, cat: "engines" } : null; } return entryById(id) || null; } catch (e) { return null; } }
    async function soundAlone(id) {
      start();
      const Q = qk(); if (id.startsWith("my:") && Q) { await Q.alone({ id }); return; }
      const e = entryOf(id); if (!e) return;
      try { await chooseEntry(e, false); } catch (x) {}
    }
    // (159) a tap on a sound while several play: if it's one of them it gets the controls, otherwise it takes the place
    // of the one that has them, and the rest play on. The stack collapses only on purpose: hold a sound, or Only.
    const itemOf = id => { const its = stkItems(); if (id.startsWith("w:")) return its.find(x => x.t === "lib" && x.id === id.slice(2)); if (id === "e:inst") return its.find(x => x.t === "inst"); if (id.startsWith("e:")) return its.find(x => x.t === "syn" && x.id === id.slice(2)); return null; };
    async function soundTap(id) {
      start();
      const its = stkItems();
      if (its.length > 1 && !id.startsWith("my:") && window.__stk) {
        const it = itemOf(id); if (it) { try { __stk.focusOn(it); } catch (e) {} return; }
        const e = entryOf(id); if (e && !id.startsWith("n:")) { try { await __stk.swap(e); } catch (x) {} return; }
      }
      return soundAlone(id);
    }
    async function soundToggle(id) {
      start(); const Q = qk(); if (!Q) return;
      await Q.toggle({ id, eng: id.startsWith("e:") ? id.slice(2) : undefined });
    }
    const playingId = id => { const Q = qk(); try { return !!(Q && Q.playing({ id, eng: id.startsWith("e:") ? id.slice(2) : undefined })); } catch (e) { return false; } };
    const canLayer = id => { const Q = qk(); try { return !!(Q && Q.canLayer(id)); } catch (e) { return false; } };
    function tileHTML(id, name, sub) {
      const on = playingId(id), cur = !!(state.cur && state.cur.id === id);
      return `<div class="lp-tile${on ? " on" : ""}${cur ? " cur" : ""}" data-id="${esc3(id)}"><button class="lp-tm" data-a="tap" title="${on ? "Give " + esc3(name) + " the controls" : "Play " + esc3(name) + " in place of the sound with the controls"} · hold: play it alone"><b>${esc3(name)}</b><small>${esc3(sub || "")}</small></button>${canLayer(id) ? `<button class="lp-tp" data-a="layer" aria-label="${on ? "Stop " + esc3(name) : "Layer " + esc3(name) + " with what's playing"}" title="${on ? "Playing · tap to stop it" : "Layer it with what's playing"}">${on ? "✓" : "+"}</button>` : ""}</div>`;
    }
    function openSounds() {
      const items = stkItems(), Q = qk();
      const quick = Q ? Q.items() : [];
      const favIds = (typeof favs !== "undefined" ? favs : []).filter(id => entryOf(id)).slice(0, 12);
      const rec = L3.recent.filter(id => entryOf(id) && !favIds.includes(id)).slice(0, 8);
      const layers = items.map(it => { const k = itKey(it); return `<div class="lp-pl" data-k="${esc3(k)}"><span class="lp-pln"><b>${esc3(it.name)}</b><small>${esc3(it.kind || "")}${it.wait ? " · loading" : ""}</small></span>
        <button class="lp-parp" data-k="${esc3(k)}" aria-pressed="${armed(k)}" title="In the arp or not">Arp</button>${items.length > 1 ? `<button class="lp-po" data-k="${esc3(k)}" title="Only ${esc3(it.name)}: the others stop">Only</button><button class="lp-px" data-k="${esc3(k)}" aria-label="Stop ${esc3(it.name)}">✕</button>` : ""}</div>`; }).join("");
      popSide(600, `<div class="lv-pkh"><div><strong>Sounds</strong><small>Tap a sound to play it (in place of the one with the controls) · + layers it · hold a sound to play it alone</small></div><button class="btn" id="lvAllSnd">All sounds…</button><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl">
          <div class="lv-pkg">Playing now${items.length > 1 ? " · " + items.length + " layers" : ""}</div><div class="lp-pls">${layers || '<p class="lv-note">Nothing playing from the keys.</p>'}</div>
          <div class="lv-pkg">Quick</div><div class="lp-tiles">${quick.map(q => tileHTML(q.id, q.name, q.sub)).join("")}</div>
          ${favIds.length ? `<div class="lv-pkg">Favourites</div><div class="lp-tiles">${favIds.map(id => { const e = entryOf(id); return tileHTML(id, e.name, e.sub); }).join("")}</div>` : ""}
          ${rec.length ? `<div class="lv-pkg">Played lately</div><div class="lp-tiles">${rec.map(id => { const e = entryOf(id); return tileHTML(id, e.name, e.sub); }).join("")}</div>` : ""}
        </div>`);
      pick.classList.add("wide");
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelector("#lvAllSnd").addEventListener("click", () => { closePick(); tap("sndOpen"); });
      const again = () => setTimeout(() => { if (!pick.hidden && pick.querySelector(".lp-tiles")) openSounds(); lvPaintTop(); lvPaintKnobs(); }, 250);
      pick.querySelectorAll(".lp-tile").forEach(t => {
        let holdT = 0, held = false;
        t.addEventListener("click", async e => {
          const b = e.target.closest("button[data-a]"); if (!b) return; const id = t.dataset.id;
          if (held) { held = false; return; }
          if (b.dataset.a === "tap") { await soundTap(id); ML.lay = null; again(); }
          else { await soundToggle(id); ML.lay = null; again(); }
        });
        const tm = t.querySelector(".lp-tm");
        tm.addEventListener("pointerdown", () => { held = false; clearTimeout(holdT); holdT = setTimeout(async () => { held = true; try { navigator.vibrate && navigator.vibrate(12); } catch (e) {} await soundAlone(t.dataset.id); ML.lay = null; again(); }, 550); });
        ["pointerup", "pointercancel", "pointerleave"].forEach(ev => tm.addEventListener(ev, () => clearTimeout(holdT)));
      });
      pick.querySelectorAll(".lp-po").forEach(b => b.addEventListener("click", () => {
        const it = stkItems().find(x => itKey(x) === b.dataset.k); if (it && window.__stk) { try { __stk.only(it); } catch (e) {} } ML.lay = null; again();
      }));
      pick.querySelectorAll(".lp-parp").forEach(b => b.addEventListener("click", () => { arpArm(b.dataset.k, b.getAttribute("aria-pressed") !== "true"); openSounds(); }));
      pick.querySelectorAll(".lp-px").forEach(b => b.addEventListener("click", () => {
        const it = stkItems().find(x => itKey(x) === b.dataset.k); if (it && window.__stk) { try { __stk.drop(it); } catch (e) {} } ML.lay = null; again();
      }));
    }
    // the sound's name opens the Sounds panel (the full list is a tap further: All sounds…)
    lv.addEventListener("click", e => { if (e.target.closest && e.target.closest("#lvSnd")) { e.stopPropagation(); e.preventDefault(); start(); openSounds(); } }, true);
    $id("lvLayers").addEventListener("click", () => { start(); openSounds(); });
    { const cp = closePick; closePick = function () { pick.classList.remove("wide"); return cp.apply(this, arguments); }; }
    // ---------- the pad split: number keys 1–8 play pads 1–8, the MiniLab's pads play 9–16 ----------
    function lvPadIdx(i) { return L3.split && !lv.hidden ? 8 + (i % 8) : i; }
    function lvHwLight(i, on) { if (!L3.split) { mlLight(i, on); return; } if (i >= 8) { mlLight(i - 8, on); mlLight(i, on); } }
    { const l0 = L.live; L.live = function () {
        const o = l0.apply(this, arguments);
        if (L3.split) { const P = o.P; o.P = P.map((p, i) => P[8 + (i % 8)]); o.pa = psetName(LV.pset) + " · pads 9–16 (1–8: the number keys)"; o.pb = o.pa; }
        return o;
      }; }
    function setSplit(on) { L3.split = !!on; l3Save(); ML.lay = null; ML.sent.clear(); mlLightAll(); paintPerf(); mlHud(on ? "Split pads" : "One set of pads", on ? "number keys 1–8 play pads 1–8 · the MiniLab plays 9–16" : "the MiniLab's two banks play 1–8 and 9–16", null); }
    $id("lvSplit").addEventListener("click", () => setSplit(!L3.split));
    // (the number keys themselves: with the rest of Live's keys, 138)
    // ---------- keeping the column fresh ----------
    let curSeen = state.cur && state.cur.id;
    function paintPerf() {
      const hb = $id("lvHold"), ab = $id("lvArp"), on = arpLive(), n = stkItems().length;
      { const sm = $id("lvSnd").querySelector("small"); const t = sm.textContent.replace(/\s*·\s*tap.*$/i, ""); if (t !== sm.textContent) nbT(sm, t); }
      nbA(hb, "aria-pressed", String(holdOn())); nbT(hb.querySelector("small"), holdOn() ? "on · tap to let go" : stillHeld() ? "tap to let go" : "notes keep sounding");
      nbA(ab, "aria-pressed", String(on));
      const comps = compsNow(), inArp = comps.filter(c => armed(c.key)).length;
      nbT(ab.querySelector("small"), comps.length > 1 ? (inArp === comps.length ? "all " + comps.length + " layers" : inArp + " of " + comps.length + " layers") : on ? "on · tap or hold" : "tap · or hold");
      const o = arpOctNow(); $id("lvArpOct").querySelectorAll("button").forEach(b => nbA(b, "aria-pressed", String(+b.dataset.o === o)));
      nbT($id("lvLayers"), n > 1 ? n + " layers" : n === 1 ? "1 sound" : "none"); nbA($id("lvLayers"), "title", n > 1 ? n + " sounds play together: change them, layer another, or pick each one's arp" : "Change the sound or layer another");
      const sp = $id("lvSplit"); nbA(sp, "aria-pressed", String(!!L3.split));
      $id("lvPads").classList.toggle("split", !!L3.split);
      const id = state.cur && state.cur.id;
      if (id && id !== curSeen) { curSeen = id; if (entryOf(id)) { L3.recent = [id].concat(L3.recent.filter(x => x !== id)).slice(0, 12); l3Save(); } }
    }
    { const pt = lvPaintTop; lvPaintTop = function () { const r = pt.apply(this, arguments); try { paintPerf(); } catch (e) {} return r; }; }
    paintPerf();
    window.__live3 = { L3, arpSet, arpArm, arpOct, arpLive, openSounds, openArp, setSplit, lvPadIdx, paintPerf, octNow: () => arpOctNow(), arpState: () => Object.fromEntries(compsNow().map(c => [c.key, { on: arpOn(c.key), oct: getArp(c.key).oct, mode: getArp(c.key).mode }])) };
