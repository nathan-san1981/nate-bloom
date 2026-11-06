  // ======================================================================
  // 241: Play it live on the DJ screen. The same hands as on Samples, on a deck:
  //   · Bend (KeyLab bend wheel, XD joystick ←→): the deck's pitch, as long as it's held. Key lock on: pitch alone,
  //     gliding; key lock off: the vinyl way, a push or a drag on the platter (speed and pitch together).
  //   · Mod wheel / XD joystick ↑: the deck speeds up while it's held, to 2× (a riser); XD joystick ↓: it slows, down
  //     to a stop (a brake). Let go and it's back at its own speed, on the beat if Auto Sync is on.
  //   · Oct − / Oct + (and , .): the deck's key an octave down or up (key shift, ±2 octaves).
  //   ([ and ] stay the DJ screen's slow and push nudges.)
  // Which deck: A, B, Both, or Auto, which follows the crossfader (the side it leans to; in the middle, the deck last
  // controlled). = swaps A and B (/ is Find). The deck the controls are on is outlined, and its letter is lit in the row.
  // ======================================================================
  {
    const K = "nightbloom-djlive";
    const L = { tgt: "auto", last: 0, bend: 12, on: true };
    try { const o = JSON.parse(localStorage.getItem(K) || "{}"); if (["a", "b", "both", "auto"].includes(o.tgt)) L.tgt = o.tgt; if ([2, 7, 12, 24].includes(o.bend)) L.bend = o.bend; if (o.on === false) L.on = false; } catch (e) {}
    const lSave = () => { try { localStorage.setItem(K, JSON.stringify({ tgt: L.tgt, bend: L.bend, on: L.on })); } catch (e) {} };
    const SPx = () => window.__sp || { joyUp: 0, slow: 0, who: "", whoAt: 0 };
    const djShown = () => { const b = document.getElementById("djlBox"); return !!(b && b.getClientRects().length && !document.hidden); };   // (the DJ view is position: fixed, so it has no offsetParent)
    // the deck(s) the hands are on
    function targets() {
      if (L.tgt === "a") return [0]; if (L.tgt === "b") return [1]; if (L.tgt === "both") return [0, 1];
      const x = DJ.xf; if (x < 0.4) L.last = 0; else if (x > 0.6) L.last = 1; return [L.last];
    }
    // what's held right now
    const held = () => { const S = SPx(); return { up: Math.max(pm.mod, S.joyUp || 0), down: S.slow || 0, bendSt: pm.bend * L.bend }; };
    const applied = [{ k: 1, pb: 0 }, { k: 1, pb: 0 }];   // what each deck has from the hands
    function applyDeck(i, k, pb) {
      const d = DJ.decks[i]; if (!d) return; const A = applied[i];
      if (Math.abs(A.k - k) < 0.002 && Math.abs(A.pb - pb) < 0.02) return;
      const wasAway = A.k !== 1 || A.pb !== 0; A.k = k; A.pb = pb;
      const glide = DJ.keylock && DJ.stretchOK && d.src && d.src.isStretch;
      if (glide) {
        d.pbend = pb; try { d.src && d.st && d.st.port.postMessage({ cmd: "psoft", pitch: Math.pow(2, ((d.semi || 0) + pb) / 12) }); } catch (e) {}
        try { djSetBend(d, k); } catch (e) {}
      } else { d.pbend = 0; try { djSetBend(d, k * Math.pow(2, pb / 12)); } catch (e) {} }   // (the vinyl way: a push on the platter)
      if (wasAway && k === 1 && pb === 0 && DJ.sync) { try { const Ld = LEAD(), F = FOL(); if (Ld.playing && F.playing) setTimeout(() => djAlign(false), 40); } catch (e) {} }
    }
    function tick(who) {
      if (!L.on || !djShown()) { [0, 1].forEach(i => applyDeck(i, 1, 0)); return; }
      const H = held(), T = targets();
      const k = Math.max(0.02, (1 + H.up) * (1 - 0.98 * H.down));
      [0, 1].forEach(i => T.includes(i) ? applyDeck(i, k, H.bendSt) : applyDeck(i, 1, 0));
      paint(who);
    }
    { const ap = applyPitch; applyPitch = function () { const r = ap.apply(this, arguments); try { tick(); } catch (e) {} return r; }; }
    // ---- the row, in the middle column under the crossfader ----
    const box = document.createElement("div"); box.className = "djl-box"; box.id = "djlBox";
    box.innerHTML = `<div class="djl-h"><b>Play it live</b><label class="djl-on"><input type="checkbox" id="djlOn"> wheels on the decks</label></div>
      <div class="djl-row"><span class="djl-lab">Deck</span><span class="seg djl-seg" role="group" aria-label="Which deck the wheels and buttons play" id="djlTgt"></span></div>
      <div class="djl-row"><button class="btn sm" id="djlOd" title="The deck an octave down (, key)">Oct −</button><output id="djlOct" title="Tap to put the deck back in its own key">0</output><button class="btn sm" id="djlOu" title="The deck an octave up (. key)">Oct +</button>
        <span class="djl-lab">Bend</span><span class="seg djl-seg" role="group" aria-label="Bend range on the decks" id="djlBend"></span></div>
      <div class="djl-live" id="djlLive" aria-live="polite"></div>
      <div class="djl-help">Bend wheel / XD ←→ pitch · mod wheel / XD ↑ faster (let go: back) · XD ↓ slower to a stop · <b>=</b> swap deck · <b>, .</b> octave</div>`;
    { const mid = djEl && djEl.querySelector(".dj-mid"); if (mid) mid.appendChild(box); }
    const $l = id => box.querySelector("#" + id);
    $l("djlOn").checked = L.on; $l("djlOn").addEventListener("change", e => { L.on = e.target.checked; lSave(); tick(); paint(); });
    function seg(el, opts, cur, fn) { el.innerHTML = ""; opts.forEach(([v, t, tip]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; if (tip) b.title = tip; b.setAttribute("aria-pressed", String(v === cur)); b.addEventListener("click", () => fn(v)); el.appendChild(b); }); }
    const setTgt = v => { if (v === "a") L.last = 0; if (v === "b") L.last = 1; L.tgt = v; lSave(); tick("deck"); paint(); };
    const octOf = d => Math.round((d.semi || 0) / 12);
    function oct(dir) {
      if (!DJ.stretchOK) { djMsg("Octave needs key lock's stretcher, which this device couldn't start"); return; }
      targets().forEach(i => { const d = DJ.decks[i]; if (!d || !d.buf) return; djSetSemi(d, (d.semi || 0) + 12 * dir); });
      const d = DJ.decks[targets()[0]]; if (d && d.buf) djMsg("Deck " + targets().map(i => "AB"[i]).join("+") + " key " + ((d.semi || 0) > 0 ? "+" : "") + (d.semi || 0) + " st");
      paint();
    }
    $l("djlOd").addEventListener("click", () => oct(-1)); $l("djlOu").addEventListener("click", () => oct(1));
    $l("djlOct").addEventListener("click", () => { targets().forEach(i => { const d = DJ.decks[i]; if (d && d.semi) djSetSemi(d, 0); }); paint(); });
    function rateStep(dir) { targets().forEach(i => { const d = DJ.decks[i]; if (!d || !d.buf) return; djSetRate(d, dir === 0 ? 1 : d.rate * (1 + dir * 0.01)); djPaintDeck(d); }); }
    document.addEventListener("keydown", e => {
      if (!L.on || !djShown() || e.ctrlKey || e.metaKey || e.altKey) return; const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key; let used = true;
      if (k === "=") setTgt(L.tgt === "both" ? "a" : (targets()[0] === 0 ? "b" : "a"));
      else if (k === ",") oct(-1); else if (k === ".") oct(1);
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    function paint(who) {
      if (!djShown()) return;
      const T = targets(), sg = L.tgt + "|" + L.bend + "|" + L.on;
      if (sg !== paint.sg) { paint.sg = sg; seg($l("djlTgt"), [["a", "A", "The wheels play deck A"], ["auto", "Auto", "The deck the crossfader leans to"], ["b", "B", "The wheels play deck B"], ["both", "Both", "Both decks together"]], L.tgt, setTgt);
      seg($l("djlBend"), [[2, "±2"], [12, "±12"], [24, "±24"]], L.bend, v => { L.bend = v; lSave(); tick(); paint(); }); }
      $l("djlTgt").querySelectorAll("button").forEach(b => { const v = b.textContent; b.classList.toggle("lit", (v === "A" && T.includes(0)) || (v === "B" && T.includes(1))); });
      deckEls.forEach((el, i) => el.classList.toggle("djl-tgt", L.on && T.includes(i)));
      const d = DJ.decks[T[0]] || DJ.decks[0], o = octOf(d), so = $l("djlOct"); so.textContent = (o > 0 ? "+" : o < 0 ? "−" : "") + Math.abs(o) + " oct"; so.classList.toggle("moved", !!(d.semi));
      $l("djlOd").disabled = $l("djlOu").disabled = !DJ.stretchOK || !L.on;
      const H = held(), k = (1 + H.up) * (1 - 0.98 * H.down), S = SPx();
      const chips = ["<span class='sp-chip" + (Math.abs(k - 1) > 0.005 ? " on" : "") + "'>" + T.map(i => "AB"[i]).join("+") + " speed " + (k < 0.03 ? "stopping" : "×" + k.toFixed(2)) + "</span>",
        "<span class='sp-chip" + (Math.abs(H.bendSt) > 0.05 ? " on" : "") + "'>Bend " + (H.bendSt >= 0 ? "+" : "−") + Math.abs(H.bendSt).toFixed(1) + " st" + (DJ.keylock ? "" : " (vinyl)") + "</span>"];
      if (S.who && performance.now() - S.whoAt < 2500) chips.push("<small>" + String(S.who).replace(/[<>&]/g, "") + "</small>");
      const html = L.on ? chips.join("") : "<small>Off: the wheels play the keys' sounds only</small>"; const lv = $l("djlLive"); if (lv.innerHTML !== html) lv.innerHTML = html;
    }
    // the crossfader moving changes the deck in Auto: hand over cleanly
    setInterval(() => { if (djShown()) tick(); else if (applied.some(a => a.k !== 1 || a.pb !== 0)) tick(); }, 80);   // (and the XD joystick's up and down, which don't pass through the wheels)
    window.__djLive = { L, targets, applied };
  }
