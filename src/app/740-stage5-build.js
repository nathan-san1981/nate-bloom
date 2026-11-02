    // ======================================================================
    // 161, stage 5 (part one): Build. The seven screens of today become the tabs of one workspace under the strip:
    // Sounds (the synth editor, FX, My sounds, Motion, plugins), Beats (Beat Pads, kits; the drum machine beside it),
    // Rhythm (the Rhythm Creator), Samples (the sampler and recordings), Songs (Song mode, melodies, the set list),
    // Tracks (the Garage and the multitrack editor), DJ. One transport on the bar (▶ ■ ● tempo undo) that plays what
    // the tab is; one browser (Play's Sounds panel, as a drawer from the left); one mixer (the Mixer, as a drawer from
    // the bottom). The old header, its mode buttons, the tool row and the ☰ menu are parked out of sight: every
    // button still exists for the code that uses it, but the strip and Build are the way in. The new shell is on
    // for good: the ?shell=old hatch of 161 went in 166, and the parked chrome is reached only through the test
    // suite's storage hook, nb-shell=old (660).
    // ======================================================================
    const BD = { tab: "sounds", el: null, obs: null, tick: 0 };
    try { const t = localStorage.getItem("nb-build-tab"); if (t) BD.tab = t; } catch (e) {}
    const BD_TABS = [["sounds", "Sounds", "the synth editor, FX, My sounds, Motion, plugins"], ["beats", "Beats", "Beat Pads and kits; the drum machine beside it"], ["rhythm", "Rhythm", "the Rhythm Creator"], ["samples", "Samples", "the sampler and recordings"], ["songs", "Songs", "Song mode, melodies, the set list"], ["tracks", "Tracks", "the Garage and the multitrack editor"], ["dj", "DJ", "two decks, key lock, the mix planner"]];
    const BD_VIEWS = [["bpView", "bpDone"], ["rcView", "rcDone"], ["gbView", "gbDone"], ["djView", "djDone"], ["tracks", "trkDone"], ["song", "songDone"], ["melodies", "mlCancel"]];
    const vis = id => { const el = $id(id); return !!(el && !el.hidden); };
    function bdCloseViews(keep) { BD_VIEWS.forEach(([v, d]) => { if (v !== keep && vis(v)) { const b = $id(d); if (b) b.click(); else $id(v).hidden = true; } }); }
    function bdTabNow() {   // what's on screen decides, so a screen opened some other way lights its tab
      if (vis("bpView")) return "beats"; if (vis("rcView")) return "rhythm"; if (vis("gbView") || vis("tracks")) return "tracks"; if (vis("djView")) return "dj"; if (vis("song") || vis("melodies")) return "songs";
      const m = $id("modes") && $id("modes").querySelector('.btn.mode[data-mode][aria-pressed="true"]'); const mode = m ? m.dataset.mode : "synths";
      return mode === "samples" ? "samples" : mode === "drums" ? "beats" : "sounds";
    }
    function bdGo(tab, sub) {
      start(); BD.tab = tab; try { localStorage.setItem("nb-build-tab", tab); } catch (e) {}
      if (suOpenNow()) suClose(false); if (!lv.hidden) lvClose();
      if (tab === "sounds") { bdCloseViews(); tap("mSynths"); }
      else if (tab === "samples") { bdCloseViews(); tap("mSamples"); }
      else if (tab === "beats") { if (sub === "machine") { bdCloseViews(); tap("mDrums"); } else { bdCloseViews("bpView"); if (!vis("bpView")) tap("bpBtn"); } }
      else if (tab === "rhythm") { bdCloseViews("rcView"); if (!vis("rcView")) tap("rcBtn"); }
      else if (tab === "tracks") { if (sub === "editor") { bdCloseViews("tracks"); if (!vis("tracks")) tap("betaTracksBtn"); } else { bdCloseViews("gbView"); if (!vis("gbView")) tap("gbBtn"); } }
      else if (tab === "dj") { bdCloseViews("djView"); if (!vis("djView")) tap("djBtn"); }
      else if (tab === "songs") { if (sub === "melodies") { bdCloseViews("melodies"); if (!vis("melodies")) tap("mlOpenNotes"); } else { bdCloseViews("song"); if (!vis("song")) tap("songBtn"); } }
      add139("build", tab + (sub ? " · " + sub : "")); bdPaint();
    }
    // ---- the transport: what ▶ plays follows the tab ----
    const bdPlayWhat = () => { const t = bdTabNow(); return t === "beats" && vis("bpView") ? "bp" : t === "rhythm" ? "rc" : t === "tracks" && vis("gbView") ? "gb" : t === "dj" ? "dj" : "seq"; };
    function bdPlay() {
      start(); const w = bdPlayWhat();
      if (w === "bp") { tap("bpPlay"); return; }
      if (w === "rc") { tap("rcPlay"); return; }
      if (w === "gb") { tap("gbPlay"); return; }
      if (w === "dj") { tap("djBothPlay"); return; }
      tap("play");
    }
    function bdPlaying() { const w = bdPlayWhat(); return w === "bp" ? !!BP.playing : w === "rc" ? !!RC.playing : w === "gb" ? !!(window.__gb && __gb.TP && __gb.TP.on) : w === "dj" ? nbsTry(() => $id("djStop") && !$id("djStop").disabled && $id("djBothPlay").getAttribute("aria-pressed") === "true", false) : !!playing; }
    // ---- the bar ----
    function bdBuild() {
      if (BD.el) return BD.el;
      const el = document.createElement("div"); el.id = "buildBar"; el.hidden = true;
      el.innerHTML = `<div class="bd-tabs" role="tablist" aria-label="Build">${BD_TABS.map(([id, nm, sub]) => `<button type="button" role="tab" class="bd-tab" data-t="${id}" title="${sub}">${nm}</button>`).join("")}</div>
        <div class="bd-sub" id="bdSub"></div>
        <div class="bd-right"><button type="button" class="btn" id="bdSnd" title="Every sound, to play alone or layer (the browser)">Sounds…</button><button type="button" class="btn" id="bdMix" title="The mixer, as a drawer">Mixer</button>
          <span class="bd-tr"><button type="button" class="btn bd-play" id="bdPlay" title="Play what this tab is (Space in Live)">▶</button><button type="button" class="btn bd-stop" id="bdStop" title="Stop everything">■</button><button type="button" class="btn bd-rec" id="bdRec" title="Record what you play">●</button>
          <button type="button" class="btn bd-bpm" id="bdBpmDn" title="Slower">−</button><b id="bdBpm">—</b><button type="button" class="btn bd-bpm" id="bdBpmUp" title="Faster">+</button><button type="button" class="btn" id="bdUndo" title="Undo the last change">↶</button></span></div>`;
      document.body.appendChild(el); BD.el = el;
      el.querySelectorAll(".bd-tab").forEach(b => b.addEventListener("click", () => bdGo(b.dataset.t)));
      $id("bdSnd").addEventListener("click", () => { start(); if (pick.hidden) openSounds(); else closePick(); bdPaint(); });
      $id("bdMix").addEventListener("click", () => { start(); const m = $id("mixer"); if (m.hidden) tap("mixBtn"); else tap("mxDone"); bdPaint(); });   // the bar follows at once, not at the next tick
      $id("bdPlay").addEventListener("click", bdPlay);
      $id("bdStop").addEventListener("click", () => tap("stopAll"));
      $id("bdRec").addEventListener("click", () => tap("takeBtn"));
      $id("bdBpmDn").addEventListener("click", () => tap("bpmDown")); $id("bdBpmUp").addEventListener("click", () => tap("bpmUp"));
      $id("bdUndo").addEventListener("click", () => tap("hisUndoP"));
      $id("bdSub").addEventListener("click", e => { const b = e.target.closest("button[data-sub]"); if (b) bdGo(BD.tab, b.dataset.sub === "main" ? "" : b.dataset.sub); });
      return el;
    }
    const BD_SUBS = { beats: [["main", "Beat Pads", () => vis("bpView")], ["machine", "Drum machine", () => !vis("bpView") && bdTabNow() === "beats"]], tracks: [["main", "Garage", () => vis("gbView")], ["editor", "Tracks", () => vis("tracks")]], songs: [["main", "Song", () => vis("song")], ["melodies", "Melodies", () => vis("melodies")]] };
    function bdPaint() {
      if (!BD.el) return;
      const on = SH.on && shSpaceNow() === "build" && $id("start").hidden;
      BD.el.hidden = !on; document.body.classList.toggle("build-on", on);
      if (!on) return;
      const now = bdTabNow(); if (now !== BD.tab) BD.tab = now;
      BD.el.querySelectorAll(".bd-tab").forEach(b => nbA(b, "aria-selected", String(b.dataset.t === BD.tab)));
      const subs = BD_SUBS[BD.tab] || []; const html = subs.map(([id, nm, isOn]) => `<button type="button" class="bd-subtab" data-sub="${id}" aria-pressed="${isOn() ? "true" : "false"}">${nm}</button>`).join("");
      const sb = $id("bdSub"); if (sb.__html !== html) { sb.__html = html; sb.innerHTML = html; }
      nbA($id("bdPlay"), "aria-pressed", String(bdPlaying())); nbT($id("bdPlay"), bdPlaying() ? "■" : "▶");
      nbT($id("bdBpm"), nbsTry(() => Math.round(rcBpm()) + "", "—"));
      nbA($id("bdSnd"), "aria-pressed", String(!pick.hidden && lv.hidden)); nbA($id("bdMix"), "aria-pressed", String(vis("mixer")));
      const u = $id("hisUndoP"); $id("bdUndo").disabled = !u || u.disabled;
      // (170: the ● and its recording time are painted by 790)
    }
    // the browser as a drawer from Build (Play's Sounds panel parked, as Play does it)
    function bdPickObserve() {
      if (BD.obs) return;
      BD.obs = new MutationObserver(() => {
        const mine = !pick.hidden && lv.hidden && document.body.classList.contains("build-on");
        if (mine) pick.classList.add("standalone", "drawer", "bd-drawer"); else if (pick.classList.contains("bd-drawer")) pick.classList.remove("standalone", "drawer", "bd-drawer");
        bdPaint(); });
      BD.obs.observe(pick, { attributes: true, attributeFilter: ["hidden"] });
    }
    // ---- the strip owns the space; Build is what's under it when neither Play nor Set up is open ----
    { const sp = shPaint; shPaint = function () { const r = sp.apply(this, arguments); try { bdPaint(); } catch (e) {} return r; }; }
    { const ss = shellSet; shellSet = function (on) { const r = ss.apply(this, arguments); bdBuild(); bdPickObserve(); if (on && !BD.tick) BD.tick = setInterval(() => { if (!document.hidden) bdPaint(); }, 700); if (!on && BD.tick) { clearInterval(BD.tick); BD.tick = 0; } bdPaint(); return r; }; }
    { const g = shGo; shGo = function (sp) { const r = g.apply(this, arguments); if (sp === "build") bdPaint(); return r; }; }
    window.__live27 = { BD, BD_TABS, bdGo, bdTabNow, bdPlayWhat, bdPaint, bdCloseViews };
