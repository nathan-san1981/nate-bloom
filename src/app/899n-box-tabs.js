//@site-only
  // ======================================================================
  // (box) Play in tabs on the 5" panel. At the panel's zoom (2: a 640 x 360 page) one screen can't hold everything at
  // a size a finger can hit, so Play becomes five screens with big tabs along the bottom, the MiniLab's controls on
  // each laid out as on the MiniLab:
  //   Sound  the sound on the knobs, big, with ‹ ›, and the stack of layers with + Layer
  //   Knobs  the eight knobs (K1–K8) and their page (Sound, FX, FX Lab, Mix, Mine)
  //   Pads   the eight pads (5–8 above 1–4) and their set (Beat Pads banks, notes, chords…), 9–16, Kit
  //   Arp    Hold and Arp, big; the arp's octaves and its settings; octave − / + and scale lock for the keys
  //   Mix    the four faders (F1–F4); the beat (what ▶ plays, ▶, Rec, tap tempo), FX, Jam
  // Changing tab never touches the sound: layers, Hold and the arp keep going until Hold is pressed again or ■ Stop is
  // held (a short tap on Stop only says to hold it, so a stray tap can't end a jam). The top bar always shows the
  // sound, HOLD and ARP lamps, Home and Box…. The MiniLab's pads always play the Pads screen's set, and moving a knob
  // or fader shows a big readout over whichever tab is up. The TV (and any screen wider than 720 points) keeps the
  // one-screen Play. The last tab is remembered.
  // ======================================================================
  {
    const BOX = window.__box;
    if (BOX && BOX.on) {
      const TABS = [["sound", "Sound", "layers"], ["knobs", "Knobs", "K1–K8"], ["pads", "Pads", "P1–P8"], ["arp", "Arp", "hold"], ["mix", "Mix", "F1–F4 · beat"]];
      const TB = { built: false, tab: "sound", stopT: 0 };
      try { const t = localStorage.getItem("nb-box-tab"); if (TABS.some(x => x[0] === t)) TB.tab = t; } catch (e) {}
      const small = () => window.innerWidth <= 720;
      const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
      const say = (a, b) => { try { mlHud(a, b || "", null); } catch (e) {} };
      function setTab(t) {
        TB.tab = t; try { localStorage.setItem("nb-box-tab", t); } catch (e) {}
        const pv = $id("playView"); if (!pv) return;
        TABS.forEach(([k]) => pv.classList.toggle("tab-" + k, k === t));
        pv.querySelectorAll(".tb-tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === t)));
        paint();
      }
      function build() {
        const pv = $id("playView"); if (!pv || TB.built) return !!pv;
        const body = pv.querySelector(".pl-body"), mid = $id("plMid"), top = pv.querySelector(".pl-top"); if (!body || !mid || !top) return false;
        TB.built = true;
        // the two header rows in the middle: the knob page and the pad set
        const hs = mid.querySelectorAll(":scope > .pl-h"); if (hs[0]) hs[0].classList.add("tb-hpage"); if (hs[1]) hs[1].classList.add("tb-hset");
        // Sound: the big picker
        const pick = mk("section", "tb-pick", `<button type="button" class="tb-arrow" id="tbPrev" aria-label="Previous sound">‹</button>
          <button type="button" class="tb-sname" id="tbName" title="All the sounds"><small id="tbCat">Sound</small><b></b><small id="tbSub"></small></button>
          <button type="button" class="tb-arrow" id="tbNext" aria-label="Next sound">›</button>`);
        body.prepend(pick);
        $id("tbPrev").addEventListener("click", () => { const b = $id("lvPrev"); if (b) b.click(); setTimeout(paint, 120); });
        $id("tbNext").addEventListener("click", () => { const b = $id("lvNext"); if (b) b.click(); setTimeout(paint, 120); });
        $id("tbName").addEventListener("click", () => { const b = $id("plPick"); if (b) b.click(); });
        // Arp: Hold and Arp big, then the arp's octaves, its settings, and the keys' octave and scale
        const arp = mk("section", "tb-arp", `<div class="tb-bigs"></div><div class="tb-opts">
            <div class="tb-opt"><span>Arp octaves</span><div class="tb-seg" id="tbOct">${[1, 2, 3, 4].map(n => `<button type="button" data-o="${n}">${n}</button>`).join("")}</div></div>
            <div class="tb-opt"><span>Keys</span><div class="tb-seg tb-keys"></div></div>
            <button type="button" class="tb-more" id="tbArpMore">Arp speed &amp; pattern…</button></div>`);
        body.appendChild(arp);
        const bigs = arp.querySelector(".tb-bigs");
        [["plHold", "keeps playing until you tap again · MiniLab Hold"], ["plArp", "or press the big knob twice"]].forEach(([id, sub]) => { const b = $id(id); if (!b) return; b.classList.add("tb-big"); if (!b.querySelector("small")) b.insertAdjacentHTML("beforeend", "<small>" + sub + "</small>"); bigs.appendChild(b); });
        const keys = arp.querySelector(".tb-keys"); ["plOctD", "plOctU", "plScale"].forEach(id => { const b = $id(id); if (b) keys.appendChild(b); });
        $id("tbOct").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const o = $id("lvArpOct") && $id("lvArpOct").querySelector('button[data-o="' + b.dataset.o + '"]'); if (o) o.click(); setTimeout(paint, 80); }));
        $id("tbArpMore").addEventListener("click", () => { const b = $id("lvArpMore"); if (b) b.click(); });
        // Mix: the transport and FX beside the faders
        const mix = mk("section", "tb-mix", "");
        const tr = pv.querySelector(".pl-tr"); if (tr) mix.appendChild(tr);
        const more = mk("div", "tb-mixmore", ""); ["plFx", "plJam"].forEach(id => { const b = $id(id); if (b) more.appendChild(b); }); mix.appendChild(more);
        body.appendChild(mix);
        // top bar: HOLD / ARP lamps and a Stop you hold
        const lamps = mk("div", "tb-lamps", `<span class="tb-lamp h" id="tbLampH">HOLD</span><span class="tb-lamp a" id="tbLampA">ARP</span>`);
        const snd = $id("plSnd"); if (snd) snd.after(lamps); else top.appendChild(lamps);
        const stop = mk("button", "btn tb-stop", "■ Stop"); stop.type = "button"; stop.id = "tbStop"; stop.title = "Hold to stop everything (layers, Hold, the arp, the beat)";
        stop.addEventListener("pointerdown", () => { clearTimeout(TB.stopT); stop.classList.add("holding"); TB.stopT = setTimeout(() => { TB.stopT = 0; stop.classList.remove("holding"); const s = $id("plStop"); if (s) s.click(); try { if (state.hold) { const h = $id("plHold"); if (h) h.click(); } } catch (e) {} say("Stopped", "everything let go"); paint(); }, 600); });
        ["pointerup", "pointercancel", "pointerleave"].forEach(n => stop.addEventListener(n, () => { if (TB.stopT) { clearTimeout(TB.stopT); TB.stopT = 0; stop.classList.remove("holding"); say("■ Stop", "hold it to stop everything"); } }));
        top.appendChild(stop);
        // the tabs
        const nav = mk("nav", "tb-tabs", TABS.map(([k, n, s]) => `<button type="button" class="tb-tab" role="tab" data-t="${k}">${n}<small>${s}</small></button>`).join(""));
        nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "Play screens");
        nav.querySelectorAll(".tb-tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.t)));
        pv.appendChild(nav);
        setTab(TB.tab);
        return true;
      }
      function paint() {
        if (!TB.built) return;
        const on = id => { const b = $id(id); return !!b && b.getAttribute("aria-pressed") === "true"; };
        let sus = false; try { sus = !!SUS.on; } catch (e) {}
        $id("tbLampH").classList.toggle("on", on("plHold") || sus); $id("tbLampA").classList.toggle("on", on("plArp"));
        const s = $id("lvSnd"), nb = $id("tbName");
        if (s && nb) { const b = s.querySelector("b"), sm = s.querySelector("small"); nbT(nb.querySelector("b"), b ? b.textContent : ""); nbT($id("tbSub"), ((sm && sm.textContent) || "").replace(/\s*·\s*tap.*$/i, "") || "big knob turns this"); }
        let n = 0; try { n = window.__stk.items().length; } catch (e) {}
        nbT($id("tbCat"), n > 1 ? n + " sounds layered · this one on the knobs" : "Sound · big knob turns it");
        const oc = $id("lvArpOct"); if (oc) $id("tbOct").querySelectorAll("button").forEach(b => { const o = oc.querySelector('button[data-o="' + b.dataset.o + '"]'); b.setAttribute("aria-pressed", String(!!o && o.getAttribute("aria-pressed") === "true")); });
      }
      function apply() {
        const want = small();
        if (!want && TB.built) { location.reload(); return; }   // (a TV plugged in while Play is in tabs: the one-screen Play again, freshly laid out)
        document.documentElement.classList.toggle("nb-tabs", want);
        if (want && document.body.classList.contains("play-on")) { build(); paint(); }
      }
      window.addEventListener("resize", () => setTimeout(apply, 50));
      setInterval(apply, 400);
      window.__boxTabs = { setTab, TB };
    }
  }
//@end
