    // ======================================================================
    // Live: Now playing (140). The column shows everything that's sounding, all the time: a card for each layer
    // (its name, whether it's arpeggiating, in the arp or left out, its level, and ✕), the one the knobs edit lit up;
    // Hold with the notes it's holding (and the MiniLab's sustain); the Arp; and the sounds themselves, always in
    // view: Quick, Favourites or Lately, tap for alone, + to layer.
    // ======================================================================
    const L6 = Object.assign({ src: "quick" }, lsGet("nightbloom-live6", {}));
    const l6Save = () => lsSet("nightbloom-live6", { src: L6.src });
    {
      const now = document.createElement("div"); now.className = "lp-now";
      now.innerHTML = `<div class="lp-nowh"><span class="lp-lab">Now playing</span><span class="lp-sp"></span></div><div class="lp-cards" id="lvCards" role="list" aria-label="What's playing"></div><button class="lp-addl" id="lvAddL">+ Layer a sound</button>`;
      const old = perf.querySelector(".lp-snd"), head = now.querySelector(".lp-nowh");
      const lay = $id("lvLayers"), pv = $id("lvPrev"), nx = $id("lvNext"), sn = $id("lvSnd");   // (taken before they move: a detached element can't be found by id)
      head.insertBefore(lay, head.querySelector(".lp-sp")); head.append(pv, nx);
      now.appendChild(sn); sn.classList.add("lp-hide");   // (the knobs' sound now shows lit in its card)
      perf.insertBefore(now, old); old.remove();
      const held = document.createElement("span"); held.className = "lp-held"; held.id = "lvHeld"; $id("lvHold").appendChild(held);
      const snds = document.createElement("div"); snds.className = "lp-snds";
      snds.innerHTML = `<div class="lp-sndh"><span class="lp-lab">Sounds</span><div class="seg lp-src" id="lvSrc" role="group" aria-label="Which sounds">${[["quick", "Quick"], ["fav", "Favourites"], ["recent", "Lately"]].map(([k, n]) => `<button data-s="${k}">${n}</button>`).join("")}</div></div>
        <div class="lp-grid" id="lvGrid"></div><button class="lp-all" id="lvAllSnd2">All sounds…</button>`;
      perf.insertBefore(snds, $id("lvSplit"));
      // the octaves sit on the Arp's row (the room goes to the sounds)
      const row = perf.querySelector(".lp-arprow"), oc = $id("lvArpOct"), w = document.createElement("div"); w.className = "lp-octw"; w.dataset.kc = "Z X";
      w.innerHTML = '<span class="lp-lab">Octaves</span>'; w.appendChild(oc); row.insertBefore(w, $id("lvArpMore"));
      const lab = perf.querySelector(".lp-arpbox > .lp-lab"); if (lab) lab.remove();
    }
    $id("lvAddL").addEventListener("click", () => { start(); openSounds(); });
    $id("lvAllSnd2").addEventListener("click", () => { start(); tap("sndOpen"); });
    $id("lvSrc").addEventListener("click", e => { const b = e.target.closest("button[data-s]"); if (!b) return; L6.src = b.dataset.s; l6Save(); paintGrid(true); });
    // ---------- the layer cards ----------
    const isFocus = it => it.t === "syn" ? state.engine === it.id : it.t === "lib" ? state.engine === "lib" && it.i === num(() => __stk.libSel(), -1) : it.t === "inst" ? state.engine === "inst" : false;
    function chanOf(it) {
      try { const ch = mixChannels().filter(c => c.group === "Playing now"); const nm = String(it.name || "");
        return ch.find(c => c.name.replace(/ volume$/, "") === nm) || ch.find(c => c.name.startsWith(nm + " ")) || null; } catch (e) { return null; }
    }
    const levOf = c => { try { return Math.max(0, Math.min(1, mxPos(c.get(), c.law) / 100)); } catch (e) { return null; } };
    let cardSig = "";
    function paintCards(force) {
      const its = stkItems(), n = its.length, br = $id("lvSnd").classList.contains("browsing");
      const rows = its.map((it, i) => { const k = itKey(it); return { it, i, k, cur: isFocus(it), on: num(() => arpOn(k), false), inArp: armed(k), ch: chanOf(it) }; });
      if (n && !rows.some(r => r.cur)) rows[0].cur = true;
      const sig = JSON.stringify([rows.map(r => [r.it.name, r.it.kind, r.it.wait, r.k, r.cur, r.on, r.inArp, !!r.ch]), br && $id("lvSnd").querySelector("b").textContent]);
      if (!force && sig === cardSig) { paintLevels(rows); return; }
      cardSig = sig;
      $id("lvCards").innerHTML = rows.map(r => {
        const nm = r.cur && br ? $id("lvSnd").querySelector("b").textContent : r.it.name;
        const arpTxt = r.on ? "Arp" : r.inArp ? "Arp" : "No arp", arpSt = r.on ? "on" : r.inArp ? "ready" : "out";
        return `<div class="lp-card${r.cur ? " cur" : ""}${r.on ? " arping" : ""}${r.cur && br ? " browsing" : ""}" role="listitem" data-i="${r.i}" data-k="${esc3(r.k)}">
          <button class="lp-cname" data-a="focus" title="${r.cur ? "The knobs play this one (‹ › and Shift + the big knob change it)" : "Tap: the knobs play this one"}"><b>${esc3(nm)}</b><small>${esc3(r.cur && br ? "plays when you stop turning" : (r.it.kind || "") + (r.it.wait ? " · loading" : "") + (r.cur ? " · on the knobs" : ""))}</small></button>
          <button class="lp-carp" data-a="arp" data-st="${arpSt}" aria-pressed="${r.inArp}" title="${r.on ? "Arpeggiating · tap to leave it out of the arp" : r.inArp ? "In the arp: it arpeggiates when the Arp is on · tap to leave it out" : "Left out of the arp: it plays what you hold · tap to put it in"}">${arpTxt}</button>
          ${n > 1 ? `<button class="lp-cx" data-a="drop" aria-label="Stop ${esc3(r.it.name)}" title="Stop this layer">✕</button>` : ""}
          ${r.ch ? `<div class="lp-clev" data-a="lev" role="slider" aria-label="${esc3(r.it.name)} level" tabindex="0"><i></i></div>` : ""}
        </div>`; }).join("") || '<p class="lv-note">Nothing on the keys yet: pick a sound below.</p>';
      paintLevels(rows);
    }
    function paintLevels(rows) {
      rows.forEach(r => { if (!r.ch) return; const el = $id("lvCards").querySelector(`.lp-card[data-i="${r.i}"] .lp-clev`); if (!el || el.__drag) return;
        const v = levOf(r.ch); if (v == null) return; const w = (v * 100).toFixed(1) + "%"; if (el.firstChild.style.width !== w) { el.firstChild.style.width = w; el.setAttribute("aria-valuenow", Math.round(v * 100)); } });
    }
    $id("lvCards").addEventListener("click", e => {
      const b = e.target.closest("button[data-a]"), card = e.target.closest(".lp-card"); if (!b || !card) return;
      const it = stkItems()[+card.dataset.i]; if (!it) return; start();
      if (b.dataset.a === "focus") { try { __stk.focusOn(it); } catch (x) {} ML.lay = null; setTimeout(() => { lvPaintTop(); lvPaintKnobs(); paintCards(true); }, 60); }
      else if (b.dataset.a === "arp") { arpArm(card.dataset.k, !armed(card.dataset.k)); paintCards(true); }
      else if (b.dataset.a === "drop") { try { __stk.drop(it); } catch (x) {} ML.lay = null; setTimeout(() => { lvPaintTop(); lvPaintKnobs(); paintCards(true); paintGrid(true); }, 120); }
    });
    // a layer's level: drag along its bar
    $id("lvCards").addEventListener("pointerdown", e => {
      const el = e.target.closest(".lp-clev"), card = el && el.closest(".lp-card"); if (!el) return;
      const it = stkItems()[+card.dataset.i], c = it && chanOf(it); if (!c) return;
      e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} el.__drag = true;
      const set = ev => { const r = el.getBoundingClientRect(), v = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); try { c.set(mxLevel(v * 100, c.law)); saveSoon(); } catch (x) {} el.firstChild.style.width = (v * 100).toFixed(1) + "%"; el.setAttribute("aria-valuenow", Math.round(v * 100)); };
      set(e);
      const mv = ev => set(ev), up = () => { el.__drag = false; el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
    $id("lvCards").addEventListener("keydown", e => {
      const el = e.target.closest(".lp-clev"); if (!el || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const it = stkItems()[+el.closest(".lp-card").dataset.i], c = it && chanOf(it); if (!c) return; e.preventDefault(); e.stopPropagation();
      const v = Math.max(0, Math.min(1, (levOf(c) || 0) + (e.key === "ArrowRight" ? 0.05 : -0.05))); try { c.set(mxLevel(v * 100, c.law)); saveSoon(); } catch (x) {}
      el.firstChild.style.width = (v * 100).toFixed(1) + "%";
    });
    // ---------- what's being held ----------
    function paintHeld() {
      let txt = "";
      try {
        if (state.hold && heldVoices.size) { const ms = [...new Set([...heldVoices.values()].flatMap(v => v.tones || []))].sort((a, b) => a - b); txt = "Holding " + ms.slice(0, 8).map(noteName).join(" ") + (ms.length > 8 ? " +" + (ms.length - 8) : ""); }
        else if (SUS.on) txt = "Sustain (MiniLab Hold)" + (SUS.held.size ? " · " + SUS.held.size + (SUS.held.size === 1 ? " note" : " notes") : "");
      } catch (e) {}
      nbT($id("lvHeld"), txt); $id("lvHold").classList.toggle("sus", !txt.startsWith("Holding") && !!txt);
    }
    // ---------- the sounds, always in view ----------
    let gridSig = "";
    function gridIds() {
      const Q = qk();
      if (L6.src === "fav") return (typeof favs !== "undefined" ? favs : []).filter(id => entryOf(id)).slice(0, 24).map(id => { const e = entryOf(id); return [id, e.name, e.sub]; });
      if (L6.src === "recent") return L3.recent.filter(id => entryOf(id)).slice(0, 12).map(id => { const e = entryOf(id); return [id, e.name, e.sub]; });
      return Q ? Q.items().map(q => [q.id, q.name, q.sub]) : [];
    }
    function paintGrid(force) {
      const ids = gridIds(), cur = state.cur && state.cur.id;
      const sig = JSON.stringify([L6.src, ids.map(x => [x[0], x[1], playingId(x[0])]), cur]);
      if (!force && sig === gridSig) return; gridSig = sig;
      $id("lvSrc").querySelectorAll("button").forEach(b => nbA(b, "aria-pressed", String(b.dataset.s === L6.src)));
      $id("lvGrid").innerHTML = ids.length ? ids.map(([id, nm, sub]) => tileHTML(id, nm, sub)).join("") : `<p class="lv-note">${L6.src === "fav" ? "No favourites yet: ☆ a sound in All sounds." : "Nothing played lately."}</p>`;
    }
    $id("lvGrid").addEventListener("click", async e => {
      const b = e.target.closest("button[data-a]"), t = e.target.closest(".lp-tile"); if (!b || !t) return;
      const id = t.dataset.id;
      if (b.dataset.a === "alone") await soundAlone(id); else await soundToggle(id);
      ML.lay = null; setTimeout(() => { lvPaintTop(); lvPaintKnobs(); paintCards(true); paintGrid(true); }, 250);
    });
    function paintNow() { try { paintCards(); paintHeld(); paintGrid(); } catch (e) {} }
    { const pp = paintPerf; paintPerf = function () { const r = pp.apply(this, arguments); paintNow(); return r; }; }
    paintNow();
    window.__live6 = { L6, paintCards, paintGrid, paintHeld, chanOf };
