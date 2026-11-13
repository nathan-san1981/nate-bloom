  // ======================================================================
  // The big knob in Play (and Live, underneath it), on the box and everywhere else: turning it picks the sound, the
  // MiniLab's own way (Arturia's software and every hardware synth browse presets with the main encoder). Shift + turn
  // flips the knob pages (Sound, FX, FX Lab, Mix, Mine), the rarer move. A click stars the sound playing (★ Favorites,
  // the list ‹ › and the turn walk when you're in it). Shift + click samples: the last two bars you heard land on a pad
  // of the Samples set (Live's Sample, 143). ▶ / ■ and ● Rec are on the screen (and the space bar). While you turn, the
  // sound's name shows large in the middle for a moment, readable from standing height. Play also gets Sample in its
  // pad bar (Live's Sample menu: grab 1, 2, 4 or 8 bars, or record the K.O. II or a mic).
  // Every other screen's big knob keeps its own job.
  // ======================================================================
  {
    const PK = window.__pk = { flashT: 0, el: null };
    PK.flashOn = (a, b) => pkFlash(a, b);   // (899m: the box MiniLab layer flashes the same way)
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
      if (b(d) === true) return;   // (the box's fifteen show their own name)
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
    function pkSample() {
      const L9 = window.__live9; if (!L9 || !L9.grabBars) { mlHud("Sample", "not here", null); return; }
      pkFlash("Sampling…", "the last 2 bars, onto a pad"); L9.grabBars(2);
    }
    { const l0 = L.live; L.live = function () {
        const o = l0.apply(this, arguments), M = o.M || {};
        o.M = { turn: ["Sound (plays the one you stop on)", d => pkTurn(d)], sturn: M.turn || ["Knob page", () => {}], click: ["★ Favorite (the sound playing)", pkFav], sclick: ["Sample the last 2 bars", pkSample] };
        return o;
      }; }
    HINT.live = "pads: the set on screen · knobs and faders: as on screen, hold Shift for the Shift layer · big knob: sounds (click: ★ favorite), with Shift: knob pages (click: sample the last 2 bars)";
    // Sample in Play's pad bar: Live's own Sample button (its menu: grab 1, 2, 4 or 8 bars, or record the K.O. II / a mic)
    function pkSampleBtn() {
      const kit = $id("plKit"); if (!kit || $id("plSample")) return;
      const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = "plSample"; b.textContent = "Sample"; b.title = "Sample: grab what you just heard, or record the K.O. II or a mic, onto a pad (Shift + click the big knob: the last 2 bars)";
      b.addEventListener("click", () => { const s = $id("lvSample"); if (s) s.click(); });
      kit.before(b);
    }
    { const po = window.__live21 && window.__live21.plOpen; if (po) { const L21 = window.__live21; L21.plOpen = function () { const r = po.apply(this, arguments); try { pkSampleBtn(); } catch (e) {} return r; }; } }
    setInterval(() => { if (document.body.classList.contains("play-on") && !$id("plSample")) pkSampleBtn(); }, 500);   // (Play is built the first time it opens, from several places)
    ML.lay = null;
  }
