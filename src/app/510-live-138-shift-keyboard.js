    // ======================================================================
    // Live with the MiniLab's Shift and a computer keyboard (138).
    // Shift, held: the knobs and faders switch to their Shift layer, on screen too, until you let go. The knobs get
    // the Shift page (FX, or Sound while FX is up; tap a page while holding Shift to choose another), the faders the
    // mix of what's playing: up to three layers and the beat. Shift + the big knob steps through the sounds (it plays
    // the one you stop on). A computer keyboard runs Live: number keys play pads, letters run Hold, the Arp, the
    // sounds, the pages and the transport, and each control shows its key once a keyboard has been used.
    // ======================================================================
    const L4 = Object.assign({ spage: null, caps: true }, lsGet("nightbloom-live4", {}));
    LV.spage = L4.spage;
    const l4Save = () => lsSet("nightbloom-live4", { spage: LV.spage || null, caps: L4.caps !== false });
    function lvSPage() { const s = LV.spage && KDEF[LV.spage] ? LV.spage : "fx"; return s !== LV.kpage ? s : LV.kpage === "fx" ? "sound" : "fx"; }
    function lvKP() { return LV.shift && !lv.hidden ? lvSPage() : LV.kpage; }
    // the faders' Shift layer: each sound that's playing (up to three) and the beat
    const NOT_LAYER = ["All drums", "Notation pad", "All tracks", "Beat Pads", "Rhythm Creator", "Master volume"];
    const F_LAY = [0, 1, 2].map(n => mixFn("lv:layer" + n, ch => ch.filter(c => c.group === "Playing now" && !NOT_LAYER.includes(c.name) && !/^Deck |^DJ /.test(c.name))[n], "Layer " + (n + 1)));
    const beatFn = () => FNS[(LV.play === "bp" ? F_BP : LV.play === "rc" ? F_RC : F_DRUMS).id];
    const F_BEAT = FN("lv:beat", {
      name: () => { const F = beatFn(); return F ? (typeof F.name === "function" ? F.name() : F.name) : "The beat"; },
      get: () => { const F = beatFn(); return F ? F.get() : null; },
      set: v => { const F = beatFn(); if (F) F.set(v); },
      text: () => { const F = beatFn(); return F ? F.text() : "—"; },
    });
    function SFDEF() { return [F_LAY[0], F_LAY[1], F_LAY[2], F_BEAT]; }
    // Shift on the MiniLab (it sends CC 9, or 27 in its DAW program)
    function shiftSet(on) {
      on = !!on && !lv.hidden;
      if (!!LV.shift === on) return;
      LV.shift = on; ML.lay = null; lv.classList.toggle("shift", on);
      lvPaintKnobs(); paintShift();
      if (on) mlScreen("Shift", kpName(lvSPage()) + " + mix");
      else if (brT) brGo();
    }
    window.__nbShift = shiftSet;
    const shBadge = document.createElement("div"); shBadge.className = "lv-shb"; shBadge.setAttribute("aria-live", "polite");
    lv.querySelector(".lv-ml").appendChild(shBadge);
    function paintShift() {
      const sp = lvSPage();
      $id("lvPages").querySelectorAll("button").forEach(b => { b.classList.toggle("sp", b.dataset.k === sp); nbA(b, "title", b.dataset.k === sp ? "Shift page: hold Shift on the MiniLab for these knobs (tap a page while holding Shift to choose another)" : ""); });
      nbT(shBadge, LV.shift ? "Shift · knobs: " + kpName(sp) + " · faders: the mix of what's playing" : "");
    }
    { const pk = lvPaintKnobs; lvPaintKnobs = function () { const r = pk.apply(this, arguments); try { paintShift(); } catch (e) {} return r; }; }
    // holding Shift, a tap on a page makes it the Shift page
    $id("lvPages").addEventListener("click", e => {
      const b = e.target.closest("button[data-k]"); if (!b || !LV.shift) return;
      e.stopImmediatePropagation(); e.preventDefault();
      LV.spage = b.dataset.k; l4Save(); ML.lay = null; lvPaintKnobs();
      mlHud("Shift page", kpName(lvSPage()), null);
    }, true);
    new MutationObserver(() => { if (lv.hidden && LV.shift) { LV.shift = false; lv.classList.remove("shift"); ML.lay = null; } }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    // ---------- stepping through the sounds without loading each one on the way ----------
    let brList = null, brI = -1, brT = 0;
    function soundList() {
      const all = allEntries().filter(x => x.cat !== "kits" && !/^e:(samp|pads|drum)$/.test(x.id));
      let cat = state.cur && state.cur.cat; if (!cat || cat === "kits" || (cat === "fav" && !favs.length)) cat = "engines";
      const list = cat === "fav" ? all.filter(x => favs.includes(x.id)) : all.filter(x => x.cat === cat);
      let i = list.findIndex(x => state.cur && x.id === state.cur.id); if (i < 0) i = list.findIndex(x => x.id === "e:" + state.engine);
      return { list, i: Math.max(0, i), fav: cat === "fav" };
    }
    function browse(d) {
      if (!brList) { const r = soundList(); if (!r.list.length) return; brList = r; brI = r.i; }
      brI = (brI + d + brList.list.length) % brList.list.length;
      const e = brList.list[brI];
      $id("lvSnd").classList.add("browsing"); nbT($id("lvSnd").querySelector("b"), e.name); nbT($id("lvSnd").querySelector("small"), (brI + 1) + " of " + brList.list.length + " · plays when you stop");
      mlScreen("Sound", e.name);
      clearTimeout(brT); brT = setTimeout(brGo, 450);
    }
    function brGo() {
      clearTimeout(brT); brT = 0; const r = brList; brList = null; $id("lvSnd").classList.remove("browsing");
      if (!r) return; const e = r.list[brI]; if (!e || (state.cur && state.cur.id === e.id)) { lvPaintTop(); return; }
      start(); try { chooseEntry(e); if (r.fav && state.cur) state.cur.cat = "fav"; } catch (x) {}
      setTimeout(() => { ML.lay = null; lvPaintTop(); lvPaintKnobs(); }, 80);
    }
    // ---------- a computer keyboard ----------
    const KB_SEEN = "nightbloom-kbdseen";
    let kbThisVisit = false;
    const kbRecent = () => { if (kbThisVisit) return true; try { return Date.now() - (+localStorage.getItem(KB_SEEN) || 0) < 8 * 3600e3; } catch (e) { return false; } };
    const lettersOff = () => { try { return localStorage.getItem("nightbloom-kbd") === "0"; } catch (e) { return false; } };
    const capsOn = () => kbRecent() && L4.caps !== false && !lettersOff();
    function paintCaps() { lv.classList.toggle("lv-kbd", capsOn()); $id("lvKeys").hidden = !kbRecent(); }
    const typing = t => !!(t && t.closest && t.closest("input, textarea, select, [contenteditable]"));
    // a key from a real keyboard (a phone's on-screen keyboard only types into a text box)
    window.addEventListener("keydown", e => {
      if (!e.isTrusted || !e.code || e.code === "Unidentified" || e.keyCode === 229 || typing(e.target)) return;
      if (/^(Shift|Control|Alt|Meta|OS|Fn)/.test(e.code)) return;
      const first = !kbThisVisit; kbThisVisit = true;
      if (first) {
        try { localStorage.setItem(KB_SEEN, String(Date.now())); } catch (x) {}
        try { if (window.__kbSeen) __kbSeen(); } catch (x) {}
        paintCaps();
        if (!lv.hidden && !lettersOff()) noteMsg("Keyboard found: its keys run Live now · press ? to see them");
      }
    }, true);
    // the keys, on the controls
    const CAPS = [["lvHold", "H"], ["lvArp", "A"], ["lvPrev", "←"], ["lvNext", "→"], ["lvLayers", "S"], ["lvGo", "Space"], ["lvRec", "L"], ["lvCap", "C"], ["lvBpmD", "−"], ["lvBpmU", "="], ["lvFx", "F"], ["lvSong", "N"]];
    CAPS.forEach(([id, k]) => { const el = $id(id); if (el) el.dataset.kc = k; });
    { const o = perf.querySelector(".lp-arpbox > .lp-lab"); if (o) o.innerHTML = 'Octaves <span class="kc-inl"><kbd>Z</kbd><kbd>X</kbd></span>'; }
    { const pg = $id("lvPages"), ps = $id("lvPsets"); pg.dataset.kcg = "K"; ps.dataset.kcg = "P"; }
    lvPadEls.forEach((el, i) => { if (i < 8) el.dataset.key = String(i + 1); else el.dataset.key = "⇧" + (i - 7); });
    // a row at the foot of the column: the keys sheet
    const kb = document.createElement("button"); kb.className = "lp-keys"; kb.id = "lvKeys"; kb.hidden = true;
    kb.innerHTML = '<span class="lp-kbi" aria-hidden="true"></span><span><b>Keyboard</b><small>its keys run Live · <kbd>?</kbd> for the list</small></span>';
    perf.appendChild(kb);
    kb.addEventListener("click", () => openKeys());
    function openKeys() {
      const row = (keys, what) => `<div class="lk-row"><span class="lk-k">${keys.map(k => `<kbd>${esc3(k)}</kbd>`).join("")}</span><span>${what}</span></div>`;
      popSide(560, `<div class="lv-pkh"><div><strong>Keys</strong><small>A computer keyboard runs Live alongside the MiniLab</small></div><button class="btn" id="lvPickClose" aria-label="Close">✕</button></div>
        <div class="lv-pkl lk">
          <div class="lv-pkg">Pads</div>
          ${row(["1", "…", "8"], "pads 1–8 (the number row or the number pad)")}${row(["Shift", "1", "…", "8"], "pads 9–16")}
          <div class="lv-pkg">Playing</div>
          ${row(["H"], "Hold")}${row(["A"], "Arp: tap to switch it on or off · hold it down and it plays only while held")}${row(["Z", "X"], "Arp octaves, fewer or more")}
          <div class="lv-pkg">Sounds and pages</div>
          ${row(["←", "→"], "the previous or next sound")}${row(["S"], "Sounds: arrows to move, Enter plays it alone, + or Shift Enter layers it")}
          ${row(["K"], "the next knob page (Shift K: back)")}${row(["P"], "the next pad set (Shift P: back)")}${row(["F"], "the effects")}${row(["\u0060"], "every effect off or on")}
          <div class="lv-pkg">Jam</div>
          ${row(["J"], "Jam: the loops and the band")}${row(["Y", "U", "I", "O"], "loops 1–4: record, then play or stop")}${row(["B"], "the band on or off")}
          <div class="lv-pkg">Transport</div>
          ${row(["Space"], "▶ / ■")}${row(["R"], "● Rec: record everything you hear (save it as WAV or MP3)")}${row(["E"], "Sample: grab the last bars you heard, or record the K.O. II, onto a pad")}${row(["L"], "● Loop: record into Beat Pads (when ▶ plays Pads)")}${row(["C"], "Capture what you just played")}${row(["−", "="], "tempo down or up (with Shift: by 5)")}${row(["N"], "the next song in the set list (Shift N: back)")}${row(["Esc"], "close a panel")}${row(["G"], "Log: save what just happened, to send for a fix")}${row(["?"], "this list")}
          <div class="lv-pkg">MiniLab</div>
          <p class="lv-note">Hold <b>Shift</b>: the knobs play the <b>${esc3(kpName(lvSPage()))}</b> page (hold Shift and tap another page to change it) and the faders mix what's playing: each layer and the beat. Shift + turning the big knob steps through the sounds and plays the one you stop on.</p>
          <label class="lk-sw"><input type="checkbox" id="lvCapsOn"${L4.caps !== false ? " checked" : ""}> Show the keys on the controls</label>
        </div>`);
      pick.classList.add("wide");
      pick.querySelector("#lvPickClose").addEventListener("click", closePick);
      pick.querySelector("#lvCapsOn").addEventListener("change", e => { L4.caps = e.target.checked; l4Save(); paintCaps(); });
    }
    // ---------- what each key does in Live ----------
    const kHeld = new Map();
    const stopKey = e => { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === "keydown" && !e.repeat) { try { window.__nbAdd && window.__nbAdd("key", (e.shiftKey && e.key && e.key.length > 1 ? "Shift+" : "") + e.key); } catch (x) {} } };
    const sheetUp = () => [...document.querySelectorAll(".editor, .browser")].some(x => !x.hidden && x.getClientRects().length);
    const soundsOpen = () => !pick.hidden && !!pick.querySelector(".lp-tiles");
    let arpK = null;
    function padKey(code, i) {
      const p = lvPads()[i]; if (!p || !p.down) return;
      start(); try { p.down(BPS.full ? 127 : 112); } catch (x) {}
      kHeld.set(code, { p, i }); if (lvPadEls[i]) lvPadEls[i].classList.add("hit");
    }
    const kUp = code => { const h = kHeld.get(code); if (!h) return false; kHeld.delete(code); if (lvPadEls[h.i]) lvPadEls[h.i].classList.remove("hit"); if (h.p.up) { try { h.p.up(); } catch (x) {} } return true; };
    // the Sounds panel by keys: arrows move between the tiles (up and down to the nearest one in the next row)
    let focusId = null;
    function navSounds(e) {
      const T = [...pick.querySelectorAll(".lp-tile .lp-tm")]; if (!T.length) return false;
      const i = T.indexOf(document.activeElement), k = e.key;
      const go = j => { const t = T[Math.max(0, Math.min(T.length - 1, j))]; t.focus(); t.scrollIntoView({ block: "nearest" }); focusId = t.parentElement.dataset.id; };
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
        if (i < 0) { const c = pick.querySelector(".lp-tile.cur .lp-tm"); go(c ? T.indexOf(c) : 0); return true; }
        if (k === "ArrowLeft" || k === "ArrowRight") { go(i + (k === "ArrowLeft" ? -1 : 1)); return true; }
        const R = T.map(t => t.getBoundingClientRect()), tops = [...new Set(R.map(r => Math.round(r.top)))].sort((a, b) => a - b);
        const row = tops.indexOf(Math.round(R[i].top)), want = tops[row + (k === "ArrowUp" ? -1 : 1)];
        if (want == null) return true;
        const cx = R[i].left + R[i].width / 2; let best = i, bd = 1e9;
        R.forEach((r, j) => { if (Math.round(r.top) !== want) return; const dd = Math.abs(r.left + r.width / 2 - cx); if (dd < bd) { bd = dd; best = j; } });
        go(best); return true;
      }
      if (k === "Enter" && !e.shiftKey && i >= 0) { focusId = T[i].parentElement.dataset.id; return false; }   // (the button plays it alone)
      if ((k === "Enter" && e.shiftKey) || k === "+") { const p = i >= 0 ? T[i].parentElement.querySelector(".lp-tp") : null; if (p) { focusId = T[i].parentElement.dataset.id; p.click(); } return true; }
      return false;
    }
    // (the panel redraws after a pick: the keys keep their place)
    { const os = openSounds; openSounds = function () { const keep = focusId, r = os.apply(this, arguments);   // (opening closes what was open first)
        focusId = keep;
        if (keep) { const t = [...pick.querySelectorAll(".lp-tile")].find(x => x.dataset.id === keep); if (t) t.querySelector(".lp-tm").focus(); }
        return r; }; }
    { const cp = closePick; closePick = function () { focusId = null; return cp.apply(this, arguments); }; }
    window.addEventListener("keydown", e => {
      if (lv.hidden || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || sheetUp()) return;
      const code = e.code || "", key = e.key || "", low = key.length === 1 ? key.toLowerCase() : key, sh = e.shiftKey;
      if (soundsOpen() && navSounds(e)) { stopKey(e); return; }
      // pads: 1–8, and with Shift 9–16
      const d = /^(Digit|Numpad)([1-8])$/.exec(code);
      if (d) { stopKey(e); if (e.repeat || kHeld.has(code)) return; padKey(code, +d[2] - 1 + (sh && d[1] === "Digit" ? 8 : 0)); return; }
      if (code === "Space") { stopKey(e); if (!e.repeat) lvTransport(); return; }
      if (key === "?") { stopKey(e); if (!e.repeat) { if (!pick.hidden && pick.querySelector(".lk")) closePick(); else openKeys(); } return; }
      if (code === "ArrowLeft" || code === "ArrowRight") {
        if (e.target && e.target.closest && e.target.closest("[role=slider]")) return;
        stopKey(e); if (!e.repeat) $id(code === "ArrowLeft" ? "lvPrev" : "lvNext").click(); return; }
      if (code === "Minus" || code === "NumpadSubtract" || code === "Equal" || code === "NumpadAdd") {
        stopKey(e); const up = code === "Equal" || code === "NumpadAdd"; for (let n = sh ? 5 : 1; n > 0; n--) tap(up ? "bpmUp" : "bpmDown"); lvPaintTop(); mlHud("Tempo", Math.round(rcBpm()) + " bpm", null); return; }
      if (/^Key[A-Z]$/.test(code) || ["Semicolon", "Quote", "Comma", "Period", "Slash", "BracketLeft", "BracketRight", "Digit9", "Digit0"].includes(code)) {
        stopKey(e);   // (in Live the letters are controls: the MiniLab plays the notes)
        if (e.repeat) return;
        if (low === "h") { $id("lvHold").click(); return; }
        if (low === "a") {
          const was = arpLive(), t = setTimeout(() => { if (arpK) { arpK.mom = true; $id("lvArp").classList.add("mom"); if (!was) arpSet(true); } }, 280);
          arpK = { code, was, mom: false, t }; return; }
        if (low === "z" || low === "x") { const o = Math.max(1, Math.min(4, arpOctNow() + (low === "x" ? 1 : -1))); arpOct(o); return; }
        if (low === "s") { if (soundsOpen()) closePick(); else { start(); openSounds(); setTimeout(() => { const t = pick.querySelector(".lp-tile.cur .lp-tm") || pick.querySelector(".lp-tile .lp-tm"); if (t) t.focus(); }, 30); } return; }
        if (low === "k") { setKPage(step(KPAGES, LV.kpage, sh ? -1 : 1)); mlHud("Knobs", kpName(LV.kpage) + " page", null); return; }
        if (low === "p") { setPset(step(PSETS, LV.pset, sh ? -1 : 1)); mlHud("Pads", psetName(LV.pset), null); return; }
        if (low === "c") { $id("lvCap").click(); return; }
        if (low === "l") { if (LV.play === "bp") lvRec(); else mlHud("● Loop", "records into Beat Pads: set ▶ to Pads · R records everything you hear", null); return; }
        if (low === "r") { recToggle(); return; }
        if (low === "f") { $id("lvFx").click(); return; }
        if (low === "g") { const b = $id("lvLog"); if (b) b.click(); return; }
        if (low === "e") { const b = $id("lvSample"); if (b) b.click(); return; }
        if (low === "j" || low === "b" || "yuio".includes(low)) { if (window.__live12) __live12.jlKey(low); return; }   // (147: Jam)
        if (low === "n") { const b = $id(sh ? "lvSongPrev" : "lvSongNext"); if (b && !b.disabled) b.click(); else mlHud("Set list", "save a song first (tap the set list box)", null); return; }
        return;
      }
    }, true);
    window.addEventListener("keyup", e => {
      if (kUp(e.code)) { stopKey(e); return; }
      if (arpK && e.code === arpK.code) {
        const a = arpK; arpK = null; clearTimeout(a.t); $id("lvArp").classList.remove("mom"); stopKey(e);
        if (a.mom) { if (!a.was) arpSet(false); } else { arpSet(!a.was); arpSay(!a.was); }
        return;
      }
      if (!lv.hidden && e.code === "Space" && !typing(e.target)) stopKey(e);   // (a focused button would click too)
    }, true);
    window.addEventListener("blur", () => { [...kHeld.keys()].forEach(kUp); if (arpK) { const a = arpK; arpK = null; clearTimeout(a.t); $id("lvArp").classList.remove("mom"); if (a.mom && !a.was) arpSet(false); } });
    new MutationObserver(() => { if (!lv.hidden) paintCaps(); }).observe(lv, { attributes: true, attributeFilter: ["hidden"] });
    paintCaps(); paintShift();
    window.__live4 = { shiftSet, lvSPage, lvKP, browse, brGo, openKeys, paintCaps, capsOn, kbRecent, SFDEF, L4 };
