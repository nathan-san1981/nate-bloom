//@site-only
  // ======================================================================
  // (box) The MiniLab on the box's Play: layers, the arp and hold without touching the screen. On the box the big knob
  // is the way to play more than one sound, so its click and Shift + click change jobs (899j's ★ Favorite and
  // Sample stay on the screen: the sound picker's star and Sample in the pad bar):
  //   turn            the sound on the knobs, as before
  //   click           Layer: the next sound you turn to is added on top of what's playing (click again: cancel)
  //   Shift + turn    the knob pages (Sound, FX, FX Lab, Mix, Mine), as before
  //   Shift + click   Arp on / off
  //   Hold (button)   Play's Hold: notes and arps keep going until Hold is pressed again (not just a sustain pedal)
  // A line under the stack says so, and Sounds… reads "+ Layer". Off the box nothing changes.
  // ======================================================================
  {
    const BXL = { armed: false, list: null, i: 0, t: 0, hwHold: false };
    const boxOn = () => !!(window.__box && window.__box.on);
    const playOpen = () => document.body.classList.contains("play-on");
    const flash = (a, b) => { try { const P = window.__pk; if (P && P.flashOn) P.flashOn(a, b); } catch (e) {} mlHud(a, b || "", null); };
    function layerList() {
      const all = allEntries().filter(x => x.cat !== "kits" && !/^e:(samp|pads|drum)$/.test(x.id));
      let cat = state.cur && state.cur.cat; if (!cat || cat === "kits" || (cat === "fav" && !favs.length)) cat = "engines";
      const list = cat === "fav" ? all.filter(x => favs.includes(x.id)) : all.filter(x => x.cat === cat);
      let i = list.findIndex(x => state.cur && x.id === state.cur.id); if (i < 0) i = list.findIndex(x => x.id === "e:" + state.engine);
      return { list, i: Math.max(0, i) };
    }
    function layerArm(on) {
      BXL.armed = on; BXL.list = null; clearTimeout(BXL.t);
      document.body.classList.toggle("bx-layering", on);
      if (on) flash("+ Layer", "turn the big knob to pick a sound to add on top · click again to cancel");
      else mlHud("Layer", "cancelled", null);
      paintHint(); ML.lay = null; try { mlRefresh(true); } catch (e) {}
    }
    function layerTurn(d) {
      if (!BXL.list) { const r = layerList(); if (!r.list.length) return; BXL.list = r.list; BXL.i = r.i; }
      BXL.i = (BXL.i + d + BXL.list.length) % BXL.list.length;
      const e = BXL.list[BXL.i];
      flash("+ " + e.name, (BXL.i + 1) + " of " + BXL.list.length + " · added when you stop turning");
      clearTimeout(BXL.t); BXL.t = setTimeout(layerGo, 700);
    }
    async function layerGo() {
      const e = BXL.list && BXL.list[BXL.i]; BXL.armed = false; BXL.list = null; document.body.classList.remove("bx-layering"); paintHint();
      if (!e) return;
      start();
      let ok = false; try { ok = await window.__stk.together(e); } catch (x) {}
      if (ok !== false) { const n = (() => { try { return window.__stk.items().length; } catch (x) { return 0; } })(); flash("Layered: " + e.name, n > 1 ? n + " sounds play together · ✕ on a card takes one out" : ""); }
      setTimeout(() => { ML.lay = null; try { mlRefresh(true); } catch (x) {} try { lvPaintTop(); lvPaintKnobs(); paintCards(true); } catch (x) {} }, 120);
    }
    function arpToggle() { if (window.__arpTap) window.__arpTap(); }
    { const l0 = L.live; L.live = function () {
        const o = l0.apply(this, arguments);
        if (!boxOn()) return o;
        const M = o.M || {}, turn = M.turn;
        o.M = {
          turn: BXL.armed ? ["+ Layer: pick the sound to add", d => layerTurn(d)] : turn,
          click: [BXL.armed ? "Cancel the layer" : "+ Layer a sound (then turn)", () => layerArm(!BXL.armed)],
          sturn: M.sturn,
          sclick: ["Arp on / off", arpToggle],
        };
        return o;
      }; }
    // the MiniLab's Hold button (sustain, CC 64) is Play's Hold on the box: an arp keeps going too
    { const ns0 = nbSustain; nbSustain = function (on) {
        if (!boxOn() || !playOpen()) return ns0.apply(this, arguments);
        const hb = $id("plHold") || $id("lvHold"); if (!hb) return ns0.apply(this, arguments);
        if (on && !state.hold) { BXL.hwHold = true; hb.click(); }
        else if (!on && BXL.hwHold) { BXL.hwHold = false; if (state.hold) hb.click(); }
      }; }
    // a line under the stack: what the MiniLab's big knob and Hold do here; Sounds… is "+ Layer"
    function paintHint() {
      const st = document.querySelector("#playView .pl-stack"); if (!st) return;
      let h = $id("bxMlHint");
      if (!h) { h = document.createElement("div"); h.id = "bxMlHint"; h.className = "bx-mlhint"; st.appendChild(h); }
      const html = BXL.armed ? "<b>Turn the big knob</b> to pick a sound to add on top. <b>Click</b> to cancel."
        : "MiniLab big knob: <b>turn</b> sound · <b>click</b> + layer · <b>Shift+click</b> arp · <b>Hold</b> holds";
      if (h.innerHTML !== html) h.innerHTML = html;
      const pk = $id("plPick"); if (pk && pk.textContent !== "+ Layer") { pk.textContent = "+ Layer"; pk.title = "Add a sound on top of what's playing (or swap it)"; }
    }
    if (boxOn()) setInterval(() => { if (playOpen()) paintHint(); }, 1000);
  }
//@end
