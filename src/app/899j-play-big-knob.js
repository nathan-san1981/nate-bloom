  // ======================================================================
  // The big knob in Play (and Live, underneath it), on the box and everywhere else: turning it picks the sound, the
  // MiniLab's own way (Arturia's software and every hardware synth browse presets with the main encoder). Shift + turn
  // flips the knob pages (Sound, FX, FX Lab, Mix, Mine), the rarer move. A click stars the sound playing (★ Favorites,
  // the list ‹ › and the turn walk when you're in it); Shift + click stays ● Rec. ▶ / ■ is on the screen and the space
  // bar. While you turn, the sound's name shows large in the middle for a moment, readable from standing height.
  // Every other screen's big knob keeps its own job.
  // ======================================================================
  {
    const PK = window.__pk = { flashT: 0, el: null };
    const L4 = () => window.__live4 || {};
    function pkFlash(name, sub) {
      if (!name) return;
      let el = PK.el;
      if (!el) { el = document.createElement("div"); el.className = "pk-flash"; el.setAttribute("aria-hidden", "true"); el.innerHTML = "<b></b><small></small>"; document.body.appendChild(el); PK.el = el; }
      el.querySelector("b").textContent = name; el.querySelector("small").textContent = sub || "";
      el.classList.add("on"); clearTimeout(PK.flashT); PK.flashT = setTimeout(() => el.classList.remove("on"), 1300);
    }
    function pkTurn(d) {
      const b = L4().browse; if (!b) return;
      b(d);
      const s = document.getElementById("lvSnd");
      pkFlash(s && s.querySelector("b") ? s.querySelector("b").textContent : "", s && s.querySelector("small") ? s.querySelector("small").textContent.replace(/\s*·\s*plays when you stop.*/, "") : "");
    }
    function pkFav() {
      try { if (L4().brGo) L4().brGo(); } catch (e) {}   // (a click while browsing: the sound you stopped on, chosen first)
      const cur = state.cur; if (!cur || !cur.id) { mlHud("★ Favorite", "no sound to star", null); return; }
      const on = !favs.includes(cur.id);
      favs = on ? [...favs, cur.id] : favs.filter(x => x !== cur.id); saveFavs();
      const name = cur.name || ($id("sndName") ? $id("sndName").textContent : "");
      mlHud(on ? "★ Favorite" : "☆ Not a favorite", name, null);
      pkFlash((on ? "★ " : "☆ ") + name, on ? "added to Favorites" : "taken out of Favorites");
      try { if (typeof renderBrowser === "function") renderBrowser(false); } catch (e) {}
    }
    { const l0 = L.live; L.live = function () {
        const o = l0.apply(this, arguments), M = o.M || {};
        o.M = { turn: ["Sound (plays the one you stop on)", d => pkTurn(d)], sturn: M.turn || ["Knob page", () => {}], click: ["★ Favorite (the sound playing)", pkFav], sclick: M.sclick || ["● Rec", () => {}] };
        return o;
      }; }
    HINT.live = "pads: the set on screen · knobs and faders: as on screen, hold Shift for the Shift layer · big knob: sounds (click: ★ favorite), with Shift: knob pages";
    ML.lay = null;
  }
