  // ======================================================================
  // Simpler (124): one top bar, the controls you use most nearer the keys
  // ======================================================================
  {
    const $ = id => document.getElementById(id);
    // ---- Keys · Seq · Notes in the top bar on wide screens ----
    const views = $("views"), toolRow = $("toolRow"), hright = document.querySelector("header .hright");
    const wideV = matchMedia("(min-width: 1100px)");
    const placeViews = () => { if (!views || !hright) return; if (wideV.matches) { if (views.parentElement !== hright) hright.prepend(views); } else if (views.parentElement !== toolRow) toolRow.appendChild(views); };
    placeViews(); try { wideV.addEventListener("change", placeViews); } catch (e) { wideV.addListener(placeViews); }
    { const u = $("hisUndoP"); if (u) u.title = "Undo the last change (Ctrl+Z). Redo is in ☰ → History"; }

    // ---- the Playing row (173: always, even for one sound or none: its speaker and ✕ are how it's muted or taken out) ----
    const stk = $("stk"), stkRow = $("stkRow");
    if (stk && stkRow) stk.classList.remove("solo");

    // ---- Effects · FX Lab: one tab ----
    const sws = [];
    [["fxRow", "fx"], ["labRow", "lab"]].forEach(([rid, cur]) => {
      const lab = document.querySelector("#" + rid + " .row-label"); if (!lab) return;
      const sw = document.createElement("div"); sw.className = "seg small fxsw"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Effects or FX Lab");
      sw.innerHTML = '<button data-p="fx">Effects</button><button data-p="lab">FX Lab</button>';
      sw.querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.p === cur)); b.addEventListener("click", () => { start(); setPanel(b.dataset.p); }); });
      lab.prepend(sw); sws.push(sw);
    });
    const paintSw = () => {
      const keys = state.mode === "keys";
      sws.forEach(sw => { const lb = sw.querySelector('[data-p="lab"]'); if (lb) lb.hidden = !keys; sw.hidden = !keys; });
      const pFx = $("pFx"); if (pFx) pFx.setAttribute("aria-pressed", String(state.panel === "fx" || state.panel === "lab"));
    };
    { const sp = setPanel; setPanel = function (which) { const r = sp.apply(this, arguments); try { paintSw(); } catch (e) {} return r; }; }
    { const sm = setMode; setMode = function (m) { const r = sm.apply(this, arguments); try { if (state.mode !== "keys" && state.panel === "lab") setPanel("fx"); paintSw(); } catch (e) {} return r; }; }
    paintSw();

    // ---- Motion: the Morph tab, with the LFOs and XY pad a tap away ----
    { const pM = $("pMorph"); if (pM) { pM.textContent = "Motion"; pM.title = "Morph between snapshots, Mutate and macros; the LFOs and XY pad"; } }
    { const rt = document.querySelector("#morphRow .rtools"), mb = $("moBtn");
      if (rt && mb) { const b = document.createElement("button"); b.className = "btn"; b.id = "moLfoBtn"; b.textContent = "LFOs · XY"; b.title = "Two LFOs, the XY pad and drift"; b.addEventListener("click", () => mb.click()); rt.prepend(b); } }

    // ---- Analog: a button next to Demo opens its bar ----
    { const rt = document.querySelector("#engineRow .row-label .rtools"), bar = $("anBar");
      if (rt && bar && typeof anPaint === "function") {
        const b = document.createElement("button"); b.className = "btn demo"; b.id = "sndMore"; b.setAttribute("aria-expanded", "false"); b.title = "Analog: modelled filters, drive and drift";
        b.addEventListener("click", () => { const o = bar.classList.toggle("open"); b.setAttribute("aria-expanded", String(o)); });
        const demo = rt.querySelector(".demo"); if (demo) demo.before(b); else rt.appendChild(b);
        const paint = () => { b.hidden = bar.hidden; b.textContent = "Analog " + (NBAN.on ? "On" : "Off") + (bar.classList.contains("open") ? " ▴" : " ▾"); b.classList.toggle("on", !!NBAN.on); };
        const ap = anPaint; anPaint = function () { const r = ap.apply(this, arguments); try { paint(); } catch (e) {} return r; };
        b.addEventListener("click", paint);
        paint();
      } }

    // ---- Chord · Scale · Blend: one button and a sheet ----
    { const cw = $("chordWrap"), chord = $("chord"), sb = $("scaleBtn"), bb = $("blendBtn"), row = $("blendRow"), sheet = $("playSheet"), body = $("psBody");
      if (cw && chord && sb && bb && row && sheet && body) {
        const chip = document.createElement("button"); chip.className = "btn playopts"; chip.id = "playOpts"; chip.setAttribute("aria-haspopup", "dialog");
        cw.before(chip);
        const sec = (title, sub) => { const d = document.createElement("div"); d.className = "ps-sec"; d.innerHTML = "<div class='ps-h'><b></b><small></small></div>"; d.querySelector("b").textContent = title; d.querySelector("small").textContent = sub; body.appendChild(d); return d; };
        const sC = sec("Chord", "Each key plays this chord"); sC.appendChild(cw);
        const sS = sec("Scale", "Lock the keys to a key, so nothing sounds wrong"); sS.appendChild(sb);
        const sB = sec("Blend", "Soften and overlap the notes you play"); ["blendBtn", "blendAmt", "blendVal"].forEach(id => { const e = $(id); if (e) sB.appendChild(e); });
        const label = () => {
          const naC = cw.hidden || cw.classList.contains("na"), naB = row.hidden;
          sC.hidden = naC; sS.hidden = naB || sb.hidden; sB.hidden = naB;
          chip.hidden = naC && naB;
          const parts = [];
          if (!naC) { const o = chord.options[chord.selectedIndex]; parts.push(o ? o.text : "Chord"); }
          if (!naB) { const t = sb.textContent.trim(); parts.push(/off/i.test(t) ? "Scale off" : t); if (bb.getAttribute("aria-pressed") === "true") parts.push("Blend"); }
          chip.textContent = parts.join(" · ") + " ▾";
          chip.title = "How the keys play: " + parts.join(", ");
        };
        chip.addEventListener("click", () => { start(); label(); sheet.hidden = false; });
        $("psDone").addEventListener("click", () => { sheet.hidden = true; });
        sheet.addEventListener("click", e => { if (e.target === sheet) sheet.hidden = true; });
        sb.addEventListener("click", () => { sheet.hidden = true; }, true);   // the Scale sheet opens in its place
        chord.addEventListener("change", label);
        const mo = new MutationObserver(label);
        mo.observe(sb, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden", "aria-pressed"] });
        mo.observe(bb, { attributes: true, attributeFilter: ["aria-pressed"] });
        mo.observe(cw, { attributes: true, attributeFilter: ["hidden", "class"] });
        mo.observe(row, { attributes: true, attributeFilter: ["hidden"] });
        label();
      } }

    // ---- the one-line instructions: in Help, or back under the controls with Hints ----
    let hints = false; try { hints = localStorage.getItem("nightbloom-hints") === "1"; } catch (e) {}
    const paintHints = () => { document.body.classList.toggle("hints", hints); const b = $("hintsBtn"); if (b) { b.textContent = "Hints: " + (hints ? "On" : "Off"); b.setAttribute("aria-pressed", String(hints)); } };
    [".sp-hint", ".gridbar .hint", ".dj-cap", "#gbBrowseSub", "#stepHint"].forEach(q => document.querySelectorAll(q).forEach(e => e.classList.add("hintline")));
    document.querySelectorAll(".dj-lab").forEach(e => { if (/^up to 4 · tap one/.test(e.textContent.trim())) e.classList.add("hintline"); });
    [["engineAfter", /^Pick a sound, then/], ["drummerNow", /changes by itself/], ["scInfo", /^drag on the staff/], ["trkStatus", /^Import audio, or arm/], ["djMsg", /^Load a song on each deck/], ["brMode", /^Tap a sound to/]].forEach(([id, re]) => {
      const e = $(id); if (!e) return;
      const t = () => e.classList.toggle("hint-on", re.test(e.textContent.trim()));
      new MutationObserver(t).observe(e, { childList: true, characterData: true, subtree: true }); t();
    });

    // ---- Help: topics in groups, a contents row, and it opens at the screen you're on ----
    const helpEl = $("helpSheet"), list = helpEl && helpEl.querySelector(".help-list");
    if (helpEl && list) {
      const TOPICS = [
        ["around", "Getting around", /^(Getting around|Keys · Seq · Notes are|☰ \(top right\))/],
        ["sounds", "Sounds", /^(Tabs |In Lib|Analog|Natewave|Your plugins|Studio |Plugins |⚡ Fast plugins)/],
        ["together", "Playing together", /^(Playing engines together|Playing sounds together)/],
        ["keys", "Keys & controllers", /^(The button next to the tabs|Playing from a keyboard|Playing from a controller|Plugin controls)/],
        ["fx", "Effects & Motion", /^Effects/],
        ["seq", "Seq, Notes & Jam", /^(Jam |Piano roll|Tap the bpm readout)/],
        ["samp", "Sampler", /^(Record input|Fit a sample)/],
        ["speech", "Speech", /^Speech/],
        ["rec", "Recording", /^Keep 90s/],
        ["garage", "Garage", /^Garage/],
        ["beats", "Beats", /^(Rhythm Creator|Beats has two tabs)/],
        ["dj", "DJ", /^DJ/],
        ["link", "MIDI, Link & sound out", /^(Link |Ableton Link|Sound out)/],
        ["undo", "Undo", /^Undo and redo/],
        ["fix", "Problems & settings", /^Something not working/],
      ];
      let built = false; const heads = {};
      const build = () => {
        if (built) return; built = true;
        const groups = {}; TOPICS.forEach(t => groups[t[0]] = []);
        let last = "around";
        [...list.children].forEach(el => {
          if (el.tagName !== "P") return;
          const txt = el.textContent.trim(); const hit = TOPICS.find(t => t[2].test(txt));
          if (hit) last = hit[0]; groups[last].push(el);
        });
        const set = document.createElement("p"); set.className = "help-set";
        set.innerHTML = '<span>One-line tips under the controls:</span><button class="btn" id="hintsBtn" aria-pressed="false">Hints: Off</button>';
        groups.fix.push(set);
        const toc = document.createElement("nav"); toc.className = "help-toc"; toc.setAttribute("aria-label", "Help topics");
        TOPICS.forEach(([id, name]) => {
          if (!groups[id].length) return;
          const h = document.createElement("h4"); h.className = "help-h"; h.textContent = name; h.dataset.topic = id; heads[id] = h;
          list.append(h, ...groups[id]);
          const b = document.createElement("button"); b.textContent = name; b.dataset.topic = id; b.setAttribute("aria-pressed", "false");
          b.addEventListener("click", () => go(id, true)); toc.appendChild(b);
        });
        list.before(toc);
        $("hintsBtn").addEventListener("click", () => { hints = !hints; try { localStorage.setItem("nightbloom-hints", hints ? "1" : "0"); } catch (e) {} paintHints(); });
        paintHints();
      };
      const go = (id, smooth) => {
        const h = heads[id]; if (!h) return;
        helpEl.querySelectorAll(".help-toc button").forEach(b => { const on = b.dataset.topic === id; b.setAttribute("aria-pressed", String(on)); if (on) b.scrollIntoView({ block: "nearest", inline: "center" }); });
        const card = helpEl.querySelector(".ed-card");
        if (id === "around" && card) card.scrollTop = 0; else h.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
      };
      const here = () => {
        if (state.mode === "notes" || state.mode === "seq" || state.panel === "jam") return "seq";
        if (state.engine === "speech") return "speech";
        if (["samp", "pads"].includes(state.engine)) return "samp";
        if (["fx", "lab", "morph"].includes(state.panel)) return "fx";
        if (state.panel === "arp") return "seq";
        return "around";
      };
      new MutationObserver(() => { if (!helpEl.hidden) { build(); requestAnimationFrame(() => go(here(), false)); } }).observe(helpEl, { attributes: true, attributeFilter: ["hidden"] });
    }
    paintHints();
  }
  // ======================================================================
  // Simpler (125): every full screen's top bar in one order, a ⋯ for what you rarely need, and the keyboard setting
  // ======================================================================
  {
    const $ = id => document.getElementById(id);
    // Done · title · ▶ ● ■ · tempo · its own buttons · ↶ · ⋯ · ?
    const bar = (top, parts) => {
      if (!top) return;
      const more = parts.more.filter(Boolean);
      let pop = null, mb = null;
      if (more.length) {
        mb = document.createElement("button"); mb.className = "btn st-more"; mb.textContent = "⋯"; mb.setAttribute("aria-label", "More"); mb.setAttribute("aria-haspopup", "true");
        pop = document.createElement("div"); pop.className = "st-pop"; pop.hidden = true; pop.setAttribute("role", "menu");
        more.forEach(el => { el.classList.add("st-in"); pop.appendChild(el); el.addEventListener("click", () => { if (el.tagName === "BUTTON") setTimeout(() => { pop.hidden = true; }, 120); }); });
        document.body.appendChild(pop);
        const place = () => { const r = mb.getBoundingClientRect(), w = pop.offsetWidth; pop.style.top = Math.round(r.bottom + 6) + "px"; pop.style.left = Math.round(Math.min(innerWidth - w - 8, Math.max(8, r.right - w))) + "px"; };
        mb.addEventListener("click", e => { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) place(); });
        document.addEventListener("pointerdown", e => { if (!pop.hidden && !pop.contains(e.target) && e.target !== mb) pop.hidden = true; }, true);
        top.appendChild(mb);
      }
      const order = [parts.done, parts.title, ...parts.play, ...parts.rec, ...parts.stop, parts.tempo, ...parts.own, parts.undo, mb, parts.help];
      order.forEach((el, i) => { if (el) { el.style.order = String(i); if (el.parentElement !== top) top.appendChild(el); } });
      if (parts.done) parts.done.classList.add("st-done");
      if (parts.undo) parts.undo.classList.add("st-undo");
      return pop;
    };
    const djTop = document.querySelector("#djView .dj-top");
    if (djTop) bar(djTop, { done: $("djDone"), title: djTop.querySelector("strong"), play: [], rec: [$("djRec")], stop: [$("djStop"), djTop.querySelector("[data-stopall]")], tempo: null,
      own: [$("djRhythm")], undo: null, more: [$("djKeep"), $("djKeyLock")], help: $("djHelpBtn") });
    const rcTop = document.querySelector("#rcView .rc-top");
    if (rcTop) { const u = $("rcUndo"); if (u) { u.textContent = "↶"; u.title = "Undo the last change here (Ctrl+Z)"; u.setAttribute("aria-label", "Undo"); }
      bar(rcTop, { done: $("rcDone"), title: rcTop.querySelector("strong"), play: [$("rcPlay")], rec: [$("rcRec")], stop: [rcTop.querySelector("[data-stopall]")], tempo: rcTop.querySelector(".rc-tempo"),
        own: [$("rcFill")], undo: u, more: [], help: $("rcHelpBtn") }); }
    const bpTop = document.querySelector("#bpView .bp-top");
    if (bpTop) { const u = $("bpUndo"); if (u) { u.textContent = "↶"; u.title = "Undo the last change here (Ctrl+Z)"; u.setAttribute("aria-label", "Undo"); delete u.dataset.key; }
      bar(bpTop, { done: $("bpDone"), title: bpTop.querySelector("strong"), play: [$("bpPlay")], rec: [$("bpRec")], stop: [bpTop.querySelector("[data-stopall]")], tempo: $("bpBpm"),
        own: [...bpTop.querySelectorAll(".bp-fast")], undo: u, more: [$("bpClear"), $("bpFx")], help: $("bpHelpBtn") }); }
    // the Garage: Done to the front, ↶ next to ?
    { const d = $("gbDone"), l = document.querySelector("#gbBar .gb-left"), u = $("gbUndo"), h = $("gbHelpBtn");
      if (d && l) l.prepend(d); if (u && h) { h.before(u); u.classList.add("st-undo"); u.title = "Undo the last change here (Ctrl+Z)"; } }

    // the keyboard: Musical Typing, or the older two rows
    const set = document.querySelector(".help-set");
    const addKb = host => {
      if (!host || $("kbLayoutBtn")) return;
      const b = document.createElement("button"); b.className = "btn"; b.id = "kbLayoutBtn";
      const paint = () => { b.textContent = "Keyboard: " + (KB_LAYOUT === "two" ? "Two rows" : "Musical Typing"); b.setAttribute("aria-pressed", String(KB_LAYOUT === "two")); };
      b.addEventListener("click", () => { kbUse(KB_LAYOUT === "two" ? "mt" : "two"); try { localStorage.setItem("nightbloom-kblayout", KB_LAYOUT); } catch (e) {} paint(); kbLabel(); });
      paint(); host.append(document.createTextNode(" Computer keyboard:"), b);
    };
    if (set) addKb(set);
    else { const hs = $("helpSheet"); if (hs) new MutationObserver(() => addKb(document.querySelector(".help-set"))).observe(hs, { attributes: true, attributeFilter: ["hidden"] }); }
    window.__kb = { layout: () => KB_LAYOUT, use: l => { kbUse(l); kbLabel(); }, vel: () => kbVel };
  }
  // ======================================================================
  // Simpler (126), undone for the Rhythm Creator (131): Rhythm and Beats each have their tab again; a switch at the
  // top of each hops to the other; Song in Seq
  // ======================================================================
  {
    const $ = id => document.getElementById(id);
    const rcB = $("rcBtn"), bpB = $("bpBtn"), rcV = $("rcView"), bpV = $("bpView");
    if (rcB && bpB && rcV && bpV) {
      let last = "grid"; try { last = localStorage.getItem("nightbloom-beatsview") === "pads" ? "pads" : "grid"; } catch (e) {}
      const remember = v => { last = v; try { localStorage.setItem("nightbloom-beatsview", v); } catch (e) {} };
      let passing = false;
      const go = v => {
        if (v === "grid" && !rcV.hidden) return; if (v === "pads" && !bpV.hidden) return;
        if (v === "grid") { $("bpDone").click(); rcB.click(); } else { $("rcDone").click(); passing = true; try { bpB.click(); } finally { passing = false; } }
      };
      [["rcView", "grid"], ["bpView", "pads"]].forEach(([vid, cur]) => {
        const v = $(vid), top = v.querySelector(".dj-top"), title = top && top.querySelector("strong"); if (!top || !title) return;
        title.textContent = cur === "grid" ? "Rhythm" : "Beats";
        const sw = document.createElement("div"); sw.className = "seg small bt-sw"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Rhythm Creator or Beat Pads");
        sw.innerHTML = '<button data-v="grid" title="The Rhythm Creator: a 16-track step grid">Rhythm</button><button data-v="pads" title="Beat Pads: 16 pads to play, record and chop samples">Pads</button>';
        sw.querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.v === cur)); b.addEventListener("click", () => go(b.dataset.v)); });
        sw.style.order = title.style.order || "1"; title.after(sw);
        new MutationObserver(() => { if (!v.hidden) remember(cur); }).observe(v, { attributes: true, attributeFilter: ["hidden"] });
      });
      // Beats lights while either one plays
      const lit = () => { if (bpB.classList.contains("rclive")) bpB.classList.remove("rclive"); };   // (Rhythm lights for itself again; only touched when needed: the observers watch the class)
      new MutationObserver(lit).observe(rcB, { attributes: true, attributeFilter: ["class"] });
      new MutationObserver(lit).observe(bpB, { attributes: true, attributeFilter: ["class"] }); lit();
      window.__beats = { view: () => last, go };
    }
    // Song: next to Beats… in Seq
    const bb = $("beatsBtn"), sb = $("songBtn");
    if (bb && sb) {
      const b = document.createElement("button"); b.className = "btn"; b.id = "songSeqBtn"; b.textContent = "Song"; b.title = "Chain patterns A–D into a song";
      b.addEventListener("click", () => sb.click()); bb.after(b);
      const sync = () => { b.hidden = bb.hidden; }; new MutationObserver(sync).observe(bb, { attributes: true, attributeFilter: ["hidden"] }); sync();
    }
  }
  // ---------- Undo and redo across the app ----------
  const HIS = { A: {}, line: [], redo: [] };
  {
    const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 5 ? "now" : s < 60 ? s + " s ago" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago"; };
    const area = (id, name, o) => { HIS.A[id] = Object.assign({ id, name, red: [] }, o); };
    // Notes (the melody: staff and roll)
    area("notes", "Notes", { stack: () => scEd.undo, snap: scSnapS, put: scPut, btn: "scUndo", rbtn: "scRedo" });
    // the Seq pattern
    area("seq", "Pattern", { stack: () => seqUndo, snap: seqSnap, btn: "seqUndo", rbtn: "seqRedo",
      put: snap => { const o = JSON.parse(snap); Object.keys(state.seq).forEach(k => { if (!(k in o.seq)) delete state.seq[k]; }); Object.assign(state.seq, o.seq); state.drum.swing = o.swing; setBpm(state.seq.bpm); if (seqBuilt) paintSeq(); save(); try { scRender(); } catch (e) {} },
      paint: seqPaintUndo });
    // Rhythm Creator
    area("rc", "Rhythm Creator", { stack: () => rcUndo, snap: rcSnapP, btn: "rcUndo", rbtn: "rcRedo",
      put: snap => { const o = JSON.parse(snap); RCP.tracks = o.tracks; RCP.steps = o.steps; RCP.swing = o.swing; if (o.bpm && o.bpm !== state.seq.bpm) setBpm(o.bpm); if (ctx) RCP.tracks.forEach((tr, i) => rcApplyTrack(i)); rcSave(); rcRender(); },
      paint: rcPaintUndo });
    // Tracks
    area("trk", "Tracks", { stack: () => trkUndo, snap: () => JSON.stringify({ tracks: T.tracks, clips: T.clips }), btn: "trkUndo", rbtn: "trkRedo",
      put: snap => { const o = JSON.parse(snap); T.tracks = o.tracks; T.clips = o.clips; T.sel = null; trkSave(); trkRender(); } });
    HIS.A.trk.red = trkRedo;
    // Beat Pads (each recording pass, and Clear) and the Garage (its every edit)
    const BPU = [];
    area("bp", "Beat Pads", { stack: () => BPU, snap: () => JSON.stringify({ cur: BPS.cur, ev: BPS.ev }), btn: "bpUndo",
      put: snap => { const o = JSON.parse(snap); if (o.cur === BPS.cur) BPS.ev = o.ev; else if (BPS.seqs && BPS.seqs[o.cur]) BPS.seqs[o.cur].ev = o.ev; bpSave(); bpPaintGrid(); bpPaintTop(); } });
    if (window.__gb && __gb.put) area("gb", "Garage", { stack: () => __gb.UNDO, snap: () => __gb.snapSong(), btn: "gbUndo", put: snap => __gb.put(snap) });
    // the sound: engines, knobs, presets, effects, Natewave, Morph (recorded when a gesture settles)
    const SND = { u: [], last: null, t: 0 };
    const sndSnap = () => { const o = captureSound(""); delete o.date; o.cur = state.cur || null; return JSON.stringify(o); };
    area("sound", "Sound", { stack: () => SND.u, snap: sndSnap,
      put: snap => { const o = JSON.parse(snap); sndQuiet = true; try { applySound(o); } finally { sndQuiet = false; } state.cur = o.cur || null; save(); try { paintTabs(); updateSoundBar(); refreshFxKnobs(); } catch (e) {} SND.last = sndSnap(); } });
    function sndCheck() {
      clearTimeout(SND.t); SND.t = 0;
      let now; try { now = sndSnap(); } catch (e) { return; }
      if (SND.last == null) { SND.last = now; return; }
      if (now === SND.last) return;
      SND.u.push(SND.last); if (SND.u.length > 40) SND.u.shift();
      SND.last = now; noted("sound", "Sound · " + (SND.what ? SND.what + " · " : "") + (soundLabel() || "changed")); SND.what = "";
    }
    function sndSettle() { clearTimeout(SND.t); SND.t = setTimeout(sndCheck, 350); }
    ["pointerup", "keyup", "change"].forEach(t => document.addEventListener(t, sndSettle, true));
    document.addEventListener("pointerdown", e => {
      if (SND.last == null) try { SND.last = sndSnap(); } catch (x) {}
      if (!SND.t) { const k = e.target && e.target.closest && e.target.closest(".knob, .wvk, input[type=range], select"); SND.what = k ? (k.getAttribute("aria-label") || k.dataset.label || "").trim().slice(0, 28) : ""; }   // (names the step)
    }, true);
    setTimeout(() => { try { if (SND.last == null) SND.last = sndSnap(); } catch (e) {} }, 0);

    // a new step in a place: it goes on the timeline, and that place's redo is gone
    function noted(id, label) {
      const A = HIS.A[id]; A.red.length = 0;
      HIS.redo = HIS.redo.filter(e => e.id !== id);
      HIS.line.push({ id, label: label || A.name, t: Date.now() }); if (HIS.line.length > 400) HIS.line.shift();
      paint();
    }
    const pushed = (id, stack, fn, label) => function () {
      const a = stack(), n = a.length, top = a[n - 1], r = fn.apply(this, arguments);
      if (a.length !== n || a[a.length - 1] !== top) noted(id, typeof label === "function" ? label() : label);
      return r;
    };
    scPush = pushed("notes", () => scEd.undo, scPush, () => PR.on ? "Notes · roll" : "Notes");
    seqPushUndo = pushed("seq", () => seqUndo, seqPushUndo);
    rcPushUndo = pushed("rc", () => rcUndo, rcPushUndo);
    snapshot = pushed("trk", () => trkUndo, snapshot);
    // a toast that names the change names its step too
    { const ut = undoToast; undoToast = function (msg) { const e = HIS.line[HIS.line.length - 1]; if (e && Date.now() - e.t < 1500) e.label = HIS.A[e.id].name + " · " + msg; return ut.apply(this, arguments); }; }

    function undo(id, quiet) {
      const A = HIS.A[id], st = A.stack(); if (!st.length) return false;
      A.red.push(A.snap()); if (A.red.length > 60) A.red.shift();
      A.put(st.pop());
      const i = HIS.line.map(e => e.id).lastIndexOf(id), e = i >= 0 ? HIS.line.splice(i, 1)[0] : { id, label: A.name, t: Date.now() };
      HIS.redo.push(e);
      paint(); if (!quiet) noteMsg("Undone: " + e.label);
      return true;
    }
    function redo(id, quiet) {
      const A = HIS.A[id]; if (!A.red.length) return false;
      A.stack().push(A.snap()); A.put(A.red.pop());
      const i = HIS.redo.map(e => e.id).lastIndexOf(id), e = i >= 0 ? HIS.redo.splice(i, 1)[0] : { id, label: A.name, t: Date.now() };
      HIS.line.push(e);
      paint(); if (!quiet) noteMsg("Redone: " + e.label);
      return true;
    }
    // a place whose ↶ also covers related steps (Tracks: its clips and its automation lanes)
    const GROUP = { trk: ["trk", "auto"] };
    const grp = id => (GROUP[id] || [id]).filter(x => HIS.A[x]);
    function undoIn(id, quiet) {
      const g = grp(id);
      for (let i = HIS.line.length - 1; i >= 0; i--) { const e = HIS.line[i]; if (g.includes(e.id) && HIS.A[e.id].stack().length) return undo(e.id, quiet); }
      return g.some(x => HIS.A[x].stack().length) ? undo(g.find(x => HIS.A[x].stack().length), quiet) : false;
    }
    function redoIn(id, quiet) {
      const g = grp(id);
      for (let i = HIS.redo.length - 1; i >= 0; i--) { const e = HIS.redo[i]; if (g.includes(e.id) && HIS.A[e.id].red.length) return redo(e.id, quiet); }
      return g.some(x => HIS.A[x].red.length) ? redo(g.find(x => HIS.A[x].red.length), quiet) : false;
    }
    function undoAny(quiet) {
      if (SND.t) sndCheck();   // (a knob just let go of counts as a step)
      while (HIS.line.length) { const e = HIS.line[HIS.line.length - 1]; if (HIS.A[e.id].stack().length) return undo(e.id, quiet); HIS.line.pop(); }
      if (!quiet) noteMsg("Nothing to undo"); paint(); return false;
    }
    function redoAny(quiet) {
      if (SND.t) sndCheck();
      while (HIS.redo.length) { const e = HIS.redo[HIS.redo.length - 1]; if (HIS.A[e.id].red.length) return redo(e.id, quiet); HIS.redo.pop(); }
      if (!quiet) noteMsg("Nothing to redo"); paint(); return false;
    }
    // each place's own ↶ goes through here (so it can be redone), and gets a ↷
    window.__nbNoted = (id, label) => { if (HIS.A[id]) noted(id, label); };
    window.__nbCanUndo = id => !!(HIS.A[id] && HIS.A[id].stack().length);
    window.__nbStep = (id, label) => { const A = HIS.A[id]; if (!A) return; const st = A.stack(); st.push(A.snap()); if (st.length > 40) st.shift(); noted(id, label); };
    seqDoUndo = () => undo("seq"); rcDoUndo = () => undo("rc"); trkUndoFn = () => { if (!undoIn("trk")) trkSay("Nothing to undo"); else trkSay("Undone"); };
    const BTN = { scUndo: "notes", seqUndo: "seq", rcUndo: "rc", trkUndo: "trk", bpUndo: "bp", gbUndo: "gb" }, RBTN = { scRedo: "notes", seqRedo: "seq", rcRedo: "rc", trkRedo: "trk" };
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("#scUndo, #seqUndo, #rcUndo, #trkUndo, #bpUndo, #gbUndo, #scRedo, #seqRedo, #rcRedo, #trkRedo, #hisUndo, #hisRedo, #hisSUndo, #hisSRedo, #hisUndoP, #hisRedoP");
      if (!b) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const id = b.id;
      if (id === "hisUndo" || id === "hisSUndo" || id === "hisUndoP") undoAny(); else if (id === "hisRedo" || id === "hisSRedo" || id === "hisRedoP") redoAny();
      else if (BTN[id]) { const ok = undoIn(BTN[id]); if (id === "trkUndo") trkSay(ok ? "Undone" : "Nothing to undo"); else if (!ok) noteMsg("Nothing to undo"); }
      else if (RBTN[id]) { const ok = redoIn(RBTN[id]); if (id === "trkRedo") trkSay(ok ? "Redone" : "Nothing to redo"); else if (!ok) noteMsg("Nothing to redo"); }
    }, true);
    window.addEventListener("keydown", e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase(), isU = k === "z" && !e.shiftKey, isR = (k === "z" && e.shiftKey) || (k === "y" && !e.metaKey);
      if (!isU && !isR) return;
      const t = e.target; if (t && t.closest && t.closest("input:not([type=range]), textarea, select, [contenteditable]")) return;   // (text keeps its own undo)
      const trk = !trkEl.hidden;
      if (trk && isU) return;   // (Tracks' own keys undo Tracks)
      e.preventDefault();
      if (e.repeat) return;
      if (isU) undoAny(); else if (trk) redoIn("trk"); else redoAny();
    });
    function paint() {
      const u = document.getElementById("hisUndo"), r = document.getElementById("hisRedo");
      const canU = HIS.line.some(e => HIS.A[e.id].stack().length), canR = HIS.redo.some(e => HIS.A[e.id].red.length);
      { const a = document.getElementById("hisUndoP"), b = document.getElementById("hisRedoP"); if (a) a.disabled = !canU; if (b) b.disabled = !canR; }
      if (u) { u.disabled = !canU; const e = HIS.line[HIS.line.length - 1]; u.title = canU && e ? "Undo: " + e.label + " (Ctrl+Z)" : "Nothing to undo"; }
      if (r) { r.disabled = !canR; const e = HIS.redo[HIS.redo.length - 1]; r.title = canR && e ? "Redo: " + e.label + " (Ctrl+Shift+Z)" : "Nothing to redo"; }
      for (const id in HIS.A) {
        const A = HIS.A[id];
        if (!A.rbtn) { const ub = A.btn && document.getElementById(A.btn); if (ub) ub.disabled = !A.stack().length; continue; }
        const rb = document.getElementById(A.rbtn), ub = document.getElementById(A.btn);
        if (rb) { rb.disabled = !grp(id).some(x => HIS.A[x].red.length); if (ub) rb.hidden = ub.hidden; }
        if (ub && id === "notes") ub.disabled = !A.stack().length;
        if (ub && (id === "bp" || id === "rc" || id === "gb")) ub.disabled = !A.stack().length;
        if (A.paint) try { A.paint(); } catch (e) {}
      }
      if (!sheet.hidden) list();
    }
    // the per-place ↷ follows its ↶ when that one is shown or hidden
    try { const mo = new MutationObserver(() => paint()); ["seqUndo", "rcUndo", "trkUndo", "scUndo"].forEach(id => { const b = document.getElementById(id); if (b) mo.observe(b, { attributes: true, attributeFilter: ["hidden"] }); }); } catch (e) {}
    // History
    const sheet = document.getElementById("hisSheet"), box = document.getElementById("hisList");
    function list() {
      box.innerHTML = "";
      const row = (e, undone, k) => {
        const b = document.createElement("button"); b.className = "his-row" + (undone ? " undone" : "");
        b.innerHTML = "<b></b><span></span><small></small>";
        b.querySelector("b").textContent = e.label.split(" · ")[0]; b.querySelector("span").textContent = e.label.includes(" · ") ? e.label.split(" · ").slice(1).join(" · ") : ""; b.querySelector("small").textContent = ago(e.t);
        b.addEventListener("click", () => { for (let i = 0; i < k; i++) if (!(undone ? redoAny(true) : undoAny(true))) break; noteMsg(undone ? "Brought back " + k + (k === 1 ? " change" : " changes") : "Went back " + k + (k === 1 ? " change" : " changes")); list(); });
        box.appendChild(b);
      };
      const R = HIS.redo.filter(e => HIS.A[e.id].red.length), L = HIS.line.filter(e => HIS.A[e.id].stack().length);
      if (R.length) { R.forEach((e, i) => row(e, true, R.length - i)); const c = document.createElement("div"); c.className = "his-cut"; c.textContent = "▲ undone · now ▼"; box.appendChild(c); }
      L.slice().reverse().slice(0, 120).forEach((e, i) => row(e, false, i + 1));
      if (!R.length && !L.length) { const d = document.createElement("div"); d.className = "pr-empty"; d.textContent = "Nothing yet. Changes to the sound, the pattern, Notes, Rhythm Creator and Tracks show up here."; box.appendChild(d); }
    }
    document.getElementById("hisBtn").addEventListener("click", () => { sheet.hidden = false; list(); });
    document.getElementById("hisDone").addEventListener("click", () => { sheet.hidden = true; });
    setTimeout(paint, 0);
    window.__his = { HIS, undo, redo, undoIn, redoIn, undoAny, redoAny, SND, sndSnap, settle: sndSettle, area, noted, paint };
  }
  function wake() {
    if (window.__nbClosed) return;
    setPlayback();
    ensureKeepAlive();
    if (ctx && ctx.state !== "running" && ctx.state !== "closed") { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  }
  function start() {
    setPlayback();
    if (!ctx) buildAudio();
    try { ctx.addEventListener("statechange", () => { if (ctx.state !== "running" && !document.hidden) wake(); }); } catch (e) {}
    wake();
    document.getElementById("start").hidden = true;
  }
  document.getElementById("startBtn").addEventListener("click", start);
  // Watchdog: resume a stalled context, and rebuild the effects chain if it has gone NaN (dead silence).
  const probe = new Float32Array(1024);
  setInterval(() => {
    if (!ctx || !analyser || document.hidden || window.__nbClosed) return;
    if (ctx.state !== "running") { if (ctx.state !== "closed") { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } return; }
    analyser.getFloatTimeDomainData(probe);
    for (let i = 0; i < probe.length; i += 16) {
      if (!Number.isFinite(probe[i])) { try { allOff(); } catch (e) {} buildChain(); applyFx(); applyDrum(); break; }
    }
  }, 300);
  // Re-assert on every touch: flipping the ring switch can interrupt the session.
  ["pointerdown", "touchend", "keydown"].forEach(t =>
    document.addEventListener(t, () => { if (ctx) wake(); }, { capture: true, passive: true }));
  try { navigator.audioSession && navigator.audioSession.addEventListener("statechange", () => { if (ctx && !document.hidden) wake(); }); } catch (e) {}
  document.addEventListener("visibilitychange", () => {
//@site-only
    if (document.hidden) { if (nbKeepPlaying()) return; if (take.rec) stopTake(); stopSeq(); allOff(); if (rec.active) endRec(); }
//@end
//@art-only
    if (document.hidden) { if (nbKeepPlaying()) return; if (take.rec) stopTake(); stopSeq(); allOff(); }
//@end
    else if (ctx) wake();
  });
  // ---------- sound that survives other apps and headphone changes ----------
  {
    const log = d => { try { window.__nbAdd && window.__nbAdd("audio", d); } catch (e) {} };
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    let busy = false, stalled = 0, kicks = 0, lastT = -1, hiddenAt = 0;
    // reopen the output on whatever is plugged in now
    async function reopen(why) {
      if (!ctx || ctx.state === "closed" || busy || window.__nbClosed) return;
      busy = true; log("reopen output · " + why + " · was " + ctx.state);
      try {
        // a pause and resume: the browser builds a fresh output stream on the device in use now
        if (ctx.state === "running") { try { await within(ctx.suspend(), 1000); } catch (e) {} }
        try { await within(ctx.resume(), 1500); } catch (e) { log("resume: " + (e && e.message)); }
      } finally { busy = false; stalled = 0; lastT = -1; }
      wake();
      log("output now " + ctx.state);
    }
    window.__nbReopen = reopen;
    // banner when it won't come back by itself
    const bar = document.createElement("div");
    bar.className = "sndfix"; bar.id = "sndFix"; bar.hidden = true; bar.setAttribute("role", "alert");
    bar.innerHTML = '<span>The sound stopped (another app, or headphones changed).</span><button class="btn" id="sndFixGo">Fix sound</button><button class="btn" id="sndFixRe" hidden>Restart Nate Bloom</button><button class="btn" id="sndFixX" aria-label="Close">✕</button>';
    document.body.appendChild(bar);
    const go = bar.querySelector("#sndFixGo"), re = bar.querySelector("#sndFixRe");
    const showFix = () => { if (!bar.hidden) return; bar.hidden = false; go.hidden = false; re.hidden = true; log("fix banner shown"); };
    go.addEventListener("click", async () => {
      go.disabled = true; await reopen("Fix sound"); go.disabled = false;
      const t0 = ctx.currentTime;
      setTimeout(() => { if (ctx.state === "running" && ctx.currentTime - t0 > 0.2) { bar.hidden = true; kicks = 0; } else { go.hidden = true; re.hidden = false; } }, 700);
    });
    re.addEventListener("click", () => { log("restart"); try { save(); } catch (e) {} setTimeout(() => location.reload(), 150); });
    bar.querySelector("#sndFixX").addEventListener("click", () => { bar.hidden = true; });
    // the audio clock stopped while the app is on screen
    setInterval(() => {
      if (!ctx || document.hidden || busy || ctx.state !== "running") { lastT = -1; stalled = 0; return; }
      const t = ctx.currentTime;
      if (lastT >= 0 && t - lastT < 0.02) {
        if (++stalled >= 3) { stalled = 0; if (++kicks <= 2) reopen("audio clock stopped"); else showFix(); }
      } else if (lastT >= 0) { stalled = 0; if (kicks && t - lastT > 0.2) { kicks = 0; if (!bar.hidden && go.hidden === false) bar.hidden = true; } }
      lastT = t;
    }, 300);
    // (174) the clock runs but every buffer is a dropout for seconds on end (his Linux computer: "it just cut out
    // completely"): the output stream has fallen out of step, and a fresh one fixes it. Twice in two minutes at most.
    { let last = null, bad = 0, done = [];
      setInterval(() => {
        const s = ctx && ctx.playoutStats; if (!s || s.fallbackFramesEvents == null || document.hidden || busy || ctx.state !== "running") { last = null; bad = 0; return; }
        const n = s.fallbackFramesEvents; if (last == null) { last = n; return; }
        const per = n - last; last = n;
        if (per >= 60) bad++; else bad = 0;
        const now = performance.now(); done = done.filter(t => now - t < 120000);
        if (bad >= 3 && done.length < 2) { bad = 0; done.push(now); reopen("the sound kept cutting out (" + per + " dropouts a second)"); try { noteMsg("The sound kept cutting out, so it was reopened. If it comes back, Settings › Sound check › Steady gives it more slack."); } catch (e) {} }
      }, 1000); }
    // headphones or speakers plugged in or out
    let dcT = 0;
    try {
      navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener("devicechange", () => {
        log("devices changed"); clearTimeout(dcT);
        dcT = setTimeout(() => { if (ctx && !document.hidden) reopen("headphones or speakers changed"); }, 400);
      });
    } catch (e) {}
    // back from another app: reopen the output (Chrome); Safari resumes on the first touch as before
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = performance.now(); return; }
      if (ctx && hiddenAt && performance.now() - hiddenAt > 1000 && !apple) setTimeout(() => { if (!document.hidden) reopen("back from another app"); }, 120);
    });
    // Help: for when nothing can tell (the sound going somewhere you can't hear)
    const hb = document.getElementById("helpFixSound");
    if (hb) hb.addEventListener("click", async () => { start(); await reopen("Help · Fix sound"); try { noteMsg("Sound reopened on " + (ctx.state === "running" ? "what's plugged in now" : "the next tap")); } catch (e) {} });
  }
