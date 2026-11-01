    // ======================================================================
    // 157, stage 2 of the rebuild: Play. The performance surface, laid out as the plan says: the stack of sounds on
    // the left (each with its level, its arp tag and ✕), the eight macro knobs and the four faders in the middle with
    // eight big pads under them (the MiniLab's eight: pad 5–8 above 1–4, a bank button for 9–16, ‹ › for the next pad
    // set), the thumb controls on the right (Hold, Arp, Scale lock, Octave − +, FX, Jam), and along the bottom the
    // transport (what ▶ plays, ▶, ■, ● Rec, ● Loop, Count-in, Tap tempo) with the set list (‹ song ›). When no
    // MiniLab is connected a two-octave keyboard sits below the pads. Nothing opens on top of the pads or keys: the
    // sound picker slides in from the left over the stack, the rest are small popups at the sides.
    // Play is Live underneath: opening Play opens Live and moves Live's own cards, knobs, faders and pads into this
    // layout, so the MiniLab, the K.O. II, the computer keys, the lock, the recorder, Jam, Gear and every Live key
    // keep working exactly as they do, and closing Play puts them back. Live stays reachable as it was.
    // ======================================================================
    const PLAY = { el: null, open: false, moved: [], bankHi: false, taps: [], keysOn: false, keyDown: new Map(), lockHold: 0 };
    const playBtn = suHidden("playBtn", "Play");
    const PL_MOVE = ["lvCards", "lvKnobs", "lvFaders", "lvPads", "lvJamP", "lvFxp"];
    function plBuild() {
      if (PLAY.el) return PLAY.el;
      const el = document.createElement("div"); el.className = "dj pl-view"; el.id = "playView"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Play");
      el.innerHTML = `<div class="pl-top"><button type="button" class="btn primary" id="plDone" title="Leave Play">Done</button><button type="button" class="btn pl-lock" id="plLock" aria-pressed="false" title="Lock: Back, Esc and a stray tap on Done can't close it">Lock</button><strong>Play</strong>
          <button type="button" class="pl-snd" id="plSnd" title="The sound on the knobs: tap for the picker"><b></b><small></small></button><span class="pl-sp"></span>
          <button type="button" class="btn" id="plGear">Gear</button><button type="button" class="btn" id="plLog">Log</button></div>
        <div class="pl-body">
          <section class="pl-stack" aria-label="The stack"><div class="pl-h"><span>Stack</span><button type="button" class="btn" id="plPick">Sounds…</button></div><div class="pl-cards" id="plCards"></div></section>
          <section class="pl-mid" id="plMid">
            <div class="pl-h"><button type="button" class="btn" id="plPagePrev" aria-label="Previous knob page">‹</button><span id="plPage"></span><button type="button" class="btn" id="plPageNext" aria-label="Next knob page">›</button><span class="pl-sp"></span><span class="pl-note">knobs · the MiniLab's K1–K8</span></div>
            <div class="pl-knobs" id="plKnobs"></div>
            <div class="pl-faders" id="plFaders"></div>
            <div class="pl-h"><button type="button" class="btn" id="plSetPrev" aria-label="Previous pad set">‹</button><span id="plSet"></span><button type="button" class="btn" id="plSetNext" aria-label="Next pad set">›</button><span class="pl-sp"></span><button type="button" class="btn" id="plBank" aria-pressed="false" title="The MiniLab's other bank: pads 9 to 16">9–16</button><button type="button" class="btn" id="plKit" hidden>Kit…</button></div>
            <div class="pl-pads" id="plPads"></div>
            <div class="pl-keys" id="plKeys" hidden aria-label="Keys"></div>
          </section>
          <section class="pl-thumb" aria-label="Thumb controls">
            <button type="button" id="plHold" aria-pressed="false">Hold</button><button type="button" id="plArp" aria-pressed="false">Arp</button><button type="button" id="plScale">Scale lock</button>
            <button type="button" id="plOctD">Octave −</button><button type="button" id="plOctU">Octave +</button><button type="button" id="plFx" aria-pressed="true" class="main">FX on</button><button type="button" id="plJam">Jam</button>
          </section>
        </div>
        <div class="pl-bar">
          <div class="pl-tr"><button type="button" class="btn" id="plTarget" title="What ▶ plays"></button><button type="button" class="btn pl-go" id="plGo">▶</button><button type="button" class="btn stopall pl-stop" id="plStop" title="Stop everything">■</button>
            <button type="button" class="btn" id="plRec" title="Record everything you hear">● Rec</button><button type="button" class="btn" id="plTakes" title="Your recordings">▾</button><button type="button" class="btn" id="plLoop" title="Record into Beat Pads when ▶ plays Pads">● Loop</button>
            <button type="button" class="btn" id="plCount" aria-pressed="false" title="One bar of clicks before a Beat Pads recording">Count-in</button><button type="button" class="btn" id="plTap" title="Tap the tempo">Tap</button><span class="pl-bpm" id="plBpm"></span><button type="button" class="btn" id="plCap" title="Capture: what you just played becomes a Garage track">Capture</button></div>
          <div class="pl-set"><button type="button" class="btn" id="plPrev" title="Previous song, on the next bar">‹</button><button type="button" class="pl-song" id="plSong" title="The set list"><b></b><small></small></button><button type="button" class="btn" id="plNext" title="Next song, on the next bar">›</button></div>
        </div>`;
      document.body.appendChild(el); PLAY.el = el;
      // the chrome: every button delegates to Live's own
      const click = id => () => { const b = $id(id); if (b) b.click(); };
      $id("plDone").addEventListener("click", () => { if (LV.lock) { mlHud("Play is locked", "hold Done to leave", null); return; } plClose(); });
      $id("plDone").addEventListener("pointerdown", () => { if (!LV.lock) return; clearTimeout(PLAY.lockHold); $id("plDone").classList.add("holding"); PLAY.lockHold = setTimeout(() => { $id("plDone").classList.remove("holding"); plClose(); }, 700); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(n => $id("plDone").addEventListener(n, () => { clearTimeout(PLAY.lockHold); $id("plDone").classList.remove("holding"); }));
      $id("plLock").addEventListener("click", click("lvLock"));
      $id("plSnd").addEventListener("click", () => plPicker());
      $id("plPick").addEventListener("click", () => plPicker());
      $id("plGear").addEventListener("click", () => { PLAY.pickKind = "gear"; click("lvGear")(); });
      $id("plLog").addEventListener("click", () => logTap("play"));
      $id("plPagePrev").addEventListener("click", () => setKPage(step(KPAGES, lvKP(), -1)));
      $id("plPageNext").addEventListener("click", () => setKPage(step(KPAGES, lvKP(), 1)));
      $id("plSetPrev").addEventListener("click", () => setPset(step(PSETS, LV.pset, -1)));
      $id("plSetNext").addEventListener("click", () => setPset(step(PSETS, LV.pset, 1)));
      $id("plBank").addEventListener("click", () => { PLAY.bankHi = !PLAY.bankHi; plPaintPads(); });
      $id("plKit").addEventListener("click", click("lvKit"));
      $id("plHold").addEventListener("click", click("lvHold"));
      $id("plArp").addEventListener("click", click("lvArp"));
      $id("plScale").addEventListener("click", () => { PLAY.pickKind = "scale"; const b = $id("scaleBtn") || document.querySelector("[data-open=\"scaleSheet\"]"); if (b) b.click(); else { const s = $id("scaleSheet"); if (s) s.hidden = false; } });
      $id("plOctD").addEventListener("click", () => { const b = $id("octDown"); if (b) b.click(); plPaintTop(); });
      $id("plOctU").addEventListener("click", () => { const b = $id("octUp"); if (b) b.click(); plPaintTop(); });
      $id("plFx").addEventListener("click", () => { fxKeyToggle(); plPaintTop(); });
      $id("plJam").addEventListener("click", () => { PLAY.pickKind = "jam"; click("lvJam")(); });
      $id("plTarget").addEventListener("click", () => { const order = ["seq", "rc", "bp"], n = order[(order.indexOf(LV.play) + 1) % 3]; const b = lv.querySelector(`.lv-play button[data-p="${n}"]`); if (b) b.click(); plPaintTop(); });
      $id("plGo").addEventListener("click", click("lvGo"));
      $id("plStop").addEventListener("click", click("lvStop"));
      $id("plRec").addEventListener("click", click("lvTake"));
      $id("plTakes").addEventListener("click", () => { PLAY.pickKind = "takes"; click("lvTakes")(); });
      $id("plLoop").addEventListener("click", click("lvRec"));
      $id("plCount").addEventListener("click", () => { const b = $id("bpCin"); if (b) b.click(); plPaintTop(); });
      $id("plTap").addEventListener("click", plTap);
      $id("plCap").addEventListener("click", click("lvCap"));
      $id("plPrev").addEventListener("click", click("lvSongPrev"));
      $id("plNext").addEventListener("click", click("lvSongNext"));
      $id("plSong").addEventListener("click", () => { PLAY.pickKind = "setlist"; click("lvSong")(); });
      plKeysBuild();
      return el;
    }
    // ---- the keys fallback: two octaves, C of the current octave upwards ----
    function plKeysBuild() {
      const K = $id("plKeys"); K.innerHTML = "";
      const WHITE = [0, 2, 4, 5, 7, 9, 11], BLACK = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
      for (let o = 0; o < 2; o++) WHITE.forEach((st, wi) => { const k = document.createElement("div"); k.className = "pl-key w"; k.dataset.n = o * 12 + st; k.style.setProperty("--w", o * 7 + wi); K.appendChild(k); });
      for (let o = 0; o < 2; o++) Object.keys(BLACK).forEach(st => { const k = document.createElement("div"); k.className = "pl-key b"; k.dataset.n = o * 12 + +st; k.style.setProperty("--w", o * 7 + BLACK[st]); K.appendChild(k); });
      const base = () => 60 + 12 * (state.octave || 0);
      K.addEventListener("pointerdown", e => { const k = e.target.closest(".pl-key"); if (!k) return; e.preventDefault(); try { K.setPointerCapture(e.pointerId); } catch (x) {} const m = base() + +k.dataset.n; start(); try { noteOn(m); } catch (x) {} PLAY.keyDown.set(e.pointerId, { m, k }); k.classList.add("on"); });
      const up = e => { const d = PLAY.keyDown.get(e.pointerId); if (!d) return; PLAY.keyDown.delete(e.pointerId); d.k.classList.remove("on"); try { noteOff(d.m); } catch (x) {} };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => K.addEventListener(n, up));
      K.addEventListener("contextmenu", e => e.preventDefault());
    }
    // ---- moving Live's working parts into this layout, and back ----
    function plMoveIn() {
      PLAY.moved = PL_MOVE.map(id => { const el = $id(id); return el ? { el, p: el.parentNode, n: el.nextSibling } : null; }).filter(Boolean);
      $id("plCards").appendChild($id("lvCards")); $id("plKnobs").appendChild($id("lvKnobs")); $id("plFaders").appendChild($id("lvFaders")); $id("plPads").appendChild($id("lvPads"));
      if ($id("lvJamP")) $id("plMid").appendChild($id("lvJamP")); if ($id("lvFxp")) document.body.appendChild($id("lvFxp"));   // (the Jam panel covers the middle; the FX panel floats at the right as it does in Live)
      lvPadEls.forEach((el, i) => el.style.setProperty("--pp", (i % 8) < 4 ? 4 + (i % 8) : (i % 8) - 4));   // 5–8 above 1–4, as on the MiniLab
    }
    function plMoveBack() {
      PLAY.moved.forEach(({ el, p, n }) => { if (p) p.insertBefore(el, n && n.parentNode === p ? n : null); });
      PLAY.moved = [];
    }
    // ---- paint ----
    const plPressed = (id, on) => nbA($id(id), "aria-pressed", String(!!on));
    const plMirror = (from, to) => { const f = $id(from); if (f) plPressed(to, f.getAttribute("aria-pressed") === "true"); };
    function plPaintTop() {
      if (!PLAY.open) return;
      const sn = $id("lvSnd"); if (sn) { nbT($id("plSnd").querySelector("b"), sn.querySelector("b").textContent); nbT($id("plSnd").querySelector("small"), (sn.querySelector("small").textContent || "").replace(/\s*·\s*tap.*$/i, "")); }
      nbT($id("plPage"), kpName(lvKP())); nbT($id("plSet"), psetName(LV.pset)); $id("plKit").hidden = !isBank(LV.pset);
      plPressed("plLock", LV.lock); PLAY.el.classList.toggle("locked", !!LV.lock); $id("plDone").title = LV.lock ? "Hold to leave Play" : "Leave Play";
      plMirror("lvHold", "plHold"); plMirror("lvArp", "plArp"); plPressed("plFx", state.fx.on !== false); nbT($id("plFx"), state.fx.on !== false ? "FX on" : "FX off");
      const cin = $id("bpCin"); plPressed("plCount", cin && cin.getAttribute("aria-pressed") === "true"); $id("plCount").hidden = LV.play !== "bp";
      nbT($id("plTarget"), "▶ plays " + ({ seq: "Seq", rc: "Rhythm", bp: "Pads" })[LV.play]);
      const go = $id("lvGo"); if (go) { nbT($id("plGo"), go.textContent); plPressed("plGo", go.getAttribute("aria-pressed") === "true"); $id("plGo").classList.toggle("on", go.classList.contains("on")); }
      const tk = $id("lvTake"); if (tk) { $id("plRec").classList.toggle("on", tk.classList.contains("on") || tk.getAttribute("aria-pressed") === "true"); }
      const lp = $id("lvRec"); if (lp) { $id("plLoop").classList.toggle("on", lp.classList.contains("on") || lp.getAttribute("aria-pressed") === "true"); $id("plLoop").hidden = LV.play !== "bp"; }
      nbT($id("plBpm"), Math.round(rcBpm()) + " bpm");
      const S = SL.cur >= 0 ? SL.songs[SL.cur] : null;
      nbT($id("plSong").querySelector("b"), S ? S.name : SL.songs.length ? "no song" : "no set list");
      nbT($id("plSong").querySelector("small"), S ? (SL.pend ? "switching on the next bar" : (SL.cur + 1) + " of " + SL.songs.length + (S.label ? " · " + S.label : "")) : "tap to make one");
      const keys = !mlLive(); if (keys !== PLAY.keysOn) { PLAY.keysOn = keys; $id("plKeys").hidden = !keys; PLAY.el.classList.toggle("keys-on", keys); }
    }
    function plPaintPads() { if (!PLAY.open) return; plPressed("plBank", PLAY.bankHi); PLAY.el.classList.toggle("bank-hi", PLAY.bankHi); }
    // ---- popups: Live's popup sits inside Live, under Play, so it is parked out while Play is open ----
    function plPickStyle() {
      if (!PLAY.open) return;
      if (pick.parentNode !== document.body) document.body.appendChild(pick);
      pick.classList.add("standalone"); pick.classList.toggle("drawer", PLAY.pickKind === "sounds"); gearBack.hidden = pick.hidden || PLAY.pickKind === "sounds";   // (the drawer leaves the pads playable)
    }
    { const pa = popAt; popAt = function () { const r = pa.apply(this, arguments); if (PLAY.open && !pick.hidden) { GEAR.standalone = true; plPickStyle(); } return r; }; }
    new MutationObserver(() => {
      if (!PLAY.open) return;
      if (!pick.hidden) { GEAR.standalone = true; plPickStyle(); }
      else { pick.classList.remove("drawer", "standalone"); gearBack.hidden = true; PLAY.pickKind = ""; GEAR.standalone = false; if (pick.parentNode !== lv) lv.appendChild(pick); }
    }).observe(pick, { attributes: true, attributeFilter: ["hidden"] });
    function plPicker() { start(); PLAY.pickKind = "sounds"; openSounds(); }
    // ---- open and close ----
    function plOpen() {
      start(); plBuild(); if (PLAY.open) return;
      if (lv.hidden) lvOpen();
      PLAY.open = true; PLAY.el.hidden = false; document.body.classList.add("play-on");
      try { PAGE_NAME.live = "Play"; } catch (e) {}
      plMoveIn(); plPaintPads(); plPaintTop(); try { paintCards(true); } catch (e) {} lvPaintKnobs(); lvPaintPads(true);
      PLAY.tick = setInterval(() => { if (!PLAY.open) { clearInterval(PLAY.tick); return; } plPaintTop(); }, 250);
      add139("play", "open"); try { shPaint(); } catch (e) {}
    }
    function plClose() {
      if (!PLAY.open) return;
      try { closePick(); } catch (e) {}
      PLAY.open = false; PLAY.el.hidden = true; document.body.classList.remove("play-on"); clearInterval(PLAY.tick);
      try { PAGE_NAME.live = "Live"; } catch (e) {}
      plMoveBack(); pick.classList.remove("drawer");
      if (!lv.hidden) lvClose();
      add139("play", "close"); try { shPaint(); } catch (e) {}
    }
    // Live's own Done (the MiniLab's way out, a key) closes Play with it
    new MutationObserver(() => { if (lv.hidden && PLAY.open) plClose(); }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    // ---- tap tempo ----
    function plTap() {
      const now = performance.now(); PLAY.taps = PLAY.taps.filter(t => now - t < 2500); PLAY.taps.push(now);
      if (PLAY.taps.length >= 2) { const iv = []; for (let i = 1; i < PLAY.taps.length; i++) iv.push(PLAY.taps[i] - PLAY.taps[i - 1]); iv.sort((a, b) => a - b); const med = iv[Math.floor(iv.length / 2)]; const bpm = Math.round(60000 / med); if (bpm >= 50 && bpm <= 180) { setBpm(bpm); mlHud("Tempo", bpm + " bpm", null); } }
      else mlHud("Tap tempo", "keep tapping", null);
      plPaintTop();
    }
    playBtn.addEventListener("click", () => plOpen());
    // the strip's Play space opens Play, not bare Live
    { const sg = shGo; shGo = function (sp) { if (sp === "play") { start(); suClose(false); plOpen(); add139("strip", sp); shPaint(); return; } if (PLAY.open) plClose(); return sg.apply(this, arguments); }; }
    { const sn = shSpaceNow; shSpaceNow = () => suOpenNow() ? "setup" : PLAY.open || !lv.hidden ? "play" : "build"; }
    (window.__nbReportExtras = window.__nbReportExtras || []).push(() => ({ play: { open: PLAY.open, bankHi: PLAY.bankHi, keys: PLAY.keysOn, pick: PLAY.pickKind || "" } }));
    window.__live21 = { PLAY, plOpen, plClose, plPaintTop, plTap, plPicker };
